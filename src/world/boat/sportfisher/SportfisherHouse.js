import { Vector3 } from '../../../engine/index.js';
import { gridSurface, orientTowards, slab, cylinder, sphere, rod, auxVertices } from '../GeoKit.js';
import { lerp, sstep } from '../HullLines.js';
import { SF } from './SportfisherLines.js';
import { V, bx, rbx, wallZ, plate, deckY, houseWallX, HOUSE_CORNER, WHITE, LINING, STEEL, BLACK } from './SportfisherHull.js';

// (M16) The house and all that's in it. Outside: her sides with the long tinted window that sweeps forward into the black
// windshield, as a convertible's does. Inside, after the Viking 48's layout: the salon a step up from the mezzanine, a U
// of settee to port, the galley with its island to starboard, the dinette, and a companionway down and forward to the
// cabins: a bunk room to port, the head to starboard, the stateroom in the bow.

const CHERRY = { color: 0x8f5226, rough: 0.2, pattern: 3 };
const CREAM = { color: 0xddd3bc, rough: 0.7 };
const COUNTER = { color: 0xd8cdb6, rough: 0.2 };
const SOLE = { color: 0xbcab90, rough: 0.4, pattern: 4 };
const LINER = { color: 0xe2dccd, rough: 0.6 };
const SHEET = { color: 0xe6e8ea, rough: 0.9 };

// the corner of the house's roof, where its side rounds into the windshield
const ROOF_CORNER = 1.0;
const ROOF_TIP = 2.3;
// the windshield's band on the front, of the way up from its foot to the roof
const SHIELD_LO = 0.3, SHIELD_HI = 0.86;

export function buildHouse( kit, L, q ) {

	sides( kit, L, q );
	aftBulkhead( kit, L, q );
	front( kit, L, q );

}

// a point on the house's front: u round from the port corner (0) to the middle (1), v up from its foot (0) to the roof (1)
function frontAt( L, s, u, v ) {

	const a = u * Math.PI / 2, ca = Math.cos( a ), sa = Math.sin( a );
	const wB = houseWallX( L, HOUSE_CORNER, 1.6 ) - 0.005, wT = houseWallX( L, ROOF_CORNER, SF.roofY );
	const zB = HOUSE_CORNER + ( SF.houseFront - HOUSE_CORNER ) * sa, xB = wB * ca;
	const zT = ROOF_CORNER + ( ROOF_TIP - ROOF_CORNER ) * Math.pow( sa, 0.8 ), xT = wT * Math.pow( ca, 0.8 );
	const yB = deckY( L, xB, zB );
	return V( s * lerp( xB, xT, v ), lerp( yB, SF.roofY, v ), lerp( zB, zT, v ) );

}

function sides( kit, L, q ) {

	const yFoot = ( z ) => deckY( L, houseWallX( L, z, 1.6 ), z );
	const zA = SF.houseAft;
	for ( const s of [ 1, - 1 ] ) {

		// the wall's outline in ( z, y ): along its foot from aft, up its forward edge (raked as the front is), back along the
		// roof. Points along the way, so it follows her curve
		const out = [];
		const N = q.low ? 5 : 12;
		for ( let i = 0; i <= N; i ++ ) {

			const z = lerp( zA, HOUSE_CORNER, i / N );
			out.push( [ z, yFoot( z ) ] );

		}

		for ( let i = 1; i <= 4; i ++ ) out.push( [ lerp( HOUSE_CORNER, ROOF_CORNER, i / 4 ), lerp( yFoot( HOUSE_CORNER ), SF.roofY, i / 4 ) ] );
		for ( let i = 1; i <= N; i ++ ) out.push( [ lerp( ROOF_CORNER, zA, i / N ), SF.roofY ] );

		// the long window: its forward edge along the raked corner, its top arched, level along the bottom, blunt and rounded aft
		const edge = ( f ) => [ lerp( HOUSE_CORNER, ROOF_CORNER, f ) - 0.03, lerp( yFoot( HOUSE_CORNER ), SF.roofY, f ) ];
		const fL = edge( SHIELD_LO ), fH = edge( SHIELD_HI ), zEnd = - 0.85, yLow = 2.02, win = [ fL, edge( ( SHIELD_LO + SHIELD_HI ) / 2 ), fH ];
		const arc = q.low ? 5 : 10;
		for ( let i = 1; i <= arc; i ++ ) {

			const f = i / arc, z = lerp( fH[ 0 ], zEnd + 0.22, f );
			win.push( [ z, lerp( fH[ 1 ], 2.66, f * f ) ] );

		}

		for ( let i = 1; i <= 4; i ++ ) {

			const a = i / 4 * Math.PI / 2;
			win.push( [ zEnd + 0.22 - 0.22 * Math.sin( a ), 2.66 - ( 2.66 - ( yLow + 0.14 ) ) * ( 1 - Math.cos( a ) ) ] );

		}

		win.push( [ zEnd + 0.1, yLow ] );
		for ( let i = 1; i < 4; i ++ ) win.push( [ lerp( zEnd + 0.1, fL[ 0 ], i / 4 ), lerp( yLow, fL[ 1 ], i / 4 ) ] );

		// and the small one behind it, by the salon's door
		const small = [ [ - 1.28, 2.0 ], [ - 1.28, 2.54 ], [ - 1.4, 2.62 ], [ - 1.95, 2.62 ], [ - 2.05, 2.52 ], [ - 2.05, 2.0 ] ];

		const map = ( u, v, side ) => V( s * ( houseWallX( L, u, v ) - ( side ? 0.05 : 0 ) ), v, u );
		const wall = slab( out, [ win, small ], map );
		kit.add( 'gelcoat', wall, { color: WHITE, rough: 0.28 } );
		for ( const w of [ win, small ] ) {

			const pane = slab( w, [], map, { back: false, edges: false } );
			orientTowards( pane, V( s, 0, 0 ) );
			pane.computeVertexNormals();
			kit.add( 'glass', pane );

		}

		// its lining, inside
		kit.add( 'cabin', slab( out, [ win, small ], ( u, v ) => V( s * ( houseWallX( L, u, v ) - 0.052 ), v, u ), { back: false, edges: false } ), LINER );

	}

}

function aftBulkhead( kit, L, q ) {

	const z = SF.houseAft, w = houseWallX( L, z, 2 ), m = SF.mezz, top = SF.roofY, door = [ - 0.52, 0.26 ];
	const winL = [ [ 0.48, 1.72 ], [ w - 0.22, 1.72 ], [ w - 0.26, 2.72 ], [ 0.48, 2.72 ] ];
	const winR = [ [ - 0.74, 1.72 ], [ - 0.74, 2.72 ], [ - w + 0.26, 2.72 ], [ - w + 0.22, 1.72 ] ];
	const outline = [ [ - w, m - 0.4 ], [ door[ 0 ], m - 0.4 ], [ door[ 0 ], 2.82 ], [ door[ 1 ], 2.82 ], [ door[ 1 ], m - 0.4 ], [ w, m - 0.4 ], [ w, top ], [ - w, top ] ];
	const g = slab( outline, [ winL, winR ], ( u, v, side ) => V( u, v, z + ( side ? 0.06 : 0 ) ) );
	kit.add( 'gelcoat', g, { color: LINING, rough: 0.32 } );
	for ( const p of [ winL, winR ] ) {

		const pane = slab( p, [], ( u, v, side ) => V( u, v, z - ( side ? - 0.01 : 0 ) ), { back: false, edges: false } );
		orientTowards( pane, V( 0, 0, - 1 ) );
		pane.computeVertexNormals();
		kit.add( 'glass', pane );

	}

	kit.add( 'cabin', slab( outline, [ winL, winR ], ( u, v ) => V( u, v, z + 0.062 ), { back: false, edges: false } ), LINER );
	// the door stands open against the bulkhead: its frame, its sill
	for ( const x of door ) kit.add( 'fittings', bx( x - 0.025, m, z - 0.012, x + 0.025, 2.84, z + 0.012 ), { color: 0x24262a, rough: 0.4 } );
	kit.add( 'fittings', bx( door[ 0 ] - 0.025, 2.82, z - 0.012, door[ 1 ] + 0.025, 2.86, z + 0.012 ), { color: 0x24262a, rough: 0.4 } );
	kit.add( 'cabin', bx( door[ 0 ], m, z - 0.005, door[ 1 ], SF.salon, z + 0.065 ), SOLE );

}

function front( kit, L, q ) {

	const NU = q.low ? 6 : 14;
	const strip = ( v0, v1, nv, bucket, opts ) => {

		for ( const s of [ 1, - 1 ] ) {

			const rows = [];
			for ( let i = 0; i <= NU; i ++ ) {

				const row = [];
				for ( let k = 0; k <= nv; k ++ ) row.push( frontAt( L, s, i / NU, lerp( v0, v1, k / nv ) ) );
				rows.push( row );

			}

			const g = gridSurface( rows );
			orientTowards( g, V( 0, 0.5, 1 ) );
			g.computeVertexNormals();
			kit.add( bucket, g, opts );

		}

	};

	strip( 0, SHIELD_LO, 2, 'gelcoat', { color: WHITE, rough: 0.28 } );
	strip( SHIELD_LO, SHIELD_HI, q.low ? 2 : 3, 'fittings', { color: 0x06090c, rough: 0.05 } );
	strip( SHIELD_HI, 1, 2, 'gelcoat', { color: WHITE, rough: 0.28 } );
	// the mullions, dark against the dark, just catching the light
	if ( ! q.low ) for ( const u of [ 0.34, 1 ] ) for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', rod( frontAt( L, s, u, SHIELD_LO ).add( V( 0, 0.006, 0.006 ) ), frontAt( L, s, u, SHIELD_HI ).add( V( 0, 0.006, 0.006 ) ), 0.016, 5 ), { color: 0x1a1d20, rough: 0.2 } );

	// wipers
	if ( ! q.low ) for ( const s of [ 1, - 1 ] ) {

		const a = frontAt( L, s, 0.72, SHIELD_LO + 0.02 ), b = a.clone().add( V( s * 0.45, 0.32, - 0.14 ) );
		kit.add( 'fittings', rod( a, b, 0.006, 4 ), BLACK );

	}

}

// ------------------------------------------------------------------ inside

export function buildCabin( kit, L, q ) {

	salon( kit, L, q );
	galley( kit, L, q );
	settees( kit, L, q );
	companionway( kit, L, q );
	lowerCabins( kit, L, q );

}

const cushion = ( x0, y0, z0, x1, y1, z1, r = 0.05 ) => rbx( x0, y0, z0, x1, y1, z1, r, 2 );

function salon( kit, L, q ) {

	const y = SF.salon, zA = SF.houseAft + 0.06, zF = SF.salonFront, wA = houseWallX( L, zA, 2 ) - 0.05, wF = houseWallX( L, zF - 0.2, 2 ) - 0.05;
	// the sole and the ceiling
	const plan = [ [ wA, zA ], [ wF, zF ], [ - wF, zF ], [ - wA, zA ] ];
	const stair = [ [ - 0.42, 0.72 ], [ 0.48, 0.72 ], [ 0.48, zF ], [ - 0.42, zF ] ];
	const fullPlan = [ [ wA, zA ], [ wF, zF ], [ 0.48, zF ], [ 0.48, stair[ 0 ][ 1 ] ], [ - 0.42, stair[ 0 ][ 1 ] ], [ - 0.42, zF ], [ - wF, zF ], [ - wA, zA ] ];
	kit.add( 'cabin', plate( fullPlan, [], y, 0.02 ), SOLE );
	const over = [ [ wA - 0.06, zA ], [ wA - 0.06, ROOF_CORNER ], [ wF - 0.32, zF ], [ - wF + 0.32, zF ], [ - wA + 0.06, ROOF_CORNER ], [ - wA + 0.06, zA ] ];
	kit.add( 'cabin', plate( over, [], SF.roofY - 0.02, 0.02 ), { color: 0xe8e2d4, rough: 0.8 } );
	// the wall below the windows and between them, in cherry; the valance above
	for ( const s of [ 1, - 1 ] ) {

		const rows = [];
		const N = q.low ? 3 : 6;
		for ( let i = 0; i <= N; i ++ ) {

			const z = lerp( zA, zF, i / N );
			rows.push( [ y, 1.6, 2.02 ].map( ( h ) => V( s * ( houseWallX( L, z, h ) - 0.055 ), h, z ) ) );

		}

		const g = gridSurface( rows, { uvFn: ( p ) => [ p.z, p.y ] } );
		orientTowards( g, V( - s, 0, 0 ) );
		g.computeVertexNormals();
		kit.add( 'cabin', g, CHERRY );
		kit.add( 'cabin', bx( s > 0 ? wA - 0.16 : - wA + 0.06, 2.8, zA, s > 0 ? wA - 0.06 : - wA + 0.16, SF.roofY - 0.02, ROOF_CORNER ), CHERRY );

	}

	// the aft bulkhead's lining, either side of the door
	for ( const [ x0, x1 ] of [ [ - wA, - 0.52 ], [ 0.26, wA ] ] ) kit.add( 'cabin', bx( x0, y, zA + 0.005, x1, 1.68, zA + 0.03 ), CHERRY );
	// downlights
	if ( ! q.low ) for ( const [ x, z ] of [ [ 0.9, - 1.5 ], [ - 0.9, - 1.5 ], [ 0.9, 0.2 ], [ - 0.9, 0.2 ], [ 0, - 0.65 ] ] ) kit.add( 'glow', cylinder( 0.04, 0.04, 0.006, 10 ).translate( x, SF.roofY - 0.024, z ), { color: 0xfff1d8, pattern: 5 } );
	// the forward bulkhead, its door over the stairs
	const zw = zF - 0.05, top = SF.roofY;
	kit.add( 'cabin', wallZ( [ [ - wF, y ], [ - 0.42, y ], [ - 0.42, PASSAGE_TOP ], [ 0.48, PASSAGE_TOP ], [ 0.48, y ], [ wF, y ], [ wF, 2.35 ], [ wF - 0.32, top ], [ - wF + 0.32, top ], [ - wF, 2.35 ] ], [], zw, 0.05 ), CHERRY );

}

function galley( kit, L, q ) {

	const y = SF.salon, h = y + 0.92, xW = - ( houseWallX( L, 0.6, 1.6 ) - 0.06 ), zF = SF.salonFront - 0.05;
	// along the starboard side and across the bulkhead, an L of cherry under a pale counter
	kit.add( 'cabin', bx( xW, y, - 0.15, xW + 0.6, h - 0.04, zF ), CHERRY );
	kit.add( 'cabin', bx( xW + 0.6, y, zF - 0.6, - 0.5, h - 0.04, zF ), CHERRY );
	kit.add( 'cabin', bx( xW - 0.01, h - 0.04, - 0.17, xW + 0.62, h, zF ), COUNTER );
	kit.add( 'cabin', bx( xW + 0.62, h - 0.04, zF - 0.62, - 0.5, h, zF ), COUNTER );
	// the island, with its counter
	kit.add( 'cabin', bx( - 1.0, y, - 0.55, - 0.55, h - 0.04, 0.5 ), CHERRY );
	kit.add( 'cabin', rbx( - 1.04, h - 0.04, - 0.6, - 0.5, h, 0.54, 0.012 ), COUNTER );
	// the cupboards over the bulkhead's counter, a glow under them
	kit.add( 'cabin', bx( xW, 2.28, zF - 0.34, - 0.5, 2.8, zF ), CHERRY );
	kit.add( 'cabin', bx( xW, 2.0, 0.65, xW + 0.34, 2.8, zF - 0.34 ), CHERRY );
	kit.add( 'glow', bx( xW + 0.2, 2.268, zF - 0.3, - 0.55, 2.276, zF - 0.28 ), { color: 0xffc98a, pattern: 5 } );
	// the sink and cooktop let into the counter
	kit.add( 'cabin', rbx( xW + 0.12, h - 0.005, 0.35, xW + 0.5, h + 0.002, 0.75, 0.01 ), { color: 0xbcbfc2, rough: 0.2 } );
	kit.add( 'cabin', bx( - 1.42, h - 0.002, zF - 0.5, - 0.86, h + 0.002, zF - 0.1 ), { color: 0x0b0c0e, rough: 0.08 } );
	if ( ! q.low ) {

		kit.add( 'fittings', cylinder( 0.012, 0.012, 0.24, 6 ).translate( xW + 0.08, h + 0.12, 0.55 ), STEEL );
		kit.add( 'fittings', rod( V( xW + 0.08, h + 0.24, 0.55 ), V( xW + 0.26, h + 0.2, 0.55 ), 0.01, 6 ), STEEL );
		// the drawers' faces, and the fridge's
		for ( const z of [ - 0.1, 0.25, 0.6, 0.95, 1.2 ] ) kit.add( 'fittings', bx( xW + 0.601, y + 0.1, z, xW + 0.606, y + 0.8, z + 0.008 ), BLACK );
		for ( const yy of [ y + 0.3, y + 0.58 ] ) kit.add( 'fittings', bx( xW + 0.601, yy, - 0.1, xW + 0.606, yy + 0.008, 1.2 ), BLACK );
		// stools at the island
		for ( const z of [ - 0.3, 0.25 ] ) {

			kit.add( 'fittings', cylinder( 0.022, 0.022, 0.62, 6 ).translate( - 0.3, y + 0.31, z ), STEEL );
			kit.add( 'cabin', cylinder( 0.17, 0.17, 0.07, 14 ).translate( - 0.3, y + 0.65, z ), CREAM );

		}

	}

}

function settees( kit, L, q ) {

	const y = SF.salon, seat = y + 0.42, back = y + 0.86, xW = houseWallX( L, - 1, 1.6 ) - 0.06, zA = SF.houseAft + 0.09;
	// a U of settee to port, against the aft bulkhead and the side: its base, then its cushions, each its own
	const row = ( x0, z0, x1, z1, n ) => {

		const along = Math.abs( x1 - x0 ) > Math.abs( z1 - z0 );
		for ( let i = 0; i < n; i ++ ) {

			const a = i / n, c = ( i + 1 ) / n, g = 0.008;
			if ( along ) kit.add( 'cabin', cushion( lerp( x0, x1, a ) + g, seat - 0.17, z0, lerp( x0, x1, c ) - g, seat, z1 ), CREAM );
			else kit.add( 'cabin', cushion( x0, seat - 0.17, lerp( z0, z1, a ) + g, x1, seat, lerp( z0, z1, c ) - g ), CREAM );
			if ( along ) kit.add( 'cabin', cushion( lerp( x0, x1, a ) + g, seat - 0.02, z0, lerp( x0, x1, c ) - g, back, z0 + 0.17, 0.06 ), CREAM );
			else kit.add( 'cabin', cushion( x1 - 0.17, seat - 0.02, lerp( z0, z1, a ) + g, x1, back, lerp( z0, z1, c ) - g, 0.06 ), CREAM );

		}

	};

	kit.add( 'cabin', bx( 0.34, y, zA, xW, seat - 0.17, zA + 0.58 ), CHERRY );
	kit.add( 'cabin', bx( xW - 0.58, y, zA + 0.58, xW, seat - 0.17, - 0.05 ), CHERRY );
	row( 0.34, zA, xW, zA + 0.58, q.low ? 1 : 2 );
	row( xW - 0.58, zA + 0.58, xW, - 0.05, q.low ? 1 : 3 );
	if ( ! q.low ) {

		// blue scatter cushions, set about as a person would
		for ( const [ x, z, w, tip ] of [ [ xW - 0.3, - 1.7, 0.2, 0.3 ], [ xW - 0.28, - 0.45, 0.17, - 0.2 ], [ 1.1, zA + 0.26, 0.2, 0.15 ] ] ) {

			const c = cushion( - w, - w, - 0.07, w, w, 0.07, 0.05 );
			c.rotateX( tip );
			c.rotateY( x > 1.3 ? Math.PI / 2 : 0 );
			c.translate( x, seat + w * 0.95, z );
			kit.add( 'cabin', c, { color: 0x6fb3c9, rough: 0.8 } );

		}

	}

	// the coffee table
	kit.add( 'fittings', cylinder( 0.03, 0.03, 0.4, 8 ).translate( xW - 0.95, y + 0.2, - 1.15 ), STEEL );
	kit.add( 'cabin', rbx( xW - 1.25, y + 0.4, - 1.45, xW - 0.65, y + 0.44, - 0.85, 0.015 ), CHERRY );
	// the dinette forward of it: a table on a post between two benches
	const xD = houseWallX( L, 0.7, 1.6 ) - 0.06, seatZ = [ [ 0.05, 0.48 ], [ 1.0, zF_ ] ];
	for ( const [ z0, z1 ] of seatZ ) {

		kit.add( 'cabin', cushion( 0.62, y, z0, xD, seat, z1 ), CREAM );

	}

	kit.add( 'cabin', cushion( 0.62, seat - 0.02, 0.05, xD, back, 0.2, 0.05 ), CREAM );
	kit.add( 'cabin', cushion( 0.62, seat - 0.02, zF_ - 0.15, xD, back, zF_, 0.05 ), CREAM );
	kit.add( 'fittings', cylinder( 0.035, 0.035, 0.7, 8 ).translate( 1.2, y + 0.35, 0.74 ), STEEL );
	kit.add( 'cabin', rbx( 0.72, y + 0.7, 0.5, xD - 0.05, y + 0.74, 0.98, 0.015 ), CHERRY );
	// the television on the bulkhead over the settee's end
	kit.add( 'cabin', bx( - 1.75, 1.75, SF.houseAft + 0.09, - 0.85, 2.3, SF.houseAft + 0.12 ), { color: 0x08090b, rough: 0.1 } );

}

const zF_ = SF.salonFront - 0.1;
export const CABIN = { bunkX: 1.12 }; // the bunks' inboard edge: the floor's between it and the passage
const PASSAGE_TOP = 2.4; // the ceiling over the stairs and the passage: head room coming down them

// the stairs down, its treads
function companionway( kit, L, q ) {

	const zTop = 0.72, zBot = 2.2, n = 5, x0 = - 0.42, x1 = 0.48, yT = SF.salon, yB = SF.lower;
	for ( let i = 0; i < n; i ++ ) {

		const f0 = i / n, f1 = ( i + 1 ) / n, z0 = lerp( zTop, zBot, f0 ), z1 = lerp( zTop, zBot, f1 ), yy = lerp( yT, yB, f1 );
		kit.add( 'cabin', bx( x0, yy - 0.04, z0, x1, yy, z1 ), SOLE );
		kit.add( 'cabin', bx( x0, yy, z0 - 0.02, x1, lerp( yT, yB, f0 ), z0 ), CHERRY );

	}

	for ( const x of [ x0, x1 ] ) {

		const out = [ [ zTop, yT - 0.02 ], [ zBot, yB ], [ zBot, PASSAGE_TOP ], [ zTop, PASSAGE_TOP ] ];
		const th = x < 0 ? - 0.04 : 0.04;
		kit.add( 'cabin', slab( out, [], ( u, v, side ) => V( x + ( side ? th : 0 ), v, u ) ), CHERRY );

	}

	// a handrail
	if ( ! q.low ) kit.add( 'fittings', rod( V( x1 - 0.04, yT + 0.85, zTop + 0.1 ), V( x1 - 0.04, yB + 0.85, zBot ), 0.012, 6 ), STEEL );

}

// what's stood in from the hull at ( z, y ): her liner
const linerX = ( L, z, y ) => Math.max( 0.05, L.hullXAt( z, y ) - 0.07 );
// the cabins' ceiling at ( x, z ): flat under the house, under the deck forward of it
const ceilingY = ( L, x, z ) => Math.min( 2.0, deckY( L, x, z ) - 0.07 );

function lowerCabins( kit, L, q ) {

	const y = SF.lower, zA = SF.salonFront, zF = SF.lowerForward;
	const N = q.low ? 7 : 16, NY = q.low ? 3 : 6;
	// her sides, her sole and overhead
	for ( const s of [ 1, - 1 ] ) {

		const rows = [], over = [], sole = [];
		for ( let i = 0; i <= N; i ++ ) {

			const z = lerp( zA, zF, i / N ), row = [];
			for ( let k = 0; k <= NY; k ++ ) {

				const h = lerp( y, 2.05, k / NY ), x = linerX( L, z, h ), c = ceilingY( L, x, z );
				row.push( V( s * x, Math.min( h, c ), z ) );

			}

			rows.push( row );
			const xc = row[ NY ].x * s, oRow = [], sRow = [];
			for ( let k = 0; k <= 4; k ++ ) {

				const x = xc * ( 1 - k / 4 );
				oRow.push( V( s * x, ceilingY( L, x, z ), z ) );

			}

			over.push( oRow );
			const xf = linerX( L, z, y );
			for ( let k = 0; k <= 2; k ++ ) sRow.push( V( s * xf * ( 1 - k / 2 ), y, z ) );
			sole.push( sRow );

		}

		const g = gridSurface( rows );
		orientTowards( g, V( - s, 0, 0 ) );
		g.computeVertexNormals();
		kit.add( 'cabin', g, LINER );
		const go = gridSurface( over );
		orientTowards( go, V( 0, - 1, 0 ) );
		go.computeVertexNormals();
		kit.add( 'cabin', go, { color: 0xe8e2d4, rough: 0.8 } );
		const gs = gridSurface( sole );
		orientTowards( gs, V( 0, 1, 0 ) );
		gs.computeVertexNormals();
		kit.add( 'cabin', gs, SOLE );

	}

	// a bulkhead across her at z, cut to her liner and her overhead; a door in it from door[ 0 ] to door[ 1 ]
	const bulkhead = ( z, door = null ) => {

		const NH = q.low ? 3 : 6;
		const edge = ( s ) => {

			const pts = [];
			for ( let k = 0; k <= NH; k ++ ) {

				const h = lerp( y, 2.0, k / NH ), x = linerX( L, z, h );
				pts.push( [ s * x, Math.min( h, ceilingY( L, x, z ) ) ] );

			}

			return pts;

		};

		const port = edge( 1 ), star = edge( - 1 ).reverse();
		// (round from the door's foot, by port, over the top and down by starboard: the door a notch up from the sole)
		const outline = door
			? [ [ door[ 1 ], y ], ...port, ...[ [ 0, ceilingY( L, 0, z ) ] ], ...star, [ door[ 0 ], y ], [ door[ 0 ], 1.92 ], [ door[ 1 ], 1.92 ] ]
			: [ ...port, [ 0, ceilingY( L, 0, z ) ], ...star ];
		kit.add( 'cabin', wallZ( outline, [], z, 0.04 ), CHERRY );

	};

	const wallS = ( x, z0, z1, door = null, top = 2.0 ) => {

		const out = door ? [ [ z0, y ], [ door[ 0 ], y ], [ door[ 0 ], 1.92 ], [ door[ 1 ], 1.92 ], [ door[ 1 ], y ], [ z1, y ], [ z1, top ], [ z0, top ] ] : [ [ z0, y ], [ z1, y ], [ z1, top ], [ z0, top ] ];
		kit.add( 'cabin', slab( out, [], ( u, v, side ) => V( x + ( side ? 0.04 : 0 ), v, u ) ), CHERRY );

	};

	// a plate following her side: x0 out to her liner (less margin) at height h, z0 to z1. What's built against her sides
	const toSide = ( x0, h, z0, z1, thick = 0.06, margin = 0.01 ) => {

		const out = [], n = q.low ? 3 : 7;
		for ( let i = 0; i <= n; i ++ ) {

			const z = lerp( z0, z1, i / n );
			out.push( [ Math.max( x0 + 0.02, linerX( L, z, h ) - margin ), z ] );

		}

		out.push( [ x0, z1 ], [ x0, z0 ] );
		return plate( out, [], h, thick );

	};

	// the passage: its walls, carried up over the stairs to its own higher ceiling; the bunk room to port and the head to starboard, doors at their forward ends
	const zHi = 2.9;
	wallS( 0.48, zA, 3.45, [ 2.45, 2.85 ] );
	wallS( - 0.46, zA, 3.45, [ 2.45, 2.85 ] );
	for ( const x of [ 0.48, - 0.46 ] ) kit.add( 'cabin', slab( [ [ zA, 2.0 ], [ zHi, 2.0 ], [ zHi, PASSAGE_TOP ], [ zA, PASSAGE_TOP ] ], [], ( u, v, side ) => V( x + ( side ? 0.04 : 0 ), v, u ) ), CHERRY );
	kit.add( 'cabin', plate( [ [ - 0.46, zA ], [ 0.52, zA ], [ 0.52, zHi ], [ - 0.46, zHi ] ], [], PASSAGE_TOP, 0.02 ), { color: 0xe8e2d4, rough: 0.8 } );
	// and across at the end of the higher part, down to the lower ceiling forward of it
	kit.add( 'cabin', wallZ( [ [ - 0.46, 1.96 ], [ 0.52, 1.96 ], [ 0.52, PASSAGE_TOP ], [ - 0.46, PASSAGE_TOP ] ], [], zHi, 0.03 ), CHERRY );
	bulkhead( zA + 0.01, [ - 0.42, 0.48 ] );
	// the stateroom's bulkhead, its door; and the bow's, at the head of the berth
	bulkhead( 3.45, [ - 0.36, 0.42 ] );
	bulkhead( zF - 0.02 );

	// the bunk room: one over the other along her side, as in the photographs, cherry fiddles, a pillow at each head
	const bx0 = CABIN.bunkX, bzA = 1.68, bzF = 3.38;
	for ( const [ h, fid ] of [ [ y + 0.48, 0.13 ], [ y + 1.22, 0.14 ] ] ) {

		kit.add( 'cabin', toSide( bx0, h, bzA, bzF ), CHERRY );
		kit.add( 'cabin', toSide( bx0 + 0.02, h + 0.13, bzA + 0.02, bzF - 0.02, 0.13, 0.03 ), SHEET );
		kit.add( 'cabin', bx( bx0 - 0.02, h - 0.06, bzA, bx0 + 0.02, h + fid + 0.05, bzF ), CHERRY );
		kit.add( 'cabin', cushion( bx0 + 0.04, h + 0.12, bzA + 0.05, bx0 + 0.62, h + 0.24, bzA + 0.42, 0.05 ), { color: 0xcbb596, rough: 0.9 } );

	}

	// (the drawers under the lower one, and the post at its foot, up to the upper)
	kit.add( 'cabin', bx( bx0, y, bzA, bx0 + 0.02, y + 0.42, bzF ), CHERRY );
	kit.add( 'cabin', bx( bx0 - 0.03, y, bzF - 0.06, bx0 + 0.03, y + 1.3, bzF ), CHERRY );

	// the head to starboard: the vanity, the sink, the mirror, the shower's glass
	kit.add( 'cabin', bx( - 1.25, y, 1.65, - 0.5, y + 0.8, 2.25 ), CHERRY );
	kit.add( 'cabin', bx( - 1.28, y + 0.8, 1.63, - 0.5, y + 0.84, 2.27 ), COUNTER );
	kit.add( 'cabin', sphere( 0.16, q.low ? 8 : 16, q.low ? 3 : 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2 ).translate( - 0.88, y + 0.83, 1.95 ), { color: 0xf3f1ea, rough: 0.2 } );
	kit.add( 'cabin', bx( - 1.25, y + 1.05, 1.59, - 0.52, y + 1.72, 1.6 ), { color: 0x9db2b8, rough: 0.05, metal: 0.9 } );
	const xHw = Math.min( linerX( L, 3.4, y ), linerX( L, 2.55, y ) ) - 0.02;
	kit.add( 'cabin', bx( - xHw, y, 2.55, - 0.5, y + 0.05, 3.4 ), COUNTER );
	kit.add( 'cabin', bx( - 1.1, y, 2.45, - 0.5, y + 0.42, 2.48 ), COUNTER );
	kit.add( 'cabin', rbx( - 0.92, y, 3.0, - 0.55, y + 0.44, 3.4, 0.08 ), { color: 0xf3f1ea, rough: 0.25 } );

	// the stateroom: the island berth, its foot shaped to the bow, a headboard, lockers either side of the door
	const xB = 0.82, zB0 = 3.95, zB1 = 5.1, N2 = q.low ? 4 : 8;
	const berth = ( h, thick, m ) => {

		const out = [];
		for ( let i = 0; i <= N2; i ++ ) {

			const z = lerp( zB0, zB1, i / N2 );
			out.push( [ Math.min( xB + m, linerX( L, z, h ) - 0.01 ), z ] );

		}

		for ( let i = N2; i >= 0; i -- ) {

			const z = lerp( zB0, zB1, i / N2 );
			out.push( [ - Math.min( xB + m, linerX( L, z, h ) - 0.01 ), z ] );

		}

		return plate( out, [], h, thick );

	};

	kit.add( 'cabin', berth( y + 0.42, 0.42, 0 ), CHERRY );
	kit.add( 'cabin', berth( y + 0.64, 0.22, 0.02 ), { color: 0xd9dadc, rough: 0.95 } );
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'cabin', cushion( s * 0.42 - 0.3, y + 0.62, zB1 - 0.46, s * 0.42 + 0.3, y + 0.78, zB1 - 0.12, 0.06 ), { color: 0xf2f1ee, rough: 0.9 } );
		kit.add( 'cabin', bx( Math.min( s * 0.95, s * 1.34 ), y, 3.5, Math.max( s * 0.95, s * 1.34 ), ceilingY( L, 1.34, 3.86 ) - 0.02, 3.86 ), CHERRY );

	}

	kit.add( 'cabin', bx( - 0.6, y + 0.64, zB1, 0.6, y + 1.2, zB1 + 0.05 ), CHERRY );
	// the hatch over the berth, daylight in it; the lights in the overhead
	kit.add( 'glow', bx( - 0.26, ceilingY( L, 0, 4.55 ) - 0.006, 4.3, 0.26, ceilingY( L, 0, 4.55 ) - 0.002, 4.8 ), { color: 0xeaf3ff, pattern: 5 } );
	if ( ! q.low ) for ( const [ x, z ] of [ [ 0, 2.8 ], [ 1.2, 2.5 ], [ - 1.1, 2.5 ], [ 0.9, 4.1 ], [ - 0.9, 4.1 ] ] ) kit.add( 'glow', cylinder( 0.035, 0.035, 0.006, 8 ).translate( x, ceilingY( L, x, z ) - 0.006, z ), { color: 0xfff1d8, pattern: 5 } );

}

// where a walker's held in the cabins: the bunk room's berths, and the stateroom's

