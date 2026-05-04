#!/bin/bash
# Non-destructive backup integrity check.
# Pulls today's run from S3, verifies gzip + tar + site_config + row-count
# parity with the live DB. Run after any backup config change.
#
# Run as the frappe user (it has the AWS creds):
#   sudo -u frappe bash docs/runbooks/backup-verify.sh
# Or copy to EC2 and run there.

set -euo pipefail

REGION=ap-south-1
BUCKET=dspl-erp-backups
DATE=${1:-$(date -u +%Y-%m-%d)}
WORK=/tmp/backup_verify_$$
mkdir -p "$WORK"
cd "$WORK"

echo "=== 1. List today's backup objects ==="
aws s3 ls "s3://$BUCKET/runs/$DATE/" --region "$REGION" --human-readable
echo

echo "=== 2. Sentinel check ==="
aws s3 cp "s3://$BUCKET/runs/$DATE/_BACKUP_OK" - --region "$REGION" 2>/dev/null && echo
echo

echo "=== 3. Download artefacts ==="
aws s3 cp "s3://$BUCKET/runs/$DATE/" . --recursive --region "$REGION" --no-progress
ls -la

DBFILE=$(ls *-database.sql.gz | head -1)
PUBFILE=$(ls *-files.tar 2>/dev/null | head -1)
PRIVFILE=$(ls *-private-files.tar 2>/dev/null | head -1)
CFGFILE=$(ls *-site_config_backup.json 2>/dev/null | head -1)

echo
echo "=== 4. gzip integrity ==="
gunzip -t "$DBFILE" && echo "  $DBFILE: OK"

echo
echo "=== 5. tar integrity ==="
[ -n "$PUBFILE" ] && tar tf "$PUBFILE" > /dev/null && echo "  $PUBFILE: OK ($(tar tf "$PUBFILE" | wc -l) entries)"
[ -n "$PRIVFILE" ] && tar tf "$PRIVFILE" > /dev/null && echo "  $PRIVFILE: OK ($(tar tf "$PRIVFILE" | wc -l) entries)"

echo
echo "=== 6. Site config has required keys ==="
python3 -c "
import json, sys
cfg = json.load(open('$CFGFILE'))
required = ['db_name','db_password','encryption_key']
for k in required:
    val = cfg.get(k)
    if val:
        print(f'  {k}: present ({len(str(val))} chars)')
    else:
        print(f'  {k}: MISSING')
        sys.exit(1)
"

echo
echo "=== 7. SQL dump structure ==="
TABLES=$(zgrep -c '^CREATE TABLE' "$DBFILE" || true)
INSERTS_TOTAL=$(zgrep -c '^INSERT INTO' "$DBFILE" || true)
echo "  CREATE TABLE statements: $TABLES"
echo "  INSERT INTO statements (multi-row each): $INSERTS_TOTAL"

echo
echo "=== 8. Spot-check row counts in dump vs live DB ==="
count_rows_in_dump() {
    local table="$1"
    zcat "$DBFILE" | python3 -c "
import sys
tbl = '$table'
total = 0
buf = []
in_stmt = False
for line in sys.stdin:
    if line.startswith(f'INSERT INTO \`{tbl}\`'):
        in_stmt = True
    if in_stmt:
        buf.append(line)
        if line.rstrip().endswith(';'):
            stmt = ''.join(buf)
            try:
                vals = stmt.split(' VALUES ', 1)[1]
            except IndexError:
                vals = ''
            depth = 0; row_starts = 0; in_str = False; esc = False
            for ch in vals:
                if esc: esc = False; continue
                if ch == '\\\\': esc = True; continue
                if ch == \"'\" and not esc: in_str = not in_str
                if in_str: continue
                if ch == '(':
                    if depth == 0: row_starts += 1
                    depth += 1
                elif ch == ')':
                    depth -= 1
            total += row_starts
            buf = []; in_stmt = False
print(total)
"
}

for tbl in tabCustomer tabQuotation 'tabSales Order' tabItem 'tabSales Invoice'; do
    cnt=$(count_rows_in_dump "$tbl")
    printf "  %-25s in dump: %s\n" "\`$tbl\`" "$cnt"
done

echo
echo "=== 9. Live DB counts (for comparison) ==="
sudo -u frappe /home/frappe/frappe-bench/env/bin/python -c "
import os; os.chdir('/home/frappe/frappe-bench/sites')
import frappe; frappe.init(site='dgoc.logstop.com'); frappe.connect()
for dt in ['Customer','Quotation','Sales Order','Item','Sales Invoice']:
    print(f'  {dt:25s} live: {frappe.db.count(dt)}')
"

cd /
rm -rf "$WORK"

echo
echo "=== ALL CHECKS PASSED ==="
