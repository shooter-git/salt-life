// (M16) Each boat as the boat she is, playing together: the types in memory, a phone's copy of her, the dock's spare
// berths, how far off she shows, a crew's jobs. Two real games: tools/two-players/boats.mjs.
import { register } from 'node:module';

register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {

	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );

}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { BOATS, loadBoat } = await import( '../src/world/boat/Boats.js' );
const { BoatCopies, LOW_BOAT, SIZE, isBoat, lowMeshes, sizeOf, standInGeometry } = await import( '../src/together/BoatCopies.js' );
const { SPARE_BERTHS, atDock, berthShare, laidAt, spareBerth } = await import( '../src/together/Berths.js' );
const { clockFrom, footY, jobAt, perched, spotted } = await import( '../src/together/Crew.js' );
const { seenHeight, speckAlpha, visualRange } = await import( '../src/together/Specks.js' );
const { boatRecord, cleanBoats } = await import( '../src/game/Away.js' );
const { Scene, Vector3 } = await import( '../src/engine/index.js' );
const { triangleCount } = await import( '../src/world/boat/GeoKit.js' );
const { WORLD } = await import( '../src/world/WorldLayout.js' );

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

// ---- what's known of each without building her
for ( const id of Object.keys( BOATS ) ) {

	const m = await loadBoat( id );
	ok( Math.abs( m.dimensions.length - SIZE[ id ].length ) < 1 && Math.abs( m.dimensions.beam - SIZE[ id ].beam ) < 0.6, `${ id }: her size as known without building her is her size (${ m.dimensions.length.toFixed( 1 ) } by ${ m.dimensions.beam.toFixed( 1 ) } m)` );
	const low = lowMeshes( m ), tris = low.reduce( ( n, x ) => n + triangleCount( x.geometry ), 0 );
	ok( low.length > 0, `${ id }: a phone's copy of her has ${ low.length } mesh(es), ${ tris } triangles` );
	const stand = triangleCount( standInGeometry( id ) );
	ok( stand < 200, `${ id }: her stand-in is ${ stand } triangles` );
	const helm = footY( m, m.helmEye.x, m.helmEye.z, m.helmEye.y - 1 );
	ok( Math.abs( helm - m.dimensions.deckHeight ) < 0.6, `${ id }: someone at her helm stands on her sole (${ helm.toFixed( 2 ) } m, deck ${ m.dimensions.deckHeight.toFixed( 2 ) })` );
	if ( id === 'lobster' ) ok( low.every( ( x ) => LOW_BOAT.includes( x.name ) ) && Math.abs( helm - m.dimensions.deckHeight ) < 1e-6, 'the lobster boat: as a phone drew her before, and her skipper on the same sole' );
	m.dispose();

}

ok( isBoat( 'console' ) && ! isBoat( 'trawler' ) && ! isBoat( undefined ), 'a type from a pose is only taken if it\'s a boat there is' );
ok( sizeOf( 'trawler' ) === SIZE.lobster, 'and a game that doesn\'t say is the lobster boat' );

// ---- the types in memory
{

	const scene = new Scene();
	const own = await loadBoat( 'lobster' );
	const app = { tier: 'mid', boat: own, scene, localLights: { add: () => ( {} ), remove() {} }, instruments: null };
	const c = new BoatCopies( app );
	ok( c.want( 'lobster' ).model === own, 'your own type: your boat, nothing built' );
	const a = c.make( 'lobster' );
	ok( a && a.userData.model === own && a.getObjectByName( 'boat-hull' ).geometry === own.meshes.hull.geometry, 'a copy shares her meshes' );
	ok( c.make( 'console' ) === null, 'another type: not there the moment she\'s asked for' );
	const e = c.types.get( 'console' );
	for ( let i = 0; i < 200 && ! e.model; i ++ ) await new Promise( ( r ) => setTimeout( r, 5 ) );
	ok( !! e.model && e.model.id === 'console', 'and built in the background' );
	const b1 = c.make( 'console' ), b2 = c.make( 'console' );
	ok( b1.getObjectByName( 'boat-hull' ).geometry === b2.getObjectByName( 'boat-hull' ).geometry && e.copies.size === 2, 'two of her, one set of meshes' );
	ok( b1.userData.lamps !== b2.userData.lamps && b1.userData.lamps.points.geometry.attributes.position.count > 0, 'their lamps their own, from her figures' );
	c.tidy( 120 );
	ok( c.types.has( 'console' ), 'kept while any of her is about' );
	c.drop( b1 ); c.drop( b2 );
	c.tidy( 30 );
	ok( c.types.has( 'console' ), 'kept a while after the last' );
	c.tidy( 31 );
	ok( ! c.types.has( 'console' ), 'then let go' );

	// you get into another boat
	const con = c.want( 'console' );
	for ( let i = 0; i < 200 && ! con.model; i ++ ) await new Promise( ( r ) => setTimeout( r, 5 ) );
	const gen = con.gen, mine = await loadBoat( 'console' );
	app.boat = mine;
	const kept = c.boatChanged( own );
	ok( kept === true && c.types.get( 'lobster' ).own === false && c.types.get( 'lobster' ).model === own, 'the boat you left stays for the copies of her still out there' );
	ok( con.model === mine && con.own && con.gen === gen + 1, 'and your new one\'s the template for her type, the built one let go' );
	c.drop( a );
	const none = new BoatCopies( app );
	none.want( 'console' );
	app.boat = own;
	ok( none.boatChanged( mine ) === false && ! none.types.has( 'console' ), 'with no copies of her, she goes as she did' );

	// a phone's: only what it draws stays in memory
	const pa = { tier: 'low', boat: mine, scene, localLights: app.localLights, instruments: null };
	const pc = new BoatCopies( pa ), pe = pc.want( 'lobster' );
	for ( let i = 0; i < 400 && ! pe.model; i ++ ) await new Promise( ( r ) => setTimeout( r, 5 ) );
	const kinds = Object.values( pe.model.meshes ).map( ( x ) => x.name ).sort();
	ok( kinds.join() === [ ...LOW_BOAT ].sort().join() && ! pe.model.wheelMesh && pe.model.boardPoint && pe.model.colliders.length > 0, `low: only ${ kinds.join( ', ' ) } kept, and all that's needed to walk her` );
	const pb = pc.make( 'lobster' );
	let n = 0;
	pb.traverse( ( x ) => { if ( x.isMesh && x.name.startsWith( 'boat-' ) ) n ++; } );
	ok( n === LOW_BOAT.length, `low: a copy draws ${ n } of them` );

}

// ---- the dock
{

	const taken = [];
	for ( let i = 0; i < SPARE_BERTHS; i ++ ) taken.push( spareBerth( i, 4.8 ) );
	const P = WORLD.pier;
	ok( taken.every( ( b ) => Math.abs( b.x - P.x ) - P.width / 2 - 4.8 / 2 > 0 ), 'the spare berths clear the pier, even for the sportfisher' );
	ok( taken.every( ( b ) => b.z + 7.3 < P.zEnd - P.headDepth ), 'and her bow the pier head' );
	for ( let i = 0; i < SPARE_BERTHS; i ++ ) for ( let j = i + 1; j < SPARE_BERTHS; j ++ ) {

		const a = taken[ i ], b = taken[ j ];
		if ( Math.abs( a.x - b.x ) < 4.8 && Math.abs( a.z - b.z ) < 14.6 ) ok( false, `berths ${ i } and ${ j } overlap` );

	}

	const dock = WORLD.boatDock.position;
	ok( atDock( dock.x, dock.z ) && atDock( 45, 36.5 ) && ! atDock( 64, - 40 ) && ! atDock( 300, 300 ), 'the pier head\'s berths are the dock\'s; the kayak\'s shallows and the open water aren\'t' );
	const berth = spareBerth( 0, 2.9 ), from = { x: 64.5, z: 36.5 }, out = new Vector3();
	laidAt( out, new Vector3( 64.6, 0.2, 36.4 ), from, berth, 0, berthShare( 0.14 ) );
	ok( Math.abs( out.x - berth.x - 0.1 ) < 1e-6 && Math.abs( out.z - berth.z + 0.1 ) < 1e-6 && out.y === 0.2, 'at her berth she moves as her pose does, about the spare' );
	laidAt( out, new Vector3( 64.5, 0, 100 ), from, berth, 0, berthShare( 63.5 ) );
	ok( out.x === 64.5 && out.z === 100, 'gone from the dock she\'s where her pose says' );
	const seq = [ 5, 15, 25, 35 ].map( berthShare );
	ok( seq[ 0 ] === 1 && seq[ 0 ] > seq[ 1 ] && seq[ 1 ] > seq[ 2 ] && seq[ 2 ] > seq[ 3 ] && seq[ 3 ] > 0, 'let go gradually as she leaves' );

}

// ---- how far off she shows
{

	const eye = 2.3;
	let far = 0;
	for ( let d = 1000; d < 40000; d += 100 ) if ( seenHeight( d, eye, SIZE.lobster.air ) > 0 ) far = d;
	ok( far > 12000 && far < 15000, `the lobster boat's above the horizon from a deck to ${ ( far / 1000 ).toFixed( 1 ) } km (about 14)` );
	let tower = 0;
	for ( let d = 1000; d < 40000; d += 100 ) if ( seenHeight( d, eye, SIZE.sportfisher.air ) > 0 ) tower = d;
	ok( tower > far + 3000, `a sportfisher's tower to ${ ( tower / 1000 ).toFixed( 1 ) } km` );
	ok( seenHeight( 3000, eye, 4 ) === 4 && seenHeight( 10000, eye, 4 ) < 4, 'her hull goes down first' );
	const clear = visualRange( 1, 0 ), rain = visualRange( 0.55, 0 ), storm = visualRange( 0.42, 0 );
	ok( clear === 30000 && rain > 4000 && rain < 6000 && storm < 3000, `what the air lets you see: ${ Math.round( clear / 1000 ) } km clear, ${ ( rain / 1000 ).toFixed( 1 ) } in rain, ${ ( storm / 1000 ).toFixed( 1 ) } in a storm` );
	const at = ( id, d, range = clear ) => speckAlpha( { d, eye, air: SIZE[ id ].air, range } );
	ok( at( 'lobster', 6000 ) > 0.3 && at( 'lobster', 10000 ) > 0.1 && at( 'lobster', 16000 ) === 0, `the lobster boat's speck: ${ at( 'lobster', 6000 ).toFixed( 2 ) } at 6 km, ${ at( 'lobster', 10000 ).toFixed( 2 ) } at 10, none at 16` );
	ok( at( 'kayak', 2500 ) > 0.3 && at( 'kayak', 7000 ) < 0.03, `a kayak's too small to make out far off: ${ at( 'kayak', 2500 ).toFixed( 2 ) } at 2.5 km, ${ at( 'kayak', 7000 ).toFixed( 3 ) } at 7` );
	ok( at( 'lobster', 6000, rain ) < 0.02, 'nothing past the rain' );

}

// ---- a crew's jobs
{

	const m = await loadBoat( 'sportfisher' ), S = m.stations;
	ok( jobAt( m, 'helm', null ) === 'helm' && jobAt( m, 'boat', null ) === 'helm', 'at the helm' );
	ok( jobAt( m, 'deck', new Vector3( S.tower.x, S.tower.y, S.tower.z ) ) === 'tower', 'up the tower' );
	ok( jobAt( m, 'deck', new Vector3( S.chair.x, S.chair.y, S.chair.z ) ) === 'chair', 'in the chair' );
	ok( jobAt( m, 'deck', new Vector3( S.tower.x, S.chair.y, S.tower.z ) ) === null, 'at the foot of the tower, not' );
	ok( jobAt( m, 'walk', new Vector3( S.chair.x, S.chair.y, S.chair.z ) ) === null && jobAt( await loadBoat( 'lobster' ), 'deck', new Vector3() ) === null, 'ashore, or on a boat with none, no job' );
	ok( clockFrom( 0, 0, 10 ) === 12 && clockFrom( 0, - 10, 0 ) === 3 && clockFrom( 0, 10, 0 ) === 9 && clockFrom( 0, 0, - 10 ) === 6, 'by the clock from her bow, her starboard at three' );
	ok( clockFrom( Math.PI / 2, 10, 0 ) === 12, 'whichever way she\'s heading' );
	const finds = { bait: [ { x: 1000, z: 0 }, { x: 0, z: - 900 } ], weed: [ { x: 0, z: 800 } ], debris: [ { x: 0, z: 2000 } ] };
	const see = spotted( finds, new Vector3(), new Vector3( 1, - 0.05, 0.02 ).normalize() );
	ok( see && see.kind === 'bait' && see.x === 1000, 'looking at the birds, it\'s the birds' );
	ok( spotted( finds, new Vector3(), new Vector3( - 1, 0, 0 ) ) === null, 'looking at nothing, nothing' );
	ok( spotted( { debris: finds.debris }, new Vector3(), new Vector3( 0, 0, 1 ) ) === null, 'and debris too far off to make out isn\'t' );

	const k = await loadBoat( 'kayak' );
	k.seated = true;
	const r = perched( k ), p = new Vector3( 5, 0, 5 );
	r.clampToDeck( p, 0.25 );
	ok( ! r.seated && r.id === 'kayak' && r.colliders === k.colliders && Math.abs( p.z - r.boardPoint.z ) < 0.2 && p.x < 0.2, 'a rider on a boat that\'s sat in: held on her tank well' );
	ok( perched( m ) === m, 'and on one that\'s walked, free of her deck' );

}

// ---- away, her type goes with her
{

	const raw = boatRecord( { boat: 'console', name: 'Sam', x: 1, z: 2, heading: 0, anchor: { x: 1, z: 2 }, at: Date.now(), T: 5 } );
	ok( cleanBoats( { s: raw } ).s.b === 'console', 'an away boat\'s record says which she is' );
	const old = boatRecord( { name: 'Sam', x: 1, z: 2, heading: 0, anchor: { x: 1, z: 2 }, at: Date.now(), T: 5 } );
	ok( cleanBoats( { s: old } ).s.b === undefined, 'one from before doesn\'t: the lobster boat' );

}

console.log( bad ? `\n${ bad } failed` : '\ntogether-boats: all passed' );
process.exit( bad ? 1 : 0 );
