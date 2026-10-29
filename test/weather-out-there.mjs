// (M15) The weather where you are (Weather.weatherHere): the island's exactly near it; out past it the
// weather drifting over you down the wind, its rain only under the showers about you (or a grey sky's
// deck), a thunderstorm a cloud you can run from, a hurricane's vortex where you are in it, and the
// island's own surf, sea level and boarding up kept wherever you are. And the showers about you
// (showers( ..., at )): rows of them beside the island's.
//
//   node test/weather-out-there.mjs

import { weatherAt, weatherHere, dayWeatherAt, showers, cellsAt, towardOf, hurricaneAt, HERE, FRONT_KMH, STORM_RANGE } from '../src/game/Weather.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const f2 = ( v ) => v.toFixed( 2 );
const strip = ( w ) => {

	const o = { ...w };
	delete o.island;
	return JSON.stringify( o );

};
const cellsAbout = ( T, x, z, pick = null ) => showers( T, pick, STORM_RANGE, [], null, 0, { x, z } );

// ---- near the island, the island's exactly
{

	let same = true, n = 0;
	for ( let T = 20; T < 24 * 80; T += 1.37 ) for ( const [ x, z ] of [ [ 0, 0 ], [ 64, 36 ], [ 0, - 1600 ], [ 1500, 1500 ], [ - 2400, 0 ] ] ) {

		n ++;
		if ( strip( weatherHere( T, null, 0, x, z, cellsAbout( T, x, z ) ) ) !== JSON.stringify( weatherAt( T ) ) ) same = false;

	}

	for ( const pick of [ 'fair', 'gale', 'storm', 'southerly', 'hurricane' ] ) if ( strip( weatherHere( 100, pick, 90, 30, 40, null ) ) !== JSON.stringify( weatherAt( 100, pick, 90 ) ) ) same = false;
	check( same, `within ${ HERE.near[ 0 ] / 1000 } km of the island's middle, the weather's the island's exactly (${ n } places and times, and picked)` );
	// (a held pick the same everywhere)
	check( strip( weatherHere( 100, 'gale', 0, 30000, - 20000, cellsAbout( 100, 30000, - 20000, 'gale' ) ) ) === JSON.stringify( weatherAt( 100, 'gale' ) ), 'a weather of your own (a picked gale) the same wherever you are' );

}

// ---- out there: the weather drifting over you
{

	// (upwind of the island, what it gets later: away from a hurricane, whose vortex is where it is)
	let worst = 0, coarse = 0, fine = 0, n = 0;
	for ( let T = 60; T < 24 * 200; T += 7.3 ) {

		if ( hurricaneAt( T ) ) continue;
		n ++;
		const d = towardOf( dayWeatherAt( T ).windAngle ), up = 24000, x = - d.x * up, z = - d.y * up;
		const here = weatherHere( T, null, 0, x, z, cellsAbout( T, x, z ) ), later = dayWeatherAt( T + up / ( FRONT_KMH * 1000 ), 1 );
		worst = Math.max( worst, Math.abs( here.wind - later.wind ), Math.abs( here.coverage - later.coverage ) * 10 );
		// (and no step anywhere on the way out to it: the changes shrink with the step, as they wouldn't at a seam)
		for ( const [ step, keep ] of [ [ 50, ( v ) => { coarse = Math.max( coarse, v ); } ], [ 5, ( v ) => { fine = Math.max( fine, v ); } ] ] ) {

			let prev = null;
			for ( let r = 0; r <= 9000; r += step ) {

				const w = weatherHere( T, null, 0, - d.x * r, - d.y * r, null );
				if ( prev ) keep( Math.max( Math.abs( w.wind - prev.wind ), Math.abs( w.swell - prev.swell ) * 5 ) );
				prev = w;

			}

		}

	}

	check( worst < 1e-9, `24 km up the wind it's what the island gets three hours later (as the weather comes down the trades at 8 km a game hour; ${ n } times, no hurricane about)` );
	check( fine < coarse / 5, `no jump in the wind or the sea on the way out from the island (largest change in 50 m ${ f2( coarse ) } m/s, in 5 m ${ f2( fine ) })` );
	// (its swell the open sea's: none kept out of the bay)
	let open = 0, bay = 0;
	for ( let T = 60; T < 24 * 200; T += 3.1 ) {

		open += weatherHere( T, null, 0, 0, 20000, null ).swell;
		bay += weatherAt( T ).swell;

	}

	check( open >= bay, `far out, the open sea's swell (a mean ${ f2( open / 1530 ) } of today's, at the island ${ f2( bay / 1530 ) })` );

}

// ---- the rain: under the showers about you
{

	// (a showery time, cloud broken: rain where a shower is, none between)
	let found = null;
	for ( let T = 60; T < 24 * 200 && ! found; T += 0.5 ) {

		const x = 0, z = 18000, cells = cellsAbout( T, x, z );
		const day = dayWeatherAt( T );
		if ( day.overcast < HERE.deck[ 0 ] && cells.some( ( c ) => c.rain > 0.4 && Math.hypot( c.x - x, c.z - z ) < 12000 ) ) found = { T, cells };

	}

	check( !! found, 'a showery time found, the sky broken' );
	if ( found ) {

		const { T, cells } = found, c = cells.filter( ( q ) => q.rain > 0.4 && Math.hypot( q.x, q.z - 18000 ) < 12000 )[ 0 ];
		const under = weatherHere( T, null, 0, c.x, c.z, cells );
		// (a place clear of every shower)
		let clear = null;
		for ( let a = 0; a < 64 && ! clear; a ++ ) {

			const x = c.x + Math.cos( a ) * 6000, z = c.z + Math.sin( a ) * 6000;
			if ( cellsAt( cells, x, z ).rain === 0 ) clear = [ x, z ];

		}

		const between = clear ? weatherHere( T, null, 0, clear[ 0 ], clear[ 1 ], cells ) : null;
		console.log( `     under a shower ${ f2( under.rain ) } rain, ${ clear ? `6 km off between them ${ f2( between.rain ) }` : 'no clear place found' }` );
		check( under.rain > 0.3 && between && between.rain < 0.05, 'out there it rains under a shower and not between them' );
		check( under.visibility < weatherHere( T, null, 0, clear[ 0 ], clear[ 1 ], cells ).visibility, 'and the air closes in under it' );

	}

	// (a thunderstorm: its thunder there, none a few km off; drifting at 8 km/h, a boat at 12 m/s leaves it)
	let storm = null;
	for ( let T = 60; T < 24 * 600 && ! storm; T += 0.5 ) {

		const cells = cellsAbout( T, 0, 20000 ), t = cells.find( ( q ) => q.thunder > 0.5 && Math.hypot( q.x, q.z ) > 9000 );
		if ( t ) storm = { T, cells, t };

	}

	check( !! storm, 'a thunderstorm out there found' );
	if ( storm ) {

		const { T, cells, t } = storm;
		const at = weatherHere( T, null, 0, t.x, t.z, cells ), off = weatherHere( T, null, 0, t.x + t.r * 3, t.z, cells );
		console.log( `     under a thunderstorm: rain ${ f2( at.rain ) }, thunder ${ f2( at.thunder ) }; ${ ( t.r * 3 / 1000 ).toFixed( 1 ) } km off: thunder ${ f2( off.thunder ) }` );
		check( at.thunder > 0.4 && off.thunder === 0, 'its thunder there, none a few km off' );
		// (after 10 minutes at 12 m/s across its drift, out from under it)
		const T2 = T + 1 / 6, cells2 = cellsAbout( T2, t.x + 7200, t.z ), gone = weatherHere( T2, null, 0, t.x + 7200, t.z, cells2 );
		check( gone.thunder < at.thunder * 0.5, `run from at 12 m/s, ten minutes on its thunder ${ f2( gone.thunder ) }` );

	}

}

// ---- the showers about you: not only where they pass the island
{

	let rows = false;
	for ( let T = 60; T < 24 * 200 && ! rows; T += 0.5 ) {

		const d = towardOf( weatherAt( T ).windAngle ), x = - d.y * 45000, z = d.x * 45000; // (45 km to the side)
		const near = cellsAbout( T, x, z ).filter( ( c ) => Math.hypot( c.x - x, c.z - z ) < 15000 );
		const old = showers( T, null, STORM_RANGE ).filter( ( c ) => Math.hypot( c.x - x, c.z - z ) < 15000 );
		if ( near.length > 0 && old.length === 0 ) rows = true;

	}

	check( rows, 'showers about you 45 km off the island\'s track, where before there were none' );
	// (the island's own row as it was)
	let same = true;
	for ( let T = 60; T < 24 * 30; T += 1.3 ) {

		const mine = cellsAbout( T, 0, 0 ).filter( ( c ) => c.n < ( 1 << 20 ) && c.n > - ( 1 << 20 ) ), old = showers( T, null, STORM_RANGE );
		if ( JSON.stringify( mine.map( ( c ) => [ c.n, c.x, c.z ] ) ) !== JSON.stringify( old.map( ( c ) => [ c.n, c.x, c.z ] ) ) ) same = false;

	}

	check( same, 'the showers passing the island the same as ever, the rows beside them added' );

}

// ---- a hurricane: its vortex where you are
{

	let h = null;
	for ( let T = 24 * 14; T < 24 * 400 && ! h; T += 6 ) {

		const a = hurricaneAt( T );
		if ( a && a.r < 300000 ) h = a;

	}

	check( !! h, 'a hurricane found' );
	if ( h ) {

		// (a place 60 km up its track from the island: its strongest wind there comes sooner)
		const up = 60000, x = - h.track.x * up, z = - h.track.y * up;
		let tIsland = 0, tUp = 0, wI = 0, wU = 0;
		for ( let T = h.tc - 30; T < h.tc + 30; T += 0.1 ) {

			const i = weatherAt( T ).wind, u = weatherHere( T, null, 0, x, z, null ).wind;
			if ( i > wI ) { wI = i; tIsland = T; }
			if ( u > wU ) { wU = u; tUp = T; }

		}

		const lead = tIsland - tUp, expect = up / h.speed;
		console.log( `     60 km up its track its strongest wind ${ wU.toFixed( 0 ) } m/s, ${ lead.toFixed( 1 ) } game hours before the island's ${ wI.toFixed( 0 ) } (it comes at ${ ( h.speed / 1000 ).toFixed( 0 ) } km an hour: ${ expect.toFixed( 1 ) })` );
		check( Math.abs( lead - expect ) < 0.8, 'its eye passes over the far grounds before it reaches the island' );
		// (the island's surge and surf kept, wherever you are)
		const T = h.tc, far = weatherHere( T, null, 0, x, z, null ), isl = weatherAt( T );
		check( far.surge === isl.surge && far.surf === isl.surf && far.boarded === isl.boarded, 'the sea\'s level, the bay\'s surf and the island boarded up stay the island\'s' );

	}

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
