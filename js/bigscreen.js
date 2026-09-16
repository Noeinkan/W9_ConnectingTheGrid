/* =========================================================================
   Connecting the Grid - on a big screen
   =========================================================================

   Two things for showing the game on a television at a show. The third -
   everything growing with the screen - needs no script at all: see
   css/bigscreen.css.

   The full-screen button, for everyone. F11 does the same, but a button
   in the top bar is what gets found on the day. It hides itself where the
   browser will not go full screen.

   Kiosk mode, only when the address carries ?kiosk. Nothing about it is
   right for a player at home, which is why it is asked for rather than
   guessed from the size of the screen: a desktop monitor and a television
   can report exactly the same size.

     * The mouse pointer hides after a few seconds without moving, so it
       is not left parked in the middle of the map.

     * A fresh start once nobody has played for a while. With a route
       started, a dialog or the tour open, or a switch changed, and no
       touch, key or mouse movement for CONFIG.kiosk.idleResetSeconds, the
       next visitor gets a clean landscape instead of somebody else's half-
       built line. The last few seconds are counted down on screen, and
       anything at all cancels it. An untouched landscape is left alone, so
       an empty stand is not rolling new maps every two minutes.

   The ?kiosk survives new landscapes and reloads because the address bar
   code in js/game.js keeps it. Timings are in CONFIG.kiosk, words in
   CONFIG.copy.

   Loaded after js/game.js, because it drives the game from outside rather
   than being called by it.

   Exposes one global: BigScreen.
   ========================================================================= */

var BigScreen = (function (CFG, Render, Tour, Game) {
  'use strict';

  var ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];

  var els = {};
  var lastActive = 0;
  var lastMoved = 0;
  // How the two switches in the rail were when the page opened.
  var switchesAtStart = [];

  function byId(id) { return document.getElementById(id); }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole;
    });
  }

  /* ---------------------------------------------------------------------
     Full screen
     ------------------------------------------------------------------- */

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function wireFullscreen() {
    var button = byId('fullscreenButton');
    if (!button) { return; }
    var root = document.documentElement;
    var enter = root.requestFullscreen || root.webkitRequestFullscreen;
    var leave = document.exitFullscreen || document.webkitExitFullscreen;
    if (!enter || !leave || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
      button.hidden = true;
      return;
    }

    function paint() {
      button.textContent = fullscreenElement() ? CFG.copy.fullscreenLeave : CFG.copy.fullscreenEnter;
    }

    button.addEventListener('click', function () {
      var asked = fullscreenElement() ? leave.call(document) : enter.call(root);
      // Refused - by a browser policy, or an embedding page. Nothing to do.
      if (asked && asked.catch) { asked.catch(function () {}); }
    });
    document.addEventListener('fullscreenchange', paint);
    document.addEventListener('webkitfullscreenchange', paint);
    paint();
    button.hidden = false;
  }

  /* ---------------------------------------------------------------------
     Kiosk mode
     ------------------------------------------------------------------- */

  function askedForKiosk() {
    try {
      return /[?&]kiosk(=|&|$)/.test(String(location.search || ''));
    } catch (ignored) {
      return false;
    }
  }

  function onActivity(event) {
    var now = Date.now();
    lastActive = now;
    if (event.type === 'pointermove' || event.type === 'pointerdown') {
      lastMoved = now;
      document.documentElement.removeAttribute('data-pointer-idle');
    }
    hideNotice();
  }

  /* Anything the last visitor could have left behind. The rail's drawers
     are not on the list: an open legend is no harm to the next person, and
     it is closed anyway once there is some other reason to start afresh. */
  function somethingLeftBehind() {
    if (Game.state.route.length) { return true; }
    if (Tour.isOpen()) { return true; }
    if (document.querySelector('dialog[open]')) { return true; }
    return switchesAtStart.some(function (entry) { return entry.el.checked !== entry.checked; });
  }

  function freshStart() {
    hideNotice();
    if (Tour.isOpen()) { Tour.finish(); }
    Array.prototype.forEach.call(document.querySelectorAll('dialog[open]'), Render.closeDialog);
    Array.prototype.forEach.call(document.querySelectorAll('.rail details[open]'), function (drawer) {
      drawer.open = false;
    });

    // Through their own change handlers, so the game hears about it.
    switchesAtStart.forEach(function (entry) {
      if (entry.el.checked === entry.checked) { return; }
      entry.el.checked = entry.checked;
      entry.el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    if (els.seedInput) { els.seedInput.value = ''; }
    Render.hideTip();
    Game.newMap();

    if (els.rail) { els.rail.scrollTop = 0; }
    if (document.activeElement && document.activeElement !== document.body &&
        document.activeElement.blur) {
      document.activeElement.blur();
    }
    lastActive = Date.now();
  }

  function tick() {
    var settings = CFG.kiosk;
    var now = Date.now();

    if (now - lastMoved >= settings.pointerHideSeconds * 1000) {
      document.documentElement.setAttribute('data-pointer-idle', '');
    }

    if (!somethingLeftBehind()) { hideNotice(); return; }
    var left = Math.ceil(settings.idleResetSeconds - (now - lastActive) / 1000);
    if (left <= 0) { freshStart(); return; }
    if (left <= settings.idleWarningSeconds) { showNotice(left); } else { hideNotice(); }
  }

  /* The countdown. The visible line changes every second; what a screen
     reader hears is said once, when it appears, rather than every tick. */
  function buildNotice() {
    var notice = document.createElement('div');
    notice.className = 'kiosk-notice';
    // A popover sits above an open modal dialog; without one, hidden will do.
    els.popover = typeof notice.showPopover === 'function';
    if (els.popover) { notice.setAttribute('popover', 'manual'); } else { notice.hidden = true; }

    els.noticeText = document.createElement('span');
    els.noticeText.setAttribute('aria-hidden', 'true');
    els.noticeSpoken = document.createElement('span');
    els.noticeSpoken.className = 'visually-hidden';
    els.noticeSpoken.setAttribute('role', 'status');

    notice.appendChild(els.noticeText);
    notice.appendChild(els.noticeSpoken);
    document.body.appendChild(notice);
    els.notice = notice;
  }

  function noticeShowing() {
    return els.popover ? els.notice.matches(':popover-open') : !els.notice.hidden;
  }

  function showNotice(seconds) {
    els.noticeText.textContent = fill(CFG.copy.kioskIdleNotice, { n: seconds });
    if (noticeShowing()) { return; }
    if (els.popover) { els.notice.showPopover(); } else { els.notice.hidden = false; }
    els.noticeSpoken.textContent = fill(CFG.copy.kioskIdleSpoken, { n: seconds });
  }

  function hideNotice() {
    if (!els.notice || !noticeShowing()) { return; }
    if (els.popover) { els.notice.hidePopover(); } else { els.notice.hidden = true; }
    els.noticeSpoken.textContent = '';
  }

  function startKiosk() {
    els.rail = document.querySelector('.rail');
    els.seedInput = byId('seedInput');
    ['committedToggle', 'blindToggle'].forEach(function (id) {
      var el = byId(id);
      if (el) { switchesAtStart.push({ el: el, checked: el.checked }); }
    });

    buildNotice();
    lastActive = lastMoved = Date.now();
    /* On the window and in the capture phase, so nothing on the page can
       swallow the event first - the tour stops keys reaching the game. */
    ACTIVITY.forEach(function (type) {
      window.addEventListener(type, onActivity, { capture: true, passive: true });
    });
    window.setInterval(tick, 1000);
  }

  function init() {
    wireFullscreen();
    if (askedForKiosk()) { startKiosk(); }
  }

  return {
    init: init,
    freshStart: freshStart
  };

}(CONFIG, Render, Tour, Game));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', BigScreen.init);
} else {
  BigScreen.init();
}
