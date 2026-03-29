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
});

export const koinsightStatInput = z.object({
  md5: z.string().min(1),
  page: z.number().int(),
  start_time: z.number().int(),
  duration: z.number().int(),
  total_pages: z.number().int(),
});

export const koinsightAnnotationInput = z.object({
  chapter: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  page: z.number().int(),
  type: z.string().default("highlight"),
});

export const koinsightImportInput = z.object({
  version: z.string().min(1),
  device_id: z.string().min(1),
  books: z.array(koinsightBookInput),
  stats: z.array(koinsightStatInput),
  annotations: z.record(z.string(), z.array(koinsightAnnotationInput)),
});
