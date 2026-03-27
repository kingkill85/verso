import { z } from "zod";

export const createApiKeyInput = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(["opds", "api"])).min(1),
  expiresAt: z.string().datetime().optional(),
});

export const deleteApiKeyInput = z.object({
  id: z.string().uuid(),
});
