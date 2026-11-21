import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	plugins: [
		react(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			// Icons in every size, generated from the logo at build time.
			pwaAssets: { image: "public/logo.svg" },
			manifest: {
				name: "FieldSync",
				short_name: "FieldSync",
				description: "Work orders that keep working offline.",
				theme_color: "#0f7a5c",
				background_color: "#111614",
				display: "standalone",
			},
			workbox: {
				// Any screen opens offline; API calls always go to the network.
				navigateFallback: "/index.html",
				navigateFallbackDenylist: [/^\/api\//],
				globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
			},
		}),
	],
	// `vite preview` reuses this proxy, so the built app runs against a local API too.
	server: {
		// The API runs on its own port in development; same origin for the app.
		proxy: {
			"/api": {
				target: process.env.FIELDSYNC_API ?? "http://127.0.0.1:3000",
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
});
