// (M15) The sea out there: the wind's sea grown only as far as the open water upwind lets it (Waves.LEE,
// setWind: the island's lee calmer, filling in further off), the swell shadowed behind the island, the
// whitecaps with the wind sea, and the bank's own breakers (ShoreWaves' fourth train: its rim and sandbar
// break in a swell, its middle doesn't, and the island's waves stay the island's).
//
//   node test/sea-out-there.mjs

import { readFileSync } from 'node:fs';
import { G } from '../src/core/Globals.js';
import { Waves, LEE, fetchFor } from '../src/ocean/Waves.js';
import { Whitecaps } from '../src/ocean/Whitecaps.js';
import { ShoreWaves } from '../src/ocean/ShoreWaves.js';
import { computeShoreField, fieldGround } from '../src/world/ShoreField.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { SEABED, SeabedModel } from '../src/world/terrain/SeabedModel.js';
import { WORLD } from '../src/world/WorldLayout.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const f2 = ( v ) => v.toFixed( 2 );

// ---- the wind's sea and its fetch
{

	const T = ( L ) => Math.sqrt( 2 * Math.PI * L / 9.81 );
	const need = fetchFor( T( 4.2 ), 7 ) / 1000, need15 = fetchFor( T( 4.2 ), 15 ) / 1000, long = fetchFor( T( 23 ), 7 ) / 1000;
	console.log( `     in the trades (7 m/s) a 4 m wave needs ${ need.toFixed( 1 ) } km of open water upwind to be grown, a 23 m one ${ long.toFixed( 0 ) } km; at 15 m/s the 4 m one ${ need15.toFixed( 1 ) } km` );
	check( need > 1.5 && need < 5 && need15 < need, 'the wind sea\'s fetch, JONSWAP\'s: a few km for the short waves in the trades, less in a stronger wind' );

	const waves = new Waves( { tier: 'high' } );
	G.windDir.value.copy( G.windPrevailing.value );
	waves.setWindDir( G.windDir.value, { x: 0, z: 0 } );
	waves.setWind( 7 );
	// downwind of the island: along the trades from its middle
	const wd = G.windDir.value, at = ( r ) => waves.windGrownAt( LEE.x + wd.x * r, LEE.z + wd.y * r );
	const bay = waves.windGrownAt( 10, 0 ), up = waves.windGrownAt( LEE.x - wd.x * 3000, LEE.z - wd.y * 3000 );
	console.log( `     the wind sea's share grown: in the bay ${ f2( bay ) }; downwind of the island 1.6 km ${ f2( at( 1600 ) ) }, 3 km ${ f2( at( 3000 ) ) }, 6 km ${ f2( at( 6000 ) ) }, 15 km ${ f2( at( 15000 ) ) }; upwind ${ f2( up ) }; abeam 3 km ${ f2( waves.windGrownAt( LEE.x + wd.y * 3000, LEE.z - wd.x * 3000 ) ) }` );
	check( bay < 0.05, 'in the island\'s lee, the bay, hardly any wind sea in the trades' );
	check( at( 1600 ) < at( 3000 ) && at( 3000 ) < at( 6000 ) && at( 6000 ) > 0.8, 'downwind it fills in from either side as it goes' );
	check( up === 1, 'upwind of the island, the open ocean\'s' );

	// the swell (from the south): shadowed behind the island, to its north
	const lee = Array.from( waves.leeAt( 0, - 1600 ) ), front = Array.from( waves.leeAt( 0, 600 ) );
	const s = waves.waves.findIndex( ( w ) => w.from === 's' );
	console.log( `     the swell's height: in the bay ${ f2( front[ s ] ) }, 1.2 km off the north shore ${ f2( lee[ s ] ) }, 6 km off it ${ f2( waves.leeAt( 0, - 6400 )[ s ] ) }` );
	check( front[ s ] === 1 && lee[ s ] < 0.4 && waves.leeAt( 0, - 6400 )[ s ] > lee[ s ], 'the south\'s swell shadowed behind the island, less so further off' );

	// what floats sits on what's drawn: the CPU's heights in the lee are the calmer sea
	const rms = ( x, z ) => {

		let s2 = 0;
		for ( let t = 0; t < 120; t += 0.5 ) s2 += ( waves.heightAt( x, z, t ) - G.seaLevel.value ) ** 2;
		return Math.sqrt( s2 / 240 );

	};

	// (the wind sea alone: the swell held flat)
	waves.setSea( 0, 1 );
	const calm = rms( LEE.x + wd.x * 1300, LEE.z + wd.y * 1300 ), open = rms( LEE.x - wd.x * 5000, LEE.z - wd.y * 5000 );
	console.log( `     the wind sea's height (rms) just downwind of the island ${ f2( calm ) } m, upwind in the open ${ f2( open ) } m` );
	check( calm < open * 0.6, 'the CPU\'s sea, as the GPU draws it, calmer in the lee' );
	waves.setSea( 1, 1 );

	// the whitecaps with it
	const caps = new Whitecaps( { waves, tier: 'high' } );
	caps.set( 9 );
	let inLee = 0, inOpen = 0;
	for ( let t = 0; t < 60; t += 0.5 ) for ( let k = 0; k < 40; k ++ ) {

		inLee += caps.foamAt( 10 + k * 3, 60 + k * 2, t ).foam;
		inOpen += caps.foamAt( LEE.x - wd.x * 5000 + k * 3, LEE.z - wd.y * 5000 + k * 2, t ).foam;

	}

	check( inLee < inOpen * 0.1 && inOpen > 0, `the whitecaps go with the wind sea: none in the bay in a fresh breeze, out in the open ${ f2( inOpen / 4800 * 100 ) }% white` );

}

// ---- the bank's breakers
{

	const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
	const T = new TerrainData( 7, decodeIsland( read( 'island-1024.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
	const home = computeShoreField( T, { res: 256, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } );
	const B = SEABED.bank, size = 7168, res = 512, h = size / res, origin = B.x - size / 2, originZ = B.z - size / 2;
	const depth = new Float32Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) depth[ j * res + i ] = - T.heightAt( origin + ( i + 0.5 ) * h, originZ + ( j + 0.5 ) * h );
	const t0 = performance.now();
	const field = computeShoreField( fieldGround( { depth, res, size, origin, originZ } ), { res, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } );
	const ms = performance.now() - t0;
	let finite = 0;
	for ( let k = 0; k < res * res; k ++ ) if ( field.data[ k * 4 ] < 1e5 ) finite ++;
	check( finite === res * res, `the bank's field solved over its square (a sea with no land in it) in ${ Math.round( ms ) } ms` );

	const shore = new ShoreWaves( { field: home } );
	shore.setBank( field, [ B.x, B.z ] );
	// (across it from the north, behind it, to the south, the side the swell comes from)
	const bar = new SeabedModel( T ).bar.pts[ 14 ];
	const across = ( amp ) => {

		shore.setBankSea( amp, 9, 0 );
		const rows = [];
		for ( let r = - 300; r <= 300; r += 50 ) {

			const x = bar[ 0 ] + 0.12 * r, z = bar[ 1 ] + 0.99 * r, g = T.heightAt( x, z );
			let broke = 0, hi = - 9;
			for ( let t = 0; t < 36; t += 0.25 ) {

				if ( shore.breakerAt( x, z, t, g, T ).b > 0 ) broke ++;
				hi = Math.max( hi, shore.sample( x, z, t, g, T ).y );

			}

			rows.push( { r, d: - g, broke: broke / 144, hi } );

		}

		return rows;

	};

	const fair = across( 0.34 ), big = across( 0.8 );
	const crest = fair.find( ( q ) => q.r === 0 ), mid = big.find( ( q ) => q.r === 300 ), at = ( r ) => big.find( ( q ) => q.r === r );
	console.log( `     across the sandbar (every 50 m, north to south): depth ${ fair.map( ( q ) => q.d.toFixed( 1 ) ).join( ' ' ) } m` );
	console.log( `       a fair day's swell (H 0.7 m) breaking ${ fair.map( ( q ) => Math.round( q.broke * 100 ) ).join( ' ' ) } % of the time` );
	console.log( `       a 1.6 m swell breaking ${ big.map( ( q ) => Math.round( q.broke * 100 ) ).join( ' ' ) } %, its crests ${ big.map( ( q ) => q.hi.toFixed( 1 ) ).join( ' ' ) } m` );
	check( crest.broke > 0.9 && fair.filter( ( q ) => q.broke > 0.05 ).length <= 3, 'on a fair day the swell breaks on the sandbar\'s crest, and only there' );
	check( big.filter( ( q ) => q.broke > 0.3 ).length >= 3 && mid.broke === 0, 'a bigger swell breaks across the bar from further out, never over the bank\'s 20 m' );
	check( at( 50 ).hi > at( 250 ).hi * 1.3 && at( 50 ).hi > 0.8, `it builds as it comes onto the bar: its crests ${ at( 250 ).hi.toFixed( 1 ) } m over ${ at( 250 ).d.toFixed( 0 ) } m of water, ${ at( 50 ).hi.toFixed( 1 ) } m over ${ at( 50 ).d.toFixed( 1 ) } m` );
	const there = shore.sample( 0, 900, 3, T.heightAt( 0, 900 ), T );
	shore.setBankSea( 0, 9, 0 );
	const without = shore.sample( 0, 900, 3, T.heightAt( 0, 900 ), T );
	check( there.y === without.y, 'the bank\'s waves add nothing at the island' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
