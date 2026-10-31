import * as THREE from '../../engine/index.js';
import { CAVES, carveAt, worldOf, tunnelAt } from './SeaCaves.js';

// (M15) The light in a sea cave: how much of the sky, and of the sunlit sea, each place in it sees. Worked out
// once from its rock as built (its field) and the ground about it, on a grid through the air in it and over it
// (every STEP m), each point's view as 24 rays out from it: a ray reaching the open air is the sky, one meeting
// the sea out in the light (the inlet, the sea beyond) the sunlit sea, one meeting the sea under the rock a
// little of its glow; one meeting rock or ground that's open to the sky over it the sunlit rock (it throws the
// sun's light on: a narrow inlet's walls are lit mostly by the sun off the rock across it and the sea), and
// rock or ground in the dark nothing. Each point keeps the three as first-order spherical harmonics (an
// average and a direction), so what a face of the rock sees is had for its normal: V(n) = a + 2/3 b.n (the
// sky's: 1 for open ground under the sky, 1/2 for a cliff face, 0 shut in). Deep in the cave the mouth's a
// small bright window that rays spread over every way would mostly miss: from inside it, the view out through
// the mouth is had from points over its opening instead (MOUTH), each as the patch of it about it, as far as it
// isn't hidden (its solid angle: area x cos / d^2), seeing what a ray on out through it meets.
//   caveLightGrid( o, column ) -> the grid (o: the overhang as built: its at, ground, bounds, site; its shape's
//     column( x, z ) -> [ roof, … ])
//   caveOpenness( grid, x, y, z ) -> 0..1: the light there for the eye (1 in the open)
//   caveLightAttribute( geometry, grid ): the geometry's `sea` attribute (V, W, R: what its face sees of the
//     sky, of the sunlit sea and of the sunlit rock; 1: a cave's)
//   caveWaterLight( grid ) -> { data, w, h }: over the cave's plan, what the sea's surface sees of the sky
//     straight up, the sunlit sea's glow through the water, and where its floor's cut (cobbles: CAVE_MAP
//     texels, the sea's height)
//   caveLightTexture( overhangs ) -> a DataTexture of every cave's (side by side, CAVE_MAP[ 0 ] wide each)
//   SEA_CAVE_GLSL: seaCaveLightAt( xz ) -> vec3 ( sky straight up, glow, its cut floor ), ( 1, 0, 0 ) out of
//     the caves
//   SEA_CAVE_CALM_GLSL: seaCaveCalm( xz ) -> 0..1, how calm the sea's kept in a cave's gully, inlet and cave

export const STEP = 1.0; // m: the grid's
export const CAVE_MAP = [ 32, 48 ]; // texels: the plan's map, across and along
const RAYS = ( () => {

	// (a Fibonacci sphere: even over every direction)
	const out = [], n = 24, ga = Math.PI * ( 3 - Math.sqrt( 5 ) );
	for ( let i = 0; i < n; i ++ ) {

		const y = 1 - ( i + 0.5 ) * 2 / n, r = Math.sqrt( 1 - y * y ), t = ga * i;
		out.push( [ Math.cos( t ) * r, y, Math.sin( t ) * r ] );

	}

	return out;

} )();
const REACH = 36; // m: a ray that gets this far over the ground is the sky's
const SHADED_SEA = 0.08; // the sea under the rock: its glow, of the sunlit sea's
const MOUTH = [ 3, 5 ]; // the mouth's points: across, up

// whether ( x, y, z ) sees the sky straight up (nothing over it: rock or ground in the sun's light)
function open( o, x, y, z, top ) {

	for ( let t = 0.4; y + t < top; t += 0.4 + 0.25 * t ) if ( o.at( x, y + t, z ) < 0 || y + t < o.ground( x, z ) ) return false;
	return true;

}

// what a ray from ( x, y, z ) along d meets: [ sky, sunlit sea, sunlit rock ]. `mouth`: the frame's z where
// the rock begins to roof the sea (the cave's mouth); `inside`: from in the cave (out through the mouth's
// had otherwise: nothing here)
function cast( o, x, y, z, d, mouth, inside ) {

	let t = 0.5;
	while ( t < REACH ) {

		const px = x + d[ 0 ] * t, py = y + d[ 1 ] * t, pz = z + d[ 2 ] * t;
		if ( inside && pz > mouth ) return [ 0, 0, 0 ];
		if ( py < 0 ) {

			// (the sea's surface: where it's met, out in the light or under the rock)
			const u = - y / d[ 1 ], sz = z + d[ 2 ] * u, sx = x + d[ 0 ] * u;
			if ( o.ground( sx, sz ) > 0 ) return [ 0, 0, 0 ];
			return [ 0, sz < mouth ? SHADED_SEA : 1, 0 ];

		}

		if ( py < o.ground( px, pz ) || o.at( px, py, pz ) < 0 ) {

			// (backed off it a little, into the air it was met from)
			const b = Math.max( 0, t - 0.5 );
			return [ 0, 0, open( o, x + d[ 0 ] * b, y + d[ 1 ] * b, z + d[ 2 ] * b, o.bounds[ 1 ][ 1 ] + 2 ) ? 1 : 0 ];

		}

		t += 0.3 + 0.18 * t;

	}

	return [ 1, 0, 0 ];

}

export function* caveLightGrid( o, column ) {

	const [ lo, hi ] = o.bounds, c = o.site.cave;
	const n = [ 0, 1, 2 ].map( ( a ) => Math.ceil( ( hi[ a ] - lo[ a ] ) / STEP ) + 1 );
	// (a, b: the sky's; aw, bw: the sunlit sea's; ar, br: the sunlit rock's; open air by default: the whole
	// sky over it, nothing else)
	// (ok: whether a point's in the air (in the rock, the ground or the sea, it's no one's view: left out of
	// what's had from the grid))
	const C = new Float32Array( n[ 0 ] * n[ 1 ] * n[ 2 ] * 12 ), ok = new Uint8Array( n[ 0 ] * n[ 1 ] * n[ 2 ] );
	for ( let q = 0; q < C.length; q += 12 ) {

		C[ q ] = 0.5;
		C[ q + 2 ] = 0.75;

	}

	const mouth = - c.inset;
	for ( let k = 0; k < n[ 2 ]; k ++ ) for ( let i = 0; i < n[ 0 ]; i ++ ) {

		yield;
		const x = lo[ 0 ] + i * STEP, z = lo[ 2 ] + k * STEP, roof = column( x, z )[ 0 ];
		for ( let j = 0; j < n[ 1 ]; j ++ ) {

			const y = lo[ 1 ] + j * STEP, p = i + n[ 0 ] * ( j + n[ 1 ] * k );
			if ( y < 0 || o.at( x, y, z ) < 0 || y < o.ground( x, z ) ) continue;
			ok[ p ] = 1;
			// (worked out in the air in it and just over it: under the rock's top; higher, the open sky's)
			if ( y > roof + 1.2 ) continue;
			const q = p * 12, N = RAYS.length, inside = z < mouth - 1;
			C[ q ] = C[ q + 2 ] = 0;
			if ( inside ) through( o, c, x, y, z, mouth, C, q );
			for ( const d of RAYS ) {

				const m = cast( o, x, y, z, d, mouth, inside );
				for ( let c = 0; c < 3; c ++ ) {

					C[ q + c * 4 ] += m[ c ] / N;
					for ( let e = 0; e < 3; e ++ ) C[ q + c * 4 + 1 + e ] += 3 * m[ c ] * d[ e ] / N;

				}

			}

		}

	}

	return { lo, hi, n, C, ok, site: o.site };

}

// the view out of the mouth from ( x, y, z ) in the cave, into the grid's terms at q (the overhangs' frame: x
// the plan's -x)
function through( o, c, x, y, z, mouth, C, q ) {

	const t = tunnelAt( c, mouth - 0.01 ), xc = - t.wander, yb = t.floor - 1.4, [ nx, ny ] = MOUTH;
	for ( let j = 0; j < ny; j ++ ) {

		const py = t.top * ( j + 0.5 ) / ny, u = ( py - yb ) / ( t.top - yb ), hw = t.half * Math.pow( Math.max( 0, 1 - u * u ), 0.55 );
		const area = 2 * hw / nx * t.top / ny;
		for ( let i = 0; i < nx; i ++ ) {

			const px = xc + hw * ( ( i + 0.5 ) / nx * 2 - 1 ), dx = px - x, dy = py - y, dz = mouth - z, dist = Math.hypot( dx, dy, dz );
			// (hidden by the rock between?)
			let seen = true;
			for ( let s = 0.6; s < dist - 0.6; s += 0.5 ) if ( o.at( x + dx * s / dist, y + dy * s / dist, z + dz * s / dist ) < 0 ) {

				seen = false;
				break;

			}

			if ( ! seen ) continue;
			const w = area * dz / dist / ( dist * dist ) / ( 4 * Math.PI ), d = [ dx / dist, dy / dist, dz / dist ];
			const m = cast( o, px, py, mouth, d, mouth, false );
			for ( let k = 0; k < 3; k ++ ) {

				C[ q + k * 4 ] += m[ k ] * w;
				for ( let e = 0; e < 3; e ++ ) C[ q + k * 4 + 1 + e ] += 3 * m[ k ] * w * d[ e ];

			}

		}

	}

}

// the grid's 12 terms at ( x, y, z ) (trilinear over the points about it in the air; clamped to its edges;
// with none, the open sky's), into out
function sample( g, x, y, z, out ) {

	const { lo, n, C, ok } = g;
	const fx = Math.min( n[ 0 ] - 1.001, Math.max( 0, ( x - lo[ 0 ] ) / STEP ) );
	const fy = Math.min( n[ 1 ] - 1.001, Math.max( 0, ( y - lo[ 1 ] ) / STEP ) );
	const fz = Math.min( n[ 2 ] - 1.001, Math.max( 0, ( z - lo[ 2 ] ) / STEP ) );
	const i = Math.floor( fx ), j = Math.floor( fy ), k = Math.floor( fz ), u = fx - i, v = fy - j, w = fz - k;
	out.fill( 0 );
	let sum = 0;
	for ( let c = 0; c < 8; c ++ ) {

		const ii = i + ( c & 1 ), jj = j + ( ( c >> 1 ) & 1 ), kk = k + ( c >> 2 ), p = ii + n[ 0 ] * ( jj + n[ 1 ] * kk );
		if ( ! ok[ p ] ) continue;
		const wt = ( c & 1 ? u : 1 - u ) * ( c & 2 ? v : 1 - v ) * ( c & 4 ? w : 1 - w ) + 1e-4;
		for ( let t = 0; t < 12; t ++ ) out[ t ] += C[ p * 12 + t ] * wt;
		sum += wt;

	}

	if ( sum === 0 ) {

		out[ 0 ] = 0.5;
		out[ 2 ] = 0.75;
		return out;

	}

	for ( let t = 0; t < 12; t ++ ) out[ t ] /= sum;
	return out;

}

const _s = new Float32Array( 12 );
const clamp01 = ( x ) => Math.min( 1, Math.max( 0, x ) );

// what a face at ( x, y, z ) facing n sees: [ sky, sunlit sea, sunlit rock ] (the grid's terms a step out from
// it, in the air)
export function caveLightAt( g, x, y, z, nx, ny, nz ) {

	const s = sample( g, x + nx * 0.5, y + ny * 0.5, z + nz * 0.5, _s ), f = ( k ) => clamp01( s[ k ] + ( s[ k + 1 ] * nx + s[ k + 2 ] * ny + s[ k + 3 ] * nz ) * 2 / 3 );
	return [ f( 0 ), f( 4 ), f( 8 ) ];

}

// how much light there is at ( x, y, z ) for the eye (frame m): 1 in the open (half of every way the sky),
// less as less of the sky and the sunlit sea's seen
export function caveOpenness( g, x, y, z ) {

	const [ lo, hi ] = [ g.lo, g.hi ];
	if ( x < lo[ 0 ] || x > hi[ 0 ] || y < lo[ 1 ] || y > hi[ 1 ] || z < lo[ 2 ] || z > hi[ 2 ] ) return 1;
	// (the sky's the brightest of it, the sunlit rock about half as bright, the sea a quarter; out in the open,
	// half of every way the sky and half the sea: 0.625)
	const s = sample( g, x, y, z, _s );
	return clamp01( ( s[ 0 ] + 0.25 * s[ 4 ] + 0.5 * s[ 8 ] ) / 0.625 );

}

export function caveLightAttribute( geometry, g ) {

	const P = geometry.attributes.position, N = geometry.attributes.normal, sea = new Float32Array( P.count * 4 );
	for ( let q = 0; q < P.count; q ++ ) {

		const [ v, w, r ] = caveLightAt( g, P.getX( q ), P.getY( q ), P.getZ( q ), N.getX( q ), N.getY( q ), N.getZ( q ) );
		sea[ q * 4 ] = v;
		sea[ q * 4 + 1 ] = w;
		sea[ q * 4 + 2 ] = r;
		sea[ q * 4 + 3 ] = 1;

	}

	geometry.setAttribute( 'sea', new THREE.BufferAttribute( sea, 4 ) );

}

// the sea's surface over the cave's plan (its frame's x, z bounds): the sky straight up from just over it, and
// the sunlit sea it sees (its glow through the water)
export function caveWaterLight( g ) {

	const [ W, H ] = CAVE_MAP, data = new Float32Array( W * H * 3 ), { lo, hi } = g, hiX = hi[ 0 ], hiZ = hi[ 2 ], c = g.site.cave;
	for ( let j = 0; j < H; j ++ ) for ( let i = 0; i < W; i ++ ) {

		const x = lo[ 0 ] + ( i + 0.5 ) / W * ( hiX - lo[ 0 ] ), z = lo[ 2 ] + ( j + 0.5 ) / H * ( hiZ - lo[ 2 ] );
		const s = sample( g, x, 0.3, z, _s ), cut = carveAt( ...worldOf( c, - x, z ) );
		data[ ( j * W + i ) * 3 ] = clamp01( s[ 0 ] + s[ 2 ] * 2 / 3 );
		data[ ( j * W + i ) * 3 + 1 ] = clamp01( s[ 4 ] * 2 + s[ 8 ] * 0.5 );
		data[ ( j * W + i ) * 3 + 2 ] = cut ? cut.k : 0;

	}

	return { data, w: W, h: H, lo: [ lo[ 0 ], lo[ 2 ] ], hi: [ hiX, hiZ ] };

}

// every cave's map side by side (RGB: the sky, the glow, the cut floor); a cave not built yet open sky
export function caveLightTexture( maps ) {

	const [ W, H ] = CAVE_MAP, data = new Uint8Array( W * CAVES.length * H * 4 );
	for ( let k = 0; k < CAVES.length; k ++ ) {

		const m = maps[ k ];
		for ( let j = 0; j < H; j ++ ) for ( let i = 0; i < W; i ++ ) {

			const q = ( j * W * CAVES.length + k * W + i ) * 4, s = ( j * W + i ) * 3;
			data[ q ] = Math.round( 255 * ( m ? m.data[ s ] : 1 ) );
			data[ q + 1 ] = Math.round( 255 * ( m ? m.data[ s + 1 ] : 0 ) );
			data[ q + 2 ] = Math.round( 255 * ( m ? m.data[ s + 2 ] : 0 ) );
			data[ q + 3 ] = 255;

		}

	}

	const t = new THREE.DataTexture( data, W * CAVES.length, H, THREE.RGBAFormat );
	t.magFilter = t.minFilter = THREE.LinearFilter;
	t.needsUpdate = true;
	return t;

}

// the caves' plans for the shaders: each one's frame (its waterline's point, out to sea) and its map's span in it
// (the overhangs' frame: x the plan's -x)
export const CAVE_MAP_SPAN = CAVES.map( ( c ) => ( { lo: [ - 11.5, - c.inset - c.depth - 5 ], hi: [ 11.5, 1.5 ] } ) );
const g = ( x ) => {

	const s = Number( x ).toPrecision( 8 );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

export const SEA_CAVE_GLSL = /* glsl */`
uniform sampler2D seaCaveLight;
vec3 seaCaveLightAt( vec2 xz ) {
	vec3 L = vec3( 1.0, 0.0, 0.0 );
${ CAVES.map( ( c, k ) => {

		const S = CAVE_MAP_SPAN[ k ], [ ox, oz ] = c.out;
		return /* glsl */`	{
		vec2 d = xz - vec2( ${ g( c.x ) }, ${ g( c.z ) } );
		// (its frame: x across (the overhangs': the plan's -x), z out to sea)
		vec2 f = vec2( - ( d.x * ${ g( - oz ) } + d.y * ${ g( ox ) } ), d.x * ${ g( ox ) } + d.y * ${ g( oz ) } );
		vec2 u = ( f - vec2( ${ g( S.lo[ 0 ] ) }, ${ g( S.lo[ 1 ] ) } ) ) / vec2( ${ g( S.hi[ 0 ] - S.lo[ 0 ] ) }, ${ g( S.hi[ 1 ] - S.lo[ 1 ] ) } );
		if ( u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0 ) L = texture( seaCaveLight, vec2( ( clamp( u.x, 0.5 / ${ g( CAVE_MAP[ 0 ] ) }, 1.0 - 0.5 / ${ g( CAVE_MAP[ 0 ] ) } ) + ${ g( k ) } ) / ${ g( CAVES.length ) }, u.y ) ).rgb;
	}`;

	} ).join( '\n' ) }
	return L;
}
`;

// how calm the sea is in a cave's gully, inlet and cave (0 out at sea .. 1): no breakers there, nor a run-up
// sheet (its walls aren't a beach: on them the shore's waves stood up in spikes), a gentler surge (WaterSurface)
export const SEA_CAVE_CALM_GLSL = /* glsl */`
float seaCaveCalm( vec2 xz ) {
	float k = 0.0;
${ CAVES.map( ( c ) => {

		const [ ox, oz ] = c.out;
		return /* glsl */`	{
		vec2 d = xz - vec2( ${ g( c.x ) }, ${ g( c.z ) } );
		float fx = d.x * ${ g( - oz ) } + d.y * ${ g( ox ) }, fz = d.x * ${ g( ox ) } + d.y * ${ g( oz ) };
		if ( fz > ${ g( - c.inset - c.depth - 4 ) } ) k = max( k, smoothstep( ${ g( c.gully + 4 ) }, ${ g( c.gully - 10 ) }, fz ) * ( 1.0 - smoothstep( 6.0, 10.0, abs( fx ) ) ) );
	}`;

	} ).join( '\n' ) }
	return k;
}
`;

// (the same on the CPU, for the water's height there: WaterQuery)
export function seaCaveCalm( x, z ) {

	let k = 0;
	for ( const c of CAVES ) {

		const dx = x - c.x, dz = z - c.z, [ ox, oz ] = c.out, fx = dx * - oz + dz * ox, fz = dx * ox + dz * oz;
		if ( fz > - c.inset - c.depth - 4 ) k = Math.max( k, sstep( c.gully + 4, c.gully - 10, fz ) * ( 1 - sstep( 6, 10, Math.abs( fx ) ) ) );

	}

	return k;

}

const sstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// the shaders' texture: open sky everywhere until the caves are built (Rocks sets it)
export const seaCaveUniforms = { seaCaveLight: { value: caveLightTexture( [] ) } };
