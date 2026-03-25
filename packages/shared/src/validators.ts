import { z } from "zod";

// Auth
export const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
});

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshInput = z.object({
  refreshToken: z.string(),
});

// Books
export const bookListInput = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  author: z.string().optional(),
  format: z.enum(["epub", "pdf", "mobi"]).optional(),
  sort: z
    .enum(["title", "author", "recent"])
    .optional()
    .default("recent"),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const bookByIdInput = z.object({
  id: z.string().uuid(),
});

export const bookUpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  isbn: z.string().max(20).nullable().optional(),
  publisher: z.string().max(255).nullable().optional(),
  year: z.number().int().nullable().optional(),
  language: z.string().max(10).nullable().optional(),
  description: z.string().nullable().optional(),
  genre: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).optional(),
  series: z.string().max(255).nullable().optional(),
  seriesIndex: z.number().nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  coverUrl: z.string().url().optional(),
});

export const bookDeleteInput = z.object({
  id: z.string().uuid(),
});

// Profile
export const updateProfileInput = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

export const changePasswordInput = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

// Progress
export const progressGetInput = z.object({
  bookId: z.string().uuid(),
});

export const progressSyncInput = z.object({
  bookId: z.string().uuid(),
  percentage: z.number().min(0).max(100),
  cfiPosition: z.string().optional(),
  currentPage: z.number().int().min(0).optional(),
  timeSpentMinutes: z.number().min(0).optional(),
});
