/* Vinyl — a real record, in 3D, for the site.
 *
 * One shared WebGL renderer draws every record on a page (the flipped photo on
 * the home page, the seven tracks on Roho) into ordinary 2D canvases, so seven
 * records cost one context. The face is a custom shader: fine grooves that
 * break the light into lines, the smooth gaps between tracks, the lead-in and
 * lead-out, an anisotropic sheen that runs through the spindle the way it does
 * on a real record, a soft room reflection, a bevelled rim. A matte paper label
 * in the site's warm palette carries the title, and the spindle hole is a real
 * hole. The record spins with motor inertia, wobbles a touch, and leans with
 * the cursor. prefers-reduced-motion: a still record.
 *
 *   var view = Vinyl.create(canvas, { title, album, artist, num, hoverEl, onReady });
 *   view.play(); view.stop(); view.dispose();
 */
(function () {
    'use strict';

    var THREE = window.THREE;
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var LABEL_R = 0.335, HOLE_R = 0.026;                     // a 12" record: 100 mm label, 7 mm hole
    var RPM = 2.4;                                           // seconds per turn on screen (33⅓ reads too fast at this size)

    var renderer = null, scene, camera, tiltG, spinG, faceMat, labelMat, label, dirLight;
    var views = [], raf = null, last = 0, supported = !!THREE;

    /* ── Scene: built once, shared by every view ─────────────────────── */
    function init() {
        if (renderer) return true;
        if (!supported) return false;
        try {
            renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
        } catch (e) { supported = false; return false; }
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
        camera.position.set(0, 0, 5.2);
        camera.lookAt(0, 0, 0);

        tiltG = new THREE.Group(); spinG = new THREE.Group();
        tiltG.add(spinG); scene.add(tiltG);

        // lights for the paper label and the rim (the face has its own, in the shader)
        scene.add(new THREE.AmbientLight(0xffffff, 0.62));
        dirLight = new THREE.DirectionalLight(0xfff1e0, 0.55);
        dirLight.position.set(-2.5, 3.0, 3.0);
        scene.add(dirLight);

        faceMat = new THREE.ShaderMaterial({
            transparent: true,
            uniforms: {
                uCam: { value: new THREE.Vector3() },
                uN: { value: new THREE.Vector3(0, 0, 1) }, uX: { value: new THREE.Vector3(1, 0, 0) }, uY: { value: new THREE.Vector3(0, 1, 0) },
                uL1: { value: new THREE.Vector3(-2.6, 3.2, 3.2) }, uC1: { value: new THREE.Color('#FFE6CF') },   // key: warm white, upper left
                uL2: { value: new THREE.Vector3(2.8, -2.0, 2.4) }, uC2: { value: new THREE.Color('#FFAE6A') },   // fill: the palette, lower right
                uBase: { value: new THREE.Color('#0D0A09') },
                uLabelR: { value: LABEL_R }, uHole: { value: HOLE_R }
            },
            vertexShader: [
                'varying vec3 vWP; varying vec2 vP;',
                'void main() { vP = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }'
            ].join('\n'),
            fragmentShader: [
                'precision highp float;',
                'uniform vec3 uCam, uN, uX, uY, uL1, uC1, uL2, uC2, uBase; uniform float uLabelR, uHole;',
                'varying vec3 vWP; varying vec2 vP;',
                'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
                'void main() {',
                '  float r = length(vP);',
                '  if (r > 1.0 || r < uHole) discard;',
                '  float ang = atan(vP.y, vP.x);',
                '  vec3 N = normalize(uN);',
                '  vec3 T = normalize(-sin(ang) * uX + cos(ang) * uY);',        // the groove runs around the record
                '  vec3 V = normalize(uCam - vWP);',
                // where the grooves are: not on the lead-in at the rim, not on the lead-out by the label, thinner in the gaps between tracks
                '  float grooved = smoothstep(uLabelR + 0.012, uLabelR + 0.05, r) * (1.0 - smoothstep(0.952, 0.972, r));',
                '  float gap = 0.0;',
                '  gap += 1.0 - smoothstep(0.0, 0.006, abs(r - 0.505));',
                '  gap += 1.0 - smoothstep(0.0, 0.005, abs(r - 0.622));',
                '  gap += 1.0 - smoothstep(0.0, 0.007, abs(r - 0.738));',
                '  gap += 1.0 - smoothstep(0.0, 0.005, abs(r - 0.857));',
                '  grooved *= 1.0 - clamp(gap, 0.0, 1.0) * 0.6;',
                // the groove profile itself, faded out where it would alias into moire
                '  float k = r * 640.0;',
                '  float rings = sin(k) * smoothstep(3.2, 0.9, fwidth(k));',
                '  float NV = max(dot(N, V), 0.0);',
                '  vec3 col = uBase * (1.0 + 0.06 * rings * grooved);',
                // a soft room in the polished surface: brighter above, darker below, stronger at grazing angles
                '  vec3 R = reflect(-V, N);',
                '  float env = smoothstep(-0.7, 0.9, R.y);',
                '  col += mix(vec3(0.006, 0.005, 0.005), uC1 * 0.03, env) * (0.5 + 0.5 * pow(1.0 - NV, 2.0));',
                // two lights; on the grooved surface the highlight is a pair of streaks through the spindle
                '  for (int i = 0; i < 2; i++) {',
                '    vec3 Lp = i == 0 ? uL1 : uL2; vec3 C = i == 0 ? uC1 : uC2 * 0.55;',
                '    vec3 L = normalize(Lp - vWP); vec3 H = normalize(L + V);',
                '    float NL = max(dot(N, L), 0.0); float NH = max(dot(N, H), 0.0);',
                '    col += C * NL * 0.012;',
                '    float th = dot(T, H);',
                '    float aniso = pow(sqrt(max(0.0, 1.0 - th * th)), 90.0) * pow(NH, 4.0);',
                '    float iso = pow(NH, 220.0) * 1.2;',
                '    float s = mix(iso, aniso * (0.55 + 0.45 * rings), grooved);',
                '    col += C * s * (0.8 + 0.2 * NL) * (i == 0 ? 1.45 : 0.95);',
                '  }',
                // paper meets vinyl: a little shadow under the label's edge; the rim: a bevel and a thin lit lip
                '  col *= 1.0 - 0.35 * (1.0 - smoothstep(uLabelR, uLabelR + 0.022, r));',
                '  col *= 1.0 - 0.5 * smoothstep(0.978, 1.0, r);',
                '  vec3 Lk = normalize(uL1 - vWP);',
                '  col += uC1 * 0.22 * (1.0 - smoothstep(0.0, 0.007, abs(r - 0.986))) * max(dot(N, Lk), 0.0);',
                // pressing texture
                '  col *= 0.95 + 0.05 * hash(floor(vP * 700.0));',
                '  float alpha = (1.0 - smoothstep(0.995, 1.0, r)) * smoothstep(uHole, uHole + 0.004, r);',
                '  gl_FragColor = vec4(col, alpha);',
                '}'
            ].join('\n')
        });
        faceMat.extensions.derivatives = true;
        var face = new THREE.Mesh(new THREE.CircleGeometry(1, 160), faceMat);
        spinG.add(face);

        // the edge of the record
        var edge = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.014, 160, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.55, metalness: 0.25 }));
        edge.rotation.x = Math.PI / 2; edge.position.z = -0.007;
        spinG.add(edge);
        var back = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x0a0807 }));
        back.rotation.y = Math.PI; back.position.z = -0.014;
        spinG.add(back);

        // the paper label: matte, lit by the room
        labelMat = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5 });
        label = new THREE.Mesh(new THREE.CircleGeometry(LABEL_R, 96), labelMat);
        label.position.z = 0.004;
        spinG.add(label);

        // the shadow the record throws on the page
        var sc = document.createElement('canvas'); sc.width = sc.height = 256;
        var sg = sc.getContext('2d'), grad = sg.createRadialGradient(128, 128, 60, 128, 128, 128);
        grad.addColorStop(0, 'rgba(0,0,0,0.85)'); grad.addColorStop(0.72, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        sg.fillStyle = grad; sg.fillRect(0, 0, 256, 256);
        var shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0.55 }));
        shadow.position.set(0.05, -0.12, -0.09);
        tiltG.add(shadow);
        return true;
    }

    /* ── The label: drawn once per record, in the palette ────────────── */
    function arcText(ctx, text, cx, cy, radius, centerAngle, spacing, flip) {
        var widths = [], total = 0, i;
        for (i = 0; i < text.length; i++) { var w = ctx.measureText(text[i]).width + spacing; widths.push(w); total += w; }
        var a = centerAngle - (flip ? -1 : 1) * (total / 2) / radius;
        for (i = 0; i < text.length; i++) {
            var half = widths[i] / 2, ang = a + (flip ? -1 : 1) * half / radius;
            ctx.save();
            ctx.translate(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
            ctx.rotate(ang + (flip ? -Math.PI / 2 : Math.PI / 2));
            ctx.fillText(text[i], 0, 0);
            ctx.restore();
            a += (flip ? -1 : 1) * widths[i] / radius;
        }
    }
    function drawLabel(tex, spec) {
        var S = 512, c = tex.image, ctx = c.getContext('2d'), R = S / 2, cx = R, cy = R;
        ctx.clearRect(0, 0, S, S);
        // paper
        var g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R);
        g.addColorStop(0, '#FFC69A'); g.addColorStop(0.45, '#F2A26F'); g.addColorStop(0.82, '#D4733F'); g.addColorStop(1, '#B8532E');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        var i;
        for (i = 0; i < 2600; i++) {                                                // grain
            var gx = Math.random() * S, gy = Math.random() * S;
            if ((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy) > R * R) continue;
            ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
            ctx.fillRect(gx, gy, 1.5, 1.5);
        }
        // rings
        ctx.strokeStyle = 'rgba(58,24,10,0.45)'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(58,24,10,0.22)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
        // type
        var ink = '#2A1208';
        ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '600 24px "Space Grotesk", "Inter", sans-serif';
        arcText(ctx, (spec.album || 'ROHO').toUpperCase().split('').join(' '), cx, cy, R * 0.79, -Math.PI / 2, 2, false);
        ctx.font = '500 15px "JetBrains Mono", "SFMono-Regular", monospace';
        arcText(ctx, (spec.sub || '33⅓ RPM · STEREO · SIDE A').toUpperCase(), cx, cy, R * 0.79, Math.PI / 2, 1.5, true);
        if (spec.title) {
            var size = 46, maxW = R * 1.3;
            ctx.font = '600 ' + size + 'px "Space Grotesk", "Inter", sans-serif';
            while (ctx.measureText(spec.title).width > maxW && size > 20) { size -= 2; ctx.font = '600 ' + size + 'px "Space Grotesk", "Inter", sans-serif'; }
            ctx.fillText(spec.title, cx, cy - R * 0.31);
        }
        if (spec.artist) {
            ctx.font = '500 19px "Inter", sans-serif'; ctx.fillStyle = 'rgba(42,18,8,0.85)';
            ctx.fillText(spec.artist, cx, cy + R * 0.30);
        }
        if (spec.num) {
            ctx.font = '500 15px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(42,18,8,0.7)';
            ctx.fillText(spec.num, cx, cy + R * 0.48);
        }
        // the punched hole and its worn edge
        var hr = (HOLE_R / LABEL_R) * R;
        ctx.strokeStyle = 'rgba(40,16,6,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, hr + 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        tex.needsUpdate = true;
    }
    var fontsP = null;
    function fontsReady() {
        if (fontsP) return fontsP;
        fontsP = (document.fonts && document.fonts.load) ?
            Promise.all([document.fonts.load('600 40px "Space Grotesk"'), document.fonts.load('500 16px "Inter"'), document.fonts.load('500 14px "JetBrains Mono"')]).catch(function () {}) :
            Promise.resolve();
        return fontsP;
    }

    /* ── Views ───────────────────────────────────────────────────────── */
    function create(canvas, opts) {
        opts = opts || {};
        var stub = { play: function () {}, stop: function () {}, render: function () {}, dispose: function () {}, supported: false };
        if (!canvas || !init()) return stub;

        var tc = document.createElement('canvas'); tc.width = tc.height = 512;
        var view = {
            canvas: canvas, ctx: canvas.getContext('2d'), opts: opts,
            tex: new THREE.CanvasTexture(tc), w: 0, h: 0,
            angle: 0, omega: 0, spinning: false,
            tilt: opts.tilt !== undefined ? opts.tilt : 0.36,
            hx: 0, hy: 0, thx: 0, thy: 0, live: false, dirty: true, ready: false, dead: false,
            supported: true
        };
        view.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        drawLabel(view.tex, opts);
        fontsReady().then(function () { if (view.dead) return; drawLabel(view.tex, opts); view.dirty = true; wake(); });

        function size() {
            var w = Math.max(1, Math.round(canvas.clientWidth * DPR)), h = Math.max(1, Math.round(canvas.clientHeight * DPR));
            if (w !== view.w || h !== view.h) { view.w = w; view.h = h; canvas.width = w; canvas.height = h; view.dirty = true; }
        }
        size();
        if (window.ResizeObserver) { view.ro = new ResizeObserver(function () { size(); wake(); }); view.ro.observe(canvas); }

        var hoverEl = opts.hoverEl === undefined ? canvas.parentElement : opts.hoverEl;
        if (hoverEl && !reduce) {
            view.onMove = function (e) {
                var b = hoverEl.getBoundingClientRect();
                var nx = ((e.clientX - b.left) / b.width) * 2 - 1, ny = ((e.clientY - b.top) / b.height) * 2 - 1;
                view.thx = Math.max(-1, Math.min(1, ny)) * 0.13; view.thy = Math.max(-1, Math.min(1, nx)) * 0.17; wake();
            };
            view.onLeave = function () { view.thx = 0; view.thy = 0; wake(); };
            hoverEl.addEventListener('mousemove', view.onMove);
            hoverEl.addEventListener('mouseleave', view.onLeave);
        }

        view.play = function () { if (reduce) return; view.spinning = true; wake(); };
        view.stop = function () { view.spinning = false; wake(); };
        view.render = function () { view.dirty = true; wake(); };
        view.dispose = function () {
            view.dead = true; view.live = false;
            if (view.ro) view.ro.disconnect();
            if (hoverEl && view.onMove) { hoverEl.removeEventListener('mousemove', view.onMove); hoverEl.removeEventListener('mouseleave', view.onLeave); }
            var i = views.indexOf(view); if (i >= 0) views.splice(i, 1);
            view.tex.dispose();
        };
        views.push(view);
        wake();
        return view;
    }

    function step(view, dt) {
        var target = view.spinning ? (Math.PI * 2) / RPM : 0;
        var tau = view.spinning ? 0.55 : 1.1;                                   // the motor pulls; the platter coasts
        view.omega += (target - view.omega) * (1 - Math.exp(-dt / tau));
        if (!view.spinning && view.omega < 0.015) view.omega = 0;
        view.angle += view.omega * dt;
        view.hx += (view.thx - view.hx) * Math.min(1, dt * 6);
        view.hy += (view.thy - view.hy) * Math.min(1, dt * 6);
        var settled = Math.abs(view.thx - view.hx) < 0.0006 && Math.abs(view.thy - view.hy) < 0.0006;
        return view.omega > 0 || !settled;
    }

    function draw(view) {
        if (view.w !== renderer.domElement.width || view.h !== renderer.domElement.height) renderer.setSize(view.w, view.h, false);
        camera.aspect = view.w / view.h; camera.updateProjectionMatrix();
        var wob = Math.min(1, view.omega / ((Math.PI * 2) / RPM)) * 0.011;   // a record is never quite flat
        tiltG.rotation.set(-view.tilt + view.hx, view.hy, 0);
        spinG.rotation.set(Math.sin(view.angle) * wob, Math.cos(view.angle * 1.0) * wob, -view.angle);
        labelMat.map = view.tex; labelMat.needsUpdate = labelMat.map !== view.tex;
        scene.updateMatrixWorld(true);
        var m = spinG.matrixWorld;
        faceMat.uniforms.uN.value.set(0, 0, 1).transformDirection(m);
        faceMat.uniforms.uX.value.set(1, 0, 0).transformDirection(m);
        faceMat.uniforms.uY.value.set(0, 1, 0).transformDirection(m);
        faceMat.uniforms.uCam.value.copy(camera.position);
        renderer.render(scene, camera);
        view.ctx.clearRect(0, 0, view.w, view.h);
        view.ctx.drawImage(renderer.domElement, 0, 0, view.w, view.h, 0, 0, view.w, view.h);
        if (!view.ready) { view.ready = true; if (view.opts.onReady) view.opts.onReady(view); }
    }

    function frame(now) {
        raf = null;
        var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
        var any = false;
        for (var i = 0; i < views.length; i++) {
            var v = views[i];
            if (v.dead || v.w === 0) continue;
            var moving = step(v, dt);
            if (moving || v.dirty) { draw(v); v.dirty = false; }
            if (moving) any = true;
        }
        if (any && !document.hidden) raf = requestAnimationFrame(frame); else last = 0;
    }
    function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; wake(); } });

    window.Vinyl = { create: create, get supported() { return supported; } };
})();
