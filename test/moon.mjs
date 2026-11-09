// (M17) Plain-node tests of the moon (sky/Moon.js, docs/m17/moon.md): its disc's phase and place from IslandClock.moonAt,
// its light by phase and height, and the springs after the drawn new and full moon. What minds it (the hatchlings, the
// swordfish, a turned-back turtle's night saved) is test/moon-life.mjs.
import { moonSky, moonLight, nightOf, sunAt, phaseLight, throughAir, FULL_HIGH, MOON } from '../src/sky/Moon.js';
import { moonAt, tideAt, SYNODIC } from '../src/game/IslandClock.js';

let fails = 0;
const check = ( c, msg ) => ok( c, msg );
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

const dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
const deg = ( r ) => r * 180 / Math.PI;

// ---- its phase: the drawn disc's lit share against moonAt's, a month of island hours
{

	let worst = 0, worstPlace = 0;
	for ( let T = 0; T < 24 * 60; T += 1.7 ) {

		const hour = T % 24, m = moonSky( T, hour ), a = moonAt( T );
		worst = Math.max( worst, Math.abs( m.lit - a.lit ) );
		// (its elongation from the sun, against the phase's: off only by its orbit's tilt, 5.1 degrees at most)
		const want = 360 * Math.min( a.phase, 1 - a.phase );
		worstPlace = Math.max( worstPlace, Math.abs( m.elongation - want ) );

	}

	ok( worst < 0.012, `the disc lit to moonAt's phase over 60 days: within ${ worst.toFixed( 4 ) } of its lit share` );
	ok( worstPlace < 5.3, `as far from the sun as its phase puts it: within ${ worstPlace.toFixed( 2 ) } degrees (the orbit's 5.1 tilt)` );

}

// ---- full opposite the sun, new beside it, a quarter square to it
{

	const find = ( want ) => {

		let best = null;
		for ( let T = 0; T < 24 * 30; T += 0.05 ) {

			const p = moonAt( T ).phase, off = Math.abs( ( ( p - want + 1.5 ) % 1 ) - 0.5 );
			if ( ! best || off < best.off ) best = { T, off };

		}

		return best.T;

	};
	const full = find( 0.5 ), news = find( 0 ), q1 = find( 0.25 );
	const at = ( T ) => moonSky( T, T % 24 );
	ok( dot( at( full ).dir, at( full ).sun ) < - 0.99, `full: opposite the sun (cos ${ dot( at( full ).dir, at( full ).sun ).toFixed( 3 ) })` );
	ok( dot( at( news ).dir, at( news ).sun ) > 0.99, `new: beside it (cos ${ dot( at( news ).dir, at( news ).sun ).toFixed( 3 ) })` );
	ok( Math.abs( dot( at( q1 ).dir, at( q1 ).sun ) ) < 0.09, `first quarter: square to it (cos ${ dot( at( q1 ).dir, at( q1 ).sun ).toFixed( 3 ) })` );
	// the full moon up at midnight, high in the south; new moon down all night
	const fm = moonSky( Math.round( full / 24 ) * 24, 0 );
	ok( fm.dir[ 1 ] > 0.6 && fm.dir[ 2 ] > 0, `the full moon at midnight high in the south (${ deg( Math.asin( fm.dir[ 1 ] ) ).toFixed( 0 ) } degrees up)` );
	const nm = moonSky( Math.round( news / 24 ) * 24, 0 );
	ok( nm.dir[ 1 ] < - 0.5, `the new moon at midnight well down (${ deg( Math.asin( nm.dir[ 1 ] ) ).toFixed( 0 ) } degrees)` );
	// the first quarter at sunset high in the south, the last quarter rising about midnight
	const q = moonSky( Math.floor( q1 / 24 ) * 24 + 18.4, 18.4 );
	ok( q.dir[ 1 ] > 0.7, `a first quarter at sunset high up (${ deg( Math.asin( q.dir[ 1 ] ) ).toFixed( 0 ) } degrees)` );

}

// ---- rising about 50 minutes later each day (24 h x 29.53 / 28.53: 50.5 on average over a lunation)
{

	const rises = [];
	let prev = moonSky( 0, 0 ).dir[ 1 ];
	for ( let T = 0.02; T < 24 * 89; T += 0.02 ) {

		const y = moonSky( T, T % 24 ).dir[ 1 ];
		if ( prev < 0 && y >= 0 ) rises.push( T );
		prev = y;

	}

	const gaps = rises.slice( 1 ).map( ( t, i ) => t - rises[ i ] );
	const mean = ( gaps.reduce( ( a, b ) => a + b, 0 ) / gaps.length - 24 ) * 60;
	ok( Math.abs( mean - 50.5 ) < 1.5, `it rises ${ mean.toFixed( 1 ) } min later each day on average, over three lunations` );
	ok( gaps.every( ( g ) => g > 24.3 && g < 25.6 ), `each day's from ${ ( ( Math.min( ...gaps ) - 24 ) * 60 ).toFixed( 0 ) } to ${ ( ( Math.max( ...gaps ) - 24 ) * 60 ).toFixed( 0 ) } min later` );

}

// ---- the terminator toward the sun: the disc's lit half on the sun's side, as the sky shader lights it
{

	let worst = 0;
	for ( const T of [ 30, 80, 140, 200, 260, 330, 400, 470, 520, 600 ] ) {

		const m = moonSky( T, T % 24 );
		if ( m.lit < 0.05 || m.lit > 0.95 ) continue;
		const d = m.dir, n = m.north, e = [ d[ 1 ] * n[ 2 ] - d[ 2 ] * n[ 1 ], d[ 2 ] * n[ 0 ] - d[ 0 ] * n[ 2 ], d[ 0 ] * n[ 1 ] - d[ 1 ] * n[ 0 ] ];
		// (the lit side's middle on the disc, as Sky's skyMoon lights it: 2 mu0 / ( mu0 + mu ) over a grid)
		let cx = 0, cy = 0, w = 0;
		for ( let i = - 20; i <= 20; i ++ ) for ( let j = - 20; j <= 20; j ++ ) {

			const x = i / 20, y = j / 20, r2 = x * x + y * y;
			if ( r2 >= 1 ) continue;
			const z = Math.sqrt( 1 - r2 ), N = [ e[ 0 ] * x + n[ 0 ] * y - d[ 0 ] * z, e[ 1 ] * x + n[ 1 ] * y - d[ 1 ] * z, e[ 2 ] * x + n[ 2 ] * y - d[ 2 ] * z ];
			const mu0 = dot( N, m.sun ), L = mu0 > 0 ? 2 * mu0 / ( mu0 + z ) : 0;
			cx += L * x;
			cy += L * y;
			w += L;

		}

		// (the sun's way on the sky about the moon)
		const sx = dot( m.sun, e ), sy = dot( m.sun, n ), a = Math.atan2( cy, cx ) - Math.atan2( sy, sx );
		worst = Math.max( worst, Math.abs( Math.atan2( Math.sin( a ), Math.cos( a ) ) ) );
		if ( w <= 0 ) worst = 9;

	}

	ok( deg( worst ) < 2, `its lit side toward the sun on the sky: within ${ deg( worst ).toFixed( 2 ) } degrees` );

}

// ---- its disc: its size by its distance, its face's north square to the way to it
{

	let lo = 9, hi = 0, worst = 0;
	for ( let T = 0; T < 24 * 60; T += 3.1 ) {

		const m = moonSky( T, T % 24 ), r = deg( m.radius );
		lo = Math.min( lo, r );
		hi = Math.max( hi, r );
		worst = Math.max( worst, Math.abs( dot( m.north, m.dir ) ), Math.abs( Math.hypot( ...m.north ) - 1 ) );

	}

	ok( lo > 0.243 && hi < 0.28 && hi - lo > 0.025, `its disc ${ ( lo * 2 * 60 ).toFixed( 1 ) } to ${ ( hi * 2 * 60 ).toFixed( 1 ) } arcmin across with its distance` );
	ok( worst < 1e-9, 'its north on the sky square to it' );

}

// ---- its light: about a quarter of a lux full and high, a tenth of that at a quarter, starlight alone at new
{

	ok( FULL_HIGH.ground > 0.2 && FULL_HIGH.ground < 0.3, `the full moon 60 degrees up: ${ FULL_HIGH.ground.toFixed( 3 ) } lux on level ground` );
	ok( Math.abs( phaseLight( 90 ) - 0.091 ) < 0.005, `a quarter moon's light ${ phaseLight( 90 ).toFixed( 3 ) } of the full's (the opposition surge)` );
	ok( throughAir( 1 ) > 0.8 && throughAir( 0.05 ) < 0.1 && throughAir( - 0.02 ) === 0, 'through the air: 0.83 overhead, under a tenth 3 degrees up, none under the horizon' );
	let moonless = Infinity, brightest = 0;
	for ( let T = 0; T < 24 * 365; T += 0.25 ) {

		const n = nightOf( T, T % 24 );
		moonless = Math.min( moonless, n.lux );
		brightest = Math.max( brightest, n.lux );

	}

	ok( Math.abs( moonless - MOON.glow ) < 1e-9, `a moonless night: ${ moonless } lux, the night sky's own` );
	ok( brightest > 0.22 && brightest < 0.34, `the brightest night of a year: ${ brightest.toFixed( 3 ) } lux (a full moon near perigee, high: 0.3 lux a few hours a year in the tropics, Kyba et al. 2017)` );

}

// ---- the springs a day or so after the drawn new and full moon (the age of the tide): each day's range over two
// years, by how long it is since the drawn moon was last new or full, averaged; its peak
{

	// (a tidal day's range, high to low, about T: the tide every 10 minutes)
	const range = ( T ) => {

		let hi = - 9, lo = 9;
		for ( let t = - 12.42; t < 12.42; t += 1 / 6 ) {

			const y = tideAt( T + t );
			hi = Math.max( hi, y );
			lo = Math.min( lo, y );

		}

		return hi - lo;

	};
	const half = SYNODIC / 2, bins = new Float64Array( 60 ), n = new Float64Array( 60 );
	for ( let T = 24; T < 24 * 730; T += 3 ) {

		// (days since the drawn moon was new or full: its elongation's half-turns, as the sky draws it)
		const m = moonSky( T, T % 24 ), since = ( ( m.phase * SYNODIC ) % half );
		const b = Math.floor( since / half * 60 );
		bins[ b ] += range( T );
		n[ b ] ++;

	}

	let best = 0;
	for ( let b = 0; b < 60; b ++ ) {

		bins[ b ] /= n[ b ] || 1;
		if ( bins[ b ] > bins[ best ] ) best = b;

	}

	// (the peak between its neighbours, a parabola through the three)
	const a = bins[ ( best + 59 ) % 60 ], c = bins[ ( best + 1 ) % 60 ], y = bins[ best ];
	const lag = ( best + 0.5 + 0.5 * ( a - c ) / ( a - 2 * y + c ) ) * half / 60;
	const low = bins.reduce( ( m, v, b ) => ( v < bins[ m ] ? b : m ), 0 );
	check( lag > 0.6 && lag < 2, `the springs ${ lag.toFixed( 2 ) } days after the drawn new and full moon, over two years (NOAA's age of the tide at Settlement Point: 25.6 h); their range ${ y.toFixed( 2 ) } m` );
	check( Math.abs( ( low + 0.5 ) * half / 60 - half / 2 - lag ) < 1.5, `the neaps about the quarters, a day or so after (${ ( ( low + 0.5 ) * half / 60 ).toFixed( 1 ) } days on), ${ bins[ low ].toFixed( 2 ) } m` );

}

// ---- SYNODIC as the phase turns
{

	const a = moonAt( 0 ).phase, b = moonAt( SYNODIC * 24 ).phase;
	ok( Math.abs( a - b ) < 1e-6, 'a whole lunation brings the phase round' );

}

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
