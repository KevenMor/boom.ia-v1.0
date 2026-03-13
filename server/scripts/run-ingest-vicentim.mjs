#!/usr/bin/env node
/**
 * Wrapper para ingest:vicentim que aplica --max-old-space-size ao processo filho.
 * tsx pode spawnar subprocesso que não herda as flags do node pai.
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxCli = path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(__dirname, "ingest-vicentim-website.ts");

const result = spawnSync(
  process.execPath,
  ["--max-old-space-size=8192", "--expose-gc", tsxCli, script],
  {
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  }
);

process.exit(result.status ?? 1);
