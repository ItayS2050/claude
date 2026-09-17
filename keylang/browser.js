/**
 * A small Chromium harness: launch it, load Kiko into it, drive a page.
 *
 * Everything else in this folder tests Kiko against a DOM I wrote, and a DOM I
 * wrote agrees with me. Three bugs reached the user through that gap — a toast
 * that froze several keystrokes behind the field, twice, and a run of list
 * items offered as Hebrew — and none of them was visible to a stub, because
 * none of them was in the detection logic. They were in what the browser
 * actually did with it.
 *
 * No dependencies: Node has had a WebSocket client since 22, and CDP is a
 * JSON-RPC conversation over one socket.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CHROME = (() => {
  const roots = ['/opt/pw-browsers'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const p = path.join(root, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  return process.env.CHROME || null;
})();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── A page served over http, not file:// ──────────────────────
// A content script declared for <all_urls> does not run on file:// unless the
// user has ticked "Allow access to file URLs", which nobody has. Serving the
// fixtures over loopback is how the test meets Kiko on the terms a real site
// does.
function serve(pages) {
  const server = http.createServer((req, res) => {
    const body = pages[req.url] ?? pages['/'];
    res.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body ?? 'not found');
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── CDP ───────────────────────────────────────────────────────
class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(method + ' timed out'));
      }, 15000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 80));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(new Session(ws)));
    ws.addEventListener('error', () => reject(new Error('could not open ' + url)));
  });
}

const fetchJson = url => new Promise((resolve, reject) => {
  http.get(url, res => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

// ── Launching ─────────────────────────────────────────────────
async function launch({ extension, port = 0 }) {
  if (!CHROME) throw new Error('no Chromium found under /opt/pw-browsers, and $CHROME is unset');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kiko-chrome-'));
  // 0 asks the OS for a free port; Chromium writes the one it got to a file in
  // the profile, which is the only reliable way to learn it.
  const child = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--disable-features=Translate,OptimizationHints',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--disable-extensions-except=' + extension,
    '--load-extension=' + extension,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });

  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(portFile)) {
      const got = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10);
      if (got) return { child, profile, port: got, stderr: () => stderr };
    }
    if (child.exitCode !== null) throw new Error('Chromium exited: ' + stderr.slice(-400));
    await sleep(100);
  }
  child.kill('SIGKILL');
  throw new Error('Chromium never opened a debugging port: ' + stderr.slice(-400));
}

// Killing by pid, never by pattern: `pkill -f remote-debugging-port` matches
// the shell running this file and takes the test down with the browser.
function stop(browser) {
  try { browser.child.kill('SIGKILL'); } catch {}
  try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}

// Wait for something to become true in the page, rather than sleeping and
// hoping. Returns the value, or null if it never arrived.
async function until(session, expression, { timeout = 6000, step = 100 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await session.eval(expression).catch(() => null);
    if (v) return v;
    if (Date.now() > deadline) return null;
    await sleep(step);
  }
}

module.exports = { CHROME, launch, stop, serve, connect, fetchJson, until, sleep, Session };
