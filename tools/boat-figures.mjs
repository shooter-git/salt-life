#!/usr/bin/env node
// (M16) Each boat's figures as her own physics has them (player/BoatController, flat water), for game/Seaworthy.js' ABLE:
// her cruise's speed at 0.7 throttle and flat out, how she drifts in a wind, and how the drift sock changes that. Run it
// again when a boat's model changes: what's measured on a stand-in isn't hers.
//   node tools/boat-figures.mjs [ boat ]
import { BOATS, loadBoat } from '../src/world/boat/Boats.js';
import { BoatController } from '../src/player/BoatController.js';
import { ABLE, SOCK_DRIFT } from '../src/game/Seaworthy.js';
import { G } from '../src/core/Globals.js';
import { Vector3 } from '../src/engine/index.js';
import { Waves } from '../src/ocean/Waves.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { weatherAt, seaSwell, seaTurn, seaPeriodOf, towardOf } from '../src/game/Weather.js';
import { readFileSync } from 'node:fs';

const query = () => ( { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) } );
const HZ = 60;

function sim( model, U ) {

	const q = query(), ctl = new BoatController( { model, query: q, terrain: { heightAt: () => - 500 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	G.windSpeed.value = U;
	ctl.windAt = () => U;
	let t = 0;
	const run = ( seconds, th = 0 ) => {

		for ( let f = 0; f < seconds * HZ; f ++ ) {

			t += 1 / HZ;
			q.version ++;
			q.resultTime = t;
			ctl.setInput( th, 0, 1 / HZ );
			ctl.update( 1 / HZ );

		}

	};

	return { ctl, run };

}

// her speed at a steady throttle
function speedAt( model, th ) {

	const { ctl, run } = sim( model, 0 );
	run( 10 );
	ctl.driven = true;
	ctl.engineOn = true;
	run( 60, th );
	return ctl.forwardSpeed;

}

// her drift in a steady wind, of its speed; and how far off head to wind she lies (degrees)
function driftIn( model, U, sock ) {

	const { ctl, run } = sim( model, U );
	ctl.sock = sock;
	run( 40 );
	const x0 = ctl.position.x, z0 = ctl.position.z, T = 60;
	run( T );
	const d = Math.hypot( ctl.position.x - x0, ctl.position.z - z0 ) / T, w = G.windDir.value;
	const f = ctl.forward( new Vector3() );
	const off = Math.acos( Math.max( - 1, Math.min( 1, - ( f.x * w.x + f.z * w.y ) / Math.hypot( f.x, f.z ) ) ) ) * 180 / Math.PI;
	return { share: d / U, off };

}

// and in the game's own sea on a fair day, deep water, which is what ABLE's `drift` is: the waves take her way off her, so
// it's less than on the flat
const island = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
function driftAtSea( model ) {

	const from = { x: 3000, z: 3000 }, w = weatherAt( 30, 'fair' ), waves = new Waves( { tier: 'low', terrain: island } );
	waves.setWindDir( towardOf( w.windAngle ), from );
	waves.setSea( seaSwell( w.swell, w.blow ), w.windSea );
	waves.setSwell( 0, w.period, w.period, from, G.time.value, seaTurn( w.swell, w.blow ), seaPeriodOf( w.swell, w.windSea, w.blow ) );
	G.windSpeed.value = w.wind;
	const query = new WaterQuery( waves, island ), ctl = new BoatController( { model, query, terrain: island, colliders: null } );
	ctl.moored = false;
	ctl.beached = false;
	ctl.position.set( from.x, 0, from.z );
	ctl.windAt = () => w.wind;
	const dt = 1 / HZ, run = ( s ) => {

		for ( let f = 0; f < s * HZ; f ++ ) {

			G.time.value += dt;
			ctl.queueQueries();
			query.update();
			ctl.setInput( 0, 0, dt );
			ctl.update( dt );

		}

	};

	run( 40 );
	const x0 = ctl.position.x, z0 = ctl.position.z, T = 120;
	run( T );
	return Math.hypot( ctl.position.x - x0, ctl.position.z - z0 ) / T / w.wind;

}

for ( const id of process.argv[ 2 ] ? [ process.argv[ 2 ] ] : Object.keys( BOATS ) ) {

	const m = await loadBoat( id ), A = ABLE[ id ];
	const cruise = m.handling.engine ? speedAt( m, A.cruise.rpm ) : 0, full = m.handling.engine ? speedAt( m, 1 ) : 0;
	const line = [ `${ id }: cruise ${ cruise.toFixed( 1 ) } m/s (table ${ A.cruise.speed }), flat out ${ full.toFixed( 1 ) }, draught ${ m.dimensions.draft.toFixed( 2 ) } m (table ${ A.draught })` ];
	for ( const U of [ 7, 15 ] ) {

		const bare = driftIn( m, U, false ), sock = driftIn( m, U, true );
		line.push( `  ${ U } m/s: drifts ${ ( bare.share * 100 ).toFixed( 1 ) }% (table ${ ( A.drift * 100 ).toFixed( 1 ) }%), with the sock ${ ( sock.share * 100 ).toFixed( 1 ) }%, ${ ( sock.share / bare.share * 100 ).toFixed( 0 ) }% of that (table ${ SOCK_DRIFT * 100 }%), ${ sock.off.toFixed( 0 ) } deg off head to wind` );

	}

	line.push( `  in a fair day's sea: drifts ${ ( driftAtSea( m ) * 100 ).toFixed( 1 ) }% of the wind (table ${ ( A.drift * 100 ).toFixed( 1 ) }%)` );
	console.log( line.join( '\n' ) );
	m.dispose();

}
