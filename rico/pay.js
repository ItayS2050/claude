// Paid state. Lives in the service worker; everyone else asks it by message.
//
// Rico's Pro is a one-time purchase, not a subscription, and that single
// decision removes most of what this file would otherwise have to do. A
// subscription can lapse, so it has to be re-checked forever. A purchase
// cannot un-happen — so once the answer is yes, it is yes, and Rico stops
// asking the network anything at all. There is no expiry to track, no card to
// re-validate, no dunning state, and nothing that can take a paid user's
// features away while they are offline on a plane.
var Rico = globalThis.Rico || (globalThis.Rico = {});

Rico.pay = (() => {
  // Replace with the id from your ExtensionPay dashboard before shipping.
  // See README — "Wiring up payments".
  const EXTENSION_ID = 'rico-gmail-palette';

  const CACHE_KEY = 'pay';
  const DAY = 24 * 60 * 60 * 1000;

  let extpay = null;

  function lib() {
    if (extpay) return extpay;
    if (typeof ExtPay !== 'function') return null;
    extpay = ExtPay(EXTENSION_ID);
    return extpay;
  }

  const read = () => new Promise((resolve) => chrome.storage.local.get(CACHE_KEY, (r) => {
    void chrome.runtime.lastError;
    resolve((r && r[CACHE_KEY]) || { paid: false, checkedAt: 0 });
  }));

  const write = (state) => new Promise((resolve) => chrome.storage.local.set(
    { [CACHE_KEY]: state }, () => { void chrome.runtime.lastError; resolve(state); },
  ));

  /**
   * What we currently believe, with no network call in the path.
   *
   * Everything user-facing calls this one. It answers off chrome.storage.local
   * every time, which is the whole point: the palette must open in the time it
   * takes to draw it, and a payment server having a slow morning is not
   * allowed to be the reason someone's ⌘⇧K hangs.
   */
  async function status() {
    const state = await read();
    return { paid: !!state.paid, checkedAt: state.checkedAt || 0 };
  }

  /**
   * Ask ExtensionPay, if it is worth asking.
   *
   * Returns without touching the network when we already know the user paid,
   * or when we asked recently. Never throws — a failed check leaves the last
   * known state exactly as it was.
   */
  async function refresh({ force = false } = {}) {
    const state = await read();
    if (state.paid) return state;                                  // monotonic: nothing to learn
    if (!force && Date.now() - (state.checkedAt || 0) < DAY) return state;

    const api = lib();
    if (!api) return write({ ...state, checkedAt: Date.now() });

    try {
      const user = await api.getUser();
      return write({ paid: !!user.paid, checkedAt: Date.now() });
    } catch {
      // Offline, or ExtensionPay is down. Say nothing, change nothing, and
      // leave the user with whatever they had a moment ago.
      return state;
    }
  }

  async function openPaymentPage() {
    const api = lib();
    if (!api) return false;
    await api.openPaymentPage();
    return true;
  }

  /**
   * Start listening. Called once from the service worker's top level.
   *
   * `onPaid` is what makes the purchase feel instant: the user finishes paying
   * in a tab and the cache flips without waiting for the next daily check.
   */
  function start() {
    const api = lib();
    if (!api) return;
    api.startBackground();
    api.onPaid.addListener(() => write({ paid: true, checkedAt: Date.now() }));
  }

  return { EXTENSION_ID, status, refresh, openPaymentPage, start };
})();

if (typeof module !== 'undefined') module.exports = Rico.pay;
