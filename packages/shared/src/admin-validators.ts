import { z } from "zod";

export const adminCreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: z.enum(["admin", "user"]),
});

export const adminUpdateRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
});

export const adminDeleteUserInput = z.object({
  userId: z.string().uuid(),
});

export const activityLogInput = z.object({
  type: z.string().optional(),
  level: z.string().optional(),
  limit: z.number().min(1).max(500).default(100),
  offset: z.number().min(0).default(0),
});
