import * as THREE from '../../engine/index.js';
import { LOD_FADE_GLSL } from '../../materials/LODFade.js';
import { srgb, TERRAIN_SHADING_GLSL } from '../terrain/TerrainShading.js';

// Material for the natural debris (one draw call): stones, coconuts and husks, seaweed and
// seagrass wrack, shells, coral rubble, dry palm fronds. Base colours are procedural per kind;
// surface detail comes from the terrain's tileable detail texture (3 samples, UVs chosen per kind:
// triplanar for stones / coral, fibre-aligned mesh UVs for husks and fronds, world xz for draped
// weed). Normals use the same surface-gradient bump as the terrain; contact with the ground adds
// occlusion and a dusting of sand.
//
// vdata: x seed, y kind, z kind parameter, w object size (m)
//   0 STONE    z = style + palette (style 0 beach stone, 1 field / wall stone with lichen,
//              2 whitewashed; palette fract: basalt .. grey .. coral limestone .. ochre)
//   1 COCONUT  z < 1.5: whole coconut, age 0 green .. 0.5 brown .. 1 grey; z >= 1.5: husk fibre
//   2 WEED     z = dryness (0 fresh golden sargassum .. 1 black, brittle)
//   3 SHELL    z < 1: clam, hue; z >= 1: turban / cone shell, hue (lathe uvs: u along the profile)
//   4 CORAL    z < 2: branch rubble, bleach 0..1; z >= 2: coral head, bleach = z - 2
//   5 FROND    z = dryness
//   6 DRIFT    driftwood: z = bark remnants (0 fully bleached .. 1 patchy bark); uv: u along the
//              grain (m), v around (m)
// tint multiplies the albedo (baked contact occlusion, colour variation).
//
// Small items dissolve with distance (Bayer screen-door over ~ 450-650 x their size): no popping and
// no shimmering specks far away.
//
// (Salt Life: Tidewater's WGSL in GLSL, on MeshStandardMaterial. Lite (the low tier): one detail
// sample instead of three and no bump: the fragment cost on a software renderer. Without
// Tidewater's heightfield sun shadow and underwater lighting.)
//
// GLSL (STONE_SURFACE_GLSL, shared with the pebble field; needs TERRAIN_SHADING_GLSL):
//   float debrisHashS( float s, float k )
//   DebrisStone debrisStoneSurface( vec4 T, vec3 N, float pal, float style, float seed, float tile )
//     T: triplanar detail sample (r facets, g soil / stones, b grains / pits, a fbm); pal 0..1;
//     style 0 / 1 / 2; returns { albedo, rough, hd }

export const STONE_SURFACE_GLSL = /* glsl */`
float debrisHashS( float s, float k ) { return fract( sin( s * 91.345 + k ) * 47453.5453 ); }

struct DebrisStone {
	vec3 albedo;
	float rough;
	float hd;
};

// Stone surface shared with the pebble field.
DebrisStone debrisStoneSurface( vec4 T, vec3 N, float pal, float style, float seed, float tile ) {
	vec3 basalt = ${ srgb( 0.15, 0.145, 0.14 ) }; vec3 grey = ${ srgb( 0.4, 0.38, 0.35 ) };
	vec3 lime = ${ srgb( 0.76, 0.72, 0.63 ) }; vec3 ochre = ${ srgb( 0.55, 0.4, 0.28 ) };
	vec3 col = mix( basalt, grey, ss( 0.12, 0.42, pal ) );
	col = mix( col, lime, ss( 0.5, 0.72, pal ) );
	col = mix( col, ochre, ss( 0.88, 0.97, pal ) );
	// per stone tone, speckles and pits, soft blotches
	col = col * ( debrisHashS( seed, 1.7 ) * 0.3 + 0.85 );
	col = col * ( ( T.b - 0.5 ) * 0.5 + 1.0 ) * ( ( T.a - 0.5 ) * 0.6 + 1.0 );
	float pits = ss( 0.62, 0.85, T.b ) * ss( 0.45, 0.8, pal );
	col = mix( col, col * 0.55, pits * 0.6 );
	// quartz veins / bands in a few of the dark stones
	float vein = ss( 0.03, 0.0, abs( fract( T.a * 7.0 + seed * 3.0 ) - 0.5 ) ) * step( debrisHashS( seed, 5.1 ), 0.25 ) * ( 1.0 - ss( 0.3, 0.5, pal ) );
	col = mix( col, ${ srgb( 0.7, 0.68, 0.62 ) }, vein * 0.7 );
	float rough = 0.74 + T.b * 0.12;
	// field / wall stones: lichen crusts on the upper faces, soil at the bottom
	float s1 = step( 0.5, style ) * step( style, 1.5 );
	float lichen = ss( 0.55, 0.68, T.a + N.y * 0.18 + debrisHashS( seed, 2.3 ) * 0.15 ) * s1;
	vec3 lichenCol = mix( ${ srgb( 0.62, 0.64, 0.55 ) }, ${ srgb( 0.72, 0.52, 0.2 ) }, step( 0.72, T.g ) );
	col = mix( col, lichenCol, lichen * 0.75 );
	col = mix( col, col * 0.62, ss( 0.2, -0.6, N.y ) * s1 );
	// whitewashed stones: lime wash, worn through on edges and blotches
	float s2 = step( 1.5, style );
	float wash = ss( 0.5, 0.58, T.a + ( T.r - 0.45 ) * 0.4 + debrisHashS( seed, 6.6 ) * 0.12 ) * s2;
	col = mix( col, ${ srgb( 0.8, 0.79, 0.75 ) } * ( T.b * 0.14 + 0.86 ) * ( ( T.a - 0.5 ) * 0.3 + 1.0 ), wash );
	rough = mix( rough, 0.93, wash );
	DebrisStone o;
	o.albedo = col;
	o.rough = rough;
	o.hd = ( T.r * 0.6 + T.b * 0.3 ) * tile * mix( 0.06, 0.02, wash );
	return o;
}
`;

// the surface: sets debCol, debRough, debAO and debN (world normal)
const NATURE_SURFACE = /* glsl */`
	float seed = vDebData.x; float kind = vDebData.y; float prm = vDebData.z; float size = vDebData.w;
	vec3 p = vDebP;
	// ---- distance fade: small items dissolve (Bayer screen-door, see LODFade) far away
	float fadeEnd = clamp( size * 650.0, 22.0, 450.0 );
	if ( ! lodFadeVisible( gl_FragCoord.xy, 1.0 - ss( fadeEnd * 0.7, fadeEnd, length( p - cameraPosition ) ), false ) ) discard;
	vec3 N = normalize( vDebN );
	vec2 uv0 = vDebUv;
	bool isStone = kind < 0.5;
	bool isCoral = kind > 3.5 && kind < 4.5;
	bool isWeed = kind > 1.5 && kind < 2.5;
	bool isShell = kind > 2.5 && kind < 3.5;
	bool isFrond = kind > 4.5 && kind < 5.5;
	bool isDrift = kind > 5.5;
	bool triK = isStone || isCoral;

	// ---- texture coordinates per kind (all three samples in uniform control flow)
	float tile = isCoral ? 0.07 : clamp( size * 1.1, 0.07, 0.9 );
	vec2 so = vec2( debrisHashS( seed, 3.1 ), debrisHashS( seed, 7.9 ) );
	// fibre-aligned (coconut / frond), world xz (weed), shell uvs
	vec2 fibA = isDrift ? vec2( uv0.x * 0.3, uv0.y * 5.5 ) : ( isFrond ? vec2( uv0.x * 1.1, uv0.y * 45.0 ) : vec2( uv0.x * 3.0, uv0.y * 26.0 ) );
	vec2 uvA0 = isWeed ? p.xz / 0.42 : ( isShell ? uv0 * vec2( 0.5, 0.16 ) : fibA );
	vec2 uvB0 = isWeed ? p.xz / 0.11 + 0.3 : ( isDrift ? vec2( uv0.x * 1.4, uv0.y * 21.0 ) : uv0 * 1.3 );
	vec2 uvC0 = isWeed ? p.xz / 1.4 : ( isFrond ? vec2( uv0.x * 5.0, uv0.y * 80.0 ) : ( isDrift ? vec2( uv0.x * 0.09, uv0.y * 0.9 ) : uv0 * 8.0 ) );
	vec2 uvB = triK ? p.xz / tile + 0.37 : uvB0 + so.yx;
	vec4 B = texture( terrainDetailTex, uvB );
#ifdef DEBRIS_LITE
	vec4 A = B; vec4 Cc = B; vec4 T3 = B;
#else
	vec2 uvA = triK ? p.zy / tile : uvA0 + so;
	vec2 uvC = triK ? p.xy / tile + 0.71 : uvC0 + so * 2.0;
	vec4 A = texture( terrainDetailTex, uvA );
	vec4 Cc = texture( terrainDetailTex, uvC );
	vec3 w = terrainTriWeights( N );
	vec4 T3 = A * w.x + B * w.y + Cc * w.z;
#endif

	vec3 col = vec3( 0.5 );
	float rough = 0.8;
	float hd = 0.0;

	if ( isStone ) {

		DebrisStone S = debrisStoneSurface( T3, N, fract( prm ), floor( prm ), seed, tile );
		col = S.albedo;
		rough = S.rough;
		hd = S.hd;

	} else if ( kind < 1.5 ) {

		// coconut: fibrous husk; green -> brown -> grey with age; split husk pieces show the
		// paler, coarser fibre
		float age = min( prm, 1.0 );
		float inner = step( 1.5, prm );
		vec3 c = mix( ${ srgb( 0.4, 0.42, 0.12 ) }, ${ srgb( 0.37, 0.23, 0.11 ) }, ss( 0.18, 0.55, age ) );
		c = mix( c, ${ srgb( 0.36, 0.32, 0.27 ) }, ss( 0.7, 0.95, age ) );
		c = mix( c, ${ srgb( 0.52, 0.37, 0.21 ) }, inner );
		float fib = A.a * 0.7 + Cc.b * 0.3;
		c = c * ( ( fib - 0.5 ) * mix( 0.9, 1.4, inner ) + 1.0 );
		c = mix( c, c * 0.62, ss( 0.55, 0.78, B.g ) * 0.7 );
		col = c;
		rough = mix( 0.62, 0.86, max( ss( 0.2, 0.6, age ), inner ) ) + fib * 0.08;
		hd = ( fib * 0.004 + Cc.b * 0.0015 ) * ( inner + 1.0 );

	} else if ( isWeed ) {

		// sargassum / seagrass wrack: golden and olive when fresh (wet sheen, air bladders),
		// drying to brittle black with bleached tips
		float dry = prm;
		vec3 c = mix( ${ srgb( 0.46, 0.3, 0.08 ) }, ${ srgb( 0.26, 0.22, 0.08 ) }, ss( 0.35, 0.7, Cc.a ) );
		c = mix( c, ${ srgb( 0.12, 0.08, 0.04 ) }, ss( 0.5, 0.7, A.a + ( Cc.a - 0.5 ) * 0.6 ) * 0.6 );
		c = mix( c, ${ srgb( 0.075, 0.06, 0.045 ) }, ss( 0.25, 0.75, dry ) );
		c = mix( c, ${ srgb( 0.42, 0.38, 0.29 ) }, ss( 0.62, 0.78, Cc.a + A.g * 0.2 ) * ss( 0.5, 1.0, dry ) * 0.55 );
		float leaf = A.g;
		c = c * ( ( leaf - 0.4 ) * 0.8 + 1.0 );
		float bladder = ss( 0.72, 0.82, B.b ) * ( 1.0 - dry );
		c = mix( c, ${ srgb( 0.62, 0.5, 0.16 ) }, bladder * 0.6 );
		col = c;
		rough = mix( 0.55, 0.88, ss( 0.2, 0.7, dry ) ) - bladder * 0.12;
		hd = leaf * 0.012 + B.b * 0.004 + bladder * 0.004 + Cc.a * 0.01;

	} else if ( isShell ) {

		// shells: ribbed cups with growth bands; turban shells with spiral bands
		float turban = step( 1.0, prm );
		float hue = fract( prm );
		vec3 base = mix( ${ srgb( 0.92, 0.9, 0.84 ) }, ${ srgb( 0.9, 0.8, 0.62 ) }, ss( 0.3, 0.5, hue ) );
		base = mix( base, ${ srgb( 0.9, 0.64, 0.6 ) }, ss( 0.62, 0.72, hue ) );
		base = mix( base, ${ srgb( 0.8, 0.52, 0.3 ) }, ss( 0.85, 0.95, hue ) );
		vec3 dark = mix( ${ srgb( 0.5, 0.32, 0.2 ) }, ${ srgb( 0.35, 0.3, 0.32 ) }, step( 0.5, debrisHashS( seed, 4.4 ) ) );
		float ribs = sin( uv0.y * 19.0 ) * 0.5 + 0.5;
		float growth = sin( uv0.x * 38.0 + A.a * 6.0 ) * 0.5 + 0.5;
		float spiral = sin( uv0.x * 22.0 + uv0.y * 1.0 + A.a * 4.0 ) * 0.5 + 0.5;
		float bandK = mix( ss( 0.6, 0.9, growth ) * 0.35 * step( 0.4, debrisHashS( seed, 8.8 ) ), ss( 0.45, 0.75, spiral ) * 0.75, turban );
		vec3 c = mix( base, dark, bandK );
		c = c * ( ribs * 0.12 + 0.92 ) * ( ( B.a - 0.5 ) * 0.2 + 1.0 );
		col = c;
		rough = 0.42 + A.b * 0.2;
		hd = mix( ribs * 0.0012, spiral * 0.0015, turban );

	} else if ( isCoral ) {

		// bleached coral rubble: porous (polyp cups), stained grey / algae in the older pieces;
		// coral heads: meandering grooves
		float head = step( 2.0, prm );
		float bleach = max( fract( prm ), step( 0.999, prm ) );
		float pit = ss( 0.55, 0.82, T3.b );
		vec3 c = mix( ${ srgb( 0.5, 0.48, 0.42 ) }, ${ srgb( 0.88, 0.86, 0.8 ) }, bleach );
		c = mix( c, ${ srgb( 0.4, 0.42, 0.3 ) }, ss( 0.6, 0.75, T3.a ) * ( 1.0 - bleach ) * 0.6 );
		float groove = ( 1.0 - ss( 0.2, 0.34, T3.r ) ) * head;
		c = c * ( 1.0 - pit * 0.35 ) * ( 1.0 - groove * 0.4 );
		col = c;
		rough = 0.88;
		hd = pit * -0.0012 - groove * 0.004 + T3.a * 0.002;

	} else if ( isDrift ) {

		// driftwood: sun-bleached silver-grey with warmer, less weathered patches; open grain
		// (dark wavy lines along the wood), deep checks, flaking bark remnants in the grooves
		float bark = prm;
		float lines = ss( 0.06, 0.0, abs( fract( A.a * 3.0 + Cc.a ) - 0.5 ) );
		float crack = ss( 0.03, 0.0, abs( B.a - 0.5 ) ) * ss( 0.35, 0.65, A.r );
		vec3 c = mix( ${ srgb( 0.63, 0.61, 0.57 ) }, ${ srgb( 0.83, 0.81, 0.77 ) }, ss( 0.3, 0.7, Cc.a + ( A.a - 0.5 ) * 0.5 ) );
		c = mix( c, ${ srgb( 0.66, 0.57, 0.46 ) }, ss( 0.6, 0.8, Cc.g ) * 0.45 );
		c = c * ( ( B.a - 0.5 ) * 0.5 + 1.0 ) * ( 1.0 - lines * 0.45 ) * ( 1.0 - crack * 0.75 );
		float barkM = ss( 0.68, 0.72, Cc.g + ( B.g - 0.5 ) * 0.25 ) * step( 0.5, bark );
		c = mix( c, mix( ${ srgb( 0.14, 0.1, 0.07 ) }, ${ srgb( 0.27, 0.19, 0.12 ) }, A.a ), barkM );
		col = c;
		rough = 0.8 + crack * 0.12 - barkM * 0.08;
		hd = A.a * 0.004 + B.a * 0.0015 - lines * 0.0015 - crack * 0.004 + barkM * 0.0025;

	} else {

		// dry palm frond: parallel veins, olive-yellow drying to straw, brown and grey
		float dry = prm;
		vec3 c = mix( ${ srgb( 0.44, 0.42, 0.17 ) }, ${ srgb( 0.6, 0.5, 0.3 ) }, ss( 0.1, 0.45, dry ) );
		c = mix( c, ${ srgb( 0.33, 0.24, 0.15 ) }, ss( 0.45, 0.8, dry ) * ( B.g * 0.6 + 0.4 ) );
		c = mix( c, ${ srgb( 0.46, 0.42, 0.36 ) }, ss( 0.8, 1.0, dry ) * Cc.a );
		float veins = A.a * 0.6 + Cc.a * 0.4;
		c = c * ( ( veins - 0.5 ) * 0.7 + 1.0 );
		col = c;
		rough = 0.66 + dry * 0.2;
		hd = veins * 0.0015;

	}

	// ---- ground contact: occlusion and a dusting of sand on the lower parts; wet near the sea
	float ground = terrainHeightAt( p.xz );
	float above = p.y - ground;
	float contact = 1.0 - ss( 0.0, max( size * 0.32, 0.012 ), above );
	float sandy = ss( 0.6, 1.6, ground ) * ( isWeed ? 0.0 : 1.0 );
	float sandDust = contact * sandy * ss( 0.4, 0.7, T3.a + contact * 0.3 );
	col = mix( col * vDebTint, ${ srgb( 0.78, 0.7, 0.56 ) }, sandDust * 0.55 );
	float wet = 1.0 - ss( 0.35, 0.9, p.y );
	col = col * ( 1.0 - wet * 0.4 );
	vec3 debCol = col;
	float debRough = clamp( mix( rough, 0.28, wet * 0.8 ) + sandDust * 0.1, 0.05, 1.0 );
	float debAO = sat( 1.0 - contact * 0.45 );
	hd = hd + sandDust * 0.0015;
#ifdef DEBRIS_LITE
	vec3 debN = N;
#else
	// (derivatives of hd after the branches: every pixel of the quad reaches this point)
	vec3 debN = terrainPerturbNormal( p, N, hd, 1.0 );
#endif
`;

// terrain: the Terrain (its uniforms and height lookup); lite: one detail sample, no bump
export function createNatureMaterial( terrain, { lite = false } = {} ) {

	const mat = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0 } );
	mat.name = 'DebrisNature';
	if ( lite ) mat.defines = { DEBRIS_LITE: '' };
	const U = terrain.uniforms;
	const uniforms = { terrainHeightMap: U.terrainHeightMap, terrainHeightInfo: U.terrainHeightInfo, offshoreHeightMap: U.offshoreHeightMap, offshoreHeightInfo: U.offshoreHeightInfo, terrainDetailTex: U.terrainDetailTex };
	mat.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec3 tint;\nattribute vec4 vdata;\nvarying vec3 vDebTint;\nvarying vec4 vDebData;\nvarying vec3 vDebP;\nvarying vec3 vDebN;\nvarying vec2 vDebUv;' )
			.replace( '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	vDebTint = tint;
	vDebData = vdata;
	vDebUv = uv;
	vDebP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vDebN = normalize( mat3( modelMatrix ) * objectNormal );` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', /* glsl */`#include <common>
uniform sampler2D terrainDetailTex;
varying vec3 vDebTint;
varying vec4 vDebData;
varying vec3 vDebP;
varying vec3 vDebN;
varying vec2 vDebUv;
${ terrain.heightGlsl }
${ TERRAIN_SHADING_GLSL }
${ LOD_FADE_GLSL }
${ STONE_SURFACE_GLSL }
` )
			.replace( '#include <color_fragment>', NATURE_SURFACE + '\tdiffuseColor.rgb = debCol;' )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = debRough;' )
			.replace( '#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( debN, 0.0 ) ).xyz );' )
			.replace( '#include <aomap_fragment>', '\treflectedLight.indirectDiffuse *= debAO;\n\treflectedLight.indirectSpecular *= debAO;' );

	};
	mat.customProgramCacheKey = () => 'debrisNature' + ( lite ? 'Lite' : '' );
	return mat;

}
