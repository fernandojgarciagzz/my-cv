// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080/playground.html';
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 844, height: 390 };        // a phone turned on its side: Orbit needs the width
const PORTRAIT = { width: 390, height: 844 };

const state = (page) => page.evaluate(() => window.__game.state());
const shipY = (page) => page.evaluate(() => window.__game.y());

/** Hold the thrust key for a while, then let go. */
async function thrust(page, ms) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(ms);
    await page.keyboard.up('Space');
}

test.describe('Playground — Desktop', () => {
    test.use({ viewport: DESKTOP });

    test('has one side: always dark and warm, with no theme toggle', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('#darkToggle')).toHaveCount(0);
        await expect(page.locator('body')).toHaveClass(/dark/);
        await expect(page.locator('html')).toHaveClass(/claude-mode/);
        await expect(page.locator('html')).not.toHaveClass(/light/);
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor), { timeout: 4000 }).toBe('rgb(22, 12, 6)');
        await page.reload();
        await expect(page.locator('body')).toHaveClass(/dark/);
    });

    test('the black hole runs behind the game', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'load' });
        await expect(page.locator('#space')).toHaveAttribute('data-ambient', '');
        await expect(page.locator('html')).toHaveClass(/space-live|no-webgl/, { timeout: 8000 });
        const cls = await page.evaluate(() => document.documentElement.className);
        if (cls.includes('space-live')) {
            const painted = await page.locator('#space').evaluate(el => el.width > 100 && getComputedStyle(el).opacity !== '0');
            expect(painted).toBe(true);
        }
    });

    test('game canvas fills the space between the nav and the score bar', async ({ page }) => {
        await page.goto(BASE);
        const box = await page.locator('#gameArea').boundingBox();
        expect(box.height).toBeGreaterThan(650);
        expect(box.width).toBeGreaterThanOrEqual(1200);
    });

    test('Space starts the flight', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('#gameScoreBar')).toContainText('fly');
        expect(await state(page)).toBe('idle');
        await page.keyboard.press('Space');
        await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
        await expect(page.locator('#gameScoreBar')).toContainText('climb');
    });

    test('holding lifts the rocket, letting go drops it', async ({ page }) => {
        await page.goto(BASE);
        await page.keyboard.press('Space');
        await expect.poll(() => state(page)).toBe('running');
        const start = await shipY(page);
        await thrust(page, 350);
        const top = await shipY(page);
        expect(top).toBeLessThan(start);                 // up the screen
        // weight takes over: the climb reverses, then the rocket falls
        await expect.poll(() => page.evaluate(() => window.__game.vy()), { timeout: 3000 }).toBeGreaterThan(0);
        const turn = await shipY(page);
        await page.waitForTimeout(300);
        expect(await shipY(page)).toBeGreaterThan(turn);
    });

    test('left alone the rocket falls into the ground and the run ends', async ({ page }) => {
        await page.goto(BASE);
        await page.keyboard.press('Space');
        await expect.poll(() => state(page)).toBe('running');
        await expect.poll(() => state(page), { timeout: 8000 }).toBe('over');
        await expect(page.locator('#gameScoreBar')).toContainText('crashed');
    });

    test('a new run can be started after a crash', async ({ page }) => {
        await page.goto(BASE);
        await page.keyboard.press('Space');
        await expect.poll(() => state(page), { timeout: 8000 }).toBe('over');
        await page.waitForTimeout(700);
        await page.keyboard.press('Space');
        await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
    });

    test('the best score is kept across reloads', async ({ page }) => {
        await page.goto(BASE);
        await page.keyboard.press('Space');
        await thrust(page, 900);
        await expect.poll(() => state(page), { timeout: 10000 }).toBe('over');
        const best = await page.evaluate(() => window.__game.best());
        expect(best).toBeGreaterThan(0);
        await page.reload();
        await expect.poll(() => page.evaluate(() => window.__game.best()), { timeout: 4000 }).toBe(best);
        await expect(page.locator('#gameScore')).toContainText('best ' + best);
    });

    test('the score bar keeps both readouts on one line', async ({ page }) => {
        await page.goto(BASE);
        await page.keyboard.press('Space');
        await expect.poll(() => state(page)).toBe('running');
        const heights = await page.evaluate(() => [document.getElementById('gameScoreBar').getBoundingClientRect().height,
                                                   document.getElementById('gameScore').getBoundingClientRect().height]);
        expect(heights[0]).toBeLessThan(24);
        expect(heights[1]).toBeLessThan(24);
    });

    test('mute toggle switches the icons', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('#soundOn')).toBeVisible();
        await page.click('#muteBtn');
        await expect(page.locator('#soundOff')).toBeVisible();
        await expect(page.locator('#soundOn')).toBeHidden();
        await page.click('#muteBtn');
        await expect(page.locator('#soundOn')).toBeVisible();
    });

    test('back link goes to the portfolio', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('a.nav-back')).toHaveAttribute('href', 'index.html');
    });
});

test.describe('Playground — Mobile', () => {
    test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

    test('game area fills the phone on its side', async ({ page }) => {
        await page.goto(BASE);
        const box = await page.locator('#gameArea').boundingBox();
        expect(box.width).toBeCloseTo(MOBILE.width, 0);
        expect(box.height).toBeGreaterThan(MOBILE.height * 0.7);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await expect(page.locator('#rotateNote')).toBeHidden();
    });

    test('a tap starts the flight and holding lifts the ship', async ({ page }) => {
        await page.goto(BASE);
        const box = await page.locator('#gameArea').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
        const start = await shipY(page);
        await page.waitForTimeout(320);
        const top = await shipY(page);
        await page.mouse.up();
        expect(top).toBeLessThan(start);
    });

    test('the score bar stays visible', async ({ page }) => {
        await page.goto(BASE);
        const bar = await page.locator('.score-bar').boundingBox();
        expect(bar.y + bar.height).toBeLessThanOrEqual(MOBILE.height + 1);
        await expect(page.locator('#gameScoreBar')).toBeVisible();
    });
});

test.describe('Playground — phone held upright', () => {
    test.use({ viewport: PORTRAIT, hasTouch: true, isMobile: true });

    test('asks for the long side and holds the flight until it gets it', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('#rotateNote')).toBeVisible();
        await expect(page.locator('#rotateNote')).toContainText('Turn your phone');
        const box = await page.locator('#gameArea').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(400);
        await page.mouse.up();
        expect(await state(page)).toBe('idle');                 // nothing started
        // turned on its side, it plays
        await page.setViewportSize(MOBILE);
        await page.waitForTimeout(400);
        await expect(page.locator('#rotateNote')).toBeHidden();
        await page.mouse.move(200, 150);
        await page.mouse.down();
        await expect.poll(() => state(page), { timeout: 3000 }).toBe('running');
        await page.mouse.up();
    });
});

test.describe('Playground — viewports', () => {
    const VIEWPORTS = [
        { name: 'small phone', width: 568, height: 320 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'laptop', width: 1440, height: 900 }
    ];
    for (const vp of VIEWPORTS) {
        test(`lays out at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(BASE);
            await page.waitForTimeout(300);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            expect(overflow).toBeLessThanOrEqual(0);
            const box = await page.locator('#gameArea').boundingBox();
            expect(box.width).toBeCloseTo(vp.width, 0);
            expect(box.height).toBeGreaterThan(vp.height * 0.7);
        });
    }
});
