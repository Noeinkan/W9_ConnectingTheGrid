/* =========================================================================
   Connecting the Grid - the How to play sheet
   =========================================================================

   Builds the sheet from CONFIG.copy.howTo: sections of cards, each a
   picture from js/howtoart.js and a sentence or two beside it, and one
   section of keys.

   While the sheet is open its pictures play: every picture is a short loop
   of frames, all moved on together by one timer. The timer only runs while
   the sheet is open - a closed dialog is not drawn, so a picture moving in
   it would be work nobody sees. When motion is reduced nothing plays, and
   each picture holds the one frame that says the most.

   Exposes one global: HowTo.
   ========================================================================= */

var HowTo = (function (CFG, HowToArt) {
  'use strict';

  // How long each frame is held, in milliseconds.
  var FRAME = 1100;

  var pictures = [];
  var timer = null;
  var frame = 0;

  function put(parent, tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return parent.appendChild(node);
  }

  function fill(template) {
    return template.replace(/\{threshold\}/g, String(CFG.balancedThreshold));
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------------------------------------------------------------------
     Building the sheet
     ------------------------------------------------------------------- */

  function card(parent, entry) {
    var item = put(parent, 'article', 'howto-card' + (entry.wide ? ' is-wide' : ''));
    var text = put(item, 'div', 'howto-text');
    put(text, 'h4', 'howto-card-title', fill(entry.title));
    put(text, 'p', 'howto-card-body', fill(entry.body));

    var picture = HowToArt.draw(entry.picture);
    if (!picture) { return; }
    var frameBox = put(item, 'div', 'howto-picture');
    frameBox.setAttribute('aria-hidden', 'true');
    frameBox.appendChild(picture.el);
    pictures.push(picture);
  }

  /* The keys. The caps are drawn for the eye and hidden from screen
     readers, which hear the spoken name instead: "left arrow, up arrow"
     read out one cap at a time says less than "Arrow keys". */
  function keyList(parent, keys) {
    var list = put(parent, 'dl', 'howto-keys');
    keys.forEach(function (entry) {
      var term = put(list, 'dt');
      var caps = put(term, 'span', 'howto-caps');
      caps.setAttribute('aria-hidden', 'true');
      entry.keys.forEach(function (key) {
        if (key === '+') { put(caps, 'span', 'howto-plus', '+'); }
        else { put(caps, 'kbd', 'howto-key', key); }
      });
      put(term, 'span', 'visually-hidden', entry.spoken);
      put(list, 'dd', '', entry.does);
    });
  }

  function build(container, dialog) {
    if (!container) { return; }
    container.innerHTML = '';
    pictures = [];

    CFG.copy.howTo.sections.forEach(function (section) {
      var block = put(container, 'section', 'howto-section');
      put(block, 'h3', 'howto-section-title', section.title);

      if (section.keys) {
        keyList(put(block, 'div', 'howto-card is-wide'), section.keys);
        return;
      }
      var cards = put(block, 'div', 'howto-cards');
      section.cards.forEach(function (entry) { card(cards, entry); });
    });

    showAll(0);
    if (dialog) { dialog.addEventListener('close', stop); }
  }

  /* ---------------------------------------------------------------------
     Playing
     ------------------------------------------------------------------- */

  function showAll(index) {
    pictures.forEach(function (picture) { picture.show(index % picture.frames); });
  }

  // Called once the sheet is open.
  function play() {
    stop();
    if (reducedMotion()) {
      pictures.forEach(function (picture) { picture.show(picture.still); });
      return;
    }
    frame = 0;
    showAll(frame);
    timer = window.setInterval(function () {
      frame++;
      showAll(frame);
    }, FRAME);
  }

  function stop() {
    if (timer !== null) { window.clearInterval(timer); }
    timer = null;
  }

  return {
    build: build,
    play: play,
    stop: stop
  };

}(CONFIG, HowToArt));
