import { mkdir, writeFile, readFile, unlink, stat, rm } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { Readable } from "node:stream";
import type { Config } from "../config.js";

export class StorageService {
  private basePath: string;

  constructor(config: Config) {
    this.basePath = config.STORAGE_PATH;
  }

  private resolvePath(relativePath: string): string {
    if (relativePath.startsWith("/")) {
      throw new Error("Path traversal detected");
    }
    const fullPath = resolve(this.basePath, relativePath);
    if (!fullPath.startsWith(resolve(this.basePath))) {
      throw new Error("Path traversal detected");
    }
    return fullPath;
  }

  async put(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async get(relativePath: string): Promise<Buffer> {
    const fullPath = this.resolvePath(relativePath);
    return readFile(fullPath);
  }

  stream(relativePath: string): Readable {
    const fullPath = this.resolvePath(relativePath);
    return createReadStream(fullPath);
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await unlink(fullPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(relativePath);
    return existsSync(fullPath);
  }

  async size(relativePath: string): Promise<number> {
    const fullPath = this.resolvePath(relativePath);
    const s = await stat(fullPath);
    return s.size;
  }

  fullPath(relativePath: string): string {
    return this.resolvePath(relativePath);
  }

  async removeDir(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    try {
      await rm(fullPath, { recursive: true });
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}
