import { z } from "zod";

export const authorListInput = z.object({
  search: z.string().optional(),
});

export const authorByIdInput = z.object({
  id: z.string().uuid(),
});

export const authorRefreshInput = z.object({
  id: z.string().uuid(),
});
