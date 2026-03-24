import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { users, books, sessions } from "./schema.js";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Book = InferSelectModel<typeof books>;
export type NewBook = InferInsertModel<typeof books>;
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type SafeUser = Omit<User, "passwordHash" | "oidcProvider" | "oidcSubject">;

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
};

export type TokenPayload = {
  sub: string;
  email: string;
  role: string;
  type: "access" | "refresh";
  sessionId?: string;
};
