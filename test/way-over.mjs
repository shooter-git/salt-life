// (M15) The way over to the north beach on foot (world/terrain/NorthTrail.js) and walking on the ground's slopes
// (Player's slopePace), under Node: a walker's pace by the grade, as Tobler's hiking function has it, never quite
// stopping; the trail from the valley's to the north beach on both islands, joined to it at one end and on the
// beach's sand at the other, its tread graded and level across, a walk of some ten minutes; the ground cut only
// along it; nothing to grow or lie on it; and its foot below the cliff a beach a turtle could cross.
//
//   node test/way-over.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { PATHS, polylineDistance } from '../src/world/terrain/IslandShape.js';
import { TRAIL, trailAt, trailClears, trailTexels } from '../src/world/terrain/NorthTrail.js';
import { slopePace, SCRAMBLE } from '../src/player/Player.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );

// ---- a walker's pace on a slope (Tobler 1993: 6 e^( -3.5 | grade + 0.05 | ) km/h, as a share of the flat's)
{

	const tobler = ( g ) => 6 * Math.exp( - 3.5 * Math.abs( g + 0.05 ) );
	check( slopePace( 0 ) === 1 && Math.abs( slopePace( 0.2 ) - tobler( 0.2 ) / tobler( 0 ) ) < 1e-9 && Math.abs( slopePace( - 0.3 ) - tobler( - 0.3 ) / tobler( 0 ) ) < 1e-9, 'a walker\'s pace on a slope, as Tobler\'s hiking function has it' );
	check( slopePace( - 0.05 ) > 1.15 && slopePace( 0.2 ) > 0.45 && slopePace( 0.2 ) < 0.55, `quickest a little downhill (${ slopePace( - 0.05 ).toFixed( 2 ) } of the flat's), half up a 20% climb (${ slopePace( 0.2 ).toFixed( 2 ) })` );
	check( slopePace( 1 ) === SCRAMBLE && slopePace( - 1 ) === SCRAMBLE && slopePace( 3 ) === SCRAMBLE && SCRAMBLE > 0, `up or down 45° and steeper, a scramble on all fours (${ SCRAMBLE } of the flat's): never stuck` );

}

// ---- the trail, on both islands
for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, decodeIsland( read( file ) ) );
	const P = TRAIL.pts, start = P[ 0 ], end = P.at( - 1 );
	check( polylineDistance( PATHS[ 1 ].pts, start[ 0 ], start[ 1 ] )[ 0 ] < 1, `${ file }: it leaves the valley's trail at ( ${ start.join( ', ' ) } )` );
	const eh = T.heightAt( end[ 0 ], end[ 1 ] );
	check( eh > 1.2 && eh < 2.6 && T.sand[ Math.floor( end[ 1 ] - T.origin ) / T.texel * T.res + Math.floor( ( end[ 0 ] - T.origin ) / T.texel ) ] !== undefined, `${ file }: and comes down onto the north beach's sand (${ eh.toFixed( 1 ) } m up)` );
	// walked, at the pace the slope lets you
	let len = 0, time = 0, top = - Infinity, steep = 0, tilt = 0, low = Infinity;
	// (its hairpins: the turns past 90°, where its legs run close for a few metres either side, more on the low
	// tier's wider tread)
	const hairpin = ( x, z ) => P.some( ( q, n ) => n > 0 && n < P.length - 1 && Math.hypot( x - q[ 0 ], z - q[ 1 ] ) < 6 + 3 * ( T.texel - 1 )
		&& ( q[ 0 ] - P[ n - 1 ][ 0 ] ) * ( P[ n + 1 ][ 0 ] - q[ 0 ] ) + ( q[ 1 ] - P[ n - 1 ][ 1 ] ) * ( P[ n + 1 ][ 1 ] - q[ 1 ] ) < 0 );
	for ( let n = 1; n < P.length; n ++ ) {

		const [ ax, az ] = P[ n - 1 ], [ bx, bz ] = P[ n ], L = Math.hypot( bx - ax, bz - az ), dx = ( bx - ax ) / L, dz = ( bz - az ) / L;
		for ( let s = 0; s < L; s += 0.5 ) {

			const x = ax + dx * s, z = az + dz * s, h = T.heightAt( x, z ), g = ( T.heightAt( x + dx * 0.8, z + dz * 0.8 ) - h ) / 0.8;
			// (across it, away from the turns, and off the beach at its foot: level)
			const turn = Math.min( s, L - s ) < 3 || hairpin( x, z ) || h < 3.5;
			if ( ! turn ) tilt = Math.max( tilt, Math.abs( T.heightAt( x - dz * 0.4, z + dx * 0.4 ) - T.heightAt( x + dz * 0.4, z - dx * 0.4 ) ) / 0.8 );
			if ( ! turn && Math.abs( g ) > 0.32 ) steep += 0.5;
			len += 0.5;
			time += 0.5 / ( 3 * slopePace( g ) );
			top = Math.max( top, h );
			if ( n < P.length - 4 ) low = Math.min( low, h );

		}

	}

	console.log( `     ${ file }: ${ len.toFixed( 0 ) } m, its top ${ top.toFixed( 0 ) } m, ${ ( time / 60 ).toFixed( 1 ) } min at a walk (${ ( len / 180 ).toFixed( 1 ) } were it flat)` );
	check( len > 1300 && len < 1500 && top < 90 && time < 12 * 60, `${ file }: some 1.4 km over, round the east, its top under 90 m: a walk of ${ ( time / 60 ).toFixed( 1 ) } minutes` );
	check( steep <= ( T.texel > 1 ? 30 : 6 ), `${ file }: its tread graded (${ steep } m steeper than 32% off its turns)` );
	check( tilt < ( T.texel > 1 ? 0.45 : 0.3 ), `${ file }: and nearly level across it (steepest ${ ( tilt * 100 ).toFixed( 0 ) }% off its turns)` );
	check( low > 2.5, `${ file }: above the sea all the way to the beach (its lowest ${ low.toFixed( 1 ) } m)` );

	// the ground cut only along it, and the caves' and the beach's
	let off = 0;
	for ( const k of T._uncut.keys() ) {

		const x = T.origin + ( k % T.res + 0.5 ) * T.texel, z = T.origin + ( Math.floor( k / T.res ) + 0.5 ) * T.texel;
		if ( trailAt( x, z )[ 0 ] < TRAIL.w + 8 ) continue;
		if ( z < - 780 && z > - 910 && x > 25 && x < 285 ) continue; // (the turtle beach)
		if ( z > - 830 && z < - 300 && x < - 300 ) continue; // (the sea caves)
		off ++;

	}

	check( off === 0, `${ file }: the ground cut only along it (and the sea caves' and the turtle beach's)` );

}

// ---- nothing in its way
{

	let n = 0, ok = true;
	for ( let k = 1; k < TRAIL.pts.length; k ++ ) {

		const [ ax, az ] = TRAIL.pts[ k - 1 ], [ bx, bz ] = TRAIL.pts[ k ];
		for ( let f = 0; f < 1; f += 0.1 ) if ( ! trailClears( ax + ( bx - ax ) * f, az + ( bz - az ) * f ) ) ok = false;
		n ++;

	}

	check( ok && ! trailClears( 0, - 100 ) && ! trailClears( 150, - 760 ) && trailClears( 43, - 243 ), 'no rock, tree or shrub on it, nor within a metre of its tread' );
	let texels = 0;
	trailTexels( 2048, - 1024, 1, 0.5, () => texels ++ );
	check( texels > 1400 * 2 && texels < 1400 * 6, `its texels found from its segments (${ texels } of the 1 m grid within half a metre of its tread)` );

}

console.log( failed ? `\n${ failed } failed` : '\nall ok' );
process.exit( failed ? 1 : 0 );
