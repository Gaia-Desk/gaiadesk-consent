// No DOM here (a server render): importing the wrapper must not throw, and it renders the bare tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('@gaiadesk/consent/react imports and server-renders without a DOM', async () => {
  assert.equal(typeof (globalThis as Record<string, unknown>).HTMLElement, 'undefined');
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { GaiaDeskConsent } = await import('../dist/react.js');
  const html = renderToString(createElement(GaiaDeskConsent, { open: true, bridge: { recordConsent: async () => ({ decision: 'declined' as const }) } }));
  assert.equal(html, '<gaiadesk-consent></gaiadesk-consent>');
});
