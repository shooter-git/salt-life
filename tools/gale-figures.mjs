#!/usr/bin/env node
// (M16) What a gale does to each boat, on her own model in the CPU's sea (test/hull.mjs' drive and test/north-sea.mjs' aboard,
// for all of them): worn a minute head to it flat out and at a third of her throttle, and over four minutes what's come
// aboard and what's in her bilge. Run it again when Hull.HULLS' slam or sea figures change.
//   node tools/gale-figures.mjs [ boat ]
import { readFileSync } from 'node:fs';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Waves } from '../src/ocean/Waves.js';
import { Whitecaps } from '../src/ocean/Whitecaps.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { BoatController } from '../src/player/BoatController.js';
import { BoatSpray } from '../src/player/BoatSpray.js';
import { weatherAt, SOUTHERLY, seaSwell, seaTurn, seaPeriodOf, seaHeight, towardOf } from '../src/game/Weather.js';
import { Hull } from '../src/game/Hull.js';
import { BreakingSeas } from '../src/game/BreakingSeas.js';
import { BOATS, loadBoat } from '../src/world/boat/Boats.js';

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const FROM = { x: 65, z: 560 };

function drive( model, id, { throttle = 1, secs = 60, anchor = false, cond = SOUTHERLY } ) {

	const w = weatherAt( 30, cond ), waves = new Waves( { tier: 'low', terrain } );
	waves.setWindDir( towardOf( w.windAngle ), FROM );
	waves.setSea( seaSwell( w.swell, w.blow ), w.windSea );
	waves.setSwell( 0, w.period, w.period, FROM, G.time.value, seaTurn( w.swell, w.blow ), seaPeriodOf( w.swell, w.windSea, w.blow ) );
	G.windSpeed.value = w.wind;
	const caps = new Whitecaps( { waves, tier: 'low' } );
	caps.set( w.wind );
	const query = new WaterQuery( waves, terrain ), b = new BoatController( { model, query, terrain, colliders: null } );
	b.moored = false;
	b.driven = ! anchor;
	if ( anchor ) b.anchor = { x: FROM.x, y: 0, z: FROM.z };
	b.position.set( FROM.x, 0, FROM.z );
	b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), 0 );
	const hull = new Hull( { random: () => 0.99, boat: id } ), seas = new BreakingSeas( { waves, caps, hull } ), spray = new BoatSpray( { boat: b, spray: { nReq: 0, emit() {} } } );
	let slams = 0;
	b.onSlam = ( s ) => {

		slams ++;
		hull.slam( s );

	};

	const hs = seaHeight( w.swell, w.windSea, w.blow ), dt = 1 / 60;
	for ( let i = 0; i < secs * 60; i ++ ) {

		G.time.value += dt;
		b.queueQueries();
		query.update();
		b.setInput( anchor ? 0 : throttle, 0, dt );
		b.update( dt );
		spray.update( dt );
		seas.step( dt, b, hs, G.time.value );
		const c = b.contact;
		hull.step( dt, { driven: ! anchor, throttle, fuel: true, rain: 0, pile: c.pile, ground: c.ground, slide: c.slide, aground: c.aground } );
		c.pile = c.ground = c.slide = 0;
		c.aground = false;
		hull.drain();

	}

	G.windSpeed.value = 7;
	return { wear: hull.wear, slams, hits: seas.hits, bilge: hull.bilge, floodL: hull.floodL };

}

const pc = ( w ) => `${ ( w * 100 ).toFixed( 1 ) }%`;
for ( const id of process.argv[ 2 ] ? [ process.argv[ 2 ] ] : Object.keys( BOATS ).filter( ( k ) => k !== 'kayak' ) ) {

	const m = await loadBoat( id, 'low' ), flat = drive( m, id, {} ), third = drive( m, id, { throttle: 0.3 } ), four = drive( m, id, { throttle: 0.7, secs: 240 } ), anchored = drive( m, id, { anchor: true, secs: 240 } );
	console.log( `${ id }: a minute head to it, flat out ${ pc( flat.wear ) } (${ flat.slams } slams), a third ${ pc( third.wear ) } (${ third.slams }). Four minutes at 0.7: ${ four.hits } seas aboard, ${ four.bilge.toFixed( 0 ) } of ${ four.floodL } L, ${ pc( four.wear ) }; at anchor: ${ anchored.hits } seas, ${ anchored.bilge.toFixed( 0 ) } L` );
	m.dispose();

}
