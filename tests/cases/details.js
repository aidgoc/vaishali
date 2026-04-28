// details.js — detail screens render with hero + sections
'use strict';

const QUOT_FIXTURE = {
  match: 'doctype=Quotation',
  data: { message: {
    name: 'SAL-QTN-2026-001',
    party_name: 'Tata Motors Ltd',
    customer_name: 'Tata Motors Ltd',
    transaction_date: '2026-04-25',
    valid_till: '2026-05-25',
    status: 'Open',
    docstatus: 1,
    currency: 'INR',
    items: [
      { item_name: 'ATB Sensor', qty: 4, uom: 'Nos', rate: 18500, amount: 74000 },
      { item_name: 'LMI Display', qty: 2, uom: 'Nos', rate: 42000, amount: 84000 },
    ],
    total: 158000,
    total_taxes_and_charges: 28440,
    grand_total: 186440,
  } }
};

const OPP_FIXTURE = {
  match: 'doctype=Opportunity',
  data: { message: {
    name: 'CRM-OPP-001',
    party_name: 'Larsen & Toubro',
    opportunity_amount: 4250000,
    probability: 65,
    status: 'Open',
    items: [
      { item_name: 'EOT Crane Safety Kit', qty: 6, uom: 'Nos', rate: 425000, amount: 2550000 },
    ],
  } }
};

const LEAD_FIXTURE = {
  match: 'doctype=Lead',
  data: { data: {
    name: 'CRM-LEAD-001',
    lead_name: 'Anil Kumar',
    company_name: 'Tata Steel',
    mobile_no: '+91 98765 43210',
    email_id: 'anil@tatasteel.in',
    source: 'Trade Show',
    status: 'Lead',
    creation: '2026-04-25 10:30:00',
  } }
};

module.exports = {
  async quotationDetailHero(page, h) {
    await h.gotoRoute(page, '#/quotation/SAL-QTN-2026-001', {
      session: {}, api: [QUOT_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      hasHero: !!document.querySelector('.m3-doc-hero'),
      customerName: (document.querySelector('.m3-doc-hero-customer-name') || {}).textContent || '',
      amount: (document.querySelector('.m3-doc-hero-amount-value') || {}).textContent || '',
      itemCount: document.querySelectorAll('.m3-doc-item-row').length,
      hasGrandTotal: !!document.querySelector('.m3-doc-totals-row.grand'),
    }));
    h.assert(out.hasHero, 'Quotation detail missing m3-doc-hero');
    h.assert(out.customerName.includes('Tata Motors'), `Customer name wrong: ${out.customerName}`);
    h.assert(out.amount.includes('1,86,440') || out.amount.includes('186440'), `Grand total missing: ${out.amount}`);
    h.assert(out.itemCount === 2, `Expected 2 item rows, got ${out.itemCount}`);
    h.assert(out.hasGrandTotal, 'Grand total row missing');
  },

  async opportunityDetailHero(page, h) {
    await h.gotoRoute(page, '#/opportunity/CRM-OPP-001', {
      session: {}, api: [OPP_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      hasHero: !!document.querySelector('.m3-doc-hero'),
      customerName: (document.querySelector('.m3-doc-hero-customer-name') || {}).textContent || '',
      probability: (document.querySelector('.m3-doc-hero-amount-label') || {}).textContent || '',
      hasCreateQuote: !!Array.from(document.querySelectorAll('button')).find((b) => /create quotation/i.test(b.textContent)),
    }));
    h.assert(out.hasHero, 'Opportunity detail missing hero');
    h.assert(out.customerName.includes('Larsen'), `Customer wrong: ${out.customerName}`);
    h.assert(/probability/i.test(out.probability), `Probability label missing: ${out.probability}`);
    h.assert(out.hasCreateQuote, 'Create quotation action missing');
  },

  async leadDetailHero(page, h) {
    await h.gotoRoute(page, '#/lead/CRM-LEAD-001', {
      session: {}, api: [LEAD_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      hasHero: !!document.querySelector('.profile-hero, .m3-doc-hero'),
      name: (document.querySelector('.profile-hero h2, .m3-doc-hero-customer-name') || {}).textContent || '',
      hasCallButton: !!Array.from(document.querySelectorAll('button')).find((b) => /^call/i.test((b.textContent || '').trim())),
      hasEmailButton: !!Array.from(document.querySelectorAll('button')).find((b) => /^email/i.test((b.textContent || '').trim())),
    }));
    h.assert(out.hasHero, 'Lead detail missing hero');
    h.assert(out.name.includes('Anil'), `Lead name wrong: ${out.name}`);
    h.assert(out.hasCallButton, 'Call button missing');
    h.assert(out.hasEmailButton, 'Email button missing');
  },
};
