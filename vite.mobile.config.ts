import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(projectRoot, "mobile"),
  publicDir: path.resolve(projectRoot, "public"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: path.resolve(projectRoot, "mobile-dist"),
    emptyOutDir: true,
  },
});
