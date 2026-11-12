// §3: locales, placeholders and the wording hash. Pure (no DOM).
import { LOCALES } from './locales.generated.js';
import type { WordingKey } from './types.js';

export { LOCALES };

export const WORDING_KEYS: readonly WordingKey[] = [
  'title', 'intro', 'sees_window', 'sees_app', 'sees_screen', 'view_only', 'guided', 'masked', 'stop',
  'allow_control', 'share_logs', 'capture_window', 'capture_screen', 'waiting_team', 'waiting_eta',
  'preview_label', 'preview_hidden', 'privacy', 'terms', 'timeout_note', 'accept', 'decline',
];

export const PLACEHOLDERS = ['company', 'team', 'minutes', 'count'] as const;
export type Vars = Partial<Record<(typeof PLACEHOLDERS)[number], string | number>>;

/** A tag to one of ours: exact (any case), then by language, else null. */
export function matchLocale(tag: string): string | null {
  const keys = Object.keys(LOCALES);
  const t = tag.toLowerCase();
  const lang = t.split('-')[0];
  return keys.find((k) => k.toLowerCase() === t) ?? keys.find((k) => k.split('-')[0].toLowerCase() === lang) ?? null;
}

function navigatorLanguages(): readonly string[] {
  const n = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
  return n?.languages?.length ? n.languages : n?.language ? [n.language] : [];
}

/** `"auto"` walks `languages` (default `navigator.languages`) in order; anything unmatched is `en`. */
export function resolveLocale(locale = 'auto', languages: readonly string[] = navigatorLanguages()): string {
  for (const t of locale === 'auto' ? languages : [locale]) {
    const m = matchLocale(t);
    if (m) return m;
  }
  return 'en';
}

const RTL = new Set(['ar', 'he', 'fa', 'ur']);
export const isRtl = (locale: string): boolean => RTL.has(locale.split('-')[0].toLowerCase());

/** The templates for a locale, with the app's overrides on top. */
export function templatesFor(locale: string, overrides: Partial<Record<WordingKey, string>> = {}): Record<WordingKey, string> {
  return { ...(LOCALES[locale] ?? LOCALES.en), ...overrides } as Record<WordingKey, string>;
}

/** `{company}` etc. filled in; a placeholder with no value is left as written. */
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(company|team|minutes|count)\}/g, (m, k: keyof Vars) => (vars[k] === undefined ? m : String(vars[k])));
}

/** Sorted keys, no whitespace: the exact bytes the hash covers. */
export function canonicalJson(shown: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(shown).sort().map((k) => [k, shown[k]])));
}

/** §3's wording hash: SHA-256 hex of the canonical JSON (UTF-8). WebCrypto when present, else pure. */
export async function wordingSha256(shown: Record<string, string>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(shown));
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return sha256Hex(bytes);
  return hex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
}

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// SHA-256's constants: the fractional parts of the first primes' square and cube roots.
const PRIMES: number[] = [];
for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((p) => n % p)) PRIMES.push(n);
const frac = (x: number): number => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
const K = PRIMES.map((p) => frac(Math.cbrt(p)));
const H0 = PRIMES.slice(0, 8).map((p) => frac(Math.sqrt(p)));

/** Pure SHA-256 (FIPS 180-4), for runtimes without WebCrypto. */
export function sha256Hex(bytes: Uint8Array): string {
  const len = bytes.length;
  const n = (((len + 8) >> 6) + 1) << 6;
  const m = new Uint8Array(n);
  m.set(bytes);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 8, Math.floor(len / 2 ** 29));
  dv.setUint32(n - 4, (len * 8) >>> 0);
  const h = H0.slice();
  const w = new Array<number>(64);
  const rotr = (x: number, r: number) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < n; o += 64) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) w[t] = dv.getUint32(o + t * 4);
      else {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = (h[i] + x) | 0));
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
