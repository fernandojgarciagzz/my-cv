(function () {
    'use strict';
    var companion = document.getElementById('monkeyCompanion');
    var about = document.getElementById('about');
    if (!companion || !about) return;

    var video = document.getElementById('monkeyVideo');
    var still = companion.querySelector('.monkey-art img');
    var art = companion.querySelector('.monkey-art');
    var toggle = document.getElementById('monkeyToggle');
    var dismiss = document.getElementById('monkeyDismiss');
    var options = document.getElementById('monkeyOptions');
    var panel = document.getElementById('monkeyPanel');
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var print = window.matchMedia('print');
    var dismissed = false;
    try { dismissed = sessionStorage.getItem('fg-monkey-dismissed') === '1'; } catch (e) {}
    var manualPause = false;
    var explicitPlay = false;
    var playbackBlocked = false;
    var playingPending = false;
    var actualPlaying = false;
    var printing = false;
    var queued = false;
    var attempt = 0;

    /* The artwork is a subject over black, so it is already premultiplied: the alpha is the
       brightness and the colour divides back out. Keying it here lets the astronaut float on
       the page instead of sitting in a dark tile. */
    var LO = 0.085, HI = 0.22, KEY_W = 448;
    var keyed = document.createElement('canvas');
    keyed.className = 'monkey-keyed';
    keyed.setAttribute('aria-hidden', 'true');
    art.appendChild(keyed);
    var kctx = keyed.getContext('2d', { willReadFrequently: true });
    var sized = false, drawing = false, vfc = null;

    function fit(src, sw, sh) {
        if (sized || !sw || !sh) return sized;
        var w = Math.min(KEY_W, sw);
        keyed.width = Math.round(w);
        keyed.height = Math.round(w * sh / sw);
        sized = true;
        return true;
    }
    function cut(src, sw, sh) {
        if (!fit(src, sw, sh)) return;
        var w = keyed.width, h = keyed.height;
        kctx.clearRect(0, 0, w, h);
        kctx.drawImage(src, 0, 0, w, h);
        var img, d, i, m, a, inv;
        try { img = kctx.getImageData(0, 0, w, h); } catch (e) { return; }
        d = img.data;
        for (i = 0; i < d.length; i += 4) {
            m = (d[i] > d[i + 1] ? (d[i] > d[i + 2] ? d[i] : d[i + 2]) : (d[i + 1] > d[i + 2] ? d[i + 1] : d[i + 2])) / 255;
            a = (m - LO) / (HI - LO);
            if (a <= 0) { d[i + 3] = 0; continue; }
            if (a > 1) a = 1; else a = a * a * (3 - 2 * a);           // ease the knee so the sky lets go cleanly
            inv = 1 / (a < 0.25 ? 0.25 : a);                       // divide the black back out of the edge
            d[i] = d[i] * inv > 255 ? 255 : d[i] * inv;
            d[i + 1] = d[i + 1] * inv > 255 ? 255 : d[i + 1] * inv;
            d[i + 2] = d[i + 2] * inv > 255 ? 255 : d[i + 2] * inv;
            d[i + 3] = a * 255;
        }
        kctx.putImageData(img, 0, 0);
        companion.classList.add('has-frame');
    }
    function cutStill() {
        if (still && still.complete && still.naturalWidth) cut(still, still.naturalWidth, still.naturalHeight);
    }
    function cutFrame() {
        if (!drawing) return;
        if (video.readyState >= 2) cut(video, video.videoWidth, video.videoHeight);
        if (video.requestVideoFrameCallback) vfc = video.requestVideoFrameCallback(cutFrame);
        else vfc = window.requestAnimationFrame(cutFrame);
    }
    function startCutting() {
        if (drawing) return;
        drawing = true;
        cutFrame();
    }
    function stopCutting() {
        drawing = false;
        if (vfc !== null) {
            if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfc);
            else window.cancelAnimationFrame(vfc);
            vfc = null;
        }
    }
    if (still) { if (still.complete) cutStill(); else still.addEventListener('load', cutStill); }

    function updateButton() {
        var playing = !video.paused && !video.ended;
        companion.classList.toggle('is-playing', actualPlaying && playing && !document.hidden && !companion.hidden);
        var label = (playing ? 'Pause' : 'Play') + ' astronaut animation';
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        toggle.firstElementChild.textContent = playing ? 'Pause' : 'Play';
    }

    function closeOptions(restoreFocus) {
        panel.hidden = true;
        options.setAttribute('aria-expanded', 'false');
        if (restoreFocus) options.focus({ preventScroll: true });
    }

    function stop() {
        attempt++;
        playingPending = false;
        actualPlaying = false;
        stopCutting();
        video.pause();
        cutStill();
        updateButton();
    }

    function canAnimate() {
        return !manualPause && !playbackBlocked && (!motion.matches || explicitPlay);
    }

    function start() {
        if (playingPending || !video.paused) return;
        if (!video.hasAttribute('src')) video.src = 'assets/media/monkey-loop.mp4';
        video.muted = true;
        playingPending = true;
        var currentAttempt = ++attempt;
        var result = video.play();
        if (result && typeof result.then === 'function') {
            result.then(function () {
                if (currentAttempt !== attempt) return;
                playingPending = false;
                updateButton();
            }).catch(function () {
                if (currentAttempt !== attempt) return;
                playingPending = false;
                playbackBlocked = true;
                video.pause();
                cutStill();
                updateButton();
            });
        } else {
            playingPending = false;
        }
    }

    function update() {
        queued = false;
        var unavailable = dismissed || printing || print.matches || document.documentElement.classList.contains('light');
        var top = unavailable ? Infinity : about.getBoundingClientRect().top;
        var visible = !unavailable && top <= window.innerHeight * 0.8;
        companion.hidden = !visible;
        if (!visible) closeOptions(false);
        // Assigning src is delayed until About is near, and never done for reduced motion
        // until the visitor explicitly requests playback.
        if (!unavailable && !document.hidden && top <= window.innerHeight + 300 && canAnimate() && !video.hasAttribute('src')) {
            video.src = 'assets/media/monkey-loop.mp4';
        }
        if (visible && !document.hidden && canAnimate()) start();
        else stop();
    }

    function schedule() {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(update);
    }

    toggle.addEventListener('click', function () {
        if (!video.paused || playingPending) {
            manualPause = true;
            stop();
        } else {
            manualPause = false;
            explicitPlay = true;
            playbackBlocked = false;
            update();
        }
        closeOptions(true);
    });
    options.addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        options.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.addEventListener('pointerdown', function (event) {
        if (!panel.hidden && !companion.contains(event.target)) closeOptions(false);
    });
    companion.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !panel.hidden) {
            event.preventDefault();
            closeOptions(true);
        }
    });
    companion.addEventListener('focusout', function (event) {
        if (!companion.contains(event.relatedTarget)) closeOptions(false);
    });
    dismiss.addEventListener('click', function () {
        dismissed = true;
        try { sessionStorage.setItem('fg-monkey-dismissed', '1'); } catch (e) {}
        update();
    });
    video.addEventListener('playing', function () {
        actualPlaying = true;
        startCutting();
        updateButton();
    });
    function suspendDrift() {
        actualPlaying = false;
        stopCutting();
        updateButton();
    }
    video.addEventListener('pause', suspendDrift);
    video.addEventListener('ended', suspendDrift);
    video.addEventListener('waiting', suspendDrift);
    video.addEventListener('error', function () {
        playbackBlocked = true;
        stop();
        cutStill();
    });
    function motionChanged() {
        explicitPlay = false;
        update();
    }
    if (motion.addEventListener) motion.addEventListener('change', motionChanged);
    else motion.addListener(motionChanged);
    if (print.addEventListener) print.addEventListener('change', update);
    else print.addListener(update);
    window.addEventListener('beforeprint', function () { printing = true; update(); });
    window.addEventListener('afterprint', function () { printing = false; update(); });
    document.addEventListener('visibilitychange', update);
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('load', schedule);
    update();
})();
