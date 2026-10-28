// (M10) Plain-node tests of the boat's hull in the weather (game/Hull.js): her wear from the sea, the
// piles and the ground, driving the real boat (BoatModel, BoatController, BoatSpray) through the CPU's
// sea (Waves, WaterQuery) on the real island; the water in her bilge; her engine; Marta's repair; the save.
import { readFileSync } from 'node:fs';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Waves } from '../src/ocean/Waves.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { BoatController } from '../src/player/BoatController.js';
import { BoatSpray } from '../src/player/BoatSpray.js';
import { weatherAt } from '../src/game/Weather.js';
import { Hull, slamWear, hitWear, thrustMul, leakLs, rainLs, repairFee, crankChance, stormWear, STORM_FROM, SLAM_FROM, FLOOD_L, RESTART, CRANK_S, BAIL_LS, REPAIR_FULL } from '../src/game/Hull.js';
import { weatherAt as weatherNow, hurricaneNews } from '../src/game/Weather.js';
import { GameState } from '../src/game/GameState.js';
import { gearStats, defaultUpgrades } from '../src/game/Gear.js';
import { Game, HAUL_FEE } from '../src/game/Game.js';
import { CRADLE } from '../src/world/village/StormPlaces.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const pct = ( w ) => `${ ( w * 100 ).toFixed( 1 ) }%`;

// ---- the rules
ok( slamWear( SLAM_FROM ) === 0 && slamWear( 0.48 ) === 0 && slamWear( 1 ) > slamWear( 0.8 ) && slamWear( 0.8 ) > 0, 'a slam wears her only past what a fair day\'s hardest do, the harder the more' );
ok( hitWear( 1.4 ) === 0 && hitWear( 9.8 ) > 0.08 && hitWear( 9.8 ) < 0.13, 'a nudge does nothing; a pile at full speed, about a tenth' );
ok( thrustMul( 0 ) === 1 && thrustMul( 1 ) < 0.5 && leakLs( 0 ) === 0 && leakLs( 1 ) === 0.5, 'a sound hull is as she always was; a worn one has less thrust and leaks' );
ok( rainLs( 1 ) < gearStats( { ...defaultUpgrades(), bilgePump: 1 } ).pumpLs && leakLs( 1 ) > gearStats( { ...defaultUpgrades(), bilgePump: 1 } ).pumpLs && BAIL_LS > leakLs( 1 ) + rainLs( 1 ), 'the pump beats a downpour, a wrecked hull beats the pump, and the bucket beats both' );
ok( gearStats( defaultUpgrades() ).pumpLs === 0, 'you start with a bucket, not a pump' );
ok( repairFee( 0 ) === 0 && repairFee( 1 ) === REPAIR_FULL && repairFee( 0.01 ) === 5 && repairFee( 0.5 ) === REPAIR_FULL / 2, 'Marta\'s fee follows the wear' );
ok( crankChance( 0, false ) === 1 && crankChance( 0, true ) < 0.7 && crankChance( 1, true ) >= 0.15, 'a sound engine catches first time; a stalled one takes a try or two' );

// ---- the real boat in the CPU's sea, off the island's north shore (deep water north of the dock)
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const model = new BoatModel();
const SEA = { x: 65, z: 560 };
// (a wall of piles across her way, south of the open water: the hull outline's points pushed out of it)
const WALL = 160;
const wall = { resolveCapsule( p, r ) {

	if ( p.z - r >= WALL ) return false;
	p.z = WALL + r;
	return true;

} };
function drive( { cond = 'fair', throttle = 1, yaw = 0, secs = 60, from = SEA, colliders = null, thrust = 1 } ) {

	const w = weatherAt( 30, cond );
	const waves = new Waves( { tier: 'low', terrain } );
	waves.setSea( w.swell, w.windSea );
	// ((M14) its swell at its period, as the weather sets it)
	waves.setSwell( 0, w.period, w.period, from );
	G.windSpeed.value = w.wind;
	const query = new WaterQuery( waves, terrain );
	const b = new BoatController( { model, query, terrain, colliders } );
	b.moored = false;
	b.driven = true;
	b.thrustMul = thrust;
	b.position.set( from.x, 0, from.z );
	b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), yaw );
	const spray = new BoatSpray( { boat: b, spray: { nReq: 0, emit() {} } } );
	const hull = new Hull( { random: () => 0.99 } );
	let slams = 0, top = 0;
	b.onSlam = ( s ) => {

		slams ++;
		hull.slam( s );

	};
	const dt = 1 / 60;
	for ( let i = 0; i < secs * 60; i ++ ) {

		G.time.value += dt;
		b.queueQueries();
		query.update();
		b.setInput( throttle, 0, dt );
		b.update( dt );
		spray.update( dt );
		const c = b.contact;
		hull.step( dt, { driven: true, throttle, fuel: true, rain: 0, pile: c.pile, ground: c.ground, slide: c.slide, aground: c.aground } );
		c.pile = c.ground = c.slide = 0;
		c.aground = false;
		hull.drain();
		top = Math.max( top, b.speed );

	}

	G.windSpeed.value = 7;
	return { b, hull, slams, top };

}

{

	// flat out on a fair day, into the swell and across it: no wear
	const fair = [ 0, 1.6 ].map( ( yaw ) => drive( { yaw } ) );
	// a gale, into the sea: flat out, at the usual throttle (W), and at half
	const flat = drive( { cond: 'gale' } ), usual = drive( { cond: 'gale', throttle: 0.7 } ), half = drive( { cond: 'gale', throttle: 0.5 } );
	console.log( `     a minute flat out on a fair day: ${ fair.map( ( r ) => `${ r.slams } slams, ${ pct( r.hull.wear ) }` ).join( '; ' ) }. In a gale: flat out ${ flat.slams } slams, ${ pct( flat.hull.wear ) } and ${ flat.hull.bilge.toFixed( 0 ) } L shipped; at W ${ pct( usual.hull.wear ) }; at half throttle ${ pct( half.hull.wear ) }` );
	ok( fair.every( ( r ) => r.b.isFinite() && r.hull.wear === 0 && r.hull.bilge === 0 ), 'flat out on a fair day she takes no wear' );
	ok( flat.hull.wear > 0.03 && flat.hull.wear < 0.12, 'a gale flat out wears her: about a quarter in five minutes' );
	ok( usual.hull.wear < flat.hull.wear * 0.6 && half.hull.wear < 0.005, 'easing off spares her: at half throttle, next to nothing' );
	ok( flat.hull.bilge > 0, 'and her hardest slams ship green water' );

}

{

	// running up the beach south of the dock, flat out and slowly; and into the wall of piles
	const BEACH = { x: 65, z: 200 };
	const fast = drive( { throttle: 1, yaw: Math.PI, secs: 45, from: BEACH } ), slow = drive( { throttle: 0.3, yaw: Math.PI, secs: 90, from: BEACH } );
	const hit = drive( { throttle: 1, yaw: Math.PI, secs: 14, from: { x: 65, z: 230 }, colliders: wall } );
	const nudge = drive( { throttle: 0.15, yaw: Math.PI, secs: 120, from: { x: 65, z: 172 }, colliders: wall } );
	console.log( `     run aground flat out: ${ pct( fast.hull.wear ) }; nosed on at 0.3 and held there: ${ pct( slow.hull.wear ) }; into the piles flat out: ${ pct( hit.hull.wear ) }, nudged: ${ pct( nudge.hull.wear ) }` );
	ok( fast.hull.wear > 0.06 && fast.hull.wear < 0.18, 'running aground flat out wears her, about a tenth' );
	ok( slow.hull.wear < fast.hull.wear * 0.6, 'nosing onto the sand slowly, much less: pushing at it, stuck, does nothing' );
	ok( hit.hull.wear > 0.06 && hit.hull.wear < 0.18 && nudge.hull.wear === 0, 'the piles at full speed: about a tenth; a nudge: nothing' );

}

{

	// a worn hull's top speed, on a calm sea
	const sound = drive( { cond: 'calm', secs: 40 } ), worn = drive( { cond: 'calm', secs: 40, thrust: thrustMul( 1 ) } );
	console.log( `     top speed on a calm sea: ${ sound.top.toFixed( 1 ) } m/s sound, ${ worn.top.toFixed( 1 ) } m/s fully worn` );
	ok( worn.top < sound.top * 0.8 && worn.top > sound.top * 0.6, 'fully worn she\'s about 30% slower, and still runs' );

}

// ---- the bilge and the engine (a fixed die: 0.5 catches unless she's troubled and worn)
{

	const store = { hull: 0 };
	const h = new Hull( { store, random: () => 0.5 } );
	const step = ( secs, i ) => {

		const ev = [];
		for ( let t = 0; t < secs; t += 0.1 ) {

			h.step( 0.1, { driven: true, throttle: 0, fuel: true, rain: 0, ...i } );
			ev.push( ...h.drain() );

		}

		return ev;

	};
	let ev = step( 0.2, {} );
	ok( h.engine === 'cranking' && ev.some( ( e ) => e.kind === 'crank' && e.catches ), 'taking the helm cranks her' );
	ev = step( CRANK_S, {} );
	ok( h.engine === 'running' && ev.some( ( e ) => e.kind === 'caught' ), '... and a sound engine catches first time' );
	h.bilge = FLOOD_L + 1;
	ev = step( 0.3, {} );
	ok( h.engine === 'stalled' && h.why === 'flooded' && ev.some( ( e ) => e.kind === 'stall' ), 'the water reaching the engine stalls her' );
	ev = step( 5, { throttle: 1 } );
	ok( h.engine !== 'running' && ev.filter( ( e ) => e.kind === 'crank' ).length >= 2, 'she cranks while the throttle\'s open, but won\'t start flooded' );
	const before = h.bilge;
	ev = step( ( before - FLOOD_L * RESTART + 5 ) / BAIL_LS, { bailing: true } );
	ok( h.bilge < FLOOD_L * RESTART && ev.filter( ( e ) => e.kind === 'scoop' ).length > 10, 'the bucket bails her down, a scoop at a time' );
	ev = step( 6, { throttle: 1 } );
	ok( h.engine === 'running', '... and then she starts again' );
	ev = step( 1, { fuel: false } );
	ok( h.engine === 'stalled' && h.why === 'fuel', 'a dry tank stalls her' );
	ev = step( 4, { fuel: false, throttle: 1 } );
	ok( h.engine === 'stalled', '... and she won\'t start until she\'s filled up' );
	h.step( 0.1, { driven: false, fuel: true } );
	ok( h.engine === 'off', 'leaving the helm stops her' );

	// a worn hull leaks, the pump keeps up with the rain, and she never fills past awash
	const w = new Hull( { store: { hull: 1 }, random: () => 0.5 } );
	for ( let t = 0; t < 600; t ++ ) w.step( 1, { driven: false, rain: 1, pumpLs: 0.3 } );
	const p = new Hull( { store: { hull: 0 }, random: () => 0.5 } );
	for ( let t = 0; t < 600; t ++ ) p.step( 1, { driven: false, rain: 1, pumpLs: 0.3 } );
	console.log( `     ten minutes of a downpour: a wrecked hull with the pump takes in ${ w.bilge.toFixed( 0 ) } L, a sound one ${ p.bilge.toFixed( 0 ) } L` );
	ok( w.bilge > 100 && w.bilge < FLOOD_L && p.bilge < 1, 'a wrecked hull fills slowly past the pump; a sound one, the pump keeps dry' );

	// a hard slam in a worn boat can stall her
	const s = new Hull( { store: { hull: 0.5 }, random: () => 0.01 } );
	s.step( 0.1, { driven: true, fuel: true } );
	s.step( CRANK_S, { driven: true, fuel: true } );
	s.slam( 0.97 );
	ok( s.engine === 'stalled' && s.why === 'slam', 'a hard slam can stall a worn boat' );
	const t = new Hull( { store: { hull: 0.1 }, random: () => 0.01 } );
	t.step( 0.1, { driven: true, fuel: true } );
	t.step( CRANK_S, { driven: true, fuel: true } );
	t.slam( 1 );
	ok( t.engine === 'running', '... not one that\'s sound' );

}

// ---- Marta's repair, and the save
{

	const s = new GameState( null );
	s.hull = 0.4;
	s.money = 1000;
	const fee = repairFee( s.hull );
	ok( s.payRepair( fee ) === fee && s.hull === 0 && s.money === 1000 - fee, 'Marta repairs the hull for her fee' );
	s.hull = 0.6;
	s.money = 30;
	const paid = s.payRepair( repairFee( 0.6 ) );
	ok( paid === 30 && s.money === 0 && Math.abs( s.hull - 0.6 * ( 1 - 30 / repairFee( 0.6 ) ) ) < 1e-9, 'short of it, she does what your money pays for' );
	ok( s.payRepair( 50 ) === 0 && Math.abs( s.hull - 0.6 * ( 1 - 30 / repairFee( 0.6 ) ) ) < 1e-9, 'and nothing for nothing' );
	const t = new GameState( null );
	ok( t.fromJSON( JSON.parse( JSON.stringify( s.toJSON() ) ) ) && t.hull === s.hull, 'the wear is saved with the game' );
	const old = s.toJSON();
	delete old.hull;
	ok( t.fromJSON( old ) && t.hull === 0, 'an old save loads with a sound hull' );
	ok( t.fromJSON( { ...old, hull: 7 } ) && t.hull === 1, 'and a bad one, in range' );

	// the row at her stall: with the boat at her dock, or not
	const g = { hull: { wear: 0.3 }, app: { boatCtl: { moored: true } } };
	const job = Game.prototype.repairJob.call( g );
	g.app.boatCtl.moored = false;
	ok( job && job.here && job.fee === repairFee( 0.3 ) && ! Game.prototype.repairJob.call( g ).here, 'the repair is hers to do with the boat at her dock' );
	g.hull.wear = 0;
	ok( Game.prototype.repairJob.call( g ) === null, 'and there\'s nothing to repair on a sound hull' );

}

// ---- (M13) left in the water through a hurricane she's battered; hauled out, she isn't
{

	ok( stormWear( 7 ) === 0 && stormWear( STORM_FROM ) === 0 && stormWear( 30 ) > 0 && stormWear( 38 ) > stormWear( 30 ), 'a gale\'s wind leaves her be; past it, the harder the more' );
	const since = 3000, passage = ( hauled ) => {

		const h = new Hull( { store: { hull: 0 }, random: () => 0.5 } );
		for ( let t = - 20; t < 30; t += 1 / 60 ) h.step( 1.25, { driven: false, storm: hauled ? 0 : weatherNow( since + 6 + t, 'hurricane', since ).wind, rain: 0 } );
		return h.wear;

	};
	// (a game hour's about 75 s of play by day)
	const left = passage( false ), hauled = passage( true );
	console.log( `     a hurricane over her at the dock wears her ${ Math.round( left * 100 ) }% ($${ repairFee( left ) } to repair); hauled out ($${ HAUL_FEE }), ${ Math.round( hauled * 100 ) }%` );
	ok( left > 0.3 && left < 0.8 && hauled === 0 && repairFee( left ) > HAUL_FEE, 'a hurricane over her at the dock leaves her badly worn (more than the haul-out would have cost); hauled out, sound' );
	const h = new Hull( { store: { hull: 0 }, random: () => 0.5 } );
	h.step( 0.1, { driven: true, fuel: true } );
	h.step( 10, { driven: true, fuel: true, storm: 38 } );
	ok( h.wear === 0, '(at her helm, it\'s the slams that wear her, not this)' );

	// Marta's row: once it's watched for, with the boat at her dock; hauled, she puts her back in after
	const st = new GameState( null );
	st.money = 100;
	const news = hurricaneNews( since, 'hurricane', since );
	const boat = { moored: true, hauled: null, setHauled( c ) { this.hauled = c || null; this.moored = ! c; } };
	const g = { state: st, app: { weather: { news }, boatCtl: boat }, toast() {}, haulJob: Game.prototype.haulJob, cradle: CRADLE };
	const job = Game.prototype.haulJob.call( g );
	ok( job && job.here && job.fee === HAUL_FEE && Game.prototype.haul.call( g ) && st.hauled && st.money === 100 - HAUL_FEE && boat.hauled, 'Marta hauls her out ahead of a hurricane, at her dock, for her fee' );
	ok( Game.prototype.haulJob.call( g ).back === false, 'and she\'s on her cradle until it\'s gone by' );
	g.app.weather.news = null;
	ok( Game.prototype.haulJob.call( g ).back === true, '... then Marta can put her back in' );
	Game.prototype.relaunch.call( g );
	ok( ! st.hauled && ! boat.hauled && boat.moored, 'and she does, at the dock' );
	ok( Game.prototype.haulJob.call( { ...g, state: new GameState( null ) } ) === null, 'no haul-out with no hurricane coming' );
	const t2 = new GameState( null );
	st.hauled = true;
	ok( t2.fromJSON( JSON.parse( JSON.stringify( st.toJSON() ) ) ) && t2.hauled === true, 'hauled out, she\'s saved so' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
