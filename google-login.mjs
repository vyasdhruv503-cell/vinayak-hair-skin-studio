const area = document.querySelector('#google-signin');
const message = document.querySelector('#google-login-message');
if (area) {
  try {
    const response = await fetch('/api/customer/google-config');
    if (!response.ok) throw Error('Google sign-in is unavailable.');
    const {clientId} = await response.json();
    if (clientId) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        if (!window.google?.accounts?.id) { message.textContent = 'Google sign-in could not load. Please use your username instead.'; return; }
        window.google.accounts.id.initialize({client_id:clientId, callback:async result => {
          message.textContent = 'Signing in with Google…';
          try {
            const signedIn = await fetch('/api/customer/google-login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:result.credential})});
            const data = await signedIn.json();
            if (!signedIn.ok) throw Error(data.error || 'Google sign-in failed.');
            location.reload();
          } catch (error) { message.textContent = error.message; }
        }});
        window.google.accounts.id.renderButton(document.querySelector('#google-button'), {type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(320,document.querySelector('#google-button').clientWidth || 320)});
      };
      script.onerror = () => { message.textContent = 'Google sign-in could not load. Please use your username instead.'; };
      area.hidden = false;
      document.head.append(script);
    }
  } catch (error) { message.textContent = error.message; }
}
