/** What is shared: this window, every window of this app, or the whole screen. */
export type Capture = 'window' | 'app' | 'screen';

/** The §3 wording keys. */
export type WordingKey =
  | 'title' | 'intro' | 'sees_window' | 'sees_app' | 'sees_screen' | 'view_only' | 'guided' | 'masked' | 'stop'
  | 'allow_control' | 'share_logs' | 'capture_window' | 'capture_screen' | 'waiting_team' | 'waiting_eta'
  | 'preview_label' | 'preview_hidden' | 'privacy' | 'terms' | 'timeout_note' | 'accept' | 'decline';

export interface ConsentTheme {
  appearance?: 'light' | 'dark' | 'auto';
  /** `#RRGGBB` */
  background?: string;
  surface?: string;
  text?: string;
  accent?: string;
  /** px, 0..24 */
  radius?: number;
  /** A family name; falls back to the system UI font. */
  font_family?: string;
  button_style?: 'filled' | 'outline' | 'pill';
}

/** The consent options (one JSON object, the same the native dialog takes). Every key optional. */
export interface ConsentOptions {
  company?: string;
  capture?: Capture;
  guided?: boolean;
  masked?: boolean;
  brand_color?: string;
  logo_png_base64?: string;
  /** Native only (passed through to the bridge's preview). */
  parent_window?: number;
  theme?: ConsentTheme;
  /** `"auto"` (navigator.languages) or a BCP-47 tag. */
  locale?: string;
  wording?: Partial<Record<WordingKey, string>>;
  wording_version?: string;
  choices?: { offer_guided?: boolean; offer_logs?: boolean; offer_capture?: boolean };
  privacy_url?: string;
  terms_url?: string;
  /** 0 = never; else auto-decline with decision `"timeout"`. */
  timeout_seconds?: number;
  preview?: boolean;
  /** Read by the library's own dialog; the web component ignores them (use a bridge). */
  server?: string;
  embed_token?: string;
  app_version?: string;
  /** The support session (`ss_…`); the native dialog needs it to post the receipt and show who is waiting. */
  session_id?: string;
  /** As `start`: what the preview captures and blacks out. */
  window_id?: number;
  masks?: Rect[];
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface Choices {
  guided: boolean;
  share_logs: boolean;
  capture: Capture;
}

export interface ConsentReceipt {
  id: string;
  decision: 'accepted' | 'declined' | 'timeout';
  at: string;
  surface: 'native_dialog' | 'embedded';
  locale: string;
  wording_version: string;
  wording_sha256: string;
  choices: Choices;
  os_user: string | null;
  os: string | null;
  app_name: string | null;
  app_version: string | null;
  sdk: string;
}

/** §2: what `open()` resolves with (the bridge's answer). */
export interface Decision {
  decision: 'accepted' | 'declined' | 'timeout' | 'unavailable';
  choices?: Choices;
  /** accepted only, when the bridge is the library: for start's `consent_token`. */
  consent_token?: string;
  receipt?: ConsentReceipt;
}

/** What the component hands the bridge on a decision (`gd_embed_record_consent_ex`'s input). */
export interface RecordConsentInput {
  decision: 'accepted' | 'declined' | 'timeout';
  choices: Choices;
  /** The strings actually shown, after overrides and placeholders. */
  wording: Record<string, string>;
  wording_version: string;
  locale: string;
  company: string;
  /** The capture consented to (the customer's choice). */
  capture: Capture;
  app_version: string | null;
}

export interface PreviewRequest {
  capture: Capture;
  parent_window?: number;
  window_id?: number;
  masks?: Rect[];
}

export interface PreviewFrame {
  png_base64: string;
  width: number;
  height: number;
  masked_count: number;
}

export interface WaitInfo {
  team_name: string;
  team_avatar_url: string | null;
  estimated_wait_seconds: number | null;
}

/**
 * The component's link to whoever records the decision. The Tauri plugin
 * (`@gaiadesk/tauri-plugin-support`) and Electron (`@gaiadesk/embed-native`)
 * export one as `consentBridge`; `webBridge()` is the server-only one.
 */
export interface ConsentBridge {
  /** One frame of what support would see; `null` (or a `capture_unavailable` rejection) hides the preview. */
  preview?(opts: PreviewRequest): Promise<PreviewFrame | null>;
  /** Who is waiting; `null` or a rejection shows nothing. */
  waitInfo?(): Promise<WaitInfo | null>;
  recordConsent(input: RecordConsentInput): Promise<Decision>;
}

/** DOM event details (§7). */
export interface ShownDetail { locale: string; wording_version: string }
export interface AcceptedDetail { choices: Choices }
export interface DeclinedDetail { reason: 'declined' | 'timeout' }
