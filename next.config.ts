import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it the bundler walks up
  // looking for a lockfile and can latch onto an unrelated one further up the
  // filesystem, which produces a confusing warning on a fresh clone.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },

  // Next writes AGENTS.md / CLAUDE.md into the repo on dev start. This project
  // documents itself in README.md and docs/, so it does not need them.
  agentRules: false,

  // Prisma's generated client does dynamic filesystem access at runtime, which
  // the bundler cannot trace. Keeping it external is the supported arrangement
  // and removes the build warnings it otherwise produces.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
