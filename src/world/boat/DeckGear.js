import { BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Vector3 } from '../../engine/index.js';
import { box, roundedBox, cylinder, rod, sphere, torus, lathe, tube, mat4, alignY, auxVertices } from './GeoKit.js';
import { foredeckY, PALETTE } from './HullBuilder.js';
import { lerp } from './HullLines.js';

const V = ( x, y, z ) => new Vector3( x, y, z );

const STAINLESS = { color: PALETTE.stainless, rough: 0.22, metal: 1 };
const GALV = { color: 0xa3a7ab, rough: 0.35, metal: 1 };
const BLACK = { color: 0x1a1b1d, rough: 0.55, metal: 0 };

// Maine lobster buoy (foam bullet in the owner's colours) with its spindle stick.
// Returns [geometry, options] pairs for the fittings bucket; origin at the buoy's base.
export function buoyGeometry( colors = [ 0xff6a13, 0xf4f1ea, 0x1d4f9c ], stick = 0.35 ) {

	const bands = [
		[ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.055, 0.025 ], [ 0.07, 0.07 ], [ 0.075, 0.12 ], [ 0.075, 0.17 ] ],
		[ [ 0.075, 0.17 ], [ 0.075, 0.22 ], [ 0.075, 0.27 ] ],
		[ [ 0.075, 0.27 ], [ 0.074, 0.33 ], [ 0.068, 0.39 ], [ 0.052, 0.435 ], [ 0.03, 0.455 ], [ 0, 0.46 ] ],
	];
	const out = bands.map( ( b, i ) => [ lathe( b, 12 ), { color: colors[ i ], rough: 0.55 } ] );
	out.push( [ cylinder( 0.011, 0.013, 0.46 + stick + 0.06, 6 ).translate( 0, ( 0.46 + stick - 0.06 ) / 2, 0 ), { color: 0x9c7a4c, rough: 0.75 } ] );
	return out;

}

export function buildDeckGear( kit, L, parts ) {

	buildHauler( kit, L );
	buildCoils( kit, L );
	buildBuoys( kit, L );
	buildFenders( kit, L );
	buildCleats( kit, L );
	buildBow( kit, L );
	buildContainers( kit, L );
	buildStern( kit, L, parts );
	buildWayUp( kit, L );

}

// ------------------------------------------------------------------ (M17) the way forward and up (docs/m17/back.md)
// As a Downeast boat has it: her side decks past the house, about 8 in wide (the Jarvis Newman 32's are 9 3/4 in), walked with a
// hand on the roof's grab rail, to her foredeck and its forward-opening hatch over the cuddy (the Holland 32's) and the anchor on
// her bow roller. Up to them from the cockpit, two teak steps at the house's aft corner, to port (the hauler's to starboard);
// on to her roof, two fold-down steps on the house's side by the grab rail's post. Her frame: +x port.
export const WAY_UP = {
	z0: - 0.82, z1: - 0.4, // the steps, along her
	lower: { x0: 0.8, x1: 1.05, top: 0.64 }, upper: { x0: 1.05, x1: 1.3, top: 0.93 },
	roofZ: - 0.1, // the fold-down steps up the house side
	rungs: [ 1.58, 1.98 ], // their treads' heights
	hatch: { z: 2.45, w: 0.56, d: 0.56 }, // on her foredeck's centreline
	bow: 3.75, // where her anchor's worked: by the roller, on her foredeck
};

function buildWayUp( kit, L ) {

	const W = WAY_UP, TEAK = { color: 0x9a6b40, rough: 0.5 }; // (teak, weathered)
	// the teak steps: two treads on a riser block against her side
	for ( const [ t, y0 ] of [ [ W.lower, L.deckY ], [ W.upper, W.lower.top - 0.06 ] ] ) {

		const w = t.x1 - t.x0, d = W.z1 - W.z0, h = t.top - y0;
		const g = roundedBox( w, h, d, 0.012, 1 );
		g.translate( ( t.x0 + t.x1 ) / 2, y0 + h / 2, ( W.z0 + W.z1 ) / 2 );
		kit.add( 'wood', g, TEAK );

	}

	// the fold-down steps up the house side to her roof: a stainless tread on a hinge plate each, outboard of the house
	const hw = houseHalf( L, W.roofZ );
	for ( const y of W.rungs ) {

		const plate = box( 0.012, 0.09, 0.16 );
		plate.translate( hw + 0.006, y - 0.03, W.roofZ );
		kit.add( 'fittings', plate, STAINLESS );
		const tread = roundedBox( 0.11, 0.014, 0.15, 0.005, 1 );
		tread.translate( hw + 0.062, y, W.roofZ );
		kit.add( 'fittings', tread, STAINLESS );
		for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', rod( V( hw + 0.01, y - 0.07, W.roofZ + s * 0.065 ), V( hw + 0.11, y - 0.005, W.roofZ + s * 0.065 ), 0.006, 4 ), STAINLESS );

	}

	// the foredeck hatch: a low aluminium frame, its smoked lid hinged at its forward edge (it opens forward, as hers do)
	const H = W.hatch, t = L.tAtSheerZ( H.z ), y = foredeckY( L, t, 0 );
	const frame = roundedBox( H.w + 0.05, 0.035, H.d + 0.05, 0.012, 1 );
	frame.translate( 0, y + 0.012, H.z );
	kit.add( 'fittings', frame, { color: 0xb8bcc0, rough: 0.45, metal: 1 } );
	const lid = roundedBox( H.w, 0.018, H.d, 0.01, 1 );
	lid.translate( 0, y + 0.037, H.z );
	kit.add( 'fittings', lid, { color: 0x2b3036, rough: 0.12, metal: 0 } );
	for ( const s of [ 1, - 1 ] ) {

		const hinge = cylinder( 0.012, 0.012, 0.07, 6 );
		hinge.applyMatrix4( mat4( s * 0.16, y + 0.04, H.z + H.d / 2 + 0.02, 0, 0, Math.PI / 2 ) );
		kit.add( 'fittings', hinge, STAINLESS );

	}

	const handle = rod( V( - 0.06, y + 0.05, H.z - H.d / 2 + 0.05 ), V( 0.06, y + 0.05, H.z - H.d / 2 + 0.05 ), 0.008, 5 );
	kit.add( 'fittings', handle, STAINLESS );

}

// (the house's half width outboard, as HullBuilder has it: her sheer less 0.2)
const houseHalf = ( L, z ) => L.sheerX( L.tAtSheerZ( z ) ) - 0.2;

// ------------------------------------------------------------------ hauler and davit (starboard)

export const HAULER = { x: - 1.0, z: - 0.62, y: 1.34 };
export const BARREL_Z = - 1.12; // (M17) the bait barrel's middle, along her (it was - 0.8: the steps are there now)

function buildHauler( kit, L ) {

	const t = L.tAtSheerZ( - 0.78 );
	const xg = - ( L.sheerX( t ) - 0.035 ), yg = L.sheerY( t ) + 0.045;

	// davit arm from the rail up and outboard, with a snatch block
	const pts = [ V( xg, yg, - 0.8 ), V( xg - 0.02, yg + 0.45, - 0.78 ), V( xg - 0.05, 1.86, - 0.76 ), V( xg - 0.13, 2.06, - 0.74 ), V( xg - 0.3, 2.11, - 0.73 ), V( xg - 0.43, 2.07, - 0.72 ) ];
	kit.add( 'fittings', tube( pts, 0.03, 32, 8 ), STAINLESS );
	const foot = roundedBox( 0.12, 0.02, 0.16, 0.008, 1 );
	foot.translate( xg, yg + 0.01, - 0.8 );
	kit.add( 'fittings', foot, STAINLESS );
	const tip = pts[ pts.length - 1 ];
	const tipCap = sphere( 0.03, 10, 6 );
	tipCap.translate( tip.x, tip.y, tip.z );
	kit.add( 'fittings', tipCap, STAINLESS );
	kit.add( 'fittings', rod( tip, tip.clone().add( V( 0, - 0.12, 0 ) ), 0.01, 6 ), STAINLESS );
	const bc = tip.clone().add( V( 0, - 0.22, 0 ) );
	for ( const dz of [ - 0.022, 0.022 ] ) {

		const cheek = cylinder( 0.085, 0.085, 0.01, 16 );
		cheek.applyMatrix4( mat4( bc.x, bc.y, bc.z + dz, Math.PI / 2, 0, 0 ) );
		kit.add( 'fittings', cheek, GALV );

	}

	const sheave = cylinder( 0.07, 0.07, 0.034, 16 );
	sheave.applyMatrix4( mat4( bc.x, bc.y, bc.z, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', sheave, { color: 0x2b2d30, rough: 0.6 } );

	// hauler: post, hydraulic motor and V-groove sheave facing aft
	const { x, y, z } = HAULER;
	kit.add( 'fittings', rod( V( x, L.deckY, z + 0.1 ), V( x, y - 0.1, z + 0.1 ), 0.038, 12 ), GALV );
	const plate = box( 0.2, 0.012, 0.2 );
	plate.translate( x, L.deckY + 0.006, z + 0.1 );
	kit.add( 'fittings', plate, GALV );
	const motor = cylinder( 0.075, 0.075, 0.17, 18 );
	motor.applyMatrix4( mat4( x, y, z + 0.13, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', motor, { color: 0x3a4048, rough: 0.45, metal: 0.3 } );
	const head = lathe( [ [ 0, - 0.05 ], [ 0.2, - 0.05 ], [ 0.205, - 0.04 ], [ 0.1, - 0.006 ], [ 0.1, 0.006 ], [ 0.205, 0.04 ], [ 0.2, 0.05 ], [ 0, 0.05 ] ], 28 );
	head.applyMatrix4( mat4( x, y, z, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', head, GALV );
	const hubCap = cylinder( 0.04, 0.05, 0.03, 12 );
	hubCap.applyMatrix4( mat4( x, y, z - 0.06, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', hubCap, GALV );
	// hydraulic hoses down to the deck
	kit.add( 'fittings', tube( [ V( x + 0.05, y, z + 0.2 ), V( x + 0.12, y - 0.2, z + 0.3 ), V( x + 0.1, 0.6, z + 0.28 ), V( x + 0.06, L.deckY + 0.02, z + 0.25 ) ], 0.012, 20, 5 ), BLACK );
	kit.add( 'fittings', tube( [ V( x - 0.05, y, z + 0.2 ), V( x - 0.02, y - 0.25, z + 0.32 ), V( x + 0.02, 0.62, z + 0.3 ), V( x + 0.02, L.deckY + 0.02, z + 0.28 ) ], 0.012, 20, 5 ), BLACK );

	// pot warp reeved from the block into the hauler and down to a loose pile
	const rope = [ bc.clone().add( V( 0.07, 0, 0 ) ), V( x - 0.3, y + 0.35, z + 0.02 ), V( x - 0.12, y + 0.2, z ), V( x + 0.2, y - 0.02, z - 0.01 ), V( x + 0.16, y - 0.25, z - 0.01 ), V( x + 0.05, 0.72, z - 0.1 ), V( x + 0.2, L.deckY + 0.02, z - 0.35 ) ];
	kit.add( 'fittings', tube( rope, 0.009, 48, 4 ), { color: 0xe4c235, rough: 0.8, pattern: 1 } );

}

// ------------------------------------------------------------------ coiled pot warp

function coil( cx, cy, cz, turns, radius, ropeR, seed ) {

	const pts = [];
	const perTurn = 12;
	const n = turns * perTurn;
	for ( let k = 0; k <= n; k ++ ) {

		const f = k / n;
		const a = k / perTurn * Math.PI * 2 + seed;
		const r = radius * ( 1 - 0.12 * f ) + 0.012 * Math.sin( k * 0.9 + seed * 3 );
		const y = cy + ropeR + f * turns * ropeR * 1.35 + 0.004 * Math.sin( k * 1.7 + seed );
		pts.push( V( cx + Math.cos( a ) * r, y, cz + Math.sin( a ) * r ) );

	}

	// tail leading off the top of the coil
	const last = pts[ pts.length - 1 ];
	pts.push( V( last.x * 0.7 + cx * 0.3 + 0.12, last.y - 0.01, last.z + 0.2 ), V( last.x + 0.35, cy + ropeR, last.z + 0.4 ) );
	return tube( pts, ropeR, turns * 21 + 10, 4 );

}

function buildCoils( kit, L ) {

	kit.add( 'fittings', coil( - 0.5, L.deckY, - 2.15, 5, 0.22, 0.011, 0.3 ), { color: 0xe4c235, rough: 0.8, pattern: 1 } );

}

// ------------------------------------------------------------------ buoys lying on deck

function buildBuoys( kit, L ) {

	const place = [
		[ - 0.2, L.deckY + 0.075, - 2.75, Math.PI / 2, 0.4 ],
		[ 0.12, L.deckY + 0.075, - 3.0, Math.PI / 2, - 0.9 ],
	];
	for ( const [ x, y, z, rx, ry ] of place ) {

		const m = mat4( x, y, z, rx, ry, 0, 1, 1, 1, 'YXZ' );
		for ( const [ g, opts ] of buoyGeometry( undefined, 0.3 ) ) {

			g.translate( 0, - 0.23, 0 );
			g.applyMatrix4( m );
			kit.add( 'fittings', g, opts );

		}

	}

}

// ------------------------------------------------------------------ fenders

export const FENDERS = [ [ - 1, - 2.4 ], [ - 1, - 1.05 ], [ - 1, 0.65 ], [ 1, - 1.7 ] ];

function buildFenders( kit, L ) {

	const prof = [ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.055, 0.016 ], [ 0.07, 0.04 ], [ 0.075, 0.07 ], [ 0.075, 0.43 ], [ 0.07, 0.46 ], [ 0.055, 0.484 ], [ 0.03, 0.496 ], [ 0, 0.5 ] ];
	for ( const [ s, z ] of FENDERS ) {

		const yTop = 0.86;
		const hullX = L.hullXAt( z, yTop - 0.05 );
		const fx = s * ( hullX + 0.08 );
		const f = lathe( prof, 12 );
		f.translate( fx, yTop - 0.5, z );
		kit.add( 'fittings', f, { color: 0x1d3a66, rough: 0.45 } );
		const eye = torus( 0.018, 0.006, 5, 10 );
		eye.translate( fx, yTop + 0.018, z );
		kit.add( 'fittings', eye, { color: 0x1d3a66, rough: 0.45 } );
		// fender line up and over the gunwale to a cleat inside
		const t = L.tAtSheerZ( z );
		const ys = L.sheerY( t ) + 0.05;
		const xo = s * ( L.sheerX( t ) + 0.01 ), xi = s * ( L.sheerX( t ) - L.shell - 0.05 );
		const line = [ V( fx, yTop + 0.03, z ), V( fx - s * 0.01, ( yTop + ys ) / 2, z ), V( xo, ys, z ), V( ( xo + xi ) / 2, ys + 0.012, z ), V( xi, ys - 0.03, z ) ];
		kit.add( 'fittings', tube( line, 0.006, 16, 4 ), { color: 0xf0efe8, rough: 0.8, pattern: 1 } );

	}

}

// ------------------------------------------------------------------ cleats

function cleat( pos, yaw, len = 0.2 ) {

	const parts = [];
	const horn = cylinder( 0.011, 0.011, len * 0.7, 8 );
	horn.applyMatrix4( mat4( 0, 0.045, 0, Math.PI / 2, 0, 0 ) );
	parts.push( horn );
	for ( const s of [ 1, - 1 ] ) {

		const tipC = cylinder( 0.006, 0.011, len * 0.15, 8 );
		tipC.applyMatrix4( mat4( 0, 0.045, s * len * 0.425, s * Math.PI / 2, 0, 0 ) );
		parts.push( tipC );
		const foot = cylinder( 0.013, 0.018, 0.045, 8 );
		foot.translate( 0, 0.0225, s * len * 0.22 );
		parts.push( foot );

	}

	const m = mat4( pos.x, pos.y, pos.z, 0, yaw, 0 );
	return parts.map( ( p ) => p.applyMatrix4( m ) );

}

function buildCleats( kit, L ) {

	const list = [];
	for ( const s of [ 1, - 1 ] ) {

		for ( const z of [ - 3.6, - 1.35 ] ) {

			const t = L.tAtSheerZ( z );
			list.push( ...cleat( V( s * ( L.sheerX( t ) - 0.04 ), L.sheerY( t ) + 0.048, z ), 0 ) );

		}

	}

	const tb = L.tAtSheerZ( 3.35 );
	list.push( ...cleat( V( 0, foredeckY( L, tb, 0 ), 3.35 ), Math.PI / 2, 0.24 ) );
	for ( const g of list ) kit.add( 'fittings', g, STAINLESS );

}

// ------------------------------------------------------------------ bow: stem head, roller, anchor

function buildBow( kit, L ) {

	const yTip = L.sheerY( 1 );
	// stem head fitting wrapping the bow tip
	const head = roundedBox( 0.09, 0.05, 0.3, 0.015, 2 );
	head.translate( 0, yTip + 0.03, L.zBow - 0.08 );
	kit.add( 'fittings', head, STAINLESS );
	for ( const s of [ 1, - 1 ] ) {

		const cheek = box( 0.008, 0.07, 0.16 );
		cheek.translate( s * 0.04, yTip + 0.08, L.zBow + 0.02 );
		kit.add( 'fittings', cheek, STAINLESS );

	}

	const roller = cylinder( 0.03, 0.03, 0.07, 12 );
	roller.applyMatrix4( mat4( 0, yTip + 0.085, L.zBow + 0.07, 0, 0, Math.PI / 2 ) );
	kit.add( 'fittings', roller, BLACK );

	// plow anchor stowed on the roller: shank over the roller, plowshare hanging against the stem ((M17) its own bucket, put last in her
	// fittings, so it's not drawn while it's down: BoatModel.setAnchorStowed)
	const sa = V( 0, yTip + 0.1, L.zBow - 0.45 ), sb = V( 0, yTip + 0.12, L.zBow + 0.13 );
	kit.add( 'stowedAnchor', rod( sa, sb, 0.017, 8 ), GALV );
	const knuckle = cylinder( 0.025, 0.025, 0.07, 10 );
	knuckle.applyMatrix4( mat4( sb.x, sb.y, sb.z, 0, 0, Math.PI / 2 ) );
	kit.add( 'stowedAnchor', knuckle, GALV );
	const plowDir = V( 0, - 0.85, - 0.4 ).normalize();
	const plow = new ConeGeometry( 0.12, 0.34, 4 );
	plow.rotateY( Math.PI / 4 );
	plow.scale( 1, 1, 0.38 );
	plow.applyMatrix4( alignY( sb.clone().add( V( 0, - 0.02, 0.02 ) ).addScaledVector( plowDir, 0.17 ), plowDir ) );
	kit.add( 'stowedAnchor', plow, GALV );
	// rode running aft to the deck pipe
	const t = L.tAtSheerZ( L.zBow - 0.75 );
	const pipeY = foredeckY( L, t, 0 );
	const dp = cylinder( 0.035, 0.045, 0.04, 14 );
	dp.translate( 0, pipeY + 0.02, L.zBow - 0.75 );
	kit.add( 'fittings', dp, STAINLESS );
	kit.add( 'stowedAnchor', tube( [ sa, V( 0, lerp( sa.y, pipeY, 0.6 ) + 0.03, L.zBow - 0.6 ), V( 0, pipeY + 0.04, L.zBow - 0.75 ) ], 0.012, 10, 5 ), GALV );

}

// ------------------------------------------------------------------ bait tote and barrel

function buildContainers( kit, L ) {

	// bait tote beside the hauler
	const tote = new CylinderGeometry( 0.43, 0.37, 0.36, 4, 1 );
	tote.rotateY( Math.PI / 4 );
	tote.scale( 1, 1, 0.62 );
	tote.translate( - 0.72, L.deckY + 0.18, - 1.45 );
	kit.add( 'fittings', tote, { color: 0x2a64b0, rough: 0.55 } );
	const bait = box( 0.52, 0.02, 0.33 );
	bait.translate( - 0.72, L.deckY + 0.352, - 1.45 );
	kit.add( 'fittings', bait, { color: 0x5a2c22, rough: 0.35 } );

	// bait barrel against the port rail aft of the wheelhouse ((M17) a little further aft, for the steps up at the house's corner)
	const bx = 0.86, bz = BARREL_Z;
	const barrel = cylinder( 0.26, 0.26, 0.78, 20 );
	barrel.translate( bx, L.deckY + 0.39, bz );
	kit.add( 'fittings', barrel, { color: 0x1f5ea6, rough: 0.5 } );
	for ( const y of [ 0.26, 0.52 ] ) {

		const rib = torus( 0.262, 0.012, 5, 24 );
		rib.applyMatrix4( mat4( bx, L.deckY + y, bz, Math.PI / 2, 0, 0 ) );
		kit.add( 'fittings', rib, { color: 0x1f5ea6, rough: 0.5 } );

	}

	const lid = cylinder( 0.27, 0.27, 0.03, 20 );
	lid.translate( bx, L.deckY + 0.795, bz );
	kit.add( 'fittings', lid, { color: 0x1b4f8c, rough: 0.5 } );

}

// ------------------------------------------------------------------ stern: light and ensign

export const FLAG = { w: 0.5, h: 0.33 };

function buildStern( kit, L, parts ) {

	const y0 = L.sheerY( 0 ) + 0.045;
	const base = cylinder( 0.03, 0.035, 0.03, 12 );
	base.translate( 0, y0 + 0.015, L.zAft + 0.03 );
	kit.add( 'fittings', base, BLACK );
	const lens = cylinder( 0.025, 0.025, 0.05, 12 );
	lens.translate( 0, y0 + 0.055, L.zAft + 0.03 );
	kit.add( 'glow', lens, { color: 0xfff3dc, rough: 0.2, pattern: 0 } );
	const cap = cylinder( 0.03, 0.028, 0.012, 12 );
	cap.translate( 0, y0 + 0.086, L.zAft + 0.03 );
	kit.add( 'fittings', cap, BLACK );

	// flag staff in a socket at the starboard quarter
	const sx = - ( L.sheerX( 0.02 ) - 0.08 ), sz = L.zAft + 0.14;
	const top = y0 + 1.0;
	kit.add( 'fittings', rod( V( sx, y0 - 0.02, sz ), V( sx, top, sz ), 0.014, 8, 0.01 ), { color: 0xf1efe8, rough: 0.3 } );
	const finial = sphere( 0.02, 8, 6 );
	finial.translate( sx, top + 0.015, sz );
	kit.add( 'fittings', finial, { color: 0xc8a050, rough: 0.25, metal: 1 } );
	const socket = cylinder( 0.022, 0.026, 0.06, 10 );
	socket.translate( sx, y0 + 0.01, sz );
	kit.add( 'fittings', socket, STAINLESS );

	// flag: rest pose streams aft; the fittings material animates it (pattern 2)
	const { w, h } = FLAG;
	const nu = 12, nv = 6;
	const pos = [], uvs = [], idx = [];
	for ( let j = 0; j <= nv; j ++ ) {

		for ( let i = 0; i <= nu; i ++ ) {

			const u = i / nu, v = j / nv;
			pos.push( sx, top - 0.03 - h + v * h, sz - u * w );
			uvs.push( u, v );

		}

	}

	for ( let j = 0; j < nv; j ++ ) {

		for ( let i = 0; i < nu; i ++ ) {

			const a = j * ( nu + 1 ) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
			idx.push( a, b, c, a, c, d );

		}

	}

	for ( const flip of [ false, true ] ) {

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
		const ix = flip ? idx.map( ( _, k ) => idx[ k - ( k % 3 ) + ( 2 - ( k % 3 ) ) ] ) : idx.slice();
		g.setIndex( ix );
		g.computeVertexNormals();
		auxVertices( g, ( p, k ) => [ 0.7, 0, 2, uvs[ k * 2 ] ] );
		kit.add( 'fittings', g, { color: 0xffffff } );

	}

	parts.flagPivot = V( sx, 0, sz );

}
