import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { hash, compare } from "bcrypt";
import { randomBytes, createHash } from "crypto";
import {
  users,
  sessions,
  registerInput,
  loginInput,
  refreshInput,
  updateProfileInput,
  changePasswordInput,
} from "@verso/shared";
import type { SafeUser } from "@verso/shared";
import {
  router,
  publicProcedure,
  protectedProcedure,
  signAccessToken,
} from "../index.js";
import type { AppDatabase } from "../../db/client.js";
import type { Config } from "../../config.js";

const BCRYPT_ROUNDS = 12;

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  const { passwordHash, oidcProvider, oidcSubject, ...safe } = user;
  return safe;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}

async function createSession(
  db: AppDatabase,
  userId: string,
  config: Config,
  userPayload: { email: string; role: string }
) {
  const refreshToken = randomBytes(32).toString("hex");
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + parseDuration(config.JWT_REFRESH_EXPIRES)
  ).toISOString();

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      refreshTokenHash,
      expiresAt,
    })
    .returning();

  const accessToken = await signAccessToken(
    {
      sub: userId,
      email: userPayload.email,
      role: userPayload.role,
      sessionId: session.id,
    },
    config
  );

  return { accessToken, refreshToken };
}

export const authRouter = router({
  register: publicProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    // Check if this is the first user
    const existingUsers = ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .get();
    const isFirstUser = (existingUsers?.count ?? 0) === 0;

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);

    let newUser: typeof users.$inferSelect;
    try {
      const [inserted] = await ctx.db
        .insert(users)
        .values({
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          role: isFirstUser ? "admin" : "user",
        })
        .returning();
      newUser = inserted;
    } catch (err: any) {
      if (
        err.message?.includes("UNIQUE constraint failed") ||
        err.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already in use",
        });
      }
      throw err;
    }

    const tokens = await createSession(ctx.db, newUser.id, ctx.config, {
      email: newUser.email,
      role: newUser.role,
    });

    return {
      user: toSafeUser(newUser),
      ...tokens,
    };
  }),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const user = ctx.db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .get();

    if (!user || !user.passwordHash) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    const valid = await compare(input.password, user.passwordHash);
    if (!valid) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    // Update last login
    await ctx.db
      .update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id));

    const tokens = await createSession(ctx.db, user.id, ctx.config, {
      email: user.email,
      role: user.role,
    });

    return {
      user: toSafeUser(user),
      ...tokens,
    };
  }),

  refresh: publicProcedure.input(refreshInput).mutation(async ({ ctx, input }) => {
    const tokenHash = hashToken(input.refreshToken);

    const session = ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHash))
      .get();

    if (!session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid refresh token",
      });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await ctx.db.delete(sessions).where(eq(sessions.id, session.id));
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Refresh token expired",
      });
    }

    // Delete old session
    await ctx.db.delete(sessions).where(eq(sessions.id, session.id));

    // Get user
    const user = ctx.db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .get();

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    const tokens = await createSession(ctx.db, user.id, ctx.config, {
      email: user.email,
      role: user.role,
    });

    return tokens;
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.sub))
      .get();

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return toSafeUser(user);
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.sessionId) {
      await ctx.db
        .delete(sessions)
        .where(eq(sessions.id, ctx.user.sessionId));
    }
    return { success: true };
  }),

  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set(input)
        .where(eq(users.id, ctx.user.sub))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return toSafeUser(updated);
    }),

  changePassword: protectedProcedure
    .input(changePasswordInput)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.sub))
        .get();

      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const valid = await compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      const newHash = await hash(input.newPassword, BCRYPT_ROUNDS);
      await ctx.db
        .update(users)
        .set({ passwordHash: newHash })
        .where(eq(users.id, ctx.user.sub));

      return { success: true };
    }),

  hasUsers: publicProcedure.query(async ({ ctx }) => {
    const result = ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .get();
    return { hasUsers: (result?.count ?? 0) > 0 };
  }),
});
