// <gaiadesk-consent> in a real engine, from the built dist/ in a static page:
// webkit (WebKitGTK on Linux: the Tauri / Linux webview) or chromium, headless.
// `npm run test:browser` (BROWSER=webkit|chromium, default webkit); needs
// `npx playwright install webkit` first. The page records through webBridge
// against this file's server, so the receipt checked is the one posted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit, type Browser, type Page } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Acme App</title></head><body>
<button id="before">before</button>
<script type="module">
  import { webBridge } from '/dist/index.js';
  window.events = [];
  const el = document.body.appendChild(document.createElement('gaiadesk-consent'));
  for (const t of ['consent-shown', 'consent-accepted', 'consent-declined']) el.addEventListener(t, (e) => window.events.push([t, e.detail]));
  el.bridge = webBridge({ server: location.origin, embedToken: 'gdemb_test', sessionId: 'ss_test', appName: 'Acme' });
  window.ask = (o) => { window.events = []; window.result = el.open(o).catch((e) => ({ error: e.code })); };
  window.ready = true;
</script></body></html>`;

let server: Server;
let origin = '';
let browser: Browser;
let page: Page;
const posted: { auth?: string; key?: string; body: unknown }[] = [];

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/v1/support/sessions/ss_test/consent' && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      posted.push({ auth: req.headers.authorization, key: req.headers['idempotency-key'] as string, body: JSON.parse(body) });
      res.writeHead(201, { 'content-type': 'application/json' }).end('{"object":"support_consent"}');
    } else if (url.pathname === '/v1/support/sessions/ss_test/wait') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"team_name":"Acme Support","team_avatar_url":null,"estimated_wait_seconds":120}');
    } else if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    } else {
      const file = normalize(join(ROOT, url.pathname));
      if (!file.startsWith(join(ROOT, 'dist'))) return void res.writeHead(404).end();
      try {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
      } catch {
        res.writeHead(404).end();
      }
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await (process.env.BROWSER === 'chromium' ? chromium : webkit).launch({ headless: true });
  page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e));
  await page.goto(origin);
  await page.waitForFunction(() => (window as any).ready);
});

after(async () => {
  await browser?.close();
  server?.close();
});

const ask = (o: object) => page.evaluate((o) => (window as any).ask(o), o);
const result = () => page.evaluate(() => (window as any).result);
const events = () => page.evaluate(() => (window as any).events);
/** The class of the focused element inside the shadow root (null: focus left the dialog). */
const focused = () =>
  page.evaluate(() => {
    const el = document.querySelector('gaiadesk-consent')!;
    const a = el.shadowRoot!.activeElement as HTMLElement | null;
    return document.activeElement === el && a ? a.className || a.getAttribute('name') || a.tagName : null;
  });

/** api/openapi.yaml's ConsentReceipt, checked by hand (additionalProperties: false). */
function assertReceipt(r: any, decision: string) {
  assert.deepEqual(Object.keys(r).sort(), ['app_name', 'app_version', 'at', 'choices', 'decision', 'id', 'locale', 'os', 'os_user', 'sdk', 'surface', 'wording_sha256', 'wording_version']);
  assert.match(r.id, /^cr_[0-9A-Za-z]{26}$/);
  assert.equal(r.decision, decision);
  assert.ok(r.at.length <= 40 && !Number.isNaN(Date.parse(r.at)), r.at);
  assert.equal(r.surface, 'embedded');
  assert.match(r.locale, /^[A-Za-z][A-Za-z0-9-]{1,34}$/);
  assert.ok(r.wording_version.length >= 1 && r.wording_version.length <= 100);
  assert.match(r.wording_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(r.choices).sort(), ['capture', 'guided', 'share_logs']);
  assert.equal(typeof r.choices.guided, 'boolean');
  assert.equal(typeof r.choices.share_logs, 'boolean');
  assert.ok(['window', 'app', 'screen'].includes(r.choices.capture));
  assert.equal(r.os_user, null);
  assert.match(r.os, /^[a-z0-9_]{1,20}$/);
  assert.equal(r.app_name, 'Acme');
  assert.match(r.sdk, /^[a-z0-9_-]+\/[0-9A-Za-z.+-]+$/);
}

/** The decision came back with the receipt that was posted, once, with the token. */
function assertPosted(d: any, decision: string) {
  assert.equal(d.decision, decision);
  assertReceipt(d.receipt, decision);
  const p = posted.pop()!;
  assert.deepEqual(p, { auth: 'Bearer gdemb_test', key: d.receipt.id, body: d.receipt });
  assert.equal(posted.length, 0, 'posted once');
}

test('accept by click: shown/accepted events, the choices, the posted receipt', async () => {
  await ask({ company: 'Acme', guided: true, wording_version: 'acme-1' });
  await page.locator('gaiadesk-consent [role=dialog]').waitFor();
  await page.getByText('Acme Support is ready to help').waitFor();
  await page.locator('gaiadesk-consent input[name=guided]').check();
  await page.locator('gaiadesk-consent .accept').click();
  const d = await result();
  assertPosted(d, 'accepted');
  const choices = { guided: true, share_logs: false, capture: 'window' };
  assert.deepEqual(d.choices, choices);
  assert.deepEqual(d.receipt.choices, choices);
  assert.equal(d.receipt.wording_version, 'acme-1');
  assert.deepEqual(await events(), [
    ['consent-shown', { locale: 'en', wording_version: 'acme-1' }],
    ['consent-accepted', { choices }],
  ]);
  assert.equal(await page.locator('gaiadesk-consent [role=dialog]').count(), 0, 'taken down');
});

test('keyboard: focus starts on Accept and is trapped; Esc declines', async () => {
  await page.locator('#before').focus();
  await ask({ company: 'Acme', choices: { offer_logs: true }, privacy_url: 'https://acme.example/privacy' });
  await page.locator('gaiadesk-consent [role=dialog]').waitFor();
  assert.equal(await focused(), 'accept');
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const f = await focused();
    assert.ok(f, `Tab ${i + 1} kept focus in the dialog`);
    seen.add(f!);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    assert.ok(await focused(), `Shift+Tab ${i + 1} kept focus in the dialog`);
  }
  for (const f of ['accept', 'decline', 'share_logs', 'A']) assert.ok(seen.has(f), `Tab reaches ${f} (saw ${[...seen]})`);
  await page.keyboard.press('Escape');
  const d = await result();
  assertPosted(d, 'declined');
  assert.deepEqual((await events()).at(-1), ['consent-declined', { reason: 'declined' }]);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'before', 'focus goes back');
});

test('keyboard: Enter accepts (off the buttons, e.g. on a checkbox)', async () => {
  await ask({ company: 'Acme', choices: { offer_logs: true } });
  await page.locator('gaiadesk-consent input[name=share_logs]').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  const d = await result();
  assertPosted(d, 'accepted');
  assert.equal(d.receipt.choices.share_logs, true);
});

test('timeout_seconds: the countdown declines itself with decision timeout', async () => {
  await ask({ company: 'Acme', timeout_seconds: 2 });
  await page.locator('gaiadesk-consent .timeout').waitFor();
  const d = await result();
  assertPosted(d, 'timeout');
  assert.deepEqual((await events()).at(-1), ['consent-declined', { reason: 'timeout' }]);
});
