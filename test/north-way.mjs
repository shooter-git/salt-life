// (M16) The way over to the north beach made easy to find, under Node: worn into the ground's map as one path from
// the square to the beach on both islands, nothing placed or cut by it; nothing growing on its valley stretch; its
// fingerposts up, at the turns, on the ground beside it, each arm readable from the way you come to it and saying
// a true distance, two draws a post and none out of reading range; and pencilled on the map from the start.
//
//   node test/north-way.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { halfIsland } from '../src/world/terrain/IslandBake.js';
import { bakeTerrainMaps } from '../src/world/terrain/TerrainBake.js';
import { TRAIL, VALLEY, WAY, POST_SPOTS, trailClears, wearWay } from '../src/world/terrain/NorthTrail.js';
import { polylineDistance } from '../src/world/terrain/IslandShape.js';
import { TRAIL_POSTS, SIGNPOST, Signpost } from '../src/game/Signpost.js';
import { drawWay } from '../src/game/ChartBake.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );

// ---- worn as one path, on both islands, as the ground's shader reads it (a 2 m map, filtered; it starts to show at
// 0.28, and it's whole at 0.62)
for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, decodeIsland( read( file ) ) );
	const masks = T.path.slice();
	const src = T.res > 1024 ? { ...halfIsland( T ), texel: T.texel * 2, origin: T.origin, pads: T.pads } : T;
	const { splat } = bakeTerrainMaps( src );
	check( T.path.every( ( v, k ) => v === masks[ k ] ), `${ file }: the mask the rocks, the plants and the debris read isn't touched` );
	const { res, texel: t, origin: o } = src;
	const at = ( x, z ) => {

		const fx = ( x - o ) / t - 0.5, fz = ( z - o ) / t - 0.5, i = Math.floor( fx ), j = Math.floor( fz ), a = fx - i, b = fz - j;
		const g = ( q, p ) => splat[ ( p * res + q ) * 4 + 1 ] / 255;
		return ( g( i, j ) * ( 1 - a ) + g( i + 1, j ) * a ) * ( 1 - b ) + ( g( i, j + 1 ) * ( 1 - a ) + g( i + 1, j + 1 ) * a ) * b;

	};
	let n = 0, weak = 0, none = 0, run = 0, longest = 0;
	for ( let k = 1; k < WAY.length; k ++ ) {

		const [ ax, az ] = WAY[ k - 1 ], [ bx, bz ] = WAY[ k ], L = Math.hypot( bx - ax, bz - az );
		for ( let s = 0; s < L; s ++ ) {

			const x = ax + ( bx - ax ) * s / L, z = az + ( bz - az ) * s / L;
			// (not on the beach's sand at its foot, which it isn't worn into)
			if ( T.heightAt( x, z ) < 4 ) {

				run = 0;
				continue;

			}

			const v = at( x, z );
			n ++;
			if ( v < 0.55 ) weak ++;
			if ( v < 0.28 ) none ++;
			run = v < 0.55 ? run + 1 : 0;
			longest = Math.max( longest, run );

		}

	}

	check( n > 1400 && none === 0 && longest <= 2, `${ file }: one path, ${ n } m of it above the beach, nowhere missing, ${ weak } m thin, its longest thin stretch ${ longest } m` );
	const t0 = performance.now();
	wearWay( new Uint8Array( res * res * 4 ), res, o, t, src.heights );
	const ms = performance.now() - t0;
	check( ms < 40, `${ file }: worn in ${ ms.toFixed( 1 ) } ms as the map's baked` );

}

// ---- what's on its valley stretch comes off it, nothing further away
check( VALLEY.at( - 1 )[ 0 ] === TRAIL.pts[ 0 ][ 0 ] && VALLEY.at( - 1 )[ 1 ] === TRAIL.pts[ 0 ][ 1 ], 'the valley\'s stretch runs up to where the way over leaves it' );
check( VALLEY.every( ( [ x, z ] ) => trailClears( x, z ) ) && ! trailClears( 53, - 150 ) && ! trailClears( 60, - 200 ), 'nothing grows on the valley\'s stretch, nor a few metres off it' );

// ---- the fingerposts
{

	const T = new TerrainData( 7, decodeIsland( read( 'island-1024.bin' ) ) );
	const along = ( x, z ) => {

		let best = Infinity, at = 0, acc = 0;
		for ( let k = 1; k < WAY.length; k ++ ) {

			const [ d, s ] = polylineDistance( [ WAY[ k - 1 ], WAY[ k ] ], x, z );
			if ( d < best ) {

				best = d;
				at = acc + s;

			}

			acc += Math.hypot( WAY[ k ][ 0 ] - WAY[ k - 1 ][ 0 ], WAY[ k ][ 1 ] - WAY[ k - 1 ][ 1 ] );

		}

		return { d: best, at, total: acc };

	};
	const posts = TRAIL_POSTS.filter( ( p ) => p.z < - 110 );
	let beside = true, ground = true, reads = true, far = 0;
	for ( const p of posts ) {

		const { d, at, total } = along( p.x, p.z );
		if ( d > 6 || d < 1.2 ) beside = false;
		if ( T.heightAt( p.x, p.z ) < 1 ) ground = false;
		// the arm on: not edge on to whoever's walking up to it along the way
		const q = at - 8, here = pointAt( q ), a = Math.atan2( - ( p.z - here[ 1 ] ), p.x - here[ 0 ] );
		const off = Math.abs( Math.sin( p.arms[ 0 ].toward - a ) );
		if ( off < 0.45 ) {

			reads = false;
			console.log( `     post at ${ p.x }, ${ p.z }: its first arm's ${ off.toFixed( 2 ) } of side on` );

		}

		// and what it says of the way on: true to within a fifth (a km's figure given to 0.1, m to 10)
		const say = p.arms[ 0 ].sub.match( /([\d.]+) (km|m)/ );
		if ( say ) {

			const m = Number( say[ 1 ] ) * ( say[ 2 ] === 'km' ? 1000 : 1 ), left = total - at;
			if ( Math.abs( m - left ) > Math.max( 0.2 * left, 60 ) ) {

				far ++;
				console.log( `     post at ${ p.x }, ${ p.z } says ${ m } m on: it's ${ left.toFixed( 0 ) } m` );

			}

		}

	}

	check( POST_SPOTS.every( ( [ x, z ] ) => TRAIL_POSTS.some( ( p ) => p.x === x && p.z === z ) && trailClears( x + 1.5, z ) ) && posts.filter( ( p ) => POST_SPOTS.some( ( q ) => q[ 0 ] === p.x && q[ 1 ] === p.z ) ).length === POST_SPOTS.length, 'nothing grows about those among the plants' );
	check( beside && ground, `${ posts.length } fingerposts along it, each on the ground a step or two off the tread` );
	check( reads, 'each one\'s arm on is side on enough to read from the way you come to it' );
	check( far === 0, 'each says how far it is, truly' );
	// a post at every turn that doubles back above the gully, within a walker's sight of it
	let missed = 0;
	const P = TRAIL.pts;
	for ( let n = 1; n < P.length - 1; n ++ ) {

		const ux = P[ n ][ 0 ] - P[ n - 1 ][ 0 ], uz = P[ n ][ 1 ] - P[ n - 1 ][ 1 ], vx = P[ n + 1 ][ 0 ] - P[ n ][ 0 ], vz = P[ n + 1 ][ 1 ] - P[ n ][ 1 ];
		const c = ( ux * vx + uz * vz ) / ( Math.hypot( ux, uz ) * Math.hypot( vx, vz ) );
		if ( c < 0.1 && P[ n ][ 1 ] > - 700 && ! posts.some( ( p ) => Math.hypot( p.x - P[ n ][ 0 ], p.z - P[ n ][ 1 ] ) < 30 ) ) missed ++;

	}

	check( missed === 0, 'a post at every sharp turn on the way across the plateau' );
	function pointAt( s ) {

		let acc = 0;
		for ( let k = 1; k < WAY.length; k ++ ) {

			const L = Math.hypot( WAY[ k ][ 0 ] - WAY[ k - 1 ][ 0 ], WAY[ k ][ 1 ] - WAY[ k - 1 ][ 1 ] );
			if ( s <= acc + L ) return [ WAY[ k - 1 ][ 0 ] + ( WAY[ k ][ 0 ] - WAY[ k - 1 ][ 0 ] ) * Math.max( 0, s - acc ) / L, WAY[ k - 1 ][ 1 ] + ( WAY[ k ][ 1 ] - WAY[ k - 1 ][ 1 ] ) * Math.max( 0, s - acc ) / L ];
			acc += L;

		}

		return WAY.at( - 1 );

	}

	// two draws, and none out of range (a page's canvas stood in)
	const ctx = new Proxy( {}, { get: ( o, k ) => k in o ? o[ k ] : () => {}, set: ( o, k, v ) => ( o[ k ] = v, true ) } );
	globalThis.document = { createElement: () => ( { width: 0, height: 0, getContext: () => ctx } ) };
	const terrain = { heightAt: ( x, z ) => T.heightAt( x, z ) };
	for ( const spec of [ null, ...TRAIL_POSTS ] ) {

		const s = new Signpost( { terrain, spec } );
		const meshes = s.group.children.filter( ( c ) => c.isMesh ).length;
		if ( meshes !== 2 ) check( false, `a post at ${ s.spec.x } is ${ meshes } draws` );
		s.update( s.spec.x + s.spec.see - 1, s.spec.z );
		const near = s.group.visible;
		s.update( s.spec.x + s.spec.see + 1, s.spec.z );
		if ( ! near || s.group.visible ) check( false, `a post at ${ s.spec.x } isn't drawn by its range` );

	}

	check( true, `each of the ${ TRAIL_POSTS.length + 1 } posts two draws, and none past its reading range` );
	delete globalThis.document;

}

// ---- on the map, from the start
{

	const calls = [], ctx = { save() {}, restore() {}, beginPath() {}, setLineDash( d ) { calls.push( [ 'dash', d ] ); }, moveTo( x, y ) { calls.push( [ 'to', x, y ] ); }, lineTo( x, y ) { calls.push( [ 'to', x, y ] ); }, stroke() { calls.push( [ 'stroke' ] ); } };
	drawWay( ctx, - 100, - 1000, 0.5 );
	const pts = calls.filter( ( c ) => c[ 0 ] === 'to' );
	check( pts.length === WAY.length && calls.filter( ( c ) => c[ 0 ] === 'stroke' ).length === 2 && calls.some( ( c ) => c[ 0 ] === 'dash' ), 'the map\'s line follows the whole way, dashed over a pale edge' );
	check( pts[ 0 ][ 1 ] === ( VALLEY[ 0 ][ 0 ] + 100 ) * 0.5 && pts.at( - 1 )[ 2 ] === ( WAY.at( - 1 )[ 1 ] + 1000 ) * 0.5, 'from the square to the beach, at the sheet\'s scale' );
	const src = readFileSync( new URL( '../src/game/Minimap.js', import.meta.url ), 'utf8' );
	check( src.indexOf( 'drawWay( ctx' ) > src.indexOf( 'ctx.drawImage( s.mask' ), 'drawn over the blank of what you haven\'t charted, so it\'s there from the start' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
