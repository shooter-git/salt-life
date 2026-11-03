// (v2.0.1) Plain-node test that each boat you can own is boarded from where you can walk to: the pier head as Pier.js
// builds it, its rails, bench and clutter, walked on foot from the pier's stem (a capsule as Player's, by Colliders), to
// where Player.nearBoat offers her (within her boardReach of her boardPoint, and 3.2 m up or down), each boat at her own
// berth (fleet/Berths.js). The sportfisher's cockpit lay behind the head's south rail and its bench: the only way to her
// was a hop over the bench.
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { readFileSync } = await import( 'node:fs' );
const { Vector3 } = await import( '../src/engine/index.js' );
const { TerrainData } = await import( '../src/world/TerrainData.js' );
const { decodeIsland } = await import( '../src/world/terrain/IslandDecode.js' );
const { Builder } = await import( '../src/world/village/GeoBuilder.js' );
const { Colliders } = await import( '../src/world/Colliders.js' );
const { Rand, InstancedProps } = await import( '../src/world/Props.js' );
const { mulberry32 } = await import( '../src/util/Noise.js' );
const { buildPier, PIER } = await import( '../src/world/Pier.js' );
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { berthOf } = await import( '../src/game/fleet/Berths.js' );

let failed = 0;
const ok = ( c, s ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );
	if ( ! c ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const B = new Builder(), colliders = new Colliders(), rand = new Rand( mulberry32( 90210 ) );
buildPier( { B, terrain, colliders, rand, lights: [], inst: new InstancedProps( B ), signB: new Builder(), hang: () => new Builder(), stormB: () => new Builder() } );

// where you can stand on the pier's deck, as Player walks: a 0.1 m grid from the stem, each cell its deck under you and
// nothing solid where you'd stand (RADIUS, HEIGHT, the step Player.updateWalk gives resolveCapsule)
const RADIUS = 0.3, HEIGHT = 1.75, STEP = 0.4, CELL = 0.1, DK = PIER.deckHeight ?? 2.3;
const X0 = PIER.headX0 - 1, X1 = PIER.headX1 + 1, Z0 = 20, Z1 = PIER.zEnd + 1;
const NX = Math.round( ( X1 - X0 ) / CELL ), NZ = Math.round( ( Z1 - Z0 ) / CELL );
const free = ( i, j ) => {

	const x = X0 + i * CELL, z = Z0 + j * CELL, g = colliders.groundHeightAt( x, z, DK + 0.5 );
	if ( Math.abs( g - DK ) > 0.2 ) return null;
	const p = new Vector3( x, g, z );
	if ( colliders.resolveCapsule( p, RADIUS, HEIGHT, STEP ) ) return null;
	return g;

};

const seen = new Map(), q = [];
const start = [ Math.round( ( PIER.x ?? 55 ) - X0 ) / CELL | 0, Math.round( ( 24 - Z0 ) / CELL ) ];
ok( free( start[ 0 ], start[ 1 ] ) !== null, 'the walk starts on the pier\'s stem' );
seen.set( start[ 0 ] + ',' + start[ 1 ], free( start[ 0 ], start[ 1 ] ) );
q.push( start );
while ( q.length ) {

	const [ i, j ] = q.pop();
	for ( const [ di, dj ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

		const a = i + di, b = j + dj, k = a + ',' + b;
		if ( a < 0 || b < 0 || a > NX || b > NZ || seen.has( k ) ) continue;
		const g = free( a, b );
		seen.set( k, g );
		if ( g !== null ) q.push( [ a, b ] );

	}

}

const walked = [ ...seen.entries() ].filter( ( [ , g ] ) => g !== null ).map( ( [ k, g ] ) => {

	const [ i, j ] = k.split( ',' ).map( Number );
	return [ X0 + i * CELL, g, Z0 + j * CELL ];

} );
ok( walked.length > 2000, `${ walked.length } places on the pier you can walk to` );

// (and nothing in the way over the side: no rail, bench or clutter between you and her, at a hand's height)
const IN_WAY = new Set( [ 'pierRail', 'bench', 'table', 'traps', 'crates', 'crate', 'trap' ] );
const clear = ( x, z, bx, bz ) => {

	for ( let t = 0; t <= 1; t += 0.02 ) {

		const px = x + ( bx - x ) * t, pz = z + ( bz - z ) * t;
		for ( const b of colliders.boxes ) {

			if ( ! IN_WAY.has( b.tag ) || DK + 0.6 < b.bottom || DK + 0.6 > b.top ) continue;
			const [ lx, lz ] = colliders._toLocal( b, px, pz );
			if ( Math.abs( lx ) <= b.half.x && Math.abs( lz ) <= b.half.z ) return false;

		}

	}

	return true;

};

for ( const id of [ 'console', 'lobster', 'sportfisher' ] ) {

	const M = await loadBoat( id, 'low' ), P = berthOf( id ), c = Math.cos( P.heading ), s = Math.sin( P.heading );
	// her boardPoint in the world, as she lies at her berth (her frame: +Z forward, y = 0 her waterline)
	const b = M.boardPoint, bx = P.position.x + b.x * c + b.z * s, bz = P.position.z - b.x * s + b.z * c, by = b.y;
	const reach = M.boardReach || 4.2;
	let best = Infinity, at = null;
	for ( const [ x, y, z ] of walked ) {

		const d = Math.hypot( bx - x, bz - z );
		if ( Math.abs( by - y ) < 3.2 && d < best && clear( x, z, bx, bz ) ) {

			best = d;
			at = [ x, z ];

		}

	}

	ok( best < reach, `the ${ id }: offered from the pier on foot, ${ best.toFixed( 2 ) } m from where you step aboard (within ${ reach }), at ${ at && at.map( ( v ) => v.toFixed( 1 ) ).join( ', ' ) }` );
	M.dispose && M.dispose();

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
