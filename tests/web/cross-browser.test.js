'use strict';

// The main behaviour of docs/ in Safari and Firefox, driven through WebDriver. Chrome and Edge have the
// full suite in browser.test.js. A browser whose driver is not running is skipped, with the reason shown.
// Safari: run `sudo safaridriver --enable` once. Firefox: needs geckodriver on the PATH.
// Run with: node --test tests/web/

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { WebDriver } = require('./webdriver');
const { serveDocs } = require('./support');

// Process ids of a running app, so the tests can quit only an app they started
const appPids = (app) => {
  try {
    return execFileSync('pgrep', ['-x', app]).toString().split('\n').filter(Boolean).map(Number);
  } catch {
    return [];  // pgrep exits 1 when nothing matches
  }
};

const DINNER = '# Dinner\nAnna 60 Anna Ben Chloe\nBen 30 Ben Chloe\n';
const DRIVERS = [
  // Safari has no headless mode, and safaridriver leaves Safari running after the session ends
  { name: 'Safari', command: 'safaridriver', args: ['-p', '4445'], port: 4445, capabilities: { browserName: 'safari' }, app: 'Safari' },
  {
    name: 'Firefox',
    command: 'geckodriver',
    args: ['--port', '4446'],
    port: 4446,
    capabilities: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } },
  },
];

for (const config of DRIVERS) {
  describe(`docs/ in ${config.name}`, () => {
    let server;
    let base;
    let driver = null;
    let skip = null;
    let appWasRunning = [];

    before(async () => {
      if (config.app) appWasRunning = appPids(config.app);
      server = await serveDocs();
      base = `http://127.0.0.1:${server.address().port}/`;
      try {
        driver = await WebDriver.start(config);
      } catch (error) {
        skip = `${config.name} is not available: ${error.message}`;
      }
    });

    after(async () => {
      await driver?.quit();
      // Quit the app only if the driver started it, so a Safari the user had open stays open
      if (config.app) for (const pid of appPids(config.app)) if (!appWasRunning.includes(pid)) process.kill(pid);
      server?.close();
    });

    // Opens the app with an empty box and no draft, at the given window size
    async function open(t, width, height) {
      if (skip) t.skip(skip);
      await driver.setWindowSize(width, height);
      await driver.navigate(base);
      await driver.execute('localStorage.clear()');
      await driver.navigate(base);
    }

    async function setInput(text) {
      await driver.execute(`const input = document.getElementById('input'); input.value = arguments[0]; input.dispatchEvent(new Event('input'));`, [text]);
    }

    it('calculates the example and shows how it read the expenses', async (t) => {
      await open(t, 1280, 800);
      await setInput(DINNER);
      await driver.click('#calculate');
      await driver.waitFor("document.getElementById('report').textContent.includes('Anna paid 60.00, split between Anna, Ben, Chloe')");
      const report = await driver.execute("return document.getElementById('report').textContent");
      assert.match(report, /PAYMENTS - who pays whom\nChloe pays Anna 35\.00/);
    });

    it('fits the whole page in a laptop window without scrolling', async (t) => {
      await open(t, 1440, 900);
      const [, height] = await driver.execute('return [innerWidth, innerHeight]');
      if (height < 700) t.skip(`this browser gave a ${height}px tall window`);
      const scroll = await driver.execute('return document.documentElement.scrollHeight - innerHeight');
      assert.ok(scroll <= 0, `scrolls by ${scroll}px`);
    });

    it('keeps Calculate on screen in a phone-sized window', async (t) => {
      await open(t, 390, 844);
      const [width, height] = await driver.execute('return [innerWidth, innerHeight]');
      if (width >= 700) t.skip(`this browser will not make the window narrower than ${width}px`);  // 700px is where the phone layout ends
      const bottom = await driver.execute("return document.getElementById('calculate').getBoundingClientRect().bottom");
      assert.ok(bottom <= height, `Calculate ends at ${bottom}px in a ${height}px tall window`);
    });

    it('opens the file picker from the Load button', async (t) => {
      await open(t, 1280, 800);
      await driver.execute("document.getElementById('file').addEventListener('click', (event) => { event.preventDefault(); window.pickerOpened = true; })");
      await driver.click('#load');
      assert.equal(await driver.execute('return window.pickerOpened === true'), true);
    });

    it('restores the draft after a reload', async (t) => {
      await open(t, 1280, 800);
      await setInput(DINNER);
      await driver.waitFor("document.getElementById('draft').textContent.startsWith('Draft saved on this device')");
      await driver.navigate(base);
      await driver.waitFor("document.getElementById('input').value.length > 0");
      assert.equal(await driver.execute("return document.getElementById('input').value"), DINNER);
    });

    it('copies only a report made from the text in the box', async (t) => {
      await open(t, 1280, 800);
      // Records what Copy writes instead of using the system clipboard. browser.test.js checks the real clipboard in Chrome.
      await driver.execute('window.copied = []; navigator.clipboard.writeText = async (text) => { copied.push(text); };');
      // A WebDriver click on a disabled button can leave Safari ignoring later clicks, even in the next run,
      // so the disabled button is clicked from the page. The browser ignores it there too.
      const clickDisabledCopy = "const copy = document.getElementById('copy'); copy.click(); return [copy.disabled, window.copied.length]";
      assert.deepEqual(await driver.execute(clickDisabledCopy), [true, 0]);
      await setInput(DINNER);
      assert.deepEqual(await driver.execute(clickDisabledCopy), [true, 0]);
      await driver.click('#calculate');
      await setInput(DINNER + 'Chloe 10 Chloe Anna\n');
      assert.deepEqual(await driver.execute(clickDisabledCopy), [true, 0]);
      await driver.click('#calculate');
      await driver.click('#copy');
      await driver.waitFor("document.getElementById('copy').textContent === 'Copied'");
      const copied = await driver.execute('return window.copied');
      assert.equal(copied.length, 1);
      assert.equal(copied[0], await driver.execute("return document.getElementById('report').textContent"));
      assert.match(copied[0], /Chloe paid 10\.00, split between Chloe, Anna/);  // the report from the changed text
    });

    it('does not download an out-of-date report, and asks for Calculate', async (t) => {
      await open(t, 1280, 800);
      await setInput(DINNER);
      await driver.click('#calculate');
      await setInput(DINNER + 'Chloe 10 Chloe Anna\n');
      await driver.click('#download');
      await driver.waitFor("document.getElementById('status').textContent.startsWith('Not downloaded: the report on screen is out of date')");
    });

    it('tells an open page when a newer version is published', async (t) => {
      await open(t, 1280, 800);
      await driver.execute("window.fetch = async () => ({ json: async () => ({ version: '9.0.0', breaking: true, summary: 'Names changed.' }) })");
      await driver.execute('checkForUpdate()');
      await driver.waitFor("!document.getElementById('update').hidden");
      assert.match(await driver.execute("return document.getElementById('update-text').textContent"), /^Balanzo 9\.0\.0 changes how things work: Names changed\./);
    });
  });
}
