import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConsentError, defaultChoices, offerOf, validateOptions } from '../dist/core.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const refused = (o: unknown, re: RegExp) =>
  assert.throws(() => validateOptions(o), (e: unknown) => e instanceof ConsentError && e.code === 'bad_config' && re.test(e.message));

test('a full §1 object is accepted', () => {
  const o = {
    company: 'Acme', capture: 'app', guided: true, masked: true, brand_color: '#112233', logo_png_base64: PNG, parent_window: 140230000,
    theme: { appearance: 'dark', background: '#000000', surface: '#111111', text: '#FFFFFF', accent: '#ff8800', radius: 24, font_family: 'Inter Tight', button_style: 'pill' },
    locale: 'pt-BR', wording: { title: 'Hi {company}', accept: 'OK' }, wording_version: 'acme-2026-11',
    choices: { offer_guided: true, offer_logs: true, offer_capture: true },
    privacy_url: 'https://acme.example/privacy', terms_url: 'https://acme.example/terms', timeout_seconds: 0, preview: true,
    server: 'https://api.gaiadesk.net', embed_token: 'gdemb_x', app_version: '2.4.1',
  };
  assert.equal(validateOptions(o), o);
  assert.deepEqual(validateOptions(undefined), {});
});

test('unknown keys are refused, at any depth', () => {
  refused({ compnay: 'Acme' }, /unknown key "compnay" in options/);
  refused({ theme: { colour: '#000000' } }, /unknown key "colour" in options.theme/);
  refused({ wording: { headline: 'x' } }, /unknown key "headline" in options.wording/);
  refused({ choices: { offer_screen: true } }, /unknown key/);
});

test('bad values are refused with the path', () => {
  refused({ capture: 'desktop' }, /options.capture/);
  refused({ brand_color: '#fff' }, /options.brand_color must be "#RRGGBB"/);
  refused({ theme: { radius: 25 } }, /options.theme.radius must be an integer 0..24/);
  refused({ theme: { radius: 1.5 } }, /radius/);
  refused({ theme: { font_family: 'x; background:url(evil)' } }, /font family/);
  refused({ privacy_url: 'http://acme.example/privacy' }, /https/);
  refused({ terms_url: 'javascript:alert(1)' }, /https/);
  refused({ timeout_seconds: -1 }, /timeout_seconds/);
  refused({ locale: 'en_US' }, /BCP-47/);
  refused({ wording: { title: 3 } }, /options.wording.title must be a string/);
  refused({ logo_png_base64: Buffer.from('GIF89a....').toString('base64') }, /PNG/);
  refused({ logo_png_base64: 'A'.repeat(400_000) }, /256 KiB/);
  refused({ guided: 'yes' }, /true or false/);
  refused([], /an object/);
});

test('choices: what is offered and where they start', () => {
  assert.deepEqual(offerOf({}), { guided: false, logs: false, capture: false, base: 'window' });
  assert.equal(offerOf({ guided: true }).guided, true, 'offer_guided defaults to true when guided');
  assert.equal(offerOf({ guided: true, choices: { offer_guided: false } }).guided, false);
  assert.equal(offerOf({ choices: { offer_guided: true } }).guided, false, 'never offered unless the app wants guided');
  assert.equal(offerOf({ capture: 'app' }).base, 'app');
  assert.deepEqual(defaultChoices({}), { guided: false, share_logs: false, capture: 'window' });
  assert.deepEqual(defaultChoices({ guided: true, capture: 'screen' }), { guided: true, share_logs: false, capture: 'screen' });
});
