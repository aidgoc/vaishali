---
name: EC2 and Frappe Cloud infrastructure
description: How to deploy to EC2 (dspl-erp-server), SSH access, Frappe Cloud URL and credentials for data sync
type: reference
---

- **EC2 instance name:** `dspl-erp-server` — get IP via `aws ec2 describe-instances --filters "Name=tag:Name,Values=dspl-erp-server"`
- **SSH:** `ssh -i <SSH_KEY_PATH> ubuntu@<ip>`
- **Deploy:** git pull as frappe user → `redis-cli FLUSHALL` → restart supervisor
- **Frappe Cloud:** `dcepl.logstop.com` — login: `harsh@dgoc.in` / `<ASK_USER_FOR_PASSWORD>`
- **Data sync:** Use Frappe REST API to compare counts and migrate missing records via `POST /api/resource/<DocType>`
- **Dynamic Link pattern:** Address and Contact are linked to Customer via Dynamic Link child table — filter with `[["Dynamic Link", "link_doctype", "=", "Customer"], ["Dynamic Link", "link_name", "=", customer_id]]`
