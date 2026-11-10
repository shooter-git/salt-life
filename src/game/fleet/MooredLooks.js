import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute } from '../../engine/index.js';

// (M16) A boat you own and aren't in, as she looks: her own model baked small (tools/moored-bake.mjs writes
// public/boats/moored/<id>.bin), a few thousand triangles in one mesh, her colours in its vertices. What can be fitted to
// her is kept apart in it, so it comes and goes as her model's does, and her topsides take her paint. Her frame's a
// Vessel's: +Z forward, y = 0 her waterline. MooredBoats draws it near, and the stand-in (MooredModels.js) further off.
//
//   readLook( arrayBuffer ) -> the file, read          lookGeometry( look, { paint, stats } ) -> BufferGeometry
//   LOOK_PARTS[ id ][ part ]: when it's on her (from gearStats, as her model's fit reads them); not: the part it takes the place of

const has = ( k ) => ( s ) => s[ k ] === undefined || !! s[ k ];
export const LOOK_PARTS = {
	// (KayakModel's showOf)
	kayak: {
		crate: { when: ( s ) => s.holdKg > 12 },
		cooler: { not: 'crate', when: ( s ) => ! ( s.holdKg > 12 ) },
		puck: { when: ( s ) => !! s.finder },
		trolley: { when: ( s ) => s.anchorM > 0 || !! s.trolley },
	},
	// (ConsoleModel's fittedOf, her ladder up and her cover off, as she's left)
	console: {
		tTop: { when: ( s ) => !! s.tTop },
		tankRack: { when: ( s ) => !! s.tankRack },
		twin: { when: ( s ) => !! s.twin },
		single: { not: 'twin', when: ( s ) => ! s.twin },
		ladderUp: { when: ( s ) => !! s.diveLadder },
	},
	lobster: {},
	// (SportfisherModel's fittedOf: one she has no track for yet is shown)
	sportfisher: {
		tower: { when: has( 'tower' ) },
		outriggers: { when: has( 'outriggers' ) },
		chair: { when: has( 'chair' ) },
	},
};

// how much her model's materials lift her shade by day (of her colour, as light of its own). ((M16) The sportfisher's was 0.3,
// SportfisherMaterials' OUTSIDE_FILL: (M17) every boat's shade is BoatMaterials' fill now, the scene's environment, as the
// moored boats' own is (MooredBoats' FILL), so none has a lift of her own)
export const LIFT = {};

// what of her stats her look shows: a change in it is a new geometry
export const lookSign = ( id, stats ) => Object.entries( LOOK_PARTS[ id ] || {} ).map( ( [ k, p ] ) => p.when( stats ) ? k : '' ).join();

const SRGB = new Float32Array( 256 );
for ( let i = 0; i < 256; i ++ ) {

	const c = i / 255;
	SRGB[ i ] = c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );

}

export function readLook( buffer ) {

	const head = new DataView( buffer );
	if ( String.fromCharCode( ...new Uint8Array( buffer, 0, 4 ) ) !== 'MOOR' ) throw new Error( 'MooredLooks: not a baked boat' );
	const hl = head.getUint32( 4, true ), H = JSON.parse( new TextDecoder().decode( new Uint8Array( buffer, 8, hl ) ) );
	const n = H.vertices, pad = ( x ) => ( x + 3 ) & ~ 3;
	let at = 8 + hl;
	const pos = new Uint16Array( buffer, at, n * 3 );
	at += pad( n * 6 );
	const nor = new Int8Array( buffer, at, n * 3 );
	at += pad( n * 3 );
	const col = new Uint8Array( buffer, at, n * 4 );
	at += n * 4;
	const index = new Uint16Array( buffer, at, H.indices );
	return { id: H.id, vertices: n, box: H.box, parts: Object.fromEntries( H.parts.map( ( [ k, from, count ] ) => [ k, [ from, count ] ] ) ), pos, nor, col, index };

}

// a paint's colour on her, as her model's material makes it (linear: setHex takes the hex as sRGB). ((M17) The console's and
// the sportfisher's went to linear twice over, and this copied it so they matched; now every boat's goes once)
export function paintColor( id, hex, out = new Color() ) {

	return out.setHex( hex );

}

const _paint = new Color();

// her, as she's fitted (stats: gearStats for her) and painted (paint: a hex, or null as she came)
export function lookGeometry( look, { paint = null, stats = {} } = {} ) {

	const n = look.vertices, B = look.box, P = new Float32Array( n * 3 ), C = new Float32Array( n * 3 );
	for ( let i = 0; i < n * 3; i ++ ) {

		const k = i % 3;
		P[ i ] = B[ k ] + look.pos[ i ] / 65535 * ( B[ k + 3 ] - B[ k ] );

	}

	if ( paint !== null ) paintColor( look.id, paint, _paint );
	for ( let v = 0; v < n; v ++ ) for ( let k = 0; k < 3; k ++ ) {

		const c = SRGB[ look.col[ v * 4 + k ] ], how = look.col[ v * 4 + 3 ], p = k === 0 ? _paint.r : k === 1 ? _paint.g : _paint.b;
		C[ v * 3 + k ] = paint === null || ! how ? c : how === 1 ? p : c * p;

	}

	// the parts on her, one after another
	const parts = LOOK_PARTS[ look.id ] || {}, on = [ 'base', ...Object.keys( parts ).filter( ( k ) => parts[ k ].when( stats ) ) ];
	let count = 0;
	for ( const k of on ) if ( look.parts[ k ] ) count += look.parts[ k ][ 1 ];
	const index = new Uint16Array( count );
	let w = 0;
	for ( const k of on ) if ( look.parts[ k ] ) {

		const [ from, c ] = look.parts[ k ];
		index.set( look.index.subarray( from, from + c ), w );
		w += c;

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( P, 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( look.nor.slice(), 3, true ) );
	g.setAttribute( 'color', new Float32BufferAttribute( C, 3 ) );
	g.setIndex( new BufferAttribute( index, 1 ) );
	return g;

}
