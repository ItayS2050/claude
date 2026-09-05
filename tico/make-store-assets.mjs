// Regenerate the Chrome Web Store screenshots and promo tiles.
//
//   node make-store-assets.mjs        → store/*.png
//
// Dev-only; build.sh ships an explicit file list so nothing here reaches the
// package. The product shots are not mockups: each one loads the real
// extension, seeds real tasks through its own storage, and photographs the
// actual popup. The marketing frame is then built around that photograph. If
// the UI changes, these change with it — a screenshot that flatters a product
// it no longer resembles is the fastest way to earn a one-star review.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'store');
const PROFILE = '/tmp/tico-store-profile';

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const ICON = readFileSync(join(HERE, 'icon128.png')).toString('base64');

// Tasks chosen to show the whole idea in one glance: a client, both lanes, a
// repeat, an overdue item, and something with no date at all.
const SEED = [
  'finish campaigns for stream tomorrow at 10',
  'send the invoice to acme friday',
  'standup every monday at 9:30',
  'stream banner sizes',
  'call mom tonight',
  'dentist on thursday at 3',
  'buy milk',
];

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  channel: 'chromium',
  colorScheme: 'dark',
  deviceScaleFactor: 2,          // retina, so the store does not show mush
  viewport: { width: 384, height: 620 },
  args: [`--disable-extensions-except=${HERE}`, `--load-extension=${HERE}`],
});

const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForSelector('#input');

for (const line of SEED) {
  await popup.fill('#input', line);
  await popup.press('#input', 'Enter');
  await popup.waitForTimeout(90);
}
// Make one of them overdue so the red group is real rather than staged.
await sw.evaluate(async () => {
  const { tasks } = await chrome.storage.local.get('tasks');
  const t = tasks.find((x) => /dentist/i.test(x.text));
  if (t) { t.due = Date.now() - 40 * 60 * 1000; t.notified = true; }
  await chrome.storage.local.set({ tasks });
});
await popup.reload();
await popup.waitForSelector('.task');

/** Photograph the popup in whatever state `prepare` leaves it. */
async function shoot(name, prepare = async () => {}) {
  // Reload first: a state one shot sets up (the mic mid-dictation, an open
  // filter) otherwise leaks into the next one and gets photographed there.
  await popup.reload();
  await popup.waitForSelector('.task');
  await prepare(popup);
  await popup.waitForTimeout(220);
  // The popup sizes itself to its content; the viewport does not. Clip to the
  // body so the shot has no dead strip under the footer.
  const height = await popup.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  const buf = await popup.screenshot({ clip: { x: 0, y: 0, width: 384, height } });
  return { name, data: buf.toString('base64') };
}

const shots = {
  capture: await shoot('capture', async (p) => {
    await p.fill('#input', 'call mom tomorrow at 5');
    await p.waitForTimeout(150);
  }),
  list: await shoot('list', async (p) => { await p.fill('#input', ''); }),
  voice: await shoot('voice', async (p) => {
    await p.evaluate(() => {
      document.getElementById('mic').classList.add('on');
      document.getElementById('field').classList.add('listening');
      const input = document.getElementById('input');
      input.value = 'pick up the dry cleaning on friday';
      input.dispatchEvent(new Event('input'));
      document.getElementById('hint').textContent = 'Speak, then stop — it saves itself.';
    });
  }),
  clients: await shoot('clients', async (p) => {
    await p.evaluate(() => {
      const chip = [...document.querySelectorAll('.chip')].find((c) => /stream/i.test(c.textContent));
      chip?.click();
    });
  }),
  settings: await shoot('settings', async (p) => {
    await p.evaluate(() => {
      const chip = [...document.querySelectorAll('.chip')].find((c) => /Open/.test(c.textContent));
      chip?.click();
      document.getElementById('openSettings').click();
    });
  }),
};

// --- the marketing frame around each photograph --------------------------

const FRAME_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px; height: 800px;
    display: flex; align-items: center; gap: 64px;
    padding: 0 84px;
    background: #0d0f16;
    background-image:
      radial-gradient(1000px 620px at 88% 12%, rgba(124,131,255,.22), transparent 62%),
      radial-gradient(760px 520px at 6% 92%, rgba(56,189,248,.14), transparent 60%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #e7e9ef;
    overflow: hidden;
  }
  .copy { flex: 1; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 30px; }
  .brand img { width: 34px; height: 34px; border-radius: 9px; }
  .brand span { font-size: 17px; font-weight: 700; letter-spacing: -.01em; color: #b9bdd0; }
  h1 {
    font-size: 50px; line-height: 1.08; font-weight: 800;
    letter-spacing: -.028em; margin-bottom: 20px;
  }
  h1 em { font-style: normal; color: #9ba2ff; }
  p.sub { font-size: 21px; line-height: 1.5; color: #99a0b5; max-width: 480px; }
  ul { list-style: none; margin-top: 30px; display: grid; gap: 13px; }
  li { display: flex; gap: 12px; align-items: flex-start; font-size: 16.5px; color: #b9bdd0; }
  li b { color: #e7e9ef; font-weight: 600; }
  .tick {
    flex: none; width: 21px; height: 21px; border-radius: 6px; margin-top: 1px;
    background: rgba(124,131,255,.18); color: #9ba2ff;
    display: grid; place-items: center; font-size: 12px; font-weight: 700;
  }
  .shot { flex: none; display: flex; align-items: center; justify-content: center; }
  .shot img {
    width: 396px;
    border-radius: 15px;
    box-shadow: 0 40px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.09);
    display: block;
  }
`;

const frame = (shot, headline, sub, bullets) => `
<style>${FRAME_CSS}</style>
<div class="copy">
  <div class="brand"><img src="data:image/png;base64,${ICON}"><span>Tico</span></div>
  <h1>${headline}</h1>
  <p class="sub">${sub}</p>
  <ul>${bullets.map((b) => `<li><span class="tick">✓</span><span>${b}</span></li>`).join('')}</ul>
</div>
<div class="shot"><img src="data:image/png;base64,${shot.data}"></div>`;

const FRAMES = [
  ['shot1-capture', shots.capture,
    'Tell Tico.<br>Forget it.',
    'Hand over the thought and Tico reads the timing out of your own words — then brings it back at the right moment.',
    ['<b>“call mom tomorrow at 5”</b> → tomorrow, 17:00',
     'The date leaves the title. The task just reads “Call mom”',
     'See what it understood <b>before</b> you press Enter']],

  ['shot2-list', shots.list,
    'Sorted before<br>you get there.',
    'Overdue, today, tomorrow, this week — and work kept apart from the rest of your life.',
    ['Work and personal split <b>automatically</b>',
     'A dot on every task says where it went, and why',
     'One click moves it, and Tico remembers']],

  ['shot3-voice', shots.voice,
    'Or just <em>say it</em>.',
    'Press the mic, talk, stop. It transcribes, works out the date, and saves itself.',
    ['Dictation in English, Hebrew, Russian and Arabic',
     'Nothing is recorded — Chrome transcribes, Tico keeps the text',
     '<b>Alt + Shift + T</b> from any page']],

  ['shot4-clients', shots.clients,
    'It learns your<br>clients on its own.',
    '“finish campaigns <b>for stream</b>” is filed under Stream. No project picker, no setup.',
    ['Mention a name twice and it is recognised everywhere after that',
     'Every client gets its own filter',
     'Wrong one? Remove it in a click']],

  ['shot5-settings', shots.settings,
    'Yours, and<br>only yours.',
    'No account, no server, no analytics. A squirrel does not tell anyone where it buried things.',
    ['Export everything to a file whenever you like',
     'Snooze length and sound are yours to set',
     'Optional on-device AI — nothing is ever uploaded']],
];

const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

for (const [name, shot, headline, sub, bullets] of FRAMES) {
  await page.setContent(frame(shot, headline, sub, bullets));
  await page.waitForTimeout(160);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`store/${name}.png  1280×800`);
}

// --- promo tiles ---------------------------------------------------------

const tile = (w, h, titleSize, subSize, iconSize, sub) => `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${w}px; height: ${h}px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: ${Math.round(h * 0.045)}px;
    background: #0d0f16;
    background-image:
      radial-gradient(${w}px ${h}px at 78% 8%, rgba(124,131,255,.30), transparent 64%),
      radial-gradient(${w * 0.7}px ${h}px at 10% 100%, rgba(56,189,248,.16), transparent 62%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #fff; text-align: center; overflow: hidden;
  }
  img { width: ${iconSize}px; height: ${iconSize}px; border-radius: ${Math.round(iconSize * 0.24)}px;
        box-shadow: 0 12px 34px rgba(0,0,0,.5); }
  h1 { font-size: ${titleSize}px; font-weight: 800; letter-spacing: -.03em; }
  p { font-size: ${subSize}px; color: #a9b0c6; max-width: ${Math.round(w * 0.78)}px; line-height: 1.4; }
</style>
<img src="data:image/png;base64,${ICON}">
<h1>Tico</h1>
<p>${sub}</p>`;

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(tile(440, 280, 40, 15, 62, 'Tasks and reminders,<br>captured in one click'));
await page.waitForTimeout(140);
await page.screenshot({ path: join(OUT, 'promo-small-440x280.png') });
console.log('store/promo-small-440x280.png  440×280');

await page.setViewportSize({ width: 1400, height: 560 });
await page.setContent(tile(1400, 560, 92, 27, 128, 'Type it or say it. Tico works out when it is due,<br>and keeps work and life apart.'));
await page.waitForTimeout(140);
await page.screenshot({ path: join(OUT, 'promo-marquee-1400x560.png') });
console.log('store/promo-marquee-1400x560.png  1400×560');

await ctx.close();
