import * as THREE from '../../engine/index.js';
import { VEG_GLSL, vegUniforms, C } from './VegNodes.js';

// Vegetation materials: three's MeshStandardMaterial with Tidewater's vertex / surface snippets
// (translated from WGSL) patched in by onBeforeCompile, and a MeshDepthMaterial for the shadow pass
// with the same deformation and alpha mask.
//
// Port notes (engine WGSL -> three GLSL):
//  - the vertex snippets compute world positions (the vegetation group is identity): they replace
//    three's instance transform (project / worldpos / defaultnormal chunks).
//  - the surface snippet sets the globals vegAlbedo, vegRough, vegSpec (specularIntensity),
//    vegNormalW (world), vegAO, vegTrans + vegTransN (translucency and the normal it is lit
//    through); `discard` stays in the snippet, and the same mask runs in the shadow pass.
//  - fragment inputs: in.P -> vegP, in.V -> vegV, in.N -> vegN (flipped on back faces),
//    in.vs.normal -> vVegN (unflipped), in.uv -> vegUv, in.pixel -> vegPixel, in.front -> vegFront,
//    in.vs.vX -> vX.
//  - translucency (x the shadowed light colour in the engine's lighting) is added in three's direct
//    light loop: sun behind the leaf (relative to the viewer) through vegTransN.
//  - per-draw LOD windows (draw.params) are a uniform of each material: one material per LOD level
//    (they share one program).
//  - GLSL leaves smoothstep with reversed edges (-> ss()) and pow() of a negative base undefined:
//    bases that can dip below 0 (interpolated across-blade coordinates, roots below the ground) are
//    clamped, else the NaNs show as white specks.

export const PLANT_ATTRIBUTES = /* glsl */`
attribute vec4 iPos;
attribute vec4 iDat;
attribute vec4 aVeg;
attribute vec4 aMat;
attribute vec4 aLobe;
`;

const FRAG_GLOBALS = /* glsl */`
varying vec3 vVegP;
varying vec3 vVegN;
varying vec2 vVegUv;
vec3 vegP; vec3 vegV; vec3 vegN; vec2 vegUv; vec2 vegPixel; bool vegFront;
vec3 vegAlbedo = vec3( 0.5 );
float vegRough = 0.8;
float vegSpec = 1.0;
vec3 vegNormalW = vec3( 0.0, 1.0, 0.0 );
float vegAO = 1.0;
vec3 vegTrans = vec3( 0.0 );
vec3 vegTransN = vec3( 0.0, 1.0, 0.0 );
vec3 vegTransNV = vec3( 0.0, 1.0, 0.0 );
`;

const FRAG_PRELUDE = /* glsl */`
	vegP = vVegP;
	vegV = normalize( cameraPosition - vegP );
	vegFront = gl_FrontFacing;
	vegN = normalize( vVegN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
	vegUv = vVegUv;
	vegPixel = gl_FragCoord.xy;
`;

const DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const TRANSLUCENT = /* glsl */`
		reflectedLight.directDiffuse += vegTrans * directLight.color * vegTransLight( directLight.direction, geometryViewDir );`;
// leaf translucency: sunlight transmitted through the leaf when it is lit from behind (relative to
// the viewer); L, V and vegTransNV in view space
const TRANS_LEAF = 'return saturate( dot( - vegTransNV, L ) ) * ( pow( saturate( dot( - V, L ) ), 3.0 ) * 0.7 + 0.3 );';

// def: { name, attributes, varyings (declarations without the qualifier, e.g. 'vec4 vMat;'),
//   vertexPars, vertex (GLSL in main: declares vec3 vegWorldPos, vegWorldNormal and writes the
//   varyings), fragmentPars, surface, shadow (fragment GLSL of the shadow pass: discards; null: no
//   shadow material), uniforms, transLight (GLSL body of float vegTransLight( L, V ), view space) }. lodRange: the LOD level's `{ value: Vector3 }`.
export function vegMaterial( def, lodRange = null ) {

	const uniforms = { ...vegUniforms, vegLodRange: lodRange ?? { value: new THREE.Vector3( 0, 1e6, 2e6 ) }, ...( def.uniforms || {} ) };
	const varyings = ( q ) => ( def.varyings || '' ).split( ';' ).map( ( s ) => s.trim() ).filter( Boolean ).map( ( s ) => `${ q } ${ s };` ).join( '\n' );
	const vertexHead = VEG_GLSL + ( def.attributes || '' ) + varyings( 'varying' ) + '\nvarying vec3 vVegP;\nvarying vec3 vVegN;\nvarying vec2 vVegUv;\n' + ( def.vertexPars || '' );
	const fragmentHead = VEG_GLSL + varyings( 'varying' ) + FRAG_GLOBALS + ( def.fragmentPars || '' )
		+ `\nfloat vegTransLight( vec3 L, vec3 V ) { ${ def.transLight || TRANS_LEAF } }\n`;
	const vertexMain = def.vertex + /* glsl */`
	vVegP = vegWorldPos;
	vVegN = vegWorldNormal;
	vVegUv = uv;`;
	const project = /* glsl */`
	vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 );
	gl_Position = projectionMatrix * mvPosition;`;

	const mat = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0, side: def.side ?? THREE.DoubleSide } );
	mat.name = def.name;
	mat.shadowSide = THREE.DoubleSide;
	mat.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + vertexHead )
			.replace( '#include <beginnormal_vertex>', vertexMain + '\n\tvec3 objectNormal = vegWorldNormal;' )
			.replace( '#include <begin_vertex>', 'vec3 transformed = vegWorldPos;' )
			.replace( '#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize( mat3( viewMatrix ) * objectNormal );' )
			.replace( '#include <project_vertex>', project )
			.replace( '#include <worldpos_vertex>', 'vec4 worldPosition = vec4( transformed, 1.0 );' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + fragmentHead )
			.replace( '#include <color_fragment>', FRAG_PRELUDE + def.surface + '\n\tdiffuseColor.rgb = vegAlbedo;' )
			.replace( '#include <roughnessmap_fragment>', 'float roughnessFactor = vegRough;' )
			.replace( '#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;' )
			.replace( '#include <normal_fragment_maps>', /* glsl */`
	normal = normalize( ( viewMatrix * vec4( vegNormalW, 0.0 ) ).xyz );
	vegTransNV = normalize( ( viewMatrix * vec4( vegTransN, 0.0 ) ).xyz );` )
			.replace( '#include <lights_physical_fragment>', /* glsl */`#include <lights_physical_fragment>
	material.specularColor *= vegSpec;
	material.specularColorBlended = material.specularColor;
	material.specularF90 = vegSpec;` )
			.replace( '#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll( DIRECT, DIRECT + TRANSLUCENT ) )
			.replace( '#include <aomap_fragment>', /* glsl */`
	reflectedLight.indirectDiffuse *= vegAO;
	reflectedLight.indirectSpecular *= vegAO;` );

	};

	mat.customProgramCacheKey = () => 'veg:' + def.name;

	if ( def.shadow ) {

		const depth = new THREE.MeshDepthMaterial();
		depth.name = def.name + '-depth';
		depth.side = THREE.DoubleSide;
		depth.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + vertexHead )
				.replace( '#include <begin_vertex>', vertexMain + '\n\tvec3 transformed = vegWorldPos;' )
				.replace( '#include <project_vertex>', project );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + fragmentHead )
				.replace( '#include <alphatest_fragment>', FRAG_PRELUDE + def.shadow );

		};

		depth.customProgramCacheKey = () => 'veg-depth:' + def.name;
		mat.userData.depth = depth;

	}

	return mat;

}

// Coconut palm bark: irregular leaf-scar rings (uneven spacing, closer below the crown, wavy,
// partial), fine vertical fissures, grey-brown to silver weathering, lichen, dark stains and the
// root mass at the base, the fibrous old frond bases under the crown. Returns the albedo and a
// relief height (m) for the bump. y: height along the stem (m), a: 0..1 around, H: stem height.
const PALM_BARK = /* glsl */`
struct VegBark { vec3 bark; float hd; };
VegBark _vegPalmBark( float y, float a, float H, float seed, float iv ) {
	float A = a * 6.2832;
	float ca = cos( A ); float sa = sin( A );
	float yn = y / H;
	// rings: phase grows faster toward the crown, jittered per ring band and around the trunk
	float wob = ( vegNoise( vec2( ca * 1.3 + y * 0.35, sa * 1.3 + seed * 9.0 ) ) - 0.5 ) * 0.7
		+ sin( A * 2.0 + y * 1.1 + seed * 5.0 ) * 0.1;
	float phase = y * mix( 8.5, 11.0, iv ) + pow( max( yn, 0.0 ), 2.2 ) * H * 5.5 + vegNoise( vec2( y * 0.8, seed * 7.3 ) ) * 3.2
		+ vegNoise( vec2( y * 3.1, seed * 2.9 ) ) * 0.9 + wob;
	float k0 = floor( phase );
	// ragged ring edges: the scar line wanders a little around the trunk
	float phaseR = phase + ( vegNoise( vec2( a * 38.0, k0 * 2.3 + seed * 5.0 ) ) - 0.5 ) * 0.22;
	float k = floor( phaseR );
	float fr = phaseR - k;
	// each ring scar has its own width and depth
	float rk = vegHash12( vec2( k, seed * 13.7 ) );
	float gw = mix( 0.05, 0.14, rk );
	float groove = ( ss( gw, 0.0, fr ) + ss( 1.0 - gw * 0.6, 1.0, fr ) ) * mix( 0.45, 1.0, vegHash12( vec2( k * 1.3, seed * 3.1 ) ) );
	float ridge = ss( 0.07, 0.15, fr ) * ss( 0.45, 0.16, fr );
	// partial rings: each ring fades out around part of the circumference
	float amp = ss( 0.28, 0.6, vegNoise( vec2( ca * 1.8 + k * 3.17, sa * 1.8 + k * 1.71 + seed * 11.0 ) ) ) * 0.75 + 0.25;
	// fine vertical fissures (level set of a vertically stretched noise) and bark plates
	float nf = vegNoise( vec2( a * 54.0, y * 1.6 + seed * 41.0 ) );
	float nf2 = vegNoise( vec2( a * 110.0, y * 3.4 + seed * 29.0 ) );
	// fissures: short, broken vertical splits (not continuous grain lines)
	float segA = ss( 0.45, 0.62, vegNoise( vec2( a * 30.0, y * 4.5 + seed * 9.0 ) ) );
	float segB = ss( 0.5, 0.66, vegNoise( vec2( a * 60.0 + 3.7, y * 9.0 + seed * 21.0 ) ) );
	float crack = max( ss( 0.09, 0.0, abs( nf - 0.5 ) ) * segA, ss( 0.06, 0.0, abs( nf2 - 0.5 ) ) * segB * 0.7 );
	float plate = vegNoise( vec2( a * 24.0, y * 3.5 + seed * 17.0 ) );
	float blotch = vegNoise( vec2( a * 6.0, y * 0.4 + seed * 13.0 ) );
	// grey-brown bark weathering to silver-grey, per palm
	vec3 bark = mix( ${ C( 0x5e554a ) }, ${ C( 0xa49a88 ) }, saturate( blotch * 0.55 + plate * 0.25 + ( iv - 0.5 ) * 0.5 + yn * 0.15 ) );
	// warmer tan on some trees and in patches, dark weathered (rain-soaked) blotches
	bark = mix( bark, bark * vec3( 1.12, 1.0, 0.82 ), saturate( ( vegNoise( vec2( a * 4.0, y * 0.25 + seed * 31.0 ) ) - 0.4 ) * 2.0 ) * iv );
	bark = bark * mix( 1.0, 0.72, ss( 0.6, 0.8, vegNoise( vec2( a * 5.0, y * 0.7 + seed * 43.0 ) ) ) );
	// fine mottling (rough, fibrous surface) and pale sun-bleached patches
	float mott = vegNoise( vec2( a * 90.0, y * 80.0 + seed * 7.0 ) ) * 0.6 + vegNoise( vec2( a * 35.0, y * 30.0 + seed * 3.0 ) ) * 0.4;
	bark = bark * ( mott * 0.45 + 0.78 ) * ( plate * 0.25 + 0.88 );
	bark = mix( bark, ${ C( 0xb3ad9f ) }, ss( 0.55, 0.75, vegNoise( vec2( a * 8.0, y * 1.3 + seed * 61.0 ) ) ) * 0.35 * ( 1.0 - yn * 0.5 ) );
	bark = bark * mix( 1.0, 0.7, groove * amp ) * ( ridge * amp * 0.1 + 1.0 ) * mix( 1.0, 0.5, crack );
	// lichen: pale grey-green crusts and white spots, a little orange; darker rain streaks
	float lic = ss( 0.6, 0.72, vegNoise( vec2( a * 9.0, y * 2.1 + seed * 23.0 ) ) + ( vegNoise( vec2( a * 31.0, y * 7.0 ) ) - 0.5 ) * 0.3 ) * ss( 0.9, 0.2, yn );
	vec3 licC = mix( ${ C( 0x8e917f ) }, ${ C( 0xa9a799 ) }, plate );
	bark = mix( bark, licC, lic * 0.5 );
	float streak = ss( 0.62, 0.8, vegNoise( vec2( a * 16.0, y * 0.12 + seed * 5.0 ) ) ) * ss( 1.0, 0.6, yn );
	bark = bark * ( 1.0 - streak * 0.28 );
	// damp, dark base (splash of sand and soil) and the mass of exposed roots at the ground
	float baseK = ss( 1.4, 0.2, y + ( blotch - 0.5 ) * 0.8 );
	bark = mix( bark, bark * vec3( 0.62, 0.56, 0.48 ), baseK );
	float rootN = vegNoise( vec2( a * 26.0, y * 2.2 + seed * 19.0 ) );
	float roots = ss( 0.42, 0.05, y ) * ss( 0.35, 0.6, rootN );
	bark = mix( bark, mix( ${ C( 0x3a2e22 ) }, ${ C( 0x5e4a36 ) }, rootN ), ss( 0.5, 0.0, y ) * 0.85 );
	// fibrous old frond bases (boot) under the crown: criss-cross fibre mat, brown
	float boot = ss( H - 1.0, H - 0.35, y + ( blotch - 0.5 ) * 0.3 );
	float fib = sin( A * 34.0 + y * 30.0 ) * sin( A * 34.0 - y * 30.0 ) * 0.5 + 0.5;
	bark = mix( bark, mix( ${ C( 0x4d3722 ) }, ${ C( 0x8a744c ) }, fib * 0.6 + plate * 0.4 ), boot );
	VegBark o;
	o.bark = bark;
	o.hd = ( ridge * amp * 0.004 - groove * amp * 0.008 - crack * 0.006 + plate * 0.004 + mott * 0.004 + roots * 0.01 ) * ( 1.0 - boot ) + boot * fib * 0.004;
	return o;
}
// (the last evaluation is remembered: the albedo and the trunk bump both ask for the same point)
vec4 vegBarkMemoKey = vec4( 3.0e38 );
float vegBarkMemoIv = 3.0e38;
VegBark vegBarkMemo;
VegBark vegPalmBark( float y, float a, float H, float seed, float iv ) {
	vec4 key = vec4( y, a, H, seed );
	if ( key == vegBarkMemoKey && iv == vegBarkMemoIv ) return vegBarkMemo;
	vegBarkMemoKey = key;
	vegBarkMemoIv = iv;
	vegBarkMemo = _vegPalmBark( y, a, H, seed, iv );
	return vegBarkMemo;
}
`;

const BROAD = /* glsl */`
// Broadleaf plants (parts 6 monstera, 7 elephant ear, 8 heliconia leaf, 9 heliconia bract). Blade
// coordinates: y along the midrib (0 back of the basal lobes .. 1 tip), x across in units of the
// half-width W (m). Returns the outline half-width (x units) at y and whether a hole / slit / tear is
// cut at (y, x).
struct VegBroad { float w; bool cut; };
VegBroad vegBroadShape( float part, float y, float x, float age, float W, float fseed, float seed ) {
	float ax = abs( x );
	float w = 0.0;
	bool cut = false;
	// ragged, slightly irregular margin on every leaf (more on old ones)
	float rag = 1.0 - ( vegNoise( vec2( y * 38.0 + ( x > 0.0 ? 17.0 : 0.0 ), fseed * 31.0 ) ) * 0.05 + age * age * 0.12 * vegNoise( vec2( y * 11.0, fseed * 7.0 + x ) ) );
	if ( part < 6.5 ) {
		// monstera: cordate blade, basal lobes behind the petiole, V sinus; mature leaves are split
		// from the margin between the primary veins, with a row of holes (fenestrations) inside
		float yb = 0.16;
		float g = ( y - yb ) / ( 1.0 - yb );
		if ( y >= yb ) {
			w = pow( max( sin( 3.14159 * min( 1.0, 0.4 + 0.6 * g ) ), 0.0 ), 0.8 ) * ( 1.0 - 0.15 * ss( 0.8, 1.0, g ) );
		} else {
			float q = ( yb - y ) / yb;
			w = sqrt( max( 1.0 - q * q * q, 0.0 ) ) * 0.96;
			cut = ax < 0.3 * ( 1.0 - y / yb );
		}
		w *= rag;
		float matK = ss( 0.28, 0.45, age );
		if ( matK > 0.0 && y > yb * 0.4 && y < 0.93 ) {
			float L = W / 0.47;
			float X = ax * W;
			float Y = ( y - yb ) * L;
			float p = ( Y - 0.55 * X ) / ( L * 0.8 / 5.5 ) + fseed * 0.37;
			float k = floor( p + 0.5 );
			float e = abs( p - k ); // 0 on the gap between two primary veins
			float hk = vegHash12( vec2( k + ( x > 0.0 ? 50.0 : 0.0 ), fseed * 19.3 ) );
			float r = ax / max( w, 0.05 );
			float depth = mix( 0.42, 0.75, hk ) + ( 1.0 - matK ) * 0.4;
			// slits widen toward the margin, their inner end rounded
			bool slit = e < 0.035 + 0.1 * ss( depth, 1.0, r ) && r > depth - 0.03;
			// fenestrations: one or two elongated holes along the gap line, inside the slit
			float r0 = 0.14; float r1 = depth - 0.1;
			float qh = ( r - r0 ) / max( r1 - r0, 0.05 );
			float nh = hk > 0.45 ? 2.0 : 1.0;
			float qq = fract( qh * nh );
			bool hole = qh > 0.0 && qh < 1.0 && e < 0.16 * pow( max( sin( 3.14159 * qq ), 0.0 ), 0.6 ) * matK && hk > 0.12;
			cut = cut || slit || hole;
		}
	} else if ( part < 7.5 ) {
		// elephant ear: peltate blade (petiole joins inside it), rounded basal lobes, acute tip
		float yb = 0.3;
		float g = ( y - yb ) / ( 1.0 - yb );
		if ( y >= yb ) {
			w = pow( max( sin( 3.14159 * min( 1.0, 0.5 + 0.5 * g ) ), 0.0 ), 0.85 );
		} else {
			float q = ( yb - y ) / yb;
			w = sqrt( max( 1.0 - pow( q, 1.6 ), 0.0 ) ) * 0.98;
			cut = y < 0.1 && ax < 0.2 * ( 1.0 - y / 0.1 );
		}
		w *= rag;
	} else if ( part < 8.5 || ( part > 9.5 && part < 10.5 ) ) {
		// heliconia / bird of paradise: paddle blade, torn along the lateral veins (more on old leaves)
		w = pow( max( sin( 3.14159 * min( y * 1.02, 1.0 ) ), 0.0 ), 0.5 ) * ( 1.0 - 0.3 * ss( 0.75, 1.0, y ) ) * rag;
		float xl = y * 22.0 + ax * 1.2 + sin( y * 31.0 + fseed * 10.0 ) * 0.3;
		float k = floor( xl );
		float r1 = vegHash12( vec2( k + ( x > 0.0 ? 40.0 : 0.0 ), fseed * 7.7 ) );
		float r2 = vegHash12( vec2( k + 0.5, fseed * 3.3 + seed ) );
		float fx = abs( fract( xl ) - 0.5 );
		cut = r1 < ( part > 9.5 ? 0.2 : 0.12 ) + age * 0.45 && ax / max( w, 0.05 ) > mix( 0.25, 0.8, r2 ) && fx > 0.44;
	} else if ( part < 9.5 ) {
		// bract: boat-shaped, pointed
		w = sin( 3.14159 * min( 1.0, 0.15 + y * 0.9 ) ) * ( 1.0 - 0.4 * ss( 0.7, 1.0, y ) );
	} else {
		// bird of paradise flower pieces: pointed
		w = sin( 3.14159 * min( 1.0, 0.1 + y * 0.9 ) ) * ( 1.0 - 0.5 * ss( 0.6, 1.0, y ) );
	}
	if ( part < 7.5 ) {
		float dmg = vegNoise( vec2( y * 26.0 + fseed * 17.0, x * 11.0 + seed * 9.0 ) );
		cut = cut || dmg > 0.95 - age * 0.08;
	}
	VegBroad o;
	o.w = w;
	o.cut = cut;
	return o;
}

vec3 vegBroadAlbedo( float part, float y, float x, float age, float W, float fseed, float seed, float iv, float hGround ) {
	float ax = abs( x );
	float fr = vegHash12( vec2( fseed * 51.3, seed * 17.9 ) );
	float n1 = vegNoise( vec2( y * 9.0 + fseed * 13.0, x * 4.0 ) );
	float n2 = vegNoise( vec2( y * 37.0 + fseed * 3.0, x * 17.0 + seed * 5.0 ) );
	vec3 c = vec3( 0.0 );
	if ( part < 6.5 ) {
		// monstera: deep glossy green, juvenile leaves lighter yellow-green, old ones yellowing
		vec3 g = mix( ${ C( 0x223b15 ) }, ${ C( 0x324f1d ) }, iv * 0.6 + fr * 0.4 );
		g = mix( ${ C( 0x4f6f28 ) }, g, ss( 0.1, 0.35, age ) );
		g = mix( g, ${ C( 0x9a913e ) }, ss( 0.85, 0.97, age ) * ( 0.6 + 0.4 * n1 ) );
		c = g * ( n1 * 0.16 + 0.92 );
		// primary veins a touch paler, midrib pale
		float L = W / 0.47;
		float p = ( ( y - 0.16 ) * L - 0.55 * ax * W ) / ( L * 0.8 / 5.5 ) + fseed * 0.37;
		float rib = ss( 0.1, 0.0, abs( fract( p ) - 0.5 ) ) * step( 0.16, y );
		c = c * ( 1.0 + rib * 0.12 );
		c = mix( c, ${ C( 0x80994a ) }, ss( 0.03, 0.0, ax * W ) * 0.7 );
	} else if ( part < 7.5 ) {
		// elephant ear: mid green, pale veins radiating from where the petiole joins
		vec3 g = mix( ${ C( 0x33581e ) }, ${ C( 0x4a7128 ) }, iv * 0.6 + fr * 0.4 );
		g = mix( g, ${ C( 0x98913f ) }, ss( 0.85, 0.97, age ) * ( 0.6 + 0.4 * n1 ) );
		float ang = atan( ax * W, ( y - 0.3 ) * W / 0.4 );
		float vein = ss( 0.1, 0.0, abs( fract( ang * 2.6 ) - 0.5 ) - 0.38 ) * 0.7;
		c = g * ( n1 * 0.14 + 0.93 );
		c = mix( c, ${ C( 0x7f9658 ) }, vein * 0.35 + ss( 0.025, 0.0, ax * W ) * step( 0.3, y ) * 0.5 );
	} else if ( part > 10.5 ) {
		// bird of paradise flower: beak green-grey with a purple-red keel, orange sepals, blue tongue
		vec3 beak = mix( mix( ${ C( 0x5b6b4a ) }, ${ C( 0x6b2f3a ) }, ss( 0.3, 0.9, ax ) * 0.7 ), ${ C( 0xc0703a ) }, ss( 0.8, 1.0, y ) * 0.4 );
		vec3 sepal = mix( ${ C( 0xe0741c ) }, ${ C( 0xf09a2a ) }, n1 );
		vec3 tongue = mix( ${ C( 0x2c3f9a ) }, ${ C( 0x4058b8 ) }, n1 );
		return age > 0.75 ? tongue : ( age > 0.25 ? sepal : beak );
	} else if ( part > 9.5 ) {
		// bird of paradise leaf: glaucous grey-green, pale midrib
		vec3 g = mix( ${ C( 0x3e5a36 ) }, ${ C( 0x4f6a43 ) }, iv * 0.6 + fr * 0.4 );
		g = mix( g, ${ C( 0x8f8a4a ) }, ss( 0.8, 0.95, age ) );
		c = g * ( n1 * 0.1 + 0.95 );
		c = mix( c, ${ C( 0xa3a878 ) }, ss( 0.015, 0.0, ax * W ) * 0.6 );
	} else if ( part < 8.5 ) {
		vec3 g = mix( ${ C( 0x365d20 ) }, ${ C( 0x4b7229 ) }, iv * 0.6 + fr * 0.4 );
		g = mix( g, ${ C( 0x8f8a3a ) }, ss( 0.8, 0.95, age ) );
		c = g * ( ( sin( y * 180.0 + ax * 30.0 ) * 0.5 + 0.5 ) * 0.06 + 0.95 ) * ( n1 * 0.12 + 0.94 );
		c = mix( c, ${ C( 0xaab86e ) }, ss( 0.02, 0.0, ax * W ) * 0.7 );
	} else {
		// heliconia bract: scarlet, yellow lip, green tip on the youngest (top) bracts
		c = mix( ${ C( 0x8e1a12 ) }, ${ C( 0xbd2a1a ) }, n1 * 0.6 + fr * 0.4 );
		c = mix( c, ${ C( 0xe3bd38 ) }, ss( 0.62, 0.9, ax ) );
		c = mix( c, ${ C( 0x6c8a2e ) }, ss( 0.8, 1.0, y ) * ss( 0.6, 1.0, age ) * 0.7 );
		return c;
	}
	// weathering: browned dry margins and tips, fungal spots, splashed soil on low leaves
	float edge = ss( 0.8, 1.0, ax + n2 * 0.25 - 0.1 ) * ( 0.25 + age * 0.9 );
	c = mix( c, mix( ${ C( 0x7b6639 ) }, ${ C( 0x5a4528 ) }, n2 ), saturate( edge ) * 0.85 );
	float spot = vegNoise( vec2( y * 14.0 + fseed * 9.0, x * 6.0 + seed * 3.0 ) );
	c = mix( c, ${ C( 0x5e5433 ) }, ss( 0.86, 0.93, spot ) * 0.5 * ( 0.4 + age ) );
	c = mix( c, ${ C( 0x6c5c45 ) }, ss( 0.55, 0.0, hGround ) * ss( 0.5, 0.75, n2 ) * 0.5 );
	// dead leaves: brown and papery
	c = mix( c, mix( ${ C( 0x6e5634 ) }, ${ C( 0x8f7a4e ) }, n1 ), ss( 0.93, 0.99, age ) );
	return c;
}

vec3 vegBroadStem( float part, float a, float f, float seed, float age ) {
	float n = vegNoise( vec2( a * 6.0, f * 30.0 + seed * 11.0 ) );
	if ( part < 6.5 ) return mix( ${ C( 0x4a6a2a ) }, ${ C( 0x5c7c33 ) }, n ) * mix( 1.0, 0.8, ss( 0.7, 1.0, age ) );
	if ( part < 7.5 ) return mix( ${ C( 0x566a34 ) }, ${ C( 0x5d4a3c ) }, n * 0.5 );
	if ( part < 8.5 ) return mix( mix( ${ C( 0x4a6b2e ) }, ${ C( 0x61773a ) }, n ), ${ C( 0x5a4a30 ) }, ss( 0.6, 0.8, vegNoise( vec2( a * 3.0, f * 8.0 + seed * 5.0 ) ) ) * 0.6 );
	if ( part > 9.5 ) return mix( ${ C( 0x55664a ) }, ${ C( 0x6d7658 ) }, n );
	return ${ C( 0x8e1a12 ) };
}
`;

// Palms (trunk, coconuts, fronds), young palms, banana plants, ferns -------------------------
//
// aMat = (part, age / stem colour, leaflet length (m), frond seed); uv = (s along, t across)
// parts: 0 stem, 1 coconut frond, 2 fern frond, 3 banana leaf, 5 coconut

const PLANT_GLSL = PALM_BARK + BROAD + /* glsl */`
// alpha mask (fronds / pinnae / torn banana blades) + the LOD cross-fade of the instance
bool vegPlantMask() {
	vec2 st = vegUv;
	float s = st.x;
	float t = st.y;
	float fwS = fwidth( s ); // evaluated in uniform control flow, before the branches
	vec4 aMat = vMat;
	float part = aMat.x; float age = aMat.y; float Ll = aMat.z; float fseed = aMat.w;
	float seed = vIDat.w;
	float m = 1.0;
	if ( part > 0.5 && part < 1.5 ) {
		// coconut frond: ~95 narrow leaflets per side (100-125 on a real frond), separated by gaps
		// that show the sky; leaflets bunch and spread irregularly, some are short, split or torn
		// away (runs of missing leaflets, more on old fronds)
		float N = 95.0;
		float x = s * N + ( vegNoise( vec2( s * 7.0, fseed * 23.0 + seed * 3.0 ) ) - 0.5 ) * 2.2;
		float k = floor( x );
		float r1 = vegHash12( vec2( k, fseed * 91.7 ) );
		float r2 = vegHash12( vec2( k * 1.37 + 3.1, fseed * 17.3 + seed * 5.0 ) );
		float fx = fract( x ) - 0.5 - ( r1 - 0.5 ) * 0.35;
		float tEnd = mix( 0.72, 1.0, r2 ) * ( r1 < 0.06 ? 0.45 : 1.0 );
		float tt = t / tEnd;
		float hw = pow( max( 1.0 - tt, 0.0 ), 0.6 ) * 0.22 * ( ss( 0.0, 0.1, tt ) * 0.4 + 0.6 );
		// split leaflets: a slit from the tip back along the midvein
		bool split = r2 > 0.9 && tt > mix( 0.35, 0.7, r1 ) && abs( fx ) < hw * 0.3;
		// torn-out runs of leaflets ((M13) many more on what's left after a hurricane)
		bool torn = vegNoise( vec2( k * 0.21 + seed * 17.0, fseed * 37.0 ) ) > 0.83 - age * 0.2 - vegStrip * 0.5 && s > 0.3;
		// sub-pixel leaflets widen instead of aliasing (fronds turn solid in the distance)
		float hwE = max( hw, min( fwS * ( N * 0.6 ), 0.5 ) * ( tt < 1.0 ? 1.0 : 0.0 ) );
		bool leaf = abs( fx ) < hwE && tt < 1.0 && s > 0.06 && ! split && ! torn;
		bool rachis = t * Ll < 0.026;
		m = leaf || rachis ? 1.0 : 0.0;
	} else if ( part > 1.5 && part < 2.5 ) {
		// fern: rounded pinnae
		float N = 26.0;
		float x = s * N;
		float k = floor( x );
		float r2 = vegHash12( vec2( k, fseed * 31.1 ) );
		float fx = fract( x ) - 0.5;
		float tt = t / mix( 0.8, 1.0, r2 );
		float hw = sqrt( max( 1.0 - tt * tt, 0.0 ) ) * 0.34;
		float hwE = max( hw, min( fwS * ( N * 0.6 ), 0.5 ) * ( tt < 1.0 ? 1.0 : 0.0 ) );
		bool leaf = abs( fx ) < hwE && tt < 1.0 && s > 0.04;
		bool rachis = t * Ll < 0.006;
		m = leaf || rachis ? 1.0 : 0.0;
	} else if ( part > 2.5 && part < 3.5 && s >= 0.0 ) {
		// banana: full blade, torn along lateral veins, ragged edge
		float x = s * 13.0 + sin( s * 31.0 + fseed * 10.0 ) * 0.35;
		float k = floor( x );
		float r1 = vegHash12( vec2( k, fseed * 7.7 ) );
		float r2 = vegHash12( vec2( k + 0.5, fseed * 3.3 + seed ) );
		float fx = abs( fract( x ) - 0.5 );
		// dead leaves are shredded
		float dead = step( 0.8, age );
		// wind-torn strips: most tears start at the margin and run in along the veins, more on older
		// leaves; dead leaves are shredded
		// ((M13) and shredded by a hurricane, as dead ones are)
		float shred = max( dead, min( 1.0, vegStrip * 2.0 ) );
		bool tear = r1 < mix( 0.45 + age * 0.6, 0.95, shred ) && t > mix( 0.12, 0.75, r2 ) * mix( 1.0, 0.4, shred ) && fx > mix( 0.45, 0.37, r2 ) - shred * 0.12;
		bool edge = t < 0.985 - vegNoise( vec2( s * 60.0, fseed * 9.0 ) ) * 0.07;
		m = ! tear && edge ? 1.0 : 0.0;
	} else if ( part > 5.5 && s >= 0.0 ) {
		// broadleaf blades (petioles, s < 0, are kept whole)
		VegBroad sh = vegBroadShape( part, s, t, age, Ll, fseed, seed );
		m = abs( t ) < sh.w && ! sh.cut ? 1.0 : 0.0;
	}
	return m > 0.5 && vegLodDither( vIPos, vegLodRange, vegPixel );
}

vec3 vegPlantAlbedo() {
	vec2 st = vegUv;
	float s = st.x;
	float t = st.y;
	vec4 aMat = vMat;
	float part = aMat.x; float age = aMat.y; float Ll = aMat.z; float fseed = aMat.w;
	float seed = vIDat.w;
	float H = vIDat.z;
	vec3 col = vec3( 0.0 );
	float iv = vegHash12( vec2( seed * 37.1, 1.7 ) );
	if ( part < 0.5 ) {
		// stems: age 0 -> weathered, ringed palm trunk; 1 -> green banana pseudostem
		float y = vTrunkY;
		float a = st.x;
		vec3 bark = vegPalmBark( y, a, H, seed, iv ).bark;
		// (palm trunks have age 0: the pseudostem colour only where it is mixed in)
		vec3 green = vec3( 0.0 );
		if ( age > 0.0 ) {
			float fiss = vegNoise( vec2( a * 46.0, y * 1.1 + seed * 50.0 ) );
			float blotch = vegNoise( vec2( a * 7.0, y * 0.45 + seed * 13.0 ) );
			// banana pseudostem: overlapping sheaths (vertical streaks), dark blotches, dry brown
			// sheath strips peeling off low down (no leaf-scar rings)
			float streakS = vegNoise( vec2( a * 24.0, y * 0.35 + seed * 7.0 ) );
			green = mix( ${ C( 0x4e6a2a ) }, ${ C( 0x6b8438 ) }, streakS * 0.7 + fiss * 0.3 );
			green = mix( green, ${ C( 0x3b3322 ) }, ss( 0.62, 0.82, blotch ) * 0.55 );
			green = mix( green, mix( ${ C( 0x6e5534 ) }, ${ C( 0x8f7a52 ) }, fiss ), ss( 0.55, 0.75, streakS ) * ss( 1.1, 0.3, y ) );
		}
		col = mix( bark, green, age );
	} else if ( part < 1.5 ) {
		// age (aMat.y): 0 young upper fronds (lighter yellow-green) .. 0.55 old lower fronds (olive,
		// yellowing); 1 = the two hanging fronds, whose state is picked per tree and frond (one crown
		// mesh is shared): still olive, yellowing or dead brown
		float fr = vegHash12( vec2( fseed * 51.3, seed * 17.9 ) );
		float a = saturate( age / 0.55 );
		vec3 g = mix( ${ C( 0x728c33 ) }, ${ C( 0x445f27 ) }, ss( 0.0, 0.35, a ) );
		g = mix( g, ${ C( 0x69702f ) }, ss( 0.55, 1.0, a ) );
		// per tree: yellower or bluer greens; per frond: value
		g = mix( g, g * vec3( 1.12, 1.02, 0.78 ), iv * 0.8 );
		g = mix( g, g * vec3( 0.86, 0.98, 1.08 ), ( 1.0 - iv ) * 0.5 );
		g = g * mix( 0.82, 1.1, fr );
		// leaflets: darker toward their tips, paler at the base, each a little different
		float kL = floor( s * 95.0 );
		float perLeaf = vegHash12( vec2( kL, fseed * 13.1 ) );
		vec3 c = g * mix( 1.08, 0.86, ss( 0.2, 1.0, t ) ) * ( perLeaf * 0.22 + 0.9 );
		// browned, dried tips on some leaflets (more on old fronds)
		float tipK = ss( 0.72, 0.97, t ) * step( 0.55 - a * 0.35, vegHash12( vec2( kL * 1.7, fseed * 5.3 + seed ) ) );
		c = mix( c, mix( ${ C( 0x8c7a4a ) }, ${ C( 0x6e5b39 ) }, perLeaf ), tipK * 0.85 );
		// hanging fronds
		float hangK = ss( 0.8, 0.95, age );
		float state = vegHash12( vec2( fseed * 7.1, seed * 29.3 ) );
		vec3 yellowing = mix( ${ C( 0x8f8a3c ) }, ${ C( 0xa08a45 ) }, perLeaf );
		vec3 deadC = mix( ${ C( 0x7a6440 ) }, ${ C( 0x5c4a30 ) }, perLeaf );
		vec3 hangC = state > 0.62 ? deadC : ( state > 0.35 ? yellowing : c * 0.9 );
		c = mix( c, hangC, hangK );
		// midrib: pale yellow on young fronds, straw on old, brown when dead
		bool rachis = t * Ll < 0.026;
		vec3 rib = mix( mix( ${ C( 0xb3a660 ) }, ${ C( 0x98894e ) }, a ), ${ C( 0x6f5a3a ) }, hangK * step( 0.62, state ) );
		col = rachis ? rib : c;
	} else if ( part < 2.5 ) {
		vec3 c = mix( ${ C( 0x345c20 ) }, ${ C( 0x55802c ) }, ss( 0.1, 1.0, s ) * 0.6 + iv * 0.4 );
		col = c * mix( 0.85, 1.1, vegHash12( vec2( floor( s * 26.0 ), fseed ) ) );
	} else if ( part < 3.5 ) {
		if ( s < 0.0 ) {
			// banana pseudostem: overlapping sheaths (vertical streaks), brown / purple-black blotches,
			// dry brown sheath fibre peeling low down
			float f = ( s + 1.0 ) * 2.0;
			float a = t;
			float streakS = vegNoise( vec2( a * 26.0, f * 3.0 + fseed * 7.0 ) );
			float blotch = vegNoise( vec2( a * 9.0, f * 6.0 + fseed * 13.0 ) );
			vec3 gS = mix( ${ C( 0x55672e ) }, ${ C( 0x6e7d3a ) }, streakS * 0.7 + iv * 0.3 );
			gS = mix( gS, ${ C( 0x3a2a28 ) }, ss( 0.6, 0.8, blotch ) * 0.6 );
			float dry = ss( 0.45, 0.7, vegNoise( vec2( a * 14.0 + 3.0, f * 2.5 + fseed * 19.0 ) ) ) * ss( 0.8, 0.2, f );
			col = mix( gS, mix( ${ C( 0x6a5233 ) }, ${ C( 0x8e7a52 ) }, streakS ), dry * 0.9 );
		} else {
			// blade: muted green (per plant and leaf), paler midrib, faint lateral veins; dried, browned
			// margins and torn strip edges; old leaves yellowing; dead ones brown and papery
			float lf = vegHash12( vec2( fseed * 23.1, seed * 3.7 ) );
			vec3 base = mix( ${ C( 0x3f5f24 ) }, ${ C( 0x55742d ) }, iv * 0.55 + lf * 0.45 );
			base = mix( base, ${ C( 0x7c7d35 ) }, ss( 0.35, 0.6, age ) * 0.55 );
			float vein = ( sin( s * 260.0 ) * 0.5 + 0.5 ) * 0.07;
			float mott = vegNoise( vec2( s * 11.0 + fseed * 3.0, t * 4.0 ) );
			vec3 c = base * ( vein + 0.94 ) * ( mott * 0.14 + 0.93 );
			c = mix( c, ${ C( 0xa9b06e ) }, ss( 0.05, 0.0, t ) * 0.75 ); // midrib
			float xs = s * 13.0 + sin( s * 31.0 + fseed * 10.0 ) * 0.35;
			float stripEdge = ss( 0.36, 0.47, abs( fract( xs ) - 0.5 ) ) * ss( 0.4, 0.8, t ) * ( 0.3 + age );
			float dryEdge = ss( 0.72, 1.0, t + ( vegNoise( vec2( s * 25.0, fseed * 4.0 ) ) - 0.5 ) * 0.3 ) * ( 0.45 + age * 0.8 );
			vec3 brownC = mix( ${ C( 0x6b5531 ) }, ${ C( 0x8f7a48 ) }, mott );
			c = mix( c, brownC, saturate( max( dryEdge, stripEdge * 0.6 ) ) * 0.85 );
			vec3 deadC = mix( ${ C( 0x5e4a2c ) }, ${ C( 0x86704a ) }, vegNoise( vec2( s * 18.0, t * 3.0 + fseed * 5.0 ) ) );
			c = mix( c, deadC, ss( 0.85, 0.95, age ) );
			col = c;
		}
	} else if ( part > 5.5 ) {
		float hGround = vegP.y - vIPos.y;
		if ( s < 0.0 ) {
			col = vegBroadStem( part, t, ( s + 1.0 ) * 2.0, fseed, age );
		} else {
			col = vegBroadAlbedo( part, s, t, age, Ll, fseed, seed, iv, hGround );
		}
	} else {
		// coconuts: green -> yellow -> brown
		col = mix( mix( ${ C( 0x68762a ) }, ${ C( 0x9c8a34 ) }, ss( 0.3, 0.7, age ) ), ${ C( 0x5c4122 ) }, ss( 0.82, 0.95, age ) );
	}
	return col;
}
`;

const PLANT_VARYINGS = 'float vTrunkY; vec3 vTrunkT; vec4 vMat; vec4 vIDat; vec3 vIPos';

export const PLANT_LEAF = {
	name: 'veg-plant-leaf',
	attributes: PLANT_ATTRIBUTES,
	varyings: PLANT_VARYINGS,
	vertex: /* glsl */`
	VegPlant pl = vegPlantDeform( ( instanceMatrix * vec4( position, 1.0 ) ).xyz, vegInstanceNormal( instanceMatrix, normal ), iPos, iDat, aVeg, aMat, aLobe, vegLodRange );
	vec3 vegWorldPos = pl.pos;
	vec3 vegWorldNormal = pl.normal;
	vTrunkY = pl.trunkY;
	vTrunkT = pl.trunkT;
	vMat = aMat;
	vIDat = iDat;
	vIPos = iPos.xyz;`,
	fragmentPars: PLANT_GLSL,
	surface: /* glsl */`
	if ( ! vegPlantMask() ) discard;
	vec4 aMatF = vMat;
	float part = aMatF.x;
	float age = aMatF.y;
	bool isStem = part < 0.5;
	bool isNut = part > 4.5 && part < 5.5;
	bool isLeaf = ! isStem && ! isNut;
	bool isBroad = part > 5.5;
	vec3 albedo = vegPlantAlbedo();
	// the underside of fronds and leaves is duller and a little bluer than the waxy upper side
	albedo = vegFront || ! isLeaf ? albedo : albedo * vec3( 0.74, 0.8, 0.84 );
	vegAlbedo = albedo;
	// palm trunks: bark relief (rings, fissures, roots, fibres) along the trunk axis (finite
	// difference of the bark height, faded with distance); leaves: normals bent towards the viewer
	// to soften grazing-angle Fresnel
	float d = 0.0;
	float dA = 0.0;
	float fadeB = 1.0 - ss( 10.0, 32.0, length( cameraPosition - vegP ) );
	if ( isStem && fadeB > 0.0 ) {
		float seed = vIDat.w;
		float H = vIDat.z;
		float y = vTrunkY;
		float a = vegUv.x;
		float ivN = vegHash12( vec2( seed * 37.1, 1.7 ) );
		float e = 0.004;
		float ea = 0.0015; // around the trunk (a: 0..1 over a ~1.1 m circumference)
		float h0 = vegPalmBark( y, a, H, seed, ivN ).hd;
		float slope = ( vegPalmBark( y + e, a, H, seed, ivN ).hd - h0 ) / e;
		float slopeA = ( vegPalmBark( y, a + ea, H, seed, ivN ).hd - h0 ) / ( ea * 1.1 );
		d = slope * fadeB * ( 1.0 - age );
		dA = slopeA * fadeB * ( 1.0 - age );
	}
	vec3 trunkT = normalize( vTrunkT );
	vegNormalW = normalize( vegN - trunkT * d - cross( vegN, trunkT ) * dA + vegV * ( isLeaf ? 0.15 : 0.0 ) );
	// waxy but not glossy: a sharper, stronger sheen mirrored the bright sky near the sun and read as a
	// white film over backlit foliage
	// broadleaf: monstera glossy, elephant ear waxy-matte, heliconia satin, bracts glossy; dead
	// leaves dull
	float broadR = part < 6.5 ? 0.46 : ( part > 6.5 && part < 7.5 ? 0.58 : ( part > 7.5 ? 0.42 : 0.45 ) );
	vegRough = isBroad ? mix( broadR, 0.85, ss( 0.9, 0.98, age ) ) : ( isStem ? 0.92 : ( part < 1.5 || isNut ? 0.62 : 0.7 ) );
	vegSpec = isBroad ? 0.42 : ( isStem ? 0.3 : 0.4 );
	vegTransN = vegN;
	if ( isLeaf ) vegTrans = albedo * vec3( 1.25, 1.45, 0.55 ) + vec3( 0.012, 0.018, 0.0 );
	vegTrans *= ( isBroad ? 0.2 : 0.3 ) * ( 1.0 - vegNight );`,
	shadow: 'if ( ! vegPlantMask() ) discard;',
};

// Tree / shrub foliage (leaf-cluster cards) and tree bark ------------------------------------

// Trees / shrubs / impostors. aVeg = (height fraction, branch flex, flutter weight, phase);
// iDat = (yaw, vertical scale (negative: shrub), plant height (m), seed). With `lobes`, leaf cards
// move towards / onto their lobe centre (aLobe) by the per-instance lobe scale: dropped lobes
// vanish, the others vary in size, so every instance gets its own irregular crown.
const canopyDeform = ( lobes ) => /* glsl */`
	vec4 vIPos4 = iPos;
	vec4 vIDat4 = iDat;
	vec4 veg = aVeg;
	vec3 base = vIPos4.xyz;
	float sc = vIPos4.w;
	float Hh = vIDat4.z;
	float seed = vIDat4.w;
	float hf = veg.x;
	float flex = veg.y;
	float flut = veg.z;
	float ph = veg.w;
	vec3 P = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
	bool isShrubI = vIDat4.y < 0.0;
	float keep = 1.0;
${ lobes ? /* glsl */`
	// merged tree + shrub geometry: keep the parts of this instance's plant type
	bool isShrubPart = aMat.x > 3.5;
	keep = isShrubPart == isShrubI ? 1.0 : 0.0;
	// leaf cards move towards their lobe centre by the variant's lobe scale (0: dropped lobe)
	vec4 lobe = aLobe;
	float lk = lobe.w >= 0.0 ? 1.0 - vegLobeScale( seed, lobe.w, isShrubI ) : 0.0;
	vec3 ld = lobe.xyz * lk;
	float yaw = vIDat4.x; float cy = cos( yaw ); float sy = sin( yaw );
	float sv = abs( vIDat4.y );
	P += vec3( ld.x * cy + ld.z * sy, ld.y * sv, ld.z * cy - ld.x * sy ) * sc;
` : '' }
	vec3 N = vegInstanceNormal( instanceMatrix, normal );
	float w = vegWindStrength();
	float g = vegGustAt( base.xz );
	float t = vegTime;
	float ph0 = seed * 6.2832;
	float h2 = hf * hf;
	float load = vegWindLoad();
	float sway = ( load * 0.009 * ( g * 0.8 + 0.3 ) + sin( t * 0.9 + ph0 ) * w * 0.0045 * ( g + 0.4 ) ) * Hh * h2;
	float swayP = sin( t * 0.67 + ph0 * 1.3 ) * w * 0.002 * Hh * h2;
	float branch = sin( t * ( ph + 1.7 ) + ph * 20.0 + ph0 ) * flex * w * sc * 0.07 * ( g + 0.5 )
		- flex * load * sc * 0.04 * ( g + 0.3 ); // branches sag / stream in strong gusts
	float flutter = sin( t * 9.5 + ph * 50.0 + P.x * 1.9 + P.z * 2.3 ) * flut * sc * ( w * 0.035 + 0.005 );
	vec3 pos = P + vegWindDir3() * sway + vegWindPerp3() * swayP + VEG_UP * branch + N * flutter;
	// near LOD: trees and shrubs hand over to the impostors at their own distance
	float dCam = length( vegCamPos - base );
	float nearK = dCam < ( isShrubI ? vegCanopyNear.y : vegCanopyNear.x ) * ( 1.0 + VEG_LOD_BAND / 2.0 ) ? 1.0 : 0.0;
	vec3 vegWorldPos = base + ( pos - base ) * ( keep * nearK );
	vec3 vegWorldNormal = N;
`;

// near -> impostor switch distance (m) of trees (x) and shrubs (y)
export const uCanopyNear = vegUniforms.vegCanopyNear;

// aMat = (part, canopy exposure (ao), colour rand, card rand); parts: 0 bark, 1 tree card, 4 shrub card
// Species per instance (seed): trees 0 dark glossy (bronze new flush), 1 mid green, 2 yellow-green,
// 3 blue-green; shrubs 0 sea grape (round leaves, red veins), 1 croton (variegated), 2 hibiscus
// (flowering). The far impostors use the same palette (canopyLeafColor) and brightness structure.
export const CANOPY_GLSL = /* glsl */`
vec3 vegPick4( float s4, vec3 a, vec3 b, vec3 c, vec3 d ) { return s4 < 0.5 ? a : ( s4 < 1.5 ? b : ( s4 < 2.5 ? c : d ) ); }
vec3 vegPick3( float s3, vec3 a, vec3 b, vec3 c ) { return s3 < 0.5 ? a : ( s3 < 1.5 ? b : c ); }
float vegTreeSpecies( float seed ) { return floor( fract( seed * 5.31 ) * 4.0 ); }
// shrubs: 0 sea grape 45 %, 1 croton 15 %, 2 hibiscus 40 %
float vegShrubSpecies( float seed ) {
	float h = fract( seed * 3.17 );
	return h < 0.45 ? 0.0 : ( h < 0.6 ? 1.0 : 2.0 );
}

// base leaf colour of an instance (species, per-card random cr, per-instance tint)
vec3 vegCanopyLeafColor( float seed, float cr, bool isShrub ) {
	float spT = vegTreeSpecies( seed ); float spS = vegShrubSpecies( seed );
	// tree species: dark glossy (bronze flush), fresh mid green, yellow-green, blue-green
	// (Caribbean hillside forest: deep, olive and yellow-greens, muted, with a few dry / bronze
	// and flowering crowns)
	vec3 t0 = mix( mix( ${ C( 0x283a1b ) }, ${ C( 0x364a23 ) }, cr ), ${ C( 0x5e4a2e ) }, ss( 0.96, 0.995, cr ) * 0.5 );
	vec3 t1 = mix( ${ C( 0x34491f ) }, ${ C( 0x485c27 ) }, cr );
	vec3 t2 = mix( ${ C( 0x4f5a27 ) }, ${ C( 0x646a31 ) }, cr );
	vec3 t3 = mix( ${ C( 0x2a3b2a ) }, ${ C( 0x3a4a36 ) }, cr );
	vec3 s0 = mix( ${ C( 0x3f5522 ) }, ${ C( 0x52662a ) }, cr );
	vec3 s1 = mix( ${ C( 0x2c421e ) }, ${ C( 0x44561f ) }, cr );
	vec3 s2 = mix( ${ C( 0x34521c ) }, ${ C( 0x466624 ) }, cr );
	float iv = vegHash12( vec2( seed * 17.3, 4.1 ) );
	float iv2 = vegHash12( vec2( seed * 5.9, 8.3 ) );
	vec3 c = ( isShrub ? vegPick3( spS, s0, s1, s2 ) : vegPick4( spT, t0, t1, t2, t3 ) ) * ( iv * 0.36 + 0.74 );
	// a few trees dry / dropping leaves (brown-olive), or flowering (flamboyant, orange-red)
	float treeK = isShrub ? 0.0 : 1.0;
	float dry = step( iv2, 0.035 ) * treeK;
	c = mix( c, mix( ${ C( 0x5c5234 ) }, ${ C( 0x6e5a3a ) }, cr ), dry * 0.5 );
	float flower = step( 0.988, iv2 ) * treeK * step( 0.5, cr );
	c = mix( c, ${ C( 0x8a4a2c ) }, flower * 0.5 );
	return mix( vec3( luminance( c ) ), c, 0.85 );
}

vec3 vegBarkColor( float n, float n2 ) {
	return mix( mix( ${ C( 0x302a22 ) }, ${ C( 0x5c5549 ) }, n * 0.6 + n2 * 0.4 ), ${ C( 0x7b7b6a ) }, ss( 0.64, 0.8, n2 ) * 0.3 );
}

// leaf-cluster tile of a card: trees broad / narrow leaves by species, shrubs round / narrow
float vegLeafTile( float seed, bool isShrub ) {
	float spT = vegTreeSpecies( seed ); float spS = vegShrubSpecies( seed );
	return isShrub ? ( spS == 1.0 ? 3.0 : 2.0 ) : ( fract( spT * 0.5 ) > 0.25 ? 1.0 : 0.0 );
}

// alpha-test threshold compensating the coverage loss of the minified (mipmapped) leaf texture
float vegCoverageThreshold( vec2 st ) {
	float lod = log2( max( max( fwidth( st.x ), fwidth( st.y ) ) * 256.0, 1e-4 ) );
	return mix( 0.5, 0.3, saturate( lod / 4.0 ) );
}

// Runtime colour of an impostor fragment (same palette as the near canopy)
vec3 vegImpostorColor( float seed, float cr, float leaf, float bright, bool isGroup1 ) {
	vec3 leafC = vegCanopyLeafColor( seed, cr, isGroup1 ) * ( bright * 1.4 );
	// limbs and twigs seen through the crown gaps are in the crown's shade: dark and a little
	// green-brown, and the leaves dominate the blend (grey limbs made far crowns read grey-beige)
	vec3 barkC = mix( ${ C( 0x1c1a13 ) }, ${ C( 0x2e2b20 ) }, ( bright - 0.4 ) / 0.5 );
	vec3 c = mix( barkC, leafC, ss( 0.05, 0.55, leaf ) );
	// far crowns keep their green through the haze (a little more saturated than the near canopy)
	return max( mix( vec3( luminance( c ) ), c, 1.25 ), vec3( 0.0 ) );
}
`;

// the canopy mask (fragment and shadow pass): leaf coverage, edge-on thinning, impostor cross-fade
const CANOPY_MASK = /* glsl */`
bool vegCanopyMask( vec4 L ) {
	float part = vMat.x;
	bool isBark = part < 0.5 || part > 4.5;
	// cross-fade into the impostors (outgoing level of the band around uCanopyNear)
	float nearD = vIDat.y < 0.0 ? vegCanopyNear.y : vegCanopyNear.x;
	float fade = ss( nearD * ( 1.0 - VEG_LOD_BAND / 2.0 ), nearD * ( 1.0 + VEG_LOD_BAND / 2.0 ), length( vegCamPos - vIPos ) );
	// cards seen edge-on thin out (no sliver lines through the crown)
	float facing = abs( dot( normalize( cross( dFdx( vegP ), dFdy( vegP ) ) ), vegV ) );
	float thr = vegCoverageThreshold( vegUv ) + ( 1.0 - ss( 0.08, 0.35, facing ) ) * 0.45;
	return ( isBark || L.x > thr ) && bayer4( vegPixel ) >= fade;
}
vec4 vegCanopyLeaf() {
	float part = vMat.x;
	return vegLeafSample( vegUv, vegLeafTile( vIDat.w, part > 2.5 ) );
}
`;

export function canopyMaterialDef( leafAtlas ) {

	return {
		name: 'veg-canopy',
		attributes: PLANT_ATTRIBUTES,
		varyings: 'vec4 vMat; vec4 vIDat; vec3 vIPos; float vHf',
		uniforms: leafAtlas.uniforms,
		vertex: canopyDeform( true ) + /* glsl */`
	vMat = aMat;
	vIDat = iDat;
	vIPos = iPos.xyz;
	vHf = aVeg.x;`,
		fragmentPars: CANOPY_GLSL + leafAtlas.glsl + CANOPY_MASK,
		surface: /* glsl */`
	vec4 aMatF = vMat;
	float part = aMatF.x;
	float ao = aMatF.y;
	float cr = aMatF.z;
	float seed = vIDat.w;
	bool isBark = part < 0.5 || part > 4.5;
	bool isShrub = part > 2.5;
	float spT = vegTreeSpecies( seed ); float spS = vegShrubSpecies( seed );
	// leaf cluster sampled once (first in the fragment shader), shared by the mask and the colour
	vec4 L = vegCanopyLeaf();
	if ( ! vegCanopyMask( L ) ) discard;
	float bright = L.y * 1.4;
	float cell = L.z;
	vec3 c = vegCanopyLeafColor( seed, cr, isShrub ) * bright;
	// species details: red-veined old leaves (sea grape), variegation (croton), flowers (hibiscus)
	bool shrub0 = isShrub && spS < 0.5; bool shrub1 = isShrub && spS == 1.0; bool shrub2 = isShrub && spS > 1.5;
	c = mix( c, ${ C( 0x7a3a22 ) }, ss( 0.86, 0.98, cell ) * 0.55 * ( shrub0 ? 1.0 : 0.0 ) );
	vec3 vari = fract( cell * 7.3 ) > 0.5 ? ${ C( 0x9a8a30 ) } : ${ C( 0x7a3a22 ) };
	c = mix( c, vari, ss( 0.72, 0.9, cell ) * 0.55 * ( shrub1 ? 1.0 : 0.0 ) );
	c = shrub2 && cell > 0.92 ? ${ C( 0xb3261e ) } : c;
	// trees: a few old leaves turning red / yellow before they drop (sea almond)
	float treeK = isShrub ? 0.0 : 1.0;
	c = mix( c, mix( ${ C( 0x8a7a3a ) }, ${ C( 0x7e3e22 ) }, step( 0.992, fract( cell * 3.7 ) ) ), step( 0.984, fract( cell * 3.7 ) ) * treeK * 0.6 );
	// sunlit outer / upper leaves brighter and a little yellow-green; shaded interior kept for contrast
	float outer = ss( 0.62, 1.0, ao );
	c = mix( c, c * vec3( 1.16, 1.22, 0.92 ), outer * 0.7 );
	vec3 leaf = c * mix( 0.55, 1.0, ao );
	// bark: grey-brown with vertical streaks, lichen patches
	float hfB = vHf;
	vec3 albedo = leaf;
	if ( isBark ) {
		vec2 st = vegUv;
		float n2 = vegNoise( vec2( st.x * 6.0, st.y * 0.7 ) );
		vec3 bark = vegBarkColor( vegNoise( vec2( st.x * 30.0, st.y * 2.5 + seed * 40.0 ) ), n2 );
		// moss and epiphytes on the humid lower trunk and the upper sides of the limbs
		bark = mix( bark, mix( ${ C( 0x2c3a18 ) }, ${ C( 0x44552a ) }, n2 ), ss( 0.45, 0.7, vegNoise( vec2( st.x * 9.0, st.y * 1.3 + seed * 11.0 ) ) + ( 0.35 - hfB ) * 0.6 ) * 0.7 );
		albedo = bark;
	}
	vegAlbedo = albedo;
	// bark: the trunk under the crown sees little of the sky
	vegAO = isBark ? ss( 0.0, 0.75, hfB ) * 0.45 + 0.4 : mix( 0.35, 1.0, ao );
	vegRough = isBark ? 0.92 : ( ( isShrub && spS < 0.5 ) || ( ! isShrub && spT < 0.5 ) ? 0.65 : 0.82 );
	vegSpec = 0.15;
	// leaves: canopy (spherical) normals, not flipped on back faces, bent towards the viewer
	// so they are never shaded at grazing angles (avoids a white Fresnel sheen when backlit)
	vec3 geoN = normalize( vVegN );
	vegNormalW = isBark ? vegN : normalize( geoN + vegV * 0.7 );
	vegTransN = geoN;
	if ( ! isBark ) vegTrans = ( albedo * vec3( 1.25, 1.45, 0.55 ) + vec3( 0.012, 0.018, 0.0 ) ) * 0.5 * ( 1.0 - vegNight ) * ( ao * 0.6 + 0.4 );`,
		shadow: 'if ( ! vegCanopyMask( vegCanopyLeaf() ) ) discard;',
	};

}

// Unlit bake materials for the impostor atlases (ShaderMaterials on InstancedMeshes):
//   albedo: (leaf brightness / 1.4 | bark brightness, leaf flag, card colour random, 1)
//   normal: (plant-local normal * 0.5 + 0.5, exposure)
export function createCanopyBakeMaterials( leafAtlas ) {

	const make = ( which ) => new THREE.ShaderMaterial( {
		name: 'veg-impostor-bake-' + which,
		side: THREE.DoubleSide,
		uniforms: { ...vegUniforms, ...leafAtlas.uniforms },
		vertexShader: VEG_GLSL + /* glsl */`
attribute vec4 aMat;
varying vec4 vMat;
varying vec3 vLocalN;
varying vec2 vUv;
void main() {
	vMat = aMat;
	vLocalN = normal;
	vUv = uv;
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}`,
		fragmentShader: VEG_GLSL + leafAtlas.glsl + /* glsl */`
varying vec4 vMat;
varying vec3 vLocalN;
varying vec2 vUv;
void main() {
	vec4 aMat = vMat;
	float part = aMat.x;
	bool isBark = part < 0.5 || part > 4.5;
	bool isShrub = part > 2.5;
	vec2 st = vUv;
	vec4 L = vegLeafSample( st, isShrub ? 2.0 : 0.0 );
	// the cards are a few atlas pixels wide: the minified leaf texture's coverage is compensated
	// like the near canopy's (vegCoverageThreshold), else the baked crowns come out threadbare
	float lod = log2( max( max( fwidth( st.x ), fwidth( st.y ) ) * 256.0, 1e-4 ) );
	if ( ! ( isBark || L.x > mix( 0.5, 0.3, clamp( lod / 4.0, 0.0, 1.0 ) ) ) ) discard;
${ which === 'albedo' ? /* glsl */`
	float vBright = L.y * 1.4;
	float barkN = vegNoise( vec2( st.x * 30.0, st.y * 2.5 ) ) * 0.6 + vegNoise( vec2( st.x * 6.0, st.y * 0.7 ) ) * 0.4;
	float bright = isBark ? barkN * 0.5 + 0.4 : vBright / 1.4;
	gl_FragColor = vec4( bright, isBark ? 0.0 : 1.0, aMat.z, 1.0 );` : /* glsl */`
	gl_FragColor = vec4( normalize( vLocalN ) * 0.5 + 0.5, isBark ? 0.6 : aMat.y );` }
}`,
	} );

	return { albedo: make( 'albedo' ), normal: make( 'normal' ) };

}

// Runtime colour of an impostor fragment (same palette as the near canopy): GLSL
// vegImpostorColor( seed, cr, leaf, bright, isGroup1 ) in CANOPY_GLSL
export const impostorColor = 'vegImpostorColor';
