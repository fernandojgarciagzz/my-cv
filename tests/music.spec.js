// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080/music.html';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function firstRecord(page) {
    const card = page.locator('.vinyl-card:not(.coming-soon)').first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = await card.locator('.vinyl-flip').boundingBox();
    return { card, box };
}

test.describe('Roho — structure', () => {
    test.use({ viewport: DESKTOP });

    test('opens dark in the warm palette with the black hole behind the page, and keeps its own words', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await expect(page.locator('html')).toHaveClass(/dark/);
        await expect(page.locator('html')).toHaveClass(/claude-mode/);
        await expect(page.locator('#space')).toHaveAttribute('data-ambient', '');
        await expect(page.locator('html')).toHaveClass(/space-live/, { timeout: 6000 });
        await expect(page.locator('.album-title')).toHaveText('Roho');
        await expect(page.locator('.hero')).toContainText('an album by');
        await expect(page.locator('.hero')).toContainText('Fernando García');
        await expect(page.locator('.hero')).toContainText('soul, in sound');
        await expect(page.locator('.vinyl-card')).toHaveCount(7);
        await expect(page.locator('.vinyl-card:not(.coming-soon)')).toHaveCount(5);
        await expect(page.locator('.vinyl-card.coming-soon')).toHaveCount(2);
        // every track keeps its file and its name
        const names = await page.locator('.vinyl-card:not(.coming-soon) .track-name').allTextContents();
        expect(names).toEqual(['Hatua Kwa Hatua', 'Kuwa Hapa Sa', 'Tiririka', 'Nashukuru', 'Kuwa Hapa Sa V2']);
        const srcs = await page.locator('.vinyl-card:not(.coming-soon)').evaluateAll(els => els.map(e => e.getAttribute('data-src')));
        expect(srcs.every(s => s && s.endsWith('.mp3'))).toBe(true);
    });

    test('every record is a live 3D one drawn into its own canvas', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await expect(page.locator('.vinyl-card.is-live')).toHaveCount(7, { timeout: 8000 });
        const drawn = await page.locator('.vinyl-card canvas.vinyl-3d').first().evaluate(c => {
            const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
            return { w: c.width, painted: n / (d.length / 4) };
        });
        expect(drawn.w).toBeGreaterThan(100);
        expect(drawn.painted).toBeGreaterThan(0.3);           // the disc covers a good share of its canvas
    });

    test('tapping a record marks it playing, spins it and shows the player with its name', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const { card, box } = await firstRecord(page);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(card).toHaveClass(/flipped/);
        await expect(card).toHaveClass(/playing/, { timeout: 3000 });
        await expect(page.locator('body')).toHaveClass(/player-visible/);
        await expect(page.locator('#playerName')).toHaveText('Hatua Kwa Hatua');
        await expect(page.locator('#playerNum')).toHaveText('01');
        const src = await page.locator('#trackAudio').evaluate(a => a.getAttribute('src'));
        expect(src).toContain('Hatua Kwa Hatua');
        // pause from the bar: the record stops being marked playing, the bar stays
        await page.click('#btnPlay');
        await expect(card).not.toHaveClass(/playing/);
        await expect(page.locator('body')).toHaveClass(/player-visible/);
    });

    test('records are reachable from the keyboard', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const card = page.locator('.vinyl-card:not(.coming-soon)').nth(1);
        await card.focus();
        await page.keyboard.press('Enter');
        await expect(card).toHaveClass(/playing/, { timeout: 3000 });
        await expect(page.locator('#playerName')).toHaveText('Kuwa Hapa Sa');
    });

    test('the toggle blows the hole apart into the light side for this visit only, and back', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await expect(page.locator('html')).toHaveClass(/space-live/, { timeout: 6000 });
        await page.click('#darkToggle');
        await expect(page.locator('html')).toHaveClass(/light/, { timeout: 4000 });
        await expect(page.locator('html')).not.toHaveClass(/claude-mode/);
        const spaceShown = await page.locator('#space').evaluate(el => getComputedStyle(el).display !== 'none');
        expect(spaceShown).toBe(false);
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor), { timeout: 4000 }).toBe('rgb(255, 255, 255)');
        await page.click('#darkToggle');
        await expect(page.locator('html')).toHaveClass(/claude-mode/);
        await expect(page.locator('html')).not.toHaveClass(/light/);
        // a fresh load is dark again
        await page.reload({ waitUntil: 'load' });
        await expect(page.locator('html')).toHaveClass(/claude-mode/);
    });
});

test.describe('Roho — reduced motion', () => {
    test.use({ viewport: DESKTOP, reducedMotion: 'reduce' });
    test('still shows the page, the records and the player without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        await expect(page.locator('.album-title')).toBeVisible();
        await expect(page.locator('.vinyl-card')).toHaveCount(7);
        const { card, box } = await firstRecord(page);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(card).toHaveClass(/playing/, { timeout: 3000 });
        expect(errors).toEqual([]);
    });
});

test.describe('Roho — mobile', () => {
    test.use({ viewport: MOBILE });
    test('two records per row, nothing overflows sideways, the player bar fits', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        const boxes = await page.locator('.vinyl-card:not(.coming-soon) .vinyl-flip').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({ x: Math.round(r.x), w: Math.round(r.width) })));
        expect(boxes[0].x).not.toEqual(boxes[1].x);          // side by side
        expect(boxes[0].x).toEqual(boxes[2].x);              // next row lines up
        expect(boxes[0].w).toBeLessThanOrEqual(160);
        const { card, box } = await firstRecord(page);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(card).toHaveClass(/playing/, { timeout: 3000 });
        const bar = await page.locator('#playerBar').boundingBox();
        expect(bar.width).toBeLessThanOrEqual(MOBILE.width);
    });
});
