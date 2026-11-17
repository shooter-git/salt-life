import { Mesh, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3, Vector4, MathUtils } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, torus, sphere, mat4, lathe } from '../world/boat/GeoKit.js';
import { createPropMaterial, createLineMaterial, PAT } from './GameMaterials.js';
import { G } from '../core/Globals.js';
import { windBeyondFair } from './Weather.js';
import { RIGS } from './rigs/Presentation.js';
import { FLY_LINE_COLOR, FLY_LINE_GLOW } from './rigs/FlyRod.js';
import { DEFAULT_GEAR, FLY_LINE, LINES, fitUniforms, gearModel, hasModel, modelOf } from './rigs/GearModels.js';

// (M20) the landing net's hoop, ready, this far off a netted fish as it comes in (m: Rigs' NET.reach, and a little more)
const NET_SHOWN = 2.2;

// (M20) The rubber landing net (Gear's landingNet; stream KIT, docs/m20/kit.md): an EGO S2's medium hoop, about 50 cm across, its
// rubber bag 42 cm deep, on a 1.2 m handle. Hoop level about the origin, the bag below it, the handle out along -Z from its
// rim, up a little. Made once, shared with the copies' (Together)
let _net = null;
export function netGeometry() {

	if ( _net ) return _net;
	const R = 0.25, parts = [];
	parts.push( prepare( torus( R, 0.009, 6, 32 ), { color: 0x1d1f22, rough: 0.45, pattern: PAT.machined, matrix: mat4( 0, 0, 0, Math.PI / 2 ) } ) );
	// (the bag: a lathe from its bottom up to the hoop, outside and in, so it's seen from above too)
	const prof = [];
	for ( let i = 8; i >= 0; i -- ) {

		const k = i / 8;
		prof.push( [ R * 0.98 * ( 1 - 0.78 * k * k ), - 0.42 * k ] );

	}

	parts.push( prepare( lathe( prof, 20 ), { color: 0x3c4447, rough: 0.85, pattern: PAT.rubber } ) );
	parts.push( prepare( lathe( prof.map( ( [ r, y ] ) => [ r, y ] ).reverse(), 20 ), { color: 0x2c3336, rough: 0.9, pattern: PAT.rubber } ) );
	// (the handle from the hoop's rim out and up toward whoever holds it)
	parts.push( prepare( cylinder( 0.014, 0.017, 1.2, 8 ), { color: 0x2a2c2f, rough: 0.6, pattern: PAT.eva, matrix: mat4( 0, 0.12, - R - 0.58, Math.PI / 2 + 0.2 ) } ) );
	return ( _net = mergePrepared( parts ) );

}

// (M20) a net mesh under `at` (its fish), its hoop at y, its handle toward `from` (whoever's netting it)
export function placeNet( mesh, at, from, y ) {

	if ( ! mesh.geometry || mesh.geometry !== _net ) mesh.geometry = netGeometry();
	mesh.position.set( at.x, Math.min( y, at.y ) - 0.06, at.z );
	mesh.rotation.set( 0, Math.atan2( at.x - from.x, at.z - from.z ), 0 );

}

// The fishing rod in the player's hands, its line and the bobber.
//
// (M21) Each rod and each reel drawn as itself (rigs/GearModels.js: the hand-me-down, the 7 ft graphite, the 9 ft surf rod, the
// stand-up rod, the bent-butt chair rod and the fly rods; the old and the smooth spinning reels, the conventional, the
// two-speed, the wide 80, the 130, the electric and the fly reels), each at its real size, built the first time it's wanted
// and kept by what it is. Before M21 one model stood for every spinning rod and reel: a 7 ft medium saltwater spinning combo,
// a carbon blank, split EVA grip, screw-down seat, eight guides, a spinning reel under it; it's the graphite rod's and the
// smooth reel's shape now.
//
// Rod frame: +Y along the blank (butt at 0, tip at the model's length), the reel and the guides toward -Z, +X to the right.
// Held in first person where the model says (its fit's hold: a spinning rod's reel seat, a fly rod's cork), relative to the
// camera: a pose (elevation of the rod above the view direction, sideways swing, hand position) is eased between idle /
// wind-up / flick / fighting. A reel that rides on top (a conventional, a big-game reel, the electric) is the same frame
// turned over.
//
// Rod and reel are one merged mesh; the moving parts are tagged in aux.w (rigs/RodParts.js' PART) and moved in the vertex
// shader about the model's own axes (uniforms rodFit and reelAxis, set as a model's fitted): a spinning reel's rotor, bail
// (opens about its pivots, turns with the rotor), crank, spool (in and out as you crank, back when the drag slips) and the
// line on it (its radius following the line left); a drum's (a conventional's, a big-game reel's, a fly reel's) crank and
// spool (turning as you wind, back as a fish takes line) and the line on it. The line on the spool and along the rod is the
// line in use's colour (reelLine), as the line in the air is (lineMat). The blank bends toward the line with a fast action:
// under a light load only the tip section bends, under a heavy one the bend works down into the butt. The same curve is
// evaluated here for the tip the line leaves from.
//
// States: 'stowed' -> 'idle' -> ( hold ) 'windup' -> ( release ) 'flick' -> 'flying' (bobber in the
// air) -> 'floating' (on the water; bites come here) -> 'fighting' (fish on) -> back to 'idle';
// 'retrieving' reels an empty line in; ((M14) 'rigging': a new hook and float tied on after the line's
// snapped, the lost one drifting off: snap()).
//
// (M16) rig ('float', 'bottom', 'drop', 'kite', 'troll': rigs/Presentation.js) says what's on the line, hookM how far down
// the hook is: under a float a little way, or sinking on a lead from where it went in until it's on the bottom or
// you've no more line you can work. Past 'float' there's no float to draw.
//
// (M19) flyRod: a fly rod (rigs/FlyRod.js), held by its cork. With it, 'idle' -> 'falsecast' (the line in the air, back and
// forth) -> 'shoot' (shot, unrolling and laid down) -> 'floating' (the fly on the water, stripped back) as game/FlyCast.js
// drives them: it sets the pose through each stroke (flyPose), the fly's place (the bobber) and draws the line in the air
// (rigs/FlyLine.js); the fly's line on the water is this line, wider and the fly line's colour.
export const ROD_L = 2.13; // (the 7 ft graphite's length: the one model's before M21)

// The blank's bend: a damped spring toward its load (~2.5 Hz, lightly damped), stepped in substeps of at
// most BEND_STEP whatever the frame's length. Stepped once a frame, a frame of 0.0985 s or more (the
// SDK lets one run to 0.1 s: a slow device, a stall as the screen turns from portrait to landscape, a
// bake's frame owed to the next) made it grow every frame instead of settling, the rod thrashing and its
// tip, and the line's end with it, flung kilometres off. s: { x (the bend), v (its rate) }, filled
export const BEND_K = 250, BEND_C = 8, BEND_STEP = 1 / 60;
export function bendStep( s, target, dt ) {

	const n = Math.max( 1, Math.ceil( dt / BEND_STEP - 1e-9 ) ), h = dt / n;
	for ( let i = 0; i < n; i ++ ) {

		s.v += ( ( target - s.x ) * BEND_K - s.v * BEND_C ) * h;
		s.x += s.v * h;

	}

	// (and never a broken one: a bad value starts it again at rest)
	if ( ! Number.isFinite( s.x ) || ! Number.isFinite( s.v ) ) s.x = s.v = 0;
	return s;

}
const _bs = { x: 0, v: 0 };

// (M21) the hand holds the model where its fit says, its blank bends from where its fit says: rigs/GearModels.js
const LINE_PER_CRANK = 0.8; // m of line per crank turn
const LINE_SEGS = 48;
const GRAV = 9.81;
// (M10) in a blow, the cast carried by the wind on the line (m/s^2 for each m/s of wind past a fair
// day's); and the float drifting: its speed for each m/s of it, how far it goes from where it came down
// (m), and the shallowest water it drifts on (m)
const LINE_WIND = 0.4;
const DRIFT_K = 0.02;
const DRIFT_M = 6;
const DRIFT_DEPTH = 0.3;
// (M14) a snapped line: a new hook and float tied on (s: a few, where a real one's a minute or two), and
// the lost float with the broken end of the line (LOST_TAIL m of it, lying back the way it broke) left on
// the water, drifting off downwind (LOST_DRIFT of the wind, at least LOST_DRIFT_MIN m/s, as a float and its
// line are pushed), washed up where the water ends, until it's out of sight (LOST_FAR m) or LOST_S s on
const RIG_S = 8, LOST_TAIL = 1.6, LOST_DRIFT = 0.03, LOST_DRIFT_MIN = 0.08, LOST_FAR = 120, LOST_S = 150;

// bend of the blank at rod height y (same curve in the vertex shader): lateral deflection along the
// bend direction and the drop along the rod that keeps its length about constant. ((M21) Each model's own: fit's blankStart,
// length (L) and the length its bend's a share of (bendL: its own, a fly rod's M19's 7 ft, so it bends as FlyCast has it);
// exported for the rods in the holders: rigs/HolderRods.js)
export const BEND_P = ( load ) => MathUtils.lerp( 3.4, 1.7, MathUtils.clamp( load, 0, 1 ) );
export function bendAt( y, bend, p, out, fit ) {

	const s = MathUtils.clamp( ( y - fit.blankStart ) / ( fit.L - fit.blankStart ), 0, 1 );
	const lat = bend * fit.bendL * Math.pow( s, p );
	out.lat = lat;
	out.drop = 0.5 * lat * lat / ( y - fit.blankStart + 0.06 );
	return out;

}

const _b = { lat: 0, drop: 0 };
const _m = new Matrix4(), _q = new Quaternion(), _v = new Vector3(), _w = new Vector3(), _x = new Vector3(), _y = new Vector3(), _z = new Vector3();
const _tipOld = new Vector3(); // last frame's tip: its own vector (the scratch vectors are reused during update)
// (M21) the tip the cast, the line out and the fight go by, wherever the drawn rod's is: the one model's before M21, a 7 ft rod
// held 0.405 m up it, its blank bending from 0.535 (the stand-up rod's the same), and M19's fly rod, drawn 7 ft long stretched
// back to 9 ft by FLY_K0, held 0.3 m up. So what's cast and fought is as it was (a longer or shorter rod drawn puts its line's
// end on the water a little further or nearer: lineTip)
const OLD_TIP = { L: 2.13, blankStart: 0.535, bendL: 2.13, hold: 0.405 }, FLY_K0 = 2.74 / 2.13, FLY_HOLD0 = 0.3;
const _up = new Vector3( 0, 1, 0 );
const _h = new Vector3();

export const POSES = {
	stowed: { elev: - 0.9, side: 0.35, hand: [ 0.3, - 0.62, - 0.25 ] },
	idle: { elev: 0.46, side: 0.22, hand: [ 0.15, - 0.05, - 0.45 ] },
	windup: { elev: 2.0, side: 0.12, hand: [ 0.22, - 0.08, - 0.2 ] },
	flick: { elev: 0.16, side: 0.14, hand: [ 0.18, - 0.12, - 0.55 ] },
	follow: { elev: 0.24, side: 0.02, hand: [ 0.17, - 0.1, - 0.56 ] }, // follow-through: the rod points along the cast
	floating: { elev: 0.4, side: 0.18, hand: [ 0.15, - 0.06, - 0.46 ] },
	fighting: { elev: 0.9, side: 0.12, hand: [ 0.14, - 0.03, - 0.43 ] },
	landing: { elev: 0.85, side: 0.3, hand: [ 0.16, - 0.08, - 0.46 ] }, // rod up, the fish swinging in view
	rigging: { elev: 0.12, side: 0.3, hand: [ 0.12, - 0.16, - 0.36 ] }, // ((M14) held low and close, tying on a new hook)
	fly: { elev: 0.22, side: 0.12, hand: [ 0.17, - 0.1, - 0.42 ] }, // ((M19) a fly rod's false casting: FlyCast sets its elevation
};

// the rod's material: the blank, its wraps and the reel, with the reel's and the blank's animation in the vertex shader
// (uniforms rodBend, rodShape, reelAnim, reelAnim2). (M21) One program for every rod and reel: each model's own figures are
// per-material uniforms, set as it's fitted (GearModels' fitUniforms): rodFit (where its blank bends from, its length, the
// least radius of the line on its spool, its bail's pivots), reelAxis (its spool's centre, y and z, and its crank's) and
// reelLine (the line in use's colour, and whether it's braid). Before M21 these were constants written into the source,
// which every model had to be built around. Exported for the others' copies (Together) and the rods in the holders
// (rigs/HolderRods.js)
export function createRodMaterial() {

	return createPropMaterial( 'fishingRod', {
		clearcoat: true,
		uniforms: {
			rodBend: { value: new Vector4() }, // xyz bend direction (rod space), w bend
			rodShape: { value: new Vector4( 3, ROD_L, 0, 0 ) }, // x: bend exponent (fast action), (M21) y: the length its bend's a share of
			reelAnim: { value: new Vector4() }, // rotor angle, bail open 0..1, crank angle, spool angle
			reelAnim2: { value: new Vector4( 0, 1, 0, 0 ) }, // spool oscillation (m), line fill
			rodFit: { value: new Vector4( 0.44, ROD_L, 0.0185, 0.403 ) }, // (M21) blank's start, length, the line's least radius, the bail's pivots
			reelAxis: { value: new Vector4( 0.326, - 0.104, 0.256, - 0.104 ) }, // (M21) the spool's centre (y, z), the crank's (y, z)
			reelLine: { value: new Vector4( 0.69, 0.72, 0.74, 0 ) }, // (M21) the line's colour (linear), 1 braid
		},
		vertex: /* glsl */`
	float part = aux.w;
	if ( part > 0.5 && part < 7.5 ) {
		if ( part < 2.5 ) {
			if ( part > 1.5 ) {
				// a spinning reel's bail flips back about the line through its two pivots
				float a = - reelAnim.y * 1.95;
				vec3 c = vec3( 0.0, rodFit.w, reelAxis.y );
				float ca = cos( a ); float sa = sin( a );
				vec3 q = P - c;
				P = c + vec3( q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca );
				Nn = vec3( Nn.x, Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca );
			}
			// its rotor (and the bail on it) turn about the reel's axis
			float a = reelAnim.x;
			float ca = cos( a ); float sa = sin( a );
			vec3 q = P - vec3( 0.0, 0.0, reelAxis.y );
			P = vec3( q.x * ca + q.z * sa, P.y, - q.x * sa + q.z * ca + reelAxis.y );
			Nn = vec3( Nn.x * ca + Nn.z * sa, Nn.y, - Nn.x * sa + Nn.z * ca );
		} else if ( part < 3.5 ) {
			// a crank about its shaft (along x)
			float a = reelAnim.z;
			vec3 c = vec3( 0.0, reelAxis.z, reelAxis.w );
			float ca = cos( a ); float sa = sin( a );
			vec3 q = P - c;
			P = c + vec3( q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca );
			Nn = vec3( Nn.x, Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca );
		} else if ( part < 5.5 ) {
			// a spinning reel's spool: in and out with the crank, turning back when the drag slips; the line on it shrinks as
			// it goes out
			vec3 q = P - vec3( 0.0, 0.0, reelAxis.y );
			if ( part > 4.5 ) {
				float r = length( q.xz );
				q.xz *= mix( rodFit.z, r, reelAnim2.y ) / max( r, 1e-5 );
			}
			float a = reelAnim.w;
			float ca = cos( a ); float sa = sin( a );
			P = vec3( q.x * ca + q.z * sa, P.y + reelAnim2.x, - q.x * sa + q.z * ca + reelAxis.y );
			Nn = vec3( Nn.x * ca + Nn.z * sa, Nn.y, - Nn.x * sa + Nn.z * ca );
		} else {
			// a drum's spool (a conventional's, a big-game reel's, a fly reel's) about its axis across the rod, the line on it
			// shrinking as it goes out
			vec3 q = P - vec3( 0.0, reelAxis.x, reelAxis.y );
			if ( part > 6.5 ) {
				float r = length( q.yz );
				q.yz *= mix( rodFit.z, r, reelAnim2.y ) / max( r, 1e-5 );
			}
			float a = reelAnim.w;
			float ca = cos( a ); float sa = sin( a );
			P = vec3( q.x, q.y * ca - q.z * sa + reelAxis.x, q.y * sa + q.z * ca + reelAxis.y );
			Nn = vec3( Nn.x, Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca );
		}
	}
	// the line on the spool and along the rod: the line in use's colour; braid matt and woven, mono glossy
	if ( ( part > 4.5 && part < 5.5 ) || part > 6.5 ) {
		vColor.rgb = reelLine.rgb;
		vAux.x = mix( 0.32, 0.72, reelLine.w );
		vAux.z = reelLine.w * 11.0;
	}
	// the blank bends toward the line (fast action: rodShape.x = exponent of the deflection)
	float span = rodFit.y - rodFit.x;
	float s = clamp( ( P.y - rodFit.x ) / span, 0.0, 1.0 );
	float pw = rodShape.x;
	float lat = rodBend.w * rodShape.y * pow( s, pw );
	float slope = rodBend.w * rodShape.y * pw * pow( max( s, 1e-4 ), pw - 1.0 ) / span;
	float drop = 0.5 * lat * lat / ( max( P.y - rodFit.x, 0.0 ) + 0.06 );
	P = P + rodBend.xyz * lat - vec3( 0.0, drop, 0.0 );
	Nn = normalize( Nn - vec3( 0.0, slope * dot( Nn, rodBend.xyz ), 0.0 ) );
`,
	} );

}

// (M21) a rod mesh made the model `gear` ({ rod, reel, line }: GearModels'), its geometry and its material's figures -> the model
export function fitRodMesh( mesh, gear ) {

	const m = gearModel( gear.rod, gear.reel );
	mesh.geometry = m.geometry;
	fitUniforms( mesh.material.uniforms, m, gear.line );
	return m;

}

// (M21) what you start with: the hand-me-down and the old spinning reel, 8 lb mono (Gear's first levels)
const START = { rod: 0, reel: 0, line: 0 };
const sameGear = ( a, b ) => !! a && !! b && a.rod === b.rod && a.reel === b.reel && a.line === b.line;

export class FishingRod {

	constructor( { scene, camera, query, terrain, audio = null } ) {

		this.camera = camera;
		this.query = query;
		this.terrain = terrain;
		this.audio = audio;
		this.slot = query.allocate( 'bobber', 1 );
		this.lostSlot = query.allocate( 'lostFloat', 1 ); // ((M14) a snapped line's float, drifting off)

		this.state = 'stowed';
		this.equipped = false;
		this.power = 0; // cast charge 0..1
		this.castM = 22;
		this.reelSpeed = 1.1;
		this.t = 0; // time in state
		this.pose = { elev: POSES.stowed.elev, side: POSES.stowed.side, hand: new Vector3( ...POSES.stowed.hand ) };
		this.bend = 0; // 0..~0.3 (tip deflection / length)
		this.bendDir = new Vector3( 0, 0, - 1 );

		this.bobber = new Vector3();
		this.bobberVel = new Vector3();
		this.landedAt = new Vector3(); // (M10) where it came down on the water (it drifts from there in a blow)
		this.dip = 0; // bobber pulled under (bite cues / fish on)
		this.waterY = 0;
		this.depth = 0; // water depth under the bobber (from the query's floor)
		this.lineOut = 0; // m of line out
		this.slack = 1;
		this.fishPos = new Vector3(); // where the hooked fish is (fighting)
		this._wander = 0;
		this.onLand = null; // callback( 'water' | 'ground' ) when the bobber lands
		this.tip = new Vector3();
		this.lineTip = new Vector3(); // ((M21) the drawn rod's own tip, where the line's drawn from)
		this._rig = 0; // ((M14) s left tying on a new hook and float)
		this.lost = null; // ((M14) a snapped line's float: { pos, back (unit: the way it broke), t, waterY, ashore })
		this.rig = 'float'; // ((M16) what's on the line)
		this.electric = false; // ((M16) the sportfisher's electric reel winding it, for the deep drop: Rigs)
		this.hookM = 0; // how far down the hook is
		this.floatOff = false; // no float on it (a plug's cast with none)
		this.settled = false; // it's gone as far down as it's going
		this.spoolM = 180;
		this.dropReach = Infinity; // the most line you can work there (m)
		this.stopM = null; // ((M16) where you've stopped a lead on its way down, m: null, it goes on: Rigs.holdLead)
		this.hung = null; // (Vector3: where a kite's clip holds the line up: Kite.js)
		this.big = false; // ((M16) a reel on top: the frame turned over. (M21) the model's: fit.top)
		this.flyRod = false; // ((M19) a fly rod's in your hands: rigs/FlyRod.js)
		// ((M21) the rod, reel and line that are fitted ({ rod, reel, line }: rigs/GearModels.js), the model and its figures, and
		// those that are wanted: a model's built the first time it's wanted in your hands)
		this.gear = null;
		this.model = null;
		this.fit = null;
		this._wantGear = START;
		this.flyPose = null; // ((M19) { elev, bend }: FlyCast's, through a false cast and the fly fished)
		this.scream = 0; // (a rod in its holder taking line, m/s: its reel's the sound you hear)

		// reel / bend animation state
		this.bendVel = 0;
		this.load = 0; // 0..1: how deep the bend works into the blank
		this.rotor = 0; this.crank = 0; this.spoolAng = 0; this.spoolOsc = 0;
		this.spoolTurn = 0; // ((M21) a drum's spool, turned as you wind)
		this.bail = 0; // 0 closed .. 1 open
		this.bailTarget = 0;
		this.crankRate = 0; // crank turns / s (smoothed)
		this.lineFill = 1; // line left on the spool (1 = full)
		this._lastOut = 0;

		// ---- meshes
		this.rodMat = createRodMaterial();
		// ((M21) in the scene from the start, as the one model was: what you start with, built now)
		this.rodMesh = new Mesh( undefined, this.rodMat );
		this.rodMesh.name = 'FishingRod';
		this.rodMesh.frustumCulled = false;
		this.rodMesh.castShadow = false;
		this.rodMesh.matrixAutoUpdate = false;
		this.rodMesh.visible = false;

		this.bobberMat = createPropMaterial( 'bobber' );
		this.bobberMesh = new Mesh( buildBobberGeometry(), this.bobberMat );
		this.bobberMesh.name = 'Bobber';
		this.bobberMesh.frustumCulled = false;
		this.bobberMesh.castShadow = false;
		this.bobberMesh.visible = false;

		this.lineMat = createLineMaterial( LINE_SEGS );
		this.lineMesh = new Mesh( buildLineGeometry( LINE_SEGS ), this.lineMat );
		this.lineMesh.name = 'FishingLine';
		this.lineMesh.frustumCulled = false;
		this.lineMesh.castShadow = false;
		this.lineMesh.visible = false;

		// ((M14) a snapped line's float and the broken end of its line (the float's and the line's own
		// programs)
		this.lostMesh = new Mesh( this.bobberMesh.geometry, this.bobberMat );
		this.lostMesh.name = 'LostFloat';
		this.lostLineMat = createLineMaterial( LINE_SEGS );
		this.lostLine = new Mesh( this.lineMesh.geometry, this.lostLineMat );
		this.lostLine.name = 'LostLine';
		for ( const m of [ this.lostMesh, this.lostLine ] ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.visible = false;

		}

		scene.add( this.rodMesh, this.bobberMesh, this.lineMesh, this.lostMesh, this.lostLine );
		this._fitGear( START );
		// ((M20) the landing net (Gear's landingNet), drawn as a netted fish comes alongside and as it's lifted out: netting, set by
		// the game as the fight starts (Rigs' net). Made, and put in the scene, the first time it's wanted: in it from the start, the
		// load's compile built the bobber's program before ready, a 17th)
		this.netting = false;
		this.netMesh = null;
		this._scene = scene;

	}

	// (Salt Life) another player's rod, bobber and line (together/Together.js): the same geometry, and
	// materials of their own (the rod's bend and the line's ends are uniforms) in the same programs. ((M21) Their rod's the model
	// their pose says, fitted by Together; till then the one drawn for a game that doesn't say: GearModels' DEFAULT_GEAR)
	tackle() {

		const rod = new Mesh( undefined, createRodMaterial() );
		rod.userData.gear = DEFAULT_GEAR;
		rod.userData.model = fitRodMesh( rod, DEFAULT_GEAR );
		const bobber = new Mesh( this.bobberMesh.geometry, this.bobberMat );
		const line = new Mesh( this.lineMesh.geometry, createLineMaterial( LINE_SEGS ) );
		const net = new Mesh( undefined, this.bobberMat ); // ((M20) their landing net: netGeometry, when it's first wanted)
		for ( const m of [ rod, bobber, line, net ] ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.visible = false;

		}

		rod.matrixAutoUpdate = false;
		line.material.uniforms.lineShow.value = 1;
		return { rod, bobber, line, net };

	}

	// model: the rod, reel and line to draw ({ rod, reel, line }: GearModels' modelOf, Rigs.rodGear's); without it, as before
	// M21: a fly rod by its weight, the stand-up rod, or what you start with
	setGear( { castM, reelSpeed, spoolM = 180, standUp = false, fly = 0, model = null } ) {

		this.castM = castM;
		this.reelSpeed = reelSpeed;
		this.spoolM = spoolM;
		this.standUp = standUp;
		this.flyWt = fly; // ((M19) the fly rod's weight, 0 none)
		this.setModel( model || ( fly ? modelOf( { fly } ) : standUp ? modelOf( { rod: 3, reel: 3, line: 3 } ) : START ) );

	}

	// (M21) the rod, reel and line in your hands: fitted now if it's built already or the rod's in your hands, else as it's
	// taken up (equip). ((M16) the stand-up rod's built as it's first bought or taken out: most never get there; (M19) the fly
	// rod too. Each model's so now)
	setModel( gear ) {

		if ( ! gear ) return;
		this._wantGear = gear;
		if ( sameGear( gear, this.gear ) ) return;
		if ( this.equipped || hasModel( gear.rod, gear.reel ) ) this._fitGear( gear );

	}

	_fitGear( gear ) {

		this.gear = { rod: gear.rod, reel: gear.reel, line: gear.line };
		this.model = fitRodMesh( this.rodMesh, gear );
		this.fit = this.model.fit;
		this.big = this.fit.top;
		this.flyRod = this.fit.fly;
		this._lineLook();

	}

	// (M21) the line in the air and on the water as the line in use: its colour (GearModels' LINES), matt as braid is; a fly's the
	// fly line, its colour and its glow (FlyLine's), and wider
	_lineLook() {

		const fly = this.rig === 'fly', L = LINES[ fly ? FLY_LINE : this.gear ? this.gear.line : 0 ] || LINES[ 0 ];
		this.lineMat.color.setHex( fly ? FLY_LINE_COLOR : L.color );
		this.lineMat.roughness = L.braid ? 0.75 : 0.35;
		if ( ! fly ) this.lineMat.emissive.setHex( 0 );

	}

	// (M16) what's on the line for the next cast
	setRig( rig, floatOff = false ) {

		// ((M19) a fly's line is the fly line: its colour and its glow (FlyLine's), and wider. (M21) Off it, the line in use's)
		const was = this.rig;
		this.rig = rig;
		if ( ( rig === 'fly' ) !== ( was === 'fly' ) ) this._lineLook();
		this.floatOff = floatOff;
		this.hookM = 0;
		this.settled = false;
		this.stopM = null;

	}

	// (M16) straight down from where you're standing (a deep drop: a lead's too heavy to cast), or hung from a kite
	dropLine() {

		if ( this.state !== 'idle' ) return false;
		const d = this.camera.getWorldDirection( _v ).setY( 0 ).normalize();
		this.bobber.set( this.tip.x + d.x * 1.2, this.waterY, this.tip.z + d.z * 1.2 );
		this.landedAt.copy( this.bobber );
		this.bobberVel.set( 0, 0, 0 );
		this.setState( 'floating' );
		if ( this.audio && this.audio.plop ) this.audio.plop( this.bobber );
		return true;

	}

	equip( on ) {

		if ( on && ! sameGear( this._wantGear, this.gear ) ) this._fitGear( this._wantGear );
		this.equipped = on;
		if ( on && this.state === 'stowed' ) this.setState( 'idle' );
		if ( on && this.audio && this.audio.rodReady ) this.audio.rodReady();
		if ( ! on ) this.setState( 'stowed' );

	}

	setState( s ) {

		this.state = s;
		this.t = 0;

	}

	get lineInWater() {

		return this.state === 'floating' || this.state === 'fighting' || this.state === 'retrieving' || this.state === 'flying' || this.state === 'landing' || this.state === 'shoot';

	}

	// ---- actions (from the game)
	startWindup() {

		if ( this.state !== 'idle' ) return false;
		this.setState( 'windup' );
		this.power = 0;
		return true;

	}

	release() {

		if ( this.state !== 'windup' ) return false;
		this.setState( 'flick' );
		return true;

	}

	retrieve() {

		if ( this.state === 'floating' || this.state === 'flying' ) this.setState( 'retrieving' );

	}

	hook() {

		if ( this.state !== 'floating' ) return false;
		this.setState( 'fighting' );
		this.fishPos.copy( this.bobber );
		return true;

	}

	// fish landed: swing it up out of the water on a short line (the game hangs the fish on the end)
	land() {

		this.setState( 'landing' );
		this.setRig( this.rig, this.floatOff );
		this._landFrom = this.bobber.clone();

	}

	// (M14) the line's snapped: its float and the broken end of the line left on the water where it was, to
	// drift off; a new hook and float to tie on before the next cast
	snap() {

		if ( this.lineInWater && this.rig === 'float' && ! this.floatOff ) {

			const back = new Vector3( this.tip.x - this.bobber.x, 0, this.tip.z - this.bobber.z );
			if ( back.lengthSq() < 1e-6 ) back.set( 0, 0, 1 );
			this.lost = { pos: this.bobber.clone(), back: back.normalize(), t: 0, waterY: this.waterY, ashore: false };

		}

		this._rig = RIG_S;
		this.setState( 'rigging' );
		this.setRig( this.rig, this.floatOff );

	}

	// fish lost: line back to the rod
	endFight() {

		this.setState( this.lineOut > 3 ? 'retrieving' : 'idle' );
		if ( this.state === 'idle' ) this.setRig( this.rig, this.floatOff );

	}

	// ---- per frame. fight: { distance, tension, surge } while fighting
	update( dt, { visible, fight = null } ) {

		// (Salt Life: held back from the load's first frames, whose drawing compiles their shaders; the
		// app compiles them after the start: App.prepareLate)
		if ( this.holdBack ) visible = false;

		this.t += dt;
		const cam = this.camera;
		const tipOld = _tipOld.copy( this.lineTip );
		// ((M14) tying on a new hook and float after a snap: no cast until it's on, whatever's happened since)
		if ( this._rig > 0 ) this._rig = Math.max( 0, this._rig - dt );
		if ( this.state === 'idle' && this._rig > 0 ) this.setState( 'rigging' );
		else if ( this.state === 'rigging' && this._rig <= 0 ) this.setState( 'idle' );

		// charge while winding up
		if ( this.state === 'windup' ) this.power = Math.min( 1, this.power + dt / 1.1 );

		// ---- rod pose
		let target = POSES[ this.state ] || POSES.idle;
		if ( this.state === 'flying' ) target = POSES.follow;
		if ( this.state === 'retrieving' ) target = POSES.floating;
		if ( this.state === 'flick' && this.t < 0.06 ) target = POSES.windup;
		// ((M19) a fly: false casting, shot, or fished with the rod low: its elevation as FlyCast has it at this moment)
		const fp = this.flyPose && ( this.state === 'falsecast' || this.state === 'shoot' || this.state === 'floating' ) ? this.flyPose : null;
		if ( fp ) {

			target = POSES.fly;
			target.elev = fp.elev;

		}

		const speed = this.state === 'flick' ? 28 : this.state === 'windup' ? 7 : fp && this.state !== 'floating' ? 30 : 5;
		const k = 1 - Math.exp( - speed * dt );
		const p = this.pose;
		p.elev += ( target.elev - p.elev ) * k;
		p.side += ( target.side - p.side ) * k;
		p.hand.x += ( target.hand[ 0 ] - p.hand.x ) * k;
		p.hand.y += ( target.hand[ 1 ] - p.hand.y ) * k;
		p.hand.z += ( target.hand[ 2 ] - p.hand.z ) * k;
		// fighting: the rod dips and sways with the fish
		let elev = p.elev, side = p.side;
		if ( this.state === 'fighting' && fight ) {

			elev += - 0.35 * fight.surge + 0.12 * Math.sin( this.t * 2.3 );
			side += 0.12 * Math.sin( this.t * 1.1 + fight.surge * 2 );

		}

		// a live hand: breathing sway, and the tip twitching with each crank turn
		elev += Math.sin( this.t * 1.3 ) * 0.012 + Math.sin( this.crank ) * 0.006 * Math.min( 1, this.crankRate );
		side += Math.sin( this.t * 0.9 + 1.7 ) * 0.01;

		// rod basis in camera space: +Y along the rod, +Z roughly up (the reel hangs below the rod);
		// the hand holds the reel seat, the butt runs back under the forearm
		_y.set( 0, 0, - 1 ).applyAxisAngle( _x.set( 1, 0, 0 ), elev ).applyAxisAngle( _up, side ).normalize();
		_z.set( 0, 1, 0 ).addScaledVector( _y, - _y.y ).normalize();
		_x.crossVectors( _y, _z ).normalize();
		// ((M16) a conventional rod's reel and guides ride on top of it)
		const fit = this.fit;
		if ( this.big ) {

			_x.negate();
			_z.negate();

		}

		// ((M21) held where the model says: a spinning rod's reel seat, a big rod's fore-grip at its reel, a fly rod's cork. Each at
		// its real length: M19's fly rod was drawn the spinning rod's length and stretched back by the hand's matrix)
		_m.makeBasis( _x, _y, _z ).setPosition( _h.copy( p.hand ).addScaledVector( _y, - fit.hold ) );
		cam.updateMatrixWorld();
		this.rodMesh.matrix.multiplyMatrices( cam.matrixWorld, _m );
		this.rodMesh.matrixWorldNeedsUpdate = true;
		this.rodMesh.visible = visible && ( this.equipped || p.elev > POSES.stowed.elev + 0.1 );

		// ---- bend: a damped spring toward the load (the flick loads the blank back, then it whips
		// through; bites nod the tip), direction toward the line when it is out
		let bendT = 0, loadT = 0.15;
		if ( this.state === 'fighting' && fight ) {

			bendT = 0.06 + 0.3 * Math.min( fight.tension, 1.1 ) + 0.05 * fight.surge;
			loadT = Math.min( 1, fight.tension * 1.1 );

		} else if ( this.state === 'retrieving' ) bendT = 0.035;
		else if ( this.state === 'windup' ) bendT = 0.02 + 0.03 * this.power;
		else if ( this.state === 'flick' ) {

			bendT = this.t < 0.09 ? - 0.2 * ( 0.4 + this.power ) : 0; // loaded back, then released
			loadT = 0.55;

		} else if ( this.state === 'floating' ) bendT = 0.012 + this.dip * 0.07;
		else if ( fp && fp.bend !== null ) {

			bendT = fp.bend; // ((M19) a fly rod loaded through each stroke, and let go at its stop
			loadT = 0.6;

		}
		else if ( this.state === 'landing' ) {

			bendT = 0.14;
			loadT = 0.5;

		}

		_bs.x = this.bend;
		_bs.v = this.bendVel;
		bendStep( _bs, bendT, dt );
		this.bend = _bs.x;
		this.bendVel = _bs.v;
		this.load += ( loadT - this.load ) * ( 1 - Math.exp( - dt * 6 ) );
		// bend direction: toward the bobber (rod space, across the blank) when the line is out,
		// otherwise down toward the reel side (negative bend = loaded back up)
		if ( this.lineInWater && this.state !== 'flying' && this.state !== 'shoot' ) {

			_v.copy( this.bobber ).applyMatrix4( _m.copy( this.rodMesh.matrix ).invert() ).setY( 0 );
			if ( _v.lengthSq() > 1e-6 ) this.bendDir.lerp( _v.normalize(), 1 - Math.exp( - dt * 10 ) ).normalize();

		} else this.bendDir.lerp( _w.set( 0, 0, this.big ? 1 : - 1 ), 1 - Math.exp( - dt * 10 ) ).normalize();
		const P = BEND_P( this.load );
		this.rodMat.uniforms.rodBend.value.set( this.bendDir.x, 0, this.bendDir.z, this.bend );
		this.rodMat.uniforms.rodShape.value.x = P;

		// tip in world space (same curve as the shader): ((M21) the drawn rod's, the line's drawn from it)
		bendAt( fit.L, this.bend, P, _b, fit );
		this.lineTip.set( this.bendDir.x * _b.lat, fit.L - _b.drop, this.bendDir.z * _b.lat ).applyMatrix4( this.rodMesh.matrix );
		// ((M21) and the one the fishing goes by, as it was before M21: OLD_TIP)
		bendAt( OLD_TIP.L, this.bend, P, _b, OLD_TIP );
		const along = this.flyRod ? FLY_K0 * ( OLD_TIP.L - _b.drop ) - FLY_HOLD0 : OLD_TIP.L - _b.drop - OLD_TIP.hold;
		this.tip.set( this.bendDir.x * _b.lat, fit.hold + along, this.bendDir.z * _b.lat ).applyMatrix4( this.rodMesh.matrix );

		// ---- reel: the bail opens as you wind up (finger on the line) and snaps shut on the first
		// crank; the handle and rotor turn with the line coming in, the spool slips back when a fish
		// takes line against the drag
		const spin = fit.kind === 'spin';
		this.bailTarget = spin && ( this.state === 'windup' || this.state === 'flick' || this.state === 'flying' ) ? 1 : 0; // ((M19) a fly reel's none; (M21) nor a drum's
		if ( this.bailTarget !== this._bailSnd ) {

			if ( this._bailSnd !== undefined && this.audio && this.audio.bail ) this.audio.bail( this.bailTarget === 1 );
			this._bailSnd = this.bailTarget;

		}
		const bailRate = this.bailTarget > this.bail ? 6 : 16;
		this.bail += Math.sign( this.bailTarget - this.bail ) * Math.min( Math.abs( this.bailTarget - this.bail ), bailRate * dt );
		const outNow = this.state === 'fighting' && fight ? fight.distance : this.lineOut;
		const dOut = this.lineInWater && dt > 0 ? outNow - this._lastOut : 0;
		this._lastOut = outNow;
		let rateT = 0;
		if ( ( this.state === 'fighting' || this.state === 'retrieving' || this.state === 'landing' ) && dt > 0 ) {

			if ( dOut < 0 ) rateT = Math.min( 1.6, - dOut / dt / LINE_PER_CRANK );
			else if ( this.state === 'fighting' ) this.spoolAng -= Math.min( dOut, 0.5 ) / fit.lineR * ( fit.kind === 'drum' ? - 1 : 1 ); // drag slipping
			if ( this.state === 'landing' ) rateT = this.t < 0.5 ? 1.2 : 0;

		}

		this.crankRate += ( rateT - this.crankRate ) * ( 1 - Math.exp( - dt * 10 ) );
		const dCrank = this.crankRate * Math.PI * 2 * dt;
		if ( ! this.electric ) this.crank += dCrank; // ((M21) the electric reel's motor turns its spool, not its handle)
		// the rotor turns its gear's times faster; shown at most ~3 turns a second (it would strobe). ((M21) A drum's spool turns
		// against its crank (a gear's between them) at its own gear, a fly reel's with it: its knob's on the spool)
		const turn = Math.min( dCrank * fit.ratio, 3.1 * Math.PI * 2 * dt );
		if ( spin ) this.rotor += turn;
		else this.spoolTurn += fit.kind === 'fly' ? turn : - turn;
		this.spoolOsc = Math.sin( this.crank * 0.5 ) * fit.osc;
		this.lineFill = 1 - Math.min( 1, this.lineOut / this.spoolM ) * 0.5;
		this.rodMat.uniforms.reelAnim.value.set( this.rotor, this.bail, this.crank, this.spoolAng + this.spoolTurn );
		if ( this.audio && this.audio.rodLoop ) this.audio.rodLoop( this.crankRate, this.state === 'fighting' && dOut > 0 && dt > 0 ? dOut / dt : this.scream || 0, this.state === 'fighting' && fight ? fight.tension : 0, this.electric );
		this.rodMat.uniforms.reelAnim2.value.set( this.spoolOsc, this.lineFill, 0, 0 );

		// ---- flick: the bobber leaves the tip half way through
		if ( this.state === 'flick' && this.t > 0.09 ) {

			const v0 = 7 + 13 * this.power * ( this.castM / 22 ) ** 0.5;
			// toward where you aim: the heading runs from the tip (off to the side of the view) to the
			// point on the water straight ahead at the cast's reach, so the line leaves along the rod
			// toward the crosshair instead of parallel to the view from the tip
			const d = cam.getWorldDirection( _v );
			const hl = Math.max( Math.hypot( d.x, d.z ), 1e-3 );
			const reach = this.castM * ( 0.35 + 0.65 * this.power );
			const tx = cam.position.x + d.x / hl * reach - this.tip.x, tz = cam.position.z + d.z / hl * reach - this.tip.z;
			const tl = Math.max( Math.hypot( tx, tz ), 1e-3 );
			d.set( tx / tl * hl, Math.max( d.y, - 0.2 ) + 0.35, tz / tl * hl ).normalize();
			this.bobber.copy( this.tip );
			this.bobberVel.copy( d ).multiplyScalar( v0 );
			this.setState( 'flying' );
			if ( this.audio && this.audio.whoosh ) this.audio.whoosh( this.power );
			if ( this.audio && this.audio.lineOut ) this.audio.lineOut( this.power );

		}

		// water at the bobber (read back from last frame's query)
		this.query.setPoint( this.slot, this.bobber.x, this.bobber.z );
		if ( this.query.cpuValid ) {

			const h = this.query.cpu[ this.slot * 4 ], f = this.query.cpu[ this.slot * 4 + 3 ];
			if ( Number.isFinite( h ) ) this.waterY = h;
			if ( Number.isFinite( f ) ) this.depth = Math.max( 0, h - f );

		}

		const ground = this.terrain.heightAt( this.bobber.x, this.bobber.z );
		if ( this.state === 'flying' ) {

			// ballistic with a little drag, capped by the rod's casting range. (M10) In a blow the wind past
			// a fair day's bellies the line and carries the float along: a cast downwind runs on (as far
			// as the rod casts), one into it falls short, and a cross wind sets it aside
			this.bobberVel.y -= GRAV * dt;
			this.bobberVel.multiplyScalar( Math.exp( - dt * 0.25 ) );
			const wind = LINE_WIND * windBeyondFair( G.windSpeed.value ), wd = G.windDir.value;
			this.bobberVel.x += wd.x * wind * dt;
			this.bobberVel.z += wd.y * wind * dt;
			this.bobber.addScaledVector( this.bobberVel, dt );
			const range = Math.hypot( this.bobber.x - this.tip.x, this.bobber.z - this.tip.z );
			if ( range > this.castM ) {

				this.bobberVel.x *= 0.5;
				this.bobberVel.z *= 0.5;

			}

			const surf = Math.max( this.waterY, ground );
			if ( this.bobber.y <= surf ) {

				this.bobber.y = surf;
				const onWater = this.waterY > ground + 0.05;
				this.setState( onWater ? 'floating' : 'retrieving' );
				this.landedAt.copy( this.bobber );
				this.bobberVel.set( 0, 0, 0 );
				if ( onWater && this.audio && this.audio.plop ) this.audio.plop( this.bobber );
				if ( this.onLand ) this.onLand( onWater ? 'water' : 'ground' );

			}

		} else if ( this.state === 'floating' ) {

			// riding the waves; dips with the bite cues. (M10) In a blow it drifts downwind, a few hundredths
			// of the wind past a fair day's, up to DRIFT_M from where it came down, and no further into the
			// shallows than a float rides (the bites follow it: Game.habitat reads where it is)
			const drift = this.rig === 'float' ? DRIFT_K * windBeyondFair( G.windSpeed.value ) : 0;
			if ( drift > 0 && this.depth > DRIFT_DEPTH ) {

				const wd = G.windDir.value, x = this.bobber.x + wd.x * drift * dt, z = this.bobber.z + wd.y * drift * dt;
				if ( Math.hypot( x - this.landedAt.x, z - this.landedAt.z ) < DRIFT_M ) {

					this.bobber.x = x;
					this.bobber.z = z;

				}

			}

			const bob = Math.sin( this.t * 2.1 ) * 0.008;
			const yT = this.waterY + 0.012 + bob - this.dip * 0.09;
			this.bobber.y += ( yT - this.bobber.y ) * ( 1 - Math.exp( - dt * 12 ) );
			this._sinkHook( dt );
			// ((M16) the line down to a lead stays under you as she drifts; one hung from a kite goes where its clip does)
			if ( this.rig === 'bottom' || this.rig === 'drop' ) {

				const k = 1 - Math.exp( - dt * 0.35 );
				this.bobber.x += ( this.tip.x - this.bobber.x ) * k;
				this.bobber.z += ( this.tip.z - this.bobber.z ) * k;

			}

			if ( this.hung ) this.bobber.copy( this.hung );

		} else if ( this.state === 'fighting' && fight ) {

			// the fish runs about at the fight's distance, the bobber dragged under near it
			this._wander += dt * ( 0.4 + fight.surge * 1.5 );
			_v.copy( this.fishPos ).sub( this.tip ).setY( 0 );
			const d0 = _v.length() || 1;
			_v.multiplyScalar( 1 / d0 );
			const sideways = _x.set( - _v.z, 0, _v.x ).multiplyScalar( Math.sin( this._wander ) * 0.9 * dt * ( 1 + fight.surge ) );
			// ((M16) the line goes down to a deep fish, and it comes up as it comes in)
			const down = fight.hookM || 0, dist = Math.sqrt( Math.max( 1, fight.distance * fight.distance - down * down ) );
			this.hookM = down;
			this.fishPos.set( this.tip.x + _v.x * dist, 0, this.tip.z + _v.z * dist ).add( sideways );
			this.bobber.x += ( this.fishPos.x - this.bobber.x ) * ( 1 - Math.exp( - dt * 6 ) );
			this.bobber.z += ( this.fishPos.z - this.bobber.z ) * ( 1 - Math.exp( - dt * 6 ) );
			this.bobber.y += ( this.waterY - down - 0.05 - 0.2 * fight.surge - this.bobber.y ) * ( 1 - Math.exp( - dt * 8 ) );

		} else if ( this.state === 'landing' ) {

			// lifted out and swung in to hang in front of you, a little right of centre and below eye level
			const k = Math.min( 1, this.t / 0.6 );
			const e = k * k * ( 3 - 2 * k );
			const fwd = cam.getWorldDirection( _x ).setY( 0 ).normalize();
			_v.copy( cam.position ).addScaledVector( fwd, 1.25 ).add( _h.set( - fwd.z, 0, fwd.x ).multiplyScalar( 0.15 ) );
			_v.y += 0.12;
			this.bobber.lerpVectors( this._landFrom || this.bobber, _v, e );
			this.bobber.y += Math.sin( e * Math.PI ) * 0.8;

		} else if ( this.state === 'retrieving' ) {

			// reel an empty line in: the bobber skims back to the rod
			_v.copy( this.tip ).sub( this.bobber ).setY( 0 );
			const d = _v.length();
			const step = Math.min( d, ( 3 + this.reelSpeed * 3 ) * dt );
			// ((M16) up from the deep first: it's a long way)
			if ( this.hookM > 0 ) this.hookM = Math.max( 0, this.hookM - ( 3 + this.reelSpeed * 3 ) * dt );
			if ( d > 1e-3 ) this.bobber.addScaledVector( _v.multiplyScalar( 1 / d ), step );
			this.bobber.y += ( Math.max( this.waterY + 0.02, ground ) - this.bobber.y ) * ( 1 - Math.exp( - dt * 10 ) );
			if ( d < 2.2 && this.hookM <= 0 ) {

				this.setState( 'idle' );
				this.setRig( this.rig, this.floatOff );

			}

		}

		// ---- line
		const out = this.lineInWater;
		this.lineOut = out ? this.tip.distanceTo( this.bobber ) + ( this.state === 'fighting' ? 0 : this.hookM ) : 0;
		const lm = this.lineMat.uniforms;
		lm.lineA.value.copy( this.lineTip );
		lm.lineB.value.copy( this.bobber );
		const taut = this.state === 'fighting' ? Math.min( 1, ( fight ? fight.tension : 0 ) * 1.5 ) : this.state === 'retrieving' ? 0.6 : 0;
		const sag = this.lineOut * ( this.state === 'flying' ? 0.03 : 0.07 ) * ( 1 - taut ) + 0.02;
		lm.lineCtl.value.copy( this.lineTip ).lerp( this.bobber, 0.5 ).y -= sag;
		// ((M19) a fly line on the water lies on it: down from the tip and along the surface to the fly, not sagging under it)
		if ( this.rig === 'fly' && ( this.state === 'floating' || this.state === 'retrieving' ) ) lm.lineCtl.value.copy( this.lineTip ).lerp( this.bobber, 0.15 ).setY( this.waterY + 0.02 );
		// the line near the rod follows the rod's motion a little (whips on the flick)
		if ( this.state === 'flying' ) lm.lineCtl.value.addScaledVector( _v.copy( this.lineTip ).sub( tipOld ), - 2 );
		lm.lineShow.value = this.rig === 'fly' ? 1.8 : 1; // ((M19) a fly line's 1.1 to 1.5 mm, mono's a third of it: rigs/FlyLine.js)
		if ( this.rig === 'fly' ) this.lineMat.emissive.setHex( FLY_LINE_COLOR ).multiplyScalar( FLY_LINE_GLOW * ( 1 - Math.min( 1, G.night.value ) ) ); // (and its glow, by day)
		this.lineMesh.visible = visible && out && this.state !== 'shoot'; // ((M19) shot, it's drawn as it unrolls: FlyLine
		this.bobberMesh.visible = visible && out && this.state !== 'landing' && this.rig === 'float' && ! this.floatOff;
		this.bobberMesh.position.copy( this.bobber );
		// ((M20) the landing net: in the water beside a netted fish once it's alongside, and under it as it's lifted out)
		const netOn = visible && this.netting && ( this.state === 'landing' || ( this.state === 'fighting' && fight && fight.distance < NET_SHOWN ) );
		if ( netOn && ! this.netMesh ) {

			const m = this.netMesh = new Mesh( netGeometry(), this.bobberMat );
			m.name = 'LandingNet';
			m.frustumCulled = false;
			m.castShadow = false;
			this._scene.add( m );

		}

		if ( this.netMesh ) this.netMesh.visible = netOn;
		if ( netOn ) placeNet( this.netMesh, this.bobber, cam.position, this.state === 'landing' ? this.bobber.y : this.waterY );
		if ( this.state !== 'fighting' && this.state !== 'landing' ) this.netting = false;
		// a real float is a few pixels at casting range: grow it with distance so it stays readable
		const camD = this.bobber.distanceTo( cam.position );
		this.bobberMesh.scale.setScalar( Math.max( 1, camD / 7 ) );
		// bobber tilts toward the pull
		this.bobberMesh.rotation.set( this.dip * 0.4, 0, 0 );
		this._drift( dt, visible );

	}

	// (M16) how far down the hook goes: under a float, only to its stop or the bottom; on a lead, sinking until you stop
	// it, it's on the bottom or there's no more line you can work
	_sinkHook( dt ) {

		const R = RIGS[ this.rig ], floor = Math.max( 0, this.depth - 0.4 );
		// ((M19) a fly sinks at its own pace to the bottom (Bait.js' sink), lifted off it by each strip: FlyCast)
		if ( this.rig === 'fly' ) {

			const to = Math.max( 0, this.depth - 0.05 );
			this.hookM = Math.min( to, this.hookM + ( this.flySink || 0.2 ) * dt );
			this.settled = this.hookM >= to - 1e-3;
			return;

		}

		if ( this.rig === 'float' || this.rig === 'troll' || this.rig === 'kite' ) {

			this.hookM = this.floatOff || this.rig !== 'float' ? 0.3 : Math.min( floor, R.stop );
			this.settled = true;
			return;

		}

		const to = Math.min( floor, R.reach, this.dropReach, this.stopM ?? Infinity );
		this.hookM = Math.min( to, this.hookM + R.sink * dt );
		this.settled = this.hookM >= to - 1e-3;

	}

	// (M14) a snapped line's float, drifting off downwind on the waves with the broken end of its line lying
	// back the way it broke; washed up where the water ends, lying on its side; gone once it's out of sight
	_drift( dt, visible ) {

		const L = this.lost;
		if ( ! L ) return;
		L.t += dt;
		this.query.setPoint( this.lostSlot, L.pos.x, L.pos.z );
		if ( this.query.cpuValid ) {

			const h = this.query.cpu[ this.lostSlot * 4 ];
			if ( Number.isFinite( h ) ) L.waterY = h;

		}

		const ground = this.terrain.heightAt( L.pos.x, L.pos.z );
		if ( ! L.ashore && L.waterY < ground + 0.03 ) L.ashore = true;
		if ( ! L.ashore ) {

			const wd = G.windDir.value, v = Math.max( LOST_DRIFT_MIN, LOST_DRIFT * G.windSpeed.value );
			L.pos.x += wd.x * v * dt;
			L.pos.z += wd.y * v * dt;

		}

		const yT = L.ashore ? ground + 0.02 : L.waterY + 0.012 + Math.sin( L.t * 2.1 ) * 0.008;
		L.pos.y += ( yT - L.pos.y ) * ( 1 - Math.exp( - dt * 8 ) );
		const camD = L.pos.distanceTo( this.camera.position );
		this.lostMesh.position.copy( L.pos );
		this.lostMesh.rotation.set( L.ashore ? 1.4 : 0.2 * Math.sin( L.t * 1.3 ), L.t * 0.15, 0 );
		this.lostMesh.scale.setScalar( Math.max( 1, camD / 7 ) );
		const lm = this.lostLineMat.uniforms;
		lm.lineA.value.copy( L.pos );
		lm.lineB.value.set( L.pos.x + L.back.x * LOST_TAIL, L.pos.y - 0.01, L.pos.z + L.back.z * LOST_TAIL );
		lm.lineCtl.value.copy( lm.lineA.value ).lerp( lm.lineB.value, 0.5 ).y -= 0.02;
		lm.lineShow.value = 1;
		this.lostMesh.visible = this.lostLine.visible = visible;
		if ( L.t > LOST_S || camD > LOST_FAR ) {

			this.lost = null;
			this.lostMesh.visible = this.lostLine.visible = false;

		}

	}

}

// ---- geometry

function buildBobberGeometry() {

	const parts = [];
	parts.push( prepare( sphere( 0.028, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2 ), { color: 0xc8261c, rough: 0.35 } ) );
	parts.push( prepare( sphere( 0.028, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2 ), { color: 0xeeeae0, rough: 0.35 } ) );
	parts.push( prepare( cylinder( 0.004, 0.004, 0.07, 6 ), { color: 0xd9d4c8, rough: 0.5, matrix: mat4( 0, 0.055, 0 ) } ) );
	parts.push( prepare( cylinder( 0.0035, 0.0045, 0.03, 6 ), { color: 0xffd400, rough: 0.4, matrix: mat4( 0, 0.1, 0 ) } ) );
	return mergePrepared( parts );

}

export function buildLineGeometry( n ) {

	const pos = new Float32Array( ( n + 1 ) * 2 * 3 );
	const line = new Float32Array( ( n + 1 ) * 2 * 2 );
	const idx = [];
	for ( let i = 0; i <= n; i ++ ) {

		for ( let s = 0; s < 2; s ++ ) {

			const j = i * 2 + s;
			line[ j * 2 ] = i / n;
			line[ j * 2 + 1 ] = s ? 1 : - 1;

		}

		if ( i < n ) {

			const a = i * 2;
			idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aLine', new Float32BufferAttribute( line, 2 ) );
	g.setIndex( idx );
	return g;

}
