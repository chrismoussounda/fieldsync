import { decode, encode, type Timestamp } from "./timestamp.ts";

const NODE = /^[0-9a-f]{8}$/;

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

	/** Stamps a local event. Never goes backwards, even if the device clock does. */
	tick(): string {
		const wall = Math.max(this.#now(), this.#last.wall);
		const counter = wall === this.#last.wall ? this.#last.counter + 1 : 0;
		this.#last = { wall, counter, node: this.#node };
		return encode(this.#last);
	}

	/** The value to persist and pass back as `saved` on the next start. */
	state(): string {
		return encode(this.#last);
	}
}
