import { Vector3, MathUtils } from '../../engine/index.js';
import { alignY, cylinder, lathe, mat4, paintVertices, rod, roundedBox, sphere, torus } from '../../world/boat/GeoKit.js';
import { PAT } from '../GameMaterials.js';

// (M21) The parts every rod and reel is built from (stream GEAR: docs/m21/gear.md): looks, the blank, grips and seats, ring,
// snake and roller guides and their tops, the line through them, a spinning reel and a lever-drag (drum) reel made to any
// size. All in the rod's own frame (game/FishingRod.js: +Y along the blank, butt at 0; the reel and the guides on -Z, +X to
// the right; a reel that rides on top is drawn by the hand's frame turned over), and in GeoKit's layout, so a rod and its
// reel merge into one mesh in the rod's one material. The moving parts are tagged in aux.w (PART) and moved by the rod's
// vertex shader about the axes each model gives it (FishingRod's createRodMaterial: rodFit, reelAxis).

// what moves, and how (the rod's vertex shader): 1 a spinning reel's rotor, 2 its bail (flips open about its pivots, turns
// with the rotor), 3 a crank (about the crank's axis), 4 a spinning reel's spool (in and out with the crank, back when the
// drag slips) and 5 the line on it (as 4, its radius following the line left); 6 a drum's spool (a conventional's, a
// big-game reel's or a fly reel's: about its axis across the rod) and 7 the line on it (as 6, its radius following the line
// left); 8 the line along the rod (still: coloured as the line in use, as 5 and 7 are)
export const PART = { rotor: 1, bail: 2, crank: 3, spool: 4, braid: 5, drum: 6, drumLine: 7, line: 8 };

export const M = ( x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx ) => mat4( x, y, z, rx, ry, rz, sx, sy, sz );
export const V = ( x, y, z ) => new Vector3( x, y, z );

// colour (linear from sRGB hex), roughness, metalness, pattern (GameMaterials' PAT)
export const LOOK = {
	wrap: { color: 0x0c0d10, rough: 0.35, metal: 0, pattern: PAT.thread },
	trim: { color: 0x8a6a2a, rough: 0.3, metal: 0.4, pattern: PAT.thread }, // gold metallic trim thread
	white: { color: 0xcfd0ca, rough: 0.38, metal: 0, pattern: PAT.thread },
	red: { color: 0x8c1d18, rough: 0.35, metal: 0, pattern: PAT.thread },
	goldThread: { color: 0xb08a35, rough: 0.3, metal: 0.5, pattern: PAT.thread },
	eva: { color: 0x2a2b2d, rough: 0.82, metal: 0, pattern: PAT.eva },
	foam: { color: 0x1a1a1b, rough: 0.92, metal: 0, pattern: PAT.eva }, // an old rod's black foam
	shrink: { color: 0x131314, rough: 0.74, metal: 0, pattern: PAT.rubber }, // textured shrink tube
	rubber: { color: 0x151515, rough: 0.8, metal: 0, pattern: PAT.rubber },
	cork: { color: 0xb8925c, rough: 0.85, metal: 0, pattern: PAT.cork },
	gun: { color: 0x2d3034, rough: 0.32, metal: 0.85, pattern: PAT.machined }, // gunmetal
	seat: { color: 0x1c1e21, rough: 0.45, metal: 0.2, pattern: PAT.plain }, // a graphite reel seat
	knurl: { color: 0x3a3d42, rough: 0.35, metal: 0.9, pattern: PAT.knurl },
	frame: { color: 0x2a2c2f, rough: 0.25, metal: 1, pattern: PAT.machined }, // guide frames
	insert: { color: 0x55595e, rough: 0.12, metal: 0.3, pattern: PAT.plain }, // ceramic insert
	chrome: { color: 0xb7bcc0, rough: 0.16, metal: 1, pattern: PAT.machined },
	champ: { color: 0xa88d5a, rough: 0.24, metal: 1, pattern: PAT.machined }, // champagne anodised
	black: { color: 0x111214, rough: 0.4, metal: 0.3, pattern: PAT.plain },
	gold: { color: 0xb8923c, rough: 0.28, metal: 1, pattern: PAT.machined },
	alu: { color: 0x8d8f92, rough: 0.32, metal: 0.95, pattern: PAT.machined }, // bead-blasted aluminium
	polished: { color: 0xc3c6c9, rough: 0.13, metal: 1, pattern: PAT.machined },
	anod: { color: 0x2b3238, rough: 0.28, metal: 0.9, pattern: PAT.machined },
};

// the line's own part: white here, coloured by the line in use in the shader (FishingRod's reelLine)
const LINE = { color: 0xffffff, rough: 0.5, metal: 0, pattern: PAT.plain };

// a blank's radius at y: r0 at y0 to r1 at y1, eased by pow
export const taper = ( y0, y1, r0, r1, pow = 0.85 ) => ( y ) => MathUtils.lerp( r0, r1, Math.pow( MathUtils.clamp( ( y - y0 ) / ( y1 - y0 ), 0, 1 ), pow ) );

// the blank from y0 to its tip-top (y1), rings about every 3 cm so it bends smoothly; split at tipFrom into the tip's own look
// (a glass rod's clear tip)
export function blank( add, br, y0, y1, look, { tipFrom = null, tipLook = null, perM = 30, radial = 12 } = {} ) {

	const seg = ( a, b, o ) => {

		const n = Math.max( 6, Math.ceil( ( b - a ) * perM ) ), prof = [];
		for ( let i = 0; i <= n; i ++ ) {

			const y = MathUtils.lerp( a, b, i / n );
			prof.push( [ br( y ), y ] );

		}

		add( lathe( prof, radial ), o );

	};

	if ( tipFrom ) {

		seg( y0, tipFrom, look );
		seg( tipFrom, y1 - 0.004, tipLook );

	} else seg( y0, y1 - 0.004, look );

}

// a thread wrap round the blank, len long, centred at y
export function wrap( add, br, y, len, look = LOOK.wrap, lift = 0.0006 ) {

	add( cylinder( br( y + len / 2 ) + lift, br( y - len / 2 ) + lift, len, 10 ), { ...look, matrix: M( 0, y, 0 ) } );

}

// a ring guide: its frame and its insert (ring: the ring's outside diameter), its centre h over the blank on the reel's side,
// two legs splayed down to a foot on the blank, its wrap and a trim ring. plain: a one-piece wire guide, no insert ->
// where the line runs through it
export function ringGuide( add, br, y, ring, h, { frame = LOOK.frame, insert = LOOK.insert, wrapLook = LOOK.wrap, trim = LOOK.trim, plain = false } = {} ) {

	const b = br( y ), R = ring / 2, t = Math.max( 0.0006, R * 0.085 ), fr = R - t, zc = - ( b + h );
	add( torus( fr, t, 6, 20 ), { ...frame, matrix: M( 0, y, zc, Math.PI / 2, 0, 0 ) } );
	if ( ! plain ) add( torus( fr - t * 1.7, t * 0.8, 5, 20 ), { ...insert, matrix: M( 0, y, zc, Math.PI / 2, 0, 0 ) } );
	const footL = Math.max( 0.012, h * 0.5 + R * 0.5 ), yf = y - footL * 0.7;
	for ( const sx of [ - 1, 1 ] ) add( rod( V( 0, yf, - b - 0.0008 ), V( sx * fr * 0.72, y - 0.0005, zc + fr * 0.69 ), Math.max( 0.0007, R * 0.07 ), 5, Math.max( 0.0005, R * 0.055 ) ), frame );
	add( roundedBox( 0.0035, footL, 0.0012, 0.0005, 1 ), { ...frame, matrix: M( 0, yf, - b - 0.0006 ) } );
	add( cylinder( br( yf + footL * 0.6 ) + 0.0007, br( yf - footL * 0.6 ) + 0.0007, footL * 1.25, 10 ), { ...wrapLook, matrix: M( 0, yf, 0 ) } );
	if ( trim ) add( cylinder( br( yf + footL * 0.64 ) + 0.00085, br( yf + footL * 0.64 ) + 0.00085, 0.0016, 10 ), { ...trim, matrix: M( 0, yf + footL * 0.64, 0 ) } );
	return V( 0, y, zc );

}

// a fly rod's snake guide: the wire up from each foot and over in a loop the line runs through (h: its height over the blank,
// w: its half width) -> where the line runs
export function snakeGuide( add, br, y, h, w, look = LOOK.chrome, wrapLook = LOOK.wrap ) {

	const b = br( y );
	const pts = [ V( 0, y - 0.012, - b ), V( w, y - 0.004, - b - h * 0.6 ), V( 0, y, - b - h ), V( - w, y + 0.004, - b - h * 0.6 ), V( 0, y + 0.012, - b ) ];
	for ( let k = 0; k < pts.length - 1; k ++ ) add( rod( pts[ k ], pts[ k + 1 ], 0.00045, 4 ), look );
	add( cylinder( b + 0.0006, b + 0.0006, 0.007, 8 ), { ...wrapLook, matrix: M( 0, y - 0.012, 0 ) } );
	add( cylinder( b + 0.0006, b + 0.0006, 0.007, 8 ), { ...wrapLook, matrix: M( 0, y + 0.012, 0 ) } );
	return V( 0, y, - b - h + 0.0012 );

}

// a roller guide: a roller between two cheeks on a stand (h: the roller's height over the blank, r: its radius), its wraps
// either side -> where the line runs over it
export function rollerGuide( add, br, y, h, r, { cheek = LOOK.gold, roller = LOOK.chrome, wrapLook = LOOK.red } = {} ) {

	const b = br( y ), z = - b - h, w = r * 1.9;
	add( cylinder( r, r, w, 10 ), { ...roller, matrix: M( 0, y, z, 0, 0, Math.PI / 2 ) } );
	for ( const sx of [ - 1, 1 ] ) add( roundedBox( 0.0018, r * 3.3, h + r * 1.7, 0.0006, 1 ), { ...cheek, matrix: M( sx * ( w / 2 + 0.0012 ), y, - b - ( h + r * 0.35 ) * 0.5 ) } );
	add( roundedBox( w + 0.005, r * 8, 0.0026, 0.001, 1 ), { ...cheek, matrix: M( 0, y, - b - 0.0008 ) } );
	add( cylinder( b + 0.0009, b + 0.0009, r * 12, 10 ), { ...wrapLook, matrix: M( 0, y, 0 ) } );
	return V( 0, y, z - r );

}

// a tip-top: a tube over the blank's end and its ring (ring: its outside diameter) -> where the line leaves the rod
export function tipTop( add, L, ring, br, { frame = LOOK.frame, insert = LOOK.insert, plain = false } = {} ) {

	const b = br( L ), R = ring / 2;
	add( cylinder( b + 0.0003, b + 0.0005, 0.012, 8 ), { ...frame, matrix: M( 0, L - 0.006, 0 ) } );
	add( torus( R - 0.0007, 0.0007, 6, 16 ), { ...frame, matrix: M( 0, L, - R * 1.35, Math.PI / 2, 0, 0 ) } );
	if ( ! plain ) add( torus( R - 0.0017, 0.0005, 6, 16 ), { ...insert, matrix: M( 0, L, - R * 1.35, Math.PI / 2, 0, 0 ) } );
	return V( 0, L, - R * 1.35 );

}

// a roller tip-top (r: its roller's radius) -> where the line leaves the rod
export function rollerTip( add, L, r, br, { cheek = LOOK.gold, roller = LOOK.chrome } = {} ) {

	const b = br( L );
	add( cylinder( b + 0.0018, b + 0.0024, 0.018 + r, 8 ), { ...cheek, matrix: M( 0, L - 0.012, 0 ) } );
	for ( const sx of [ - 1, 1 ] ) add( roundedBox( 0.0018, r * 2.6, r * 3.2, 0.0006, 1 ), { ...cheek, matrix: M( sx * r * 1.05, L, - r * 1.15 ) } );
	add( cylinder( r, r, r * 1.8, 10 ), { ...roller, matrix: M( 0, L, - r * 1.15, 0, 0, Math.PI / 2 ) } );
	return V( 0, L, - r * 2.2 );

}

// the line from the reel through every guide to the tip (bends with the blank; coloured as the line in use)
export function lineThrough( add, pts, r = 0.0003 ) {

	for ( let i = 0; i < pts.length - 1; i ++ ) add( rod( pts[ i ], pts[ i + 1 ], r, 3 ), { ...LINE, anim: PART.line } );

}

// a lathe of [ r, y ] about the rod (a grip, a hood, a cap), in a look
export function turned( add, prof, look, seg = 20 ) {

	add( lathe( prof, seg ), look );

}

// a screw-locking reel seat from y0 to y1 about the rod (r: its barrel), the reel's foot between its hoods; the lock nut at the
// front (an old rod's) or the back (a modern rod's) -> the foot's middle
export function screwSeat( add, y0, y1, r, { body = LOOK.seat, hood = LOOK.gun, nut = LOOK.knurl, nutAt = 'back' } = {} ) {

	const n = 0.02, a = nutAt === 'back' ? y0 + n : y0, b = nutAt === 'back' ? y1 : y1 - n;
	if ( nutAt === 'back' ) add( cylinder( r + 0.0024, r + 0.0024, n, 22 ), { ...nut, matrix: M( 0, y0 + n / 2, 0 ) } );
	else add( cylinder( r + 0.0024, r + 0.0024, n, 22 ), { ...nut, matrix: M( 0, y1 - n / 2, 0 ) } );
	add( lathe( [ [ r, a ], [ r + 0.0014, a + 0.004 ], [ r + 0.0017, a + 0.014 ], [ r + 0.0008, a + 0.019 ] ], 20 ), hood );
	add( cylinder( r, r, b - a - 0.034, 20 ), { ...body, matrix: M( 0, ( a + b ) / 2, 0 ) } );
	add( lathe( [ [ r + 0.0008, b - 0.019 ], [ r + 0.0017, b - 0.015 ], [ r + 0.0014, b - 0.004 ], [ r, b ] ], 20 ), hood );
	return ( a + b ) / 2;

}

// ---------------------------------------------------------------- a spinning reel, any size
// Hanging on the reel's side of the rod (-Z), its axis along the rod. Shaped after the game's first reel (M16's, a gearbox
// body, a rotor with its bail and roller, a skirted spool with the line on it and a front drag knob, a crank with its knob on
// the left, cranked with the hand that isn't holding the rod), made to the size asked:
//   s: the size (1: a 58 mm spool's lip, a 5000's), drop: the foot's top to the spool's axis, crank: the handle's length,
//   body / rotor / spool / trim / knob: looks, knob: 'round' | 'paddle', wear: an old reel's paint worn through on its edges
// y0: the foot's middle along the rod; z0: the seat's surface (negative) -> its axes for the shader and where the line leaves
export function spinReel( add, y0, z0, P ) {

	const s = P.s, az = z0 - P.drop;
	const worn = ( look ) => P.wear ? ( g ) => paintVertices( g, ( v ) => {

		const h = Math.abs( Math.sin( v.x * 9113.1 + v.y * 5779.7 + v.z * 3137.3 ) * 43758.5 ) % 1;
		return h > 0.78 ? 0x55534f : look.color;

	} ) : ( g ) => g;
	const L = ( prof, seg, look, anim = 0, wear = false ) => add( ( wear ? worn( look ) : ( g ) => g )( lathe( prof.map( ( [ r, y ] ) => [ r * s, y * s ] ), seg ) ), { ...look, anim, matrix: M( 0, y0, az ) } );
	const at = ( x, y, z, rx = 0, ry = 0, rz = 0 ) => M( x * s, y0 + y * s, az + z * s, rx, ry, rz );
	const B = P.body, T = P.trim, R = P.rotor, SP = P.spool;
	// the foot on the seat, and the stem: one flat blade, wide along the rod, raked from the body to the foot
	add( roundedBox( 0.011 * s, 0.062 * s, 0.004, 0.0015, 2 ), { ...B, matrix: M( 0, y0, z0 - 0.0014 ) } );
	{

		const A = V( 0, y0 - 0.002 * s, z0 - 0.003 ), Bt = V( 0, y0 - 0.05 * s, az + 0.022 * s ), d = Bt.clone().sub( A );
		add( roundedBox( 0.0072 * s, d.length() + 0.008, 0.02 * s, 0.0032 * s, 3 ), { ...B, matrix: alignY( A.clone().add( Bt ).multiplyScalar( 0.5 ), d ) } );

	}

	add( roundedBox( 0.0082 * s, 0.03 * s, 0.012 * s, 0.004 * s, 3 ), { ...B, matrix: at( 0, - 0.053, 0.02, - 0.35, 0, 0 ) } );
	// the gearbox: one smooth teardrop shell from the rotor's neck back to its tail, flattened at the sides
	add( worn( B )( lathe( [ [ 0, - 0.126 ], [ 0.006, - 0.125 ], [ 0.0125, - 0.119 ], [ 0.0185, - 0.107 ], [ 0.0225, - 0.091 ], [ 0.0238, - 0.075 ], [ 0.0228, - 0.063 ], [ 0.0198, - 0.055 ], [ 0.018, - 0.053 ] ].map( ( [ r, y ] ) => [ r * s, y * s ] ), 28 ) ), { ...B, matrix: M( 0, y0, az, 0, 0, 0, 0.82, 1, 1 ) } );
	// side plates: slim inset discs with a machined trim ring (the handle's side carries the crank's boss)
	for ( const sx of [ - 1, 1 ] ) {

		add( cylinder( 0.0142 * s, 0.0148 * s, 0.0022, 24 ), { ...P.plate, matrix: at( sx * 0.0188, - 0.078, 0, 0, 0, Math.PI / 2 ) } );
		add( torus( 0.0145 * s, 0.0007, 5, 28 ), { ...T, matrix: at( sx * 0.0197, - 0.078, 0, 0, Math.PI / 2, 0 ) } );

	}

	add( cylinder( 0.0068 * s, 0.0085 * s, 0.011 * s, 16 ), { ...B, matrix: at( - 0.025, - 0.078, 0, 0, 0, Math.PI / 2 ) } );
	add( cylinder( 0.0045 * s, 0.0045 * s, 0.004, 12 ), { ...T, matrix: at( 0.021, - 0.078, 0, 0, 0, Math.PI / 2 ) } ); // the screw cap
	L( [ [ 0.018, - 0.057 ], [ 0.0205, - 0.052 ], [ 0.0208, - 0.048 ] ], 24, T ); // the neck's trim ring
	// the rotor (1): a cup open to the front, two arms carrying the bail
	L( [ [ 0.006, - 0.049 ], [ 0.017, - 0.047 ], [ 0.0235, - 0.043 ], [ 0.0268, - 0.035 ], [ 0.0275, - 0.024 ], [ 0.0262, - 0.019 ] ], 28, R, PART.rotor, true );
	L( [ [ 0.0262, - 0.019 ], [ 0.0248, - 0.0185 ] ], 28, T, PART.rotor );
	for ( const sx of [ - 1, 1 ] ) {

		add( roundedBox( 0.0065 * s, 0.044 * s, 0.013 * s, 0.002 * s, 2 ), { ...R, anim: PART.rotor, matrix: at( sx * 0.0285, - 0.023, 0 ) } );
		// the bail arm's plates at the pivots (2: they flip with the bail)
		add( roundedBox( 0.003 * s, 0.012 * s, 0.008 * s, 0.001, 1 ), { ...LOOK.chrome, anim: PART.bail, matrix: at( sx * 0.0322, - 0.002, 0 ) } );

	}

	// the bail's wire (2) round the spool from one arm to the other, and the line roller
	{

		const pts = [];
		for ( let i = 0; i <= 14; i ++ ) {

			const a = Math.PI * i / 14;
			pts.push( V( 0.0322 * s * Math.cos( a ), y0 + ( - 0.002 + 0.006 * Math.sin( a ) ) * s, az - 0.0322 * s * Math.sin( a ) ) );

		}

		for ( let i = 0; i < pts.length - 1; i ++ ) add( rod( pts[ i ], pts[ i + 1 ], 0.0011 * s, 5 ), { ...LOOK.chrome, anim: PART.bail } );
		add( cylinder( 0.0032 * s, 0.0032 * s, 0.006 * s, 10 ), { ...T, anim: PART.bail, matrix: at( 0.0302, - 0.0005, - 0.0035, Math.PI / 2, 0, 0 ) } );

	}

	// the spool (4) with the line on it (5), its front lip and the drag knob
	L( [ [ 0.0282, - 0.03 ], [ 0.0288, - 0.024 ], [ 0.0285, - 0.017 ], [ 0.0252, - 0.013 ], [ 0.0238, - 0.012 ] ], 32, SP, PART.spool );
	L( [ [ 0.0236, - 0.0125 ], [ 0.0238, - 0.01 ], [ 0.0238, 0.005 ], [ 0.0236, 0.0075 ] ], 32, LINE, PART.braid );
	L( [ [ 0.0205, - 0.0128 ], [ 0.0205, 0.0078 ] ], 20, SP, PART.spool ); // the arbour under the line
	L( [ [ 0.0236, 0.0075 ], [ 0.0262, 0.0085 ], [ 0.0266, 0.0105 ], [ 0.0235, 0.013 ], [ 0.016, 0.0145 ], [ 0.012, 0.015 ] ], 32, SP, PART.spool );
	L( [ [ 0.012, 0.015 ], [ 0.0125, 0.017 ], [ 0.0126, 0.026 ], [ 0.0118, 0.029 ], [ 0.009, 0.0305 ], [ 0, 0.031 ] ], 20, { ...P.knobLook, pattern: PAT.knurl }, PART.spool );
	// the crank (3): its shaft's cap, the arm, the knob on the left
	const c = P.crank, cy = - 0.078 * s;
	add( cylinder( 0.0052 * s, 0.0052 * s, 0.008, 12 ), { ...LOOK.gun, anim: PART.crank, matrix: at( - 0.0315, - 0.078, 0, 0, 0, Math.PI / 2 ) } );
	add( roundedBox( 0.0038, c + 0.006, 0.0075 * s, 0.0018, 2 ), { ...P.arm, anim: PART.crank, matrix: M( - 0.036 * s, y0 + cy - c / 2, az ) } );
	add( cylinder( 0.0026, 0.0026, 0.01, 8 ), { ...LOOK.chrome, anim: PART.crank, matrix: M( - 0.036 * s - 0.006, y0 + cy - c, az, 0, 0, Math.PI / 2 ) } );
	if ( P.knob === 'paddle' ) add( roundedBox( 0.016, 0.011, 0.042 * s, 0.004, 2 ), { ...P.knobLook, anim: PART.crank, matrix: M( - 0.036 * s - 0.016, y0 + cy - c, az ) } );
	else add( lathe( [ [ 0.003, 0 ], [ 0.0062, 0.0015 ], [ 0.0071, 0.007 ], [ 0.0068, 0.018 ], [ 0.0048, 0.0225 ], [ 0, 0.0235 ] ], 14 ), { ...P.knobLook, anim: PART.crank, matrix: M( - 0.036 * s - 0.01, y0 + cy - c, az, 0, 0, Math.PI / 2 ) } );
	return {
		kind: 'spin',
		axes: { spoolY: y0, spoolZ: az, crankY: y0 + cy, crankZ: az, pivotY: y0 - 0.002 * s, braidR: 0.0205 * s },
		lineR: 0.0238 * s, osc: 0.0035 * s,
		from: V( 0, y0 + 0.02 * s, az + 0.022 * s ),
	};

}

// ---------------------------------------------------------------- a lever-drag reel, any size
// On top of the rod (drawn on the reel's side, -Z, and the hand's frame turned over), its spool across the rod. The game's
// gold two-speed reel (M16's: two round side plates, the handle's side deeper, four pillars, the spool and its flanges, the
// drag lever and its arc, the star and the speed button, a long arm and a big knob), made to the size asked:
//   R: the side plates' radius, W: half the width between them, dD / dH: the drag side's and the handle's side's depth,
//   stand: the foot's stand from the seat to the plates, lineR: a full spool's radius, arbour: its core (null: none drawn),
//   crank: the handle's length, knob: 'T' | 'paddle' | 'power', lever: { side: -1 the drag side, 1 the handle's; len; at:
//   [ dy, dz ] its direction from the hub; off: how far it stands off its plate }, lugs: the harness lugs' half spacing (an
//   80's and a 130's), clamp: a rod clamp with a leash eye under the seat, foot: its length, star: a star drag on the handle's
//   side, button: the two-speed button; looks: plate, pillar, flange, foot, gearPlate (the handle side's own), lever, knob
// y0: the foot's middle along the rod; z0: the seat's surface (negative) -> its axes and where the line leaves it
export function drumReel( add, y0, z0, P ) {

	const { R, W, dD, dH } = P, az = z0 - P.stand - R, AX = ( x, rz = Math.PI / 2 ) => M( x, y0, az, 0, 0, rz );
	const seg = Math.max( 28, Math.round( R * 640 ) );
	// its foot on the seat, and the two blocks of its stand
	add( roundedBox( 0.026 * P.k, P.foot, 0.006, 0.002, 2 ), { ...P.footLook, matrix: M( 0, y0, z0 - 0.002 ) } );
	for ( const y of [ - P.foot * 0.33, P.foot * 0.33 ] ) add( roundedBox( 0.016 * P.k, 0.014 * P.k, P.stand + 0.03, 0.003, 2 ), { ...P.footLook, matrix: M( 0, y0 + y, z0 - P.stand / 2 - 0.0135 ) } );
	// the two round side plates (the handle's side deeper)
	add( lathe( [ [ R + 0.002, W - 0.005 ], [ R + 0.002, W + 0.002 ], [ R * 0.95, W + dD * 0.57 ], [ R * 0.5, W + dD * 0.96 ], [ 0, W + dD ] ], seg ), { ...P.plate, matrix: AX( 0, - Math.PI / 2 ) } );
	add( lathe( [ [ R + 0.002, W - 0.005 ], [ R + 0.002, W + dH * 0.17 ], [ R * 0.8, W + dH * 0.58 ], [ R * 0.42, W + dH ], [ 0, W + dH ] ], seg ), { ...( P.gearPlate || P.plate ), matrix: AX( 0, Math.PI / 2 ) } );
	// the pillars between them
	for ( const a of [ 1.1, 2.6, 4.2, 5.2 ] ) add( cylinder( 0.0035 * P.k, 0.0035 * P.k, 2 * W, 8 ), { ...P.pillar, matrix: M( 0, y0 + Math.cos( a ) * ( R - 0.004 ), az + Math.sin( a ) * ( R - 0.004 ), 0, 0, Math.PI / 2 ) } );
	// the spool (6), its flanges, its core, and the line on it (7)
	add( cylinder( P.lineR, P.lineR, 2 * W - 0.012, seg ), { ...LINE, anim: PART.drumLine, matrix: AX( 0 ) } );
	for ( const s of [ - 1, 1 ] ) add( cylinder( R - 0.002, R - 0.002, 0.004, seg ), { ...P.flange, anim: PART.drum, matrix: AX( s * ( W - 0.005 ) ) } );
	if ( P.arbour ) add( cylinder( P.arbour, P.arbour, 2 * W - 0.01, 20 ), { ...P.flange, anim: PART.drum, matrix: AX( 0 ) } );
	// the lever and its arc
	const Lv = P.lever, ls = Lv.side, lx = ls * ( W + ( ls < 0 ? dD : dH ) + Lv.off );
	if ( Lv.at ) {

		// (a lever from the hub out past the plate's rim, its knurled tip riding over the frame)
		const d = V( 0, Lv.at[ 0 ], Lv.at[ 1 ] ).normalize(), mid = V( lx, y0 + d.y * Lv.len / 2, az + d.z * Lv.len / 2 );
		add( roundedBox( 0.006 * P.k, Lv.len, 0.014 * P.k, 0.002, 2 ), { ...P.leverLook, matrix: alignY( mid, d ) } );
		add( cylinder( 0.008 * P.k, 0.008 * P.k, 0.02 * P.k, 12 ), { ...LOOK.knurl, color: P.leverLook.color, matrix: M( lx, y0 + d.y * Lv.len, az + d.z * Lv.len, 0, 0, Math.PI / 2 ) } );
		add( cylinder( 0.011 * P.k, 0.011 * P.k, 0.008, 16 ), { ...P.leverLook, matrix: AX( lx ) } );

	} else {

		add( roundedBox( 0.007, 0.012, 0.062, 0.002, 2 ), { ...P.leverLook, matrix: M( lx, y0 + 0.016, az - 0.03, 0.65, 0, 0 ) } );
		add( cylinder( 0.0075, 0.0075, 0.015, 10 ), { ...P.leverLook, matrix: M( lx, y0 + 0.036, az - 0.056, 0, 0, Math.PI / 2 ) } );

	}

	add( torus( R * 0.68, 0.0022 * P.k, 6, 20, 2.2 ), { ...LOOK.chrome, matrix: M( lx + ls * - 0.002, y0, az, 0, Math.PI / 2, 0 ) } );
	// the star and the speed button on the handle's side
	const hx = W + dH;
	if ( P.star ) add( cylinder( 0.012 * P.k, 0.016 * P.k, 0.018 * P.k, 16 ), { ...LOOK.black, matrix: AX( hx + 0.002 ) } );
	else add( cylinder( 0.011 * P.k, 0.013 * P.k, 0.012 * P.k, 16 ), { ...( P.gearPlate || P.plate ), matrix: AX( hx + 0.002 ) } );
	if ( P.button ) add( cylinder( 0.005 * P.k, 0.005 * P.k, 0.01, 10 ), { ...P.button, matrix: AX( hx + 0.014 * P.k ) } );
	// the handle (3): a long machined arm and its knob, turning on the spool's own axis
	const c = P.crank, ax = hx + 0.018 * P.k;
	add( roundedBox( 0.006 * P.k, c + 0.012, 0.016 * P.k, 0.003, 2 ), { ...P.arm, anim: PART.crank, matrix: M( ax, y0 - c / 2 + 0.002, az ) } );
	add( cylinder( 0.0034 * P.k, 0.0034 * P.k, 0.014, 8 ), { ...LOOK.chrome, anim: PART.crank, matrix: M( ax + 0.01, y0 - c, az, 0, 0, Math.PI / 2 ) } );
	const knob = P.knob === 'paddle' ? [ [ 0.004, 0 ], [ 0.016, 0.003 ], [ 0.017, 0.016 ], [ 0.013, 0.026 ], [ 0, 0.028 ] ]
		: P.knob === 'power' ? [ [ 0.006, 0 ], [ 0.019, 0.004 ], [ 0.021, 0.018 ], [ 0.021, 0.05 ], [ 0.016, 0.064 ], [ 0, 0.066 ] ]
			: [ [ 0.004, 0 ], [ 0.012, 0.002 ], [ 0.0145, 0.012 ], [ 0.0125, 0.032 ], [ 0.007, 0.04 ], [ 0, 0.041 ] ];
	if ( P.knob === 'paddle' ) add( lathe( knob, 14 ), { ...P.knobLook, anim: PART.crank, matrix: M( ax + 0.014, y0 - c, az, 0, 0, - Math.PI / 2, 1, 1, 0.62 ) } );
	else add( lathe( knob, 16 ), { ...P.knobLook, anim: PART.crank, matrix: M( ax + 0.014, y0 - c, az, 0, 0, - Math.PI / 2 ) } );
	// the harness lugs on top of the side plates: a flat plate each, a ring through it
	if ( P.lugs ) for ( const sx of [ - 1, 1 ] ) {

		add( roundedBox( 0.005, 0.039, 0.024, 0.002, 1 ), { ...P.plate, matrix: M( sx * P.lugs, y0, az - R - 0.006 ) } );
		add( torus( 0.0065, 0.0022, 6, 14 ), { ...LOOK.chrome, matrix: M( sx * P.lugs, y0, az - R - 0.017, 0, Math.PI / 2, 0 ) } );

	}

	// the rod clamp round the seat under the foot, its leash eye under the rod
	if ( P.clamp ) {

		add( torus( P.clamp + 0.003, 0.003, 6, 22 ), { ...LOOK.chrome, matrix: M( 0, y0, 0, Math.PI / 2, 0, 0 ) } );
		add( torus( 0.006, 0.0018, 6, 12 ), { ...LOOK.chrome, matrix: M( 0, y0, P.clamp + 0.011 ) } );

	}

	return {
		kind: 'drum',
		axes: { spoolY: y0, spoolZ: az, crankY: y0, crankZ: az, pivotY: y0, braidR: P.arbour || P.lineR * 0.62 },
		lineR: P.lineR, osc: 0,
		from: V( 0, y0 + P.lineR * 0.35, az - P.lineR * 0.94 ),
	};

}

// a ball (the electric reel's knob, a surf rod's butt)
export const ball = ( r, w = 14, h = 10 ) => sphere( r, w, h );
