import { useState } from "react";

/**
 * Open state for a sheet that slides out before it unmounts: `value` stays
 * set while it closes, and each opening gets a new `key` so its form starts
 * fresh. Mount the sheet while `value` is set.
 */
export function useSheet<T>() {
	const [state, setState] = useState<{
		open: boolean;
		value: T | null;
		key: number;
	}>({ open: false, value: null, key: 0 });
	return {
		...state,
		show: (value: T) =>
			setState((s) => ({ open: true, value, key: s.key + 1 })),
		hide: () => setState((s) => ({ ...s, open: false })),
	};
}

/** A key that changes each time `open` turns true, for sheets opened by the URL. */
export function useOpeningKey(open: boolean): number {
	const [last, setLast] = useState(open);
	const [key, setKey] = useState(0);
	if (open !== last) {
		setLast(open);
		if (open) setKey(key + 1);
	}
	return key;
}
