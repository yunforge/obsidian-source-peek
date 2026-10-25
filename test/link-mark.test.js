'use strict';

// link-mark: what a rendered code link must not carry.
//
// Two of Obsidian's own features get in the way of a code link, and both are driven by what
// the element says about itself:
//
//   - Page preview answers anything tagged `internal-link`, looks the path up in the vault,
//     does not find it (it is a file on disk), and shows a "not found" popover.
//   - A hover that rests shows a "Follow link" tooltip, created from the element's
//     `aria-label`.
//
// The preview panel answers both questions better, so both are taken away.

const assert = require('assert/strict');
const { codeLinkFixes } = require('../src/link-mark');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'link-mark: a code link carries no vault classes or tooltip',
  run() {
    section('a link with an href needs the fixes', () => {
      const fixes = codeLinkFixes({ href: '../src/main.c#L18' });
      assert.ok(fixes, 'a link with an href is a link');
      assert.deepEqual(fixes.add, ['external-link']);
      assert.deepEqual(fixes.remove, ['internal-link', 'is-unresolved']);
    });

    section('the tooltip attributes are stripped', () => {
      const fixes = codeLinkFixes({ href: '../src/main.c#L18' });
      // `aria-label` is the one that matters: Obsidian's tooltip reads it, so taking it off
      // is what stops the tooltip being created. CSS cannot do this — the tooltip is a
      // separate element, not a pseudo-element.
      assert.ok(fixes.stripAttrs.includes('aria-label'), 'aria-label drives the tooltip');
      assert.ok(fixes.stripAttrs.includes('data-tooltip-position'));
      assert.ok(fixes.stripAttrs.includes('data-tooltip-delay'));
    });

    section('data-href is accepted when href is absent', () => {
      const fixes = codeLinkFixes({ dataHref: '../src/main.c#L18' });
      assert.ok(fixes);
      assert.deepEqual(fixes.add, ['external-link']);
    });

    section('a link with no target at all is left alone', () => {
      assert.equal(codeLinkFixes({}), null);
      assert.equal(codeLinkFixes({ href: '' }), null);
      assert.equal(codeLinkFixes({ href: '', dataHref: '' }), null);
      assert.equal(codeLinkFixes(null), null);
      assert.equal(codeLinkFixes(undefined), null);
    });
  },
};
