// A tiny DOM for the element tests (happy-dom), installed as globals before
// the package is imported.
import { Window } from 'happy-dom';

export function installDom(languages: string[] = ['en-US']): Window {
  const w = new Window({ url: 'https://app.example/', settings: { navigator: { userAgent: 'Mozilla/5.0 (Macintosh)' } } });
  const g = globalThis as Record<string, unknown>;
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLImageElement', 'customElements', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'Node', 'location', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    Object.defineProperty(g, k, { value: (w as unknown as Record<string, unknown>)[k], configurable: true, writable: true });
  }
  Object.defineProperty(g, 'navigator', { value: { languages, language: languages[0], userAgent: 'Mozilla/5.0 (Macintosh)' }, configurable: true, writable: true });
  w.document.title = 'Acme App';
  return w;
}
