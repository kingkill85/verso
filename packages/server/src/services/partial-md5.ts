import { createHash } from "node:crypto";

/**
 * Compute a partial MD5 hash matching KOReader's partial_md5_checksum algorithm.
 *
 * KOReader samples 1024-byte chunks at exponentially increasing offsets:
 * 0, 1KB, 4KB, 16KB, 64KB, 256KB, 1MB, 4MB, 16MB, 64MB, 256MB, 1GB
 * and MD5-hashes the concatenation of those samples.
 *
 * See: koreader/frontend/util.lua — util.partialMD5
 */
export function partialMd5(buffer: Buffer): string {
  const hash = createHash("md5");
  const step = 1024;
  const size = 1024;

  for (let i = -1; i <= 10; i++) {
    // Replicate LuaJIT's bit.lshift(step, 2*i) with 32-bit wraparound
    const shift = ((2 * i) & 0x1f) >>> 0; // mask to 5 bits like LuaJIT
    const offset = ((step << shift) & 0xffffffff) >>> 0; // 32-bit unsigned

    if (offset >= buffer.length) break;

    const end = Math.min(offset + size, buffer.length);
    hash.update(buffer.subarray(offset, end));
  }

  return hash.digest("hex");
}
