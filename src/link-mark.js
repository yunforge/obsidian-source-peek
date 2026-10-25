'use strict';

// What to do to a rendered link that points at code.
//
// Obsidian renders a markdown link as an internal link when it looks like a vault path, and
// then treats it as one: Page preview searches the vault for it, fails (it is a file on
// disk), and shows its own "not found" popover; and after a hover rests it shows a "Follow
// link" tooltip, read from the element's aria-label. Both are answers to a question the
// preview panel has already answered better.
//
// The decisions are here, apart from the DOM calls, so they can be tested: `codeLinkFixes`
// says what a link needs, and the caller applies it.
//
// The attributes are removed as well as the classes. `aria-label` is what Obsidian's tooltip
// reads, so taking it off is what stops the tooltip being created at all — a CSS rule cannot
// do that, because the tooltip is a separate element.

// The classes and attributes a code link should not carry, and the one it should.
function codeLinkFixes(attrs) {
  const href = (attrs && (attrs.href || attrs.dataHref)) || '';
  if (!href) return null;

  return {
    add: ['external-link'],
    remove: ['internal-link', 'is-unresolved'],
    // Anything that would make Obsidian offer a tooltip about following or opening a link.
    stripAttrs: ['aria-label', 'data-tooltip-position', 'data-tooltip-delay'],
  };
}

module.exports = { codeLinkFixes };
