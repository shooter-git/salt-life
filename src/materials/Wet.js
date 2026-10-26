import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { COVER_GLSL } from '../world/Cover.js';

// (M9) Wet surfaces: one shared value (G.wet, which WeatherDriver soaks in the rain and dries slowly
// after, as G.night is one for the night) darkening and glossing every lit material that asks for it
// (useWet: the WET_SURFACES define): the ground and the sand, the rocks, the plants, the village, the
// stalls, the boat and the debris. Water fills a surface's pores, so it's darker; a film of it smooths
// it, so it shines. What faces up takes the rain; a wall less, an overhang's underside none. (M11) And
// nothing under what covers the island (world/Cover.js: the pier's deck, a roof, an awning, more than
// a quarter of a metre over it), nor under the wheelhouse's roof (the rain's box for it): the porches, the
// boathouse's floor and the sand under the pier stay dry. Where a fragment is comes from its view-space
// position and the camera's matrix (wetSurfaces.update), as the clouds' shadows do.
//
// It's three's lighting chunks that take it, just before the lights read the surface (the diffuse colour
// and the roughness, after every material's own maps and the normal): the materials that rewrite their
// emissive or their lights keep their own code and still get wet.
//   useWet( material )   before its first compile
//   wetSurfaces.under( cover )   the cover map, before the first compile of a wet material
//   wetSurfaces.update( camera, shelter )   each frame (shelter: world -> the wheelhouse roof's box)

const NO_ROOF = new THREE.Matrix4().makeScale( 0, 0, 0 ).setPosition( 10, 10, 10 ); // (no roof: everything's outside it)
const U = {
	wetness: G.wet,
	wetViewToWorld: { value: new THREE.Matrix4() },
	wetShelter: { value: NO_ROOF.clone() },
};

// how much darker a soaked surface is, and how glossy it gets (the roughness it tends to)
const DARKEN = 0.3;
const GLOSS = 0.22;
// (M11) how far over a surface a cover keeps it dry (m: wet up to the first, dry from the second). A
// roof's own surface is within the first: the map keeps its height at each texel's middle, which on a
// steep roof's slope is up to a hand's breadth above the rest of the texel
const DRY_UNDER = [ 0.25, 0.5 ];

const WET_GLSL = /* glsl */`
#ifdef WET_SURFACES
	if ( wetness > 0.0 ) {
		// (up, in view space: the lighting's)
		vec3 wetUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		float wetK = wetness * smoothstep( - 0.3, 0.7, dot( normal, wetUp ) );
		// (M11) dry under a cover, and under the wheelhouse's roof
		vec3 wetP = ( wetViewToWorld * vec4( - vViewPosition, 1.0 ) ).xyz;
		wetK *= 1.0 - smoothstep( ${ DRY_UNDER[ 0 ].toFixed( 2 ) }, ${ DRY_UNDER[ 1 ].toFixed( 2 ) }, coverHeightAt( wetP.xz ) - wetP.y );
		vec3 wetQ = ( wetShelter * vec4( wetP, 1.0 ) ).xyz;
		if ( all( lessThan( abs( wetQ ), vec3( 1.0 ) ) ) ) wetK = 0.0;
		diffuseColor.rgb *= 1.0 - ${ DARKEN.toFixed( 2 ) } * wetK;
		#ifdef STANDARD
		roughnessFactor = mix( roughnessFactor, min( roughnessFactor, ${ GLOSS.toFixed( 2 ) } ), wetK * 0.85 );
		#endif
	}
#endif
`;

THREE.ShaderChunk.common = `#ifdef WET_SURFACES\nuniform float wetness;\n#endif\n` + THREE.ShaderChunk.common;
THREE.ShaderChunk.lights_pars_begin = `#ifdef WET_SURFACES\nuniform mat4 wetViewToWorld;\nuniform mat4 wetShelter;\n${ COVER_GLSL }\n#endif\n` + THREE.ShaderChunk.lights_pars_begin;
for ( const name of [ 'lights_physical_fragment', 'lights_lambert_fragment', 'lights_phong_fragment' ] ) THREE.ShaderChunk[ name ] = WET_GLSL + THREE.ShaderChunk[ name ];

const _proto = THREE.Material.prototype.customProgramCacheKey;
const _done = new WeakSet();

// a lit material (standard, physical, Lambert, Phong, or one built on them) gets wet in the rain: the
// define, and the uniform added to whatever its own onBeforeCompile does (its program key kept apart
// from the same material's without it)
export function useWet( material ) {

	if ( _done.has( material ) ) return material;
	_done.add( material );
	const before = material.onBeforeCompile, own = material.customProgramCacheKey !== _proto ? material.customProgramCacheKey : null;
	const key = own ? null : before.toString();
	material.onBeforeCompile = function wetOnBeforeCompile( shader, renderer ) {

		before.call( this, shader, renderer );
		Object.assign( shader.uniforms, U );

	};

	material.customProgramCacheKey = function () {

		return ( own ? own.call( this ) : key ) + '|wet';

	};

	material.defines = { ...( material.defines || {} ), WET_SURFACES: '' };
	material.needsUpdate = true;
	return material;

}

export const wetSurfaces = {

	// (M11) what covers the island (a CoverMap): its uniforms, for the materials compiled from now on
	under( cover ) {

		Object.assign( U, cover.uniforms );

	},
	// the camera's matrix (where a fragment is), and the wheelhouse roof's box (world -> -1..1), or null
	update( camera, shelter = null ) {

		camera.updateMatrixWorld();
		U.wetViewToWorld.value.copy( camera.matrixWorld );
		U.wetShelter.value.copy( shelter || NO_ROOF );

	},

};
