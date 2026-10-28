// (M14) The boat's radar (world/boat/Radar.js): the island as the beam sees it from her (the coast, the
// slopes facing her, nothing behind a ridge), the rain where it rains, another boat as a short arc, the
// sweep painting only what it's swept, the ranges, and its colours.
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { BoatRadar, echoColour, RANGES, NM } from '../src/world/boat/Radar.js';

let failed = 0;
const ok = ( c, label ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! c ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const BEARINGS = 720, BINS = 160;
// a radar at ( x, z ), heading north, its range, swept for s seconds (its array at 24 rpm)
const swept = ( x, z, range, { s = 2.6, rainAt = null, boats = [], sea = 0 } = {} ) => {

	const r = new BoatRadar( { terrain, size: 16 } );
	r.range = range;
	for ( let t = 0; t < s; t += 1 / 60 ) r.update( 1 / 60, { x, z, heading: 0, beam: ( t * 24 / 60 * Math.PI * 2 ) % ( Math.PI * 2 ), sea, rainAt, boats } );
	return r;

};
// the echo at a true bearing (deg) and range (m)
const at = ( r, deg, m ) => r.picture[ ( Math.round( deg / 360 * BEARINGS ) % BEARINGS ) * BINS + Math.min( BINS - 1, Math.floor( m / ( r.nm * NM ) * BINS ) ) ];
const max = ( r, deg, m0, m1 ) => {

	let e = 0;
	for ( let m = m0; m <= m1; m += r.nm * NM / BINS ) e = Math.max( e, at( r, deg, m ) );
	return e;

};

// from the bay (between the island's arms, south of the beach): the island all about her, open water south
{

	const r = swept( 60, 150, 3 );
	const ahead = max( r, 0, 150, 600 ), south = max( r, 180, 400, 2700 ), shore = [ 330, 0, 30 ].map( ( d ) => max( r, d, 100, 1500 ) );
	console.log( `     from the bay at 1.5 NM: the beach ahead ${ ahead.toFixed( 2 ) }, open water south ${ south.toFixed( 2 ) }` );
	ok( ahead > 0.6 && shore.every( ( e ) => e > 0.4 ) && south < 0.1, 'from the bay, the island returns all about her ahead, the open water south of her none' );

}

// off the north shore, looking at it: the coast strong; the mountain's face behind it; nothing behind its
// summit (its shadow)
{

	const r = swept( 0, - 1050, 2 );
	const coast = max( r, 180, 120, 300 ), face = max( r, 180, 380, 560 ), behind = max( r, 180, 700, 1000 );
	console.log( `     off the north shore: its coast ${ coast.toFixed( 2 ) }, the mountain's face ${ face.toFixed( 2 ) }, behind its summit ${ behind.toFixed( 2 ) }` );
	ok( coast > 0.8 && face > 0.4 && behind < 0.05, 'the coast and the slopes facing her return, nothing behind the summit' );

}

// the rain where it rains, as hard as it does; another boat as an arc a beam wide; the sea's clutter about her
{

	const rainAt = ( x, z ) => Math.hypot( x - 2000, z - 3000 ) < 800 ? 0.9 : 0;
	const r = swept( 0, 3000, 4, { rainAt, boats: [ { x: 0, z: 2000 } ], sea: 0.8 } );
	const wet = max( r, 90, 1400, 2600 ), dry = max( r, 270, 1400, 2600 ), boat = max( r, 0, 950, 1050 ), beside = max( r, 6, 950, 1050 );
	const clutter = max( r, 120, 30, 200 ), far = max( r, 120, 800, 1200 );
	console.log( `     the rain ${ wet.toFixed( 2 ) } (none ${ dry.toFixed( 2 ) }); a boat 1 km off ${ boat.toFixed( 2 ) }, 6° off it ${ beside.toFixed( 2 ) }; the sea about her ${ clutter.toFixed( 2 ) }, far off ${ far.toFixed( 2 ) }` );
	ok( wet > 0.3 && dry === 0, 'a shower returns where it rains' );
	ok( boat > 0.9 && beside === 0, 'another boat is an arc as wide as the beam' );
	ok( clutter > 0.1 && far === 0, 'in a rough sea the clutter\'s about her' );

}

// the sweep paints as it goes: a quarter turn, a quarter of the bearings; a new range is painted afresh
{

	const r = swept( 60, 150, 3, { s: 2.5 / 4 } );
	let painted = 0;
	for ( let b = 0; b < BEARINGS; b ++ ) {

		let any = false;
		for ( let k = 0; k < BINS && ! any; k ++ ) any = r.picture[ b * BINS + k ] > 0;
		if ( any ) painted ++;

	}

	ok( painted < BEARINGS * 0.35, `a quarter turn paints about a quarter of the picture (${ ( painted / BEARINGS * 100 ).toFixed( 0 ) }% has an echo)` );
	r.step( 1 );
	ok( r.picture.every( ( v ) => v === 0 ) && r.nm === RANGES[ 4 ][ 0 ], 'a new range is painted afresh' );
	r.range = 0;
	ok( ! r.step( - 1 ) && r.range === 0, 'and they stop at the shortest' );

}

// the colours: black below a faint echo, blue where faint, magenta and pink where strong
{

	const faint = echoColour( 0.3 ), strong = echoColour( 0.9 );
	ok( echoColour( 0.05 ).every( ( v ) => v === 0 ) && faint[ 2 ] > faint[ 0 ] && strong[ 0 ] > strong[ 2 ], 'faint echoes blue, strong ones magenta and pink' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
