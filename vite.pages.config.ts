import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));
const outputDirectory = resolve(projectRoot, "docs");

export default defineConfig({
  root: resolve(projectRoot, "pages"),
  base: "/circuit-class-lab/",
  publicDir: resolve(projectRoot, "public"),
  resolve: { alias: { "@": projectRoot } },
  define: {
    __CIRCUIT_API_ORIGIN__: JSON.stringify("https://circuit-class-lab-k8m4.tangyperch6.chatgpt.site"),
    __CIRCUIT_BASE_PATH__: JSON.stringify("/circuit-class-lab/"),
  },
  css: { postcss: projectRoot },
  plugins: [
    react(),
    {
      name: "github-pages-nojekyll",
      closeBundle() { writeFileSync(resolve(outputDirectory, ".nojekyll"), ""); },
    },
  ],
  build: { outDir: outputDirectory, emptyOutDir: true },
});
