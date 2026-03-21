frappe.ui.form.on('Quotation', {
    refresh(frm) {
        // 1. Add a prominent "Mark as Lost" button if status is Open
        if (frm.doc.docstatus === 1 && frm.doc.status === 'Open') {
            frm.add_custom_button(__('Mark as Lost'), function() {
                let d = new frappe.ui.Dialog({
                    title: 'Mark Quotation as Lost',
                    fields: [
                        {
                            fieldname: 'lost_reason',
                            label: 'Lost Reason',
                            fieldtype: 'Select',
                            options: '\nPrice Too High\nCompetitor Won\nCustomer Not Ready\nTechnical Mismatch\nNo Response\nOther',
                            reqd: 1
                        },
                        {
                            fieldname: 'competitor',
                            label: 'Lost To Competitor',
                            fieldtype: 'Data'
                        },
                        {
                            fieldname: 'remarks',
                            label: 'Remarks',
                            fieldtype: 'Small Text'
                        }
                    ],
                    primary_action_label: 'Mark as Lost',
                    primary_action(values) {
                        let update_fields = {
                            'status': 'Lost'
                        };
                        // Only set custom fields if they exist on the doctype
                        if (frm.fields_dict.lost_reason) {
                            update_fields['lost_reason'] = values.lost_reason;
                        }
                        if (frm.fields_dict.lost_to_competitor) {
                            update_fields['lost_to_competitor'] = values.competitor || '';
                        }
                        frappe.call({
                            method: 'frappe.client.set_value',
                            args: {
                                doctype: 'Quotation',
                                name: frm.doc.name,
                                fieldname: update_fields
                            },
                            callback() {
                                d.hide();
                                frm.reload_doc();
                                frappe.show_alert({message: __('Quotation marked as lost'), indicator: 'orange'});
                            }
                        });
                    }
                });
                d.show();
            }, __('Status'));
        }

        // 2. Show customer's other quotation count in dashboard
        if (frm.doc.party_name) {
            frappe.call({
                method: 'frappe.client.get_count',
                args: {
                    doctype: 'Quotation',
                    filters: {
                        party_name: frm.doc.party_name,
                        docstatus: 1,
                        name: ['!=', frm.doc.name]
                    }
                },
                callback(r) {
                    if (r.message > 0) {
                        frm.dashboard.add_indicator(
                            __(`${r.message} other quotation(s) for this customer`),
                            'blue'
                        );
                    }
                }
            });
        }
    },

    // 3. Auto-set valid_till to 30 days from transaction_date
    transaction_date(frm) {
        if (frm.doc.transaction_date && !frm.doc.valid_till) {
            let d = frappe.datetime.add_days(frm.doc.transaction_date, 30);
            frm.set_value('valid_till', d);
        }
    }
});
