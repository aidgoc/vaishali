# Vaishali — Deploy & Conventions

## Deploy to EC2

```bash
rm -f /tmp/dspl-temp-key /tmp/dspl-temp-key.pub && ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q \
  && aws ec2-instance-connect send-ssh-public-key --instance-id i-08deae9f14e3cc99e --instance-os-user ubuntu --ssh-public-key file:///tmp/dspl-temp-key.pub --region ap-south-1 \
  && ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
    "sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main' \
     && redis-cli FLUSHALL \
     && sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web dspl-fastapi"
```

## After hooks.py Changes (CRITICAL)

`redis-cli FLUSHALL` alone is NOT enough. Must also:
```bash
redis-cli FLUSHALL && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com clear-cache' && sudo supervisorctl restart all
```

## CSS Cache Chain (3 layers — ALL must bust on CSS changes)

1. nginx `max-age=31536000` on `/assets/` — restart nginx
2. Service Worker `ignoreSearch: true` — bump `CACHE_NAME` in `sw.js`
3. Browser disk cache — change `app_include_css` query param in `hooks.py`

## Static assets need `bench build`

Files under `/assets/vaishali/field/` are served by nginx with 1-year cache. Editing source files is NOT enough — must run `bench build --app vaishali && nginx -s reload`. Previous deploy commands only did `git pull + restart` which doesn't rebuild static assets.

## BOM Management — NEVER cancel submitted BOMs

| Fix type | Procedure |
|---|---|
| Wrong rates | Fix Item.valuation_rate → click "Update Cost" on BOM |
| Bulk rates | BOM Update Tool > "Update latest price in all BOMs" |
| Structural | Create new BOM → BOM Update Tool to replace old→new |

## Coding Conventions

- Vanilla JS with `el()` DOM builder — no jQuery, no React
- Icons: `icon('name')` from icons.js with `aria-hidden="true"`
- Form validation: `UI.fieldError(input, message)` for inline errors
- Timer cleanup: all `setInterval` must track and clear on `hashchange`
- API limits: `limit_page_length=0` for full lists
- Cache busting: Jinja `?v={{ _v }}` on all script/CSS tags
