import "leaflet/dist/leaflet.css";
import type { Location } from "@fieldsync/work-orders";
import { cn } from "cn";
import L from "leaflet";
import { LocateFixed, MapPinned, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AttributionControl,
	MapContainer,
	Marker,
	TileLayer,
	useMap,
	useMapEvents,
} from "react-leaflet";
import { toast } from "sonner";
import { Field } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { currentPosition, DEFAULT_CENTER, formatLocation } from "@/lib/maps";
import { usePhone } from "@/lib/use-phone";
import type { Pin } from "../app/map.ts";

const SHAPE = `<path d="M18 43s15-14.2 15-25A15 15 0 0 0 3 18c0 10.8 15 25 15 25Z" /><circle cx="18" cy="18" r="6" />`;

const PIN = L.divIcon({
	className: "",
	iconSize: [36, 44],
	iconAnchor: [18, 42],
	html: `<svg viewBox="0 0 36 44" width="36" height="44" class="map-pin" aria-hidden="true">${SHAPE}</svg>`,
});

const jobPins = new Map<string, L.DivIcon>();

/** A pin in the job's status colour, larger when it is the one chosen. */
function jobPin(status: string, chosen: boolean): L.DivIcon {
	const key = `${status}:${chosen}`;
	let icon = jobPins.get(key);
	if (!icon) {
		icon = L.divIcon({
			className: "",
			iconSize: [36, 44],
			iconAnchor: [18, 42],
			html: `<svg viewBox="0 0 36 44" width="36" height="44" class="map-pin map-pin-${status}${chosen ? " map-pin-chosen" : ""}" aria-hidden="true">${SHAPE}</svg>`,
		});
		jobPins.set(key, icon);
	}
	return icon;
}

const CLOSE = 17;
const WIDE = 12;
const at = (l: Location): [number, number] => [l.lat, l.lng];

/** OpenStreetMap tiles, credited as their licence asks. */
function Tiles() {
	return (
		<>
			<TileLayer
				url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
				maxZoom={19}
			/>
			<AttributionControl prefix={false} />
		</>
	);
}

/** Leaflet measures its box once; a sheet sliding in or a drawer growing changes it. */
function FitBox() {
	const map = useMap();
	useEffect(() => {
		const box = map.getContainer();
		const observer = new ResizeObserver(() => map.invalidateSize());
		observer.observe(box);
		return () => observer.disconnect();
	}, [map]);
	return null;
}

function OnTap({ onTap }: { onTap: (l: Location) => void }) {
	useMapEvents({
		click: (e) => onTap({ lat: e.latlng.lat, lng: e.latlng.lng }),
	});
	return null;
}

const FRAME =
	"relative isolate overflow-hidden rounded-xl border bg-muted [&_.leaflet-container]:size-full [&_.leaflet-container]:bg-muted [&_.leaflet-container]:font-sans";

/** A point shown on a small map, read only. */
export function MapView({
	location,
	label,
	className,
}: {
	location: Location;
	label: string;
	className?: string;
}) {
	const phone = usePhone();
	return (
		<div
			role="img"
			aria-label={label}
			data-base-ui-swipe-ignore
			className={cn(FRAME, "h-48", className)}
		>
			<MapContainer
				center={at(location)}
				zoom={CLOSE - 1}
				scrollWheelZoom={false}
				// One finger scrolls the page on a phone; the buttons still zoom.
				dragging={!phone}
				attributionControl={false}
			>
				<Tiles />
				<FitBox />
				<Marker position={at(location)} icon={PIN} interactive={false} />
			</MapContainer>
		</div>
	);
}

/** Picks the exact door on a map: tap to place, drag to adjust, or use where the device is. */
export function LocationField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: Location | null;
	onChange: (value: Location | null) => void;
}) {
	const { t } = useTranslation();
	const [map, setMap] = useState<L.Map | null>(null);
	const [locating, setLocating] = useState(false);

	function place(l: Location) {
		onChange(l);
		map?.flyTo(at(l), Math.max(map.getZoom(), CLOSE), { duration: 0.6 });
	}

	async function fromHere() {
		setLocating(true);
		try {
			place(await currentPosition());
		} catch {
			toast.error(t("map.noPosition"));
		} finally {
			setLocating(false);
		}
	}

	return (
		<Field id={id} label={label} hint={t("map.hint")}>
			<fieldset
				id={id}
				aria-label={label}
				data-base-ui-swipe-ignore
				className={cn(FRAME, "h-64 min-w-0 cursor-crosshair")}
			>
				<MapContainer
					ref={setMap}
					center={at(value ?? DEFAULT_CENTER)}
					zoom={value ? CLOSE : WIDE}
					scrollWheelZoom={false}
					attributionControl={false}
				>
					<Tiles />
					<FitBox />
					<OnTap onTap={onChange} />
					{value && (
						<Marker
							position={at(value)}
							icon={PIN}
							draggable
							eventHandlers={{
								dragend: (e) => {
									const p = (e.target as L.Marker).getLatLng();
									onChange({ lat: p.lat, lng: p.lng });
								},
							}}
						/>
					)}
				</MapContainer>
				{!value && (
					<p className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex animate-in items-center justify-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm font-medium shadow-sm duration-300 fade-in-0">
						<MapPinned aria-hidden className="size-4 text-primary" />
						{t("map.empty")}
					</p>
				)}
			</fieldset>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					isDisabled={locating}
					onPress={() => void fromHere()}
				>
					<LocateFixed aria-hidden />
					{locating ? t("map.locating") : t("map.here")}
				</Button>
				{value && (
					<>
						<span className="text-sm text-muted-foreground tabular-nums">
							{formatLocation(value)}
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="ml-auto text-muted-foreground"
							onPress={() => onChange(null)}
						>
							<X aria-hidden />
							{t("map.clear")}
						</Button>
					</>
				)}
			</div>
		</Field>
	);
}

/** Frames every pin when the set of jobs shown changes, not on each edit. */
function FitPins({ pins }: { pins: readonly Pin[] }) {
	const map = useMap();
	const key = pins
		.map((p) => `${p.order.id}@${p.location.lat},${p.location.lng}`)
		.join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the pins.
	useEffect(() => {
		if (pins.length === 0) map.setView(at(DEFAULT_CENTER), WIDE);
		else
			map.fitBounds(L.latLngBounds(pins.map((p) => at(p.location))), {
				padding: [48, 48],
				maxZoom: CLOSE - 1,
			});
	}, [key, map]);
	return null;
}

/** Brings the chosen job into view when it was picked off the map. */
function ShowChosen({ pin }: { pin: Pin | null }) {
	const map = useMap();
	useEffect(() => {
		if (pin && !map.getBounds().contains(at(pin.location))) {
			map.panTo(at(pin.location), { duration: 0.5 });
		}
	}, [pin, map]);
	return null;
}

/** Many jobs on one map, each a pin in its status colour; a pin picks its job. */
export function JobsMap({
	pins,
	chosen,
	onChoose,
	label,
	className,
}: {
	pins: readonly Pin[];
	chosen: string | null;
	onChoose: (id: string) => void;
	label: string;
	className?: string;
}) {
	const chosenPin = useMemo(
		() => pins.find((p) => p.order.id === chosen) ?? null,
		[pins, chosen],
	);
	return (
		<section
			aria-label={label}
			data-base-ui-swipe-ignore
			className={cn(FRAME, className)}
		>
			<MapContainer
				center={at(DEFAULT_CENTER)}
				zoom={WIDE}
				scrollWheelZoom
				attributionControl={false}
			>
				<Tiles />
				<FitBox />
				<FitPins pins={pins} />
				<ShowChosen pin={chosenPin} />
				{pins.map(({ order, location }) => (
					<Marker
						key={order.id}
						position={at(location)}
						icon={jobPin(order.status, order.id === chosen)}
						title={order.title}
						zIndexOffset={order.id === chosen ? 1000 : 0}
						eventHandlers={{
							// A pin's title is only a tooltip; screen readers need a name.
							add: (e) =>
								(e.target as L.Marker)
									.getElement()
									?.setAttribute("aria-label", order.title),
							click: () => onChoose(order.id),
							// Leaflet focuses pins but leaves Enter to popups.
							keypress: (e) => {
								const key = (e.originalEvent as KeyboardEvent).key;
								if (key === "Enter" || key === " ") onChoose(order.id);
							},
						}}
					/>
				))}
			</MapContainer>
		</section>
	);
}
