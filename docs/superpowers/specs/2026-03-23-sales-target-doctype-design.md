# Sales Target DocType — Design Spec

**Date:** 2026-03-23
**Author:** Vaishali AI
**Status:** Approved
**App:** vaishali (DSPL Org OS)
**ERP:** ERPNext at dgoc.logstop.com

---

## 1. Problem

The vaishali PWA has 4 screens with hardcoded sales targets:
- `sales-target.js`: ₹62.8Cr annual, 12 hardcoded product targets with actual=0
- `my-targets.js`: ₹71L/month hardcoded
- `monthly-report.js`: ₹100.9Cr YTD target hardcoded
- `revenue.js`: ₹8.5Cr collection target hardcoded

The real targets (from the Google Sheet Price List) are ₹7Cr annual across 5 product variants. These need to come from a database record, not hardcoded JS.

Additionally, product-level actuals show 0 because Sales Orders aren't broken down by product category.

## 2. Goals

1. Store sales targets per product/employee/FY in ERPNext
2. Replace all hardcoded target values in PWA screens
3. Show product-level actual revenue (from Sales Order items)
4. Enable per-employee target assignment

## 3. Non-Goals

- Incentive calculator (explicitly excluded by user)
- Changing screen layouts (keep existing UI, just make data dynamic)
- Territory/zone-level targets

## 4. Data Layer

### 4.1 New DocType: Sales Target

**Module:** Vaishali
**Path:** `vaishali/vaishali/doctype/sales_target/`
**Is Submittable:** No
**Naming Rule:** `ST-.fiscal_year.-.product_category.-.####`

| Field | Fieldtype | Options / Default | Required | Description |
|-------|-----------|-------------------|----------|-------------|
| `fiscal_year` | Link | Fiscal Year | Yes | e.g. "2025-2026" |
| `employee` | Link | Employee | No | If set = personal target. If blank = company-wide. |
| `product_category` | Select | ACD\nDRM-3400\nDJ-1005\nE-DASH EOT\nE-Dash Chain Hoist\nF-Dash\nTPS\nMRT\nDC-1005\nInstallation\nSpares\nWWSI\nAll Products | Yes | Product line or "All Products" for total target |
| `annual_target` | Currency | | Yes | Annual revenue target in ₹ |
| `quarterly_target` | Currency | | No | Auto-calculated as annual_target ÷ 4 in controller |

**Controller (`sales_target.py`):**
```python
def before_save(self):
    if not self.quarterly_target:
        self.quarterly_target = self.annual_target / 4
```

**Matching logic (used by API):**
1. Employee + product_category + fiscal_year → personal product target
2. Employee + "All Products" + fiscal_year → personal total target
3. No employee + product_category + fiscal_year → company-wide product target
4. No employee + "All Products" + fiscal_year → company-wide total target

### 4.2 Product Category Mapping

Sales Order Items need to be mapped to product categories. ERPNext `Item` has an `item_group` field. The mapping:

| Item Group (ERPNext) | Product Category (Sales Target) |
|---------------------|-------------------------------|
| ACD, ACD with SLI System | ACD |
| DRM 3400 | DRM-3400 |
| DJ-1005 | DJ-1005 |
| E-DASH EOT, EOT Crane | E-DASH EOT |
| E-Dash Chain Hoist | E-Dash Chain Hoist |
| F-Dash | F-Dash |
| TPS, Tilt Prevention | TPS |
| MRT, MRT Systems | MRT |
| DC-1005, Mobile Crane | DC-1005 |
| Installation | Installation |
| Spares & Services, Spares | Spares |
| WWSI | WWSI |

This mapping is defined as a dict in `field.py` and used to group Sales Order Item amounts.

## 5. API Changes

### 5.1 Replace `get_sales_targets()`

**Current:** Returns hardcoded dict of 12 products with fixed target amounts.
**New:** Reads from Sales Target DocType + computes actuals from Sales Order items.

```python
@frappe.whitelist()
def get_sales_targets(fiscal_year=None):
    if not fiscal_year:
        fiscal_year = frappe.defaults.get_defaults().get("fiscal_year")

    fy_start, fy_end = frappe.db.get_value("Fiscal Year", fiscal_year,
                                            ["year_start_date", "year_end_date"])

    # Get targets from DocType
    targets = frappe.get_all("Sales Target",
        filters={"fiscal_year": fiscal_year, "employee": ["in", ["", None]]},
        fields=["product_category", "annual_target", "quarterly_target"])

    # Get actuals from Sales Order items
    actuals = frappe.db.sql("""
        SELECT soi.item_group, SUM(soi.amount) as actual
        FROM `tabSales Order Item` soi
        JOIN `tabSales Order` so ON so.name = soi.parent
        WHERE so.docstatus = 1
          AND so.transaction_date BETWEEN %s AND %s
          AND so.company IN %s
        GROUP BY soi.item_group
    """, (fy_start, fy_end, COMPANIES), as_dict=True)

    # Map item_groups to product categories and merge
    # Return: [{product_category, target, actual, pct}, ...]
    # Plus total_target, total_actual, total_pct
```

**Response shape:**
```json
{
    "fiscal_year": "2025-2026",
    "total_target": 70000000,
    "total_actual": 42000000,
    "total_pct": 60.0,
    "monthly_target": 5833333,
    "products": [
        {"category": "ACD", "target": 22300000, "actual": 15000000, "pct": 67.3},
        {"category": "E-DASH EOT", "target": 15350000, "actual": 8000000, "pct": 52.1},
        ...
    ]
}
```

### 5.2 Update `get_my_sales_performance()`

Add personal target from Sales Target DocType (employee-specific record). Replace hardcoded conversion targets with configurable values.

### 5.3 Update `get_monthly_report()`

Read `total_target` from Sales Target (sum of all company-wide "All Products" records for the FY) instead of hardcoded ₹100.9Cr.

## 6. PWA Screen Changes

### 6.1 `sales-target.js`

**Remove:** Hardcoded `TARGETS` array (12 products), hardcoded ₹62.8Cr.
**Add:** Read from `get_sales_targets()` response. Product cards show target vs actual with progress bars. Total KPI reads from API.

### 6.2 `my-targets.js`

**Remove:** Hardcoded `₹71L` monthly target.
**Add:** Read monthly target from `get_sales_targets().monthly_target`. If employee has a personal Sales Target record, use that instead.

### 6.3 `monthly-report.js`

**Remove:** Hardcoded `₹100.9Cr` YTD target.
**Add:** Read from `get_sales_targets().total_target`.

### 6.4 `revenue.js`

**Remove:** Hardcoded `₹8.5Cr` collection target.
**Add:** Read from `get_sales_targets().total_target` (or a separate collection target if needed — for now, use same target).

## 7. Setup Script: `setup_targets.py`

Seeds Sales Target records for FY 2025-2026 from the Google Sheet Price List data:

| Product Category | Annual Target |
|-----------------|--------------|
| ACD | ₹2,23,00,000 |
| DRM-3400 | ₹2,10,00,000 (Tower Crane Project) |
| E-DASH EOT | ₹1,53,50,000 |
| MRT | ₹66,00,000 |
| DC-1005 | ₹47,50,000 |
| All Products | ₹7,00,00,000 |

Plus per-employee targets if applicable.

Executed via: `bench --site dgoc.logstop.com execute vaishali.setup_targets.setup`

## 8. Files to Create/Modify

| File | Action | Est. Lines |
|------|--------|-----------|
| `vaishali/vaishali/doctype/sales_target/sales_target.json` | **New** | ~60 |
| `vaishali/vaishali/doctype/sales_target/sales_target.py` | **New** | ~15 |
| `vaishali/vaishali/doctype/sales_target/__init__.py` | **New** | 0 |
| `vaishali/setup_targets.py` | **New** | ~60 |
| `vaishali/api/field.py` | **Edit** — replace `get_sales_targets()`, update `get_my_sales_performance()`, update `get_monthly_report()` | ~150 |
| `vaishali/public/field/screens/sales-target.js` | **Edit** — remove hardcoded targets | ~30 changed |
| `vaishali/public/field/screens/my-targets.js` | **Edit** — remove hardcoded ₹71L | ~10 changed |
| `vaishali/public/field/screens/monthly-report.js` | **Edit** — remove hardcoded ₹100.9Cr | ~10 changed |
| `vaishali/public/field/screens/revenue.js` | **Edit** — remove hardcoded ₹8.5Cr | ~10 changed |

## 9. Testing Plan

1. **Setup script:** Verify 6 Sales Target records created for FY 2025-2026
2. **API:** Call `get_sales_targets` — verify targets from DocType + actuals from Sales Orders
3. **sales-target.js:** Verify product cards show dynamic targets with real actuals
4. **my-targets.js:** Verify monthly target is dynamic
5. **monthly-report.js:** Verify YTD target is dynamic
6. **revenue.js:** Verify collection target is dynamic
7. **Edge case:** No Sales Target records → screens show "No targets set" instead of crashing
