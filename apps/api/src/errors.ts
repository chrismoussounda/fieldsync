/** An expected failure, sent to the client as `{ error: code }`. */
export class ApiError extends Error {
	readonly statusCode: number;
	readonly code: string;

	constructor(statusCode: number, code: string) {
		super(code);
		this.statusCode = statusCode;
		this.code = code;
	}
}

export function isUniqueViolation(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === "23505";
}
