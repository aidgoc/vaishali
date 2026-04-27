"""One-time setup: create the 3 DSPL email accounts in Frappe."""
import frappe


def setup_email_accounts(sales_password, accounts_password, service_password):
    """
    Create or update the 3 DSPL email accounts.

    Run via:
        bench execute vaishali.setup_email.setup_email_accounts \
          --kwargs '{"sales_password": "xxxx", "accounts_password": "yyyy", "service_password": "zzzz"}'
    """
    accounts = [
        {
            "email_id": "sales@dgoc.in",
            "password": sales_password,
            "email_account_name": "DSPL Sales",
            "default_outgoing": 1,
            "append_to": "Quotation",
        },
        {
            "email_id": "accounts@dgoc.in",
            "password": accounts_password,
            "email_account_name": "DSPL Accounts",
            "default_outgoing": 0,
            "append_to": "Sales Invoice",
        },
        {
            "email_id": "service@dgoc.in",
            "password": service_password,
            "email_account_name": "DSPL Service",
            "default_outgoing": 0,
            "append_to": "Warranty Claim",
        },
    ]

    for acc in accounts:
        name = acc["email_account_name"]

        if frappe.db.exists("Email Account", name):
            doc = frappe.get_doc("Email Account", name)
            print(f"Updating existing: {name}")
        else:
            doc = frappe.new_doc("Email Account")
            doc.email_account_name = name
            print(f"Creating new: {name}")

        doc.email_id = acc["email_id"]
        doc.password = acc["password"]
        doc.service = "Gmail"

        # Outgoing (SMTP)
        doc.enable_outgoing = 1
        doc.smtp_server = "smtp.gmail.com"
        doc.smtp_port = 587
        doc.use_tls = 1
        doc.default_outgoing = acc["default_outgoing"]

        # Incoming (IMAP)
        doc.enable_incoming = 1
        doc.email_server = "imap.gmail.com"
        doc.incoming_port = 993
        doc.use_ssl = 1

        doc.append_to = acc["append_to"]
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        print(f"  Done: {acc['email_id']}")

    print("\nAll 3 email accounts configured. Run 'Send Test Email' in desk to verify SMTP.")
