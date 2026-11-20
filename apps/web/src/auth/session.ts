import { HttpError } from "@fieldsync/sync-client";
import type { LocalDb } from "../sync/storage.ts";
import { deviceName } from "./device-name.ts";

export type Role = "technician" | "dispatcher" | "admin";
export type User = { id: string; name: string; role: Role };

type Tokens = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	user: User;
};

type Stored = { user: User; refreshToken: string };

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
	#state: { user: User | null; revoked: boolean } = {
		user: null,
		revoked: false,
	};

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
			user: this.#stored?.user ?? null,
			revoked: (await this.#db.getMeta<boolean>("revoked")) ?? false,
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
		const request = async () =>
			this.#post<Tokens>("/auth/login", {
				email,
				password,
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
		await this.#accept(tokens);
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
		this.#setState({ user: null, revoked: false });
	}

	async #refresh(): Promise<string> {
		const refreshToken = this.#stored?.refreshToken;
		if (!refreshToken) throw new HttpError(401, "UNAUTHORIZED");
		try {
			const tokens = await this.#post<Tokens>("/auth/refresh", {
				refreshToken,
			});
			await this.#accept(tokens);
			return tokens.accessToken;
		} catch (error) {
			if (isCode(error, "DEVICE_REVOKED")) {
				await this.#db.setMeta("revoked", true);
				this.#setState({ ...this.#state, revoked: true });
			} else if (error instanceof HttpError && error.status === 401) {
				// Local data stays: unsynced changes go out after the next sign-in.
				this.#stored = null;
				this.#access = null;
				await this.#db.meta.delete("session");
				this.#setState({ user: null, revoked: false });
			}
			throw error;
		}
	}

	async #accept(tokens: Tokens): Promise<void> {
		this.#stored = { user: tokens.user, refreshToken: tokens.refreshToken };
		this.#access = {
			token: tokens.accessToken,
			expiresAt: this.#now() + tokens.expiresIn * 1000,
		};
		await this.#db.setMeta("session", this.#stored);
		if (this.#state.user?.id !== tokens.user.id) {
			this.#setState({ user: tokens.user, revoked: false });
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

	#setState(state: { user: User | null; revoked: boolean }): void {
		this.#state = state;
		for (const listener of this.#listeners) listener();
	}
}

function isCode(error: unknown, code: string): boolean {
	return error instanceof HttpError && error.code === code;
}
