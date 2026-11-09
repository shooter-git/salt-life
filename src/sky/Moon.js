import { moonAt, TIDE_EPOCH, TIDE_LON } from '../game/IslandClock.js';

// (M17) The moon in the island's sky (docs/m17/moon.md): where it stands, which way it's lit and how much, the size of
// its disc, and the light it gives on the island, from the island's time (IslandClock.moonAt: its phase and distance,
// the same numbers the tide turns on) and the sky's own sun (Sky.sunDirectionFromTime: the island's latitude, and the
// sun's declination, held as the island has no seasons). Pure (no three.js): the sky draws it, the turtles' hatchlings
// and the swordfish mind it, and test/moon.mjs runs it under Node, all of one moon.
//   moonSky( T, hours, azimuth ) -> { dir, north, radius, phase, lit, alpha, elongation, distance, outside, earthshine }
//     dir: toward it (world: +x east, +y up, +z south, as the sun's), north: its north pole's way on the sky (its face's
//     up), radius: its disc's (rad), alpha: its phase angle (degrees: 0 full, 180 new), outside: its light above the
//     air (lux, square to it), earthshine: the Earth's light on its dark side (of the full moon's on its bright side)
//   moonLight( m, out ) -> { direct, sky, glow, ground, T } the light at sea level (lux): straight from it (square to
//     it), the sky it lights, the night sky's own, and all of it on level ground; T, its light through the air
//   nightOf( T, hours ) -> its light on level ground at T (lux), and of the full moon's high in the sky (0..1+)
//   horizonOf( m ) -> how bright the sky low over the sea is under it, of a moonless night's (1 with none up): what a
//     hatchling heads for (game/Turtles.js)
//
// Where it stands: on the ecliptic as far ahead of the sun as its phase says (the mean elongation, as the tide has it:
// moonAt), off it by its orbit's 5.1 degrees as its argument of latitude has it, through the obliquity to the sky's
// hour angle and declination, and so to the island's sky at its latitude: full opposite the sun, new beside it,
// rising about 50 minutes later each day (24 h / 29.53). The game's sun stands at 6 degrees' declination all year, on
// the ecliptic's spring side (early April), so the moon's ways repeat month on month as the sun's do day on day.
// Libration, its parallax (a degree) and eclipses aren't drawn.
//
// Its light: its magnitude by its phase angle, V = -12.73 + 0.026|a| + 4e-9 a^4 (Allen 1976; Krisciunas and Schaefer
// 1991), so a quarter moon gives a tenth of a full one's light, not a half (the opposition surge: "one-tenth as
// bright", Berman 1995; 10 to 15 times, Palmer); 0.31 lux full above the air; by its distance's square; through the
// air by its airmass (Kasten and Young 1989) at MOON.extinction magnitudes an airmass. The sky it lights as a share of
// its light on the ground (skyShare), and the night sky's own light (glow: starlight, airglow and the zodiacal light)
// on a clear moonless night. Left out: the last 35% of the surge within 4 degrees of exactly full (Buratti et al.
// 1996), which only an eclipse's full moon reaches.

const RAD = Math.PI / 180;
export const SKY_LAT = 24; // degrees north: the sky's (Sky.sunDirectionFromTime)
export const SUN_DEC = 6; // degrees: the sky's sun, held
const OBLIQUITY = 23.4393 * RAD;
const INCLINATION = 5.145 * RAD; // the moon's orbit to the ecliptic
// the sun's ecliptic longitude that gives it the sky's declination (spring's)
const SUN_LON = Math.asin( Math.sin( SUN_DEC * RAD ) / Math.sin( OBLIQUITY ) );
const SUN_RA = Math.atan2( Math.sin( SUN_LON ) * Math.cos( OBLIQUITY ), Math.cos( SUN_LON ) );
// the moon's mean argument of latitude (Meeus 47.5) at J2000.0 and its rate a day; the island's 0:00 of day 1 in days
// from J2000.0 (as IslandClock's)
const F0 = 93.2720950, F1 = 13.229350449;
const D_EPOCH = ( TIDE_EPOCH - Date.UTC( 2000, 0, 1, 12 ) ) / 864e5 + TIDE_LON / 360;
export const MOON_KM = 1737.4, MEAN_KM = 385000.6;

export const MOON = {
	fullMag: - 12.73, // the full moon's magnitude at its mean distance (Allen 1976, Krisciunas and Schaefer 1991 eq. 9)
	// magnitudes an airmass (V): Mauna Kea's 2,800 m is 0.172 (Krisciunas and Schaefer), a lowland's more (Kyba et al.
	// 2017's 0.26 lux at 55.5 degrees up says about 0.3 at Potsdam); a clear sea-level sky between
	extinction: 0.2,
	// the sky it lights, of its own light on level ground with it high: so a full moon's sky is 18.3 mag / arcsec^2,
	// 3.4 brighter than a dark one (18.0 to 18.5 measured: Puschnig et al. 2014; "up to 4 mag": Benn and Ellison)
	skyShare: 0.07,
	glow: 0.00075, // lux: a natural starlit night, 0.6 to 0.9 mlux (Hänel et al. 2018, Table 2)
	// the Earth's full light on the moon's dark side, of the full moon's on its bright side: the earthshine 14.9 mag /
	// arcsec^2 at half moon (Bazzon et al. 2013, after Montañés-Rodríguez et al. 2007), the full moon's surface 3.36
	// (its -12.73 over its disc), with the Earth half lit as a Lambert sphere (1 / pi of full)
	earthshine: Math.PI * Math.pow( 10, - 0.4 * ( 14.9 - 3.36 ) ),
};

const dirOf = ( H, dec, az, out ) => {

	// (an hour angle and declination to the island's sky, as Sky.sunDirectionFromTime: east, up, south; turned about
	// the vertical by the sky's azimuth)
	const phi = SKY_LAT * RAD, cd = Math.cos( dec ), sd = Math.sin( dec );
	const east = - cd * Math.sin( H ), north = Math.cos( phi ) * sd - Math.sin( phi ) * cd * Math.cos( H ), up = Math.sin( phi ) * sd + Math.cos( phi ) * cd * Math.cos( H );
	const x = east, z = - north, ca = Math.cos( az ), sa = Math.sin( az );
	out[ 0 ] = x * ca + z * sa;
	out[ 1 ] = up;
	out[ 2 ] = - x * sa + z * ca;
	return out;

};

// the sky's sun at an hour (as Sky.sunDirectionFromTime: [ x, y, z ])
export const sunAt = ( hours, azimuth = 0, out = [ 0, 0, 0 ] ) => dirOf( ( hours - 12 ) * 15 * RAD, SUN_DEC * RAD, azimuth * RAD, out );

// its magnitude's rise by phase angle (degrees) from full, as a share of the full moon's light
export const phaseLight = ( alpha ) => Math.pow( 10, - 0.4 * ( 0.026 * Math.abs( alpha ) + 4e-9 * Math.pow( alpha, 4 ) ) );

// a Lambert sphere's light by its phase angle (radians), of its full: the Earth seen from the moon
const lambert = ( a ) => ( Math.sin( a ) + ( Math.PI - a ) * Math.cos( a ) ) / Math.PI;

// (Krisciunas and Schaefer 1991 eq. 8: I = 10^-0.4( m + 16.57 ) foot-candles; 0.313 lux full, Kyba et al.'s 0.32 at the zenith)
const FULL_LUX = 10.764 * Math.pow( 10, - 0.4 * ( MOON.fullMag + 16.57 ) );

export function moonSky( T, hours, azimuth = 0, out = {} ) {

	const m = moonAt( T );
	const d = D_EPOCH + T / 24;
	const lam = SUN_LON + m.phase * 2 * Math.PI, beta = INCLINATION * Math.sin( ( F0 + F1 * d ) * RAD );
	const se = Math.sin( OBLIQUITY ), ce = Math.cos( OBLIQUITY );
	const dec = Math.asin( Math.sin( beta ) * ce + Math.cos( beta ) * se * Math.sin( lam ) );
	const ra = Math.atan2( Math.sin( lam ) * ce - Math.tan( beta ) * se, Math.cos( lam ) );
	const Hs = ( hours - 12 ) * 15 * RAD, az = azimuth * RAD;
	const dir = dirOf( Hs - ( ra - SUN_RA ), dec, az, out.dir || [ 0, 0, 0 ] );
	const sun = dirOf( Hs, SUN_DEC * RAD, az, out.sun || [ 0, 0, 0 ] );
	// (its rotation's axis, as the ecliptic's pole: within 1.5 degrees of it; on the sky, square to the way to it)
	const pole = dirOf( Hs - ( 1.5 * Math.PI - SUN_RA ), Math.PI / 2 - OBLIQUITY, az, out.north || [ 0, 0, 0 ] );
	const pd = pole[ 0 ] * dir[ 0 ] + pole[ 1 ] * dir[ 1 ] + pole[ 2 ] * dir[ 2 ];
	for ( let i = 0; i < 3; i ++ ) pole[ i ] -= pd * dir[ i ];
	const pl = Math.hypot( pole[ 0 ], pole[ 1 ], pole[ 2 ] ) || 1;
	for ( let i = 0; i < 3; i ++ ) pole[ i ] /= pl;
	const cosE = Math.max( - 1, Math.min( 1, dir[ 0 ] * sun[ 0 ] + dir[ 1 ] * sun[ 1 ] + dir[ 2 ] * sun[ 2 ] ) );
	const elongation = Math.acos( cosE ) / RAD, alpha = 180 - elongation;
	out.dir = dir;
	out.sun = sun;
	out.north = pole;
	out.phase = m.phase;
	out.age = m.age;
	out.lit = ( 1 - cosE ) / 2;
	out.elongation = elongation;
	out.alpha = alpha;
	out.distance = m.distance;
	out.radius = Math.asin( MOON_KM / m.distance );
	const near = MEAN_KM / m.distance;
	out.outside = FULL_LUX * phaseLight( alpha ) * near * near;
	out.earthshine = MOON.earthshine * lambert( elongation * RAD );
	return out;

}

// the air's light through it toward an altitude (sin of it): Kasten and Young's (1989) airmass at MOON.extinction
export function throughAir( sinH ) {

	// (set once its middle's half a degree down: refraction lifts it about that much at the horizon)
	if ( sinH <= - 0.01 ) return 0;
	const h = Math.asin( sinH ) / RAD;
	const X = 1 / ( sinH + 0.50572 * Math.pow( h + 6.07995, - 1.6364 ) );
	return Math.pow( 10, - 0.4 * MOON.extinction * X );

}

// its light at sea level, lux
export function moonLight( m, out = {} ) {

	const s = m.dir[ 1 ], T = throughAir( s );
	out.T = T;
	out.direct = m.outside * T;
	// (the sky it lights: as the day's, a share of the light it gives the ground, a little more of it low down)
	out.sky = m.outside * T * MOON.skyShare * Math.sqrt( Math.max( 0, s ) );
	out.glow = MOON.glow;
	out.ground = out.direct * Math.max( 0, s ) + out.sky + out.glow;
	return out;

}

// the full moon high (60 degrees up, the island's full moon at midnight) at its mean distance: the night's light
// everything else is reckoned against
const _ref = {};
export const FULL_HIGH = ( () => {

	const T = throughAir( Math.sin( 60 * RAD ) ), s = Math.sin( 60 * RAD );
	_ref.direct = FULL_LUX * T;
	_ref.sky = _ref.direct * MOON.skyShare * Math.sqrt( s );
	_ref.ground = _ref.direct * s + _ref.sky + MOON.glow;
	return _ref;

} )();

// the sky low down: its light scattered all about the sky (skyShare of it, through the air at its height; not less low
// down, as the sky it lights on level ground is), over the night's own
export function horizonOf( m ) {

	return 1 + m.outside * throughAir( m.dir[ 1 ] ) * MOON.skyShare / MOON.glow;

}

const _m = {}, _l = {};
// the moon's light on level ground at island time T (hour of the day: hours), lux, and of the full moon high's
export function nightOf( T, hours, out = {} ) {

	moonLight( moonSky( T, hours, 0, _m ), _l );
	out.lux = _l.ground;
	out.full = _l.ground / FULL_HIGH.ground;
	out.up = _m.dir[ 1 ];
	out.lit = _m.lit;
	return out;

}
