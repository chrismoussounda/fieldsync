const BROWSERS: [RegExp, string][] = [
	[/Edg\//, "Edge"],
	[/OPR\/|Opera/, "Opera"],
	[/SamsungBrowser/, "Samsung Internet"],
	[/Firefox\/|FxiOS/, "Firefox"],
	[/Chrome\/|CriOS/, "Chrome"],
	[/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
	[/Android/, "Android"],
	[/iPhone/, "iPhone"],
	[/iPad/, "iPad"],
	[/Windows/, "Windows"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/Linux/, "Linux"],
];

/** A name an admin can recognise in the device list, e.g. "Chrome on Android". */
export function deviceName(userAgent: string): string {
	const pick = (list: [RegExp, string][]) =>
		list.find(([pattern]) => pattern.test(userAgent))?.[1];
	const browser = pick(BROWSERS) ?? "Browser";
	const system = pick(SYSTEMS);
	return system ? `${browser} on ${system}` : browser;
}
