import { createHash } from "node:crypto";
import { hash } from "bcrypt";
import { eq } from "drizzle-orm";
import { users, appPasswordSetInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const appPasswordRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db
      .select({ appPasswordHash: users.appPasswordHash })
      .from(users)
      .where(eq(users.id, ctx.user.sub))
      .get();
    return { hasPassword: !!user?.appPasswordHash };
  }),

  set: protectedProcedure.input(appPasswordSetInput).mutation(async ({ ctx, input }) => {
    const appPasswordHash = await hash(input.password, 10);
    const appPasswordMd5 = createHash("md5").update(input.password).digest("hex");

    await ctx.db
      .update(users)
      .set({ appPasswordHash, appPasswordMd5 })
      .where(eq(users.id, ctx.user.sub));

    return { success: true };
  }),

  clear: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({ appPasswordHash: null, appPasswordMd5: null })
      .where(eq(users.id, ctx.user.sub));

    return { success: true };
  }),
});
