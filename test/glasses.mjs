// (M19) The polarized glasses themselves (game/rigs/Glasses.js: nothing tested the class before, docs/m19/see.md), in
// plain Node with the real class and three's objects, the game around it stubbed:
//   - worn only when bought, above the water; the sea's reflection cut by the angle of the sea in view, not when looking up
//     (B2), and the plain sea's too while it's drawn (B6);
//   - the fish shown where the far fish really are (world/Fish.js' far groups), the nearest first, none for a group near
//     enough to be drawn as itself (B10); before they've come, stand-ins about the finds, a weedline's at fixed places (B7);
//   - reckoned from your eye, not a camera behind and above you (B1); none by night; fewer in rain and a blow (B9).
//   node test/glasses.mjs
import { PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { Glasses, seaGlareLeft, fishSeen } from '../src/game/rigs/Glasses.js';
import { seenOffshore, seenOnFlats, wadeNoise, scareOf, WADE } from '../src/game/Sight.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};
const DEG = Math.PI / 180;

// the game about them
const make = ( { polarized = true, eye = new Vector3( 0, 3, 0 ), cam = null, fish = null, finds = null, weather = {} } = {} ) => {

	const camera = new PerspectiveCamera( 60, 1, 0.1, 5000 );
	camera.position.copy( cam || eye );
	const water = { material: { envMapIntensity: 1 }, plainMaterial: { envMapIntensity: 1 } };
	const app = {
		player: { mode: 'boat', under: false, eyeAt: ( out ) => out.copy( eye ) },
		water, camera, scene: { add() {} }, fish, finds, waves: { heightAt: () => 0 },
	};
	const game = { app, state: { stats: { polarized } }, weatherNow: weather };
	return { g: new Glasses( game ), app, game, camera, water };

};
const look = ( camera, below ) => {

	camera.rotation.set( - below, 0, 0, 'YXZ' );
	camera.updateMatrixWorld( true );

};
const day = () => {

	G.sunDir.value.set( 0.3, 0.8, 0.2 ).normalize();
	G.night.value = 0;
	G.rain.value = 0;
	G.windSpeed.value = 5;
	G.murk.value = 0;
	G.seaLevel.value = 0;

};
day();

// ---- worn, and the glare
{

	const off = make( { polarized: false } );
	look( off.camera, 30 * DEG );
	off.g.update( 1 / 60 );
	ok( ! off.g.worn && off.water.material.envMapIntensity === 1, 'not bought: not worn, the sea as it is' );

	const on = make();
	look( on.camera, 37 * DEG );
	on.g.update( 1 / 60 );
	const down = on.water.material.envMapIntensity;
	look( on.camera, - 30 * DEG );
	on.g.update( 1 / 60 );
	const up = on.water.material.envMapIntensity;
	ok( on.g.worn && down < 0.5, `worn: looking 37 degrees down, ${ ( down * 100 ).toFixed( 0 ) }% of the sea's reflection left` );
	ok( up === 1, `looking 30 degrees up there's no sea in view: none of it taken (before M19, looking up was cut as looking down)` );
	look( on.camera, 0 );
	on.g.update( 1 / 60 );
	const level = on.water.material.envMapIntensity;
	ok( level > down && level < 1, `looking level, the sea below the horizon in view, a little cut (${ ( level * 100 ).toFixed( 0 ) }%)` );
	ok( on.water.plainMaterial.envMapIntensity === on.water.material.envMapIntensity, 'the plain sea, while it\'s drawn, cut the same (B6)' );
	// (past Brewster's angle the share left climbs again, to all of it straight down, where both polarizations reflect alike)
	ok( seaGlareLeft( - 40 * DEG, 60 * DEG ) === 1 && seaGlareLeft( 37 * DEG, 60 * DEG ) < seaGlareLeft( 10 * DEG, 60 * DEG ) && seaGlareLeft( 37 * DEG, 60 * DEG ) < seaGlareLeft( 80 * DEG, 60 * DEG ), 'the glare\'s the sea in view\'s: none of it taken looking up, the most looking down about Brewster\'s angle' );
	const under = make();
	under.app.player.mode = 'swim';
	under.app.player.under = true;
	under.g.update( 1 / 60 );
	ok( ! under.g.worn, 'under the water: not worn' );

}

// ---- the far fish where they are
{

	const sp = { length: [ 0.7, 1.3 ] };
	const group = ( x, z, extra = {} ) => ( { center: new Vector3( x, 0, z ), zone: { r: 12 }, sp, count: 8, offset: x | 0, active: false, farKey: 1, ...extra } );
	const fish = { farGroups: [ group( 0, 60 ), group( 30, 25 ), group( - 20, 15, { active: true } ), group( 400, 0 ), group( 0, 80, { farKey: undefined } ) ] };
	const s = make( { eye: new Vector3( 0, 8.62, 0 ), fish } );
	look( s.camera, 20 * DEG );
	s.g.update( 1 / 60 );
	const spots = s.g._spots( new Vector3( 0, 8.62, 0 ), [] );
	ok( spots.length === 2 && spots[ 0 ].d < spots[ 1 ].d && spots[ 0 ].x === 30, `from the tower, two schools where the far groups are, the nearer first (not the one drawn as itself, the one 400 m off, nor one not yet placed)` );
	ok( s.g.shapes && s.g.shapes.visible && s.g.shapes.count > 8 && s.g.shapes.count <= 16, `their fish shown: ${ s.g.shapes && s.g.shapes.count }` );

	// reckoned from your eye: a kayak's seat with the camera 13 m back and 5 m up behind her
	const low = make( { eye: new Vector3( 0, 0.81, 0 ), cam: new Vector3( 0, 5, - 13 ), fish } );
	look( low.camera, 20 * DEG );
	low.g.update( 1 / 60 );
	ok( ! low.g.shapes || low.g.shapes.count === 0, 'sat in a kayak (0.81 m) with the camera behind and above: none of them 25 m and more off (B1: the camera stood in for your eye)' );

	// by night none; in rain and a blow fewer
	G.night.value = 0.9;
	s.g.update( 1 / 60 );
	ok( ! s.g.shapes.visible, 'by night, none' );
	day();
	ok( seenOffshore( { sun: 0.8, wind: 5 } ) > 0.95 && seenOffshore( { sun: 0.8, wind: 5, rain: 0.7 } ) === 0 && seenOffshore( { sun: 0.8, wind: 18 } ) < 0.3 && seenOffshore( { sun: 0.8, wind: 5, overcast: 1 } ) < 0.6 && seenOffshore( { sun: 0.8, wind: 5, murk: 1 } ) < 0.2, 'fewer under a grey sky, in whitecaps and in a blow\'s murk; none in heavy rain (B9)' );
	G.rain.value = 0.7;
	s.g.update( 1 / 60 );
	ok( ! s.g.shapes.visible, 'in heavy rain, none' );
	day();

}

// ---- before the fish have come: about the finds, a weedline's at fixed places as you go along it
{

	const finds = { debris: [], bait: [], weed: [ { x0: - 200, z0: 40, x1: 200, z1: 40, width: 6, life: 1 } ] };
	const s = make( { eye: new Vector3( 0, 8.62, 0 ), finds } );
	const a = s.g._spots( new Vector3( - 30, 8.62, 0 ), [] ).map( ( q ) => q.x.toFixed( 1 ) ).sort();
	const b = s.g._spots( new Vector3( 30, 8.62, 0 ), [] ).map( ( q ) => q.x.toFixed( 1 ) ).sort();
	const both = a.filter( ( x ) => b.includes( x ) );
	ok( a.length > 3 && both.length === Math.min( a.length, b.length ), `a weedline's schools at the same places along it wherever you are (B7: they slid with you): ${ both.length } in common` );

}

// ---- the reach by your eye's height (B3: the tower is 8.62 m)
ok( fishSeen( 0.81, 12 ) < 0.05 && fishSeen( 3, 12 ) > 0.8 && fishSeen( 8.62, 40 ) > 0.8 && fishSeen( 8.62, 100 ) > 0, 'a kayak\'s seat little past 10 m, a deck plainly at 12, the tower plainly at 40 and some past 100' );

// ---- what you buy for the flats: copper lenses, flats booties
{

	// a bonefish 18 m off over white sand, wading (1.62 m), the sun high behind you: at the edge of what grey lenses show
	const q = ( lens ) => seenOnFlats( { h: 1.62, d: 18, L: 0.5, depth: 0.5, bottom: 0.55, back: 0.14, glasses: true, lens, sun: 0.8, behind: 0.8, shade: 0, overcast: 0, wind: 4, rain: 0, night: 0, tailUp: 0, sign: 0 }, {} ).body;
	const grey = q( 'grey' ), copper = q( 'copper' );
	ok( copper > grey && grey < 0.95, `copper lenses show a fish over the sand plainer than grey: ${ copper.toFixed( 2 ) } against ${ grey.toFixed( 2 ) }` );
	ok( wadeNoise( 1, 0, true ) < wadeNoise( 1, 0, false ) * 0.5 && wadeNoise( 1, 1 ) > wadeNoise( 1, 0 ) && wadeNoise( 0.2 ) < wadeNoise( 1.2 ), 'a wading step heard less in booties, more off the soft flat, more the faster' );
	const o = { x: 0, z: 0, vx: 0, vz: 0, eye: 1.6, tall: 1.75, knock: 0, wade: 1, engine: false, hull: false };
	ok( scareOf( 'bonefish', { x: 10, z: 0, r: 2, depth: 0.5 }, o, null, { wind: 4 } ) === 'wade' && scareOf( 'bonefish', { x: WADE.heard + 10, z: 0, r: 2, depth: 0.5 }, o, null, { wind: 4 } ) === null, 'a step heard by a school close by, not by one past its reach' );

}

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
