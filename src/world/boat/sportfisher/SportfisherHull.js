import { BufferGeometry, Float32BufferAttribute, Vector3 } from '../../../engine/index.js';
import { gridSurface, loft, fanCap, orientTowards, slab, box, roundedBox, rod, tube, cylinder, auxVertices } from '../GeoKit.js';
import { sstep, lerp } from '../HullLines.js';
import { SF } from './SportfisherLines.js';

// (M16) Her hull: the shell, skeg, strakes and rubrail, the cockpit with its covering boards, fish boxes and mezzanine, and
// the deck that runs forward round the house to the bow. q: { low } the phones' version: fewer of everything.

export const V = ( x, y, z ) => new Vector3( x, y, z );
export const WHITE = 0xf4f2ec;
export const LINING = 0xefece4;
export const TEAK = { color: 0xb8783f, rough: 0.7, pattern: 2 };
export const STEEL = { color: 0xd8dbde, rough: 0.2, metal: 1 };
export const BLACK = { color: 0x101214, rough: 0.5 };

// a box by its extents
export function bx( x0, y0, z0, x1, y1, z1 ) {

	const g = box( x1 - x0, y1 - y0, z1 - z0 );
	g.translate( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
	return g;

}

export function rbx( x0, y0, z0, x1, y1, z1, r = 0.03, seg = 1 ) {

	const g = roundedBox( x1 - x0, y1 - y0, z1 - z0, r, seg );
	g.translate( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 );
	return g;

}

// a wall across her at z, of ( x, y ) outline with holes in it
export function wallZ( outline, holes, z, thick = 0.05 ) {

	return slab( outline, holes, ( u, v, side ) => V( u, v, z + ( side ? thick : 0 ) ) );

}

// a wall along her at x
export function wallX( outline, holes, x, thick = 0.05 ) {

	return slab( outline, holes, ( u, v, side ) => V( x + ( side ? thick : 0 ) * Math.sign( x || 1 ), v, u ) );

}

// a plate level at y, of ( x, z ) outline
export function plate( outline, holes, y, thick = 0.04 ) {

	return slab( outline, holes, ( u, v, side ) => V( u, y - ( side ? thick : 0 ), v ) );

}

// the deck's height round the house and on the foredeck: her sheer, and a crown that comes in forward of the salon
export function deckY( L, x, z ) {

	const t = L.tAtSheerZ( z ), xe = Math.max( 0.02, L.sheerX( t ) - L.shell ), f = Math.min( 1, Math.abs( x ) / xe );
	const crown = 0.3 * sstep( 2, 3.6, z ) * ( 1 - 0.75 * sstep( 3.6, 8.5, z ) );
	return L.sheerY( t ) + crown * ( 1 - f * f );

}

// the house's half-width at its foot, at z (0 past the foot of the windshield)
export function houseFootX( L, z ) {

	const w0 = houseWallX( L, HOUSE_CORNER, 1.6 );
	if ( z <= HOUSE_CORNER ) return houseWallX( L, z, deckY( L, 2, z ) );
	if ( z >= SF.houseFront ) return 0;
	const s = ( z - HOUSE_CORNER ) / ( SF.houseFront - HOUSE_CORNER );
	return w0 * Math.sqrt( 1 - s * s );

}

export const HOUSE_CORNER = 2.0; // where the house's sides round into its front, at the foot

// the outside of the house's side at ( z, y ): stood in from her sheer, a touch of tumblehome
export function houseWallX( L, z, y ) {

	return L.sheerX( L.tAtSheerZ( Math.min( z, HOUSE_CORNER ) ) ) - SF.sideDeck - 0.06 * Math.max( 0, y - 1.5 );

}

export function buildHull( kit, L, q ) {

	shell( kit, L, q );
	skeg( kit, L, q );
	strakes( kit, L, q );
	rubrail( kit, L, q );
	vents( kit, L, q );
	cockpit( kit, L, q );
	foredeck( kit, L, q );
	bowRail( kit, L, q );

}

function shell( kit, L, q ) {

	const ts = L.stationParams( q.low ? 40 : 74 );
	const rows = ts.map( ( t ) => {

		const r = L.station( t, 1 );
		return q.low ? r.filter( ( _, j ) => j % 2 === 0 ) : r;

	} );
	const uvFn = ( p ) => [ p.z, p.y ];
	kit.add( 'hull', gridSurface( rows, { uvFn } ) );
	kit.add( 'hull', gridSurface( rows.map( ( r ) => r.map( ( p ) => V( - p.x, p.y, p.z ) ) ), { flip: true, uvFn } ) );

	// the transom: flat, as hers is
	const sec = rows[ 0 ], pos = [], uvs = [], idx = [];
	for ( const p of sec ) {

		pos.push( p.x, p.y, p.z, - p.x, p.y, p.z );
		uvs.push( p.x, p.y, - p.x, p.y );

	}

	for ( let j = 0; j < sec.length - 1; j ++ ) {

		const a = 2 * j, b = a + 1, c = a + 2, d = a + 3;
		idx.push( a, b, c, b, d, c );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	orientTowards( g, V( 0, 0, - 1 ) );
	g.computeVertexNormals();
	kit.add( 'hull', g );

}

// her skeg: from the forefoot's run to the deepest of her, under the propellers, keeping them off the ground
const SKEG = [ [ 4.4, - 0.5 ], [ 2.5, - 0.95 ], [ 0.5, - 1.22 ], [ - 1.5, - 1.36 ], [ - 3.6, SF.skeg ], [ - 4.2, - 1.22 ], [ - 4.5, - 0.8 ] ];
const skegAt = ( z ) => {

	for ( let i = 0; i < SKEG.length - 1; i ++ ) if ( z <= SKEG[ i ][ 0 ] && z >= SKEG[ i + 1 ][ 0 ] ) return lerp( SKEG[ i ][ 1 ], SKEG[ i + 1 ][ 1 ], ( SKEG[ i ][ 0 ] - z ) / ( SKEG[ i ][ 0 ] - SKEG[ i + 1 ][ 0 ] ) );
	return - 0.5;

};

export function skegVolume( L ) {

	let v = 0;
	for ( let z = - 4.5; z < 4.4; z += 0.05 ) v += 0.1 * Math.max( 0, - L.draftAt( z ) - skegAt( z ) ) * 0.05;
	return v;

}

function skeg( kit, L, q ) {

	const N = q.low ? 10 : 26, rows = [];
	for ( let i = 0; i <= N; i ++ ) {

		const z = lerp( - 4.5, 4.4, i / N ), yT = - L.draftAt( z ) + 0.04, yB = Math.min( skegAt( z ), yT - 0.02 ), w = lerp( 0.06, 0.025, sstep( 1, 4.4, z ) );
		rows.push( [ V( w, yT, z ), V( w * 0.7, yB + 0.03, z ), V( 0, yB, z ), V( - w * 0.7, yB + 0.03, z ), V( - w, yT, z ) ] );

	}

	const g = loft( rows );
	orientTowards( g, V( 0, - 1, 0 ) );
	kit.add( 'hull', g );
	kit.add( 'hull', fanCap( rows[ 0 ], V( 0, 0, - 1 ) ) );

}

// spray strakes: the two running along her bottom forward, that throw the water flat and down
function strakes( kit, L, q ) {

	const js = q.low ? [ 5 ] : [ 3, 6 ], N = q.low ? 14 : 30;
	for ( const j of js ) for ( const s of [ 1, - 1 ] ) {

		const rows = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( 0.42, 0.94, i / N ), st = L.station( t, 1 ), p = st[ j ], a = st[ j - 1 ], b = st[ j + 1 ];
			const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot( dx, dy ) || 1, nx = dy / len, ny = - dx / len;
			const h = 0.035 * Math.sin( Math.PI * Math.min( 1, ( i / N ) * 1.02 ) );
			rows.push( [ V( s * ( p.x - dx / len * 0.04 ), p.y - dy / len * 0.04, p.z ), V( s * ( p.x + nx * h ), p.y + ny * h, p.z ), V( s * ( p.x + dx / len * 0.04 ), p.y + dy / len * 0.04, p.z ) ] );

		}

		const g = loft( rows );
		orientTowards( g, V( s * 0.5, - 1, 0 ) );
		kit.add( 'hull', g );

	}

}

// a slim moulded rubrail with a steel strip, just under the sheer
function rubrail( kit, L, q ) {

	const N = q.low ? 24 : 60;
	for ( const s of [ 1, - 1 ] ) {

		const rows = [], strip = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( 0.002, 0.985, 1 - Math.pow( 1 - i / N, 1.3 ) ), y = L.sheerY( t ) - 0.06, x = L.halfBreadth( t, y ), z = L.zOnStation( t, y );
			rows.push( [ V( s * ( x - 0.005 ), y - 0.035, z ), V( s * ( x + 0.03 ), y - 0.022, z ), V( s * ( x + 0.038 ), y, z ), V( s * ( x + 0.03 ), y + 0.022, z ), V( s * ( x - 0.005 ), y + 0.035, z ) ] );
			strip.push( V( s * ( x + 0.04 ), y, z ) );

		}

		const g = loft( rows );
		orientTowards( g, V( s, 0, 0 ) );
		kit.add( 'gelcoat', g, { color: WHITE, rough: 0.25 } );
		if ( ! q.low ) kit.add( 'fittings', tube( strip, 0.007, 80, 3 ), STEEL );

	}

}

// the engine room's vents, let into her sides aft of the bridge: a row of dark slats
function vents( kit, L, q ) {

	const n = q.low ? 4 : 7, z0 = - 1.9, z1 = - 0.5;
	for ( const s of [ 1, - 1 ] ) for ( let i = 0; i < n; i ++ ) {

		const y = 0.86 + i * 0.038, f = i / n, zA = z0 + 0.1 * f, zF = z1 - 0.1 * f;
		const a = L.hullXAt( zA, y ) + 0.002, c = L.hullXAt( zF, y ) + 0.002;
		kit.add( 'fittings', rod( V( s * a, y, zA ), V( s * c, y, zF ), 0.009, 3 ), { color: 0x24272a, rough: 0.6 } );

	}

}

// what's inside the covering board at z: the cockpit's side
const innerX = ( L, z ) => L.sheerX( L.tAtSheerZ( z ) ) - SF.gunwale;
const TRANSOM_T = 0.2; // through the transom, its cap

function cockpit( kit, L, q ) {

	const zT = L.zAft + TRANSOM_T, zF = SF.houseAft;

	// the sides: from the sole up to the covering board, a toe-kick let in along the bottom
	const NS = q.low ? 8 : 20;
	for ( const s of [ 1, - 1 ] ) {

		const rows = [];
		for ( let i = 0; i <= NS; i ++ ) {

			const z = lerp( zT, zF, i / NS ), top = L.sheerY( L.tAtSheerZ( z ) ), xi = innerX( L, z );
			rows.push( [ [ xi + 0.06, SF.cockpit ], [ xi + 0.06, SF.cockpit + 0.12 ], [ xi, SF.cockpit + 0.14 ], [ xi - 0.012, ( SF.cockpit + top ) / 2 ], [ xi, top - 0.05 ] ].map( ( [ x, y ] ) => V( s * x, y, z ) ) );

		}

		const g = gridSurface( rows );
		orientTowards( g, V( - s, 0, 0 ) );
		g.computeVertexNormals();
		kit.add( 'gelcoat', g, { color: LINING, rough: 0.35 } );

		// the covering board: wide, moulded and rounded, round to the transom and on to the house
		const NC = q.low ? 10 : 30, cap = [];
		for ( let i = 0; i <= NC; i ++ ) {

			const z = lerp( L.zAft + 0.03, zF, i / NC ), t = L.tAtSheerZ( z ), y = L.sheerY( t ), xi = innerX( L, z ), xo = L.sheerX( t ) + 0.01;
			cap.push( [ [ xi, y - 0.06 ], [ xi + 0.012, y - 0.012 ], [ xi + 0.05, y ], [ xo - 0.03, y ], [ xo, y - 0.02 ], [ xo, y - 0.05 ] ].map( ( [ x, h ] ) => V( s * x, h, z ) ) );

		}

		const gc = loft( cap );
		orientTowards( gc, V( 0, 1, 0 ) );
		kit.add( 'gelcoat', gc, { color: WHITE, rough: 0.3 } );

	}

	// the transom's inside, and its cap: a door to starboard (let in, its seam and catch)
	const tTop = L.sheerY( 0 ), hw = L.sheerX( 0 ), inner = innerX( L, zT );
	const inside = wallZ( [ [ - inner - 0.06, SF.cockpit ], [ inner + 0.06, SF.cockpit ], [ inner, tTop - 0.05 ], [ - inner, tTop - 0.05 ] ], [], zT, 0.02 );
	kit.add( 'gelcoat', inside, { color: LINING, rough: 0.35 } );
	const capT = gridSurface( [ - 1, - 0.5, 0, 0.5, 1 ].map( ( f ) => [ V( f * hw, tTop - 0.05, L.zAft - 0.01 ), V( f * hw, tTop, L.zAft + 0.02 ), V( f * hw, tTop, zT - 0.03 ), V( f * hw, tTop - 0.05, zT + 0.005 ) ] ) );
	orientTowards( capT, V( 0, 1, 0 ) );
	kit.add( 'gelcoat', capT, { color: WHITE, rough: 0.3 } );
	const door = [ - inner + 0.12, - inner + 0.72 ];
	for ( const x of door ) kit.add( 'fittings', bx( x - 0.006, SF.cockpit + 0.04, zT + 0.02, x + 0.006, tTop - 0.08, zT + 0.024 ), BLACK );
	kit.add( 'fittings', bx( door[ 0 ], tTop - 0.086, zT + 0.02, door[ 1 ], tTop - 0.074, zT + 0.024 ), BLACK );
	if ( ! q.low ) kit.add( 'fittings', rbx( door[ 1 ] - 0.1, ( SF.cockpit + tTop ) / 2, zT + 0.02, door[ 1 ] - 0.03, ( SF.cockpit + tTop ) / 2 + 0.14, zT + 0.05, 0.008 ), STEEL );

	// the sole: planks, a raised margin, her fish boxes let in side by side at the stern, the hatch to the engines ahead of them
	const NX = q.low ? 6 : 12, NZ = q.low ? 4 : 10, sole = [];
	for ( let i = 0; i <= NZ; i ++ ) {

		const z = lerp( zT, SF.mezzZ - 0.26, i / NZ ), xe = innerX( L, z ) + 0.06, row = [];
		for ( let k = 0; k <= NX; k ++ ) row.push( V( lerp( xe, - xe, k / NX ), SF.cockpit, z ) );
		sole.push( row );

	}

	const gs = gridSurface( sole, { uvFn: ( p ) => [ p.x, p.z ] } );
	orientTowards( gs, V( 0, 1, 0 ) );
	gs.computeVertexNormals();
	kit.add( 'gelcoat', gs, TEAK );
	const frame = ( x0, z0, x1, z1, w = 0.05 ) => {

		for ( const b of [ [ x0, z0, x1, z0 + w ], [ x0, z1 - w, x1, z1 ], [ x0, z0, x0 + w, z1 ], [ x1 - w, z0, x1, z1 ] ] ) kit.add( 'gelcoat', bx( b[ 0 ], SF.cockpit, b[ 1 ], b[ 2 ], SF.cockpit + 0.012, b[ 3 ] ), { color: 0xf0ece0, rough: 0.4 } );

	};

	for ( const s of [ 1, - 1 ] ) {

		frame( s > 0 ? 0.12 : - 1.17, zT + 0.28, s > 0 ? 1.17 : - 0.12, zT + 1.14 );
		if ( ! q.low ) kit.add( 'fittings', rod( V( s * 0.65 - 0.06, SF.cockpit + 0.016, zT + 1.05 ), V( s * 0.65 + 0.06, SF.cockpit + 0.016, zT + 1.05 ), 0.006, 5 ), STEEL );

	}

	frame( - 0.62, zT + 1.5, 0.62, zT + 2.3 );

	// the step up and the mezzanine: its risers, its sole, and the boxes either side (tackle to port, a freezer to starboard)
	const step = SF.mezzZ - 0.26, m = SF.mezz, mid = ( SF.cockpit + m ) / 2, half = 1.12;
	kit.add( 'gelcoat', bx( - half, SF.cockpit, step, half, mid - 0.012, step + 0.26 ), { color: LINING, rough: 0.35 } );
	kit.add( 'gelcoat', bx( - half + 0.03, mid - 0.012, step + 0.015, half - 0.03, mid, step + 0.26 ), TEAK );
	kit.add( 'gelcoat', bx( - half, mid, SF.mezzZ, half, m - 0.012, SF.mezzZ + 0.2 ), { color: LINING, rough: 0.35 } );
	const ix = innerX( L, SF.mezzZ ) + 0.02;
	kit.add( 'gelcoat', plate( [ [ - half, SF.mezzZ ], [ half, SF.mezzZ ], [ half, SF.houseAft ], [ - half, SF.houseAft ] ], [], m ), TEAK );
	for ( const s of [ 1, - 1 ] ) {

		const x0 = Math.min( s * half, s * ix ), x1 = Math.max( s * half, s * ix ), top = 1.26;
		kit.add( 'gelcoat', bx( x0, SF.cockpit, SF.mezzZ - 0.26, x1, top - 0.04, SF.houseAft ), { color: LINING, rough: 0.35 } );
		kit.add( 'gelcoat', rbx( x0 - 0.01, top - 0.05, SF.mezzZ - 0.28, x1 + 0.01, top, SF.houseAft, 0.02 ), { color: WHITE, rough: 0.3 } );
		if ( ! q.low ) {

			// drawers and lockers, as seams and pulls on its face
			for ( let k = 0; k < 4; k ++ ) kit.add( 'fittings', bx( s > 0 ? x0 + 0.1 : x1 - 0.5, 0.62 + k * 0.13, SF.mezzZ - 0.265, s > 0 ? x0 + 0.5 : x1 - 0.1, 0.63 + k * 0.13, SF.mezzZ - 0.26 ), BLACK );

		}

	}

	// rod holders along the covering boards, three a side: what the spread's rods go in
	for ( const z of [ - 5.5, - 4.5, - 3.6 ] ) for ( const s of [ 1, - 1 ] ) {

		const x = s * ( L.sheerX( L.tAtSheerZ( z ) ) - 0.12 ), y = L.sheerY( L.tAtSheerZ( z ) ), tube0 = cylinder( 0.03, 0.03, 0.04, q.low ? 6 : 12, 1, true );
		tube0.translate( x, y + 0.005, z );
		kit.add( 'fittings', tube0, STEEL );

	}

	// the fighting chair's pedestal plate, where it's bolted (the chair's her own mesh: an upgrade)
	const pl = cylinder( 0.26, 0.26, 0.012, q.low ? 10 : 24 );
	pl.translate( 0, SF.cockpit + 0.006, CHAIR_Z );
	kit.add( 'fittings', pl, STEEL );

}

export const CHAIR_Z = - 4.55;

// round the house and over the foredeck, to the stem head
function foredeck( kit, L, q ) {

	const N = q.low ? 26 : 62, NX = q.low ? 5 : 10;
	for ( const s of [ 1, - 1 ] ) {

		const rows = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( L.tAtSheerZ( SF.houseAft ), 0.997, i / N ), z = L.sheerZ( t ), xe = Math.max( 0.005, L.sheerX( t ) - 0.005 ), xin = Math.min( xe, houseFootX( L, z ) - 0.02 ), row = [];
			for ( let k = 0; k <= NX; k ++ ) {

				const x = lerp( xe, Math.max( 0, xin ), k / NX );
				row.push( V( s * x, deckY( L, x, z ) + ( x > xe - 0.002 ? - 0.015 : 0 ), z ) );

			}

			rows.push( row );

		}

		const g = gridSurface( rows, { uvFn: ( p ) => [ p.x, p.z ] } );
		orientTowards( g, V( 0, 1, 0 ) );
		g.computeVertexNormals();
		auxVertices( g, () => [ 0.42, 0, 1, 0 ] );
		kit.add( 'gelcoat', g, { color: 0xf0ede4 } );

	}

	// hatches on the foredeck: the forward stateroom's, and the anchor locker's
	for ( const [ z, hw, hl ] of [ [ 4.55, 0.33, 0.33 ], [ 7.05, 0.2, 0.22 ] ] ) {

		const y = deckY( L, 0, z ) + 0.02;
		kit.add( 'gelcoat', rbx( - hw, y - 0.05, z - hl, hw, y + 0.015, z + hl, 0.02 ), { color: 0xe6e3da, rough: 0.3 } );
		if ( z < 5 ) kit.add( 'fittings', bx( - hw + 0.04, y, z - hl + 0.04, hw - 0.04, y + 0.019, z + hl - 0.04 ), { color: 0x0b0f12, rough: 0.06 } );

	}

	// cleats and the windlass
	for ( const [ x, z ] of [ [ 0.5, 6.0 ], [ - 0.5, 6.0 ], [ 1.45, - 2.0 ], [ - 1.45, - 2.0 ] ] ) {

		const y = deckY( L, x, z ) + 0.03;
		kit.add( 'fittings', rbx( x - 0.02, y - 0.03, z - 0.11, x + 0.02, y + 0.012, z + 0.11, 0.01 ), STEEL );

	}

	kit.add( 'fittings', cylinder( 0.1, 0.12, 0.18, q.low ? 8 : 16 ).translate( 0, deckY( L, 0, 7.5 ) + 0.09, 7.5 ), { color: 0x2b2d30, rough: 0.5 } );

}

// the bow rail: stanchions from the house's corner to a pulpit at the stem head, high and thin as they are
function bowRail( kit, L, q ) {

	const zs = [], N = q.low ? 6 : 10;
	for ( let i = 0; i <= N; i ++ ) zs.push( lerp( 2.2, 8.1, i / N ) );
	const H = 0.66, r = 0.0125, rad = q.low ? 4 : 7;
	const railAt = ( z, s, h ) => {

		const t = L.tAtSheerZ( z ), x = L.sheerX( t ) - 0.09;
		return V( s * x, deckY( L, x, z ) + h, z );

	};

	for ( const s of [ 1, - 1 ] ) {

		const top = zs.map( ( z ) => railAt( z, s, H ) );
		top.push( V( 0, deckY( L, 0, 8.32 ) + H, 8.32 ) );
		kit.add( 'fittings', tube( top, r, q.low ? 18 : 44, rad ), STEEL );
		if ( ! q.low ) kit.add( 'fittings', tube( zs.map( ( z ) => railAt( z, s, H * 0.55 ) ), 0.008, 30, 5 ), STEEL );
		for ( const z of zs ) kit.add( 'fittings', rod( railAt( z, s, 0 ), railAt( z, s, H ), 0.012, rad ), STEEL );

	}

	// (and back along the sides from the house's corner to the cockpit: her grab rail)
	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', rod( railAt( 2.2, s, H ), railAt( - 1.2, s, 0.5 ), r, rad ), STEEL );

}
