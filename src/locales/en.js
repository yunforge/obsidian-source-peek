'use strict';

// English — the source of truth. Every other locale falls back to these keys, so a key
// added here is immediately usable everywhere, in English, until it is translated.

module.exports = {
  // The command and its notice.
  'cmd.toggle': 'Toggle hover preview',
  'notice.on': 'Hover preview on',
  'notice.off': 'Hover preview off',

  // The preview panel.
  'preview.error.fetch': 'Could not fetch: {error}',
  'preview.error.noPath': 'No path to read',
  'preview.error.nothingAtLine': 'Nothing to show at line {line} — the file is missing, shorter, or not readable.',
  'preview.error.load': 'Could not load: {error}',
  'preview.note.headingMiss': 'This page has no heading “{heading}”.',
  'preview.note.empty': 'Nothing readable on that page.',
  'preview.note.truncated': { one: 'Showing the first block.', other: 'Showing the first {n} blocks.' },
  'preview.note.truncatedLines': { one: 'Showing the first line.', other: 'Showing the first {n} lines.' },

  // Settings.
  'settings.enabled.name': 'Preview on hover',
  'settings.enabled.desc': 'Rest the pointer on a link to preview what it points at.',
  'settings.modifier.name': 'Show preview while holding',
  'settings.modifier.desc': 'The key a hover waits for. Ctrl matches Obsidian\'s own page preview. Choose a plain hover to preview without pressing anything.',
  'settings.modifier.ctrl': 'Ctrl',
  'settings.modifier.shift': 'Shift',
  'settings.modifier.alt': 'Alt',
  'settings.modifier.none': 'A plain hover',
  'settings.modifier.custom': 'Custom…',
  'settings.modifier.customDesc': 'Which keys, together, a hover waits for.',
  'settings.modifier.customEmptyHint': 'Every key is switched off, so the preview waits for Ctrl (the default) — switch one on, or choose a plain hover.',
  'settings.modifier.noneHint': 'A preview now appears as soon as the pointer rests on a link.',

  // The syntax crib in the settings pane.
  'settings.help.code': 'Link a line, or a range of lines, of a source file:',
  'settings.help.repo': 'A file in a repository works the same way:',
  'settings.help.web': 'A web page shows its whole body. A heading after # narrows it, and a dash says how much of the page to take:',
  'settings.help.webForms': 'page#install  that heading and what is under it · page#-#install  the page up to that heading · page#install-usage  from one heading up to the next · page#install-  that heading to the end',
  'settings.help.note': 'A code link must name a line (#L18). GitHub and GitLab blob links are read as code; any other web link is read as a page.',
};
