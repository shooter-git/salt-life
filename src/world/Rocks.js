import * as THREE from '../engine/index.js';
import { Noise2D, mulberry32, smoothstep as sstep } from '../util/Noise.js';
import { WORLD } from './WorldLayout.js';
import { buildRockGeometry, ROCK_STYLES } from './terrain/RockGeometry.js';
import { OVERHANGS, SEA_CAVE_SITES, buildOverhang, overhangBuild, overhangColliders, clears, caveRoof, caveRoofAt } from './terrain/Overhangs.js';
import { rot2, srgb, TERRAIN_SHADING_GLSL } from './terrain/TerrainShading.js';
import { caveLightTexture, caveOpenness, seaCaveUniforms } from './terrain/CaveLight.js';
import { carveAt } from './terrain/SeaCaves.js';
import { trailClears } from './terrain/NorthTrail.js';

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
const RAIN_REACHES = - 3; // m: (M14) the rocks topping out above this are those the rain may fall on (its tide at its lowest, and more)
// ((M14) the overhangs' grids: near (the low tier's coarser) and far, m)
const SHAPE_NEAR = 300; // (M15) m
const OVERHANG_CELL = { near: 0.25, lite: 0.3, far: 0.5 };
// ((M15) a sea cave's sheltered faces: the sky's light on them this many times the world's (as the wreck's FILL);
// the sun's thrown in off the sea and the rock, with what its walls throw on again)
const CAVE_FILL = 10, CAVE_BOUNCE = 3.0;
// ((M14) their fine shapes made a slice at a time: at most this long (ms) after each frame drawn, out of the
// way of the next (with no frames, as under Node, the next task's)
const SLICE_MS = 6;
const afterFrame = () => new Promise( ( resolve ) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame( () => setTimeout( resolve, 0 ) ) : setTimeout( resolve, 0 ) );

export class Rocks {

	// terrain: the Terrain (its maps and detail texture shade the rocks like the ground's rock).
	// castShadow: the near LOD (rocks within ~60-80 m) casts shadow-map shadows; far rocks never do.
	// lite: the low tier's cheaper surface (no triplanar detail).
	// lazyCaves: (M15) the low tier: the overhangs' and the sea caves' near shapes (and the caves' light) made only once
	// you're near one (overhangsNear): the caves are on the far side of the island from where you start, some 20 MB of
	// the 150 of script memory it's allowed, and more while they're made.
	// coarseCaves: (M15) a device that draws on its CPU: their far shapes twice as coarse too, an eighth of the
	// cells to make in the load.
	constructor( { scene, terrain, village = null, colliders = null, seed = 4242, castShadow = true, lite = false, lazyCaves = false, coarseCaves = false } ) {

		this.scene = scene;
		this.terrain = terrain;
		this.terrainData = terrain.data || terrain; // Terrain instance or TerrainData
		this.lite = lite;
		this.village = village;
		this.group = new THREE.Group();
		this.group.name = 'Rocks';

		const t0 = performance.now();
		this.instances = this._place( mulberry32( seed ) );
		// ((M15) placed on the ground as it was (TerrainData.uncut): each back on it where it's been raised or cut,
		// the north beach's berm)
		if ( this.terrainData.raisedAt ) for ( const r of this.instances ) {

			const dy = this.terrainData.raisedAt( r.x, r.z );
			if ( Math.abs( dy ) < 0.01 ) continue;
			r.y += dy;
			r.matrix.elements[ 13 ] += dy;

		}
		// ((M14) and the overhangs to shelter under, placed by hand (terrain/Overhangs.js): made coarse now
		// (their far shape, and from it what's in the way of standing under them), their near shape after the
		// start (refineOverhangs); the scattered rocks where they stand taken away, the rest as they were)
		this.overhangs = [ ...OVERHANGS, ...SEA_CAVE_SITES ].map( ( site ) => buildOverhang( site, this.terrainData, site.kind === 'seacave' ? { cell: OVERHANG_CELL.far * ( coarseCaves ? 2 : 1 ), lightLater: lazyCaves } : { cell: OVERHANG_CELL.far } ) );
		this.lazyCaves = lazyCaves;
		this.instances = this.instances.filter( ( r ) => ! this.overhangs.some( ( o ) => this._crowds( o, r ) ) );
		// ((M15) nor on the way over to the north beach: terrain/NorthTrail.js)
		this.instances = this.instances.filter( ( r ) => ! trailClears( r.x, r.z, r.size * 0.5 ) );
		const t1 = performance.now();

		if ( colliders ) {

			for ( const r of this.instances ) {

				// emergent rocks only (submerged ones would snag boats that the eye cannot see)
				const top = r.y + r.size * r.sy * 0.8;
				if ( r.size < 0.9 || top < - 0.3 ) continue;
				colliders.addCylinder( r.x, r.z, r.size * 0.75, r.y - r.size * 0.5, top, { tag: 'rock' } );

			}

			// ((M14) the overhangs: what's in the way of standing under them, not their roofs)
			for ( const o of this.overhangs ) for ( const b of overhangColliders( o ) ) colliders.addBox( b.center, b.half, b.rotY, { tag: 'rock' } );

		}

		this.material = this._createMaterial();
		this.meshes = [];
		this.buckets = [];
		const mk = ( geo, name, members ) => {

			const g = geo.clone();
			// ((M14) an overhang's flows, for its shading; the other rocks have none)
			if ( ! g.attributes.flow ) g.setAttribute( 'flow', new THREE.BufferAttribute( new Float32Array( g.attributes.position.count * 2 ), 2 ) );
			// ((M15) a sea cave's light (CaveLight.js); the other rocks: the open sky's, no cave)
			if ( ! g.attributes.sea ) g.setAttribute( 'sea', new THREE.BufferAttribute( new Float32Array( g.attributes.position.count * 4 ).map( ( _, i ) => i % 4 ? 0 : 1 ), 4 ) );
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
		const bucket = this._bucket = ( members, near, far, name ) => this.buckets.push( { members, near: mk( near, `${ name }-near`, members ), far: mk( far, `${ name }-far`, members ), nearTris: near.index.count / 3, farTris: far.index.count / 3 } );
		for ( let s = 0; s < ROCK_STYLES.length; s ++ ) {

			// (the low tier: one subdivision less, a quarter of the triangles)
			const near = buildRockGeometry( s, 17 + s * 101, NEAR_SUBDIV - ( lite ? 1 : 0 ) );
			const far = buildRockGeometry( s, 17 + s * 101, FAR_SUBDIV - ( lite ? 1 : 0 ) );
			bucket( this.instances.filter( ( r ) => r.style === s ), near, far, `rocks-${ ROCK_STYLES[ s ].name }` );

		}

		// ((M14) each overhang a bucket of its own: its own shape, near (its far one until it's refined) and
		// far, one of it; among the rocks for the rest (the rain's rock cover, the debris kept off it))
		this.overhangs.forEach( ( o, k ) => {

			const r = { x: o.x, y: o.y, z: o.z, size: 4, sy: ( o.top - o.y ) / 4, style: ROCK_STYLES.length + k, matrix: o.matrix, radius: o.radius, overhang: o.site.kind };
			this.instances.push( r );
			bucket( [ r ], o.geometry, o.geometry, `rocks-overhang-${ o.site.kind }` );

		} );
		this._nearCell = lite ? OVERHANG_CELL.lite : OVERHANG_CELL.near;
		// ((M15) the sea caves' light on the sea and the ground in them, for the water's and the terrain's shaders)
		this._caveLight();

		this.timings = { place: t1 - t0, build: performance.now() - t1 };
		this._lastCam = new THREE.Vector3( 1e9, 0, 0 );
		this._frustum = new THREE.Frustum();
		this._m4 = new THREE.Matrix4();
		this._sphere = new THREE.Sphere();
		this._lastQuat = new THREE.Quaternion();
		scene.add( this.group );

	}

	// (M15) a cave's place on the map's strip is its own, whether its light's been worked out yet or not
	_caveLight() {

		seaCaveUniforms.seaCaveLight.value = caveLightTexture( this.overhangs.filter( ( o ) => o.site.kind === 'seacave' ).map( ( o ) => o.waterLight || null ) );

	}

	// (M14) the overhangs' near shapes, finer than their far ones, made one at a time and put in for the far
	// ones: each a slice at a time, at most `budget` ms of it after each frame drawn (slice(): a promise of
	// then), 150 to 390 ms of slices each on a laptop
	async refineOverhangs( { slice = afterFrame, budget = SLICE_MS } = {} ) {

		for ( let k = 0; k < this.overhangs.length; k ++ ) {

			const o = this.overhangs[ k ];
			if ( o.fine || ( this.lazyCaves && ! o.wanted ) ) continue;
			const build = overhangBuild( o.site, this.terrainData, { cell: this._nearCell, light: o.light } );
			let r, t = - Infinity;
			for ( ;; ) {

				if ( performance.now() - t > budget ) {

					await slice();
					t = performance.now();

				}

				if ( ( r = build.next() ).done ) break;

			}

			const fine = o.fine = r.value;
			// ((M15) its field as the finer shape has it, the coarser's let go)
			o.at = fine.at;
			// ((M15) a sea cave's light, if it was left till now: coarseCaves)
			if ( fine.light && ! o.light ) {

				o.light = fine.light;
				o.waterLight = fine.waterLight;
				this._caveLight();

			}

			const b = this.buckets[ ROCK_STYLES.length + k ], was = b.near.geometry, g = fine.geometry;
			g.setAttribute( 'iLod', was.attributes.iLod );
			b.near.geometry = g;
			b.nearTris = g.index.count / 3;
			was.dispose();

		}

	}

	// (M15) lazyCaves: an overhang's near shape wanted once you're within SHAPE_NEAR of it
	overhangsNear( x, z ) {

		if ( ! this.lazyCaves || this._shaping ) return;
		for ( const o of this.overhangs ) if ( ! o.fine && Math.hypot( x - o.x, z - o.z ) < SHAPE_NEAR ) {

			o.wanted = true;
			this._shaping = true;
			this.refineOverhangs().finally( () => this._shaping = false );
			return;

		}

	}

	// whether a scattered rock's where an overhang is: about it; (M15) a sea cave's over its strip or its cut
	// floor (the gully, the inlet), not all round it (the rocks on the platform beside its gully kept)
	_crowds( o, r ) {

		if ( o.site.kind !== 'seacave' ) return Math.hypot( r.x - o.x, r.z - o.z ) < o.radius + r.size;
		return clears( o, r.x, r.z ) || carveAt( r.x, r.z ) !== null;

	}

	// (M15) how much light there is at p (world) for the eye: 1 in the open, less in a sea cave (the sky and
	// the sunlit sea it sees there, CaveLight's), for the exposure's adaptation (App)
	caveLevel( p ) {

		for ( const o of this.overhangs ) {

			if ( ! o.light || Math.abs( p.x - o.x ) > o.radius || Math.abs( p.z - o.z ) > o.radius ) continue;
			const dx = p.x - o.site.x, dz = p.z - o.site.z, cs = Math.cos( o.yaw ), sn = Math.sin( o.yaw );
			return caveOpenness( o.light, cs * dx - sn * dz, p.y - o.y0, sn * dx + cs * dz );

		}

		return 1;

	}

	// (M15) the rock's top over a sea cave at ( x, z ), for standing on (its ground's cut to its floor), if it's
	// no higher than maxY (-Infinity where there's none)
	roofAt( x, z, maxY = Infinity ) {

		let best = - Infinity;
		for ( const o of this.overhangs ) {

			if ( o.site.kind !== 'seacave' || Math.abs( x - o.x ) > o.radius || Math.abs( z - o.z ) > o.radius ) continue;
			const f = o.fine || o;
			if ( ! f.roof ) f.roof = caveRoof( f );
			const h = caveRoofAt( f, f.roof, x, z );
			if ( h <= maxY && h > best ) best = h;

		}

		return best;

	}

	// (M14) whether nothing grows at ( x, z ): along an overhang, under it and out of its mouth
	clears( x, z ) {

		return this.overhangs.some( ( o ) => clears( o, x, z ) );

	}

	// (M14) the rocks over the square ( x0, z0 )..( x1, z1 ) that the rain can reach (their tops above the
	// sea at its lowest), for what keeps it off about you (world/RockCover.js): each one's shape as it's
	// drawn near (its geometry) and where it is (its matrix). out: an array, refilled
	around( x0, z0, x1, z1, out = [] ) {

		out.length = 0;
		for ( const k of this.instances ) {

			if ( k.x + k.radius < x0 || k.x - k.radius > x1 || k.z + k.radius < z0 || k.z - k.radius > z1 ) continue;
			if ( k.y + k.size * k.sy < RAIN_REACHES ) continue;
			out.push( { geometry: this.buckets[ k.style ].near.geometry, matrix: k.matrix } );

		}

		return out;

	}

	// ------------------------------------------------------------------ placement

	_place( rand ) {

		// ((M15) the ground as it was before the sea caves' floors were cut: TerrainData.uncut)
		const T = this.terrainData.uncut || this.terrainData;
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
			// ((M15) as it was, where the turtle beach has been made since: TerrainData.uncut)
			const k = j * T.res + i, was = T.masksBefore && T.masksBefore.get( T.rock );
			return was && was.has( k ) ? was.get( k ) : T.rock[ k ];

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
			// ((M15) and the windward reef: its corals, not loose rocks)
			if ( Math.hypot( x - WORLD.northReef.center.x, z - WORLD.northReef.center.z ) < WORLD.northReef.radius * 1.2 + r ) return true;
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
			terrainHeightMap: U.terrainHeightMap, terrainHeightInfo: U.terrainHeightInfo, offshoreHeightMap: U.offshoreHeightMap, offshoreHeightInfo: U.offshoreHeightInfo,
			terrainDetailTex: U.terrainDetailTex, terrainSplatTex: U.terrainSplatTex, terrainMapInfo: U.terrainMapInfo,
			terrainCaustics: U.terrainCaustics, terrainTime: U.terrainTime, terrainNight: U.terrainNight,
		};
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\nattribute vec2 iLod;\nattribute float ao;\nattribute vec2 flow;\nattribute vec4 sea;\nvarying vec2 vLod;\nvarying float vCav;\nvarying vec2 vFlow;\nvarying vec4 vSea;\nvarying vec3 vRockP;\nvarying vec3 vRockN;' )
				.replace( '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	vLod = iLod;
	vCav = ao;
	vFlow = flow;
	vSea = sea;
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
uniform sampler2D terrainCaustics;
uniform float terrainTime;
uniform float terrainNight;
varying vec2 vLod;
varying float vCav;
varying vec2 vFlow;
varying vec4 vSea;
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
	// fade, the outgoing one the others ((M14) as materials/LODFade.js has it: it was the other way
	// about, so the near level, outgoing at fade 0, kept none: no rock within about sixty metres of you
	// was drawn, only its shadow)
	float lodT = rockBayer4( gl_FragCoord.xy );
	if ( vLod.y > 0.5 ? lodT < vLod.x : lodT >= vLod.x ) discard;
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
	// ((M15) no moss in a sea cave's dark)
	RockSurface R = terrainRockSurface( p, N, p.y, mcr, 0.5, 1.0 - vSea.w * ( 1.0 - ss( 0.25, 0.6, vSea.x ) ), g );
	vec3 rockAlbedo = R.albedo;
	float rockRough = R.rough, rockHd = R.hd, rockHeight = R.height;
#endif
	// ((M14) an overhang's flows: each its own tone, and the crust at each one's top rusted browner, as
	// the layers of lava shores are in photographs; the other rocks have none)
	rockAlbedo *= 1.0 + vFlow.x * 0.15;
	rockAlbedo = mix( rockAlbedo, PAL_rockWarm * 0.75, vFlow.y * 0.55 );
	// ((M15) a sea cave's rock (photographs: the basalt inlets and caves of Skye and Staffa, the lava caves of
	// Maui and Kauai): out in the light above the spray, where it's the slope's top, the land's weathered rock as
	// the terrain has it about it (darker and browner, soil in its joints, moss on its ledges); its walls the
	// sea cliff's grey, the spray zone and the intertidal as the shore's, with pink coralline crust thick along
	// the waterline in the shade; inside, damp and dark)
	float caveWet = 0.0, caveLand = 0.0;
	if ( vSea.w > 0.5 ) {
		vec2 cuv = mix( vec2( p.x * 0.71 + p.z * 0.71, p.y ), p.xz, ss( 0.55, 0.85, abs( N.y ) ) );
		vec4 cd = texture( terrainDetailTex, cuv / 5.3 + 0.37 );
		vec4 cf = texture( terrainDetailTex, cuv / 1.3 + 0.71 );
		float land = ss( 3.0, 5.5, p.y + ( cd.w - 0.5 ) * 3.0 ) * ss( 0.3, 0.6, N.y + ( cd.y - 0.5 ) * 0.3 ) * ss( 0.3, 0.6, vSea.x );
		// (the basalt's tone without its flows' bands: up a slope they read as the rungs of a ladder)
		vec3 landRock = mix( PAL_rockDark, PAL_rockMid, ss( 0.1, 0.5, rockHeight * 0.9 + ( mcr - 0.5 ) * 0.7 ) ) * vec3( 0.36, 0.34, 0.31 ) * 0.8;
		landRock = mix( landRock, mix( ${ srgb( 0.13, 0.1, 0.07 ) }, ${ srgb( 0.2, 0.2, 0.1 ) }, cf.y ), ss( 0.42, 0.25, rockHeight ) * 0.7 );
		landRock = mix( landRock, mix( ${ srgb( 0.12, 0.17, 0.05 ) }, ${ srgb( 0.22, 0.26, 0.09 ) }, cf.y ), ss( 0.45, 0.8, N.y + ( cd.y - 0.5 ) * 0.6 ) * 0.75 );
		rockAlbedo = mix( rockAlbedo, landRock, land );
		caveLand = land;
		float shade = 1.0 - ss( 0.3, 0.8, vSea.x );
		// (the crust a band along the waterline, its top a ragged line, solid in the shade and broken in the light)
		float band = ss( - 1.0, - 0.5, p.y ) * ss( 0.7, 0.45, p.y + ( cd.w - 0.5 ) * 0.6 + ( cf.z - 0.5 ) * 0.25 );
		float coral = band * ss( 0.4 - 0.18 * shade, 0.55 - 0.18 * shade, cd.z + ( cf.w - 0.5 ) * 0.7 );
		// (a thin crust: the rock's grain through it, pinker in its thick patches)
		vec3 coralC = mix( ${ srgb( 0.72, 0.48, 0.49 ) }, ${ srgb( 0.84, 0.6, 0.6 ) }, ss( 0.5, 0.8, cf.y ) ) * ( 0.7 + 0.6 * cf.x ) * ( 0.85 + 0.3 * ss( 0.3, 0.7, rockHeight ) );
		rockAlbedo = mix( rockAlbedo, coralC, coral * 0.8 );
		float dark = 1.0 - ss( 0.02, 0.3, vSea.x );
		rockAlbedo *= 1.0 - dark * 0.25;
		caveWet = max( dark * 0.8, ss( 2.4, 0.9, p.y + ( cd.w - 0.5 ) * 0.8 ) ) * ( 1.0 - land );
		rockRough = mix( rockRough, 0.4, caveWet );
		// (the land's rock as rough to the eye as the terrain draws it)
		rockHd = mix( rockHd, rockHd * 2.2 + rockHeight * 0.6, land );
	}
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
				.replace( '#include <aomap_fragment>', /* glsl */`
	reflectedLight.indirectDiffuse *= rockAO;
	reflectedLight.indirectSpecular *= rockAO;
	// ((M15) a sea cave's: the sky's light as much as its face sees of the sky; the sun's only where it can get
	// in (where they're drawn, the shadows have it exactly); and the sun's thrown in off the sunlit sea and rock
	// it sees (their albedos' worth of it, and again off its walls: a narrow inlet's walls are lit by it more
	// than by the sky), the sea's rippling over its walls and its roof by the mouth as the waves' caustics,
	// quick. Its sheltered faces take the sky's light CAVE_FILL x, as the wreck's and the fingerpost's shaded
	// faces do (FILL): the world's is kept low for the sand, and its dark basalt in the shade came out black;
	// not the land's rock on its top, as the ground about it)
	if ( vSea.w > 0.5 ) {
		float open = clamp( vSea.x * 1.3 + vSea.y * 0.3 + vSea.z * 0.3, 0.0, 1.0 ) * ( 1.0 + ${ CAVE_FILL - 1 }.0 * ( 1.0 - ss( 0.45, 0.85, vSea.x ) ) * ( 1.0 - caveLand ) );
		reflectedLight.indirectDiffuse *= open;
		reflectedLight.indirectSpecular *= open;
		float sunIn = ss( 0.03, 0.3, vSea.x + vSea.y * 0.5 + vSea.z * 0.3 );
		reflectedLight.directDiffuse *= sunIn;
		reflectedLight.directSpecular *= sunIn;
#if NUM_DIR_LIGHTS > 0
		vec3 sunW = normalize( ( vec4( directionalLights[ 0 ].direction, 0.0 ) * viewMatrix ).xyz );
		vec2 cq = vec2( p.x + p.y * 0.55, p.z - p.y * 0.45 );
		float ca = min( texture( terrainCaustics, cq * 0.33 + terrainTime * vec2( 0.071, 0.043 ) ).r,
			texture( terrainCaustics, ${ rot2( 'cq', 0.8 ) } * 0.27 + 0.5 - terrainTime * vec2( 0.039, 0.077 ) ).r );
		float lift = ss( - 0.1, 0.4, p.y ) * ss( 9.0, 1.0, p.y );
		float sunUp = ss( 0.1, 0.5, sunW.y ) * ( 1.0 - terrainNight );
		vec3 thrown = directionalLights[ 0 ].color * ( vSea.y * ( 0.05 + ca * 0.3 * lift ) + vSea.z * 0.08 ) * sunUp * ${ CAVE_BOUNCE.toFixed( 1 ) };
		reflectedLight.indirectDiffuse += thrown * BRDF_Lambert( material.diffuseColor );
#endif
	}` );

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
			// ((M15) none of a kind in view, as out at sea: no call for it, nor its program and uniforms set)
			b.near.visible = nn > 0;
			b.far.visible = nf > 0;
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
