import { MathUtils, Mesh, Object3D, Quaternion, Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { HullLines } from './boat/HullLines.js';
import { GeoKit } from './boat/GeoKit.js';
import { Vessel, GIMBAL, geometryView } from './boat/Vessel.js';
import { LOBSTER_HANDLING } from './boat/Handling.js';
import { wheelhousePoints } from '../fx/Drips.js';
import { BoatMaterials } from './boat/BoatMaterials.js';
import { buildHull, buildHullVolume, keelVolume, houseHalfWidth, KEEL } from './boat/HullBuilder.js';
import { buildWheelhouse, wheelGeometry, throttleGeometry, radarArrayGeometry, compassCardGeometry, HOUSE, roofTopY } from './boat/Wheelhouse.js';
import { VARIATION } from '../game/Chart.js';
import { buildDeckGear, HAULER, BARREL_Z, WAY_UP } from './boat/DeckGear.js';
import { LadderClimb } from './boat/sportfisher/LadderClimb.js';
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
const CAP = 0.045; // (M17) her gunwale's cap over her sheer: her washboard, and her side decks
// (M17) on her side decks and the steps up: from how far out it's so (m), and how near her house and her side you go (a walker's
// radius there: Player's colliders' r, clampToDeck)
const SIDE = { from: 0.75, r: 0.05, ease: 0.6 };
const WALL_END = ( L ) => L.houseFront - 0.06;
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
		// ((M17) her stowed anchor last in her fittings, so its triangles can be left undrawn while it's down: setAnchorStowed)
		const stowed = kit.buckets.get( 'stowedAnchor' ) || [];
		kit.buckets.delete( 'stowedAnchor' );
		let stowedN = 0;
		for ( const g of stowed ) stowedN += g.index ? g.index.count : g.attributes.position.count;
		kit.buckets.get( 'fittings' ).push( ...stowed );

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

		const fit = this.meshes.fittings.geometry;
		this._stowedFrom = ( fit.index ? fit.index.count : fit.attributes.position.count ) - stowedN;
		this._stowed = true;

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

		// ((M16) and on her foredeck: there's no walking aft from it, should you be put there)
		this.exitPoints = this.railPoints( [ - 3.0, - 2.0, - 1.2, 2.1, 3.0, 3.7 ] );

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
		this.wake = { quarterX: 1.5, quarterZ: - 2.0, washZ: - 4.2, armSize: 1.8, washSize: 4, washSpread: 0.7 };
		this.lamps = { dome: [ 0, 2.24, 0.42 ], instruments: [ - 0.45, 1.5, 1.12 ], port: [ 0.47, 3.45, - 0.47 ], masthead: [ 0, 3.97, - 0.5 ], anchor: [ 0, 4.05, - 0.5 ], stern: [ 0, sternY, lines.zAft - 0.05 ], spot: parts.searchlight.toArray() };
		this.floods = [ - 0.8, 0.8 ].map( ( x ) => ( { at: [ x, 2.25, - 1.0 ], dir: [ x * 0.25, - 0.75, - 0.62 ] } ) );
		this.bowWalk = 4.0;
		// ((M17) up her steps and along her side decks to her foredeck, and up the house side to her roof (WAY_UP): a climb, as the
		// sportfisher's ladders are. Her roof's eye, for what's seen from it: the camera's own height (Glasses, Sight), about 4 m;
		// her anchor's worked at her bow, by her roller (Game.updateBow)
		this.ladders = this._buildLadders();
		this.roofEye = roofTopY( 0 ) + 1.62;
		this.bowAnchor = { x: 0, z: WAY_UP.bow, r: 0.9 };
		this.nearDetail = [ 'fittings', 'wood', 'display', 'wheel', 'throttle', 'radar', 'propeller', 'rudder' ];
		// ((M16) m: on Marta's cradle, seen from the path after a hurricane, her fittings alone took a phone past its 300,000
		// triangles. (v2.1.2) 38, not 45: the path's 51 to 53 m from her, and her fittings came back with a few metres' less
		// of it, as the start's timing moved where the checks' walk ends)
		this.nearDist = 38;

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

	get paintSlot() {

		return { name: 'hullPaint', uniform: this.materials.hullPaint };

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

	// (together/) someone else's lobster boat: her deck, without the room your own traps take on yours (TrapWork puts them in this model's
	// colliders when she's the boat you're in; nobody's stowed traps are drawn on someone else's deck)
	walkedAs() {

		const own = this, view = Object.create( this );
		let from = null, kept = null;
		Object.defineProperty( view, 'colliders', { get() {

			if ( own.colliders !== from ) {

				from = own.colliders;
				kept = from.filter( ( c ) => c.tag !== 'trap' );

			}

			return kept;

		} } );
		return view;

	}

	// (together/) someone else's her: her copy's a clone of your boat's meshes, so her fittings a view of their own, her stowed anchor
	// drawn on her roller whatever yours is doing (setAnchorStowed)
	dressCopy( copy, stats, shared ) {

		const was = this.meshes.fittings, mesh = was && copy.getObjectByName( was.name );
		if ( mesh && mesh.geometry === was.geometry ) mesh.geometry = shared( 'fittings, her own anchor', () => geometryView( was.geometry ) );

	}

	// (M17) her stowed anchor drawn on her roller, or not while it's down
	setAnchorStowed( on ) {

		if ( on === this._stowed ) return;
		this._stowed = on;
		this.meshes.fittings.geometry.setDrawRange( 0, on ? Infinity : this._stowedFrom );

	}

	// (M17) on her side decks and the steps up to them, you're close in against her house and her side (a walker's 0.24 m is wider
	// than the 8 in deck): kept inside her by her sheer, not by her breadth less your width
	clampToDeck( p, r ) {

		const L = this.lines;
		// (and onto her foredeck, out to its usual reach over a few steps, not at a stroke)
		if ( Math.abs( p.x ) > SIDE.from && p.z > WAY_UP.z0 - 0.1 && p.z < L.houseFront + SIDE.ease && p.y > WAY_UP.lower.top - 0.08 ) r = Math.min( r, SIDE.r + ( r - SIDE.r ) * Math.max( 0, p.z - L.houseFront ) / SIDE.ease );
		super.clampToDeck( p, r );

	}

	// the foot or head of a climb you're near, on the deck you're on, or null. { ladder, top } (as the sportfisher's)
	ladderAt( p ) {

		for ( const l of this.ladders ) {

			if ( Math.hypot( p.x - l.on.x, p.z - l.on.z ) < 0.45 && Math.abs( p.y - l.on.y ) < 0.35 ) return { ladder: l, top: false };
			if ( Math.hypot( p.x - l.off.x, p.z - l.off.z ) < 0.45 && Math.abs( p.y - l.off.y ) < 0.5 ) return { ladder: l, top: true };

		}

		return null;

	}

	climb( at ) {

		return new LadderClimb( at.ladder, at.top );

	}

	// up her house side to her roof, from her port side deck: the fold-down steps, and the roof's grab rail
	_buildLadders() {

		const L = this.lines, z = WAY_UP.roofZ, hw = houseHalfWidth( L, z ), deck = L.sheerY( L.tAtSheerZ( z ) ) + CAP;
		const x = hw + SIDE.r + 0.01, top = roofTopY( 0.95 );
		return [ {
			id: 'roof', text: 'Climb onto her roof', downText: 'Climb down to her side deck',
			foot: new Vector3( x, deck, z ), head: new Vector3( x, roofTopY( hw ) + 0.04, z ), on: new Vector3( x, deck, z + 0.2 ), off: new Vector3( 0.95, top, z ),
			speed: 0.7, lean: new Vector3( 0.12, 0, 0 ),
		} ];

	}

	// Rough boat-frame colliders (axis-aligned in the boat frame) for a character controller.
	_buildColliders() {

		const L = this.lines;
		const boxes = [];
		const add = ( tag, min, max, walkable = false, solid = true ) => {

			const center = new Vector3().addVectors( min, max ).multiplyScalar( 0.5 );
			const half = new Vector3().subVectors( max, min ).multiplyScalar( 0.5 );
			const b = { tag, center, half, walkable, solid };
			boxes.push( b );
			return b;

		};

		const V = ( x, y, z ) => new Vector3( x, y, z );
		const inner = ( z ) => L.halfBreadth( L.tAtSheerZ( z ), L.deckY ) - L.shell;
		add( 'deck', V( - inner( - 1.5 ), L.deckY - 0.1, L.zAft + L.shell ), V( inner( - 1.5 ), L.deckY, HOUSE.dash.zFace ), true, false );
		// bulwarks in segments following the sheer ((M17) the one by the steps up, to port, its own: you're close in against it as you
		// climb, its cap the washboard you step on to)
		const W = WAY_UP, zw = W.z0 - 0.3; // (clear of a walker on the steps)
		for ( const [ z0, z1 ] of [ [ L.zAft, - 2.3 ], [ - 2.3, zw ], [ zw, L.houseBack ], [ L.houseBack, L.houseFront ] ] ) {

			const t0 = L.tAtSheerZ( z0 ), t1 = L.tAtSheerZ( z1 );
			const top = Math.max( L.sheerY( t0 ), L.sheerY( t1 ) ) + 0.045;
			const xo = Math.max( L.sheerX( t0 ), L.sheerX( t1 ) );
			const xi = Math.min( inner( z0 ), inner( z1 ) );
			for ( const s of [ 1, - 1 ] ) {

				const b = add( 'bulwark', V( Math.min( s * xi, s * xo ), L.deckY, z0 ), V( Math.max( s * xi, s * xo ), top, z1 ) );
				if ( s > 0 && z0 === zw ) {

					b.r = SIDE.r;
					b.walkable = true;

				}

			}

		}

		add( 'transom', V( - L.sheerX( 0 ), L.deckY, L.zAft ), V( L.sheerX( 0 ), L.sheerY( 0 ) + 0.045, L.zAft + L.shell ) );
		// ((M17) her house's sides, in lengths following its taper, pressed close to from her side decks; and the side decks on her
		// washboards outside them, walked, up to her foredeck)
		// (the house's sides only to where her windshield's raked back at your shoulder: past her house's front corner you go round it
		// as she narrows to her bow, so they stop a hand short of it)
		const N = 8, dz = ( WALL_END( L ) - L.houseBack ) / N;
		for ( let i = 0; i < N; i ++ ) {

			const z0 = L.houseBack + i * dz, z1 = z0 + dz, hw0 = houseHalfWidth( L, ( z0 + z1 ) / 2 ), hw1 = houseHalfWidth( L, z1 ), t0 = L.tAtSheerZ( z0 ), t1 = L.tAtSheerZ( z1 );
			const deck = L.sheerY( L.tAtSheerZ( ( z0 + z1 ) / 2 ) ) + CAP;
			for ( const s of [ 1, - 1 ] ) {

				const wall = add( 'houseWall', V( Math.min( s * ( hw1 - HOUSE.wallT ), s * hw0 ), L.sheerY( t0 ), z0 ), V( Math.max( s * ( hw1 - HOUSE.wallT ), s * hw0 ), HOUSE.roofUnderY, z1 ) );
				wall.r = SIDE.r;
				const xo = Math.max( L.sheerX( t0 ), L.sheerX( t1 ) );
				add( 'sideDeck', V( Math.min( s * ( hw1 - 0.02 ), s * xo ), deck - 0.05, z0 ), V( Math.max( s * ( hw1 - 0.02 ), s * xo ), deck, i === N - 1 ? L.houseFront : z1 ), true, false );

			}

		}

		// the steps up to it, to port
		for ( const t of [ W.lower, W.upper ] ) add( 'steps', V( t.x0, L.deckY, W.z0 ), V( t.x1, t.top, W.z1 ), true );

		const d = HOUSE.dash;
		add( 'console', V( - d.halfW, L.deckY, d.zFace ), V( d.halfW, d.yTop, L.houseFront ) );
		// ((M16) her windshield, and the dash no place to stand under the roof) ((M17) as wide as her house at its front, pressed close
		// to from her side decks)
		const ws = houseHalfWidth( L, L.houseFront ) - 0.03;
		add( 'windshield', V( - ws, d.yTop, d.zFace ), V( ws, HOUSE.roofUnderY, WALL_END( L ) ) ).r = SIDE.r;
		add( 'helmSeat', V( HOUSE.helmX - 0.23, L.deckY, HOUSE.seatZ - 0.24 ), V( HOUSE.helmX + 0.23, 1.05, HOUSE.seatZ + 0.21 ) );
		add( 'bench', V( 0.65, L.deckY, 0.075 ), V( 1.07, L.deckY + 0.47, 0.825 ), true );
		// ((M16) something to stand on, not a wall: with your head at it, a hop in the house threw you out from under it)
		add( 'roof', V( - 1.25, HOUSE.roofUnderY, HOUSE.roofZ0 ), V( 1.25, roofTopY( 0 ), HOUSE.roofZ1 ), true, false );
		add( 'hauler', V( HAULER.x - 0.2, L.deckY, HAULER.z - 0.08 ), V( HAULER.x + 0.2, HAULER.y + 0.2, HAULER.z + 0.25 ) );
		add( 'baitBarrel', V( 0.6, L.deckY, BARREL_Z - 0.26 ), V( 1.12, L.deckY + 0.8, BARREL_Z + 0.26 ) );
		// foredeck steps (walkable) from the house front to the stem head
		for ( const [ z0, z1 ] of [ [ L.houseFront, 2.4 ], [ 2.4, 3.3 ], [ 3.3, 4.15 ] ] ) {

			const t0 = L.tAtSheerZ( z0 ), t1 = L.tAtSheerZ( z1 );
			const w = L.sheerX( t0 ) - L.shell;
			add( 'foredeck', V( - w, L.deckY, z0 ), V( w, ( L.sheerY( t0 ) + L.sheerY( t1 ) ) / 2 + 0.06, z1 ), true );

		}

		return boxes;

	}

}
