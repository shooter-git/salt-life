// (M16) Pearl's day, and help on the water, under Node: the pirogue's day from the clock (game/PearlsDay.js), the same for
// everyone, out before dawn and back by noon, in deep enough water all the way, clear of the jetty; not out in bad weather,
// hauled up the beach before a hurricane; her model (world/village/Pirogue.js) and what she costs; afloat on the sea's
// heights; colliders where she lies; the camp's lights by the hour, off in daylight, on at dusk, out late; a light that's
// out costing nothing; the camp's tin in a hurricane the village's own way; Pearl's tow on the north side; Marta's can.
//
//   node test/north-pearl.mjs

import { readFileSync } from 'node:fs';
import * as THREE from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Colliders } from '../src/world/Colliders.js';
import { Village } from '../src/world/Village.js';
import { FishCamp, CAMP } from '../src/game/FishCamp.js';
import { BOAT, LAMPS, boatAt, hauledAt, lightsAt, lightsOn, paceIn, planOf, wayIn, wayOut } from '../src/game/PearlsDay.js';
import { PearlsBoat } from '../src/game/PearlsBoat.js';
import { PIROGUE, buildPirogue, halfAt, keelAt, sheerAt, tiltMotor } from '../src/world/village/Pirogue.js';
import { LocalLights } from '../src/materials/LocalLights.js';
import { G } from '../src/core/Globals.js';
import { damageAt, pieceState, WHOLE, GONE, TARP, NEW } from '../src/game/StormDamage.js';
import { ROOF_HOLES } from '../src/world/village/VillageMaterials.js';
import { hurricaneNews, islandTime, lastHurricane } from '../src/game/Weather.js';
import { CAN, CAN_PAYS, NO_PEARL, PEARL_TOW, canFee, canJob, deliverCan, fuelOf, northSide, pearlCall, pearlFee, pearlJob, towToPearl } from '../src/game/Help.js';
import { FUEL_PRICE, TOW, towFee, towTime } from '../src/game/Gear.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const terrains = [ 'island-1024.bin', 'island.bin' ].map( ( f ) => [ f, new TerrainData( 7, decodeIsland( read( f ) ) ) ] );

// ---- her day
{

	let out = 0, days = 0, sameAll = true, dawn = true, noon = true, rest = 0;
	for ( let day = 1; day <= 400; day ++ ) {

		const p = planOf( day, 'fair' );
		days ++;
		if ( p.stays ) {

			rest ++;
			continue;

		}

		out ++;
		if ( p.leave < BOAT.leave[ 0 ] || p.leave > BOAT.leave[ 1 ] ) dawn = false;
		if ( p.back < BOAT.back[ 0 ] || p.back > BOAT.back[ 1 ] ) noon = false;
		// (the same from the day alone, however you ask)
		const a = boatAt( 9, day, 'fair' ), b = boatAt( 9, day, 'fair' );
		if ( a.kind !== b.kind || a.x !== b.x || a.z !== b.z ) sameAll = false;

	}

	check( out > 0.8 * days && rest > 0, `in fair weather she goes out ${ out } days of ${ days }, one in ${ BOAT.restEvery } her rest day` );
	check( dawn && noon, `out from 4:00, back by noon, as the FAO has Grenada's trolling pirogues (${ BOAT.leave.join( ' to ' ) }, back ${ BOAT.back.join( ' to ' ) })` );
	check( sameAll, 'the same for everyone: from the day alone' );
	const day = [ 1, 2, 3, 4, 5, 6, 8 ].find( ( d ) => ! planOf( d, 'fair' ).stays ), p = planOf( day, 'fair' );
	const seq = [];
	for ( let h = 0; h < 24; h += 0.02 ) {

		const k = boatAt( h, day, 'fair' ).kind;
		if ( seq[ seq.length - 1 ] !== k ) seq.push( k );

	}

	check( seq.join() === 'alongside,going,away,coming,alongside', `her day in order: ${ seq.join( ', ' ) }` );
	check( boatAt( p.back + 0.01, day, 'fair' ).kind === 'alongside' && boatAt( p.leave - 0.01, day, 'fair' ).kind === 'alongside', 'alongside before she goes and once she\'s back' );
	const going = boatAt( p.leave + 0.6, day, 'fair' );
	check( going.kind === 'going' || going.kind === 'away', 'gone from the jetty before dawn' );
	// (the last of her coming in: dead slow, at the berth, her bow to the sea)
	const last = boatAt( p.back - 0.0008, day, 'fair' );
	check( last.kind === 'coming' && Math.hypot( last.x - BOAT.berth.x, last.z - BOAT.berth.z ) < 1 && last.speed < 1 && Math.abs( Math.cos( last.heading ) + 1 ) < 0.05, `the last of her coming in: at the berth, ${ last.speed.toFixed( 1 ) } m/s, head to sea` );

	// the way she goes, on both islands: water under her all along, past the jetty
	const J = CAMP.jetty, half = PIROGUE.beam / 2 + 0.1;
	for ( const [ f, T ] of terrains ) for ( const [ name, way ] of [ [ 'in', wayIn() ], [ 'out', wayOut() ] ] ) {

		let shallow = Infinity;
		for ( let i = 1; i < way.length; i ++ ) {

			for ( let k = 0; k < 8; k ++ ) {

				const q = k / 8, x = way[ i - 1 ].x + ( way[ i ].x - way[ i - 1 ].x ) * q, z = way[ i - 1 ].z + ( way[ i ].z - way[ i - 1 ].z ) * q;
				shallow = Math.min( shallow, - T.heightAt( x, z ) );

			}

		}

		check( shallow > 0.7, `${ f }: her way ${ name }: never less than ${ shallow.toFixed( 1 ) } m of water under her (she draws ${ PIROGUE.draft + 0.15 } m)` );
		const through = way.some( ( q ) => q.x + half > J.x - J.width / 2 && q.x - half < J.x + J.headWidth && q.z < J.z0 && q.z > J.z1 - 0.2 );
		check( ! through, `${ f }: her way ${ name } doesn't go through the jetty` );

	}

	check( wayIn().at( - 1 ).t > 90 && paceIn( 1000 ) > 10 && paceIn( 1000 ) < 12, `on the plane at ${ ( paceIn( 1000 ) * 1.944 ).toFixed( 0 ) } knots, a ${ Math.round( wayIn().at( - 1 ).t ) } s run in from ${ Math.round( wayIn().at( - 1 ).s ) } m out` );

}

// ---- not in bad weather; up the beach before a hurricane
{

	check( planOf( 12, 'gale' ).stays && planOf( 12, 'blustery' ).stays && planOf( 12, 'gale' ).why === 'weather', 'not out in a blow' );
	check( boatAt( 9, 12, 'gale' ).kind === 'hauled', 'up the beach in a gale' );
	check( boatAt( 9, 12, 'blustery' ).kind === 'alongside', 'alongside in a blustery day' );
	const since = islandTime( 30, 8 ), news = hurricaneNews( since, 'hurricane', since );
	check( !! news, 'a picked hurricane is news' );
	check( hauledAt( news.onset - 1, 'hurricane', since ) && hauledAt( news.ends + 1, 'hurricane', since ), `hauled before its winds (they come at ${ news.onset.toFixed( 0 ) }) and till after they've gone` );
	check( ! hauledAt( news.ends + BOAT.after + 1, 'hurricane', since ), `back in the water ${ BOAT.after } h after` );
	const H = BOAT.haul;
	for ( const [ f, T ] of terrains ) {

		const g = T.heightAt( H.x, H.z );
		check( g > 1.4, `${ f }: hauled well up the sand (${ g.toFixed( 1 ) } m up)` );

	}

}

// ---- the boat herself
{

	const lite = buildPirogue( { lite: true } ), full = buildPirogue();
	const tris = ( P ) => P.all / 3, bytes = ( P ) => Object.values( P.geometry.attributes ).reduce( ( a, b ) => a + b.array.byteLength, 0 ) + P.geometry.index.array.byteLength;
	check( tris( lite ) < 3000 && tris( full ) < 6000, `${ tris( lite ) } triangles on low, ${ tris( full ) } on high` );
	check( bytes( lite ) < 300e3, `her geometry ${ Math.round( bytes( lite ) / 1024 ) } KB on low` );
	check( PIROGUE.length === 7.3 && PIROGUE.beam === 1.9 && PIROGUE.depth <= 0.72, 'Grenada\'s fishing pirogue\'s size: 7.3 by 1.9 m, 0.7 m deep' );
	const box = lite.geometry.boundingBox;
	check( box.max.z - box.min.z > 7.4 && box.max.x - box.min.x < 3.4, 'long and narrow: motor, lines and all' );
	check( sheerAt( 1 ) > sheerAt( 0 ) * 1.8 && sheerAt( 0.45 ) < 0.72 && keelAt( 0.5 ) === 0 && keelAt( 1 ) > 1.2 && Math.abs( halfAt( 0.42 ) - PIROGUE.beam / 2 ) < 1e-6 && Math.abs( halfAt( 1 ) ) < 1e-6, 'a low run aft, a high sharp bow, her beam a little aft of amidships' );
	// (both sides differ: no mirror image)
	const P = lite.geometry.attributes.position.array, T = lite.geometry.attributes.tint.array, n = P.length / 3;
	let port = 0, star = 0, colours = new Set();
	for ( let i = 0; i < n; i ++ ) {

		if ( P[ i * 3 ] > 0 ) star += P[ i * 3 ];
		else port -= P[ i * 3 ];
		colours.add( [ T[ i * 3 ], T[ i * 3 + 1 ], T[ i * 3 + 2 ] ].map( ( c ) => c.toFixed( 2 ) ).join() );

	}

	check( Math.abs( port - star ) > 0.5 && colours.size > 10, `painted, ${ colours.size } colours, each side its own` );
	check( lite.drawn < lite.all, 'her lines to the jetty kept apart, drawn only when she\'s made fast' );
	// the outboard's foot out of the water when tilted, and back again the same
	const rest = lite.geometry.attributes.position.array.slice();
	let lowest = Infinity;
	tiltMotor( lite, 1.3 );
	// (its leg and foot: what's below the pan at rest)
	for ( let i = 0; i < lite.motor.count; i ++ ) if ( lite.motor.rest.p[ i * 3 + 1 ] < 0.5 ) lowest = Math.min( lowest, lite.geometry.attributes.position.array[ ( lite.motor.start + i ) * 3 + 1 ] );
	check( lowest > PIROGUE.draft, `her outboard tilted clear of the water (its foot ${ ( lowest - PIROGUE.draft ).toFixed( 2 ) } m over it)` );
	tiltMotor( lite, 0 );
	let moved = 0;
	for ( let i = 0; i < rest.length; i ++ ) moved = Math.max( moved, Math.abs( rest[ i ] - lite.geometry.attributes.position.array[ i ] ) );
	check( moved < 1e-5, 'and back down as it was' );

}

// ---- built with the camp: afloat, colliders, a turned-off light, her roofs
{

	const [ , terrain ] = terrains[ 0 ], colliders = new Colliders(), scene = new THREE.Scene();
	const village = new Village( { scene: new THREE.Scene(), terrain, colliders, tier: 'low' } );
	village.textures.bake = async () => {};
	await village.init( null );
	const holes0 = village.roofHoles.length, ids0 = village.roofHoles.map( ( h ) => h.seed ).join();
	const lights = new LocalLights( { max: 4 } ), flyers = [];
	let height = 0;
	const query = { heightAt: () => height };
	const app = { settings: { day: 3, timeOfDay: 14, weatherSince: 0 }, weatherPick: () => 'fair', localLights: lights, query, flyingSheets: { add: ( l ) => flyers.push( ...l ) }, boatCtl: null, camera: new THREE.PerspectiveCamera(), sky: { visibility: 1 }, renderer: null };
	app.camera.position.set( 110, 3, - 860 );
	const camp = new FishCamp( { scene, terrain, colliders, village, app } );
	check( ! camp.boat, 'nothing of it before you\'re near' );
	camp.update( { position: { x: 110, z: - 900 } } );
	check( !! camp.boat && !! camp.lights, 'built with the camp' );
	check( camp.triangles > 5000, `(the camp's ${ Math.round( camp.triangles / 1000 ) }k triangles)` );

	// the tin: two more holes on the shader's list, the village's as they were, its own fates by its own ids
	const added = village.roofHoles.slice( holes0 );
	check( added.length === 2 && village.roofHoles.length <= ROOF_HOLES && village.roofHoles.slice( 0, holes0 ).map( ( h ) => h.seed ).join() === ids0, `the shed's and the lean-to's tin in the roof material's list (${ village.roofHoles.length } of ${ ROOF_HOLES }), the village's unmoved` );
	check( added.every( ( h ) => h.id >= 900 ) && flyers.length >= 2 && flyers.every( ( f ) => f.kind === 'tin' && f.id >= 900 ), `their ${ flyers.length } sheets to fly as the village's` );
	const U = village.materials.roofMetal.userData.vlm.uniforms;
	check( added.every( ( h, i ) => U.vlmHoles.value[ holes0 + i ].x === h.seed ), 'and on the roof shader' );
	// (a Category 1, here, and how each sheet goes: from its threshold, tarped, mended)
	let gone = 0, tarp = 0, mended = 0, storms = 0;
	for ( let since = islandTime( 30, 0 ); since < islandTime( 330, 0 ); since += 24 * 20 ) {

		const h = lastHurricane( since + 300, 400, 'hurricane', since );
		if ( ! h ) continue;
		storms ++;
		const st = {};
		for ( const k of [ 900, 901 ] ) {

			const at = ( T ) => pieceState( damageAt( T, 'hurricane', since ), 'tin', k, st ).state;
			if ( at( h.ends + 2 ) === GONE ) gone ++;
			if ( at( h.ends + 45 ) === TARP ) tarp ++;
			if ( at( h.ends + 160 ) === NEW ) mended ++;
			if ( at( h.onset - 30 ) !== WHOLE ) gone -= 100;

		}

	}

	check( storms > 5 && gone > 0 && tarp > 0 && mended > 0, `over ${ storms } hurricanes its roofs lost ${ gone } runs of sheets of ${ storms * 2 }, tarped by the second day ${ tarp }, new tin within a week ${ mended }` );
	const S = U.vlmHoleS.value;
	const hS = lastHurricane( islandTime( 30, 8 ) + 300, 400, 'hurricane', islandTime( 30, 8 ) );
	village.setDamage( damageAt( hS.ends + 1, 'hurricane', islandTime( 30, 8 ) ) );
	const st = {};
	check( added.every( ( h, i ) => Math.floor( S[ holes0 + i ] ) === pieceState( damageAt( hS.ends + 1, 'hurricane', islandTime( 30, 8 ) ), 'tin', h.id, st ).state ), 'village.setDamage sets their state with the others\'' );
	village.setDamage( damageAt( islandTime( 3, 12 ), 'fair', 0 ) );

	// afloat: she rides the sea's height, alongside and under way, colliders only where she lies
	const b = camp.boat;
	const hour = 14, day = 3;
	app.settings.timeOfDay = hour;
	height = 0.4;
	G.seaLevel.value = 0;
	for ( let i = 0; i < 60; i ++ ) b.update( 0.05, app.camera, hour, day, 'fair', 0, null, false );
	check( Math.abs( b.mesh.position.y - ( 0.4 - PIROGUE.draft ) ) < 0.02 && b.mesh.visible && b.kind === 'alongside', `alongside she floats on the water (keel ${ b.mesh.position.y.toFixed( 2 ) } with the water at 0.40)` );
	check( b.berthBox.solid && ! b.haulBox.solid, 'solid where she lies: you can\'t sail through her at the jetty' );
	const seg = ( x0, z0, x1, z1 ) => colliders.resolveCapsule( new THREE.Vector3( x0 + ( x1 - x0 ) * 0.5, - 0.4, z0 + ( z1 - z0 ) * 0.5 ), 0.25, 1.6, 0 );
	check( seg( BOAT.berth.x, BOAT.berth.z, BOAT.berth.x, BOAT.berth.z ), 'a hull at her berth is pushed out of her' );
	check( b.pirogue.geometry.drawRange.count === b.pirogue.all, 'her lines out to the cleats' );
	check( Math.abs( b.tilt - 1.3 ) < 1e-6, 'her outboard tilted up' );
	const P = planOf( day, 'fair' );
	const away = boatAt( P.leave + 0.5, day, 'fair' );
	b.update( 0.05, app.camera, P.leave + 0.5, day, 'fair', 0, null, false );
	check( ! b.berthBox.solid && away.kind !== 'alongside', 'gone, and nothing there to hit' );
	const s0 = boatAt( P.back - 0.4, day, 'fair' );
	check( s0.kind === 'coming' || s0.kind === 'alongside', `coming in: ${ s0.kind }` );
	b.update( 0.05, app.camera, P.back - 0.4, day, 'fair', 0, null, false );
	check( b.pirogue.geometry.drawRange.count === b.pirogue.drawn, 'under way, no lines' );
	// your boat in her berth: she lies off, with nothing solid to shove you, till you've gone
	const yours = new THREE.Vector3( BOAT.berth.x, 0, BOAT.berth.z );
	b.kind = 'alongside';
	for ( let i = 0; i < 400; i ++ ) b.update( 0.1, app.camera, 14, day, 'fair', 0, yours, false );
	check( b.kind === 'off' && ! b.berthBox.solid && Math.hypot( b.mesh.position.x - BOAT.off.x, b.mesh.position.z - BOAT.off.z ) < 25, 'your boat in her berth: she lies off, nothing solid there' );
	for ( let i = 0; i < 1200; i ++ ) b.update( 0.1, app.camera, 14, day, 'fair', 0, null, false );
	check( b.kind === 'alongside' && b.berthBox.solid, 'and comes in once you\'ve gone' );
	// hauled: not while you're watching; and then on the sand, solid there
	app.camera.position.set( BOAT.berth.x, 3, BOAT.berth.z + 40 );
	app.camera.lookAt( BOAT.berth.x, 0, BOAT.berth.z );
	app.camera.updateMatrixWorld();
	b.update( 0.05, app.camera, 9, 12, 'gale', 0, null, false );
	check( b.kind === 'alongside', 'she isn\'t hauled up the beach before your eyes' );
	app.camera.position.set( 0, 3, - 100 );
	b.update( 0.05, app.camera, 9, 12, 'gale', 0, null, false );
	check( b.kind === 'hauled' && b.haulBox.solid && ! b.berthBox.solid && b.mesh.position.y > 1.4, `on the sand once you've gone (${ b.mesh.position.y.toFixed( 2 ) } m up)` );
	check( b.tilt > 0.5, 'her outboard up, not dug in' );
	b.update( 0.05, app.camera, 14, 12, 'fair', 0, null, false );
	check( b.kind === 'alongside', 'and back in the water after' );

	// the lights: from dusk till late, on the shared block, costing nothing when they're out
	const at = ( h, id, d = 5 ) => lightsAt( h, d, 'fair' ).find( ( l ) => l.id === id ).on;
	check( [ 7, 10, 12, 15, 17.5 ].every( ( h ) => ! lightsOn( h, 5, 'fair' ) ), 'off in daylight' );
	check( at( 19, 'lantern' ) === 1 && at( 19, 'window' ) === 1, 'lit at dusk' );
	check( at( 23.5, 'lantern' ) === 0 && at( 1, 'window' ) === 0, 'out late' );
	const nights = [ ...Array( 200 ) ].map( ( _, d ) => at( 19.5, 'fire', d + 1 ) > 0 ).filter( Boolean ).length;
	check( nights > 40 && nights < 110, `the fire pit lit some nights (${ nights } of 200), never in the rain or a gale` );
	const rainy = [ ...Array( 40 ) ].some( ( _, d ) => lightsAt( 19.5, d + 1, 'rain' )[ 2 ].on > 0 ) || [ ...Array( 40 ) ].some( ( _, d ) => lightsAt( 19.5, d + 1, 'gale' ).some( ( l ) => l.on > 0 ) );
	check( ! rainy, 'nothing lit out in a gale, no fire in the rain' );
	const goesDay = [ 1, 2, 3, 4, 5, 6, 8 ].find( ( d ) => ! planOf( d, 'fair' ).stays );
	check( at( 4.5, 'lantern', goesDay ) === 1, 'the lantern lit before dawn for the crew, on a day she goes' );
	const restDay = BOAT.restEvery * 3;
	check( planOf( restDay, 'fair' ).stays && at( 4.5, 'lantern', restDay ) === 0, 'not on a day she doesn\'t' );
	// (where they are: the turtles read these)
	const glow = camp.lights.glarePos;
	check( LAMPS.find( ( l ) => l.id === 'lantern' ).x === glow.x && Math.abs( LAMPS.find( ( l ) => l.id === 'lantern' ).z - glow.z ) < 0.01, 'where they are, as the camp\'s built them, for the turtles to read' );
	check( camp.lightsOn( 19, 5 ) === true && camp.lightsOn( 12, 5 ) === false && camp.lightsAt( 19, 5 ).every( ( l ) => Number.isFinite( l.x ) && Number.isFinite( l.z ) && 'on' in l ), 'camp.lightsOn( hour, day ), camp.lightsAt( hour, day )' );
	check( lights.sources.filter( ( s ) => /^camp/.test( s.kind ) ).length === 3, 'three sources on the shared block, no new lights' );
	const srcs = lights.sources.filter( ( s ) => /^camp/.test( s.kind ) );
	const cam = new THREE.PerspectiveCamera();
	cam.position.set( 100, 3, - 840 );
	cam.updateMatrixWorld();
	let touched = 0;
	for ( const s of srcs ) s.update = () => touched ++;
	const was = G.night.value;
	G.night.value = 1;
	camp.lights.update( 0.05, cam, 12, 5, 'fair', 0, 1, 720, false );
	lights.update( cam, 0.05 );
	check( srcs.every( ( s ) => s.scale === 0 ) && touched === 0 && lights.active === 0, 'a light that\'s out costs nothing: passed over before anything\'s reckoned for it, no slot taken' );
	check( ! camp.lights.mesh.visible, 'and nothing of them drawn' );
	camp.lights.update( 0.05, cam, 19, 5, 'fair', 0, 1, 720, false );
	for ( const s of srcs ) delete s.update;
	lights.update( cam, 0.05 );
	check( lights.active >= 2 && camp.lights.mesh.visible && camp.lights.geometry.drawRange.count > 0, `at night: ${ lights.active } of the block's slots lit, its one mesh drawn` );
	G.night.value = was;

}

// ---- the sums: Pearl's tow, Marta's can
{

	check( towFee( 3000 ) > pearlFee( 3000 ) && pearlFee( 0 ) === PEARL_TOW.base, `Pearl's rate's her own: 3 km off $${ pearlFee( 3000 ) }, Marta's $${ towFee( 3000 ) }` );
	const J = CAMP.jetty;
	check( northSide( J.x, J.z1 - 500 ) && ! northSide( 60, 100 ) && northSide( 60, 100, 0.9 ), 'the north side: nearer her jetty than Marta\'s dock, or the windward measure' );
	// the can: more than the fuel, always; cheaper than the tow only past a certain distance
	const fuelOnly = CAN.litres * FUEL_PRICE;
	check( CAN.litres === 19 && canFee( 0 ) > fuelOnly && canFee( 500 ) > fuelOnly, `5 gallons: $${ fuelOnly.toFixed( 2 ) } of diesel, at least $${ canFee( 0 ) } for her to bring it` );
	check( canFee( 500 ) > towFee( 500 ) && canFee( 1000 ) > towFee( 1000 ), `in the bay a tow's cheaper: 1 km off, can $${ canFee( 1000 ) }, tow $${ towFee( 1000 ) }` );
	check( canFee( 9700 ) < towFee( 9700 ) && canFee( 24000 ) < towFee( 24000 ) * 0.6, `from far out the can is: at the bank $${ canFee( 9700 ) } against $${ towFee( 9700 ) }` );
	check( CAN_PAYS > 1500 && CAN_PAYS < 2500 && Math.abs( canFee( CAN_PAYS ) - towFee( CAN_PAYS ) ) < 1.5, `they cross ${ ( CAN_PAYS / 1000 ).toFixed( 1 ) } km off` );
	// (half the boat hours: out and back at speed against out at speed and back in tow)
	check( Math.abs( 2 / TOW.out / ( towTime( 1 ) ) - 0.5 ) < 1e-6 && CAN.per100m === TOW.per100m / 2, 'the can at her tow\'s rate by the hour: half the boat\'s time' );
	check( fuelOf( 'kayak' ) === null && fuelOf( 'console' ) === 'gasoline' && fuelOf( 'lobster' ) === 'diesel' && fuelOf( 'sportfisher' ) === 'diesel', 'each boat what she burns: a kayak none, the console gasoline' );

}

// ---- on a stand-in for the game: the radio's calls
{

	const money = { v: 1000 };
	const state = {
		boat: 'lobster', stats: { fuelL: 40 }, fuel: 0, get fuelL() { return this.fuel === null ? this.stats.fuelL : this.fuel; }, saved: 0, emit() {}, save() { this.saved ++; },
		get money() { return money.v; }, set money( v ) { money.v = v; },
		payTow( fee ) { const p = Math.min( fee, money.v ); money.v -= p; return p; },
	};
	const pos = new THREE.Vector3( 300, 0, - 1800 ), toast = [];
	const b = {
		position: pos, quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), angular: new THREE.Vector3(), hauled: null, moored: false, anchor: null, driven: true,
		outline: [ { x: 1.4, z: 4 } ], toWorld() {},
	};
	const player = { mode: 'boat', boat: b, leaveHelm() { player.mode = 'deck'; b.driven = false; }, deckToWorld() { player.placed = true; } };
	const app = { boatCtl: b, player, settings: { day: 3, timeOfDay: 10, weatherSince: 0 }, weather: { news: null }, weatherPick: () => 'fair', terrainData: terrains[ 0 ][ 1 ] };
	const game = { app, state, weatherNow: { wind: 7 }, time: null, windwardAt: () => 0.9, toast: ( t ) => toast.push( t ), towJob: () => ( { metres: 1000, fee: towFee( 1000 ), time: towTime( 1000 ) } ), _fuelOut: true };

	// the can
	const job0 = canJob( game );
	check( job0.litres === 19 && job0.fuel === 'diesel', 'a can of diesel for the lobster boat' );
	const before = money.v, paid = deliverCan( game );
	check( paid === job0.fee && money.v === before - paid && state.fuel === 19 && ! game._fuelOut && state.saved > 0, `she brings it: 19 L in the tank, $${ paid } paid, saved` );
	check( pos.x === 300 && pos.z === - 1800, 'and you\'re where you were' );
	check( /19 L of diesel/.test( toast.at( - 1 ) ) && new RegExp( `\\$${ paid }` ).test( toast.at( - 1 ) ), `a line, and the sum: "${ toast.at( - 1 ) }"` );
	state.fuel = 0;
	money.v = 30;
	const short = deliverCan( game );
	check( short === 30 && money.v === 0 && state.fuel === 19 && /the \$30 you had/.test( toast.at( - 1 ) ), 'short of it, she takes what you have, as her tow does' );
	state.fuel = 30;
	money.v = 1000;
	check( canJob( game ).litres === 10, 'no more than the tank has room for' );
	state.fuel = 40;
	check( canJob( game ) === null, 'none for a full tank' );
	state.boat = 'kayak';
	state.fuel = 0;
	check( canJob( game ) === null, 'none for a kayak' );
	state.boat = 'console';
	check( canJob( game ).fuel === 'gasoline', 'gasoline for the console' );
	state.boat = 'lobster';

	// Pearl
	state.fuel = 0;
	const j = pearlJob( game );
	check( j && j.open && ! j.here && j.fee === pearlFee( j.metres ), `on the north side she answers: $${ j.fee }, ${ Math.round( j.metres ) } m off her jetty` );
	let c = pearlCall( game );
	check( c.can && /jetty/.test( c.say ) && new RegExp( `\\$${ j.fee }` ).test( c.say ) && c.who === 'pearl', `"${ c.say }"` );
	app.settings.timeOfDay = 19;
	check( ! pearlJob( game ).open, 'shut after her hours' );
	app.settings.timeOfDay = 10;
	game.weatherNow = { wind: NO_PEARL + 0.5 };
	check( ! pearlCall( game ).can, `not in a blow: "${ pearlCall( game ).say }"` );
	game.weatherNow = { wind: 7 };
	app.weather.news = { stage: 'warning' };
	check( ! pearlCall( game ).can && /hurricane/.test( pearlCall( game ).say ), 'nor with a hurricane warned of' );
	app.weather.news = null;
	const far = { ...game, windwardAt: () => 0 };
	const here = pos.clone();
	pos.set( 60, 0, 100 );
	check( pearlJob( far ) === null, 'not from the bay\'s side of the island' );
	pos.copy( here );
	money.v = 50;
	const paidP = towToPearl( game );
	const J = CAMP.jetty;
	check( paidP === 50 && Math.abs( pos.z - ( J.z1 + 3 ) ) < 0.01 && pos.x > J.x + J.headWidth - J.width / 2 && pos.x < J.x + 6, `she brings you to her jetty, not the bay (lying ${ ( pos.x - ( J.x + J.headWidth - J.width / 2 ) ).toFixed( 1 ) } m off its east face), for all you had` );
	check( player.mode === 'deck' && player.placed && b.anchor && ! b.moored && b.velocity.length() === 0, 'you on deck, she on the camp\'s mooring (an anchor, so your save and Marta know where she is)' );
	check( /towed her in/.test( toast.at( - 1 ) ), `"${ toast.at( - 1 ) }"` );

}

// ---- the radio's panel with them on it
{

	const el = () => {

		const s = new Set();
		return { className: '', innerHTML: '', textContent: '', append() {}, querySelector: () => null, querySelectorAll: () => [], classList: { add: ( c ) => s.add( c ), remove: ( c ) => s.delete( c ), toggle: ( c, on ) => on ? s.add( c ) : s.delete( c ), contains: ( c ) => s.has( c ) } };

	};

	globalThis.document = { createElement: el, head: { append() {} }, pointerLockElement: null };
	const { Radio } = await import( '../src/game/Radio.js' );
	const player = { mode: 'boat', riding: false, helmHeld: false }, pos = new THREE.Vector3( 300, 0, - 1800 );
	const b = { position: pos, quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), angular: new THREE.Vector3(), hauled: null, moored: false, anchor: null, outline: [ { x: 1.4, z: 4 } ] };
	player.boat = b;
	player.leaveHelm = () => { player.mode = 'deck'; };
	player.deckToWorld = () => {};
	const app = { player, boatCtl: b, audio: { muted: false, volume: 0.8 }, settings: { day: 3, timeOfDay: 10, weatherSince: 0 }, weather: { news: null }, input: { lastDevice: 'keyboard' }, weatherPick: () => 'fair', terrainData: terrains[ 0 ][ 1 ] };
	const state = { boat: 'lobster', stats: { fuelL: 40 }, fuel: 0, get fuelL() { return this.fuel; }, money: 2000, payTow( f ) { const p = Math.min( f, this.money ); this.money -= p; return p; }, save() {}, emit() {} };
	let towed = 0;
	const game = { app, state, weatherNow: { wind: 7 }, hud: null, makingRoom: false, windwardAt: () => 0.9, toast() {}, towJob: () => ( { metres: 9700, fee: towFee( 9700 ), time: towTime( 9700 ) } ), tow: () => { towed ++; } };
	const r = new Radio( { root: el(), hud: el() }, game );
	const keys = ( ...down ) => ( { hit: ( k ) => down.includes( k ), lastDevice: 'keyboard' } );
	r.update( 0.1, keys( 'KeyR' ), false );
	check( r.open && r.pick === 2 && /Pearl, channel 16/.test( r.panel.innerHTML ), 'dry on the north side the panel opens on Pearl' );
	r.update( 0.1, keys( 'ArrowLeft' ), false );
	check( r.pick === 1, 'Marta\'s row a step away' );
	r.update( 0.1, keys( 'Enter' ), false );
	check( r.call && r.call.can && r.call.drop && /can/.test( r.call.say ) && /Bring a can/.test( r.panel.innerHTML ), `Marta offers both: "${ r.call && r.call.say }"` );
	r.update( 0.1, keys( 'ArrowRight' ), false );
	check( r.pick === 1, 'the can a step from the tow' );
	r.update( 0.1, keys( 'Enter' ), false );
	check( ! r.open && state.fuel === 19 && towed === 0, 'take it, and the can\'s in the tank, no tow' );
	state.fuel = 0;
	r.show();
	r.step( 1 );
	r.pick = 2;
	r.act();
	check( r.call && r.call.who === 'pearl' && /To her jetty/.test( r.panel.innerHTML ), 'Pearl answers on her row' );
	r.hangUp();
	check( ! r.call && r.pick === 2, 'and hanging up you\'re back on it' );
	r.pick = 2;
	r.act();
	r.pick = 0;
	r.act();
	check( ! r.open && towed === 0 && Math.abs( pos.z - ( CAMP.jetty.z1 + 3 ) ) < 0.01, 'her tow goes to her jetty, not Marta\'s' );
	app.settings.timeOfDay = 19;
	pos.set( 300, 0, - 1800 );
	player.mode = 'boat';
	r.show();
	check( r.pick === 1 && /No answer/.test( r.panel.innerHTML ), 'out of her hours: no answer, and it\'s Marta' );
	r.close();
	state.boat = 'kayak';
	app.settings.timeOfDay = 10;
	r.show();
	r.callMarta();
	check( r.call.can && ! r.call.drop && ! /Bring a can/.test( r.panel.innerHTML ), 'in a kayak, no can' );
	r.close();

}

console.log( failed ? `\n${ failed } failed` : '\nall passed' );
process.exit( failed ? 1 : 0 );
