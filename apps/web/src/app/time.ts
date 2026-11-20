const UNITS: [number, string][] = [
	[60 * 60 * 24, "day"],
	[60 * 60, "hour"],
	[60, "min"],
];

/** "just now", "5 min ago", "2 days ago". */
export function ago(iso: string, now = Date.now()): string {
	const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
	for (const [size, unit] of UNITS) {
		const count = Math.floor(seconds / size);
		if (count >= 1) {
			return `${count} ${unit}${count > 1 && unit !== "min" ? "s" : ""} ago`;
		}
	}
	return "just now";
}
