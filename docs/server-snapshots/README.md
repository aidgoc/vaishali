# Server-side snapshots

Files in this directory are **snapshots** of code that lives on the EC2 server
under `/home/frappe/dspl_erp/` (the FastAPI sidecar). That directory is not
yet a git repository, so we mirror the files here when we patch them so the
canonical version-controlled copy stays close to what's actually deployed.

## Files

| Snapshot | Server path | Notes |
|---|---|---|
| `dspl_erp_ai_chat.py` | `/home/frappe/dspl_erp/ai/chat.py` | FastAPI `/api/ai/{chat,history}` endpoints. GET /history is bridged to Frappe-native `vaishali.api.chat.get_history` for persistence across sidecar restarts. DELETE /history intentionally does NOT cascade to the persistent store (Frappe's `clear_history(None)` would wipe all of a user's history, not just the current conversation). |

## Deploying a change

```bash
# Tunnel via EC2 Instance Connect, scp the file, restart sidecar.
rm -f /tmp/dspl-temp-key /tmp/dspl-temp-key.pub
ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-08deae9f14e3cc99e \
  --instance-os-user ubuntu \
  --ssh-public-key file:///tmp/dspl-temp-key.pub \
  --region ap-south-1
scp -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no \
  docs/server-snapshots/dspl_erp_ai_chat.py \
  ubuntu@35.154.17.172:/tmp/chat_new.py
ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
  "sudo cp /home/frappe/dspl_erp/ai/chat.py /home/frappe/dspl_erp/ai/chat.py.bak.\$(date +%Y%m%d-%H%M%S) \
   && sudo cp /tmp/chat_new.py /home/frappe/dspl_erp/ai/chat.py \
   && sudo chown frappe:frappe /home/frappe/dspl_erp/ai/chat.py \
   && sudo supervisorctl restart dspl-fastapi"
```

After a deploy, also edit the snapshot here in the same commit so the repo
stays the source of truth.
