import { Vector3 } from '../../engine/index.js';
import { mulberry32 } from '../../util/Noise.js';
import { HARD, WOOD, InstancedProps, lin } from '../Props.js';
import { plank } from './DebrisShapes.js';
import { SHELL_KINDS, SHELLS } from '../../game/Shells.js';

// (M16) What a hurricane tore off the village, lying in its wrack on the bay's beach (game/Beachcomb's wreckageAt says
// what and which): each half in the sand, one end or edge buried, as things the sea's thrown up and fallen back from lie,
// never laid on top (StormWrack heaps its weed against them). The roofs' own corrugated sheets (Village.sheetFlyers' bend,
// their material and colours), the pier's boards (DebrisShapes' plank), a plank door and a board shutter as the houses
// have them, the village's crate and fish pot (Props: on low, a stove-in few of their slats: they're 300 triangles whole),
// a kitchen chair with its back broken.
//   wreckAt( f, terrain, xRange, pierX ) -> [ x, z ]: on the line the hurricane's sea reached (as StormWrack finds it)
//   wreckPiece( B, ground, x, z, f, lite )   wallBoard: your finished shell set, in its tray (world/Beachcombing)

const UP = new Vector3( 0, 1, 0 );
const TINS = [ 0x8a5a40, 0xa06a48, 0x9aa0a0, 0x7f8588, 0x6e4a38 ];
const PAINTS = [ 0x2d7f7a, 0x3f6a8a, 0xa5482f, 0xd8cdb4, 0x4f7a4a ];
let props = null;

export function wreckAt( f, T, [ x0, x1 ], pierX ) {

	let x = x0 + ( x1 - x0 ) * f.u;
	if ( Math.abs( x - pierX ) < 4 ) x += x < pierX ? - 4 : 4;
	let z = - 120;
	for ( ; z < - 20; z += 0.25 ) if ( T.heightAt( x, z ) < f.H ) break;
	return [ x, z + f.off ];

}

export function wreckPiece( B, ground, x, z, f, lite ) {

	const rand = mulberry32( f.seed ), yaw = f.yaw;
	switch ( f.kind ) {

		case 'tin': return tin( B, ground, x, z, yaw, rand, lite );
		case 'plank': return plank( B, ground, x, z, yaw, 1.3 + rand() * 1.5, 0.14 + rand() * 0.08, 0.035, rand, { weather: 0.75 + rand() * 0.25, sink: 0.6, lift: ( rand() - 0.3 ) * 0.12 } );
		case 'shutter': return shutter( B, ground, x, z, yaw, rand, lite );
		case 'door': return door( B, ground, x, z, yaw, rand, lite );
		case 'crate': return crate( B, ground, x, z, yaw, rand, lite );
		case 'pot': return pot( B, ground, x, z, yaw, rand, lite );
		default: return chair( B, ground, x, z, yaw, rand );

	}

}

// a roof's sheet: 0.84 m wide (the roofs' 3 ft sheet), 1.8 to 2.4 long, buckled where it tore; its low end under the sand
function tin( B, ground, x, z, yaw, rand, lite ) {

	const w = 0.84, L = 1.8 + rand() * 0.6, dx = Math.cos( yaw ), dz = - Math.sin( yaw ), sx = - dz, sz = dx;
	const bends = lite ? [ 0, 0.55, 1 ] : [ 0, 0.3, 0.62, 1 ], a0 = 0.03 + rand() * 0.08, kink = 0.1 + rand() * 0.35;
	const tint = lin( TINS[ Math.floor( rand() * TINS.length ) ] ), data = [ rand(), 0.35 + rand() * 0.5, tint[ 1 ] > 0.3 ? 1 : 0, 0 ];
	const at = ( t, s ) => {

		const d = t * L - L / 2, px = x + dx * d + sx * s, pz = z + dz * d + sz * s;
		// (from under the sand at its low end, rising, a kink at its first buckle; sagged on the side the sand's over it)
		const rise = ( t < bends[ 1 ] ? t : bends[ 1 ] + ( t - bends[ 1 ] ) * ( 1 + kink * 6 ) ) * L * a0 * 2.4;
		return new Vector3( px, ground( x, z ) - 0.07 + rise + s * 0.04, pz );

	};
	for ( let k = 0; k < bends.length - 1; k ++ ) {

		const a = bends[ k ], b = bends[ k + 1 ], P = [ at( a, - w / 2 ), at( b, - w / 2 ), at( b, w / 2 ), at( a, w / 2 ) ];
		const u = P[ 1 ].clone().sub( P[ 0 ] ).normalize();
		const up = new Vector3().crossVectors( P[ 3 ].clone().sub( P[ 0 ] ), u ).normalize();
		if ( up.y < 0 ) up.negate();
		B.slab( 'roofMetal', P, 0.012, { up, uDir: u, tint, data } );

	}

}

// tilted, its low end in the sand: the frame to build a flat piece in (its long axis x, its face y)
function lying( B, ground, x, z, yaw, rand, len, sinkBy ) {

	const pitch = 0.05 + rand() * 0.16, roll = ( rand() - 0.5 ) * 0.18;
	B.pushAt( x, ground( x, z ) + Math.sin( pitch ) * len * 0.5 - sinkBy, z, yaw, roll, pitch );

}

// a board shutter off a window (Buildings' windowUnit: 0.55 x 1.2): three boards on two battens, hinges torn out
function shutter( B, ground, x, z, yaw, rand, lite ) {

	const L = 1.2, W = 0.55, t = lin( PAINTS[ Math.floor( rand() * PAINTS.length ) ] ), seed = rand();
	lying( B, ground, x, z, yaw, rand, L, 0.1 );
	if ( lite ) B.box( 'wood', 0, 0, 0, L, 0.024, W, { grain: 0, tint: t, data: [ seed, 0.55, 3, 0.85 ] } );
	else for ( let i = 0; i < 3; i ++ ) B.box( 'wood', 0, 0, ( i - 1 ) * W / 3, L, 0.024, W / 3 - 0.006, { grain: 0, tint: t, data: [ seed + i * 0.1, 0.55, 0, 0.85 ] } );
	for ( const s of [ - 0.34, 0.36 ] ) B.box( 'wood', s, 0.018, 0, 0.08, 0.016, W - 0.02, { grain: 2, tint: t, data: [ seed + 0.5, 0.5, 0, 0.9 ] } );
	B.pop();

}

// a plank door with its Z brace (Buildings' sheds'), 0.8 x 1.8, half in the sand
function door( B, ground, x, z, yaw, rand, lite ) {

	const dc = lin( PAINTS[ Math.floor( rand() * PAINTS.length ) ] ), seed = rand();
	lying( B, ground, x, z, yaw, rand, 1.8, 0.12 );
	B.box( 'wood', 0, 0, 0, 1.8, 0.03, 0.8, { grain: 0, tint: dc, data: [ seed, 0.55, 3, 0.85 ] } );
	for ( const s of [ - 0.62, 0.62 ] ) B.box( 'wood', s, 0.024, 0, 0.1, 0.02, 0.76, { grain: 2, tint: dc, data: [ seed + 0.2, 0.55, 0, 0.85 ] } );
	B.beam( 'wood', [ - 0.6, 0.024, - 0.32 ], [ 0.6, 0.024, 0.32 ], 0.02, 0.09, { tint: dc, data: [ seed + 0.3, 0.55, 0, 0.85 ] } );
	if ( ! lite ) for ( const s of [ - 0.6, 0.6 ] ) B.box( 'hard', s, 0.038, - 0.28, 0.04, 0.008, 0.25, { tint: lin( 0x4a3a30 ), data: HARD( rand(), 0.9, 0.4, 0.7 ) } );
	B.pop();

}

// the village's crate, stove in and half full of sand; on low its few standing slats
function crate( B, ground, x, z, yaw, rand, lite ) {

	const g = ground( x, z );
	if ( ! lite ) {

		props = props || new InstancedProps( null );
		props.target = B;
		props.add( 'crate', x, g - 0.2, z, yaw, [ 0.82, 0.8, 0.76 ], ( rand() - 0.5 ) * 0.6, 0.25 + rand() * 0.3 );
		return;

	}

	const d = WOOD( rand(), 0.75, 0, 0 );
	B.pushAt( x, g - 0.02, z, yaw, ( rand() - 0.5 ) * 0.5, 0.2 + rand() * 0.3 );
	for ( let i = 0; i < 3; i ++ ) B.box( 'wood', 0, 0.06 + i * 0.12, 0.2, 0.6, 0.09, 0.012, { grain: 0, data: d } );
	B.box( 'wood', 0.29, 0.1, 0, 0.012, 0.22, 0.4, { grain: 2, data: d } );
	B.box( 'wood', - 0.08, 0.02, - 0.06, 0.46, 0.02, 0.3, { grain: 0, data: d } );
	B.pop();

}

// a fishing pot (Props' lobster pot), swept off the beach, half full of sand; on low its rails, hoops and a few slats
function pot( B, ground, x, z, yaw, rand, lite ) {

	const g = ground( x, z );
	if ( ! lite ) {

		props = props || new InstancedProps( null );
		props.target = B;
		props.add( 'trap', x, g - 0.14, z, yaw, [ 0.86, 0.84, 0.8 ], ( rand() - 0.5 ) * 0.5, ( rand() - 0.5 ) * 0.3 );
		return;

	}

	const d = WOOD( rand(), 0.85, 0, 0 ), L = 0.9, W = 0.5;
	B.pushAt( x, g - 0.12, z, yaw, ( rand() - 0.5 ) * 0.4, ( rand() - 0.5 ) * 0.2 );
	for ( const s of [ - 1, 1 ] ) B.box( 'wood', 0, 0.03, s * W / 2, L, 0.05, 0.04, { grain: 0, data: d } );
	for ( let i = 0; i < 5; i ++ ) {

		const a = ( i + 0.5 ) / 5 * Math.PI;
		if ( i !== 3 ) B.box( 'wood', 0, 0.05 + Math.sin( a ) * 0.24, Math.cos( a ) * 0.24, L - 0.02, 0.012, 0.05, { grain: 0, rx: - ( a - Math.PI / 2 ), data: d } );

	}

	B.pop();

}

// a kitchen chair on its side, its back snapped
function chair( B, ground, x, z, yaw, rand ) {

	const t = lin( PAINTS[ Math.floor( rand() * PAINTS.length ) ] ), d = [ rand(), 0.55, 0, 0.85 ];
	B.pushAt( x, ground( x, z ) + 0.13, z, yaw, Math.PI / 2 - 0.25 + rand() * 0.3, rand() * 0.2 );
	B.box( 'wood', 0, 0, 0, 0.4, 0.03, 0.4, { grain: 0, tint: t, data: d } );
	for ( const [ a, b ] of [ [ - 0.17, 0.17 ], [ 0.17, 0.17 ], [ - 0.17, - 0.17 ] ] ) B.box( 'wood', a, - 0.2, b, 0.035, 0.42, 0.035, { grain: 1, tint: t, data: d } );
	B.box( 'wood', - 0.17, 0.2, - 0.18, 0.035, 0.4, 0.035, { grain: 1, tint: t, data: d } );
	B.box( 'wood', - 0.05, 0.4, - 0.18, 0.28, 0.07, 0.02, { grain: 0, rz: 0.5, tint: t, data: d } );
	B.pop();

}

// ---- your finished shell set: Marta's tray on its trestle, beside her table, each of the fourteen lying in it at its
// true size. place( B, kind, x, y, z, yaw, L, rand ): a shell (world/Beachcombing)
export function wallBoard( B, ground, x, z, lite, place ) {

	const rand = mulberry32( 8123 ), yaw = 1.24, W = 1.26, D = 0.86, h = 0.86, g = ground( x, z ), top = g + h;
	const d = WOOD( 0.31, 0.6, 0, 0 ), felt = lin( 0x2f4a44 );
	B.pushAt( x, g, z, yaw );
	for ( const sx of [ - 1, 1 ] ) {

		B.box( 'wood', sx * ( W / 2 - 0.08 ), h / 2, - D / 2 + 0.08, 0.05, h, 0.05, { grain: 1, data: d } );
		B.box( 'wood', sx * ( W / 2 - 0.08 ), h / 2, D / 2 - 0.08, 0.05, h, 0.05, { grain: 1, data: d } );
		B.box( 'wood', sx * W / 2, h + 0.025, 0, 0.025, 0.06, D, { grain: 2, data: d } );

	}

	for ( const sz of [ - 1, 1 ] ) B.box( 'wood', 0, h + 0.025, sz * D / 2, W, 0.06, 0.025, { grain: 0, data: d } );
	B.box( 'hard', 0, h, 0, W - 0.02, 0.012, D - 0.02, { tint: felt, data: HARD( 0.4, 0, 0, 0.95 ) } );
	B.pop();
	// (four rows, the big ones at the back)
	const order = [ ...SHELL_KINDS ].sort( ( a, b ) => SHELLS[ b ].cm - SHELLS[ a ].cm ), rows = [ 3, 3, 4, 4 ];
	const cy = Math.cos( yaw ), sy = Math.sin( yaw );
	let k = 0;
	rows.forEach( ( n, r ) => {

		for ( let i = 0; i < n; i ++ ) {

			const kind = order[ k ++ ], lx = ( ( i + 0.5 ) / n - 0.5 ) * ( W - 0.2 ), lz = - D / 2 + 0.17 + r * ( D - 0.26 ) / 3.4;
			place( B, kind, x + lx * cy + lz * sy, top + 0.006, z - lx * sy + lz * cy, yaw + 0.2 + ( rand() - 0.5 ) * 0.2, SHELLS[ kind ].cm / 100, rand );

		}

	} );

}

export { UP };
