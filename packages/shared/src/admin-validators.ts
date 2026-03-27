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
