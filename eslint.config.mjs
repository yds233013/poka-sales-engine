import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  {
    // Prisma's generated client is machine-written and not ours to lint.
    ignores: ["src/generated/**", ".next/**", "node_modules/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  ...typescriptConfig,
];

export default eslintConfig;
