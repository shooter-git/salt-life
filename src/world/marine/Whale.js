import * as THREE from '../../engine/index.js';
import { WhaleBrain } from './WhaleBrain.js';
import { UNDERWATER_GLSL, underwaterUniforms } from '../../materials/Underwater.js';

// Humpback whale (Megaptera novaeangliae), ~14.5 m.
//
// Geometry: generated offline (anatomy tables -> parametric lofts), baked to public/models/whale:
// three levels of detail, one draw call each, one shared material.
// Rig: a chain of K spine frames from the snout to the fluke tips plus a joint per flipper,
// posed on the CPU every frame (WhaleBrain: route, surfacing, blows, fluke-up dive) and
// applied in the vertex shader (each vertex follows the frame at its rest axial position).
// Skin: baked albedo + roughness and a relief height map (16 bit in R / G): the relief displaces
// the mesh and bumps the shading; a wet film where it's out of the water; the sea floor's
// caustics and absorption under water (materials/Underwater.js).
//
// (Salt Life) On three's WebGL 2: the WGSL material is a MeshStandardMaterial with the pose,
// relief and skin in onBeforeCompile; the rig arrays are uniforms (vec4 whalePos[ K ],
// whaleRot[ K ], whaleFlip[ 2 ]: no previous pose, as nothing here needs motion vectors). The
// 4096 maps are 2048 (mid, high) and 1024 (low) copies, loaded as ImageBitmaps (the browser
// decodes them, not the script). Tiers: low never draws the nearest level (80k triangles), and
// has neither the relief nor the bump; only high casts a shadow. Spray (the blow, the slaps, water
// off the flukes) waits for fx/Spray.js: `spray` stays null until then.

const K = 40; // spine frames
const LOD_DIST = [ 48, 170 ]; // m: lod0 -> lod1 -> lod2
const MAX_DIST = 1800;
const SPRAY = { DROPLET: 0, MIST: 1, SPRAY: 3 }; // (fx/Spray.js' kinds)
const TIER = {
	low: { minLod: 1, maps: 1024, relief: false, bump: false, shadows: false },
	mid: { minLod: 0, maps: 2048, relief: true, bump: true, shadows: false },
	high: { minLod: 0, maps: 2048, relief: true, bump: true, shadows: true },
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _x = new THREE.Vector3( 1, 0, 0 );
const _t = new THREE.Vector3();

// a baked map as the browser decodes it: no flip, premultiplying or colour conversion (the albedo's
// alpha is its roughness; the height's R and G are one 16-bit number)
async function loadMap( url, srgb ) {

	const loader = new THREE.ImageBitmapLoader().setOptions( { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' } );
	const bitmap = await loader.loadAsync( url );
	const t = new THREE.Texture( bitmap );
	t.flipY = false;
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.anisotropy = 4;
	t.needsUpdate = true;
	return t;

}

export class Whale {

	constructor( { scene, terrain, ground, query = null, spray = null, tier = 'high', url = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/whale/' } ) {

		this.scene = scene;
		this.terrain = terrain;
		this.ground = ground;
		this.query = query;
		this.spray = spray;
		this.url = url;
		this.cfg = TIER[ tier ] || TIER.high;
		this.ready = false;
		this.group = new THREE.Group();
		this.group.name = 'Whale';
		this.brain = new WhaleBrain( { terrain, query } );
		this.frames = null;
		this.meshes = [];
		this.lod = - 1;
		this._blowAcc = 0;
		this._dropAcc = 0;
		this._slaps = 0;

	}

	async load() {

		if ( this._loading ) return this._loading;
		this._loading = ( async () => {

			const [ manifest, bin ] = await Promise.all( [
				fetch( this.url + 'humpback.json' ).then( ( r ) => r.json() ),
				fetch( this.url + 'humpback.bin' ).then( ( r ) => r.arrayBuffer() ),
			] );
			this.manifest = manifest;
			const T = manifest.textures, size = String( this.cfg.maps );
			[ this.albedoTex, this.heightTex ] = await Promise.all( [
				loadMap( this.url + T.albedo.replace( '{size}', size ), true ),
				loadMap( this.url + T.height.replace( '{size}', size ), false ),
			] );

			this._setupRig( manifest );
			this._createMaterials( manifest );
			manifest.levels.forEach( ( lv, i ) => {

				// (levels below the tier's nearest are never drawn: not made)
				if ( i < this.cfg.minLod ) {

					this.meshes.push( null );
					return;

				}

				// (own copies of the level's arrays: the file's buffer goes)
				const geo = new THREE.BufferGeometry();
				geo.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( bin, lv.position, lv.vertices * 3 ).slice(), 3 ) );
				geo.setAttribute( 'normal', new THREE.BufferAttribute( new Int16Array( bin, lv.normal, lv.vertices * 3 ).slice(), 3, true ) );
				geo.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( bin, lv.uv, lv.vertices * 2 ).slice(), 2 ) );
				geo.setAttribute( 'rig', new THREE.BufferAttribute( new Float32Array( bin, lv.rig, lv.vertices * 4 ).slice(), 4 ) );
				geo.setIndex( new THREE.BufferAttribute( new Uint32Array( bin, lv.index, lv.indices ).slice(), 1 ) );
				// posed in world space by the vertex shader: the bounds follow the whale (see update)
				geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 11 );
				geo.boundingBox = new THREE.Box3( new THREE.Vector3( - 11, - 11, - 11 ), new THREE.Vector3( 11, 11, 11 ) );
				const mesh = new THREE.Mesh( geo, this.material );
				mesh.name = 'Whale_' + lv.name;
				mesh.castShadow = this.cfg.shadows;
				mesh.receiveShadow = this.cfg.shadows;
				mesh.customDepthMaterial = this.depthMaterial;
				mesh.visible = false;
				mesh.matrixAutoUpdate = false;
				this.meshes.push( mesh );
				this.group.add( mesh );

			} );

			this.scene.add( this.group );
			this.ready = true;
			this.update( 0, null );

		} )();
		return this._loading;

	}

	// ------------------------------------------------------------------ rig

	_setupRig( m ) {

		const zHead = m.snoutZ + 0.15;
		const zTail = m.notchZ - 1.2; // past the fluke tips
		this.zHead = zHead;
		this.dz = ( zHead - zTail ) / ( K - 1 );
		const cz = m.centerline.z, cy = m.centerline.y; // z descending
		const ycAt = ( z ) => {

			if ( z >= cz[ 0 ] ) return cy[ 0 ];
			for ( let i = 1; i < cz.length; i ++ ) if ( z >= cz[ i ] ) return cy[ i - 1 ] + ( cy[ i ] - cy[ i - 1 ] ) * ( z - cz[ i - 1 ] ) / ( cz[ i ] - cz[ i - 1 ] );
			return cy[ cy.length - 1 ];

		};

		this.rest = [];
		for ( let k = 0; k < K; k ++ ) {

			const z = zHead - k * this.dz;
			this.rest.push( { z, y: ycAt( z ) } );

		}

		this.rootIndex = Math.round( zHead / this.dz ); // frame nearest to z = 0
		this.uPos = { value: new Array( K ).fill( 0 ).map( () => new THREE.Vector4() ) };
		this.uRot = { value: new Array( K ).fill( 0 ).map( () => new THREE.Vector4( 0, 0, 0, 1 ) ) };
		this.uFlip = { value: [ new THREE.Vector4( 1, 0, 0, 0 ), new THREE.Vector4( 1, 0, 0, 0 ) ] };
		this.pos = [];
		this.rot = [];
		for ( let k = 0; k < K; k ++ ) {

			this.pos.push( new THREE.Vector3() );
			this.rot.push( new THREE.Quaternion() );

		}

		this.pecRoot = [ m.pectoral.left.origin, m.pectoral.right.origin ].map( ( o ) => new THREE.Vector3( ...o ) );
		this.pecBasis = [ m.pectoral.left.basis, m.pectoral.right.basis ].map( ( b ) => new THREE.Matrix3().set( b[ 0 ][ 0 ], b[ 0 ][ 1 ], b[ 0 ][ 2 ], b[ 1 ][ 0 ], b[ 1 ][ 1 ], b[ 1 ][ 2 ], b[ 2 ][ 0 ], b[ 2 ][ 1 ], b[ 2 ][ 2 ] ) );
		this.blowLocal = new THREE.Vector3( ...m.blowhole );

	}

	// Pose the spine frames from the brain's state (root pose, path history, stroke, arch).
	_pose() {

		const b = this.brain;
		const rest = this.rest;
		const ri = this.rootIndex;
		const P = this.uPos.value, R = this.uRot.value;
		const Qr = b.quaternion;
		// orientations
		const rots = this.rot;
		for ( let k = 0; k < K; k ++ ) {

			const z = rest[ k ].z;
			const q = rots[ k ];
			if ( z >= 0 ) {

				// head and chest: rigid with the root plus a little recoil against the stroke
				const recoil = - b.strokeAmp * 0.1 * Math.sin( b.strokePhase + 0.6 ) * Math.min( 1, z / 5 );
				q.copy( Qr ).multiply( _q.setFromAxisAngle( _x, recoil + b.headPitch * Math.min( 1, z / 4 ) ) );

			} else {

				const d = - z;
				// follow the path (the body bends along the route: turns, rolling over at the surface)
				b.pathRotation( d, _q2 );
				q.copy( Qr ).slerp( _q2, b.follow );
				// stroke: a travelling wave of pitch, growing toward the flukes
				const L = 9.6;
				const u = Math.min( d / L, 1.15 );
				const env = u * u * 1.1 + 0.05 * u;
				const ph = b.strokePhase - d * 0.52;
				let beta = b.strokeAmp * env * ( Math.sin( ph ) + 0.22 * Math.sin( 2 * ph ) );
				// the flukes lead the tail stock (angle of attack)
				if ( d > 7.6 ) beta += b.strokeAmp * 2.0 * Math.sin( ph + 1.35 ) * Math.min( 1, ( d - 7.6 ) / 1.2 );
				// arch: the back humps (both ends down) when rolling over and before the fluke-up dive
				beta += b.arch * 3.0 * Math.min( d / 6, 1.0 );
				q.multiply( _q.setFromAxisAngle( _x, beta ) );

			}

		}

		// positions: integrate the chain outward from the root
		const pos = this.pos;
		pos[ ri ].copy( b.position ).add( _v.set( 0, rest[ ri ].y, rest[ ri ].z ).applyQuaternion( rots[ ri ] ) );
		for ( let k = ri - 1; k >= 0; k -- ) {

			_q.copy( rots[ k ] ).slerp( rots[ k + 1 ], 0.5 );
			_v.set( 0, rest[ k ].y - rest[ k + 1 ].y, rest[ k ].z - rest[ k + 1 ].z ).applyQuaternion( _q );
			pos[ k ].copy( pos[ k + 1 ] ).add( _v );

		}

		for ( let k = ri + 1; k < K; k ++ ) {

			_q.copy( rots[ k ] ).slerp( rots[ k - 1 ], 0.5 );
			_v.set( 0, rest[ k ].y - rest[ k - 1 ].y, rest[ k ].z - rest[ k - 1 ].z ).applyQuaternion( _q );
			pos[ k ].copy( pos[ k - 1 ] ).add( _v );

		}

		// frame k maps rest point (x, y, z) -> pos_k + rot_k * (x, y - yc_k, z - z_k)
		for ( let k = 0; k < K; k ++ ) {

			P[ k ].set( pos[ k ].x, pos[ k ].y, pos[ k ].z, rest[ k ].y );
			const q = rots[ k ];
			// keep the quaternion hemisphere continuous along the chain (shader nlerp)
			if ( k > 0 && q.x * R[ k - 1 ].x + q.y * R[ k - 1 ].y + q.z * R[ k - 1 ].z + q.w * R[ k - 1 ].w < 0 ) R[ k ].set( - q.x, - q.y, - q.z, - q.w );
			else R[ k ].set( q.x, q.y, q.z, q.w );

		}

		// flippers: axis-angle relative to the bind pose
		const F = this.uFlip.value;
		for ( let s = 0; s < 2; s ++ ) {

			b.flipperRotation( s, _q );
			const ang = 2 * Math.acos( Math.min( 1, Math.abs( _q.w ) ) );
			const sgn = _q.w < 0 ? - 1 : 1;
			const sn = Math.sqrt( Math.max( 1e-12, 1 - _q.w * _q.w ) );
			F[ s ].set( _q.x / sn * sgn, _q.y / sn * sgn, _q.z / sn * sgn, ang );
			if ( ang < 1e-5 ) F[ s ].set( 1, 0, 0, 0 );

		}

	}

	// world position of a rest-frame point (CPU copy of the vertex shader)
	toWorld( local, out ) {

		const fi = THREE.MathUtils.clamp( ( this.zHead - local.z ) / this.dz, 0, K - 1.001 );
		const i = Math.floor( fi ), t = fi - i;
		const r0 = this.rest[ i ], r1 = this.rest[ i + 1 ];
		const yc = r0.y + ( r1.y - r0.y ) * t;
		_q.copy( this.rot[ i ] ).slerp( this.rot[ i + 1 ], t );
		out.set( local.x, local.y - yc, 0 ).applyQuaternion( _q );
		_t.copy( this.pos[ i ] ).lerp( this.pos[ i + 1 ], t );
		return out.add( _t );

	}

	// ------------------------------------------------------------------ per frame

	update( dt, camera ) {

		if ( ! this.ready ) return;
		const b = this.brain;
		b.update( dt );
		this._pose();
		this.uWater.value = b.water;
		this.uWet.value = Math.exp( - b.wetAge / 12 );

		// level of detail and culling (the posed mesh lives in world space: move its bounds)
		let lod = this.cfg.minLod, visible = true;
		if ( camera ) {

			const d = camera.position.distanceTo( b.position );
			const camUnder = camera.position.y < b.water;
			// hysteresis: no popping back and forth at the switch distances
			const cur = this._lod ?? lod;
			const up = ( i ) => LOD_DIST[ i ] * 1.08, dn = ( i ) => LOD_DIST[ i ] * 0.92;
			lod = cur;
			while ( lod < 2 && d > up( lod ) ) lod ++;
			while ( lod > 0 && d < dn( lod - 1 ) ) lod --;
			lod = Math.max( lod, this.cfg.minLod );
			this._lod = lod;
			if ( d > MAX_DIST ) visible = false;
			// lost in the blue: underwater visibility is a few tens of metres
			if ( camUnder && d > 120 ) visible = false;
			// from above the water a deep whale is invisible beyond a short distance
			if ( ! camUnder && b.backDepth > 7 && d > 70 ) visible = false;

		}

		for ( let i = 0; i < this.meshes.length; i ++ ) {

			const m = this.meshes[ i ];
			if ( ! m ) continue;
			m.visible = visible && i === lod;
			m.geometry.boundingSphere.center.copy( b.position );

		}

		this.lod = visible ? lod : - 1;
		if ( dt > 0 ) this._effects( dt );

	}

	// blow spout and water streaming off the flukes (Spray particles)
	_effects( dt ) {

		const b = this.brain, spray = this.spray;
		if ( ! spray ) return;
		// flipper slap: a sheet of spray where the flipper comes down on the water
		if ( b.slaps !== this._slaps ) {

			this._slaps = b.slaps;
			const side = b.slap ? b.slap.side : 0;
			const r = this.pecRoot[ side ];
			const p = this.toWorld( _v.set( r.x + ( side === 0 ? 3.2 : - 3.2 ), r.y, r.z - 1.2 ), _v2 );
			p.y = b.water + 0.1;
			for ( let k = 0; k < 4; k ++ ) {

				const vel = new THREE.Vector3( ( Math.random() - 0.5 ) * 3, 4.5 + Math.random() * 3, ( Math.random() - 0.5 ) * 3 );
				spray.emit( p, vel, 18, 0.25, SPRAY.SPRAY, { spread: 2.4, jitter: 0.6, life: 2.2, sizeJitter: 0.8 } );
				spray.emit( p, vel, 30, 0.022, SPRAY.DROPLET, { spread: 3, jitter: 0.5, life: 2 } );

			}

		}

		if ( b.blow > 0 ) {

			const p = this.toWorld( this.blowLocal, _v2 );
			if ( p.y > b.water - 0.3 ) {

				p.y = Math.max( p.y, b.water ) + 0.15;
				// the column: dense cloud of drops, a haze that drifts downwind, and heavier drops
				const fwd = _v.set( Math.sin( b.yaw ), 0, Math.cos( b.yaw ) );
				const vUp = 7.5 + 2.5 * b.blow;
				const vel = new THREE.Vector3( fwd.x * 0.8, vUp, fwd.z * 0.8 );
				this._blowAcc += dt * 60 * b.blow;
				const n = Math.floor( this._blowAcc );
				this._blowAcc -= n;
				if ( n > 0 ) {

					spray.emit( p, vel, 7 * n, 0.3, SPRAY.SPRAY, { spread: 3.2, jitter: 0.25, life: 2.2, sizeJitter: 0.8 } );
					spray.emit( p, vel.clone().multiplyScalar( 0.75 ), 10 * n, 0.7, SPRAY.MIST, { spread: 2.6, jitter: 0.35, life: 5.5, sizeJitter: 0.6 } );
					spray.emit( p, vel.clone().multiplyScalar( 0.9 ), 12 * n, 0.018, SPRAY.DROPLET, { spread: 3.5, jitter: 0.2, life: 2.2 } );

				}

			}

		}

		// flukes lifting clear: sheets of water pour off the trailing edge
		if ( b.flukeUp > 0.05 ) {

			this._dropAcc += dt * 60;
			const n = Math.floor( this._dropAcc );
			this._dropAcc -= n;
			if ( n > 0 ) {

				const nz = this.manifest.notchZ;
				for ( const x of [ - 1.9, - 1.2, - 0.5, 0.5, 1.2, 1.9 ] ) {

					const zte = nz - 0.1 - 0.35 * ( Math.abs( x ) / 2.2 ) ** 2;
					const p = this.toWorld( _v.set( x, this.rest[ K - 1 ].y, zte ), _v2 );
					if ( p.y < b.water + 0.2 ) continue;
					spray.emit( p, new THREE.Vector3( 0, - 0.5, 0 ), 5 * n, 0.02, SPRAY.DROPLET, { spread: 0.5, jitter: 0.12, life: 1.6 } );

				}

			}

		}

	}

	// ------------------------------------------------------------------ materials

	_createMaterials( m ) {

		const f = ( x ) => {

			const t = String( + x.toFixed( 7 ) );
			return t.includes( '.' ) || t.includes( 'e' ) ? t : t + '.0';

		};

		const C = this.cfg;
		const [ h0, h1 ] = m.textures.heightRange;
		const pl = this.pecRoot[ 0 ], pr = this.pecRoot[ 1 ];
		this.uWater = { value: 0 };
		this.uWet = { value: 0 }; // freshness of the wet film (1 = just surfaced)
		const rig = { whalePos: this.uPos, whaleRot: this.uRot, whaleFlip: this.uFlip, whaleHeightTex: { value: this.heightTex } };

		// pose a rest point (and normal) with this frame's spine
		const RIG_GLSL = /* glsl */`
#define WHALE_K ${ K }
uniform vec4 whalePos[ WHALE_K ];
uniform vec4 whaleRot[ WHALE_K ];
uniform vec4 whaleFlip[ 2 ];
uniform sampler2D whaleHeightTex;
attribute vec4 rig;
vec3 whaleRotateQ( vec4 q, vec3 v ) { return v + cross( q.xyz, cross( q.xyz, v ) + v * q.w ) * 2.0; }
// Rodrigues
vec3 whaleRotAxis( vec3 ax, float ang, vec3 v ) {
	float c = cos( ang ); float s = sin( ang );
	return v * c + cross( ax, v ) * s + ax * ( dot( ax, v ) * ( 1.0 - c ) );
}
void whalePose( vec3 p, vec3 n, vec4 rig, out vec3 world, out vec3 nrm ) {
	float part = rig.y;
	bool isL = part > 0.5 && part < 1.5;
	bool isR = part > 1.5 && part < 2.5;
	vec4 fl = isL ? whaleFlip[ 0 ] : whaleFlip[ 1 ];
	vec3 root = isL ? vec3( ${ f( pl.x ) }, ${ f( pl.y ) }, ${ f( pl.z ) } ) : vec3( ${ f( pr.x ) }, ${ f( pr.y ) }, ${ f( pr.z ) } );
	// flippers flex: the tip turns a little further than the root
	float ang = fl.w * ( rig.z * 0.35 + 0.8 ) * ( isL || isR ? 1.0 : 0.0 );
	vec3 pp = root + whaleRotAxis( fl.xyz, ang, p - root );
	float fi = clamp( ( ${ f( this.zHead ) } - rig.x ) / ${ f( this.dz ) }, 0.0, ${ f( K - 1.001 ) } );
	int i0 = int( floor( fi ) ); float t = fract( fi );
	vec4 P0 = whalePos[ i0 ]; vec4 P1 = whalePos[ i0 + 1 ];
	vec4 q = normalize( mix( whaleRot[ i0 ], whaleRot[ i0 + 1 ], t ) );
	float yc = mix( P0.w, P1.w, t );
	vec3 off = vec3( pp.x, pp.y - yc, pp.z - rig.x );
	world = mix( P0.xyz, P1.xyz, t ) + whaleRotateQ( q, off );
	nrm = whaleRotateQ( q, whaleRotAxis( fl.xyz, ang, n ) );
}
// the rest point with its relief: tubercles, pleats and barnacles displace the mesh
vec3 whaleRest() {
#ifdef WHALE_RELIEF
	vec4 hRel = textureLod( whaleHeightTex, uv, 0.0 );
	return position + normal * ( ( hRel.r * 0.99611 + hRel.g * 0.00389 ) * ${ f( h1 - h0 ) } + ${ f( h0 ) } );
#else
	return position;
#endif
}
`;

		const range = h1 - h0;
		const SKIN_GLSL = /* glsl */`
	float whaleAbove = smoothstep( -0.1, 0.2, vWhaleP.y - whaleWater );
	float whaleFilm = whaleAbove * whaleWet;
	vec4 whaleAlb = texture2D( whaleAlbedoTex, vWhaleUv );
	vec3 whaleN = normalize( vWhaleN );
#ifdef WHALE_BUMP
	{
		// the relief as a bump from three height taps (surface gradient, world space)
		vec2 dux = dFdx( vWhaleUv ); vec2 duy = dFdy( vWhaleUv );
		vec3 dpx = dFdx( vWhaleP ); vec3 dpy = dFdy( vWhaleP );
		vec4 t0 = texture2D( whaleHeightTex, vWhaleUv );
		vec4 t1 = texture2D( whaleHeightTex, vWhaleUv + dux );
		vec4 t2 = texture2D( whaleHeightTex, vWhaleUv + duy );
		float hh0 = ( t0.r * 0.99611 + t0.g * 0.00389 ) * ${ f( range ) };
		float dhx = ( ( t1.r * 0.99611 + t1.g * 0.00389 ) * ${ f( range ) } - hh0 ) * 1.6;
		float dhy = ( ( t2.r * 0.99611 + t2.g * 0.00389 ) * ${ f( range ) } - hh0 ) * 1.6;
		vec3 r1 = cross( dpy, whaleN ); vec3 r2 = cross( whaleN, dpx );
		float det = dot( dpx, r1 );
		vec3 grad = ( r1 * dhx + r2 * dhy ) * sign( det );
		// (a collapsed pixel footprint: no bump, not NaN)
		vec3 bn = abs( det ) * whaleN - grad;
		float b2 = dot( bn, bn );
		if ( b2 > 1e-30 ) whaleN = bn * inversesqrt( b2 );
	}
#endif
	diffuseColor.rgb = uwShade( whaleAlb.rgb, vWhaleP, whaleN );
`;

		const mat = this.material = new THREE.MeshStandardMaterial( { roughness: 0.62, metalness: 0 } );
		mat.name = 'Whale';
		mat.defines = { ...( C.relief ? { WHALE_RELIEF: '' } : {} ), ...( C.bump ? { WHALE_BUMP: '' } : {} ) };
		const uniforms = { ...rig, whaleAlbedoTex: { value: this.albedoTex }, whaleWater: this.uWater, whaleWet: this.uWet, ...underwaterUniforms( this.ground ) };
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + RIG_GLSL + 'varying vec3 vWhaleP;\nvarying vec3 vWhaleN;\nvarying vec2 vWhaleUv;\n' )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	vec3 whaleW; vec3 whaleNrm;
	whalePose( whaleRest(), normal, rig, whaleW, whaleNrm );
	vWhaleP = whaleW; vWhaleN = whaleNrm; vWhaleUv = uv;
	vec3 objectNormal = whaleNrm;` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = whaleW;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + UNDERWATER_GLSL + /* glsl */`
uniform sampler2D whaleAlbedoTex;
uniform sampler2D whaleHeightTex;
uniform float whaleWater;
uniform float whaleWet;
varying vec3 vWhaleP;
varying vec3 vWhaleN;
varying vec2 vWhaleUv;
` )
				.replace( '#include <color_fragment>', '#include <color_fragment>\n' + SKIN_GLSL )
				// matte skin (0.55-0.75) in the water; a thin glossy film only where it is out of the
				// water and freshly wet
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( whaleAlb.a, whaleAlb.a * 0.48, whaleFilm );' )
				.replace( '#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( whaleN, 0.0 ) ).xyz );' )
				// in water the skin's Fresnel reflectance is far weaker than in air (n 1.33 vs 1.0)
				.replace( '#include <aomap_fragment>', '\tfloat whaleSpec = mix( 0.45, 1.0, whaleAbove );\n\treflectedLight.directSpecular *= whaleSpec;\n\treflectedLight.indirectSpecular *= whaleSpec;\n#include <aomap_fragment>' );

		};
		mat.customProgramCacheKey = () => 'whale' + ( C.relief ? 'R' : '' ) + ( C.bump ? 'B' : '' );

		// the shadow pass: the same pose
		const depth = this.depthMaterial = new THREE.MeshDepthMaterial( { depthPacking: THREE.RGBADepthPacking } );
		depth.defines = { ...mat.defines };
		depth.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, rig );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + RIG_GLSL )
				.replace( '#include <begin_vertex>', 'vec3 whaleW; vec3 whaleNrm;\n\twhalePose( whaleRest(), normal, rig, whaleW, whaleNrm );\n\tvec3 transformed = whaleW;' );

		};
		depth.customProgramCacheKey = () => 'whaleDepth' + ( C.relief ? 'R' : '' );

	}

	dispose() {

		for ( const m of this.meshes ) if ( m ) m.geometry.dispose();
		this.material.dispose();
		this.depthMaterial.dispose();
		for ( const t of [ this.albedoTex, this.heightTex ] ) if ( t ) t.dispose();
		this.group.removeFromParent();

	}

}
