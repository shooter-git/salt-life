// (M17) Plain-node tests of the flats: the ground cut in on the west (world/terrain/Flats.js: where it is, how deep, its
// creeks, its edge, its masks, what it kept for the placing, and that it costs the load little) and its fish as data
// (game/Flats.js: each school where it should be by the tide, in water of its depth, the same for everyone, spooked
// and hooked; and the ground it follows the tide over, baked into game/FlatsGround.js, still the ground's).
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FLATS, flatsAt, cutFlats } from '../src/world/terrain/Flats.js';
import { FLATS_FISH, FLATS_HOMES, FLATS_ROUTES, flatsSchools, tideStage, newFlatsState, spook, hook, forgetFlats } from '../src/game/Flats.js';
import { tideAt, moonAt, SYNODIC, TIDE_LOWEST } from '../src/game/IslandClock.js';
import { FEED_RAYS } from '../src/game/FlatsGround.js';
import { feedRays, profile } from '../tools/flats/ground.mjs';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const bake = ( f ) => decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) ) );

// ---- the ground, on both bakes (1 m, and low's 2 m)
for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const b = bake( file ), before = new Float32Array( b.heights ), sand0 = new Uint8Array( b.sand ), rock0 = new Float32Array( b.rock );
	const T = new TerrainData( 7, b ), tag = `(${ T.texel } m)`;
	// its area at mean water: a foot or two deep
	let area = 0, depth = 0, bared = 0, grass = 0;
	const A = T.texel * T.texel;
	for ( let z = FLATS.window[ 1 ]; z < FLATS.window[ 3 ]; z += 2 ) for ( let x = FLATS.window[ 0 ]; x < FLATS.window[ 2 ]; x += 2 ) {

		const f = flatsAt( x, z ), h = T.heightAt( x, z );
		if ( f.on < 0.99 || h > 0.5 || h < - 1.2 ) continue;
		area += 4;
		depth += - h * 4;
		if ( h > TIDE_LOWEST ) bared += 4;
		if ( f.grass > 0.5 ) grass += 4;

	}

	ok( area > 80000 && area < 160000, `${ tag } the flat's ${ ( area / 1e4 ).toFixed( 1 ) } ha under 1.2 m at mean water` );
	ok( depth / area > 0.35 && depth / area < 0.7, `${ tag } ${ ( depth / area ).toFixed( 2 ) } m deep on average (a foot or two)` );
	ok( bared / area > 0.2 && bared / area < 0.7, `${ tag } ${ ( bared / area * 100 ).toFixed( 0 ) }% of it bared at the lowest spring low` );
	ok( grass / area > 0.15 && grass / area < 0.6, `${ tag } ${ ( grass / area * 100 ).toFixed( 0 ) }% of it turtle grass` );
	// never the land: no texel above 0.8 m changed, and none raised above the flat's highest
	let land = 0, high = 0, changed = 0;
	const W = T._flats;
	for ( let j = W.j0; j < W.j0 + W.h; j ++ ) for ( let i = W.i0; i < W.i0 + W.w; i ++ ) {

		const k = j * T.res + i;
		if ( before[ k ] === T.heights[ k ] || T._uncut.has( k ) ) continue;
		changed ++;
		if ( before[ k ] > 0.8 ) land ++;
		if ( T.heights[ k ] > before[ k ] && T.heights[ k ] > 0.1 ) high ++;

	}

	ok( land === 0 && high === 0, `${ tag } the land and the mangroves' floor left as they were (${ changed } texels changed, none above 0.8 m, none raised past 0.1 m)` );
	// the creeks: down to their beds, open from the flat to its edge
	for ( const [ i, C ] of FLATS.creeks.entries() ) {

		const [ mx, mz ] = C.line[ 0 ], mid = C.line[ Math.floor( C.line.length / 2 ) ];
		ok( T.heightAt( mx, mz ) < C.bed[ 0 ] + 0.5 && T.heightAt( mid[ 0 ], mid[ 1 ] ) < - 0.6, `${ tag } creek ${ i }: ${ T.heightAt( mx, mz ).toFixed( 2 ) } m at its mouth, ${ T.heightAt( mid[ 0 ], mid[ 1 ] ).toFixed( 2 ) } m half way up` );

	}

	// its edge falling away to the seabed as it was, and no seam where its skirt's let go of
	let worst = 0;
	for ( let z = FLATS.window[ 1 ] + 4; z < FLATS.window[ 3 ] - 4; z += 3 ) for ( let x = FLATS.window[ 0 ] + 4; x < FLATS.window[ 2 ] - 4; x += 3 ) {

		// (where it's changed the ground: the island's own cliffs and the sea cave's cut aren't its)
		const h = T.heightAt( x, z ), hx = T.heightAt( x + T.texel, z ), hz = T.heightAt( x, z + T.texel );
		const q = Math.floor( ( z - T.origin ) / T.texel ) * T.res + Math.floor( ( x - T.origin ) / T.texel );
		if ( Math.max( h, hx, hz ) > 0.8 || T._flats.heights.at( q, T.res ) < 0 || T._uncut.has( q ) ) continue;
		worst = Math.max( worst, Math.abs( hx - h ), Math.abs( hz - h ) );

	}

	ok( worst < 2.6 * T.texel, `${ tag } no cliff: at most ${ worst.toFixed( 2 ) } m between neighbouring texels` );
	let edgeWin = 0;
	for ( const [ x, z ] of [ [ FLATS.window[ 0 ] + 1, - 100 ], [ - 700, FLATS.window[ 1 ] + 1 ], [ - 600, FLATS.window[ 3 ] - 1 ] ] ) edgeWin = Math.max( edgeWin, Math.abs( T.raisedAt( x, z ) ) );
	ok( edgeWin < 0.01, `${ tag } nothing changed at its window's sides (${ edgeWin.toFixed( 3 ) } m)` );
	// its masks: white sand, the grass in beds, no rock
	let rockOn = 0, sandOn = 0, n = 0;
	for ( let z = - 300; z < 0; z += 7 ) for ( let x = - 760; x < - 560; x += 7 ) {

		const f = flatsAt( x, z );
		if ( f.on < 0.99 || f.mud > 0.1 ) continue;
		const k = Math.floor( ( z - T.origin ) / T.texel ) * T.res + Math.floor( ( x - T.origin ) / T.texel );
		n ++;
		rockOn += T.rock[ k ];
		sandOn += T.sand[ k ];

	}

	ok( n > 300 && rockOn / n < 0.01 && sandOn / n > 240, `${ tag } white sand on it (${ ( sandOn / n ).toFixed( 0 ) } of 255), no rock` );
	// what it changed, kept for the placing: the ground as it was, its masks as they were
	let same = true;
	for ( let k = 0; k < 3000; k ++ ) {

		const x = FLATS.window[ 0 ] + ( k * 37.1 ) % ( FLATS.window[ 2 ] - FLATS.window[ 0 ] ), z = FLATS.window[ 1 ] + ( k * 53.7 ) % ( FLATS.window[ 3 ] - FLATS.window[ 1 ] );
		const i = Math.floor( ( x - T.origin ) / T.texel ), j = Math.floor( ( z - T.origin ) / T.texel ), q = j * T.res + i;
		const ms = T.uncut.masksBefore.get( T.sand ), mr = T.uncut.masksBefore.get( T.rock );
		const s0 = ms && ms.has( q ) ? ms.get( q ) : T.sand[ q ], r0 = mr && mr.has( q ) ? mr.get( q ) : T.rock[ q ];
		if ( s0 !== sand0[ q ] || r0 !== rock0[ q ] ) same = false;
		const cx = T.origin + ( i + 0.5 ) * T.texel, cz = T.origin + ( j + 0.5 ) * T.texel;
		if ( Math.abs( T.uncut.heightAt( cx, cz ) - before[ q ] ) > 1e-5 ) same = false;

	}

	ok( same, `${ tag } the ground and its masks as they were, kept for the rocks' and the plants' placing` );
	T.letGoOfTheFlats();
	ok( ! T._flats && ! [ ...T._masksBefore.values() ].some( ( m ) => m.kept ), `${ tag } and let go of once they're placed` );
	// what it costs the load
	const copy = { res: T.res, texel: T.texel, origin: T.origin, heights: new Float32Array( before ), sand: new Uint8Array( sand0 ), rock: new Float32Array( rock0 ), seagrass: new Uint8Array( T.seagrass ), rubble: new Uint8Array( T.rubble ) };
	cutFlats( copy );
	const t0 = performance.now();
	for ( let r = 0; r < 3; r ++ ) cutFlats( { ...copy, heights: new Float32Array( before ) } );
	const ms = ( performance.now() - t0 ) / 3;
	console.log( `     ${ tag } the cut: ${ ms.toFixed( 0 ) } ms here` );
	// (a ceiling well over this machine's, for a slower runner: a texel at a time it took 0.55 and 2 s here)
	ok( ms < ( T.texel > 1 ? 400 : 1200 ), `${ tag } cut in a fraction of a second (${ ms.toFixed( 0 ) } ms here)` );

}

// ---- its fish
const T = new TerrainData( 7, bake( 'island-1024.bin' ) );
for ( const [ x, z ] of FLATS_HOMES ) {

	const f = flatsAt( x, z ), h = T.heightAt( x, z );
	if ( ! ( f.on > 0.99 && f.edge > 20 && h < - 0.1 && h > - 0.9 && f.mud < 0.2 ) ) ok( false, `a feeding ground at ( ${ x }, ${ z } ) on the flat's sand (on ${ f.on.toFixed( 2 ) }, ${ f.edge.toFixed( 0 ) } m in, ${ h.toFixed( 2 ) } m)` );

}

ok( true, `each of the ${ FLATS_HOMES.length } feeding grounds on the flat's sand, well in from its edge` );
ok( FLATS_ROUTES.every( ( r ) => flatsAt( r[ 0 ][ 0 ], r[ 0 ][ 1 ] ).edge < 15 && r.every( ( [ x, z ] ) => T.heightAt( x, z ) < - 0.4 ) ), `${ FLATS_ROUTES.length } ways in, each from the edge up a creek, under water all the way` );

// a month of island days, every quarter of an island hour
let feeding = 0, offFeeding = 0, dry = 0, sizes = [], perHigh = new Map(), permitOn = 0, permitOff = 0, spawnOff = 0, spawnSeen = 0, deep = 0;
for ( let t = 0; t < 24 * 30; t += 0.25 ) {

	const { phi } = tideStage( t ), list = flatsSchools( t, { wind: 6, overcast: 0.5, hour: t % 24 } );
	for ( const s of list ) {

		if ( s.kind === 'bonefish' && s.id.startsWith( 'bone:' ) ) {

			const k = s.id.split( ':' )[ 1 ];
			perHigh.set( k, Math.max( perHigh.get( k ) || 0, Number( s.id.split( ':' )[ 2 ] ) + 1 ) );
			sizes.push( s.n );
			if ( s.mode === 'feed' || s.mode === 'tail' ) {

				if ( Math.abs( phi ) < 3.6 ) feeding ++;
				else offFeeding ++;
				const g = T.heightAt( s.x, s.z );
				if ( g > tideAt( t ) - 0.05 ) dry ++;
				if ( g < - 1.5 ) deep ++;

			}

		}

		if ( s.kind === 'permit' ) flatsAt( s.x, s.z ).edge > 0 ? permitOn ++ : permitOff ++;
		if ( s.id.startsWith( 'spawn:' ) ) {

			const m = moonAt( t ).phase, d = Math.min( m, Math.abs( m - 0.5 ), 1 - m ) * SYNODIC;
			if ( d > FLATS_FISH.spawn.days ) spawnOff ++;
			spawnSeen ++;

		}

	}

}

ok( feeding > 1000 && offFeeding === 0, `bonefish feed on the flat only from about 3 h into the flood to 3 h into the ebb (${ feeding } readings, ${ offFeeding } outside it)` );
ok( dry / feeding < 0.08 && deep / feeding < 0.08, `and in its water: ${ ( dry / feeding * 100 ).toFixed( 1 ) }% of their readings on sand bared by the tide, ${ ( deep / feeding * 100 ).toFixed( 1 ) }% over deep water` );
const per = [ ...perHigh.values() ];
ok( Math.min( ...per ) >= FLATS_FISH.bonefish.schools[ 0 ] && Math.max( ...per ) <= FLATS_FISH.bonefish.schools[ 1 ], `${ Math.min( ...per ) } to ${ Math.max( ...per ) } schools each high water` );
ok( Math.min( ...sizes ) >= 3 && Math.max( ...sizes ) <= 20, `of ${ Math.min( ...sizes ) } to ${ Math.max( ...sizes ) } fish` );
ok( permitOn > 50 && permitOff > 50, `permit on the flat's edge at high water (${ permitOn }), off it at low (${ permitOff })` );
ok( spawnSeen > 4 && spawnOff === 0, `the bonefish gathering to spawn at dusk about new and full moon, and only then (${ spawnSeen } readings)` );

// the ground the feeding grounds' rays follow, baked into FlatsGround.js from the 1 m bake: still what it makes (or
// run tools/flats/ground.mjs), and low's own ground along them near it
{

	const T1 = new TerrainData( 7, bake( 'island.bin' ) ), now = feedRays( T1 );
	const same = ( A ) => JSON.stringify( A.map( ( r ) => [ r.p, r.off, r.g ] ) );
	ok( same( now ) === same( FEED_RAYS ), `game/FlatsGround.js is the ground's as it is (${ FEED_RAYS.length } rays; if not, run tools/flats/ground.mjs)` );
	let most = 0, sum = 0, n = 0;
	for ( const r of FEED_RAYS ) {

		const low = profile( T, r.p );
		for ( let j = 0; j < low.length; j ++ ) if ( r.g[ j ] < 60 ) {

			const d = Math.abs( low[ j ] - r.g[ j ] ) / 100;
			most = Math.max( most, d );
			sum += d;
			n ++;

		}

	}

	ok( sum / n < 0.03 && most < 0.35, `and low's 2 m ground along them near it: ${ ( sum / n * 100 ).toFixed( 1 ) } cm on average, ${ ( most * 100 ).toFixed( 0 ) } at most (under water)` );

}

// each kind in water of its depth, two months of island days: world/Fish.js' least water for each (its minDepth and
// 0.15 m more); feeding bonefish on their rays, tailing only where it's a foot or so deep; permit up onto the flat into
// water they tail in; and each school's anchor moving as fish swim, not leaping (a hundredth of an island hour is a
// second by day)
{

	// (a bonefish's fins are out under 0.1 m: Colton and Alevizon 1983)
	const NEED = { bonefish: 0.12, permit: 0.35, tarpon: 0.95, snook: 0.55, barracuda: 0.55, blacktipShark: 0.5, lemonShark: 0.55 };
	const shallow = {}, all = {}, prev = new Map(), speeds = [];
	let feeding = 0, tails = 0, tailsDeep = 0, permitTails = 0, permits = 0;
	for ( let t = 24; t < 24 * 60; t += 0.25 ) {

		const sea = tideAt( t );
		for ( const s of flatsSchools( t, { wind: 3, overcast: 0.1, hour: t % 24 } ) ) {

			if ( s.life < 0.99 ) continue;
			const d = sea - T.heightAt( s.x, s.z );
			all[ s.kind ] = ( all[ s.kind ] || 0 ) + 1;
			if ( d < NEED[ s.kind ] ) shallow[ s.kind ] = ( shallow[ s.kind ] || 0 ) + 1;
			if ( s.kind === 'bonefish' && ( s.mode === 'feed' || s.mode === 'tail' ) ) feeding ++;
			if ( s.mode === 'tail' ) {

				tails ++;
				if ( d > 0.7 ) tailsDeep ++;

			}

			if ( s.kind === 'permit' ) {

				permits ++;
				if ( d <= 0.6 ) permitTails ++;

			}

		}

	}

	for ( const k of Object.keys( NEED ) ) ok( ( shallow[ k ] || 0 ) / all[ k ] < 0.03, `${ k }: in water deep enough for it ${ ( 100 - ( shallow[ k ] || 0 ) / all[ k ] * 100 ).toFixed( 1 ) }% of the time (${ NEED[ k ] } m or more)` );
	ok( tails / feeding > 0.2 && tailsDeep / tails < 0.05, `feeding bonefish tailing ${ ( tails / feeding * 100 ).toFixed( 0 ) }% of the time, and then in a foot or two of water (${ ( tailsDeep / tails * 100 ).toFixed( 1 ) }% over 0.7 m)` );
	ok( permitTails / permits > 0.1, `permit up on the flat in water they tail in (0.6 m or less) ${ ( permitTails / permits * 100 ).toFixed( 0 ) }% of the time` );
	for ( let t = 48; t < 48 + 24 * 10; t += 0.01 ) for ( const s of flatsSchools( t, { wind: 3, overcast: 0, hour: t % 24 } ) ) {

		if ( s.kind !== 'bonefish' && s.kind !== 'permit' ) continue;
		const p = prev.get( s.id );
		if ( p && Math.abs( p.t - ( t - 0.01 ) ) < 1e-6 && p.mode === s.mode && ( s.mode !== 'cruise' || s.kind === 'permit' ) ) speeds.push( Math.hypot( s.x - p.x, s.z - p.z ) );
		prev.set( s.id, { x: s.x, z: s.z, t, mode: s.mode } );

	}

	speeds.sort( ( x, y ) => x - y );
	const q = ( f ) => speeds[ Math.floor( f * ( speeds.length - 1 ) ) ];
	ok( q( 0.9 ) < 1 && q( 0.99 ) < 3.5, `feeding bonefish and permit keep to a fish's pace with the tide: ${ q( 0.5 ).toFixed( 2 ) } m a second by day (half the time), ${ q( 0.9 ).toFixed( 2 ) } (90%), ${ q( 0.99 ).toFixed( 2 ) } (99%), the most ${ q( 1 ).toFixed( 1 ) }` );

}

// the same for everyone: worked out again, the same to the last bit
const a = JSON.stringify( flatsSchools( 1234.567, { wind: 5, overcast: 0.1, hour: 10.5 } ) ), b = JSON.stringify( flatsSchools( 1234.567, { wind: 5, overcast: 0.1, hour: 10.5 } ) );
ok( a === b && a.length > 20, 'the same schools in the same places, worked out twice' );

// spooked and hooked
{

	let t = 0;
	for ( ; t < 200; t += 0.25 ) if ( flatsSchools( t ).some( ( s ) => s.mode === 'tail' ) ) break;
	const school = flatsSchools( t ).find( ( s ) => s.mode === 'tail' ), st = newFlatsState();
	spook( st, school.id, t );
	const gone = ! flatsSchools( t + 0.1, undefined, st ).some( ( s ) => s.id === school.id );
	const back = flatsSchools( t + FLATS_FISH.quiet + 0.05, undefined, st ).some( ( s ) => s.id === school.id );
	ok( gone && back, `a spooked school's gone, and back ${ FLATS_FISH.quiet } island hours later` );
	hook( st, school.id );
	const after = flatsSchools( t + FLATS_FISH.quiet + 0.05, undefined, st ).find( ( s ) => s.id === school.id );
	ok( after && after.n === flatsSchools( t + FLATS_FISH.quiet + 0.05 ).find( ( s ) => s.id === school.id ).n - 1, 'one hooked: one fewer in it' );
	forgetFlats( st, t + 60 );
	ok( Object.keys( st.spooked ).length === 0 && Object.keys( st.hooked ).length === 0, 'and long after, forgotten' );
	ok( JSON.stringify( st ).length < 100, 'all of it a small record to send' );

}

if ( fails ) {

	console.log( `\n${ fails } failed` );
	process.exit( 1 );

}

console.log( '\nall passed' );
