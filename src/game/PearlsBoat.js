import { Mesh, Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { Wake } from '../ocean/Wake.js';
import { BOAT, boatAt } from './PearlsDay.js';
import { buildPirogue, tiltMotor, PIROGUE } from '../world/village/Pirogue.js';

// (M16) The fish camp's pirogue, as her day has her (game/PearlsDay.js: where she is is worked out from the clock, so
// she's in the same place for everyone): built with the camp, one mesh in the village's wood material, floating on the
// sea's own heights (ocean/WaterQuery) by her bow, stern and sides, at her trim when she's running, her outboard down
// under way and tilted out of the water alongside and on the beach. World positions go through three's own matrices,
// in doubles, as any object's do (docs/M15.md, Drawn about where you are); the sea's heights are asked for in doubles.
//   Colliders where she lies, alongside and hauled, not while she's under way. If your own boat's in her berth when she
//   comes in, she lies off until you've gone. Who's in her: nobody's drawn, for want of a character to spare the memory
//   of (only Rocketbox's are allowed), so she's seen best from a little way off.
//   const b = new PearlsBoat( { scene, terrain, colliders, material, tier, waves, query } )
//   b.update( dt, camera, hour, day, pick, since, yours (your boat's position, or null), hidden (the mountain's in the way) )
//   b.sound -> null or { x, y, z, speed, throttle }: her outboard, for the sound stream's hook

const TILT = 1.3; // rad: her outboard up
const SEEN = 260; // m: within this, and looked at, she isn't moved up the beach or back in front of you
const FAR = 2600; // m: past this she isn't drawn
const STEP = 1.2; // m/s: lying off, and coming in from there
const FILL = 5; // her sides out of the sun: the scene's environment light, this many times over (the world's kept low for the sand)
const _d = new Vector3();

export class PearlsBoat {

	constructor( { scene, terrain, colliders, material, tier = 'low', waves = null, query = null } ) {

		this.scene = scene;
		this.terrain = terrain;
		this.waves = waves;
		this.query = query;
		this.tier = tier;
		this.pirogue = buildPirogue( { lite: tier === 'low' } );
		// (the wood's own program, with a fill of her own: her shaded side, white paint and all, came out black)
		const fill = material.clone ? material.clone() : material;
		if ( fill !== material ) {

			fill.onBeforeCompile = material.onBeforeCompile;
			fill.customProgramCacheKey = material.customProgramCacheKey;
			fill.defines = { ...material.defines };
			if ( material.uniformsGroups ) fill.uniformsGroups = material.uniformsGroups;

		}

		const m = this.mesh = new Mesh( this.pirogue.geometry, fill );
		m.onBeforeRender = ( renderer, sc ) => {

			if ( fill.envMap !== sc.environment ) {

				if ( ! fill.envMap !== ! sc.environment ) fill.needsUpdate = true;
				fill.envMap = sc.environment;

			}

			fill.envMapIntensity = sc.environmentIntensity * FILL;

		};
		m.name = 'PearlsBoat';
		m.rotation.order = 'YXZ';
		m.receiveShadow = true;
		m.castShadow = tier !== 'low';
		m.visible = false;
		scene.add( m );
		// where she lies: solid only while she's there
		const box = ( x, y, z, ry, tag ) => colliders.addBox( _d.set( x, y, z ), new Vector3( PIROGUE.beam / 2, 1, PIROGUE.length / 2 ), ry, { tag, solid: false } );
		const B = BOAT.berth, H = BOAT.haul;
		this.berthBox = box( B.x, 0.1, B.z, B.heading, 'campPirogue' );
		this.haulBox = box( H.x, terrain.heightAt( H.x, H.z ) + 0.6, H.z, H.heading, 'campPirogue' );
		this.at = {};
		this.kind = null;
		this.place = 'berth'; // what's drawn: 'berth' or the way (afloat), or 'beach'
		this.tilt = - 1;
		this.y = null;
		this.pitch = 0;
		this.roll = 0;
		this.off = false; // lying off, your boat in her berth
		this.x = B.x;
		this.z = B.z;
		this.t = 0;
		// (as a boat to the wake: Wake reads these)
		this.velocity = new Vector3();
		this.rpm = 0;
		this.model = { group: m, wake: { quarterX: PIROGUE.quarterX, quarterZ: PIROGUE.quarterZ, washZ: PIROGUE.washZ } };
		this.wake = null;
		this._wakeT = 0;

	}

	getYaw() {

		return this.mesh.rotation.y;

	}

	get sound() {

		const k = this.kind;
		if ( ! this.mesh.visible || ( k !== 'coming' && k !== 'going' ) ) return null;
		const p = this.mesh.position, s = this.at.speed;
		return { x: p.x, y: p.y, z: p.z, speed: s, throttle: Math.min( 1, s / 10.8 ) };

	}

	water( x, z ) {

		return this.query ? this.query.heightAt( x, z, G.time.value ) : G.seaLevel.value;

	}

	update( dt, camera, hour, day, pick = null, since = 0, yours = null, hidden = false ) {

		const a = boatAt( hour, day, pick, since, this.at ), c = camera.position, m = this.mesh;
		this.t += dt;
		const dNow = Math.hypot( m.position.x - c.x, m.position.z - c.z );
		// (nobody to haul her, so she isn't seen being hauled: it's done when you're not looking)
		let beach = this.place === 'beach';
		if ( ( a.kind === 'hauled' ) !== beach ) {

			camera.getWorldDirection( _d );
			const looked = this.kind !== null && dNow < SEEN && _d.x * ( m.position.x - c.x ) + _d.z * ( m.position.z - c.z ) > 0;
			if ( ! looked ) beach = a.kind === 'hauled';

		}

		this.place = beach ? 'beach' : 'water';
		const kind = beach ? 'hauled' : a.kind === 'hauled' ? 'alongside' : a.kind;
		// (your boat's in her berth: she lies off till you've gone, and then comes in, dead slow)
		const B = BOAT.berth, blocked = !! yours && Math.hypot( yours.x - B.x, yours.z - B.z ) < 7 && ! beach;
		const closing = kind === 'alongside' || ( kind === 'coming' && Math.hypot( a.x - B.x, a.z - B.z ) < 45 );
		let tx = kind === 'alongside' || a.kind === 'hauled' ? B.x : a.x, tz = kind === 'alongside' || a.kind === 'hauled' ? B.z : a.z, heading = kind === 'alongside' || a.kind === 'hauled' ? B.heading : a.heading, speed = kind === 'alongside' ? 0 : a.speed;
		if ( beach ) {

			tx = BOAT.haul.x;
			tz = BOAT.haul.z;
			heading = BOAT.haul.heading;
			speed = 0;

		} else if ( blocked && closing ) {

			this.off = true;
			tx = BOAT.off.x;
			tz = BOAT.off.z;
			heading = BOAT.off.heading;

		}

		if ( this.off && ! beach ) {

			// (at a walking pace to where she's going)
			const dx = tx - this.x, dz = tz - this.z, d = Math.hypot( dx, dz ), st = STEP * dt;
			if ( d <= st ) {

				this.x = tx;
				this.z = tz;
				if ( ! blocked ) this.off = false;

			} else {

				this.x += dx / d * st;
				this.z += dz / d * st;
				heading = blocked && d < 3 ? heading : Math.atan2( dx, dz );

			}

			speed = d > st ? STEP : 0;

		} else {

			this.off = false;
			this.x = tx;
			this.z = tz;

		}

		const lying = kind === 'alongside' && ! this.off;
		this.kind = this.off ? 'off' : kind;
		this.berthBox.solid = lying;
		this.haulBox.solid = beach;
		const d = Math.hypot( this.x - c.x, this.z - c.z ), under = kind === 'coming' || kind === 'going' || this.off;
		// her lines only when she's made fast
		this.pirogue.geometry.setDrawRange( 0, lying ? this.pirogue.all : this.pirogue.drawn );
		this._motor( under ? 0 : TILT, d < SEEN ? dt : 1e3 );
		const near = d < FAR && kind !== 'away';
		m.visible = near && ! ( hidden && Math.hypot( this.x - B.x, this.z - B.z ) < 80 );
		this._wake( dt, speed, heading, under && d < 1200 && G.night.value < 0.3 && kind !== 'away' );
		if ( ! near ) return;
		if ( beach ) return this._onBeach( heading );
		this._afloat( dt, heading, speed, lying, d );

	}

	_motor( to, dt ) {

		if ( this.tilt === to ) return;
		this.tilt = this.tilt < 0 ? to : this.tilt + Math.min( Math.abs( to - this.tilt ), 0.5 * dt ) * Math.sign( to - this.tilt );
		tiltMotor( this.pirogue, this.tilt );

	}

	_onBeach( heading ) {

		const T = this.terrain, m = this.mesh, sn = Math.sin( heading ), cs = Math.cos( heading ), x = this.x, z = this.z;
		// (her flat run on her rollers, on the sand as it lies)
		const mid = T.heightAt( x, z ), st = T.heightAt( x - sn * 3, z - cs * 3 );
		m.position.set( x, mid + 0.14, z );
		m.rotation.set( - Math.atan2( mid - st, 3 ), heading, 0.035 );
		this.y = null;

	}

	_afloat( dt, heading, speed, lying, d ) {

		const m = this.mesh, sn = Math.sin( heading ), cs = Math.cos( heading ), t = this.t;
		// (on her fenders: she works a little against her lines)
		const x = this.x + ( lying ? 0.05 * Math.sin( t * 0.37 ) + 0.03 * Math.sin( t * 0.83 + 1 ) : 0 );
		const z = this.z + ( lying ? 0.09 * Math.sin( t * 0.23 + 2 ) : 0 );
		const yaw = heading + ( lying ? 0.012 * Math.sin( t * 0.31 ) + 0.006 * Math.sin( t * 0.71 ) : 0 );
		const hw = this.water.bind( this ), L2 = PIROGUE.length * 0.36, W2 = PIROGUE.beam * 0.42;
		const bow = hw( x + sn * L2, z + cs * L2 ), stern = hw( x - sn * L2, z - cs * L2 );
		// (far off, the sea's small on her: her two ends will do)
		const near = d < 300, port = near ? hw( x - cs * W2, z + sn * W2 ) : ( bow + stern ) / 2, star = near ? hw( x + cs * W2, z - sn * W2 ) : port;
		const mean = ( bow + stern + port + star ) / 4;
		// (a bow wave's hump, then up on the plane, lifted a little)
		const plane = speed > 2 ? Math.min( 1, ( speed - 2 ) / 5 ) : 0;
		const trim = ( 0.13 * Math.min( 1, Math.max( 0, ( speed - 1.5 ) / 3 ) ) - 0.065 * Math.min( 1, Math.max( 0, ( speed - 5 ) / 4 ) ) );
		const ky = 1 - Math.exp( - dt * 6 ), want = mean - PIROGUE.draft + 0.08 * plane;
		this.y = this.y === null ? want : this.y + ( want - this.y ) * ky;
		this.pitch += ( - Math.atan2( bow - stern, L2 * 2 ) - trim - this.pitch ) * ky;
		this.roll += ( - Math.atan2( star - port, W2 * 2 ) * 0.8 - this.roll ) * ky;
		m.position.set( x, this.y, z );
		m.rotation.set( this.pitch, yaw, this.roll );
		this.velocity.set( sn * speed, 0, cs * speed );
		this.rpm = speed > 0.3 ? 0.3 + speed / 15 : 0;

	}

	_wake( dt, speed, heading, on ) {

		if ( on && ! this.wake && this.waves ) this.wake = new Wake( { scene: this.scene, boat: this, waves: this.waves, tier: this.tier } );
		if ( ! this.wake ) return;
		if ( on ) this._wakeT = 10;
		else this._wakeT -= dt;
		const live = this._wakeT > 0;
		this.wake.mesh.visible = live;
		if ( ! on ) this.velocity.set( 0, 0, 0 );
		if ( live ) this.wake.update( dt );

	}

}
