import { z } from "zod";

export const statsRangeInput = z.object({
  range: z.enum(["week", "month", "year", "all"]),
});

export const statsReadingLogInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const opdsBrowseInput = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const opdsImportInput = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  entries: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      author: z.string().optional(),
      acquisitionUrl: z.string().url(),
      coverUrl: z.string().url().optional(),
      format: z.string().optional(),
    })
  ),
});
