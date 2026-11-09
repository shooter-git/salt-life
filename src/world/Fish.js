import * as THREE from '../engine/index.js';
import { mulberry32 } from '../util/Noise.js';
import { KindBatch } from './reef/KindBatch.js';
import { WORLD } from './WorldLayout.js';
import { SPECIES } from './fish/FishSpecies.js';
import { createSwimMaterial } from './fish/FishMaterial.js';
import { bandFade } from '../materials/LODFade.js';
import { CONDITIONS, SURF_MAX } from '../game/Weather.js';
import { G } from '../core/Globals.js';
import { FLATS_POOL, KIND_OF, FlatsBudget } from './fish/FlatsPool.js';
import { FlatsMarks, MUD_LIFE } from './fish/FlatsMarks.js';

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
//
// (Salt Life) More of the sea's life: bonefish tailing on the shallow flats, goliath groupers at the
// pier's piles and the drop-off, cubera snappers on the drop-off, silk snappers over the deep holes,
// mangrove snappers at the piles, on the reef and in the bay, white mullet along the shore. Sharks
// in the background: Caribbean reef sharks along the drop-off and blacktips off the bay, cruising,
// nurse sharks resting on the sand. A shark or a goliath near a speared or hooked fish now and then
// comes in and takes it (raid). Spiny lobsters in dens at the foot of the coral heads by day, out
// walking after dark, taken by hand: tickled out (tickle), netted (netLobster).
//
// (M17) And the flats' own, for sight-fishing (docs/m17/sight.md): a pool of groups of each kind (fish/FlatsPool.js),
// parked until one of game/Flats.js' schools comes within reach (setSight, from game/FlatsFishing.js), then about its
// anchor as it moves at the island's pace, each fish in its place in the school in real time: bonefish tailing on the
// shallowest sand (head down, the tail out), mudding where it's softer and deeper (a puff of silt), cruising as nervous
// water and a shadow on the sand; permit alone or a pair along the edge, the black sickles of their fins out in
// shallow water; tarpon rolling (up through the surface and over) or laid up just under it; snook and barracuda lying
// still, facing the current; a pack of blacktips and a lemon shark cruising, their fins out over the flat. A fright
// sends a school off with its wake seen (sightBolt); one fish comes to a bait (sightFollow) and eats it or turns off
// (sightFollowEnd). Each is drawn as plainly as it shows from above the water (its group's `seen`: game/Sight.js), its
// shadow, its muds and its sign on the water with it (fish/FlatsMarks.js), nearest first within low's triangles.

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
// (M10) a fair day's surf (m: ShoreWaves' amplitude); from this surf on, schools of the runners inside the
// breakers go off, up to this share of them at the biggest (SURF_MAX); and the breakers' look-ahead grid
// is built again once the surf's moved this much (m)
const FAIR_SURF = CONDITIONS.fair.surf;
const OFF_SURF = 0.5;
const OFF_SHARE = 0.5;
const GRID_SURF = 0.03;
// (Salt Life) a landed fish's place is filled again after this long (s), out of sight
const REFILL = [ 240, 420 ];
// how far fish notice the diver (their flee distance), by the diver's speed (m/s): a slow approach
// gets close, a sprint scatters them
const WARY = [ [ 0.3, 0.5 ], [ 1.5, 1 ], [ 2.5, 1.55 ] ];
// (M11) and in murky water after a blow (G.murk), later: at this share of it when it's at its murkiest
// (they see as little as you do)
const MURK_WARY = 0.6;
const SPOOKED = 25; // s a fish stays warier after a fright (a sprint at it, a shot)
// (Salt Life) the cast net: a fish this far out (of the lead line's radius) is at its edge, so not under
// it as it lands, and out under it from there; and how long (s) the lead line's ring of splashes
// turns the fish inside in toward the middle before they make for the edge
const NET_EDGE = 0.9;
const NET_TURN = [ 0.4, 1.2 ];
const GRAVITY = 9.81;
const LOD_PX0 = [ 320, 80, 22 ]; // screen length (px) below which the next level of detail takes over
const LOD_BAND = 1.15; // cross-fade band above each switch (screen length ratio)
// (Salt Life) a spiny lobster's states (aux[ 0 ]: stepLobster); the height of its body's centre over
// the ground on its legs (body lengths: fish/CreatureGeometry.js lobsterGeometry); out of the den
// between these hours
const LOB = { den: 0, forage: 1, out: 2, flip: 3, home: 4 };
const LOB_STAND = 0.112;
const LOB_NIGHT = [ 5.8, 19.2 ];
const FLIP_S = 0.9; // s a lobster's tail flip lasts
const BONE_TILT = 0.9; // a rooting bonefish's nose-down tilt (rad)
const RAID_OFF = 5; // s a thief keeps going once it has the fish
// (M16) the far water's fish (BEHAVIOUR's far; setFinds). Only ever about you: each group's sent to something near you
// once you're off from where it was (keep, m), when one's within reach (near, m; open water: a fish in `open` of the
// lattice's cells, this size, for so many seconds, wherever it's deep; `night`: the swordfish, the same, after dark)
const FAR = { groups: [ [ 'mahiFar', 8 ], [ 'mahiFar', 6 ], [ 'mahiWake', 9 ], [ 'mahiWake', 7 ], [ 'tunaFar', 8 ], [ 'yellowfin', 5 ], [ 'sailfish', 2 ], [ 'wahoo', 2 ], [ 'whiteMarlin', 1 ], [ 'blueMarlin', 1 ], [ 'swordfish', 1 ] ], keep: 90, near: { debris: 220, wake: 260, bait: 260 }, cell: 500, open: 0.22, night: 0.4, every: 300, deep: 60 };

// Behaviour per kind of swimmer. model: anatomy (FishSpecies.js) or 'stingray' / 'eagleRay' /
// 'turtle'; length range (m); mode (see stepGroup); speeds in body lengths / s (cruise, max,
// burst when fleeing), steering accel, boids (separation distance and neighbour radius in body
// lengths, weights); depth: preferred height above the bottom (fraction of the local water
// column above it: 0 on the bottom .. 1 at the ceiling); band: water depth range of the homes;
// flee: reaction distance (m); amp / freq: tail beat amplitude and frequency (Hz at rest, per
// body length / s). (Salt Life) fish: the catch table's species (game/FishTable.js), or label: what
// it is when it's not one; curious: how close (m) it comes to look at a diver keeping still; rests
// (glide): [ chance a second it settles on the bottom, for this long (s), plus up to this ].
const base = {
	cruise: 1, max: 2.5, burst: 6, accel: 4, sep: 2, nbr: 5, wSep: 5, wAli: 1, wCoh: 0.8, wGoal: 1, flee: 3.5,
	depth: [ 0.1, 0.5 ], homeRadius: 6, amp: 0.08, freq: [ 1.6, 0.9 ], ceiling: CEILING, minDepth: 1.2, band: [ 1.5, 20 ],
	rests: [ 0.02, 6, 12 ],
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
	fry: { model: 'silverside', fish: 'silverside', label: 'Silverside fry', length: [ 0.045, 0.065 ], mode: 'fry', cruise: 2, max: 4, burst: 14, accel: 9, sep: 1.6, nbr: 8, wSep: 7, wAli: 2.4, wCoh: 1.6, wGoal: 0.9, flee: 3.2, depth: [ 0.3, 0.8 ], homeRadius: 6, amp: 0.11, freq: [ 3.5, 1.2 ], ceiling: - 0.2, minDepth: 0.5, band: [ 0.5, 3.5 ] },
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
	mahi: { model: 'mahi', fish: 'mahi', length: [ 0.7, 1.25 ], mode: 'cruise', curious: 4, cruise: 1.0, max: 3, burst: 8, accel: 3, sep: 2.5, nbr: 5, wSep: 3, wAli: 1.2, wCoh: 0.6, wGoal: 0.8, flee: 6, under: [ 0.8, 4 ], homeRadius: 45, amp: 0.06, freq: [ 1.2, 0.7 ], ceiling: - 0.5, band: [ 16, 1e9 ] },
	tuna: { model: 'tuna', fish: 'tuna', length: [ 0.5, 0.85 ], mode: 'cruise', cruise: 1.4, max: 3.5, burst: 9, accel: 4, sep: 2, nbr: 6, wAli: 2, wCoh: 1.2, wGoal: 0.8, flee: 7, under: [ 1.5, 8 ], homeRadius: 45, amp: 0.05, freq: [ 1.6, 0.8 ], band: [ 16, 1e9 ] },
	// (Salt Life) inside the breakers (surf: the surf zone is theirs), running the trough along the beach
	// at wading depth: pods of finger mullet (now and then one leaps) and of silverside fry, for the cast
	// net from the beach (game/CastNet.js)
	runnerMullet: { model: 'mullet', fish: 'mullet', length: [ 0.2, 0.34 ], mode: 'jumper', surf: true, cruise: 0.9, max: 2.4, burst: 5.5, accel: 3, sep: 1.6, nbr: 5, wAli: 1.6, wCoh: 1.1, wGoal: 0.8, flee: 2.6, depth: [ 0.25, 0.7 ], homeRadius: 22, amp: 0.07, freq: [ 1.5, 0.9 ], ceiling: - 0.14, minDepth: 0.4, band: [ 0.5, 1.6 ] },
	runnerFry: { model: 'silverside', fish: 'silverside', label: 'Silverside fry', length: [ 0.05, 0.075 ], mode: 'fry', surf: true, cruise: 2, max: 4, burst: 12, accel: 9, sep: 1.6, nbr: 8, wSep: 7, wAli: 2.4, wCoh: 1.6, wGoal: 0.9, flee: 2.4, depth: [ 0.3, 0.75 ], homeRadius: 14, amp: 0.11, freq: [ 3.5, 1.2 ], ceiling: - 0.12, minDepth: 0.35, band: [ 0.45, 1.5 ] },
	// (Salt Life) more of the sea's life. Bonefish nose over the shallow flats in small schools (the
	// warier fish there is none); now and then one stops, head down, rooting in the sand with its tail
	// up. Goliath groupers hang at the pier's piles and the deep heads, unafraid; cubera snappers lurk
	// in pairs on the drop-off; silk snappers mill over the deep holes; mangrove snappers round the
	// piles, at the coral heads and in the bay; white mullet school along the shore. hug: keeps this
	// close over the bottom (its belly's depth under its centre, body lengths); thief: [ how near (m)
	// a speared or hooked fish has to be, the chance it comes for it ] (raid)
	bonefish: { model: 'bonefish', fish: 'bonefish', length: [ 0.4, 0.7 ], mode: 'flats', cruise: 0.55, max: 2, burst: 14, accel: 6, sep: 2, nbr: 6, wAli: 1.2, wCoh: 0.9, wGoal: 0.8, flee: 10, depth: [ 0, 0.15 ], homeRadius: 10, amp: 0.07, freq: [ 1.4, 0.8 ], ceiling: - 0.15, minDepth: 0.15, band: [ 0.4, 1.3 ] },
	goliathGrouper: { model: 'goliathGrouper', fish: 'goliathGrouper', length: [ 1.1, 1.9 ], mode: 'lurk', cruise: 0.1, max: 0.7, burst: 2.5, accel: 0.8, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 1.6, depth: [ 0.02, 0.12 ], homeRadius: 2, amp: 0.035, freq: [ 0.4, 0.45 ], hug: 0.17, band: [ 3, 20 ], thief: [ 10, 0.45 ] },
	cuberaSnapper: { model: 'cuberaSnapper', fish: 'cuberaSnapper', length: [ 0.8, 1.4 ], mode: 'lurk', cruise: 0.18, max: 1.4, burst: 6, accel: 1.5, sep: 1.5, nbr: 3, wSep: 1, wAli: 0.3, wCoh: 0.3, wGoal: 0.8, flee: 5, depth: [ 0.03, 0.15 ], homeRadius: 4, amp: 0.045, freq: [ 0.7, 0.6 ], hug: 0.2, band: [ 9, 30 ] },
	silkSnapper: { model: 'silkSnapper', fish: 'silkSnapper', length: [ 0.32, 0.6 ], mode: 'mill', cruise: 0.5, max: 1.8, burst: 9, accel: 2.5, sep: 1.8, nbr: 5, wAli: 1.2, wCoh: 0.9, wGoal: 0.9, flee: 5, depth: [ 0.05, 0.3 ], homeRadius: 4, amp: 0.06, freq: [ 1.2, 0.8 ], band: [ 17, 1e9 ] },
	graySnapper: { model: 'graySnapper', fish: 'graySnapper', length: [ 0.22, 0.48 ], mode: 'mill', cruise: 0.45, max: 1.8, burst: 8, accel: 3, sep: 1.6, nbr: 4, wAli: 1.4, wCoh: 0.9, wGoal: 0.9, flee: 4.5, depth: [ 0.05, 0.3 ], homeRadius: 2, band: [ 2.5, 10 ] },
	pierGray: { model: 'graySnapper', fish: 'graySnapper', length: [ 0.22, 0.42 ], mode: 'pile', cruise: 0.5, max: 2, burst: 8, accel: 3, sep: 1.6, wAli: 1.4, wCoh: 0.8, flee: 4, depth: [ 0.1, 0.5 ], homeRadius: 2, freq: [ 1.5, 0.9 ], band: [ 2, 6 ] },
	whiteMullet: { model: 'whiteMullet', fish: 'whiteMullet', length: [ 0.2, 0.34 ], mode: 'jumper', cruise: 0.8, max: 2.4, burst: 6, accel: 3.5, sep: 1.8, nbr: 5, wAli: 1.5, wCoh: 1, wGoal: 0.8, flee: 4, depth: [ 0.3, 0.9 ], homeRadius: 12, amp: 0.07, freq: [ 1.6, 0.9 ], ceiling: - 0.25, minDepth: 1.0, band: [ 1.5, 4.5 ] },
	// the sharks, in the background: Caribbean reef sharks cruise the drop-off and blacktips the water
	// off the bay, never stopping, curious about a diver who keeps still and drawn to a commotion
	// (startle); nurse sharks rest on the sand most of the day. Not fish to spear (rule)
	reefShark: { model: 'reefShark', label: 'Caribbean reef shark', rule: 'shark', length: [ 1.5, 2.4 ], mode: 'cruise', curious: 6, cruise: 0.32, max: 1.2, burst: 4, accel: 1.2, sep: 3, nbr: 4, wSep: 2, wAli: 0.3, wCoh: 0.2, wGoal: 0.8, flee: 3, depth: [ 0.25, 0.6 ], homeRadius: 30, amp: 0.09, freq: [ 0.5, 0.45 ], band: [ 9, 30 ], thief: [ 25, 0.3 ] },
	blacktipShark: { model: 'blacktipShark', label: 'Blacktip shark', rule: 'shark', length: [ 1.2, 1.8 ], mode: 'cruise', curious: 8, cruise: 0.45, max: 1.5, burst: 5, accel: 1.5, sep: 3, nbr: 5, wSep: 2, wAli: 0.8, wCoh: 0.5, wGoal: 0.8, flee: 5, depth: [ 0.3, 0.8 ], homeRadius: 35, amp: 0.09, freq: [ 0.6, 0.5 ], band: [ 6, 20 ], thief: [ 18, 0.25 ] },
	nurseShark: { model: 'nurseShark', label: 'Nurse shark', rule: 'shark', length: [ 1.6, 2.6 ], mode: 'glide', cruise: 0.18, max: 0.6, burst: 1.5, accel: 0.8, sep: 1, nbr: 2, wSep: 1, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 2, depth: [ 0, 0 ], homeRadius: 10, amp: 0.08, freq: [ 0.45, 0.4 ], hug: 0.07, rests: [ 0.06, 40, 80 ], band: [ 3, 14 ] },
	// spiny lobsters (stepLobster): by hand, not with the speargun
	lobster: { model: 'lobster', fish: 'lobster', length: [ 0.17, 0.42 ], mode: 'lobster', cruise: 0.3, max: 0.6, burst: 8, accel: 3, flee: 1.1, depth: [ 0, 0 ], homeRadius: 3, amp: 0, freq: [ 1.5, 2 ], band: [ 2.5, 12 ] },
	// (M16) the flats': redfish rooting along the bottom with their tails up, as the bonefish do, heavier and less
	// nervous; trout in small loose schools over the grass
	redfish: { model: 'redfish', fish: 'redfish', length: [ 0.45, 0.95 ], mode: 'flats', cruise: 0.4, max: 1.8, burst: 8, accel: 4, sep: 2.5, nbr: 5, wAli: 0.8, wCoh: 0.6, wGoal: 0.8, flee: 6, depth: [ 0, 0.15 ], homeRadius: 12, amp: 0.07, freq: [ 1.2, 0.7 ], ceiling: - 0.18, minDepth: 0.18, band: [ 0.4, 1.5 ] },
	trout: { model: 'trout', fish: 'trout', length: [ 0.3, 0.6 ], mode: 'school', cruise: 0.6, max: 2, burst: 8, accel: 3, sep: 2, nbr: 5, wAli: 1.2, wCoh: 0.8, wGoal: 0.8, flee: 4.5, depth: [ 0.25, 0.7 ], homeRadius: 14, amp: 0.07, freq: [ 1.4, 0.8 ], minDepth: 0.8, band: [ 1.5, 6 ] },
	// (M16) The far water's, seen only about you out there (FAR; setFinds): mahi under the debris and along the
	// weedlines, a raft of a hurricane's wreckage with the most of them; tuna and sailfish about the bait; a wahoo,
	// a marlin now and then in the open water, a swordfish after dark. under: how far under the surface they swim
	mahiFar: { model: 'mahi', fish: 'mahi', far: 'debris', length: [ 0.7, 1.3 ], mode: 'cruise', curious: 5, cruise: 0.9, max: 3, burst: 8, accel: 3, sep: 2.5, nbr: 5, wSep: 3, wAli: 1.2, wCoh: 0.7, wGoal: 1, flee: 6, under: [ 0.6, 3.5 ], homeRadius: 12, amp: 0.06, freq: [ 1.2, 0.7 ], ceiling: - 0.3, band: [ 8, 1e9 ] },
	mahiWake: { model: 'mahi', fish: 'mahi', far: 'wake', length: [ 0.7, 1.45 ], mode: 'cruise', curious: 5, cruise: 0.9, max: 3, burst: 8, accel: 3, sep: 2.5, nbr: 5, wSep: 3, wAli: 1.2, wCoh: 0.7, wGoal: 1, flee: 6, under: [ 0.6, 4 ], homeRadius: 14, amp: 0.06, freq: [ 1.2, 0.7 ], ceiling: - 0.3, band: [ 8, 1e9 ] },
	tunaFar: { model: 'tuna', fish: 'tuna', far: 'bait', length: [ 0.55, 1.05 ], mode: 'cruise', cruise: 1.4, max: 3.5, burst: 9, accel: 4, sep: 2, nbr: 6, wAli: 2, wCoh: 1.2, wGoal: 1, flee: 7, under: [ 1, 7 ], homeRadius: 26, amp: 0.05, freq: [ 1.6, 0.8 ], ceiling: - 0.3, band: [ 8, 1e9 ] },
	yellowfin: { model: 'yellowfin', fish: 'yellowfin', far: 'bait', length: [ 0.95, 1.8 ], mode: 'cruise', cruise: 1.1, max: 3.2, burst: 8, accel: 3.5, sep: 2, nbr: 6, wAli: 2, wCoh: 1.2, wGoal: 1, flee: 8, under: [ 1.5, 9 ], homeRadius: 28, amp: 0.05, freq: [ 1.4, 0.8 ], ceiling: - 0.3, band: [ 8, 1e9 ] },
	wahoo: { model: 'wahoo', fish: 'wahoo', far: 'open', length: [ 1.1, 1.8 ], mode: 'cruise', cruise: 1.2, max: 5, burst: 12, accel: 5, sep: 3, nbr: 4, wSep: 2, wAli: 0.4, wCoh: 0.3, wGoal: 0.9, flee: 8, under: [ 1, 8 ], homeRadius: 30, amp: 0.05, freq: [ 1.6, 0.8 ], ceiling: - 0.3, band: [ 8, 1e9 ] },
	sailfish: { model: 'sailfish', fish: 'sailfish', far: 'bait', length: [ 1.9, 2.9 ], mode: 'cruise', curious: 7, cruise: 0.5, max: 2.2, burst: 7, accel: 1.8, sep: 4, nbr: 5, wSep: 2, wAli: 1, wCoh: 0.6, wGoal: 0.9, flee: 7, under: [ 0.5, 4 ], homeRadius: 24, amp: 0.05, freq: [ 0.8, 0.6 ], ceiling: - 0.25, band: [ 8, 1e9 ] },
	whiteMarlin: { model: 'whiteMarlin', fish: 'whiteMarlin', far: 'open', length: [ 2, 2.8 ], mode: 'cruise', curious: 6, cruise: 0.45, max: 2, burst: 6, accel: 1.6, sep: 4, nbr: 4, wSep: 2, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 7, under: [ 1, 7 ], homeRadius: 30, amp: 0.05, freq: [ 0.7, 0.55 ], ceiling: - 0.25, band: [ 8, 1e9 ] },
	blueMarlin: { model: 'blueMarlin', fish: 'blueMarlin', far: 'open', length: [ 2.6, 4.2 ], mode: 'cruise', curious: 8, cruise: 0.35, max: 1.6, burst: 5, accel: 1.2, sep: 5, nbr: 4, wSep: 2, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 8, under: [ 1.5, 9 ], homeRadius: 34, amp: 0.045, freq: [ 0.55, 0.45 ], ceiling: - 0.3, band: [ 8, 1e9 ] },
	swordfish: { model: 'swordfish', fish: 'swordfish', far: 'night', length: [ 1.6, 3.2 ], mode: 'cruise', curious: 6, cruise: 0.4, max: 2, burst: 6, accel: 1.4, sep: 5, nbr: 4, wSep: 2, wAli: 0, wCoh: 0, wGoal: 0.8, flee: 6, under: [ 2, 12 ], homeRadius: 30, amp: 0.05, freq: [ 0.6, 0.5 ], ceiling: - 0.4, band: [ 8, 1e9 ] },
};
// (M17) the flats' (setSight), steered by their school's anchor, not their own wandering; flee 0: what frightens them is
// the flats' own (game/Sight.js, FlatsFishing.js). sight: { spread (m: how far its fish are about the anchor, along
// and across its way), y ('bottom', 'mid' or 'top': where in the water), ahead (m: how far ahead of the anchor a
// cruising one makes for) }
const SIGHT_BASE = { mode: 'sight', flee: 0, wSep: 4, sep: 2, nbr: 6, ceiling: - 0.02, minDepth: 0.1, band: [ 0, 1e9 ], depth: [ 0, 0.15 ] };
Object.assign( BEHAVIOUR, {
	flatsBone: { ...SIGHT_BASE, model: 'bonefish', fish: 'bonefish', length: [ 0.42, 0.7 ], cruise: 0.6, max: 2.2, burst: 14, accel: 6, wAli: 1.2, wCoh: 0.9, wGoal: 1, amp: 0.07, freq: [ 1.4, 0.8 ], sight: { spread: [ 4, 3 ], y: 'bottom', ahead: 5 } },
	flatsSpawn: { ...SIGHT_BASE, model: 'bonefish', fish: 'bonefish', length: [ 0.45, 0.72 ], cruise: 0.4, max: 2, burst: 12, accel: 5, wAli: 1.6, wCoh: 1.1, wGoal: 0.8, amp: 0.07, freq: [ 1.4, 0.8 ], minDepth: 0.8, sight: { spread: [ 14, 10 ], y: 'mid', ahead: 4 } },
	flatsPermit: { ...SIGHT_BASE, model: 'permit', fish: 'permit', length: [ 0.55, 0.95 ], cruise: 0.45, max: 1.8, burst: 9, accel: 4, sep: 3, wAli: 1, wCoh: 0.8, wGoal: 1, amp: 0.06, freq: [ 1.1, 0.7 ], minDepth: 0.2, sight: { spread: [ 1.6, 1.6 ], y: 'bottom', ahead: 6, crabs: 0.7 } },
	flatsTarpon: { ...SIGHT_BASE, model: 'tarpon', fish: 'tarpon', length: [ 1.25, 1.9 ], cruise: 0.28, max: 1.2, burst: 4, accel: 1.2, wAli: 0, wCoh: 0, wGoal: 0.9, amp: 0.04, freq: [ 0.5, 0.7 ], minDepth: 0.8, sight: { spread: [ 0, 0 ], y: 'mid', ahead: 5 } },
	flatsSnook: { ...SIGHT_BASE, model: 'snook', fish: 'snook', length: [ 0.55, 1.0 ], cruise: 0.3, max: 1.6, burst: 8, accel: 3, wAli: 0, wCoh: 0, wGoal: 0.9, amp: 0.05, freq: [ 1, 0.7 ], minDepth: 0.4, sight: { spread: [ 0, 0 ], y: 'bottom', ahead: 2 } },
	flatsCuda: { ...SIGHT_BASE, model: 'barracuda', fish: 'barracuda', length: [ 0.8, 1.3 ], cruise: 0.15, max: 1.4, burst: 7, accel: 1.4, wAli: 0, wCoh: 0, wGoal: 0.7, amp: 0.035, freq: [ 0.5, 0.8 ], minDepth: 0.4, sight: { spread: [ 0, 0 ], y: 'mid', ahead: 2 } },
	flatsBlacktip: { ...SIGHT_BASE, model: 'blacktipShark', label: 'Blacktip shark', rule: 'shark', length: [ 1.0, 1.6 ], cruise: 0.45, max: 1.5, burst: 5, accel: 1.5, sep: 3, nbr: 5, wSep: 2, wAli: 0.8, wCoh: 0.5, wGoal: 0.9, amp: 0.09, freq: [ 0.6, 0.5 ], minDepth: 0.35, sight: { spread: [ 7, 6 ], y: 'mid', ahead: 8 } },
	flatsLemon: { ...SIGHT_BASE, model: 'lemonShark', label: 'Lemon shark', rule: 'shark', length: [ 1.4, 2.3 ], cruise: 0.3, max: 1.2, burst: 4, accel: 1.2, wAli: 0, wCoh: 0, wGoal: 0.9, amp: 0.08, freq: [ 0.5, 0.45 ], minDepth: 0.4, sight: { spread: [ 0, 0 ], y: 'mid', ahead: 6 } },
} );
for ( const k in BEHAVIOUR ) BEHAVIOUR[ k ] = { name: k, ...base, ...BEHAVIOUR[ k ] };
// (M17) a bolting school's run (s), a rooting bonefish's tail-up and its gaps by mode (s), a rolling tarpon's (s)
const BOLT = 3.2;
const N_REFR = 1.34, MARK_NERVOUS = 2, MARK_WAKE = 3;
const ROOT = { tail: [ 3, 7, 1, 4, BONE_TILT ], feed: [ 2, 5, 2, 6, 0.7 ], crab: [ 3, 8, 5, 14, 0.85 ] };
const ROLL = { every: [ 14, 50 ], takes: 3.2, under: 0.4 }; // (s; a rolling tarpon cruises this far under the top between rolls, m)
const TAIL = { reach: 25, depth: 0.28, least: 0.17 }, DEEP = 0.15; // m: where a tailing school roots (_tailGround)

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
		this.holding = 0; // (Salt Life) its fish held (on a shaft, in a cast net's purse): drawn wherever they are
		this.pathIndex = 0;
		this.pathDir = 1;

	}

}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _threat = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _sphere = new THREE.Sphere(), _m = new THREE.Matrix4();

export class FishSchools {

	// floorAt( x, z ): highest obstacle (seabed or reef); anchors: [ [ x, z ], ... ] coral heads;
	// bay: also populate the bay, the pier and the beach; (M15) north: the windward reef's { center, radius,
	// anchors } (its own fish too); shoreField (optional, ShoreField.js)
	// locates the breakers (without it every beach counts as fully exposed)
	// (Salt Life) ground: the Terrain (the shared underwater shading); tier
	constructor( { parent, terrain, ground, floorAt = null, center, radius, anchors = [], seed = 23, bay = true, shoreField = null, tier = 'high', north = null } ) {

		this.cfg = TIER[ tier ] || TIER.high;
		this.tierName = TIER[ tier ] ? tier : 'high';
		this.terrain = terrain;
		this.floorAt = floorAt ?? ( ( x, z ) => terrain.heightAt( x, z ) );
		this.center = center.clone();
		this.radius = radius;
		this.anchors = anchors.length ? anchors : [ [ center.x, center.z ] ];
		this.north = north; // ((M15) the windward reef: { center, radius, anchors }, or null: layout)
		this.shoreField = shoreField;
		// (M10) the surf as a share of a fair day's (setSurf), and what the breakers' grid was built for
		this.surf = 1;
		this._gridSurf = 1;
		this.rng = mulberry32( seed );
		this.time = 0;
		this.spray = null; // set by the owner (Spray.js): splashes of leaping mullet
		this.lit = 0; // (Salt Life) the pier's lamps, 0..1 (the app sets it: Bites.lampsLit)
		this.sharksAway = false; // ((M13) the blacktips gone to deep water: setWeather)
		this.ground = ground;
		this.group = new THREE.Group();
		this.group.name = 'Fish';
		parent.add( this.group );

		// ---- groups
		this.groups = [];
		this.n = 0;
		this.lobsterGroups = [];
		this.layout( bay );
		// ((M17) and the flats' pool, last: everyone else keeps their places)
		this.sight0 = this.groups.length;
		this.sightGroups = bay ? this.layoutSight() : [];
		this.marks = null; // (fish/FlatsMarks.js, the first time a school's in sight)

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
		this.inNet = new Uint8Array( n ); // (Salt Life) under a cast net (netLand)
		this.net = null;
		this.refillAt = new Float32Array( n );
		this.groupOf = new Array( n );
		this.taken = new Set();
		this.hitShapes = {};
		this.diver = { x: 0, y: 0, z: 0, speed: 0, still: 0, has: false };
		this.wary = 1;
		// (Salt Life) per fish, its kind's own state: a bonefish's rooting (time left, or to the next
		// as a negative) and nose-down tilt; a lobster's (stepLobster). The thieves after a fish (raid:
		// fish index -> { x, y, z, got, off }); the island's hour (the app sets it: lobsters come out
		// after dark)
		this.aux = new Float32Array( n * 8 );
		this.raids = new Map();
		this.hour = 12;
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

		// the larger waves of a set (ShoreWaves: offshore amplitude 0.42 m, sets up to ~1.6x), (M10) with
		// the day's surf as it is to a fair day's
		const A = 0.42 * this.surf * 1.3 * e;
		return Math.pow( A * 3.556 / 0.78, 0.8 );

	}

	// (M10) the surf (ShoreWaves' amplitude, m): the breakers follow it, a fair day's where they always were;
	// their look-ahead grid's built again once it's moved enough
	setSurf( amplitude ) {

		this.surf = amplitude / FAIR_SURF;
		if ( Math.abs( this.surf - this._gridSurf ) * FAIR_SURF >= GRID_SURF ) {

			this._gridSurf = this.surf;
			this.breakGrid = null;

		}

	}

	// (M10) in a big surf some schools of the runners inside the breakers go off: one that's out of range
	// doesn't come back into it (one you're among stays)
	offInSurf( g ) {

		const a = this.surf * FAIR_SURF;
		return !! g.sp.surf && a > OFF_SURF && g.offAt < OFF_SHARE * Math.min( 1, ( a - OFF_SURF ) / ( SURF_MAX - OFF_SURF ) );

	}

	// (M13) the weather, as the wildlife takes it (WildlifeWeather.wildlifeMood): sharksAway, the
	// blacktips gone to deep water ahead of a blow. Any you're among swim off there; the rest, out of
	// range, aren't seen until it's eased, and are back at home then
	setWeather( sharksAway ) {

		if ( sharksAway === this.sharksAway ) return;
		this.sharksAway = sharksAway;
		for ( const g of this.groups ) {

			if ( ! g.storm ) continue;
			if ( g.active ) g.timer = 0;
			else if ( ! sharksAway && ! g.holding ) this.initGroup( g );

		}

	}

	offInWeather( g ) {

		return !! g.storm && this.sharksAway && Math.hypot( g.center.x - g.storm.x, g.center.z - g.storm.z ) > g.storm.r + 40;

	}

	// water deep enough for the species, clear of the breakers and of the reef framework ((M10) the
	// runners inside the breakers keep inside them as they move with the surf)
	fits( sp, zone, x, z ) {

		const d = this.depthAt( x, z ), k = sp.surf ? this.surf : 1;
		if ( d < zone.band[ 0 ] * k || d > zone.band[ 1 ] * k ) return false;
		if ( ! sp.surf && d < this.breakDepth( x, z ) + 0.3 ) return false;
		const floor = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
		return - floor > sp.minDepth + 0.3;

	}

	addGroup( name, count, zone ) {

		// (Salt Life: fewer fish in the big schools on low-powered devices)
		if ( count >= 20 ) count = Math.max( 8, Math.round( count * this.cfg.schools ) );
		const sp = BEHAVIOUR[ name ];
		const g = new Group( sp, count, this.n, zone, mulberry32( Math.floor( this.rng() * 1e9 ) ) );
		g.offAt = ( this.groups.length * 0.618034 ) % 1; // (M10: where it comes in the surf's share going off)
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

		// ---- (M16) the far water's: parked well off until you're out there (setFinds)
		this.farGroups = bay ? FAR.groups.map( ( [ name, count ], i ) => this.addGroup( name, count, { x: 0, z: 4000 + i * 200, r: BEHAVIOUR[ name ].homeRadius, band: BEHAVIOUR[ name ].band } ) ) : [];

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
		// ((M16) only a few mahi this close in: the most of them are out about the finds: FAR)
		place( 'mahi', 3, { x: 0, z: 420, r: 90 } );
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

		// (Salt Life) mullet and fry running the trough inside the breakers, along the main beach (its
		// waterline near z -42: wading depth out to z -20 or so)
		for ( const [ c, x ] of [ [ 9, - 95 ], [ 8, - 35 ], [ 10, 15 ], [ 7, 75 ], [ 9, 125 ] ] ) place( 'runnerMullet', c, { x, z: - 25, r: 26 } );
		for ( const [ c, x ] of [ [ 45, - 70 ], [ 40, - 10 ], [ 50, 40 ], [ 40, 100 ], [ 45, 140 ] ] ) place( 'runnerFry', c, { x, z: - 27, r: 24 } );
		// (Salt Life) more of the sea's life (placed last: the others keep their places). Mangrove
		// snappers round the piles, at the coral heads and in the bay; goliath groupers under the pier,
		// at a deep head and on the drop-off; cubera snappers on the drop-off; silk snappers over the
		// deep holes; white mullet along the shore; bonefish on the two flats (east of the bay, and off
		// the west point)
		const gray = place( 'pierGray', 10, pierZone, true );
		if ( gray ) gray.zone.piles = wet.filter( ( p ) => Math.hypot( p[ 0 ] - gray.home.x, p[ 1 ] - gray.home.z ) < 5 );
		if ( gray && ! gray.zone.piles.length ) gray.zone.piles = [ [ gray.home.x, gray.home.z ] ];
		for ( const c of [ 8, 6 ] ) place( 'graySnapper', c, reef, true );
		place( 'graySnapper', 7, { ...bayZone, band: [ 2.5, 8 ] } );
		place( 'goliathGrouper', 1, pierZone, true );
		place( 'goliathGrouper', 1, { ...reef, band: [ 7, 20 ] }, true );
		place( 'goliathGrouper', 1, { ...dropZone, r: 24 } );
		place( 'cuberaSnapper', 2, dropZone );
		place( 'silkSnapper', 6, { x: 5, z: 165, r: 40 } );
		place( 'silkSnapper', 7, { x: 0, z: 360, r: 90 } );
		for ( const c of [ 10, 8 ] ) place( 'whiteMullet', c, { x: 60, z: 10, r: 80 } );
		place( 'bonefish', 6, { x: 172, z: 136, r: 10 } );
		place( 'bonefish', 5, { x: - 374, z: 52, r: 16 } );
		// ((M16) the kayak's: redfish rooting on the same flats, a few, tails up; trout over the bay's shallow grass)
		place( 'redfish', 3, { x: 176, z: 128, r: 14 } );
		place( 'redfish', 2, { x: - 366, z: 46, r: 18 } );
		for ( const c of [ 5, 4 ] ) place( 'trout', c, { x: 50, z: 30, r: 60 } );
		// the sharks: reef sharks along the drop-off, blacktips off the bay's mouth and beyond, nurse
		// sharks on the reef's sand and under the pier's head
		for ( const c of [ 1, 2 ] ) {

			const s = place( 'reefShark', c, dropZone );
			if ( s ) s.zone.path = drop;

		}

		const tips = [ place( 'blacktipShark', 3, { x: 45, z: 125, r: 40 } ), place( 'blacktipShark', 2, { x: 0, z: 330, r: 80 } ) ];
		// ((M13) ahead of a blow they leave for deep water, out past the snappers' grounds, and come back
		// once it's eased: setWeather)
		for ( const g of tips ) {

			if ( ! g ) continue;
			const n = { x: g.home.x * 0.5, z: 470, r: 90, band: [ 18, 1e9 ] };
			n.home = new THREE.Vector3( n.x, this.depthFor( g.sp, n.x, n.z, 0.5 ), n.z );
			g.storm = n;

		}

		for ( let i = 0; i < 2; i ++ ) place( 'nurseShark', 1, { ...reef, r: this.radius, band: [ 3, 12 ], sand: true } );
		place( 'nurseShark', 1, { x: P.x, z: P.zEnd - 4, r: 8, band: [ 3, 10 ] } );
		// spiny lobsters in dens at the coral heads (initGroup: makeDen)
		for ( let i = 0; i < 10; i ++ ) {

			const g = place( 'lobster', i % 3 ? 1 : 2, reef, true );
			if ( g ) this.lobsterGroups.push( g );

		}

		// ---- (M15) the windward reef off the north-west point: its own reef fish; its groupers and snappers
		// bigger than the bay's (zone.big: their lengths), and its hogfish, yellowtail, parrotfish and
		// barracuda; jacks, a cubera or two, an eagle ray and a reef shark along its drop-off; its lobsters. (Placed
		// last: everyone else keeps their places)
		const N = this.north;
		if ( ! N ) return;
		const nr = { x: N.center.x, z: N.center.z, r: N.radius * 0.75, anchors: N.anchors };
		const big = ( zone, k = 1.3 ) => ( { ...zone, big: k } );
		for ( const c of [ 12, 10, 10 ] ) place( 'sergeant', c, nr, true );
		for ( const c of [ 24, 20, 22, 18 ] ) place( 'chromis', c, nr, true );
		for ( const c of [ 22, 18, 16 ] ) place( 'grunt', c, nr, true );
		for ( const c of [ 18, 14 ] ) place( 'yellowtail', c, big( nr, 1.15 ) );
		for ( const c of [ 16, 12 ] ) place( 'tang', c, nr );
		for ( const c of [ 12, 12, 10 ] ) place( 'wrasse', c, nr );
		for ( const c of [ 4, 4, 3 ] ) place( 'parrot', c, big( nr, 1.2 ) );
		for ( let i = 0; i < 3; i ++ ) place( 'angel', 2, nr, true );
		for ( let i = 0; i < 3; i ++ ) place( 'grouper', 1, big( nr ), true );
		for ( let i = 0; i < 3; i ++ ) place( 'barracuda', 1, big( nr, 1.2 ) );
		place( 'silverside', 140, nr );
		for ( const c of [ 3, 2, 2 ] ) place( 'hogfish', c, big( { ...nr, r: N.radius, sand: true }, 1.2 ) );
		for ( let i = 0; i < 5; i ++ ) place( 'blackGrouper', 1, big( nr ), true );
		for ( let i = 0; i < 5; i ++ ) place( 'lionfish', i % 2 ? 1 : 2, nr, true );
		for ( const c of [ 3, 3, 2 ] ) place( 'muttonSnapper', c, big( { ...nr, r: N.radius } ) );
		for ( const c of [ 6, 5 ] ) place( 'graySnapper', c, big( nr, 1.2 ), true );
		place( 'goliathGrouper', 1, { ...nr, band: [ 7, 20 ] }, true );
		const ndrop = this.dropOff( N.center, N.radius );
		const nmid = ndrop[ Math.floor( ndrop.length / 2 ) ] || [ nr.x, nr.z - nr.r ];
		const ndz = { x: nmid[ 0 ], z: nmid[ 1 ], r: 30, path: ndrop };
		for ( const c of [ 8, 6 ] ) {

			const g = place( 'jack', c, ndz );
			if ( g ) g.zone.path = ndrop;

		}

		place( 'cuberaSnapper', 2, big( ndz ) );
		for ( const name of [ 'eagleRay', 'reefShark' ] ) {

			const g = place( name, 1, ndz );
			if ( g ) g.zone.path = ndrop;

		}

		place( 'stingray', 1, { ...nr, r: N.radius, band: [ 3, 12 ], sand: true } );
		place( 'turtle', 1, { ...nr, r: N.radius, band: [ 3, 10 ] } );
		place( 'nurseShark', 1, { ...nr, r: N.radius, band: [ 3, 12 ], sand: true } );
		for ( let i = 0; i < 8; i ++ ) {

			const g = place( 'lobster', i % 3 ? 1 : 2, nr, true );
			if ( g ) this.lobsterGroups.push( g );

		}

		// ---- (M15) the wreck on it (wreck/WreckPlan.js): along its sides, as wreck fish keep station by the steel:
		// a goliath grouper (the wrecks' fish), black groupers, mutton and mangrove snappers, a barracuda hanging
		// over it, jacks, sergeant majors by the bow in the shallows, silversides in its lee
		if ( ! N.wreck || ! N.wreck.length ) return;
		const wx = N.wreck.reduce( ( a, p ) => a + p[ 0 ], 0 ) / N.wreck.length, wzc = N.wreck.reduce( ( a, p ) => a + p[ 1 ], 0 ) / N.wreck.length;
		const wz = { x: wx, z: wzc, r: 26, anchors: N.wreck };
		place( 'goliathGrouper', 1, { ...wz, band: [ 3, 14 ] }, true );
		for ( let i = 0; i < 2; i ++ ) place( 'blackGrouper', 1, big( wz ), true );
		for ( const c of [ 4, 3 ] ) place( 'muttonSnapper', c, big( wz ), true );
		for ( const c of [ 10, 8 ] ) place( 'graySnapper', c, big( wz, 1.2 ), true );
		place( 'barracuda', 1, big( wz, 1.25 ) );
		place( 'jack', 8, wz );
		place( 'sergeant', 14, { ...wz, band: [ 0.8, 4 ] }, true );
		place( 'silverside', 160, wz );

	}

	// ------------------------------------------------------------------ (M17) the flats' fish

	// the pool (fish/FlatsPool.js), each group parked well off until a school's given it
	layoutSight() {

		const P = FLATS_POOL[ this.tierName ], out = [];
		for ( const [ name, k ] of Object.entries( P.kinds ) ) for ( let i = 0; i < k.groups; i ++ ) {

			const g = this.addGroup( name, k.count, { x: 0, z: - 7000 - out.length * 40, r: 4, band: [ 0, 1e9 ] } );
			g.sight = null;
			out.push( g );

		}

		this.sightRange = P.range;
		return out;

	}

	// the schools within reach of you (game/Flats.js' flatsSchools, nearest first): each keeps the group it has, the rest
	// given one of their kind's that's free, and those whose school's gone (spooked, hooked out, out of reach, off the
	// flat) parked again once any run they're on is over
	setSight( schools ) {

		const G_ = this.sightGroups;
		if ( ! G_.length ) return;
		const want = this._want || ( this._want = new Map() );
		want.clear();
		for ( const q of schools ) want.set( q.id, q );
		for ( const g of G_ ) {

			const S = g.sight;
			if ( ! S ) continue;
			const q = want.get( S.id );
			if ( q && KIND_OF( q ) === g.sp.name ) {

				want.delete( S.id );
				this._sightTo( g, q );

			} else if ( S.bolt <= 0 ) this._park( g );
			else S.gone = true;

		}

		for ( const q of want.values() ) {

			const name = KIND_OF( q );
			const g = name && G_.find( ( h ) => h.sp.name === name && ! h.sight );
			if ( g ) this._sightNew( g, q );

		}

	}

	_park( g ) {

		g.sight = null;
		g.zone.x = 0;
		g.zone.z = - 7000 - this.sightGroups.indexOf( g ) * 40;
		g.home.set( g.zone.x, 0, g.zone.z );
		g.center.copy( g.home );
		for ( let k = 0; k < g.count; k ++ ) this.held[ g.offset + k ] = 2;
		g.active = false;

	}

	_sightNew( g, q ) {

		g.sight = { id: q.id, kind: q.kind, mode: q.mode, x: q.x, z: q.z, dx: q.dx, dz: q.dz, life: q.life, n: q.n, shown: 0, bolt: 0, bx: 0, bz: 0, follow: - 1, fx: 0, fz: 0, fv: 0, eat: false, gone: false, eaten: new Set(), seen: { body: 1, shadow: 1, tail: 1, sign: 1, mud: 1 }, age: 0, tx: q.x, tz: q.z, tAt: null };
		this._tailGround( g.sight, g.sp );
		g.zone.x = g.sight.tx;
		g.zone.z = g.sight.tz;
		g.home.set( g.zone.x, 0, g.zone.z );
		this.initGroup( g );
		const l = Math.hypot( q.dx, q.dz ) || 1;
		for ( let k = 0; k < g.count; k ++ ) {

			const i = g.offset + k;
			this.head.set( [ q.dx / l, 0, q.dz / l ], i * 3 );
			this.vel.set( [ q.dx / l * 0.05, 0, q.dz / l * 0.05 ], i * 3 );
			this.aux.fill( 0, i * 8, i * 8 + 8 );
			this.aux[ i * 8 ] = - 1 - g.rng() * 4;
			this.aux[ i * 8 + 2 ] = ROLL.every[ 0 ] * g.rng();

		}

		this._sightTo( g, q );
		this.resume( g );

	}

	// a school's anchor, its way and what it's doing, as game/Flats.js has it now; as many of its fish shown as it has
	_sightTo( g, q ) {

		const S = g.sight, l = Math.hypot( q.dx, q.dz ) || 1;
		S.mode = q.mode;
		S.x = q.x;
		S.z = q.z;
		S.dx = q.dx / l;
		S.dz = q.dz / l;
		S.life = q.life;
		S.n = q.n;
		this._tailGround( S, g.sp );
		const shown = Math.min( g.count, q.n );
		if ( shown === S.shown ) return;
		S.shown = shown;
		for ( let k = 0; k < g.count; k ++ ) if ( this.held[ g.offset + k ] !== 1 ) this.held[ g.offset + k ] = k < shown && ! S.eaten.has( k ) ? 0 : 2;

	}

	// (M17) where a tailing school roots: bonefish push up onto the shallowest of their ground to feed, their tails out in
	// a foot of water or less (the Florida Museum: feeding often in under 30 cm). The shallowest sand within TAIL.reach of
	// the anchor that's still water enough for them, nearest a foot deep; the anchor itself where there's none. Worked out
	// from the ground and the sea alone, so it's the same on every device
	// And the others: a kind that's too big for the water at its anchor (a tarpon laid up on the edge at low water, a
	// snook at the mangroves' foot) keeps to the nearest water deep enough for it (DEEP: its minDepth and this)
	_tailGround( S, sp ) {

		const sea = G.seaLevel.value;
		if ( S.tAt && Math.hypot( S.tAt[ 0 ] - S.x, S.tAt[ 1 ] - S.z ) < 3 && Math.abs( S.tAt[ 2 ] - sea ) < 0.04 ) return;
		S.tAt = [ S.x, S.z, sea ];
		if ( S.mode !== 'tail' ) {

			S.tx = S.x;
			S.tz = S.z;
			const need = sp.minDepth + DEEP;
			if ( sea - this.terrain.heightAt( S.x, S.z ) >= need ) return;
			for ( let r = 6; r <= 36; r += 6 ) {

				let bd = - Infinity;
				for ( let k = 0; k < 16; k ++ ) {

					const a = k / 16 * TAU, x = S.x + Math.cos( a ) * r, z = S.z + Math.sin( a ) * r, d = sea - this.terrain.heightAt( x, z );
					if ( d >= need && d > bd ) {

						bd = d;
						S.tx = x;
						S.tz = z;

					}

				}

				if ( bd > - Infinity ) return;

			}

			return;

		}

		let bx = S.x, bz = S.z, best = Math.abs( sea - this.terrain.heightAt( S.x, S.z ) - TAIL.depth );
		for ( let r = TAIL.reach / 3; r <= TAIL.reach + 1e-6; r += TAIL.reach / 3 ) for ( let k = 0; k < 16; k ++ ) {

			const a = k / 16 * TAU, x = S.x + Math.cos( a ) * r, z = S.z + Math.sin( a ) * r, d = sea - this.terrain.heightAt( x, z );
			if ( d < TAIL.least ) continue;
			const e = Math.abs( d - TAIL.depth ) + r * 0.003;
			if ( e < best ) {

				best = e;
				bx = x;
				bz = z;

			}

		}

		S.tx = bx;
		S.tz = bz;

	}

	// a school frightened (from ( x, z )): it bolts, each fish away from it at its burst, its wake seen, then it's gone
	sightBolt( g, x, z ) {

		const S = g.sight;
		if ( ! S || S.bolt > 0 ) return;
		// (away from it, toward the deepest water that way: a spooked school runs for the edge, not up onto the sand)
		const dx = g.center.x - x, dz = g.center.z - z, l = Math.hypot( dx, dz ) || 1, a0 = Math.atan2( dz / l, dx / l );
		let best = - Infinity, ba = a0;
		for ( const da of [ 0, - 0.5, 0.5, - 1, 1, - 1.4, 1.4 ] ) {

			const a = a0 + da, h = this.terrain.heightAt( g.center.x + Math.cos( a ) * 12, g.center.z + Math.sin( a ) * 12 );
			const score = - h - Math.abs( da ) * 0.15;
			if ( score > best ) {

				best = score;
				ba = a;

			}

		}

		S.bolt = BOLT;
		S.bx = Math.cos( ba );
		S.bz = Math.sin( ba );
		S.follow = - 1;
		if ( ! this.marks ) return;
		const sea = G.seaLevel.value;
		for ( let k = 0; k < S.shown; k ++ ) {

			const i = g.offset + k;
			if ( this.held[ i ] ) continue;
			const L = this.size[ i ];
			if ( sea - this.pos[ i * 3 + 1 ] < 0.6 + L * 0.3 ) {

				this.marks.ring( this.pos[ i * 3 ], sea + 0.012, this.pos[ i * 3 + 2 ], L * 1.2, 0.6 );
				if ( g.rng() < 0.35 ) this.splash( this.pos[ i * 3 ], this.pos[ i * 3 + 2 ], S.bx * 2, S.bz * 2, L, 0.25 );

			}

		}

	}

	// one of a school (its k-th shown fish) coming to a bait at ( x, z ), at `speed` m/s; eat: it stops on it
	sightFollow( g, k, x, z, speed, eat ) {

		const S = g.sight;
		if ( ! S ) return;
		S.follow = k;
		S.fx = x;
		S.fz = z;
		S.fv = speed;
		S.eat = eat;

	}

	// and how it ended: 'eat' (it's on the hook: not drawn with its school), 'refuse' (it turns off and goes back to
	// them) or 'spook' (and the school bolts)
	sightFollowEnd( g, act, x = 0, z = 0 ) {

		const S = g.sight;
		if ( ! S ) return;
		const k = S.follow;
		S.follow = - 1;
		if ( act === 'eat' && k >= 0 ) {

			S.eaten.add( k );
			this.held[ g.offset + k ] = 2;

		} else if ( act === 'spook' ) this.sightBolt( g, x, z );
		else if ( k >= 0 ) {

			// (a turn away, a short dash off the bait's line)
			const i = g.offset + k, side = g.rng() < 0.5 ? 1 : - 1, L = this.size[ i ], v = this.vel;
			v[ i * 3 ] += - S.dz * side * L * 2.5;
			v[ i * 3 + 2 ] += S.dx * side * L * 2.5;

		}

	}

	// the shown fish of a sight group: f( i, k ) for each (its fish index, and its place in the school)
	sightFish( g, f ) {

		const S = g.sight;
		if ( ! S ) return;
		for ( let k = 0; k < S.shown; k ++ ) if ( ! this.held[ g.offset + k ] ) f( g.offset + k, k );

	}

	// how far fish i's tail (or the top of its fins) is out of the water (m, 0: under it)
	sightOut( i ) {

		const L = this.size[ i ], y = this.pos[ i * 3 + 1 ], tilt = this.aux[ i * 8 + 1 ], sea = G.seaLevel.value;
		// (head down, the tail's tip up behind it; level, the dorsal's and the tail's tips about a fifth of it up)
		return Math.max( 0, y + Math.sin( Math.max( 0, tilt ) ) * L * 0.46 + L * 0.06 - sea, y + L * 0.17 - sea );

	}

	// how plainly fish i of group g is drawn: its school's coming and going, by what shows of it from above the water
	sightFade( g, i ) {

		const S = g.sight;
		if ( ! S ) return 0;
		// (coming into sight over a couple of seconds: back from a fright, or given its group in view)
		const life = ( S.bolt > 0 ? Math.min( 1, S.bolt / 1.2 ) * ( S.gone ? 1 : S.life ) : S.life ) * Math.min( 1, S.age / 2.5 );
		if ( G.cameraUnderwater.value > 0.5 ) return life;
		// (as plainly as it shows: one seen half the time is a ghost of itself, not a fish drawn whole: the grey ghost)
		const out = this.sightOut( i ), v = S.seen, k = Math.max( v.body, out > 0.01 ? v.tail * Math.min( 1, out / 0.06 ) : 0, S.bolt > 0 ? v.sign : 0 );
		const t = Math.min( 1, Math.max( 0, ( k - 0.3 ) / 0.7 ) );
		return life * t * t * ( 3 - 2 * t );

	}

	// their marks (fish/FlatsMarks.js): each shown fish's shadow on the sand, the muds where they root, their school's
	// sign on the water (nervous water as it cruises in shallow water, the wakes as it bolts), the rings where a tail's
	// out. seenAt( x, z, kind ) is the flats' sight (FlatsFishing): how plainly one shows there
	updateMarks( camera, dt ) {

		const any = this.sightGroups.some( ( g ) => g.sight && g.active );
		if ( ! any ) {

			if ( this.marks ) {

				if ( this.marks.muds.length || this.marks.rings.length ) {

					this.marks.begin();
					this.marks.end( dt, this.sightSeenAt );

				} else this.marks.hide();

			}

			return;

		}

		if ( ! this.marks ) this.marks = new FlatsMarks( this.group );
		const M = this.marks;
		// (a school come upon mudding has been at it a while: the water's milky about it already, older puffs settling)
		for ( const g of this.sightGroups ) if ( g.sight && g.sight.mode === 'feed' && ! g.sight.mudded && g.active ) {

			g.sight.mudded = true;
			for ( let k = 0; k < 26; k ++ ) {

				// (spread down the way the school's been going: the band it leaves behind it)
				const back = g.rng() * 14, a = g.rng() * TAU, r = Math.sqrt( g.rng() ) * ( g.sp.sight.spread[ 0 ] + 2 );
				const x = g.sight.tx - g.sight.dx * back + Math.cos( a ) * r, z = g.sight.tz - g.sight.dz * back + Math.sin( a ) * r;
				M.mud( x, this.terrain.heightAt( x, z ) + 0.025, z, 1.8, 0.75, g.rng() * MUD_LIFE * 0.85 );

			}

		}

		const sea = G.seaLevel.value, sun = G.sunDir.value, cp = camera.position, R = this.sightRange;
		const under = G.cameraUnderwater.value > 0.5;
		// (the sun's light under the water, bent toward the vertical: its way down, per m of depth)
		const sy = Math.max( 0.2, sun.y ), sh = Math.hypot( sun.x, sun.z ) / N_REFR, sl = Math.hypot( sh, Math.sqrt( 1 - Math.min( 1, sh * sh ) ) );
		const ex = - sun.x / Math.max( 1e-4, Math.hypot( sun.x, sun.z ) ) * sh / sl, ez = - sun.z / Math.max( 1e-4, Math.hypot( sun.x, sun.z ) ) * sh / sl, ey = Math.sqrt( 1 - Math.min( 1, sh * sh ) ) / sl;
		M.begin();
		for ( const g of this.sightGroups ) {

			const S = g.sight;
			if ( ! S || ! g.active || Math.hypot( g.center.x - cp.x, g.center.z - cp.z ) > R + g.radius ) continue;
			const v = S.seen, life = S.bolt > 0 ? Math.min( 1, S.bolt / 1.2 ) : S.life;
			let cruising = 0;
			this.sightFish( g, ( i ) => {

				const L = this.size[ i ], x = this.pos[ i * 3 ], y = this.pos[ i * 3 + 1 ], z = this.pos[ i * 3 + 2 ];
				const hx = this.head[ i * 3 ], hz = this.head[ i * 3 + 2 ], yaw = Math.atan2( hx, hz );
				const ground = this.terrain.heightAt( x, z ), up = Math.max( 0, y - ground );
				// its shadow: down along the sun's light from it to the bottom (none at night, or under a cloud: seen)
				if ( sun.y > 0.1 && up < 4 ) {

					const t = up / Math.max( 0.3, ey ), gx = x + ex * t, gz = z + ez * t;
					M.shadow( gx, this.terrain.heightAt( gx, gz ) + 0.03, gz, yaw, L * 1.05, L * 0.26 * ( g.sp.model === 'permit' ? 1.6 : 1 ), 0.62 * life * ( under ? 0.6 : v.shadow ) * Math.min( 1, sy * 1.6 ) );

				}

				// a mud as a bonefish roots head down in the soft bottom; a ring where a tail's broken the surface
				const k8 = i * 8;
				if ( S.mode === 'feed' && this.aux[ k8 ] > 0 && ( this.aux[ k8 + 4 ] -= dt ) <= 0 ) {

					this.aux[ k8 + 4 ] = 0.8 + g.rng() * 1.2;
					M.mud( x + hx * L * 0.45, ground + 0.025, z + hz * L * 0.45, L * 3.2, 0.75 * life );

				}

				const out = this.sightOut( i );
				if ( out > 0.02 && ( this.aux[ k8 + 5 ] -= dt ) <= 0 ) {

					this.aux[ k8 + 5 ] = 0.8 + g.rng() * 1.8;
					M.ring( x - hx * L * 0.35, sea + 0.012, z - hz * L * 0.35, L * 0.5, 0.55 * life );

				}

				// a wake, bolting or pushing water in a foot of it
				const depth = sea - ground, speed = Math.hypot( this.vel[ i * 3 ], this.vel[ i * 3 + 2 ] );
				if ( depth < 0.5 + L * 0.6 && speed > L * 1.5 ) M.sign( x + hx * L * 0.3, sea + 0.014, z + hz * L * 0.3, yaw, L * 3.2, L * 2.6, Math.min( 1, speed / ( L * 5 ) ) * life * ( under ? 0.5 : Math.max( v.sign, 0.5 * v.tail ) ), MARK_WAKE, i * 0.37 );
				if ( depth < 0.9 && speed > L * 0.25 ) cruising ++;

			} );
			// nervous water over a school cruising (or milling) just under a calm surface
			if ( cruising && S.bolt <= 0 && ( S.mode === 'cruise' || S.mode === 'mill' || S.mode === 'tail' ) ) {

				// (the patch the school's spread over, its ripples a hand's breadth or so whatever its size: FlatsMarks)
				const sz = Math.min( 5, Math.max( 2, g.sp.sight.spread[ 0 ] + 1 ) );
				M.sign( g.center.x, sea + 0.013, g.center.z, Math.atan2( S.dx, S.dz ), sz, sz * 0.8, life * ( under ? 0.4 : v.sign ) * Math.min( 1, cruising / 3 ) * ( S.mode === 'tail' ? 0.5 : 1 ), MARK_NERVOUS, g.offset * 0.13, sz );

			}

		}

		M.end( dt, this.sightSeenAt );

	}

	// The humpback (world/marine/Whale.js): its escort follows the posed body.
	setWhale( whale ) {

		this.whale = whale;

	}

	// Points along the reef's seaward slope (10 - 15 m deep), ordered along it. ((M15) about c, out to radius:
	// the bay's reef, or the windward one)
	dropOff( c = this.center, radius = this.radius ) {

		const pts = [];
		for ( let a = 0; a < 64; a ++ ) {

			const t = a / 64 * TAU;
			const dx = Math.cos( t ), dz = Math.sin( t );
			// walk outward from the reef centre to where the water gets 11 m deep
			for ( let r = 10; r < radius * 1.4; r += 2 ) {

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
			const L = ( sp.length[ 0 ] + ( sp.length[ 1 ] - sp.length[ 0 ] ) * rng() ) * ( g.zone.big || 1 );
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
			if ( sp.mode === 'lobster' ) this.makeDen( g, i );
			else if ( sp.mode === 'flats' ) this.aux[ i * 8 ] = - 2 - rng() * 8;

		}

		this.retarget( g, null );

	}

	// (Salt Life) lobster i's den: at the foot of a coral head near its group's home, backed in under
	// its edge and facing out (slot: x, z, the way it faces (rad), the sand's height there); on the sand
	// near the home where there's no head. Some are berried females (seed over 0.94: their eggs under
	// the tail, FishMaterial), the rest under 0.93
	makeDen( g, i ) {

		const rng = g.rng, L = this.size[ i ];
		// (its tail end under the coral behind it, its head and feelers out)
		let den = null;
		const a0 = rng() * TAU;
		for ( let k = 0; k < 16 && ! den; k ++ ) {

			const a = a0 + k / 16 * TAU, dx = Math.cos( a ), dz = Math.sin( a );
			let head = false;
			for ( let r = 0; r < 4; r += 0.12 ) {

				const x = g.home.x + dx * r, z = g.home.z + dz * r;
				const rise = this.floorAt( x, z ) - this.terrain.heightAt( x, z );
				if ( rise > 0.3 ) head = true;
				else if ( head && rise < 0.06 ) {

					den = [ x + dx * L * 0.1, z + dz * L * 0.1, a ];
					break;

				}

			}

		}

		if ( ! den ) den = [ g.home.x + ( rng() - 0.5 ) * 2, g.home.z + ( rng() - 0.5 ) * 2, rng() * TAU ];
		const [ x, z, a ] = den, sand = this.terrain.heightAt( x, z );
		this.slot.set( [ x, z, a, sand ], i * 4 );
		this.pos.set( [ x, sand + LOB_STAND * L, z ], i * 3 );
		this.prev.set( [ x, sand + LOB_STAND * L, z ], i * 3 );
		this.vel.set( [ 0, 0, 0 ], i * 3 );
		this.head.set( [ Math.cos( a ), 0, Math.sin( a ) ], i * 3 );
		this.seed[ i ] = rng() < 0.14 ? 0.94 + rng() * 0.055 : rng() * 0.93;
		const k = i * 8;
		this.aux.fill( 0, k, k + 8 );
		this.aux[ k ] = LOB.den;
		this.aux[ k + 1 ] = rng() * 30;
		this.aux[ k + 3 ] = - 1e9;
		this.aux[ k + 6 ] = 0.08;

	}

	// preferred swimming height at x, z: depth[ 0 .. 1 ] of the water column above the bottom
	depthFor( sp, x, z, k ) {

		const floor = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
		const ceil = sp.ceiling + G.seaLevel.value; // ((M13) under the sea as it is: a surge's, a drawdown's)
		// ((M16) the open water's: so far under the surface (m), however deep it is; a fraction of a thousand metres
		// would have them out of sight of anyone)
		if ( sp.under ) return Math.max( floor + 2, G.seaLevel.value - sp.under[ 0 ] - ( sp.under[ 1 ] - sp.under[ 0 ] ) * k );
		if ( sp.mode === 'surface' ) return ceil - 0.08;
		if ( sp.mode === 'glide' ) return floor + FLOOR_CLEARANCE + 0.15;
		const f = sp.depth[ 0 ] + ( sp.depth[ 1 ] - sp.depth[ 0 ] ) * k;
		return Math.min( ceil - 0.2, floor + FLOOR_CLEARANCE + 0.1 + Math.max( 0, ceil - floor ) * f );

	}

	clampY( sp, x, z, y ) {

		const h = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
		return Math.min( sp.ceiling + G.seaLevel.value - 0.02, Math.max( h + FLOOR_CLEARANCE + 0.02, y ) );

	}

	// (M16) what's found about you out there (game/Finds.js' findsAbout) and where you are ( x, z ): each far group that's
	// not about you goes to something near you of what it's after, if there is one
	setFinds( finds, at, hour ) {

		if ( ( this._farT = ( this._farT || 0 ) - 1 ) > 0 ) return;
		this._farT = 30; // (every so many of findsHere's)
		for ( const g of this.farGroups || [] ) {

			if ( Math.hypot( g.center.x - at.x, g.center.z - at.z ) < FAR.keep ) continue;
			const s = this.farSpot( g.sp.far, finds, at, hour, g );
			if ( ! s || s.key === g.farKey ) continue;
			g.farKey = s.key;
			g.zone.x = s.x;
			g.zone.z = s.z;
			g.home.set( s.x, 0, s.z );
			this.initGroup( g );

		}

	}

	// where a far group of this kind goes: { x, z }, or null
	farSpot( far, finds, at, hour, g ) {

		const offset = ( q, r ) => {

			const a = g.rng() * TAU, d = r * g.rng();
			return { x: q.x + Math.cos( a ) * d, z: q.z + Math.sin( a ) * d, key: q.n };

		};
		let best = null, bd = Infinity;
		const look = ( q, x, z, max ) => {

			const d = Math.hypot( x - at.x, z - at.z );
			if ( d < max && d < bd ) {

				bd = d;
				best = q;

			}

		};
		if ( far === 'debris' || far === 'wake' ) {

			const wake = far === 'wake';
			for ( const q of finds.debris ) if ( q.life > 0.4 && ( ! wake || q.storm ) ) look( q, q.x, q.z, wake ? FAR.near.wake : FAR.near.debris );
			if ( ! wake && ! best ) for ( const w of finds.weed ) if ( w.life > 0.4 ) {

				// (the nearest of a weedline)
				const ex = w.x1 - w.x0, ez = w.z1 - w.z0, t = Math.min( 1, Math.max( 0, ( ( at.x - w.x0 ) * ex + ( at.z - w.z0 ) * ez ) / Math.max( ex * ex + ez * ez, 1e-6 ) ) );
				const x = w.x0 + ex * t, z = w.z0 + ez * t;
				look( { x, z, n: w.n }, x, z, FAR.near.debris );

			}

			return best && offset( best, 10 );

		}

		if ( far === 'bait' ) {

			for ( const q of finds.bait ) if ( q.life > 0.3 ) look( q, q.x, q.z, FAR.near.bait );
			return best && offset( best, best.r || 20 );

		}

		// the open water's: a cell of a lattice about you, for so long, holds one or doesn't
		const dark = hour < 5.5 || hour > 19.5;
		if ( far === 'night' && ! dark ) return null;
		const i = Math.floor( at.x / FAR.cell ), j = Math.floor( at.z / FAR.cell ), e = Math.floor( this.time / FAR.every );
		const salt = ( Math.imul( i, 73856093 ) ^ Math.imul( j, 19349663 ) ^ Math.imul( e, 83492791 ) ^ g.offset ) >>> 0;
		if ( ( Math.imul( salt, 2654435761 ) >>> 0 ) / 4294967296 > ( far === 'night' ? FAR.night : FAR.open ) ) return null;
		const x = ( i + 0.5 ) * FAR.cell, z = ( j + 0.5 ) * FAR.cell;
		return this.depthAt( x, z ) > FAR.deep ? offset( { x, z, n: salt }, 120 ) : null;

	}

	// New goal for the group: wandering in its zone, along its path, or away from a threat.
	retarget( g, away ) {

		const sp = g.sp, rng = g.rng;
		// ((M17) the flats' go where their school does: stepGroup's sight)
		if ( sp.mode === 'sight' ) {

			g.goal.copy( g.home );
			g.timer = 1e9;
			return;

		}

		// (Salt Life) a group with a place for the night (the tarpon: under the pier's lamps) goes there once they're lit
		// ((M13) and one with a place to wait out the weather (the blacktips: deep water) goes there)
		const night = g.storm && this.sharksAway ? g.storm : g.night && this.lit > 0.5 ? g.night : null;
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

		const save = [ this.pos.slice(), this.vel.slice(), this.head.slice(), this.panic.slice(), this.jump.slice(), this.aux.slice() ];
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
		this.aux.set( save[ 5 ] );
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
			this.wary = wariness( dv.speed, G.murk.value );

		}

		if ( this.taken.size ) this.refill( player );
		if ( player ) {

			const sea = G.seaLevel.value;
			if ( player.y < sea - 0.1 ) threat = player;
			else {

				const ground = this.terrain.heightAt( player.x, player.z );
				if ( ground < sea - 0.2 && player.y - ground < 2.4 ) threat = _threat.set( player.x, Math.max( ground + 0.3, Math.min( sea - 0.3, player.y - 1.3 ) ), player.z );

			}

		}

		let any = false;
		for ( const g of this.groups ) {

			const was = g.active;
			if ( g.sp.mode === 'escort' || g.sp.mode === 'remora' ) {

				const w = this.whale;
				g.active = !! ( w && w.ready && ! w.gone ) && ( ! player || w.brain.position.distanceTo( player ) < SIM_RANGE + 20 );
				if ( g.active && ! was ) this.attachEscort( g );

			} else g.active = ( ! player || Math.hypot( g.center.x - player.x, g.center.z - player.z ) < SIM_RANGE + g.radius ) && ( was || ! this.offInSurf( g ) && ! this.offInWeather( g ) );
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
		if ( sp.mode === 'lobster' ) return this.stepLobster( g, dt, player );
		if ( sp.mode === 'escort' || sp.mode === 'remora' ) {

			if ( this.whale && this.whale.ready && g.attached ) this.stepEscort( g, dt );
			return;

		}

		const gx = g.goal.x - g.center.x, gz = g.goal.z - g.center.z;
		const roams = sp.mode !== 'mill' && sp.mode !== 'hover' && sp.mode !== 'pile' && sp.mode !== 'lurk' && sp.mode !== 'sight';
		// ((M17) a flats school's run, and its anchor as the island's clock moves it)
		const S = sp.mode === 'sight' ? g.sight : null;
		if ( S ) {

			if ( S.bolt > 0 && ( S.bolt -= dt ) <= 0 && S.gone ) return this._park( g );
			g.home.set( S.x, g.home.y, S.z );
			S.age += dt;

		}

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

				g.goal.set( g.center.x + g.heading.x * 4, sp.ceiling + G.seaLevel.value, g.center.z + g.heading.z * 4 );
				g.timer = 14;

			}

			if ( g.breath < - 12 ) {

				g.breath = 40 + g.rng() * 50;
				this.retarget( g, null );

			}

		}

		// stingray: rests on the sand now and then (a nurse shark, most of the time)
		if ( sp.mode === 'glide' ) {

			if ( g.rest > 0 ) g.rest -= dt;
			else if ( g.rng() < dt * sp.rests[ 0 ] ) g.rest = sp.rests[ 1 ] + g.rng() * sp.rests[ 2 ];

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

				g.goal.set( px + dx / dl * sp.curious, Math.min( sp.ceiling + G.seaLevel.value - 0.3, py ), pz + dz / dl * sp.curious );
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
		const X = this.aux, H = this.head;
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
				if ( y < G.seaLevel.value - 0.05 && vy < 0 ) {

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
			// ((M17) on a flat they keep apart side by side, not one over the other: there's no room; and one coming to a
			// bait has left its school)
			const lone = S && S.follow === a;
			let ax = lone ? 0 : A[ ai ] * sp.wSep, ay = sp.mode === 'sight' ? 0 : A[ ai + 1 ] * sp.wSep, az = lone ? 0 : A[ ai + 2 ] * sp.wSep;
			const c = lone ? 0 : C[ i ];
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
			const raid = this.raids.size ? this.raids.get( i ) : undefined;
			if ( raid ) {

				// (Salt Life) a thief after a speared or hooked fish: straight in at speed; once it has
				// it, off, away from the diver
				if ( ! raid.got ) {

					tx = raid.x;
					ty = raid.y;
					tz = raid.z;
					want = sp.burst * L * 0.6;
					if ( Math.hypot( tx - x, ty - y, tz - z ) < L * 0.4 + 0.2 ) raid.got = true;

				} else {

					const ox = x - ( player ? px : raid.x ), oz = z - ( player ? pz : raid.z ), ol = Math.hypot( ox, oz ) || 1;
					tx = x + ox / ol * 10;
					tz = z + oz / ol * 10;
					ty = y;
					want = sp.max * L;
					raid.off -= dt;
					if ( raid.off <= 0 ) this.raids.delete( i );

				}

			} else if ( sp.mode === 'mill' || sp.mode === 'pair' ) {

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
				ty = floor + FLOOR_CLEARANCE + 0.3 + ( sp.ceiling + G.seaLevel.value - floor ) * ( sp.depth[ 0 ] + ( sp.depth[ 1 ] - sp.depth[ 0 ] ) * ( ( s * 5.7 ) % 1 ) );

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
				ty = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) ) + 0.04 + ( sp.hug || 0 ) * L;
				want = 0;

			} else if ( sp.mode === 'sight' ) {

				// (M17) the flats' fish, about their school's anchor (setSight)
				const T = this._sightGoal( g, S, i, a, x, y, z, L, cruise, dt );
				tx = T.x;
				ty = T.y;
				tz = T.z;
				want = T.want;

			} else if ( sp.mode === 'flats' ) {

				// (Salt Life) bonefish: nosing along the bottom with the school; now and then one stops,
				// head down, rooting in the sand, its tail up (aux: the time left rooting, or to the next
				// as a negative; the tilt, for cull). Not while they're frightened
				const k8 = i * 8;
				let tt = X[ k8 ];
				if ( tt > 0 ) {

					tt -= dt;
					if ( tt <= 0 ) tt = - 3 - g.rng() * 8;

				} else {

					tt += dt;
					if ( tt >= 0 ) tt = 2 + g.rng() * 5;

				}

				if ( g.alarm > 0 || this.panic[ i ] > 0.05 ) tt = Math.min( tt, - 5 );
				X[ k8 ] = tt;
				X[ k8 + 1 ] += ( ( tt > 0 ? BONE_TILT : 0 ) - X[ k8 + 1 ] ) * Math.min( 1, dt * 2.5 );
				if ( tt > 0 ) {

					const ground = Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
					tx = x + H[ i3 ] * 0.05;
					tz = z + H[ i3 + 2 ] * 0.05;
					ty = ground + L * 0.37;
					want = cruise * 0.1;
					// its tail out of the water: a flick of spray now and then
					if ( ty + Math.sin( X[ k8 + 1 ] ) * L * 0.5 > - 0.03 && g.rng() < dt * 0.6 ) this.splash( x - H[ i3 ] * L * 0.4, z - H[ i3 + 2 ] * L * 0.4, 0, 0, L, 0.06 );

				}

			}

			let dx = tx - x, dy = ty - y, dz = tz - z;
			let dl = Math.sqrt( dx * dx + dy * dy + dz * dz ) + 1e-6;
			const arrive = raid && ! raid.got ? 1 : Math.min( 1, dl / Math.max( 0.3, S && S.follow === a ? L * 0.5 : L * 4 ) );
			// ((M17) a bolting flats fish is off at once, a fraction of a second to its burst; one going to a bait, keen)
			const kGoal = sp.wGoal * ( S ? ( S.bolt > 0 ? 7 : lone ? 2.5 : 1 ) : 1 );
			ax += ( dx / dl * want * arrive - vx ) * kGoal;
			ay += ( dy / dl * want * arrive - vy ) * kGoal;
			az += ( dz / dl * want * arrive - vz ) * kGoal;
			// ((M17) and a flats fish keeps to its height in the water whatever its way: down on the sand to root, up
			// through the surface to roll; the steering above gives a goal metres off only a hair of it)
			if ( S ) ay += ( ty - y ) * 4 - vy * 2;

			// flee from the diver (horizontally for fish near the surface)
			let panic = Math.max( 0, this.panic[ i ] - dt * 0.5 );
			if ( near && ! raid ) {

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

			if ( raid ) panic = Math.max( panic, 0.7 );
			this.panic[ i ] = panic;

			// bottom below (with look-ahead) and the surface above; the look-ups are refreshed every
			// fourth frame (staggered over the fish): fish move a few cm in between
			if ( ( ( this._frame + i ) & 3 ) === 0 || this.floorC[ i ] < - 999 ) {

				const lx = x + vx * 0.7, lz = z + vz * 0.7;
				this.floorC[ i ] = Math.max( this.floorAt( x, z ), this.floorAt( lx, lz ) );
				const deepAhead = G.seaLevel.value - this.terrain.heightAt( lx, lz );
				this.shallowC[ i ] = deepAhead < sp.minDepth || ( ! sp.surf && sp.mode !== 'sight' && deepAhead < this.breakDepthFast( lx, lz ) ) ? 1 : 0;

			}

			// (Salt Life: the bottom huggers, and bonefish on the flats, close over it)
			const clear = sp.hug ? 0.05 + sp.hug * L : sp.mode === 'glide' ? 0.03 : sp.mode === 'flats' || sp.mode === 'sight' ? 0.05 + L * 0.2 : FLOOR_CLEARANCE + L * 0.8;
			const floor = this.floorC[ i ] + clear;
			if ( y < floor ) ay += ( floor - y ) * 8;
			// shallow water ahead (or the breakers): turn back
			if ( this.shallowC[ i ] ) {

				ax -= vx * 3;
				az -= vz * 3;

			}

			const ceil = sp.ceiling + G.seaLevel.value + ( S && X[ i * 8 + 3 ] > 0 ? 0.5 : 0 ), under = sp.mode === 'flats' ? 0.08 : sp.mode === 'sight' ? 0.04 : 0.3;
			if ( y > ceil - under && ! ( sp.mode === 'jumper' && this.jump[ i ] > 0.5 ) ) ay -= ( y - ( ceil - under ) ) * 8;
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
			const vmin = sp.mode === 'hover' || sp.mode === 'solo' || sp.mode === 'mill' || sp.mode === 'lurk' || sp.mode === 'pile' || sp.mode === 'glide' || sp.mode === 'flats' || sp.mode === 'sight' ? 0.0 : cruise * 0.3;
			const sc = speed > vmax ? vmax / speed : ( speed < vmin ? vmin / speed : 1 );
			vx *= sc;
			vy *= sc;
			vz *= sc;
			if ( this.jump[ i ] < 0.5 ) {

				const hs = Math.sqrt( vx * vx + vz * vz );
				const vyMax = ( sp.mode === 'turtle' ? 0.3 : 0.15 ) + hs * 0.4 + ( S && X[ i * 8 + 3 ] > 0 ? 1.2 : 0 ); // ((M17) a tarpon rolling: up and over)
				vy = Math.max( - vyMax, Math.min( vyMax, vy ) );

			}

			let nx = x + vx * dt, nz = z + vz * dt;
			if ( this.shallowC[ i ] && G.seaLevel.value - this.terrain.heightAt( nx, nz ) < sp.minDepth ) {

				nx = x;
				nz = z;
				vx *= - 0.5;
				vz *= - 0.5;

			}

			const bottom = this.floorC[ i ] + ( sp.hug ? 0.02 + sp.hug * L : sp.mode === 'glide' ? 0.02 : sp.mode === 'flats' || sp.mode === 'sight' ? 0.03 + L * 0.1 : FLOOR_CLEARANCE );
			let ny = y + vy * dt;
			if ( this.jump[ i ] > 0.5 && ny > G.seaLevel.value - 0.25 ) {

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

	// (M17) where one of a flats school's fish makes for now, and how fast: { x, y, z, want }. Its place in the school
	// about the anchor (along its way and across it), and what the school's doing there: rooting head down (a tail up in
	// the shallowest, a mud in the softer), cruising on ahead, milling, lying still facing its way, rolling; or bolting,
	// or coming to a bait
	_sightGoal( g, S, i, a, x, y, z, L, cruise, dt ) {

		const T = this._sg || ( this._sg = { x: 0, y: 0, z: 0, want: 0 } ), X = this.aux, k8 = i * 8, sea = G.seaLevel.value;
		const Q = g.sp.sight, s = this.seed[ i ], H = this.head;
		const floor = this.floorC[ i ] > - 999 ? this.floorC[ i ] : this.terrain.heightAt( x, z ), col = Math.max( 0, sea - floor );
		const yIn = ( k ) => floor + 0.05 + L * 0.2 + Math.max( 0, col - 0.1 - L * 0.4 ) * k;
		let tilt = 0;
		if ( ! S ) {

			T.x = x;
			T.y = y;
			T.z = z;
			T.want = 0;
			return T;

		}

		if ( S.bolt > 0 ) {

			// off, away from what frightened them, fanning out a little, low
			T.x = x + S.bx * 30 + ( s - 0.5 ) * 8 * S.bz;
			T.z = z + S.bz * 30 - ( s - 0.5 ) * 8 * S.bx;
			T.y = yIn( 0.15 );
			T.want = g.sp.burst * L * 0.7;
			X[ k8 ] = Math.min( X[ k8 ], - 4 );
			X[ k8 + 3 ] = 0;
			this.panic[ i ] = 1;

		} else if ( S.follow === a ) {

			// to the bait, and onto it, nose down, if it'll eat it
			const d = Math.hypot( S.fx - x, S.fz - z );
			T.x = S.fx;
			T.z = S.fz;
			T.y = yIn( 0.1 );
			T.want = S.eat && d < L * 0.6 ? 0 : S.fv;
			X[ k8 ] = Math.min( X[ k8 ], - 2 );
			X[ k8 + 3 ] = 0;
			if ( S.eat && d < L * 0.9 ) tilt = 0.35;

		} else {

			const fx = S.dx, fz = S.dz, rx = fz, rz = - fx, t = this.time;
			const u = ( ( s * 7.31 ) % 1 - 0.5 ) * Q.spread[ 0 ] * 2 + Math.sin( t * 0.21 + s * 40 ) * Q.spread[ 0 ] * 0.3;
			const v = ( ( s * 3.17 + 0.5 ) % 1 - 0.5 ) * Q.spread[ 1 ] * 2 + Math.sin( t * 0.17 + s * 23 ) * Q.spread[ 1 ] * 0.3;
			const ox = S.tx, oz = S.tz;
			let px = ox + fx * u + rx * v, pz = oz + fz * u + rz * v;
			T.want = cruise;
			T.y = yIn( Q.y === 'bottom' ? 0.05 : Q.y === 'mid' ? 0.4 : 0.8 );
			const mode = S.mode;
			// (a permit cruising in shallow water stops now and then to tail on a crab, its black sickle up: guides' lore)
			const crabbing = Q.crabs && mode === 'cruise' && col < Q.crabs;
			if ( mode === 'tail' || mode === 'feed' || crabbing ) {

				// rooting head down in the sand a while, then on to the next spot: tails up where it's shallowest
				const R = ROOT[ crabbing ? 'crab' : mode ];
				let tt = X[ k8 ];
				if ( tt > 0 ) {

					tt -= dt;
					if ( tt <= 0 ) tt = - R[ 2 ] - g.rng() * ( R[ 3 ] - R[ 2 ] );

				} else {

					tt += dt;
					if ( tt >= 0 ) {

						tt = R[ 0 ] + g.rng() * ( R[ 1 ] - R[ 0 ] );
						// (each turns its own way to root, after what it's smelt: a school's tails point every way)
						X[ k8 + 6 ] = Math.atan2( H[ i * 3 + 2 ], H[ i * 3 ] ) + ( g.rng() - 0.5 ) * 3;

					}

				}

				X[ k8 ] = tt;
				if ( tt > 0 ) {

					// (head down as steeply as the water lets it: in a foot of it the tail's a hand's breadth out, the back
					// under; in deeper water its full tilt and the tail under too)
					px = x + Math.cos( X[ k8 + 6 ] ) * 0.05;
					pz = z + Math.sin( X[ k8 + 6 ] ) * 0.05;
					tilt = Math.max( 0.35, Math.min( R[ 4 ], Math.asin( Math.min( 1, ( col + 0.02 ) / ( 0.66 * L ) ) ) ) );
					T.y = floor + 0.08 + Math.sin( tilt ) * 0.2 * L;
					T.want = cruise * 0.1;

				} else T.want = cruise * ( Math.hypot( px - x, pz - z ) > 6 ? 1.6 : 0.6 );

			} else if ( mode === 'cruise' ) {

				px += fx * Q.ahead;
				pz += fz * Q.ahead;

			} else if ( mode === 'mill' ) {

				const ang = t * 0.12 * g.spin + s * TAU, r = Math.max( Q.spread[ 0 ], 2 ) * ( 0.4 + 0.6 * s );
				px = S.x + Math.cos( ang ) * r;
				pz = S.z + Math.sin( ang ) * r;
				T.want = cruise * 0.7;

			} else if ( mode === 'hold' || mode === 'laid' ) {

				// lying still, its nose a little ahead into its way (a snook into the current; a tarpon just under the top)
				px += fx * 0.6;
				pz += fz * 0.6;
				T.want = Math.hypot( px - x, pz - z ) > L ? cruise : cruise * 0.08;
				if ( mode === 'laid' ) T.y = sea - 0.22 - L * 0.06;

			} else if ( mode === 'roll' ) {

				// slowly about its hole a little under the top, and now and then up through the surface and over, gulping air
				px += fx * Math.sin( t * 0.05 + s * 9 ) * 6;
				pz += fz * Math.sin( t * 0.05 + s * 9 ) * 6;
				T.y = Math.max( yIn( 0.15 ), sea - ROLL.under - L * 0.1 );
				T.want = cruise * 0.7;
				let ph = X[ k8 + 3 ];
				if ( ph <= 0 && ( X[ k8 + 2 ] -= dt ) <= 0 ) ph = 0.001;
				if ( ph > 0 ) {

					const was = ph;
					ph += dt / ROLL.takes;
					px = x + H[ i * 3 ] * 3;
					pz = z + H[ i * 3 + 2 ] * 3;
					if ( ph < 0.42 ) {

						T.y = sea + 0.2;
						tilt = - 0.3;
						T.want = cruise * 3;

					} else if ( ph < 0.62 ) {

						T.y = sea - 0.06;
						tilt = 0.2;
						T.want = cruise * 2.5;
						if ( was < 0.42 ) this._rolled( x, z, L );

					} else {

						T.y = Math.max( yIn( 0.15 ), sea - ROLL.under - L * 0.1 );
						tilt = 0.55;
						T.want = cruise * 2;

					}

					if ( ph >= 1 ) {

						ph = 0;
						X[ k8 + 2 ] = ROLL.every[ 0 ] + g.rng() * ( ROLL.every[ 1 ] - ROLL.every[ 0 ] );

					}

					X[ k8 + 3 ] = ph;

				}

			}

			T.x = px;
			T.z = pz;

		}

		X[ k8 + 1 ] += ( tilt - X[ k8 + 1 ] ) * Math.min( 1, dt * 2.5 );
		return T;

	}

	// a tarpon's back and dorsal through the surface: its swirl and a splash
	_rolled( x, z, L ) {

		this.splash( x, z, 0, 0, L, 0.35 );
		if ( this.marks ) this.marks.ring( x, G.seaLevel.value + 0.012, z, L * 1.1, 0.8 );

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
			if ( this.held[ i ] ) continue;
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
			ty2 = Math.min( sp.ceiling + G.seaLevel.value - 0.2, Math.max( ballFloor, ty2 ) );
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
		_v.set( x, G.seaLevel.value + 0.02, z );
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
		const batch = this.batch, D = batch.records, C = this.cfg;
		const LOD_PX = C.lodPx === 1 ? LOD_PX0 : LOD_PX0.map( ( x ) => x * C.lodPx );
		const P = this.pos, V = this.vel, H = this.head, R = this.prev;
		const kHead = 1 - Math.exp( - dt * 6 ), kRoll = 1 - Math.exp( - dt * 3 );
		batch.begin();
		// ((M17) the flats' last, nearest first, through low's triangles: FlatsBudget)
		const S0 = this.sight0, SG = this.sightGroups, list = this.groups;
		const order = this._sightOrder || ( this._sightOrder = [] );
		order.length = 0;
		for ( const g of SG ) if ( g.active && g.sight ) {

			g._d = Math.hypot( g.center.x - cp.x, g.center.z - cp.z );
			order.push( g );

		}

		order.sort( ( a, b ) => a._d - b._d );
		const budget = SG.length ? ( this._budget || ( this._budget = new FlatsBudget( this.sightTris() ) ) ).begin( this.tierName ) : null;
		const nGroups = S0 + order.length;
		for ( let gi = 0; gi < nGroups; gi ++ ) {

			const g = gi < S0 ? list[ gi ] : order[ gi - S0 ];
			if ( ! g.active ) continue;
			const sp = g.sp, sight = gi >= S0, RANGE = sight ? this.sightRange : C.range;
			// whole group out of range / view (not while it has fish held: they're wherever they're held,
			// far from the rest)
			if ( ! g.holding ) {

				const gd = Math.hypot( g.center.x - cp.x, g.center.y - cp.y, g.center.z - cp.z );
				if ( gd > RANGE + g.radius ) continue;
				_sphere.center.copy( g.center );
				_sphere.radius = g.radius + 2;
				if ( ! _frustum.intersectsSphere( _sphere ) ) continue;

			}
			const turtle = sp.mode === 'turtle', ray = sp.model === 'stingray' || sp.model === 'eagleRay';
			const lob = sp.mode === 'lobster', flats = sp.mode === 'flats' || sight;
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

				// heading follows the velocity (slowly when hovering), pitch limited (a lobster's is its
				// own: it walks, turns on the spot and shoots off backward)
				let hx = H[ i3 ], hy = H[ i3 + 1 ], hz = H[ i3 + 2 ];
				if ( ! held && ! lob ) {

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
				// (Salt Life) a rooting bonefish waves its tail slowly; a lobster: its gait (amp: walk 0 .. 1,
				// bend: its tail's curl; the feelers sway on the same clock), kicking in the net
				const rooting = flats && this.aux[ i * 8 ] > 0;
				let freq = held ? sp.freq[ 0 ] * ( 1.2 + thrash * 3 ) : rest ? 0.15 : rooting ? sp.freq[ 0 ] * 0.4 : Math.min( 10, sp.freq[ 0 ] + sp.freq[ 1 ] * bl ) * ( airborne ? 2.5 : 1 );
				let amp = held ? sp.amp * ( 0.5 + thrash * 2.5 ) : rest ? sp.amp * 0.2 : rooting ? sp.amp * 0.8 : sp.amp * ( 0.55 + 0.45 * Math.min( 2.5, bl / Math.max( 0.2, sp.cruise ) ) + this.panic[ i ] * 0.5 );
				let bend = this.bend[ i ];
				if ( lob ) {

					const k8 = i * 8;
					amp = held ? 0.6 + 0.4 * thrash : this.aux[ k8 + 5 ];
					freq = 0.12 + amp * 1.3;
					bend = held ? 0.2 + 0.7 * thrash * ( 0.5 + 0.5 * Math.sin( this.time * 8 + i ) ) : this.aux[ k8 + 6 ];

				}

				const dPhase = dt * TAU * freq;
				this.phase[ i ] = ( this.phase[ i ] + dPhase ) % ( TAU * 64 );

				// cull: distance, size on screen and view frustum
				const dx = x - cp.x, dy = y - cp.y, dz = z - cp.z;
				const d = Math.sqrt( dx * dx + dy * dy + dz * dz );
				if ( d > RANGE + L ) continue;
				const px = L * pxScale / Math.max( d, 0.1 );
				if ( px < 1.2 ) continue;
				_sphere.center.set( x, y, z );
				_sphere.radius = L * 0.7;
				if ( ! _frustum.intersectsSphere( _sphere ) ) continue;

				// orientation: yaw from the heading, pitch (a rooting bonefish's nose down), bank into turns
				// ((M17) a flats fish rooting: its tilt alone, not the bob of its settling to the bottom as well)
				const rootPitch = sight && ! held && this.aux[ i * 8 ] > 0;
				yawPitchRoll( Math.atan2( hx, hz ), ( rootPitch ? 0 : - Math.asin( Math.max( - 1, Math.min( 1, hy ) ) ) ) + ( flats && ! held ? this.aux[ i * 8 + 1 ] : 0 ), this.roll[ i ], _q );

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
				D[ o + 10 ] = bend;
				D[ o + 11 ] = this.pattern[ i ] + this.seed[ i ] * 0.9;
				D[ o + 12 ] = x - R[ i3 ];
				D[ o + 13 ] = y - R[ i3 + 1 ];
				D[ o + 14 ] = z - R[ i3 + 2 ];
				D[ o + 15 ] = dPhase;
				// level of detail by size on screen, cross-faded (dithered) over a band before each
				// switch; faded out over the last tenth of the draw distance
				let lod = px > LOD_PX[ 0 ] ? 0 : px > LOD_PX[ 1 ] ? 1 : px > LOD_PX[ 2 ] ? 2 : 3;
				if ( sight ) {

					// ((M17) as plainly as it shows from above the water; a level finer than its size says (its fins and its tail
					// out are what's seen of it), low's triangles spent nearest first)
					const f = this.sightFade( g, i );
					if ( f <= 0.02 ) continue;
					lod = budget.take( sp.model, Math.max( 0, lod - 1 ) );
					if ( lod < 0 ) continue;
					const kf = this.kind[ i ] + lod, ff = f * ( d > RANGE * 0.9 ? 1 - bandFade( d, RANGE * 0.9, RANGE + L ) : 1 );
					// (where nothing's cross-faded, low, a fish is there or it isn't: a dithered one there is specks)
					if ( ! C.fades ) {

						if ( ff >= 0.5 ) batch.add( kf, i );

					} else if ( ff < 0.98 ) batch.addFade( kf, i, ff, false );
					else batch.add( kf, i );
					continue;

				}

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
		if ( SG.length ) this.updateMarks( camera, dt );

	}

	// (M17) the triangles of each of the flats' models at each level of detail (from the batch's kinds)
	sightTris() {

		const out = {}, K = this.batch.kinds;
		for ( const g of this.sightGroups ) {

			const m = g.sp.model, k0 = this.modelKind[ m ];
			if ( out[ m ] ) continue;
			out[ m ] = [ 0, 1, 2, 3 ].map( ( l ) => Math.round( K[ k0 + l ].count / 3 ) );

		}

		return out;

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
		if ( S.creature === 'lobster' ) h = { cz: 0, hl: 0.48, cy: 0.03, hh: 0.08, hw: 0.12 }; // (Salt Life) its shell, on its legs
		else if ( ! S.top ) h = { cz: 0, hl: 0.5, cy: 0, hh: 0.06, hw: 0.4 }; // rays and the turtle (flat)
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
			this.groupOf[ i ].holding ++;
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
		if ( this.held[ i ] === 1 ) this.groupOf[ i ].holding --;
		this.held[ i ] = 0;
		this.inNet[ i ] = 0;
		const sp = this.groupOf[ i ].sp;
		this.vel[ i3 ] = this.head[ i3 ] * sp.burst * L;
		this.vel[ i3 + 1 ] = 0;
		this.vel[ i3 + 2 ] = this.head[ i3 + 2 ] * sp.burst * L;
		this.panic[ i ] = 1;

	}

	// landed: gone from the water until its place is filled, a few minutes on, out of sight
	take( i ) {

		if ( this.held[ i ] === 1 ) this.groupOf[ i ].holding --;
		this.held[ i ] = 2;
		this.inNet[ i ] = 0;
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
			// (Salt Life) another lobster in the den, of its own size
			if ( sp.mode === 'lobster' ) {

				this.size[ i ] = ( sp.length[ 0 ] + ( sp.length[ 1 ] - sp.length[ 0 ] ) * Math.random() ) * ( g.zone.big || 1 );
				this.makeDen( g, i );

			}

		}

	}

	// a fright at x, y, z (a shot, a speared fish thrashing): the fish within r scatter, and stay wary.
	// (Salt Life) A cruising shark comes to see what the commotion is (from further off); a lobster out
	// of its den shoots off
	startle( x, y, z, r ) {

		for ( const g of this.groups ) {

			if ( ! g.active ) continue;
			const gd = Math.hypot( g.center.x - x, g.center.y - y, g.center.z - z );
			if ( g.sp.rule === 'shark' && g.sp.mode === 'cruise' ) {

				if ( gd < 35 && g.alarm <= 0 ) {

					const dx = g.center.x - x, dz = g.center.z - z, dl = Math.hypot( dx, dz ) || 1;
					g.goal.set( x + dx / dl * 5, this.clampY( g.sp, x, z, y ), z + dz / dl * 5 );
					g.timer = 8;

				}

				continue;

			}

			if ( gd > r + g.radius ) continue;
			if ( g.sp.mode === 'lobster' ) {

				for ( let k = 0; k < g.count; k ++ ) {

					const i = g.offset + k;
					if ( ! this.held[ i ] && this.aux[ i * 8 ] !== LOB.den && Math.hypot( this.pos[ i * 3 ] - x, this.pos[ i * 3 + 2 ] - z ) < r ) this.flipFrom( i, x, z );

				}

				continue;

			}

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

	// ------------------------------------------------------------------ (Salt Life) the cast net

	// It's landed on the water (game/CastNet.js: its footprint; the net's stats, Gear.js): the fish under
	// it are inside it now, and the rest nearby scatter. -> how many are under it
	netLand( fp, gear, waterY = 0 ) {

		this.netEnd();
		// (out: how many got away, and how: under the lead line, leapt clear, too big for it, through the mesh)
		const net = this.net = { list: [], holdM: gear.holdCm / 100, slipM: gear.meshCm * 0.035, t: 0, sealed: false, out: { under: 0, leapt: 0, big: 0, mesh: 0 } };
		for ( const g of this.groups ) {

			if ( ! g.active || g.sp.mode === 'escort' || g.sp.mode === 'remora' ) continue;
			if ( Math.hypot( g.center.x - fp.x, g.center.z - fp.z ) > fp.r + g.radius + 1 ) continue;
			for ( let k = 0; k < g.count; k ++ ) {

				const i = g.offset + k, i3 = i * 3;
				if ( this.held[ i ] || this.jump[ i ] > 1.5 ) continue;
				if ( Math.hypot( this.pos[ i3 ] - fp.x, this.pos[ i3 + 2 ] - fp.z ) > fp.r * NET_EDGE ) continue;
				this.inNet[ i ] = 1;
				net.list.push( i );

			}

		}

		this.startle( fp.x, waterY - 0.3, fp.z, fp.r + 2.5 );
		return net.list.length;

	}

	// Each frame while it's in the water. The netting is a cone from the horn down to the lead line: a
	// fish inside it is kept inside, and makes for the edge; one that gets there below the lead line's
	// height slips out under it, until the lead line is on the bottom or drawn closed (then it's sealed).
	// One too long for the net tears out through it; one small enough slips through the mesh.
	// -> how many are inside
	netStep( fp, dt ) {

		const net = this.net;
		if ( ! net ) return 0;
		net.t += dt;
		const was = net.sealed;
		const sealed = net.sealed = net.sealed || fp.onFloor > 0.7 || fp.purse > 0.4;
		// drawn closed before it's on the bottom, the purse is the netting above the lead line: a fish
		// below it then isn't in it
		const pursedOver = sealed && ! was && fp.onFloor <= 0.7;
		const P = this.pos, V = this.vel, list = net.list;
		const top = Math.max( fp.top, fp.lead + 0.05 );
		let n = 0;
		for ( let k = list.length - 1; k >= 0; k -- ) {

			const i = list[ k ], i3 = i * 3;
			if ( ! this.inNet[ i ] || this.held[ i ] === 2 ) {

				list.splice( k, 1 );
				continue;

			}

			n ++;
			if ( this.held[ i ] ) continue; // in the purse (the game holds it there)
			const L = this.size[ i ], sp = this.groupOf[ i ].sp, s = this.seed[ i ];
			if ( ( L > net.holdM && net.t > 0.6 + s ) || L < net.slipM ) {

				this.netFree( i, k );
				net.out[ L < net.slipM ? 'mesh' : 'big' ] ++;
				n --;
				continue;

			}

			const y = P[ i3 + 1 ];
			let dx = P[ i3 ] - fp.x, dz = P[ i3 + 2 ] - fp.z;
			const d = Math.hypot( dx, dz ) || 1e-4;
			dx /= d;
			dz /= d;
			if ( ( ! sealed && y < fp.lead + L * 0.5 && d > fp.r * NET_EDGE ) || ( pursedOver && y < fp.lead - L * 0.5 ) ) {

				this.netFree( i, k );
				net.out.under ++;
				n --;
				continue;

			}

			// a mullet may leap clear of it as it settles
			if ( ! sealed && sp.mode === 'jumper' && s > 0.45 && this.jump[ i ] === 0 && Math.random() < dt * 0.9 ) {

				this.netFree( i, k );
				net.out.leapt ++;
				this.jump[ i ] = 1;
				V[ i3 ] += dx * 1.2;
				V[ i3 + 2 ] += dz * 1.2;
				n --;
				continue;

			}

			// the cone's radius at the fish's height (all of it below the lead line)
			const f = Math.min( 1, Math.max( 0, ( top - y ) / Math.max( 0.05, top - fp.lead ) ) );
			const rc = Math.max( 0.05, ( y < fp.lead ? fp.r : fp.r * f ) - L * 0.3 );
			if ( d > rc ) {

				P[ i3 ] = fp.x + dx * rc;
				P[ i3 + 2 ] = fp.z + dz * rc;
				// it bounces off the netting
				const vo = V[ i3 ] * dx + V[ i3 + 2 ] * dz;
				if ( vo > 0 ) {

					V[ i3 ] -= dx * vo * 1.6;
					V[ i3 + 2 ] -= dz * vo * 1.6;

				}

			}

			if ( y > top - L * 0.3 ) P[ i3 + 1 ] = top - L * 0.3;
			// until it's sealed: turned in by the splashes, then a dash for the edge, low (some keep their
			// heads; some just circle)
			if ( ! sealed && net.t < NET_TURN[ 0 ] + ( NET_TURN[ 1 ] - NET_TURN[ 0 ] ) * s ) {

				const a = sp.burst * L * 2 * dt;
				V[ i3 ] -= dx * a;
				V[ i3 + 2 ] -= dz * a;

			} else if ( ! sealed ) {

				const a = sp.burst * L * ( s > 0.35 ? 4 : 1.2 ) * dt;
				V[ i3 ] += dx * a;
				V[ i3 + 2 ] += dz * a;
				V[ i3 + 1 ] -= a * 0.5;

			}

			this.panic[ i ] = Math.max( this.panic[ i ], sealed ? 0.6 : 1 );

		}

		return n;

	}

	netFree( i, k = - 1 ) {

		this.inNet[ i ] = 0;
		if ( k >= 0 && this.net ) this.net.list.splice( k, 1 );
		this.panic[ i ] = 1;

	}

	// the fish inside it (swimming, or held in its purse)
	netFish() {

		return this.net ? this.net.list.filter( ( i ) => this.inNet[ i ] && this.held[ i ] !== 2 ) : [];

	}

	// a fish out of the purse, let go at x, y, z with velocity v: out of the water it falls back in (a
	// splash), in it it's off at speed
	netRelease( i, x, y, z, v ) {

		const i3 = i * 3, g = this.groupOf[ i ];
		if ( this.held[ i ] === 1 ) g.holding --;
		this.held[ i ] = 0;
		this.inNet[ i ] = 0;
		this.pos[ i3 ] = x;
		this.pos[ i3 + 1 ] = y;
		this.pos[ i3 + 2 ] = z;
		this.prev[ i3 ] = x;
		this.prev[ i3 + 1 ] = y;
		this.prev[ i3 + 2 ] = z;
		this.vel[ i3 ] = v.x;
		this.vel[ i3 + 1 ] = v.y;
		this.vel[ i3 + 2 ] = v.z;
		this.panic[ i ] = 1;
		if ( y > G.seaLevel.value - 0.05 ) {

			if ( g.sp.mode === 'bait' ) this.pos[ i3 + 1 ] = G.seaLevel.value - 0.3; // (the bait ball's steering has no flight)
			else this.jump[ i ] = 2;

		}

	}

	// the net's out of the water: whatever's still inside is let go
	netEnd() {

		if ( ! this.net ) return;
		for ( const i of this.net.list ) this.inNet[ i ] = 0;
		this.net = null;

	}


	// ------------------------------------------------------------------ (Salt Life) thieves

	// a thief (sp.thief: a shark, a goliath) within its reach of x, y, z: { i, chance, dist } for the
	// nearest, or null
	thiefNear( x, y, z ) {

		let best = null, bd = Infinity;
		for ( const g of this.groups ) {

			const th = g.sp.thief;
			if ( ! th || ! g.active || Math.hypot( g.center.x - x, g.center.y - y, g.center.z - z ) > th[ 0 ] + g.radius ) continue;
			for ( let k = 0; k < g.count; k ++ ) {

				const i = g.offset + k;
				if ( this.held[ i ] || this.raids.has( i ) ) continue;
				const d = Math.hypot( this.pos[ i * 3 ] - x, this.pos[ i * 3 + 1 ] - y, this.pos[ i * 3 + 2 ] - z );
				if ( d < th[ 0 ] && d < bd ) {

					bd = d;
					best = { i, chance: th[ 1 ], dist: d };

				}

			}

		}

		return best;

	}

	// thief i comes for the fish at x, y, z: the raid { x, y, z (where the fish is: the caller keeps it
	// up to date), got (it has it: it keeps going, away from the diver) }
	raid( i, x, y, z ) {

		const r = { x, y, z, got: false, off: RAID_OFF };
		this.raids.set( i, r );
		return r;

	}

	// the fish was landed first (or lost): the thief turns away
	endRaid( i ) {

		const r = this.raids.get( i );
		if ( r ) r.got = true;

	}

	// ------------------------------------------------------------------ (Salt Life) spiny lobsters

	// Each lobster (aux: its state (LOB), a timer, how far it's been coaxed 0 .. 1, where it's walking
	// (x, z; in its den: when it was last tickled), its gait 0 .. 1 and its tail's curl (rad) (cull),
	// the clock of a tail flip; slot: its den, makeDen). By day it sits backed into its den, feelers
	// out; after dark it walks out over the reef to forage, and is home by dawn. Tickled (tickle) it
	// walks out of the den into the open; in the open, a diver coming at it (or a miss with the net)
	// and it shoots off backward with strokes of its tail, settles, and walks home.
	stepLobster( g, dt, player ) {

		const sp = g.sp, X = this.aux, S = this.slot, P = this.pos, V = this.vel, H = this.head, rng = g.rng;
		const fleeR = sp.flee * this.wary * ( 1 + g.spooked / SPOOKED );
		for ( let a = 0; a < g.count; a ++ ) {

			const i = g.offset + a, i3 = i * 3, i4 = i * 4, k = i * 8;
			if ( this.held[ i ] ) continue;
			const L = this.size[ i ];
			const x0 = P[ i3 ], y0 = P[ i3 + 1 ], z0 = P[ i3 + 2 ];
			// out after dark (each at its own hour)
			const late = ( this.seed[ i ] * 7.3 ) % 1;
			const night = this.hour < LOB_NIGHT[ 0 ] - late * 0.8 || this.hour > LOB_NIGHT[ 1 ] + late;
			if ( player && X[ k ] !== LOB.den && X[ k ] !== LOB.flip && Math.hypot( player.x - x0, player.y - y0, player.z - z0 ) < fleeR ) this.flipFrom( i, player.x, player.z );

			// ---- what it's doing
			let st = X[ k ];
			const timer = ( X[ k + 1 ] -= dt );
			const tickled = st === LOB.den && this.time - X[ k + 3 ] < 0.25;
			if ( st === LOB.den ) {

				if ( ! tickled ) X[ k + 2 ] = Math.max( 0, X[ k + 2 ] - dt * 0.12 );
				if ( X[ k + 2 ] >= 1 ) st = this.lobsterTo( i, LOB.out, 9 + rng() * 6 );
				else if ( night && timer <= 0 ) st = this.lobsterTo( i, LOB.forage, 60 + rng() * 120 );

			} else if ( st === LOB.forage ) {

				if ( ! night || timer <= 0 ) st = this.lobsterTo( i, LOB.home, 0 );
				else if ( Math.hypot( X[ k + 3 ] - x0, X[ k + 4 ] - z0 ) < 0.08 ) this.lobsterWander( i, rng );

			} else if ( st === LOB.out ) {

				if ( timer <= 0 ) st = this.lobsterTo( i, LOB.home, 0 );

			} else if ( st === LOB.flip ) {

				if ( X[ k + 7 ] > FLIP_S ) st = this.lobsterTo( i, LOB.home, 1.5 + rng() * 2 );

			} else if ( Math.hypot( S[ i4 ] - x0, S[ i4 + 1 ] - z0 ) < 0.06 ) st = this.lobsterTo( i, LOB.den, 20 + rng() * 60 );

			// ---- how it moves
			let x = x0, z = z0, hx = H[ i3 ], hz = H[ i3 + 2 ];
			let walk = 0, curl = 0.08, lift = 0;
			if ( st === LOB.flip ) {

				// backward, tail first, in strokes of its tail: up off the bottom and down again (its head
				// turning, at first, to the fright)
				const c = ( X[ k + 7 ] += dt ), u = Math.min( 1, c / FLIP_S );
				const dx = X[ k + 3 ] - x, dz = X[ k + 4 ] - z, dl = Math.hypot( dx, dz );
				if ( dl > 1e-3 && c < 0.25 ) {

					const kk = Math.min( 1, dt * 14 );
					hx += ( dx / dl - hx ) * kk;
					hz += ( dz / dl - hz ) * kk;
					const hl = Math.hypot( hx, hz ) || 1;
					hx /= hl;
					hz /= hl;

				}

				const v = 2.6 * ( 1 - u ) + 0.15;
				x -= hx * v * dt;
				z -= hz * v * dt;
				lift = Math.sin( Math.PI * u ) * 0.35;
				curl = 0.15 + 0.9 * ( 0.5 - 0.5 * Math.cos( c * TAU * 4.5 ) );

			} else {

				// walking: it turns toward where it's going (in its den, to face out of it), and walks
				// once it faces it; it shuffles while it's tickled
				let tx = X[ k + 3 ], tz = X[ k + 4 ], speed = 0, face = null;
				if ( st === LOB.den ) {

					tx = S[ i4 ];
					tz = S[ i4 + 1 ];
					face = S[ i4 + 2 ];
					speed = 0.04;
					if ( tickled ) walk = 0.35;

				} else if ( st === LOB.forage ) speed = 0.1 * Math.max( 0, Math.sin( this.time * 0.35 + i * 1.7 ) );
				else if ( st === LOB.out ) speed = 0.07;
				else {

					tx = S[ i4 ];
					tz = S[ i4 + 1 ];
					speed = timer > 0 ? 0 : 0.1;

				}

				const dx = tx - x, dz = tz - z, dl = Math.hypot( dx, dz );
				const going = speed > 0 && dl > 0.03;
				const want = going ? Math.atan2( dz, dx ) : face;
				if ( want !== null ) {

					const cur = Math.atan2( hz, hx );
					let d = want - cur;
					d -= Math.round( d / TAU ) * TAU;
					const turn = Math.max( - 1.6 * dt, Math.min( 1.6 * dt, d ) );
					hx = Math.cos( cur + turn );
					hz = Math.sin( cur + turn );
					if ( Math.abs( d ) > 0.05 ) walk = Math.max( walk, 0.45 );
					if ( going && Math.abs( d ) < 0.6 ) {

						const step = Math.min( dl, speed * dt * Math.cos( d ) );
						x += hx * step;
						z += hz * step;
						walk = Math.max( walk, Math.min( 1, speed / 0.07 ) );

					}

				}

			}

			// on its legs on the bottom (in the den, on the sand under the coral's edge)
			const ground = st === LOB.den ? S[ i4 + 3 ] : Math.max( this.terrain.heightAt( x, z ), this.floorAt( x, z ) );
			const y = Math.min( y0 + ( ground + LOB_STAND * L + lift - y0 ) * Math.min( 1, dt * 6 ), G.seaLevel.value - 0.1 );
			X[ k + 5 ] += ( walk - X[ k + 5 ] ) * Math.min( 1, dt * 5 );
			X[ k + 6 ] += ( curl - X[ k + 6 ] ) * Math.min( 1, dt * ( st === LOB.flip ? 30 : 4 ) );
			P[ i3 ] = x;
			P[ i3 + 1 ] = y;
			P[ i3 + 2 ] = z;
			V[ i3 ] = ( x - x0 ) / dt;
			V[ i3 + 1 ] = ( y - y0 ) / dt;
			V[ i3 + 2 ] = ( z - z0 ) / dt;
			H[ i3 ] = hx;
			H[ i3 + 1 ] = 0;
			H[ i3 + 2 ] = hz;

		}

	}

	// lobster i on to state st (LOB), for timer s; returns st
	lobsterTo( i, st, timer ) {

		const X = this.aux, S = this.slot, k = i * 8, i4 = i * 4;
		X[ k ] = st;
		X[ k + 1 ] = timer;
		if ( st === LOB.out ) {

			// a body length or so out of the den, the way it faces
			const d = 0.3 + 0.9 * this.size[ i ];
			X[ k + 3 ] = S[ i4 ] + Math.cos( S[ i4 + 2 ] ) * d;
			X[ k + 4 ] = S[ i4 + 1 ] + Math.sin( S[ i4 + 2 ] ) * d;

		} else if ( st === LOB.forage ) this.lobsterWander( i, this.groupOf[ i ].rng );
		else if ( st === LOB.den ) {

			X[ k + 2 ] = 0;
			X[ k + 3 ] = - 1e9;

		}

		return st;

	}

	// somewhere for lobster i to walk to, a few metres round its den
	lobsterWander( i, rng ) {

		const S = this.slot, i4 = i * 4, k = i * 8;
		for ( let t = 0; t < 8; t ++ ) {

			const a = rng() * TAU, r = 0.6 + rng() * 3;
			const x = S[ i4 ] + Math.cos( a ) * r, z = S[ i4 + 1 ] + Math.sin( a ) * r;
			if ( this.depthAt( x, z ) < 1.5 ) continue;
			this.aux[ k + 3 ] = x;
			this.aux[ k + 4 ] = z;
			return;

		}

		this.aux[ k + 3 ] = S[ i4 ];
		this.aux[ k + 4 ] = S[ i4 + 1 ];

	}

	// lobster i shoots off backward, away from fx, fz
	flipFrom( i, fx, fz ) {

		const k = i * 8;
		this.aux[ k ] = LOB.flip;
		this.aux[ k + 1 ] = 0;
		this.aux[ k + 3 ] = fx;
		this.aux[ k + 4 ] = fz;
		this.aux[ k + 7 ] = 0;

	}

	// what lobster i is doing, for the game: 'den', 'out' (in the open) or 'flip' (shooting off)
	lobsterState( i ) {

		const s = this.aux[ i * 8 ];
		return s === LOB.den ? 'den' : s === LOB.flip ? 'flip' : 'out';

	}

	// the lobster in front of a diver at pos looking along dir (unit) whose head is the nearest, within
	// reach (m): { i, dist, state }, or null
	nearLobster( pos, dir, reach ) {

		let best = null, bd = reach;
		for ( const g of this.lobsterGroups ) {

			if ( ! g.active ) continue;
			for ( let k = 0; k < g.count; k ++ ) {

				const i = g.offset + k, i3 = i * 3;
				if ( this.held[ i ] ) continue;
				const L = this.size[ i ];
				const hx = this.pos[ i3 ] + this.head[ i3 ] * L * 0.4 - pos.x, hy = this.pos[ i3 + 1 ] - pos.y, hz = this.pos[ i3 + 2 ] + this.head[ i3 + 2 ] * L * 0.4 - pos.z;
				const d = Math.hypot( hx, hy, hz );
				if ( d >= bd || hx * dir.x + hy * dir.y + hz * dir.z < d * 0.8 ) continue;
				bd = d;
				best = { i, dist: d, state: this.lobsterState( i ) };

			}

		}

		return best;

	}

	// the tickle stick worked at lobster i's den this frame (rate: its share of the coaxing a second):
	// how far it's coaxed out, 0 .. 1 (1: it's walking out, or isn't in its den)
	tickle( i, dt, rate ) {

		const X = this.aux, k = i * 8;
		if ( X[ k ] !== LOB.den ) return 1;
		X[ k + 3 ] = this.time;
		X[ k + 2 ] = Math.min( 1, X[ k + 2 ] + dt * rate );
		return X[ k + 2 ];

	}

	// the net swept over lobster i: in it (held: the game poses it in the net, hold), or missed, and it
	// shoots off away from fx, fz
	netLobster( i, ok, fx, fz ) {

		if ( ok ) {

			this.held[ i ] = 1;
			this.panic[ i ] = 1;
			return true;

		}

		this.flipFrom( i, fx, fz );
		this.groupOf[ i ].spooked = SPOOKED;
		return false;

	}

	// a lobster let go from the net (short, berried, or the day's bag full): off it shoots, and home
	letGo( i, fx, fz ) {

		this.held[ i ] = 0;
		this.flipFrom( i, fx, fz );

	}

	// a berried female (her eggs under her tail): one to let go
	berried( i ) {

		return this.seed[ i ] > 0.935;

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
// distance; (M11) nearer in murky water (murk 0..1: MURK_WARY of it at the murkiest)
export function wariness( speed, murk = 0 ) {

	const sight = 1 - ( 1 - MURK_WARY ) * Math.min( 1, Math.max( 0, murk ) );
	if ( speed <= WARY[ 0 ][ 0 ] ) return WARY[ 0 ][ 1 ] * sight;
	for ( let k = 1; k < WARY.length; k ++ ) {

		if ( speed <= WARY[ k ][ 0 ] ) {

			const [ s0, w0 ] = WARY[ k - 1 ], [ s1, w1 ] = WARY[ k ];
			return ( w0 + ( w1 - w0 ) * ( speed - s0 ) / ( s1 - s0 ) ) * sight;

		}

	}

	return WARY[ WARY.length - 1 ][ 1 ] * sight;

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
