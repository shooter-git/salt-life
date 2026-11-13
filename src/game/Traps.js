import { FISH, fishWeightKg } from './FishTable.js';
import { UPGRADES } from './Gear.js';
import { lastHurricane, categoryOf, weatherAt, towardOf } from './Weather.js';

// (M16) Lobster traps, as the rules have them: where one may be set and how the bottom suits it, what's in it after
// its soak, what a hurricane does to it, and what the save and the group's save keep. Pure (no three.js), for the tests
// under Node; TrapWork.js does it all at the rail, world/boat/TrapModel.js draws it. Sources: docs/m16/traps.md.
//   bottomAt( { depth, reefDist, windReef, patch, sand, grass, creek, onMap } ) -> a BOTTOMS id
//   whyNot( { depth, bottom, speed, dock } ) -> null, or why one can't be set here
//   soakOf( trap, T, now ) -> { hours, days, nights }    grown( nights )    meanCatch( q, soak, baited )    haulOf( trap, q, sizeCm, T, now ) -> what comes up
//   (M17) BAIT, baitSaid( trap, soak ), buyBait( traps, money ) -> what it cost: trap bait, ((M19) Joe's,) used up in a soak
//   settle( traps, T, env ) -> [ what the hurricanes did ]    trapsTold( events ) -> Marta's paragraphs
//   newTraps()  cleanTraps( raw )  ownedTraps( upgrades )  aboardTraps( traps, upgrades )
//   (M19) haulS( m, haulerMs ) -> s a trap takes to come up
//   buoyRecord( ... )  cleanBuoys( raw, now )  buoyOffset( x, z, depth )  buoyColours( id )

// 120 ft of warp (the most on a trap: over that the buoy's pulled under); the shallowest it's worth setting in (m); the
// fastest she can be going and set one, or stay on the hauler (m/s: a walking pace, 3 knots)
export const WARP_M = 36.6;
export const SHALLOW_M = 1.5;
export const SET_SPEED = 1.6;
export const HAUL_SPEED = 2.4;
// what a hydraulic hauler brings a warp in at (m/s: 236 ft a minute). (M17) Within what makers give for theirs, not measured on a
// lobster boat (none found): Hydro-Slave's 10 in hanging hauler about 166 ft a minute, Mustad's line haulers up to 425 and 500,
// Marco's crab hauler 600; a small boat's pump would put hers at 150 to 250 (docs/m17/figures.md)
export const HAULER_MS = 1.2;
// (M19) how long a trap takes to come up from `m` below her block (s), on her hauler (m/s: Gear's haulerMs, the bigger head and
// pump's 1.9: a Hydro-Slave 12 in head on an 11 gpm pump, 380 ft a minute, derived: docs/m19/sources-boats-bait.md, section 6)
export const haulS = ( m, ms = HAULER_MS ) => Math.max( 1, m / ( ms > 0 ? ms : HAULER_MS ) );
// what Marta asks for a trap to replace one lost, with its warp and buoy
export const TRAP_PRICE = 70;

// The bottoms: how well each fishes (q: of the best's), and how its lobsters run in length against the reef's (cm):
// the grass and the mangroves are the nurseries, full of shorts (NOAA Fisheries' species page: nearshore nurseries)
export const BOTTOMS = {
	edge: { name: 'the reef\'s edge', say: 'the best of it', q: 1, sizeCm: 1.5 },
	hard: { name: 'hard bottom', say: 'good ground', q: 0.8, sizeCm: 0.5 },
	shelf: { name: 'sand and rubble', say: 'fair ground', q: 0.45, sizeCm: 2 },
	grass: { name: 'seagrass', say: 'mostly shorts', q: 0.35, sizeCm: - 4 },
	sand: { name: 'open sand', say: 'poor ground', q: 0.12, sizeCm: 0 },
	mud: { name: 'mangrove mud', say: 'poor ground', q: 0.05, sizeCm: - 5 },
	coral: { name: 'live coral', say: 'it\'d crush it', q: 0, sizeCm: 0 },
};

// what the bottom under ( x, z ) is. reefDist: m from the bay's reef (< 0 over it); windReef, patch, sand, grass, creek:
// 0..1 of the windward reef's platform, the bank's patch reefs, the 4 m sand, the meadows, the mangroves; onMap: over
// the island's own map, where those are known
export function bottomAt( { reefDist = Infinity, windReef = 0, patch = 0, sand = 0, grass = 0, creek = 0, onMap = true } ) {

	if ( creek > 0.3 ) return 'mud';
	if ( reefDist < - 8 || windReef > 0.85 ) return 'coral';
	if ( reefDist < 35 || windReef > 0.05 || patch > 0.1 ) return 'edge';
	if ( ! onMap ) return 'shelf';
	if ( grass > 0.4 ) return 'grass';
	if ( sand > 0.5 ) return 'sand';
	return 'hard';

}

// why one can't be set here (the prompt's words), or null. dock: m from the dock and the pier
export function whyNot( { depth, bottom, speed = 0, dock = Infinity } ) {

	if ( dock < 30 ) return 'Not in the fairway: take her clear of the dock';
	if ( speed > SET_SPEED ) return 'Slow her down to set a trap';
	if ( depth < SHALLOW_M ) return 'Too shallow to set a trap';
	if ( depth > WARP_M ) return `Too deep: the warp's ${ Math.round( WARP_M / 0.3048 ) } ft`;
	if ( bottom === 'coral' ) return 'Live coral under you: it\'d crush it. Set off the reef\'s edge';
	return null;

}

// ---- the soak: catch rises with it at a decreasing rate, and with a long one may peak and fall as the bait goes and
// they find the way out (Austin's fit to Florida's traps). A spiny lobster forages by night and shelters by day, so
// it's the nights that count. most: lobsters in a trap on the best bottom soaked `full` nights, the fishery's two weeks: from
// Florida's 24 kg a trap a season in 1969-70, when there were few traps, in about 14 hauls, at 0.7 kg, 55% legal: 3.6 a
// haul. (M17) How it comes to that: Austin's own fit (Fishery Bulletin 75: 213, 1977) to Robinson and Dimitriou's 1963 Florida
// traps, catch a trap-day 2.94 B^-0.90 over a B-day soak (R^2 0.86), so a haul's catch goes as B^0.10: of the two weeks' catch,
// (n / 14)^0.1, 77% after the first night, 86% after three, 93% after a week (`grown`). Within the first night it comes in
// as the night goes. M16's 1 - e^(-n / 3) had 29%, 64% and 91% (docs/m17/figures.md). After `fade` days the trap's fishing
// out, toward `floor` of it (a long soak fishing worse: the 2024 video study of Florida's traps; the floor and the fade's
// time are judgement)
// (M19) most 3.85, the user's (docs/M19.md): M17's figures left judgement were taken to their sources' middle
export const SOAK = { most: 3.85, full: 14, power: 0.1, fade: 14, fadeTau: 14, floor: 0.4, nightFrom: 19.5, nightH: 10 };
// of the `full` soak's catch after n nights
export const grown = ( n ) => ( n <= 0 ? 0 : n < 1 ? n * Math.pow( 1 / SOAK.full, SOAK.power ) : Math.min( 1, Math.pow( n / SOAK.full, SOAK.power ) ) );

// the island's hours from T0 to T1 that were night, in nights
export function nightsIn( T0, T1 ) {

	if ( ! ( T1 > T0 ) ) return 0;
	const { nightFrom, nightH } = SOAK;
	let h = 0;
	for ( let k = Math.floor( ( T0 - nightFrom ) / 24 ), n = Math.floor( ( T1 - nightFrom ) / 24 ); k <= n; k ++ ) {

		const a = k * 24 + nightFrom;
		h += Math.max( 0, Math.min( T1, a + nightH ) - Math.max( T0, a ) );

	}

	return h / nightH;

}

// how long it's soaked: by the island's clock, or by the real one in a room whose clock is behind where you set it
export function soakOf( trap, T, now = Date.now() ) {

	const hours = Math.max( 0, T - trap.T, Number.isFinite( trap.at ) ? ( now - trap.at ) / 3600e3 : 0 );
	return { hours, days: hours / 24, nights: nightsIn( trap.T, trap.T + hours ) };

}

// (M17) Trap bait, Marta's ((M19) Joe's now, with the rest of the bait) (`price` for `per` traps): fish heads and cowhide, as the Keys' and the Bahamas' trappers use. A trap's a
// shelter a spiny lobster comes to unbaited, and bait brings more: live shorts, the best of it, about three times an unbaited trap's
// catch (Heatwole et al. 1988 and Butler et al. 2022, as Marine Ecology Progress Series 696: 43 has them); dead bait less. Taken
// here: an unbaited trap fishes `bare` of what a baited one does. And it's used up: eaten and gone off in days (a dead lobster in a
// trap kept it fishing worse about 5 days, MEPS 696: 43), and after `nights` of its soak the trap fishes as an unbaited one. Both
// chosen to fit those: no figure for cowhide or fish heads was found. SOAK.most is a baited trap's, as Florida's traps were
export const BAIT = { bare: 0.35, nights: 5, per: 4, price: 8 };

// lobsters to expect in it, on a bottom of quality q ((M17) baited, or not: its bait drawing them for BAIT.nights, and after that
// only as the trap itself does)
export function meanCatch( q, { days, nights }, baited = true ) {

	const fade = days <= SOAK.fade ? 1 : SOAK.floor + ( 1 - SOAK.floor ) * Math.exp( - ( days - SOAK.fade ) / SOAK.fadeTau );
	const drawn = BAIT.bare * grown( nights ) + ( baited ? ( 1 - BAIT.bare ) * grown( Math.min( nights, BAIT.nights ) ) : 0 );
	return SOAK.most * q * drawn * fade;

}

// (M17) what's said of its bait as it comes up: none in it, or used up, or nothing
export const baitSaid = ( trap, soak ) => trap.bait === false ? 'no bait in it' : soak.nights >= BAIT.nights ? 'the bait\'s long gone' : '';

// (M17) a bag of bait from Marta ((M19) Joe), for BAIT.per traps (traps: the save's): -> what it cost, or 0 if you couldn't
export function buyBait( traps, money ) {

	if ( money < BAIT.price ) return 0;
	traps.bait = ( traps.bait | 0 ) + BAIT.per;
	return BAIT.price;

}

// a number 0..1, and on, from a seed
function randoms( seed ) {

	let s = seed >>> 0;
	return () => {

		s = ( s + 0x6D2B79F5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

function poisson( mean, r ) {

	const L = Math.exp( - mean );
	let k = 0, p = r();
	while ( p > L && k < 12 ) {

		k ++;
		p *= r();

	}

	return k;

}

// A third of Florida's traps came up with something else in them; lobster catches were lower in those. Stone crabs,
// grunts, spider crabs and sea urchins were two thirds of it (GCFI's survey of 21,309 traps). `s`: a fish of the catch table; the rest
// are only seen, and go back
const BYCATCH = { share: 0.33, lobsters: 0.75, kinds: [
	{ s: 'grunt', w: 0.27 }, { label: 'Stone crab', w: 0.2 }, { label: 'Spider crab', w: 0.1 }, { label: 'Long-spined urchin', w: 0.08 },
	{ s: 'lionfish', w: 0.12 }, { s: 'sergeant', w: 0.08 }, { s: 'wrasse', w: 0.08 }, { label: 'Hermit crab', w: 0.07 },
] };
// a lobster's length in a trap (cm, mean and spread): how many are legal, of the gauge's 22.4 cm (3 in of carapace), goes
// by the bottom and the depth; a little over half on a reef's edge, as in the fishery. Berried: as the dens' (Fish.js).
// ((M19) The gauge is the Bahamas' 24.3 cm now, 3 1/4 in of carapace: about half on the reef's edge are legal)
export const SIZES = { mean: 20.5, perM: 0.08, most: 2.5, sd: 4.2, min: 15, max: 42, berried: 0.06, berriedFrom: 20 };

// What comes up, the same however often it's asked of the same soak: { lobsters: [ { cm, kg, berried } ], others: [
// { species, label, kg, cm } ], soak }. q, sizeCm: its bottom's (BOTTOMS, as it was set); depth: m
export function haulOf( trap, q, sizeCm, depth, T, now = Date.now() ) {

	const soak = soakOf( trap, T, now ), r = randoms( trap.seed ), others = [];
	const fished = 1 - Math.exp( - soak.nights / 2 );
	if ( r() < BYCATCH.share * fished ) {

		let w = r(), kind = BYCATCH.kinds[ 0 ];
		for ( const k of BYCATCH.kinds ) {

			kind = k;
			if ( ( w -= k.w ) <= 0 ) break;

		}

		const F = kind.s && FISH[ kind.s ];
		if ( F ) {

			const kg = F.kg[ 0 ] + ( F.kg[ 1 ] - F.kg[ 0 ] ) * 0.3 * r() * r();
			others.push( { species: kind.s, label: F.name, kg } );

		} else others.push( { species: null, label: kind.label || 'Hermit crab' } );

	}

	const n = poisson( meanCatch( q, soak, trap.bait !== false ) * ( others.length ? BYCATCH.lobsters : 1 ), r ), lobsters = [];
	for ( let i = 0; i < n; i ++ ) {

		const z = Math.sqrt( - 2 * Math.log( Math.max( 1e-6, r() ) ) ) * Math.cos( 2 * Math.PI * r() );
		const mean = SIZES.mean + sizeCm + Math.min( SIZES.most, depth * SIZES.perM );
		const cm = Math.round( Math.min( SIZES.max, Math.max( SIZES.min, mean + z * SIZES.sd ) ) );
		lobsters.push( { cm, kg: fishWeightKg( 'lobster', cm ), berried: cm >= SIZES.berriedFrom && r() < SIZES.berried } );

	}

	return { lobsters, others, soak };

}

// ---- what a hurricane does. Irma (Category 4) took or moved about 43% of the Keys' traps, those it moved 3.5 to 8 miles
// and some 18; some men lost up to 90%. Waves reach down less the deeper it is. How many of those at a depth it
// touches, by its category: moved far less than a Category 4's by the island's Category 1s and 2s, and of them about half
// lost, the others found moved, or with the buoy gone (warp chafed through) and the trap where it was. A moved one
// that fetches up ashore, or past its warp's reach, is lost too
export const STORM = { touched: [ 0.35, 0.15, 0.1 ], reach: [ 10, 6 ], lost: 0.45, moved: 0.4, m: [ 250, 900 ], perCat: [ 0.6, 0.4 ] };

export function touchedBy( cat, depth ) {

	const [ a, b, floor ] = STORM.touched, [ d0, d1 ] = STORM.reach;
	return Math.min( 0.95, ( a + b * cat ) * Math.exp( - depth / ( d0 + d1 * cat ) ) + floor );

}

// Each trap on the sea, from when it was last reckoned to T, for every hurricane whose eye has passed: its fate, the same
// for everyone (its seed and the storm's). traps: the save's. env: { depth( x, z ) -> m (< 0 ashore), pick, since, now }.
// -> [ { fate: 'lost' | 'ashore' | 'deep' | 'moved' | 'buoy', x, z, to: { x, z }, m, mark } ]
export function settle( traps, T, env ) {

	const { depth, pick = null, since = 0, now = Date.now() } = env, events = [];
	for ( const t of [ ...traps.set ] ) {

		const from = Number.isFinite( t.seen ) ? t.seen : t.T;
		t.seen = Math.max( from, T );
		if ( ! ( T > from ) ) continue;
		const storms = [];
		for ( let at = T, h; ( h = lastHurricane( at, Math.max( 0, at - from ), pick, since ) ); at = h.onset - 1e-6 ) {

			if ( h.tc > from && h.tc <= T ) storms.unshift( h );
			if ( h.onset <= from || storms.length > 16 ) break;

		}

		for ( const h of storms ) {

			if ( ! traps.set.includes( t ) ) break;
			const cat = Math.max( 1, categoryOf( h ) || 1 ), d = depth( t.x, t.z ), r = randoms( t.seed ^ stringHash( String( h.key ) ) );
			if ( r() >= touchedBy( cat, Math.max( 0, d ) ) ) continue;
			t.T = h.tc;
			t.at = now;
			const f = r(), ev = { fate: 'buoy', x: t.x, z: t.z, to: { x: t.x, z: t.z }, m: 0, mark: t.mark ?? null };
			events.push( ev );
			if ( f < STORM.lost ) {

				ev.fate = 'lost';
				lose( traps, t );

			} else if ( f < STORM.lost + STORM.moved ) {

				const toward = towardOf( weatherAt( h.tc, pick, since ).windAngle || 0, { x: 0, y: 0 } );
				const m = ( STORM.m[ 0 ] + r() * STORM.m[ 1 ] ) * ( STORM.perCat[ 0 ] + STORM.perCat[ 1 ] * cat ), a = ( r() - 0.5 ) * 1.4, c = Math.cos( a ), s = Math.sin( a );
				const x = t.x + ( toward.x * c - toward.y * s ) * m, z = t.z + ( toward.x * s + toward.y * c ) * m, there = depth( x, z );
				ev.to = { x, z };
				ev.m = m;
				if ( there < 0.5 || there > WARP_M ) {

					ev.fate = there < 0.5 ? 'ashore' : 'deep';
					lose( traps, t );

				} else {

					ev.fate = 'moved';
					t.x = round( x );
					t.z = round( z );
					t.q = null; // (on another bottom now: TrapWork reads it again)

				}

			} else t.buoy = false;

		}

	}

	return events;

}

const lose = ( traps, t ) => {

	traps.set.splice( traps.set.indexOf( t ), 1 );
	traps.lost ++;

};

const stringHash = ( s ) => {

	let h = 0x811c9dc5;
	for ( let i = 0; i < s.length; i ++ ) h = Math.imul( h ^ s.charCodeAt( i ), 0x01000193 );
	return h;

};

const WINDS = [ 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west' ];
const farOff = ( m ) => m < 500 ? `${ Math.round( m / 0.3048 / 100 ) * 100 } ft` : m < 1400 ? 'half a mile' : m < 2300 ? 'a mile' : `${ Math.round( m / 1852 ) } miles`;
const said = ( n, one, more ) => n === 1 ? one : more.replace( '#', n );

// Marta's words on what a hurricane did to your traps: her note's paragraphs, or null with nothing to say
export function trapsTold( events ) {

	if ( ! events.length ) return null;
	const out = [];
	const of = ( ...fates ) => events.filter( ( e ) => fates.includes( e.fate ) );
	const lost = of( 'lost', 'ashore', 'deep' ).length;
	if ( lost ) out.push( `${ said( lost, 'One of your traps is', '# of your traps are' ) } gone in the hurricane${ of( 'ashore' ).length ? ', and I saw what was left of one up on the rocks' : '' }. I've new ones at $${ TRAP_PRICE }.` );
	for ( const e of of( 'moved' ) ) {

		const dir = WINDS[ ( ( Math.round( Math.atan2( e.to.x - e.x, e.z - e.to.z ) / ( Math.PI / 4 ) ) % 8 ) + 8 ) % 8 ];
		out.push( `One of your buoys came up ${ farOff( e.m ) } ${ dir } of your mark. It dragged its trap there.` );

	}

	const cut = of( 'buoy' ).length;
	if ( cut ) out.push( `${ said( cut, 'One of your buoys', '# of your buoys' ) } went with the warp chafed through. The trap${ cut > 1 ? 's are' : '\'s' } still down at your mark${ cut > 1 ? 's' : '' }: dive on ${ cut > 1 ? 'them' : 'it' } and tie on another.` );
	return out;

}

// ---- the save, per player: { set: [ { x, z, T: the island's time set, at: ms set, seed, buoy, mark: chart mark's id,
// seen: reckoned to, q, size: its bottom's, (M17) bait: false if it was set with none } ], lost: how many a storm's had that you've
// not replaced, (M17) bait: how many traps' worth of bait you have }
export const newTraps = () => ( { set: [], lost: 0, bait: 0 } );

const round = ( v ) => Math.round( v * 10 ) / 10;

export function cleanTraps( raw ) {

	const out = newTraps();
	if ( ! raw || typeof raw !== 'object' ) return out;
	out.lost = Number.isInteger( raw.lost ) && raw.lost > 0 ? raw.lost : 0;
	out.bait = Number.isInteger( raw.bait ) && raw.bait > 0 ? Math.min( raw.bait, 999 ) : 0;
	for ( const t of Array.isArray( raw.set ) ? raw.set : [] ) {

		if ( ! t || ! Number.isFinite( t.x ) || ! Number.isFinite( t.z ) || ! Number.isFinite( t.T ) ) continue;
		// ((M17) one set before bait was sold had it, as M16 reckoned them)
		out.set.push( { x: t.x, z: t.z, T: t.T, at: Number.isFinite( t.at ) ? t.at : null, seed: Number.isInteger( t.seed ) ? t.seed : 1, buoy: t.buoy !== false, mark: Number.isInteger( t.mark ) ? t.mark : null, seen: Number.isFinite( t.seen ) ? t.seen : t.T, q: Number.isFinite( t.q ) ? t.q : null, size: Number.isFinite( t.size ) ? t.size : 0, ...( t.bait === false ? { bait: false } : {} ) } );

	}

	out.set = out.set.slice( 0, UPGRADES.traps.levels.at( - 1 ).traps );
	return out;

}

// how many you've bought (whichever boat you're in: they're the lobster boat's), and how many are on her deck
export const ownedTraps = ( upgrades ) => UPGRADES.traps.levels[ Math.max( 0, Math.min( UPGRADES.traps.levels.length - 1, upgrades.traps | 0 ) ) ].traps;
export const aboardTraps = ( traps, upgrades ) => Math.max( 0, ownedTraps( upgrades ) - traps.set.length - traps.lost );

// ---- the buoys everyone sees: portal.save.shared 'buoys', { [ owner's id ]: { v: 1, n: their name, b: [ [ x, z ] ], at:
// ms } }. Only written by their owner. As in Florida, each owner's buoys are their own colours; no one else's to haul
export const BUOYS_KEPT_MS = 60 * 24 * 3600e3;
const COLOURS = [ [ 0xff6a13, 0x1d4f9c ], [ 0xe0c21c, 0x1a1b1d ], [ 0xd6303a, 0xf4f1ea ], [ 0x2f7a3c, 0xe8a018 ], [ 0x1d8fa6, 0xd6303a ], [ 0xc34fa0, 0xf4f1ea ], [ 0xf4f1ea, 0x1d4f9c ], [ 0x7a4fc3, 0xe0c21c ] ];
export const buoyColours = ( id ) => COLOURS[ id ? ( stringHash( String( id ) ) >>> 0 ) % COLOURS.length : 0 ];

export const buoyRecord = ( { name, traps, at } ) => ( { v: 1, n: String( name || '' ).slice( 0, 40 ), b: traps.set.filter( ( t ) => t.buoy ).map( ( t ) => [ round( t.x ), round( t.z ) ] ), at } );

export function cleanBuoys( raw, now = Date.now() ) {

	const out = {};
	if ( ! raw || typeof raw !== 'object' ) return out;
	for ( const [ id, r ] of Object.entries( raw ) ) {

		if ( ! r || r.v !== 1 || ! Number.isFinite( r.at ) || now - r.at > BUOYS_KEPT_MS || ! Array.isArray( r.b ) ) continue;
		const b = r.b.filter( ( p ) => Array.isArray( p ) && p.length === 2 && p.every( Number.isFinite ) ).slice( 0, 8 );
		if ( b.length ) out[ id ] = { v: 1, n: typeof r.n === 'string' ? r.n : '', b, at: r.at };

	}

	return out;

}

// where a trap's buoy lies off it (m): the warp's scope, the same on every device. depth: m
export function buoyOffset( x, z, depth ) {

	const r = randoms( stringHash( `${ Math.round( x * 10 ) },${ Math.round( z * 10 ) }` ) ), a = r() * Math.PI * 2, m = Math.min( 6, Math.max( 0.5, depth * 0.25 ) ) * ( 0.5 + 0.5 * r() );
	return { x: Math.cos( a ) * m, z: Math.sin( a ) * m };

}
