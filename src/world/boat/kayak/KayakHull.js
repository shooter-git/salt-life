import { BufferGeometry, Color, Float32BufferAttribute, Vector3, mergeGeometries } from '../../../engine/index.js';
import { box, cylinder, gridSurface, loft, mat4, prepare, rod, roundedBox, sphere, torus, tube } from '../GeoKit.js';

// (M16) The kayak's one moulded body, all of it merged into one mesh with its colours in the vertices, as a
// rotomoulded boat is one piece: her hull from her lines, the deck over it (a height field, its wells cut by distance
// functions, so they're as soft as moulded plastic is), and what's on her: the seat, the hatches, the cooler in the
// tank well, the rod holders, carry handles and bungees. After the photographs in docs/m16/kayak.md.
//
// Going aft from the bow, as on the plan photograph: the bow's carry handle, the big oval hatch, the cockpit (foot
// wells either side of a low console, its small round hatch), the seat, the bridge behind it with its two rod holders
// and scuppers, the long tank well with its criss-cross bungee, the stern's carry handle.

const HULL_A = new Color( 0xe2701c ), HULL_B = new Color( 0xf0a92a ), HULL_C = new Color( 0xc9521a );
const SOLE = new Color( 0x7d5a3a );
const RUBBER = new Color( 0x17181a ), PAD = new Color( 0x26282b ), WEB = new Color( 0x1c1d20 ), CORD = new Color( 0xd8501a );
const LID = new Color( 0xe9e7df ), LID_DARK = new Color( 0x8a8c8c );

const clamp = ( x, a, b ) => Math.min( b, Math.max( a, x ) );
const sstep = ( a, b, x ) => {

	const t = clamp( ( x - a ) / ( b - a ), 0, 1 );
	return t * t * ( 3 - 2 * t );

};

// signed distance to a rounded box about ( cx, cz ): < 0 inside
const sdBox = ( x, z, cx, cz, hx, hz, r ) => {

	const dx = Math.abs( x - cx ) - hx + r, dz = Math.abs( z - cz ) - hz + r;
	return Math.hypot( Math.max( dx, 0 ), Math.max( dz, 0 ) ) + Math.min( Math.max( dx, dz ), 0 ) - r;

};

// a smooth noise for the marbling (rotomoulded colours swirl along her length)
const vnoise = ( x, y, z ) => {

	return Math.sin( x * 7.1 + Math.sin( z * 3.3 ) * 2.1 + y * 5 ) * 0.5 + Math.sin( z * 2.3 + Math.sin( x * 4.7 + z * 1.1 ) * 1.7 + 1.3 ) * 0.5;

};

function marble( out, x, y, z ) {

	const n = vnoise( x, y, z ), k = sstep( - 0.3, 0.5, n ), j = sstep( 0.35, 0.8, vnoise( x + 3.1, y, z * 1.3 + 2 ) );
	return out.copy( HULL_A ).lerp( HULL_B, k * 0.8 ).lerp( HULL_C, j * 0.55 );

}

// where things are along her, as fractions of her length from the stern
export const AT = {
	sternHandle: 0.04,
	well: [ 0.085, 0.315 ],
	bridge: [ 0.335, 0.385 ],
	seat: [ 0.395, 0.505 ],
	cockpit: [ 0.37, 0.7 ],
	consoleZ: 0.61,
	hatch: 0.785,
	bowHandle: 0.955,
};

// The deck's height at ( x, z ), boat frame. Exported for the seat and the rain
export class DeckShape {

	constructor( L ) {

		this.L = L;
		const Z = ( t ) => L.zAft + L.length * t;
		this.Z = Z;
		this.wellZ = [ Z( AT.well[ 0 ] ), Z( AT.well[ 1 ] ) ];
		this.cockZ = [ Z( AT.cockpit[ 0 ] ), Z( AT.cockpit[ 1 ] ) ];
		this.hatchZ = Z( AT.hatch );
		this.consoleZ = Z( AT.consoleZ );
		this.seatZ = [ Z( AT.seat[ 0 ] ), Z( AT.seat[ 1 ] ) ];
		this.bowHandleZ = Z( AT.bowHandle );
		this.sternHandleZ = Z( AT.sternHandle );

	}

	y( x, z ) {

		const L = this.L, t = L.tAtSheerZ( z ), S = L.sheerY( t ), w = Math.max( 1e-3, L.sheerX( t ) ), u = Math.min( 1, Math.abs( x ) / w );
		// the deck's crown over the gunwale: a low ridge along the bow, rounded at the stern (the profile photograph's
		// 6 cm hump ahead of the hatch)
		const bow = sstep( 0.68, 0.9, t ) * ( 1 - 0.55 * sstep( 0.93, 1, t ) ), stern = 0.5 * ( 1 - sstep( 0.04, 0.22, t ) );
		const side = sstep( 0.3, 0.72, t ) * ( 1 - sstep( 0.68, 0.74, t ) );
		let y = S + ( 0.075 * bow + 0.05 * stern + 0.012 * side ) * ( 1 - u * u ) + 0.012 * ( 1 - u * u * u );

		// the bow's hatch, sunk in an oval
		const hz = ( z - this.hatchZ ) / 0.2, hx = x / 0.185, h = Math.hypot( hx, hz );
		y -= 0.03 * ( 1 - sstep( 0.9, 1.15, h ) );

		// the tank well: a long tray with rounded corners, narrowing with her, ribbed along its floor
		{

			const [ z0, z1 ] = this.wellZ, cz = ( z0 + z1 ) / 2, hw = Math.max( 0.1, L.sheerX( L.tAtSheerZ( clamp( z, z0, z1 ) ) ) - 0.085 );
			const d = sdBox( x, z, 0, cz, hw, ( z1 - z0 ) / 2, 0.09 ), s = sstep( 0.008, - 0.04, d );
			const floor = 0.082 + 0.012 * ( z - z0 ) + 0.006 * Math.cos( x * 22 );
			y += ( floor - y ) * s;

		}

		// the cockpit: a bathtub, wide about the seat, drawing in to the foot wells
		{

			const [ z0, z1 ] = this.cockZ, cz = ( z0 + z1 ) / 2, f = clamp( ( z - z0 ) / ( z1 - z0 ), 0, 1 );
			const hw = 0.3 - 0.075 * sstep( 0.45, 1, f );
			const d = sdBox( x, z, 0, cz, hw, ( z1 - z0 ) / 2, 0.11 ), s = sstep( 0.01, - 0.05, d );
			const floor = 0.035 + 0.045 * sstep( 0.5, 1, f );
			y += ( floor - y ) * s;

			// the seat's shallow pan
			const [ a, b ] = this.seatZ, seat = sstep( 0.02, - 0.05, sdBox( x, z, 0, ( a + b ) / 2, 0.235, ( b - a ) / 2, 0.08 ) );
			y -= 0.012 * seat;

			// the low console down her middle, between the feet
			const c = sstep( 0.02, - 0.04, sdBox( x, z, 0, this.consoleZ + 0.05, 0.1, 0.27, 0.08 ) ) * s;
			y += 0.075 * c;

		}

		// the carry handles' hollows, bow and stern
		y -= 0.045 * sstep( 0.022, - 0.03, sdBox( x, z, 0, this.bowHandleZ, 0.045, 0.085, 0.04 ) );
		y -= 0.06 * sstep( 0.022, - 0.03, sdBox( x, z, 0, this.sternHandleZ, 0.05, 0.05, 0.045 ) );
		return y;

	}

	// its colour
	color( out, x, y, z ) {

		marble( out, x, y, z );
		// (what's sunk below the gunwale's in its own shade: the wells' walls and floors darker, as much for the light
		// that doesn't reach them as for the scuffing)
		const L = this.L, t = L.tAtSheerZ( z ), deep = clamp( ( L.sheerY( t ) - y ) / 0.13, 0, 1 );
		out.lerp( SOLE, 0.45 * sstep( 0.1, 0.5, deep ) ).multiplyScalar( 1 - 0.42 * sstep( 0.15, 1, deep ) );
		return out;

	}

}

// ---- the shell: keel to gunwale, from her lines

function shell( L ) {

	const pick = [ 0, 2, 4, 6, 8, 9, 11, 13, 16, 20, 25, 32 ];
	const stations = L.stationParams( 30 ), left = [], right = [];
	for ( const t of stations ) {

		const pts = L.station( t, 1 ), row = pick.map( ( j ) => pts[ j ].clone() );
		// two tracking channels moulded along her bottom, either side of a low keel
		const f = sstep( 0.05, 0.2, t ) * ( 1 - sstep( 0.7, 0.9, t ) );
		row[ 1 ].y += 0.012 * f;
		row[ 2 ].y -= 0.003 * f;
		left.push( row );
		right.push( row.map( ( p ) => new Vector3( - p.x, p.y, p.z ) ) );

	}

	// (and her blunt stern closed)
	return [ gridSurface( left, { flip: true } ), gridSurface( right, { flip: false } ), sternCap( left[ 0 ] ) ];

}

function sternCap( row ) {

	const a = row.map( ( p ) => p.clone() ), b = row.map( ( p ) => new Vector3( - p.x, p.y, p.z ) );
	return gridSurface( [ a, b ], { flip: false } );

}

// ---- the deck: rows along her, columns across, more of them where the wells' walls are

function deck( L, D ) {

	const rows = [], cols = [ 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.58, 0.66, 0.72, 0.78, 0.84, 0.9, 0.95, 0.985, 1 ];
	const across = [ ...cols.slice( 1 ).reverse().map( ( u ) => - u ), ...cols ];
	const NR = 48;
	for ( let i = 0; i <= NR; i ++ ) {

		// (closer together at her ends)
		const q = i / NR, t = 0.0015 + 0.997 * ( q + 0.045 * Math.sin( 2 * Math.PI * q ) * - 1 ), z = L.sheerZ( t ), w = L.sheerX( t ), row = [];
		for ( const u of across ) {

			const x = u * w;
			// (its outermost points roll over the gunwale and meet her side)
			const roll = Math.abs( u ) >= 1 ? - 0.003 : 0;
			row.push( new Vector3( x, Math.abs( u ) >= 1 ? L.sheerY( t ) + roll : D.y( x, z ), z ) );

		}

		rows.push( row );

	}

	return gridSurface( rows, { flip: true } );

}

// a flat disc on the deck, for the scuppers
function disc( r, n = 8 ) {

	return cylinder( r, r, 0.002, n, 1, false );

}

function tint( g, color, rough = 0.5 ) {

	return prepare( g, { color, rough } );

}

// ---- what's on her

function fittings( L, D ) {

	const out = [], Z = D.Z;
	const y = ( x, z ) => D.y( x, z );
	const add = ( g, color, rough = 0.5, m = null ) => {

		if ( m ) g.applyMatrix4( m );
		out.push( tint( g, color, rough ) );

	};

	// the bow's hatch: a black oval cover on its rim, its two latches
	{

		const hz = D.hatchZ, top = y( 0, hz );
		add( oval( 0.17, 0.185, 0.03, 18 ), RUBBER, 0.62, mat4( 0, top + 0.002, hz ) );
		add( roundedBox( 0.05, 0.022, 0.1, 0.008, 1 ), new Color( 0x303236 ), 0.6, mat4( 0.075, top + 0.04, hz ) );
		add( roundedBox( 0.05, 0.022, 0.1, 0.008, 1 ), new Color( 0x303236 ), 0.6, mat4( - 0.075, top + 0.04, hz ) );

	}

	// the console's small round hatch, and a low-profile finder's mount ahead of it
	{

		const z = D.consoleZ, top = y( 0, z );
		add( cylinder( 0.075, 0.08, 0.014, 14 ), new Color( 0x2c2d30 ), 0.6, mat4( 0, top + 0.006, z ) );
		add( torus( 0.05, 0.006, 4, 12 ), new Color( 0x17181a ), 0.6, mat4( 0, top + 0.015, z, Math.PI / 2 ) );

	}

	// the seat: a moulded foam pad in the pan, a tall padded back on its webbing (the plan photograph's black seat)
	const sz = D.seatZ, seatY = y( 0, ( sz[ 0 ] + sz[ 1 ] ) / 2 );
	seat( add, seatY, sz );

	// the bridge's rod holders: flush tubes raked aft and out, a spare rod in the port one
	const rz = Z( 0.36 ), rx = 0.235;
	for ( const s of [ 1, - 1 ] ) {

		const top = y( s * rx, rz ) + 0.012;
		const dir = new Vector3( s * 0.32, 0.72, - 0.62 ).normalize();
		const lip = new Vector3( s * rx, top, rz );
		add( rod( lip.clone().addScaledVector( dir, - 0.1 ), lip.clone().addScaledVector( dir, 0.012 ), 0.024, 8 ), RUBBER, 0.45 );
		if ( s > 0 ) {

			const butt = lip.clone().addScaledVector( dir, 0.02 ), tip = lip.clone().addScaledVector( dir, 2 );
			add( rod( butt, butt.clone().addScaledVector( dir, 0.38 ), 0.013, 5 ), new Color( 0x2a2a2d ), 0.7 );
			add( rod( butt.clone().addScaledVector( dir, 0.38 ), tip, 0.008, 4, 0.0025 ), new Color( 0x3c3a36 ), 0.35 );

		}

	}

	// the scuppers: drain holes through her, two by the bridge, two by the feet
	for ( const [ x, z ] of [ [ 0.095, Z( 0.355 ) ], [ - 0.095, Z( 0.355 ) ], [ 0.155, Z( 0.555 ) ], [ - 0.155, Z( 0.555 ) ] ] ) {

		add( disc( 0.024, 8 ), new Color( 0x0a0a0a ), 0.9, mat4( x, y( x, z ) + 0.003, z ) );

	}

	// the carry handles, bow and stern: T-bars across their hollows
	for ( const [ z, hw ] of [ [ D.bowHandleZ, 0.05 ], [ D.sternHandleZ, 0.055 ] ] ) {

		const yy = y( 0, z ) + 0.05;
		add( rod( new Vector3( - hw, yy, z ), new Vector3( hw, yy, z ), 0.012, 6 ), RUBBER, 0.55 );

	}

	// the side carry handles, on the gunwales abreast of the feet: webbing with a moulded grip; the paddle's clip
	for ( const s of [ 1, - 1 ] ) {

		const z0 = Z( 0.555 ), z1 = Z( 0.655 ), a = new Vector3( s * ( L.sheerX( L.tAtSheerZ( z0 ) ) - 0.012 ), L.sheerY( L.tAtSheerZ( z0 ) ) - 0.012, z0 );
		const b = new Vector3( s * ( L.sheerX( L.tAtSheerZ( z1 ) ) - 0.012 ), L.sheerY( L.tAtSheerZ( z1 ) ) - 0.012, z1 );
		add( rod( a, b, 0.011, 5 ), WEB, 0.8 );

		// the accessory rails down either gunwale
		const c0 = Z( 0.42 ), c1 = Z( 0.52 );
		const ax = s * ( L.sheerX( L.tAtSheerZ( c0 ) ) - 0.05 ), bx = s * ( L.sheerX( L.tAtSheerZ( c1 ) ) - 0.05 );
		add( rod( new Vector3( ax, y( ax, c0 ) + 0.007, c0 ), new Vector3( bx, y( bx, c1 ) + 0.007, c1 ), 0.011, 5 ), new Color( 0x202124 ), 0.5 );

	}

	// the tank well's criss-cross bungee, from six eyes along its rim
	const [ w0, w1 ] = D.wellZ, cord = [];
	const zs = [ w0 + 0.1, ( w0 + w1 ) / 2, w1 - 0.1 ];
	for ( const z of zs ) for ( const s of [ 1, - 1 ] ) cord.push( new Vector3( s * ( L.sheerX( L.tAtSheerZ( z ) ) - 0.06 ), y( s * ( L.sheerX( L.tAtSheerZ( z ) ) - 0.06 ), z ) + 0.01, z ) );
	const cords = [ [ 0, 3 ], [ 1, 2 ], [ 2, 5 ], [ 3, 4 ], [ 0, 1 ], [ 4, 5 ] ];
	for ( const [ a, b ] of cords ) {

		const m = cord[ a ].clone().add( cord[ b ] ).multiplyScalar( 0.5 ).setY( Math.max( cord[ a ].y, cord[ b ].y ) + 0.012 );
		add( rod( cord[ a ], m, 0.0045, 3 ), CORD, 0.7 );
		add( rod( m, cord[ b ], 0.0045, 3 ), CORD, 0.7 );

	}

	for ( const p of cord ) add( cylinder( 0.012, 0.014, 0.012, 6 ), RUBBER, 0.6, mat4( p.x, p.y, p.z ) );

	// the small cooler, strapped in the tank well: a 16 quart hard cooler, 0.4 x 0.26 x 0.27 m, its lid and rope handles
	cooler( add, y, D );

	// the safety pole: a whip with its pennant and an all-round white at its head, stepped in the well's after end
	const pz = Z( 0.1 ), px = - 0.14, pole = new Vector3( px, y( px, pz ), pz ), head = new Vector3( px, 1.12, pz - 0.02 );
	add( rod( pole, head, 0.007, 4, 0.004 ), new Color( 0x2a2c2f ), 0.45 );
	add( pennant( head.clone().add( new Vector3( 0, - 0.06, 0 ) ) ), new Color( 0xee4a12 ), 0.75 );
	add( sphere( 0.018, 6, 4 ), new Color( 0xf5f3e8 ), 0.25, mat4( head.x, head.y + 0.01, head.z ) );

	return out;

}

function oval( rx, rz, h, n ) {

	const rim = ( k, y ) => {

		const r = [];
		for ( let i = 0; i < n; i ++ ) {

			const a = - i / n * Math.PI * 2;
			r.push( new Vector3( Math.cos( a ) * rx * k, y, Math.sin( a ) * rz * k ) );

		}

		return r;

	};

	return loft( [ rim( 1.04, 0 ), rim( 1, h * 0.65 ), rim( 0.86, h ), rim( 0.02, h * 1.12 ) ], { closed: true, flip: false } );

}

function pennant( at ) {

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( [ at.x, at.y, at.z, at.x, at.y - 0.13, at.z, at.x + 0.015, at.y - 0.06, at.z - 0.26, at.x, at.y - 0.13, at.z, at.x, at.y, at.z, at.x + 0.015, at.y - 0.06, at.z - 0.26 ], 3 ) );
	g.computeVertexNormals();
	return g;

}

function seat( add, seatY, sz ) {

	// the pad, in its pan: thick foam, wider at the hips
	const z0 = sz[ 0 ], z1 = sz[ 1 ];
	const padRow = ( z, hw, y ) => [ new Vector3( - hw, y - 0.012, z ), new Vector3( - hw * 0.86, y + 0.012, z ), new Vector3( - hw * 0.4, y + 0.018, z ), new Vector3( 0, y + 0.01, z ), new Vector3( hw * 0.4, y + 0.018, z ), new Vector3( hw * 0.86, y + 0.012, z ), new Vector3( hw, y - 0.012, z ) ];
	const y0 = seatY + 0.03;
	add( gridSurface( [
		padRow( z0, 0.17, y0 - 0.02 ), padRow( z0 + 0.05, 0.215, y0 + 0.012 ), padRow( ( z0 + z1 ) / 2, 0.225, y0 ), padRow( z1 - 0.06, 0.2, y0 + 0.012 ), padRow( z1, 0.145, y0 - 0.012 ),
	], { flip: true } ), PAD, 0.85 );

	// the back: a curved pad, leaning aft, on two webbing straps from the gunwales
	const lean = 0.3, by = seatY + 0.07, bz = z0 + 0.03, rows = [];
	for ( let i = 0; i <= 4; i ++ ) {

		const v = i / 4, h = v * 0.44, hw = 0.13 + 0.075 * Math.sin( v * Math.PI * 0.85 ) - 0.03 * v * v;
		const row = [];
		for ( let j = 0; j <= 6; j ++ ) {

			const u = j / 3 - 1, sag = 0.045 * u * u;
			row.push( new Vector3( u * hw, by + h * Math.cos( lean ), bz - h * Math.sin( lean ) + sag ) );

		}

		rows.push( row );

	}

	add( gridSurface( rows, { flip: false } ), PAD, 0.8 );
	const backOff = rows.map( ( r ) => r.map( ( p ) => new Vector3( p.x * 0.93, p.y - 0.012, p.z - 0.055 ) ) );
	add( gridSurface( backOff, { flip: true } ), new Color( 0x1c1d20 ), 0.8 );
	// (its edge)
	for ( const j of [ 0, 6 ] ) add( gridSurface( [ rows.map( ( r ) => r[ j ] ), backOff.map( ( r ) => r[ j ] ) ], { flip: j > 0 } ), new Color( 0x1c1d20 ), 0.8 );
	add( gridSurface( [ rows[ 4 ], backOff[ 4 ] ], { flip: true } ), new Color( 0x1c1d20 ), 0.8 );
	for ( const s of [ 1, - 1 ] ) {

		const top = rows[ 3 ][ s > 0 ? 6 : 0 ], low = new Vector3( s * 0.335, seatY + 0.135, z1 - 0.07 );
		add( tube( [ top, top.clone().lerp( low, 0.5 ).add( new Vector3( 0, - 0.012, 0 ) ), low ], 0.0065, 4, 3 ), WEB, 0.85 );

	}

}

function cooler( add, y, D ) {

	const [ w0, w1 ] = D.wellZ, cz = ( w0 + w1 ) / 2 + 0.03, fy = y( 0, cz ) + 0.005;
	const hw = 0.2, hd = 0.13, h = 0.225, lidH = 0.05;
	add( roundedBox( hw * 2, h - lidH, hd * 2, 0.022, 2 ), LID, 0.5, mat4( 0, fy + ( h - lidH ) / 2, cz ) );
	add( roundedBox( hw * 2 + 0.012, lidH, hd * 2 + 0.012, 0.022, 2 ), LID, 0.45, mat4( 0, fy + h - lidH / 2, cz ) );
	add( box( hw * 2 - 0.02, 0.006, hd * 2 - 0.02 ), LID_DARK, 0.6, mat4( 0, fy + h - lidH - 0.002, cz ) );
	for ( const s of [ 1, - 1 ] ) {

		add( torus( 0.03, 0.005, 3, 6, Math.PI ), new Color( 0x2c2d30 ), 0.8, mat4( s * ( hw + 0.006 ), fy + h - lidH - 0.018, cz, 0, s * Math.PI / 2, Math.PI ) );
		// (its straps over the lid, to the well's rim)
		add( box( 0.022, 0.003, hd * 2 + 0.016 ), WEB, 0.8, mat4( s * 0.1, fy + h + 0.002, cz ) );

	}

}

export function kayakBody( L, tier = 'high' ) {

	const D = new DeckShape( L );
	const [ a, b, c ] = shell( L ), up = deck( L, D );
	const pa = new Color();
	const paint = ( g, fn ) => {

		const p = g.attributes.position, col = new Float32Array( p.count * 3 );
		for ( let i = 0; i < p.count; i ++ ) {

			fn( pa, p.getX( i ), p.getY( i ), p.getZ( i ) );
			col[ i * 3 ] = pa.r; col[ i * 3 + 1 ] = pa.g; col[ i * 3 + 2 ] = pa.b;

		}

		g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
		return prepare( g, { rough: 0.45 } );

	};

	// (her side marbled to the waterline and a little darker under it, where she's scuffed)
	const side = ( out, x, y, z ) => {

		marble( out, x, y, z );
		if ( y < - 0.03 ) out.multiplyScalar( 0.88 );
		return out;

	};

	const parts = [ paint( a, side ), paint( b, side ), paint( c, side ), paint( up, ( o, x, y, z ) => D.color( o, x, y, z ) ), ...fittings( L, D ) ];
	const geo = mergeGeometries( parts.map( ( g ) => g.index ? g : prepare( g ) ), false );
	for ( const p of parts ) p.dispose();
	return { geometry: geo, deck: D };

}

// ---- the paddle: 2.4 m (a wide fishing kayak's length), an aluminium shaft with its drip rings, two asymmetric
// glass-filled blades 46 x 17 cm. Its middle at the origin, its shaft along X

export function paddleGeometry() {

	const shaftL = 1.0, parts = [];
	const blade = ( s ) => {

		// the blade's outline, widening to a slightly tilted square tip
		const rows = [], N = 6;
		for ( let i = 0; i <= N; i ++ ) {

			const v = i / N, hw = 0.022 + 0.066 * Math.sin( Math.min( 1, v * 1.25 ) * Math.PI * 0.5 ), off = 0.012 * v;
			const x = s * ( shaftL + 0.002 + v * 0.46 );
			const edge = 0.001 + 0.004 * ( 1 - v );
			rows.push( [ new Vector3( x, - edge, off - hw ), new Vector3( x, 0.009 * ( 1 - v ) + 0.002, off ), new Vector3( x, - edge, off + hw ), new Vector3( x, - 0.009 * ( 1 - v ) - 0.002, off ) ] );

		}

		return loft( rows, { closed: true, flip: s > 0 } );

	};

	const dark = new Color( 0x1e2023 );
	parts.push( prepare( blade( 1 ), { color: dark, rough: 0.5 } ), prepare( blade( - 1 ), { color: dark, rough: 0.5 } ) );
	parts.push( prepare( rod( new Vector3( - shaftL - 0.02, 0, 0 ), new Vector3( shaftL + 0.02, 0, 0 ), 0.015, 6 ), { color: new Color( 0x2a2b2e ), rough: 0.42 } ) );
	for ( const s of [ 1, - 1 ] ) parts.push( prepare( rod( new Vector3( s * 0.72, 0, 0 ), new Vector3( s * 0.735, 0, 0 ), 0.032, 6 ), { color: new Color( 0x111214 ), rough: 0.6 } ) );
	const g = mergeGeometries( parts, false );
	for ( const p of parts ) p.dispose();
	return g;

}

