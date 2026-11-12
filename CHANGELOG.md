# Changelog

## 0.1.0

- First release: `<gaiadesk-consent>` (shadow DOM) and `@gaiadesk/consent/react`'s
  `<GaiaDeskConsent>`, GaiaDesk's consent step in your app's webview. The native dialog's options
  (libgaiadesk_embed 0.4.0), refused on unknown keys (`bad_config`); theme via `--gd-*` CSS
  variables or `options.theme` (light / dark / auto, colours, radius, font, button style); wording
  overrides with `{company}` / `{team}` / `{minutes}` / `{count}` and a `wording_version`; 14
  locales (`locales.json`, byte-identical to the library's), Arabic right to left; a live preview
  with "Fields hidden: N"; choices (click-and-type, app logs, window or whole screen); who is
  waiting; privacy / terms links; a timeout (decision `timeout`); `consent-shown`,
  `consent-accepted`, `consent-declined` events; focus trap, Enter accepts, Esc declines,
  reduced motion, rem sizing.
- `ConsentBridge` (the Tauri plugin's and `@gaiadesk/embed-native`'s `consentBridge` in their next
  releases) and `webBridge({ server, embedToken, sessionId })` (server calls only).
- `@gaiadesk/consent/core`: validation, locale resolution, wording and the wording SHA-256.
