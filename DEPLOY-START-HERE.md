# Publish VINAYAK Hair & Skin Studio

This is the complete Node.js website and booking server. Use a Linux server with Docker Engine, Docker Compose, a domain you control, and persistent disk storage. A static HTML host cannot run bookings.

1. Extract `vinayak-salon-deployment.zip` on the server and enter the `salon-website` folder.
2. Point your domain's A record to the server. Open inbound ports 80 and 443.
3. Copy `.env.example` to `.env`. Replace `salon.example.com` with your real domain, without `https://`.
4. Create a private `secrets/owner_password.txt` containing the owner password (12–200 characters). Do not put it in `.env`, the deployment ZIP, or a public repository. On Linux, make this file readable by container user 1000: `sudo chown 1000:1000 secrets/owner_password.txt && sudo chmod 400 secrets/owner_password.txt`.
5. Run `docker compose config --quiet`, then `docker compose up -d --build`.
6. Check `docker compose ps`; open `https://YOUR-DOMAIN/` and `https://YOUR-DOMAIN/owner.html`.

The database, customer accounts, bookings, gallery images and the local owner password are **not included** in the ZIP. On a fresh deployment, the secret initializes the owner password and the owner publishes available appointment slots. To bring over existing local customer data, follow the backup and restore instructions in [README.md](README.md) before the first launch. Keep the `salon_data` volume when updating the site.

Google customer login is optional until a Web client ID is configured; see [GOOGLE-LOGIN-SETUP.md](GOOGLE-LOGIN-SETUP.md). The Google numeric rating is optional. The reviews link works without a key. To enable the automatic rating, see [GOOGLE-RATING-SETUP.md](GOOGLE-RATING-SETUP.md) and set the API key privately in `.env`.

This package has been verified by the project's automated tests and source checks. The Docker image must be built and checked on the destination server; Docker is not installed on the development computer.
