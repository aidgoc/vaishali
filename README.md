# Vaishali — DSPL Org OS

AI-powered ERP assistant with composable View Engine for Dynamic Servitech Private Limited.

## Features

- **14 View Engine views** — parallel fetch, role-filtered (sales pipeline, customer 360, debtors, service dashboard, production, revenue, etc.)
- **AI Chat (Vaishali)** — 101 ERPNext tools via Claude AI, role-based access
- **26 PWA screens** for all departments (Sales, Service, Production, R&D, Management)
- **Native Frappe auth** — no separate server needed
- **41 routes** — attendance, visits, leave, expense, advance, salary, approvals, team, and more

## Installation

```bash
bench get-app https://github.com/aidgoc/vaishali
bench --site your-site.frappe.cloud install-app vaishali
```

## Configuration

Set your API keys in site_config.json:

```bash
bench --site your-site set-config anthropic_api_key "sk-ant-..."
```

## API Endpoints

- `GET /api/method/vaishali.api.views.get_view?view_name=sales_pipeline`
- `POST /api/method/vaishali.api.chat.send_message`
- `GET /api/method/vaishali.api.field.attendance_today`
- `POST /api/method/vaishali.api.field.create_checkin`
- `GET /api/method/vaishali.api.field.get_me`

## License

MIT
