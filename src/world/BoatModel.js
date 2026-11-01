import { MathUtils, Mesh, Object3D, Quaternion, Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { HullLines } from './boat/HullLines.js';
import { GeoKit } from './boat/GeoKit.js';
import { Vessel, GIMBAL } from './boat/Vessel.js';
import { LOBSTER_HANDLING } from './boat/Handling.js';
import { wheelhousePoints } from '../fx/Drips.js';
import { BoatMaterials } from './boat/BoatMaterials.js';
import { buildHull, buildHullVolume, keelVolume, houseHalfWidth, KEEL } from './boat/HullBuilder.js';
import { buildWheelhouse, wheelGeometry, throttleGeometry, radarArrayGeometry, compassCardGeometry, HOUSE, roofTopY } from './boat/Wheelhouse.js';
import { VARIATION } from '../game/Chart.js';
import { buildDeckGear, HAULER } from './boat/DeckGear.js';
import { propellerGeometry, rudderGeometry, PROP, RUDDER } from './boat/Running.js';

// (M15) the compass's card: its natural period (s) and damping (of critical), a small boat's dash compass's (a
// liquid-filled card settles in a few seconds, with a little overshoot)
export const COMPASS = { period: 3, damping: 0.55 };
export { GIMBAL };
const STATIC_BUCKETS = [ 'hull', 'gelcoat', 'wood', 'fittings', 'glow', 'display', 'glass' ];
const WHEEL_TURNS = 0.75; // wheel turns from centre to hard over
const THROTTLE_ANGLE = 0.6; // lever travel (rad) from neutral to full
export const RADAR_RPM = 24;
export const PROP_DISPLAY_RPS = 5;

const _v = new Vector3();
const _pos = new Vector3();
const _scale = new Vector3();
const _q = new Quaternion();

// ~8.2 m Downeast lobster boat, built procedurally (37k triangles, 12 draw calls).
//
// Boat frame: +Z forward, +Y up, +X port. y = 0 is the design waterline,
// z = 0 the middle of the waterline, x = 0 the centerline.
//
// Integration notes:
// - All anchor points (helmEye, boardPoint, exitPoints, propeller, rudder, bowSprayPoints,
//   hullSamples, colliders) are in the boat frame; transform with group.matrixWorld.
// - hullSamples: position.y is the mean hull depth of each sample's waterplane patch, so
//   sum( area * max( 0, waterY - y ) ) * rho * g equals the displaced weight; with
//   mass = hydro.suggestedMass the boat floats on its design waterline. bottomY holds the
//   literal hull bottom under the sample.
// - Put the centre of mass at hydro.centerOfMass (over the centre of buoyancy) for level trim.
// - setSteering( +1 ) turns to port (left): positive yaw rate about +Y.
// - Shaders animate with G.time (radar sweep, antenna sway, ensign) and brighten with G.night.
export class BoatModel extends Vessel {

	constructor() {

		super( 'lobster' );
		const lines = this.lines = new HullLines();
		const materials = this.materials = new BoatMaterials( lines );
		const kit = new GeoKit();
		const parts = {};
		this.handling = LOBSTER_HANDLING;

		buildHull( kit, lines );
		buildWheelhouse( kit, lines, parts );
		buildDeckGear( kit, lines, parts );

		this.group.name = 'LobsterBoat';

		for ( const name of STATIC_BUCKETS ) {

			const geo = kit.merged( name );
			if ( ! geo ) continue;
			const mesh = new Mesh( geo, materials[ name ] );
			mesh.name = 'boat-' + name;
			mesh.castShadow = name !== 'glass';
			mesh.receiveShadow = true;
			if ( name === 'glass' ) mesh.renderOrder = 1;
			this.group.add( mesh );
			this.meshes[ name ] = mesh;

		}

		// ---- animated parts (one draw call each)

		const addPart = ( name, geo, mat, position, parent = this.group ) => {

			const mesh = new Mesh( geo, mat );
			mesh.name = 'boat-' + name;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			mesh.position.copy( position );
			parent.add( mesh );
			this.meshes[ name ] = mesh;
			return mesh;

		};

		// helm wheel: pivot aligned with the shaft, wheel spins about its local Z
		this.wheelPivot = new Object3D();
		this.wheelPivot.name = 'boat-wheel-pivot';
		this.wheelPivot.position.copy( parts.wheelCenter );
		this.wheelPivot.quaternion.setFromUnitVectors( new Vector3( 0, 0, 1 ), parts.wheelAxis );
		this.group.add( this.wheelPivot );
		this.wheelMesh = addPart( 'wheel', wheelGeometry(), materials.wood, new Vector3(), this.wheelPivot );

		this.throttleMesh = addPart( 'throttle', throttleGeometry(), materials.fittings, parts.throttlePivot );
		this.radarMesh = addPart( 'radar', radarArrayGeometry(), materials.fittings, parts.radarPivot );
		// ((M15) the compass's card, its face the instruments' (lit as the dash is): turned to the magnetic north)
		this.compassMesh = addPart( 'compass', compassCardGeometry(), materials.display, parts.compassAt );
		this.compassMesh.castShadow = false;
		this.hangCard( this.compassMesh );
		this._card = null;
		this.searchlight = parts.searchlight; // (boat frame: the searchlight's lens, the horn's mouth)
		this.hornAt = parts.horn;
		this.propMesh = addPart( 'propeller', propellerGeometry(), materials.fittings, PROP.position );
		this.rudderMesh = addPart( 'rudder', rudderGeometry(), materials.fittings, RUDDER.pivot );

		materials.flagPivot.value.copy( parts.flagPivot );

		// ---- dimensions and hydrostatics

		this.floatBody( { keelVolume: keelVolume( lines ), keelBottom: KEEL.bottom, roofHeight: roofTopY( 0 ) } );
		// (M9) under the wheelhouse roof (the boat's frame -> the box under it, -1..1): no rain falls there
		const yLo = lines.deckY - 0.5, yHi = HOUSE.roofUnderY, zLo = HOUSE.roofZ0, zHi = HOUSE.roofZ1;
		this.shelter = this.shelterBox( 1.25, yLo, yHi, zLo, zHi );

		// ---- anchor points (boat frame)

		this.helmEye = new Vector3( HOUSE.helmX, 1.85, 0.3 );
		this.helm = { x: HOUSE.helmX, z: HOUSE.seatZ, eye: this.helmEye, rise: [ HOUSE.helmX + 0.45, HOUSE.seatZ - 0.1 ] };
		this.boardPoint = new Vector3( 0, lines.deckY, - 1.75 );

		this.exitPoints = this.railPoints( [ - 3.0, - 2.0, - 1.2 ] );

		this.propeller = PROP.position.clone();
		this.rudder = RUDDER.pivot.clone();

		this.bowSprayPoints = this.waterlinePoints( [ 2.0, 2.6, 3.2, 3.8 ] );
		this.colliders = this._buildColliders();
		// (M12) what of her takes the rain from above (Rain.setDeck: the splashes): the wheelhouse roof, the
		// foredeck, the bait barrel and the hauler (her frame: x0, x1, z0, z1, and the top's y)
		this.rainTops = this.colliders.filter( ( b ) => [ 'roof', 'foredeck', 'baitBarrel', 'hauler' ].includes( b.tag ) )
			.map( ( b ) => ( { x0: b.center.x - b.half.x, x1: b.center.x + b.half.x, z0: b.center.z - b.half.z, z1: b.center.z + b.half.z, y: b.center.y + b.half.y } ) );

		// ---- (M16) what the rest of the game asks of a boat (world/boat/Vessel)

		const sternY = lines.sheerY( 0 ) + 0.1;
		this.wake = { quarterX: 1.5, quarterZ: - 2.0, washZ: - 4.2 };
		this.lamps = { dome: [ 0, 2.24, 0.42 ], instruments: [ - 0.45, 1.5, 1.12 ], port: [ 0.47, 3.45, - 0.47 ], masthead: [ 0, 3.97, - 0.5 ], anchor: [ 0, 4.05, - 0.5 ], stern: [ 0, sternY, lines.zAft - 0.05 ], spot: parts.searchlight.toArray() };
		this.floods = [ - 0.8, 0.8 ].map( ( x ) => ( { at: [ x, 2.25, - 1.0 ], dir: [ x * 0.25, - 0.75, - 0.62 ] } ) );
		this.bowWalk = 4.0;
		this.nearDetail = [ 'fittings', 'wood', 'display', 'wheel', 'throttle', 'radar', 'propeller', 'rudder' ];

		// ---- state

		this._steer = 0;
		this._throttle = 0;
		this._rpm = 0;
		this._propAngle = 0;
		this._radarAngle = 0;
		this._time = 0;
		this._lastPos = new Vector3();
		this._hasLastPos = false;
		this._vel = new Vector3();
		this._flagDir = new Vector3( 0, 0, - 1 );
		this._flagWind = 0.5;

		this.setSteering( 0 );
		this.setThrottle( 0 );

	}

	// (M16) her topsides, in her hull's shader
	setPaint( hex ) {

		this.materials.hullPaint.value.set( hex ?? 0xf2efe6 );

	}

	// Closed, low-poly hull volume (shell + transom + lid at the sheer) in the boat frame.
	// Not added to the group: useful as a water-exclusion mask (e.g. depth/stencil pre-pass
	// so the ocean surface is not drawn inside the cockpit), occlusion or physics proxies.
	createHullVolumeGeometry() {

		return buildHullVolume( this.lines );

	}

	dripPoints() {

		return wheelhousePoints( this.lines );

	}

	// -1..1, positive turns the boat to port (left): rudder trailing edge to port,
	// wheel turned counter-clockwise as seen from the helm.
	setSteering( angle ) {

		const a = MathUtils.clamp( angle, - 1, 1 );
		this._steer = a;
		this.wheelMesh.rotation.z = - a * WHEEL_TURNS * Math.PI * 2;
		this.rudderMesh.rotation.y = - a * RUDDER.maxAngle;

	}

	// -1 (full astern) .. 0 (neutral) .. 1 (full ahead); lever tips forward for ahead.
	setThrottle( t ) {

		this._throttle = MathUtils.clamp( t, - 1, 1 );
		this.throttleMesh.rotation.x = this._throttle * THROTTLE_ANGLE;

	}

	// Shaft RPM; positive = ahead (right-handed prop, clockwise from astern).
	setPropellerRPM( rpm ) {

		this._rpm = rpm;

	}

	// (M14) where her radar's beam points, clockwise from her bow (rad): the radar's sweep (Radar.js)
	get radarBearing() {

		return this._radarAngle;

	}

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		this._time += dt;

		// propeller: displayed speed saturates (~5 rev/s) so the blades don't strobe backwards
		const rps = this._rpm / 60;
		const shown = PROP_DISPLAY_RPS * Math.tanh( rps / PROP_DISPLAY_RPS );
		this._propAngle = ( this._propAngle + shown * Math.PI * 2 * dt ) % ( Math.PI * 2 );
		this.propMesh.rotation.z = this._propAngle;

		// ((M14) clockwise from above, as a radar's array turns: its beam off its striped face, at this angle
		// clockwise from her bow, radarBearing: the radar's sweep)
		this._radarAngle = ( this._radarAngle + RADAR_RPM / 60 * Math.PI * 2 * dt ) % ( Math.PI * 2 );
		this.radarMesh.rotation.y = - this._radarAngle;

		// apparent wind (true wind minus boat velocity) in the boat frame drives the ensign
		this.group.updateWorldMatrix( true, false );
		this.group.matrixWorld.decompose( _pos, _q, _scale );
		if ( this._hasLastPos ) {

			_v.subVectors( _pos, this._lastPos ).divideScalar( dt );
			if ( _v.lengthSq() < 900 ) this._vel.lerp( _v, 1 - Math.exp( - dt * 4 ) ); // ignore teleports

		}

		this._lastPos.copy( _pos );
		this._hasLastPos = true;
		this.swingCompass( dt, _q );

		const wd = G.windDir.value, ws = G.windSpeed.value;
		_v.set( wd.x * ws, 0, wd.y * ws ).sub( this._vel ).applyQuaternion( _q.invert() );
		_v.y = 0;
		const speed = _v.length();
		if ( speed > 1e-3 ) {

			_v.divideScalar( speed );
			this._flagDir.lerp( _v, 1 - Math.exp( - dt * 3 ) );
			if ( this._flagDir.lengthSq() < 1e-4 ) this._flagDir.copy( _v );
			this._flagDir.normalize();

		}

		this._flagWind += ( MathUtils.clamp( speed / 9, 0, 1 ) - this._flagWind ) * ( 1 - Math.exp( - dt * 2 ) );
		this.materials.flagDir.value.copy( this._flagDir );
		this.materials.flagWind.value = this._flagWind;

	}

	// (M15) the compass's card swinging to the magnetic north in its bowl (q: her world rotation): a damped
	// pendulum, the fluid dragging it round with the bowl, so it lags in a turn and settles after it, as a
	// compass's card does (COMPASS: its period, damping)
	swingCompass( dt, q ) {

		_v.set( 0, 0, 1 ).applyQuaternion( q ); // her bow, in the world
		const her = Math.atan2( _v.x, _v.z ), north = Math.PI - VARIATION; // (about the world's up: her bow's angle, the card's to be)
		const wrap = ( a ) => a - Math.PI * 2 * Math.round( a / ( Math.PI * 2 ) );
		const c = this._card || ( this._card = { a: north, w: 0, her } );
		const bowl = wrap( her - c.her ) / dt;
		c.her = her;
		const k = Math.PI * 2 / COMPASS.period, n = Math.max( 1, Math.ceil( dt / 0.02 ) ), h = dt / n;
		for ( let i = 0; i < n; i ++ ) {

			c.w += ( - k * k * wrap( c.a - north ) - 2 * COMPASS.damping * k * ( c.w - bowl ) ) * h;
			c.a = wrap( c.a + c.w * h );

		}

		this.compassMesh.rotation.y = c.a - her;
		this._gimbal( dt, q );

	}

	// (M15) her heading by the compass (rad, clockwise from the magnetic north): what the lubber line's over
	get compassHeading() {

		const c = this._card;
		return c ? ( ( c.a - c.her ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 ) : 0;

	}

	// Rough boat-frame colliders (axis-aligned in the boat frame) for a character controller.
	_buildColliders() {

		const L = this.lines;
		const boxes = [];
		const add = ( tag, min, max, walkable = false, solid = true ) => {

			const center = new Vector3().addVectors( min, max ).multiplyScalar( 0.5 );
			const half = new Vector3().subVectors( max, min ).multiplyScalar( 0.5 );
			boxes.push( { tag, center, half, walkable, solid } );

		};

		const V = ( x, y, z ) => new Vector3( x, y, z );
		const inner = ( z ) => L.halfBreadth( L.tAtSheerZ( z ), L.deckY ) - L.shell;
		add( 'deck', V( - inner( - 1.5 ), L.deckY - 0.1, L.zAft + L.shell ), V( inner( - 1.5 ), L.deckY, HOUSE.dash.zFace ), true, false );
		// bulwarks in three segments following the sheer
		for ( const [ z0, z1 ] of [ [ L.zAft, - 2.3 ], [ - 2.3, - 0.7 ], [ - 0.7, L.houseFront ] ] ) {

			const t0 = L.tAtSheerZ( z0 ), t1 = L.tAtSheerZ( z1 );
			const top = Math.max( L.sheerY( t0 ), L.sheerY( t1 ) ) + 0.045;
			const xo = Math.max( L.sheerX( t0 ), L.sheerX( t1 ) );
			const xi = Math.min( inner( z0 ), inner( z1 ) );
			for ( const s of [ 1, - 1 ] ) add( 'bulwark', V( Math.min( s * xi, s * xo ), L.deckY, z0 ), V( Math.max( s * xi, s * xo ), top, z1 ) );

		}

		add( 'transom', V( - L.sheerX( 0 ), L.deckY, L.zAft ), V( L.sheerX( 0 ), L.sheerY( 0 ) + 0.045, L.zAft + L.shell ) );
		for ( const s of [ 1, - 1 ] ) {

			const x0 = houseHalfWidth( L, L.houseBack ) - HOUSE.wallT, x1 = houseHalfWidth( L, L.houseBack );
			add( 'houseWall', V( Math.min( s * x0, s * x1 ), L.sheerY( L.tAtSheerZ( L.houseBack ) ), L.houseBack ), V( Math.max( s * x0, s * x1 ), HOUSE.roofUnderY, L.houseFront ) );

		}

		const d = HOUSE.dash;
		add( 'console', V( - d.halfW, L.deckY, d.zFace ), V( d.halfW, d.yTop, L.houseFront ) );
		add( 'helmSeat', V( HOUSE.helmX - 0.23, L.deckY, HOUSE.seatZ - 0.24 ), V( HOUSE.helmX + 0.23, 1.05, HOUSE.seatZ + 0.21 ) );
		add( 'bench', V( 0.65, L.deckY, 0.075 ), V( 1.07, L.deckY + 0.47, 0.825 ), true );
		add( 'roof', V( - 1.25, HOUSE.roofUnderY, HOUSE.roofZ0 ), V( 1.25, roofTopY( 0 ), HOUSE.roofZ1 ), true );
		add( 'hauler', V( HAULER.x - 0.2, L.deckY, HAULER.z - 0.08 ), V( HAULER.x + 0.2, HAULER.y + 0.2, HAULER.z + 0.25 ) );
		add( 'baitBarrel', V( 0.6, L.deckY, - 1.06 ), V( 1.12, L.deckY + 0.8, - 0.54 ) );
		// foredeck steps (walkable) from the house front to the stem head
		for ( const [ z0, z1 ] of [ [ L.houseFront, 2.4 ], [ 2.4, 3.3 ], [ 3.3, 4.15 ] ] ) {

			const t0 = L.tAtSheerZ( z0 ), t1 = L.tAtSheerZ( z1 );
			const w = L.sheerX( t0 ) - L.shell;
			add( 'foredeck', V( - w, L.deckY, z0 ), V( w, ( L.sheerY( t0 ) + L.sheerY( t1 ) ) / 2 + 0.06, z1 ), true );

		}

		return boxes;

	}

}
