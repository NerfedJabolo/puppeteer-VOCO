'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE_URL = 'https://the-internet.herokuapp.com';
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');
const BROWSER_CACHE = path.join(__dirname, '.cache', 'puppeteer');

// Puppeteer paigaldati workspaci cache'i, mitte kasutaja kodukataloogi.
process.env.PUPPETEER_CACHE_DIR ||= BROWSER_CACHE;

const puppeteer = require('puppeteer');

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const results = [];
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(line = '') {
  console.log(line);
}

async function takeScreenshot(page, number, slug) {
  const file = path.join(ARTIFACTS_DIR, `${String(number).padStart(2, '0')}-${slug}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(__dirname, file).split(path.sep).join('/');
}

async function runTask(browser, number, title, slug, test) {
  let page;
  const startedAt = new Date();

  log(`\n[${number}/7] ${title}`);

  try {
    page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(45_000);

    const details = await test(page);
    const screenshot = await takeScreenshot(page, number, slug);

    results.push({
      number,
      title,
      status: 'PASS',
      details,
      screenshot,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    });

    log('  ✓ PASS');
  } catch (error) {
    failed += 1;

    let screenshot = null;
    try {
      if (page && !page.isClosed()) {
        screenshot = await takeScreenshot(page, number, `${slug}-FAIL`);
      }
    } catch {
      // Vea hetkel ei pruugi screenshot enam võimalik olla.
    }

    results.push({
      number,
      title,
      status: 'FAIL',
      error: error.message,
      screenshot,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    });

    log(`  ✗ FAIL: ${error.message}`);
  } finally {
    if (page && !page.isClosed()) await page.close();
  }
}

async function main() {
  const browserHome = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer-home-'));
  const browserEnv = {
    ...process.env,
    HOME: browserHome,
    XDG_CONFIG_HOME: path.join(browserHome, '.config'),
    XDG_CACHE_HOME: path.join(browserHome, '.cache'),
  };
  fs.mkdirSync(browserEnv.XDG_CONFIG_HOME, { recursive: true });
  fs.mkdirSync(browserEnv.XDG_CACHE_HOME, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    env: browserEnv,
    defaultViewport: { width: 1280, height: 900 },
    // Konteineris/piiratud keskkonnas vajalik; Chromiumi sandbox ei ole siin kasutatav.
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  log('The Internet – Puppeteer ülesanded');
  log(`Algus: ${new Date().toISOString()}`);

  try {
    // 1. A/B testimine
    await runTask(browser, 1, 'A/B testimine', 'abtest', async (page) => {
      await page.goto(`${BASE_URL}/abtest`, { waitUntil: 'domcontentloaded' });

      const heading = await page.$eval('h3', (element) => element.textContent.trim());
      assert(heading.length > 0, 'Lehelt ei leitud <h3> pealkirja.');

      log(`  Pealkiri: ${heading}`);
      return { url: `${BASE_URL}/abtest`, heading };
    });

    // 2. Lisa/eemalda elemendid
    await runTask(browser, 2, 'Lisa/eemalda elemendid', 'add-remove-elements', async (page) => {
      await page.goto(`${BASE_URL}/add_remove_elements/`, { waitUntil: 'domcontentloaded' });

      const addButton = 'button[onclick="addElement()"]';
      await page.click(addButton);
      await page.click(addButton);

      await page.waitForFunction(
        () => document.querySelectorAll('#elements .added-manually').length === 2,
        { timeout: 5_000 },
      );

      const afterAdd = await page.$$eval('#elements .added-manually', (buttons) => buttons.length);
      assert(afterAdd === 2, `Oodati 2 Delete nuppu, leiti ${afterAdd}.`);
      log(`  Pärast kahte lisamist: ${afterAdd} Delete nuppu`);

      await page.click('#elements .added-manually');
      await page.waitForFunction(
        () => document.querySelectorAll('#elements .added-manually').length === 1,
        { timeout: 5_000 },
      );

      const afterRemove = await page.$$eval('#elements .added-manually', (buttons) => buttons.length);
      assert(afterRemove === 1, `Pärast eemaldamist oodati 1 Delete nuppu, leiti ${afterRemove}.`);
      log(`  Pärast ühe eemaldamist: ${afterRemove} Delete nupp`);

      return { added: 2, afterRemove };
    });

    // 3. Katkised pildid
    await runTask(browser, 3, 'Katkised pildid', 'broken-images', async (page) => {
      await page.goto(`${BASE_URL}/broken_images`, { waitUntil: 'load' });

      await page.waitForFunction(
        () => Array.from(document.images).every((image) => image.complete),
        { timeout: 15_000 },
      );

      const images = await page.$$eval('img', (elements) =>
        elements.map((image) => ({
          src: image.getAttribute('src'),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          broken: image.complete && image.naturalWidth === 0,
        })),
      );

      const broken = images.filter((image) => image.broken);
      assert(images.length > 0, 'Lehel ei leitud ühtegi <img> elementi.');
      assert(broken.length === 2, `Oodati 2 katkist pilti, leiti ${broken.length}.`);

      log(`  Pilte kokku: ${images.length}`);
      log(`  Katkisi pilte: ${broken.length}`);
      for (const image of images) {
        log(`    - ${image.src}: ${image.broken ? 'KATKI' : 'OK'}`);
      }

      return { total: images.length, broken: broken.length, images };
    });

    // 4. Checkboxes
    await runTask(browser, 4, 'Checkboxes', 'checkboxes', async (page) => {
      await page.goto(`${BASE_URL}/checkboxes`, { waitUntil: 'domcontentloaded' });

      const boxes = await page.$$('#checkboxes input[type="checkbox"]');
      assert(boxes.length === 2, `Oodati 2 checkboxi, leiti ${boxes.length}.`);

      for (const box of boxes) {
        const isChecked = await box.evaluate((element) => element.checked);
        if (!isChecked) await box.click();
      }

      const checked = await page.$$eval('#checkboxes input[type="checkbox"]', (elements) =>
        elements.map((element) => element.checked),
      );

      assert(checked.length === 2, `Kontrollimisel leiti ${checked.length} checkboxi.`);
      assert(checked.every(Boolean), `Kõik checkboxid ei ole märgitud: ${JSON.stringify(checked)}.`);

      log(`  Märgitud: ${checked.filter(Boolean).length}/${checked.length}`);
      log(`  Olekud: ${checked.join(', ')}`);

      return { total: checked.length, checked };
    });

    // 5. Kontekstimenüü
    await runTask(browser, 5, 'Kontekstimenüü', 'context-menu', async (page) => {
      await page.goto(`${BASE_URL}/context_menu`, { waitUntil: 'domcontentloaded' });

      const dialogPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Hoiatusaken ei ilmunud 5 sekundi jooksul.')), 5_000);

        page.once('dialog', async (dialog) => {
          clearTimeout(timeout);
          try {
            const message = dialog.message();
            await dialog.accept();
            resolve(message);
          } catch (error) {
            reject(error);
          }
        });
      });

      await page.click('#hot-spot', { button: 'right' });
      const message = await dialogPromise;

      assert(message.includes('You selected a context menu'), `Ootamatu hoiatusakna sõnum: "${message}"`);
      log(`  Hoiatusakna sõnum: "${message}"`);
      log('  Hoiatusakna sõnum kinnitati (OK).');

      return { message, accepted: true };
    });

    // 6. Loe elemendid
    await runTask(browser, 6, 'Loe elemendid', 'disappearing-elements', async (page) => {
      await page.goto(`${BASE_URL}/disappearing_elements`, { waitUntil: 'domcontentloaded' });

      const navItems = await page.$$eval('.example > ul > li', (elements) =>
        elements.map((element) => element.textContent.trim()).filter(Boolean),
      );

      assert(navItems.length > 0, 'Navigeerimismenüü elemente ei leitud.');
      assert(navItems.length >= 4, `Oodati vähemalt 4 menüü elementi, leiti ${navItems.length}.`);

      log(`  Menüü elemente: ${navItems.length}`);
      log(`  Elemendid: ${navItems.join(', ')}`);

      return { count: navItems.length, items: navItems };
    });

    // 7. Dropdown
    await runTask(browser, 7, 'Dropdown (rippmenüü)', 'dropdown', async (page) => {
      await page.goto(`${BASE_URL}/dropdown`, { waitUntil: 'domcontentloaded' });

      const option2Value = await page.$$eval('#dropdown option', (options) => {
        const option = options.find((item) => item.textContent.trim() === 'Option 2');
        return option ? option.value : null;
      });

      assert(option2Value !== null, 'Rippmenüüst ei leitud "Option 2".');
      await page.select('#dropdown', option2Value);

      const selected = await page.$eval('#dropdown', (select) => {
        const option = select.selectedOptions[0];
        return {
          value: select.value,
          text: option ? option.textContent.trim() : null,
          selectedIndex: select.selectedIndex,
        };
      });

      assert(selected.value === option2Value, `Oodati väärtust "${option2Value}", saadi "${selected.value}".`);
      assert(selected.text === 'Option 2', `Oodati teksti "Option 2", saadi "${selected.text}".`);

      log(`  Valitud tekst: ${selected.text}`);
      log(`  Valitud value: ${selected.value}`);
      log(`  Valitud indeks: ${selected.selectedIndex}`);

      return selected;
    });
  } finally {
    await browser.close();
    fs.rmSync(browserHome, { recursive: true, force: true });
  }

  const summary = {
    baseUrl: BASE_URL,
    finishedAt: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    total: results.length,
    results,
  };

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'results.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );

  log(`\nKokkuvõte: ${summary.passed}/${summary.total} ülesannet õnnestus.`);
  log(`Tulemused: ${path.join('artifacts', 'results.json')}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\nSkripti käivitamine ebaõnnestus:');
  console.error(error);
  process.exitCode = 1;
});
