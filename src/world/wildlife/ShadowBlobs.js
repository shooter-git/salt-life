import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { InstanceRecords, instancedMesh } from './Kit.js';

// Soft contact shadows under the small animals on the ground. Crabs and sanderlings are only a
// few centimetres tall: the sun shadow map (and its normal bias) can't resolve them, and without
// a shadow they seem to hover. One instanced quad each, drawn after the opaque world and
// darkening what is below (premultiplied black): a round occlusion blob right under the body
// plus a sun shadow stretched away from the key light.
//
// Record (2 vec4): ( ground position, radius ), ( height of the body above the ground, darkness,
// ground slope dh/dx, dh/dz ) - the quad lies on the local slope

export class ShadowBlobs {

	constructor( { capacity = 160 } = {} ) {

		this.records = new InstanceRecords( 'blobInstances', capacity, 2 );
		const R = this.records;
		const g = new THREE.PlaneGeometry( 2, 2 );
		g.rotateX( - Math.PI / 2 );
		const F = ( k ) => R.field( k );

		// premultiplied black: the blend darkens what is below
		const mat = new THREE.ShaderMaterial( {
			name: 'ContactShadows',
			transparent: true,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			uniforms: { blobInstances: { value: R.texture }, blobSunDir: G.sunDir, blobNight: G.night },
			vertexShader: /* glsl */`
uniform highp sampler2D blobInstances;
uniform vec3 blobSunDir;
varying vec2 vBlobUV;
varying vec4 vBlobInfo;
void main() {
	vec4 r0 = ${ F( 0 ) }; vec4 r1 = ${ F( 1 ) };
	// the quad covers the blob and its sun shadow (offset away from the light, stretched)
	vec3 L = blobSunDir;
	float lh = max( length( L.xz ), 1e-3 );
	vec2 dir = - L.xz / lh;
	float reach = min( r1.x * lh / max( L.y, 0.12 ), r0.w * 4.0 );
	vec3 p = position;
	vec2 side = vec2( dir.y, - dir.x ); // (keeps the winding: the quad faces up)
	float s = r0.w * 1.6;
	float along = p.z * ( s + reach * 0.5 ) + reach * 0.5;
	vec2 xz = r0.xz + dir * along + side * ( p.x * s );
	vBlobUV = vec2( along, p.x * s );
	vBlobInfo = vec4( r0.w, reach, r1.y, L.y );
	vec2 off = xz - r0.xz;
	gl_Position = projectionMatrix * viewMatrix * vec4( xz.x, r0.y + off.x * r1.z + off.y * r1.w + 0.012, xz.y, 1.0 );
}
`,
			fragmentShader: /* glsl */`
uniform float blobNight;
varying vec2 vBlobUV;
varying vec4 vBlobInfo;
void main() {
	float r = vBlobInfo.x; float reach = vBlobInfo.y; float dark = vBlobInfo.z;
	vec2 q = vBlobUV / r;
	// occlusion right below, the sun shadow stretched along the light
	float ao = exp( dot( q, q ) * - 2.2 ) * 0.55;
	float t = clamp( vBlobUV.x / max( reach, 1e-3 ), 0.0, 1.0 );
	vec2 c = vec2( vBlobUV.x - reach * t, vBlobUV.y ) / r;
	float sun = exp( dot( c, c ) * - 1.6 ) * 0.6 * ( vBlobInfo.w > 0.0 ? 1.0 : 0.0 );
	gl_FragColor = vec4( 0.0, 0.0, 0.0, max( ao, sun ) * dark * ( ( 1.0 - blobNight ) * 0.6 + 0.4 ) );
}
`,
		} );

		this.material = mat;
		this.mesh = instancedMesh( 'ContactShadows', g, mat, R, {} );
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.renderOrder = - 1;

	}

	begin() {

		this.records.begin();

	}

	// ground slope: dh/dx, dh/dz at the blob (the quad follows it)
	add( x, y, z, radius, height, darkness = 1, sx = 0, sz = 0 ) {

		const o = this.records.push();
		if ( o < 0 ) return;
		const d = this.records.data;
		d[ o ] = x; d[ o + 1 ] = y; d[ o + 2 ] = z; d[ o + 3 ] = radius;
		d[ o + 4 ] = height; d[ o + 5 ] = darkness; d[ o + 6 ] = sx; d[ o + 7 ] = sz;

	}

	commit() {

		this.records.commit();

	}

}
