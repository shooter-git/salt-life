import { Vector2, Vector3, Vector4 } from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { LOBE_TABLE, TREE_VARIANTS, SHRUB_VARIANTS } from './PlantGeometry.js';

// Shared GLSL building blocks for all vegetation: hashing, value noise, wind and the
// plant deformation used by palms, young palms, bananas and ferns (Tidewater's WGSL vegModule,
// translated for WebGL 2).
//
// Uniforms (`vegUniforms`, shared by every vegetation material: put them in shader.uniforms):
//   vegCamPos, vegGustOffset, vegCanopyNear, vegFernFade, vegLobeTable[], vegDetail (the terrain's detail
//   texture), and the Globals handles vegTime, vegWindDir, vegWindSpeed, vegSunDir, vegNight.
//   vegLodRange: per material (one per LOD level: three uploads uniforms per material, not per
//   draw), see VegMaterials.
// GLSL (VEG_GLSL, both stages):
//   float ss( a, b, x )                              smoothstep that also takes a > b
//   float vegHash12( vec2 p )                        Dave Hoskins' sine-free hash, [0, 1)
//   float vegNoise( vec2 p )                         value noise
//   float vegWindStrength(); float vegWindLoad() ((M13) w^2 up to a gale's); vec3 vegWindDir3(); vec3 vegWindPerp3()
//   float vegGustAt( vec2 xz )                       travelling gust field in [0, 1]
//   vec3 vegRotUpTo( vec3 v, vec3 T )                rotation taking +Y to T, applied to v
//   vec3 vegInstanceNormal( mat4 m, vec3 n )         three's instance normal transform
//   float vegVariantOf( float seed, bool isShrub ); float vegLobeScale( seed, li, isShrub )
//   float vegLodScale( vec3 base, vec3 lodRange ); bool vegLodDither( base, lodRange, pixel )
//   float bayer4( vec2 pixel )                       ordered-dither threshold in (0, 1)
//   VegPlant vegPlantDeform( P, N0, iPos, iDat, aVeg, aMat, aLobe, lodRange )
// The per-object LOD window (Tidewater's draw.params.yzw) is the uniform vegLodRange.

const LOBE_VEC4 = Math.ceil( LOBE_TABLE.length / 4 );

export const vegUniforms = {
	// Position of the *main* camera. The shadow pass has its own cameraPosition, so all
	// distance based effects (LOD split, fades) use this uniform to keep shadows consistent.
	vegCamPos: { value: new Vector3( 0, 10, 0 ) },
	// Integrated gust-field offset (m). Integrated on the CPU so that changes of wind speed
	// or direction never make the gust pattern jump.
	vegGustOffset: { value: new Vector2() },
	// near -> impostor switch distance (m) of trees (x) and shrubs (y) (VegMaterials.uCanopyNear)
	vegCanopyNear: { value: new Vector2( 75, 45 ) },
	// Crown variants: the per-instance variant picks a row of the lobe table (per-lobe size, 0 =
	// dropped), 4 entries per vec4
	vegLobeTable: { value: Array.from( { length: LOBE_VEC4 }, ( _, i ) => new Vector4( ...[ 0, 1, 2, 3 ].map( ( c ) => LOBE_TABLE[ i * 4 + c ] ?? 0 ) ) ) },
	// distance window (m) of the ferns inside the merged understory mesh (per device tier)
	vegFernFade: { value: new Vector2( 42, 58 ) },
	// the terrain's detail texture (set by Vegetation: it must not be generated at import time)
	vegDetail: { value: null },
	vegTime: G.time,
	vegWindDir: G.windDir,
	vegWindSpeed: G.windSpeed,
	vegSunDir: G.sunDir,
	vegNight: G.night,
};

// three-style `{ value }` handles
export const uCamPos = vegUniforms.vegCamPos;
export const uGustOffset = vegUniforms.vegGustOffset;

// LOD window factor for an instance at `base` (0 = hidden, 1 = full size). Hard switches (a window
// that starts at x > 0, or ends with z - y < 5 cm) are widened by a cross-fade band where both
// levels are drawn and dissolve into each other (lodDither, Bayer screen-door); soft windows shrink.
export const LOD_BAND = 0.12; // share of the switch distance

// GLSL float literal
export const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

export const VEG_GLSL = /* glsl */`
uniform vec3 vegCamPos;
uniform vec2 vegGustOffset;
uniform vec2 vegCanopyNear;
uniform vec2 vegFernFade;
uniform vec4 vegLobeTable[ ${ LOBE_VEC4 } ];
uniform sampler2D vegDetail;
uniform float vegTime;
uniform vec2 vegWindDir;
uniform float vegWindSpeed;
uniform vec3 vegSunDir;
uniform float vegNight;
uniform vec3 vegLodRange;

#define VEG_UP vec3( 0.0, 1.0, 0.0 )
const float VEG_LOD_BAND = ${ f( LOD_BAND ) };

// smoothstep that also takes a > b (WGSL defines it, GLSL leaves it undefined)
float ss( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }

// Dave Hoskins' sine-free hash, [0, 1)
float vegHash12( vec2 p ) {
	vec3 p3 = fract( vec3( p.x, p.y, p.x ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

float vegNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 fr = fract( p );
	vec2 u = fr * fr * ( fr * -2.0 + 3.0 );
	float a = vegHash12( i );
	float b = vegHash12( i + vec2( 1.0, 0.0 ) );
	float c = vegHash12( i + vec2( 0.0, 1.0 ) );
	float d = vegHash12( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

// Bayer 4x4 threshold in (0, 1) (LODFade's bit-interleaved formula; a fixed pattern: there is no
// TAA here to resolve a moving one)
float bayer4( vec2 pixel ) {
	uvec2 p = uvec2( pixel );
	uint x0 = p.x & 1u; uint x1 = ( p.x >> 1u ) & 1u;
	uint y0 = p.y & 1u; uint y1 = ( p.y >> 1u ) & 1u;
	uint v = ( ( x0 ^ y0 ) << 3u ) | ( y0 << 2u ) | ( ( x1 ^ y1 ) << 1u ) | y1;
	return ( float( v ) + 0.5 ) / 16.0;
}

// Wind ---------------------------------------------------------------------------------

// 0 (calm) .. 2.5 (storm). Tiny floor so nothing is ever perfectly frozen.
float vegWindStrength() { return max( vegWindSpeed * 0.1, 0.03 ); }
// (M13) the wind's load on a plant, as the square of that up to a gale's (2: as it always was), and
// slower past it, as fronds and leaves stream and fold out of the wind (their drag grows as U^1.2 or
// so, not U^2: reconfiguration), to the most a palm's trunk bends (a hurricane's, ~9)
float vegWindLoad() { float w = vegWindStrength(); return w <= 2.0 ? w * w : min( 4.0 + ( w - 2.0 ) * 2.4, 9.0 ); }
vec3 vegWindDir3() { return vec3( vegWindDir.x, 0.0, vegWindDir.y ); }
vec3 vegWindPerp3() { return vec3( -vegWindDir.y, 0.0, vegWindDir.x ); }

// Travelling gust field in [0, 1]: noise of (worldXZ - windDir * t * speed), where the
// time-integrated offset comes from vegGustOffset. Two fetches of the detail texture's fbm
// channel (~35 m and ~15 m gust cells); the terrain uses the same function for its wind sheen.
float vegGustAt( vec2 xz ) {
	vec2 p = xz - vegGustOffset;
	float n = textureLod( vegDetail, p / 140.0, 0.0 ).w * 0.62
		+ textureLod( vegDetail, p / 61.0 + 0.37, 0.0 ).w * 0.38;
	return ss( 0.46, 0.6, n );
}

// Rotation taking +Y to the unit vector T, applied to v.
vec3 vegRotUpTo( vec3 v, vec3 T ) {
	vec3 k = vec3( T.z, 0.0, -T.x );
	vec3 c1 = cross( k, v );
	return v + c1 + cross( k, c1 ) / ( T.y + 1.0 );
}

// normal through the instance matrix as three's instance node does it (not normalised: its
// length scales the leaf flutter the same way)
vec3 vegInstanceNormal( mat4 m, vec3 n ) {
	vec3 a = m[ 0 ].xyz; vec3 b = m[ 1 ].xyz; vec3 c = m[ 2 ].xyz;
	vec3 t = n / vec3( dot( a, a ), dot( b, b ), dot( c, c ) );
	return mat3( a, b, c ) * t;
}

// Crown variants: the per-instance variant picks a row of the lobe table (per-lobe size, 0 =
// dropped). Shared by the near canopy geometry and the impostor bake, so near and far crowns match.
float vegVariantOf( float seed, bool isShrub ) {
	return floor( fract( seed * 7.77 ) * ( isShrub ? ${ f( SHRUB_VARIANTS ) } : ${ f( TREE_VARIANTS ) } ) );
}
float vegLobeScale( float seed, float li, bool isShrub ) {
	float row = vegVariantOf( seed, isShrub ) + ( isShrub ? ${ f( TREE_VARIANTS ) } : 0.0 );
	int i = int( row * 8.0 + max( li, 0.0 ) + 0.5 );
	return vegLobeTable[ i / 4 ][ i % 4 ];
}

// LOD window factor for an instance at base (0 = hidden, 1 = full size); lodRange = (visible from,
// fade-out start, fade-out end)
float vegLodScale( vec3 base, vec3 lodRange ) {
	float d = length( vegCamPos - base );
	bool inside = d >= lodRange.x * ( 1.0 - VEG_LOD_BAND / 2.0 );
	bool hardEnd = lodRange.z - lodRange.y < 0.05;
	float endK = hardEnd ? ( d < lodRange.y * ( 1.0 + VEG_LOD_BAND / 2.0 ) ? 1.0 : 0.0 ) : 1.0 - ss( lodRange.y, lodRange.z, d );
	return inside ? endK : 0.0;
}

// Fragment-stage keep test of the LOD cross-fade for an instance at base (true: keep the pixel)
bool vegLodDither( vec3 base, vec3 lodRange, vec2 pixel ) {
	float d = length( vegCamPos - base );
	float t = bayer4( pixel );
	float x = lodRange.x; float y = lodRange.y;
	float fadeIn = x > 0.0 ? ss( x * ( 1.0 - VEG_LOD_BAND / 2.0 ), x * ( 1.0 + VEG_LOD_BAND / 2.0 ), d ) : 1.0;
	float fadeOut = lodRange.z - y < 0.05 ? ss( y * ( 1.0 - VEG_LOD_BAND / 2.0 ), y * ( 1.0 + VEG_LOD_BAND / 2.0 ), d ) : 0.0;
	return t < fadeIn && t >= fadeOut;
}

struct VegPlant {
	vec3 pos;
	vec3 normal;
	float trunkY; // height along the stem (m)
	vec3 trunkT; // stem axis (world)
};

// Plant deformation shared by palms / young palms / bananas / ferns.
//
// Geometry conventions (local space, applied after the instance matrix = T * Ry * S):
//   aMat.x == 0  -> stem vertex: aVeg.x = height fraction u, x/z = radial offset.
//   aMat.x >= 1  -> crown vertex: position is relative to the crown centre.
//   aVeg = (u, s along frond, flutter weight, phase)
// Per instance:
//   iPos = (base.xyz, scale), iDat = (lean azimuth, lean (fraction of H), stem height H (m), seed)
// P / N0: the vertex through the instance matrix.
VegPlant vegPlantDeform( vec3 P, vec3 N0, vec4 iPos, vec4 iDat, vec4 veg, vec4 aMat, vec4 aLobe, vec3 lodRange ) {
	float part = aMat.x;
	vec3 base = iPos.xyz;
	float sc = iPos.w;
	vec3 leanDir = vec3( cos( iDat.x ), 0.0, sin( iDat.x ) );
	float lean = iDat.y;
	float H = iDat.z;
	// merged geometries (understory): the instance's plant kind is the integer part of the seed;
	// vertices of the other plants collapse onto the base
	float seed = fract( iDat.w );
	float kindI = floor( iDat.w );
	float kindV = -aLobe.w - 1.0;
	bool keepKind = kindV < 0.5 || abs( kindV - kindI ) < 0.5;

	float u = veg.x;
	float s = veg.y;
	float flut = veg.z;
	float ph = veg.w;

	float t = vegTime;
	float w = vegWindStrength();
	float g = vegGustAt( base.xz );
	float ph0 = seed * 6.2832;
	vec3 windDir3 = vegWindDir3();
	vec3 windPerp3 = vegWindPerp3();

	// stem sway: horizontal offset of the top as a fraction of H
	float load = vegWindLoad();
	float sway = load * 0.014 * ( g * 0.9 + 0.3 ) + sin( t * 0.83 + ph0 ) * w * 0.0065 * ( g + 0.45 );
	float swayP = sin( t * 0.61 + ph0 * 1.7 ) * w * 0.0028;
	vec3 windOff = windDir3 * sway + windPerp3 * swayP;

	// stem curve: mix of a straight tilt and a "banana" curve (vertical at the top)
	float c = fract( seed * 7.31 );
	float fc = mix( u, u * ( ( 1.0 - u ) + 1.0 ), c );
	float df = mix( 1.0, ( 1.0 - u ) * 2.0, c );
	vec3 off = leanDir * ( lean * fc ) + windOff * ( u * u );
	vec3 T = normalize( VEG_UP + leanDir * ( lean * df ) + windOff * ( u * 2.0 ) );

	vec3 radial = vec3( P.x - base.x, 0.0, P.z - base.z );
	vec3 axisPt = base + vec3( 0.0, u * H, 0.0 ) + off * H;
	vec3 stemPos = axisPt + vegRotUpTo( radial, T );
	vec3 stemN = vegRotUpTo( N0, T );

	// crown: follows the stem top, tilted half as much as the stem tip
	vec3 Ttop = normalize( VEG_UP + leanDir * ( lean * ( 1.0 - c ) ) + windOff * 2.0 );
	vec3 Ttilt = normalize( VEG_UP + Ttop );
	vec3 C = base + vec3( 0.0, H, 0.0 ) + ( leanDir * lean + windOff ) * H;
	vec3 o1 = vegRotUpTo( P - base, Ttilt );
	vec3 N1 = vegRotUpTo( N0, Ttilt );

	// frond / leaf motion: gust bending + slow bounce + leaflet flutter, applied as a
	// length preserving rotation about the crown centre so fronds stream downwind in storms.
	float s2 = s * s;
	float bend = s2 * sc * 4.5 * ( load * 0.16 * ( g * 0.8 + 0.35 )
		+ sin( t * ( ph * 0.5 + 1.3 ) + ph * 23.0 + ph0 ) * w * 0.075 * ( g + 0.3 ) );
	float bounce = sin( t * ( ph + 2.1 ) + ph * 41.0 ) * s2 * w * sc * 0.1;
	float flutter = flut * sc * ( sin( t * ( ph * 5.0 + 11.0 ) + ph * 60.0 + s * 9.0 ) * ( w * 0.045 + 0.008 )
		+ sin( t * 23.0 + ph * 13.0 + s * 17.0 ) * ( max( w - 1.0, 0.0 ) * 0.05 ) );
	vec3 disp = windDir3 * bend + VEG_UP * ( bounce - bend * 0.3 ) + N1 * flutter;
	float L = length( o1 );
	vec3 o2 = normalize( o1 + disp + vec3( 0.0, 1e-5, 0.0 ) ) * L;
	vec3 crownPos = C + o2;

	// the dead (hanging) frond is only kept on some palms
	bool hideDead = part > 0.5 && part < 1.5 && aMat.y > 0.95 && fract( seed * 13.7 ) > 0.4;
	vec3 crownPos2 = hideDead ? C : crownPos;

	bool isStem = part < 0.5;
	vec3 pos = isStem ? stemPos : crownPos2;

	VegPlant o;
	o.normal = isStem ? stemN : N1;
	o.trunkY = u * H;
	o.trunkT = T;

	// LOD window / distance fade: shrink around the base (ferns fade out earlier)
	float dCam = length( vegCamPos - base );
	float fernFade = kindI > 2.5 && kindI < 3.5 ? 1.0 - ss( vegFernFade.x, vegFernFade.y, dCam ) : 1.0;
	float k = vegLodScale( base, lodRange ) * fernFade * ( keepKind ? 1.0 : 0.0 );
	o.pos = base + ( pos - base ) * k;
	return o;
}
`;

// GLSL expression of the linear colour of an sRGB hex (three's `new Color( hex )` -> vec3)
const _lin = ( c ) => ( c < 0.04045 ? c * 0.0773993808 : Math.pow( c * 0.9478672986 + 0.0521327014, 2.4 ) );
export const C = ( hex ) => {

	const r = _lin( ( ( hex >> 16 ) & 255 ) / 255 ), g = _lin( ( ( hex >> 8 ) & 255 ) / 255 ), b = _lin( ( hex & 255 ) / 255 );
	return `vec3( ${ r.toFixed( 6 ) }, ${ g.toFixed( 6 ) }, ${ b.toFixed( 6 ) } )`;

};
