import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryName =
  process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "workout-tracker";
const base = process.env.GITHUB_ACTIONS ? `/${repositoryName}/` : "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
    },
  },
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
});
