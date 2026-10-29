import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { WRECK, SECTIONS, toWorld, yawOf } from './wreck/WreckPlan.js';

// (M15) The wreck on the windward reef (wreck/WreckPlan.js says where it lies): a small steel coaster broken in
// two, decades on, shaped after photographs of steel wrecks in the surf (the Maheno on Fraser Island; the
// Sapona off Bimini for how a hull decays above the water).
//   - its hull a smooth shell of strakes over frames: the plating dished between the frames, lap seams and
//     rivet rows along it; the upper strakes rotted through between the frames into ragged holes (the comb the
//     photographs show), a row of portholes, the frames and the deck beams inside seen through them; dented
//   - torn at the break, its plating crumpled and flared there, its deck ripped, plates fallen on the reef
//   - its deck holed, a hatch beam fallen into the hold, the windlass, bollards, a winch, vents, the mast bent
//     over; aft, its accommodation decayed to its posts and beams and holed plates, the wheelhouse's windows
//     empty and its roof sagging, a funnel stump, the davits, a ladder; bent rail stanchions along its edges
//   - its colour rust in every shade, worked out in the hull's own metres (it stays on the plates): streaked
//     down from the holes and the seams, salt-stained, a few patches of old paint low down; below the sea grown
//     over; at the sea a dark band of weed
// Each surface says what it is (aMeta.x: 0 hull plating, 1 deck plating, 2 structure's plates, 3 solid members),
// which the shader cuts holes in and shades by; aMeta.y the plating's height to its top edge (hull) or how near
// the tear (deck).
//   const w = new Wreck( { scene, colliders } )

const L = WRECK.length, B = WRECK.beam, D = WRECK.depth, R = 1.1; // (R: the bilge's radius)
const FRAME = 0.6; // m between frames
const FILL = 8; // its faces out of the sun: the scene's environment light, this many times over
const KIND = { HULL: 0, DECK: 1, PLATE: 2, SOLID: 3 };
// what's left of its paint: black topsides, red-brown below its old waterline, the house once white; its steel
const PAINT = { bottom: 0x4a2318, side: 0x231d1a, house: 0x8a7d6a, deck: 0x4a3a2c, steel: 0x4a3426 };

const sstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
const hash = ( i, j ) => {

	const h = Math.sin( i * 127.1 + j * 311.7 ) * 43758.5453;
	return h - Math.floor( h );

};
const noise2 = ( x, y ) => {

	const i = Math.floor( x ), j = Math.floor( y ), fx = x - i, fy = y - j, u = fx * fx * ( 3 - 2 * fx ), v = fy * fy * ( 3 - 2 * fy );
	const a = hash( i, j ), b = hash( i + 1, j ), c = hash( i, j + 1 ), d = hash( i + 1, j + 1 );
	return ( a + ( b - a ) * u ) * ( 1 - v ) + ( c + ( d - c ) * u ) * v;

};

// the keel's rise aft, the deck's height (its sheer, and the forecastle), the stem's rake
const keelAt = ( x ) => x < 7 ? 1.4 * Math.pow( 1 - x / 7, 1.6 ) : 0;
const deckAt = ( x ) => D + 0.55 * Math.pow( Math.abs( x / L - 0.42 ) / 0.58, 2 ) + 1.3 * sstep( L - 7.3, L - 7, x );
const stemX = ( y ) => L - 2.2 * Math.pow( 1 - Math.min( 1, Math.max( 0, y / D ) ), 1.3 );

function halfBreadth( x, y ) {

	const base = y < R ? ( B / 2 - R ) + Math.sqrt( Math.max( 0, R * R - ( R - y ) * ( R - y ) ) ) : B / 2 + 0.04 * ( y - R );
	let s = 1;
	const xf = 0.6 * L, xs = stemX( y );
	if ( x > xf ) {

		const k = Math.min( 1, Math.max( 0, ( x - xf ) / Math.max( 0.01, xs - xf ) ) );
		s = 1 - Math.pow( k, 1.5 + 1.1 * Math.min( 1, y / D ) );

	}

	if ( x < 6 ) {

		const k = 1 - x / 6;
		s *= 1 - 0.28 * k * k * ( 1 - Math.min( 1, y / D ) );

	}

	return Math.max( 0, base * s );

}

// ---- a geometry builder: shared-vertex grids (smooth) and loose faces; each vertex its colour, uv (m) and
// meta ( kind, a value for the shader )
class Builder {

	constructor() {

		this.p = [];
		this.c = [];
		this.uv = [];
		this.m = [];
		this.i = [];

	}

	vert( p, col, uv, meta ) {

		this.p.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		const k = typeof col === 'number' ? new THREE.Color( col ) : col;
		this.c.push( k.r, k.g, k.b );
		this.uv.push( uv[ 0 ], uv[ 1 ] );
		this.m.push( meta[ 0 ], meta[ 1 ] );
		return this.p.length / 3 - 1;

	}

	// a grid of points: rows[ r ][ c ] = { p, col, uv, meta }; skip( r, c ): leave its quad out
	grid( rows, skip = null ) {

		const ids = rows.map( ( row ) => row.map( ( q ) => this.vert( q.p, q.col, q.uv, q.meta ) ) );
		for ( let r = 0; r < rows.length - 1; r ++ ) for ( let c = 0; c < rows[ r ].length - 1; c ++ ) {

			if ( skip && skip( r, c ) ) continue;
			const a = ids[ r ][ c ], b = ids[ r ][ c + 1 ], d = ids[ r + 1 ][ c ], e = ids[ r + 1 ][ c + 1 ];
			this.i.push( a, d, e, a, e, b );

		}

	}

	// a box ( centre, half sizes, turned by rot: Euler x y z ), solid steel
	box( cx, cy, cz, hx, hy, hz, col, kind = KIND.SOLID, rot = [ 0, 0, 0 ] ) {

		const e = new THREE.Euler( rot[ 0 ], rot[ 1 ], rot[ 2 ] ), v = new THREE.Vector3();
		const at = ( sx, sy, sz ) => {

			v.set( sx * hx, sy * hy, sz * hz ).applyEuler( e );
			return [ cx + v.x, cy + v.y, cz + v.z ];

		};

		const faces = [
			[ [ - 1, 1, - 1 ], [ - 1, 1, 1 ], [ 1, 1, 1 ], [ 1, 1, - 1 ] ], [ [ - 1, - 1, - 1 ], [ 1, - 1, - 1 ], [ 1, - 1, 1 ], [ - 1, - 1, 1 ] ],
			[ [ 1, - 1, - 1 ], [ 1, 1, - 1 ], [ 1, 1, 1 ], [ 1, - 1, 1 ] ], [ [ - 1, - 1, - 1 ], [ - 1, - 1, 1 ], [ - 1, 1, 1 ], [ - 1, 1, - 1 ] ],
			[ [ - 1, - 1, - 1 ], [ - 1, 1, - 1 ], [ 1, 1, - 1 ], [ 1, - 1, - 1 ] ], [ [ - 1, - 1, 1 ], [ 1, - 1, 1 ], [ 1, 1, 1 ], [ - 1, 1, 1 ] ],
		];
		for ( const f of faces ) {

			const ids = f.map( ( s ) => this.vert( at( ...s ), col, [ cx + s[ 0 ] * hx + s[ 2 ] * hz, cy + s[ 1 ] * hy ], [ kind, 0 ] ) );
			this.i.push( ids[ 0 ], ids[ 1 ], ids[ 2 ], ids[ 0 ], ids[ 2 ], ids[ 3 ] );

		}

	}

	// a tube along points [ [ x, y, z ], … ], radius r, n sides, solid steel
	tube( pts, r, col, n = 6 ) {

		const rows = [], up = new THREE.Vector3( 0, 1, 0 );
		for ( let k = 0; k < pts.length; k ++ ) {

			const a = new THREE.Vector3( ...pts[ Math.max( 0, k - 1 ) ] ), b = new THREE.Vector3( ...pts[ Math.min( pts.length - 1, k + 1 ) ] );
			const t = b.sub( a ).normalize(), s = new THREE.Vector3().crossVectors( t, Math.abs( t.y ) > 0.9 ? new THREE.Vector3( 1, 0, 0 ) : up ).normalize(), q = new THREE.Vector3().crossVectors( s, t );
			const row = [];
			for ( let j = 0; j <= n; j ++ ) {

				const ang = j / n * Math.PI * 2, o = s.clone().multiplyScalar( Math.cos( ang ) * r ).addScaledVector( q, Math.sin( ang ) * r );
				row.push( { p: [ pts[ k ][ 0 ] + o.x, pts[ k ][ 1 ] + o.y, pts[ k ][ 2 ] + o.z ], col, uv: [ k * 0.5, j / n ], meta: [ KIND.SOLID, 0 ] } );

			}

			rows.push( row );

		}

		this.grid( rows );

	}

	// a flat plate: corner o, sides a and b (vectors), nu x nv cells; kind PLATE (holed); skip( i, j )
	plate( o, a, b, nu, nv, col, skip = null, kind = KIND.PLATE ) {

		const la = Math.hypot( ...a ), lb = Math.hypot( ...b ), rows = [];
		for ( let j = 0; j <= nv; j ++ ) {

			const row = [];
			for ( let i = 0; i <= nu; i ++ ) {

				const s = i / nu, t = j / nv;
				row.push( { p: [ o[ 0 ] + a[ 0 ] * s + b[ 0 ] * t, o[ 1 ] + a[ 1 ] * s + b[ 1 ] * t, o[ 2 ] + a[ 2 ] * s + b[ 2 ] * t ], col, uv: [ s * la + o[ 0 ] + o[ 2 ], t * lb + o[ 1 ] ], meta: [ kind, lb * ( 1 - t ) ] } );

			}

			rows.push( row );

		}

		this.grid( rows, skip ? ( r, c ) => skip( c, r ) : null );

	}

	geometry() {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.p, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( this.c, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( this.uv, 2 ) );
		g.setAttribute( 'aMeta', new THREE.Float32BufferAttribute( this.m, 2 ) );
		g.setIndex( this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute( this.i, 1 ) : new THREE.Uint16BufferAttribute( this.i, 1 ) );
		return g;

	}

}

// ---- the hull: a piece of it, x0..x1 along the ship, torn at its broken end (`torn`: 'fore' or 'aft' of it)
function hullPiece( b, x0, x1, torn, seed ) {

	const NJ = 22, xs = [];
	for ( let x = x0; x < x1 - 1e-6; x += 0.3 ) xs.push( x );
	xs.push( x1 );
	const edgeX = torn === 'aft' ? x0 : x1, dir = torn === 'aft' ? 1 : - 1;
	// near the tear (0..1 over its last 2.5 m)
	const nearTear = ( x ) => torn ? 1 - sstep( 0, 2.5, ( x - edgeX ) * dir ) : 0;
	// one side's profile, top (the bulwark's) to keel: [ { p, girth, y } ] with the ragged, crumpled tear and the
	// dents
	const side = ( x, s ) => {

		const top = deckAt( x ) + 1.0, keel = keelAt( x ), out = [];
		for ( let j = 0; j <= NJ; j ++ ) {

			const t = j / NJ, y = keel + ( top - keel ) * ( 1 - Math.pow( t, 1.2 ) );
			let xx = x;
			if ( x === edgeX && torn ) xx = x + dir * ( 1.9 * Math.pow( 1 - t, 1.4 ) + 0.9 * noise2( j * 0.9 + ( s > 0 ? 7 : 0 ), seed ) );
			let w = halfBreadth( xx, y );
			// dents, and the crumpling and flaring at the tear
			const k = nearTear( xx ), u = Math.max( 0, 1 - t );
			w += ( noise2( xx * 0.35, y * 0.5 + s * 9 + seed ) - 0.5 ) * 0.12;
			w += k * ( ( noise2( xx * 1.6 + 3, y * 1.4 + s * 5 ) - 0.5 ) * 0.7 + 0.45 * u * u );
			out.push( { p: [ xx, y - k * 0.25 * u * noise2( y, s ), s * Math.max( 0, w ) ], y } );

		}

		// (its girth up from the keel's middle, m)
		let g = halfBreadth( x, keel );
		out[ NJ ].girth = g;
		for ( let j = NJ - 1; j >= 0; j -- ) {

			g += Math.hypot( out[ j ].p[ 1 ] - out[ j + 1 ].p[ 1 ], out[ j ].p[ 2 ] - out[ j + 1 ].p[ 2 ] );
			out[ j ].girth = g;

		}

		return out;

	};
	const colOf = ( y ) => y < 2.3 ? PAINT.bottom : PAINT.side;
	const rows = xs.map( ( x ) => {

		const port = side( x, - 1 ), stbd = side( x, 1 ), top = port[ 0 ].girth;
		const row = [];
		for ( const q of port ) row.push( { p: q.p, col: colOf( q.y ), uv: [ q.p[ 0 ], q.girth ], meta: [ KIND.HULL, top ] } );
		for ( let j = NJ; j >= 0; j -- ) row.push( { p: stbd[ j ].p, col: colOf( stbd[ j ].y ), uv: [ stbd[ j ].p[ 0 ] + 0.37, stbd[ j ].girth ], meta: [ KIND.HULL, top ] } );
		return row;

	} );
	b.grid( rows );

	// the frames inside it, every FRAME m: flat bars round the section, a hand's depth in from the plating
	for ( let x = Math.ceil( x0 / FRAME ) * FRAME; x <= x1; x += FRAME ) {

		if ( torn && ( x - edgeX ) * dir < 0.15 ) continue;
		for ( const s of [ - 1, 1 ] ) {

			const top = deckAt( x ), keel = keelAt( x ), ring = [];
			for ( let j = 0; j <= 8; j ++ ) {

				const y = keel + ( top - keel ) * j / 8, w = halfBreadth( x, y ) + nearTear( x ) * 0.3;
				ring.push( [ { p: [ x, y, s * ( w - 0.03 ) ], col: PAINT.steel, uv: [ x, y ], meta: [ KIND.SOLID, 0 ] }, { p: [ x, y, s * ( w - 0.24 ) ], col: PAINT.steel, uv: [ x, y + 0.2 ], meta: [ KIND.SOLID, 0 ] } ] );

			}

			b.grid( ring );

		}

		// its deck beam
		const y = deckAt( x ) - 0.12, w = halfBreadth( x, y );
		if ( w > 0.5 ) b.box( x, y, 0, 0.06, 0.1, w - 0.1, PAINT.steel );

	}

	// the deck: rows along it, across in 10; its holds' hatches open; its plating holed, torn near the break
	const holds = [ [ 0.43 * L, 0.54 * L ], [ 0.65 * L, 0.75 * L ] ];
	const deckRows = xs.map( ( x ) => {

		const y = deckAt( x ), w = halfBreadth( x, y ), row = [];
		for ( let c = 0; c <= 10; c ++ ) {

			const z = ( c / 10 * 2 - 1 ) * w, k = nearTear( x );
			row.push( { p: [ x, y - k * 0.6 * ( 1 - Math.abs( z ) / ( w + 0.01 ) ) * noise2( z, x ), z ], col: PAINT.deck, uv: [ x, z ], meta: [ KIND.DECK, k ] } );

		}

		return row;

	} );
	b.grid( deckRows, ( r, c ) => {

		const x = ( xs[ r ] + xs[ r + 1 ] ) / 2, z = ( c + 0.5 ) / 10 * 2 - 1;
		return holds.some( ( [ h0, h1 ] ) => x > h0 && x < h1 ) && Math.abs( z ) < 0.6;

	} );

	// the hatches' coamings (holed plates round them), their beams across (one fallen into the hold)
	for ( const [ h0, h1 ] of holds ) {

		if ( h1 < x0 || h0 > x1 ) continue;
		const y = deckAt( ( h0 + h1 ) / 2 ), w = 0.6 * halfBreadth( ( h0 + h1 ) / 2, y );
		for ( const s of [ - 1, 1 ] ) b.plate( [ h0, y, s * w ], [ h1 - h0, 0, 0 ], [ 0, 0.75, 0 ], 12, 2, PAINT.steel );
		for ( const xx of [ h0, h1 ] ) b.plate( [ xx, y, - w ], [ 0, 0, 2 * w ], [ 0, 0.75, 0 ], 8, 2, PAINT.steel );
		for ( let k = 1; k < 3; k ++ ) {

			const xx = h0 + ( h1 - h0 ) * k / 3;
			if ( k === 2 && h0 < 0.6 * L ) b.box( xx - 0.6, y - 1.6, 0.3, 0.09, 0.14, w, PAINT.steel, KIND.SOLID, [ 0.5, 0.4, 0.2 ] );
			else b.box( xx, y + 0.78, 0, 0.09, 0.14, w + 0.05, PAINT.steel );

		}

	}

	// the forecastle's front, holed; and bent stanchions along its edges, some gone
	if ( x1 > L - 7 ) {

		const x = L - 7.15, y = deckAt( x - 0.3 ), w = halfBreadth( x, y );
		b.plate( [ x, y, - w ], [ 0, 0, 2 * w ], [ 0, 1.3, 0 ], 10, 3, PAINT.side );
		for ( let xx = L - 6.5; xx < L - 1.5; xx += 1.1 ) for ( const s of [ - 1, 1 ] ) {

			if ( hash( xx * 3, s ) < 0.3 ) continue;
			const yy = deckAt( xx ) + 1.0, ww = halfBreadth( xx, yy ) - 0.05, bend = ( hash( xx, s + 4 ) - 0.3 ) * 0.8;
			b.tube( [ [ xx, yy, s * ww ], [ xx, yy + 0.5, s * ( ww + 0.05 ) ], [ xx + bend * 0.3, yy + 0.95, s * ( ww + bend * 0.4 ) ] ], 0.025, PAINT.steel, 4 );

		}

	}

}

// ---- what stands on the bow piece: the windlass, bollards, a winch, vents, the mast bent over and its boom
function bowGear( b ) {

	const fy = deckAt( L - 4 );
	// the windlass: its bed, two drums
	b.box( L - 4.2, fy + 0.25, 0, 0.5, 0.25, 1.3, PAINT.steel );
	for ( const s of [ - 1, 1 ] ) b.tube( [ [ L - 4.2, fy + 0.7, s * 0.3 ], [ L - 4.2, fy + 0.7, s * 1.25 ] ], 0.32, PAINT.steel, 10 );
	for ( const [ x, s ] of [ [ L - 6, - 1 ], [ L - 6, 1 ], [ 24, - 1 ], [ 24, 1 ] ] ) {

		const y = deckAt( x ), w = halfBreadth( x, y ) - 0.7;
		b.box( x, y + 0.05, s * w, 0.55, 0.05, 0.25, PAINT.steel );
		for ( const d of [ - 0.3, 0.3 ] ) b.tube( [ [ x + d, y, s * w ], [ x + d, y + 0.45, s * w ] ], 0.13, PAINT.steel, 8 );

	}

	// a cargo winch by the mast
	const wx = 0.6 * L, wy = deckAt( wx );
	b.box( wx - 1.4, wy + 0.4, 0, 0.6, 0.4, 0.7, PAINT.steel );
	b.tube( [ [ wx - 1.4, wy + 0.9, - 0.9 ], [ wx - 1.4, wy + 0.9, 0.9 ] ], 0.28, PAINT.steel, 10 );
	// mushroom vents
	for ( const [ x, z ] of [ [ 22, 2.2 ], [ 27.5, - 2.4 ], [ 33.6, 2.0 ] ] ) {

		const y = deckAt( x );
		b.tube( [ [ x, y, z ], [ x, y + 0.7, z ] ], 0.14, PAINT.steel, 8 );
		b.tube( [ [ x, y + 0.7, z ], [ x, y + 0.85, z ] ], 0.3, PAINT.steel, 10 );

	}

	// the mast, bent over to port, its crosstree, its boom fallen across the hatch
	const h = 8, lean = 0.5, pts = [];
	for ( let k = 0; k <= 8; k ++ ) {

		const t = k / 8, a = lean * t * t;
		pts.push( [ wx + 0.3 * t, wy + h * t * Math.cos( a ), - h * t * Math.sin( a ) ] );

	}

	b.tube( pts, 0.17, PAINT.steel, 8 );
	const [ tx, ty, tz ] = pts[ 6 ];
	b.box( tx, ty, tz, 0.08, 0.08, 1.5, PAINT.steel, KIND.SOLID, [ 0, 0, 0.3 ] );
	b.tube( [ [ wx + 0.2, wy + 1.2, 0 ], [ wx + 4.5, wy + 0.4, 1.6 ], [ wx + 7.5, wy - 0.4, 2.5 ] ], 0.12, PAINT.steel, 6 );

}

// ---- what's aft, on the stern piece: the transom; the accommodation decayed to its posts and beams and holed
// plates, the wheelhouse's empty windows and sagging roof, a funnel stump, the davits, a ladder, bollards
function sternGear( b ) {

	// the transom, holed as the rest
	const NJ = 12, rows = [];
	for ( let j = 0; j <= NJ; j ++ ) {

		const y = keelAt( 0 ) + ( deckAt( 0 ) + 1 - keelAt( 0 ) ) * j / NJ, w = halfBreadth( 0.05, y );
		const row = [];
		for ( let c = 0; c <= 8; c ++ ) row.push( { p: [ 0.02, y, ( c / 8 * 2 - 1 ) * w ], col: y < 2.3 ? PAINT.bottom : PAINT.side, uv: [ ( c / 8 * 2 - 1 ) * w + 40, y ], meta: [ KIND.HULL, deckAt( 0 ) + 1.5 ] } );
		rows.push( row );

	}

	b.grid( rows );
	const y0 = deckAt( 5 ), X0 = 1.6, X1 = 8.6, W = 3.0, H = 2.4;
	// the house: its posts, its top beams, its walls (plates: holed), a window or two
	for ( const x of [ X0, ( X0 + X1 ) / 2, X1 ] ) for ( const z of [ - W, W ] ) b.box( x, y0 + H / 2, z, 0.07, H / 2, 0.07, PAINT.steel );
	for ( const z of [ - W, W ] ) b.box( ( X0 + X1 ) / 2, y0 + H, z, ( X1 - X0 ) / 2, 0.07, 0.07, PAINT.steel );
	for ( const x of [ X0, X1 ] ) b.box( x, y0 + H, 0, 0.07, 0.07, W, PAINT.steel );
	for ( const z of [ - W, W ] ) b.plate( [ X0, y0, z ], [ X1 - X0, 0, 0 ], [ 0, H, 0 ], 14, 5, PAINT.house, ( i, j ) => j === 3 && ( i % 5 === 2 ) );
	b.plate( [ X1, y0, - W ], [ 0, 0, 2 * W ], [ 0, H, 0 ], 12, 5, PAINT.house, ( i, j ) => j === 3 && i % 4 === 1 );
	// its roof, holed, the wheelhouse on it
	b.plate( [ X0, y0 + H, - W ], [ X1 - X0, 0, 0 ], [ 0, 0, 2 * W ], 14, 12, PAINT.house );
	const Y1 = y0 + H, A0 = 3.4, A1 = 7.6, V = 2.3, Hw = 2.1;
	for ( const x of [ A0, A1 ] ) for ( const z of [ - V, V ] ) b.box( x, Y1 + Hw / 2, z, 0.07, Hw / 2, 0.07, PAINT.steel );
	// (its front: its windows' frames, the glass long gone)
	b.plate( [ A1, Y1, - V ], [ 0, 0, 2 * V ], [ 0, Hw, 0 ], 10, 6, PAINT.house, ( i, j ) => ( j === 3 || j === 4 ) && i % 2 === 1 );
	for ( const z of [ - V, V ] ) b.plate( [ A0, Y1, z ], [ A1 - A0, 0, 0 ], [ 0, Hw, 0 ], 9, 6, PAINT.house, ( i, j ) => ( j === 3 || j === 4 ) && i > 1 && i < 8 && i % 2 === 0 );
	// (its roof sagging in, fallen at its back corner)
	const roof = [];
	for ( let j = 0; j <= 6; j ++ ) {

		const row = [];
		for ( let i = 0; i <= 8; i ++ ) {

			const s = i / 8, t = j / 6, x = A0 + ( A1 - A0 ) * s, z = - V + 2 * V * t;
			const sag = 0.35 * Math.sin( Math.PI * s ) * Math.sin( Math.PI * t ) + 0.9 * ( 1 - s ) * t * t;
			row.push( { p: [ x, Y1 + Hw - sag, z ], col: PAINT.house, uv: [ x, z ], meta: [ KIND.DECK, 0.6 ] } );

		}

		roof.push( row );

	}

	b.grid( roof );
	// the funnel's stump, leaning
	const fun = [];
	for ( let k = 0; k <= 4; k ++ ) {

		const row = [], y = Y1 + 0.45 * k, lean = 0.08 * k;
		for ( let j = 0; j <= 14; j ++ ) {

			const a = j / 14 * Math.PI * 2;
			row.push( { p: [ 2.5 + Math.cos( a ) * 0.68 - lean, y, Math.sin( a ) * 0.68 ], col: 0x2a2220, uv: [ j / 14 * 4.3, y ], meta: [ KIND.PLATE, ( 4 - k ) * 0.45 ] } );

		}

		fun.push( row );

	}

	b.grid( fun );
	// the davits, a ladder, bollards
	for ( const z of [ - 1, 1 ] ) {

		const pts = [];
		for ( let k = 0; k <= 6; k ++ ) {

			const t = k / 6;
			pts.push( [ 4.5, y0 + 2.6 * Math.sin( t * Math.PI / 2 ), z * ( W + 0.25 + 0.9 * ( 1 - Math.cos( t * Math.PI / 2 ) ) ) ] );

		}

		b.tube( pts, 0.08, PAINT.steel, 6 );

	}

	for ( const s of [ - 1, 1 ] ) b.tube( [ [ X1 + 0.6, y0, s * 0.35 ], [ X1 + 0.1, Y1, s * 0.35 ] ], 0.035, PAINT.steel, 4 );
	for ( let k = 1; k < 8; k ++ ) {

		const t = k / 8;
		b.tube( [ [ X1 + 0.6 - 0.5 * t, y0 + ( Y1 - y0 ) * t, - 0.35 ], [ X1 + 0.6 - 0.5 * t, y0 + ( Y1 - y0 ) * t, 0.35 ] ], 0.02, PAINT.steel, 4 );

	}

	for ( const s of [ - 1, 1 ] ) {

		const x = 0.9, y = deckAt( x ), w = halfBreadth( x, y ) - 0.6;
		for ( const d of [ - 0.3, 0.3 ] ) b.tube( [ [ x + d, y, s * w ], [ x + d, y + 0.45, s * w ] ], 0.13, PAINT.steel, 8 );

	}

}

// ---- the weathering, in the shader: holes, the plating's relief, rust; growth below the sea
const WEATHER = /* glsl */`
float wkHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float wkNoise( vec3 x ) {
	vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( wkHash( i ), wkHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( wkHash( i + vec3( 0, 1, 0 ) ), wkHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( wkHash( i + vec3( 0, 0, 1 ) ), wkHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( wkHash( i + vec3( 0, 1, 1 ) ), wkHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float wkFbm( vec3 p ) { return wkNoise( p ) * 0.55 + wkNoise( p * 2.07 + 3.1 ) * 0.28 + wkNoise( p * 4.3 + 7.7 ) * 0.17; }
// how far into a hole ( uv m, kind, meta y, height over the sea ): > 0.5 a hole, 0.25 to 0.5 its ragged rim
float wkHole( vec2 uv, float kind, float my, float h ) {
	if ( kind > 2.5 ) return 0.0;
	float n = wkFbm( vec3( uv * vec2( 0.55, 0.8 ), kind * 7.0 + 1.0 ) ) + ( wkNoise( vec3( uv * 4.2, kind + 3.0 ) ) - 0.5 ) * 0.22;
	float zone, bay = 1.0;
	if ( kind < 0.5 ) {
		// (the hull: between its frames, the upper strakes above the sea first; a row of portholes)
		float fr = fract( uv.x / ${ FRAME.toFixed( 2 ) } );
		bay = smoothstep( 0.06, 0.22, fr ) * smoothstep( 0.94, 0.78, fr );
		zone = smoothstep( 3.4, 0.9, my - uv.y ) * smoothstep( - 0.8, 0.4, h );
		vec2 ph = vec2( mod( uv.x + 1.2, 2.4 ) - 1.2, my - uv.y - 1.45 );
		if ( my - uv.y < 2.2 && length( ph ) < 0.19 ) return 1.0;
	} else if ( kind < 1.5 ) zone = 0.55 + my * 0.6; // (the deck: more torn near the break)
	else zone = 0.75;
	return bay * zone * smoothstep( 0.5, 0.68, n );
}
`;

export class Wreck {

	constructor( { scene, colliders = null } ) {

		this.group = new THREE.Group();
		this.group.name = 'Wreck';
		scene.add( this.group );
		const mat = this.material = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide } );
		mat.name = 'Wreck';
		mat.onBeforeCompile = ( shader ) => {

			shader.uniforms.wreckSea = G.seaLevel;
			shader.vertexShader = shader.vertexShader.replace( '#include <common>', '#include <common>\nattribute vec2 aMeta;\nvarying vec2 vWkMeta;\nvarying vec2 vWkUv;\nvarying vec3 vWkW;' )
				.replace( '#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvWkW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvWkMeta = aMeta;\n\tvWkUv = uv;' );
			shader.fragmentShader = shader.fragmentShader.replace( '#include <common>', `#include <common>\nvarying vec2 vWkMeta;\nvarying vec2 vWkUv;\nvarying vec3 vWkW;\nuniform float wreckSea;\n${ WEATHER }` )
				.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
	vec2 wkUv = vWkUv;
	float wkKind = floor( vWkMeta.x + 0.5 ), wkH = vWkW.y - wreckSea;
	float wkHoleK = wkHole( wkUv, wkKind, vWkMeta.y, wkH );
	if ( wkHoleK > 0.5 ) discard;
	// the plating's relief (bump, m): dished between the frames, lapped at each strake's seam, rivet rows, the
	// rust flaking; a hole's rim curled
	float wkRel = 0.0;
	// (none of it under the growth, below the sea; and faded as it gets finer than the pixel: no stripes far off)
	float wkSharp = smoothstep( - 0.6, 0.2, wkH ) * ( 1.0 - smoothstep( 0.02, 0.06, fwidth( wkUv.x ) ) );
	if ( wkKind < 1.5 ) {
		float fr = fract( wkUv.x / ${ FRAME.toFixed( 2 ) } ), sv = fract( wkUv.y / 1.25 );
		// (the dishing between the frames, faint: uneven from one bay to the next)
		float bayK = 0.5 + wkNoise( vec3( floor( wkUv.x / ${ FRAME.toFixed( 2 ) } ), floor( wkUv.y / 1.25 ), 31.0 ) );
		wkRel = ( - 0.008 * sin( 3.14159 * fr ) * bayK * ( wkKind < 0.5 ? 1.0 : 0.4 ) + 0.006 * sv ) * wkSharp;
		vec2 rv = vec2( fract( wkUv.x / 0.11 ) - 0.5, ( sv - 0.04 ) * 1.25 / 0.11 );
		float fine = 1.0 - smoothstep( 0.004, 0.012, fwidth( wkUv.x ) );
		wkRel += 0.005 * ( 1.0 - smoothstep( 0.18, 0.3, length( rv ) ) ) * fine * wkSharp;
	}
	wkRel += ( wkNoise( vec3( wkUv * 23.0, wkKind ) ) - 0.5 ) * 0.008 + smoothstep( 0.25, 0.5, wkHoleK ) * 0.02;
	// its colour: rust in every shade (brown, orange, nearly black), streaked down from the holes and the
	// seams, salt-stained; old paint here and there low on the hull and on the house
	float n1 = wkFbm( vec3( wkUv * 0.6, 2.0 ) ), n2 = wkNoise( vec3( wkUv * 3.1, 5.0 ) );
	float streak = wkFbm( vec3( wkUv.x * 3.4, wkUv.y * 0.22, 9.0 ) );
	float above = wkHole( wkUv + vec2( 0.0, 0.7 ), wkKind, vWkMeta.y, wkH ) + wkHole( wkUv + vec2( 0.0, 1.5 ), wkKind, vWkMeta.y, wkH ) * 0.6;
	// (as the Maheno's: a warm orange-brown over most of it, lighter where the sun's bleached it, dark where
	// it's wet or flaking deep, the orange run down below each hole)
	vec3 rust = mix( vec3( 0.36, 0.15, 0.055 ), vec3( 0.6, 0.29, 0.1 ), n1 );
	rust = mix( rust, vec3( 0.74, 0.4, 0.14 ), clamp( smoothstep( 0.55, 0.8, streak ) * 0.7 + smoothstep( 0.1, 0.5, above ) * 0.7, 0.0, 1.0 ) );
	rust = mix( rust, vec3( 0.18, 0.08, 0.04 ), smoothstep( 0.72, 0.9, wkNoise( vec3( wkUv * 0.9, 11.0 ) ) ) * 0.5 );
	rust = mix( rust, vec3( 0.62, 0.52, 0.42 ), smoothstep( 0.7, 0.9, wkFbm( vec3( wkUv * 0.35, 13.0 ) ) ) * 0.45 );
	// (and darker toward the sea: wet from the spray)
	rust *= mix( 0.8, 1.0, smoothstep( 0.0, 1.2, wkH ) );
	float paintK = smoothstep( 0.62, 0.72, wkFbm( vec3( wkUv * 0.5, 17.0 ) ) ) * ( wkKind < 0.5 ? smoothstep( 2.4, 3.8, vWkMeta.y - wkUv.y ) : wkKind > 1.5 && wkKind < 2.5 ? 0.8 : 0.3 );
	vec3 wkC = mix( rust, diffuseColor.rgb * ( 0.8 + 0.4 * n2 ), paintK );
	wkC *= 0.8 + 0.35 * n2;
	wkC = mix( wkC, wkC * 0.55, smoothstep( 0.25, 0.5, wkHoleK ) );
	// below the sea: grown over (a turf of algae, coralline crusts, sponges); at it a dark band of weed
	// (in the world's metres, not the plates': patches that run across the frames and the seams; a turf of
	// algae, olive to brown; coralline crusts, pink to mauve; sponges, orange, yellow, purple; and here and
	// there the old steel still bare, dark)
	vec3 gw = vWkW;
	float g1 = wkFbm( gw * 0.32 + 21.0 ), g2 = wkNoise( gw * 1.9 + 23.0 ), g3 = wkFbm( gw * 0.85 + 29.0 ), g4 = wkNoise( gw * 4.7 + 31.0 );
	vec3 growth = mix( vec3( 0.2, 0.2, 0.1 ), vec3( 0.34, 0.29, 0.13 ), g2 ) * ( 0.75 + 0.5 * g4 );
	growth = mix( growth, mix( vec3( 0.6, 0.33, 0.38 ), vec3( 0.46, 0.3, 0.42 ), g2 ), smoothstep( 0.52, 0.66, g1 ) );
	growth = mix( growth, vec3( 0.12, 0.08, 0.06 ), smoothstep( 0.62, 0.74, g3 ) * 0.7 );
	float spg = smoothstep( 0.72, 0.8, wkNoise( gw * 2.3 + 27.0 ) ) * smoothstep( 0.35, 0.6, g3 );
	growth = mix( growth, g2 < 0.33 ? vec3( 0.82, 0.38, 0.08 ) : g2 < 0.66 ? vec3( 0.78, 0.7, 0.16 ) : vec3( 0.42, 0.2, 0.46 ), spg );
	float wkLine = 1.0 - smoothstep( 0.0, 0.45, abs( wkH - 0.15 + ( wkNoise( vWkW * 0.8 ) - 0.5 ) * 0.4 ) );
	wkC = mix( growth, wkC, smoothstep( - 0.25, 0.3, wkH ) );
	wkC = mix( wkC, vec3( 0.1, 0.13, 0.06 ), wkLine * 0.75 );
	diffuseColor.rgb = wkC;
	float wkRough = mix( 0.95, 0.7, paintK ) * ( wkH < 0.0 ? 1.0 : 0.95 );` )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = wkRough;' )
				.replace( '#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
	{
		// (the relief, as a bump: its slope across the screen)
		vec3 sp = - vViewPosition, sx = dFdx( sp ), sy = dFdy( sp );
		vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
		float det = dot( sx, r1 );
		vec2 dh = vec2( dFdx( wkRel ), dFdy( wkRel ) );
		vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
		normal = normalize( abs( det ) * normal - grad );
	}` );

		};

		mat.customProgramCacheKey = () => 'wreck2';
		// (the sky's light and the sea's on its faces the sun isn't on: the world's fill is kept low for the sand,
		// and a hull's sides by the sea take far more of it, as the fingerpost does: game/Signpost.js. Its
		// material holds the environment's map for it: three puts the scene's own intensity in place of a
		// material's that reads the scene's)
		const sync = ( renderer, scene ) => {

			if ( mat.envMap !== scene.environment ) {

				if ( ! mat.envMap !== ! scene.environment ) mat.needsUpdate = true;
				mat.envMap = scene.environment;

			}

			mat.envMapIntensity = scene.environmentIntensity * FILL;

		};
		this.pieces = {};
		const geos = wreckGeometries();
		for ( const [ name, g ] of Object.entries( geos ) ) {

			const mesh = new THREE.Mesh( g, mat );
			mesh.onBeforeRender = sync;
			mesh.name = `Wreck ${ name }`;
			mesh.castShadow = name !== 'plates';
			mesh.receiveShadow = true;
			this.group.add( mesh );
			this.pieces[ name ] = mesh;
			const s = SECTIONS[ name ];
			if ( colliders && s ) for ( let x = s.x0 + 2.5; x < s.x1; x += 5 ) {

				const [ cx, cy, cz ] = toWorld( name, Math.min( x, s.x1 - 2.5 ), D * 0.55, 0 );
				colliders.addBox( new THREE.Vector3( cx, cy, cz ), new THREE.Vector3( 2.6, D * 0.6, B / 2 - 0.4 ), yawOf( name ), { tag: 'wreck' } );

			}

		}

	}

}

// its pieces' geometry, in the world: { bow, stern, plates } (BufferGeometry: position, normal, color, uv,
// aMeta). Also the reef's layout's, to settle what grows on it (reef/ReefLayout.js)
export function wreckGeometries() {

	const out = {};
	for ( const [ name, s ] of Object.entries( SECTIONS ) ) {

		const b = new Builder();
		hullPiece( b, s.x0, s.x1, name === 'bow' ? 'aft' : 'fore', name === 'bow' ? 3 : 7 );
		if ( name === 'stern' ) sternGear( b );
		else bowGear( b );
		out[ name ] = toWorldGeometry( b.geometry(), ( x, y, z ) => toWorld( name, x, y, z ) );

	}

	// plates fallen from the break, lying on the reef between the pieces
	const b = new Builder();
	for ( let k = 0; k < 4; k ++ ) {

		const x = WRECK.breakAt + ( k - 1.5 ) * 0.9, z = ( k % 2 ? 1 : - 1 ) * ( 1.5 + k * 0.4 );
		b.plate( [ x, 0.05 + k * 0.08, z ], [ 1.4 + k * 0.3, 0.1, 0.2 ], [ 0.3, 0.15, 1.1 ], 4, 3, PAINT.side, null, KIND.HULL );

	}

	out.plates = toWorldGeometry( b.geometry(), ( x, y, z ) => toWorld( 'stern', x - 2.2, y - 0.4, z ) );
	return out;

}

function toWorldGeometry( g, f ) {

	const P = g.attributes.position.array;
	for ( let i = 0; i < P.length; i += 3 ) {

		const [ x, y, z ] = f( P[ i ], P[ i + 1 ], P[ i + 2 ] );
		P[ i ] = x;
		P[ i + 1 ] = y;
		P[ i + 2 ] = z;

	}

	g.computeVertexNormals();
	g.computeBoundingSphere();
	return g;

}
