# DCEPL ERS Store SOP — Manual Test Walkthrough

A 30-minute end-to-end test that exercises all 5 wedges against the live system. Best run by **Ramdas Avhad** (or any user holding both `DCEPL ERS HOD` and `Stock User` roles) plus a Store Executive.

Each step is testable with a real document. Any failure means the wedge is broken — stop and report.

---

## Pre-flight (2 min)

| Check | Where | Expected |
|---|---|---|
| Ramdas can sign in | https://dgoc.logstop.com/app | "RA" avatar top-right |
| Company default works | New Quotation form | Company auto-fills "Dynamic Crane Engineers Private Limited" |
| Store Guide visible | https://dgoc.logstop.com/app/erp-guides | "Store Guide" tile in Process Guides |

---

## Test 1 — Wedge 1: QA/QC blocks Purchase Receipt without inspection (5 min)

**Goal:** prove that a PR into Stores - DCEPL refuses to submit unless every line has an Accepted Quality Inspection.

1. Stock → Purchase Receipt → New
2. Set **Company = Dynamic Crane Engineers Private Limited**
3. Add 1 item, qty 1, set **Accepted Warehouse = Stores - DCEPL**
4. Save (docstatus=Draft) → click **Submit**
5. ✅ **Expected:** error message "Quality Inspection required for the following rows..."
6. From the same PR, click **Create → Quality Inspection** for that row
7. Use template **DCEPL ERS Store QA/QC**, tick "Yes" for all 5 parameters, Submit the QI
8. Back on the PR, click **Submit** again
9. ✅ **Expected:** PR submits successfully

**Failure modes to flag:**
- PR submits in step 5 → Wedge 1 hook is not firing. Run smoke test.
- QI template is missing in step 7 → re-run `vaishali.setup_qa_qc.run`.
- "Yes" reading still fails → check `acceptance_formula` on the template.

---

## Test 2 — Wedge 2: ABC fields appear on Item (2 min)

**Goal:** prove the classification import landed.

1. Stock → Item → search "EFI02008" (or any code from the workshop sheet)
2. Scroll to the collapsed section **ERS ABC Classification**
3. ✅ **Expected:** see populated **ABC Class**, **Stock Status**, **ABC Segment**, **ERS Department**
4. From Item list, filter **ABC Class = A** → should see ~100 items
5. Filter **ERS Department = ERS** → should see hundreds of items

**Failure modes:**
- Section missing → fixtures not applied. Re-run `vaishali.setup_ers_abc.ensure_fields`.
- All values blank → re-run `vaishali.setup_ers_abc.import_abc(dry_run=False)`.

---

## Test 3 — Wedge 3: Auto Material Request on low stock (10 min, can be deferred)

**Goal:** prove ERPNext's reorder cron creates an MR when stock falls below the Min level.

This one's slow because it's cron-driven. Two ways:

**3a. Live trigger (manual — fastest):**

1. Stock → Item → pick any item with both an Item Reorder row AND zero/low actual qty in Stores - DCEPL
2. Confirm: Item form → Auto re-order section shows `Stores - DCEPL` with a Reorder Level
3. Stock → Bin → filter by that item + Stores - DCEPL → confirm Actual Qty < Reorder Level
4. From bench (or ask developer): `bench --site dgoc.logstop.com execute erpnext.stock.reorder.reorder_item`
5. Buying → Material Request → list view sorted by creation
6. ✅ **Expected:** new draft MR created today, type Purchase, item matches

**3b. Wait for the daily cron:**

The reorder cron runs at midnight server time (UTC). Check Material Request list the next morning — any auto-created MRs will have user "Administrator" and items hitting their reorder level.

**Failure modes:**
- No MR created → check Stock Settings → Inventory → **Auto-Indent** must be ticked
- MR created for wrong qty → check Item Reorder row's `warehouse_reorder_qty`

---

## Test 4 — Wedge 4: MRN HOD approval gates Material Issue (8 min)

**Goal:** prove that Stock Entry refuses to issue from Stores - DCEPL unless the source MR is HOD-approved.

**As a Store Executive (any user with Stock User role):**

1. Buying → Material Request → New
2. **Material Request Type = Material Issue**
3. **Company = Dynamic Crane Engineers Private Limited**
4. **Set Warehouse = Stores - DCEPL**
5. Add 1 row: pick any well-stocked item, qty 1
6. Save → Submit
7. Note the MR name (e.g. `MAT-MR-2026-XXXXX`)
8. Now try to create a Stock Entry from it: from MR detail → **Create → Issue** (or Stock → Stock Entry → New, type Material Issue, source = Stores - DCEPL, reference the MR)
9. Add the row, ensure each row's `material_request` field references the MR
10. Save → **Submit**
11. ✅ **Expected:** error "DCEPL ERS Store issue blocked: the following Material Requests are not HOD-approved..." with the MR name listed

**Now as Ramdas (HOD):**

12. Sign in as `sales1@dgoc.in` → open the same MR
13. Scroll to **DCEPL ERS MRN Approval** section
14. Tick **MRN HOD Approved** → Save
15. ✅ **Expected:** **Approved By** auto-fills with `sales1@dgoc.in`, **Approved At** stamped with current time

**Back as Store Executive:**

16. Reopen the Stock Entry from step 10
17. **Submit**
18. ✅ **Expected:** submits successfully, stock moves out of Stores - DCEPL

**Negative test (extra credit):**

19. Sign in as any user *without* the `DCEPL ERS HOD` role
20. Open another DCEPL Material Issue MR
21. Try to tick MRN HOD Approved → Save
22. ✅ **Expected:** error "Only users with the 'DCEPL ERS HOD' role may approve a DCEPL ERS MRN."

**Failure modes:**
- Submit succeeds in step 11 → guard not firing. Check `bench --site ... execute frappe.get_hooks --kwargs "{'hook':'doc_events'}"`.
- Tick succeeds for non-HOD user → validate hook not firing.

---

## Test 5 — Wedge 5: Outward Gate Pass round trip (5 min)

**Goal:** prove the Gate Pass DocType saves, submits, and the Mark Returned flow works.

1. Stock → Outward Gate Pass → New (or visit https://dgoc.logstop.com/app/outward-gate-pass/new)
2. Vehicle No: `MH-12-AB-1234`
3. Driver Name: `Test Driver`, phone `9999999999`
4. Source Warehouse: Stores - DCEPL (default)
5. Destination Type: **Site**, Destination: `Test Site`
6. Tick **Returnable** → set Expected Return Date = tomorrow
7. Add 1 item row, qty 1
8. Save → ✅ **Expected:** docname `GP-2026-XXXXX`, status = Draft
9. **Submit** → ✅ **Expected:** status flips to **Out** (orange indicator in list view)
10. On the submitted form, click **Mark Returned** button (top right)
11. Confirm → ✅ **Expected:** status flips to **Returned** (green indicator), Returned At stamped

**Negative test:**

12. Try Save without items → ✅ **Expected:** error "At least one item is required."
13. Try Save with Returnable ticked but no Expected Return Date → ✅ **Expected:** error "Expected Return Date is required..."

**Failure modes:**
- DocType not in list → `bench migrate` didn't pick up the new files. Run `bench --site ... migrate` from the deploy.
- Mark Returned button missing → JS bundle not rebuilt. Run `bench build --app vaishali`.

---

## Cleanup

If you used real items, the test artifacts are real:

- The PR from Test 1 should be cancelled if it wasn't a genuine receipt
- The MR + Stock Entry from Test 4 should be cancelled in reverse order (Stock Entry first, then MR)
- The Gate Pass from Test 5 can stay as the first real Gate Pass record, or cancel if test-only

---

## Regression smoke test (any time, no docs touched)

```bash
bench --site dgoc.logstop.com execute vaishali.test_store_sop.run
```

Expected: **32/32 passed**. Re-run after every deploy that touches `hooks.py`, `qa_qc_guard.py`, `mrn_approval_guard.py`, the Outward Gate Pass DocType, or any wedge fixture.

---

## Reference

- Live guide: https://dgoc.logstop.com/store-guide
- All 5 wedges + tests: https://github.com/aidgoc/vaishali (commits `51e382a` through `eb9fa42`)
- Source SOP: `docs/Store.xlsx`, signed off 25/03/2026

Document version 1.0 — 2026-05-08
