import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom.js';

installDom();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const { createElement } = await import('react');
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { GaiaDeskConsent } = await import('../dist/react.js');
type Input = import('../dist/index.js').RecordConsentInput;

test('<GaiaDeskConsent>: open shows it, the callbacks fire, open=false takes it down', async () => {
  const log: string[] = [];
  const bridge = { recordConsent: async (i: Input) => ({ decision: i.decision, choices: i.choices }) };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = (open: boolean) => ({
    open, bridge, options: { company: 'Acme' },
    onShown: (d: unknown) => log.push(`shown ${JSON.stringify(d)}`),
    onAccepted: (d: unknown) => log.push(`accepted ${JSON.stringify(d)}`),
    onDecision: (d: { decision: string }) => log.push(`decision ${d.decision}`),
    onError: (e: Error) => log.push(`error ${e.message}`),
  });
  await act(async () => root.render(createElement(GaiaDeskConsent, props(true))));
  const el = host.querySelector('gaiadesk-consent')!;
  assert.equal(el.isOpen, true);
  await act(async () => (el.shadowRoot!.querySelector('.accept') as HTMLElement).click());
  assert.deepEqual(log, [
    'shown {"locale":"en","wording_version":"gaiadesk-consent-0.1.1-en"}',
    'accepted {"choices":{"guided":false,"share_logs":false,"capture":"window"}}',
    'decision accepted',
  ]);
  await act(async () => root.render(createElement(GaiaDeskConsent, props(false))));
  await act(async () => root.render(createElement(GaiaDeskConsent, props(true))));
  assert.equal(el.isOpen, true, 'shown again');
  await act(async () => root.render(createElement(GaiaDeskConsent, props(false))));
  assert.equal(el.isOpen, false, 'taken down without a decision');
  assert.equal(log.filter((l) => l.startsWith('error')).length, 0, 'closing is not an error');
  await act(async () => root.unmount());
});

test('<GaiaDeskConsent>: decline and timeout reach the callbacks with the bridge\'s receipt; unmount closes', async () => {
  const receipt = (decision: Input['decision']): import('../dist/index.js').ConsentReceipt => ({
    id: 'cr_0000000000000000000000test', decision, at: '2026-11-12T16:04:05.123Z', surface: 'embedded', locale: 'en',
    wording_version: 'v1', wording_sha256: '0'.repeat(64), choices: { guided: false, share_logs: false, capture: 'window' },
    os_user: null, os: 'linux', app_name: null, app_version: null, sdk: 'gaiadesk-consent/0.1.1',
  });
  const bridge = { recordConsent: async (i: Input) => ({ decision: i.decision, choices: i.choices, receipt: receipt(i.decision) }) };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const run = async (options: Record<string, unknown>, act_: (el: HTMLElement) => Promise<void> | void) => {
    const log: unknown[] = [];
    const props = {
      open: true, bridge, options,
      onDeclined: (d: unknown) => log.push(['declined', d]),
      onAccepted: (d: unknown) => log.push(['accepted', d]),
      onDecision: (d: unknown) => log.push(['decision', d]),
    };
    await act(async () => root.render(createElement(GaiaDeskConsent, props)));
    const el = host.querySelector('gaiadesk-consent')! as unknown as HTMLElement;
    await act(async () => act_(el));
    await act(async () => root.render(createElement(GaiaDeskConsent, { ...props, open: false })));
    return log;
  };
  const choices = { guided: false, share_logs: false, capture: 'window' };
  assert.deepEqual(
    await run({ company: 'Acme' }, (el) => (el.shadowRoot!.querySelector('.decline') as HTMLElement).click()),
    [['declined', { reason: 'declined' }], ['decision', { decision: 'declined', choices, receipt: receipt('declined') }]],
  );
  assert.deepEqual(
    await run({ company: 'Acme', timeout_seconds: 1 }, () => new Promise((r) => setTimeout(r, 1300))),
    [['declined', { reason: 'timeout' }], ['decision', { decision: 'timeout', choices, receipt: receipt('timeout') }]],
  );
  await act(async () => root.render(createElement(GaiaDeskConsent, { open: true, bridge })));
  const el = host.querySelector('gaiadesk-consent')!;
  assert.equal(el.isOpen, true);
  await act(async () => root.unmount());
  assert.equal(el.isOpen, false, 'unmount takes it down');
});
