import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email", { length: 255 }).notNull().unique(),
  displayName: text("display_name", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role", { length: 20 }).notNull().default("user"),
  passwordHash: text("password_hash"),
  oidcProvider: text("oidc_provider", { length: 255 }),
  oidcSubject: text("oidc_subject", { length: 255 }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  lastLoginAt: text("last_login_at"),
});

export const books = sqliteTable("books", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title", { length: 500 }).notNull(),
  author: text("author", { length: 500 }).notNull(),
  isbn: text("isbn", { length: 20 }),
  publisher: text("publisher", { length: 255 }),
  year: integer("year"),
  language: text("language", { length: 10 }),
  description: text("description"),
  genre: text("genre", { length: 100 }),
  tags: text("tags"),
  coverPath: text("cover_path"),
  filePath: text("file_path").notNull(),
  fileFormat: text("file_format", { length: 10 }).notNull(),
  fileSize: integer("file_size").notNull(),
  fileHash: text("file_hash", { length: 64 }),
  pageCount: integer("page_count"),
  addedBy: text("added_by")
    .notNull()
    .references(() => users.id),
  metadataSource: text("metadata_source", { length: 20 }),
  metadataLocked: integer("metadata_locked", { mode: "boolean" }).default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  refreshTokenHash: text("refresh_token_hash", { length: 255 }).notNull(),
  deviceInfo: text("device_info", { length: 255 }),
  ipAddress: text("ip_address", { length: 45 }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
