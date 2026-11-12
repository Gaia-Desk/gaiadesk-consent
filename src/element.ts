// <gaiadesk-consent>: §8's dialog in the app's own webview (§9).
import { ConsentError } from './errors.js';
import { defaultChoices, offerOf, validateOptions, type Offer } from './options.js';
import { STYLES } from './styles.js';
import { VERSION } from './version.js';
import { shownWording, type ViewState } from './view.js';
import { isRtl, resolveLocale, templatesFor } from './wording.js';
import type { Capture, ConsentBridge, ConsentOptions, Decision, PreviewFrame, WaitInfo, WordingKey } from './types.js';

export const TAG = 'gaiadesk-consent';

// Importable without a DOM (Node, SSR): the class only needs HTMLElement when constructed.
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

type Attrs = Record<string, string | boolean>;
function h(tag: string, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== false) el.setAttribute(k, v === true ? '' : v);
  el.append(...kids);
  return el;
}
// A text slot: shown with its key's string, hidden when the key is not shown.
const t = (tag: string, key: WordingKey, attrs: Attrs = {}) => h(tag, { ...attrs, 'data-k': key });

interface Open {
  o: ConsentOptions;
  offer: Offer;
  locale: string;
  version: string;
  templates: Record<WordingKey, string>;
  view: ViewState;
  previewOn: boolean;
  previewBusy: boolean;
  deciding: boolean;
  timer?: ReturnType<typeof setInterval>;
  dialog: HTMLElement;
  resolve(d: Decision): void;
  reject(e: ConsentError): void;
  prevFocus: Element | null;
}

const dark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160;
};

export class GaiaDeskConsentElement extends Base {
  /** Where decisions go (and previews / who's waiting come from). Set before `open()`. */
  bridge: ConsentBridge | null = null;
  #s: Open | null = null;

  get isOpen(): boolean {
    return this.#s !== null;
  }

  /** Shows the dialog; resolves with the bridge's §2 decision once the customer answers (or it times out). */
  open(options: ConsentOptions = {}): Promise<Decision> {
    try {
      if (this.#s) throw new ConsentError('already_open', 'the consent dialog is already open');
      const o = validateOptions(options);
      if (!this.bridge?.recordConsent) throw new ConsentError('no_bridge', 'set el.bridge (consentBridge from your GaiaDesk SDK, or webBridge()) before open()');
      return new Promise((resolve, reject) => this.#show(o, resolve, reject));
    } catch (e) {
      return Promise.reject(ConsentError.from(e));
    }
  }

  /** Takes the dialog down without a decision (nothing is recorded); `open()` rejects with `closed`. */
  close(): void {
    const s = this.#s;
    if (!s) return;
    this.#teardown();
    s.reject(new ConsentError('closed', 'the consent dialog was closed without a decision'));
  }

  disconnectedCallback(): void {
    this.close();
  }

  #show(o: ConsentOptions, resolve: (d: Decision) => void, reject: (e: ConsentError) => void) {
    const locale = resolveLocale(o.locale);
    const company = o.company ?? (document.title.trim() || location.hostname);
    const offer = offerOf(o);
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const dialog = this.#build(o);
    const s: Open = {
      o, offer, locale,
      version: o.wording_version ?? `gaiadesk-consent-${VERSION}-${locale}`,
      templates: templatesFor(locale, o.wording),
      view: { company, choices: defaultChoices(o), wait: null, preview: null, remaining: o.timeout_seconds ? o.timeout_seconds : null },
      previewOn: o.preview !== false && typeof this.bridge?.preview === 'function',
      previewBusy: false, deciding: false, dialog, resolve, reject,
      prevFocus: document.activeElement,
    };
    this.#s = s;
    dialog.dir = isRtl(locale) ? 'rtl' : 'ltr';
    dialog.lang = locale;
    const backdrop = h('div', { class: `backdrop ${o.theme?.appearance ?? 'auto'}` }, dialog);
    this.#theme(backdrop, o);
    // A click on the backdrop must not move focus out of the dialog.
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && e.preventDefault());
    root.replaceChildren(h('style', {}, STYLES), backdrop);
    this.#paint();
    s.timer = setInterval(() => this.#tick(s), 1000);
    if (s.previewOn) this.#refreshPreview(s);
    this.bridge?.waitInfo?.().then((w) => this.#gotWait(s, w), () => {});
    this.#emit('consent-shown', { locale, wording_version: s.version });
    (dialog.querySelector('.accept') as HTMLElement).focus();
  }

  #build(o: ConsentOptions): HTMLElement {
    const logo = o.logo_png_base64 ? h('img', { class: 'logo', alt: '', src: `data:image/png;base64,${o.logo_png_base64.trim()}` }) : '';
    const check = (key: WordingKey, name: string) =>
      h('label', { class: 'check', 'data-show': key }, h('input', { type: 'checkbox', name }), t('span', key));
    const seg = (value: Capture, key: WordingKey) => h('label', {}, h('input', { type: 'radio', name: 'capture', value }), t('span', key));
    const offer = offerOf(o);
    const dialog = h('div', { class: `dialog ${o.theme?.button_style ?? 'filled'}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gd-title', 'aria-describedby': 'gd-intro gd-list' },
      h('header', {}, logo, h('div', {}, t('h2', 'title', { id: 'gd-title' }), t('p', 'intro', { id: 'gd-intro', class: 'intro' }))),
      h('ul', { id: 'gd-list' }, ...(['sees_window', 'sees_app', 'sees_screen', 'view_only', 'guided', 'masked', 'stop'] as WordingKey[]).map((k) => t('li', k))),
      h('section', { class: 'preview', 'data-show': 'preview_label' }, t('div', 'preview_label'), h('img', { alt: '' }), t('p', 'preview_hidden', { class: 'muted', 'aria-live': 'polite' })),
      h('div', { class: 'choices' }, check('allow_control', 'guided'), check('share_logs', 'share_logs'),
        h('div', { class: 'seg', role: 'radiogroup', 'data-show': 'capture_window' }, seg(offer.base, 'capture_window'), seg('screen', 'capture_screen'))),
      h('div', { class: 'waiting', 'data-show': 'waiting_team' }, h('img', { class: 'avatar', alt: '', hidden: true }), h('div', {}, t('div', 'waiting_team'), t('div', 'waiting_eta', { class: 'muted' }))),
      t('p', 'timeout_note', { class: 'timeout', 'aria-live': 'polite' }),
      h('nav', { class: 'legal' }, o.privacy_url ? t('a', 'privacy', { href: o.privacy_url, target: '_blank', rel: 'noopener noreferrer' }) : '',
        o.terms_url ? t('a', 'terms', { href: o.terms_url, target: '_blank', rel: 'noopener noreferrer' }) : ''),
      h('footer', {}, t('button', 'decline', { type: 'button', class: 'decline' }), t('button', 'accept', { type: 'button', class: 'accept' })),
    );
    dialog.querySelector('.accept')!.addEventListener('click', () => this.#decide('accepted'));
    dialog.querySelector('.decline')!.addEventListener('click', () => this.#decide('declined'));
    dialog.addEventListener('change', (e) => this.#changed(e.target as HTMLInputElement));
    dialog.addEventListener('keydown', (e) => this.#key(e as KeyboardEvent));
    return dialog;
  }

  #theme(backdrop: HTMLElement, o: ConsentOptions) {
    const th = o.theme ?? {};
    const accent = th.accent ?? o.brand_color;
    const set = (k: string, v: string | undefined) => v !== undefined && backdrop.style.setProperty(k, v);
    set('--gd-bg', th.background);
    set('--gd-surface', th.surface);
    set('--gd-text', th.text);
    set('--gd-accent', accent);
    set('--gd-radius', th.radius === undefined ? undefined : `${th.radius}px`);
    set('--gd-font', th.font_family && `"${th.font_family}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`);
    set('--_ink', accent && (dark(accent) ? '#111111' : '#ffffff'));
  }

  // Every visible string from the one shown-wording map.
  #paint() {
    const s = this.#s!;
    const shown = shownWording(s.o, s.offer, s.templates, s.view);
    for (const el of s.dialog.querySelectorAll<HTMLElement>('[data-k]')) {
      const k = el.dataset.k!;
      el.hidden = !(k in shown);
      el.textContent = shown[k] ?? '';
    }
    for (const el of s.dialog.querySelectorAll<HTMLElement>('[data-show]')) el.hidden = !(el.dataset.show! in shown);
    const legal = s.dialog.querySelector<HTMLElement>('.legal')!;
    legal.hidden = !('privacy' in shown || 'terms' in shown);
    const choices = s.dialog.querySelector<HTMLElement>('.choices')!;
    choices.hidden = !(s.offer.guided || s.offer.logs || s.offer.capture);
    const c = s.view.choices;
    const input = (sel: string) => s.dialog.querySelector<HTMLInputElement>(sel)!;
    input('input[name=guided]').checked = c.guided;
    input('input[name=share_logs]').checked = c.share_logs;
    input('input[value=screen]').checked = c.capture === 'screen';
    input(`input[value=${s.offer.base}]`).checked = c.capture !== 'screen';
    const img = s.dialog.querySelector<HTMLImageElement>('.preview img')!;
    img.alt = shown.preview_label ?? '';
    return shown;
  }

  #changed(el: HTMLInputElement) {
    const s = this.#s;
    if (!s || s.deciding) return;
    if (el.name === 'guided') s.view.choices.guided = el.checked;
    else if (el.name === 'share_logs') s.view.choices.share_logs = el.checked;
    else if (el.name === 'capture' && el.checked) {
      s.view.choices.capture = el.value as Capture;
      if (s.previewOn) this.#refreshPreview(s);
    }
    this.#paint();
  }

  #key(e: KeyboardEvent) {
    const s = this.#s;
    if (!s) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.#decide('declined');
    } else if (e.key === 'Enter') {
      // Buttons and links keep their own Enter; anywhere else Enter accepts (§8).
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault();
      this.#decide('accepted');
    } else if (e.key === 'Tab') {
      const f = Array.from(s.dialog.querySelectorAll<HTMLInputElement>('button, input, a[href]')).filter(
        (el) => !el.disabled && !el.closest('[hidden]') && !(el.type === 'radio' && !el.checked),
      );
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(this.shadowRoot!.activeElement as HTMLInputElement);
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i < 0 || i === f.length - 1 ? 0 : i + 1;
      f[n].focus();
    }
  }

  #tick(s: Open) {
    if (this.#s !== s || s.deciding) return;
    if (s.view.remaining != null && --s.view.remaining <= 0) return void this.#decide('timeout');
    if (s.previewOn) this.#refreshPreview(s);
    this.#paint();
  }

  #refreshPreview(s: Open) {
    if (s.previewBusy) return;
    s.previewBusy = true;
    const req = { capture: s.view.choices.capture, ...(s.o.parent_window !== undefined && { parent_window: s.o.parent_window }) };
    this.bridge!.preview!(req).then(
      (f) => this.#gotPreview(s, f && typeof f.png_base64 === 'string' ? f : null),
      (e) => {
        if (ConsentError.from(e).code === 'capture_unavailable') s.previewOn = false;
        this.#gotPreview(s, null);
      },
    ).finally(() => (s.previewBusy = false));
  }

  #gotPreview(s: Open, f: PreviewFrame | null) {
    if (this.#s !== s || s.deciding) return;
    s.view.preview = f && { ...f, masked_count: Number.isInteger(f.masked_count) && f.masked_count > 0 ? f.masked_count : 0 };
    const img = s.dialog.querySelector<HTMLImageElement>('.preview img')!;
    if (f) {
      img.src = `data:image/png;base64,${f.png_base64}`;
      img.width = f.width;
      img.height = f.height;
    }
    this.#paint();
  }

  #gotWait(s: Open, w: WaitInfo | null) {
    if (this.#s !== s || s.deciding || !w || typeof w.team_name !== 'string' || !w.team_name) return;
    s.view.wait = { team_name: w.team_name, team_avatar_url: w.team_avatar_url ?? null, estimated_wait_seconds: typeof w.estimated_wait_seconds === 'number' ? w.estimated_wait_seconds : null };
    const av = s.dialog.querySelector<HTMLImageElement>('.avatar')!;
    if (typeof w.team_avatar_url === 'string' && w.team_avatar_url.startsWith('https://')) {
      av.src = w.team_avatar_url;
      av.hidden = false;
    }
    this.#paint();
  }

  async #decide(decision: 'accepted' | 'declined' | 'timeout') {
    const s = this.#s;
    if (!s || s.deciding) return;
    const wording = this.#paint();
    s.deciding = true;
    clearInterval(s.timer);
    for (const b of s.dialog.querySelectorAll<HTMLButtonElement>('button, input')) b.disabled = true;
    const choices = { ...s.view.choices };
    if (decision === 'accepted') this.#emit('consent-accepted', { choices });
    else this.#emit('consent-declined', { reason: decision === 'timeout' ? 'timeout' : 'declined' });
    try {
      const d = await this.bridge!.recordConsent({
        decision, choices, wording, wording_version: s.version, locale: s.locale,
        company: s.view.company, capture: choices.capture, app_version: s.o.app_version ?? null,
      });
      if (this.#s !== s) return;
      this.#teardown();
      s.resolve(d);
    } catch (e) {
      if (this.#s !== s) return;
      this.#teardown();
      s.reject(ConsentError.from(e));
    }
  }

  #teardown() {
    const s = this.#s!;
    clearInterval(s.timer);
    this.#s = null;
    this.shadowRoot?.replaceChildren();
    if (s.prevFocus instanceof HTMLElement && s.prevFocus.isConnected) s.prevFocus.focus();
  }

  #emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/** Registers `<gaiadesk-consent>` (once; a no-op without a DOM). */
export function defineConsentElement(): void {
  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, GaiaDeskConsentElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'gaiadesk-consent': GaiaDeskConsentElement;
  }
}
