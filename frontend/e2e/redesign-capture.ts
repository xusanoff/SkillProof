import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Optional real-session evidence; no recording, timer or interview state is mocked. */
export async function captureInterview(page: Page, name: string, mobile = true) {
  if (!process.env.REDESIGN_CAPTURE_ROOMS) return;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const viewport = page.viewportSize();
  const original = await page.locator('html').getAttribute('class');
  for (const theme of ['light', 'dark']) {
    for (const width of mobile ? [1440, 390] : [1440]) {
      if (page.viewportSize()?.width !== width || page.viewportSize()?.height !== 900) {
        await page.evaluate(async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
        });
        await page.setViewportSize({ width, height: 900 });
      }
      await page.evaluate(
        (value) => document.documentElement.classList.toggle('dark', value === 'dark'),
        theme,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      if (await page.locator('.monaco-editor .view-lines').count()) {
        const font = await page
          .locator('.monaco-editor .view-lines')
          .first()
          .evaluate((element) => getComputedStyle(element).fontFamily);
        expect(font.toLowerCase().replace(/[\s_-]/g, '')).toContain('geistmono');
      }
      const result = await new AxeBuilder({ page }).exclude('.monaco-editor').analyze();
      expect(
        result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: path.resolve(
          __dirname,
          '../../docs/reports/redesign/rooms',
          `${name}-uz-${theme}-${width}.png`,
        ),
        fullPage: true,
      });
      await page.screenshot({
        path: path.resolve(
          __dirname,
          '../../docs/reports/redesign/rooms',
          `${name}-uz-${theme}-${width}-viewport.png`,
        ),
      });
    }
  }
  if (
    viewport &&
    (page.viewportSize()?.width !== viewport.width ||
      page.viewportSize()?.height !== viewport.height)
  )
    await page.setViewportSize(viewport);
  await page.locator('html').evaluate((element, value) => {
    element.setAttribute('class', value ?? '');
  }, original);
}
