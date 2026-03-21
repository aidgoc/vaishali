frappe.ui.form.on('Lead', {
    refresh(frm) {
        // 1. Show lead age in days
        if (frm.doc.creation) {
            let days = frappe.datetime.get_diff(frappe.datetime.now_date(), frm.doc.creation.split(' ')[0]);
            let color = days > 30 ? 'red' : days > 14 ? 'orange' : 'green';
            frm.dashboard.add_indicator(__(`Lead age: ${days} days`), color);
        }

        // 2. Quick convert to Customer button
        if (frm.doc.status !== 'Converted' && frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Convert to Customer'), function() {
                frappe.confirm(
                    __('Convert this lead to a Customer?'),
                    function() {
                        frappe.call({
                            method: 'erpnext.crm.doctype.lead.lead.make_customer',
                            args: { source_name: frm.doc.name },
                            callback(r) {
                                if (r.message) {
                                    frappe.set_route('Form', 'Customer', r.message.name);
                                }
                            }
                        });
                    }
                );
            }, __('Actions'));
        }
    },

    // 3. Auto-set lead name from company name
    company_name(frm) {
        if (frm.doc.company_name && !frm.doc.lead_name) {
            frm.set_value('lead_name', frm.doc.company_name);
        }
    }
});
