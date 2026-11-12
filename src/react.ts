// @gaiadesk/consent/react: <GaiaDeskConsent open options bridge onDecision … />.
import { createElement, useEffect, useRef, type ReactElement } from 'react';
import { ConsentError } from './errors.js';
import type { GaiaDeskConsentElement } from './element.js';
import './index.js';
import type { AcceptedDetail, ConsentBridge, ConsentOptions, DeclinedDetail, Decision, ShownDetail } from './types.js';

export interface GaiaDeskConsentProps {
  /** true shows the dialog (again, each time it turns true); false takes it down without a decision. */
  open: boolean;
  options?: ConsentOptions;
  bridge: ConsentBridge;
  onShown?(detail: ShownDetail): void;
  onAccepted?(detail: AcceptedDetail): void;
  onDeclined?(detail: DeclinedDetail): void;
  /** The bridge's §2 decision: pass it on to start (`consent_token` / `consent_receipt`). */
  onDecision?(decision: Decision): void;
  /** A refusal (bad options, a bridge failure). Not called when `open` turns false. */
  onError?(error: ConsentError): void;
}

export function GaiaDeskConsent(props: GaiaDeskConsentProps): ReactElement {
  const ref = useRef<GaiaDeskConsentElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const el = ref.current!;
    const on = (type: string, cb: (p: GaiaDeskConsentProps, d: never) => void) => {
      const fn = (e: Event) => cb(latest.current, (e as CustomEvent).detail as never);
      el.addEventListener(type, fn);
      return () => el.removeEventListener(type, fn);
    };
    const off = [
      on('consent-shown', (p, d: ShownDetail) => p.onShown?.(d)),
      on('consent-accepted', (p, d: AcceptedDetail) => p.onAccepted?.(d)),
      on('consent-declined', (p, d: DeclinedDetail) => p.onDeclined?.(d)),
    ];
    return () => off.forEach((f) => f());
  }, []);

  useEffect(() => {
    if (!props.open) return;
    const el = ref.current!;
    let live = true;
    el.bridge = latest.current.bridge;
    el.open(latest.current.options).then(
      (d) => live && latest.current.onDecision?.(d),
      (e: ConsentError) => live && latest.current.onError?.(e),
    );
    return () => {
      live = false;
      el.close();
    };
  }, [props.open]);

  return createElement('gaiadesk-consent', { ref });
}
