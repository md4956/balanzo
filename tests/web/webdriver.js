'use strict';

// A small W3C WebDriver client, enough to drive Safari (safaridriver) and Firefox (geckodriver).
// Plain HTTP and JSON, so no npm packages are needed.
const { spawn } = require('node:child_process');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class WebDriver {
  // Starts the driver on its own port and opens one session with the given capabilities
  static async start({ command, args, port, capabilities }) {
    const proc = spawn(command, args, { stdio: 'ignore' });
    const driver = new WebDriver(`http://127.0.0.1:${port}`, proc);
    for (let tries = 0; ; tries++) {
      if (proc.exitCode !== null) throw new Error(`${command} exited with code ${proc.exitCode}`);
      if (await driver.ready()) break;
      if (tries > 100) {
        proc.kill();
        throw new Error(`${command} did not start on port ${port}`);
      }
      await sleep(100);
    }
    const { sessionId } = await driver.request('POST', '/session', { capabilities: { alwaysMatch: capabilities } });
    driver.session = `/session/${sessionId}`;
    return driver;
  }

  constructor(url, proc) {
    this.url = url;
    this.proc = proc;
    this.session = null;
  }

  async ready() {
    try {
      await fetch(`${this.url}/status`);
      return true;
    } catch {
      return false;
    }
  }

  async request(method, route, body) {
    const response = await fetch(this.url + route, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const { value } = await response.json();
    if (!response.ok) throw new Error(`${value.error}: ${value.message}`);
    return value;
  }

  navigate(url) {
    return this.request('POST', `${this.session}/url`, { url });
  }

  // Runs a script in the page and returns its value. args are available in the script as arguments.
  execute(script, args = []) {
    return this.request('POST', `${this.session}/execute/sync`, { script, args });
  }

  async click(selector) {
    const element = await this.request('POST', `${this.session}/element`, { using: 'css selector', value: selector });
    await this.request('POST', `${this.session}/element/${Object.values(element)[0]}/click`, {});
  }

  setWindowSize(width, height) {
    return this.request('POST', `${this.session}/window/rect`, { width, height });
  }

  // Waits until the script returns a true value
  async waitFor(script, timeout = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.execute(`return !!(${script});`)) return;
      await sleep(50);
    }
    throw new Error(`timed out waiting for: ${script}`);
  }

  async quit() {
    await this.request('DELETE', this.session).catch(() => {});
    this.proc.kill();
  }
}

module.exports = { WebDriver };
