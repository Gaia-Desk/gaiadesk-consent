import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom.js';

installDom();
const { ConsentError } = await import('../dist/index.js');
type El = import('../dist/index.js').GaiaDeskConsentElement;
type Input = import('../dist/index.js').RecordConsentInput;
type Bridge = import('../dist/index.js').ConsentBridge;

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const settle = () => new Promise((r) => setImmediate(r));

function bridge(extra: Partial<Bridge> = {}) {
  const calls: Input[] = [];
  const b = {
    calls,
    recordConsent: async (input: Input) => (calls.push(input), { decision: input.decision, choices: input.choices, consent_token: 'gdc_test' }),
    ...extra,
  };
  return b;
}

function mount(b: Bridge | null): El {
  const el = document.createElement('gaiadesk-consent');
  document.body.append(el);
  el.bridge = b;
  return el;
}

const $ = <T extends Element = HTMLElement>(el: El, sel: string) => el.shadowRoot!.querySelector(sel) as T;
const visible = (el: El) =>
  Object.fromEntries(Array.from(el.shadowRoot!.querySelectorAll<HTMLElement>('[data-k]')).filter((n) => !n.closest('[hidden]')).map((n) => [n.dataset.k!, n.textContent!]));
const key = (target: Element, k: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, composed: true, cancelable: true }));
function events(el: El) {
  const seen: [string, unknown][] = [];
  for (const t of ['consent-shown', 'consent-accepted', 'consent-declined']) el.addEventListener(t, (e) => seen.push([t, (e as CustomEvent).detail]));
  return seen;
}

test('renders an accessible dialog with focus on Accept', async () => {
  const el = mount(bridge());
  const done = el.open({ company: 'Acme', masked: true });
  const d = $(el, '[role=dialog]');
  assert.equal(d.getAttribute('aria-modal'), 'true');
  assert.equal(el.shadowRoot!.getElementById(d.getAttribute('aria-labelledby')!)!.textContent, 'Share with Acme support?');
  for (const id of d.getAttribute('aria-describedby')!.split(' ')) assert.ok(el.shadowRoot!.getElementById(id), id);
  assert.equal(el.shadowRoot!.activeElement, $(el, '.accept'));
  assert.equal(d.dir, 'ltr');
  assert.deepEqual(Object.keys(visible(el)).sort(), ['accept', 'decline', 'intro', 'masked', 'sees_window', 'stop', 'title', 'view_only']);
  el.close();
  await assert.rejects(done, (e: unknown) => e instanceof ConsentError && e.code === 'closed');
  assert.equal(el.shadowRoot!.childNodes.length, 0, 'taken down');
  el.remove();
});

test('Enter accepts: events, the bridge gets exactly the shown wording, open() resolves with its decision', async () => {
  const b = bridge();
  const el = mount(b);
  const seen = events(el);
  const done = el.open({ company: 'Acme', guided: true, wording: { accept: 'Yes, {company}' }, app_version: '2.4.1', wording_version: 'acme-1' });
  const shown = visible(el);
  assert.equal(shown.accept, 'Yes, Acme');
  key($(el, 'input[name=guided]'), 'Enter');
  const d = await done;
  assert.deepEqual(d, { decision: 'accepted', choices: { guided: true, share_logs: false, capture: 'window' }, consent_token: 'gdc_test' });
  assert.deepEqual(b.calls[0], {
    decision: 'accepted', choices: { guided: true, share_logs: false, capture: 'window' }, wording: shown,
    wording_version: 'acme-1', locale: 'en', company: 'Acme', capture: 'window', app_version: '2.4.1',
  });
  assert.deepEqual(seen, [
    ['consent-shown', { locale: 'en', wording_version: 'acme-1' }],
    ['consent-accepted', { choices: { guided: true, share_logs: false, capture: 'window' } }],
  ]);
  el.remove();
});

test('Esc declines; the default company is the page title, the default wording version names the locale', async () => {
  const b = bridge();
  const el = mount(b);
  const seen = events(el);
  const done = el.open({});
  key($(el, '.accept'), 'Escape');
  assert.equal((await done).decision, 'declined');
  assert.equal(b.calls[0].company, 'Acme App');
  assert.match(b.calls[0].wording_version, /^gaiadesk-consent-\d+\.\d+\.\d+-en$/);
  assert.deepEqual(seen[1], ['consent-declined', { reason: 'declined' }]);
  el.remove();
});

test('Tab is trapped in the dialog, both ways', async () => {
  const el = mount(bridge());
  const done = el.open({ company: 'Acme', guided: true, privacy_url: 'https://acme.example/p', choices: { offer_logs: true } });
  const order = ['input[name=guided]', 'input[name=share_logs]', 'a', '.decline', '.accept'].map((s) => $(el, s));
  const active = () => el.shadowRoot!.activeElement;
  key(active()!, 'Tab');
  assert.equal(active(), order[0], 'wraps from Accept to the first control');
  for (const want of order.slice(1)) (key(active()!, 'Tab'), assert.equal(active(), want));
  order[0].focus();
  key(order[0], 'Tab', true);
  assert.equal(active(), order[4], 'shift+Tab wraps backwards');
  el.close();
  await done.catch(() => {});
  el.remove();
});

test('choices: toggles and the window/screen control change the checklist and reach the bridge', async () => {
  const b = bridge();
  const el = mount(b);
  const done = el.open({ company: 'Acme', guided: true, choices: { offer_logs: true, offer_capture: true } });
  assert.equal(visible(el).guided, 'They may click and type in this app (you can pause that any time)');
  const flip = (sel: string, checked: boolean) => {
    const i = $<HTMLInputElement>(el, sel);
    i.checked = checked;
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
  flip('input[name=guided]', false);
  flip('input[name=share_logs]', true);
  flip('input[value=screen]', true);
  const shown = visible(el);
  assert.equal(shown.view_only, 'View only: they cannot click or type');
  assert.equal(shown.sees_screen, 'They see your whole screen, including other apps');
  assert.ok(!('guided' in shown) && !('sees_window' in shown));
  assert.equal(shown.capture_window, 'This window');
  $(el, '.accept').click();
  assert.deepEqual((await done).choices, { guided: false, share_logs: true, capture: 'screen' });
  assert.equal(b.calls[0].capture, 'screen');
  el.remove();
});

test('the timeout counts down and declines with "timeout"', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const b = bridge();
    const el = mount(b);
    const seen = events(el);
    const done = el.open({ company: 'Acme', timeout_seconds: 61 });
    assert.equal(visible(el).timeout_note, "If you don't answer, this request closes in 2 min");
    mock.timers.tick(1000);
    assert.equal(visible(el).timeout_note, "If you don't answer, this request closes in 1 min");
    mock.timers.tick(60_000);
    assert.equal((await done).decision, 'timeout');
    assert.equal(b.calls[0].decision, 'timeout');
    assert.deepEqual(seen[1], ['consent-declined', { reason: 'timeout' }]);
    el.remove();
  } finally {
    mock.timers.reset();
  }
});

test('the preview refreshes every second, shows hidden fields, and goes away on capture_unavailable', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const asked: unknown[] = [];
    let n = 0;
    const el = mount(bridge({
      preview: async (opts) => {
        asked.push(opts);
        if (++n > 2) throw Object.assign(new Error('no permission'), { code: 'capture_unavailable' });
        return { png_base64: PNG, width: 480, height: 300, masked_count: n };
      },
    }));
    const done = el.open({ company: 'Acme', masked: true, parent_window: 7, window_id: 9, masks: [{ x: 1, y: 2, w: 3, h: 4 }] });
    await settle();
    assert.equal(visible(el).preview_hidden, 'Fields hidden: 1');
    assert.equal($<HTMLImageElement>(el, '.preview img').src, `data:image/png;base64,${PNG}`);
    assert.equal($<HTMLImageElement>(el, '.preview img').alt, 'What support will see');
    mock.timers.tick(1000);
    await settle();
    assert.equal(visible(el).preview_hidden, 'Fields hidden: 2');
    mock.timers.tick(1000);
    await settle();
    assert.equal($(el, '.preview').hidden, true);
    mock.timers.tick(5000);
    await settle();
    assert.equal(asked.length, 3, 'no more previews after capture_unavailable');
    assert.deepEqual(asked[0], { capture: 'window', parent_window: 7, window_id: 9, masks: [{ x: 1, y: 2, w: 3, h: 4 }] });
    $(el, '.accept').click();
    await done;
    el.remove();
  } finally {
    mock.timers.reset();
  }
});

test('who is waiting, legal links and the theme', async () => {
  const el = mount(bridge({ waitInfo: async () => ({ team_name: 'Acme Support', team_avatar_url: 'https://acme.example/a.png', estimated_wait_seconds: 120 }) }));
  const done = el.open({
    company: 'Acme', privacy_url: 'https://acme.example/privacy', logo_png_base64: PNG,
    theme: { appearance: 'dark', accent: '#ffdd00', radius: 4, font_family: 'Inter', button_style: 'pill' },
  });
  await settle();
  const shown = visible(el);
  assert.equal(shown.waiting_team, 'Acme Support is ready to help');
  assert.equal(shown.waiting_eta, 'Usually answers in about 2 min');
  assert.equal($<HTMLImageElement>(el, '.avatar').hidden, false);
  const a = $<HTMLAnchorElement>(el, 'a');
  assert.deepEqual([a.textContent, a.href, a.target, a.rel], ['Privacy policy', 'https://acme.example/privacy', '_blank', 'noopener noreferrer']);
  assert.ok(!('terms' in shown));
  const bd = $(el, '.backdrop');
  assert.ok(bd.classList.contains('dark'));
  assert.ok($(el, '.dialog').classList.contains('pill'));
  assert.equal(bd.style.getPropertyValue('--gd-accent'), '#ffdd00');
  assert.equal(bd.style.getPropertyValue('--_ink'), '#111111', 'dark text on a light accent');
  assert.equal(bd.style.getPropertyValue('--gd-radius'), '4px');
  assert.match(bd.style.getPropertyValue('--gd-font'), /^"Inter", system-ui/);
  assert.equal($<HTMLImageElement>(el, '.logo').src, `data:image/png;base64,${PNG}`);
  el.close();
  await done.catch(() => {});
  el.remove();
});

test('Arabic is right-to-left; "auto" follows navigator.languages', async () => {
  const el = mount(bridge());
  let done = el.open({ company: 'Acme', locale: 'ar' });
  const d = $(el, '[role=dialog]');
  assert.equal(d.dir, 'rtl');
  assert.equal(d.lang, 'ar');
  assert.equal(visible(el).title, 'هل تريد المشاركة مع فريق دعم Acme؟');
  el.close();
  await done.catch(() => {});
  Object.defineProperty(globalThis, 'navigator', { value: { languages: ['de-CH', 'en'] }, configurable: true });
  done = el.open({ company: 'Acme' });
  assert.equal(visible(el).accept, 'Teilen');
  assert.equal($(el, '[role=dialog]').dir, 'ltr');
  el.close();
  await done.catch(() => {});
  el.remove();
});

test('refusals: no bridge, bad options, already open, a failing bridge', async () => {
  const code = (c: string) => (e: unknown) => e instanceof ConsentError && e.code === c;
  await assert.rejects(mount(null).open({}), code('no_bridge'));
  const el = mount(bridge({ recordConsent: async () => { throw new Error('already_recorded: a receipt is already stored'); } }));
  await assert.rejects(el.open({ colour: 'red' } as never), code('bad_config'));
  const done = el.open({ company: 'Acme' });
  await assert.rejects(el.open({}), code('already_open'));
  $(el, '.accept').click();
  $(el, '.decline').click();
  await assert.rejects(done, code('already_recorded'));
  assert.equal(el.isOpen, false);
});
