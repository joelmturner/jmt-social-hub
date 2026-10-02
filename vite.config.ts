import contentCollections from "@content-collections/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
	plugins: [
		devtools(),
		contentCollections(),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
	// cloudinary is Node-only; keep it out of client optimizeDeps / prebundling
	optimizeDeps: {
		exclude: ["cloudinary"],
	},
	ssr: {
		external: ["cloudinary"],
	},
});

export default config;
