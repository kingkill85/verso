import { z } from "zod";

export const smtpProvider = z.enum(["gmail", "outlook", "icloud", "yahoo", "custom"]);

export const smtpEncryption = z.enum(["ssl", "starttls", "none"]);

export const kindleEmailSchema = z
  .string()
  .email()
  .refine((email) => email.includes("kindle"), {
    message: "Must be a Kindle email address (e.g. name@kindle.com)",
  });

export const smtpSettingsSaveInput = z.object({
  provider: smtpProvider,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  password: z.string().min(1).optional(),
  encryption: smtpEncryption,
  kindleEmail: kindleEmailSchema,
});

export type SmtpSettingsSaveInput = z.infer<typeof smtpSettingsSaveInput>;

export const smtpTestInput = z.object({
  provider: smtpProvider,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  password: z.string().min(1),
  encryption: smtpEncryption,
  kindleEmail: kindleEmailSchema,
});

export type SmtpTestInput = z.infer<typeof smtpTestInput>;

export const sendBookInput = z.object({
  bookId: z.string().uuid(),
});
