import type { Location } from "@fieldsync/work-orders";

/** Brazzaville, where the demo's teams work; the map opens here until a point is set. */
export const DEFAULT_CENTER: Location = { lat: -4.2634, lng: 15.2429 };

/**
 * Turn-by-turn directions to the pin. Addresses are too vague to drive to
 * here, so there are no directions without one.
 */
export const directionsUrl = (l: Location) =>
	`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;

export const formatLocation = (l: Location) =>
	`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`;

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
