// Bundle the CLI into a single self-contained file for publishing, so `npm i -g quorum` needs no
// workspace packages. @quorum/* (and deps like zod/yaml) are inlined; node built-ins and the OPTIONAL
// agent SDKs stay external (lazy-loaded, installed as optionalDependencies).
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "packages/cli/dist/index.js");

await build({
  entryPoints: [join(root, "packages/cli/src/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@anthropic-ai/claude-agent-sdk", "@openai/codex-sdk"],
  logLevel: "info",
});

// Post-process: guarantee the shebang is line 1, and provide `require`/__dirname for any bundled CJS
// dep (e.g. yaml calls require("process")) since ESM has no built-in require.
let code = await readFile(outfile, "utf8");
code = code.replace(/^#![^\n]*\n/, ""); // drop the entry's preserved shebang (re-added below, first)
const header =
  "#!/usr/bin/env node\n" +
  "import { createRequire as __createRequire } from 'node:module';\n" +
  "import { fileURLToPath as __fileURLToPath } from 'node:url';\n" +
  "import { dirname as __dirname_fn } from 'node:path';\n" +
  "const require = __createRequire(import.meta.url);\n" +
  "const __filename = __fileURLToPath(import.meta.url);\n" +
  "const __dirname = __dirname_fn(__filename);\n";
await writeFile(outfile, header + code, "utf8");

console.log("✓ bundled packages/cli/dist/index.js (self-contained)");
