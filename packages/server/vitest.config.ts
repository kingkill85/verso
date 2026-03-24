import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/app.ts",
        "src/routes/**",
        "src/middleware/**",
        "src/services/epub-parser.ts",
        "src/services/pdf-parser.ts",
        "src/db/**",
        "src/test-utils.ts",
      ],
    },
  },
});
