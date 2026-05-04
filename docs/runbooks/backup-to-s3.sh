#!/bin/bash
# Twice-weekly full backup of dgoc.logstop.com to S3.
# This file is the canonical source — deploy by copying to /home/frappe/backup-to-s3.sh on EC2.
#
# Triggered by frappe's crontab: `0 22 * * 1,4` (Tue + Fri 03:30 IST).
# Each run lands in s3://dspl-erp-backups/runs/YYYY-MM-DD/<files> with a
# `_BACKUP_OK` sentinel. Never overwrites; never uses --delete.

set -euo pipefail

SITE=dgoc.logstop.com
BUCKET=dspl-erp-backups
REGION=ap-south-1
BACKUP_DIR=/home/frappe/frappe-bench/sites/$SITE/private/backups
LOG=/home/frappe/logs/backup-to-s3.log
DATE=$(date -u +%Y-%m-%d)
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
PREFIX="s3://$BUCKET/runs/$DATE"

mkdir -p /home/frappe/logs
exec >> "$LOG" 2>&1

echo
echo "=== $TS START ==="

cd /home/frappe/frappe-bench

# Snapshot before/after `bench backup` so we pick out the new files this run
# produced — robust against the 6-hourly bench auto-backup firing concurrently.
BEFORE=$(mktemp)
ls "$BACKUP_DIR" 2>/dev/null | sort > "$BEFORE" || true

echo "[$(date -u +%T)] running bench backup --with-files"
/home/frappe/.local/bin/bench --site "$SITE" backup --with-files

AFTER=$(mktemp)
ls "$BACKUP_DIR" | sort > "$AFTER"

NEW_FILES=$(comm -13 "$BEFORE" "$AFTER")
rm -f "$BEFORE" "$AFTER"

if [ -z "$NEW_FILES" ]; then
    echo "[$(date -u +%T)] !!! bench produced no new files — aborting upload"
    exit 2
fi

echo "[$(date -u +%T)] new files:"
echo "$NEW_FILES" | sed 's/^/  /'

echo "[$(date -u +%T)] uploading to $PREFIX/"
echo "$NEW_FILES" | while read -r f; do
    [ -z "$f" ] && continue
    src="$BACKUP_DIR/$f"
    aws s3 cp "$src" "$PREFIX/$f" --region "$REGION" --no-progress
done

echo "[$(date -u +%T)] verifying S3 contents"
aws s3 ls "$PREFIX/" --region "$REGION" --human-readable

# Sentinel for "did today's backup happen?" health checks.
echo "$TS" | aws s3 cp - "$PREFIX/_BACKUP_OK" --region "$REGION"

echo "=== $(date -u +%Y-%m-%dT%H-%M-%SZ) DONE ==="
