frappe.ui.form.on("Outward Gate Pass", {
  refresh(frm) {
    if (
      frm.doc.docstatus === 1 &&
      frm.doc.returnable &&
      frm.doc.status === "Out"
    ) {
      frm.add_custom_button(__("Mark Returned"), () => {
        frappe.confirm(
          __("Mark this Gate Pass as Returned?"),
          () => {
            frm.call("mark_returned").then(() => {
              frm.reload_doc();
              frappe.show_alert({ message: __("Marked Returned"), indicator: "green" });
            });
          },
        );
      });
    }
  },
});
