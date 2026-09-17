/* Ambient — the site's own score, behind the black hole, on by default.
 *
 * A sound button in the nav, pressed from the start. Browsers will not play sound
 * a visitor has not interacted with, so where the browser allows it the score
 * starts at once, and everywhere else it starts on the first click or key press
 * anywhere on the page. Until then the button shows the music as on and waiting.
 * The file is not fetched while it waits, so a visitor who never interacts never
 * downloads it.
 *
 * It loops with a slow fade in and out. It yields to the record: flip the photo and
 * the score fades down for Hatua Kwa Hatua, then comes back when the record stops.
 * It rests in background tabs. Turning it off holds for the rest of the visit.
 */
(function () {
    'use strict';

    var btn = document.getElementById('ambientToggle');
    if (!btn) return;

    var SRC = 'assets/media/ambient-interstellar-inspo.mp3';
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
        var p = audio.play();
        if (p && typeof p.then === 'function') {
            p.then(function () { fadeTo(VOL, FADE_IN); label(); })
             .catch(function () { waitForGesture(); label(); });
        } else {
            fadeTo(VOL, FADE_IN); label();
        }
    }
    function hush() {
        fadeTo(0, FADE_OUT, function () { audio.pause(); label(); });
    }

    // what should be happening, given the choice, the record and the tab
    function settle() {
        if (wanted && !yielded && !hidden && !armed) sound(); else if (!audio.paused) hush();   // while waiting for a first touch, fetch nothing
        label();
    }

    // until the visitor touches the page, the score waits without downloading anything
    var armed = false;
    function go(e) {
        if (e && btn.contains(e.target)) return;             // the button handles its own click
        disarm();
        settle();
    }
    function waitForGesture() {
        if (armed) return;
        armed = true;
        window.addEventListener('pointerdown', go, true);
        window.addEventListener('keydown', go, true);
    }
    function disarm() {
        if (!armed) return;
        armed = false;
        window.removeEventListener('pointerdown', go, true);
        window.removeEventListener('keydown', go, true);
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
    audio.addEventListener('playing', label);
    audio.addEventListener('pause', label);

    try { if (sessionStorage.getItem(KEY) === 'off') wanted = false; } catch (e) {}
    label();
    if (wanted) {
        // ask before fetching: only start right away where the browser already allows sound
        var policy = navigator.getAutoplayPolicy ? navigator.getAutoplayPolicy('mediaelement') : 'unknown';
        if (policy === 'allowed') settle(); else waitForGesture();
    }

    window.__ambient = {
        wanted: function () { return wanted; },
        playing: function () { return !audio.paused; },
        yielded: function () { return yielded; },
        fetched: function () { return !!audio.getAttribute('src'); }
    };
})();
