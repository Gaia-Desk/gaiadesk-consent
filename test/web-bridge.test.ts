import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConsentError, webBridge, wordingSha256 } from '../dist/index.js';

const SID = 'ss_0123456789abcdef';
function fakeFetch(status = 200, body: unknown = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, f };
}

test('waitInfo: GET …/wait with the embed token', async () => {
  const wait = { team_name: 'Acme Support', team_avatar_url: null, estimated_wait_seconds: 120 };
  const { calls, f } = fakeFetch(200, wait);
  const b = webBridge({ server: 'https://api.gaiadesk.net', embedToken: 'gdemb_abc', sessionId: SID, fetch: f });
  assert.deepEqual(await b.waitInfo!(), wait);
  assert.equal(calls[0].url, `https://api.gaiadesk.net/v1/support/sessions/${SID}/wait`);
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer gdemb_abc');
  assert.equal(b.preview, undefined, 'no preview without the library');
});

test('recordConsent: builds an "embedded" receipt and POSTs it', async () => {
  const { calls, f } = fakeFetch(200, { ok: true });
  const b = webBridge({ server: 'https://api.gaiadesk.net/', embedToken: 'gdemb_abc', sessionId: SID, appName: 'Horus', fetch: f });
  const wording = { title: 'Share with Acme support?', accept: 'Share' };
  const choices = { guided: false, share_logs: true, capture: 'window' as const };
  const d = await b.recordConsent({ decision: 'accepted', choices, wording, wording_version: 'acme-1', locale: 'en', company: 'Acme', capture: 'window', app_version: '2.4.1' });
  const r = d.receipt!;
  assert.equal(d.decision, 'accepted');
  assert.equal(d.consent_token, undefined);
  assert.match(r.id, /^cr_[0-9a-hjkmnp-tv-z]{26}$/);
  assert.ok(Math.abs(Date.parse(r.at) - Date.now()) < 5000);
  assert.deepEqual({ ...r, id: '', at: '' }, {
    id: '', at: '', decision: 'accepted', surface: 'embedded', locale: 'en', wording_version: 'acme-1',
    wording_sha256: await wordingSha256(wording), choices, os_user: null, os: r.os, app_name: 'Horus', app_version: '2.4.1',
    sdk: 'gaiadesk-consent/0.1.1',
  });
  assert.equal(calls[0].url, `https://api.gaiadesk.net/v1/support/sessions/${SID}/consent`);
  assert.equal(calls[0].init.method, 'POST');
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h['idempotency-key'], r.id);
  assert.equal(h.authorization, 'Bearer gdemb_abc');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), r);
});

test('server refusals keep their reason', async () => {
  const { f } = fakeFetch(409, { error: { kind: 'conflict', reason: 'already_recorded', message: 'A receipt is already stored.' } });
  const b = webBridge({ server: 'https://api.gaiadesk.net', embedToken: 'gdemb_abc', sessionId: SID, fetch: f });
  await assert.rejects(
    b.recordConsent({ decision: 'declined', choices: { guided: false, share_logs: false, capture: 'window' }, wording: {}, wording_version: 'v', locale: 'en', company: 'Acme', capture: 'window', app_version: null }),
    (e: unknown) => e instanceof ConsentError && e.code === 'already_recorded',
  );
});

test('bad bridge config is refused up front', () => {
  const bad = (o: object) => assert.throws(() => webBridge({ server: 'https://api.gaiadesk.net', embedToken: 'gdemb_abc', sessionId: SID, ...o }), (e: unknown) => e instanceof ConsentError && e.code === 'bad_config');
  bad({ server: 'http://api.gaiadesk.net' });
  bad({ server: 'not a url' });
  bad({ embedToken: 'sk_live_x' });
  bad({ sessionId: '' });
  assert.ok(webBridge({ server: 'http://127.0.0.1:9000', embedToken: 'gdemb_abc', sessionId: SID }));
});
