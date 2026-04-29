#!/usr/bin/env node
// runner.js — DSPL Field PWA test runner
// Usage:
//   node runner.js              -> all suites
//   node runner.js smoke        -> only smoke
//   node runner.js forms.applyLeave -> single case
'use strict';

const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('\n✗ Missing playwright. Install with:\n   npm i --no-save playwright\n   npx playwright install chromium\n');
  process.exit(1);
}

const helpers = require('./helpers');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ARG = (process.argv[2] || '').trim();
const SUITES = ['smoke', 'navigation', 'forms', 'details', 'integrations', 'round2', 'round3'];

function shouldRun(suite, name) {
  if (!ARG) return true;
  const [reqSuite, reqCase] = ARG.split('.');
  if (suite !== reqSuite) return false;
  if (!reqCase) return true;
  return name === reqCase;
}

async function loadSuite(suiteName) {
  const file = path.join(__dirname, 'cases', suiteName + '.js');
  if (!fs.existsSync(file)) return [];
  const cases = require(file);
  return Object.entries(cases).map(([name, fn]) => ({ suite: suiteName, name, fn }));
}

async function runOne(browser, t) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro size
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = helpers.attachConsoleCollector(page);

  let result = { suite: t.suite, name: t.name, status: 'pass', errors: [], duration_ms: 0 };
  const startedAt = Date.now();
  try {
    await t.fn(page, helpers);
    if (errors.length > 0) {
      result.status = 'warn';
      result.errors = errors;
    }
  } catch (e) {
    result.status = 'fail';
    result.errors = [String(e.message || e), ...errors];
    const file = path.join(SCREENSHOT_DIR, `${t.suite}.${t.name}.fail.png`);
    try { await page.screenshot({ path: file, fullPage: true }); result.screenshot = file; } catch (_) {}
  } finally {
    result.duration_ms = Date.now() - startedAt;
    await ctx.close();
  }
  return result;
}

(async function main() {
  const browser = await chromium.launch({ headless: true });
  const allCases = [];
  for (const s of SUITES) {
    const cases = await loadSuite(s);
    for (const c of cases) if (shouldRun(s, c.name)) allCases.push(c);
  }

  console.log(`\n  Running ${allCases.length} test case(s) against ${helpers.BASE}\n`);
  const results = [];
  for (const t of allCases) {
    process.stdout.write(`  ${t.suite}.${t.name} ... `);
    const r = await runOne(browser, t);
    results.push(r);
    const symbol = r.status === 'pass' ? '✓' : (r.status === 'warn' ? '!' : '✗');
    process.stdout.write(`${symbol}  ${r.duration_ms}ms\n`);
    if (r.errors.length) {
      for (const e of r.errors.slice(0, 3)) console.log(`     ${e}`);
    }
    if (r.screenshot) console.log(`     screenshot: ${r.screenshot}`);
  }
  await browser.close();

  const pass = results.filter((r) => r.status === 'pass').length;
  const warn = results.filter((r) => r.status === 'warn').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n  ${pass} passed, ${warn} with console warnings, ${fail} failed.\n`);

  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
