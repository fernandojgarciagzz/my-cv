/* Space layer — a spiral galaxy, a star field and a near-field dust layer on a
 * fixed canvas behind the whole page. Three.js r128 is loaded in <head>.
 *
 * Scroll drives the camera: the galaxy opens the page, pulls back through the
 * hero, settles small above the intro and then drifts up and out. The star
 * field and the dust layer stay for the whole page (the dust rides with the
 * camera and streams past as you scroll), so you are always still in space.
 *
 * Interaction: the whole galaxy tilts and turns toward the cursor (a 3D
 * hover, no particle effects), and you can drag anywhere in the hero to spin
 * and tilt it with inertia. Touch devices scroll normally; horizontal drags
 * rotate.
 *
 * Theme classes on <html> retint everything and blend smoothly:
 *   (default)     dark space, additive warm-core / slate-arm galaxy
 *   .light        slate ink on paper, normal blending
 *   .claude-mode  amber galaxy, warm stars and dust (the vinyl easter egg)
 *
 * prefers-reduced-motion: no rotation, twinkle, drag or cursor response; a
 * static frame in two states (hero / settled). No WebGL → html.no-webgl and
 * the CSS/SVG fallback shows instead. */
(function () {
    'use strict';

    var root = document.documentElement;
    var canvas = document.getElementById('space');
    if (!canvas) return;
    if (!window.THREE) { root.classList.add('no-webgl'); return; }
    var THREE = window.THREE;

    var renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
    } catch (e) {
        root.classList.add('no-webgl');
        return;
    }

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var FOV = 50;
    var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
    scene.add(camera);

    function sgn() { return Math.random() < 0.5 ? -1 : 1; }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    var SOFT_DISC = 'float d = distance(gl_PointCoord, vec2(0.5)); if (d > 0.5) discard; float a = 1.0 - d * 2.0;';

    /* ── Galaxy ─────────────────────────────────────────────────────── */
    var COUNT = isMobile ? 22000 : 60000;
    var RADIUS = 4.6, BRANCHES = 3, SPIN = 1.15, RANDOM = 0.32, RPOW = 2.6;
    var gPos = new Float32Array(COUNT * 3), gRnd = new Float32Array(COUNT * 3), gScl = new Float32Array(COUNT);
    for (var i = 0; i < COUNT; i++) {
        var i3 = i * 3;
        var core = i < COUNT * 0.18;
        var r = core ? Math.pow(Math.random(), 1.5) * 0.9 : Math.random() * RADIUS;
        var branch = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
        var a = branch + r * SPIN;
        gPos[i3] = Math.cos(a) * r; gPos[i3 + 1] = 0; gPos[i3 + 2] = Math.sin(a) * r;
        var rs = core ? 0.55 : RANDOM * r + 0.05;
        // vertical spread: a rounded bulge in the core, a thicker disc that thins toward the rim
        var vy = core ? 0.95 : 0.75 - 0.35 * (r / RADIUS);
        gRnd[i3]     = sgn() * Math.pow(Math.random(), RPOW) * rs;
        gRnd[i3 + 1] = sgn() * Math.pow(Math.random(), RPOW) * rs * vy;
        gRnd[i3 + 2] = sgn() * Math.pow(Math.random(), RPOW) * rs;
        gScl[i] = Math.random() < 0.025 ? 2.2 + Math.random() * 2.2 : 0.45 + Math.random() * 1.1;
    }
    var gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gGeo.setAttribute('aRandom', new THREE.BufferAttribute(gRnd, 3));
    gGeo.setAttribute('aScale', new THREE.BufferAttribute(gScl, 1));

    var gMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 }, uSize: { value: isMobile ? 24 : 30 }, uPixelRatio: { value: DPR },
            uOpacity: { value: 1 }, uRadius: { value: RADIUS },
            uInside: { value: new THREE.Color('#FFE3C2') }, uOutside: { value: new THREE.Color('#4F78A8') },
            uExplode: { value: 0 }
        },
        vertexShader: [
            'uniform float uTime; uniform float uSize; uniform float uPixelRatio; uniform float uRadius;',
            'uniform vec3 uInside; uniform vec3 uOutside;',
            'uniform float uExplode;',
            'attribute vec3 aRandom; attribute float aScale;',
            'varying vec3 vColor;',
            'void main() {',
            '  vec3 p = position;',
            '  float ang = atan(p.x, p.z); float dist = length(p.xz);',
            '  ang += (1.0 / max(dist, 0.25)) * uTime * 0.09;',   // differential rotation: inner arms turn faster
            '  p.x = cos(ang) * dist; p.z = sin(ang) * dist;',
            '  p += aRandom;',
            // boring mode: every particle flies outward from the core and fades
            '  float ex = uExplode * uExplode;',
            '  p += normalize(p + vec3(0.001, 0.0, 0.0)) * ex * 18.0 + aRandom * ex * 12.0;',
            '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
            '  gl_Position = projectionMatrix * mv;',
            '  gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / -mv.z);',
            '  vColor = mix(uInside, uOutside, clamp(dist / uRadius, 0.0, 1.0));',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform float uOpacity; uniform float uExplode; varying vec3 vColor;',
            'void main() {', SOFT_DISC,
            '  a = a * a * (3.0 - 2.0 * a); a = pow(a, 1.6);',
            '  gl_FragColor = vec4(vColor, a * uOpacity * (1.0 - uExplode));',
            '}'
        ].join('\n')
    });
    var galaxy = new THREE.Points(gGeo, gMat);
    var gGroup = new THREE.Group();
    gGroup.add(galaxy);
    gGroup.rotation.z = 0.14;
    scene.add(gGroup);

    /* ── Star field ─────────────────────────────────────────────────── */
    var SC = isMobile ? 900 : 2200;
    var sPos = new Float32Array(SC * 3), sScl = new Float32Array(SC), sSeed = new Float32Array(SC);
    for (var j = 0; j < SC; j++) {
        var j3 = j * 3;
        var rr = 28 + Math.random() * 50;
        var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        sPos[j3] = rr * s * Math.cos(th); sPos[j3 + 1] = rr * u; sPos[j3 + 2] = rr * s * Math.sin(th);
        sScl[j] = 0.5 + Math.pow(Math.random(), 2.5) * 1.8;
        sSeed[j] = Math.random();
    }
    var sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('aScale', new THREE.BufferAttribute(sScl, 1));
    sGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
    var sMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: DPR }, uOpacity: { value: 0.85 }, uColor: { value: new THREE.Color('#D8E3F3') }, uTwinkle: { value: reduce ? 0 : 1 } },
        vertexShader: [
            'uniform float uPixelRatio; attribute float aScale; attribute float aSeed; varying float vSeed;',
            'void main() {',
            '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
            '  gl_Position = projectionMatrix * mv;',
            '  gl_PointSize = max(0.0, aScale * 2.4 * uPixelRatio * (40.0 / -mv.z));',
            '  vSeed = aSeed;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uTwinkle; varying float vSeed;',
            'void main() {', SOFT_DISC, ' a *= a;',
            '  float tw = mix(0.85, 0.55 + 0.45 * sin(uTime * (0.5 + vSeed * 1.5) + vSeed * 50.0), uTwinkle);',
            '  gl_FragColor = vec4(uColor, a * tw * uOpacity);',
            '}'
        ].join('\n')
    });
    var stars = new THREE.Points(sGeo, sMat);
    scene.add(stars);

    /* ── Dust: near-field particles that ride with the camera ────────── */
    var DC = isMobile ? 240 : 560;
    var dPos = new Float32Array(DC * 3), dScl = new Float32Array(DC), dSeed = new Float32Array(DC);
    var TAN_HALF = Math.tan(FOV / 2 * Math.PI / 180);
    for (var k = 0; k < DC; k++) {
        var k3 = k * 3;
        var z = -(2.5 + Math.random() * 10);                     // in front of the camera
        var hh = TAN_HALF * -z * 1.2, hw = hh * 1.8;
        dPos[k3] = (Math.random() * 2 - 1) * hw; dPos[k3 + 1] = (Math.random() * 2 - 1) * hh; dPos[k3 + 2] = z;
        dScl[k] = 0.6 + Math.pow(Math.random(), 1.8) * 2.4;
        dSeed[k] = Math.random();
    }
    var dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('aScale', new THREE.BufferAttribute(dScl, 1));
    dGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
    var dMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        uniforms: {
            uTime: { value: 0 }, uPixelRatio: { value: DPR }, uOpacity: { value: 0.5 }, uColor: { value: new THREE.Color('#9FB8D6') },
            uScroll: { value: 0 }, uAspect: { value: 1 }, uTanHalf: { value: TAN_HALF }, uDrift: { value: reduce ? 0 : 1 }
        },
        vertexShader: [
            'uniform float uTime; uniform float uPixelRatio; uniform float uScroll; uniform float uAspect; uniform float uTanHalf; uniform float uDrift;',
            'attribute float aScale; attribute float aSeed; varying float vA;',
            'void main() {',
            '  vec3 p = position;',
            '  float near = 1.0 - clamp((-p.z - 2.5) / 10.0, 0.0, 1.0);',
            '  float H = uTanHalf * -p.z; float W = H * uAspect;',
            '  p.x += sin(uTime * 0.15 + aSeed * 6.283) * 0.25 * uDrift;',
            '  p.y += cos(uTime * 0.12 + aSeed * 9.0) * 0.2 * uDrift;',
            // parallax: uScroll is viewports scrolled; the page moves 2H per viewport, dust moves 22–60% of that
            '  p.y += uScroll * 2.0 * H * (0.22 + 0.38 * near);',
            '  H *= 1.2; W *= 1.2;',
            '  p.x = mod(p.x + W, 2.0 * W) - W; p.y = mod(p.y + H, 2.0 * H) - H;',
            '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
            '  gl_Position = projectionMatrix * mv;',
            '  gl_PointSize = aScale * uPixelRatio * (13.0 / -mv.z);',
            '  vA = 0.35 + 0.65 * near;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform float uOpacity; uniform vec3 uColor; varying float vA;',
            'void main() {', SOFT_DISC, ' a = pow(a, 1.8);',
            '  gl_FragColor = vec4(uColor, a * uOpacity * vA);',
            '}'
        ].join('\n')
    });
    var dust = new THREE.Points(dGeo, dMat);
    dust.frustumCulled = false;
    camera.add(dust);

    /* ── Theme ───────────────────────────────────────────────────────── */
    var THEMES = {
        dark:        { inside: '#FFE3C2', outside: '#4F78A8', star: '#D8E3F3', dust: '#9FB8D6', gOp: 1.00, sOp: 0.85, dOp: 0.66, add: true },
        darkClaude:  { inside: '#FFD3A8', outside: '#C2623D', star: '#F0D6BE', dust: '#E8B48F', gOp: 1.00, sOp: 0.80, dOp: 0.66, add: true },
        light:       { inside: '#2A425C', outside: '#7EA0BB', star: '#3B5775', dust: '#3B5775', gOp: 0.80, sOp: 0.22, dOp: 0.24, add: false },
        lightClaude: { inside: '#9E4A2A', outside: '#E5A785', star: '#B85C3A', dust: '#B85C3A', gOp: 0.80, sOp: 0.22, dOp: 0.24, add: false }
    };
    function themeKey() {
        var l = root.classList.contains('light'), c = root.classList.contains('claude-mode');
        return l ? (c ? 'lightClaude' : 'light') : (c ? 'darkClaude' : 'dark');
    }
    function mk() { return { inside: new THREE.Color(), outside: new THREE.Color(), star: new THREE.Color(), dust: new THREE.Color(), gOp: 1, sOp: 0.85, dOp: 0.5 }; }
    var cur = mk(), tgt = mk();
    function setTarget() {
        var t = THEMES[themeKey()];
        tgt.inside.set(t.inside); tgt.outside.set(t.outside); tgt.star.set(t.star); tgt.dust.set(t.dust);
        tgt.gOp = t.gOp; tgt.sOp = t.sOp; tgt.dOp = t.dOp;
        var blend = t.add ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (gMat.blending !== blend) { gMat.blending = blend; gMat.needsUpdate = true; }
    }
    function lerpTheme(k) {
        cur.inside.lerp(tgt.inside, k); cur.outside.lerp(tgt.outside, k); cur.star.lerp(tgt.star, k); cur.dust.lerp(tgt.dust, k);
        cur.gOp += (tgt.gOp - cur.gOp) * k; cur.sOp += (tgt.sOp - cur.sOp) * k; cur.dOp += (tgt.dOp - cur.dOp) * k;
        gMat.uniforms.uInside.value.copy(cur.inside); gMat.uniforms.uOutside.value.copy(cur.outside);
        sMat.uniforms.uColor.value.copy(cur.star);
        dMat.uniforms.uColor.value.copy(cur.dust);
    }
    setTarget(); lerpTheme(1);

    /* ── Boring mode: explode on the way out, implode on the way back ─── */
    var explode = root.classList.contains('light') ? 1 : 0;
    var exFrom = explode, exTo = explode, exT0 = 0, EX_DUR = 1100;
    function startExplode(to) {
        if (reduce) { explode = exFrom = exTo = to; if (to === 1) window.dispatchEvent(new CustomEvent('space:exploded')); dirty = true; start(); return; }
        exFrom = explode; exTo = to; exT0 = performance.now(); start();
    }
    function stepExplode(now) {
        if (explode === exTo) return;
        var k = Math.min(1, (now - exT0) / EX_DUR);
        var e = exTo === 1 ? k * k * k : 1 - Math.pow(1 - k, 3);
        explode = exFrom + (exTo - exFrom) * e;
        if (k >= 1) { explode = exTo; if (exTo === 1) window.dispatchEvent(new CustomEvent('space:exploded')); }
    }
    window.addEventListener('space:explode', function () { startExplode(1); });
    window.addEventListener('space:implode', function () { startExplode(0); });

    /* ── Scroll, pointer, drag ──────────────────────────────────────── */
    var scrollP = 0, dirty = true;
    var drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, rx: 0, ry: 0 };
    var mx = 0, my = 0, tiltX = 0, tiltY = 0;                   // cursor-driven tilt of the whole galaxy
    if (!reduce && window.matchMedia('(hover: hover)').matches) {
        window.addEventListener('mousemove', function (e) {
            mx = (e.clientX / window.innerWidth - 0.5) * 2;
            my = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });
        document.addEventListener('mouseleave', function () { mx = 0; my = 0; });
        window.addEventListener('blur', function () { mx = 0; my = 0; });
    }

    function readScroll() {
        var p = window.scrollY / (window.innerHeight * 1.4);
        if (reduce) p = window.scrollY > window.innerHeight * 0.6 ? 1.6 : 0;
        p = Math.min(12, Math.max(0, p));
        if (p !== scrollP) { scrollP = p; dirty = true; }
    }
    window.addEventListener('scroll', readScroll, { passive: true });

    var pin = document.querySelector('.hero-pin');
    if (pin && !reduce) {
        pin.classList.add('grab');
        pin.addEventListener('pointerdown', function (e) {
            if (e.button !== undefined && e.button !== 0) return;
            drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.vx = 0; drag.vy = 0;
            pin.classList.add('grabbing');
            try { pin.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });
        pin.addEventListener('pointermove', function (e) {
            if (!drag.on) return;
            var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            drag.x = e.clientX; drag.y = e.clientY;
            drag.vy = dx * 0.006; drag.vx = dy * 0.0035;
            drag.ry += drag.vy; drag.rx = clamp(drag.rx + drag.vx, -0.75, 0.75);
        });
        function endDrag() { drag.on = false; pin.classList.remove('grabbing'); }
        pin.addEventListener('pointerup', endDrag);
        pin.addEventListener('pointercancel', endDrag);
    }

    function place(t) {
        var p = scrollP;
        var pe = p < 1 ? p * p * (3 - 2 * p) : p;
        var zoom = Math.min(pe, 1.6);
        var after = Math.max(0, p - 1.6);                       // how far past the intro we are
        var hoverK = drag.on ? 0 : Math.max(0, 1 - after);      // full in the hero, gone once past the intro
        tiltX += (-my * 0.2 * hoverK - tiltX) * 0.045;          // mouse up = look more from above, never edge-on
        tiltY += (mx * 0.38 * hoverK - tiltY) * 0.045;
        if (!drag.on) { drag.ry += drag.vy; drag.rx = clamp(drag.rx + drag.vx, -0.75, 0.75); drag.vy *= 0.94; drag.vx *= 0.9; }

        // Camera: opens a little further out (cleaner start), pulls back through the hero,
        // then keeps looking lower so the galaxy drifts up and out while the stars and dust remain.
        camera.position.set(0, 3.5 + zoom * 2.6, 7.6 + zoom * 5.6);
        camera.lookAt(0, -(zoom + after * 0.9) * 1.15, 0);
        gGroup.rotation.y = t * 0.018 + zoom * 1.1 + drag.ry + tiltY;
        gGroup.rotation.x = clamp(drag.rx + tiltX, -0.9, 0.9);
        gGroup.updateMatrixWorld();

        var fade = p < 0.85 ? 1 : (p < 2.3 ? Math.max(0.3, 1 - (p - 0.85) * 1.3) : Math.max(0, 0.3 * (1 - (p - 2.3) / 0.7)));
        galaxy.visible = fade > 0.002 && explode < 1;
        gMat.uniforms.uOpacity.value = cur.gOp * fade;
        gMat.uniforms.uExplode.value = explode;
        sMat.uniforms.uOpacity.value = cur.sOp * (1 - explode);
        var dustIn = Math.max(0, Math.min(1, (p - 0.75) / 0.6));   // dust only once the galaxy has receded
        dMat.uniforms.uOpacity.value = cur.dOp * (1 - explode) * dustIn;

        var vps = window.scrollY / window.innerHeight;         // viewports scrolled
        stars.position.y = -vps * 2.2;
        stars.rotation.y = t * 0.003;
        dMat.uniforms.uScroll.value = vps;

        gMat.uniforms.uTime.value = t;
        sMat.uniforms.uTime.value = t;
        dMat.uniforms.uTime.value = t;
    }

    function resize() {
        var w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dMat.uniforms.uAspect.value = camera.aspect;
        dirty = true;
    }
    window.addEventListener('resize', resize);
    resize();
    readScroll();

    /* ── Render ──────────────────────────────────────────────────────── */
    var visible = !document.hidden, raf = null, live = false;
    var clock = new THREE.Clock();
    function markLive() { if (!live) { live = true; root.classList.add('space-live'); } }

    function frame() {
        raf = null;
        if (!visible) return;
        var t = clock.getElapsedTime();
        stepExplode(performance.now());
        lerpTheme(0.06);
        place(t);
        renderer.render(scene, camera);
        markLive();
        if (explode >= 1 && root.classList.contains('light')) return;   // boring mode: nothing to draw, stop the loop
        raf = requestAnimationFrame(frame);
    }
    function renderStatic() {
        lerpTheme(1);
        place(0);
        renderer.render(scene, camera);
        markLive();
        dirty = false;
    }
    function start() { if (reduce) { if (dirty) renderStatic(); return; } if (!raf) raf = requestAnimationFrame(frame); }

    document.addEventListener('visibilitychange', function () { visible = !document.hidden; start(); });
    new MutationObserver(function () { setTarget(); dirty = true; start(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
    if (reduce) {
        window.addEventListener('scroll', function () { if (dirty) renderStatic(); }, { passive: true });
        window.addEventListener('resize', function () { renderStatic(); });
    }
    window.__space = { rotationY: function () { return gGroup.rotation.y; }, explode: function () { return explode; } };
    start();
})();
