/* Three.js perspective grid background — a faint Tron-style floor receding
 * to the horizon. Replaces the soft-aurora drift with a more structured
 * "infrastructure / system" visual.
 *
 * Visual treatment:
 *   - Single floor plane built from line segments (parallel + perpendicular
 *     to the viewer's gaze) at a fixed y below camera height.
 *   - Custom ShaderMaterial fades line alpha by distance from camera —
 *     near lines clear, far lines dissolve into nothing at the horizon.
 *   - A travelling "ripple" — alpha boost along a moving z front — gives a
 *     constant subtle pulse so the grid feels alive at rest.
 *   - Soft hover glow that follows the cursor on the grid plane (raycast
 *     from camera through mouse onto y=-2.5).
 *
 * Behavior:
 *   - Signed scroll velocity boosts global pulse intensity AND advances the
 *     ripple front faster — scrolling makes the grid feel like it's flowing
 *     toward you.
 *   - Cursor brightens nearby grid intersections; fades when the mouse
 *     leaves the window. Skipped on touch-only devices.
 *
 * Theming: reads --sf-blue from CSS so the grid follows dark mode AND
 * vinyl/Claude mode. Reduced motion: skips init entirely.
 */
(function () {
    'use strict';

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

    const style = document.createElement('style');
    style.textContent =
        '#threeNodeCanvas{position:fixed;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:0;}';
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

    /* Build a flat grid of line segments in the xz plane at y=0. The caller
     * positions/orients the resulting Object3D. Returns BufferGeometry with
     * a position attribute only — colors come from the shader. */
    function buildGridGeometry(THREE, halfX, zNear, zFar, step) {
        const positions = [];
        // Lines parallel to X (varying z)
        for (let z = zNear; z <= zFar + 0.001; z += step) {
            positions.push(-halfX, 0, z, halfX, 0, z);
        }
        // Lines parallel to Z (varying x)
        for (let x = -halfX; x <= halfX + 0.001; x += step) {
            positions.push(x, 0, zNear, x, 0, zFar);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        return geo;
    }

    function init() {
        const THREE = window.THREE;

        const canvas = document.createElement('canvas');
        canvas.id = 'threeNodeCanvas';
        document.body.insertBefore(canvas, document.body.firstChild);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            55,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        // Camera tilted slightly down so the grid recedes toward upper-mid
        // screen — exposes the "infinite" horizon line behind page content.
        camera.position.set(0, 0.6, 7);
        camera.lookAt(0, -2.0, -8);

        const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.setClearColor(0x000000, 0);

        const gridGeo = buildGridGeometry(THREE,
            /* halfX */ 18,
            /* zNear */ -28,
            /* zFar  */  6,
            /* step  */  1.3);

        /* Custom shader: per-fragment alpha falloff by distance from camera
         * + a travelling ripple highlight. uPulse boosts overall brightness;
         * uRipple is a moving z-front position. */
        const gridMat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                uColor:      { value: new THREE.Color(0x0176d3) },
                uOpacity:    { value: 0.22 },
                uPulse:      { value: 0.0 },
                uRipple:     { value: 0.0 },
                uCamPos:     { value: new THREE.Vector3() },
                uMouseWorld: { value: new THREE.Vector3(0, -2.5, 0) },
                uHover:      { value: 0.0 }
            },
            vertexShader: [
                'varying vec3 vWorldPos;',
                'void main() {',
                '    vec4 wp = modelMatrix * vec4(position, 1.0);',
                '    vWorldPos = wp.xyz;',
                '    gl_Position = projectionMatrix * viewMatrix * wp;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uColor;',
                'uniform float uOpacity;',
                'uniform float uPulse;',
                'uniform float uRipple;',
                'uniform vec3 uCamPos;',
                'uniform vec3 uMouseWorld;',
                'uniform float uHover;',
                'varying vec3 vWorldPos;',
                'void main() {',
                '    float dist = length(vWorldPos - uCamPos);',
                // Fade in over near range, fade out toward far range.
                '    float near = smoothstep(0.5, 3.5, dist);',
                '    float far  = smoothstep(28.0, 8.0, dist);',
                // Travelling ripple: a soft band centered at uRipple in world z.
                '    float band = exp(-pow((vWorldPos.z - uRipple) * 0.45, 2.0));',
                // Hover glow: gaussian falloff in the xz plane around the cursor.
                '    vec2 dxz = vWorldPos.xz - uMouseWorld.xz;',
                '    float hover = exp(-pow(length(dxz) * 0.18, 2.0)) * uHover;',
                '    float a = uOpacity * near * far * (1.0 + uPulse * 0.7 + band * 0.55 + hover * 1.9);',
                '    a = clamp(a, 0.0, 1.0);',
                // Brighten the line color near the cursor — makes the hover
                // visibly "lift" lines toward white instead of just adding alpha.
                '    vec3 col = uColor + vec3(hover * 0.75);',
                '    gl_FragColor = vec4(col, a);',
                '}'
            ].join('\n')
        });

        const grid = new THREE.LineSegments(gridGeo, gridMat);
        grid.position.y = -2.5;
        scene.add(grid);

        function updateColors() {
            const styles = getComputedStyle(document.body);
            const blue = (styles.getPropertyValue('--sf-blue') || '#0176D3').trim();
            const isDark = document.body.classList.contains('dark');
            try {
                gridMat.uniforms.uColor.value.set(blue);
                gridMat.uniforms.uColor.value.multiplyScalar(0.82);
            } catch (e) { /* invalid color string — keep previous */ }
            // Slightly lower base opacity in light mode so it doesn't
            // dominate the page; keep it readable in dark.
            gridMat.uniforms.uOpacity.value = isDark ? 0.26 : 0.18;
        }
        updateColors();

        const themeObs = new MutationObserver(updateColors);
        themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        /* Signed scroll velocity: positive on down-scroll, decays per frame.
         * Drives both the global pulse and ripple-front speed. */
        let scrollVelocity = 0;
        let lastScrollY = window.scrollY;

        function onScroll() {
            const dy = window.scrollY - lastScrollY;
            scrollVelocity += dy * 0.0035;
            if (scrollVelocity > 3) scrollVelocity = 3;
            else if (scrollVelocity < -3) scrollVelocity = -3;
            lastScrollY = window.scrollY;
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        window.addEventListener('resize', function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight, false);
        });

        let visible = true;
        document.addEventListener('visibilitychange', function () {
            visible = !document.hidden;
        });

        /* Hover glow — raycast from camera through cursor onto the grid
         * plane (y = -2.5) each frame the mouse is over the window. Skipped
         * on touch-only devices where hover doesn't apply. */
        const supportsHover = !window.matchMedia ||
            !window.matchMedia('(hover: none)').matches;
        const raycaster = new THREE.Raycaster();
        const mouseNDC = new THREE.Vector2();
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.5);
        const hitTmp = new THREE.Vector3();
        let hoverTarget = 0;
        let mouseInside = false;

        if (supportsHover) {
            window.addEventListener('mousemove', function (e) {
                mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
                mouseInside = true;
                hoverTarget = 1;
            }, { passive: true });
            document.addEventListener('mouseleave', function () {
                hoverTarget = 0;
            });
            window.addEventListener('blur', function () {
                hoverTarget = 0;
            });
        }

        const clock = new THREE.Clock();
        let ripplePos = 0;

        function animate() {
            requestAnimationFrame(animate);
            if (!visible) return;

            const t = clock.getElapsedTime();
            scrollVelocity *= 0.88;

            // Ripple advances steadily even at rest, faster while scrolling.
            // Scroll direction sets ripple direction so down-scroll feels
            // like flowing forward, up-scroll like reversing.
            ripplePos -= 0.04 + scrollVelocity * 1.2;
            // Wrap so ripple loops through the visible grid extent.
            if (ripplePos < -32) ripplePos = 4;
            if (ripplePos >  4) ripplePos = -32;

            gridMat.uniforms.uRipple.value = ripplePos;
            gridMat.uniforms.uPulse.value = Math.min(1, Math.abs(scrollVelocity) * 0.65);
            gridMat.uniforms.uCamPos.value.copy(camera.position);

            // Smooth ease toward hover target so mouseenter/leave fade in/out.
            const hoverCurr = gridMat.uniforms.uHover.value;
            gridMat.uniforms.uHover.value = hoverCurr + (hoverTarget - hoverCurr) * 0.15;
            if (supportsHover && mouseInside) {
                raycaster.setFromCamera(mouseNDC, camera);
                if (raycaster.ray.intersectPlane(groundPlane, hitTmp)) {
                    gridMat.uniforms.uMouseWorld.value.copy(hitTmp);
                }
            }

            renderer.render(scene, camera);
        }

        animate();
    }

    loadThree()
        .then(init)
        .catch(function (err) {
            console.warn('[animations] Three.js failed to load:', err);
        });
})();
