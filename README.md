# VINAYAK Hair & Skin Studio — deployable website

Mobile-oriented salon website with the original logo, INR service menu, date/time selection, one-owner scheduling, instant reservations and owner dashboard.

This package has **not been published online**. It includes a Node.js server and SQLite database. Static-only hosting cannot run its booking system.

## Run locally

Use Node.js 24–26, then run from this directory:

```sh
npm start
```

Open http://127.0.0.1:4311/ and http://127.0.0.1:4311/owner.html. On a new local database, set your owner password in the owner page. Existing local bookings and passwords are preserved. No dependency installation or frontend build is required.

## Deploy using Docker and your domain

Use a Linux server with Docker Engine and the Compose plugin, persistent storage, and a domain you control.

1. Point the domain's A/AAAA records to your server. Only use an AAAA record if incoming IPv6 works. Allow inbound ports 80 and 443.
2. Copy this project to the server. Copy `.env.example` to `.env`, and set `SALON_DOMAIN` to your domain only, without `https://` or a path.
3. Create `secrets/owner_password.txt` containing your own password of 12–200 characters. No real password or customer database is included in this package. Keep the file private and out of Git. This password initializes an EMPTY database; it does not overwrite an existing account.
4. Make the secret readable by container user UID 1000. On Linux:

```sh
sudo chown 1000:1000 secrets/owner_password.txt
sudo chmod 400 secrets/owner_password.txt
```

5. Validate and start:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

6. Open `https://YOUR-DOMAIN/` and `https://YOUR-DOMAIN/owner.html`. Sign in with the password from your secret file. Publish service-specific slots between 7:30 AM and 9:30 PM. Only published slots appear to customers.

Caddy handles HTTPS and redirects HTTP to HTTPS once domain DNS and inbound ports are configured. The application port is exposed only inside Docker's network. The `salon_data` volume retains the database and hashed owner password; separate volumes retain Caddy's certificates.

Run **one application instance**. Do not scale this SQLite app across replicas or use ephemeral disks. Changing the initial password secret does not reset an existing password. Owner sessions expire after eight hours and are cleared on restart; sign in again after updating.

## Update the website

Copy updated files into the same directory and run:

```sh
docker compose up -d --build
```

Keep the existing volumes. `docker compose down -v` would delete stored data.

## Back up bookings

Create a consistent snapshot, including while the app is running:

```sh
docker compose exec app node scripts/backup.mjs /data/backup-2026-10-22.sqlite
docker compose cp app:/data/backup-2026-10-22.sqlite ./backup-2026-10-22.sqlite
```

Choose a fresh filename each time and transfer snapshots to protected storage outside the server. Backups contain customer details and must remain private.

To restore: stop the application, restore a snapshot as `/data/salon.sqlite` inside its existing volume, remove obsolete SQLite WAL/SHM sidecars only while the app is stopped, set UID/GID ownership to 1000, then start the app. Restoring a database also restores its owner password. Test restoration before relying on backups.

To migrate existing local bookings, first create a snapshot:

```sh
npm run backup -- /absolute/path/to/backup.sqlite
```

Restore that snapshot into the production volume BEFORE the first launch. Do not add databases to a public source repository or application image.

## Use another Node/container host

The Dockerfile can also run on a container host. Configure a permanent disk and one app instance with these settings:

| Setting | Value |
| --- | --- |
| Start command | `npm start`, or Docker's default command |
| Node | 24 LTS; versions 24–26 supported |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| PORT | Host-assigned port; Docker default 8080 |
| APP_ORIGIN | Exact public HTTPS origin, e.g. https://your-domain.com, without a path |
| SALON_DATA_DIR | Absolute permanent disk mount path, e.g. /data |
| SALON_OWNER_PASSWORD_FILE | Preferred: injected password secret file path |
| SALON_OWNER_PASSWORD | Alternative: initial password entered in hosting secret settings |
| Health check | GET /healthz |

The host must provide HTTPS and forward requests to the application. Set APP_ORIGIN to the public address, not the internal container address. Redirect alternate domains to that canonical origin. Startup fails if production origin/storage settings are missing, or an empty production database has no initial password. Public owner signup is disabled in production.

## Checks

```sh
npm run check
npm test
```

Tests use an isolated database and cover production configuration, HTTPS origin checks, Secure/HttpOnly/SameSite cookies, owner access, invalid dates, overlapping slots, concurrent reservations, restart persistence, cancellation/rebooking, file privacy and database backup. They never use the live salon database. Docker/Caddy infrastructure must also be validated on the hosting server.

## Before accepting customers

- Add the salon's exact street address and phone number to `index.html`. The confirmation and profile include the salon's supplied Google Maps link.
- Review services/prices in `services.mjs`. Unprovided prices say "Price on consultation."
- Publish available appointment slots daily. Allow enough time for treatment, preparation and cleanup.
- No online payment or SMS integration is configured. Customers get an onscreen confirmation, Google Maps location and downloadable reference. Automatic WhatsApp and email delivery require the private provider settings below.

## Booking location and notifications

On confirmation, the exact Google Maps listing supplied by the owner is shown immediately, included in the downloaded booking details and available in the customer's appointment history. Google sign-in provides a verified email address, which is prefilled in the booking form. Username/password customers can enter an optional email there. Customers explicitly opt in before a WhatsApp confirmation is requested. An email is requested only when an email address is supplied.

For automatic WhatsApp messages, configure the Meta WhatsApp Business Platform and approve a utility template named by `WHATSAPP_TEMPLATE_NAME`. Its body must have four text placeholders in this order: service, date/time, Maps link, booking reference. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_LANGUAGE` (such as `en`) and `WHATSAPP_GRAPH_VERSION` (a supported `vNN.N` version) privately on the host. See [Meta's official API collection](https://www.postman.com/meta/whatsapp-business-platform/overview) and [template request](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).

For automatic email, verify your sending domain with Resend, then set `RESEND_API_KEY` and `BOOKING_EMAIL_FROM` in private hosting settings. See [Resend's email API example](https://resend.com/aws-lambda). Do not commit keys or send them in chat. The server reports whether each provider accepted the request; acceptance is not proof of final delivery. If a provider is unconfigured or rejects the request, booking still succeeds and the customer sees the Maps link onscreen. Check provider delivery logs for failures. Existing appointments are not resent automatically.

## Technical references

- [Node.js SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
- [Caddy automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https)

## Customer profiles

Customers can open `/profile.html`, create a username/password account, edit their name and contact number, and see upcoming/past appointments booked while signed in. Passwords are hashed; customer sessions are separate from owner sessions. Phone numbers are contact details, not verified login identities. Guest appointments are never automatically claimed through a matching phone number.

Customer sign in or sign up is required before any new booking. The server rejects guest booking requests. The round Profile button sits to the right of the header appointment button. Signing in from a booking action returns to the selected service/date/time; a slot is reserved only after confirmation and availability is checked again. The booking form pre-fills saved details. Changes to a profile do not rewrite historical appointment details. Customer bookings remain after a restart, but the customer signs in again. There is no password reset, SMS/OTP or email verification service configured. Customers should keep their passwords safe; no recovery promise is shown. Existing guest bookings remain available to the owner.

## Gallery and Google Maps reviews

The Gallery button opens `/gallery.html`. In the owner dashboard, expand **Gallery photos** to upload real salon photos (JPG, PNG or WebP, up to 5 MB each, maximum 60 photos). Titles are required. The owner can hide a published photo and publish it again. Hidden image URLs require owner authentication. The public gallery starts empty; no stock photos or fabricated salon work are included.

Images are stored in `SALON_DATA_DIR/gallery`, inside the existing permanent volume. Back up this folder together with a consistent SQLite snapshot. A database-only backup does not contain image files.

The home and gallery pages embed the official Google Maps card obtained from this salon's Google Maps Share → Embed a map option. Google loads its own map information and links. Its embedded map does not reliably display a numeric star rating on all screen sizes. No rating number or review text is copied into the application database, and no Maps API key is required for this shared embed. The displayed map may use Google's cookies; a Google Privacy Policy link is provided beside it. The external Read Google reviews button opens the exact listing supplied by the salon owner: https://maps.app.goo.gl/RDEsMfAkHjaj4be2A

Google controls how its embedded card looks and when its rating changes. The website does not scrape Google or fabricate reviews. The embed needs internet access and permission to load www.google.com frames; privacy blockers may prevent it loading, while the external reviews link remains available.

## Automatic numeric Google rating

The numeric star widget uses Google Places API (New). It is hidden until a real API response is available; no rating is invented or copied from a one-time browser lookup. The external reviews link and map work independently.

Enable Places API (New) in your Google Cloud project, configure its required billing and API restrictions, and set GOOGLE_PLACES_API_KEY as a hosting secret. Do not put it in HTML or share it in chat. Alternatively inject a secret file and set GOOGLE_PLACES_API_KEY_FILE. For the supplied Docker Compose setup, GOOGLE_PLACES_API_KEY can be supplied through the private .env file; this file is excluded from the deployment ZIP and source control.

Set GOOGLE_PLACE_ID if you know it. Otherwise, the connector attempts a single exact-listing lookup per server start and accepts it only if the returned Google Maps CID matches this salon’s supplied listing. If no exact match is returned, provide the official Place ID explicitly. Restart the application after changing environment settings.

The page requests fresh data on load and every five minutes while visible. Requests are server-side, with in-flight deduplication and a limit of 60 rating requests per hour across the website. Google response content is not cached in the database or written to disk. API errors hide the numeric widget rather than showing an outdated or fabricated value. Google controls the underlying score and count; API usage is billed according to your Google Cloud plan. Review usage quotas before enabling.

Documentation: https://developers.google.com/maps/documentation/places/web-service/place-details
Attribution and policies: https://developers.google.com/maps/documentation/places/web-service/policies


## Installable mobile app (PWA)

The same website can be installed as VINAYAK on a phone home screen. It uses the supplied salon logo, standalone display mode, booking/profile/gallery shortcuts and an installation guide at `/install.html`. Android browsers that expose an installation prompt show the Install app button; other browsers show manual instructions. Already installed apps hide the installation card.

Deploy the existing Node/SQLite application on a public HTTPS domain first, using the deployment instructions above. A phone cannot reach this computer through `127.0.0.1`; ordinary HTTP LAN addresses do not meet secure-context requirements. This package is ready for HTTPS hosting, but has not been published to a public host or app store. There is no APK.

Android: open the public URL in Chrome, use Install app or the browser menu → Add to Home screen / Install app. iPhone: open in Safari, Share → Add to Home Screen, enable Open as Web App if shown, then Add. Browser wording can vary.

The service worker stores only an offline information page and its logo. Account pages, customer data, API responses, gallery media and booking submissions are never stored in the service-worker cache. Live features require internet. There is no background booking queue: interrupted bookings should be checked in appointment history after reconnecting. Existing HTTPS, authentication, SQLite persistence and backup requirements still apply. Phone installation needs a real-device check after deployment; the in-app preview cannot validate the phone's native installer.


Home page content: the latest three published gallery photos appear automatically on Home. Popular services link directly into the signed-in booking flow. Customer Feedback opens the supplied Google Maps listing. In Owner dashboard → Home page offer, save a title, details/conditions and a valid-through date, then enable Publish. Unpublished and expired offers are hidden from the public API (expiry uses India time). No discount or rating is fabricated.


## Customer Google sign-in

Sign in with Google is available as an additional customer login method after configuring `GOOGLE_CLIENT_ID`. See [GOOGLE-LOGIN-SETUP.md](GOOGLE-LOGIN-SETUP.md). The server verifies Google ID tokens before creating or opening a profile. No client secret is needed. Google profiles are linked by Google subject ID and are not merged with existing password accounts by email. The owner dashboard continues to use its own password.
