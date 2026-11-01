// (M16) Other shores, shells and the hurricane's wrack (game/Beachcomb.js, game/Shells.js, world/Beachcombing.js,
// world/ShellShapes.js, world/debris/WreckPieces.js), under Node: each shore with its own finds, worked out from the day
// alone; the north beach's days as they were in M15; where they lie, on both islands; the shells truly of this sea, rare
// ones rare, how long a set takes; the first of each kept and saved, a spare sold, the queen conch a keepsake; a whole set
// for Marta; the wreck in the wrack, thinning as it's cleared, inside its budget; what's drawn, inside its budget.
//
//   node test/north-shores.mjs

import { readFileSync } from 'node:fs';
import { Group, MeshStandardMaterial } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FINDS, KINDS, BEACHES, LIES, findsOf, lying, wreckageAt, wreckStamp, WRECK } from '../src/game/Beachcomb.js';
import { SHELLS, SHELL_KINDS, readShells, setComplete, shellsHave, WALL_PAY } from '../src/game/Shells.js';
import { Beachcombing } from '../src/world/Beachcombing.js';
import { shellMesh, shellPicture, pictureSize, SHAPES } from '../src/world/ShellShapes.js';
import { GameState } from '../src/game/GameState.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const SHORES = Object.keys( BEACHES );

// ---- each shore its own
{

	// (the north beach's M15 days, to the digit)
	let s = '';
	for ( let d = 0; d < 60; d ++ ) s += findsOf( d, { north: ( d % 5 ) / 5, storm: d % 17 === 0 } ).filter( ( f ) => f.beach === 'north' && ! f.id.includes( ':s' ) ).map( ( f ) => [ f.id, f.kind, f.u.toFixed( 5 ), f.off.toFixed( 4 ), f.yaw.toFixed( 4 ), f.seed ].join() ).join( ';' );
	let h = 0x811c9dc5;
	for ( let i = 0; i < s.length; i ++ ) h = Math.imul( h ^ s.charCodeAt( i ), 0x01000193 );
	check( ( h >>> 0 ).toString( 16 ) === '6b838f8c', 'the north beach\'s finds as they were in M15, to the digit' );
	check( JSON.stringify( findsOf( 77, { lee: 0.4 } ) ) === JSON.stringify( findsOf( 77, { lee: 0.4 } ) ), 'every shore\'s day the same every time' );

	const by = Object.fromEntries( SHORES.map( ( b ) => [ b, {} ] ) );
	let unique = true, bad = 0;
	for ( let d = 0; d < 2000; d ++ ) {

		const F = findsOf( d, { north: 0.3, lee: 0.3 } ), ids = new Set( F.map( ( f ) => f.id ) );
		if ( ids.size !== F.length ) unique = false;
		for ( const f of F ) {

			if ( ! FINDS[ f.kind ] || ! Number.isInteger( f.seed ) || ! ( f.u >= 0 && f.u < 1 ) ) bad ++;
			by[ f.beach ][ f.kind ] = ( by[ f.beach ][ f.kind ] || 0 ) + 1;

		}

	}

	check( unique && bad === 0, 'each its own, each a real kind' );
	const top = ( b ) => Object.entries( by[ b ] ).sort( ( p, q ) => q[ 1 ] - p[ 1 ] )[ 0 ][ 0 ];
	check( top( 'north' ) === 'driftwood' && top( 'bay' ) === 'sunriseTellin' && [ 'bleedingTooth', 'topShell' ].includes( top( 'rocks' ) ) && [ 'periwinkle', 'propagule' ].includes( top( 'mangrove' ) ), `what each shore's mostly got: ${ SHORES.map( ( b ) => `${ b } ${ top( b ) }` ).join( ', ' ) }` );
	check( ! by.bay.seaHeart && ! by.bay.glassFloat && ! by.bay.ambergris, 'the lee has none of the ocean\'s drift' );
	check( by.bay.seaGlass > 0 && by.bay.sandDollar > 0 && ! by.north.seaGlass, 'the bay\'s beach has what the village lost and its own sand\'s, the north beach not' );
	check( ! by.rocks.sandDollar && by.rocks.bleedingTooth > 0 && ! by.bay.bleedingTooth, 'rock\'s shells on the rock, sand\'s on the sand' );
	check( by.mangrove.periwinkle > 0 && ! by.north.periwinkle && ! by.bay.periwinkle, 'the mangrove\'s own periwinkle only there' );
	const sharedLists = SHORES.map( ( b ) => Object.keys( BEACHES[ b ].list ).sort().join() );
	check( new Set( sharedLists ).size === SHORES.length, 'no two shores the same list' );
	let calm = 0, rough = 0;
	for ( let d = 0; d < 500; d ++ ) {

		calm += findsOf( d ).filter( ( f ) => f.beach === 'bay' ).length;
		rough += findsOf( d, { lee: 1 } ).filter( ( f ) => f.beach === 'bay' ).length;

	}

	check( rough > calm * 1.2, `a sea in the bay turns more out there (${ ( rough / 500 ).toFixed( 1 ) } a day to ${ ( calm / 500 ).toFixed( 1 ) })` );

}

// ---- the shells
{

	// (the famous ones that aren't of this sea)
	check( ! [ 'junonia', 'lightningWhelk', 'sunrayVenus' ].some( ( k ) => SHELLS[ k ] ), 'none of the Carolinas\' and the Gulf\'s' );
	check( SHELL_KINDS.every( ( k ) => SHELLS[ k ].sci && SHELLS[ k ].cm >= 2 && SHELLS[ k ].cm <= 30 && SHELLS[ k ].where && SHELLS[ k ].what && SHAPES[ k ] ), 'each with its Latin name, size, where, what and shape' );
	check( SHELL_KINDS.every( ( k ) => SHORES.some( ( b ) => BEACHES[ b ].shells[ k ] ) ), 'each on some shore' );
	const seen = Object.fromEntries( SHELL_KINDS.map( ( k ) => [ k, 0 ] ) );
	const D = 6000;
	for ( let d = 0; d < D; d ++ ) for ( const f of findsOf( d, { north: 0.2, lee: 0.2, storm: d % 40 === 0 } ) ) if ( SHELLS[ f.kind ] ) seen[ f.kind ] ++;
	check( seen.musicVolute < seen.sunriseTellin / 10 && seen.triton < seen.topShell / 8 && seen.flamingoTongue < seen.bleedingTooth / 6, `rare ones rare (a day: tellin ${ ( seen.sunriseTellin / D ).toFixed( 2 ) }, top shell ${ ( seen.topShell / D ).toFixed( 2 ) }, volute ${ ( seen.musicVolute / D ).toFixed( 3 ) }, triton ${ ( seen.triton / D ).toFixed( 3 ) })` );
	// (how long a set takes, walking every shore every third day, while they lie)
	const runs = [];
	for ( let start = 0; start < 300; start ++ ) {

		const got = new Set();
		let d = start * 37;
		for ( ; got.size < SHELL_KINDS.length && d < start * 37 + 2000; d += LIES ) for ( const f of lying( d, ( q ) => ( { north: 0.2, lee: 0.2, storm: q % 40 === 0 } ) ) ) if ( SHELLS[ f.kind ] ) got.add( f.kind );
		runs.push( d - start * 37 );

	}

	runs.sort( ( a, b ) => a - b );
	const med = runs[ runs.length >> 1 ];
	check( med > 15 && med < 150, `a whole set, walking every shore every third day: about ${ med } game days (${ runs[ runs.length >> 3 ] } to ${ runs[ runs.length - ( runs.length >> 3 ) ] })` );

	// meshes: true to size, closed, within budget
	let tris = 0;
	for ( const k of SHELL_KINDS ) {

		const m = shellMesh( k, 0.45 ), big = shellMesh( k, 2 );
		tris += m.idx.length / 3;
		let bad = 0;
		for ( const v of [ ...m.p, ...m.n, ...m.c ] ) if ( ! Number.isFinite( v ) ) bad ++;
		for ( const i of m.idx ) if ( i >= m.p.length / 3 ) bad ++;
		check( bad === 0 && Math.abs( Math.max( ...m.size ) - 1 ) < 1e-3 && big.idx.length > m.idx.length, `${ k }: a sound mesh, ${ m.idx.length / 3 } triangles on low, ${ big.idx.length / 3 } on high` );

	}

	check( tris / SHELL_KINDS.length < 130, `on low, about ${ Math.round( tris / SHELL_KINDS.length ) } triangles a shell` );
	const [ w, h ] = pictureSize( 'queenConch', 110 ), pic = shellPicture( 'queenConch', w, h, { detail: 4 } );
	let filled = 0, pinkish = 0;
	for ( let i = 3; i < pic.length; i += 4 ) if ( pic[ i ] > 200 ) {

		filled ++;
		if ( pic[ i - 3 ] > pic[ i - 1 ] + 25 && pic[ i - 3 ] > 200 ) pinkish ++;

	}

	check( filled > w * h * 0.3 && pinkish > filled * 0.15, `the panel's picture: a queen conch, its lip pink (${ w } x ${ h } px, ${ Math.round( pinkish / filled * 100 ) }% pink)` );
	const sil = shellPicture( 'queenConch', w, h, { silhouette: true, detail: 3 } );
	check( sil[ 3 + 4 * ( ( h >> 1 ) * w + ( w >> 1 ) ) ] > 200, 'and an empty place: its outline' );

}

// ---- kept, sold, saved
{

	const s = new GameState( null ), f = ( id, kind, day = 10 ) => ( { id: `${ day }:bay:s${ id }`, day, beach: 'bay', kind, seed: id } );
	check( s.pickFind( f( 0, 'sunriseTellin' ) ) && s.shells.have.sunriseTellin && s.finds.length === 0, 'the first of a shell: into the set, not your finds' );
	check( s.pickFind( f( 1, 'sunriseTellin' ) ) && s.finds.length === 1 && s.quoteFinds( 'marta' ).total === SHELLS.sunriseTellin.price, 'a spare goes with your finds, for Marta' );
	s.pickFind( f( 2, 'queenConch' ) );
	s.pickFind( f( 3, 'queenConch' ) );
	check( s.finds.some( ( q ) => q.kind === 'queenConch' ) && s.quoteFinds( 'marta' ).items.every( ( q ) => q.kind !== 'queenConch' ) && ! FINDS.queenConch.who && /CITES/.test( SHELLS.queenConch.note ), 'a queen conch no one buys: a keepsake, and why' );
	check( ! s.dropFind( 'none' ) && s.dropFind( '10:bay:s3' ), 'tossed as any find' );
	const t = new GameState( null );
	check( t.fromJSON( JSON.parse( JSON.stringify( s.toJSON() ) ) ) && t.shells.have.queenConch.day === 10 && shellsHave( t.shells ) === 2, 'saved with the game' );
	const old = s.toJSON();
	delete old.shells;
	check( t.fromJSON( old ) && shellsHave( t.shells ) === 0 && t.shells.wall === null, 'a save from before has none (the saves\' version unchanged)' );
	check( t.fromJSON( { ...s.toJSON(), shells: { have: { nonsense: { day: 1 }, topShell: { day: '3', id: 4 } }, wall: 'x' } } ) && shellsHave( t.shells ) === 1 && t.shells.wall === null, 'and junk dropped' );
	check( ! setComplete( s.shells ), 'not whole yet' );
	const u = new GameState( null );
	SHELL_KINDS.forEach( ( k, i ) => u.pickFind( f( 100 + i, k, 20 ) ) );
	check( setComplete( u.shells ) && u.finds.length === 0 && WALL_PAY > 100, `whole: ${ SHELL_KINDS.length }, and Marta's $${ WALL_PAY } for the tray` );

}

// ---- the wreck
{

	const D = ( after, H = 2.6, key = 'h:9' ) => ( { storm: { key, ends: 2400 }, wrack: after < 240 ? 0.8 : 0, wrackH: H, after } );
	const a = wreckageAt( D( 6 ) ), b = wreckageAt( D( 6 ) );
	check( JSON.stringify( a ) === JSON.stringify( b ) && a.length >= WRECK.count[ 0 ] && a.length <= WRECK.count[ 1 ], `the same for everyone: ${ a.length } pieces the morning after` );
	const kinds = new Set( a.map( ( w ) => w.kind ) );
	check( kinds.has( 'tin' ) && kinds.has( 'plank' ), `what the village lost (${ [ ...kinds ].join( ', ' ) })` );
	const n = [ 6, 60, 120, 200, 239 ].map( ( h ) => wreckageAt( D( h ) ).length );
	check( n[ 0 ] > n[ 1 ] && n[ 1 ] > n[ 2 ] && n[ 2 ] > n[ 3 ] && n[ 3 ] >= n[ 4 ], `thinning as it's cleared: ${ n.join( ', ' ) }` );
	check( wreckageAt( D( 300 ) ).length === 0 && wreckageAt( { storm: null } ).length === 0 && wreckStamp( { storm: null } ) === '', 'gone with the wrack; none with no storm' );
	check( wreckageAt( D( 6, 3.2 ) ).length > wreckageAt( D( 6, 1.7 ) ).length, 'more the higher its sea came' );
	const scrap = a.filter( ( w ) => w.scrap );
	check( scrap.length >= 4 && scrap.every( ( w ) => FINDS[ w.scrap ] && FINDS[ w.scrap ].who === 'marta' && FINDS[ w.scrap ].price > 0 ), `${ scrap.length } of them sound enough for Marta as scrap` );
	// (picked up: remembered until it would have gone)
	const s = new GameState( null ), p = { ...scrap[ 0 ], kind: scrap[ 0 ].scrap, day: 101 };
	check( s.pickFind( p ) && s.finds[ 0 ].kind === scrap[ 0 ].scrap, 'picked up, into your finds' );
	s.pickFind( { id: '108:bay:0', day: 108, beach: 'bay', kind: 'seaGlass', seed: 1 } );
	check( s.picked.includes( p.id ), 'and not on the sand again, days after a shell\'s been forgotten' );
	check( parseInt( p.id, 10 ) * 24 >= 2400 + WRECK.clear[ 1 ], 'for as long as it could lie there' );

}

// ---- where they lie, and what's drawn, on both islands
for ( const [ file, tier ] of [ [ 'island.bin', 'high' ], [ 'island-1024.bin', 'low' ] ] ) {

	const T = new TerrainData( 7, decodeIsland( read( file ) ) ), mat = new MeshStandardMaterial();
	const W = new Beachcombing( { terrain: T, materials: { nature: mat, wood: mat, hard: mat, roofMetal: mat }, parent: new Group(), lite: tier === 'low' } );
	const per = {};
	for ( let d = 0; d < 120; d ++ ) for ( const f of findsOf( d, { north: 1, lee: 1, storm: d % 10 === 0 } ) ) {

		const [ x, z ] = W.at( f ), h = T.heightAt( x, z ), P = per[ f.beach ] || ( per[ f.beach ] = { n: 0, ok: 0, lo: 1e9, hi: - 1e9 } );
		P.n ++;
		P.lo = Math.min( P.lo, h );
		P.hi = Math.max( P.hi, h );
		if ( h > ( f.beach === 'mangrove' ? 0.1 : 0.4 ) && h < 3.2 ) P.ok ++;

	}

	check( Object.values( per ).every( ( P ) => P.ok === P.n ), `${ tier }: every find above the water on its shore (${ Object.entries( per ).map( ( [ b, P ] ) => `${ b } ${ P.lo.toFixed( 1 ) }-${ P.hi.toFixed( 1 ) } m` ).join( ', ' ) })` );

	// what's drawn: the worst near-you day on the lee's busiest stretches, after a hurricane
	const near = ( list, cx, cz, r ) => list.filter( ( f ) => { const [ x, z ] = W.at( f ); return Math.hypot( x - cx, z - cz ) < r; } );
	let worst = 0, worstDraws = 0, worstDay = 0;
	for ( let d = 0; d < 60; d ++ ) {

		const L = lying( d, ( q ) => ( { lee: 0.4, north: 0.2, storm: q >= d - 2 } ) );
		W.set( L );
		W.flush();
		const c = { position: { x: 30, z: - 50 } };
		W.update( c );
		let t = 0, dr = 0;
		for ( const S of W.stretches.values() ) if ( S.key.startsWith( 'bay' ) ) for ( const m of S.meshes ) if ( m.visible ) {

			t += m.geometry.index.count / 3;
			dr ++;

		}

		if ( t > worst ) {

			worst = t;
			worstDraws = dr;
			worstDay = d;

		}

	}

	console.log( `     ${ tier }: on the bay's beach, three days after a hurricane, the worst day of 60 (day ${ worstDay }): ${ Math.round( worst ) } triangles, ${ worstDraws } draws, in reach` );
	if ( tier === 'low' ) check( worst < 3000, `low: the finds in reach under the budget (${ Math.round( worst ) } triangles)` );
	W.set( [] );
	W.flush();

	// a hurricane's wreck on the bay's beach: on the line its sea reached
	const list = wreckageAt( { storm: { key: 'h:12', ends: 2400 }, wrack: 0.9, wrackH: 2.7, after: 12 } );
	W.setWreck( list );
	W.flush();
	let off = 0;
	for ( const P of W.wreck ) {

		const h = T.heightAt( P.x, P.z );
		if ( h < 0.5 || h > 4 || P.x < WRECK.x[ 0 ] - 5 || P.x > WRECK.x[ 1 ] + 5 ) off ++;

	}

	check( off === 0, `${ tier }: the wreck on the beach, up the line its sea reached (${ W.wreck.length } pieces)` );
	const tris = W.wreckMeshes.reduce( ( t, m ) => t + m.geometry.index.count / 3, 0 );
	if ( tier === 'low' ) {

		check( tris < 2000 && W.wreckMeshes.length <= 2, `low: the wreck's ${ Math.round( tris ) } triangles in ${ W.wreckMeshes.length } draws, all of it` );

	} else check( tris > 0, `${ tier }: the wreck's ${ Math.round( tris ) } triangles in ${ W.wreckMeshes.length } draws` );
	const one = W.wreck.find( ( P ) => P.f.scrap );
	const got = W.nearest( one.x, one.z, 1.4 );
	check( got && FINDS[ got.kind ] && got.id.includes( 'wreck' ), `${ tier }: a sound piece of it can be picked up, as ${ got && FINDS[ got.kind ].name.toLowerCase() }` );
	W.setWreck( list.filter( ( f ) => f.id !== one.f.id ) );
	W.flush();
	check( W.wreck.length === list.length - 1, `${ tier }: and is gone from the sand` );
	W.setWreck( [] );
	W.flush();
	check( W.wreckMeshes.length === 0, `${ tier }: none left when it's cleared` );
	W.setWall( true );
	W.update( { position: { x: 85, z: - 60 } } );
	check( W.wall.meshes && W.wall.meshes.length > 0, `${ tier }: your whole set in Marta's tray, near her` );
	W.dispose();

}

console.log( failed ? `\n${ failed } failed` : '\nall ok' );
process.exit( failed ? 1 : 0 );
