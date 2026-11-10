// (M17) What minds the moon (run by test/moon.mjs, and on its own): the hatchlings' pull to a light by it (game/Turtles.js:
// the sea's horizon brighter under it, Moon.horizonOf), the swordfish's night depth by it (Bites.depthWeight, FishTable's
// swordfish: Lerner et al. 2013), and a turned-back turtle's night through a save and a load (Minding.kept, restore).
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { femalesOf, planCrawl, timeline, femaleAt, hatchingsOf, tracksOf, seaGlow, Clutch, Minding, MINDING, NEST } from '../src/game/Turtles.js';
import { advance, moonAt } from '../src/game/IslandClock.js';
import { depthWeight, hookWeight, pickSpecies, habitatAt } from '../src/game/Bites.js';
import { FISH } from '../src/game/FishTable.js';
import { moonSky, horizonOf } from '../src/sky/Moon.js';
import { mulberry32 } from '../src/util/Noise.js';

async function moonTests( ok ) {

	let fails = 0;
	const check = ( c, msg ) => {

		ok( c, msg );
		if ( ! c ) fails ++;

	};
	const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
	const TD = new TerrainData( 7, decodeIsland( read( 'island-1024.bin' ) ) ), g = ( x, z ) => TD.heightAt( x, z );

	// ---- the sea's horizon under the moon: as bright as the sky over it
	{

		let newest = Infinity, fullest = 0;
		for ( let T = 0; T < 24 * 30; T += 0.5 ) {

			const s = seaGlow( T, T % 24 );
			newest = Math.min( newest, s );
			fullest = Math.max( fullest, s );

		}

		check( newest === 1, 'a moonless night\'s horizon: the sea\'s own draw' );
		check( fullest > 15 && fullest < 40, `under a full moon high the horizon's ${ fullest.toFixed( 1 ) } times as bright (the sky 3 to 4 magnitudes brighter: Benn and Ellison)` );
		const m = moonSky( 30, 6 );
		check( Math.abs( horizonOf( m ) - seaGlow( 30, 6 ) ) < 1e-12, 'the turtles\' horizon is the sky\'s' );

	}

	// ---- a light that draws hatchlings off on a moonless night, under a full moon high: they keep to the sea
	{

		let h = null;
		for ( let d = 1; d < 40 && ! h; d ++ ) h = hatchingsOf( d )[ 0 ];
		const p = planCrawl( h.female, g ), [ nx, nz ] = p.nest;
		const lampAt = ( d ) => {

			// (inland of the nest and to one side: they're going away from it)
			const x = nx + d * 0.8, z = nz + d * 0.6;
			return { x, y: g( x, z ) + 1.5, z, intensity: 55, range: 30, dir: null };

		};
		const drawn = ( lamp, sea ) => {

			const L = new Clutch( h, p, g, 11 );
			for ( let t = 30; t < 50; t += 0.4 ) L.lure( t, [ lamp ], sea );
			let n = 0;
			for ( let i = 0; i < L.count; i ++ ) if ( L.lured[ i ] ) n ++;
			return n;

		};
		let full = 0;
		for ( let T = 0; T < 24 * 30; T += 0.5 ) full = Math.max( full, seaGlow( T, T % 24 ) );
		const far = lampAt( 22 ), near = lampAt( 2.5 );
		const fNew = drawn( far, 1 ), fFull = drawn( far, full ), nFull = drawn( near, full );
		check( fNew > 10 && fFull === 0, `a lamp 22 m off draws ${ fNew } off their way on a moonless night, ${ fFull } under a full moon high` );
		check( nFull > 10, `one 2.5 m off still draws ${ nFull } under it` );
		// (the flashlight's reach: 30 m in its beam on a dark night; a full moon's)
		const reach = ( sea ) => Math.sqrt( 55 / ( 0.02 * 0.35 * sea ) );
		check( reach( 1 ) > 30 && reach( full ) < 20, `a 55-candela light's reach to lead them: ${ Math.min( 30, reach( 1 ) ).toFixed( 0 ) } m (its range) on a moonless night, ${ reach( full ).toFixed( 0 ) } m under the full moon high` );

	}

	// ---- swordfish deeper under a fuller moon (Lerner et al. 2013: median night depth 32 m at new, 85 m at full)
	{

		const at = FISH.swordfish.at, mid = ( m ) => {

			// (the middle of the depths it's found at, at midnight, by the moon's lit share)
			let s = 0, w = 0;
			for ( let d = 0; d < 600; d += 2 ) {

				const k = depthWeight( at, d, 0, m );
				s += d * k;
				w += k;

			}

			return s / w;

		};
		check( at.full && at.full[ 0 ] > at.night[ 0 ] && at.full[ 1 ] > at.night[ 1 ], `its night depths under a full moon (${ at.full.join( ' to ' ) } m) deeper than at new (${ at.night.join( ' to ' ) })` );
		check( mid( 1 ) - mid( 0 ) > 40, `its depths' middle at midnight: ${ mid( 0 ).toFixed( 0 ) } m at new moon, ${ mid( 1 ).toFixed( 0 ) } at full` );
		const f6 = ( m ) => hookWeight( 'swordfish', { way: 'float', depth: 6 }, 0, m ), d150 = ( m ) => hookWeight( 'swordfish', { way: 'drop', depth: 150 }, 0, m );
		check( f6( 1 ) < f6( 0 ) * 0.6 && f6( 1 ) > 0, `a float 6 m down at midnight: ${ ( f6( 1 ) / f6( 0 ) ).toFixed( 2 ) } of the new moon's bites under a full one (36% of their time in the top 75 m against 82%)` );
		check( d150( 1 ) > 0 && d150( 0 ) === 0, 'a bait 150 m down at midnight: swordfish under a full moon, none at new' );
		check( depthWeight( at, 500, 12, 0 ) === depthWeight( at, 500, 12, 1 ), 'by day the moon\'s nothing to it' );
		// (the habitat carries it: Game.habitatOf's h.moon, moonAt's lit share)
		let seenNew = 0, seenFull = 0;
		const blue = { ...habitatAt( { depth: 600, reefDist: 9999, pierDist: 9999 } ), hook: { way: 'float', depth: 6 } }, A = mulberry32( 7 ), B = mulberry32( 7 );
		for ( let i = 0; i < 4000; i ++ ) {

			if ( pickSpecies( { ...blue, moon: 0 }, 0, A, 'squid' ) === 'swordfish' ) seenNew ++;
			if ( pickSpecies( { ...blue, moon: 1 }, 0, B, 'squid' ) === 'swordfish' ) seenFull ++;

		}

		check( seenFull < seenNew * 0.75, `on a squid float in the blue at midnight: ${ seenNew } swordfish of 4000 bites at new moon, ${ seenFull } at full` );
		check( Math.abs( moonAt( 8 * 24 ).lit - 1 ) < 0.02, 'the habitat\'s moon the clock\'s (day 8 near full)' );

	}

	// ---- a turned-back turtle's night through a save and a load: her tracks the next morning hers
	{

		const f = femalesOf( 2 ).find( ( q ) => ! q.false ) || femalesOf( 3 ).find( ( q ) => ! q.false );
		const plan = planCrawl( f, g ), line = timeline( f, plan );
		const M = new Minding();
		// (someone walking straight at her as she comes up)
		let tu = null, at = null;
		for ( let t = 0; t < 120 && ! tu; t += 0.1 ) {

			const c = advance( f.arrive, f.day, 0.01, t );
			const st = femaleAt( f, plan, c.hour, c.day, line, null );
			if ( ! st || st.phase !== 'up' ) continue;
			tu = M.tick( f, st, t, 0.1, [ { x: st.x + Math.sin( st.heading ) * 4, z: st.z + Math.cos( st.heading ) * 4, speed: 1.4 } ], [], g );
			at = c;

		}

		check( !! tu, `turned back as she came up (${ tu ? tu.from : 'no' })` );
		// (the save: the clock's, as text, the next morning; then a fresh game's)
		const morning = { hour: 8, day: f.day + 1 };
		const kept = M.kept( morning.hour, morning.day );
		const text = JSON.stringify( { hour: morning.hour, day: morning.day, turtles: kept } );
		check( Array.isArray( kept ) && kept.length === 1 && text.length < 400, `kept in the clock's save: ${ text.length } characters (${ text })` );
		const N = new Minding();
		N.restore( JSON.parse( text ).turtles, g );
		const back = N.turned.get( f.id );
		check( !! back && back.down.length === tu.down.length && back.down.every( ( q, i ) => q[ 0 ] === tu.down[ i ][ 0 ] && q[ 1 ] === tu.down[ i ][ 1 ] ), `her way down, ${ tu.down.length } points, the same after the load` );
		check( back && back.s === tu.s && back.crawl === tu.crawl, 'her up track cut where she turned, and her crawl down, the same' );
		// her night as each game has it, before and after
		let same = true;
		for ( let t = 0; t < 140; t += 0.5 ) {

			const c = advance( f.arrive, f.day, 0.01, t );
			const a = femaleAt( f, plan, c.hour, c.day, line, tu ), b = femaleAt( f, plan, c.hour, c.day, line, back );
			if ( ( ! a ) !== ( ! b ) || ( a && ( a.phase !== b.phase || Math.abs( a.x - b.x ) > 1e-9 || Math.abs( a.z - b.z ) > 1e-9 ) ) ) same = false;

		}

		check( same, 'her night after the load as it was: the same turn, the same way back' );
		check( tracksOf( morning.day, morning.hour ).some( ( q ) => q.female.id === f.id ), 'her tracks still on the sand that morning' );
		// (gone with her tracks; nothing kept of a night nobody turned)
		const later = advance( f.arrive, f.day, 0.01, 0 );
		check( N.kept( 12, f.day + 3 ) === null, 'let go with her tracks' );
		check( new Minding().kept( later.hour, later.day ) === null, 'nothing kept when none was turned back' );
		// a bad save doesn't break the load
		const B = new Minding();
		B.restore( [ [ 'x' ], null, [ '99:9', 1, 2, 3, 4, 'up', 0, 0, 1 ], 'nope' ], g );
		B.restore( 'nope', g );
		check( B.turned.size === 0, 'a bad or stale record is passed over' );
		check( MINDING.wary.up && NEST.trackDays > 1, '(her tracks last into the next day)' );
		void at;

	}

	return fails;

}

const failed = await moonTests( ( c, msg ) => console.log( c ? 'ok  ' : 'FAIL', msg ) );
if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
