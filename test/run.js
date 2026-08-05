/* Self-contained test. Serves a mock Microsoft Form locally (test/mock-form.html)
 * and drives the real content script against it with headless Chrome.
 *
 * Covers the paths that are easy to break: long text, Likert grids where both
 * rows share option values, checkbox + "Other" free text, date-skipping, and
 * multi-page save-merge + auto-refill after Next.
 *
 *   node test/run.js
 *   CHROME_PATH=/path/to/chrome node test/run.js
 *
 * Deliberately does NOT hit any real Microsoft Form.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8777;
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(CHROME)) {
  console.error(`Chrome not found at: ${CHROME}\nSet CHROME_PATH to your Chrome binary.`);
  process.exit(1);
}

// The console build is content.js plus a localStorage shim, so testing it
// tests the extension's logic too.
const SNIPPET = fs.readFileSync(path.join(ROOT, 'console-snippet.js'), 'utf8');

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(path.join(__dirname, 'mock-form.html')));
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  const URL_MOCK = `http://localhost:${PORT}/?id=MOCKFORM123`;

  const inject = async () => {
    await page.evaluate(SNIPPET);
    await sleep(1500);
  };
  const panel = (sel) =>
    page.evaluate(
      (s) => document.getElementById('msforms-autofill-host').shadowRoot.querySelector(s).click(),
      sel
    );
  const status = () =>
    page.evaluate(
      () => document.getElementById('msforms-autofill-host').shadowRoot.querySelector('#status').textContent
    );
  const snap = () =>
    page.evaluate(() => ({
      text: [...document.querySelectorAll('input[data-automation-id="textInput"], textarea')].map((e) => e.value),
      chosen: [...document.querySelectorAll('input[role="radio"], input[role="checkbox"]')]
        .filter((e) => e.checked)
        .map((e) => `${e.name}=${e.value || '(other)'}`),
      date: (document.querySelector('input[id^="DatePicker"]') || {}).value ?? null,
    }));

  const failures = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
    if (!ok) failures.push(name);
  };

  // Page 1: answer by hand. The two Likert rows get DIFFERENT answers.
  await page.goto(URL_MOCK, { waitUntil: 'domcontentloaded' });
  await sleep(300);
  await page.evaluate(() => {
    document.querySelector('input[data-automation-id="textInput"]').value = 'Generic Person';
    document.querySelector('textarea').value = 'A longer answer\nacross two lines';
    document.querySelector('input[name="rAAA3_row1"][value="Agree"]').click();
    document.querySelector('input[name="rAAA3_row2"][value="Disagree"]').click();
    document.querySelector('input[id^="DatePicker"]').value = '8/4/2026';
  });
  const page1Before = await snap();
  await inject();
  await panel('#save');
  await sleep(400);

  // Next -> page 2, answer, save. Page 1 must survive the save.
  await page.click('#next');
  await sleep(800);
  await page.evaluate(() => {
    document.querySelector('input[value="Alpha"]').click();
    document.querySelector('input[value="Gamma"]').click();
    document.querySelector('input[aria-label="Other answer"][role="checkbox"]').click();
    document.querySelector('input[value="Right"]').click();
  });
  // The mock mounts the Other text box asynchronously, as Forms does.
  await page.waitForSelector('input[data-automation-id="textInput"][aria-label="Other answer"]', { timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector('input[data-automation-id="textInput"][aria-label="Other answer"]').value = 'Something else';
  });
  const page2Before = await snap();
  await panel('#save');
  await sleep(400);

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('msformsAutofill:msforms:MOCKFORM123'))
  );
  const ids = Object.keys(stored.answers);
  check('multi-page: both pages kept in storage', ids.length === 5 && ids.includes('rAAA1') && ids.includes('rBBB1'), JSON.stringify(ids));
  check(
    'Likert stored per row, not collapsed',
    stored.answers.rAAA3 &&
      stored.answers.rAAA3.type === 'radioRows' &&
      Object.keys(stored.answers.rAAA3.value).length === 2 &&
      Object.values(stored.answers.rAAA3.value).sort().join(',') === 'Agree,Disagree',
    JSON.stringify(stored.answers.rAAA3)
  );
  check('date never saved', !ids.includes('rAAA4'), JSON.stringify(ids));

  // Turn auto-fill on, reload to a genuinely blank form, verify.
  await page.evaluate(() => {
    const k = 'msformsAutofill:msforms:MOCKFORM123';
    const v = JSON.parse(localStorage.getItem(k));
    v.auto = true;
    localStorage.setItem(k, JSON.stringify(v));
  });
  await page.goto(URL_MOCK, { waitUntil: 'domcontentloaded' });
  await sleep(300);
  const blank = await snap();
  check('form genuinely blank before autofill', !JSON.stringify(blank).includes('Generic Person'), JSON.stringify(blank));

  await inject();
  await sleep(1500);
  const page1After = await snap();
  console.log('status:', await status());
  check(
    'page 1 text + long text restored',
    page1After.text[0] === page1Before.text[0] && page1After.text[1] === page1Before.text[1],
    JSON.stringify(page1After.text)
  );
  check(
    'page 1 Likert rows restored independently',
    JSON.stringify(page1After.chosen) === JSON.stringify(page1Before.chosen),
    `${JSON.stringify(page1Before.chosen)} vs ${JSON.stringify(page1After.chosen)}`
  );
  check('date left empty', page1After.date === '', JSON.stringify(page1After.date));

  // Next -> page 2 should refill itself with no clicks.
  await page.click('#next');
  await sleep(2500);
  const page2After = await snap();
  check(
    'page 2 auto-refilled after Next (checkboxes + Other + radio)',
    JSON.stringify(page2After.chosen) === JSON.stringify(page2Before.chosen) &&
      page2After.text.includes('Something else'),
    `${JSON.stringify(page2Before)} vs ${JSON.stringify(page2After)}`
  );

  // Clearing a field and saving must actually clear it, without touching the
  // answers belonging to the page that isn't currently rendered.
  await page.goto(URL_MOCK, { waitUntil: 'domcontentloaded' });
  await sleep(300);
  await inject();
  await sleep(1500);
  await page.evaluate(() => {
    document.querySelector('input[data-automation-id="textInput"]').value = '';
    document.querySelector('textarea').value = '';
  });
  await panel('#save');
  await sleep(500);
  const afterClear = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('msformsAutofill:msforms:MOCKFORM123'))
  );
  const keptIds = Object.keys(afterClear.answers);
  check(
    'clearing a field removes it from storage',
    !keptIds.includes('rAAA1') && !keptIds.includes('rAAA2'),
    JSON.stringify(keptIds)
  );
  check(
    'clearing page 1 does not touch page 2 answers',
    keptIds.includes('rBBB1') && keptIds.includes('rBBB2') && keptIds.includes('rAAA3'),
    JSON.stringify(keptIds)
  );

  console.log(`\n${failures.length ? 'FAILED: ' + failures.join(', ') : 'All checks passed.'}`);
  await browser.close();
  server.close();
  process.exit(failures.length ? 1 : 0);
})();
