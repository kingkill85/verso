import { z } from "zod";

// Smart filter types
export const smartFilterField = z.enum([
  "title", "author", "genre", "tags", "year",
  "language", "fileFormat", "pageCount",
]);

export const smartFilterOp = z.enum([
  "eq", "neq", "contains", "gt", "gte", "lt", "lte", "in",
]);

export const smartFilterCondition = z.object({
  field: smartFilterField,
  op: smartFilterOp,
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const smartFilter = z.object({
  operator: z.enum(["AND", "OR"]),
  conditions: z.array(smartFilterCondition).min(1),
});

export type SmartFilter = z.infer<typeof smartFilter>;
export type SmartFilterCondition = z.infer<typeof smartFilterCondition>;

// Shelf CRUD inputs
export const shelfCreateInput = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().max(10).optional(),
  description: z.string().max(500).optional(),
  isSmart: z.boolean().default(false),
  smartFilter: smartFilter.optional(),
}).refine(
  (data) => !data.isSmart || data.smartFilter !== undefined,
  { message: "Smart shelves require a filter", path: ["smartFilter"] }
);

export const shelfUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().max(10).optional(),
  description: z.string().max(500).optional(),
  smartFilter: smartFilter.optional(),
});

export const shelfByIdInput = z.object({
  id: z.string().uuid(),
});

export const shelfReorderInput = z.object({
  shelfIds: z.array(z.string().uuid()),
});

export const shelfBookInput = z.object({
  shelfId: z.string().uuid(),
  bookId: z.string().uuid(),
});

// Search input
export const searchInput = z.object({
  query: z.string().min(1),
  genre: z.string().optional(),
  author: z.string().optional(),
  format: z.enum(["epub", "pdf", "mobi"]).optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
