import {
	type EntityRequest,
	type EntityResponse,
	PROTOCOL_VERSION,
	type PullRequest,
	type PullResponse,
	type PushRequest,
	type PushResponse,
} from "@fieldsync/protocol";
import type { Transport } from "./client.ts";

export class HttpError extends Error {
	readonly status: number;
	readonly code: string | undefined;

	constructor(status: number, code: string | undefined) {
		super(`HTTP ${status}${code ? ` ${code}` : ""}`);
		this.status = status;
		this.code = code;
	}
}

export type HttpTransportOptions = {
	baseUrl: string;
	getToken: () => Promise<string | null>;
	fetch?: typeof fetch;
};

export class HttpTransport implements Transport {
	readonly #options: Required<HttpTransportOptions>;

	constructor(options: HttpTransportOptions) {
		this.#options = { fetch: globalThis.fetch.bind(globalThis), ...options };
	}

	push(request: PushRequest): Promise<PushResponse> {
		return this.#send("POST", "/sync/push", request);
	}

	pull({ cursor, limit }: PullRequest): Promise<PullResponse> {
		const query = new URLSearchParams({
			cursor: String(cursor),
			limit: String(limit),
		});
		return this.#send("GET", `/sync/pull?${query}`);
	}

	entity({ entityType, entityId }: EntityRequest): Promise<EntityResponse> {
		const path = `/sync/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
		return this.#send("GET", path);
	}

	async #send<T>(method: string, path: string, body?: unknown): Promise<T> {
		const headers: Record<string, string> = {
			"x-protocol-version": PROTOCOL_VERSION,
		};
		const token = await this.#options.getToken();
		if (token) headers.authorization = `Bearer ${token}`;
		if (body !== undefined) headers["content-type"] = "application/json";

		const response = await this.#options.fetch(
			`${this.#options.baseUrl}${path}`,
			{
				method,
				headers,
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			},
		);
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;
			throw new HttpError(response.status, payload?.error);
		}
		return (await response.json()) as T;
	}
}
