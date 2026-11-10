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
//                     (the kayak's is a steady paddle's: docs/m16/kayak.md)
//     burn            [ idle, k ]: litres a second at rpm: idle + k rpm^2 (Gear.fuelBurn)
//     twin            (M17) { burn }: hers with a second engine fitted (stats.twin: the console's twin 150s): burnOf
//     drift           of the wind's speed, left to it, in a fair day's sea (Away.awayOf; tools/boat-figures.mjs)
//     draught         m of water she touches in (Away.awayOf; the lobster boat's is her skeg's, past her hull's 0.77)
//     storesDays      days of food and water she has room for
//     sockM2          the mouth of her drift sock, m^2: its drag holds her head to the sea (BoatController)
//     waters          what Marta says she's for
export const ABLE = {
	kayak: {
		seas: [ 0.5, 1 ], wind: [ 7.7, 10.3 ],
		cruise: { rpm: 0.7, speed: 1.6 }, burn: [ 0, 0 ], drift: 0.058, draught: 0.12, storesDays: 1, sockM2: 0.2,
		waters: 'The flats and the sheltered shallows, in up to 3 ft of sea and 20 knots of wind. A squall\'s a real danger',
	},
	console: {
		seas: [ 1.2, 2.2 ], wind: [ 10.3, 14.4 ],
		// ((M17) a single Yamaha F150's burn, and two's: their own bulletins fitted, docs/m17/back.md. A 21 ft boat on one F150 burns
		// 0.8 gal an hour at 1,000 rpm, 6.5 at 4,000 and 16.1 flat out at 5,900; the Regulator 23 on two, 1.6, 13.9 and 31.4. Her
		// M16 figure, 0.002 and 0.03, was about the twins' on her single)
		cruise: { rpm: 0.7, speed: 12.1 }, burn: [ 0.00084, 0.0154 ], twin: { burn: [ 0.00168, 0.0312 ] }, drift: 0.055, draught: 0.53, storesDays: 3, sockM2: 2,
		waters: 'The reef, the wrecks and the near offshore, in up to 7 ft of sea and 28 knots of wind. A blow sends you running in',
	},
	lobster: {
		seas: [ 2, 3.5 ], wind: [ 15.4, 20.6 ],
		cruise: { rpm: 0.7, speed: 7.1 }, burn: [ 0.0025, 0.024 ], drift: 0.066, draught: 1, storesDays: 5, sockM2: 2.5,
		waters: 'Nearshore and the reef\'s edge, in up to 11 ft of sea and 40 knots of wind',
	},
	sportfisher: {
		seas: [ 3, 5 ], wind: [ 18, 26 ],
		cruise: { rpm: 0.7, speed: 13.1 }, burn: [ 0.004, 0.21 ], drift: 0.072, draught: 1.4, storesDays: 14, sockM2: 7,
		waters: 'The far grounds and the deep, for days at a time, in up to 16 ft of sea and 50 knots of wind',
	},
};

// (a boat's figures, or the lobster boat's for one that's not on the list)
export const ableOf = ( boat ) => ABLE[ boat ] || ABLE.lobster;
// (M17) her burn as she's fitted: [ idle, k ], a second engine's with twin
export const burnOf = ( boat, twin = false ) => {

	const A = ableOf( boat );
	return twin && A.twin ? A.twin.burn : A.burn;

};
// (for Away.awayOf: what's her own of how she fares left to it)
export const ableEnv = ( boat ) => {

	const A = ableOf( boat );
	return { drift: A.drift, draught: A.draught, boat };

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
// (a marine diesel generator of a boat this size, about 20 kW, at half load: a gallon an hour (docs/m16/opening.md), from
// her tank, while it runs the icemaker away from her berth's shore power)
export const GENERATOR_LH = 3.8;
// A bag of ice is 10 lb. How fast the box melts it (kg an hour, in the tropics). ((M17) from sources: docs/m17/figures.md.) The
// box melts every hour, by night and at her berth as well as out in the sun, so each figure is the mean of a whole day:
//   - a cheap cooler (thin foam, a lid that leaks): COOLER_KGH for the 48-quart, a bag in about 23 hours. FAO's measured box (below)
//     scaled to its 45 L is 0.10 in shade; a cheap one leaks 1.5 to 2 times as much, 0.15 to 0.2 in shade and 0.2 to 0.3 in a
//     deck's sun opened through the day (52 to 55 quart coolers latched in a Carolina summer's sun, Pew Pew Tactical: 0.15;
//     Coleman's claim for its 48-quart, 0.3 at a steady 32 C). A day out in the sun and its night come to about 0.2 (M16 had
//     0.3, the hot and busy end). A bigger one leaks as its surface does (volume^(2/3));
//   - an insulated hold or fish box, in her deck out of the sun: FAO's measured melt, 0.1233 kg a day for each degree of the
//     air from a 90 L insulated fish container in shade (FAO Fisheries Technical Paper 436, 7.1: 3.6 kg a day at 28 C), at the
//     island's 28 C (AIR_C, the sea's too) and scaled by surface. About half M16's (60% of a cheap cooler's)
// A box's litres are LITRES_PER_KG of what it holds: the 48-quart's 45 L for its 30 kg.
// Each fish that goes in gives up its heat to the ice: 28 C to 0 at 3.4 kJ/kg/K, against ice's 334 kJ/kg (FAO's reckoning)
export const ICE_BAG_KG = 4.54, ICE_BAG_PRICE = 4;
export const CHILL_KG = 0.285;
export const COOLER_KGH = 0.2, AIR_C = 28, LITRES_PER_KG = 1.5, FAO_MELT = { kgDayC: 0.1233, litres: 90 };
export const meltKgH = ( holdKg, insulated = holdKg >= 160 ) => {

	const kg = Math.max( holdKg, 1 );
	return insulated ? FAO_MELT.kgDayC * AIR_C / 24 * Math.pow( kg * LITRES_PER_KG / FAO_MELT.litres, 2 / 3 ) : COOLER_KGH * Math.pow( kg / 30, 2 / 3 );

};
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
// you're parched after DRY_H, weaker all the way to WEAK_H more on. ((M17) from sources: docs/m17/figures.md) A day's stores are
// a day's food and STORES_WATER_L of water: about 6 L for a day's moderate work in the sun at 30 C (WHO, Howard and Bartram
// 2003, after White et al. 1972: 4.5 L at 25 C, about 6 at 30; FEMA's gallon, 3.8 L, is the least, for someone at rest).
// STORES_PRICE, a day's as Marta has them: a day of the USDA's Thrifty Food Plan for one adult living alone (December 2025: a
// week $71.40 for a man of 20 to 50, $56.90 for a woman, and 20% more for one alone: $11.00 a day between them) and the water
// bottled, at the 2.4 cents an ounce IBWA gives for 2025 ($4.87): $16 (M16 had $12, not sourced)
export const STORES_PRICE = 16, STORES_WATER_L = 6, LUNCH_H = 12, DRY_H = 12, WEAK_H = 36;
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

// ---- the distress gear ((M17) from sources: docs/m17/figures.md)
// VHF: a set reaches as far as its antenna and the other's see each other over the sea's curve, each one's radio horizon added:
// d = RADIO_HORIZON_M (sqrt h + sqrt h'), h in m over the sea (the 4/3 earth's, sqrt( 2 x 4/3 x 6,371 km ) = 4.12 km; Bowditch's
// radar horizon, ch. 22, 2.21 nm sqrt h). Inside it a set's watts hardly count: Standard Horizon's HX-870 manual has range going
// by the antenna's height far more than the power. Each antenna's height, to its middle, from the models:
//   hand         the handheld, held up to your face sat in the kayak (KayakModel's eye, 0.94 m over the water)
//   console      the 2.3 m whip on her T-top (ConsoleHelm's TOP.y, 2.56 m)
//   lobster      the 2.4 m whip on her roof's after corner (Wheelhouse: roofTopY, 2.39 m, and its mount)
//   sportfisher  an 8 ft (2.44 m) whip on a mount at her hardtop's after corner, as the lobster boat's (its edge 5.18 m:
//                SportfisherBridge's hardtop; her model draws none)
// The shore's: Marta's set is a chandler's coast station, not the Coast Guard's tower; its antenna's on her boathouse by the
// chandlery, the highest thing there with the bay open to the south (its ridge 5.25 m over the sea: Buildings.buildBoathouse
// on its ground), an 8 ft base station whip on a 3 m pole stood on the ridge. Up the spur behind the village it would need a
// long run of coax or a repeater, more than a village chandler has. Pearl's is the same on her camp's shed (its front 4.3 m).
// So Marta's from a handheld in the kayak about 16.8 km, the console and the lobster boat 20.6, the sportfisher 23.2 (M16 had
// a handheld's 9 km and any fixed set's 37, which would want her antenna 50 m up). Line of sight only: the island's hills
// don't shade it here.
// FLARE_M: a red meteor seen, m (x the day's visibility), the one place the look (DaysOut._flareBright) and the seen test
// (DaysOut.fire, theirFlare) both read. By Allard's law with the game's 16,000 cd (Orion's 12-gauge red meteor): at night to
// the eye's least, 2e-7 lux, 25 km, 11 to 15 nm in 10 nm of visibility (it stands). By day to IALA's least for a light seen
// by day, 1,600 cd at half a mile (USCG R&D Center, CG-D-04-20, 2019), in clear air: 2.6 km. The R&D Center's watchers
// picked out the 30,000 cd SOLAS flares regularly at 2 nm, a little past Allard's 1.9 for them; as much past it for a meteor
// is 2.8 km (M16 had 5)
// The EPIRB: a fix in about EPIRB_S (MEOSAR's 10 minutes, 5 km, 95%) then the boat out to you. PASSING_H: with nothing
// to call with, how many island hours till someone happens by, near and far
export const RADIO_HORIZON_M = 4120;
export const VHF_H = { hand: 1.0, console: 3.71, lobster: 3.66, sportfisher: 6.47 };
export const SHORE_VHF_H = { marta: 9.5, pearl: 8.5 };
export const FLARE_M = { day: 2800, night: 25000 }, FLARES = 3, EPIRB_S = 600;
export const PASSING_H = { near: 4, far: 18, farM: 14000 };
// how far two antennas reach each other (m over the sea; none, nothing)
export const vhfReach = ( h, h2 ) => ( h > 0 && h2 > 0 ? RADIO_HORIZON_M * ( Math.sqrt( h ) + Math.sqrt( h2 ) ) : 0 );
// how far her set (gearStats' vhfH: its antenna's height, 0 with none) reaches a shore set: 'marta' | 'pearl'
export const reachTo = ( stats, who = 'marta' ) => vhfReach( ( stats && stats.vhfH ) || 0, SHORE_VHF_H[ who ] || SHORE_VHF_H.marta );
// (a set's reach to Marta in whole nautical miles, for the shop's words)
const nmToMarta = ( h ) => Math.round( vhfReach( h, SHORE_VHF_H.marta ) / 1852 );

// the finder's echo: what its transducer reaches (m). A 200 kHz puck paints the bottom to about 60 m, a dash set to the
// workboat sounder's 1,200 ft (Instruments.SOUNDER_REACH), a 1 kW 50 kHz through-hull to about 900, a 2 kW to the deep's floor
export const FINDER_M = { puck: 60, set: 366, deep: 900, deepest: 1900 };

// ---- her gear for it: Gear.js' UPGRADES, keyed <what>_<boat> so each boat's are her own. The lobster boat's plotter and
// VHF are in her wheelhouse from M15, and the sportfisher's are on her helm: BASE, not bought. (M17) vhfH: her VHF's antenna,
// m over the sea (VHF_H), 0 with none; how far it reaches is reachTo( stats, who )
export const BASE = {
	kayak: { compass: true, plotter: false, vhfH: 0, finderM: FINDER_M.puck, deepFinder: false, sock: false },
	console: { compass: true, plotter: false, vhfH: 0, finderM: FINDER_M.set, deepFinder: false, sock: false },
	lobster: { compass: true, plotter: true, vhfH: VHF_H.lobster, finderM: FINDER_M.set, deepFinder: false, sock: false },
	sportfisher: { compass: true, plotter: true, vhfH: VHF_H.sportfisher, finderM: FINDER_M.set, deepFinder: false, sock: false },
};

const track = ( name, boat, cost, label, stats, none = 'None' ) => ( { name, on: boat, levels: [ { cost: 0, label: none }, { cost, label, ...stats } ] } );
// (deepest: anchorM, its rode at 3 to 1, as the anchor's is: 600 ft reaches 60 m, the shelf's edge; 1,200 ft 122 m, the
// hump's top; 2,400 ft 244 m, the north ledge. Offshore it's 1,800 m: there's the sock)
export const DAYS_TRACKS = {
	vhf_kayak: track( 'VHF radio', 'kayak', 60, `Handheld VHF, 5 watts (Marta hears it ${ nmToMarta( VHF_H.hand ) } miles out)`, { vhfH: VHF_H.hand } ),
	vhf_console: track( 'VHF radio', 'console', 140, `Fixed VHF on an 8 ft whip (Marta hears it ${ nmToMarta( VHF_H.console ) } miles out)`, { vhfH: VHF_H.console } ),
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
