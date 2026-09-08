// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080/index.html';
const ANCHORS = ['about', 'experience', 'skills', 'tools', 'education', 'dashboards', 'contact'];
const VIEWPORTS = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 834, height: 1194 },
    { name: 'desktop', width: 1440, height: 900 },
];

/** Count visible text/media elements inside the current viewport (0 = blank screen). */
const visibleContent = () => {
    const vh = innerHeight, vw = innerWidth;
    const eff = (el) => { let o = 1; while (el && el.nodeType === 1) { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return 0; o *= parseFloat(s.opacity); el = el.parentElement; } return o; };
    let n = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT); let el;
    while ((el = w.nextNode())) {
        const media = /^(IMG|CANVAS|svg|SVG|VIDEO)$/.test(el.tagName);
        const text = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim().length > 2);
        if (!media && !text) continue;
        if (el.closest('nav, .nav, #robotRunnerCanvas')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        if (eff(el) < 0.1) continue;
        if (++n >= 3) break;
    }
    return n;
};

test.describe('Index — structure', () => {
    test('hero has the words, the galaxy canvas, then the tagline and three proof numbers', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('.hero-first')).toBeVisible();
        await expect(page.locator('#space')).toHaveCount(1);
        await expect(page.locator('.intro h1')).toContainText('Architecting the Future of Agentic Processes');
        await expect(page.locator('.intro .proof-row li')).toHaveCount(3);
        await expect(page.locator('.intro .eyebrow')).toContainText('Solutions Product Manager');
        await page.locator('.intro').scrollIntoViewIfNeeded();
        await expect(page.locator('.intro a[href="#experience"]')).toBeVisible();
        await expect(page.locator('.intro a[href*="linkedin.com"]')).toBeVisible();
        // The space layer rendered (WebGL) or fell back to the static stars — never nothing.
        await page.waitForTimeout(2500);
        const state = await page.evaluate(() => document.documentElement.className);
        expect(/space-live|no-webgl/.test(state)).toBe(true);
    });

    test('nav keeps the same anchors and each target exists', async ({ page }) => {
        await page.goto(BASE);
        for (const a of ANCHORS) {
            await expect(page.locator(`#navLinks a[href="#${a}"]`)).toHaveCount(1);
            await expect(page.locator(`#${a}`)).toHaveCount(1);
        }
    });

    test('every chapter has a sticky label, one headline and at most one media', async ({ page }) => {
        await page.goto(BASE);
        const chapters = page.locator('section.chapter');
        const n = await chapters.count();
        expect(n).toBeGreaterThan(5);
        for (let i = 0; i < n; i++) {
            const ch = chapters.nth(i);
            await expect(ch.locator('.chapter-label')).toHaveCount(1);
            await expect(ch.locator('h2')).toHaveCount(1);
            expect(await ch.locator('figure.media').count()).toBeLessThanOrEqual(1);
            const pos = await ch.locator('.chapter-label').evaluate(el => getComputedStyle(el).position);
            expect(pos).toBe('sticky');
        }
    });

    test('text is selectable and right-click is not blocked', async ({ page }) => {
        await page.goto(BASE);
        const sel = await page.evaluate(() => getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect);
        expect(sel).not.toBe('none');
        const prevented = await page.evaluate(() => {
            const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
            document.querySelector('h1').dispatchEvent(e);
            return e.defaultPrevented;
        });
        expect(prevented).toBe(false);
        const copied = await page.evaluate(() => {
            const r = document.createRange(); r.selectNodeContents(document.querySelector('h1'));
            const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            return s.toString().length;
        });
        expect(copied).toBeGreaterThan(10);
    });

    test('no Spline and no easter-egg script before load; morph loads near viewport', async ({ page }) => {
        const before = new Set();
        let loadFired = false;
        page.on('request', r => { if (!loadFired) before.add(r.url()); });
        page.on('load', () => { loadFired = true; });
        await page.goto(BASE, { waitUntil: 'load' });
        const early = [...before];
        await expect(page.locator('iframe')).toHaveCount(0);
        expect(early.some(u => /spline/i.test(u))).toBe(false);
        expect(early.some(u => /showcase\.js/.test(u))).toBe(false);
        expect(early.some(u => /extras\.js/.test(u))).toBe(false);
        expect(early.some(u => /\.mp3/.test(u))).toBe(false);
        expect(early.some(u => /fontawesome|font-awesome/i.test(u))).toBe(false);
        // Scroll to the morph section: showcase.js must load only then.
        await page.locator('#agentShowcase').scrollIntoViewIfNeeded();
        await page.waitForTimeout(2500);
        const later = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
        expect(later.some(u => /showcase\.js/.test(u))).toBe(true);
        // Never a blank viewport: the static fallback is always in the DOM and visible until the canvas is live.
        const fallbackVisible = await page.locator('.morph-fallback svg').evaluate(el => getComputedStyle(el).display !== 'none');
        expect(fallbackVisible).toBe(true);
    });

    test('space by default; the toggle explodes the galaxy into the CV print preview; key persists', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('body')).toHaveClass(/dark/);
        expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
        await expect(page.locator('#cv')).toBeHidden();
        await page.click('#themeToggle');
        await expect(page.locator('body')).toHaveClass(/light/, { timeout: 5000 });
        expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
        await expect(page.locator('#cv')).toBeVisible();
        await expect(page.locator('.sheet')).toHaveCount(2);
        await expect(page.locator('.page')).toBeHidden();
        await expect(page.locator('.sheet').first()).toContainText('Architecting the Future of Agentic Processes');
        await expect(page.locator('#cvPrint')).toBeVisible();
        await page.reload();
        await expect(page.locator('body')).toHaveClass(/light/);
        await expect(page.locator('#cv')).toBeVisible();
        await page.click('#themeToggle');
        await expect(page.locator('body')).toHaveClass(/dark/);
        expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
        await expect(page.locator('#cv')).toBeHidden();
    });

    test('printing from either mode outputs the CV sheets only', async ({ page }) => {
        await page.goto(BASE);
        await page.emulateMedia({ media: 'print' });
        await expect(page.locator('#cv')).toBeVisible();
        await expect(page.locator('.nav')).toBeHidden();
        await expect(page.locator('.page')).toBeHidden();
        const canvasShown = await page.locator('#space').evaluate(el => getComputedStyle(el).display !== 'none');
        expect(canvasShown).toBe(false);
    });

    test('flipping the record switches to Claude Mode and back', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        await page.locator('#vinylTrigger').scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        const box = await page.locator('#vinylTrigger').boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1200);
        await expect(page.locator('html')).toHaveClass(/claude-mode/);
        await expect(page.locator('#photoContainer')).toHaveClass(/vinyl-active/);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(2200);
        await expect(page.locator('html')).not.toHaveClass(/claude-mode/);
    });
});

test.describe('Index — rhythm', () => {
    test('timeline draws with scroll, label follows the company, rail tracks the chapter', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const tlTop = await page.locator('.timeline').evaluate(el => el.getBoundingClientRect().top + scrollY);
        await page.evaluate(y => window.scrollTo(0, y), tlTop - 300);
        await page.waitForTimeout(700);
        const early = await page.locator('.timeline').evaluate(el => parseFloat(el.style.getPropertyValue('--tl')));
        const tlH = await page.locator('.timeline').evaluate(el => el.getBoundingClientRect().height);
        await page.evaluate(y => window.scrollTo(0, y), tlTop + tlH * 0.6);
        await page.waitForTimeout(700);
        const later = await page.locator('.timeline').evaluate(el => parseFloat(el.style.getPropertyValue('--tl')));
        expect(later).toBeGreaterThan(early);
        expect(later).toBeGreaterThan(0.5);
        await expect(page.locator('#expSub')).toContainText(/Regrello|Metalsa|Salesforce/);
        await expect(page.locator('#rail a.on')).toHaveAttribute('data-ch', 'experience');
        await page.locator('#tools').scrollIntoViewIfNeeded();
        await page.waitForTimeout(700);
        await expect(page.locator('#rail a.on')).toHaveAttribute('data-ch', 'tools');
    });
});

test.describe('Index — reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('reveals show their final state and the morph is static', async ({ page }) => {
        await page.goto(BASE);
        const hidden = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter(el => parseFloat(getComputedStyle(el).opacity) < 1).length);
        expect(hidden).toBe(0);
        await expect(page.locator('#agentShowcase')).toHaveClass(/reduced/);
        const h = await page.locator('#agentShowcase').evaluate(el => el.getBoundingClientRect().height);
        expect(h).toBeLessThan(1000);
        const loaded = await page.evaluate(() => performance.getEntriesByType('resource').some(r => /showcase\.js/.test(r.name)));
        expect(loaded).toBe(false);
    });
});

test.describe('Index — viewports', () => {
    for (const vp of VIEWPORTS) {
        test(`${vp.name} ${vp.width}x${vp.height}: five scroll positions, none blank, no horizontal overflow`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(BASE);
            await page.waitForTimeout(800);
            const total = await page.evaluate(() => document.documentElement.scrollHeight);
            const maxY = Math.max(0, total - vp.height);
            for (let i = 0; i < 5; i++) {
                const y = Math.round(maxY * i / 4);
                await page.evaluate(y => window.scrollTo(0, y), y);
                await page.waitForTimeout(700);
                const n = await page.evaluate(visibleContent);
                expect(n, `blank viewport at y=${y} on ${vp.name}`).toBeGreaterThan(0);
            }
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
            expect(overflow).toBe(false);
        });
    }
});
