/* =========================================================================
   Connecting the Grid - seeded randomness
   =========================================================================

   Every random-looking thing in this game comes from here, and every one of
   them is reproducible: the same seed always produces the same map, drawn
   the same way, for every player, on every load.

   That matters more than it sounds. A map that reshuffled itself under a
   repaint would be unplayable, and a map nobody can reproduce is a map
   nobody can report a bug against. So there is no call to Math.random in
   this project at all - not in the generator, and not in the artwork.

   Three kinds of randomness live here, and they are not interchangeable:

     make(seed)       a stream. Call it repeatedly, get a different value
                      each time. Use it for one-off decisions - which way
                      the river bends, how wide the designated land is.

     hash2(x, y, s)   a lookup. The same coordinates always give the same
                      value, no matter when you ask or in what order. Use it
                      for per-cell decisions that have to survive a repaint.

     noise2 / fbm     smooth fields. Neighbouring coordinates give similar
                      values, so thresholding one produces blobs rather than
                      static. Use it for terrain.

   Exposes one global: Rng.
   ========================================================================= */

var Rng = (function () {
  'use strict';

  /* Ambiguous characters left out on purpose: a seed is meant to be read off
     a screen and typed back in, and 0/O and 1/I/l are where that goes wrong. */
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* ---------------------------------------------------------------------
     Seeds
     ------------------------------------------------------------------- */

  /* xmur3, mixing a string down to one 32 bit integer, so a seed can be a
     short readable word rather than a nine digit number. */
  function seedFrom(value) {
    if (typeof value === 'number' && isFinite(value)) { return value >>> 0; }
    var text = String(value);
    var h = 1779033703 ^ text.length;
    for (var i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* mulberry32. Small, fast, and good enough for a landscape - this is not
     cryptography and does not pretend to be. */
  function make(seed) {
    var a = seedFrom(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A fresh, readable seed. Used by the "New landscape" button.
  function seedString(rng, length) {
    var out = '';
    for (var i = 0; i < length; i++) {
      out += ALPHABET.charAt(Math.floor(rng() * ALPHABET.length) % ALPHABET.length);
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     Hashes: position in, 0-1 out, no state and no allocation
     ------------------------------------------------------------------- */

  function hash2(x, y, salt) {
    var h = Math.imul(x | 0, 374761393) +
            Math.imul(y | 0, 668265263) +
            Math.imul(salt | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------------------------------------------------------------------
     Fields
     ------------------------------------------------------------------- */

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Smoothstep. Flattens the slope at both ends so the lattice does not show
  // through as a grid of diamonds, which linear interpolation alone does.
  function ease(t) { return t * t * (3 - 2 * t); }

  /* Value noise on a hashed integer lattice. Returns a sampler; sample it at
     fractional coordinates for a smooth field, at whole ones for the lattice
     values themselves. */
  function noise2(seed) {
    var salt = seedFrom(seed) | 0;
    return function (x, y) {
      var x0 = Math.floor(x);
      var y0 = Math.floor(y);
      var fx = ease(x - x0);
      var fy = ease(y - y0);
      return lerp(
        lerp(hash2(x0, y0, salt), hash2(x0 + 1, y0, salt), fx),
        lerp(hash2(x0, y0 + 1, salt), hash2(x0 + 1, y0 + 1, salt), fx),
        fy
      );
    };
  }

  /* Fractional Brownian motion: the same field sampled at doubling
     frequencies and halving amplitudes, summed. One octave is soft blobs;
     three gives blobs with a ragged edge, which is what land looks like.
     Normalised back to 0-1 so the thresholds above it stay meaningful. */
  function fbm(sampler, octaves, gain) {
    return function (x, y) {
      var total = 0;
      var amplitude = 1;
      var frequency = 1;
      var norm = 0;
      for (var i = 0; i < octaves; i++) {
        total += sampler(x * frequency, y * frequency) * amplitude;
        norm += amplitude;
        amplitude *= gain;
        frequency *= 2;
      }
      return total / norm;
    };
  }

  /* ---------------------------------------------------------------------
     Small conveniences
     ------------------------------------------------------------------- */

  function int(rng, limit) { return Math.floor(rng() * limit); }

  // An integer in low..high, both ends included.
  function between(rng, low, high) { return low + int(rng, high - low + 1); }

  function pick(rng, list) { return list[int(rng, list.length)]; }

  function chance(rng, probability) { return rng() < probability; }

  // Fisher-Yates, in place, from a seeded stream.
  function shuffle(rng, list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = int(rng, i + 1);
      var swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  return {
    seedFrom: seedFrom,
    make: make,
    seedString: seedString,
    hash2: hash2,
    noise2: noise2,
    fbm: fbm,
    int: int,
    between: between,
    pick: pick,
    chance: chance,
    shuffle: shuffle,
    alphabet: ALPHABET
  };

}());

/* Lets Node load this file for the generator and balance tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rng;
}
