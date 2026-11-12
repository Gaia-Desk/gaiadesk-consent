// §1: the options, checked as strictly as the library checks them (unknown
// keys refused), so what works here works in the native dialog. Pure.
import { ConsentError } from './errors.js';
import { WORDING_KEYS } from './wording.js';
import type { Capture, Choices, ConsentOptions } from './types.js';

const LOGO_MAX_BYTES = 256 * 1024;
type Check = (v: unknown, path: string) => void;

const bad = (path: string, want: string, v: unknown): never => {
  throw new ConsentError('bad_config', `${path} must be ${want} (not ${JSON.stringify(v) ?? String(v)})`);
};
const str: Check = (v, p) => { if (typeof v !== 'string') bad(p, 'a string', v); };
const bool: Check = (v, p) => { if (typeof v !== 'boolean') bad(p, 'true or false', v); };
const oneOf = (...xs: string[]): Check => (v, p) => { if (!xs.includes(v as string)) bad(p, xs.map((x) => `"${x}"`).join(' | '), v); };
const color: Check = (v, p) => { if (typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v)) bad(p, '"#RRGGBB"', v); };
const int = (min: number, max: number): Check => (v, p) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(p, `an integer ${min}..${max}`, v);
};
const https: Check = (v, p) => {
  let u: URL | undefined;
  try { u = new URL(v as string); } catch { /* refused below */ }
  if (typeof v !== 'string' || u?.protocol !== 'https:') bad(p, 'an https:// URL', v);
};
const locale: Check = (v, p) => {
  if (v !== 'auto' && (typeof v !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(v))) bad(p, '"auto" or a BCP-47 tag', v);
};
// A family name only: it goes into CSS.
const font: Check = (v, p) => { if (typeof v !== 'string' || !/^[\p{L}\p{N} _.-]{1,64}$/u.test(v)) bad(p, 'a font family name', v); };
const logo: Check = (v, p) => {
  if (typeof v !== 'string') return bad(p, 'base64 of a PNG', v);
  const b64 = v.trim();
  if (b64.length > (LOGO_MAX_BYTES / 3) * 4 + 4) bad(p, `at most ${LOGO_MAX_BYTES / 1024} KiB decoded`, '…');
  let head = '';
  try { head = atob(b64.slice(0, 12)); } catch { /* refused below */ }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || head.slice(0, 8) !== '\x89PNG\r\n\x1a\n') bad(p, 'base64 of a PNG', '…');
};
const num: Check = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) bad(p, 'a number', v); };
const rects: Check = (v, p) => {
  if (!Array.isArray(v)) return bad(p, 'a list of {x, y, w, h}', v);
  v.forEach((r, i) => {
    object({ x: num, y: num, w: num, h: num })(r, `${p}[${i}]`);
    // Every side is required, as the library's serde shape requires it.
    for (const k of ['x', 'y', 'w', 'h']) if ((r as Record<string, unknown>)[k] === undefined) num(undefined, `${p}[${i}].${k}`);
  });
};
const object = (shape: Record<string, Check>): Check => (v, p) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(p, 'an object', v);
  for (const [k, x] of Object.entries(v)) {
    const c = shape[k];
    if (!c) throw new ConsentError('bad_config', `unknown key ${JSON.stringify(k)} in ${p}`);
    if (x !== undefined) c(x, `${p}.${k}`);
  }
};

const OPTIONS = object({
  company: str,
  capture: oneOf('window', 'app', 'screen'),
  guided: bool,
  masked: bool,
  brand_color: color,
  logo_png_base64: logo,
  parent_window: int(0, Number.MAX_SAFE_INTEGER),
  theme: object({
    appearance: oneOf('light', 'dark', 'auto'),
    background: color, surface: color, text: color, accent: color,
    radius: int(0, 24),
    font_family: font,
    button_style: oneOf('filled', 'outline', 'pill'),
  }),
  locale,
  wording: object(Object.fromEntries(WORDING_KEYS.map((k) => [k, str]))),
  wording_version: str,
  choices: object({ offer_guided: bool, offer_logs: bool, offer_capture: bool }),
  privacy_url: https,
  terms_url: https,
  timeout_seconds: int(0, 86_400),
  preview: bool,
  server: str,
  embed_token: str,
  app_version: str,
  // The library's (§1): passed through to the bridge.
  session_id: str,
  window_id: int(0, Number.MAX_SAFE_INTEGER),
  masks: rects,
});

/** Throws `ConsentError('bad_config')` on anything the library would refuse. */
export function validateOptions(o: unknown): ConsentOptions {
  OPTIONS(o ?? {}, 'options');
  return (o ?? {}) as ConsentOptions;
}

/** What the dialog offers, and the choices it starts with. */
export interface Offer {
  guided: boolean;
  logs: boolean;
  capture: boolean;
  /** The non-screen side of the window/screen control: the app's own `capture` when it is `app`. */
  base: Exclude<Capture, 'screen'>;
}

export function offerOf(o: ConsentOptions): Offer {
  const c = o.choices ?? {};
  return {
    guided: o.guided === true && c.offer_guided !== false,
    logs: c.offer_logs === true,
    capture: c.offer_capture === true,
    base: o.capture === 'app' ? 'app' : 'window',
  };
}

/** The choices before the customer touches anything: what the app asked for, logs off. */
export function defaultChoices(o: ConsentOptions): Choices {
  return { guided: o.guided === true, share_logs: false, capture: o.capture ?? 'window' };
}
