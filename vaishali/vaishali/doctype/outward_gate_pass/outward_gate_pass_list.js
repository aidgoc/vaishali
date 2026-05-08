frappe.listview_settings["Outward Gate Pass"] = {
  add_fields: ["status", "returnable"],
  get_indicator(doc) {
    if (doc.docstatus === 0) return [__("Draft"), "red", "docstatus,=,0"];
    if (doc.status === "Out") return [__("Out"), "orange", "status,=,Out"];
    if (doc.status === "Returned") return [__("Returned"), "green", "status,=,Returned"];
    if (doc.status === "Closed") return [__("Closed"), "blue", "status,=,Closed"];
    return [doc.status, "gray", "status,=," + doc.status];
  },
};
