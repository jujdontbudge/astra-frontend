import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the built site works on any static host or subpath
// (Vercel, Netlify, GitHub Pages, S3, file preview, etc.).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
