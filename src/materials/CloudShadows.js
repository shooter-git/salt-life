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
//   cloudShadows.attach( clouds, renderer ) its map and area (high only)
//   useCloudShadows( material )            before its first compile
//   cloudShadows.update( camera )          each frame, before drawing
//   cloudShadows.shadeAt( x, z )           (M20) the drawn shadow there for the CPU, 0..1, or null (below)
//
// ((M20, stream CHECKS) The flats' fish see a cloud's shade (FlatsFishing.shadeAt). On the CPU that was a field of its own,
// which on high didn't match the clouds drawn overhead: docs/m20/checks.md. So on high a window of the map round the camera,
// READ.half texels either side (47 m each), is read back every READ.every s without waiting on the GPU (a fenced read, its
// result a frame or two later), and the CPU's shade is the drawn one there)

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

const READ = { every: 1, half: 16 }; // s; texels either side of the camera's (a 1.5 km square)

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
	renderer: null,
	_read: null,
	attach( clouds, renderer = null ) {

		this.clouds = clouds;
		this.renderer = renderer;
		U.cloudShadowMap.value = clouds.shadowMap.texture;
		const n = 2 * READ.half + 1;
		this._read = { n, buf: new Float32Array( n * n ), rgba: new Float32Array( n * n * 4 ), area: new THREE.Vector4(), i0: 0, j0: 0, at: - Infinity, pbo: null, sync: null, pending: null, ok: false, failed: ! renderer || ! renderer.getContext };

	},
	// ((M20) the window round the camera read back, every READ.every s: read into a buffer of the GPU's, fenced, and taken when the
	// fence has passed (a frame or two on), so nothing waits on it. As RGBA floats, which WebGL 2 reads any float target as (the
	// map's half floats read as red half floats here, and not everywhere))
	_readBack( camera ) {

		const R = this._read;
		if ( ! R || R.failed ) return;
		const r = this.renderer, gl = r.getContext(), t = this.clouds.shadowMap;
		if ( R.sync ) {

			const st = gl.clientWaitSync( R.sync, 0, 0 );
			if ( st === gl.TIMEOUT_EXPIRED ) return;
			gl.deleteSync( R.sync );
			R.sync = null;
			if ( st === gl.WAIT_FAILED ) {

				R.failed = true;
				return;

			}

			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, R.pbo );
			gl.getBufferSubData( gl.PIXEL_PACK_BUFFER, 0, R.rgba );
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, null );
			// (light through the cloud, 0 to 1: anything else, and the device didn't read it, so the CPU's own field stands)
			for ( let k = 0, n2 = R.n * R.n; k < n2; k ++ ) {

				const T = R.rgba[ 4 * k ];
				if ( ! ( T >= - 0.01 && T <= 1.01 ) ) {

					R.failed = true;
					R.ok = false;
					return;

				}

				R.buf[ k ] = T;

			}

			R.area.copy( R.pending.area );
			R.i0 = R.pending.i0;
			R.j0 = R.pending.j0;
			R.ok = true;
			return;

		}

		const now = performance.now() / 1000;
		if ( now - R.at < READ.every || ! this.clouds._shadowMade ) return;
		const fb = r.properties.get( t ).__webglFramebuffer;
		if ( ! fb ) return;
		const A = this.clouds.shadowArea.value, RES = t.width, n = R.n;
		const i = Math.floor( ( ( camera.position.x - A.x ) / A.z + 0.5 ) * RES ), j = Math.floor( ( ( camera.position.z - A.y ) / A.z + 0.5 ) * RES );
		const i0 = Math.max( 0, Math.min( RES - n, i - READ.half ) ), j0 = Math.max( 0, Math.min( RES - n, j - READ.half ) );
		const cur = r.getRenderTarget();
		r.state.bindFramebuffer( gl.FRAMEBUFFER, fb );
		if ( ! R.pbo ) {

			R.pbo = gl.createBuffer();
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, R.pbo );
			gl.bufferData( gl.PIXEL_PACK_BUFFER, R.rgba.byteLength, gl.STREAM_READ );

		} else gl.bindBuffer( gl.PIXEL_PACK_BUFFER, R.pbo );

		gl.readPixels( i0, j0, n, n, gl.RGBA, gl.FLOAT, 0 );
		gl.bindBuffer( gl.PIXEL_PACK_BUFFER, null );
		r.state.bindFramebuffer( gl.FRAMEBUFFER, cur ? r.properties.get( cur ).__webglFramebuffer : null );
		R.sync = gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 );
		gl.flush();
		R.pending = { area: A.clone(), i0, j0 };
		R.at = now;

	},
	// ((M20) the drawn clouds' shadow at ( x, z ) as they're faded in: 0 clear to 1 under a whole cloud; null off the window read
	// back, or with nothing read)
	shadeAt( x, z ) {

		const R = this._read;
		if ( ! R || ! R.ok ) return null;
		const A = R.area, RES = this.clouds.shadowMap.width, n = R.n;
		const u = ( ( x - A.x ) / A.z + 0.5 ) * RES - 0.5 - R.i0, v = ( ( z - A.y ) / A.z + 0.5 ) * RES - 0.5 - R.j0;
		if ( ! ( u >= 0 && v >= 0 && u <= n - 1 && v <= n - 1 ) ) return null;
		const i = Math.min( n - 2, Math.floor( u ) ), j = Math.min( n - 2, Math.floor( v ) ), fu = u - i, fv = v - j, b = R.buf, k = j * n + i;
		const T = ( b[ k ] * ( 1 - fu ) + b[ k + 1 ] * fu ) * ( 1 - fv ) + ( b[ k + n ] * ( 1 - fu ) + b[ k + n + 1 ] * fu ) * fv;
		return Math.min( 1, Math.max( 0, 1 - T ) ) * Math.min( 1, A.w / 0.85 );

	},
	// the area and strength from the clouds, the camera's rows for the view-space lighting
	update( camera ) {

		if ( ! this.clouds ) return;
		U.cloudShadowArea.value.copy( this.clouds.shadowArea.value );
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		U.cloudShadowViewX.value.set( e[ 0 ], e[ 4 ], e[ 8 ], e[ 12 ] );
		U.cloudShadowViewZ.value.set( e[ 2 ], e[ 6 ], e[ 10 ], e[ 14 ] );
		this._readBack( camera );

	},

};
