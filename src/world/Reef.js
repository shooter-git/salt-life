import * as THREE from '../engine/index.js';
import { bandFade } from '../materials/LODFade.js';
import { KindBatch } from './reef/KindBatch.js';
import { createReefMaterials } from './reef/ReefMaterials.js';
import { createNoiseVolume, noiseVolumeData } from './reef/ReefNoise.js';
import { releaseTexture } from '../core/ReleaseAfterUpload.js';
import { ReefLayout, reefFloorAt, CELL, RANGE_FAR, SHADOW_RANGE, SHADOW_SIZE } from './reef/ReefLayout.js';
import ReefWorker from './reef/ReefWorker.js?worker&inline';
import { classicWorker } from '../core/ClassicWorker.js';

// Caribbean fringing reef around WORLD.reef, 1.5 - 12 m deep: Tidewater's (its zonation, models,
// placement and culling: reef/ReefLayout.js). Salt Life draws it on WebGL 2:
//  - the layout is made in a worker (Reef.create(): 80k instances, 3-4 s on a laptop, and the
//    garbage of making them stays out of the page's script memory); the page keeps the height
//    field of the solid structures (floorHeightAt: the fish, the swimmer) and the culling data
//  - two KindBatches (opaque rocks and colonies; sea fans and plumes), a draw per model and
//    level of detail in use (reef/KindBatch.js), shaded by reef/ReefMaterials.js
//  - each frame the camera moved, the instances in range and in view pick a level of detail by
//    distance relative to their size (cross-faded, dithered, on mid and high); on high the large
//    structures near the camera cast shadows through low-detail proxies
//  - ranges for the water Salt Life draws: its underwater fog ends at 28 m, and from above the
//    water hides the floor but over the shallows (Tidewater: 45 m under water, up to 110 m above);
//    on low and mid, from above only what reaches near the surface, and nothing too small to see
// Far from the reef nothing is drawn.

// under / above: the draw distance (m) with the camera under / above the water (above: + aboveK
// per m of height); shallow: from above the water only what reaches this far below the surface
// (m; the water hides the rest); lod: the level-of-detail distances' scale; minSize: the smallest
// radius / distance drawn
const TIER = {
	low: { under: 15, above: 14, aboveK: 0, shallow: - 2.5, lod: 0.3, minSize: 0.03, fades: false, shadows: false, lite: true },
	mid: { under: 24, above: 22, aboveK: 0, shallow: - 3, lod: 0.7, minSize: 0.01, fades: true, shadows: false, lite: false },
	high: { under: 30, above: 35, aboveK: 1.4, shallow: - Infinity, lod: 1, minSize: 0, fades: true, shadows: true, lite: false },
};

const _m = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _box = new THREE.Box3();

export class Reef {

	// Lays the reef out (in a worker where it can: reef/ReefWorker) and returns a Reef.
	// terrain: TerrainData; ground: the Terrain (the shared underwater shading); tier; data: the
	// layout if it was started earlier (Reef.layout)
	static async create( { scene, terrain, ground, tier = 'high', data = null } ) {

		data = await ( data || Reef.layout( terrain ) );
		return new Reef( { scene, terrain, ground, tier, data } );

	}

	// the layout: a promise of ReefLayout's toData() (in a worker; on the page if there's none)
	static async layout( terrain ) {

		const T = terrain;
		const input = { terrain: { res: T.res, texel: T.texel, origin: T.origin, size: T.size, heights: T.heights, seagrass: T.seagrass } };
		try {

			return await new Promise( ( resolve, reject ) => {

				const worker = classicWorker( ReefWorker );
				worker.onmessage = ( e ) => {

					worker.terminate();
					if ( e.data.error ) reject( new Error( e.data.error ) );
					else resolve( e.data.data );

				};

				worker.onerror = ( e ) => {

					worker.terminate();
					reject( e );

				};

				worker.postMessage( input );

			} );

		} catch ( e ) {

			console.warn( 'Reef: laid out on the page (no worker)', e && e.message );
			return new ReefLayout( { terrain } ).toData();

		}

	}

	// data: ReefLayout's toData()
	constructor( { scene, terrain, ground, tier = 'high', data } ) {

		this.terrain = terrain;
		this.tier = TIER[ tier ] ? tier : 'high';
		this.cfg = TIER[ this.tier ];
		this.group = new THREE.Group();
		this.group.name = 'Reef';
		this.hf = data.hf;
		this.cells = data.cells;
		this.extent = data.extent;
		this.anchors = data.anchors;
		this.counts = data.counts;
		this.timings = data.timings;
		this.cull = { hard: data.batches.hard.cull, soft: data.batches.soft.cull };
		this.instances = { hard: data.batches.hard.count, soft: data.batches.soft.count };

		// the batches: a kind can list each instance of its model at most once at a time
		this.batches = {};
		for ( const which of [ 'hard', 'soft' ] ) {

			const B = data.batches[ which ], D = B.cull;
			const cap = new Array( B.kinds.length ).fill( 0 );
			for ( let i = 0; i < B.count; i ++ ) {

				for ( let l = 0; l < D.lods[ i ]; l ++ ) cap[ D.kind0[ i ] + l ] ++;
				if ( D.proxy[ i ] >= 0 ) cap[ D.proxy[ i ] ] ++;

			}

			this.batches[ which ] = new KindBatch( 'Reef.' + which, { geometry: B, kinds: B.kinds, records: B.records, count: B.count, stride: 4, capacity: cap } );
			// (the reef doesn't move: its geometry and records leave the page once on the GPU)
			this.batches[ which ].releaseAfterUpload( { records: true } );

		}

		this.noise3D = createNoiseVolume( data.noise || noiseVolumeData() );
		releaseTexture( this.noise3D );
		// the main camera and the draw distance, for the distance shrink
		this.view = { position: { value: new THREE.Vector3( 0, - 1000, 0 ) }, range: { value: this.cfg.under } };
		const mats = this.materials = createReefMaterials( { hard: this.batches.hard, soft: this.batches.soft, noise: this.noise3D, ground, view: this.view, lite: this.cfg.lite } );
		this.batches.hard.setMaterial( mats.hard, mats.hardDepth, { castShadow: this.cfg.shadows } );
		this.batches.soft.setMaterial( mats.soft );
		for ( const b of Object.values( this.batches ) ) for ( const m of b.meshes ) {

			// (the shadow proxies only where shadows are drawn)
			if ( m.layers.mask === 2 && ! this.cfg.shadows ) continue;
			this.group.add( m );

		}

		this._cullPos = new THREE.Vector3( Infinity, 0, 0 );
		this._cullQuat = new THREE.Quaternion();
		this.visible = false;
		scene.add( this.group );

	}

	// Highest solid surface (seabed or coral / rock top) at x, z.
	floorHeightAt( x, z ) {

		return reefFloorAt( this.hf, this.terrain, x, z );

	}

	// the sun's shadow camera also draws the proxies (layer 1: drawn in the shadow passes only;
	// three r186 tests the view camera's layers there, which App enables for its shadow pass)
	shadowsFrom( light ) {

		if ( this.cfg.shadows ) light.shadow.camera.layers.enable( 1 );

	}

	// Per frame: culling and levels of detail (when the camera moved).
	update( camera ) {

		const p = camera.getWorldPosition( this._p || ( this._p = new THREE.Vector3() ) );
		const e = this.extent;
		const dx = Math.max( e.x0 - p.x, 0, p.x - e.x1 ), dz = Math.max( e.z0 - p.z, 0, p.z - e.z1 );
		const near = Math.hypot( dx, dz ) < RANGE_FAR + 10 && p.y < 100;
		if ( ! near ) {

			if ( this.visible ) for ( const b of Object.values( this.batches ) ) b.hide();
			this.visible = false;
			this._cullPos.set( Infinity, 0, 0 );
			return;

		}

		this.visible = true;
		this.cullFor( camera, p );

	}

	// Picks the instances to draw for this camera and their levels of detail.
	cullFor( camera, p ) {

		// nothing changes while the camera is still
		camera.updateMatrixWorld();
		const q = camera.getWorldQuaternion( this._q || ( this._q = new THREE.Quaternion() ) );
		if ( p.distanceToSquared( this._cullPos ) < 0.0025 && q.angleTo( this._cullQuat ) < 0.002 ) return;
		this._cullPos.copy( p );
		this._cullQuat.copy( q );
		_m.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		_frustum.setFromProjectionMatrix( _m, camera.coordinateSystem );
		// from above the water the range grows with the height on high (aerial views of the bay)
		const C = this.cfg;
		const range = p.y < 0.3 ? C.under : Math.min( RANGE_FAR, C.above + Math.max( 0, p.y ) * C.aboveK );
		this.view.position.value.copy( p );
		this.view.range.value = range;
		const maxR = range + CELL;
		const shadowR = C.shadows ? SHADOW_RANGE + CELL : 0;
		const cx = p.x, cy = p.y, cz = p.z;
		const hard = this.batches.hard, soft = this.batches.soft;
		hard.begin();
		soft.begin();
		for ( const cell of this.cells ) {

			const dx = cell.x - cx, dz = cell.z - cz;
			const d2 = dx * dx + dz * dz;
			if ( d2 > maxR * maxR && d2 > shadowR * shadowR ) continue;
			const pad = cell.r + 1;
			_box.min.set( cell.x - CELL * 0.5 - pad, cell.ymin - 0.5, cell.z - CELL * 0.5 - pad );
			_box.max.set( cell.x + CELL * 0.5 + pad, cell.ymax + 0.5, cell.z + CELL * 0.5 + pad );
			const visible = d2 <= maxR * maxR && _frustum.intersectsBox( _box );
			const shadowCell = d2 < shadowR * shadowR;
			if ( ! visible && ! shadowCell ) continue;
			// (from above the water: only cells reaching up near the surface)
			const seen = visible && ( cy < 0.3 || cell.ymax > C.shallow );
			this.cullList( cell.hard, this.cull.hard, hard, cx, cy, cz, range, seen );
			if ( seen ) this.cullList( cell.soft, this.cull.soft, soft, cx, cy, cz, range, true );

		}

		hard.commit();
		soft.commit();

	}

	cullList( ids, D, batch, cx, cy, cz, range, visible ) {

		const C = this.cfg, k = C.lod, minSize = C.minSize;
		const shallow = cy < 0.3 ? - Infinity : C.shallow;
		for ( let j = 0; j < ids.length; j ++ ) {

			const i = ids[ j ];
			const dx = D.x[ i ] - cx, dy = D.y[ i ] - cy, dz = D.z[ i ] - cz;
			const d = Math.sqrt( dx * dx + dy * dy + dz * dz );
			// shadow proxies of large structures near the camera, in any direction
			if ( C.shadows && D.proxy[ i ] >= 0 && d < SHADOW_RANGE + D.r[ i ] && D.r[ i ] > SHADOW_SIZE ) batch.add( D.proxy[ i ], i );
			const dm = Math.min( D.dmax[ i ], range );
			if ( ! visible || d > dm || D.r[ i ] < d * minSize || D.y[ i ] + D.r[ i ] * 0.6 < shallow ) continue;
			const d0 = D.d0[ i ] * k, d1 = D.d1[ i ] * k, d2 = D.d2[ i ] * k;
			const lod = Math.min( d < d0 ? 0 : d < d1 ? 1 : d < d2 ? 2 : 3, D.lods[ i ] - 1 );
			const kind = D.kind0[ i ] + lod;
			if ( ! C.fades ) {

				batch.add( kind, i );
				continue;

			}

			// faded out (dithered) over the last tenth of the draw distance
			if ( d > dm * 0.9 ) {

				batch.addFade( kind, i, 1 - bandFade( d, dm * 0.9, dm ), false );
				continue;

			}

			// cross-faded into the next level over the last 12 % before its switch distance
			const sw = lod === 0 ? d0 : lod === 1 ? d1 : d2;
			if ( lod < D.lods[ i ] - 1 && d > sw * 0.88 ) {

				const f = bandFade( d, sw * 0.88, sw );
				batch.addFade( kind, i, f, true );
				batch.addFade( kind + 1, i, f, false );

			} else batch.add( kind, i );

		}

	}

	get stats() {

		const b = this.batches;
		let draws = 0;
		for ( const x of Object.values( b ) ) for ( const k of x.kinds ) if ( k.n > 0 && ! k.shadowOnly ) draws ++;
		return {
			instances: this.instances,
			visible: { hard: b.hard.visibleInstances, soft: b.soft.visibleInstances },
			triangles: b.hard.visibleTriangles + b.soft.visibleTriangles,
			shadowTriangles: b.hard.shadowTriangles,
			drawCalls: draws,
			counts: this.counts, timings: this.timings,
		};

	}

	dispose() {

		for ( const b of Object.values( this.batches ) ) b.dispose();
		for ( const m of Object.values( this.materials ) ) m.dispose();
		this.noise3D.dispose();
		this.group.removeFromParent();

	}

}
