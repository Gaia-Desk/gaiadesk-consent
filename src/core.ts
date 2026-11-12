// The pure core: no DOM, usable in Node (validation, locales, wording, the hash).
export { ConsentError } from './errors.js';
export { validateOptions, offerOf, defaultChoices, type Offer } from './options.js';
export { LOCALES, WORDING_KEYS, PLACEHOLDERS, matchLocale, resolveLocale, isRtl, templatesFor, fill, canonicalJson, wordingSha256, sha256Hex } from './wording.js';
export { shownWording, type ViewState } from './view.js';
export { VERSION } from './version.js';
export type * from './types.js';
