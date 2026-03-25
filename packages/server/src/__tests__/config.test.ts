import { describe, it, expect, afterEach, vi } from "vitest";

describe("loadConfig", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("parses valid config from env", async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: "a-test-secret-that-is-at-least-32-characters-long",
      PORT: "4000",
      DATABASE_URL: "file:./test.db",
    };

    // Dynamic import to pick up new env
    const { loadConfig } = await import("../config.js");
    const config = loadConfig();

    expect(config.JWT_SECRET).toBe("a-test-secret-that-is-at-least-32-characters-long");
    expect(config.PORT).toBe(4000);
    expect(config.DATABASE_URL).toBe("file:./test.db");
  });

  it("applies default values", async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: "a-test-secret-that-is-at-least-32-characters-long",
    };

    const { loadConfig } = await import("../config.js");
    const config = loadConfig();

    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.DB_DRIVER).toBe("sqlite");
    expect(config.STORAGE_DRIVER).toBe("local");
    expect(config.AUTH_MODE).toBe("both");
    expect(config.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(config.NODE_ENV).toBe("test"); // vitest sets NODE_ENV=test
  });

  it("exits when JWT_SECRET is missing", async () => {
    process.env = { ...originalEnv };
    delete process.env.JWT_SECRET;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { loadConfig } = await import("../config.js");

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
  });
});
