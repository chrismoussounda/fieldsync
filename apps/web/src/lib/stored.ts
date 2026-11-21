/** A device-wide choice kept in localStorage, readable from React. */
export function stored<T extends string>(
	key: string,
	choices: readonly T[],
	fallback: T,
) {
	const listeners = new Set<() => void>();
	let value = read();

	function read(): T {
		try {
			const saved = localStorage.getItem(key);
			return choices.find((c) => c === saved) ?? fallback;
		} catch {
			return fallback;
		}
	}

	return {
		get: () => value,
		set(next: T) {
			value = next;
			try {
				localStorage.setItem(key, next);
			} catch {}
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
