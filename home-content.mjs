try {
  let offer = null;
  try {
    const response = await fetch('/api/offer');
    if (response.ok) {
      const data = await response.json();
      offer = data.offer;
    }
  } catch {}
  if (!offer) {
    const local = JSON.parse(localStorage.getItem('vinayak_owner_offer') || 'null');
    if (local && local.published) offer = local;
  }
  if (offer) {
    document.querySelector('#offer-title').textContent = offer.title;
    document.querySelector('#offer-details').textContent = offer.details;
    const expiry = document.querySelector('#offer-expiry');
    if (offer.expires) {
      expiry.textContent = 'Valid through ' + new Date(offer.expires + 'T00:00:00+05:30').toLocaleDateString('en-IN', {timeZone:'Asia/Kolkata',day:'numeric',month:'long',year:'numeric'});
      expiry.hidden = false;
    }
  } else {
    document.querySelector('#offer-details').textContent = 'Check back for the studio’s latest offers.';
  }
} catch {
  document.querySelector('#offer-details').textContent = 'Check back for the studio’s latest offers.';
}
