import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
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
        "src/services/calibre.ts",
        "src/services/metadata-enrichment.ts",
        "src/services/library-import.ts",
        "src/db/**",
        "src/test-utils.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
