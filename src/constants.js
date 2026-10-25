'use strict';

// Everything the plugin lets the reader decide, in one place.

const DEFAULT_SETTINGS = {
  enabled: true, // previews at all; the toggle command flips this
  // Which key a hover waits for: 'ctrl' | 'shift' | 'alt' | 'none' | 'custom'.
  // Ctrl by default, matching Obsidian's own page preview.
  hoverModifier: 'ctrl',
  hoverModifiers: ['ctrl'], // what 'custom' means; a list of 'ctrl'/'shift'/'alt'
};

module.exports = { DEFAULT_SETTINGS };
