// Offscreen document — plays the detection alert sound.
// AudioContext works here without autoplay restrictions.

let _ctx = null;

function getCtx() {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'kiko-play-sound') return;
  try {
    const ctx = getCtx();
    const t   = ctx.currentTime;

    function note(freq, start, dur, vol) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t + start + dur);
    }

    note(880, 0,    0.22, 0.22);
    note(660, 0.14, 0.38, 0.18);
  } catch {}
});
