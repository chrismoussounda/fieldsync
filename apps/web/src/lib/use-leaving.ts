import { useState } from "react";

/** How long a removed row takes to fade out; matches `ITEM_OUT`. */
const LEAVE_MS = 200;

/** A row appearing: fades and drops in. */
export const ITEM_IN = "animate-in fade-in-0 slide-in-from-top-1 duration-300";

/** A row going: fades and slides away, then stays hidden until it is gone. */
export const ITEM_OUT =
	"pointer-events-none animate-out fade-out-0 slide-out-to-right-4 duration-200 fill-mode-forwards";

/** Lets a removed row fade out before its record is deleted. */
export function useLeaving() {
	const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
	return {
		isLeaving: (id: string) => leaving.has(id),
		leave: (id: string, remove: () => void) => {
			setLeaving((ids) => new Set(ids).add(id));
			setTimeout(remove, LEAVE_MS);
		},
	};
}
