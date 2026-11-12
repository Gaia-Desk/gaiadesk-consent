# GaiaDesk consent

[![npm](https://img.shields.io/npm/v/@gaiadesk/consent)](https://www.npmjs.com/package/@gaiadesk/consent)
[![License: MIT](https://img.shields.io/github/license/Gaia-Desk/gaiadesk-consent)](LICENSE)

The consent step for [GaiaDesk in-app support](https://gaiadesk.net/docs/in-app-support), in your
app's own webview: a `<gaiadesk-consent>` element (and a React wrapper) that asks your customer
before support sees anything. It is themed to your app, worded your way, localized in 14 languages,
fully keyboard and screen-reader accessible, and it:

- shows a **live preview** of exactly what support will see, masked fields blacked out, with
  "Fields hidden: N",
- offers **per-session choices**: view only or click-and-type, "Also share app logs", this window
  or the whole screen,
- shows **who is waiting** ("Acme Support is ready to help", "Usually answers in about 2 min"),
- links your **privacy policy and terms**, and **auto-declines** after a timeout you choose,
- records a **consent receipt** for every answer, stored on the session (see Receipts).

- Package: `@gaiadesk/consent` (ESM, TypeScript declarations included, no runtime dependencies)
- React wrapper: `@gaiadesk/consent/react` (React 18+ as an optional peer; the core never loads React)
- The same options and wording as libgaiadesk_embed's native dialog (0.4.0), which stays the
  fallback where there is no webview.

## Use this instead of `consentGranted: true`

If your app shows its own consent card and then starts with `consentGranted: true`, switch to this.
Your card can match the look; it cannot match what this does:

- **The preview** comes from the library's capture, so it is exactly the frame support would get,
  masks included. Your page cannot render that.
- **The receipt** is made by the library (time, wording version and hash, choices, OS user, app
  version) and stored on the session, in the console and in webhooks. That is what legal and
  compliance teams ask for; an app's own "they clicked yes" is not evidence.
- **The consent token** it hands back binds what the customer agreed to (company, capture, guided)
  to the session, so what you say and what you start cannot drift apart.

## Install

```sh
npm install @gaiadesk/consent
```

## Tauri (30 seconds)

The bridge comes from `@gaiadesk/tauri-plugin-support` **0.5.0** (its next release): it shows the
preview, says who is waiting, and has the library record the receipt. (The `startHelp` field
names follow that release's README.)

```ts
import '@gaiadesk/consent'; // registers <gaiadesk-consent>
import { consentBridge, startHelp } from '@gaiadesk/tauri-plugin-support';

async function getHelp() {
  const el = document.body.appendChild(document.createElement('gaiadesk-consent'));
  el.bridge = consentBridge;
  const d = await el.open({ company: 'Acme', capture: 'window', guided: true, masked: true, theme: { accent: '#5b4cf0' } });
  el.remove();
  if (d.decision !== 'accepted') return; // declined / timeout are recorded and end the request
  await startHelp({ consentToken: d.consent_token, consentReceipt: d.receipt });
}
```

## Linux

- **X11 (and XWayland):** the native library has its own consent dialog from libgaiadesk_embed
  **0.4.0**; the Tauri plugin's `consent()` shows it.
- **Wayland-only, or for an in-app look on any OS:** mount `<gaiadesk-consent>` (or
  `<GaiaDeskConsent>`) with the plugin's `consentBridge`. When the native dialog cannot show, the
  library's `consent()` resolves `{ decision: "unavailable" }`: that is your cue to mount the
  element, so you never need your own `askConsent` card.
- **Tested on WebKitGTK:** CI runs the element headless in Playwright's webkit on Ubuntu (the engine
  Tauri's Linux webview, WebKitGTK, is built on) and in chromium: accept, decline, timeout, Esc,
  Enter, the focus trap and the posted receipt's shape (`test/browser.test.ts`).

```ts
import '@gaiadesk/consent';
import { consent, consentBridge } from '@gaiadesk/tauri-plugin-support';

let d = await consent({ company: 'Acme' });             // the native dialog where there is one
if (d.decision === 'unavailable') {                       // Wayland-only: the element instead
  const el = document.body.appendChild(document.createElement('gaiadesk-consent'));
  el.bridge = consentBridge;
  d = await el.open({ company: 'Acme' });
  el.remove();
}
```

## Electron (30 seconds)

The bridge comes from `@gaiadesk/embed-native` **0.4.0** (its next release), for the main /
preload side; expose it to the page and use it there. (The `start` field names follow that
release's README.)

```ts
// preload.ts
import { contextBridge } from 'electron';
import { consentBridge } from '@gaiadesk/embed-native';
contextBridge.exposeInMainWorld('gaiadeskConsent', consentBridge);

// renderer.ts
import '@gaiadesk/consent';
const el = document.body.appendChild(document.createElement('gaiadesk-consent'));
el.bridge = (window as any).gaiadeskConsent;
const d = await el.open({ company: 'Acme', guided: true, choices: { offer_logs: true } });
el.remove();
// Hand the decision to your main process, which starts with d.consent_token and d.receipt.
if (d.decision === 'accepted') await (window as any).acme.startHelp(d);
```

## React

`<GaiaDeskConsent>` wraps the element: every option is the `options` prop, every event a callback.
Copy-paste (Tauri shown; any bridge works):

```tsx
import { useState } from 'react';
import { GaiaDeskConsent } from '@gaiadesk/consent/react';
import { consentBridge, startHelp } from '@gaiadesk/tauri-plugin-support';

export function GetHelp() {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button onClick={() => setAsking(true)}>Get help</button>
      <GaiaDeskConsent
        open={asking}                        // true shows it; false takes it down without a decision
        options={{ company: 'Acme', guided: true, timeout_seconds: 60 }}
        bridge={consentBridge}
        onShown={(d) => track('consent_shown', d)}                       // { locale, wording_version }
        onAccepted={({ choices }) => track('consent_accepted', choices)}
        onDeclined={({ reason }) => track('consent_declined', reason)}   // "declined" | "timeout"
        onDecision={async (d) => {                                       // { decision, choices, consent_token?, receipt }
          setAsking(false);
          if (d.decision === 'accepted') await startHelp({ consentToken: d.consent_token, consentReceipt: d.receipt });
        }}
        onError={(e) => { setAsking(false); console.error(e.code, e.message); }}
      />
    </>
  );
}
```

- Props: `open`, `options` (the element's options, below), `bridge`, and the callbacks `onShown`,
  `onAccepted`, `onDeclined`, `onDecision` (the bridge's decision with its receipt) and `onError`
  (a `ConsentError`; not called when `open` turns false). The latest callbacks are always used.
- Options are read when `open` turns true; to change them, close and open again.
- Unmounting, or `open={false}`, takes the dialog down; nothing is recorded.
- SSR-safe: importing it on the server (Next.js, Remix) does nothing and renders a bare
  `<gaiadesk-consent>`; the element registers itself in the browser.

## The element

`el.open(options)` returns a `Promise` of the bridge's decision:

```jsonc
{
  "decision": "accepted",              // "accepted" | "declined" | "timeout"
  "choices": { "guided": true, "share_logs": false, "capture": "window" },
  "consent_token": "gdc_…",            // accepted, with the library's bridges: for start
  "receipt": { … }                     // see Receipts
}
```

It rejects with a `ConsentError` (`code`): `bad_config` (an option the library would refuse, unknown
keys included), `no_bridge`, `already_open`, `closed` (`el.close()`, or the element was removed), or
the bridge's own code. Properties: `bridge`, `isOpen`; methods `open(options)`, `close()`. No
attributes.

Events (bubbling, composed `CustomEvent`s), for measuring drop-off:

| Event | `detail` |
|---|---|
| `consent-shown` | `{ locale, wording_version }` |
| `consent-accepted` | `{ choices }` |
| `consent-declined` | `{ reason: "declined" \| "timeout" }` |

Options (every key optional; the same JSON the native dialog takes):

| Option | |
|---|---|
| `company` | `{company}` in the wording. Default: the page title, else its host name. Set it. |
| `capture` | `window` (default), `app` or `screen`: what is shared, and what the checklist says. |
| `guided` | The app wants click-and-type (the customer can still choose view only). |
| `masked` | You pass masks: the checklist says private fields stay hidden. |
| `brand_color`, `logo_png_base64` | Accent (`#RRGGBB`) and a PNG logo (at most 256 KiB). |
| `theme` | See Theming. |
| `locale` | `auto` (default: `navigator.languages`) or a BCP-47 tag. |
| `wording`, `wording_version` | See Wording. |
| `choices` | `offer_guided` (default true when `guided`), `offer_logs`, `offer_capture` (window or whole screen). |
| `privacy_url`, `terms_url` | `https://` only; open in a new tab. |
| `timeout_seconds` | 0 (default) = never; else a countdown, then decision `timeout`. |
| `preview` | `false` hides the preview (default: shown when the bridge can capture). |
| `app_version` | Into the receipt. |
| `parent_window`, `server`, `embed_token` | For the native dialog; passed through, not used by the element. |

## Theming

The element reads CSS custom properties, so it can simply take your app's:

```css
:root { --gd-bg: #fff; --gd-surface: #f4f4f8; --gd-text: #16161d; --gd-accent: #5b4cf0;
        --gd-radius: 10px; --gd-font: "Inter", system-ui, sans-serif; }
```

`options.theme` wins over them where set: `appearance` (`light`, `dark`, `auto` following
`prefers-color-scheme`), `background`, `surface`, `text`, `accent` (`#RRGGBB`), `radius` (0–24 px),
`font_family` (a family name; the system UI font is the fallback), `button_style` (`filled`,
`outline`, `pill`). Text on the accent turns dark on a light accent.

## Wording

Override any of the strings, with placeholders `{company}`, `{team}`, `{minutes}`, `{count}`:

```ts
el.open({
  company: 'Acme',
  wording: { title: 'Let {company} take a look?', accept: 'Yes, show them', decline: 'Not now' },
  wording_version: 'acme-2026-11',
});
```

Keys: `title`, `intro`, `sees_window`, `sees_app`, `sees_screen`, `view_only`, `guided`, `masked`,
`stop`, `allow_control`, `share_logs`, `capture_window`, `capture_screen`, `waiting_team`,
`waiting_eta`, `preview_label`, `preview_hidden`, `privacy`, `terms`, `timeout_note`, `accept`,
`decline`. An override applies in every locale, so localize your own overrides (pick by
`resolveLocale(…)`) or keep them for tone only.

**Versioning:** give each wording you ship a `wording_version` and change it whenever the words
change. Default: `gaiadesk-consent-<version>-<locale>`. Every receipt carries the version and a
SHA-256 of the strings actually shown (after overrides and placeholders, keys sorted, compact JSON),
so you can prove which words a customer saw.

## Locales

en, es, fr, de, it, pt, nl, pl, tr, ru, ja, ko, zh-Hans and ar (right to left). Resolution: the exact
tag, then the language (`pt-BR` → `pt`, `zh-CN` → `zh-Hans`), then `en`. The strings are in
[`locales.json`](locales.json) (also exported as `@gaiadesk/consent/locales.json`), byte-identical
to the native dialog's.

## Receipts

Each accept, decline or timeout creates one receipt, stored on the session
(`GET /v1/support/sessions/{id}` → `consent`, the `support.session.consent` webhook, the console):

```jsonc
{ "id": "cr_…", "decision": "accepted", "at": "2026-11-12T16:04:05.123Z", "surface": "embedded",
  "locale": "en", "wording_version": "acme-2026-11", "wording_sha256": "…",
  "choices": { "guided": false, "share_logs": false, "capture": "window" },
  "os_user": "jane", "os": "macos", "app_name": "Horus", "app_version": "2.4.1", "sdk": "libgaiadesk_embed/0.4.0" }
```

It proves when the customer answered, what they chose, which words they were shown (version and
hash) and on which machine account and app version. With the Tauri and Electron bridges the native
library makes it (it reads the OS user and stamps the time), not your page. A declined or timed-out
receipt ends a session nobody has joined yet (`customer_declined` / `consent_timeout`).

### Without a native library: `webBridge`

For a plain web page there is a server-only bridge:

```ts
import { webBridge } from '@gaiadesk/consent';
el.bridge = webBridge({ server: 'https://api.gaiadesk.net', embedToken, sessionId });
```

It shows who is waiting (`GET /v1/support/sessions/{id}/wait`) and posts the receipt
(`POST /v1/support/sessions/{id}/consent`). **Limits:** no preview (a page cannot capture), no
`consent_token`, and the receipt is built in the page: `os_user` is `null` and only the page vouches
for its time and hash. Pass `d.receipt` to start as `consent_receipt`.

### Your own bridge

```ts
interface ConsentBridge {
  preview?(opts: { capture; parent_window? }): Promise<{ png_base64; width; height; masked_count } | null>;
  waitInfo?(): Promise<{ team_name; team_avatar_url; estimated_wait_seconds } | null>;
  recordConsent(input: { decision; choices; wording; wording_version; locale; company; capture; app_version }): Promise<Decision>;
}
```

The preview is asked for every second while the dialog is open; `null` or a `capture_unavailable`
rejection hides it.

## Accessibility

- A modal `role="dialog"` (`aria-modal`), labelled by its title and described by the intro and
  checklist; the preview has a text alternative and live "Fields hidden" / countdown text.
- Keyboard only: focus starts on Accept and is trapped in the dialog (Tab / Shift+Tab wrap),
  **Enter accepts, Esc declines**, the window/screen choice is a radio group (arrow keys).
- Visible focus rings; no animation under `prefers-reduced-motion`; sizes in `rem`, so it follows
  the user's text size; `dir="rtl"` for Arabic.

## Pure core

`@gaiadesk/consent/core` has no DOM: `validateOptions`, `resolveLocale`, `templatesFor`, `fill`,
`shownWording`, `wordingSha256`, `LOCALES`, for servers and tests.

## License

MIT
