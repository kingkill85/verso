import { z } from "zod";

export const metadataSearchInput = z.object({
  bookId: z.string().uuid(),
  query: z.string().min(1).optional(),
});

export const metadataApplyFields = z.object({
  title: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  genre: z.string().max(100).optional(),
  publisher: z.string().max(255).optional(),
  year: z.number().int().optional(),
  isbn: z.string().max(20).optional(),
  language: z.string().max(10).optional(),
  pageCount: z.number().int().positive().optional(),
  series: z.string().max(255).optional(),
  seriesIndex: z.number().optional(),
  coverUrl: z.string().url().optional(),
});

export const metadataApplyInput = z.object({
  bookId: z.string().uuid(),
  fields: metadataApplyFields,
  source: z.enum(["google", "openlibrary"]).optional(),
});

export type MetadataApplyFields = z.infer<typeof metadataApplyFields>;
