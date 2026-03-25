frappe.ui.form.on('Customer', {
    refresh(frm) {
        if (frm.doc.__islocal) return;

        // 1. Show total business value (lifetime invoiced amount)
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: { customer: frm.doc.name, docstatus: 1 },
                fields: ['sum(grand_total) as total'],
                limit_page_length: 0
            },
            callback(r) {
                if (r.message && r.message[0] && r.message[0].total) {
                    let total = r.message[0].total;
                    frm.dashboard.add_indicator(
                        __(`Lifetime value: ₹${total.toLocaleString('en-IN')}`),
                        'green'
                    );
                }
            }
        });

        // 2. Show outstanding amount
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: { customer: frm.doc.name, docstatus: 1, outstanding_amount: ['>', 0] },
                fields: ['sum(outstanding_amount) as total'],
                limit_page_length: 0
            },
            callback(r) {
                if (r.message && r.message[0] && r.message[0].total) {
                    let total = r.message[0].total;
                    frm.dashboard.add_indicator(
                        __(`Outstanding: ₹${total.toLocaleString('en-IN')}`),
                        'orange'
                    );
                }
            }
        });

        // 3. Sales Timeline
        render_sales_timeline(frm);
    }
});


function render_sales_timeline(frm) {
    let customer = frm.doc.name;

    Promise.all([
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Daily Call Report', filters: { customer: customer },
            fields: ['name', 'date', 'visit_purpose', 'employee_name', 'status',
                     'conversion_status', 'check_in_time', 'check_out_time',
                     'discussion_remarks'],
            order_by: 'date desc', limit_page_length: 30
        }}),
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Opportunity', filters: { party_name: customer },
            fields: ['name', 'creation', 'opportunity_amount', 'status', 'source'],
            order_by: 'creation desc', limit_page_length: 20
        }}),
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Quotation', filters: { party_name: customer, docstatus: ['<', 2] },
            fields: ['name', 'transaction_date', 'grand_total', 'status', 'quotation_temperature'],
            order_by: 'transaction_date desc', limit_page_length: 20
        }}),
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Sales Order', filters: { customer: customer, docstatus: 1 },
            fields: ['name', 'transaction_date', 'grand_total', 'status'],
            order_by: 'transaction_date desc', limit_page_length: 20
        }})
    ]).then(([dcrs, opps, quotes, orders]) => {
        let events = [];

        (dcrs.message || []).forEach(d => {
            events.push({
                date: d.date, type: 'Visit', name: d.name,
                summary: [d.visit_purpose, d.employee_name, d.conversion_status].filter(Boolean).join(' · '),
                color: 'blue'
            });
        });
        (opps.message || []).forEach(o => {
            let amt = o.opportunity_amount ? ` · ₹${o.opportunity_amount.toLocaleString('en-IN')}` : '';
            events.push({
                date: o.creation ? o.creation.substring(0, 10) : '', type: 'Opportunity', name: o.name,
                summary: (o.status || '') + amt,
                color: 'yellow'
            });
        });
        (quotes.message || []).forEach(q => {
            let amt = q.grand_total ? ` · ₹${q.grand_total.toLocaleString('en-IN')}` : '';
            let temp = q.quotation_temperature ? ` · ${q.quotation_temperature}` : '';
            events.push({
                date: q.transaction_date, type: 'Quotation', name: q.name,
                summary: (q.status || '') + temp + amt,
                color: 'orange'
            });
        });
        (orders.message || []).forEach(s => {
            let amt = s.grand_total ? ` · ₹${s.grand_total.toLocaleString('en-IN')}` : '';
            events.push({
                date: s.transaction_date, type: 'Sales Order', name: s.name,
                summary: (s.status || '') + amt,
                color: 'green'
            });
        });

        events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        events = events.slice(0, 50);

        if (!events.length) return;

        // Build timeline HTML
        let html = '<div class="sales-timeline" style="margin-top:15px">';
        html += '<h6 style="font-weight:600;margin-bottom:10px;letter-spacing:-0.04em">Sales Timeline</h6>';

        for (let ev of events) {
            let colorMap = { blue: '#3b82f6', yellow: '#eab308', orange: '#f97316', green: '#22c55e' };
            let dot = colorMap[ev.color] || '#94a3b8';
            html += `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04)">`;
            html += `<div style="width:8px;height:8px;border-radius:50%;background:${dot};margin-top:6px;flex-shrink:0"></div>`;
            html += `<div style="flex:1;min-width:0">`;
            html += `<div style="display:flex;justify-content:space-between;align-items:baseline">`;
            html += `<a href="/app/${ev.type.toLowerCase().replace(/ /g, '-')}/${ev.name}" style="font-weight:500;font-size:13px">${ev.type}</a>`;
            html += `<span style="font-size:12px;color:#6b6b70;white-space:nowrap">${ev.date || ''}</span>`;
            html += `</div>`;
            html += `<div style="font-size:12px;color:#6b6b70;margin-top:1px">${frappe.utils.escape_html(ev.summary)}</div>`;
            html += `</div></div>`;
        }
        html += '</div>';

        // Add to form — use the area after dashboard
        let $wrapper = frm.$wrapper.find('.form-dashboard-section');
        if (!$wrapper.length) {
            $wrapper = frm.$wrapper.find('.form-layout');
        }
        $wrapper.find('.sales-timeline').remove();
        $wrapper.append(html);
    });
}
