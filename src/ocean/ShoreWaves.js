import * as THREE from '../engine/index.js';
import { G, GRAVITY } from '../core/Globals.js';

// Depth-aware shoreline waves (Tidewater's ShoreWaves, its WGSL translated to GLSL, plus a CPU
// mirror for the water queries).
//
// Wave phase comes from the precomputed travel-time field (ShoreField: refraction around headlands,
// fronts aligning with depth contours). Each individual wave m has its own height (sets + along-shore
// variation). Height grows in shallow water (Green's law) until H > gamma * depth. The wave then
// plunges: the front face turns into a vertical, concave wall under the crest, the tube collapses
// where the lip lands and the wave continues as a turbulent bore, which finally runs up the beach
// as a thin swash sheet whose leading edge advances and retreats (vertical run-up R(t) compared
// against the sand height).
//
// GLSL (this.glsl, needs terrainHeightAt( xz ) from the terrain; uniforms: this.uniforms):
//   struct ShoreSample { disp, nShore, env, foam, breaking, u, dir, exposure, swashLevel, swashCovered,
//                        thick, swashFoam, runup, inland, face, roller, meanFoam, lam }
//   ((M14) meanFoam: the white the breakers leave there on average, for where the water's grid is too
//   coarse to draw them, seen from afar: the breaker line and the whitewater inside it; lam: their length)
//   ShoreSample shoreEvaluate( vec2 xz, float depth, float groundH )        (with the normal: the water mesh)
//   vec4 terrainShoreSample( vec2 xz )        the shore field ( T, dir * exposure, shoreline T )
//   vec4 shoreSwashEdge( vec2 xz, float t )   ( clipped film thickness, distance to the swash front, tau, Rt )
//   float shoreSurfTurbidity( vec2 xz, float depth )   how milky the surf zone is there (0..1; (M11) more
//                                                      and further out in a big surf: shoreMilk)
// CPU: sample( x, z, t, groundH ) -> { y, swashLevel, env } for WaterQuery.
// (Salt Life) setSurf( amplitude, period ): the weather's surf (Weather.js). The waves' phase runs on a
// clock re-anchored whenever the period changes (phase( t, T ), timeOf( s, T ); the GPU's shoreClock,
// set each frame by update( t )): a wave carries on from where it was, only the crests' spacing changes.
// As ( t - T ) / period, with T in the thousands of seconds, a new period would set the breakers racing.
// (M12) Two swells: the island's own (from the south: `field`) and, once its field is given
// (addField), a westerly's, each a train of waves with its field, height, period and clock
// (ShoreTrain; this.trains). setSurf( amplitude, period, west ) shares the weather's surf between them:
// as a westerly's swell comes in the south's dies down to a background groundswell, and the two cross,
// each breaking where it does (their heights add, the foam and the swash are whichever's more). The
// second costs nothing until it's running (a uniform branch). params, phase(), timeOf() and clock()
// are the south's; `surf` is the weather's.
// (M14) A third, the north shore's sea (the trades' own, Weather.NORTH: addField( field, 2 ), setNorth):
// breaking on the island's windward side, apart from the bay's two (it takes none of their surf), as a
// westerly's does; a uniform branch too, and on the GPU only where its field reaches (its exposure).
// (M13) A storm surge: the sea's level (G.seaLevel) rises over the beach, and the shore field solved at
// its sea level wouldn't know the water there. So a hurricane's surge gets a field of its own, solved at
// its highest (setSurgeField: a worker's, before it comes), and the island's own swell reads the two
// blended as far as the sea's risen toward it (surgeMix): the waves run on over the flooded beach as they
// would in water that deep. At the usual sea level it's the island's own field alone, as it always was.
// (M12) The surf's currents and its breakers, for a swimmer (CPU: currentAt, breakerAt): the rips,
// seaward through the bar's channels (shoreBar) from where you can't stand out past the breakers, fed by
// currents along the beach inside them, as strong as the breakers there; and the breaker a swimmer's
// in, each one that passes over (the bigger swell's). On the GPU the rips' water is milkier, in a plume
// out past the breakers (shoreSurfTurbidity).

const TAU = Math.PI * 2;
const BEACH_SLOPE = 0.066; // run-up is converted to a horizontal excursion with this slope
const SWASH_UP = 0.4, SWASH_DOWN = 0.55; // fractions of the period: uprush, backwash
const SWASH_OVERSHOOT = 1.2; // the mesh sheet reaches this far (m) past the leading edge
const FAIR_AMPLITUDE = 0.34; // (Salt Life) the surf on a fair day (params.amplitude), run-up 1
const FAIR_PERIOD = 9; // (and its period, s)
// (M11) the surf zone's water is milky to this depth (m) on a fair day (deeper, and milkier, in a big
// surf: its turbidity goes as the surf's height, and so does the depth the breakers stand in), at most
// this much milkier than a fair day's
const FAIR_TURBIDITY = 0.16;
const MILK_DEPTH = 4.5;
const MILK_MAX = 1.8;
// (M12) under a westerly's swell, the south's background groundswell: as high as a calm day's surf (at
// most), and as long
const BACKGROUND = [ 0.24, 10 ];
// (M12) the rips: m/s for each metre of the breakers' height (MacMahan et al. 2006: a few tenths of a
// m/s in 2-3 ft of surf, near 1 in a big one's pulses), pulsing with the sets (x RIP_PULSE[ 0 ] .. + [ 1 ]);
// the feeders along the beach at FEED of that; the depths they run from (m: from where you can't stand,
// in full from the next), and out to (x the breakers' depth: their neck, and their head beyond)
const RIP = 0.5;
const RIP_PULSE = [ 0.7, 0.8 ];
const FEED = 0.45;
const RIP_DEPTH = [ 1.0, 1.6 ];
const RIP_OUT = [ 1.3, 2.6 ];
// a breaker this high (m, trough to crest: breakerAt) tumbles a swimmer it breaks on (Player): all but
// never on a fair day (one in thousands), now and then in a blustery surf, one in seven of a gale's
export const TUMBLE_H = 2.8;
// how milky a rip's plume is (of the surf zone's), and how far past the breakers it reaches (x their depth)
const RIP_MILK = 0.7;
const RIP_REACH = 2.2;

// (M14) where northNear looks: the point, and r off it each way
const NEAR = [ [ 0, 0 ], [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ];

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// (M12) one swell's waves on the shore: its field (the travel times and directions it's refracted
// along), its height (offshore amplitude, H/2) and period, its run-up, and its clock
class ShoreTrain {

	constructor( field, amplitude = FAIR_AMPLITUDE, period = FAIR_PERIOD, slot = 0 ) {

		this.field = field;
		this.slot = slot; // (0: the south's, 1: a westerly's, (M14) 2: the north shore's)
		this.texture = fieldTexture( field );
		this.surge = null; // (M13) { field, level, texture }: a surge's (the island's own swell's only)
		this.amplitude = amplitude;
		this.period = period;
		this.runup = 1;
		// (Salt Life) the clock: clock( t ) = c0 + ( t - t0 ) / period; at the start, ( t - ref ) / period,
		// so a wave's phase there, clock( t ) - ( T - ref ) / period, is ( t - T ) / period as it always was.
		// ref: the travel time at the bay's middle (there a change of period moves nothing)
		this.ref = this.fieldAt( 0, 0 )[ 0 ];
		this._t0 = 0;
		this._c0 = - this.ref / period;

	}

	// its height and period: the clock carries on from where it is, at the new pace. Run-up goes as
	// sqrt( H L ) (Stockdon 2006), L as the period squared: so as the root of their height, not in
	// proportion (a big swell doesn't flood the beach), and in proportion to the period (a long
	// groundswell runs further up); today's surf runs up as it always has
	set( amplitude, period, t ) {

		if ( period !== this.period ) {

			this._c0 = this.clock( t );
			this._t0 = t;
			this.period = period;

		}

		this.amplitude = amplitude;
		this.runup = amplitude > 0 ? Math.sqrt( FAIR_AMPLITUDE / amplitude ) * period / FAIR_PERIOD : 0;

	}

	// the waves' clock at time t (in waves); a wave's phase at a point whose travel time is T; and when a
	// phase s comes to it
	clock( t ) {

		return this._c0 + ( t - this._t0 ) / this.period;

	}

	phase( t, T ) {

		return this.clock( t ) - ( T - this.ref ) / this.period;

	}

	timeOf( s, T ) {

		return this._t0 + ( s + ( T - this.ref ) / this.period - this._c0 ) * this.period;

	}

	// the field at a point (bilinear): [ T, dirX * exposure, dirZ * exposure, shoreline T ]; (M13) blended
	// with a surge's field as far as the sea's risen toward the level it was solved at
	fieldAt( x, z, out = [ 0, 0, 0, 0 ] ) {

		sampleField( this.field, x, z, out );
		const m = this.surgeMix();
		if ( m > 0 ) {

			const o = sampleField( this.surge.field, x, z, this._surgeAt || ( this._surgeAt = [ 0, 0, 0, 0 ] ) );
			for ( let c = 0; c < 4; c ++ ) out[ c ] += ( o[ c ] - out[ c ] ) * m;

		}

		return out;

	}

	// (M13) how far the sea's risen toward the surge field's level (0: none, or no field)
	surgeMix() {

		const S = this.surge;
		return S ? Math.min( 1, Math.max( 0, G.seaLevel.value / S.level ) ) : 0;

	}

}

// a shore field at a point (bilinear), into out
function sampleField( F, x, z, out ) {

	const res = F.res, d = F.data;
	const fx = Math.min( Math.max( ( x - F.origin ) / F.size * res - 0.5, 0 ), res - 1.001 );
	const fz = Math.min( Math.max( ( z - F.origin ) / F.size * res - 0.5, 0 ), res - 1.001 );
	const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
	const k00 = ( j * res + i ) * 4, k10 = k00 + 4, k01 = k00 + res * 4, k11 = k01 + 4;
	for ( let c = 0; c < 4; c ++ ) out[ c ] = ( d[ k00 + c ] * ( 1 - tx ) + d[ k10 + c ] * tx ) * ( 1 - tz ) + ( d[ k01 + c ] * ( 1 - tx ) + d[ k11 + c ] * tx ) * tz;
	return out;

}

const fieldTexture = ( field ) => {

	const tex = new THREE.DataTexture( field.data, field.res, field.res, THREE.RGBAFormat, THREE.FloatType );
	tex.minFilter = tex.magFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	return tex;

};

export class ShoreWaves {

	// field: computeShoreField() output { data (RGBA float), res, origin, size }: the island's own swell's
	constructor( { field } ) {

		const home = new ShoreTrain( field );
		this.trains = [ home ];
		this.field = field;
		this.texture = home.texture;
		this.surf = FAIR_AMPLITUDE; // (M12) the weather's surf (both swells': the fish, the sound)
		this.west = 0; // (M12) its share from the west (setSurf)
		this.north = [ 0, FAIR_PERIOD ]; // (M14) the north shore's sea: its height and period (setNorth)

		this.params = {
			period: FAIR_PERIOD,
			amplitude: FAIR_AMPLITUDE, // offshore amplitude (H/2)
			variation: 0.55,
			gamma: 0.78,
			// fraction of the break depth over which the lip plunges (peeling shoulders, not vertical cuts)
			breakSpan: 0.13,
			curl: 1.0,
			runup: 1.0,
			enabled: 1.0,
			turbidity: 0.16, // sediment + bubble scattering in the surf zone (1/m), on a fair day ((M11) the
			// surf stirs it in proportion to its height: setSurf)
		};
		this.uniforms = {
			shoreTex: { value: home.texture },
			shoreInfo: { value: new THREE.Vector4( field.origin, field.origin, field.size, field.res ) },
			shoreTime: G.time,
			// (Salt Life) the waves' clock: clock( t ), and the travel time it's counted from (the bay's
			// middle: there a change of period moves nothing)
			shoreClock: { value: 0 },
			shoreRef: { value: home.ref },
			shoreSeaLevel: G.seaLevel,
			// period, amplitude, variation, gamma
			shoreP0: { value: new THREE.Vector4() },
			// breakSpan, curl, runup, enabled
			shoreP1: { value: new THREE.Vector4() },
			// (M11) the surf zone's milk: its turbidity, of a fair day's; the depth it reaches (m: where the
			// breakers stand, deeper in a bigger surf)
			shoreMilk: { value: new THREE.Vector4( 1, MILK_DEPTH, 0, 0 ) },
			// (M12) the second swell: its field (the first's until it's given), its clock, ref, period and
			// amplitude (0: not running), and its run-up
			shoreTex2: { value: home.texture },
			shoreTrain2: { value: new THREE.Vector4( 0, 0, FAIR_PERIOD, 0 ) },
			shoreRunup2: { value: 0 },
			// (M14) the third, the north shore's: as the second's
			shoreTex3: { value: home.texture },
			shoreTrain3: { value: new THREE.Vector4( 0, 0, FAIR_PERIOD, 0 ) },
			shoreRunup3: { value: 0 },
			// (M13) a surge's field (the island's own until it's given), and the sea level it was solved at
			// (0: none)
			shoreTexS: { value: home.texture },
			shoreSurgeLevel: { value: 0 },
		};
		this.syncUniforms();
		this.glsl = SHORE_GLSL;
		this.update( G.time.value );

	}

	// (M12) the second swell's field (a westerly's: computeShoreField with its direction), once it's
	// solved. Its waves stay flat until setSurf gives them a share. (M14) Or the third's (slot 2: the north
	// shore's, along Weather.NORTH.dir, its lee taken out: ShoreField.shelter), as high as setNorth has it
	addField( field, slot = 1 ) {

		if ( this.trains[ slot ] ) return;
		const train = new ShoreTrain( field, 0, slot === 2 ? this.north[ 1 ] : this.trains[ 0 ].period, slot );
		this.trains[ slot ] = train;
		this.uniforms[ slot === 2 ? 'shoreTex3' : 'shoreTex2' ].value = train.texture;
		if ( slot === 2 ) this.setNorth( this.north[ 0 ], this.north[ 1 ], G.time.value, true );
		else this.setSurf( this.surf, this.trains[ 0 ].period, this.west, G.time.value, true );

	}

	// (M14) the north shore's sea (Weather's north, northPeriod): its height (offshore amplitude, m) and
	// period, on its own train's clock once its field's given. The bay's surf is setSurf's
	setNorth( amplitude, period, t = G.time.value, force = false ) {

		if ( ! force && amplitude === this.north[ 0 ] && period === this.north[ 1 ] ) return;
		this.north[ 0 ] = amplitude;
		this.north[ 1 ] = period;
		const train = this.trains[ 2 ];
		if ( ! train ) return;
		train.set( amplitude, period, t );
		this.syncUniforms();
		this.update( t );

	}

	// (M13) a surge's field for the island's own swell (computeShoreField at the sea level `level`, m), or
	// null to drop it once the surge's gone. The waves read it as far as the sea's risen toward `level`
	setSurgeField( field, level = 0 ) {

		const home = this.trains[ 0 ], U = this.uniforms;
		if ( home.surge ) home.surge.texture.dispose();
		home.surge = field && level > 0 ? { field, level, texture: fieldTexture( field ) } : null;
		U.shoreTexS.value = home.surge ? home.surge.texture : home.texture;
		U.shoreSurgeLevel.value = home.surge ? level : 0;

	}

	// (Salt Life) the surf the weather brings: the waves' offshore amplitude and their period; (M12) and
	// how much of it comes from the west (0..1: the second swell's, once it has a field; the south's dies
	// down to its background groundswell as it comes in)
	setSurf( amplitude, period = this.params.period, west = 0, t = G.time.value, force = false ) {

		const [ home, other ] = this.trains, P = this.params;
		const w = other ? west : 0;
		if ( ! force && amplitude === this.surf && period === this._period && w === this.west ) return;
		this.surf = amplitude;
		this._period = period;
		this.west = w;
		home.set( lerp( amplitude, Math.min( amplitude, BACKGROUND[ 0 ] ), w ), lerp( period, BACKGROUND[ 1 ], w ), t );
		if ( other ) other.set( amplitude * w, period, t );
		P.period = home.period;
		P.amplitude = home.amplitude;
		P.runup = home.runup;
		P.turbidity = FAIR_TURBIDITY * Math.min( MILK_MAX, amplitude / FAIR_AMPLITUDE );
		this.syncUniforms();
		this.update( t );

	}

	// (Salt Life) the waves' clock at time t (in waves); a wave's phase at a point whose travel time is T;
	// and when a phase s comes to it (the south's)
	clock( t ) {

		return this.trains[ 0 ].clock( t );

	}

	phase( t, T ) {

		return this.trains[ 0 ].phase( t, T );

	}

	timeOf( s, T ) {

		return this.trains[ 0 ].timeOf( s, T );

	}

	// each frame: the GPU's clocks
	update( t = G.time.value ) {

		this.uniforms.shoreClock.value = this.trains[ 0 ].clock( t );
		const other = this.trains[ 1 ], north = this.trains[ 2 ];
		if ( other ) this.uniforms.shoreTrain2.value.x = other.clock( t );
		if ( north ) this.uniforms.shoreTrain3.value.x = north.clock( t );

	}

	syncUniforms() {

		const p = this.params, U = this.uniforms;
		U.shoreP0.value.set( p.period, p.amplitude, p.variation, p.gamma );
		U.shoreP1.value.set( p.breakSpan, p.curl, p.runup, p.enabled );
		const nA = this.trains[ 2 ] ? this.north[ 0 ] : 0;
		U.shoreMilk.value.set( p.turbidity / FAIR_TURBIDITY, MILK_DEPTH * Math.max( 1, this.surf / FAIR_AMPLITUDE ),
			Math.min( MILK_MAX, nA / FAIR_AMPLITUDE ), nA > 0.005 ? MILK_DEPTH * Math.max( 1, nA / FAIR_AMPLITUDE ) : 0 );
		const other = this.trains[ 1 ], north = this.trains[ 2 ];
		if ( other ) {

			U.shoreTrain2.value.set( other.clock( G.time.value ), other.ref, other.period, other.amplitude > 0.005 ? other.amplitude : 0 );
			U.shoreRunup2.value = other.runup;

		}

		if ( north ) {

			U.shoreTrain3.value.set( north.clock( G.time.value ), north.ref, north.period, north.amplitude > 0.005 ? north.amplitude : 0 );
			U.shoreRunup3.value = north.runup;

		}

	}

	// ------------------------------------------------------------------ CPU mirror (water queries)

	// the shore field at a point (bilinear): [ T, dirX * exposure, dirZ * exposure, shoreline T ] (the
	// south's)
	fieldAt( x, z, out = [ 0, 0, 0, 0 ] ) {

		return this.trains[ 0 ].fieldAt( x, z, out );

	}

	// (M12) the trains running: the south's, and the second while it has a height; (M14) and the third
	_running( out ) {

		out.length = 0;
		out.push( this.trains[ 0 ] );
		for ( let i = 1; i < this.trains.length; i ++ ) {

			const tr = this.trains[ i ];
			if ( tr && tr.amplitude > 0.005 ) out.push( tr );

		}

		return out;

	}

	// (Salt Life) the swash on the sand at (x, z): the run-up of the most recent wave and the point's
	// own distance up the beach (both in metres up the beach at the nominal slope), how fast the edge
	// moves (dRt/dt, > 0 while the water runs up) and the swash cycle's phase. For the shorebirds
	// (wildlife/SwashProbe): Tidewater evaluated this on the GPU and read it back. (M12) Of two swells,
	// whichever's run further up
	swash( x, z, t, groundH, out = {} ) {

		const P = this.params, sh = this._shs || ( this._shs = [ 0, 0, 0, 0 ] );
		let best = - Infinity;
		for ( const tr of this._running( this._live || ( this._live = [] ) ) ) {

			tr.fieldAt( x, z, sh );
			const exposure = Math.hypot( sh[ 1 ], sh[ 2 ] );
			const dx = sh[ 1 ] / Math.max( exposure, 1e-4 ), dz = sh[ 2 ] / Math.max( exposure, 1e-4 );
			const along = x * - dz + z * dx;
			let tau = 0;
			const runup = ( tt ) => {

				const ssw = tr.phase( tt, sh[ 3 ] ) + wobble( along );
				const ms = Math.floor( ssw );
				tau = ssw - ms;
				const Am = this.waveAmp( ms, along, tr.amplitude );
				const RhMax = Am * 2.1 * tr.runup * sat( exposure * 1.4 ) / BEACH_SLOPE;
				const su = sat( tau / SWASH_UP ), sb = sat( ( tau - SWASH_UP ) / SWASH_DOWN );
				const Rh = ( tau < SWASH_UP ? 1 - Math.pow( 1 - su, 1.5 ) : 1 - Math.pow( sb, 1.6 ) ) * RhMax - 0.3;
				const lobes = Math.sin( along * 0.61 + ms * 2.3 ) * 0.5 + Math.sin( along * 1.73 + ms * 5.1 ) * 0.3 + Math.sin( along * 4.3 + ms * 1.7 ) * 0.2;
				return Math.max( Rh + lobes * ( Math.max( Rh, 0 ) * 0.07 + 0.35 ), 0.35 ) * P.enabled;

			};

			const r1 = runup( t + 0.05 ), r0 = runup( t );
			if ( r0 <= best ) continue;
			best = r0;
			out.tau = tau;
			out.runup = r0;
			out.dRdt = ( r1 - r0 ) / 0.05;

		}

		out.inland = Math.max( groundH - G.seaLevel.value, 0 ) / BEACH_SLOPE;
		return out;

	}

	// the shore wave's height (m, relative to sea level, times its envelope) and the swash sheet's
	// level at (x, z): the same as the GLSL shoreEvaluate() for a parcel resting there. (M12) Two
	// swells' heights add; the swash is whichever's higher, the envelope whichever's more
	sample( x, z, t, groundH, terrain ) {

		const out = this._out || ( this._out = { y: 0, swashLevel: - 1e4, env: 0 } );
		out.y = 0;
		out.env = 0;
		out.swashLevel = - 1e4;
		if ( G.seaLevel.value - groundH > 26 || this.params.enabled <= 0 ) return out;
		for ( const tr of this._running( this._live || ( this._live = [] ) ) ) this._sampleTrain( tr, x, z, t, groundH, terrain, out );
		return out;

	}

	_sampleTrain( tr, x, z, t, groundH, terrain, out ) {

		const P = this.params;
		const sea = G.seaLevel.value;
		const d = sea - groundH;
		const sh = tr.fieldAt( x, z, this._sh || ( this._sh = [ 0, 0, 0, 0 ] ) );
		const exposure = Math.hypot( sh[ 1 ], sh[ 2 ] );
		const dx = sh[ 1 ] / Math.max( exposure, 1e-4 ), dz = sh[ 2 ] / Math.max( exposure, 1e-4 );
		const along = x * - dz + z * dx;
		const s = tr.phase( t, sh[ 0 ] ) + wobble( along );
		const c = Math.sqrt( clamp( d, 0.3, 25 ) * GRAVITY ), lam = c * tr.period;
		const m = Math.floor( s + 0.5 ), u = s - m;
		const A0 = this.waveAmp( m, along, tr.amplitude ), An = this.waveAmp( m + Math.sign( u ), along, tr.amplitude );
		const A = A0 + ( An - A0 ) * smooth( 0.32, 0.5, Math.abs( u ) ) * 0.5;
		// the breaking state comes from the depth under the wave's crest
		const dc = sea - terrain.heightAt( x + dx * u * lam, z + dz * u * lam );
		const dB = dc + ( d - dc ) * smooth( 0.3, 0.5, Math.abs( u ) );
		const env = smooth( 26, 13, d ) * smooth( - 0.25, 0.05, d ) * sat( exposure * 1.4 ) * P.enabled;
		out.env = Math.max( out.env, env );
		out.y += this.profileY( u, A, dB, lam ) * env;
		// swash run-up of the most recent wave on the sand
		const inland = Math.max( groundH - sea, 0 ) / BEACH_SLOPE;
		const ssw = tr.phase( t, sh[ 3 ] ) + wobble( along );
		const ms = Math.floor( ssw ), tau = ssw - ms;
		const Am = this.waveAmp( ms, along, tr.amplitude );
		const RhMax = Am * 2.1 * tr.runup * sat( exposure * 1.4 ) / BEACH_SLOPE;
		const su = sat( tau / SWASH_UP ), sb = sat( ( tau - SWASH_UP ) / SWASH_DOWN );
		const Rh = ( tau < SWASH_UP ? 1 - Math.pow( 1 - su, 1.5 ) : 1 - Math.pow( sb, 1.6 ) ) * RhMax - 0.3;
		const lobes = Math.sin( along * 0.61 + ms * 2.3 ) * 0.5 + Math.sin( along * 1.73 + ms * 5.1 ) * 0.3 + Math.sin( along * 4.3 + ms * 1.7 ) * 0.2;
		const Rt = Math.max( Rh + lobes * ( Math.max( Rh, 0 ) * 0.07 + 0.35 ), 0.35 ) * P.enabled;
		const fm = Rt - inland + SWASH_OVERSHOOT;
		const thick = clamp( Math.min( fm * 0.3, Math.max( fm - 0.1, 0 ) * ( BEACH_SLOPE * 0.22 ) + 0.03 ), - 0.1, 0.12 );
		out.swashLevel = Math.max( out.swashLevel, groundH + thick );
		return out;

	}

	// (M14) the north shore's sea reaching about (x, z): its height (m) as far as its field reaches there or
	// `r` m off (on land, the bluff over it), for the surf's far roar; 0 with none
	northNear( x, z, r = 60 ) {

		const tr = this.trains[ 2 ];
		if ( ! tr || tr.amplitude <= 0.005 ) return 0;
		const sh = this._shn || ( this._shn = [ 0, 0, 0, 0 ] );
		let e = 0;
		for ( const [ ox, oz ] of NEAR ) {

			tr.fieldAt( x + ox * r, z + oz * r, sh );
			e = Math.max( e, Math.hypot( sh[ 1 ], sh[ 2 ] ) );

		}

		return tr.amplitude * sat( e * 1.4 );

	}

	// (M12) the bigger swell's height reaching (x, z), as an offshore amplitude (m), and its train
	_reaching( x, z, sh ) {

		let best = 0, train = this.trains[ 0 ];
		for ( const tr of this._running( this._live || ( this._live = [] ) ) ) {

			tr.fieldAt( x, z, sh );
			const A = tr.amplitude * sat( Math.hypot( sh[ 1 ], sh[ 2 ] ) * 1.4 );
			if ( A > best ) {

				best = A;
				train = tr;

			}

		}

		this._reachTrain = train;
		return best;

	}

	// (M12) the surf's current at (x, z) (ground: the bottom's height there): out { x, z } (m/s), and rip
	// (0..1: how much of it is a rip's)
	currentAt( x, z, t, ground, out = { x: 0, z: 0, rip: 0 } ) {

		out.x = out.z = out.rip = 0;
		const P = this.params, d = G.seaLevel.value - ground;
		if ( d < RIP_DEPTH[ 0 ] || d > 26 || P.enabled <= 0 ) return out;
		const sh = this._shc || ( this._shc = [ 0, 0, 0, 0 ] );
		const A = this._reaching( x, z, sh );
		// (the bar's channels are the bottom's: along the south's field, whichever swell's breaking)
		const home = this.trains[ 0 ];
		home.fieldAt( x, z, sh );
		const exposure = Math.hypot( sh[ 1 ], sh[ 2 ] );
		if ( exposure < 0.05 || A < 0.02 ) return out;
		const dx = sh[ 1 ] / exposure, dz = sh[ 2 ] / exposure, along = x * - dz + z * dx;
		const db = Math.pow( A * 3.556 / P.gamma, 0.8 );
		const V = RIP * 2 * A * ( RIP_PULSE[ 0 ] + RIP_PULSE[ 1 ] * Math.abs( Math.sin( home.clock( t ) * Math.PI / 7 ) ) );
		const rip = bar( along ).rip, inside = smooth( RIP_DEPTH[ 0 ], RIP_DEPTH[ 1 ], d );
		const neck = rip * inside * ( 1 - smooth( db * RIP_OUT[ 0 ], db * RIP_OUT[ 1 ], d ) );
		const feed = ( 1 - rip ) * inside * ( 1 - smooth( db * 0.8, db * 1.2, d ) ) * Math.sign( barSlope( along ) ) * FEED;
		// (seaward is against the waves' way, - dir; along the beach, ( - dz, dx ))
		out.x = ( - dx * neck - dz * feed ) * V;
		out.z = ( - dz * neck + dx * feed ) * V;
		out.rip = neck;
		return out;

	}

	// (M12) the breaker at (x, z) (ground: the bottom's height), of the swell that's bigger there: out
	// { n: its crest's count (one more each wave that's passed over; another swell's are counted apart),
	// H: its height (m, trough to crest), (M14) Hb: its bore's (the whitewater it runs on as, over the
	// still water: m), b: how far it's broken (< 0 still rising, 0..1 plunging, > 1 a bore), dx, dz: the way
	// it runs }
	breakerAt( x, z, t, ground, terrain, out = { n: 0, H: 0, Hb: 0, b: - 9, dx: 0, dz: 1 } ) {

		const P = this.params, sea = G.seaLevel.value, d = sea - ground;
		out.H = out.Hb = 0;
		out.b = - 9;
		if ( d > 26 || d < - 0.2 || P.enabled <= 0 ) return out;
		const sh = this._shb || ( this._shb = [ 0, 0, 0, 0 ] );
		this._reaching( x, z, sh );
		const tr = this._reachTrain;
		tr.fieldAt( x, z, sh );
		const exposure = Math.hypot( sh[ 1 ], sh[ 2 ] );
		const dx = sh[ 1 ] / Math.max( exposure, 1e-4 ), dz = sh[ 2 ] / Math.max( exposure, 1e-4 );
		const along = x * - dz + z * dx;
		const s = tr.phase( t, sh[ 0 ] ) + wobble( along );
		const m = Math.floor( s + 0.5 ), u = s - m;
		const lam = Math.sqrt( clamp( d, 0.3, 25 ) * GRAVITY ) * tr.period;
		const A = this.waveAmp( m, along, tr.amplitude );
		const dc = sea - terrain.heightAt( x + dx * u * lam, z + dz * u * lam );
		const B = breakParams( A, dc + ( d - dc ) * smooth( 0.3, 0.5, Math.abs( u ) ), P );
		const env = smooth( 26, 13, d ) * sat( exposure * 1.4 );
		out.n = Math.floor( s ) + tr.slot * 1e7;
		out.H = B.H * env;
		out.Hb = B.Hb * env;
		out.b = B.b;
		out.dx = dx;
		out.dz = dz;
		return out;

	}

	waveAmp( m, along, amplitude = this.params.amplitude ) {

		const P = this.params;
		const waveSet = Math.abs( Math.sin( m * Math.PI / 7 ) ) * 0.6 + 0.55;
		const rnd = ( hash1( m ) - 0.5 ) * 2;
		const warp = Math.sin( along * 0.016 + m * 0.9 ) * 1.6;
		const a1 = Math.sin( along * 0.062 + m * 1.7 + warp );
		const a2 = Math.sin( along * 0.13 + m * 4.1 + 1.3 - warp * 0.7 );
		const a3 = Math.sin( along * 0.29 + m * 2.3 + warp * 0.5 ) * 0.6 + Math.sin( along * 0.47 + m * 5.9 + 0.8 ) * 0.4;
		const alongV = a1 * 0.6 + a2 * 0.4 + a3 * 0.28;
		return Math.max( amplitude * waveSet * ( 1 + rnd * P.variation * 0.5 + alongV * P.variation * 0.7 ) * bar( along ).k, 0.02 );

	}

	// the cross-section's height (shoreProfile( ... ).y)
	profileY( u, A, d, lam ) {

		const P = this.params;
		const B = breakParams( A, d, P );
		const skew = smooth( - 3, 0, B.b ) * 0.55;
		const phi = u - skew * ( 1 - Math.cos( u * TAU ) ) / TAU;
		const c = Math.max( ( Math.cos( phi * TAU ) + 1 ) * 0.5, 0 );
		const yPre = B.Ash * 2 * ( Math.pow( c, B.p ) - B.meanP ) * B.crestPeak;
		const uf = 0.09;
		const inFace = u > - uf;
		const th = clamp( - u / uf, 0, 1 ) * Math.PI / 2;
		const fy = lerp( 1 - Math.sin( th ), Math.cos( th ), B.wBore );
		const yFront = inFace ? B.ytB + ( B.ycB - B.ytB ) * fy : B.ytB;
		const cb = Math.pow( Math.max( ( Math.cos( u * TAU * 0.85 ) + 1 ) * 0.5, 0 ), B.p );
		const yBack = B.ytB + ( B.ycB - B.ytB ) * lerp( cb, Math.exp( u * - 7 ), B.wBore );
		const wC = smooth( - 0.35, 0.25, B.b ) * P.curl;
		return lerp( yPre, u < 0 ? yFront : yBack, wC );

	}

}

const clamp = ( x, a, b ) => Math.min( b, Math.max( a, x ) );
const sat = ( x ) => clamp( x, 0, 1 );
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const smooth = ( a, b, x ) => {

	const t = sat( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};
const hash1 = ( x ) => {

	const v = Math.sin( x * 127.1 + 311.7 ) * 43758.5453;
	return v - Math.floor( v );

};

// (Salt Life: bar() and breakParams() fill one object each, read at once by their callers; the CPU
// samples of the sea run them every frame)
const _bar = { k: 0, rip: 0 };
function bar( along ) {

	const w = Math.sin( along * 0.021 + 1.9 ) * 1.4 + Math.sin( along * 0.009 + 0.3 ) * 0.9;
	const r = Math.sin( along * 0.059 + w );
	const width = 0.8 + Math.sin( along * 0.017 + 4.1 ) * 0.08;
	const rip = smooth( width, 0.985, r );
	const b = 0.9 + ( Math.sin( along * 0.031 + 7.3 ) * 0.6 + Math.sin( along * 0.083 + 1.1 ) * 0.4 ) * 0.14;
	_bar.k = b * ( 1 - rip * 0.58 );
	_bar.rip = rip;
	return _bar;

}

// (M12) which way a rip channel is along the beach: > 0 toward greater `along` (where bar()'s r rises)
function barSlope( along ) {

	const w = Math.sin( along * 0.021 + 1.9 ) * 1.4 + Math.sin( along * 0.009 + 0.3 ) * 0.9;
	return Math.cos( along * 0.059 + w );

}

function wobble( along ) {

	return Math.sin( along * 0.029 + 0.7 ) * 0.07 + Math.sin( along * 0.083 + 2.1 ) * 0.035
		+ Math.sin( along * 0.19 + 0.4 ) * 0.022 + Math.sin( along * 0.37 + 2.6 ) * 0.011
		+ bar( along ).rip * 0.045;

}

const _B = { db: 0, b: 0, Ash: 0, p: 0, meanP: 0, crestPeak: 0, yc: 0, yt: 0, H: 0, wBore: 0, Hb: 0, ycB: 0, ytB: 0 };
function breakParams( A, d, P ) {

	const B = _B;
	B.db = Math.pow( A * 3.556 / P.gamma, 0.8 );
	B.b = ( B.db - d ) / ( B.db * P.breakSpan );
	const shoal = Math.pow( 10 / clamp( d, 0.35, 10 ), 0.25 );
	B.Ash = A * shoal;
	B.p = lerp( 1, 3, smooth( - 2.5, 0, B.b ) );
	B.meanP = 1 / Math.sqrt( ( B.p + 0.25 ) * Math.PI );
	B.crestPeak = 1 + smooth( - 1, 0.3, B.b ) * 0.22;
	B.yc = B.Ash * 2 * ( 1 - B.meanP ) * B.crestPeak;
	B.yt = B.Ash * - 2 * B.meanP * B.crestPeak;
	B.H = B.yc - B.yt;
	B.wBore = smooth( 0.85, 1.35, B.b );
	B.Hb = Math.min( B.H * 0.6, Math.max( d, 0 ) * 0.75 ) * ( smooth( 0, 0.3, d ) * 0.7 + 0.3 );
	B.ycB = lerp( B.yc, B.yt * 0.6 + B.Hb, B.wBore );
	B.ytB = lerp( B.yt, B.yt * 0.6, B.wBore );
	return B;

}

// ------------------------------------------------------------------ GLSL

const SHORE_GLSL = /* glsl */`
uniform highp sampler2D shoreTex;
uniform vec4 shoreInfo; // origin x, origin z, size, res
uniform float shoreTime;
uniform float shoreClock; // (Salt Life: the waves' clock, ShoreWaves.clock)
uniform float shoreRef;
uniform float shoreSeaLevel;
uniform vec4 shoreP0; // period, amplitude, variation, gamma
uniform vec4 shoreP1; // breakSpan, curl, runup, enabled
uniform vec4 shoreMilk; // (M11) the surf zone's turbidity (of a fair day's), the depth it reaches (m); (M14) the north shore's
// (M12) the second swell: its field, its clock, ref, period and amplitude (0: not running), its run-up
uniform highp sampler2D shoreTex2;
uniform vec4 shoreTrain2;
uniform float shoreRunup2;
// (M14) the third, the north shore's sea: as the second's
uniform highp sampler2D shoreTex3;
uniform vec4 shoreTrain3;
uniform float shoreRunup3;
// (M13) a surge's field for the island's own swell, and the sea level it was solved at (0: none)
uniform highp sampler2D shoreTexS;
uniform float shoreSurgeLevel;
#define SHORE_PERIOD shoreP0.x
#define SHORE_AMPLITUDE shoreP0.y
#define SHORE_VARIATION shoreP0.z
#define SHORE_GAMMA shoreP0.w
#define SHORE_BREAKSPAN shoreP1.x
#define SHORE_CURL shoreP1.y
#define SHORE_RUNUP shoreP1.z
#define SHORE_ENABLED shoreP1.w
const float SHORE_GRAVITY = ${ f( GRAVITY ) };
const float SHORE_TAU = ${ f( TAU ) };
const float SHORE_BEACH_SLOPE = ${ f( BEACH_SLOPE ) };
const float SHORE_SWASH_UP = ${ f( SWASH_UP ) };
const float SHORE_SWASH_DOWN = ${ f( SWASH_DOWN ) };
const float SHORE_SWASH_OVERSHOOT = ${ f( SWASH_OVERSHOOT ) };

// (M12) a swell's train of waves: its clock, the travel time that's counted from, its period, height
// (offshore amplitude) and run-up. The south's, and the second (a westerly's) while it's running; (M14)
// and the third (the north shore's)
struct ShoreTrain { float clock; float ref; float period; float amplitude; float runup; };
ShoreTrain shoreTrain1() { return ShoreTrain( shoreClock, shoreRef, SHORE_PERIOD, SHORE_AMPLITUDE, SHORE_RUNUP ); }
ShoreTrain shoreTrain2_() { return ShoreTrain( shoreTrain2.x, shoreTrain2.y, shoreTrain2.z, shoreTrain2.w, shoreRunup2 ); }
ShoreTrain shoreTrain3_() { return ShoreTrain( shoreTrain3.x, shoreTrain3.y, shoreTrain3.z, shoreTrain3.w, shoreRunup3 ); }
#define SHORE_TWO ( shoreTrain2.w > 0.0 )
#define SHORE_THREE ( shoreTrain3.w > 0.0 )
// (M14) where the third's field reaches (its exposure): nothing's evaluated for it elsewhere, the bay
#define SHORE_REACHES( f ) ( dot( f.yz, f.yz ) > 1e-4 )

float shSS( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
float shSat( float x ) { return clamp( x, 0.0, 1.0 ); }

// a shore field ( T, dir * exposure, shoreline T ), bilinear from 4 exact loads (float data)
vec4 shoreFieldSample( highp sampler2D tex, vec2 xz ) {
	float res = shoreInfo.w;
	vec2 fp = ( xz - shoreInfo.xy ) / shoreInfo.z * res - 0.5;
	vec2 fc = clamp( fp, vec2( 0.0 ), vec2( res - 1.001 ) );
	ivec2 i = ivec2( floor( fc ) );
	vec2 t = fract( fc );
	vec4 a = texelFetch( tex, i, 0 );
	vec4 b = texelFetch( tex, i + ivec2( 1, 0 ), 0 );
	vec4 c = texelFetch( tex, i + ivec2( 0, 1 ), 0 );
	vec4 d = texelFetch( tex, i + ivec2( 1, 1 ), 0 );
	return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
}
// the south's; (M13) blended with a surge's field as far as the sea's risen toward its level
vec4 terrainShoreSample( vec2 xz ) {
	vec4 a = shoreFieldSample( shoreTex, xz );
	if ( shoreSurgeLevel > 0.0 ) {
		float m = clamp( shoreSeaLevel / shoreSurgeLevel, 0.0, 1.0 );
		if ( m > 0.0 ) a = mix( a, shoreFieldSample( shoreTexS, xz ), m );
	}
	return a;
}

float shoreHash1( float x ) { return fract( sin( x * 127.1 + 311.7 ) * 43758.5453 ); }
vec2 shoreHash2( vec2 p ) { return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 ) * 2.0 - 1.0; }
// gradient noise, roughly [-1, 1]
float shorePerlin2( vec2 p ) {
	vec2 i = floor( p ), fr = fract( p );
	vec2 u = fr * fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 );
	float a = dot( shoreHash2( i ), fr );
	float b = dot( shoreHash2( i + vec2( 1.0, 0.0 ) ), fr - vec2( 1.0, 0.0 ) );
	float c = dot( shoreHash2( i + vec2( 0.0, 1.0 ) ), fr - vec2( 0.0, 1.0 ) );
	float d = dot( shoreHash2( i + vec2( 1.0, 1.0 ) ), fr - vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.4;
}

struct ShoreSample {
	vec3 disp;
	vec3 nShore;
	float env;
	float foam;
	float breaking;
	float u;
	vec2 dir;
	float exposure;
	float swashLevel;
	float swashCovered;
	float thick;
	float swashFoam;
	float runup;
	float inland;
	float face;
	float roller;
	float meanFoam; // (M14) the white its breakers leave here on average (seen from afar)
	float lam; // (M14) its wavelength here (m)
};

struct ShorePhase { vec4 sh; float T; vec2 dir; float exposure; float along; float s; };

struct ShoreBreak {
	float db; float b; float Ash; float p; float meanP; float crestPeak; float yc; float yt;
	float H; float wBore; float Xi; float Hb; float ycB; float ytB; float Xc; float Wt;
};

struct ShoreProfile { float x; float y; float b; float foam; float face; float roller; };

struct ShoreRunup { float tau; float Rt; float inland; float RhMax; float su; float sb; bool isUp; };

// Bathymetry along the beach that the travel-time field doesn't resolve: a bar with rip channels
// cut through it every ~100 m. Over the bar the waves are bigger and break first; in the channels
// they are smaller and roll through almost to the shorebreak. Returns ( k, rip ).
vec2 shoreBar( float along ) {
	float w = sin( along * 0.021 + 1.9 ) * 1.4 + sin( along * 0.009 + 0.3 ) * 0.9;
	float r = sin( along * 0.059 + w );
	float width = 0.8 + sin( along * 0.017 + 4.1 ) * 0.08;
	float rip = shSS( width, 0.985, r );
	float bar = 0.9 + ( sin( along * 0.031 + 7.3 ) * 0.6 + sin( along * 0.083 + 1.1 ) * 0.4 ) * 0.14;
	return vec2( bar * ( 1.0 - rip * 0.58 ), rip );
}

// along-shore phase wobble (in periods): crests bend over the uneven bottom
float shoreWobble( float along ) {
	return sin( along * 0.029 + 0.7 ) * 0.07 + sin( along * 0.083 + 2.1 ) * 0.035
		+ sin( along * 0.19 + 0.4 ) * 0.022 + sin( along * 0.37 + 2.6 ) * 0.011
		+ shoreBar( along ).y * 0.045;
}

// per-wave height: sets of ~7 waves, randomness, along-shore peaks so waves peel instead of closing out
float shoreWaveAmp( float m, float along, float amplitude ) {
	float waveSet = abs( sin( m * ${ f( Math.PI / 7 ) } ) ) * 0.6 + 0.55;
	float rnd = ( shoreHash1( m ) - 0.5 ) * 2.0;
	float warp = sin( along * 0.016 + m * 0.9 ) * 1.6;
	float a1 = sin( along * 0.062 + m * 1.7 + warp );
	float a2 = sin( along * 0.13 + m * 4.1 + 1.3 - warp * 0.7 );
	float a3 = sin( along * 0.29 + m * 2.3 + warp * 0.5 ) * 0.6 + sin( along * 0.47 + m * 5.9 + 0.8 ) * 0.4;
	float alongV = a1 * 0.6 + a2 * 0.4 + a3 * 0.28;
	return max( amplitude * waveSet * ( 1.0 + rnd * SHORE_VARIATION * 0.5 + alongV * SHORE_VARIATION * 0.7 ) * shoreBar( along ).x, 0.02 );
}

ShoreBreak shoreBreakParams( float A, float d ) {
	ShoreBreak P;
	P.db = pow( A * 3.556 / SHORE_GAMMA, 0.8 );
	P.b = ( P.db - d ) / ( P.db * SHORE_BREAKSPAN ); // <0 shoaling, 0..1 plunging, >1 bore
	float shoal = pow( 10.0 / clamp( d, 0.35, 10.0 ), 0.25 );
	P.Ash = A * shoal;
	P.p = mix( 1.0, 3.0, shSS( -2.5, 0.0, P.b ) );
	P.meanP = 1.0 / sqrt( ( P.p + 0.25 ) * PI );
	P.crestPeak = 1.0 + shSS( -1.0, 0.3, P.b ) * 0.22;
	P.yc = P.Ash * 2.0 * ( 1.0 - P.meanP ) * P.crestPeak;
	P.yt = P.Ash * -2.0 * P.meanP * P.crestPeak;
	P.H = P.yc - P.yt;
	P.wBore = shSS( 0.85, 1.35, P.b );
	P.Xi = P.H * 0.8;
	P.Hb = min( P.H * 0.6, max( d, 0.0 ) * 0.75 ) * ( shSS( 0.0, 0.3, d ) * 0.7 + 0.3 );
	P.ycB = mix( P.yc, P.yt * 0.6 + P.Hb, P.wBore );
	P.ytB = mix( P.yt, P.yt * 0.6, P.wBore );
	P.Xc = mix( 0.0, P.Xi - P.Hb * 0.55, P.wBore ) * shSS( 0.03, 0.3, P.Hb );
	P.Wt = mix( P.H * mix( 0.25, 0.55, shSS( 0.1, 0.9, P.b ) ), P.Hb * 0.6 + 0.08, P.wBore );
	return P;
}

// whitewater over the face after the plunge: s = 0 at the crest .. 1 at the foot of the face
float shoreFaceFill( float b, float s ) {
	float k = ( 1.0 - s ) * 0.45;
	return shSS( k + 0.9, k + 1.08, b );
}

// whitewater made by the breaking wave at xi (m, relative to the crest's rest position, shoreward)
float shoreWhitewater( float xi, float lam, ShoreBreak P ) {
	float landed = shSS( 0.86, 0.99, P.b );
	float spread = shSat( ( P.b - 0.9 ) / 0.45 );
	float reach = P.Xi * 0.25 + spread * ( P.Xi * 0.9 + 1.0 );
	float impact = landed * shSS( reach, reach * 0.6, abs( xi - P.Xi ) ) * ( 1.0 - shSS( 1.4, 1.9, P.b ) );
	float toe = P.Xc + P.Wt;
	float faceFill = shoreFaceFill( P.b, shSat( ( xi - P.Xc ) / max( P.Wt, 0.05 ) ) );
	float ahead = exp( ( xi - toe ) * -3.0 ) * P.wBore;
	float behind = exp( ( P.Xc - xi ) / lam * -16.0 ) * P.wBore;
	float roller = xi > toe ? ahead : ( xi < P.Xc ? behind : max( faceFill, P.wBore ) );
	return shSat( max( impact, roller ) );
}

// the cross-section: u local phase in [-0.5, 0.5], crest at 0, u < 0 in front (shoreward)
ShoreProfile shoreProfile( float u, float lam, ShoreBreak P, bool withFoam ) {
	float skew = shSS( -3.0, 0.0, P.b ) * 0.55;
	float phi = u - skew * ( 1.0 - cos( u * SHORE_TAU ) ) / SHORE_TAU;
	float c = max( ( cos( phi * SHORE_TAU ) + 1.0 ) * 0.5, 0.0 );
	float yPre = P.Ash * 2.0 * ( pow( c, P.p ) - P.meanP ) * P.crestPeak;
	float Q = shSS( -3.0, 0.0, P.b ) * 0.25 + 0.1;
	float xPre = sin( u * SHORE_TAU ) * P.Ash * Q;

	float uf = 0.09;
	bool inFace = u > - uf;
	float th = clamp( - u / uf, 0.0, 1.0 ) * ${ f( Math.PI / 2 ) };
	float fx = mix( 1.0 - cos( th ), sin( th ), P.wBore );
	float fy = mix( 1.0 - sin( th ), cos( th ), P.wBore );
	float sTr = clamp( ( - u - uf ) / ( 0.5 - uf ), 0.0, 1.0 );
	float ul = u * lam;
	float xFront = ( inFace ? P.Xc + P.Wt * fx : mix( P.Xc + P.Wt, lam * 0.5, sTr ) ) + ul;
	float yFront = inFace ? P.ytB + ( P.ycB - P.ytB ) * fy : P.ytB;
	float cb = pow( max( ( cos( u * ( SHORE_TAU * 0.85 ) ) + 1.0 ) * 0.5, 0.0 ), P.p );
	float yBack = P.ytB + ( P.ycB - P.ytB ) * mix( cb, exp( u * -7.0 ), P.wBore );
	float xBack = P.Xc * exp( u * -6.0 ) * shSS( 0.5, 0.35, u ) + xPre * ( 1.0 - P.wBore );
	bool front = u < 0.0;
	float wC = shSS( -0.35, 0.25, P.b ) * SHORE_CURL;
	ShoreProfile r;
	r.x = mix( xPre, front ? xFront : xBack, wC );
	r.y = mix( yPre, front ? yFront : yBack, wC );
	r.b = P.b;
	r.foam = 0.0; r.face = 0.0; r.roller = 0.0;
	if ( withFoam ) {
		r.foam = shoreWhitewater( r.x - u * lam, lam, P );
		bool onFace = front && inFace;
		float faceFill = shoreFaceFill( P.b, fx );
		r.face = ( onFace ? 1.0 : 0.0 ) * shSS( -0.4, 0.0, P.b ) * ( 1.0 - faceFill );
		r.roller = ( front ? ( inFace ? 1.0 : 0.0 ) : exp( u * -25.0 ) ) * P.wBore * P.Hb * wC;
	}
	return r;
}

// the depth under the crest of the wave a parcel belongs to (breaking is a property of the wave)
float shoreBreakDepth( vec2 xz, vec2 dir, float u, float lam, float d ) {
	vec2 pc = xz + dir * ( u * lam );
	float dc = shoreSeaLevel - terrainHeightAt( pc );
	return mix( dc, d, shSS( 0.3, 0.5, abs( u ) ) );
}

ShorePhase shorePhaseAt( vec4 sh, ShoreTrain tr, vec2 xz ) {
	vec2 dirE = sh.yz;
	float exposure = length( dirE );
	vec2 dir = dirE / max( exposure, 1e-4 );
	float along = dot( xz, vec2( - dir.y, dir.x ) );
	float s = tr.clock - ( sh.x - tr.ref ) / tr.period + shoreWobble( along );
	return ShorePhase( sh, sh.x, dir, exposure, along, s );
}

// run-up of the most recent wave at a point on the beach (distances in metres up the beach face)
ShoreRunup shoreSwashRunup( ShoreTrain tr, vec4 sh, float along, float groundH ) {
	float Tp = tr.period;
	float exposure = length( sh.yz );
	float inland = max( groundH - shoreSeaLevel, 0.0 ) / SHORE_BEACH_SLOPE;
	float ssw = tr.clock - ( sh.w - tr.ref ) / Tp + shoreWobble( along );
	float ms = floor( ssw );
	float tau = ssw - ms;
	float Am = shoreWaveAmp( ms, along, tr.amplitude );
	float RhMax = Am * 2.1 * tr.runup * shSat( exposure * 1.4 ) / SHORE_BEACH_SLOPE;
	float su = shSat( tau / SHORE_SWASH_UP );
	float sb = shSat( ( tau - SHORE_SWASH_UP ) / SHORE_SWASH_DOWN );
	bool isUp = tau < SHORE_SWASH_UP;
	float Rh = ( isUp ? 1.0 - pow( 1.0 - su, 1.5 ) : 1.0 - pow( sb, 1.6 ) ) * RhMax - 0.3;
	float lobes = sin( along * 0.61 + ms * 2.3 ) * 0.5 + sin( along * 1.73 + ms * 5.1 ) * 0.3 + sin( along * 4.3 + ms * 1.7 ) * 0.2;
	float Rt = max( Rh + lobes * ( max( Rh, 0.0 ) * 0.07 + 0.35 ), 0.35 ) * SHORE_ENABLED;
	return ShoreRunup( tau, Rt, inland, RhMax, su, sb, isUp );
}

// (M14) swell k (0 the south's, 1 a westerly's, 2 the north shore's) at xz: its field there and its train;
// false where it isn't running, or its field doesn't reach
bool shoreTrainAt( int k, vec2 xz, out vec4 field, out ShoreTrain tr ) {
	if ( k == 0 ) { field = terrainShoreSample( xz ); tr = shoreTrain1(); return true; }
	if ( k == 1 ) {
		if ( ! SHORE_TWO ) return false;
		field = shoreFieldSample( shoreTex2, xz ); tr = shoreTrain2_(); return true;
	}
	if ( ! SHORE_THREE ) return false;
	field = shoreFieldSample( shoreTex3, xz ); tr = shoreTrain3_();
	return SHORE_REACHES( field );
}

// film thickness clipped at the swash front, distance to the front (m), tau, run-up; (M12) of two
// swells, whichever's swash has run further up
vec4 shoreSwashEdgeOf( vec2 p, float t, float g, ShorePhase ph, ShoreTrain tr ) {
	ShoreRunup r = shoreSwashRunup( tr, ph.sh, ph.along, g );
	float front = r.Rt - r.inland;
	float w = shSS( shoreSeaLevel - 0.8, shoreSeaLevel - 0.4, g ) * shSS( 0.3, 0.15, t );
	return w > 0.0 ? vec4( mix( t, min( t, front * 0.08 ), w ), front / max( w, 1e-3 ), r.tau, r.Rt * w ) : vec4( t, 1e3, 0.0, 0.0 );
}
vec4 shoreSwashEdge( vec2 p, float t ) {
	vec4 o = vec4( t, 1e3, 0.0, 0.0 );
	if ( t < 0.3 ) {
		float g = terrainHeightAt( p );
		if ( g > shoreSeaLevel - 0.8 ) {
			// (a swell a time round a loop, as in shoreEvaluate)
			for ( int k = 0; k < 3; k ++ ) {
				vec4 field;
				ShoreTrain tr;
				if ( ! shoreTrainAt( k, p, field, tr ) ) continue;
				vec4 e = shoreSwashEdgeOf( p, t, g, shorePhaseAt( field, tr, p ), tr );
				if ( k == 0 || e.y > o.y && e.y < 999.0 ) o = e;
			}
		}
	}
	return o;
}

// the water mesh's view of one swell's waves at a parcel resting at xz
ShoreSample shoreEvaluateTrain( vec4 field, ShoreTrain tr, vec2 xz, float depth, float groundH ) {
	ShorePhase ph = shorePhaseAt( field, tr, xz );
	vec4 sh = ph.sh;
	float exposure = ph.exposure;
	float along = ph.along;
	vec2 dir = ph.dir;
	float Tp = tr.period;
	float d = depth;
	float c = sqrt( clamp( d, 0.3, 25.0 ) * SHORE_GRAVITY );
	float lam = c * Tp;
	float s = ph.s;
	float m = floor( s + 0.5 );
	float u = s - m;
	// wave height with smooth hand-over between consecutive waves at the trough
	float A0 = shoreWaveAmp( m, along, tr.amplitude );
	float An = shoreWaveAmp( m + sign( u ), along, tr.amplitude );
	float A = mix( A0, An, shSS( 0.32, 0.5, abs( u ) ) * 0.5 );
	float dB = shoreBreakDepth( xz, dir, u, lam, d );
	// offshore fade-in (the open sea covers deep water) and fade on land (the swash sheet takes over)
	float env = shSS( 26.0, 13.0, d ) * shSS( -0.25, 0.05, d ) * shSat( exposure * 1.4 ) * SHORE_ENABLED;

	float e = 0.15;
	ShoreBreak P = shoreBreakParams( A, dB );
	ShoreProfile p0 = shoreProfile( u, lam, P, true );
	ShoreProfile p1 = shoreProfile( u - e / lam, lam, P, false );
	float face = p0.face * env;
	float roller = p0.roller * env;
	vec3 disp = vec3( dir.x * p0.x, p0.y, dir.y * p0.x ) * env;

	vec3 nShore;
	{
		float dX = e + ( p1.x - p0.x ) * env;
		float dY = ( p1.y - p0.y ) * env;
		vec3 tAlong = vec3( dir.x * dX, dY, dir.y * dX );
		vec3 tAcross = vec3( - dir.y, 0.0, dir.x );
		vec3 n = normalize( cross( tAcross, tAlong ) + vec3( 0.0, 1e-4, 0.0 ) );
		// the whitewater roller is not a smooth tube: lumps of foam tumble along its front and top
		if ( roller != 0.0 ) {
			float sx = u * lam;
			float t = shoreTime;
			float lumpy = shSat( shorePerlin2( vec2( along * 0.045, m * 3.7 ) ) * 1.2 + 0.55 );
			float amp = roller * mix( 0.25, 0.7, lumpy );
			vec2 q1 = vec2( along * 0.28, sx * 0.7 - t * 0.8 );
			vec2 q2 = vec2( along * 0.8 + 11.3, sx * 1.6 - t * 1.5 );
			float eL = 0.25;
			float L0 = shorePerlin2( q1 ) * 0.7 + shorePerlin2( q2 ) * 0.3;
			float La = shorePerlin2( q1 + vec2( eL * 0.28, 0.0 ) ) * 0.7 + shorePerlin2( q2 + vec2( eL * 0.8, 0.0 ) ) * 0.3;
			float Ls = shorePerlin2( q1 + vec2( 0.0, eL * 0.7 ) ) * 0.7 + shorePerlin2( q2 + vec2( 0.0, eL * 1.6 ) ) * 0.3;
			float lump = max( L0 * 1.5 + 0.2, -0.3 );
			disp.y += lump * amp;
			bool up = L0 * 1.5 + 0.2 > -0.3;
			float dAlong = up ? ( La - L0 ) / eL * 1.5 : 0.0;
			float dSx = up ? ( Ls - L0 ) / eL * 1.5 : 0.0;
			vec2 g = ( vec2( - dir.y, dir.x ) * dAlong + dir * ( - dSx ) ) * amp * n.y;
			nShore = normalize( vec3( n.x - g.x, max( n.y, 0.04 ), n.z - g.y ) );
		} else {
			nShore = normalize( vec3( n.x, max( n.y, 0.04 ), n.z ) );
		}
	}

	// swash: run-up of the most recent wave on the sand
	ShoreRunup swr = shoreSwashRunup( tr, sh, along, groundH );
	float front = swr.Rt - swr.inland;
	bool covered = front > 0.0;
	float fm = front + SHORE_SWASH_OVERSHOOT;
	float thick = clamp( min( fm * 0.3, max( fm - 0.1, 0.0 ) * ( SHORE_BEACH_SLOPE * 0.22 ) + 0.03 ), -0.1, 0.12 );
	float uprush = shSS( 0.46, 0.32, swr.tau );
	float edge = shSS( 0.8, 0.0, front ) * shSS( -0.05, 0.05, front ) * uprush * shSS( 0.0, 1.0, swr.Rt );

	ShoreSample o;
	// the churn of a bore is uneven along the crest: dense in stretches, torn into patches elsewhere
	float wwPatch = 0.0;
	if ( p0.foam * env != 0.0 ) wwPatch = shSS( -0.5, 0.45, shorePerlin2( vec2( along * 0.06 + shoreTime * 0.05, m * 2.9 + 0.4 ) ) );
	o.disp = disp; o.nShore = nShore; o.env = env; o.foam = p0.foam * env * mix( 0.3, 1.0, wwPatch ); o.breaking = p0.b; o.u = u; o.dir = dir;
	o.exposure = exposure; o.swashLevel = groundH + thick; o.swashCovered = covered ? 1.0 : 0.0; o.thick = thick;
	o.swashFoam = edge * 0.9; o.runup = swr.Rt; o.inland = swr.inland;
	o.face = face; o.roller = roller;
	// ((M14) the white a wave of the train's height leaves here on average: brightest along the break line,
	// thinner over the bores inside it, a small surf's thinner)
	float bm = shoreBreakParams( tr.amplitude, d ).b;
	o.meanFoam = shSS( -0.6, 0.2, bm ) * mix( 0.85, 0.4, shSS( 1.5, 6.0, bm ) ) * mix( 0.45, 1.0, shSS( 0.1, 0.8, tr.amplitude ) ) * env;
	o.lam = lam;
	return o;
}

// (M12) two swells crossing: their heights and slopes added, the rest whichever's more (the crest's, of
// the bigger wave there)
ShoreSample shoreCross( ShoreSample a, ShoreSample b ) {
	ShoreSample o = a;
	if ( abs( b.disp.y ) > abs( a.disp.y ) ) o = b;
	o.disp = a.disp + b.disp;
	vec2 slope = a.nShore.xz / max( a.nShore.y, 0.2 ) + b.nShore.xz / max( b.nShore.y, 0.2 );
	o.nShore = normalize( vec3( slope.x, 1.0, slope.y ) );
	o.env = max( a.env, b.env );
	o.foam = max( a.foam, b.foam );
	o.breaking = max( a.breaking, b.breaking );
	o.exposure = max( a.exposure, b.exposure );
	o.face = max( a.face, b.face );
	o.roller = max( a.roller, b.roller );
	o.meanFoam = max( a.meanFoam, b.meanFoam );
	o.lam = b.meanFoam > a.meanFoam ? b.lam : a.lam;
	bool bSwash = b.swashLevel > a.swashLevel;
	o.swashLevel = bSwash ? b.swashLevel : a.swashLevel;
	o.swashCovered = max( a.swashCovered, b.swashCovered );
	o.thick = bSwash ? b.thick : a.thick;
	o.swashFoam = max( a.swashFoam, b.swashFoam );
	o.runup = max( a.runup, b.runup );
	return o;
}

// the water mesh's view of the shore waves at a parcel resting at xz: the south's, (M12) a westerly's
// crossing them, (M14) and the north shore's sea where its field reaches. (A swell a time round a loop: the
// swell's code is in the program once, not once for each, and a device that draws on its CPU makes the
// sea's program a third quicker for it, while the game loads)
ShoreSample shoreEvaluate( vec2 xz, float depth, float groundH ) {
	ShoreSample a;
	for ( int k = 0; k < 3; k ++ ) {
		vec4 field;
		ShoreTrain tr;
		if ( ! shoreTrainAt( k, xz, field, tr ) ) continue;
		ShoreSample b = shoreEvaluateTrain( field, tr, xz, depth, groundH );
		if ( k == 0 ) a = b;
		else a = shoreCross( a, b );
	}
	return a;
}

// the surf zone's water: suspended sand and fine bubbles scatter light (milky, turquoise); (M11) as much
// as the surf stirs up, out to where its breakers stand; (M12) and a rip's plume, carried out through its
// channel past the breakers
float shoreSurfTurbidity( vec2 xz, float depth ) {
	float k = 0.0, reach = shoreMilk.y;
	if ( depth < reach * ${ f( RIP_REACH ) } && depth > -0.2 ) {
		vec4 sh = terrainShoreSample( xz );
		float e = length( sh.yz );
		vec2 dir = sh.yz / max( e, 1e-4 );
		float rip = shoreBar( dot( xz, vec2( - dir.y, dir.x ) ) ).y;
		if ( SHORE_TWO ) e = max( e, length( shoreFieldSample( shoreTex2, xz ).yz ) );
		float expo = shSat( e * 1.4 );
		float zone = shSS( reach, reach * 0.27, depth );
		float plume = rip * shSS( reach * ${ f( RIP_REACH ) }, reach * 0.6, depth ) * ${ f( RIP_MILK ) };
		k = max( zone, plume ) * shSS( -0.2, 0.15, depth ) * expo * SHORE_ENABLED;
	}
	k = min( k * shoreMilk.x, 1.0 );
	// ((M14) the north shore's surf zone, as milky as its own surf stirs it, where its field reaches)
	if ( SHORE_THREE && depth < shoreMilk.w && depth > -0.2 ) {
		vec4 f3 = shoreFieldSample( shoreTex3, xz );
		float zone = shSS( shoreMilk.w, shoreMilk.w * 0.27, depth ) * shSS( -0.2, 0.15, depth ) * shSat( length( f3.yz ) * 1.4 ) * SHORE_ENABLED;
		k = max( k, min( zone * shoreMilk.z, 1.0 ) );
	}
	return k;
}
`;
