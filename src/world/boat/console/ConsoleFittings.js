import { Vector3 } from '../../../engine/index.js';
import { box, rod, cylinder, sphere, lathe } from '../GeoKit.js';
import { DECK } from './ConsoleHull.js';
import { TOP } from './ConsoleHelm.js';

// (M19) What M19 sells for her (stream BOATS: docs/m19/boats.md; the sources in docs/m19/sources-boats-bait.md), each under
// kit.fitting so she can go without it, and each that moves in two states, only one of them drawn (ConsoleModel's _applyFit),
// each state whole with its mount, so a moored look (MooredLooks' LOOK_PARTS) takes each fitting as one part:
//   trolling              a bow-mount trolling motor (Minn Kota's Riptide Terrova 112, 72 in shaft) on her foredeck to
//                         starboard of the stem, stowed: its mount, its shaft lying aft along the deck, its pod at the end
//   motorDown             the same, deployed: the shaft down over her bow, its pod and prop 0.6 m under the water
//   powerPole             a pair of Power-Pole Blades (8 ft) on her transom's corners: their pump housings, the blades
//                         standing up from them, as they stow
//   poleDown              the same, swung down and run out into the bottom behind her
//   radar                 an 18 in dome on her T-top (Garmin's GMR 18 HD3), on a short base
// Her frame: +z to her bow, y up from about her waterline, x to port.
export const TROLLING = { x: - 0.24, z: 3.45, down: { z: 3.98, pod: - 0.62 } }; // (to starboard on her foredeck, -x; deployed just off her stem)
export const POLES = { xs: [ 0.92, - 0.92 ], z: DECK.platform.zEnd + 0.05, up: 2.25, down: 2.4 };
export const DOME = { r: 0.23, h: 0.22, z: TOP.z1 - 0.38 };

const V = ( x, y, z ) => new Vector3( x, y, z );
const BLACK = { color: 0x16181a, rough: 0.45, metal: 0.1 };
const COMPOSITE = { color: 0x202326, rough: 0.35, metal: 0.05 }; // the motor's shaft
const GREY = { color: 0x6b7075, rough: 0.4, metal: 0.6 };
const STAINLESS = { color: 0xcfd3d6, rough: 0.2, metal: 1 };
const WHITE = { color: 0xf0efe9, rough: 0.3 };
const BLADE = { color: 0x111213, rough: 0.3, metal: 0.05 }; // a black fibreglass blade
const PROP = { color: 0x2a2c30, rough: 0.5 };

export function buildFittings( kit, L ) {

	const was = kit.fitting;
	trollingMotor( kit, L );
	powerPoles( kit );
	radarDome( kit );
	kit.fitting = was;

}

// the motor's pod: a torpedo along `dir` (unit), its nose at `at`, with a two-bladed prop at its tail
function pod( kit, at, dir, up ) {

	const len = 0.36, tail = at.clone().addScaledVector( dir, - len );
	kit.add( 'fittings', rod( at, tail, 0.052, 8, 0.044 ), BLACK );
	kit.add( 'fittings', sphere( 0.052, 6, 4 ).translate( at.x, at.y, at.z ), BLACK );
	// the skeg below it, the prop at its tail
	const mid = at.clone().addScaledVector( dir, - len * 0.55 );
	kit.add( 'fittings', rod( mid, mid.clone().addScaledVector( up, - 0.1 ), 0.008, 4 ), BLACK );
	const hub = tail.clone().addScaledVector( dir, - 0.03 );
	kit.add( 'fittings', rod( tail, hub, 0.018, 5 ), PROP );
	const side = V( 0, 1, 0 ).cross( dir );
	if ( side.lengthSq() < 1e-6 ) side.set( 1, 0, 0 );
	side.normalize();
	for ( const s of [ 1, - 1 ] ) kit.add( 'fittings', box( 0.06, 0.006, 0.12 ).lookAt( side.clone().multiplyScalar( s ) ).translate( hub.x + side.x * s * 0.07, hub.y + side.y * s * 0.07, hub.z + side.z * s * 0.07 ), PROP );

}

function trollingMotor( kit, L ) {

	const T = TROLLING, y = L.sheerY( L.tAtSheerZ( T.z ) ) + 0.02;
	// the mount on the deck: its plate, the quick-release bracket (in each state)
	const mount = () => {

		kit.add( 'fittings', box( 0.2, 0.03, 0.46 ).translate( T.x, y + 0.015, T.z ), BLACK );
		kit.add( 'fittings', box( 0.12, 0.09, 0.16 ).translate( T.x, y + 0.07, T.z + 0.22 ), GREY );

	};

	// stowed: the shaft along the deck from the bracket, aft, the pod at its end, the head forward of it
	kit.fitting = 'trolling';
	mount();
	const a = V( T.x, y + 0.13, T.z + 0.3 ), b = V( T.x, y + 0.13, T.z - 1.5 );
	kit.add( 'fittings', rod( a, b, 0.016, 6 ), COMPOSITE );
	kit.add( 'fittings', box( 0.16, 0.12, 0.2 ).translate( T.x, y + 0.15, T.z + 0.4 ), BLACK );
	kit.add( 'fittings', box( 0.07, 0.07, 0.03 ).translate( T.x, y + 0.05, T.z - 1.4 ), BLACK ); // its rest
	pod( kit, V( T.x, y + 0.13, T.z - 1.5 ), V( 0, 0, 1 ), V( 1, 0, 0 ) );
	// deployed: the shaft down past the stem into the water, the head on top of it, the pod under the water heading forward
	kit.fitting = 'motorDown';
	mount();
	const D = T.down, top = V( T.x, y + 0.42, D.z ), foot = V( T.x, D.pod, D.z );
	kit.add( 'fittings', rod( top, foot, 0.016, 6 ), COMPOSITE );
	kit.add( 'fittings', box( 0.16, 0.14, 0.2 ).translate( top.x, top.y + 0.05, top.z ), BLACK );
	kit.add( 'fittings', rod( V( T.x, y + 0.1, T.z + 0.22 ), V( T.x, y + 0.12, D.z ), 0.014, 6 ), GREY ); // the arm out to it
	pod( kit, V( T.x, D.pod, D.z + 0.18 ), V( 0, 0, 1 ), V( 0, 1, 0 ) );

}

function powerPoles( kit ) {

	const P = POLES, y = DECK.platform.y;
	// the pump housing on each of the transom's corners, its mounting bracket (in each state)
	const housings = () => {

		for ( const x of P.xs ) {

			kit.add( 'fittings', box( 0.13, 0.3, 0.14 ).translate( x, y + 0.12, P.z ), BLACK );
			kit.add( 'fittings', box( 0.18, 0.06, 0.08 ).translate( x, y - 0.02, P.z + 0.08 ), STAINLESS );

		}

	};

	// stowed: each blade standing up from its housing, white-capped
	kit.fitting = 'powerPole';
	housings();
	for ( const x of P.xs ) {

		kit.add( 'fittings', box( 0.05, P.up, 0.03 ).translate( x, y + 0.28 + P.up / 2, P.z - 0.02 ), BLADE );
		kit.add( 'fittings', box( 0.055, 0.12, 0.035 ).translate( x, y + 0.28 + P.up - 0.05, P.z - 0.02 ), WHITE );

	}

	// down: swung down behind her and run out into the bottom, the spike at its foot
	kit.fitting = 'poleDown';
	housings();
	for ( const x of P.xs ) {

		const from = V( x, y + 0.1, P.z - 0.06 ), to = V( x, y + 0.1 - P.down, P.z - 0.42 );
		kit.add( 'fittings', rod( from, to, 0.022, 6, 0.016 ), BLADE );
		kit.add( 'fittings', rod( from, from.clone().lerp( to, 0.08 ), 0.03, 6 ), WHITE );

	}

}

function radarDome( kit ) {

	kit.fitting = 'radar';
	const D = DOME, y = TOP.y + 0.02;
	kit.add( 'fittings', cylinder( 0.07, 0.09, 0.05, 10 ).translate( 0, y + 0.025, D.z ), WHITE ); // its base
	// the dome: a shallow cylinder with a rounded top, white
	const prof = [ [ D.r * 0.96, 0 ], [ D.r, 0.02 ], [ D.r, D.h * 0.55 ], [ D.r * 0.85, D.h * 0.86 ], [ 0, D.h ] ];
	kit.add( 'fittings', lathe( prof, 18 ).translate( 0, y + 0.05, D.z ), WHITE );

}
