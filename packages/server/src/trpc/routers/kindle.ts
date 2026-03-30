import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index.js";
import {
  smtpSettings,
  smtpSettingsSaveInput,
  smtpTestInput,
  sendBookInput,
  books,
} from "@verso/shared";
import {
  encryptPassword,
  testSmtpConnection,
  sendBookToKindle,
} from "../../services/kindle.js";

export const kindleRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db
      .select({
        provider: smtpSettings.provider,
        host: smtpSettings.host,
        port: smtpSettings.port,
        username: smtpSettings.username,
        encryption: smtpSettings.encryption,
        kindleEmail: smtpSettings.kindleEmail,
      })
      .from(smtpSettings)
      .where(eq(smtpSettings.userId, ctx.user.sub))
      .get();

    return settings ?? null;
  }),

  saveSettings: protectedProcedure
    .input(smtpSettingsSaveInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: smtpSettings.id, encryptedPassword: smtpSettings.encryptedPassword })
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, ctx.user.sub))
        .get();

      const now = new Date().toISOString();

      let encrypted: string;
      if (input.password) {
        encrypted = await encryptPassword(input.password, ctx.config.JWT_SECRET);
      } else if (existing) {
        encrypted = existing.encryptedPassword;
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Password is required for initial setup",
        });
      }

      if (existing) {
        await ctx.db
          .update(smtpSettings)
          .set({
            provider: input.provider,
            host: input.host,
            port: input.port,
            username: input.username,
            encryptedPassword: encrypted,
            encryption: input.encryption,
            kindleEmail: input.kindleEmail,
            updatedAt: now,
          })
          .where(eq(smtpSettings.id, existing.id));
      } else {
        await ctx.db.insert(smtpSettings).values({
          userId: ctx.user.sub,
          provider: input.provider,
          host: input.host,
          port: input.port,
          username: input.username,
          encryptedPassword: encrypted,
          encryption: input.encryption,
          kindleEmail: input.kindleEmail,
        });
      }

      return { success: true };
    }),

  deleteSettings: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(smtpSettings)
      .where(eq(smtpSettings.userId, ctx.user.sub));
    return { success: true };
  }),

  testConnection: protectedProcedure
    .input(smtpTestInput)
    .mutation(async ({ input }) => {
      try {
        await testSmtpConnection({
          host: input.host,
          port: input.port,
          username: input.username,
          password: input.password,
          encryption: input.encryption,
        });
        return { success: true, message: "Connection successful" };
      } catch (err: any) {
        const message =
          err.code === "EAUTH"
            ? "Authentication failed — check your app password"
            : err.code === "ECONNECTION" || err.code === "ETIMEDOUT"
              ? "Could not connect — check host, port, and encryption settings"
              : `Connection failed: ${err.message}`;
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  sendBook: protectedProcedure
    .input(sendBookInput)
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db
        .select()
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, ctx.user.sub))
        .get();

      if (!settings) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "SMTP settings not configured. Set up Send to Kindle in Account settings.",
        });
      }

      const book = await ctx.db
        .select()
        .from(books)
        .where(eq(books.id, input.bookId))
        .get();

      if (!book) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      if (book.fileSize > 50 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "File exceeds Amazon's 50MB attachment limit",
        });
      }

      const fileBuffer = await ctx.storage.get(book.filePath);
      const fileName = `${book.title}.${book.fileFormat}`;

      try {
        await sendBookToKindle({
          host: settings.host,
          port: settings.port,
          username: settings.username,
          encryptedPassword: settings.encryptedPassword,
          encryption: settings.encryption,
          kindleEmail: settings.kindleEmail,
          jwtSecret: ctx.config.JWT_SECRET,
          bookTitle: book.title,
          bookAuthor: book.author,
          fileName,
          fileBuffer,
        });
      } catch (err: any) {
        const message =
          err.code === "EAUTH"
            ? "Authentication failed — check your app password in Account settings"
            : `Failed to send email: ${err.message}`;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }

      return { success: true };
    }),
});
