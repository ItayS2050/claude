// Shown once, to people who installed Kiko before it cost anything.
// background.js opens this on update and records that it has done so, so the
// page itself only has to fill in the real numbers and get out of the way.

const CHECKOUT_URL = 'https://getkiko.lemonsqueezy.com/checkout/buy/fffb373a-427e-4832-970c-b9ec2119b6c5';

document.getElementById('sub-btn').href = CHECKOUT_URL;
document.getElementById('later-btn').addEventListener('click', () => window.close());

// Say how long they actually have, not the headline number. Someone who
// updates a fortnight late should not be told "60 days" and then find they
// had 46 — the trial runs from their install, not from this page.
(async () => {
  try {
    const { entitlement } = await chrome.storage.local.get('entitlement');
    if (!entitlement) return;

    const headline = document.getElementById('headline');
    const sub      = document.getElementById('sub');

    if (entitlement.state === 'licensed') {
      headline.textContent = 'You already subscribe — thank you';
      sub.textContent = 'Nothing here applies to you. Every language stays unlocked.';
      return;
    }
    if (entitlement.state === 'expired') {
      headline.textContent = 'Your free period has ended';
      sub.textContent = 'Detection is paused. Your learned words are safe and nothing was deleted.';
      return;
    }
    const d = entitlement.daysLeft;
    if (typeof d === 'number') {
      headline.textContent = d === 1
        ? 'One day left of your free period'
        : `${d} days left of your free period`;
    }
  } catch {}
})();
