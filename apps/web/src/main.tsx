import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { openWorkspace } from "./app/workspace.ts";
import "./i18n/index.ts";
import "./lib/theme.ts";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

const { db, session } = await openWorkspace();
// Only Team and Devices read the server directly; failures show at once.
const queries = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queries}>
			<App db={db} session={session} />
		</QueryClientProvider>
	</StrictMode>,
);
