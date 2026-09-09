/* Easter eggs for index.html — loaded after first paint (on idle after `load`,
 * or on the first click of the profile photo). Nothing here is needed for the
 * page to read correctly.
 *
 *   1. Vinyl: click the photo → it flips into a record, spins, plays
 *      "Hatua Kwa Hatua" and switches the page (and the galaxy) to Claude
 *      Mode, the warm palette. Click again (or let the song end) to flip back.
 *   2. Robot runner: when the vinyl activates, a pixel robot runs from the
 *      record to the hero actions and becomes the Playground button. Flipping
 *      back shatters the button.
 *   3. Reader: the seven-book Kindle widget (rendered statically in the HTML;
 *      this makes the table of contents interactive).
 */
(function () {
    'use strict';

    function accentColor() {
        var v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
        return v || '#3B5775';
    }

    /* ── 1. Vinyl ─────────────────────────────────────────────────────── */
    (function vinyl() {
        var audio = document.getElementById('easterEggAudio');
        var container = document.getElementById('photoContainer');
        var trigger = document.getElementById('vinylTrigger');
        if (!audio || !container || !trigger) return;

        var FADE = 600, VOL = 0.6, playing = false, timers = [];
        var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        audio.volume = VOL;
        function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
        function clearTimers() { timers.forEach(clearTimeout); timers = []; }

        // The record behind the photo (assets/js/vinyl.js). The photo becomes the label: the record starts at label
        // size, hidden behind the photo, and grows out as the photo shrinks to meet it.
        var LABEL = 0.335, TILT = 0.36, GROW = 700, HANDOFF = 250, SETTLE = 650, ARM = 1000;
        var stage = document.getElementById('vinylStage'), vcanvas = document.getElementById('vinylCanvas');
        var photo = container.querySelector('.photo-face img'), view = null;
        function whenThree(cb) { var n = 0; (function poll() { if (window.THREE) cb(); else if (++n < 80) setTimeout(poll, 50); })(); }
        function mountVinyl() {
            if (view || !vcanvas) return;
            whenThree(function () {
                var go = function () {
                    if (view || !window.Vinyl) return;
                    view = window.Vinyl.create(vcanvas, {
                        album: 'Roho', title: 'Hatua Kwa Hatua', artist: 'Fernando García', num: '01',
                        photo: photo, uprightLabel: true, arm: true, band: 0, scale: LABEL, tilt: 0, hover: false, hoverEl: container,
                        onReady: function () { if (stage) stage.classList.add('is-live'); }
                    });
                    if (playing) view.set({ scale: 1, tilt: TILT, arm: 1, band: 1, hover: true });
                    if (playing && container.classList.contains('vinyl-spinning')) view.play();
                };
                if (window.Vinyl) { go(); return; }
                var s = document.createElement('script'); s.src = 'assets/js/vinyl.js?v=6'; s.onload = go; document.body.appendChild(s);
            });
        }
        mountVinyl();

        function fadeIn() {
            audio.volume = 0;
            audio.play().then(function () {
                var s = 0, n = 30;
                var iv = setInterval(function () {
                    s++;
                    audio.volume = Math.min(VOL, (s / n) * VOL);
                    if (s >= n) clearInterval(iv);
                }, FADE / n);
            }).catch(function () {});
        }
        function fadeOut(cb) {
            var v0 = audio.volume;
            if (v0 === 0 || audio.paused) { audio.pause(); if (cb) cb(); return; }
            var s = 0, n = 20;
            var iv = setInterval(function () {
                s++;
                audio.volume = Math.max(0, v0 * (1 - s / n));
                if (s >= n) { clearInterval(iv); audio.pause(); audio.volume = VOL; if (cb) cb(); }
            }, FADE / n);
        }
        function claude(on) {
            document.documentElement.classList.toggle('claude-mode', on);
            document.body.classList.toggle('claude-mode', on);
        }
        function activate() {
            playing = true; clearTimers();
            container.classList.add('vinyl-active');                            // the photo shrinks; the stage fades in
            if (reduce) {
                container.classList.add('vinyl-live', 'vinyl-spinning');
                if (view) view.set({ scale: 1, tilt: TILT, arm: 1, band: 1, hover: false });
                claude(true); fadeIn();
                return;
            }
            if (view) { view.set({ scale: LABEL, tilt: 0, arm: 0, band: 0, hover: false }); view.animate({ scale: 1 }, GROW, 'photo'); }   // the record grows on the photo's own curve
            later(function () { container.classList.add('vinyl-live'); }, GROW);            // the photo hands off to the label
            later(function () {
                claude(true);
                if (view) view.animate({ tilt: TILT, band: 1 }, SETTLE, 'inout');           // the record leans back, the label gets its print
            }, GROW + HANDOFF);
            later(function () {
                if (!playing) return;
                container.classList.add('vinyl-spinning');
                if (view) { view.play(); view.animate({ arm: 1 }, ARM, 'inout'); view.set({ hover: true }); }   // motor on, the arm swings in and drops
            }, GROW + HANDOFF + 300);
            later(function () { if (playing) fadeIn(); }, GROW + HANDOFF + 300 + ARM - 120);   // the needle lands: music
        }
        function settle() {                                                     // everything back where it was
            container.classList.remove('vinyl-spinning');
            if (view) { view.stop(); view.set({ hover: false }); }
            if (reduce) {
                container.classList.remove('vinyl-live', 'vinyl-active'); claude(false);
                if (view) view.set({ scale: LABEL, tilt: 0, arm: 0, band: 0 });
                return;
            }
            if (view) view.animate({ arm: 0 }, 700, 'inout');                             // the arm lifts and swings out
            later(function () { claude(false); if (view) view.animate({ tilt: 0, band: 0 }, 500, 'inout'); }, 500);
            later(function () { container.classList.remove('vinyl-live'); }, 1050);       // the photo returns over the label
            later(function () {
                container.classList.remove('vinyl-active');                             // the photo grows back; the record shrinks behind it
                if (view) view.animate({ scale: LABEL }, GROW, 'photo');
            }, 1300);
        }
        function deactivate() {
            playing = false; clearTimers();
            fadeOut(function () { audio.currentTime = 0; });
            settle();
        }
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (playing) deactivate(); else activate();
        });
        if (stage) stage.addEventListener('click', function (e) { e.stopPropagation(); if (playing) deactivate(); });
        audio.addEventListener('ended', function () {
            playing = false; clearTimers();
            settle();
        });
    })();

    /* ── 2. Robot runner ───────────────────────────────────────────────── */
    (function robot() {
        var overlay = document.getElementById('robotRunnerCanvas');
        var btn = document.getElementById('playgroundBtn');
        var container = document.getElementById('photoContainer');
        var btnCanvas = document.getElementById('playgroundBtnRobot');
        if (!overlay || !btn || !container) return;

        var SPR_STAND = [
            [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,1,0,1,1,0,1,0,0],
            [0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],
            [0,0,1,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,0,0,1,0,0,0],
            [0,0,1,1,0,0,1,1,0,0],[0,0,1,1,0,0,1,1,0,0]
        ];
        var SPR_RUN = [
            [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,1,0,1,1,0,1,0,0],
            [0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0],
            [0,0,1,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,0,0,0,1,0,0],
            [0,1,1,0,0,0,0,1,1,0],[0,1,0,0,0,0,0,0,1,0]
        ];
        var PX = 3;
        var octx = overlay.getContext('2d');

        function drawSprite(ctx, spr, x, y, px, color) {
            ctx.fillStyle = color;
            for (var r = 0; r < spr.length; r++)
                for (var c = 0; c < spr[r].length; c++)
                    if (spr[r][c] === 1) ctx.fillRect(x + c * px, y + r * px, px, px);
        }
        if (btnCanvas) {
            var bCtx = btnCanvas.getContext('2d'), bPx = 2;
            btnCanvas.width = SPR_STAND[0].length * bPx;
            btnCanvas.height = SPR_STAND.length * bPx;
            drawSprite(bCtx, SPR_STAND, 0, 0, bPx, '#FFFFFF');
        }

        var robotState = 'idle', animFrame = 0, rafId = null, delayTimer = null;
        var robotX, robotY, targetX, targetY, startX, startY, trail = [];
        var DURATION = 120;

        function resizeOverlay() {
            var dpr = window.devicePixelRatio || 1;
            overlay.width = window.innerWidth * dpr;
            overlay.height = window.innerHeight * dpr;
            octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resizeOverlay();
        window.addEventListener('resize', resizeOverlay);

        function getVinylCenter() {
            // the robot sets off from the record's lower-left edge, not from the label (his face)
            var stage = document.getElementById('vinylStage');
            if (stage) { var sr = stage.getBoundingClientRect(); return { x: sr.left + sr.width * 0.24, y: sr.top + sr.height * 0.68 }; }
            var rect = document.getElementById('vinylTrigger').getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        function getButtonTarget() {
            var wasVisible = btn.classList.contains('visible');
            if (!wasVisible) { btn.style.display = 'inline-flex'; btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; void btn.offsetHeight; }
            var rect = btn.getBoundingClientRect();
            var pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            if (!wasVisible) { btn.style.display = ''; btn.style.opacity = ''; btn.style.pointerEvents = ''; }
            return pos;
        }
        function cancelAnimation() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
            octx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            overlay.classList.remove('active');
            trail = [];
        }
        function animateRobot() {
            if (robotState !== 'running-forward') return;
            animFrame++;
            var COLOR = accentColor();
            octx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            var progress = Math.min(1, animFrame / DURATION);
            var eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            robotX = startX + (targetX - startX) * eased;
            robotY = startY + (targetY - startY) * eased;
            var bounce = Math.abs(Math.sin(animFrame * 0.18)) * 10 * (1 - progress * 0.5);
            var spr = (Math.floor(animFrame / 7) % 2 === 0) ? SPR_STAND : SPR_RUN;
            var sprW = spr[0].length * PX, sprH = spr.length * PX;
            if (animFrame % 4 === 0 && progress < 0.9) {
                trail.push({ x: robotX - sprW / 2 + Math.random() * sprW, y: robotY + Math.random() * 4, life: 30, size: 2 + Math.random() * 2 });
            }
            for (var i = trail.length - 1; i >= 0; i--) {
                var p = trail[i]; p.life--;
                if (p.life <= 0) { trail.splice(i, 1); continue; }
                octx.globalAlpha = p.life / 30 * 0.4; octx.fillStyle = COLOR; octx.fillRect(p.x, p.y, p.size, p.size);
            }
            octx.globalAlpha = 1;
            drawSprite(octx, spr, robotX - sprW / 2, robotY - sprH - bounce, PX, COLOR);
            if (progress >= 1) {
                octx.clearRect(0, 0, window.innerWidth, window.innerHeight);
                overlay.classList.remove('active');
                trail = []; robotState = 'arrived'; btn.classList.add('visible'); rafId = null;
                return;
            }
            rafId = requestAnimationFrame(animateRobot);
        }
        function runForward() {
            cancelAnimation();
            overlay.classList.add('active');
            resizeOverlay();
            var from = getVinylCenter(), to = getButtonTarget();
            startX = from.x; startY = from.y; targetX = to.x; targetY = to.y;
            animFrame = 0; robotState = 'running-forward';
            rafId = requestAnimationFrame(animateRobot);
        }

        var shatterParticles = [], shatterRafId = null;
        function shatterButton() {
            cancelAnimation();
            var rect = btn.getBoundingClientRect();
            var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            shatterParticles = [];
            for (var i = 0; i < 24; i++) {
                var angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 5;
                shatterParticles.push({
                    x: cx + (Math.random() - 0.5) * rect.width, y: cy + (Math.random() - 0.5) * rect.height,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
                    life: 40 + Math.random() * 20, maxLife: 60, size: 3 + Math.random() * 5,
                    rotation: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.3
                });
            }
            btn.classList.remove('visible');
            overlay.classList.add('active');
            resizeOverlay();
            robotState = 'shattering';
            animateShatter();
        }
        function animateShatter() {
            if (robotState !== 'shattering') return;
            var COLOR = accentColor();
            octx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            var alive = false;
            for (var i = shatterParticles.length - 1; i >= 0; i--) {
                var p = shatterParticles[i];
                p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.98; p.rotation += p.rotSpeed; p.life--;
                if (p.life <= 0) { shatterParticles.splice(i, 1); continue; }
                alive = true;
                octx.save(); octx.globalAlpha = p.life / p.maxLife; octx.translate(p.x, p.y); octx.rotate(p.rotation);
                octx.fillStyle = COLOR; octx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); octx.restore();
            }
            if (!alive) {
                octx.clearRect(0, 0, window.innerWidth, window.innerHeight);
                overlay.classList.remove('active');
                shatterParticles = []; robotState = 'idle'; shatterRafId = null;
                return;
            }
            shatterRafId = requestAnimationFrame(animateShatter);
        }

        var prevActive = false;
        new MutationObserver(function () {
            var isActive = container.classList.contains('vinyl-active');
            if (isActive === prevActive) return;
            prevActive = isActive;
            if (isActive) {
                cancelAnimation();
                if (shatterRafId) { cancelAnimationFrame(shatterRafId); shatterRafId = null; }
                robotState = 'waiting';
                delayTimer = setTimeout(function () {
                    delayTimer = null;
                    if (container.classList.contains('vinyl-active')) runForward(); else robotState = 'idle';
                }, 1400);
            } else {
                if (robotState === 'waiting') { cancelAnimation(); robotState = 'idle'; }
                else if (robotState === 'arrived' || robotState === 'running-forward') shatterButton();
            }
        }).observe(container, { attributes: true, attributeFilter: ['class'] });
    })();

    /* ── 3. Reader ─────────────────────────────────────────────────────── */
    (function reader() {
        var books = [
            { title: 'The Power of Your Subconscious Mind', author: 'Joseph Murphy', note: 'My entry point into this whole genre — the book that opened the door to everything else on this list. Older and more spiritual than I expected, but the core idea stuck: your subconscious takes whatever you repeatedly think as instruction. The chapters on autosuggestion before sleep changed how I end my days.' },
            { title: 'The Power of Now', author: 'Eckhart Tolle', note: 'My personal favorite. The book that taught me to notice the difference between me and my thoughts — and that the present moment is all we ever actually have. Tolle’s idea of the “pain-body” alone is worth the read; it gave me language for patterns I’d been running on autopilot for years.' },
            { title: 'A New Earth', author: 'Eckhart Tolle', note: 'Picks up where The Power of Now leaves off, but zoomed out: how ego shows up in relationships, complaining, and the things we identify with. Less practical than the first, more honest about how collective the problem is.' },
            { title: 'Secrets of the Millionaire Mind', author: 'T. Harv Eker', note: 'Eker’s idea that you inherit a “money blueprint” from childhood reframed the whole topic for me — wealth is a thinking habit before it’s a number. The 17 contrasts between rich-mindset and poor-mindset thinking are uncomfortably specific; I caught myself in several.' },
            { title: 'Think and Grow Rich', author: 'Napoleon Hill', note: 'Another favorite of mine. Don’t let the title fool you — it’s about abundance, not just money. Hill’s central idea is that how we think is how we create: thoughts, faith, and a definite purpose are the raw materials, and wealth is only one of the forms they take. He spent 20 years interviewing the wealthiest industrialists of his time and distilled it into 13 principles, repetitive on purpose because he wanted them drilled in. The chapter on definite purpose is the one I keep coming back to.' },
            { title: 'The Almanack of Naval Ravikant', author: 'Eric Jorgenson', note: 'Naval’s clearest thinking, organized into two halves: how to get rich (own equity, build specific knowledge, use leverage that doesn’t require permission) and how to be happy (desire is a contract you make to be unhappy until you get what you want). Reads like a friend’s notebook — dense, re-readable, every page quotable.' },
            { title: 'Manifest', author: 'Roxie Nafousi', note: 'Nafousi’s 7-step framework is what makes the spiritual ideas in the other books actually executable — be clear, remove fear, align your actions, trust the timing. The chapter on turning envy into inspiration was the one I underlined the most: every time you feel jealous, that’s data about what you actually want.' }
        ];
        var tocList = document.getElementById('kindleTocList');
        var pane = document.getElementById('kindleReaderPane');
        var countEl = document.getElementById('kindleCount');
        if (!tocList || !pane) return;

        var current = 0;
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
        function renderToc() {
            tocList.innerHTML = books.map(function (b, i) {
                return '<li><button class="kindle-toc-item' + (i === current ? ' active' : '') +
                    '" type="button" data-i="' + i + '" role="option"' + (i === current ? ' aria-selected="true"' : '') + '>' +
                    '<span class="kindle-toc-num">' + pad(i + 1) + '</span>' +
                    '<span class="kindle-toc-title">' + esc(b.title) + '</span></button></li>';
            }).join('');
        }
        function renderPane() {
            var b = books[current];
            pane.innerHTML =
                '<div class="kindle-reader-meta">Book ' + pad(current + 1) + ' of ' + pad(books.length) + '</div>' +
                '<h3 class="kindle-reader-title">' + esc(b.title) + '</h3>' +
                '<div class="kindle-reader-author">by ' + esc(b.author) + '</div>' +
                '<hr class="kindle-reader-rule">' +
                '<p class="kindle-reader-note">' + esc(b.note) + '</p>' +
                '<div class="kindle-page-indicator"><span>fernando&rsquo;s library</span><span>' + pad(current + 1) + ' / ' + pad(books.length) + '</span></div>';
        }
        function select(i) {
            if (i < 0 || i >= books.length || i === current) return;
            current = i; renderToc(); renderPane();
        }
        function focusActive() { var el = tocList.querySelector('.kindle-toc-item.active'); if (el) el.focus(); }
        tocList.addEventListener('click', function (e) {
            var b = e.target.closest('.kindle-toc-item'); if (!b) return;
            select(parseInt(b.dataset.i, 10));
        });
        tocList.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); select(Math.min(current + 1, books.length - 1)); focusActive(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(current - 1, 0)); focusActive(); }
        });
        if (countEl) countEl.textContent = pad(books.length);
    })();

    window.__extrasReady = true;
})();
