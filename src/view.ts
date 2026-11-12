// What the dialog shows for a given state: one function drives both the
// render and the receipt's wording, so the hash covers exactly what was on
// screen. Pure.
import { fill, type Vars } from './wording.js';
import type { Offer } from './options.js';
import type { Choices, ConsentOptions, PreviewFrame, WaitInfo, WordingKey } from './types.js';

export interface ViewState {
  company: string;
  choices: Choices;
  wait: WaitInfo | null;
  preview: PreviewFrame | null;
  /** Seconds left before auto-decline, or null without a timeout. */
  remaining: number | null;
}

/** The shown strings (key → final text) for this state; keys not shown are absent. */
export function shownWording(o: ConsentOptions, offer: Offer, templates: Record<WordingKey, string>, s: ViewState): Record<string, string> {
  const vars: Vars = { company: s.company, team: s.wait?.team_name, count: s.preview?.masked_count };
  const out: Record<string, string> = {};
  const put = (k: WordingKey, extra: Vars = {}) => (out[k] = fill(templates[k], { ...vars, ...extra }));
  put('title');
  put('intro');
  put(`sees_${s.choices.capture}`);
  put(s.choices.guided ? 'guided' : 'view_only');
  if (o.masked) put('masked');
  put('stop');
  if (offer.guided) put('allow_control');
  if (offer.logs) put('share_logs');
  if (offer.capture) (put('capture_window'), put('capture_screen'));
  if (s.wait) {
    put('waiting_team');
    const eta = s.wait.estimated_wait_seconds;
    if (eta != null) put('waiting_eta', { minutes: Math.max(1, Math.round(eta / 60)) });
  }
  if (s.preview) {
    put('preview_label');
    if (s.preview.masked_count > 0) put('preview_hidden');
  }
  if (o.privacy_url) put('privacy');
  if (o.terms_url) put('terms');
  if (s.remaining != null) put('timeout_note', { minutes: Math.max(1, Math.ceil(s.remaining / 60)) });
  put('accept');
  put('decline');
  return out;
}
