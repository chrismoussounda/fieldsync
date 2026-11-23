import { Logo } from "./Logo.tsx";

export function Opening() {
	return (
		<div className="grid min-h-dvh place-items-center">
			<span className="animate-pulse">
				<Logo />
			</span>
		</div>
	);
}
