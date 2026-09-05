// scripts/build-setup-wizard.mjs — 编译 scripts/setup-wizard.ts → dist/
import * as esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [resolve(root, "scripts/setup-wizard.ts")],
  outdir: resolve(root, "dist"),
  platform: "node",
  format: "esm",
  sourcemap: true,
  packages: "external",
});

console.log("✔ setup-wizard.ts compiled");
