import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@stncil/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@stncil/runtime": fileURLToPath(new URL("../runtime/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
