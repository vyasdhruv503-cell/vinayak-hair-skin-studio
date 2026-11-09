# Google customer sign-in setup

The customer profile supports **Sign in with Google** alongside username/password. Google sign-in is hidden until a Google OAuth Web client ID is configured. It does not grant access to the owner dashboard.

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create your project, and complete the Google Auth Platform branding/consent setup. Configure the user audience and publish the app when you are ready for all customers. While the app is in testing mode, only accounts you add as test users can use it.
2. Create an **OAuth 2.0 Client ID** for application type **Web application**.
3. Under **Authorized JavaScript origins**, add the exact public website origin, such as `https://your-salon-domain.com`. For local testing, add `http://127.0.0.1:4311` if accepted by the Google console. This integration uses Google's popup button and a JavaScript callback; it does not use a redirect URI.
4. Copy the Web client ID (it ends in `.apps.googleusercontent.com`) into `GOOGLE_CLIENT_ID` in your private `.env` file or hosting environment. The client ID is a public identifier, not a client secret. Do not put a Google client secret in this application. Restart the server or Docker Compose app.
5. Open `/profile.html`. The Google button should appear below the username/password form. Test it with a Google account allowed by your consent-screen configuration. Then check profile, booking, sign-out, and sign-in again.

For Docker Compose, set `GOOGLE_CLIENT_ID=...` in `.env` and run `docker compose up -d --build`. For local Node, set it in `.env` and run `npm start`. Set the authorized JavaScript origin to the *same origin* configured as `APP_ORIGIN` (Compose derives it from `SALON_DOMAIN`).

The server verifies the Google ID token signature using Google's published keys and checks its issuer, audience, expiry, issue time, stable subject ID and verified-email claim. It saves the verified email and pre-fills it for booking confirmations. Customer sessions still use the site's private HTTP-only cookie. The Google subject ID links repeat Google sign-ins to the same customer profile. For safety, Google sign-in does not automatically merge an existing username/password account based on email; a customer using both methods will have separate profiles. The salon asks for a phone number only when the customer books or edits profile details.

The existing local test APK uses an HTTP Wi-Fi demo origin and is not configured for Google sign-in. Test the Google button in a browser on the deployed HTTPS website or on an authorized local origin.

Official references: [Get a Google client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [display the button](https://developers.google.com/identity/gsi/web/guides/display-button), [verify the ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
