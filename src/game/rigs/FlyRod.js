import { cylinder, lathe, roundedBox, torus } from '../../world/boat/GeoKit.js';
import { PAT } from '../GameMaterials.js';
import { LOOK, M, PART, V, blank, ringGuide, snakeGuide, taper, tipTop, turned, wrap } from './RodParts.js';

// (M19) The fly rod in your hands (stream FLY: docs/m19/fly.md): a 9 ft (2.74 m) saltwater fly rod at real scale. A short
// fighting butt, an anodised up-locking reel seat, a full-wells cork grip, the blank tapering to the tip, big ceramic stripping
// guides, snake guides above them and a tip-top, the fly line through them all; and under the seat a large-arbour disc reel,
// its frame, spool and fly line, its handle on the left for the line hand to wind.
// (M21) One for each weight, at its real length (stream GEAR: docs/m21/gear.md, docs/m21/sources-rods.md' 6 and -reels.md' 8;
// M19's one model, drawn stretched to the spinning rod's length, served all three): the blank 10 / 11.2 / 12.4 mm where it
// leaves the cork (Sage's Salt R8 is 10.9 and 12.2 mm at its butt; the 12's derived), a 178 mm grip on the 8 and 10 and a
// 203 mm one on the 12 (Winston), a fighting butt of 38 or 64 mm, two stripping guides on the 8 and 10 and three on the 12
// (Thomas & Thomas), ten guides in all at Mud Hole's spacing for a 9 ft rod; and its reel a 105, 111 or 121 mm disc, 27, 30 or
// 33 mm wide (Hatch's 7 Plus, 9 Plus, 11 Plus). The stripping guides' rings are judgement (16 and 12 mm, 20 and 16, 25, 20 and
// 16), as are the reels' finishes (black, titanium grey, satin gold: real ones come in many). Its spool and knob turn as you
// wind (RodParts' PART.drum), its line drawn the fly line's colour (FishingRod's reelLine).
export const FLY_L = 2.74; // 9 ft
export const FLY_LINE_COLOR = 0xd8cf9c; // a pale sand fly line (RIO's and Scientific Anglers' bonefish lines)
export const FLY_LINE_GLOW = 0.45; // its own glow, a share of its colour (rigs/FlyLine.js)

// Mud Hole's 9 ft 8 wt kit's guides, from the butt (m): the first two (three on a 12) are the stripping guides
const PLACES = [ 0.725, 1.051, 1.349, 1.597, 1.823, 2.029, 2.216, 2.378, 2.515, 2.634 ];
// each weight: its fighting butt and grip (m), the blank's radius where it leaves the cork and at its tip, its stripping guides'
// rings (outside diameter, m), and its reel (radius and width, m) and that reel's finish
export const FLY_FIG = {
	8: { butt: 0.038, grip: 0.178, r0: 0.005, r1: 0.0008, strip: [ 0.016, 0.012 ], reel: { R: 0.0525, W: 0.027 }, finish: { color: 0x2a2d31, rough: 0.38, metal: 0.45, pattern: PAT.machined } },
	10: { butt: 0.038, grip: 0.178, r0: 0.0056, r1: 0.001, strip: [ 0.02, 0.016 ], reel: { R: 0.0555, W: 0.03 }, finish: { color: 0x8a9095, rough: 0.36, metal: 0.45, pattern: PAT.machined } },
	12: { butt: 0.064, grip: 0.203, r0: 0.0062, r1: 0.001, strip: [ 0.025, 0.02, 0.016 ], reel: { R: 0.0605, W: 0.033 }, finish: { color: 0xc09c55, rough: 0.34, metal: 0.45, pattern: PAT.machined } },
};
const BLANK = { color: 0x23313b, rough: 0.4, metal: 0.15, pattern: PAT.carbon }; // a slate-blue saltwater blank

// the rod (wt: 8, 10 or 12) -> its figures (FishingRod's fit)
export function flyRod( add, wt ) {

	const F = FLY_FIG[ wt ] || FLY_FIG[ 8 ], L = FLY_L, seatTop = F.butt + 0.11, BS = seatTop + F.grip, br = taper( BS, L, F.r0, F.r1, 0.8 );
	// the fighting butt, the up-locking seat (its two rings below the reel's foot, the fixed hood above), the full-wells cork
	turned( add, [ [ 0, 0 ], [ 0.012, 0.001 ], [ 0.0165, 0.008 ], [ 0.017, F.butt * 0.7 ], [ 0.0145, F.butt * 0.92 ], [ 0.0118, F.butt ] ], LOOK.rubber, 22 );
	add( cylinder( 0.0112, 0.0112, 0.11, 20 ), { ...LOOK.anod, matrix: M( 0, F.butt + 0.055, 0 ) } );
	add( cylinder( 0.0135, 0.0135, 0.018, 22 ), { ...LOOK.knurl, matrix: M( 0, F.butt + 0.012, 0 ) } );
	add( cylinder( 0.0132, 0.0132, 0.014, 22 ), { ...LOOK.knurl, matrix: M( 0, F.butt + 0.03, 0 ) } );
	turned( add, [ [ 0.0112, seatTop - 0.012 ], [ 0.0128, seatTop - 0.006 ], [ 0.0126, seatTop ] ], LOOK.anod );
	// (full wells: swelling at both ends of the grip, where the palm sits and where the thumb pushes)
	const g = F.grip;
	turned( add, [ [ 0.0126, seatTop ], [ 0.0148, seatTop + g * 0.12 ], [ 0.0142, seatTop + g * 0.32 ], [ 0.0128, seatTop + g * 0.58 ], [ 0.0138, seatTop + g * 0.84 ], [ 0.0126, BS - 0.012 ], [ 0.0092, BS ] ], LOOK.cork, 22 );
	turned( add, [ [ 0.0092, BS ], [ 0.009, BS + 0.004 ], [ br( BS ) + 0.001, BS + 0.008 ] ], LOOK.trim, 16 );
	blank( add, br, BS, L, BLANK );
	wrap( add, br, BS + 0.07, 0.06, LOOK.wrap, 0.0004 ); // the maker's band
	wrap( add, br, BS + 0.103, 0.003, LOOK.trim, 0.0006 );
	// the guides: the stripping guides (a ring on two legs), the snakes (a wire loop), the tip-top
	const guides = [], n = F.strip.length;
	for ( let i = 0; i < n; i ++ ) guides.push( ringGuide( add, br, PLACES[ i ], F.strip[ i ], F.strip[ i ] / 2 + ( i ? 0.009 : 0.012 ), { trim: null } ) );
	const k = { 8: 1, 10: 1.06, 12: 1.12 }[ wt ] || 1;
	for ( let i = n; i < PLACES.length; i ++ ) {

		const j = i - 2;
		guides.push( snakeGuide( add, br, PLACES[ i ], ( 0.011 - j * 0.0006 ) * k, ( 0.0042 - j * 0.00018 ) * k ) );

	}

	guides.push( tipTop( add, L, 0.0056, br ) );
	// (held by the cork 0.3 m up the rod, as M19's: near the top of the grip, the thumb on it)
	return { L, blankStart: BS, hold: 0.3, seatY: F.butt + 0.055, seatR: 0.0112, guides, tilt: 0, butt: V( 0, 0, 0 ), lineR: 0.0006 };

}

// the reel under the seat (wt: its rod's weight): its foot in the seat, a frame round the spool (the drag's side plate on the
// right, its rims, its pillars), the spool (6: its face on the left with the handle's knob on it, its arbour) and the fly line
// on it (7), the drag knob on the right. y0: the foot's middle; z0: the seat's surface -> its axes and where the line leaves
export function flyReel( add, y0, z0, wt ) {

	const F = FLY_FIG[ wt ] || FLY_FIG[ 8 ], { R, W } = F.reel, az = z0 - 0.012 - R, A = F.finish;
	const AX = ( x ) => M( x, y0, az, 0, 0, Math.PI / 2 ); // a disc on the reel's axis (across the rod, along x)
	add( roundedBox( 0.012, 0.058, 0.004, 0.0015, 2 ), { ...A, matrix: M( 0, y0, z0 - 0.002 ) } );
	add( roundedBox( 0.009, 0.026, 0.014, 0.003, 2 ), { ...A, matrix: M( 0, y0, z0 - 0.01 ) } );
	// the frame: the drag's side plate, a rim each side, three pillars across
	add( cylinder( R, R, 0.004, 40 ), { ...A, matrix: AX( W / 2 - 0.002 ) } );
	for ( const sx of [ - 1, 1 ] ) add( torus( R - 0.001, 0.0018, 6, 40 ), { ...A, matrix: M( sx * W / 2, y0, az, 0, Math.PI / 2, 0 ) } );
	for ( const a of [ 0.6, 1.4, 2.4 ] ) add( cylinder( 0.003, 0.003, W, 8 ), { ...A, matrix: M( 0, y0 + Math.cos( a ) * ( R - 0.004 ), az + Math.sin( a ) * ( R - 0.004 ), 0, 0, Math.PI / 2 ) } );
	// the spool (6): its face on the left, ported, and its arbour; the line on it (7)
	add( cylinder( R - 0.003, R - 0.003, 0.004, 40 ), { ...A, anim: PART.drum, matrix: AX( - W / 2 + 0.003 ) } );
	for ( let i = 0; i < 5; i ++ ) {

		const a = i * Math.PI * 2 / 5;
		add( cylinder( R * 0.15, R * 0.15, 0.0045, 14 ), { ...LOOK.black, color: wt === 8 ? 0x4a4e53 : 0x111214, anim: PART.drum, matrix: M( - W / 2 + 0.003, y0 + Math.cos( a ) * R * 0.6, az + Math.sin( a ) * R * 0.6, 0, 0, Math.PI / 2 ) } );

	}

	add( cylinder( R * 0.45, R * 0.45, W - 0.006, 28 ), { ...A, anim: PART.drum, matrix: AX( 0 ) } );
	add( cylinder( R * 0.8, R * 0.8, W - 0.009, 40 ), { color: 0xffffff, rough: 0.55, metal: 0, pattern: PAT.plain, anim: PART.drumLine, matrix: AX( 0 ) } );
	// the handle on the spool's face, its knob out to the left
	add( cylinder( 0.006, 0.006, 0.005, 12 ), { ...A, anim: PART.drum, matrix: M( - W / 2 - 0.002, y0, az - R * 0.74, 0, 0, Math.PI / 2 ) } );
	add( lathe( [ [ 0.0035, 0 ], [ 0.0068, 0.002 ], [ 0.0074, 0.012 ], [ 0.0068, 0.024 ], [ 0.0042, 0.027 ], [ 0, 0.028 ] ], 14 ), { ...LOOK.black, color: wt === 8 ? 0x8a8f94 : 0x141518, anim: PART.drum, matrix: M( - W / 2 - 0.004, y0, az - R * 0.74, 0, 0, Math.PI / 2 ) } );
	// the drag knob, a big round one on the right
	add( cylinder( 0.017, 0.019, 0.01, 26 ), { ...LOOK.knurl, color: A.color, matrix: AX( W / 2 + 0.007 ) } );
	return {
		kind: 'fly',
		axes: { spoolY: y0, spoolZ: az, crankY: y0, crankZ: az, pivotY: y0, braidR: R * 0.45 },
		lineR: R * 0.8, osc: 0,
		from: V( 0, y0 + R * 0.61, az + R * 0.51 ),
	};

}
