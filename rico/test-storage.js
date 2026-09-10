// node test-storage.js — the free-tier gate and the quota fallback. Both are
// places where getting it wrong loses somebody's snippets or somebody's money.

// A chrome.storage stand-in. Small, but it has to reproduce the two things
// that matter: callbacks that report failure through runtime.lastError rather
// than throwing, and a sync area that can be made to run out of room.
function fakeChrome() {
  const areas = { sync: new Map(), local: new Map() };
  const runtime = { lastError: undefined };
  let syncFull = false;

  const area = (name) => ({
    get(keys, cb) {
      const store = areas[name];
      let out = {};
      if (keys === null || keys === undefined) out = Object.fromEntries(store);
      else for (const k of [].concat(keys)) if (store.has(k)) out[k] = store.get(k);
      runtime.lastError = undefined;
      cb(JSON.parse(JSON.stringify(out)));
    },
    set(items, cb) {
      if (name === 'sync' && syncFull) {
        runtime.lastError = { message: 'QUOTA_BYTES_PER_ITEM quota exceeded' };
        cb();
        runtime.lastError = undefined;
        return;
      }
      for (const [k, v] of Object.entries(items)) areas[name].set(k, v);
      runtime.lastError = undefined;
      cb();
    },
    remove(keys, cb) {
      for (const k of [].concat(keys)) areas[name].delete(k);
      runtime.lastError = undefined;
      cb();
    },
  });

  return {
    api: { storage: { sync: area('sync'), local: area('local') }, runtime },
    areas,
    fillSync: (yes) => { syncFull = yes; },
  };
}

let chromeFake = fakeChrome();
globalThis.chrome = chromeFake.api;

const storage = require('./storage.js');

let failed = 0;
const ok = (label, cond) => {
  if (cond) console.log(`ok    ${label}`);
  else { failed++; console.log(`FAIL  ${label}`); }
};
const is = (label, actual, expected) => ok(`${label} -> ${JSON.stringify(actual)}`, actual === expected);

const reset = () => {
  chromeFake = fakeChrome();
  globalThis.chrome = chromeFake.api;
};

const fill = async (n, paid = true) => {
  for (let i = 0; i < n; i++) await storage.put({ title: `S${i}`, body: `body ${i}` }, { paid });
};

(async () => {
  // ------------------------------------------------------------ the gate
  reset();
  await fill(storage.FREE_LIMIT, false);
  is('a free user can reach the limit', await storage.count(), storage.FREE_LIMIT);

  let refused = null;
  try { await storage.put({ title: 'one too many', body: '' }, { paid: false }); }
  catch (err) { refused = err; }
  ok('the eleventh is refused', refused !== null);
  is('and says why', refused && refused.code, 'FREE_LIMIT');
  is('and nothing was written', await storage.count(), storage.FREE_LIMIT);

  // The gate is on creating, never on using or editing. Someone who stops
  // paying — or who was over the line before the limit existed — must not
  // find their own writing locked away.
  const existing = (await storage.all())[0];
  const edited = await storage.put({ ...existing, title: 'edited while free' }, { paid: false });
  is('an existing snippet stays editable at the limit', edited.title, 'edited while free');
  is('editing does not add one', await storage.count(), storage.FREE_LIMIT);

  const paid = await storage.put({ title: 'eleventh', body: '' }, { paid: true });
  ok('paying lifts the limit', !!paid.id);
  is('and the snippet is there', await storage.count(), storage.FREE_LIMIT + 1);

  await storage.remove(paid.id);
  is('deleting makes room again', await storage.count(), storage.FREE_LIMIT);

  // --------------------------------------------------------- the fallback
  reset();
  await storage.put({ title: 'in sync', body: 'carried between machines' }, { paid: true });
  is('a snippet goes to sync first', chromeFake.areas.sync.size, 1);
  is('and not to local', chromeFake.areas.local.size, 0);

  chromeFake.fillSync(true);
  const overflow = await storage.put({ title: 'overflow', body: 'sync was full' }, { paid: true });
  ok('a full sync does not throw', !!overflow.id);
  is('the snippet lands in local instead', chromeFake.areas.local.has(`snip:${overflow.id}`), true);
  is('both are still readable', (await storage.all()).length, 2);

  const titles = (await storage.all()).map((s) => s.title).sort();
  is('and both are intact', titles.join(','), 'in sync,overflow');

  // A record written to local while sync was full, then written again once
  // sync has room, must not end up in both places disagreeing.
  chromeFake.fillSync(false);
  await storage.put({ ...overflow, title: 'moved home' }, { paid: true });
  is('the local copy is cleared once sync takes it',
    chromeFake.areas.local.has(`snip:${overflow.id}`), false);
  is('no duplicate is left behind', (await storage.all()).length, 2);

  // ---------------------------------------------------------- the details
  reset();
  const one = await storage.put({ title: '  Padded  ', body: 'x' }, { paid: true });
  is('titles are trimmed', one.title, 'Padded');
  ok('created and updated timestamps are set', one.createdAt > 0 && one.updatedAt > 0);

  const again = await storage.put({ ...one, title: 'Changed' }, { paid: true });
  is('an edit keeps the id', again.id, one.id);
  is('and keeps the creation date', again.createdAt, one.createdAt);

  await storage.touch(one.id);
  const touched = await storage.get(one.id);
  is('use is counted', touched.uses, 1);

  // --------------------------------------------------------- the settings
  reset();
  const defaults = await storage.settings();
  is('the default shortcut is the one with no conflicts', defaults.shortcut, 'Mod+Shift+K');
  ok('and it is not Cmd+K', defaults.shortcut !== 'Mod+K');

  await storage.saveSettings({ shortcut: 'Mod+K' });
  is('a chosen shortcut is kept', (await storage.settings()).shortcut, 'Mod+K');
  is('and other settings survive the write', (await storage.settings()).sortBy, 'recent');

  // ------------------------------------------------------------- the seed
  reset();
  await storage.seedOnce();
  is('first run leaves a working palette', (await storage.all()).length, storage.SEEDS.length);

  await storage.seedOnce();
  is('and running again adds nothing', (await storage.all()).length, storage.SEEDS.length);

  reset();
  await storage.put({ title: 'mine', body: '' }, { paid: true });
  await storage.seedOnce();
  is('seeding never touches an existing collection', (await storage.all()).length, 1);

  console.log(failed ? `\n${failed} failing` : '\nall passing');
  process.exit(failed ? 1 : 0);
})();
