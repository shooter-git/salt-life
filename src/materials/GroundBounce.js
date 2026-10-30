import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// (M15) The light the sunlit sand throws back up, on a person. The engine has no bounce light: someone in the
// shade (Joe under his stall's roof, Errol under his lean-to in the cliff's shadow) was lit by the sky's small
// fill alone (kept low for the sand: Sky's levels) and came out nearly black, where on a real beach the sand
// (coral sand reflects about 43% of the light on it) lights a person from below and from the sides at about a
// fifth of the sun. That's the ground's irradiance on a face whose normal n is ( 1 - n.y ) / 2 of the sand's
// exitance, rho times the sun's on the level ground (its colour and intensity, times the sine of its height):
// added to the indirect diffuse alone (raising the environment's light instead put a sheen on dark cloth), as
// much as `open` says the ground about them is in the sun. The sun's own, so the moon's faint one at night and
// less under cloud. And the sky's light on them as much again as the world's fill (Sky's hemisphere light,
// kept at about half a real sky's for the sand's sake): a face sees the sky out of a stall's open sides.
//   useGroundBounce( material, { open } )   (after the app's own patches: App.lightUp)

export const SAND = new THREE.Color( 0.5, 0.42, 0.3 ); // linear: coral sand's colour, its luminance 0.43

const _proto = THREE.Material.prototype.customProgramCacheKey;
const _done = new WeakSet();

const GLSL = /* glsl */`
	{
		// ((M15) the sunlit sand's light from below and from the sides: GroundBounce)
		vec3 gbUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		float gbN = dot( normal, gbUp );
		irradiance += groundBounceSun * max( groundBounceDir.y, 0.0 ) * groundBounceSand * ( 0.5 - 0.5 * gbN ) * groundBounceOpen;
		// (and the sky's, as much again as the world's fill gives: that's kept low for the sand)
		irradiance += groundBounceSky * ( 0.5 + 0.5 * gbN ) * groundBounceOpen;
	}
`;

export function useGroundBounce( material, { open = 1 } = {} ) {

	if ( _done.has( material ) || ! material.isMeshStandardMaterial ) return material;
	_done.add( material );
	const before = material.onBeforeCompile, own = material.customProgramCacheKey !== _proto ? material.customProgramCacheKey : null;
	const key = own ? null : before.toString();
	const uniforms = { groundBounceSun: G.sunColor, groundBounceDir: G.sunDir, groundBounceSand: { value: SAND }, groundBounceSky: G.skyIrradiance, groundBounceOpen: { value: open } };
	material.onBeforeCompile = function groundBounceOnBeforeCompile( shader, renderer ) {

		before.call( this, shader, renderer );
		Object.assign( shader.uniforms, uniforms );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nuniform vec3 groundBounceSun;\nuniform vec3 groundBounceDir;\nuniform vec3 groundBounceSand;\nuniform vec3 groundBounceSky;\nuniform float groundBounceOpen;' )
			.replace( '#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + GLSL );

	};

	material.customProgramCacheKey = function () {

		return ( own ? own.call( this ) : key ) + '|groundBounce';

	};

	// (how much of the ground about them is in the sun, to be set later without compiling again)
	material.userData.groundBounceOpen = uniforms.groundBounceOpen;
	material.needsUpdate = true;
	return material;

}
