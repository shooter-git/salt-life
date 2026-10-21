import * as THREE from '../../engine/index.js';

// Shared pieces of the wildlife renderers and simulations.

export const TAU = Math.PI * 2;

export const clamp = ( x, a, b ) => x < a ? a : x > b ? b : x;
export const lerp = ( a, b, t ) => a + ( b - a ) * t;
export const smooth = ( a, b, x ) => {

	const t = clamp( ( x - a ) / ( b - a ), 0, 1 );
	return t * t * ( 3 - 2 * t );

};

// shortest signed angle a - b
export const angleDiff = ( a, b ) => {

	let d = ( a - b ) % TAU;
	if ( d > Math.PI ) d -= TAU;
	else if ( d < - Math.PI ) d += TAU;
	return d;

};

// exponential approach factor for a rate (1/s)
export const approach = ( rate, dt ) => 1 - Math.exp( - rate * dt );

// GLSL helpers shared by the wildlife materials (Salt Life: Tidewater's WGSL kitModule): rotate v by
// the unit quaternion q; a smoothstep that allows reversed edges (GLSL's is undefined then, and
// Tidewater's patterns use them); value noise in -1..1 (for MaterialX's mx_noise_float3)
export const KIT_GLSL = /* glsl */`
vec3 rotateQ( vec4 q, vec3 v ) { return v + cross( q.xyz, cross( q.xyz, v ) + v * q.w ) * 2.0; }
float ss( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
float wlHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float wlNoise( vec3 p ) {
	vec3 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	float n = mix( mix( mix( wlHash( i ), wlHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( wlHash( i + vec3( 0, 1, 0 ) ), wlHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( wlHash( i + vec3( 0, 0, 1 ) ), wlHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( wlHash( i + vec3( 0, 1, 1 ) ), wlHash( i + 1.0 ), f.x ), f.y ), f.z );
	return n * 2.0 - 1.0;
}
`;

// GLSL colour literal for an sRGB-ish colour, linearised on the CPU (as the TSL version's srgb())
const glf = ( x ) => {

	const t = String( + x.toFixed( 6 ) );
	return t.includes( '.' ) || t.includes( 'e' ) ? t : t + '.0';

};
export const glslFloat = glf;
export const srgb = ( r, g, b ) => `vec3( ${ glf( Math.pow( r, 2.2 ) ) }, ${ glf( Math.pow( g, 2.2 ) ) }, ${ glf( Math.pow( b, 2.2 ) ) } )`;

// ---------------------------------------------------------------- CPU quaternions (plain arrays)

// q = [ x, y, z, w ]
export function qAxis( out, ax, ay, az, angle ) {

	const s = Math.sin( angle / 2 );
	out[ 0 ] = ax * s; out[ 1 ] = ay * s; out[ 2 ] = az * s; out[ 3 ] = Math.cos( angle / 2 );
	return out;

}

// out = a * b
export function qMul( out, a, b ) {

	const ax = a[ 0 ], ay = a[ 1 ], az = a[ 2 ], aw = a[ 3 ];
	const bx = b[ 0 ], by = b[ 1 ], bz = b[ 2 ], bw = b[ 3 ];
	out[ 0 ] = ax * bw + aw * bx + ay * bz - az * by;
	out[ 1 ] = ay * bw + aw * by + az * bx - ax * bz;
	out[ 2 ] = az * bw + aw * bz + ax * by - ay * bx;
	out[ 3 ] = aw * bw - ax * bx - ay * by - az * bz;
	return out;

}

// rotation from yaw (about y), pitch (about the rotated x: nose up > 0) and roll (about the
// rotated z: right wing down > 0), for a body whose forward axis is +z
const _qa = [ 0, 0, 0, 1 ], _qb = [ 0, 0, 0, 1 ];
export function qYawPitchRoll( out, yaw, pitch, roll ) {

	qAxis( out, 0, 1, 0, yaw );
	qMul( out, out, qAxis( _qa, 1, 0, 0, - pitch ) );
	return qMul( out, out, qAxis( _qb, 0, 0, 1, roll ) );

}

// rotate the vector (x, y, z) by q into out ([ x, y, z ])
export function qRotate( out, q, x, y, z ) {

	const qx = q[ 0 ], qy = q[ 1 ], qz = q[ 2 ], qw = q[ 3 ];
	const tx = 2 * ( qy * z - qz * y ), ty = 2 * ( qz * x - qx * z ), tz = 2 * ( qx * y - qy * x );
	out[ 0 ] = x + qw * tx + qy * tz - qz * ty;
	out[ 1 ] = y + qw * ty + qz * tx - qx * tz;
	out[ 2 ] = z + qw * tz + qx * ty - qy * tx;
	return out;

}

// quaternion that turns the +y axis onto the unit vector n and faces +z along the heading yaw
// (ground-aligned bodies)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function qGround( out, yaw, nx, ny, nz ) {

	_y.set( nx, ny, nz );
	_z.set( Math.sin( yaw ), 0, Math.cos( yaw ) );
	_x.crossVectors( _y, _z ).normalize();
	_z.crossVectors( _x, _y );
	_m.makeBasis( _x, _y, _z );
	_q.setFromRotationMatrix( _m );
	out[ 0 ] = _q.x; out[ 1 ] = _q.y; out[ 2 ] = _q.z; out[ 3 ] = _q.w;
	return out;

}

// ---------------------------------------------------------------- instance records

// (Salt Life) Which instances are worth drawing: those at least minPx across on screen and, when
// inView is set, inside the view. One instanced draw has no per-instance culling, and every
// bird or crab costs 500-600 triangles wherever it is. (No view test for what casts shadows: from
// off screen they can fall into view.)
//   cull.set( camera, heightPx, minPx );  if ( cull.keep( x, y, z, r, inView ) ) ...
const _m4 = new THREE.Matrix4(), _sphere = new THREE.Sphere();
export class ViewCull {

	constructor() {

		this.frustum = new THREE.Frustum();
		this.x = 0; this.y = 0; this.z = 0;
		this.k2 = 0; // ( pixels per radian / minPx )^2
		this.on = false;

	}

	set( camera, heightPx, minPx = 1 ) {

		camera.updateMatrixWorld();
		_m4.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this.frustum.setFromProjectionMatrix( _m4 );
		const e = camera.matrixWorld.elements;
		this.x = e[ 12 ]; this.y = e[ 13 ]; this.z = e[ 14 ];
		this.k = heightPx / ( 2 * Math.tan( camera.fov * Math.PI / 360 ) ); // pixels per radian
		this.k2 = ( this.k / minPx ) * ( this.k / minPx );
		this.on = heightPx > 0;

	}

	// about how many pixels the radius r (m) at x, y, z spans on screen
	pixels( x, y, z, r ) {

		if ( ! this.on ) return Infinity;
		return r * this.k / Math.max( Math.hypot( x - this.x, y - this.y, z - this.z ), 1e-3 );

	}

	// r: the bounding radius (m)
	keep( x, y, z, r, inView = true ) {

		if ( ! this.on ) return true;
		const dx = x - this.x, dy = y - this.y, dz = z - this.z;
		if ( r * r * this.k2 < dx * dx + dy * dy + dz * dz ) return false;
		if ( ! inView ) return true;
		_sphere.center.set( x, y, z );
		_sphere.radius = r * 1.25 + 0.3; // (a margin for the camera turning before the next frame)
		return this.frustum.intersectsSphere( _sphere );

	}

}

// Per-instance data of an instanced template: `stride` vec4 per instance, written on the CPU every
// frame. (Salt Life: in a float texture, one row per instance, read in the vertex shader with
// texelFetch; Tidewater used a storage buffer.)
export class InstanceRecords {

	constructor( name, max, stride ) {

		this.max = max;
		this.stride = stride;
		this.name = name;
		this.data = new Float32Array( max * stride * 4 );
		const t = this.texture = new THREE.DataTexture( this.data, stride, max, THREE.RGBAFormat, THREE.FloatType );
		t.minFilter = t.magFilter = THREE.NearestFilter;
		t.generateMipmaps = false;
		t.needsUpdate = true;
		this.count = 0;
		this.geometry = null; // its draw count follows ours (instancedMesh)
		// (Salt Life) a second set of records filled from the end (pushBack): back records in rows
		// max - back .. max - 1, drawn by backGeometry
		this.back = 0;
		this.backGeometry = null;

	}

	// GLSL expression: the k-th vec4 of the current instance (the material binds `name` as a sampler2D)
	field( k ) {

		return `texelFetch( ${ this.name }, ivec2( ${ k }, gl_InstanceID ), 0 )`;

	}

	begin() {

		this.count = 0;
		this.back = 0;

	}

	// float offset of a new record (or -1 when full)
	push() {

		if ( this.count + this.back >= this.max ) return - 1;
		return ( this.count ++ ) * this.stride * 4;

	}

	// float offset of a new record at the end (or -1 when full)
	pushBack() {

		if ( this.count + this.back >= this.max ) return - 1;
		return ( this.max - 1 - this.back ++ ) * this.stride * 4;

	}

	commit() {

		if ( this.count > 0 || this.back > 0 ) this.texture.needsUpdate = true;
		if ( this.geometry ) this.geometry.instanceCount = this.count;
		if ( this.backGeometry ) this.backGeometry.instanceCount = this.back;

	}

}

// Instanced mesh drawing `records.count` instances of a template (whose vertex shader places them).
export function instancedMesh( name, geometry, material, records, { castShadow = false } = {} ) {

	const g = new THREE.InstancedBufferGeometry();
	g.index = geometry.index;
	for ( const k in geometry.attributes ) g.setAttribute( k, geometry.attributes[ k ] );
	g.instanceCount = 0;
	g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
	records.geometry = g;
	const mesh = new THREE.Mesh( g, material );
	mesh.name = name;
	mesh.frustumCulled = false;
	mesh.matrixAutoUpdate = false;
	mesh.castShadow = castShadow;
	mesh.receiveShadow = true;
	return mesh;

}
