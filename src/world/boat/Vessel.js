import { Group, Matrix4, Vector3 } from '../../engine/index.js';
import { RHO_SEAWATER } from './HullLines.js';
import { triangleCount } from './GeoKit.js';

// (M16) What every boat is to the rest of the game. BoatModel (the lobster boat) and the others extend this: the game
// reads a boat only through these, and each boat sets its own in its constructor.
//
// Boat frame: +Z forward, +Y up, +X port. y = 0 is the design waterline, z = 0 the middle of the waterline, x = 0 the
// centerline. All points are in it; transform with group.matrixWorld.
//
//   id                     her key in world/boat/Boats.js
//   group, meshes, materials   what's drawn (meshes by name, 'boat-' + name: together/Together.js picks some for phones)
//   lines                  her HullLines: floating, spray, walking and the lamps read them
//   handling               how she handles (world/boat/Handling.js)
//   dimensions, hydro, hullSamples   from floatBody() below
//   helm                   { x, z, eye, rise } where you take the wheel; eye: Vector3 of your eye there; rise: [ x, z ] where you stand up to
//   helmEye                helm.eye, by the older name
//   boardPoint, exitPoints where you step aboard, where you can step off
//   propeller, rudder      Vector3s: her wash and Handling.propellerAndRudder
//   bowSprayPoints         at the waterline, either side of the bow
//   colliders              { tag, center, half, walkable, solid } boxes (Player walks on them)
//   rainTops               what takes the rain from above: { x0, x1, z0, z1, y } (Rain.setDeck)
//   shelter                Matrix4, the boat's frame to the box under her cover, -1..1: no rain falls there (Rain.setShelter)
//   wake                   { quarterX, quarterZ, washZ } where her wake's arms and wash start (ocean/Wake.js)
//   lamps                  where her lights are (materials/LocalLights addBoatLights, world/boat/BoatLamps): any of
//                          { dome, instruments, port, masthead, anchor, stern, spot } as [ x, y, z ], or null for none.
//                          starboard is port's mirror. A small boat's all-round white goes as masthead with no port
//   floods                 [ { at: [ x, y, z ], dir: [ x, y, z ] } ]: her deck floodlights, when she has them (Game)
//   footstep               the sound of walking on her deck (audio.footstep)
//   hornAt, searchlight    Vector3s, or null when she hasn't one
//   seated                 she's sat in, not walked about: there's no deck mode, boarding takes the helm
//   nearDetail             mesh names a phone may leave out far off (App.nearDetail)
//   bunks                  [ { x, y, z } ] where you stand to turn in, for a boat that has them (game/DaysOut.js)
//   transom                optional { x, y, z, w }: where her painted name goes (game/fleet/BoatName.js)
//
// And these, which do nothing until a boat needs them: setSteering, setThrottle, setPropellerRPM, setNavLights, update,
// fit( stats ): what's fitted on her now (Gear.gearStats: called as it changes, and as she's built), setPaint( hex | null ).
export class Vessel {

	constructor( id ) {

		this.id = id;
		this.group = new Group();
		this.group.name = id;
		this.meshes = {};
		this.materials = {};
		this.searchlight = null;
		this.hornAt = null;
		this.seated = false;
		this.floods = [];
		this.footstep = 'wood';
		this.rainTops = [];
		this.nearDetail = [];
		this.bunks = [];
		this.lamps = {};
		this._rpm = 0;

	}

	// Her floating, from her lines. keelVolume: m^3 of any appendage under the canoe body; keelBottom: its lowest y;
	// roofHeight: her highest deck or roof; comY: her centre of mass above the waterline; gyration: radii against
	// [ beam for roll, length for pitch, length for yaw ]. Sets dimensions, hydro and hullSamples
	floatBody( { keelVolume = 0, keelBottom = 0, roofHeight = 0, comY = 0.3, gyration = [ 0.36, 0.26, 0.27 ], samples = 8 } = {} ) {

		const lines = this.lines;
		const displaced = lines.canoeVolume + keelVolume;
		let maxBeam = 0;
		for ( let i = 0; i <= 200; i ++ ) maxBeam = Math.max( maxBeam, lines.sheerX( i / 200 ) );
		let minSheer = Infinity;
		for ( let i = 0; i <= 200; i ++ ) minSheer = Math.min( minSheer, lines.sheerY( i / 200 ) );

		this.dimensions = {
			length: lines.length, // hull LOA (stem head to transom), m
			beam: maxBeam * 2, // max beam at the sheer (rubrail adds ~0.08)
			draft: - keelBottom, // keel shoe below the waterline
			freeboard: minSheer, // lowest sheer height (aft)
			freeboardBow: lines.sheerY( 1 ),
			deckHeight: lines.deckY,
			hullDepth: lines.draftAt( lines.centerOfFlotationZ ), // canoe body depth
			waterlineLength: lines.wlEnd - lines.wlStart,
			waterlineBeam: 2 * this._maxHalfBeam(),
			houseRoofHeight: roofHeight,
		};

		this.hydro = {
			waterplaneArea: lines.waterplaneArea, // m^2
			canoeVolume: lines.canoeVolume, // m^3, hull below y = 0 (what hullSamples integrate)
			keelVolume, // m^3, keel/skeg appendage
			displacedVolume: displaced, // m^3
			suggestedMass: Math.round( RHO_SEAWATER * lines.canoeVolume ), // kg, floats exactly on the design WL with hullSamples
			massWithKeel: Math.round( RHO_SEAWATER * displaced ),
			centerOfBuoyancy: lines.centerOfBuoyancy.clone(), // put the centre of mass at this z for level trim
			centerOfFlotationZ: lines.centerOfFlotationZ,
			waterlineStart: lines.wlStart,
			waterlineEnd: lines.wlEnd,
			seawaterDensity: RHO_SEAWATER,
		};

		// Suggested rigid-body properties (boat frame). Centre of mass over the centre of buoyancy for level trim.
		// Inertia from radii of gyration
		const mass = this.hydro.suggestedMass;
		const kRoll = gyration[ 0 ] * this.dimensions.beam, kPitch = gyration[ 1 ] * lines.length, kYaw = gyration[ 2 ] * lines.length;
		this.hydro.centerOfMass = new Vector3( 0, comY, lines.centerOfBuoyancy.z );
		this.hydro.inertia = new Vector3( mass * kPitch * kPitch, mass * kYaw * kYaw, mass * kRoll * kRoll ); // about x (pitch), y (yaw), z (roll)
		this.hydro.metacentricRadius = this._transverseInertia() / lines.canoeVolume; // BM (m)
		this.hullSamples = lines.buildHullSamples( samples );

	}

	// the box under her cover as shelter wants it: half-width, and the y and z it runs between
	shelterBox( halfX, yLo, yHi, zLo, zHi ) {

		return new Matrix4().makeScale( 1 / halfX, 2 / ( yHi - yLo ), 2 / ( zHi - zLo ) )
			.multiply( new Matrix4().makeTranslation( 0, - ( yLo + yHi ) / 2, - ( zLo + zHi ) / 2 ) );

	}

	// over the rail at these stations, either side
	railPoints( zs ) {

		const L = this.lines, out = [];
		for ( const z of zs ) {

			const t = L.tAtSheerZ( z );
			for ( const s of [ 1, - 1 ] ) out.push( new Vector3( s * ( L.sheerX( t ) - 0.035 ), L.sheerY( t ) + 0.05, z ) );

		}

		return out;

	}

	// at the waterline at these stations, either side
	waterlinePoints( zs ) {

		const out = [];
		for ( const z of zs ) {

			const hb = this.lines.halfBeamAt( z );
			for ( const s of [ 1, - 1 ] ) out.push( new Vector3( s * ( hb + 0.01 ), 0.05, z ) );

		}

		return out;

	}

	_maxHalfBeam() {

		let m = 0;
		for ( let z = this.lines.wlStart; z <= this.lines.wlEnd; z += 0.02 ) m = Math.max( m, this.lines.halfBeamAt( z ) );
		return m;

	}

	_transverseInertia() {

		const lines = this.lines;
		let I = 0;
		const n = 800, z0 = lines.wlStart, dz = ( lines.wlEnd - lines.wlStart ) / n;
		for ( let i = 0; i < n; i ++ ) I += ( 2 / 3 ) * Math.pow( lines.halfBeamAt( z0 + ( i + 0.5 ) * dz ), 3 ) * dz;
		return I;

	}

	// Waterplane half-beam at longitudinal position z (0 outside the waterline length).
	halfBeamAt( z ) {

		return this.lines.halfBeamAt( z );

	}

	// Canoe-body depth below the design waterline at z (0 outside)
	draftAt( z ) {

		return this.lines.draftAt( z );

	}

	// where you can stand: keeps a walker of radius r inside her (p: boat frame). The bulwarks, plus a margin fore and aft
	clampToDeck( p, r ) {

		const L = this.lines;
		p.z = Math.min( this.bowWalk ?? L.zBow - 0.3, Math.max( L.zAft + L.shell + r, p.z ) );
		const halfIn = Math.max( 0.15, L.halfBreadth( L.tAtSheerZ( p.z ), Math.max( p.y, L.deckY ) ) - L.shell - r );
		p.x = Math.min( halfIn, Math.max( - halfIn, p.x ) );

	}

	// the deck under ( x, z ) before any walkable box, for a walker at y (her sole: a boat with more decks says which)
	soleY( x, z, y ) {

		return this.lines.deckY;

	}

	// where rain gathers and drips off her, as fx/Drips' setBoat takes them
	dripPoints() {

		return [];

	}

	setSteering( angle ) {}

	setThrottle( t ) {}

	setPropellerRPM( rpm ) {

		this._rpm = rpm;

	}

	setNavLights( on ) {

		if ( this.materials.setNavLights ) this.materials.setNavLights( on );

	}

	fit( stats ) {}

	// her topsides (state.fleet[ id ].paint's colour, or null as she came)
	setPaint( hex ) {

		const c = this.materials.hull && this.materials.hull.color;
		if ( ! c ) return;
		if ( ! this._asShe ) this._asShe = c.clone();
		if ( hex === null ) c.copy( this._asShe );
		else c.set( hex );

	}

	get radarBearing() {

		return 0;

	}

	get compassHeading() {

		return 0;

	}

	swingCompass( dt, q ) {}

	update( dt ) {}

	dispose() {

		for ( const m of Object.values( this.meshes ) ) m.geometry.dispose();
		if ( this.materials.dispose ) this.materials.dispose();

	}

	get triangleCount() {

		let n = 0;
		for ( const m of Object.values( this.meshes ) ) n += triangleCount( m.geometry );
		return n;

	}

}
