import { CatmullRomCurve3, TubeGeometry } from '../../engine/index.js';
import { alignY, cylinder, lathe, roundedBox } from '../../world/boat/GeoKit.js';
import { PAT } from '../GameMaterials.js';
import { LOOK, M, V, blank, rollerGuide, rollerTip, taper, turned, wrap } from './RodParts.js';

// (M16) The big rods and their reels, in the rod's own frame (game/FishingRod.js: +Y along the blank, butt at 0, and -Z the
// side the reel and the guides are on; a reel that rides on top is drawn by the hand's frame turned over) and with their
// moving parts tagged as the hand rod's are (rigs/RodParts.js' PART), so it's the same program.
// (M21) Each at its real size (stream GEAR, docs/m21/gear.md and docs/m21/sources-rods.md, -reels.md):
//   the stand-up rod: a 50 lb class rod, 1.68 m (Penn's International V stand-up is 56 in; M16 drew it 2.13 m), a hollow glass
//   blank 20 mm where it leaves the grip (it was 27), a 28 cm hard EVA fore-grip, an aluminium gimbal butt and seat (an AFTCO
//   short butt's 0.45 m, as M16's), five rollers and a roller tip (AFTCO's stand-up set; it had six);
//   the bent-butt chair rod: 2.32 m along its blank's line, a 0.72 m polished curved butt bent 30 degrees half way down (measured
//   off one photograph: rough), its gimbal's slot at the foot, the seat on the butt's upper leg, a 30 cm fore-grip, a 1.35 m
//   glass blank 24 mm at the grip to a 9.5 mm tip tube, five big rollers and a big roller tip;
//   the reels, lever drags (RodParts' drumReel): the gold two-speed 50-class (M16's, kept), a wide 80-class (side plates 150 mm,
//   a 121 x 97 mm spool, a chrome gear plate, a chrome lever on the handle's side, two harness lugs, a rod clamp, a power knob)
//   and a 130-class (the 80's shape 1.2 times taller: 180 mm plates, a 148 mm spool).
const BLANK = { color: 0x1a1f26, rough: 0.34, metal: 0.05, pattern: PAT.plain }; // dark glass
const PLATE = { ...LOOK.gold, color: 0xc9a24a, metal: 0.4, rough: 0.38 }; // (anodized: all mirror, they'd show only the dark of the water and go black)
const BRONZE = { color: 0x8c6a3a, rough: 0.34, metal: 0.9, pattern: PAT.machined };
const KNOB = { color: 0x141518, rough: 0.7, metal: 0, pattern: PAT.rubber };

// ---- the stand-up rod
// rollers: position along the rod, the roller's height over the blank, its radius (AFTCO's #51, #41, #41, #31, #31 from the reel)
const UP_ROLLERS = [ [ 0.8, 0.03, 0.0062 ], [ 0.97, 0.027, 0.0058 ], [ 1.13, 0.024, 0.0058 ], [ 1.29, 0.021, 0.0053 ], [ 1.44, 0.018, 0.0053 ] ];

export function standUpRod( add ) {

	const L = 1.68, BS = 0.7, br = taper( BS, L, 0.01, 0.003, 0.8 );
	// the butt: the gimbal's cross-slot in a machined cap, then the aluminium tube
	turned( add, [ [ 0, 0 ], [ 0.016, 0 ], [ 0.0185, 0.004 ], [ 0.0185, 0.03 ], [ 0.0165, 0.036 ] ], LOOK.alu );
	add( roundedBox( 0.05, 0.012, 0.006, 0.001, 1 ), { ...LOOK.black, matrix: M( 0, 0.002, 0 ) } );
	add( cylinder( 0.0165, 0.0165, 0.2, 20 ), { ...LOOK.alu, matrix: M( 0, 0.136, 0 ) } );
	turned( add, [ [ 0.0165, 0.236 ], [ 0.0195, 0.24 ], [ 0.0195, 0.262 ], [ 0.017, 0.268 ] ], LOOK.gold ); // the seat's locking ring
	// the reel seat, its hoods clamped on the reel's foot
	add( cylinder( 0.0165, 0.0165, 0.13, 20 ), { ...LOOK.alu, matrix: M( 0, 0.333, 0 ) } );
	turned( add, [ [ 0.0165, 0.396 ], [ 0.019, 0.402 ], [ 0.019, 0.418 ], [ 0.016, 0.424 ] ], LOOK.gold );
	// the long fore-grip, and the winding check at the blank
	turned( add, [ [ 0.016, 0.424 ], [ 0.0186, 0.44 ], [ 0.0196, 0.5 ], [ 0.0193, 0.6 ], [ 0.0172, 0.68 ], [ 0.0145, BS ] ], LOOK.eva );
	turned( add, [ [ 0.0145, BS ], [ 0.0145, BS + 0.004 ], [ 0.0118, BS + 0.008 ] ], LOOK.gold, 16 );
	blank( add, br, BS, L, BLANK );
	// (the red and gold a custom rod's wrapped in)
	wrap( add, br, BS + 0.05, 0.06, LOOK.red, 0.0005 );
	wrap( add, br, BS + 0.082, 0.004, LOOK.goldThread, 0.0008 );
	const guides = UP_ROLLERS.map( ( [ y, h, r ] ) => rollerGuide( add, br, y, h, r ) );
	guides.push( rollerTip( add, L, 0.0068, br ) );
	return { L, blankStart: BS, hold: 0.41, seatY: 0.327, seatR: 0.0165, guides, tilt: 0, butt: V( 0, 0, 0 ) };

}

// ---- the bent-butt chair rod
const CHAIR_ROLLERS = [ [ 1.1, 0.036, 0.0068 ], [ 1.32, 0.032, 0.0066 ], [ 1.53, 0.029, 0.0062 ], [ 1.73, 0.025, 0.006 ], [ 1.92, 0.022, 0.0058 ] ];
export const BEND = 30 * Math.PI / 180; // the curved butt's bend

export function chairRod( add ) {

	const L = 2.32, BS = 0.97, br = taper( BS, L, 0.0122, 0.00475, 0.8 );
	const r = 0.017, yb = 0.312, top = 0.672, leg = 0.36, rho = 0.085, t = rho * Math.tan( BEND / 2 );
	// the curved butt: a polished tube from the gimbal up its lower leg, round a bend of about two and a half of its widths, and
	// up its upper leg to the ferrule. Its lower leg leans to the reel's side, so the rod above lies 30 degrees lower than the
	// butt in the chair's gimbal (or a holder's tube)
	const u = V( 0, Math.cos( BEND ), - Math.sin( BEND ) ), B = V( 0, yb, 0 ), G = B.clone().addScaledVector( u, - leg );
	const pts = [];
	for ( let i = 0; i <= 4; i ++ ) pts.push( G.clone().lerp( B.clone().addScaledVector( u, - t ), i / 4 ) );
	for ( let i = 1; i < 6; i ++ ) {

		const f = Math.PI * ( 7 / 6 - i / 36 );
		pts.push( V( 0, yb + t + rho * Math.sin( f ), rho + rho * Math.cos( f ) ) );

	}

	for ( let i = 0; i <= 4; i ++ ) pts.push( V( 0, MathLerp( yb + t, top, i / 4 ), 0 ) );
	add( new TubeGeometry( new CatmullRomCurve3( pts, false, 'centripetal' ), 44, r, 16, false ), LOOK.polished );
	// the gimbal's cap at its foot, its slot across it
	const g = alignY( G, u );
	add( lathe( [ [ 0, 0.0 ], [ 0.0175, 0 ], [ 0.0192, 0.004 ], [ 0.0192, 0.032 ], [ r, 0.038 ] ], 20 ), { ...LOOK.polished, matrix: g } );
	add( roundedBox( 0.052, 0.012, 0.007, 0.001, 1 ), { ...LOOK.black, matrix: g.clone().multiply( M( 0, 0.002, 0 ) ) } );
	// the seat on its upper leg: the locking ring, the hood at its front, the collet's nut at the ferrule
	turned( add, [ [ r, 0.4 ], [ r + 0.003, 0.405 ], [ r + 0.003, 0.426 ], [ r + 0.0006, 0.431 ] ], LOOK.gold );
	turned( add, [ [ r, 0.585 ], [ r + 0.0028, 0.59 ], [ r + 0.0028, 0.61 ], [ r + 0.0004, 0.616 ] ], LOOK.gold );
	turned( add, [ [ r, 0.638 ], [ r + 0.0042, 0.642 ], [ r + 0.0042, 0.668 ], [ r + 0.001, top ] ], LOOK.gold );
	// the fore-grip, its winding check, the blank
	turned( add, [ [ 0.0185, top ], [ 0.0212, top + 0.02 ], [ 0.0222, top + 0.1 ], [ 0.0216, top + 0.2 ], [ 0.019, BS - 0.02 ], [ 0.0162, BS ] ], LOOK.eva );
	turned( add, [ [ 0.0162, BS ], [ 0.0162, BS + 0.004 ], [ 0.0136, BS + 0.008 ] ], LOOK.gold, 16 );
	blank( add, br, BS, L, BLANK );
	wrap( add, br, BS + 0.05, 0.06, LOOK.wrap, 0.0005 );
	wrap( add, br, BS + 0.082, 0.004, LOOK.goldThread, 0.0008 );
	const guides = CHAIR_ROLLERS.map( ( [ y, h, rr ] ) => rollerGuide( add, br, y, h, rr, { wrapLook: LOOK.wrap } ) );
	guides.push( rollerTip( add, L, 0.0085, br ) );
	return { L, blankStart: BS, hold: 0.64, seatY: 0.508, seatR: r, guides, tilt: BEND, butt: G };

}

const MathLerp = ( a, b, t ) => a + ( b - a ) * t;

// ---- the reels (RodParts' drumReel: what each figure is)
// the gold two-speed 50-class (M16's, after a Penn International 50 and a Shimano Tiagra 50W: its 112 mm side plates, its
// 100 mm spool, its star and speed button, its 78 mm arm and T knob), kept as it was; its lever moved from the drag side to the
// handle's, between the plate and the arm, as real ones have it and as the 80, the 130 and the conventional are drawn (the user's
// call, 2026-11-16: each drawn as itself)
export const TWO_SPEED_50 = {
	R: 0.056, W: 0.041, dD: 0.024, dH: 0.014, hub: 0.024, stand: 0.0195, lineR: 0.05, arbour: null, crank: 0.078, knob: 'T', k: 1, foot: 0.11,
	lever: { side: 1, off: 0.004 }, star: true, button: LOOK.gold, lugs: 0, clamp: 0,
	plate: PLATE, pillar: LOOK.chrome, flange: LOOK.black, footLook: LOOK.gold, leverLook: LOOK.black, arm: LOOK.gold, knobLook: KNOB,
};
// the wide 80-class (a Shimano Tiagra 80W's: side plates about 150 mm, frame 185 mm wide, its spool 121 x 97 mm, an 80 mm crank
// and its power knob, a chrome lever about 85 mm on the handle's side, its tip over the frame at the rear, two harness lugs
// 128 mm apart, a bronze foot about 88 mm and the rod clamp; gold, its gear plate chrome)
export const WIDE_80 = {
	R: 0.075, W: 0.0525, dD: 0.026, dH: 0.042, stand: 0.022, lineR: 0.0605, arbour: 0.036, crank: 0.08, knob: 'power', k: 1.25, foot: 0.088,
	lever: { side: 1, off: 0.008, len: 0.085, at: [ - 0.5, - 0.866 ] }, star: false, button: LOOK.black, lugs: 0.064, clamp: 0.0165,
	plate: { ...PLATE, metal: 0.45, rough: 0.34 }, gearPlate: LOOK.chrome, pillar: LOOK.gold, flange: LOOK.black, footLook: BRONZE, leverLook: LOOK.chrome, arm: { ...PLATE, metal: 0.5, rough: 0.32 }, knobLook: KNOB,
};
// the 130-class (a Tiagra 130's spool, 148 x 96 mm; the 80's shape 1.22 times taller, the frame about 190 mm wide, an 89 mm crank;
// all gold)
export const BIG_130 = {
	R: 0.09, W: 0.052, dD: 0.03, dH: 0.046, stand: 0.026, lineR: 0.074, arbour: 0.044, crank: 0.089, knob: 'power', k: 1.4, foot: 0.098,
	lever: { side: 1, off: 0.009, len: 0.1, at: [ - 0.5, - 0.866 ] }, star: false, button: LOOK.black, lugs: 0.066, clamp: 0.017,
	plate: { ...PLATE, metal: 0.45, rough: 0.34 }, gearPlate: { ...PLATE, metal: 0.5, rough: 0.3 }, pillar: LOOK.gold, flange: LOOK.black, footLook: BRONZE, leverLook: LOOK.chrome, arm: { ...PLATE, metal: 0.5, rough: 0.32 }, knobLook: KNOB,
};
