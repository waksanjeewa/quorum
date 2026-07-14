#!/usr/bin/env node
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const packagesDir = join(root, "packages");

async function remove(path) {
  await rm(path, { recursive: true, force: true });
}

await remove(join(root, "node_modules", ".cache"));
await remove(join(root, "tsconfig.tsbuildinfo"));

for (const entry of await readdir(packagesDir, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isDirectory()) continue;
  const dir = join(packagesDir, entry.name);
  await remove(join(dir, "dist"));
  await remove(join(dir, "tsconfig.tsbuildinfo"));
}
