import { AdditiveBlending, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from '../../../engine/index.js';
import { GeoKit, rod, cylinder, box } from '../GeoKit.js';
import { Vessel } from '../Vessel.js';
import { propellerAndRudder } from '../Handling.js';
import { propellerGeometry, rudderGeometry, RUDDER } from '../Running.js';
import { throttleGeometry, radarArrayGeometry, compassCardGeometry } from '../Wheelhouse.js';
import { LANDS } from '../../../fx/Drips.js';
import { VARIATION } from '../../../game/Chart.js';
import { SportfisherLines, SF } from './SportfisherLines.js';
import { SportfisherMaterials } from './SportfisherMaterials.js';
import { buildHull, skegVolume, V, STEEL, CHAIR_Z, deckY } from './SportfisherHull.js';
import { buildHouse, buildCabin } from './SportfisherHouse.js';
import { buildBridge, buildTower, riggerGeometry, riggerTip, wheelOf, HELM, TOWER, TOWER_HELM, RIGGER, bridgeX } from './SportfisherBridge.js';
import { buildFloors, buildColliders, buildLadders, soleAt, keepOnDeck } from './SportfisherDecks.js';
import { LadderClimb } from './LadderClimb.js';
import { SEATS } from './seats.data.js';

// (M16) The offshore sportfisher: a 48 ft convertible, after the Viking 48 and Hatteras 48, the boat the game saves up for.
// docs/m16/sportfisher.md has the sources and figures.
//   new SportfisherModel( tier ): 'low' is the phones' version, under half her triangles and with the fewest draws that
//   still let her fittings be fitted, and her wheel and radar turn.
//   fit( stats )          her upgrades, as they're bought: the tower, the outriggers, the fighting chair
//   setUnderLights( on )  her underwater lights' green pool, 0..1
//   setOutriggersOut( out ) the poles down for trolling, or up
//   bunks, chair, rodHolders, outriggerTips, stations  what the days out, the tackle and the crew's jobs read
//   ladders, ladderAt( p ) the two climbs (LadderClimb)
//   towerHelm, helmAt( p, reach ) her second helm, on the tower's platform, if she has the tower
//   gearBits(), dressCopy( group, bits ), withGear( bits )  what's fitted on someone else's (Vessel's)
//   shelterAt( p )        the box of rain that's over you: the house, the hardtop or the tower's roof

const DEG = Math.PI / 180;
const sstep = MathUtils.smoothstep;
const RPM_SHOWN = 5; // rev/s: past this the blades strobe
const WHEEL_TURNS = 0.75;

// the twin screws (x either side): lever and rudder as any boat's, and at the dock she also turns on her engines, one ahead
// and one astern, as a twin-screw boat is handled
const SCREW_X = 0.92;
const _dv = new Vector3();
const _pt = new Vector3();
export function twinScrews( ctl, q ) {

	propellerAndRudder( ctl, q );
	if ( ! ( ctl.driven && ctl.engineOn ) || ! ctl.steer ) return;
	const slow = 1 - sstep( Math.abs( q.u ), 1, 4.5 );
	if ( slow <= 0 ) return;
	const f = ctl.steer * ctl.maxThrust * 0.11 * slow;
	for ( const s of [ 1, - 1 ] ) {

		ctl.toWorld( _pt.set( s * SCREW_X, ctl.model.propeller.y, ctl.model.propeller.z ), _pt );
		q.addForceAt( _dv.copy( q.fwd ).multiplyScalar( - s * f ), _pt );

	}

}

// what handles her: 19 t, GM about 1 m, roll about 4.5 s; a planing hull, her hump about 18 knots, 26 to 28 knots at a cruising
// lever (0.7) and 32 to 33 flat out, as the Hatteras 48's 26.3 and 31 and the Viking's 30 and 34 (docs/m16/sportfisher.md)
const STATIONS = [ [ - 5.8, 1.2 ], [ - 4.0, 1.5 ], [ - 2.2, 1.3 ], [ - 0.4, 1.1 ], [ 1.4, 1.0 ], [ 3.2, 0.72 ], [ 5.0, 0.3 ] ];
export const SPORTFISHER_HANDLING = {
	windArea: [ 16, 44 ],
	windCd: 0.95,
	windY: 2.6,
	windLead: 4.5,
	rightFrom: 28 * DEG,
	rightK: 420000,
	rollInertia: 1.5,
	addedMass: [ 0.6, 0.75, 0.05 ],
	addedInertia: [ 1.0, 0.4, 0.2 ],
	waterplane: [ 0.62, 0.9 ],
	stations: STATIONS,
	lateralY: - 0.2,
	hullLift: 0.42,
	bank: 240,
	heave: [ 11000, 7000 ],
	damping: [ 320000, 42000, 58000, 12000 ],
	resistance: ( au ) => 60 * au + 60 * au * au + 28000 * sstep( au, 4.5, 9 ) - 9000 * sstep( au, 9, 13.5 ) + 58000 * sstep( au, 14, 19 ),
	trim: ( u ) => ( 5.2 * sstep( u, 3.5, 8 ) - 2.6 * sstep( u, 8, 14 ) ) * DEG,
	rise: ( u ) => 0.22 * sstep( u, 6, 14 ),
	contacts: [ [ 0, - 0.55, 5.4 ], [ 0, - 1.3, 1 ], [ 0, SF.skeg, - 3.6 ], [ 2.1, - 0.2, 2 ], [ - 2.1, - 0.2, 2 ], [ 2.1, - 0.2, - 5 ], [ - 2.1, - 0.2, - 5 ], [ 0, 0.3, 6.6 ] ],
	outline: [ [ 0, 0.3, 6.4 ], [ 1.6, 0.3, 3.5 ], [ - 1.6, 0.3, 3.5 ], [ 2.3, 0.3, 0 ], [ - 2.3, 0.3, 0 ], [ 2.2, 0.3, - 6.2 ], [ - 2.2, 0.3, - 6.2 ] ],
	bowZ: 8,
	sternZ: - 6.3,
	engine: { maxThrust: 130000, pitchSpeed: 40, reverseFactor: 0.45, shaftRpm: 2300 },
	propulsion: twinScrews,
	rudder: { area: 0.95, race: 0.9, lift: 2.6 },
};

// a seat's part as a geometry at a place on deck, facing ( rad, about up )
const _b64 = ( s ) => Uint8Array.from( atob( s ), ( c ) => c.charCodeAt( 0 ) );
function seatPart( d, x, y, z, yaw ) {

	const pR = _b64( d.p ), nR = _b64( d.n ), iR = _b64( d.i );
	const P = new Uint16Array( pR.buffer, pR.byteOffset, pR.byteLength / 2 ), N = new Int8Array( nR.buffer, nR.byteOffset, nR.byteLength );
	const I = new Uint16Array( iR.buffer, iR.byteOffset, iR.byteLength / 2 );
	const pos = new Float32Array( P.length ), nor = new Float32Array( N.length );
	for ( let k = 0; k < P.length; k ++ ) pos[ k ] = d.min[ k % 3 ] + ( d.max[ k % 3 ] - d.min[ k % 3 ] ) * P[ k ] / 65535;
	for ( let k = 0; k < N.length; k ++ ) nor[ k ] = N[ k ] / 127;
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( nor, 3 ) );
	g.setIndex( Array.from( I ) );
	g.applyMatrix4( new Matrix4().makeRotationY( yaw ).setPosition( x, y, z ) );
	return g;

}

const PARTS = { pad: { color: 0xc99a5e, rough: 0.55 }, helmPad: { color: 0xeee8d8, rough: 0.5 }, teak: { color: 0x8a5a2c, rough: 0.35 }, helmTrim: { color: 0x6a4322, rough: 0.5 }, steel: { color: 0xd8dbde, rough: 0.3, metal: 0.35 } };

export class SportfisherModel extends Vessel {

	constructor( tier = 'high' ) {

		super( 'sportfisher' );
		const low = tier === 'low', q = { low };
		const L = this.lines = new SportfisherLines();
		this.materials = new SportfisherMaterials( L );
		this.handling = SPORTFISHER_HANDLING;
		this.footstep = 'wood';
		this.low = low;
		this.group.name = 'Sportfisher';

		const kit = new GeoKit(), parts = {};
		buildHull( kit, L, q );
		buildHouse( kit, L, q );
		buildCabin( kit, L, q );
		buildBridge( kit, L, q, parts );
		buildTower( kit, L, q );
		riggerGeometry( kit, q );
		this._seats( kit, q );
		this._running( kit, q );

		// (on phones the cushions go in with the cabin: a draw saved)
		if ( low ) {

			kit.buckets.get( 'cabin' ).push( ...kit.buckets.get( 'chairs' ) );
			kit.buckets.delete( 'chairs' );

		}

		// ((M16) the cabin's on its own, so a phone needn't draw it from the shore: nearDetail)
		for ( const name of [ 'hull', 'gelcoat', 'fittings', 'cabin', 'tower', 'outriggers', 'chair', 'chairs', 'glow', 'display', 'towerDisplay', 'glass' ] ) {

			const geo = kit.merged( name );
			if ( ! geo ) continue;
			const mesh = new Mesh( geo, this._materialOf( name ) );
			mesh.name = 'boat-' + name;
			mesh.castShadow = name !== 'glass' && name !== 'cabin' && name !== 'glow' && name !== 'display' && name !== 'towerDisplay';
			mesh.receiveShadow = name !== 'cabin';
			if ( name === 'glass' ) mesh.renderOrder = 1;
			this.group.add( mesh );
			this.meshes[ name ] = mesh;

		}

		const addPart = ( name, geo, mat, position, parent = this.group ) => {

			const mesh = new Mesh( geo, mat );
			mesh.name = 'boat-' + name;
			mesh.castShadow = true;
			mesh.position.copy( position );
			parent.add( mesh );
			this.meshes[ name ] = mesh;
			return mesh;

		};

		const m = this.materials;
		// her two wheels, the bridge's and the tower's: one draw, each with its own place and its own turn
		this.wheelMesh = new InstancedMesh( wheelOf( q ), m.fittings, 2 );
		this.wheelMesh.name = 'boat-wheel';
		this.wheelMesh.castShadow = true;
		this.wheelMesh.instanceMatrix.setUsage( DynamicDrawUsage );
		this.group.add( this.wheelMesh );
		this.meshes.wheel = this.wheelMesh;
		const wheelBase = ( center, axis, scale ) => new Matrix4().compose( center, new Quaternion().setFromUnitVectors( new Vector3( 0, 0, 1 ), axis ), new Vector3( scale, scale, scale ) );
		this._wheels = [ wheelBase( parts.wheelCenter, parts.wheelAxis, 1 ), wheelBase( TOWER_HELM.wheelCenter, TOWER_HELM.wheelAxis, TOWER_HELM.wheelScale ) ];
		this._wheelTurn = [ NaN, NaN ];
		this._turnWheel( 0, 0 );
		this._turnWheel( 1, 0 );
		this.wheelMesh.computeBoundingSphere(); // (both of them, so it holds with the tower's off)
		if ( ! low ) {

			this.throttleMesh = addPart( 'throttle', throttleGeometry(), m.fittings, parts.throttlePivot );
			this.towerThrottle = addPart( 'towerThrottle', this.throttleMesh.geometry, m.fittings, TOWER_HELM.throttlePivot );

		}

		this.radarMesh = addPart( 'radar', radarArrayGeometry(), m.fittings, parts.radarPivot );
		this.radarMesh.scale.setScalar( 1.1 );
		this.compassMesh = addPart( 'compass', compassCardGeometry(), m.display, parts.compassAt );
		this.compassMesh.castShadow = false;
		this.compassMesh.scale.setScalar( 1.3 );
		if ( ! low ) {

			this.towerCompass = addPart( 'towerCompass', this.compassMesh.geometry, m.display, TOWER_HELM.compassAt );
			this.towerCompass.castShadow = false;
			this.towerCompass.scale.setScalar( 1.1 );

		}

		this._card = null;

		// the screws: each its own, turning opposite ways; the phones' are in the fittings, under water, still
		this.props = [];
		this.rudders = [];
		if ( ! low ) for ( const s of [ 1, - 1 ] ) {

			const prop = addPart( s > 0 ? 'propPort' : 'propStar', propellerGeometry(), m.fittings, V( s * SCREW_X, - 0.84, - 5.05 ) );
			prop.scale.set( - s * 2, 2, 2 );
			const rud = addPart( s > 0 ? 'rudderPort' : 'rudderStar', rudderGeometry(), m.fittings, V( s * SCREW_X, - 0.78, - 5.72 ) );
			rud.scale.set( 1.9, 2.1, 1.9 );
			this.props.push( prop );
			this.rudders.push( rud );

		}

		this.searchlight = parts.searchlight;
		this.hornAt = parts.horn;

		// ---- her floating
		this.floatBody( { keelVolume: skegVolume( L ), keelBottom: SF.skeg, roofHeight: SF.hardtopY, comY: 0.6, gyration: [ 0.34, 0.25, 0.26 ] } );
		L._sectionCache.clear();

		// ---- where you can be
		this.floors = buildFloors( L );
		this.colliders = buildColliders( L );
		this.ladders = buildLadders();
		this.helm = { x: 0, z: HELM.z, y: SF.bridge, eye: HELM.eye, rise: [ 0.5, HELM.z - 0.45 ], open: true };
		this.helmEye = HELM.eye;
		this.towerHelm = { x: 0, z: TOWER_HELM.z, y: SF.tower, eye: TOWER_HELM.eye, rise: TOWER_HELM.rise, reach: TOWER_HELM.reach, upper: true, open: true };
		this.helmInUse = this.helm; // (whose wheel and lever move: Player.takeHelm)
		this.boardPoint = V( 0, SF.cockpit, - 4.1 );
		this.exitPoints = this.railPoints( [ - 5.4, - 4.5, - 3.6 ] );
		this.bowWalk = 8.05;
		this.bunks = [ { x: 0.82, y: SF.lower, z: 2.65 }, { x: 0, y: SF.lower, z: 3.72 } ];
		const chairY = SF.cockpit + 0.55;
		this.chair = { at: V( 0, chairY, CHAIR_Z ), eye: V( 0, SF.cockpit + 1.25, CHAIR_Z + 0.05 ), yaw: Math.PI };
		this.rodHolders = [ - 5.5, - 4.5, - 3.6 ].flatMap( ( z ) => [ 1, - 1 ].map( ( s ) => V( s * ( L.sheerX( L.tAtSheerZ( z ) ) - 0.12 ), L.sheerY( L.tAtSheerZ( z ) ) + 0.005, z ) ) );
		this.outriggerTips = [ riggerTip( 1, true ), riggerTip( - 1, true ) ];
		this.stations = {
			tower: { x: 0, y: SF.tower, z: ( TOWER.z0 + TOWER.z1 ) / 2, r: 1 },
			chair: { x: 0, y: SF.cockpit, z: CHAIR_Z, r: 0.6, facing: Math.PI },
		};
		this.lowCopy = [ 'boat-hull', 'boat-gelcoat', 'boat-glass' ];
		this.towerEye = SF.tower + 1.62;

		// ---- what the rest of the game asks
		this.propeller = V( 0, - 0.84, - 5.05 );
		this.rudder = V( 0, - 0.78, - 5.72 );
		this.bowSprayPoints = this.waterlinePoints( [ 2.5, 3.6, 4.7, 5.8 ] );
		this.wake = { quarterX: 2.1, quarterZ: - 3.6, washZ: - 6.8 };
		this.lamps = { dome: [ 0, SF.roofY - 0.1, - 0.6 ], instruments: [ 0, SF.bridge + 1.2, HELM.consoleZ0 + 0.1 ], port: [ bridgeX( 0 ) - 0.15, SF.bridge + 0.5, 0.6 ], masthead: [ 0, TOWER.roof + 0.34, - 0.4 ], anchor: [ 0, TOWER.roof + 0.4, - 0.4 ], stern: [ 0, L.sheerY( 0 ) + 0.1, L.zAft - 0.05 ], spot: parts.searchlight.toArray() };
		this.floods = [ - 0.8, 0.8 ].map( ( x ) => ( { at: [ x, SF.roofY - 0.05, SF.bridgeAft + 0.1 ], dir: [ x * 0.25, - 0.75, - 0.62 ] } ) );
		this.nearDetail = low ? [ 'cabin', 'wheel', 'radar', 'chair', 'display' ] : [];
		// what takes the rain from above
		this.rainTops = [
			{ x0: - SF.hardtopX, x1: SF.hardtopX, z0: SF.hardtopAft, z1: SF.hardtopFront, y: SF.hardtopY + 0.1 },
			{ x0: - 1.9, x1: 1.9, z0: SF.bridgeAft, z1: - 1.6, y: SF.bridge },
			{ x0: - 1.5, x1: 1.5, z0: 3.6, z1: 6.5, y: deckY( L, 0, 4.5 ) },
		];
		const box_ = ( hx, y0, y1, z0, z1 ) => this.shelterBox( hx, y0, y1, z0, z1 );
		this._shelters = {
			house: box_( 2.05, - 0.5, SF.bridge, SF.bridgeAft, SF.houseFront ),
			bridge: box_( SF.hardtopX, SF.bridge - 0.1, SF.hardtopY - 0.05, SF.hardtopAft, SF.hardtopFront ),
			tower: box_( TOWER.hx + 0.04, SF.tower - 0.1, TOWER.roof, TOWER.z0 + 0.02, TOWER.z1 + 0.05 ),
		};
		this.shelter = this._shelters.house;

		// ---- state
		this._steer = 0;
		this._throttle = 0;
		this._propAngle = 0;
		this._radarAngle = 0;
		this._rigger = 0;
		this._riggerWant = 0;
		this._riggerBase = this.meshes.outriggers.geometry.attributes.position.array.slice();
		this.fitted = { tower: true, outriggers: true, chair: true };
		this.setSteering( 0 );
		this.setThrottle( 0 );

	}

	_materialOf( name ) {

		const m = this.materials;
		return { hull: m.hull, gelcoat: m.gelcoat, fittings: m.fittings, cabin: m.cabin, tower: m.fittings, outriggers: m.fittings, chair: m.fittings, chairs: m.cabin, glow: m.glow, display: m.display, towerDisplay: m.display, glass: m.glass }[ name ];

	}

	// the seats, Blender's (tools/sportfisher/seats.py): the fighting chair's its own (an upgrade), the two helm seats go with the
	// bridge's cushions
	_seats( kit, q ) {

		const lod = q.low ? 'low' : 'high', C = SEATS.chair, H = SEATS.helm;
		// (facing aft, over the transom: its +Y-forward modelled front's turned to her stern)
		kit.add( 'chair', seatPart( C.steel[ lod ], 0, SF.cockpit, CHAIR_Z, Math.PI ), PARTS.steel );
		kit.add( 'chair', seatPart( C.teak[ lod ], 0, SF.cockpit, CHAIR_Z, Math.PI ), PARTS.teak );
		kit.add( 'chair', seatPart( C.pad[ lod ], 0, SF.cockpit, CHAIR_Z, Math.PI ), PARTS.pad );
		for ( const x of [ 0, 0.62 ] ) {

			if ( q.low && x ) continue;
			kit.add( 'fittings', seatPart( H.steel[ lod ], x, SF.bridge, HELM.seatZ, 0 ), PARTS.steel );
			kit.add( 'fittings', seatPart( H.teak[ lod ], x, SF.bridge, HELM.seatZ, 0 ), PARTS.helmTrim );
			kit.add( 'chairs', seatPart( H.pad[ lod ], x, SF.bridge, HELM.seatZ, 0 ), PARTS.helmPad );

		}

	}

	// shafts and struts; the phones' props and rudders are simple and still
	_running( kit, q ) {

		const rad = q.low ? 5 : 8;
		for ( const s of [ 1, - 1 ] ) {

			const x = s * SCREW_X, a = V( s * 0.74, - 0.68, - 1.6 ), c = V( x, - 0.84, - 5.05 );
			kit.add( 'fittings', rod( a, c, 0.036, rad ), STEEL );
			for ( const f of [ 0.55, 0.9 ] ) {

				const p = a.clone().lerp( c, f );
				kit.add( 'fittings', rod( p, V( p.x, - this.lines.draftAt( p.z ) + 0.2 * Math.abs( p.x ), p.z ), 0.018, 4 ), { color: 0xc8905a, rough: 0.3, metal: 1 } );

			}

			if ( q.low ) {

				const hub = cylinder( 0.08, 0.08, 0.2, 6 );
				hub.rotateX( Math.PI / 2 );
				hub.translate( x, - 0.84, - 5.05 );
				kit.add( 'fittings', hub, { color: 0xc8905a, rough: 0.3, metal: 1 } );
				for ( let k = 0; k < 4; k ++ ) {

					const b = box( 0.03, 0.4, 0.16 );
					b.translate( 0, 0.24, 0 );
					b.rotateY( 0.5 );
					b.rotateZ( k * Math.PI / 2 );
					b.translate( x, - 0.84, - 5.05 );
					kit.add( 'fittings', b, { color: 0xc8905a, rough: 0.3, metal: 1 } );

				}

				const r = box( 0.05, 0.8, 0.55 );
				r.translate( x, - 0.78, - 5.72 );
				kit.add( 'fittings', r, { color: 0x141d2c, rough: 0.7 } );

			}

		}

	}

	// ---- walking on her

	soleY( x, z, y ) {

		return soleAt( this.lines, this.floors, x, z, y );

	}

	clampToDeck( p, r ) {

		keepOnDeck( this.lines, p, r );

	}

	// on the tower's platform, its helm, if she has one; nearer the ladder's head than that, the ladder's
	helmAt( p, reach ) {

		const H = this.towerHelm;
		if ( this.fitted.tower && Math.abs( p.y - H.y ) < 0.5 && Math.hypot( p.x - H.x, p.z - H.z ) < H.reach ) return H;
		return super.helmAt( p, reach );

	}

	// the foot or head of a climb you're near, on the deck you're on, or null. { ladder, top }
	ladderAt( p ) {

		for ( const l of this.ladders ) {

			if ( l.needs && ! this.fitted[ l.needs ] ) continue;
			if ( Math.hypot( p.x - l.on.x, p.z - l.on.z ) < 0.5 && Math.abs( p.y - l.on.y ) < 0.5 ) return { ladder: l, top: false };
			if ( Math.hypot( p.x - l.off.x, p.z - l.off.z ) < 0.45 && Math.abs( p.y - l.off.y ) < 0.5 ) return { ladder: l, top: true };

		}

		return null;

	}

	climb( at ) {

		return new LadderClimb( at.ladder, at.top );

	}

	// which box of rain's overhead: the one you're under or nearest (p: where you stand, boat frame)
	shelterAt( p ) {

		const S = this._shelters;
		this.shelter = p.y > SF.tower - 1 ? S.tower : p.y > SF.bridge - 0.3 ? S.bridge : S.house;
		return this.shelter;

	}

	dripPoints() {

		const out = [], L = this.lines;
		let k = 0;
		const hash = ( n ) => {

			const h = Math.sin( n * 12.9898 ) * 43758.5453;
			return h - Math.floor( h );

		};
		// off the hardtop's edges onto the bridge, and off the brow onto the mezzanine
		for ( let z = SF.hardtopAft + 0.2; z < SF.hardtopFront - 0.2; z += 0.35 ) for ( const s of [ 1, - 1 ] ) out.push( s * ( SF.hardtopX - 0.02 ), SF.hardtopY - 0.05, z, SF.bridge, hash( k ++ ), LANDS.DULL );
		for ( let x = - 1.7; x <= 1.71; x += 0.3 ) out.push( x, SF.roofY - 0.02, SF.bridgeAft - 0.005, SF.mezz, hash( k ++ ), LANDS.DULL );
		return out;

	}

	// ---- her upgrades: what you see, and whether there's a tower to climb. stats: state.stats (a stat left undefined isn't one
	// she has a track for yet, so she's shown with it)
	fit( stats = {} ) {

		const has = ( ...keys ) => keys.every( ( k ) => stats[ k ] === undefined ) ? true : keys.some( ( k ) => !! stats[ k ] );
		this.fitted = { tower: has( 'tower' ), outriggers: has( 'outriggers' ), chair: has( 'chair', 'chair' ) };
		const M = this.meshes;
		if ( M.tower ) M.tower.visible = this.fitted.tower;
		if ( M.wheel ) M.wheel.count = this.fitted.tower ? 2 : 1;
		for ( const k of [ 'towerThrottle', 'towerDisplay', 'towerCompass' ] ) if ( M[ k ] ) M[ k ].visible = this.fitted.tower;
		if ( M.outriggers ) M.outriggers.visible = this.fitted.outriggers;
		if ( M.chair ) M.chair.visible = this.fitted.chair;
		for ( const c of this.colliders ) if ( c.tag === 'chair' ) c.solid = this.fitted.chair;
		this.chair = this.fitted.chair ? this.chair || this._chairWas : ( this._chairWas = this.chair, null );

	}

	// (M16) her underwater lights, 0..1 (Game.underOn): the green pool they make about her stern after dark, seen from above.
	// Made the first time they're lit, so it costs nothing until then
	setUnderLights( on ) {

		if ( on <= 0 && ! this._glow ) return;
		if ( ! this._glow ) {

			// (a dim pool, fading out smoothly: the sea's lit from under, not painted. A little above the water, so the swell
			// doesn't cut it)
			const N = 28, RINGS = 7, RADIUS = 13, pos = [], col = [], idx = [];
			pos.push( 0, 0, 0 );
			col.push( 0.012, 0.1, 0.06 );
			for ( let r = 1; r <= RINGS; r ++ ) for ( let i = 0; i < N; i ++ ) {

				const a = i / N * Math.PI * 2, t = r / RINGS, k = Math.exp( - 4 * t * t ) * ( 1 - t );
				pos.push( Math.cos( a ) * RADIUS * t, 0, Math.sin( a ) * RADIUS * t );
				col.push( 0.012 * k, 0.1 * k, 0.06 * k );

			}

			for ( let i = 0; i < N; i ++ ) {

				idx.push( 0, 1 + ( i + 1 ) % N, 1 + i );
				for ( let r = 0; r < RINGS - 1; r ++ ) {

					const a = 1 + r * N + i, b = 1 + r * N + ( i + 1 ) % N;
					idx.push( a, b, a + N, b, b + N, a + N );

				}

			}

			const g = new BufferGeometry();
			g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
			g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
			g.setIndex( idx );
			this._glow = new Mesh( g, new MeshBasicMaterial( { vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false } ) );
			this._glow.position.set( 0, 0.4, - this.lines.length / 2 - 1 ); // (under her cockpit's sole)
			this._glow.renderOrder = 6;
			this.group.add( this._glow );

		}

		this._glow.visible = on > 0.01;
		this._glow.material.opacity = on;

	}

	// ---- what's fitted on someone else's: told in their pose (a bit each: the tower, the outriggers, the chair)
	gearBits() {

		const F = this.fitted;
		return ( F.tower ? 1 : 0 ) | ( F.outriggers ? 2 : 0 ) | ( F.chair ? 4 : 0 );

	}

	dressCopy( group, bits ) {

		const tower = !! ( bits & 1 ), shown = { 'boat-tower': tower, 'boat-towerThrottle': tower, 'boat-towerDisplay': tower, 'boat-towerCompass': tower, 'boat-outriggers': !! ( bits & 2 ), 'boat-chair': !! ( bits & 4 ) };
		group.traverse( ( o ) => {

			if ( shown[ o.name ] !== undefined ) o.visible = shown[ o.name ];
			if ( o.name === 'boat-wheel' ) o.count = tower ? 2 : 1;

		} );

	}

	// her, to walk about on with that fitted: their tower to climb, or none, whatever's fitted on yours (null: as she is)
	withGear( bits ) {

		if ( bits === null || bits === undefined ) return this;
		const kept = this._withGear || ( this._withGear = new Map() );
		let v = kept.get( bits );
		if ( ! v ) {

			const chair = !! ( bits & 4 );
			v = Object.create( this );
			v.fitted = { tower: !! ( bits & 1 ), outriggers: !! ( bits & 2 ), chair };
			v.chair = chair ? this.chair || this._chairWas : null;
			v.colliders = this.colliders.map( ( c ) => c.tag === 'chair' ? { ...c, solid: chair } : c );
			kept.set( bits, v );

		}

		return v;

	}

	setPaint( hex ) {

		this.materials.setTopsides( hex );

	}

	setOutriggersOut( out ) {

		this._riggerWant = out ? 1 : 0;

	}

	setSteering( angle ) {

		const a = MathUtils.clamp( angle, - 1, 1 );
		this._steer = a;
		// (hydraulic steering: only the wheel in your hands turns)
		this._turnWheel( this.helmInUse === this.towerHelm ? 1 : 0, a );
		for ( const r of this.rudders ) r.rotation.y = - a * RUDDER.maxAngle;

	}

	setThrottle( t ) {

		this._throttle = MathUtils.clamp( t, - 1, 1 );
		const lever = this.helmInUse === this.towerHelm ? this.towerThrottle : this.throttleMesh;
		if ( lever ) lever.rotation.x = this._throttle * 0.6;

	}

	_turnWheel( i, a ) {

		if ( this._wheelTurn[ i ] === a ) return;
		this._wheelTurn[ i ] = a;
		this.wheelMesh.setMatrixAt( i, _m.multiplyMatrices( this._wheels[ i ], _rz.makeRotationZ( - a * WHEEL_TURNS * Math.PI * 2 ) ) );
		this.wheelMesh.instanceMatrix.needsUpdate = true;

	}

	get radarBearing() {

		return this._radarAngle;

	}

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		const rps = this._rpm / 60, shown = RPM_SHOWN * Math.tanh( rps / RPM_SHOWN );
		this._propAngle = ( this._propAngle + shown * Math.PI * 2 * dt ) % ( Math.PI * 2 );
		this.props.forEach( ( p, i ) => {

			p.rotation.z = ( i ? 1 : - 1 ) * this._propAngle;

		} );
		this._radarAngle = ( this._radarAngle + 24 / 60 * Math.PI * 2 * dt ) % ( Math.PI * 2 );
		this.radarMesh.rotation.y = - this._radarAngle;
		this.group.updateWorldMatrix( true, false );
		this.group.matrixWorld.decompose( _pos, _q, _scale );
		this.swingCompass( dt, _q );
		if ( this._rigger !== this._riggerWant ) this._swingRiggers( dt );

	}

	// the poles between up and out: they swing about their bases, the geometry rewritten only while they move
	_swingRiggers( dt ) {

		this._rigger = MathUtils.clamp( this._rigger + Math.sign( this._riggerWant - this._rigger ) * dt / 3, 0, 1 );
		const f = sstep( this._rigger, 0, 1 ), g = this.meshes.outriggers.geometry, P = g.attributes.position, A = this._riggerBase;
		for ( let i = 0; i < P.count; i ++ ) {

			const x = A[ i * 3 ], y = A[ i * 3 + 1 ], z = A[ i * 3 + 2 ], s = Math.sign( x ) || 1;
			_a.set( x - s * RIGGER.base.x, y - RIGGER.base.y, z - RIGGER.base.z );
			const len = _a.length(), along = len / RIGGER.length;
			_c.copy( riggerTip( s, false ) ).lerp( riggerTip( s, true ), f ).sub( _d.set( s * RIGGER.base.x, RIGGER.base.y, RIGGER.base.z ) ).normalize().multiplyScalar( len );
			P.setXYZ( i, s * RIGGER.base.x + _c.x, RIGGER.base.y + _c.y, RIGGER.base.z + _c.z );

		}

		P.needsUpdate = true;
		g.computeBoundingSphere();

	}

	swingCompass( dt, q ) {

		_v.set( 0, 0, 1 ).applyQuaternion( q );
		const her = Math.atan2( _v.x, _v.z ), north = Math.PI - VARIATION;
		const wrap = ( a ) => a - Math.PI * 2 * Math.round( a / ( Math.PI * 2 ) );
		const c = this._card || ( this._card = { a: north, w: 0, her } );
		const bowl = wrap( her - c.her ) / dt;
		c.her = her;
		const k = Math.PI * 2 / 3, n = Math.max( 1, Math.ceil( dt / 0.02 ) ), h = dt / n;
		for ( let i = 0; i < n; i ++ ) {

			c.w += ( - k * k * wrap( c.a - north ) - 2 * 0.55 * k * ( c.w - bowl ) ) * h;
			c.a = wrap( c.a + c.w * h );

		}

		this.compassMesh.rotation.y = c.a - her;
		if ( this.towerCompass ) this.towerCompass.rotation.y = c.a - her;

	}

	get compassHeading() {

		const c = this._card;
		return c ? ( ( c.a - c.her ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 ) : 0;

	}

	dispose() {

		for ( const m of Object.values( this.meshes ) ) m.geometry.dispose();
		if ( this.wheelMesh ) this.wheelMesh.dispose();
		this.materials.dispose();
		if ( this._glow ) {

			this._glow.geometry.dispose();
			this._glow.material.dispose();

		}


	}

}

const _m = new Matrix4(), _rz = new Matrix4();
const _pos = new Vector3(), _scale = new Vector3(), _q = new Quaternion(), _v = new Vector3(), _a = new Vector3(), _c = new Vector3(), _d = new Vector3();
