/* Space layer — a black hole (or a spiral galaxy: see FORM), a star field and a
 * near-field dust layer on a fixed canvas behind the whole page. Three.js r128
 * is loaded in <head>.
 *
 * FORM = 'blackhole': real gravitational lensing in the vertex shader. Every
 * particle is re-projected with the point-mass lens equation
 *   theta = (beta + sqrt(beta^2 + 4 thetaE^2)) / 2,  thetaE^2 = 2 Rs Dls / (Dl Ds)
 * so the far side of the accretion disc bends over and under the shadow by
 * itself, light captured inside the shadow disappears, and a second pass draws
 * the secondary image (the arc under the hole). Doppler beaming brightens the
 * side of the disc coming toward you. The flow is 3D: matter spirals inward
 * through the disc (xz), a stream falls in from one side, and two polar jets
 * stream out along the axis (xy). Same particles, shader family and theme as
 * the galaxy; the galaxy generator is still here behind FORM.
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

    /* ── Particle positions: black hole or galaxy ─────────────────────── */
    var FORM = 'blackhole';
    var COUNT = isMobile ? 22000 : 60000;
    var RADIUS = 4.6, BRANCHES = 3, SPIN = 1.15, RANDOM = 0.32, RPOW = 2.6;
    var RS = 0.5, SHADOW = 1.3, DISC_IN = 1.44, PLUNGE = 1.2;                    // the disc hugs the shadow; the last stretch plunges in                    // Schwarzschild radius, shadow (= far-disc Einstein radius), inner disc edge, plunge floor
    var gPos = new Float32Array(COUNT * 3), gRnd = new Float32Array(COUNT * 3), gScl = new Float32Array(COUNT), gKind = new Float32Array(COUNT);
    if (FORM === 'blackhole') {
        var nDisc = Math.floor(COUNT * 0.72), nStream = Math.floor(COUNT * 0.07), nCorona = Math.floor(COUNT * 0.10), nJet = COUNT - nDisc - nStream - nCorona;
        for (var i = 0; i < nDisc; i++) {                                         // kind 0: the disc
            var i3 = i * 3, u = Math.random();
            var r = DISC_IN + (RADIUS - DISC_IN) * Math.pow(u, 1.9);
            var a = Math.random() * Math.PI * 2;
            gPos[i3] = Math.cos(a) * r; gPos[i3 + 1] = 0; gPos[i3 + 2] = Math.sin(a) * r;
            var t = (r - DISC_IN) / (RADIUS - DISC_IN);
            gRnd[i3]     = sgn() * Math.pow(Math.random(), 2.2) * (0.02 + 0.08 * t);
            gRnd[i3 + 1] = sgn() * Math.pow(Math.random(), 1.6) * (0.012 + 0.09 * t);
            gRnd[i3 + 2] = sgn() * Math.pow(Math.random(), 2.2) * (0.02 + 0.08 * t);
            gScl[i] = Math.random() < 0.02 ? 1.8 + Math.random() * 1.4 : 0.45 + Math.random() * 0.9;
            gKind[i] = 0;
        }
        for (var k = 0; k < nStream; k++) {                                       // kind 1: matter falling in from one side
            var j = nDisc + k, j3 = j * 3;
            var q = Math.pow(Math.random(), 0.8);
            var sr = 7.6 - (7.6 - DISC_IN) * q, sa = Math.PI * 0.85 + q * Math.PI * 2.2, sy = 1.6 * (1 - q) * (1 - q);
            var spread = 0.05 + 0.5 * (1 - q);
            gPos[j3] = Math.cos(sa) * sr; gPos[j3 + 1] = sy; gPos[j3 + 2] = Math.sin(sa) * sr;
            gRnd[j3] = sgn() * Math.pow(Math.random(), 1.5) * spread; gRnd[j3 + 1] = sgn() * Math.pow(Math.random(), 1.5) * spread * 0.6; gRnd[j3 + 2] = sgn() * Math.pow(Math.random(), 1.5) * spread;
            gScl[j] = 0.35 + Math.random() * 0.7;
            gKind[j] = 1;
        }
        for (var m = 0; m < nJet; m++) {                                          // kind 2: polar jets
            var n = nDisc + nStream + m, n3 = n * 3;
            var h = 0.4 + Math.pow(Math.random(), 0.7) * 5.6, dirn = m % 2 === 0 ? 1 : -1, ja = Math.random() * Math.PI * 2;
            gPos[n3] = Math.cos(ja) * 0.01; gPos[n3 + 1] = dirn * h; gPos[n3 + 2] = Math.sin(ja) * 0.01;
            gRnd[n3] = (Math.random() - 0.5) * 0.5; gRnd[n3 + 1] = (Math.random() - 0.5) * 0.3; gRnd[n3 + 2] = (Math.random() - 0.5) * 0.5;
            gScl[n] = 0.35 + Math.random() * 0.8;
            gKind[n] = 2;
        }
        for (var c = 0; c < nCorona; c++) {                                       // kind 3: corona on inclined orbits around the hole
            var ci = nDisc + nStream + nJet + c, c3 = ci * 3;
            var nx = Math.random() * 2 - 1, ny = Math.random() * 2 - 1, nz = Math.random() * 2 - 1;
            var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            var cr = 1.7 + Math.pow(Math.random(), 1.6) * 2.2;
            // a random point on the circle of radius cr in the plane perpendicular to the orbit normal
            var ax = Math.abs(nx) < 0.9 ? 1 : 0, ay = ax ? 0 : 1;
            var ux = ay * nz - 0 * ny, uy = 0 * nx - ax * nz, uz = ax * ny - ay * nx;         // (ax,ay,0) x n
            var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= ul; uy /= ul; uz /= ul;
            var vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;      // n x u
            var ca = Math.random() * Math.PI * 2;
            gPos[c3] = (Math.cos(ca) * ux + Math.sin(ca) * vx) * cr;
            gPos[c3 + 1] = (Math.cos(ca) * uy + Math.sin(ca) * vy) * cr;
            gPos[c3 + 2] = (Math.cos(ca) * uz + Math.sin(ca) * vz) * cr;
            gRnd[c3] = nx; gRnd[c3 + 1] = ny; gRnd[c3 + 2] = nz;                            // the orbit normal rides in aRandom
            gScl[ci] = 0.3 + Math.random() * 0.6;
            gKind[ci] = 3;
        }
    } else {
        for (var g = 0; g < COUNT; g++) {
            var g3 = g * 3;
            var core = g < COUNT * 0.18;
            var gr = core ? Math.pow(Math.random(), 1.5) * 0.9 : Math.random() * RADIUS;
            var branch = ((g % BRANCHES) / BRANCHES) * Math.PI * 2;
            var ga = branch + gr * SPIN;
            gPos[g3] = Math.cos(ga) * gr; gPos[g3 + 1] = 0; gPos[g3 + 2] = Math.sin(ga) * gr;
            var rs = core ? 0.55 : RANDOM * gr + 0.05;
            var vy = core ? 0.95 : 0.75 - 0.35 * (gr / RADIUS);
            gRnd[g3]     = sgn() * Math.pow(Math.random(), RPOW) * rs;
            gRnd[g3 + 1] = sgn() * Math.pow(Math.random(), RPOW) * rs * vy;
            gRnd[g3 + 2] = sgn() * Math.pow(Math.random(), RPOW) * rs;
            gScl[g] = Math.random() < 0.025 ? 2.2 + Math.random() * 2.2 : 0.45 + Math.random() * 1.1;
            gKind[g] = 0;
        }
    }
    var gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gGeo.setAttribute('aRandom', new THREE.BufferAttribute(gRnd, 3));
    gGeo.setAttribute('aScale', new THREE.BufferAttribute(gScl, 1));
    gGeo.setAttribute('aKind', new THREE.BufferAttribute(gKind, 1));

    var BH = FORM === 'blackhole';
    function makeGalaxyMaterial(secondary) {
        return new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            uniforms: {
                uTime: { value: 0 }, uSize: { value: isMobile ? 20 : 24 }, uPixelRatio: { value: DPR },
                uSpin: { value: BH ? 0.26 : 0.09 }, uSpinPow: { value: BH ? 1.5 : 1.0 },
                uOpacity: { value: 1 }, uRadius: { value: RADIUS }, uInner: { value: DISC_IN },
                uInside: { value: new THREE.Color('#FFE3C2') }, uOutside: { value: new THREE.Color('#4F78A8') },
                uExplode: { value: 0 },
                uBH: { value: new THREE.Vector3(0, 0, -8) }, uRs: { value: BH ? RS : 0 }, uShadow: { value: SHADOW },
                uSecondary: { value: secondary ? 1 : 0 }, uFlow: { value: BH ? 0.032 : 0 }, uDoppler: { value: BH ? 1 : 0 }, uPlunge: { value: PLUNGE }
            },
            vertexShader: [
                'uniform float uTime; uniform float uSize; uniform float uPixelRatio; uniform float uRadius; uniform float uInner; uniform float uSpin; uniform float uSpinPow;',
                'uniform vec3 uInside; uniform vec3 uOutside; uniform float uExplode;',
                'uniform vec3 uBH; uniform float uRs; uniform float uShadow; uniform float uSecondary; uniform float uFlow; uniform float uDoppler; uniform float uPlunge;',
                'attribute vec3 aRandom; attribute float aScale; attribute float aKind;',
                'varying vec3 vColor; varying float vAlpha;',
                'void main() {',
                '  vec3 p = position; float ang = atan(p.x, p.z); float r0 = length(p.xz);',
                '  vec3 q; vec3 tdir = vec3(0.0); float fade = 1.0; float tcol = 0.0; float plungeK = 0.0;',
                '  if (aKind < 0.5) {',
                // disc: slow accretion inflow; below the inner edge matter plunges into the hole (tighter spiral,
                // fading) before it is reborn at a soft outer edge. Wrap radius is spread so there is no hard rim.
                '    float span = uRadius - uPlunge + fract(aScale * 7.31 + aRandom.z * 53.0) * 3.2;',
                '    float r = uPlunge + mod(r0 - uPlunge + span - uTime * uFlow, span);',
                '    float plunge = 1.0 - smoothstep(uPlunge, uInner, r);',
                '    ang += uTime * uSpin / pow(max(r, 0.6), uSpinPow) + plunge * plunge * 3.0;',
                '    q = vec3(sin(ang) * r, 0.0, cos(ang) * r) + aRandom * (1.0 - plunge * 0.7);',
                '    tdir = vec3(cos(ang), 0.0, -sin(ang));',
                '    tcol = clamp((r - uInner) / (uRadius - uInner), 0.0, 1.0);',
                '    fade = 1.0 - plunge * 0.55; plungeK = plunge;',
                '  } else if (aKind < 1.5) {',
                '    ang += uTime * uSpin / pow(max(r0, 0.6), uSpinPow);',
                '    q = vec3(sin(ang) * r0, p.y, cos(ang) * r0) + aRandom;',
                '    tdir = vec3(cos(ang), 0.0, -sin(ang));',
                '    tcol = clamp((r0 - uInner) / (uRadius - uInner), 0.0, 1.0);',
                '  } else if (aKind > 2.5) {',
                // corona: orbits on inclined planes around the hole (Rodrigues rotation about the orbit normal)
                '    vec3 nrm = normalize(aRandom); float cr = length(p);',
                '    float ca = uTime * 0.32 / pow(max(cr, 0.8), 1.5);',
                '    q = p * cos(ca) + cross(nrm, p) * sin(ca) + nrm * dot(nrm, p) * (1.0 - cos(ca));',
                '    fade = 0.7; tcol = 0.7;',
                '  } else {',
                '    float h0 = abs(p.y); float dn = sign(p.y);',
                '    float h = 0.4 + mod(h0 - 0.4 + uTime * 0.9 * (0.7 + aScale * 0.4), 5.6);',
                '    float rad = 0.05 + 0.15 * h;',
                '    float a2 = ang + uTime * 1.1 + h * 0.5;',
                '    q = vec3(cos(a2) * rad, dn * h, sin(a2) * rad) + aRandom * (0.2 + 0.15 * h);',
                '    fade = 1.0 - h / 6.2; tcol = 1.0;',
                '  }',
                '  float ex = uExplode * uExplode;',
                '  q += normalize(q + vec3(0.001, 0.0, 0.0)) * ex * 18.0 + aRandom * ex * 12.0;',
                '  vec3 pv = (modelViewMatrix * vec4(q, 1.0)).xyz;',
                '  float dop = 0.0;',
                '  if (aKind < 1.5) { vec3 tv = normalize((modelViewMatrix * vec4(tdir, 0.0)).xyz); dop = dot(tv, -normalize(pv)) * uDoppler; }',
                '  float bright = 1.0 + 0.4 * dop;',
                '  float Ds = length(pv); float Dl = length(uBH);',
                '  vec3 axis = uBH / Dl; vec3 dir = pv / Ds;',
                '  float cb = clamp(dot(dir, axis), -1.0, 1.0); float beta = acos(cb);',
                '  float Dls = Ds - Dl;',
                '  float tE2 = max(0.0, 2.0 * uRs * Dls / (Dl * Ds));',
                '  float root = sqrt(beta * beta + 4.0 * tE2);',
                '  float theta = uSecondary > 0.5 ? 0.5 * (beta - root) : 0.5 * (beta + root);',
                '  vec3 perp = dir - axis * cb; float pl = length(perp);',
                '  vec3 pn = pl > 1e-4 ? perp / pl : normalize(cross(axis, vec3(0.0, 1.0, 0.0)));',
                '  float shadowAng = atan(uShadow, Dl);',
                '  float behind = Ds > Dl * cb ? 1.0 : 0.0;',
                '  float inShadow = abs(theta) < shadowAng ? 1.0 : 0.0;',
                // light from behind that would land inside the shadow piles up at its edge instead (the photon
                // ring), fading the deeper it came from; light from in front simply crosses the disc
                '  float visible = 1.0;',
                '  if (behind > 0.5 && inShadow > 0.5) {',
                '    float ath = abs(theta); float sgn = theta < 0.0 ? -1.0 : 1.0;',
                '    fade *= 0.25 + 0.75 * smoothstep(0.0, shadowAng, ath);',
                '    theta = sgn * (shadowAng * 1.02 + (shadowAng - ath) * 0.3);',
                '  }',
                '  if (inShadow > 0.5 && behind < 0.5) { if (aKind > 1.5 && aKind < 2.5) fade *= 0.15; if (aKind < 0.5) fade *= (1.0 - plungeK); }',
                '  if (uSecondary > 0.5 && tE2 <= 0.0) visible = 0.0;',
                '  vec3 nd = axis * cos(theta) + pn * sin(theta);',
                '  pv = nd * Ds;',
                '  gl_Position = projectionMatrix * vec4(pv, 1.0);',
                '  float sizeK = aKind < 0.5 ? (1.0 - 0.5 * tcol) : 1.0;',                        // hot inside, faint far out
                '  gl_PointSize = uSize * aScale * uPixelRatio * bright * sizeK * (1.0 / max(-pv.z, 0.1));',
                '  vec3 base = (aKind > 1.5 && aKind < 2.5) ? mix(uOutside, vec3(1.0), 0.55) : mix(uInside, uOutside, tcol);',
                '  vColor = mix(base, dop > 0.0 ? vec3(1.0) : uOutside, abs(dop) * 0.3);',
                '  vAlpha = visible * fade * (uSecondary > 0.5 ? 0.8 : 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform float uOpacity; varying vec3 vColor; varying float vAlpha;',
                'void main() {', SOFT_DISC,
                '  a = a * a * (3.0 - 2.0 * a); a = pow(a, 1.6);',
                '  gl_FragColor = vec4(vColor, a * uOpacity * vAlpha);',
                '}'
            ].join('\n')
        });
    }
    var gMat = makeGalaxyMaterial(false);
    var gMat2 = BH ? makeGalaxyMaterial(true) : null;
    var gMats = gMat2 ? [gMat, gMat2] : [gMat];
    var galaxy = new THREE.Points(gGeo, gMat);
    var gGroup = new THREE.Group();
    gGroup.add(galaxy);
    gGroup.rotation.z = 0.14;
    scene.add(gGroup);

    /* ── Secondary image (black hole only). The shadow is not an object: it is the
       light that never arrives, handled by the capture rule in every shader. ── */
    var galaxy2 = null, shadowDisc = null;
    if (BH) {
        galaxy2 = new THREE.Points(gGeo, gMat2);
        galaxy2.renderOrder = 1;
        gGroup.add(galaxy2);
        // The shadow itself: a flat black disc that always faces the camera. No shading, no rim, no volume,
        // only a perfect circle of absence; it writes depth so anything behind it is gone and the near
        // side of the disc still crosses in front of it.
        shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(SHADOW, 96), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        shadowDisc.renderOrder = -1;
        scene.add(shadowDisc);
        var glowEl = document.querySelector('.space-glow');
        if (glowEl) glowEl.style.display = 'none';                          // nothing may glow inside the shadow
    }

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
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: DPR }, uOpacity: { value: 0.85 }, uColor: { value: new THREE.Color('#D8E3F3') }, uTwinkle: { value: reduce ? 0 : 1 },
                    uBH: { value: new THREE.Vector3(0, 0, -8) }, uRs: { value: BH ? RS : 0 }, uShadow: { value: SHADOW } },
        vertexShader: [
            'uniform float uPixelRatio; uniform vec3 uBH; uniform float uRs; uniform float uShadow;',
            'attribute float aScale; attribute float aSeed; varying float vSeed; varying float vVis;',
            'void main() {',
            '  vec3 pv = (modelViewMatrix * vec4(position, 1.0)).xyz;',
            // the background is lensed by the hole too, and captured inside the shadow
            '  float Ds = length(pv); float Dl = length(uBH);',
            '  vec3 axis = uBH / Dl; vec3 dir = pv / Ds;',
            '  float cb = clamp(dot(dir, axis), -1.0, 1.0); float beta = acos(cb);',
            '  float Dls = Ds - Dl;',
            '  float tE2 = max(0.0, 2.0 * uRs * Dls / (Dl * Ds));',
            '  float theta = 0.5 * (beta + sqrt(beta * beta + 4.0 * tE2));',
            '  vec3 perp = dir - axis * cb; float pl = length(perp);',
            '  vec3 pn = pl > 1e-4 ? perp / pl : normalize(cross(axis, vec3(0.0, 1.0, 0.0)));',
            '  float sh = atan(uShadow, Dl); vVis = 1.0;',
            '  if (Dls > 0.0 && theta < sh) vVis = 0.0;',                                              // stars behind the hole are simply gone
            '  pv = (axis * cos(theta) + pn * sin(theta)) * Ds;',
            '  gl_Position = projectionMatrix * vec4(pv, 1.0);',
            '  gl_PointSize = max(0.0, aScale * 2.4 * uPixelRatio * (40.0 / -pv.z));',
            '  vSeed = aSeed;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uTwinkle; varying float vSeed; varying float vVis;',
            'void main() {', SOFT_DISC, ' a *= a;',
            '  float tw = mix(0.85, 0.55 + 0.45 * sin(uTime * (0.5 + vSeed * 1.5) + vSeed * 50.0), uTwinkle);',
            '  gl_FragColor = vec4(uColor, a * tw * uOpacity * vVis);',
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
        dark:        { inside: '#FFDDB4', outside: '#4F78A8', star: '#D8E3F3', dust: '#9FB8D6', gOp: 1.00, sOp: 0.85, dOp: 0.66, add: true },
        darkClaude:  { inside: '#FFC894', outside: '#C2623D', star: '#F0D6BE', dust: '#E8B48F', gOp: 1.00, sOp: 0.80, dOp: 0.66, add: true },
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
        gMats.forEach(function (m) { m.uniforms.uInside.value.copy(cur.inside); m.uniforms.uOutside.value.copy(cur.outside); });
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

    var bhView = new THREE.Vector3();
    function syncMats() {
        camera.updateMatrixWorld();
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        bhView.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
        sMat.uniforms.uBH.value.copy(bhView);
        for (var i = 0; i < gMats.length; i++) {
            var u = gMats[i].uniforms;
            u.uBH.value.copy(bhView);
            u.uTime.value = gMat.uniforms.uTime.value;
            u.uOpacity.value = gMat.uniforms.uOpacity.value;
            u.uExplode.value = gMat.uniforms.uExplode.value;
        }
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
        camera.position.set(0, (FORM === 'blackhole' ? 2.45 : 3.5) + zoom * 2.6, 7.6 + zoom * 5.6);
        camera.lookAt(0, -(zoom + after * 0.9) * 1.15, 0);
        gGroup.rotation.y = t * 0.018 + zoom * 1.1 + drag.ry + tiltY;
        gGroup.rotation.x = clamp(drag.rx + tiltX, -0.9, 0.9);
        gGroup.updateMatrixWorld();

        var fade = p < 0.85 ? 1 : (p < 2.3 ? Math.max(0.3, 1 - (p - 0.85) * 1.3) : Math.max(0, 0.3 * (1 - (p - 2.3) / 0.7)));
        galaxy.visible = fade > 0.002 && explode < 1;
        gMat.uniforms.uOpacity.value = cur.gOp * fade;
        if (BH) { galaxy2.visible = galaxy.visible; shadowDisc.visible = galaxy.visible; shadowDisc.lookAt(camera.position); }
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
        syncMats();
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
    window.__space = { rotationY: function () { return gGroup.rotation.y; }, explode: function () { return explode; }, form: FORM };
    start();
})();
