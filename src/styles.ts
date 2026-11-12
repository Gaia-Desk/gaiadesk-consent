// The shadow root's stylesheet. Colours come from --gd-* (set by the app's
// own CSS, or by options.theme on the backdrop, which wins), else the
// appearance's defaults. Sizes in rem so they follow the user's text size.
export const STYLES = `
:host { all: initial; }
[hidden] { display: none !important; }
.backdrop {
  --_d-bg: #ffffff; --_d-surface: #f3f4f6; --_d-text: #1d1d1f; --_d-accent: #2563eb;
  --_bg: var(--gd-bg, var(--_d-bg)); --_surface: var(--gd-surface, var(--_d-surface));
  --_text: var(--gd-text, var(--_d-text)); --_accent: var(--gd-accent, var(--_d-accent));
  --_radius: var(--gd-radius, 12px);
  --_font: var(--gd-font, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif);
  position: fixed; inset: 0; z-index: 2147483646; display: flex; align-items: center; justify-content: center;
  padding: 1rem; box-sizing: border-box; background: rgba(0, 0, 0, 0.45);
  font-family: var(--_font); font-size: 1rem; line-height: 1.45; color: var(--_text);
}
.backdrop.dark { --_d-bg: #1c1c1e; --_d-surface: #2c2c2e; --_d-text: #f5f5f7; --_d-accent: #4f8cff; }
@media (prefers-color-scheme: dark) {
  .backdrop.auto { --_d-bg: #1c1c1e; --_d-surface: #2c2c2e; --_d-text: #f5f5f7; --_d-accent: #4f8cff; }
}
.dialog {
  box-sizing: border-box; width: 100%; max-width: 32rem; max-height: calc(100vh - 2rem); overflow: auto;
  background: var(--_bg); color: var(--_text); border-radius: var(--_radius); padding: 1.5rem;
  box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.3); animation: gd-in 160ms ease-out;
}
@keyframes gd-in { from { opacity: 0; transform: translateY(0.5rem); } }
@media (prefers-reduced-motion: reduce) { .dialog { animation: none; } }
header { display: flex; gap: 1rem; align-items: flex-start; }
.logo { width: 3rem; height: 3rem; object-fit: contain; flex: none; }
h2 { margin: 0 0 0.375rem; font-size: 1.2rem; line-height: 1.3; font-weight: 650; }
.intro, .muted { margin: 0; opacity: 0.78; }
ul { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.375rem; }
li { position: relative; padding-inline-start: 1.5rem; }
li::before { content: "\\2713"; position: absolute; inset-inline-start: 0; color: var(--_accent); font-weight: 700; }
.preview { margin-top: 1rem; background: var(--_surface); border-radius: calc(var(--_radius) * 0.75); padding: 0.75rem; }
.preview img { display: block; max-width: 100%; height: auto; margin: 0.5rem auto 0; background: #000; border-radius: 0.25rem; }
.preview .muted { font-size: 0.875rem; margin-top: 0.375rem; }
.choices { margin-top: 1rem; display: grid; gap: 0.5rem; }
.check { display: flex; gap: 0.5rem; align-items: center; cursor: pointer; }
.check input { width: 1.125rem; height: 1.125rem; margin: 0; accent-color: var(--_accent); }
.seg { display: inline-flex; border: 1px solid color-mix(in srgb, var(--_text) 25%, transparent); border-radius: calc(var(--_radius) * 0.67); overflow: hidden; justify-self: start; }
.seg label { position: relative; cursor: pointer; }
.seg input { position: absolute; opacity: 0; inset: 0; margin: 0; }
.seg span { display: block; padding: 0.4rem 0.9rem; }
.seg input:checked + span { background: var(--_accent); color: var(--_ink, #fff); }
.seg input:focus-visible + span { outline: 3px solid var(--_accent); outline-offset: -3px; }
.waiting { margin-top: 1rem; display: flex; gap: 0.75rem; align-items: center; }
.avatar { width: 2.25rem; height: 2.25rem; border-radius: 50%; object-fit: cover; flex: none; }
.timeout { margin: 1rem 0 0; font-size: 0.875rem; opacity: 0.78; }
.legal { margin-top: 1rem; display: flex; gap: 1rem; font-size: 0.875rem; }
a { color: var(--_accent); }
footer { margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: flex-end; flex-wrap: wrap; }
button {
  font: inherit; font-weight: 600; min-height: 2.75rem; padding: 0 1.25rem; cursor: pointer;
  border-radius: calc(var(--_radius) * 0.67); border: 2px solid transparent;
}
button:disabled { opacity: 0.6; cursor: default; }
.decline { background: var(--_surface); color: var(--_text); border-color: color-mix(in srgb, var(--_text) 15%, transparent); }
.accept { background: var(--_accent); color: var(--_ink, #fff); }
.outline .accept { background: transparent; color: var(--_accent); border-color: var(--_accent); }
.pill button { border-radius: 999px; }
:focus-visible { outline: 3px solid var(--_accent); outline-offset: 2px; }
`;
