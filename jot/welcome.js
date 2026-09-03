// The one job this page has that the popup cannot do: hold the microphone
// permission prompt open long enough to answer it.
const grant = document.getElementById('grant');
const status = document.getElementById('status');

function say(text, kind) {
  status.textContent = text;
  status.className = `status show ${kind}`;
}

async function check() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    if (p.state === 'granted') {
      grant.disabled = true;
      grant.textContent = 'Microphone allowed';
      say('Dictation is ready. Open Jot and press the mic.', 'ok');
    } else if (p.state === 'denied') {
      say('Chrome is blocking the microphone for this extension. Open chrome://settings/content/microphone and remove the block, then reload this page.', 'bad');
    }
  } catch {
    // permissions.query without microphone support — the button still works.
  }
}

grant.addEventListener('click', async () => {
  grant.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // The permission is what we came for, not the audio. Release the device.
    stream.getTracks().forEach((t) => t.stop());
    grant.textContent = 'Microphone allowed';
    say('Dictation is ready. Open Jot and press the mic.', 'ok');
  } catch (err) {
    grant.disabled = false;
    if (err && err.name === 'NotAllowedError') {
      say('Permission was refused. Click the camera/microphone icon in the address bar to allow it, or check chrome://settings/content/microphone.', 'bad');
    } else if (err && err.name === 'NotFoundError') {
      say('No microphone found. You can still type tasks — everything else works.', 'bad');
    } else {
      say(`Could not open the microphone (${err && err.name ? err.name : 'unknown error'}).`, 'bad');
    }
  }
});

check();
if (location.hash === '#mic') {
  document.getElementById('mic-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
