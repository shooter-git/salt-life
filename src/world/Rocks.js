import * as THREE from '../engine/index.js';
import { Noise2D, mulberry32, smoothstep as sstep } from '../util/Noise.js';
import { WORLD } from './WorldLayout.js';
import { buildRockGeometry, ROCK_STYLES } from './terrain/RockGeometry.js';
import { rot2, srgb, TERRAIN_SHADING_GLSL } from './terrain/TerrainShading.js';

// Fade factor across a distance band [start, end] (0 before, 1 after), for the level that takes over
// at `end` (as materials/LODFade.js bandFade)
function bandFade( dist, start, end ) {

	const t = ( dist - start ) / Math.max( end - start, 1e-6 );
	return t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );

}

// Scattered procedural rocks: boulders and blocks on the rocky shores (some half submerged),
// talus below cliffs, outcrops breaking through the hillsides, rubble around the sea stacks and a
// few decorative rocks where the beach meets the headlands.
//
// Four rock shapes x two LODs = 8 InstancedMeshes (8 draw calls). Instances are re-bucketed into
// near / far meshes and frustum culled on the CPU when the camera moves, so instance indices do
// not persist between frames: motion vectors use the static-world reprojection.
const NEAR_SUBDIV = 3; // 1280 triangles
const FAR_SUBDIV = 2; // 320 triangles
const NEAR_DIST = 60; // m (+ 6 x rock size)
const FAR_DIST = 700; // m (+ 60 x rock size): faded out beyond
const BAND = 0.12; // cross-fade band, share of the switch distance (Bayer screen-door, see LODFade)

export class Rocks {

	// terrain: the Terrain (its maps and detail texture shade the rocks like the ground's rock).
	// castShadow: the near LOD (rocks within ~60-80 m) casts shadow-map shadows; far rocks never do.
	// lite: the low tier's cheaper surface (no triplanar detail).
	constructor( { scene, terrain, village = null, colliders = null, seed = 4242, castShadow = true, lite = false } ) {

		this.scene = scene;
		this.terrain = terrain;
		this.terrainData = terrain.data || terrain; // Terrain instance or TerrainData
		this.lite = lite;
		this.village = village;
		this.group = new THREE.Group();
		this.group.name = 'Rocks';

		const t0 = performance.now();
		this.instances = this._place( mulberry32( seed ) );
		const t1 = performance.now();

		if ( colliders ) {

			for ( const r of this.instances ) {

				// emergent rocks only (submerged ones would snag boats that the eye cannot see)
				const top = r.y + r.size * r.sy * 0.8;
				if ( r.size < 0.9 || top < - 0.3 ) continue;
				colliders.addCylinder( r.x, r.z, r.size * 0.75, r.y - r.size * 0.5, top, { tag: 'rock' } );

			}

		}

		this.material = this._createMaterial();
		this.meshes = [];
		this.buckets = [];
		for ( let s = 0; s < ROCK_STYLES.length; s ++ ) {

			const members = this.instances.filter( ( r ) => r.style === s );
			// (the low tier: one subdivision less, a quarter of the triangles)
			const near = buildRockGeometry( s, 17 + s * 101, NEAR_SUBDIV - ( lite ? 1 : 0 ) );
			const far = buildRockGeometry( s, 17 + s * 101, FAR_SUBDIV - ( lite ? 1 : 0 ) );
			const mk = ( geo, name ) => {

				const g = geo.clone();
				const lod = new THREE.InstancedBufferAttribute( new Float32Array( Math.max( 1, members.length ) * 2 ), 2 );
				lod.setUsage( THREE.DynamicDrawUsage );
				g.setAttribute( 'iLod', lod );
				const m = new THREE.InstancedMesh( g, this.material, Math.max( 1, members.length ) );
				m.name = name;
				m.count = 0;
				m.castShadow = castShadow && name.endsWith( 'near' );
				m.receiveShadow = true;
				m.frustumCulled = false;
				m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
				this.group.add( m );
				this.meshes.push( m );
				return m;

			};

			this.buckets.push( { members, near: mk( near, `rocks-${ ROCK_STYLES[ s ].name }-near` ), far: mk( far, `rocks-${ ROCK_STYLES[ s ].name }-far` ), nearTris: near.index.count / 3, farTris: far.index.count / 3 } );
			// ((M12) the shape as an ellipsoid in its bounds, for the rain's splashes: splashRocks)
			if ( ! far.boundingBox ) far.computeBoundingBox();
			const c = far.boundingBox.getCenter( new THREE.Vector3() ), h = far.boundingBox.getSize( new THREE.Vector3() ).multiplyScalar( 0.5 );
			this._ellipsoids = this._ellipsoids || [];
			this._ellipsoids[ s ] = new THREE.Matrix4().compose( c, new THREE.Quaternion(), h );

		}

		this.timings = { place: t1 - t0, build: performance.now() - t1 };
		this._lastCam = new THREE.Vector3( 1e9, 0, 0 );
		this._frustum = new THREE.Frustum();
		this._m4 = new THREE.Matrix4();
		this._sphere = new THREE.Sphere();
		this._lastQuat = new THREE.Quaternion();
		scene.add( this.group );

	}

	// (M12) the rocks standing out of the sea within r of ( x, z ), nearest first (at most n), for the rain's
	// splashes on them (Rain.setRocks): each one's world -> unit sphere matrix (its shape, as the ellipsoid
	// in its bounds). out: an array of Matrix4s, refilled
	splashRocks( x, z, r, n, out = [] ) {

		out.length = 0;
		const near = this._splash || ( this._splash = [] );
		near.length = 0;
		for ( const k of this.instances ) {

			const d = Math.hypot( k.x - x, k.z - z ) - k.radius;
			if ( d < r && k.y + k.size * k.sy * 0.8 > - 0.3 ) near.push( { k, d } );

		}

		near.sort( ( a, b ) => a.d - b.d );
		for ( let i = 0; i < Math.min( n, near.length ); i ++ ) {

			const k = near[ i ].k;
			if ( ! k.unit ) k.unit = new THREE.Matrix4().multiplyMatrices( k.matrix, this._ellipsoids[ k.style ] ).invert();
			out.push( k.unit );

		}

		return out;

	}

	// ------------------------------------------------------------------ placement

	_place( rand ) {

		const T = this.terrainData;
		const out = [];
		const clusterNoise = new Noise2D( 913 );
		const cell = 2.5;
		const grid = new Map();
		const key = ( i, j ) => i * 73856093 ^ j * 19349663;
		const free = ( x, z, r ) => {

			const i0 = Math.floor( ( x - r - 6 ) / cell ), i1 = Math.floor( ( x + r + 6 ) / cell );
			const j0 = Math.floor( ( z - r - 6 ) / cell ), j1 = Math.floor( ( z + r + 6 ) / cell );
			for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

				const list = grid.get( key( i, j ) );
				if ( ! list ) continue;
				for ( const o of list ) if ( Math.hypot( o.x - x, o.z - z ) < ( o.r + r ) * 0.9 ) return false;

			}

			return true;

		};

		const occupy = ( x, z, r ) => {

			const k = key( Math.floor( x / cell ), Math.floor( z / cell ) );
			let list = grid.get( k );
			if ( ! list ) grid.set( k, list = [] );
			list.push( { x, z, r } );

		};

		const rockAt = ( x, z ) => {

			const fx = ( x - T.origin ) / T.texel - 0.5, fz = ( z - T.origin ) / T.texel - 0.5;
			const i = Math.max( 0, Math.min( T.res - 2, Math.floor( fx ) ) ), j = Math.max( 0, Math.min( T.res - 2, Math.floor( fz ) ) );
			return T.rock[ j * T.res + i ];

		};

		const n = new THREE.Vector3();
		const slopeAt = ( x, z ) => {

			const e = 1.5;
			const hx = T.heightAt( x + e, z ) - T.heightAt( x - e, z ), hz = T.heightAt( x, z + e ) - T.heightAt( x, z - e );
			return Math.hypot( hx, hz ) / ( 2 * e );

		};

		// keep-out zones
		const foot = this.village && this.village.getFootprints ? this.village.getFootprints() : [];
		const pier = WORLD.pier, spawn = WORLD.spawn.position, reef = WORLD.reef;
		const walk = [ [ 55, - 65 ], [ 54.6, - 72 ], [ 52.4, - 82 ], [ 48.4, - 92 ], [ 44.8, - 100.5 ], [ 42.6, - 107.2 ] ];
		const segDist = ( pts, x, z ) => {

			let best = Infinity;
			for ( let k = 0; k < pts.length - 1; k ++ ) {

				const a = pts[ k ], b = pts[ k + 1 ];
				const abx = b[ 0 ] - a[ 0 ], abz = b[ 1 ] - a[ 1 ];
				const t = Math.max( 0, Math.min( 1, ( ( x - a[ 0 ] ) * abx + ( z - a[ 1 ] ) * abz ) / ( abx * abx + abz * abz ) ) );
				best = Math.min( best, Math.hypot( x - a[ 0 ] - abx * t, z - a[ 1 ] - abz * t ) );

			}

			return best;

		};

		const blocked = ( x, z, r, h ) => {

			for ( const f of foot ) if ( Math.hypot( x - f.x, z - f.z ) < f.r + r + 2 ) return true;
			if ( segDist( walk, x, z ) < r + 4 ) return true;
			if ( Math.abs( x - pier.x ) < r + 9 && z > pier.zStart - 8 && z < pier.zEnd + 12 ) return true;
			if ( Math.hypot( x - spawn.x, z - spawn.z ) < r + 10 ) return true;
			if ( Math.hypot( x - reef.center.x, z - reef.center.z ) < reef.radius + r + 12 ) return true;
			if ( T.pathDistance && T.pathDistance( x, z ) < r + 1.5 ) return true;
			// the sandy beach of the bay stays clear above the waterline (a few rocks at its ends)
			if ( x > - 125 && x < 155 && z > - 125 && h > - 1.2 && z < 40 ) return true;
			return false;

		};

		const add = ( x, z, size, style, { sink = 0.3, tilt = 0.25, align = 0.5, tumble = 0 } = {} ) => {

			const h = T.heightAt( x, z );
			if ( blocked( x, z, size, h ) || ! free( x, z, size ) ) return false;
			T.normalAt( x, z, n );
			const st = ROCK_STYLES[ style ].scale;
			const sx = size * ( 0.8 + 0.4 * rand() ), sy = size * ( 0.75 + 0.5 * rand() ), sz = size * ( 0.8 + 0.4 * rand() );
			// sit on the lowest ground under the rock, sunk by a fraction of its height
			let g = h;
			for ( let a = 0; a < 6; a ++ ) g = Math.min( g, T.heightAt( x + Math.cos( a ) * size * 0.7, z + Math.sin( a ) * size * 0.7 ) );
			const y = g - sy * st[ 1 ] * sink;
			// orientation: random yaw, a random tilt, partly following the ground
			const q = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), rand() * Math.PI * 2 );
			const tq = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 0, 1, 0 ).lerp( n, align ).normalize() );
			const tt = rand() < tumble ? 2.2 : tilt; // some boulders rolled over: any face may be up
			const rq = new THREE.Quaternion().setFromEuler( new THREE.Euler( ( rand() - 0.5 ) * tt, 0, ( rand() - 0.5 ) * tt ) );
			q.premultiply( rq ).premultiply( tq );
			const m = new THREE.Matrix4().compose( new THREE.Vector3( x, y, z ), q, new THREE.Vector3( sx, sy, sz ) );
			out.push( { x, y, z, size, sy: sy / size, style, matrix: m, radius: Math.max( sx, sy, sz ) * 1.5 } );
			occupy( x, z, size );
			return true;

		};

		const pick = ( weights ) => {

			let s = 0;
			for ( const w of weights ) s += w;
			let r = rand() * s;
			for ( let i = 0; i < weights.length; i ++ ) {

				r -= weights[ i ];
				if ( r <= 0 ) return i;

			}

			return weights.length - 1;

		};

		// ---- rubble and boulders around the sea stacks
		for ( const s of T.rockSites || [] ) {

			if ( s.kind !== 'stack' ) continue;
			const count = Math.round( 6 + s.r * 1.2 );
			for ( let k = 0; k < count * 3 && k < 80; k ++ ) {

				const a = rand() * Math.PI * 2, d = s.r * ( 0.9 + rand() * 1.4 );
				add( s.x + Math.cos( a ) * d, s.z + Math.sin( a ) * d, 0.8 + rand() * rand() * 3.5, pick( [ 3, 3, 1, 1 ] ), { sink: 0.25, tilt: 0.6, tumble: 0.4 } );

			}

		}

		// ---- grid scan: shore boulders, talus, hillside outcrops, headland scatter
		const step = 2.2;
		for ( let z = - 880; z < 330; z += step ) {

			for ( let x = - 640; x < 640; x += step ) {

				const jx = x + ( rand() - 0.5 ) * step, jz = z + ( rand() - 0.5 ) * step;
				const h = T.heightAt( jx, jz );
				if ( h < - 7 || h > 250 ) continue;
				const r = rockAt( jx, jz );
				const u = rand();

				if ( h < 3.5 ) {

					// rocky shore: boulder fields in the splash zone, partially submerged, in clusters
					// (sparser toward the bay so its ends stay readable)
					if ( r < 0.45 ) continue;
					const cl = sstep( - 0.05, 0.45, clusterNoise.noise( jx / 23, jz / 23 ) );
					const bay = Math.abs( jx - 10 ) < 210 && jz > - 130 && jz < 80 ? 0.35 : 1;
					const p = 0.09 * cl * bay * sstep( 0.45, 0.8, r ) * ( h > - 2.5 ? 1 : 0.35 );
					if ( u > p ) continue;
					const size = 0.6 + rand() * rand() * 3.4;
					add( jx, jz, size, pick( [ 4, 3, 2, 1 ] ), { sink: h < 0 ? 0.2 : 0.22, tilt: 0.7, align: 0.3, tumble: 0.45 } );
					continue;

				}

				const slope = slopeAt( jx, jz );
				if ( r > 0.35 && slope < 0.75 ) {

					// talus / outcrops where bare rock meets gentler ground
					const p = 0.03 * sstep( 0.35, 0.7, r ) * ( 1 - sstep( 0.5, 0.75, slope ) );
					if ( u > p ) continue;
					const big = rand() < 0.25;
					const size = big ? 1.6 + rand() * 3.2 : 0.4 + rand() * rand() * 1.6;
					add( jx, jz, size, pick( big ? [ 1, 3, 2, 1 ] : [ 4, 2, 1, 0.5 ] ), { sink: big ? 0.45 : 0.3, tilt: 0.5, align: big ? 0.8 : 0.4 } );

				} else if ( r < 0.35 && slope > 0.25 && slope < 0.9 && h > 6 ) {

					// occasional outcrops breaking through the vegetated slopes
					if ( u > 0.0016 ) continue;
					const size = 1.5 + rand() * 3.5;
					add( jx, jz, size, pick( [ 1, 2, 3, 0.5 ] ), { sink: 0.55, tilt: 0.3, align: 0.9 } );

				}

			}

		}

		// ---- where the beach meets the headlands: a few boulder groups against the rocky ends,
		// each a big anchor rock with smaller ones tumbled around it
		for ( const side of [ - 1, 1 ] ) {

			const seeds = [];
			for ( let k = 0; k < 400 && seeds.length < 3; k ++ ) {

				const x = side < 0 ? - 195 + rand() * 60 : 145 + rand() * 60;
				const z = - 70 + rand() * 90;
				const h = T.heightAt( x, z );
				if ( h < - 1.5 || h > 2.5 || rockAt( x, z ) < 0.25 ) continue;
				if ( seeds.some( ( q ) => Math.hypot( q[ 0 ] - x, q[ 1 ] - z ) < 14 ) ) continue;
				seeds.push( [ x, z ] );

			}

			for ( const [ cx, cz ] of seeds ) {

				add( cx, cz, 1.8 + rand() * 1.4, pick( [ 3, 2, 1, 0 ] ), { sink: 0.3, tilt: 0.4, align: 0.4, tumble: 0.3 } );
				const n = 3 + Math.floor( rand() * 5 );
				for ( let k = 0; k < n * 3; k ++ ) {

					const a = rand() * Math.PI * 2, d = 2.5 + rand() * 5;
					const x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
					const h = T.heightAt( x, z );
					if ( h < - 2 || h > 3 ) continue;
					add( x, z, 0.4 + rand() * rand() * 1.4, pick( [ 4, 2, 1, 0 ] ), { sink: 0.2, tilt: 0.6, align: 0.4, tumble: 0.5 } );

				}

			}

		}

		// ---- seabed: low algae-covered rocks in the rubble patches (2 - 10 m deep)
		if ( T.rubble ) {

			const res = T.res;
			for ( let z = - 120; z < 360; z += 3 ) for ( let x = - 420; x < 420; x += 3 ) {

				const jx = x + ( rand() - 0.5 ) * 3, jz = z + ( rand() - 0.5 ) * 3;
				const i = Math.floor( jx - T.origin ), j = Math.floor( jz - T.origin );
				if ( i < 0 || j < 0 || i >= res || j >= res ) continue;
				if ( T.rubble[ j * res + i ] < 170 || rand() > 0.12 ) continue;
				const h = T.heightAt( jx, jz );
				if ( h > - 2 || h < - 10 ) continue;
				add( jx, jz, 0.45 + rand() * rand() * 1.1, pick( [ 3, 3, 1, 0 ] ), { sink: 0.4, tilt: 0.5, align: 0.6, tumble: 0.5 } );

			}

		}

		return out;

	}

	// ------------------------------------------------------------------ material

	_createMaterial() {

		const mat = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0 } );
		mat.name = 'Rocks';
		const T = this.terrain;
		if ( ! T || ! T.uniforms ) return mat;
		if ( this.lite ) mat.defines = { ROCKS_LITE: '' };
		const U = T.uniforms;
		const uniforms = {
			terrainHeightMap: U.terrainHeightMap, terrainHeightInfo: U.terrainHeightInfo,
			terrainDetailTex: U.terrainDetailTex, terrainSplatTex: U.terrainSplatTex, terrainMapInfo: U.terrainMapInfo,
		};
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\nattribute vec2 iLod;\nattribute float ao;\nvarying vec2 vLod;\nvarying float vCav;\nvarying vec3 vRockP;\nvarying vec3 vRockN;' )
				.replace( '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	vLod = iLod;
	vCav = ao;
	mat4 rockM = modelMatrix;
#ifdef USE_INSTANCING
	rockM = modelMatrix * instanceMatrix;
#endif
	vRockP = ( rockM * vec4( transformed, 1.0 ) ).xyz;
	vRockN = normalize( mat3( rockM ) * objectNormal );` );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', /* glsl */`#include <common>
uniform highp sampler2D terrainHeightMap;
uniform vec4 terrainHeightInfo;
uniform sampler2D terrainDetailTex;
uniform sampler2D terrainSplatTex;
uniform vec3 terrainMapInfo;
varying vec2 vLod;
varying float vCav;
varying vec3 vRockP;
varying vec3 vRockN;
${ T.heightGlsl.replace( 'uniform highp sampler2D terrainHeightMap;\nuniform vec4 terrainHeightInfo;\n', '' ) }
vec4 terrainSplat( vec2 xz ) { return texture( terrainSplatTex, ( xz - terrainMapInfo.xy ) / terrainMapInfo.z ); }
${ TERRAIN_SHADING_GLSL }
// Bayer 4x4 threshold in (0, 1) (screen-door cross-fade between the levels of detail)
float rockBayer4( vec2 pixel ) {
	ivec2 p = ivec2( pixel ) & 3;
	int x0 = p.x & 1, x1 = p.x >> 1, y0 = p.y & 1, y1 = p.y >> 1;
	int v = ( ( x0 ^ y0 ) << 3 ) | ( y0 << 2 ) | ( ( x1 ^ y1 ) << 1 ) | y1;
	return ( float( v ) + 0.5 ) / 16.0;
}
` )
				.replace( '#include <color_fragment>', /* glsl */`
	// LOD cross-fade: iLod = (fade, outgoing); the incoming level keeps the dither cells below
	// fade, the outgoing one the others
	float lodT = rockBayer4( gl_FragCoord.xy );
	if ( vLod.y > 0.5 ? lodT >= vLod.x : lodT < vLod.x ) discard;
	vec3 p = vRockP;
	vec3 N = normalize( vRockN );
	float mcr = texture( terrainDetailTex, ${ rot2( 'p.xz', 0.9 ) } / 61.0 ).w * 0.6
		+ texture( terrainDetailTex, ${ rot2( 'p.xz', 2.3 ) } / 17.0 ).w * 0.4;
#ifdef ROCKS_LITE
	vec4 dM = texture( terrainDetailTex, ${ rot2( 'p.xz + p.y * 0.7', 1.3 ) } / 6.7 + 0.21 );
	float tone = dM.x * 0.7 + ( mcr - 0.5 ) * 0.8;
	vec3 rockAlbedo = mix( PAL_rockDark, PAL_rockMid, ss( 0.2, 0.6, tone ) );
	rockAlbedo = mix( rockAlbedo, PAL_rockLight, ss( 0.35, 0.95, N.y ) * ss( 1.5, 3.0, p.y ) * 0.3 );
	rockAlbedo *= mix( 1.0, 0.55, ss( 1.0, 0.25, p.y + dM.w * 0.3 ) );
	float rockRough = 0.85, rockHd = dM.x * 0.1, rockHeight = dM.x;
#else
	RockGrad g;
	g.dpdx = dFdx( p ); g.dpdy = dFdy( p ); g.fwY = fwidth( p.y );
	RockSurface R = terrainRockSurface( p, N, p.y, mcr, 0.5, 1.0, g );
	vec3 rockAlbedo = R.albedo;
	float rockRough = R.rough, rockHd = R.hd, rockHeight = R.height;
#endif
	// contact with the ground: sand / soil drifted against the base, darker crevice
	float groundH = terrainHeightAt( p.xz );
	float above = p.y - groundH;
	vec4 sp = terrainSplat( p.xz );
	float contact = ( 1.0 - ss( 0.0, 0.22, above + ( rockHeight - 0.5 ) * 0.15 ) ) * ss( -0.2, 0.3, groundH );
	vec3 drift = mix( ${ srgb( 0.33, 0.27, 0.18 ) }, ${ srgb( 0.8, 0.72, 0.56 ) }, sp.x );
	vec3 rockN = terrainPerturbNormal( p, N, rockHd, 1.0 );
	diffuseColor.rgb = mix( rockAlbedo, drift, contact * 0.8 );
	float rockR = mix( rockRough, 0.9, contact );
	float rockAO = clamp( vCav * ( 1.0 - contact * 0.35 ) * ( ss( 0.0, 0.35, rockHeight ) * 0.35 + 0.65 ), 0.0, 1.0 );
` )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = rockR;' )
				.replace( '#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( rockN, 0.0 ) ).xyz );' )
				.replace( '#include <aomap_fragment>', '\treflectedLight.indirectDiffuse *= rockAO;\n\treflectedLight.indirectSpecular *= rockAO;' );

		};
		return mat;

	}

	// ------------------------------------------------------------------ per frame

	update( camera ) {

		const cam = camera.getWorldPosition( this._tmpV || ( this._tmpV = new THREE.Vector3() ) );
		const moved = cam.distanceToSquared( this._lastCam ) > 1.0 || ! camera.quaternion.equals( this._lastQuat );
		if ( ! moved ) return;
		this._lastCam.copy( cam );
		this._lastQuat.copy( camera.quaternion );
		camera.updateMatrixWorld();
		this._m4.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._m4, camera.coordinateSystem );
		const sph = this._sphere;
		for ( const b of this.buckets ) {

			let nn = 0, nf = 0;
			const nl = b.near.geometry.attributes.iLod, fl = b.far.geometry.attributes.iLod;
			for ( const r of b.members ) {

				sph.center.set( r.x, r.y, r.z );
				sph.radius = r.radius;
				// keep shadow casters just outside the view a little longer
				if ( ! this._frustum.intersectsSphere( sph ) ) {

					sph.radius = r.radius + 12;
					if ( ! this._frustum.intersectsSphere( sph ) ) continue;

				}

				const d = Math.hypot( r.x - cam.x, r.y - cam.y, r.z - cam.z );
				const dn = NEAR_DIST + r.size * 6, df = FAR_DIST + r.size * 60;
				const t = bandFade( d, dn * ( 1 - BAND / 2 ), dn * ( 1 + BAND / 2 ) );
				const out = bandFade( d, df * ( 1 - BAND ), df );
				if ( out >= 1 ) continue;
				if ( t < 1 ) {

					nl.array[ nn * 2 ] = t; nl.array[ nn * 2 + 1 ] = 1;
					b.near.setMatrixAt( nn ++, r.matrix );

				}

				if ( t > 0 ) {

					fl.array[ nf * 2 ] = t * ( 1 - out ); fl.array[ nf * 2 + 1 ] = 0;
					b.far.setMatrixAt( nf ++, r.matrix );

				}

			}

			b.near.count = nn;
			b.far.count = nf;
			for ( const [ a, c ] of [ [ nl, nn ], [ fl, nf ] ] ) {

				a.clearUpdateRanges();
				a.addUpdateRange( 0, Math.max( 1, c ) * 2 );
				a.needsUpdate = true;

			}
			b.near.instanceMatrix.clearUpdateRanges();
			b.near.instanceMatrix.addUpdateRange( 0, nn * 16 );
			b.near.instanceMatrix.needsUpdate = true;
			b.far.instanceMatrix.clearUpdateRanges();
			b.far.instanceMatrix.addUpdateRange( 0, nf * 16 );
			b.far.instanceMatrix.needsUpdate = true;

		}

	}

	stats() {

		let tris = 0, visible = 0;
		for ( const b of this.buckets ) {

			tris += b.near.count * b.nearTris + b.far.count * b.farTris;
			visible += b.near.count + b.far.count;

		}

		return { rocks: this.instances.length, visible, triangles: tris, drawCalls: this.meshes.length, timings: this.timings };

	}

	dispose() {

		for ( const m of this.meshes ) m.geometry.dispose();
		this.material.dispose();
		this.scene.remove( this.group );

	}

}
