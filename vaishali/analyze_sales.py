"""Extract sales and financial data for analysis.

Usage: bench --site dgoc.logstop.com execute vaishali.analyze_sales.run
"""
import frappe
from collections import defaultdict
import json


def run():
    results = {}

    # 1. All Sales Invoices — use raw SQL to bypass permission filters
    invoices_raw = frappe.db.sql("""
        SELECT name, customer, customer_name, grand_total,
               outstanding_amount, status, posting_date, company
        FROM `tabSales Invoice`
        ORDER BY posting_date DESC
    """, as_dict=True)
    invoices = invoices_raw
    results["invoice_count"] = len(invoices)

    # Debug: check all docstatus
    debug = frappe.db.sql("SELECT docstatus, count(*) cnt, sum(grand_total) total FROM `tabSales Invoice` GROUP BY docstatus", as_dict=True)
    results["invoice_debug"] = [{"docstatus": d.docstatus, "count": d.cnt, "total": float(d.total or 0)} for d in debug]

    # Top customers by revenue
    cust_rev = defaultdict(float)
    cust_count = defaultdict(int)
    cust_outstanding = defaultdict(float)
    for inv in invoices:
        cust_rev[inv.customer_name] += (inv.grand_total or 0)
        cust_count[inv.customer_name] += 1
        cust_outstanding[inv.customer_name] += (inv.outstanding_amount or 0)

    top_customers = []
    for name, rev in sorted(cust_rev.items(), key=lambda x: -x[1])[:50]:
        top_customers.append({
            "customer": name,
            "revenue": round(rev, 2),
            "invoices": cust_count[name],
            "outstanding": round(cust_outstanding[name], 2)
        })
    results["top_customers"] = top_customers
    results["total_revenue"] = round(sum(cust_rev.values()), 2)
    results["total_outstanding"] = round(sum(cust_outstanding.values()), 2)

    # Revenue by month
    month_rev = defaultdict(float)
    for inv in invoices:
        m = str(inv.posting_date)[:7]
        month_rev[m] += (inv.grand_total or 0)
    results["monthly_revenue"] = [{"month": m, "revenue": round(v, 2)}
                                   for m, v in sorted(month_rev.items())]

    # 2. Invoice items - product groups (raw SQL)
    items = frappe.db.sql("""
        SELECT sii.item_group, sii.item_name, sii.amount, sii.qty
        FROM `tabSales Invoice Item` sii
        JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE 1=1
    """, as_dict=True)
    results["item_count"] = len(items)

    grp_rev = defaultdict(float)
    grp_qty = defaultdict(int)
    for item in items:
        g = item.item_group or "Unknown"
        grp_rev[g] += (item.amount or 0)
        grp_qty[g] += (item.qty or 0)

    results["product_groups"] = [{"group": g, "revenue": round(r, 2), "qty": grp_qty[g]}
                                  for g, r in sorted(grp_rev.items(), key=lambda x: -x[1])[:30]]

    # Top individual products
    prod_rev = defaultdict(float)
    prod_qty = defaultdict(int)
    for item in items:
        prod_rev[item.item_name or "Unknown"] += (item.amount or 0)
        prod_qty[item.item_name or "Unknown"] += (item.qty or 0)
    results["top_products"] = [{"product": p, "revenue": round(r, 2), "qty": prod_qty[p]}
                                for p, r in sorted(prod_rev.items(), key=lambda x: -x[1])[:30]]

    # 3. Payments (raw SQL)
    payments = frappe.db.sql("""
        SELECT paid_amount, posting_date, party_name
        FROM `tabPayment Entry`
        WHERE payment_type = 'Receive'
    """, as_dict=True)
    results["payment_count"] = len(payments)
    results["total_collected"] = round(sum(p.paid_amount or 0 for p in payments), 2)

    # 4. Quotations
    quots = frappe.get_all("Quotation",
        fields=["status", "grand_total", "party_name", "transaction_date"],
        limit_page_length=0)
    quot_status = defaultdict(lambda: {"count": 0, "value": 0})
    for q in quots:
        quot_status[q.status]["count"] += 1
        quot_status[q.status]["value"] += (q.grand_total or 0)
    results["quotations"] = {s: {"count": d["count"], "value": round(d["value"], 2)}
                              for s, d in quot_status.items()}
    results["quotation_count"] = len(quots)

    # 5. Sales Orders
    orders = frappe.get_all("Sales Order",
        filters={"docstatus": 1},
        fields=["status", "grand_total", "customer_name", "transaction_date"],
        limit_page_length=0)
    results["order_count"] = len(orders)
    results["total_orders"] = round(sum(o.grand_total or 0 for o in orders), 2)

    # 6. Customer groups
    customers = frappe.get_all("Customer",
        fields=["customer_group", "territory"],
        limit_page_length=0)
    cg = defaultdict(int)
    terr = defaultdict(int)
    for c in customers:
        cg[c.customer_group or "Unknown"] += 1
        terr[c.territory or "Unknown"] += 1
    results["customer_groups"] = sorted(cg.items(), key=lambda x: -x[1])[:15]
    results["territories"] = sorted(terr.items(), key=lambda x: -x[1])[:15]
    results["customer_count"] = len(customers)

    # Output as JSON
    print(json.dumps(results, default=str))
