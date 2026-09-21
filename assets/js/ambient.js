/* Ambient — the site's own score, behind the black hole, playing from the start.
 *
 * On load it simply plays. Browsers decide whether sound may start before the
 * visitor has touched the page: Chrome allows it for sites a visitor already listens
 * to, and some visitors allow it everywhere. Where the browser holds it back, the
 * very first touch of any kind starts it: a click, a tap or a key, anywhere on the
 * page. The button in the nav stops it, and starts it again.
 *
 * It loops with a slow fade in and out. It yields to the record: flip the photo and
 * the score fades down for Hatua Kwa Hatua, then comes back when the record stops.
 * It rests in background tabs. Turning it off holds for the rest of the visit.
 */
(function () {
    'use strict';

    var btn = document.getElementById('ambientToggle');
    if (!btn) return;

    var SRC = 'assets/media/ambient-vast-deep-space.mp3';
    var VOL = 0.34, FADE_IN = 2600, FADE_OUT = 900;
    var KEY = 'fg-ambient';

    var audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = 0;

    var wanted = true;           // on by default; the visitor can turn it off
    var yielded = false;         // the record is playing
    var hidden = document.hidden;
    var fadeTimer = null;

    function label() {
        var sounding = wanted && !yielded && !hidden && !audio.paused;
        btn.setAttribute('aria-pressed', String(wanted));
        btn.setAttribute('aria-label', wanted ? 'Turn the music off' : 'Turn the music on');
        btn.classList.toggle('is-on', wanted);
        btn.classList.toggle('is-sounding', sounding);
    }

    function fadeTo(target, ms, done) {
        if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
        var from = audio.volume, steps = Math.max(1, Math.round(ms / 40)), i = 0;
        fadeTimer = setInterval(function () {
            i++;
            var t = i / steps;
            audio.volume = Math.max(0, Math.min(1, from + (target - from) * t * t * (3 - 2 * t)));
            if (i >= steps) {
                clearInterval(fadeTimer); fadeTimer = null;
                if (done) done();
            }
        }, 40);
    }

    function sound() {
        if (!audio.getAttribute('src')) audio.src = SRC;
        // start barely audible rather than silent: Safari would let a silent start through and then
        // pause it as the fade rises, so this way it refuses up front and the first touch takes over
        if (audio.paused && audio.volume < 0.01) audio.volume = 0.01;
        var p = audio.play();
        if (p && typeof p.then === 'function') {
            // a start that lands late must not fade back in over a hush that came after it
            p.then(function () { if (wanted && !yielded && !hidden) fadeTo(VOL, FADE_IN); label(); })
             .catch(function () { if (audio.paused) waitForGesture(); label(); });
        } else {
            fadeTo(VOL, FADE_IN); label();
        }
    }
    var pausedByUs = false;
    function hush() {
        fadeTo(0, FADE_OUT, function () { pausedByUs = true; audio.pause(); label(); });
    }

    // what should be happening, given the choice, the record and the tab
    function settle() {
        if (wanted && !yielded && !hidden && !armed) sound(); else if (!audio.paused) hush();   // while waiting for a first touch, fetch nothing
        label();
    }

    // until the visitor touches the page, the score waits without downloading anything
    var armed = false;
    var TOUCHES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    function go(e) {
        if (e && btn.contains(e.target)) return;             // the button handles its own click
        // try on every part of the touch until one of them is allowed; playing disarms the rest,
        // because some browsers only unlock sound on the release or the click, not the press
        if (wanted && !yielded && !hidden) sound(); else { disarm(); settle(); }
    }
    function waitForGesture() {
        if (armed) return;
        armed = true;
        TOUCHES.forEach(function (t) { window.addEventListener(t, go, true); });
    }
    function disarm() {
        if (!armed) return;
        armed = false;
        TOUCHES.forEach(function (t) { window.removeEventListener(t, go, true); });
    }

    btn.addEventListener('click', function () {
        // on and still waiting for a first interaction: this click is it, so start rather than stop
        if (wanted && audio.paused && !yielded && !hidden) { disarm(); settle(); return; }
        wanted = !wanted;
        try { sessionStorage.setItem(KEY, wanted ? 'on' : 'off'); } catch (e) {}
        settle();
    });

    // the record takes the room while it plays
    window.addEventListener('site:record', function (e) {
        yielded = !!(e.detail && e.detail.playing);
        settle();
    });
    document.addEventListener('visibilitychange', function () {
        hidden = document.hidden;
        settle();
    });
    audio.addEventListener('playing', function () { pausedByUs = false; disarm(); label(); });
    // Safari lets the score start while it is silent, then pauses it itself the moment the fade
    // makes it audible without a touch. A pause we did not ask for waits for the next touch.
    audio.addEventListener('pause', function () {
        if (pausedByUs) pausedByUs = false;
        else if (wanted && !yielded && !hidden) waitForGesture();
        label();
    });

    try { if (sessionStorage.getItem(KEY) === 'off') wanted = false; } catch (e) {}
    label();
    if (wanted) {
        // ask before fetching: only start right away where the browser already allows sound
        var policy = navigator.getAutoplayPolicy ? navigator.getAutoplayPolicy('mediaelement') : 'unknown';
        // listen for the first touch at the same time as trying, so a click that lands while the
        // browser is still deciding is not lost; whichever succeeds first disarms the other
        if (policy === 'disallowed' || policy === 'allowed-muted') waitForGesture();
        else { sound(); waitForGesture(); }
    }

    window.__ambient = {
        wanted: function () { return wanted; },
        playing: function () { return !audio.paused; },
        yielded: function () { return yielded; },
        fetched: function () { return !!audio.getAttribute('src'); }
    };
})();
