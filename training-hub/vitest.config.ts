import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The resolver/db modules use server-only Supabase clients, so any test
    // that imports them needs the env vars set. Tests for pure modules
    // (date-parse, name-match parsers, training-match preprocessors, tiers)
    // do not, and we keep them isolated under src/lib/**/__tests__/.
  },
});
