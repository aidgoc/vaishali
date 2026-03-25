---
name: EC2 and Frappe Cloud infrastructure
description: How to deploy to EC2 (dspl-erp-server), SSH access, Frappe Cloud URL and credentials for data sync
type: reference
---

- **AWS account:** `390449413787` (frappeflo-deploy), region `ap-south-1`
- **EC2 instance:** `dspl-erp-server` (`i-08deae9f14e3cc99e`), Elastic IP `35.154.17.172`
- **SSH via EC2 Instance Connect** (no PEM key on this machine):
  ```bash
  ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q 2>/dev/null
  aws ec2-instance-connect send-ssh-public-key --instance-id i-08deae9f14e3cc99e --instance-os-user ubuntu --ssh-public-key file:///tmp/dspl-temp-key.pub --region ap-south-1
  ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172
  ```
- **Deploy:** git pull as frappe user → `redis-cli FLUSHALL` → restart supervisor
- **Frappe Cloud:** `dcepl.logstop.com` — login: `harsh@dgoc.in` / `<ASK_USER_FOR_PASSWORD>`
- **Data sync:** Use Frappe REST API to compare counts and migrate missing records via `POST /api/resource/<DocType>`
- **Dynamic Link pattern:** Address and Contact are linked to Customer via Dynamic Link child table — filter with `[["Dynamic Link", "link_doctype", "=", "Customer"], ["Dynamic Link", "link_name", "=", customer_id]]`
