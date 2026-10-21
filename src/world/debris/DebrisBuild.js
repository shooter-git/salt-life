import { Vector3 } from '../../engine/index.js';
import { Builder, Batch, setGeometryDetail } from '../village/GeoBuilder.js';
import { InstancedProps } from '../Props.js';
import { TerrainData } from '../TerrainData.js';
import { Colliders } from '../Colliders.js';
import { DebrisPlacer } from './DebrisPlacement.js';
import { KIND } from './DebrisShapes.js';

// (Salt Life) The debris made from plain data, so that it can be made in a worker (DebrisWorker):
// the placement (DebrisPlacement), the geometry, and its sorting into areas. Its garbage (tens of
// megabytes while the island is made) stays out of the page's script memory, and the page keeps
// drawing meanwhile. Debris.js turns the result into meshes.
//
// input (debrisInput()):
//   terrain    { res, texel, origin, size, heights, sand, rock, path }   (TerrainData's)
//   village    { buildings: [ { name, stilts, x, z, floorY } ], path, sidePaths, footprints } or null
//   vegetation { records: { palms, trees, bananas, youngPalms } } or null
//   rocks      { instances: [ { x, y, z, size } ] } or null
//   colliders  { boxes: [ { center, half, rotY, walkable, solid, tag } ], cylinders } (Colliders')
//   seed, detail (GeoBuilder's geometry detail), lite (low and mid: fewer small items), mask (the
//   pebbles' mask), area (m: the areas' size)
// output:
//   batches    { wood, hard, nature, nets }: each { position, normal, uv, tint, vdata, index (typed
//              arrays), areas: [ { key, ranges: [ { start, count } ] per kind, sphere: [ x, y, z, r ],
//              box: [ x0, y0, z0, x1, y1, z1 ] } ] }; nature's ranges: shadow casters, the rest
//   colliders  [ [ 'box', cx, cy, cz, hx, hy, hz, rotY, tag ] | [ 'cyl', x, z, r, y0, y1, tag ] ]:
//              the colliders the placement added, in order
//   scanned, counts, mask, timings

// what the placement reads, as plain data (structured-cloneable)
export function debrisInput( { terrain, village, vegetation, rocks, colliders, seed = 5150, detail = 1, lite = false, mask = true, area = 96 } ) {

	const T = terrain;
	const lane = ( l ) => l && { width: l.width, samples: l.samples.map( ( s ) => ( { p: { x: s.p.x, z: s.p.z } } ) ) };
	const R = vegetation && vegetation.records;
	return {
		terrain: { res: T.res, texel: T.texel, origin: T.origin, size: T.size, heights: T.heights, sand: T.sand, rock: T.rock, path: T.path },
		village: village ? {
			buildings: village.buildings.map( ( b ) => ( { name: b.name, stilts: b.stilts, x: b.x, z: b.z, floorY: b.floorY } ) ),
			path: lane( village.path ),
			sidePaths: ( village.sidePaths || [] ).map( lane ),
			footprints: village.getFootprints().map( ( f ) => ( { kind: f.kind, x: f.x, z: f.z, r: f.r } ) ),
		} : null,
		vegetation: R ? { records: {
			palms: ( R.palms || [] ).map( ( r ) => ( { x: r.x, z: r.z, s: r.s } ) ),
			trees: ( R.trees || [] ).map( ( r ) => ( { x: r.x, z: r.z, s: r.s } ) ),
			bananas: ( R.bananas || [] ).map( ( r ) => ( { x: r.x, z: r.z } ) ),
			youngPalms: ( R.youngPalms || [] ).map( ( r ) => ( { x: r.x, z: r.z } ) ),
		} } : null,
		rocks: rocks ? { instances: rocks.instances.map( ( r ) => ( { x: r.x, y: r.y, z: r.z, size: r.size } ) ) } : null,
		colliders: colliders ? {
			boxes: colliders.boxes.map( ( b ) => ( { center: { x: b.center.x, y: b.center.y, z: b.center.z }, half: { x: b.half.x, y: b.half.y, z: b.half.z }, rotY: b.rotY, walkable: b.walkable, solid: b.solid, tag: b.tag } ) ),
			cylinders: colliders.cylinders.map( ( c ) => ( { x: c.x, z: c.z, radius: c.radius, yMin: c.yMin, yMax: c.yMax, tag: c.tag } ) ),
		} : null,
		seed, detail, lite, mask, area,
	};

}

export function buildDebris( input ) {

	const t0 = performance.now();
	setGeometryDetail( input.detail );
	const terrain = Object.assign( Object.create( TerrainData.prototype ), input.terrain );
	const village = input.village && { ...input.village, getFootprints: () => input.village.footprints };
	// the colliders the placement sees (the island's), and the ones it adds, recorded
	const ops = [];
	let colliders = null;
	if ( input.colliders ) {

		colliders = new Colliders();
		for ( const b of input.colliders.boxes ) colliders.addBox( new Vector3( b.center.x, b.center.y, b.center.z ), new Vector3( b.half.x, b.half.y, b.half.z ), b.rotY, b );
		for ( const c of input.colliders.cylinders ) colliders.addCylinder( c.x, c.z, c.radius, c.yMin, c.yMax, c );
		const addBox = colliders.addBox.bind( colliders ), addCylinder = colliders.addCylinder.bind( colliders );
		colliders.addBox = ( center, half, rotY = 0, o = {} ) => {

			ops.push( [ 'box', center.x, center.y, center.z, half.x, half.y, half.z, rotY, o.tag || '' ] );
			return addBox( center, half, rotY, o );

		};

		colliders.addCylinder = ( x, z, r, y0, y1, o = {} ) => {

			ops.push( [ 'cyl', x, z, r, y0, y1, o.tag || '' ] );
			return addCylinder( x, z, r, y0, y1, o );

		};

	}

	const B = new Builder();
	const inst = new InstancedProps( B );
	const placer = new DebrisPlacer( {
		B, inst, terrain, village, vegetation: input.vegetation, rocks: input.rocks, colliders, seed: input.seed, mask: input.mask,
	} ).run();
	const t1 = performance.now();

	// ---- the batches: rope into hard, net scraps and the traps' netting into nets
	const take = ( key ) => {

		const b = B.batches[ key ];
		delete B.batches[ key ];
		return b;

	};

	const wood = B.batch( 'wood' ), hard = B.batch( 'hard' ), nature = B.batch( 'nature' );
	const rope = take( 'rope' ), net = take( 'net' );
	if ( rope ) hard.append( rope, ( d ) => [ d[ 0 ], 0, 0, 2 + d[ 1 ] ] );
	const nets = new Batch();
	if ( net ) nets.append( net, ( d ) => [ d[ 0 ], d[ 1 ], Math.max( 0.02, d[ 2 ] ), 0 ] );

	// contact occlusion: darken what touches the ground (sides and undersides more than tops)
	for ( const b of [ wood, hard, nature, nets ] ) bakeContact( b, terrain );

	// per triangle of the natural items: 0 a shadow caster (bigger stones, whole coconuts, logs),
	// 1 the rest, -1 left out. Low and mid leave out the small natural items (shells, coral
	// rubble, twigs, husks: under 15 cm) and 6 coconuts in 10: about 35k of the 100k triangles
	const natKinds = new Int8Array( nature.icount / 3 );
	{

		const D = nature.data, I = nature.idx;
		for ( let t = 0; t < natKinds.length; t ++ ) {

			const v = I[ t * 3 ] * 4;
			const kind = D[ v + 1 ], size = D[ v + 3 ];
			if ( input.lite && ( size < 0.15 || ( kind === KIND.COCONUT && D[ v ] % 1 < 0.6 ) ) ) natKinds[ t ] = - 1;
			else {

				const caster = ( kind === KIND.STONE && size >= 0.2 ) || ( kind === KIND.DRIFT && size >= 0.1 ) || ( kind === KIND.CORAL && size >= 0.15 && D[ v + 2 ] >= 2 );
				natKinds[ t ] = caster ? 0 : 1;

			}

		}

	}

	const batches = {
		wood: split( wood, null, 1, input.area ),
		hard: split( hard, null, 1, input.area ),
		nature: split( nature, natKinds, 2, input.area ),
		nets: split( nets, null, 1, input.area ),
	};
	const t2 = performance.now();
	return {
		batches, colliders: ops, scanned: placer.scanned, counts: placer.counts, mask: placer.mask,
		timings: { place: t1 - t0, ...placer.timings, assemble: t2 - t1, total: t2 - t0 },
	};

}

// the array buffers of an output (to transfer from the worker)
export function transferables( out ) {

	const list = new Set();
	for ( const k in out.batches ) {

		const b = out.batches[ k ];
		if ( b ) for ( const a of [ b.position, b.normal, b.uv, b.tint, b.vdata, b.index ] ) list.add( a.buffer );

	}

	if ( out.mask ) list.add( out.mask.data.buffer );
	return [ ...list ];

}

// multiply the vertex tint by a ground-contact occlusion term
function bakeContact( b, T ) {

	const P = b.pos, N = b.nrm, C = b.tint;
	for ( let i = 0; i < b.vcount; i ++ ) {

		const x = P[ i * 3 ], y = P[ i * 3 + 1 ], z = P[ i * 3 + 2 ];
		const above = y - T.heightAt( x, z );
		if ( above > 0.14 ) continue;
		const t = Math.max( 0, Math.min( 1, above / 0.14 ) );
		const k = 1 - t * t * ( 3 - 2 * t );
		const up = Math.max( 0, N[ i * 3 + 1 ] );
		const ao = 1 - 0.38 * k * ( 1 - 0.8 * up );
		C[ i * 3 ] *= ao; C[ i * 3 + 1 ] *= ao; C[ i * 3 + 2 ] *= ao;

	}

}

// A batch's arrays (exact length, each its own buffer) with its triangles sorted by area (A m
// squares, by each triangle's first vertex), then by kind (0 .. nk - 1; null: all 0; -1 left out)
// within an area; per area the index range of each kind and the bounds. null if it is empty.
function split( batch, kinds, nk, A ) {

	if ( batch.icount === 0 ) return null;
	const P = batch.pos, I = batch.idx;
	const nt0 = batch.icount / 3;
	const keyOf = ( t ) => {

		const v = I[ t * 3 ] * 3;
		return Math.floor( P[ v ] / A ) * 4096 + Math.floor( P[ v + 2 ] / A );

	};

	let n = 0;
	const keys = new Float64Array( nt0 ), kept = new Uint32Array( nt0 );
	for ( let t = 0; t < nt0; t ++ ) {

		const k = kinds ? kinds[ t ] : 0;
		if ( k < 0 ) continue;
		kept[ n ++ ] = t;
		keys[ t ] = keyOf( t ) * 8 + k;

	}

	if ( n === 0 ) return null;
	// (a counting sort: a few hundred distinct keys, the triangles keep their order within one)
	const bin = new Map();
	for ( let i = 0; i < n; i ++ ) bin.set( keys[ kept[ i ] ], 0 );
	const distinct = [ ...bin.keys() ].sort( ( a, b ) => a - b );
	const start = new Uint32Array( distinct.length + 1 );
	distinct.forEach( ( k, b ) => bin.set( k, b ) );
	for ( let i = 0; i < n; i ++ ) start[ bin.get( keys[ kept[ i ] ] ) + 1 ] ++;
	for ( let b = 0; b < distinct.length; b ++ ) start[ b + 1 ] += start[ b ];
	const order = new Uint32Array( n );
	for ( let i = 0; i < n; i ++ ) order[ start[ bin.get( keys[ kept[ i ] ] ) ] ++ ] = kept[ i ];

	const nv = batch.vcount;
	const index = nv > 65535 ? new Uint32Array( n * 3 ) : new Uint16Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) {

		const t = order[ i ];
		index[ i * 3 ] = I[ t * 3 ]; index[ i * 3 + 1 ] = I[ t * 3 + 1 ]; index[ i * 3 + 2 ] = I[ t * 3 + 2 ];

	}

	const areas = [];
	let i = 0;
	while ( i < n ) {

		const key = Math.floor( keys[ order[ i ] ] / 8 );
		const ranges = [];
		for ( let k = 0; k < nk; k ++ ) ranges.push( { start: 0, count: 0 } );
		let hi = 0;
		const box = [ Infinity, Infinity, Infinity, - Infinity, - Infinity, - Infinity ];
		for ( ; i < n && Math.floor( keys[ order[ i ] ] / 8 ) === key; i ++ ) {

			const k = keys[ order[ i ] ] - key * 8;
			if ( ranges[ k ].count === 0 ) ranges[ k ].start = i * 3;
			ranges[ k ].count += 3;
			hi = i * 3 + 3;
			for ( let c = 0; c < 3; c ++ ) {

				const v = index[ i * 3 + c ] * 3;
				for ( let a = 0; a < 3; a ++ ) {

					if ( P[ v + a ] < box[ a ] ) box[ a ] = P[ v + a ];
					if ( P[ v + a ] > box[ a + 3 ] ) box[ a + 3 ] = P[ v + a ];

				}

			}

		}

		// (an empty kind starts where the next one does)
		for ( let k = nk - 1; k >= 0; k -- ) if ( ranges[ k ].count === 0 ) ranges[ k ].start = k + 1 < nk ? ranges[ k + 1 ].start : hi;
		const cx = ( box[ 0 ] + box[ 3 ] ) / 2, cy = ( box[ 1 ] + box[ 4 ] ) / 2, cz = ( box[ 2 ] + box[ 5 ] ) / 2;
		const r = Math.hypot( box[ 3 ] - box[ 0 ], box[ 4 ] - box[ 1 ], box[ 5 ] - box[ 2 ] ) / 2;
		areas.push( { key, ranges, sphere: [ cx, cy, cz, r ], box } );

	}

	return {
		position: batch.pos.slice( 0, nv * 3 ), normal: batch.nrm.slice( 0, nv * 3 ), uv: batch.uv.slice( 0, nv * 2 ),
		tint: batch.tint.slice( 0, nv * 3 ), vdata: batch.data.slice( 0, nv * 4 ), index, areas,
	};

}
