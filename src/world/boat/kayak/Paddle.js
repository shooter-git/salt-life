import { MathUtils, Vector3 } from '../../../engine/index.js';

// (M16) A paddle in the water: what drives and turns the kayak, in place of a propeller and a rudder. There's no
// force here to tune as such: the stroke moves the blade through the water (its kinematics, below, the low-angle stroke
// of a wide fishing kayak), and the water pushes back on the blade (1/2 rho Cd A v^2, flat plate Cd 1.9, as paddle-blade
// studies measure it) at the speed it goes past it, the kayak's own motion in that. So she gathers way quickly and
// settles at the speed where the blade barely slips: strokes a second apart, about 3 knots; a hard pace, a little over 4
// (her hull speed's 4.4); back-paddling stops her in two or three strokes; a stroke pulls her bow a little to its side, as
// a real one does; a wide sweep on one side turns her. Tiring nothing: it's your arms, and they don't run out.
//
//   ctl.throttleTarget  -1..1: ahead (+) or astern (-), and how hard; ctl.steerTarget  -1..1: to port (+)
//   stroke.phase, side, kind, wet     where the stroke is (the paddle's pose follows: stroke.pose)
//   stroke.events                     [ { kind: 'catch' | 'exit', side, at: Vector3 } ], drained by the model each frame

const RHO = 1025;
const CD = 1.9;
const BLADE = 0.075; // m^2 (46 x 17 cm, its corners rounded)
const MOST = 190; // N: as hard as anyone pulls a blade
const H = 1 / 120; // the integrator's step (player/BoatController)
const IN_WATER = 0.62; // of a stroke: the rest is lifting and reaching for the next
const REACH = 1.23; // m from the shaft's middle to the blade's middle
const GRIP = 0.34; // m from the middle to each hand
const clamp = MathUtils.clamp;
const smooth = ( x ) => x * x * ( 3 - 2 * x );
const lerp = MathUtils.lerp;

// the shaft's swing (rad: the working end forward of square), its tilt (rad), and how low the hands are, for each kind
const KINDS = {
	ahead: { from: 0.68, to: - 0.5, tilt: 0.5, hub: 0.5, dir: 1 },
	light: { from: 0.4, to: - 0.3, tilt: 0.5, hub: 0.5, dir: 1 },
	sweep: { from: 0.95, to: - 0.8, tilt: 0.38, hub: 0.385, dir: 1 },
	astern: { from: - 0.5, to: 0.68, tilt: 0.5, hub: 0.5, dir: - 1 },
	sweepAstern: { from: - 0.85, to: 0.8, tilt: 0.38, hub: 0.385, dir: - 1 },
};
const REST = { swing: 0, tilt: 0, hub: 0.335 };

export class Stroke {

	// seat: the middle of the paddler's hands' reach, boat frame: { y, z }
	constructor( z ) {

		this.z = z + 0.29;
		this.side = 1;
		this.kind = null;
		this.phase = 1;
		this.T = 1.15;
		this.wet = false; // the blade's in the water
		this.rest = 1; // 1: the paddle's across the lap
		this.park = 1; // 1: laid along the gunwale: nobody's in her, or the rod's out
		this.held = false; // something else in your hands (Seat)
		this.power = 1; // a better paddle (Fleet's kayakPaddle): speedMul
		this.events = [];
		this.thrust = 0;
		// the pose now (eased between strokes)
		this.swing = 0;
		this.tilt = 0;
		this.hub = REST.hub;
		this._from = { swing: 0, tilt: 0, hub: REST.hub };
		this.tow = new Vector3(); // N (world): a fish on the line (KayakModel.play)
		this._b = new Vector3();
		this._prev = new Vector3();
		this._hasPrev = false;

	}

	// the next stroke, from what's asked of her (f: ahead, s: to port)
	_next( f, s ) {

		const as = Math.abs( s );
		let side = - this.side, kind = null;
		const far = s > 0 ? - 1 : 1;
		if ( f > 0.05 ) {

			kind = 'ahead';
			if ( as > 0.6 ) {

				side = far;
				kind = 'sweep';

			} else if ( as > 0.15 && side !== far ) kind = 'light';

		} else if ( f < - 0.05 ) {

			kind = 'astern';
			if ( as > 0.6 ) side = - far;

		} else if ( as > 0.05 ) {

			// on the spot: a sweep ahead on the far side, a sweep astern on the near
			kind = this.side === far && this.kind === 'sweep' ? 'sweepAstern' : 'sweep';
			side = kind === 'sweep' ? far : - far;

		}

		return kind ? { kind, side, f: Math.max( Math.abs( f ), as * 0.8 ) } : null;

	}

	// a stroke's time (s), from how hard: a light 1.75, the usual 1.1, flat out 0.74
	_time( f ) {

		const k = Math.abs( f );
		return ( k < 0.7 ? lerp( 1.75, 1.09, k / 0.7 ) : lerp( 1.09, 0.74, ( k - 0.7 ) / 0.3 ) ) / this.power;

	}

	// one integrator step. Moves the paddle and returns its blade's depth of water (m, >0 in it), or leaves it alone
	step( ctl ) {

		// (taken up as you sit down, laid by when you've something else in your hands)
		this.park = clamp( this.park + ( ctl.driven && ! this.held ? - H * 2.4 : H * 1.6 ), 0, 1 );
		const asked = ctl.driven && ! this.park ? ctl.throttleTarget || 0 : 0, turn = ctl.driven && ! this.park ? ctl.steerTarget || 0 : 0;
		this.phase += H / this.T;
		if ( this.phase >= 1 ) {

			const next = this._next( asked, turn );
			this._from.swing = this.swing;
			this._from.tilt = this.tilt;
			this._from.hub = this.hub;
			if ( next ) {

				this.side = next.side;
				this.kind = next.kind;
				this.T = this._time( next.f );
				this.phase = 0;

			} else {

				this.kind = null;
				this.phase = 0;
				this.T = 0.9;

			}

		}

		const K = this.kind ? KINDS[ this.kind ] : null, side = this.side;
		let swing, tilt, hub;
		if ( K ) {

			const reach = Math.min( 1, this.phase / 0.2 ); // (reaching out to the catch, then the pull)
			const pull = smooth( clamp( ( this.phase ) / IN_WATER, 0, 1 ) );
			swing = side * lerp( K.from, K.to, pull );
			tilt = side * K.tilt;
			hub = K.hub;
			const k = smooth( reach );
			// (the catch taken from wherever the paddle was)
			swing = lerp( this._from.swing, swing, k );
			tilt = lerp( this._from.tilt, tilt, k );
			hub = lerp( this._from.hub, hub, k );
			this.rest = Math.max( 0, this.rest - H * 3 );

		} else {

			const k = smooth( clamp( this.phase, 0, 1 ) );
			swing = lerp( this._from.swing, REST.swing, k );
			tilt = lerp( this._from.tilt, REST.tilt, k );
			hub = lerp( this._from.hub, REST.hub, k );
			this.rest = Math.min( 1, this.rest + H * 2 );

		}

		// (past the pull she's lifting out; held there until the next stroke takes it up)
		if ( K && this.phase > IN_WATER ) {

			const lift = smooth( clamp( ( this.phase - IN_WATER ) / ( 1 - IN_WATER ), 0, 1 ) );
			tilt = side * K.tilt * ( 1 - lift * 0.55 );

		}

		this.swing = swing;
		this.tilt = tilt;
		this.hub = hub;

	}

	// The working blade's middle, boat frame
	bladeAt( out ) {

		// (the shaft from its middle toward its port end, and along it to the working side)
		const c = Math.cos( this.tilt ), s = this.side;
		return out.set( s * REACH * c * Math.cos( this.swing ), this.hub - s * REACH * Math.sin( this.tilt ), this.z + s * REACH * c * Math.sin( this.swing ) );

	}

	// the paddle's pose, boat frame: where its middle is, and its shaft's direction (toward its port end). Eased onto
	// the gunwale's clip with the rod out
	pose( mid, dir ) {

		const sin = Math.sin( this.tilt ), c = Math.cos( this.tilt );
		mid.set( 0, this.hub, this.z );
		dir.set( c * Math.cos( this.swing ), - sin, c * Math.sin( this.swing ) );
		if ( this.park > 0 ) {

			const k = smooth( this.park );
			mid.lerp( _park, k );
			dir.lerp( _parkDir, k ).normalize();

		}

	}

	// the stroke as it goes to the others, and taken up from them (together/): the shaft's swing, tilt, height, and how far
	// it's laid by
	get wire() {

		return [ Math.round( this.swing * 100 ) / 100, Math.round( this.tilt * 100 ) / 100, Math.round( this.hub * 100 ) / 100, Math.round( this.park * 10 ) / 10 ];

	}

	set wire( w ) {

		this.swing = w[ 0 ];
		this.tilt = w[ 1 ];
		this.hub = w[ 2 ];
		this.park = w[ 3 ];

	}

	// where the hands are on the shaft, boat frame (the paddler's arms reach to these)
	hands( right, left, mid, dir ) {

		// (+x is port: the left hand's on the port side)
		left.copy( mid ).addScaledVector( dir, GRIP );
		right.copy( mid ).addScaledVector( dir, - GRIP );

	}

}

const _park = new Vector3( - 0.385, 0.215, - 0.02 ), _parkDir = new Vector3( 0.05, - 0.02, 1 ).normalize();

const _bw = new Vector3(), _f = new Vector3(), _rod = new Vector3( 0, 0.5, 0.25 );
const LEAN = 62; // N m: 80 kg moved 8 cm
// her port direction's x and z in the world
const side0 = ( q ) => 1 - 2 * ( q.y * q.y + q.z * q.z );
const side2 = ( q ) => 2 * ( q.x * q.z - q.w * q.y );

// The paddle, in place of Handling's propellerAndRudder. q: as there, and torque, the moment on her so far (world)
export function paddling( ctl, q ) {

	const st = ctl.model.stroke;
	// (a fish on: it tows her round, by the rod in your hands)
	if ( st.tow.lengthSq() > 0 ) q.addForceAt( st.tow, ctl.toWorld( _rod, _bw ) );
	st.step( ctl );
	st.bladeAt( st._b );
	// (the blade's speed through the kayak's frame)
	if ( ! st._hasPrev ) st._prev.copy( st._b );
	const kx = ( st._b.x - st._prev.x ) / H, kz = ( st._b.z - st._prev.z ) / H;
	st._prev.copy( st._b );
	st._hasPrev = true;
	ctl.toWorld( st._b, _bw );
	const K = st.kind ? KINDS[ st.kind ] : null;
	// you lean against her heel, as anyone would, as much as moving your weight 8 cm will do (Seat: less with a rod in your hands)
	if ( ctl.driven ) {

		const q2 = ctl.quaternion, heel = 2 * ( q2.x * q2.y - q2.w * q2.z ) * side0( q2 ) + 2 * ( q2.y * q2.z + q2.w * q2.x ) * side2( q2 );
		q.torque.addScaledVector( q.fwd, clamp( heel * 500, - LEAN, LEAN ) * ( st.park > 0.5 ? 0.5 : 1 ) );

	}

	const depth = ctl.sampleWaterAt( _bw ) - _bw.y;
	const inPull = !! K && st.phase < IN_WATER && st.phase > 0.04;
	const wet = inPull ? clamp( ( depth + 0.12 ) / 0.2, 0, 1 ) : 0;
	const was = st.wet;
	st.wet = wet > 0.05;
	if ( st.wet !== was ) st.events.push( { kind: st.wet ? 'catch' : 'exit', side: st.side, at: st._b.clone(), f: Math.abs( kz ) } );
	st.thrust = 0;
	if ( wet === 0 ) return;

	// the water's speed past the blade in her frame: her own, at the blade (yaw swings it), and the stroke's
	const { addForceAt, fwd, side, u, vs, aLoc, comZ } = q;
	const vz = u + kz, vx = vs + aLoc.y * ( st._b.z - comZ ) + kx;
	// the blade's face is square to the shaft: what it meets is what's square to that
	const nz = Math.cos( st.swing ), nx = - Math.sin( st.swing );
	const vn = vz * nz + vx * nx;
	let F = 0.5 * RHO * CD * BLADE * st.power * wet * vn * Math.abs( vn );
	F = clamp( F, - MOST, MOST );
	// (she's pushed against the blade's motion)
	_f.copy( fwd ).multiplyScalar( - F * nz ).addScaledVector( side, - F * nx );
	addForceAt( _f, _bw );
	st.thrust = - F * nz;
	ctl.thrust = st.thrust;
	// (and a sweep's done with her edged over, which swings a rockered hull round her own middle)
	if ( st.kind === 'sweep' ) q.torque.y += - st.side * Math.min( Math.abs( u ), 2 ) * 13 * wet;
	// a blade in the water steadies her: the low brace
	q.torque.addScaledVector( fwd, - aLoc.z * 34 * wet );

}

const DEG = Math.PI / 180;

// a 12 ft, 0.8 m sit-on-top with someone in her, 125 kg: quick in her motion, stiff enough to fish from (GM about a
// quarter of a metre: rolls in about a second and a half), very little of her in the wind or in the water
export const KAYAK_HANDLING = {
	windArea: [ 0.42, 1.25 ],
	windCd: 0.9,
	windY: 0.44, // (the paddler's the most of it)
	windLead: 1.1,
	rightFrom: 46 * DEG, // (past what you could hold her at: Capsize.js. Nobody aboard, she never quite goes over)
	rightK: 2200,
	// ((v2.0.1) and before it her own: her samples hold her only to a GZ of about 0.03 m, and from there a breath of wind or a
	// wave on her beam flopped her over, past where she's over (Capsize.js). Hard to roll with the wind alone, as a sit-on-top
	// is; it's a breaker on her beam that puts her over, Capsize.js)
	early: { from: 5 * DEG, k: 600, fade: [ 24 * DEG, 40 * DEG ] },
	rollInertia: 1,
	addedMass: [ 0.45, 0.6, 0.05 ],
	addedInertia: [ 0.8, 0.45, 0.2 ],
	waterplane: [ 1, 0.88 ],
	stations: [ [ - 1.45, 0.03 ], [ - 0.95, 0.05 ], [ - 0.45, 0.058 ], [ 0.05, 0.058 ], [ 0.55, 0.048 ], [ 1.05, 0.03 ], [ 1.4, 0.012 ] ],
	lateralY: - 0.05,
	hullLift: 0.85,
	bank: 0,
	wetDepth: 0.06,
	heave: [ 900, 500 ],
	damping: [ 300, 14, 26, 3 ],
	// friction and form (Cf 0.0037 over her 2.6 m^2, form factor 1.2): 5.9 u^2 N; and wave-making past Froude 0.3, the hump
	// at her hull speed, 4.4 knots: 18 N at 3 knots, about 60 flat out
	resistance: ( au ) => 2 * au + 5.9 * au * au + 20 * MathUtils.smoothstep( au, 1.5, 2.6 ) * au,
	trim: () => 0,
	rise: () => 0,
	contacts: [ [ 0, - 0.12, 0 ], [ 0, - 0.1, 1.05 ], [ 0, 0.06, 1.68 ], [ 0, - 0.08, - 1.4 ], [ 0, - 0.03, - 1.86 ], [ 0.3, - 0.06, - 0.2 ], [ - 0.3, - 0.06, - 0.2 ] ],
	outline: [ [ 0, 0.1, 1.72 ], [ 0.34, 0.1, 0.6 ], [ - 0.34, 0.1, 0.6 ], [ 0.38, 0.1, - 0.4 ], [ - 0.38, 0.1, - 0.4 ], [ 0.2, 0.1, - 1.65 ], [ - 0.2, 0.1, - 1.65 ] ],
	bowZ: 1.7,
	sternZ: - 1.85,
	engine: null,
	propulsion: paddling,
	rudder: null,
	// (she's light: the controller's grounding and mooring, made for tons, would throw her about)
	contact: { k: 40000, c: 1400, slide: 300, pileK: 9000, pileC: 500 },
	mooring: { k: 260, c: 180, yawK: 90, yawC: 70 },
	plastic: true, // nothing she meets wears her, and she drains herself: her scuppers
};
