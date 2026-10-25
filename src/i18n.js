'use strict';

// Interface strings, in the language Obsidian is set to.
//
// Adding a language is one file in src/locales/ plus one entry in LOCALES below; nothing
// else in the plugin names a language. A key missing from a translation falls back to
// English, so a partly translated locale shows English for the gaps rather than blank
// text — a half-finished translation is still useful.

const LOCALES = {
  en: require('./locales/en'),
  zh: require('./locales/zh'),
};

const FALLBACK = 'en';

// Resolved once at load: the language tag, its dictionary, and the plural rules for it.
let language = FALLBACK;
let dict = LOCALES[FALLBACK];
let pluralRules = null;

// Obsidian keeps its language in localStorage under `language`, as a tag like `zh`,
// `zh-CN` or `en-GB`. Matching is widest-first: the full tag, then its base language,
// then the fallback. That way `zh-TW` finds `zh` without every locale having to list
// every regional variant.
function resolveLanguage(tag) {
  const lower = String(tag || '').toLowerCase();
  if (!lower) return FALLBACK;
  if (LOCALES[lower]) return lower;
  const base = lower.split('-')[0];
  return LOCALES[base] ? base : FALLBACK;
}

function detectLanguage() {
  let tag = '';
  try {
    tag = window.localStorage.getItem('language') || '';
  } catch {
    // No localStorage (a test process, or a locked-down window): fall back.
    tag = '';
  }
  return resolveLanguage(tag);
}

function initI18n() {
  language = detectLanguage();
  dict = LOCALES[language] || LOCALES[FALLBACK];
  try {
    pluralRules = new Intl.PluralRules(language);
  } catch {
    pluralRules = new Intl.PluralRules(FALLBACK);
  }
  return dict;
}

// `{name}` placeholders are replaced; an unknown one is left alone rather than blanked,
// so a typo in a translation is visible instead of silent.
function interpolate(str, vars) {
  if (!vars) return String(str);
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function lookup(key) {
  const own = dict[key];
  if (own !== undefined) return own;
  return LOCALES[FALLBACK][key];
}

// One string. `vars` fills its `{placeholders}`.
function t(key, vars) {
  const entry = lookup(key);
  if (entry === undefined) return key;
  return interpolate(entry, vars);
}

// A string that changes with a count. The locale supplies its own plural forms — English
// needs `one`/`other`, Chinese needs only `other`, Russian would need `few`/`many` — and
// anything absent falls back to `other`, then to the first form present.
function plural(key, n, vars) {
  const entry = lookup(key);
  if (entry === undefined) return key;
  if (typeof entry !== 'object' || entry === null) return interpolate(entry, Object.assign({ n }, vars));

  const merged = Object.assign({ n }, vars);
  if (!pluralRules) return interpolate(entry.other != null ? entry.other : Object.values(entry)[0], merged);

  let category;
  try {
    category = pluralRules.select(n);
  } catch {
    category = 'other';
  }
  const tpl = entry[category] != null
    ? entry[category]
    : entry.other != null
      ? entry.other
      : Object.values(entry)[0];
  return interpolate(tpl, merged);
}

// detectLanguage and FALLBACK stay module-internal: initI18n is their only consumer.
// Test seam: `resolveLanguage` and `LOCALES` are consumed only by test/.
module.exports = { initI18n, t, plural, resolveLanguage, LOCALES };
