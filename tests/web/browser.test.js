// Browser tests for docs/. They drive an installed Chrome over the DevTools protocol, so no
// npm packages are needed. Skipped when Chrome isn't found (set CHROME_PATH to point at it).
// Run with: node --test tests/web/
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { serveDocs } = require('./support');

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => candidate && fs.existsSync(candidate));
const EDGE = [
  process.env.EDGE_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
].find((candidate) => fs.existsSync(candidate));
const DINNER = '# Dinner\nAnna 60 Anna Ben Chloe\nBen 30 Ben Chloe\n';
// [width, height, touch] for the screens people actually use: laptops, desktops, tablets, a landscape phone
const DESKTOP_SIZES = [[1440, 900, false], [1512, 982, false], [1280, 720, false], [1024, 768, true], [1180, 820, true], [768, 1024, true], [834, 1194, true], [844, 390, true]];
// [width, height] for phones in portrait
const PHONE_SIZES = [[390, 844], [375, 667], [412, 915], [320, 568]];
const DINNER_REPORT = [
  'Dinner', '',
  'PAYMENTS - who pays whom',
  'Chloe pays Anna 35.00', 'Ben pays Anna 5.00', '',
  'BALANCES - who gets or owes',
  'Anna gets 40.00', 'Ben owes 5.00', 'Chloe owes 35.00', '',
  '3 people, 2 payments, total 0.00', '',
  'HOW I READ IT',
  'Anna paid 60.00, split between Anna, Ben, Chloe',
  'Ben paid 30.00, split between Ben, Chloe',
].join('\n') + '\n';

function launchChrome(executable, profile) {
  const proc = spawn(executable, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let log = '';
    proc.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve({ proc, url: match[1] });
    });
    proc.on('exit', (code) => reject(new Error(`Chrome exited with code ${code}`)));
  });
}

// Minimal DevTools client: one WebSocket, requests matched by id, events passed to listeners
class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.calls = new Map();
    this.listeners = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('could not connect to Chrome'));
    });
    this.ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id && this.calls.has(msg.id)) {
        const { resolve, reject } = this.calls.get(msg.id);
        this.calls.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((listener) => listener(msg));
      }
    };
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.ws.close();
  }
}

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.errors = [];
    cdp.listeners.push((msg) => {
      if (msg.sessionId !== sessionId) return;
      const isError = msg.method === 'Runtime.exceptionThrown' ||
        (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error');
      if (isError) this.errors.push(JSON.stringify(msg.params).slice(0, 300));
    });
  }

  call(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async init(width, height, mobile) {
    await this.call('Runtime.enable');
    await this.call('Page.enable');
    await this.viewport(width, height, mobile);
  }

  viewport(width, height, mobile = false) {
    return this.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async eval(expression) {
    const { result, exceptionDetails } = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  }

  waitForEvent(method, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeout);
      this.cdp.listeners.push((msg) => {
        if (msg.method === method && msg.sessionId === this.sessionId) {
          clearTimeout(timer);
          resolve(msg.params);
        }
      });
    });
  }

  async goto(url) {
    const loaded = this.waitForEvent('Page.loadEventFired');
    await this.call('Page.navigate', { url });
    await loaded;
  }

  async waitFor(expression, timeout = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.eval(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`timed out waiting for: ${expression}`);
  }

  async rect(selector) {
    return this.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; })()`);
  }

  async click(selector) {
    const r = await this.rect(selector);
    const x = (r.left + r.right) / 2;
    const y = (r.top + r.bottom) / 2;
    await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  // Sends a key press to the focused element. text is what the key types, e.g. '\r' for Enter.
  async key(key, { ctrl = false, meta = false, text } = {}) {
    const modifiers = (ctrl ? 2 : 0) | (meta ? 4 : 0);
    const base = { key, code: key, modifiers };
    await this.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text });
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  // Sets the text the way typing does, so the page sees an input event
  async setInput(text) {
    await this.eval(`(() => {
      const input = document.getElementById('input');
      input.value = ${JSON.stringify(text)};
      input.dispatchEvent(new Event('input'));
    })()`);
  }

  async uploadFile(filePath) {
    const { root } = await this.call('DOM.getDocument', { depth: -1 });
    const { nodeId } = await this.call('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' });
    await this.call('DOM.setFileInputFiles', { nodeId, files: [filePath] });
  }

  // Simulates dragging a file (or plain text) over the page and dropping it
  async drop(name, content, type = 'text/plain') {
    await this.eval(`(() => {
      const dt = new DataTransfer();
      ${name === null ? `dt.setData('text/plain', ${JSON.stringify(content)});` : `dt.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));`}
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    })()`);
  }

  async dragEnter(name = 'dinner.txt') {
    await this.eval(`(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], ${JSON.stringify(name)}, { type: 'text/plain' }));
      document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    })()`);
  }
}

// The same suite runs in each Chromium browser that is installed
for (const [name, executable] of [['Chrome', CHROME], ['Microsoft Edge', EDGE]]) {
  describe(`docs/ in ${name}`, { skip: executable ? false : `${name} not found` }, () => {
    let server;
    let base;
    let origin;
    let chrome;
    let browser;
    let tmp;
    const pages = [];

    async function newPage(width = 1280, height = 800, mobile = false) {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const page = new Page(browser, sessionId);
      pages.push(page);
      await page.init(width, height, mobile);
      return page;
    }

    // A fresh page on the app, with downloads saved to a new folder
    async function openApp(width, height, mobile) {
      const page = await newPage(width, height, mobile);
      const downloads = fs.mkdtempSync(path.join(tmp, 'downloads-'));
      await page.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      // Cancel drafts that pages from earlier tests are still waiting to save, so they cannot come back
      for (const old of pages) await old.eval("typeof draftTimer !== 'undefined' && clearTimeout(draftTimer)").catch(() => {});
      await page.goto(base);
      await page.eval("localStorage.clear()");  // no draft left over from an earlier test
      await page.goto(base);
      return { page, downloads };
    }

    // Waits until count files have finished downloading into dir
    async function waitForDownload(dir, count = 1, timeout = 10000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const names = fs.readdirSync(dir);
        if (names.length >= count && names.every((name) => !name.endsWith('.crdownload'))) return names;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('no download finished');
    }

    before(async () => {
      server = await serveDocs();
      base = `http://127.0.0.1:${server.address().port}/`;
      origin = base.slice(0, -1);
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'balanzo-web-'));
      chrome = await launchChrome(executable, path.join(tmp, 'profile'));
      browser = new Cdp(chrome.url);
      // Old Edge (113) ignored --headless=new and showed a window plus a native file picker; stop before any test runs
      const { userAgent } = await browser.send('Browser.getVersion');
      if (!userAgent.includes('Headless')) throw new Error(`${name} opened a visible window instead of running headless; update it`);
      await browser.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    });

    after(async () => {
      browser?.close();
      if (chrome) {
        const exited = new Promise((resolve) => chrome.proc.once('exit', resolve));
        chrome.proc.kill();
        await exited;  // Chrome writes to the profile until it exits
      }
      server?.close();
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    });

    describe('page loading', () => {
      it('serves every file the page needs', async () => {
        for (const name of ['', 'index.html', 'balanzo.js', 'manifest.json', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png']) {
          const response = await fetch(base + name);
          assert.equal(response.status, 200, name);
        }
      });

      it('serves PNG and SVG icons with the right media type', async () => {
        assert.equal((await fetch(base + 'icon-192.png')).headers.get('content-type'), 'image/png');
        assert.equal((await fetch(base + 'icon.svg')).headers.get('content-type'), 'image/svg+xml');
      });

      it('answers a missing file with 404', async () => {
        assert.equal((await fetch(base + 'no-such-file.txt')).status, 404);
      });

      it('refuses to serve files outside docs/', async () => {
        assert.equal((await fetch(base + '..%2FREADME.md')).status, 404);
      });

      it('declares a valid manifest with 192 and 512 PNG icons', async () => {
        const manifest = await (await fetch(base + 'manifest.json')).json();
        const sizes = manifest.icons.filter((icon) => icon.type === 'image/png').map((icon) => icon.sizes);
        assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
        assert.equal(manifest.display, 'standalone');
      });

      it('loads with the right title and no script errors', async () => {
        const { page } = await openApp(1280, 800);
        assert.equal(await page.eval('document.title'), 'Balanzo');
        assert.deepEqual(page.errors, []);
      });

      it('registers a service worker that caches the app files', async () => {
        const { page } = await openApp(1280, 800);
        await page.waitFor(`navigator.serviceWorker.ready.then(() => true)`);
        await page.waitFor(`caches.keys().then(async (names) => (await caches.open(names[0])).keys()).then((keys) => keys.length >= 7)`);
      });
    });

    describe('layout', () => {
      it('shows input and report side by side on a desktop screen', async () => {
        const { page } = await openApp(1280, 800);
        const input = await page.rect('.input');
        const output = await page.rect('.output');
        assert.ok(output.left >= input.right, 'output should be to the right of the input');
        assert.ok(Math.abs(output.top - input.top) < 2, 'columns should start at the same height');
      });

      it('stacks input above the report on a phone screen', async () => {
        const { page } = await openApp(390, 844, true);
        const input = await page.rect('.input');
        const output = await page.rect('.output');
        assert.ok(output.top >= input.bottom, 'report should sit below the input');
      });

      it('never scrolls sideways, from a 320px phone up to a wide desktop', async () => {
        const { page } = await openApp(320, 640, true);
        for (const width of [320, 390, 500, 900, 1280, 1920]) {
          await page.viewport(width, 800, width < 900);
          const overflow = await page.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth');
          assert.ok(overflow <= 0, `${width}px wide scrolls sideways by ${overflow}px`);
        }
      });

      it('keeps the main content inside the page on desktop too', async () => {
        const { page } = await openApp(1920, 1080);
        const main = await page.eval("document.querySelector('main').getBoundingClientRect().width");
        assert.ok(main <= 1200, 'main content should stop at 1200px');
      });

      it('fills the window up to 1200px on desktop, whatever the content', async () => {
        for (const [width, expected] of [[900, 900], [1280, 1200]]) {
          const { page } = await openApp(width, 800);
          const main = await page.eval("document.querySelector('main').getBoundingClientRect().width");
          assert.equal(Math.round(main), expected, `main at ${width}px wide`);
        }
      });

      it('keeps the panel widths when How it works opens', async () => {
        for (const [width, mobile] of [[1280, false], [390, true]]) {
          const { page } = await openApp(width, 800, mobile);
          const widths = "[...document.querySelectorAll('#input, #report')].map((el) => Math.round(el.getBoundingClientRect().width)).join()";
          const closed = await page.eval(widths);
          await page.click('.guide summary');
          assert.equal(await page.eval("document.querySelector('.guide').open"), true);
          assert.equal(await page.eval(widths), closed, `panels at ${width}px wide`);
        }
      });

      it('keeps the button widths when Copy report changes to Copied', async () => {
        for (const [width, mobile] of [[1280, false], [390, true], [320, true]]) {
          const { page } = await openApp(width, 800, mobile);
          const widths = "[...document.querySelectorAll('.row button')].map((el) => Math.round(el.getBoundingClientRect().width)).join()";
          const before = await page.eval(widths);
          await page.eval("document.getElementById('copy').textContent = 'Copied'");
          assert.equal(await page.eval(widths), before, `buttons at ${width}px wide`);
        }
      });

      it('keeps the layout still when a draft note appears', async () => {
        const notes = ['Draft saved on this device at 22:10.', 'Draft restored from 22:10.', 'Draft not saved: this browser does not allow local storage here.'];
        for (const [width, mobile] of [[1280, false], [390, true], [320, true]]) {
          const { page } = await openApp(width, 800, mobile);
          const layout = "['#input', '#report', 'footer'].map((sel) => JSON.stringify(document.querySelector(sel).getBoundingClientRect())).join()";
          const before = await page.eval(layout);
          for (const note of notes) {
            await page.eval(`document.getElementById('draft').textContent = ${JSON.stringify(note)}`);
            assert.equal(await page.eval(layout), before, `"${note}" at ${width}px wide`);
          }
        }
      });

      it('keeps every button label on one line on a 320px phone', async () => {
        const { page } = await openApp(320, 640, true);
        const heights = await page.eval("[...document.querySelectorAll('.row button')].map((el) => Math.round(el.getBoundingClientRect().height))");
        assert.equal(new Set(heights).size, 1, `button heights differ: ${heights}`);
      });

      it('makes every button at least 44px tall on a phone', async () => {
        const { page } = await openApp(390, 844, true);
        const heights = await page.eval("[...document.querySelectorAll('button:not(#update-reload), label.button')].map((el) => el.getBoundingClientRect().height)");
        assert.equal(heights.length, 4, 'Copy, Calculate, Download and Load .txt or .md');
        heights.forEach((height) => assert.ok(height >= 44, `button only ${height}px tall`));
      });

      it('uses a 16px input font on phones, so iOS does not zoom in', async () => {
        const { page } = await openApp(390, 844, true);
        assert.equal(await page.eval("parseFloat(getComputedStyle(document.getElementById('input')).fontSize)"), 16);
      });

      it('gives the input and report boxes the same height and font on desktop and phone', async () => {
        for (const [width, mobile] of [[1280, false], [390, true]]) {
          const { page } = await openApp(width, 800, mobile);
          const [input, report] = await page.eval("[...document.querySelectorAll('#input, #report')].map((el) => ({ height: el.getBoundingClientRect().height, font: getComputedStyle(el).fontSize }))");
          assert.equal(report.height, input.height, `boxes should be the same height at ${width}px`);
          assert.equal(report.font, input.font, `boxes should use the same font size at ${width}px`);
        }
      });

      it('starts the boxes at the same height and lines up their button rows on desktop', async () => {
        const { page } = await openApp(1280, 800);
        const [input, report] = await page.eval("['#input', '#report'].map((sel) => document.querySelector(sel).getBoundingClientRect().top)");
        assert.equal(report, input, 'boxes should start at the same height');
        const [inputRow, outputRow] = await page.eval("['.input .row', '.output .row'].map((sel) => document.querySelector(sel).getBoundingClientRect().top)");
        assert.equal(outputRow, inputRow, 'button rows should line up side by side');
      });

      it('keeps the report box the same height and scrolls it when the report is longer', async () => {
        const { page } = await openApp(1280, 800);
        const before = (await page.rect('#report')).height;
        await page.setInput(Array.from({ length: 80 }, (_, i) => `p${i} 10 p${i} p${i + 1}`).join('\n'));
        await page.click('#calculate');
        assert.equal((await page.rect('#report')).height, before, 'the box should not grow with the report');
        assert.ok(await page.eval("document.getElementById('report').scrollHeight > document.getElementById('report').clientHeight"), 'the report should scroll inside its box');
      });

      it('fits the whole page in the window on laptops, tablets and desktops, so nothing scrolls', async () => {
        for (const [width, height, mobile] of DESKTOP_SIZES) {
          const { page } = await openApp(width, height, mobile);
          const scroll = await page.eval('document.documentElement.scrollHeight - innerHeight');
          assert.ok(scroll <= 0, `${width}x${height} scrolls by ${scroll}px`);
        }
      });

      it('keeps Calculate on screen without scrolling on every phone', async () => {
        for (const [width, height] of PHONE_SIZES) {
          const { page } = await openApp(width, height, true);
          const bottom = await page.eval("document.querySelector('#calculate').getBoundingClientRect().bottom");
          assert.ok(bottom <= height, `Calculate ends at ${bottom}px on a ${width}x${height} phone`);
        }
      });

      it('follows the dark system setting with the dark colours', async () => {
        const { page } = await openApp(1280, 800);
        await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
        assert.equal(await page.eval("getComputedStyle(document.body).backgroundColor"), 'rgb(22, 24, 29)');
        await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
        assert.equal(await page.eval("getComputedStyle(document.body).backgroundColor"), 'rgb(246, 247, 249)');
        assert.deepEqual(page.errors, []);
      });

      it('shows the placeholder text before anything is calculated', async () => {
        const { page } = await openApp(1280, 800);
        assert.equal(await page.eval("document.getElementById('report').textContent"), 'The report appears here.');
        assert.equal(await page.eval("document.getElementById('report').classList.contains('placeholder')"), true);
      });
    });

    describe('input', () => {
      it('calculates the pasted text when Calculate is clicked', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
      });

      it('calculates on Ctrl+Enter', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.eval("document.getElementById('input').focus()");
        await page.key('Enter', { ctrl: true });
        assert.match(await page.eval("document.getElementById('report').textContent"), /3 people, 2 payments/);
      });

      it('calculates on Cmd+Enter', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.eval("document.getElementById('input').focus()");
        await page.key('Enter', { meta: true });
        assert.match(await page.eval("document.getElementById('report').textContent"), /3 people, 2 payments/);
      });

      it('adds a new line on plain Enter and does not calculate', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 60 ana ben');
        await page.eval("document.getElementById('input').focus()");
        await page.eval("document.getElementById('input').setSelectionRange(14, 14)");
        await page.key('Enter', { text: '\r' });
        assert.equal(await page.eval("document.getElementById('input').value"), 'ana 60 ana ben\n');
        assert.equal(await page.eval("document.getElementById('report').classList.contains('placeholder')"), true);
      });

      it('handles empty input without an error', async () => {
        const { page } = await openApp(1280, 800);
        await page.click('#calculate');
        assert.match(await page.eval("document.getElementById('report').textContent"), /Nothing to calculate yet/);
        assert.deepEqual(page.errors, []);
      });

      it('shows how to write an expense instead of an empty report when no line is valid', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('just some notes\nsixty is not an amount ana\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /Invalid amount: some in line: just some notes/);
        assert.match(report, /Nothing to calculate yet/);
        assert.match(report, /Anna 60 Anna Ben Chloe/);
        assert.doesNotMatch(report, /SUMMARY|BALANCES|TOTAL|PAYMENTS/);
      });

      it('keeps the full report when every expense settles to zero', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 10 ana\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /1 person, 0 payments, total 0\.00/);
        assert.match(report, /Everyone is settled\./);
        assert.doesNotMatch(report, /Nothing to calculate yet/);
      });

      it('dims the report and asks for Calculate when the text changes after it was calculated', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        assert.equal(await page.eval("document.getElementById('status').textContent"), 'Report updated.');
        await page.setInput(DINNER + 'dan 9 dan\n');
        assert.equal(await page.eval("document.getElementById('report').classList.contains('stale')"), true);
        assert.match(await page.eval("document.getElementById('status').textContent"), /Press Calculate/);
      });

      it('says no report was made, instead of "Report updated.", when a name has * in it', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 10 ana*\n');
        await page.click('#calculate');
        assert.match(await page.eval("document.getElementById('status').textContent"), /^No report yet\. Fix the line named under WARNINGS/);
      });

      it('updates the report, flashes it and clears the stale state on Calculate', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.setInput(DINNER + 'dan 9 dan\n');
        await page.click('#calculate');
        assert.equal(await page.eval("document.getElementById('report').classList.contains('stale')"), false);
        assert.equal(await page.eval("document.getElementById('report').classList.contains('updated')"), true);
        assert.equal(await page.eval("document.getElementById('status').textContent"), 'Report updated.');
        assert.match(await page.eval("document.getElementById('report').textContent"), /dan is settled/);
      });

      it('clears the stale state when the text is changed back to the calculated text', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.setInput(DINNER + 'x');
        await page.setInput(DINNER);
        assert.equal(await page.eval("document.getElementById('report').classList.contains('stale')"), false);
      });

      it('reports invalid lines and still calculates the valid ones', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana sixty ana\nAnna 60 Anna Ben Chloe\nBen 30 Ben Chloe\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /Invalid amount: sixty/);
        assert.match(report, /3 people, 2 payments/);
      });

      it('loads a .txt chosen with the file picker and calculates it', async () => {
        const { page } = await openApp(1280, 800);
        const file = path.join(tmp, 'dinner.txt');
        fs.writeFileSync(file, DINNER);
        await page.uploadFile(file);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
        assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
      });

      it('loads the same file again after it was already loaded', async () => {
        const { page } = await openApp(1280, 800);
        const file = path.join(tmp, 'again.txt');
        fs.writeFileSync(file, DINNER);
        await page.uploadFile(file);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
        await page.setInput('changed by hand');
        await page.uploadFile(file);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
      });

      it('loads a .md chosen with the file picker and calculates it', async () => {
        const { page } = await openApp(1280, 800);
        const file = path.join(tmp, 'dinner.md');
        fs.writeFileSync(file, DINNER);
        await page.uploadFile(file);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
        assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
      });

      it('rejects a non-.txt, non-.md file chosen with the picker and leaves the input alone', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 1 ana');
        const file = path.join(tmp, 'notes.pdf');
        fs.writeFileSync(file, '%PDF-1.4');
        await page.uploadFile(file);
        await page.waitFor("document.getElementById('status').textContent.startsWith('Not a .txt or .md file: notes.pdf')");
        assert.equal(await page.eval("document.getElementById('input').value"), 'ana 1 ana');
      });

      it('loads a dropped .txt file and calculates it', async () => {
        const { page } = await openApp(1280, 800);
        await page.drop('dinner.txt', DINNER);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
        assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
      });

      it('loads a dropped .md file and calculates it', async () => {
        const { page } = await openApp(1280, 800);
        await page.drop('dinner.md', DINNER);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
        assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
      });

      it('rejects a dropped file that is neither .txt nor .md', async () => {
        const { page } = await openApp(1280, 800);
        await page.drop('photo.png', 'binary-ish', 'image/png');
        await page.waitFor("document.getElementById('status').textContent.startsWith('Not a .txt or .md file: photo.png')");
        assert.equal(await page.eval("document.getElementById('input').value"), '');
      });

      it('keeps the report, and copies it, after a dropped file that is neither .txt nor .md', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.drop('photo.png', 'binary-ish', 'image/png');
        await page.waitFor("document.getElementById('status').textContent.startsWith('Not a .txt or .md file: photo.png')");
        assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
        await page.click('#copy');
        await page.waitFor("document.getElementById('copy').textContent === 'Copied'");
        assert.equal(await page.eval('navigator.clipboard.readText()'), DINNER_REPORT);
      });

      it('ignores dropped text that is not a file', async () => {
        const { page } = await openApp(1280, 800);
        await page.drop(null, 'ana 1 ana');
        await page.eval('new Promise((resolve) => setTimeout(resolve, 200))');
        assert.equal(await page.eval("document.getElementById('input').value"), '');
      });

      it('shows the drop overlay while a file is dragged over the page and hides it after', async () => {
        const { page } = await openApp(1280, 800);
        await page.dragEnter();
        assert.equal(await page.eval("document.body.classList.contains('dragging')"), true);
        await page.drop('dinner.txt', DINNER);
        assert.equal(await page.eval("document.body.classList.contains('dragging')"), false);
      });

      it('does not show the drop overlay for dragged text', async () => {
        const { page } = await openApp(1280, 800);
        await page.eval(`(() => {
          const dt = new DataTransfer();
          dt.setData('text/plain', 'ana 1 ana');
          document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
        })()`);
        assert.equal(await page.eval("document.body.classList.contains('dragging')"), false);
      });

      it('does not show the report HTML from input as markup', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('# <img src=x onerror="window.__pwned=1">\nana 1 ana');
        await page.click('#calculate');
        assert.equal(await page.eval("document.getElementById('report').querySelector('img') === null"), true);
        assert.equal(await page.eval('window.__pwned === undefined'), true);
      });
    });

    describe('updates', () => {
      it('shows no notice when the open page is the latest version', async () => {
        const { page } = await openApp(1280, 800);
        assert.equal(await page.eval("document.getElementById('update').hidden"), true);
        assert.equal(await page.eval('checkForUpdate()'), false);
      });

      it('tells an open page about a newer version', async () => {
        const { page } = await openApp(1280, 800);
        await page.eval("window.fetch = async () => ({ json: async () => ({ version: '5.1.0', breaking: false, summary: '' }) })");
        assert.equal(await page.eval('checkForUpdate()'), true);
        assert.equal(await page.eval("document.getElementById('update').hidden"), false);
        assert.equal(await page.eval("document.getElementById('update-text').textContent"), 'Balanzo 5.1.0 is ready. Reload to get the latest version.');
      });

      it('says what changed when the newer version is breaking', async () => {
        const { page } = await openApp(1280, 800);
        await page.eval("window.fetch = async () => ({ json: async () => ({ version: '6.0.0', breaking: true, summary: 'Names changed.' }) })");
        await page.eval('checkForUpdate()');
        assert.equal(await page.eval("document.getElementById('update-text').textContent"), 'Balanzo 6.0.0 changes how things work: Names changed. Reload before you calculate.');
      });

      it('ignores an older version, such as a copy from the offline cache', async () => {
        const { page } = await openApp(1280, 800);
        await page.eval("window.fetch = async () => ({ json: async () => ({ version: '4.0.0', breaking: true, summary: 'Old.' }) })");
        assert.equal(await page.eval('checkForUpdate()'), false);
        assert.equal(await page.eval("document.getElementById('update').hidden"), true);
      });
    });

      describe('draft', () => {
      const DAY = 24 * 60 * 60 * 1000;

      it('saves the text in the box on this device and restores it on the next visit', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.waitFor("document.getElementById('draft').textContent.startsWith('Draft saved on this device at ')");
        await page.goto(base);
        assert.equal(await page.eval("document.getElementById('input').value"), DINNER);
        assert.match(await page.eval("document.getElementById('report').textContent"), /PAYMENTS/);
        assert.match(await page.eval("document.getElementById('draft').textContent"), /^Draft restored from \d\d:\d\d\.$/);
      });

      it('saves a dropped file as the draft', async () => {
        const { page } = await openApp(1280, 800);
        await page.drop('dinner.txt', DINNER);
        await page.waitFor("localStorage.getItem('balanzo-draft') !== null");
        await page.goto(base);
        assert.equal(await page.eval("document.getElementById('input').value"), DINNER);
      });

      it('forgets the draft when the box is emptied', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.waitFor("localStorage.getItem('balanzo-draft') !== null");
        await page.setInput('  \n');
        await page.waitFor("localStorage.getItem('balanzo-draft') === null");
        assert.equal(await page.eval("document.getElementById('draft').textContent"), '');
      });

      it('keeps a draft for 30 days and drops one older than that', async () => {
        const { page } = await openApp(1280, 800);
        await page.eval(`localStorage.setItem('balanzo-draft', JSON.stringify({ text: ${JSON.stringify(DINNER)}, savedAt: Date.now() - 29 * ${DAY} }))`);
        await page.goto(base);
        assert.equal(await page.eval("document.getElementById('input').value"), DINNER, 'a 29-day-old draft is restored');

        await page.eval(`localStorage.setItem('balanzo-draft', JSON.stringify({ text: ${JSON.stringify(DINNER)}, savedAt: Date.now() - 31 * ${DAY} }))`);
        await page.goto(base);
        assert.equal(await page.eval("document.getElementById('input').value"), '', 'a 31-day-old draft is not restored');
        assert.equal(await page.eval("localStorage.getItem('balanzo-draft')"), null, 'and it is removed');
      });

      it('still works, and says so, when the browser does not allow local storage', async () => {
        const { page } = await openApp(1280, 800);
        await page.eval("Storage.prototype.setItem = () => { throw new Error('blocked'); }");
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.waitFor("document.getElementById('draft').textContent.startsWith('Draft not saved')");
        assert.match(await page.eval("document.getElementById('report').textContent"), /PAYMENTS/);
      });
    });

    describe('buttons', () => {
      it('opens the file picker from the Load button with the keyboard', async () => {
        const { page } = await openApp(1280, 800);
        assert.equal(await page.eval("document.getElementById('load').tagName"), 'BUTTON');
        await page.eval("document.getElementById('file').addEventListener('click', () => { window.pickerOpened = true; })");
        await page.eval("document.getElementById('load').focus()");
        await page.key('Enter', { text: '\r' });
        assert.equal(await page.eval("window.pickerOpened === true"), true);
      });

      it('copies the report and shows Copied on the button', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.click('#copy');
        await page.waitFor("document.getElementById('copy').textContent === 'Copied'");
        assert.equal(await page.eval('navigator.clipboard.readText()'), DINNER_REPORT);
      });

      it('selects the report text when copying is not allowed', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.eval("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'))");
        await page.click('#copy');
        await page.waitFor("window.getSelection().toString().length > 0");
        // The browser's selection text can drop the final newline, so compare without trailing space
        assert.equal((await page.eval('window.getSelection().toString()')).trimEnd(), DINNER_REPORT.trimEnd());
        assert.equal(await page.eval("document.getElementById('copy').textContent"), 'Copy report');
      });

      // Clicks Copy, waits long enough for a copy to finish, and returns what the clipboard holds
      async function clickCopy(page) {
        await page.click('#report');  // the clipboard only works in a focused page, and a fresh page has no focus yet
        await page.eval("navigator.clipboard.writeText('clipboard before')");
        await page.click('#copy');
        await page.eval('new Promise((resolve) => setTimeout(resolve, 200))');
        return page.eval('navigator.clipboard.readText()');
      }

      it('keeps Copy report and Download disabled until Calculate is clicked', async () => {
        const { page, downloads } = await openApp(1280, 800);
        const disabled = "[document.getElementById('copy').disabled, document.getElementById('download').disabled]";
        assert.deepEqual(await page.eval(disabled), [true, true]);
        assert.equal(await clickCopy(page), 'clipboard before');
        await page.setInput(DINNER);
        assert.deepEqual(await page.eval(disabled), [true, true]);
        assert.equal(await clickCopy(page), 'clipboard before');
        await page.click('#download');
        await page.eval('new Promise((resolve) => setTimeout(resolve, 500))');
        assert.deepEqual(fs.readdirSync(downloads), []);
        assert.equal(await page.eval("document.getElementById('copy').textContent"), 'Copy report');
        await page.click('#calculate');
        assert.deepEqual(await page.eval(disabled), [false, false]);
        assert.equal(await clickCopy(page), DINNER_REPORT);
      });

      it('disables Copy report and Download again when the text is cleared after Calculate', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.setInput('');
        assert.deepEqual(await page.eval("[document.getElementById('copy').disabled, document.getElementById('download').disabled]"), [true, true]);
        assert.equal(await clickCopy(page), 'clipboard before');
      });

      it('disables Copy report while the report is out of date, and copies the new one after Calculate', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 1 ana');
        await page.click('#calculate');
        await page.setInput(DINNER);
        assert.equal(await page.eval("document.getElementById('copy').disabled"), true);
        assert.equal(await clickCopy(page), 'clipboard before');
        await page.setInput('ana 1 ana');  // back to the calculated text: the report matches again
        assert.equal(await page.eval("document.getElementById('copy').disabled"), false);
        await page.setInput(DINNER);
        await page.click('#calculate');
        assert.equal(await clickCopy(page), DINNER_REPORT);
      });

      it('downloads the report, then the expenses, as a .txt file', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.click('#download');
        const [name] = await waitForDownload(downloads);
        assert.match(name, /^Dinner-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
        assert.equal(fs.readFileSync(path.join(downloads, name), 'utf8'), DINNER_REPORT + '\nEXPENSES - the expenses behind this report\n' + DINNER);
      });

      it('asks for Calculate instead of downloading a report that is out of date', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.setInput(DINNER + 'Chloe 10 Chloe Anna\n');
        await page.click('#download');
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.deepEqual(fs.readdirSync(downloads), []);
        assert.match(await page.eval("document.getElementById('status').textContent"), /^Not downloaded: the report on screen is out of date/);
        assert.equal(await page.eval("document.getElementById('calculate').classList.contains('nudge')"), true);
      });

      it('downloads the new text once Calculate has been pressed again', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.setInput(DINNER + 'Chloe 10 Chloe Anna\n');
        await page.click('#calculate');
        await page.click('#download');
        const [name] = await waitForDownload(downloads);
        assert.match(fs.readFileSync(path.join(downloads, name), 'utf8'), /\nEXPENSES - the expenses behind this report\n# Dinner\nAnna 60 Anna Ben Chloe\nBen 30 Ben Chloe\nChloe 10 Chloe Anna\n$/);
      });

      it('does not download a report that stopped with an error', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput('ana 10 ana*\n');
        await page.click('#calculate');
        await page.click('#download');
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.deepEqual(fs.readdirSync(downloads), []);
        assert.match(await page.eval("document.getElementById('status').textContent"), /^Not downloaded: there is no report yet/);
      });

      it('downloads an untitled file under the expenses name', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput('ana 1 ana ben');
        await page.click('#calculate');
        await page.click('#download');
        const [name] = await waitForDownload(downloads);
        assert.match(name, /^expenses-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
      });

      it('downloads a loaded .md file as a .md file', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.drop('dinner.md', DINNER);
        await page.waitFor("document.getElementById('input').value.startsWith('# Dinner')");
        await page.click('#download');
        const [name] = await waitForDownload(downloads);
        assert.match(name, /^Dinner-\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
      });
    });

    describe('output text', () => {
      it('counts names that differ only in upper and lower case as one person', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 60 ana Ben\nAna 30 ben\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /ana gets 60\.00/);
        assert.match(report, /Note: 'Ana' is counted as 'ana'/);
      });

      it('prints each currency in its own section, headed with the currency', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('# Trip\n@EUR\nnik 50 nik eva\nana 30 ana eva\n@\nbob 40 bob cy\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /PAYMENTS \(EUR\)/);
        assert.match(report, /3 people, 2 payments, total 0\.00 EUR/);
        assert.match(report, /PAYMENTS \(NO CURRENCY\)/);
        assert.match(report, /2 people, 1 payment, total 0\.00\n/);
        assert.doesNotMatch(report, /-----/);
      });

      it('prints an error and no report for a name with * in it', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('# Oops\nana 5 ana *bo\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /Error: '\*' and '~' are not allowed in names/);
        assert.doesNotMatch(report, /PAYMENTS/);
      });

      it('prints warnings for underscores and for # right after a name', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 10 ana ben_\nmia#2 5 mia ana\nben 10 ben ana\n');
        await page.click('#calculate');
        const report = await page.eval("document.getElementById('report').textContent");
        assert.match(report, /Warning: '_' in a name/);
        assert.match(report, /Warning: '#' right after a name/);
      });

      it('prints "Everyone is settled" when balances already match', async () => {
        const { page } = await openApp(1280, 800);
        await page.setInput('ana 10 ana ben\nben 10 ben ana\n');
        await page.click('#calculate');
        assert.match(await page.eval("document.getElementById('report').textContent"), /Everyone is settled\./);
      });
    });

    describe('output file', () => {
      // Same-minute collisions are left to the browser: it adds (1) in a normal download folder.
      // Headless Chrome with a fixed download path overwrites, so this test only checks minutes apart.
      it('names downloads from different minutes differently and saves both', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput(DINNER);
        await page.click('#calculate');
        await page.eval('window.__RealDate = Date; window.__now = new Date(2026, 10, 14, 21, 30).getTime();' +
          'window.Date = class extends __RealDate { constructor(...args) { super(...(args.length ? args : [window.__now])); } };');
        await page.click('#download');
        await page.eval('window.__now += 60000');
        await page.click('#download');
        const names = await waitForDownload(downloads, 2);
        assert.deepEqual(names.sort(), ['Dinner-2026-11-14-2130.txt', 'Dinner-2026-11-14-2131.txt']);
      });

      it('drops characters that are not allowed in file names from the title', async () => {
        const { page, downloads } = await openApp(1280, 800);
        await page.setInput('# Trip / Sat: 1*?\nana 1 ana\n');
        await page.click('#calculate');
        await page.click('#download');
        const [name] = await waitForDownload(downloads);
        assert.match(name, /^Trip-Sat-1-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
      });
    });

    describe('non-functional', () => {
      it('calculates 18 people with many expenses in under 3 seconds', async () => {
        const { page } = await openApp(1280, 800);
        const elapsed = await page.eval(`(() => {
          let seed = 7;
          const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          const people = Array.from({ length: 18 }, (_, i) => 'p' + i);
          const lines = [];
          for (let i = 0; i < 80; i++) {
            const related = people.filter(() => rand() < 0.4);
            if (related.length) lines.push(people[Math.floor(rand() * 18)] + ' ' + (Math.floor(rand() * 40000) / 4) + ' ' + related.join(' '));
          }
          const started = performance.now();
          Balanzo.run(lines.join('\\n'));
          return performance.now() - started;
        })()`);
        assert.ok(elapsed < 3000, `took ${elapsed.toFixed(0)}ms`);
      });

      it('labels the input and announces new reports and status messages to screen readers', async () => {
        const { page } = await openApp(1280, 800);
        assert.equal(await page.eval("document.getElementById('input').getAttribute('aria-label')"), 'Expenses');
        assert.equal(await page.eval("document.getElementById('report').getAttribute('aria-live')"), 'polite');
        assert.equal(await page.eval("document.getElementById('status').getAttribute('role')"), 'status');
      });

      it('still opens and calculates with no network, after one visit', async () => {
        const { page } = await openApp(1280, 800);
        await page.waitFor('navigator.serviceWorker.ready.then(() => true)');
        await page.goto(base);  // this visit is controlled by the service worker
        await page.waitFor('navigator.serviceWorker.controller !== null');
        await page.call('Network.enable');
        await page.call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        try {
          await page.goto(base);
          await page.setInput(DINNER);
          await page.click('#calculate');
          assert.equal(await page.eval("document.getElementById('report').textContent"), DINNER_REPORT);
        } finally {
          await page.call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        }
      });
    });  });
}
