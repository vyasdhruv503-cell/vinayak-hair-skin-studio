const form = document.querySelector('#offer-form');
const message = document.querySelector('#offer-message');
async function api(options) {
  const response = await fetch('/api/owner/offer', options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Please try again.');
  return data;
}
document.querySelector('#offer-manager').addEventListener('toggle', async event => {
  if (!event.target.open) return;
  try {
    let offer = null;
    try {
      const data = await api();
      offer = data.offer;
    } catch {
      offer = JSON.parse(localStorage.getItem('vinayak_owner_offer') || 'null');
    }
    for (const key of ['title','details','expires']) form.elements[key].value = offer?.[key] || '';
    form.elements.published.checked = !!offer?.published;
    message.textContent = '';
  } catch (error) { message.textContent = error.message; }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button'); button.disabled = true;
  try {
    const offer = Object.fromEntries(new FormData(form));
    offer.published = form.elements.published.checked;
    try {
      await api({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(offer)});
    } catch {
      localStorage.setItem('vinayak_owner_offer', JSON.stringify(offer));
    }
    message.textContent = offer.published ? 'Offer saved. It appears on the home page until its expiry date.' : 'Offer saved as unpublished.';
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
