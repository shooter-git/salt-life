// (M16) Ways to fish and your own gear (game/rigs): the hook's real depth and the fish there, a towed bait's speed and who
// strikes at it, the leader, what a drag does for a big fish, the chair, a lead sinking and winding back, and the gear.
//
//   node test/tackle.mjs

import { PerspectiveCamera } from '../src/engine/index.js';
import { FISH, FISH_IDS } from '../src/game/FishTable.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { BAITS, onHand } from '../src/game/Bait.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { biteDelay, habitatAt, pickSpecies } from '../src/game/Bites.js';
import { atHook, baitFits, columnOf, leaderFor, leaderRisk, rigDelay, rigWeight, towTaste } from '../src/game/rigs/Presentation.js';
import { fishSeen, glareLeft } from '../src/game/rigs/Glasses.js';
import { HOLD_KG } from '../src/game/rigs/Rigs.js';
import { FishingRod } from '../src/game/FishingRod.js';

let failed = 0;
const ok = ( c, what ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! c ) failed ++;

};

let seed = 5;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
// the share of the bites by species
const shares = ( h, hour = 10, bait = null, n = 4000 ) => {

	const c = {};
	for ( let i = 0; i < n; i ++ ) {

		const id = pickSpecies( { ...h }, hour, rng, bait );
		if ( id ) c[ id ] = ( c[ id ] || 0 ) + 1 / n;

	}

	return c;

};
const among = ( s, ...ids ) => ids.reduce( ( a, id ) => a + ( s[ id ] || 0 ), 0 );

// ---- the hook's depth: the shelf in 80 m of water
{

	const water = () => habitatAt( { depth: 80, reefDist: 400, pierDist: 900 } );
	const float = atHook( water(), { kind: 'float', hookM: 5, floorM: 80, leader: 'mono' } ), sinker = atHook( water(), { kind: 'bottom', hookM: 79.6, floorM: 80, leader: 'mono' } );
	const bare = atHook( water(), { kind: 'bottom', hookM: 30, floorM: 80, leader: 'mono' } );
	ok( float.deep < 0.1 && sinker.deep > 0.9 && bare.deep < 0.1, `a hook only finds the bottom's fish on the bottom: under a float ${ float.deep.toFixed( 2 ) }, on a sinker ${ sinker.deep.toFixed( 2 ) }, 50 m off it ${ bare.deep.toFixed( 2 ) }` );
	ok( among( shares( sinker ), 'redSnapper', 'silkSnapper', 'blackGrouper', 'grouper', 'cuberaSnapper', 'muttonSnapper' ) > 0.5, 'the sinker brings up the deep shelf\'s snappers and groupers' );
	ok( atHook( water(), null ).deep === water().deep, 'with no rig the water\'s as it was' );
	const reef = habitatAt( { depth: 8, reefDist: - 3, pierDist: 900 } );
	ok( atHook( { ...reef }, { kind: 'float', hookM: 5, floorM: 8, leader: 'mono' } ).reef > 0.9 * reef.reef, 'a float still fishes a reef: its hook\'s well down in that water' );
	const birds = ( hookM, floorM ) => atHook( habitatAt( { depth: floorM, reefDist: 4000, pierDist: 9000, birds: 1 } ), { kind: hookM > 5 ? 'drop' : 'float', hookM, floorM, leader: 'mono' } ).birds;
	ok( birds( 2, 800 ) > 0.9 && birds( 300, 800 ) < 0.05, 'under the birds is on top, not 300 m down' );

}

// ---- who takes what, how deep. Swordfish: deep by day and up at night; the blue water's fish aren't down in the dark
{

	FISH.swordfish = FISH.swordfish || { name: 'Swordfish', habitat: { blue: 1, edge: 1 }, kg: [ 20, 250 ], fight: 1, stamina: 240, time: 'any', rarity: 0.3 };
	const drop = { kind: 'drop', hookM: 480, floorM: 490, leader: 'heavy' }, night = { kind: 'float', hookM: 40, floorM: 490, leader: 'heavy' };
	ok( rigWeight( drop, 'swordfish', 10 ) > 4 && rigWeight( { ...drop, hookM: 30 }, 'swordfish', 10 ) < 0.2, 'by day a swordfish is taken deep, not on top' );
	ok( rigWeight( night, 'swordfish', 23 ) > 0.8 && rigWeight( drop, 'swordfish', 23 ) < 0.2, 'at night it\'s come up' );
	ok( columnOf( 'mahi' )[ 1 ] <= 200 && rigWeight( drop, 'mahi', 10 ) < 0.1 && rigWeight( drop, 'tuna', 10 ) < 0.1, 'the mahi and tuna aren\'t at 480 m' );
	ok( rigWeight( { kind: 'float', hookM: 5, floorM: 40, leader: 'mono' }, 'redSnapper', 10 ) === 1, 'an old rig and fish as they were: weight 1' );
	ok( rigWeight( null, 'tuna' ) === 1 && rigDelay( null ) === 1, 'no rig changes nothing' );
	delete FISH.swordfish;

}

// ---- trolling: the bait's speed, and who strikes at what speed
{

	const hoo = BAITS.ballyhoo.tow, skirt = BAITS.skirt.tow;
	ok( towTaste( hoo, 7 ) === 1 && towTaste( hoo, 2 ) === 0 && towTaste( hoo, 20 ) === 0, 'a ballyhoo swims at 5 to 10 knots, sinks slower and washes out faster' );
	ok( towTaste( skirt, 14 ) === 1 && towTaste( hoo, 14 ) < 0.5 && towTaste( skirt, 3 ) === 0, 'a skirt runs at wahoo\'s speed, a ballyhoo hardly does' );
	const T = ( knots, leader = 'heavy' ) => ( { kind: 'troll', hookM: 0.3, floorM: 400, knots, lines: 2, leader } );
	FISH.wahoo = FISH.wahoo || { habitat: { blue: 1, edge: 1 }, kg: [ 5, 50 ], fight: 0.9, stamina: 40, time: 'day' };
	ok( rigWeight( T( 14, 'wire' ), 'wahoo' ) > 3 * rigWeight( T( 14, 'wire' ), 'redSnapper' ) && rigWeight( T( 7, 'wire' ), 'wahoo' ) < rigWeight( T( 14, 'wire' ), 'wahoo' ), 'wahoo strike at speed; at bait speed less' );
	ok( rigWeight( T( 7 ), 'mahi' ) > 1 && rigWeight( T( 20 ), 'mahi' ) === 0, 'mahi at bait speed, and nothing at 20 knots but a wahoo' );
	ok( rigWeight( T( 7 ), 'redSnapper' ) < 0.2, 'a towed bait\'s not for the bottom fish' );
	delete FISH.wahoo;
	const blue = habitatAt( { depth: 500, reefDist: 4000, pierDist: 9000 } );
	const s = shares( atHook( { ...blue }, T( 7, 'mono' ) ), 10, 'ballyhoo', 2000 );
	ok( among( s, 'mahi', 'tuna' ) > 0.7, `trolled in the blue, it's mahi and tuna (${ ( 100 * among( s, 'mahi', 'tuna' ) ).toFixed( 0 ) }%)` );
	const delays = ( lines ) => {

		let t = 0;
		for ( let i = 0; i < 400; i ++ ) t += biteDelay( atHook( { ...blue }, { ...T( 7 ), lines } ), 10, rng, 'ballyhoo' );
		return t / 400;

	};

	const one = delays( 1 ), five = delays( 5 );
	console.log( `     mean wait for a strike in the blue: ${ one.toFixed( 0 ) } s on a line, ${ five.toFixed( 0 ) } s on five` );
	ok( one > 40 && five < one * 0.65, 'a towed bait\'s a longer wait than a float\'s, and the more lines the sooner' );

}

// ---- what goes on what
{

	ok( baitFits( 'troll', BAITS.ballyhoo ) && baitFits( 'troll', BAITS.skirt ) && ! baitFits( 'troll', null ) && ! baitFits( 'troll', BAITS.jig ), 'a towed bait or lure on the trolled line, not a shrimp or a jig' );
	ok( baitFits( 'kite', BAITS.mullet ) && ! baitFits( 'kite', BAITS.squid ), 'a live bait on the kite' );
	ok( baitFits( 'drop', BAITS.squid ) && ! baitFits( 'drop', BAITS.jig ) && ! baitFits( 'drop', BAITS.mullet ), 'squid or a dead bait down deep' );
	ok( baitFits( 'bottom', BAITS.jig ) && ! baitFits( 'float', BAITS.jig ) && baitFits( 'float', BAITS.plug ), 'a jig on a sinker line, a plug on top' );

}

// ---- the leader
{

	ok( leaderFor( 0, 'float' ) === 'mono' && leaderFor( 3, 'float' ) === 'fluoro' && leaderFor( 3, 'troll', 14 ) === 'wire' && leaderFor( 3, 'troll', 7 ) === 'heavy' && leaderFor( 3, 'drop' ) === 'heavy', 'the right one of those you own\'s tied on' );
	ok( leaderRisk( 'mono', 'barracuda' ).cut > 0 && leaderRisk( 'wire', 'barracuda' ).cut === 0 && leaderRisk( 'mono', 'jack' ).cut === 0, 'teeth go through anything but wire' );
	const T = { kind: 'float', hookM: 3, floorM: 30 };
	ok( rigWeight( { ...T, leader: 'wire' }, 'yellowtail' ) < 0.4 * rigWeight( { ...T, leader: 'fluoro' }, 'yellowtail' ), 'a yellowtail won\'t look at wire, and fluorocarbon brings more' );
	const run = ( cut ) => {

		let lost = 0;
		for ( let i = 0; i < 80; i ++ ) {

			const g = new CatchMinigame( { species: 'barracuda', kg: 8, lineKg: 26, reelSpeed: 2.2, dragKg: 12, holdKg: 10, spoolM: 350, distance: 20, rng, cut } );
			let st = 'fighting';
			while ( st === 'fighting' && g.time < 300 ) st = g.update( 1 / 30, g.tension < 0.68 && g.surge < 0.6 );
			if ( st === 'cut' ) lost ++;

		}

		return lost / 80;

	};
	ok( run( 0.3 ) > 0.5 && run( 0 ) === 0, 'a barracuda on mono is often bitten off; on wire never' );

}

// ---- the fight for a big fish
{

	FISH.blueMarlin = FISH.blueMarlin || { fight: 1, stamina: 300, kg: [ 60, 400 ] };
	const careful = ( g ) => g.tension < 0.68 && g.surge < 0.6;
	const fight = ( o, pol = careful, n = 30 ) => {

		const r = { n: 0, time: 0, far: 0 };
		for ( let i = 0; i < n; i ++ ) {

			const g = new CatchMinigame( { species: 'blueMarlin', kg: 200, distance: 60, tired: 0.3, landAt: 3, rng, ...o } );
			let st = 'fighting';
			while ( st === 'fighting' && g.time < 3600 ) {

				st = g.update( 1 / 30, pol( g ) );
				r.far = Math.max( r.far, g.distance );

			}

			r[ st ] = ( r[ st ] | 0 ) + 1;
			r.time += g.time / n;

		}

		return r;

	};
	const gear = { lineKg: 50, reelSpeed: 2.6, dragKg: 24, spoolM: 600, twoSpeed: true };
	const chair = fight( { ...gear, holdKg: HOLD_KG.chair, chair: true } );
	const stand = fight( { ...gear, holdKg: HOLD_KG.harness } );
	const light = fight( { lineKg: 26, reelSpeed: 2.2, dragKg: 12, holdKg: HOLD_KG.hand, spoolM: 350 } );
	const mash = fight( { ...gear, holdKg: HOLD_KG.chair, chair: true }, () => true );
	console.log( `     200 kg blue marlin. In the chair: ${ chair.caught | 0 } of 30 landed, ${ ( chair.time / 60 ).toFixed( 1 ) } min, ${ chair.far.toFixed( 0 ) } m out at most. Standing on the same tackle: ${ stand.caught | 0 }. On 30 lb and a conventional reel: ${ light.caught | 0 }` );
	ok( chair.caught >= 22 && chair.time > 240 && chair.time < 900, 'a 200 kg fish is beaten from the chair, in minutes, with care' );
	ok( chair.far > 200, '... having been hundreds of metres out' );
	ok( ( stand.caught | 0 ) < chair.caught / 2 && ( stand.spooled | 0 ) > 15, 'standing up it takes all your line' );
	ok( ( light.caught | 0 ) === 0, 'on lighter tackle there\'s no stopping it' );
	ok( ( mash.snapped | 0 ) > 25, 'hold the reel into its runs and the line goes' );
	const g = new CatchMinigame( { species: 'blueMarlin', kg: 200, ...gear, holdKg: 18, distance: 60, rng } );
	for ( let i = 0; i < 30 * 30; i ++ ) g.update( 1 / 30, false );
	ok( g.overload === 0 && g.tension < 0.6, 'with the reel let be the drag gives and the line\'s in no danger' );
	// the drag leaves a fish within it as it was
	const a = new CatchMinigame( { species: 'grunt', kg: 0.8, lineKg: 26, reelSpeed: 1.1, distance: 18, rng: () => 0.4 } ), b = new CatchMinigame( { species: 'grunt', kg: 0.8, lineKg: 26, reelSpeed: 1.1, distance: 18, rng: () => 0.4, dragKg: 12, holdKg: 10, spoolM: 350 } );
	for ( let i = 0; i < 600; i ++ ) {

		a.update( 1 / 60, i % 200 < 120 );
		b.update( 1 / 60, i % 200 < 120 );

	}

	ok( Math.abs( a.distance - b.distance ) < 0.01 && Math.abs( a.tension - b.tension ) < 0.01, 'a little fish on a big reel fights just as it did' );
	const deep = new CatchMinigame( { species: 'blueMarlin', kg: 40, lineKg: 50, reelSpeed: 4.5, dragKg: 24, holdKg: 40, spoolM: 900, distance: 500, hookM: 500, electric: true, twoSpeed: true, chair: true, rng } );
	let st = 'fighting';
	while ( st === 'fighting' && deep.time < 1200 ) st = deep.update( 1 / 30, true );
	ok( deep.hookM < 5, `a fish on the electric reel comes up as it's wound in (from 500 m, ${ deep.time.toFixed( 0 ) } s, ${ st })` );
	const away = new CatchMinigame( { species: 'grunt', kg: 0.8, lineKg: 26, distance: 20, rng: () => 0.5 } );
	const d0 = away.distance;
	away.update( 1, false, 3 );
	ok( away.distance > d0 + 2.5, 'a boat running from a fish takes line out' );
	delete FISH.blueMarlin;

}

// ---- the lead going down and coming back, on the rod itself
{

	globalThis.window = globalThis.window || {};
	const scene = { add() {} };
	const camera = new PerspectiveCamera();
	const query = { allocate: () => 0, setPoint() {}, cpuValid: true, cpu: new Float32Array( [ 0, 0, 0, - 300 ] ) };
	const rod = new FishingRod( { scene, camera, query, terrain: { heightAt: () => - 300 } } );
	rod.equip( true );
	const frame = () => rod.update( 1 / 30, { visible: true } );
	for ( let i = 0; i < 30; i ++ ) frame();
	rod.setRig( 'bottom' );
	rod.dropReach = 200;
	ok( rod.dropLine() && rod.state === 'floating', 'it goes in straight down' );
	let t = 0;
	for ( ; t < 300 && ! rod.settled; t += 1 / 30 ) frame();
	ok( rod.hookM === 200 && t > 100 && t < 160, `by hand as far as the line you can work: ${ rod.hookM } m in ${ t.toFixed( 0 ) } s` );
	ok( ! rod.bobberMesh.visible, 'no float on a lead' );
	ok( rod.lineOut > 199, 'the line out goes down to it' );
	rod.setRig( 'drop' );
	rod.dropReach = 900;
	rod.setState( 'floating' );
	for ( t = 0; t < 300 && ! rod.settled; t += 1 / 30 ) frame();
	ok( Math.abs( rod.hookM - 299.6 ) < 0.01 && t > 100, `the electric reel's lead to the bottom: ${ rod.hookM.toFixed( 1 ) } m in ${ t.toFixed( 0 ) } s` );
	rod.retrieve();
	for ( t = 0; t < 200 && rod.state !== 'idle'; t += 1 / 30 ) frame();
	ok( rod.state === 'idle' && rod.hookM === 0 && t > 40, `and a long way back: ${ t.toFixed( 0 ) } s` );
	rod.setRig( 'float' );
	rod.dropLine();
	for ( let i = 0; i < 30; i ++ ) frame();
	ok( rod.hookM === 5 && rod.bobberMesh.visible, 'under a float it hangs at the stop' );

}

// ---- your gear
{

	const u = defaultUpgrades(), base = gearStats( u );
	ok( base.dragKg === null && base.spoolM > 100 && base.landKg > 0 && base.swimMul === 1 && base.breathS === 50 && ! base.polarized && ! base.lifeJacket, 'what you start with' );
	const top = gearStats( { ...u, rod: 3, reel: 3, leader: 3, lures: 3, landing: 2, glasses: 1, diveKit: 3, safety: 2 } );
	ok( top.standUp && top.twoSpeed && top.dragKg >= 20 && top.spoolM >= 500 && top.leader === 3 && top.lures === 3 && top.gaff && top.tagKit && top.polarized && top.airS > 0 && top.flares && top.epirb && top.lifeJacket, 'the top of each' );
	for ( const k of [ 'leader', 'lures', 'landing', 'glasses', 'diveKit', 'safety' ] ) ok( UPGRADES[ k ] && ! UPGRADES[ k ].on, `${ k } is your own gear, with you on any boat` );
	ok( UPGRADES.rod.levels.length === 4 && UPGRADES.reel.levels.length === 4 && UPGRADES.rod.levels[ 3 ].cost === 600 && UPGRADES.reel.levels[ 3 ].cost === 900, 'the rod and the reel have their fourth level, at the doc\'s prices' );
	ok( UPGRADES.leader.levels.map( ( l ) => l.cost ).join() === '0,40,60,90' && UPGRADES.lures.levels.map( ( l ) => l.cost ).join() === '0,50,90,180' && UPGRADES.landing.levels.map( ( l ) => l.cost ).join() === '0,60,80' && UPGRADES.diveKit.levels.map( ( l ) => l.cost ).join() === '0,80,220,600', 'the rest at the doc\'s prices' );
	const S = new GameState( { load: () => null, save() {} } );
	S.money = 100;
	ok( S.buyBait( 'ballyhoo' ) && S.bait.ballyhoo === 12 && S.money === 80, 'frozen ballyhoo by the dozen' );
	ok( S.baitCount === 0, 'frozen bait isn\'t in the live bucket\'s count' );
	ok( S.buyBait( 'chum' ) && ! S.buyBait( 'mullet' ), 'chum, a block; and not what Marta doesn\'t sell' );
	ok( S.takeBait( 'ballyhoo' ) && S.bait.ballyhoo === 11, 'used one at a time' );
	ok( S.takeBait( 'skirt' ) && S.bait.skirt === undefined, 'a lure isn\'t used up' );
	S.returnBait( 'skirt' );
	ok( S.bait.skirt === undefined, '... and not stowed in the bucket' );
	ok( ! onHand( 'skirt', S ) && ( S.upgrades.lures = 3, onHand( 'skirt', S ) ) && onHand( 'jig', S ), 'lures come with the track' );
	const J = JSON.parse( JSON.stringify( S.toJSON ? S.toJSON() : {} ) );
	ok( J.bait && J.bait.ballyhoo === 11, 'it saves' );

}

// ---- the glasses: as physics has it, the higher you are the more they show you
{

	ok( glareLeft( 37 * Math.PI / 180 ) < 0.1 && glareLeft( 0 ) >= 0.45, 'they take most of the glare at Brewster\'s angle, half of it along the surface' );
	ok( fishSeen( 3, 12 ) > 0.8 && fishSeen( 3, 60 ) === 0, 'from the deck you see a fish close to, not 60 m off' );
	ok( fishSeen( 14, 60 ) > 0.8 && fishSeen( 14, 120 ) > 0, 'from the tower, out to more than 100 m' );
	ok( fishSeen( 40, 300 ) === 0, 'but not for ever' );

}

ok( FISH_IDS.every( ( id ) => rigWeight( { kind: 'float', hookM: 5, floorM: 50, leader: 'mono' }, id, 12 ) >= 0 ), 'every fish has a weight for a float' );

if ( failed ) process.exit( 1 );
console.log( 'all passed' );
