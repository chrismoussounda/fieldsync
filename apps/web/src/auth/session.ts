import { HttpError } from "@fieldsync/sync-client";
import type { LocalDb } from "../sync/storage.ts";
import { deviceName } from "./device-name.ts";

export type Role = "technician" | "dispatcher" | "admin";
export type User = { id: string; name: string; role: Role };

export type Person = "admin" | "dispatch" | "junior" | "merveille";

/**
 * The visitor's own copy of the demo; whoever has the key can enter it. Null
 * for someone its admin added, who signed in by email.
 */
export type Demo = {
	entry: { key: string; person: Person } | null;
	expiresAt: string;
};

type State = {
	user: User | null;
	revoked: boolean;
	demo: Demo | null;
	/** Signed out because the demo's time was up. */
	demoEnded: boolean;
};

const SIGNED_OUT: State = {
	user: null,
	revoked: false,
	demo: null,
	demoEnded: false,
};

type Tokens = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	user: User;
	demo?: { expiresAt: string };
};

type DemoTokens = Tokens & {
	demo: { key: string; person: Person; expiresAt: string };
};

type Stored = { user: User; refreshToken: string; demo?: Demo };

/** The device this browser is for each person it has been in the demo. */
type DemoDevices = { key: string; ids: Partial<Record<Person, string>> };

export type SessionOptions = {
	db: LocalDb;
	baseUrl: string;
	fetch?: typeof fetch;
	now?: () => number;
};

// Refreshes this long before expiry, so a request never leaves with a stale token.
const MARGIN_MS = 60_000;

/**
 * Who is signed in on this browser. The refresh token is kept in IndexedDB so
 * the app opens offline; the access token only lives in memory.
 */
export class Session {
	readonly #db: LocalDb;
	readonly #baseUrl: string;
	readonly #fetch: typeof fetch;
	readonly #now: () => number;
	readonly #listeners = new Set<() => void>();
	#stored: Stored | null = null;
	#access: { token: string; expiresAt: number } | null = null;
	#refreshing: Promise<string> | null = null;
	#state: State = SIGNED_OUT;

	constructor(options: SessionOptions) {
		this.#db = options.db;
		this.#baseUrl = options.baseUrl;
		this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.#now = options.now ?? Date.now;
	}

	get user(): User | null {
		return this.#state.user;
	}

	get revoked(): boolean {
		return this.#state.revoked;
	}

	/** A stable snapshot for `useSyncExternalStore`. */
	readonly snapshot = () => this.#state;

	readonly subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	async load(): Promise<void> {
		this.#stored = (await this.#db.getMeta<Stored>("session")) ?? null;
		this.#setState({
			...SIGNED_OUT,
			user: this.#stored?.user ?? null,
			revoked: (await this.#db.getMeta<boolean>("revoked")) ?? false,
			demo: this.#stored?.demo ?? null,
		});
	}

	/** Generated once; its first 8 characters are this device's clock node. */
	async deviceId(): Promise<string> {
		const saved = await this.#db.getMeta<string>("deviceId");
		if (saved) return saved;
		const id = crypto.randomUUID();
		await this.#db.setMeta("deviceId", id);
		return id;
	}

	async login(email: string, password: string): Promise<User> {
		return this.#signIn("/auth/login", { email, password });
	}

	/** Starts this visitor's own copy of the demo; demo servers only. */
	startDemo(person: Person): Promise<User> {
		return this.#enterDemo("/demo/workspaces", { person });
	}

	/** Enters a demo already started, here or on another device. */
	async joinDemo(key: string, person: Person): Promise<User> {
		const devices = await this.#db.getMeta<DemoDevices>("demoDevices");
		const known = devices?.key === key ? devices.ids[person] : undefined;
		try {
			return await this.#enterDemo("/auth/demo", { key, person }, known);
		} catch (error) {
			// Locked out by the demo's own admin: come back as a new device.
			if (!known || !isCode(error, "DEVICE_REVOKED")) throw error;
			return this.#enterDemo("/auth/demo", { key, person });
		}
	}

	/**
	 * Replaces whatever this browser holds, but only once the server has let
	 * the visitor in. Nothing may be syncing meanwhile.
	 */
	async #enterDemo(
		path: string,
		body: Record<string, string>,
		deviceId: string = crypto.randomUUID(),
	): Promise<User> {
		// Left by an expired session of a real account: they must not be lost.
		if (!this.#stored && (await this.#db.outbox.count()) > 0) {
			throw new HttpError(409, "DEVICE_TAKEN");
		}
		const tokens = await this.#post<DemoTokens>(path, {
			...body,
			deviceId,
			deviceName: deviceName(navigator.userAgent),
		});
		const { key, person, expiresAt } = tokens.demo;
		const before = await this.#db.getMeta<DemoDevices>("demoDevices");
		const devices: DemoDevices = {
			key,
			ids: {
				...(before?.key === key ? before.ids : {}),
				[person]: deviceId,
			},
		};
		const db = this.#db;
		await db.transaction("rw", db.tables, async () => {
			await Promise.all(db.tables.map((table) => table.clear()));
			await db.setMeta("deviceId", deviceId);
			await db.setMeta("demoDevices", devices);
		});
		await this.#accept(tokens, { entry: { key, person }, expiresAt });
		return tokens.user;
	}

	async #signIn(path: string, body: Record<string, string>): Promise<User> {
		const request = async () =>
			this.#post<Tokens>(path, {
				...body,
				deviceId: await this.deviceId(),
				deviceName: deviceName(navigator.userAgent),
			});
		let tokens: Tokens;
		try {
			tokens = await request();
		} catch (error) {
			// The id belongs to another user, or another device drew the same
			// clock node. Start over as a new device, unless changes still wait.
			if (!isCode(error, "DEVICE_TAKEN") || (await this.#db.outbox.count())) {
				throw error;
			}
			await this.#db.transaction("rw", this.#db.entities, this.#db.meta, () =>
				Promise.all([this.#db.entities.clear(), this.#db.meta.clear()]),
			);
			tokens = await request();
		}
		await this.#accept(
			tokens,
			tokens.demo && { entry: null, expiresAt: tokens.demo.expiresAt },
		);
		return tokens.user;
	}

	/** For the transport: null when signed out; throws when offline. */
	async getToken(): Promise<string | null> {
		if (!this.#stored) return null;
		if (this.#access && this.#access.expiresAt - MARGIN_MS > this.#now()) {
			return this.#access.token;
		}
		this.#refreshing ??= this.#refresh().finally(() => {
			this.#refreshing = null;
		});
		return this.#refreshing;
	}

	/** Forgets the user and erases this browser's copy of the org's data. */
	async signOut(): Promise<void> {
		this.#stored = null;
		this.#access = null;
		await this.#db.delete();
		await this.#db.open();
		this.#setState(SIGNED_OUT);
	}

	/** Called with every failed API request, to react the moment access ends. */
	async reportFailure(error: unknown): Promise<void> {
		if (isCode(error, "DEVICE_REVOKED")) {
			await this.#markRevoked();
		} else if (isCode(error, "UNAUTHORIZED")) {
			// The server no longer accepts this access token: refresh next time.
			this.#access = null;
		}
	}

	async #markRevoked(): Promise<void> {
		await this.#db.setMeta("revoked", true);
		this.#setState({ ...this.#state, revoked: true });
	}

	async #refresh(): Promise<string> {
		const refreshToken = this.#stored?.refreshToken;
		if (!refreshToken) throw new HttpError(401, "UNAUTHORIZED");
		try {
			const tokens = await this.#post<Tokens>("/auth/refresh", {
				refreshToken,
			});
			await this.#accept(tokens, this.#stored?.demo);
			return tokens.accessToken;
		} catch (error) {
			if (isCode(error, "DEVICE_REVOKED")) {
				await this.#markRevoked();
			} else if (
				error instanceof HttpError &&
				error.status === 401 &&
				this.#stored?.demo
			) {
				const ended = Date.parse(this.#stored.demo.expiresAt) <= this.#now();
				await this.signOut();
				this.#setState({ ...SIGNED_OUT, demoEnded: ended });
			} else if (error instanceof HttpError && error.status === 401) {
				// Local data stays: unsynced changes go out after the next sign-in.
				this.#stored = null;
				this.#access = null;
				await this.#db.meta.delete("session");
				this.#setState(SIGNED_OUT);
			}
			throw error;
		}
	}

	async #accept(tokens: Tokens, demo?: Demo): Promise<void> {
		this.#stored = {
			user: tokens.user,
			refreshToken: tokens.refreshToken,
			...(demo ? { demo } : {}),
		};
		this.#access = {
			token: tokens.accessToken,
			expiresAt: this.#now() + tokens.expiresIn * 1000,
		};
		await this.#db.setMeta("session", this.#stored);
		if (this.#state.user?.id !== tokens.user.id) {
			this.#setState({
				...SIGNED_OUT,
				user: tokens.user,
				demo: demo ?? null,
			});
		}
	}

	async #post<T>(path: string, body: unknown): Promise<T> {
		const response = await this.#fetch(`${this.#baseUrl}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) throw new HttpError(response.status, payload?.error);
		return payload as T;
	}

	#setState(state: State): void {
		this.#state = state;
		for (const listener of this.#listeners) listener();
	}
}

function isCode(error: unknown, code: string): boolean {
	return error instanceof HttpError && error.code === code;
}
