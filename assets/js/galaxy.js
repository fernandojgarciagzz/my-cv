/* Space layer — a spiral galaxy and a star field on a fixed canvas behind the
 * whole page. Three.js r128 is loaded in <head> before this file.
 *
 * Scroll drives the camera: for the first ~1.4 viewports the galaxy is the hero
 * (close, bright, slowly turning), then the camera pulls back and up so the
 * galaxy settles as a faint, distant object above the chapters while the star
 * field keeps drifting with a slow parallax.
 *
 * Theme classes on <html> retint everything and blend smoothly:
 *   (default)     dark space, additive warm-core / slate-arm galaxy, white stars
 *   .light        slate ink on paper, normal blending, faint stars
 *   .claude-mode  amber galaxy and warm stars (the vinyl easter egg)
 *
 * prefers-reduced-motion: no rotation, no twinkle, no scroll-driven camera.
 * One static frame in the "hero" state, swapped for the "settled" state once
 * the reader is past the hero. Failure to get a WebGL context adds
 * `no-webgl` to <html> so the CSS/SVG fallback shows instead. */
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
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

    function sgn() { return Math.random() < 0.5 ? -1 : 1; }

    /* ── Galaxy ─────────────────────────────────────────────────────── */
    var COUNT = isMobile ? 22000 : 60000;
    var RADIUS = 4.6, BRANCHES = 3, SPIN = 1.15, RANDOM = 0.32, RPOW = 2.6;
    var gPos = new Float32Array(COUNT * 3), gRnd = new Float32Array(COUNT * 3), gScl = new Float32Array(COUNT);
    for (var i = 0; i < COUNT; i++) {
        var i3 = i * 3;
        var core = i < COUNT * 0.14;
        var r = core ? Math.pow(Math.random(), 1.6) * 0.8 : Math.random() * RADIUS;
        var branch = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
        var a = branch + r * SPIN;
        gPos[i3] = Math.cos(a) * r; gPos[i3 + 1] = 0; gPos[i3 + 2] = Math.sin(a) * r;
        var rs = core ? 0.4 : RANDOM * r + 0.05;
        gRnd[i3]     = sgn() * Math.pow(Math.random(), RPOW) * rs;
        gRnd[i3 + 1] = sgn() * Math.pow(Math.random(), RPOW) * rs * 0.4;
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
            uInside: { value: new THREE.Color('#FFE3C2') }, uOutside: { value: new THREE.Color('#4F78A8') }
        },
        vertexShader: [
            'uniform float uTime; uniform float uSize; uniform float uPixelRatio; uniform float uRadius;',
            'uniform vec3 uInside; uniform vec3 uOutside;',
            'attribute vec3 aRandom; attribute float aScale;',
            'varying vec3 vColor;',
            'void main() {',
            '  vec3 p = position;',
            '  float ang = atan(p.x, p.z); float dist = length(p.xz);',
            '  ang += (1.0 / max(dist, 0.25)) * uTime * 0.09;',   // differential rotation: inner arms turn faster
            '  p.x = cos(ang) * dist; p.z = sin(ang) * dist;',
            '  p += aRandom;',
            '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
            '  gl_Position = projectionMatrix * mv;',
            '  gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / -mv.z);',
            '  vColor = mix(uInside, uOutside, clamp(dist / uRadius, 0.0, 1.0));',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform float uOpacity; varying vec3 vColor;',
            'void main() {',
            '  float d = distance(gl_PointCoord, vec2(0.5)); if (d > 0.5) discard;',
            '  float a = 1.0 - d * 2.0; a = a * a * (3.0 - 2.0 * a); a = pow(a, 1.6);',
            '  gl_FragColor = vec4(vColor, a * uOpacity);',
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
            'void main() {',
            '  float d = distance(gl_PointCoord, vec2(0.5)); if (d > 0.5) discard;',
            '  float a = 1.0 - d * 2.0; a *= a;',
            '  float tw = mix(0.85, 0.55 + 0.45 * sin(uTime * (0.5 + vSeed * 1.5) + vSeed * 50.0), uTwinkle);',
            '  gl_FragColor = vec4(uColor, a * tw * uOpacity);',
            '}'
        ].join('\n')
    });
    var stars = new THREE.Points(sGeo, sMat);
    scene.add(stars);

    /* ── Theme ───────────────────────────────────────────────────────── */
    var THEMES = {
        dark:        { inside: '#FFE3C2', outside: '#4F78A8', star: '#D8E3F3', gOp: 1.00, sOp: 0.85, add: true },
        darkClaude:  { inside: '#FFD3A8', outside: '#C2623D', star: '#F0D6BE', gOp: 1.00, sOp: 0.80, add: true },
        light:       { inside: '#2A425C', outside: '#7EA0BB', star: '#3B5775', gOp: 0.80, sOp: 0.22, add: false },
        lightClaude: { inside: '#9E4A2A', outside: '#E5A785', star: '#B85C3A', gOp: 0.80, sOp: 0.22, add: false }
    };
    function themeKey() {
        var l = root.classList.contains('light'), c = root.classList.contains('claude-mode');
        return l ? (c ? 'lightClaude' : 'light') : (c ? 'darkClaude' : 'dark');
    }
    var cur = { inside: new THREE.Color(), outside: new THREE.Color(), star: new THREE.Color(), gOp: 1, sOp: 0.85 };
    var tgt = { inside: new THREE.Color(), outside: new THREE.Color(), star: new THREE.Color(), gOp: 1, sOp: 0.85 };
    function setTarget() {
        var t = THEMES[themeKey()];
        tgt.inside.set(t.inside); tgt.outside.set(t.outside); tgt.star.set(t.star); tgt.gOp = t.gOp; tgt.sOp = t.sOp;
        var blend = t.add ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (gMat.blending !== blend) { gMat.blending = blend; gMat.needsUpdate = true; }
    }
    function lerpTheme(k) {
        cur.inside.lerp(tgt.inside, k); cur.outside.lerp(tgt.outside, k); cur.star.lerp(tgt.star, k);
        cur.gOp += (tgt.gOp - cur.gOp) * k; cur.sOp += (tgt.sOp - cur.sOp) * k;
        gMat.uniforms.uInside.value.copy(cur.inside); gMat.uniforms.uOutside.value.copy(cur.outside);
        sMat.uniforms.uColor.value.copy(cur.star); sMat.uniforms.uOpacity.value = cur.sOp;
    }
    setTarget(); lerpTheme(1);

    /* ── Scroll + pointer ────────────────────────────────────────────── */
    var scrollP = 0, mx = 0, my = 0, smx = 0, smy = 0, dirty = true;
    function readScroll() {
        var p = window.scrollY / (window.innerHeight * 1.4);
        if (reduce) p = window.scrollY > window.innerHeight * 0.6 ? 1.6 : 0;
        p = Math.min(3.2, Math.max(0, p));
        if (p !== scrollP) { scrollP = p; dirty = true; }
    }
    window.addEventListener('scroll', readScroll, { passive: true });
    if (!reduce && window.matchMedia('(hover: hover)').matches) {
        window.addEventListener('mousemove', function (e) {
            mx = (e.clientX / window.innerWidth - 0.5) * 2;
            my = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });
    }

    function place(t) {
        var p = scrollP;
        var pe = p < 1 ? p * p * (3 - 2 * p) : p;          // ease through the hero, linear after
        var zoom = Math.min(pe, 1.6);                       // pull-back stops; the drift upward continues
        smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05;
        camera.position.set(smx * 0.35, 2.1 + zoom * 2.6, 5.2 + zoom * 5.5);
        camera.lookAt(0, -pe * 1.25 + smy * 0.12, 0);
        gGroup.rotation.y = t * 0.018 + zoom * 1.1;
        // Hero: full. Intro: settles to a faint distant object. Chapters: drifts up and out, then stops drawing.
        var fade = p < 0.85 ? 1 : (p < 2.3 ? Math.max(0.22, 1 - (p - 0.85) * 1.6) : Math.max(0, 0.22 * (1 - (p - 2.3) / 0.7)));
        galaxy.visible = fade > 0.002;
        gMat.uniforms.uOpacity.value = cur.gOp * fade;
        stars.position.y = -window.scrollY * 0.00035;
        stars.rotation.y = t * 0.003;
        gMat.uniforms.uTime.value = t;
        sMat.uniforms.uTime.value = t;
    }

    function resize() {
        var w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
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
        lerpTheme(0.06);
        place(t);
        renderer.render(scene, camera);
        markLive();
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
    start();
})();
