/* Agent Showcase — sticky scrollytelling section with a morphing 3D point cloud.
 *
 * Four forms, scroll-driven via a tall outer section with a 100vh sticky pinned
 * canvas inside. Scroll progress through the section interpolates particle
 * positions between adjacent forms.
 *
 *   0. Intelligence  — two-hemisphere brain + cerebellum + brain stem
 *   1. Agents        — four mini bust silhouettes in a row
 *   2. Process       — DNA-style double helix with rungs
 *   3. Orchestration — icosahedron edge wireframe + core cluster
 *
 * Theming: reads --sf-blue from CSS, repaints on dark/Claude-mode toggle.
 * Mobile: 800 particles + shorter section. Reduced motion: skips entirely.
 */
(function () {
    'use strict';

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    const SECTION_ID = 'agentShowcase';
    const CANVAS_ID = 'agentShowcaseCanvas';
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const PARTICLE_COUNT = isMobile ? 2640 : 5400;

    /* Inject section + canvas styles. The outer section is 280vh tall (220vh
     * mobile); inside it, .agent-showcase-pin is sticky at top:0 with
     * height:100vh — this gives us 1.8 / 1.2 viewport-heights of scrolling
     * before the pin releases, paced over the four form transitions. */
    const style = document.createElement('style');
    style.textContent = [
        '.agent-showcase{position:relative;height:280vh;z-index:1;background:var(--bg-primary);}',
        '.agent-showcase-pin{position:sticky;top:0;height:100vh;width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;}',
        '#' + CANVAS_ID + '{position:absolute;inset:0;width:100%;height:100%;display:block;}',
        '@media (max-width:768px){.agent-showcase{height:220vh;}}'
    ].join('');
    document.head.appendChild(style);

    function loadThree() {
        return new Promise(function (resolve, reject) {
            if (window.THREE) return resolve();
            const s = document.createElement('script');
            s.src = THREE_CDN;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    /* Soft round-glow sprite — used as the point texture so each particle
     * renders as a halo rather than a hard square pixel. */
    function makeGlowTexture(THREE) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0.00, 'rgba(255,255,255,1.0)');
        g.addColorStop(0.20, 'rgba(255,255,255,0.75)');
        g.addColorStop(0.50, 'rgba(255,255,255,0.20)');
        g.addColorStop(1.00, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }

    /* Write a single bust silhouette into `out` at offset `i0` (particle index)
     * for `count` particles. Used by both the multi-agents form (4 small busts)
     * and as a building block. cx/cy/cz center the bust, scale shrinks it. */
    function writeBust(out, i0, count, cx, cy, cz, scale) {
        const S = scale;
        for (let k = 0; k < count; k++) {
            const i = (i0 + k) * 3;
            const u = Math.random();
            if (u < 0.35) {
                const phi = Math.acos(2 * Math.random() - 1);
                const theta = Math.random() * Math.PI * 2;
                const r = 0.95 + (Math.random() - 0.5) * 0.06;
                out[i]     = cx + r * Math.sin(phi) * Math.cos(theta) * S;
                out[i + 1] = cy + (r * Math.cos(phi) + 2.0) * S;
                out[i + 2] = cz + r * Math.sin(phi) * Math.sin(theta) * 0.9 * S;
            } else if (u < 0.45) {
                const angle = Math.random() * Math.PI * 2;
                const yPos = 0.7 + Math.random() * 0.55;
                const radius = 0.32 + (Math.random() - 0.5) * 0.04;
                out[i]     = cx + Math.cos(angle) * radius * S;
                out[i + 1] = cy + yPos * S;
                out[i + 2] = cz + Math.sin(angle) * radius * 0.85 * S;
            } else if (u < 0.75) {
                const angle = Math.random() * Math.PI * 2;
                const yPos = -0.3 + Math.random() * 0.85;
                const sideBias = Math.abs(Math.cos(angle));
                const radiusBase = 1.45 + sideBias * 0.35;
                out[i]     = cx + Math.cos(angle) * radiusBase * S;
                out[i + 1] = cy + (yPos + sideBias * 0.18) * S;
                out[i + 2] = cz + Math.sin(angle) * radiusBase * 0.55 * S;
            } else {
                const angle = Math.random() * Math.PI * 2;
                const yPos = -2.7 + Math.random() * 2.3;
                const yRel = (yPos + 2.7) / 2.3;
                const radius = 0.85 + yRel * 0.55;
                out[i]     = cx + Math.cos(angle) * radius * S;
                out[i + 1] = cy + yPos * S;
                out[i + 2] = cz + Math.sin(angle) * radius * 0.55 * S;
            }
        }
    }

    /* Generate the four form target arrays. Each form is a Float32Array of
     * length N*3, in scene units. All forms are roughly bounded in a 6-unit
     * cube so the camera at z=11 can frame them comfortably. */
    function generateForms(N, THREE) {
        const S = 1.0; // global scale knob

        /* FORM 0 — Intelligence (brain): two-hemisphere cerebrum split by a
         * deep longitudinal fissure, cerebellum bulge at back-bottom, brain
         * stem hanging below. Built per-hemisphere so the central fissure is
         * a real gap, not just a fake displacement. Surface fold noise gives
         * the characteristic gyri/sulci texture. */
        const brain = new Float32Array(N * 3);
        const cerebrumCount = Math.floor(N * 0.72);
        const cerebellumCount = Math.floor(N * 0.20);
        const stemCount = N - cerebrumCount - cerebellumCount;
        // Real brain is roughly 1.0 wide : 0.65 tall : 1.15 long (front-back).
        // Each hemisphere occupies one half along x.
        const hrx = 1.45 * S;   // half-width per hemisphere
        const hry = 1.10 * S;   // height (smallest axis)
        const hrz = 2.05 * S;   // front-back length (longest axis)
        const fissureGap = 0.22 * S;
        for (let i = 0; i < cerebrumCount; i++) {
            const side = (i % 2 === 0) ? 1 : -1;
            const phi = Math.acos(2 * Math.random() - 1);             // 0..π (polar/y)
            const theta = (Math.random() - 0.5) * Math.PI;            // -π/2..π/2 (half-sphere on +x)
            const sinP = Math.sin(phi);
            // Strong multi-frequency fold field — visible gyri/sulci texture
            const fold = 1
                + 0.16 * Math.sin(7 * theta + 5 * phi)
                + 0.11 * Math.cos(9 * phi + 2 * theta)
                + 0.07 * Math.sin(13 * theta - 3 * phi);
            const xBase = hrx * sinP * Math.cos(theta) * fold;
            let x = side * (fissureGap + xBase);
            let y = hry * Math.cos(phi) * fold;
            let z = hrz * sinP * Math.sin(theta) * fold;
            // Frontal lobe bulge — extend front particles slightly forward
            if (z > 0) z *= 1.06;
            // Posterior droop so the back of the cerebrum tucks down toward
            // the cerebellum (occipital lobe shape)
            if (z < -hrz * 0.55) y -= 0.22 * S;
            brain[i*3]     = x;
            brain[i*3 + 1] = y;
            brain[i*3 + 2] = z;
        }
        // Cerebellum — two textured side-by-side lobes behind & below the
        // cerebrum, with horizontal folia banding (the iconic ridged look).
        const cerebStart = cerebrumCount;
        for (let i = 0; i < cerebellumCount; i++) {
            const side = (i % 2 === 0) ? 1 : -1;
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = (Math.random() - 0.5) * Math.PI;
            const sinP = Math.sin(phi);
            const cerRy = 0.58 * S;
            const yLocal = cerRy * Math.cos(phi);
            // Folia: tight horizontal banding via high-freq sin on y
            const folia = 1 + 0.13 * Math.sin(yLocal * 16);
            const cx = side * (0.18 * S + 0.62 * S * sinP * Math.cos(theta) * folia);
            const cy = -1.20 * S + yLocal;
            const cz = -1.55 * S + 0.55 * S * sinP * Math.sin(theta) * folia;
            brain[(cerebStart + i)*3]     = cx;
            brain[(cerebStart + i)*3 + 1] = cy;
            brain[(cerebStart + i)*3 + 2] = cz;
        }
        // Brain stem — narrow cylinder hanging from under the cerebellum
        const stemStart = cerebrumCount + cerebellumCount;
        for (let i = 0; i < stemCount; i++) {
            const k = stemStart + i;
            const angle = Math.random() * Math.PI * 2;
            const yPos = -1.85 * S - Math.random() * 1.10 * S;
            const radius = 0.27 * S + (Math.random() - 0.5) * 0.05;
            brain[k*3]     = Math.cos(angle) * radius;
            brain[k*3 + 1] = yPos;
            brain[k*3 + 2] = -1.30 * S + Math.sin(angle) * radius;
        }

        /* FORM 1 — Agents: four mini bust silhouettes arranged in a square
         * (one on each cardinal side: front, right, back, left), so as the
         * camera orbits we always see a balanced crew of agents around the
         * origin. */
        const agents = new Float32Array(N * 3);
        const agentCount = 4;
        const agentScale = 0.45;
        const sqRadius = 2.0;
        const xPositions = [0, sqRadius, 0, -sqRadius];
        const zPositions = [sqRadius, 0, -sqRadius, 0];
        const perAgent = Math.floor(N / agentCount);
        for (let a = 0; a < agentCount; a++) {
            const start = a * perAgent;
            const count = (a === agentCount - 1) ? N - start : perAgent;
            writeBust(agents, start, count,
                xPositions[a] * S,
                -0.4 * S,           // shift down a bit so heads sit near 0
                zPositions[a] * S,
                agentScale * S);
        }

        /* FORM 2 — Process helix: two intertwined strands + connecting rungs. */
        const helix = new Float32Array(N * 3);
        const turns = 4.5;
        const helixHeight = 6.5 * S;
        const helixRadius = 1.4 * S;
        for (let i = 0; i < N; i++) {
            const t = i / N;
            const angle = t * turns * Math.PI * 2;
            const yPos = (t - 0.5) * helixHeight;
            const role = i % 4;
            if (role < 2) {
                // Strand A or B
                const offset = role === 0 ? 0 : Math.PI;
                helix[i*3]     = Math.cos(angle + offset) * helixRadius;
                helix[i*3 + 1] = yPos;
                helix[i*3 + 2] = Math.sin(angle + offset) * helixRadius;
            } else {
                // Rung — interpolate across the two strands
                const rungT = Math.random();
                helix[i*3]     = (Math.cos(angle) * (1 - rungT) + Math.cos(angle + Math.PI) * rungT) * helixRadius;
                helix[i*3 + 1] = yPos + (Math.random() - 0.5) * 0.05;
                helix[i*3 + 2] = (Math.sin(angle) * (1 - rungT) + Math.sin(angle + Math.PI) * rungT) * helixRadius;
            }
        }

        /* FORM 3 — Orchestration: icosahedron edge particles + a smaller
         * central core cluster (the "orchestrator" coordinating from the
         * middle of a structured polyhedral system). */
        const engine = new Float32Array(N * 3);
        const ico = new THREE.IcosahedronGeometry(2.6 * S, 1);
        const verts = ico.attributes.position.array;
        const nVerts = verts.length / 3;
        for (let i = 0; i < N; i++) {
            if (i < N * 0.85) {
                const a = Math.floor(Math.random() * nVerts) * 3;
                let b = Math.floor(Math.random() * nVerts) * 3;
                if (a === b) b = (b + 3) % verts.length;
                const t = Math.random();
                engine[i*3]     = verts[a]     * (1 - t) + verts[b]     * t;
                engine[i*3 + 1] = verts[a + 1] * (1 - t) + verts[b + 1] * t;
                engine[i*3 + 2] = verts[a + 2] * (1 - t) + verts[b + 2] * t;
            } else {
                const r = Math.random() * 0.6 * S;
                const phi = Math.acos(2 * Math.random() - 1);
                const theta = Math.random() * Math.PI * 2;
                engine[i*3]     = r * Math.sin(phi) * Math.cos(theta);
                engine[i*3 + 1] = r * Math.cos(phi);
                engine[i*3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            }
        }
        ico.dispose();

        return [brain, agents, helix, engine];
    }

    function init() {
        const THREE = window.THREE;
        const section = document.getElementById(SECTION_ID);
        const canvas = document.getElementById(CANVAS_ID);
        if (!section || !canvas) {
            console.warn('[showcase] section or canvas not found');
            return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        const camRadius = 11;
        camera.position.set(0, 0, camRadius);

        const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);

        function fitRenderer() {
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            renderer.setSize(rect.width, rect.height, false);
            camera.aspect = rect.width / rect.height;
            camera.updateProjectionMatrix();
        }
        fitRenderer();

        const glowTex = makeGlowTexture(THREE);
        const forms = generateForms(PARTICLE_COUNT, THREE);

        /* Working position buffer — overwritten each frame with the
         * interpolated form + per-particle jitter. */
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        positions.set(forms[0]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        /* Per-particle jitter offsets so each one breathes on its own clock. */
        const jitter = new Float32Array(PARTICLE_COUNT * 3);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            jitter[i*3]     = Math.random() * Math.PI * 2;
            jitter[i*3 + 1] = Math.random() * Math.PI * 2;
            jitter[i*3 + 2] = 0.04 + Math.random() * 0.07; // amplitude
        }

        const pointMat = new THREE.PointsMaterial({
            size: 0.19,
            map: glowTex,
            color: 0x0176d3,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
            opacity: 1.0
        });

        const points = new THREE.Points(geometry, pointMat);
        scene.add(points);

        function updateColors() {
            const styles = getComputedStyle(document.body);
            const blue = (styles.getPropertyValue('--sf-blue') || '#0176D3').trim();
            try {
                pointMat.color.set(blue);
                // Darken slightly so the figure reads as a deeper, more
                // saturated blue against the background.
                pointMat.color.multiplyScalar(0.82);
            } catch (e) { /* keep prev */ }
            const isDark = document.body.classList.contains('dark');
            pointMat.opacity = isDark ? 1.0 : 0.95;
        }
        updateColors();
        const themeObs = new MutationObserver(updateColors);
        themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        /* Scroll progress: how far the section has been scrolled past the
         * viewport. 0 when its top hits the viewport top, 1 when its bottom
         * hits the viewport bottom (i.e. when the sticky pin releases). */
        let progress = 0;
        function computeProgress() {
            const rect = section.getBoundingClientRect();
            const total = rect.height - window.innerHeight;
            if (total <= 0) { progress = 0; return; }
            progress = Math.max(0, Math.min(1, -rect.top / total));
        }
        computeProgress();
        window.addEventListener('scroll', computeProgress, { passive: true });
        window.addEventListener('resize', function () {
            fitRenderer();
            computeProgress();
        });

        let visible = true;
        document.addEventListener('visibilitychange', function () {
            visible = !document.hidden;
        });

        /* Skip rendering when the section is well outside the viewport — avoids
         * burning GPU on a hidden canvas. */
        function isInView() {
            const rect = section.getBoundingClientRect();
            return rect.bottom > -300 && rect.top < window.innerHeight + 300;
        }

        const clock = new THREE.Clock();
        const numForms = forms.length;

        function animate() {
            requestAnimationFrame(animate);
            if (!visible || !isInView()) return;

            const t = clock.getElapsedTime();

            /* Map scroll progress (0..1) onto form indices (0..3). Fractional
             * part is the lerp amount between formA and formB. Smoothstep on
             * fT gives gentler form-to-form transitions. */
            const formScalar = progress * (numForms - 1);
            const formA = Math.min(numForms - 1, Math.floor(formScalar));
            const formB = Math.min(numForms - 1, formA + 1);
            const fT = formScalar - formA;
            const eT = fT * fT * (3 - 2 * fT);

            const A = forms[formA];
            const B = forms[formB];
            const pos = geometry.attributes.position.array;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const idx = i * 3;
                const px = jitter[idx];
                const py = jitter[idx + 1];
                const amp = jitter[idx + 2];
                const jx = Math.sin(t * 0.55 + px) * amp;
                const jy = Math.cos(t * 0.45 + py) * amp;
                const jz = Math.sin(t * 0.65 + px * 1.3) * amp * 0.5;
                pos[idx]     = A[idx]     * (1 - eT) + B[idx]     * eT + jx;
                pos[idx + 1] = A[idx + 1] * (1 - eT) + B[idx + 1] * eT + jy;
                pos[idx + 2] = A[idx + 2] * (1 - eT) + B[idx + 2] * eT + jz;
            }
            geometry.attributes.position.needsUpdate = true;

            /* Camera: continuous slow Y-orbit + gentle Y bob. Scroll progress
             * adds a small extra rotation so each form is seen from a slightly
             * different angle. */
            const camAngle = t * 0.13 + progress * 0.6;
            camera.position.x = Math.sin(camAngle) * camRadius;
            camera.position.z = Math.cos(camAngle) * camRadius;
            camera.position.y = Math.sin(t * 0.07) * 0.7;
            camera.lookAt(0, 0, 0);

            renderer.render(scene, camera);
        }
        animate();
    }

    loadThree()
        .then(init)
        .catch(function (err) {
            console.warn('[showcase] Three.js failed to load:', err);
        });
})();
