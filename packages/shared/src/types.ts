import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { users, books, sessions, readingProgress, shelves, shelfBooks, annotations, metadataCache } from "./schema.js";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Book = InferSelectModel<typeof books>;
export type NewBook = InferInsertModel<typeof books>;
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;
export type ReadingProgress = InferSelectModel<typeof readingProgress>;
export type NewReadingProgress = InferInsertModel<typeof readingProgress>;
export type Shelf = InferSelectModel<typeof shelves>;
export type NewShelf = InferInsertModel<typeof shelves>;
export type ShelfBook = InferSelectModel<typeof shelfBooks>;
export type NewShelfBook = InferInsertModel<typeof shelfBooks>;

export type SafeUser = Omit<User, "passwordHash" | "oidcProvider" | "oidcSubject">;

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
};

export type Annotation = InferSelectModel<typeof annotations>;
export type NewAnnotation = InferInsertModel<typeof annotations>;
export type MetadataCache = InferSelectModel<typeof metadataCache>;

export type ExternalBook = {
  source: "google" | "openlibrary";
  sourceId: string;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  description?: string;
  genre?: string;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  series?: string;
  seriesIndex?: number;
  confidence: number;
};

export type TokenPayload = {
  sub: string;
  email: string;
  role: string;
  type: "access" | "refresh";
  sessionId?: string;
};
