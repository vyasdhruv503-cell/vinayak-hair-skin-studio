const FALLBACK_CLIENT_ID = '135458455222-fkf08bo9c6p2ba1m0532ghrboe2d3gct.apps.googleusercontent.com';

function parseGoogleJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

async function resolveClientId() {
  try {
    const response = await fetch('/api/customer/google-config');
    if (response.ok) {
      const data = await response.json();
      if (data && 'clientId' in data) return data.clientId;
    }
  } catch {
    // API not reachable (e.g. Netlify static hosting)
  }
  return FALLBACK_CLIENT_ID;
}

const profileArea = document.querySelector('#google-signin');
const profileMessage = document.querySelector('#google-login-message');
const bookingArea = document.querySelector('#booking-google-signin');

window.handleGoogleCredentialResponse = async function (result) {
  if (profileMessage) profileMessage.textContent = 'Signing in with Google…';
  try {
    let signedInSuccessfully = false;
    try {
      const signedIn = await fetch('/api/customer/google-login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({credential: result.credential})
      });
      if (signedIn.ok) {
        signedInSuccessfully = true;
      } else if (signedIn.status !== 404) {
        const data = await signedIn.json().catch(() => ({}));
        throw Error(data.error || 'Google sign-in failed.');
      }
    } catch (err) {
      if (err.message && err.message.includes('Google sign-in failed')) throw err;
    }

    if (!signedInSuccessfully) {
      const payload = parseGoogleJwt(result.credential);
      if (payload && payload.sub) {
        const customer = {
          id: payload.sub,
          username: 'g' + payload.sub.slice(0, 10),
          name: payload.name || 'Google customer',
          email: payload.email || '',
          phone: '',
          provider: 'google',
          created: new Date().toISOString()
        };
        localStorage.setItem('vinayak_customer', JSON.stringify(customer));
        try {
          const all = JSON.parse(localStorage.getItem('vinayak_all_customers') || '[]');
          const idx = all.findIndex(c => c.id === customer.id || (customer.email && c.email === customer.email));
          if (idx >= 0) all[idx] = {...all[idx], ...customer};
          else all.unshift(customer);
          localStorage.setItem('vinayak_all_customers', JSON.stringify(all));
        } catch {}
        signedInSuccessfully = true;
      }
    }

    if (signedInSuccessfully) {
      location.reload();
    } else {
      throw Error('Google sign-in could not be completed.');
    }
  } catch (error) {
    if (profileMessage) profileMessage.textContent = error.message;
  }
};

if (profileArea || bookingArea) {
  try {
    const clientId = await resolveClientId();
    if (clientId) {
      const ensureScript = () => {
        if (!window.google?.accounts?.id) {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = initGsi;
          document.head.append(script);
        } else {
          initGsi();
        }
      };

      const initGsi = () => {
        if (!window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: window.handleGoogleCredentialResponse
        });

        if (profileArea) {
          profileArea.hidden = false;
          const buttonEl = document.querySelector('#google-button');
          if (buttonEl && !buttonEl.hasChildNodes()) {
            window.google.accounts.id.renderButton(buttonEl, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
              shape: 'rectangular',
              width: Math.min(320, buttonEl.clientWidth || 320)
            });
          }
        }

        if (bookingArea) {
          const stored = localStorage.getItem('vinayak_customer');
          if (!stored) {
            bookingArea.hidden = false;
            const bookingBtn = document.querySelector('#booking-google-button');
            if (bookingBtn && !bookingBtn.hasChildNodes()) {
              window.google.accounts.id.renderButton(bookingBtn, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                width: Math.min(280, bookingBtn.clientWidth || 280)
              });
            }
          }
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureScript);
      } else {
        ensureScript();
      }
    }
  } catch (error) {
    if (profileMessage) profileMessage.textContent = error.message;
  }
}
