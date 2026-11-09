import { sql } from "drizzle-orm";
import { pgTable, text, boolean, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

// Key/value settings (e.g. the homepage offer stored as JSON text).
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export const customers = pgTable("customers", {
  id: text().primaryKey(),
  username: text().notNull().unique(),
  name: text().notNull(),
  phone: text().notNull().default(""),
  email: text().notNull().default(""),
  // scrypt "salt:hash" (hex). Google-only accounts get an unguessable random password hash.
  password: text().notNull(),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
});

export const googleAccounts = pgTable("google_accounts", {
  sub: text().primaryKey(),
  customerId: text("customer_id").notNull().unique().references(() => customers.id, { onDelete: "cascade" }),
});

// Appointment slots published by the owner. Dates/times are IST wall-clock strings (YYYY-MM-DD, HH:MM).
export const slots = pgTable("slots", {
  id: text().primaryKey(),
  service: text().notNull(),
  date: text().notNull(),
  start: text().notNull(),
  end: text().notNull(),
}, (t) => [index("slots_date_start").on(t.date, t.start)]);

export const bookings = pgTable("bookings", {
  id: text().primaryKey(),
  slotId: text("slot_id").notNull().references(() => slots.id),
  customerId: text("customer_id").references(() => customers.id),
  name: text().notNull(),
  phone: text().notNull(),
  email: text().notNull().default(""),
  notes: text().notNull().default(""),
  status: text().notNull().default("confirmed"),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("one_booking_per_slot").on(t.slotId).where(sql`status = 'confirmed'`),
  index("customer_bookings").on(t.customerId),
]);

// Gallery photo metadata; the image bytes live in the "gallery" Netlify Blobs store under `id`.
export const gallery = pgTable("gallery", {
  id: text().primaryKey(),
  title: text().notNull(),
  mime: text().notNull(),
  published: boolean().notNull().default(true),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
});

// Server-side sessions. Only a SHA-256 hash of the cookie token is stored.
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  kind: text().notNull(), // 'owner' | 'customer'
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (t) => [index("sessions_expires").on(t.expires)]);

// Failed sign-in tracking for lockouts (owner by IP, customer by username).
export const loginAttempts = pgTable("login_attempts", {
  key: text().primaryKey(),
  count: integer().notNull().default(0),
  lastFailure: timestamp("last_failure", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});
