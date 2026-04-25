frappe.ui.form.on("Communication", {
    refresh(frm) {
        if (frm.doc.vaishali_email_status !== "Draft") return;

        frm.add_custom_button(__("Send Email"), () => {
            frappe.confirm(
                `Send this email to <b>${frm.doc.recipients || "(no recipient)"}</b>?`,
                () => {
                    frappe.call({
                        method: "vaishali.api.email_outbox.send_draft",
                        args: { name: frm.doc.name },
                        freeze: true,
                        freeze_message: "Sending...",
                        callback(r) {
                            if (!r.exc) {
                                frappe.show_alert({ message: "Email sent.", indicator: "green" });
                                frm.reload_doc();
                            }
                        },
                    });
                }
            );
        }, __("Email Outbox"));

        frm.add_custom_button(__("Discard Draft"), () => {
            frappe.confirm("Discard this draft? It cannot be recovered.", () => {
                frappe.call({
                    method: "vaishali.api.email_outbox.discard_draft",
                    args: { name: frm.doc.name },
                    callback(r) {
                        if (!r.exc) {
                            frappe.show_alert({ message: "Draft discarded.", indicator: "orange" });
                            frm.reload_doc();
                        }
                    },
                });
            });
        }, __("Email Outbox"));

        // Highlight draft status — warn prominently if no recipient
        if (!frm.doc.recipients || !frm.doc.recipients.trim()) {
            frm.set_intro(
                "⚠️ <b>No recipient email address.</b> Add one in the Recipients field before sending.",
                "red"
            );
        } else {
            frm.set_intro(
                `This email is <b>pending review</b>. Recipient: ${frm.doc.recipients}`,
                "orange"
            );
        }
    },
});
