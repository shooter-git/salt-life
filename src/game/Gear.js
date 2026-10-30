// Gear and upgrade data, sold by Marta at the chandlery by the boathouse; everything the game reads
// goes through gearStats( state.upgrades ), so buying a level is just state.upgrades[ key ]++ and the
// stats follow.
//
// Each track: levels[ 0 ] is what you start with; cost is the price of that level (0 for the first).
export const UPGRADES = {
	// rod and reel
	line: { name: 'Fishing line', levels: [
		{ cost: 0, label: '8 lb mono', lineKg: 7 },
		{ cost: 60, label: '15 lb mono', lineKg: 13 },
		{ cost: 180, label: '30 lb braid', lineKg: 26 },
		{ cost: 450, label: '60 lb braid', lineKg: 50 },
	] },
	reel: { name: 'Reel', levels: [
		{ cost: 0, label: 'Old spinning reel', reelSpeed: 1.1 },
		{ cost: 90, label: 'Smooth spinning reel', reelSpeed: 1.6 },
		{ cost: 320, label: 'Conventional reel', reelSpeed: 2.2 },
	] },
	rod: { name: 'Rod', levels: [
		{ cost: 0, label: 'Hand-me-down rod', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', castM: 45 },
	] },
	// (Salt Life) the speargun, for a fish you've swum down to: a band gun (gunStyle: an aluminium tube,
	// a teak stock, a railgun), its barrel from the grip to the muzzle (gunCm) and rubber bands
	// (bands), the steel shaft it fires (shaftM long, at spearV m/s), the reach it kills at (spearM),
	// the shooting line (lineM), and how hard a big fish can pull before the shaft tears out of it
	// (spearHold, kg; with a reel the line pays out instead of the fish tearing free)
	speargun: { name: 'Speargun', levels: [
		{ cost: 0, label: 'Hand-me-down 30-inch speargun', gunStyle: 'tube', gunCm: 75, bands: 1, shaftM: 1.15, spearV: 16, spearM: 3, lineM: 4.5, spearHold: 7, spearReel: false },
		{ cost: 180, label: '40-inch teak speargun, two bands', gunStyle: 'teak', gunCm: 100, bands: 2, shaftM: 1.4, spearV: 20, spearM: 4, lineM: 6, spearHold: 11, spearReel: false },
		{ cost: 480, label: '48-inch railgun with a reel', gunStyle: 'rail', gunCm: 120, bands: 2, shaftM: 1.6, spearV: 23, spearM: 5, lineM: 7.5, spearHold: 16, spearReel: true },
	] },
	// (Salt Life) the cast net, for bait and mullet (CastNet.js): its size is its radius (netM, from the
	// horn to the lead line, as nets are sold), its mesh (meshCm, the square), the lead line's weight
	// (leadKgM) and how fast that sinks it (sinkMs), how far it's thrown (throwM), how wide the moment
	// is that spins it fully open (spreadWin, of the wind-up), the longest fish it holds (holdCm: a
	// bigger one bursts out), its twine (netTwine: 'nylon' braided, or clear 'mono')
	castNet: { name: 'Cast net', levels: [
		{ cost: 0, label: 'Hand-me-down 4 ft cast net', netM: 1.22, meshCm: 1.0, leadKgM: 0.7, sinkMs: 0.95, throwM: 6, spreadWin: 0.3, holdCm: 45, netTwine: 'nylon' },
		{ cost: 70, label: '6 ft monofilament cast net', netM: 1.83, meshCm: 1.0, leadKgM: 0.9, sinkMs: 1.2, throwM: 7, spreadWin: 0.25, holdCm: 50, netTwine: 'mono' },
		{ cost: 210, label: '8 ft bait net, heavy lead', netM: 2.44, meshCm: 1.0, leadKgM: 1.2, sinkMs: 1.5, throwM: 8, spreadWin: 0.21, holdCm: 55, netTwine: 'mono' },
		{ cost: 520, label: '10 ft pro net, 1½ lb a foot', netM: 3.05, meshCm: 1.27, leadKgM: 2.2, sinkMs: 1.95, throwM: 9, spreadWin: 0.18, holdCm: 62, netTwine: 'mono' },
	] },
	// (Salt Life) where the bait you net is kept alive (Bait.js): how many it holds
	baitWell: { name: 'Bait well', levels: [
		{ cost: 0, label: '5-gallon bait bucket', baitMax: 24 },
		{ cost: 90, label: 'Aerated bait bucket', baitMax: 50 },
		{ cost: 300, label: 'Livewell with a pump', baitMax: 120 },
	] },
	// (Salt Life) for the spiny lobster, by hand on a dive: a tickle stick to coax it out of its den
	// (tickleM: how far it reaches; coaxS: seconds of tickling a lobster takes to walk out) and a hand
	// net to clap over it, with a gauge for its carapace
	lobster: { name: 'Lobster gear', levels: [
		{ cost: 0, label: 'None', lobster: 0, tickleM: 0, coaxS: 0 },
		{ cost: 45, label: 'Tickle stick, hand net and a lobster gauge', lobster: 1, tickleM: 0.9, coaxS: 2.5 },
		{ cost: 160, label: 'Long aluminium tickle stick and a wide net', lobster: 2, tickleM: 1.3, coaxS: 1.6 },
	] },
	// boat
	hold: { name: 'Fish hold', levels: [
		{ cost: 0, label: 'Cooler', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', holdKg: 160 },
	] },
	fuel: { name: 'Fuel tank', levels: [
		{ cost: 0, label: '11-gallon tank', fuelL: 40 },
		{ cost: 150, label: '21-gallon tank', fuelL: 80 },
		{ cost: 380, label: '40-gallon tank', fuelL: 150 },
	] },
	engine: { name: 'Engine', levels: [
		{ cost: 0, label: 'Tired diesel', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', speedMul: 1.3 },
	] },
	fishFinder: { name: 'Fish finder', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', finder: true },
	] },
	// (Salt Life) the deck floodlights: after dark yellowtail, jacks and houndfish gather in their pool
	// astern (FishTable flood, Game.floodAt)
	lights: { name: 'Boat lights', levels: [
		{ cost: 0, label: 'Nav lights only', deckLights: false },
		{ cost: 140, label: 'Deck floodlights (fish gather under them after dark)', deckLights: true },
	] },
	// (Salt Life) the anchor: it goes down when you leave the helm out on the water and comes up when
	// you take it again (Game.updateAnchor); anchorM: the deepest water its rode holds in (at three
	// times the depth, as rode is let out: 200 ft holds in 66)
	anchor: { name: 'Anchor', levels: [
		{ cost: 0, label: 'None', anchorM: 0 },
		{ cost: 100, label: 'Danforth anchor, 200 ft of rode', anchorM: 20 },
	] },
	// (M10) what takes the water out of her bilge (Hull.js) besides you with the bucket: an electric pump
	// that clears it slowly by itself (pumpLs, litres a second: more than the rain brings in)
	bilgePump: { name: 'Bilge pump', levels: [
		{ cost: 0, label: 'A bucket', pumpLs: 0 },
		{ cost: 120, label: 'Electric bilge pump', pumpLs: 0.3 },
	] },
	// (M15) a chart of the island and its waters out to the drop-off, for those who'd rather not chart it
	// themselves (Chart.js: the island's sheet and its names, the far sheet within SOLD.r); a waterproof one,
	// as a chandlery sells them, at what one costs
	chart: { name: 'Chart', levels: [
		{ cost: 0, label: 'Your own, as you go', chart: false },
		{ cost: 30, label: 'Waterproof chart of the island, to the drop-off', chart: true },
	] },
};

export const FUEL_PRICE = 1.5; // $ per litre of diesel at the chandlery
// (Salt Life) Marta's tow: she fetches your boat back to the dock when it's drifted off (the wind pushes
// a boat left without its anchor). A call-out and a little for every 100 m, up to a cap; nothing to tow
// within `from` metres of the dock (walk or swim to her)
export const TOW = { base: 20, per100m: 5, max: 90, from: 30 };
export const towFee = ( metres ) => Math.min( TOW.max, Math.round( TOW.base + TOW.per100m * Math.max( 0, metres ) / 100 ) );
// litres per second at the helm: idle plus a lot more at full rpm (40 L lasts ~25 min flat out)
export function fuelBurn( rpm ) {

	return 0.0025 + 0.024 * rpm * rpm;

}

// next level of a track, or null when maxed
export function nextLevel( upgrades, key ) {

	const lv = UPGRADES[ key ].levels;
	const i = ( upgrades[ key ] | 0 ) + 1;
	return i < lv.length ? { index: i, ...lv[ i ] } : null;

}

export function defaultUpgrades() {

	const u = {};
	for ( const k in UPGRADES ) u[ k ] = 0;
	return u;

}

// merged stats of the current levels
export function gearStats( upgrades ) {

	const s = {};
	for ( const k in UPGRADES ) {

		const lv = UPGRADES[ k ].levels;
		const i = Math.max( 0, Math.min( lv.length - 1, upgrades[ k ] | 0 ) );
		for ( const [ key, v ] of Object.entries( lv[ i ] ) ) if ( key !== 'cost' && key !== 'label' ) s[ key ] = v;

	}

	return s;

}
