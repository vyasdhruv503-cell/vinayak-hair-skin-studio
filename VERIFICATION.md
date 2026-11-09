# Verification

Application checks completed on 22 October 2026:

- JavaScript syntax checks for server and browser modules.
- Production startup rejects missing configuration, missing initial owner credentials and non-HTTPS origins.
- Secure/HttpOnly/SameSite cookies and owner-only API access.
- Service slots reject invalid dates, out-of-hours times and overlapping appointments.
- Two concurrent reservations for one slot yield one success and one conflict.
- Customer bookings and the owner password survive a server restart.
- A live SQLite backup opens successfully and contains the expected booking.
- Cancellation reopens a slot; logout invalidates the session.
- Requests from a different origin are rejected; database/config/source files are not publicly served.
- Compose YAML parses and includes a persistent database volume, secret file binding and private application port.

Runtime used for local application testing: Node.js 25.8.1. The Docker image targets Node.js 24 LTS. Docker is unavailable in this environment, so the image build, Caddy, real TLS issuance, DNS, and hosting disk permissions have not been exercised. Run the deployment guide's Compose validation/start commands and check the public HTTPS site on the destination host.

No real salon data or owner credentials are included in the deployment ZIP. No hosting resources have been created and no public website has been deployed.

Customer profile checks also passed: username/password registration and login, separate customer/owner sessions, profile edits, booking ownership tied to the signed-in account, rejection of cross-customer access, and preservation of legacy guest bookings during database migration. Profile layout checked at 320, 390, 768 and 1280 pixel viewport widths without horizontal overflow. Docker image remains unbuilt in this environment.

Mandatory sign-in update: anonymous and owner-only booking requests now return 401; valid customer sessions still reserve appointments. Both integration suites pass. Browser checks verified that the header booking button opens sign-in/create-profile first and that the round Profile control is placed to its right. Booking intent is carried through the local sign-in flow and availability is rechecked before reservation.

Gallery tests passed: unauthenticated uploads blocked, supported image upload and public display, invalid image rejection, owner hide/publish controls and private hidden images. Google Maps embed URL was obtained from the supplied listing's Share → Embed a map UI. No customer rating was hardcoded. Customer and deployment regression tests also pass.
