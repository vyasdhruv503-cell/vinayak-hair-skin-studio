const grid = document.querySelector('#home-salon-photos');
if (grid) {
  try {
    const response = await fetch('/api/gallery');
    if (!response.ok) throw new Error('Gallery unavailable');
    const photos = await response.json();
    if (!Array.isArray(photos)) throw new Error('Invalid gallery');
    if (photos.length) {
      const cards = photos.slice(0, 3).map(photo => {
        const figure = document.createElement('figure');
        const link = document.createElement('a');
        link.href = '/gallery.html';
        link.setAttribute('aria-label', 'View salon gallery: ' + photo.title);
        const image = document.createElement('img');
        image.src = photo.url;
        image.alt = photo.title;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.width = 640;
        image.height = 480;
        link.append(image);
        const caption = document.createElement('figcaption');
        caption.textContent = photo.title;
        figure.append(link, caption);
        return figure;
      });
      grid.replaceChildren(...cards);
    }
  } catch {
    grid.querySelector('p').textContent = 'Our salon photos will be available here soon. You can also visit the gallery.';
  }
}
