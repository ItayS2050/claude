// Optional: Chrome's on-device model, when the machine can run it.
//
// Chrome 148+ ships Gemini Nano behind `LanguageModel`, usable from an
// extension with no API key, no network call and no per-user cost. That makes
// it attractive — but it needs roughly 22GB of free storage and 16GB of RAM,
// and it is absent on Android, iOS and older Chrome. So it can never be the
// mechanism, only a bonus on top of one: clients.js finds the name for
// everybody, and this is asked only about the sentences that defeated it.
//
// Everything it returns is treated as untrusted. A model asked for a client
// name will occasionally invent one, so an answer that does not literally
// appear in the user's own text is thrown away.

const TIMEOUT_MS = 4000;

const SYSTEM = `You extract structured fields from a single short to-do item.
Return the client, company, project or person the task is FOR, exactly as it is
spelled in the input. If the task names no such thing, return null. Never invent
a name. Also say whether the task is work or personal, or null if unclear.`;

const SCHEMA = {
  type: 'object',
  properties: {
    client: { type: ['string', 'null'] },
    lane: { type: ['string', 'null'], enum: ['work', 'personal', null] },
  },
  required: ['client', 'lane'],
};

/** 'unavailable' | 'downloadable' | 'downloading' | 'available' */
export async function aiStatus() {
  try {
    if (typeof LanguageModel === 'undefined') return 'unavailable';
    return await LanguageModel.availability();
  } catch {
    return 'unavailable';
  }
}

let session = null;

async function getSession() {
  if (session) return session;
  if ((await aiStatus()) !== 'available') return null;
  session = await LanguageModel.create({
    initialPrompts: [{ role: 'system', content: SYSTEM }],
  });
  return session;
}

export function closeAi() {
  try { session?.destroy(); } catch { /* already gone */ }
  session = null;
}

/**
 * @returns {{client: string|null, lane: string|null}} — always safe to use, and
 *   `{client: null, lane: null}` whenever the model is missing, slow or wrong.
 */
export async function aiExtract(text) {
  const empty = { client: null, lane: null };
  const input = String(text || '').trim();
  if (!input) return empty;

  let s;
  try { s = await getSession(); } catch { return empty; }
  if (!s) return empty;

  let raw;
  try {
    raw = await Promise.race([
      s.prompt(input, { responseConstraint: SCHEMA }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), TIMEOUT_MS)),
    ]);
  } catch {
    closeAi();     // a wedged session stays wedged; drop it and fall back
    return empty;
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return empty; }

  // The guard that matters: a name the user never typed is a hallucination,
  // not an extraction.
  let client = typeof parsed?.client === 'string' ? parsed.client.trim() : null;
  if (client) {
    const appears = input.toLowerCase().includes(client.toLowerCase());
    if (!appears || client.length < 2 || client.length > 40) client = null;
  }

  const lane = parsed?.lane === 'work' || parsed?.lane === 'personal' ? parsed.lane : null;
  return { client: client || null, lane };
}
