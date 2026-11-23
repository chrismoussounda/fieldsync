import { RouterProvider } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { AppContext } from "./app/context.ts";
import { type Sync, startSync } from "./app/workspace.ts";
import type { Session, User } from "./auth/session.ts";
import { router } from "./routes.tsx";
import { Opening } from "./screens/Opening.tsx";
import type { LocalDb } from "./sync/storage.ts";

type Props = { db: LocalDb; session: Session; user: User };

export function SignedIn({ db, session, user }: Props) {
	const [sync, setSync] = useState<Sync | null>(null);
	const pending =
		useLiveQuery(
			() => db.outbox.where("status").anyOf("pending", "inflight").count(),
			[db],
		) ?? 0;

	useEffect(() => {
		let stop: (() => void) | undefined;
		let cancelled = false;
		void startSync(db, session).then((started) => {
			if (cancelled) return started.stop();
			stop = started.stop;
			setSync(started.sync);
		});
		return () => {
			cancelled = true;
			stop?.();
		};
	}, [db, session]);

	const app = useMemo(
		() => sync && { db, session, user, sync, pending },
		[db, session, user, sync, pending],
	);
	if (!app) return <Opening />;
	return (
		<AppContext.Provider value={app}>
			<RouterProvider router={router} />
		</AppContext.Provider>
	);
}
