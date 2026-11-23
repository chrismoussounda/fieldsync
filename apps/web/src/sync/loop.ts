import type { Op } from "@fieldsync/protocol";
import {
	HttpError,
	type MutateInput,
	type SyncClient,
} from "@fieldsync/sync-client";

export type SyncStatus = {
	state: "idle" | "syncing" | "offline" | "error";
	lastSyncedAt: number | null;
};

export type SyncLoopOptions = {
	client: SyncClient;
	/** Persists the clock, so it never goes back after a restart. */
	saveClock: (clock: string) => Promise<void>;
	now?: () => number;
};

const INTERVAL_MS = 15_000;

/** Syncs in the background: on start, on a timer, when back online, after each change. */
export class SyncLoop {
	readonly #client: SyncClient;
	readonly #saveClock: (clock: string) => Promise<void>;
	readonly #now: () => number;
	readonly #listeners = new Set<() => void>();
	#status: SyncStatus = { state: "idle", lastSyncedAt: null };
	#running: Promise<void> | null = null;
	#again = false;
	#halted = false;

	constructor(options: SyncLoopOptions) {
		this.#client = options.client;
		this.#saveClock = options.saveClock;
		this.#now = options.now ?? Date.now;
	}

	readonly status = () => this.#status;

	readonly subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	/** Starts syncing; returns the function that stops it. */
	start(): () => void {
		const run = () => void this.run();
		// Said at once, rather than at the next sync up to 15 seconds later.
		const lost = () => this.#set({ ...this.#status, state: "offline" });
		const timer = setInterval(run, INTERVAL_MS);
		window.addEventListener("online", run);
		window.addEventListener("offline", lost);
		run();
		return () => {
			clearInterval(timer);
			window.removeEventListener("online", run);
			window.removeEventListener("offline", lost);
		};
	}

	/** Writes locally, then tries to send the change at once. */
	async mutate(input: MutateInput): Promise<Op> {
		const op = await this.#client.mutate(input);
		await this.#saveClock(this.#client.clockState());
		void this.run();
		return op;
	}

	/** Stops syncing, once any sync under way is over; undone by `resume`. */
	async halt(): Promise<void> {
		this.#halted = true;
		this.#again = false;
		await this.#running;
	}

	resume(): void {
		this.#halted = false;
		void this.run();
	}

	/** One sync at a time; asking during a run schedules one more after it. */
	run(): Promise<void> {
		if (this.#halted) return this.#running ?? Promise.resolve();
		if (this.#running) {
			this.#again = true;
			return this.#running;
		}
		this.#running = (async () => {
			do {
				this.#again = false;
				await this.#once();
			} while (this.#again);
		})().finally(() => {
			this.#running = null;
		});
		return this.#running;
	}

	async #once(): Promise<void> {
		this.#set({ ...this.#status, state: "syncing" });
		try {
			await this.#client.syncOnce();
			this.#set({ state: "idle", lastSyncedAt: this.#now() });
		} catch (error) {
			// No network, or a gateway that cannot reach the server, is just offline.
			const unreachable =
				!(error instanceof HttpError) || [502, 503, 504].includes(error.status);
			const state = unreachable ? "offline" : "error";
			this.#set({ ...this.#status, state });
		} finally {
			await this.#saveClock(this.#client.clockState());
		}
	}

	#set(status: SyncStatus): void {
		this.#status = status;
		for (const listener of this.#listeners) listener();
	}
}
