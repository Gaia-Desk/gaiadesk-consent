import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { canonicalJson, fill, isRtl, offerOf, resolveLocale, sha256Hex, shownWording, templatesFor, wordingSha256 } from '../dist/core.js';

test('pure SHA-256 matches node:crypto across block boundaries', () => {
  for (let n = 0; n < 300; n++) {
    const b = randomBytes(n);
    assert.equal(sha256Hex(new Uint8Array(b)), createHash('sha256').update(b).digest('hex'), `length ${n}`);
  }
});

test('the wording hash: fixed vectors (the library must produce the same)', async () => {
  const ascii = { title: 'Share with Acme support?', accept: 'Share' };
  assert.equal(canonicalJson(ascii), '{"accept":"Share","title":"Share with Acme support?"}');
  assert.equal(await wordingSha256(ascii), '16dc6bd5ece1560d0d61559b9fcace086f6ba0d41f8ac43c7a30e41ca30eea0b');
  const unicode = { title: '要与 Acme 支持团队共享吗？', stop: 'Arrêtez « x » "q"', accept: 'Partager' };
  const want = '1ef71e9fc6da3d9530868ed18fd21cd88dd990bf4f1bef26f09f959fa95b6a21';
  assert.equal(await wordingSha256(unicode), want, 'WebCrypto');
  assert.equal(sha256Hex(new TextEncoder().encode(canonicalJson(unicode))), want, 'pure fallback');
});

test('locale resolution: exact, then language, then en', () => {
  assert.equal(resolveLocale('fr'), 'fr');
  assert.equal(resolveLocale('ZH-hans'), 'zh-Hans');
  assert.equal(resolveLocale('pt-BR'), 'pt');
  assert.equal(resolveLocale('zh-CN'), 'zh-Hans');
  assert.equal(resolveLocale('sw'), 'en');
  assert.equal(resolveLocale('auto', ['sw-KE', 'de-AT', 'fr']), 'de');
  assert.equal(resolveLocale('auto', []), 'en');
  assert.equal(isRtl('ar'), true);
  assert.equal(isRtl('ar-EG'), true);
  assert.equal(isRtl('en'), false);
});

test('placeholders fill; unknown or missing ones stay as written', () => {
  assert.equal(fill('{company} / {team} / {minutes} / {count} / {other}', { company: 'Acme', minutes: 2 }), 'Acme / {team} / 2 / {count} / {other}');
});

test('shown wording: overrides, placeholders and only what is displayed', () => {
  const o = { company: 'Acme', masked: true, guided: true, wording: { title: 'Let {company} help?', accept: 'Yes, share' }, timeout_seconds: 90 };
  const shown = shownWording(o, offerOf(o), templatesFor('en', o.wording), {
    company: 'Acme', choices: { guided: false, share_logs: false, capture: 'screen' },
    wait: { team_name: 'Acme Support', team_avatar_url: null, estimated_wait_seconds: 130 },
    preview: { png_base64: '', width: 1, height: 1, masked_count: 3 }, remaining: 61,
  });
  assert.deepEqual(shown, {
    title: 'Let Acme help?',
    intro: "Acme's support team will see only what is listed below, until you stop sharing.",
    sees_screen: 'They see your whole screen, including other apps',
    view_only: 'View only: they cannot click or type',
    masked: 'Passwords and private fields stay hidden',
    stop: 'Stop any time with "Stop sharing" on the Acme bar',
    allow_control: 'Allow support to click and type',
    waiting_team: 'Acme Support is ready to help',
    waiting_eta: 'Usually answers in about 2 min',
    preview_label: 'What support will see',
    preview_hidden: 'Fields hidden: 3',
    timeout_note: "If you don't answer, this request closes in 2 min",
    accept: 'Yes, share',
    decline: "Don't Share",
  });
  const unknown = templatesFor('xx', {});
  assert.equal(unknown.accept, 'Share', 'an unknown locale reads as en');
});
