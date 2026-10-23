import * as THREE from '../engine/index.js';

// (Salt Life) The clouds' shadows on the island and the sea (high): SkyProClouds marches a map of the
// key light's transmittance through the cloud layer around the camera (clouds.shadowMap), and every lit
// material that asks for it (useCloudShadows: the CLOUD_SHADOWS define) dims the sun's direct light by
// it, in three's lights chunk (the sun and directional lights' loops). Shaders with their own sun terms
// (the sea's body and foam) call cloudShadowXZ( worldXZ ) themselves.
//
// The lighting runs in view space: world x and z of a view-space point come from the main camera's
// matrix (two rows, packed in update()). A render with another camera (the catch card's portrait)
// holds the shadows off for its duration (holdCloudShadows).
//   cloudShadows.attach( clouds )          its map and area (high only)
//   useCloudShadows( material )            before its first compile
//   cloudShadows.update( camera )          each frame, before drawing

const U = {
	cloudShadowMap: { value: null },
	cloudShadowArea: { value: new THREE.Vector4( 0, 0, 12000, 0 ) }, // centre x, z (world), size (m), strength (0: off)
	cloudShadowViewX: { value: new THREE.Vector4() }, // world x of a view-space point: dot( xyz, p ) + w
	cloudShadowViewZ: { value: new THREE.Vector4() },
};

export const CLOUD_SHADOW_GLSL = /* glsl */`
uniform sampler2D cloudShadowMap;
uniform vec4 cloudShadowArea;
uniform vec4 cloudShadowViewX;
uniform vec4 cloudShadowViewZ;
// the clouds' shadow at a world position (1 = clear), fading out toward the map's edge
float cloudShadowXZ( vec2 xz ) {
	vec2 uv = ( xz - cloudShadowArea.xy ) / cloudShadowArea.z + 0.5;
	vec2 e = abs( uv - 0.5 );
	float inside = 1.0 - smoothstep( 0.42, 0.5, max( e.x, e.y ) );
	return mix( 1.0, texture( cloudShadowMap, uv ).r, cloudShadowArea.w * inside );
}
float cloudShadowView( vec3 p ) {
	return cloudShadowXZ( vec2( dot( cloudShadowViewX.xyz, p ) + cloudShadowViewX.w, dot( cloudShadowViewZ.xyz, p ) + cloudShadowViewZ.w ) );
}
`;

THREE.ShaderChunk.lights_pars_begin = `#ifdef CLOUD_SHADOWS\n${ CLOUD_SHADOW_GLSL }\n#endif\n` + THREE.ShaderChunk.lights_pars_begin;
{

	// the sun's light (SunLight on high, a DirectionalLight otherwise) under the clouds
	let s = THREE.ShaderChunk.lights_fragment_begin;
	for ( const call of [ 'getSunLightInfo( sunLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );' ] ) {

		if ( ! s.includes( call ) ) throw new Error( 'CloudShadows: three\'s lights_fragment_begin changed (' + call + ')' );
		s = s.replace( call, `${ call }\n\t\t#ifdef CLOUD_SHADOWS\n\t\tdirectLight.color *= cloudShadowView( geometryPosition );\n\t\t#endif` );

	}

	THREE.ShaderChunk.lights_fragment_begin = s;

}

const _proto = THREE.Material.prototype.customProgramCacheKey;
const _done = new WeakSet();

// a lit material (standard, physical, Lambert, Phong, or one built on them) takes the clouds' shadows:
// the define, and the uniforms added to whatever its own onBeforeCompile does (its program key kept
// apart from the same material's without them)
export function useCloudShadows( material ) {

	if ( _done.has( material ) ) return material;
	_done.add( material );
	const before = material.onBeforeCompile, own = material.customProgramCacheKey !== _proto ? material.customProgramCacheKey : null;
	const key = own ? null : before.toString();
	material.onBeforeCompile = function cloudShadowsOnBeforeCompile( shader, renderer ) {

		before.call( this, shader, renderer );
		Object.assign( shader.uniforms, U );

	};

	material.customProgramCacheKey = function () {

		return ( own ? own.call( this ) : key ) + '|cloudShadows';

	};

	material.defines = { ...( material.defines || {} ), CLOUD_SHADOWS: '' };
	material.needsUpdate = true;
	return material;

}

// no cloud shadows for a moment (a render with another camera)
export function holdCloudShadows( fn ) {

	const A = U.cloudShadowArea.value, w = A.w;
	A.w = 0;
	try {

		return fn();

	} finally {

		A.w = w;

	}

}

export const cloudShadows = {

	clouds: null,
	attach( clouds ) {

		this.clouds = clouds;
		U.cloudShadowMap.value = clouds.shadowMap.texture;

	},
	// the area and strength from the clouds, the camera's rows for the view-space lighting
	update( camera ) {

		if ( ! this.clouds ) return;
		U.cloudShadowArea.value.copy( this.clouds.shadowArea.value );
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		U.cloudShadowViewX.value.set( e[ 0 ], e[ 4 ], e[ 8 ], e[ 12 ] );
		U.cloudShadowViewZ.value.set( e[ 2 ], e[ 6 ], e[ 10 ], e[ 14 ] );

	},

};
