# Backup & Restore Runbook

## Overview

Twice-weekly off-site backup of `dgoc.logstop.com` to S3, plus local 6-hourly snapshots for short-term rollback.

| Layer | Cadence | Retention | Location |
|---|---|---|---|
| Bench auto-backup (DB only) | every 6h | bench-managed (rolling) | `/home/frappe/frappe-bench/sites/dgoc.logstop.com/private/backups/` |
| Off-site full backup (DB + files + site_config) | Tue + Fri 03:30 IST | 90 days (S3 lifecycle) | `s3://dspl-erp-backups/runs/<DATE>/` |

S3 bucket has versioning ON and a 90-day expiration lifecycle. Each run lands in a date-prefixed key plus a `_BACKUP_OK` sentinel so we never overwrite previous runs and a single `aws s3 ls` confirms whether the latest run actually completed.

Effective RPO ≈ 3–4 days (worst case: failure right before Tue's run loses Sat–Mon's work).

## Deploy / re-deploy the script

Source of truth: [`backup-to-s3.sh`](backup-to-s3.sh) in this directory. Live copy lives at `/home/frappe/backup-to-s3.sh` on EC2.

```bash
# From local machine (refresh EC2 Instance Connect key first per CLAUDE.md)
scp -i /tmp/dspl-temp-key docs/runbooks/backup-to-s3.sh \
    ubuntu@35.154.17.172:/tmp/backup-to-s3.sh
ssh -i /tmp/dspl-temp-key ubuntu@35.154.17.172 \
    "sudo install -m 750 -o frappe -g frappe /tmp/backup-to-s3.sh /home/frappe/backup-to-s3.sh"
```

The frappe crontab entry that runs it:

```
0 22 * * 1,4 /home/frappe/backup-to-s3.sh
```

## Health checks

```bash
# Did the most recent run finish?
aws s3 ls s3://dspl-erp-backups/runs/ --recursive --region ap-south-1 \
  | grep _BACKUP_OK | tail -5

# What's in the latest backup?
LATEST=$(aws s3 ls s3://dspl-erp-backups/runs/ --region ap-south-1 \
  | awk '{print $2}' | sort | tail -1)
aws s3 ls s3://dspl-erp-backups/runs/$LATEST --region ap-south-1 --human-readable
```

## Manual trigger

```bash
ssh ubuntu@35.154.17.172 "sudo -u frappe /home/frappe/backup-to-s3.sh"
# logs to /home/frappe/logs/backup-to-s3.log
```

## Restore drill (CAUTION — destructive)

Restoring on the live `dgoc.logstop.com` site overwrites the live database and files. Only do this when you actually need to recover. For a rehearsal, restore into a separate test bench / site first.

```bash
DATE=2026-05-04   # whatever run you want to restore
mkdir -p /tmp/restore_$DATE && cd /tmp/restore_$DATE
aws s3 cp s3://dspl-erp-backups/runs/$DATE/ . --recursive --region ap-south-1

DB=$(ls *-database.sql.gz | head -1)
PUB=$(ls *-files.tar | head -1)
PRIV=$(ls *-private-files.tar | head -1)

# On the bench
sudo -u frappe bash -c "cd /home/frappe/frappe-bench && \
  bench --site dgoc.logstop.com restore /tmp/restore_$DATE/$DB \
    --with-public-files /tmp/restore_$DATE/$PUB \
    --with-private-files /tmp/restore_$DATE/$PRIV"

sudo -u frappe bash -c "cd /home/frappe/frappe-bench && \
  bench --site dgoc.logstop.com migrate"

sudo supervisorctl restart all
```

If `site_config.json::encryption_key` was rotated between the backup and the restore, all encrypted fields (Email Account passwords, OAuth tokens, etc.) must be re-entered after restore. Don't rotate `encryption_key` casually for this reason.

## Verification (without restoring to live)

`docs/runbooks/backup-verify.sh` is a non-destructive integrity check — gzip / tar validation, site_config key presence, and row-count parity between the dump and the live DB. Run after any backup config change.

## Things that will break this setup if you don't notice

1. **AWS keys expire / get rotated.** The `aws s3 cp` calls in the script use the credentials in `frappe`'s default chain (`~/.aws/credentials` or instance profile). If keys rotate, the script will silently start logging "Unable to locate credentials" and the cron will fail every Tue + Fri until someone notices. The `_BACKUP_OK` sentinel check above is the early-warning signal.
2. **`/home/frappe/logs/` filling up.** Log rotation isn't configured. The log file currently appends forever — fine for years at this volume, but worth a periodic `logrotate` config.
3. **`site_config.json` plaintext secrets.** The backup includes `site_config_backup.json` which has DB password, encryption key, AWS keys, Apollo key in cleartext. The bucket is private + AES256 at rest, but anyone with read access to the bucket gets all secrets. Rotate keys + move secrets to AWS Secrets Manager when bandwidth allows.
4. **Lifecycle policy** is set to 90-day expiration on the whole bucket. If you push non-backup data to this bucket, it'll vanish in 90 days too. Keep this bucket for backups only.

## Last verified

- 2026-05-04 — first successful run; integrity verified end-to-end (gzip OK, tar OK, site_config keys present, dump row counts match live DB exactly for Customer/Quotation/SO/Item/SI). Cron schedule + service status confirmed; failure-path test confirmed `set -euo pipefail` aborts safely with no S3 leakage.
