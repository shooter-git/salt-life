import { CircleGeometry, Matrix4, PlaneGeometry, Vector3 } from '../../../engine/index.js';
import { gridSurface, orientTowards, slab, rod, tube, cylinder, sphere, lathe, torus, mat4, prepare, mergePrepared } from '../GeoKit.js';
import { lerp, sstep } from '../HullLines.js';
import { atlasUV } from '../Instruments.js';
import { COMPASS_CARD } from '../Wheelhouse.js';
import { SF } from './SportfisherLines.js';
import { V, bx, rbx, plate, WHITE, LINING, TEAK, STEEL, BLACK } from './SportfisherHull.js';

// (M16) What's over the house: the flybridge with its centre helm, the hardtop on its frame, the ladder up from the cockpit,
// the tuna tower on four raked legs, its long ladder and its top station, and the outriggers. Shaped after the Viking 48's
// bridge and the towers in Marlin's survey (docs/m16/sportfisher.md).

const TUBE = { color: 0xe4e6e8, rough: 0.3, metal: 0.35 };

// the bridge's half-width at z: straight sides, a rounded taper into her bow-ward point
export function bridgeX( z ) {

	if ( z <= 0.5 ) return 2.02 - 0.1 * Math.pow( Math.max( 0, ( 0.5 - z ) / 3.75 ), 2 );
	const s = Math.min( 1, ( z - 0.5 ) / ( SF.bridgeFront - 0.5 ) );
	return 2.02 * Math.sqrt( Math.max( 0, 1 - s * s ) );

}

// the coaming's top: waist-high round the helm, falling away aft to a low lip
const coamingY = ( z ) => lerp( SF.bridge + 0.3, SF.bridge + 0.68, sstep( - 2.6, - 0.9, z ) );

// the hatch the ladder comes up through (starboard side, over the mezzanine)
export const BRIDGE_HATCH = { x0: - 1.17, x1: - 0.48, z0: - 3.0, z1: - 2.42 };

export const HELM = { x: 0, z: - 0.2, seatZ: - 0.42, eye: V( 0, SF.bridge + 1.5, - 0.22 ), consoleZ0: 0.42, consoleZ1: 1.12, halfW: 0.74 };

function plan( N ) {

	// from the gap for the ladder on her aft edge, out and round the corner, along her side and round to the middle of her front,
	// port side: [ x, z ]
	const pts = [], R = 0.55, w = bridgeX( SF.bridgeAft + R ), NA = Math.max( 4, N >> 2 ), NC = Math.max( 3, N >> 3 );
	for ( let i = 0; i < NA; i ++ ) pts.push( [ lerp( 0.42, w - R, i / NA ), SF.bridgeAft ] );
	for ( let i = 0; i < NC; i ++ ) {

		const a = i / NC * Math.PI / 2;
		pts.push( [ w - R + R * Math.sin( a ), SF.bridgeAft + R - R * Math.cos( a ) ] );

	}

	const z0 = SF.bridgeAft + R;
	for ( let i = 0; i <= N; i ++ ) {

		const f = i / N, z = f < 0.6 ? lerp( z0, 0.5, f / 0.6 ) : 0.5 + ( SF.bridgeFront - 0.5 ) * Math.sin( ( f - 0.6 ) / 0.4 * Math.PI / 2 );
		pts.push( [ bridgeX( z ), z ] );

	}

	return pts;

}

export function buildBridge( kit, L, q, parts ) {

	const N = q.low ? 14 : 34, P = plan( N );

	// the sole: teak-look over her deck, a hatch for the ladder. Its underside's the overhang over the mezzanine
	const outline = [ ...P.map( ( [ x, z ] ) => [ x, z ] ), ...P.slice( 0, - 1 ).reverse().map( ( [ x, z ] ) => [ - x, z ] ) ];
	const H = BRIDGE_HATCH, hole = [ [ H.x0, H.z0 ], [ H.x1, H.z0 ], [ H.x1, H.z1 ], [ H.x0, H.z1 ] ];
	const top = slab( outline, [ hole ], ( u, v, side ) => V( u, side ? SF.bridge - 0.05 : SF.bridge, v ), { back: false, edges: false } );
	orientTowards( top, V( 0, 1, 0 ) );
	top.computeVertexNormals();
	kit.add( 'gelcoat', top, { color: 0xf0ede4, rough: 0.7, pattern: 2 } );
	const under = slab( outline, [ hole ], ( u, v, side ) => V( u, side ? SF.roofY : SF.bridge - 0.01, v ), { front: false } );
	kit.add( 'gelcoat', under, { color: 0xf0ede4, rough: 0.35 } );

	// the coaming, inside and out: from the brow up over a rolled top and down to the sole
	for ( const s of [ 1, - 1 ] ) {

		const rows = P.map( ( [ x, z ], i ) => {

			const front = sstep( 0.5, SF.bridgeFront, z ), lean = 0.08 + 0.42 * front, top = coamingY( z ), back = sstep( SF.bridgeAft + 0.55, SF.bridgeAft, z );
			// the top's set back from the brow, more so at the front (it rakes on from the windshield)
			const xt = Math.max( 0, x - lean * ( x / 2.02 ) ), zt = z - lean * front * 1.3 + 0.08 * back;
			return [
				V( s * Math.max( 0, x + 0.015 ), SF.roofY - 0.03, z + 0.05 * front ), V( s * x, SF.bridge + 0.06, z ), V( s * ( xt + 0.018 ), top - 0.03, zt ),
				V( s * xt, top, zt ), V( s * Math.max( 0, xt - 0.12 + 0.11 * back ), top + 0.012, zt - 0.05 * front + 0.08 * back ), V( s * Math.max( 0, xt - 0.2 + 0.18 * back ), top - 0.03, zt - 0.1 * front + 0.12 * back ),
				V( s * Math.max( 0, xt - 0.22 + 0.2 * back ), lerp( SF.bridge, top, 0.5 ), zt - 0.12 * front + 0.14 * back ), V( s * Math.max( 0, xt - 0.17 + 0.15 * back ), SF.bridge, zt - 0.15 * front + 0.16 * back ),
			];

		} );
		const g = gridSurface( rows );
		orientTowards( g, V( 0, 0.2, 0 ) );
		// (its faces go every way: smooth them, and let the double-sided gelcoat show the rest)
		g.computeVertexNormals();
		kit.add( 'gelcoat', g, { color: WHITE, rough: 0.28 } );

	}

	console_( kit, L, q, parts );
	seating( kit, L, q );
	hardtop( kit, L, q, parts );
	cockpitLadder( kit, q );
	aftRail( kit, q );

}

function console_( kit, L, q, parts ) {

	const b = SF.bridge, H = HELM, z0 = H.consoleZ0, z1 = H.consoleZ1, W = H.halfW;
	const knee = b + 0.62, topZ = z0 + 0.3, top = b + 1.08, backTop = top + 0.0;
	// the pod: moulded and white, a sloping face, a flat top that a hatch lifts from
	const prof = [ [ z0 + 0.03, b ], [ z0, knee ], [ topZ, top ], [ z1, backTop ], [ z1 + 0.05, b ] ];
	const rows = [];
	for ( const x of [ - W, - W * 0.98, W * 0.98, W ] ) rows.push( prof.map( ( [ z, y ] ) => V( x * ( Math.abs( x ) === W ? 1 : 1 ), y - ( Math.abs( x ) === W ? 0.04 : 0 ), z ) ) );
	const pod = gridSurface( rows );
	orientTowards( pod, V( 0, 0.5, - 1 ) );
	pod.computeVertexNormals();
	kit.add( 'gelcoat', pod, { color: WHITE, rough: 0.3 } );
	for ( const x of [ - W, W ] ) {

		const side = slab( prof, [], ( u, v, sd ) => V( x, v - 0.04, u ), { back: false, edges: false } );
		orientTowards( side, V( x, 0, 0 ) );
		side.computeVertexNormals();
		kit.add( 'gelcoat', side, { color: WHITE, rough: 0.3 } );

	}

	// the panel let into the slope: black, its screens over the wheel as in the photographs
	const B = new Vector3( 0, knee + 0.03, z0 + 0.03 ), C = new Vector3( 0, top - 0.02, topZ - 0.02 );
	const along = C.clone().sub( B ).normalize(), normal = V( 0, along.z, - along.y ).normalize(), len = B.distanceTo( C );
	const at = ( x, f ) => V( x, lerp( B.y, C.y, f ), lerp( B.z, C.z, f ) );
	const basis = () => new Matrix4().makeBasis( V( - 1, 0, 0 ), along, normal );
	const on = ( g, x, f, lift = 0 ) => {

		const c = at( x, f ).addScaledVector( normal, lift );
		g.applyMatrix4( basis().setPosition( c ) );
		return g;

	};

	kit.add( 'fittings', on( bx( - W + 0.06, - len / 2, - 0.006, W - 0.06, len / 2, 0.006 ), 0, 0.5, 0.002 ), { color: 0x14161a, rough: 0.6 } );

	// a raised black panel on top for the screens, its hood
	const scrY = top + 0.02, scrZ = z1 - 0.12;
	kit.add( 'fittings', bx( - W + 0.05, top, topZ + 0.03, W - 0.05, top + 0.012, z1 - 0.02 ), { color: 0x14161a, rough: 0.6 } );
	for ( const [ x, name ] of [ [ - 0.44, 'radar' ], [ 0, 'chart' ], [ 0.44, 'sounder' ] ] ) {

		const w = 0.4, h = 0.28, tilt = 0.35, m = mat4( x, scrY + h / 2 + 0.02, scrZ, tilt, 0, 0 );
		kit.add( 'fittings', rbx( - w / 2, - h / 2, - 0.035, w / 2, h / 2, 0.035, 0.015 ).applyMatrix4( m ), BLACK );
		const s = new PlaneGeometry( w - 0.05, h - 0.05 );
		s.applyMatrix4( new Matrix4().makeRotationY( Math.PI ) );
		s.applyMatrix4( mat4( 0, 0, - 0.037 ) );
		s.applyMatrix4( m );
		kit.add( 'display', toAtlas( s, name ), {} );

	}

	// gauges along the top of the slope, each its own in the atlas, as the lobster boat's
	for ( const [ x, f, name ] of [ [ - 0.5, 0.62, 'fuel' ], [ - 0.27, 0.72, 'tach' ], [ 0.27, 0.72, 'speed' ], [ 0.5, 0.62, 'temp' ], [ 0.62, 0.25, 'volts' ] ] ) {

		if ( ! q.low ) kit.add( 'fittings', on( torus( 0.043, 0.006, 4, 16 ), x, f, 0.012 ), STEEL );
		kit.add( 'display', toAtlas( on( new CircleGeometry( 0.042, q.low ? 12 : 20 ), x, f, 0.013 ), name ), {} );

	}

	// the wheel, on its shaft, low on the slope; twin levers to starboard, a compass ahead of the wheel
	const hub = at( 0, 0.42 ), center = hub.clone().addScaledVector( normal, 0.14 );
	kit.add( 'fittings', rod( hub, center.clone().addScaledVector( normal, - 0.03 ), 0.02, 8 ), STEEL );
	parts.wheelCenter = center;
	parts.wheelAxis = normal.clone().negate();
	const tx = - 0.52, tz = topZ - 0.02, ty = top - 0.01;
	kit.add( 'fittings', rbx( tx - 0.1, ty, tz - 0.08, tx + 0.1, ty + 0.05, tz + 0.08, 0.012 ), BLACK );
	parts.throttlePivot = V( tx, ty + 0.05, tz );

	const cx = 0, cz = topZ + 0.08, y0 = top + 0.012, CC = COMPASS_CARD;
	const bowl = lathe( [ [ 0, 0 ], [ 0.05, 0 ], [ 0.064, 0.012 ], [ 0.07, 0.05 ], [ 0.07, 0.08 ], [ 0, 0.08 ] ], q.low ? 10 : 20 );
	bowl.translate( cx, y0, cz );
	kit.add( 'fittings', bowl, BLACK );
	const dome = sphere( 0.056, q.low ? 10 : 20, 6, 0, Math.PI * 2, 0, Math.PI / 2 );
	dome.translate( cx, y0 + 0.08, cz );
	kit.add( 'glass', dome );
	parts.compassAt = V( cx, y0 + 0.1, cz );

}

function toAtlas( geo, name ) {

	const [ u0, v0, u1, v1 ] = atlasUV( name ), uv = geo.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, u0 + ( u1 - u0 ) * uv.getX( i ), v0 + ( v1 - v0 ) * uv.getY( i ) );
	return geo;

}

// her wheel, a destroyer wheel: a black rim on three steel spokes. It turns about its own +Z
export function wheelOf( q ) {

	const rad = q.low ? 6 : 10, rim = prepare( torus( 0.2, 0.012, q.low ? 5 : 7, q.low ? 18 : 36 ), BLACK ), list = [ rim ];
	for ( let k = 0; k < 3; k ++ ) {

		const a = k * Math.PI * 2 / 3 + Math.PI / 2;
		list.push( prepare( rod( V( 0, 0, 0 ), V( Math.cos( a ) * 0.2, Math.sin( a ) * 0.2, 0.02 ), 0.009, 5 ), STEEL ) );

	}

	const hub = cylinder( 0.035, 0.04, 0.05, rad );
	hub.rotateX( Math.PI / 2 );
	list.push( prepare( hub, STEEL ) );
	return mergePrepared( list );

}

// the bench seats forward and down the sides (moulded, with cream pads), as the 48's are
function seating( kit, L, q ) {

	const b = SF.bridge, seat = b + 0.46, CUSHION = { color: 0xefe9d8, rough: 0.7 };
	for ( const s of [ 1, - 1 ] ) {

		// forward of the helm either side: a lounge running forward along the coaming
		const x0 = 0.86, x1 = 1.68, z0 = - 0.3, z1 = 1.25;
		const a = Math.min( s * x0, s * x1 ), c = Math.max( s * x0, s * x1 );
		kit.add( 'gelcoat', rbx( a, b, z0, c, seat - 0.08, z1, 0.04 ), { color: LINING, rough: 0.35 } );
		kit.add( 'chairs', rbx( a + 0.02, seat - 0.09, z0 + 0.02, c - 0.02, seat, z1 - 0.02, 0.04, 2 ), CUSHION );

	}

}

function hardtop( kit, L, q, parts ) {

	const y = SF.hardtopY, z0 = SF.hardtopAft, z1 = SF.hardtopFront, X = SF.hardtopX, N = q.low ? 8 : 18, NZ = q.low ? 6 : 12;
	const edgeX = ( z ) => {

		const f = Math.abs( ( z - ( z0 + z1 ) / 2 ) / ( ( z1 - z0 ) / 2 ) );
		return X * Math.pow( Math.max( 0, 1 - Math.pow( f, 5 ) ), 0.25 ) * ( 1 - 0.1 * sstep( 0.2, 1.75, z ) );

	};

	const top = [], under = [];
	for ( let i = 0; i <= NZ; i ++ ) {

		const f = i / NZ, z = lerp( z0, z1, 0.5 - 0.5 * Math.cos( Math.PI * f ) ), w = Math.max( 0.001, edgeX( z ) ), t = [], u = [];
		for ( let k = 0; k <= N; k ++ ) {

			const a = lerp( - 1, 1, k / N ), x = w * a, crown = 0.1 * ( 1 - a * a ) * Math.sqrt( Math.max( 0, 1 - Math.pow( 2 * f - 1, 4 ) ) );
			t.push( V( x, y + 0.03 + crown, z ) );
			u.push( V( x * 1.002, y - 0.05, z ) );

		}

		top.push( t );
		under.push( u );

	}

	const gt = gridSurface( top );
	orientTowards( gt, V( 0, 1, 0 ) );
	gt.computeVertexNormals();
	kit.add( 'gelcoat', gt, { color: WHITE, rough: 0.28 } );
	const gu = gridSurface( under );
	orientTowards( gu, V( 0, - 1, 0 ) );
	gu.computeVertexNormals();
	kit.add( 'gelcoat', gu, { color: LINING, rough: 0.5 } );
	// its edge
	const ring = [];
	for ( let i = 0; i <= NZ; i ++ ) ring.push( [ top[ i ][ 0 ], under[ i ][ 0 ] ] );
	for ( let k = 1; k <= N; k ++ ) ring.push( [ top[ NZ ][ k ], under[ NZ ][ k ] ] );
	for ( let i = NZ - 1; i >= 0; i -- ) ring.push( [ top[ i ][ N ], under[ i ][ N ] ] );
	for ( let k = N - 1; k >= 0; k -- ) ring.push( [ top[ 0 ][ k ], under[ 0 ][ k ] ] );
	kit.add( 'gelcoat', gridSurface( ring ), { color: WHITE, rough: 0.3 } );

	// (M19) her VHF whips, one at each after corner of the hardtop: an 8 ft (2.44 m) fibreglass whip on a steel ratchet mount,
	// raked a little aft (Shakespeare's 5225-XT, Digital Antenna's 529-VW: docs/m19/sources-big-game.md). Her radio's reach was
	// worked out for one up here (Seaworthy's VHF_H.sportfisher); now it's drawn
	for ( const s of [ 1, - 1 ] ) {

		const zw = z0 + 0.3, base = V( s * edgeX( zw ) * 0.85, y + 0.03, zw ), up = V( base.x, base.y + 0.12, base.z );
		kit.add( 'fittings', rod( base, up, 0.025, q.low ? 5 : 8 ), STEEL );
		kit.add( 'fittings', rod( up, V( base.x + s * 0.05, up.y + 2.42, base.z - 0.3 ), 0.014, q.low ? 4 : 6, 0.005 ), { color: WHITE, rough: 0.35 } );

	}

	// the frame: tube posts, raked, X-braced aft and across the front (the tower stands on its own legs outside it)
	const r = 0.028, rad = q.low ? 5 : 8, b = SF.bridge;
	const legs = [
		[ V( 1.5, coamingY( 1.15 ) - 0.01, 1.15 ), V( 1.26, y - 0.04, 0.95 ) ],
		[ V( - 1.5, coamingY( 1.15 ) - 0.01, 1.15 ), V( - 1.26, y - 0.04, 0.95 ) ],
		[ V( 1.72, coamingY( - 1.4 ) - 0.01, - 1.4 ), V( 1.32, y - 0.04, - 1.25 ) ],
		[ V( - 1.72, coamingY( - 1.4 ) - 0.01, - 1.4 ), V( - 1.32, y - 0.04, - 1.25 ) ],
	];
	for ( const [ a, c ] of legs ) kit.add( 'fittings', rod( a, c, r, rad ), TUBE );
	kit.add( 'fittings', rod( legs[ 2 ][ 0 ], legs[ 3 ][ 1 ], 0.018, rad ), TUBE );
	kit.add( 'fittings', rod( legs[ 3 ][ 0 ], legs[ 2 ][ 1 ], 0.018, rad ), TUBE );
	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', rod( V( s * 1.72, coamingY( - 1.4 ) - 0.01, - 1.4 ), V( s * 1.26, y - 0.04, 0.95 ), 0.018, rad ), TUBE );

	// a low acrylic windscreen on a frame along the front of the coaming
	const scr = [];
	for ( let i = 0; i <= 8; i ++ ) {

		const f = i / 8, a = lerp( 1, - 1, f ), x = 1.44 * a, zb = 1.72 - 0.42 * a * a;
		scr.push( [ V( x, coamingY( 1 ) - 0.02, zb ), V( x * 0.97, coamingY( 1 ) + 0.42, zb - 0.1 ) ] );

	}

	kit.add( 'glass', gridSurface( scr ) );
	if ( ! q.low ) kit.add( 'fittings', tube( scr.map( ( s ) => s[ 1 ] ), 0.012, 24, 5 ), TUBE );

	// the spreader lights and the radar on its bracket, the searchlight forward
	const py = y + 0.13;
	kit.add( 'fittings', cylinder( 0.13, 0.17, 0.2, q.low ? 8 : 14 ).translate( 0, py + 0.1, 0.72 ), { color: 0xe9e8e2, rough: 0.4 } );
	parts.radarPivot = V( 0, py + 0.2, 0.72 );
	const lamp = cylinder( 0.08, 0.06, 0.12, q.low ? 8 : 14 );
	lamp.applyMatrix4( mat4( 0.9, y + 0.17, 1.2, Math.PI / 2 ) );
	kit.add( 'fittings', lamp, STEEL );
	parts.searchlight = V( 0.9, y + 0.17, 1.27 );
	parts.horn = V( - 0.9, y + 0.1, 1.2 );
	kit.add( 'fittings', rod( V( - 0.9, y + 0.08, 0.95 ), V( - 0.9, y + 0.1, 1.25 ), 0.045, q.low ? 6 : 12, 0.09 ), STEEL );
	// the courtesy lights let into the brow, always on after dark (the cockpit's light: Model's lamps.cockpit), as in the photograph
	for ( const x of [ - 0.4, 0.4 ] ) kit.add( 'glow', rbx( x - 0.05, SF.roofY - 0.012, COURTESY_Z - 0.05, x + 0.05, SF.roofY - 0.004, COURTESY_Z + 0.05, 0.004 ), { color: 0xfff2dc, pattern: 0 } );
	// flood lights under the brow, over the cockpit
	for ( const x of [ - 0.8, 0.8 ] ) kit.add( 'glow', rbx( x - 0.09, SF.roofY - 0.03, SF.bridgeAft + 0.05, x + 0.09, SF.roofY - 0.005, SF.bridgeAft + 0.14, 0.008 ), { color: 0xffffff, pattern: 4 } );

}

// (under the brow, clear of the ladder's hatch)
export const COURTESY_Z = - 3.1;

// her stern light, on the transom's face under the cap: it shows astern, as the rules ask, and not into her cockpit
export const STERN_LAMP = ( L ) => [ 0, L.sheerY( 0 ) - 0.24, L.zAft - 0.03 ];

// the ladder to the bridge: as on the 48, its foot on the mezzanine's sole just inboard of the tall box and clear of the door,
// steep, up through its hatch. Real treads, tube rails carried on up past the sole, and a handrail curving in on the door's side
export const BRIDGE_LADDER = { x: - 0.84, foot: V( - 0.84, SF.mezz, - 3.16 ), head: V( - 0.84, SF.bridge + 0.02, - 2.62 ), width: 0.46 };

function cockpitLadder( kit, q ) {

	const { foot, head, x, width } = BRIDGE_LADDER, n = 8, rad = q.low ? 5 : 8, w = width / 2, segs = q.low ? 10 : 24;
	const along = ( f, xAt ) => foot.clone().lerp( head, f ).setX( xAt );
	for ( const s of [ 1, - 1 ] ) {

		const X = x + s * w;
		kit.add( 'fittings', tube( [ along( 0, X ), along( 0.5, X ), along( 1, X ), head.clone().setX( X ).add( V( 0, 0.55, 0.1 ) ), head.clone().setX( X ).add( V( 0, 0.95, 0.17 ) ) ], 0.02, segs, rad, false, 0.1 ), TUBE );
		kit.add( 'fittings', bx( X - 0.04, foot.y, foot.z - 0.05, X + 0.04, foot.y + 0.012, foot.z + 0.05 ), { color: 0xc9ccd0, rough: 0.5, metal: 0.35 } );

	}

	const inX = x + w + 0.1;
	kit.add( 'fittings', tube( [ along( 0.38, x + w ), along( 0.62, inX ), along( 1, inX ), head.clone().setX( inX ).add( V( 0, 0.7, 0.14 ) ) ], 0.016, segs, rad, false, 0.3 ), TUBE );

	for ( let i = 1; i <= n; i ++ ) {

		const f = i / ( n + 1 ), p = foot.clone().lerp( head, f );
		kit.add( 'fittings', rbx( x - w, p.y - 0.018, p.z - 0.05, x + w, p.y, p.z + 0.09, 0.008 ), { color: 0xc9ccd0, rough: 0.5, metal: 0.6 } );

	}

}

// the rail round the aft end of the bridge, either side of the ladder's head
function aftRail( kit, q ) {

	const b = SF.bridge, rad = q.low ? 5 : 7, y = b + 0.92;
	const rail = ( pts ) => kit.add( 'fittings', tube( pts, 0.016, q.low ? 10 : 24, rad, false, 0.2 ), TUBE );
	for ( const s of [ 1, - 1 ] ) {

		const xo = bridgeX( SF.bridgeAft ) - 0.05;
		rail( [ V( s * 0.5, y, SF.bridgeAft + 0.05 ), V( s * ( xo - 0.3 ), y, SF.bridgeAft + 0.05 ), V( s * xo, y, SF.bridgeAft + 0.35 ), V( s * ( xo + 0.04 ), y, - 1.5 ) ] );
		for ( const [ x, z ] of [ [ s * 0.5, SF.bridgeAft + 0.05 ], [ s * ( xo - 0.3 ), SF.bridgeAft + 0.05 ], [ s * xo, - 2.3 ] ] ) kit.add( 'fittings', rod( V( x, b + 0.2, z ), V( x, y, z ), 0.013, rad ), TUBE );

	}

	// and either side of the hatch: open forward, where you step off the ladder
	const H = BRIDGE_HATCH;
	for ( const x of [ H.x0 - 0.02, H.x1 + 0.02 ] ) {

		rail( [ V( x, y, H.z0 ), V( x, y, H.z1 ) ] );
		for ( const z of [ H.z0, H.z1 ] ) kit.add( 'fittings', rod( V( x, b, z ), V( x, y, z ), 0.013, rad ), TUBE );

	}

}

// ------------------------------------------------------------------ the tower

const Y = SF.tower;
export const TOWER = {
	hx: 0.72, z0: - 1.15, z1: 0.1, // the platform
	ring: Y + 1.04, roof: Y + 2.1,
	foot: V( 0, SF.bridge, - 2.85 ), head: V( 0, Y, - 1.15 ),
	rungs: 13, ladderW: 0.44,
};

// its helm, as a tower's is: a small pod at the forward rail with its own wheel and levers. You stand to it; eye, rise as Vessel's
// helm, reach how near you need to be (the platform's only 1.25 m long, and the ladder's head is on it)
const POD = { z: TOWER.z1 - 0.26, top: Y + 1.0 };
export const TOWER_HELM = {
	z: - 0.58, reach: 0.3, rise: [ 0, - 0.62 ], eye: V( 0, Y + 1.62, - 0.58 ),
	wheelCenter: V( 0, POD.top - 0.14, POD.z - 0.2 ), wheelAxis: V( 0, - Math.sin( 0.2 ), Math.cos( 0.2 ) ), wheelScale: 0.75,
	throttlePivot: V( 0.16, POD.top + 0.05, POD.z ),
	compassAt: V( - 0.04, POD.top + 0.08, POD.z ),
	pod: { hx: 0.28, y0: Y + 0.68, y1: POD.top, z0: POD.z - 0.14, z1: POD.z + 0.14 },
};

// and where its legs stand
const LEG = [
	[ V( 1.72, SF.bridge + 0.12, - 3.0 ), V( TOWER.hx, Y, TOWER.z0 ) ],
	[ V( - 1.72, SF.bridge + 0.12, - 3.0 ), V( - TOWER.hx, Y, TOWER.z0 ) ],
	[ V( 1.48, coamingY( 1.5 ), 1.5 ), V( TOWER.hx, Y, TOWER.z1 ) ],
	[ V( - 1.48, coamingY( 1.5 ), 1.5 ), V( - TOWER.hx, Y, TOWER.z1 ) ],
];

export function buildTower( kit, L, q ) {

	const B = 'tower', rad = q.low ? 5 : 8, thin = q.low ? 4 : 6;
	for ( const [ a, c ] of LEG ) kit.add( B, rod( a, c, 0.032, rad ), TUBE );

	// bands round the legs, and X-bracing on every side between them
	const levels = q.low ? [ 0.55 ] : [ 0.32, 0.64 ];
	const bandAt = ( l, f ) => LEG[ l ][ 0 ].clone().lerp( LEG[ l ][ 1 ], f );
	const order = [ 0, 2, 3, 1 ];
	for ( const f of levels ) for ( let i = 0; i < 4; i ++ ) {

		// (the aft side's left open for the ladder)
		if ( i === 3 && f < 0.9 ) continue;
		kit.add( B, rod( bandAt( order[ i ], f ), bandAt( order[ ( i + 1 ) % 4 ], f ), 0.018, thin ), TUBE );

	}

	const fs = [ 0, ...levels, 1 ];
	for ( let k = 0; k < fs.length - 1; k ++ ) for ( const [ l0, l1 ] of [ [ 0, 2 ], [ 1, 3 ] ] ) {

		kit.add( B, k % 2 ? rod( bandAt( l1, fs[ k ] ), bandAt( l0, fs[ k + 1 ] ), 0.012, thin ) : rod( bandAt( l0, fs[ k ] ), bandAt( l1, fs[ k + 1 ] ), 0.012, thin ), TUBE );

	}

	// the forward legs' cross, and the shrouds from the aft legs down to the coaming
	kit.add( B, rod( bandAt( 2, levels[ 0 ] ), bandAt( 3, 1 ), 0.012, thin ), TUBE );
	kit.add( B, rod( bandAt( 3, levels[ 0 ] ), bandAt( 2, 1 ), 0.012, thin ), TUBE );

	// the ladder: two rails and rungs, up the middle between the aft legs
	const { foot, head, rungs, ladderW: lw } = TOWER;
	for ( const s of [ 1, - 1 ] ) kit.add( B, rod( foot.clone().setX( s * lw / 2 ), head.clone().add( V( s * lw / 2, 1.02, 0.42 ) ), 0.02, rad ), TUBE );
	for ( let i = 1; i <= rungs; i ++ ) {

		const p = foot.clone().lerp( head, i / ( rungs + 1 ) );
		kit.add( B, rod( V( - lw / 2, p.y, p.z ), V( lw / 2, p.y, p.z ), 0.012, thin ), { color: 0xc9ccd0, rough: 0.5, metal: 0.35 } );

	}

	// ties from the ladder to the bands
	for ( const f of levels ) {

		const p = foot.clone().lerp( head, f );
		for ( const s of [ 1, - 1 ] ) kit.add( B, rod( p.clone().setX( s * lw / 2 ), bandAt( s > 0 ? 0 : 1, f ), 0.012, thin ), TUBE );

	}

	// the platform: aluminium tread, a rail at the waist (the ring you lean into), a gate left at the ladder's head
	const { hx, z0, z1, ring, roof } = TOWER;
	kit.add( B, bx( - hx, Y - 0.05, z0, hx, Y, z1 ), { color: 0xc4c7ca, rough: 0.6, metal: 0.5 } );
	const rr = q.low ? 0.02 : 0.016, corner = ( x, z ) => V( x, ring, z );
	const ringPts = [ corner( 0.26, z0 ), corner( hx, z0 ), corner( hx + 0.03, ( z0 + z1 ) / 2 ), corner( hx, z1 ), corner( - hx, z1 ), corner( - hx - 0.03, ( z0 + z1 ) / 2 ), corner( - hx, z0 ), corner( - 0.26, z0 ) ];
	kit.add( B, tube( ringPts, rr, q.low ? 18 : 48, rad, false, 0.1 ), TUBE );
	for ( const p of [ ...ringPts.slice( 0, 2 ), ...ringPts.slice( 3, 5 ), ...ringPts.slice( 6 ) ] ) kit.add( B, rod( p.clone().setY( Y ), p, 0.015, thin ), TUBE );
	// the top: four posts to a small hard roof
	const rz0 = z0 + 0.12, rz1 = z1 - 0.05;
	for ( const [ x, z ] of [ [ hx - 0.06, rz0 ], [ - hx + 0.06, rz0 ], [ hx - 0.06, rz1 ], [ - hx + 0.06, rz1 ] ] ) kit.add( B, rod( V( x, ring, z ), V( x, roof, z ), 0.02, thin ), TUBE );
	const roofG = rbx( - hx - 0.04, roof, rz0 - 0.1, hx + 0.04, roof + 0.07, rz1 + 0.1, 0.03, q.low ? 1 : 2 );
	kit.add( B, roofG, { color: WHITE, rough: 0.3 } );

	// the upper station: its pod, stayed to the forward rail; the wheel on its shaft (the wheel itself: Model.wheelMesh) and the levers' box
	const P = TOWER_HELM.pod, pz = POD.z, py = POD.top, wc = TOWER_HELM.wheelCenter;
	kit.add( B, rbx( - P.hx, P.y0, P.z0, P.hx, P.y1, P.z1, 0.02 ), { color: WHITE, rough: 0.3 } );
	for ( const s of [ 1, - 1 ] ) kit.add( B, rod( V( s * 0.2, py - 0.08, P.z1 ), V( s * 0.2, ring, z1 ), 0.012, thin ), TUBE );
	kit.add( B, rod( V( 0, wc.y, pz ), wc, 0.012, thin ), STEEL );
	kit.add( B, bx( 0.06, py, pz - 0.08, 0.26, py + 0.05, pz + 0.08 ), BLACK );

	// a compass and her revs and speed on the pod's top (not on a phone: a draw for each's more than she has)
	if ( ! q.low ) {

		const c = TOWER_HELM.compassAt, facingUp = ( x, z ) => new Matrix4().makeBasis( V( - 1, 0, 0 ), V( 0, 0, 1 ), V( 0, 1, 0 ) ).setPosition( x, py + 0.002, z );
		kit.add( B, lathe( [ [ 0, 0 ], [ 0.05, 0 ], [ 0.064, 0.012 ], [ 0.07, 0.05 ], [ 0.07, 0.07 ], [ 0, 0.07 ] ], 16 ).translate( c.x, py, c.z ), BLACK );
		for ( const [ z, name ] of [ [ pz - 0.07, 'tach' ], [ pz + 0.07, 'speed' ] ] ) {

			kit.add( B, torus( 0.043, 0.006, 4, 16 ).applyMatrix4( facingUp( - 0.2, z ) ), STEEL );
			kit.add( 'towerDisplay', toAtlas( new CircleGeometry( 0.042, 20 ), name ).applyMatrix4( facingUp( - 0.2, z ) ), {} );

		}

	}

	// a dome on the roof, the masthead's
	kit.add( B, sphere( 0.2, q.low ? 8 : 14, 6, 0, Math.PI * 2, 0, Math.PI / 2 ).translate( 0, roof + 0.1, ( rz0 + rz1 ) / 2 ), { color: 0xeeece4, rough: 0.5 } );
	kit.add( B, cylinder( 0.2, 0.2, 0.1, q.low ? 8 : 14 ).translate( 0, roof + 0.07, ( rz0 + rz1 ) / 2 ), { color: 0xeeece4, rough: 0.5 } );
	for ( const s of [ 1, - 1 ] ) kit.add( B, rod( V( s * 0.55, roof + 0.05, rz0 ), V( s * 0.55, roof + 0.95, rz0 - 0.1 ), 0.008, thin ), { color: 0xeeeeee, rough: 0.5 } );

}

// the outriggers: each 27 ft of tapered pole, on a base by the hardtop's aft corner. Up, as she lies, they rake high and aft;
// out, for trolling, they drop to about 30 degrees over the water, off to each side (Model.setOutriggersOut)
export const RIGGER = { base: V( 1.72, SF.hardtopY - 0.2, - 1.1 ), length: 8.3 };
const riggerDir = ( out ) => {

	const a = out ? 0.52 : 1.12, side = out ? 0.86 : 0.22, aft = out ? 0.28 : 0.85;
	return V( side * Math.cos( a ), Math.sin( a ), - aft * Math.cos( a ) ).normalize();

};

export function riggerTip( s, out ) {

	const d = riggerDir( out );
	return V( s * ( RIGGER.base.x + d.x * RIGGER.length ), RIGGER.base.y + d.y * RIGGER.length, RIGGER.base.z + d.z * RIGGER.length );

}

export function riggerGeometry( kit, q ) {

	const rad = q.low ? 4 : 6;
	for ( const s of [ 1, - 1 ] ) {

		const base = V( s * RIGGER.base.x, RIGGER.base.y, RIGGER.base.z ), tip = riggerTip( s, false );
		kit.add( 'outriggers', rod( base, tip, 0.034, rad, 0.009 ), { color: 0xd6d9db, rough: 0.3, metal: 0.8 } );
		// its line, up to the tip and back, and the spreaders on the pole (high only)
		if ( ! q.low ) for ( const f of [ 0.5, 0.75 ] ) {

			const p = base.clone().lerp( tip, f );
			kit.add( 'outriggers', rod( p, p.clone().add( V( 0, - 0.05, s * 0.16 ) ), 0.006, 3 ), TUBE );

		}

	}

	// the steel bases, on the hardtop's frame: not moved with the poles
	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', rod( V( s * 1.32, SF.hardtopY - 0.06, - 1.15 ), V( s * RIGGER.base.x, RIGGER.base.y, RIGGER.base.z ), 0.03, rad ), STEEL );

}
