// (M13) Plain-node tests of a hurricane in the sky: its cloud about its eye (SkyProClouds' eyeCover, the
// shader's twin) against the weather's own hurricane (the clear eye, its wall, its rain's core, its bands
// where its rain bands are, breaks between them), and what the weather driver tells the clouds
// (WeatherDriver.hurricaneSky): its eye, the clouds racing with its wind, the cirrus in its outflow, its
// deck as it is now (clear in its eye, lighter between its bands).
import { Vector2, Vector3, Vector4 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { eyeCover, bandCells } from '../src/sky/SkyProClouds.js';
import { WeatherDriver, bandCurtains } from '../src/world/WeatherDriver.js';
import { hurricaneAt, hurricaneNews, weatherAt, HURRICANE, towardOf } from '../src/game/Weather.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

// ---- its cloud about its eye
{

	const R = 24000, t = [ 1, 0 ];
	const ring = ( r ) => {

		let lo = Infinity, hi = - Infinity;
		for ( let a = 0; a < 64; a ++ ) {

			const c = eyeCover( Math.cos( a / 64 * Math.PI * 2 ) * r, Math.sin( a / 64 * Math.PI * 2 ) * r, R, t[ 0 ], t[ 1 ] );
			lo = Math.min( lo, c );
			hi = Math.max( hi, c );

		}

		return [ lo, hi ];

	};

	check( ring( 0.2 * R )[ 1 ] < 0.3, 'its eye: clear but for low cloud' );
	check( ring( 0.75 * R )[ 0 ] > 1.3, `its wall all round, towering (cover ${ ring( 0.75 * R )[ 0 ].toFixed( 2 ) }: past 1, its tops higher)` );
	check( ring( 1.3 * R )[ 0 ] >= 0.95, 'beyond its wall, over its rain\'s core, a solid deck' );
	const far = ring( 6 * R );
	check( far[ 0 ] < 0.65 && far[ 1 ] >= 0.98, `out among its bands: their rain's deck solid (${ far[ 1 ].toFixed( 2 ) }; (M14) their towers their cells'), the cloud breaking between them (${ far[ 0 ].toFixed( 2 ) })` );

	// its bands where the weather's rain bands are: over the real hurricanes, beyond their rain's core
	const list = [];
	for ( let T = 0; T < 24 * 900; T += 1 ) {

		const h = hurricaneAt( T );
		if ( h && ( ! list.length || list[ list.length - 1 ].tc !== h.tc ) ) list.push( h );

	}

	let inBand = 0, banded = 0, inGap = 0, broken = 0, eyes = 0, clear = 0;
	for ( const h of list.slice( 0, 12 ) ) for ( let dt = - 30; dt <= 30; dt += 0.25 ) {

		const T = h.tc + dt, w = weatherAt( T ), a = hurricaneAt( T );
		if ( ! a ) continue;
		const c = eyeCover( - a.x, - a.z, a.rmax, a.track.x, a.track.y );
		const out = a.r > HURRICANE.core[ 1 ] * a.rmax * 1.1 && a.r < HURRICANE.band.reach[ 0 ];
		if ( out && w.rain > 0.6 ) {

			inBand ++;
			if ( c > 0.9 ) banded ++;

		}

		if ( out && w.rain < 0.02 ) {

			inGap ++;
			if ( c < 0.8 ) broken ++;

		}

		if ( w.eye > 0.9 ) {

			eyes ++;
			if ( c < 0.3 ) clear ++;

		}

	}

	check( inBand > 50 && banded / inBand > 0.95, `under its rain bands its bands' deck overhead, in rain's look (${ banded } of ${ inBand })` );
	check( inGap > 50 && broken / inGap > 0.95, `between them the cloud broken (${ broken } of ${ inGap })` );
	check( eyes > 0 && clear === eyes, `in its eye, clear overhead (${ clear } of ${ eyes })` );

}

// ---- what the weather driver tells the clouds
{

	const since = 24 * 30, at = ( T ) => {

		const sky = {
			clouds: { eye: { value: new Vector4() }, eyeTrack: { value: new Vector2() }, drift: { value: new Vector3() }, upper: { value: new Vector2( 0.4, 0.9 ).normalize() }, overcast: { value: 0 }, storm: { value: 0 } },
			overcast: 0, storm: 0,
		};
		const w = weatherAt( T, 'hurricane', since );
		const d = { hurricane: hurricaneAt( T, 'hurricane', since ), target: w };
		G.windSpeed.value = w.wind;
		towardOf( w.windAngle, G.windDir.value );
		// (the trades' turned: as WeatherDriver turns them)
		const p = G.windPrevailing.value, c = Math.cos( w.windAngle ), s = Math.sin( w.windAngle );
		G.windDir.value.set( p.x * c - p.y * s, p.x * s + p.y * c );
		WeatherDriver.prototype.hurricaneSky.call( d, sky, { ...w, overcast: 0.9, storm: 0.9 } );
		return { sky, h: d.hurricane, w, wind: G.windDir.value.clone() };

	};

	const n = hurricaneNews( since, 'hurricane', since );
	const inEye = at( n.eye ), inWall = at( n.eye - 1.6 ), gone = at( since - 100 );
	const E = inEye.sky.clouds.eye.value;
	check( Math.abs( E.x - inEye.h.x ) < 1e-6 && E.z === inEye.h.rmax && E.w > 0.99 && gone.sky.clouds.eye.value.w === 0, 'its eye, as far as it\'s the weather here (none with no hurricane)' );
	check( inEye.sky.overcast < 0.4 && inEye.sky.storm < 0.05 && inEye.sky.clouds.overcast.value === inEye.sky.overcast, `in its eye the deck as it is now: open (overcast ${ inEye.sky.overcast.toFixed( 2 ) }), not the weather's eased and looking ahead to its wall` );
	const dr = inWall.sky.clouds.drift.value, wd = inWall.wind;
	check( dr.z > 0.8 * inWall.w.wind && dr.x * wd.x + dr.y * wd.y > 0.99, `in its wall the clouds race with its wind (${ dr.z.toFixed( 0 ) } m/s in a ${ inWall.w.wind.toFixed( 0 ) } m/s wind)` );
	// the cirrus: out of its eye, round it clockwise (against its spin): from the eye, outward, and turned
	// the other way from the wind near the ground
	const up = inWall.sky.clouds.upper.value, rx = - inWall.h.x, rz = - inWall.h.z, rl = Math.hypot( rx, rz );
	const outward = ( up.x * rx + up.y * rz ) / rl, spin = ( wd.x * rz - wd.y * rx ), anti = ( up.x * rz - up.y * rx );
	check( outward > 0.5 && Math.sign( anti ) === - Math.sign( spin ), 'the cirrus in its outflow: out of its eye and round it against its spin' );
	// between its outer bands, lighter
	let gap = null;
	for ( let T = n.eye - 14; T < n.eye - 4 && ! gap; T += 0.25 ) {

		const q = at( T );
		if ( q.w.rain < 0.02 && q.h.r > HURRICANE.core[ 1 ] * q.h.rmax * 1.1 ) gap = q;

	}

	check( gap && gap.sky.overcast < 0.7, `between its outer bands its deck lighter (overcast ${ gap && gap.sky.overcast.toFixed( 2 ) })` );
	// (M14) the clouds' own the same in a band as in a break: its rain's look is the bands' own, where they
	// are (seen coming dark from a break), and the light under them as it is here
	let band = null;
	for ( let T = n.eye - 14; T < n.eye - 4 && ! band; T += 0.25 ) {

		const q = at( T );
		if ( q.w.rain > 0.6 && q.h.r > HURRICANE.core[ 1 ] * q.h.rmax * 1.1 ) band = q;

	}

	const C = ( q ) => q.sky.clouds;
	check( band && gap && C( band ).overcast.value === C( gap ).overcast.value && C( band ).storm.value === 0 && C( gap ).storm.value === 0 && band.sky.storm > 0.6 && gap.sky.storm < 0.05,
		`in a band and in a break the clouds the same (overcast ${ band && C( band ).overcast.value.toFixed( 2 ) }, no rain's deck), the light under them not (rain's deck ${ band && band.sky.storm.toFixed( 2 ) } and ${ gap && gap.sky.storm.toFixed( 2 ) })` );

}

// ---- (M14) its outer bands' cells, each towering as a shower does
{

	const R = 24000, h = { x: - 110000, z: 20000, rmax: R, track: { x: 1, y: 0 } };
	const cells = bandCells( h, [] );
	const inBand = cells.filter( ( c ) => eyeCover( c.x - h.x, c.z - h.z, R, 1, 0 ) > 0.9 ).length;
	const near = cells.every( ( c ) => Math.abs( c.x ) <= 42000 && Math.abs( c.z ) <= 42000 && c.band === 1 && c.n >= 1 << 24 );
	check( cells.length > 10 && inBand / cells.length > 0.9 && near, `along its bands within the storm map's reach (${ inBand } of ${ cells.length } in a band's deck)` );
	const calm = cells.filter( ( c ) => c.thunder === 0 ).length;
	check( calm > 0 && calm < cells.length / 2 && Math.max( ...cells.map( ( c ) => c.thunder ) ) > 0.5, `most of them thunderstorms, some not (${ calm } of ${ cells.length } congestus)` );
	// (each its own for good: as its eye moves on, the same ones, moved with it)
	const moved = bandCells( { ...h, x: h.x + 5000 }, [] ), byN = new Map( cells.map( ( c ) => [ c.n, c ] ) );
	let same = 0, kept = 0;
	for ( const c of moved ) {

		const was = byN.get( c.n );
		if ( ! was ) continue;
		kept ++;
		if ( Math.abs( c.x - was.x - 5000 ) < 1e-6 && Math.abs( c.z - was.z ) < 1e-6 && c.r === was.r && c.thunder === was.thunder ) same ++;

	}

	check( kept > 10 && same === kept, `each its own, going with its eye (${ same } of ${ kept })` );

}

// ---- (M14) its bands' curtains, where they are
{

	const R = 24000, h = { x: 0, z: 0, rmax: R, track: { x: 1, y: 0 } }, cover = ( x, z ) => eyeCover( x - h.x, z - h.z, R, 1, 0 );
	// (in a break among its outer bands: the first band met each way round)
	let gapAt = null;
	for ( let m = 3 * R; m < 6 * R && ! gapAt; m += 500 ) if ( cover( m, 0 ) < 0.65 && cover( m - 2000, 0 ) < 0.65 && cover( m + 2000, 0 ) < 0.65 ) gapAt = { x: m, z: 0 };
	const list = bandCurtains( h, gapAt, 1, [], [] );
	let edges = 0, wrong = 0;
	for ( const c of list ) {

		const dx = c.x - gapAt.x, dz = c.z - gapAt.z, d = Math.hypot( dx, dz ), ux = dx / d, uz = dz / d;
		// (its near edge where the rain begins that way: dry short of it)
		const edge = d - c.r;
		let dry = true;
		for ( let m = 1500; m < edge - 100; m += 250 ) if ( cover( gapAt.x + ux * m, gapAt.z + uz * m ) > 0.9 ) dry = false;
		const wet = cover( gapAt.x + ux * ( edge + 100 ), gapAt.z + uz * ( edge + 100 ) ) > 0.9;
		if ( dry && wet ) edges ++; else wrong ++;

	}

	check( list.length >= 8 && wrong === 0, `in a break, its bands' curtains hang from their near edges (${ edges } of ${ list.length }), ${ ( Math.min( ...list.map( ( c ) => Math.hypot( c.x - gapAt.x, c.z - gapAt.z ) - c.r ) ) / 1000 ).toFixed( 1 ) } km off at the nearest` );
	// (in its eye: its wall's rain all round; at its middle, beyond the clear eye)
	const eye = bandCurtains( h, { x: 0, z: 0 }, 1, [], [] );
	const reach = eye.map( ( c ) => Math.hypot( c.x, c.z ) - c.r );
	check( eye.length === 16 && Math.min( ...reach ) > 0.4 * R && Math.max( ...reach ) < 0.8 * R, `in its eye, its wall's rain all round (from ${ ( Math.min( ...reach ) / R ).toFixed( 2 ) } to ${ ( Math.max( ...reach ) / R ).toFixed( 2 ) } rmax)` );
	// (as far as it's the weather here: the showers' theirs as far as it isn't)
	const half = bandCurtains( h, gapAt, 0.5, [ { x: 1, z: 2, r: 1500, rain: 0.8 } ], [] );
	check( half[ 0 ].rain === 0.4 && half.slice( 1 ).every( ( c ) => c.rain <= 0.5 ), 'half the weather here: the showers\' curtains half theirs, its bands\' half its' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
