import { sqliteTable, text, integer, real, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
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
  appPasswordHash: text("app_password_hash"),
  appPasswordMd5: text("app_password_md5", { length: 32 }),
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
  md5Hash: text("md5_hash", { length: 32 }),
  pageCount: integer("page_count"),
  addedBy: text("added_by")
    .notNull()
    .references(() => users.id),
  metadataSource: text("metadata_source", { length: 20 }),
  metadataLocked: integer("metadata_locked", { mode: "boolean" }).default(false),
  series: text("series", { length: 255 }),
  seriesIndex: real("series_index"),
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

export const readingProgress = sqliteTable("reading_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  currentPage: integer("current_page"),
  totalPages: integer("total_pages"),
  percentage: real("percentage").notNull().default(0),
  cfiPosition: text("cfi_position"),
  kosyncProgress: text("kosync_progress"),
  startedAt: text("started_at"),
  lastReadAt: text("last_read_at"),
  finishedAt: text("finished_at"),
  timeSpentMinutes: integer("time_spent_minutes").default(0),
  deviceId: text("device_id").references(() => devices.id, { onDelete: "cascade" }),
});

export const shelves = sqliteTable("shelves", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name", { length: 100 }).notNull(),
  description: text("description"),
  emoji: text("emoji", { length: 10 }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isSmart: integer("is_smart", { mode: "boolean" }).default(false),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  smartFilter: text("smart_filter"),
  position: integer("position").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const shelfBooks = sqliteTable("shelf_books", {
  shelfId: text("shelf_id")
    .notNull()
    .references(() => shelves.id, { onDelete: "cascade" }),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  addedAt: text("added_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.shelfId, table.bookId] }),
]);

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  type: text("type", { length: 20 }).notNull().default("highlight"),
  content: text("content"),
  note: text("note"),
  cfiPosition: text("cfi_position"),
  cfiEnd: text("cfi_end"),
  color: text("color", { length: 20 }).default("yellow"),
  chapter: text("chapter", { length: 255 }),
  pageNumber: text("page_number"),
  deviceId: text("device_id").references(() => devices.id, { onDelete: "cascade" }),
  source: text("source", { length: 20 }).default("web"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const readingSessions = sqliteTable("reading_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  deviceId: text("device_id").references(() => devices.id, { onDelete: "cascade" }),
  source: text("source", { length: 20 }).default("web"),
  bookTitle: text("book_title"),
});

export const metadataCache = sqliteTable("metadata_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  queryKey: text("query_key", { length: 255 }).notNull(),
  source: text("source", { length: 20 }).notNull(),
  data: text("data").notNull(),
  fetchedAt: text("fetched_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("metadata_cache_query_source_idx").on(table.queryKey, table.source),
]);


export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name", { length: 255 }),
  model: text("model", { length: 255 }),
  lastSeen: text("last_seen").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const kosyncProgress = sqliteTable("kosync_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentHash: text("document_hash", { length: 32 }).notNull(),
  progress: text("progress").notNull(),
  percentage: real("percentage").notNull(),
  deviceId: text("device_id").notNull(), // No FK — device may not be registered yet when kosync sends progress
  device: text("device", { length: 255 }),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("kosync_progress_user_doc_idx").on(table.userId, table.documentHash),
]);

export const pageStats = sqliteTable("page_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
  bookMd5: text("book_md5").notNull(),
  deviceId: text("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  page: integer("page").notNull(),
  startTime: integer("start_time").notNull(),
  duration: integer("duration").notNull(),
  totalPages: integer("total_pages").notNull(),
}, (table) => [
  uniqueIndex("page_stats_dedup_idx").on(table.deviceId, table.bookMd5, table.page, table.startTime),
]);

export const smtpSettings = sqliteTable("smtp_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  provider: text("provider", { length: 20 }).notNull().default("custom"),
  host: text("host", { length: 255 }).notNull(),
  port: integer("port").notNull(),
  username: text("username", { length: 255 }).notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  encryption: text("encryption", { length: 10 }).notNull().default("ssl"),
  kindleEmail: text("kindle_email", { length: 255 }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const activityLog = sqliteTable("activity_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  userId: text("user_id"),
  bookId: text("book_id"),
  bookTitle: text("book_title"),
  details: text("details"),
  level: text("level").notNull().default("info"),
  createdAt: text("created_at").notNull(),
});

export const bookHashes = sqliteTable("book_hashes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  md5Hash: text("md5_hash", { length: 32 }).notNull(),
  createdAt: text("created_at").notNull(),
});
