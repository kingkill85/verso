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
  isbn: z.string().max(20).optional(),
  publisher: z.string().max(255).optional(),
  year: z.number().int().optional(),
  language: z.string().max(10).optional(),
  description: z.string().optional(),
  genre: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
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
