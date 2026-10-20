import * as THREE from '../../engine/index.js';
import { mulberry32 } from '../../util/Noise.js';
import { C, f } from './VegNodes.js';
import { vegMaterial } from './VegMaterials.js';
import { MEADOW, rot2 } from '../terrain/TerrainShading.js';

// Camera-following ground flora: tall meadow grass (knee to waist high), dune grass, sea oats and
// beach creeper.
//
// The world is divided into CELL x CELL metre cells. Every visible cell near the camera draws one
// instance of a "patch": a fixed blue-noise set of clump slots. In the vertex shader each slot is
// placed at cellOrigin + slot offset, its height comes from the terrain heightmap (manual bilinear
// textureLoad) and its presence / size from an RGBA density mask (R dune grass, G meadow grass,
// B sea oats, A creeper). Empty cells are skipped on the CPU and cells are frustum culled.
//
// Three levels share the same clumps and blades (identical parameters), so switching a cell
// between them never moves a blade (radii per device tier: GRASS_TIERS):
//   near (< R_NEAR): every blade, 3 segments        mid (< R_MID): tiers 0-1, 2 segments
//   far (< R_FAR): tier 0, one triangle per blade
// Every blade has a tier; tier 2 blades fade out (narrow to nothing) before R_NEAR, tier 1 before
// R_MID, and tier 0 thins out (random per-blade cut-off) towards R_FAR where the terrain's meadow
// shading takes over. The remaining blades widen as the others fade, so the grass covers the
// ground equally at every distance (constant blade density x width).
//
// The heights come from the terrain's float height texture (Terrain.heightUniforms / heightGlsl:
// terrainHeightAt), the mask is an RGBA8 DataTexture; both are read in the vertex shader.

export const CELL = 8;
// high: Tidewater's field. mid: fewer clump slots (a prefix of the blue noise set, blades widened
// to keep the coverage) and shorter ranges. (low: no grass field)
//   near / mid / far: level radii (m); fadeT2 / fadeT1: tier 2 / 1 blades narrow out; fadeT0: tier 0
//   blades drop out at random distances in this range; max*: cells per level
export const GRASS_TIERS = {
	high: { clumps: 384, near: 18, mid: 46, far: 88, fadeT2: [ 11, 17 ], fadeT1: [ 36, 45 ], fadeT0: [ 62, 87 ], maxNear: 48, maxMid: 160, maxFar: 420 },
	mid: { clumps: 224, near: 13, mid: 30, far: 56, fadeT2: [ 8, 12.5 ], fadeT1: [ 23, 29.5 ], fadeT0: [ 38, 55 ], maxNear: 28, maxMid: 80, maxFar: 180 },
};
const CLUMPS = 384; // meadow / dune clump slots per cell (6 per m^2) at most
const BLADES = 7; // per clump
const BLADE_TIER = [ 0, 0, 1, 1, 2, 2, 2 ];
// blades per clump in each tier (coverage compensation)
const TIER_N = [ 2, 2, 3 ];
const OATS = 12; // sea oat slots per cell
const VINES = 28; // creeper slots per cell

const KIND = { GRASS: 0, OAT_STALK: 1, OAT_HEAD: 2, CREEPER: 3, FLOWER: 4 };

// Mitchell's best-candidate blue noise on a torus; any prefix is also well distributed.
function blueNoise( rand, n, size, k = 10 ) {

	const pts = [];
	for ( let i = 0; i < n; i ++ ) {

		let best = null, bestD = - 1;
		for ( let c = 0; c < ( i === 0 ? 1 : k ); c ++ ) {

			const x = rand() * size, z = rand() * size;
			let dmin = Infinity;
			for ( const p of pts ) {

				let dx = Math.abs( p[ 0 ] - x ), dz = Math.abs( p[ 1 ] - z );
				dx = Math.min( dx, size - dx );
				dz = Math.min( dz, size - dz );
				dmin = Math.min( dmin, dx * dx + dz * dz );

			}

			if ( dmin > bestD ) {

				bestD = dmin;
				best = [ x, z ];

			}

		}

		pts.push( best );

	}

	return pts;

}

class PatchBuilder {

	constructor() {

		this.pos = [];
		this.nor = [];
		this.side = [];
		this.slot = [];
		this.bladeData = [];
		this.idx = [];

	}

	get count() {

		return this.pos.length / 3;

	}

	// side: xyz offset direction * half width, w: across coordinate (-1 left edge, 1 right, 0 tip)
	v( p, n, side, slot, blade ) {

		this.pos.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		this.nor.push( n[ 0 ], n[ 1 ], n[ 2 ] );
		this.side.push( side[ 0 ], side[ 1 ], side[ 2 ], side[ 3 ] ?? 0 );
		this.slot.push( slot[ 0 ], slot[ 1 ], slot[ 2 ], slot[ 3 ] );
		this.bladeData.push( blade[ 0 ], blade[ 1 ], blade[ 2 ], blade[ 3 ] );
		return this.count - 1;

	}

	// blade: centre-line points with half widths; tip row has zero width (single vertex).
	// w4: aBlade.w (grass: tier)
	blade( slot, kind, rows, width, dirX, dirZ, lean, height, curve, rnd, base = [ 0, 0 ], w4 = 0 ) {

		const sx = - dirZ, sz = dirX; // horizontal side direction
		const ids = [];
		for ( let r = 0; r < rows.length; r ++ ) {

			const h = rows[ r ];
			const out = ( Math.sin( lean ) * h + curve * h * h ) * height;
			const up = ( Math.cos( lean ) * h - curve * 0.35 * h * h ) * height;
			const p = [ base[ 0 ] + dirX * out, up, base[ 1 ] + dirZ * out ];
			// tangent for the normal
			const dOut = Math.sin( lean ) + 2 * curve * h, dUp = Math.cos( lean ) - 0.7 * curve * h;
			const tl = Math.hypot( dOut, dUp );
			const tx = dirX * dOut / tl, ty = dUp / tl, tz = dirZ * dOut / tl;
			// normal = side x tangent
			const nx = - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty;
			const nl = Math.hypot( nx, ny, nz ) || 1;
			const n = [ nx / nl, ny / nl, nz / nl ];
			const hw = width * ( 1 - Math.pow( h, 1.6 ) ) * ( 0.75 + 0.25 * ( 1 - h ) );
			const blade = [ h, kind, rnd, w4 ];
			if ( r === rows.length - 1 ) {

				ids.push( [ this.v( p, n, [ 0, 0, 0, 0 ], slot, blade ) ] );

			} else {

				ids.push( [
					this.v( p, n, [ - sx * hw, 0, - sz * hw, - 1 ], slot, blade ),
					this.v( p, n, [ sx * hw, 0, sz * hw, 1 ], slot, blade ),
				] );

			}

		}

		for ( let r = 0; r < ids.length - 1; r ++ ) {

			const a = ids[ r ], b = ids[ r + 1 ];
			if ( b.length === 1 ) this.idx.push( a[ 0 ], a[ 1 ], b[ 0 ] );
			else this.idx.push( a[ 0 ], a[ 1 ], b[ 1 ], a[ 0 ], b[ 1 ], b[ 0 ] );

		}

	}

	// small leaf / flower lying on the ground: triangle fan around a centre point.
	// outline(a) gives the radius factor for angle a (0 = pointing along dir).
	fan( slot, kind, center, radius, dirX, dirZ, tilt, sides, outline, rnd, lift, hf = 0.1 ) {

		const c = this.v( [ center[ 0 ], lift, center[ 1 ] ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ hf, kind, rnd, 1 ] );
		const ring = [];
		for ( let i = 0; i < sides; i ++ ) {

			const a = ( i / sides ) * Math.PI * 2;
			const r = radius * outline( a );
			const lx = Math.cos( a ) * r, lz = Math.sin( a ) * r * 0.85;
			const x = center[ 0 ] + lx * dirX - lz * dirZ;
			const z = center[ 1 ] + lx * dirZ + lz * dirX;
			const along = lx / radius;
			const y = lift + ( along + 0.6 ) * radius * tilt;
			ring.push( this.v( [ x, y, z ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ hf + 0.05 * Math.max( 0, along ), kind, rnd, 0 ] ) );

		}

		for ( let i = 0; i < sides; i ++ ) this.idx.push( c, ring[ ( i + 1 ) % sides ], ring[ i ] );

	}

	// thin ribbon lying on the ground (creeper runner)
	ribbon( slot, kind, pts, width, rnd ) {

		const ids = [];
		for ( let i = 0; i < pts.length; i ++ ) {

			const p = pts[ i ], q = pts[ Math.min( pts.length - 1, i + 1 ) ], o = pts[ Math.max( 0, i - 1 ) ];
			let dx = q[ 0 ] - o[ 0 ], dz = q[ 2 ] - o[ 2 ];
			const l = Math.hypot( dx, dz ) || 1;
			dx /= l; dz /= l;
			const sx = - dz * width, sz = dx * width;
			ids.push( [
				this.v( [ p[ 0 ] - sx, p[ 1 ], p[ 2 ] - sz ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ 0.05, kind, rnd, 0 ] ),
				this.v( [ p[ 0 ] + sx, p[ 1 ], p[ 2 ] + sz ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ 0.05, kind, rnd, 0 ] ),
			] );

		}

		for ( let i = 0; i < ids.length - 1; i ++ ) {

			const a = ids[ i ], b = ids[ i + 1 ];
			this.idx.push( a[ 0 ], b[ 1 ], a[ 1 ], a[ 0 ], b[ 0 ], b[ 1 ] );

		}

	}

	build() {

		const g = new THREE.InstancedBufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'aSide', new THREE.Float32BufferAttribute( this.side, 4 ) );
		g.setAttribute( 'aSlot', new THREE.Float32BufferAttribute( this.slot, 4 ) );
		g.setAttribute( 'aBlade', new THREE.Float32BufferAttribute( this.bladeData, 4 ) );
		g.setIndex( this.count > 65535 ? new THREE.Uint32BufferAttribute( this.idx, 1 ) : new THREE.Uint16BufferAttribute( this.idx, 1 ) );
		g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		g.boundingBox = new THREE.Box3( new THREE.Vector3( - 1e7, - 1e7, - 1e7 ), new THREE.Vector3( 1e7, 1e7, 1e7 ) );
		return g;

	}

	get triangles() {

		return this.idx.length / 3;

	}

}

// Clump / blade parameters shared by all levels (same seeds -> identical blades).
function clumpParams( seed ) {

	const rand = mulberry32( seed );
	const slots = blueNoise( mulberry32( seed + 1 ), CLUMPS, CELL );
	return slots.map( ( [ x, z ] ) => {

		const slotRand = rand();
		const az0 = rand() * Math.PI * 2;
		const blades = [];
		for ( let k = 0; k < BLADES; k ++ ) {

			// golden-angle azimuths: any prefix of the blades spreads around the clump; the first
			// two (kept at every distance) lean away from each other
			const az = az0 + k * 2.39996 + ( rand() - 0.5 ) * 0.5;
			const outer = k === 0 ? 0.1 + 0.3 * rand() : k === 1 ? 0.35 + 0.4 * rand() : rand();
			blades.push( {
				dx: Math.cos( az ), dz: Math.sin( az ),
				lean: 0.06 + 0.55 * outer * ( 0.6 + 0.8 * rand() ),
				h: ( 0.7 + 0.5 * rand() ) * ( 1.06 - 0.22 * outer ),
				curve: 0.12 + 0.5 * outer * ( 0.5 + rand() ),
				rnd: rand(),
				base: [ Math.cos( az ) * 0.09 * rand(), Math.sin( az ) * 0.09 * rand() ],
				tier: BLADE_TIER[ k ],
			} );

		}

		return { x, z, slotRand, blades };

	} );

}

// level: 0 near, 1 mid, 2 far; width: blade width (m)
function buildPatch( level, clumps, seed = 7, width = 0.012 ) {

	const b = new PatchBuilder();
	const rows = [ [ 0, 0.3, 0.62, 1 ], [ 0, 0.55, 1 ], [ 0, 1 ] ][ level ];
	const maxTier = 2 - level;

	for ( const c of clumps ) {

		const slot = [ c.x, c.z, c.slotRand, 0 ];
		for ( const bl of c.blades ) {

			if ( bl.tier > maxTier ) continue;
			b.blade( slot, KIND.GRASS, rows, width, bl.dx, bl.dz, bl.lean, bl.h, bl.curve, bl.rnd, bl.base, bl.tier );

		}

	}

	if ( level === 2 ) return b;

	// sea oats (tier 1: fade out before the far level) and, near only, beach creeper. Every slot
	// has its own random stream, so the near and mid versions of a plant are identical.
	const oatSlots = blueNoise( mulberry32( seed + 2 ), OATS, CELL );
	const near = level === 0;
	oatSlots.forEach( ( [ x, z ], si ) => {

		const rand = mulberry32( seed * 7919 + si * 131 + 17 );
		const slot = [ x, z, rand(), 1 ];
		const stalks = near ? 3 : 1;
		for ( let q = 0; q < 3; q ++ ) {

			const az = rand() * Math.PI * 2;
			const dx = Math.cos( az ), dz = Math.sin( az );
			const lean = 0.06 + 0.14 * rand();
			const hq = 0.8 + 0.3 * rand();
			const rnd = rand();
			const bx = q === 0 ? 0 : ( rand() - 0.5 ) * 0.22, bz = q === 0 ? 0 : ( rand() - 0.5 ) * 0.22;
			const hs = [ rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand() ];
			if ( q >= stalks ) continue;
			const qTier = q === 0 ? 0 : 2;
			// stalk (unit height, scaled in the shader)
			b.blade( slot, KIND.OAT_STALK, near ? [ 0, 0.3, 0.6, 0.85, 1 ] : [ 0, 0.6, 1 ], near ? 0.0075 : 0.014, dx, dz, lean, hq, 0.2, rnd, [ bx, bz ], qTier );
			// drooping panicle: flat spikelets hanging off the upper stalk
			const heads = near ? 8 : 3;
			for ( let k = 0; k < heads; k ++ ) {

				const hf = 0.7 + 0.3 * ( k / Math.max( 1, heads - 1 ) );
				const out = ( Math.sin( lean ) * hf + 0.2 * hf * hf ) * hq;
				const up = ( Math.cos( lean ) * hf - 0.07 * hf * hf ) * hq;
				const sa = az + ( k % 2 ? 1 : - 1 ) * ( 0.45 + 0.6 * hs[ k ] );
				const sdx = Math.cos( sa ), sdz = Math.sin( sa );
				const cx = bx + dx * out + sdx * 0.02, cz = bz + dz * out + sdz * 0.02;
				const L = near ? 0.085 : 0.13, W = near ? 0.022 : 0.04;
				const n = [ 0, 1, 0 ];
				const slotB = [ hf, KIND.OAT_HEAD, rnd, qTier ];
				const a = b.v( [ cx, up + 0.01, cz ], n, [ 0, 0, 0, 0 ], slot, slotB );
				const l = b.v( [ cx + sdx * L * 0.45 - sdz * W, up - L * 0.4, cz + sdz * L * 0.45 + sdx * W ], n, [ 0, 0, 0, 0 ], slot, slotB );
				const r = b.v( [ cx + sdx * L * 0.45 + sdz * W, up - L * 0.4, cz + sdz * L * 0.45 - sdx * W ], n, [ 0, 0, 0, 0 ], slot, slotB );
				const t = b.v( [ cx + sdx * L * 0.8, up - L * 0.95, cz + sdz * L * 0.8 ], n, [ 0, 0, 0, 0 ], slot, slotB );
				b.idx.push( a, l, t, a, t, r );

			}

		}

		if ( near ) {

			for ( let k = 0; k < 4; k ++ ) {

				const la = ( k / 4 ) * Math.PI * 2 + rand();
				b.blade( slot, KIND.GRASS, [ 0, 0.45, 0.8, 1 ], 0.01, Math.cos( la ), Math.sin( la ), 0.55 + 0.4 * rand(), 0.45, 0.35, rand(), [ 0, 0 ], 2 );

			}

		}

	} );

	if ( ! near ) return b;

	// beach creeper (railroad vine): a runner crawling over the sand with notched leaves
	const notched = ( a ) => {

		const d = Math.min( Math.abs( a ), Math.abs( a - Math.PI * 2 ) );
		return 1 - 0.38 * Math.exp( - ( d * d ) / 0.12 ) - 0.15 * Math.pow( Math.sin( a * 0.5 ), 8 );

	};
	const petals = ( a ) => 0.82 + 0.18 * Math.cos( a * 5 );
	const vineSlots = blueNoise( mulberry32( seed + 3 ), VINES, CELL );
	vineSlots.forEach( ( [ x, z ], si ) => {

		const rand = mulberry32( seed * 3571 + si * 197 + 5 );
		const slot = [ x, z, rand(), 2 ];
		let az = rand() * Math.PI * 2;
		const pts = [];
		const n = 12;
		let px = - Math.cos( az ) * 1.1, pz = - Math.sin( az ) * 1.1;
		for ( let i = 0; i < n; i ++ ) {

			pts.push( [ px, 0.01, pz ] );
			az += ( rand() - 0.5 ) * 0.5;
			px += Math.cos( az ) * 0.19;
			pz += Math.sin( az ) * 0.19;

		}

		b.ribbon( slot, KIND.CREEPER, pts, 0.011, rand() );
		for ( let i = 1; i < pts.length; i ++ ) {

			const side = i % 2 ? 1 : - 1;
			const p0 = pts[ i - 1 ], p1 = pts[ i ];
			let dx = p1[ 0 ] - p0[ 0 ], dz = p1[ 2 ] - p0[ 2 ];
			const l = Math.hypot( dx, dz ) || 1;
			dx /= l; dz /= l;
			// leaves stand on short petioles, angled forward off the runner, tilted up
			const la = Math.atan2( dz, dx ) + side * ( 0.7 + 0.5 * rand() );
			const ldx = Math.cos( la ), ldz = Math.sin( la );
			const r = ( 0.07 + 0.04 * rand() ) * ( 0.6 + 0.4 * Math.sin( Math.PI * i / n ) );
			b.fan( slot, KIND.CREEPER, [ p1[ 0 ] + ldx * r * 0.9, p1[ 2 ] + ldz * r * 0.9 ], r, ldx, ldz, 0.3 + 0.3 * rand(), 7, notched, rand(), 0.015 );

		}

		const fp = pts[ 3 + Math.floor( rand() * 4 ) ];
		b.fan( slot, KIND.FLOWER, [ fp[ 0 ] + 0.03, fp[ 2 ] + 0.03 ], 0.036, 1, 0, 1.4, 10, petals, rand(), 0.07, 0.2 );

	} );

	return b;

}

export class GrassField {

	// heights: { heightUniforms, heightGlsl } (Terrain's float height texture), config: GRASS_TIERS entry
	constructor( { terrain, mask, heights, config = GRASS_TIERS.high } ) {

		this.terrain = terrain;
		this.heights = heights;
		this.config = config;
		const res = terrain.res;
		const maskData = mask.data, mres = mask.res;

		// density mask (linear filtered by the vertex shader)
		const maskTex = this.maskTex = new THREE.DataTexture( maskData, mres, mres, THREE.RGBAFormat );
		maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter;
		maskTex.generateMipmaps = false;
		maskTex.needsUpdate = true;

		// per-cell occupancy + height range (for skipping empty cells and frustum tests)
		const cellsPerSide = Math.ceil( terrain.size / CELL );
		this.cellsPerSide = cellsPerSide;
		this.cellFlags = new Uint8Array( cellsPerSide * cellsPerSide );
		this.cellMinY = new Float32Array( cellsPerSide * cellsPerSide );
		this.cellMaxY = new Float32Array( cellsPerSide * cellsPerSide );
		const mpc = CELL / ( terrain.size / mres ); // mask texels per cell
		const hpc = CELL / terrain.texel; // height texels per cell
		for ( let cj = 0; cj < cellsPerSide; cj ++ ) {

			for ( let ci = 0; ci < cellsPerSide; ci ++ ) {

				let any = 0, mn = Infinity, mx = - Infinity;
				const i0 = Math.max( 0, Math.floor( ci * mpc ) - 1 ), i1 = Math.min( mres - 1, Math.ceil( ( ci + 1 ) * mpc ) + 1 );
				const j0 = Math.max( 0, Math.floor( cj * mpc ) - 1 ), j1 = Math.min( mres - 1, Math.ceil( ( cj + 1 ) * mpc ) + 1 );
				for ( let j = j0; j <= j1 && ! any; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

					const o = ( j * mres + i ) * 4;
					if ( maskData[ o ] > 8 || maskData[ o + 1 ] > 8 || maskData[ o + 2 ] > 8 || maskData[ o + 3 ] > 8 ) {

						any = 1;
						break;

					}

				}

				const c = cj * cellsPerSide + ci;
				this.cellFlags[ c ] = any;
				if ( ! any ) continue;
				const hi0 = Math.max( 0, Math.floor( ci * hpc ) - 1 ), hi1 = Math.min( res - 1, Math.ceil( ( ci + 1 ) * hpc ) + 1 );
				const hj0 = Math.max( 0, Math.floor( cj * hpc ) - 1 ), hj1 = Math.min( res - 1, Math.ceil( ( cj + 1 ) * hpc ) + 1 );
				for ( let j = hj0; j <= hj1; j ++ ) for ( let i = hi0; i <= hi1; i ++ ) {

					const h = terrain.heights[ j * res + i ];
					if ( h < mn ) mn = h;
					if ( h > mx ) mx = h;

				}

				this.cellMinY[ c ] = mn;
				this.cellMaxY[ c ] = mx;

			}

		}

		this.material = this._createMaterial();

		// fewer clump slots: a prefix of the blue noise set, the blades widened to keep the coverage
		const clumps = clumpParams( 7 ).slice( 0, config.clumps );
		const width = 0.012 * Math.sqrt( CLUMPS / config.clumps );
		const patches = [ buildPatch( 0, clumps, 7, width ), buildPatch( 1, clumps, 7, width ), buildPatch( 2, clumps, 7, width ) ];
		this.patchTris = patches.map( ( p ) => p.triangles );
		this.levels = [
			this._createMesh( patches[ 0 ].build(), config.maxNear, 'veg-grass-near' ),
			this._createMesh( patches[ 1 ].build(), config.maxMid, 'veg-grass-mid' ),
			this._createMesh( patches[ 2 ].build(), config.maxFar, 'veg-grass-far' ),
		];
		this.meshes = this.levels.map( ( l ) => l.mesh );

		this._frustum = new THREE.Frustum();
		this._mat = new THREE.Matrix4();
		this._box = new THREE.Box3();
		this._last = new Float64Array( 8 ).fill( NaN );

	}

	// back-compat accessors (stats)
	get near() {

		return this.levels[ 0 ];

	}

	get far() {

		return this.levels[ 2 ];

	}

	get nearTris() {

		return this.patchTris[ 0 ];

	}

	get farTris() {

		return this.patchTris[ 2 ];

	}

	_createMesh( geometry, max, name ) {

		const arr = new Float32Array( max * 4 );
		const attr = new THREE.InstancedBufferAttribute( arr, 4 );
		attr.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'iCell', attr );
		geometry.instanceCount = 0;
		const mesh = new THREE.Mesh( geometry, this.material );
		mesh.name = name;
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.matrixAutoUpdate = false;
		return { mesh, geometry, attr, arr, max, count: 0 };

	}

	_createMaterial() {

		return createGrassMaterial( this );

	}

	// Recompute visible cells (cheap; skipped when the camera did not change).
	update( camera ) {

		// skip when the camera has not moved / turned noticeably
		const e = camera.matrixWorld.elements;
		const L = this._last;
		const pe = camera.projectionMatrix.elements;
		if ( Math.abs( e[ 12 ] - L[ 0 ] ) < 0.05 && Math.abs( e[ 13 ] - L[ 1 ] ) < 0.05 && Math.abs( e[ 14 ] - L[ 2 ] ) < 0.05 &&
			Math.abs( e[ 8 ] - L[ 3 ] ) < 1e-3 && Math.abs( e[ 9 ] - L[ 4 ] ) < 1e-3 && Math.abs( e[ 10 ] - L[ 5 ] ) < 1e-3 &&
			pe[ 0 ] === L[ 6 ] && pe[ 5 ] === L[ 7 ] ) return false;
		L[ 0 ] = e[ 12 ]; L[ 1 ] = e[ 13 ]; L[ 2 ] = e[ 14 ];
		L[ 3 ] = e[ 8 ]; L[ 4 ] = e[ 9 ]; L[ 5 ] = e[ 10 ];
		L[ 6 ] = pe[ 0 ]; L[ 7 ] = pe[ 5 ];

		this._mat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._mat, camera.coordinateSystem, camera.reversedDepth );

		const cx = e[ 12 ], cz = e[ 14 ];
		const { near: R_NEAR, mid: R_MID, far: R_FAR } = this.config;
		const t = this.terrain;
		const n = this.cellsPerSide;
		const i0 = Math.max( 0, Math.floor( ( cx - R_FAR - t.origin ) / CELL ) ), i1 = Math.min( n - 1, Math.floor( ( cx + R_FAR - t.origin ) / CELL ) );
		const j0 = Math.max( 0, Math.floor( ( cz - R_FAR - t.origin ) / CELL ) ), j1 = Math.min( n - 1, Math.floor( ( cz + R_FAR - t.origin ) / CELL ) );
		const [ near, mid, far ] = this.levels;
		let nc = 0, mc = 0, fc = 0;

		for ( let j = j0; j <= j1; j ++ ) {

			for ( let i = i0; i <= i1; i ++ ) {

				const c = j * n + i;
				if ( ! this.cellFlags[ c ] ) continue;
				const x0 = t.origin + i * CELL, z0 = t.origin + j * CELL;
				// nearest point of the cell (horizontal, like the shader's LOD distance)
				const dx = Math.max( x0 - cx, 0, cx - x0 - CELL );
				const dz = Math.max( z0 - cz, 0, cz - z0 - CELL );
				const d = Math.hypot( dx, dz );
				if ( d > R_FAR ) continue;
				this._box.min.set( x0, this.cellMinY[ c ] - 0.5, z0 );
				this._box.max.set( x0 + CELL, this.cellMaxY[ c ] + 1.8, z0 + CELL );
				if ( ! this._frustum.intersectsBox( this._box ) ) continue;
				if ( d < R_NEAR && nc < near.max ) {

					near.arr[ nc * 4 ] = x0;
					near.arr[ nc * 4 + 1 ] = z0;
					nc ++;

				} else if ( d < R_MID && mc < mid.max ) {

					mid.arr[ mc * 4 ] = x0;
					mid.arr[ mc * 4 + 1 ] = z0;
					mc ++;

				} else if ( d >= R_MID && fc < far.max ) {

					far.arr[ fc * 4 ] = x0;
					far.arr[ fc * 4 + 1 ] = z0;
					fc ++;

				}

			}

		}

		for ( const [ lvl, count ] of [ [ near, nc ], [ mid, mc ], [ far, fc ] ] ) {

			lvl.count = count;
			lvl.geometry.instanceCount = count;
			lvl.attr.clearUpdateRanges();
			lvl.attr.addUpdateRange( 0, Math.max( 1, count ) * 4 );
			lvl.attr.needsUpdate = true;

		}

		return true;

	}

	get triangles() {

		return this.levels.reduce( ( a, l, k ) => a + l.count * this.patchTris[ k ], 0 );

	}

	dispose() {

		this.maskTex.dispose();
		this.material.dispose();
		for ( const m of this.meshes ) m.geometry.dispose();

	}

}

// ------------------------------------------------------------------------------------------ GLSL

// The tropical meadow tone is TerrainShading's (MEADOW palette, terrainMeadowTone without the
// optional finer detail input): the terrain and the grass field (blade base colour) evaluate it
// from the same inputs, so the geometric grass fades into the ground without a visible boundary.
const consts = Object.entries( MEADOW ).map( ( [ k, v ] ) => `const vec3 VEG_MEADOW_${ k.toUpperCase() } = ${ v };` ).join( '\n' );

const grassGlsl = ( cfg ) => /* glsl */`
${ consts }

struct VegMeadow { vec3 tone; float dry; float lush; };

//   mA, mB: detail fbm channel at the 173 m / 47 m scales (~0.5 +- 0.1): the samples at
//   rot2( xz, 0.7 ) / 173 and rot2( xz, 2.1 ) / 47 that the terrain takes anyway; slope: 1 - N.y;
//   south: N.z (the sun side). Mostly fresh green grass with olive, sun-bleached yellow and a few
// straw-dry patches (more on exposed slopes), darker lush grass in the damp patches.
VegMeadow vegMeadowTone( float mA, float mB, float slope, float south ) {
	float m = mA * 0.55 + mB * 0.45 + slope * 0.25 + south * 0.04;
	float olive = ss( 0.52, 0.6, m );
	float yellow = ss( 0.6, 0.67, m );
	float straw = ss( 0.66, 0.73, m + ( mB - 0.5 ) * 0.2 );
	float lush = ss( 0.46, 0.37, mB * 0.7 + mA * 0.3 + slope * 0.2 );
	vec3 c = mix( VEG_MEADOW_GREEN, VEG_MEADOW_OLIVE, olive );
	c = mix( c, VEG_MEADOW_YELLOW, yellow * 0.8 );
	c = mix( c, VEG_MEADOW_STRAW, straw * 0.55 );
	c = mix( c, VEG_MEADOW_LUSH, lush * 0.75 );
	return VegMeadow( c, olive * 0.4 + yellow * 0.6, lush );
}

// per-tier visibility at camera distance d (1 = full width, 0 = gone); tier 0 thins out per blade
float vegGrassTierFade( float tier, float d, float cut ) {
	float f2 = 1.0 - ss( ${ f( cfg.fadeT2[ 0 ] ) }, ${ f( cfg.fadeT2[ 1 ] ) }, d );
	float f1 = 1.0 - ss( ${ f( cfg.fadeT1[ 0 ] ) }, ${ f( cfg.fadeT1[ 1 ] ) }, d );
	float f0 = 1.0 - ss( cut - 5.0, cut, d );
	return tier > 1.5 ? f2 : ( tier > 0.5 ? f1 : f0 );
}
`;

function createGrassMaterial( field ) {

	const t = field.terrain;
	const cfg = field.config;

	const mat = vegMaterial( {
		name: 'veg-grass-' + cfg.clumps,
		uniforms: { ...field.heights.heightUniforms, grassMask: { value: field.maskTex } },
		attributes: /* glsl */`
attribute vec4 iCell;
attribute vec4 aSlot;
attribute vec4 aBlade;
attribute vec4 aSide;
`,
		varyings: [
			'vec4 vVegGrass', // hf, kind, dune fraction, rand
			'vec4 vVegGrassTone', // meadow tone (shared with the terrain), dryness
			'vec4 vVegGrass2', // density, leaf / flower centre flag, across, dry blade
			'float vVegGust', // current gust bend (wind sheen)
		].join( ';' ),
		vertexPars: field.heights.heightGlsl + grassGlsl( cfg ) + 'uniform sampler2D grassMask;\n',
		fragmentPars: grassGlsl( cfg ),
		vertex: /* glsl */`
	vec2 cell = iCell.xy;
	vec4 slot = aSlot;
	vec4 blade = aBlade;
	vec4 side4 = aSide;
	vec3 side = side4.xyz;
	vec3 P = position;
	vec3 N = normal;

	vec2 xz = cell + slot.xy;
	float hf = blade.x;
	float kind = blade.y;
	float bRnd = blade.z;

	vec4 m = textureLod( grassMask, ( xz - ${ f( t.origin ) } ) / ${ f( t.size ) }, 0.0 );
	bool isGrass = kind < 0.5;
	bool isOat = kind > 0.5 && kind < 2.5;
	float lush = m.g;
	float dune = m.r;
	// the backshore grass is dense in its clumps (the mask carries the clumping and the edge)
	float duneF = dune / ( dune + lush + 1e-3 );
	float grassP = mix( lush, min( dune * 1.1, 1.0 ), duneF );
	float density = isGrass ? grassP : ( isOat ? m.b : m.a );
	float r = vegHash12( xz * 1.37 + 0.51 );
	float r2 = vegHash12( xz * 2.11 + 7.3 );
	float flowerOk = kind > 3.5 ? ( r2 < 0.35 ? 1.0 : 0.0 ) : 1.0;
	float present = ( r < density ? 1.0 : 0.0 ) * flowerOk;

	// meadow tone at the clump: the same function and inputs as the terrain's meadow shading
	float mA = textureLod( vegDetail, ${ rot2( 'xz', 0.7 ) } / 173.0, 0.0 ).w;
	float mB = textureLod( vegDetail, ${ rot2( 'xz', 2.1 ) } / 47.0, 0.0 ).w;
	VegMeadow mt = vegMeadowTone( mA, mB, 0.0, 0.0 );
	// size: tall meadow grass, knee to waist high: swathes of taller grass in the lush patches,
	// lower where it is dry; wiry dune tufts
	float patchN = vegNoise( xz * ${ f( 1 / 6.5 ) } + 17.3 ) * 0.7 + vegNoise( xz * ${ f( 1 / 2.3 ) } ) * 0.3;
	float lushH = mix( 0.7, 1.3, patchN ) * ( mt.lush * 0.25 + 1.0 ) * ( 1.0 - mt.dry * 0.25 );
	// dune tufts vary a lot in size (young shoots to big old clumps)
	float grassH = mix( lushH, 0.62, duneF ) * mix( r2 * 0.35 + 0.83, r2 * r2 * 0.9 + 0.5, duneF ) * ( density * 0.35 + 0.65 );
	float oatH = r2 * 0.55 + 1.0;
	float vineS = r2 * 0.4 + 0.8;
	float hScale = isGrass ? grassH : ( isOat ? oatH : vineS );
	// meadow clumps fan out wider than the wiry dune tufts
	float spread = isGrass ? mix( 1.35, 1.3, duneF ) : 1.0;

	// distance LOD: tiers fade out (narrow to nothing), the remaining blades widen so the
	// coverage (blade density x width) stays constant; tier 0 thins out per blade near the far radius
	float dist = length( xz - vegCamPos.xz );
	// tier: grass blades and oats carry their own (aBlade.w), otherwise the slot's
	float tier = max( kind < 2.5 ? blade.w : 0.0, slot.w );
	float cutK = bRnd * 7.13 + r2;
	float cut = mix( ${ f( cfg.fadeT0[ 0 ] + 5 ) }, ${ f( cfg.fadeT0[ 1 ] ) }, cutK - floor( cutK ) );
	float own = vegGrassTierFade( tier, dist, cut );
	float f2 = 1.0 - ss( ${ f( cfg.fadeT2[ 0 ] ) }, ${ f( cfg.fadeT2[ 1 ] ) }, dist );
	float f1 = 1.0 - ss( ${ f( cfg.fadeT1[ 0 ] ) }, ${ f( cfg.fadeT1[ 1 ] ) }, dist );
	float comp = ${ f( TIER_N[ 0 ] + TIER_N[ 1 ] + TIER_N[ 2 ] ) } / ( f2 * ${ f( TIER_N[ 2 ] ) } + f1 * ${ f( TIER_N[ 1 ] ) } + ${ f( TIER_N[ 0 ] ) } );
	// oats and creeper simply shrink out
	float widthK = isGrass ? comp * own : 1.0;
	float sizeK = isGrass ? 1.0 : own;
	float scale = hScale * present * sizeK;

	// per-slot random yaw
	float yaw = vegHash12( xz * 0.73 + 3.3 ) * 6.2832;
	float cy = cos( yaw ); float sy = sin( yaw );

	// terrain height (float texels loaded and bilinearly filtered manually)
	float ground = terrainHeightAt( xz );
	vec3 base = vec3( xz.x, ground - 0.03, xz.y );
	vec3 pl = vec3( P.x * spread, P.y, P.z * spread );
	vec3 o0 = vec3( pl.x * cy - pl.z * sy, pl.y, pl.x * sy + pl.z * cy ) * scale;

	// wind: travelling gusts bend blades downwind (length preserving), plus flutter
	float w = vegWindStrength();
	float g = vegGustAt( xz );
	float tm = vegTime;
	float ph = r * 6.2832;
	float bendAmt = w * ( g * 0.55 + 0.22 ) + sin( tm * 1.9 + ph + xz.x * 0.2 ) * w * 0.1;
	float flut = sin( tm * 7.3 + ph * 3.0 + bRnd * 20.0 ) * ( w * 0.06 + 0.015 );
	float stiff = isGrass ? 1.0 : ( isOat ? 0.8 : 0.08 );
	float hf2 = hf * hf;
	vec3 disp = ( vegWindDir3() * ( bendAmt * hf2 * stiff ) + vegWindPerp3() * ( flut * hf2 * stiff ) ) * ( length( o0 ) + 1e-4 );
	float oL = length( o0 );
	vec3 ob = normalize( o0 + disp + vec3( 0.0, 1e-5, 0.0 ) ) * oL;

	float wScale = isGrass ? mix( 1.5, 1.55, duneF ) : 1.0;
	float wide = wScale * widthK * min( scale * 2.0, max( scale, 0.5 ) );
	vec3 sideR = vec3( side.x * cy - side.z * sy, side.y, side.x * sy + side.z * cy );
	vec3 vegWorldPos = base + ob + sideR * wide;

	// lighting normal: blade normal bent towards up (soft, grass-like shading), rounded across
	// the blade (a folded leaf is lit differently on its two halves)
	float across = side4.w;
	vec3 sideDir = normalize( sideR + vec3( 1e-5, 0.0, 0.0 ) );
	vec3 nR = vec3( N.x * cy - N.z * sy, N.y, N.x * sy + N.z * cy );

	// a share of the blades is dead / straw coloured (more in the dry patches)
	float dk = bRnd * 13.7 + r * 3.1;
	float dryBlade = dk - floor( dk ) < mt.dry * 0.3 + 0.07 ? 1.0 : 0.0;
	vVegGrass = vec4( hf, kind, duneF, bRnd );
	vVegGrassTone = vec4( mt.tone, mt.dry );
	vVegGrass2 = vec4( density, kind < 2.5 ? 0.0 : blade.w, across, dryBlade );
	vVegGust = saturate( g * w * 0.6 ) * stiff;

	vec3 vegWorldNormal = normalize( nR * 0.5 + VEG_UP + sideDir * ( across * 0.35 ) );`,
		surface: /* glsl */`
	float hf = vVegGrass.x;
	float kind = vVegGrass.y;
	float duneF = vVegGrass.z;
	float rnd = vVegGrass.w;
	float across = vVegGrass2.z;
	float dryBlade = vVegGrass2.w;
	// self-shadowing of the sward: dark at the base of the clump
	float ao = mix( 0.32, 1.0, ss( 0.0, 0.75, hf ) );
	// dune grass: olive base, straw tips; meadow: the terrain's meadow tone, dark and brownish
	// (dead leaf sheaths) at the base, lighter / sun-bleached towards the tips
	vec3 duneBase = mix( ${ C( 0x5d6232 ) }, ${ C( 0x7f8a40 ) }, rnd );
	vec3 duneTip = mix( ${ C( 0xb8ab6c ) }, ${ C( 0x9aa452 ) }, rnd );
	vec3 tone = vVegGrassTone.xyz * ( rnd * 0.34 + 0.83 );
	vec3 lushBase = mix( tone * 0.5, VEG_MEADOW_SOIL, 0.3 );
	float tipDry = vVegGrassTone.w * 0.4 + ss( 0.8, 1.0, rnd ) * 0.35;
	vec3 lushTip = mix( tone * vec3( 1.25, 1.25, 1.05 ), VEG_MEADOW_STRAW, tipDry * ss( 0.55, 1.0, hf ) );
	vec3 gBase = mix( lushBase, duneBase, duneF );
	vec3 gTip = mix( lushTip, duneTip, duneF );
	vec3 grass0 = mix( gBase, gTip, ss( 0.05, 0.95, hf ) );
	// dead blades: straw to brown
	grass0 = mix( grass0, mix( VEG_MEADOW_STRAW, VEG_MEADOW_SOIL * 1.8, rnd * 0.6 ) * ( ss( 0.0, 0.5, hf ) * 0.4 + 0.6 ), dryBlade * ( 1.0 - duneF ) );
	// pale midrib
	grass0 = grass0 * ( pow( max( 1.0 - abs( across ), 0.0 ), 6.0 ) * ss( 0.05, 0.4, hf ) * 0.18 + 1.0 );
	// wind sheen: blades flattened by a gust show their paler undersides, so gusts read
	// as bright waves rolling across the grass
	vec3 grass = mix( grass0, grass0 * vec3( 1.3, 1.28, 1.1 ) + vec3( 0.03, 0.03, 0.015 ), vVegGust * ss( 0.15, 0.9, hf ) * 0.6 );
	vec3 oatStalk = mix( ${ C( 0x9c9a62 ) }, ${ C( 0xc2b27a ) }, hf );
	vec3 oatHead = mix( ${ C( 0xc9b27a ) }, ${ C( 0xa8905a ) }, rnd );
	float centre = vVegGrass2.y; // 1 at leaf / flower centre
	vec3 vine = mix( mix( ${ C( 0x2e5219 ) }, ${ C( 0x4a7328 ) }, rnd ), ${ C( 0x7a8f4a ) }, centre * 0.3 ) * ( hf < 0.075 ? vec3( 1.25, 1.05, 0.8 ) : vec3( 1.0 ) );
	vec3 flower = mix( ${ C( 0xb8479c ) }, ${ C( 0xf2e8ee ) }, ss( 0.35, 0.9, centre ) );
	vec3 c = kind < 0.5 ? grass : ( kind < 1.5 ? oatStalk : ( kind < 2.5 ? oatHead : ( kind < 3.5 ? vine : flower ) ) );
	vec3 albedo = c * ( kind < 2.5 ? ao : 1.0 );
	vegAlbedo = albedo;
	vegRough = kind > 2.5 && kind < 3.5 ? 0.45 : 0.8;
	vegSpec = 0.4;
	vegNormalW = normalize( normalize( vVegN ) + vegV * 0.4 );
	// back-lit thin blades glow (in the direct light loop, with the shadowed light, so grass in
	// shadow does not)
	vegTrans = albedo * vec3( 1.1, 1.3, 0.6 ) * ( 0.3 * ss( 0.2, 1.0, hf ) ) * ( 1.0 - vegNight );`,
		transLight: 'return pow( saturate( dot( - V, L ) ), 4.0 );',
		shadow: null,
	} );
	return mat;

}
