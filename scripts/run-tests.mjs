import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.error("Os testes TypeScript exigem Node.js 22.6 ou superior.");
  process.exit(1);
}

const requested = new Set(process.argv.slice(2));
const testsDir = resolve(process.cwd(), "tests");
let files = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => resolve(testsDir, name));

if (requested.size > 0) {
  files = files.filter((file) => {
    const name = file.split(/[\\/]/).pop()?.replace(/\.test\.ts$/, "") ?? "";
    return requested.has(name);
  });
}

if (files.length === 0) {
  console.error("Nenhum teste encontrado para executar.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...files],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
