import { CircleGeometry, Matrix4, PlaneGeometry, Vector3 } from '../../../engine/index.js';
import { box, rod, tube, torus, cylinder, sphere, roundedBox, lathe, gridSurface, mat4, auxVertices } from '../GeoKit.js';
import { sstep, lerp } from '../HullLines.js';
import { atlasUV } from '../Instruments.js';
import { solid, rounded, softCorners, moulded } from './Mould.js';
import { SEAT } from './Moulded.js';
import { DECK, GEL } from './ConsoleHull.js';

// (M16) Her helm, after the Regulator 23's photographs: the console with the seat on its front; the slope with the wheel,
// the lever and the gauges in their black band, and the upright panel over it with the screens (drawn by the instruments in
// model.materials.display); the compass on top and the windscreen; the leaning post with its seats behind. The T-top on its
// four legs, its radio pod and rocket launchers. The fittings a boat buys go in under kit.fitting, so she can go without.

const V = ( x, y, z ) => new Vector3( x, y, z );
const S = DECK.sole;
const STAINLESS = { color: 0xcfd3d6, rough: 0.2, metal: 1 };
const BLACK = { color: 0x151618, rough: 0.5 };
const BAND = { color: 0x1d1f22, rough: 0.42 };
const WHITE_TUBE = { color: 0xefece2, rough: 0.34 };

// where things are on her (boat frame)
export const CONSOLE = {
	halfW: 0.47,
	back: - 0.62, // its foot, aft
	front: 0.44,
	slope: [ [ - 0.62, S + 0.6 ], [ - 0.32, S + 0.98 ] ], // the slope, foot to head ( z, y )
	panel: [ [ - 0.32, S + 0.98 ], [ - 0.2, S + 1.4 ] ], // the upright panel
	top: S + 1.4,
};
export const WHEEL = { x: 0.2, along: 0.56, r: 0.18 };
export const POST = { z0: - 1.56, z1: - 0.98, halfW: 0.46, top: S + 0.56 };
export const TOP = { y: 2.56, under: 2.47, z0: - 1.56, z1: 0.76, halfW: 0.9 };
export const RACK = { z: - 1.72, xs: [ - 0.33, - 0.11, 0.11, 0.33 ], base: S + 0.03, r: 0.092, h: 0.62 };

// a point on a sloping panel: x across it, along up it from its foot (0..1), out proud of its face
function panelFrame( [ [ z0, y0 ], [ z1, y1 ] ], halfW = CONSOLE.halfW ) {

	const dz = z1 - z0, dy = y1 - y0, l = Math.hypot( dz, dy );
	const normal = V( 0, - dz / l, - dy / l ); // (out toward the helm: aft and up)
	if ( normal.y < 0 ) normal.y *= - 1;
	const along = V( 0, dy / l, dz / l );
	return {
		l, along, normal, halfW,
		at: ( x, f, out = 0 ) => V( x, y0 + dy * f, z0 + dz * f ).addScaledVector( normal, out ),
		// a geometry made in x-y facing +z, placed on the panel, reading as the helm sees it
		basis: ( x, f, out = 0 ) => new Matrix4().makeBasis( V( - 1, 0, 0 ), along, normal ).setPosition( V( x, y0 + dy * f, z0 + dz * f ).addScaledVector( normal, out ) ),
	};

}

function toAtlas( geo, name ) {

	const [ u0, v0, u1, v1 ] = atlasUV( name ), uv = geo.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, u0 + ( u1 - u0 ) * uv.getX( i ), v0 + ( v1 - v0 ) * uv.getY( i ) );
	return geo;

}

export function buildHelm( kit, L, parts ) {

	consoleBody( kit, parts );
	leaningPost( kit, parts );

	kit.fitting = 'tTop';
	tTop( kit, parts );
	kit.fitting = 'tankRack';
	tanks( kit );
	kit.fitting = null;

}

function consoleBody( kit, parts ) {

	const C = CONSOLE, W = C.halfW;
	const place = ( u, v, d ) => V( d, v, u );
	// its side, aft to fore: foot, slope, panel, top, and the rake of its front
	const side = [ [ C.back, S - 0.02 ], [ C.back, C.slope[ 0 ][ 1 ] ], C.slope[ 1 ], C.panel[ 1 ], [ 0.2, C.top ], [ 0.32, S + 1.12 ], [ C.front, S + 0.8 ], [ C.front, S - 0.02 ] ];
	const body = solid( softCorners( side, 0.05, 3 ), - W, W, 0.045, place, { rings: 3 } );
	kit.add( 'hull', body, GEL );
	// the toe kick about its foot, darker
	kit.add( 'hull', solid( rounded( - W + 0.02, C.back + 0.03, W - 0.02, C.front - 0.03, 0.03 ), S - 0.01, S + 0.012, 0.005, ( u, v, d ) => V( u, d, v ), { rings: 1 } ), { color: 0xcfcab9, rough: 0.5 } );

	// ---- the slope: the black band of gauges and switches over the wheel
	const sl = panelFrame( C.slope ), pn = panelFrame( C.panel );
	const band = roundedBox( W * 2 - 0.1, 0.13, 0.012, 0.005, 1 );
	band.applyMatrix4( sl.basis( 0, 0.82, 0.002 ) );
	kit.add( 'fittings', band, BAND );
	// the gauges, each its own in the instruments' atlas: the tachometer and the speed over the wheel, the rest along
	for ( const [ x, r, name ] of [ [ - 0.33, 0.042, 'fuel' ], [ - 0.2, 0.042, 'temp' ], [ - 0.07, 0.042, 'volts' ], [ 0.1, 0.052, 'speed' ], [ 0.3, 0.052, 'tach' ] ] ) {

		const bezel = torus( r + 0.002, 0.005, 4, 18 );
		bezel.applyMatrix4( sl.basis( x, 0.82, 0.012 ) );
		kit.add( 'fittings', bezel, STAINLESS );
		const dial = new CircleGeometry( r, 20 );
		dial.applyMatrix4( sl.basis( x, 0.82, 0.011 ) );
		kit.add( 'display', toAtlas( dial, name ), {} );

	}

	// switches under the screens' band, lit rocker-like studs along the band's foot
	for ( let i = 0; i < 6; i ++ ) {

		const stud = cylinder( 0.007, 0.008, 0.008, 8 ).rotateX( Math.PI / 2 );
		stud.applyMatrix4( sl.basis( - 0.38 + i * 0.05, 0.62, 0.006 ) );
		kit.add( 'fittings', stud, STAINLESS );

	}

	// the wheel's stalk, the wheel itself is a part of its own (it turns)
	const wc = sl.at( WHEEL.x, WHEEL.along, 0.055 ), wn = sl.normal.clone().multiplyScalar( - 1 ).applyAxisAngle( V( 1, 0, 0 ), 0.06 ).normalize();
	kit.add( 'fittings', rod( sl.at( WHEEL.x, WHEEL.along, 0 ), wc, 0.03, 10, 0.024 ), BLACK );
	parts.wheelCenter = wc.clone();
	parts.wheelAxis = wn.clone().multiplyScalar( - 1 );
	// the lever's binnacle to starboard of it; the lever's a part of its own
	const binn = roundedBox( 0.1, 0.13, 0.11, 0.025, 1 );
	binn.applyMatrix4( sl.basis( - 0.14, 0.42, 0.05 ) );
	kit.add( 'fittings', binn, BLACK );
	parts.throttlePivot = sl.at( - 0.14, 0.42, 0.11 );
	// the cup holders by it
	for ( const x of [ - 0.3, - 0.39 ] ) {

		const ring = torus( 0.036, 0.005, 4, 14 );
		ring.applyMatrix4( sl.basis( x, 0.34, 0.003 ) );
		kit.add( 'fittings', ring, STAINLESS );
		const hole = new CircleGeometry( 0.034, 12 );
		hole.applyMatrix4( sl.basis( x, 0.34, 0.002 ) );
		kit.add( 'fittings', hole, BLACK );

	}

	// a grab rail each side of the slope
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'fittings', tube( [ V( s * ( W + 0.01 ), S + 0.62, C.back + 0.13 ), V( s * ( W + 0.055 ), S + 0.72, C.back + 0.1 ), V( s * ( W + 0.055 ), S + 0.98, - 0.33 ), V( s * ( W + 0.01 ), S + 1.06, - 0.26 ) ], 0.014, 10, 6 ), WHITE_TUBE );

	}

	// ---- the upright panel: two screens, the chart ahead of the wheel and the sounder beside it. Screens' faces drawn live
	for ( const [ x, name ] of [ [ 0.18, 'chart' ], [ - 0.18, 'sounder' ] ] ) {

		const w = 0.33, h = 0.23;
		const body2 = roundedBox( w + 0.02, h + 0.02, 0.018, 0.008, 1 );
		body2.applyMatrix4( pn.basis( x, 0.55, 0.002 ) );
		kit.add( 'fittings', body2, BLACK );
		const screen = new PlaneGeometry( w - 0.015, h - 0.015 );
		screen.applyMatrix4( pn.basis( x, 0.55, 0.0125 ) );
		kit.add( 'display', toAtlas( screen, name ), {} );

	}

	// ---- the compass on top, by the windscreen's foot: a dome on a black foot, the card a part of its own
	const cx = WHEEL.x, cz = - 0.06, cy = C.top + 0.004;
	kit.add( 'fittings', cylinder( 0.066, 0.075, 0.02, 18 ).translate( cx, cy + 0.01, cz ), BLACK );
	kit.add( 'fittings', sphere( 0.066, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2 ).scale( 1, 0.85, 1 ).translate( cx, cy + 0.02, cz ), { color: 0x23262a, rough: 0.2 } );
	parts.compassAt = V( cx, cy + 0.056, cz );

	// ---- the windscreen: acrylic in a black frame, from the console's top to the T-top's legs
	const sy = C.top - 0.02, zs = 0.2, topY = S + 1.72, zt = 0.13, W2 = W - 0.03;
	const pane = ( a, b, c, d ) => {

		const g = gridSurface( [ [ a, b ], [ d, c ] ], {} );
		kit.add( 'glass', g, {} );

	};

	pane( V( W2, sy, zs ), V( - W2, sy, zs ), V( - W2 * 0.96, topY, zt ), V( W2 * 0.96, topY, zt ) );
	for ( const s of [ 1, - 1 ] ) pane( V( s * W2, sy, zs ), V( s * W2 * 1.02, sy, - 0.2 ), V( s * W2 * 1.0, topY - 0.05, - 0.14 ), V( s * W2 * 0.96, topY, zt ) );
	kit.add( 'fittings', tube( [ V( - W2 * 0.96, topY, zt ), V( 0, topY + 0.006, zt ), V( W2 * 0.96, topY, zt ) ], 0.011, 8, 5 ), BLACK );
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'fittings', rod( V( s * W2, sy, zs ), V( s * W2 * 0.96, topY, zt ), 0.011, 5 ), BLACK );
		kit.add( 'fittings', rod( V( s * W2 * 1.0, topY - 0.05, - 0.14 ), V( s * W2 * 0.96, topY, zt ), 0.009, 5 ), BLACK );
		kit.add( 'fittings', rod( V( s * W2 * 1.02, sy, - 0.2 ), V( s * W2 * 1.0, topY - 0.05, - 0.14 ), 0.009, 5 ), BLACK );

	}

	// ---- the seat on its front: a box with a cooler in it, its pad and the backrest against the console
	const F0 = C.front, F1 = C.front + 0.6;
	kit.add( 'hull', solid( rounded( F0 - 0.02, S - 0.02, F1, S + 0.36, 0.04 ), - W + 0.03, W - 0.03, 0.03, place ), GEL );
	kit.add( 'fittings', solid( rounded( - W + 0.04, F0 + 0.04, W - 0.04, F1 + 0.02, 0.05 ), S + 0.355, S + 0.44, 0.03, ( u, v, d ) => V( u, d, v ), { rings: 2 } ), { color: 0xe9e3d3, rough: 0.6 } );
	kit.add( 'fittings', solid( rounded( - W + 0.05, S + 0.46, W - 0.05, S + 0.86, 0.05 ), F0 - 0.005, F0 + 0.075, 0.03, ( u, v, d ) => V( u, v, d ), { rings: 2 } ), { color: 0xe9e3d3, rough: 0.6 } );
	// a latch each side of the box
	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', box( 0.05, 0.05, 0.01 ).translate( s * 0.3, S + 0.26, F1 + 0.003 ), STAINLESS );
	// the instruments' low light; the VHF goes up in the T-top's pod, or here if she's without one (no room: she just has it there)

}

function leaningPost( kit ) {

	const P = POST, W = P.halfW;
	// the post: a box with tackle drawers aft, a wider foot
	kit.add( 'hull', solid( rounded( P.z0, S - 0.02, P.z1, P.top, 0.035 ), - W, W, 0.03, ( u, v, d ) => V( d, v, u ) ), GEL );
	// drawers on its back
	for ( const [ x, y ] of [ [ - 0.21, S + 0.38 ], [ 0.21, S + 0.38 ], [ - 0.21, S + 0.17 ], [ 0.21, S + 0.17 ] ] ) {

		kit.add( 'hull', solid( rounded( x - 0.18, y - 0.08, x + 0.18, y + 0.08, 0.018 ), P.z0 - 0.012, P.z0 + 0.012, 0.004, ( u, v, d ) => V( u, v, d ), { rings: 1 } ), { color: 0xdedacb, rough: 0.4 } );
		kit.add( 'fittings', cylinder( 0.012, 0.012, 0.016, 8 ).rotateX( Math.PI / 2 ).translate( x, y, P.z0 - 0.018 ), STAINLESS );

	}

	// the seats, facing the wheel
	const seat = moulded( SEAT );
	seat.translate( 0, P.top, ( P.z0 + P.z1 ) / 2 + 0.05 );
	kit.add( 'fittings', seat );
	// the grab rail about the seats, white, as hers is; and the footrest bars with their black treads
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'fittings', tube( [ V( s * ( W + 0.01 ), P.top - 0.02, P.z0 + 0.07 ), V( s * ( W + 0.075 ), P.top + 0.13, P.z0 + 0.06 ), V( s * ( W + 0.085 ), P.top + 0.2, P.z1 - 0.32 ), V( s * ( W + 0.07 ), P.top + 0.19, P.z1 + 0.02 ), V( s * ( W + 0.012 ), P.top - 0.02, P.z1 + 0.02 ) ], 0.015, 14, 6 ), WHITE_TUBE );

	}

	for ( const x of [ - 0.25, 0.25 ] ) {

		const y = S + 0.21, z = P.z1 + 0.09;
		kit.add( 'fittings', box( 0.2, 0.012, 0.1 ).translate( x, y, z ), BLACK );
		for ( const d of [ - 0.09, 0.09 ] ) kit.add( 'fittings', rod( V( x + d, y - 0.004, z ), V( x + d, y - 0.004, P.z1 ), 0.008, 5 ), STAINLESS );

	}

}

// ---- the T-top: a white moulded hardtop, oval, a navy lip under its edge, on four legs that lean out to it

function tTop( kit, parts ) {

	const T = TOP, N = 40, cz = ( T.z0 + T.z1 ) / 2, hl = ( T.z1 - T.z0 ) / 2;
	const oval = ( f, a ) => {

		// (superellipse, fuller aft: its aft end's where the rods hang)
		const c = Math.cos( a ), s = Math.sin( a ), e = 0.55;
		const b = 1 - 0.1 * sstep( 0, 1, c );
		return [ f * T.halfW * b * Math.sign( s ) * Math.abs( s ) ** e, cz + f * hl * Math.sign( c ) * Math.abs( c ) ** e ];

	};

	const ringAt = ( f, y ) => {

		const r = [];
		for ( let i = 0; i < N; i ++ ) {

			const a = i / N * Math.PI * 2, [ x, z ] = oval( f, a );
			r.push( V( x, y, z ) );

		}

		return r;

	};

	// the crown over it, from the middle out; then round its edge and back in under, the lip navy
	const rings = [], top = T.y;
	for ( const f of [ 0.02, 0.3, 0.6, 0.82, 0.93, 0.985, 1 ] ) rings.push( ringAt( f, top + 0.05 * ( 1 - f * f ) - ( f > 0.98 ? 0.012 : 0 ) ) );
	rings.push( ringAt( 1, top - 0.035 ), ringAt( 0.985, top - 0.07 ) );
	const g = gridSurface( rings, { closeJ: true } );
	const orient = g.attributes.normal.getY( Math.floor( N / 4 ) * 1 + N * 2 ) > 0;
	if ( ! orient ) {

		const a = Array.from( g.index.array );
		for ( let i = 0; i < a.length; i += 3 ) [ a[ i + 1 ], a[ i + 2 ] ] = [ a[ i + 2 ], a[ i + 1 ] ];
		g.setIndex( a );
		g.computeVertexNormals();

	}

	kit.add( 'hull', g, { color: 0xf1eee6, rough: 0.3 } );
	const lip = gridSurface( [ ringAt( 0.985, top - 0.07 ), ringAt( 0.9, T.under + 0.0 ), ringAt( 0.82, T.under - 0.005 ) ], { closeJ: true } );
	if ( lip.attributes.normal.getY( N ) > 0 ) {

		const a = Array.from( lip.index.array );
		for ( let i = 0; i < a.length; i += 3 ) [ a[ i + 1 ], a[ i + 2 ] ] = [ a[ i + 2 ], a[ i + 1 ] ];
		lip.setIndex( a );
		lip.computeVertexNormals();

	}

	kit.add( 'hull', lip, { color: 0x13243c, rough: 0.3 } );
	// the moulded headliner under it
	const roof = gridSurface( [ ringAt( 0.82, T.under - 0.005 ), ringAt( 0.5, T.under - 0.04 ), ringAt( 0.02, T.under - 0.045 ) ], { closeJ: true } );
	if ( roof.attributes.normal.getY( N ) > 0 ) {

		const a = Array.from( roof.index.array );
		for ( let i = 0; i < a.length; i += 3 ) [ a[ i + 1 ], a[ i + 2 ] ] = [ a[ i + 2 ], a[ i + 1 ] ];
		roof.setIndex( a );
		roof.computeVertexNormals();

	}

	kit.add( 'hull', roof, { color: 0xeeebe0, rough: 0.5 } );

	// ---- the legs: heavy tubes, moulded white, leaning out as they rise; aft ones from the console's shoulders
	const W = CONSOLE.halfW, u = T.under - 0.03;
	for ( const s of [ 1, - 1 ] ) {

		// (as hers: near upright, heavy, turning out only at the shoulder)
		kit.add( 'hull', tube( [ V( s * ( W - 0.05 ), CONSOLE.top - 0.03, 0.2 ), V( s * ( W - 0.04 ), S + 1.7, 0.2 ), V( s * ( W - 0.03 ), u - 0.22, 0.2 ), V( s * ( W + 0.01 ), u - 0.07, 0.21 ), V( s * ( W + 0.08 ), u + 0.04, 0.23 ) ], 0.038, 12, 8 ), WHITE_TUBE );
		kit.add( 'hull', tube( [ V( s * ( W - 0.012 ), S + 0.72, - 0.48 ), V( s * ( W - 0.005 ), S + 1.15, - 0.52 ), V( s * ( W + 0.0 ), S + 1.7, - 0.6 ), V( s * ( W + 0.03 ), u - 0.1, - 0.68 ), V( s * ( W + 0.09 ), u + 0.04, - 0.74 ) ], 0.04, 14, 8 ), WHITE_TUBE );
		// the top's fairing about each leg's head
		for ( const [ z, x ] of [ [ 0.23, W + 0.08 ], [ - 0.74, W + 0.09 ] ] ) kit.add( 'hull', cylinder( 0.085, 0.05, 0.09, 10 ).translate( s * x, u + 0.012, z ), WHITE_TUBE );

	}

	// ---- the pod over the helm: its radio's face in the instruments' atlas, tilted to you, and a grab handle
	const pz = - 0.28, py = T.under - 0.11;
	const tiltX = 0.42, pod = solid( rounded( - 0.32, - 0.09, 0.32, 0.09, 0.03 ), - 0.16, 0.16, 0.03, ( x, v, d ) => {

		const c = Math.cos( tiltX ), sn = Math.sin( tiltX );
		return V( x, py + v * c - d * sn * 0.2, pz + d - v * sn );

	} );
	kit.add( 'hull', pod, { color: 0xeeebe0, rough: 0.5 } );
	const M = new Matrix4().makeRotationY( Math.PI ).premultiply( new Matrix4().makeRotationX( - tiltX ) ).setPosition( V( 0.14, py + 0.005, pz - 0.17 ) );
	const vhfBody = roundedBox( 0.19, 0.082, 0.02, 0.006, 1 );
	vhfBody.applyMatrix4( M );
	kit.add( 'fittings', vhfBody, BLACK );
	const face = new PlaneGeometry( 0.176, 0.072 );
	face.translate( 0, 0, 0.0108 );
	face.applyMatrix4( M );
	kit.add( 'display', toAtlas( face, 'vhf' ), {} );
	kit.add( 'fittings', tube( [ V( - 0.16, T.under - 0.04, - 0.92 ), V( - 0.16, T.under - 0.11, - 0.92 ), V( 0.16, T.under - 0.11, - 0.92 ), V( 0.16, T.under - 0.04, - 0.92 ) ], 0.012, 10, 6, false, 0.2 ), BLACK );
	// the spreaders under its edge and the dome lights
	for ( const [ x, z ] of [ [ 0.55, - 1.42 ], [ - 0.55, - 1.42 ], [ 0.55, 0.66 ], [ - 0.55, 0.66 ] ] ) kit.add( 'glow', box( 0.15, 0.012, 0.04 ).translate( x, T.under - 0.012, z ), { color: 0xfff1d8, rough: 0.3, pattern: 4 } );
	kit.add( 'glow', cylinder( 0.035, 0.035, 0.008, 10 ).translate( 0, T.under - 0.05, - 0.6 ), { color: 0x56a2ff, rough: 0.3, pattern: 5 } );

	// ---- its rain cover: clear drop curtains on the sides and aft, zipped to the top's edge when it rains, stowed on a fine day
	const hem = T.under - 0.03, foot = S + 0.92, cloth = { color: 0xe4dfd0, rough: 0.7 };
	const side = [ [ 0.25, T.halfW - 0.1 ], [ - 1.05, T.halfW - 0.1 ] ];
	const aftZ = T.z0 + 0.22, aftX = T.halfW - 0.36;
	kit.fitting = 'coverDown';
	const curtain = ( a, b, yT, yB ) => {

		kit.add( 'glass', gridSurface( [ [ V( a[ 0 ], yT, a[ 1 ] ), V( b[ 0 ], yT, b[ 1 ] ) ], [ V( a[ 0 ], yB, a[ 1 ] ), V( b[ 0 ], yB, b[ 1 ] ) ] ], {} ), {} );
		kit.add( 'fittings', rod( V( a[ 0 ], yT, a[ 1 ] ), V( b[ 0 ], yT, b[ 1 ] ), 0.012, 4 ), cloth );
		kit.add( 'fittings', rod( V( a[ 0 ], yB, a[ 1 ] ), V( b[ 0 ], yB, b[ 1 ] ), 0.009, 4 ), cloth );
		for ( const e of [ a, b ] ) kit.add( 'fittings', rod( V( e[ 0 ], yT, e[ 1 ] ), V( e[ 0 ], yB, e[ 1 ] ), 0.008, 4 ), cloth );

	};

	for ( const s of [ 1, - 1 ] ) curtain( [ s * side[ 0 ][ 1 ], side[ 0 ][ 0 ] ], [ s * side[ 1 ][ 1 ], side[ 1 ][ 0 ] ], hem, foot + 0.3 );
	curtain( [ - aftX, aftZ ], [ aftX, aftZ ], hem, foot + 0.55 );
	kit.fitting = 'tTop';

	// ---- the rocket launcher along its after edge: five white tubes raked out, a rod in each; and two whips
	const zb = T.z0 + 0.16;
	const rodLook = { color: 0x101114, rough: 0.35 };
	for ( let i = 0; i < 5; i ++ ) {

		const x = ( i - 2 ) * 0.27, base = V( x, T.y + 0.03, zb ), dir = V( x * 0.14, 0.62, - 0.75 ).normalize();
		kit.add( 'fittings', rod( base, base.clone().addScaledVector( dir, 0.3 ), 0.024, 8 ), WHITE_TUBE );
		kit.add( 'fittings', cylinder( 0.05, 0.05, 0.03, 8 ).translate( x, T.y + 0.03, zb ), WHITE_TUBE );
		const butt = base.clone().addScaledVector( dir, 0.28 ), tip = base.clone().addScaledVector( dir, 2.05 ).add( V( x * 0.2, - 0.02, 0 ) );
		kit.add( 'fittings', rod( butt, tip, 0.012, 5, 0.0035 ), rodLook );
		// its reel, a chunk on the butt
		const reelAt = base.clone().addScaledVector( dir, 0.47 );
		kit.add( 'fittings', cylinder( 0.04, 0.04, 0.075, 10 ).rotateZ( Math.PI / 2 ).translate( reelAt.x, reelAt.y - 0.045, reelAt.z - 0.02 ), { color: 0x7f8388, rough: 0.3, metal: 1 } );

	}

	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', rod( V( s * 0.62, T.y, - 1.2 ), V( s * 0.64, T.y + 2.3, - 1.28 ), 0.009, 5, 0.0025 ), { color: 0xeeeeea, rough: 0.5 } );
	void parts;

}

// ---- the tanks, racked upright across the back of the post: four 80 cu ft cylinders with their boots, valves and a band

function tanks( kit ) {

	const R = RACK, top = R.base + R.h;
	for ( let i = 0; i < R.xs.length; i ++ ) {

		const x = R.xs[ i ], colour = i % 2 ? { color: 0xc9a227, rough: 0.35 } : { color: 0xcfd3d6, rough: 0.28, metal: 1 };
		const prof = [ [ 0, R.base ], [ R.r * 0.96, R.base ], [ R.r, R.base + 0.015 ], [ R.r, top - 0.075 ], [ R.r * 0.86, top - 0.022 ], [ R.r * 0.55, top ], [ 0.03, top + 0.012 ], [ 0.015, top + 0.018 ] ];
		kit.add( 'fittings', lathe( prof, 14 ).translate( x, 0, R.z ), colour );
		kit.add( 'fittings', cylinder( R.r + 0.003, R.r + 0.003, 0.09, 14 ).translate( x, R.base + 0.04, R.z ), BLACK );
		kit.add( 'fittings', rod( V( x, top + 0.012, R.z ), V( x, top + 0.075, R.z ), 0.014, 8 ), STAINLESS );
		kit.add( 'fittings', sphere( 0.021, 8, 6 ).translate( x + 0.022, top + 0.066, R.z ), BLACK );

	}

	// the rack: a rail along the post's back and a padded band over each
	const y = R.base + R.h * 0.62;
	kit.add( 'fittings', rod( V( - 0.46, y, R.z + R.r + 0.03 ), V( 0.46, y, R.z + R.r + 0.03 ), 0.012, 6 ), STAINLESS );
	kit.add( 'fittings', rod( V( - 0.46, R.base + 0.16, R.z + R.r + 0.03 ), V( 0.46, R.base + 0.16, R.z + R.r + 0.03 ), 0.012, 6 ), STAINLESS );
	for ( const x of R.xs ) kit.add( 'fittings', torus( R.r + 0.006, 0.011, 4, 14 ).rotateX( Math.PI / 2 ).translate( x, y, R.z ), BLACK );

}

// the wheel: a stainless rim and five spokes, as hers, about its local Z
export function wheelGeometry() {

	const parts = [ torus( WHEEL.r, 0.011, 6, 28 ) ], R = WHEEL.r;
	for ( let i = 0; i < 5; i ++ ) {

		const a = i / 5 * Math.PI * 2;
		parts.push( rod( V( Math.cos( a ) * 0.03, Math.sin( a ) * 0.03, 0.03 ), V( Math.cos( a ) * R, Math.sin( a ) * R, 0 ), 0.007, 5 ) );

	}

	parts.push( cylinder( 0.038, 0.042, 0.05, 12 ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.03 ) );
	return parts;

}

// the lever: an arm and a black grip, pivoting at its foot about X
export function throttleGeometry() {

	return [
		box( 0.03, 0.14, 0.02 ).translate( 0, 0.07, 0 ),
		roundedBox( 0.12, 0.032, 0.04, 0.012, 1 ).translate( - 0.02, 0.15, 0 ),
	];

}

void [ mat4, auxVertices, lerp ];
