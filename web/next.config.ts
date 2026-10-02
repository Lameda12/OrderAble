import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The site is self-contained: lib/orderable is a copy of ../src made by scripts/sync-core.mjs.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
};

export default config;
