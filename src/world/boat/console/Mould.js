import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from '../../../engine/index.js';
import { GeoKit } from '../GeoKit.js';
import { POSITION_SCALE, PARTS } from './Moulded.js';

// (M16) What her gelcoat's made with: solids with soft edges from an outline, her moulded parts, and a kit that knows
// which triangles belong to what can be taken off her (an upgrade not fitted) without another draw.

// a rectangle's outline with its corners rounded, counter-clockwise
export function rounded( x0, y0, x1, y1, r, seg = 3 ) {

	const out = [], arc = ( cx, cy, a0 ) => {

		for ( let i = 0; i <= seg; i ++ ) {

			const a = a0 + i / seg * Math.PI / 2;
			out.push( [ cx + Math.cos( a ) * r, cy + Math.sin( a ) * r ] );

		}

	};

	arc( x1 - r, y0 + r, - Math.PI / 2 );
	arc( x1 - r, y1 - r, 0 );
	arc( x0 + r, y1 - r, Math.PI / 2 );
	arc( x0 + r, y0 + r, Math.PI );
	return out;

}

// any polygon's corners rounded by up to r (points [ u, v ], counter-clockwise; radii: this corner's own, in place of r)
export function softCorners( pts, r, seg = 2, radii = null ) {

	const out = [], n = pts.length;
	for ( let i = 0; i < n; i ++ ) {

		const p = pts[ i ], a = pts[ ( i + n - 1 ) % n ], b = pts[ ( i + 1 ) % n ];
		const la = Math.hypot( a[ 0 ] - p[ 0 ], a[ 1 ] - p[ 1 ] ), lb = Math.hypot( b[ 0 ] - p[ 0 ], b[ 1 ] - p[ 1 ] );
		const d = Math.min( radii ? radii[ i ] : r, la * 0.45, lb * 0.45 );
		if ( d < 1e-4 ) {

			out.push( p );
			continue;

		}

		const ax = p[ 0 ] + ( a[ 0 ] - p[ 0 ] ) / la * d, ay = p[ 1 ] + ( a[ 1 ] - p[ 1 ] ) / la * d;
		const bx = p[ 0 ] + ( b[ 0 ] - p[ 0 ] ) / lb * d, by = p[ 1 ] + ( b[ 1 ] - p[ 1 ] ) / lb * d;
		for ( let k = 0; k <= seg; k ++ ) {

			const t = k / seg, s = 1 - t;
			out.push( [ s * s * ax + 2 * s * t * p[ 0 ] + t * t * bx, s * s * ay + 2 * s * t * p[ 1 ] + t * t * by ] );

		}

	}

	return out;

}

// the outline moved in by d (its corners on the mitre)
function inset( pts, d ) {

	const n = pts.length, out = [];
	for ( let i = 0; i < n; i ++ ) {

		const p = pts[ i ], a = pts[ ( i + n - 1 ) % n ], b = pts[ ( i + 1 ) % n ];
		let ax = p[ 0 ] - a[ 0 ], ay = p[ 1 ] - a[ 1 ], bx = b[ 0 ] - p[ 0 ], by = b[ 1 ] - p[ 1 ];
		const la = Math.hypot( ax, ay ) || 1, lb = Math.hypot( bx, by ) || 1;
		ax /= la; ay /= la; bx /= lb; by /= lb;
		// (counter-clockwise: in is to the left of the way round)
		let nx = - ay - by, ny = ax + bx;
		const l = Math.hypot( nx, ny ) || 1;
		nx /= l; ny /= l;
		const c = Math.max( 0.4, nx * - ay + ny * ax );
		out.push( [ p[ 0 ] + nx * d / c, p[ 1 ] + ny * d / c ] );

	}

	return out;

}

// A solid from an outline [ [ u, v ], ... ] between depths d0 and d1, its edges rounded by bevel. place( u, v, d ): the
// point in the boat's frame, as a Vector3
export function solid( outline, d0, d1, bevel, place, { rings = 2, front = true, back = true } = {} ) {

	const pts = ShapeUtils.isClockWise( outline.map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) ) ) ? [ ...outline ].reverse() : outline;
	const n = pts.length, pos = [], idx = [];
	const loop = ( ring, d ) => {

		const base = pos.length / 3;
		for ( const p of ring ) {

			const q = place( p[ 0 ], p[ 1 ], d );
			pos.push( q.x, q.y, q.z );

		}

		return base;

	};

	// the ends' rounding, then the wall between: a ring at each step, from the back's face round to the front's
	const loops = [];
	const sign = Math.sign( d1 - d0 ) || 1;
	for ( let k = rings; k >= 0; k -- ) {

		const a = k / rings * Math.PI / 2;
		loops.push( loop( inset( pts, bevel * ( 1 - Math.cos( a ) ) ), d0 + sign * bevel * ( 1 - Math.sin( a ) ) ) );

	}

	for ( let k = 0; k <= rings; k ++ ) {

		const a = k / rings * Math.PI / 2;
		loops.push( loop( inset( pts, bevel * ( 1 - Math.cos( a ) ) ), d1 - sign * bevel * ( 1 - Math.sin( a ) ) ) );

	}

	for ( let l = 0; l < loops.length - 1; l ++ ) for ( let i = 0; i < n; i ++ ) {

		const j = ( i + 1 ) % n, a = loops[ l ] + i, b = loops[ l ] + j, c = loops[ l + 1 ] + j, d = loops[ l + 1 ] + i;
		idx.push( a, b, c, a, c, d );

	}

	const shape = inset( pts, bevel ).map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) );
	const tris = ShapeUtils.triangulateShape( shape, [] );
	for ( const [ d, flip, on ] of [ [ d0, true, back ], [ d1, false, front ] ] ) {

		if ( ! on ) continue;
		const base = pos.length / 3;
		for ( const p of shape ) {

			const q = place( p.x, p.y, d );
			pos.push( q.x, q.y, q.z );

		}

		for ( const t of tris ) idx.push( base + t[ 0 ], base + ( flip ? t[ 2 ] : t[ 1 ] ), base + ( flip ? t[ 1 ] : t[ 2 ] ) );

	}

	// the winding as the place's handedness has it: the signed volume says which way's out
	let vol = 0;
	for ( let i = 0; i < idx.length; i += 3 ) {

		const a = idx[ i ] * 3, b = idx[ i + 1 ] * 3, c = idx[ i + 2 ] * 3;
		vol += pos[ a ] * ( pos[ b + 1 ] * pos[ c + 2 ] - pos[ b + 2 ] * pos[ c + 1 ] ) - pos[ a + 1 ] * ( pos[ b ] * pos[ c + 2 ] - pos[ b + 2 ] * pos[ c ] ) + pos[ a + 2 ] * ( pos[ b ] * pos[ c + 1 ] - pos[ b + 1 ] * pos[ c ] );

	}

	if ( vol < 0 ) for ( let i = 0; i < idx.length; i += 3 ) {

		const t = idx[ i + 1 ];
		idx[ i + 1 ] = idx[ i + 2 ];
		idx[ i + 2 ] = t;

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

const bytes = ( s ) => ( typeof atob === 'function' ? Uint8Array.from( atob( s ), ( c ) => c.charCodeAt( 0 ) ) : new Uint8Array( Buffer.from( s, 'base64' ) ) );

// one of Moulded.js's meshes as a geometry for the kit: its colours and finishes per part
export function moulded( m, partColors = null ) {

	const p8 = bytes( m.pos ), n = bytes( m.nor ), part = bytes( m.part ), i8 = bytes( m.idx );
	const p16 = new Int16Array( p8.buffer, p8.byteOffset, p8.length / 2 ), idx = new Uint16Array( i8.buffer, i8.byteOffset, i8.length / 2 );
	const count = part.length, pos = new Float32Array( count * 3 ), nor = new Float32Array( count * 3 ), col = new Float32Array( count * 3 ), aux = new Float32Array( count * 4 );
	const nv = new Int8Array( n.buffer, n.byteOffset, n.length );
	const colors = PARTS.map( ( q ) => partColors?.[ q.name ] ?? q.color );
	const linear = colors.map( ( hex ) => [ ( hex >> 16 ) & 255, ( hex >> 8 ) & 255, hex & 255 ].map( ( c ) => {

		const v = c / 255;
		return v <= 0.04045 ? v / 12.92 : ( ( v + 0.055 ) / 1.055 ) ** 2.4;

	} ) );
	for ( let i = 0; i < count; i ++ ) {

		for ( let c = 0; c < 3; c ++ ) {

			pos[ 3 * i + c ] = p16[ 3 * i + c ] * POSITION_SCALE;
			nor[ 3 * i + c ] = nv[ 3 * i + c ] / 127;
			col[ 3 * i + c ] = linear[ part[ i ] ][ c ];

		}

		aux[ 4 * i ] = PARTS[ part[ i ] ].rough;
		aux[ 4 * i + 1 ] = PARTS[ part[ i ] ].metal;

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( nor, 3 ) );
	g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
	g.setAttribute( 'aux', new Float32BufferAttribute( aux, 4 ) );
	g.setIndex( [ ...idx ] );
	return g;

}

// The kit, knowing which triangles of each bucket are which fitting: kit.fitting = 'tTop' and what's added after belongs to
// it; null is the boat's own. After merged(), rangesOf( bucket ) says where they are, and fittedIndex( bucket, fitted ) gives
// the index with only those fitted, for the mesh's geometry to take
export class FittingKit extends GeoKit {

	constructor() {

		super();
		this.fitting = null;
		this._tags = new Map();

	}

	add( bucket, geometry, opts ) {

		const g = super.add( bucket, geometry, opts );
		if ( ! this._tags.has( bucket ) ) this._tags.set( bucket, [] );
		this._tags.get( bucket ).push( [ this.fitting, g.index.count ] );
		return g;

	}

	// [ [ fitting, first index, count ], ... ], in the merged geometry's order
	rangesOf( bucket ) {

		let at = 0;
		return ( this._tags.get( bucket ) || [] ).map( ( [ fitting, count ] ) => {

			const r = [ fitting, at, count ];
			at += count;
			return r;

		} );

	}

}
