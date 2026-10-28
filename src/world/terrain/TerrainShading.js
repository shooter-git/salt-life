import { Color, SRGBColorSpace } from '../../engine/index.js';

// Shared GLSL building blocks for the terrain and the scattered rocks: Tidewater's WGSL shading
// helpers, translated for WebGL 2.
//
// JS helpers (build GLSL source):
//   srgb( r, g, b )  -> 'vec3( ... )' linear constant of an sRGB triplet
//   rot2( v, a )     -> GLSL expression rotating the vec2 expression v by a constant angle
// GLSL (TERRAIN_SHADING_GLSL; the detail texture is the uniform `terrainDetailTex`):
//   float ss( a, b, x )   smoothstep that also takes a > b (GLSL leaves that undefined)
//   float sat( x ); vec3 terrainSaturation( c, s )
//   vec3 terrainPerturbNormal( P, N, hd, scale )   surface-gradient bump (world space)
//   vec3 terrainTriWeights( N ); vec4 terrainTriplanar( p, w, tile, g )
//   RockSurface terrainRockSurface( p, N, h, mcr, seed, mossAmount, g )
//   MeadowTone terrainMeadowTone( mA, mB, slope, south, detail, hasDetail )
//   const vec3 PAL_<name> (rock palette), MEADOW_<name> (meadow palette)
// RockGrad { dpdx, dpdy: world position derivatives, fwY: fwidth of the bedding coordinate }: every
// rock sample uses these explicit gradients, so it is safe in branches.

// sRGB triplet -> linear vec3 constant (GLSL source)
export const srgb = ( r, g, b ) => {

	const c = new Color().setRGB( r, g, b, SRGBColorSpace );
	return `vec3( ${ f( c.r ) }, ${ f( c.g ) }, ${ f( c.b ) } )`;

};

// 2D rotation of a vec2 GLSL expression by a constant angle
export const rot2 = ( v, a ) => {

	const c = Math.cos( a ), s = Math.sin( a );
	return `( mat2( ${ f( c ) }, ${ f( s ) }, ${ f( - s ) }, ${ f( c ) } ) * ( ${ v } ) )`;

};

export function f( x ) {

	const s = Number( x ).toPrecision( 9 );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

}

// ---- palette (sRGB picked from photo references, stored linear). (M14) The basalt's, from photographs of
// lava shores (Malarrif, Snaefellsnes; Akun Island; Kauai's north shore): its lower quartile, its median and
// its upper quartile, grey-brown (it had been nearly black, 0.15, 0.3 and 0.48); the splash zone's black
// lichen a little lifted from charcoal
export const PALETTE = {
	rockDark: srgb( 0.22, 0.21, 0.195 ),
	rockMid: srgb( 0.37, 0.345, 0.32 ),
	rockLight: srgb( 0.5, 0.475, 0.44 ),
	rockWarm: srgb( 0.48, 0.41, 0.33 ),
	lichenPale: srgb( 0.70, 0.70, 0.64 ),
	lichenOrange: srgb( 0.78, 0.50, 0.20 ),
	blackZone: srgb( 0.12, 0.12, 0.115 ),
	barnacle: srgb( 0.78, 0.76, 0.70 ),
	algae: srgb( 0.20, 0.27, 0.10 ),
	coralline: srgb( 0.62, 0.44, 0.46 ),
	moss: srgb( 0.19, 0.29, 0.08 ),
	mossDry: srgb( 0.3, 0.34, 0.14 ),
};

// ---- tropical meadow (tall guinea / elephant grass)
// The tone is shared by the terrain and the grass field (blade base colour): both evaluate it from
// the same inputs, so the geometric grass fades into the ground without a visible boundary.
export const MEADOW = {
	lush: srgb( 0.13, 0.2, 0.05 ),
	green: srgb( 0.25, 0.32, 0.1 ),
	olive: srgb( 0.36, 0.37, 0.14 ),
	yellow: srgb( 0.5, 0.46, 0.2 ),
	straw: srgb( 0.62, 0.54, 0.33 ),
	soil: srgb( 0.17, 0.13, 0.08 ),
};

const consts = ( prefix, o ) => Object.entries( o ).map( ( [ k, v ] ) => `const vec3 ${ prefix }${ k } = ${ v };` ).join( '\n' );

export const TERRAIN_SHADING_GLSL = /* glsl */`
${ consts( 'PAL_', PALETTE ) }
${ consts( 'MEADOW_', MEADOW ) }

float ss( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
float sat( float x ) { return clamp( x, 0.0, 1.0 ); }
vec3 terrainSaturation( vec3 c, float s ) { return mix( vec3( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ), c, s ); }

struct RockGrad {
	vec3 dpdx;
	vec3 dpdy;
	float fwY;
};

// Mikkelsen surface-gradient bump: perturb world normal N by the scalar height field hd
// (screen-space derivatives, so any mix of projections / scales works). Robustness for terrain:
//  - the tilt is limited to ~55 degrees (at grazing angles |det| collapses and the unclamped
//    gradient would swing the normal into the tangent plane: 'chrome' patches on steep faces)
//  - the bump fades out where the screen-space frame is degenerate (the thin sliver triangles
//    of CDLOD geomorphing) or where the rendered facet disagrees with N (sub-texel crags)
vec3 terrainPerturbNormal( vec3 p, vec3 N, float hd, float scale ) {
	vec3 dpx = dFdx( p ); vec3 dpy = dFdy( p );
	float dhdx = dFdx( hd ) * scale; float dhdy = dFdy( hd ) * scale;
	vec3 r1 = cross( dpy, N );
	vec3 r2 = cross( N, dpx );
	float det = dot( dpx, r1 );
	float ad = abs( det );
	vec3 grad = ( r1 * dhdx + r2 * dhdy ) * sign( det );
	float area = length( cross( dpx, dpy ) );
	float fr = area / max( length( dpx ) * length( dpy ), 1e-20 ); // sin of the footprint angle
	float facet = ad / max( area, 1e-20 ); // cos between the facet and N
	float k = ss( 0.12, 0.35, fr ) * ss( 0.3, 0.6, facet );
	vec3 g = grad * min( 1.0, ad * 1.4 / max( length( grad ), 1e-20 ) ) * k;
	// (Salt Life) a collapsed footprint: the vector's squared length underflows and normalize()
	// gives NaN, which the high tier's bloom spreads over the whole frame
	vec3 b = N * ad - g;
	float b2 = dot( b, b );
	return b2 > 1e-30 ? b * inversesqrt( b2 ) : N;
}

// triplanar blend weights (sharp)
vec3 terrainTriWeights( vec3 N ) {
	vec3 a = abs( N );
	vec3 w = a * a * ( a * a );
	return w / ( w.x + w.y + w.z );
}

vec4 terrainDetailGrad( vec2 uv, vec2 gx, vec2 gy ) {
	return textureGrad( terrainDetailTex, uv, gx, gy );
}

// one channel-set of the detail texture, triplanar, with explicit gradients
vec4 terrainTriplanar( vec3 p, vec3 w, float tile, RockGrad g ) {
	float s = 1.0 / tile;
	vec4 x = terrainDetailGrad( p.zy * s, g.dpdx.zy * s, g.dpdy.zy * s );
	vec4 y = terrainDetailGrad( p.xz * s + 0.37, g.dpdx.xz * s, g.dpdy.xz * s );
	vec4 z = terrainDetailGrad( p.xy * s + 0.71, g.dpdx.xy * s, g.dpdy.xy * s );
	return x * w.x + y * w.y + z * w.z;
}

struct RockSurface {
	vec3 albedo;
	float rough;
	float hd;     // bump height (m)
	float moss;   // 0..1
	float wet;
	float height;
};

// Weathered volcanic rock seen on the headlands, sea stacks and boulders.
//   p world position, N world normal (geometric / mcr), h height above sea level
//   mcr: 0..1 large scale variation, seed: per object variation (0..1)
RockSurface terrainRockSurface( vec3 p, vec3 N, float h, float mcr, float seed, float mossAmount, RockGrad g ) {
	vec3 w = terrainTriWeights( N );
	// big blocks (4 m cells), plates (0.9 m) and grain / chips
	vec4 big = terrainTriplanar( p, w, 27.0, g );
	vec4 mid = terrainTriplanar( p, w, 6.1, g );
	vec4 fine = terrainTriplanar( p, w, 1.3, g );
	// pixel footprint (m): features smaller than a few pixels fade out instead of sparkling
	float px = max( length( g.dpdx ), length( g.dpdy ) );
	float fineK = 1.0 - ss( 0.006, 0.02, px );
	float midK = 1.0 - ss( 0.03, 0.1, px );
	float hr = big.x * 0.45 + mid.x * 0.35 + ( ( fine.x - 0.5 ) * fineK + 0.5 ) * 0.2;

	// layered lava flows / bedding on steep faces: irregular bands (1D lookup of the fbm channel
	// along the height, warped), faded out once a band gets thinner than a few pixels
	float steep = 1.0 - ss( 0.55, 0.85, N.y );
	float bandY = p.y + mid.w * 2.5 + mcr * 6.0;
	float fwY = g.fwY;
	vec2 bandUV = vec2( bandY / 14.0, seed * 0.37 + 0.13 );
	float strata = terrainDetailGrad( bandUV, vec2( fwY / 14.0, 0.0 ), vec2( 0.0 ) ).w;
	float strataAA = 1.0 - ss( 0.15, 0.6, fwY );
	float tone = hr * 0.9 + ( mcr - 0.5 ) * 0.7 + ( strata - 0.5 ) * 0.8 * steep * strataAA + ( seed - 0.5 ) * 0.3;
	vec3 col = mix( PAL_rockDark, PAL_rockMid, ss( 0.1, 0.5, tone ) );
	col = mix( col, PAL_rockLight, ss( 0.5, 0.85, tone ) );
	// iron staining / warm weathering in patches
	col = mix( col, PAL_rockWarm, ss( 0.62, 0.8, mid.w + mcr * 0.3 ) * 0.18 );
	// joints between the big blocks, fainter between plates
	col = col * ( ss( 0.05, 0.25, big.x ) * 0.35 + 0.65 ) * ( ss( 0.05, 0.25, mid.x ) * 0.15 + 0.85 );
	// rain streaks: dark stains running down steep faces, paler bands between
	vec2 sUVa = vec2( p.z / 3.1, p.y / 41.0 );
	vec2 sUVb = vec2( p.x / 3.1 + 0.5, p.y / 41.0 + 0.3 );
	vec4 sa = terrainDetailGrad( sUVa, vec2( g.dpdx.z / 3.1, g.dpdx.y / 41.0 ), vec2( g.dpdy.z / 3.1, g.dpdy.y / 41.0 ) );
	vec4 sb = terrainDetailGrad( sUVb, vec2( g.dpdx.x / 3.1, g.dpdx.y / 41.0 ), vec2( g.dpdy.x / 3.1, g.dpdy.y / 41.0 ) );
	vec2 sw4 = pow( abs( N.xz ), vec2( 4.0 ) );
	float stainS = ( sa.w * sw4.x + sb.w * sw4.y ) / ( sw4.x + sw4.y + 1e-5 );
	float stain = ss( 0.52, 0.72, stainS ) * steep;
	col = col * ( 1.0 - stain * 0.4 ) * ( ss( 0.35, 0.2, stainS ) * steep * 0.12 + 1.0 );

	// lichens on the dry upper faces
	float dry = ss( 2.6, 4.0, h );
	float lichen = ss( 0.6, 0.78, mid.y ) * ss( 0.2, 0.7, N.y ) * dry * ss( 0.45, 0.65, mcr );
	col = mix( col, PAL_lichenPale, lichen * 0.45 );
	col = mix( col, PAL_lichenOrange, ss( 0.8, 0.88, mid.y ) * dry * ss( 0.5, 0.8, N.y ) * 0.3 );

	// moss / grass on ledges and tops, ferns hanging along the bedding planes of steep faces
	float ledge = ss( 0.55, 0.7, strata ) * steep * strataAA * ss( 0.4, 0.6, mid.w + ( mcr - 0.5 ) * 0.4 );
	float moss = max( ss( 0.62, 0.9, N.y + ( big.x - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.3 ), ledge * 0.8 )
		* ss( 2.5, 5.0, h ) * mossAmount;
	col = mix( col, mix( PAL_moss, PAL_mossDry, mid.w ), moss * 0.9 );

	// shoreline zonation: black lichen band (splash zone), barnacles and algae in the intertidal
	float splash = ss( 0.5, 1.0, h ) * ss( 2.8, 1.8, h + mid.w * 1.2 ) * ss( 0.35, 0.6, mcr + mid.w * 0.3 );
	col = mix( col, PAL_blackZone, splash * 0.55 );
	// sun-bleached, weathered upper faces
	col = mix( col, PAL_rockLight, ss( 0.35, 0.95, N.y ) * ss( 1.5, 3.0, h ) * 0.3 );
	float inter = ss( -0.7, -0.2, h ) * ss( 0.7, 0.2, h );
	float barn = ss( 0.62, 0.72, fine.z ) * inter * fineK;
	col = mix( col, PAL_algae, inter * ss( 0.4, 0.6, mid.y ) * 0.6 );
	col = mix( col, PAL_barnacle, barn * 0.8 );
	// below the water: algae films and pink coralline crusts
	float sub = ss( -0.3, -1.2, h );
	col = mix( col, mix( PAL_algae, PAL_coralline, ss( 0.45, 0.7, mid.w ) ), sub * 0.55 );

	// wet below the swash line (dark, glossy)
	float wet = ss( 1.0, 0.25, h + mid.w * 0.3 );
	col = col * mix( 1.0, 0.55, wet );

	RockSurface r;
	r.albedo = col;
	r.rough = mix( mix( 0.88, 0.8, steep ), 0.45, wet ) + moss * 0.06;
	// relief (m): tilted blocks and plates with bevelled joints, then grain
	r.hd = big.x * 0.25 + mid.x * 0.07 * ( midK * 0.6 + 0.4 ) + fine.x * 0.012 * fineK * ( 1.0 - wet * 0.6 ) + barn * 0.005;
	r.moss = moss;
	r.wet = wet;
	r.height = hr;
	return r;
}

struct MeadowTone {
	vec3 tone;
	float dry;
	float lush;
};

//   mA, mB: detail fbm channel at the 173 m / 47 m scales (~0.5 +- 0.1); slope: 1 - N.y;
//   south: N.z (the sun side); detail: optional finer fbm (~0.5 +- 0.1) that breaks up the patches
// Mostly fresh green grass with olive, sun-bleached yellow and a few straw-dry patches (more on
// exposed slopes), darker lush grass in the damp patches.
MeadowTone terrainMeadowTone( float mA, float mB, float slope, float south, float detail, bool hasDetail ) {
	float m = mA * 0.55 + mB * 0.45 + slope * 0.25 + south * 0.04;
	float dd = hasDetail ? detail - 0.5 : 0.0;
	m += dd * 0.28;
	float olive = ss( 0.52, 0.6, m );
	float yellow = ss( 0.6, 0.67, m );
	float straw = ss( 0.66, 0.73, m + ( mB - 0.5 ) * 0.2 );
	float lush = ss( 0.46, 0.37, mB * 0.7 + mA * 0.3 + slope * 0.2 + dd * 0.2 );
	vec3 c = mix( MEADOW_green, MEADOW_olive, olive );
	c = mix( c, MEADOW_yellow, yellow * 0.8 );
	c = mix( c, MEADOW_straw, straw * 0.55 );
	c = mix( c, MEADOW_lush, lush * 0.75 );
	MeadowTone o;
	o.tone = c;
	o.dry = olive * 0.4 + yellow * 0.6;
	o.lush = lush;
	return o;
}
`;
