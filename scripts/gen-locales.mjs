// locales.json (the single source, byte-identical to libgaiadesk_embed's
// embed/consent/locales.json) -> src/locales.generated.ts, so the build
// needs no JSON import attributes. `npm test` checks the two agree.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const json = JSON.parse(readFileSync(new URL('locales.json', root), 'utf8'));
const ts = `// Generated from locales.json by scripts/gen-locales.mjs. Do not edit.\n\nexport const LOCALES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(json, null, 2)};\n`;
writeFileSync(new URL('src/locales.generated.ts', root), ts);
