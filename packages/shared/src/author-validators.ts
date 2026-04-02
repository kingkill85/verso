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

export const authorUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500).optional(),
});

export const authorUpdateDescriptionInput = z.object({
  authorId: z.string().uuid(),
  locale: z.string().min(2).max(10),
  description: z.string(),
});
