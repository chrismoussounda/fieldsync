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

createRoot(root).render(
	<StrictMode>
		<App db={db} session={session} />
	</StrictMode>,
);
