import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { ATMOSPHERE_GLSL, Pass, floatTarget, f } from './Atmosphere.js';
import { Cirrus, NoCirrus } from './Clouds.js';
import { HURRICANE, hash } from '../game/Weather.js';

// Volumetric cumulus from sky-pro-webgpu (../sky-pro-webgpu, "Partly cloudy" preset): procedural
// weather map, a 64³ Perlin-Worley shape noise with a height-dependent erosion, a cone-traced
// light march with three multiple-scattering octaves, powder and base darkening, a quarter-rate
// lattice trace reconstructed temporally at half resolution. Lit by Tidewater's atmosphere (sun
// or moon key light, sky view LUT) instead of sky-pro's own.
//
// Port notes (WebGPU compute -> WebGL 2 fragment passes):
//   - the noise volume was a downloaded blob (public/clouds/baseShape64.bin); it is generated here
//     instead, on the GPU, a few layers per frame into a 3D render target (tileable Perlin-Worley and
//     worley fbm octaves with the blob's channel statistics), so nothing is downloaded. The weather map
//     is made the same way, a strip per frame; the clouds fade in once the first panorama is made.
//   - the blue noise dither (blueNoise.bin) is interleaved gradient noise.
//   - the trace writes colour and depth to two targets (MRT); the resolve reads the trace with texel
//     fetches instead of a workgroup tile. After a camera cut the history is rebuilt at 4 slots a
//     frame (as Tidewater's earlier clouds did), and far clouds keep more of their history (there is
//     no TAA after them here).
//   - the panorama's slot is marched densely into a small target, then scattered into it (a discarding
//     pass over the whole panorama would keep most of every GPU wave idle); a whole new panorama (the
//     first one, a jump of the light) is made in a back buffer over 16 frames and swapped in.
//   - Tidewater's cirrus veil (Clouds.js) is composited behind the cumulus in the trace and panorama.
//   - tiers: `high` is Tidewater's (half resolution history, 1/16 of it traced per frame, 256 steps,
//     6 light taps); `mid` the same with fewer steps and light taps; both cap the history's size
//     (high: 1280 x 720, mid: 960 x 540 pixels). `low` has no per-pixel march at all: the panorama
//     (1/64 of it marched per frame, sampled bicubically) is the view's clouds; its first panorama is
//     made at that pace too (64 frames, none of them heavier than the rest), and it has no cirrus.
//   - the cloud shadow map on the ground (high only): as Tidewater's, 256² over 12 km around the camera,
//     a quarter of its rows marched a frame (all of them when it moves on); the lit materials read it
//     through materials/CloudShadows.js.
//
//   clouds.sampleUniforms     what a material samples the clouds with (CLOUDS_GLSL):
//     vec4 cloudsSampleView( vec3 dir )   ( rgb in-scattered radiance, a transmittance ), main view
//     vec4 cloudsSample( vec3 dir )       panorama (reflections, environment)
//     float cloudsSunTransmittance( float T )
//   clouds.coverage, clouds.cirrusAmount   { value } 0..1
//   clouds.overcast   { value } 0..1 (Salt Life: the weather's grey sky: denser, darker cloud, bases
//     everywhere). Slow changes of these are followed by the progressive refresh and the history; a
//     step (more than 0.05 in a frame) makes a new panorama
//   clouds.front   { value } Vector4 (M9: the weather on its way: the cover up the trades at FRONT_KM,
//     less the cover here; WeatherDriver)
//   clouds.frontDir   { value } Vector2 (M12: the way that weather comes, toward: down the blow's track)
//   clouds.storm   { value } 0..1 (M9: rain's deck, lower, smoother below and darker; a thunderstorm's)
//   clouds.eye   { value } Vector4 (M13: a hurricane's eye, xz (m), its rmax (m), its share of the weather
//     here; 0: none), clouds.eyeTrack { value } Vector2 (the way it moves): its cloud about its eye
//     (eyeCover): the clear eye, the wall towering round it, the deck beyond and its spiral bands, the
//     cover everywhere as far as it's the weather (the weather's own cover lags, and looks ahead)
//   clouds.setStorms( cells, dt, now ) (M14: the showers' cells, each its own cloud towering over it: a
//     shower's congestus, a thunderstorm's cumulonimbus and its anvil, CB), clouds.towers (how many)
//   clouds.drift   { value } Vector3 (M13: the way the clouds go, x z, and how fast (m/s); 0: the trades,
//     at 12 m/s: a hurricane's wind racing them round it); clouds.upper (the cirrus's way: Clouds.js)
//   clouds.update( dt, camera, keyColor, nightSky, night, skyIrradiance ) (Tidewater's frame values;
//     keyColor: the moon's light at night)
//   clouds.resolutionScale, clouds.resetHistory(), clouds.invalidate()
//   clouds.shadowMap (high: a render target, else null), clouds.shadowArea { value } ( centre x, z, size m,
//     strength ): the ground's shadow along the key light (1 = clear)

const DEG = Math.PI / 180;
// (M9) the distances up the trades (km, - behind) at which the weather on its way is told (clouds.front)
export const FRONT_KM = [ - 12, 12, 24, 36 ];
// (M13) a hurricane's cloud about its eye, in its rmax (eyeCover): the clear eye's edge, the wall from its
// inner face out to where it tapers to the deck, how much higher its towers go (cover past 1), the
// deck's cover, solid over its rain's core (Weather's HURRICANE.core) and broken beyond it, the bands'
// (Weather's HURRICANE.band) over it beyond the wall ((M14) a solid deck: their towers are their cells',
// bandCells), the eye's own low cloud, and the most cover anywhere (the march's emptiness bound)
// (its cloud comes down to the sea in its wall and its deck, a few hundred metres up, and goes higher: the
// shell's base lowered by `lower` (m) as far as it's the weather here, no lower than `base`, and deepened
// by `deeper` of itself: (M14) with its rain's deck's (STORM), 7.8 km deep, as it was over the old base)
// (M14) and its wall a stadium, as photographs from inside eyes (Katrina's, Irma's, Epsilon's) show it:
// sloping out as it rises (the eye `slope` m wider for each m up, out to its wall's outer edge: leaned out
// with it, its outer bands' undersides made a grey ceiling over a break),
// its face smooth, not heaped cumulus (the cloud's heaping noise and its erosion `smooth` gone there)
// (M14) and its rain where it is: its bands, its rain's core and its wall each with rain's deck's own look
// (dark, dense, its base flat and low: BAND_LOOK), its broken deck between them its own, as photographs of
// outer bands coming in show them (Emily's, Florence's, Debby's), not the whole sky one or the other by
// whether it's raining where you are. Over the cover `rain` (from its broken deck's, with the horizon's
// fill, to its core's). Its bands' outer edge, the one that comes to you, sharp: from `edge` of the way
// on to the next band (2.4 km: the weather's rain's eases off over 9, its first light rain from under it);
// its rain's deck no higher than `deckTop` of the shell (5.6 km: outer bands' stratiform tops), their
// towers over it, and the sky's light under it `sky` of the open sky's
const EYE = { clear: [ 0.42, 0.6 ], wall: [ 0.5, 0.68, 1.0, 1.8 ], tower: 0.45, deck: [ 1.0, 0.6 ], band: 0.42, bandFrom: [ 1.4, 2.4 ], floor: 0.25, top: 1.45, lower: 400, base: 500, deeper: 1.65, slope: 0.8, smooth: 0.85, rain: [ 0.72, 0.97 ], edge: [ 0.3, 0.34 ], sky: 0.03, deckTop: 0.65 };
const CORE = HURRICANE.core;
const B = HURRICANE.band;

// (M13) the cover a hurricane brings at ( dx, dz ) m from its eye (rmax R, moving along ( tx, tz )), as
// the clouds' shader has it (CORE_GLSL's scEyeCoverOf): its bands spiral in counter-clockwise, as the
// weather's rain does (Weather's bandAt); (M14) `h` m above the cloud's base (the eye wider up it)
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
export function eyeCover( dx, dz, R, tx, tz, h = 0 ) {

	const E = EYE, d = Math.hypot( dx, dz ), r = Math.max( 0, d - E.slope * Math.max( 0, h ) * ( 1 - ss( E.wall[ 3 ] * R, E.bandFrom[ 1 ] * R, d ) ) );
	const eye = 1 - ss( E.clear[ 0 ] * R, E.clear[ 1 ] * R, r );
	const wall = ss( E.wall[ 0 ] * R, E.wall[ 1 ] * R, r ) * ( 1 - ss( E.wall[ 2 ] * R, E.wall[ 3 ] * R, r ) );
	const pm = dx * tx + dz * tz, pn = dx * tz - dz * tx;
	const s = Math.abs( pm ) + Math.abs( pn ), t = s > 0 ? pn / s : 0;
	const q = pm >= 0 ? ( pn >= 0 ? t : 4 + t ) : 2 - t;
	const psi = r / B.gap + B.arms * q / 4, f = psi - Math.floor( psi );
	const band = ss( 0, 0.1, f ) * ( 1 - ss( E.edge[ 0 ], E.edge[ 1 ], f ) ) * ss( E.bandFrom[ 0 ] * R, E.bandFrom[ 1 ] * R, r );
	const deck = E.deck[ 0 ] + ( E.deck[ 1 ] - E.deck[ 0 ] ) * ss( CORE[ 0 ] * R, CORE[ 1 ] * R, r );
	return ( deck + E.band * band ) * ( 1 - eye ) + E.floor * eye + E.tower * wall;

}

// (M14) A hurricane's outer bands' cells of rain, each its own cloud towering over it as a shower's is
// (stormMap): a band coming in is a line of cumulonimbus, dark under, its rain hanging from it, as
// photographs of outer bands show them. Along the middle of each band (eyeCover's, its phase `phase`), one
// every `every` m or so, each set off along it and across it a little (`across`, of the band's width), as
// wide as `r` (m), raining as hard as `rain` as far as its band's out there (from EYE.bandFrom, to its
// reach), and as thundery as the weather's bands are there (HURRICANE.band's thunder, from its `from`),
// some of them not (`calm`: congestus, their tops lower, no anvil). Fixed about its eye, each its own for
// good (`n`, past any shower's), within `range` m of the island's middle (the storm map's). h: the
// hurricane (Weather.hurricaneAt: x, z from the island's middle, rmax, track). Into out (its objects
// filled again each call), after `from` of them
const BAND_CELLS = { phase: 0.175, every: 7000, across: 0.25, r: [ 2000, 3600 ], rain: [ 0.75, 1 ], calm: 0.4, range: 42000, n: 1 << 24 };
export function bandCells( h, out, from = 0 ) {

	const C = BAND_CELLS, R = h.rmax, tx = h.track.x, tz = h.track.y, gap = B.gap;
	let count = from;
	// (the island from its eye, and the windings of its bands within reach of it)
	const D = Math.hypot( h.x, h.z ), lo = Math.max( EYE.bandFrom[ 0 ] * R, D - C.range - C.r[ 1 ] ), hi = Math.min( B.reach[ 1 ], D + C.range + C.r[ 1 ] );
	if ( hi <= lo ) { out.length = count; return out; }
	const m0 = Math.max( 0, Math.floor( lo / gap - C.phase ) ), m1 = Math.ceil( hi / gap - C.phase + B.arms );
	for ( let m = m0; m <= m1; m ++ ) {

		// (round it from q = 0, a step at a time as far along as `every` is there: the same steps every time)
		let q = 0;
		for ( let j = 0; q < 4 && j < 4096; j ++ ) {

			const r0 = gap * ( m + C.phase - B.arms * q / 4 ), id = m * 4096 + j;
			const step = C.every / ( 0.5 * Math.PI * Math.max( r0, 10000 ) );
			const qa = q + ( hash( id, 0x3c1 ) - 0.5 ) * 0.6 * step;
			q += step;
			const r = r0 + ( hash( id, 0x7e5 ) - 0.5 ) * 2 * C.across * 0.25 * gap;
			if ( r < lo || r > hi ) continue;
			// (the way round it: the pseudo-angle's, eyeCover's, back to a direction along its track and to its left)
			const w = ( ( qa % 4 ) + 4 ) % 4;
			let pm, pn;
			if ( w < 1 ) { pm = 1 - w; pn = w; } else if ( w < 3 ) { pn = 2 - w; pm = - ( 1 - Math.abs( pn ) ); } else { pn = w - 4; pm = 1 - Math.abs( pn ); }
			const l = Math.hypot( pm, pn );
			pm *= r / l; pn *= r / l;
			const x = h.x + pm * tx + pn * tz, z = h.z + pm * tz - pn * tx;
			if ( Math.abs( x ) > C.range || Math.abs( z ) > C.range ) continue;
			const k = ss( EYE.bandFrom[ 0 ] * R, EYE.bandFrom[ 1 ] * R, r ) * ( 1 - ss( B.reach[ 0 ], B.reach[ 1 ], r ) );
			if ( k < 0.05 ) continue;
			const c = out[ count ] || ( out[ count ] = {} );
			count ++;
			c.x = x; c.z = z; c.band = 1; c.n = C.n + id;
			c.r = C.r[ 0 ] + ( C.r[ 1 ] - C.r[ 0 ] ) * hash( id, 0x2f9 );
			c.rain = k * ( C.rain[ 0 ] + ( C.rain[ 1 ] - C.rain[ 0 ] ) * hash( id, 0x4d3 ) );
			c.thunder = B.thunder * ss( B.from[ 0 ] * R, B.from[ 1 ] * R, r ) * ( hash( id, 0x6b7 ) < C.calm ? 0 : 1 );

		}

	}

	out.length = count;
	return out;

}

// (M9) rain's deck: its base this far down (m) at full storm ((M14) nimbostratus a few hundred metres up, as
// it is in a tropical downpour), (M14) how much deeper it is (of the shell's depth: 4.8 km at full storm),
// how much smoother its underside is (of the erosion), how much less of the light it scatters and lets
// through to its underside
const STORM = { lower: 500, deeper: 0.6, smooth: 0.6, albedo: 0.1, ambient: 0.12 };

// (M14) Cumulonimbus: a shower's own cloud, towering over its rain where it is (the showers' cells,
// Weather.showers: setStorms), marched as the rest of the cloud is, from the storm map (stormMap). Shaped
// after photographs of them over Florida and the Caribbean (NOAA's, the Everglades', Cape Canaveral's,
// Cozumel's, on Wikimedia Commons): no two alike, and none a column. Seen from 20 km and more, one is a
// ridge of turrets wider than it's tall, rising unevenly to its highest off to one side and stepping down
// away from it, its outline lumpy all the way up:
//   - its turrets (turretsOf), each storm's own for good (laid out from its n): its main updraft's head
//     wider than its rain (`main` of `reach` of its radius) and off its middle (by up to `offset` of that),
//     its core (`core` of the head's width) alone rising to the tropopause, and `crowd` turrets crowding it
//     (`crowdOut` of the head's radius off, `crowdR` as wide), nearly as high (`crowdTop` of the way to the
//     tropopause, each in its own band of that); a staircase of lesser ones trailing away from it, each
//     `step` as wide as the last (the first, the head), `stepOut` of their two widths on, `stepTop` as
//     tall above the base, and turning up to half `stepTurn` radians from the last's way (`steps` of them
//     in a thunderstorm, its flanking line; half that in a shower); and `heaps` lower ones about it
//     (`heapOut` of the head's radius off, `heapR` as wide, `heapTop` as tall). None but its core reaches
//     the tropopause, and none stands against another within `apart` m of its height: one that did was
//     flattened there too, and two side by side at one height made a flat-topped block, a column. Each stands on the cumulus's flat base, steep-sided, its head rounded (as tall at a
//     point as the square root of 1 - (r / R)^`shoulder` is); and the cumulus about them are as the
//     weather has them (their base forced under a storm made a plate of cloud about its foot);
//   - their sides bulging out and in as they rise, a different way at each height (the map looked up as
//     much as `warp` m off, by the noise at `warpScale` m), and their heads heaped in billows a km or two
//     across and half that (the billowy noise at `bulgeScale` m, `bulge` m deep: a standard deviation of
//     each), going with the storm as it drifts and rising at `boil` m/s; billowing at their surfaces (the
//     erosion's billowy field at strength `erode`, its cover a heaped cloud's, `heap`); all leaning
//     downwind on the upper wind (`lean` m across for each m up). Lit by the sun as the rest are, with the
//     light a thick cloud scatters many times over (PRESET.lighting's `diffusion`), white where the sun's
//     on it; and shaded through all of it, dark grey on the side away from the sun (the light march's taps
//     reach a few hundred m toward it: near a tower and under its anvil, `shade[ 1 ]` more from
//     `shade[ 0 ]` m on, each twice as far). (As dense as the rest: denser, the march's first sample inside one fell anywhere in the
//     skin the sun lights, and a tower came out speckled and grey. And no deeper erosion: the cumulus's,
//     500 m of it in 100 m billows at a tower's top, came out a fuzz from 20 km, a plume);
//   - a shower's rises to `congestus` (m), the higher the harder it rains; a thunderstorm's would rise
//     `dome` times as far as the tropopause (`top`, m: Lightning's flash lights a tower this high on the
//     horizon), but stops rising there and flattens (lumpy there, by up to `ceiling` m: a standard
//     deviation of the noise; no mesa), its main updraft's core overshooting it by up to `overshoot` (m);
//   - a thunderstorm's broad dark mass at its foot, `mass` times as wide as its main updraft's core and
//     off to one side of it (by `massOff` of its head's radius), up to `massTop` (m) deep, lumpy on top (by
//     `massLumps` of that for a standard deviation of the noise), the turrets rising out of it;
//   - its anvil, out of its main updraft's core and as wide as it at its root (a root as wide as the whole
//     head overhung its lower turrets on every side, a table on a mound): a flat shelf from `anvil` (m)
//     under the tropopause up to it (its underside lumpy, by `anvilLumps` of that, and its top by
//     `anvilTop`: seen end-on, a level top was a lid), spread on the upper wind (each storm's turned up to
//     half `anvilTurn` radians off it, and `anvilReach` as long) as far as `downwind` (m) at full thunder
//     (and `upwind` of that the other way), fanning out as it goes (its half-width grows by `fan` of the
//     way it's come, half that upwind; more to one side than the other, by up to `lopsided` of that:
//     even, an anvil seen end-on was a flat top centred on its tower), thinning toward its ends and
//     edges, ragged there (by `ragged` of the cloud's noise), and thinner cloud than the tower's
//     (`density`, at its root and at its end: ice), smooth (its erosion a cloud's at `ice` cover: the
//     cumulus's billows on it came out a grey fuzz, a cap on the tower), and lit as the rest are, white;
//   - seen farther than the rest: up past them they melt into the sky from as far as the rest are gone to
//     `melt` times that;
//   - none in a hurricane's own cloud (as far as it's the weather here): its wall is its tower, and its
//     outer bands' cells (bandCells, `band`) are its showers there, each towering as a shower's does;
//   - the map: `res`² texels over `span` m about the island's middle, made again every `every` s and slid
//     on between (the cells drift at the weather's 8 km a game hour, 80 m a second): each texel its foot,
//     1 - (r / R)² about the nearest turret out to its edge, or the mass's about the main updraft (r), its
//     turrets' top (g, of `topMax` m), its anvil's footprint (b), and whether any of it's within `margin` m
//     (a: the march's bound on its empty stretches of ray, up to `stride` m long, and the turrets' sides
//     bulging out and leaning along them: 64 near an anvil alone, 128 near a tower, and on up to 255 with
//     how much of a thunderstorm's mass is there). Above every cumulus top, with none near, the march
//     strides `stride` m at a time.
export const CB = {
	reach: 1.3, main: [ 1, 1.35 ], core: [ 0.6, 0.8 ], offset: 0.35, steps: [ 2, 4 ], step: [ 0.65, 0.85 ], stepOut: [ 0.55, 0.8 ], stepTop: [ 0.5, 0.8 ], stepTurn: 1,
	crowd: [ 1, 3 ], crowdOut: [ 0.4, 0.75 ], crowdR: [ 0.45, 0.65 ], crowdTop: [ 0.65, 0.92 ], heaps: [ 2, 4 ], heapOut: [ 0.6, 1.3 ], heapR: [ 0.4, 0.7 ], heapTop: [ 0.3, 0.8 ], apart: 400, shoulder: 3,
	warp: 900, warpScale: 12000, bulge: [ 700, 300 ], bulgeScale: 9000, boil: 3, heap: 0.6, erode: 0.6, lean: 0.15, shade: [ 400, 4 ],
	congestus: [ 4500, 7500 ], top: 12000, dome: 1.4, overshoot: 1300, ceiling: 450, mass: 1.6, massOff: 0.5, massTop: 1500, massLumps: 0.35,
	anvil: 1800, downwind: 26000, upwind: 0.04, fan: 0.35, lopsided: 0.6, anvilTurn: 0.5, anvilReach: [ 0.6, 1 ], ragged: 0.3, anvilLumps: 0.6, anvilTop: 0.3, density: [ 0.8, 0.1 ], ice: 0.15,
	melt: 1.6, res: 256, span: 96000, every: 2, topMax: 18000, margin: 2200, stride: 1600,
};

// (M14) the storm map's cells made a frame (setStorms: a whole map over a few frames, so none is long)
export const STORM_CELLS = 2;
// (M14) a storm's turrets (CB): its cell ({ x, z, n }), how wide its rain's cloud is (m: its main updraft
// goes by it), its main updraft's top and the base (m), and how thundery it is (0..1): into `out` ({ x, z,
// r, top }, m: the first its main updraft's core, then its steps down, the turrets crowding its core, and
// the heaps about it; and out.mass, { x, z, r }: where a thunderstorm's mass is at its foot), how many. Its
// own for good (from its n).
const TURRETS = [];
export function turretsOf( c, R, top, base, thunder, out = TURRETS ) {

	const C = CB, n = c.n | 0, h = ( k ) => hash( n, 0x7c15 + k * 0x3b );
	const lerp = ( [ a, b ], t ) => a + ( b - a ) * t;
	let count = 0;
	const put = ( x, z, r, t ) => {

		const o = out[ count ] || ( out[ count ] = {} );
		o.x = x; o.z = z; o.r = r; o.top = t;
		count ++;

	};
	// (its main updraft's core alone rises to the tropopause; the rest stop under it, `rise` m over the base
	// at most)
	const rise = Math.min( top, C.top ) - base;
	const a0 = h( 0 ) * 2 * Math.PI, d0 = C.offset * R * h( 1 ), m = R * lerp( C.main, h( 2 ) ), core = m * lerp( C.core, h( 6 ) );
	const mx = c.x + Math.cos( a0 ) * d0, mz = c.z + Math.sin( a0 ) * d0;
	put( mx, mz, core, top );
	// (the steps down away from it: a thunderstorm's flanking line)
	const steps = Math.round( lerp( C.steps, h( 3 ) ) * ( 0.5 + 0.5 * thunder ) );
	let a = h( 4 ) * 2 * Math.PI, x = mx, z = mz, r = m, t = base + rise;
	for ( let j = 0; j < steps; j ++ ) {

		const r2 = r * lerp( C.step, h( 10 + j ) ), d = ( r + r2 ) * lerp( C.stepOut, h( 20 + j ) );
		a += ( h( 30 + j ) - 0.5 ) * C.stepTurn;
		x += Math.cos( a ) * d; z += Math.sin( a ) * d;
		r = r2;
		t = base + ( t - base ) * lerp( C.stepTop, h( 40 + j ) );
		put( x, z, r, t );

	}

	// (the turrets crowding its core, nearly as high, each in its own band of height: its head a cluster of
	// them, no one column and no level top)
	const crowd = Math.round( lerp( C.crowd, h( 7 ) ) );
	for ( let j = 0; j < crowd; j ++ ) {

		const b = h( 90 + j ) * 2 * Math.PI, d = m * lerp( C.crowdOut, h( 100 + j ) );
		put( mx + Math.cos( b ) * d, mz + Math.sin( b ) * d, m * lerp( C.crowdR, h( 110 + j ) ), base + rise * lerp( C.crowdTop, ( j + 0.2 + 0.6 * h( 120 + j ) ) / crowd ) );

	}

	// (and the heaps about it)
	const heaps = Math.round( lerp( C.heaps, h( 5 ) ) );
	for ( let j = 0; j < heaps; j ++ ) {

		const b = h( 50 + j ) * 2 * Math.PI, d = m * lerp( C.heapOut, h( 60 + j ) );
		put( mx + Math.cos( b ) * d, mz + Math.sin( b ) * d, m * lerp( C.heapR, h( 70 + j ) ), base + rise * lerp( C.heapTop, h( 80 + j ) ) );

	}

	// (none level with one it stands against: two side by side at one height made a flat-topped block)
	for ( let k = 2; k < count; k ++ ) for ( let j = 1; j < k; j ++ ) {

		const p = out[ k ], q = out[ j ];
		if ( Math.hypot( p.x - q.x, p.z - q.z ) >= 0.7 * ( p.r + q.r ) || Math.abs( p.top - q.top ) >= C.apart ) continue;
		const was = p.top;
		p.top = Math.max( base + 0.1 * rise, q.top - C.apart );
		// (lowered, it's checked against them all again)
		if ( p.top < was ) j = 0;

	}

	// (a thunderstorm's mass at its foot, off to one side of its core)
	const am = h( 8 ) * 2 * Math.PI, M = out.mass || ( out.mass = {} );
	M.x = mx + Math.cos( am ) * C.massOff * m; M.z = mz + Math.sin( am ) * C.massOff * m; M.r = C.mass * core;
	return count;

}

// (M14) the storm map (CB) from the showers' cells ({ x, z, r, rain, thunder, n }, x and z from the island's
// middle), the upper wind ( ux, uz: the way it blows), the shell's base and depth (m: a congestus's top
// goes by them), and how far there's a hurricane's own cloud instead (0..1): into `data` (Uint8Array, res²
// × 4, cleared first). Or a part of it: cells `from` to `to` (cleared only from the first). Returns how many
// of them tower in it.
export function stormMap( cells, data, ux, uz, base, depth, hurricane = 0, from = 0, to = cells.length ) {

	const ss = ( a, b, x ) => {

		const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
		return t * t * ( 3 - 2 * t );

	};
	const C = CB, N = C.res, S = C.span, cell = S / N, M = C.margin, P = C.shoulder / 2;
	if ( from === 0 ) data.fill( 0 );
	const ul = Math.hypot( ux, uz ) || 1;
	ux /= ul; uz /= ul;
	let towers = 0;
	for ( let n = from; n < Math.min( to, cells.length ); n ++ ) {

		const c = cells[ n ];
		const k0 = ss( 0.02, 0.15, c.rain ) * ( c.band ? 1 : 1 - hurricane );
		if ( k0 <= 0 ) continue;
		const thunder = ss( 0, 0.25, Math.max( 0, c.thunder || 0 ) );
		// (its turrets; its main updraft's top: a light shower's lower)
		const R = C.reach * c.r;
		const congestus = C.congestus[ 0 ] + ( C.congestus[ 1 ] - C.congestus[ 0 ] ) * Math.min( 1, c.rain );
		const top = congestus + ( base + ( C.top - base ) * C.dome - congestus ) * thunder;
		const count = turretsOf( c, R, base + ( top - base ) * k0, base, thunder );
		const mass = Math.round( 128 + 127 * thunder * k0 );
		// (its anvil, out of its main updraft's core, as wide as it at its root: its own length, and its own way
		// off the upper wind's)
		const a = ss( 0.05, 0.5, c.thunder || 0 ) * k0, root = TURRETS[ 0 ].r;
		const L = C.downwind * a * ( C.anvilReach[ 0 ] + ( C.anvilReach[ 1 ] - C.anvilReach[ 0 ] ) * hash( c.n | 0, 0x5a17 ) ), U = C.upwind * L, back = U + root;
		const turn = ( hash( c.n | 0, 0x2b9d ) - 0.5 ) * C.anvilTurn, ax = ux * Math.cos( turn ) - uz * Math.sin( turn ), az = ux * Math.sin( turn ) + uz * Math.cos( turn );
		const cx = TURRETS[ 0 ].x, cz = TURRETS[ 0 ].z;
		// (fanning out more to one side than the other: its left's fan, its right's, and the more)
		const lop = ( hash( c.n | 0, 0x61a3 ) - 0.5 ) * 2 * C.lopsided, fl = C.fan * ( 1 + lop ), fr = C.fan * ( 1 - lop ), fan = Math.max( fl, fr );
		// (the texels it can reach: its anvil's box, and its turrets' feet)
		let ax0 = Infinity, ax1 = - Infinity, az0 = Infinity, az1 = - Infinity;
		if ( a > 0 ) {

			const w = root + fan * L + M, wb = root + fan * 0.5 * U + M;
			for ( const [ s, q ] of [ [ - back - M, - wb ], [ - back - M, wb ], [ L + M, - w ], [ L + M, w ] ] ) {

				const px = cx + ax * s - az * q, pz = cz + az * s + ax * q;
				ax0 = Math.min( ax0, px ); ax1 = Math.max( ax1, px ); az0 = Math.min( az0, pz ); az1 = Math.max( az1, pz );

			}

		}

		const MS = TURRETS.mass;
		let x0 = Math.min( ax0, MS.x - MS.r - M ), x1 = Math.max( ax1, MS.x + MS.r + M ), z0 = Math.min( az0, MS.z - MS.r - M ), z1 = Math.max( az1, MS.z + MS.r + M );
		for ( let k = 0; k < count; k ++ ) {

			const t = TURRETS[ k ], e = t.r + M;
			x0 = Math.min( x0, t.x - e ); x1 = Math.max( x1, t.x + e ); z0 = Math.min( z0, t.z - e ); z1 = Math.max( z1, t.z + e );

		}

		// (none on the map's edge texels: it's clamped there)
		const I = ( x ) => Math.max( 1, Math.floor( ( x + S / 2 ) / cell ) ), J = ( x ) => Math.min( N - 2, Math.ceil( ( x + S / 2 ) / cell ) );
		if ( I( x0 ) > J( x1 ) || I( z0 ) > J( z1 ) ) continue;
		towers ++;
		// (each turret's foot, and its top: the tallest's where they meet; and a thunderstorm's mass, its own
		// foot's, no top)
		for ( let k = 0; k <= count; k ++ ) {

			const t = k < count ? TURRETS[ k ] : MS, rf = t.r, e = rf + M, e2 = e * e, rf2 = rf * rf, r2 = k < count ? t.r * t.r : 0, rise = t.top - base;
			const heavy = k < count ? 128 : mass;
			for ( let j = I( t.z - e ), j1 = J( t.z + e ); j <= j1; j ++ ) {

				const dz = ( j + 0.5 ) * cell - S / 2 - t.z, hw = Math.sqrt( Math.max( 0, e2 - dz * dz ) );
				for ( let i = I( t.x - hw ), i1 = J( t.x + hw ); i <= i1; i ++ ) {

					const dx = ( i + 0.5 ) * cell - S / 2 - t.x, d2 = dx * dx + dz * dz;
					if ( d2 >= e2 ) continue;
					const o = ( j * N + i ) * 4;
					if ( d2 < rf2 ) {

						const foot = Math.round( ( 1 - d2 / rf2 ) * 255 );
						if ( foot > data[ o ] ) data[ o ] = foot;
						if ( heavy > data[ o + 3 ] ) data[ o + 3 ] = heavy;
						if ( d2 < r2 ) {

							const g = Math.round( Math.min( 1, ( base + rise * Math.sqrt( 1 - ( d2 / r2 ) ** P ) ) / C.topMax ) * 255 );
							if ( g > data[ o + 1 ] ) data[ o + 1 ] = g;

						}

					}
					if ( data[ o + 3 ] < 128 ) data[ o + 3 ] = 128;

				}

			}

		}

		// (and its anvil: on each row, from where its box begins to where it ends)
		if ( a <= 0 ) continue;
		const W = root + fan * L + M;
		for ( let j = I( az0 ), j1 = J( az1 ); j <= j1; j ++ ) {

			const dz = ( j + 0.5 ) * cell - S / 2 - cz;
			let lo = ax0 - cx, hi = ax1 - cx;
			if ( Math.abs( ax ) > 1e-6 ) {

				const p = ( - back - M - dz * az ) / ax, q = ( L + M - dz * az ) / ax;
				lo = Math.max( lo, Math.min( p, q ) ); hi = Math.min( hi, Math.max( p, q ) );

			}
			if ( Math.abs( az ) > 1e-6 ) {

				const p = ( dz * ax - W ) / az, q = ( dz * ax + W ) / az;
				lo = Math.max( lo, Math.min( p, q ) ); hi = Math.min( hi, Math.max( p, q ) );

			}
			for ( let i = I( cx + lo ), i1 = J( cx + hi ); i <= i1; i ++ ) {

				const dx = ( i + 0.5 ) * cell - S / 2 - cx, o = ( j * N + i ) * 4, along = dx * ax + dz * az;
				if ( along <= - back - M || along >= L + M ) continue;
				const side = dz * ax - dx * az, across = Math.abs( side ), w = root + ( side > 0 ? fl : fr ) * ( Math.max( 0, along ) + 0.5 * Math.max( 0, - along ) );
				if ( across >= w + M ) continue;
				if ( across < w && along > - back && along < L ) {

					const b = Math.round( a * ss( - back, - 0.3 * U, along ) * ( 1 - ss( 0.55 * L, L, along ) )
						* ( 1 - 0.65 * Math.min( 1, Math.abs( along ) / L ) ) * ( 1 - ss( 0.5 * w, w, across ) ) * 255 );
					if ( b > data[ o + 2 ] ) data[ o + 2 ] = b;

				}
				if ( data[ o + 3 ] < 64 ) data[ o + 3 ] = 64;

			}

		}

	}

	return towers;

}

// (M14) the cumulus's base (m), where the air rising off the sea cools to its dew point (the lifting
// condensation level, about 125 m for each degree between the air's temperature and its dew point: 31 and
// 24°C over the Keys in summer, 27 and 20 in winter). Sky-pro's was 4 km, its shell 5.2 km deep and its
// clouds as much wider, a sky scaled up (as large overhead, but rain falling 4 km): at the real base a
// fair day's cumulus are a kilometre or two deep under the trades' inversion and a few across (its
// weather map and noise 11 and 2.8 km across, not 29 and 7.5: as photographs of trade-wind cumulus over
// the Turks and Caicos shallows show them, heaps as tall as they're wide with blue between)
export const CLOUD_BASE = 900;

// "Partly cloudy": scattered fair-weather cumulus (Salt Life: (M14) at their real height, CLOUD_BASE)
const PRESET = {
	atmosphere: { multipleScattering: 0.99 },
	shape: {
		altitude: CLOUD_BASE, thickness: 2400, density: 0.019, coverage: 0.49,
		horizonCoverageStart: 20000, horizonCoverageRamp: 45000, horizonCoverageAmount: 0.12,
		edgeSoftness: 0.095, edgeSoftnessFalloff: 1, weatherScale: 11000, baseScale: 2800, baseStrength: 0.69,
		erosionScaleBaseMultiplier: 0.13, erosionStrengthBase: 0.24, erosionStrengthPeak: 2.15, erosionShape: 1,
		baseWeatherStrength: 0.54, baseWeatherHeightStart: 0, baseWeatherHeightEnd: 0.13,
	},
	lighting: {
		scatteringAlbedo: 1, powderStrength: 0.7, ambientIntensity: 0.7,
		groundBounceAlbedo: [ 0.009134058699157796, 0.015208514418949472, 0.018500220124016652 ],
		baseShadowStrength: 0.88, baseShadowHeight: 0.13, moonGain: 0.65,
		// ((M14) the light a thick cloud scatters many times over before it comes back out of it, about as much
		// whichever way (scLightEnergy): sky-pro's three octaves leave most of it out, and a sunlit tower came
		// out grey where a photograph has it white; a thick cloud reflects most of the sun that falls on it)
		diffusion: 2,
	},
	// the preset's 89 m/s drift is a time-lapse; the clouds here drift with Tidewater's wind at a
	// trade-wind speed (evolution scaled by the same factor)
	// ((M14) its skew, m across for the shell's depth up, kept to its lean over sky-pro's 5.2 km)
	wind: { speed: 12, evolutionSpeed: 60.8 * 12 / 89, skew: 1750 * 2400 / 5200 },
	fade: { hazeDensityScale: 0.62, horizonMeltStart: 25000, horizonMeltEnd: 45000 },
	weather: { mainMass: [ 4, 5, 0, 1.32 ], detail: [ 6, 6, 1, 0.13 ], coverage: 0.26 },
};

// (M14) how far off the clouds melt into the sky (m): a thunderstorm's own tower is drawn nearer
export const CLOUD_MELT = [ PRESET.fade.horizonMeltStart, PRESET.fade.horizonMeltEnd ];

// (Salt Life) the cloud's look under a grey sky (o; 0: the preset's fair-weather cumulus): denser, its
// bases forming everywhere, darker below, less light through it; (M9) and in rain's deck (storm):
// nimbostratus, its underside smoother and darker still. [ density, the weather a base takes, erosion at
// its base and at its peak; albedo, ambient light, its base's shadow ]
function cloudLook( o, storm, out = [] ) {

	const S = PRESET.shape, L = PRESET.lighting;
	out[ 0 ] = S.density * ( 1 + 1.2 * o + 0.8 * storm );
	out[ 1 ] = S.baseWeatherStrength * ( 1 - 0.7 * o ) * ( 1 - 0.6 * storm );
	out[ 2 ] = S.erosionStrengthBase * ( 1 - STORM.smooth * storm );
	out[ 3 ] = S.erosionStrengthPeak * ( 1 - 0.3 * storm );
	out[ 4 ] = L.scatteringAlbedo * ( 1 - 0.25 * o ) * ( 1 - STORM.albedo * storm );
	out[ 5 ] = L.ambientIntensity * ( 1 - 0.25 * o ) * ( 1 - STORM.ambient * storm );
	out[ 6 ] = L.baseShadowStrength + ( 1 - L.baseShadowStrength ) * o;
	return out;

}
const _look = [];
// (M14) following another's drift: over how long the difference is taken up (s), and farther apart than
// this (m) it's taken at once
const FOLLOW_S = 2, FOLLOW_JUMP = 500;
const _fd = [ 0, 0, 0, 0 ];
// (M14) how high the weather's cloud goes, of the shell's depth (its march's ceiling with no tower: a
// hurricane's wall and bands, their cover past 1, go a little over its top)
const SHELL_OVER = 1.3;
// (M14) over how much of a hurricane's cover past its broken deck's its bands' turrets rise (their cells',
// bandCells: the storm map's turrets spill a few km round their cells)
const BAND_EDGE = 0.25;
// (M14) a hurricane's rain's own look, where it is (EYE.rain): a grey sky's and rain's deck's, all of both
const BAND_LOOK = cloudLook( 1, 1 );

// per tier: the view trace (sky-pro "high" quality on high; the history at most historyBudget pixels),
// the panorama and the weather map
const QUALITY = {
	high: {
		view: true, historyDivisor: 2, historyBudget: 1280 * 720, lattice: 4, maxSteps: 256, lightTaps: 6, stepMeters: 25, fullLightingAlpha: 0.5, lightReuseSteps: 3, historyWeight: 0.9,
		pano: [ 512, 160 ], panoLattice: 4, panoSteps: 128, panoLightTaps: 6, weather: 1024, fibres: 1024, shadow: true,
	},
	mid: {
		view: true, historyDivisor: 2, historyBudget: 960 * 540, lattice: 4, maxSteps: 160, lightTaps: 4, stepMeters: 30, fullLightingAlpha: 0.45, lightReuseSteps: 3, historyWeight: 0.9,
		pano: [ 512, 160 ], panoLattice: 4, panoSteps: 96, panoLightTaps: 4, weather: 1024, fibres: 1024,
	},
	low: {
		view: false, stepMeters: 40, fullLightingAlpha: 0.4, lightReuseSteps: 4,
		pano: [ 1024, 256 ], panoLattice: 8, panoSteps: 96, panoLightTaps: 3, weather: 512, fibres: 0, warmLattice: 8,
	},
};

const NOISE_RES = 64;
const NOISE_LAYERS_PER_FRAME = 8;
const WEATHER_STRIPS = 8;
// ((M14) the march's empty cells, about 420 m across over the weather map's 11 km, as sky-pro's were over its 29)
const BOUNDS_RES = 26;
const WARM_LATTICE = 4; // a whole new panorama: a 4x4 lattice, 16 frames (per tier: quality.warmLattice)
// (M14) in a hurricane with no view trace (the eye goes by at 180 m a real second: made a slot a frame, a
// panorama streaked its walls), everything the panorama's march reads held at the moment a panorama's
// begun while it's made: all its uniforms but the slot it's making (scfPano), and the storm map as it was
// then (its own copy: the live one's made again every few seconds). Not only the eye, the drift and the
// storm map's slide, as at first: the sun, the front's look ahead, the winds, the storm map itself and the
// march's jitter went on changing over its 64 frames on low, and as each row of its lattice is made 8
// frames after the last, the walls were striped across in rows (seen on an iPhone)
const cloneOf = ( v ) => typeof v !== 'object' || v === null ? v : Array.isArray( v ) ? v.map( cloneOf ) : ArrayBuffer.isView( v ) ? v.slice() : typeof v.clone === 'function' ? v.clone() : v;
// (a uniform held as its value: not a texture's, which is held by a copy (the storm map's) or not at all)
const heldAsValue = ( u ) => ! ( u.value && u.value.isTexture );
// (a uniform's value set to `to` for a pass; the live one it had, to put back)
function swapIn( u, to ) {

	const live = u.value;
	u.value = to;
	return live;

}
const REBUILD_SLOTS = 4; // view slots traced per frame while the history is rebuilt after a cut
const AP_DIST = 30000; // m: aerial perspective toward the horizon
// (M14) the haze's top (m: the trades' inversion), and how much thinner the air is above it: the march's
// aerial perspective counts the ray's way under it whole and the rest at this share (a tower's head seen
// clear from 40 km, its foot hazy; a cumulus, under it, as before)
const HAZE = [ 2000, 0.2 ];
const PANO_MIN = - 4 * DEG, PANO_RANGE = 94 * DEG; // panorama elevations (v = sqrt of the fraction)

const v4 = () => [ 0, 0, 0, 0 ];
const _d = new THREE.Vector2();

// ------------------------------------------------------------------ GLSL: noise volume and weather map

// sky-pro weather.wgsl: hashed gradients (tileable Perlin), fbm
const HASH_GLSL = /* glsl */`
uvec3 scHash33( uvec3 p ) {
	p = p * 1664525u + 1013904223u;
	p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
	p = p ^ ( p >> uvec3( 16u ) );
	p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
	return p;
}
ivec3 scWrap( ivec3 c, int n ) { return c - n * ivec3( floor( vec3( c ) / float( n ) ) ); }
float scGradient( ivec3 cell, int period, vec3 offset ) {
	uint h = ( scHash33( uvec3( scWrap( cell, period ) ) ).x >> 24u ) & 15u;
	float u = h < 8u ? offset.x : offset.y;
	float v = h < 4u ? offset.y : ( ( h == 12u || h == 14u ) ? offset.x : offset.z );
	return ( ( h & 1u ) == 0u ? u : - u ) + ( ( h & 2u ) == 0u ? v : - v );
}
float scPerlin( vec3 p, int period ) {
	ivec3 cell = ivec3( floor( p ) ); vec3 fr = fract( p ); vec3 w = fr * fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 );
	return mix( mix( mix( scGradient( cell, period, fr ), scGradient( cell + ivec3( 1, 0, 0 ), period, fr - vec3( 1, 0, 0 ) ), w.x ),
		mix( scGradient( cell + ivec3( 0, 1, 0 ), period, fr - vec3( 0, 1, 0 ) ), scGradient( cell + ivec3( 1, 1, 0 ), period, fr - vec3( 1, 1, 0 ) ), w.x ), w.y ),
		mix( mix( scGradient( cell + ivec3( 0, 0, 1 ), period, fr - vec3( 0, 0, 1 ) ), scGradient( cell + ivec3( 1, 0, 1 ), period, fr - vec3( 1, 0, 1 ) ), w.x ),
		mix( scGradient( cell + ivec3( 0, 1, 1 ), period, fr - vec3( 0, 1, 1 ) ), scGradient( cell + ivec3( 1, 1, 1 ), period, fr - vec3( 1, 1, 1 ) ), w.x ), w.y ), w.z );
}
`;

// The shape noise volume (replaces sky-pro's baked baseShape64.bin): r = Perlin-Worley (a Perlin fbm
// remapped by a worley fbm, 3 cells per period), g / b = billowy worley fbm (1 - F1) of 6 and 12 cells,
// each normalized to the blob's statistics (mean 0.48, deviation 0.12). Tileable; one layer per pass.
const NOISE_PASS = HASH_GLSL + /* glsl */`
uniform float nzLayer;
// tileable worley F1 (cell units), cells per unit
float nzWorley( vec3 p, int cells, uint seed ) {
	vec3 q = p * float( cells );
	ivec3 ip = ivec3( floor( q ) );
	vec3 fp = q - vec3( ip );
	float d = 9.0;
	for ( int z = -1; z <= 1; z ++ ) for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
		ivec3 o = ivec3( x, y, z );
		uvec3 h = scHash33( uvec3( scWrap( ip + o, cells ) ) + seed );
		vec3 v = vec3( o ) + vec3( h >> 8u ) * ( 1.0 / 16777216.0 ) - fp;
		d = min( d, dot( v, v ) );
	}
	return min( sqrt( d ), 1.0 );
}
float nzBillows( vec3 p, int c, uint seed ) {
	return 1.0 - ( nzWorley( p, c, seed ) * 0.625 + nzWorley( p, c * 2, seed + 1u ) * 0.25 + nzWorley( p, c * 4, seed + 2u ) * 0.125 );
}
float nzPerlinFbm( vec3 p, int c ) {
	float s = 0.0, w = 0.5, ws = 0.0;
	for ( int i = 0; i < 4; i ++ ) {
		int fq = c << i;
		s += scPerlin( p * float( fq ), fq ) * w; ws += w; w *= 0.5;
	}
	return s / ws * 0.5 + 0.5;
}
void main() {
	vec3 p = vec3( gl_FragCoord.xy, nzLayer + 0.5 ) / ${ f( NOISE_RES ) };
	float pn = nzPerlinFbm( p, 3 );
	float wf = nzBillows( p, 3, 0u );
	// Perlin-Worley: remap( perlin, worley - 1, 1, 0, 1 )
	float r = ( pn - ( wf - 1.0 ) ) / ( 2.0 - wf );
	vec3 n = ( vec3( r, nzBillows( p, 6, 10u ), nzBillows( p, 12, 20u ) ) - vec3( 0.6696, 0.4808, 0.4799 ) ) / vec3( 0.0605, 0.1165, 0.1178 );
	gl_FragColor = vec4( clamp( n * 0.12 + 0.48, 0.0, 1.0 ), 1.0 );
}
`;

// sky-pro weather.wgsl (procedural fbm coverage)
const WEATHER_PASS = HASH_GLSL + /* glsl */`
uniform vec4 scsWeatherMass;
uniform vec4 scsWeatherDetail;
uniform vec4 scsWeather;
uniform float scWeatherSize;
float scFbm( vec2 uv, vec4 profile ) {
	float frequency = max( 1.0, floor( profile.x + 0.5 ) ); float weight = 0.5;
	float sum = 0.0; float weights = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		if ( i >= int( profile.y ) ) break;
		sum += scPerlin( vec3( uv, profile.z * 13.37 + 0.5 ) * frequency, int( frequency ) ) * weight;
		weights += weight; weight *= 0.5; frequency *= 2.0;
	}
	return sum / max( weights, 0.001 ) * 0.5 + 0.5;
}
void main() {
	vec2 uv = floor( gl_FragCoord.xy ) / scWeatherSize;
	float mass = clamp( ( scFbm( uv, scsWeatherMass ) - 0.5 ) * scsWeatherMass.w + 0.5, 0.0, 1.0 );
	float detail = ( scFbm( uv, scsWeatherDetail ) * 2.0 - 1.0 ) * scsWeatherDetail.w;
	gl_FragColor = vec4( clamp( mass + detail + scsWeather.x - 0.5, 0.0, 1.0 ), 0.0, 0.0, 1.0 );
}
`;

// sky-pro weather-bounds.wgsl: the maximum of the weather under each coarse cell
const BOUNDS_PASS = /* glsl */`
uniform sampler2D scWeatherMap;
void main() {
	ivec2 id = ivec2( gl_FragCoord.xy );
	ivec2 sourceSize = textureSize( scWeatherMap, 0 );
	vec2 scale = vec2( sourceSize ) / ${ f( BOUNDS_RES ) };
	// both bilinear neighbours at cell boundaries, including the repeat seam
	ivec2 lo = ivec2( floor( vec2( id ) * scale - 0.5 ) );
	ivec2 hi = ivec2( ceil( vec2( id + 1 ) * scale - 0.5 ) );
	float maximum = 0.0;
	for ( int y = lo.y; y <= hi.y; y ++ ) {
		for ( int x = lo.x; x <= hi.x; x ++ ) {
			ivec2 p = ivec2( x, y ) - sourceSize * ivec2( floor( vec2( x, y ) / vec2( sourceSize ) ) );
			maximum = max( maximum, texelFetch( scWeatherMap, p, 0 ).r );
		}
	}
	gl_FragColor = vec4( min( 1.0, maximum + 1.0 / 255.0 ), 0.0, 0.0, 1.0 );
}
`;

// ------------------------------------------------------------------ GLSL: shared core (renamed from sky-pro)

const UNIFORMS_GLSL = /* glsl */`
uniform vec4 scfPosition; // xyz camera, w tan( fov / 2 )
uniform vec4 scfRight; // w aspect
uniform vec4 scfUp;
uniform vec4 scfForward;
uniform vec4 scfPreviousPosition;
uniform vec4 scfPreviousRight;
uniform vec4 scfPreviousUp;
uniform vec4 scfPreviousForward;
uniform vec4 scfViewport; // xy render size, zw history size
uniform vec4 scfSampling; // xy lattice slot, z lattice, w history valid
uniform vec4 scfClock;
uniform vec4 scfWind; // xy drift (m), z evolution
uniform vec4 scfWindDelta;
uniform vec4 scfMarch; // x step (m), y max steps, z light taps, w full lighting alpha
uniform vec4 scfTemporal;
uniform vec4 scfDisplay; // y light reuse steps
uniform vec4 scfPano; // xy slot, z lattice
uniform vec4 scfLightOffsets[ 8 ];
uniform vec4 scfLightLods[ 8 ];
uniform vec4 scsShell; // altitude, thickness, density, coverage
uniform vec4 scsShape; // weather scale, base scale, base strength, erosion scale multiplier
uniform vec4 scsErosion;
uniform vec4 scsBase;
uniform vec4 scsHorizon;
uniform vec4 scsCloudLight;
uniform vec4 scsShadow;
uniform vec4 scsBounce;
uniform vec4 scsWind;
uniform vec4 scsFade;
// (M9) the weather on its way: the cover's change at FRONT_KM up the trades; its largest rise; (M12) the
// way it comes (toward: down the blow's track)
uniform vec4 scsFront;
uniform float scsFrontMax;
uniform vec2 scsFrontDir;
// (M13) a hurricane's cloud about its eye (eyeCover): its eye's xz (m), its rmax (m), its share of the
// weather here; the way it moves
uniform vec4 scsEye;
uniform vec2 scsEyeTrack;
// (M14) its rain's own look, where it is (BAND_LOOK, as cloudLook gives it): its density, the weather its
// base takes, its erosion at its base and its peak; its albedo, ambient light and its base's shadow
uniform vec4 scsBand0;
uniform vec4 scsBand1;
// (M14) a shower's own cloud, towering over it (CB, stormMap): the storm map's middle (xz, m: slid on as the
// cells drift), its span (m), and whether any tower in it; the march's ceiling (m) and it as a shell height,
// the tropopause as one, and an anvil's depth as one
uniform vec4 scsStorm;
uniform vec4 scsCeil;
// (M14) the upper wind (xz: the way it blows), and how far a tower leans on it (m across for each m up)
uniform vec4 scsStormWind;
// (M14) how far the storms have drifted (xz, m), and how far their turrets' billows have risen (m)
uniform vec4 scsStormDrift;
// Tidewater's frame: the key light (the sun, or the moon at night: its colour), the night sky
uniform vec3 scKeyDir;
uniform vec3 scKeyColor;
uniform vec3 scNightSky;
uniform float scNight;
`;

const CORE_GLSL = /* glsl */`
#define SC_EARTH 6371.0
#define SC_FAR 250000.0
#define SC_AP_DIST ${ f( AP_DIST ) }
uniform highp sampler3D scNoise;
uniform sampler2D scWeatherMap;
uniform sampler2D scStormMap;

vec3 scRay( vec2 uv ) {
	vec2 ndc = vec2( uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0 );
	return normalize( scfForward.xyz + scfRight.xyz * ( ndc.x * scfRight.w * scfPosition.w )
		+ scfUp.xyz * ( ndc.y * scfPosition.w ) );
}
vec2 scSourceUV( vec2 pixel ) {
	return ( pixel * scfSampling.z + scfSampling.xy + 0.5 ) / scfViewport.zw;
}
vec3 scProjectPrevious( vec3 p ) {
	vec3 v = p - scfPreviousPosition.xyz;
	float z = dot( v, scfPreviousForward.xyz );
	float denom = max( z, 0.001 ) * scfPreviousPosition.w;
	return vec3( vec2( dot( v, scfPreviousRight.xyz ) / ( denom * scfPreviousRight.w ),
		- dot( v, scfPreviousUp.xyz ) / denom ) * 0.5 + 0.5, z );
}
float scHG( float mu, float g ) {
	float d = max( 1.0 + g * g - 2.0 * g * mu, 0.001 );
	return ( 1.0 - g * g ) / ( 4.0 * PI * d * sqrt( d ) );
}
// normalized droplet phase: 80% forward / 20% backscatter; each higher order halves the asymmetry
vec3 scPhases( float mu ) {
	return vec3( scHG( mu, 0.8 ), scHG( mu, 0.4 ), scHG( mu, 0.2 ) ) * 0.8
		+ vec3( scHG( mu, -0.2 ), scHG( mu, -0.1 ), scHG( mu, -0.05 ) ) * 0.2;
}

// ---- density (sky-pro density.wgsl)
struct ScCandidate {
	float conservative; float edge; float top; float bottom; float floorMask;
	float shellHeight; float localHeight; float coverage; float heaped; float soft; float grey; vec3 position;
};
// (M9) the cover's change at a point from the weather on its way, by how far up its track it is
float scFrontAt( vec2 xz ) {
	float d = dot( xz - scfPosition.xz, - scsFrontDir ) * 0.001;
	if ( d < 0.0 ) return scsFront.x * clamp( d / ${ f( FRONT_KM[ 0 ] ) }, 0.0, 1.0 );
	if ( d < ${ f( FRONT_KM[ 1 ] ) } ) return scsFront.y * d / ${ f( FRONT_KM[ 1 ] ) };
	if ( d < ${ f( FRONT_KM[ 2 ] ) } ) return mix( scsFront.y, scsFront.z, ( d - ${ f( FRONT_KM[ 1 ] ) } ) / ${ f( FRONT_KM[ 2 ] - FRONT_KM[ 1 ] ) } );
	return mix( scsFront.z, scsFront.w, clamp( ( d - ${ f( FRONT_KM[ 2 ] ) } ) / ${ f( FRONT_KM[ 3 ] - FRONT_KM[ 2 ] ) }, 0.0, 1.0 ) );
}
// (M14) how far a point hm m over the cloud's base is from a hurricane's eye, as its wall has it: the eye
// wider up it, out to the wall's outer edge (EYE.slope); and how much it's in its wall there (0..1)
float scEyeR( vec2 xz, float hm ) {
	float d = length( xz - scsEye.xy );
	return max( d - ${ f( EYE.slope ) } * max( hm, 0.0 ) * ( 1.0 - smoothstep( ${ f( EYE.wall[ 3 ] ) } * scsEye.z, ${ f( EYE.bandFrom[ 1 ] ) } * scsEye.z, d ) ), 0.0 );
}
float scEyeWallAt( float r ) {
	float R = scsEye.z;
	return smoothstep( ${ f( EYE.wall[ 0 ] ) } * R, ${ f( EYE.wall[ 1 ] ) } * R, r ) * ( 1.0 - smoothstep( ${ f( EYE.wall[ 2 ] ) } * R, ${ f( EYE.wall[ 3 ] ) } * R, r ) );
}
// (M13) a hurricane's cover at xz (eyeCover's), (M14) hm m over the cloud's base, and what it adds to the
// cover here's
float scEyeCoverOf( vec2 xz, float hm ) {
	vec2 d = xz - scsEye.xy;
	float R = scsEye.z, r = scEyeR( xz, hm );
	float eye = 1.0 - smoothstep( ${ f( EYE.clear[ 0 ] ) } * R, ${ f( EYE.clear[ 1 ] ) } * R, r );
	float wall = scEyeWallAt( r );
	float pm = dot( d, scsEyeTrack ), pn = d.x * scsEyeTrack.y - d.y * scsEyeTrack.x;
	float s = abs( pm ) + abs( pn ), t = s > 0.0 ? pn / s : 0.0;
	float q = pm >= 0.0 ? ( pn >= 0.0 ? t : 4.0 + t ) : 2.0 - t;
	float psi = r / ${ f( B.gap ) } + ${ f( B.arms ) } * q / 4.0, fr = fract( psi );
	float band = smoothstep( 0.0, 0.1, fr ) * ( 1.0 - smoothstep( ${ f( EYE.edge[ 0 ] ) }, ${ f( EYE.edge[ 1 ] ) }, fr ) ) * smoothstep( ${ f( EYE.bandFrom[ 0 ] ) } * R, ${ f( EYE.bandFrom[ 1 ] ) } * R, r );
	float deck = mix( ${ f( EYE.deck[ 0 ] ) }, ${ f( EYE.deck[ 1 ] ) }, smoothstep( ${ f( CORE[ 0 ] ) } * R, ${ f( CORE[ 1 ] ) } * R, r ) );
	return ( deck + ${ f( EYE.band ) } * band ) * ( 1.0 - eye ) + ${ f( EYE.floor ) } * eye + ${ f( EYE.tower ) } * wall;
}
// (the cover at xz, (M14) hm m over the cloud's base: the weather's and the front's on its way, giving way
// to a hurricane's about its eye as far as it's the weather here: past 1 only in its wall and its bands,
// where the towers go higher)
float scCoverOf( vec2 xz, float hm ) {
	float c = clamp( scsShell.w + scFrontAt( xz ), 0.0, 1.0 );
	if ( scsEye.w > 0.0 ) c = clamp( mix( c, scEyeCoverOf( xz, hm ), scsEye.w ), 0.0, ${ f( EYE.top ) } );
	return c;
}
// (M14) how far cloud of this cover is in a hurricane's rain (its bands, its core, its wall: EYE.rain), as
// far as it's the weather here; and so how dense it is
float scGreyOf( float coverage ) {
	return scsEye.w > 0.0 ? scsEye.w * smoothstep( ${ f( EYE.rain[ 0 ] ) }, ${ f( EYE.rain[ 1 ] ) }, coverage ) : 0.0;
}
float scDensityOf( float coverage ) { return mix( scsShell.z, scsBand0.x, scGreyOf( coverage ) ); }
// (M14) the storm map at xz, as far up as h (a shell height): leaning downwind on the upper wind
vec4 scStormAt( vec2 xz, float h ) {
	vec2 lean = scsStormWind.xy * scsStormWind.z * max( h, 0.0 ) * scsShell.y;
	return textureLod( scStormMap, ( xz - lean - scsStorm.xy ) / scsStorm.z + 0.5, 0.0 );
}
// (M14) whether a tower or an anvil may be near a stretch of ray about xz, from shell heights lo to hi: near
// a tower at any height, near an anvil alone about its shelf
bool scStormNear( vec2 xz, float lo, float hi ) {
	if ( scsStorm.w <= 0.0 || lo >= scsCeil.y ) return false;
	float a = scStormAt( xz, 0.5 * ( lo + hi ) ).a * 255.0;
	if ( a >= 127.5 ) return true;
	return a > 0.0 && hi > scsCeil.z - 1.3 * scsCeil.w - 0.2 && lo < scsCeil.z + 0.2;
}
float scShellHeight( vec3 p ) {
	vec2 horizontal = p.xz - scfPosition.xz;
	// parabolic radial height avoids subtracting two ~6,371,000 m floats
	float altitude = p.y + dot( horizontal, horizontal ) / ( 2.0 * SC_EARTH * 1000.0 );
	return ( altitude - scsShell.x ) / scsShell.y;
}
float scConeLod( float footprint, float scale ) { return max( 0.0, log2( max( footprint * 64.0 / scale, 1.0 ) ) ); }
ScCandidate scCandidate( vec3 p, float coverage, float lod ) {
	float h = scShellHeight( p );
	ScCandidate result = ScCandidate( 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, vec3( 0.0 ) );
	if ( h < -0.1 || h > scsCeil.y ) { return result; }
	// ((M14) a shower's own cloud where it is (leaning downwind as it rises): a thunderstorm's anvil's
	// footprint, and whether a tower's near)
	vec4 storm = scsStorm.w > 0.0 ? scStormAt( p.xz, h ) : vec4( 0.0 );
	bool near = storm.a > 0.5;
	if ( coverage <= 0.0 && ! near && storm.b <= 0.0 ) { return result; }
	vec2 windDirection = scsWind.xy;
	// ((M13) its evolution a vector, scfWind.zw, integrated as the wind turns)
	vec3 shapePosition = p - vec3( scfWind.x, 0.0, scfWind.y )
		- vec3( windDirection.x, 0.0, windDirection.y ) * scsWind.z * max( h, 0.0 ) + vec3( scfWind.z, 0.0, scfWind.w );
	float weather = textureLod( scWeatherMap, ( p.xz - scfWind.xy ) / scsShape.x, 0.0 ).r;
	float edge = max( scsBase.y * exp2( - max( h, 0.0 ) * scsBase.z ), 0.0001 );
	// an all-one noise sample bounds top dilation; a failed bound avoids the volume fetch
	float maximumTop = weather + coverage - 1.0 + 1.34 * scsShape.z * coverage;
	float tropo = scsCeil.z, tower = -1.0, mass = 0.0, present = 0.0;
	if ( near ) {
		// ((M14) its turrets here (CB): their sides bulging out and in as they rise, a different way at each
		// height (the map looked up off to the side), their heads heaped in billows; going with the storm as
		// it drifts, leaning with it, and rising as they boil)
		vec2 lean = scsStormWind.xy * scsStormWind.z * max( h, 0.0 ) * scsShell.y;
		vec3 q = vec3( p.x - lean.x - scsStormDrift.x, p.y - scsStormDrift.z, p.z - lean.y - scsStormDrift.y );
		vec2 w = textureLod( scNoise, q / ${ f( CB.warpScale ) }, max( lod - log2( ${ f( CB.warpScale ) } / scsShape.y ), 0.0 ) ).rg;
		storm.rga = scStormAt( p.xz + clamp( ( w - 0.48 ) / 0.24, -1.0, 1.0 ) * ${ f( CB.warp ) }, h ).rga;
		vec3 big = textureLod( scNoise, q / ${ f( CB.bulgeScale ) } + 0.37, max( lod - log2( ${ f( CB.bulgeScale ) } / scsShape.y ), 0.0 ) ).rgb;
		// ((M14) in a hurricane, only in its bands: its cover past its broken deck's, the turrets tapering off
		// over a band's edge into a steep face, none spilling into a break)
		float banded = 1.0 - scsEye.w * ( 1.0 - smoothstep( ${ f( EYE.deck[ 1 ] ) }, ${ f( EYE.deck[ 1 ] + BAND_EDGE ) }, coverage ) );
		float T = ( storm.g * ${ f( CB.topMax ) } - scsShell.x ) / scsShell.y * banded;
		present = smoothstep( 0.0, 0.04, storm.g ) * smoothstep( 0.0, 0.2, banded );
		if ( present > 0.0 ) {
			tower = T + ( ( big.g - 0.48 ) * ${ f( CB.bulge[ 0 ] ) } + ( big.b - 0.48 ) * ${ f( CB.bulge[ 1 ] ) } ) / ( 0.12 * scsShell.y ) * present;
			// (flattened against the tropopause, lumpy there and no mesa, but where a thunderstorm's main updraft's
			// core overshoots it: as far as it would have risen past it)
			float over = clamp( ( T - tropo ) * scsShell.y / ${ f( ( CB.top - CLOUD_BASE ) * ( CB.dome - 1 ) ) }, 0.0, 1.0 );
			tower = min( tower, tropo + ( ${ f( CB.overshoot ) } * over * over + ( big.r - 0.48 ) / 0.12 * ${ f( CB.ceiling ) } ) / scsShell.y );
		}
		// (and a thunderstorm's broad mass at its foot, lumpy on top)
		float foot = clamp( ( storm.a * 255.0 - 128.0 ) / 127.0, 0.0, 1.0 );
		mass = banded * ${ f( CB.massTop ) } / scsShell.y * sqrt( clamp( foot * storm.r, 0.0, 1.0 ) ) * clamp( 1.0 + ( big.b - 0.48 ) / 0.12 * ${ f( CB.massLumps ) }, 0.2, 1.8 );
		maximumTop = max( maximumTop, max( tower, mass ) );
	}
	float anvilDepth = scsCeil.w * ( 0.3 + 0.7 * smoothstep( 0.0, 0.5, storm.b ) ), anvilBottom = tropo - anvilDepth;
	bool anvil = storm.b > 0.0 && h > anvilBottom - 0.15 * anvilDepth - edge && h < tropo + edge;
	if ( maximumTop < h - edge && ! anvil ) { return result; }
	// ((M14) in a hurricane's rain, its base everywhere: flat and low)
	float grey = scGreyOf( coverage );
	float required = ( 1.0 - smoothstep( scsBase.w, max( scsErosion.w, scsBase.w + 0.001 ), h ) ) * mix( scsBase.x, scsBand0.y, grey );
	float floorMask = smoothstep( required - 0.1, required, weather );
	float heaped = max( present, smoothstep( 0.0, 0.05, mass ) ), own = near ? max( tower, mass ) : -1.0;
	if ( floorMask <= 0.0 && ! anvil && own < h - edge ) { return result; }
	vec3 baseSample = textureLod( scNoise, shapePosition / scsShape.y, lod ).rgb;
	// ((M14) in a hurricane's wall, its face smooth: the heaping noise as good as gone there)
	float smoothed = 0.0;
	if ( scsEye.w > 0.0 ) {
		// (over the wall and its inner face, from where the clear eye begins: the face seen from the eye)
		float R = scsEye.z, re = scEyeR( p.xz, max( h, 0.0 ) * scsShell.y );
		smoothed = scsEye.w * smoothstep( ${ f( EYE.clear[ 0 ] ) } * R, ${ f( EYE.wall[ 0 ] ) } * R, re ) * ( 1.0 - smoothstep( ${ f( EYE.wall[ 2 ] ) } * R, ${ f( EYE.wall[ 3 ] ) } * R, re ) ) * ${ f( EYE.smooth ) };
	}
	float dilation = mix( dot( baseSample, vec3( 0.7, 0.41, 0.23 ) ), ${ f( 0.48 * 1.34 ) }, smoothed ) * scsShape.z;
	// ((M14) the weather's cloud, and a hurricane's past 1, up to a little over the shell's top, as when the
	// march stopped there: only a tower goes on up past it (the ceiling raised for a tower anywhere let a
	// hurricane's bands and its core heap up to the tropopause, one grey wall)
	// (and a hurricane's rain's deck no higher than EYE.deckTop: its bands' towers stand over it, their
	// faces heaped and lit, as a band coming in shows them, not one smooth slab up to the shell's top. Not
	// its wall)
	float top = min( weather + coverage - 1.0 + dilation * coverage, mix( ${ f( SHELL_OVER ) }, ${ f( EYE.deckTop ) }, grey * ( 1.0 - smoothed / ${ f( EYE.smooth ) } ) ) ), bottom = 0.0;
	// ((M14) where a turret or the mass stands over the cumulus: its base forms there. Not where it's lower:
	// the cumulus about a storm are as the weather has them, no plate of cloud about its foot)
	if ( own > top ) { top = own; floorMask = max( floorMask, heaped ); }
	else heaped = 0.0;
	if ( anvil && h > top ) {
		// ((M14) and over it a thunderstorm's anvil: flat on top under the tropopause, lumpy under, ragged at
		// its edges, its ice thinner cloud, thinning toward its end)
		float b = clamp( storm.b * ( 1.0 + ( baseSample.r - 0.48 ) / 0.12 * ${ f( CB.ragged ) } ), 0.0, 1.0 );
		top = tropo - ( 1.0 - b ) * 0.1 * anvilDepth + ( dilation / ( 1.34 * scsShape.z ) - 0.5 ) * ${ f( CB.anvilTop ) } * anvilDepth;
		bottom = anvilBottom + ( 0.5 - dilation / ( 1.34 * scsShape.z ) ) * ${ f( CB.anvilLumps ) } * anvilDepth;
		floorMask = mix( ${ f( CB.density[ 1 ] ) }, ${ f( CB.density[ 0 ] ) }, b ) * smoothstep( 0.0, 0.15, b );
		heaped = 0.0; coverage = ${ f( CB.ice ) };
	}
	result.conservative = smoothstep( - edge, edge, top - h ) * smoothstep( - edge, edge, h - bottom ) * floorMask;
	result.edge = edge; result.top = top; result.bottom = bottom; result.floorMask = floorMask;
	result.shellHeight = h; result.localHeight = clamp( ( h - bottom ) / max( top - bottom, 0.001 ), 0.0, 1.0 );
	// ((M14) a tower's heaped: its surface billows)
	result.coverage = mix( coverage, max( coverage, ${ f( CB.heap ) } ), heaped ); result.heaped = heaped; result.soft = smoothed; result.grey = grey; result.position = shapePosition;
	return result;
}
float scErodedDensity( ScCandidate c, float lod ) {
	if ( c.conservative <= 0.0 ) { return 0.0; }
	// ((M14) a tower's at its own strength, its field billowy; a hurricane's wall's, shallow: its face
	// smooth; in a hurricane's rain, its underside smoother)
	float strength = mix( mix( mix( scsErosion.x, scsBand0.z, c.grey ), mix( scsErosion.y, scsBand0.w, c.grey ), c.localHeight ), ${ f( CB.erode ) }, c.heaped ) * ( 1.0 - 0.7 * c.soft );
	float maximumErosion = 0.173 * strength * c.coverage;
	if ( min( c.top - c.shellHeight, c.shellHeight - c.bottom ) >= maximumErosion + c.edge ) { return c.floorMask; }
	vec3 s = textureLod( scNoise, c.position / ( scsShape.y * scsShape.w ), lod ).rgb;
	vec3 field = mix( mix( 1.0 - s, s, scsErosion.z ), 1.0 - s, c.heaped );
	float erosion = dot( field, vec3( 0.113, 0.04, 0.02 ) ) * strength * c.coverage;
	return smoothstep( - c.edge, c.edge, c.top - erosion - c.shellHeight )
		* smoothstep( - c.edge, c.edge, c.shellHeight - c.bottom - erosion ) * c.floorMask;
}
float scLightDensity( vec3 p, float coverage, vec2 lods, bool cheap ) {
	ScCandidate c = scCandidate( p, coverage, lods.x );
	if ( cheap ) { return c.conservative; }
	return scErodedDensity( c, lods.y );
}
vec2 scShellRoots( vec3 direction, float altitude, float originHeight ) {
	float radius = SC_EARTH * 1000.0;
	float b = ( radius + originHeight ) * direction.y;
	float c = ( originHeight - altitude ) * ( 2.0 * radius + originHeight + altitude );
	float h = b * b - c;
	if ( h < 0.0 ) { return vec2( -1.0 ); }
	float q = - b - ( b >= 0.0 ? sqrt( h ) : - sqrt( h ) );
	float other = c / ( abs( q ) > 0.0001 ? q : -0.0001 );
	return vec2( min( q, other ), max( q, other ) );
}
vec2 scCloudInterval( vec3 dir, float originHeight ) {
	// ((M14) up to the ceiling: the shell's top, or a thunderstorm's over it)
	vec2 inner = scShellRoots( dir, scsShell.x, originHeight );
	vec2 outer = scShellRoots( dir, scsCeil.x, originHeight );
	float start = 0.0; float end = min( outer.y, SC_FAR );
	if ( outer.y <= 0.0 ) { return vec2( 0.0 ); }
	if ( originHeight < scsShell.x ) { start = max( inner.y, 0.0 ); }
	else {
		if ( originHeight > scsCeil.x ) { start = max( outer.x, 0.0 ); }
		if ( inner.x >= 0.0 ) { end = min( end, inner.x ); }
	}
	vec2 ground = scShellRoots( dir, 0.0, originHeight );
	if ( ground.x > 0.0 ) { end = min( end, ground.x ); }
	return vec2( start, end );
}
`;

// the ray march (sky-pro clouds.wgsl main(), as a function of the ray)
const MARCH_GLSL = /* glsl */`
uniform sampler2D scWeatherBounds;
float scCoverageAt( float t, vec3 p ) {
	return scCoverOf( p.xz, scShellHeight( p ) * scsShell.y ) + scsHorizon.z * smoothstep( scsHorizon.x, scsHorizon.x + max( scsHorizon.y, 1.0 ), t );
}
// (the most it can be along a stretch of ray: the cells' emptiness test)
float scCoverageBound( float t ) {
	return mix( min( 1.0, scsShell.w + scsFrontMax ), ${ f( EYE.top ) }, max( scsEye.w, 0.0 ) ) + scsHorizon.z * smoothstep( scsHorizon.x, scsHorizon.x + max( scsHorizon.y, 1.0 ), t );
}
float scHeightAlongRay( float t, vec3 dir, float originHeight ) {
	float altitude = originHeight + dir.y * t + dot( dir.xz, dir.xz ) * t * t / ( 2.0 * SC_EARTH * 1000.0 );
	return ( altitude - scsShell.x ) / scsShell.y;
}
bool scCellIsEmpty( float t, float end, vec3 dir, float originHeight, float maximumWeather, vec2 middle ) {
	float turningPoint = - dir.y * SC_EARTH * 1000.0 / max( dot( dir.xz, dir.xz ), 0.000001 );
	float minHeight = scHeightAlongRay( clamp( turningPoint, t, end ), dir, originHeight );
	float maxHeight = max( scHeightAlongRay( t, dir, originHeight ), scHeightAlongRay( end, dir, originHeight ) );
	// ((M14) a tower or an anvil near this stretch (its middle, xz))
	if ( scStormNear( middle, minHeight, maxHeight ) ) return false;
	float coverage = scCoverageBound( end );
	float maximumTop = maximumWeather + coverage - 1.0 + 1.34 * scsShape.z * coverage;
	float edgeHeight = scsBase.z >= 0.0 ? minHeight : maxHeight;
	float edge = max( scsBase.y * exp2( - max( edgeHeight, 0.0 ) * scsBase.z ), 0.0001 );
	// ((M14) in a hurricane, as little as its rain's base takes)
	float required = ( 1.0 - smoothstep( scsBase.w, max( scsErosion.w, scsBase.w + 0.001 ), maxHeight ) ) * ( scsEye.w > 0.0 ? min( scsBase.x, scsBand0.y ) : scsBase.x );
	return maximumTop < minHeight - edge || maximumWeather <= required - 0.1;
}
float scLightOpticalDepth( vec3 p, float coverage, vec2 lods, bool cheap ) {
	float opticalDepth = 0.0, density = scDensityOf( coverage );
	for ( int i = 1; i < 8; i ++ ) {
		if ( i >= int( scfMarch.z ) ) { break; }
		vec4 tap = scfLightOffsets[ i ];
		opticalDepth += scLightDensity( p + tap.xyz, coverage, max( lods, scfLightLods[ i ].xy ), cheap ) * tap.w * density;
		if ( opticalDepth >= 32.0 ) { break; }
	}
	// ((M14) and on through a tower, kilometres toward the light (CB.shade): the taps reach a few hundred m.
	// Under the anvil: it's lit as the rest are, white, as photographs have it (shaded through its own
	// depth, it came out a grey lid on the tower). (M14) And through a hurricane's rain, its bands and its
	// core kilometres deep: dark under, as a band coming in is. Not its wall: its face is lit smooth and
	// white from its eye, as photographs from inside eyes show it (shaded through it, it heaped up again)
	float sh = scShellHeight( p );
	bool rain = scGreyOf( coverage ) > 0.5 && scEyeR( p.xz, max( sh, 0.0 ) * scsShell.y ) > ${ f( EYE.wall[ 3 ] ) } * scsEye.z;
	if ( opticalDepth < 32.0 && ( rain || scsStorm.w > 0.0 && sh < scsCeil.z - scsCeil.w && scStormAt( p.xz, sh ).a > 0.5 ) ) {
		for ( int i = 0; i < ${ CB.shade[ 1 ] }; i ++ ) {
			float d = ${ f( CB.shade[ 0 ] ) } * exp2( float( i ) );
			opticalDepth += scLightDensity( p + scKeyDir * d, coverage, lods + vec2( 1.0 + float( i ) ), true ) * d * 0.7 * density;
			if ( opticalDepth >= 32.0 ) { break; }
		}
	}
	return opticalDepth;
}
float scLightEnergy( float opticalDepth, vec3 phase ) {
	float quarter = exp( - opticalDepth * 0.25 );
	float halfT = quarter * quarter;
	// ((M14) and the light a thick cloud scatters many times over before it comes back out of it, much the
	// same whichever way: its diffusion, fading slowly with depth (the octaves leave most of it out); scsShadow.w)
	return dot( vec3( halfT * halfT, halfT * 0.5, quarter * 0.25 ), phase ) + sqrt( quarter ) * scsShadow.w * ${ f( 1 / ( 4 * Math.PI ) ) };
}

// Tidewater's sky (the atmosphere's sky view LUT; the night sky's ambient)
vec3 scSky( vec3 dir ) {
	return atmosphereSkyLuminance( dir ) + scNightSky * scNight;
}
// key light: the sun while it is the app's key light, seen from cloud altitude, else the moon
vec3 scDirect() {
	bool isMoon = dot( scKeyDir, atmoSunDir ) < 0.9999;
	vec3 sunE = atmosphereSampleTransmittance( 6360.0 + scsShell.x * 0.001, scKeyDir.y ) * atmoSunIlluminance;
	return isMoon ? scKeyColor : sunE;
}

struct ScMarch { vec3 color; float alpha; float depth; float steps; };

ScMarch scMarch( vec3 origin, vec3 dir, float dither, float pixelConeAngle, float stepConeAngle, int maxSteps, bool useBounds ) {
	ScMarch outM = ScMarch( vec3( 0.0 ), 0.0, SC_FAR, 0.0 );
	vec2 interval = scCloudInterval( dir, origin.y );
	vec3 color = vec3( 0.0 ); float transmission = 1.0; float weightedDepth = 0.0;
	int steps = 0;
	if ( interval.y > interval.x && scsShell.w > 0.0 && scsShell.z > 0.0 ) {
		vec3 L = scKeyDir;
		float lightCosine = dot( dir, L );
		vec3 phase = scPhases( lightCosine );
		vec3 direct = scDirect();
		vec3 zenith = scSky( vec3( 0.0, 1.0, 0.0 ) );
		vec3 horizon = scSky( normalize( vec3( L.x, 0.03, L.z ) + vec3( 1e-5, 0.0, 0.0 ) ) );
		vec3 bounce = scsBounce.rgb * direct * max( L.y, 0.0 );
		float t = interval.x + dither * scfMarch.x;
		bool coarse = true; int emptyRun = 0; float accumulatedDepth = 0.0;
		float refineEnd = -1.0;
		float cellEnd = -1.0; float cellStart = -1.0; float maximumWeather = 1.0;
		float shadowAt = - SC_FAR; float shadowDensity = -1.0; float shadowTau = 0.0; float skyTau = 0.0; bool shadowCheap = false;
		bool hasDirectLight = max( direct.x, max( direct.y, direct.z ) ) > 0.00001;
		for ( int i = 0; i < 512; i ++ ) {
			if ( i >= maxSteps || t >= interval.y || transmission < 0.003 ) { break; }
			steps ++;
			if ( coarse && useBounds ) {
				// ((M14) above every cumulus top with no storm near: a long stride, not a cell at a time)
				float strideEnd = t + ${ f( CB.stride ) };
				float lowest = scHeightAlongRay( clamp( - dir.y * SC_EARTH * 1000.0 / max( dot( dir.xz, dir.xz ), 0.000001 ), t, strideEnd ), dir, origin.y );
				float cover = scCoverageBound( strideEnd ), highest = 1.34 * scsShape.z * cover + cover;
				if ( strideEnd < interval.y && lowest > highest + scsBase.y && ! scStormNear( origin.xz + dir.xz * ( t + ${ f( CB.stride / 2 ) } ), lowest, max( scHeightAlongRay( t, dir, origin.y ), scHeightAlongRay( strideEnd, dir, origin.y ) ) ) ) {
					t = strideEnd; continue;
				}
				if ( t >= cellEnd || t < cellStart ) {
					vec2 size = vec2( textureSize( scWeatherBounds, 0 ) );
					vec2 grid = ( origin.xz + dir.xz * t - scfWind.xy ) / scsShape.x * size;
					vec2 cell = floor( grid );
					vec2 wrapped = cell - size * floor( cell / size );
					maximumWeather = texelFetch( scWeatherBounds, ivec2( wrapped ), 0 ).r;
					vec2 fg = fract( grid );
					vec2 distance = vec2( dir.x >= 0.0 ? 1.0 - fg.x : fg.x, dir.z >= 0.0 ? 1.0 - fg.y : fg.y )
						/ max( abs( dir.xz ) * size / scsShape.x, vec2( 0.0000001 ) );
					cellStart = t; cellEnd = min( interval.y, t + max( min( distance.x, distance.y ), 0.05 ) );
				}
				if ( scCellIsEmpty( t, cellEnd, dir, origin.y, maximumWeather, origin.xz + dir.xz * ( 0.5 * ( t + cellEnd ) ) ) ) { t = cellEnd + 0.05; continue; }
			}
			float footprint = t * pixelConeAngle;
			float fineStep = max( scfMarch.x, t * stepConeAngle * 1.5 );
			vec3 p = origin + dir * t;
			float coverage = scCoverageAt( t, p );
			float baseLod = scConeLod( footprint, scsShape.y );
			ScCandidate c = scCandidate( p, coverage, baseLod );
			float erosionLod = scConeLod( footprint, scsShape.y * scsShape.w );
			if ( coarse ) {
				if ( c.conservative > 0.0 ) {
					if ( scErodedDensity( c, erosionLod ) > 0.0 ) {
						refineEnd = t;
						t = max( interval.x, t - fineStep * 4.0 ) + fineStep;
						t = min( t, refineEnd );
						coarse = false; emptyRun = 0;
						continue;
					}
				}
				t += fineStep * 4.0;
				continue;
			}
			float density = scErodedDensity( c, erosionLod );
			if ( density <= 0.0 ) {
				shadowAt = - SC_FAR;
				emptyRun ++;
				if ( t < refineEnd ) { t = min( t + fineStep, refineEnd ); continue; }
				if ( emptyRun >= 4 ) { coarse = true; }
				t += coarse ? fineStep * 4.0 : fineStep; continue;
			}
			emptyRun = 0; refineEnd = -1.0;
			// ((M14) in a hurricane's rain, its own look: denser, its base darker, less light through it)
			float dense = mix( scsShell.z, scsBand0.x, c.grey );
			float sigmaT = density * dense;
			float surfaceStep = clamp( 0.5 / max( sigmaT, 0.000001 ), fineStep * 0.15, fineStep );
			float stepLength = min( mix( surfaceStep, fineStep * 3.0, smoothstep( 1.0, 3.0, accumulatedDepth ) ), interval.y - t );
			float height = clamp( c.shellHeight, 0.0, 1.0 );
			float baseShadow = mix( 1.0, mix( 0.15, 1.0, smoothstep( 0.0, max( scsShadow.y, 0.001 ), height ) ), mix( scsShadow.x, scsBand1.z, c.grey ) );
			// darken thin margins away from the sun; keep the forward scattered silver linings
			float powderWeight = scsCloudLight.y * ( 1.0 - smoothstep( 0.2, 0.95, lightCosine ) );
			float powder = mix( 1.0, 1.0 - exp( - density * 2.0 ), powderWeight );
			float energy = 0.0;
			bool cheap = ( 1.0 - transmission ) >= scfMarch.w;
			float reuseDistance = min( fineStep * scfDisplay.y, max( 20.0, scsShape.y * scsShape.w * 0.03 ) );
			if ( abs( t - shadowAt ) >= reuseDistance || abs( density - shadowDensity ) > 0.08 || cheap != shadowCheap ) {
				vec2 lods = vec2( baseLod, erosionLod );
				if ( hasDirectLight ) { shadowTau = scLightOpticalDepth( p, coverage, lods, cheap ); }
				vec2 skyLods = lods + vec2( 1.0 );
				skyTau = ( scLightDensity( p + vec3( 0.0, 125.0, 0.0 ), coverage, skyLods, true ) * 250.0
					+ scLightDensity( p + vec3( 0.0, 600.0, 0.0 ), coverage, skyLods, true ) * 700.0 ) * dense;
				shadowAt = t; shadowDensity = density; shadowCheap = cheap;
			}
			if ( hasDirectLight ) {
				energy = scLightEnergy( shadowTau + sigmaT * scfLightOffsets[ 0 ].w, phase );
			}
			// ((M14) under a hurricane's rain, beyond its wall's face, kilometres of cloud over it: the sky's light
			// a few hundredths of the open sky's, not a fifth, as under a thunderstorm (EYE.sky). So a band's
			// underside is dark against a break, as photographs of them coming in have it; and no sunlit sea
			// under it to light it from below. Its wall's face, over its eye, is lit)
			float shade = c.grey * ( 1.0 - c.soft / ${ f( EYE.smooth ) } );
			float skyVisibility = mix( 0.2, ${ f( EYE.sky ) }, shade ) + 0.8 / ( 1.0 + ( skyTau + sigmaT * 25.0 ) * 0.35 );
			vec3 ambient = ( mix( mix( zenith, horizon, 0.55 ), zenith, sqrt( height ) ) * skyVisibility + bounce * ( 1.0 - height ) * ( 1.0 - shade ) )
				* mix( scsCloudLight.z, scsBand1.y, c.grey ) * ( 1.0 + scsCloudLight.w );
			vec3 light = ( direct * energy * powder * baseShadow + ambient ) * mix( scsCloudLight.x, scsBand1.x, c.grey );
			float stepT = exp( - sigmaT * stepLength );
			float alpha = transmission * ( 1.0 - stepT );
			color += alpha * light; weightedDepth += alpha * t;
			transmission *= stepT; accumulatedDepth += sigmaT * stepLength; t += stepLength;
		}
	}
	float alpha = 1.0 - transmission;
	float depth = SC_FAR;
	if ( alpha > 0.0 ) {
		depth = weightedDepth / alpha;
		// aerial perspective (distance toward the sky behind: (M14) the haze's, under the inversion, HAZE), then
		// the far melt into the sky
		vec3 sky = scSky( dir );
		float under = dir.y > 0.0 ? min( depth, max( ${ f( HAZE[ 0 ] ) } - origin.y, 0.0 ) / dir.y ) : depth;
		float ap = exp( - ( under + ${ f( HAZE[ 1 ] ) } * ( depth - under ) ) / SC_AP_DIST );
		color = color * ap + sky * alpha * ( 1.0 - ap );
		float melt = smoothstep( scsFade.y, max( scsFade.z, scsFade.y + 1.0 ), depth );
		// ((M14) a thunderstorm's tower and anvil, up past the rest, seen farther: they melt from as far as the
		// rest are gone)
		float high = smoothstep( 0.6, 1.2, scHeightAlongRay( depth, dir, origin.y ) );
		melt = mix( melt, smoothstep( scsFade.z, scsFade.z * ${ f( CB.melt ) }, depth ), high );
		color = mix( color, sky * alpha, melt );
	}
	outM.color = color; outM.alpha = alpha; outM.depth = depth; outM.steps = float( steps );
	return outM;
}
`;

// the view: one lattice slot of every block per frame (colour + depth, MRT)
const TRACE_PASS = ( cirrus ) => ATMOSPHERE_GLSL + UNIFORMS_GLSL + CORE_GLSL + MARCH_GLSL + cirrus + /* glsl */`
layout( location = 1 ) out highp vec4 scOutMeta;
void main() {
	vec2 id = floor( gl_FragCoord.xy );
	vec2 uv = scSourceUV( id );
	// the history is stored y up (WebGL), the camera rays y down
	vec3 dir = scRay( vec2( uv.x, 1.0 - uv.y ) );
	// interleaved gradient noise (Jimenez 2014) instead of the blue noise texture, advanced per frame
	float noise = fract( 52.9829189 * fract( dot( id, vec2( 0.06711056, 0.00583715 ) ) ) );
	float dither = scfTemporal.x > 0.0 ? fract( noise + scfClock.x * 0.61803398875 ) : 0.5;
	float pixelConeAngle = 2.0 * scfPosition.w / scfViewport.y;
	float stepConeAngle = 2.0 * scfPosition.w / scfViewport.w;
	ScMarch m = scMarch( scfPosition.xyz, dir, dither, pixelConeAngle, stepConeAngle, int( scfMarch.y ), scfDisplay.y > 0.0 );
	// Tidewater's cirrus veil behind the cumulus
	vec4 hi = cloudsHigh( dir, pixelConeAngle );
	gl_FragColor = vec4( m.color + hi.rgb * ( 1.0 - m.alpha ), 1.0 - ( 1.0 - m.alpha ) * hi.a );
	// km depth fits half float
	scOutMeta = vec4( m.depth * 0.001, 1.0, 0.0, 0.0 );
}
`;

// temporal reconstruction (sky-pro temporal.wgsl), ping-pong history: colour, ( depth, carried depth )
const RESOLVE_PASS = UNIFORMS_GLSL + /* glsl */`
#define SC_FAR 250000.0
uniform sampler2D scCurrentColor;
uniform sampler2D scCurrentMeta;
uniform sampler2D scPreviousColor;
uniform sampler2D scPreviousMeta;
layout( location = 1 ) out highp vec4 scOutMeta;
vec3 scRay( vec2 uv ) {
	vec2 ndc = vec2( uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0 );
	return normalize( scfForward.xyz + scfRight.xyz * ( ndc.x * scfRight.w * scfPosition.w )
		+ scfUp.xyz * ( ndc.y * scfPosition.w ) );
}
// previous camera projection, uv y up like the textures
vec3 scProjectPrevious( vec3 p ) {
	vec3 v = p - scfPreviousPosition.xyz;
	float z = dot( v, scfPreviousForward.xyz );
	float denom = max( z, 0.001 ) * scfPreviousPosition.w;
	return vec3( vec2( dot( v, scfPreviousRight.xyz ) / ( denom * scfPreviousRight.w ),
		dot( v, scfPreviousUp.xyz ) / denom ) * 0.5 + 0.5, z );
}
ivec2 scSourceClamp( ivec2 p ) { return clamp( p, ivec2( 0 ), textureSize( scCurrentColor, 0 ) - 1 ); }
vec4 scHistoryAt( vec2 uv, vec2 size ) {
	// five tap Catmull-Rom: detail survives repeated history warps
	vec2 position = uv * size;
	vec2 center = floor( position - 0.5 ) + 0.5;
	vec2 fr = position - center;
	vec2 w0 = fr * ( fr * ( -0.5 * fr + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( 1.5 * fr - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( -1.5 * fr + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( 0.5 * fr - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 uv0 = ( center - 1.0 ) / size;
	vec2 uv3 = ( center + 2.0 ) / size;
	vec2 uv12 = ( center + w2 / w12 ) / size;
	vec4 weights = vec4( w12.x * w0.y, w0.x * w12.y, w12.x * w12.y, w3.x * w12.y );
	float bottomWeight = w12.x * w3.y;
	vec4 value = textureLod( scPreviousColor, vec2( uv12.x, uv0.y ), 0.0 ) * weights.x
		+ textureLod( scPreviousColor, vec2( uv0.x, uv12.y ), 0.0 ) * weights.y
		+ textureLod( scPreviousColor, uv12, 0.0 ) * weights.z
		+ textureLod( scPreviousColor, vec2( uv3.x, uv12.y ), 0.0 ) * weights.w
		+ textureLod( scPreviousColor, vec2( uv12.x, uv3.y ), 0.0 ) * bottomWeight;
	return value / ( dot( weights, vec4( 1.0 ) ) + bottomWeight );
}
float scFreshHistoryWeight( vec4 color, float depth ) {
	// rebuilding after a cut: the fresh sample replaces the upsampled history
	if ( scfTemporal.z > 0.5 ) return 0.0;
	// (far clouds keep more of their history than sky-pro's 0.65: Tidewater's TAA smoothed the rest of
	// their sampling noise, and there is no TAA here)
	float retain = color.a < 0.0001 ? 0.25 : mix( 0.25, 0.8, smoothstep( 8.0, 30.0, depth ) );
	return min( scfTemporal.x, retain ) * ( 1.0 - scfTemporal.y );
}
void main() {
	ivec2 size = ivec2( scfViewport.zw );
	ivec2 id = ivec2( gl_FragCoord.xy );
	vec2 uv = ( vec2( id ) + 0.5 ) / vec2( size );
	int lattice = int( scfSampling.z );
	bool fresh = id.x % lattice == int( scfSampling.x ) && id.y % lattice == int( scfSampling.y );
	vec2 source = ( vec2( id ) - scfSampling.xy ) / scfSampling.z;
	ivec2 center = scSourceClamp( ivec2( floor( source + 0.5 ) ) );
	vec4 metadata = texelFetch( scCurrentMeta, center, 0 );
	vec4 central = texelFetch( scCurrentColor, center, 0 );
	float currentDepth = max( metadata.x, 0.001 );
	vec4 stored = texelFetch( scPreviousMeta, id, 0 );
	bool historyValid = scfSampling.w > 0.5 && scfTemporal.x > 0.0;

	vec4 color = vec4( 0.0 ); float weightSum = 0.0;
	ivec2 base = ivec2( floor( source ) ); vec2 fraction = fract( source );
	for ( int y = 0; y < 2; y ++ ) {
		for ( int x = 0; x < 2; x ++ ) {
			ivec2 pos = scSourceClamp( base + ivec2( x, y ) );
			vec4 tap = texelFetch( scCurrentColor, pos, 0 ); float depth = texelFetch( scCurrentMeta, pos, 0 ).x;
			float bilinear = ( x == 1 ? fraction.x : 1.0 - fraction.x ) * ( y == 1 ? fraction.y : 1.0 - fraction.y );
			float weight = bilinear * exp( - abs( depth - metadata.x ) / max( 0.1, metadata.x * 0.1 ) - abs( tap.a - central.a ) * 4.0 );
			color += tap * weight; weightSum += weight;
		}
	}
	color = weightSum > 0.00001 ? color / max( weightSum, 0.00001 ) : central;
	if ( fresh ) { color = central; }
	float carriedDepth = currentDepth;
	if ( historyValid ) {
		vec4 low = color; vec4 high = color;
		float reprojectionDepth = stored.y >= 0.001 ? stored.y : SC_FAR * 0.001;
		for ( int y = -1; y <= 1; y ++ ) {
			for ( int x = -1; x <= 1; x ++ ) {
				vec4 tap = texelFetch( scCurrentColor, scSourceClamp( center + ivec2( x, y ) ), 0 );
				low = min( low, tap ); high = max( high, tap );
				ivec2 neighbor = clamp( id + ivec2( x, y ), ivec2( 0 ), size - 1 );
				float depth = texelFetch( scPreviousMeta, neighbor, 0 ).y;
				if ( depth >= 0.001 ) { reprojectionDepth = min( reprojectionDepth, depth ); }
			}
		}
		if ( stored.y < 0.001 ) { reprojectionDepth = min( reprojectionDepth, currentDepth ); }
		vec3 world = scfPosition.xyz + scRay( vec2( uv.x, 1.0 - uv.y ) ) * ( reprojectionDepth * 1000.0 );
		world -= vec3( scfWindDelta.x, 0.0, scfWindDelta.y );
		vec3 previous = scProjectPrevious( world );
		ivec2 previousPixel = clamp( ivec2( previous.xy * vec2( size ) ), ivec2( 0 ), size - 1 );
		vec4 oldMeta = texelFetch( scPreviousMeta, previousPixel, 0 );
		bool valid = previous.z > 0.0 && all( greaterThanEqual( previous.xy, vec2( 0.0 ) ) ) && all( lessThanEqual( previous.xy, vec2( 1.0 ) ) ) && oldMeta.y >= 0.001;
		if ( valid ) {
			vec4 history = clamp( scHistoryAt( previous.xy, vec2( size ) ), low, high );
			float motionPixels = length( ( previous.xy - uv ) * vec2( size ) );
			float historyFraction = fresh ? scFreshHistoryWeight( central, currentDepth ) : 1.0;
			color = mix( color, history, historyFraction );
			float expectedDepth = length( world - scfPreviousPosition.xyz ) * 0.001;
			if ( ! fresh && ( motionPixels <= 0.5 || abs( oldMeta.y - expectedDepth ) < max( 0.001, expectedDepth * 0.15 ) ) ) {
				carriedDepth = oldMeta.y;
			}
		}
	}
	gl_FragColor = vec4( max( color.rgb, vec3( 0.0 ) ), clamp( color.a, 0.0, 1.0 ) );
	scOutMeta = vec4( currentDepth, carriedDepth, 0.0, 0.0 );
}
`;

// panorama (reflections, environment, the low tier's view): one lattice slot per frame, marched densely
// into a small target (a discarding pass over the whole panorama would leave most of every GPU wave
// idle), then scattered into the panorama by PANO_SCATTER_PASS
const PANO_PASS = ( cirrus ) => ATMOSPHERE_GLSL + UNIFORMS_GLSL + CORE_GLSL + MARCH_GLSL + cirrus + /* glsl */`
uniform vec2 scPanoSize;
uniform float scPanoSteps;
void main() {
	vec2 texel = floor( gl_FragCoord.xy ) * scfPano.z + scfPano.xy;
	vec2 uv = ( texel + 0.5 ) / scPanoSize;
	float elev = uv.y * uv.y * ${ f( PANO_RANGE ) } + ${ f( PANO_MIN ) };
	float az = uv.x * ${ f( 2 * Math.PI ) };
	vec3 dir = vec3( cos( elev ) * cos( az ), sin( elev ), cos( elev ) * sin( az ) );
	float cone = ${ f( 2 * Math.PI ) } / scPanoSize.x;
	ScMarch m = scMarch( scfPosition.xyz, dir, 0.5, cone, cone, int( scPanoSteps ), true );
	vec4 hi = cloudsHigh( dir, cone );
	gl_FragColor = vec4( m.color + hi.rgb * ( 1.0 - m.alpha ), ( 1.0 - m.alpha ) * hi.a );
}
`;

const PANO_SCATTER_PASS = /* glsl */`
uniform vec4 scfPano;
uniform sampler2D scPanoSlot;
void main() {
	ivec2 texel = ivec2( gl_FragCoord.xy );
	int lattice = int( scfPano.z );
	if ( texel.x % lattice != int( scfPano.x ) || texel.y % lattice != int( scfPano.y ) ) discard;
	gl_FragColor = texelFetch( scPanoSlot, texel / lattice, 0 );
}
`;

// ------------------------------------------------------------------ GLSL: sampling (the sky and its environment)

export const CLOUDS_GLSL = /* glsl */`
uniform sampler2D cloudsPanorama;
// (M14) the panorama before it, and how far the sky's gone over from it to this one (1: all this one): in a
// hurricane on a tier with no view trace each is made whole at one moment, and gone over to while the next
// is made (made a slot a frame as its eye went by, a panorama streaked its walls: _hold)
uniform sampler2D cloudsPanoramaPrev;
uniform float cloudsSwap;
uniform sampler2D cloudsView;
uniform vec3 cloudsViewRight;
uniform vec3 cloudsViewUp;
uniform vec3 cloudsViewFwd;
uniform vec2 cloudsViewTan;
uniform float cloudsViewValid;
uniform float cloudsFade; // 0 until the noise and the first panorama are ready

vec2 cloudsPanoramaUV( vec3 dir ) {
	float az = atan( dir.z, dir.x );
	float u = fract( az / ${ f( 2 * Math.PI ) } );
	float elev = - acos( clamp( dir.y, -1.0, 1.0 ) ) + ${ f( Math.PI / 2 ) };
	float t = clamp( ( elev - ${ f( PANO_MIN ) } ) / ${ f( PANO_RANGE ) }, 0.0, 1.0 );
	return vec2( u, sqrt( t ) );
}
vec4 cloudsPanoramaFaded( vec4 s, vec3 dir ) {
	float below = smoothstep( -0.07, -0.03, dir.y ) * cloudsFade;
	return vec4( s.rgb * below, mix( 1.0, s.a, below ) );
}
// vec4( rgb in-scattered radiance, a transmittance ) for a view direction (panorama)
vec4 cloudsSample( vec3 dir ) {
	vec2 uv = cloudsPanoramaUV( dir );
	vec4 s = textureLod( cloudsPanorama, uv, 0.0 );
	if ( cloudsSwap < 1.0 ) s = mix( textureLod( cloudsPanoramaPrev, uv, 0.0 ), s, cloudsSwap );
	return cloudsPanoramaFaded( s, dir );
}
// the same, bicubic (Catmull-Rom in 5 bilinear taps): the main view's clouds where there is no view
// trace (the low tier) keep crisper edges magnified
vec4 cloudsSharpOf( sampler2D pano, vec2 position, vec2 size ) {
	vec2 center = floor( position - 0.5 ) + 0.5;
	vec2 fr = position - center;
	vec2 w0 = fr * ( fr * ( -0.5 * fr + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( 1.5 * fr - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( -1.5 * fr + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( 0.5 * fr - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 uv0 = ( center - 1.0 ) / size;
	vec2 uv3 = ( center + 2.0 ) / size;
	vec2 uv12 = ( center + w2 / w12 ) / size;
	vec4 weights = vec4( w12.x * w0.y, w0.x * w12.y, w12.x * w12.y, w3.x * w12.y );
	float bottomWeight = w12.x * w3.y;
	vec4 value = textureLod( pano, vec2( uv12.x, uv0.y ), 0.0 ) * weights.x
		+ textureLod( pano, vec2( uv0.x, uv12.y ), 0.0 ) * weights.y
		+ textureLod( pano, uv12, 0.0 ) * weights.z
		+ textureLod( pano, vec2( uv3.x, uv12.y ), 0.0 ) * weights.w
		+ textureLod( pano, vec2( uv12.x, uv3.y ), 0.0 ) * bottomWeight;
	return value / ( dot( weights, vec4( 1.0 ) ) + bottomWeight );
}
vec4 cloudsSampleSharp( vec3 dir ) {
	vec2 size = vec2( textureSize( cloudsPanorama, 0 ) );
	vec2 position = cloudsPanoramaUV( dir ) * size;
	vec4 value = cloudsSharpOf( cloudsPanorama, position, size );
	if ( cloudsSwap < 1.0 ) value = mix( cloudsSharpOf( cloudsPanoramaPrev, position, size ), value, cloudsSwap );
	return cloudsPanoramaFaded( clamp( value, vec4( 0.0 ), vec4( 64.0, 64.0, 64.0, 1.0 ) ), dir );
}

// Transmittance for the sun's disc behind the clouds. The cloud march stops once less than 0.3 % of
// the light gets through and reports that remainder, which (noisy from frame to frame) let a
// clamped sun disc of 2500x the sky shine and sparkle through thick cloud: below ~0.4 % it is dark.
float cloudsSunTransmittance( float T ) { return T * smoothstep( 0.004, 0.04, T ); }

// The main view's clouds: the temporally reconstructed history, looked up with the camera it was
// resolved for; outside it (or before any trace, or on the low tier) the panorama
vec4 cloudsSampleView( vec3 dir ) {
	float x = dot( dir, cloudsViewRight );
	float y = dot( dir, cloudsViewUp );
	float z = dot( dir, cloudsViewFwd );
	vec2 uv = vec2( x / max( z, 1e-4 ) / cloudsViewTan.x * 0.5 + 0.5, y / max( z, 1e-4 ) / cloudsViewTan.y * 0.5 + 0.5 );
	bool inside = cloudsViewValid > 0.5 && z > 0.01 && all( greaterThanEqual( uv, vec2( 0.0 ) ) ) && all( lessThanEqual( uv, vec2( 1.0 ) ) );
	if ( inside ) {
		vec4 v = max( textureLod( cloudsView, uv, 0.0 ), vec4( 0.0 ) );
		float above = smoothstep( -0.05, -0.03, dir.y ) * cloudsFade;
		return vec4( v.rgb * above, 1.0 - min( v.a, 1.0 ) * above );
	}
	return cloudsSampleSharp( dir );
}
`;

// ------------------------------------------------------------------ the clouds

// the clouds' shadow on the ground (sea level) under each texel: the optical depth up the key light
// through the cloud layer (Tidewater's shadow kernel)
const SHADOW_RES = 256;
const SHADOW_SIZE = 12000; // m
const SHADOW_PASS = '#ifndef PI\n#define PI 3.141592653589793\n#endif\n' + UNIFORMS_GLSL + CORE_GLSL + /* glsl */`
uniform vec4 scShadowArea; // xy centre (world xz), z size (m)
void main() {
	vec2 xz = scShadowArea.xy + ( gl_FragCoord.xy / ${ f( SHADOW_RES ) } - 0.5 ) * scShadowArea.z;
	vec3 L = scKeyDir;
	float ly = max( L.y, 0.08 );
	float t0 = scsShell.x / ly, t1 = scsCeil.x / ly;
	float dt = ( t1 - t0 ) / 16.0;
	float tau = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		float t = t0 + ( float( i ) + 0.5 ) * dt;
		vec3 p = vec3( xz.x, 0.0, xz.y ) + vec3( L.x, ly, L.z ) * t;
		float cover = scCoverOf( p.xz, p.y - scsShell.x );
		tau += scLightDensity( p, cover, vec2( 2.0 ), false ) * scDensityOf( cover ) * dt;
		if ( tau > 12.0 ) break;
	}
	// multiple scattering lets some light through even thick cloud (as the view's octaves do)
	float T = exp( - tau ) * 0.8 + exp( - tau * 0.25 ) * 0.2;
	gl_FragColor = vec4( T, 0.0, 0.0, 1.0 );
}`;

export class SkyProClouds {

	constructor( renderer, atmosphere, tier = 'high' ) {

		this.renderer = renderer;
		this.atmosphere = atmosphere;
		this.tier = QUALITY[ tier ] ? tier : 'low';
		const q = this.quality = QUALITY[ this.tier ];
		const P = PRESET, s = P.shape, l = P.lighting;

		// ---- per-frame state (sky-pro Frame) and settings (sky-pro Settings), one { value } per field
		const U = this.uniforms = {
			scfPosition: { value: v4() }, scfRight: { value: v4() }, scfUp: { value: v4() }, scfForward: { value: v4() },
			scfPreviousPosition: { value: v4() }, scfPreviousRight: { value: v4() }, scfPreviousUp: { value: v4() }, scfPreviousForward: { value: v4() },
			scfViewport: { value: v4() }, scfSampling: { value: v4() }, scfClock: { value: v4() }, scfWind: { value: v4() }, scfWindDelta: { value: v4() },
			scfMarch: { value: v4() }, scfTemporal: { value: v4() }, scfDisplay: { value: v4() }, scfPano: { value: v4() },
			scfLightOffsets: { value: new Float32Array( 32 ) },
			scfLightLods: { value: new Float32Array( 32 ) },
			scsShell: { value: [ s.altitude, s.thickness, s.density, s.coverage ] },
			scsShape: { value: [ s.weatherScale, s.baseScale, s.baseStrength, s.erosionScaleBaseMultiplier ] },
			scsErosion: { value: [ s.erosionStrengthBase, s.erosionStrengthPeak, s.erosionShape, s.baseWeatherHeightEnd ] },
			// exponential softness falloff per shell height fraction
			scsBase: { value: [ s.baseWeatherStrength, s.edgeSoftness, Math.log2( Math.max( s.edgeSoftnessFalloff, 0.001 ) ) * s.thickness * 0.001, s.baseWeatherHeightStart ] },
			scsHorizon: { value: [ s.horizonCoverageStart, s.horizonCoverageRamp, s.horizonCoverageAmount, 0 ] },
			// w: the atmosphere's multiple scattering term of the ambient
			scsCloudLight: { value: [ l.scatteringAlbedo, l.powderStrength, l.ambientIntensity, P.atmosphere.multipleScattering ] },
			scsShadow: { value: [ l.baseShadowStrength, l.baseShadowHeight, l.moonGain, l.diffusion ] },
			scsBounce: { value: [ ...l.groundBounceAlbedo, 0 ] },
			scsWind: { value: [ 0, 1, P.wind.skew, 0 ] },
			scsFade: { value: [ P.fade.hazeDensityScale, P.fade.horizonMeltStart, P.fade.horizonMeltEnd, 0 ] },
			scsFront: { value: new THREE.Vector4() },
			scsFrontMax: { value: 0 },
			scsFrontDir: { value: new THREE.Vector2( G.windPrevailing.value.x, G.windPrevailing.value.y ).normalize() },
			scsEye: { value: new THREE.Vector4() },
			scsEyeTrack: { value: new THREE.Vector2( 1, 0 ) },
			scsBand0: { value: BAND_LOOK.slice( 0, 4 ) },
			scsBand1: { value: [ ...BAND_LOOK.slice( 4, 7 ), 0 ] },
			scsStorm: { value: new THREE.Vector4( 0, 0, CB.span, 0 ) },
			scsCeil: { value: new THREE.Vector4( s.altitude + s.thickness, 1.3, 0, 0 ) },
			scsStormWind: { value: new THREE.Vector4( 1, 0, CB.lean, 0 ) },
			scsStormDrift: { value: new THREE.Vector4() },
			scsWeatherMass: { value: P.weather.mainMass.slice() },
			scsWeatherDetail: { value: P.weather.detail.slice() },
			scsWeather: { value: [ P.weather.coverage, 0, 0, 0 ] },
			scKeyDir: { value: new THREE.Vector3( 0, 1, 0 ) },
			scKeyColor: { value: new THREE.Color() },
			scNightSky: { value: new THREE.Color() },
			scNight: { value: 0 },
			scNoise: { value: null },
			scWeatherMap: { value: null },
			scWeatherBounds: { value: null },
			scStormMap: { value: null },
		};

		// ---- public handles
		this.coverage = { value: s.coverage };
		this.overcast = { value: 0 };
		this.front = U.scsFront;
		this.frontDir = U.scsFrontDir;
		this.eye = U.scsEye;
		this.eyeTrack = U.scsEyeTrack;
		this.drift = { value: new THREE.Vector3() };
		this.storm = { value: 0 };
		this.resolutionScale = 1;
		this.outputSize = null;

		// ---- textures
		// the shape noise: generated a few layers per frame (mipmapped once complete: the cone LOD)
		const noise = this.noise = new THREE.WebGL3DRenderTarget( NOISE_RES, NOISE_RES, NOISE_RES, {
			type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
			minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
		} );
		noise.texture.wrapS = noise.texture.wrapT = noise.texture.wrapR = THREE.RepeatWrapping;
		const W = q.weather;
		const r8 = { type: THREE.UnsignedByteType, format: THREE.RedFormat, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping };
		this.weatherMap = floatTarget( W, W, r8 );
		this.weatherBounds = floatTarget( BOUNDS_RES, BOUNDS_RES, { ...r8, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
		U.scNoise.value = noise.texture;
		U.scWeatherMap.value = this.weatherMap.texture;
		U.scWeatherBounds.value = this.weatherBounds.texture;
		// ((M14) the showers' towers and anvils: setStorms)
		const sm = this.stormData = new Uint8Array( CB.res * CB.res * 4 );
		this.stormTexture = new THREE.DataTexture( sm, CB.res, CB.res, THREE.RGBAFormat, THREE.UnsignedByteType );
		this.stormTexture.minFilter = this.stormTexture.magFilter = THREE.LinearFilter;
		this.stormTexture.needsUpdate = true;
		U.scStormMap.value = this.stormTexture;
		this.towers = 0; // (M14) how many showers tower in it
		this._stormT = 0;
		this._stormJob = { at: - 1, cells: [], back: new Uint8Array( sm.length ), towers: 0, args: null, time: 0, now: false };
		// ((M14) the cells the map was last made of; how far they've drifted (m, by then), when (s), and how fast
		// (m/s))
		this._stormWas = [];
		this._stormDrift = { clock: 0, time: 0, x: 0, z: 0, vx: 0, vz: 0 };

		const [ PW, PH ] = q.pano;
		// the panorama and its back buffer (a whole new one is made there over warmFrames frames, then swapped in);
		// ((M14) with no view trace, a third: the one before, gone over from in a hurricane, _hold)
		this.panoramas = [ floatTarget( PW, PH, { wrapS: THREE.RepeatWrapping } ), floatTarget( PW, PH, { wrapS: THREE.RepeatWrapping } ) ];
		if ( ! q.view ) this.panoramas.push( floatTarget( PW, PH, { wrapS: THREE.RepeatWrapping } ) );
		this._steady = null; // (M14) what a whole panorama's made with while it's made ([ uniform, value ]: _hold)
		this.panorama = this.panoramas[ 0 ];
		// one slot of the panorama's lattice (the largest marched in a frame: the warm-up's)
		this.warmLattice = q.warmLattice || WARM_LATTICE;
		this.warmFrames = this.warmLattice ** 2;
		const slot = Math.min( this.warmLattice, q.panoLattice );
		this.panoSlot = floatTarget( Math.ceil( PW / slot ), Math.ceil( PH / slot ), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
		if ( q.view ) {

			// the trace (1/lattice² of the history) and the history ping-pong: colour + ( depth, carried depth )
			const mrt = ( w, h ) => {

				const t = floatTarget( w, h, { count: 2 } );
				t.textures[ 1 ].format = THREE.RGFormat;
				t.textures[ 1 ].minFilter = t.textures[ 1 ].magFilter = THREE.NearestFilter;
				return t;

			};

			this.source = mrt( 1, 1 );
			this.history = [ mrt( 1, 1 ), mrt( 1, 1 ) ];

		}

		this._pp = 0;

		// (high) the clouds' shadow on the ground
		this.shadowMap = q.shadow ? floatTarget( SHADOW_RES, SHADOW_RES, { format: THREE.RedFormat } ) : null;
		this.shadowArea = { value: new THREE.Vector4( 0, 0, SHADOW_SIZE, 0 ) };
		this._shadowRow = 0;
		this._shadowMade = false;

		// ---- sampling (every consumer: the sky, its environment)
		this.sampleUniforms = {
			cloudsPanorama: { value: this.panorama.texture },
			cloudsPanoramaPrev: { value: this.panorama.texture },
			cloudsSwap: { value: 1 },
			cloudsView: { value: this.panorama.texture },
			cloudsViewRight: { value: new THREE.Vector3( 1, 0, 0 ) },
			cloudsViewUp: { value: new THREE.Vector3( 0, 1, 0 ) },
			cloudsViewFwd: { value: new THREE.Vector3( 0, 0, - 1 ) },
			cloudsViewTan: { value: new THREE.Vector2( 1, 1 ) },
			cloudsViewValid: { value: 0 },
			cloudsFade: { value: 0 },
		};
		const S = this.sampleUniforms;
		this.viewCam = { right: S.cloudsViewRight, up: S.cloudsViewUp, fwd: S.cloudsViewFwd, tan: S.cloudsViewTan };
		this.viewValid = S.cloudsViewValid;
		this.fade = S.cloudsFade;

		// Tidewater's cirrus veil (composited behind the cumulus by the trace and the panorama)
		this.cirrus = q.fibres ? new Cirrus( renderer, { fibRes: q.fibres } ) : new NoCirrus();
		this.cirrusAmount = this.cirrus.amount;
		this.upper = this.cirrus.upper;
		this._cirrus = this.cirrus.amount.value; // (M9: a fair sky's, thinned under a grey one)

		this._buildPasses();

		// ---- CPU state
		this._w = 0; this._h = 0; this._scale = 1;
		this.sourceWidth = 1; this.sourceHeight = 1; this.historyWidth = 1; this.historyHeight = 1;
		this.frameIndex = 0;
		this.historyValid = false;
		this.noiseLayer = 0; // layers of the noise volume made so far
		this.weatherStrip = 0; // strips of the weather map made so far
		this.panoWarm = 0; // > 0: slots of a new panorama still to march (a warmLattice x warmLattice lattice)
		this.panoVersion = 0; // new panoramas made (the environment follows)
		this._slotIndex = 0; // view traces so far (the lattice order)
		this._rebuild = 0; // view slots traced since the last cut
		this._waited = false; // the generation starts on the second update (the first one is the sky's)
		this.ready = false;
		this._windX = 0; this._windZ = 0; this._evoX = 0; this._evoZ = 0; this._elapsed = 0;
		this._driftV = [ 0, 0, 0, 0 ]; // ((M14) how fast they're drifting and evolving now, m/s)
		this._follow = null; // ((M14) following another's drift: { d: what's left to take up, left: s })
		this._prevCam = null;
		this._prevLight = new THREE.Vector3();
		this._lastCoverage = - 1;
		this._alt = PRESET.shape.altitude;
		this._deeper = 0;
		this._lastOvercast = 0;
		this._lastStorm = 0;
		this.passes = 0; // passes drawn by the last update (stats)

	}

	// ------------------------------------------------------------ passes

	_buildPasses() {

		const U = this.uniforms, A = this.atmosphere.uniforms;
		const marchUniforms = { ...A, ...U, ...this.cirrus.uniforms };
		const cirrus = this.cirrus.glsl;
		this.noisePass = new Pass( NOISE_PASS, { nzLayer: { value: 0 } } );
		this.weatherPass = new Pass( WEATHER_PASS, { scsWeatherMass: U.scsWeatherMass, scsWeatherDetail: U.scsWeatherDetail, scsWeather: U.scsWeather, scWeatherSize: { value: this.quality.weather } } );
		this.boundsPass = new Pass( BOUNDS_PASS, { scWeatherMap: U.scWeatherMap } );
		this.panoPass = new Pass( PANO_PASS( cirrus ), { ...marchUniforms, scPanoSize: { value: new THREE.Vector2( ...this.quality.pano ) }, scPanoSteps: { value: this.quality.panoSteps } } );
		this.panoScatterPass = new Pass( PANO_SCATTER_PASS, { scfPano: U.scfPano, scPanoSlot: { value: this.panoSlot.texture } } );
		this.passList = [ this.noisePass, this.weatherPass, this.boundsPass, this.panoPass, this.panoScatterPass, ...this.cirrus.passList ];
		if ( this.quality.view ) {

			this.tracePass = new Pass( TRACE_PASS( cirrus ), marchUniforms );
			this.resolvePass = new Pass( RESOLVE_PASS, {
				...U,
				scCurrentColor: { value: this.source.textures[ 0 ] }, scCurrentMeta: { value: this.source.textures[ 1 ] },
				scPreviousColor: { value: null }, scPreviousMeta: { value: null },
			} );
			this.passList.push( this.tracePass, this.resolvePass );

		}

		if ( this.shadowMap ) {

			this.shadowPass = new Pass( SHADOW_PASS, { ...U, scShadowArea: this.shadowArea } );
			this.passList.push( this.shadowPass );

		}

	}

	// the passes' programs, for an asynchronous compile ahead of their first use
	get meshes() {

		return this.passList.map( ( p ) => p.mesh );

	}

	// ------------------------------------------------------------ frame

	_drawingBufferSize() {

		if ( this.outputSize ) return this.outputSize;
		return this.renderer.getDrawingBufferSize( this._size || ( this._size = new THREE.Vector2() ) );

	}

	_allocate( w, h ) {

		const q = this.quality;
		const scale = this.resolutionScale;
		const div = Math.max( q.historyDivisor, Math.sqrt( w * scale * h * scale / q.historyBudget ) );
		this.sourceWidth = Math.max( 1, Math.ceil( w * scale / div / q.lattice ) );
		this.sourceHeight = Math.max( 1, Math.ceil( h * scale / div / q.lattice ) );
		this.historyWidth = this.sourceWidth * q.lattice;
		this.historyHeight = this.sourceHeight * q.lattice;
		this.source.setSize( this.sourceWidth, this.sourceHeight );
		for ( const t of this.history ) t.setSize( this.historyWidth, this.historyHeight );
		this.historyValid = false;

	}

	// generation of the noise volume and the weather map, spread over the first frames
	_generate() {

		const r = this.renderer;
		if ( this.noiseLayer < NOISE_RES ) {

			const end = Math.min( NOISE_RES, this.noiseLayer + NOISE_LAYERS_PER_FRAME );
			for ( ; this.noiseLayer < end; this.noiseLayer ++ ) {

				// the last layer also builds the mip chain (the cone LOD)
				if ( this.noiseLayer === NOISE_RES - 1 ) this.noise.texture.generateMipmaps = true;
				this.noisePass.uniforms.nzLayer.value = this.noiseLayer;
				this.noisePass.render( r, this.noise, false, this.noiseLayer );
				this.passes ++;

			}

			return false;

		}

		if ( this.weatherStrip < WEATHER_STRIPS ) {

			const W = this.quality.weather, h = W / WEATHER_STRIPS, t = this.weatherMap;
			t.scissor.set( 0, this.weatherStrip * h, W, h );
			t.scissorTest = true;
			this.weatherPass.render( r, t, false );
			t.scissorTest = false;
			this.passes ++;
			if ( ++ this.weatherStrip === WEATHER_STRIPS ) {

				this.boundsPass.render( r, this.weatherBounds );
				this.passes ++;

			}

			return false;

		}

		this.panoWarm = this.warmFrames;
		return true;

	}

	// (M14) a hurricane's panorama, begun: what its march reads now, [ uniform, value ] each, to make all of
	// it with (but the slot), and the storm map as it is now in a copy of its own
	_hold() {

		const PU = this.panoPass.uniforms, held = [];
		for ( const n in PU ) if ( n !== 'scfPano' && heldAsValue( PU[ n ] ) ) held.push( [ PU[ n ], cloneOf( PU[ n ].value ) ] );
		if ( PU.scStormMap ) {

			const live = this.stormTexture.image;
			let st = this._stormHeld;
			if ( ! st ) {

				st = this._stormHeld = new THREE.DataTexture( new Uint8Array( live.data.length ), live.width, live.height, THREE.RGBAFormat, THREE.UnsignedByteType );
				st.minFilter = st.magFilter = THREE.LinearFilter;

			}

			st.image.data.set( live.data );
			st.needsUpdate = true;
			held.push( [ PU.scStormMap, st ] );

		}

		return held;

	}

	update( dt, camera, keyColor, nightSky, night, skyIrradiance ) {

		const q = this.quality, P = PRESET, U = this.uniforms;
		dt = Math.min( 0.1, Math.max( 0, dt ) );
		this.passes = 0;

		// ---- noise volume and weather map (first frames)
		if ( ! this.ready && this._compiling ) return;
		if ( ! this.ready && this._waited ) this.ready = this._generate();
		this._waited = true;

		// ---- output size
		if ( q.view ) {

			const size = this._drawingBufferSize();
			if ( size.x !== this._w || size.y !== this._h || this.resolutionScale !== this._scale ) {

				this._w = size.x; this._h = size.y; this._scale = this.resolutionScale;
				this._allocate( size.x, size.y );

			}

		}

		// ---- settings: coverage, overcast, wind direction. (Salt Life) The weather moves the first two
		// a little every frame: the panorama's progressive refresh and the view's history follow on their
		// own. Only a step (a pick, the clock jumping) makes a whole new panorama, and never restarts one
		// already being made (the first one fades the clouds in, and brings the cirrus)
		const cov = this.coverage.value, oc = this.overcast.value, st = this.storm.value;
		const F = U.scsFront.value;
		U.scsFrontMax.value = Math.max( 0, F.x, F.y, F.z, F.w );
		if ( cov !== this._lastCoverage || oc !== this._lastOvercast || st !== this._lastStorm ) {

			const step = Math.abs( cov - this._lastCoverage ) > 0.05 || Math.abs( oc - this._lastOvercast ) > 0.05 || Math.abs( st - this._lastStorm ) > 0.05;
			U.scsShell.value[ 3 ] = cov;
			this._setOvercast( oc, st );
			this._lastCoverage = cov;
			this._lastOvercast = oc;
			this._lastStorm = st;
			if ( step ) {

				this.historyValid = false;
				if ( this.ready && this.panoWarm === 0 ) this.panoWarm = this.warmFrames;

			}

		}

		// (Salt Life: aloft, the trades' direction, whichever way the weather turns the wind at the surface;
		// (M13) a hurricane's wind round its eye: `drift`. The clouds' evolution runs along it: integrated as a
		// vector, so a turn doesn't jump it)
		const dr = this.drift.value, trades = ! ( dr.z > 0 );
		const wd = trades ? G.windPrevailing.value : _d.set( dr.x, dr.y );
		const wl = Math.hypot( wd.x, wd.y ) || 1;
		const wx = wd.x / wl, wz = wd.y / wl;
		U.scsWind.value[ 0 ] = wx; U.scsWind.value[ 1 ] = wz;
		// ((M13) a hurricane's cloud down to the sea, and deeper)
		const k = Math.max( 0, U.scsEye.value.w );
		U.scsShell.value[ 0 ] = Math.max( EYE.base, this._alt - EYE.lower * k );
		// ((M14) as deep as its rain's deck all over it: its rain's look is its own where it is, scsBand)
		U.scsShell.value[ 1 ] = P.shape.thickness * ( 1 + EYE.deeper * k + Math.max( this._deeper, STORM.deeper * k ) );
		// ((M14) the march's ceiling: the shell's top, or while showers tower over it the tropopause, and a
		// thunderstorm's top over it, overshooting and lumpy)
		const alt = U.scsShell.value[ 0 ], depth = U.scsShell.value[ 1 ];
		const ceil = Math.max( alt + depth, this.towers > 0 ? CB.top + CB.overshoot + 3 * CB.ceiling : 0 );
		U.scsCeil.value.set( ceil, ( ceil - alt ) / depth + SHELL_OVER - 1, ( CB.top - alt ) / depth, CB.anvil / depth );

		// ---- key light (Tidewater's frame.sunDir / sunColor / skyIrradiance)
		const L = U.scKeyDir.value.copy( G.sunDir.value );
		U.scKeyColor.value.copy( keyColor );
		U.scNightSky.value.copy( nightSky );
		U.scNight.value = night;

		// ---- camera
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		const cp = camera.position;
		const tanY = Math.tan( THREE.MathUtils.degToRad( camera.fov * 0.5 ) ) / ( camera.zoom || 1 );
		const aspect = camera.aspect;
		const nrm = ( x, y, z ) => {

			const l = Math.hypot( x, y, z ) || 1;
			return [ x / l, y / l, z / l ];

		};

		const R = nrm( e[ 0 ], e[ 1 ], e[ 2 ] ), Up = nrm( e[ 4 ], e[ 5 ], e[ 6 ] ), Fw = nrm( - e[ 8 ], - e[ 9 ], - e[ 10 ] );
		const cur = { position: [ cp.x, cp.y, cp.z, tanY ], right: [ ...R, aspect ], up: [ ...Up, 0 ], forward: [ ...Fw, 0 ] };
		const prev = this._prevCam;
		// camera cuts: teleports, big turns, zoom
		if ( ! prev
			|| Math.hypot( cp.x - prev.position[ 0 ], cp.y - prev.position[ 1 ], cp.z - prev.position[ 2 ] ) > 1000
			|| Fw[ 0 ] * prev.forward[ 0 ] + Fw[ 1 ] * prev.forward[ 1 ] + Fw[ 2 ] * prev.forward[ 2 ] < 0.7
			|| Math.abs( tanY - prev.position[ 3 ] ) > 0.01 ) this.historyValid = false;
		if ( L.dot( this._prevLight ) < 0.999 ) {

			this.historyValid = false;
			// a new light (the moon takes over, a jump of the time of day): a whole new panorama (as the
			// time of day runs the progressive refresh follows the sun)
			if ( this.ready && L.dot( this._prevLight ) < 0.9997 ) this.panoWarm = this.warmFrames;

		}

		this._prevLight.copy( L );
		const src = this.historyValid && prev ? prev : cur;
		U.scfPosition.value = cur.position; U.scfRight.value = cur.right; U.scfUp.value = cur.up; U.scfForward.value = cur.forward;
		U.scfPreviousPosition.value = src.position; U.scfPreviousRight.value = src.right; U.scfPreviousUp.value = src.up; U.scfPreviousForward.value = src.forward;
		this._prevCam = cur;

		// ---- clock and wind
		this._elapsed += dt;
		const speed = trades ? P.wind.speed : dr.z;
		// ((M14) and what's left of the difference from the drift they follow: followDrift)
		const fol = this._follow, fk = fol ? Math.min( 1, dt / Math.max( fol.left, 1e-3 ) ) : 0, fd = _fd.fill( 0 );
		if ( fol ) {

			for ( let i = 0; i < 4; i ++ ) { fd[ i ] = fol.d[ i ] * fk; fol.d[ i ] -= fd[ i ]; }
			if ( ( fol.left -= dt ) <= 0 ) this._follow = null;

		}

		const dx = wx * speed * dt + fd[ 0 ], dz = wz * speed * dt + fd[ 1 ];
		this._windX += dx; this._windZ += dz;
		this._evoX += wx * P.wind.evolutionSpeed * dt + fd[ 2 ]; this._evoZ += wz * P.wind.evolutionSpeed * dt + fd[ 3 ];
		this._driftV[ 0 ] = wx * speed; this._driftV[ 1 ] = wz * speed;
		this._driftV[ 2 ] = wx * P.wind.evolutionSpeed; this._driftV[ 3 ] = wz * P.wind.evolutionSpeed;
		U.scfClock.value = [ this.frameIndex % 4096, this._elapsed, dt, 0 ];
		U.scfWind.value = [ this._windX, this._windZ, this._evoX, this._evoZ ];
		U.scfWindDelta.value = [ dx, dz, 0, 0 ];
		U.scfDisplay.value = [ 0, q.lightReuseSteps, 0, 0 ];

		// ---- light march taps: a 25 m local segment, then geometric growth to ~2.5 km over a cone
		const lxd = L.x, lyd = L.y, lzd = L.z;
		let tx = lzd, ty = 0, tz = - lxd;
		if ( Math.abs( lyd ) > 0.99 ) {

			tx = 0; ty = - lzd; tz = lyd;

		}

		const inv = 1 / Math.hypot( tx, ty, tz );
		tx *= inv; ty *= inv; tz *= inv;
		const bx = lyd * tz - lzd * ty, by = lzd * tx - lxd * tz, bz = lxd * ty - lyd * tx;
		const off = U.scfLightOffsets.value, lods = U.scfLightLods.value;
		off[ 0 ] = 0; off[ 1 ] = 0; off[ 2 ] = 0; off[ 3 ] = 25;
		const sh = P.shape;
		const taps = q.view ? q.lightTaps : q.panoLightTaps;
		for ( let i = 1; i < 8; i ++ ) {

			const growth = 1.7 ** i, mid = 25 * ( ( growth - 1 ) / 0.7 + growth * 0.5 );
			const angle = i * 2.399963, radius = Math.sqrt( ( i + 0.5 ) / taps );
			const u = Math.cos( angle ) * radius * 0.05 * mid, v = Math.sin( angle ) * radius * 0.05 * mid;
			const o = i * 4;
			off[ o ] = lxd * mid + tx * u + bx * v; off[ o + 1 ] = lyd * mid + ty * u + by * v; off[ o + 2 ] = lzd * mid + tz * u + bz * v; off[ o + 3 ] = 25 * growth;
			const footprint = mid * 0.1;
			lods[ o ] = Math.max( 0, Math.log2( footprint * 64 / sh.baseScale ) );
			lods[ o + 1 ] = Math.max( 0, Math.log2( footprint * 64 / ( sh.baseScale * sh.erosionScaleBaseMultiplier ) ) );

		}

		this.cirrus.update( dt, camera, skyIrradiance );
		if ( ! this.ready ) return;
		const r = this.renderer;
		// the cirrus textures, a step per frame after the first panorama
		if ( this.panoWarm === 0 && ! this.cirrus.ready ) {

			// once they are made, a new panorama with the veil
			if ( this.cirrus.generate() ) {

				this.cirrus.uniforms.cloudsCirrusFade.value = 1;
				this.panoWarm = this.warmFrames;
				this.historyValid = false;

			}

			this.passes ++;

		}


		// ---- panorama: the first one over 16 frames (4x4 lattice), then one slot of the lattice per frame
		const PL = q.panoLattice;
		U.scfMarch.value = [ q.stepMeters, q.panoSteps, q.panoLightTaps, q.fullLightingAlpha ];
		// ((M14) in a hurricane with no view trace, each panorama made whole as a new one is, at the moment it's
		// begun at (all the march reads: _hold), and the next begun as it's done)
		const S = this.sampleUniforms, steady = ! q.view && U.scsEye.value.w > 0;
		if ( steady && this.panoWarm === 0 ) this.panoWarm = this.warmFrames;
		const warming = this.panoWarm > 0;
		if ( warming ) {

			const k = this.warmFrames - this.panoWarm --, WL = this.warmLattice;
			U.scfPano.value = [ k % WL, Math.floor( k / WL ), WL, 0 ];
			if ( k === 0 ) this._steady = steady ? this._hold() : null;

		} else {

			// a scrambled order over the lattice (no visible sweep)
			const k = ( this.frameIndex * 7 ) % ( PL * PL );
			U.scfPano.value = [ k % PL, Math.floor( k / PL ), PL, 0 ];

		}

		const [ PW, PH ] = q.pano, sl = this.panoSlot, lat = U.scfPano.value[ 2 ];
		sl.viewport.set( 0, 0, Math.ceil( PW / lat ), Math.ceil( PH / lat ) );
		sl.scissor.copy( sl.viewport );
		sl.scissorTest = true;
		const held = warming ? this._steady : null, live = held ? held.map( ( [ u, v ] ) => swapIn( u, v ) ) : null;
		this.panoPass.render( r, sl );
		if ( live ) held.forEach( ( [ u ], i ) => { u.value = live[ i ]; } );
		this.panoScatterPass.render( r, warming ? this.panoramas[ 1 ] : this.panorama, false );
		this.passes += 2;
		// ((M14) gone over to the newest as the next is made)
		S.cloudsSwap.value = Math.min( 1, S.cloudsSwap.value + 1 / this.warmFrames );
		if ( warming && this.panoWarm === 0 ) {

			// the new panorama is complete: it becomes the one the sky samples ((M14) in a hurricane with no
			// view trace, gone over to from the one before, which is kept while it is)
			this.panoVersion ++;
			const P = this.panoramas, crossing = this._steady && P.length > 2;
			if ( crossing ) this.panoramas = [ P[ 1 ], P[ 2 ], P[ 0 ] ];
			else [ P[ 0 ], P[ 1 ] ] = [ P[ 1 ], P[ 0 ] ];
			this.panorama = this.panoramas[ 0 ];
			if ( S.cloudsView.value === S.cloudsPanorama.value ) S.cloudsView.value = this.panorama.texture;
			S.cloudsPanorama.value = this.panorama.texture;
			S.cloudsPanoramaPrev.value = crossing ? this.panoramas[ 2 ].texture : this.panorama.texture;
			S.cloudsSwap.value = crossing ? 0 : 1;

		}

		// fade in once the first panorama is complete
		if ( this.panoWarm === 0 ) this.fade.value = Math.min( 1, this.fade.value + dt * 2 );
		if ( this.shadowMap ) this._shadow( camera );

		const underwater = G.cameraUnderwater.value > 0.5;
		if ( ! q.view || underwater ) {

			// the sky is only seen through Snell's window (panorama), or the tier has no view trace
			this.viewValid.value = 0;
			this.historyValid = false;

		} else {

			// after a camera cut (or a new light) the history is rebuilt at REBUILD_SLOTS slots per frame,
			// each fresh sample replacing the upsampled one (Tidewater's earlier clouds did the same): no
			// blocky clouds for a whole lattice cycle
			const size = this._drawingBufferSize();
			const lat = q.lattice, cycle = lat * lat;
			if ( ! this.historyValid ) this._rebuild = 0;
			const slots = this._rebuild < cycle ? Math.min( REBUILD_SLOTS, cycle - this._rebuild ) : 1;
			U.scfViewport.value = [ size.x * this.resolutionScale, size.y * this.resolutionScale, this.historyWidth, this.historyHeight ];
			U.scfMarch.value = [ q.stepMeters, q.maxSteps, q.lightTaps, q.fullLightingAlpha ];
			for ( let k = 0; k < slots; k ++ ) {

				if ( k > 0 ) {

					// no camera motion or drift between the traces of one frame
					U.scfPreviousPosition.value = cur.position; U.scfPreviousRight.value = cur.right; U.scfPreviousUp.value = cur.up; U.scfPreviousForward.value = cur.forward;
					U.scfWindDelta.value = [ 0, 0, 0, 0 ];

				}

				// sampling lattice (Morton-style permutation over the cycle)
				const index = this._slotIndex ++ % cycle;
				let lx = 0, ly = 0;
				for ( let bit = 0; ( 1 << bit ) < lat; bit ++ ) {

					const pair = ( index >> ( bit * 2 ) ) & 3;
					lx |= ( ( pair >> 1 ) ^ ( pair & 1 ) ) << ( Math.log2( lat ) - bit - 1 );
					ly |= ( pair & 1 ) << ( Math.log2( lat ) - bit - 1 );

				}

				U.scfSampling.value = [ lx, ly, lat, this.historyValid ? 1 : 0 ];
				U.scfClock.value = [ this._slotIndex % 4096, this._elapsed, dt, 0 ];
				U.scfTemporal.value = [ q.historyWeight, Math.min( 1, P.wind.evolutionSpeed * dt / 100 ), this._rebuild < cycle ? 1 : 0, 0 ];

				this.tracePass.render( r, this.source );
				const out = this.history[ this._pp ], last = this.history[ 1 - this._pp ];
				const ru = this.resolvePass.uniforms;
				ru.scPreviousColor.value = last.textures[ 0 ];
				ru.scPreviousMeta.value = last.textures[ 1 ];
				this.resolvePass.render( r, out );
				this.passes += 2;
				this.sampleUniforms.cloudsView.value = out.textures[ 0 ];
				this._pp = 1 - this._pp;
				this.historyValid = true;
				this._rebuild ++;

			}

			const V = this.viewCam;
			V.right.value.set( R[ 0 ], R[ 1 ], R[ 2 ] );
			V.up.value.set( Up[ 0 ], Up[ 1 ], Up[ 2 ] );
			V.fwd.value.set( Fw[ 0 ], Fw[ 1 ], Fw[ 2 ] );
			V.tan.value.set( tanY * aspect, tanY );
			this.viewValid.value = 1;

		}

		this.frameIndex ++;

	}

	// (high) the shadow map: a quarter of its rows a frame around a centre snapped to 4 texels; all of
	// them when the centre moves on (or the first time). It fades in with the clouds.
	_shadow( camera ) {

		const A = this.shadowArea.value, t = this.shadowMap, cell = SHADOW_SIZE / SHADOW_RES * 4;
		const cx = Math.round( camera.position.x / cell ) * cell, cz = Math.round( camera.position.z / cell ) * cell;
		const all = ! this._shadowMade || cx !== A.x || cz !== A.y;
		A.set( cx, cz, SHADOW_SIZE, 0.85 * this.fade.value );
		if ( ! all ) {

			const rows = SHADOW_RES / 4;
			t.scissor.set( 0, this._shadowRow * rows, SHADOW_RES, rows );
			t.scissorTest = true;
			this._shadowRow = ( this._shadowRow + 1 ) % 4;

		}

		this.shadowPass.render( this.renderer, t, false );
		t.scissorTest = false;
		this._shadowMade = true;
		this.passes ++;

	}

	// (Salt Life) a grey sky and (M9) rain's deck (cloudLook); its base lower in rain, and the cirrus lost
	// above it
	_setOvercast( o, storm = 0 ) {

		const U = this.uniforms, k = cloudLook( o, storm, _look );
		this._alt = PRESET.shape.altitude - STORM.lower * storm; // ((M13) and a hurricane's: update)
		this._deeper = STORM.deeper * storm;
		U.scsShell.value[ 2 ] = k[ 0 ];
		U.scsBase.value[ 0 ] = k[ 1 ];
		U.scsErosion.value[ 0 ] = k[ 2 ];
		U.scsErosion.value[ 1 ] = k[ 3 ];
		U.scsCloudLight.value[ 0 ] = k[ 4 ];
		U.scsCloudLight.value[ 2 ] = k[ 5 ];
		U.scsShadow.value[ 0 ] = k[ 6 ];
		this.cirrus.amount.value = this._cirrus * ( 1 - 0.85 * Math.max( o, storm ) );

	}

	resetHistory() {

		this.historyValid = false;

	}

	invalidate() {

		if ( this.ready ) this.panoWarm = this.warmFrames;
		this.resetHistory();

	}

	// (M14) the showers about the island (Weather.showers: { x, z, r, rain, thunder, n }, x and z from the
	// island's middle), each its own cloud towering over it: the storm map (stormMap), made again every
	// CB.every s, a few cells a frame (and at once when `now`: a jump of the clock, a pick), and slid on
	// between as they drift (as fast as they did between the last two)
	setStorms( cells, dt, now = false ) {

		const U = this.uniforms, job = this._stormJob, S = this._stormDrift;
		this._stormT -= dt;
		S.clock += dt;
		// (their turrets' billows rising as they boil)
		U.scsStormDrift.value.z += CB.boil * dt;
		if ( now || ( job.at < 0 && this._stormT <= 0 ) ) {

			// (the cells as they are now: each frame's are filled again)
			this._stormT = CB.every;
			const up = this.upper.value, list = job.cells;
			list.length = cells.length;
			for ( let i = 0; i < cells.length; i ++ ) {

				const c = cells[ i ], d = list[ i ] || ( list[ i ] = {} );
				d.x = c.x; d.z = c.z; d.r = c.r; d.rain = c.rain; d.thunder = c.thunder; d.n = c.n; d.band = c.band || 0;

			}

			job.at = 0; job.towers = 0; job.time = S.clock; job.now = now;
			job.args = [ up.x, up.y, U.scsShell.value[ 0 ], U.scsShell.value[ 1 ], Math.max( 0, U.scsEye.value.w ) ];

		}

		// (into the back map, a few cells a frame (all at once when `now`), then swapped in)
		if ( job.at >= 0 ) {

			const to = now ? job.cells.length : job.at + STORM_CELLS;
			job.towers += stormMap( job.cells, job.back, ...job.args, job.at, to );
			job.at = to;
			if ( job.at >= job.cells.length ) {

				job.at = - 1;
				// (how far they've drifted since the last map, each matched by which it is, and how fast: not
				// over a jump)
				// ((M14) in a hurricane, its bands' cells: they go with it, and they're what's drawn)
				const was = this._stormWas, banded = job.cells.some( ( c ) => c.band );
				let dx = 0, dz = 0, k = 0;
				for ( const c of job.cells ) if ( c.band || ! banded ) for ( const w of was ) if ( w.n === c.n ) {

					dx += c.x - w.x; dz += c.z - w.z; k ++;
					break;

				}

				if ( k > 0 ) {

					S.x += dx / k; S.z += dz / k;
					if ( ! job.now && job.time > S.time ) { S.vx = dx / k / ( job.time - S.time ); S.vz = dz / k / ( job.time - S.time ); }

				}
				S.time = job.time;
				was.length = job.cells.length;
				job.cells.forEach( ( c, i ) => {

					const w = was[ i ] || ( was[ i ] = {} );
					w.n = c.n; w.x = c.x; w.z = c.z;

				} );
				const front = this.stormData;
				this.stormData = this.stormTexture.image.data = job.back;
				job.back = front;
				this.towers = job.towers;
				U.scsStorm.value.w = this.towers > 0 ? 1 : 0;
				U.scsStormWind.value.x = job.args[ 0 ];
				U.scsStormWind.value.y = job.args[ 1 ];
				this.stormTexture.needsUpdate = true;

			}

		}

		// (the map slid on as far as they've drifted since it was made, and their turrets' billows with them)
		const t = Math.min( S.clock - S.time, 2 * CB.every ), ox = S.vx * t, oz = S.vz * t;
		U.scsStorm.value.x = ox; U.scsStorm.value.y = oz;
		U.scsStormDrift.value.x = S.x + ox; U.scsStormDrift.value.y = S.z + oz;

	}

	// (M14) Playing together, the host's clouds are everyone's (Together): where they've drifted to and
	// how far they've evolved, the cirrus's drift and the storms' turrets' (their noise), to send; and
	// another's, followed (sent `late` s ago): the cumulus's difference taken up over FOLLOW_S, or at once
	// when they're far apart (someone joining: a whole new panorama); the cirrus's and the turrets' at once
	driftState() {

		const S = this._stormDrift, c = this.cirrus._offset, r = ( v ) => Math.round( v * 10 ) / 10;
		return [ r( this._windX ), r( this._windZ ), r( this._evoX ), r( this._evoZ ), c ? r( c.x ) : 0, c ? r( c.y ) : 0, r( S.x ), r( S.z ), r( this.uniforms.scsStormDrift.value.z ) ];

	}

	followDrift( d, late = 0 ) {

		if ( ! Array.isArray( d ) || d.length < 9 || ! d.every( Number.isFinite ) ) return;
		const v = this._driftV, mine = [ this._windX, this._windZ, this._evoX, this._evoZ ];
		const diff = [ 0, 1, 2, 3 ].map( ( i ) => d[ i ] + v[ i ] * late - mine[ i ] );
		if ( Math.hypot( diff[ 0 ], diff[ 1 ] ) > FOLLOW_JUMP ) {

			this._windX += diff[ 0 ]; this._windZ += diff[ 1 ]; this._evoX += diff[ 2 ]; this._evoZ += diff[ 3 ];
			this._follow = null;
			this.invalidate();

		} else this._follow = { d: diff, left: FOLLOW_S };

		if ( this.cirrus._offset ) this.cirrus._offset.set( d[ 4 ], d[ 5 ] );
		const S = this._stormDrift;
		S.x = d[ 6 ]; S.z = d[ 7 ];
		this.uniforms.scsStormDrift.value.z = d[ 8 ];

	}

	// (M9) the cloud's base (m): where rain falls from, and a bolt (lower in rain's deck)
	get base() {

		return this.uniforms.scsShell.value[ 0 ];

	}

	// GPU memory of the clouds' targets (bytes)
	get memory() {

		const q = this.quality;
		let b = NOISE_RES ** 3 * 4 * 8 / 7 + q.weather ** 2 + BOUNDS_RES ** 2 + CB.res ** 2 * 4 + q.pano[ 0 ] * q.pano[ 1 ] * 9 * this.panoramas.length + this.cirrus.memory;
		if ( q.view ) b += this.sourceWidth * this.sourceHeight * 12 + this.historyWidth * this.historyHeight * 12 * 2;
		if ( this.shadowMap ) b += SHADOW_RES * SHADOW_RES * 2;
		return Math.round( b );

	}

	dispose() {

		for ( const t of [ this.noise, this.weatherMap, this.weatherBounds, ...this.panoramas, this.panoSlot, this.source, ...( this.history || [] ), this.shadowMap ] ) if ( t ) t.dispose();
		for ( const p of this.passList ) p.dispose();
		this.stormTexture.dispose();
		if ( this._stormHeld ) this._stormHeld.dispose();
		this.cirrus.dispose();

	}

}
