// Plain-node tests of the fishing game logic (no GPU): bites, the catch fight, inventory, save.
import { FISH, FISH_IDS, CARAPACE, fishValue, fishLengthCm, fishWeightKg, spearRule, isTrophy } from '../src/game/FishTable.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay, lampsLit, weatherMood } from '../src/game/Bites.js';
import { weatherAt } from '../src/game/Weather.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { GameState } from '../src/game/GameState.js';
import { gearStats, defaultUpgrades, UPGRADES, TOW, towFee } from '../src/game/Gear.js';
import { BoatController } from '../src/player/BoatController.js';
import { G } from '../src/core/Globals.js';
import { Vector3, Group } from '../src/engine/index.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
let seed = 12345;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

// ---- habitats and species
const spots = {
	sand: { depth: 0, reefDist: 200, pierDist: 200 },
	shallows: { depth: 1.5, reefDist: 200, pierDist: 80 },
	pier: { depth: 4, reefDist: 150, pierDist: 1 },
	reef: { depth: 5, reefDist: - 10, pierDist: 150 },
	deep: { depth: 40, reefDist: 300, pierDist: 400 },
};
for ( const [ name, s ] of Object.entries( spots ) ) {

	const h = habitatAt( s );
	const counts = {};
	for ( let i = 0; i < 2000; i ++ ) {

		const id = pickSpecies( h, 12, rng );
		if ( id ) counts[ id ] = ( counts[ id ] || 0 ) + 1;

	}

	const top = Object.entries( counts ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 5 ).map( ( [ k, v ] ) => `${ k } ${ ( v / 20 ).toFixed( 0 ) }%` ).join( ', ' );
	console.log( `     ${ name }: delay ~${ biteDelay( h, 12, () => 0.5 ).toFixed( 1 ) } s; ${ top || 'nothing' }` );

}
ok( pickSpecies( habitatAt( spots.sand ), 12, rng ) === null, 'nothing bites on dry sand' );
ok( biteDelay( habitatAt( spots.sand ), 12, rng ) === Infinity, 'no bite delay on sand' );
{

	let deepOnly = 0;
	for ( let i = 0; i < 500; i ++ ) if ( [ 'tuna', 'mahi', 'redSnapper', 'grouper', 'barracuda', 'blackGrouper', 'muttonSnapper', 'lionfish', 'silkSnapper', 'cuberaSnapper', 'goliathGrouper' ].includes( pickSpecies( habitatAt( spots.deep ), 12, rng ) ) ) deepOnly ++;
	ok( deepOnly === 500, 'deep water gives offshore species only' );
	// (Salt Life) the red snapper is a fish of the deep ledges only; the mangrove snapper of the pier
	let redInshore = 0, grayPier = 0;
	for ( const spot of [ spots.shallows, spots.pier, spots.reef ] ) for ( let i = 0; i < 1500; i ++ ) if ( pickSpecies( habitatAt( spot ), 12, rng ) === 'redSnapper' ) redInshore ++;
	for ( let i = 0; i < 3000; i ++ ) if ( pickSpecies( habitatAt( spots.pier ), 6, rng ) === 'graySnapper' ) grayPier ++;
	ok( redInshore === 0 && grayPier > 60, `red snapper only offshore (${ redInshore } inshore); mangrove snapper at the pier (${ grayPier } of 3000 at dawn)` );
	// bonefish on the flats; nothing takes a bait for a lobster
	let bone = 0, lobster = 0;
	for ( const spot of Object.values( spots ) ) for ( let i = 0; i < 2000; i ++ ) {

		const id = pickSpecies( habitatAt( spot ), 12, rng );
		if ( id === 'lobster' ) lobster ++;
		if ( id === 'bonefish' && spot !== spots.shallows ) bone ++;

	}

	ok( lobster === 0 && bone === 0, 'no lobster ever takes a bait; bonefish only on the flats' );
	let reefFish = 0;
	for ( let i = 0; i < 500; i ++ ) if ( FISH[ pickSpecies( habitatAt( spots.reef ), 12, rng ) ].habitat.reef ) reefFish ++;
	ok( reefFish > 400, `the reef gives mostly reef fish (${ reefFish / 5 }%)` );

}
{

	let tarponNight = 0, tarponDay = 0;
	for ( let i = 0; i < 4000; i ++ ) {

		if ( pickSpecies( habitatAt( spots.pier ), 22, rng ) === 'tarpon' ) tarponNight ++;
		if ( pickSpecies( habitatAt( spots.pier ), 12, rng ) === 'tarpon' ) tarponDay ++;

	}

	ok( tarponNight > tarponDay * 2, `tarpon bite at night (${ tarponNight } vs ${ tarponDay } by day)` );
	// (Salt Life) they gather under the pier's lamps after dark: twice as many bites there as without
	// the lamps, and more than out in the open bay
	const share = ( spot ) => {

		let t = 0;
		for ( let i = 0; i < 6000; i ++ ) if ( pickSpecies( habitatAt( spot ), 22, rng ) === 'tarpon' ) t ++;
		return t / 6000;

	};
	const lights = FISH.tarpon.lights;
	delete FISH.tarpon.lights;
	const dark = share( spots.pier );
	FISH.tarpon.lights = lights;
	const lit = share( spots.pier ), bay = share( { depth: 6, reefDist: 200, pierDist: 60 } );
	console.log( `     tarpon after dark: ${ ( 100 * lit ).toFixed( 1 ) }% of bites under the pier lights (${ ( 100 * dark ).toFixed( 1 ) }% without them), ${ ( 100 * bay ).toFixed( 1 ) }% in the open bay` );
	ok( lit > 1.7 * dark && lit > bay, 'after dark the tarpon gather under the pier lights' );
	ok( lampsLit( 12 ) === 0 && lampsLit( 22 ) === 1 && lampsLit( 3 ) === 1 && lampsLit( 19.5 ) > 0 && lampsLit( 19.5 ) < 1, 'the pier lamps: lit from dusk to dawn' );

}
// (Salt Life) a boat's deck floodlights after dark: yellowtail, jacks and houndfish gather in their
// pool, and in open water the bites come sooner
{

	const drawn = [ 'yellowtail', 'jack', 'needlefish' ];
	const bay = habitatAt( { depth: 6, reefDist: 200, pierDist: 60 } );
	const share = ( h ) => {

		let t = 0;
		for ( let i = 0; i < 6000; i ++ ) if ( drawn.includes( pickSpecies( h, 22, rng ) ) ) t ++;
		return t / 6000;

	};
	const dark = share( bay ), lit = share( { ...bay, flood: 1 } );
	console.log( `     under the floodlights: ${ ( 100 * lit ).toFixed( 1 ) }% of night bites are yellowtail, jacks or houndfish (${ ( 100 * dark ).toFixed( 1 ) }% without them)` );
	ok( drawn.every( ( id ) => FISH[ id ].flood > 0 ) && lit > 1.6 * dark, 'after dark yellowtail, jacks and houndfish gather under the floodlights' );
	const once = ( h ) => biteDelay( h, 22, () => 0.5 );
	ok( once( { ...bay, flood: 1 } ) < 0.8 * once( bay ), 'in open water the floodlights bring bites sooner' );
	ok( pickSpecies( { ...habitatAt( spots.sand ), flood: 1 }, 22, rng ) === null && biteDelay( { ...habitatAt( spots.sand ), flood: 1 }, 22, rng ) === Infinity, 'the floodlights put no fish on dry sand' );

}
// (M9) the weather on the bites (habitat.weather): a fair day is the island as it always was; ahead of
// a blow they bite sooner and bigger; under a grey sky by day the predators bite as at dusk; a downpour
// or a thunderstorm slows them; a gale's surf quiets the shallows and the pier, its wind the deep; and
// each fish's own taste in weather (FishTable's weather)
{

	const seeded = ( s = 777 ) => () => ( ( s = ( s * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
	const fair = weatherAt( 0, 'fair' ), calm = weatherAt( 0, 'calm' ), cloudy = weatherAt( 0, 'cloudy' ), rain = weatherAt( 0, 'rain' );
	const blustery = weatherAt( 0, 'blustery' ), gale = weatherAt( 0, 'gale' ), storm = weatherAt( 0, 'storm' );
	// the same bites, one after another, from the same rolls
	const seq = ( h, hour, bait = null ) => {

		const r = seeded(), out = [];
		for ( let i = 0; i < 300; i ++ ) out.push( pickSpecies( h, hour, r, bait ), biteDelay( h, hour, r, bait ) );
		return out.join( ',' );

	};
	// a fair day from the forecast, with no blow on its way
	let T = 30;
	while ( weatherAt( T ).id !== 'fair' || weatherMood( weatherAt( T ) ) ) T += 0.25;
	let same = true;
	for ( const spot of Object.values( spots ) ) for ( const hour of [ 3, 6.5, 12, 18.5, 22 ] ) for ( const bait of [ null, 'silverside' ] ) for ( const w of [ fair, calm, weatherAt( T ) ] ) {

		const h = habitatAt( spot );
		if ( seq( h, hour, bait ) !== seq( { ...h, weather: w }, hour, bait ) || seq( { ...h, flood: 0.7 }, hour, bait ) !== seq( { ...h, flood: 0.7, weather: w }, hour, bait ) ) same = false;

	}

	for ( const id of FISH_IDS ) {

		const a = seeded( 5 ), b = seeded( 5 );
		for ( let i = 0; i < 50; i ++ ) if ( rollWeight( id, a, null ) !== rollWeight( id, b, null, fair ) ) same = false;

	}

	ok( same && weatherMood( fair ) === null && weatherMood( null ) === null, 'a fair day\'s weather changes nothing: the same fish bite, as soon and as big' );
	let nightSame = true;
	for ( const spot of Object.values( spots ) ) if ( seq( habitatAt( spot ), 22 ) !== seq( { ...habitatAt( spot ), weather: cloudy }, 22 ) ) nightSame = false;
	ok( nightSame, 'nor does a grey sky at night' );
	const pier = habitatAt( spots.pier ), shallows = habitatAt( spots.shallows ), deep = habitatAt( spots.deep );
	const delay = ( h, w, hour = 12 ) => {

		const r = seeded( 31 );
		let t = 0;
		for ( let i = 0; i < 4000; i ++ ) t += biteDelay( { ...h, weather: w }, hour, r );
		return t / 4000;

	};
	const share = ( h, w, ids, hour = 12 ) => {

		const r = seeded( 41 );
		let n = 0;
		for ( let i = 0; i < 6000; i ++ ) if ( ids.includes( pickSpecies( { ...h, weather: w }, hour, r ) ) ) n ++;
		return n / 6000;

	};
	const kg = ( w ) => {

		const r = seeded( 51 );
		let t = 0;
		for ( let i = 0; i < 4000; i ++ ) t += rollWeight( 'jack', r, null, w );
		return t / 4000;

	};
	// ahead of a blow
	const front = { ...fair, front: 1 };
	console.log( `     bites off the pier at noon, every: ${ delay( pier, fair ).toFixed( 1 ) } s fair, ${ delay( pier, front ).toFixed( 1 ) } s ahead of a blow, ${ delay( pier, rain ).toFixed( 1 ) } s in the rain, ${ delay( pier, gale ).toFixed( 1 ) } s in a gale, ${ delay( pier, storm ).toFixed( 1 ) } s in a thunderstorm` );
	console.log( `     in the shallows: ${ delay( shallows, fair ).toFixed( 1 ) } s fair, ${ delay( shallows, gale ).toFixed( 1 ) } s in a gale; offshore: ${ delay( deep, fair ).toFixed( 1 ) } s fair, ${ delay( deep, gale ).toFixed( 1 ) } s in a gale` );
	console.log( `     a jack's weight on average: ${ kg( fair ).toFixed( 2 ) } kg fair, ${ kg( front ).toFixed( 2 ) } kg ahead of a blow` );
	ok( delay( pier, front ) < 0.8 * delay( pier, fair ) && delay( shallows, front ) < 0.8 * delay( shallows, fair ), 'ahead of a blow the fish feed hard: bites come sooner' );
	ok( kg( front ) > 1.1 * kg( fair ), 'and the big ones feed too' );
	let at = 30;
	while ( weatherAt( at ).front < 0.8 ) at += 0.25;
	const coming = weatherAt( at );
	ok( delay( pier, coming ) < delay( pier, { ...coming, front: 0 } ) && kg( coming ) > kg( { ...coming, front: 0 } ), `a blow on its way in the forecast (day ${ Math.floor( at / 24 ) + 1 }, ${ coming.id }, front ${ coming.front.toFixed( 2 ) }) brings them on` );
	// the light, the rain, the surf and the wind
	const predators = FISH_IDS.filter( ( id ) => [ 'dawnDusk', 'night' ].includes( FISH[ id ].time ) || id === 'barracuda' );
	const grey = share( pier, cloudy, predators ), clear = share( pier, fair, predators );
	console.log( `     predators' share of noon bites off the pier: ${ ( 100 * clear ).toFixed( 1 ) }% fair, ${ ( 100 * grey ).toFixed( 1 ) }% under a grey sky (${ ( 100 * share( pier, fair, predators, 18.5 ) ).toFixed( 1 ) }% at dusk)` );
	ok( grey > 1.3 * clear, 'under a grey sky by day the jacks, snappers and tarpon bite better, as at dusk' );
	ok( delay( pier, storm ) > 1.5 * delay( pier, fair ) && delay( pier, rain ) > delay( pier, fair ), 'a downpour or a thunderstorm slows the bites' );
	ok( delay( shallows, gale ) > 1.5 * delay( shallows, fair ) && delay( pier, gale ) > 1.05 * delay( pier, fair ) && delay( deep, gale ) > 1.3 * delay( deep, fair ), 'a gale\'s surf quiets the shallows and the pier, and the deep is hard to fish' );
	// each fish's own taste
	const moods = Object.keys( weatherMood( storm ) );
	ok( FISH_IDS.every( ( id ) => ! FISH[ id ].weather || Object.keys( FISH[ id ].weather ).every( ( k ) => moods.includes( k ) ) ), 'each fish\'s taste in weather is in what the fish feel of it' );
	const mahi = [ share( deep, fair, [ 'mahi' ] ), share( deep, blustery, [ 'mahi' ] ) ], tuna = [ share( deep, fair, [ 'tuna' ], 7 ), share( deep, blustery, [ 'tuna' ], 7 ) ];
	const bone = [ share( shallows, fair, [ 'bonefish' ] ), share( shallows, gale, [ 'bonefish' ] ) ], tarpon = [ share( pier, fair, [ 'tarpon' ], 22 ), share( pier, rain, [ 'tarpon' ], 22 ) ];
	const pc = ( [ a, b ] ) => `${ ( 100 * a ).toFixed( 1 ) }% → ${ ( 100 * b ).toFixed( 1 ) }%`;
	console.log( `     mahi offshore in a blow ${ pc( mahi ) }, tuna at dawn ${ pc( tuna ) }; bonefish on the flats in a gale ${ pc( bone ) }; tarpon at the pier at night in the rain ${ pc( tarpon ) }` );
	ok( mahi[ 1 ] > 1.4 * mahi[ 0 ] && tuna[ 1 ] > 1.3 * tuna[ 0 ], 'mahi and tuna up with the wind lines in a blow' );
	ok( bone[ 1 ] < 0.25 * bone[ 0 ], 'the bonefish leave the flats in a gale' );
	ok( tarpon[ 1 ] > 1.5 * tarpon[ 0 ], 'tarpon roll and feed in the rain' );

}
for ( const id of FISH_IDS ) {

	const w = rollWeight( id, rng );
	if ( w < FISH[ id ].kg[ 0 ] || w > FISH[ id ].kg[ 1 ] ) ok( false, `weight in range for ${ id }` );

}
ok( fishValue( 'redSnapper', 5 ) > fishValue( 'redSnapper', 2 ), 'bigger fish is worth more' );
// (Salt Life) trophies: what the others hear of (with island records), about one catch in ten
{

	let trophies = 0, n = 0;
	for ( const id of FISH_IDS ) for ( let i = 0; i < 2000; i ++ ) {

		n ++;
		if ( isTrophy( id, rollWeight( id, rng ) ) ) trophies ++;

	}

	console.log( `     trophies: ${ ( 100 * trophies / n ).toFixed( 1 ) }% of catches` );
	ok( trophies / n > 0.05 && trophies / n < 0.15, 'a trophy is about one catch in ten' );
	ok( isTrophy( 'tarpon', 40 ) && ! isTrophy( 'tarpon', 20 ), 'a trophy is a big one of its kind' );

}

// ---- the fight: three players
const policies = {
	careful: ( g ) => g.tension < 0.68 && g.surge < 0.6,
	mash: () => true,
	idle: () => false,
};
const fight = ( species, kg, policy, lineKg = 7, reelSpeed = 1.1 ) => {

	const g = new CatchMinigame( { species, kg, lineKg, reelSpeed, distance: 18, rng } );
	let st = 'fighting';
	for ( let i = 0; i < 60 * 180 && st === 'fighting'; i ++ ) st = g.update( 1 / 60, policy( g ) );
	return { st, t: g.time };

};
const table = {};
for ( const [ species, kg ] of [ [ 'grunt', 0.8 ], [ 'yellowtail', 1.2 ], [ 'jack', 6 ], [ 'redSnapper', 5 ], [ 'tuna', 6 ], [ 'tuna', 13 ], [ 'tarpon', 35 ] ] ) {

	for ( const p of Object.keys( policies ) ) {

		const r = fight( species, kg, policies[ p ] );
		table[ `${ species }/${ p }` ] = r;
		console.log( `     ${ species } ${ kg } kg, ${ p }: ${ r.st } after ${ r.t.toFixed( 1 ) } s` );

	}

}
ok( table[ 'grunt/careful' ].st === 'caught' && table[ 'yellowtail/careful' ].st === 'caught', 'careful reeling lands small fish' );
ok( table[ 'jack/careful' ].st === 'caught', 'careful reeling lands a 6 kg jack on the starter line' );
ok( table[ 'tuna/mash' ].st === 'snapped' && table[ 'tarpon/mash' ].st === 'snapped', 'holding reel on a big fish snaps the line' );
ok( table[ 'tuna/careful' ].st !== 'caught' && fight( 'tuna', 13, policies.careful, 26, 1.6 ).st === 'caught', 'a 13 kg tuna needs the 30 lb line' );
ok( [ 'escaped' ].includes( table[ 'grunt/idle' ].st ), 'never reeling loses the fish' );
ok( fight( 'tarpon', 35, policies.careful ).st !== 'caught', 'a 35 kg tarpon beats the starter line' );
ok( fight( 'tarpon', 35, policies.careful, 50, 2.2 ).st === 'caught', 'the top line and reel land it' );

// ---- inventory, wallet, save round trip
const mem = new Map();
const storage = { getItem: ( k ) => mem.get( k ) ?? null, setItem: ( k, v ) => mem.set( k, v ) };
const s = new GameState( storage );
ok( s.stats.holdKg === 30, 'cooler holds 30 kg' );
const a = s.addFish( 'grunt', 0.84, 9.5 );
const b = s.addFish( 'yellowtail', 1.31, 10 );
ok( a && b && s.inventory.length === 2, 'fish go into the cooler' );
ok( s.addFish( 'blackGrouper', 29, 22 ) === null && s.log.blackGrouper.count === 1, 'a fish too big for the hold is logged but not kept' );
const value = s.holdValue;
const sale = s.sell( [ a.id ] );
ok( sale.count === 1 && s.money === a.value && s.inventory.length === 1, 'selling one fish pays for it' );
s.upgrades.hold = 1;
const s2 = new GameState( storage );
s.save();
ok( s2.load() && s2.money === s.money && s2.inventory.length === 1 && s2.log.grunt.bestKg === 0.84 && s2.stats.holdKg === 70, 'save / load round trip' );
ok( s2.addFish( 'grunt', 0.5 ).id > b.id, 'ids keep counting after a load' );
// ---- lengths and the catch card's record logic
{

	let sane = true;
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ];
		const lo = fishLengthCm( id, f.kg[ 0 ] ), hi = fishLengthCm( id, f.kg[ 1 ] );
		if ( ! ( lo > 5 && hi < 200 && hi > lo && typeof f.sci === 'string' ) ) sane = false;

	}

	ok( sane, 'every species has a scientific name and a plausible, increasing length (5–200 cm)' );
	ok( Math.abs( fishLengthCm( 'mahi', 10 ) - 108 ) < 3 && Math.abs( fishLengthCm( 'grunt', 0.84 ) - 36 ) < 2, 'length-weight: a 10 kg mahi ~108 cm, a 0.84 kg grunt ~36 cm' );
	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const c1 = st.addFish( 'jack', 3.2 ), i1 = st.lastCatch;
	ok( c1 && i1.newSpecies && ! i1.record && c1.cm === i1.cm && i1.cm > 50, 'first of a species: new species, not a record, length stored' );
	st.addFish( 'jack', 2.1 );
	const i2 = st.lastCatch;
	ok( ! i2.newSpecies && ! i2.record && i2.prevBestKg === 3.2 && st.log.jack.bestKg === 3.2, 'a smaller one: no record, best unchanged' );
	st.addFish( 'jack', 4.05 );
	const i3 = st.lastCatch;
	ok( i3.record && i3.prevBestKg === 3.2 && i3.prevBestCm === i1.cm && st.log.jack.bestKg === 4.05 && st.log.jack.bestCm === i3.cm, 'a bigger one: new record, previous best reported, log updated' );
	st.addFish( 'blackGrouper', 24 );
	ok( st.lastCatch.kept === false && ! st.lastCatch.released && st.lastCatch.newSpecies, 'a fish that does not fit: logged, card says let go' );
	// protected species: measured, logged and released, never kept or sold
	const tp = st.addFish( 'tarpon', 30, 22 ), it = st.lastCatch;
	ok( tp === null && it.released && ! it.kept && it.value === 0 && st.log.tarpon.count === 1 && ! st.inventory.some( ( f ) => f.species === 'tarpon' ), 'a protected tarpon is logged and released, worth nothing' );
	// a speared fish: its method, and the length it swam at
	const sp = st.addFish( 'wrasse', fishWeightKg( 'wrasse', 52 ), 11, { method: 'spear', cm: 52 } );
	ok( sp && sp.method === 'spear' && sp.cm === 52 && st.lastCatch.method === 'spear', 'a speared fish keeps its method and measured length' );
	// a save from before lengths: inventory and log get lengths on load
	const old = { v: 1, money: 5, inventory: [ { id: 1, species: 'grunt', kg: 0.84, value: 6, caughtAt: 9 } ], log: { grunt: { count: 1, bestKg: 0.84 } }, upgrades: {}, fuel: null, nextId: 2 };
	const st2 = new GameState( { getItem: () => JSON.stringify( old ), setItem: () => {} } );
	ok( st2.load() && st2.inventory[ 0 ].cm === 36 && st2.log.grunt.bestCm === 36, 'old saves load with lengths filled in' );

}
ok( new GameState( { getItem: () => { throw new Error( 'blocked' ); }, setItem: () => { throw new Error( 'blocked' ); } } ).load() === false, 'blocked storage does not throw' );
ok( s.spend( 1e9 ) === false, 'cannot spend more than you have' );
ok( Object.keys( defaultUpgrades() ).length === Object.keys( UPGRADES ).length && gearStats( defaultUpgrades() ).finder === false, 'gear stats' );
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 100;
	ok( st.buy( 'reel' ) && st.upgrades.reel === 1 && st.money === 10 && st.stats.reelSpeed === 1.6, 'buying the reel upgrade' );
	ok( st.buy( 'reel' ) === null && st.upgrades.reel === 1, 'cannot buy what you cannot afford' );
	ok( st.fuelL === 40 && st.burn( 30 ) === 10 && st.refuelCost() === 45, 'fuel burns and costs to refill' );
	st.money = 20;
	ok( st.refuel() === 13 && st.money === 0 && Math.abs( st.fuelL - 23 ) < 1e-6, 'refuel stops when the money runs out' );
	st.money = 1000;
	ok( st.buy( 'fuel' ) && st.fuelL === 80, 'a new tank comes full' );
	ok( st.buy( 'fishFinder' ) && st.stats.finder === true && st.buy( 'fishFinder' ) === null, 'fish finder: one level' );
	ok( gearStats( defaultUpgrades() ).anchorM === 0 && st.buy( 'anchor' ) && st.stats.anchorM === 20 && st.buy( 'anchor' ) === null, 'anchor: one level, holds in 66 ft' );
	// (Salt Life) Marta's tow: a call-out and a little a hundred metres, never past its cap, and never
	// more than you have
	ok( towFee( TOW.from ) === TOW.base + 2 && towFee( 1000 ) === TOW.base + 10 * TOW.per100m && towFee( 1e6 ) === TOW.max, 'the tow: more the further she\'s drifted, up to a cap' );
	st.money = 30;
	const paid = st.payTow( towFee( 2000 ) );
	ok( paid === 30 && st.money === 0 && st.payTow( 50 ) === 0 && st.money === 0, 'short of the fee, she tows you in for what you have' );
	st.money = 1000;

}
// ---- (Salt Life) the anchor: the boat, let go out on the water, is brought up short by its rode and
// stays near the spot; without it she coasts on
{

	const at = new Vector3( 600, 0, 600 );
	// a boat on flat, deep water
	const newBoat = () => {

		const n = 24, hullSamples = [];
		for ( let i = 0; i < n; i ++ ) hullSamples.push( { position: new Vector3( ( i % 4 ) * 0.8 - 1.2, - 0.4, Math.floor( i / 4 ) * 1.3 - 3.3 ), area: 0.325 } );
		const model = { hydro: {}, hullSamples, propeller: new Vector3( 0, - 0.6, - 3.3 ), rudder: new Vector3( 0, - 0.5, - 3.6 ), group: new Group(), setThrottle() {}, setSteering() {}, setPropellerRPM() {} };
		const query = { allocate: () => 0, latency: 0, setPoint() {}, cpuValid: true, version: 1, resultTime: 0, cpu: new Float32Array( n * 4 ), resultInputs: new Float32Array( n * 4 ) };
		const b = new BoatController( { model, query, terrain: { heightAt: () => - 10 }, colliders: null } );
		b.moored = false;
		return b;

	};
	const run = ( anchored ) => {

		const b = newBoat();
		b.position.copy( at );
		b.quaternion.identity();
		b.velocity.set( 0, 0, 2.5 );
		if ( anchored ) b.anchor = b.toWorld( b.stemHead, new Vector3() ).setY( - 10 );
		let far = 0;
		const bow = new Vector3();
		for ( let i = 0; i < 60 * 60; i ++ ) {

			b.update( 1 / 60 );
			if ( ! anchored ) continue;
			b.toWorld( b.stemHead, bow );
			far = Math.max( far, Math.hypot( bow.x - b.anchor.x, bow.z - b.anchor.z ) );

		}

		return { b, far, went: Math.hypot( b.position.x - at.x, b.position.z - at.z ) };

	};
	const held = run( true ), free = run( false );
	console.log( `     let go at 2.5 m/s: at anchor the bow strays at most ${ held.far.toFixed( 1 ) } m from it and she's at ${ held.b.speed.toFixed( 2 ) } m/s after a minute; without, she coasts ${ free.went.toFixed( 0 ) } m` );
	ok( held.b.isFinite() && held.far < 8 && held.b.speed < 0.25 && free.went > 3 * held.went, 'the anchor brings the boat up and holds her near the spot' );

	// ---- (Salt Life) the wind on her: left to herself she comes round beam-on and drifts downwind,
	// slowly on a fair day, faster in a gale, heeling a little; at anchor she lies head to wind
	const lie = ( wind, anchored, yaw ) => {

		G.windSpeed.value = wind;
		const b = newBoat();
		b.position.copy( at );
		b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), yaw );
		if ( anchored ) b.anchor = b.toWorld( b.stemHead, new Vector3() ).setY( - 10 );
		let heel = 0;
		const up = new Vector3();
		for ( let i = 0; i < 60 * 150; i ++ ) {

			b.update( 1 / 60 );
			if ( i > 60 * 60 ) heel = Math.max( heel, Math.acos( Math.min( 1, up.set( 0, 1, 0 ).applyQuaternion( b.quaternion ).y ) ) );

		}

		const f = b.forward( new Vector3() ), w = G.windDir.value;
		G.windSpeed.value = 7;
		return { b, bow: ( f.x * w.x + f.z * w.y ) / Math.hypot( f.x, f.z ), drift: b.velocity.x * w.x + b.velocity.z * w.y, heel: heel * 180 / Math.PI };

	};
	const calm = lie( 0, false, 1 ), fair = [ 0, 1.2, 2.5 ].map( ( y ) => lie( 7, false, y ) ), gale = [ 0, 1.2, 2.5 ].map( ( y ) => lie( 20, false, y ) );
	const anchoredGale = lie( 20, true, 0.5 );
	console.log( `     left to herself: on a fair day she drifts ${ fair.map( ( r ) => r.drift.toFixed( 2 ) ).join( ', ' ) } m/s, in a gale ${ gale.map( ( r ) => r.drift.toFixed( 2 ) ).join( ', ' ) } m/s, heeling ${ ( gale[ 0 ].heel - calm.heel ).toFixed( 1 ) }° more than in a calm; at anchor in a gale her bow is ${ ( - anchoredGale.bow ).toFixed( 2 ) } into the wind` );
	ok( Math.abs( calm.drift ) < 1e-3 && calm.b.speed < 1e-3, 'in a calm she stays where she is' );
	ok( [ ...fair, ...gale ].every( ( r ) => r.b.isFinite() && Math.abs( r.bow ) < 0.3 ), 'wherever she\'s pointing, she comes round beam-on to the wind' );
	ok( fair.every( ( r ) => r.drift > 0.15 && r.drift < 0.6 ) && gale.every( ( r ) => r.drift > 0.5 && r.drift < 1.5 ), 'she drifts downwind: slowly on a fair day, faster in a gale' );
	ok( gale.every( ( r ) => r.heel - calm.heel < 12 ), 'and heels a little' );
	ok( anchoredGale.bow < - 0.9 && anchoredGale.b.speed < 0.1, 'at anchor she lies head to wind' );

}
// ---- (Salt Life) the speargun and the law
{

	ok( [ 'grouper', 'parrot', 'tarpon' ].every( ( id ) => spearRule( id, 80 ) === 'protected' ), 'Nassau grouper, parrotfish and tarpon are protected' );
	ok( [ 'angel', 'tang', 'chromis', 'sergeant', 'silverside' ].every( ( id ) => spearRule( id, 30 ) === 'notTarget' ), 'nobody spears angelfish, tangs, chromis, sergeant majors or bait' );
	ok( spearRule( 'wrasse', 35 ) === 'small' && spearRule( 'wrasse', 45 ) === 'ok' && spearRule( 'lionfish', 12 ) === 'ok' && spearRule( 'nope', 40 ) === 'notTarget', 'minimum sizes; a lionfish of any size; unknown fish are not targets' );
	let round = true, sized = true;
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ];
		if ( Math.abs( fishWeightKg( id, fishLengthCm( id, 2 ) ) - 2 ) > 1e-6 ) round = false;
		if ( f.minCm && ! ( f.minCm > fishLengthCm( id, f.kg[ 0 ] ) * 0.6 && f.minCm < fishLengthCm( id, f.kg[ 1 ] ) ) ) sized = false;

	}

	ok( round, 'weight from length is the length-weight relation the other way' );
	ok( sized, 'every minimum size lies within the species\' sizes' );
	ok( fishValue( 'lionfish', 0.5 ) === Math.round( 10 * 0.5 ) + 6 && fishValue( 'grouper', 8 ) === 0, 'lionfish bounty; nothing for a protected fish' );
	const g = gearStats( defaultUpgrades() );
	ok( g.gunCm === 75 && g.bands === 1 && g.spearM === 3 && ! g.spearReel, 'everyone starts with a 75 cm speargun' );
	const lv = UPGRADES.speargun.levels;
	ok( lv.every( ( l, i ) => i === 0 || ( l.spearM > lv[ i - 1 ].spearM && l.spearV > lv[ i - 1 ].spearV && l.cost > lv[ i - 1 ].cost && l.shaftM > l.gunCm / 100 ) ), 'each speargun reaches farther and shoots harder; shafts outreach their barrels' );

}
// ---- (Salt Life) the new sea life: the goliath and the bonefish let go, the snappers, and the spiny
// lobster: by hand, a 3 in carapace, six a day, berried females back
{

	ok( spearRule( 'goliathGrouper', 150 ) === 'protected' && spearRule( 'bonefish', 60 ) === 'protected' && FISH.bonefish.cr && ! FISH.goliathGrouper.cr, 'the goliath grouper is protected; the bonefish is catch and release' );
	ok( [ 'silkSnapper', 'cuberaSnapper', 'graySnapper' ].every( ( id ) => spearRule( id, 90 ) === 'ok' ) && spearRule( 'graySnapper', 20 ) === 'small' && spearRule( 'whiteMullet', 30 ) === 'notTarget', 'the snappers may be speared over their minimum sizes; nobody spears a mullet' );
	ok( spearRule( 'lobster', 30 ) === 'byHand' && Object.keys( FISH.lobster.habitat ).length === 0 && FISH.lobster.hand, 'the spiny lobster: by hand only, never on a hook or a spear' );
	ok( Math.abs( FISH.lobster.minCm * CARAPACE / 2.54 - 3 ) < 0.01 && FISH.lobster.bag === 6, 'the lobster gauge: a 3 in carapace; six a day' );
	const lv = UPGRADES.lobster.levels, g0 = gearStats( defaultUpgrades() );
	ok( g0.lobster === 0 && lv[ 1 ].cost > 0 && lv[ 2 ].cost > lv[ 1 ].cost && lv[ 2 ].tickleM > lv[ 1 ].tickleM && lv[ 2 ].coaxS < lv[ 1 ].coaxS, 'lobster gear at Marta\'s: none to start; a tickle stick and net; a longer stick that coaxes them out quicker' );
	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 500;
	ok( st.buy( 'lobster' ) && st.stats.lobster === 1 && st.stats.tickleM === lv[ 1 ].tickleM && st.stats.coaxS === lv[ 1 ].coaxS, 'buying the lobster gear' );
	const kg = fishWeightKg( 'lobster', 30 );
	const hand = ( cm, day, release = null ) => st.addFish( 'lobster', fishWeightKg( 'lobster', cm ), 22, { method: 'hand', cm, day, release } );
	const six = [ 1, 2, 3, 4, 5, 6 ].map( () => hand( 30, 3 ) );
	ok( six.every( ( f ) => f && f.method === 'hand' ) && st.lastCatch.bag.n === 6 && ! st.lastCatch.bag.full && kg > 0.8 && kg < 1.5, `six lobsters kept by hand (a 30 cm one: ${ kg.toFixed( 2 ) } kg)` );
	ok( hand( 30, 3 ) === null && st.lastCatch.bag.full && ! st.lastCatch.kept && ! st.lastCatch.released, 'the seventh that day goes back: the bag is full' );
	ok( hand( 30, 4 ) !== null && st.lastCatch.bag.n === 1, 'a new day, a new bag' );
	ok( hand( 20, 4, 'short' ) === null && st.lastCatch.released && st.lastCatch.why === 'short' && st.lastCatch.bag.n === 1 && st.log.lobster.count === 9, 'a short one is measured and let go, and doesn\'t count against the bag' );
	ok( hand( 34, 4, 'berried' ) === null && st.lastCatch.why === 'berried' && st.lastCatch.value > 0 && st.lastCatch.bag.n === 1, 'a berried female goes back too' );
	st.addFish( 'bonefish', 2.5, 12 );
	ok( st.lastCatch.released && st.lastCatch.why === 'protected', 'a bonefish on the line: measured and let go' );
	const s3 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
	ok( s3.load() && s3.bagged( 'lobster', 4 ) === 1 && s3.bagged( 'lobster', 3 ) === 0, 'the day\'s bag is saved' );

}
console.log( `value check ${ value }` );
console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
