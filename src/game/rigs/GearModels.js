import { Color } from '../../engine/index.js';
import { cylinder, mergePrepared, prepare, roundedBox, tube } from '../../world/boat/GeoKit.js';
import { PAT } from '../GameMaterials.js';
import { freeNow } from '../../core/FreeNow.js';
import { releaseGeometry } from '../../core/ReleaseAfterUpload.js';
import { LOOK, M, PART, V, ball, blank, drumReel, lineThrough, ringGuide, screwSeat, spinReel, taper, tipTop, turned, wrap } from './RodParts.js';
import { BIG_130, TWO_SPEED_50, WIDE_80, chairRod, standUpRod } from './BigRod.js';
import { FLY_LINE_COLOR, flyReel, flyRod } from './FlyRod.js';

// (M21) Each rod and each reel drawn as itself (stream GEAR: docs/m21/gear.md; docs/M21.md, the user's decisions): built in
// code from RodParts' shared parts at its real size (docs/m21/sources-rods.md, -reels.md: shapes only, no makers' names or
// marks), the first time it's wanted, rod and reel merged into one mesh in the rod's one material, and kept by what it is:
// one geometry for your hands and every other player's copy holding the same, and the rods in the boats' holders.
//
//   RODS[ id ], REELS[ id ], LINES[ id ]: what each is (labels, builders, figures)
//   gearModel( rod, reel ) -> { geometry, fit }   fit: what FishingRod and the holders draw it by (its length, where the blank
//     bends from, where it's held, where its reel's foot is, the reel's axes for the shader, whether the reel's on top, ...)
//   modelOf( { rod, reel, line, electric, fly } ) -> { rod, reel, line }: the model for the game's levels (Gear's rod, reel
//     and line; the sportfisher's electric reel; a fly rod's weight)
//   gearCode( m ) / readGear( code ): the three in one small number for the pose (rod * 100 + reel * 10 + line)
//
// Rods: 0 the hand-me-down, 1 the 7 ft graphite, 2 the 9 ft surf rod, 3 the stand-up rod, 4 the bent-butt chair rod (it comes
// with the 130-class reel), 5 to 7 the fly rods (8, 10, 12 weight). Reels: 0 the old spinning reel, 1 the smooth one, 2 the
// conventional, 3 the 50-class two-speed, 4 the wide 80-class, 5 the 130-class, 6 the electric, 7 to 9 the fly reels.
// Lines: Gear's six, and 6 the fly line.
//
// The pairs the game makes are drawn as they are (the user's call): a reel that rides on top (the conventional, the big-game
// reels, the electric) is on top, and the rod's guides are on top with it, smaller, as a casting rod's are (the light rods'
// own casting set); a spinning reel hangs under, the guides under with it (the stand-up rod's rollers too, should one end up
// on it).

const GLASS = { color: 0x111113, rough: 0.5, metal: 0.1, pattern: PAT.carbon }; // an old glass blank, its gloss dulled
const CLEAR = { color: 0xc8a565, rough: 0.28, metal: 0.05, pattern: PAT.carbon }; // its pale clear tip
const GRAPHITE = { color: 0x1a2536, rough: 0.42, metal: 0.15, pattern: PAT.carbon }; // a dark blue graphite blank (judgement)
const SURF = { color: 0x101114, rough: 0.34, metal: 0.15, pattern: PAT.carbon }; // a gloss black surf blank

// ---------------------------------------------------------------- the rods
// guides: [ y, the ring's outside diameter, its centre's height over the blank ] (m); casting: the set on top, with a reel
// that rides there (smaller rings on low frames, the first about half a metre ahead of the reel: Mud Hole's spacing)

// the hand-me-down: a 2.0 m glass spinning rod in two pieces (an Ugly Stik's 6'6" to 7': a blank 14 mm at the grip to 3, its
// last 28 cm pale and clear), black foam grips (a 25 cm rear grip, an 8 cm fore-grip), a plain chrome seat locked by two rings
// at its front, six plain wire guides (the first about 30 mm: judgement) and a tip, black wraps with a white trim band
const GLASS_GUIDES = [ [ 0.78, 0.03, 0.04 ], [ 1.05, 0.022, 0.03 ], [ 1.28, 0.016, 0.021 ], [ 1.48, 0.012, 0.016 ], [ 1.66, 0.01, 0.013 ], [ 1.83, 0.009, 0.011 ] ];
const GLASS_CAST = [ [ 0.83, 0.016, 0.012 ], [ 1.08, 0.012, 0.0095 ], [ 1.3, 0.01, 0.0085 ], [ 1.5, 0.008, 0.0075 ], [ 1.67, 0.008, 0.007 ], [ 1.84, 0.007, 0.0065 ] ];
function glassRod( add, top ) {

	const L = 2.0, BS = 0.465, br = taper( BS, L, 0.007, 0.0015, 0.85 );
	turned( add, [ [ 0, 0 ], [ 0.011, 0.001 ], [ 0.0142, 0.006 ], [ 0.0146, 0.016 ], [ 0.014, 0.021 ] ], { ...LOOK.rubber, color: 0x1c1c1c } );
	turned( add, [ [ 0.0138, 0.021 ], [ 0.0146, 0.07 ], [ 0.0148, 0.15 ], [ 0.0142, 0.22 ], [ 0.0128, 0.27 ] ], LOOK.foam );
	const seatY = screwSeat( add, 0.27, 0.39, 0.0102, { body: LOOK.chrome, hood: LOOK.chrome, nut: { ...LOOK.knurl, color: 0x9a9fa4 }, nutAt: 'front' } );
	turned( add, [ [ 0.0118, 0.39 ], [ 0.0121, 0.4 ], [ 0.0114, 0.44 ], [ 0.0092, BS ] ], LOOK.foam );
	blank( add, br, BS, L, GLASS, { tipFrom: L - 0.28, tipLook: CLEAR } );
	// (the ferrule's wrap at the join, the maker's band and its white trim)
	wrap( add, br, 1.0, 0.03, LOOK.wrap, 0.0012 );
	wrap( add, br, BS + 0.035, 0.05, LOOK.wrap );
	wrap( add, br, BS + 0.062, 0.003, LOOK.white, 0.0008 );
	const set = top ? GLASS_CAST : GLASS_GUIDES, guides = set.map( ( [ y, d, h ] ) => ringGuide( add, br, y, d, h, { frame: LOOK.chrome, plain: true, trim: LOOK.white } ) );
	guides.push( tipTop( add, L, 0.0058, br, { frame: LOOK.chrome, plain: true } ) );
	return { L, blankStart: BS, hold: seatY, seatY, seatR: 0.0102, guides, tilt: 0, butt: V( 0, 0, 0 ) };

}

// the 7 ft graphite: 2.13 m in one piece (an inshore rod's: a blank 12 mm at the grip to 2.2), a split EVA grip (rear 23 cm, the
// blank bare a little, a graphite seat with gunmetal hoods locked at its back, a 7.5 cm fore-grip), seven small guides (Fuji's
// 25 mm gathering ring, then a quick drop) and a tip, black wraps with gold trim
const GRAPHITE_GUIDES = [ [ 0.84, 0.025, 0.04 ], [ 1.07, 0.016, 0.026 ], [ 1.28, 0.01, 0.016 ], [ 1.47, 0.008, 0.012 ], [ 1.64, 0.007, 0.01 ], [ 1.8, 0.006, 0.009 ], [ 1.95, 0.006, 0.008 ] ];
const GRAPHITE_CAST = [ [ 0.83, 0.014, 0.011 ], [ 1.06, 0.01, 0.0085 ], [ 1.27, 0.008, 0.0075 ], [ 1.46, 0.007, 0.0068 ], [ 1.63, 0.006, 0.0062 ], [ 1.79, 0.006, 0.006 ], [ 1.95, 0.006, 0.0058 ] ];
function graphiteRod( add, top ) {

	const L = 2.13, BS = 0.44, br = taper( BS, L, 0.006, 0.0011, 0.85 );
	turned( add, [ [ 0, 0 ], [ 0.012, 0.001 ], [ 0.0148, 0.005 ], [ 0.015, 0.012 ], [ 0.0146, 0.015 ] ], LOOK.rubber );
	turned( add, [ [ 0.0144, 0.015 ], [ 0.015, 0.07 ], [ 0.0151, 0.13 ], [ 0.0143, 0.2 ], [ 0.013, 0.245 ] ], LOOK.eva );
	turned( add, [ [ 0.0128, 0.245 ], [ 0.0128, 0.249 ], [ 0.0074, 0.253 ] ], LOOK.champ, 16 );
	add( cylinder( 0.0066, 0.0068, 0.034, 14 ), { ...GRAPHITE, matrix: M( 0, 0.268, 0 ) } );
	add( cylinder( 0.0072, 0.0072, 0.005, 14 ), { ...LOOK.trim, matrix: M( 0, 0.28, 0 ) } );
	const seatY = screwSeat( add, 0.285, 0.37, 0.0104, { body: LOOK.seat, hood: LOOK.gun, nut: LOOK.knurl, nutAt: 'back' } );
	turned( add, [ [ 0.0112, 0.37 ], [ 0.0118, 0.38 ], [ 0.0112, 0.415 ], [ 0.0092, BS - 0.004 ] ], LOOK.eva );
	turned( add, [ [ 0.0092, BS - 0.004 ], [ 0.0092, BS - 0.001 ], [ br( BS ) + 0.0006, BS + 0.002 ] ], LOOK.champ, 16 );
	blank( add, br, BS, L, GRAPHITE );
	wrap( add, br, BS + 0.045, 0.05, LOOK.wrap, 0.0004 );
	wrap( add, br, BS + 0.072, 0.003, LOOK.trim, 0.0006 );
	const set = top ? GRAPHITE_CAST : GRAPHITE_GUIDES, guides = set.map( ( [ y, d, h ] ) => ringGuide( add, br, y, d, h ) );
	guides.push( tipTop( add, L, 0.0058, br ) );
	return { L, blankStart: BS, hold: seatY, seatY, seatR: 0.0104, guides, tilt: 0, butt: V( 0, 0, 0 ) };

}

// the 9 ft surf rod: 2.74 m in two pieces (a heavy surf blank, 17.5 mm at the butt to 3 mm, gloss black), a round rubber butt
// knob, a 48 cm rear grip and a 16 cm fore-grip of black shrink tube with the seat between (it starts 0.49 m up), six guides and
// a tip: under it, big (the first about 40 mm, a metre up: judgement); on top with the conventional reel, smaller (the first
// about 20 mm)
const SURF_GUIDES = [ [ 1.0, 0.04, 0.052 ], [ 1.36, 0.028, 0.038 ], [ 1.68, 0.02, 0.027 ], [ 1.97, 0.014, 0.019 ], [ 2.23, 0.01, 0.014 ], [ 2.48, 0.008, 0.011 ] ];
const SURF_CAST = [ [ 1.05, 0.02, 0.016 ], [ 1.38, 0.016, 0.0135 ], [ 1.68, 0.012, 0.011 ], [ 1.96, 0.01, 0.0095 ], [ 2.22, 0.008, 0.0082 ], [ 2.48, 0.007, 0.0076 ] ];
function surfRod( add, top ) {

	const L = 2.74, BS = 0.76, br = taper( BS, L, 0.0082, 0.0015, 0.8 );
	add( ball( 0.0185, 16, 10 ), { ...LOOK.rubber, matrix: M( 0, 0.014, 0, 0, 0, 0, 1, 0.9, 1 ) } );
	turned( add, [ [ 0.0125, 0.02 ], [ 0.0136, 0.04 ], [ 0.014, 0.25 ], [ 0.0136, 0.45 ], [ 0.0128, 0.49 ] ], LOOK.shrink );
	const seatY = screwSeat( add, 0.49, 0.6, 0.0115, { body: LOOK.seat, hood: LOOK.gun, nut: LOOK.knurl, nutAt: 'front' } );
	turned( add, [ [ 0.0128, 0.6 ], [ 0.0131, 0.61 ], [ 0.0124, 0.7 ], [ 0.0104, BS ] ], LOOK.shrink );
	turned( add, [ [ 0.0104, BS ], [ 0.0104, BS + 0.003 ], [ br( BS ) + 0.0006, BS + 0.006 ] ], LOOK.gun, 16 );
	blank( add, br, BS, L, SURF );
	wrap( add, br, 1.4, 0.035, LOOK.wrap, 0.0014 ); // (the ferrule's wrap at the join)
	wrap( add, br, BS + 0.05, 0.06, LOOK.wrap, 0.0004 );
	wrap( add, br, BS + 0.082, 0.004, LOOK.trim, 0.0007 );
	const set = top ? SURF_CAST : SURF_GUIDES, guides = set.map( ( [ y, d, h ] ) => ringGuide( add, br, y, d, h ) );
	guides.push( tipTop( add, L, 0.0064, br ) );
	return { L, blankStart: BS, hold: seatY, seatY, seatR: 0.0115, guides, tilt: 0, butt: V( 0, 0, 0 ) };

}

// ---------------------------------------------------------------- the reels
// the old spinning reel: a 5000 (a Penn Spinfisher 650SS's size: a 58 mm spool's lip, about 100 mm from the foot's top to its
// axis), black with a gold skirted spool, a chrome bail, a round knob on a 62 mm crank, its paint worn through on its edges
const OLD = { s: 1.0, drop: 0.1, crank: 0.062, knob: 'round', wear: true,
	body: { color: 0x141415, rough: 0.55, metal: 0.25, pattern: PAT.plain }, plate: { color: 0x1a1a1b, rough: 0.5, metal: 0.3, pattern: PAT.plain },
	trim: { ...LOOK.gold, rough: 0.4 }, rotor: { color: 0x141415, rough: 0.55, metal: 0.25, pattern: PAT.plain }, spool: { ...LOOK.gold, color: 0xae8838, rough: 0.38 },
	knobLook: { color: 0x1d1e20, rough: 0.75, metal: 0, pattern: PAT.rubber }, arm: { color: 0x1a1a1b, rough: 0.5, metal: 0.3, pattern: PAT.plain } };
// the smooth spinning reel: a 4000 (a Shimano Stradic's: a 52 mm spool, its axis 93 mm under the foot's top, a 57 mm crank and a
// flat T knob), silver and champagne with black trim
const SMOOTH = { s: 0.9, drop: 0.093, crank: 0.057, knob: 'paddle', wear: false,
	body: { color: 0xb4b8bc, rough: 0.34, metal: 0.45, pattern: PAT.machined }, plate: LOOK.black, trim: LOOK.champ,
	rotor: { color: 0xb4b8bc, rough: 0.34, metal: 0.45, pattern: PAT.machined }, spool: { ...LOOK.champ, metal: 0.5, rough: 0.32 }, knobLook: LOOK.black, arm: { ...LOOK.champ, metal: 0.5, rough: 0.32 } };
// the conventional: a 30-class lever drag (a Penn Fathom II 30LD's: side plates about 75 mm, the frame about 90 mm wide, a 55 mm
// spool, an 80 mm crank with an oval knob, the black lever at the top rear of the handle's plate; no harness lugs at its size),
// silver with a black lever and knob (anodised: as mirror, it showed only the dark of the water and went black, as M16's gold did)
const SILVER = { color: 0xc0c4c8, rough: 0.36, metal: 0.42, pattern: PAT.machined };
const CONV_30 = {
	R: 0.0375, W: 0.029, dD: 0.01, dH: 0.016, stand: 0.012, lineR: 0.0275, arbour: 0.016, crank: 0.072, knob: 'paddle', k: 0.75, foot: 0.07,
	lever: { side: 1, off: 0.006, len: 0.05, at: [ - 0.45, - 0.89 ] }, star: false, button: null, lugs: 0, clamp: 0,
	plate: SILVER, pillar: LOOK.chrome, flange: LOOK.black, footLook: LOOK.chrome, leverLook: LOOK.black, arm: SILVER, knobLook: { color: 0x141518, rough: 0.7, metal: 0, pattern: PAT.rubber },
};

// the electric reel for deep-dropping (a Shimano Beastmaster 9000's, a Daiwa Tanacom 1200's shape: its spool 90 x 62 mm between
// two side frames, the motor's housing over it, its display on top facing the angler, a 75 mm crank with a ball knob, a gold
// speed lever and a star drag on the handle's side, its power socket and the cable down the rod to a 12 V battery; black with
// gold trim). The body's size is judgement (about 190 mm long, 140 high and 150 wide)
const E_BLACK = { color: 0x141516, rough: 0.42, metal: 0.2, pattern: PAT.plain };
function electricReel( add, y0, z0 ) {

	const W = 0.034, lineR = 0.045, az = z0 - 0.016 - 0.05, AX = ( x ) => M( x, y0, az, 0, 0, Math.PI / 2 );
	add( roundedBox( 0.022, 0.09, 0.006, 0.002, 2 ), { ...LOOK.chrome, matrix: M( 0, y0, z0 - 0.002 ) } );
	add( roundedBox( 0.05, 0.12, 0.022, 0.006, 2 ), { ...E_BLACK, matrix: M( 0, y0 - 0.005, z0 - 0.016 ) } );
	// the side frames, rounded slabs about the spool, and the pillars
	for ( const sx of [ - 1, 1 ] ) add( roundedBox( 0.014, 0.19, 0.118, 0.012, 3 ), { ...E_BLACK, matrix: M( sx * ( W + 0.007 ), y0 - 0.008, az - 0.012 ) } );
	for ( const [ dy, dz ] of [ [ 0.075, 0.03 ], [ 0.075, - 0.045 ], [ - 0.09, 0.02 ] ] ) add( cylinder( 0.004, 0.004, 2 * W, 8 ), { ...LOOK.chrome, matrix: M( 0, y0 + dy, az + dz, 0, 0, Math.PI / 2 ) } );
	// the spool (6), its flanges, and the line on it (7)
	add( cylinder( lineR, lineR, 2 * W - 0.01, 36 ), { color: 0xffffff, rough: 0.5, metal: 0, pattern: PAT.plain, anim: PART.drumLine, matrix: AX( 0 ) } );
	for ( const s of [ - 1, 1 ] ) add( cylinder( lineR + 0.005, lineR + 0.005, 0.004, 36 ), { ...LOOK.chrome, anim: PART.drum, matrix: AX( s * ( W - 0.004 ) ) } );
	add( cylinder( 0.03, 0.03, 2 * W - 0.008, 20 ), { ...LOOK.chrome, anim: PART.drum, matrix: AX( 0 ) } );
	// the motor's housing over the spool, the display and its three buttons on top, the gold trim along it
	add( roundedBox( 2 * W + 0.028, 0.17, 0.042, 0.016, 3 ), { ...E_BLACK, matrix: M( 0, y0 - 0.012, az - 0.064 ) } );
	add( roundedBox( 0.05, 0.062, 0.003, 0.002, 1 ), { color: 0x1c2b27, rough: 0.12, metal: 0.2, pattern: PAT.plain, matrix: M( 0, y0 - 0.05, az - 0.0855 ) } );
	for ( const bx of [ - 0.016, 0, 0.016 ] ) add( cylinder( 0.0045, 0.0045, 0.004, 10 ), { ...LOOK.gold, matrix: M( bx, y0 - 0.002, az - 0.086, Math.PI / 2, 0, 0 ) } );
	for ( const sx of [ - 1, 1 ] ) add( roundedBox( 0.003, 0.16, 0.004, 0.0012, 1 ), { ...LOOK.gold, matrix: M( sx * ( W + 0.0145 ), y0 - 0.012, az - 0.07 ) } );
	// the handle's side: its gear housing, the star drag, the speed lever, the power socket
	add( cylinder( 0.042, 0.04, 0.02, 32 ), { ...E_BLACK, matrix: AX( W + 0.024 ) } );
	add( cylinder( 0.014, 0.019, 0.016, 10 ), { ...LOOK.black, matrix: AX( W + 0.042 ) } );
	add( roundedBox( 0.006, 0.05, 0.01, 0.002, 2 ), { ...LOOK.gold, matrix: M( W + 0.036, y0 - 0.03, az - 0.03, 0.8, 0, 0 ) } );
	add( cylinder( 0.008, 0.008, 0.012, 12 ), { ...LOOK.black, matrix: M( W + 0.026, y0 + 0.07, az - 0.05, 0, 0, Math.PI / 2 ) } );
	// the crank (3): its arm, and the ball knob trimmed in gold
	const c = 0.075, ax = W + 0.054;
	add( roundedBox( 0.007, c + 0.014, 0.017, 0.003, 2 ), { ...E_BLACK, anim: PART.crank, matrix: M( ax, y0 - c / 2 + 0.003, az ) } );
	add( cylinder( 0.004, 0.004, 0.014, 8 ), { ...LOOK.chrome, anim: PART.crank, matrix: M( ax + 0.01, y0 - c, az, 0, 0, Math.PI / 2 ) } );
	add( cylinder( 0.009, 0.009, 0.004, 14 ), { ...LOOK.gold, anim: PART.crank, matrix: M( ax + 0.016, y0 - c, az, 0, 0, Math.PI / 2 ) } );
	add( ball( 0.0165, 14, 10 ), { ...E_BLACK, rough: 0.3, anim: PART.crank, matrix: M( ax + 0.032, y0 - c, az ) } );
	// the cable from the socket, down along the rod's underside to its butt (and on to the battery)
	const pts = [ V( W + 0.032, y0 + 0.07, az - 0.05 ), V( W + 0.05, y0 + 0.08, az - 0.01 ), V( W + 0.042, y0 + 0.02, z0 + 0.02 ), V( 0.03, y0 - 0.12, 0.035 ), V( 0.018, 0.12, 0.028 ), V( 0.012, - 0.02, 0.03 ), V( 0.004, - 0.12, 0.06 ) ];
	add( tube( pts, 0.0032, 40, 5 ), { color: 0x101010, rough: 0.7, metal: 0, pattern: PAT.rubber } );
	return {
		kind: 'drum',
		axes: { spoolY: y0, spoolZ: az, crankY: y0, crankZ: az, pivotY: y0, braidR: 0.031 },
		lineR, osc: 0,
		from: V( 0, y0 + lineR * 0.4, az - lineR * 0.92 ),
	};

}

// ---------------------------------------------------------------- the tables
export const RODS = [
	{ label: 'Hand-me-down rod', build: glassRod },
	{ label: '7 ft graphite rod', build: graphiteRod },
	{ label: '9 ft surf rod', build: surfRod },
	{ label: 'Stand-up trolling rod', build: standUpRod },
	{ label: 'Bent-butt chair rod', build: chairRod },
	{ label: '9 ft 8-weight fly rod', build: ( add ) => flyRod( add, 8 ), fly: 8 },
	{ label: '9 ft 10-weight fly rod', build: ( add ) => flyRod( add, 10 ), fly: 10 },
	{ label: '9 ft 12-weight fly rod', build: ( add ) => flyRod( add, 12 ), fly: 12 },
];
// top: it rides on top of the rod; ratio: its spool's (or a spinning reel's rotor's) turns for each turn of the crank (the
// makers' high gears: Gear's reels, the Beastmaster's 3.1, a fly reel's one to one)
export const REELS = [
	{ label: 'Old spinning reel', build: ( add, y, z ) => spinReel( add, y, z, OLD ), top: false, ratio: 4.7 },
	{ label: 'Smooth spinning reel', build: ( add, y, z ) => spinReel( add, y, z, SMOOTH ), top: false, ratio: 5.3 },
	{ label: 'Conventional reel', build: ( add, y, z ) => drumReel( add, y, z, CONV_30 ), top: true, ratio: 5.3 },
	{ label: 'Two-speed big-game reel', build: ( add, y, z ) => drumReel( add, y, z, TWO_SPEED_50 ), top: true, ratio: 3.1 },
	{ label: 'Wide 80-class two-speed reel', build: ( add, y, z ) => drumReel( add, y, z, WIDE_80 ), top: true, ratio: 2.5 },
	{ label: '130-class two-speed reel', build: ( add, y, z ) => drumReel( add, y, z, BIG_130 ), top: true, ratio: 2.1 },
	{ label: 'Electric reel', build: electricReel, top: true, ratio: 3.1 },
	{ label: '8-weight fly reel', build: ( add, y, z ) => flyReel( add, y, z, 8 ), top: false, ratio: 1, fly: 8 },
	{ label: '10-weight fly reel', build: ( add, y, z ) => flyReel( add, y, z, 10 ), top: false, ratio: 1, fly: 10 },
	{ label: '12-weight fly reel', build: ( add, y, z ) => flyReel( add, y, z, 12 ), top: false, ratio: 1, fly: 12 },
];
// each line's look, in the air, on the water and on the spool (judgement, the user's to change: docs/M21.md): mono clear (the
// line as it's always been drawn), 15 lb with a faint green, 30 lb braid moss green, 60 lb braid hi-vis yellow (so the two
// braids differ), 80 lb mono smoke blue, 130 lb mono hi-vis yellow; the fly line as FlyRod has it. braid: matt and woven on the
// spool; mono glossy
export const LINES = [
	{ label: '8 lb mono', color: 0xd8dde0, braid: false },
	{ label: '15 lb mono', color: 0xc6dcc6, braid: false },
	{ label: '30 lb braid', color: 0x6f8a4c, braid: true },
	{ label: '60 lb braid', color: 0xd4da3c, braid: true },
	{ label: '80 lb mono', color: 0x8fa6c2, braid: false },
	{ label: '130 lb mono', color: 0xdde24c, braid: false },
	{ label: 'Fly line', color: FLY_LINE_COLOR, braid: false },
];
export const FLY_LINE = 6;
// (and what's drawn for a game that doesn't say: the nearest to the one model there was before M21, a 7 ft carbon spinning rod
// with a spinning reel and clear mono; its spread's rods the stand-up rod with the gold two-speed)
export const DEFAULT_GEAR = { rod: 1, reel: 1, line: 0 };
export const DEFAULT_SPREAD = { rod: 3, reel: 3, line: 3 };

// the model for the game's levels: rod and reel (Gear's levels, the reel's last coming with the chair rod), line (Gear's),
// electric (the sportfisher's electric reel, on the rod for a deep drop), fly (the fly rod's weight, or 0)
export function modelOf( { rod = 0, reel = 0, line = 0, electric = false, fly = 0 } = {} ) {

	if ( fly ) {

		const i = fly >= 12 ? 2 : fly >= 10 ? 1 : 0;
		return { rod: 5 + i, reel: 7 + i, line: FLY_LINE };

	}

	const r = Math.max( 0, Math.min( 5, reel | 0 ) );
	return { rod: r === 5 && ! electric ? 4 : Math.max( 0, Math.min( 3, rod | 0 ) ), reel: electric ? 6 : r, line: Math.max( 0, Math.min( 5, line | 0 ) ) };

}

export const gearCode = ( m ) => m.rod * 100 + m.reel * 10 + m.line;
// (a number from the pose: null unless it's a model there is)
export function readGear( code ) {

	if ( ! Number.isInteger( code ) || code < 0 || code > 999 ) return null;
	const rod = Math.floor( code / 100 ), reel = Math.floor( code / 10 ) % 10, line = code % 10;
	return rod < RODS.length && reel < REELS.length && line < LINES.length ? { rod, reel, line } : null;

}

// ---------------------------------------------------------------- the models, each built once
const _cache = new Map();
const _c = new Color();

// the rod and reel as one mesh -> { geometry, fit }. Kept: the same object for every mesh drawing that pair. Its arrays are let
// go once it's on the GPU (ReleaseAfterUpload: its bounds kept), as the load's still meshes' are
export function gearModel( rodId, reelId ) {

	const key = rodId * 16 + reelId;
	const had = _cache.get( key );
	if ( had ) return had;
	const Rd = RODS[ rodId ] || RODS[ DEFAULT_GEAR.rod ], Rl = REELS[ reelId ] || REELS[ DEFAULT_GEAR.reel ];
	const parts = [], add = ( g, o ) => parts.push( prepare( g, o ) );
	const fit = Rd.build( add, Rl.top );
	const r = Rl.build( add, fit.seatY, - fit.seatR );
	lineThrough( add, [ r.from, ...fit.guides ], fit.lineR || ( Rl.top ? 0.0004 : 0.0003 ) );
	const geometry = mergePrepared( parts );
	if ( parts.length > 1 ) for ( const p of parts ) {

		for ( const n of Object.keys( p.attributes ) ) freeNow( p.attributes[ n ].array );
		if ( p.index ) freeNow( p.index.array );

	}

	releaseGeometry( geometry );
	const tip = fit.guides[ fit.guides.length - 1 ];
	const m = {
		key, rod: rodId, reel: reelId, geometry,
		fit: {
			L: fit.L, blankStart: fit.blankStart, hold: fit.hold, seatY: fit.seatY, tilt: fit.tilt, butt: fit.butt.clone(), tipZ: tip.z,
			// (the length its bend's a share of: FishingRod's rodBend.w is the tip's deflection over it. A fly rod's M19's, the
			// spinning rod's 7 ft, as FlyCast bends it)
			bendL: Rd.fly ? 2.13 : fit.L,
			top: Rl.top, kind: r.kind, ratio: Rl.ratio, lineR: r.lineR, osc: r.osc, fly: !! Rd.fly,
			// (the shader's: rodFit = blank's start, length, the line's least radius on the spool, the bail's pivots; reelAxis = the
			// spool's centre y, z and the crank's)
			rodFit: [ fit.blankStart, fit.L, r.axes.braidR, r.axes.pivotY ],
			reelAxis: [ r.axes.spoolY, r.axes.spoolZ, r.axes.crankY, r.axes.crankZ ],
		},
	};
	_cache.set( key, m );
	return m;

}

// how many models are built (the tools' and the tests'), and whether this one is
export const modelsBuilt = () => _cache.size;
export const hasModel = ( rodId, reelId ) => _cache.has( rodId * 16 + reelId );

// a line's look -> its colour (linear) in `out`, and whether it's braid
export function lineLook( id, out = _c ) {

	const L = LINES[ id ] || LINES[ 0 ];
	return { color: out.setHex( L.color ), braid: L.braid };

}

// the shader's figures for a model, onto a rod material's uniforms (FishingRod's createRodMaterial), and the line's look
export function fitUniforms( U, model, line ) {

	const f = model.fit;
	U.rodFit.value.fromArray( f.rodFit );
	U.rodShape.value.y = f.bendL;
	U.reelAxis.value.fromArray( f.reelAxis );
	const L = lineLook( line );
	U.reelLine.value.set( L.color.r, L.color.g, L.color.b, L.braid ? 1 : 0 );

}

