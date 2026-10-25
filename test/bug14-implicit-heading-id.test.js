'use strict';

// A heading that was closed implicitly has no `</h2>` of its own, so nothing used to take
// its id off the container stack. Every heading after it then inherited an anchor that had
// already been spent, and deep links landed on the wrong section.
//
// The rule works in two directions and both have to hold: an implicitly closed heading must
// NOT hand its id to the next heading, and a container that is still open MUST keep handing
// its id down. The second half is what makes this a fix rather than a deletion.

const assert = require('assert/strict');
const { extract } = require('../src/web');

const ids = (html) => extract(html).blocks.map((b) => b.id);
const block = (html) => extract(html).blocks;

module.exports = {
  name: 'web: an implicitly closed heading does not pass its id on',
  run() {
    // --- the case from the report ---
    assert.deepEqual(ids('<h2 id="a">One<h2>Two</h2>'), ['a', undefined]);

    // --- an implicit close happens whatever the two levels are ---
    assert.deepEqual(ids('<h2 id="a">One<h3>Two</h3>'), ['a', undefined]);
    assert.deepEqual(ids('<h3 id="a">One<h2>Two</h2>'), ['a', undefined]);
    assert.deepEqual(ids('<h6 id="a">One<h1>Two</h1>'), ['a', undefined]);
    assert.deepEqual(ids('<h2 id="a">One<h2>Two<h2>Three'), ['a', undefined, undefined]);

    // A heading is not a container: its own id belongs to it, so it must not be left on the
    // container stack where the heading after it would read it back.
    assert.deepEqual(ids('<h2 id="a">One<h2 id="b">Two<h2>Three'), ['a', 'b', undefined]);

    // The exemption also keeps a heading's own id from being released *on its behalf*: when a
    // stale close splices the heading off the block stack and lets go of the ids of every
    // frame it removed, a container that is still open must keep handing its id down.
    assert.deepEqual(
      ids('<h6>t4<h2><h3 id="b">t6<h1 id="a"></h3>t7<li>t8<h3><h6>t11</h6></h3></li></h2></h6>'),
      [undefined, 'b', 'a', undefined, undefined],
    );

    // --- an explicit close already worked, and still does ---
    assert.deepEqual(ids('<h1 id="a">A</h1><h2 id="b">B</h2>'), ['a', 'b']);
    assert.deepEqual(ids('<h2 id="a">One<h2 id="b">Two</h2>'), ['a', 'b']);
    assert.deepEqual(ids('<h2>One<h2 id="b">Two</h2>'), [undefined, 'b']);

    // --- <p> and <li> close implicitly too, and their ids are not handed on either ---
    // A <p> or <li> block carries no id of its own — the id field is the heading anchor — so
    // only the heading that follows is checked here.
    assert.deepEqual(ids('<p id="x">para<h2>H</h2>'), [undefined, undefined]);
    // The two <li> items are two blocks and the heading is a third; only the heading's
    // anchor matters here, and it must not be the list item's id.
    assert.deepEqual(ids('<ul><li id="a">one<li>two</ul><h2>H</h2>'), [undefined, undefined, undefined]);
    assert.deepEqual(ids('<ul><li id="a">one</li></ul><h2>H</h2>'), [undefined, undefined]);
    // The order matters when the tag that closes the previous item is the very tag that opens
    // the next one and carries an id of its own: the implied close has to release the SPENT
    // id first, or it releases the new one instead and the heading inherits the item that
    // already ended. The <li id="b"> below is still open, so `b` is what the heading inherits.
    assert.deepEqual(ids('<ul><li id="a">one<li id="b">two<h2>H</h2></ul>'), [undefined, undefined, 'b']);
    // A `</ul>` ends the list items still open inside it, so a heading after the list is not
    // inside the last item and inherits nothing. Only the closing tag of the item itself keeps
    // the item open up to its own `</li>`.
    assert.deepEqual(ids('<ul><li id="a">one<li id="b">two</ul><h2>H</h2>'), [undefined, undefined, undefined]);
    assert.deepEqual(ids('<ul><li id="a">one<li id="b">two</li></ul><h2>H</h2>'), [undefined, undefined, undefined]);
    // While a heading inside the still-open item does inherit that item's id.
    assert.deepEqual(ids('<ul><li id="a">one<li id="b">two<h2>H</h2></li></ul>'), [undefined, undefined, 'b']);
    // Same ordering question for <p>, where the second paragraph's id is spent by its own
    // open: nothing is still enclosing, so the heading inherits nothing.
    assert.deepEqual(ids('<p id="x">a<p id="y">b<h2>H</h2>'), [undefined, undefined, undefined]);

    // --- <dt>, <dd> and <option> never become blocks, so the block stack cannot close them.
    // Each one ends where the next of its kind begins, and with it its id. ---
    // The items collapse into one paragraph, then the heading; neither item passes an id on.
    assert.deepEqual(ids('<dl><dt id="a">One<dt>Two</dl><h2>H</h2>'), [undefined, undefined]);
    assert.deepEqual(ids('<dl><dt id="a">One<dd>Two</dl><h2>H</h2>'), [undefined, undefined]);
    assert.deepEqual(ids('<dl><dd id="a">One<dt>Two</dl><h2>H</h2>'), [undefined, undefined]);
    assert.deepEqual(ids('<select><option id="a">One<option>Two</select><h2>H</h2>'), [undefined, undefined]);
    // An <option> also ends when the <optgroup> after it starts, and an <optgroup> ends with
    // the next <optgroup> or with an <option> that starts outside it: every one of those
    // transitions has to take the id with it, or a heading after the <select> picks it up.
    assert.deepEqual(ids('<select><option id="a">One<optgroup><h2>H</h2></select>'), [undefined, undefined]);
    // An <option> inside an open <optgroup> does NOT close it: the group is still enclosing,
    // so a heading inside it still inherits the group's id.
    assert.deepEqual(ids('<select><optgroup id="a">One<option>Two<h2>H</h2></select>'), [undefined, 'a']);
    assert.deepEqual(ids('<select><optgroup id="a">One<optgroup>Two</select><h2>H</h2>'), [undefined, undefined]);
    // A starting <optgroup> ends everything still open of that kind, so it has to take BOTH
    // the open <option> and the group before it off the stack, not just the top one.
    assert.deepEqual(
      ids('<select><optgroup id="g"><option id="o">a<optgroup><h2>H</h2></select>'),
      [undefined, undefined],
    );
    // Once a container's own closing tag has gone by it hands nothing down any more, and a
    // <select> that simply holds an <optgroup> is no exception.
    assert.deepEqual(ids('<select><optgroup id="g"><option>a</optgroup></select><h2>H</h2>'), [undefined, undefined]);
    assert.deepEqual(ids('<dl id="dl"><dt>One<dd>Two</dl><h2>H</h2>'), [undefined, undefined]);
    // But while the container is still open, an item of it is not a barrier: a heading
    // inside the open <dl> still inherits the <dl> id, because the items were spent.
    assert.deepEqual(ids('<dl id="dl"><dt>One<dd>Two<h2>H</h2></dl>'), [undefined, 'dl']);

    // --- the other direction: an open container still hands its id to the headings inside
    // it, and to the heading that follows an implicitly closed one ---
    assert.deepEqual(ids('<div id="d"><h2>A</h2><h2>B</h2></div>'), ['d', 'd']);
    assert.deepEqual(ids('<div id="d"><h2 id="a">A</h2><h2>B</h2></div>'), ['a', 'd']);
    assert.deepEqual(ids('<section id="s"><h2>A</h2></section>'), ['s']);
    assert.deepEqual(ids('<section id="s"><h2 id="a">One<h2>Two</h2></section>'), ['a', 's']);
    assert.deepEqual(ids('<footer id="f"><h2>H</h2></footer>'), ['f']);
    assert.deepEqual(ids('<blockquote id="q"><h2>H</h2></blockquote>'), ['q']);
    assert.deepEqual(ids('<section id="s"><section id="in"><h2>H</h2></section></section>'), ['in']);

    // --- a heading's own id is never confused with a container's ---
    const own = block('<section id="s"><h2 id="own">H</h2></section>');
    assert.equal(own.length, 1);
    assert.equal(own[0].id, 'own');

    // --- closed containers stop handing their id down ---
    assert.deepEqual(ids('<div id="d"></div><h2>H</h2>'), [undefined]);
    assert.deepEqual(ids('<table id="t"><caption>C</caption></table><h2>H</h2>'), [undefined, undefined]);

    // --- bug13 must stay fixed: a void element with a stray id is not a container ---
    assert.deepEqual(ids('<hr id="sep"><h2>H</h2>'), [undefined]);
    assert.deepEqual(ids('<img id="badge"><h2>H</h2>'), [undefined]);
  },
};
