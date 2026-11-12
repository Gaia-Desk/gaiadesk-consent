import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOCALES, WORDING_KEYS, VERSION } from '../dist/core.js';

const root = new URL('../', import.meta.url);
const json = JSON.parse(readFileSync(new URL('locales.json', root), 'utf8')) as Record<string, Record<string, string>>;
const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(' ');

test('the shipped locales are §3\'s list, each with every key and no others', () => {
  for (const tag of ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'tr', 'ru', 'ja', 'ko', 'zh-Hans', 'ar']) assert.ok(json[tag], tag);
  for (const [tag, strings] of Object.entries(json)) {
    assert.deepEqual(Object.keys(strings).sort(), [...WORDING_KEYS].sort(), tag);
    for (const k of WORDING_KEYS) assert.ok(strings[k].trim().length > 0, `${tag}.${k} is empty`);
  }
});

test('every translation keeps exactly en\'s placeholders', () => {
  for (const [tag, strings] of Object.entries(json)) {
    for (const k of WORDING_KEYS) assert.equal(placeholders(strings[k]), placeholders(json.en[k]), `${tag}.${k}: ${strings[k]}`);
  }
});

test('the built locales are locales.json (run `npm run gen` after editing it)', () => {
  assert.deepEqual(LOCALES, json);
});

test('VERSION is package.json\'s', () => {
  assert.equal(VERSION, JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version);
});
