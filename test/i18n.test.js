'use strict';

// i18n: which language is picked, what happens when a key is missing, and plurals.
//
// The module reads Obsidian's language from localStorage, so these tests supply their own
// `window` before requiring it. The module is loaded fresh for each case because it
// resolves its dictionary once, at load — which is the behaviour worth pinning down.

const assert = require('assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Load src/i18n.js as if Obsidian had been set to `tag`.
function loadWith(tag) {
  global.window = { localStorage: { getItem: (k) => (k === 'language' ? tag : null) } };
  const file = path.join(ROOT, 'src', 'i18n.js');
  delete require.cache[require.resolve(file)];
  const mod = require(file);
  mod.initI18n();
  return mod;
}

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'i18n: language detection, fallback, plurals',
  run() {
    section('English by default', () => {
      const { t } = loadWith('en');
      assert.equal(t('cmd.toggle'), 'Toggle hover preview');
      assert.equal(t('settings.enabled.name'), 'Preview on hover');
    });

    section('Chinese when Obsidian is set to Chinese', () => {
      const { t } = loadWith('zh');
      assert.equal(t('cmd.toggle'), '切换悬停预览');
      assert.equal(t('settings.enabled.name'), '悬停时预览');
    });

    section('a regional tag falls back to its base language', () => {
      // Obsidian reports tags like `zh-CN` / `zh-TW`; neither is a locale file, so both
      // have to resolve to `zh` rather than to English.
      assert.equal(loadWith('zh-CN').t('cmd.toggle'), '切换悬停预览');
      assert.equal(loadWith('zh-TW').t('cmd.toggle'), '切换悬停预览');
      assert.equal(loadWith('en-GB').t('cmd.toggle'), 'Toggle hover preview');
    });

    section('an unknown language falls back to English', () => {
      assert.equal(loadWith('de').t('cmd.toggle'), 'Toggle hover preview');
      assert.equal(loadWith('').t('cmd.toggle'), 'Toggle hover preview');
      assert.equal(loadWith(null).t('cmd.toggle'), 'Toggle hover preview');
    });

    section('resolveLanguage picks the widest match that exists', () => {
      const { resolveLanguage } = loadWith('en');
      assert.equal(resolveLanguage('zh'), 'zh');
      assert.equal(resolveLanguage('zh-Hans'), 'zh');
      assert.equal(resolveLanguage('zh-Hant-TW'), 'zh');
      assert.equal(resolveLanguage('en-US'), 'en');
      assert.equal(resolveLanguage('fr'), 'en', 'not translated yet, so English');
      assert.equal(resolveLanguage(''), 'en');
    });

    section('placeholders are filled', () => {
      const { t } = loadWith('en');
      assert.equal(t('preview.error.nothingAtLine', { line: 18 }),
        'Nothing to show at line 18 — the file is missing, shorter, or not readable.');
      assert.equal(t('preview.error.fetch', { error: 'HTTP 404' }), 'Could not fetch: HTTP 404');

      const zh = loadWith('zh');
      assert.equal(zh.t('preview.error.nothingAtLine', { line: 18 }),
        '第 18 行没有可显示的内容 —— 文件不存在、行数不足或无法读取。');
    });

    section('an unknown placeholder is left visible, not blanked', () => {
      const { t } = loadWith('en');
      // A typo in a translation should show up rather than vanish silently.
      assert.match(t('preview.error.fetch', { wrong: 'x' }), /\{error\}/);
    });

    section('an unknown key returns the key itself', () => {
      const { t } = loadWith('en');
      assert.equal(t('no.such.key'), 'no.such.key');
    });

    section('a missing translation falls back to English', () => {
      const mod = loadWith('zh');
      // Every locale is allowed to be incomplete; the gaps must still render.
      const zh = require(path.join(ROOT, 'src', 'locales', 'zh.js'));
      const en = require(path.join(ROOT, 'src', 'locales', 'en.js'));
      for (const key of Object.keys(en)) {
        if (key in zh) continue;
        assert.equal(mod.t(key, { n: 1, line: 1, error: 'e', heading: 'h' }),
          loadWith('en').t(key, { n: 1, line: 1, error: 'e', heading: 'h' }),
          'a key missing from zh must render in English');
      }
    });

    section('plurals follow the locale', () => {
      const en = loadWith('en');
      assert.equal(en.plural('preview.note.truncated', 1), 'Showing the first block.');
      assert.equal(en.plural('preview.note.truncated', 3), 'Showing the first 3 blocks.');

      // Chinese has a single form; `other` must serve every count.
      const zh = loadWith('zh');
      assert.equal(zh.plural('preview.note.truncated', 1), '只显示前 1 个内容块。');
      assert.equal(zh.plural('preview.note.truncated', 5), '只显示前 5 个内容块。');
    });

    section('every locale defines the same keys as English, or fewer', () => {
      // A locale may lag English (that falls back), but it must never invent a key that
      // English does not have — that is a typo, and it would never be looked up.
      const en = require(path.join(ROOT, 'src', 'locales', 'en.js'));
      const { LOCALES } = loadWith('en');
      for (const [lang, dict] of Object.entries(LOCALES)) {
        for (const key of Object.keys(dict)) {
          assert.ok(key in en, lang + ' defines "' + key + '", which English does not have');
        }
      }
    });
  },
};
