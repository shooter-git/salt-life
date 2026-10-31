import { seaHeight, squallWind } from './Weather.js';

// (M16) What each boat can stand, and what she carries for a day or days out: figures only and a little arithmetic (no
// three.js, no game), so Gear.js, Chart.js and Away.js can read it. game/DaysOut.js does what they say. No walls: how far
// a boat goes comes of the sea she can stand (bigger out past the island's lee and past the far grounds: Weather.withEdge),
// her fuel, what she can call for help with, and what she has aboard. The doc's sources: docs/m16/days-out.md.
//
//   seaHere( w, depth, fetch ) -> m       the seas where you are: the open sea's, less what the land and the shallows take
//   fetchAt( x, z, wx, wz, height ) -> m  the open water to windward
//   strainOf( boat, Hs, U ) -> 0..        0 fine, up to 1 rough for her, past 1 too much for her
//
//   ABLE[ boat ]
//     seas, wind      [ easy, too much ]: significant wave height (m), the wind (m/s) she's worked by
//     cruise          { rpm, speed }: her cruise, the revs and her speed there on a calm sea (m/s), measured by tools/boat-figures.mjs
//     burn            [ idle, k ]: litres a second at rpm: idle + k rpm^2 (Gear.fuelBurn)
//     drift           of the wind's speed, left to it, beam-on (Away.awayOf)
//     draught         m of water she touches in (Away.awayOf)
//     storm           what a storm takes of her left out in it, against the lobster boat's (Away.awayOf)
//     storesDays      days of food and water she has room for
//     sockM2          the mouth of her drift sock, m^2: its drag holds her head to the sea (BoatController)
//     waters          what Marta says she's for
export const ABLE = {
	kayak: {
		seas: [ 0.5, 1 ], wind: [ 7.7, 10.3 ],
		cruise: { rpm: 0.7, speed: 1.5 }, burn: [ 0, 0 ], drift: 0.03, draught: 0.15, storm: 2, storesDays: 1, sockM2: 0.2,
		waters: 'The flats and the sheltered shallows, in up to 3 ft of sea and 20 knots of wind. A squall\'s a real danger',
	},
	console: {
		seas: [ 1.2, 2.2 ], wind: [ 10.3, 14.4 ],
		cruise: { rpm: 0.7, speed: 11 }, burn: [ 0.002, 0.03 ], drift: 0.05, draught: 0.5, storm: 1.3, storesDays: 3, sockM2: 1.1,
		waters: 'The reef, the wrecks and the near offshore, in up to 7 ft of sea and 28 knots of wind. A blow sends you running in',
	},
	lobster: {
		seas: [ 2, 3.5 ], wind: [ 15.4, 20.6 ],
		cruise: { rpm: 0.7, speed: 7.1 }, burn: [ 0.0025, 0.024 ], drift: 0.05, draught: 1, storm: 1, storesDays: 5, sockM2: 2.5,
		waters: 'Nearshore and the reef\'s edge, in up to 11 ft of sea and 40 knots of wind',
	},
	sportfisher: {
		seas: [ 3, 5 ], wind: [ 18, 26 ],
		cruise: { rpm: 0.7, speed: 13 }, burn: [ 0.004, 0.21 ], drift: 0.06, draught: 1.4, storm: 0.7, storesDays: 14, sockM2: 7,
		waters: 'The far grounds and the deep, for days at a time, in up to 16 ft of sea and 50 knots of wind',
	},
};

// (a boat's figures, or the lobster boat's for one that's not on the list)
export const ableOf = ( boat ) => ABLE[ boat ] || ABLE.lobster;
// (for Away.awayOf: what's her own of how she fares left to it)
export const ableEnv = ( boat ) => {

	const A = ableOf( boat );
	return { drift: A.drift, draught: A.draught, wearMul: A.storm };

};

// the drift sock: of her drift without it (from BoatController with her `sockM2` out, measured by tools/boat-figures.mjs)
export const SOCK_DRIFT = 0.5;

// ---- the seas where you are
// the wind sea grows with the open water to windward as its square root (SMB's fetch-limited growth), to the open sea's
// by SEA_FETCH (m); the swell's taken by the shoaling water, from the open sea's at SWELL_DEEP m to SWELL_LEAST of it at
// SWELL_SHOAL; and no wave stands higher than DEPTH_LIMIT of the water under it (it breaks first)
const SEA_FETCH = 3000, FETCH_STEPS = [ 40, 90, 200, 400, 800, 1500, 2200, 3000 ];
const SWELL_DEEP = 60, SWELL_SHOAL = 5, SWELL_LEAST = 0.45, DEPTH_LIMIT = 0.5;
export function seaHere( w, depth = Infinity, fetch = SEA_FETCH ) {

	const kW = Math.min( 1, Math.sqrt( Math.max( 0, fetch ) / SEA_FETCH ) );
	const t = Math.min( 1, Math.max( 0, ( depth - SWELL_SHOAL ) / ( SWELL_DEEP - SWELL_SHOAL ) ) );
	const Hs = seaHeight( w.swell * ( SWELL_LEAST + ( 1 - SWELL_LEAST ) * t ), ( w.windSea ?? w.swell ) * kW );
	return Math.min( Hs, depth * DEPTH_LIMIT );

}

// how far to windward (the wind blowing toward wx, wz) the land is, in a few looks along it (height( x, z ) -> m, the sea at 0)
export function fetchAt( x, z, wx, wz, height ) {

	for ( const d of FETCH_STEPS ) if ( height( x - wx * d, z - wz * d ) > 0 ) return d;
	return SEA_FETCH;

}

// how hard the sea and wind are working her: past `easy`, up to 1 at `too much`, on past it
const over = ( v, [ a, b ] ) => ( v <= a ? 0 : ( v - a ) / ( b - a ) );
export const strainOf = ( boat, Hs, U ) => {

	const A = ableOf( boat );
	return Math.max( over( Hs, A.seas ), over( U, A.wind ) );

};

// the wind she feels of a weather (a squall's gusts as well, as the Hull reckons them)
export const windOn = squallWind;

// the green water past what she can stand (L/s): more than the bucket beats (Hull.BAIL_LS, 3) half as far again past it
export const awashLs = ( strain ) => ( strain > 1 ? Math.min( 8, 6 * ( strain - 1 ) ) : 0 );
// what a slam costs her, for how hard she's being worked (Hull.slam)
export const slamK = ( strain ) => 1 + 0.5 * Math.min( 1, strain );

// ---- the box and the catch
// A bag of ice is 10 lb. How fast the box melts it (kg an hour, in the tropics): a cheap 48-quart cooler goes through a
// bag in about 15 hours, and a bigger one leaks as its surface does (volume^(2/3)); an insulated hold, 60% of that.
// Each fish that goes in gives up its heat to the ice: 28 C to 0 at 3.4 kJ/kg/K, against ice's 334 kJ/kg (FAO's reckoning)
export const ICE_BAG_KG = 4.54, ICE_BAG_PRICE = 4;
export const CHILL_KG = 0.285;
export const meltKgH = ( holdKg, insulated = holdKg >= 160 ) => 0.3 * Math.pow( Math.max( holdKg, 1 ) / 30, 2 / 3 ) * ( insulated ? 0.6 : 1 );
// Fish ages by warm hours. Left at the sea's 28 C it's going soft after FRESH_H and off by KEEP_H (Away.KEEP_H's FDA
// reasoning); iced, it ages ICED_SLOW times slower, so the 12 days FAO gives fish from tropical water at the least
export const FRESH_H = 6, OFF_H = 12, ICED_SLOW = 24;
// what it still fetches: all of it while it's fresh, falling to GOING of it as it goes off
export const GOING = 0.5;
export const worthOf = ( w ) => ( w <= FRESH_H ? 1 : w >= OFF_H ? GOING : 1 - ( 1 - GOING ) * ( w - FRESH_H ) / ( OFF_H - FRESH_H ) );

// `hours` (island) go by: the ice melts, and each fish ages as it does. fish: { kg, value, v0: what it fetched fresh,
// w: warm hours }, value set by worthOf; those gone off are returned in `off` and left out of `fish`.
//   makes: kg an hour an icemaker adds
// -> { ice, fish, off: [ fish ], iced: hours it lasted }
export function keepCatch( fish, ice, hours, melt, makes = 0 ) {

	const net = melt - makes, iced = net <= 0 ? ( ice > 0 || makes > 0 ? hours : 0 ) : Math.min( hours, ice / net );
	const warm = hours - iced, aged = iced / ICED_SLOW + warm;
	const left = [], off = [];
	for ( const f of fish ) {

		f.v0 ??= f.value;
		f.w = ( f.w || 0 ) + aged;
		if ( f.w >= OFF_H ) off.push( f );
		else {

			f.value = Math.max( 1, Math.round( f.v0 * worthOf( f.w ) ) );
			left.push( f );

		}

	}

	return { ice: Math.max( 0, ice - net * iced ), fish: left, off, iced };

}

// how the catch is, as the fish tab says it: 'iced' | 'fresh' | 'going' (past FRESH_H: its price is falling)
export const stateOf = ( f, iced ) => ( ( f.w || 0 ) > FRESH_H ? 'going' : iced ? 'iced' : 'fresh' );

// ---- food and water
// A day trip takes its lunch and a bottle: the first LUNCH_H out cost nothing. Then a day's stores a day; with none left
// you're parched after DRY_H, weaker all the way to WEAK_H more on. STORES_PRICE: a day's, as a shop has them
export const STORES_PRICE = 12, LUNCH_H = 12, DRY_H = 12, WEAK_H = 36;
export function feedOf( { stores, out, dry }, hours ) {

	const free = Math.max( 0, Math.min( hours, LUNCH_H - out ) ), eat = ( hours - free ) / 24;
	const had = Math.min( stores, eat );
	return { stores: stores - had, out: out + hours, dry: had < eat ? dry + ( eat - had ) * 24 : 0 };

}

// how much of your strength's left (0.5 at the worst)
export const strengthOf = ( dry ) => 1 - 0.5 * Math.min( 1, Math.max( 0, dry - DRY_H ) / WEAK_H );

// what the save keeps (GameState's days): each boat's box and lockers { ice: kg, stores: days }; how long you've been out,
// how long dry; your flares
export const cleanDays = ( d ) => {

	const num = ( v, least = 0 ) => ( Number.isFinite( v ) ? Math.max( least, v ) : least ), boats = {};
	for ( const [ k, b ] of Object.entries( d && d.boats && typeof d.boats === 'object' ? d.boats : {} ) ) if ( ABLE[ k ] && b ) boats[ k ] = { ice: num( b.ice ), stores: num( b.stores ) };
	return { boats, out: num( d && d.out ), dry: num( d && d.dry ), flares: d && Number.isFinite( d.flares ) ? Math.max( 0, Math.min( FLARES, d.flares ) ) : FLARES };

};

// ---- the distress gear
// VHF: a handheld's 5 watts at sea level, to about 5 miles; a fixed set's 25 on a mast, to about 20. FLARE_M: a red meteor seen by day and on a clear night, m (× the day's visibility).
// The EPIRB: a fix in about EPIRB_S (MEOSAR's 10 minutes, 5 km, 95%) then the boat out to you. PASSING_H: with nothing
// to call with, how many island hours till someone happens by, near and far
export const VHF_HAND_M = 9000, VHF_FIXED_M = 37000, FLARE_M = { day: 5000, night: 25000 }, FLARES = 3, EPIRB_S = 600;
export const PASSING_H = { near: 4, far: 18, farM: 14000 };

// the finder's echo: what its transducer reaches (m). A 200 kHz puck paints the bottom to about 60 m, a dash set to the
// workboat sounder's 1,200 ft (Instruments.SOUNDER_REACH), a 1 kW 50 kHz through-hull to about 900, a 2 kW to the deep's floor
export const FINDER_M = { puck: 60, set: 366, deep: 900, deepest: 1900 };

// ---- her gear for it: Gear.js' UPGRADES, keyed <what>_<boat> so each boat's are her own. The lobster boat's plotter and
// VHF are in her wheelhouse from M15, and the sportfisher's are on her helm: BASE, not bought
export const BASE = {
	kayak: { compass: true, plotter: false, vhfM: 0, finderM: FINDER_M.puck, deepFinder: false, sock: false },
	console: { compass: true, plotter: false, vhfM: 0, finderM: FINDER_M.set, deepFinder: false, sock: false },
	lobster: { compass: true, plotter: true, vhfM: VHF_FIXED_M, finderM: FINDER_M.set, deepFinder: false, sock: false },
	sportfisher: { compass: true, plotter: true, vhfM: VHF_FIXED_M, finderM: FINDER_M.set, deepFinder: false, sock: false },
};

const track = ( name, boat, cost, label, stats, none = 'None' ) => ( { name, on: boat, levels: [ { cost: 0, label: none }, { cost, label, ...stats } ] } );
// (deepest: anchorM, its rode at 3 to 1, as the anchor's is: 600 ft reaches 60 m, the shelf's edge; 1,200 ft 122 m, the
// hump's top; 2,400 ft 244 m, the north ledge. Offshore it's 1,800 m: there's the sock)
export const DAYS_TRACKS = {
	vhf_kayak: track( 'VHF radio', 'kayak', 60, 'Handheld VHF, 5 watts (5 miles)', { vhfM: VHF_HAND_M } ),
	vhf_console: track( 'VHF radio', 'console', 140, 'Fixed VHF on an 8 ft whip (20 miles)', { vhfM: VHF_FIXED_M } ),
	plotter_kayak: track( 'Handheld GPS', 'kayak', 90, 'Handheld GPS: how far home, on which bearing', { plotter: true } ),
	plotter_console: track( 'Chartplotter', 'console', 220, 'Chartplotter at the helm, with your marks', { plotter: true } ),
	deepFinder_console: track( 'Deep fish finder', 'console', 300, 'Second finder, 1 kW through-hull: the bottom to 3,000 ft, the drop-off seen on it', { deepFinder: true, finderM: FINDER_M.deep } ),
	deepFinder_lobster: track( 'Deep fish finder', 'lobster', 350, 'Second finder, 1 kW through-hull: the bottom to 3,000 ft, the drop-off seen on it', { deepFinder: true, finderM: FINDER_M.deep } ),
	deepFinder_sportfisher: track( 'Deep fish finder', 'sportfisher', 650, 'Second finder, 2 kW: the bottom all the way down, the drop-off seen on it', { deepFinder: true, finderM: FINDER_M.deepest } ),
	deepAnchor_console: track( 'Deep-water anchor', 'console', 160, 'Deep-water anchor, 600 ft of rode: holds in 200 ft', { anchorM: 61 } ),
	deepAnchor_lobster: track( 'Deep-water anchor', 'lobster', 280, 'Deep-water anchor, 1,200 ft of rode: holds in 400 ft', { anchorM: 122 } ),
	deepAnchor_sportfisher: track( 'Deep-water anchor', 'sportfisher', 480, 'Deep-water anchor, 2,400 ft of rode: holds in 800 ft', { anchorM: 244 } ),
	driftSock_kayak: track( 'Drift sock', 'kayak', 30, 'Drift sock: slows her drift, her head to the sea', { sock: true } ),
	driftSock_console: track( 'Drift sock', 'console', 60, 'Drift sock: past the anchor\'s reach, slows her drift, her head to the sea', { sock: true } ),
	driftSock_lobster: track( 'Drift sock', 'lobster', 90, 'Drift sock: past the anchor\'s reach, slows her drift, her head to the sea', { sock: true } ),
	driftSock_sportfisher: track( 'Drift sock', 'sportfisher', 180, 'Parachute sock: past the anchor\'s reach, slows her drift, her head to the sea', { sock: true } ),
	// (your own, as the doc's Safety: the tackle stream's to sell, its stats read here)
	safety: { name: 'Safety', levels: [
		{ cost: 0, label: 'None' },
		{ cost: 40, label: 'Life jacket: a capsized kayak costs less', lifeJacket: true },
		{ cost: 200, label: 'Flares and an EPIRB: found and towed in when you\'re in trouble far out', lifeJacket: true, flares: true, epirb: true },
	] },
};
