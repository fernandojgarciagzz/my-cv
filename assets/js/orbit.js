/* Orbit — the playground game.
 *
 * Hold to climb, let go and weight takes the ship back down. Rocks come in from
 * the right; the ridge below is solid ground.
 *
 * The ship and the rocks are real geometry, lit the way the black hole behind
 * them is lit: a warm key off the disc, a cold fill from deep space, and a small
 * procedural environment so metal has something to reflect. The ship is a lathed
 * hull with a foil-wrapped service module, radiator panels, a dish and a nozzle;
 * the rocks are displaced icosahedra with real craters, tumbling on their own
 * axes. Two canvases: the ridge, the haze and the debris are drawn in 2D behind,
 * the 3D scene sits on top.
 *
 * Falls back to the logic alone (no drawing) where WebGL is missing, so the page
 * never breaks. window.__game reports what the ship is doing.
 */
(function () {
    'use strict';

    var wrap = document.getElementById('gameArea');
    var glCanvas = document.getElementById('gameCanvas');
    var bgCanvas = document.getElementById('gameTerrain');
    if (!wrap || !glCanvas || !bgCanvas) return;
    var bg = bgCanvas.getContext('2d');
    var bar = document.getElementById('gameScoreBar');
    var scoreEl = document.getElementById('gameScore');
    var hud = document.getElementById('gameHud');
    var hudTitle = document.getElementById('hudTitle');
    var hudHint = document.getElementById('hudHint');
    var muteBtn = document.getElementById('muteBtn');
    var soundOn = document.getElementById('soundOn');
    var soundOff = document.getElementById('soundOff');
    var THREE = window.THREE;

    function rand(a, b) { return a + Math.random() * (b - a); }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    /* ── State ──────────────────────────────────────────────────────── */
    var W = 0, H = 0, DPR = 1;
    var state = 'idle';
    var score = 0, best = parseInt(localStorage.getItem('orbitHi'), 10) || 0;
    var elapsed = 0, clock = 0, shake = 0, thrusting = false, deadFor = 0, scoreBonus = 0;
    var ship = { x: 0, y: 0, vy: 0 };
    var rocks = [], cores = [], bits = [], backRidge = null, frontRidge = null;
    var spawnIn = 0, coreIn = 0;
    var GRAV = 1.28, THRUST = 2.82, VMAX = 0.78;      // screen heights per second
    var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    var GO = TOUCH ? 'tap to fly again' : 'press space to fly again';

    function speed() { return W * Math.min(0.46, 0.30 + score * 0.0011); }
    function shipLen() { return clamp(H * 0.135, 46, 98); }
    function shipR() { return shipLen() * 0.24; }

    /* ── Sound ──────────────────────────────────────────────────────── */
    var muted = false, actx = null, thrustGain = null;
    var ALBUM = ['Nashukuru.mp3', 'Kuwa Hapa Sa.mp3', 'Kuwa Hapa Sa V2.mp3', 'Tiririka.mp3'];
    var trackIdx = 0, musicStarted = false;
    var bgMusic = new Audio(ALBUM[0]);
    bgMusic.volume = 0.42;
    bgMusic.addEventListener('ended', function () {
        trackIdx = (trackIdx + 1) % ALBUM.length;
        bgMusic.src = ALBUM[trackIdx];
        if (!muted && state === 'running') bgMusic.play().catch(function () {});
    });
    function audio() {
        if (actx) return actx;
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
        var n = actx.sampleRate * 2, buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        var src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
        var lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
        thrustGain = actx.createGain(); thrustGain.gain.value = 0;
        src.connect(lp); lp.connect(thrustGain); thrustGain.connect(actx.destination);
        src.start();
        return actx;
    }
    function thrustSound(on) {
        var a = audio(); if (!a || !thrustGain) return;
        thrustGain.gain.setTargetAtTime(muted || !on ? 0 : 0.075, a.currentTime, 0.05);
    }
    function blip(f0, f1, dur, type, vol) {
        if (muted) return;
        var a = audio(); if (!a) return;
        var o = a.createOscillator(), g = a.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(f0, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), a.currentTime + dur);
        g.gain.setValueAtTime(vol || 0.07, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
        o.connect(g); g.connect(a.destination);
        o.start(); o.stop(a.currentTime + dur);
    }
    function boom() {
        if (muted) return;
        var a = audio(); if (!a) return;
        var n = Math.floor(a.sampleRate * 0.6), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
        var src = a.createBufferSource(); src.buffer = buf;
        var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        var g = a.createGain(); g.gain.value = 0.5;
        src.connect(lp); lp.connect(g); g.connect(a.destination);
        src.start();
    }
    function updateMuteUI() {
        soundOn.style.display = muted ? 'none' : 'block';
        soundOff.style.display = muted ? 'block' : 'none';
        muteBtn.classList.toggle('active', !muted);
    }
    updateMuteUI();
    muteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        muted = !muted;
        updateMuteUI();
        if (muted) { bgMusic.pause(); thrustSound(false); }
        else if (state === 'running') bgMusic.play().catch(function () {});
    });
    function startMusic() {
        if (muted) return;
        if (!musicStarted) { bgMusic.currentTime = 0; musicStarted = true; }
        bgMusic.play().catch(function () {});
    }

    /* ── The 3D scene ───────────────────────────────────────────────── */
    var gl = null, scene, camera, shipPivot, shipPose, plume, plumeCore, plumeSprite, engineLight;
    var rockGeos = [], rockMats = [], coreGeo, coreMat, glowTex;
    var CAM_D = 900;

    function std(opts) {                                  // a standard material with its colour read as sRGB
        var m = new THREE.MeshStandardMaterial(opts);
        if (m.color.convertSRGBToLinear) m.color.convertSRGBToLinear();
        return m;
    }
    function radialTexture(stops) {
        var c = document.createElement('canvas'); c.width = c.height = 128;
        var g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        stops.forEach(function (s) { rg.addColorStop(s[0], s[1]); });
        g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
    }

    function solarTexture() {
        var c = document.createElement('canvas'); c.width = c.height = 128;
        var g = c.getContext('2d');
        g.fillStyle = '#16233A'; g.fillRect(0, 0, 128, 128);
        g.fillStyle = '#1E2E4A';
        for (var y = 0; y < 128; y += 16) for (var x = 0; x < 128; x += 16) g.fillRect(x + 1, y + 1, 14, 14);
        g.strokeStyle = 'rgba(160, 190, 230, 0.30)'; g.lineWidth = 1;
        for (var i = 0; i <= 128; i += 16) {
            g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
            g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
        }
        var t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2);
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        return t;
    }

    // A small painted sky: deep space, the warm disc of the hole, dust below. Metal reflects it.
    function buildEnvironment(renderer) {
        var c = document.createElement('canvas'); c.width = 512; c.height = 256;
        var g = c.getContext('2d');
        var sky = g.createLinearGradient(0, 0, 0, 256);
        sky.addColorStop(0, '#05070C'); sky.addColorStop(0.55, '#0B0806'); sky.addColorStop(1, '#241309');
        g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
        var hole = g.createRadialGradient(300, 108, 4, 300, 108, 120);
        hole.addColorStop(0, '#FFF0DC'); hole.addColorStop(0.22, '#FFB271');
        hole.addColorStop(0.55, '#7A3416'); hole.addColorStop(1, 'rgba(20,10,6,0)');
        g.fillStyle = hole; g.fillRect(160, 0, 300, 256);
        g.fillStyle = '#0A0705';
        g.beginPath(); g.ellipse(300, 108, 34, 30, 0, 0, Math.PI * 2); g.fill();
        for (var i = 0; i < 260; i++) {                                  // stars
            g.fillStyle = 'rgba(255,238,220,' + rand(0.15, 0.7) + ')';
            g.fillRect(Math.random() * 512, Math.random() * 190, 1.2, 1.2);
        }
        var tex = new THREE.CanvasTexture(c);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        var pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        var env = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose(); tex.dispose();
        return env;
    }

    /* The ship: a lathed hull, a foil-wrapped service module, radiators, a dish
       and a nozzle. Built at unit length, scaled to the screen. */
    function buildShip() {
        var hull = std({ color: 0xB6BABF, metalness: 0.88, roughness: 0.38 });
        var panel = std({ color: 0x8E9297, metalness: 0.7, roughness: 0.55 });
        var dark = std({ color: 0x1E2024, metalness: 0.55, roughness: 0.62 });
        var foil = std({ color: 0xC9902B, metalness: 1.0, roughness: 0.28 });
        var accent = std({ color: 0xB8532E, metalness: 0.45, roughness: 0.42 });
        var glass = std({ color: 0x0C141C, metalness: 0.95, roughness: 0.06 });
        var array = new THREE.MeshStandardMaterial({ map: solarTexture(), metalness: 0.35, roughness: 0.44, side: THREE.DoubleSide });
        var g = new THREE.Group();

        var prof = [                                                   // nose at +x, tail at -x
            [0.00, 0.500], [0.030, 0.470], [0.058, 0.430], [0.082, 0.372], [0.098, 0.300],
            [0.108, 0.210], [0.113, 0.090], [0.113, -0.060], [0.106, -0.130], [0.106, -0.180],
            [0.128, -0.190], [0.128, -0.330], [0.100, -0.345], [0.100, -0.380], [0.000, -0.380]
        ];
        var pts = prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
        var body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), hull);
        body.rotation.z = -Math.PI / 2;                                 // lathe runs up Y; lay it along +X
        g.add(body);

        var mli = new THREE.Mesh(new THREE.CylinderGeometry(0.131, 0.131, 0.135, 40, 1, true), foil);
        mli.rotation.z = Math.PI / 2; mli.position.x = -0.262;
        g.add(mli);
        var band = new THREE.Mesh(new THREE.TorusGeometry(0.107, 0.009, 10, 40), accent);
        band.rotation.y = Math.PI / 2; band.position.x = 0.16;
        g.add(band);
        var collar = new THREE.Mesh(new THREE.TorusGeometry(0.111, 0.011, 10, 40), dark);
        collar.rotation.y = Math.PI / 2; collar.position.x = -0.13;
        g.add(collar);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.010, 10, 32), panel);   // docking ring at the nose
        ring.rotation.y = Math.PI / 2; ring.position.x = 0.345;
        g.add(ring);
        var belly = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.03, 0.13), dark);          // a dark equipment bay
        belly.position.set(-0.05, -0.104, 0);
        g.add(belly);

        var bell = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.104, 0.11, 32, 1, true), dark);
        bell.rotation.z = Math.PI / 2; bell.position.x = -0.435;
        bell.material.side = THREE.DoubleSide;
        g.add(bell);
        var throat = new THREE.Mesh(new THREE.CircleGeometry(0.056, 28), new THREE.MeshBasicMaterial({ color: 0x140C08 }));
        throat.rotation.y = -Math.PI / 2; throat.position.x = -0.379;
        g.add(throat);

        var cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.072, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
        cockpit.rotation.x = -0.5; cockpit.rotation.z = -0.15;
        cockpit.position.set(0.18, 0.072, 0.028);
        g.add(cockpit);

        [1, -1].forEach(function (sd) {                                 // solar arrays, out where they can be seen
            var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), panel);
            mast.position.set(-0.17, sd * 0.17, 0);
            g.add(mast);
            var wing = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.20, 0.009), array);
            wing.position.set(-0.17, sd * 0.335, 0); wing.rotation.x = sd * 0.18;
            g.add(wing);
            var spar = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.014, 0.02), panel);
            spar.position.set(-0.17, sd * 0.335, 0); spar.rotation.x = sd * 0.18;
            g.add(spar);
            var tankGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.026, 0.10, 4, 12) : new THREE.CylinderGeometry(0.026, 0.026, 0.14, 12);
            var tank = new THREE.Mesh(tankGeo, hull);
            tank.rotation.z = Math.PI / 2; tank.position.set(-0.06, -0.062, sd * 0.088);
            g.add(tank);
        });

        var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 8), panel);
        mast.position.set(-0.02, 0.105, -0.02); mast.rotation.z = 0.25;
        g.add(mast);
        var dish = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), panel);
        dish.material.side = THREE.DoubleSide;
        dish.position.set(-0.035, 0.150, -0.02); dish.rotation.set(0.5, 0, 1.0);
        g.add(dish);

        for (var i = 0; i < 7; i++) {                                   // greebles along the hull
            var b = new THREE.Mesh(new THREE.BoxGeometry(rand(0.02, 0.055), rand(0.012, 0.026), rand(0.02, 0.05)), i % 2 ? dark : panel);
            var a = rand(0, Math.PI * 2), rr = 0.113;
            b.position.set(rand(-0.30, 0.06), Math.sin(a) * rr, Math.cos(a) * rr);
            b.rotation.x = a;
            g.add(b);
        }
        return g;
    }

    /* Rocks: an icosahedron pushed around by smooth lumps and real craters. The mesh is
       non-indexed, so computeVertexNormals would facet it; the normal is taken from the
       surface itself, sampled either side of each point. */
    function buildRockGeometry() {
        var geo = new THREE.IcosahedronGeometry(1, 9);
        var pos = geo.attributes.position, i, k;
        var lumps = [], craters = [];
        for (k = 0; k < 7; k++) lumps.push({                            // the big shape
            v: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
            f: rand(1.4, 4.6), a: rand(0.030, 0.085), p: rand(0, 6.28)
        });
        for (k = 0; k < 9; k++) lumps.push({                            // and the roughness on top of it
            v: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
            f: rand(3.5, 7), a: rand(0.012, 0.028), p: rand(0, 6.28)
        });
        for (k = 0; k < 7; k++) craters.push({
            v: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
            r: rand(0.22, 0.62), d: rand(0.07, 0.19)
        });
        var grain = [];
        for (k = 0; k < 8; k++) grain.push({
            v: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
            f: rand(9, 19), a: rand(0.003, 0.008), p: rand(0, 6.28)
        });
        function radiusAt(n) {
            var s = 1, j;
            for (j = 0; j < lumps.length; j++) s += lumps[j].a * Math.sin(lumps[j].f * 3 * n.dot(lumps[j].v) + lumps[j].p);
            for (j = 0; j < craters.length; j++) {
                var ang = Math.acos(clamp(n.dot(craters[j].v), -1, 1));
                if (ang < craters[j].r) s -= craters[j].d * (Math.cos(Math.PI * ang / craters[j].r) * 0.5 + 0.5);
                else if (ang < craters[j].r * 1.22) s += craters[j].d * 0.22 * (1 - (ang - craters[j].r) / (craters[j].r * 0.22));
            }
            return s;
        }
        function shadeAt(n) {                                            // the surface the light sees: form plus grain
            var s = radiusAt(n), j;
            for (j = 0; j < grain.length; j++) s += grain[j].a * Math.sin(grain[j].f * 3 * n.dot(grain[j].v) + grain[j].p);
            return s;
        }
        var nrm = new Float32Array(pos.count * 3);
        var n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
        var pa = new THREE.Vector3(), pb = new THREE.Vector3(), p0 = new THREE.Vector3();
        var EPS = 0.02;
        for (i = 0; i < pos.count; i++) {
            n.fromBufferAttribute(pos, i).normalize();
            t1.set(0, 0, 1).cross(n);
            if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
            t1.normalize();
            t2.crossVectors(n, t1).normalize();
            p0.copy(n).multiplyScalar(shadeAt(n));
            pa.copy(n).addScaledVector(t1, EPS).normalize();
            pa.multiplyScalar(shadeAt(pa)).sub(p0);
            pb.copy(n).addScaledVector(t2, EPS).normalize();
            pb.multiplyScalar(shadeAt(pb)).sub(p0);
            pa.cross(pb).normalize();                                    // t1 x t2 points outward
            p0.copy(n).multiplyScalar(radiusAt(n));                      // the mesh keeps the form; the grain is shading
            pos.setXYZ(i, p0.x, p0.y, p0.z);
            nrm[i * 3] = pa.x; nrm[i * 3 + 1] = pa.y; nrm[i * 3 + 2] = pa.z;
        }
        pos.needsUpdate = true;
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        return geo;
    }

    function initGL() {
        if (!THREE) return false;
        try {
            gl = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        } catch (e) { gl = null; return false; }
        gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));   // the black hole shares this GPU
        gl.setClearColor(0x000000, 0);
        if (gl.outputEncoding !== undefined) gl.outputEncoding = THREE.sRGBEncoding;
        if (THREE.ACESFilmicToneMapping) { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.92; }

        scene = new THREE.Scene();
        scene.environment = buildEnvironment(gl);
        camera = new THREE.PerspectiveCamera(30, 1, 10, 4000);
        camera.position.set(0, 0, CAM_D);
        scene.add(camera);

        scene.add(new THREE.AmbientLight(0x2A1E17, 0.30));
        var key = new THREE.DirectionalLight(0xFFD9B4, 1.95);           // the disc of the hole
        key.position.set(520, 380, 460);
        scene.add(key);
        var fill = new THREE.DirectionalLight(0x53789E, 0.35);          // cold space
        fill.position.set(-460, -260, 220);
        scene.add(fill);
        var under = new THREE.DirectionalLight(0xB8532E, 0.40);         // dust bounce off the ground
        under.position.set(-80, -520, 160);
        scene.add(under);

        shipPivot = new THREE.Group();
        shipPose = new THREE.Group();
        shipPose.rotation.set(0.16, 0.34, 0);                           // side on, a touch from above, tail turned to us
        shipPose.add(buildShip());
        shipPivot.add(shipPose);
        scene.add(shipPivot);

        glowTex = radialTexture([[0, 'rgba(255,244,232,1)'], [0.25, 'rgba(255,186,124,0.75)'], [1, 'rgba(255,150,80,0)']]);
        var plumeMat = new THREE.MeshBasicMaterial({ color: 0xFF9A55, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        plume = new THREE.Mesh(new THREE.ConeGeometry(0.10, 1, 20, 1, true), plumeMat);
        plume.rotation.z = Math.PI / 2;
        plumeCore = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xFFE8CC, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        plumeCore.rotation.z = Math.PI / 2;
        plumeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
        shipPivot.add(plume); shipPivot.add(plumeCore); shipPivot.add(plumeSprite);
        engineLight = new THREE.PointLight(0xFF8C42, 0, 260, 2);
        shipPivot.add(engineLight);

        for (var i = 0; i < 6; i++) rockGeos.push(buildRockGeometry());
        [0x3C332C, 0x46392C, 0x36312C, 0x4A3C2D].forEach(function (c) {   // dark rock; only the lit limb is warm
            var m = std({ color: c, metalness: 0.0, roughness: 1.0 });
            m.envMapIntensity = 0.26;
            rockMats.push(m);
        });
        coreGeo = new THREE.IcosahedronGeometry(1, 1);
        coreMat = new THREE.MeshBasicMaterial({ color: 0xFFD6A6 });
        return true;
    }

    /* ── Layout ─────────────────────────────────────────────────────── */
    function resize() {
        var r = wrap.getBoundingClientRect();
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = r.width; H = r.height;
        bgCanvas.width = Math.max(1, Math.round(W * DPR));
        bgCanvas.height = Math.max(1, Math.round(H * DPR));
        bg.setTransform(DPR, 0, 0, DPR, 0, 0);
        if (gl) {
            gl.setSize(W, H, false);
            camera.aspect = W / H;
            camera.fov = 2 * Math.atan((H / 2) / CAM_D) * 180 / Math.PI;   // one world unit = one pixel at z = 0
            camera.updateProjectionMatrix();
        }
        buildRidges();
    }
    window.addEventListener('resize', resize);
    function wx(px) { return px - W / 2; }
    function wy(py) { return H / 2 - py; }

    /* ── World ──────────────────────────────────────────────────────── */
    function ridge(baseFrac, ampFrac) {
        var step = Math.max(28, W * 0.07), n = Math.ceil(W / step) + 4, pts = [], i;
        for (i = 0; i < n; i++) pts.push({ x: i * step, y: H * baseFrac - Math.random() * H * ampFrac });
        return { pts: pts, step: step, base: baseFrac, amp: ampFrac };
    }
    function buildRidges() {
        backRidge = ridge(0.965, 0.10);
        frontRidge = ridge(0.995, 0.085);
    }
    function scrollRidge(L, dx) {
        var pts = L.pts, i;
        for (i = 0; i < pts.length; i++) pts[i].x -= dx;
        while (pts.length && pts[0].x < -L.step * 2) {
            pts.shift();
            pts.push({ x: pts[pts.length - 1].x + L.step, y: H * L.base - Math.random() * H * L.amp });
        }
    }
    function heightAt(L, x) {
        var pts = L.pts, i;
        for (i = 0; i < pts.length - 1; i++) {
            if (x >= pts[i].x && x <= pts[i + 1].x) {
                var t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
                return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
            }
        }
        return pts.length ? pts[pts.length - 1].y : H;
    }

    function addRock(x, y, r) {
        var k = {
            x: x, y: y, r: r, vy: rand(-0.05, 0.05) * H, k: rand(0.9, 1.35),
            axis: null, spin: rand(-0.5, 0.5), mesh: null
        };
        if (gl) {
            var m = new THREE.Mesh(rockGeos[Math.floor(Math.random() * rockGeos.length)],
                                   rockMats[Math.floor(Math.random() * rockMats.length)]);
            m.scale.set(r * rand(0.86, 1.12), r * rand(0.86, 1.12), r * rand(0.86, 1.12));
            m.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
            k.axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
            k.mesh = m;
            scene.add(m);
        }
        rocks.push(k);
        return k;
    }
    function spawnRocks() {
        var top = H * 0.06, bot = heightAt(frontRidge, W) - H * 0.06;
        var big = Math.random() < 0.3;
        var r = big ? rand(H * 0.075, H * 0.115) : rand(H * 0.032, H * 0.07);
        var y = rand(top + r, bot - r);
        addRock(W + r + 10, y, r);
        if (!big && Math.random() < 0.22) {
            var gap = H * rand(0.26, 0.36);
            var y2 = y + (Math.random() < 0.5 ? -1 : 1) * gap;
            var r2 = rand(H * 0.032, H * 0.06);
            if (y2 > top + r2 && y2 < bot - r2) addRock(W + r2 + rand(20, 120), y2, r2);
        }
        spawnIn = clamp(1.08 - score * 0.0022, 0.44, 1.08) * rand(0.78, 1.3);
    }
    function dropRock(i) {
        if (rocks[i].mesh) scene.remove(rocks[i].mesh);
        rocks.splice(i, 1);
    }
    function spawnCore() {
        var top = H * 0.12, bot = heightAt(frontRidge, W) - H * 0.12;
        var c = { x: W + 20, y: rand(top, bot), r: Math.max(8, H * 0.017), ph: rand(0, 6.28), mesh: null, glow: null };
        if (gl) {
            c.mesh = new THREE.Mesh(coreGeo, coreMat);
            c.mesh.scale.setScalar(c.r * 0.6);
            c.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
            c.glow.scale.setScalar(c.r * 3.6);
            scene.add(c.mesh); scene.add(c.glow);
        }
        cores.push(c);
        coreIn = rand(3.2, 6.4);
    }
    function dropCore(i) {
        if (cores[i].mesh) { scene.remove(cores[i].mesh); scene.remove(cores[i].glow); cores[i].glow.material.dispose(); }
        cores.splice(i, 1);
    }
    function burst(x, y, n, warm, spread) {
        for (var i = 0; i < n; i++) {
            var a = rand(0, Math.PI * 2), v = rand(0.06, spread) * H;
            bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.35, 1.1), age: 0, r: rand(1.2, 3.6), warm: warm });
        }
    }

    function reset() {
        score = 0; scoreBonus = 0; elapsed = 0; deadFor = 0; shake = 0;
        while (rocks.length) dropRock(0);
        while (cores.length) dropCore(0);
        bits = [];
        ship.x = W * 0.24; ship.y = H * 0.42; ship.vy = 0;
        spawnIn = 1.1; coreIn = 2.4;
        buildRidges();
    }
    function setHud(title, hint) {
        if (!hud) return;
        hud.style.display = title ? 'block' : 'none';
        if (title) { hudTitle.textContent = title; hudHint.textContent = hint; }
    }
    function start() {
        reset();
        state = 'running';
        bar.textContent = 'hold to climb · let go to fall';
        setHud('', '');
        startMusic();
    }
    function crash() {
        state = 'over';
        deadFor = 0;
        thrusting = false; thrustSound(false);
        burst(ship.x, ship.y, 34, true, 0.5);
        burst(ship.x, ship.y, 16, false, 0.34);
        shake = 1;
        boom();
        bgMusic.pause();
        if (score > best) { best = score; try { localStorage.setItem('orbitHi', String(best)); } catch (e) {} }
        bar.textContent = 'crashed · ' + GO;
        setHud('Lost to the rocks', 'SCORE ' + score + '   ·   ' + GO.toUpperCase());
    }

    /* ── Input ──────────────────────────────────────────────────────── */
    function press() {
        if (state === 'idle') { start(); thrusting = true; thrustSound(true); return; }
        if (state === 'over') { if (deadFor > 0.5) { start(); thrusting = true; thrustSound(true); } return; }
        thrusting = true; thrustSound(true);
    }
    function release() { thrusting = false; thrustSound(false); }
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
    });
    document.addEventListener('keyup', function (e) {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') { e.preventDefault(); release(); }
    });
    wrap.addEventListener('pointerdown', function (e) { e.preventDefault(); press(); });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    wrap.addEventListener('touchstart', function (e) { e.preventDefault(); press(); }, { passive: false });
    wrap.addEventListener('touchend', function (e) { e.preventDefault(); release(); }, { passive: false });
    window.addEventListener('blur', release);

    /* ── Step ───────────────────────────────────────────────────────── */
    function update(dt) {
        clock += dt;
        var i;
        if (state === 'idle') {
            ship.x = W * 0.24;
            ship.y = H * 0.42 + Math.sin(clock * 1.6) * H * 0.02;
            scrollRidge(frontRidge, W * 0.06 * dt);
            scrollRidge(backRidge, W * 0.03 * dt);
            return;
        }
        if (state === 'over') {
            deadFor += dt;
            shake = Math.max(0, shake - dt * 2.2);
            for (i = bits.length - 1; i >= 0; i--) {
                var q = bits[i]; q.age += dt;
                q.x += q.vx * dt; q.y += q.vy * dt; q.vy += H * 0.7 * dt;
                if (q.age > q.life) bits.splice(i, 1);
            }
            for (i = 0; i < rocks.length; i++) if (rocks[i].mesh) rocks[i].mesh.rotateOnAxis(rocks[i].axis, rocks[i].spin * dt);
            return;
        }

        elapsed += dt;
        score = Math.floor(elapsed * 10) + scoreBonus;
        var dx = speed() * dt;

        ship.vy += GRAV * H * dt;
        if (thrusting) ship.vy -= THRUST * H * dt;
        ship.vy = clamp(ship.vy, -VMAX * H, VMAX * H);
        ship.y += ship.vy * dt;

        var r = shipR();
        if (ship.y < r) { ship.y = r; ship.vy = Math.max(ship.vy, 0); }
        if (ship.y > heightAt(frontRidge, ship.x) - r * 0.55) { crash(); return; }

        if (thrusting && Math.random() < 0.9) {
            bits.push({ x: ship.x - shipLen() * 0.42, y: ship.y + rand(-2, 2), vx: -rand(0.05, 0.16) * W, vy: rand(-0.03, 0.03) * H, life: rand(0.16, 0.4), age: 0, r: rand(1, 2.6), warm: true });
        }

        scrollRidge(frontRidge, dx);
        scrollRidge(backRidge, dx * 0.45);
        spawnIn -= dt; if (spawnIn <= 0) spawnRocks();
        coreIn -= dt; if (coreIn <= 0) spawnCore();

        for (i = rocks.length - 1; i >= 0; i--) {
            var k = rocks[i];
            k.x -= dx * k.k; k.y += k.vy * dt;
            if (k.mesh) k.mesh.rotateOnAxis(k.axis, k.spin * dt);
            if (k.x + k.r < -40) { dropRock(i); continue; }
            var ddx = k.x - ship.x, ddy = k.y - ship.y;
            if (ddx * ddx + ddy * ddy < Math.pow(k.r * 0.82 + r * 0.8, 2)) { crash(); return; }
        }
        for (i = cores.length - 1; i >= 0; i--) {
            var c = cores[i];
            c.x -= dx; c.ph += dt * 3;
            if (c.x + c.r < -40) { dropCore(i); continue; }
            var cdx = c.x - ship.x, cdy = c.y - ship.y;
            if (cdx * cdx + cdy * cdy < Math.pow(c.r + r, 2)) {
                dropCore(i); scoreBonus += 5;
                burst(c.x, c.y, 12, true, 0.22);
                blip(760, 1240, 0.16, 'triangle', 0.05);
            }
        }
        for (i = bits.length - 1; i >= 0; i--) {
            var b2 = bits[i]; b2.age += dt;
            b2.x += b2.vx * dt - dx * 0.4; b2.y += b2.vy * dt;
            if (b2.age > b2.life) bits.splice(i, 1);
        }
        shake = Math.max(0, shake - dt * 2.2);
    }

    /* ── Draw: the ridge and the debris in 2D, the scene on top ─────── */
    function drawRidge(L, fill, rim) {
        var pts = L.pts, i; if (!pts.length) return;
        bg.beginPath();
        bg.moveTo(pts[0].x, H + 4);
        for (i = 0; i < pts.length; i++) bg.lineTo(pts[i].x, pts[i].y);
        bg.lineTo(pts[pts.length - 1].x, H + 4);
        bg.closePath();
        var g = bg.createLinearGradient(0, H * 0.86, 0, H);
        g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]);
        bg.fillStyle = g; bg.fill();
        bg.beginPath();
        bg.moveTo(pts[0].x, pts[0].y);
        for (i = 1; i < pts.length; i++) bg.lineTo(pts[i].x, pts[i].y);
        bg.strokeStyle = rim; bg.lineWidth = 1.6; bg.stroke();
    }
    function renderBack() {
        bg.clearRect(0, 0, W, H);
        bg.save();
        if (shake > 0) bg.translate(rand(-1, 1) * shake * 9, rand(-1, 1) * shake * 9);
        var haze = bg.createLinearGradient(0, H * 0.66, 0, H);
        haze.addColorStop(0, 'rgba(255, 174, 106, 0)');
        haze.addColorStop(0.75, 'rgba(184, 83, 46, 0.12)');
        haze.addColorStop(1, 'rgba(184, 83, 46, 0.16)');
        bg.fillStyle = haze; bg.fillRect(0, H * 0.66, W, H * 0.34);
        drawRidge(backRidge, ['rgba(60, 42, 31, 0.9)', 'rgba(12, 8, 6, 0.96)'], 'rgba(184, 83, 46, 0.38)');
        drawRidge(frontRidge, ['#3B2A1F', '#090605'], 'rgba(255, 174, 106, 0.66)');
        for (var i = 0; i < bits.length; i++) {
            var b2 = bits[i], k = 1 - b2.age / b2.life;
            bg.globalAlpha = Math.max(0, k);
            bg.fillStyle = b2.warm ? '#FFC088' : '#8A6552';
            bg.beginPath(); bg.arc(b2.x, b2.y, b2.r * (0.4 + k * 0.6), 0, Math.PI * 2); bg.fill();
        }
        bg.globalAlpha = 1;
        bg.restore();
    }
    function render3D() {
        if (!gl) return;
        var L = shipLen(), i;
        var sx = shake > 0 ? rand(-1, 1) * shake * 9 : 0, sy = shake > 0 ? rand(-1, 1) * shake * 9 : 0;
        camera.position.set(sx, -sy, CAM_D);

        var alive = state !== 'over';
        shipPivot.visible = alive;
        if (alive) {
            shipPivot.position.set(wx(ship.x), wy(ship.y), 0);
            shipPose.scale.setScalar(L);
            var tilt = clamp(ship.vy / (VMAX * H), -1, 1) * -0.40;
            shipPivot.rotation.z = tilt;
            var flick = 0.78 + 0.22 * Math.sin(clock * 41) * Math.sin(clock * 26.3);
            var len = thrusting ? L * (0.34 + 0.30 * flick) : L * 0.07 * flick;
            var mouth = -L * 0.40;
            plume.visible = plumeCore.visible = thrusting;
            plume.scale.set(L * 0.92, len, L * 0.92);
            plume.position.set(mouth - len * 0.5, 0, 0);
            plumeCore.scale.set(L * 0.7, len * 0.55, L * 0.7);
            plumeCore.position.set(mouth - len * 0.28, 0, 0);
            plume.material.opacity = 0.26 + 0.14 * flick;
            plumeSprite.position.set(mouth - len * 0.28, 0, 0);
            plumeSprite.scale.setScalar(thrusting ? L * (0.42 + 0.16 * flick) : L * 0.2);
            plumeSprite.material.opacity = thrusting ? 0.5 : 0.14;
            engineLight.position.set(mouth - L * 0.12, 0, L * 0.18);
            engineLight.intensity = thrusting ? 1.5 + flick * 0.5 : 0.22;
        }
        for (i = 0; i < rocks.length; i++) if (rocks[i].mesh) rocks[i].mesh.position.set(wx(rocks[i].x), wy(rocks[i].y), 0);
        for (i = 0; i < cores.length; i++) {
            var c = cores[i], pulse = 1 + Math.sin(c.ph) * 0.16;
            c.mesh.position.set(wx(c.x), wy(c.y), 0);
            c.mesh.scale.setScalar(c.r * 0.55 * pulse);
            c.glow.position.copy(c.mesh.position);
            c.glow.scale.setScalar(c.r * 3.6 * pulse);
        }
        gl.render(scene, camera);
    }

    function render() {
        renderBack();
        render3D();
        scoreEl.textContent = (state === 'idle' && !best) ? '' : 'score ' + score + ' · best ' + best;
    }

    /* ── Loop ───────────────────────────────────────────────────────── */
    var last = 0;
    function loop(now) {
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
        last = now;
        update(dt);
        render();
        requestAnimationFrame(loop);
    }

    initGL();
    resize();
    reset();
    state = 'idle';
    bar.textContent = TOUCH ? 'hold to fly · avoid the rocks' : 'hold space to fly · avoid the rocks';
    setHud('Orbit', TOUCH ? 'HOLD TO FLY · AVOID THE ROCKS' : 'HOLD SPACE TO FLY · AVOID THE ROCKS');
    requestAnimationFrame(loop);

    window.__game = {
        state: function () { return state; },
        y: function () { return ship.y; },
        vy: function () { return ship.vy; },
        score: function () { return score; },
        best: function () { return best; },
        height: function () { return H; },
        webgl: function () { return !!gl; }
    };
})();
