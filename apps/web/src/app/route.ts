/** Links to every screen; the router reads them back. */
export const ROUTES = {
	list: "#/",
	filtered: (query: string) => `#/?${query}`,
	overview: "#/overview",
	new: "#/?new=1",
	debug: "#/debug",
	conflicts: "#/conflicts",
	devices: "#/devices",
	team: "#/team",
	account: "#/account",
	order: (id: string) => `#/orders/${id}`,
	report: (id: string) => `#/orders/${id}/report`,
	sites: "#/sites",
	newSite: "#/sites?new=1",
	site: (id: string) => `#/sites/${id}`,
};
