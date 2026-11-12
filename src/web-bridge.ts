// A bridge with server calls only: who is waiting (§5) and the receipt (§6).
// No preview (only the native library can capture), no consent_token, and
// the receipt is built here, in the page: `os_user` is null and nothing but
// the page vouches for `at` and the hash. Use the Tauri / Electron bridges
// where you have them.
import { ConsentError } from './errors.js';
import { VERSION } from './version.js';
import { wordingSha256 } from './wording.js';
import type { ConsentBridge, ConsentReceipt, Decision, RecordConsentInput, WaitInfo } from './types.js';

export interface WebBridgeOptions {
  /** e.g. `https://api.gaiadesk.net` (http only for localhost). */
  server: string;
  /** The session's embed token (`gdemb_…`). */
  embedToken: string;
  /** The session's id (`ss_…`), from the same create call as the token. */
  sessionId: string;
  /** Into the receipt's `app_name`. Default: the page's host name. */
  appName?: string;
  fetch?: typeof fetch;
}

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
/** `cr_` and 26 random base-32 characters. */
export function receiptId(): string {
  const b = crypto.getRandomValues(new Uint8Array(26));
  return 'cr_' + Array.from(b, (x) => CROCKFORD[x & 31]).join('');
}

function osName(): string | null {
  const n = globalThis.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  const p = `${n?.userAgentData?.platform ?? ''} ${n?.userAgent ?? ''}`.toLowerCase();
  if (/iphone|ipad|ios/.test(p)) return 'ios';
  if (/android/.test(p)) return 'android';
  if (/mac/.test(p)) return 'macos';
  if (/win/.test(p)) return 'windows';
  if (/linux|x11|cros/.test(p)) return 'linux';
  return null;
}

export function webBridge(opts: WebBridgeOptions): ConsentBridge {
  let base: URL;
  try {
    base = new URL(opts.server);
  } catch {
    throw new ConsentError('bad_config', `server must be a URL (not ${JSON.stringify(opts.server)})`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) throw new ConsentError('bad_config', 'server must be https://');
  if (!/^gdemb_/.test(opts.embedToken ?? '')) throw new ConsentError('bad_config', 'embedToken must be the session\'s embed token (gdemb_…)');
  if (typeof opts.sessionId !== 'string' || !opts.sessionId) throw new ConsentError('bad_config', 'sessionId is required');
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const url = (path: string) => new URL(`v1/support/sessions/${encodeURIComponent(opts.sessionId)}/${path}`, base.href.replace(/\/?$/, '/')).href;
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await f(url(path), { ...init, headers: { authorization: `Bearer ${opts.embedToken}`, ...(init.headers as Record<string, string>) } });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new ConsentError(body?.error?.reason ?? `http_${r.status}`, body?.error?.message ?? `HTTP ${r.status}`);
    return body;
  };

  return {
    waitInfo: () => call('wait') as Promise<WaitInfo>,
    async recordConsent(input: RecordConsentInput): Promise<Decision> {
      const receipt: ConsentReceipt = {
        id: receiptId(),
        decision: input.decision,
        at: new Date().toISOString(),
        surface: 'embedded',
        locale: input.locale,
        wording_version: input.wording_version,
        wording_sha256: await wordingSha256(input.wording),
        choices: input.choices,
        os_user: null,
        os: osName(),
        app_name: opts.appName ?? (globalThis.location?.hostname || null),
        app_version: input.app_version,
        sdk: `gaiadesk-consent/${VERSION}`,
      };
      await call('consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': receipt.id },
        body: JSON.stringify(receipt),
      });
      return { decision: input.decision, choices: input.choices, receipt };
    },
  };
}
