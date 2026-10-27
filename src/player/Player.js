import * as THREE from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';
import { HOUSE } from '../world/boat/Wheelhouse.js';
import { TUMBLE_H } from '../ocean/ShoreWaves.js';
import { G } from '../core/Globals.js';

// (M13) The wind on someone standing in it: what it drives them along at (m/s) against their footing, in
// wind U (m/s). A person's drag (1/2 rho Cd A U^2, Cd A about 0.7 m^2, 75 kg) is a fifth of their weight in a
// gale's 20 m/s, over two thirds in a hurricane's 35; past SHOVE_FROM of it (a strong gale's, Beaufort
// 9-10: "walking very difficult") their footing gives, and they're pushed along by SHOVE_K m/s for each
// share of their weight past it: in a hurricane's wind about as fast as they walk, faster in its gusts.
// They lean into it (LEAN rad the view rolls for each m/s it pushes them across the way they face)
export const SHOVE_FROM = 0.3, SHOVE_K = 6.25, LEAN = 0.025;
export function windShove( U ) {

	return Math.max( 0, 0.5 * 1.2 * 0.7 * U * U / ( 75 * 9.81 ) - SHOVE_FROM ) * SHOVE_K;

}

const HOUSE_HELM = { x: HOUSE.helmX, z: HOUSE.seatZ };

const EYE = 1.62;
const SWIM_EYE = EYE * 0.1; // eyes above the body's float point while swimming
const RADIUS = 0.3;
const HEIGHT = 1.75;
// water depth (mean level over the feet) where you start swimming / find your feet again
const SWIM_DEPTH = 1.35;
const STAND_DEPTH = 1.1;
// (Salt Life) a held breath (s, finning at an easy pace: faster kicking hard, slower keeping still)
// and how long it takes to get it all back at the surface (s)
export const BREATH = 50;
const BREATH_BACK = 10;
// (M12) a breaker past TUMBLE_H (ShoreWaves.js), this far broken (plunging), tumbles a swimmer it breaks
// on: carried toward the beach for up to TUMBLE_S s (at TUMBLE_CARRY m/s at first), rolled over and held
// under (TUMBLE_DOWN m), and out of breath by up to TUMBLE_BREATH s; the more, the bigger it is (in full
// TUMBLE_SPAN m higher). Dived under it, more than TUMBLE_UNDER of its height, it passes over
const TUMBLE_B = 0.85;
const TUMBLE_SPAN = 1.4;
const TUMBLE_S = [ 1.3, 2.4 ];
const TUMBLE_CARRY = [ 1.8, 3.2 ];
const TUMBLE_DOWN = [ 0.7, 1.6 ];
const TUMBLE_BREATH = [ 2, 6 ];
const TUMBLE_UNDER = 0.55;
const GASP = 3; // s at the surface after a blackout before you can dive again

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler( 0, 0, 0, 'YXZ' );
const _yAxis = new THREE.Vector3( 0, 1, 0 );
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _wish = new THREE.Vector3();
// walking on the boat
const DECK_RADIUS = 0.24;
const DECK_STEP = 0.36; // highest ledge you step up onto
const HELM_REACH = 0.75; // m from the helm seat to take the wheel

// First-person walker / swimmer / boat captain.
//   walk : capsule on terrain + walkable colliders, wading slows you down
//   swim : floats with the head at the surface; look down + W (or C) to dive, Space to rise. (Salt
//          Life) Under water you hold your breath (breath); out of it you black out and float up.
//          With the speargun out (stalk) you fin slowly along, kicking hard with Shift
//   deck : aboard, walking in the boat's frame (it moves and rocks under you); E at the helm
//          takes the wheel, E near a pier / the beach steps ashore
//   boat : at the helm, driving; V toggles helm (1st person) / chase (3rd person) camera, E stands up
export class Player {

	constructor( { camera, input, terrain, colliders, query, boat, reef = null, audio = null } ) {

		this.camera = camera;
		this.input = input;
		this.terrain = terrain;
		this.colliders = colliders;
		this.query = query;
		this.boat = boat;
		this.ownBoat = boat; // (Salt Life) yours; this.boat is another player's while you ride along (ride)
		this.riding = false;
		// (M10) there's water to bail on your own boat's deck (Game.updateBail): the rail's "Jump overboard"
		// makes way for the bucket
		this.bailable = false;
		this.rideOffer = null; // { name, boat }: someone's boat you're next to, aboard it (together/Together.js)
		this.reef = reef;
		this.audio = audio;

		this.mode = 'walk';
		this.camMode = 'third';
		const start = WORLD.start || WORLD.spawn;
		this.position = new THREE.Vector3().copy( start.position );
		// standing on whatever is there (the boardwalk planks), not in it
		this.position.y = Math.max( terrain.heightAt( this.position.x, this.position.z ), colliders ? colliders.groundHeightAt( this.position.x, this.position.z, 50 ) : - Infinity );
		this.velocity = new THREE.Vector3();
		this.yaw = start.yaw;
		this.pitch = - 0.05;
		this.grounded = false;
		this.bob = 0;
		this.stepDist = 0;
		this.waterH = 0;
		this.waterMean = null; // water level low-passed over the passing waves (mode decisions)
		this.wade = 0;
		// eye height easing between modes (critically damped offset from the mode's eye height)
		this.camOff = 0;
		this.camOffV = 0;
		this._camY = null;
		this.floating = true; // swimming at the surface (riding the waves) vs. free under water
		this.under = false; // (Salt Life) the head under water
		this.breath = BREATH; // s of breath left
		this.breathMax = BREATH;
		this.breathPaused = false; // (the game: while a catch card is up, the world waits)
		this.blackout = 0; // 1 while blacked out and floating up, then the gasp at the surface (s)
		this.blackouts = 0; // how many times (the game notices a new one)
		// (M12) the surf: its current where you swim (a rip's: ShoreWaves.currentAt), how long you've been
		// carried out by one; and a breaker tumbling you (tumble: s left of it, tumbles: how many times)
		this.current = { x: 0, z: 0, rip: 0 };
		this.inRip = 0;
		this.tumble = 0;
		this.tumbles = 0;
		this.roll = 0;
		this.lean = 0; // (M13) leaning into a hurricane's wind (rad: the view's roll)
		this.windAt = null; // (M13) the wind's speed at ( x, z ), in its gusts (m/s: App, the weather's)
		this.sheltered = false; // (M13) out of the wind (the shelter: App)
		this._tumble = { T: 1, k: 0, dx: 0, dz: 1, spin: 1 };
		this._breaker = { n: 0, H: 0, b: - 9, dx: 0, dz: 1 };
		this._crest = null;
		this.stalk = false; // set by the game: the speargun is out (a slow, quiet pace under water)
		this.slot = query.allocate( 'player', 1 );
		this.prompt = null;
		this.surface = 'sand';

		// boat cameras
		this.orbitYaw = 0;
		this.orbitPitch = 0.22;
		this.orbitDist = 13;
		this.helmYaw = 0;
		this.helmPitch = - 0.05;
		this.camPos = new THREE.Vector3();
		this.camInit = false;
		this.wasUnder = false;

		// on deck: position and heading in the boat frame (+Z forward, yaw 0 looks forward)
		this.deckPos = new THREE.Vector3();
		this.deckVel = new THREE.Vector3();
		this.deckYaw = 0;
		this.deckGrounded = true;
		this._ashore = null; // cached step-ashore target
		this._ashoreT = 0;
		// set by the fishing game: while a line is out the helm / step ashore prompts give way
		this.busy = false;

	}

	// view direction in world space (for casting); works in every mode
	getViewDir( out ) {

		return out.set( 0, 0, - 1 ).applyQuaternion( this.camera.quaternion );

	}

	// ------------------------------------------------------------------ helpers

	waterHeight() {

		const q = this.query;
		if ( ! q.cpuValid ) return G.seaLevel.value;
		const h = q.cpu[ this.slot * 4 ];
		return Number.isFinite( h ) ? h : this.waterH || G.seaLevel.value;

	}

	groundAt( x, z, maxY ) {

		let g = this.terrain.heightAt( x, z );
		const c = this.colliders.groundHeightAt( x, z, maxY );
		if ( c > g ) g = c;
		if ( this.reef && this.reef.floorHeightAt ) g = Math.max( g, this.reef.floorHeightAt( x, z ) );
		return g;

	}

	nearBoat() {

		// ((M13) not on her cradle ashore)
		if ( ! this.boat || this.boat.hauled ) return false;
		const bp = this.boat.toWorld( this.boat.model.boardPoint, _v );
		const d = Math.hypot( bp.x - this.position.x, bp.z - this.position.z );
		const dy = Math.abs( bp.y - this.position.y );
		return d < 4.2 && dy < 3.2;

	}

	// ------------------------------------------------------------------ update

	update( dt ) {

		const inp = this.input;
		this.query.setPoint( this.slot, this.position.x, this.position.z );
		this.waterH = this.waterHeight();
		this.waterMean = this.waterMean === null ? this.waterH : this.waterMean + ( this.waterH - this.waterMean ) * ( 1 - Math.exp( - dt / 4 ) );
		this.prompt = null;
		// ((M12) a tumble ends when you're out of the water, or find your feet)
		if ( this.mode !== 'swim' ) this.tumble = this.roll = this.inRip = 0;

		if ( this.mode === 'boat' ) {

			this.updateBoat( dt );
			return;

		}

		if ( this.mode === 'deck' ) {

			this.updateDeck( dt );
			return;

		}

		const look = inp.consumeLook();
		this.yaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );

		// (not with a line out or a fish in hand: E belongs to the fishing then)
		const offer = this.rideOffer;
		if ( offer && ! this.busy ) {

			this.prompt = { key: 'E', text: `Board ${ offer.name }'s boat` };
			if ( inp.hit( 'KeyE' ) ) {

				this.ride( offer.boat );
				return;

			}

		} else if ( this.nearBoat() && ! this.busy ) {

			this.prompt = { key: 'E', text: 'Board boat' };
			if ( inp.hit( 'KeyE' ) ) {

				this.boardBoat();
				return;

			}

		}

		const prevMode = this.mode;
		if ( this.mode === 'walk' ) this.updateWalk( dt );
		else this.updateSwim( dt );
		// (E boards their boat before anything else here: say so)
		if ( offer && ! this.busy ) this.prompt = { key: 'E', text: `Board ${ offer.name }'s boat` };

		// camera. Wading out of your depth, finding your feet again or climbing out on a ladder
		// changes the eye height: ease the view there (critically damped) instead of jumping
		const eye = this.position.clone();
		if ( this.mode === 'walk' ) eye.y += EYE + Math.sin( this.bob ) * 0.035 * ( 1 - 0.6 * this.wade );
		else eye.y += SWIM_EYE;
		if ( this._camY === null || this.camera.position.y !== this._camY ) {

			// something else drove the camera since our last frame (free camera, boat): start fresh
			this.camOff = 0;
			this.camOffV = 0;

		} else if ( this.mode !== prevMode ) {

			this.camOff = this._camY - eye.y;

		}

		const w = 6, e = Math.exp( - w * dt ), j = ( this.camOffV + w * this.camOff ) * dt;
		this.camOff = ( this.camOff + j ) * e;
		this.camOffV = ( this.camOffV - w * j ) * e;
		eye.y += this.camOff;
		this.camera.position.copy( eye );
		this._camY = this.camera.position.y;
		this.camera.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, this.roll ) );

	}

	// (M12) the surf where you swim: carried by its current (a rip's seaward through its channel, the
	// feeders along the beach into it), and tumbled by a big breaker as it breaks on you
	surf( dt ) {

		const p = this.position, q = this.query;
		if ( ! q.currentAt ) return;
		const c = q.currentAt( p.x, p.z, undefined, this.current );
		p.x += c.x * dt;
		p.z += c.z * dt;
		this.inRip = c.rip > 0.5 && Math.hypot( c.x, c.z ) > 0.2 ? this.inRip + dt : 0;
		const br = q.breakerAt( p.x, p.z, undefined, this._breaker );
		if ( ! br ) return;
		const passed = this._crest !== null && br.n === this._crest + 1;
		this._crest = br.n;
		if ( passed && this.tumble <= 0 && this.blackout === 0 && br.b > TUMBLE_B && br.H > TUMBLE_H && p.y > ( this.waterMean ?? this.waterH ) - TUMBLE_UNDER * br.H ) {

			const k = Math.min( 1, ( br.H - TUMBLE_H ) / TUMBLE_SPAN ), T = this._tumble;
			T.T = this.tumble = THREE.MathUtils.lerp( TUMBLE_S[ 0 ], TUMBLE_S[ 1 ], k );
			T.k = k;
			T.dx = br.dx;
			T.dz = br.dz;
			T.spin = Math.random() < 0.5 ? - 1 : 1;
			this.tumbles ++;
			this.floating = false;
			this.breath = Math.max( 0, this.breath - THREE.MathUtils.lerp( TUMBLE_BREATH[ 0 ], TUMBLE_BREATH[ 1 ], k ) );
			if ( this.audio ) this.audio.splash( 0.6 + 0.4 * k, p );

		}

	}

	updateWalk( dt ) {

		const inp = this.input;
		this.breathe( dt, false, false );
		_fwd.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( - _fwd.z, 0, _fwd.x );
		const wish = new THREE.Vector3();
		if ( inp.down( 'KeyW' ) ) wish.add( _fwd );
		if ( inp.down( 'KeyS' ) ) wish.sub( _fwd );
		if ( inp.down( 'KeyD' ) ) wish.add( _right );
		if ( inp.down( 'KeyA' ) ) wish.sub( _right );
		// analog sticks (touch, gamepad) walk as fast as they're pushed
		if ( inp.move ) wish.addScaledVector( _fwd, inp.move.y ).addScaledVector( _right, inp.move.x );
		if ( wish.lengthSq() > 1 ) wish.normalize();

		const depth = this.waterH - this.position.y; // water depth at the feet
		const wade = THREE.MathUtils.clamp( depth / 1.2, 0, 1 );
		this.wade = wade;
		const sprint = inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' );
		const speed = ( sprint ? 6.2 : 3.0 ) * THREE.MathUtils.lerp( 1, 0.42, wade );
		const accel = this.grounded ? 14 : 2.5;
		const k = 1 - Math.exp( - accel * dt );
		// ((M13) in a strong gale's wind and up you're pushed along by it, staggered in its gusts, leaning
		// into it; the water about your legs holds you a little)
		const U = this.sheltered ? 0 : this.windAt ? this.windAt( this.position.x, this.position.z ) : G.windSpeed.value;
		const shove = windShove( U ) * ( 1 - 0.5 * wade ), wd = G.windDir.value;
		this.velocity.x += ( wish.x * speed + wd.x * shove - this.velocity.x ) * k;
		this.velocity.z += ( wish.z * speed + wd.y * shove - this.velocity.z ) * k;
		this.lean += ( - ( wd.x * _right.x + wd.y * _right.z ) * shove * LEAN - this.lean ) * ( 1 - Math.exp( - dt * 3 ) );
		this.roll = this.lean;

		if ( this.grounded && inp.hit( 'Space' ) && depth < 0.9 ) {

			this.velocity.y = 4.6;
			this.grounded = false;

		}

		this.velocity.y -= 9.81 * dt;
		// water drag while wading
		if ( depth > 0 ) this.velocity.multiplyScalar( Math.exp( - dt * depth * 0.8 ) );

		const p = this.position;
		const old = p.clone();
		p.addScaledVector( this.velocity, dt );
		this.colliders.resolveCapsule( p, RADIUS, HEIGHT, 0.4 );
		const g = this.groundAt( p.x, p.z, p.y + 0.45 );
		if ( p.y <= g ) {

			p.y = g;
			if ( this.velocity.y < 0 ) this.velocity.y = 0;
			this.grounded = true;

		} else {

			this.grounded = p.y - g < 0.06;

		}

		// head bob + footsteps
		const moved = Math.hypot( p.x - old.x, p.z - old.z );
		if ( this.grounded ) {

			this.bob += moved * 2.4;
			this.stepDist += moved;
			const stride = sprint ? 0.9 : 0.62;
			if ( this.stepDist > stride ) {

				this.stepDist = 0;
				this.surface = this.surfaceType( depth );
				if ( this.audio ) this.audio.footstep( this.surface );

			}

		}

		// out of your depth -> swim. Wading in, the body lifts into the floating position at the
		// surface and the view eases down to it (update()); falling in off the pier plunges under
		// and floats back up.
		if ( this.waterMean - p.y > SWIM_DEPTH ) {

			const wadedIn = this.grounded;
			this.mode = 'swim';
			if ( wadedIn ) p.y = Math.max( p.y, this.waterH - SWIM_EYE + 0.1 );
			this.velocity.y = wadedIn ? 0 : Math.max( this.velocity.y * 0.3, - 2.5 );
			if ( this.audio ) this.audio.splash( wadedIn ? 0.2 : 0.5, p );

		}

	}

	surfaceType( depth ) {

		const p = this.position;
		if ( depth > 0.12 ) return 'water';
		const onWood = this.colliders.groundHeightAt( p.x, p.z, p.y + 0.1 ) > this.terrain.heightAt( p.x, p.z ) + 0.05;
		if ( onWood ) return 'wood';
		// ((M13) the wet sand at the water's edge, where the surge has moved it)
		const h = this.terrain.heightAt( p.x, p.z ) - G.seaLevel.value;
		if ( h < 0.6 ) return 'wetsand';
		if ( h + G.seaLevel.value > 3.6 ) return 'grass';
		return 'sand';

	}

	updateSwim( dt ) {

		const inp = this.input;
		const p = this.position;
		const surfaceY = this.waterH;
		// look-relative movement (diving follows the view)
		_fwd.set( 0, 0, - 1 ).applyEuler( _e.set( this.pitch, this.yaw, 0 ) );
		_right.set( - Math.cos( this.yaw ), 0, Math.sin( this.yaw ) ).negate();
		const wish = new THREE.Vector3();
		if ( inp.down( 'KeyW' ) ) wish.add( _fwd );
		if ( inp.down( 'KeyS' ) ) wish.sub( _fwd );
		if ( inp.down( 'KeyD' ) ) wish.add( _right );
		if ( inp.down( 'KeyA' ) ) wish.sub( _right );
		if ( inp.down( 'Space' ) ) wish.y += 1;
		if ( inp.down( 'KeyC' ) || inp.down( 'ControlLeft' ) ) wish.y -= 1;
		if ( inp.move ) wish.addScaledVector( _fwd, inp.move.y ).addScaledVector( _right, inp.move.x );
		if ( wish.lengthSq() > 1 ) wish.normalize();

		const atSurface = this.floating && p.y > surfaceY - 0.45;
		// at the surface W along a level view keeps you on top; looking down dives
		if ( atSurface && wish.y > - 0.25 && ! inp.down( 'KeyC' ) ) wish.y = Math.max( wish.y, 0 );
		// (Salt Life) blacked out: limp, floating up to the surface; then a few breaths before diving
		if ( this.blackout === 1 ) wish.set( 0, 1, 0 );
		else if ( this.blackout > 0 ) wish.y = Math.max( wish.y, 0 );
		// ((M12) tumbled in a breaker: no say in it until it lets you go)
		if ( this.tumble > 0 ) wish.set( 0, 0, 0 );

		const sprint = ( inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' ) ) && this.blackout !== 1;
		// (Salt Life) hunting with the speargun: a slow, quiet glide along (fish notice a fast diver
		// sooner: world/Fish.js), still brisk going down or coming up
		const stalking = this.stalk && ! this.floating;
		const level = wish.lengthSq() > 1e-4 ? Math.abs( wish.y ) / wish.length() : 0;
		const speed = this.blackout === 1 ? 0.9 : sprint ? 2.5 : stalking ? 0.7 + 0.8 * Math.min( 1, level * 1.5 ) : 1.5;
		const k = 1 - Math.exp( - dt * 3.0 );
		this.velocity.lerp( wish.multiplyScalar( speed ), k );

		// A swimmer at the surface floats with the head riding the waves; one who dives stays where
		// they swim to (neutral buoyancy, nothing pulls them back up) until they swim up to the
		// surface again.
		const eyeTarget = surfaceY - SWIM_EYE + 0.1; // eyes ~10 cm above the water; waves still wash over
		const diving = this.blackout === 0 && ( inp.down( 'KeyC' ) || ( inp.down( 'KeyW' ) && this.pitch < - 0.35 ) || wish.y < - 0.1 );
		if ( diving ) this.floating = false;
		else if ( p.y > eyeTarget - 0.15 ) this.floating = true;
		if ( this.floating ) {

			p.y += ( eyeTarget - p.y ) * ( 1 - Math.exp( - dt * 5 ) );
			if ( this.velocity.y > 0 ) this.velocity.y *= 0.5;

		}

		p.addScaledVector( this.velocity, dt );
		// (M12) the surf's current carries you; a breaker tumbles you over and under, toward the beach
		this.surf( dt );
		if ( this.tumble > 0 ) {

			const T = this._tumble, f = 1 - this.tumble / T.T, k = T.k;
			const carry = THREE.MathUtils.lerp( TUMBLE_CARRY[ 0 ], TUMBLE_CARRY[ 1 ], k ) * ( 1 - f );
			p.x += T.dx * carry * dt;
			p.z += T.dz * carry * dt;
			const down = surfaceY - SWIM_EYE - THREE.MathUtils.lerp( TUMBLE_DOWN[ 0 ], TUMBLE_DOWN[ 1 ], k ) * Math.sin( Math.PI * Math.min( 1, f * 1.4 ) );
			p.y += ( down - p.y ) * ( 1 - Math.exp( - dt * 6 ) );
			this.roll = T.spin * Math.sin( Math.PI * f ) * ( 0.9 + 1.6 * k ) + Math.sin( f * 17 ) * 0.12 * ( 1 - f );
			this.tumble = Math.max( 0, this.tumble - dt );
			if ( this.tumble === 0 ) {

				this.roll = 0;
				this.floating = true;

			}

		}

		p.y = Math.min( p.y, surfaceY + 0.05 );
		this.colliders.resolveCapsule( p, RADIUS, 1.0, 0 );
		const g = this.groundAt( p.x, p.z, p.y + 0.3 );
		if ( p.y < g + 0.25 ) p.y = g + 0.25;

		// strokes / bubbles
		this.stepDist += this.velocity.length() * dt;
		if ( this.stepDist > 1.3 ) {

			this.stepDist = 0;
			if ( this.audio ) this.audio.swimStroke();

		}

		const under = this.camera.position.y < surfaceY - 0.05;
		if ( under !== this.wasUnder && this.audio ) {

			if ( under ) this.audio.submerge();
			else this.audio.emerge();

		}

		this.wasUnder = under;
		this.breathe( dt, under, sprint );

		// shallow enough to stand -> walk (update() eases the view up to standing height). The mean
		// level decides, so a passing wave doesn't flip you between swimming and standing.
		if ( this.waterMean - g < STAND_DEPTH ) {

			this.mode = 'walk';
			p.y = g;
			this.velocity.set( this.velocity.x, 0, this.velocity.z );

		}

		// ladders on the pier: climb out when swimming into them
		if ( this.colliders.boxes ) {

			for ( const b of this.colliders.boxes ) {

				if ( b.tag !== 'ladder' ) continue;
				if ( Math.hypot( b.center.x - p.x, b.center.z - p.z ) < 1.1 ) {

					this.prompt = { key: 'Space', text: 'Climb ladder' };
					if ( inp.down( 'Space' ) || inp.down( 'KeyW' ) ) {

						const top = this.colliders.groundHeightAt( b.center.x, b.center.z, 10 );
						if ( top > p.y ) {

							p.y += dt * 1.6;
							if ( p.y > top - 1.0 ) {

								// step onto the deck
								const deck = WORLD.pier.deckHeight;
								p.set( b.center.x - Math.sign( b.center.x - WORLD.pier.x ) * 1.2, deck, b.center.z );
								this.mode = 'walk';
								this.velocity.set( 0, 0, 0 );

							}

						}

					}

					break;

				}

			}

		}

	}

	// (Salt Life) the held breath: it runs down with the head under water (faster kicking hard, slower
	// keeping still) and comes back at the surface. Out of it: a blackout (the swimmer floats up), then
	// a few breaths at the surface before the next dive
	breathe( dt, under, sprint ) {

		this.under = under;
		if ( under ) {

			if ( this.breathPaused ) return;
			const rate = sprint ? 1.8 : this.velocity.lengthSq() < 0.09 ? 0.7 : 1;
			this.breath = Math.max( 0, this.breath - dt * rate );
			if ( this.breath === 0 && this.blackout === 0 ) {

				this.blackout = 1;
				this.blackouts ++;
				this.floating = false;

			}

		} else {

			this.breath = Math.min( BREATH, this.breath + dt * BREATH / BREATH_BACK );
			if ( this.blackout === 1 ) this.blackout = 1 + GASP;
			else if ( this.blackout > 1 ) this.blackout = Math.max( 0, this.blackout - dt ) || 0;
			if ( this.blackout > 0 && this.blackout <= 1 ) this.blackout = 0;

		}

	}

	// ------------------------------------------------------------------ boat

	// (Salt Life) aboard someone else's boat (together/Together.js: a stand-in with the boat's shape and
	// their boat's pose): on its deck while they drive; you can't take their helm
	ride( boat ) {

		this.boat = boat;
		this.riding = true;
		this.boardBoat();

	}

	// back to your own boat (after stepping off theirs)
	unride() {

		this.boat = this.ownBoat;
		this.riding = false;

	}

	// step aboard from the pier / beach / water: onto the cockpit sole at the boarding point
	boardBoat() {

		const b = this.boat;
		this.mode = 'deck';
		this.deckPos.copy( b.model.boardPoint );
		this.deckVel.set( 0, 0, 0 );
		// keep looking where you looked (relative to the boat)
		this.deckYaw = this.yaw - ( b.getYaw() + Math.PI );
		this.deckGrounded = true;
		this._ashore = null;
		this._ashoreT = 0;
		this.velocity.set( 0, 0, 0 );
		this._camY = null;
		this.deckToWorld();

	}

	// sit down at the helm and drive (the old "enter boat")
	takeHelm() {

		this.mode = 'boat';
		this.boat.driven = true;
		this.boat.moored = false;
		this.helmYaw = 0;
		this.helmPitch = - 0.05;
		this.orbitYaw = this.boat.getYaw() + Math.PI;
		this.camInit = false;
		if ( this.audio ) this.audio.engineStart();

	}

	// get up from the helm: stand beside the seat, looking forward
	leaveHelm() {

		const b = this.boat;
		b.driven = false;
		b.throttle = 0;
		this.mode = 'deck';
		this.deckPos.set( HOUSE_HELM.x + 0.45, b.model.lines.deckY, HOUSE_HELM.z - 0.1 );
		this.deckVel.set( 0, 0, 0 );
		this.deckYaw = this.helmYaw;
		this.pitch = this.helmPitch;
		this.deckGrounded = true;
		this._camY = null;
		if ( this.audio ) this.audio.engineStop();
		this.deckToWorld();

	}

	// enterBoat() kept for callers: straight to the helm
	enterBoat() {

		this.boardBoat();
		this.takeHelm();

	}

	// target: an ashoreTarget() spot; side: +1 / -1 jumps overboard on the starboard / port side
	exitBoat( target = null, side = 0 ) {

		const b = this.boat;
		const wasDriving = b.driven;
		b.driven = false;
		b.throttle = 0;
		// the exit point closest to something walkable (pier deck / sand)
		let best = side ? null : this.ashoreTarget();

		const dock = WORLD.boatDock.position;
		if ( ! this.riding && b.position.distanceTo( dock ) < 14 && b.speed < 1.5 ) {

			b.moored = true;
			b.mooring.anchor.set( b.position.x, 0, b.position.z );
			b.mooring.heading = b.getYaw();

		}

		if ( target ) best = target;
		if ( best ) {

			this.position.set( best.out.x, best.g, best.out.z );
			this.mode = 'walk';

		} else {

			const w = b.toWorld( new THREE.Vector3( 2.2 * ( side || 1 ), 0, 0 ), new THREE.Vector3() );
			// (the boat floats at the water line: the walker's water height is stale while aboard)
			this.waterH = this.waterMean = b.position.y;
			this.position.set( w.x, b.position.y - 0.2, w.z );
			this.mode = 'swim';
			if ( this.audio ) this.audio.splash( 0.8, this.position );

		}

		this.velocity.set( 0, 0, 0 );
		this.yaw = b.getYaw() + Math.PI;
		this._camY = null;
		if ( this.audio && wasDriving ) this.audio.engineStop();
		if ( this.riding ) this.unride();

	}

	// best walkable spot next to the boat (pier deck / sand / shallows), or null. Looks straight out
	// from the rail at each exit point (square to the hull, a few reaches: the boat swings on its
	// mooring) for ground from a little below the rail up to a pier deck a climb above it.
	ashoreTarget() {

		const b = this.boat;
		const water = this.query.cpuValid ? this.query.cpu[ 0 ] : G.seaLevel.value;
		// the boat's starboard (local +x) direction in the world, level
		const sx = _v2.set( 1, 0, 0 ).applyQuaternion( b.quaternion ).setY( 0 ).normalize();
		const rx = sx.x, rz = sx.z;
		let best = null, bestScore = Infinity;
		for ( const ep of b.model.exitPoints ) {

			const w = b.toWorld( ep, new THREE.Vector3() );
			const sgn = Math.sign( ep.x ) || 1;
			for ( const reach of [ 0.9, 1.4, 2.0 ] ) {

				const out = new THREE.Vector3( w.x + rx * sgn * reach, w.y, w.z + rz * sgn * reach );
				const g = this.groundAt( out.x, out.z, w.y + 2.5 );
				const up = g - w.y;
				if ( up > 1.7 || up < - 1.2 || g < water - 0.3 ) continue;
				const score = Math.abs( up ) + reach * 0.2;
				if ( score < bestScore ) { bestScore = score; best = { out, g, ep }; }

			}

		}

		return best;

	}

	// ------------------------------------------------------------------ deck

	// camera base orientation on the boat: its heading, with roll and pitch half stabilised
	deckBase( out ) {

		const b = this.boat;
		_qa.setFromAxisAngle( _yAxis, b.getYaw() + Math.PI );
		_qb.copy( b.quaternion ).multiply( _qc.setFromAxisAngle( _yAxis, Math.PI ) );
		return out.slerpQuaternions( _qb, _qa, 0.55 );

	}

	// world position / heading of the player from the deck state (feet)
	deckToWorld() {

		const b = this.boat;
		b.toWorld( this.deckPos, this.position );
		this.yaw = b.getYaw() + Math.PI + this.deckYaw;

	}

	// highest walkable box top under the point (boat frame), not above maxY; the sole otherwise
	deckGroundAt( x, z, maxY ) {

		const L = this.boat.model.lines;
		let g = L.deckY;
		for ( const c of this.boat.model.colliders ) {

			if ( ! c.walkable ) continue;
			if ( Math.abs( x - c.center.x ) > c.half.x || Math.abs( z - c.center.z ) > c.half.z ) continue;
			const top = c.center.y + c.half.y;
			if ( top <= maxY && top > g ) g = top;

		}

		return g;

	}

	updateDeck( dt ) {

		const inp = this.input;
		const b = this.boat;
		this.breathe( dt, false, false );
		const L = b.model.lines;
		const look = inp.consumeLook();
		this.deckYaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );

		// movement in the boat frame (camera base looks along +Z at deckYaw 0)
		const sy = Math.sin( this.deckYaw ), cy = Math.cos( this.deckYaw );
		_fwd.set( sy, 0, cy );
		_right.set( - cy, 0, sy );
		_wish.set( 0, 0, 0 );
		if ( inp.down( 'KeyW' ) ) _wish.add( _fwd );
		if ( inp.down( 'KeyS' ) ) _wish.sub( _fwd );
		if ( inp.down( 'KeyD' ) ) _wish.add( _right );
		if ( inp.down( 'KeyA' ) ) _wish.sub( _right );
		if ( inp.move ) _wish.addScaledVector( _fwd, inp.move.y ).addScaledVector( _right, inp.move.x );
		if ( _wish.lengthSq() > 1 ) _wish.normalize();
		const speed = ( inp.down( 'ShiftLeft' ) ? 2.6 : 1.6 );
		const k = 1 - Math.exp( - 12 * dt );
		const v = this.deckVel;
		v.x += ( _wish.x * speed - v.x ) * k;
		v.z += ( _wish.z * speed - v.z ) * k;
		if ( this.deckGrounded && inp.hit( 'Space' ) ) {

			v.y = 3.2;
			this.deckGrounded = false;

		}

		v.y -= 9.81 * dt;
		const p = this.deckPos;
		const oldX = p.x, oldZ = p.z;
		p.addScaledVector( v, dt );

		// walls: push out of the solid boxes you can't step onto (boat frame, axis aligned)
		for ( let iter = 0; iter < 2; iter ++ ) for ( const c of b.model.colliders ) {

			if ( ! c.solid ) continue;
			const top = c.center.y + c.half.y, bot = c.center.y - c.half.y;
			if ( top <= p.y + DECK_STEP || bot >= p.y + HEIGHT ) continue;
			const ex = c.half.x + DECK_RADIUS, ez = c.half.z + DECK_RADIUS;
			const dx = p.x - c.center.x, dz = p.z - c.center.z;
			if ( Math.abs( dx ) >= ex || Math.abs( dz ) >= ez ) continue;
			const px = ex - Math.abs( dx ), pz = ez - Math.abs( dz );
			if ( px < pz ) { p.x += Math.sign( dx || ( oldX - c.center.x ) || 1 ) * px; v.x = 0; }
			else { p.z += Math.sign( dz || ( oldZ - c.center.z ) || 1 ) * pz; v.z = 0; }

		}

		// stay inside the hull (the bulwarks, plus a margin fore and aft)
		p.z = THREE.MathUtils.clamp( p.z, L.zAft + L.shell + DECK_RADIUS, 4.0 );
		const halfIn = Math.max( 0.15, L.halfBreadth( L.tAtSheerZ( p.z ), Math.max( p.y, L.deckY ) ) - L.shell - DECK_RADIUS );
		p.x = THREE.MathUtils.clamp( p.x, - halfIn, halfIn );

		const g = this.deckGroundAt( p.x, p.z, p.y + DECK_STEP );
		if ( p.y <= g ) {

			p.y = g;
			if ( v.y < 0 ) v.y = 0;
			this.deckGrounded = true;

		} else this.deckGrounded = p.y - g < 0.04;

		// footsteps on the deck
		const moved = Math.hypot( p.x - oldX, p.z - oldZ );
		if ( this.deckGrounded ) {

			this.bob += moved * 2.4;
			this.stepDist += moved;
			if ( this.stepDist > 0.6 ) {

				this.stepDist = 0;
				if ( this.audio ) this.audio.footstep( 'wood' );

			}

		}

		this.deckToWorld();

		// prompts: take the helm, or step ashore
		const hx = HOUSE_HELM.x, hz = HOUSE_HELM.z;
		const nearHelm = Math.hypot( p.x - hx, p.z - hz ) < HELM_REACH && ! this.busy && ! this.riding;
		this._ashoreT -= dt;
		if ( this._ashoreT <= 0 ) {

			this._ashoreT = 0.25;
			this._ashore = b.speed < 2.5 ? this.ashoreTarget() : null;

		}

		if ( nearHelm ) {

			this.prompt = { key: 'E', text: 'Take the helm' };
			if ( inp.hit( 'KeyE' ) ) {

				this.takeHelm();
				return;

			}

		} else if ( ! this.busy ) {

			// at the rail: step ashore where there is ground on that side, else jump into the sea
			const ep = this._ashore && this._ashore.ep;
			const atRail = b.model.exitPoints.some( ( e ) => Math.hypot( p.x - e.x, p.z - e.z ) < 1.3 );
			if ( ep && Math.hypot( p.x - ep.x, p.z - ep.z ) < 1.3 ) {

				this.prompt = { key: 'E', text: 'Step ashore' };
				if ( inp.hit( 'KeyE' ) ) {

					this.exitBoat( this._ashore );
					return;

				}

			} else if ( atRail && ! this.bailable ) {

				this.prompt = { key: 'E', text: 'Jump overboard' };
				if ( inp.hit( 'KeyE' ) ) {

					this.exitBoat( null, Math.sign( p.x ) || 1 );
					return;

				}

			}

		}

		// camera: eye above the feet, following the boat's motion
		const eyeL = _v.set( p.x, p.y + EYE + Math.sin( this.bob ) * 0.02, p.z );
		b.toWorld( eyeL, this.camera.position );
		this._camY = this.camera.position.y;
		this.deckBase( _q );
		this.camera.quaternion.copy( _q ).multiply( _qa.setFromEuler( _e.set( this.pitch, this.deckYaw, 0 ) ) );

	}

	updateBoat( dt ) {

		const inp = this.input;
		const b = this.boat;
		this.breathe( dt, false, false );
		const look = inp.consumeLook();
		const wheel = inp.consumeWheel();

		if ( inp.hit( 'KeyV' ) ) this.camMode = this.camMode === 'first' ? 'third' : 'first';
		if ( inp.hit( 'KeyE' ) ) {

			this.leaveHelm();
			return;

		}

		let throttle = 0;
		if ( inp.down( 'KeyW' ) ) throttle = inp.down( 'ShiftLeft' ) ? 1 : 0.7;
		if ( inp.down( 'KeyS' ) ) throttle = - 0.6;
		let steer = 0;
		if ( inp.down( 'KeyA' ) ) steer += 1;
		if ( inp.down( 'KeyD' ) ) steer -= 1;
		// analog: the stick's forward travel is the throttle (astern when pulled back), its side the wheel
		if ( inp.move && ( inp.move.x || inp.move.y ) ) {

			if ( ! throttle ) throttle = inp.move.y > 0 ? inp.move.y : inp.move.y * 0.6;
			if ( ! steer ) steer = - inp.move.x;

		}

		b.setInput( throttle, steer, dt );
		this.prompt = { key: 'E', text: 'Leave helm   ·   V  camera' };

		// keep the player attached (for audio / queries)
		b.toWorld( b.model.helmEye, this.position );
		this.position.y -= EYE;

		if ( this.camMode === 'first' ) {

			this.helmYaw = THREE.MathUtils.clamp( this.helmYaw - look.x * 0.0022, - 2.2, 2.2 );
			this.helmPitch = THREE.MathUtils.clamp( this.helmPitch - look.y * 0.0022, - 1.2, 1.0 );
			const eye = b.toWorld( b.model.helmEye, new THREE.Vector3() );
			this.camera.position.copy( eye );
			// head partially stabilises against roll and pitch (feels natural, less nausea)
			const boatQ = b.quaternion;
			const yawOnly = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), b.getYaw() + Math.PI );
			const base = new THREE.Quaternion().slerpQuaternions( boatQ.clone().multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), Math.PI ) ), yawOnly, 0.55 );
			const local = new THREE.Quaternion().setFromEuler( _e.set( this.helmPitch, this.helmYaw, 0 ) );
			this.camera.quaternion.copy( base ).multiply( local );

		} else {

			this.orbitYaw -= look.x * 0.003;
			this.orbitPitch = THREE.MathUtils.clamp( this.orbitPitch + look.y * 0.003, - 0.05, 1.2 );
			this.orbitDist = THREE.MathUtils.clamp( this.orbitDist * ( 1 + wheel * 0.08 ), 6, 40 );
			// gently swing behind the boat when moving
			if ( b.speed > 2 && Math.abs( look.x ) < 0.5 ) {

				const behind = b.getYaw() + Math.PI;
				let d = behind - this.orbitYaw;
				d = Math.atan2( Math.sin( d ), Math.cos( d ) );
				this.orbitYaw += d * ( 1 - Math.exp( - dt * 0.8 ) );

			}

			const target = b.toWorld( new THREE.Vector3( 0, 1.4, 0 ), new THREE.Vector3() );
			const off = new THREE.Vector3(
				Math.sin( this.orbitYaw ) * Math.cos( this.orbitPitch ),
				Math.sin( this.orbitPitch ),
				Math.cos( this.orbitYaw ) * Math.cos( this.orbitPitch )
			).multiplyScalar( this.orbitDist );
			const want = target.clone().add( off );
			want.y = Math.max( want.y, this.waterH + 0.7 );
			if ( ! this.camInit ) {

				this.camPos.copy( want );
				this.camInit = true;

			}

			this.camPos.lerp( want, 1 - Math.exp( - dt * 6 ) );
			this.camera.position.copy( this.camPos );
			this.camera.lookAt( target );

		}

	}

}
