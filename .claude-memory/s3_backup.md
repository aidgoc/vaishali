---
name: S3 backup — twice-weekly, versioned, 90-day retention
description: ERP S3 backup setup — `/home/frappe/backup-to-s3.sh` runs Tue + Fri 03:30 IST via frappe crontab. Lands DB + public + private + site_config + _BACKUP_OK sentinel under s3://dspl-erp-backups/runs/<DATE>/. Versioned, no --delete, 90-day lifecycle. RPO ≈ 3-4 days.
type: project
originSessionId: 9c5c5eb9-e45b-46bc-9b30-4da8de9903be
---
Effective from 2026-05-04. Replaces the broken weekly cron + `--delete` setup.

**Why:** Old setup had two latent bugs — daily 2 AM `bench backup --with-files` redirected to `/var/log/...` which the frappe user can't write, so it silent-failed → no on-disk full backup; Sunday 4 AM `aws s3 sync ... --delete` therefore had nothing to upload. Bucket sat empty for months. CLAUDE.md called out the `--delete` risk; this run fixed both.

**How to apply:**
- Verify last good run: `aws s3 ls s3://dspl-erp-backups/runs/ --recursive --region ap-south-1 | grep _BACKUP_OK | tail -5`
- Manual trigger: `ssh ec2 → sudo -u frappe /home/frappe/backup-to-s3.sh`
- Restore drill: `aws s3 cp s3://dspl-erp-backups/runs/<DATE>/ ./restore/ --recursive` then `bench --site dgoc.logstop.com restore <db.sql.gz> --with-public-files <files.tar> --with-private-files <private-files.tar>`
- Adding more sites later: edit `SITE=` in `/home/frappe/backup-to-s3.sh` (or loop) — the script intentionally backs up only `dgoc.logstop.com` for now.
- DON'T add `--delete` to the script — versioning protects against accidental key overwrite, but `--delete` would still purge by the lifecycle expiration window.
- Cron schedule: `0 22 * * 1,4` UTC = Tue + Fri 03:30 IST. Don't move to IST-cron-syntax — server clock is UTC.
- The script uses a snapshot-diff (BEFORE/AFTER `ls`) instead of `ls -t | head -1` so that if bench-auto-backups fire mid-script we still upload the right files.
