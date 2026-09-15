/* =========================================================================
   Connecting the Grid - the quick tour
   =========================================================================

   Five short steps, each pointing at the part of the screen it talks
   about: the square in play, the technology buttons, the meters, the best
   finish still open, and the demand centre. The words are in
   CONFIG.copy.tour.

   It opens by itself only when the game is opened without a landscape
   named in the address (see the end of Game.init), and from the Tour
   button at any time. Nothing records that it has been seen: this game
   stores nothing, and the address bar already tells a returning player
   from a new one well enough.

   While it is open it behaves as a modal dialog: a veil stops clicks
   reaching the game, Tab stays inside the card, and Escape closes it.
   The highlighted part of the screen is a hole cut in the dimming with a
   box-shadow, so nothing is moved or re-parented to be shown.

   Exposes one global: Tour.
   ========================================================================= */

var Tour = (function (CFG) {
  'use strict';

  var els = {};
  var options = {};
  var at = 0;
  var isOpen = false;

  function byId(id) { return document.getElementById(id); }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  function steps() { return CFG.copy.tour || []; }

  /* ---------------------------------------------------------------------
     What each step points at
     ------------------------------------------------------------------- */

  function cellAt(col, row) {
    return document.querySelector('#board .cell[data-col="' + col + '"][data-row="' + row + '"]');
  }

  function locate(key) {
    switch (key) {
      case 'target':
        return document.querySelector('#board .cell.is-target') ||
          cellAt(CFG.start.col, CFG.start.row);
      case 'tech': return byId('tech');
      case 'meters': return byId('meters');
      case 'forecast': return byId('forecast') || byId('meters');
      case 'end': return cellAt(CFG.end.col, CFG.end.row);
      default: return null;
    }
  }

  /* ---------------------------------------------------------------------
     Built once, on first use
     ------------------------------------------------------------------- */

  function build() {
    if (els.card) { return; }
    var copy = CFG.copy;

    els.veil = document.createElement('div');
    els.veil.className = 'tour-veil';
    els.veil.hidden = true;

    els.spot = document.createElement('div');
    els.spot.className = 'tour-spot';
    els.spot.setAttribute('aria-hidden', 'true');
    els.spot.hidden = true;

    els.card = document.createElement('div');
    els.card.className = 'tour-card';
    els.card.setAttribute('role', 'dialog');
    els.card.setAttribute('aria-modal', 'true');
    els.card.setAttribute('aria-labelledby', 'tourTitle');
    els.card.setAttribute('aria-describedby', 'tourBody');
    els.card.hidden = true;

    els.count = document.createElement('p');
    els.count.className = 'tour-count';

    els.title = document.createElement('h2');
    els.title.id = 'tourTitle';
    els.title.className = 'tour-title';

    els.body = document.createElement('p');
    els.body.id = 'tourBody';
    els.body.className = 'tour-body';

    var actions = document.createElement('div');
    actions.className = 'tour-actions';

    els.skip = button('btn btn-quiet', copy.tourSkip, finish);
    els.back = button('btn', copy.tourBack, function () { go(at - 1); });
    els.next = button('btn btn-primary', copy.tourNext, function () {
      if (at >= steps().length - 1) { finish(); } else { go(at + 1); }
    });

    actions.appendChild(els.skip);
    actions.appendChild(els.back);
    actions.appendChild(els.next);

    els.card.appendChild(els.count);
    els.card.appendChild(els.title);
    els.card.appendChild(els.body);
    els.card.appendChild(actions);

    document.body.appendChild(els.veil);
    document.body.appendChild(els.spot);
    document.body.appendChild(els.card);
  }

  function button(className, text, onClick) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  }

  /* ---------------------------------------------------------------------
     Opening, stepping, closing
     ------------------------------------------------------------------- */

  function init(given) {
    options = given || {};
    els.button = byId('tourButton');
    if (els.button) {
      els.button.textContent = CFG.copy.tourButton;
      els.button.addEventListener('click', start);
    }
  }

  function start() {
    if (!steps().length || isOpen) { return; }
    build();
    isOpen = true;
    els.veil.hidden = false;
    els.spot.hidden = false;
    els.card.hidden = false;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    go(0);
  }

  function finish() {
    if (!isOpen) { return; }
    isOpen = false;
    els.veil.hidden = true;
    els.spot.hidden = true;
    els.card.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    if (options.onFinish) { options.onFinish(); }
  }

  function go(index) {
    var list = steps();
    at = Math.max(0, Math.min(list.length - 1, index));
    var step = list[at];

    els.count.textContent = fill(CFG.copy.tourCount, { n: at + 1, total: list.length });
    els.title.textContent = step.title;
    els.body.textContent = step.body;
    els.back.disabled = at === 0;
    els.next.textContent = at === list.length - 1 ? CFG.copy.tourDone : CFG.copy.tourNext;

    var target = locate(step.at);
    // On a phone the page scrolls, and the thing being talked about may be off screen.
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    place();
    els.next.focus();
  }

  /* The hole goes round the thing being pointed at; the card goes beside
     it, on whichever side has room, and never off the screen. */
  function place() {
    if (!isOpen) { return; }
    var target = locate(steps()[at].at);
    var margin = 12;
    var pad = 6;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var card = els.card;
    var width = card.offsetWidth;
    var height = card.offsetHeight;

    if (!target) {
      els.spot.hidden = true;
      card.style.left = Math.round((vw - width) / 2) + 'px';
      card.style.top = Math.round((vh - height) / 2) + 'px';
      return;
    }

    var box = target.getBoundingClientRect();
    els.spot.hidden = false;
    els.spot.style.left = Math.round(box.left - pad) + 'px';
    els.spot.style.top = Math.round(box.top - pad) + 'px';
    els.spot.style.width = Math.round(box.width + pad * 2) + 'px';
    els.spot.style.height = Math.round(box.height + pad * 2) + 'px';

    var gap = pad + 14;
    var left;
    var top;
    if (vw - box.right >= width + gap + margin) {
      left = box.right + gap;
      top = box.top + box.height / 2 - height / 2;
    } else if (box.left >= width + gap + margin) {
      left = box.left - gap - width;
      top = box.top + box.height / 2 - height / 2;
    } else if (vh - box.bottom >= height + gap + margin) {
      left = box.left + box.width / 2 - width / 2;
      top = box.bottom + gap;
    } else {
      left = box.left + box.width / 2 - width / 2;
      top = box.top - gap - height;
    }

    card.style.left = Math.round(Math.max(margin, Math.min(left, vw - width - margin))) + 'px';
    card.style.top = Math.round(Math.max(margin, Math.min(top, vh - height - margin))) + 'px';
  }

  /* Escape closes, Tab stays in the card, and nothing else typed reaches
     the game underneath - the 1, 2, 3 and E shortcuts included. */
  function onKey(event) {
    if (!isOpen) { return; }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish();
      return;
    }

    if (event.key === 'Tab') {
      var focusable = [els.skip, els.back, els.next].filter(function (el) { return !el.disabled; });
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var inside = els.card.contains(document.activeElement);
      if (!inside) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    /* Stopped here, in the capture phase, so no listener further in ever
       hears it. The card's buttons still press on Enter and Space: that is
       the browser's default action, which stopping propagation leaves alone. */
    event.stopPropagation();
  }

  return {
    init: init,
    start: start,
    finish: finish,
    isOpen: function () { return isOpen; }
  };

}(CONFIG));
