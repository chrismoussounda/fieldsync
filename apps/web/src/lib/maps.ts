import type { Location } from "@fieldsync/work-orders";

/** Brazzaville, where the demo's teams work; the map opens here until a point is set. */
export const DEFAULT_CENTER: Location = { lat: -4.2634, lng: 15.2429 };

/** Opens turn-by-turn directions: to the exact point when one is set, else to the address. */
export function directionsUrl(location: Location | null, address: string) {
	return location
		? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
		: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export const formatLocation = (l: Location) =>
	`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`;

/** Looks an address up on OpenStreetMap; null when nothing matches. */
export async function findAddress(address: string): Promise<Location | null> {
	const url = new URL("https://nominatim.openstreetmap.org/search");
	url.search = new URLSearchParams({
		format: "jsonv2",
		limit: "1",
		q: address,
	}).toString();
	const response = await fetch(url, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok)
		throw new Error(`Address lookup failed: ${response.status}`);
	const [hit] = (await response.json()) as { lat: string; lon: string }[];
	return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

/** Where this device is, when the person lets the browser tell. */
export function currentPosition(): Promise<Location> {
	return new Promise((resolve, reject) =>
		navigator.geolocation.getCurrentPosition(
			(p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
			reject,
			{ enableHighAccuracy: true, timeout: 15_000 },
		),
	);
}
