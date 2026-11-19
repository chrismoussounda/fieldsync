import type { Transport } from "@fieldsync/sync-client";

/** Cuts the network on demand, to show what the app does offline. */
export class NetworkSwitch implements Transport {
	readonly #inner: Transport;
	readonly #listeners = new Set<() => void>();
	#offline = false;

	constructor(inner: Transport) {
		this.#inner = inner;
	}

	readonly isOffline = () => this.#offline;

	readonly subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	setOffline(offline: boolean): void {
		this.#offline = offline;
		for (const listener of this.#listeners) listener();
	}

	push: Transport["push"] = (request) =>
		this.#guard(() => this.#inner.push(request));

	pull: Transport["pull"] = (request) =>
		this.#guard(() => this.#inner.pull(request));

	entity: Transport["entity"] = (request) =>
		this.#guard(() => this.#inner.entity(request));

	async #guard<T>(send: () => Promise<T>): Promise<T> {
		// Same error as a real failed fetch.
		if (this.#offline) throw new TypeError("Failed to fetch");
		return send();
	}
}
