import * as THREE from 'three';

// (Salt Life) Haze that thins with height: Tidewater's two exponential layers over the sea (post/
// AirHaze.js: marine haze ~110 m thick, fine aerosol ~1.4 km), as the optical depth along each
// view ray from the camera's height, on top of the distance fog that hides where the world ends
// (Sky: near / far). Distant low ground and sea fade into the horizon's colour, the hilltops and the
// sky above them stay clear; looking down from height there is less of it. ((M15) The distance fog's on
// the sea and the low land only: what's over 30 m up has the haze alone, as far as it's drawn.) Under water the fog is
// the water's (App: 0 to 28 m), the layers add nearly nothing over that.
//
// Done in three's fog chunks, for every material that takes the fog: the vertex stage passes the
// world position (the view-space position the chunk already has, turned back by the view
// rotation). GLSL for materials that blend the fog themselves (premultiplied particles):
//   float sceneFogFactor()   (in fog_pars_fragment, with USE_FOG)
// Import before anything is compiled.

const MARINE = { sigma: 1.5e-4, H: 110 };
const AEROSOL = { sigma: 3.2e-5, H: 1400 };
const DENSITY = 1.6;

const f = ( x ) => {

	const s = String( x );
	return /[.e]/.test( s ) ? s : s + '.0';

};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif
`;

THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = cameraPosition + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	// optical depth of a layer (extinction sigma at sea level, scale height H) from height hc along a
	// ray rising vy per metre over d metres
	float hazeLayerDepth( float sigma, float H, float hc, float vy, float d ) {
		float k = vy * d / H;
		float fk = abs( k ) < 1e-3 ? d : H * ( 1.0 - exp( - k ) ) / vy;
		return exp( hc / - H ) * sigma * fk;
	}
	float sceneFogFactor() {
	#ifdef FOG_EXP2
		return 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		vec3 ray = vFogWorld - cameraPosition;
		float d = length( ray );
		float vy = ray.y / max( d, 1e-3 );
		float hc = max( cameraPosition.y, 0.0 );
		float tau = ( hazeLayerDepth( ${ f( MARINE.sigma ) }, ${ f( MARINE.H ) }, hc, vy, d ) + hazeLayerDepth( ${ f( AEROSOL.sigma ) }, ${ f( AEROSOL.H ) }, hc, vy, d ) ) * ${ f( DENSITY ) };
		// ((M15) the distance fog hides where the world ends, at the sea: the island's hills over it needn't be
		// hidden (they're drawn as far as they're seen: world/FarIsland.js), the haze is all there is on them,
		// as there is on real land seen from the sea. Out of the water only)
		float ends = smoothstep( fogNear, fogFar, vFogDepth );
		if ( cameraPosition.y > 0.0 ) ends *= 1.0 - smoothstep( 4.0, 30.0, vFogWorld.y );
		return 1.0 - ( 1.0 - ends ) * exp( - tau );
	#endif
	}
#endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, sceneFogFactor() );
#endif
`;
