/* =========================================================================
   Connecting the Grid - map symbols
   =========================================================================

   The small drawings the landscape is dressed with: trees, hills, rocks,
   reeds, houses, ripples, the landmark discs, and the two pictures that
   mark the ends of the line.

   Drawn here as shapes rather than reused from img/, because these are map
   furniture and those are interface icons. An icon is a flat outline that
   has to read at 24 pixels in a legend; a tree on a map wants a filled
   canopy that can be turned, resized and tinted to sit in its wood. The
   legend still uses img/, so the two never need to match.

   How they are lit
   ----------------
   Every symbol is lit from the upper left, the same as the relief shadows
   in mapart.js: a paler face towards the light, a darker one away from it,
   and a soft shadow on the ground to the lower right. That one consistent
   light is most of what makes a scatter of symbols read as a landscape
   rather than as clip art.

   How they are coloured
   ---------------------
   No colour is written in this file. Every part carries a class, valued in
   css/style.css from the brand tokens. The parts that vary from one copy
   to the next - a canopy, a roof - are filled with currentColor, and each
   copy is given a tint class that sets `color`, so one symbol yields a wood
   of three greens or a street of three roofs.

   Exposes one global: MapSymbols.
   ========================================================================= */

var MapSymbols = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function append(parent, name, attributes) {
    var node = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    parent.appendChild(node);
    return node;
  }

  function n(value) { return Math.round(value * 100) / 100; }

  // The middle of the top of the house's chimney, in the symbol's 0-100 units.
  var CHIMNEY_TOP = [68, 26];

  /* ---------------------------------------------------------------------
     Ground cover
     ------------------------------------------------------------------- */

  function define(defs) {
    function symbol(id) {
      return append(defs, 'symbol', { id: id, viewBox: '0 0 100 100', overflow: 'visible' });
    }

    function groundShadow(parent, cx, cy, rx, ry) {
      append(parent, 'ellipse', { cx: cx, cy: cy, rx: rx, ry: ry, class: 'art-ground-shadow' });
    }

    // A broadleaf tree: a cloud of canopy, shaded on its lower right.
    var tree = symbol('tree');
    groundShadow(tree, 60, 92, 30, 7);
    append(tree, 'path', { d: 'M46 94h8V66h-8z', class: 'art-trunk' });
    append(tree, 'path', {
      d: 'M50 6c14 0 25 11 25 25 0 4-1 8-3 11 8 4 13 12 13 21 0 13-11 24-25 24H40' +
         'c-14 0-25-11-25-24 0-9 5-17 13-21-2-3-3-7-3-11 0-14 11-25 25-25z',
      class: 'art-canopy'
    });
    append(tree, 'path', {
      d: 'M75 42c8 4 10 12 10 21 0 13-11 24-25 24H40c-6 0-11-2-15-5 22 2 44-12 50-40z',
      class: 'art-canopy-shade'
    });
    append(tree, 'path', { d: 'M36 22c4-8 12-11 20-10-9 3-14 9-16 18-3 0-4-4-4-8z', class: 'art-canopy-light' });

    /* A conifer. Mixed in with the broadleaves so a wood is not one tree
       stamped forty times - a second outline does more for that than any
       amount of varying the size. */
    var pine = symbol('pine');
    groundShadow(pine, 60, 93, 26, 6);
    append(pine, 'path', { d: 'M46 95h8V82h-8z', class: 'art-trunk' });
    append(pine, 'path', {
      d: 'M50 4 72 38H60l20 28H64l20 26H16l20-26H20l20-28H28z', class: 'art-canopy'
    });
    append(pine, 'path', { d: 'M50 4 72 38H60l20 28H64l20 26H50z', class: 'art-canopy-shade' });

    // A rounded hill, its lit western face paler than the rest.
    var hill = symbol('hill');
    groundShadow(hill, 58, 88, 42, 6);
    append(hill, 'path', { d: 'M4 88C16 88 28 38 50 38S84 88 96 88z', class: 'art-hill-back' });
    append(hill, 'path', { d: 'M4 88C16 88 28 38 50 38c-8 10-12 30-8 50z', class: 'art-hill' });
    append(hill, 'path', { d: 'M60 52c6 8 10 20 12 30', class: 'art-hill-line', fill: 'none' });

    var rock = symbol('rock');
    groundShadow(rock, 56, 84, 36, 6);
    append(rock, 'path', { d: 'M16 82 32 34l22-8 26 22 6 34z', class: 'art-rock' });
    append(rock, 'path', { d: 'M32 34l22-8 8 30-30 4z', class: 'art-rock-face' });
    append(rock, 'path', { d: 'M54 26 62 56l18 26', class: 'art-rock-line', fill: 'none' });
    append(rock, 'path', { d: 'M84 88l4-9 9 2 1 7z', class: 'art-rock' });

    // Reeds and a little heather: protected habitat, not a lawn.
    var reed = symbol('reed');
    append(reed, 'path', { d: 'M30 94V44M50 96V30M70 94V48', class: 'art-stem', fill: 'none' });
    append(reed, 'path', {
      d: 'M30 50c-8-4-9-14-4-19 6 2 9 12 4 19zM50 34c-9-5-10-16-4-22 7 3 10 15 4 22z' +
         'M70 54c8-4 9-14 4-19-6 2-9 12-4 19z',
      class: 'art-frond'
    });
    append(reed, 'circle', { cx: 40, cy: 82, r: 5, class: 'art-flower' });
    append(reed, 'circle', { cx: 61, cy: 88, r: 4, class: 'art-flower' });

    /* A house, seen from the front and a little above. The chimney goes in
       before the roof so the roof hides its foot. Its top is CHIMNEY_TOP,
       where js/mapmotion.js lets the smoke out: move one, move the other. */
    var house = symbol('house');
    groundShadow(house, 58, 93, 42, 6);
    append(house, 'path', { d: 'M20 92V52h60v40z', class: 'art-wall' });
    append(house, 'path', { d: 'M62 92V52h18v40z', class: 'art-wall-shade' });
    append(house, 'path', { d: 'M64 26h8v20h-8z', class: 'art-chimney' });
    append(house, 'path', { d: 'M12 54 50 22l38 32z', class: 'art-roof' });
    append(house, 'path', { d: 'M50 22 88 54H50z', class: 'art-roof-shade' });
    append(house, 'path', { d: 'M43 92V72h14v20z', class: 'art-door' });
    append(house, 'path', { d: 'M26 62h11v9H26zM64 62h11v9H64z', class: 'art-window' });

    // Wind on open water.
    var ripple = symbol('ripple');
    append(ripple, 'path', {
      d: 'M14 50q12-10 24 0t24 0M34 68q10-8 20 0t20 0',
      class: 'art-ripple', fill: 'none'
    });

    defineLandmarks(symbol);
  }

  /* ---------------------------------------------------------------------
     Landmarks
     ---------------------------------------------------------------------
     Each on a pale disc so it reads as a place rather than as ground. The
     shapes are deliberately nothing like each other - a building with
     masts, a factory roofline, a leaf, a coin. An earlier set had the
     substation and the connection customer both drawn as a house with
     something inside it, and at the size these appear on screen they were
     impossible to tell apart.
     ------------------------------------------------------------------- */

  function defineLandmarks(symbol) {
    function landmark(id, ring) {
      var mark = symbol(id);
      append(mark, 'circle', { cx: 54, cy: 56, r: 38, class: 'art-disc-shadow' });
      append(mark, 'circle', { cx: 50, cy: 50, r: 38, class: 'art-disc art-disc-' + ring });
      return mark;
    }

    // A switching compound: a low building with two masts standing over it.
    var substation = landmark('mark-substation', 'substation');
    append(substation, 'path', { d: 'M26 82V56h48v26z', class: 'art-mark' });
    append(substation, 'path', {
      d: 'M31 56V28h5v28zM64 56V28h5v28zM24 34h19v4H24zM57 34h19v4H57z',
      class: 'art-mark'
    });
    append(substation, 'path', { d: 'M54 58 40 78h9l-4 13 15-21h-9z', class: 'art-mark-hot' });

    // A site waiting for a connection: a works, with a sawtooth roof.
    var customer = landmark('mark-customer', 'customer');
    append(customer, 'path', {
      d: 'M22 82V56l12-10v10l12-10v10l12-10v10l12-10v36z', class: 'art-mark'
    });
    append(customer, 'path', { d: 'M64 40h8V20h-8z', class: 'art-mark' });
    append(customer, 'circle', { cx: 68, cy: 16, r: 6, class: 'art-mark-hot' });

    // Land offered by the community: a leaf.
    var benefit = landmark('mark-benefit', 'benefit');
    append(benefit, 'path', {
      d: 'M24 80C22 50 44 26 78 22c4 32-16 56-46 58z', class: 'art-mark'
    });
    append(benefit, 'path', {
      d: 'M28 78C44 62 58 44 72 28', class: 'art-mark-vein', fill: 'none'
    });

    /* Connection funding: a gold coin with a pound sign on it. Round, where
       every other landmark is built out of straight edges, because it is
       the only one that is not a place on the ground - it is money. */
    var grant = landmark('mark-grant', 'grant');
    append(grant, 'circle', { cx: 50, cy: 50, r: 24, class: 'art-coin' });
    append(grant, 'circle', { cx: 50, cy: 50, r: 18, class: 'art-coin-rim', fill: 'none' });
    append(grant, 'path', {
      d: 'M57 40c-1-4-4-6-8-6-5 0-8 3-8 8 0 5 3 8 2 14-1 3-3 6-5 8h20M38 51h14',
      class: 'art-coin-sign', fill: 'none'
    });
  }

  /* ---------------------------------------------------------------------
     The two ends of the line
     ---------------------------------------------------------------------
     Drawn straight into the page rather than as symbols, because the wind
     turbines turn: a CSS animation on an element inside a <use> copy is not
     something every browser will run.

     Both pictures keep clear of a band across the middle of the cell. The
     line always crosses that band - it arrives at the generation site from
     the west edge, and leaves the demand centre by the east one - so
     anything standing there would be hidden under it.
     ------------------------------------------------------------------- */

  // One wind turbine: hub at (hx, hy), a tower of the given height below it.
  function turbine(parent, hx, hy, height) {
    append(parent, 'ellipse', {
      class: 'art-ground-shadow', cx: n(hx + 5), cy: n(hy + height), rx: 7, ry: 2.4
    });
    append(parent, 'path', {
      class: 'art-turbine-tower',
      d: 'M' + n(hx - 1.4) + ' ' + hy + 'L' + n(hx - 2.8) + ' ' + n(hy + height) +
         'H' + n(hx + 2.8) + 'L' + n(hx + 1.4) + ' ' + hy + 'z'
    });

    /* The rotor turns about its own box. The invisible circle is there to
       make that box square and centred on the hub - three blades alone
       would give a box off to one side, and the rotor would wobble. */
    var rotor = append(parent, 'g', { class: 'art-rotor' });
    append(rotor, 'circle', { cx: hx, cy: hy, r: 19, fill: 'none', stroke: 'none' });
    [0, 120, 240].forEach(function (angle) {
      append(rotor, 'path', {
        class: 'art-blade',
        d: 'M' + hx + ' ' + hy + 'c-3.2-5-3.2-13 0-19 2 6 2.2 14 0 19z',
        transform: 'rotate(' + angle + ' ' + hx + ' ' + hy + ')'
      });
    });
    append(parent, 'circle', { class: 'art-hub', cx: hx, cy: hy, r: 2.4 });
  }

  // Cell-local units, 0-100 across: the group is moved onto its cell.
  function drawGenerationSite(parent, x, y) {
    var g = append(parent, 'g', { class: 'art-end', transform: 'translate(' + x + ' ' + y + ')' });

    turbine(g, 21, 21, 42);
    turbine(g, 79, 23, 40);

    // The site's own switchgear, low down and out of the line's way.
    append(g, 'ellipse', { class: 'art-ground-shadow', cx: 31, cy: 90, rx: 22, ry: 4 });
    append(g, 'path', { class: 'art-end-wall', d: 'M12 89V72h34v17z' });
    append(g, 'path', { class: 'art-end-wall-shade', d: 'M36 89V72h10v17z' });
    append(g, 'path', { class: 'art-end-roof', d: 'M10 73h38v-5H10z' });
    append(g, 'path', { class: 'art-end-hot', d: 'M28 75l-6 8h5l-2 6 8-9h-5l2-5z' });
  }

  function drawDemandCentre(parent, x, y) {
    var g = append(parent, 'g', { class: 'art-end', transform: 'translate(' + x + ' ' + y + ')' });

    // [left, top, width, bottom]: a skyline above the line, low blocks below.
    var blocks = [
      [10, 12, 16, 34], [28, 0, 18, 34], [48, 8, 14, 34], [64, 16, 20, 34],
      [12, 68, 24, 92], [42, 72, 20, 92], [68, 66, 22, 92]
    ];

    blocks.forEach(function (b) {
      var left = b[0];
      var top = b[1];
      var width = b[2];
      var bottom = b[3];
      append(g, 'ellipse', {
        class: 'art-ground-shadow', cx: n(left + width * 0.7), cy: bottom, rx: n(width * 0.6), ry: 2.6
      });
      append(g, 'path', {
        class: 'art-city', d: 'M' + left + ' ' + bottom + 'V' + top + 'h' + width + 'V' + bottom + 'z'
      });
      append(g, 'path', {
        class: 'art-city-shade',
        d: 'M' + n(left + width * 0.62) + ' ' + bottom + 'V' + top + 'H' + (left + width) + 'V' + bottom + 'z'
      });
      // Two columns of lit windows, as dashed strokes: cheaper than rects.
      append(g, 'path', {
        class: 'art-city-windows', fill: 'none',
        d: 'M' + n(left + width * 0.3) + ' ' + (top + 4) + 'V' + (bottom - 3) +
           'M' + n(left + width * 0.62 + 2.5) + ' ' + (top + 4) + 'V' + (bottom - 3)
      });
    });
  }

  return {
    define: define,
    drawGenerationSite: drawGenerationSite,
    drawDemandCentre: drawDemandCentre,
    chimneyTop: CHIMNEY_TOP
  };

}());
