import { Group, BufferGeometry, BufferAttribute, Mesh, Sphere, Box3, Vector3 } from '../engine/index.js';
import { releaseGeometry } from '../core/ReleaseAfterUpload.js';
import { geometryDetail } from './village/GeoBuilder.js';
import { debrisInput, buildDebris } from './debris/DebrisBuild.js';
import DebrisWorker from './debris/DebrisWorker.js?worker&inline';
import { createNatureMaterial } from './debris/NatureMaterial.js';
import { PebbleField } from './debris/PebbleField.js';
import { ScannedDebris } from './debris/ScannedDebris.js';

// Ground clutter and debris: the shoreline wrack line (driftwood, seaweed, coconuts, shells,
// coral, rope, net scraps, floats, a little litter), rocky-cove stones, fallen palm fronds, and
// the lived-in details around the village (crate stacks, barrels, lobster traps, floats, tyres,
// buckets, boards, firewood, skiffs, a wheelbarrow, dry-stone walls),
// plus a camera-following field of pebbles, cobbles and shell grit (debris/PebbleField).
//
// Placement: debris/DebrisPlacement (keeps clear of boardwalks, the pier, paths, doorways, the
// spawn point, colliders, plant trunks and rocks; adds colliders for the larger items).
// Geometry: debris/DebrisShapes and the village prop emitters, merged per material.
// (Salt Life: both made in a worker, debris/DebrisBuild: Debris.create().)
//
// Draw calls: up to 4 per area in view and in range (see below), plus the pebbles and the scans.
//   wood (village wood material: driftwood, boards, crates, traps, barrels' staves)
//   hard (village hard material + rope: tyres, floats, metal, plastic, rope)
//   nature (NatureMaterial: stones, coconuts, weed, shells, coral, fronds)
//   net (village net material: net scraps and trap nets)
//   pebbles (PebbleField; high)
// On high, wood and hard cast shadows, and of the natural items the larger ones (stones, coconuts,
// logs: the nature mesh narrows its draw range in the shadow passes). Small items and the pebbles
// cast no shadows. The village materials are shared (same programs and textures).
//
// (Salt Life) Areas: the debris is spread over the whole island (AREA m squares), so each area is
// its own set of meshes, culled by the view and drawn only within `range` m. Tidewater drew all of
// it everywhere.

const AREA = 96; // m (Salt Life: see above)

export class Debris {

	// Makes the debris (in a worker where it can: debris/DebrisBuild) and returns a Debris.
	// terrain: TerrainData (CPU), ground: the Terrain (its shader uniforms); tier: 'low' | 'mid' |
	// 'high'. (Salt Life: mid is drawn about as low: its triangles are mostly spent on the island
	// already. Low and mid: none of the smallest items, no pebbles, no shadows, shorter range, the
	// scans without their finest level; low also the lite nature material and the scans' albedo only)
	static async create( { scene, terrain, ground, village, vegetation = null, rocks = null, colliders = null, seed = 5150, tier = 'high', loader = null, show = true } ) {

		const lite = tier !== 'high';
		const input = debrisInput( { terrain, village, vegetation, rocks, colliders, seed, detail: geometryDetail(), lite, mask: ! lite, area: AREA } );
		let built = null;
		try {

			built = await new Promise( ( resolve, reject ) => {

				const worker = new DebrisWorker();
				worker.onmessage = ( e ) => {

					worker.terminate();
					if ( e.data.error ) reject( new Error( e.data.error ) );
					else resolve( e.data.out );

				};

				worker.onerror = ( e ) => {

					worker.terminate();
					reject( e );

				};

				worker.postMessage( input );

			} );

		} catch ( e ) {

			// (no worker: made here)
			console.warn( 'Debris: made on the page (no worker)', e && e.message );
			built = buildDebris( input );

		}

		// the colliders the placement added, in its order
		if ( colliders ) for ( const c of built.colliders ) {

			if ( c[ 0 ] === 'box' ) colliders.addBox( new Vector3( c[ 1 ], c[ 2 ], c[ 3 ] ), new Vector3( c[ 4 ], c[ 5 ], c[ 6 ] ), c[ 7 ], { tag: c[ 8 ] } );
			else colliders.addCylinder( c[ 1 ], c[ 2 ], c[ 3 ], c[ 4 ], c[ 5 ], { tag: c[ 6 ] } );

		}

		return new Debris( { scene, terrain, ground, village, tier, loader, show, built } );

	}

	// built: debris/DebrisBuild's output
	constructor( { scene, terrain, ground, village, tier = 'high', loader = null, show = true, built } ) {

		this.scene = scene;
		this.terrainData = terrain;
		this.ground = ground;
		this.tier = tier;
		this.lite = tier !== 'high';
		this.range = tier === 'low' ? 75 : tier === 'mid' ? 110 : 260;
		this.group = new Group();
		this.group.name = 'Debris';
		this.group.matrixAutoUpdate = false;
		const t0 = performance.now();
		this.counts = built.counts;
		this.newColliders = built.colliders.length;
		this._assemble( built.batches, village );

		// (Salt Life) 4,700 triangles a 4 m patch: high only, within 20 m
		this.pebbles = this.lite ? null : new PebbleField( { terrain, ground, mask: built.mask, radius: 20 } );
		if ( this.pebbles ) {

			this.group.add( this.pebbles.mesh );
			this.meshes.push( this.pebbles.mesh );

		}

		// photoscanned logs, branches and shells (scanned.load(); show false: drawn after
		// scanned.show())
		this.scanned = new ScannedDebris( { ground, instances: built.scanned, parent: this.group, loader, tier, show } );
		this.timings = { ...built.timings, meshes: performance.now() - t0 };
		scene.add( this.group );

	}

	_assemble( batches, village ) {

		const natureMat = createNatureMaterial( this.ground, { lite: this.tier === 'low' } );
		this.materials = { nature: natureMat };
		const shadows = ! this.lite;
		this.meshes = [];
		this.areas = [];
		this.shadowTriangles = 0;

		// (Salt Life: each material keeps its own buffers, sorted by area: Tidewater merged them into
		// one so that a single shadow draw covered all three)
		for ( const [ key, material, name ] of [ [ 'wood', village.materials.wood, 'debris_wood' ], [ 'hard', village.materials.hard, 'debris_hard' ], [ 'nets', village.materials.net, 'debris_nets' ] ] ) {

			this._areas( batches[ key ], ( geo, area, ranges ) => {

				const mesh = this._mesh( geo, area, ranges[ 0 ], material, name );
				mesh.castShadow = shadows && key !== 'nets';
				if ( mesh.castShadow ) this.shadowTriangles += ranges[ 0 ].count / 3;

			} );

		}

		this._areas( batches.nature, ( geo, area, ranges ) => {

			// casters and the rest drawn as one range; the shadow passes draw the casters only
			const all = { start: ranges[ 0 ].start, count: ranges[ 0 ].count + ranges[ 1 ].count };
			const mesh = this._mesh( geo, area, all, natureMat, 'debris_nature' );
			if ( ! shadows || ranges[ 0 ].count === 0 ) return;
			this.shadowTriangles += ranges[ 0 ].count / 3;
			const range = mesh.geometry.drawRange;
			mesh.castShadow = true;
			mesh.onBeforeShadow = () => {

				range.count = ranges[ 0 ].count;

			};

			mesh.onAfterShadow = () => {

				range.count = all.count;

			};

		} );

		for ( const mesh of this.meshes ) {

			mesh.matrixAutoUpdate = false;
			mesh.updateMatrix();
			// (the arrays are freed once on the GPU: ReleaseAfterUpload)
			releaseGeometry( mesh.geometry );
			this.group.add( mesh );

		}

	}

	// fn( geometry, area, ranges ) for each area of a built batch (debris/DebrisBuild split()): the
	// buffers to draw from (shared by the batch's areas), the area { x, y, z, r, meshes }, the index
	// range of each kind
	_areas( b, fn ) {

		if ( ! b ) return;
		const shared = new BufferGeometry();
		shared.setAttribute( 'position', new BufferAttribute( b.position, 3 ) );
		shared.setAttribute( 'normal', new BufferAttribute( b.normal, 3 ) );
		shared.setAttribute( 'uv', new BufferAttribute( b.uv, 2 ) );
		shared.setAttribute( 'tint', new BufferAttribute( b.tint, 3 ) );
		shared.setAttribute( 'vdata', new BufferAttribute( b.vdata, 4 ) );
		shared.setIndex( new BufferAttribute( b.index, 1 ) );
		for ( const A of b.areas ) {

			const [ cx, cy, cz, r ] = A.sphere;
			let area = this.areas.find( ( a ) => a.key === A.key );
			if ( ! area ) this.areas.push( area = { key: A.key, x: cx, y: cy, z: cz, r, meshes: [] } );
			else area.r = Math.max( area.r, Math.hypot( cx - area.x, cy - area.y, cz - area.z ) + r );
			const geo = {
				shared, sphere: new Sphere( new Vector3( cx, cy, cz ), r ),
				box: new Box3( new Vector3( A.box[ 0 ], A.box[ 1 ], A.box[ 2 ] ), new Vector3( A.box[ 3 ], A.box[ 4 ], A.box[ 5 ] ) ),
			};
			fn( geo, area, A.ranges );

		}

	}

	_mesh( geo, area, range, material, name ) {

		const g = new BufferGeometry();
		for ( const k in geo.shared.attributes ) g.setAttribute( k, geo.shared.attributes[ k ] );
		g.setIndex( geo.shared.index );
		g.boundingSphere = geo.sphere;
		g.boundingBox = geo.box;
		g.setDrawRange( range.start, range.count );
		const mesh = new Mesh( g, material );
		mesh.name = name;
		mesh.receiveShadow = true;
		mesh.castShadow = false;
		area.meshes.push( mesh );
		this.meshes.push( mesh );
		return mesh;

	}

	update( camera ) {

		// areas drawn within range (from their nearest point)
		const e = camera.matrixWorld.elements, cx = e[ 12 ], cz = e[ 14 ];
		for ( const a of this.areas ) {

			const visible = Math.hypot( a.x - cx, a.z - cz ) - a.r < this.range;
			if ( visible === a.visible ) continue;
			a.visible = visible;
			for ( const m of a.meshes ) m.visible = visible;

		}

		if ( this.pebbles ) this.pebbles.update( camera );
		this.scanned.update( camera );

	}

	stats() {

		let triangles = 0;
		for ( const m of this.meshes ) {

			if ( this.pebbles && m === this.pebbles.mesh ) continue;
			const total = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
			triangles += Math.min( total, m.geometry.drawRange.count ) / 3;

		}

		return {
			triangles, pebbleTriangles: this.pebbles ? this.pebbles.triangles : 0, pebbleCells: this.pebbles ? this.pebbles.count : 0,
			scannedInstances: this.scanned.instances.length, scannedTriangles: this.scanned.triangles, scannedReady: this.scanned.ready,
			drawCalls: this.meshes.length, areas: this.areas.length, shadowTriangles: this.shadowTriangles, colliders: this.newColliders,
			counts: this.counts, timings: this.timings,
		};

	}

	dispose() {

		for ( const m of this.meshes ) if ( ! this.pebbles || m !== this.pebbles.mesh ) m.geometry.dispose();
		this.materials.nature.dispose();
		if ( this.pebbles ) this.pebbles.dispose();
		this.scanned.dispose();
		this.scene.remove( this.group );

	}

}
