// (M16) Lobster traps (game/Traps.js, world/boat/TrapModel.js): the track and what it doesn't count toward, where one may be
// set, the soak by the nights, what comes up against real catch rates, the gauge, what a hurricane does, the save per
// player, the buoys everyone sees, and what's drawn against its budget.
import { readFileSync } from 'node:fs';
import { UPGRADES, gearStats, defaultUpgrades, UNLOCK, unlockProgress } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { FISH } from '../src/game/FishTable.js';
import { BOTTOMS, SOAK, WARP_M, aboardTraps, bottomAt, buoyColours, buoyOffset, buoyRecord, cleanBuoys, cleanTraps, haulOf, meanCatch, newTraps, nightsIn, ownedTraps, settle, soakOf, touchedBy, trapsTold, whyNot } from '../src/game/Traps.js';
import { MAX, STOW, TRAP, trapColliders, trapGeometry, buoyGeometry, lobsterInTrap } from '../src/world/boat/TrapModel.js';
import { triangleCount } from '../src/world/boat/GeoKit.js';
import { HullLines } from '../src/world/boat/HullLines.js';
import { BoatModel } from '../src/world/BoatModel.js';

let failed = 0;
const ok = ( c, label ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! c ) failed ++;

};

// ---- the track: 2, then 4, then 8, on the lobster boat, none toward the sportfisher's unlock
const track = UPGRADES.traps;
ok( track.on === 'lobster' && track.unlock === false, 'the traps are the lobster boat\'s, and not asked for by the sportfisher\'s unlock' );
ok( track.levels.map( ( l ) => l.traps ).join() === '0,2,4,8', 'none, then 2, 4, 8' );
const u = defaultUpgrades();
u.traps = 2;
ok( gearStats( u, 'lobster' ).traps === 4 && gearStats( u, 'console' ).traps === undefined, 'they count only aboard her' );
ok( ownedTraps( u ) === 4, 'but they\'re yours whichever boat you\'re in' );
const hers = [ 'hold', 'fuel', 'engine', 'baitWell', 'fishFinder', 'lights', 'anchor', 'bilgePump' ].reduce( ( n, k ) => n + UNLOCK[ k ], 0 );
ok( hers === 12 && UNLOCK.traps === undefined && unlockProgress( u ).done === unlockProgress( defaultUpgrades() ).done, 'the unlock\'s 12 of hers are still 12, traps or no traps' );

// ---- the bottom, and where one may be set
ok( bottomAt( { reefDist: 10 } ) === 'edge' && bottomAt( { reefDist: - 20 } ) === 'coral', 'off the reef\'s edge; on live coral' );
ok( bottomAt( { reefDist: 200, sand: 1 } ) === 'sand' && bottomAt( { reefDist: 200, grass: 1 } ) === 'grass' && bottomAt( { reefDist: 200 } ) === 'hard' && bottomAt( { reefDist: 200, creek: 1 } ) === 'mud', 'sand, grass, hard bottom, mangrove mud' );
ok( bottomAt( { onMap: false } ) === 'shelf' && bottomAt( { onMap: false, patch: 0.8 } ) === 'edge', 'off the island\'s map: the shelf, and the bank\'s patch reefs' );
ok( BOTTOMS.edge.q > BOTTOMS.hard.q && BOTTOMS.hard.q > BOTTOMS.shelf.q && BOTTOMS.shelf.q > BOTTOMS.grass.q && BOTTOMS.grass.q > BOTTOMS.sand.q && BOTTOMS.sand.q > BOTTOMS.mud.q, 'each fishes as it should against the next' );
const here = { depth: 12, bottom: 'edge' };
ok( whyNot( here ) === null, 'set here' );
ok( whyNot( { ...here, depth: WARP_M + 1 } ) && whyNot( { ...here, depth: 1 } ) && whyNot( { ...here, bottom: 'coral' } ) && whyNot( { ...here, speed: 3 } ) && whyNot( { ...here, dock: 10 } ), 'not past the warp, too shallow, on coral, under way, or in the fairway' );

// ---- the soak
ok( nightsIn( 12, 18 ) === 0, 'set at noon, hauled at dusk: no night' );
ok( nightsIn( 12, 36 ) === 1 && nightsIn( 12, 12 + 24 * 7 ) === 7, 'a night a day' );
ok( Math.abs( nightsIn( 22, 24 ) - 0.2 ) < 1e-9, 'part of a night' );
const trap = { T: 12, at: null, seed: 1 };
const after = ( d ) => meanCatch( 1, soakOf( trap, 12 + d * 24, 0 ) );
ok( after( 0.1 ) === 0, 'nothing before dark' );
ok( after( 1 ) < after( 3 ) && after( 3 ) < after( 7 ) && after( 7 ) < after( 14 ), 'catch rises with the soak' );
ok( after( 3 ) - after( 1 ) > after( 14 ) - after( 12 ), 'at a decreasing rate' );
ok( after( 40 ) < after( 14 ) && after( 400 ) > after( 14 ) * SOAK.floor * 0.9, 'and falls as they find the way out, to a floor' ); // ((M17) of its own best: its bait's used up long before)
ok( soakOf( { T: 500, at: 0 }, 400, 3600e3 * 48 ).hours === 48, 'a room whose clock\'s behind: the real time' );

// what comes up, over many hauls: lobsters a trap, how many legal, against the fishery
const many = ( id, days, depth, q = BOTTOMS[ id ].q, size = BOTTOMS[ id ].sizeCm ) => {

	let n = 0, legal = 0, berried = 0, by = 0;
	const N = 4000;
	for ( let i = 0; i < N; i ++ ) {

		const h = haulOf( { seed: i * 7919 + 1, T: 12, at: null }, q, size, depth, 12 + days * 24, 0 );
		n += h.lobsters.length;
		legal += h.lobsters.filter( ( l ) => l.cm >= FISH.lobster.minCm && ! l.berried ).length;
		berried += h.lobsters.filter( ( l ) => l.berried ).length;
		if ( h.others.length ) by ++;

	}

	return { per: n / N, legal: legal / N, share: legal / Math.max( 1, n ), berried: berried / Math.max( 1, n ), by: by / N };

};

const edge = many( 'edge', 10, 15 ), grass = many( 'grass', 10, 5 ), sand = many( 'sand', 10, 10 );
console.log( '    a ten-day soak: reef\'s edge', edge, '· grass', grass, '· sand', sand );
ok( edge.per > 2 && edge.per < 4, 'about 3 lobsters a trap on the best ground, as lightly fished Florida\'s 24 kg a season' );
ok( edge.share > 0.5 && edge.share < 0.8, 'a little over half of them legal' );
ok( grass.share < edge.share * 0.5, 'the grass: mostly shorts' );
ok( sand.per < edge.per * 0.2, 'open sand: next to nothing' );
ok( edge.by > 0.25 && edge.by < 0.4, 'a third come up with something else in them' );
ok( edge.berried > 0.02 && edge.berried < 0.1, 'a few carrying eggs' );
const h0 = haulOf( { seed: 77, T: 12, at: null }, 1, 1.5, 12, 200, 0 ), h1 = haulOf( { seed: 77, T: 12, at: null }, 1, 1.5, 12, 200, 0 );
ok( JSON.stringify( h0 ) === JSON.stringify( h1 ), 'the same soak, the same trap: the same catch, however often it\'s asked' );
ok( h0.lobsters.every( ( l ) => l.kg > 0 && l.cm >= 15 && l.cm <= 42 ), 'sized as the lobsters on the reef' );

// ---- the gauge: the game's own rule, as a diver's
const gauged = new GameState( null );
gauged.addFish( 'lobster', 0.3, 12, { method: 'trap', cm: 20, day: 3, release: 'short' } );
ok( gauged.lastCatch.why === 'short' && ! gauged.lastCatch.kept, 'a short one goes back' );
gauged.addFish( 'lobster', 0.8, 12, { method: 'trap', cm: 27, day: 3, release: 'berried' } );
ok( gauged.lastCatch.why === 'berried' && ! gauged.lastCatch.kept, 'a berried one goes back' );
gauged.upgrades.hold = 2;
for ( let i = 0; i < FISH.lobster.bag + 1; i ++ ) gauged.addFish( 'lobster', 0.8, 12, { method: 'trap', cm: 27, day: 3 } );
ok( gauged.inventory.length === FISH.lobster.bag && gauged.lastCatch.bag.full, 'and one over the day\'s bag' );

// ---- a hurricane: more of the shallow ones than the deep, Irma's 43% for a big one on shallow bottom
ok( touchedBy( 1, 5 ) > touchedBy( 1, 30 ) && touchedBy( 3, 5 ) > touchedBy( 1, 5 ), 'the shallower and the stronger, the more touched' );
ok( touchedBy( 1, 5 ) < 0.6 && touchedBy( 3, 5 ) > 0.6 && touchedBy( 3, 5 ) * 0.45 + touchedBy( 3, 5 ) * 0.4 * 0.2 > 0.3, 'a big one on the shallows takes as much as Irma took' );
const seaAt = ( d ) => () => d;
const fates = ( d, n = 300 ) => {

	const traps = newTraps();
	for ( let i = 0; i < n; i ++ ) traps.set.push( { x: i, z: 0, T: 0, at: 0, seed: i * 1009 + 7, buoy: true, mark: i, seen: 0, q: 1, size: 0 } );
	const ev = settle( traps, 600, { depth: seaAt( d ), pick: 'hurricane', since: 100, now: 1000 } );
	return { traps, ev };

};
const shallow = fates( 5 ), deep = fates( 30 );
console.log( '    a hurricane:', shallow.ev.length, 'of 300 at 5 m,', deep.ev.length, 'at 30 m,', shallow.traps.lost, 'and', deep.traps.lost, 'lost' );
ok( shallow.ev.length > deep.ev.length * 1.5, 'it touches more in the shallows' );
ok( shallow.traps.lost + shallow.traps.set.length === 300, 'each lost one\'s counted' );
const fateSet = new Set( shallow.ev.map( ( e ) => e.fate ) );
ok( fateSet.has( 'lost' ) && fateSet.has( 'moved' ) && fateSet.has( 'buoy' ), 'lost, moved, or the buoy gone' );
const moved = shallow.ev.find( ( e ) => e.fate === 'moved' ), it = shallow.traps.set.find( ( t ) => t.mark === moved.mark );
ok( moved.m > 100 && Math.abs( it.x - moved.to.x ) < 0.1 && it.q === null, 'a moved one lies where it was dragged, on a bottom to read again' );
ok( shallow.traps.set.filter( ( t ) => ! t.buoy ).every( ( t ) => shallow.ev.some( ( e ) => e.fate === 'buoy' && e.mark === t.mark ) ), 'one with its buoy gone is still there' );
ok( settle( shallow.traps, 600, { depth: seaAt( 5 ), pick: 'hurricane', since: 100 } ).length === 0, 'and the same storm\'s not reckoned twice' );
const ashore = fates( 5 ).traps, ev = settle( ( () => {

	const t = newTraps();
	for ( let i = 0; i < 300; i ++ ) t.set.push( { x: i, z: 0, T: 0, at: 0, seed: i * 31 + 3, buoy: true, mark: null, seen: 0, q: 1, size: 0 } );
	return t;

} )(), 600, { depth: ( x, z ) => x === Math.floor( x ) && z === 0 ? 5 : - 1, pick: 'hurricane', since: 100 } );
ok( ashore && ev.some( ( e ) => e.fate === 'ashore' ) && ! ev.some( ( e ) => e.fate === 'moved' ), 'dragged ashore, it\'s lost' );
ok( fates( 5, 1 ).ev.length <= 1 && settle( newTraps(), 600, { depth: seaAt( 5 ), pick: null, since: 0 } ).length === 0, 'no traps, no story' );
const note = trapsTold( [ { fate: 'lost' }, { fate: 'ashore' }, { fate: 'moved', x: 0, z: 0, to: { x: 0, z: - 800 }, m: 800 }, { fate: 'buoy' } ] );
ok( note.length === 3 && /2 of your traps/.test( note[ 0 ] ) && /north/.test( note[ 1 ] ) && /tie on another/.test( note[ 2 ] ), `Marta's note: ${ note.join( ' ' ) }` );
ok( trapsTold( [] ) === null, 'nothing to say' );

// ---- the save, per player
const st = new GameState( null );
st.upgrades.traps = 3;
ok( aboardTraps( st.traps, st.upgrades ) === 8, 'all 8 aboard' );
st.traps.set.push( { x: 12.5, z: - 30, T: 40, at: 1000, seed: 9, buoy: false, mark: 3, seen: 41, q: 0.8, size: 0.5 } );
st.traps.lost = 2;
ok( aboardTraps( st.traps, st.upgrades ) === 5, 'less those set and those lost' );
const back = new GameState( null );
ok( back.fromJSON( JSON.parse( JSON.stringify( st.toJSON() ) ) ) && JSON.stringify( back.traps ) === JSON.stringify( st.traps ), 'kept in the save' );
const older = new GameState( null );
const j = st.toJSON();
delete j.traps;
ok( older.fromJSON( JSON.parse( JSON.stringify( j ) ) ) && older.traps.set.length === 0, 'a save from before has none' );
const junk = cleanTraps( { set: [ null, { x: 'a' }, { x: 1, z: 2, T: 3 }, ...Array( 20 ).fill( { x: 1, z: 2, T: 3 } ) ], lost: - 4 } );
ok( junk.set.length === 8 && junk.lost === 0 && junk.set[ 0 ].buoy === true, 'and a bad one\'s cleaned' );
st.reset();
ok( st.traps.set.length === 0 && st.traps.lost === 0, 'a new game has none' );
ok( new GameState( null ).chart.mark( 1, 2, 3, true ).trap === true, 'a trap\'s mark says so' );
const ch = new GameState( null );
ch.chart.mark( 1, 2, 3, true );
ch.chart.mark( 4, 5, 6 );
const ch2 = new GameState( null );
ch2.chart.fromJSON( JSON.parse( JSON.stringify( ch.chart.toJSON() ) ) );
ok( ch2.chart.marks[ 0 ].trap === true && ! ch2.chart.marks[ 1 ].trap, 'and it\'s saved with the chart' );

// ---- the buoys everyone sees
const rec = buoyRecord( { name: 'Marisol', traps: { set: [ { x: 1.26, z: 2, buoy: true }, { x: 9, z: 9, buoy: false } ] }, at: 5000 } );
ok( rec.b.length === 1 && rec.b[ 0 ][ 0 ] === 1.3, 'only those with a buoy on' );
const clean = cleanBuoys( { a: rec, b: { v: 1, at: 5000, b: [ [ 1 ], 'x' ] }, c: { v: 2, at: 5000, b: [ [ 1, 2 ] ] }, d: { ...rec, at: - 1e12 }, e: null }, 6000 );
ok( Object.keys( clean ).join() === 'a' && clean.a.n === 'Marisol', 'others\' saves, of any version, and long gone ones let go' );
ok( JSON.stringify( buoyOffset( 12.3, - 4, 10 ) ) === JSON.stringify( buoyOffset( 12.3, - 4, 10 ) ) && Math.hypot( buoyOffset( 12.3, - 4, 10 ).x, buoyOffset( 12.3, - 4, 10 ).z ) <= 6, 'each buoy lies off its trap the same on every device' );
const pal = new Set();
for ( let i = 0; i < 60; i ++ ) pal.add( buoyColours( `player-${ i }` ).join() );
ok( pal.size >= 6 && buoyColours( null ).length === 2, 'each owner has their own colours' );

// ---- what's drawn: its budget (6,000 triangles, 3 draw calls), the stow in her hull, walkable colliders
const L = new HullLines();
const tris = { trap: triangleCount( trapGeometry() ), buoy: triangleCount( buoyGeometry() ), lobster: triangleCount( lobsterInTrap() ) };
const worst = MAX.trap * tris.trap + MAX.buoy * tris.buoy + MAX.lobster * tris.lobster;
console.log( '    triangles:', tris, 'worst case', worst );
ok( worst <= 6000, `the worst case is ${ worst } of 6,000 triangles` );
ok( STOW.length === 8, '8 stow on her deck' );
const zs = [ ... new Set( STOW.map( ( s ) => s[ 2 ] ) ) ];
ok( STOW.every( ( [ x, , z ] ) => Math.abs( x ) + TRAP.W / 2 < L.halfBreadth( L.tAtSheerZ( z - TRAP.L / 2 ), L.deckY + 0.05 ) && z - TRAP.L / 2 > L.zAft + L.shell && z + TRAP.L / 2 < L.houseBack ) && zs.length, 'inside her bulwarks, clear of the transom and the house' );
const boxes = trapColliders( L, 8 );
ok( boxes.length === 8 && boxes.every( ( b ) => b.tag === 'trap' && b.walkable && b.solid ) && trapColliders( L, 0 ).length === 0, 'colliders for those aboard, none for those not' );
const boat = new BoatModel();
ok( ! boat.colliders.some( ( c ) => c.tag === 'trap' ) && ! Object.keys( boat.meshes ).includes( 'trap' ), 'none on her until they\'re aboard: the deck\'s as M14 left it' );

// ---- a diver at a trap whose buoy's gone ties on another (TrapWork), and only at their own, only there
const { TrapWork } = await import( '../src/game/TrapWork.js' );
const lostBuoy = { x: 10, z: 20, buoy: false };
const diver = new TrapWork( { app: {}, state: { traps: { set: [ lostBuoy, { x: 40, z: 20, buoy: true } ], lost: 0 }, save() {} }, toast() {} } );
diver.app = { camera: { position: { x: 60, y: - 9, z: 20 } }, terrainData: { heightAt: () => - 10 } };
const person = { prompt: null };
diver._offerDiver( person, { hit: () => false } );
ok( person.prompt === null, 'nothing to tie on away from it, nor at one with its buoy' );
diver.app.camera.position.x = 11;
diver._offerDiver( person, { hit: () => false } );
ok( /new buoy/.test( person.prompt.text ) && lostBuoy.buoy === false, 'at the trap it\'s offered' );
diver._offerDiver( person, { hit: () => true } );
ok( lostBuoy.buoy === true && diver._dirty, 'and tied on, for everyone to see' );

// ---- no reserved words in the shaders (GLSL): TrapModel's is its own, and nothing's added to a shared one
const src = readFileSync( new URL( '../src/world/boat/TrapModel.js', import.meta.url ), 'utf8' );
const glsl = src.slice( src.indexOf( 'createTrapMaterial' ), src.indexOf( 'what\'s drawn', src.indexOf( 'createTrapMaterial' ) ) );
ok( ! /\b(patch|half|sample|input|output|filter|common|partition|active|noise|flat)\s*[=;,)]/.test( glsl ), 'no reserved words in its shader' );

process.exit( failed ? 1 : 0 );
