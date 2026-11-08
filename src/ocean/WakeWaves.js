import { Vector4 } from '../engine/index.js';
import { GRAVITY } from '../core/Globals.js';

// (M17) A boat's wake's far arms as real waves: smooth crests on the sea's surface, worked out from her track, the same on
// the GPU (the sea's vertex shader: glsl) and the CPU (heightAt, through Waves.heightAt: what floats rides them). The foam
// is Wake.js', as it was. docs/m17/wakes.md has the sources.
//
// Her track is a few of her recent places, her heading and speed at each, recorded as she goes (a sample every `every` s on
// a straight run, more in a turn or as her speed changes) and sent to the sea as uniforms: nothing to draw into, and the sea
// has no texture left on high (16 of 16).
//
// Each sample sends out her wake's divergent waves. They go at their group velocity (half their phase speed, deep water), at
// theta off her heading, so the crests her hull made `age` s ago are now at P + age cg n (n: their way, either side): the
// arm's the line through those for every sample, and a straight run's arms open at psi, tan psi = tan theta / ( 1 + 2
// tan^2 theta ). theta is the one whose psi is the wake's angle (wakeTan: Kelvin's 19.47 degrees, or Rabaud & Moisy's
// narrower one on the plane), so the crests lie where the foam's arms do, and their wavelength comes out as the waves of
// that angle have it: on the plane about her waterline's length (lambda = L as Fr grows), Kelvin's cusp waves under it.
// Their phase is the one they had from her at that sample, k n . ( x - P ) - omega age: on a straight run the same as the
// steady pattern's, and carrying on round a turn.
//
// Across the arm the train's envelope: its highest crest on the arm's line, nothing much outside it, the rest of the train
// behind it toward her track, wider as it goes out (more crests, the group spreading), and wider still under Kelvin's angle
// (the feathered band of short crests en echelon a slow boat leaves, where a planing boat leaves two or three long ridges).
// Its height, crest to trough: Macfarlane et al. (SNAME 2012)'s, by her length, her slenderness and her speed, and as
// y^-1/3 off her track (the divergent waves' decay, Havelock's; their measured n, -0.25 to -0.4).

export const WAKE = {
	age: 75, // s: how long her arms are followed out (on the plane, about 110 m off her track by then)
	every: 6, // s: a sample on a straight run
	turn: 12 * Math.PI / 180, // rad: one as she turns this far
	speed: 0.15, // one as her speed changes by this share
	gap: 0.3, // s: at most one in this
	slow: 1.2, // m/s: under this she leaves none
	ring: 16, // samples kept a track
	jump: 60, // m in a frame: she was moved, not run
	join: 2, // m: where an arm's lengths meet, each fades into the next over this
	near: [ 1, 2.5 ], // waterline lengths behind her middle: her arms come up between these (none on her own hull)
	range: { low: 600, mid: 1000, high: 1000 }, // m: a boat's wake's drawn out to this from you
	// (a boat in company's waterline's length and displaced volume (m, m^3), as her model has them (test/wakes.mjs))
	hulls: { console: [ 5.61, 2.49 ], lobster: [ 7.79, 3.26 ], sportfisher: [ 12.84, 18.48 ] },
};
const MAX = { low: 24, mid: 40, high: 40 }; // samples sent to the sea
const TRACKS = { low: 2, mid: 4, high: 4 }; // boats' wakes at once
// how the crests too short for the sea's grid fade, by its spacing over their length: as the open sea's waves do (5 to 2.5
// vertices a wavelength). (Tried on low from 2.5 to 2, so the console's 5.6 m crests showed at 44% on its 2.3 m grid: there the
// triangles drew them more than half wrong against the CPU's, 7.6 mm RMS on 13.8, and they weren't to be seen astern. So on low
// they're left out, drawn and floated on alike: docs/m17/wakes.md)
const DRAWN = { low: [ 0.2, 0.4 ], mid: [ 0.2, 0.4 ], high: [ 0.2, 0.4 ] };
// what of a wave of length lam the sea's grid of that spacing draws (as the GLSL's wakeAt)
export const wakeDrawn = ( spacing, lam, tier = 'high' ) => 1 - smooth( ( DRAWN[ tier ] ?? DRAWN.low )[ 0 ], ( DRAWN[ tier ] ?? DRAWN.low )[ 1 ], spacing / lam );
const KELVIN_TAN = 1 / Math.sqrt( 8 ); // (tan 19.47 degrees)
const TAU = Math.PI * 2;
const smooth = ( a, b, v ) => {

	const x = Math.min( 1, Math.max( 0, ( v - a ) / ( b - a ) ) );
	return x * x * ( 3 - 2 * x );

};

// the tangent of a wake's half angle: U her speed (m/s), L her waterline's length (m). Kelvin's 19.47 degrees up to a hull
// Froude number of about 0.5, then narrowing as 1 / Fr (Rabaud & Moisy 2013, https://arxiv.org/abs/1304.2653)
export function wakeTan( U, L ) {

	const Fr = U / Math.sqrt( GRAVITY * L );
	return Math.min( KELVIN_TAN, 1 / ( 2 * Math.sqrt( 2 * Math.PI ) * Math.max( Fr, 1e-3 ) ) );

}

// cos theta: the way her arms' waves run, off her heading. Of the two whose energy goes out at the wake's angle, the
// divergent one (tan psi = t / ( 1 + 2 t^2 ), t = tan theta: at Kelvin's angle the cusp's 35.26 degrees)
export function wakeCos( U, L ) {

	const T = wakeTan( U, L ), t = ( 1 + Math.sqrt( Math.max( 0, 1 - 8 * T * T ) ) ) / ( 4 * T );
	return 1 / Math.sqrt( 1 + t * t );

}

// the highest wave of her train, crest to trough (m), y m off her track (y under her length: as at her length). Fitted to
// Macfarlane et al.'s predictions for a ski boat (L / V^1/3 4.79, 4.18 lengths off: 0.20 m at 12 and 17 kn, 0.10 at 22,
// 0.052 at 30), its rise from a displacement speed by their 17 m monohull's (0.15, 0.5, 0.88 of its highest at Fr 0.2,
// 0.3, 0.4), and its fall with slenderness by their Fig. 6 (as ( L / V^1/3 )^-2.3)
export function wakeHeight( U, L, vol, y ) {

	const Fr = U / Math.sqrt( GRAVITY * L );
	if ( Fr <= 0.1 ) return 0;
	const f = smooth( 0.1, 0.5, Fr ) * Math.min( 1, ( 1.1 / Fr ) ** 2 );
	const slender = L / Math.cbrt( Math.max( vol, 1e-3 ) );
	return 0.033 * L * f * Math.pow( slender / 4.8, - 2.3 ) * Math.cbrt( 4 * L / Math.max( y, L ) );

}

// one sample of a track (its place, heading (rad, atan2( z, x )), speed and when)
const sample = () => ( { t: 0, x: 0, z: 0, a: 0, U: 0 } );
const lerpAngle = ( a, b, f ) => a + Math.atan2( Math.sin( b - a ), Math.cos( b - a ) ) * f;

class Track {

	constructor( key ) {

		this.key = key;
		this.own = key === 'own';
		this.ring = Array.from( { length: WAKE.ring }, sample ); // newest at `top`, back from there
		this.top = - 1;
		this.n = 0;
		this.head = sample();
		this.moving = false; // (a head this frame)
		this.followed = false;
		this.last = null; // { x, z, t, vx, vz } (a boat in company's: her way from her place frame to frame)
		this.L = 6;
		this.vol = 2;

	}

	at( i ) {

		return this.ring[ ( this.top - i + WAKE.ring ) % WAKE.ring ];

	}

	record( s ) {

		this.top = ( this.top + 1 ) % WAKE.ring;
		Object.assign( this.ring[ this.top ], s );
		this.n = Math.min( this.n + 1, WAKE.ring );

	}

	clear() {

		this.n = 0;
		this.top = - 1;

	}

}

export class WakeWaves {

	constructor( { tier = 'low' } = {} ) {

		const max = this.max = MAX[ tier ] ?? MAX.low, tracks = this.maxTracks = TRACKS[ tier ] ?? TRACKS.low;
		this.range = WAKE.range[ tier ] ?? WAKE.range.low;
		this.tier = DRAWN[ tier ] ? tier : 'low';
		// (the sea's finest grid spacing, m, as WaterSurface tells it: the CPU's crests are what that draws, near you. 0, with no
		// sea: all of them)
		this.spacing = 0;
		this.tracks = new Map();
		// what's sent (world, doubles): each sample's place, heading, envelope behind the arm (m), age, k, cos theta, height;
		// and its two arms' (side 0 to starboard, 1 to port): where the crests are, their wave vector, their phase there
		this.s = { x: new Float64Array( max ), z: new Float64Array( max ), a: new Float64Array( max ), sig: new Float64Array( max ), age: new Float64Array( max ), k: new Float64Array( max ), cos: new Float64Array( max ), amp: new Float64Array( max ), drawn: new Float64Array( max ) };
		this.arm = { qx: new Float64Array( max * 2 ), qz: new Float64Array( max * 2 ), kx: new Float64Array( max * 2 ), kz: new Float64Array( max * 2 ), c: new Float64Array( max * 2 ), lam: new Float64Array( max ) };
		this.span = new Int32Array( tracks * 2 ); // each track's samples [ from, to )
		this.box = new Float64Array( tracks * 4 ); // and where its crests can reach: min x, z, max x, z
		this.n = 0;
		this.count = 0; // tracks sent
		this.t = 0;
		this._list = [];
		this.uniforms = {
			wakeA: { value: Array.from( { length: max }, () => new Vector4() ) }, // place (about the sea's origin), heading, envelope
			wakeB: { value: Array.from( { length: max }, () => new Vector4() ) }, // age, k, cos theta, height
			wakeTrack: { value: Array.from( { length: tracks * 2 }, () => new Vector4() ) }, // box, [ from, to ]
			wakeTracks: { value: 0 },
		};
		const f = ( v ) => v.toFixed( 5 );
		this.glsl = /* glsl */`
#define WAKE_MAX ${ max }
#define WAKE_TRACKS ${ tracks }
uniform vec4 wakeA[ WAKE_MAX ];
uniform vec4 wakeB[ WAKE_MAX ];
uniform vec4 wakeTrack[ WAKE_TRACKS * 2 ];
uniform int wakeTracks;
// ((M17) her wake's far arms at x (about the sea's origin): their height, and its slope out. Each track's samples round one loop,
// each sample's two arms round another: a call's a copy of the code (WakeWaves.heightAt is the same, on the CPU). The loops run
// to the uniforms' counts, not the arrays' sizes, so a compiler can't copy their body out forty times over. The waves too short
// for the grid's spacing there faded out, as the open sea's are)
float wakeAt( vec2 x, float spacing, out vec2 slope ) {
	float h = 0.0;
	slope = vec2( 0.0 );
	for ( int j = 0; j < wakeTracks; j ++ ) {
		vec4 box = wakeTrack[ 2 * j ];
		if ( x.x < box.x || x.y < box.y || x.x > box.z || x.y > box.w ) continue;
		int from = int( wakeTrack[ 2 * j + 1 ].x ), to = int( wakeTrack[ 2 * j + 1 ].y );
		vec2 pQ[ 2 ], pK[ 2 ];
		float pc[ 2 ], pSig = 0.0, pLam = 0.0, pAmp = 0.0;
		for ( int s = from; s < to; s ++ ) {
			vec4 A = wakeA[ s ], B = wakeB[ s ];
			float k = B.y, cs = B.z, sn = sqrt( max( 1.0 - cs * cs, 0.0 ) );
			float om = sqrt( ${ f( GRAVITY ) } * k ), go = B.x * 0.5 * om / k;
			vec2 d = vec2( cos( A.z ), sin( A.z ) ), side = sn * vec2( - d.y, d.x );
			float lam = ${ f( TAU ) } / k, amp = B.w * ( 1.0 - smoothstep( ${ f( DRAWN[ this.tier ][ 0 ] ) }, ${ f( DRAWN[ this.tier ][ 1 ] ) }, spacing / lam ) );
			for ( int e = 0; e < 2; e ++ ) {
				vec2 n = cs * d + ( e == 0 ? - side : side );
				vec2 Q = A.xy + go * n, K = k * n;
				float c = dot( K, A.xy ) + om * B.x;
				if ( s > from ) {
					// (this arm from the sample before: along it, how far into this length, faded where it meets the next)
					vec2 ed = Q - pQ[ e ];
					float len = max( length( ed ), 1e-3 );
					vec2 dir = ed / len, r = x - pQ[ e ];
					float al = dot( r, dir );
					float win = clamp( al / ${ f( WAKE.join ) } + 0.5, 0.0, 1.0 ) * clamp( ( len - al ) / ${ f( WAKE.join ) } + 0.5, 0.0, 1.0 );
					float t = clamp( al / len, 0.0, 1.0 );
					// (across it, out from her track: the train's highest crest on it, the rest behind it)
					vec2 m = ( e == 0 ? - 1.0 : 1.0 ) * vec2( dir.y, - dir.x );
					float u = dot( r, m ), sg = u > 0.0 ? 0.45 * mix( pLam, lam, t ) : mix( pSig, A.w, t ), q = u / sg;
					if ( win > 0.0 && q * q < 12.0 ) {
						float env = exp( - 0.5 * q * q ) * win * mix( pAmp, amp, t );
						vec2 Kt = mix( pK[ e ], K, t );
						float ph = dot( Kt, x ) - mix( pc[ e ], c, t ), cp = cos( ph );
						h += env * cp;
						slope -= env * ( sin( ph ) * Kt + cp * u / ( sg * sg ) * m );
					}
				}
				pQ[ e ] = Q;
				pK[ e ] = K;
				pc[ e ] = c;
			}
			pSig = A.w; pLam = lam; pAmp = amp;
		}
	}
	return h;
}
`;

	}

	// a boat under way, this frame: key (whose: 'own' for the boat you're in), where she is and her velocity (m/s), her
	// waterline's length and displaced volume, the sea's time
	follow( key, x, z, vx, vz, L, vol, t ) {

		let tr = this.tracks.get( key );
		if ( ! tr ) this.tracks.set( key, tr = new Track( key ) );
		tr.followed = true;
		tr.L = L;
		tr.vol = vol;
		const U = Math.hypot( vx, vz ), h = tr.head;
		// (moved, not run, or not followed since she was somewhere else; or the sea's clock gone back)
		if ( tr.n && ( Math.hypot( x - h.x, z - h.z ) > WAKE.jump || t < h.t ) ) tr.clear();
		const was = tr.moving;
		tr.moving = U >= WAKE.slow;
		h.t = t;
		h.x = x;
		h.z = z;
		h.U = U;
		if ( U > 1e-3 ) h.a = Math.atan2( vz, vx );
		if ( ! tr.moving ) {

			// (stopping: her last place under way is where her arms end)
			if ( was ) tr.record( h );
			return;

		}

		const top = tr.n ? tr.at( 0 ) : null;
		if ( ! top ) return tr.record( h );
		const dt = t - top.t;
		if ( dt < WAKE.gap ) return;
		const turned = Math.abs( Math.atan2( Math.sin( h.a - top.a ), Math.cos( h.a - top.a ) ) );
		if ( dt >= WAKE.every || turned >= WAKE.turn || Math.abs( U - top.U ) >= WAKE.speed * Math.max( U, top.U ) ) tr.record( h );

	}

	// (M17) a boat in company under way, by where she's drawn: her velocity from her place frame to frame (smoothed: the poses
	// come a few a second, put in between)
	followDrawn( key, x, z, type, t ) {

		const hull = WAKE.hulls[ type ];
		let tr = this.tracks.get( key );
		if ( ! tr ) this.tracks.set( key, tr = new Track( key ) );
		const l = tr.last;
		if ( ! hull ) return;
		if ( ! l || t <= l.t || Math.hypot( x - l.x, z - l.z ) > WAKE.jump ) {

			tr.last = { x, z, t, vx: 0, vz: 0 };
			tr.followed = true;
			return;

		}

		const dt = t - l.t, k = 1 - Math.exp( - dt / 0.4 );
		l.vx += ( ( x - l.x ) / dt - l.vx ) * k;
		l.vz += ( ( z - l.z ) / dt - l.vz ) * k;
		l.x = x;
		l.z = z;
		l.t = t;
		this.follow( key, x, z, l.vx, l.vz, hull[ 0 ], hull[ 1 ], t );

	}

	// once a frame, after following each boat: what's sent to the sea and read by heightAt, nearest you first (the boat you're in
	// before any), as many as the tier sends. cam: where you are
	update( t, cam ) {

		this.t = t;
		const list = this._list;
		list.length = 0;
		for ( const [ key, tr ] of this.tracks ) {

			const followed = tr.followed;
			tr.followed = false;
			if ( ! followed ) {

				tr.moving = false;
				tr.last = null;

			}

			// (what's older than the arms are followed: let go; and a track with nothing left, once it's not followed)
			while ( tr.n > 1 && t - tr.at( tr.n - 2 ).t > WAKE.age ) tr.n --;
			if ( ! tr.moving && ( tr.n === 0 || t - tr.at( 0 ).t > WAKE.age ) ) {

				if ( ! followed ) this.tracks.delete( key );
				else tr.clear();
				continue;

			}

			const h = tr.moving ? tr.head : tr.at( 0 );
			tr.d = Math.hypot( h.x - cam.x, h.z - cam.z );
			if ( tr.own || tr.d < this.range ) list.push( tr );

		}

		list.sort( ( a, b ) => ( b.own - a.own ) || a.d - b.d );
		this.n = 0;
		this.count = 0;
		for ( const tr of list ) {

			if ( this.count >= this.maxTracks || this.n >= this.max - 1 ) break;
			const from = this.n;
			this._pack( tr, t );
			if ( this.n - from < 2 ) {

				this.n = from;
				continue;

			}

			this._box( from, this.n );
			this.count ++;

		}

	}

	// a track's samples, newest first: her now if she's under way, where her arms come up (if no sample's nearer), what's
	// recorded, and where her arms end (WAKE.age, put in between)
	_pack( tr, t ) {

		const L = tr.L;
		const first = this.n;
		let prev = null;
		if ( tr.moving ) {

			// (her now, and where her arms come up behind her, unless a sample's nearer: none on her own hull)
			const h = tr.head, s0 = tr.n ? tr.at( 0 ) : null;
			this._put( tr, h, t );
			prev = h;
			for ( const near of WAKE.near ) {

				const age = near * L / Math.max( h.U, WAKE.slow );
				if ( ! s0 || t - s0.t <= age * 1.1 ) break;
				const n = this._near || ( this._near = sample() ), f = age / ( t - s0.t );
				n.t = t - age;
				n.x = h.x + ( s0.x - h.x ) * f;
				n.z = h.z + ( s0.z - h.z ) * f;
				n.a = lerpAngle( h.a, s0.a, f );
				n.U = h.U + ( s0.U - h.U ) * f;
				this._put( tr, n, t );
				prev = n;

			}

		}

		for ( let i = 0; i < tr.n && this.n < this.max; i ++ ) {

			const s = tr.at( i );
			if ( prev && prev.t === s.t ) continue;
			if ( t - s.t > WAKE.age ) {

				// (her arms' end, between the last within it and this one)
				if ( prev ) {

					const e = this._end || ( this._end = sample() ), f = ( t - WAKE.age - prev.t ) / ( s.t - prev.t );
					e.t = t - WAKE.age;
					e.x = prev.x + ( s.x - prev.x ) * f;
					e.z = prev.z + ( s.z - prev.z ) * f;
					e.a = lerpAngle( prev.a, s.a, f );
					e.U = prev.U + ( s.U - prev.U ) * f;
					this._put( tr, e, t );

				}

				break;

			}

			this._put( tr, s, t );
			prev = s;

		}

		// (cut short by what the tier sends: the last one sent ends them)
		if ( this.n > first ) this.s.amp[ this.n - 1 ] = this.s.drawn[ this.n - 1 ] = 0;

	}

	_put( tr, s, t ) {

		const i = this.n ++, S = this.s, A = this.arm, L = tr.L;
		const age = Math.max( 0, t - s.t ), U = Math.max( s.U, 0.01 ), Fr = U / Math.sqrt( GRAVITY * L );
		const cs = wakeCos( U, L ), sn = Math.sqrt( Math.max( 0, 1 - cs * cs ) );
		const k = GRAVITY / ( U * cs ) ** 2, om = Math.sqrt( GRAVITY * k ), go = age * 0.5 * om / k, lam = TAU / k;
		const y = go * sn;
		// (none on her own hull: they come up as she leaves them behind; and they go at the end of what's followed)
		const ramp = smooth( WAKE.near[ 0 ] * L, WAKE.near[ 1 ] * L, U * age ), tail = 1 - smooth( 0.7 * WAKE.age, WAKE.age, age );
		S.x[ i ] = s.x;
		S.z[ i ] = s.z;
		S.a[ i ] = s.a;
		// (the train behind its highest crest: wider as it goes out, and Kelvin's feathered band wider than a planing boat's ridges;
		// but reaching in no more than half its way off her track, the middle of her V left flat, as it's seen: close behind her
		// a ridge or two either side, the two trains crossing only further astern)
		S.sig[ i ] = Math.max( 0.3 * lam, Math.min( lam * ( 0.8 + 0.25 * Math.cbrt( Math.max( y / lam, 1 ) ) ) * ( 1 + 2 * ( 1 - smooth( 0.45, 0.9, Fr ) ) ), 0.5 * y ) );
		S.age[ i ] = age;
		S.k[ i ] = k;
		S.cos[ i ] = cs;
		S.amp[ i ] = 0.5 * wakeHeight( U, L, tr.vol, y ) * ramp * tail;
		const dx = Math.cos( s.a ), dz = Math.sin( s.a );
		for ( let e = 0; e < 2; e ++ ) {

			const sd = e === 0 ? - sn : sn, nx = cs * dx - sd * dz, nz = cs * dz + sd * dx, j = i * 2 + e;
			A.qx[ j ] = s.x + go * nx;
			A.qz[ j ] = s.z + go * nz;
			A.kx[ j ] = k * nx;
			A.kz[ j ] = k * nz;
			A.c[ j ] = k * ( nx * s.x + nz * s.z ) + om * age; // (its phase at x: k n . ( x - P ) - omega age, P its place)

		}

		A.lam[ i ] = lam;
		// (the height the CPU reads: what the sea's grid draws of it near you; the GPU's sent all of it, and fades it by its own grid)
		S.drawn[ i ] = S.amp[ i ] * wakeDrawn( this.spacing, lam, this.tier );

	}

	_box( from, to ) {

		const j = this.count, A = this.arm, S = this.s, b = this.box;
		let x0 = Infinity, z0 = Infinity, x1 = - Infinity, z1 = - Infinity, reach = 0;
		for ( let i = from; i < to; i ++ ) {

			reach = Math.max( reach, S.sig[ i ], 0.45 * A.lam[ i ] );
			for ( let e = 0; e < 2; e ++ ) {

				const qx = A.qx[ i * 2 + e ], qz = A.qz[ i * 2 + e ];
				x0 = Math.min( x0, qx );
				z0 = Math.min( z0, qz );
				x1 = Math.max( x1, qx );
				z1 = Math.max( z1, qz );

			}

		}

		reach = reach * 3.5 + WAKE.join;
		b[ j * 4 ] = x0 - reach;
		b[ j * 4 + 1 ] = z0 - reach;
		b[ j * 4 + 2 ] = x1 + reach;
		b[ j * 4 + 3 ] = z1 + reach;
		this.span[ j * 2 ] = from;
		this.span[ j * 2 + 1 ] = to;

	}

	// the uniforms, about the sea's origin O (WaterSurface.update)
	place( O ) {

		const S = this.s, UA = this.uniforms.wakeA.value, UB = this.uniforms.wakeB.value, UT = this.uniforms.wakeTrack.value, b = this.box;
		for ( let i = 0; i < this.n; i ++ ) {

			UA[ i ].set( S.x[ i ] - O.x, S.z[ i ] - O.z, S.a[ i ], S.sig[ i ] );
			UB[ i ].set( S.age[ i ], S.k[ i ], S.cos[ i ], S.amp[ i ] );

		}

		for ( let j = 0; j < this.count; j ++ ) {

			UT[ j * 2 ].set( b[ j * 4 ] - O.x, b[ j * 4 + 1 ] - O.z, b[ j * 4 + 2 ] - O.x, b[ j * 4 + 3 ] - O.z );
			UT[ j * 2 + 1 ].set( this.span[ j * 2 ], this.span[ j * 2 + 1 ], 0, 0 );

		}

		this.uniforms.wakeTracks.value = this.count;

	}

	// her wake's far arms' height at (x, z) (m over the sea's), as the GPU's wakeAt has it with a grid fine enough to draw them;
	// slope: [ dh/dx, dh/dz ] out, if given
	heightAt( x, z, slope = null ) {

		let h = 0, sx = 0, sz = 0;
		const S = this.s, A = this.arm, b = this.box, J = WAKE.join;
		for ( let j = 0; j < this.count; j ++ ) {

			if ( x < b[ j * 4 ] || z < b[ j * 4 + 1 ] || x > b[ j * 4 + 2 ] || z > b[ j * 4 + 3 ] ) continue;
			const to = this.span[ j * 2 + 1 ];
			for ( let i = this.span[ j * 2 ] + 1; i < to; i ++ ) {

				const p = i - 1;
				for ( let e = 0; e < 2; e ++ ) {

					const pj = p * 2 + e, ij = i * 2 + e;
					const ex = A.qx[ ij ] - A.qx[ pj ], ez = A.qz[ ij ] - A.qz[ pj ], len = Math.max( Math.hypot( ex, ez ), 1e-3 );
					const dx = ex / len, dz = ez / len, rx = x - A.qx[ pj ], rz = z - A.qz[ pj ];
					const al = rx * dx + rz * dz;
					const win = Math.min( 1, Math.max( 0, al / J + 0.5 ) ) * Math.min( 1, Math.max( 0, ( len - al ) / J + 0.5 ) );
					if ( win <= 0 ) continue;
					const t = Math.min( 1, Math.max( 0, al / len ) );
					const sgn = e === 0 ? - 1 : 1, mx = sgn * dz, mz = - sgn * dx;
					const u = rx * mx + rz * mz;
					const sg = u > 0 ? 0.45 * ( A.lam[ p ] + ( A.lam[ i ] - A.lam[ p ] ) * t ) : S.sig[ p ] + ( S.sig[ i ] - S.sig[ p ] ) * t;
					const q = u / sg;
					if ( q * q > 12 ) continue;
					const env = Math.exp( - 0.5 * q * q ) * win * ( S.drawn[ p ] + ( S.drawn[ i ] - S.drawn[ p ] ) * t );
					const kx = A.kx[ pj ] + ( A.kx[ ij ] - A.kx[ pj ] ) * t, kz = A.kz[ pj ] + ( A.kz[ ij ] - A.kz[ pj ] ) * t;
					// (each end's phase from its own place, k n . ( x - P ) - omega age, between them)
					const ph = kx * x + kz * z - ( A.c[ pj ] + ( A.c[ ij ] - A.c[ pj ] ) * t );
					const cp = Math.cos( ph );
					h += env * cp;
					if ( slope ) {

						const sp = Math.sin( ph ), w = cp * u / ( sg * sg );
						sx -= env * ( sp * kx + w * mx );
						sz -= env * ( sp * kz + w * mz );

					}

				}

			}

		}

		if ( slope ) {

			slope[ 0 ] = sx;
			slope[ 1 ] = sz;

		}

		return h;

	}

}
