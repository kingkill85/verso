import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { SignJWT, jwtVerify } from "jose";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";
import type { TokenPayload } from "@verso/shared";

export type AppContext = {
  db: AppDatabase;
  config: Config;
  storage: StorageService;
  user: TokenPayload | null;
};

export function createContextFactory(db: AppDatabase, config: Config, storage: StorageService) {
  return async ({ req }: CreateFastifyContextOptions): Promise<AppContext> => {
    let user: TokenPayload | null = null;
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const secret = new TextEncoder().encode(config.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        if (payload.type === "access") {
          user = payload as unknown as TokenPayload;
        }
      } catch {
        // Invalid token — user stays null
      }
    }

    return { db, config, storage, user };
  };
}

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// JWT helpers
export async function signAccessToken(
  payload: Omit<TokenPayload, "type">,
  config: Config
): Promise<string> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(config.JWT_ACCESS_EXPIRES)
    .setIssuedAt()
    .sign(secret);
}

export async function signRefreshToken(
  payload: Omit<TokenPayload, "type">,
  config: Config
): Promise<string> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(config.JWT_REFRESH_EXPIRES)
    .setIssuedAt()
    .sign(secret);
}
