const UNITS: [number, Intl.RelativeTimeFormatUnit][] = [
	[60 * 60 * 24, "day"],
	[60 * 60, "hour"],
	[60, "minute"],
];

/** "now", "5 minutes ago", "il y a 2 jours". */
export function ago(iso: string, now = Date.now(), locale = "en"): string {
	const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
	const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	for (const [size, unit] of UNITS) {
		const count = Math.floor(seconds / size);
		if (count >= 1) return format.format(-count, unit);
	}
	return format.format(0, "second");
}
