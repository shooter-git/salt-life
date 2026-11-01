// (M16) The boats there are: each floats and can be walked on, the save keeps your fleet, and an old save comes across.
import { BOATS, loadBoat, START_BOAT } from '../src/world/boat/Boats.js';
import { BoatController, MAX_HULL_SAMPLES } from '../src/player/BoatController.js';
import { Vector3 } from '../src/engine/index.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
// (M16: a new game starts in the kayak; what's tested here is a game in the lobster boat)
const lobsterStart = ( st ) => {

	st.fleet = { lobster: st.fleet.kayak };
	st.boat = 'lobster';
	return st;

};

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
for ( const id of Object.keys( BOATS ) ) {

	const m = await loadBoat( id );
	ok( m.id === id, `${ id }: is what she's asked for` );
	ok( m.hullSamples.length > 0 && m.hullSamples.length <= MAX_HULL_SAMPLES, `${ id }: ${ m.hullSamples.length } buoyancy samples fit the water query` );
	const feet = m.dimensions.length / 0.3048;
	ok( Math.abs( feet - BOATS[ id ].feet ) < 2.5, `${ id }: ${ feet.toFixed( 1 ) } ft against the list's ${ BOATS[ id ].feet }` );
	for ( const k of [ 'helm', 'helmEye', 'boardPoint', 'exitPoints', 'propeller', 'rudder', 'bowSprayPoints', 'colliders', 'rainTops', 'shelter', 'wake', 'lamps', 'handling' ] ) if ( m[ k ] == null ) ok( false, `${ id }: has no ${ k }` );

	// she settles on her waterline in flat water, then goes ahead under power
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	let t = 0;
	const run = ( seconds, th ) => {

		for ( let f = 0; f < seconds * 60; f ++ ) {

			t += 1 / 60;
			query.version ++;
			query.resultTime = t;
			ctl.setInput( th, 0, 1 / 60 );
			ctl.update( 1 / 60 );

		}

	};

	run( 15, 0 );
	ok( Math.abs( ctl.position.y ) < 0.12, `${ id }: floats on her waterline (${ ctl.position.y.toFixed( 3 ) } m)` );
	ctl.driven = true;
	run( 30, 1 );
	ok( ctl.forwardSpeed > 0.5, `${ id }: goes ahead under power (${ ctl.forwardSpeed.toFixed( 1 ) } m/s)` );
	ok( ctl.isFinite(), `${ id }: stays finite` );

	// she can be walked on, or sat in
	const p = new Vector3( 50, m.lines.deckY, 50 );
	m.clampToDeck( p, 0.25 );
	ok( p.z <= m.lines.zBow && Math.abs( p.x ) < m.dimensions.beam / 2, `${ id }: keeps a walker aboard` );
	m.dispose();

}

// whose an upgrade is
const low = gearStats( defaultUpgrades(), 'lobster' ), kayak = gearStats( { ...defaultUpgrades(), hold: 2 }, 'kayak' );
ok( low.holdKg === UPGRADES.hold.levels[ 0 ].holdKg, 'the lobster boat\'s hold is her own track\'s' );
ok( kayak.holdKg === BOATS.kayak.stats.holdKg, 'the lobster boat\'s upgrades don\'t count in the kayak' );
ok( kayak.lineKg === low.lineKg, 'your own gear goes with you' );

// the fleet in the save
const s = lobsterStart( new GameState() );
s.save = () => {};
const first = new GameState();
first.save = () => {};
ok( START_BOAT === 'kayak' && first.boat === 'kayak' && first.owns( 'kayak' ) && ! first.owns( 'lobster' ) && first.stats.fuelL === 0, 'a new game has the boat it starts in, the kayak and no other, with no fuel' );
s.fuel = 12;
s.hull = 0.25;
s.addBoat( 'console' );
s.selectBoat( 'console' );
ok( s.boat === 'console' && s.fuel === null && s.hull === 0, 'another boat has her own fuel and wear' );
s.fuel = 3;
const j = JSON.parse( JSON.stringify( s.toJSON() ) );
ok( j.v === 2 && j.fleet.lobster.fuel === 12 && j.fleet.console.fuel === 3, 'the save keeps each boat\'s' );
const r = new GameState();
r.save = () => {};
ok( r.fromJSON( j ) && r.boat === 'console' && r.fuel === 3, 'and it comes back' );
r.selectBoat( 'lobster' );
ok( r.fuel === 12 && r.hull === 0.25, 'with the one you left as you left her' );
ok( ! r.selectBoat( 'sportfisher' ) && r.boat === 'lobster', 'you can\'t get into a boat you don\'t own' );

// a save from before
const old = new GameState();
old.save = () => {};
ok( old.fromJSON( { v: 1, money: 10, upgrades: { hold: 2 }, fuel: 9, hull: 0.5, hauled: true } ), 'a save from before loads' );
ok( old.boat === 'lobster' && old.fuel === 9 && old.hull === 0.5 && old.hauled === true && old.stats.holdKg === UPGRADES.hold.levels[ 2 ].holdKg, 'with the lobster boat as it was' );
ok( old.owns( 'kayak' ), 'and the kayak\'s theirs as well' );
old.reset();
ok( old.boat === 'kayak' && Object.keys( old.fleet ).join() === 'kayak', 'starting over is starting in the kayak' );
ok( ! old.owns( 'console' ) && ! old.owns( 'sportfisher' ), 'the others to buy' );

console.log( bad ? `\n${ bad } failed` : '\nboats: all passed' );
process.exit( bad ? 1 : 0 );
