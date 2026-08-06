#!/usr/bin/env node
/**
 * Integration harness. Runs test-editors.html in headless Chromium with the
 * real content.js and reports, per editor shape, whether Kiko detected the
 * wrong-layout text and whether the fix actually landed.
 *
 * These are DOM *shapes*, not the real apps. A page carrying Quill's
 * .ql-editor class is not a live Quill instance with its own model, and a
 * framework editor can revert a programmatic write after we make it. Passing
 * here means the selector matches and the write path works on that structure —
 * it does not prove any particular website works. Only using the site does.
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const page = path.join(__dirname, 'test-editors.html');

const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=140000', '--dump-dom', 'file://' + page,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = dom.match(/<pre id="results">([\s\S]*?)<\/pre>/);
if (!m) { console.error('harness produced no results'); process.exit(1); }
const out = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
console.log(out);
const failed = /NO TOAST|FIX FAILED|no fix button/.test(out);
console.log(failed ? '\nsome editor shapes failed\n' : '\nall editor shapes ok\n');
process.exit(failed ? 1 : 0);
