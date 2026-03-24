import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Readable } from "node:stream";
import type { Config } from "../config.js";

export class StorageService {
  private basePath: string;

  constructor(config: Config) {
    this.basePath = config.STORAGE_PATH;
  }

  async put(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async get(relativePath: string): Promise<Buffer> {
    const fullPath = join(this.basePath, relativePath);
    return readFile(fullPath);
  }

  stream(relativePath: string): Readable {
    const fullPath = join(this.basePath, relativePath);
    return createReadStream(fullPath);
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    try {
      await unlink(fullPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = join(this.basePath, relativePath);
    return existsSync(fullPath);
  }

  async size(relativePath: string): Promise<number> {
    const fullPath = join(this.basePath, relativePath);
    const s = await stat(fullPath);
    return s.size;
  }

  fullPath(relativePath: string): string {
    return join(this.basePath, relativePath);
  }
}
