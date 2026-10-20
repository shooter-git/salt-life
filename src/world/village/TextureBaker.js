import * as THREE from '../../engine/index.js';

// GPU-baked, tileable PBR texture sets for the village materials (WebGL 2).
//
// Every set is generated once, while the game loads (Village.init() -> bake( renderer )), by
// fullscreen fragment-shader passes into render targets; nothing is ever read back to the CPU:
//   1. a "fields" pass (one small program per set: only its own generator) writes height /
//      roughness / occlusion into a transient RGBA8 target (the height packed into two channels:
//      16 bits, enough for the Sobel normals) and, in the same pass (two draw buffers), the
//      albedo or mask map,
//   2. a derivation pass turns the height field into a tangent-space normal (Sobel filtered)
//      plus horizon-based ambient occlusion, packed as RG = normal xy, B = roughness, A = AO,
//      and a copy pass moves the albedo into its final (mipmapped) target.
// All final maps are RGBA8 (linear values), fully mipmapped by three, sampled repeat-wrapped,
// trilinear + up to 8x anisotropic. The transient targets are freed right after their set.
// (Tidewater ran the same generators as WebGPU compute kernels: 43 MB of maps; here their size
// follows the device tier, see SCALE: ~11 MB on low, ~19 MB on mid, 43 MB on high.)
//
// All noise is periodic over the texture tile so the maps tile seamlessly.
//
// Maps (tile size in metres):
//   woodA / woodN      weathered timber: grain, growth rings, knots, checks; A = paint chip field
//   paintN             paint film: brush strokes, crazing
//   roofA / roofN      corrugated sheet: ribs, screws, dents; A = rust, rust hue, fade, grime
//   thatchA / thatchN  layered palm fronds with frayed tips; A = tip mask
//   stoneA / stoneN    rubble masonry, pits, lichen; A = plaster survival field
//   hardA / hardN      worn metal: rust blooms, pits, scratches
//   grime              R streaks, G salt, B spots / barnacles, A macro variation
//   rope               three strand twist: R shade, G AO, BA normal
//   net                knotted diamond mesh: R alpha, G shade, BA normal
//
// Texel (px, py) of a map holds tile coordinate X = ( px + 0.5 ) / w, Y = ( py + 0.5 ) / h, so
// sampling at uv = ( X, Y ) returns it (gl_FragCoord.xy / size).
//
// Note on pow(): the generators square possibly negative values as x * x (pow() of a negative
// base is undefined).

const TAU = Math.PI * 2;

// the size of every map, relative to the sizes in SETS (Tidewater's), per device tier
const SCALE = { low: { all: 0.5 }, mid: { all: 0.5, wood: 1 }, high: { all: 1 } };

// ---------------------------------------------------------------------------
// Periodic noise library (compact: loops are real shader loops so programs compile fast)

const NOISE = /* glsl */`
#define VLG_TAU ${ TAU }

uint vlgHashU( float x, float y, float s ) {
	return ( uint( x ) * 1597334677u ) ^ ( uint( y ) * 3812015801u ) ^ ( uint( s ) * 2654435761u + 1013904223u );
}

// three.js TSL hash() (pcg), [0, 1)
float vlgPcg( uint seed ) {
	uint state = seed * 747796405u + 2891336453u;
	uint word = ( ( state >> ( ( state >> 28u ) + 4u ) ) ^ state ) * 277803737u;
	return float( ( word >> 22u ) ^ word ) * ( 1.0 / 4294967296.0 );
}

// three independent 10-bit randoms from one hash
vec3 vlgHash3( float x, float y, float s ) {
	uint h = uint( vlgPcg( vlgHashU( x, y, s ) ) * 1073741823.0 );
	return vec3( float( h & 1023u ), float( ( h >> 10u ) & 1023u ), float( ( h >> 20u ) & 1023u ) ) / 1023.0;
}

vec2 vlgWrapP( vec2 i, vec2 per ) { return i - per * floor( i / per ); }

float vlgGrad( float gx, float gy, float s, vec2 f, float ox, float oy ) {
	vec2 h = vlgHash3( gx, gy, s ).xy - 0.5;
	return h.x * ( f.x - ox ) + h.y * ( f.y - oy );
}

// periodic 2D gradient noise, roughly in [-1, 1]
float vlgPNoise( vec2 p, vec2 per, float s ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	vec2 i0 = vlgWrapP( i, per );
	vec2 i1 = vlgWrapP( i + 1.0, per );
	float n00 = vlgGrad( i0.x, i0.y, s, f, 0.0, 0.0 );
	float n10 = vlgGrad( i1.x, i0.y, s, f, 1.0, 0.0 );
	float n01 = vlgGrad( i0.x, i1.y, s, f, 0.0, 1.0 );
	float n11 = vlgGrad( i1.x, i1.y, s, f, 1.0, 1.0 );
	return mix( mix( n00, n10, u.x ), mix( n01, n11, u.x ), u.y ) * 3.4;
}

// periodic fBm (octave loop inside the shader)
float vlgPFbm( vec2 p, vec2 per, int oct, float s, float gain ) {
	float sum = 0.0;
	float amp = 1.0;
	float norm = 0.0;
	vec2 q = p;
	vec2 pp = per;
	for ( int o = 0; o < 8; o ++ ) {
		if ( o >= oct ) break;
		sum += vlgPNoise( q, pp, s + float( o ) * 17.0 ) * amp;
		norm += amp;
		amp *= gain;
		q *= 2.0;
		pp *= 2.0;
	}
	return sum / norm;
}

// periodic cellular noise: returns vec4( F1, F2, cellId, 0 )
vec4 vlgPWorley( vec2 p, vec2 per, float s, float jit ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	float d1 = 9.0;
	float d2 = 9.0;
	float id = 0.0;
	for ( int cy = -1; cy < 2; cy ++ ) {
		for ( int cx = -1; cx < 2; cx ++ ) {
			vec2 o = vec2( float( cx ), float( cy ) );
			vec2 c = vlgWrapP( i + o, per );
			vec3 h = vlgHash3( c.x, c.y, s );
			float d = length( o + ( h.xy - 0.5 ) * jit + 0.5 - f );
			if ( d < d1 ) {
				d2 = d1;
				d1 = d;
				id = h.z;
			} else if ( d < d2 ) {
				d2 = d;
			}
		}
	}
	return vec4( d1, d2, id, 0.0 );
}

// periodic cellular noise returning the offset to the nearest feature: vec4( rel.x, rel.y, F1, cellId )
vec4 vlgPWorleyRel( vec2 p, vec2 per, float s, float jit ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	float d1 = 9.0;
	vec2 rel = vec2( 0.0 );
	float id = 0.0;
	for ( int cy = -1; cy < 2; cy ++ ) {
		for ( int cx = -1; cx < 2; cx ++ ) {
			vec2 o = vec2( float( cx ), float( cy ) );
			vec2 c = vlgWrapP( i + o, per );
			vec3 h = vlgHash3( c.x, c.y, s );
			vec2 dv = f - ( o + ( h.xy - 0.5 ) * jit + 0.5 );
			float d = length( dv );
			if ( d < d1 ) {
				d1 = d;
				rel = dv;
				id = h.z;
			}
		}
	}
	return vec4( rel, d1, id );
}

// convenience wrappers (fx, fy: integer frequencies over the tile)
float vlgPn( float X, float Y, float fx, float fy, float s ) { return vlgPNoise( vec2( X * fx, Y * fy ), vec2( fx, fy ), s ); }
float vlgPf( float X, float Y, float fx, float fy, int oct, float s, float gain ) { return vlgPFbm( vec2( X * fx, Y * fy ), vec2( fx, fy ), oct, s, gain ); }
vec4 vlgPw( float X, float Y, float fx, float fy, float s, float jit ) { return vlgPWorley( vec2( X * fx, Y * fy ), vec2( fx, fy ), s, jit ); }
vec4 vlgPwr( float X, float Y, float fx, float fy, float s, float jit ) { return vlgPWorleyRel( vec2( X * fx, Y * fy ), vec2( fx, fy ), s, jit ); }
float vlgN01( float n ) { return n * 0.5 + 0.5; }
float vlgHf( float a, float b ) { return fract( sin( a * 12.9898 + b * 78.233 ) * 43758.5453 ); }
float vlgBand( float x, float a, float b, float c, float d ) { return smoothstep( a, b, x ) * ( 1.0 - smoothstep( c, d, x ) ); }

struct VlgOut {
	vec4 fields; // height, roughness, occlusion, 0
	vec4 albedo; // albedo / mask map
};
`;

// ---------------------------------------------------------------------------
// Texture set generators. Each returns VlgOut { fields: vec4( height, roughness, occlusion, 0 ), albedo }
// X, Y are tile coordinates in [0, 1).

const GENERATORS = {

	// WEATHERED WOOD - tile = 2 m along the grain (X) x 1 m across (Y)
	wood: /* glsl */`
VlgOut vlgGen( float X, float Y ) {
	// knots with grain flowing around them
	vec4 kw = vlgPwr( X, Y, 6.0, 10.0, 11.0, 0.7 );
	float kHas = step( 0.9, kw.w );
	float kRad = 0.01 + vlgHf( kw.w, 3.3 ) * 0.013;
	float kdm = length( vec2( kw.x * ( 2.0 / 6.0 ), kw.y * ( 1.0 / 10.0 ) ) );
	float kInfl = exp( - ( kdm / ( kRad * 2.4 ) ) ) * kHas;

	// growth rings with uneven spacing and per-ring width / contrast
	float warpA = vlgPf( X, Y, 2.0, 4.0, 3, 21.0, 0.5 );
	float warpB = vlgPf( X, Y, 1.0, 2.0, 2, 23.0, 0.5 );
	float r = Y * 110.0 + warpA * 5.0 + warpB * 14.0 + kInfl * 14.0;
	float ringId = floor( r );
	float ringIdW = ringId - floor( ringId / 110.0 ) * 110.0;
	float w = fract( r );
	float lw = mix( 0.09, 0.32, vlgHf( ringIdW, 5.1 ) );
	float late = smoothstep( 0.93 - lw, 1.0 - lw, w ) * ( 1.0 - smoothstep( 0.9, 0.995, w ) );
	float ringDark = mix( 0.65, 1.15, vlgHf( ringIdW, 9.7 ) );

	// dense fibre streaks along the grain (the signature of sun-weathered timber)
	float fA = vlgN01( vlgPn( X, Y, 12.0, 300.0, 53.0 ) );
	float fB = vlgN01( vlgPn( X, Y, 5.0, 140.0, 55.0 ) );
	float fC = vlgN01( vlgPn( X, Y, 16.0, 400.0, 57.0 ) );
	float streak = fA * 0.5 + fB * 0.3 + fC * 0.2;
	float erosion = ( 1.0 - late ) * ( fB * 0.6 + 0.4 );

	// checks / cracks along the grain, tapering at the ends
	float crN = abs( vlgPn( X, Y, 6.0, 60.0, 71.0 ) );
	float crMask = smoothstep( 0.1, 0.45, vlgPf( X, Y, 3.0, 4.0, 2, 73.0, 0.5 ) );
	float crack = ( 1.0 - smoothstep( 0.012, 0.055, crN / ( crMask + 0.05 ) ) ) * step( 0.05, crMask );

	float kCore = ( 1.0 - smoothstep( kRad * 0.72, kRad, kdm ) ) * kHas;
	float kRing = vlgBand( kdm, kRad * 0.92, kRad * 1.02, kRad * 1.05, kRad * 1.3 ) * kHas;

	float height = 0.46 + late * 0.22 * ringDark - erosion * 0.09 + ( streak - 0.5 ) * 0.14
		- crack * 0.36 + kCore * 0.08 - kRing * 0.22;

	// silver grey surface, brown-grey eroded grooves, fibre streaks, stains and bleaching
	float blotch = vlgN01( vlgPf( X, Y, 2.0, 3.0, 3, 81.0, 0.5 ) );
	float bleach = smoothstep( 0.5, 0.82, vlgN01( vlgPf( X, Y, 3.0, 2.0, 3, 83.0, 0.5 ) ) );
	float stain = smoothstep( 0.58, 0.86, vlgN01( vlgPf( X, Y, 4.0, 5.0, 3, 85.0, 0.5 ) ) );
	// sun-bleached driftwood grey (linear albedo ~0.2 in the grooves, ~0.45 on the latewood)
	vec3 grooveC = vec3( 0.2, 0.186, 0.168 );
	vec3 silverC = vec3( 0.45, 0.445, 0.428 );
	vec3 col = mix( grooveC, silverC, clamp( late * ringDark * 0.55 + streak * 0.75 - 0.12, 0.0, 1.0 ) );
	col = col * ( fA * 0.34 + 0.83 );
	col = col * ( 1.0 - smoothstep( 0.7, 0.95, fC ) * 0.3 );
	col = col * ( blotch * 0.24 + 0.88 );
	col = mix( col, vec3( 0.55, 0.54, 0.51 ), bleach * 0.3 );
	col = mix( col, col * vec3( 0.8, 0.68, 0.54 ), stain * 0.6 );
	col = mix( col, vec3( 0.035, 0.03, 0.026 ), crack * 0.92 );
	col = mix( col, mix( vec3( 0.13, 0.085, 0.05 ), vec3( 0.07, 0.045, 0.03 ), fract( kdm * 900.0 ) ), kCore );
	col = mix( col, vec3( 0.05, 0.04, 0.03 ), kRing * 0.8 );

	// paint chip field (A): paint lets go in grain-aligned flakes, first at cracks, knots and eroded grain
	vec4 flake = vlgPw( X, Y, 30.0, 80.0, 91.0, 0.9 );
	float chipLarge = vlgN01( vlgPf( X, Y, 4.0, 8.0, 4, 97.0, 0.5 ) );
	float chip = chipLarge * 0.62 + flake.z * 0.3 + late * 0.06 - erosion * 0.04
		- crack * 0.4 - kCore * 0.1;

	float rough = clamp( 0.82 + erosion * 0.1 + fA * 0.04 + crack * 0.08 - kCore * 0.15, 0.0, 1.0 );
	float occ = 1.0 - crack * 0.65 - kRing * 0.4 - erosion * 0.08;
	return VlgOut( vec4( height, rough, occ, 0.0 ), vec4( col, clamp( chip, 0.0, 1.0 ) ) );
}
`,

	// PAINT FILM - tile = 1 m along the grain (X) x 0.5 m across (Y): brush strokes and crazing
	paint: /* glsl */`
VlgOut vlgGen( float X, float Y ) {
	float strokes = vlgPn( X, Y, 4.0, 60.0, 701.0 ) * 0.25 + vlgPn( X, Y, 16.0, 160.0, 703.0 ) * 0.12 + vlgPn( X, Y, 2.0, 12.0, 704.0 ) * 0.2;
	vec4 cz = vlgPw( X, Y, 34.0, 40.0, 705.0, 1.0 );
	float crazeMask = smoothstep( 0.62, 0.85, vlgN01( vlgPf( X, Y, 3.0, 2.0, 3, 707.0, 0.5 ) ) );
	float craze = ( 1.0 - smoothstep( 0.015, 0.04, cz.y - cz.x ) ) * crazeMask;
	float height = 0.5 + strokes - craze * 0.12;
	float rough = clamp( 0.5 + strokes * 0.35 + craze * 0.15, 0.0, 1.0 );
	float occ = 1.0 - craze * 0.18;
	return VlgOut( vec4( height, rough, occ, 0.0 ), vec4( 0.0 ) );
}
`,

	// GRIME / SALT - tile = 2 m x 2 m in mesh space (X along the wall, Y up)
	grime: /* glsl */`
VlgOut vlgGen( float X, float Y ) {
	float streak = smoothstep( 0.55, 0.9, vlgN01( vlgPn( X, Y, 26.0, 2.0, 601.0 ) ) ) * smoothstep( 0.35, 0.7, vlgN01( vlgPf( X, Y, 4.0, 3.0, 2, 603.0, 0.5 ) ) );
	float drip = smoothstep( 0.6, 0.95, vlgN01( vlgPn( X, Y, 70.0, 4.0, 604.0 ) ) ) * 0.5;
	float salt = smoothstep( 0.52, 0.8, vlgN01( vlgPf( X, Y, 4.0, 4.0, 5, 605.0, 0.5 ) ) ) * ( vlgN01( vlgPn( X, Y, 120.0, 120.0, 607.0 ) ) * 0.5 + 0.5 );
	vec4 mw = vlgPw( X, Y, 60.0, 60.0, 609.0, 1.0 );
	float mildew = ( 1.0 - smoothstep( 0.05, 0.22, mw.x ) ) * step( 0.6, vlgN01( vlgPf( X, Y, 3.0, 3.0, 3, 611.0, 0.5 ) ) );
	float macroV = vlgN01( vlgPf( X, Y, 2.0, 2.0, 3, 613.0, 0.5 ) );
	return VlgOut( vec4( 0.0 ), vec4( clamp( streak + drip, 0.0, 1.0 ), salt, mildew, macroV ) );
}
`,

	// CORRUGATED ROOF SHEET - tile = 0.84 m across the ribs (X, 8 ribs) x 1.68 m down the slope (Y, 3 purlins)
	roof: /* glsl */`
VlgOut vlgGen( float X, float Y ) {
	float corr = sin( ( X * 8.0 - 0.25 ) * VLG_TAU ) * 0.5 + 0.5;
	float valley = 1.0 - corr;
	// screws with washers on every second crest at each purlin
	float sx = ( fract( X * 4.0 - 0.25 + 0.5 ) - 0.5 ) * ( 0.84 / 4.0 );
	float sy = ( fract( Y * 3.0 - 0.5 + 0.5 ) - 0.5 ) * ( 1.68 / 3.0 );
	float ds = length( vec2( sx, sy ) );
	float washer = 1.0 - smoothstep( 0.0095, 0.0115, ds );
	float hq = ds / 0.0065;
	float head = sqrt( max( 1.0 - hq * hq, 0.0 ) );
	// dents, rust pitting
	vec4 dw = vlgPw( X, Y, 5.0, 10.0, 13.0, 0.9 );
	float dent = step( 0.7, dw.z ) * ( 1.0 - smoothstep( 0.0, 0.5, dw.x ) );
	float blot = vlgN01( vlgPf( X, Y, 3.0, 5.0, 5, 31.0, 0.5 ) );
	float vstreak = vlgN01( vlgPn( X, Y, 48.0, 3.0, 33.0 ) );
	float sq = sx / 0.007;
	float screwStreak = exp( - ( sq * sq ) ) * smoothstep( - 0.35, - 0.01, sy ) * step( sy, 0.004 )
		* ( vlgN01( vlgPn( X, Y, 16.0, 6.0, 35.0 ) ) * 0.8 + 0.2 );
	float edge = 1.0 - smoothstep( 0.0, 0.05, min( X, 1.0 - X ) * 0.84 );
	float streakLong = smoothstep( 0.55, 0.85, vlgN01( vlgPn( X, Y, 64.0, 2.0, 39.0 ) ) ) * vlgN01( vlgPf( X, Y, 4.0, 6.0, 2, 45.0, 0.5 ) );
	float rust = clamp( blot * 0.42 + vstreak * valley * 0.25 + streakLong * 0.35 + screwStreak * 0.7 + washer * 0.45 + edge * 0.3 + dent * 0.15 - 0.05, 0.0, 1.0 );
	float pit = vlgPn( X, Y, 150.0, 300.0, 37.0 ) * smoothstep( 0.45, 0.8, rust );
	float lapLine = 1.0 - smoothstep( 0.0012, 0.0028, abs( X * 0.84 - 0.028 ) );
	float lapTop = 1.0 - smoothstep( 0.026, 0.03, X * 0.84 );
	float height = corr * 0.9 + washer * 0.035 + head * 0.05 - dent * 0.1 + pit * 0.012 + lapTop * 0.012;

	float rustVar = vlgN01( vlgPf( X, Y, 10.0, 20.0, 3, 41.0, 0.5 ) );
	float fade = clamp( vlgN01( vlgPf( X, Y, 2.0, 4.0, 4, 43.0, 0.5 ) ) * 0.8 + corr * 0.25, 0.0, 1.0 );
	float grime = clamp( valley * vlgN01( vlgPn( X, Y, 32.0, 2.0, 47.0 ) ) * 0.8 + blot * 0.2, 0.0, 1.0 );
	float rough = clamp( 0.5 + ( vlgN01( vlgPn( X, Y, 20.0, 40.0, 49.0 ) ) - 0.5 ) * 0.25 + fade * 0.1, 0.0, 1.0 );
	float occ = 1.0 - lapLine * 0.7 - vlgBand( ds, 0.0095, 0.011, 0.012, 0.016 ) * 0.35;
	return VlgOut( vec4( height, rough, occ, 0.0 ), vec4( rust, rustVar, fade, grime ) );
}
`,

	// PALM THATCH - tile = 1 m along the eave (X) x 1 m up the slope (Y), 5 layered rows
	thatch: /* glsl */`
struct VlgRow { float tip; float sf; float rnd; };

#define VLG_R 5.0

VlgRow vlgRow( float X, float rowF, float k ) {
	float kk = k - floor( k / VLG_R ) * VLG_R;
	float warp = vlgPNoise( vec2( X * 7.0, kk * 3.1 ), vec2( 7.0, 1000.0 ), 131.0 );
	// strands lean a little, in coherent groups, so they are not perfectly parallel
	float lean = vlgPNoise( vec2( X * 9.0, kk * 5.3 ), vec2( 9.0, 1000.0 ), 133.0 );
	float s = max( rowF - k, - 0.5 );
	float sc = X * 110.0 + warp * 1.3 + lean * s * 2.2;
	float sid = floor( sc );
	float sidW = sid - floor( sid / 110.0 ) * 110.0;
	float sf = fract( sc );
	float rnd = vlgHf( sidW + kk * 211.0, kk * 7.3 + 1.0 );
	float lump = vlgN01( vlgPNoise( vec2( X * 5.0, kk * 2.3 ), vec2( 5.0, 1000.0 ), 137.0 ) );
	float lump2 = vlgN01( vlgPNoise( vec2( X * 2.0, kk * 1.7 ), vec2( 2.0, 1000.0 ), 139.0 ) );
	float hang = 0.06 + lump * 0.14 + lump2 * 0.16 + rnd * rnd * 0.22;
	return VlgRow( k - hang, sf, rnd );
}

VlgOut vlgGen( float X, float Y ) {
	// rows wave up and down along the eave and are unevenly spaced
	float rowWarp = vlgPn( X, Y, 3.0, 1.0, 143.0 ) * 0.22 + vlgPn( X, Y, 7.0, 2.0, 145.0 ) * 0.1;
	float rowF = Y * VLG_R + rowWarp;
	float k0 = floor( rowF );

	VlgRow r0 = vlgRow( X, rowF, k0 );
	VlgRow r1 = vlgRow( X, rowF, k0 + 1.0 );
	VlgRow r2 = vlgRow( X, rowF, k0 + 2.0 );
	float in1 = step( r1.tip, rowF );
	float tip = mix( r0.tip, r1.tip, in1 );
	float nextTip = mix( r1.tip, r2.tip, in1 );
	float sf = mix( r0.sf, r1.sf, in1 );
	float rnd = mix( r0.rnd, r1.rnd, in1 );
	float s = rowF - tip;
	float dNext = nextTip - rowF;

	float bulge = sin( sf * ${ Math.PI } );
	float tipZone = 1.0 - smoothstep( 0.0, 0.16, s );
	// frayed tips and gaps between strands reveal the darker layer underneath
	float gapW = mix( 0.43, 0.3, tipZone ) - vlgHf( rnd, 2.2 ) * 0.06;
	float gap = smoothstep( gapW, gapW + 0.05, abs( sf - 0.5 ) );
	float fibre = vlgPn( X, Y, 330.0, 6.0, 139.0 );
	float fibre2 = vlgPn( X, Y, 160.0, 3.0, 141.0 );
	float height = 0.92 - min( s, 1.3 ) / 1.3 * 0.55 + bulge * 0.08 + fibre * 0.03 - gap * 0.32;

	vec3 golden = vec3( 0.42, 0.3, 0.13 );
	vec3 pale = vec3( 0.5, 0.43, 0.27 );
	vec3 brown = vec3( 0.24, 0.165, 0.09 );
	vec3 grey = vec3( 0.34, 0.31, 0.26 );
	vec3 col = mix( golden, pale, smoothstep( 0.25, 0.75, rnd ) );
	col = mix( col, brown, step( 0.85, rnd ) * 0.75 );
	col = mix( col, grey, smoothstep( 0.1, 0.5, vlgHf( rnd, 9.1 ) ) * 0.4 );
	col = col * ( vlgN01( fibre ) * 0.38 + 0.8 ) * ( vlgN01( fibre2 ) * 0.2 + 0.9 );
	col = mix( col, grey * 1.18, tipZone * 0.4 );
	col = col * ( 1.0 - smoothstep( 0.55, 1.25, s ) * 0.3 );
	col = mix( col, vec3( 0.07, 0.055, 0.035 ), gap * 0.85 );
	float occ = ( smoothstep( 0.0, 0.32, dNext ) * 0.7 + 0.3 ) * ( bulge * 0.25 + 0.75 ) * ( 1.0 - gap * 0.6 );
	float rough = 0.88 + fibre * 0.05;
	return VlgOut( vec4( height, rough, occ, 0.0 ), vec4( col, tipZone ) );
}
`,

	// RUBBLE STONE WITH MORTAR - tile = 2 m x 2 m: warped, rounded stones with mottling and lichen
	stone: /* glsl */`
VlgOut vlgGen( float X, float Y ) {
	float wx = vlgPf( X, Y, 4.0, 4.0, 2, 213.0, 0.5 ) * 0.45;
	float wy = vlgPf( X, Y, 4.0, 4.0, 2, 215.0, 0.5 ) * 0.45;
	vec4 W = vlgPWorley( vec2( X * 7.0 + wx, Y * 12.0 + wy ), vec2( 7.0, 12.0 ), 201.0, 0.85 );
	float edge = W.y - W.x;
	float mortar = 1.0 - smoothstep( 0.035, 0.085, edge );
	float dome = pow( smoothstep( 0.02, 0.5, edge ), 0.7 );
	float surf = vlgPf( X, Y, 24.0, 24.0, 4, 203.0, 0.5 );
	vec4 pits = vlgPw( X, Y, 70.0, 70.0, 207.0, 1.0 );
	float porous = step( 0.55, vlgHf( W.z, 4.2 ) );
	float pitSize = mix( 0.1, 0.19, vlgHf( pits.z, 1.7 ) );
	float pit = ( 1.0 - smoothstep( pitSize * 0.6, pitSize, pits.x ) ) * step( 0.4, pits.z ) * ( porous * 0.75 + 0.25 );
	float sandy = vlgPn( X, Y, 140.0, 140.0, 209.0 );
	float height = 0.2 + dome * 0.46 + surf * 0.11 + vlgPn( X, Y, 200.0, 200.0, 229.0 ) * 0.025 - pit * 0.16 - mortar * 0.12 + sandy * 0.02;

	float id = W.z;
	// coral stone / limestone: warm beiges with the odd darker basalt and pale block
	vec3 c0 = vec3( 0.55, 0.5, 0.41 );
	vec3 c1 = vec3( 0.47, 0.45, 0.41 );
	vec3 c2 = vec3( 0.42, 0.37, 0.3 );
	vec3 c3 = vec3( 0.3, 0.29, 0.27 );
	vec3 c4 = vec3( 0.64, 0.6, 0.52 );
	vec3 col = mix( c0, c1, smoothstep( 0.2, 0.4, id ) );
	col = mix( col, c2, smoothstep( 0.5, 0.62, id ) );
	col = mix( col, c3, smoothstep( 0.8, 0.86, id ) * 0.8 );
	col = mix( col, c4, smoothstep( 0.9, 0.97, id ) );
	// mottling, veins and weathering inside each stone
	float mott = vlgN01( vlgPf( X, Y, 10.0, 10.0, 4, 217.0, 0.5 ) );
	float vein = ( 1.0 - smoothstep( 0.0, 0.035, abs( vlgPf( X, Y, 6.0, 6.0, 3, 219.0, 0.5 ) ) ) ) * step( 0.6, vlgHf( id, 6.6 ) );
	float speck = vlgN01( vlgPn( X, Y, 300.0, 300.0, 225.0 ) );
	float grain = vlgN01( vlgPn( X, Y, 120.0, 120.0, 227.0 ) );
	col = col * ( mott * 0.6 + 0.68 ) * ( vlgN01( surf ) * 0.3 + 0.85 ) * ( speck * 0.34 + 0.83 ) * ( grain * 0.22 + 0.89 );
	col = col * mix( 0.66, 1.0, smoothstep( 0.04, 0.28, edge ) );
	col = mix( col, col * 1.25, vein * 0.5 );
	// lichen: pale grey-green and dark specks
	float lich = smoothstep( 0.62, 0.8, vlgN01( vlgPf( X, Y, 8.0, 8.0, 3, 221.0, 0.5 ) ) ) * smoothstep( 0.4, 0.6, vlgN01( vlgPn( X, Y, 60.0, 60.0, 223.0 ) ) );
	col = mix( col, vec3( 0.42, 0.44, 0.36 ), lich * 0.45 );
	col = col * ( 1.0 - pit * 0.5 );
	col = mix( col, vec3( 0.5, 0.47, 0.41 ) * ( vlgN01( sandy ) * 0.3 + 0.85 ), mortar );
	col = col * ( 1.0 - vlgBand( edge, 0.03, 0.06, 0.08, 0.16 ) * 0.3 );
	float plaster = clamp( vlgN01( vlgPf( X, Y, 3.0, 3.0, 5, 211.0, 0.5 ) ) - mortar * 0.08, 0.0, 1.0 );
	float rough = 0.84 + surf * 0.06 + mortar * 0.1 - lich * 0.05;
	float occ = 1.0 - pit * 0.55 - mortar * 0.3;
	return VlgOut( vec4( height, rough, occ, 0.0 ), vec4( col, plaster ) );
}
`,

	// WORN METAL / PLASTIC - tile = 1 m x 1 m: rust blooms, pits, scratches, grime
	hard: /* glsl */`
VlgOut vlgGen( float X, float Y ) {
	float base = vlgN01( vlgPf( X, Y, 4.0, 4.0, 5, 401.0, 0.5 ) );
	vec4 sp = vlgPw( X, Y, 16.0, 16.0, 403.0, 1.0 );
	float spots = ( 1.0 - smoothstep( 0.1, 0.38, sp.x ) ) * step( 0.5, sp.z );
	float rust = clamp( base * 0.8 + spots * 0.35 - 0.08, 0.0, 1.0 );
	float sMask = smoothstep( 0.2, 0.6, vlgN01( vlgPf( X, Y, 3.0, 3.0, 2, 413.0, 0.5 ) ) );
	float s1 = 1.0 - smoothstep( 0.008, 0.03, abs( vlgPn( X, Y, 3.0, 90.0, 405.0 ) ) );
	float s2 = 1.0 - smoothstep( 0.008, 0.03, abs( vlgPn( X, Y, 90.0, 3.0, 407.0 ) ) );
	float scratch = max( s1, s2 ) * sMask;
	float grime = vlgN01( vlgPf( X, Y, 3.0, 3.0, 3, 409.0, 0.5 ) );
	vec4 pw2 = vlgPw( X, Y, 90.0, 90.0, 411.0, 1.0 );
	float pit = ( 1.0 - smoothstep( 0.1, 0.28, pw2.x ) ) * smoothstep( 0.4, 0.8, rust );
	float bump = vlgPn( X, Y, 40.0, 40.0, 415.0 ) * 0.04 * rust;
	float height = 0.5 - pit * 0.3 - scratch * 0.12 + bump;
	float rough = clamp( 0.5 + rust * 0.3 - scratch * 0.25 + grime * 0.08, 0.0, 1.0 );
	float occ = 1.0 - pit * 0.5;
	return VlgOut( vec4( height, rough, occ, 0.0 ), vec4( rust, scratch, grime, 0.0 ) );
}
`,

	// three-strand rope, tile = one circumference long x full circumference around
	rope: /* glsl */`
float vlgRopeH( vec2 q ) {
	float phi = ( q.x + q.y ) * 3.0;
	float sf = fract( phi );
	float a = sf * 2.0 - 1.0;
	float prof = sqrt( max( 1.0 - a * a, 0.0 ) );
	float yarn = fract( sf * 3.0 + ( q.x - q.y ) * 6.0 );
	float b = yarn * 2.0 - 1.0;
	float yprof = sqrt( max( 1.0 - b * b, 0.0 ) );
	float fuzz = vlgPNoise( q * 64.0, vec2( 64.0 ), 801.0 );
	return prof * 0.8 + yprof * prof * 0.2 + fuzz * 0.03;
}

VlgOut vlgGen( float X, float Y ) {
	vec2 q = vec2( X, Y );
	float e = 1.0 / 256.0;
	float hx = vlgRopeH( q + vec2( e, 0.0 ) ) - vlgRopeH( q - vec2( e, 0.0 ) );
	float hy = vlgRopeH( q + vec2( 0.0, e ) ) - vlgRopeH( q - vec2( 0.0, e ) );
	vec3 n = normalize( vec3( hx * ( - 0.09 / ( 2.0 * e ) ), hy * ( - 0.09 / ( 2.0 * e ) ), 1.0 ) );
	float h = vlgRopeH( q );
	float fib = vlgN01( vlgPNoise( vec2( ( X + Y ) * 40.0, ( X - Y ) * 160.0 ), vec2( 40.0, 160.0 ), 803.0 ) );
	float lum = 0.45 + h * 0.4 + fib * 0.15;
	float ao = 0.3 + smoothstep( 0.0, 0.7, h ) * 0.7;
	return VlgOut( vec4( 0.0 ), vec4( lum, ao, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5 ) );
}
`,

	// knotted diamond fishing net, tile = 0.2 m (4 x 4 meshes)
	net: /* glsl */`
float vlgNetH( vec2 q ) {
	float a = ( q.x + q.y ) * 4.0;
	float b = ( q.x - q.y ) * 4.0;
	float da = 0.5 - abs( fract( a ) - 0.5 );
	float db = 0.5 - abs( fract( b ) - 0.5 );
	float w = 0.055;
	float qa = da / w;
	float qb = db / w;
	float la = sqrt( max( 1.0 - qa * qa, 0.0 ) ) * ( abs( fract( b * 14.0 ) - 0.5 ) * 0.25 + 0.8 );
	float lb = sqrt( max( 1.0 - qb * qb, 0.0 ) ) * ( abs( fract( a * 14.0 ) - 0.5 ) * 0.25 + 0.8 );
	float qk = length( vec2( da, db ) ) / 0.1;
	float knot = sqrt( max( 1.0 - qk * qk, 0.0 ) ) * 1.35;
	return max( max( la, lb ), knot );
}

VlgOut vlgGen( float X, float Y ) {
	vec2 q = vec2( X, Y );
	float e = 1.0 / 256.0;
	float h = vlgNetH( q );
	float hx = vlgNetH( q + vec2( e, 0.0 ) ) - vlgNetH( q - vec2( e, 0.0 ) );
	float hy = vlgNetH( q + vec2( 0.0, e ) ) - vlgNetH( q - vec2( 0.0, e ) );
	vec3 n = normalize( vec3( hx * ( - 0.012 / ( 2.0 * e ) ), hy * ( - 0.012 / ( 2.0 * e ) ), 1.0 ) );
	float alpha = smoothstep( 0.0, 0.18, h );
	float shade = 0.45 + min( h, 1.0 ) * 0.55;
	return VlgOut( vec4( 0.0 ), vec4( alpha, shade, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5 ) );
}
`,

};

// ---------------------------------------------------------------------------
// Passes. The height is packed into two 8-bit channels (16 bits over [-0.5, 1.5]).

const VERTEX = /* glsl */`
in vec3 position;
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

const HEADER = 'precision highp float;\nprecision highp int;\n';

const PACK = /* glsl */`
vec4 vlgPackFields( vec4 f ) {
	float v = clamp( f.x * 0.5 + 0.25, 0.0, 1.0 ) * 65535.0;
	float hi = floor( v / 256.0 );
	float lo = floor( v - hi * 256.0 );
	return vec4( hi / 255.0, lo / 255.0, clamp( f.y, 0.0, 1.0 ), clamp( f.z, 0.0, 1.0 ) );
}
`;

// fields (+ albedo in the second draw buffer), or the albedo / mask map alone
function fieldsShader( name, fields, albedo ) {

	const outs = fields && albedo
		? 'layout( location = 0 ) out vec4 vlgOutFields;\nlayout( location = 1 ) out vec4 vlgOutAlbedo;\n'
		: 'layout( location = 0 ) out vec4 vlgOut;\n';
	const write = fields && albedo
		? '\tvlgOutFields = vlgPackFields( r.fields );\n\tvlgOutAlbedo = r.albedo;\n'
		: fields ? '\tvlgOut = vlgPackFields( r.fields );\n' : '\tvlgOut = r.albedo;\n';
	return HEADER + 'uniform vec2 vlgSize;\n' + outs + NOISE + PACK + GENERATORS[ name ] + /* glsl */`
void main() {
	vec2 t = gl_FragCoord.xy / vlgSize;
	VlgOut r = vlgGen( t.x, t.y );
${ write }}
`;

}

// Derivation pass: Sobel normal + horizon AO from the height field. Taps read the field map like the
// TSL version's nearest-filtered, repeat-wrapped texture(): texel floor( pixel centre + offset ), wrapped.
const DERIVE = HEADER + /* glsl */`
uniform highp sampler2D vlgFields;
uniform vec2 vlgSlope; // height scale / metres per texel (x, y)
uniform vec2 vlgAO; // AO strength, height scale / mean metres per texel
uniform vec2 vlgRadii; // horizon AO tap radii (texels)
layout( location = 0 ) out vec4 vlgNRA;

vec4 vlgTap( vec2 px, vec2 o ) {
	ivec2 dim = textureSize( vlgFields, 0 );
	ivec2 p = ivec2( floor( px + o ) );
	p -= dim * ivec2( floor( vec2( p ) / vec2( dim ) ) );
	vec4 t = texelFetch( vlgFields, p, 0 );
	float hi = floor( t.r * 255.0 + 0.5 );
	float lo = floor( t.g * 255.0 + 0.5 );
	return vec4( ( ( hi * 256.0 + lo ) / 65535.0 - 0.25 ) * 2.0, t.b, t.a, 0.0 );
}

void main() {
	vec2 px = gl_FragCoord.xy;
	float tl = vlgTap( px, vec2( -1.0, 1.0 ) ).x;
	float t = vlgTap( px, vec2( 0.0, 1.0 ) ).x;
	float tr = vlgTap( px, vec2( 1.0, 1.0 ) ).x;
	float l = vlgTap( px, vec2( -1.0, 0.0 ) ).x;
	float r = vlgTap( px, vec2( 1.0, 0.0 ) ).x;
	float bl = vlgTap( px, vec2( -1.0, -1.0 ) ).x;
	float b = vlgTap( px, vec2( 0.0, -1.0 ) ).x;
	float br = vlgTap( px, vec2( 1.0, -1.0 ) ).x;
	vec4 c = vlgTap( px, vec2( 0.0 ) );
	float dX = ( tr + r * 2.0 + br - ( tl + l * 2.0 + bl ) ) / 8.0;
	float dY = ( tl + t * 2.0 + tr - ( bl + b * 2.0 + br ) ) / 8.0;
	vec3 n = normalize( vec3( - dX * vlgSlope.x, - dY * vlgSlope.y, 1.0 ) );
	// horizon based occlusion: 8 directions x 2 radii
	float occ = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		float a = float( i ) / 8.0 * VLG_TAU + 0.3;
		vec2 d = vec2( cos( a ), sin( a ) );
		occ += clamp( ( vlgTap( px, d * vlgRadii.x ).x - c.x ) * vlgAO.y / vlgRadii.x * 1.6, 0.0, 1.0 );
		occ += clamp( ( vlgTap( px, d * vlgRadii.y ).x - c.x ) * vlgAO.y / vlgRadii.y * 1.6, 0.0, 1.0 );
	}
	float ao = clamp( 1.0 - occ / 16.0 * vlgAO.x, 0.0, 1.0 ) * c.z;
	vlgNRA = vec4( n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, c.y, ao );
}
`.replace( 'VLG_TAU', TAU.toString() );

// the albedo from the transient target into its final (mipmapped) one
const COPY = HEADER + /* glsl */`
uniform highp sampler2D vlgSrc;
layout( location = 0 ) out vec4 vlgOut;
void main() { vlgOut = texelFetch( vlgSrc, ivec2( gl_FragCoord.xy ), 0 ); }
`;

// ---------------------------------------------------------------------------
// Bake orchestration.

// out: name of the albedo / mask map, nra: name of the normal-roughness-AO map. Sizes: Tidewater's
// (the high tier); mx / my: metres covered by the tile; hs: height scale (m); ao: AO strength.
const SETS = [
	{ name: 'wood', w: 1024, h: 1024, mx: 2.0, my: 1.0, hs: 0.0022, ao: 1.2, out: 'woodA', nra: 'woodN' },
	{ name: 'paint', w: 512, h: 512, mx: 1.0, my: 0.5, hs: 0.0016, ao: 0.6, out: null, nra: 'paintN' },
	{ name: 'roof', w: 512, h: 1024, mx: 0.84, my: 1.68, hs: 0.022, ao: 0.9, out: 'roofA', nra: 'roofN' },
	{ name: 'thatch', w: 1024, h: 1024, mx: 1.0, my: 1.0, hs: 0.035, ao: 1.3, out: 'thatchA', nra: 'thatchN' },
	{ name: 'stone', w: 1024, h: 1024, mx: 2.0, my: 2.0, hs: 0.02, ao: 1.1, out: 'stoneA', nra: 'stoneN' },
	{ name: 'hard', w: 512, h: 512, mx: 1.0, my: 1.0, hs: 0.0012, ao: 0.8, out: 'hardA', nra: 'hardN' },
	{ name: 'grime', w: 512, h: 512, out: 'grime', nra: null },
	{ name: 'rope', w: 256, h: 256, out: 'rope', nra: null },
	{ name: 'net', w: 256, h: 256, out: 'net', nra: null },
];

// RGBA8, full mip chain, trilinear + anisotropic, repeat
function finalTarget( w, h, anisotropy ) {

	const rt = new THREE.WebGLRenderTarget( w, h, {
		type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
		minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
		wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true, anisotropy,
	} );
	return rt;

}

function transientTarget( w, h, count ) {

	return new THREE.WebGLRenderTarget( w, h, {
		type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, count,
		minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
	} );

}

function pass( fragmentShader, uniforms = {} ) {

	return new THREE.RawShaderMaterial( {
		glslVersion: THREE.GLSL3, vertexShader: VERTEX, fragmentShader, uniforms,
		depthTest: false, depthWrite: false,
	} );

}

export class VillageTextures {

	constructor( { tier = 'high' } = {} ) {

		this.baked = false;
		this.bakeMs = 0;
		this.textures = {};
		this.jobs = [];
		this._bytes = 0;
		const scale = SCALE[ tier ] || SCALE.high;
		const anisotropy = 8; // clamped by three to what the device supports

		for ( const s of SETS ) {

			const k = scale[ s.name ] ?? scale.all;
			const set = { ...s, w: Math.max( 64, Math.round( s.w * k ) ), h: Math.max( 64, Math.round( s.h * k ) ), k };
			const job = { set, albedo: null, nra: null };
			for ( const key of [ 'out', 'nra' ] ) {

				if ( ! set[ key ] ) continue;
				const rt = finalTarget( set.w, set.h, anisotropy );
				rt.texture.name = set[ key ];
				job[ key === 'out' ? 'albedo' : 'nra' ] = rt;
				this.textures[ set[ key ] ] = rt.texture;
				this._bytes += set.w * set.h * 4 * 4 / 3;

			}

			this.jobs.push( job );

		}

	}

	// approximate GPU memory of the final (mipmapped) maps in bytes
	get bytes() {

		return this._bytes;

	}

	// Renders every set (once). The programs are compiled first (in parallel where the driver can),
	// then the passes are drawn; the GPU runs them while the game keeps loading.
	async bake( renderer ) {

		if ( this.baked ) return;
		this.baked = true;
		const t0 = performance.now();
		const camera = new THREE.Camera();
		const tri = new THREE.BufferGeometry();
		tri.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );

		const derive = pass( DERIVE, { vlgFields: { value: null }, vlgSlope: { value: new THREE.Vector2() }, vlgAO: { value: new THREE.Vector2() }, vlgRadii: { value: new THREE.Vector2() } } );
		const copy = pass( COPY, { vlgSrc: { value: null } } );
		const quad = ( material ) => {

			const scene = new THREE.Scene();
			const mesh = new THREE.Mesh( tri, material );
			mesh.frustumCulled = false;
			scene.add( mesh );
			return scene;

		};

		const steps = this.jobs.map( ( job ) => {

			const { set } = job;
			const fields = !! job.nra, albedo = !! job.albedo;
			const gen = pass( fieldsShader( set.name, fields, albedo ), { vlgSize: { value: new THREE.Vector2( set.w, set.h ) } } );
			return { job, gen, scene: quad( gen ) };

		} );

		const deriveScene = quad( derive ), copyScene = quad( copy );
		await Promise.all( [ ...steps.map( ( s ) => s.scene ), deriveScene, copyScene ].map( ( s ) => renderer.compileAsync( s, camera ) ) );

		const prevTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		for ( const { job, gen, scene } of steps ) {

			const { set } = job;
			if ( ! job.nra ) {

				// a plain map: straight into its final target
				renderer.setRenderTarget( job.albedo );
				renderer.render( scene, camera );

			} else {

				const tmp = transientTarget( set.w, set.h, job.albedo ? 2 : 1 );
				renderer.setRenderTarget( tmp );
				renderer.render( scene, camera );
				const u = derive.uniforms;
				u.vlgFields.value = tmp.textures[ 0 ];
				u.vlgSlope.value.set( set.hs / ( set.mx / set.w ), set.hs / ( set.my / set.h ) );
				u.vlgAO.value.set( set.ao, set.hs / ( ( set.mx / set.w + set.my / set.h ) * 0.5 ) );
				// Tidewater's 3 and 9 texel radii, at the same distance in metres on smaller maps
				u.vlgRadii.value.set( Math.max( 1, 3 * set.k ), 9 * set.k );
				renderer.setRenderTarget( job.nra );
				renderer.render( deriveScene, camera );
				if ( job.albedo ) {

					copy.uniforms.vlgSrc.value = tmp.textures[ 1 ];
					renderer.setRenderTarget( job.albedo );
					renderer.render( copyScene, camera );

				}

				tmp.dispose();

			}

			gen.dispose();

		}

		renderer.setRenderTarget( prevTarget );
		renderer.autoClear = prevAutoClear;
		derive.dispose();
		copy.dispose();
		tri.dispose();
		this.bakeMs = performance.now() - t0;

	}

	dispose() {

		for ( const job of this.jobs ) {

			if ( job.albedo ) job.albedo.dispose();
			if ( job.nra ) job.nra.dispose();

		}

	}

}
