import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from '../../engine/index.js';

// (M16) What's drawn of a boat you own and aren't in: only the boat you're in is built (world/boat/Boats.js), so each of the
// others is a few hundred triangles at her real size and her shape, in one mesh, her colours in its vertices. Enough to
// see from the pier and across the bay what you've got lying there. Her frame's a Vessel's: +Z forward, y = 0 her waterline.
//
//   SHAPES: her length, beam and so on   mooredGeometry( id, { paint, stats } ) -> BufferGeometry
//   standsGeometry( id, keelY, groundAt ) -> BufferGeometry: what she sits on in Marta's yard (boat frame)

const WHITE = 0xf2efe6, GLASS = 0x18242c, DECK = 0xd9d4c4, BLACK = 0x17191b, STEEL = 0xa9b0b4, DARK = 0x2a2e30;

// length, beam, draft; freeboard at her stern and how much more at the bow (of it); the transom's width (of her beam);
// what's painted under her waterline, her boot top and her topsides as she comes; her deck's height
export const SHAPES = {
	kayak: { length: 3.7, beam: 0.85, draft: 0.1, free: 0.28, rise: 0.35, transom: 0.55, bottom: 0xb86a28, boot: 0xb86a28, top: 0xc8732a, deck: 0xb86a28, deckY: 0.12 },
	console: { length: 7, beam: 2.6, draft: 0.5, free: 0.85, rise: 0.45, transom: 0.86, bottom: 0x24323c, boot: 0x24323c, top: WHITE, deck: DECK, deckY: 0.42 },
	lobster: { length: 8.2, beam: 2.9, draft: 0.77, free: 0.98, rise: 0.63, transom: 0.8, bottom: 0x7a1d15, boot: 0x0f1a30, top: WHITE, deck: DECK, deckY: 0.35 },
	sportfisher: { length: 14.6, beam: 4.8, draft: 1.4, free: 1.35, rise: 0.72, transom: 0.86, bottom: 0x1a2a3a, boot: 0x0f1a30, top: WHITE, deck: DECK, deckY: 0.75 },
};

const STATIONS = 12;

class Shape {

	constructor() {

		this.pos = [];
		this.nor = [];
		this.col = [];

	}

	_c( hex ) {

		return new Color( hex );

	}

	// a triangle with one normal
	_tri( a, b, c, col ) {

		const n = new Vector3().subVectors( b, a ).cross( new Vector3().subVectors( c, a ) ).normalize();
		for ( const p of [ a, b, c ] ) {

			this.pos.push( p.x, p.y, p.z );
			this.nor.push( n.x, n.y, n.z );
			this.col.push( col.r, col.g, col.b );

		}

	}

	quad( a, b, c, d, hex ) {

		const col = this._c( hex );
		this._tri( a, b, c, col );
		this._tri( a, c, d, col );

	}

	// a block whose top is narrower than its foot (half-widths hx0, hx1), its foot z0..z1 and its top zt0..zt1
	prism( hx0, hx1, y0, y1, z0, z1, zt0, zt1, hex, x = 0 ) {

		const V = ( X, Y, Z ) => new Vector3( x + X, Y, Z );
		const a = V( - hx0, y0, z0 ), b = V( hx0, y0, z0 ), c = V( hx0, y0, z1 ), d = V( - hx0, y0, z1 );
		const e = V( - hx1, y1, zt0 ), f = V( hx1, y1, zt0 ), g = V( hx1, y1, zt1 ), h = V( - hx1, y1, zt1 );
		this.quad( e, h, g, f, hex );
		this.quad( a, d, h, e, hex );
		this.quad( b, f, g, c, hex );
		this.quad( a, e, f, b, hex );
		this.quad( d, c, g, h, hex );

	}

	// a four-sided pole
	pole( a, b, r, hex ) {

		const A = new Vector3( ...a ), B = new Vector3( ...b ), up = new Vector3().subVectors( B, A ).normalize();
		const u = new Vector3( up.y, up.z, up.x ).cross( up ).normalize().multiplyScalar( r ), v = new Vector3().crossVectors( up, u ).normalize().multiplyScalar( r );
		const at = ( P, s, t ) => P.clone().addScaledVector( u, s ).addScaledVector( v, t );
		const ring = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ];
		for ( let i = 0; i < 4; i ++ ) {

			const [ s0, t0 ] = ring[ i ], [ s1, t1 ] = ring[ ( i + 1 ) % 4 ];
			this.quad( at( A, s0, t0 ), at( A, s1, t1 ), at( B, s1, t1 ), at( B, s0, t0 ), hex );

		}

	}

	// her hull, keel to sheer both sides, smooth along it; her deck; her transom
	hull( S, paint ) {

		const top = paint ?? S.top, zAft = - S.length / 2, W = S.beam / 2;
		const row = [];
		const halfAt = ( t ) => W * ( t < 0.5 ? S.transom + ( 1 - S.transom ) * Math.sin( t / 0.5 * Math.PI / 2 ) : Math.sqrt( Math.max( 0, 1 - ( ( t - 0.5 ) / 0.5 ) ** 2.2 ) ) );
		const sheer = ( t ) => S.free * ( 1 + S.rise * t ** 2.2 );
		const keel = ( t ) => - S.draft * ( t < 0.65 ? 1 : Math.max( 0, 1 - ( ( t - 0.65 ) / 0.35 ) ** 1.6 ) );
		for ( let i = 0; i <= STATIONS; i ++ ) {

			const t = i / STATIONS, w = halfAt( t ), s = sheer( t ), k = keel( t ), z = zAft + t * S.length;
			// up the section: the keel, the bilge, her waterline, her boot top, the flare and the sheer
			const ys = [ k, k * 0.5, 0.04, 0.14, s * 0.62, s ], xs = [ 0, 0.62 * w, 0.84 * w, 0.87 * w, 0.95 * w, w ];
			row.push( ys.map( ( y, j ) => new Vector3( xs[ j ], y, z ) ) );

		}

		const colOf = ( j ) => ( j < 3 ? S.bottom : j === 3 ? S.boot : top );
		// (a normal at each point, from the faces either side: the shell's smooth along her and round her)
		const N = row.map( ( r, i ) => r.map( ( p, j ) => {

			const a = row[ Math.min( STATIONS, i + 1 ) ][ j ].clone().sub( row[ Math.max( 0, i - 1 ) ][ j ] );
			const b = r[ Math.min( 5, j + 1 ) ].clone().sub( r[ Math.max( 0, j - 1 ) ] );
			return b.cross( a ).normalize();

		} ) );
		const push = ( p, n, c, s ) => {

			this.pos.push( s * p.x, p.y, p.z );
			this.nor.push( s * n.x, n.y, n.z );
			this.col.push( c.r, c.g, c.b );

		};
		for ( const s of [ 1, - 1 ] ) for ( let i = 0; i < STATIONS; i ++ ) for ( let j = 0; j < 5; j ++ ) {

			const c0 = this._c( colOf( j ) ), c1 = this._c( colOf( j + 1 ) );
			const a = [ row[ i ][ j ], N[ i ][ j ], c0 ], b = [ row[ i + 1 ][ j ], N[ i + 1 ][ j ], c0 ], c = [ row[ i + 1 ][ j + 1 ], N[ i + 1 ][ j + 1 ], c1 ], d = [ row[ i ][ j + 1 ], N[ i ][ j + 1 ], c1 ];
			for ( const v of s > 0 ? [ a, c, b, a, d, c ] : [ a, b, c, a, c, d ] ) push( v[ 0 ], v[ 1 ], v[ 2 ], s );

		}

		// the deck, and the inside of her bulwarks up to the sheer
		const dk = S.deckY, cap = 0x8c8678;
		for ( let i = 0; i < STATIONS; i ++ ) {

			const r0 = row[ i ][ 5 ], r1 = row[ i + 1 ][ 5 ], z0 = r0.z, z1 = r1.z;
			const inset = Math.min( 0.06, r0.x * 0.5 );
			const dY = ( r ) => Math.min( dk, r.y - 0.04 );
			const A = new Vector3( r0.x - inset, dY( r0 ), z0 ), B = new Vector3( r1.x - inset, dY( r1 ), z1 );
			this.quad( new Vector3( - A.x, A.y, z0 ), new Vector3( - B.x, B.y, z1 ), B, A, S.deck );
			for ( const s of [ 1, - 1 ] ) {

				const X = ( p ) => new Vector3( s * p.x, p.y, p.z );
				const P = new Vector3( r0.x - inset, r0.y, z0 ), Q = new Vector3( r1.x - inset, r1.y, z1 );
				const inner = s > 0 ? [ X( A ), X( B ), X( Q ), X( P ) ] : [ X( A ), X( P ), X( Q ), X( B ) ];
				this.quad( ...inner, top );
				const cA = s > 0 ? [ X( P ), X( Q ), X( r1 ), X( r0 ) ] : [ X( P ), X( r0 ), X( r1 ), X( Q ) ];
				this.quad( ...cA, cap );

			}

		}

		// her transom
		const r = row[ 0 ];
		for ( let j = 0; j < 5; j ++ ) {

			const a = r[ j ], b = r[ j + 1 ], hex = colOf( j + 1 );
			this.quad( new Vector3( - a.x, a.y, a.z ), new Vector3( - b.x, b.y, b.z ), b, a, hex );

		}

	}

	geometry() {

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'color', new Float32BufferAttribute( this.col, 3 ) );
		return g;

	}

}

const BUILD = {

	kayak( B, S, stats ) {

		// her moulded seat, a rod in its holder, and a crate behind it when she has one
		B.prism( 0.2, 0.2, 0.12, 0.2, - 0.35, 0.1, - 0.35, 0.1, DARK );
		B.prism( 0.2, 0.18, 0.2, 0.52, - 0.42, - 0.32, - 0.46, - 0.38, DARK );
		if ( stats.holdKg > 12 ) B.prism( 0.17, 0.17, 0.12, 0.42, - 1.2, - 0.8, - 1.2, - 0.8, 0x2f4f6f );

	},

	console( B, S, stats ) {

		// the helm in the middle of her, its screen, the leaning post, the outboards on her transom
		B.prism( 0.42, 0.38, 0.42, 1.25, - 0.1, 0.7, - 0.05, 0.55, WHITE );
		B.prism( 0.36, 0.34, 1.25, 1.52, 0.42, 0.56, 0.5, 0.62, GLASS );
		B.prism( 0.34, 0.3, 0.42, 1.0, - 1.05, - 0.65, - 1.05, - 0.65, DECK );
		const zT = - S.length / 2;
		for ( const x of stats.twin ? [ - 0.42, 0.42 ] : [ 0 ] ) {

			B.prism( 0.2, 0.18, 0.4, 1.05, zT - 0.5, zT - 0.05, zT - 0.5, zT - 0.08, BLACK, x );
			B.prism( 0.08, 0.06, - 0.45, 0.4, zT - 0.36, zT - 0.12, zT - 0.42, zT - 0.12, BLACK, x );

		}

		// the bow rail
		for ( const z of [ 1.5, 2.4 ] ) for ( const s of [ - 1, 1 ] ) B.pole( [ s * ( z < 2 ? 1.05 : 0.72 ), 0.98, z ], [ s * ( z < 2 ? 1.02 : 0.68 ), 1.4, z ], 0.012, STEEL );
		if ( stats.tTop ) {

			for ( const z of [ - 0.75, 0.55 ] ) for ( const s of [ - 1, 1 ] ) B.pole( [ s * 0.5, 0.42, z ], [ s * 0.62, 2.28, z + ( z > 0 ? - 0.1 : 0.1 ) ], 0.022, STEEL );
			B.prism( 0.95, 0.92, 2.28, 2.36, - 1.15, 0.75, - 1.12, 0.72, WHITE );

		}

	},

	lobster() {

		// her wheelhouse: its sides, its windows all round and its roof, the stack and the mast with its radar
		const B = arguments[ 0 ];
		B.prism( 1.18, 1.14, 0.5, 1.45, - 0.35, 1.45, - 0.33, 1.42, WHITE );
		B.prism( 1.14, 1.02, 1.45, 2.05, - 0.33, 1.42, - 0.28, 1.25, GLASS );
		B.prism( 1.1, 1.1, 2.05, 2.15, - 0.75, 1.55, - 0.75, 1.55, WHITE );
		B.pole( [ 0, 2.15, 0.2 ], [ 0, 3.15, 0.2 ], 0.03, STEEL );
		B.prism( 0.28, 0.28, 3.1, 3.2, 0.14, 0.26, 0.14, 0.26, BLACK );
		B.pole( [ 0.7, 0.4, - 1.5 ], [ 0.7, 1.9, - 1.5 ], 0.025, STEEL ); // the hauler's davit
		B.pole( [ 0.7, 1.9, - 1.5 ], [ 1.3, 1.95, - 1.5 ], 0.025, STEEL );

	},

	sportfisher( B, S, stats ) {

		// her cabin and its long windows, the foredeck's rise, the flybridge over it and its hardtop
		B.prism( 2.05, 1.95, 1.45, 2.2, - 2.8, 2.6, - 2.75, 2.25, WHITE );
		B.prism( 1.95, 1.85, 2.2, 2.75, - 2.75, 2.25, - 2.7, 1.75, GLASS );
		B.prism( 1.85, 1.8, 2.75, 2.9, - 2.9, 1.9, - 2.9, 1.8, WHITE );
		B.prism( 1.7, 1.75, 2.9, 3.6, - 2.2, 1.7, - 2.3, 1.8, WHITE );
		B.prism( 0.7, 0.65, 3.0, 3.75, 0.5, 1.15, 0.6, 1.1, DARK ); // the helm
		for ( const z of [ - 2, 1.3 ] ) for ( const s of [ - 1, 1 ] ) B.pole( [ s * 1.55, 3.6, z ], [ s * 1.5, 4.75, z ], 0.03, STEEL );
		if ( ! stats.tower ) B.prism( 1.75, 1.7, 4.75, 4.85, - 2.4, 1.6, - 2.4, 1.6, WHITE );
		else {

			// her tower: four legs, its rails and the top station's hardtop
			for ( const z of [ - 1.4, 0.9 ] ) for ( const s of [ - 1, 1 ] ) B.pole( [ s * 1.55, 3.6, z ], [ s * 0.62, 8.2, z * 0.5 ], 0.035, STEEL );
			B.prism( 0.78, 0.78, 8.2, 8.26, - 0.75, 0.55, - 0.75, 0.55, WHITE );
			for ( const z of [ - 0.65, 0.45 ] ) for ( const s of [ - 1, 1 ] ) B.pole( [ s * 0.68, 8.26, z ], [ s * 0.68, 9.2, z ], 0.02, STEEL );
			B.prism( 0.85, 0.85, 9.2, 9.25, - 0.8, 0.6, - 0.8, 0.6, WHITE );

		}

		if ( stats.outriggers ) for ( const s of [ - 1, 1 ] ) B.pole( [ s * 1.8, 3.4, 0.2 ], [ s * 6.2, 9.5, - 1.8 ], 0.025, STEEL );
		if ( stats.chair ) {

			B.pole( [ 0, S.deckY, - 5 ], [ 0, S.deckY + 0.5, - 5 ], 0.06, STEEL );
			B.prism( 0.28, 0.28, S.deckY + 0.5, S.deckY + 0.62, - 5.25, - 4.75, - 5.25, - 4.75, 0xc8bda6 );

		}

	},

};

// paint: her topsides (a hex, or null as she came); stats: gearStats for her, what's fitted (the T-top, the tower...)
export function mooredGeometry( id, { paint = null, stats = {} } = {} ) {

	const S = SHAPES[ id ], B = new Shape();
	B.hull( S, paint );
	BUILD[ id ]( B, S, stats );
	return B.geometry();

}

// Keel blocks under her length and stands under her bilges, down to the ground (groundAt( x, z ): boat frame -> world
// height, y here being above her waterline: keelY her keel, waterline her y on the cradle)
export function standsGeometry( id, waterline, groundAt ) {

	const S = SHAPES[ id ], B = new Shape(), keel = - S.draft;
	for ( let i = 0; i < 3 + Math.round( S.length / 5 ); i ++ ) {

		const z = - S.length * 0.38 + i * ( S.length * 0.68 ) / ( 2 + Math.round( S.length / 5 ) );
		const g = groundAt( 0, z ) - waterline;
		B.prism( S.beam * 0.09, S.beam * 0.09, g - 0.02, keel, z - 0.25, z + 0.25, z - 0.25, z + 0.25, 0x6f5a42 );

	}

	if ( S.length > 5 ) for ( const z of [ - S.length * 0.25, S.length * 0.15 ] ) for ( const s of [ - 1, 1 ] ) {

		const g = groundAt( s * S.beam * 0.42, z ) - waterline;
		B.pole( [ s * S.beam * 0.42, g, z ], [ s * S.beam * 0.34, 0.1, z ], 0.03, 0x2f6fb0 );
		B.prism( 0.18, 0.18, g, g + 0.04, z - 0.18, z + 0.18, z - 0.18, z + 0.18, 0x2f6fb0, s * S.beam * 0.42 );

	}

	return B.geometry();

}
