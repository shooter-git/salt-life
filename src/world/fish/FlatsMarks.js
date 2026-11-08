import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';

// (M17) What the flats' fish show of themselves besides their bodies (world/Fish.js' sight groups; docs/m17/sight.md),
// each after photographs and video of the real thing:
//   on the bottom, under the water (drawn before the sea, so the sea's own glare is over them as it's over the fish):
//     - a fish's shadow on the sand, thrown by the sun through the water: darker and plainer than the grey fish itself,
//       its outline the fish's from above, crisp in a foot or two of water (Louis Cahill's South Andros bonefish and its
//       shadow; Peter Viau's "spotting shadows");
//     - a mud: a milky cloud of silt where a bonefish has rooted head down in soft bottom, spreading and settling over
//       a minute, a school's puffs running together into a pale band metres across (Florida Sportsman's grass-flat mud);
//   on the water (drawn after the sea):
//     - nervous water: a school cruising just under a calm surface ruffles a patch of it with short wavelets every which
//       way that flicker against the sky's sheen, moving with them; far off and at a low angle, a dulling of the sheen
//       (Deneki's Andros footage);
//     - a wake: a fish pushing water as it bolts, a bulge at its head and a V of ripples spreading back;
//     - a ring: where a tail broke the surface, or a tarpon rolled.
// Two instanced quads, a program each, made the first time a school's within sight of you (nobody else pays for them):
// a mark's place, its yaw and its size in the instance's matrix, and ( kind, strength, age, seed ) beside it.
//   marks.begin()                                             each frame, before the marks
//   marks.shadow( x, y, z, yaw, len, wid, a )                 marks.sign( x, y, z, yaw, len, wid, a, kind )
//   marks.mud( x, y, z, size, a )   marks.ring( x, y, z, size, a )   (each lasts its life of its own)
//   marks.end( dt, camera )                                   ages the lasting ones and draws them all
export const MARK = { shadow: 0, mud: 1, nervous: 2, wake: 3, ring: 4 };
export const MUD_LIFE = 70;
const MAX = { under: 120, surface: 64 };
const MUD = { life: MUD_LIFE, grow: 2.4, settle: 0.5, most: 72 }, RING = { life: 1.6, grow: 2.2 };

const NOISE = /* glsl */`
float fmH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float fmN( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( fmH( i ), fmH( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fmH( i + vec2( 0.0, 1.0 ) ), fmH( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;
const VERT = /* glsl */`
attribute vec4 aInfo;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
	vUv = uv * 2.0 - 1.0;
	vInfo = aInfo;
	gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`;
// on the bottom: kind 0 a shadow (the quad's +y toward the fish's head), 1 a mud
const UNDER = /* glsl */`
uniform vec3 uLight;
varying vec2 vUv;
varying vec4 vInfo;
${ NOISE }
void main() {
	vec2 p = vUv;
	float a = vInfo.y;
	if ( vInfo.x < 0.5 ) {
		// a fish's outline from above, soft-edged: broad at the shoulders, tapering to the tail's root, the tail's fork
		float w = mix( 0.28, 1.0, smoothstep( - 0.85, 0.05, p.y ) ) * ( 1.0 - 0.4 * smoothstep( 0.35, 1.0, p.y ) );
		float d = length( vec2( p.x / max( w, 0.05 ), p.y ) );
		float tail = ( 1.0 - smoothstep( 0.15, 0.35, abs( abs( p.x ) - 0.35 * ( - 0.72 - p.y ) / 0.28 ) ) ) * step( p.y, - 0.72 ) * step( - 1.0, p.y );
		float m = max( 1.0 - smoothstep( 0.78, 1.0, d ), tail * 0.8 );
		gl_FragColor = vec4( vec3( 0.015, 0.035, 0.04 ) * uLight, m * a );
	} else {
		// silt: a lumpy cloud, densest in the middle, its edge broken
		float n = fmN( p * 2.2 + vInfo.w * 17.0 ) * 0.6 + fmN( p * 5.3 - vInfo.w * 9.0 ) * 0.4;
		float r = length( p ) + ( n - 0.5 ) * 0.7;
		float m = ( 1.0 - smoothstep( 0.25, 1.0, r ) ) * ( 0.5 + 0.5 * n );
		gl_FragColor = vec4( vec3( 0.66, 0.63, 0.53 ) * uLight, m * a );
	}
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;
// on the water: 2 nervous water, 3 a wake (+y ahead), 4 a ring (age: 0..1 of its life)
const SURFACE = /* glsl */`
uniform float uTime;
uniform vec3 uSky;
uniform vec3 uDeep;
varying vec2 vUv;
varying vec4 vInfo;
${ NOISE }
void main() {
	vec2 p = vUv;
	float kind = vInfo.x, a = vInfo.y, age = vInfo.z, seed = vInfo.w;
	float crest = 0.0, trough = 0.0, mask = 0.0;
	if ( kind < 2.5 ) {
		mask = 1.0 - smoothstep( 0.35, 1.0, length( p ) + ( fmN( p * 1.6 + seed * 13.0 ) - 0.5 ) * 0.6 );
		// (short wavelets every which way, a hand's breadth or so, shifting: the quad's half-size, age's slot, in metres. Not
		// a lattice of crossed waves, which reads as a pattern: nervous water's a flicker in the sheen, no two alike)
		vec2 q = p * max( age, 1.0 ) * 0.5 * 6.0;
		float w = ( fmN( q + vec2( uTime * 1.3, seed * 7.0 ) ) - 0.5 ) * 1.2 + ( fmN( q * 2.3 - vec2( uTime * 0.9, seed ) ) - 0.5 ) * 0.8;
		// (wavelets finer than a pixel, as they are at a distance and at a low angle, are a dulling of the sheen, not specks:
		// the ruffled water reflecting the sky higher up and letting more of the water's own colour through)
		float detail = 1.0 - smoothstep( 0.35, 1.0, max( length( dFdx( q ) ), length( dFdy( q ) ) ) * 2.3 );
		crest = smoothstep( 0.18, 0.42, w ) * 0.4 * detail;
		trough = max( smoothstep( - 0.18, - 0.42, w ) * 0.4 * detail, 0.2 );
	} else if ( kind < 3.5 ) {
		// the bulge at its head, and the V spreading back from it (Kelvin's 19.5 degrees, in the quad's own units)
		float back = 0.85 - p.y;
		float arm = abs( abs( p.x ) - back * 0.36 );
		float vee = ( 1.0 - smoothstep( 0.0, 0.06 + back * 0.05, arm ) ) * step( 0.0, back ) * ( 1.0 - smoothstep( 0.5, 1.85, back ) );
		float bulge = 1.0 - smoothstep( 0.0, 0.3, length( vec2( p.x * 1.6, p.y - 0.7 ) ) );
		crest = max( vee, bulge * 0.8 );
		trough = ( 1.0 - smoothstep( 0.0, 0.12, abs( abs( p.x ) - back * 0.36 - 0.1 ) ) ) * step( 0.0, back ) * ( 1.0 - smoothstep( 0.4, 1.6, back ) );
		mask = 1.0;
	} else {
		float r = length( p ), R = 0.2 + 0.75 * age;
		crest = 1.0 - smoothstep( 0.0, 0.07, abs( r - R ) );
		trough = 1.0 - smoothstep( 0.0, 0.07, abs( r - R + 0.09 ) );
		mask = 1.0 - age;
	}
	vec3 c = crest > trough ? uSky : uDeep;
	gl_FragColor = vec4( c, max( crest, trough * 0.7 ) * mask * a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3( 0, 1, 0 );

function marksMesh( name, max, fragmentShader, uniforms, order ) {

	const geo = new THREE.PlaneGeometry( 1, 1 );
	geo.rotateX( - Math.PI / 2 );
	const info = new THREE.InstancedBufferAttribute( new Float32Array( max * 4 ), 4 );
	info.setUsage( THREE.DynamicDrawUsage );
	geo.setAttribute( 'aInfo', info );
	const mat = new THREE.ShaderMaterial( { uniforms, vertexShader: VERT, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2 } );
	mat.name = name;
	const mesh = new THREE.InstancedMesh( geo, mat, max );
	mesh.name = name;
	mesh.frustumCulled = false;
	mesh.renderOrder = order;
	mesh.count = 0;
	mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
	return { mesh, info, n: 0, max };

}

export class FlatsMarks {

	constructor( parent ) {

		this.uniforms = { under: { uLight: { value: new THREE.Color() } }, surface: { uTime: { value: 0 }, uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() } } };
		// (before the sea, renderOrder 1: on high its refraction's copy has them; after it, the surface's)
		this.under = marksMesh( 'FlatsUnder', MAX.under, UNDER, this.uniforms.under, 0 );
		this.surface = marksMesh( 'FlatsSurface', MAX.surface, SURFACE, this.uniforms.surface, 2 );
		parent.add( this.under.mesh, this.surface.mesh );
		this.muds = [];
		this.rings = [];

	}

	begin() {

		this.under.n = 0;
		this.surface.n = 0;

	}

	_put( M, x, y, z, yaw, len, wid, kind, a, age, seed ) {

		if ( M.n >= M.max || a <= 0.01 ) return;
		_m.compose( _p.set( x, y, z ), _q.setFromAxisAngle( _y, yaw ), _s.set( wid, 1, len ) );
		M.mesh.setMatrixAt( M.n, _m );
		M.info.setXYZW( M.n, kind, a, age, seed );
		M.n ++;

	}

	// a fish's shadow on the bottom at ( x, y, z ), its head toward yaw (rad, as Fish's: atan2( hx, hz ))
	shadow( x, y, z, yaw, len, wid, a ) {

		this._put( this.under, x, y, z, yaw + Math.PI, len, wid, MARK.shadow, a, 0, 0 );

	}

	// a school's sign on the water (nervous water, or a fish's wake: +y its way); size: nervous water's patch, m (its
	// ripples are laid out in metres, so a big patch isn't a few big swells)
	sign( x, y, z, yaw, len, wid, a, kind = MARK.nervous, seed = 0, size = 0 ) {

		this._put( this.surface, x, y, z, yaw + Math.PI, len, wid, kind, a, size, seed );

	}

	// a puff of silt where a fish rooted (it lasts: MUD; t: how long ago it was stirred up)
	mud( x, y, z, size, a, t = 0 ) {

		if ( this.muds.length >= MUD.most ) this.muds.shift();
		this.muds.push( { x, y, z, size, a, t, seed: Math.random(), yaw: Math.random() * 6.283 } );

	}

	// a ring spreading on the water (it lasts: RING)
	ring( x, y, z, size, a ) {

		if ( this.rings.length >= 24 ) this.rings.shift();
		this.rings.push( { x, y, z, size, a, t: 0 } );

	}

	// the lasting marks aged and put in, and all of them drawn; `seen` ( x, z ) -> 0..1, how plainly a mark there shows
	end( dt, seen = null ) {

		for ( let k = this.muds.length - 1; k >= 0; k -- ) {

			const m = this.muds[ k ];
			m.t += dt;
			if ( m.t > MUD.life ) {

				this.muds.splice( k, 1 );
				continue;

			}

			const u = m.t / MUD.life, s = m.size * ( 0.45 + MUD.grow * Math.sqrt( u ) );
			const a = m.a * Math.min( 1, m.t / 3 ) * ( 1 - u ) ** MUD.settle * ( seen ? seen( m.x, m.z, 'mud' ) : 1 );
			this._put( this.under, m.x, m.y, m.z, m.yaw, s, s, MARK.mud, a, u, m.seed );

		}

		for ( let k = this.rings.length - 1; k >= 0; k -- ) {

			const r = this.rings[ k ];
			r.t += dt;
			if ( r.t > RING.life ) {

				this.rings.splice( k, 1 );
				continue;

			}

			const u = r.t / RING.life, s = r.size * ( 1 + RING.grow * u );
			this._put( this.surface, r.x, r.y, r.z, 0, s, s, MARK.ring, r.a * ( seen ? seen( r.x, r.z, 'tail' ) : 1 ), u, 0 );

		}

		// the light they're in: the sun's on the bottom (a cloud's not in it: the sea's own glare is over them), the sky's;
		// as a lit material's, a Lambertian bottom's radiance being its albedo by the irradiance over pi
		const sun = Math.max( 0, G.sunDir.value.y ), U = this.uniforms;
		U.under.uLight.value.copy( G.sunColor.value ).multiplyScalar( sun ).add( G.skyIrradiance.value ).multiplyScalar( 1 / Math.PI );
		U.surface.uTime.value = G.time.value;
		U.surface.uSky.value.copy( G.horizonColor.value ).multiplyScalar( 1.15 );
		U.surface.uDeep.value.copy( G.skyIrradiance.value ).multiplyScalar( 0.25 );
		for ( const M of [ this.under, this.surface ] ) {

			M.mesh.count = M.n;
			M.mesh.visible = M.n > 0;
			if ( ! M.n ) continue;
			M.mesh.instanceMatrix.needsUpdate = true;
			M.info.needsUpdate = true;

		}

	}

	hide() {

		this.under.mesh.visible = this.surface.mesh.visible = false;

	}

	dispose() {

		for ( const M of [ this.under, this.surface ] ) {

			M.mesh.removeFromParent();
			M.mesh.geometry.dispose();
			M.mesh.material.dispose();

		}

	}

}
