import { rot2 } from '../world/terrain/TerrainShading.js';

// (Salt Life) Under the sea, as on the terrain's seabed (Terrain.js): the water takes the red out
// first, then the green, on the way down and back; and the caustics, the net of sunlight focused
// by the waves, drift over what faces up in the shallows. For the reef and the fish.
//
// GLSL (UNDERWATER_GLSL):
//   vec3 uwShade( vec3 albedo, vec3 p, vec3 N )   p, N: world position and normal
// uniforms: underwaterUniforms( ground ) (ground: the Terrain, whose caustic texture and sea
// uniforms are shared)

export const UNDERWATER_GLSL = /* glsl */`
uniform float uwSeaLevel;
uniform vec3 uwAbsorption;
uniform sampler2D uwCaustics;
uniform float uwTime;
uniform float uwNight;
uniform float uwCausticsK;
float uwSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
vec3 uwShade( vec3 albedo, vec3 p, vec3 N ) {
	float cWater = max( uwSeaLevel - p.y, 0.0 );
	albedo *= exp( - uwAbsorption * cWater * 1.6 );
	float cK = uwSs( 0.05, 0.7, cWater ) * exp( - cWater * 0.1 ) * ( 1.0 - uwNight ) * uwCausticsK * clamp( N.y * 0.8 + 0.2, 0.0, 1.0 );
	if ( cK > 0.001 ) {
		float ca = min( texture( uwCaustics, p.xz * 0.19 + uwTime * vec2( 0.031, 0.018 ) ).r,
			texture( uwCaustics, ${ rot2( 'p.xz', 0.8 ) } * 0.15 + 0.5 - uwTime * vec2( 0.017, 0.034 ) ).r );
		albedo *= 1.0 + ca * 3.0 * cK;
	}
	return albedo;
}
`;

export function underwaterUniforms( ground ) {

	const U = ground.uniforms;
	return { uwSeaLevel: U.terrainSeaLevel, uwAbsorption: U.terrainWaterAbsorption, uwCaustics: U.terrainCaustics, uwTime: U.terrainTime, uwNight: U.terrainNight, uwCausticsK: U.terrainCausticsK };

}
