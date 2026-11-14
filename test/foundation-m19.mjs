// (M19) The foundation (docs/M19.md, step 3): what every stream stands on, in plain Node.
//   - the catalogue: M19's levels only ever appended (a saved level means what it did), its new tracks, a track that needs
//     another fitted first (needs), the fly rods' figures kept apart from the line's and the reel's;
//   - the baits: who sells each, the flies only on the fly rig, every flats fish with a chance on each new bait and fly;
//   - the save: Pearl's challenges kept and read back, every catch told to a listener (onCatch), a line-class best kept;
//   - a boat held by a stake, her heading too with two, and a gyro damping her roll at rest; none of it on unless set.
//   node test/foundation-m19.mjs
import { LOBSTER_HANDLING } from '../src/world/boat/Handling.js';
import { BoatController } from '../src/player/BoatController.js';
import { Vector3, Group } from '../src/engine/index.js';
import { UPGRADES, FLY_RODS, gearStats, defaultUpgrades, LB } from '../src/game/Gear.js';
import { BAITS, onHand } from '../src/game/Bait.js';
import { baitFits } from '../src/game/rigs/Presentation.js';
import { SIGHT } from '../src/game/FishTable.js';
import { SHARK_SIGHT, splashOf, SPLASH } from '../src/game/Sight.js';
import { GameState, cleanChallenges } from '../src/game/GameState.js';
import { cleanLog } from '../src/game/LifeList.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

// ---- the catalogue
{

	// v2.4.1's level counts: M19 adds at the end only, so a saved level is what it was
	const BEFORE = { line: 5, reel: 5, glasses: 2, speargun: 3, kayakPaddle: 2 };
	for ( const [ k, n ] of Object.entries( BEFORE ) ) ok( UPGRADES[ k ].levels.length === n + 1, `${ k }: one more level, at the end (${ UPGRADES[ k ].levels.at( - 1 ).label })` );
	ok( UPGRADES.line.levels[ 4 ].lineLb === 80 && UPGRADES.reel.levels[ 4 ].spoolM === 868 && UPGRADES.glasses.levels[ 1 ].polarized && UPGRADES.speargun.levels[ 2 ].gunStyle === 'rail', 'the levels before them as they were' );
	for ( const k of [ 'flyRod', 'flies', 'booties', 'landingNet', 'flatsLicence', 'trapPermit' ] ) ok( UPGRADES[ k ] && ! UPGRADES[ k ].on, `${ k }: your own` );
	for ( const [ k, boat ] of [ [ 'kayakPole', 'kayak' ], [ 'consoleTrolling', 'console' ], [ 'consolePole', 'console' ], [ 'consoleRadar', 'console' ], [ 'hauler', 'lobster' ], [ 'sfMate', 'sportfisher' ], [ 'sfTeasers', 'sportfisher' ], [ 'sfGyro', 'sportfisher' ] ] ) ok( UPGRADES[ k ] && UPGRADES[ k ].on === boat, `${ k }: the ${ boat }'s` );
	ok( UPGRADES.flatsLicence.levels[ 1 ].cost === 0, 'the flats licence free to a resident' );
	const keys = Object.keys( UPGRADES );
	ok( keys.indexOf( 'safety' ) === keys.indexOf( 'diveKit' ) + 1, 'nothing put between the dive kit and the safety gear' );
	// the fly rods' figures apart: buying one doesn't change the line every other rod fights on
	const u = defaultUpgrades();
	u.line = 2;
	u.reel = 2; // ((M19) a reel takes the line of its class: the conventional's is 30 lb, Gear's tackleOf)
	u.flyRod = 3;
	const s = gearStats( u, 'kayak' );
	ok( s.lineKg === 30 * LB && s.flyRods.join() === '8,10,12' && FLY_RODS[ 12 ].lineKg === 20 * LB, 'with the fly rods, the line is still the 30 lb braid; the 12-weight\'s 20 lb tippet is its own' );

	// needs: the radar not without the T-top
	const st = new GameState( null );
	st.boat = 'console';
	st.fleet.console = st.fleet.kayak;
	st.money = 100000;
	ok( ! st.buy( 'consoleRadar' ) && ! st.hasNeeds( 'consoleRadar' ), 'the radar refused without the T-top' );
	ok( st.buy( 'consoleTop' ) && st.hasNeeds( 'consoleRadar' ) && st.buy( 'consoleRadar' ), 'and sold once she has it' );

}

// ---- the baits
{

	ok( [ 'liveShrimp', 'sardine' ].every( ( k ) => BAITS[ k ].seller === 'joe' ) && [ 'conch', 'hermitCrab' ].every( ( k ) => BAITS[ k ].seller === 'pearl' ), 'Joe\'s baits and Pearl\'s, each with its seller' );
	const flies = [ 'flyShrimp', 'flyCrab', 'flyTarpon' ];
	ok( flies.every( ( k ) => baitFits( 'fly', BAITS[ k ] ) && ! baitFits( 'float', BAITS[ k ] ) && ! baitFits( 'bottom', BAITS[ k ] ) && ! baitFits( 'troll', BAITS[ k ] ) && ! baitFits( 'kite', BAITS[ k ] ) ), 'the flies on the fly rig alone' );
	ok( ! baitFits( 'fly', BAITS.jig ) && ! baitFits( 'fly', null ), 'and nothing else on it' );
	ok( ! baitFits( 'kite', BAITS.liveShrimp ) && ! baitFits( 'kite', BAITS.hermitCrab ) && baitFits( 'kite', BAITS.mullet ), 'a kite flies a live fish, not a shrimp or a crab' );
	const st = { upgrades: { flies: 2, lures: 0 }, bait: {} };
	ok( onHand( 'flyShrimp', st ) && onHand( 'flyCrab', st ) && ! onHand( 'flyTarpon', st ), 'the flies you have are the fly box\'s level' );
	// every flats fish has its own chance on each new bait and fly (one missing is taken at 0.02)
	const NEW = [ 'liveShrimp', 'sardine', 'conch', 'hermitCrab', ...flies ];
	const kinds = { ...SIGHT, ...SHARK_SIGHT };
	const missing = Object.entries( kinds ).flatMap( ( [ k, S ] ) => NEW.filter( ( b ) => ! ( b in S.eats ) ).map( ( b ) => `${ k }:${ b }` ) );
	ok( ! missing.length, `every flats fish's eats has each new bait and fly${ missing.length ? `: missing ${ missing.join( ', ' ) }` : '' }` );
	ok( NEW.every( ( b ) => splashOf( b ) === SPLASH[ b ] ) && splashOf( 'mullet' ) === SPLASH.live && splashOf( 'cutMullet' ) === SPLASH.shrimp && splashOf( 'jig' ) === SPLASH.jig, 'their splashes their own, the old baits\' as they were' );

}

// ---- the save
{

	const st = new GameState( null ), heard = [];
	const stop = st.onCatch( ( c ) => heard.push( c ) );
	st.addFish( 'bonefish', 2.4, 9, { method: 'rod', rig: 'fly', cls: 'f6', day: 3, place: null } );
	st.addFish( 'wrasse', 3.1, 11, { method: 'spear', day: 3 } );
	ok( heard.length === 2 && heard[ 0 ].rig === 'fly' && heard[ 0 ].cls === 'f6' && heard[ 0 ].released && heard[ 1 ].method === 'spear' && heard[ 1 ].kept, 'each catch told, with its rig and its class: a bonefish let go on the fly, a hogfish speared and kept' );
	st.addHaul( [ { species: 'silverside', kg: 0.05 }, { species: 'mullet', kg: 0.6 } ], 7, null, 3 );
	ok( heard.length === 3 && heard[ 2 ].method === 'net' && heard[ 2 ].haul.cooler.length === 1 && heard[ 2 ].fish.length === 2, 'a throw\'s whole haul told at once' );
	stop();
	st.addFish( 'grunt', 0.3, 12 );
	ok( heard.length === 3, 'and nothing once the listener\'s gone' );
	st.onCatch( () => {

		throw new Error( 'a listener that fails' );

	} );
	const warn = console.warn;
	console.warn = () => {};
	ok( st.addFish( 'grunt', 0.3, 12 ) !== undefined, 'a listener that fails doesn\'t stop the catch' );
	console.warn = warn;

	st.challenges = { day: 12, done: { rod: true, net: true }, owed: 85 };
	const back = new GameState( null );
	back.fromJSON( JSON.parse( JSON.stringify( st.toJSON() ) ) );
	ok( back.challenges.day === 12 && back.challenges.done.rod && back.challenges.done.net && ! back.challenges.done.spear && back.challenges.owed === 85, 'Pearl\'s challenges through a save' );
	ok( JSON.stringify( cleanChallenges( { day: 'x', done: { rod: 1, sail: true }, owed: - 4 } ) ) === JSON.stringify( { day: null, done: {}, owed: 0 } ) && cleanChallenges( undefined ).owed === 0, 'and anything else read back as nothing' );
	const log = cleanLog( { bonefish: { count: 2, bestKg: 2.4, cls: { f6: { kg: 2.4, day: 3, place: null }, f8: { kg: - 1 }, bad: { kg: 3 } } } } );
	ok( log.bonefish.cls && log.bonefish.cls.f6.kg === 2.4 && ! log.bonefish.cls.f8 && ! log.bonefish.cls.bad, 'a line-class best kept in the log, nothing that isn\'t one' );

}

// ---- the stake and the gyro
{

	const newBoat = () => {

		const n = 24, hullSamples = [];
		for ( let i = 0; i < n; i ++ ) hullSamples.push( { position: new Vector3( ( i % 4 ) * 0.8 - 1.2, - 0.4, Math.floor( i / 4 ) * 1.3 - 3.3 ), area: 0.325 } );
		const model = { hydro: { suggestedMass: 3200, centerOfMass: new Vector3( 0, 0.3, - 0.74 ), centerOfBuoyancy: new Vector3( 0, 0, - 0.74 ), inertia: new Vector3( 14600, 15700, 3500 ) }, handling: LOBSTER_HANDLING, lines: { sheerY: () => 1.2, sheerZ: () => 4.25 }, hullSamples, propeller: new Vector3( 0, - 0.6, - 3.3 ), rudder: new Vector3( 0, - 0.5, - 3.6 ), group: new Group(), setThrottle() {}, setSteering() {}, setPropellerRPM() {} };
		const query = { allocate: () => 0, latency: 0, setPoint() {}, cpuValid: true, version: 1, resultTime: 0, cpu: new Float32Array( n * 4 ), resultInputs: new Float32Array( n * 4 ) };
		const b = new BoatController( { model, query, terrain: { heightAt: () => - 10 }, colliders: null } );
		b.moored = false;
		b.position.set( 600, 0, 600 );
		b.quaternion.identity();
		return b;

	};

	ok( newBoat().stake === null && newBoat().gyro === 0 && newBoat().helmsman === null, 'a boat starts with no stake, no gyro and nobody at her helm' );
	const at = new Vector3( 0, 0, - 3.5 ), w = new Vector3();
	const b = newBoat();
	b.toWorld( at, w );
	b.stake = { x: w.x, z: w.z, at };
	b.velocity.set( 0.8, 0, 1.5 );
	let far = 0;
	for ( let i = 0; i < 60 * 30; i ++ ) {

		b.update( 1 / 60 );
		b.toWorld( at, w );
		far = Math.max( far, Math.hypot( w.x - b.stake.x, w.z - b.stake.z ) );

	}

	ok( b.isFinite() && far < 1.2 && b.speed < 0.05 && Math.hypot( w.x - b.stake.x, w.z - b.stake.z ) < 0.05, `staked going at 1.7 m/s: her stern strays ${ far.toFixed( 2 ) } m and settles over the pole` );
	const two = newBoat();
	two.toWorld( at, w );
	two.stake = { x: w.x, z: w.z, at, yaw: two.getYaw() };
	two.angular.set( 0, 0.4, 0 );
	for ( let i = 0; i < 60 * 20; i ++ ) two.update( 1 / 60 );
	ok( Math.abs( two.getYaw() ) < 0.02 && Math.abs( two.angular.y ) < 0.01, `with two poles her heading's held too (${ ( two.getYaw() * 180 / Math.PI ).toFixed( 2 ) } degrees)` );

	// the gyro: knocked over at rest (a roll rate of 0.35 rad/s), how far she rolls
	const roll = ( gyro ) => {

		const g = newBoat(), side = new Vector3();
		g.gyro = gyro;
		g.angular.set( 0, 0, 0.35 );
		let most = 0;
		for ( let i = 0; i < 60 * 4; i ++ ) {

			g.update( 1 / 60 );
			side.set( 1, 0, 0 ).applyQuaternion( g.quaternion );
			most = Math.max( most, Math.abs( Math.asin( side.y ) ) * 180 / Math.PI );

		}

		return most;

	};
	const plain = roll( 0 ), steady = roll( 1 );
	ok( steady < plain * 0.4, `a gyro damps her roll at rest: she rolls ${ steady.toFixed( 1 ) } degrees, against ${ plain.toFixed( 1 ) } without it` );

}

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
