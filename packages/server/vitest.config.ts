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
        "src/services/epub-parser.ts",
        "src/services/pdf-parser.ts",
        "src/db/**",
        "src/test-utils.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
