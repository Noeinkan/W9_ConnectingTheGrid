/* =========================================================================
   Connecting the Grid - the landscape, moving
   =========================================================================

   What moves on the map while nobody is touching it: the current in the
   river, traffic on the road, wind on the lakes and in the trees and reeds,
   smoke from the chimneys, and the shadows of clouds passing over.

   None of it means anything. It is there so the map reads as a place rather
   than as a printed board, and it is held to the same contract as the rest
   of the picture (see the note at the top of js/mapart.js): aria-hidden,
   never clickable, and gone under forced colours along with everything else.

   Where it is drawn
   -----------------
   Nothing here goes on the lower sheet. That sheet carries the roughening
   filters and is painted once; a single moving dash on it would make the
   browser run those filters again on every frame. So:

     - the river, the road and the lakes are drawn into the empty group
       mapart.js leaves at the bottom of the upper sheet, under the trees;
     - the chimney smoke goes in the one it leaves over the trees and
       houses, still under the two ends and the route;
     - the trees and reeds are mapart.js's own drawings, already on the
       upper sheet, and are only told how to sway;
     - the cloud shadows are not SVG at all but a few HTML boxes filled with
       a soft gradient, laid over both sheets. A box that only slides can be
       moved by the graphics card without repainting anything, which an SVG
       shape cannot.

   Everything is placed from the map's seed, like every other drawing. Only
   the phase of the motion depends on when the page was opened.

   All of it is decoration, so all of it stops or goes under
   prefers-reduced-motion - see css/mapmotion.css.

   Exposes one global: MapMotion.
   ========================================================================= */

var MapMotion = (function (Rng, MapArt, MapSymbols) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* The light on moving water: one glint either side of the middle of the
     channel, measured square to the flow so it holds on a bend. */
  var RIVER = { glint: 9 };

  /* Two lanes of traffic, each on the left of the way it is going - this is
     a British map. 'period' is the length of road one pattern of cars covers
     before it repeats, and it must match the distance in the traffic
     keyframes in css/mapmotion.css, or the loop visibly jumps. 'gap' is the
     least room left between two cars in a lane; 'seconds' is how long one
     period takes, southbound then northbound. */
  var TRAFFIC = {
    lane: 4.3,
    period: 600,
    car: 10,
    cars: [2, 3],
    colours: 3,
    gap: 60,
    seconds: [14, 17]
  };

  /* 'share' of houses with the fire lit. Each chimney sends up 'puffs' at a
     time, evenly spaced through one rise; 'radius' is a puff's starting size
     as a fraction of its house. */
  var SMOKE = { share: 0.35, puffs: 4, seconds: 5.6, radius: 0.15 };

  // Wind on open water: how many drift speeds, and the longest phase offset.
  var WAVES = { kinds: 3, spread: 7 };

  /* Wind in the trees and reeds. 'kinds' says which symbols sway, and with
     which of the two movements in css/mapmotion.css. Each gust reaches the
     west edge of the map first and takes 'gust' seconds to cross to the
     east, so it is seen travelling through a wood rather than every tree
     leaning at once; 'jitter' is how far neighbours are allowed to disagree.
     'foot' is how far down its symbol a plant meets the ground: the trunks
     and stems in js/mapsymbols.js all end at about 94 of 100. */
  var SWAY = {
    kinds: { tree: 'tree', pine: 'tree', reed: 'reed' },
    gust: 2.6,
    jitter: 0.8,
    foot: 0.94
  };

  /* One cloud to each horizontal band of the map, so two never start out
     stacked on one another. 'kinds' is how many shapes css/mapmotion.css
     draws; 'seconds' how long a crossing takes, slowest to fastest. */
  var CLOUDS = { count: 3, kinds: 3, seconds: [85, 140] };

  function append(parent, name, attributes) {
    var node = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    parent.appendChild(node);
    return node;
  }

  function n(value) { return Math.round(value * 100) / 100; }

  function between(range, roll) { return range[0] + roll * (range[1] - range[0]); }

  /* A chain of points moved sideways by `offset`, to the left of someone
     travelling along it in the order the points run. Square to the local
     direction rather than straight across the page, so a lane stays a lane
     where the road swings east or west. */
  function alongside(points, offset) {
    return points.map(function (point, i) {
      var before = points[i - 1] || point;
      var after = points[i + 1] || point;
      var dx = after[0] - before[0];
      var dy = after[1] - before[1];
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      return [point[0] + dy / length * offset, point[1] - dx / length * offset];
    });
  }

  /* ---------------------------------------------------------------------
     The river
     ------------------------------------------------------------------- */

  function drawRiver(parent, points) {
    if (!points) { return; }
    // The river runs north to south, so the left of its flow is the east bank.
    append(parent, 'path', {
      class: 'art-river-glint',
      d: MapArt.throughPoints(alongside(points, -RIVER.glint)), fill: 'none'
    });
    append(parent, 'path', {
      class: 'art-river-glint art-river-glint-2',
      d: MapArt.throughPoints(alongside(points, RIVER.glint)), fill: 'none'
    });
  }

  /* ---------------------------------------------------------------------
     The road
     ---------------------------------------------------------------------
     Each car is one dash of a dashed line laid down a lane, and the traffic
     moves by sliding the dash pattern along it. A few paths and no geometry
     per car, however long the road.

     Cars of one colour share a path. Every path in a lane repeats over the
     same period and moves at the same speed, so the cars keep their spacing
     and never drive through one another.
     ------------------------------------------------------------------- */

  function drawLane(parent, points, southbound, salt) {
    var period = TRAFFIC.period;
    var seconds = TRAFFIC.seconds[southbound ? 0 : 1];
    var count = TRAFFIC.cars[0] +
      Math.floor(Rng.hash2(southbound ? 1 : 2, 0, salt + 503) * (TRAFFIC.cars[1] - TRAFFIC.cars[0] + 1));

    /* One car in each equal share of the period, anywhere in its share but
       the last 'gap' of it. That alone keeps every car at least 'gap' clear
       of the next, round the wrap as well. */
    var byColour = {};
    var share = period / count;
    for (var k = 0; k < count; k++) {
      var at = k * share + Rng.hash2(k, southbound ? 1 : 2, salt + 509) * (share - TRAFFIC.gap);
      var colour = Math.floor(Rng.hash2(k, southbound ? 3 : 4, salt + 521) * TRAFFIC.colours);
      (byColour[colour] || (byColour[colour] = [])).push(at);
    }

    var d = MapArt.throughPoints(alongside(points, southbound ? TRAFFIC.lane : -TRAFFIC.lane));

    Object.keys(byColour).forEach(function (colour) {
      var cars = byColour[colour];
      var dashes = [];
      cars.forEach(function (start, i) {
        var next = i + 1 < cars.length ? cars[i + 1] : cars[0] + period;
        dashes.push(TRAFFIC.car, n(next - start - TRAFFIC.car));
      });

      /* The pattern always opens with a dash, so it is shifted to put that
         dash where the first car is. The same shift is written twice: as the
         offset, for when nothing moves, and as how far into its loop the
         animation starts, for when it does. */
      var first = cars[0];
      var into = southbound ? first / period : (period - first) / period;

      append(parent, 'path', {
        class: 'art-car art-car-' + colour + (southbound ? ' art-car-south' : ' art-car-north'),
        d: d, fill: 'none',
        'stroke-dasharray': dashes.join(' '),
        'stroke-dashoffset': n(-first),
        style: 'animation-duration: ' + seconds + 's; animation-delay: ' + n(-into * seconds) + 's'
      });
    });
  }

  /* ---------------------------------------------------------------------
     Lakes and chimneys
     ------------------------------------------------------------------- */

  function drawWaves(parent, ripples, salt) {
    ripples.forEach(function (item, index) {
      append(parent, 'use', {
        href: '#ripple',
        class: 'art-wave art-wave-' + Math.floor(Rng.hash2(index, 13, salt + 613) * WAVES.kinds),
        x: n(item.x - item.size / 2), y: n(item.y - item.size / 2),
        width: n(item.size), height: n(item.size),
        style: 'animation-delay: ' + n(-Rng.hash2(index, 17, salt + 613) * WAVES.spread) + 's'
      });
    });
  }

  function drawSmoke(parent, houses, salt) {
    // Where the chimney stands, in the house symbol's own 0-100 units.
    var top = MapSymbols.chimneyTop;

    /* A puff with a hard edge reads as a bubble. This fades it out to
       nothing at the rim; the colours are in css/mapmotion.css. */
    var soft = append(append(parent, 'defs'), 'radialGradient', { id: 'art-puff' });
    append(soft, 'stop', { offset: '0%', class: 'art-puff-core' });
    append(soft, 'stop', { offset: '50%', class: 'art-puff-mid' });
    append(soft, 'stop', { offset: '100%', class: 'art-puff-edge' });

    houses.forEach(function (house, index) {
      if (Rng.hash2(index, 7, salt + 601) >= SMOKE.share) { return; }

      var left = house.x - house.size / 2;
      var above = house.y - house.size / 2;
      var cx = n(left + house.size * top[0] / 100);
      var cy = n(above + house.size * top[1] / 100);
      var start = Rng.hash2(index, 11, salt + 607) * SMOKE.seconds;

      var chimney = append(parent, 'g', { class: 'art-smoke' });
      for (var k = 0; k < SMOKE.puffs; k++) {
        append(chimney, 'circle', {
          class: 'art-puff', cx: cx, cy: cy, r: n(house.size * SMOKE.radius), fill: 'url(#art-puff)',
          style: 'animation-duration: ' + SMOKE.seconds + 's; animation-delay: ' +
                 n(-(start + k * SMOKE.seconds / SMOKE.puffs)) + 's'
        });
      }
    });
  }

  /* ---------------------------------------------------------------------
     Trees and reeds
     ---------------------------------------------------------------------
     Nothing is drawn: the plants are mapart.js's own, and each is only
     given a class saying how it sways and a start time saying when. The
     lean is a skew pinned at the foot of the plant, so the trunk stays
     planted and only the top moves - see css/mapmotion.css.
     ------------------------------------------------------------------- */

  function swayPlants(plants, width, salt) {
    plants.forEach(function (plant, index) {
      var kind = SWAY.kinds[plant.symbol];
      if (!kind) { return; }

      // Further west, further into the gust already.
      var lead = (1 - plant.x / width) * SWAY.gust + Rng.hash2(index, 37, salt + 631) * SWAY.jitter;
      plant.node.classList.add('art-sway', 'art-sway-' + kind);
      plant.node.style.animationDelay = n(-lead) + 's';

      /* The foot of the plant, in map units. Written out rather than left to
         transform-box: fill-box, because Chromium measures a <use> without
         its x and y - every plant then leaned about a point near the corner
         of the map, and slid across it instead of bending. */
      var foot = plant.y - plant.size / 2 + plant.size * SWAY.foot;
      plant.node.style.transformOrigin = n(plant.x) + 'px ' + n(foot) + 'px';
    });
  }

  /* ---------------------------------------------------------------------
     Cloud shadows
     ------------------------------------------------------------------- */

  function drawSky(salt) {
    var sky = document.createElement('div');
    sky.className = 'art-sky';
    sky.setAttribute('aria-hidden', 'true');

    var band = 100 / CLOUDS.count;
    for (var i = 0; i < CLOUDS.count; i++) {
      var seconds = n(between(CLOUDS.seconds, Rng.hash2(i, 19, salt + 619)));
      var cloud = document.createElement('span');
      cloud.className = 'art-cloud art-cloud-' + Math.floor(Rng.hash2(i, 17, salt + 619) * CLOUDS.kinds);
      // Allowed to start a little above the map, so the top edge gets shade too.
      cloud.style.top = n(i * band - 12 + Rng.hash2(i, 23, salt + 619) * band * 0.5) + '%';
      cloud.style.animationDuration = seconds + 's';
      // Spread along their way across, so the map never opens on an empty sky.
      cloud.style.animationDelay = n(-seconds * (i / CLOUDS.count + Rng.hash2(i, 29, salt + 619) * 0.25)) + 's';
      sky.appendChild(cloud);
    }
    return sky;
  }

  /* ---------------------------------------------------------------------
     Putting it together
     ------------------------------------------------------------------- */

  /* Fills the two groups mapart.js left for it - `life.ground` under the
     trees and `life.air` over them - sets the plants swaying, and returns
     the sky, for the caller to lay over both sheets. `scene` is what
     mapart.js found while drawing: where the river and the road run, where
     the ripples, houses and plants were placed, and the salt it drew them
     with. */
  function draw(life, scene) {
    drawRiver(life.ground, scene.river);
    if (scene.road) {
      drawLane(life.ground, scene.road, true, scene.salt);
      drawLane(life.ground, scene.road, false, scene.salt);
    }
    drawWaves(life.ground, scene.ripples, scene.salt);
    swayPlants(scene.plants, scene.width, scene.salt);
    drawSmoke(life.air, scene.houses, scene.salt);
    return drawSky(scene.salt);
  }

  return { draw: draw };

}(Rng, MapArt, MapSymbols));
