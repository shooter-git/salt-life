// Plain-node tests of the fishing game logic (no GPU): bites, the catch fight, inventory, save.
import { FISH, FISH_IDS, fishValue, fishLengthCm, fishWeightKg, spearRule, isTrophy } from '../src/game/FishTable.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay, lampsLit } from '../src/game/Bites.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { GameState } from '../src/game/GameState.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';

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
	for ( let i = 0; i < 500; i ++ ) if ( [ 'tuna', 'mahi', 'redSnapper', 'grouper', 'barracuda', 'blackGrouper', 'muttonSnapper', 'lionfish' ].includes( pickSpecies( habitatAt( spots.deep ), 12, rng ) ) ) deepOnly ++;
	ok( deepOnly === 500, 'deep water gives offshore species only' );
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
console.log( `value check ${ value }` );
console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
