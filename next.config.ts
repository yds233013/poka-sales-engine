import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's generated client does dynamic filesystem access at runtime, which
  // the bundler cannot trace. Keeping it external is the supported arrangement
  // and removes the build warnings it otherwise produces.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
