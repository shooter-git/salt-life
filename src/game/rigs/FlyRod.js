import { Matrix4, Vector3, MathUtils } from '../../engine/index.js';
import { prepare, mergePrepared, cylinder, torus, rod, mat4, lathe, roundedBox } from '../../world/boat/GeoKit.js';
import { PAT } from '../GameMaterials.js';

// (M19) The fly rod in your hands (stream FLY: docs/m19/fly.md): a 9 ft (2.74 m) saltwater fly rod at real scale. A short
// rubber fighting butt, an anodised up-locking reel seat, a full-wells cork grip, the blank tapering to the tip, two big
// ceramic stripping guides, snake guides above them and a tip-top, the fly line through them all; and under the seat a
// large-arbour disc reel, its frame, spool and fly line, its handle on the left for the line hand to wind.
//
// It's drawn by the spinning rod's own material (FishingRod's createRodMaterial: no program of its own), whose blank bends
// from BLANK_START to ROD_L in the rod's frame. So it's built at its real size and then drawn SPIN_L / FLY_L as long along the
// blank: the hand's matrix (FishingRod) stretches it back by FLY_K, and the bend follows its whole length. Nothing on it moves
// as the spinning reel's parts do: a fly reel's turned by hand, and its spool's seen only side on.
export const FLY_L = 2.74; // 9 ft
export const SPIN_L = 2.13; // FishingRod's ROD_L (its own here: FishingRod imports this file; test/fly.mjs holds them the same)
export const FLY_K = FLY_L / SPIN_L; // the stretch along the blank the hand's matrix puts back
export const FLY_HOLD = 0.3; // m up the rod the hand holds the cork (the spinning rod's at its reel seat, FishingRod's SEAT_Y)
export const FLY_LINE_COLOR = 0xd8cf9c; // a pale sand fly line (RIO's and Scientific Anglers' bonefish lines)
export const FLY_LINE_GLOW = 0.45; // its own glow, a share of its colour (rigs/FlyLine.js)

const BUTT_TOP = 0.05, SEAT_TOP = 0.17, GRIP_TOP = 0.45, BLANK_FROM = 0.44;
const REEL_Y = 0.11, REEL_R = 0.047, REEL_W = 0.036, REEL_Z = - ( 0.047 + 0.016 ); // a 3.7 in reel under the seat
// guides: position along the rod (m), ring radius, ring height over the blank
const STRIPPING = [ [ 0.78, 0.0085, 0.024 ], [ 0.98, 0.006, 0.017 ] ];
const SNAKES = [ 1.18, 1.36, 1.53, 1.69, 1.84, 1.99, 2.13, 2.27, 2.4, 2.52, 2.63 ];

const blankR = ( y ) => MathUtils.lerp( 0.0066, 0.0012, Math.pow( MathUtils.clamp( ( y - BLANK_FROM ) / ( FLY_L - BLANK_FROM ), 0, 1 ), 0.8 ) );

export function buildFlyRodGeometry() {

	const L = FLY_L;
	const parts = [];
	const M = ( x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx ) => mat4( x, y, z, rx, ry, rz, sx, sy, sz );
	const add = ( g, o ) => parts.push( prepare( g, o ) );
	const V = ( x, y, z ) => new Vector3( x, y, z );
	const BLANK = { color: 0x23313b, rough: 0.4, metal: 0.15, pattern: PAT.carbon }; // a slate-blue saltwater blank
	const WRAP = { color: 0x101418, rough: 0.35, metal: 0, pattern: PAT.thread };
	const TRIM = { color: 0x9a8a5a, rough: 0.3, metal: 0.4, pattern: PAT.thread };
	const CORK = { color: 0xb8925c, rough: 0.85, metal: 0, pattern: PAT.eva };
	const RUBBER = { color: 0x151515, rough: 0.8, metal: 0, pattern: PAT.rubber };
	const ANOD = { color: 0x2b3238, rough: 0.28, metal: 0.9, pattern: PAT.machined }; // anodised aluminium
	const KNURL = { color: 0x3a4046, rough: 0.35, metal: 0.9, pattern: PAT.knurl };
	const FRAME = { color: 0x2a2c2f, rough: 0.25, metal: 1, pattern: PAT.machined };
	const INSERT = { color: 0x55595e, rough: 0.12, metal: 0.3, pattern: PAT.plain };
	const CHROME = { color: 0xb7bcc0, rough: 0.16, metal: 1, pattern: PAT.machined };
	const SPOOL = { color: 0x8c9196, rough: 0.22, metal: 1, pattern: PAT.machined };
	const LINE = { color: FLY_LINE_COLOR, rough: 0.55, metal: 0, pattern: PAT.braid };
	const BLACK = { color: 0x111214, rough: 0.4, metal: 0.3, pattern: PAT.plain };

	// ---- the butt: a rubber fighting butt, the reel seat and its lock rings, the cork grip
	add( lathe( [ [ 0, 0 ], [ 0.012, 0.001 ], [ 0.0165, 0.008 ], [ 0.017, 0.03 ], [ 0.0145, 0.045 ], [ 0.0118, BUTT_TOP ] ], 24 ), RUBBER );
	add( cylinder( 0.0112, 0.0112, SEAT_TOP - BUTT_TOP, 20 ), { ...ANOD, matrix: M( 0, ( BUTT_TOP + SEAT_TOP ) / 2, 0 ) } );
	add( cylinder( 0.0135, 0.0135, 0.018, 24 ), { ...KNURL, matrix: M( 0, BUTT_TOP + 0.012, 0 ) } );
	add( cylinder( 0.0132, 0.0132, 0.014, 24 ), { ...KNURL, matrix: M( 0, BUTT_TOP + 0.03, 0 ) } );
	add( lathe( [ [ 0.0112, SEAT_TOP - 0.012 ], [ 0.0128, SEAT_TOP - 0.006 ], [ 0.0126, SEAT_TOP ] ], 20 ), ANOD ); // the fixed hood
	// full wells: swelling at both ends of the grip, where the palm sits and where the thumb pushes
	add( lathe( [ [ 0.0126, SEAT_TOP ], [ 0.0148, SEAT_TOP + 0.03 ], [ 0.0142, SEAT_TOP + 0.08 ], [ 0.0128, SEAT_TOP + 0.15 ], [ 0.0138, SEAT_TOP + 0.22 ], [ 0.0128, GRIP_TOP - 0.02 ], [ 0.0095, GRIP_TOP ] ], 22 ), CORK );
	add( lathe( [ [ 0.0095, GRIP_TOP ], [ 0.0092, GRIP_TOP + 0.004 ], [ 0.0072, GRIP_TOP + 0.008 ] ], 16 ), TRIM );

	// ---- the blank
	{
		const prof = [];
		const n = 80;
		for ( let i = 0; i <= n; i ++ ) {

			const y = MathUtils.lerp( BLANK_FROM, L - 0.004, i / n );
			prof.push( [ blankR( y ), y ] );

		}

		add( lathe( prof, 12 ), BLANK );

	}

	add( cylinder( blankR( 0.55 ) + 0.0004, blankR( 0.5 ) + 0.0004, 0.06, 12 ), { ...WRAP, matrix: M( 0, 0.52, 0 ) } ); // the maker's band
	add( cylinder( blankR( 0.56 ) + 0.0006, blankR( 0.56 ) + 0.0006, 0.003, 12 ), { ...TRIM, matrix: M( 0, 0.557, 0 ) } );
	// the hook keeper, the fly hooked on it
	add( torus( 0.0035, 0.0006, 5, 14, Math.PI ), { ...CHROME, matrix: M( 0, 0.5, - blankR( 0.5 ) - 0.0005, 0, Math.PI / 2, Math.PI / 2 ) } );

	// ---- the guides: the stripping guides (a ring on two legs), the snakes (a twisted wire loop), the tip-top
	for ( const [ y, r, hgt ] of STRIPPING ) {

		const br = blankR( y ), zc = - hgt, fr = r + 0.0014, t = Math.max( 0.0007, r * 0.08 );
		add( torus( fr, t * 1.3, 6, 22 ), { ...FRAME, matrix: M( 0, y, zc, Math.PI / 2, 0, 0 ) } );
		add( torus( r + t * 0.6, t * 0.9, 6, 22 ), { ...INSERT, matrix: M( 0, y, zc, Math.PI / 2, 0, 0 ) } );
		const footL = 0.016, yf = y - footL * 0.7;
		for ( const sx of [ - 1, 1 ] ) add( rod( V( 0, yf, - br - 0.0008 ), V( sx * fr * 0.72, y - 0.0005, zc + fr * 0.69 ), 0.0008, 5, 0.0006 ), FRAME );
		add( cylinder( blankR( yf ) + 0.0007, blankR( yf ) + 0.0007, footL * 1.2, 10 ), { ...WRAP, matrix: M( 0, yf, 0 ) } );

	}

	for ( let i = 0; i < SNAKES.length; i ++ ) {

		const y = SNAKES[ i ], br = blankR( y ), h = 0.011 - i * 0.0005, w = 0.0042 - i * 0.00015;
		// a snake guide: the wire up from each foot, over in a loop the line runs through
		const pts = [ V( 0, y - 0.012, - br ), V( w, y - 0.004, - br - h * 0.6 ), V( 0, y, - br - h ), V( - w, y + 0.004, - br - h * 0.6 ), V( 0, y + 0.012, - br ) ];
		for ( let k = 0; k < pts.length - 1; k ++ ) add( rod( pts[ k ], pts[ k + 1 ], 0.00045, 4 ), CHROME );
		add( cylinder( br + 0.0006, br + 0.0006, 0.007, 8 ), { ...WRAP, matrix: M( 0, y - 0.012, 0 ) } );
		add( cylinder( br + 0.0006, br + 0.0006, 0.007, 8 ), { ...WRAP, matrix: M( 0, y + 0.012, 0 ) } );

	}

	add( cylinder( 0.0014, 0.0016, 0.012, 8 ), { ...FRAME, matrix: M( 0, L - 0.006, 0 ) } );
	add( torus( 0.0027, 0.0006, 6, 16 ), { ...FRAME, matrix: M( 0, L, - 0.0035, Math.PI / 2, 0, 0 ) } );
	add( torus( 0.0021, 0.00045, 6, 16 ), { ...INSERT, matrix: M( 0, L, - 0.0035, Math.PI / 2, 0, 0 ) } );

	// the fly line up from the reel through every guide to the tip (bends with the blank)
	{
		const pts = [ V( 0, REEL_Y + REEL_R * 0.6, REEL_Z + REEL_R * 0.8 ) ];
		for ( const [ y, , hgt ] of STRIPPING ) pts.push( V( 0, y, - hgt ) );
		for ( let i = 0; i < SNAKES.length; i ++ ) pts.push( V( 0, SNAKES[ i ], - blankR( SNAKES[ i ] ) - ( 0.011 - i * 0.0005 ) + 0.0012 ) );
		pts.push( V( 0, L, - 0.0035 ) );
		for ( let i = 0; i < pts.length - 1; i ++ ) add( rod( pts[ i ], pts[ i + 1 ], 0.0006, 4 ), LINE );

	}

	// ---- the reel: its foot in the seat, a frame of two side plates round the spool, the spool full of backing and line, a
	// handle on the left side plate for the line hand, the drag knob on the right
	add( roundedBox( 0.012, 0.07, 0.004, 0.0015, 2 ), { ...ANOD, matrix: M( 0, REEL_Y, - 0.0124 ) } );
	add( roundedBox( 0.009, 0.026, 0.016, 0.003, 2 ), { ...ANOD, matrix: M( 0, REEL_Y, - 0.022 ) } );
	const AX = ( x ) => M( x, REEL_Y, REEL_Z, 0, 0, Math.PI / 2 ); // a disc on the reel's axis (across the rod, along x)
	for ( const sx of [ - 1, 1 ] ) {

		add( cylinder( REEL_R, REEL_R, 0.004, 40 ), { ...ANOD, matrix: AX( sx * REEL_W / 2 ) } );
		add( torus( REEL_R - 0.001, 0.0018, 8, 40 ), { ...ANOD, matrix: M( sx * REEL_W / 2, REEL_Y, REEL_Z, 0, Math.PI / 2, 0 ) } );

	}

	// (the frame's pillars, across from plate to plate)
	for ( const a of [ 0.6, 1.4, 2.4 ] ) add( cylinder( 0.003, 0.003, REEL_W, 8 ), { ...ANOD, matrix: M( 0, REEL_Y + Math.cos( a ) * ( REEL_R - 0.004 ), REEL_Z + Math.sin( a ) * ( REEL_R - 0.004 ), 0, 0, Math.PI / 2 ) } );
	add( cylinder( REEL_R * 0.72, REEL_R * 0.72, REEL_W - 0.006, 36 ), { ...LINE, matrix: AX( 0 ) } ); // the line on the spool
	add( cylinder( REEL_R * 0.34, REEL_R * 0.34, REEL_W - 0.004, 24 ), { ...SPOOL, matrix: AX( 0 ) } ); // the arbour
	// the handle, on the left side plate, its knob out from it
	add( roundedBox( 0.004, 0.006, REEL_R * 0.9, 0.0018, 2 ), { ...ANOD, matrix: M( - REEL_W / 2 - 0.004, REEL_Y, REEL_Z - REEL_R * 0.4 ) } );
	add( lathe( [ [ 0.0035, 0 ], [ 0.0065, 0.002 ], [ 0.007, 0.012 ], [ 0.0065, 0.022 ], [ 0.004, 0.025 ], [ 0, 0.026 ] ], 14 ), { ...BLACK, matrix: M( - REEL_W / 2 - 0.006, REEL_Y, REEL_Z - REEL_R * 0.78, 0, 0, Math.PI / 2 ) } );
	// the drag knob, a big round one on the right
	add( cylinder( 0.017, 0.019, 0.01, 28 ), { ...KNURL, matrix: AX( REEL_W / 2 + 0.007 ) } );

	// built at its real length, drawn SPIN_L long along the blank (FLY_K puts it back: above)
	const g = mergePrepared( parts );
	g.applyMatrix4( new Matrix4().makeScale( 1, 1 / FLY_K, 1 ) );
	return g;

}
