#!/usr/bin/env node
// (M17) The ground the flats' fish follow the tide over, for game/Flats.js: for each feeding ground (FLATS_HOMES), a
// ray from the deepest water near it, through it, up to the shallowest near it (the bars' tops, the sandy shore; not into
// the mangroves' stand, where the prop roots are), and the ground along it every RAY_STEP m. game/Flats.js puts a school
// on its ray where the water's the depth it likes: up toward the shallows as the tide floods, back as it ebbs, as
// bonefish follow the tide's edge, tailing where it's a foot deep (docs/m17/sources-tide-fish.md). The fish are worked
// out from the clock alone, the same on every device, so the ground's baked in here as a table, from the 1 m bake with
// the flats cut in (each tier draws its own ground; test/flats.mjs checks low's is near it).
//   node tools/flats/ground.mjs          writes src/game/FlatsGround.js
//   feedRays( terrain ) -> [ { p: [ [ x, z ] deep, [ x, z ] home, [ x, z ] shallow ], g: [ cm, every RAY_STEP m from p[ 0 ] ],
//     off: [ x, z ]: off the edge, 2.5 m deep or more, nearest the deep end ] }
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flatsAt } from '../../src/world/terrain/Flats.js';
import { mangroveAt } from '../../src/world/terrain/Mangrove.js';
import { FLATS_HOMES } from '../../src/game/Flats.js';

export const RAY_STEP = 3; // m between the ground's samples
const UP = { reach: 200, top: 0.25, cost: 0.0006, land: 0.6, stand: 0.25 }; // the shallow leg: how far, as high as, per m, ...
const DOWN = { reach: 40 }; // the deep leg: the deepest within this of the ground (m), on the flat and off its creeks
const OFF = { deep: - 2.5, reach: 150 }; // where a fish off the flat at low water waits: this deep or deeper (m), off its edge, nearest the deep end
const DIRS = 64;
const _m = { stand: 0, creek: 0, fringe: 0, floor: 0, bed: 0 };
const r1 = ( v ) => Math.round( v * 10 ) / 10;

// the ground along a polyline every RAY_STEP m from its start
export function profile( terrain, p ) {

	const g = [];
	let carry = 0;
	for ( let i = 0; i < p.length - 1; i ++ ) {

		const [ ax, az ] = p[ i ], [ bx, bz ] = p[ i + 1 ], L = Math.hypot( bx - ax, bz - az );
		let s = carry;
		for ( ; s < L - 1e-9; s += RAY_STEP ) g.push( Math.round( terrain.heightAt( ax + ( bx - ax ) * s / L, az + ( bz - az ) * s / L ) * 100 ) );
		carry = s - L;

	}

	const [ x, z ] = p[ p.length - 1 ];
	g.push( Math.round( terrain.heightAt( x, z ) * 100 ) );
	return g;

}

export function feedRays( terrain ) {

	const out = [];
	for ( const [ hx, hz ] of FLATS_HOMES ) {

		// the shallow leg: the way the ground rises highest soonest, up to UP.top, stopping short of the stand
		let best = null;
		for ( let k = 0; k < DIRS; k ++ ) {

			const a = k / DIRS * Math.PI * 2, ux = Math.cos( a ), uz = Math.sin( a );
			let top = - Infinity, at = 0, end = 0;
			for ( let s = RAY_STEP; s <= UP.reach; s += RAY_STEP ) {

				const x = hx + ux * s, z = hz + uz * s;
				if ( mangroveAt( x, z, _m ).stand > UP.stand ) break;
				const h = terrain.heightAt( x, z );
				end = s;
				if ( h > top + 0.005 ) {

					top = h;
					at = s;

				}

				if ( h > UP.land ) break;

			}

			if ( ! end ) continue;
			const score = Math.min( top, UP.top ) - UP.cost * at;
			if ( ! best || score > best.score ) best = { score, x: r1( hx + ux * at ), z: r1( hz + uz * at ) };

		}

		// the deep leg: the deepest of the flat near it, off its creeks (where it drops back to as the tide falls)
		let deep = [ hx, hz ], low = terrain.heightAt( hx, hz );
		for ( let r = RAY_STEP; r <= DOWN.reach; r += RAY_STEP ) for ( let k = 0; k < DIRS; k ++ ) {

			const a = k / DIRS * Math.PI * 2, x = hx + Math.cos( a ) * r, z = hz + Math.sin( a ) * r, f = flatsAt( x, z );
			if ( f.on < 0.9 || f.creek > 0.3 || mangroveAt( x, z, _m ).creek > 0.1 || _m.stand > UP.stand ) continue;
			const h = terrain.heightAt( x, z );
			if ( h < low - 0.02 ) {

				low = h;
				deep = [ r1( x ), r1( z ) ];

			}

		}

		// off the edge, the nearest water this deep to the deep end (a permit on this ray waits there at low water)
		let off = null;
		for ( let r = RAY_STEP; r <= OFF.reach && ! off; r += RAY_STEP ) for ( let k = 0; k < DIRS && ! off; k ++ ) {

			const a = k / DIRS * Math.PI * 2, x = deep[ 0 ] + Math.cos( a ) * r, z = deep[ 1 ] + Math.sin( a ) * r;
			if ( flatsAt( x, z ).edge < 0 && terrain.heightAt( x, z ) <= OFF.deep ) off = [ r1( x ), r1( z ) ];

		}

		const p = [ deep, [ hx, hz ], [ best.x, best.z ] ];
		out.push( { p, g: profile( terrain, p ), off } );

	}

	return out;

}

if ( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) {

	const { TerrainData } = await import( '../../src/world/TerrainData.js' );
	const { decodeIsland } = await import( '../../src/world/terrain/IslandDecode.js' );
	const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../../public/world/island.bin', import.meta.url ) ) ) ) );
	const rays = feedRays( terrain );
	const lines = rays.map( ( r ) => `\t{ p: ${ JSON.stringify( r.p ).replace( /,/g, ', ' ) }, off: ${ JSON.stringify( r.off ).replace( /,/g, ', ' ) }, g: [ ${ r.g.join( ', ' ) } ] },` );
	writeFileSync( new URL( '../../src/game/FlatsGround.js', import.meta.url ), `// (M17) Made by tools/flats/ground.mjs from public/world/island.bin with the flats cut in: run it again, don't edit this,
// when the flats' ground or FLATS_HOMES change (test/flats.mjs says when). For each of game/Flats.js' feeding grounds,
// a ray from the deepest water near it (p[ 0 ]), through it (p[ 1 ]), to the shallowest near it (p[ 2 ]: a bar's top or
// the shore, short of the mangroves' stand), the ground along it (g: cm, every RAY_STEP m from p[ 0 ]), and off: the
// nearest water off the flat's edge 2.5 m deep or more to its deep end (where a permit on it waits at low water).
export const RAY_STEP = ${ RAY_STEP };
export const FEED_RAYS = [
${ lines.join( '\n' ) }
];
` );
	for ( const r of rays ) {

		const L = ( r.g.length - 1 ) * RAY_STEP;
		console.log( `  ${ JSON.stringify( r.p[ 1 ] ) }: ${ L } m, from ${ ( Math.min( ...r.g ) / 100 ).toFixed( 2 ) } up to ${ ( Math.max( ...r.g ) / 100 ).toFixed( 2 ) } m (deep end ${ JSON.stringify( r.p[ 0 ] ) }, shallow end ${ JSON.stringify( r.p[ 2 ] ) })` );

	}

	console.log( `wrote src/game/FlatsGround.js: ${ rays.length } rays` );

}
