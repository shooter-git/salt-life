import * as THREE from '../engine/index.js';

// Materials for the game's props (rod, bobber, vendors' stand-ins), for WebGL 2. Geometry is built
// with the boat's GeoKit layout: color = linear albedo, aux = ( roughness, metalness, pattern, part ).
//   pattern 0 plain, 1 weathered wood (grain along local y... planks: see woodAxis), 2 canvas /
//   cloth, 3 skin, 4 cork, 5 painted metal with rust; fishing tackle (local +Y = the rod or reel
//   axis): 8 carbon blank under clear coat, 9 epoxy-coated thread wraps, 10 EVA foam grip,
//   11 braided line on the spool, 12 machined / anodised metal, 13 knurled metal, 14 rubber
// (Tidewater's were WGSL materials on its WebGPU engine: the same patterns, in GLSL, on three's
// MeshPhysicalMaterial.)
export const PAT = {
	plain: 0, wood: 1, cloth: 2, skin: 3, cork: 4, rusty: 5, woodX: 6, woodZ: 7,
	carbon: 8, thread: 9, eva: 10, braid: 11, machined: 12, knurl: 13, rubber: 14,
};

const GP_GLSL = /* glsl */`
float gpHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float gpNoise( vec3 p ) {
	vec3 i = floor( p ); vec3 f = fract( p ); vec3 u = f * f * ( 3.0 - 2.0 * f );
	float a = mix( mix( gpHash( i ), gpHash( i + vec3( 1, 0, 0 ) ), u.x ), mix( gpHash( i + vec3( 0, 1, 0 ) ), gpHash( i + vec3( 1, 1, 0 ) ), u.x ), u.y );
	float b = mix( mix( gpHash( i + vec3( 0, 0, 1 ) ), gpHash( i + vec3( 1, 0, 1 ) ), u.x ), mix( gpHash( i + vec3( 0, 1, 1 ) ), gpHash( i + vec3( 1, 1, 1 ) ), u.x ), u.y );
	return mix( a, b, u.z );
}
float gpFbm( vec3 p ) { return gpNoise( p ) * 0.55 + gpNoise( p * 2.13 + 7.1 ) * 0.3 + gpNoise( p * 4.7 + 3.3 ) * 0.15; }
// a height field on the surface as a normal (screen-space derivatives; any consistent space)
vec3 gpBump( vec3 P, vec3 N, float height ) {
	vec3 dPdx = dFdx( P ); vec3 dPdy = dFdy( P );
	vec3 r1 = cross( dPdy, N ); vec3 r2 = cross( N, dPdx );
	float det = dot( dPdx, r1 );
	vec3 grad = sign( det ) * ( dFdx( height ) * r1 + dFdy( height ) * r2 );
	return normalize( abs( det ) * N - grad + N * 1e-12 );
}
`;

// the patterns: base -> col, and gpRough, gpH (bump height, m), gpCoat / gpCoatRough (clear coat)
const PATTERNS = /* glsl */`
	vec3 base = diffuseColor.rgb;
	float pat = vAux.z;
	vec3 P = vGpWorld;
	vec3 lp = vLocal;
	vec3 col = base;
	if ( ( pat > 0.5 && pat < 1.5 ) || ( pat > 5.5 && pat < 7.5 ) ) {
		// weathered, sun-bleached timber: grain along the board (local y, x or z), silvery on top,
		// dark in the cracks, grime low down
		vec3 q = lp.xzy;
		if ( pat > 6.5 ) q = lp.xyz; else if ( pat > 5.5 ) q = lp.yzx;
		float grain = gpFbm( vec3( q.x * 40.0, q.y * 40.0, q.z * 1.6 ) );
		float rings = sin( ( q.x * 23.0 + q.y * 17.0 + grain * 6.0 ) * 3.0 ) * 0.5 + 0.5;
		float blotch = gpFbm( P * 1.3 );
		col = base * mix( 0.72, 1.12, grain ) * mix( 0.9, 1.05, rings );
		col = mix( col, vec3( dot( col, vec3( 0.33 ) ) * 1.05 ), 0.35 * smoothstep( 0.2, 0.9, vGpNormal.y ) );
		col *= mix( 1.0, 0.72, smoothstep( 0.55, 0.8, blotch ) );
		col *= mix( 0.75, 1.0, smoothstep( 0.0, 0.6, P.y ) );
		float crack = smoothstep( 0.62, 0.7, gpNoise( vec3( q.x * 90.0, q.y * 90.0, q.z * 3.0 ) ) );
		col *= 1.0 - crack * 0.5;
		gpH = grain * 0.0015 - crack * 0.0012;
		gpRough = clamp( gpRough + ( grain - 0.5 ) * 0.1, 0.6, 1.0 );
	} else if ( pat > 1.5 && pat < 2.5 ) {
		// canvas / cotton: weave, fading and grime
		float weave = sin( lp.x * 900.0 ) * sin( lp.y * 900.0 + lp.z * 900.0 ) * ( 1.0 - smoothstep( 0.002, 0.006, fwidth( lp.x + lp.y ) ) );
		float fade = gpFbm( P * 2.5 );
		col = base * mix( 0.8, 1.08, fade ) * ( 1.0 + weave * 0.04 );
		gpH = weave * 0.0003 + fade * 0.002;
	} else if ( pat > 2.5 && pat < 3.5 ) {
		// weathered skin: blotchy, a little ruddy
		float b = gpFbm( lp * 22.0 );
		col = base * mix( 0.85, 1.1, b ) * vec3( 1.0, mix( 0.94, 1.0, b ), mix( 0.92, 1.0, b ) );
		gpRough = 0.55;
		gpH = b * 0.0008;
	} else if ( pat > 3.5 && pat < 4.5 ) {
		// cork grip: speckled
		float sp = gpNoise( lp * 700.0 );
		col = base * mix( 0.7, 1.1, sp );
		gpH = sp * 0.0004;
	} else if ( pat > 4.5 && pat < 5.5 ) {
		// painted metal, rust at the edges and streaking down
		float r = smoothstep( 0.55, 0.75, gpFbm( P * vec3( 3.0, 0.8, 3.0 ) ) );
		col = mix( base, vec3( 0.23, 0.1, 0.04 ), r * 0.8 );
		gpRough = mix( gpRough, 0.85, r );
	} else if ( pat > 7.5 ) {
		// fishing tackle, in the part's local frame (+Y along the rod / reel axis)
		float ang = atan( lp.x, lp.z );
		if ( pat < 8.5 ) {
			// carbon blank: fine woven / wrapped scrim under a glossy clear coat, faded out where the
			// weave is below a pixel
			float u = ang * 18.0; float w = lp.y * 700.0;
			float aa = 1.0 - smoothstep( 0.3, 1.2, fwidth( w ) );
			float weave = sin( u + w ) * sin( u - w );
			col = base * ( 1.0 + weave * 0.09 * aa ) * mix( 0.94, 1.04, gpNoise( vec3( 0.0, lp.y * 3.0, 0.0 ) ) );
			gpH = weave * 0.00004 * aa;
			gpCoat = 1.0; gpCoatRough = 0.05;
		} else if ( pat < 9.5 ) {
			// nylon thread wraps sealed in epoxy: tight turns around the blank, a little uneven
			float w = lp.y * 3200.0;
			float aa = 1.0 - smoothstep( 0.3, 1.2, fwidth( w ) );
			float turns = sin( w + ang * 0.16 ) * aa;
			col = base * ( 1.0 + turns * 0.12 ) * mix( 0.92, 1.06, gpNoise( lp * 300.0 ) );
			gpH = turns * 0.00003;
			gpCoat = 1.0; gpCoatRough = 0.04;
		} else if ( pat < 10.5 ) {
			// EVA foam: closed-cell pores, darker and smoother where the hand holds it, grime
			float pore = smoothstep( 0.72, 0.9, gpNoise( lp * 2600.0 ) );
			float grime = gpFbm( lp * 60.0 );
			col = base * ( 1.0 - pore * 0.35 ) * mix( 0.85, 1.08, grime );
			gpRough = clamp( gpRough - grime * 0.12, 0.55, 1.0 );
			gpH = - pore * 0.0002;
		} else if ( pat < 11.5 ) {
			// braided line wound on the spool: fine crossing turns
			float w = lp.y * 1500.0; float u = ang * 60.0;
			float aa = 1.0 - smoothstep( 0.3, 1.2, fwidth( w ) );
			float b = sin( u + w ) * 0.5 + 0.5;
			col = base * mix( 0.8, 1.08, b * aa + 0.5 * ( 1.0 - aa ) );
			gpH = b * 0.00006 * aa;
		} else if ( pat < 12.5 ) {
			// machined / anodised metal: circumferential lathe marks, slightly uneven sheen
			float w = length( lp.xz ) * 5000.0 + lp.y * 800.0;
			float aa = 1.0 - smoothstep( 0.3, 1.2, fwidth( w ) );
			float m = sin( w ) * aa;
			col = base * ( 1.0 + m * 0.03 );
			gpRough = clamp( gpRough + m * 0.05 + ( gpNoise( lp * 150.0 ) - 0.5 ) * 0.06, 0.12, 0.9 );
		} else if ( pat < 13.5 ) {
			// knurled metal (lock nut): a diamond grip pattern in the relief
			float u = ang * 24.0; float w = lp.y * 900.0;
			float aa = 1.0 - smoothstep( 0.3, 1.2, fwidth( w ) );
			float k = abs( sin( u + w ) ) * abs( sin( u - w ) );
			col = base * ( 0.85 + k * 0.25 * aa );
			gpH = k * 0.00012 * aa;
		} else {
			// rubber: matte, a few scuffs
			float sc = gpFbm( lp * 250.0 );
			col = base * mix( 0.9, 1.15, sc );
			gpRough = clamp( gpRough + ( sc - 0.5 ) * 0.2, 0.6, 1.0 );
		}
	}
	diffuseColor.rgb = col;
`;

const glslType = ( v ) => v.isVector4 ? 'vec4' : v.isVector3 ? 'vec3' : v.isVector2 ? 'vec2' : v.isColor ? 'vec3' : 'float';

// extra: { uniforms: { name: { value } } (also on material.uniforms, for the caller to write),
//   vertex: GLSL run on the rest pose ( vec3 P, vec3 Nn in model space; the part id is aux.w ),
//   clearcoat: the clear-coat lobe (the carbon / thread patterns use it) }
export function createPropMaterial( name = 'gameProp', extra = {} ) {

	const Material = extra.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
	const m = new Material( { vertexColors: true, roughness: 1, metalness: 0 } );
	if ( extra.clearcoat ) m.clearcoat = 1; // (per pixel: only where the pattern asks for it)
	m.name = name;
	const uniforms = m.uniforms = extra.uniforms || {};
	const decl = Object.entries( uniforms ).map( ( [ k, u ] ) => `uniform ${ glslType( u.value ) } ${ k };` ).join( '\n' );
	m.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', `#include <common>
attribute vec4 aux;
varying vec4 vAux;
varying vec3 vLocal;
varying vec3 vGpWorld;
varying vec3 vGpNormal;
${ decl }` )
			// the pattern coordinates are the rest position: patterns stay on parts the snippet moves
			.replace( '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
	vAux = aux;
	vLocal = position;
	vec3 gpP = position;
	vec3 gpN = objectNormal;
	{
		vec3 P = gpP; vec3 Nn = gpN;
${ extra.vertex || '' }
		gpP = P; gpN = Nn;
	}
	objectNormal = gpN;` )
			.replace( '#include <begin_vertex>', 'vec3 transformed = gpP;' )
			.replace( '#include <project_vertex>', `#include <project_vertex>
	vGpWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vGpNormal = normalize( mat3( modelMatrix ) * objectNormal );` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>
varying vec4 vAux;
varying vec3 vLocal;
varying vec3 vGpWorld;
varying vec3 vGpNormal;
${ decl }
${ GP_GLSL }` )
			.replace( '#include <color_fragment>', `#include <color_fragment>
	float gpRough = vAux.x;
	float gpH = 0.0;
	float gpCoat = 0.0;
	float gpCoatRough = 0.05;
	{
${ PATTERNS }
	}` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = max( gpRough, 0.04 );' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = vAux.y;' )
			// (the bump on the view-space surface; zero height leaves the normal as it is)
			.replace( '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = gpBump( - vViewPosition, normal, gpH );' )
			.replace( '#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
	material.clearcoat = gpCoat;
	material.clearcoatRoughness = clamp( gpCoatRough, 0.0525, 1.0 );
#endif` );

	};
	return m;

}

// Fishing line: a thin ribbon laid along a sagging curve between two world points, built in the
// vertex shader from ( t along the line, side ) so it costs one draw and no uploads per frame. The
// mesh stays at the origin (its vertices are placed in world space).
export function createLineMaterial( segments ) {

	const m = new THREE.MeshStandardMaterial( { color: 0xd8dde0, roughness: 0.35, metalness: 0, side: THREE.DoubleSide } );
	m.name = 'fishingLine';
	const uniforms = m.uniforms = {
		lineA: { value: new THREE.Vector3() },
		lineB: { value: new THREE.Vector3() },
		lineCtl: { value: new THREE.Vector3() }, // middle control point (sag / belly), quadratic Bezier
		lineShow: { value: 0 },
	};
	m.userData.segments = segments;
	m.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', `#include <common>
attribute vec2 aLine;
uniform vec3 lineA;
uniform vec3 lineB;
uniform vec3 lineCtl;
uniform float lineShow;` )
			.replace( '#include <beginnormal_vertex>', `
	float t = aLine.x;
	float side = aLine.y;
	vec3 lP = ( 1.0 - t ) * ( 1.0 - t ) * lineA + 2.0 * ( 1.0 - t ) * t * lineCtl + t * t * lineB;
	vec3 lT = normalize( 2.0 * ( 1.0 - t ) * ( lineCtl - lineA ) + 2.0 * t * ( lineB - lineCtl ) + vec3( 1e-6, 0.0, 0.0 ) );
	vec3 toCam = cameraPosition - lP;
	float dist = length( toCam );
	vec3 lW = normalize( cross( lT, toCam ) + vec3( 0.0, 1e-6, 0.0 ) );
	// a pixel or two wide at any distance (no temporal anti-aliasing here to resolve thinner)
	float lw = max( 0.0008, dist * 0.0011 ) * lineShow;
	vec3 objectNormal = normalize( toCam );` )
			.replace( '#include <begin_vertex>', 'vec3 transformed = lP + lW * side * lw;' );

	};
	return m;

}
