import { GRAVITY } from '../core/Globals.js';

// Offline wave-propagation field for shoreline waves.
//
// Solves the Eikonal equation |grad T| = 1 / c(x) with the Fast Marching Method, where
// c = sqrt(g * depth) is the shallow-water wave speed (capped offshore). Sources are the
// domain borders initialized with a plane wave travelling along `swellDir`, so wave fronts
// refract naturally around headlands and align with the depth contours near the beach.
//
// Output texture (RGBA float, res x res over the terrain domain):
//   r = arrival time T (s), g,b = propagation direction * exposure (length = exposure 0..1),
//   a = arrival time at the nearest shoreline (extended onto land for swash timing)

// (it holds only the marching front, a few thousand cells: it starts small and grows when full,
// as the whole field's worth would be megabytes of a phone's script memory)
class MinHeap {

	constructor( cap ) {

		this.keys = new Float64Array( cap );
		this.vals = new Int32Array( cap );
		this.size = 0;

	}

	push( k, v ) {

		if ( this.size === this.keys.length ) {

			const keys = new Float64Array( this.size * 2 ), vals = new Int32Array( this.size * 2 );
			keys.set( this.keys );
			vals.set( this.vals );
			this.keys = keys;
			this.vals = vals;

		}

		let i = this.size ++;
		const keys = this.keys, vals = this.vals;
		while ( i > 0 ) {

			const p = ( i - 1 ) >> 1;
			if ( keys[ p ] <= k ) break;
			keys[ i ] = keys[ p ]; vals[ i ] = vals[ p ];
			i = p;

		}

		keys[ i ] = k; vals[ i ] = v;

	}

	pop() {

		const keys = this.keys, vals = this.vals;
		const top = vals[ 0 ];
		const k = keys[ -- this.size ], v = vals[ this.size ];
		let i = 0;
		const n = this.size;
		while ( true ) {

			let c = 2 * i + 1;
			if ( c >= n ) break;
			if ( c + 1 < n && keys[ c + 1 ] < keys[ c ] ) c ++;
			if ( keys[ c ] >= k ) break;
			keys[ i ] = keys[ c ]; vals[ i ] = vals[ c ];
			i = c;

		}

		keys[ i ] = k; vals[ i ] = v;
		return top;

	}

}

// (M14) a wind sea's field, its lee taken out: where the wind (blowing along `dir`, unit) comes to a point
// over the island, its sea doesn't, so its exposure (g, b) there is scaled by how many of a fan of rays
// (`fan`, rad either side of straight upwind) run clear of land from `near` to `far` m upwind (the land
// nearer than `near` is a headland it wraps round: the solve's refraction has that), looked at every
// `step` m on a grid of twice the field's cells and spread over it. Only where the shore waves are
// (shallower than `deep`). The solve alone carries a front on round an island's shoulders into its lee,
// and the bay would have a trades gale's breakers on its eastern shore. In place
export function shelter( field, dir, { near = 150, far = 1200, step = 16, fan = [ 0, 0.14, - 0.14, 0.28, - 0.28 ], deep = 30 } = {} ) {
	const { data, depth, res, origin, size } = field, h = size / res, R = res >> 1, H = 2 * h;
	const rays = fan.map( ( a ) => [ - ( dir[ 0 ] * Math.cos( a ) - dir[ 1 ] * Math.sin( a ) ), - ( dir[ 0 ] * Math.sin( a ) + dir[ 1 ] * Math.cos( a ) ) ] );
	const land = ( x, z ) => {
		const i = Math.floor( ( x - origin ) / h ), j = Math.floor( ( z - origin ) / h );
		return i >= 0 && j >= 0 && i < res && j < res && depth[ j * res + i ] <= 0;
	};
	// (the share clear at each coarse cell, at the corner of four of the field's)
	const keep = new Float32Array( R * R ).fill( 1 );
	for ( let J = 0; J < R; J ++ ) for ( let I = 0; I < R; I ++ ) {
		const x = origin + ( I + 1 ) * H - h, z = origin + ( J + 1 ) * H - h;
		const d = depth[ Math.min( res - 1, 2 * J + 1 ) * res + Math.min( res - 1, 2 * I + 1 ) ];
		if ( d <= - 4 || d > deep + 6 ) continue;
		let clear = 0;
		for ( const [ rx, rz ] of rays ) {
			let open = true;
			for ( let r = near; r <= far && open; r += step ) open = ! land( x + rx * r, z + rz * r );
			if ( open ) clear ++;
		}
		keep[ J * R + I ] = clear / rays.length;
	}
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {
		const k = j * res + i, d = depth[ k ];
		if ( d <= - 2 || d > deep || ( data[ k * 4 + 1 ] === 0 && data[ k * 4 + 2 ] === 0 ) ) continue;
		const u = Math.min( Math.max( ( i - 0.5 ) / 2, 0 ), R - 1.001 ), v = Math.min( Math.max( ( j - 0.5 ) / 2, 0 ), R - 1.001 );
		const I = Math.floor( u ), J = Math.floor( v ), a = u - I, b = v - J, q = J * R + I;
		const s = ( keep[ q ] * ( 1 - a ) + keep[ q + 1 ] * a ) * ( 1 - b ) + ( keep[ q + R ] * ( 1 - a ) + keep[ q + R + 1 ] * a ) * b;
		data[ k * 4 + 1 ] *= s;
		data[ k * 4 + 2 ] *= s;
	}
	return field;
}
// (M12) the ground under a field already solved (its depths, at its cells' middles), as the solve reads
// the terrain: so another swell's field can be solved from it (in a worker: shore/ShoreWorker) without
// the terrain's arrays, at the same cells
export function fieldGround( { depth, res, size, origin }, seaLevel = 0 ) {

	const h = size / res;
	return {
		size, origin,
		heightAt: ( x, z ) => {

			const i = Math.min( res - 1, Math.max( 0, Math.floor( ( x - origin ) / h ) ) ), j = Math.min( res - 1, Math.max( 0, Math.floor( ( z - origin ) / h ) ) );
			return seaLevel - depth[ j * res + i ];

		},
	};

}

export function computeShoreField( terrain, { res = 512, swellDir = [ 0, - 1 ], seaLevel = 0, maxDepth = 25, minDepth = 0.25 } = {} ) {

	const size = terrain.size;
	const origin = terrain.origin;
	const h = size / res;
	const N = res * res;

	const depth = new Float32Array( N );
	const speed = new Float32Array( N );
	for ( let j = 0; j < res; j ++ ) {

		const z = origin + ( j + 0.5 ) * h;
		for ( let i = 0; i < res; i ++ ) {

			const x = origin + ( i + 0.5 ) * h;
			const d = seaLevel - terrain.heightAt( x, z );
			depth[ j * res + i ] = d;
			speed[ j * res + i ] = d > 0 ? Math.sqrt( GRAVITY * Math.min( Math.max( d, minDepth ), maxDepth ) ) : 0;

		}

	}

	const T = new Float32Array( N ).fill( Infinity );
	const state = new Uint8Array( N ); // 0 far, 1 trial, 2 known
	const heap = new MinHeap( 8 * res );
	const [ sdx, sdz ] = swellDir;
	const c0 = Math.sqrt( GRAVITY * maxDepth );

	// plane-wave initial condition on the border water cells
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		if ( i !== 0 && j !== 0 && i !== res - 1 && j !== res - 1 ) continue;
		const k = j * res + i;
		if ( speed[ k ] <= 0 ) continue;
		const x = origin + ( i + 0.5 ) * h, z = origin + ( j + 0.5 ) * h;
		T[ k ] = ( x * sdx + z * sdz ) / c0 + size; // offset keeps T positive
		state[ k ] = 1;
		heap.push( T[ k ], k );

	}

	const solve = ( i, j ) => {

		const k = j * res + i;
		const c = speed[ k ];
		if ( c <= 0 ) return Infinity;
		const f = h / c;
		const tx = Math.min(
			i > 0 && state[ k - 1 ] === 2 ? T[ k - 1 ] : Infinity,
			i < res - 1 && state[ k + 1 ] === 2 ? T[ k + 1 ] : Infinity );
		const tz = Math.min(
			j > 0 && state[ k - res ] === 2 ? T[ k - res ] : Infinity,
			j < res - 1 && state[ k + res ] === 2 ? T[ k + res ] : Infinity );
		const a = Math.min( tx, tz ), b = Math.max( tx, tz );
		if ( ! isFinite( b ) || b - a >= f ) return a + f;
		return 0.5 * ( a + b + Math.sqrt( 2 * f * f - ( a - b ) * ( a - b ) ) );

	};

	while ( heap.size > 0 ) {

		const k = heap.pop();
		if ( state[ k ] === 2 ) continue;
		state[ k ] = 2;
		const i = k % res, j = ( k / res ) | 0;
		for ( let n = 0; n < 4; n ++ ) {

			const ni = n === 0 ? i - 1 : n === 1 ? i + 1 : i, nj = n === 2 ? j - 1 : n === 3 ? j + 1 : j;
			if ( ni < 0 || nj < 0 || ni >= res || nj >= res ) continue;
			const nk = nj * res + ni;
			if ( state[ nk ] === 2 || speed[ nk ] <= 0 ) continue;
			const t = solve( ni, nj );
			if ( t < T[ nk ] ) {

				T[ nk ] = t;
				state[ nk ] = 1;
				heap.push( t, nk );

			}

		}

	}

	// Extend a field onto land one ring of cells per pass (average of the known neighbours + inc).
	// Each pass reads the previous pass only: filling in place while scanning would let values from
	// far away (e.g. the other side of the island) sweep across the land in a single pass.
	const extend = ( F, passes, inc ) => {

		const prev = new Float32Array( N );
		for ( let pass = 0; pass < passes; pass ++ ) {

			prev.set( F );
			let changed = false;
			for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

				const k = j * res + i;
				if ( isFinite( prev[ k ] ) ) continue;
				let s = 0, n = 0;
				if ( i > 0 && isFinite( prev[ k - 1 ] ) ) { s += prev[ k - 1 ]; n ++; }
				if ( i < res - 1 && isFinite( prev[ k + 1 ] ) ) { s += prev[ k + 1 ]; n ++; }
				if ( j > 0 && isFinite( prev[ k - res ] ) ) { s += prev[ k - res ]; n ++; }
				if ( j < res - 1 && isFinite( prev[ k + res ] ) ) { s += prev[ k + res ]; n ++; }
				if ( n > 0 ) { F[ k ] = s / n + inc; changed = true; }

			}

			if ( ! changed ) break;

		}

	};

	// arrival time at the nearest shoreline, extended unchanged onto land (swash timing)
	const Tshore = new Float32Array( T );
	extend( Tshore, 40, 0 );

	// extend T onto land (so the swash zone has a continuous phase), continuing slowly up the beach
	const Tfilled = new Float32Array( T );
	extend( Tfilled, 24, h / 1.5 );

	// smooth to remove first-order FMM kinks (keeps phase monotonic)
	// (two buffers taking turns)
	let Ts = Tfilled, spare = new Float32Array( N );
	for ( let it = 0; it < 3; it ++ ) {

		const out = spare;
		for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

			const k = j * res + i;
			if ( ! isFinite( Ts[ k ] ) ) { out[ k ] = Ts[ k ]; continue; }
			let s = Ts[ k ] * 4, w = 4;
			for ( let n = 0; n < 4; n ++ ) {

				const ni = n === 0 ? i - 1 : n === 1 ? i + 1 : i, nj = n === 2 ? j - 1 : n === 3 ? j + 1 : j;
				if ( ni < 0 || nj < 0 || ni >= res || nj >= res ) continue;
				const v = Ts[ nj * res + ni ];
				if ( isFinite( v ) ) { s += v; w ++; }

			}

			out[ k ] = s / w;

		}

		spare = Ts;
		Ts = out;

	}

	// directions + exposure
	const data = new Float32Array( N * 4 );
	const sl = Math.hypot( sdx, sdz );
	const g = ( a, b ) => ( isFinite( a ) && isFinite( b ) ) ? ( a - b ) : 0;
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		const k = j * res + i;
		const t = Ts[ k ];
		const tl = i > 0 ? Ts[ k - 1 ] : t, tr = i < res - 1 ? Ts[ k + 1 ] : t;
		const td = j > 0 ? Ts[ k - res ] : t, tu = j < res - 1 ? Ts[ k + res ] : t;
		let gx = g( tr, tl ), gz = g( tu, td );
		if ( gx === 0 && isFinite( tr ) && isFinite( t ) ) gx = tr - t;
		if ( gz === 0 && isFinite( tu ) && isFinite( t ) ) gz = tu - t;
		const len = Math.hypot( gx, gz ) || 1;
		const dx = gx / len, dz = gz / len;
		// exposure: how directly the local wave direction faces the incoming swell
		const align = ( dx * sdx + dz * sdz ) / sl;
		const exposure = Math.min( 1, Math.max( 0.02, align * 1.4 + 0.1 ) );
		// direction scaled by exposure (length = exposure), alpha = shoreline arrival time
		data[ k * 4 ] = isFinite( t ) ? t : 1e5;
		data[ k * 4 + 1 ] = dx * exposure;
		data[ k * 4 + 2 ] = dz * exposure;
		data[ k * 4 + 3 ] = isFinite( Tshore[ k ] ) ? Tshore[ k ] : ( isFinite( t ) ? t : 1e5 );

	}

	return { data, res, cellSize: h, origin, size, depth };

}
