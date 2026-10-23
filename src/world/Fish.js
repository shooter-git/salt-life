import * as THREE from '../engine/index.js';
import { mulberry32 } from '../util/Noise.js';
import { KindBatch } from './reef/KindBatch.js';
import { WORLD } from './WorldLayout.js';
import { SPECIES } from './fish/FishSpecies.js';
import { createSwimMaterial } from './fish/FishMaterial.js';
import { bandFade } from '../materials/LODFade.js';

// Fish and other swimmers of the reef and the bay, simulated on the CPU and drawn in a single
// batch (reef/KindBatch.js: one instanced draw per model and level of detail in view) with the
// procedural fish models (fish/FishGeometry.js, fish/CreatureGeometry.js) and material
// (fish/FishMaterial.js).
//
// Habitats and behaviours:
//  - reef, by depth band: damselfish and wrasses on the shallow flats, grunts milling at coral
//    heads, chromis hovering above them, parrotfish and tangs foraging, angelfish pairs,
//    yellowtail schools, groupers lurking by big heads, barracuda hanging in mid water;
//  - drop-off: bar jack patrols (they hunt the bait ball), an eagle ray flapping along the slope;
//    a bait ball of silversides in mid water that cruises as a polarized school and balls up,
//    milling, when jacks or the swimmer come close (and parts around them);
//  - sand: southern stingrays gliding low (and resting), a green turtle that surfaces to breathe;
//  - bay: tarpon cruising in the deeper water (after dark, under the pier's lamps), needlefish just under the surface, mullet schools
//    near the shore (one now and then leaps out with a splash), snappers and grunts around the
//    pier piles, schools of fry in the shallows just outside the breakers.
// Everything scatters from the swimmer (also from someone wading in the shallows), stays in the
// water (terrain and reef height field, surface, out of the surf zone) and is only simulated
// near the camera. Each fish writes its own motion (position change and swimming wave) into the
// motion vectors.
//
// (Salt Life) For the speargun (game/Speargun.js), and the spearfisher's fish with it: hogfish
// rooting on the sand, black groupers and lionfish at the coral heads, mutton snappers along the
// reef's edges, red snappers over the deep holes, mahi-mahi and blackfin tuna in the blue water off
// the bay. A diver who comes slowly gets close; one who sprints, or shoots, spooks them, and a spooked
// fish stays wary a while (groupers tuck in at their coral head). Jacks, barracuda and mahi come to
// look at a diver who keeps still. A speared fish leaves its school: the speargun holds it on the
// shaft (hold), and once it's landed it's gone (take) until its kind fills the place again, out of
// sight, a few minutes later.

const TAU = Math.PI * 2;
const CEILING = - 0.7; // reef fish stay below this (m)
const FLOOR_CLEARANCE = 0.18; // minimum above the reef / seabed (m)
// (Salt Life) per tier: the draw distance (m; Tidewater's was 45, Salt Life's underwater fog ends
// at 28), the share of the big schools' fish (20 or more), the level-of-detail switches' scale (more
// pixels: coarser sooner), cross-fades, lite shading
const TIER = {
	low: { range: 20, schools: 0.35, lodPx: 1.6, fades: false, lite: true },
	mid: { range: 26, schools: 0.6, lodPx: 1.2, fades: true, lite: false },
	high: { range: 32, schools: 1, lodPx: 1, fades: true, lite: false },
};
const SIM_RANGE = 65; // groups further than this from the camera are frozen (m)
// (Salt Life) a landed fish's place is filled again after this long (s), out of sight
const REFILL = [ 240, 420 ];
// how far fish notice the diver (their flee distance), by the diver's speed (m/s): a slow approach
// gets close, a sprint scatters them
const WARY = [ [ 0.3, 0.5 ], [ 1.5, 1 ], [ 2.5, 1.55 ] ];
const SPOOKED = 25; // s a fish stays warier after a fright (a sprint at it, a shot)
const GRAVITY = 9.81;
const LOD_PX0 = [ 320, 80, 22 ]; // screen length (px) below which the next level of detail takes over
const LOD_BAND = 1.15; // cross-fade band above each switch (screen length ratio)

// Behaviour per kind of swimmer. model: anatomy (FishSpecies.js) or 'stingray' / 'eagleRay' /
// 'turtle'; length range (m); mode (see stepGroup); speeds in body lengths / s (cruise, max,
// burst when fleeing), steering accel, boids (separation distance and neighbour radius in body
// lengths, weights); depth: preferred height above the bottom (fraction of the local water
// column above it: 0 on the bottom .. 1 at the ceiling); band: water depth range of the homes;
// flee: reaction distance (m); amp / freq: tail beat amplitude and frequency (Hz at rest, per
// body length / s). (Salt Life) fish: the catch table's species (game/FishTable.js), or label: what
// it is when it's not one; curious: how close (m) it comes to look at a diver keeping still.
const base = {
	cruise: 1, max: 2.5, burst: 6, accel: 4, sep: 2, nbr: 5, wSep: 5, wAli: 1, wCoh: 0.8, wGoal: 1, flee: 3.5,
	depth: [ 0.1, 0.5 ], homeRadius: 6, amp: 0.08, freq: [ 1.6, 0.9 ], ceiling: CEILING, minDepth: 1.2, band: [ 1.5, 20 ],
};
const BEHAVIOUR = {
	bait: { model: 'silverside', fish: 'silverside', length: [ 0.06, 0.09 ], mode: 'bait', cruise: 1.8, max: 4, burst: 10, accel: 7, flee: 3, depth: [ 0.35, 0.75 ], amp: 0.1, freq: [ 3, 1.1 ] },
	silverside: { model: 'silverside', fish: 'silverside', length: [ 0.06, 0.09 ], mode: 'school', cruise: 1.6, max: 3.5, burst: 9, accel: 6, sep: 1.8, nbr: 7, wSep: 7, wAli: 2.6, wCoh: 1.4, wGoal: 0.7, flee: 4.5, depth: [ 0.35, 0.8 ], homeRadius: 18, amp: 0.1, freq: [ 3, 1.1 ], band: [ 4, 20 ] },
	chromis: { model: 'chromis', fish: 'chromis', length: [ 0.08, 0.11 ], mode: 'hover', cruise: 0.8, max: 2.5, burst: 7, accel: 5, sep: 2.2, nbr: 6, wAli: 0.5, wCoh: 0.5, flee: 3.0, depth: [ 0.12, 0.45 ], homeRadius: 3, freq: [ 2.5, 0.9 ], amp: 0.1, band: [ 4, 16 ] },
	grunt: { model: 'grunt', fish: 'grunt', length: [ 0.16, 0.26 ], mode: 'mill', cruise: 0.45, max: 1.8, burst: 7, accel: 3, sep: 1.6, nbr: 4, wAli: 1.8, wCoh: 1.0, wGoal: 0.9, depth: [ 0.04, 0.2 ], homeRadius: 1.5, band: [ 2.5, 10 ] },
	yellowtail: { model: 'yellowtail', fish: 'yellowtail', length: [ 0.26, 0.42 ], mode: 'school', cruise: 0.8, max: 2.2, burst: 10, accel: 3, sep: 1.8, wAli: 1.6, wGoal: 0.7, flee: 5, depth: [ 0.15, 0.5 ], homeRadius: 16, freq: [ 1.5, 0.9 ], band: [ 3, 14 ] },
	tang: { model: 'tang', fish: 'tang', length: [ 0.15, 0.24 ], mode: 'forage', cruise: 0.7, max: 2, burst: 5, accel: 3, sep: 1.8, wAli: 1.0, wCoh: 0.7, wGoal: 0.9, flee: 4, depth: [ 0.03, 0.2 ], homeRadius: 14, amp: 0.07, band: [ 2, 9 ] },
	sergeant: { model: 'sergeant', fish: 'sergeant', length: [ 0.12, 0.17 ], mode: 'hover', cruise: 0.6, max: 2, burst: 6, accel: 4, wAli: 0.6, wCoh: 0.6, flee: 3.2, depth: [ 0.08, 0.3 ], homeRadius: 2, amp: 0.09, freq: [ 2, 0.9 ], band: [ 1.5, 6 ] },
	wrasse: { model: 'wrasse', label: 'Bluehead wrasse', length: [ 0.07, 0.12 ], mode: 'forage', cruise: 1.3, max: 3, burst: 7, accel: 6, wAli: 0.5, wCoh: 0.6, wGoal: 1.2, flee: 2.5, depth: [ 0.02, 0.1 ], homeRadius: 5, amp: 0.1, freq: [ 2.5, 1.0 ], band: [ 1.5, 9 ] },
	parrot: { model: 'parrot', fish: 'parrot', length: [ 0.3, 0.45 ], mode: 'forage', cruise: 0.55, max: 1.6, burst: 4, accel: 2, sep: 2.2, nbr: 6, wSep: 4, wAli: 0.6, wCoh: 0.5, flee: 4.5, depth: [ 0.02, 0.1 ], homeRadius: 18, amp: 0.05, freq: [ 1.0, 0.6 ], band: [ 2, 12 ] },
	angel: { model: 'angel', fish: 'angel', length: [ 0.25, 0.35 ], mode: 'pair', cruise: 0.45, max: 1.4, burst: 3.5, accel: 2, sep: 1.5, nbr: 4, wSep: 3, wAli: 0.8, wCoh: 1.2, depth: [ 0.04, 0.15 ], homeRadius: 3, amp: 0.05, freq: [ 1.0, 0.6 ], band: [ 5, 16 ] },
	grouper: { model: 'grouper', fish: 'grouper', length: [ 0.6, 0.85 ], mode: 'lurk', cruise: 0.15, max: 1.2, burst: 5, accel: 1.5, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 3, depth: [ 0.0, 0.05 ], homeRadius: 2.5, amp: 0.04, freq: [ 0.6, 0.6 ], band: [ 5, 16 ] },
	barracuda: { model: 'barracuda', fish: 'barracuda', length: [ 1.0, 1.35 ], mode: 'solo', curious: 4, cruise: 0.15, max: 1.2, burst: 6, accel: 1.2, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.6, depth: [ 0.3, 0.6 ], homeRadius: 10, amp: 0.035, freq: [ 0.5, 0.8 ], band: [ 4, 16 ] },
	jack: { model: 'jack', fish: 'jack', length: [ 0.45, 0.8 ], mode: 'patrol', curious: 3.5, cruise: 1.1, max: 2.6, burst: 8, accel: 3, sep: 2, nbr: 5, wAli: 1.4, wCoh: 0.9, wGoal: 0.9, flee: 4, depth: [ 0.25, 0.6 ], homeRadius: 20, amp: 0.07, freq: [ 1.6, 0.8 ], band: [ 6, 20 ] },
	eagleRay: { model: 'eagleRay', label: 'Spotted eagle ray', length: [ 1.6, 2.0 ], mode: 'cruise', cruise: 0.35, max: 0.9, burst: 1.8, accel: 0.8, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 5, depth: [ 0.25, 0.55 ], homeRadius: 30, amp: 0.13, freq: [ 0.45, 0.2 ], band: [ 6, 20 ] },
	stingray: { model: 'stingray', label: 'Southern stingray', length: [ 0.9, 1.3 ], mode: 'glide', cruise: 0.3, max: 0.8, burst: 1.6, accel: 0.8, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 3.5, depth: [ 0, 0 ], homeRadius: 14, amp: 0.05, freq: [ 0.9, 0.5 ], band: [ 2.5, 16 ] },
	turtle: { model: 'turtle', label: 'Green sea turtle', length: [ 0.9, 1.1 ], mode: 'turtle', cruise: 0.3, max: 0.8, burst: 1.4, accel: 0.6, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.7, flee: 4, depth: [ 0.15, 0.6 ], homeRadius: 25, amp: 0, freq: [ 0.3, 0.25 ], ceiling: - 0.25, band: [ 3, 12 ] },
	// bay
	tarpon: { model: 'tarpon', fish: 'tarpon', length: [ 1.3, 1.8 ], mode: 'cruise', cruise: 0.3, max: 1.2, burst: 3, accel: 1, sep: 1.5, nbr: 3, wSep: 2, wAli: 0.8, wCoh: 0.5, wGoal: 0.7, flee: 5, depth: [ 0.3, 0.7 ], homeRadius: 25, amp: 0.04, freq: [ 0.5, 0.7 ], band: [ 4, 14 ] },
	needlefish: { model: 'needlefish', fish: 'needlefish', length: [ 0.5, 0.8 ], mode: 'surface', cruise: 0.9, max: 2.5, burst: 6, accel: 3, sep: 3, nbr: 4, wSep: 3, wAli: 1, wCoh: 0.5, wGoal: 0.9, flee: 4, homeRadius: 25, amp: 0.05, freq: [ 1.2, 0.7 ], ceiling: - 0.12, minDepth: 1.0, band: [ 1.8, 12 ] },
	mullet: { model: 'mullet', fish: 'mullet', length: [ 0.3, 0.4 ], mode: 'jumper', cruise: 0.8, max: 2.2, burst: 5, accel: 3, sep: 1.8, nbr: 5, wAli: 1.5, wCoh: 1, wGoal: 0.8, flee: 4, depth: [ 0.3, 0.9 ], homeRadius: 14, amp: 0.07, freq: [ 1.5, 0.9 ], ceiling: - 0.25, minDepth: 1.2, band: [ 1.8, 4.5 ] },
	fry: { model: 'silverside', label: 'Silverside fry', length: [ 0.045, 0.065 ], mode: 'fry', cruise: 2, max: 4, burst: 14, accel: 9, sep: 1.6, nbr: 8, wSep: 7, wAli: 2.4, wCoh: 1.6, wGoal: 0.9, flee: 3.2, depth: [ 0.3, 0.8 ], homeRadius: 6, amp: 0.11, freq: [ 3.5, 1.2 ], ceiling: - 0.2, minDepth: 0.5, band: [ 0.5, 3.5 ] },
	pierGrunt: { model: 'grunt', fish: 'grunt', length: [ 0.16, 0.26 ], mode: 'pile', cruise: 0.45, max: 1.8, burst: 7, accel: 3, sep: 1.6, nbr: 4, wAli: 1.4, wCoh: 0.9, depth: [ 0.1, 0.5 ], homeRadius: 1.6, band: [ 2, 6 ] },
	pierSnapper: { model: 'yellowtail', fish: 'yellowtail', length: [ 0.26, 0.4 ], mode: 'pile', cruise: 0.6, max: 2.2, burst: 8, accel: 3, sep: 1.8, wAli: 1.4, wCoh: 0.8, flee: 4.5, depth: [ 0.3, 0.8 ], homeRadius: 2.5, freq: [ 1.5, 0.9 ], band: [ 2, 6 ] },
	// escort of the humpback (setWhale): pilot fish / small jacks around its head and flippers,
	// juveniles near the head, remoras holding on to its belly and flanks
	pilot: { model: 'jack', label: 'Pilot jack', length: [ 0.25, 0.4 ], mode: 'escort', cruise: 1.2, max: 3.5, burst: 7, accel: 5, flee: 2, amp: 0.07, freq: [ 1.8, 0.9 ], ceiling: - 0.3, minDepth: 2, band: [ 0, 1e9 ] },
	juvenile: { model: 'jack', label: 'Young jack', length: [ 0.1, 0.16 ], mode: 'escort', cruise: 1.5, max: 4, burst: 9, accel: 7, flee: 1.5, amp: 0.1, freq: [ 2.5, 1 ], ceiling: - 0.3, minDepth: 2, band: [ 0, 1e9 ] },
	remora: { model: 'mullet', label: 'Remora', length: [ 0.35, 0.55 ], mode: 'remora', cruise: 0.5, max: 3, burst: 3, accel: 3, flee: 0, amp: 0.03, freq: [ 0.8, 0.3 ], ceiling: 5, minDepth: 0, band: [ 0, 1e9 ] },
	pierSergeant: { model: 'sergeant', fish: 'sergeant', length: [ 0.12, 0.17 ], mode: 'pile', cruise: 0.6, max: 2, burst: 6, accel: 4, wAli: 0.6, wCoh: 0.6, flee: 3.2, depth: [ 0.3, 0.9 ], homeRadius: 1.2, amp: 0.09, freq: [ 2, 0.9 ], band: [ 2, 6 ] },
	// (Salt Life) the spearfisher's fish. Hogfish root along the sand at the reef's foot, alone or a
	// male with his harem; black groupers hold to the deeper coral heads; lionfish hang over the coral,
	// hardly moving and hardly afraid; mutton snappers cruise the reef's edges, the warier fish;
	// red snappers mill over the deep holes; mahi and blackfin tuna roam the blue water off the bay
	hogfish: { model: 'hogfish', fish: 'wrasse', length: [ 0.32, 0.62 ], mode: 'forage', cruise: 0.45, max: 1.6, burst: 9, accel: 2.5, sep: 2, nbr: 5, wAli: 0.4, wCoh: 0.4, wGoal: 1.1, flee: 4, depth: [ 0.0, 0.05 ], homeRadius: 12, amp: 0.06, freq: [ 1.1, 0.7 ], band: [ 3, 16 ] },
	blackGrouper: { model: 'blackGrouper', fish: 'blackGrouper', length: [ 0.55, 1.15 ], mode: 'lurk', cruise: 0.15, max: 1.2, burst: 6, accel: 1.5, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 4, depth: [ 0.0, 0.06 ], homeRadius: 3, amp: 0.04, freq: [ 0.6, 0.6 ], band: [ 7, 20 ] },
	lionfish: { model: 'lionfish', fish: 'lionfish', length: [ 0.18, 0.38 ], mode: 'hover', cruise: 0.2, max: 0.8, burst: 2, accel: 2, sep: 3, nbr: 4, wAli: 0.2, wCoh: 0.2, flee: 0.9, depth: [ 0.04, 0.2 ], homeRadius: 1.2, amp: 0.03, freq: [ 0.8, 0.5 ], band: [ 3, 22 ] },
	muttonSnapper: { model: 'muttonSnapper', fish: 'muttonSnapper', length: [ 0.38, 0.72 ], mode: 'forage', cruise: 0.6, max: 1.8, burst: 9, accel: 2.5, sep: 2.2, nbr: 6, wAli: 0.8, wCoh: 0.6, wGoal: 1, flee: 5.5, depth: [ 0.04, 0.2 ], homeRadius: 16, amp: 0.06, freq: [ 1.2, 0.8 ], band: [ 4, 20 ] },
	redSnapper: { model: 'redSnapper', fish: 'redSnapper', length: [ 0.4, 0.78 ], mode: 'mill', cruise: 0.5, max: 1.8, burst: 9, accel: 2.5, sep: 1.8, nbr: 5, wAli: 1.2, wCoh: 0.9, wGoal: 0.9, flee: 5, depth: [ 0.05, 0.3 ], homeRadius: 4, amp: 0.06, freq: [ 1.2, 0.8 ], band: [ 15, 32 ] },
	mahi: { model: 'mahi', fish: 'mahi', length: [ 0.7, 1.25 ], mode: 'cruise', curious: 4, cruise: 1.0, max: 3, burst: 8, accel: 3, sep: 2.5, nbr: 5, wSep: 3, wAli: 1.2, wCoh: 0.6, wGoal: 0.8, flee: 6, depth: [ 0.75, 0.95 ], homeRadius: 45, amp: 0.06, freq: [ 1.2, 0.7 ], ceiling: - 0.5, band: [ 16, 1e9 ] },
	tuna: { model: 'tuna', fish: 'tuna', length: [ 0.5, 0.85 ], mode: 'cruise', cruise: 1.4, max: 3.5, burst: 9, accel: 4, sep: 2, nbr: 6, wAli: 2, wCoh: 1.2, wGoal: 0.8, flee: 7, depth: [ 0.45, 0.85 ], homeRadius: 45, amp: 0.05, freq: [ 1.6, 0.8 ], band: [ 16, 1e9 ] },
};
for ( const k in BEHAVIOUR ) BEHAVIOUR[ k ] = { name: k, ...base, ...BEHAVIOUR[ k ] };

class Group {

	constructor( sp, count, offset, zone, rng ) {

		this.sp = sp;
		this.count = count;
		this.offset = offset; // first fish index
		this.zone = zone; // { x, z, r, band: [ min, max ] water depth, path?, piles? }
		this.home = new THREE.Vector3( zone.x, 0, zone.z );
		this.goal = this.home.clone();
		this.center = this.home.clone();
		this.heading = new THREE.Vector3( 1, 0, 0 );
		this.timer = 0;
		this.alarm = 0;
		this.spin = rng() < 0.5 ? 1 : - 1;
		this.rng = rng;
		this.active = false;
		this.radius = 4; // bounding radius of the group (m), updated while simulated
		this.ball = 0; // bait: 0 cruising school .. 1 milling ball
		this.rest = 0; // stingray: resting time left
		this.breath = 30 + rng() * 40; // turtle: time to the next breath
		this.jumpTimer = 3 + rng() * 6; // mullet: time to the next leap
		this.spooked = 0; // (Salt Life) s left of a fright's wariness
		this.pathIndex = 0;
		this.pathDir = 1;

	}

}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _threat = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _sphere = new THREE.Sphere(), _m = new THREE.Matrix4();

export class FishSchools {

	// floorAt( x, z ): highest obstacle (seabed or reef); anchors: [ [ x, z ], ... ] coral heads;
	// bay: also populate the bay, the pier and the beach; shoreField (optional, ShoreField.js)
	// locates the breakers (without it every beach counts as fully exposed)
	// (Salt Life) ground: the Terrain (the shared underwater shading); tier
	constructor( { parent, terrain, ground, floorAt = null, center, radius, anchors = [], seed = 23, bay = true, shoreField = null, tier = 'high' } ) {

		this.cfg = TIER[ tier ] || TIER.high;
		this.terrain = terrain;
		this.floorAt = floorAt ?? ( ( x, z ) => terrain.heightAt( x, z ) );
		this.center = center.clone();
		this.radius = radius;
		this.anchors = anchors.length ? anchors : [ [ center.x, center.z ] ];
		this.shoreField = shoreField;
		this.rng = mulberry32( seed );
		this.time = 0;
		this.spray = null; // set by the owner (Spray.js): splashes of leaping mullet
		this.lit = 0; // (Salt Life) the pier's lamps, 0..1 (the app sets it: Bites.lampsLit)
		this.ground = ground;
		this.group = new THREE.Group();
		this.group.name = 'Fish';
		parent.add( this.group );

		// ---- groups
		this.groups = [];
		this.n = 0;
		this.layout( bay );

		// ---- models: their names (built apart: setModels, fish/FishModels.js), the first kind of each
		this.modelNames = [ ...new Set( this.groups.map( ( g ) => g.sp.model ) ) ];
		this.modelKind = {};
		this.modelNames.forEach( ( name, i ) => this.modelKind[ name ] = i * 4 );

		// ---- fish state
		const n = this.n;
		this.pos = new Float32Array( n * 3 );
		this.vel = new Float32Array( n * 3 );
		this.head = new Float32Array( n * 3 );
		this.roll = new Float32Array( n );
		this.bend = new Float32Array( n );
		this.phase = new Float32Array( n );
		this.size = new Float32Array( n );
		this.speedMul = new Float32Array( n );
		this.panic = new Float32Array( n );
		this.seed = new Float32Array( n );
		this.kind = new Uint16Array( n );
		this.pattern = new Uint8Array( n );
		this.slot = new Float32Array( n * 4 ); // bait: formation slot (unit direction, radius); pile: pile index
		this.jump = new Float32Array( n ); // mullet: 0 swimming, 1 rising to the surface, 2 in the air
		this.floorC = new Float32Array( n ).fill( - 1000 ); // cached bottom under / ahead of each fish
		this.shallowC = new Uint8Array( n ); // cached: shallow water or breakers ahead
		this.prev = new Float32Array( n * 3 ); // positions in the previous frame (motion vectors)
		this.tmpA = new Float32Array( n * 9 ); // boids accumulators: separation, alignment, cohesion
		this.tmpC = new Uint16Array( n ); // neighbour counts
		// (Salt Life) the speargun's: 0 swimming, 1 on the shaft (hold), 2 landed (take: gone until its
		// place is filled, refillAt); each fish's group; the bodies as ellipsoids (per model, for the
		// shaft); the diver's speed and how long they've kept still; how far fish notice them (WARY)
		this.held = new Uint8Array( n );
		this.refillAt = new Float32Array( n );
		this.groupOf = new Array( n );
		this.taken = new Set();
		this.hitShapes = {};
		this.diver = { x: 0, y: 0, z: 0, speed: 0, still: 0, has: false };
		this.wary = 1;
		for ( const g of this.groups ) this.initGroup( g );
		this.batch = null; // (setModels)
		this.viewHeight = 1267; // (the app sets the canvas' height)
		this._frame = 0;
		this._cullFrame = - 1;
		this.dt = 1 / 60;
		this.warmUp();

	}

	// (Salt Life) the models of modelNames, merged (fish/FishModels.js: fishModels, or
	// fishModelsAsync in a worker), drawn as a KindBatch: a draw per model and level of detail in
	// use, the records (all the fish, written each frame for those drawn) in a float texture; a kind
	// lists each fish of its model at most once
	setModels( merged ) {

		const n = this.n;
		const cap = merged.kinds.map( () => 0 );
		for ( let i = 0; i < n; i ++ ) for ( let l = 0; l < 4; l ++ ) cap[ this.kind[ i ] + l ] ++;
		this.batch = new KindBatch( 'Fish', { geometry: merged, kinds: merged.kinds, count: n, stride: 4, capacity: cap } );
		this.material = createSwimMaterial( this.batch, { ground: this.ground, lite: this.cfg.lite } );
		this.batch.setMaterial( this.material );
		this.batch.releaseAfterUpload();
		for ( const m of this.batch.meshes ) this.group.add( m );

	}

	get fishCount() {

		return this.n;

	}

	// ------------------------------------------------------------------ layout

	depthAt( x, z ) {

		return - this.terrain.heightAt( x, z );

	}

	// Deepest water where waves of the default swell may break at x, z (m): 0 for sheltered water.
	breakDepth( x, z ) {

		let e = 1;
		const F = this.shoreField;
		if ( F ) {

			const i = Math.floor( ( x - F.origin ) / F.cellSize ), j = Math.floor( ( z - F.origin ) / F.cellSize );
			if ( i >= 0 && j >= 0 && i < F.res && j < F.res ) {

				const k = ( j * F.res + i ) * 4;
				e = Math.min( 1, Math.hypot( F.data[ k + 1 ], F.data[ k + 2 ] ) );

			}

		}

		// the larger waves of a set (ShoreWaves: offshore amplitude 0.42 m, sets up to ~1.6x)
		const A = 0.42 * 1.3 * e;
		return Math.pow( A * 3.556 / 0.78, 0.8 );

	}

	// water deep enough for the species, clear of the breakers and of the reef framework
	fits( sp, zone, x, z ) {

		const d = this.depthAt( x, z );
		if ( d < zone.band[ 0 ] || d > zone.band[ 1 ] ) return false;
		if ( d < this.breakDepth( x, z ) + 0.3 ) return false;
		const floor = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
		return - floor > sp.minDepth + 0.3;

	}

	addGroup( name, count, zone ) {

		// (Salt Life: fewer fish in the big schools on low-powered devices)
		if ( count >= 20 ) count = Math.max( 8, Math.round( count * this.cfg.schools ) );
		const sp = BEHAVIOUR[ name ];
		const g = new Group( sp, count, this.n, zone, mulberry32( Math.floor( this.rng() * 1e9 ) ) );
		this.n += count;
		this.groups.push( g );
		return g;

	}

	// Picks a spot in a zone: an anchor (coral head) in the species' depth band, or anywhere in
	// the zone circle; far from the other homes of the same kind.
	pickSpot( sp, zone, homes, anchored ) {

		const rng = this.rng;
		let best = null, bestScore = - Infinity;
		for ( let i = 0; i < 160; i ++ ) {

			let x, z;
			if ( anchored && zone.anchors && zone.anchors.length ) {

				const a = zone.anchors[ Math.floor( rng() * zone.anchors.length ) ];
				const t = rng() * TAU, r = rng() * 2;
				x = a[ 0 ] + Math.cos( t ) * r;
				z = a[ 1 ] + Math.sin( t ) * r;

			} else {

				const t = rng() * TAU, r = Math.sqrt( rng() ) * zone.r;
				x = zone.x + Math.cos( t ) * r;
				z = zone.z + Math.sin( t ) * r;

			}

			if ( ! this.fits( sp, zone, x, z ) ) continue;
			let score = rng();
			for ( const o of homes ) {

				const d = Math.hypot( o[ 0 ] - x, o[ 1 ] - z );
				if ( d < 10 ) score -= ( 10 - d ) * 0.3;

			}

			if ( score > bestScore ) {

				bestScore = score;
				best = [ x, z ];

			}

		}

		return best;

	}

	layout( bay ) {

		const reef = { x: this.center.x, z: this.center.z, r: this.radius * 0.75, anchors: this.anchors };
		const homes = [];
		const place = ( name, count, zone, anchored = false ) => {

			const sp = BEHAVIOUR[ name ];
			const z = { ...zone, band: zone.band || sp.band };
			const spot = this.pickSpot( sp, z, homes, anchored );
			if ( ! spot ) return null;
			homes.push( spot );
			return this.addGroup( name, count, { ...z, x: spot[ 0 ], z: spot[ 1 ], r: Math.min( z.r, sp.homeRadius * 1.5 + 4 ) } );

		};

		// ---- reef, by depth band
		for ( const c of [ 14, 12, 10, 12 ] ) place( 'sergeant', c, reef, true );
		for ( const c of [ 26, 22, 20, 24, 18, 22 ] ) place( 'chromis', c, reef, true );
		for ( const c of [ 28, 22, 20, 16, 16 ] ) place( 'grunt', c, reef, true );
		for ( const c of [ 16, 12 ] ) place( 'yellowtail', c, reef );
		for ( const c of [ 18, 12 ] ) place( 'tang', c, reef );
		for ( const c of [ 16, 12, 12, 14 ] ) place( 'wrasse', c, reef );
		for ( const c of [ 4, 3, 3, 3 ] ) place( 'parrot', c, reef );
		for ( let i = 0; i < 3; i ++ ) place( 'angel', 2, reef, true );
		for ( let i = 0; i < 2; i ++ ) place( 'grouper', 1, reef, true );
		for ( let i = 0; i < 2; i ++ ) place( 'barracuda', 1, reef );
		for ( const c of [ 150, 120 ] ) place( 'silverside', c, reef );
		// (Salt Life) the spearfisher's fish of the reef
		for ( const c of [ 3, 2, 2, 1, 1 ] ) place( 'hogfish', c, { ...reef, r: this.radius, sand: true } );
		for ( let i = 0; i < 3; i ++ ) place( 'blackGrouper', 1, reef, true );
		for ( let i = 0; i < 8; i ++ ) place( 'lionfish', i % 3 ? 1 : 2, reef, true );
		for ( const c of [ 3, 2, 2 ] ) place( 'muttonSnapper', c, { ...reef, r: this.radius } );

		// ---- the drop-off: the reef's deep seaward slope
		const drop = this.dropOff();
		this.dropPath = drop;
		const mid = drop[ Math.floor( drop.length / 2 ) ] || [ reef.x, reef.z + reef.r ];
		const dropZone = { x: mid[ 0 ], z: mid[ 1 ], r: 30, path: drop };
		const ball = place( 'bait', 900, { ...dropZone, r: 14 } );
		this.baitGroups = ball ? [ ball ] : [];
		for ( const c of [ 9, 6 ] ) {

			const g = place( 'jack', c, dropZone );
			if ( g ) g.zone.path = drop;

		}

		place( 'blackGrouper', 1, { ...dropZone, r: 24 } );
		const eagle = place( 'eagleRay', 1, dropZone );
		if ( eagle ) eagle.zone.path = drop;
		for ( let i = 0; i < 2; i ++ ) place( 'stingray', 1, { ...reef, r: this.radius, band: [ 3, 12 ], sand: true } );
		place( 'turtle', 1, { ...reef, r: this.radius, band: [ 3, 10 ] } );

		if ( ! bay ) return;

		// ---- the bay (east of the reef, south of the beach)
		const bayZone = { x: 45, z: 70, r: 45 };
		const tarpon = place( 'tarpon', 3, { ...bayZone, band: [ 5, 14 ] } );
		// (Salt Life) after dark they gather under the pier's lamps (and bite there: Bites.pickSpecies)
		if ( tarpon ) {

			const n = { x: WORLD.pier.x, z: WORLD.pier.zEnd - 3, r: 12, band: [ 3, 14 ] };
			n.home = new THREE.Vector3( n.x, this.depthFor( tarpon.sp, n.x, n.z, 0.5 ), n.z );
			tarpon.night = n;

		}

		place( 'jack', 5, { x: WORLD.pier.x, z: WORLD.pier.zEnd, r: 20, band: [ 3, 10 ] } );
		place( 'stingray', 1, { ...bayZone, band: [ 3, 9 ], sand: true } );
		place( 'barracuda', 1, { x: WORLD.pier.x + 6, z: WORLD.pier.zEnd - 4, r: 8, band: [ 3, 8 ] } );
		for ( const c of [ 3, 2, 1 ] ) place( 'needlefish', c, { x: 30, z: 30, r: 60, band: [ 2, 12 ] } );
		for ( const c of [ 9, 7 ] ) place( 'mullet', c, { x: 20, z: 5, r: 70 } );
		// (Salt Life) red snappers over the deep holes in the bay and beyond its mouth; mahi and tuna in
		// the blue water off it (by boat)
		for ( const c of [ 6, 5 ] ) place( 'redSnapper', c, { x: 5, z: 165, r: 40 } );
		place( 'redSnapper', 6, { x: 0, z: 330, r: 80 } );
		for ( const c of [ 5, 4 ] ) place( 'mahi', c, { x: 0, z: 420, r: 90 } );
		place( 'tuna', 10, { x: - 40, z: 440, r: 90 } );

		// fry along the beach, just outside the breakers (or inside sheltered water)
		for ( const [ c, x ] of [ [ 90, - 60 ], [ 70, - 10 ], [ 80, 30 ], [ 60, 110 ], [ 70, 150 ] ] ) place( 'fry', c, { x, z: 0, r: 30 } );

		// snappers, grunts and sergeant majors around the pier piles (in water deep enough)
		const piles = [];
		const P = WORLD.pier;
		const off = P.width / 2 + 0.17;
		for ( let z = P.zStart + 1.5; z < P.zEnd - P.headDepth; z += 3 ) for ( const s of [ - 1, 1 ] ) piles.push( [ P.x + s * off, z ] );
		for ( let k = 0; k < 5; k ++ ) for ( const z of [ P.zEnd - P.headDepth + 0.25, P.zEnd - P.headDepth / 2, P.zEnd - 0.25 ] ) piles.push( [ P.x - P.headWidth / 2 + 0.3 + k * ( P.headWidth - 0.6 ) / 4, z ] );
		// the whale's escort, waiting until a whale is set (setWhale)
		this.escort = [ [ 'pilot', 12 ], [ 'juvenile', 6 ], [ 'remora', 4 ] ].map( ( [ name, c ] ) => this.addGroup( name, c, { x: 0, z: 200, r: 5, band: [ 0, 1e9 ] } ) );
		const wet = piles.filter( ( p ) => this.depthAt( p[ 0 ], p[ 1 ] ) > 2.2 );
		const pierZone = { x: P.x, z: P.zEnd - 8, r: 18, anchors: wet, piles: wet };
		for ( const [ name, c ] of [ [ 'pierGrunt', 14 ], [ 'pierSnapper', 10 ], [ 'pierSergeant', 12 ] ] ) {

			const g = place( name, c, pierZone, true );
			// the piles around its home
			if ( g ) g.zone.piles = wet.filter( ( p ) => Math.hypot( p[ 0 ] - g.home.x, p[ 1 ] - g.home.z ) < 5 );
			if ( g && ! g.zone.piles.length ) g.zone.piles = [ [ g.home.x, g.home.z ] ];

		}

	}

	// The humpback (world/marine/Whale.js): its escort follows the posed body.
	setWhale( whale ) {

		this.whale = whale;

	}

	// Points along the reef's seaward slope (10 - 15 m deep), ordered along it.
	dropOff() {

		const pts = [];
		const c = this.center;
		for ( let a = 0; a < 64; a ++ ) {

			const t = a / 64 * TAU;
			const dx = Math.cos( t ), dz = Math.sin( t );
			// walk outward from the reef centre to where the water gets 11 m deep
			for ( let r = 10; r < this.radius * 1.4; r += 2 ) {

				const x = c.x + dx * r, z = c.z + dz * r;
				const d = this.depthAt( x, z );
				if ( d >= 11 ) {

					if ( d < 18 ) pts.push( [ x, z, t ] );
					break;

				}

			}

		}

		// the longest run of consecutive angles
		pts.sort( ( a, b ) => a[ 2 ] - b[ 2 ] );
		return pts.map( ( p ) => [ p[ 0 ], p[ 1 ] ] );

	}

	initGroup( g ) {

		const sp = g.sp, rng = g.rng;
		const dir = rng() * TAU;
		g.heading.set( Math.cos( dir ), 0, Math.sin( dir ) );
		const spread = sp.mode === 'school' || sp.mode === 'fry' || sp.mode === 'jumper' ? 1.5 : sp.mode === 'bait' ? 3 : [ 'solo', 'lurk', 'glide', 'turtle', 'cruise' ].includes( sp.mode ) ? 0 : 1.2;
		g.home.y = this.depthFor( sp, g.home.x, g.home.z, 0.5 );
		g.goal.copy( g.home );
		g.center.copy( g.home );
		const kind0 = this.modelKind[ sp.model ];
		const pattern = SPECIES[ sp.model ].pattern;
		for ( let k = 0; k < g.count; k ++ ) {

			const i = g.offset + k;
			this.groupOf[ i ] = g;
			let x = g.home.x, z = g.home.z;
			for ( let t = 0; t < 10; t ++ ) {

				const tx = g.home.x + ( rng() - 0.5 ) * spread * 2, tz = g.home.z + ( rng() - 0.5 ) * spread * 2;
				if ( this.depthAt( tx, tz ) > sp.minDepth + 0.3 ) {

					x = tx;
					z = tz;
					break;

				}

			}

			const y = this.clampY( sp, x, z, g.home.y + ( rng() - 0.5 ) * spread * 0.5 );
			const L = sp.length[ 0 ] + ( sp.length[ 1 ] - sp.length[ 0 ] ) * rng();
			this.size[ i ] = L;
			this.pos.set( [ x, y, z ], i * 3 );
			this.prev.set( [ x, y, z ], i * 3 );
			const s = sp.cruise * L;
			const d = dir + ( rng() - 0.5 ) * 0.5;
			this.vel.set( [ Math.cos( d ) * s, 0, Math.sin( d ) * s ], i * 3 );
			this.head.set( [ Math.cos( d ), 0, Math.sin( d ) ], i * 3 );
			this.phase[ i ] = rng() * TAU;
			this.speedMul[ i ] = 0.85 + rng() * 0.3;
			this.seed[ i ] = rng();
			this.kind[ i ] = kind0;
			this.pattern[ i ] = pattern;
			// bait formation slot: random direction, radius biased outward (a hollow-ish ball)
			const u = rng() * 2 - 1, a = rng() * TAU, rr = Math.sqrt( 1 - u * u );
			this.slot.set( [ rr * Math.cos( a ), u, rr * Math.sin( a ), 0.45 + 0.55 * Math.cbrt( rng() ) ], i * 4 );
			if ( sp.mode === 'pile' && g.zone.piles ) this.slot[ i * 4 + 3 ] = Math.floor( rng() * g.zone.piles.length );

		}

		this.retarget( g, null );

	}

	// preferred swimming height at x, z: depth[ 0 .. 1 ] of the water column above the bottom
	depthFor( sp, x, z, k ) {

		const floor = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
		const ceil = sp.ceiling;
		if ( sp.mode === 'surface' ) return ceil - 0.08;
		if ( sp.mode === 'glide' ) return floor + FLOOR_CLEARANCE + 0.15;
		const f = sp.depth[ 0 ] + ( sp.depth[ 1 ] - sp.depth[ 0 ] ) * k;
		return Math.min( ceil - 0.2, floor + FLOOR_CLEARANCE + 0.1 + Math.max( 0, ceil - floor ) * f );

	}

	clampY( sp, x, z, y ) {

		const h = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
		return Math.min( sp.ceiling - 0.02, Math.max( h + FLOOR_CLEARANCE + 0.02, y ) );

	}

	// New goal for the group: wandering in its zone, along its path, or away from a threat.
	retarget( g, away ) {

		const sp = g.sp, rng = g.rng;
		// (Salt Life) a group with a place for the night (the tarpon: under the pier's lamps) goes there once they're lit
		const night = g.night && this.lit > 0.5 ? g.night : null;
		const zone = night || g.zone, home = night ? night.home : g.home;
		const hold = sp.mode === 'solo' || sp.mode === 'lurk' ? [ 12, 25 ] : sp.mode === 'forage' ? [ 3, 7 ] : sp.mode === 'surface' ? [ 10, 20 ] : [ 6, 12 ];
		if ( ! away && zone.path && zone.path.length > 1 && ( sp.mode === 'patrol' || sp.mode === 'cruise' ) ) {

			// next point along the drop-off, back and forth
			let i = g.pathIndex + g.pathDir * ( 2 + Math.floor( rng() * 3 ) );
			if ( i < 0 || i >= zone.path.length ) {

				g.pathDir = - g.pathDir;
				i = Math.max( 0, Math.min( zone.path.length - 1, g.pathIndex + g.pathDir * 2 ) );

			}

			g.pathIndex = i;
			const p = zone.path[ i ];
			g.goal.set( p[ 0 ], this.depthFor( sp, p[ 0 ], p[ 1 ], rng() ), p[ 1 ] );
			g.timer = hold[ 0 ] + ( hold[ 1 ] - hold[ 0 ] ) * rng();
			return;

		}

		for ( let k = 0; k < 24; k ++ ) {

			let x, z;
			if ( away && k < 16 ) {

				const a = Math.atan2( away.z, away.x ) + ( rng() - 0.5 ) * ( 0.6 + k * 0.15 );
				const d = 6 + rng() * 6;
				x = g.center.x + Math.cos( a ) * d;
				z = g.center.z + Math.sin( a ) * d;

			} else if ( sp.mode === 'surface' ) {

				// long straight runs
				const a = Math.atan2( g.heading.z, g.heading.x ) + ( rng() - 0.5 ) * 1.6;
				const d = 15 + rng() * 20;
				x = g.center.x + Math.cos( a ) * d;
				z = g.center.z + Math.sin( a ) * d;
				if ( Math.hypot( x - zone.x, z - zone.z ) > zone.r ) continue;

			} else {

				const a = rng() * TAU, r = Math.sqrt( rng() ) * ( night ? night.r : Math.max( sp.homeRadius, zone.r * 0.8 ) );
				x = home.x + Math.cos( a ) * r;
				z = home.z + Math.sin( a ) * r;

			}

			if ( ! this.fits( sp, zone, x, z ) ) continue;
			if ( zone.sand && this.floorAt( x, z ) > this.terrain.heightAt( x, z ) + 0.1 ) continue; // rays: over sand
			g.goal.set( x, this.depthFor( sp, x, z, rng() ), z );
			g.timer = hold[ 0 ] + ( hold[ 1 ] - hold[ 0 ] ) * rng();
			return;

		}

		g.goal.copy( home );
		g.timer = 4;

	}

	// Runs the steering branches once so the JIT doesn't hitch on the first encounter.
	warmUp() {

		const save = [ this.pos.slice(), this.vel.slice(), this.head.slice(), this.panic.slice(), this.jump.slice() ];
		const goals = this.groups.map( ( g ) => [ g.goal.clone(), g.timer, g.alarm, g.ball, g.rest, g.breath, g.jumpTimer ] );
		const probe = new THREE.Vector3();
		for ( let k = 0; k < 40; k ++ ) {

			for ( const g of this.groups ) {

				probe.copy( g.center );
				probe.x += 1.5;
				this.stepGroup( g, 1 / 60, k % 2 ? probe : null );

			}

		}

		this.pos.set( save[ 0 ] );
		this.prev.set( save[ 0 ] );
		this.vel.set( save[ 1 ] );
		this.head.set( save[ 2 ] );
		this.panic.set( save[ 3 ] );
		this.jump.set( save[ 4 ] );
		this.groups.forEach( ( g, i ) => {

			const s = goals[ i ];
			g.goal.copy( s[ 0 ] );
			[ , g.timer, g.alarm, g.ball, g.rest, g.breath, g.jumpTimer ] = s;
			g.center.copy( g.home );

		} );

	}

	// ------------------------------------------------------------------ simulation

	// player: the camera position. Fish flee from it underwater, and from the legs of someone
	// wading in the shallows.
	update( dt, player ) {

		this._frame ++;
		this.time += dt;
		this.dt = dt || 1 / 60;
		// (Salt Life: the whale's marks on the water come with the whale)
		if ( this.whale && this.whale.ready && this.whaleWater ) this.whaleWater.update( this.whale, dt, this.spray );
		let threat = null;
		// (Salt Life) the diver's speed (eased: the camera also moves as they turn and bob) and how
		// long they've kept still: how wary the fish are of them, and who comes to look
		const dv = this.diver;
		if ( player ) {

			if ( dv.has && dt > 0 ) {

				const v = Math.min( 6, Math.hypot( player.x - dv.x, player.y - dv.y, player.z - dv.z ) / dt );
				dv.speed += ( v - dv.speed ) * ( 1 - Math.exp( - dt * 4 ) );

			}

			dv.x = player.x;
			dv.y = player.y;
			dv.z = player.z;
			dv.has = true;
			dv.still = dv.speed < 0.35 ? dv.still + dt : 0;
			this.wary = wariness( dv.speed );

		}

		if ( this.taken.size ) this.refill( player );
		if ( player ) {

			if ( player.y < - 0.1 ) threat = player;
			else {

				const ground = this.terrain.heightAt( player.x, player.z );
				if ( ground < - 0.2 && player.y - ground < 2.4 ) threat = _threat.set( player.x, Math.max( ground + 0.3, Math.min( - 0.3, player.y - 1.3 ) ), player.z );

			}

		}

		let any = false;
		for ( const g of this.groups ) {

			const was = g.active;
			if ( g.sp.mode === 'escort' || g.sp.mode === 'remora' ) {

				const w = this.whale;
				g.active = !! ( w && w.ready ) && ( ! player || w.brain.position.distanceTo( player ) < SIM_RANGE + 20 );
				if ( g.active && ! was ) this.attachEscort( g );

			} else g.active = ! player || Math.hypot( g.center.x - player.x, g.center.z - player.z ) < SIM_RANGE + g.radius;
			if ( g.active && ! was ) this.resume( g );
			any = any || g.active;

		}

		if ( ! any ) {

			if ( this.batch ) this.batch.hide();
			return;

		}

		this.prev.set( this.pos );
		const steps = dt > 1 / 30 ? Math.min( 3, Math.ceil( dt * 30 ) ) : 1;
		const h = dt / steps;
		if ( dt > 0 ) for ( let k = 0; k < steps; k ++ ) for ( const g of this.groups ) if ( g.active ) this.stepGroup( g, h, threat );

	}

	// a group coming back into range after a pause: no motion blur from the jump in time
	resume( g ) {

		for ( let k = 0; k < g.count; k ++ ) {

			const i = ( g.offset + k ) * 3;
			this.prev[ i ] = this.pos[ i ];
			this.prev[ i + 1 ] = this.pos[ i + 1 ];
			this.prev[ i + 2 ] = this.pos[ i + 2 ];

		}

	}

	stepGroup( g, dt, player ) {

		const sp = g.sp;
		const n = g.count, o = g.offset;
		const P = this.pos, V = this.vel, A = this.tmpA, C = this.tmpC, Hd = this.held;
		// (Salt Life: of the fish still swimming: not one on a shaft or landed)
		let cx = 0, cy = 0, cz = 0, m = 0;
		for ( let k = 0; k < n; k ++ ) {

			if ( Hd[ o + k ] ) continue;
			const i = ( o + k ) * 3;
			cx += P[ i ];
			cy += P[ i + 1 ];
			cz += P[ i + 2 ];
			m ++;

		}

		g.timer -= dt;
		g.alarm = Math.max( 0, g.alarm - dt );
		g.spooked = Math.max( 0, g.spooked - dt );
		if ( ! m ) return;
		g.center.set( cx / m, cy / m, cz / m );
		let r2 = 0;
		for ( let k = 0; k < n; k += Math.max( 1, n >> 4 ) ) {

			if ( Hd[ o + k ] ) continue;
			const i = ( o + k ) * 3;
			r2 = Math.max( r2, ( P[ i ] - g.center.x ) ** 2 + ( P[ i + 1 ] - g.center.y ) ** 2 + ( P[ i + 2 ] - g.center.z ) ** 2 );

		}

		g.radius = Math.sqrt( r2 ) + 2;
		if ( sp.mode === 'bait' ) return this.stepBait( g, dt, player );
		if ( sp.mode === 'escort' || sp.mode === 'remora' ) {

			if ( this.whale && this.whale.ready && g.attached ) this.stepEscort( g, dt );
			return;

		}

		const gx = g.goal.x - g.center.x, gz = g.goal.z - g.center.z;
		const roams = sp.mode !== 'mill' && sp.mode !== 'hover' && sp.mode !== 'pile' && sp.mode !== 'lurk';
		if ( g.timer <= 0 || ( roams && gx * gx + gz * gz < 1.5 ) ) this.retarget( g, null );

		// jacks hunt the bait ball when it is near
		let hunt = null;
		if ( sp.mode === 'patrol' ) for ( const b of this.baitGroups ) {

			if ( b.active && Math.hypot( b.center.x - g.center.x, b.center.z - g.center.z ) < 30 ) hunt = b;

		}

		// turtle: up to the surface for a breath now and then
		if ( sp.mode === 'turtle' ) {

			g.breath -= dt;
			if ( g.breath < 0 && g.breath + dt >= 0 ) {

				g.goal.set( g.center.x + g.heading.x * 4, sp.ceiling, g.center.z + g.heading.z * 4 );
				g.timer = 14;

			}

			if ( g.breath < - 12 ) {

				g.breath = 40 + g.rng() * 50;
				this.retarget( g, null );

			}

		}

		// stingray: rests on the sand now and then
		if ( sp.mode === 'glide' ) {

			if ( g.rest > 0 ) g.rest -= dt;
			else if ( g.rng() < dt * 0.02 ) g.rest = 6 + g.rng() * 12;

		}

		// the diver. (Salt Life: noticed farther off the faster they come, and farther still by a fish
		// that's had a fright; a lurker tucks in at its coral head rather than leaving it)
		let px = 0, py = 0, pz = 0, near = false;
		const fleeR = sp.flee * this.wary * ( 1 + 0.8 * g.spooked / SPOOKED );
		if ( player ) {

			px = player.x;
			py = player.y;
			pz = player.z;
			const dx = g.center.x - px, dy = g.center.y - py, dz = g.center.z - pz;
			const d2 = dx * dx + dy * dy + dz * dz;
			const reach = fleeR * 1.3 + 0.5;
			near = d2 < ( reach + 24 + g.radius ) ** 2;
			if ( near && d2 < reach * reach && ( roams || sp.mode === 'lurk' ) && ( g.alarm <= 0 || ! roams ) ) {

				// (a diver who came at them fast: a fright they remember)
				if ( g.alarm <= 0 && this.diver.speed > 1 ) g.spooked = SPOOKED;
				g.alarm = 4;
				g.rest = 0;
				if ( roams ) this.retarget( g, { x: dx, z: dz } );

			}

		}

		// (Salt Life) a diver keeping still: the curious come to look, holding off a few metres
		if ( sp.curious && near && this.diver.still > 1.5 && g.alarm <= 0 && g.spooked <= 0 ) {

			const dx = g.center.x - px, dz = g.center.z - pz, dl = Math.hypot( dx, dz ) || 1;
			if ( dl < 24 ) {

				g.goal.set( px + dx / dl * sp.curious, Math.min( sp.ceiling - 0.3, py ), pz + dz / dl * sp.curious );
				g.timer = Math.max( g.timer, 2 );
				hunt = null;

			}

		}

		// neighbours (symmetric, within the group)
		const nbr2 = ( sp.nbr * sp.length[ 1 ] ) ** 2, sepR = sp.sep * sp.length[ 1 ], sep2 = sepR * sepR;
		const a0 = o * 9;
		A.fill( 0, a0, a0 + n * 9 );
		C.fill( 0, o, o + n );
		if ( n > 1 && ( sp.wAli > 0 || sp.wCoh > 0 || sp.wSep > 0 ) ) {

			const stride = n > 60 ? 7 : 1; // large schools: a strided subset of neighbours
			for ( let a = 0; a < n; a ++ ) {

				const i = o + a;
				if ( Hd[ i ] ) continue;
				const ix = P[ i * 3 ], iy = P[ i * 3 + 1 ], iz = P[ i * 3 + 2 ];
				for ( let b = a + 1; b < n; b += stride ) {

					const j = o + b;
					if ( Hd[ j ] ) continue;
					const dx = P[ j * 3 ] - ix, dy = P[ j * 3 + 1 ] - iy, dz = P[ j * 3 + 2 ] - iz;
					const d2 = dx * dx + dy * dy + dz * dz;
					if ( d2 > nbr2 ) continue;
					C[ i ] ++;
					C[ j ] ++;
					const ai = i * 9, aj = j * 9;
					A[ ai + 3 ] += V[ j * 3 ]; A[ ai + 4 ] += V[ j * 3 + 1 ]; A[ ai + 5 ] += V[ j * 3 + 2 ];
					A[ aj + 3 ] += V[ i * 3 ]; A[ aj + 4 ] += V[ i * 3 + 1 ]; A[ aj + 5 ] += V[ i * 3 + 2 ];
					A[ ai + 6 ] += dx; A[ ai + 7 ] += dy; A[ ai + 8 ] += dz;
					A[ aj + 6 ] -= dx; A[ aj + 7 ] -= dy; A[ aj + 8 ] -= dz;
					if ( d2 < sep2 ) {

						const d = Math.sqrt( d2 ) + 1e-4;
						const f = ( sepR - d ) / ( sepR * d );
						A[ ai ] -= dx * f; A[ ai + 1 ] -= dy * f; A[ ai + 2 ] -= dz * f;
						A[ aj ] += dx * f; A[ aj + 1 ] += dy * f; A[ aj + 2 ] += dz * f;

					}

				}

			}

		}

		const t = this.time;
		const flee2 = fleeR * fleeR;
		const piles = g.zone.piles;
		for ( let a = 0; a < n; a ++ ) {

			const i = o + a, i3 = i * 3, ai = i * 9;
			if ( Hd[ i ] ) continue;
			const L = this.size[ i ];
			let x = P[ i3 ], y = P[ i3 + 1 ], z = P[ i3 + 2 ];
			let vx = V[ i3 ], vy = V[ i3 + 1 ], vz = V[ i3 + 2 ];

			// a leaping mullet flies (and falls back) on its own
			if ( this.jump[ i ] > 1.5 ) {

				vy -= GRAVITY * dt;
				x += vx * dt;
				y += vy * dt;
				z += vz * dt;
				if ( y < - 0.05 && vy < 0 ) {

					this.jump[ i ] = 0;
					this.splash( x, z, vx, vz, L, 1.4 );
					vx *= 0.5;
					vz *= 0.5;
					vy *= 0.3;

				}

				P[ i3 ] = x; P[ i3 + 1 ] = y; P[ i3 + 2 ] = z;
				V[ i3 ] = vx; V[ i3 + 1 ] = vy; V[ i3 + 2 ] = vz;
				continue;

			}

			const cruise = sp.cruise * L * this.speedMul[ i ];
			let ax = A[ ai ] * sp.wSep, ay = A[ ai + 1 ] * sp.wSep, az = A[ ai + 2 ] * sp.wSep;
			const c = C[ i ];
			if ( c > 0 ) {

				const inv = 1 / c;
				ax += ( A[ ai + 3 ] * inv - vx ) * sp.wAli + A[ ai + 6 ] * inv * sp.wCoh;
				ay += ( A[ ai + 4 ] * inv - vy ) * sp.wAli + A[ ai + 7 ] * inv * sp.wCoh;
				az += ( A[ ai + 5 ] * inv - vz ) * sp.wAli + A[ ai + 8 ] * inv * sp.wCoh;

			}

			// goal per behaviour
			let tx = g.goal.x, ty = g.goal.y, tz = g.goal.z;
			let want = cruise;
			const s = this.seed[ i ];
			if ( sp.mode === 'mill' || sp.mode === 'pair' ) {

				// slow circling around the coral head
				const ang = t * ( sp.mode === 'pair' ? 0.25 : 0.12 ) * g.spin + s * 0.8;
				const r = sp.homeRadius * ( 0.5 + 0.5 * s );
				tx = g.home.x + Math.cos( ang ) * r;
				tz = g.home.z + Math.sin( ang ) * r;
				ty = g.home.y + ( s - 0.5 ) * 0.4;

			} else if ( sp.mode === 'hover' ) {

				// hold a spot above the coral head, darting now and then
				const ang = s * TAU + Math.sin( t * 0.3 + s * 9 ) * 0.4;
				const r = sp.homeRadius * Math.sqrt( s );
				tx = g.home.x + Math.cos( ang ) * r;
				tz = g.home.z + Math.sin( ang ) * r;
				ty = g.home.y + ( ( s * 7.3 ) % 1 - 0.5 ) * 0.8;
				want = cruise * ( 0.3 + 0.7 * Math.max( 0, Math.sin( t * 0.8 + s * 20 ) ) );

			} else if ( sp.mode === 'pile' && piles ) {

				// circling the pile it belongs to, at its own height
				const pl = piles[ this.slot[ i * 4 + 3 ] | 0 ] || piles[ 0 ];
				const ang = t * 0.2 * g.spin * ( 0.7 + s * 0.6 ) + s * TAU;
				const r = 0.5 + sp.homeRadius * ( 0.4 + 0.6 * s );
				tx = pl[ 0 ] + Math.cos( ang ) * r;
				tz = pl[ 1 ] + Math.sin( ang ) * r;
				const floor = this.terrain.heightAt( tx, tz );
				ty = floor + FLOOR_CLEARANCE + 0.3 + ( sp.ceiling - floor ) * ( sp.depth[ 0 ] + ( sp.depth[ 1 ] - sp.depth[ 0 ] ) * ( ( s * 5.7 ) % 1 ) );

			} else if ( sp.mode === 'lurk' && g.alarm > 0 ) {

				// (Salt Life) frightened: down to the foot of its coral head, and keeps still there
				tx = g.home.x;
				tz = g.home.z;
				ty = this.floorC[ i ] + FLOOR_CLEARANCE + L * 0.3;
				want = cruise * 4;

			} else if ( sp.mode === 'lurk' ) {

				// hangs by its coral head, turning slowly
				tx = g.home.x + Math.cos( t * 0.05 + s * 6 ) * sp.homeRadius;
				tz = g.home.z + Math.sin( t * 0.05 + s * 6 ) * sp.homeRadius;
				ty = g.home.y;
				want = cruise * 0.6;

			} else if ( hunt ) {

				// jacks: circle the bait ball, now and then a pass through it
				const ang = t * 0.35 * g.spin + s * TAU;
				const dash = Math.sin( t * 0.4 + s * 11 ) > 0.8;
				const r = dash ? 0.5 : 5 + 2 * s;
				tx = hunt.center.x + Math.cos( ang ) * r;
				tz = hunt.center.z + Math.sin( ang ) * r;
				ty = hunt.center.y + ( s - 0.5 ) * 2;
				want = cruise * ( dash ? 2.2 : 1.3 );

			} else if ( sp.mode === 'glide' && g.rest > 0 ) {

				// resting on the sand
				tx = x;
				tz = z;
				ty = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) ) + 0.04;
				want = 0;

			}

			let dx = tx - x, dy = ty - y, dz = tz - z;
			let dl = Math.sqrt( dx * dx + dy * dy + dz * dz ) + 1e-6;
			const arrive = Math.min( 1, dl / Math.max( 0.3, L * 4 ) );
			ax += ( dx / dl * want * arrive - vx ) * sp.wGoal;
			ay += ( dy / dl * want * arrive - vy ) * sp.wGoal;
			az += ( dz / dl * want * arrive - vz ) * sp.wGoal;

			// flee from the diver (horizontally for fish near the surface)
			let panic = Math.max( 0, this.panic[ i ] - dt * 0.5 );
			if ( near ) {

				dx = x - px;
				dy = y - py;
				dz = z - pz;
				const d2 = dx * dx + dy * dy + dz * dz;
				if ( d2 < flee2 ) {

					dl = Math.sqrt( d2 ) + 1e-4;
					const k = 1 - dl / fleeR;
					const f = ( k * k * 12 + k * 3 ) * sp.accel;
					ax += dx / dl * f;
					ay += dy / dl * f * 0.4;
					az += dz / dl * f;
					panic = Math.max( panic, Math.min( 1, k * 1.8 ) );
					g.rest = 0;

				}

			}

			this.panic[ i ] = panic;

			// bottom below (with look-ahead) and the surface above; the look-ups are refreshed every
			// fourth frame (staggered over the fish): fish move a few cm in between
			if ( ( ( this._frame + i ) & 3 ) === 0 || this.floorC[ i ] < - 999 ) {

				const lx = x + vx * 0.7, lz = z + vz * 0.7;
				this.floorC[ i ] = Math.max( this.floorAt( x, z ), this.floorAt( lx, lz ) );
				const deepAhead = - this.terrain.heightAt( lx, lz );
				this.shallowC[ i ] = deepAhead < sp.minDepth || deepAhead < this.breakDepthFast( lx, lz ) ? 1 : 0;

			}

			const clear = sp.mode === 'glide' ? 0.03 : FLOOR_CLEARANCE + L * 0.8;
			const floor = this.floorC[ i ] + clear;
			if ( y < floor ) ay += ( floor - y ) * 8;
			// shallow water ahead (or the breakers): turn back
			if ( this.shallowC[ i ] ) {

				ax -= vx * 3;
				az -= vz * 3;

			}

			const ceil = sp.ceiling;
			if ( y > ceil - 0.3 && ! ( sp.mode === 'jumper' && this.jump[ i ] > 0.5 ) ) ay -= ( y - ( ceil - 0.3 ) ) * 8;
			if ( sp.mode !== 'turtle' ) ay -= vy * 1.5; // fish prefer to swim level

			// mullet: rising to the surface for a leap
			if ( this.jump[ i ] > 0.5 ) {

				ay += 6;
				want = cruise * 2.5;

			}

			const amax = sp.accel * L * 4 * ( 1 + panic * 3 ) * ( this.jump[ i ] > 0.5 ? 3 : 1 );
			const al = Math.sqrt( ax * ax + ay * ay + az * az );
			if ( al > amax ) {

				const k = amax / al;
				ax *= k;
				ay *= k;
				az *= k;

			}

			vx += ax * dt;
			vy += ay * dt;
			vz += az * dt;
			const speed = Math.sqrt( vx * vx + vy * vy + vz * vz ) + 1e-6;
			const vmax = ( sp.max + ( sp.burst - sp.max ) * panic ) * L * ( this.jump[ i ] > 0.5 ? 2 : 1 );
			const vmin = sp.mode === 'hover' || sp.mode === 'solo' || sp.mode === 'mill' || sp.mode === 'lurk' || sp.mode === 'pile' || sp.mode === 'glide' ? 0.0 : cruise * 0.3;
			const sc = speed > vmax ? vmax / speed : ( speed < vmin ? vmin / speed : 1 );
			vx *= sc;
			vy *= sc;
			vz *= sc;
			if ( this.jump[ i ] < 0.5 ) {

				const hs = Math.sqrt( vx * vx + vz * vz );
				const vyMax = ( sp.mode === 'turtle' ? 0.3 : 0.15 ) + hs * 0.4;
				vy = Math.max( - vyMax, Math.min( vyMax, vy ) );

			}

			let nx = x + vx * dt, nz = z + vz * dt;
			if ( this.shallowC[ i ] && - this.terrain.heightAt( nx, nz ) < sp.minDepth ) {

				nx = x;
				nz = z;
				vx *= - 0.5;
				vz *= - 0.5;

			}

			const bottom = this.floorC[ i ] + ( sp.mode === 'glide' ? 0.02 : FLOOR_CLEARANCE );
			let ny = y + vy * dt;
			if ( this.jump[ i ] > 0.5 && ny > - 0.25 ) {

				// break the surface: fly
				this.jump[ i ] = 2;
				const hs = Math.sqrt( vx * vx + vz * vz ) + 1e-6;
				const k = ( 1.8 + g.rng() * 0.8 ) / hs;
				vx *= k;
				vz *= k;
				vy = 3 + g.rng() * 0.8;
				this.splash( nx, nz, vx, vz, L, 0.6 );

			} else if ( ny > ceil ) {

				ny = ceil;
				if ( vy > 0 ) vy = 0;

			}

			if ( ny < bottom ) {

				ny = bottom;
				if ( vy < 0 ) vy = 0;

			}

			P[ i3 ] = nx;
			P[ i3 + 1 ] = ny;
			P[ i3 + 2 ] = nz;
			V[ i3 ] = vx;
			V[ i3 + 1 ] = vy;
			V[ i3 + 2 ] = vz;

		}

		// mullet: now and then one of the school rises for a leap
		if ( sp.mode === 'jumper' ) {

			g.jumpTimer -= dt;
			if ( g.jumpTimer <= 0 ) {

				g.jumpTimer = 4 + g.rng() * 10;
				const i = o + Math.floor( g.rng() * n );
				if ( this.jump[ i ] === 0 && ! Hd[ i ] && this.pos[ i * 3 + 1 ] > - 2.5 ) this.jump[ i ] = 1;

			}

		}

		// the group's heading (for surface runs)
		const vx = g.goal.x - g.center.x, vz = g.goal.z - g.center.z, vl = Math.hypot( vx, vz );
		if ( vl > 0.5 ) g.heading.set( vx / vl, 0, vz / vl );

	}

	// break depth for the look-ahead, from a grid built on first use (the breakers are only near
	// the beaches)
	breakDepthFast( x, z ) {

		if ( z >= 40 || z <= - 64 ) return 0;
		if ( ! this.breakGrid ) {

			const g = this.breakGrid = new Float32Array( 256 * 52 );
			for ( let j = 0; j < 52; j ++ ) for ( let i = 0; i < 256; i ++ ) g[ j * 256 + i ] = this.breakDepth( - 256 + i * 2 + 1, - 64 + j * 2 + 1 );

		}

		const i = Math.floor( ( x + 256 ) * 0.5 ), j = Math.floor( ( z + 64 ) * 0.5 );
		return i < 0 || i > 255 ? 0 : this.breakGrid[ j * 256 + i ];

	}

	// Bait ball: every fish steers to its slot in a formation around the group centre, a stretched
	// ellipsoid along the heading while cruising and a milling ball when threatened; they part
	// around the diver and predators (fountain effect).
	stepBait( g, dt, player ) {

		const sp = g.sp;
		const n = g.count, o = g.offset;
		const P = this.pos, V = this.vel, S = this.slot;
		const rng = g.rng;
		// threats: the diver, hunting jacks
		let threatened = false;
		let tx = 0, ty = 0, tz = 0, td = Infinity;
		if ( player ) {

			const d = player.distanceTo( g.center );
			if ( d < 14 + g.radius ) {

				threatened = true;
				tx = player.x;
				ty = player.y;
				tz = player.z;
				td = d;

			}

		}

		for ( const h of this.groups ) {

			if ( h.sp.mode !== 'patrol' || ! h.active ) continue;
			const d = h.center.distanceTo( g.center );
			if ( d < 12 + g.radius ) threatened = true;

		}

		g.ball += ( ( threatened ? 1 : 0 ) - g.ball ) * Math.min( 1, dt * ( threatened ? 0.8 : 0.15 ) );
		if ( g.timer <= 0 || g.center.distanceTo( g.goal ) < 3 ) this.retarget( g, threatened && td < 8 ? { x: g.center.x - tx, z: g.center.z - tz } : null );

		// the centre drifts to the goal (slowly while balled)
		const L = sp.length[ 1 ];
		const speed = sp.cruise * L * ( 1 - 0.75 * g.ball ) * 3;
		_v.subVectors( g.goal, g.center );
		const dl = _v.length();
		if ( dl > 0.1 ) {

			_v.multiplyScalar( 1 / dl );
			g.heading.lerp( _v, Math.min( 1, dt * 0.5 ) ).normalize();

		}

		const cx = g.center.x + g.heading.x * speed * 1.5, cy = g.center.y + g.heading.y * speed, cz = g.center.z + g.heading.z * speed * 1.5;
		const Rb = 0.8 + Math.cbrt( n ) * 0.09; // ball radius (m)
		const hx = g.heading.x, hz = g.heading.z;
		const spin = this.time * 0.9 * g.spin;
		const cs = Math.cos( spin ), sn = Math.sin( spin );
		const kP = 2.5, kD = 2.2;
		const flee = sp.flee;
		// the bottom under the ball (highest of a few samples): one estimate for all its fish
		let ballFloor = - Infinity;
		for ( let k = 0; k < 5; k ++ ) {

			const a = k / 5 * TAU, r = k === 0 ? 0 : Rb * 2;
			ballFloor = Math.max( ballFloor, this.floorAt( cx + Math.cos( a ) * r, cz + Math.sin( a ) * r ) );

		}

		ballFloor += 0.6;
		for ( let a = 0; a < n; a ++ ) {

			const i = o + a, i3 = i * 3, i4 = i * 4;
			const sx = S[ i4 ], sy = S[ i4 + 1 ], sz = S[ i4 + 2 ], sr = S[ i4 + 3 ];
			// cruising: an ellipsoid 3 x longer along the heading
			const along = sx * 2.4, side = sz * 1.1, up = sy * 0.55;
			const cxs = cx + ( hx * along - hz * side ) * Rb, cys = cy + up * Rb, czs = cz + ( hz * along + hx * side ) * Rb;
			// balled: the slot orbits the vertical axis (milling)
			const bx = ( sx * cs - sz * sn ) * sr * Rb, bz = ( sx * sn + sz * cs ) * sr * Rb;
			const bxs = g.center.x + bx, bys = g.center.y + sy * sr * Rb * 0.8, bzs = g.center.z + bz;
			const w = g.ball;
			let tx2 = cxs + ( bxs - cxs ) * w, ty2 = cys + ( bys - cys ) * w, tz2 = czs + ( bzs - czs ) * w;
			// target velocity: along the heading while cruising, tangential while milling
			const mv = 0.9 * g.spin * sr * Rb;
			let vtx = hx * speed * ( 1 - w ) + ( - bz ) * mv * w / ( Rb + 1e-3 ), vty = 0, vtz = hz * speed * ( 1 - w ) + bx * mv * w / ( Rb + 1e-3 );
			const x = P[ i3 ], y = P[ i3 + 1 ], z = P[ i3 + 2 ];
			let vx = V[ i3 ], vy = V[ i3 + 1 ], vz = V[ i3 + 2 ];
			let panic = Math.max( 0, this.panic[ i ] - dt );
			if ( player ) {

				const dx = x - player.x, dy = y - player.y, dz = z - player.z;
				const d2 = dx * dx + dy * dy + dz * dz;
				if ( d2 < flee * flee ) {

					// part around the diver: the ball opens a hole around them and closes behind
					const d = Math.sqrt( d2 ) + 1e-3;
					const k = 1 - d / flee;
					tx2 += dx / d * k * 2.2;
					ty2 += dy / d * k * 1.2;
					tz2 += dz / d * k * 2.2;
					vtx += dx / d * k * sp.burst * L;
					vtz += dz / d * k * sp.burst * L;
					panic = Math.max( panic, k );

				}

			}

			this.panic[ i ] = panic;
			// keep off the bottom and below the surface
			ty2 = Math.min( sp.ceiling - 0.2, Math.max( ballFloor, ty2 ) );
			const ax = ( tx2 - x ) * kP + ( vtx - vx ) * kD + ( rng() - 0.5 ) * 0.6;
			const ay = ( ty2 - y ) * kP + ( vty - vy ) * kD;
			const az = ( tz2 - z ) * kP + ( vtz - vz ) * kD + ( rng() - 0.5 ) * 0.6;
			vx += ax * dt;
			vy += ay * dt;
			vz += az * dt;
			const vmax = ( sp.max + ( sp.burst - sp.max ) * panic ) * L;
			const vl = Math.sqrt( vx * vx + vy * vy + vz * vz );
			if ( vl > vmax ) {

				vx *= vmax / vl;
				vy *= vmax / vl;
				vz *= vmax / vl;

			}

			P[ i3 ] = x + vx * dt;
			P[ i3 + 1 ] = y + vy * dt;
			P[ i3 + 2 ] = z + vz * dt;
			V[ i3 ] = vx;
			V[ i3 + 1 ] = vy;
			V[ i3 + 2 ] = vz;

		}

	}

	// Escort slots in the whale's rest frame ( x, y, z, ahead ): pilot fish ahead of the head and out
	// beside the flippers, juveniles just in front of the snout, remoras on skin points of the belly
	// (ahead < 0: rigidly attached). Placed next to the whale when it first comes into range.
	attachEscort( g ) {

		const w = this.whale, rng = g.rng, S = this.slot;
		const L = w.zHead - w.manifest.notchZ;
		const restY = ( z ) => {

			const fi = Math.min( Math.max( ( w.zHead - z ) / w.dz, 0 ), w.rest.length - 1.001 );
			const i = Math.floor( fi ), t = fi - i;
			return w.rest[ i ].y + ( w.rest[ i + 1 ].y - w.rest[ i ].y ) * t;

		};

		let belly = null;
		if ( g.sp.mode === 'remora' ) {

			// skin points on the belly of the front half (lowest level of detail)
			const geo = w.meshes[ w.meshes.length - 1 ].geometry;
			const P = geo.attributes.position, N = geo.attributes.normal;
			belly = [];
			for ( let v = 0; v < P.count; v ++ ) {

				const z = P.getZ( v );
				if ( N.getY( v ) < - 0.75 && z < w.zHead - 0.18 * L && z > w.zHead - 0.6 * L ) belly.push( v );

			}

			g.skin = { P, N };

		}

		for ( let k = 0; k < g.count; k ++ ) {

			const i = ( g.offset + k ) * 4;
			const side = rng() < 0.5 ? - 1 : 1;
			if ( belly && belly.length ) {

				const v = belly[ Math.floor( rng() * belly.length ) ];
				const { P, N } = g.skin;
				S[ i ] = P.getX( v ) + N.getX( v ) * 0.12;
				S[ i + 1 ] = P.getY( v ) + N.getY( v ) * 0.12;
				S[ i + 2 ] = P.getZ( v ) + N.getZ( v ) * 0.12;
				S[ i + 3 ] = - 1;

			} else if ( g.sp.name === 'juvenile' ) {

				S[ i ] = side * ( 0.3 + rng() * 0.9 );
				S[ i + 1 ] = restY( w.zHead ) + ( rng() - 0.6 ) * 1.2;
				S[ i + 2 ] = w.zHead;
				S[ i + 3 ] = 0.6 + rng() * 1.2;

			} else if ( rng() < 0.55 ) {

				S[ i ] = side * ( 0.4 + rng() * 1.8 );
				S[ i + 1 ] = restY( w.zHead ) + ( rng() - 0.5 ) * 1.6;
				S[ i + 2 ] = w.zHead;
				S[ i + 3 ] = 1.2 + rng() * 2.8;

			} else {

				const z = w.zHead - L * ( 0.24 + rng() * 0.14 );
				S[ i ] = side * ( 4.6 + rng() * 2.2 );
				S[ i + 1 ] = restY( z ) + ( rng() - 0.5 ) * 1.4;
				S[ i + 2 ] = z;
				S[ i + 3 ] = 0;

			}

			// start at the slot
			this.escortTarget( i / 4, _v );
			this.pos.set( [ _v.x, _v.y, _v.z ], ( g.offset + k ) * 3 );
			this.prev.set( [ _v.x, _v.y, _v.z ], ( g.offset + k ) * 3 );
			this.vel.set( [ 0, 0, 0 ], ( g.offset + k ) * 3 );

		}

		g.ball = 0;
		g.attached = true;

	}

	// world position of escort fish i's slot on the posed whale
	escortTarget( i, out ) {

		const w = this.whale, S = this.slot;
		w.toWorld( _w.set( S[ i * 4 ], S[ i * 4 + 1 ], S[ i * 4 + 2 ] ), out );
		const ahead = S[ i * 4 + 3 ];
		if ( ahead > 0 ) out.add( _threat.set( 0, 0, ahead ).applyQuaternion( w.rot[ 0 ] ) );
		return out;

	}

	// Escort: pilot fish and juveniles keep station at their slots (and scatter while the whale
	// breaks the surface, re-forming as it goes back down); remoras ride their skin points.
	stepEscort( g, dt ) {

		const w = this.whale, b = w.brain;
		const P = this.pos, V = this.vel, S = this.slot;
		const n = g.count, o = g.offset;
		const surfacing = b.state === 'surface' && b.water - b.position.y < 3 ? 1 : 0;
		g.ball += ( surfacing - g.ball ) * Math.min( 1, dt * ( surfacing ? 1.5 : 0.3 ) );
		const sp = g.sp;
		for ( let a = 0; a < n; a ++ ) {

			const i = o + a, i3 = i * 3;
			this.escortTarget( i, _v );
			if ( S[ i * 4 + 3 ] < 0 ) {

				// holding on
				V[ i3 ] = ( _v.x - P[ i3 ] ) / Math.max( dt, 1e-3 );
				V[ i3 + 1 ] = ( _v.y - P[ i3 + 1 ] ) / Math.max( dt, 1e-3 );
				V[ i3 + 2 ] = ( _v.z - P[ i3 + 2 ] ) / Math.max( dt, 1e-3 );
				P[ i3 ] = _v.x;
				P[ i3 + 1 ] = _v.y;
				P[ i3 + 2 ] = _v.z;
				continue;

			}

			// scatter: out from the whale's axis and down
			if ( g.ball > 0.01 ) {

				w.toWorld( _w.set( 0, S[ i * 4 + 1 ], S[ i * 4 + 2 ] ), _threat );
				const dx = _v.x - _threat.x, dz = _v.z - _threat.z, dl = Math.hypot( dx, dz ) + 1e-3;
				const k = g.ball * ( 3 + 3 * this.seed[ i ] );
				_v.x += dx / dl * k;
				_v.z += dz / dl * k;
				_v.y -= g.ball * ( 1.5 + 2 * this.seed[ i ] );

			}

			_v.y = Math.min( _v.y, b.water - 0.45 );
			const L = this.size[ i ];
			let vx = V[ i3 ], vy = V[ i3 + 1 ], vz = V[ i3 + 2 ];
			// spring toward the slot, matching the whale's own velocity
			const kP = 1.8, kD = 1.6;
			vx += ( ( _v.x - P[ i3 ] ) * kP + ( b.velocity.x - vx ) * kD ) * dt;
			vy += ( ( _v.y - P[ i3 + 1 ] ) * kP + ( b.velocity.y - vy ) * kD ) * dt;
			vz += ( ( _v.z - P[ i3 + 2 ] ) * kP + ( b.velocity.z - vz ) * kD ) * dt;
			const vmax = sp.burst * L + b.velocity.length();
			const vl = Math.hypot( vx, vy, vz );
			if ( vl > vmax ) {

				vx *= vmax / vl;
				vy *= vmax / vl;
				vz *= vmax / vl;

			}

			P[ i3 ] += vx * dt;
			P[ i3 + 1 ] = Math.min( P[ i3 + 1 ] + vy * dt, b.water - 0.35 );
			P[ i3 + 2 ] += vz * dt;
			V[ i3 ] = vx;
			V[ i3 + 1 ] = vy;
			V[ i3 + 2 ] = vz;

		}

	}

	// Spray where a leaping fish leaves or re-enters the water.
	splash( x, z, vx, vz, L, strength ) {

		if ( ! this.spray ) return;
		_v.set( x, 0.02, z );
		_w.set( vx * 0.2, 1.2 * strength, vz * 0.2 );
		this.spray.emit( _v, _w, Math.round( 10 + 18 * strength ), 0.012 + L * 0.02, 0, { spread: 0.9, life: 1.1 } );

	}

	// ------------------------------------------------------------------ rendering

	// Orients the visible fish, advances their swimming wave and writes the instance data.
	cull( camera ) {

		if ( ! this.batch ) return;
		if ( this._cullFrame === this._frame ) return;
		this._cullFrame = this._frame;
		const dt = this.dt;
		camera.updateMatrixWorld();
		_m.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		_frustum.setFromProjectionMatrix( _m, camera.coordinateSystem, camera.reversedDepth );
		const cp = camera.position;
		// pixels per metre at 1 m: level of detail by the fish's size on screen
		const pxScale = camera.projectionMatrix.elements[ 5 ] * this.viewHeight * 0.5;
		const batch = this.batch, D = batch.records, C = this.cfg, RANGE = C.range;
		const LOD_PX = C.lodPx === 1 ? LOD_PX0 : LOD_PX0.map( ( x ) => x * C.lodPx );
		const P = this.pos, V = this.vel, H = this.head, R = this.prev;
		const kHead = 1 - Math.exp( - dt * 6 ), kRoll = 1 - Math.exp( - dt * 3 );
		batch.begin();
		for ( const g of this.groups ) {

			if ( ! g.active ) continue;
			const sp = g.sp;
			// whole group out of range / view
			const gd = Math.hypot( g.center.x - cp.x, g.center.y - cp.y, g.center.z - cp.z );
			if ( gd > RANGE + g.radius ) continue;
			_sphere.center.copy( g.center );
			_sphere.radius = g.radius + 2;
			if ( ! _frustum.intersectsSphere( _sphere ) ) continue;
			const turtle = sp.mode === 'turtle', ray = sp.model === 'stingray' || sp.model === 'eagleRay';
			for ( let a = 0; a < g.count; a ++ ) {

				const i = g.offset + a, i3 = i * 3;
				// (Salt Life) landed: gone; on the shaft: posed by the speargun (hold), thrashing
				const held = this.held[ i ];
				if ( held === 2 ) continue;
				const L = this.size[ i ];
				const x = P[ i3 ], y = P[ i3 + 1 ], z = P[ i3 + 2 ];
				const vx = V[ i3 ], vy = V[ i3 + 1 ], vz = V[ i3 + 2 ];
				const speed = Math.sqrt( vx * vx + vy * vy + vz * vz ) + 1e-6;
				const airborne = this.jump[ i ] > 1.5;

				// heading follows the velocity (slowly when hovering), pitch limited
				let hx = H[ i3 ], hy = H[ i3 + 1 ], hz = H[ i3 + 2 ];
				if ( ! held ) {

					const kh = airborne ? 1 : kHead * Math.min( 1, speed / ( L * 0.5 ) + 0.15 );
					const ohx = hx, ohz = hz;
					hx = ohx + ( vx / speed - ohx ) * kh;
					hy = hy + ( vy / speed - hy ) * kh;
					hz = ohz + ( vz / speed - ohz ) * kh;
					const pitchMax = airborne ? 1.2 : ray || turtle ? 0.3 : 0.45;
					hy = Math.max( - pitchMax, Math.min( pitchMax, hy ) );
					const hl = Math.hypot( hx, hy, hz ) || 1;
					hx /= hl;
					hy /= hl;
					hz /= hl;
					H[ i3 ] = hx;
					H[ i3 + 1 ] = hy;
					H[ i3 + 2 ] = hz;
					const yawRate = ( ohz * hx - ohx * hz ) / dt;
					const bank = ray ? 0.45 : turtle ? 0.35 : 0.12;
					this.roll[ i ] += ( Math.max( - 0.5, Math.min( 0.5, yawRate * bank ) ) - this.roll[ i ] ) * kRoll;
					this.bend[ i ] += ( Math.max( - 0.25, Math.min( 0.25, yawRate * 0.06 ) ) - this.bend[ i ] ) * kRoll;

				}

				// tail beat / wing wave / flipper stroke: frequency and amplitude grow with speed (a
				// speared fish beats hard and fast as it fights the shaft: its panic)
				const bl = speed / L;
				const rest = sp.mode === 'glide' && g.rest > 0;
				const thrash = held ? this.panic[ i ] : 0;
				const freq = held ? sp.freq[ 0 ] * ( 1.2 + thrash * 3 ) : rest ? 0.15 : Math.min( 10, sp.freq[ 0 ] + sp.freq[ 1 ] * bl ) * ( airborne ? 2.5 : 1 );
				const dPhase = dt * TAU * freq;
				this.phase[ i ] = ( this.phase[ i ] + dPhase ) % ( TAU * 64 );
				const amp = held ? sp.amp * ( 0.5 + thrash * 2.5 ) : rest ? sp.amp * 0.2 : sp.amp * ( 0.55 + 0.45 * Math.min( 2.5, bl / Math.max( 0.2, sp.cruise ) ) + this.panic[ i ] * 0.5 );

				// cull: distance, size on screen and view frustum
				const dx = x - cp.x, dy = y - cp.y, dz = z - cp.z;
				const d = Math.sqrt( dx * dx + dy * dy + dz * dz );
				if ( d > RANGE + L ) continue;
				const px = L * pxScale / Math.max( d, 0.1 );
				if ( px < 1.2 ) continue;
				_sphere.center.set( x, y, z );
				_sphere.radius = L * 0.7;
				if ( ! _frustum.intersectsSphere( _sphere ) ) continue;

				// orientation: yaw from the heading, pitch, bank into turns
				yawPitchRoll( Math.atan2( hx, hz ), - Math.asin( Math.max( - 1, Math.min( 1, hy ) ) ), this.roll[ i ], _q );

				const o = i * 16;
				D[ o ] = x;
				D[ o + 1 ] = y;
				D[ o + 2 ] = z;
				D[ o + 3 ] = L;
				D[ o + 4 ] = _q.x;
				D[ o + 5 ] = _q.y;
				D[ o + 6 ] = _q.z;
				D[ o + 7 ] = _q.w;
				D[ o + 8 ] = this.phase[ i ];
				D[ o + 9 ] = amp;
				D[ o + 10 ] = this.bend[ i ];
				D[ o + 11 ] = this.pattern[ i ] + this.seed[ i ] * 0.9;
				D[ o + 12 ] = x - R[ i3 ];
				D[ o + 13 ] = y - R[ i3 + 1 ];
				D[ o + 14 ] = z - R[ i3 + 2 ];
				D[ o + 15 ] = dPhase;
				// level of detail by size on screen, cross-faded (dithered) over a band before each
				// switch; faded out over the last tenth of the draw distance
				const lod = px > LOD_PX[ 0 ] ? 0 : px > LOD_PX[ 1 ] ? 1 : px > LOD_PX[ 2 ] ? 2 : 3;
				const k0 = this.kind[ i ] + lod;
				const far = RANGE * 0.9;
				if ( ! C.fades ) batch.add( k0, i );
				else if ( d > far ) batch.addFade( k0, i, 1 - bandFade( d, far, RANGE + L ), false );
				else if ( lod < 3 && px < LOD_PX[ lod ] * LOD_BAND ) {

					const f = bandFade( - px, - LOD_PX[ lod ] * LOD_BAND, - LOD_PX[ lod ] );
					batch.addFade( k0, i, f, true );
					batch.addFade( k0 + 1, i, f, false );

				} else batch.add( k0, i );

			}

		}

		batch.commit();
		batch.texture.needsUpdate = true;

	}

	// ------------------------------------------------------------------ (Salt Life) the speargun

	// what fish i is: its kind (BEHAVIOUR: the catch table's species in .fish, else .label) and its
	// length (m)
	about( i ) {

		return { sp: this.groupOf[ i ].sp, L: this.size[ i ] };

	}

	// the body of a model as an ellipsoid in the model's frame (total length 1, snout at z = +0.5):
	// centre ( 0, cy, cz ), half axes ( hw, hh, hl ). Fins aren't in it: a shot through a fin misses
	hitShape( model ) {

		let h = this.hitShapes[ model ];
		if ( h ) return h;
		const S = SPECIES[ model ];
		if ( ! S.top ) h = { cz: 0, hl: 0.5, cy: 0, hh: 0.06, hw: 0.4 }; // rays and the turtle (flat)
		else {

			const max = ( pts ) => pts.reduce( ( m, p ) => Math.max( m, p[ 1 ] ), 0 );
			const top = max( S.top ), bot = max( S.bot );
			h = { cz: 0.5 - S.body / 2, hl: S.body / 2, cy: ( top - bot ) / 2, hh: ( top + bot ) / 2, hw: max( S.wid ) * 1.15 };

		}

		return this.hitShapes[ model ] = h;

	}

	// The first swimming fish the segment a -> b goes through (only those pick( i ) allows; all of
	// them without it): { i, t (0 .. 1 along the segment), u (where along its body: 0 snout .. 1 the
	// base of its tail) }, or null
	pierce( a, b, pick = null ) {

		const P = this.pos, H = this.head;
		const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z;
		const len = Math.hypot( sx, sy, sz );
		if ( len < 1e-6 ) return null;
		let best = null, bt = Infinity;
		for ( const g of this.groups ) {

			if ( ! g.active ) continue;
			// the group's sphere against the segment
			const cx = g.center.x - a.x, cy = g.center.y - a.y, cz = g.center.z - a.z;
			const along = Math.max( 0, Math.min( len, ( cx * sx + cy * sy + cz * sz ) / len ) );
			const ex = cx - sx / len * along, ey = cy - sy / len * along, ez = cz - sz / len * along;
			if ( ex * ex + ey * ey + ez * ez > ( g.radius + 1.5 ) ** 2 ) continue;
			const sh = this.hitShape( g.sp.model );
			for ( let k = 0; k < g.count; k ++ ) {

				const i = g.offset + k, i3 = i * 3;
				if ( this.held[ i ] || ( pick && ! pick( i ) ) ) continue;
				const L = this.size[ i ];
				// the fish's frame: f its heading, r level and square to it, v up its back
				let fx = H[ i3 ], fy = H[ i3 + 1 ], fz = H[ i3 + 2 ];
				const fl = Math.hypot( fx, fy, fz ) || 1;
				fx /= fl; fy /= fl; fz /= fl;
				let rx = fz, rz = - fx;
				const rl = Math.hypot( rx, rz ) || 1;
				rx /= rl; rz /= rl;
				const vx = - rz * fy, vy = rz * fx - rx * fz, vz = rx * fy;
				// the segment in the ellipsoid's unit-sphere space
				const ox = a.x - P[ i3 ], oy = a.y - P[ i3 + 1 ], oz = a.z - P[ i3 + 2 ];
				const toUnit = ( x, y, z, out, origin ) => {

					const lz = x * fx + y * fy + z * fz, lx = x * rx + z * rz, ly = x * vx + y * vy + z * vz;
					out[ 0 ] = lx / ( sh.hw * L );
					out[ 1 ] = ( ly - ( origin ? sh.cy * L : 0 ) ) / ( sh.hh * L );
					out[ 2 ] = ( lz - ( origin ? sh.cz * L : 0 ) ) / ( sh.hl * L );
					return lz;

				};
				toUnit( ox, oy, oz, _o3, true );
				toUnit( sx, sy, sz, _d3, false );
				const A = _d3[ 0 ] ** 2 + _d3[ 1 ] ** 2 + _d3[ 2 ] ** 2;
				const B = 2 * ( _o3[ 0 ] * _d3[ 0 ] + _o3[ 1 ] * _d3[ 1 ] + _o3[ 2 ] * _d3[ 2 ] );
				const Cc = _o3[ 0 ] ** 2 + _o3[ 1 ] ** 2 + _o3[ 2 ] ** 2 - 1;
				const disc = B * B - 4 * A * Cc;
				if ( disc < 0 ) continue;
				let t = Cc <= 0 ? 0 : ( - B - Math.sqrt( disc ) ) / ( 2 * A );
				if ( t < 0 || t > 1 || t >= bt ) continue;
				bt = t;
				const lz = ( oz + sz * t ) * fz + ( ox + sx * t ) * fx + ( oy + sy * t ) * fy;
				best = { i, t, u: Math.max( 0, Math.min( 1, ( 0.5 - lz / L ) / ( 2 * sh.hl ) ) ) };

			}

		}

		return best;

	}

	// fish i is on the shaft: at x, y, z, heading h (unit), rolled `roll` about it, thrashing 0 .. 1
	// (the speargun, each frame while it holds it)
	hold( i, x, y, z, h, roll, thrash ) {

		const i3 = i * 3;
		if ( ! this.held[ i ] ) {

			this.held[ i ] = 1;
			this.startle( x, y, z, 7 );

		}

		this.pos[ i3 ] = x;
		this.pos[ i3 + 1 ] = y;
		this.pos[ i3 + 2 ] = z;
		this.vel[ i3 ] = this.vel[ i3 + 1 ] = this.vel[ i3 + 2 ] = 0;
		this.head[ i3 ] = h.x;
		this.head[ i3 + 1 ] = h.y;
		this.head[ i3 + 2 ] = h.z;
		this.roll[ i ] = roll;
		this.bend[ i ] = Math.sin( this.time * 9 + i ) * 0.2 * thrash;
		this.panic[ i ] = thrash;

	}

	// it tore free: off it goes, at speed
	release( i ) {

		const i3 = i * 3, L = this.size[ i ];
		this.held[ i ] = 0;
		const sp = this.groupOf[ i ].sp;
		this.vel[ i3 ] = this.head[ i3 ] * sp.burst * L;
		this.vel[ i3 + 1 ] = 0;
		this.vel[ i3 + 2 ] = this.head[ i3 + 2 ] * sp.burst * L;
		this.panic[ i ] = 1;

	}

	// landed: gone from the water until its place is filled, a few minutes on, out of sight
	take( i ) {

		this.held[ i ] = 2;
		this.refillAt[ i ] = this.time + REFILL[ 0 ] + Math.random() * ( REFILL[ 1 ] - REFILL[ 0 ] );
		this.taken.add( i );

	}

	// the landed fish whose time has come, back among their own kind where the camera can't see
	refill( camera ) {

		for ( const i of this.taken ) {

			if ( this.time < this.refillAt[ i ] ) continue;
			const g = this.groupOf[ i ];
			const far = ! camera || Math.hypot( g.center.x - camera.x, g.center.y - camera.y, g.center.z - camera.z ) > this.cfg.range + g.radius + 6;
			if ( ! far ) continue;
			const i3 = i * 3, sp = g.sp;
			let mate = - 1;
			for ( let k = 0; k < g.count && mate < 0; k ++ ) if ( ! this.held[ g.offset + k ] ) mate = g.offset + k;
			const x = mate >= 0 ? this.pos[ mate * 3 ] + ( Math.random() - 0.5 ) : g.home.x;
			const z = mate >= 0 ? this.pos[ mate * 3 + 2 ] + ( Math.random() - 0.5 ) : g.home.z;
			const y = this.clampY( sp, x, z, mate >= 0 ? this.pos[ mate * 3 + 1 ] : g.home.y );
			this.pos.set( [ x, y, z ], i3 );
			this.prev.set( [ x, y, z ], i3 );
			this.vel.set( [ g.heading.x * sp.cruise * this.size[ i ], 0, g.heading.z * sp.cruise * this.size[ i ] ], i3 );
			this.head.set( [ g.heading.x, 0, g.heading.z ], i3 );
			this.panic[ i ] = 0;
			this.held[ i ] = 0;
			this.taken.delete( i );

		}

	}

	// a fright at x, y, z (a shot, a speared fish thrashing): the fish within r scatter, and stay wary
	startle( x, y, z, r ) {

		for ( const g of this.groups ) {

			if ( ! g.active ) continue;
			if ( Math.hypot( g.center.x - x, g.center.y - y, g.center.z - z ) > r + g.radius ) continue;
			g.alarm = 4;
			g.spooked = SPOOKED;
			g.rest = 0;
			const sp = g.sp;
			if ( sp.mode !== 'mill' && sp.mode !== 'hover' && sp.mode !== 'pile' && sp.mode !== 'lurk' && sp.mode !== 'bait' && sp.mode !== 'escort' && sp.mode !== 'remora' ) this.retarget( g, { x: g.center.x - x, z: g.center.z - z } );
			for ( let k = 0; k < g.count; k ++ ) {

				const i = g.offset + k;
				if ( this.held[ i ] ) continue;
				const d = Math.hypot( this.pos[ i * 3 ] - x, this.pos[ i * 3 + 1 ] - y, this.pos[ i * 3 + 2 ] - z );
				if ( d < r ) this.panic[ i ] = Math.max( this.panic[ i ], 1 - d / r );

			}

		}

	}

	dispose() {

		if ( this.batch ) {

			this.batch.dispose();
			this.material.dispose();

		}

		this.group.removeFromParent();

	}

}

const _o3 = [ 0, 0, 0 ], _d3 = [ 0, 0, 0 ];

// (Salt Life) WARY at the diver's speed (m/s): how far the fish notice them, as a share of their flee
// distance
function wariness( speed ) {

	if ( speed <= WARY[ 0 ][ 0 ] ) return WARY[ 0 ][ 1 ];
	for ( let k = 1; k < WARY.length; k ++ ) {

		if ( speed <= WARY[ k ][ 0 ] ) {

			const [ s0, w0 ] = WARY[ k - 1 ], [ s1, w1 ] = WARY[ k ];
			return w0 + ( w1 - w0 ) * ( speed - s0 ) / ( s1 - s0 );

		}

	}

	return WARY[ WARY.length - 1 ][ 1 ];

}

// quaternion of the rotations yaw (about y), then pitch (about x), then roll (about z)
function yawPitchRoll( yaw, pitch, roll, q ) {

	const sy = Math.sin( yaw * 0.5 ), cy = Math.cos( yaw * 0.5 );
	const sx = Math.sin( pitch * 0.5 ), cx = Math.cos( pitch * 0.5 );
	const sz = Math.sin( roll * 0.5 ), cz = Math.cos( roll * 0.5 );
	const x1 = cy * sx, y1 = sy * cx, z1 = - sy * sx, w1 = cy * cx;
	q.set( x1 * cz + y1 * sz, - x1 * sz + y1 * cz, w1 * sz + z1 * cz, w1 * cz - z1 * sz );
	return q;

}
