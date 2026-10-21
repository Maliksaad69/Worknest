import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": templateRoot,
      "@shared": path.resolve(templateRoot, "shared"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    testTimeout: 20000,
  },
});
