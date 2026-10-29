// (M15) The sea's grid about an origin that follows the camera (core/CDLOD.js, follow): its vertices worked
// out as the GPU does, in 32-bit floats, land on their own points of the world's lattice tens of km out on
// every tier (laid out about the world's origin, mid's snap missed there), with the same parity (which way a
// vertex morphs), so nothing moves as the origin jumps; and a grid that doesn't follow keeps the world's.
// What the sea's drawn with about that origin as the world's: the whitecaps' crests and cells, the foam's
// noises (its lace, the whitecaps' marbling), and the marbling's frame turning about you as the wind turns.
// And the fishing line (and the anchor's rode) drawn about a point by its first end.
import { PerspectiveCamera, Vector2, Vector4, Object3D } from '../src/engine/index.js';
import { createLineMaterial } from '../src/game/GameMaterials.js';
import { CDLOD } from '../src/core/CDLOD.js';
import { foamKeys, FOAM_NOISE } from '../src/ocean/WaterSurface.js';
import { Waves } from '../src/ocean/Waves.js';
import { Whitecaps, CARRIERS } from '../src/ocean/Whitecaps.js';

let failed = 0;
const ok = ( c, label ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! c ) failed ++;

};

const f = Math.fround;
// the sea's grid on each tier (as WaterSurface's LOD_GRID and LEAF), and its origin's step (ORIGIN_STEP)
const TIERS = { low: [ 7, 16 ], mid: [ 20, 8 ], high: [ 32, 8 ] };
const STEP = 512;

// the lattice index of grid point ( i, j ) of a node, as the shader finds it (Morph_), in 32-bit floats
// (division exact, as a GPU may do it), and in the world; and its parity
function shaderIndex( lod, node, i, G ) {

	const U = lod.uniforms, l = node[ 3 ];
	const h = f( U.oceanLodMorph.value[ l ].z ), og = U.oceanLodOrigin.value[ l ];
	const g = f( i / G );
	const p = f( f( node[ 0 ] + f( g * node[ 2 ] ) ) + f( og.x ) );
	return { idx: Math.floor( f( f( p / h ) + f( 1e-3 ) ) ), par: og.z };

}

function check( tier, x, z ) {

	const [ G, leaf ] = TIERS[ tier ];
	const lod = new CDLOD( { gridSize: G, leafSize: leaf, levels: 12, minY: - 4, maxY: 4, prefix: 'oceanLod', follow: STEP } );
	const cam = new PerspectiveCamera( 70, 16 / 9, 0.1, 12000 );
	cam.position.set( x, 2, z );
	cam.lookAt( x + 30, 0, z + 100 );
	cam.updateMatrixWorld();
	lod.update( cam );
	const O = lod.origin;
	let wrong = 0, oddWrong = 0, n = 0, near = 0, nearErr = 0;
	for ( let k = 0; k < lod.count; k ++ ) {

		const node = Array.from( lod.nodeArray.subarray( k * 4, k * 4 + 4 ) ), l = node[ 3 ];
		const h = leaf * 2 ** l / G;
		const kx = Math.floor( O.x / h + 1e-9 );
		for ( let i = 0; i <= G; i ++ ) {

			const s = shaderIndex( lod, node, i, G );
			// in the world: the point's own index on its lattice, and its parity
			const xw = O.x + node[ 0 ] + i / G * node[ 2 ];
			const want = Math.floor( xw / h + 1e-3 );
			const idx = s.idx + kx;
			if ( idx !== want ) wrong ++;
			const oddShader = ( ( ( s.idx + s.par ) % 2 ) + 2 ) % 2, oddWorld = ( ( want % 2 ) + 2 ) % 2;
			if ( oddShader !== oddWorld ) oddWrong ++;
			// within 100 m: where it's drawn, about the origin in 32-bit floats, against the world's
			if ( Math.abs( xw - x ) < 100 ) {

				const at = f( f( s.idx * f( h ) ) - f( lod.uniforms.oceanLodOrigin.value[ l ].x ) );
				nearErr = Math.max( nearErr, Math.abs( O.x + at - want * h ) );
				near ++;

			}
			n ++;

		}

	}

	return { wrong, oddWrong, n, near, nearErr, origin: O.x };

}

for ( const tier of Object.keys( TIERS ) ) {

	for ( const km of [ 0.3, 5, 20, 40, 60 ] ) {

		const r = check( tier, km * 1000 + 137.3, km * 300 - 41.7 );
		ok( r.n > 500 && r.wrong === 0 && r.oddWrong === 0, `${ tier } at ${ km } km: all ${ r.n } grid points on the world's lattice, their parity the world's (origin ${ r.origin } m)` );
		ok( r.near > 0 && r.nearErr < 1e-4, `${ tier } at ${ km } km: drawn within ${ ( r.nearErr * 1000 ).toFixed( 3 ) } mm of their point near the camera` );

	}

}

// across a jump of the origin (511 m and 513 m out: origin 0 and 512): each point the same in the world
{

	const [ G, leaf ] = TIERS.mid;
	const at = ( x ) => {

		const lod = new CDLOD( { gridSize: G, leafSize: leaf, levels: 12, prefix: 'oceanLod', follow: STEP } );
		const cam = new PerspectiveCamera( 70, 16 / 9, 0.1, 12000 );
		cam.position.set( x, 2, 0 );
		cam.lookAt( x, 0, 100 );
		cam.updateMatrixWorld();
		lod.update( cam );
		const pts = new Map();
		for ( let k = 0; k < lod.count; k ++ ) {

			const node = Array.from( lod.nodeArray.subarray( k * 4, k * 4 + 4 ) ), l = node[ 3 ], h = leaf * 2 ** l / G;
			const s = shaderIndex( lod, node, 0, G );
			pts.set( `${ l }:${ lod.origin.x + node[ 0 ] }:${ node[ 1 ] + lod.origin.z }`, s.idx + Math.floor( lod.origin.x / h + 1e-9 ) );

		}
		return { pts, origin: lod.origin.x };

	};
	const a = at( 255 ), b = at( 257 );
	let same = 0, differ = 0;
	for ( const [ key, idx ] of a.pts ) if ( b.pts.has( key ) ) b.pts.get( key ) === idx ? same ++ : differ ++;
	ok( a.origin === 0 && b.origin === 512 && same > 20 && differ === 0, `mid, the origin jumping from 0 to 512 m: the ${ same } nodes drawn both times on the same points (${ differ } moved)` );

}

// a grid that doesn't follow (the terrain's): its origin the world's, its offsets all nought, parity even
{

	const lod = new CDLOD( { gridSize: 64, leafSize: 8, levels: 9, prefix: 'terrainLod', center: { x: - 1024, z: - 1024, size: 2048 } } );
	const cam = new PerspectiveCamera( 70, 16 / 9, 0.1, 12000 );
	cam.position.set( 700, 30, - 600 );
	cam.lookAt( 0, 0, 0 );
	cam.updateMatrixWorld();
	lod.update( cam );
	ok( lod.origin.length() === 0 && lod.uniforms.terrainLodOrigin.value.every( ( v ) => v.x === 0 && v.y === 0 && v.z === 0 && v.w === 0 ), 'the terrain\'s grid stays at the world\'s origin, its offsets and parities nought' );

}

// the sea's waterHash and waterNoiseAt, as the GPU does them (uint arithmetic, wrapped)
function hash( cx, cz, k ) {

	let x = ( ( cx | 0 ) + Math.imul( k, 7919 ) ) >>> 0, y = ( ( cz | 0 ) + Math.imul( k, 104729 ) ) >>> 0;
	x = ( Math.imul( x, 1664525 ) + 1013904223 ) >>> 0; y = ( Math.imul( y, 1664525 ) + 1013904223 ) >>> 0;
	x = ( x + Math.imul( y, 1664525 ) ) >>> 0; y = ( y + Math.imul( x, 1664525 ) ) >>> 0;
	x = ( x ^ ( x >>> 16 ) ) >>> 0; y = ( y ^ ( y >>> 16 ) ) >>> 0;
	x = ( x + Math.imul( y, 1664525 ) ) >>> 0; y = ( y + Math.imul( x, 1664525 ) ) >>> 0;
	x = ( x ^ ( x >>> 16 ) ) >>> 0; y = ( y ^ ( y >>> 16 ) ) >>> 0;
	return ( ( x ^ y ) >>> 8 ) / 16777216;

}
function noiseAt( ix, iz, fx, fz ) {

	const ux = fx * fx * ( 3 - 2 * fx ), uz = fz * fz * ( 3 - 2 * fz );
	const a = hash( ix, iz, 0 ), b = hash( ix + 1, iz, 0 ), c = hash( ix, iz + 1, 0 ), d = hash( ix + 1, iz + 1, 0 );
	return ( a + ( b - a ) * ux ) + ( ( c + ( d - c ) * ux ) - ( a + ( b - a ) * ux ) ) * uz;

}
// the world's, in doubles; and the GPU's, p about the origin (in 32-bit floats) and keyed
const noise = ( x, z ) => noiseAt( Math.floor( x ), Math.floor( z ), x - Math.floor( x ), z - Math.floor( z ) );
function noiseK( px, pz, key ) {

	px = f( px + f( key.z ) ); pz = f( pz + f( key.w ) );
	const ix = Math.floor( px ), iz = Math.floor( pz );
	return noiseAt( ix + key.x, iz + key.y, f( px - ix ), f( pz - iz ) );

}

// the foam's noises tens of km out: each keyed about the origin (as the shader draws it) the world's, near you
{

	const { LACE_NOISE, FROTH, ROWS, MARBLE_NOISE, MARBLE, KEY, SPUME_NOISE, SPUME_LACE } = FOAM_NOISE;
	const keys = Array.from( { length: KEY.count }, () => new Vector4( 0, 0, 0, 0 ) );
	for ( const km of [ 5, 40, 60 ] ) {

		const cam = { x: km * 1000 + 211.7, z: - km * 400 + 93.1 };
		const O = { x: Math.round( cam.x / STEP ) * STEP, z: Math.round( cam.z / STEP ) * STEP };
		// (the marbling's frame where an earlier wind left it)
		const wind = new Vector2( 0.35, 0.94 ).normalize();
		const M = { x: km * 700, z: 1234.5, along: 5021.3, across: - 777.7, wind: wind.clone(), spume: 3456.7 };
		foamKeys( O, M, wind, cam, keys );
		let most = 0, n = 0;
		for ( let k = 0; k < 400; k ++ ) {

			const x = cam.x + ( ( k * 37 ) % 97 - 48 ) * 1.013, z = cam.z + ( ( k * 61 ) % 89 - 44 ) * 0.977;
			const xL = f( x - O.x ), zL = f( z - O.z );
			LACE_NOISE.forEach( ( [ a, b ], i ) => {

				for ( const [ s, k0 ] of [ [ FROTH, KEY.froth ], [ ROWS, KEY.rows ] ] ) {

					const gpu = noiseK( f( f( xL * f( s ) ) * f( a ) ), f( f( zL * f( s ) ) * f( a ) ), keys[ k0 + i ] );
					most = Math.max( most, Math.abs( gpu - noise( a * s * x + b, a * s * z + b ) ) );
					n ++;

				}

			} );
			// (the marbling's frame: along and across the wind from M, scaled)
			const qx = f( f( f( xL * f( wind.x ) ) + f( zL * f( wind.y ) ) ) * f( MARBLE[ 0 ] ) );
			const qz = f( f( f( - xL * f( wind.y ) ) + f( zL * f( wind.x ) ) ) * f( MARBLE[ 1 ] ) );
			const Qx = ( ( x - M.x ) * wind.x + ( z - M.z ) * wind.y + M.along ) * MARBLE[ 0 ];
			const Qz = ( - ( x - M.x ) * wind.y + ( z - M.z ) * wind.x + M.across ) * MARBLE[ 1 ];
			MARBLE_NOISE.forEach( ( [ a, b ], i ) => {

				const gpu = noiseK( f( qx * f( a ) ), f( qz * f( a ) ), keys[ KEY.marble + i ] );
				most = Math.max( most, Math.abs( gpu - noise( a * Qx + b, a * Qz + b ) ) );
				n ++;

			} );
			// ((M15) a hurricane's spume, on the same frame unscaled, drifted down the wind)
			const sx = f( f( xL * f( wind.x ) ) + f( zL * f( wind.y ) ) ), sz = f( f( - xL * f( wind.y ) ) + f( zL * f( wind.x ) ) );
			const Sx = ( x - M.x ) * wind.x + ( z - M.z ) * wind.y + M.along - M.spume, Sz = - ( x - M.x ) * wind.y + ( z - M.z ) * wind.x + M.across;
			SPUME_NOISE.forEach( ( [ u, v, o ], i ) => {

				const gpu = noiseK( f( sx * f( u ) ), f( sz * f( v ) ), keys[ KEY.spume + i ] );
				most = Math.max( most, Math.abs( gpu - noise( u * Sx + o, v * Sz + o ) ) );
				n ++;

			} );
			LACE_NOISE.forEach( ( [ a, b ], i ) => {

				const gpu = noiseK( f( f( sx * f( SPUME_LACE ) ) * f( a ) ), f( f( sz * f( SPUME_LACE ) ) * f( a ) ), keys[ KEY.spume + 3 + i ] );
				most = Math.max( most, Math.abs( gpu - noise( a * SPUME_LACE * Sx + b, a * SPUME_LACE * Sz + b ) ) );
				n ++;

			} );

		}
		ok( most < 2e-3, `at ${ km } km: the foam's ${ n } noises keyed about the origin the world's within ${ most.toExponential( 1 ) }` );

	}

	// the wind turning: the frame moved to the camera, the marbling there as it was
	const cam = { x: 40211.7, z: - 15906.9 }, O = { x: 40448, z: - 15872 };
	const M = { x: 0, z: 0, along: 0, across: 0, wind: new Vector2( 0.35, 0.94 ).normalize() };
	const at = ( w ) => [ ( ( cam.x - M.x ) * w.x + ( cam.z - M.z ) * w.y + M.along ), ( - ( cam.x - M.x ) * w.y + ( cam.z - M.z ) * w.x + M.across ) ];
	const before = at( M.wind ), turned = new Vector2( 0.5, 0.8 ).normalize();
	foamKeys( O, M, turned, cam, keys );
	const after = at( turned );
	ok( Math.abs( before[ 0 ] - after[ 0 ] ) < 1e-6 && Math.abs( before[ 1 ] - after[ 1 ] ) < 1e-6 && M.x === cam.x, 'the wind turning: the marbling\'s frame moved to the camera, the marbling there unmoved' );

}

// the whitecaps' crests and cells tens of km out: about the origin (as the GPU finds them, keyed) the world's
{

	const waves = new Waves( { tier: 'mid' } );
	const caps = new Whitecaps( { waves } );
	const t = 1234.5;
	for ( const km of [ 5, 40, 60 ] ) {

		const O = { x: Math.round( km * 1000 / STEP ) * STEP, z: - Math.round( km * 300 / STEP ) * STEP };
		caps.place( O.x, O.z );
		let wrong = 0, most = 0, n = 0;
		CARRIERS.forEach( ( c, i ) => {

			const w = waves.waves[ c.wave ], A = waves.uniforms.waveA.value[ c.wave ], B = waves.uniforms.waveB.value[ c.wave ];
			const at = caps.uniforms.whitecapAt.value[ i ];
			for ( let k = 0; k < 300; k ++ ) {

				const x = O.x + 150.3 + ( ( k * 37 ) % 97 - 48 ) * 1.7, z = O.z - 120.9 + ( ( k * 61 ) % 89 - 44 ) * 1.3;
				const xL = f( x - O.x ), zL = f( z - O.z );
				// (wcCrest, wcAlong, in 32-bit floats; then the origin's added)
				const dot = f( f( f( A.x ) * xL ) + f( f( A.y ) * zL ) );
				const u = f( f( f( f( f( f( A.z ) * dot ) - f( f( A.w ) * f( t ) ) ) + f( B.z ) ) - f( 1.5707963 ) ) * f( 0.15915494 ) );
				const along = f( f( f( f( - A.y ) * xL ) + f( f( A.x ) * zL ) ) * f( f( A.z ) * f( 1 / ( 2 * Math.PI ) ) ) );
				const uk = f( u + f( at.x ) ), sk = f( along + f( at.z ) );
				const world = caps._crest( w, x, z, t );
				const fu = Math.floor( world.u ), fs = Math.floor( world.s );
				// (a crest's or a cell's edge within a float's step of it either way: either's right)
				const near = ( v ) => Math.abs( v - Math.round( v ) ) < 1e-3;
				if ( ! near( world.u ) && Math.floor( uk ) + at.y !== fu ) wrong ++;
				if ( ! near( world.s ) && Math.floor( sk ) + at.w !== fs ) wrong ++;
				most = Math.max( most, Math.abs( ( uk - Math.floor( uk ) ) - ( world.u - fu ) ) % 1, Math.abs( ( sk - Math.floor( sk ) ) - ( world.s - fs ) ) % 1 );
				n ++;

			}

		} );
		ok( wrong === 0 && most < 1e-3, `at ${ km } km: the whitecaps' crests and cells at ${ n } points about the origin the world's (${ wrong } wrong), within ${ most.toExponential( 1 ) } of one` );

	}

}

// the fishing line at 40 km: its ends where the GPU puts them (the view's matrix to its point and the ends
// about it, in 32-bit floats) where they are, to a tenth of a mm
{

	const m = createLineMaterial( 8 ), U = m.uniforms;
	const cam = new PerspectiveCamera( 70, 16 / 9, 0.1, 12000 );
	cam.position.set( 40064.37, 2.31, 15036.92 );
	cam.lookAt( 40070, 0.2, 15050 );
	cam.updateMatrixWorld();
	U.lineA.value.set( 40064.913, 3.402, 15037.661 );
	U.lineB.value.set( 40071.258, 0.113, 15049.874 );
	U.lineCtl.value.copy( U.lineA.value ).lerp( U.lineB.value, 0.5 ).y -= 0.4;
	const line = new Object3D();
	line.updateMatrixWorld();
	m.onBeforeRender( null, null, cam, null, line );
	// (its shader as three would compile it: the uniforms it's drawn with)
	const V = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>\n#include <worldpos_vertex>' };
	m.onBeforeCompile( V );
	const e = V.uniforms.lineView.value.elements.map( f );
	const mv = ( p ) => [ 0, 1, 2 ].map( ( r ) => f( f( f( f( e[ r ] * f( p.x ) ) + f( e[ 4 + r ] * f( p.y ) ) ) + f( e[ 8 + r ] * f( p.z ) ) ) + e[ 12 + r ] ) );
	let most = 0;
	for ( const [ local, world ] of [ [ V.uniforms.lineAL.value, U.lineA.value ], [ V.uniforms.lineBL.value, U.lineB.value ] ] ) {

		const want = world.clone().applyMatrix4( cam.matrixWorldInverse ), got = mv( local );
		most = Math.max( most, Math.abs( got[ 0 ] - want.x ), Math.abs( got[ 1 ] - want.y ), Math.abs( got[ 2 ] - want.z ) );

	}
	ok( most < 1e-4 && /lineView \* vec4\( transformed/.test( V.vertexShader ), `the fishing line at 40 km: its ends drawn within ${ ( most * 1000 ).toFixed( 3 ) } mm of where they are` );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
