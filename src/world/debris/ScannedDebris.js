import * as THREE from '../../engine/index.js';
import { LOD_FADE_GLSL, bandFade } from '../../materials/LODFade.js';
import { srgb } from '../terrain/TerrainShading.js';

// Photoscanned debris (CC0, Poly Haven; see credits/debris.md): dead wood (logs,
// branches) and conch shells, instanced with three LODs.
//
// (Salt Life) One InstancedMesh per asset and level (Tidewater merged the four assets into one mesh
// per level, every instance drawing all of them with the others collapsed: 10k triangles a log
// far away). The .glb files load through the SDK's glTF loader (All the Spaces compresses them);
// each asset has its own textures (albedo, normal, AO-rough-metal) at 1K on high, 512 on mid,
// and on low only the albedo at 512. Low and mid don't use LOD0 (4k triangles a log) and cast no
// shadows.
// Instances are re-bucketed into the LODs (and distance culled) on the CPU when the camera moves.

import { SCAN_ASSETS, SCAN_SIZE } from './ScanAssets.js';
export { SCAN_ASSETS, SCAN, SCAN_SIZE } from './ScanAssets.js';
const LOD_DIST = { low: [ 0, 25, 90 ], mid: [ 0, 45, 140 ], high: [ 22, 70, 260 ] }; // m (+ 6 x instance size): LOD0 | LOD1 | LOD2 | faded out
const TEX = { low: 512, mid: 512, high: 1024 };
const BAND = 0.12; // cross-fade band (Bayer screen-door, see LODFade), share of the switch distance
const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/debris/';

// a JPEG at size x size (row 0 the top of the image, as glTF's uvs expect)
async function loadImage( url, size ) {

	const res = await fetch( url );
	if ( ! res.ok ) throw new Error( 'ScannedDebris: ' + url + ' ' + res.status );
	return createImageBitmap( await res.blob(), { resizeWidth: size, resizeHeight: size, resizeQuality: 'high', imageOrientation: 'none' } );

}

export class ScannedDebris {

	// instances: [ { asset, x, y, z, yaw, pitch, roll, sx, sy, sz, rnd } ]; ground: the Terrain (its
	// height lookup); loader: a glTF loader (loadAsync); tier: 'low' | 'mid' | 'high'. Nothing loads
	// before load(); show: false to draw them only after show()
	constructor( { ground, instances, parent, loader, tier = 'high', castShadow = tier === 'high', show = true } ) {

		this.ground = ground;
		this.instances = instances;
		this.parent = parent;
		this.tier = tier;
		this.lite = tier === 'low';
		this.lodDist = LOD_DIST[ tier ] || LOD_DIST.high;
		this.castShadow = castShadow;
		this.meshes = [];
		this.ready = false;
		this._show = show;
		this._lastCam = new THREE.Vector3( 1e9, 0, 0 );
		this._lastQuat = new THREE.Quaternion();
		this._frustum = new THREE.Frustum();
		this._m4 = new THREE.Matrix4();
		this._sphere = new THREE.Sphere();
		this._v = new THREE.Vector3();
		for ( const r of instances ) {

			const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( r.roll || 0, r.yaw, r.pitch || 0, 'YXZ' ) );
			r.matrix = new THREE.Matrix4().compose( new THREE.Vector3( r.x, r.y, r.z ), q, new THREE.Vector3( r.sx, r.sy, r.sz ) );
			const s = SCAN_SIZE[ r.asset ];
			r.radius = Math.hypot( s[ 0 ] * r.sx, s[ 1 ] * r.sy, s[ 2 ] * r.sz ) / 2;

		}

		this.loader = loader;
		this.promise = null;

	}

	// loads the models and textures (once): a promise
	load() {

		if ( ! this.promise ) this.promise = this.loader && this.instances.length ? this._load( this.loader ) : Promise.resolve();
		return this.promise;

	}

	async _load( loader ) {

		const t0 = performance.now();
		const size = TEX[ this.tier ] || 1024;
		const maps = this.lite ? [ 'albedo' ] : [ 'albedo', 'normal', 'arm' ];
		const [ gltfs, images ] = await Promise.all( [
			Promise.all( SCAN_ASSETS.map( ( id ) => loader.loadAsync( BASE + id + '.glb' ) ) ),
			Promise.all( SCAN_ASSETS.map( ( id ) => Promise.all( maps.map( ( m ) => loadImage( BASE + id + '_' + m + '.jpg', size ) ) ) ) ),
		] );

		this.textures = [];
		const counts = SCAN_ASSETS.map( () => 0 );
		for ( const r of this.instances ) counts[ r.asset ] ++;
		this.levels = [ [], [], [] ];
		SCAN_ASSETS.forEach( ( id, k ) => {

			const tex = images[ k ].map( ( img, i ) => {

				const t = new THREE.Texture( img );
				t.flipY = false;
				t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
				t.anisotropy = 4;
				if ( maps[ i ] === 'albedo' ) t.colorSpace = THREE.SRGBColorSpace;
				t.needsUpdate = true;
				this.textures.push( t );
				return t;

			} );
			const material = this._createMaterial( tex[ 0 ], tex[ 1 ], tex[ 2 ] );
			if ( ! counts[ k ] ) return;
			const lods = this._lods( gltfs[ k ] );
			for ( let l = 0; l < 3; l ++ ) {

				if ( this.lodDist[ 0 ] === 0 && l === 0 ) continue;
				const geo = lods[ l ];
				if ( ! geo ) continue;
				const iData = new THREE.InstancedBufferAttribute( new Float32Array( counts[ k ] * 4 ), 4 );
				iData.setUsage( THREE.DynamicDrawUsage );
				geo.setAttribute( 'iData', iData );
				const mesh = new THREE.InstancedMesh( geo, material, counts[ k ] );
				mesh.name = 'debris-scan-' + id + '-lod' + l;
				mesh.count = 0;
				mesh.castShadow = this.castShadow && l === 0;
				mesh.receiveShadow = true;
				mesh.frustumCulled = false;
				mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
				this.parent.add( mesh );
				this.meshes.push( mesh );
				this.levels[ l ][ k ] = { mesh, iData, tris: geo.index.count / 3, count: 0 };

			}

		} );
		for ( const g of gltfs ) g.scene.traverse( ( o ) => o.geometry && o.geometry.dispose() );
		this.loadMs = performance.now() - t0;
		if ( this._show ) this.show();

	}

	show() {

		this.ready = true;
		this._lastCam.set( 1e9, 0, 0 );

	}

	// the levels of an asset as plain float geometry in the asset's frame (nodes LOD0..LOD2; the
	// loader's copies may be quantized, with the scale in the node: positions are taken through
	// the node's matrix into new arrays)
	_lods( gltf ) {

		gltf.scene.updateMatrixWorld( true );
		const found = [];
		gltf.scene.traverse( ( o ) => {

			if ( o.isMesh ) found.push( o );

		} );
		const byName = ( l ) => found.find( ( o ) => o.name.startsWith( 'LOD' + l ) || ( o.parent && o.parent.name.startsWith( 'LOD' + l ) ) );
		// (if the names are gone: the most detailed first)
		const tri = ( o ) => o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
		const sorted = [ ...found ].sort( ( a, b ) => tri( b ) - tri( a ) );
		return [ 0, 1, 2 ].map( ( l ) => {

			const o = byName( l ) || sorted[ l ];
			if ( ! o ) return null;
			const src = o.geometry, P = src.attributes.position, N = src.attributes.normal, U = src.attributes.uv;
			const n = P.count, pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 ), uv = new Float32Array( n * 2 );
			const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix( o.matrixWorld );
			for ( let i = 0; i < n; i ++ ) {

				v.fromBufferAttribute( P, i ).applyMatrix4( o.matrixWorld );
				pos[ i * 3 ] = v.x; pos[ i * 3 + 1 ] = v.y; pos[ i * 3 + 2 ] = v.z;
				v.fromBufferAttribute( N, i ).applyMatrix3( nm ).normalize();
				nor[ i * 3 ] = v.x; nor[ i * 3 + 1 ] = v.y; nor[ i * 3 + 2 ] = v.z;
				uv[ i * 2 ] = Math.min( 0.998, Math.max( 0.002, U.getX( i ) ) );
				uv[ i * 2 + 1 ] = Math.min( 0.998, Math.max( 0.002, U.getY( i ) ) );

			}

			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
			g.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
			g.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
			const I = src.index;
			const idx = n > 65535 ? new Uint32Array( I.count ) : new Uint16Array( I.count );
			for ( let i = 0; i < I.count; i ++ ) idx[ i ] = I.getX( i );
			g.setIndex( new THREE.BufferAttribute( idx, 1 ) );
			return g;

		} );

	}

	// one program for every asset (each with its own textures)
	_createMaterial( albedo, normal, arm ) {

		const mat = new THREE.MeshStandardMaterial( { map: albedo, roughness: this.lite ? 0.8 : 1, metalness: 0 } );
		if ( ! this.lite ) {

			mat.normalMap = normal;
			mat.roughnessMap = arm;
			mat.aoMap = arm;

		}

		mat.name = 'DebrisScanned';
		const U = this.ground.uniforms;
		const uniforms = { terrainHeightMap: U.terrainHeightMap, terrainHeightInfo: U.terrainHeightInfo };
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\nattribute vec4 iData;\nvarying vec4 vIData;\nvarying vec3 vScanP;' )
				.replace( '#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvIData = iData;\n\tvScanP = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', `#include <common>\nvarying vec4 vIData;\nvarying vec3 vScanP;\n${ this.ground.heightGlsl }\n${ LOD_FADE_GLSL }` )
				.replace( '#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( ! lodFadeVisible( gl_FragCoord.xy, vIData.z, vIData.w > 0.5 ) ) discard;' )
				.replace( '#include <map_fragment>', /* glsl */`#include <map_fragment>
	float rnd = vIData.y;
	bool isWood = vIData.x < 2.5;
	vec3 p = vScanP;
	vec3 c = diffuseColor.rgb;
	// driftwood: sun-bleached toward silver-grey, per instance
	vec3 grey = vec3( luminance( c ) ) * vec3( 1.04, 1.02, 0.98 ) * 1.12;
	c = mix( c, grey, isWood ? rnd * 0.4 + 0.45 : 0.0 );
	// ground contact: dusted with sand and darker where it touches / is buried
	float ground = terrainHeightAt( p.xz );
	float contact = 1.0 - smoothstep( 0.0, 0.1, p.y - ground );
	float sandy = smoothstep( 0.6, 1.6, ground );
	c = mix( c, ${ srgb( 0.8, 0.72, 0.58 ) }, contact * sandy * 0.45 );
	// wet below the swash line: darker (and glossier, see roughness)
	float wet = 1.0 - smoothstep( 0.4, 1.1, p.y );
	c = c * ( 1.0 - wet * 0.45 );
	diffuseColor.rgb = c;
	float scanAO = 1.0 - ( 1.0 - smoothstep( 0.0, 0.12, p.y - ground ) ) * 0.4;` )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( max( roughnessFactor, 0.35 ), 0.22, wet * 0.85 );' )
				.replace( '#include <aomap_fragment>', '#include <aomap_fragment>\n\treflectedLight.indirectDiffuse *= scanAO;\n\treflectedLight.indirectSpecular *= scanAO;' );

		};
		mat.customProgramCacheKey = () => 'debrisScanned' + ( this.lite ? 'Lite' : '' );
		return mat;

	}

	// LOD buckets + frustum / distance culling (only when the camera moved)
	update( camera ) {

		if ( ! this.ready ) return;
		const cam = camera.getWorldPosition( this._v );
		if ( cam.distanceToSquared( this._lastCam ) < 0.25 && camera.quaternion.equals( this._lastQuat ) ) return;
		this._lastCam.copy( cam );
		this._lastQuat.copy( camera.quaternion );
		camera.updateMatrixWorld();
		this._m4.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._m4, camera.coordinateSystem );
		for ( const L of this.levels ) for ( const A of L ) if ( A ) A.count = 0;
		const [ a, b, c ] = this.lodDist;
		for ( const r of this.instances ) {

			this._sphere.center.set( r.x, r.y, r.z );
			this._sphere.radius = r.radius + ( this.castShadow ? 6 : 0.5 ); // shadow casters just outside the view
			if ( ! this._frustum.intersectsSphere( this._sphere ) ) continue;
			const d = Math.hypot( r.x - cam.x, r.y - cam.y, r.z - cam.z ) - r.radius * 6;
			const t01 = a > 0 ? bandFade( d, a * ( 1 - BAND / 2 ), a * ( 1 + BAND / 2 ) ) : 1;
			const t12 = bandFade( d, b * ( 1 - BAND / 2 ), b * ( 1 + BAND / 2 ) );
			const out = bandFade( d, c * ( 1 - BAND ), c );
			if ( out >= 1 ) continue;
			// ( level, fade, outgoing ): an instance is in two levels only inside a band
			if ( t01 < 1 ) this._put( 0, r, t01, 1 );
			if ( t01 > 0 && t12 < 1 ) this._put( 1, r, t12 > 0 ? t12 : t01, t12 > 0 ? 1 : 0 );
			if ( t12 > 0 ) this._put( 2, r, t12 * ( 1 - out ), 0 );

		}

		for ( const L of this.levels ) for ( const A of L ) {

			if ( ! A ) continue;
			A.mesh.count = A.count;
			A.mesh.visible = A.count > 0;
			A.mesh.instanceMatrix.clearUpdateRanges();
			A.mesh.instanceMatrix.addUpdateRange( 0, Math.max( 1, A.count ) * 16 );
			A.mesh.instanceMatrix.needsUpdate = true;
			A.iData.clearUpdateRanges();
			A.iData.addUpdateRange( 0, Math.max( 1, A.count ) * 4 );
			A.iData.needsUpdate = true;

		}

	}

	_put( l, r, fade, outgoing ) {

		const A = this.levels[ l ][ r.asset ];
		if ( ! A ) return;
		const i = A.count ++;
		A.mesh.setMatrixAt( i, r.matrix );
		A.iData.array.set( [ r.asset, r.rnd, fade, outgoing ], i * 4 );

	}

	get triangles() {

		if ( ! this.ready ) return 0;
		let n = 0;
		for ( const L of this.levels ) for ( const A of L ) if ( A ) n += A.mesh.count * A.tris;
		return n;

	}

	dispose() {

		for ( const m of this.meshes ) {

			m.geometry.dispose();
			this.parent.remove( m );

		}

		for ( const m of new Set( this.meshes.map( ( m ) => m.material ) ) ) m.dispose();
		if ( this.textures ) for ( const t of this.textures ) t.dispose();

	}

}
