import { z } from "zod";

export const genreListInput = z.object({
  search: z.string().optional(),
});

export const genreCreateInput = z.object({
  name: z.string().min(1).max(200),
});

export const genreUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
});

export const genreDeleteInput = z.object({
  id: z.string().uuid(),
});

export const genreMergeInput = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});
