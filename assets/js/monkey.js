(function () {
    'use strict';
    var companion = document.getElementById('monkeyCompanion');
    var about = document.getElementById('about');
    if (!companion || !about) return;

    var video = document.getElementById('monkeyVideo');
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
        video.pause();
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
                companion.classList.remove('has-frame');
                video.pause();
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
        companion.classList.add('has-frame');
        updateButton();
    });
    function suspendDrift() {
        actualPlaying = false;
        updateButton();
    }
    video.addEventListener('pause', suspendDrift);
    video.addEventListener('ended', suspendDrift);
    video.addEventListener('waiting', suspendDrift);
    video.addEventListener('error', function () {
        playbackBlocked = true;
        companion.classList.remove('has-frame');
        stop();
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
