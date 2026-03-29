import { z } from "zod";

export const koinsightDeviceInput = z.object({
  version: z.string().min(1),
  id: z.string().min(1),
  model: z.string().min(1),
});

export const koinsightBookInput = z.object({
  md5: z.string().min(1),
  title: z.string(),
  authors: z.string(),
  pages: z.number().int(),
  // Extra fields from plugin (accepted but not required)
  id: z.number().int().optional(),
  notes: z.number().int().optional(),
  last_open: z.string().optional(),
  highlights: z.number().int().optional(),
  series: z.string().optional(),
  language: z.string().optional(),
  total_read_time: z.number().optional(),
  total_read_pages: z.number().int().optional(),
});

export const koinsightStatInput = z.object({
  book_md5: z.string().min(1),
  page: z.number().int(),
  start_time: z.number().int(),
  duration: z.number().int(),
  total_pages: z.number().int(),
  device_id: z.string().optional(),
});

export const koinsightAnnotationInput = z.object({
  chapter: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  page: z.union([z.number(), z.string()]),
  type: z.string().default("highlight"),
  // Extra fields from plugin
  datetime: z.string().optional(),
  drawer: z.string().optional(),
  color: z.string().optional(),
  pageno: z.union([z.number(), z.string()]).optional(),
  total_pages: z.number().int().optional(),
  pos0: z.string().optional(),
  pos1: z.string().optional(),
  datetime_updated: z.string().optional(),
});

export const koinsightImportInput = z.object({
  version: z.string().min(1),
  device_id: z.string().optional(),
  books: z.array(koinsightBookInput),
  stats: z.array(koinsightStatInput),
  annotations: z.record(z.string(), z.array(koinsightAnnotationInput)),
});
