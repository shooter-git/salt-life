import * as THREE from '../engine/index.js';

// (M15) The sun's shadows looked up from where things are about the camera, not in the world. three finds a
// point's place on a shadow map from its world position, in 32-bit floats on the GPU, and tens of km out (a
// float's step is 4 mm at 40 km) the deck's shadows' edges crawled as you moved; where it is about the camera
// is exact (three works each object's modelViewMatrix out in doubles). So the shadow coordinates are taken
// from view space: the sun's (mid's DirectionalLight, high's SunLight cascades) matrices times the camera's
// world matrix, in doubles, for each render's camera (viewShadows); the chunk that finds them (patched here,
// on import, before anything's compiled) takes the view position and normal. Point and spot lights keep
// the world's (none of them is drawn far out).

const chunk = THREE.ShaderChunk.shadowmap_vertex;
const swap = [
	[ 'vec4 shadowWorldPosition;', /* glsl */`vec4 shadowWorldPosition;
	#ifdef HAS_NORMAL
		vec3 shadowViewNormal = normalize( transformedNormal );
	#else
		vec3 shadowViewNormal = vec3( 0.0 );
	#endif` ],
	[ 'vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );', 'vSunShadowWorldPosition = vec4( mvPosition.xyz, - mvPosition.z );' ],
	[ 'vSunShadowWorldNormal = shadowWorldNormal;', 'vSunShadowWorldNormal = shadowViewNormal;' ],
	[ 'shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );',
		'shadowWorldPosition = vec4( mvPosition.xyz + shadowViewNormal * directionalLightShadows[ i ].shadowNormalBias, 1.0 );' ],
];
THREE.ShaderChunk.shadowmap_vertex = swap.reduce( ( s, [ a, b ] ) => {

	if ( ! s.includes( a ) ) throw new Error( `ViewShadows: three's shadowmap_vertex has changed (${ a })` );
	return s.replace( a, b );

}, chunk );

// the sun's shadow matrices as three works them out (in the world), kept as they're made, and the view's
// put in their place for each render's camera: the renderer's shadow pass wrapped
export function viewShadows( renderer ) {

	const shadowMap = renderer.shadowMap, render = shadowMap.render;
	const matrices = ( s ) => s._matrices ?? [ s.matrix ];
	shadowMap.render = function ( lights, scene, camera ) {

		for ( const light of lights ) {

			const s = light.shadow;
			if ( ! ( light.isDirectionalLight || light.isSunLight ) || s._world ) continue;
			const update = s.updateMatrices;
			s.updateMatrices = function ( ...a ) {

				update.apply( this, a );
				matrices( this ).forEach( ( m, i ) => this._world[ i ].copy( m ) );

			};
			s._world = matrices( s ).map( ( m ) => m.clone() );

		}
		render.call( this, lights, scene, camera );
		for ( const light of lights ) {

			const s = light.shadow;
			if ( s._world ) matrices( s ).forEach( ( m, i ) => m.multiplyMatrices( s._world[ i ], camera.matrixWorld ) );

		}

	};

}
