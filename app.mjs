const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt;
const card = document.createElement('aside');
card.className = 'app-install-card';
card.setAttribute('aria-label', 'Install the Vinayak app');
card.innerHTML = '<img src="/app-icon-192.png" alt=""><div><strong>Your salon, one tap away.</strong><p>Add VINAYAK to your home screen for easy bookings.</p><button type="button" hidden>Install app</button><a href="/install.html">How to install ↗</a></div>';
card.hidden = installed();
const anchor = document.querySelector('footer');
if (anchor) anchor.before(card); else (document.querySelector('main') || document.body).append(card);
const button = card.querySelector('button');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event;
  card.hidden = installed(); button.hidden = installed();
});
button.addEventListener('click', async () => {
  if (!installPrompt) return;
  button.disabled = true;
  try {
    await installPrompt.prompt();
    await installPrompt.userChoice;
  } finally { installPrompt = null; button.hidden = true; button.disabled = false; }
});
window.addEventListener('appinstalled', () => { card.hidden = true; installPrompt = null; });
const network = document.createElement('div');
network.className = 'app-network-status'; network.setAttribute('role', 'status');
network.textContent = 'You are offline. Reconnect to view availability and confirm appointments.';
document.body.append(network);
const updateNetwork = () => { network.hidden = navigator.onLine; };
updateNetwork(); window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork);
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).catch(() => {}));
}
