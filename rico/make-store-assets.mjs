// Regenerate the Chrome Web Store screenshots and promo tiles.
//
//   node make-store-assets.mjs        → store/*.png
//
// Dev-only; build.sh ships an explicit file list so nothing here reaches the
// package. The palette, the popup, the token prompt and the suggestion card in
// these shots are the real thing: Chromium runs with the real extension loaded,
// and every screenshot photographs whatever the extension actually drew.
//
// One honest caveat, because it is the sort of thing that turns into a lie if
// it goes unwritten. Gmail cannot be signed into from a build script, so the
// page around the compose window is a fixture — gmail-fixture.html, served in
// place of mail.google.com by a request intercept. The URL is real, so the
// content script injects for real and its selectors run against a DOM shaped
// like Gmail's. What is reconstructed is Gmail's own chrome: the sidebar, the
// thread, the colours. If a shot is ever used to claim something about Gmail
// rather than about Rico, that is the line it crossed.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'store');
const PROFILE = '/tmp/rico-store-profile';

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const ICON = readFileSync(join(HERE, 'icon128.png')).toString('base64');
const FIXTURE = readFileSync(join(HERE, 'gmail-fixture.html'), 'utf8');

// Snippets chosen to look like a real working set rather than a demo: a couple
// with variables, a couple without, and enough of them that the search box is
// obviously doing something.
const SNIPPETS = [
  ['Pricing + next steps', 'Hi {FirstName},\n\nHappy to put numbers to this. For a team the size of {Company} we would be looking at the Growth tier, which covers everything we walked through yesterday.\n\nI have attached the one-pager. If it looks workable I can get you a formal quote the same day.\n\nBest,'],
  ['Follow up', 'Hi {FirstName},\n\nJust following up on my last note — did you get a chance to look?\n\nHappy to jump on a quick call if that is easier.\n\nThanks,'],
  ['Intro call booked', 'Hi {FirstName},\n\nBooked — you should have the invite. I have kept it to 20 minutes.\n\nIf anything comes up, the link in the invite reschedules it without going through me.\n\nSpeak then,'],
  ['Not a fit right now', 'Hi {FirstName},\n\nThanks for reaching out. This is not something we are looking at this quarter, but I have kept your details for when we are.\n\nAll the best,'],
  ['Refund policy', 'Hi {FirstName},\n\nOur refund window is 30 days from purchase, no questions asked. If you are inside that, reply here and I will process it today.\n\nThanks,'],
  ['Chase an unpaid invoice', 'Hi {FirstName},\n\nInvoice {Invoice} is still showing as outstanding — it was due last Friday.\n\nIf it has already gone out, ignore me. If not, the payment link in the original email still works.\n\nThanks,'],
  ['Onboarding steps', 'Hi {FirstName},\n\nThree things to get you started:\n\n1. Accept the workspace invite\n2. Connect your calendar\n3. Add anyone else who needs access\n\nShout if you get stuck on any of them.\n\n'],
  ['Reschedule', 'Hi {FirstName},\n\nSomething has come up and I need to move our call. Does the same time later in the week work?\n\nApologies for the shuffle,'],
];

// Mentions pricing on purpose: the shot's headline promises a tag filled in
// already, and suggestTag only fires on words it is sure about. A paragraph
// that misses every rule would put an empty Tag field under that claim.
const REPEATED = 'Happy to put pricing to this. For a team your size we would be looking at the Growth tier, which covers everything we walked through on the call yesterday and the onboarding support alongside it.';

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  channel: 'chromium',
  deviceScaleFactor: 2,          // retina, so the store does not show mush
  // 1280x700 is chosen against the frame, not the browser: a 1280x800 store
  // image has room for about 600px of photograph once the headline has had its
  // share, and a taller capture simply gets its bottom cropped off — which is
  // where the suggestion card lives. 700 also keeps the palette (70vh) under
  // its own scroll threshold at four results.
  viewport: { width: 1280, height: 700 },
  args: [`--disable-extensions-except=${HERE}`, `--load-extension=${HERE}`],
});

const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

// Seed the snippets through the extension's own storage, so what the palette
// searches is what the popup would have written.
await sw.evaluate(async (rows) => {
  const now = Date.now();
  const items = {};
  rows.forEach(([title, body], i) => {
    const id = `seed${i}`;
    items[`snip:${id}`] = {
      id, title, body, folder: '', createdAt: now - i * 6e6,
      updatedAt: now - i * 6e6, usedAt: 0, uses: 0,
    };
  });
  await chrome.storage.sync.set(items);
  await chrome.storage.sync.set({ settings: { shortcut: 'Mod+Shift+K', onboarded: true,
    seeded: true, sortBy: 'recent', suggest: true } });
}, SNIPPETS);

// --- the Gmail page ------------------------------------------------------

const gmail = await ctx.newPage();
await gmail.route('https://mail.google.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE }));
await gmail.goto('https://mail.google.com/mail/u/0/#inbox');
await gmail.waitForSelector('div[g_editable="true"]');
await gmail.waitForTimeout(700);            // the content script's first load()

const composeBody = 'div[g_editable="true"]';

/** Put the caret in the compose box, after any text already typed. */
async function focusCompose(text = '') {
  await gmail.evaluate(([sel, t]) => {
    const el = document.querySelector(sel);
    el.innerHTML = '';
    if (t) el.appendChild(document.createTextNode(t));
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, [composeBody, text]);
}

/**
 * Escape out of whatever view the palette is in, and make sure.
 *
 * Once out of a token prompt, once out of the list, with a beat between —
 * the list hands focus back to its search box on a timer, and a second Escape
 * sent before that lands on nothing. The check matters because the palette
 * covers the whole page: one left open silently swallows every click the rest
 * of this script tries to make.
 */
async function closePalette() {
  for (let i = 0; i < 3; i++) {
    if (!await gmail.$('div[data-rico="palette"]')) return;
    await gmail.keyboard.press('Escape');
    await gmail.waitForTimeout(280);
  }
  await gmail.evaluate(() =>
    document.querySelectorAll('div[data-rico="palette"]').forEach((n) => n.remove()));
}

const shootPage = async (page, name, clip) => {
  const buf = await page.screenshot(clip ? { clip } : {});
  return { name, data: buf.toString('base64') };
};

// 1. The palette, mid-search. "fo" rather than something that resolves to a
//    single hit: it leaves four results on screen, with "Follow up" above "Not
//    a fit right now" even though both contain an f and an o — so the shot
//    shows the ranking working, not just a filter emptying a list.
await focusCompose('Hi John,');
await gmail.keyboard.press('Control+Shift+KeyK');
await gmail.waitForTimeout(260);
await gmail.keyboard.type('fo', { delay: 60 });
await gmail.waitForTimeout(340);
const shotPalette = await shootPage(gmail, 'palette');
await closePalette();

// 2. The token prompt. Searched separately because the snippet that carries a
//    second variable is the pricing one, and {Company} is the point being made.
await focusCompose('Hi John,');
await gmail.keyboard.press('Control+Shift+KeyK');
await gmail.waitForTimeout(260);
await gmail.keyboard.type('pri', { delay: 60 });
await gmail.waitForTimeout(300);
await gmail.keyboard.press('Enter');
await gmail.waitForTimeout(360);
const shotTokens = await shootPage(gmail, 'tokens');
await closePalette();


// 3. The suggestion card. Sent once records the paragraph; sent twice offers it.
for (let pass = 0; pass < 2; pass++) {
  await focusCompose(REPEATED);
  await gmail.click('[data-tooltip^="Send"]');
  await gmail.waitForTimeout(1400);
}
// 'attached', not the default 'visible': the shadow host is a 0x0 div — its
// only child is position:fixed inside the shadow root — so a visibility check
// reports hidden even while the card is plainly on screen.
await gmail.waitForSelector('div[data-rico="suggest"]', { state: 'attached', timeout: 9000 });
await gmail.waitForTimeout(400);
await focusCompose(REPEATED);
const shotSuggest = await shootPage(gmail, 'suggest');

// --- the popup -----------------------------------------------------------

const popup = await ctx.newPage();
await popup.setViewportSize({ width: 740, height: 552 });
// Dark, like every frame it will sit inside. The Gmail capture stays light,
// because Gmail is light — a dark Gmail would be a claim about Gmail.
await popup.emulateMedia({ colorScheme: 'dark' });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForSelector('.item');
await popup.waitForTimeout(300);
await popup.click('.item:nth-child(2)');
await popup.waitForTimeout(250);
const shotPopup = await shootPage(popup, 'popup', { x: 0, y: 0, width: 740, height: 552 });

// 5. The price, in a picture. It is the objection people have before they
//    install, so it does not get to live only in the description.
await popup.click('#upgradeBtn');
await popup.waitForTimeout(320);
const shotPrice = await shootPage(popup, 'price', { x: 0, y: 0, width: 740, height: 552 });

// --- the marketing frames ------------------------------------------------

const FRAME_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px; height: 800px; overflow: hidden;
    background: #0d0f16;
    background-image:
      radial-gradient(1000px 620px at 88% 10%, rgba(124,131,255,.24), transparent 62%),
      radial-gradient(760px 520px at 4% 94%, rgba(255,184,59,.10), transparent 60%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #e7e9ef;
  }
  .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 16px; }
  .brand img { width: 34px; height: 34px; border-radius: 9px; }
  .brand span { font-size: 17px; font-weight: 700; letter-spacing: -.01em; color: #b9bdd0; }
  h1 { font-size: 46px; line-height: 1.08; font-weight: 800; letter-spacing: -.028em; }
  h1 em { font-style: normal; color: #9ba2ff; }
  p.sub { font-size: 20px; line-height: 1.5; color: #99a0b5; margin-top: 16px; }
  kbd {
    background: rgba(124,131,255,.18); color: #b6bbff; border-radius: 6px;
    padding: 2px 9px; font: inherit; font-size: .92em; font-weight: 700;
  }
  ul { list-style: none; margin-top: 26px; display: grid; gap: 12px; }
  li { display: flex; gap: 12px; align-items: flex-start; font-size: 16.5px; color: #b9bdd0; }
  li b { color: #e7e9ef; font-weight: 600; }
  .tick { flex: none; width: 21px; height: 21px; border-radius: 6px; margin-top: 1px;
          background: rgba(124,131,255,.18); color: #9ba2ff;
          display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  img.shot { display: block; border-radius: 13px;
             box-shadow: 0 40px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.09); }

  /* wide: headline above, one big landscape photograph below.

     A flex column with a fixed height, rather than a picked image width. The
     header takes what it needs and the photograph gets the rest — so a
     headline that wraps to a third line shrinks the shot instead of pushing
     its bottom off the canvas, which is how the suggestion card (bottom right
     of the capture) went missing twice. */
  .wide { display: flex; flex-direction: column; height: 800px; padding: 34px 60px 0; }
  .wide .head { display: flex; align-items: flex-end; gap: 40px; margin-bottom: 20px; flex: none; }
  .wide .head .t { flex: 1; }
  .wide h1 { font-size: 38px; }
  .wide p.sub { font-size: 17px; margin-top: 9px; max-width: 640px; }
  .wide .pills { display: grid; gap: 8px; flex: none; width: 330px; padding-bottom: 2px; }
  .wide .pills li { font-size: 14.5px; }
  .wide .shotwrap { flex: 1; min-height: 0; display: flex; justify-content: center; }
  .wide img.shot { height: 100%; width: auto; max-width: 100%;
                   object-fit: contain; object-position: top center; }

  /* side: copy left, portrait photograph right */
  .side { display: flex; align-items: center; gap: 60px; padding: 0 76px; height: 800px; }
  .side .copy { flex: 1; min-width: 0; }
  .side img.shot { width: 620px; flex: none; }
`;

const bullets = (items) =>
  `<ul>${items.map((b) => `<li><span class="tick">✓</span><span>${b}</span></li>`).join('')}</ul>`;

const wide = (shot, headline, sub, items) => `
<style>${FRAME_CSS}</style>
<div class="wide">
  <div class="brand"><img src="data:image/png;base64,${ICON}"><span>Rico</span></div>
  <div class="head">
    <div class="t"><h1>${headline}</h1><p class="sub">${sub}</p></div>
    <div class="pills">${bullets(items)}</div>
  </div>
  <div class="shotwrap"><img class="shot" src="data:image/png;base64,${shot.data}"></div>
</div>`;

const side = (shot, headline, sub, items) => `
<style>${FRAME_CSS}</style>
<div class="side">
  <div class="copy">
    <div class="brand"><img src="data:image/png;base64,${ICON}"><span>Rico</span></div>
    <h1>${headline}</h1><p class="sub">${sub}</p>${bullets(items)}
  </div>
  <img class="shot" src="data:image/png;base64,${shot.data}">
</div>`;

const FRAMES = [
  ['shot1-palette', wide(shotPalette,
    'Your templates,<br>one keystroke away.',
    'Press <kbd>⌘⇧K</kbd> in any Gmail compose, type a few letters, hit Enter. The snippet lands where your cursor was.',
    ['Searches titles <b>and</b> the text inside',
     'Arrow keys and Enter — no mouse',
     'About two seconds, start to finish'])],

  ['shot2-tokens', wide(shotTokens,
    'Fills in the name.<br>Asks about the rest.',
    '<b>{FirstName}</b> comes from whoever is in the To: field. Anything else you invent gets a one-line prompt before it inserts.',
    ['No half-finished “Hi {FirstName}” going out',
     'Any <b>{Token}</b> you like — {Company}, {Invoice}',
     'Enter to insert, Esc to back out'])],

  ['shot3-suggest', wide(shotSuggest,
    'It notices what you<br>keep retyping.',
    'Write the same paragraph twice and Rico offers to keep it — with a title and a tag already filled in.',
    ['Fires <b>after</b> the send, never during',
     'Stores a one-way hash, never your text',
     '“Never” means never, for that one'])],

  ['shot4-popup', side(shotPopup,
    'A real drawer,<br>not a menu.',
    'Write, edit and organise snippets in one place. Import the templates you already have as a single paste.',
    ['Search across everything you have saved',
     'Import and export as JSON',
     'Synced by Chrome — no account, no server'])],

  ['shot5-price', side(shotPrice,
    'Pay once.<br>Not every month.',
    '<b>$24</b>, one time. No subscription, no renewal, no card kept on file with us.',
    ['<b>Free forever:</b> 10 snippets, full palette',
     '<b>Pro:</b> unlimited, auto {FirstName}, folders',
     'The limit is on <b>creating</b> — never on using'])],
];

const framer = await ctx.newPage();
await framer.setViewportSize({ width: 1280, height: 800 });
for (const [name, html] of FRAMES) {
  await framer.setContent(html);
  await framer.waitForTimeout(180);
  await framer.screenshot({ path: join(OUT, `${name}.png`),
    clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`store/${name}.png`);
}

// --- promo tiles ---------------------------------------------------------

const PROMO_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    display: flex; align-items: center; overflow: hidden;
    background: #0d0f16;
    background-image: radial-gradient(700px 480px at 82% 8%, rgba(124,131,255,.28), transparent 64%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #e7e9ef;
  }
  img.icon { border-radius: 22%; flex: none; }
  h1 { font-weight: 800; letter-spacing: -.03em; line-height: 1.05; }
  p { color: #99a0b5; }
  kbd { background: rgba(124,131,255,.2); color: #b6bbff; border-radius: 6px;
        padding: 2px 8px; font: inherit; font-weight: 700; }
`;

const PROMOS = [
  ['promo-small-440x280', 440, 280, `
    <style>${PROMO_CSS}
      body { width:440px; height:280px; flex-direction:column; justify-content:center;
             text-align:center; gap:14px; padding:0 30px; }
      img.icon { width:74px; height:74px; }
      h1 { font-size:31px; } p { font-size:14.5px; line-height:1.45; }
    </style>
    <img class="icon" src="data:image/png;base64,${ICON}">
    <h1>Rico</h1>
    <p>Gmail templates on <kbd>⌘⇧K</kbd>.<br>Search, Enter, done.</p>`],

  ['promo-marquee-1400x560', 1400, 560, `
    <style>${PROMO_CSS}
      body { width:1400px; height:560px; gap:58px; padding:0 96px; }
      img.icon { width:190px; height:190px; }
      h1 { font-size:74px; } p { font-size:27px; line-height:1.45; margin-top:20px; }
    </style>
    <img class="icon" src="data:image/png;base64,${ICON}">
    <div>
      <h1>Your Gmail templates,<br>one keystroke away.</h1>
      <p>Press <kbd>⌘⇧K</kbd>, type a few letters, press Enter.<br>
         Ten free. $24 once for unlimited — not a subscription.</p>
    </div>`],
];

for (const [name, w, h, html] of PROMOS) {
  await framer.setViewportSize({ width: w, height: h });
  await framer.setContent(html);
  await framer.waitForTimeout(150);
  await framer.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  console.log(`store/${name}.png`);
}

// The raw photographs too — useful when a frame needs rebuilding without
// re-running the whole capture.
for (const shot of [shotPalette, shotTokens, shotSuggest, shotPopup, shotPrice]) {
  writeFileSync(join(OUT, `raw-${shot.name}.png`), Buffer.from(shot.data, 'base64'));
}

await ctx.close();
console.log('done');
