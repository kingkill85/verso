import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { hash } from "bcrypt";
import {
  users,
  sessions,
  adminCreateUserInput,
  adminUpdateRoleInput,
  adminDeleteUserInput,
} from "@verso/shared";
import type { SafeUser } from "@verso/shared";
import { router, adminProcedure } from "../index.js";
import { seedDefaultShelves } from "./seed-shelves.js";

const BCRYPT_ROUNDS = 12;

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  const { passwordHash, oidcProvider, oidcSubject, ...safe } = user;
  return safe;
}

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const allUsers = await ctx.db
      .select()
      .from(users)
      .orderBy(users.createdAt);
    return allUsers.map(toSafeUser);
  }),

  createUser: adminProcedure
    .input(adminCreateUserInput)
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hash(input.password, BCRYPT_ROUNDS);

      let newUser: typeof users.$inferSelect;
      try {
        const [inserted] = await ctx.db
          .insert(users)
          .values({
            email: input.email,
            displayName: input.displayName,
            passwordHash,
            role: input.role,
          })
          .returning();
        newUser = inserted;
        await seedDefaultShelves(ctx.db, newUser.id);
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

      return toSafeUser(newUser);
    }),

  updateRole: adminProcedure
    .input(adminUpdateRoleInput)
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.sub) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change your own role",
        });
      }

      const user = ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [updated] = await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId))
        .returning();

      return toSafeUser(updated);
    }),

  deleteUser: adminProcedure
    .input(adminDeleteUserInput)
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.sub) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete your own account",
        });
      }

      const user = ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Delete sessions first, then user (cascades handle rest)
      await ctx.db.delete(sessions).where(eq(sessions.userId, input.userId));
      await ctx.db.delete(users).where(eq(users.id, input.userId));

      return { success: true };
    }),
});
