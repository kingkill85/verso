import { z } from "zod";

export const metadataSearchInput = z.object({
  bookId: z.string().uuid(),
  query: z.string().min(1).optional(),
});

export const metadataApplyFields = z.object({
  title: z.string().min(1).max(500).nullable().optional(),
  author: z.string().min(1).max(500).nullable().optional(),
  description: z.string().nullable().optional(),
  genre: z.string().max(100).nullable().optional(),
  publisher: z.string().max(255).nullable().optional(),
  year: z.number().int().nullable().optional(),
  isbn: z.string().max(20).nullable().optional(),
  language: z.string().max(10).nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  series: z.string().max(255).nullable().optional(),
  seriesIndex: z.number().nullable().optional(),
  coverUrl: z.string().url().optional(),
});

export const metadataApplyInput = z.object({
  bookId: z.string().uuid(),
  fields: metadataApplyFields,
  source: z.enum(["google", "openlibrary"]).optional(),
});

export type MetadataApplyFields = z.infer<typeof metadataApplyFields>;
