// (M19) Stream GEAR (docs/m19/gear.md), in plain Node:
//   - the blue-water gun: four bands, each drawn and stretched on its own notch; its fight on the float (the game's own terms,
//     Speargun.spearTerms, fought in the sweep's way): out to its float line's end and no further, a big wahoo landed that the
//     railgun loses, and torn off if you haul into its runs;
//   - the rubber landing net: a fish to 30 lb netted surely and from further off, not a billfish, nor a big one;
//   - the snook let go, the pelagic bags gone, and no ask of Joe's for a protected fish.
//   node test/gear-m19.mjs
import { Vector4 } from '../src/engine/index.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { gunLayout, gunModels, setBands, spearTerms, FLOAT } from '../src/game/Speargun.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { Rigs, NET, netted, DEHOOK } from '../src/game/rigs/Rigs.js';
import { FISH } from '../src/game/FishTable.js';
import { ordersFor } from '../src/game/Orders.js';
import { GameState } from '../src/game/GameState.js';
import { spearOnce, spearCell } from '../tools/fight-sweep.mjs';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};
const gun = ( l ) => gearStats( { ...defaultUpgrades(), speargun: l } );
const BLUE = UPGRADES.speargun.levels.length - 1;

// ---- the blue-water gun
{

	const g = gun( BLUE ), lay = gunLayout( g );
	ok( g.gunStyle === 'blue' && g.bands === 4 && g.breakaway && g.floatLineM === 30 && lay.notches.length === 4 && lay.teak && lay.blue, `the blue-water gun: ${ g.gunCm } cm, ${ g.bands } bands on ${ lay.notches.length } notches, a teak stock, ${ g.lineM } m of shooting line onto ${ g.floatLineM } m of float line` );
	ok( g.spearM <= g.lineM + g.shaftM, `its reach (${ g.spearM } m) within its shooting line and shaft (${ ( g.lineM + g.shaftM ).toFixed( 2 ) } m)` );
	const U = { bandAnchor: { value: new Vector4() }, bandEnd0: { value: new Vector4() }, bandEnd1: { value: new Vector4() }, bandEnd2: { value: new Vector4() }, bandEnd3: { value: new Vector4() } };
	setBands( U, lay, 4, [ 1, 1, 1, 1 ] );
	const ends = [ U.bandEnd0, U.bandEnd1, U.bandEnd2, U.bandEnd3 ].map( ( u ) => u.value );
	const onNotch = ends.every( ( e, b ) => e.w > 0.1 && Math.abs( e.y - lay.notches[ b ] ) < 1e-6 );
	ok( onNotch, `loaded, each of its four bands on its own notch (${ ends.map( ( e ) => e.y.toFixed( 2 ) ).join( ', ' ) } m up the shaft)` );
	const t = gunLayout( gun( 0 ) );
	setBands( U, t, 1, [ 1, 0, 0, 0 ] );
	ok( U.bandEnd0.value.w > 0.1 && [ U.bandEnd1, U.bandEnd2, U.bandEnd3 ].every( ( u ) => u.value.w === 0.001 ), 'a gun of one band: the other three folded away' );
	ok( gunModels( g ) !== gunModels( gun( 2 ) ) && gunModels( g ).gun.attributes.position.count > 0, 'its own models' );

}

// ---- its fight, on the float
{

	const rail = spearTerms( gun( 2 ) ), blue = spearTerms( gun( BLUE ) );
	ok( rail.maxDistance === gun( 2 ).lineM + 25 && rail.floatM === Infinity && ! rail.terms.dragKg, `the railgun as it was: ${ rail.maxDistance } m and it tears free` );
	ok( blue.maxDistance === Infinity && blue.terms.tether === gun( BLUE ).lineM + 30 && blue.terms.dragKg === FLOAT.kg && blue.floatM === gun( BLUE ).lineM, `the blue-water gun: on its float past ${ blue.floatM } m, held back by it (${ FLOAT.kg } kg) out to ${ blue.terms.tether } m` );
	// a 40 kg wahoo, pulled with care: lost on the railgun, landed on the float
	const w2 = spearCell( 2, 'wahoo', 40, 20 ), w3 = spearCell( BLUE, 'wahoo', 40, 20 );
	ok( w2.caught === 0 && w3.caught === 1, `a 40 kg wahoo: the railgun lands ${ w2.caught * 100 }%, the blue-water gun ${ w3.caught * 100 }% (in ${ w3.t.toFixed( 0 ) } s)` );
	const small = spearCell( 2, 'mahi', 8, 20 ), small3 = spearCell( BLUE, 'mahi', 8, 20 );
	ok( small.caught === 1 && small3.caught === 1, 'an 8 kg mahi on either' );
	// out to the float line's end and no further
	const f = new CatchMinigame( { species: 'wahoo', kg: 48, ...blue.terms, rng: () => 0.5 } );
	let far = 0;
	for ( let i = 0; i < 30 * 60; i ++ ) {

		f.update( 1 / 30, false );
		far = Math.max( far, f.distance );

	}

	ok( far <= blue.terms.tether + 1e-9 && far > blue.floatM && f.state === 'fighting', `let it run: out to ${ far.toFixed( 1 ) } m (its float line's end), towing the float, still on` );
	// hauling into every run: torn off
	let torn = 0;
	for ( let s = 1; s <= 20; s ++ ) if ( spearOnce( BLUE, 'wahoo', 40, s * 977, { policy: () => true } ).st === 'snapped' ) torn ++;
	ok( torn >= 15, `hauling into every run tears it off the shaft (${ torn } of 20)` );

}

// ---- the landing net
{

	const stats = ( net, landing = 0 ) => gearStats( { ...defaultUpgrades(), landing, landingNet: net ? 1 : 0 } );
	const rigs = ( st ) => Object.assign( Object.create( Rigs.prototype ), { game: { state: { stats: st } }, kit: null } );
	const bare = stats( false ), net = stats( true );
	ok( netted( net, 'jack', 13 ) && ! netted( net, 'jack', 14 ) && ! netted( bare, 'jack', 5 ) && ! netted( net, 'sailfish', 12 ), `the net takes a fish to ${ NET.kg } kg (30 lb), not one over it, nor a billfish` );
	let lost = 0, lostNet = 0;
	const rb = rigs( bare ), rn = rigs( net );
	for ( let i = 0; i < 400; i ++ ) {

		if ( ! rb.landedAtBoat( { species: 'jack', kg: 13.5 } ) ) lost ++;
		if ( ! rn.landedAtBoat( { species: 'jack', kg: 13.5 } ) ) lostNet ++;

	}

	ok( lost > 0 && lostNet === 0, `a 13.5 kg jack by hand lost at the side ${ lost } times in 400, in the net none` );
	ok( rn.landAt( { species: 'jack', kg: 5 }, false, false ) === NET.reach && rb.landAt( { species: 'jack', kg: 5 }, false, false ) === 1.2, `netted ${ NET.reach } m off, by hand 1.2` );
	ok( rn.landAt( { species: 'bonefish', kg: 3 }, false, false ) === NET.reach && rn.landAt( { species: 'bonefish', kg: 3 }, true, false ) === DEHOOK.landSmall && rn.landAt( { species: 'jack', kg: 40 }, false, true ) === 3, 'a bonefish netted to be let go; a dehooker\'s reach as it was; a big one at the leader' );

}

// ---- the Bahamas' rules: the snook let go, no pelagic bag
{

	ok( FISH.snook.protected && FISH.snook.cr && ! FISH.snook.bag, 'the snook let go (catch and release), no bag' );
	ok( [ 'mahi', 'wahoo', 'yellowfin', 'swordfish' ].every( ( id ) => ! FISH[ id ].bag ), 'no bag on the pelagics' );
	const st = new GameState( { getItem: () => null, setItem() {} } );
	let bagged = 0;
	for ( let i = 0; i < 12; i ++ ) {

		st.inventory = []; // (room for each)
		st.addFish( 'mahi', 2, 10, { day: 4 } );
		if ( st.lastCatch.bag || ! st.lastCatch.kept ) bagged ++;

	}

	const snook = st.addFish( 'snook', 4, 10, { day: 4 } );
	ok( bagged === 0 && ! snook && st.lastCatch.released, 'twelve mahi in a day, each kept with no bag; a snook let go' );
	let asks = true, tag = false;
	for ( let d = 1; d < 400; d ++ ) for ( const o of ordersFor( d ) ) {

		if ( o.who === 'joe' && FISH[ o.species ].protected ) asks = false;
		if ( o.species === 'snook' && o.who === 'marta' && o.tag && o.place === 'creek' ) tag = true;

	}

	ok( asks && tag, 'no ask of Joe\'s for a protected fish; the creek\'s snook Marta\'s, to tag and let go' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
