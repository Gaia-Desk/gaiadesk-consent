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
    'shown {"locale":"en","wording_version":"gaiadesk-consent-0.1.0-en"}',
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
