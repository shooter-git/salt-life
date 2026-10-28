// (M14) Plain-node tests of the rock overhangs to shelter under (world/terrain/Overhangs.js): each on
// both islands (the low tier's, and the others'), its standing room, the rock over it there (the mesh as
// the field has it, facing out, closed), its colliders letting you stand under it and not into it, the
// ground it stands on, and among the rocks: the scattered ones where it stands taken away, nothing growing
// under it, the rain's rock cover drawing it.
import { readFileSync } from 'node:fs';
import * as THREE from '../src/engine/index.js';
import { OVERHANGS, HEADROOM, buildOverhang, overhangColliders, standingRoom, clears } from '../src/world/terrain/Overhangs.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Colliders } from '../src/world/Colliders.js';
import { Village } from '../src/world/Village.js';
import { Rocks } from '../src/world/Rocks.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

const island = ( file ) => new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ file }`, import.meta.url ) ) ) ) );
// (the room each gives at the least, m²)
const ROOM = { ledge: 10, slab: 8, stack: 4 };

for ( const file of [ 'island-1024.bin', 'island.bin' ] ) {

	const T = island( file );
	ok( OVERHANGS.length === 3 && [ 'ledge', 'slab', 'stack' ].every( ( k ) => OVERHANGS.some( ( s ) => s.kind === k ) ), `${ file }: three, one of each: the ledge, the slab, the stack` );
	for ( const site of OVERHANGS ) {

		const t0 = performance.now();
		const o = buildOverhang( site, T, { cell: 0.25 } );
		const ms = performance.now() - t0;
		const g = o.geometry, P = g.attributes.position, tris = g.index.count / 3;
		const name = `${ file } ${ site.kind }`;
		ok( tris > 2000 && tris < 30000 && ! P.array.some( Number.isNaN ) && g.attributes.ao, `${ name }: ${ tris } triangles in ${ ms.toFixed( 0 ) } ms, its cavity term` );

		// the ground it stands on: the ledge and the slab above the sea's reach on a calm day, the stack in
		// the shallows (wading depth)
		if ( site.kind === 'stack' ) {

			const d = - T.heightAt( site.x, site.z );
			ok( d > 0.2 && d < 0.9, `${ name }: standing in ${ d.toFixed( 2 ) } m of water` );

		} else ok( o.y0 > 0.8, `${ name }: its floor ${ o.y0.toFixed( 2 ) } m above the sea` );

		// room to stand under it, the rock over every bit of it
		const room = standingRoom( o );
		const head = room.spots.map( ( s ) => s.under - s.ground ).sort( ( a, b ) => a - b );
		ok( room.area >= ROOM[ site.kind ] && head[ 0 ] >= HEADROOM - 1e-6, `${ name }: ${ room.area.toFixed( 1 ) } m² to stand in under it, ${ HEADROOM } to ${ head[ head.length - 1 ].toFixed( 1 ) } m of rock over it` );

		// the mesh is the field: straight up from a standing spot it meets the rock where the field has it
		const mesh = new THREE.Mesh( g, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) );
		mesh.matrixAutoUpdate = false;
		mesh.matrix.copy( o.matrix );
		mesh.matrixWorld.copy( o.matrix );
		const ray = new THREE.Raycaster();
		let met = 0, near = 0;
		// (every third spot: a sample of a few tens, so a few at its lip don't decide it)
		const sample = room.spots.filter( ( s, k ) => k % 3 === 0 );
		for ( const s of sample ) {

			ray.set( new THREE.Vector3( s.x, s.ground + 0.05, s.z ), new THREE.Vector3( 0, 1, 0 ) );
			const hit = ray.intersectObject( mesh )[ 0 ];
			if ( hit ) met ++;
			if ( hit && Math.abs( hit.point.y - s.under ) < 0.35 ) near ++;

		}

		// (at the very lip, within a cell of its edge, the mesh may be a few centimetres short of the grid)
		ok( met >= sample.length * 0.9 && near >= sample.length * 0.85, `${ name }: straight up from where you stand the rain meets the rock (${ met } of ${ sample.length }), where the field has its underside (${ near })` );

		// closed (each edge two triangles'), and facing out of the rock
		// (by where its ends are: a crease splits a vertex in two at one place)
		const I = g.index.array, edges = new Map(), at = new Map(), where = ( v ) => {

			const key = `${ P.getX( v ).toFixed( 4 ) },${ P.getY( v ).toFixed( 4 ) },${ P.getZ( v ).toFixed( 4 ) }`;
			if ( ! at.has( key ) ) at.set( key, at.size );
			return at.get( key );

		};
		for ( let t = 0; t < I.length; t += 3 ) for ( let e = 0; e < 3; e ++ ) {

			const a = where( I[ t + e ] ), b = where( I[ t + ( e + 1 ) % 3 ] ), key = a < b ? a * 1e7 + b : b * 1e7 + a;
			edges.set( key, ( edges.get( key ) || 0 ) + 1 );

		}

		// (an edge of one triangle is a hole; of four, two surfaces touching along it, as surface nets leaves
		// where the basalt's steps meet in a cell: no hole)
		const open = [ ...edges.values() ].filter( ( n ) => n === 1 || n === 3 ).length;
		const N = g.attributes.normal;
		let out = 0;
		for ( let q = 0; q < P.count; q += 13 ) {

			const x = P.getX( q ), y = P.getY( q ), z = P.getZ( q ), nx = N.getX( q ), ny = N.getY( q ), nz = N.getZ( q );
			if ( o.at( x + nx * 0.3, y + ny * 0.3, z + nz * 0.3 ) > o.at( x - nx * 0.3, y - ny * 0.3, z - nz * 0.3 ) ) out ++;

		}

		const checked = Math.ceil( P.count / 13 );
		// (where it's creased, a vertex's normal is one side's, and 0.3 m out along it at a concave crease may
		// be the rock across it: an inside-out mesh would be under half)
		ok( open <= edges.size * 0.002 && out >= checked * 0.9, `${ name }: closed (${ open } of ${ edges.size } edges open), facing out (${ out } of ${ checked })` );

		// (M14) one piece: nothing of it loose (no block cut off by the basalt's grooves and floating, none of
		// the grid's specks), its triangles joined by where their corners are
		const parent = Array.from( { length: at.size }, ( _, i ) => i ), root = ( a ) => {

			while ( parent[ a ] !== a ) a = parent[ a ] = parent[ parent[ a ] ];
			return a;

		};
		for ( let t = 0; t < I.length; t += 3 ) {

			const a = root( where( I[ t ] ) );
			parent[ root( where( I[ t + 1 ] ) ) ] = a;
			parent[ root( where( I[ t + 2 ] ) ) ] = a;

		}

		const pieces = new Set( Array.from( I, ( v ) => root( where( v ) ) ) ).size;
		// and its flows, for its shading: each flow's own tone, its top's crust
		const F2 = g.attributes.flow, tones = new Set(), crust = [ 0, 0 ];
		for ( let q = 0; q < F2.count; q ++ ) {

			tones.add( F2.getX( q ).toFixed( 3 ) );
			crust[ F2.getY( q ) > 0.5 ? 1 : 0 ] ++;

		}

		ok( pieces === 1 && tones.size >= 4 && crust[ 1 ] > crust[ 0 ] * 0.15 && crust[ 1 ] < crust[ 0 ], `${ name }: one piece, ${ tones.size } flows each its own tone, ${ ( crust[ 1 ] / F2.count * 100 ).toFixed( 0 ) }% of it their tops' crusts` );

		// its colliders (made with its far shape, at the load: the rocks' way): how much of it you can stand
		// in and be left where you are (not up against its sides, someone's breadth); at its foot against its
		// mass, pushed off
		const C = new Colliders();
		for ( const b of overhangColliders( buildOverhang( site, T, { cell: 0.5 } ) ) ) C.addBox( b.center, b.half, b.rotY );
		let free = 0, mid = null;
		for ( const sp of room.spots ) {

			const p = new THREE.Vector3( sp.x, sp.ground, sp.z ), was = p.clone();
			C.resolveCapsule( p, 0.3, 1.75, 0.4 );
			if ( p.distanceTo( was ) < 0.01 ) {

				free ++;
				mid = mid || sp;

			}

		}

		const [ ix, iz ] = o.world( 0, site.kind === 'stack' ? - 1.6 : - 3.4 );
		const into = new THREE.Vector3( ix, T.heightAt( ix, iz ), iz ), at0 = into.clone();
		C.resolveCapsule( into, 0.3, 1.75, 0.4 );
		ok( free * 0.0625 >= ROOM[ site.kind ] / 3 && into.distanceTo( at0 ) > 0.2, `${ name }: ${ ( free * 0.0625 ).toFixed( 1 ) } m² of it you can stand in (someone's breadth off its sides), and you can't walk into it (pushed ${ into.distanceTo( at0 ).toFixed( 2 ) } m off)` );

		// nothing grows under it or in its mouth; 20 m out from it, as before
		const [ mx, mz ] = o.world( 0, 0.5 ), [ fx, fz ] = o.world( 0, 20 );
		ok( mid && clears( o, mid.x, mid.z ) && clears( o, mx, mz ) && ! clears( o, fx, fz ), `${ name }: nothing grows under it or in its mouth, as before 20 m out` );

	}

}

// ---- among the rocks, as the game places them (clear of the village; its textures aren't baked here)
const T = island( 'island-1024.bin' );
const colliders = new Colliders(), village = new Village( { scene: new THREE.Scene(), terrain: T, colliders, tier: 'low' } );
village.textures.bake = async () => {};
await village.init( null );
const rocks = new Rocks( { scene: new THREE.Scene(), terrain: T, colliders, village, lite: true } );
const mine = rocks.instances.filter( ( r ) => r.overhang );
ok( mine.length === 3 && rocks.overhangs.length === 3 && mine.every( ( r ) => rocks.buckets[ r.style ].members[ 0 ] === r ), `among the rocks: the three, each its own bucket (${ rocks.timings.place.toFixed( 0 ) } ms to place them all, the three coarse)` );
const coarse = mine.map( ( r ) => rocks.buckets[ r.style ].nearTris );
const t0 = performance.now();
await rocks.refineOverhangs();
const fine = mine.map( ( r ) => rocks.buckets[ r.style ].nearTris );
ok( fine.every( ( n, k ) => n > coarse[ k ] * 2 ) && mine.every( ( r ) => rocks.buckets[ r.style ].near.geometry.attributes.iLod ), `after the start, their near shapes made finer (${ coarse.join( ', ' ) } to ${ fine.join( ', ' ) } triangles, ${ ( performance.now() - t0 ).toFixed( 0 ) } ms), faded as the rocks are` );
const crowding = rocks.instances.filter( ( r ) => ! r.overhang && rocks.overhangs.some( ( o ) => Math.hypot( r.x - o.x, r.z - o.z ) < o.radius + r.size ) );
ok( crowding.length === 0, 'no scattered rock where one stands' );
ok( rocks.instances.length > 600, `the rest of the rocks as they were (${ rocks.instances.length })` );
for ( const o of rocks.overhangs ) {

	const around = rocks.around( o.x - 2, o.z - 2, o.x + 2, o.z + 2 );
	ok( around.some( ( r ) => r.geometry === rocks.buckets[ mine.find( ( m ) => m.matrix === o.matrix ).style ].near.geometry ), `the rain's rock cover draws the ${ o.site.kind }` );

}

console.log( fails ? `\n${ fails } FAILED` : '\nall ok' );
process.exit( fails ? 1 : 0 );
