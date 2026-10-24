import * as THREE from '../../engine/index.js';
import { PART } from './FishGeometry.js';

// Rays and the green sea turtle, in the fish frame (nose +z, back +y, total length 1 from the
// snout at z = +0.5) so they share the fish batch, material and swimming data:
//  - rays: a flat disc (PART.DISC) whose margins undulate (stingray) or flap (eagle ray) in the
//    vertex shader, eyes and spiracles on top, a whip tail (PART.WHIP, swings sideways).
//    aData: x = position along the body, z = distance from the midline (0 .. 1 at the wing tip),
//    w = 1 on the back, -1 on the belly.
//  - turtle: domed carapace (PART.CARAPACE, pattern coordinates in z / w), plastron, head and
//    neck (PART.SKIN), flippers (PART.FLIPPER: z = distance from the shoulder, w = flipper id
//    0 / 1 front left / right, 2 / 3 hind) that stroke about their shoulders.
//  - (Salt Life) spiny lobster: see lobsterGeometry.

const TAU = Math.PI * 2;
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const smooth = ( a, b, x ) => {

	const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

class Acc {

	constructor() {

		this.pos = [];
		this.dat = [];
		this.idx = [];

	}

	v( x, y, z, a, b, c, d ) {

		this.pos.push( x, y, z );
		this.dat.push( a, b, c, d );
		return this.pos.length / 3 - 1;

	}

	build() {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'aData', new THREE.Float32BufferAttribute( this.dat, 4 ) );
		g.setIndex( this.idx );
		g.computeVertexNormals();
		g.computeBoundingSphere();
		return g;

	}

}

// Tapered tube along points (x, y, z, radius); part and aData z / w per point from fn( i, t, a )
// (a: the angle round the tube; undefined at the cap).
function tube( A, pts, sides, part, dataFn, caps = true ) {

	const rows = [];
	for ( let i = 0; i < pts.length; i ++ ) {

		const p = pts[ i ], q = pts[ Math.min( i + 1, pts.length - 1 ) ], o = pts[ Math.max( i - 1, 0 ) ];
		const d = new THREE.Vector3( q[ 0 ] - o[ 0 ], q[ 1 ] - o[ 1 ], q[ 2 ] - o[ 2 ] ).normalize();
		const s1 = new THREE.Vector3( 0, 1, 0 ).cross( d );
		if ( s1.lengthSq() < 1e-6 ) s1.set( 1, 0, 0 );
		s1.normalize();
		const s2 = new THREE.Vector3().crossVectors( d, s1 );
		const row = [];
		const t = i / ( pts.length - 1 );
		for ( let j = 0; j < sides; j ++ ) {

			const a = j / sides * TAU;
			const [ dz, dw ] = dataFn( i, t, a );
			const r = p[ 3 ];
			row.push( A.v(
				p[ 0 ] + ( s1.x * Math.cos( a ) + s2.x * Math.sin( a ) ) * r,
				p[ 1 ] + ( s1.y * Math.cos( a ) + s2.y * Math.sin( a ) ) * r * ( p[ 4 ] ?? 1 ),
				p[ 2 ] + ( s1.z * Math.cos( a ) + s2.z * Math.sin( a ) ) * r,
				0.5 - p[ 2 ], part, dz, dw,
			) );

		}

		rows.push( row );

	}

	for ( let i = 0; i < rows.length - 1; i ++ ) for ( let j = 0; j < sides; j ++ ) {

		const a = rows[ i ][ j ], b = rows[ i ][ ( j + 1 ) % sides ], c = rows[ i + 1 ][ ( j + 1 ) % sides ], d = rows[ i + 1 ][ j ];
		A.idx.push( a, d, b, b, d, c );

	}

	if ( caps ) {

		const last = rows[ rows.length - 1 ];
		const p = pts[ pts.length - 1 ];
		const c = A.v( p[ 0 ], p[ 1 ], p[ 2 ], 0.5 - p[ 2 ], part, ...dataFn( pts.length - 1, 1 ) );
		for ( let j = 0; j < sides; j ++ ) A.idx.push( last[ j ], c, last[ ( j + 1 ) % sides ] );

	}

}

// o: { lod, eagle } (southern stingray: rhombic disc that undulates; spotted eagle ray: pointed,
// swept wings that flap, a protruding head and a very long tail)
export function rayGeometry( { lod = 0, eagle = false } = {} ) {

	const A = new Acc();
	const nA = lod ? 20 : 44, nR = lod ? 4 : 9;
	// disc outline (right half, x >= 0, from the snout clockwise to the tail), radius at angle a
	// (0 = straight ahead, PI / 2 = the right wing tip) found by intersecting the polygon
	const half = eagle ?
		[ [ 0, 0.27 ], [ 0.05, 0.25 ], [ 0.07, 0.19 ], [ 0.2, 0.12 ], [ 0.36, 0.04 ], [ 0.5, - 0.07 ], [ 0.42, - 0.09 ], [ 0.26, - 0.11 ], [ 0.13, - 0.17 ], [ 0.04, - 0.2 ], [ 0, - 0.2 ] ] :
		[ [ 0, 0.43 ], [ 0.08, 0.37 ], [ 0.3, 0.17 ], [ 0.47, 0.02 ], [ 0.5, - 0.03 ], [ 0.44, - 0.12 ], [ 0.26, - 0.3 ], [ 0.12, - 0.4 ], [ 0, - 0.42 ] ];
	const poly = [ ...half, ...half.slice( 1, - 1 ).reverse().map( ( p ) => [ - p[ 0 ], p[ 1 ] ] ) ];
	const outline = ( a ) => {

		const dx = Math.sin( a ), dz = Math.cos( a );
		let best = 0;
		for ( let i = 0; i < poly.length; i ++ ) {

			const p = poly[ i ], q = poly[ ( i + 1 ) % poly.length ];
			// ray (0,0) + t (dx, dz) against the segment p q
			const ex = q[ 0 ] - p[ 0 ], ez = q[ 1 ] - p[ 1 ];
			const den = dx * ez - dz * ex;
			if ( Math.abs( den ) < 1e-9 ) continue;
			const t = ( p[ 0 ] * ez - p[ 1 ] * ex ) / den;
			const u = ( p[ 0 ] * dz - p[ 1 ] * dx ) / den;
			if ( t > 0 && u >= 0 && u <= 1 ) best = Math.max( best, t );

		}

		return best;

	};

	const cz = eagle ? 0.23 : 0.07; // disc centre (the disc sits at the front of the total length)
	const thick = eagle ? 0.07 : 0.06;
	for ( const side of [ 1, - 1 ] ) {

		const rows = [];
		const centre = A.v( 0, side * thick * ( side > 0 ? 1 : 0.4 ), cz, 0.5 - cz, PART.DISC, 0, side );
		for ( let k = 1; k <= nR; k ++ ) {

			const s = k / nR;
			const row = [];
			for ( let j = 0; j < nA; j ++ ) {

				const a = j / nA * TAU;
				const r = outline( a ) * s;
				const x = Math.sin( a ) * r, z = cz + Math.cos( a ) * r * ( eagle ? 1 : 1 );
				// body dome over the middle, thin margins
				const body = Math.exp( - ( x * x ) / ( eagle ? 0.012 : 0.02 ) - Math.pow( ( z - cz ) / 0.28, 2 ) );
				const y = side * ( thick * body * ( side > 0 ? 1 : 0.45 ) + 0.004 * ( 1 - s ) );
				row.push( A.v( x, y, z, 0.5 - z, PART.DISC, Math.abs( x ) / 0.5, side ) );

			}

			rows.push( row );

		}

		for ( let j = 0; j < nA; j ++ ) {

			const j1 = ( j + 1 ) % nA;
			if ( side > 0 ) A.idx.push( centre, rows[ 0 ][ j ], rows[ 0 ][ j1 ] );
			else A.idx.push( centre, rows[ 0 ][ j1 ], rows[ 0 ][ j ] );
			for ( let k = 0; k < nR - 1; k ++ ) {

				const a = rows[ k ][ j ], b = rows[ k ][ j1 ], c = rows[ k + 1 ][ j1 ], d = rows[ k + 1 ][ j ];
				if ( side > 0 ) A.idx.push( a, d, b, b, d, c );
				else A.idx.push( a, b, d, b, c, d );

			}

		}

	}

	// eyes on top
	if ( lod === 0 ) {

		for ( const s of [ 1, - 1 ] ) {

			const ex = s * ( eagle ? 0.09 : 0.06 ), ez = cz + ( eagle ? 0.13 : 0.16 );
			tube( A, [ [ ex, thick * 0.7, ez + 0.012, 0.004 ], [ ex, thick * 0.85, ez, 0.013 ], [ ex, thick * 0.9, ez - 0.012, 0.004 ] ], 6, PART.EYE, () => [ 0, 0 ] );

		}

	}

	// tail: long whip (the eagle ray's is three times the disc length)
	const tl = eagle ? 1.0 : 0.62;
	const tz0 = cz - ( eagle ? 0.19 : 0.4 );
	const tp = [];
	const nT = lod ? 4 : 10;
	for ( let i = 0; i <= nT; i ++ ) {

		const t = i / nT;
		tp.push( [ 0, 0.01 - t * 0.01, tz0 - t * tl, ( eagle ? 0.014 : 0.026 ) * ( 1 - t ) + 0.002, 0.8 ] );

	}

	tube( A, tp, lod ? 3 : 5, PART.WHIP, () => [ 0, 1 ] );
	const g = A.build();
	return g;

}

// Green sea turtle (carapace length ~0.72 of the total length 1, head forward).
export function turtleGeometry( { lod = 0 } = {} ) {

	const A = new Acc();
	const L = 0.72, W = 0.56, Hc = 0.2, zc = - 0.02;
	const nA = lod ? 14 : 30, nR = lod ? 3 : 7;
	// carapace: heart-shaped dome; plastron: flat below
	const rim = ( a ) => {

		const s = Math.sin( a ), c = Math.cos( a );
		const r = 1 / Math.sqrt( ( s * s ) / ( W * W / 4 ) + ( c * c ) / ( L * L / 4 ) );
		return r * ( 1 - 0.12 * Math.pow( Math.max( 0, - c ), 3 ) ) * ( 1 + 0.04 * Math.max( 0, c ) );

	};

	for ( const top of [ true, false ] ) {

		const rows = [];
		const centre = A.v( 0, top ? Hc : - 0.07, zc, 0.5 - zc, top ? PART.CARAPACE : PART.SKIN, 0, top ? 0 : 2 );
		for ( let k = 1; k <= nR; k ++ ) {

			const s = k / nR;
			const row = [];
			for ( let j = 0; j < nA; j ++ ) {

				const a = j / nA * TAU;
				const r = rim( a ) * s;
				const x = Math.sin( a ) * r, z = zc + Math.cos( a ) * r;
				const y = top ? Hc * Math.pow( 1 - s * s, 0.6 ) * ( 1 - 0.1 * Math.cos( a ) ) - 0.02 * s * s : - 0.07 * ( 1 - s * s * s ) - 0.015;
				row.push( A.v( x, y, z, 0.5 - z, top ? PART.CARAPACE : PART.SKIN, x / ( W / 2 ), top ? ( z - zc ) / ( L / 2 ) : 2 ) );

			}

			rows.push( row );

		}

		for ( let j = 0; j < nA; j ++ ) {

			const j1 = ( j + 1 ) % nA;
			if ( top ) A.idx.push( centre, rows[ 0 ][ j ], rows[ 0 ][ j1 ] );
			else A.idx.push( centre, rows[ 0 ][ j1 ], rows[ 0 ][ j ] );
			for ( let k = 0; k < nR - 1; k ++ ) {

				const a = rows[ k ][ j ], b = rows[ k ][ j1 ], c = rows[ k + 1 ][ j1 ], d = rows[ k + 1 ][ j ];
				if ( top ) A.idx.push( a, d, b, b, d, c );
				else A.idx.push( a, b, d, b, c, d );

			}

		}

	}

	// head and neck (w = 1: head skin)
	const sides = lod ? 5 : 9;
	tube( A, [
		[ 0, 0.0, zc + L / 2 - 0.08, 0.075, 0.75 ], [ 0, 0.01, zc + L / 2 + 0.02, 0.065, 0.8 ], [ 0, 0.02, zc + L / 2 + 0.1, 0.07, 0.85 ],
		[ 0, 0.02, zc + L / 2 + 0.16, 0.06, 0.8 ], [ 0, 0.0, zc + L / 2 + 0.2, 0.03, 0.7 ],
	], sides, PART.SKIN, () => [ 0, 1 ] );
	// eyes
	if ( lod === 0 ) for ( const s of [ 1, - 1 ] ) {

		const ex = s * 0.052, ez = zc + L / 2 + 0.13;
		tube( A, [ [ ex, 0.035, ez + 0.012, 0.004 ], [ ex * 1.08, 0.037, ez, 0.013 ], [ ex, 0.035, ez - 0.012, 0.004 ] ], 6, PART.EYE, () => [ 0, 0 ] );

	}

	// flippers: flattened tapered tubes from the shoulders (w = flipper id, z = distance along)
	const flipper = ( id, x0, z0, dir, len, width ) => {

		const pts = [];
		const n = lod ? 4 : 8;
		for ( let i = 0; i <= n; i ++ ) {

			const t = i / n;
			// paddle: widest a third of the way out, curving back toward the tip
			const w = width * ( 0.55 + 0.9 * Math.sin( Math.PI * Math.min( 1, 0.15 + t * 0.95 ) ) ) * ( 1 - 0.7 * t * t );
			const x = x0 + dir[ 0 ] * len * t, z = z0 + dir[ 2 ] * len * t - len * 0.25 * t * t;
			pts.push( [ x, - 0.03 - t * 0.02, z, w, 0.22 ] );

		}

		tube( A, pts, lod ? 4 : 7, PART.FLIPPER, ( i, t ) => [ t, id ] );

	};

	const s2 = Math.SQRT1_2;
	flipper( 0, 0.2, zc + 0.2, [ s2 * 1.2, 0, s2 * 0.2 ], 0.48, 0.07 );
	flipper( 1, - 0.2, zc + 0.2, [ - s2 * 1.2, 0, s2 * 0.2 ], 0.48, 0.07 );
	flipper( 2, 0.16, zc - 0.28, [ 0.8, 0, - 0.6 ], 0.2, 0.06 );
	flipper( 3, - 0.16, zc - 0.28, [ - 0.8, 0, - 0.6 ], 0.2, 0.06 );
	// short tail
	tube( A, [ [ 0, - 0.02, zc - L / 2 + 0.02, 0.035, 0.6 ], [ 0, - 0.03, zc - L / 2 - 0.08, 0.004, 0.6 ] ], lod ? 3 : 5, PART.SKIN, () => [ 0, 1 ] );
	return A.build();

}

// (Salt Life) The spiny lobster's tail hinge (z, y) behind the carapace, and the length of the tail
// from it to the tail fan: the tail curls under on an arc from here (FishMaterial's lobsterPose does
// the same on the GPU).
export const LOBSTER_HINGE = { z: 0.15, y: 0, len: 0.48 };

// a point [ x, y, z ] of the tail curled under by curl (the angle at the tail's end, rad), in place
function curlTail( p, curl ) {

	const H = LOBSTER_HINGE;
	const sA = H.z - p[ 2 ];
	if ( sA <= 0 ) return;
	const sC = Math.min( sA, H.len ), k = curl / H.len, a = k * sC;
	const cz = Math.abs( k ) > 1e-4 ? - Math.sin( a ) / k : - sC;
	const cy = Math.abs( k ) > 1e-4 ? - ( 1 - Math.cos( a ) ) / k : 0;
	const yo = p[ 1 ] - H.y, sx = sA - sC;
	p[ 2 ] = H.z + cz - Math.cos( a ) * sx - Math.sin( a ) * yo;
	p[ 1 ] = H.y + cy - Math.sin( a ) * sx + Math.cos( a ) * yo;

}

// Caribbean spiny lobster (Panulirus argus), in the fish frame: total length 1 from the front of the
// carapace (z = +0.5) to the tail fan (z = -0.5), standing on its legs (their tips at y = -0.112);
// the antennae reach well beyond the length. PART.CHITIN: the spiny carapace (frontal horns over
// the stalked eyes), six tail segments, each tucked under the one before with its side plates, and
// the tail fan (aData w: 0 .. 1 carapace, 1 .. 7 the segments, 7 .. 8 the fan, 9 the eyes, 10 .. 11
// the spines along each; z: round the shell, 0 back .. 1 belly, across the fan -1 .. 1). PART.LEG:
// five pairs of walking legs (z along the leg, w = pair * 2 + side (1 right) + a stripe coordinate
// round it under 1). PART.FEELER: the thick spiny antennae with their whips and the slender
// antennules (z along, w = 0 / 1 antennae left / right, 2 / 3 antennules). curl: the tail curled
// under (rad; for a lobster out of the water: the swimming one curls on the GPU).
export function lobsterGeometry( { lod = 0, curl = 0 } = {} ) {

	const A = new Acc();
	const far = lod >= 2;
	const nA = [ 22, 12, 8 ][ Math.min( lod, 2 ) ];
	// the shell: rings [ z, half width, height above, depth below, squareness, plate coordinate ]
	const rings = [];
	const nC = [ 12, 6, 4 ][ Math.min( lod, 2 ) ];
	for ( let i = 0; i <= nC; i ++ ) {

		const t = i / nC;
		const f = Math.sqrt( smooth( 0, 0.22, t ) ); // the rounded front
		rings.push( [ 0.47 - t * 0.32, ( 0.068 + 0.032 * t ) * ( 0.5 + 0.5 * f ), ( 0.078 + 0.016 * t ) * ( 0.55 + 0.45 * f ), 0.058 * ( 0.65 + 0.35 * f ), 2.4, t * 0.999 ] );

	}

	const nS = [ 4, 2, 1 ][ Math.min( lod, 2 ) ];
	for ( let k = 0; k < 6; k ++ ) for ( let i = 0; i <= nS; i ++ ) {

		const t = i / nS, g = ( k + t ) / 6;
		const tuck = 0.9 + 0.1 * smooth( 0, 0.4, t );
		rings.push( [ LOBSTER_HINGE.z - ( k + t ) * 0.08 - 0.004 * ( 1 - t ), lerp( 0.094, 0.058, g ) * tuck, lerp( 0.066, 0.032, g ) * tuck, lerp( 0.042, 0.022, g ), 2.6, 1 + k + t * 0.999 ] );

	}

	const section = ( r, phi ) => {

		const s = Math.sin( phi ), c = Math.cos( phi ), e = 2 / r[ 4 ];
		const a = Math.min( phi, TAU - phi ); // 0 on the back .. PI on the belly
		const x = r[ 1 ] * Math.sign( s ) * Math.pow( Math.abs( s ), e );
		let y = c >= 0 ? r[ 2 ] * Math.pow( c, e ) : - r[ 3 ] * Math.pow( - c, e );
		// the tail's side plates: ridges hanging along its lower sides
		if ( r[ 5 ] >= 1 ) y -= r[ 3 ] * 0.45 * Math.exp( - Math.pow( ( a - 2.2 ) / 0.25, 2 ) );
		return [ x, y, a ];

	};

	const rows = rings.map( ( r ) => {

		const row = [];
		for ( let j = 0; j < nA; j ++ ) {

			const [ x, y, a ] = section( r, j / nA * TAU );
			row.push( A.v( x, y, r[ 0 ], 0.5 - r[ 0 ], PART.CHITIN, a / Math.PI, r[ 5 ] ) );

		}

		return row;

	} );
	for ( let i = 0; i < rows.length - 1; i ++ ) for ( let j = 0; j < nA; j ++ ) {

		const j1 = ( j + 1 ) % nA;
		const a = rows[ i ][ j ], b = rows[ i ][ j1 ], c = rows[ i + 1 ][ j1 ], d = rows[ i + 1 ][ j ];
		A.idx.push( a, b, d, b, c, d );

	}

	// the front of the carapace and the end of the tail closed
	const first = rings[ 0 ], last = rings[ rings.length - 1 ];
	const nose = A.v( 0, 0.01, first[ 0 ] + 0.014, 0.5 - first[ 0 ] - 0.014, PART.CHITIN, 0.3, 0 );
	const end = A.v( 0, 0, last[ 0 ] - 0.004, 0.5 - last[ 0 ] + 0.004, PART.CHITIN, 0.3, 6.999 );
	for ( let j = 0; j < nA; j ++ ) {

		const j1 = ( j + 1 ) % nA;
		A.idx.push( nose, rows[ 0 ][ j1 ], rows[ 0 ][ j ] );
		A.idx.push( end, rows[ rows.length - 1 ][ j ], rows[ rows.length - 1 ][ j1 ] );

	}

	// the tail fan: the telson between two pairs of uropods, a thin plate drooping a little
	const nQ = [ 10, 4, 2 ][ Math.min( lod, 2 ) ], nT = [ 5, 2, 1 ][ Math.min( lod, 2 ) ];
	const z0 = last[ 0 ] + 0.006;
	for ( const top of [ 1, - 1 ] ) {

		const grid = [];
		for ( let i = 0; i <= nT; i ++ ) {

			const t = i / nT, row = [];
			for ( let j = 0; j <= nQ; j ++ ) {

				const q = - 1 + 2 * j / nQ;
				const half = 0.05 + 0.065 * Math.sin( Math.PI / 2 * Math.min( 1, t * 1.3 ) );
				const z = z0 - t * 0.175 * ( 1 - 0.14 * q * q );
				const y = - 0.004 - 0.012 * t + top * 0.005 * ( 1 - 0.7 * t );
				row.push( A.v( q * half, y, z, 0.5 - z, PART.CHITIN, q, 7 + t * 0.999 ) );

			}

			grid.push( row );

		}

		for ( let i = 0; i < nT; i ++ ) for ( let j = 0; j < nQ; j ++ ) {

			const a = grid[ i ][ j ], b = grid[ i ][ j + 1 ], c = grid[ i + 1 ][ j + 1 ], d = grid[ i + 1 ][ j ];
			if ( top > 0 ) A.idx.push( a, b, d, b, c, d );
			else A.idx.push( a, d, b, b, d, c );

		}

	}

	if ( ! far ) {

		const sides = lod ? 4 : 6;
		for ( const s of [ 1, - 1 ] ) {

			// the stalked eyes, and the frontal horns over them
			tube( A, [ [ s * 0.02, 0.03, 0.462, 0.007 ], [ s * 0.034, 0.04, 0.488, 0.006 ] ], sides, PART.CHITIN, () => [ 0.2, 9 ], false );
			tube( A, [ [ s * 0.034, 0.04, 0.486, 0.002 ], [ s * 0.037, 0.042, 0.497, 0.012 ], [ s * 0.04, 0.044, 0.508, 0.002 ] ], sides, PART.CHITIN, () => [ 0.2, 9.6 ] );
			tube( A, [ [ s * 0.026, 0.045, 0.445, 0.016 ], [ s * 0.034, 0.082, 0.49, 0.01 ], [ s * 0.03, 0.104, 0.53, 0.0015 ] ], sides, PART.CHITIN, ( i, t ) => [ 0.05, 10 + t * 0.999 ] );

		}

	}

	// the spines over the carapace, pointing forward
	if ( lod === 0 ) {

		let h = 7;
		const rnd = () => ( h = ( h * 16807 ) % 2147483647 ) / 2147483647;
		for ( const tc of [ 0.12, 0.27, 0.42, 0.6, 0.75, 0.9 ] ) for ( const phi of [ 0.3, 0.78, 1.25, - 0.3, - 0.78, - 1.25 ] ) {

			const i = tc * nC, i0 = Math.floor( i ), i1 = Math.min( nC, i0 + 1 ), fr = i - i0;
			const r = rings[ i0 ].map( ( v, k ) => lerp( v, rings[ i1 ][ k ], fr ) );
			const ph = ( phi + TAU ) % TAU;
			const [ x, y, a ] = section( r, ph );
			const nx = Math.sin( phi ), ny = Math.cos( phi );
			const len = 0.012 + 0.01 * rnd();
			const dx = nx * 0.55, dy = ny * 0.55 + 0.1, dz = 0.8, dl = Math.hypot( dx, dy, dz );
			tube( A, [ [ x - nx * 0.002, y - ny * 0.002, r[ 0 ], 0.0045 ], [ x + dx / dl * len, y + dy / dl * len, r[ 0 ] + dz / dl * len, 0.0006 ] ], 3, PART.CHITIN, ( k, t ) => [ a / Math.PI, 10 + t * 0.999 ] );

		}

	}

	// five pairs of walking legs, arched out and down to the ground; the front pairs reach forward,
	// the hind ones back: [ z at the base, reach forward ]
	const legs = [ [ 0.4, 0.08 ], [ 0.35, 0.035 ], [ 0.3, 0 ], [ 0.25, - 0.04 ], [ 0.2, - 0.085 ] ];
	legs.forEach( ( [ zb, fw ], k ) => {

		for ( const s of [ 1, - 1 ] ) {

			let pts = [
				[ s * 0.045, - 0.045, zb, 0.011 ],
				[ s * 0.1, - 0.03, zb + fw * 0.35, 0.009 ],
				[ s * 0.15, - 0.02, zb + fw * 0.65, 0.008 ],
				[ s * 0.18, - 0.07, zb + fw * 0.88, 0.0065 ],
				[ s * 0.19, - 0.112, zb + fw, 0.0025 ],
			];
			if ( far ) pts = [ pts[ 0 ], pts[ 2 ], pts[ 4 ] ];
			const id = k * 2 + ( s > 0 ? 1 : 0 );
			tube( A, pts, far ? 3 : lod ? 4 : 6, PART.LEG, ( i, t, a ) => [ t, id + ( a === undefined ? 0.5 : Math.cos( a ) * 0.45 + 0.5 ) ] );

		}

	} );

	// the antennae: thick, spiny bases, then whips longer than the body, out to the sides in a V
	const nF = [ 16, 8, 4 ][ Math.min( lod, 2 ) ];
	for ( const s of [ 1, - 1 ] ) {

		const pts = [];
		for ( let i = 0; i <= nF; i ++ ) {

			const t = i / nF, len = 1.15 * t;
			const r = t < 0.16 ? lerp( 0.026, 0.017, t / 0.16 ) : lerp( 0.012, 0.0018, Math.pow( ( t - 0.16 ) / 0.84, 0.6 ) );
			pts.push( [ s * ( 0.035 + len * 0.36 + len * len * 0.12 ), len * 0.16 - len * len * 0.1, 0.46 + len * 0.9 - len * len * 0.12, r ] );

		}

		tube( A, pts, far ? 3 : lod ? 4 : 7, PART.FEELER, ( i, t ) => [ t, s > 0 ? 1 : 0 ] );

	}

	// the antennules between them
	if ( ! far ) for ( const s of [ 1, - 1 ] ) {

		const pts = [];
		const n = lod ? 3 : 8;
		for ( let i = 0; i <= n; i ++ ) {

			const t = i / n, len = 0.42 * t;
			pts.push( [ s * ( 0.012 + len * 0.12 ), - 0.012 + len * 0.18, 0.47 + len * 0.95, lerp( 0.007, 0.0015, t ) ] );

		}

		tube( A, pts, lod ? 3 : 5, PART.FEELER, ( i, t ) => [ t, s > 0 ? 3 : 2 ] );

	}

	if ( curl ) {

		const p = [ 0, 0, 0 ];
		for ( let i = 0; i < A.pos.length / 3; i ++ ) {

			if ( A.dat[ i * 4 + 1 ] !== PART.CHITIN ) continue;
			p[ 0 ] = A.pos[ i * 3 ]; p[ 1 ] = A.pos[ i * 3 + 1 ]; p[ 2 ] = A.pos[ i * 3 + 2 ];
			curlTail( p, curl );
			A.pos[ i * 3 + 1 ] = p[ 1 ]; A.pos[ i * 3 + 2 ] = p[ 2 ];

		}

	}

	return A.build();

}
