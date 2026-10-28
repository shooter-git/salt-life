// (M14) Plain-node tests of the rock cover's CPU side (world/RockCover.js): the tops and the undersides
// to the centimetre, what's under a rock's overhang and what isn't, nothing off the map or before it's
// drawn, the rain's sound under one (Cover.surroundings), and the rocks it's drawn from (Rocks.around, on
// the real island). The map itself is drawn on the GPU (RockCover.update); here it's laid out by hand, a
// texel at a time, as the passes write them: the tops in its left half, in its right the undersides of
// the topmost layer of rock (the peeling pass's).
import { readFileSync } from 'node:fs';
import * as THREE from '../src/engine/index.js';
import { RockCover, ROCK_TEXEL } from '../src/world/RockCover.js';
import { CoverMap, NO_COVER, encodeHeight, surroundings } from '../src/world/Cover.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Rocks } from '../src/world/Rocks.js';
import { Village } from '../src/world/Village.js';
import { Colliders } from '../src/world/Colliders.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---- before it's drawn: no rock over anything
const rocks = new RockCover();
ok( rocks.topAt( 0, 0 ) === NO_COVER && rocks.bottomAt( 0, 0 ) === NO_COVER && ! rocks.over( 0, 0, 0 ), 'before it\'s drawn no rock is over anything' );
ok( rocks.uniforms.rockCoverInfo.value.w === 0, 'and the GPU reads none either (its size is 0)' );

// ---- a map from ( 10, -20 ): an overhang 6 m square (its underside 1.9 m over the ground at 0, its top
// 3.2 m) over texels ( 40..87, 40..87 ), and a boulder sitting on the ground (top 2.5, sunk to -0.6) over
// ( 120..135, 40..55 )
const N = rocks.side, X0 = 10, Z0 = - 20;
const data = new Uint8Array( N * 2 * N * 4 );
const put = ( i, j, top, bottom ) => {

	for ( const [ y, o ] of [ [ top, 0 ], [ bottom, N ] ] ) {

		const v = encodeHeight( y ), k = ( j * N * 2 + i + o ) * 4;
		data[ k ] = v >> 8;
		data[ k + 1 ] = v & 255;
		data[ k + 2 ] = 5;
		data[ k + 3 ] = 255;

	}

};
for ( let j = 40; j < 88; j ++ ) for ( let i = 40; i < 88; i ++ ) put( i, j, 3.2, 1.9 );
for ( let j = 40; j < 56; j ++ ) for ( let i = 120; i < 136; i ++ ) put( i, j, 2.5, - 0.6 );
rocks.setData( data, X0, Z0 );
const at = ( i, j ) => [ X0 + ( i + 0.5 ) * ROCK_TEXEL, Z0 + ( j + 0.5 ) * ROCK_TEXEL ];

ok( Math.abs( rocks.topAt( ...at( 60, 60 ) ) - 3.2 ) < 0.005 && Math.abs( rocks.bottomAt( ...at( 60, 60 ) ) - 1.9 ) < 0.005, 'the overhang: its top and its underside, to the centimetre' );
ok( Math.abs( rocks.topAt( ...at( 128, 48 ) ) - 2.5 ) < 0.005 && Math.abs( rocks.bottomAt( ...at( 128, 48 ) ) + 0.6 ) < 0.005, 'the boulder: its top, and its foot under the ground' );
ok( rocks.topAt( ...at( 20, 20 ) ) === NO_COVER && rocks.bottomAt( ...at( 20, 20 ) ) === NO_COVER, 'open ground: no rock over it' );
ok( rocks.topAt( X0 - 0.01, Z0 + 1 ) === NO_COVER && rocks.topAt( X0 + N * ROCK_TEXEL + 0.01, Z0 + 1 ) === NO_COVER && rocks.topAt( X0 + 1, Z0 + N * ROCK_TEXEL + 0.01 ) === NO_COVER, 'off the map: nothing' );
// (each texel's edges: its own from its first centimetre to its last)
ok( rocks.topAt( X0 + 40 * ROCK_TEXEL, Z0 + 50 * ROCK_TEXEL ) > 3 && rocks.topAt( X0 + 40 * ROCK_TEXEL - 0.001, Z0 + 50 * ROCK_TEXEL ) === NO_COVER, 'an overhang\'s lip is sharp: a texel is its own to its edge' );

// ---- under it
const [ ox, oz ] = at( 64, 64 ), [ bx, bz ] = at( 128, 48 ), [ fx, fz ] = at( 137, 48 ), [ ex, ez ] = at( 200, 200 );
ok( rocks.over( ox, 0, oz ) && rocks.over( ox, 1.6, oz ) && ! rocks.over( ox, 1.85, oz ), 'under the overhang a rock\'s over you, from the ground to just under it' );
ok( ! rocks.over( ox, 3.2, oz ), 'standing on its top, nothing is' );
ok( ! rocks.over( bx, 2.5, bz ) && ! rocks.over( fx, 0, fz ), 'nor on the boulder, nor at its foot beside it' );

// ---- the rain's sound under it (Cover.surroundings: your spot and 3 m about you)
const none = new CoverMap(), flat = () => 0;
const under = surroundings( none, flat, - 1, ox, 0, oz, {}, rocks );
ok( under.under === 1 && under.tin === 0 && under.water === 0, `under the overhang it's all over you, none of it tin (${ under.under })` );
const open = surroundings( none, flat, - 1, ex, 0, ez, {}, rocks );
ok( open.under === 0, 'in the open, nothing is' );
const top = surroundings( none, flat, - 1, ox, 3.2, oz, {}, rocks );
ok( top.under === 0, 'nor standing on it' );
const sea = surroundings( none, () => - 3, 0, ox, 0.5, oz, {}, rocks );
ok( sea.nearWater < 1 && sea.under > 0, `a rock standing out of the sea: the rain on it isn't on the sea, and under it you're covered (${ sea.nearWater.toFixed( 2 ) })` );
// (an overhang standing out of the sea, its foot running on under it and the water: the map has the
// underside of its top layer, the roof over you (1.45), not the foot's under the sea, over
// ( 160..199, 120..159 ))
for ( let j = 120; j < 160; j ++ ) for ( let i = 160; i < 200; i ++ ) put( i, j, 1.6, 1.45 );
const [ sx, sz ] = at( 180, 140 );
const wading = surroundings( none, () => - 0.3, 0, sx, - 0.3, sz, {}, rocks );
ok( wading.under > 0 && rocks.over( sx, - 0.3, sz ) && rocks.over( sx, 1.1, sz ), `wading under a sea rock's overhang, its foot under the water and you: covered where you stand (${ wading.under.toFixed( 2 ) }: 3 m out is past its 5 m)` );
const plain = surroundings( none, flat, - 1, ox, 0, oz, {} );
ok( plain.under === 0, 'without the rocks, as before M14: nothing over you' );

// ---- the rocks it's drawn from, on the real island as the low tier has it (Rocks.around): placed as the
// game places them, clear of the village (its textures aren't baked here: no GPU)
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const colliders = new Colliders(), village = new Village( { scene: new THREE.Scene(), terrain, colliders, tier: 'low' } );
village.textures.bake = async () => {};
await village.init( null );
const island = new Rocks( { scene: new THREE.Scene(), terrain, colliders, village } );
const near = island.around( 483, - 314, 515, - 282 );
ok( near.length > 0 && near.every( ( r ) => r.geometry && r.geometry.attributes.position && r.matrix.isMatrix4 ), `the rocks about a spot on the east hills: ${ near.length }, each its shape and where it is` );
// (the slab at ( 499, -298 ): on this island the one rock with room to stand under it, 2 m of it)
const slab = island.instances.find( ( r ) => Math.hypot( r.x - 499.2, r.z + 298.1 ) < 0.5 );
ok( slab && near.some( ( r ) => r.matrix === slab.matrix ), 'among them the slab on the hillside you can stand under' );
ok( island.around( - 30, 230, 2, 262 ).length === 0, 'out at sea in deep water, none' );
const all = island.around( - 1e4, - 1e4, 1e4, 1e4 );
ok( all.length < island.instances.length && all.length > island.instances.length * 0.6, `the rain may fall on ${ all.length } of the ${ island.instances.length } (not on the seabed's)` );
// (a square takes the rocks reaching into it: one just outside, its edge over it, is drawn)
const edge = island.instances.find( ( r ) => r.y + r.size * r.sy > - 3 && r.radius > 2 );
ok( island.around( edge.x + edge.radius - 0.5, edge.z - 1, edge.x + edge.radius + 20, edge.z + 1 ).some( ( r ) => r.matrix === edge.matrix ), 'a rock whose edge reaches into the square is drawn into it' );

console.log( fails ? `\n${ fails } FAILED` : '\nall ok' );
process.exit( fails ? 1 : 0 );
