import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed || trimmed === "./") return "./";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export default defineConfig({
  base: normalizeBase(process.env.OPENCLAW_CONTROL_UI_BASE_PATH) ?? "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
    },
  },
  build: {
    outDir: path.resolve(here, "../dist/control-ui-next"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
});
