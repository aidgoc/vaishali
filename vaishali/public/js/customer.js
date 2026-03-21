frappe.ui.form.on('Customer', {
    refresh(frm) {
        if (frm.doc.__islocal) return;

        // 1. Show total business value (lifetime invoiced amount)
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: { customer: frm.doc.name, docstatus: 1 },
                fields: ['sum(grand_total) as total'],
                limit_page_length: 0
            },
            callback(r) {
                if (r.message && r.message[0] && r.message[0].total) {
                    let total = r.message[0].total;
                    frm.dashboard.add_indicator(
                        __(`Lifetime value: ₹${total.toLocaleString('en-IN')}`),
                        'green'
                    );
                }
            }
        });

        // 2. Show outstanding amount
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: { customer: frm.doc.name, docstatus: 1, outstanding_amount: ['>', 0] },
                fields: ['sum(outstanding_amount) as total'],
                limit_page_length: 0
            },
            callback(r) {
                if (r.message && r.message[0] && r.message[0].total) {
                    let total = r.message[0].total;
                    frm.dashboard.add_indicator(
                        __(`Outstanding: ₹${total.toLocaleString('en-IN')}`),
                        'orange'
                    );
                }
            }
        });
    }
});
