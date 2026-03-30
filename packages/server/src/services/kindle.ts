import { createCipheriv, createDecipheriv, randomBytes, hkdf } from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";

const hkdfAsync = promisify(hkdf);

async function deriveKey(jwtSecret: string): Promise<Buffer> {
  const derived = await hkdfAsync("sha256", jwtSecret, "", "smtp-encryption", 32);
  return Buffer.from(derived);
}

export async function encryptPassword(plaintext: string, jwtSecret: string): Promise<string> {
  const key = await deriveKey(jwtSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function decryptPassword(encrypted: string, jwtSecret: string): Promise<string> {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  const key = await deriveKey(jwtSecret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function testSmtpConnection(settings: {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: string;
}): Promise<void> {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.encryption === "ssl",
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    ...(settings.encryption === "starttls" ? { requireTLS: true } : {}),
  });
  await transport.verify();
  transport.close();
}

export async function sendBookToKindle(options: {
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  encryption: string;
  kindleEmail: string;
  jwtSecret: string;
  bookTitle: string;
  bookAuthor: string;
  fileName: string;
  fileBuffer: Buffer;
}): Promise<void> {
  const password = await decryptPassword(options.encryptedPassword, options.jwtSecret);

  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.encryption === "ssl",
    auth: {
      user: options.username,
      pass: password,
    },
    ...(options.encryption === "starttls" ? { requireTLS: true } : {}),
  });

  await transport.sendMail({
    from: options.username,
    to: options.kindleEmail,
    subject: `Your Book from Verso: ${options.bookTitle}`,
    text: `"${options.bookTitle}" by ${options.bookAuthor} — sent from Verso`,
    attachments: [
      {
        filename: options.fileName,
        content: options.fileBuffer,
      },
    ],
  });

  transport.close();
}
