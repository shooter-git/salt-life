import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { VillageTextures } from './TextureBaker.js';

// Shared PBR materials for the village, pier and props (WebGL 2: three's MeshStandardMaterial with
// Tidewater's surfaces spliced in by onBeforeCompile).
//
// Surface detail comes from tileable texture sets baked on the GPU while the game loads (see
// TextureBaker.js): albedo / mask maps plus RG normal, B roughness, A ambient occlusion.
// UVs are in metres (GeoBuilder), so texel density is constant (256-1024 px/m).
// Per-vertex attributes keep every piece unique:
//   tint  (vec3) base color (paint color, wood tone, rope color ...)
//   vdata (vec4) material specific parameters (documented per material below)
// Normal layers are blended in slope (derivative) space; a second, higher frequency detail
// normal fades in near the camera and a low frequency macro layer hides tiling.
// Each material samples at most 4 textures.
// Materials: wood (+ glass, pattern 9), roofMetal, thatch, hard (+ rope), stone, fabric, net.
//
// Port notes: each material's Tidewater `surface` snippet is a GLSL function here,
// `void vlmSurface( inout VlmSurf s )`, which fills albedo / roughness / metalness / ao / emissive /
// normal (WORLD space) / alpha. The function runs at three's color_fragment; its results replace
// diffuseColor, roughnessFactor, metalnessFactor, the normal, the emissive radiance and the indirect
// light's occlusion. Inputs: vWP (world position), vlmN (world normal, facing the viewer), vUv0
// (the metre uvs), vTint / vData (the per-vertex attributes). G.* -> vlm* uniforms.
//
// GLSL shared by all the village materials:
//   float vlmHash21( x, y )                         sin hash
//   vec2 vlmSlopeOf( vec4 t )                       baked normal (RG) -> surface slope
//   vec3 vlmNormalFromSlope( P, N, uv, vec2 s )     slope in uv space -> world normal
//   float vlmBand01( p, k )
//   VlmTidal vlmTidal( P, col, rough )              (reads vlgGrime)

const TAU = Math.PI * 2;

const COMMON = /* glsl */`
#define VLM_TAU ${ TAU }
uniform float vlmTime;
uniform float vlmNight;
uniform vec2 vlmWindDir;
uniform float vlmWindSpeed;
varying vec3 vTint;
varying vec4 vData;
varying vec3 vWP;
varying vec3 vWN;
varying vec2 vUv0;

struct VlmSurf { vec3 albedo; float roughness; float metalness; float ao; vec3 emissive; vec3 normal; float alpha; };

float vlmHash21( float x, float y ) { return fract( sin( x * 12.9898 + y * 78.233 ) * 43758.5453 ); }
float vlmN01( float n ) { return n * 0.5 + 0.5; }
float vlmSat( float x ) { return clamp( x, 0.0, 1.0 ); }
float vlmLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

// baked normal (RG = xy of a unit normal) -> surface slope ( -dh/du, -dh/dv )
vec2 vlmSlopeOf( vec4 t ) {
	vec2 xy = t.xy * 2.0 - 1.0;
	return xy / sqrt( max( 1.0 - dot( xy, xy ), 0.04 ) );
}

float vlmBand01( float p, float k ) { return step( k - 0.5, p ) * step( p, k + 0.5 ); }

// tangent frame from the uv derivatives (three's perturbNormal2Arb, world space)
vec3 vlmNormalFromSlope( vec3 P, vec3 N, vec2 uv, vec2 s ) {
	vec3 mapN = normalize( vec3( s, 1.0 ) );
	vec3 q0 = dFdx( P ), q1 = dFdy( P );
	vec2 st0 = dFdx( uv ), st1 = dFdy( uv );
	vec3 q1perp = cross( q1, N );
	vec3 q0perp = cross( N, q0 );
	vec3 T = q1perp * st0.x + q0perp * st1.x;
	vec3 B = q1perp * st0.y + q0perp * st1.y;
	float det = max( dot( T, T ), dot( B, B ) );
	float scale = ( det == 0.0 ? 0.0 : inversesqrt( det ) ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
	return normalize( T * ( mapN.x * scale ) + B * ( mapN.y * scale ) + N * mapN.z );
}
`;

// tidal zone (materials that bind the grime map as vlgGrime and sit in the splash zone)
const TIDAL = /* glsl */`
struct VlmTidal { vec3 col; float rough; float wet; };

// Tidal zone: algae / barnacles / wet darkening driven by world height above sea level.
VlmTidal vlmTidal( vec3 pw, vec3 col, float rough ) {
	vec2 q = vec2( pw.x + pw.z * 0.7, pw.y );
	vec4 Gt = texture( vlgGrime, q * vec2( 0.6, 1.2 ) );
	float y = pw.y + ( Gt.a - 0.5 ) * 0.3;
	float wet = 1.0 - smoothstep( 0.3, 0.75, y );
	float damp = ( 1.0 - smoothstep( 0.7, 1.5, y ) ) * 0.4;
	vec3 algae = mix( vec3( 0.028, 0.042, 0.02 ), vec3( 0.11, 0.105, 0.05 ), Gt.a * 0.6 + Gt.r * 0.4 );
	vec4 Gb = texture( vlgGrime, q * 3.1 );
	float barn = Gb.b * smoothstep( - 1.6, - 0.35, y ) * ( 1.0 - smoothstep( 0.25, 0.6, y ) );
	vec3 c = col * ( 1.0 - damp );
	c = mix( c, algae, wet );
	c = mix( c, vec3( 0.52, 0.5, 0.44 ), barn * 0.9 );
	float r = mix( rough, 0.3, wet * 0.9 );
	r = mix( r, 0.55, damp );
	r = mix( r, 0.9, barn );
	return VlmTidal( c, r, wet );
}
`;

// ---------------------------------------------------------------------------
// GLASS (evaluated inside the wood material): window panes and lantern glass, emissive at night.
// uv: normalized 0..1 across a pane. kind 0 window / 1 lantern, lit 0/1, tint: curtain / glass color

const GLASS = /* glsl */`
struct VlmGlass { vec3 color; float rough; vec3 emissive; };

VlmGlass vlmGlass( vec2 uvm, vec3 aTint, float seed, float kind, float lit ) {
	// grime map channels: R streaks, G salt, B spots, A macro
	vec4 Gl = texture( vlgGrime, uvm * 0.45 + vec2( seed * 3.7, seed * 1.3 ) );
	float edgeD = min( min( uvm.x, 1.0 - uvm.x ), min( uvm.y, 1.0 - uvm.y ) );
	float frameDirt = 1.0 - smoothstep( 0.0, 0.07, edgeD );
	float curtain = ( 1.0 - smoothstep( 0.18, 0.3, uvm.x ) + smoothstep( 0.7, 0.82, uvm.x ) ) * step( 0.35, seed );
	float folds = vlmN01( sin( uvm.x * 70.0 + seed * 20.0 ) );
	vec3 interior = vec3( 0.012, 0.014, 0.017 ) * ( Gl.a * 0.8 + 0.6 );
	vec3 winCol = mix( interior, aTint * 0.16 * ( folds * 0.4 + 0.6 ), curtain );
	winCol = winCol + vec3( 0.05, 0.05, 0.045 ) * Gl.g + vec3( 0.03, 0.026, 0.02 ) * ( Gl.b + frameDirt );
	vec3 lanternCol = aTint * 0.55 * ( 1.0 - Gl.b * 0.25 );
	float isLantern = step( 0.5, kind );
	vec3 color = mix( winCol, lanternCol, isLantern );
	float rough = mix( 0.035 + Gl.r * 0.22 + Gl.g * 0.18 + Gl.b * 0.1 + frameDirt * 0.25, 0.32 + Gl.r * 0.15, isLantern );

	float nightOn = smoothstep( 0.15, 0.75, vlmNight );
	vec3 warm = vec3( 1.0, 0.56, 0.24 );
	float center = 1.0 - smoothstep( 0.1, 0.75, abs( uvm.x - 0.5 ) * 1.4 + abs( uvm.y - 0.62 ) );
	vec3 winGlow = mix( warm * ( center * 0.6 + 0.5 ), ( aTint * 0.5 + warm * 0.5 ) * ( folds * 0.3 + 0.45 ), curtain )
		* ( vlmHash21( seed, 3.1 ) * 0.5 + 0.75 ) * 3.2 * ( 1.0 - Gl.r * 0.25 );
	float flicker = sin( vlmTime * 9.0 + seed * 40.0 ) * sin( vlmTime * 5.3 + seed * 13.0 ) * 0.12 + 0.9;
	vec3 lanternGlow = vec3( 1.0, 0.64, 0.3 ) * 6.0 * flicker;
	vec3 emissive = mix( winGlow, lanternGlow, isLantern ) * nightOn * max( lit, isLantern );
	return VlmGlass( color, rough, emissive );
}
`;

// sway for cloth / nets (vertex; `transformed` is the local position)
const SWAY = /* glsl */`
	float swW = vdata.y;
	float swPh = vlmTime * 1.7 + transformed.x * 0.6 + transformed.z * 0.45 + vdata.x * 20.0;
	float swGust = sin( swPh ) * 0.6 + sin( swPh * 2.3 + 1.7 ) * 0.3 + 0.55;
	float swFlutter = sin( vlmTime * 7.0 + transformed.y * 9.0 + vdata.x * 50.0 ) * 0.25;
	vec3 swayPos = transformed + vec3( vlmWindDir.x, swFlutter * 0.3, vlmWindDir.y ) * ( ( swGust + swFlutter ) * ( vlmWindSpeed * 0.011 * swW ) );
`;

// MeshStandardMaterial + a surface function. `textures`: { glslName: texture }. extra: GLSL chunks
// (functions, constants) the surface uses, each a string (shareProgram includes each chunk once).
function villageMaterial( params, T, names, { surface, vertex = '', extra = [] } ) {

	const m = new THREE.MeshStandardMaterial( params );
	const uniforms = {
		vlmTime: G.time, vlmNight: G.night, vlmWindDir: G.windDir, vlmWindSpeed: G.windSpeed,
	};
	for ( const n of names ) uniforms[ samplerOf( n ) ] = { value: T[ n ] };
	const extras = [].concat( extra );
	const build = villageShader( names, extras.join( '' ), surface, vertex );
	m.onBeforeCompile = ( shader ) => build( shader, uniforms );
	// the shader source differs per material (onBeforeCompile): give each its own program cache key
	const key = 'village:' + ( params.name || '' ) + surface.length + ':' + vertex.length;
	m.customProgramCacheKey = () => key;
	m.userData.vlm = { names, surface, vertex, extras, uniforms };
	return m;

}

const samplerOf = ( n ) => 'vlg' + n[ 0 ].toUpperCase() + n.slice( 1 );

// the onBeforeCompile of a village material: Tidewater's surface spliced into MeshStandardMaterial
function villageShader( names, extra, surface, vertex ) {

	const samplers = names.map( ( n ) => `uniform sampler2D ${ samplerOf( n ) };\n` ).join( '' );
	return ( shader, uniforms ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec3 tint;\nattribute vec4 vdata;\nuniform float vlmTime;\nuniform vec2 vlmWindDir;\nuniform float vlmWindSpeed;\nvarying vec3 vTint;\nvarying vec4 vData;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying vec2 vUv0;\n' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvTint = tint;\n\tvData = vdata;\n\tvUv0 = uv;\n' + vertex )
			.replace( '#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvWN = normalize( mat3( modelMatrix ) * objectNormal );' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + samplers + COMMON + extra + surface )
			.replace( '#include <color_fragment>', /* glsl */`
	VlmSurf sv;
	vec3 vlmN = normalize( vWN ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
	sv.albedo = diffuseColor.rgb; sv.roughness = roughness; sv.metalness = metalness; sv.ao = 1.0;
	sv.emissive = vec3( 0.0 ); sv.normal = vlmN; sv.alpha = 1.0;
	vlmSurface( sv, vlmN );
	diffuseColor.rgb = sv.albedo;
	diffuseColor.a *= sv.alpha;` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = sv.roughness;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = sv.metalness;' )
			.replace( '#include <normal_fragment_maps>', '\tnormal = normalize( ( viewMatrix * vec4( sv.normal, 0.0 ) ).xyz );' )
			.replace( '#include <emissivemap_fragment>', '\ttotalEmissiveRadiance = sv.emissive;' )
			.replace( '#include <aomap_fragment>', /* glsl */`
	reflectedLight.indirectDiffuse *= sv.ao;
	reflectedLight.indirectSpecular *= sv.ao;` );

	};

}

// (Salt Life, low-powered devices) materials that differ only in their surface (same render state,
// no vertex code) drawn with ONE program: every surface function in it, picked by a uniform. A
// standard material's program is ~100 KB of GLSL, and compiling them is most of the load on a device
// that draws on its CPU. (Not above low: with shadow maps the textures would pass 16 per shader.)
function shareProgram( list, T ) {

	const names = [ ...new Set( list.flatMap( ( m ) => m.userData.vlm.names ) ) ];
	const extras = [ ...new Set( list.flatMap( ( m ) => m.userData.vlm.extras ) ) ];
	let surfaces = '', pick = '';
	list.forEach( ( m, k ) => {

		surfaces += m.userData.vlm.surface.replace( 'void vlmSurface(', `void vlmSurface${ k }(` );
		pick += `\t${ k ? 'else ' : '' }if ( vlmKind == ${ k } ) vlmSurface${ k }( s, Ng );\n`;

	} );
	const surface = `${ surfaces }\nuniform int vlmKind;\nvoid vlmSurface( inout VlmSurf s, vec3 Ng ) {\n${ pick }}\n`;
	const build = villageShader( names, extras.join( '' ), surface, '' );
	const key = 'village:shared:' + list.map( ( m ) => m.name ).join( ',' );
	list.forEach( ( m, k ) => {

		const uniforms = m.userData.vlm.uniforms;
		for ( const n of names ) uniforms[ samplerOf( n ) ] = { value: T[ n ] };
		uniforms.vlmKind = { value: k };
		m.onBeforeCompile = ( shader ) => build( shader, uniforms );
		m.customProgramCacheKey = () => key;

	} );

}

// ---------------------------------------------------------------------------
// WOOD: raw and painted timber.
// vdata: x seed, y paint (0 raw, 0.3 heavily worn .. 1 fresh; < 0: raw deck board with a worn walking
//        path along it, centred at u = -paint - 1), z pattern, w weathering (0 fresh .. 1 silver)
// World-space weathering on every piece: rain / rust streaks down vertical faces, bird droppings on
// upward faces above head height, the tidal belt near the water (vlmTidal).
// patterns: 0 plain, 1 lap siding, 2 board & batten, 3 vertical tongue & groove,
//           4 louvers, 5 planks along u (staves, clinker), 6 horizontal planks (flush),
//           7 nailed deck plank (nail heads + rust stains every 0.8 m),
//           9 GLASS (window panes / lantern glass): vdata = seed, kind (0 window, 1 lantern), 9, lit
// tint: paint color when painted, otherwise a wood tone multiplier.
// uv: metres, u along the grain; end-grain faces are flagged with u + 1000, post tops with u + 2000.

export function createWoodMaterial( T ) {

	const m = villageMaterial( { roughness: 0.85, metalness: 0, name: 'VillageWood' }, T, [ 'woodA', 'woodN', 'paintN', 'grime' ], { extra: [ TIDAL, GLASS ], surface: /* glsl */`
// (M13) what a hurricane's sea left (Village.setDamage): x the sand, y the weed, z how high it reached
// (m), w how long ago (0 fresh .. 1 dried)
uniform vec4 vlmStorm;
float vlmVN( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( vlmHash21( i.x, i.y ), vlmHash21( i.x + 1.0, i.y ), f.x ), mix( vlmHash21( i.x, i.y + 1.0 ), vlmHash21( i.x + 1.0, i.y + 1.0 ), f.x ), f.y );
}
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec3 aTint = vTint;
	vec4 aData = vData;
	float seed = aData.x;
	float paint = aData.y;
	float pattern = aData.z;
	float weather = aData.w;
	vec2 uv0 = vUv0;
	vec3 P = vWP;
	float isCap = step( 1500.0, uv0.x );
	float isEnd = step( 500.0, uv0.x ) * ( 1.0 - isCap );
	float endAny = max( isCap, isEnd );
	vec2 uvS = uv0 - vec2( isCap * 2000.0 + isEnd * 1000.0, 0.0 );
	vec2 fw = fwidth( uvS );
	float px = max( fw.x, fw.y );
	float near = 1.0 - smoothstep( 0.0012, 0.005, px );

	float mLap = vlmBand01( pattern, 1.0 );
	float mBB = vlmBand01( pattern, 2.0 );
	float mTG = vlmBand01( pattern, 3.0 );
	float mLv = vlmBand01( pattern, 4.0 );
	float mPk = vlmBand01( pattern, 5.0 );
	float mHz = vlmBand01( pattern, 6.0 );
	float mNail = step( 6.5, pattern );
	float isVert = mBB + mTG;
	vec2 g = mix( uvS, uvS.yx, isVert ); // g.x along the grain

	// every board of siding / planking gets its own piece of the wood texture
	float boardIdx = floor( uvS.y / 0.2 ) * mLap + floor( uvS.y / 0.16 ) * mHz
		+ floor( uvS.x / 0.42 ) * mBB + floor( uvS.x / 0.14 ) * mTG + floor( uvS.y / 0.105 ) * mPk;
	float pieceSeed = seed * 131.0 + boardIdx * 7.13;
	vec2 off = vec2( vlmHash21( pieceSeed, 1.7 ), vlmHash21( pieceSeed, 9.2 ) );
	vec2 tuv = g * vec2( 0.5, 1.0 ) + off;
	vec4 A = texture( vlgWoodA, tuv );
	vec4 Nt = texture( vlgWoodN, tuv );
	vec4 D = texture( vlgWoodN, tuv * vec2( 3.0, 4.0 ) + vec2( 0.37, 0.61 ) );

	// grime / salt / macro variation in mesh space
	vec4 Gm = texture( vlgGrime, uvS * 0.5 + off.yx * 0.5 );
	float macroV = texture( vlgGrime, uvS * 0.07 + vec2( seed * 0.37, seed * 0.71 ) ).a;
	float hasPaint = step( 0.001, paint );
	// raw timber weathers along the grain: the same grime map stretched ~15x along the board, so
	// dirt, salt and tone vary in long streaks and change gradually from one end to the other
	vec4 Gs = texture( vlgGrime, g * vec2( 0.035, 0.55 ) + off * 0.5 );
	float rawK = 1.0 - hasPaint;

	// end grain: polar remap of the side-grain texture -> growth rings become arcs (plank ends) or circles (post tops)
	vec2 pith = mix(
		vec2( vlmHash21( seed, 5.3 ) * 0.4 - 0.6, vlmHash21( seed, 6.1 ) * 0.3 + 0.25 ),
		vec2( ( vlmHash21( seed, 3.1 ) - 0.5 ) * 0.02, ( vlmHash21( seed, 4.7 ) - 0.5 ) * 0.02 ),
		isCap
	);
	vec2 ev = uvS - pith;
	float er = length( ev );
	vec2 eUV = vec2( atan( ev.y, ev.x ) / VLM_TAU * 3.0 + off.x, er + off.y );
	float eLod = log2( max( fwidth( er ) * 1024.0, 1.0 ) );
	vec4 E = textureLod( vlgWoodA, eUV, eLod );

	// raw timber colour: the baked map is fully weathered silver; less weathered pieces shift to warm brown
	float wW = clamp( weather + ( macroV - 0.5 ) * 0.35, 0.0, 1.0 );
	// wood exposed under chipped paint was protected until recently: lighter and warmer
	float wWx = wW * mix( 1.0, 0.6, hasPaint );
	vec3 sideCol = mix( A.rgb * vec3( 1.26, 1.02, 0.78 ) * 1.04, A.rgb, smoothstep( 0.12, 0.6, wWx ) );
	vec3 endCol = mix( E.rgb * vec3( 1.3, 1.0, 0.7 ), E.rgb, wW ) * 0.66;
	vec3 woodTone = mix( aTint, vec3( 1.2 ), hasPaint );
	float boardTone = ( vlmHash21( pieceSeed, 3.3 ) - 0.5 ) * 0.16 + ( Gs.a - 0.5 ) * 0.14;
	vec3 wood = mix( sideCol, endCol, endAny ) * woodTone * ( macroV * 0.2 + 0.9 ) * ( 1.0 + boardTone * rawK );

	// paint film: chips follow the baked chip field; the film has thickness at the chip edges
	// chip field quantiles: 5% 0.26, 10% 0.31, 20% 0.35, 30% 0.39 -> paint 0.7 leaves ~8% bare wood,
	// 0.6 ~14%, 0.5 ~22%; lap drip edges and the splash zone near wall bottoms wear faster
	float chip = A.a;
	float lapEdge = ( 1.0 - smoothstep( 0.0, 0.18, fract( uvS.y / 0.2 ) ) ) * mLap;
	float lowWall = ( 1.0 - smoothstep( 0.0, 0.7, uvS.y ) ) * ( mLap + mBB + mTG );
	float thr = clamp( 0.395 - ( paint - 0.4 ) * 0.32 + lapEdge * 0.05 + lowWall * 0.05, 0.15, 0.55 );
	float painted = smoothstep( thr - 0.012, thr + 0.012, chip ) * hasPaint * ( 1.0 - endAny );
	float e = 1.0 / 1024.0;
	float cX = texture( vlgWoodA, tuv + vec2( e, 0.0 ) ).a - texture( vlgWoodA, tuv - vec2( e, 0.0 ) ).a;
	float cY = texture( vlgWoodA, tuv + vec2( 0.0, e ) ).a - texture( vlgWoodA, tuv - vec2( 0.0, e ) ).a;
	float edge = ( 1.0 - smoothstep( 0.0, 0.025, abs( chip - thr ) ) ) * hasPaint * near;
	vec2 edgeSlope = vec2( cX, cY ) * edge * - 9.0;
	vec4 Pn = texture( vlgPaintN, g * vec2( 1.0, 2.0 ) + off * 3.7 );

	float fade = clamp( Gm.a * 0.55 + wW * 0.25 + macroV * 0.2, 0.0, 1.0 );
	vec3 chalk = aTint * 0.64 + vec3( 0.27, 0.265, 0.25 );
	// bright paints (white trim, cream siding) never stay white out here: dusty, yellowed, grey
	vec3 aged = mix( aTint, aTint * vec3( 0.86, 0.84, 0.77 ), smoothstep( 0.45, 0.8, vlmLum( aTint ) ) * ( 0.6 + Gm.a * 0.4 ) );
	vec3 paintCol = mix( aged, chalk, fade * 0.5 ) * ( ( Pn.b - 0.5 ) * 0.16 + 1.0 );

	// siding / plank patterns (shading and slope in mesh space)
	float fvLap = fract( uvS.y / 0.2 );
	float lapFade = 1.0 - smoothstep( 0.02, 0.07, fw.y );
	float lapShade = mix( 0.92, mix( 0.45, 1.03, smoothstep( 0.0, 0.09, fvLap ) ) - fvLap * 0.07, lapFade );
	float lapSy = mix( 0.0, fvLap < 0.07 ? - 2.4 : - 0.14, lapFade );

	float fuBB = fract( uvS.x / 0.42 );
	float bbFade = 1.0 - smoothstep( 0.03, 0.09, fw.x );
	float inBatten = step( fuBB, 0.12 );
	float bbShade = mix( 0.95, mix( 1.0, 0.7, ( 1.0 - smoothstep( 0.12, 0.2, fuBB ) ) * ( 1.0 - inBatten ) ) * ( inBatten * 0.06 + 1.0 ), bbFade );
	float bbSx = ( fuBB < 0.015 ? - 2.0 : ( abs( fuBB - 0.112 ) < 0.012 ? 2.0 : 0.0 ) ) * bbFade;

	float fuTG = fract( uvS.x / 0.14 );
	float tgFade = 1.0 - smoothstep( 0.015, 0.05, fw.x );
	float tgShade = mix( 0.96, mix( 0.6, 1.0, smoothstep( 0.0, 0.06, fuTG ) ), tgFade );
	float tgSx = ( fuTG < 0.03 ? - 1.0 : ( fuTG < 0.06 ? 1.0 : 0.0 ) ) * tgFade;

	float fvLv = fract( uvS.y / 0.07 );
	float lvFade = 1.0 - smoothstep( 0.008, 0.03, fw.y );
	float lvShade = mix( 0.8, mix( 0.42, 1.05, smoothstep( 0.0, 0.8, fvLv ) ), lvFade );
	float lvSy = mix( 0.0, fvLv > 0.85 ? 1.2 : - 1.0, lvFade );

	float fvPk = fract( uvS.y / 0.105 );
	float pkFade = 1.0 - smoothstep( 0.012, 0.04, fw.y );
	float pkShade = mix( 0.95, mix( 0.58, 1.0, smoothstep( 0.0, 0.07, fvPk ) ), pkFade );
	float pkSy = ( fvPk < 0.035 ? - 1.0 : ( fvPk < 0.07 ? 1.0 : 0.0 ) ) * pkFade;

	float fvHz = fract( uvS.y / 0.16 );
	float hzFade = 1.0 - smoothstep( 0.015, 0.05, fw.y );
	float hzShade = mix( 0.95, mix( 0.5, 1.0, smoothstep( 0.0, 0.05, fvHz ) ), hzFade );

	float shade = 1.0
		+ mLap * ( lapShade - 1.0 ) + mBB * ( bbShade - 1.0 ) + mTG * ( tgShade - 1.0 )
		+ mLv * ( lvShade - 1.0 ) + mPk * ( pkShade - 1.0 ) + mHz * ( hzShade - 1.0 );

	// nail heads with rust bleed on deck planks
	float nu = ( fract( ( uvS.x - 0.1 ) / 0.8 + 0.5 ) - 0.5 ) * 0.8;
	float nv = min( abs( uvS.y - 0.045 ), abs( uvS.y - 0.155 ) );
	float nearN = 1.0 - smoothstep( 0.0015, 0.004, px );
	float nail = ( 1.0 - smoothstep( 0.0045, 0.0075, length( vec2( nu, nv ) ) ) ) * mNail * nearN;
	float stain = ( 1.0 - smoothstep( 0.0, 0.05, length( vec2( nu * 0.3, nv * 1.4 ) ) ) ) * mNail;

	// ---- colour
	vec3 col = mix( wood * ( stain * - 0.4 + 1.0 ), paintCol, painted );
	col = mix( col, vec3( 0.04, 0.032, 0.028 ), nail );
	float dirt = mix( 0.22, 0.5, wW );
	vec4 Gd = mix( Gm, Gs, rawK );
	col = col * ( 1.0 - Gd.r * dirt * mix( 0.75, 0.35, rawK ) );
	col = mix( col, vec3( 0.62, 0.61, 0.57 ), Gd.g * mix( 0.28, 0.16, rawK ) * ( painted * 0.5 + 0.5 ) );
	col = col * ( 1.0 - Gm.b * 0.3 * hasPaint );
	float isWall = mLap + mBB + mTG;
	// splash-back along the bottom of walls: rain throws sand and soil up the boards, and green
	// mildew grows where they stay damp; a ragged upper edge
	float splashH = 0.55 + ( Gm.a - 0.5 ) * 0.5 + ( macroV - 0.5 ) * 0.3;
	float splash = ( 1.0 - smoothstep( 0.0, splashH, uvS.y ) ) * isWall;
	col = col * ( 1.0 - splash * 0.5 );
	col = mix( col, col * vec3( 0.78, 0.9, 0.62 ), splash * smoothstep( 0.4, 0.7, Gm.a + Gm.b * 0.5 ) * 0.7 );
	float ao = mix( Nt.a, mix( 1.0, Nt.a, 0.35 ) * Pn.a, painted );
	col = col * shade * mix( 1.0, ao, 0.5 );

	// ---- world-space weathering
	float upF = vlmSat( Ng.y );
	float sideF = 1.0 - abs( Ng.y );
	// worn walking path down the middle of deck boards: fibres worn off (paler, warmer, smoother),
	// grey dirt ground into the grain and dark scuffs
	float walkC = - paint - 1.0;
	float wd = ( uvS.x - walkC + ( macroV - 0.5 ) * 0.5 ) / 0.6;
	float walkK = step( paint, - 0.5 ) * smoothstep( 0.6, 0.9, upF ) * exp( - wd * wd ) * ( 1.0 - endAny );
	// the path is worn brown-grey: the silver skin scuffed off, grime trodden into the grain
	vec3 trodden = col * vec3( 0.8, 0.76, 0.72 );
	col = mix( col, trodden, walkK * 0.55 );
	// grit and dirt packed along the edges of deck boards (the gaps collect it)
	float bev = min( uvS.y, 0.18 - uvS.y );
	float edgeDirt = mNail * smoothstep( 0.6, 0.9, upF ) * ( 1.0 - smoothstep( 0.004, 0.03, bev ) ) * ( 1.0 - endAny );
	col = col * ( 1.0 - edgeDirt * ( 0.18 + Gs.r * 0.15 ) );
	// water that pools along the board edges keeps them damp and darker in broad, gradual bands
	// (no blotches: it follows the boards); sun and salt bleach the open middle of the deck
	float damp = smoothstep( 0.6, 0.9, upF ) * rawK * ( 1.0 - endAny ) * smoothstep( 0.45, 0.75, macroV );
	col = col * ( 1.0 - damp * ( 1.0 - smoothstep( 0.0, 0.06, bev ) ) * 0.18 );
	// rain and rust streaks running down vertical faces (from nails, bolts, sills and roof edges)
	vec4 sqA = texture( vlgGrime, vec2( ( P.x + P.z ) * 2.3 + seed * 5.0, P.y * 0.12 ) );
	vec4 sqB = texture( vlgGrime, vec2( ( P.x - P.z ) * 5.1, P.y * 0.3 + 0.37 ) );
	float streak = sideF * sideF * clamp( smoothstep( 0.45, 0.85, sqB.r ) + smoothstep( 0.6, 0.7, sqA.a ) * 0.35, 0.0, 1.0 ) * ( 0.45 + wW * 0.55 ) * ( 1.0 - endAny );
	float rustS = streak * smoothstep( 0.5, 0.6, sqA.a );
	col = col * ( 1.0 - streak * 0.24 );
	col = mix( col, col * vec3( 1.04, 0.78, 0.6 ), rustS * 0.6 );
	// bird droppings: sparse splats on upward faces above head height (rails, posts, cap beams, sills)
	vec2 bq = P.xz / 0.3;
	vec2 bc = floor( bq );
	float bh = vlmHash21( bc.x + seed, bc.y );
	vec2 bo = fract( bq ) - 0.5 - ( vec2( vlmHash21( bc.x + 3.1, bc.y ), vlmHash21( bc.x, bc.y + 7.7 ) ) - 0.5 ) * 0.45;
	float bd = length( bo * vec2( 1.0, 1.35 ) ) + ( Gm.a - 0.5 ) * 0.08;
	float dropK = step( 0.93, bh ) * smoothstep( 0.75, 0.95, upF ) * step( 2.6, P.y ) * ( 1.0 - smoothstep( 0.1, 0.15, bd ) );
	float dropCore = dropK * ( 1.0 - smoothstep( 0.02, 0.07, bd ) );
	col = mix( col, mix( vec3( 0.62, 0.61, 0.56 ), vec3( 0.8, 0.79, 0.74 ), dropCore ), dropK * 0.6 );

	// ---- normal (grain space -> mesh space) + analytic pattern relief
	vec2 sWood = vlmSlopeOf( Nt ) + vlmSlopeOf( D ) * near * 0.5;
	vec2 sPaint = vlmSlopeOf( Nt ) * 0.3 + vlmSlopeOf( Pn );
	vec2 sG = ( mix( sWood, sPaint, painted ) + edgeSlope ) * ( 1.0 - endAny * 0.6 ) * ( 1.0 - walkK * 0.45 ) * ( 1.0 - dropK * 0.7 );
	vec2 sM = mix( sG, sG.yx, isVert );
	vec2 sPat = vec2(
		mBB * bbSx + mTG * tgSx,
		mLap * lapSy + mLv * lvSy + mPk * pkSy
	);
	// ---- roughness: satin-ish paint vs dry raw timber; grime and salt dull it
	float roughRaw = Nt.b + wW * 0.03;
	float roughPaint = mix( 0.4, 0.7, Pn.b ) + fade * 0.12;
	float rough = mix( roughRaw, roughPaint, painted ) + Gm.r * 0.06 + Gm.g * 0.08 - nail * 0.3 - walkK * 0.1 + streak * 0.05 - dropCore * 0.2;
	VlmTidal res = vlmTidal( P, col, rough );

	// ---- glass mode (windows and lanterns share this material to save a draw call)
	float isGlass = step( 8.5, pattern );
	VlmGlass glass = vlmGlass( uv0, aTint, seed, paint, weather );
	s.albedo = mix( res.col, glass.color, isGlass );
	s.roughness = clamp( mix( res.rough, glass.rough, isGlass ), 0.03, 1.0 );
	s.ao = mix( ao, 1.0, isGlass );
	s.emissive = glass.emissive * isGlass;
	s.normal = vlmNormalFromSlope( P, Ng, uv0, ( sM + sPat ) * ( 1.0 - isGlass ) );
	// ((M13) the sand it drifted over the boardwalk behind the beach, and the strands of sargassum it
	// left on the boards and on the pier's deck where its crests came over)
	if ( vlmStorm.x + vlmStorm.y > 0.0 && Ng.y > 0.6 && P.y < vlmStorm.z + 0.5 && P.y > 0.5 && isGlass < 0.5 ) {
		float drift = vlmVN( P.xz * 1.3 ) * 0.6 + vlmVN( P.xz * 5.1 + 3.7 ) * 0.4;
		float sandK = vlmStorm.x * step( P.z, - 46.0 ) * smoothstep( 0.42, 0.62, drift + ( vlmStorm.z - P.y ) * 0.12 );
		s.albedo = mix( s.albedo, vec3( 0.6, 0.5, 0.33 ) * ( 0.85 + vlmVN( P.xz * 23.0 ) * 0.3 ), sandK );
		s.roughness = mix( s.roughness, 0.95, sandK );
		s.normal = normalize( mix( s.normal, Ng, sandK ) );
		float strand = smoothstep( 0.7, 0.8, vlmVN( vec2( P.x * 9.0 + P.z * 2.0, P.z * 3.0 - P.x * 1.5 ) ) ) * smoothstep( 0.45, 0.6, vlmVN( P.xz * 0.9 + 1.3 ) );
		float weedK = vlmStorm.y * strand;
		s.albedo = mix( s.albedo, mix( vec3( 0.15, 0.09, 0.02 ), vec3( 0.025, 0.02, 0.012 ), vlmStorm.w ), weedK );
		s.roughness = mix( s.roughness, mix( 0.45, 0.8, vlmStorm.w ), weedK );
	}
}
` } );
	m.name = 'VillageWood';
	m.userData.vlm.uniforms.vlmStorm = { value: new THREE.Vector4( 0, 0, 0, 1 ) };
	return m;

}

// ---------------------------------------------------------------------------
// CORRUGATED METAL ROOFING
// uv: u = distance up-slope from the eave (m), v = along the eave (m)
// vdata: x seed, y rust amount, z galvanized (1) / painted (0)

// (M13) sheets a hurricane can tear off (Village.roofHoles): each on one roof slab (its vdata seed), a run
// of whole sheets along its eave (v, m) from the eave up (u < uTop, m), and its state: 0 whole, 1 gone (cut
// out: the purlins and the dark of the roof space show through), 2 under a blue tarp (nailed over it and a
// little past, battens along its edges), 3 a new sheet (+ how new: 0 just on .. 1 weathered in)
export const ROOF_HOLES = 16;

export function createRoofMetalMaterial( T ) {

	const m = villageMaterial( { roughness: 0.5, metalness: 0.2, name: 'VillageRoofMetal' }, T, [ 'roofA', 'roofN', 'hardN' ], { surface: /* glsl */`
uniform vec4 vlmHoles[ ${ ROOF_HOLES } ];
uniform float vlmHoleS[ ${ ROOF_HOLES } ];
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec3 aTint = vTint;
	vec4 aData = vData;
	float seed = aData.x;
	float rustAmt = aData.y;
	float galv = aData.z;
	vec2 uvm = vUv0;
	vec2 fw = fwidth( uvm );
	float near = 1.0 - smoothstep( 0.0015, 0.006, max( fw.x, fw.y ) );
	float sheetF = uvm.y / 0.84 + floor( seed * 13.0 );
	float sheetId = floor( sheetF );
	float sheetR = vlmHash21( sheetId, seed * 91.0 );
	vec2 tuv = vec2( sheetF, uvm.x / 1.68 + sheetR * 5.37 );
	vec4 M = texture( vlgRoofA, tuv );
	vec4 Nt = texture( vlgRoofN, tuv );
	vec4 macroV = texture( vlgRoofA, tuv * vec2( 0.13, 0.09 ) + vec2( seed, seed * 1.7 ) );

	// ((M13) a sheet the storm took, a tarp over it, a new one)
	float tarp = 0.0, fresh = 0.0;
	vec4 tq = vec4( 0.0 ); // the tarp: up from the eave, along it (m), its length and width
	for ( int k = 0; k < ${ ROOF_HOLES }; k ++ ) {
		vec4 H = vlmHoles[ k ];
		float st = vlmHoleS[ k ];
		if ( st < 0.5 || abs( H.x - seed ) > 2e-5 ) continue;
		bool inSheet = uvm.y > H.y && uvm.y < H.z && uvm.x < H.w;
		if ( st < 1.5 ) { if ( inSheet ) discard; }
		else if ( st < 2.5 ) {
			// (the tarp: a little past the hole up the slope and either side)
			vec4 q = vec4( uvm.x, uvm.y - H.y + 0.25, H.w + 0.3, H.z - H.y + 0.5 );
			if ( q.x < q.z && q.y > 0.0 && q.y < q.w ) { tarp = 1.0; tq = q; }
		} else if ( inSheet ) fresh = 1.0 - fract( st );
	}

	float eave = 1.0 - smoothstep( 0.0, 0.9, uvm.x );
	float replaced = step( 0.86, sheetR );
	float rustIn = clamp( rustAmt + 0.15 + replaced * 0.2 + ( macroV.r - 0.4 ) * 0.5 - fresh, 0.0, 1.0 );
	// rust channel quantiles: 50% 0.25, 70% 0.31, 90% 0.42 -> rust 0.4 ~10%, 0.6 ~25%, 0.8 ~45%
	float thr = mix( 0.62, 0.23, rustIn ) - eave * 0.2;
	float rust = smoothstep( thr - 0.04, thr + 0.04, M.r );
	float fade = clamp( M.b * 0.7 + macroV.b * 0.3, 0.0, 1.0 );

	vec3 paintCol = mix( aTint, aTint * 0.7 + vec3( 0.12, 0.1, 0.085 ), fade * 0.55 ) * ( sheetR * 0.16 + 0.9 );
	vec3 patchCol = paintCol * vec3( 0.72, 0.68, 0.66 ) + vec3( 0.03, 0.025, 0.02 );
	vec3 galvCol = vec3( 0.34, 0.35, 0.35 ) * ( fade * 0.35 + 0.78 );
	vec3 base = mix( mix( paintCol, patchCol, replaced ), galvCol, galv );
	vec3 rustCol = mix( vec3( 0.12, 0.045, 0.02 ), vec3( 0.4, 0.17, 0.065 ), M.g );
	vec3 col = mix( base, rustCol, rust );
	col = col * ( 1.0 - M.a * 0.45 );
	col = col * mix( 1.0, Nt.a, 0.55 );

	// texture X runs along the eave (mesh v), texture Y up the slope (mesh u)
	vec2 sT = vlmSlopeOf( Nt );
	vec4 Hd = texture( vlgHardN, uvm * 1.7 );
	vec2 sl = vec2( sT.y, sT.x ) + vlmSlopeOf( Hd ) * ( rust * 0.8 + 0.2 ) * near;
	s.normal = vlmNormalFromSlope( vWP, Ng, uvm, sl );

	s.albedo = col;
	s.metalness = mix( mix( 0.04, 0.5, galv ), 0.0, rust );
	s.roughness = clamp( mix( mix( 0.55, 0.42, galv ) + ( Nt.b - 0.5 ) * 0.4 + fade * 0.15, 0.9, rust ) + M.a * 0.08, 0.05, 1.0 );
	s.ao = Nt.a;
	// ((M13) a new sheet: fresh paint, or bright new zinc, dulling over its first month)
	if ( fresh > 0.0 ) {
		vec3 newCol = mix( aTint * 1.04, vec3( 0.55, 0.56, 0.56 ), galv );
		s.albedo = mix( s.albedo, newCol * mix( 1.0, Nt.a, 0.55 ), fresh * 0.85 );
		s.metalness = mix( s.metalness, mix( 0.05, 0.75, galv ), fresh );
		s.roughness = mix( s.roughness, mix( 0.4, 0.26, galv ), fresh );
	}
	// ((M13) a blue polyethylene tarp, wrinkled, pulled down over the corrugations, battens nailed along
	// its top and sides)
	if ( tarp > 0.0 ) {
		vec4 Wr = texture( vlgHardN, tq.xy * vec2( 0.45, 0.3 ) + seed * 3.1 );
		vec2 wsl = vlmSlopeOf( Wr ) * 0.5 + vec2( sT.y, sT.x ) * 0.35;
		s.normal = vlmNormalFromSlope( vWP, Ng, uvm, wsl );
		s.albedo = vec3( 0.012, 0.09, 0.42 ) * ( 0.85 + Wr.b * 0.3 );
		s.metalness = 0.0;
		s.roughness = 0.5 + Wr.b * 0.15;
		s.ao = mix( 1.0, Nt.a, 0.4 );
		// battens nailed along its top edge and down both sides, holding it down in the wind
		float bat = max( 1.0 - step( 0.03, abs( tq.x - ( tq.z - 0.08 ) ) ), max( 1.0 - step( 0.03, abs( tq.y - 0.08 ) ), 1.0 - step( 0.03, abs( tq.y - ( tq.w - 0.08 ) ) ) ) );
		if ( bat > 0.0 ) {
			s.albedo = vec3( 0.2, 0.16, 0.11 ) * ( 0.8 + Wr.b * 0.4 );
			s.roughness = 0.85;
			s.normal = Ng;
		}
	}
}
` } );
	m.name = 'VillageRoofMetal';
	m.userData.vlm.uniforms.vlmHoles = { value: Array.from( { length: ROOF_HOLES }, () => new THREE.Vector4( - 1, 0, 0, 0 ) ) };
	m.userData.vlm.uniforms.vlmHoleS = { value: new Array( ROOF_HOLES ).fill( 0 ) };
	return m;

}

// ---------------------------------------------------------------------------
// PALM THATCH
// uv: u = distance up-slope from the eave (m), v = along the eave (m)
// vdata: x seed, y age (0 golden .. 1 grey)

export function createThatchMaterial( T ) {

	const m = villageMaterial( { roughness: 0.95, metalness: 0, name: 'VillageThatch' }, T, [ 'thatchA', 'thatchN', 'grime' ], { surface: /* glsl */`
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec4 aData = vData;
	float seed = aData.x;
	float age = aData.y;
	vec2 uvm = vUv0;
	vec2 tuv = vec2( uvm.y + vlmHash21( seed, 1.3 ) * 7.0, uvm.x );
	vec4 A = texture( vlgThatchA, tuv );
	vec4 Nt = texture( vlgThatchN, tuv );
	// macro variation: patches of newer / older thatch and rain streaks down the slope
	vec4 Gm = texture( vlgGrime, vec2( tuv.x * 0.23, tuv.y * 0.19 ) + seed );
	vec4 Gs = texture( vlgGrime, vec2( tuv.x * 0.5, tuv.y * 0.25 ) + seed * 1.7 );

	float lum = dot( A.rgb, vec3( 0.3, 0.59, 0.11 ) );
	vec3 greyed = vec3( lum ) * vec3( 0.95, 0.9, 0.8 );
	float ageL = clamp( age + ( Gm.a - 0.5 ) * 0.9, 0.0, 1.0 );
	vec3 col = mix( A.rgb, greyed, ageL * 0.8 ) * ( Gm.a * 0.35 + 0.82 ) * ( 1.0 - ageL * 0.2 );
	col = col * ( 1.0 - Gs.r * 0.25 ) * ( 1.0 - Gs.b * 0.35 );
	col = col * mix( 1.0, Nt.a, 0.55 );
	vec2 sT = vlmSlopeOf( Nt );
	s.normal = vlmNormalFromSlope( vWP, Ng, uvm, vec2( sT.y, sT.x ) );
	s.albedo = col;
	s.roughness = Nt.b;
	s.ao = Nt.a;
}
` } );
	m.name = 'VillageThatch';
	return m;

}

// ---------------------------------------------------------------------------
// HARD SURFACES: iron, steel, galvanized, rubber, plastic, painted metal - and rope.
// vdata: x seed, y rust (0..1), z metalness, w roughness
// rope: vdata.w = 2 + rope radius (uv: u along the rope, v around, metres)

export function createHardMaterial( T ) {

	const m = villageMaterial( { roughness: 0.5, metalness: 0.5, name: 'VillageHard' }, T, [ 'hardA', 'hardN', 'rope', 'grime' ], { extra: [ TIDAL ], surface: /* glsl */`
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec3 aTint = vTint;
	vec4 aData = vData;
	float seed = aData.x;
	float rustAmt = aData.y;
	float isRope = step( 1.5, aData.w );
	vec2 uv0 = vUv0;
	vec2 off = vec2( vlmHash21( seed, 2.3 ), vlmHash21( seed, 8.9 ) );
	vec2 tuv = uv0 + off;
	vec4 HA = texture( vlgHardA, tuv );
	vec4 HN = texture( vlgHardN, tuv );
	float hasRust = step( 0.001, rustAmt );
	float thr = mix( 0.95, 0.3, rustAmt );
	float rust = smoothstep( thr - 0.06, thr + 0.06, HA.r ) * hasRust;
	vec3 base = aTint * ( 1.0 - HA.b * 0.2 ) * ( ( HA.r - 0.5 ) * 0.1 + 1.0 );
	base = mix( base, vec3( 0.3, 0.3, 0.29 ), HA.g * 0.55 * hasRust * ( 1.0 - rust ) );
	vec3 rustCol = mix( vec3( 0.12, 0.045, 0.02 ), vec3( 0.4, 0.17, 0.06 ), smoothstep( 0.3, 0.9, HA.r ) );
	vec3 hardCol = mix( base, rustCol, rust ) * mix( 1.0, HN.a, 0.5 );
	float hardRough = mix( clamp( aData.w + ( HN.b - 0.5 ) * 0.35 - HA.g * 0.15 * hasRust, 0.04, 1.0 ), 0.88, rust );
	vec2 hardS = vlmSlopeOf( HN ) * ( rust * 0.8 + 0.25 );

	// rope: uvs normalised by the circumference so the three strands wrap seamlessly
	float ropeR = max( aData.w - 2.0, 0.004 );
	vec4 R = texture( vlgRope, uv0 / ( ropeR * VLM_TAU ) + vec2( aData.x * 3.1, 0.0 ) );
	vec3 ropeCol = aTint * mix( 0.45, 1.25, R.r ) * mix( 1.0, R.g, 0.6 );
	vec2 rn = R.ba * 2.0 - 1.0;
	vec2 ropeS = rn / sqrt( max( 1.0 - dot( rn, rn ), 0.04 ) );

	VlmTidal res = vlmTidal( vWP, mix( hardCol, ropeCol, isRope ), mix( hardRough, 0.93, isRope ) );
	s.normal = vlmNormalFromSlope( vWP, Ng, uv0, mix( hardS, ropeS, isRope ) );
	s.albedo = res.col;
	s.roughness = res.rough;
	s.metalness = aData.z * ( 1.0 - max( rust, res.wet ) ) * ( 1.0 - isRope );
	s.ao = mix( HN.a, R.g, isRope );
}
` } );
	m.name = 'VillageHard';
	return m;

}

// ---------------------------------------------------------------------------
// STONE: rubble masonry, lime plaster over stone, sand dusted near the ground
// uv in metres (u horizontal, v vertical from the bottom of the piece).
// vdata: x seed, y style (0 coursed rubble, 1 plaster over stone, 2 small rubble)
// tint: plaster colour

export function createStoneMaterial( T ) {

	const m = villageMaterial( { roughness: 0.92, metalness: 0, name: 'VillageStone' }, T, [ 'stoneA', 'stoneN', 'paintN', 'grime' ], { surface: /* glsl */`
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec3 aTint = vTint;
	vec4 aData = vData;
	float seed = aData.x;
	float style = aData.y;
	vec2 uv0 = vUv0;
	float isCap = step( 1500.0, uv0.x );
	float isEnd = step( 500.0, uv0.x ) * ( 1.0 - isCap );
	vec2 uvS = uv0 - vec2( isCap * 2000.0 + isEnd * 1000.0, 0.0 );
	float isRubble = step( 1.5, style );
	float isPlaster = vlmBand01( style, 1.0 );
	vec2 off = vec2( vlmHash21( seed, 4.1 ), vlmHash21( seed, 7.7 ) );
	vec2 tuv = uvS * mix( 0.5, 0.8, isRubble ) + off;
	vec4 A = texture( vlgStoneA, tuv );
	vec4 Nt = texture( vlgStoneN, tuv );
	// lime plaster: trowel marks from the paint film set, stains / dust from the grime map
	vec2 puv = uvS + off * 3.0;
	vec4 PN = texture( vlgPaintN, puv * vec2( 0.7, 1.4 ) );
	vec4 PA = texture( vlgGrime, puv * 0.5 );

	// plaster survives where the baked plaster field is high; the plaster edge has thickness
	float pf = A.a + ( PA.a - 0.5 ) * 0.12;
	float pm = smoothstep( 0.3, 0.33, pf ) * isPlaster;
	float e = 1.0 / 1024.0;
	float gX = texture( vlgStoneA, tuv + vec2( e, 0.0 ) ).a - texture( vlgStoneA, tuv - vec2( e, 0.0 ) ).a;
	float gY = texture( vlgStoneA, tuv + vec2( 0.0, e ) ).a - texture( vlgStoneA, tuv - vec2( 0.0, e ) ).a;
	float pEdge = ( 1.0 - smoothstep( 0.0, 0.03, abs( pf - 0.315 ) ) ) * isPlaster;

	vec3 stoneCol = A.rgb * mix( vec3( 1.0 ), aTint * 1.1, 0.15 );
	vec3 plasterCol = aTint * ( 1.0 - PA.r * 0.3 ) * ( 1.0 - PA.b * 0.25 ) * ( ( PA.a - 0.5 ) * 0.16 + 1.0 );
	plasterCol = plasterCol * mix( 1.0, PN.a, 0.6 ) * ( ( PN.b - 0.5 ) * 0.12 + 1.0 );
	vec3 col = mix( stoneCol * mix( 1.0, Nt.a, 0.5 ), plasterCol, pm );
	// sand dust and splash dirt near the ground
	float low = 1.0 - smoothstep( 0.05, 0.75, uvS.y );
	float dust = low * smoothstep( 0.25, 0.7, PA.a ) * 0.8;
	col = mix( col, vec3( 0.46, 0.4, 0.3 ), dust );
	col = col * ( 1.0 - low * 0.18 );

	vec2 sl = mix( vlmSlopeOf( Nt ), vlmSlopeOf( PN ) * 2.5, pm ) + vec2( gX, gY ) * pEdge * - 6.0;
	s.normal = vlmNormalFromSlope( vWP, Ng, uv0, sl );
	s.albedo = col;
	s.roughness = clamp( mix( Nt.b, PN.b * 0.3 + 0.66, pm ) + dust * 0.05, 0.05, 1.0 );
	s.ao = mix( Nt.a, PN.a, pm );
}
` } );
	m.name = 'VillageStone';
	return m;

}

// ---------------------------------------------------------------------------
// FABRIC: laundry / tarps, knotted fishing nets and pennant flags in one double sided,
// alpha tested material (one draw call).
// vdata: x seed, y sway weight (flag: distance from the pole), z mode:
//   z = 0          cloth
//   0 < z < 5000   net, z = mesh size (m)
//   z > 5000       flag, z = pole x + 10000, w = pole z (the cloth swings downwind on the GPU)

export function createFabricMaterial( T ) {

	const m = villageMaterial( { roughness: 0.88, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, name: 'VillageFabric' }, T, [ 'net', 'grime' ], {
		vertex: SWAY + /* glsl */`
	float isFlag = step( 5000.0, vdata.z );
	// flag: oriented downwind around its pole
	float fa = vdata.y;
	vec3 fdir = normalize( vec3( vlmWindDir.x, 0.0, vlmWindDir.y ) );
	vec3 fperp = vec3( - fdir.z, 0.0, fdir.x );
	float fstrength = smoothstep( 0.5, 9.0, vlmWindSpeed );
	float fphase = vlmTime * 7.5 - fa * 5.0 + vdata.x * 30.0;
	float fwave = sin( fphase ) * ( fa * 0.09 ) * ( fstrength * 0.7 + 0.3 );
	float fdroop = ( 1.0 - fstrength ) * fa * 0.55;
	vec3 flagPos = vec3( vdata.z - 10000.0, transformed.y - fdroop, vdata.w ) + fdir * ( fa * ( 1.0 - fdroop * 0.4 ) ) + fperp * fwave;
	transformed = mix( swayPos, flagPos, isFlag );
`,
		surface: /* glsl */`
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec3 aTint = vTint;
	vec4 aData = vData;
	float isFlag = step( 5000.0, aData.z );
	float isNet = step( 0.001, aData.z ) * ( 1.0 - isFlag );
	vec2 uvm = vUv0;

	// net
	float tile = max( aData.z, 0.02 ) * 4.0;
	vec2 nuv = uvm / tile;
	vec4 Nt = texture( vlgNet, nuv );
	vec2 fwn = fwidth( nuv );
	float far = smoothstep( 0.05, 0.1, max( fwn.x, fwn.y ) );
	vec2 sc = gl_FragCoord.xy;
	float ign = fract( fract( sc.x * 0.06711056 + sc.y * 0.00583715 ) * 52.9829189 );
	float netAlpha = mix( Nt.r, step( ign, 0.55 ), far );
	vec3 netCol = aTint * mix( 0.5, 1.05, Nt.g ) * mix( 1.0, 0.8, far );
	vec2 nn = Nt.ba * 2.0 - 1.0;
	vec2 netS = nn / sqrt( max( 1.0 - dot( nn, nn ), 0.04 ) ) * ( 1.0 - far );

	// cloth: woven canvas, sun faded
	float weave = vlmN01( sin( uvm.x * 900.0 ) ) * vlmN01( sin( uvm.y * 900.0 ) );
	float wf = 1.0 - smoothstep( 0.0005, 0.002, fwidth( uvm.x ) );
	float fadeN = texture( vlgGrime, uvm * 0.8 + aData.x ).a;
	vec3 clothCol = mix( aTint, aTint * 0.6 + vec3( 0.3 ), fadeN * 0.5 ) * ( weave * 0.12 * wf + 0.94 );

	// flag normal (the cloth swings downwind around its pole, see the vertex code)
	float a = aData.y;
	vec3 dir = normalize( vec3( vlmWindDir.x, 0.0, vlmWindDir.y ) );
	vec3 perp = vec3( - dir.z, 0.0, dir.x );
	float strength = smoothstep( 0.5, 9.0, vlmWindSpeed );
	float phase = vlmTime * 7.5 - a * 5.0 + aData.x * 30.0;
	float slopeW = cos( phase ) * 0.45 * ( a + 0.2 ) * ( strength * 0.7 + 0.3 );
	vec3 flagN = normalize( perp - dir * slopeW ) * ( gl_FrontFacing ? 1.0 : - 1.0 );

	s.normal = normalize( mix( vlmNormalFromSlope( vWP, Ng, uvm, netS * isNet ), flagN, isFlag ) );
	s.alpha = mix( 1.0, netAlpha, isNet );
	s.albedo = mix( mix( clothCol, netCol, isNet ), aTint * ( fadeN * 0.15 + 0.88 ), isFlag );
}
`,
	} );
	m.name = 'VillageFabric';
	return m;

}

// ---------------------------------------------------------------------------
// NETS: blended, no depth write. Knotted mesh up close (soft-edged strands from the net texture);
// further away the strands average into a see-through veil of the right coverage. Alpha testing
// (or dithering) the sub-pixel strands wrote a noisy foreground depth over whatever is behind the net.
// vdata as for FABRIC nets: x seed, y sway weight, z mesh size (m).

export function createNetMaterial( T ) {

	const m = villageMaterial( { roughness: 0.9, metalness: 0, side: THREE.DoubleSide, transparent: true, depthWrite: false, name: 'VillageNet' }, T, [ 'net' ], {
		// sway (as the fabric)
		vertex: SWAY + '\ttransformed = swayPos;\n',
		surface: /* glsl */`
void vlmSurface( inout VlmSurf s, vec3 Ng ) {
	vec3 aTint = vTint;
	vec4 aData = vData;
	vec2 uvm = vUv0;
	float tile = max( aData.z, 0.02 ) * 4.0;
	vec2 nuv = uvm / tile;
	vec4 Nt = texture( vlgNet, nuv );
	vec2 fwn = fwidth( nuv );
	float far = smoothstep( 0.05, 0.1, max( fwn.x, fwn.y ) );
	vec2 nn = Nt.ba * 2.0 - 1.0;
	vec2 netS = nn / sqrt( max( 1.0 - dot( nn, nn ), 0.04 ) ) * ( 1.0 - far );

	s.normal = normalize( vlmNormalFromSlope( vWP, Ng, uvm, netS ) );
	// strands up close; average coverage of the knotted mesh (~0.4) once they are sub-pixel
	s.alpha = mix( Nt.r, 0.4, far ) * 0.95;
	s.albedo = aTint * mix( 0.5, 1.05, Nt.g ) * mix( 1.0, 0.85, far );
}
`,
	} );
	m.name = 'VillageNet';
	m.forceSinglePass = true; // (thin mesh: no back-then-front passes, one program)
	return m;

}

// shared: the opaque materials in one program (shareProgram: low-powered devices)
export function createVillageMaterials( textures = new VillageTextures(), { shared = false } = {} ) {

	const T = textures.textures;
	const M = {
		wood: createWoodMaterial( T ),
		roofMetal: createRoofMetalMaterial( T ),
		thatch: createThatchMaterial( T ),
		hard: createHardMaterial( T ),
		stone: createStoneMaterial( T ),
		fabric: createFabricMaterial( T ),
		net: createNetMaterial( T ),
	};
	if ( shared ) shareProgram( [ M.wood, M.roofMetal, M.thatch, M.hard, M.stone ], T );
	return M;

}
