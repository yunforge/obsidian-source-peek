'use strict';

// Whether the pointer is really on a character, rather than merely nearest to it.
//
// CodeMirror's `posAtCoords` answers "which character is closest to this point". That is
// the right answer for placing a caret, and the wrong one for deciding what the pointer is
// over: blank space to the right of a line snaps to that line's last character, so a line
// ending in a link would preview it from anywhere in the margin.
//
// This is the second question — is the character the pointer snapped to actually under the
// pointer? — kept here as a small function so it can be tested without an editor.

// Half a character of slack on each side. The boundary between two characters belongs to
// whichever the pointer is nearer, and the last character of a link should not be a
// pixel-hunt.
const MIN_PAD = 2;

function pointerOverBox(box, x, y) {
  if (!box) return false;

  const left = Math.min(box.left, box.right);
  const right = Math.max(box.left, box.right);
  const pad = Math.max(MIN_PAD, (right - left) / 2);

  const insideX = x >= left - pad && x <= right + pad;
  // No slack vertically: a line's box is its line height, so a pointer above or below it is
  // in a different line's territory.
  const insideY = y >= box.top && y <= box.bottom;
  return insideX && insideY;
}

// The same question, asked of a CodeMirror view and a document position.
function pointerOverPos(cm, pos, evt) {
  let box;
  try {
    box = cm.coordsAtPos(pos);
  } catch {
    return false;
  }
  return pointerOverBox(box, evt.clientX, evt.clientY);
}

// Test seam: consumed only by test/ — kept so the tests can reach in without a // second entry point. Production code does not read these.
// (`pointerOverBox` and `MIN_PAD` are the test-only seam; pointerOverPos is the API.)
module.exports = { pointerOverPos, pointerOverBox, MIN_PAD };
