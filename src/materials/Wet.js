import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// (M9) Wet surfaces: one shared value (G.wet, which WeatherDriver soaks in the rain and dries slowly
// after, as G.night is one for the night) darkening and glossing every lit material that asks for it
// (useWet: the WET_SURFACES define): the ground and the sand, the rocks, the plants, the village, the
// stalls, the boat and the debris. Water fills a surface's pores, so it's darker; a film of it smooths
// it, so it shines. What faces up takes the rain; a wall less, an overhang's underside none.
//
// It's three's lighting chunks that take it, just before the lights read the surface (the diffuse colour
// and the roughness, after every material's own maps and the normal): the materials that rewrite their
// emissive or their lights keep their own code and still get wet.
//   useWet( material )   before its first compile

const U = { wetness: G.wet };

// how much darker a soaked surface is, and how glossy it gets (the roughness it tends to)
const DARKEN = 0.3;
const GLOSS = 0.22;

const WET_GLSL = /* glsl */`
#ifdef WET_SURFACES
	{
		// (up, in view space: the lighting's)
		vec3 wetUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		float wetK = wetness * smoothstep( - 0.3, 0.7, dot( normal, wetUp ) );
		diffuseColor.rgb *= 1.0 - ${ DARKEN.toFixed( 2 ) } * wetK;
		#ifdef STANDARD
		roughnessFactor = mix( roughnessFactor, min( roughnessFactor, ${ GLOSS.toFixed( 2 ) } ), wetK * 0.85 );
		#endif
	}
#endif
`;

THREE.ShaderChunk.common = `#ifdef WET_SURFACES\nuniform float wetness;\n#endif\n` + THREE.ShaderChunk.common;
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
