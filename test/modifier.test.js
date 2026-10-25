'use strict';

// modifier: which key, if any, a hover waits for.

const assert = require('assert/strict');
const { shouldPreview, requiredModifiers, heldModifiers, needsKey, MODES } = require('../src/modifier');

// A pointer event with the given keys held.
const ev = (keys) => ({
  ctrlKey: !!keys.ctrl,
  shiftKey: !!keys.shift,
  altKey: !!keys.alt,
  metaKey: !!keys.meta,
});

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'modifier: which key a hover waits for',
  run() {
    section('ctrl mode waits for Ctrl alone', () => {
      assert.equal(shouldPreview(ev( { ctrl: true }), 'ctrl', null, false), true);
      assert.equal(shouldPreview(ev({}), 'ctrl', null, false), false, 'no key, no preview');
      assert.equal(shouldPreview(ev({ shift: true }), 'ctrl', null, false), false);
      assert.equal(shouldPreview(ev({ alt: true }), 'ctrl', null, false), false);
      assert.equal(shouldPreview(ev({ ctrl: true, shift: true }), 'ctrl', null, false), false,
        'Ctrl+Shift is reaching for something else');
      assert.equal(shouldPreview(ev({ ctrl: true, alt: true }), 'ctrl', null, false), false);
    });

    section('on a Mac, ctrl means Cmd', () => {
      assert.equal(shouldPreview(ev({ meta: true }), 'ctrl', null, true), true, 'Cmd counts');
      assert.equal(shouldPreview(ev({ ctrl: true }), 'ctrl', null, true), true, 'so does Ctrl');
      assert.equal(shouldPreview(ev({ meta: true }), 'ctrl', null, false), false,
        'the Windows key is not our modifier elsewhere');
    });

    section('shift mode', () => {
      assert.equal(shouldPreview(ev({ shift: true }), 'shift', null, false), true);
      assert.equal(shouldPreview(ev({}), 'shift', null, false), false);
      assert.equal(shouldPreview(ev({ ctrl: true }), 'shift', null, false), false);
    });

    section('alt mode', () => {
      assert.equal(shouldPreview(ev({ alt: true }), 'alt', null, false), true);
      assert.equal(shouldPreview(ev({}), 'alt', null, false), false);
      assert.equal(shouldPreview(ev({ alt: true, shift: true }), 'alt', null, false), false);
    });

    section('none mode previews on a plain hover', () => {
      assert.equal(shouldPreview(ev({}), 'none', null, false), true);
      assert.equal(shouldPreview(ev({}), 'none', null, true), true);
    });

    section('none mode still previews while a key happens to be down', () => {
      // A reader resting a finger on Shift while reading should not lose the preview. With
      // no key required there is nothing to be "too much", so any combination passes.
      assert.equal(shouldPreview(ev({ shift: true }), 'none', null, false), true);
      assert.equal(shouldPreview(ev({ ctrl: true, alt: true }), 'none', null, false), true);
    });

    section('custom mode takes the listed keys', () => {
      assert.equal(shouldPreview(ev({ ctrl: true, shift: true }), 'custom', ['ctrl', 'shift'], false), true);
      assert.equal(shouldPreview(ev({ ctrl: true }), 'custom', ['ctrl', 'shift'], false), false, 'only some of them');
      assert.equal(shouldPreview(ev({ ctrl: true, shift: true, alt: true }), 'custom', ['ctrl', 'shift'], false), false, 'one too many');
      assert.equal(shouldPreview(ev({ alt: true }), 'custom', ['alt'], false), true);
      // bug32: an empty custom list used to mean a plain hover — indistinguishable from
      // `none` with nothing saying so. It is a misconfiguration now, answered with the
      // default key; the settings pane carries the hint.
      assert.equal(shouldPreview(ev({}), 'custom', [], false), false, 'an empty custom list falls back to the default key');
      assert.equal(shouldPreview(ev({ ctrl: true }), 'custom', [], false), true);
      assert.equal(shouldPreview(ev({}), 'custom', ['hyper'], false), false, 'an all-unknown list is as empty as an all-off one');
    });

    section('custom ignores names it does not know', () => {
      assert.equal(shouldPreview(ev({ ctrl: true }), 'custom', ['ctrl', 'hyper'], false), true,
        'an unknown key in the list is dropped, not treated as required');
    });

    section('an unknown mode behaves like the default', () => {
      assert.equal(shouldPreview(ev({ ctrl: true }), 'bogus', null, false), true);
      assert.equal(shouldPreview(ev({}), 'bogus', null, false), false);
      assert.equal(shouldPreview(ev({ ctrl: true }), undefined, null, false), true);
    });

    section('requiredModifiers describes each mode', () => {
      assert.deepEqual(requiredModifiers('ctrl'), ['ctrl']);
      assert.deepEqual(requiredModifiers('shift'), ['shift']);
      assert.deepEqual(requiredModifiers('alt'), ['alt']);
      assert.deepEqual(requiredModifiers('none'), []);
      assert.deepEqual(requiredModifiers('custom', ['alt', 'shift']), ['alt', 'shift']);
      assert.deepEqual(requiredModifiers('custom'), ['ctrl'], 'an empty custom list falls back to the default (bug32)');
      assert.deepEqual(requiredModifiers('nonsense'), ['ctrl']);
    });

    section('heldModifiers reads an event', () => {
      assert.deepEqual(heldModifiers(ev({ ctrl: true, shift: true }), false), ['ctrl', 'shift']);
      assert.deepEqual(heldModifiers(ev({}), false), []);
      assert.deepEqual(heldModifiers(ev({ meta: true }), true), ['ctrl'], 'Cmd reads as ctrl on a Mac');
      assert.deepEqual(heldModifiers(ev({ meta: true }), false), [], 'the Windows key is not a modifier here');
    });

    section('the two surfaces follow different rules, as Obsidian does', () => {
      // Reading view previews on a plain hover; the editor waits for the key. This is the
      // difference that makes the plugin feel like Obsidian rather than fighting it.
      assert.equal(needsKey('reading'), false, 'reading view needs no key');
      assert.equal(needsKey('editor'), true, 'the editor needs the key');
      assert.equal(needsKey(undefined), false, 'an unknown surface is treated as reading');
    });

    section('a key pressed after the pointer arrived still completes the hover', () => {
      // The reader's natural order is: rest on the link, then reach for the key. Both
      // orders have to end in a preview, so the decision is made from the current key state
      // rather than from the order the events came in.
      const mode = 'ctrl';
      const isMac = false;

      // Pointer arrived first, no key.
      assert.equal(shouldPreview(ev({}), mode, null, isMac), false, 'hover alone is not enough');
      // Key pressed while the pointer rests — same position, key now down.
      assert.equal(shouldPreview(ev({ ctrl: true }), mode, null, isMac), true,
        'the key completes the hover it found already under way');

      // And the other order still works.
      assert.equal(shouldPreview(ev({ ctrl: true }), mode, null, isMac), true, 'key first');
    });

    section('a released key does not retract an open preview', () => {
      // Nothing here decides visibility on release; the caller keeps the panel up until the
      // pointer leaves. Pinned so a future change does not make it flicker.
      assert.equal(shouldPreview(ev({}), 'ctrl', null, false), false,
        'with the key up the answer is "no", which the caller must not read as "hide"');
    });

    section('MODES lists what the setting accepts', () => {
      assert.deepEqual(MODES, ['ctrl', 'shift', 'alt', 'none', 'custom']);
    });
  },
};
