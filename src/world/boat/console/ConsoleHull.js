import { Vector3, Float32BufferAttribute, BufferGeometry } from '../../../engine/index.js';
import { gridSurface, loft, fanCap, box, rod, tube, torus, cylinder, auxVertices } from '../GeoKit.js';
import { sstep, lerp } from '../HullLines.js';
import { solid, rounded, softCorners } from './Mould.js';
import { SURFACE } from './ConsoleMaterials.js';

// (M16) Her hull and decks, after the Regulator 23's plan and photographs (docs/m16/console.md): the shell with its strakes
// and hard chine; the wide gunwales and their coamings; a sole all the way round the helm; forward, the U of raised seats
// about a sunk sole that you fish from, and the foredeck; aft, the box across the transom with its door to the platform,
// the bracket and its mat, where the outboards hang.

const V = ( x, y, z ) => new Vector3( x, y, z );
const WHITE = 0xece8db, COAMING = 0xe6e1d3;
export const GEL = { color: WHITE, rough: 0.34 };
const STAINLESS = { color: 0xcfd3d6, rough: 0.2, metal: 1 };
const DARK = { color: 0x17181a, rough: 0.6 };

// where things are on her (boat frame)
export const DECK = {
	sole: 0.32,
	boxFront: - 2.5, // the box across the transom, its front
	boxTop: 1.0,
	door: [ - 1.02, - 0.46 ], // the door through it, on her starboard side
	sill: - 2.72, // where its floor steps up to the mat
	platform: { y: 0.5, zEnd: - 3.66, halfW: 0.84 }, // the bracket's mat
	bench: { z0: 1.5, z1: 3.02, y: 0.67 },
	riser: { z1: 3.3, y: 1.02 },
};

// the inside of her at this station and height (her bow's stations lean: tAt says which it is)
export const hullAt = ( L, z, y ) => L.halfBreadth( L.tAt( z, y ), y );
export const soleEdge = ( L, z, y = DECK.sole ) => hullAt( L, z, y ) - L.shell;

export function buildHull( kit, L ) {

	shell( kit, L );
	transom( kit, L );
	bracket( kit, L );
	gunwales( kit, L );
	decks( kit, L );
	bow( kit, L );
	aftBox( kit, L );
	rubrail( kit, L );
	hardware( kit, L );

}

// ------------------------------------------------------------------ the shell, panel by panel so its edges are hard

function shell( kit, L ) {

	const ts = L.stationParams( 44 ), panels = L.panels( 1 );
	const stations = ts.map( ( t ) => L.station( t, 1 ) );
	for ( const P of panels ) {

		const rows = stations.map( ( r ) => r.slice( P.from, P.to + 1 ) );
		const nj = P.to - P.from + 1, top = P.name === 'topsides';
		for ( const s of [ 1, - 1 ] ) {

			const g = gridSurface( s > 0 ? rows : rows.map( ( r ) => r.map( ( p ) => V( - p.x, p.y, p.z ) ) ), { flip: s < 0 } );
			auxVertices( g, ( p, k ) => top ? [ 0.2, 0, SURFACE.topsides, ( k % nj ) / ( nj - 1 ) ] : [ 0.3, 0, SURFACE.bottom, 0 ] );
			kit.add( 'hull', g );

		}

	}

}

// her transom's lower part: the hull's t = 0 section across, up to the platform (the box above: aftBox)
function transom( kit, L ) {

	const sec = L.station( 0, 1 ), y1 = DECK.platform.y + 0.02;
	const rows = sec.filter( ( p ) => p.y <= y1 );
	const pos = [], idx = [];
	for ( const p of rows ) pos.push( p.x, p.y, p.z, - p.x, p.y, p.z );
	const x1 = L.halfBreadth( 0, y1 );
	pos.push( x1, y1, L.zAft, - x1, y1, L.zAft );
	const n = pos.length / 6;
	for ( let j = 0; j < n - 1; j ++ ) idx.push( 2 * j, 2 * j + 2, 2 * j + 1, 2 * j + 1, 2 * j + 2, 2 * j + 3 );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// (painted as her sides are, down to the chine)
	auxVertices( g, ( p ) => p.y > 0.1 ? [ 0.2, 0, SURFACE.topsides, 0.6 ] : [ 0.3, 0, SURFACE.bottom, 0 ] );
	kit.add( 'hull', g );

}

// the bracket: the hull carried on aft as a pod, its top a mat you can stand on, the engines on its after face
function bracket( kit, L ) {

	const P = DECK.platform, z0 = L.zAft + 0.02, z1 = P.zEnd, N = 8, rows = [];
	for ( let i = 0; i <= N; i ++ ) {

		const u = i / N, z = lerp( z0, z1, u ), w = lerp( P.halfW + 0.04, P.halfW - 0.02, u ) * ( 1 - 0.1 * sstep( 0.8, 1, u ) );
		const keel = lerp( - 0.42, - 0.2, u ), chine = lerp( 0.02, 0.1, u );
		// from the keel round the port side to the top's middle: a V under, a side, a soft shoulder
		const half = [ [ 0, keel ], [ w * 0.45, lerp( keel, chine, 0.42 ) ], [ w * 0.9, chine ], [ w, chine + 0.03 ], [ w, P.y - 0.06 ], [ w - 0.02, P.y - 0.02 ], [ w - 0.05, P.y ], [ 0, P.y + 0.005 ] ];
		rows.push( half.map( ( h ) => V( h[ 0 ], h[ 1 ], z ) ) );

	}

	for ( const s of [ 1, - 1 ] ) {

		const r = s > 0 ? rows : rows.map( ( q ) => q.map( ( p ) => V( - p.x, p.y, p.z ) ) );
		const g = gridSurface( r, { flip: s > 0 } );
		auxVertices( g, ( p ) => p.y > 0.06 ? [ 0.2, 0, SURFACE.topsides, 0.6 ] : [ 0.3, 0, SURFACE.bottom, 0 ] );
		kit.add( 'hull', g );

	}

	// its after face, the engines' plate
	const last = rows[ N ], loop = [ ...last.slice( 0, - 1 ), ...last.slice( 1, - 1 ).reverse().map( ( p ) => V( - p.x, p.y, p.z ) ) ];
	const cap = fanCap( loop, V( 0, 0, - 1 ) );
	auxVertices( cap, ( p ) => p.y > 0.06 ? [ 0.2, 0, SURFACE.topsides, 0.6 ] : [ 0.3, 0, SURFACE.bottom, 0 ] );
	kit.add( 'hull', cap );
	// the mat
	const out = softCorners( [ [ - P.halfW + 0.09, z0 - 0.04 ], [ P.halfW - 0.09, z0 - 0.04 ], [ P.halfW - 0.09, z1 + 0.05 ], [ - P.halfW + 0.09, z1 + 0.05 ] ], 0.07 );
	const mat = solid( out, P.y, P.y + 0.012, 0.004, ( u, v, d ) => V( u, d, v ), { rings: 1 } );
	auxVertices( mat, () => [ 0.85, 0, SURFACE.mat, 0 ] );
	kit.add( 'hull', mat );

}

// ------------------------------------------------------------------ gunwales: the cap, its lip and the coaming down to the toe rail

function gunwales( kit, L ) {

	const N = 46, tEnd = 0.965;
	const coamBase = ( t ) => {

		// the coaming comes down to the sole aft; forward of the seats, to the seat's top
		const z = L.sheerZ( t );
		return lerp( DECK.sole, DECK.bench.y - 0.05, sstep( DECK.bench.z0 - 0.15, DECK.bench.z0 + 0.1, z ) ) + 0.5 * sstep( DECK.bench.z1, DECK.riser.z1 + 0.3, z );

	};

	for ( const s of [ 1, - 1 ] ) {

		const profiles = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( 0, tEnd, 1 - Math.pow( 1 - i / N, 1.2 ) );
			const z = L.sheerZ( t ), xo = L.sheerX( t ), yo = L.sheerY( t );
			const w = lerp( 0.2, 0.075, sstep( 0.55, 0.96, t ) );
			const xi = Math.max( 0.015, xo - w ), yb = coamBase( t );
			const xb = Math.max( 0.012, Math.min( xi - 0.006, hullAt( L, z, yb ) - L.shell ) );
			const m = ( a, b, f ) => lerp( a, b, f );
			const pts = [
				[ xo + 0.004, yo - 0.05 ], [ xo + 0.006, yo - 0.008 ], [ xo - 0.008, yo + 0.012 ], [ xo - 0.03, yo + 0.02 ],
				[ m( xo, xi, 0.5 ), yo + 0.024 ], [ xi + 0.022, yo + 0.018 ], [ xi + 0.002, yo + 0.002 ], [ xi - 0.006, yo - 0.03 ], [ xi - 0.008, yo - 0.07 ],
				[ m( xi, xb, 0.55 ), m( yo, yb, 0.55 ) ], [ xb, yb + 0.13 ], [ xb + 0.004, yb + 0.1 ], [ xb + 0.05, yb + 0.085 ], [ xb + 0.052, yb - 0.02 ],
			];
			// (her stations lean at the bow: at this z the hull's narrower low down than at the sheer, so nothing's let through it)
			profiles.push( pts.map( ( p, j ) => V( s * ( j < 4 ? p[ 0 ] : Math.min( p[ 0 ], hullAt( L, z, Math.min( p[ 1 ], yo - 0.02 ) ) - 0.012 ) ), p[ 1 ], z ) ) );

		}

		const g = gridSurface( profiles, { flip: s < 0 } );
		const cap = 8;
		auxVertices( g, ( p, k ) => k % 14 > cap ? [ 0.42, 0, SURFACE.plain, 0 ] : [ 0.3, 0, SURFACE.plain, 0 ] );
		kit.add( 'hull', g, { color: COAMING } );

	}

}

// ------------------------------------------------------------------ the sole, all the way round

function decks( kit, L ) {

	const z0 = DECK.boxFront - 0.01, z1 = 2.62, N = 30, NX = 4, rows = [];
	for ( let i = 0; i <= N; i ++ ) {

		const z = lerp( z0, z1, i / N ), e = Math.max( 0.02, Math.min( soleEdge( L, z ) + 0.06, hullAt( L, z, DECK.sole ) - 0.015 ) ), row = [];
		for ( let k = 0; k <= NX; k ++ ) row.push( V( lerp( e, - e, k / NX ), DECK.sole, z ) );
		rows.push( row );

	}

	const g = gridSurface( rows, {} );
	g.computeVertexNormals();
	if ( g.attributes.normal.getY( 0 ) < 0 ) {

		const a = Array.from( g.index.array );
		for ( let i = 0; i < a.length; i += 3 ) [ a[ i + 1 ], a[ i + 2 ] ] = [ a[ i + 2 ], a[ i + 1 ] ];
		g.setIndex( a );
		g.computeVertexNormals();

	}

	auxVertices( g, () => [ 0.7, 0, SURFACE.nonSkid, 0 ] );
	kit.add( 'hull', g, { color: 0xe2ddcf } );

	// her in-sole fish box aft and the forward box's hatch: a raised lip, a flush lid and its pull
	for ( const [ cz, hw, hz ] of [ [ - 2.08, 0.42, 0.3 ], [ 1.72, 0.26, 0.32 ] ] ) {

		const h = solid( rounded( - hw, cz - hz, hw, cz + hz, 0.05 ), DECK.sole, DECK.sole + 0.012, 0.005, ( u, v, d ) => V( u, d, v ), { rings: 1 } );
		kit.add( 'hull', h, { color: 0xdedacb, rough: 0.4 } );
		kit.add( 'fittings', torus( 0.022, 0.005, 5, 12 ).rotateX( Math.PI / 2 ).translate( 0, DECK.sole + 0.016, cz ), STAINLESS );

	}

}

// ------------------------------------------------------------------ the bow: the seats' U about the sunk sole, the riser and foredeck

function bow( kit, L ) {

	const B = DECK.bench, S = DECK.sole, under = B.y - 0.16;
	// how far out a seat's slab goes: inside the hull at its underside, the coaming closing it above
	const edge = ( z ) => Math.max( 0.04, hullAt( L, z, under ) - 0.03 );
	// the walkway's half-width between them, on the plan: 0.42 m at their after ends, closing at z 2.56
	const inner = ( z ) => 0.42 * Math.max( 0, 1 - ( z - B.z0 ) / ( 2.56 - B.z0 ) );
	// the seats' U in one piece, round the sunk sole from one after end to the other
	const N = 12, outline = [], cushion = [];
	const zAt = ( i ) => lerp( B.z0, B.z1, i / N );
	for ( let i = 0; i <= N; i ++ ) {

		outline.push( [ edge( zAt( i ) ), zAt( i ) ] );
		cushion.push( [ Math.max( Math.min( edge( zAt( i ) ), soleEdge( L, zAt( i ), B.y ) + 0.03 ), 0.04 ), zAt( i ) - ( i === N ? 0.015 : 0 ) ] );

	}

	for ( let i = N; i >= 0; i -- ) {

		outline.push( [ - edge( zAt( i ) ), zAt( i ) ] );
		cushion.push( [ - Math.max( Math.min( edge( zAt( i ) ), soleEdge( L, zAt( i ), B.y ) + 0.03 ), 0.04 ), zAt( i ) - ( i === N ? 0.015 : 0 ) ] );

	}

	// (back along the walkway's two sides to its head)
	const WALK = 6;
	for ( let i = 0; i <= WALK; i ++ ) {

		const z = lerp( B.z0, 2.56, i / WALK );
		outline.push( [ - inner( z ), z ] );
		cushion.push( [ - inner( z ) - 0.025, z + 0.03 ] );

	}

	for ( let i = WALK - 1; i >= 0; i -- ) {

		const z = lerp( B.z0, 2.56, i / WALK );
		outline.push( [ inner( z ), z ] );
		cushion.push( [ inner( z ) + 0.025, z + 0.03 ] );

	}

	kit.add( 'hull', solid( outline, under, B.y - 0.05, 0.012, ( u, v, d ) => V( u, d, v ), { rings: 1 } ), GEL );
	kit.add( 'fittings', solid( cushion, B.y - 0.055, B.y, 0.018, ( u, v, d ) => V( u, d, v ) ), { color: 0xe9e3d3, rough: 0.6 } );
	// the seats' faces down to the sole, along the walkway and at their after ends
	for ( const s of [ 1, - 1 ] ) {

		const foot = [];
		for ( let i = 0; i <= WALK; i ++ ) foot.push( [ s * inner( lerp( B.z0, 2.56, i / WALK ) ), lerp( B.z0, 2.56, i / WALK ) ] );
		for ( let i = WALK; i >= 0; i -- ) foot.push( [ s * ( inner( lerp( B.z0, 2.56, i / WALK ) ) + 0.05 ), lerp( B.z0, 2.56, i / WALK ) ] );
		kit.add( 'hull', solid( foot, S, under + 0.02, 0.006, ( u, v, d ) => V( u, d, v ), { rings: 1 } ), GEL );
		const e0 = soleEdge( L, B.z0, S ) + 0.06, i0 = inner( B.z0 );
		kit.add( 'hull', solid( [ [ s * i0, B.z0 ], [ s * e0, B.z0 ], [ s * e0, B.z0 + 0.05 ], [ s * i0, B.z0 + 0.05 ] ], S, under + 0.02, 0.006, ( u, v, d ) => V( u, d, v ), { rings: 1 } ), GEL );

	}

	// the riser across the bow, its speakers facing aft; the foredeck, cambered, from its top to the stem
	// (its sides inside her at its foot: forward of about z 3.3 the stem's gone from under y 0.5)
	const R = DECK.riser, yr = B.y - 0.07, yb = 0.8, face = hullAt( L, B.z1 + 0.06, yr ) - 0.03;
	kit.add( 'hull', solid( rounded( - face, yr, face, R.y, 0.02 ), B.z1, B.z1 + 0.06, 0.012, ( u, v, d ) => V( u, v, d ) ), GEL );
	const wr = hullAt( L, B.z1, yb ) - 0.03, wf = hullAt( L, R.z1, yb ) - 0.03;
	kit.add( 'hull', solid( [ [ - wr, B.z1 + 0.02 ], [ wr, B.z1 + 0.02 ], [ wf, R.z1 ], [ - wf, R.z1 ] ], yb, R.y, 0.015, ( u, v, d ) => V( u, d, v ), { rings: 1 } ), GEL );
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'fittings', cylinder( 0.058, 0.066, 0.012, 16 ).rotateX( Math.PI / 2 ).translate( s * 0.21, ( yr + R.y ) / 2 + 0.02, B.z1 - 0.008 ), { color: 0x8d9095, rough: 0.5 } );

	}

	const tF = L.tAtSheerZ( R.z1 - 0.02 ), rows = [], NF = 16, NX = 8;
	for ( let i = 0; i <= NF; i ++ ) {

		const t = lerp( tF, 0.985, 1 - Math.pow( 1 - i / NF, 1.2 ) ), z = L.sheerZ( t ), e = Math.max( 0.008, L.sheerX( t ) - 0.03 ), row = [];
		for ( let k = 0; k <= NX; k ++ ) {

			const x = lerp( e, - e, k / NX ), f = x / e;
			row.push( V( x, L.sheerY( t ) + 0.018 + 0.03 * ( 1 - f * f ), z ) );

		}

		rows.push( row );

	}

	const g = gridSurface( rows, {} );
	if ( g.attributes.normal.getY( Math.floor( NX / 2 ) + ( NX + 1 ) * 8 ) < 0 ) {

		const a = Array.from( g.index.array );
		for ( let i = 0; i < a.length; i += 3 ) [ a[ i + 1 ], a[ i + 2 ] ] = [ a[ i + 2 ], a[ i + 1 ] ];
		g.setIndex( a );
		g.computeVertexNormals();

	}

	kit.add( 'hull', g, GEL );
	// the wall from the riser's top up to the foredeck, and the riser's top as a step
	const yF = L.sheerY( tF ) + 0.03, zw = R.z1 + 0.14, side = [];
	// (following her flare, as a straight side would come through it)
	for ( let i = 0; i <= 5; i ++ ) {

		const y = lerp( R.y - 0.05, yF, i / 5 );
		side.push( [ hullAt( L, zw, y ) - 0.03, y ] );

	}

	const wall = solid( [ ...side.map( ( p ) => [ - p[ 0 ], p[ 1 ] ] ), ...side.slice().reverse() ], R.z1 - 0.02, zw, 0.008, ( u, v, d ) => V( u, v, d ), { rings: 1 } );
	kit.add( 'hull', wall, GEL );
	// the anchor locker's lid, the stem's roller and anchor
	const zh = 3.72, yh = L.sheerY( L.tAtSheerZ( zh ) ) + 0.05;
	const lid = solid( rounded( - 0.16, zh - 0.22, 0.16, zh + 0.14, 0.04 ), yh - 0.012, yh + 0.012, 0.006, ( u, v, d ) => V( u, d + 0.02 * ( zh - v ) * 0.6, v ), { rings: 1 } );
	kit.add( 'hull', lid, { color: 0xdedacb, rough: 0.4 } );
	kit.add( 'fittings', torus( 0.02, 0.005, 5, 12 ).rotateX( Math.PI / 2 ).translate( 0, yh + 0.02, zh ), STAINLESS );
	stemFitting( kit, L );

}

function stemFitting( kit, L ) {

	const y = L.sheerY( 1 ), z = L.zBow, pitch = 0.3;
	// the stainless plate over the stem head and its roller, a little past it
	const plate = solid( softCorners( [ [ - 0.045, z - 0.3 ], [ 0.045, z - 0.3 ], [ 0.045, z + 0.02 ], [ 0.03, z + 0.08 ], [ - 0.03, z + 0.08 ], [ - 0.045, z + 0.02 ] ], 0.012 ), y + 0.005, y + 0.018, 0.004, ( u, v, d ) => V( u, d + ( z - v ) * - pitch, v ), { rings: 1 } );
	kit.add( 'fittings', plate, STAINLESS );
	kit.add( 'fittings', rod( V( - 0.035, y + 0.002, z + 0.07 ), V( 0.035, y + 0.002, z + 0.07 ), 0.018, 10 ), { color: 0x24262a, rough: 0.5 } );
	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', box( 0.005, 0.045, 0.1 ).translate( s * 0.038, y + 0.002, z + 0.04 ), STAINLESS );
	// the anchor, its shank back over the plate, its flukes hanging at the stem ((M19) its own fitting, so it's not drawn on the
	// roller while it's down: ConsoleModel.setAnchorStowed)
	const was = kit.fitting;
	kit.fitting = 'anchorStowed';
	const shankTop = V( 0, y + 0.06, z - 0.32 ), crown = V( 0, y - 0.055, z + 0.1 );
	kit.add( 'fittings', rod( shankTop, crown, 0.009, 6 ), STAINLESS );
	for ( const s of [ 1, - 1 ] ) {

		const f = solid( [ [ 0, 0 ], [ 0.085, 0.01 ], [ 0.08, 0.13 ], [ 0.02, 0.11 ] ], - 0.0025, 0.0025, 0.001, ( u, v, d ) => V( s * ( u + 0.006 ), crown.y - v * 0.95 + d, crown.z - v * 0.2 ), { rings: 1 } );
		kit.add( 'fittings', f, STAINLESS );

	}

	kit.fitting = was;

}

// ------------------------------------------------------------------ the box across the transom: each side of the door

function aftBox( kit, L ) {

	const z0 = L.zAft + 0.02, z1 = DECK.boxFront, top = DECK.boxTop, D = DECK.door, inX = 1.17;
	const parts = [ [ D[ 1 ], inX ], [ - inX, D[ 0 ] ] ];
	for ( const [ x0, x1 ] of parts ) {

		const outline = rounded( z0, DECK.sole - 0.02, z1, top, 0.05 );
		const g = solid( outline, x0, x1, 0.022, ( u, v, d ) => V( d, v, u ) );
		kit.add( 'hull', g, GEL );

	}

	// the door's floor, a step up to the mat at its after end
	const P = DECK.platform, sill = DECK.sill;
	const floor = solid( rounded( D[ 0 ] - 0.01, z0 - 0.01, D[ 1 ] + 0.01, z1 + 0.01, 0.01 ), DECK.sole - 0.03, DECK.sole, 0.004, ( u, v, d ) => V( u, d, v ), { rings: 1 } );
	auxVertices( floor, () => [ 0.7, 0, SURFACE.nonSkid, 0 ] );
	kit.add( 'hull', floor, { color: 0xe2ddcf } );
	const step = solid( rounded( D[ 0 ] - 0.01, z0 - 0.02, D[ 1 ] + 0.01, sill, 0.012 ), DECK.sole, P.y + 0.012, 0.01, ( u, v, d ) => V( u, d, v ), { rings: 1 } );
	auxVertices( step, ( p ) => p.y > P.y ? [ 0.7, 0, SURFACE.nonSkid, 0 ] : [ 0.34, 0, SURFACE.plain, 0 ] );
	kit.add( 'hull', step, { color: 0xe2ddcf } );
	// over the door's top the transom's closed by nothing: the door's a gate, standing open against the box
	const doorX = D[ 1 ] - 0.015;
	kit.add( 'hull', box( 0.03, top - DECK.sole - 0.05, 0.5 ).translate( doorX, ( top + DECK.sole ) / 2 - 0.02, z1 + 0.25 ), GEL );
	// the hull's transom outside it, to the sheer, each side of the door: painted
	const y0 = DECK.platform.y, x = ( y ) => L.halfBreadth( 0, y ), yS = L.sheerY( 0 ) + 0.01;
	for ( const [ a, b ] of [ [ D[ 1 ] - 0.02, null ], [ null, D[ 0 ] + 0.02 ] ] ) {

		const N = 4, pos = [], idx = [];
		for ( let i = 0; i <= N; i ++ ) {

			const y = lerp( y0, yS, i / N ), xa = a ?? - x( y ), xb = b ?? x( y );
			pos.push( xa, y, L.zAft - 0.002, xb, y, L.zAft - 0.002 );
			if ( i < N ) idx.push( 2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3 );

		}

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		g.setIndex( idx );
		g.computeVertexNormals();
		if ( g.attributes.normal.getZ( 0 ) > 0 ) {

			const q = Array.from( g.index.array );
			for ( let i = 0; i < q.length; i += 3 ) [ q[ i + 1 ], q[ i + 2 ] ] = [ q[ i + 2 ], q[ i + 1 ] ];
			g.setIndex( q );
			g.computeVertexNormals();

		}

		auxVertices( g, () => [ 0.2, 0, SURFACE.topsides, 0.6 ] );
		kit.add( 'hull', g );

	}

	// the lid of the livewell on its top, its window of blue water seen when it's fitted (kit.fitting 'livewell'), and hatches
	const hy = top + 0.002;
	for ( const [ cx, hw ] of [ [ 0.2, 0.28 ], [ 0.75, 0.2 ] ] ) {

		kit.add( 'hull', solid( rounded( cx - hw, z0 + 0.09, cx + hw, z1 - 0.07, 0.04 ), hy - 0.008, hy + 0.012, 0.005, ( u, v, d ) => V( u, d, v ), { rings: 1 } ), { color: 0xdedacb, rough: 0.4 } );
		kit.add( 'fittings', cylinder( 0.018, 0.022, 0.016, 10 ).translate( cx, hy + 0.02, ( z0 + z1 ) / 2 ), STAINLESS );

	}

}

// ------------------------------------------------------------------ the rub rail: white rubber with a stainless insert

function rubrail( kit, L ) {

	const N = 40, A = [ - 90, - 45, 0, 45, 90 ].map( ( a ) => a * Math.PI / 180 );
	for ( const s of [ 1, - 1 ] ) {

		const profiles = [], strip = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( 0, 0.992, 1 - Math.pow( 1 - i / N, 1.25 ) ), y = L.sheerY( t ) - 0.03, z = L.zOnStation( t, y ), x = L.sheerX( t );
			const nz = i === N ? 0.4 : ( L.sheerX( t ) - L.sheerX( Math.min( 1, t + 0.01 ) ) ) / ( L.length * 0.01 ), l = Math.hypot( 1, nz );
			profiles.push( A.map( ( a ) => {

				const o = 0.028 * Math.cos( a );
				return V( s * ( x + o / l ), y + 0.027 * Math.sin( a ), z + o * nz / l );

			} ) );
			strip.push( V( s * ( x + 0.029 / l ), y, z + 0.029 * nz / l ) );

		}

		const g = loft( profiles, { flip: s < 0 } );
		kit.add( 'hull', g, { color: 0xeeeae0, rough: 0.5 } );
		kit.add( 'fittings', tube( strip, 0.006, 44, 4 ), STAINLESS );

	}

	const y = L.sheerY( 0 ) - 0.03, xo = L.sheerX( 0 ) + 0.015;
	for ( const [ a, b ] of [ [ xo, DECK.door[ 1 ] ], [ DECK.door[ 0 ], - xo ] ] ) {

		kit.add( 'fittings', rod( V( a, y, L.zAft - 0.012 ), V( b, y, L.zAft - 0.012 ), 0.022, 6 ), { color: 0xeeeae0, rough: 0.5 } );

	}

}

// ------------------------------------------------------------------ what's on the gunwales

// (rod holders, cleats and the pull-up cleats' pockets at the places on her plan)
export const RODS_AT = [ - 2.45, - 1.85, - 0.9 ];

function hardware( kit, L ) {

	const on = ( z, inward = 0.09 ) => {

		const t = L.tAtSheerZ( z );
		return [ L.sheerX( t ) - inward, L.sheerY( t ) + 0.024, z ];

	};

	for ( const s of [ 1, - 1 ] ) {

		// rod holders: a stainless ring, leaning out and aft, its dark throat
		for ( const z of RODS_AT ) {

			const [ x, y ] = on( z );
			const tilt = ( g ) => g.rotateX( 0.45 ).rotateZ( s * - 0.22 ).translate( s * x, y, z );
			kit.add( 'fittings', tilt( torus( 0.03, 0.006, 5, 14 ).rotateX( Math.PI / 2 ) ), STAINLESS );
			kit.add( 'fittings', tilt( cylinder( 0.027, 0.027, 0.004, 12 ) ), DARK );

		}

		// the cleats, at the stern's corner, amidships and the bow's shoulder
		for ( const z of [ - 2.75, 0.3, 2.45 ] ) {

			const [ x, y ] = on( z, z > 2 ? 0.05 : 0.08 );
			kit.add( 'fittings', box( 0.02, 0.022, 0.05 ).translate( s * x, y + 0.012, z ), STAINLESS );
			kit.add( 'fittings', box( 0.025, 0.012, 0.15 ).translate( s * x, y + 0.03, z ), STAINLESS );

		}

		// cup holders' stainless rings by the helm
		const [ cx, cy ] = on( 0.9 );
		kit.add( 'fittings', torus( 0.04, 0.005, 4, 12 ).rotateX( Math.PI / 2 ).translate( s * cx, cy, 0.9 ), STAINLESS );
		kit.add( 'fittings', cylinder( 0.038, 0.038, 0.003, 12 ).translate( s * cx, cy - 0.002, 0.9 ), DARK );
		// the scupper's chrome rim through her side, aft
		kit.add( 'fittings', torus( 0.024, 0.005, 4, 10 ).rotateY( Math.PI / 2 ).translate( s * ( L.halfBreadth( 0.05, 0.38 ) + 0.002 ), 0.38, - 2.7 ), STAINLESS );

	}

	// the livewell's and the lights' switches stay on the helm; the stern's pole light
	const px = - 1.1;
	kit.add( 'fittings', rod( V( px, DECK.boxTop, - 2.82 ), V( px, 1.95, - 2.82 ), 0.012, 6 ), STAINLESS );
	kit.add( 'fittings', cylinder( 0.022, 0.022, 0.012, 10 ).translate( px, DECK.boxTop + 0.005, - 2.82 ), STAINLESS );
	kit.add( 'glow', cylinder( 0.022, 0.026, 0.05, 8 ).translate( px, 1.97, - 2.82 ), { color: 0xfff4e0, rough: 0.3, pattern: 0 } );
	kit.add( 'fittings', cylinder( 0.02, 0.02, 0.01, 8 ).translate( px, 2.0, - 2.82 ), DARK );

	// the side lights on her bow's shoulders, flush
	const nav = ( s, color ) => {

		const z = 3.0, t = L.tAtSheerZ( z ), y = L.sheerY( t ) - 0.06, x = L.halfBreadth( t, y );
		kit.add( 'glow', box( 0.012, 0.03, 0.09 ).rotateY( s * - 0.42 ).translate( s * ( x + 0.008 ), y, z ), { color, rough: 0.3, pattern: 0 } );

	};

	nav( 1, 0xff1a0a );
	nav( - 1, 0x10ff50 );

}
