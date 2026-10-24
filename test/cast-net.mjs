// (Salt Life) Plain-node tests of the cast net (no GPU): its gear, the wind-up's moment, throws from
// wading depth, the pier, a boat's deck and onto dry sand (where it lands, how wide it opens), drawing
// it closed and hauling it in, someone else's net thrown as they threw it, the fish trapped under it,
// and the bait it brings in (the bucket, the hook, cut bait).
//   node test/cast-net.mjs
import { readFileSync } from 'node:fs';
import { Vector3, Group, Scene, PerspectiveCamera } from 'three';
import { CastNet, SWEET, WIND_S, openQuality, sweetWindow } from '../src/game/CastNet.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { BAITS, chunksOf, KEEPER_KG } from '../src/game/Bait.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay } from '../src/game/Bites.js';
import { FISH } from '../src/game/FishTable.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { ReefLayout } from '../src/world/reef/ReefLayout.js';
import { FishSchools } from '../src/world/Fish.js';
import { WORLD } from '../src/world/WorldLayout.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const DT = 1 / 60;
const lv = ( castNet ) => gearStats( { ...defaultUpgrades(), castNet } );
const finite = ( net ) => net.P.every( Number.isFinite ) && net.V.every( Number.isFinite );

// ---- the gear
{

	const L = UPGRADES.castNet.levels;
	check( L.length === 4 && L[ 0 ].cost === 0 && L.every( ( l, i ) => ! i || ( l.cost > L[ i - 1 ].cost && l.netM > L[ i - 1 ].netM && l.throwM > L[ i - 1 ].throwM && l.sinkMs > L[ i - 1 ].sinkMs ) ),
		'cast nets: four sizes, each bigger, throwing farther and sinking faster for more money' );
	check( L.every( ( l, i ) => ! i || l.spreadWin < L[ i - 1 ].spreadWin ), 'a bigger net is harder to open fully (a narrower moment)' );
	const W = UPGRADES.baitWell.levels;
	check( W.length === 3 && W.every( ( l, i ) => ! i || l.baitMax > W[ i - 1 ].baitMax ), 'bait wells: bucket, aerated bucket, livewell, each holding more' );

}

// ---- the wind-up's moment
{

	const win = 0.25, [ lo, hi ] = sweetWindow( win );
	check( lo < SWEET && SWEET < hi && Math.abs( hi - lo - win ) < 1e-9, `the moment: ${ lo.toFixed( 2 ) }..${ hi.toFixed( 2 ) } of the wind-up, round ${ SWEET }` );
	check( openQuality( SWEET, win ) === 1 && openQuality( lo, win ) >= 0.89 && openQuality( hi, win ) >= 0.89, 'let go inside it: it spins fully open' );
	check( openQuality( 0.2, win ) < 0.7 && openQuality( 1, win ) < 0.9 && openQuality( 0, win ) >= 0.12, 'too early or late: it opens less (never not at all)' );

}

// a net in a camera's hands: eye m above the water (the floor below at floor), looking down by pitch
function rig( { eye, floor, pitch = - 0.3, level = 1, stand = null } ) {

	const camera = new PerspectiveCamera( 70, 1.6, 0.1, 500 );
	camera.position.set( 0, eye, 0 );
	camera.rotation.set( pitch, 0, 0 );
	camera.updateMatrixWorld();
	const net = new CastNet( { scene: new Scene(), camera } );
	net.setGear( lv( level ) );
	net.equip( true );
	// the player's own floor (a pier, a deck) under the camera; the bottom (or the sand) beyond
	const feet = stand ?? eye - 1.65;
	const env = { groundAt: ( x, z, maxY ) => ( Math.hypot( x, z ) < 0.8 && maxY > feet ? feet : floor ), waterY: 0 };
	const events = [];
	const run = ( s, each ) => {

		for ( let t = 0; t < s; t += DT ) {

			net.update( DT, env );
			const e = net.takeEvents();
			if ( e ) events.push( ...e );
			if ( each && each() ) break;

		}

	};
	return { net, camera, env, events, run };

}

// wind up for `charge` of the full wind-up and let go
function throwAt( r, charge = SWEET ) {

	r.net.startWindup();
	r.run( charge * WIND_S - DT * 0.5 );
	r.net.release();

}

// ---- throws from where the player stands
const cases = [
	{ name: 'wading, waist deep', eye: 0.65, floor: - 1.0, pitch: - 0.12, level: 0 },
	{ name: 'wading with the 10 ft net', eye: 0.65, floor: - 1.0, pitch: - 0.08, level: 3 },
	{ name: 'off the pier', eye: 4.0, floor: - 4.0, pitch: - 0.55, level: 1 },
	{ name: 'off the pier, far, 10 ft net', eye: 4.0, floor: - 4.0, pitch: - 0.32, level: 3 },
	{ name: 'off the boat\'s deck', eye: 2.6, floor: - 7.0, pitch: - 0.35, level: 2 },
];
for ( const c of cases ) {

	const r = rig( c ), net = r.net, R = net.gear.netM;
	r.run( 1 );
	const aim = { ...net.aim };
	check( aim.show && aim.ok && ! aim.land && aim.d >= 1.6 && aim.d <= net.gear.throwM + 1e-6, `${ c.name }: aimed ${ aim.d.toFixed( 1 ) } m out on the water (as far as the net throws: ${ net.gear.throwM } m)` );
	throwAt( r );
	check( net.quality > 0.95, `${ c.name }: let go at the moment, a full spin (q ${ net.quality.toFixed( 2 ) })` );
	check( net.aimReaches, `${ c.name }: the hand line reaches the bottom there` );
	let widest = 0;
	r.run( 12, () => {

		widest = Math.max( widest, net.footprint.r );
		return net.state === 'sinking' && net.footprint.onFloor > 0.8;

	} );
	const fp = net.footprint;
	const off = Math.hypot( fp.x - aim.x, fp.z - aim.z );
	check( r.events.includes( 'throw' ) && r.events.includes( 'splash' ) && fp.wet, `${ c.name }: it splashes down on the water` );
	check( off < Math.max( 0.9, aim.d * 0.18 ), `${ c.name }: where it was aimed (${ off.toFixed( 2 ) } m off)` );
	check( widest > R * 0.8, `${ c.name }: opens to ${ widest.toFixed( 2 ) } m of its ${ R } m` );
	check( fp.onFloor > 0.8 && fp.lead < fp.floor + 0.25, `${ c.name }: the lead line sinks to the bottom (${ ( fp.lead - fp.floor ).toFixed( 2 ) } m above it)` );
	// drawn closed and hauled in (up a pier's or a boat's side too), then lifted, without a jolt
	let fastest = 0, closest = Infinity;
	const watch = () => {

		const P = net.P, V = net.V, e = r.camera.position, up = net.state === 'lifted' || net.state === 'dumping';
		const coming = net.state === 'sinking' || net.state === 'lifted';
		for ( let i = 0; i < P.length; i += 3 ) {

			if ( coming ) fastest = Math.max( fastest, Math.hypot( V[ i ], V[ i + 1 ], V[ i + 2 ] ) );
			if ( up ) closest = Math.min( closest, Math.hypot( P[ i ] - e.x, P[ i + 1 ] - e.y, P[ i + 2 ] - e.z ) );

		}

	};
	net.setPull( true );
	r.run( 40, () => {

		net.setPull( true );
		watch();
		return net.state !== 'sinking';

	} );
	check( r.events.includes( 'pursed' ) && r.events.includes( 'lifted' ) && net.state === 'lifted', `${ c.name }: drawn closed, then hauled up to the hands` );
	net.setPull( false );
	r.run( 5, watch );
	check( r.events.includes( 'dump' ) && net.state === 'held', `${ c.name }: shaken out and loaded again` );
	check( fastest < 10 && closest > 0.25, `${ c.name }: no jolt hauling and lifting it (fastest ${ fastest.toFixed( 1 ) } m/s; ${ closest.toFixed( 2 ) } m from the eye at the closest)` );
	check( finite( net ), `${ c.name }: no NaNs in the cloth` );

}

// ---- wading chest deep: the net's held up out of the water, so the throw still clears it
{

	const chest = rig( { eye: 0.45, floor: - 1.2, pitch: - 0.15, level: 0 } );
	chest.run( 1.5 );
	const above = chest.net.handR.y - chest.env.waterY;
	check( chest.net.lift > 0.25 && above > 0.3, `chest deep: the hands hold it up out of the water (${ chest.net.lift.toFixed( 2 ) } m higher, ${ above.toFixed( 2 ) } m above it)` );
	throwAt( chest );
	let widest = 0;
	chest.run( 8, () => ( widest = Math.max( widest, chest.net.footprint.r ), chest.net.state === 'sinking' && chest.net.footprint.onFloor > 0.8 ) );
	check( chest.events.includes( 'splash' ) && widest > chest.net.gear.netM * 0.8 && finite( chest.net ), `and thrown from there it still opens (${ widest.toFixed( 2 ) } m)` );
	const pier = rig( cases[ 2 ] );
	pier.run( 1 );
	check( pier.net.lift < 1e-3, 'off the pier the hands stay where they hold it' );

}

// ---- a badly timed throw, and one onto the sand
{

	const good = rig( cases[ 2 ] ), bad = rig( cases[ 2 ] );
	good.run( 1 );
	bad.run( 1 );
	throwAt( good );
	throwAt( bad, 0.25 );
	let gw = 0, bw = 0;
	good.run( 4, () => ( gw = Math.max( gw, good.net.footprint.r ), false ) );
	bad.run( 4, () => ( bw = Math.max( bw, bad.net.footprint.r ), false ) );
	check( bad.net.quality < 0.8 && bw < gw * 0.85, `let go too early: it opens less (${ bw.toFixed( 2 ) } m against ${ gw.toFixed( 2 ) } m)` );

	const dry = rig( { eye: 1.85, floor: 0.2, pitch: - 0.35, level: 0, stand: 0.2 } );
	dry.run( 1 );
	check( dry.net.aim.land, 'aimed at dry sand: the ring says so' );
	throwAt( dry );
	dry.run( 4 );
	check( dry.events.includes( 'land' ) && ! dry.events.includes( 'splash' ) && ! dry.net.footprint.wet, 'thrown on the sand: it lands there, nothing under it' );
	let t = 0;
	dry.net.setPull( true );
	dry.run( 30, () => ( dry.net.setPull( true ), t += DT, dry.net.state !== 'sinking' ) );
	dry.net.setPull( false );
	dry.run( 4 );
	check( dry.net.state === 'held' && finite( dry.net ), `and it's drawn back in off the sand (${ t.toFixed( 1 ) } s)` );

	// off the deck over 12 m of water: the hand line's too short for it to reach the bottom open
	const deep = rig( { eye: 2.6, floor: - 12, pitch: - 0.35, level: 2 } );
	deep.run( 1 );
	check( ! deep.net.aimReaches, 'aimed over deep water from the deck: too deep for the hand line, and the prompt says so' );
	throwAt( deep );
	deep.run( 16 );
	check( deep.net.state === 'sinking' && deep.net.footprint.r < deep.net.gear.netM * 0.5 && finite( deep.net ), `thrown anyway: it's drawn in and closes as it sinks (${ deep.net.footprint.r.toFixed( 2 ) } m)` );

}

// ---- a gear change waits until the net's back in the hands
{

	const r = rig( cases[ 0 ] );
	r.run( 1 );
	throwAt( r );
	r.run( 0.5 );
	r.net.setGear( lv( 3 ) );
	check( r.net.R === lv( 0 ).netM && r.net.busy, 'bought a bigger net mid-throw: the one in the air stays as it is' );
	r.run( 6, () => r.net.state === 'sinking' );
	r.net.setPull( true );
	r.run( 40, () => ( r.net.setPull( true ), r.net.state !== 'sinking' ) );
	r.net.setPull( false );
	r.run( 5 );
	check( r.net.state === 'held' && r.net.R === lv( 3 ).netM, 'back in the hands: it\'s the new one' );

}

// ---- someone else's net, thrown as they threw it (Together.js)
{

	const mine = rig( cases[ 2 ] );
	const theirs = new CastNet( { scene: new Scene(), viewer: mine.camera } );
	theirs.setGear( lv( 1 ) );
	theirs.equip( true );
	const env = { frame: mine.camera.matrixWorld, groundAt: mine.env.groundAt, waterY: 0 };
	const step = ( s ) => {

		for ( let t = 0; t < s; t += DT ) {

			mine.net.update( DT, mine.env );
			mine.net.takeEvents();
			theirs.update( DT, env );
			theirs.takeEvents();

		}

	};
	step( 1 );
	check( ! theirs.aim.show, 'their net shows no aiming ring' );
	throwAt( mine );
	theirs.remoteThrow( mine.net.lastThrow );
	theirs.follow( 'held', 0, NaN );
	check( theirs.state === 'throw', 'a late pose of them still holding it doesn\'t take back a net in the air' );
	step( 4 );
	const a = mine.net.footprint, b = theirs.footprint;
	check( theirs.state === 'sinking' && Math.hypot( a.x - b.x, a.z - b.z ) < 0.5 && Math.abs( a.r - b.r ) < 0.4, `theirs lands where yours did (${ Math.hypot( a.x - b.x, a.z - b.z ).toFixed( 2 ) } m apart)` );
	for ( let i = 0; i < 40; i ++ ) theirs.follow( 'sinking', Math.min( 1, i / 20 ), theirs.handLen - 0.05 );
	check( theirs.draw > 0.9 && theirs.hauling, 'drawn closed as their poses say' );
	theirs.follow( 'lifted', 1, 0.6 );
	check( theirs.state === 'lifted', 'up at their hands when theirs is' );
	step( 4 );
	check( theirs.state === 'held' && finite( theirs ), 'shaken out and loaded again' );
	theirs.equip( false );
	check( theirs.meshes.every( ( m ) => ! m.visible ), 'put away: nothing drawn' );

}

// ---- fish under it (Fish.js): the mullet runs and the fry in the shallows, a net thrown over them
{

	const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
	const reef = new ReefLayout( { terrain } ).toData();
	const fish = new FishSchools( { parent: new Group(), terrain, floorAt: ( x, z ) => terrain.heightAt( x, z ), center: new Vector3( WORLD.reef.center.x, 0, WORLD.reef.center.z ), radius: WORLD.reef.radius, anchors: reef.anchors || [], bay: true } );
	const runs = fish.groups.filter( ( g ) => g.sp.name === 'runnerMullet' || g.sp.name === 'runnerFry' );
	check( runs.length > 0 && runs.every( ( g ) => - terrain.heightAt( g.home.x, g.home.z ) < 1.6 ), `bait runs in wading depth (${ runs.length } of them)` );
	let under = 0, held = 0;
	for ( const g of runs.slice( 0, 4 ) ) {

		const cam = new PerspectiveCamera( 70, 1.6, 0.1, 500 );
		const px = g.center.x, pz = g.center.z - 6;
		cam.position.set( px, terrain.heightAt( px, pz ) + 1.65, pz );
		for ( let t = 0; t < 3; t += 1 / 30 ) fish.update( 1 / 30, cam.position );
		cam.lookAt( g.center.x, 0, g.center.z );
		cam.updateMatrixWorld();
		const net = new CastNet( { scene: new Scene(), camera: cam } );
		const gear = lv( 2 );
		net.setGear( gear );
		net.equip( true );
		const env = { groundAt: ( x, z ) => terrain.heightAt( x, z ), waterY: 0 };
		for ( let t = 0; t < 0.5; t += DT ) net.update( DT, env );
		net.startWindup();
		for ( let t = 0; t < SWEET * WIND_S; t += DT ) net.update( DT, env );
		net.release();
		for ( let t = 0; t < 10; t += DT ) {

			net.update( DT, env );
			fish.update( DT, cam.position );
			if ( ( net.takeEvents() || [] ).includes( 'splash' ) ) under += fish.netLand( net.footprint, gear, 0 );
			if ( fish.net ) fish.netStep( net.footprint, DT );
			if ( net.state === 'sinking' && net.footprint.onFloor > 0.7 ) net.setPull( true );
			if ( net.pursed ) break;

		}

		held += fish.netFish().length;
		fish.netEnd();

	}

	check( under > 0 && held > 0 && held <= under, `thrown over the runs: ${ under } under it as it landed, ${ held } still in it drawn closed` );

}

// ---- the haul: the cooler, the bait bucket, what goes back
{

	const mem = new Map();
	const s = new GameState( { getItem: ( k ) => mem.get( k ) ?? null, setItem: ( k, v ) => mem.set( k, v ) } );
	const haul = [
		{ species: 'mullet', kg: 0.9 }, { species: 'mullet', kg: KEEPER_KG - 0.1 },
		{ species: 'silverside', kg: 0.04 }, { species: 'silverside', kg: 0.05 }, { species: 'sergeant', kg: 0.2 },
		{ species: 'parrot', kg: 1.2 }, { species: 'barracuda', kg: 3 }, { species: null, label: 'Blue crab', kg: 0.2 },
	];
	const r = s.addHaul( haul, 9 );
	check( r.cooler.length === 1 && r.cooler[ 0 ].species === 'mullet' && r.cooler[ 0 ].method === 'net', 'a keeper mullet goes in the cooler (netted)' );
	check( r.bait.mullet === 1 && r.bait.silverside === 2 && r.bait.sergeant === 1 && s.baitCount === 4, 'the small mullet and the bait fish go in the bucket' );
	const why = Object.fromEntries( r.back.map( ( b ) => [ b.label, b.why ] ) );
	check( why[ FISH.parrot.name ] === 'protected' && why[ FISH.barracuda.name ] === 'notNet' && why[ 'Blue crab' ] === 'notNet', 'protected fish, fish a net may not take and the rest go back' );
	check( haul.filter( ( f ) => f.kept ).length === 5, 'each fish is marked kept or not' );
	check( s.log.silverside && s.log.silverside.count === 2, 'the netted fish are in the log' );

	// the bucket fills
	const room = s.stats.baitMax - s.baitCount;
	const r2 = s.addHaul( Array.from( { length: room + 3 }, () => ( { species: 'silverside', kg: 0.04 } ) ) );
	check( s.baitCount === s.stats.baitMax && r2.back.filter( ( b ) => b.why === 'bucket' ).length === 3, `the bucket holds ${ s.stats.baitMax }: the rest go back` );

	// the hook, cut bait, letting a kind go
	check( s.takeBait( 'sergeant' ) && ! s.bait.sergeant && ! s.takeBait( 'sergeant' ), 'one off the bucket for the hook (and none left)' );
	s.addHaul( [ { species: 'silverside', kg: 0.04 } ] );
	check( s.baitCount === s.stats.baitMax, 'its place in the bucket taken by another netted' );
	s.returnBait( 'sergeant' );
	check( s.bait.sergeant === 1 && s.baitCount === s.stats.baitMax + 1, 'off the hook as the rod goes away: back in, even into a full bucket' );
	const id = r.cooler[ 0 ].id, n = s.cutBait( id );
	check( n === chunksOf( 0.9 ) && s.bait.cutMullet === n && ! s.inventory.some( ( f ) => f.id === id ), `a mullet from the cooler cut into ${ n } chunks of bait` );
	check( s.baitCount === s.stats.baitMax + 1, 'cut bait keeps in the cooler: it takes no room in the bucket' );
	s.pickBait( 'sergeant' );
	s.dumpBait( 'sergeant' );
	check( ! s.bait.sergeant && s.baitPick === null, 'a kind let go: off the hook pick too' );
	s.pickBait( 'cutMullet' );

	// saved and loaded
	const s2 = new GameState( { getItem: ( k ) => mem.get( k ) ?? null, setItem: () => {} } );
	s2.load();
	check( s2.bait.cutMullet === n && s2.bait.silverside === s.bait.silverside && s2.baitPick === 'cutMullet', 'the bucket and the bait on the hook are saved' );
	const s3 = new GameState( { getItem: () => JSON.stringify( { ...s.toJSON(), bait: { silverside: 3, dragon: 2, grunt: - 1, mullet: 1.5 }, baitPick: 'dragon' } ), setItem: () => {} } );
	s3.load();
	check( JSON.stringify( s3.bait ) === '{"silverside":3}' && s3.baitPick === null, 'a damaged save\'s bait is cleaned up' );

}

// ---- bait on the hook (Bites.js)
{

	let seed = 777;
	const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
	const pier = habitatAt( { depth: 4, reefDist: 150, pierDist: 1 } );
	const share = ( bait, ids ) => {

		let n = 0;
		for ( let i = 0; i < 4000; i ++ ) if ( ids.includes( pickSpecies( pier, 12, rng, bait ) ) ) n ++;
		return n / 4000;

	};
	const big = [ 'jack', 'barracuda', 'redSnapper', 'muttonSnapper', 'blackGrouper' ].filter( ( k ) => FISH[ k ] );
	const shrimp = share( null, big ), live = share( 'mullet', big );
	check( live > shrimp * 1.4, `a live mullet brings the predators in (${ ( live * 100 ).toFixed( 0 ) }% of bites against ${ ( shrimp * 100 ).toFixed( 0 ) }% on shrimp)` );
	check( biteDelay( pier, 12, () => 0.5, 'silverside' ) < biteDelay( pier, 12, () => 0.5, null ), 'live bait bites sooner' );
	const avg = ( bait ) => {

		let s = 0;
		for ( let i = 0; i < 4000; i ++ ) s += rollWeight( 'jack', rng, bait );
		return s / 4000;

	};
	check( avg( 'mullet' ) > avg( null ) * 1.1, `and bigger fish (a jack: ${ avg( 'mullet' ).toFixed( 2 ) } kg against ${ avg( null ).toFixed( 2 ) } kg)` );
	check( Object.values( BAITS ).every( ( b ) => b.speed < 1 && b.steal > 0 && b.steal < 0.2 ), 'every bait bites sooner than shrimp, and can be stolen' );

}

console.log( failed ? `\n${ failed } failed` : '\nall passed' );
process.exit( failed ? 1 : 0 );
