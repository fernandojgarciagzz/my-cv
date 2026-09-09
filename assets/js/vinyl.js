/* Vinyl — a real record, in 3D, for the site.
 *
 * One shared WebGL renderer draws every record on a page (the record behind
 * the photo on the home page, the seven tracks on Roho) into ordinary 2D
 * canvases, so seven records cost one context. The face is a custom shader:
 * fine grooves that break the light into lines, the smooth gaps between
 * tracks, the lead-in and lead-out, an anisotropic sheen that runs through
 * the spindle the way it does on a real record, a soft room reflection, a
 * bevelled rim. The label is matte paper in the site's warm palette, or a
 * picture label made from a photo. The spindle hole is a real hole. The
 * record spins with motor inertia, wobbles a touch, leans with the cursor,
 * and can carry a tonearm that swings in and drops. prefers-reduced-motion:
 * a still record, every move applied at once.
 *
 *   var view = Vinyl.create(canvas, { title, album, artist, num, photo, arm, hoverEl, onReady });
 *   view.play(); view.stop();
 *   view.set({ scale, tilt, arm, band }); view.animate({ tilt: 0.36 }, 600, 'inout');
 *   view.dispose();
 */
(function () {
    'use strict';

    var THREE = window.THREE;
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var LABEL_R = 0.335, HOLE_R = 0.026;                     // a 12" record: 100 mm label, 7 mm hole
    var RPM = 2.4;                                           // seconds per turn on screen (33⅓ reads too fast at this size)
    var ARM_UP = 0.17, ARM_DOWN = 0.05;                      // tonearm height, resting and on the record

    var renderer = null, scene, camera, tiltG, spinG, faceMat, labelMat, label, shadow, armG, armPivot, ARM_REST = 0, ARM_ON = 0;
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

        // lights for the paper label, the rim and the tonearm (the face has its own, in the shader)
        scene.add(new THREE.AmbientLight(0xffffff, 0.62));
        var dirLight = new THREE.DirectionalLight(0xfff1e0, 0.55);
        dirLight.position.set(-2.5, 3.0, 3.0);
        scene.add(dirLight);
        var rim = new THREE.DirectionalLight(0xffae6a, 0.35);
        rim.position.set(2.6, -1.5, 2.0);
        scene.add(rim);

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

        // the edge and the back of the record
        var edge = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.014, 160, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.55, metalness: 0.25 }));
        edge.rotation.x = Math.PI / 2; edge.position.z = -0.007;
        spinG.add(edge);
        var back = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x0a0807 }));
        back.rotation.y = Math.PI; back.position.z = -0.014;
        spinG.add(back);

        // the label: matte, lit by the room
        labelMat = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5 });
        label = new THREE.Mesh(new THREE.CircleGeometry(LABEL_R, 96), labelMat);
        label.position.z = 0.004;
        spinG.add(label);

        // the shadow the record throws on the page
        var sc = document.createElement('canvas'); sc.width = sc.height = 256;
        var sg = sc.getContext('2d'), grad = sg.createRadialGradient(128, 128, 60, 128, 128, 128);
        grad.addColorStop(0, 'rgba(0,0,0,0.85)'); grad.addColorStop(0.72, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        sg.fillStyle = grad; sg.fillRect(0, 0, 256, 256);
        shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0.55 }));
        shadow.position.set(0.05, -0.12, -0.09);
        tiltG.add(shadow);

        buildArm();
        return true;
    }

    /* ── The tonearm: pivot upper right of the platter, swings in and drops on the lead-in ── */
    function buildArm() {
        var metal = new THREE.MeshPhongMaterial({ color: 0x262220, specular: 0xa08d78, shininess: 70 });
        var dark = new THREE.MeshPhongMaterial({ color: 0x0f0d0c, specular: 0x5a4d42, shininess: 40 });
        var accent = new THREE.MeshPhongMaterial({ color: 0x9a4a28, specular: 0xffae6a, shininess: 30 });
        armG = new THREE.Group();
        var P = new THREE.Vector3(1.12, 0.98, 0);
        var base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 48), dark);
        base.rotation.x = Math.PI / 2; base.position.set(P.x, P.y, 0.035);
        armG.add(base);
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ARM_UP + 0.02, 24), metal);
        post.rotation.x = Math.PI / 2; post.position.set(P.x, P.y, (ARM_UP + 0.02) / 2);
        armG.add(post);
        armPivot = new THREE.Group(); armPivot.position.set(P.x, P.y, ARM_UP);
        var LEN = 1.45;
        var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, LEN, 24), metal);
        tube.rotation.z = -Math.PI / 2; tube.position.x = LEN / 2;
        armPivot.add(tube);
        var bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 32), dark);
        bearing.rotation.x = Math.PI / 2;
        armPivot.add(bearing);
        var weight = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.13, 32), dark);
        weight.rotation.z = -Math.PI / 2; weight.position.x = -0.2;
        armPivot.add(weight);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.006, 8, 32), accent);
        ring.rotation.y = Math.PI / 2; ring.position.x = -0.13;
        armPivot.add(ring);
        var head = new THREE.Group(); head.position.x = LEN; head.rotation.z = 0.4;
        var shell = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.038), dark); shell.position.set(0.06, 0, 0);
        head.add(shell);
        var cart = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), accent); cart.position.set(0.09, 0, -0.03);
        head.add(cart);
        var stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.03, 8), metal); stylus.position.set(0.13, 0, -0.055);
        head.add(stylus);
        armPivot.add(head);
        armG.add(armPivot);
        // where the arm points: on the record the stylus sits on the lead-in (r ≈ 0.95); at rest it parks outside the platter
        function radiusAt(phi) { var ex = P.x + LEN * Math.cos(phi), ey = P.y + LEN * Math.sin(phi); return Math.sqrt(ex * ex + ey * ey); }
        function solve(target, from, to) { var best = from, err = 1e9; for (var a = from; a <= to; a += 0.002) { var e = Math.abs(radiusAt(a) - target); if (e < err) { err = e; best = a; } } return best; }
        ARM_ON = solve(0.95, Math.PI * 1.05, Math.PI * 1.35);
        ARM_REST = solve(1.19, Math.PI * 1.02, Math.PI * 1.16);        // parked just off the rim, near its own pivot
        armG.visible = false;
        tiltG.add(armG);
    }
    function poseArm(a) {
        var sw = smooth(0, 0.7, a), dz = smooth(0.66, 1, a);       // swing in first, then drop; lifting reverses it
        armPivot.rotation.z = ARM_REST + (ARM_ON - ARM_REST) * sw;
        armPivot.position.z = ARM_UP + (ARM_DOWN - ARM_UP) * dz;
    }
    function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

    /* ── The label: drawn once per record, in the palette, or from a photo ── */
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
    function photoReady(img) { return !!(img && img.complete && img.naturalWidth); }
    function drawLabel(view) {
        var spec = view.opts, tex = view.tex, S = 512, c = tex.image, ctx = c.getContext('2d'), R = S / 2, cx = R, cy = R, i;
        ctx.clearRect(0, 0, S, S);
        if (photoReady(spec.photo)) {
            // a picture label: the photo fills the label with the same crop the page uses (scale 1.3 about the point at 25% height)
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
            // the page shows the photo as `object-fit: cover` in a square, positioned at 25% height, then
            // scaled 1.3 about that point. Same crop here, and the photo keeps its own proportions.
            var iw = spec.photo.naturalWidth, ih = spec.photo.naturalHeight;
            var cov = Math.max(1 / iw, 1 / ih), dw = iw * cov, dh = ih * cov;       // cover a 1x1 square
            var dx = (1 - dw) / 2, dy = -(dh - 1) * 0.25;                           // centred, 25% from the top
            var Z = 1.3, px0 = 0.5 * (1 - 1 / Z), py0 = 0.25 * (1 - 1 / Z);         // what the 1.3 zoom leaves visible
            ctx.drawImage(spec.photo, (dx - px0) * S * Z, (dy - py0) * S * Z, dw * S * Z, dh * S * Z);
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(cx, cy, R - 2.5, 0, Math.PI * 2); ctx.stroke();
            var band = Math.max(0, Math.min(1, view.band));
            if (band > 0) {                                                   // the printed band arrives once the record has settled
                ctx.save(); ctx.globalAlpha = band;
                ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.arc(cx, cy, R * 0.74, 0, Math.PI * 2, true);
                ctx.fillStyle = 'rgba(16, 9, 6, 0.74)'; ctx.fill('evenodd');
                ctx.strokeStyle = 'rgba(255,196,150,0.35)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#F5EDE4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = '600 22px "Space Grotesk", "Inter", sans-serif';
                arcText(ctx, (spec.album || 'ROHO').toUpperCase().split('').join(' '), cx, cy, R * 0.865, -Math.PI / 2, 2, false);
                ctx.font = '500 14px "JetBrains Mono", "SFMono-Regular", monospace';
                arcText(ctx, ((spec.title || '') + (spec.artist ? '  ·  ' + spec.artist : '')).toUpperCase(), cx, cy, R * 0.865, Math.PI / 2, 1.2, true);
                ctx.restore();
            }
        } else {
            // paper
            var g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R);
            g.addColorStop(0, '#FFC69A'); g.addColorStop(0.45, '#F2A26F'); g.addColorStop(0.82, '#D4733F'); g.addColorStop(1, '#B8532E');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
            for (i = 0; i < 2600; i++) {                                                // grain
                var gx = Math.random() * S, gy = Math.random() * S;
                if ((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy) > R * R) continue;
                ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
                ctx.fillRect(gx, gy, 1.5, 1.5);
            }
            ctx.strokeStyle = 'rgba(58,24,10,0.45)'; ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(58,24,10,0.22)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
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
        }
        // the punched hole and its worn edge (a picture label keeps the face whole: the spindle stays capped)
        if (!photoReady(spec.photo)) {
            var hr = (HOLE_R / LABEL_R) * R;
            ctx.strokeStyle = 'rgba(40,16,6,0.5)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, hr + 1.5, 0, Math.PI * 2); ctx.stroke();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        tex.needsUpdate = true;
        view.bandDrawn = view.band;
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
    function bezier(x1, y1, x2, y2) {                                    // the CSS curve the photo uses, for the record
        return function (t) {
            var lo = 0, hi = 1, u, x;
            for (var i = 0; i < 18; i++) {
                u = (lo + hi) / 2;
                x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
                if (x < t) lo = u; else hi = u;
            }
            u = (lo + hi) / 2;
            return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
        };
    }
    var EASES = {
        out: function (t) { return 1 - Math.pow(1 - t, 3); },
        photo: bezier(0.2, 0.7, 0.2, 1),
        inout: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
        linear: function (t) { return t; }
    };
    function create(canvas, opts) {
        opts = opts || {};
        var stub = { play: function () {}, stop: function () {}, set: function () {}, animate: function () {}, render: function () {}, dispose: function () {}, supported: false };
        if (!canvas || !init()) return stub;

        var tc = document.createElement('canvas'); tc.width = tc.height = 512;
        var view = {
            canvas: canvas, ctx: canvas.getContext('2d'), opts: opts,
            tex: new THREE.CanvasTexture(tc), w: 0, h: 0,
            angle: 0, omega: 0, spinning: false,
            scale: opts.scale !== undefined ? opts.scale : 1,
            tilt: opts.tilt !== undefined ? opts.tilt : 0.36,
            arm: opts.armPose || 0,
            band: opts.band !== undefined ? opts.band : 1, bandDrawn: -1,
            hover: opts.hover !== undefined ? opts.hover : true,
            hx: 0, hy: 0, thx: 0, thy: 0, tweens: [], live: false, dirty: true, ready: false, dead: false,
            supported: true
        };
        view.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        drawLabel(view);
        fontsReady().then(function () { if (view.dead) return; drawLabel(view); view.dirty = true; wake(); });
        if (opts.photo && !photoReady(opts.photo)) opts.photo.addEventListener('load', function () { if (!view.dead) { drawLabel(view); view.dirty = true; wake(); } });

        function size() {
            var w = Math.max(1, Math.round(canvas.clientWidth * DPR)), h = Math.max(1, Math.round(canvas.clientHeight * DPR));
            if (w !== view.w || h !== view.h) { view.w = w; view.h = h; canvas.width = w; canvas.height = h; view.dirty = true; }
        }
        size();
        if (window.ResizeObserver) { view.ro = new ResizeObserver(function () { size(); wake(); }); view.ro.observe(canvas); }

        var hoverEl = opts.hoverEl === undefined ? canvas.parentElement : opts.hoverEl;
        if (hoverEl && !reduce) {
            view.onMove = function (e) {
                if (!view.hover) return;
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
        view.set = function (props) {
            view.tweens = view.tweens.filter(function (tw) { return !(tw.key in props); });
            for (var k in props) if (props.hasOwnProperty(k)) view[k] = props[k];
            if ('hover' in props && !props.hover) { view.thx = 0; view.thy = 0; }
            view.dirty = true; wake();
        };
        view.animate = function (props, ms, ease) {
            if (reduce || !ms) { view.set(props); return; }
            var fn = EASES[ease] || EASES.inout, now = performance.now();
            view.tweens = view.tweens.filter(function (tw) { return !(tw.key in props); });
            for (var k in props) if (props.hasOwnProperty(k)) view.tweens.push({ key: k, from: view[k], to: props[k], t0: now, ms: ms, ease: fn });
            wake();
        };
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

    function step(view, dt, now) {
        var target = view.spinning ? (Math.PI * 2) / RPM : 0;
        var tau = view.spinning ? 0.55 : 1.1;                                   // the motor pulls; the platter coasts
        view.omega += (target - view.omega) * (1 - Math.exp(-dt / tau));
        if (!view.spinning && view.omega < 0.015) view.omega = 0;
        view.angle += view.omega * dt;
        var hx = view.hover ? view.thx : 0, hy = view.hover ? view.thy : 0;
        view.hx += (hx - view.hx) * Math.min(1, dt * 6);
        view.hy += (hy - view.hy) * Math.min(1, dt * 6);
        var settled = Math.abs(hx - view.hx) < 0.0006 && Math.abs(hy - view.hy) < 0.0006;
        var tweening = false;
        if (view.tweens.length) {
            var keep = [];
            for (var i = 0; i < view.tweens.length; i++) {
                var tw = view.tweens[i], t = Math.min(1, (now - tw.t0) / tw.ms);
                view[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(t);
                if (t < 1) keep.push(tw);
            }
            view.tweens = keep; tweening = true;
        }
        if (view.opts.photo && view.bandDrawn !== view.band) drawLabel(view);     // the band fades by redrawing the label
        return view.omega > 0 || !settled || tweening;
    }

    function draw(view) {
        if (view.w !== renderer.domElement.width || view.h !== renderer.domElement.height) renderer.setSize(view.w, view.h, false);
        camera.aspect = view.w / view.h; camera.updateProjectionMatrix();
        var wob = Math.min(1, view.omega / ((Math.PI * 2) / RPM)) * 0.011;   // a record is never quite flat
        tiltG.rotation.set(-view.tilt + view.hx, view.hy, 0);
        tiltG.scale.setScalar(Math.max(0.001, view.scale));
        spinG.rotation.set(Math.sin(view.angle) * wob, Math.cos(view.angle) * wob, -view.angle);
        label.rotation.z = view.opts.uprightLabel ? view.angle : 0;         // a portrait stays the right way up
        labelMat.map = view.tex; labelMat.needsUpdate = labelMat.map !== view.tex;
        shadow.material.opacity = document.documentElement.classList.contains('light') ? 0.16 : 0.55;
        armG.visible = !!view.opts.arm && view.arm > 0.001;
        if (armG.visible) poseArm(view.arm);
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
            var moving = step(v, dt, now);
            if (moving || v.dirty) { draw(v); v.dirty = false; }
            if (moving) any = true;
        }
        if (any && !document.hidden) raf = requestAnimationFrame(frame); else last = 0;
    }
    function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; wake(); } });
    // the page's theme changes the shadow a record throws: redraw every record when it does
    if (window.MutationObserver) {
        new MutationObserver(function () { for (var i = 0; i < views.length; i++) views[i].dirty = true; wake(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    window.Vinyl = { create: create, get supported() { return supported; } };
})();
