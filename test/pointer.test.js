'use strict';

// pointer: is the pointer on a character, or only near it?
//
// This exists because CodeMirror's `posAtCoords` snaps to the nearest character. That is
// right for placing a caret and wrong for deciding what the pointer is over — blank space
// past the end of a line reported that line's last character, so a line ending in a link
// previewed it from anywhere in the margin.

const assert = require('assert/strict');
const { pointerOverBox, pointerOverPos, MIN_PAD } = require('../src/pointer');

// A character box 8px wide, on the row 200..220.
const BOX = { left: 100, right: 108, top: 200, bottom: 220 };

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'pointer: on the character, not merely near it',
  run() {
    section('a pointer on the character counts', () => {
      assert.equal(pointerOverBox(BOX, 104, 210), true, 'the middle');
      assert.equal(pointerOverBox(BOX, 100, 210), true, 'the left edge');
      assert.equal(pointerOverBox(BOX, 108, 210), true, 'the right edge');
      assert.equal(pointerOverBox(BOX, 104, 200), true, 'the top edge');
      assert.equal(pointerOverBox(BOX, 104, 220), true, 'the bottom edge');
    });

    section('a pointer in blank space does not', () => {
      assert.equal(pointerOverBox(BOX, 158, 210), false, 'past the end of the line');
      assert.equal(pointerOverBox(BOX, 104, 260), false, 'below the line');
      assert.equal(pointerOverBox(BOX, 104, 180), false, 'above the line');
      assert.equal(pointerOverBox(BOX, 40, 210), false, 'well to the left');
    });

    section('half a character of slack at the sides', () => {
      // Enough that the seam between two characters is not a dead zone, not enough that
      // the margin becomes part of the link.
      assert.equal(pointerOverBox(BOX, 100 - MIN_PAD, 210), true, 'just left of the edge');
      assert.equal(pointerOverBox(BOX, 108 + MIN_PAD, 210), true, 'just right of the edge');
      assert.equal(pointerOverBox(BOX, 100 - MIN_PAD - 3, 210), false, 'further left than the slack');
      assert.equal(pointerOverBox(BOX, 108 + MIN_PAD + 3, 210), false, 'further right than the slack');
    });

    section('no vertical slack — a line owns its own row', () => {
      assert.equal(pointerOverBox(BOX, 104, 199), false, 'one pixel above');
      assert.equal(pointerOverBox(BOX, 104, 221), false, 'one pixel below');
    });

    section('a zero-width box still has a reachable target', () => {
      // At the very end of a line CodeMirror can report an empty box; without a floor on
      // the padding, the last character of a link would be unhoverable.
      const caret = { left: 100, right: 100, top: 200, bottom: 220 };
      assert.equal(pointerOverBox(caret, 100, 210), true, 'exactly on it');
      assert.equal(pointerOverBox(caret, 100 + MIN_PAD, 210), true, 'within the floor');
      assert.equal(pointerOverBox(caret, 100 + MIN_PAD + 3, 210), false, 'beyond the floor');
    });

    section('an inverted box is read the right way round', () => {
      // Some layouts report right-to-left runs; the comparison must not care.
      const rtl = { left: 108, right: 100, top: 200, bottom: 220 };
      assert.equal(pointerOverBox(rtl, 104, 210), true);
      assert.equal(pointerOverBox(rtl, 158, 210), false);
    });

    section('a missing box is never a hit', () => {
      assert.equal(pointerOverBox(null, 104, 210), false);
      assert.equal(pointerOverBox(undefined, 104, 210), false);
    });

    section('pointerOverPos asks CodeMirror for the box', () => {
      const cm = { coordsAtPos: (pos) => (pos === 7 ? BOX : null) };
      assert.equal(pointerOverPos(cm, 7, { clientX: 104, clientY: 210 }), true);
      assert.equal(pointerOverPos(cm, 7, { clientX: 158, clientY: 210 }), false);
      assert.equal(pointerOverPos(cm, 9, { clientX: 104, clientY: 210 }), false, 'no box for that position');
    });

    section('a CodeMirror that throws is not a hit', () => {
      const cm = { coordsAtPos: () => { throw new Error('detached'); } };
      assert.equal(pointerOverPos(cm, 1, { clientX: 104, clientY: 210 }), false);
    });
  },
};
