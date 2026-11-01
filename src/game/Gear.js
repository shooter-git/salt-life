import { BOATS } from '../world/boat/Boats.js';
import { ableOf, BASE, DAYS_TRACKS } from './Seaworthy.js';

// Gear and upgrade data, sold by Marta at the chandlery by the boathouse; everything the game reads
// goes through gearStats( state.upgrades ), so buying a level is just state.upgrades[ key ]++ and the
// stats follow.
//
// Each track: levels[ 0 ] is what you start with; cost is the price of that level (0 for the first).
// (M16) on: the boat it belongs to (world/boat/Boats.js: it counts only while she's the boat you're in, and stays with her
// when you're in another); without it, it's your own gear, and goes with you onto any boat.
export const UPGRADES = {
	// rod and reel
	line: { name: 'Fishing line', levels: [
		{ cost: 0, label: '8 lb mono', lineKg: 7 },
		{ cost: 60, label: '15 lb mono', lineKg: 13 },
		{ cost: 180, label: '30 lb braid', lineKg: 26 },
		{ cost: 450, label: '60 lb braid', lineKg: 50 },
	] },
	// ((M16) spoolM: the line it holds; dragKg: the most its drag holds (CatchMinigame), none to speak of on a spinning
	// reel, whose fight's as it always was; twoSpeed: a low gear)
	reel: { name: 'Reel', levels: [
		{ cost: 0, label: 'Old spinning reel', reelSpeed: 1.1, spoolM: 180, dragKg: null },
		{ cost: 90, label: 'Smooth spinning reel', reelSpeed: 1.6, spoolM: 220, dragKg: null },
		{ cost: 320, label: 'Conventional reel', reelSpeed: 2.2, spoolM: 350, dragKg: 12 },
		{ cost: 900, label: 'Two-speed lever drag reel', reelSpeed: 2.6, spoolM: 600, dragKg: 24, twoSpeed: true },
	] },
	rod: { name: 'Rod', levels: [
		{ cost: 0, label: 'Hand-me-down rod', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', castM: 45 },
		{ cost: 600, label: 'Stand-up trolling rod, roller guides and a gimbal butt', castM: 30, standUp: true },
	] },
	// (M16) your own gear for the big fish (game/rigs/Presentation.js, docs/m16/tackle.md). The leader: the sensible one of
	// those you've bought is tied on for what you're doing (leaderFor). landKg: the heaviest you lift aboard for sure
	// (past it, more and more shake off at the boat); polarized: fish seen under the water; swimMul, breathS, airS
	// (Player.setDive); lifeJacket, flares and epirb are read by the kayak and DaysOut
	leader: { name: 'Leader', levels: [
		{ cost: 0, label: 'Light mono leader', leader: 0 },
		{ cost: 40, label: 'Fluorocarbon leader', leader: 1 },
		{ cost: 60, label: 'Wire leader, for wahoo and kings', leader: 2 },
		{ cost: 90, label: '200 lb mono leader, for billfish', leader: 3 },
	] },
	lures: { name: 'Lures', levels: [
		{ cost: 0, label: 'None', lures: 0 },
		{ cost: 50, label: 'Jigs', lures: 1 },
		{ cost: 90, label: 'Plugs', lures: 2 },
		{ cost: 180, label: 'Trolling skirts', lures: 3 },
	] },
	landing: { name: 'Landing', levels: [
		{ cost: 0, label: 'Your hands', landKg: 12, gaff: false, dehooker: false, tagKit: false },
		{ cost: 60, label: 'A gaff', landKg: 250, gaff: true, dehooker: false, tagKit: false },
		{ cost: 80, label: 'Release dehooker and billfish tag kit', landKg: 250, gaff: true, dehooker: true, tagKit: true },
	] },
	glasses: { name: 'Polarized glasses', levels: [
		{ cost: 0, label: 'None', polarized: false },
		{ cost: 120, label: 'Polarized glasses (fish seen under the water, from the tower above all)', polarized: true },
	] },
	diveKit: { name: 'Dive kit', levels: [
		{ cost: 0, label: 'None', swimMul: 1, breathS: 50, airS: 0 },
		{ cost: 80, label: 'Mask and fins (faster swimming)', swimMul: 1.45, breathS: 50, airS: 0 },
		{ cost: 220, label: 'Long fins and a wetsuit (a longer breath)', swimMul: 1.65, breathS: 80, airS: 0 },
		{ cost: 600, label: 'Scuba tanks (fresh from the rack on every dive)', swimMul: 1.65, breathS: 80, airS: 6800 },
	] },
	safety: { name: 'Safety', levels: [
		{ cost: 0, label: 'None', lifeJacket: false, flares: false, epirb: false },
		{ cost: 40, label: 'Life jacket (a capsized kayak costs less)', lifeJacket: true, flares: false, epirb: false },
		{ cost: 200, label: 'Flares and an EPIRB (found and towed in when you\'re in trouble far out)', lifeJacket: true, flares: true, epirb: true },
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
	baitWell: { name: 'Bait well', on: 'lobster', levels: [
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
	hold: { name: 'Fish hold', on: 'lobster', levels: [
		{ cost: 0, label: 'Cooler', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', holdKg: 160 },
	] },
	fuel: { name: 'Fuel tank', on: 'lobster', levels: [
		{ cost: 0, label: '11-gallon tank', fuelL: 40 },
		{ cost: 150, label: '21-gallon tank', fuelL: 80 },
		{ cost: 380, label: '40-gallon tank', fuelL: 150 },
	] },
	engine: { name: 'Engine', on: 'lobster', levels: [
		{ cost: 0, label: 'Tired diesel', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', speedMul: 1.3 },
	] },
	fishFinder: { name: 'Fish finder', on: 'lobster', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', finder: true },
	] },
	// (Salt Life) the deck floodlights: after dark yellowtail, jacks and houndfish gather in their pool
	// astern (FishTable flood, Game.floodAt)
	lights: { name: 'Boat lights', on: 'lobster', levels: [
		{ cost: 0, label: 'Nav lights only', deckLights: false },
		{ cost: 140, label: 'Deck floodlights (fish gather under them after dark)', deckLights: true },
	] },
	// (Salt Life) the anchor: it goes down when you leave the helm out on the water and comes up when
	// you take it again (Game.updateAnchor); anchorM: the deepest water its rode holds in (at three
	// times the depth, as rode is let out: 200 ft holds in 66)
	anchor: { name: 'Anchor', on: 'lobster', levels: [
		{ cost: 0, label: 'None', anchorM: 0 },
		{ cost: 100, label: 'Danforth anchor, 200 ft of rode', anchorM: 20 },
	] },
	// (M10) what takes the water out of her bilge (Hull.js) besides you with the bucket: an electric pump
	// that clears it slowly by itself (pumpLs, litres a second: more than the rain brings in)
	bilgePump: { name: 'Bilge pump', on: 'lobster', levels: [
		{ cost: 0, label: 'A bucket', pumpLs: 0 },
		{ cost: 120, label: 'Electric bilge pump', pumpLs: 0.3 },
	] },
	// (M16) lobster traps, each with its warp and buoy (Traps.js): for the hauler and davit only she has, so they're hers.
	// About $70 each, as a wire trap, 120 ft of warp and a buoy cost. unlock: false, what the sportfisher's unlock doesn't
	// ask for
	traps: { name: 'Lobster traps', on: 'lobster', unlock: false, levels: [
		{ cost: 0, label: 'None', traps: 0 },
		{ cost: 140, label: '2 wire traps, warp and buoys', traps: 2 },
		{ cost: 140, label: '4 wire traps, warp and buoys', traps: 4 },
		{ cost: 280, label: '8 wire traps, warp and buoys', traps: 8 },
	] },
	// (M15) a chart of the island and its waters out to the drop-off, for those who'd rather not chart it
	// themselves (Chart.js: the island's sheet and its names, the far sheet within SOLD.r); a waterproof one,
	// as a chandlery sells them, at what one costs
	chart: { name: 'Chart', levels: [
		{ cost: 0, label: 'Your own, as you go', chart: false },
		{ cost: 30, label: 'Waterproof chart of the island, to the drop-off', chart: true },
	] },
	// (M16) days out: navigation, the deep finder, the deep anchor and the sock on each boat, and your flares (Seaworthy.js)
	...DAYS_TRACKS,
	// (M16) the kayak's own (Boats.js' stats: what she is before them; game/fleet/Fleet.js: what's bought and sold)
	kayakCrate: { name: 'Crate cooler', on: 'kayak', levels: [
		{ cost: 0, label: 'A soft bag behind the seat' },
		{ cost: 40, label: 'Milk crate and a small cooler, strapped in the tankwell', holdKg: 25 },
	] },
	kayakPaddle: { name: 'Paddle', on: 'kayak', levels: [
		{ cost: 0, label: 'Plastic-bladed paddle', speedMul: 1 },
		{ cost: 90, label: 'Carbon-shaft paddle', speedMul: 1.12 },
	] },
	// (a line along her side that lets the anchor hold her bow, stern or beam to the sea, as a kayak has to)
	kayakAnchor: { name: 'Anchor trolley', on: 'kayak', levels: [
		{ cost: 0, label: 'None', anchorM: 0, trolley: false },
		{ cost: 50, label: 'Anchor trolley and a 3 lb grapnel', anchorM: 10, trolley: true },
	] },
	kayakFinder: { name: 'Fish finder puck', on: 'kayak', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 150, label: 'Castable fish finder puck (depth and fish on the HUD)', finder: true },
	] },
	// (a life jacket's worth of room: where the safety gear's life jacket goes, so it's on you and not in the way)
	kayakHatch: { name: 'Dry hatch', on: 'kayak', levels: [
		{ cost: 0, label: 'Nothing stays dry', jacketRoom: false },
		{ cost: 30, label: 'Dry hatch and deck bungees: a life jacket\'s worth of room', jacketRoom: true },
	] },
	// (M16) the center console's own
	consoleEngine: { name: 'Outboards', on: 'console', levels: [
		{ cost: 0, label: 'A single 150 outboard', speedMul: 1, twin: false },
		{ cost: 900, label: 'Twin 150 outboards', speedMul: 1.25, twin: true },
	] },
	consoleTop: { name: 'T-top', on: 'console', levels: [
		{ cost: 0, label: 'Open to the sky', tTop: false },
		{ cost: 350, label: 'T-top and its rain cover', tTop: true },
	] },
	consoleWell: { name: 'Livewell', on: 'console', levels: [
		{ cost: 0, label: 'A bait bucket', livewell: false },
		{ cost: 200, label: 'Livewell with a pump', baitMax: 80, livewell: true },
	] },
	consoleLadder: { name: 'Dive ladder', on: 'console', levels: [
		{ cost: 0, label: 'Over the side and hope', diveLadder: false },
		{ cost: 120, label: 'Dive ladder at the stern', diveLadder: true },
	] },
	consoleTanks: { name: 'Tank rack', on: 'console', levels: [
		{ cost: 0, label: 'None', tankRack: false },
		{ cost: 150, label: 'Tanks racked behind the leaning post', tankRack: true },
	] },
	// (M16) the sportfisher's own
	sfOutriggers: { name: 'Outriggers', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', outriggers: false },
		{ cost: 1200, label: 'Outriggers, for a spread of baits', outriggers: true },
	] },
	sfTower: { name: 'Tuna tower', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None: the flybridge is as high as she goes', tower: false },
		{ cost: 4000, label: 'Tuna tower with a second helm', tower: true },
	] },
	sfElectricReel: { name: 'Electric reel', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', electricReel: false },
		{ cost: 900, label: 'Electric reel, for deep-dropping', electricReel: true },
	] },
	sfFishBox: { name: 'Fish box', on: 'sportfisher', levels: [
		{ cost: 0, label: 'Her cockpit box' },
		{ cost: 800, label: 'Big insulated fish box', holdKg: 600 },
	] },
	sfIcemaker: { name: 'Icemaker', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', icemaker: false },
		{ cost: 1000, label: 'Icemaker', icemaker: true, iceMakesKgH: 5 },
	] },
	sfGenerator: { name: 'Generator', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', generator: false },
		{ cost: 1500, label: 'Diesel generator', generator: true },
	] },
	sfChair: { name: 'Fighting chair', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None: stand up and take it', chair: false },
		{ cost: 2000, label: 'Fighting chair in the cockpit', chair: true },
	] },
	sfUnderwaterLights: { name: 'Underwater lights', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', underwaterLights: false },
		{ cost: 600, label: 'Underwater lights, for swordfish at night', underwaterLights: true },
	] },
};

// (M16) what the sportfisher asks before she's shown: each of these tracks to this level (docs/M16.md: every upgrade on
// the lobster boat, and the rod, reel and line as they were before M16's big-game levels). A track added later, or a
// level above these, doesn't count
export const UNLOCK = { hold: 2, fuel: 2, engine: 2, baitWell: 2, fishFinder: 1, lights: 1, anchor: 1, bilgePump: 1, rod: 2, reel: 2, line: 3 };

// -> { done, of, met, left: [ what's next on each track that isn't there yet, by its label ] }
export function unlockProgress( upgrades ) {

	let done = 0, of = 0;
	const left = [];
	for ( const [ k, n ] of Object.entries( UNLOCK ) ) {

		const at = Math.min( n, upgrades[ k ] | 0 );
		done += at;
		of += n;
		if ( at < n ) left.push( UPGRADES[ k ].levels[ at + 1 ].label );

	}

	return { done, of, met: done >= of, left };

}

// (M16) what a boat's engine burns, at the chandlery ($ a litre: a fuel dock's, gasoline about 6% over diesel: docs/m16/fleet.md)
export const FUELS = {
	diesel: { name: 'Diesel', price: 1.5 },
	gasoline: { name: 'Gasoline', price: 1.6 },
};
export const FUEL_PRICE = FUELS.diesel.price; // $ per litre of diesel at the chandlery
// (M16) her fuel, { name, price }, or null with no engine; and at another's price, a seller who charges more for diesel
export const fuelOf = ( boat ) => FUELS[ BOATS[ boat ] && BOATS[ boat ].fuel ] || null;
export const fuelPrice = ( boat, dieselAt = FUEL_PRICE ) => ( fuelOf( boat ) ? fuelOf( boat ).price * dieselAt / FUEL_PRICE : dieselAt );
// (Salt Life) Marta's tow: she fetches your boat back to the dock when it's drifted off (the wind pushes
// a boat left without its anchor), and (M15) when you call her on the radio, out of fuel far out. A call-out
// and a little for every 100 m, as far as it is (it had a cap of $90: 1.4 km). It's her time she's paid
// for, as a towing firm bills it: out to you at `out` m/s (18 knots) and back with you in tow at `back` (6
// knots), so a 10 km tow is an hour and ten minutes of it and $520, about $435 an hour (Sea Tow gives $250 to
// $500 for those who aren't members, dock to dock). Nothing to tow within `from` metres of the dock (walk or
// swim to her)
export const TOW = { base: 20, per100m: 5, from: 30, out: 9.3, back: 3.1 };
export const towFee = ( metres ) => Math.round( TOW.base + TOW.per100m * Math.max( 0, metres ) / 100 );
// (M15) and for one that happens while you're away (Away.js), no more than from the far grounds' edge (24 km): a boat
// left adrift can lie 200 km off in a week, and that's too hard on someone who wasn't there
export const AWAY_TOW_MAX = towFee( 24000 );
export const awayTowFee = ( metres ) => Math.min( AWAY_TOW_MAX, towFee( metres ) );
// (M15) how long she's out on it (s: the real world's, as the boat runs)
export const towTime = ( metres ) => Math.max( 0, metres ) * ( 1 / TOW.out + 1 / TOW.back );
// (M13) Marta's haul-out ahead of a hurricane ($: less than the repair a hurricane leaves to do); the lobster boat's
// (M16: each boat's by her length, game/fleet/Fleet.js)
export const HAUL_FEE = 40;
// litres per second at the helm: idle plus a lot more at full rpm (40 L lasts ~25 min flat out; (M16) each boat's: Seaworthy)
export function fuelBurn( rpm, boat = 'lobster' ) {

	const [ idle, k ] = ableOf( boat ).burn;
	return idle + k * rpm * rpm;

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

// merged stats of the current levels: your own gear's and the boat's you're in, over what she is without them
export function gearStats( upgrades, boat = 'lobster' ) {

	const s = { ...BOATS[ boat ].stats, ...BASE[ boat ] };
	for ( const k in UPGRADES ) {

		if ( UPGRADES[ k ].on && UPGRADES[ k ].on !== boat ) continue;
		const lv = UPGRADES[ k ].levels;
		const i = Math.max( 0, Math.min( lv.length - 1, upgrades[ k ] | 0 ) );
		for ( const [ key, v ] of Object.entries( lv[ i ] ) ) if ( key !== 'cost' && key !== 'label' ) s[ key ] = v;

	}

	return s;

}
