import { z } from "zod";

export const annotationListInput = z.object({
  bookId: z.string().uuid(),
});

export const annotationCreateInput = z.object({
  bookId: z.string().uuid(),
  type: z.enum(["highlight", "bookmark"]).default("highlight"),
  content: z.string().optional(),
  note: z.string().optional(),
  cfiPosition: z.string(),
  cfiEnd: z.string().optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).default("yellow"),
  chapter: z.string().max(255).optional(),
});

export const annotationUpdateInput = z.object({
  id: z.string().uuid(),
  note: z.string().optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

export const annotationDeleteInput = z.object({
  id: z.string().uuid(),
});

export const bookmarkCreateInput = z.object({
  bookId: z.string().uuid(),
  cfiPosition: z.string(),
  chapter: z.string().max(255).optional(),
  percentage: z.number().min(0).max(100).optional(),
});

export const bookmarkListInput = z.object({
  bookId: z.string().uuid(),
});
