import { BoxGeometry, MathUtils } from '../engine/index.js';
import { TIDE_HIGHEST, TIDE_LOWEST } from '../game/IslandClock.js';
import { berthOf } from '../game/fleet/Berths.js';
import { CRADLE, SPARE_YARD, THIRD_YARD, YARD } from '../world/village/StormPlaces.js';
import { mat4, mergePrepared, prepare } from '../world/boat/GeoKit.js';

// (M16) Marta's dock holding more than yours. Everyone's boat lies at the same berth on their own device (the pier
// head's, by her type: game/fleet), so someone else's at the dock would sit in yours, or on one you've left parked
// there. On your screen each of theirs lies at a spare berth along the pier's stem, either side, and goes back to her
// own pose as she leaves. The spare's kept for as long as she's about the dock, whoever else comes or goes.
// (M17) As many as the stem holds, by each boat's length and draft, deepest first; a visitor's kayak on the sand has a
// place of her own beside yours, up past the high-water mark; one hauled out in Marta's yard where yours is has a
// second cradle; and a boat leaving the stem goes out from it and round the head, not through it.
//   atDock( x, z ) -> is that the pier head's water?
//   stemBerth( taken, size, groundAt ) -> { kind: 'stem', side, x, z, z0, z1, heading } | null   (taken: the others held)
//   spareBerth( i, beam ) -> { x, z, heading }   (M16's four, for the checks that read them)
//   onTheSand( id, x, z, rest ) -> is that a kayak lying where hers would?   sandBerth( taken, terrain ) -> a place on the sand
//   yardOf( id ) -> her cradle in the yard   inTheYard( id, x, z ) -> is she on it?   spareYard( id, terrain ) -> the second
//   berthShare( d ) -> 1 at her berth .. 0 gone: d m from where she lay
//   laidAt( out, p, from, berth, turn, k, swing )   (her position in out: p, moved as she's held at the berth by k; swing: as far as
//   she moves about it as her pose does: SWING along the stem)
//   leaving( out, at, p, berth, size, k )   (from where she's laid, at, to p, round the pier head: out)
//   cradleGeometry( id, waterline, groundAt ) -> her keel blocks and stands, in the props' program

const PIER = { x: 55, half: 1.3, gap: 0.6 }; // (WORLD.pier's stem)
const HEAD = { x: 55, z: 36, r: 30, half: 7, z0: 33, z1: 40 }; // the water about the pier head; the head itself
const SPARES = [ [ 1, 18 ], [ - 1, 18 ], [ 1, 2 ], [ - 1, 2 ] ]; // [ side (+x), z ], the deepest first (M16's)
const HOLD = 10, GONE = 40; // m: she's let go from the berth between these as she leaves
// (M17) along the stem: from the head's back face, a gap clear of it, toward the shore; between two boats; under her keel
// at the lowest tide
const STEM = { z1: HEAD.z0 - 1.5, z0: - 40, gap: 1.5, keel: 0.3, step: 0.5 };
// (M17) the sand: a kayak's place either side of yours, a metre and a half apart, up past the high-water mark as yours is
// (fleet/Berths.ashoreOf)
const SAND = [ 1.6, - 1.6, 3.2, - 3.2, 4.8, - 4.8 ];
const CLEAR = TIDE_HIGHEST + 0.5;
const ON_SAND = 4; // m from where a kayak lies on the sand: she's lying there
const ON_YARD = 2.5; // m from her cradle: she's on it
const ROUND = 1; // m between her and the head's end as she goes round it

export const SPARE_BERTHS = SPARES.length;
export const atDock = ( x, z ) => Math.hypot( x - HEAD.x, z - HEAD.z ) < HEAD.r;

export function spareBerth( i, beam ) {

	const [ side, z ] = SPARES[ i ];
	return { x: PIER.x + side * ( PIER.half + PIER.gap + beam / 2 ), z, heading: 0 };

}

// the deepest stretch of the stem that's free for her, either side: her bow toward the head
export function stemBerth( taken, size, groundAt = null ) {

	const L = size.length, under = TIDE_LOWEST - ( size.draft || 0 ) - STEM.keel;
	const open = { 1: true, [ - 1 ]: true };
	for ( let z1 = STEM.z1; z1 - L >= STEM.z0; z1 -= STEM.step ) for ( const side of [ 1, - 1 ] ) {

		if ( ! open[ side ] ) continue;
		const z0 = z1 - L, x = PIER.x + side * ( PIER.half + PIER.gap + size.beam / 2 );
		// (shallower toward the shore: past where she'd touch at low water there's nowhere further along this side)
		if ( groundAt && Math.max( groundAt( x, z0 ), groundAt( x + side * size.beam / 2, z0 ) ) > under ) {

			open[ side ] = false;
			continue;

		}

		if ( taken.some( ( t ) => t && t.kind === 'stem' && t.side === side && z0 < t.z1 + STEM.gap && z1 > t.z0 - STEM.gap ) ) continue;
		return { kind: 'stem', side, x, z: ( z0 + z1 ) / 2, z0, z1, heading: 0 };

	}

	return null;

}

// a kayak on the sand where hers lies: her owner's game has her at the same place as yours
export function onTheSand( id, x, z, rest ) {

	return id === 'kayak' && !! rest && Math.hypot( x - rest.x, z - rest.z ) < ON_SAND;

}

// a place on the sand beside yours, nearest first, up past the high-water mark: { kind: 'sand', x, z, y, heading, pitch, i }
export function sandBerth( taken, terrain ) {

	const B = berthOf( 'kayak' ), P = B.position;
	for ( let i = 0; i < SAND.length; i ++ ) {

		if ( taken.some( ( t ) => t && t.kind === 'sand' && t.i === i ) ) continue;
		const x = P.x + SAND[ i ];
		let z = P.z, n = 0;
		while ( terrain.heightAt( x, z ) < CLEAR && n ++ < 60 ) z -= 0.5;
		const rise = ( terrain.heightAt( x, z + 1.5 ) - terrain.heightAt( x, z - 1.5 ) ) / 3;
		return { kind: 'sand', i, x, z, y: terrain.heightAt( x, z ), heading: B.heading, pitch: - Math.atan( rise ) };

	}

	return null;

}

// her cradle in Marta's yard (the lobster boat's is the village's, the others' on blocks: StormPlaces.YARD)
export const yardOf = ( id ) => id === 'lobster' ? CRADLE : YARD[ id ] || null;
export function inTheYard( id, x, z ) {

	const c = yardOf( id );
	return !! c && Math.hypot( x - c.x, z - c.z ) < ON_YARD;

}

// the yard's second cradle for her: { kind: 'yard', x, z, heading, rise } (rise: m the ground under her keel's higher there
// than under her own, so she sits on her blocks as high over it). ((M19) n: those of her kind already given one; the second
// visitor's is the third cradle, THIRD_YARD, and past that there's none)
export function spareYard( id, terrain, n = 0 ) {

	const c = yardOf( id ), s = [ SPARE_YARD, THIRD_YARD ][ n ]?.[ id ], L = { kayak: 3.7, console: 7, lobster: 8.2, sportfisher: 14.6 }[ id ];
	if ( ! c || ! s ) return null;
	const under = ( p ) => {

		let h = - Infinity;
		for ( let k = - L / 2; k <= L / 2; k += 0.5 ) h = Math.max( h, terrain.heightAt( p.x + k * Math.sin( p.yaw ), p.z + k * Math.cos( p.yaw ) ) );
		return h;

	};

	return { kind: 'yard', x: s.x, z: s.z, heading: s.yaw, rise: under( s ) - under( c ) };

}

export const berthShare = ( d ) => 1 - MathUtils.smoothstep( d, HOLD, GONE );

export function laidAt( out, p, from, berth, turn, k, swing = Infinity ) {

	let dx = p.x - from.x, dz = p.z - from.z;
	const s = Math.sin( turn ), c = Math.cos( turn ), d = Math.hypot( dx, dz );
	// ((M17) swing: m she moves about her berth at most as her pose does. Lying along the stem it's her lines' play: past that
	// she's leaving, and her way out's leaving()'s, not her owner's moves made again beside the stem, which took her into it)
	if ( d > swing ) {

		dx *= swing / d;
		dz *= swing / d;

	}

	out.x = p.x + ( berth.x + dx * c + dz * s - p.x ) * k;
	out.y = p.y;
	out.z = p.z + ( berth.z - dx * s + dz * c - p.z ) * k;
	return out;

}

// (M17) as far as a boat along the stem moves about her spare as her pose does: her lines' play, never into the stem (each spare
// lies 0.6 m off its side) or the head (the nearest spare's bow 1.5 m short of it)
export const SWING = 0.5;

// (M17) Leaving a berth along the stem: from where she's laid at it (at: laidAt's at k = 1) to where her pose has her (p),
// the share k still at the berth. Not straight there, which went through the pier head as her offset closed: out from the
// stem, sideways, to beside the head's end on her side, along it and past its face, across it if she's for its far side,
// then to her. Each corner's taken only as far as her pose needs it (none for a boat going off along the stem), so the way
// never jumps as she goes, and the spares' other boats, lying in a line along the stem, are outside it
const _o = { x: 0, z: 0 }, _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 }, _c = { x: 0, z: 0 };
export function leaving( out, at, p, berth, size, k ) {

	out.x = at.x;
	out.z = at.z;
	if ( k >= 1 ) return out;
	const s = berth.side, wide = HEAD.half + ROUND + size.beam / 2, back = HEAD.z0 - size.length / 2 - ROUND, front = HEAD.z1 + size.length / 2 + ROUND;
	// (out past the head's end: while she's not already out there on her side; round its face: while she's not past it)
	const north = MathUtils.smoothstep( p.z, back - 10, back ), outside = MathUtils.smoothstep( s * ( p.x - HEAD.x ), wide, wide + 10 );
	_o.x = at.x + ( HEAD.x + s * wide - at.x ) * north;
	_o.z = at.z;
	_a.x = _o.x;
	_a.z = at.z + ( Math.max( at.z, back ) - at.z ) * north;
	const round = north * ( 1 - outside );
	_b.x = _a.x;
	_b.z = _a.z + ( front - _a.z ) * round;
	const across = round * MathUtils.smoothstep( - s * ( p.x - HEAD.x ), - wide, wide ) * ( 1 - MathUtils.smoothstep( p.z, front, front + 10 ) );
	_c.x = _b.x + ( HEAD.x - s * wide - _b.x ) * across;
	_c.z = _b.z;
	// (along the way at her share of it)
	const way = [ at, _o, _a, _b, _c, p ];
	let all = 0;
	for ( let i = 1; i < way.length; i ++ ) all += Math.hypot( way[ i ].x - way[ i - 1 ].x, way[ i ].z - way[ i - 1 ].z );
	let d = ( 1 - k ) * all;
	for ( let i = 1; i < way.length; i ++ ) {

		const A = way[ i - 1 ], B = way[ i ], l = Math.hypot( B.x - A.x, B.z - A.z ), f = l > 1e-6 ? Math.min( 1, d / l ) : 1;
		out.x = A.x + ( B.x - A.x ) * f;
		out.z = A.z + ( B.z - A.z ) * f;
		d -= l;
		if ( d <= 0 ) break;

	}

	return out;

}

// (M17) her keel blocks and the stands under her bilges, down to the ground, as Marta's cradle has them (village/Buildings.
// buildCradle): in her frame, y over her waterline (groundAt( x, z ): her frame -> the ground's height there)
const _box = ( w, h, d, x, y, z, color ) => prepare( new BoxGeometry( w, h, d ), { color, rough: 0.85, matrix: mat4( x, y + h / 2, z ) } );
export function cradleGeometry( id, size, waterline, groundAt ) {

	const L = size.length, B = size.beam, keel = - size.draft - 0.02, parts = [];
	const n = 3 + Math.round( L / 5 );
	for ( let i = 0; i < n; i ++ ) {

		const z = - L * 0.38 + i * L * 0.68 / ( n - 1 ), g = groundAt( 0, z ) - waterline;
		parts.push( _box( 0.36, keel - g + 0.02, 0.5, 0, g - 0.01, z, 0x6f5a42 ) );

	}

	if ( L > 5 ) for ( const z of [ - L * 0.25, L * 0.15 ] ) for ( const sx of [ - 1, 1 ] ) {

		const x = sx * B * 0.4, g = groundAt( x, z ) - waterline, top = - size.draft * 0.35;
		parts.push( _box( 0.06, top - g, 0.06, x, g, z, 0x2f6fb0 ), _box( 0.36, 0.04, 0.36, x, g, z, 0x2f6fb0 ) );

	}

	return mergePrepared( parts );

}
