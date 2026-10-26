// (M11) Plain-node tests of the cover map's CPU side (world/Cover.js): its heights to the centimetre,
// what each cover is, nothing off the map or before it's built, and what's under a roof. The map itself
// is drawn on the GPU (CoverMap.build); here it's laid out by hand, a texel at a time, as the pass
// writes them.
import { CoverMap, COVER, NO_COVER, encodeHeight, decodeHeight, surroundings } from '../src/world/Cover.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---- the heights as the map keeps them
ok( [ - 5.31, 0, 0.004, 2.79, 31.5 ].every( ( y ) => Math.abs( decodeHeight( encodeHeight( y ) ) - y ) <= 0.005 ), 'a height comes back to the centimetre' );
ok( encodeHeight( - 500 ) === 1 && encodeHeight( 1e4 ) === 65535 && decodeHeight( 0 ) === NO_COVER, 'out of range it clamps; 0 is nothing' );

// ---- before it's built: nothing covers anything
const cover = new CoverMap();
ok( cover.heightAt( 0, 0 ) === NO_COVER && cover.kindAt( 0, 0 ) === COVER.NONE && ! cover.over( 0, 0, 0 ), 'before it\'s built nothing covers anything' );
ok( cover.uniforms.coverSize.value.x === 0, 'and the GPU reads nothing either (its size is 0)' );

// ---- a map: 10 x 6 texels of 0.5 m from ( -2, 3 ); a pier deck at 2.8 m along row 1, a tin roof at 6.4 m
// over texels ( 6..8, 3..4 )
const W = 10, H = 6, T = 0.5, X0 = - 2, Z0 = 3;
const data = new Uint8Array( W * H * 4 );
const put = ( i, j, y, kind ) => {

	const v = encodeHeight( y ), k = ( j * W + i ) * 4;
	data[ k ] = v >> 8;
	data[ k + 1 ] = v & 255;
	data[ k + 2 ] = kind;
	data[ k + 3 ] = 255;

};
for ( let i = 0; i < W; i ++ ) put( i, 1, 2.8, COVER.WOOD );
for ( let i = 6; i <= 8; i ++ ) for ( let j = 3; j <= 4; j ++ ) put( i, j, 6.4, COVER.TIN );
cover.setData( data, W, H, X0, Z0, T );
const at = ( i, j ) => [ X0 + ( i + 0.5 ) * T, Z0 + ( j + 0.5 ) * T ];

ok( Math.abs( cover.heightAt( ...at( 3, 1 ) ) - 2.8 ) < 0.005 && cover.kindAt( ...at( 3, 1 ) ) === COVER.WOOD, 'the pier\'s deck: its height and its wood' );
ok( Math.abs( cover.heightAt( ...at( 7, 4 ) ) - 6.4 ) < 0.005 && cover.kindAt( ...at( 7, 4 ) ) === COVER.TIN, 'the roof: its height and its tin' );
ok( cover.heightAt( ...at( 3, 3 ) ) === NO_COVER && cover.kindAt( ...at( 3, 3 ) ) === COVER.NONE, 'open ground: nothing over it' );
ok( cover.heightAt( X0 - 0.01, Z0 + 1 ) === NO_COVER && cover.heightAt( X0 + W * T + 0.01, Z0 + 0.6 ) === NO_COVER && cover.heightAt( 0, Z0 + H * T ) === NO_COVER, 'off the map: nothing' );
// (each texel's edges: its own from its first centimetre to its last)
ok( cover.kindAt( X0 + 6 * T, Z0 + 3 * T ) === COVER.TIN && cover.kindAt( X0 + 6 * T - 0.001, Z0 + 3 * T ) === COVER.NONE, 'an eave\'s edge is sharp: a texel is its own to its edge' );

// ---- under it
const [ rx, rz ] = at( 7, 3 );
ok( cover.over( rx, 1.6, rz ) && ! cover.over( rx, 6.4, rz ) && ! cover.over( rx, 6.35, rz ), 'under the roof something\'s over you; on it, nothing (within a hand\'s breadth)' );
const [ px, pz ] = at( 4, 1 );
ok( cover.over( px, 0.5, pz ) && ! cover.over( px, 2.8, pz ), 'under the pier\'s deck you\'re covered, standing on it you\'re not' );

// ---- the seams between planks: a hole a texel across between two covers at about one height is closed;
// a wider gap, a step down from a roof to a deck, and open ground aren't
const seams = new Uint8Array( 7 * 3 * 4 );
const lay = ( i, j, y, kind ) => {

	const v = encodeHeight( y ), k = ( j * 7 + i ) * 4;
	seams[ k ] = v >> 8;
	seams[ k + 1 ] = v & 255;
	seams[ k + 2 ] = kind;
	seams[ k + 3 ] = 255;

};
// row 1: plank, hole, plank (2.80 and 2.84 m), hole, hole, plank, roof edge (6 m) beside it
lay( 0, 1, 2.8, COVER.WOOD ); lay( 2, 1, 2.84, COVER.WOOD ); lay( 5, 1, 2.8, COVER.WOOD ); lay( 6, 1, 6, COVER.TIN );
// (a texel under a step: deck at 2.8 below, a roof at 6 above it)
lay( 3, 0, 2.8, COVER.WOOD ); lay( 3, 2, 6, COVER.TIN );
const seamMap = new CoverMap();
const n = CoverMap.close( seams, 7, 3 );
seamMap.setData( seams, 7, 3, 0, 0, 1 );
ok( n === 1 && Math.abs( seamMap.heightAt( 1.5, 1.5 ) - 2.82 ) < 0.006 && seamMap.kindAt( 1.5, 1.5 ) === COVER.WOOD, 'a hole a texel across between two planks is closed, between their heights' );
ok( seamMap.heightAt( 3.5, 1.5 ) === NO_COVER && seamMap.heightAt( 4.5, 1.5 ) === NO_COVER, 'a gap two texels across stays open, and a step up to a roof isn\'t bridged' );

// ---- what the rain falls on about a listener: a pier (wood, 2.3 m) over the sea west of x = 0 (the ground
// at -2 there, 1 m east of it), and a tin roof at 5 m on the land
const around = new Uint8Array( 80 * 80 * 4 );
const lay2 = ( i, j, y, kind ) => {

	const v = encodeHeight( y ), k = ( j * 80 + i ) * 4;
	around[ k ] = v >> 8;
	around[ k + 1 ] = v & 255;
	around[ k + 2 ] = kind;
	around[ k + 3 ] = 255;

};
const cell = ( x ) => Math.floor( ( x + 20 ) / 0.5 );
for ( let i = cell( - 12 ); i < cell( - 9 ); i ++ ) for ( let j = 0; j < 80; j ++ ) lay2( i, j, 2.3, COVER.WOOD );
for ( let i = cell( 8 ); i < cell( 14 ); i ++ ) for ( let j = cell( - 3 ); j < cell( 3 ); j ++ ) lay2( i, j, 5, COVER.TIN );
const island = new CoverMap();
island.setData( around, 80, 80, - 20, - 20, 0.5 );
const terrainAt = ( x ) => ( x < 0 ? - 2 : 1 );
const onPier = surroundings( island, terrainAt, 0, - 10.5, 3.9, 0 );
ok( onPier.nearWood > 0.3 && onPier.nearWater > 0.3 && onPier.wood > 0.1 && onPier.water > 0.5 && onPier.under === 0, `on the pier: wood under you, the sea about you, nothing over you (${ JSON.stringify( onPier, ( k, v ) => typeof v === 'number' ? + v.toFixed( 2 ) : v ) })` );
const underPier = surroundings( island, terrainAt, 0, - 10.5, 0.2, 0 );
ok( underPier.under > 0.3, 'swimming under the pier, its deck is over you' );
const underRoof = surroundings( island, terrainAt, 0, 11, 2.6, 0 );
ok( underRoof.under > 0.5 && underRoof.water === 0 && underRoof.wood === 0, 'under the roof: covered, no sea, no wood' );
const beach = surroundings( island, terrainAt, 0, 4, 2.6, 15 );
ok( beach.under === 0 && beach.wood === 0 && beach.water > 0 && beach.nearWater === 0, 'on the beach: the sea a few metres off, nothing right by, nothing over you' );

// ---- the GPU's view of it matches
const U = cover.uniforms;
ok( U.coverSize.value.x === W && U.coverSize.value.y === H && U.coverInfo.value.x === X0 && U.coverInfo.value.y === Z0 && U.coverInfo.value.z === 1 / T, 'the shader reads the same map: its size, origin and texel' );
ok( U.coverMap.value.image.data === data, 'and the same bytes (one copy, shared with the CPU)' );

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
