export type Timestamp = {
	wall: number;
	counter: number;
	node: string;
};

const PATTERN = /^([0-9a-f]{13})-([0-9a-f]{4})-([0-9a-f]{8})$/;

// Fixed-width hex, so comparing two encoded strings orders the timestamps.
export function encode({ wall, counter, node }: Timestamp): string {
	const w = wall.toString(16).padStart(13, "0");
	const c = counter.toString(16).padStart(4, "0");
	return `${w}-${c}-${node}`;
}

export function decode(hlc: string): Timestamp {
	const match = PATTERN.exec(hlc);
	if (!match) throw new Error(`Invalid HLC: ${hlc}`);
	const [, wall = "", counter = "", node = ""] = match;
	return {
		wall: Number.parseInt(wall, 16),
		counter: Number.parseInt(counter, 16),
		node,
	};
}
