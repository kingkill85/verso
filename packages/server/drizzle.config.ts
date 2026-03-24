import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../shared/src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./data/db.sqlite",
  },
});
