import { decode, encode, type Timestamp } from "./timestamp.ts";

const NODE = /^[0-9a-f]{8}$/;

export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;
const MAX_COUNTER = 0xffff;

export class Clock {
	readonly #node: string;
	readonly #now: () => number;
	#last: Timestamp;

	constructor(node: string, now: () => number, saved?: string) {
		if (!NODE.test(node)) throw new Error(`Invalid node: ${node}`);
		this.#node = node;
		this.#now = now;
		this.#last = saved
			? { ...decode(saved), node }
			: { wall: 0, counter: 0, node };
	}

	tick(): string {
		const wall = Math.max(this.#now(), this.#last.wall);
		const counter = wall === this.#last.wall ? this.#last.counter + 1 : 0;
		this.#set(wall, counter);
		return encode(this.#last);
	}

	receive(remote: string): void {
		const seen = decode(remote);
		const now = this.#now();
		// One device with a broken clock must not drag every other device forward.
		if (seen.wall - now > MAX_DRIFT_MS) return;
		const wall = Math.max(now, this.#last.wall, seen.wall);
		let counter = 0;
		if (wall === this.#last.wall && wall === seen.wall) {
			counter = Math.max(this.#last.counter, seen.counter) + 1;
		} else if (wall === this.#last.wall) {
			counter = this.#last.counter + 1;
		} else if (wall === seen.wall) {
			counter = seen.counter + 1;
		}
		this.#set(wall, counter);
	}

	state(): string {
		return encode(this.#last);
	}

	#set(wall: number, counter: number): void {
		// The counter has 4 hex digits; past that, borrow the next millisecond.
		this.#last =
			counter > MAX_COUNTER
				? { wall: wall + 1, counter: 0, node: this.#node }
				: { wall, counter, node: this.#node };
	}
}
