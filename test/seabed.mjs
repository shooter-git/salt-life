// (M15) The seabed past the island (terrain/SeabedModel.js, baked into public/world/offshore*.bin; read by
// terrain/Offshore.js and TerrainData): the island's square blended into it with no step, its shelf, drop-off,
// ledge, canyon, hump, bank and sandbar where and as deep as they're meant to be, the deep past the map, and
// the bounds the ground's grid culls by covering it.
//
//   node test/seabed.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { SEABED, SeabedModel } from '../src/world/terrain/SeabedModel.js';
import { SOUNDER_REACH } from '../src/world/boat/Instruments.js';

const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const m = ( v ) => v.toFixed( 1 );

const island = decodeIsland( read( 'island.bin' ) );
const plain = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ) );
const T = new TerrainData( 7, island, { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
const low = new TerrainData( 7, decodeIsland( read( 'island-1024.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore-512.bin' ) ) ) } );
const depth = ( x, z, t = T ) => - t.heightAt( x, z );

// ---- the island's square: untouched but for its last 120 m, which meets the seabed out there with no step
{

	// its own seabed there (the bake faded it to 90 m: lerp( -90, h, t )), against the seabed it's blended into
	const t = ( e ) => { const u = Math.min( 1, Math.max( 0, e / 120 ) ); return u * u * ( 3 - 2 * u ); };
	let inner = 0, step = 0, apart = 0, sum = 0, n = 0;
	for ( let k = - 860; k <= 860; k += 7 ) for ( const [ x, z ] of [ [ k, - 860 ], [ k, 860 ], [ - 860, k ], [ 860, k ] ] ) inner = Math.max( inner, Math.abs( T.heightAt( x, z ) - plain.heightAt( x, z ) ) );
	for ( let k = - 1000; k <= 1000; k += 7 ) for ( const [ ax, az, dx, dz ] of [ [ k, - 1024, 0, - 1 ], [ k, 1024, 0, 1 ], [ - 1024, k, - 1, 0 ], [ 1024, k, 1, 0 ] ] ) {

		// across the edge itself, a metre at a time
		for ( let s = - 20; s < 20; s ++ ) step = Math.max( step, Math.abs( T.heightAt( ax + dx * ( s + 1 ), az + dz * ( s + 1 ) ) - T.heightAt( ax + dx * s, az + dz * s ) ) );
		for ( let e = 60; e < 118; e += 4 ) {

			const x = ax - dx * e, z = az - dz * e, tt = t( Math.min( 1023.5 - Math.abs( x ), 1023.5 - Math.abs( z ) ) );
			const own = ( plain.heightAt( x, z ) + 90 * ( 1 - tt ) ) / tt, d = Math.abs( own - T.offshore.heightAt( x, z ) );
			apart = Math.max( apart, d ); sum += d; n ++;

		}

	}

	check( inner === 0, `the island's square inside its last 120 m is as baked (largest change ${ inner } m)` );
	check( step < 0.35, `no step across the square's edge: at most ${ m( step * 100 ) } cm between metres` );
	check( apart < 8, `its own seabed in its last 120 m and the seabed it's blended into ${ m( sum / n ) } m apart on average, ${ m( apart ) } at most (a slope of ${ m( Math.atan( apart * 1.5 / 120 ) * 180 / Math.PI ) }° added at worst)` );
	check( plain.heightAt( 0, 3000 ) === - 90 && T.heightAt( 0, 3000 ) < - 90, 'without the seabed, a flat 90 m past the square as before; with it, the drop-off' );

}

// ---- the shelf and its break: from the island's 85 m on to 45-110 m, then steeply down
{

	const breaks = [];
	let steepest = 0;
	for ( let b = 0; b < 360; b += 10 ) {

		const th = b * Math.PI / 180, ux = Math.sin( th ), uz = - Math.cos( th );
		let prev = null, found = null;
		for ( let r = 600; r < 7000; r += 25 ) {

			const x = SEABED.centre.x + ux * r, z = SEABED.centre.z + uz * r, d = depth( x, z );
			if ( Math.max( Math.abs( x ), Math.abs( z ) ) < 1100 ) continue; // (the island's own)
			if ( prev !== null ) {

				const slope = ( d - prev ) / 25;
				if ( found === null && slope > 0.18 ) found = { r, d: prev };
				if ( found ) steepest = Math.max( steepest, slope );

			}

			prev = d;

		}

		breaks.push( { b, ...found } );

	}

	const ds = breaks.map( ( k ) => k.d ), rs = breaks.map( ( k ) => k.r );
	console.log( `     the break by bearing (every 10°): ${ ds.map( Math.round ).join( ' ' ) } m deep, ${ m( Math.min( ...rs ) / 1000 ) } to ${ m( Math.max( ...rs ) / 1000 ) } km from the island's middle` );
	check( Math.min( ...ds ) > 30 && Math.max( ...ds ) < 115, `the shelf breaks between 30 and 115 m deep all round (${ Math.round( Math.min( ...ds ) ) } to ${ Math.round( Math.max( ...ds ) ) }; the canyons' heads the shallowest)` );
	check( steepest > 0.5 && steepest < 1.4, `the drop-off's steepest is ${ m( Math.atan( steepest ) * 180 / Math.PI ) }° (between 27 and 54)` );
	const anchor = depth( 0, - 1600 );
	check( anchor < 200 * 0.3048, `the north shelf 760 m past the square holds the anchor (${ m( anchor ) } m, the rode 61 m)` );

}

// ---- the features
{

	const model = new SeabedModel( T );
	// the ledge north: a stretch at 180-240 m, gentle, at least 250 m wide
	let widest = 0;
	for ( const b of [ - 20, 0, 20 ] ) {

		const th = b * Math.PI / 180;
		let run = 0;
		for ( let r = 1500; r < 5000; r += 10 ) {

			const x = Math.sin( th ) * r, z = SEABED.centre.z - Math.cos( th ) * r;
			const d = depth( x, z ), slope = Math.abs( depth( x + Math.sin( th ) * 10, z - Math.cos( th ) * 10 ) - d ) / 10;
			run = d > 170 && d < 250 && slope < 0.15 ? run + 10 : 0;
			widest = Math.max( widest, run );

		}

	}

	check( widest >= 250, `the ledge north: ${ widest } m across at 170 to 250 m deep, under 9°` );

	// the canyon: deeper than the slope beside it, its floor going down
	const C = model.canyon;
	let along = 0, prevU = 0, cut = 0, rise = 0;
	const floor = [];
	for ( let i = 1; i < C.length; i ++ ) {

		along += Math.hypot( C[ i ][ 0 ] - C[ i - 1 ][ 0 ], C[ i ][ 1 ] - C[ i - 1 ][ 1 ] );
		if ( along - prevU < 100 ) continue;
		prevU = along;
		const [ x, z ] = C[ i ];
		floor.push( [ along, depth( x, z ) ] );
		if ( along > 1500 && along < 4500 ) cut = Math.max( cut, depth( x, z ) - Math.max( depth( x + 1600, z ), depth( x - 1600, z ) ) );

	}

	for ( let i = 0; i < floor.length; i ++ ) for ( let j = i + 1; j < floor.length && floor[ j ][ 0 ] - floor[ i ][ 0 ] <= 1000; j ++ ) rise = Math.max( rise, floor[ i ][ 1 ] - floor[ j ][ 1 ] );
	console.log( `     the canyon's floor every km: ${ floor.filter( ( _, i ) => i % 10 === 0 ).map( ( [ , d ] ) => Math.round( d ) ).join( ' ' ) } m` );
	check( cut > 150, `the canyon cuts ${ Math.round( cut ) } m below the slope beside it` );
	check( rise < 60, `its floor never rises more than ${ Math.round( rise ) } m within a km on its way down (gullies and the deep floor's swell)` );
	check( depth( ...SEABED.canyon[ 0 ] ) > depth( SEABED.canyon[ 0 ][ 0 ] - 700, SEABED.canyon[ 0 ][ 1 ] ) + 20, `its head cuts into the shelf (${ Math.round( depth( ...SEABED.canyon[ 0 ] ) ) } m, beside it ${ Math.round( depth( SEABED.canyon[ 0 ][ 0 ] - 700, SEABED.canyon[ 0 ][ 1 ] ) ) })` );

	// the hump
	let top = Infinity;
	const [ hx, hz ] = SEABED.hump[ 0 ];
	for ( let dz = - 400; dz <= 400; dz += 20 ) for ( let dx = - 400; dx <= 400; dx += 20 ) top = Math.min( top, depth( hx + dx, hz + dz ) );
	check( top > 85 && top < 125, `the hump's top ${ m( top ) } m deep, rising from ${ Math.round( depth( hx + 4500, hz - 4500 ) ) } m` );

	// the bank, its rim, the sandbar
	const B = SEABED.bank, mid = depth( B.x, B.z );
	check( mid > 12 && mid < 28, `the bank's middle ${ m( mid ) } m deep` );
	let rim = Infinity;
	for ( let a = 0; a < Math.PI * 2; a += 0.05 ) for ( let r = 1200; r < 3000; r += 40 ) rim = Math.min( rim, depth( B.x + Math.cos( a ) * r, B.z + Math.sin( a ) * r ) );
	check( rim < 10, `its rim shoals to ${ m( rim ) } m` );
	let crest = Infinity, crestLow = Infinity, channel = 0;
	for ( const [ x, z ] of model.bar.pts ) {

		crest = Math.min( crest, depth( x, z ) );
		crestLow = Math.min( crestLow, depth( x, z, low ) );
		channel = Math.max( channel, depth( x, z ) );

	}

	check( crest < 1 && crest > 0.1, `the sandbar's crest ${ m( crest * 100 ) } cm under (wading; the boat aground), on low ${ m( crestLow * 100 ) } cm` );
	check( crestLow < 1.5, 'on low too, shallow enough to stand on' );
	check( channel > 2, `a channel through it ${ m( channel ) } m deep` );

	// the deep, and past the map
	check( depth( 0, 15000 ) > 1650 && depth( 0, 15000 ) < 1950, `the deep's floor 15 km off: ${ Math.round( depth( 0, 15000 ) ) } m` );
	check( depth( 30000, - 40000 ) === SEABED.basin, `past the map, ${ SEABED.basin } m` );
	check( depth( 0, 15000 ) > SOUNDER_REACH && depth( 0, - 1600 ) < SOUNDER_REACH && depth( 0, - 2700 ) < SOUNDER_REACH, `the sounder (to ${ Math.round( SOUNDER_REACH ) } m) finds the shelf and the ledge, not the deep's floor` );

}

// ---- the bounds the ground's grid culls by cover the seabed
{

	let bad = 0;
	let seed = 3;
	const rand = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );
	for ( let n = 0; n < 300; n ++ ) {

		const size = [ 16, 64, 256, 1024, 2048 ][ n % 5 ], x0 = ( rand() - 0.5 ) * 30000, z0 = ( rand() - 0.5 ) * 30000;
		const [ lo, hi ] = T.boundsFor( x0, z0, x0 + size, z0 + size );
		for ( let k = 0; k < 40; k ++ ) {

			const h = T.heightAt( x0 + rand() * size, z0 + rand() * size );
			if ( h < lo - 1e-3 || h > hi + 1e-3 ) bad ++;

		}

	}

	check( bad === 0, `the ground grid's bounds hold the seabed (${ bad } of 12000 points outside them)` );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
