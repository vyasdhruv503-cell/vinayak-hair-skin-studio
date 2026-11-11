import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "../../db/index.js";
import { bookings, customers, gallery, googleAccounts, loginAttempts, sessions, settings, slots } from "../../db/schema.js";
// Shared modules from the original site (also used by the browser / unit tests).
// @ts-ignore - plain ES modules without type declarations
import { services } from "../../services.mjs";
// @ts-ignore
import { verifyGoogleIdToken } from "../../google-auth.mjs";
// @ts-ignore
import { getGoogleRating } from "../../google-rating.mjs";
// @ts-ignore
import { sendBookingNotifications } from "../../notifications.mjs";
// @ts-ignore
import { salonMapsUrl } from "../../salon-info.mjs";

type Service = { id: string; name: string };
type CustomerRow = { id: string; username: string; name: string; phone: string; email: string; created: Date; provider?: string };

const SESSION_SECONDS = 8 * 3600;
const LOCK_MS = 15 * 60 * 1000;
const OWNER_COOKIE = "vinayak_session";
const CUSTOMER_COOKIE = "vinayak_customer";
const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,39}$/;
const PHONE_RE = /^[+0-9 ()-]{7,25}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_CLIENT_RE = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
};

function json(status: number, value: unknown, headers: HeadersInit = {}) {
  const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS });
  for (const [k, v] of new Headers(headers)) h.append(k, v);
  return new Response(JSON.stringify(value), { status, headers: h });
}

// ---------- configuration ----------
function ownerPassword(): string | null {
  const value = process.env.SALON_OWNER_PASSWORD || "vinayakhairnai";
  return value.length >= 12 && value.length <= 200 ? value : null;
}
const configured = () => ownerPassword() !== null;
function googleClientId(): string | null {
  const id = (process.env.GOOGLE_CLIENT_ID || "135458455222-fkf08bo9c6p2ba1m0532ghrboe2d3gct.apps.googleusercontent.com").trim();
  return GOOGLE_CLIENT_RE.test(id) ? id : null;
}

// ---------- helpers ----------
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
};
const missingCustomerHash = hashPassword(randomBytes(32).toString("hex"));
function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
}
const instant = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).getTime();
const todayIST = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const pgCode = (e: any): string | undefined => e?.code ?? e?.cause?.code;

function cookieValue(req: Request, name: string) {
  return (req.headers.get("cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(name + "="))?.slice(name.length + 1);
}
function cookie(req: Request, name: string, token: string, maxAge: number) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

async function body(req: Request): Promise<Record<string, any>> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) fail(415, "Use a JSON request.");
  const text = await req.text();
  if (text.length > 16000) fail(413, "Request too large.");
  let value: any;
  try { value = JSON.parse(text); } catch { fail(400, "Invalid request."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "Request must be a JSON object.");
  return value;
}

// ---------- sessions ----------
async function createSession(kind: "owner" | "customer", customerId: string | null) {
  await db.delete(sessions).where(lt(sessions.expires, new Date()));
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ tokenHash: sha256(token), kind, customerId, expires: new Date(Date.now() + SESSION_SECONDS * 1000) });
  return token;
}
async function findSession(req: Request, kind: "owner" | "customer") {
  const token = cookieValue(req, kind === "owner" ? OWNER_COOKIE : CUSTOMER_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [s] = await db.select().from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), eq(sessions.kind, kind), gt(sessions.expires, new Date())));
  return s ?? null;
}
async function destroySession(req: Request, kind: "owner" | "customer") {
  const token = cookieValue(req, kind === "owner" ? OWNER_COOKIE : CUSTOMER_COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}
async function requireOwner(req: Request) {
  if (!(await findSession(req, "owner"))) fail(401, "Please sign in as the owner.");
}

const customerColumns = {
  id: customers.id, username: customers.username, name: customers.name, phone: customers.phone,
  email: customers.email, created: customers.created,
  provider: sql<string>`CASE WHEN ${googleAccounts.sub} IS NOT NULL THEN 'google' ELSE 'password' END`,
};
async function loadCustomer(id: string): Promise<CustomerRow | null> {
  const [c] = await db.select(customerColumns).from(customers)
    .leftJoin(googleAccounts, eq(googleAccounts.customerId, customers.id)).where(eq(customers.id, id));
  return c ?? null;
}
async function customerFor(req: Request): Promise<CustomerRow> {
  const s = await findSession(req, "customer");
  const c = s?.customerId ? await loadCustomer(s.customerId) : null;
  if (!c) fail(401, "Please sign in to your customer profile.");
  return c!;
}
async function customerSession(req: Request, c: CustomerRow) {
  const token = await createSession("customer", c.id);
  return json(200, {
    customer: { id: c.id, username: c.username, name: c.name, phone: c.phone, email: c.email || "", provider: c.provider || "password" },
  }, { "Set-Cookie": cookie(req, CUSTOMER_COOKIE, token, SESSION_SECONDS) });
}
function customerDetails(v: Record<string, any>) {
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 80 || typeof v.phone !== "string" || !PHONE_RE.test(v.phone))
    fail(400, "Enter your name and a valid phone number.");
}

// ---------- brute-force lockout ----------
async function assertNotLocked(key: string) {
  const [a] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
  if (a?.lockedUntil && a.lockedUntil.getTime() > Date.now()) fail(429, "Too many attempts. Try again in 15 minutes.");
}
async function recordFailure(key: string) {
  const windowStart = new Date(Date.now() - LOCK_MS);
  await db.insert(loginAttempts).values({ key, count: 1, lastFailure: new Date() }).onConflictDoUpdate({
    target: loginAttempts.key,
    set: {
      count: sql`CASE WHEN ${loginAttempts.lastFailure} > ${windowStart} THEN ${loginAttempts.count} + 1 ELSE 1 END`,
      lastFailure: new Date(),
      lockedUntil: sql`CASE WHEN ${loginAttempts.lastFailure} > ${windowStart} AND ${loginAttempts.count} + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END`,
    },
  });
}
const clearFailures = (key: string) => db.delete(loginAttempts).where(eq(loginAttempts.key, key));

// ---------- slots ----------
function validateSlot(s: Record<string, any>) {
  if (!services.some((x: Service) => x.id === s.service)) fail(400, "Choose a valid service.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || "") || !/^\d{2}:\d{2}$/.test(s.start || "") || !/^\d{2}:\d{2}$/.test(s.end || ""))
    fail(400, "Enter a valid date and time.");
  const a = instant(s.date, s.start), b = instant(s.date, s.end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || s.start < "07:30" || s.end > "21:30" || s.start >= s.end || a <= Date.now())
    fail(400, "Choose a future slot between 7:30 AM and 9:30 PM.");
  const iso = new Date(a + 19800000).toISOString();
  if (iso.slice(0, 10) !== s.date || iso.slice(11, 16) !== s.start) fail(400, "Invalid calendar date or time.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)) fail(400, "Invalid end time.");
}

async function currentOffer() {
  const [saved] = await db.select().from(settings).where(eq(settings.key, "homepage_offer"));
  return saved ? JSON.parse(saved.value) : null;
}

const galleryStore = () => getStore("gallery");
const photoUrl = (id: string) => "/media/gallery/" + id;

// ---------- router ----------
async function route(req: Request, context: Context): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;

  if (path === "/healthz" && method === "GET") {
    await db.execute(sql`SELECT 1`);
    return json(200, { status: "ok" });
  }

  if (path.startsWith("/media/gallery/") && (method === "GET" || method === "HEAD")) {
    const id = path.slice("/media/gallery/".length);
    if (!/^[a-f0-9-]{36}$/.test(id)) fail(404, "Photo not found.");
    const [p] = await db.select().from(gallery).where(eq(gallery.id, id));
    if (!p) fail(404, "Photo not found.");
    if (!p.published) await requireOwner(req);
    const data = await galleryStore().get(id, { type: "arrayBuffer" });
    if (!data) fail(404, "Photo not found.");
    return new Response(method === "HEAD" ? null : data, {
      headers: { "Content-Type": p.mime, "Cache-Control": "no-store", ...SECURITY_HEADERS },
    });
  }

  if (!path.startsWith("/api/")) fail(404, "Not found.");

  // CSRF protection: state-changing requests must come from this site's own origin.
  if (!["GET", "HEAD"].includes(method) && req.headers.get("origin") !== url.origin)
    fail(403, "Please use the salon website to make this request.");

  // ----- public -----
  if (path === "/api/status" && method === "GET") return json(200, { configured: configured(), timezone: "Asia/Kolkata" });
  if (path === "/api/google-rating" && method === "GET") return json(200, await getGoogleRating());
  if (path === "/api/offer" && method === "GET") {
    const offer = await currentOffer();
    return json(200, { offer: offer?.published && offer.expires >= todayIST() ? offer : null });
  }
  if (path === "/api/gallery" && method === "GET") {
    const rows = await db.select({ id: gallery.id, title: gallery.title, created: gallery.created }).from(gallery)
      .where(eq(gallery.published, true)).orderBy(desc(gallery.created));
    return json(200, rows.map((p) => ({ ...p, url: photoUrl(p.id) })));
  }
  if (path === "/api/slots" && method === "GET") {
    const service = url.searchParams.get("service") || "", date = url.searchParams.get("date") || "";
    const rows = await db.select({ id: slots.id, date: slots.date, start: slots.start, end: slots.end, service: slots.service }).from(slots)
      .where(and(eq(slots.service, service), eq(slots.date, date),
        sql`NOT EXISTS (SELECT 1 FROM ${bookings} WHERE ${bookings.slotId} = ${slots.id} AND ${bookings.status} = 'confirmed')`))
      .orderBy(asc(slots.start));
    return json(200, rows.filter((s) => s.start >= "07:30" && s.end <= "21:30" && instant(s.date, s.start) > Date.now()));
  }

  // ----- customer accounts -----
  if (path === "/api/customer/google-config" && method === "GET") return json(200, { clientId: googleClientId() });

  if (path === "/api/customer/google-login" && method === "POST") {
    const clientId = googleClientId();
    if (!clientId) fail(503, "Google sign-in is not configured yet.");
    const v = await body(req);
    let identity: { sub: string; name: string; email: string };
    try {
      identity = await verifyGoogleIdToken(v.credential, clientId);
    } catch (error: any) {
      const unavailable = String(error?.message).includes("temporarily unavailable");
      return json(unavailable ? 503 : 401, { error: unavailable ? "Google sign-in is temporarily unavailable." : "Invalid Google credential." });
    }
    const customerId = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"google:" + identity.sub}))`);
      const [linked] = await tx.select({ id: customers.id, email: customers.email }).from(googleAccounts)
        .innerJoin(customers, eq(customers.id, googleAccounts.customerId)).where(eq(googleAccounts.sub, identity.sub));
      if (linked) {
        if (identity.email && identity.email !== linked.email) await tx.update(customers).set({ email: identity.email }).where(eq(customers.id, linked.id));
        return linked.id;
      }
      const id = randomUUID();
      const username = "g" + sha256(identity.sub).slice(0, 38);
      const [taken] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.username, username));
      if (taken) fail(409, "This Google account could not be linked automatically. Please contact the salon.");
      await tx.insert(customers).values({
        id, username, name: identity.name || "Google customer", phone: "", email: identity.email,
        password: hashPassword(randomBytes(32).toString("hex")),
      });
      await tx.insert(googleAccounts).values({ sub: identity.sub, customerId: id });
      return id;
    });
    return customerSession(req, (await loadCustomer(customerId))!);
  }

  if (path === "/api/customer/register" && method === "POST") {
    const v = await body(req);
    customerDetails(v);
    const username = typeof v.username === "string" ? v.username.trim().toLowerCase() : "";
    if (!USERNAME_RE.test(username)) fail(400, "Use a username of 3–40 letters, numbers, dots, hyphens or underscores.");
    if (typeof v.password !== "string" || v.password.length < 12 || v.password.length > 200) fail(400, "Use a password of 12–200 characters.");
    const id = randomUUID();
    try {
      await db.insert(customers).values({ id, username, name: v.name.trim(), phone: v.phone.trim(), password: hashPassword(v.password) });
    } catch (e) {
      if (pgCode(e) === "23505") fail(409, "This username is unavailable. Choose another.");
      throw e;
    }
    return customerSession(req, (await loadCustomer(id))!);
  }

  if (path === "/api/customer/login" && method === "POST") {
    const v = await body(req);
    const username = typeof v.username === "string" ? v.username.trim().toLowerCase() : "";
    if (!USERNAME_RE.test(username) || typeof v.password !== "string" || v.password.length > 200) fail(401, "Incorrect username or password.");
    const key = "customer:" + username;
    await assertNotLocked(key);
    const [c] = await db.select({ id: customers.id, password: customers.password }).from(customers).where(eq(customers.username, username));
    const valid = checkPassword(v.password, c?.password || missingCustomerHash);
    if (!c || !valid) {
      await recordFailure(key);
      fail(401, "Incorrect username or password.");
    }
    await clearFailures(key);
    return customerSession(req, (await loadCustomer(c.id))!);
  }

  if (path === "/api/customer/logout" && method === "POST") {
    await destroySession(req, "customer");
    return json(200, { ok: true }, { "Set-Cookie": cookie(req, CUSTOMER_COOKIE, "", 0) });
  }

  if (path === "/api/customer/profile" && method === "GET") return json(200, { customer: await customerFor(req) });

  if (path === "/api/customer/profile" && method === "PUT") {
    const c = await customerFor(req);
    const v = await body(req);
    customerDetails(v);
    await db.update(customers).set({ name: v.name.trim(), phone: v.phone.trim() }).where(eq(customers.id, c.id));
    return json(200, { customer: await loadCustomer(c.id) });
  }

  if (path === "/api/customer/bookings" && method === "GET") {
    const c = await customerFor(req);
    const rows = await db.select({
      id: bookings.id, name: bookings.name, status: bookings.status, created: bookings.created,
      service: slots.service, date: slots.date, start: slots.start, end: slots.end,
    }).from(bookings).innerJoin(slots, eq(slots.id, bookings.slotId))
      .where(eq(bookings.customerId, c.id)).orderBy(desc(slots.date), desc(slots.start));
    return json(200, rows);
  }

  // ----- bookings -----
  if (path === "/api/bookings" && method === "POST") {
    const customer = await customerFor(req);
    const v = await body(req);
    if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 80 || typeof v.phone !== "string" || !PHONE_RE.test(v.phone)
      || typeof v.notes !== "string" || v.notes.length > 500)
      fail(400, "Enter a name, valid phone number and notes under 500 characters.");
    if (v.email !== undefined && typeof v.email !== "string") fail(400, "Enter a valid email address.");
    const email: string = v.email === undefined ? customer.email || "" : v.email.trim().toLowerCase();
    if (email.length > 254 || (email && !EMAIL_RE.test(email)) || (v.whatsappOptIn !== undefined && typeof v.whatsappOptIn !== "boolean"))
      fail(400, "Enter a valid email address and notification preference.");
    if (!configured()) fail(503, "The owner has not opened bookings yet.");
    if (typeof v.slot !== "string" || !v.slot) fail(409, "This appointment is no longer available.");

    let booking: Record<string, any>;
    try {
      booking = await db.transaction(async (tx) => {
        const [s] = await tx.select().from(slots).where(eq(slots.id, v.slot)).for("update");
        if (!s || s.start < "07:30" || s.end > "21:30" || instant(s.date, s.start) <= Date.now()) fail(409, "This appointment is no longer available.");
        const [taken] = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.slotId, s.id), eq(bookings.status, "confirmed")));
        if (taken) fail(409, "That slot was just booked. Please choose another.");
        const id = randomUUID();
        await tx.insert(bookings).values({
          id, slotId: s.id, name: v.name.trim(), phone: v.phone.trim(), notes: v.notes, customerId: customer.id, email,
        });
        return { ...s, id, name: v.name.trim(), phone: v.phone.trim(), notes: v.notes, slot_id: s.id, reference: id };
      });
    } catch (e) {
      if (pgCode(e) === "23505") fail(409, "That slot was just booked. Please choose another.");
      throw e;
    }
    const serviceName = services.find((s: Service) => s.id === booking.service)?.name || booking.service;
    const notification = await sendBookingNotifications({ ...booking, service: serviceName }, { email, whatsappOptIn: v.whatsappOptIn === true });
    return json(201, { ...booking, locationUrl: salonMapsUrl, notification });
  }

  // ----- owner -----
  if (path === "/api/login" && method === "POST") {
    const v = await body(req);
    const expected = ownerPassword();
    if (!expected) fail(503, "Owner sign-in is not set up yet. The site administrator must set SALON_OWNER_PASSWORD in Netlify.");
    const key = "owner:" + (context.ip || "unknown");
    await assertNotLocked(key);
    const ok = typeof v.password === "string" && v.password.length <= 200
      && timingSafeEqual(createHash("sha256").update(v.password).digest(), createHash("sha256").update(expected!).digest());
    if (!ok) {
      await recordFailure(key);
      fail(401, "Incorrect owner password.");
    }
    await clearFailures(key);
    const token = await createSession("owner", null);
    return json(200, { ok: true }, { "Set-Cookie": cookie(req, OWNER_COOKIE, token, SESSION_SECONDS) });
  }

  if (path === "/api/logout" && method === "POST") {
    await requireOwner(req);
    await destroySession(req, "owner");
    return json(200, { ok: true }, { "Set-Cookie": cookie(req, OWNER_COOKIE, "", 0) });
  }

  if (path.startsWith("/api/owner/")) {
    await requireOwner(req);

    if (path === "/api/owner/offer" && method === "GET") return json(200, { offer: await currentOffer() });
    if (path === "/api/owner/offer" && method === "POST") {
      const v = await body(req);
      if (typeof v.title !== "string" || v.title.trim().length > 100 || typeof v.details !== "string" || v.details.trim().length > 600
        || typeof v.expires !== "string" || typeof v.published !== "boolean") fail(400, "Enter a valid offer.");
      if (v.published && (!v.title.trim() || !v.details.trim() || !v.expires)) fail(400, "Add an offer title, details and expiry date before publishing.");
      if (v.expires && (!/^\d{4}-\d{2}-\d{2}$/.test(v.expires) || !Number.isFinite(Date.parse(v.expires + "T00:00:00Z"))
        || new Date(v.expires + "T00:00:00Z").toISOString().slice(0, 10) !== v.expires)) fail(400, "Enter a valid expiry date.");
      const offer = { title: v.title.trim(), details: v.details.trim(), expires: v.expires, published: v.published };
      await db.insert(settings).values({ key: "homepage_offer", value: JSON.stringify(offer) })
        .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(offer) } });
      return json(200, { offer });
    }

    if (path === "/api/owner/gallery" && method === "GET") {
      const rows = await db.select({ id: gallery.id, title: gallery.title, published: gallery.published, created: gallery.created })
        .from(gallery).orderBy(desc(gallery.created));
      return json(200, rows.map((p) => ({ ...p, url: photoUrl(p.id) })));
    }
    if (path === "/api/owner/gallery" && method === "POST") {
      const title = (url.searchParams.get("title") || "").trim();
      if (!title || title.length > 120) fail(400, "Add a photo title of 1–120 characters.");
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(gallery);
      if (n >= 60) fail(400, "The gallery limit is 60 photos.");
      const type = req.headers.get("content-type")?.split(";")[0] || "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(type)) fail(415, "Use a JPG, PNG or WebP photo.");
      if (Number(req.headers.get("content-length") || 0) > 5 * 1024 * 1024) fail(413, "Choose a photo smaller than 5 MB.");
      const data = Buffer.from(await req.arrayBuffer());
      if (data.length > 5 * 1024 * 1024) fail(413, "Choose a photo smaller than 5 MB.");
      const valid = type === "image/jpeg" ? data.length > 3 && data[0] === 255 && data[1] === 216 && data[2] === 255
        : type === "image/png" ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
      if (!valid) fail(400, "This file is not a supported image.");
      const id = randomUUID();
      const store = galleryStore();
      await store.set(id, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      try {
        await db.insert(gallery).values({ id, title, mime: type });
      } catch (e) {
        await store.delete(id);
        throw e;
      }
      return json(201, { id, title, url: photoUrl(id) });
    }
    if (path === "/api/owner/gallery" && method === "PATCH") {
      const v = await body(req);
      if (typeof v.id !== "string" || typeof v.published !== "boolean") fail(400, "Choose a photo and visibility.");
      const updated = await db.update(gallery).set({ published: v.published }).where(eq(gallery.id, v.id)).returning({ id: gallery.id });
      if (!updated.length) fail(404, "Photo not found.");
      return json(200, { ok: true });
    }

    if (path === "/api/owner/slots" && method === "GET") {
      const rows = await db.select({
        id: slots.id, service: slots.service, date: slots.date, start: slots.start, end: slots.end, booking_id: bookings.id,
      }).from(slots).leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "confirmed")))
        .orderBy(asc(slots.date), asc(slots.start));
      return json(200, rows);
    }
    if (path === "/api/owner/slots" && method === "POST") {
      const s = await body(req);
      validateSlot(s);
      const created = await db.transaction(async (tx) => {
        // Serialise slot creation for the day so two overlapping slots cannot be inserted concurrently.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"slots:" + s.date}))`);
        const [overlap] = await tx.select({ id: slots.id }).from(slots)
          .where(and(eq(slots.date, s.date), lt(slots.start, s.end), gt(slots.end, s.start)));
        if (overlap) fail(409, "This slot overlaps another appointment slot.");
        const row = { id: randomUUID(), service: s.service as string, date: s.date as string, start: s.start as string, end: s.end as string };
        await tx.insert(slots).values(row);
        return row;
      });
      return json(201, created);
    }
    if (path === "/api/owner/slots" && method === "DELETE") {
      const v = await body(req);
      if (typeof v.id !== "string") fail(400, "Choose a slot.");
      const [booked] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.slotId, v.id));
      if (booked) fail(409, "This slot has a booking record and cannot be deleted.");
      await db.delete(slots).where(eq(slots.id, v.id));
      return json(200, { ok: true });
    }
    if (path === "/api/owner/bookings" && method === "GET") {
      const rows = await db.select({
        id: bookings.id, slot_id: bookings.slotId, name: bookings.name, phone: bookings.phone, notes: bookings.notes,
        status: bookings.status, created: bookings.created, customer_id: bookings.customerId, email: bookings.email,
        service: slots.service, date: slots.date, start: slots.start, end: slots.end,
      }).from(bookings).innerJoin(slots, eq(slots.id, bookings.slotId)).orderBy(asc(slots.date), asc(slots.start));
      return json(200, rows);
    }
    if (path === "/api/owner/cancel" && method === "POST") {
      const v = await body(req);
      if (typeof v.id !== "string") fail(400, "Choose a booking.");
      await db.update(bookings).set({ status: "cancelled" }).where(and(eq(bookings.id, v.id), ne(bookings.status, "cancelled")));
      return json(200, { ok: true });
    }
  }

  return fail(404, "Not found.");
}

export default async (req: Request, context: Context) => {
  try {
    return await route(req, context);
  } catch (e: any) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error("API error", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};

export const config: Config = {
  path: ["/api/*", "/media/gallery/*", "/healthz"],
};
