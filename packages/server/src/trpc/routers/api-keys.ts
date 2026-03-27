import { router, protectedProcedure } from "../index.js";
import { createApiKeyInput, deleteApiKeyInput } from "@verso/shared";
import { createApiKey, listApiKeys, revokeApiKey } from "../../services/api-keys.js";

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listApiKeys(ctx.db, ctx.user.sub);
  }),

  create: protectedProcedure.input(createApiKeyInput).mutation(async ({ ctx, input }) => {
    const result = await createApiKey(
      ctx.db,
      ctx.user.sub,
      input.name,
      input.scopes,
      input.expiresAt,
    );
    return { id: result.apiKey.id, plainKey: result.plainKey, name: result.apiKey.name };
  }),

  revoke: protectedProcedure.input(deleteApiKeyInput).mutation(async ({ ctx, input }) => {
    await revokeApiKey(ctx.db, ctx.user.sub, input.id);
    return { success: true };
  }),
});
