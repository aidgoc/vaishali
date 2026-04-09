frappe.ui.form.on('Lead', {
    refresh(frm) {
        // 1. Show lead age in days
        if (frm.doc.creation) {
            let days = frappe.datetime.get_diff(frappe.datetime.now_date(), frm.doc.creation.split(' ')[0]);
            let color = days > 30 ? 'red' : days > 14 ? 'orange' : 'green';
            frm.dashboard.add_indicator(__(`Lead age: ${days} days`), color);
        }

        // 2. Enrich from Apollo button
        if (frm.doc.docstatus === 0 && !frm.doc.apollo_enriched) {
            frm.add_custom_button(__('Enrich from Apollo'), function() {
                frappe.call({
                    method: 'vaishali.api.apollo.enrich_lead',
                    args: { lead_name: frm.doc.name },
                    freeze: true,
                    freeze_message: __('Fetching data from Apollo.io...'),
                    callback(r) {
                        if (r.message && r.message.status === 'enriched') {
                            frm.reload_doc();
                        }
                    }
                });
            }, __('Actions'));
        }

        // 3. Quick convert to Customer button
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

    // 4. Auto-set lead name from company name
    company_name(frm) {
        if (frm.doc.company_name && !frm.doc.lead_name) {
            frm.set_value('lead_name', frm.doc.company_name);
        }
    }
});

// Lead list view: Import from Apollo button
frappe.listview_settings['Lead'] = frappe.listview_settings['Lead'] || {};
var _orig_onload = frappe.listview_settings['Lead'].onload;
frappe.listview_settings['Lead'].onload = function(listview) {
    if (_orig_onload) _orig_onload(listview);
    listview.page.add_inner_button(__('Import from Apollo'), function() {
        var d = new frappe.ui.Dialog({
            title: __('Import Lead from Apollo.io'),
            fields: [
                { fieldname: 'email', fieldtype: 'Data', label: 'Email', options: 'Email' },
                { fieldname: 'or_section', fieldtype: 'Section Break', label: 'Or search by name' },
                { fieldname: 'first_name', fieldtype: 'Data', label: 'First Name' },
                { fieldname: 'last_name', fieldtype: 'Data', label: 'Last Name' },
                { fieldname: 'domain', fieldtype: 'Data', label: 'Company Domain' },
            ],
            primary_action_label: __('Import'),
            primary_action: function(values) {
                if (!values.email && !values.first_name) {
                    frappe.msgprint(__('Enter an email or first name.'));
                    return;
                }
                frappe.call({
                    method: 'vaishali.api.apollo.import_from_apollo',
                    args: values,
                    freeze: true,
                    freeze_message: __('Searching Apollo.io...'),
                    callback: function(r) {
                        if (r.message && r.message.lead) {
                            d.hide();
                            frappe.set_route('Form', 'Lead', r.message.lead);
                            frappe.show_alert({
                                message: __('Lead created: {0}', [r.message.lead_name]),
                                indicator: 'green'
                            });
                        }
                    }
                });
            }
        });
        d.show();
    });
};
