try {
  const response = await fetch('/api/offer');
  if (!response.ok) throw new Error('Offer unavailable');
  const {offer} = await response.json();
  if (offer) {
    document.querySelector('#offer-title').textContent = offer.title;
    document.querySelector('#offer-details').textContent = offer.details;
    const expiry = document.querySelector('#offer-expiry');
    expiry.textContent = 'Valid through ' + new Date(offer.expires + 'T00:00:00+05:30').toLocaleDateString('en-IN', {timeZone:'Asia/Kolkata',day:'numeric',month:'long',year:'numeric'});
    expiry.hidden = false;
  }
} catch {
  document.querySelector('#offer-details').textContent = 'Check back for the studio’s latest offers.';
}
