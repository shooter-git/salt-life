#!/usr/bin/env node
// (M16) The boats you own and aren't in, as they look: public/boats/moored/<id>.bin, each baked from her own model (the one
// world/boat/Boats.js loadBoat builds when you're in her) into a few thousand triangles in one mesh, her colours in its
// vertices. What's seen of her from outside is kept: her model's drawn from all round (a software z-buffer, from every
// way she might be looked at, with each way she can be fitted), and what's never in front is dropped (her cabin, the
// inside of her hull under her decks). Then simplified with meshoptimizer (three's own copy), her paint's boundaries
// kept sharp, and what can be fitted to her kept apart, so that her upgrades come and go and her topsides take a paint:
// game/fleet/MooredLooks.js reads it. Run it again when a model changes:
//   node tools/moored-bake.mjs [id ...]
//
// The file, little-endian: 'MOOR', u32 the header's length, the header (JSON: vertices, indices, box, parts as
// [ name, first index, count ], paint), then positions u16 x 3 over the box, normals i8 x 3, colours u8 x 4 (sRGB, and
// what the paint does to it: 0 nothing, 1 it's the paint, 2 tinted by it), indices u16; each block padded to 4 bytes.
import { register } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { BOATS, loadBoat } = await import( '../src/world/boat/Boats.js' );
const { Color, Matrix4, Vector3 } = await import( '../src/engine/index.js' );
const { MeshoptSimplifier } = await import( 'three/examples/jsm/libs/meshopt_simplifier.module.js' );
const { LOOK_PARTS, paintColor } = await import( '../src/game/fleet/MooredLooks.js' );
await MeshoptSimplifier.ready;

const OUT = fileURLToPath( new URL( '../public/boats/moored/', import.meta.url ) );
// how far her simplified surface may be from her own (m), chosen by looking at her from the pier and the beach: the kayak's
// passed close by on the sand. And the most triangles she's let have, every part of her at once
const ERROR = { kayak: 0.01, console: 0.02, lobster: 0.02, sportfisher: 0.025 };
const TARGET = { kayak: 1500, console: 3800, lobster: 3800, sportfisher: 4800 };
const VIEWS = 128; // ways she's looked at, all round her
const PIXEL = 0.012; // m: the z-buffer's
const CREASE = Math.cos( 38 * Math.PI / 180 ); // a hard edge between faces more than this apart
const TONE = 0.1; // how far apart two colours at a point may be and be one (sRGB, 0..1)
// a rod or a rail: so long at least (m), and across it under so many times her error; and how much finer its own error is
const THIN = { long: 0.2, across: 4 };
const THIN_ERROR = 0.4;

const lin = ( hex ) => new Color().setHex( hex );
const smoothstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// ---- what each material looks like, as its shader paints it (world/boat/*Materials.js), at a distance: a pattern too fine to
// see is its average. Her paint's lines are cut into her triangles (bands below), so they stay sharp
// (lin: as BoatMaterials and the rest make their colours, to linear once ((M17) it was twice, as theirs were))
const TINTED = new Color( 0x0b0f12 ), DISPLAY = new Color( 0x0a1418 );
// (her teak-look soles: from the pier, about as much of their pale seams as their planks, as the shader draws them that far off)
const TEAK_SF = lin( 0xc48a52 ).multiplyScalar( 0.98 ).lerp( lin( 0xd9c7aa ), 0.45 );
const MAT_CONSOLE = new Color( 0.47, 0.29, 0.15 );
// a surface painted in bands: of( p, aux ) how far up it a corner is, at: the lines between them, bottom to top, colors:
// each band's ( null: her paint, as she came, made as her model makes it: MooredLooks' paintColor )
const boot = ( z0, z1, rise ) => ( p ) => p.y - smoothstep( z0, z1, p.z ) * rise;
const BANDS = {
	// (her antifouling, her boot top, her topsides; BoatMaterials' hull and SportfisherMaterials')
	lobster: { of: boot( 0.8, 4.3, 0.06 ), at: [ 0.05, 0.15 ], colors: [ lin( 0x7a1d15 ), lin( 0x0f1a30 ), null ], boat: 'lobster', paint: 0xf2efe6 },
	sportfisher: { of: boot( 2.0, 7.0, 0.1 ), at: [ 0.04, 0.13 ], colors: [ lin( 0x141d2c ), lin( 0x1a56a0 ), null ], boat: 'sportfisher', paint: 0xf4f2ec },
	// (the console's, ConsoleMaterials': her bottom white over her antifouling; her topsides, a red pinstripe at their foot)
	consoleBottom: { of: boot( 0.8, 3.0, 0.08 ), at: [ 0.07 ], colors: [ lin( 0x1c2c44 ), new Color( 0.86, 0.86, 0.84 ) ] },
	consoleTopsides: { of: ( p, aux ) => aux[ 3 ], at: [ 0.012, 0.05 ], colors: [ null, new Color( 0.55, 0.03, 0.03 ), null ], boat: 'console', paint: 0x234a75 },
};

// a material on boat id -> how it's coloured
function lookOf( id, material ) {

	const n = material.name;
	if ( n === 'boatGlassTinted' ) return { flat: TINTED };
	if ( n === 'boatDisplay' ) return { flat: DISPLAY };
	if ( n === 'boatGlow' ) return { scale: 0.6 };
	if ( n === 'kayakHull' ) return { paint: 2 };
	if ( n === 'boatHull' ) return { bands: BANDS[ id ] };
	if ( n === 'consoleBody' ) return { console: true };
	if ( n === 'boatGelcoat' && id === 'sportfisher' ) return { teak: true };
	return {};

}

// the bands a triangle's painted in (aux: its first corner's), or null
function bandsOf( look, aux ) {

	if ( look.bands ) return look.bands;
	if ( look.console && aux[ 2 ] > 2.5 && aux[ 2 ] < 3.5 ) return BANDS.consoleBottom;
	if ( look.console && aux[ 2 ] > 1.5 && aux[ 2 ] < 2.5 ) return BANDS.consoleTopsides;
	return null;

}

// one corner's colour into out (linear) -> what her paint does to it (0 nothing, 1 it's the paint, 2 tinted by it): c its
// vColor (linear), aux its ( rough, metal, pattern, w ), B and band the bands it's in and which
function shade( look, c, aux, B, band, out ) {

	if ( B ) {

		const k = B.colors[ band ];
		return k ? ( out.copy( k ), 0 ) : ( paintColor( B.boat, B.paint, out ), 1 );

	}

	if ( look.flat ) return out.copy( look.flat ), 0;
	if ( look.scale ) return out.copy( c ).multiplyScalar( look.scale ), 0;
	if ( look.paint ) return out.copy( c ), look.paint;
	if ( look.console ) {

		const pat = aux[ 2 ];
		if ( pat > 3.5 ) return out.copy( MAT_CONSOLE ), 0;
		if ( pat > 0.5 ) return out.copy( c ).multiplyScalar( 0.93 ), 0;
		return out.copy( c ), 0;

	}

	if ( look.teak && aux[ 2 ] > 1.5 && aux[ 2 ] < 2.5 ) return out.copy( TEAK_SF ), 0;
	return out.copy( c ), 0;

}

// ---- her model, as triangles in her frame: each with its part, whether it's two-sided, and how it's coloured

class Soup {

	constructor() {

		this.p = []; // 9 a triangle
		this.c = []; // 9 a triangle (linear)
		this.paint = []; // 1 a triangle
		this.part = [];
		this.sided = [];

	}

	get count() {

		return this.part.length;

	}

}

const _a = new Vector3(), _c = new Color();

// adds a mesh's triangles: geo's index triangles [ from, to ), matrix to her frame, part (or partOf( vertex index ))
function addMesh( soup, id, mesh, matrix, part, { from = 0, to = Infinity, partOf = null } = {} ) {

	const g = mesh.geometry, P = g.attributes.position, C = g.attributes.color, A = g.attributes.aux;
	const index = g.index ? g.index.array : null, n = index ? index.length : P.count;
	const look = lookOf( id, mesh.material ), sided = mesh.material.side === 2 ? 1 : 0;
	const pos = mesh.userData.fullPositions || P.array;
	const corners = [ new Vector3(), new Vector3(), new Vector3() ], col = [ new Color(), new Color(), new Color() ], aux = [ [], [], [] ];
	for ( let i = from; i < Math.min( n, to ); i += 3 ) {

		const vs = [ 0, 1, 2 ].map( ( k ) => index ? index[ i + k ] : i + k );
		for ( let k = 0; k < 3; k ++ ) {

			const v = vs[ k ];
			corners[ k ].set( pos[ v * 3 ], pos[ v * 3 + 1 ], pos[ v * 3 + 2 ] ).applyMatrix4( matrix );
			if ( C ) col[ k ].setRGB( C.getX( v ), C.getY( v ), C.getZ( v ) );
			else col[ k ].setRGB( 1, 1, 1 );
			if ( mesh.material.color && ! look.flat ) col[ k ].multiply( mesh.material.color );
			aux[ k ] = A ? [ A.getX( v ), A.getY( v ), A.getZ( v ), A.getW( v ) ] : [ 0.5, 0, 0, 0 ];

		}

		const B = bandsOf( look, aux[ 0 ] );
		const pieces = B ? splitBands( corners, corners.map( ( p, k ) => B.of( p, aux[ k ] ) ), B.at ) : [ [ corners, 0 ] ];
		for ( const [ tri, band ] of pieces ) {

			let paint = 0;
			for ( let k = 0; k < 3; k ++ ) {

				// (a split corner takes the colour of the corner nearest it: what's lerped is only its place)
				const near = nearestCorner( tri[ k ], corners );
				paint = shade( look, col[ near ], aux[ near ], B, band, _c );
				soup.p.push( tri[ k ].x, tri[ k ].y, tri[ k ].z );
				soup.c.push( _c.r, _c.g, _c.b );

			}

			soup.paint.push( paint );
			soup.part.push( partOf ? partOf( vs[ 0 ] ) : part );
			soup.sided.push( sided );

		}

	}

}

function nearestCorner( p, corners ) {

	let best = 0, bd = Infinity;
	for ( let k = 0; k < 3; k ++ ) {

		const d = p.distanceToSquared( corners[ k ] );
		if ( d < bd ) {

			bd = d;
			best = k;

		}

	}

	return best;

}

// a triangle cut where her paint changes (each piece wholly one band): corners, the value banded at each, the lines in it
// -> [ [ corners, band ], ... ]. A cut edge's point is found the same way from either side of it, so neighbours share it
function splitBands( corners, values, at ) {

	let list = [ [ corners, values ] ];
	for ( const level of at ) {

		const next = [];
		for ( const [ tri, v ] of list ) next.push( ...cut( tri, v, level ) );
		list = next;

	}

	return list.map( ( [ tri, v ] ) => {

		const m = ( v[ 0 ] + v[ 1 ] + v[ 2 ] ) / 3;
		let band = 0;
		while ( band < at.length && m > at[ band ] ) band ++;
		return [ tri, band ];

	} );

}

const key = ( p ) => `${ p.x },${ p.y },${ p.z }`;
function edgePoint( a, va, b, vb, level ) {

	// (in one order whichever way round the edge is met)
	if ( key( a ) > key( b ) ) [ a, va, b, vb ] = [ b, vb, a, va ];
	const t = ( va - level ) / ( va - vb );
	return [ new Vector3().lerpVectors( a, b, t ), va + ( vb - va ) * t ];

}

function cut( tri, v, level ) {

	const s = v.map( ( x ) => x > level );
	if ( s[ 0 ] === s[ 1 ] && s[ 1 ] === s[ 2 ] ) return [ [ tri, v ] ];
	// the corner alone on its side, first
	const k = s[ 0 ] === s[ 1 ] ? 2 : s[ 0 ] === s[ 2 ] ? 1 : 0, j = ( k + 1 ) % 3, i = ( k + 2 ) % 3;
	const [ ab, vab ] = edgePoint( tri[ k ], v[ k ], tri[ j ], v[ j ], level ), [ ac, vac ] = edgePoint( tri[ k ], v[ k ], tri[ i ], v[ i ], level );
	return [ [ [ tri[ k ], ab, ac ], [ v[ k ], vab, vac ] ], [ [ ab, tri[ j ], tri[ i ] ], [ vab, v[ j ], v[ i ] ] ], [ [ ab, tri[ i ], ac ], [ vab, v[ i ], vac ] ] ];

}

// ---- her meshes, each with the part it is. -> { soup, configs: [ { part: on } ] } every way she can be fitted
// (and clear glass, the console's windscreen and the lobster boat's windows: what's behind it's what's seen. The sportfisher's is
// tinted near black from outside, and is drawn so)
const MESHES_SKIPPED = new Set( [ 'boat-compass', 'boat-towerCompass', 'boat-underGlowOwn' ] );
const SKIPPED = { console: new Set( [ 'boat-glass' ] ), lobster: new Set( [ 'boat-glass' ] ) };

async function trianglesOf( id ) {

	const model = await loadBoat( id, 'high' );
	model.group.updateMatrixWorld( true );
	const soup = new Soup(), toHer = new Matrix4().copy( model.group.matrixWorld ).invert(), m = new Matrix4();
	const her = ( o ) => m.multiplyMatrices( toHer, o.matrixWorld );
	const parts = LOOK_PARTS[ id ] || {};
	const each = ( fn ) => model.group.traverse( ( o ) => o.isMesh && ! MESHES_SKIPPED.has( o.name ) && ! SKIPPED[ id ]?.has( o.name ) && fn( o ) );

	if ( id === 'kayak' ) {

		// her one mesh, what's fitted to her in vertex ranges (KayakModel.fit); the paddle laid along her
		const ranges = Object.entries( model._fitted );
		const partOf = ( v ) => {

			for ( const [ k, r ] of ranges ) if ( v >= r.start && v < r.start + r.count ) return k;
			return 'base';

		};

		each( ( o ) => {

			if ( o.name === 'boat-hull' ) o.userData.fullPositions = model._fullPositions;
			addMesh( soup, id, o, her( o ), 'base', o.name === 'boat-hull' ? { partOf } : {} );

		} );

	} else if ( id === 'console' ) {

		// her static meshes' index ranges, each for a fitting or none (ConsoleModel._ranges); her engines as fit hangs them
		const engines = new Set( [ 'boat-outboard', 'boat-outboard2' ] );
		each( ( o ) => {

			if ( engines.has( o.name ) ) return;
			const name = o.name.replace( /^boat-/, '' ), ranges = model._ranges[ name ];
			if ( ! ranges ) return addMesh( soup, id, o, her( o ), 'base' );
			o.geometry.setIndex( Array.from( model._index[ name ] ) );
			for ( const [ fitting, from, count ] of ranges ) {

				const part = fitting || 'base';
				if ( part !== 'base' && ! parts[ part ] ) continue; // (her cover down, her ladder down: not as she's left)
				addMesh( soup, id, o, her( o ), part, { from, to: from + count } );

			}

		} );
		for ( const twin of [ false, true ] ) {

			model.fit( { twin } );
			model.group.updateMatrixWorld( true );
			for ( const n of twin ? [ 'boat-outboard', 'boat-outboard2' ] : [ 'boat-outboard' ] ) {

				const o = model.group.getObjectByName( n );
				addMesh( soup, id, o, her( o ), twin ? 'twin' : 'single' );

			}

		}

	} else {

		// the lobster boat's all one; the sportfisher's tower, outriggers and chair are meshes of their own
		const partOfMesh = { 'boat-tower': 'tower', 'boat-towerThrottle': 'tower', 'boat-towerDisplay': 'tower', 'boat-outriggers': 'outriggers', 'boat-chair': 'chair' };
		each( ( o ) => {

			if ( o.isInstancedMesh ) {

				// (her two wheels: the bridge's, and the tower's)
				const im = new Matrix4();
				for ( let i = 0; i < o.count; i ++ ) {

					o.getMatrixAt( i, im );
					addMesh( soup, id, o, new Matrix4().multiplyMatrices( her( o ), im ), i === 0 ? 'base' : 'tower' );

				}

				return;

			}

			addMesh( soup, id, o, her( o ), partOfMesh[ o.name ] || 'base' );

		} );

	}

	if ( model.dispose ) model.dispose();
	// every way she can be fitted: each part on or off (but those that go together: the console's single engine is her
	// twin's off, the kayak's cooler her crate's)
	const names = Object.keys( parts ).filter( ( k ) => ! parts[ k ].not );
	const configs = [];
	for ( let bits = 0; bits < 1 << names.length; bits ++ ) {

		const on = { base: true };
		names.forEach( ( k, i ) => on[ k ] = !! ( bits & 1 << i ) );
		for ( const k of Object.keys( parts ) ) if ( parts[ k ].not ) on[ k ] = ! on[ parts[ k ].not ];
		configs.push( on );

	}

	return { soup, configs };

}

// ---- what's seen of her from outside: drawn into a z-buffer from all round, as each way she's fitted. -> seen[ t ]: 1 her
// front's been seen, 2 her back (a two-sided surface's)
function visibility( soup, partNames, configs ) {

	const n = soup.count, P = new Float32Array( soup.p );
	const lo = new Vector3( Infinity, Infinity, Infinity ), hi = new Vector3( - Infinity, - Infinity, - Infinity );
	for ( let i = 0; i < P.length; i += 3 ) {

		lo.min( _a.set( P[ i ], P[ i + 1 ], P[ i + 2 ] ) );
		hi.max( _a );

	}

	const center = lo.clone().add( hi ).multiplyScalar( 0.5 ), radius = hi.distanceTo( lo ) / 2 * 1.02;
	const R = Math.ceil( radius * 2 / PIXEL ), scale = R / ( radius * 2 );
	const zbuf = new Float32Array( R * R ), ids = new Int32Array( R * R );
	const X = new Float32Array( n * 3 ), Y = new Float32Array( n * 3 ), Z = new Float32Array( n * 3 ), face = new Uint8Array( n );
	const seen = new Uint8Array( n ), partIx = new Int32Array( n );
	for ( let t = 0; t < n; t ++ ) partIx[ t ] = partNames.indexOf( soup.part[ t ] );
	const dirs = [];
	for ( let i = 0; i < VIEWS; i ++ ) {

		const y = 1 - 2 * ( i + 0.5 ) / VIEWS, r = Math.sqrt( 1 - y * y ), a = i * Math.PI * ( 3 - Math.sqrt( 5 ) );
		dirs.push( new Vector3( Math.cos( a ) * r, y, Math.sin( a ) * r ) );

	}

	const u = new Vector3(), v = new Vector3();
	for ( const on of configs ) {

		const active = partNames.map( ( k ) => !! on[ k ] );
		for ( const d of dirs ) {

			u.set( 0, 1, 0 );
			if ( Math.abs( d.y ) > 0.99 ) u.set( 1, 0, 0 );
			u.cross( d ).normalize();
			v.crossVectors( d, u );
			for ( let i = 0; i < n * 3; i ++ ) {

				const x = P[ i * 3 ] - center.x, y = P[ i * 3 + 1 ] - center.y, z = P[ i * 3 + 2 ] - center.z;
				X[ i ] = ( x * u.x + y * u.y + z * u.z ) * scale + R / 2;
				Y[ i ] = ( x * v.x + y * v.y + z * v.z ) * scale + R / 2;
				Z[ i ] = x * d.x + y * d.y + z * d.z;

			}

			zbuf.fill( - Infinity );
			ids.fill( - 1 );
			for ( let t = 0; t < n; t ++ ) {

				face[ t ] = 0;
				if ( ! active[ partIx[ t ] ] ) continue;
				const i0 = t * 3, i1 = i0 + 1, i2 = i0 + 2;
				const x0 = X[ i0 ], y0 = Y[ i0 ], x1 = X[ i1 ], y1 = Y[ i1 ], x2 = X[ i2 ], y2 = Y[ i2 ];
				const area = ( x1 - x0 ) * ( y2 - y0 ) - ( x2 - x0 ) * ( y1 - y0 );
				if ( area === 0 || ( area < 0 && ! soup.sided[ t ] ) ) continue;
				face[ t ] = area > 0 ? 1 : 2;
				const s = area > 0 ? 1 : - 1, inv = 1 / area;
				const xa = Math.max( 0, Math.ceil( Math.min( x0, x1, x2 ) - 0.5 ) ), xb = Math.min( R - 1, Math.floor( Math.max( x0, x1, x2 ) - 0.5 ) );
				const ya = Math.max( 0, Math.ceil( Math.min( y0, y1, y2 ) - 0.5 ) ), yb = Math.min( R - 1, Math.floor( Math.max( y0, y1, y2 ) - 0.5 ) );
				const z0 = Z[ i0 ], z1 = Z[ i1 ], z2 = Z[ i2 ];
				for ( let py = ya; py <= yb; py ++ ) {

					const cy = py + 0.5;
					for ( let px = xa; px <= xb; px ++ ) {

						const cx = px + 0.5;
						const w0 = ( x1 - cx ) * ( y2 - cy ) - ( x2 - cx ) * ( y1 - cy );
						const w1 = ( x2 - cx ) * ( y0 - cy ) - ( x0 - cx ) * ( y2 - cy );
						const w2 = ( x0 - cx ) * ( y1 - cy ) - ( x1 - cx ) * ( y0 - cy );
						if ( w0 * s < 0 || w1 * s < 0 || w2 * s < 0 ) continue;
						const z = ( w0 * z0 + w1 * z1 + w2 * z2 ) * inv, p = py * R + px;
						if ( z > zbuf[ p ] ) {

							zbuf[ p ] = z;
							ids[ p ] = t;

						}

					}

				}

			}

			for ( let p = 0; p < R * R; p ++ ) if ( ids[ p ] >= 0 ) seen[ ids[ p ] ] |= face[ ids[ p ] ];
			// (one too small to cover a pixel's centre: seen if its middle's in front)
			for ( let t = 0; t < n; t ++ ) {

				if ( ! face[ t ] || seen[ t ] & face[ t ] ) continue;
				const i0 = t * 3, cx = ( X[ i0 ] + X[ i0 + 1 ] + X[ i0 + 2 ] ) / 3, cy = ( Y[ i0 ] + Y[ i0 + 1 ] + Y[ i0 + 2 ] ) / 3;
				const px = Math.floor( cx ), py = Math.floor( cy );
				if ( px < 0 || py < 0 || px >= R || py >= R ) continue;
				if ( ( Z[ i0 ] + Z[ i0 + 1 ] + Z[ i0 + 2 ] ) / 3 >= zbuf[ py * R + px ] - 0.004 ) seen[ t ] |= face[ t ];

			}

		}

	}

	return seen;

}

// her pieces, by what's joined (and what's in the same place across a seam). -> thin[ vertex ]: 1 if it's of a rod or a
// rail (long, and across it under THIN times her error)
function thinPieces( pos, index, limit ) {

	const n = pos.length / 3, up = new Int32Array( n ).map( ( _, i ) => i );
	const root = ( x ) => {

		while ( up[ x ] !== x ) x = up[ x ] = up[ up[ x ] ];
		return x;

	};
	const join = ( a, b ) => {

		up[ root( a ) ] = root( b );

	};
	for ( let i = 0; i < index.length; i += 3 ) {

		join( index[ i ], index[ i + 1 ] );
		join( index[ i ], index[ i + 2 ] );

	}

	const same = new Map();
	for ( let v = 0; v < n; v ++ ) {

		const k = `${ pos[ v * 3 ] },${ pos[ v * 3 + 1 ] },${ pos[ v * 3 + 2 ] }`;
		if ( same.has( k ) ) join( v, same.get( k ) );
		else same.set( k, v );

	}

	const of = new Map();
	for ( let v = 0; v < n; v ++ ) {

		const r = root( v );
		if ( ! of.has( r ) ) of.set( r, [] );
		of.get( r ).push( v );

	}

	const thin = new Uint8Array( n );
	for ( const verts of of.values() ) {

		const [ long, across ] = extents( pos, verts );
		if ( long >= THIN.long && across < THIN.across * limit ) for ( const v of verts ) thin[ v ] = 1;

	}

	return thin;

}

// a piece's extent along its longest axis and across it (its second), from its vertices' principal axes
function extents( pos, verts ) {

	const m = [ 0, 0, 0 ];
	for ( const v of verts ) for ( let k = 0; k < 3; k ++ ) m[ k ] += pos[ v * 3 + k ] / verts.length;
	const C = [ [ 0, 0, 0 ], [ 0, 0, 0 ], [ 0, 0, 0 ] ];
	for ( const v of verts ) for ( let a = 0; a < 3; a ++ ) for ( let b = 0; b < 3; b ++ ) C[ a ][ b ] += ( pos[ v * 3 + a ] - m[ a ] ) * ( pos[ v * 3 + b ] - m[ b ] );
	const axes = eigenvectors( C );
	return axes.map( ( e ) => {

		let lo = Infinity, hi = - Infinity;
		for ( const v of verts ) {

			const d = ( pos[ v * 3 ] - m[ 0 ] ) * e[ 0 ] + ( pos[ v * 3 + 1 ] - m[ 1 ] ) * e[ 1 ] + ( pos[ v * 3 + 2 ] - m[ 2 ] ) * e[ 2 ];
			lo = Math.min( lo, d );
			hi = Math.max( hi, d );

		}

		return hi - lo;

	} ).sort( ( a, b ) => b - a );

}

// a symmetric 3x3's eigenvectors (Jacobi's rotations)
function eigenvectors( A ) {

	const a = A.map( ( r ) => r.slice() ), V = [ [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ];
	for ( let sweep = 0; sweep < 24; sweep ++ ) for ( const [ p, q ] of [ [ 0, 1 ], [ 0, 2 ], [ 1, 2 ] ] ) {

		if ( Math.abs( a[ p ][ q ] ) < 1e-12 ) continue;
		const th = ( a[ q ][ q ] - a[ p ][ p ] ) / ( 2 * a[ p ][ q ] ), t = Math.sign( th || 1 ) / ( Math.abs( th ) + Math.sqrt( th * th + 1 ) );
		const c = 1 / Math.sqrt( t * t + 1 ), sn = t * c;
		for ( let k = 0; k < 3; k ++ ) {

			const akp = a[ k ][ p ], akq = a[ k ][ q ];
			a[ k ][ p ] = c * akp - sn * akq;
			a[ k ][ q ] = sn * akp + c * akq;

		}

		for ( let k = 0; k < 3; k ++ ) {

			const apk = a[ p ][ k ], aqk = a[ q ][ k ];
			a[ p ][ k ] = c * apk - sn * aqk;
			a[ q ][ k ] = sn * apk + c * aqk;

		}

		for ( let k = 0; k < 3; k ++ ) {

			const vkp = V[ k ][ p ], vkq = V[ k ][ q ];
			V[ k ][ p ] = c * vkp - sn * vkq;
			V[ k ][ q ] = sn * vkp + c * vkq;

		}

	}

	return [ 0, 1, 2 ].map( ( j ) => [ V[ 0 ][ j ], V[ 1 ][ j ], V[ 2 ][ j ] ] );

}

// ---- welded, simplified, and its normals, hard where her faces meet at an angle. Her material's two-sided (MooredBoats), so
// what's seen of a surface from either side is drawn once
function bake( id, soup, seen, partNames, { target = TARGET[ id ], error: limit = ERROR[ id ], flags = [ 'Prune', 'ErrorAbsolute' ], weight = 0.4, tone = TONE, thinError = THIN_ERROR } = {} ) {

	// welded where it's the same place, part and paint, and near enough the same colour: a boundary in any of them stays
	// one (a seam), but a shade's change across a surface doesn't
	const at = new Map(), pos = [], att = [], meta = [], index = [];
	for ( let t = 0; t < soup.count; t ++ ) {

		if ( ! seen[ t ] ) continue;
		for ( let k = 0; k < 3; k ++ ) {

			const c = t * 3 + k, p = [ soup.p[ c * 3 ], soup.p[ c * 3 + 1 ], soup.p[ c * 3 + 2 ] ];
			const srgb = [ 0, 1, 2 ].map( ( j ) => toSRGB( soup.c[ c * 3 + j ] ) );
			const m = [ soup.paint[ t ], partNames.indexOf( soup.part[ t ] ) ];
			const key = `${ p.join() }|${ m.join() }`;
			const list = at.get( key ) || [];
			at.set( key, list );
			let i = list.find( ( v ) => Math.max( ...srgb.map( ( x, j ) => Math.abs( x - att[ v * 3 + j ] ) ) ) <= tone );
			if ( i === undefined ) {

				list.push( i = pos.length / 3 );
				pos.push( ...p );
				att.push( ...srgb );
				meta.push( m );

			}

			index.push( i );

		}

	}

	// (a sheet made two-faced, a face each way round, is one face: she's drawn from both sides)
	const once = new Set();
	for ( let i = 0; i < index.length; i += 3 ) {

		const k = [ index[ i ], index[ i + 1 ], index[ i + 2 ] ].sort( ( a, b ) => a - b ).join();
		if ( once.has( k ) ) index[ i ] = index[ i + 1 ] = index[ i + 2 ] = - 1;
		once.add( k );

	}

	for ( let i = index.length - 3; i >= 0; i -= 3 ) if ( index[ i ] < 0 ) index.splice( i, 3 );
	const before = index.length / 3;
	// her pieces (what's joined, seams and all), each simplified as what it is: a rod or a rail thinner than her error would
	// go altogether, so the thin ones are let have a finer error of their own; the rest as far as her error allows
	const thin = thinPieces( pos, index, limit );
	const main = [], fine = [];
	for ( let i = 0; i < index.length; i += 3 ) ( thin[ index[ i ] ] ? fine : main ).push( index[ i ], index[ i + 1 ], index[ i + 2 ] );
	const simplify = ( list, count, err ) => list.length ? MeshoptSimplifier.simplifyWithAttributes( new Uint32Array( list ), new Float32Array( pos ), 3, new Float32Array( att ), 3, [ weight, weight, weight ], null, count, err, flags ) : [ new Uint32Array( 0 ), 0 ];
	const [ rods ] = simplify( fine, 0, limit * thinError );
	// (and on past her error, should that leave her more than her most)
	let [ rest, error ] = simplify( main, 0, limit );
	if ( rest.length + rods.length > target * 3 ) [ rest, error ] = simplify( main, Math.max( 0, target * 3 - rods.length ), 1e3 );
	const simple = [ ...rest, ...rods ];
	const faces = [];
	for ( let i = 0; i < simple.length; i += 3 ) {

		const f = [ simple[ i ], simple[ i + 1 ], simple[ i + 2 ] ];
		if ( f[ 0 ] !== f[ 1 ] && f[ 1 ] !== f[ 2 ] && f[ 0 ] !== f[ 2 ] ) faces.push( { f, back: false } );

	}

	// each face's normal; at each corner, the faces round it that turn less than CREASE from it
	const fn = faces.map( ( { f } ) => {

		const a = vec( pos, f[ 0 ] ), b = vec( pos, f[ 1 ] ), c = vec( pos, f[ 2 ] );
		return b.sub( a ).cross( c.sub( a ) ); // (its length twice its area: weighted)

	} );
	const around = new Map();
	faces.forEach( ( { f, back }, i ) => f.forEach( ( v ) => {

		const k = back ? - v - 1 : v;
		if ( ! around.has( k ) ) around.set( k, [] );
		around.get( k ).push( i );

	} ) );
	// the final vertices: place, normal, colour, paint, part
	const out = new Map(), V = [];
	const corner = ( i, v, back ) => {

		const n0 = fn[ i ].clone().normalize(), sum = new Vector3();
		for ( const j of around.get( back ? - v - 1 : v ) ) if ( fn[ j ].clone().normalize().dot( n0 ) >= CREASE ) sum.add( fn[ j ] );
		if ( sum.lengthSq() === 0 ) sum.copy( n0 );
		sum.normalize();
		const q = [ Math.round( sum.x * 127 ), Math.round( sum.y * 127 ), Math.round( sum.z * 127 ) ];
		const k = `${ v }|${ q.join() }`;
		let o = out.get( k );
		if ( o === undefined ) {

			out.set( k, o = V.length );
			V.push( { v, n: q } );

		}

		return o;

	};
	const byPart = partNames.map( () => [] );
	faces.forEach( ( { f, back }, i ) => {

		byPart[ meta[ f[ 0 ] ][ 1 ] ].push( f.map( ( v ) => corner( i, v, back ) ) );

	} );

	return { pos, att, meta, V, byPart, before, welded: pos.length / 3, error, simple: simple.length / 3, rods: rods.length / 3 };

}

const vec = ( a, i ) => new Vector3( a[ i * 3 ], a[ i * 3 + 1 ], a[ i * 3 + 2 ] );
const toSRGB = ( c ) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow( c, 1 / 2.4 ) - 0.055;

// ---- the file
function write( id, b, partNames ) {

	const lo = [ Infinity, Infinity, Infinity ], hi = [ - Infinity, - Infinity, - Infinity ];
	for ( const { v } of b.V ) for ( let k = 0; k < 3; k ++ ) {

		lo[ k ] = Math.min( lo[ k ], b.pos[ v * 3 + k ] );
		hi[ k ] = Math.max( hi[ k ], b.pos[ v * 3 + k ] );

	}

	const n = b.V.length, idx = [], parts = [];
	b.byPart.forEach( ( list, i ) => {

		if ( ! list.length ) return;
		parts.push( [ partNames[ i ], idx.length, list.length * 3 ] );
		for ( const f of list ) idx.push( ...f );

	} );
	if ( n > 65535 ) throw new Error( `${ id }: ${ n } vertices, past a u16 index` );
	const header = JSON.stringify( { v: 1, id, vertices: n, indices: idx.length, box: [ ...lo.map( r4 ), ...hi.map( r4 ) ], parts } );
	const pad = ( x ) => ( x + 3 ) & ~ 3;
	const hb = Buffer.from( header.padEnd( pad( header.length ), ' ' ), 'latin1' );
	const box = [ ...lo.map( r4 ), ...hi.map( r4 ) ];
	const sizes = [ pad( n * 6 ), pad( n * 3 ), n * 4, pad( idx.length * 2 ) ];
	const buf = Buffer.alloc( 8 + hb.length + sizes.reduce( ( a, c ) => a + c, 0 ) );
	buf.write( 'MOOR', 0, 'latin1' );
	buf.writeUInt32LE( hb.length, 4 );
	hb.copy( buf, 8 );
	let at = 8 + hb.length;
	for ( const { v } of b.V ) for ( let k = 0; k < 3; k ++ ) {

		const span = box[ k + 3 ] - box[ k ] || 1;
		buf.writeUInt16LE( Math.round( Math.min( 1, Math.max( 0, ( b.pos[ v * 3 + k ] - box[ k ] ) / span ) ) * 65535 ), at );
		at += 2;

	}

	at = 8 + hb.length + sizes[ 0 ];
	for ( const { n: q } of b.V ) for ( let k = 0; k < 3; k ++ ) buf.writeInt8( q[ k ], at ++ );
	at = 8 + hb.length + sizes[ 0 ] + sizes[ 1 ];
	for ( const { v } of b.V ) {

		for ( let k = 0; k < 3; k ++ ) buf.writeUInt8( Math.round( b.att[ v * 3 + k ] * 255 ), at ++ );
		buf.writeUInt8( b.meta[ v ][ 0 ], at ++ );

	}

	at = 8 + hb.length + sizes[ 0 ] + sizes[ 1 ] + sizes[ 2 ];
	for ( const i of idx ) {

		buf.writeUInt16LE( i, at );
		at += 2;

	}

	mkdirSync( OUT, { recursive: true } );
	writeFileSync( `${ OUT }${ id }.bin`, buf );
	return { bytes: buf.length, parts };

}

const r4 = ( x ) => Math.round( x * 1e4 ) / 1e4;

export { trianglesOf, visibility, bake, write };
if ( import.meta.url === pathToFileURL( process.argv[ 1 ] ).href ) for ( const id of process.argv.slice( 2 ).length ? process.argv.slice( 2 ) : Object.keys( BOATS ) ) {

	const t0 = performance.now();
	const { soup, configs } = await trianglesOf( id );
	const partNames = [ 'base', ...Object.keys( LOOK_PARTS[ id ] || {} ) ];
	const seen = visibility( soup, partNames, configs );
	const b = bake( id, soup, seen, partNames );
	const { bytes, parts } = write( id, b, partNames );
	const kept = seen.reduce( ( s, x ) => s + ( x ? 1 : 0 ), 0 );
	console.log( `${ id }: ${ soup.count } triangles in her model, ${ kept } seen, ${ b.welded } vertices welded, ${ b.simple } simplified (error ${ b.error.toFixed( 4 ) }), ${ b.V.length } vertices, ${ ( bytes / 1024 ).toFixed( 1 ) } KB, ${ ( ( performance.now() - t0 ) / 1000 ).toFixed( 1 ) } s` );
	console.log( '   ' + parts.map( ( [ k, , c ] ) => `${ k } ${ c / 3 }` ).join( ', ' ) );

}
