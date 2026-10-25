'use strict';

// When a hover should preview.
//
// Obsidian's own page preview waits for Ctrl (Cmd on a Mac) before it appears, so a pointer
// crossing a link on its way somewhere else does not flash a panel. This plugin does the
// same by default, and lets the reader pick a different key, their own combination, or no
// key at all.
//
// The setting is a string:
//
//   'ctrl'      Ctrl, or Cmd on a Mac          (the default, matching Obsidian)
//   'shift'     Shift
//   'alt'       Alt / Option
//   'none'      a plain hover — no key
//   'custom'    whatever `hoverModifiers` holds, as a list of 'ctrl'/'shift'/'alt'
//
// On a Mac, `ctrl` means Cmd: that is the key Obsidian itself uses for page preview, and a
// Mac reader pressing Ctrl instead would be surprised.

const MODES = ['ctrl', 'shift', 'alt', 'none', 'custom'];

// A modifier the reader is holding, as the setting names it.
function heldModifiers(evt, isMac) {
  const held = [];
  // `metaKey` is Cmd on a Mac and the Windows key elsewhere; only the Mac reading counts,
  // because that is the one Obsidian treats as its modifier.
  if (evt.ctrlKey || (isMac && evt.metaKey)) held.push('ctrl');
  if (evt.shiftKey) held.push('shift');
  if (evt.altKey) held.push('alt');
  return held;
}

// Which modifiers a mode asks for, as a list. `none` asks for none.
//
// A custom list with nothing in it is a misconfiguration, not a decision: the reader chose
// "Custom…" and then switched every key off. Left as an empty list it degraded to a plain
// hover — indistinguishable from `none`, with nothing on screen saying so. It answers Ctrl,
// the default every other mode falls back to, and the settings pane says so.
function requiredModifiers(mode, custom) {
  if (mode === 'none') return [];
  if (mode === 'custom') {
    const list = (Array.isArray(custom) ? custom : [])
      .filter((m) => m === 'ctrl' || m === 'shift' || m === 'alt');
    return list.length ? list : ['ctrl'];
  }
  return MODES.includes(mode) ? [mode] : ['ctrl'];
}

// Whether a given surface needs the key at all.
//
// Obsidian's own page preview fires on a plain hover in reading view and waits for the
// modifier in the editor — reading is reading, editing is not. Matching that means the key
// is never needed where the reader is only looking, and is needed exactly where a stray
// panel would be in the way of writing.
function needsKey(surface) {
  return surface === 'editor';
}

// Whether the pointer should preview, given the event and the setting.
//
// The rule is "exactly these, no others": in `ctrl` mode a reader holding Ctrl+Shift has
// plainly reached for something else (a selection, a different shortcut), so the preview
// stays away rather than firing on a near miss.
function shouldPreview(evt, mode, custom, isMac) {
  const want = requiredModifiers(mode, custom);
  if (!want.length) return true;

  const held = heldModifiers(evt, isMac);
  if (held.length !== want.length) return false;
  return want.every((m) => held.includes(m));
}

// Test seam: consumed only by test/ — kept so the tests can reach in without a // second entry point. Production code does not read these.
module.exports = { shouldPreview, requiredModifiers, heldModifiers, needsKey, MODES };
