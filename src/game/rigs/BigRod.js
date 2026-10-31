import { Vector3, MathUtils } from '../../engine/index.js';
import { prepare, mergePrepared, cylinder, torus, rod, mat4, lathe, roundedBox } from '../../world/boat/GeoKit.js';
import { PAT } from '../GameMaterials.js';
import { ROD_L } from '../FishingRod.js';

// (M16) The stand-up trolling rod and its two-speed lever drag reel, in the rod's own frame (game/FishingRod.js: +Y along
// the blank, butt at 0, and -Z the side the reel and guides are on; FishingRod turns the frame over, as a conventional
// rod's held with its reel on top) and with its parts tagged as the hand rod's are, so it's the same program: the blank
// bends from BLANK_START and the crank (aux.w 3) turns on the same shaft. Shaped after real ones (a Penn International 50
// or a Shimano Tiagra 50W on a 6 to 7 ft 50 lb class rod: docs/m16/tackle.md): a heavy tapered glass blank, a long
// fore-grip of hard EVA, a machined aluminium butt with a gimbal slot, roller guides, a gold round-sided reel in a
// locking seat, its drag lever and its handle.
const BLANK_START = 0.535, BODY_Y = 0.327, REEL_Z = - 0.092;

const blankR = ( y ) => MathUtils.lerp( 0.0135, 0.0032, Math.pow( MathUtils.clamp( ( y - BLANK_START ) / ( ROD_L - BLANK_START ), 0, 1 ), 0.8 ) );

// roller guides: position along the rod, and how high its roller sits off the blank
const ROLLERS = [ [ 0.8, 0.03 ], [ 1.1, 0.027 ], [ 1.36, 0.024 ], [ 1.58, 0.021 ], [ 1.78, 0.018 ], [ 1.96, 0.016 ] ];

export function buildBigRodGeometry() {

	const parts = [];
	const add = ( g, o ) => parts.push( prepare( g, o ) );
	const M = ( x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx ) => mat4( x, y, z, rx, ry, rz, sx, sy, sz );
	const V = ( x, y, z ) => new Vector3( x, y, z );
	const BLANK = { color: 0x1a1f26, rough: 0.34, metal: 0.05, pattern: PAT.plain };
	const WRAP = { color: 0x8c1d18, rough: 0.35, metal: 0, pattern: PAT.thread }; // (the red and gold a custom rod's wrapped in)
	const TRIM = { color: 0xb08a35, rough: 0.3, metal: 0.5, pattern: PAT.thread };
	const EVA = { color: 0x202124, rough: 0.8, metal: 0, pattern: PAT.eva };
	const ALU = { color: 0x8d8f92, rough: 0.32, metal: 0.95, pattern: PAT.machined }; // a bead-blasted aluminium butt
	const GOLD = { color: 0xb8923c, rough: 0.28, metal: 1, pattern: PAT.machined };
	const STEEL = { color: 0xb7bcc0, rough: 0.16, metal: 1, pattern: PAT.machined };
	const BLACK = { color: 0x101114, rough: 0.42, metal: 0.25, pattern: PAT.plain };
	const LINE = { color: 0xb6c2ae, rough: 0.6, metal: 0, pattern: PAT.braid };

	// the butt: the gimbal's cross-slot in a machined cap, then the aluminium tube
	add( lathe( [ [ 0, 0 ], [ 0.016, 0 ], [ 0.0185, 0.004 ], [ 0.0185, 0.03 ], [ 0.0165, 0.036 ] ], 20 ), ALU );
	add( roundedBox( 0.05, 0.012, 0.006, 0.001, 1 ), { ...BLACK, matrix: M( 0, 0.002, 0 ) } );
	add( cylinder( 0.0165, 0.0165, 0.2, 20 ), { ...ALU, matrix: M( 0, 0.136, 0 ) } );
	add( lathe( [ [ 0.0165, 0.236 ], [ 0.0195, 0.24 ], [ 0.0195, 0.262 ], [ 0.017, 0.268 ] ], 20 ), GOLD ); // the seat's locking ring
	// the reel seat, its hoods clamped on the reel's foot
	add( cylinder( 0.0165, 0.0165, 0.13, 20 ), { ...ALU, matrix: M( 0, 0.333, 0 ) } );
	add( lathe( [ [ 0.0165, 0.396 ], [ 0.019, 0.402 ], [ 0.019, 0.418 ], [ 0.016, 0.424 ] ], 20 ), GOLD );
	// the long fore-grip, and the winding check at the blank
	add( lathe( [ [ 0.016, 0.424 ], [ 0.0185, 0.434 ], [ 0.0195, 0.47 ], [ 0.0175, 0.52 ], [ 0.015, 0.535 ] ], 20 ), EVA );
	add( lathe( [ [ 0.015, 0.535 ], [ 0.015, 0.539 ], [ 0.0138, 0.543 ] ], 16 ), GOLD );
	{

		const prof = [];
		for ( let i = 0; i <= 70; i ++ ) {

			const y = MathUtils.lerp( BLANK_START, ROD_L - 0.004, i / 70 );
			prof.push( [ blankR( y ), y ] );

		}

		add( lathe( prof, 12 ), BLANK );

	}

	add( cylinder( blankR( 0.62 ) + 0.0005, blankR( 0.56 ) + 0.0005, 0.06, 12 ), { ...WRAP, matrix: M( 0, 0.59, 0 ) } );
	add( cylinder( blankR( 0.62 ) + 0.0008, blankR( 0.62 ) + 0.0008, 0.004, 12 ), { ...TRIM, matrix: M( 0, 0.622, 0 ) } );

	// roller guides: a roller between two cheeks on a stand, its wraps either side
	for ( const [ y, h ] of ROLLERS ) {

		const br = blankR( y ), z = - br - h;
		add( cylinder( 0.0058, 0.0058, 0.011, 10 ), { ...STEEL, matrix: M( 0, y, z, 0, 0, Math.PI / 2 ) } );
		for ( const sx of [ - 1, 1 ] ) {

			add( roundedBox( 0.0018, 0.019, h + 0.01, 0.0006, 1 ), { ...GOLD, matrix: M( sx * 0.007, y, - br - ( h + 0.002 ) * 0.5 ) } );

		}

		add( roundedBox( 0.016, 0.046, 0.0026, 0.001, 1 ), { ...GOLD, matrix: M( 0, y, - br - 0.0008 ) } );
		add( cylinder( blankR( y ) + 0.0009, blankR( y ) + 0.0009, 0.07, 10 ), { ...WRAP, matrix: M( 0, y, 0 ) } );

	}

	// the roller tip-top
	add( cylinder( 0.0052, 0.0058, 0.018, 8 ), { ...GOLD, matrix: M( 0, ROD_L - 0.012, 0 ) } );
	add( cylinder( 0.0068, 0.0068, 0.012, 10 ), { ...STEEL, matrix: M( 0, ROD_L, - 0.008, 0, 0, Math.PI / 2 ) } );

	// the line from the reel over each roller to the tip
	{

		const pts = [ V( 0, BODY_Y + 0.04, REEL_Z + 0.02 ) ];
		for ( const [ y, h ] of ROLLERS ) pts.push( V( 0, y, - blankR( y ) - h - 0.005 ) );
		pts.push( V( 0, ROD_L, - 0.015 ) );
		for ( let i = 0; i < pts.length - 1; i ++ ) add( rod( pts[ i ], pts[ i + 1 ], 0.00042, 3 ), { color: 0xc6cec0, rough: 0.6, metal: 0 } );

	}

	// ---- the reel, on its shaft along X at BODY_Y, REEL_Z, so that the hand rod's crank turns its handle (and its spool)
	const R = 0.056, W = 0.041, AX = ( x, rz = Math.PI / 2 ) => M( x, BODY_Y, REEL_Z, 0, 0, rz );
	// its foot on the seat, and the clamp's two lugs
	add( roundedBox( 0.026, 0.11, 0.006, 0.002, 2 ), { ...GOLD, matrix: M( 0, BODY_Y, - 0.0185 ) } );
	for ( const y of [ - 0.036, 0.036 ] ) add( roundedBox( 0.016, 0.014, 0.05, 0.003, 2 ), { ...GOLD, matrix: M( 0, BODY_Y + y, - 0.043 ) } );
	// the two round side plates (the drag side's deeper), the pillars between them
	add( lathe( [ [ 0, W + 0.014 ], [ R * 0.5, W + 0.0135 ], [ R * 0.95, W + 0.008 ], [ R + 0.002, W + 0.002 ], [ R + 0.002, W - 0.005 ] ], 36 ), { ...GOLD, matrix: AX( 0, - Math.PI / 2 ) } );
	add( lathe( [ [ 0, W + 0.024 ], [ R * 0.42, W + 0.024 ], [ R * 0.8, W + 0.014 ], [ R + 0.002, W + 0.004 ], [ R + 0.002, W - 0.005 ] ], 36 ), { ...GOLD, matrix: AX( 0, Math.PI / 2 ) } );
	for ( const a of [ 1.1, 2.6, 4.2, 5.2 ] ) add( cylinder( 0.0035, 0.0035, 2 * W, 8 ), { ...STEEL, matrix: M( 0, BODY_Y + Math.cos( a ) * ( R - 0.004 ), REEL_Z + Math.sin( a ) * ( R - 0.004 ), 0, 0, Math.PI / 2 ) } );
	// the spool, turning with the handle: its flanges, and the line on it
	add( cylinder( R - 0.006, R - 0.006, 2 * W - 0.012, 30 ), { ...LINE, anim: 3, matrix: AX( 0 ) } );
	for ( const s of [ - 1, 1 ] ) add( cylinder( R - 0.002, R - 0.002, 0.004, 30 ), { ...BLACK, anim: 3, matrix: AX( s * ( W - 0.005 ) ) } );
	// the lever on the drag side, its arc; the star and the speed button on the handle side
	add( roundedBox( 0.007, 0.012, 0.062, 0.002, 2 ), { ...BLACK, matrix: M( - W - 0.026, BODY_Y + 0.016, REEL_Z - 0.03, 0.65, 0, 0 ) } );
	add( cylinder( 0.0075, 0.0075, 0.015, 10 ), { ...BLACK, matrix: M( - W - 0.026, BODY_Y + 0.036, REEL_Z - 0.056, 0, 0, Math.PI / 2 ) } );
	add( torus( R * 0.68, 0.0022, 6, 20, 2.2 ), { ...STEEL, matrix: M( - W - 0.024, BODY_Y, REEL_Z, 0, Math.PI / 2, 0 ) } );
	add( cylinder( 0.012, 0.016, 0.018, 16 ), { ...BLACK, matrix: AX( W + 0.026 ) } );
	add( cylinder( 0.005, 0.005, 0.01, 10 ), { ...GOLD, matrix: AX( W + 0.038 ) } );
	// the handle: a long machined arm and a big T of a knob, turning on the shaft
	add( roundedBox( 0.006, 0.09, 0.016, 0.003, 2 ), { ...GOLD, anim: 3, matrix: M( W + 0.042, BODY_Y - 0.038, REEL_Z ) } );
	add( cylinder( 0.0034, 0.0034, 0.014, 8 ), { ...STEEL, anim: 3, matrix: M( W + 0.052, BODY_Y - 0.078, REEL_Z, 0, 0, Math.PI / 2 ) } );
	add( lathe( [ [ 0.004, 0 ], [ 0.012, 0.002 ], [ 0.0145, 0.012 ], [ 0.0125, 0.032 ], [ 0.007, 0.04 ], [ 0, 0.041 ] ], 16 ), { color: 0x141518, rough: 0.7, metal: 0, pattern: PAT.rubber, anim: 3, matrix: M( W + 0.056, BODY_Y - 0.078, REEL_Z, 0, 0, - Math.PI / 2 ) } );

	return mergePrepared( parts );

}

