import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
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
