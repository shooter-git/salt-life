// (M17) Plain-node tests of the tide and the moon (game/IslandClock.js): Settlement Point's tide set beside NOAA's own
// predictions for it, its shape (highs 12 h 25 min apart, springs a day after new and full moon and bigger at perigee,
// the mean range), the moon's phase and distance, and every device working out the same tide (+ - x / alone).
import { cosTurns, tideAt, tideAtUTC, tideRate, tideTurns, tideState, moonAt, SYNODIC } from '../src/game/IslandClock.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// NOAA CO-OPS' predicted highs and lows at Settlement Point (9710441), November 2026, GMT, m about MSL (the datum
// API: product=predictions, interval=hilo, datum=MSL): ddhhmm, H or L, height
const NOAA_NOV_2026 = [
	'010518H0.361 011120L-0.338 011752H0.554 020024L-0.324 020629H0.369 021232L-0.305 021858H0.514 030127L-0.330',
	'030739H0.402 031344L-0.296 032002H0.485 040226L-0.351 040842H0.449 041452L-0.308 042101H0.462 050318L-0.378',
	'050939H0.499 051552L-0.331 052154H0.441 060406L-0.402 061028H0.539 061645L-0.357 062243H0.418 070449L-0.421',
	'071113H0.565 071732L-0.378 072327H0.393 080529L-0.429 081154H0.574 081816L-0.390 090009H0.366 090608L-0.428',
	'091234H0.569 091857L-0.391 100048H0.338 100645L-0.417 101312H0.552 101937L-0.381 110128H0.309 110723L-0.397',
	'111351H0.526 112017L-0.360 120207H0.281 120801L-0.370 121430H0.496 122058L-0.331 130247H0.255 130840L-0.336',
	'131511H0.462 132140L-0.301 140330H0.232 140922L-0.299 141554H0.429 142225L-0.274 150417H0.218 151009L-0.263',
	'151640H0.399 152312L-0.258 160509H0.217 161101L-0.235 161729H0.372 170001L-0.256 170604H0.233 171159L-0.221',
	'171821H0.353 180050L-0.272 180701H0.271 181301L-0.228 181914H0.341 190137L-0.304 190755H0.329 191402L-0.258',
	'192007H0.338 200224L-0.350 200847H0.401 201500L-0.306 202058H0.342 210310L-0.406 210936H0.479 211554L-0.363',
	'212149H0.351 220356L-0.463 221025H0.556 221647L-0.421 222239H0.363 230443L-0.516 231114H0.622 231738L-0.469',
	'232329H0.374 240531L-0.558 241203H0.669 241829L-0.501 250020H0.382 250620L-0.581 251254H0.694 251920L-0.515',
	'260112H0.384 260712L-0.581 261345H0.692 262013L-0.511 270206H0.380 270806L-0.559 271439H0.666 272107L-0.495',
	'280303H0.371 280903L-0.516 281534H0.619 282203L-0.473 290403H0.362 291004L-0.462 291632H0.557 292301L-0.452',
	'300507H0.359 301109L-0.407 301732H0.489',

].join( ' ' ).split( ' ' ).map( ( r ) => ( { ms: Date.UTC( 2026, 10, + r.slice( 0, 2 ), + r.slice( 2, 4 ), + r.slice( 4, 6 ) ), high: r[ 6 ] === 'H', v: + r.slice( 7 ) } ) );

// ---- every device the same: cos from + - x / alone
let worst = 0;
for ( let i = 0; i <= 4000; i ++ ) {

	const x = i / 1000 - 2 + i * 1e-7;
	worst = Math.max( worst, Math.abs( cosTurns( x ) - Math.cos( 2 * Math.PI * x ) ) );

}
ok( worst < 1e-10, `cosTurns is cos to ${ worst.toExponential( 1 ) }` );
ok( Math.abs( cosTurns( 1e5 + 0.25 ) ) < 1e-9 && cosTurns( 1e5 ) === 1, 'and far out (day 4000 and more)' );

// ---- beside NOAA's: each of its highs and lows has ours within minutes, and as high, but for the seasons' mean
// level (SA and SSA, which the game leaves out: a few cm, the same over the month)
{

	const dt = [], dh = [];
	for ( const p of NOAA_NOV_2026 ) {

		let bt = 0, bv = p.high ? - 9 : 9;
		for ( let k = - 90; k <= 90; k ++ ) {

			const v = tideAtUTC( p.ms + k * 6e4 );
			if ( p.high ? v > bv : v < bv ) { bv = v; bt = k; }

		}

		dt.push( bt );
		dh.push( p.v - bv );

	}

	const off = dh.reduce( ( a, b ) => a + b, 0 ) / dh.length;
	const late = Math.max( ...dt.map( Math.abs ) ), off1 = Math.max( ...dh.map( ( h ) => Math.abs( h - off ) ) );
	ok( NOAA_NOV_2026.length === 115, 'NOAA: 115 highs and lows in November 2026' );
	ok( late <= 12, `each high and low within ${ late } min of NOAA's (12 allowed)` );
	ok( Math.abs( off ) < 0.08 && off1 < 0.09, `each as high as NOAA's to ${ ( off1 * 100 ).toFixed( 1 ) } cm, the month's mean level ${ ( off * 100 ).toFixed( 1 ) } cm apart (the seasons)` );

}

// ---- its rate is its slope
{

	let worst = 0;
	for ( let T = 0; T < 200; T += 1.37 ) worst = Math.max( worst, Math.abs( tideRate( T ) - ( tideAt( T + 1e-4 ) - tideAt( T - 1e-4 ) ) / 2e-4 ) );
	ok( worst < 1e-6, `tideRate is the tide's slope (to ${ worst.toExponential( 1 ) } m/h)` );

}

// ---- its shape over a year of island days
{

	const turns = tideTurns( 0, 24 * 365 ), highs = turns.filter( ( t ) => t.high ), lows = turns.filter( ( t ) => ! t.high );
	ok( turns.every( ( t, i ) => i === 0 || t.high !== turns[ i - 1 ].high ), 'highs and lows alternate' );
	const gap = ( highs.at( - 1 ).T - highs[ 0 ].T ) / ( highs.length - 1 );
	ok( Math.abs( gap - 12.42 ) < 0.02, `highs ${ ( gap ).toFixed( 3 ) } h apart (12 h 25 min)` );
	let range = 0;
	for ( let i = 1; i < turns.length; i ++ ) range += Math.abs( turns[ i ].height - turns[ i - 1 ].height );
	range /= turns.length - 1;
	ok( Math.abs( range - 0.83 ) < 0.04, `the mean range ${ range.toFixed( 3 ) } m (NOAA's 0.834)` );
	const top = Math.max( ...highs.map( ( t ) => t.height ) ), bottom = Math.min( ...lows.map( ( t ) => t.height ) );
	ok( top < 0.8 && bottom > - 0.8, `never past +- 0.8 m (${ top.toFixed( 2 ) }, ${ bottom.toFixed( 2 ) })` );

	// each day's mean range by the moon: springs at new and full, neaps at the quarters, a day late
	const daily = [];
	for ( let day = 0; day < 365; day ++ ) {

		const t = tideTurns( day * 24, day * 24 + 24 );
		let r = 0;
		for ( let i = 1; i < t.length; i ++ ) r += Math.abs( t[ i ].height - t[ i - 1 ].height ) / ( t.length - 1 );
		const m = moonAt( day * 24 + 12 );
		daily.push( { day, r, phase: m.phase, perigee: m.perigee } );

	}

	const sy = daily.filter( ( d ) => Math.min( d.phase, Math.abs( d.phase - 0.5 ), 1 - d.phase ) < 0.04 ), nq = daily.filter( ( d ) => Math.abs( d.phase - 0.25 ) < 0.04 || Math.abs( d.phase - 0.75 ) < 0.04 );
	const mean = ( a ) => a.reduce( ( x, d ) => x + d.r, 0 ) / a.length;
	ok( mean( sy ) > 0.85 && mean( nq ) < 0.75, `springs about new and full moon ${ mean( sy ).toFixed( 2 ) } m, neaps at the quarters ${ mean( nq ).toFixed( 2 ) } m (NOAA's 2026: 0.97, 0.64)` );
	const near = sy.filter( ( d ) => d.perigee > 0.8 ), far = sy.filter( ( d ) => d.perigee < 0.2 );
	ok( mean( near ) - mean( far ) > 0.2, `springs at perigee ${ mean( near ).toFixed( 2 ) } m, at apogee ${ mean( far ).toFixed( 2 ) } m` );
	// the age of the tide: the biggest ranges come about a day after new and full moon
	let lag = 0, n = 0;
	for ( let i = 1; i + 1 < daily.length; i ++ ) {

		const d = daily[ i ];
		if ( d.r > daily[ i - 1 ].r && d.r >= daily[ i + 1 ].r ) {

			const since = ( ( d.phase % 0.5 ) + 0.5 ) % 0.5 * SYNODIC; // days since new or full
			lag += since < 7.4 ? since : since - SYNODIC / 2;
			n ++;

		}

	}

	ok( n > 20 && lag / n > 0.3 && lag / n < 2.2, `springs ${ ( lag / n ).toFixed( 1 ) } days after new and full moon (the station's age of the tide, 25.6 h)` );

}

// ---- the moon
{

	const m = moonAt( 12 );
	ok( m.phase > 0.2 && m.phase < 0.3, `day 1's a first-quarter moon (phase ${ m.phase.toFixed( 3 ) })` );
	const a = moonAt( 0 ).phase, b = moonAt( SYNODIC * 24 ).phase;
	ok( Math.abs( a - b ) < 1e-3, 'the phase comes round in 29.53 days' );
	ok( Math.abs( moonAt( 12 + SYNODIC * 12 ).phase - ( m.phase + 0.5 ) % 1 ) < 1e-3, 'full a fortnight on from new' );
	let lo = Infinity, hi = 0;
	for ( let T = 0; T < 24 * 60; T += 3 ) {

		const d = moonAt( T ).distance;
		lo = Math.min( lo, d );
		hi = Math.max( hi, d );

	}

	ok( lo > 362000 && lo < 366000 && hi > 403000 && hi < 407000, `its distance ${ Math.round( lo ) } to ${ Math.round( hi ) } km` );
	const full = ( 0.5 - moonAt( 0 ).phase ) * SYNODIC * 24;
	ok( moonAt( full ).lit > 0.999 && moonAt( full + SYNODIC * 12 ).lit < 0.001 && Math.abs( moonAt( full - SYNODIC * 6 ).lit - 0.5 ) < 0.01, 'lit to its phase: whole at full, dark at new, half at the quarters' );

}

// ---- the day's first: a new game at 9:30 on day 1 (and the checks)
{

	const s = tideState( 9.5 );
	ok( s.flood && Math.abs( s.height ) < 0.2, `a new game's 9:30: the tide near its mean (${ s.height.toFixed( 2 ) } m) and rising` );
	ok( s.next.high && s.next.T > 11.5 && s.next.T < 14, `high water a little after noon (${ s.next.T.toFixed( 2 ) })` );
	ok( s.since + s.to > 5.5 && s.since + s.to < 7, 'six hours or so from turn to turn' );

}

if ( fails ) {

	console.log( `\n${ fails } failed` );
	process.exit( 1 );

}

console.log( '\nall passed' );
