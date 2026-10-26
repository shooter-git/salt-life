// (Salt Life) Plain-node tests of the spearfishing (no GPU): the held breath, the speargun's states,
// its shot against the reef and the piles, its bands, and the fight with a big fish on the shaft.
//   node test/spearfishing.mjs
import { Vector3, Scene, PerspectiveCamera } from 'three';
import { Player, BREATH } from '../src/player/Player.js';
import { Speargun, gunLayout, gunModels, groundHit } from '../src/game/Speargun.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { fishWeightKg } from '../src/game/FishTable.js';
import { Colliders } from '../src/world/Colliders.js';
import { wariness } from '../src/world/Fish.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

// ---- the held breath (Player.breathe on a stand-in swimmer)
{

	const p = { breath: BREATH, breathMax: BREATH, blackout: 0, blackouts: 0, floating: false, breathPaused: false, velocity: new Vector3( 0.7, 0, 0 ) };
	const breathe = ( s, under, sprint = false ) => {

		for ( let t = 0; t < s; t += 0.1 ) Player.prototype.breathe.call( p, 0.1, under, sprint );

	};
	breathe( 10, true );
	const easy = BREATH - p.breath;
	p.breath = BREATH;
	breathe( 10, true, true );
	const hard = BREATH - p.breath;
	p.breath = BREATH;
	p.velocity.set( 0, 0, 0 );
	breathe( 10, true );
	const still = BREATH - p.breath;
	check( Math.abs( easy - 10 ) < 0.2 && hard > easy * 1.5 && still < easy * 0.8, `breath: 10 s finning uses 10 s (${ easy.toFixed( 1 ) }), kicking hard more (${ hard.toFixed( 1 ) }), keeping still less (${ still.toFixed( 1 ) })` );
	p.breathPaused = true;
	const held = p.breath;
	breathe( 5, true );
	check( p.breath === held, 'breath: it waits while the catch card is up' );
	p.breathPaused = false;
	p.velocity.set( 0.7, 0, 0 );
	breathe( BREATH + 5, true );
	check( p.breath === 0 && p.blackout === 1 && p.blackouts === 1, 'out of breath under water: a blackout' );
	breathe( 1, true );
	check( p.blackouts === 1, 'one blackout, not one a frame' );
	breathe( 0.5, false );
	check( p.blackout > 1, 'at the surface: a few breaths before diving again' );
	breathe( 12, false );
	check( p.blackout === 0 && p.breath === BREATH, 'and the breath comes back within ~10 s' );

}

// ---- the speargun's states
const scene = new Scene(), camera = new PerspectiveCamera();
camera.position.set( 0, - 3, 0 );
camera.updateMatrixWorld();
const lv = ( speargun ) => gearStats( { ...defaultUpgrades(), speargun } );
const ahead = ( m ) => camera.position.clone().add( new Vector3( 0, 0, - m ) );
const run = ( gun, s, env = {} ) => {

	for ( let t = 0; t < s; t += 1 / 60 ) gun.update( 1 / 60, { groundAt: () => - 20, waterY: 0, ...env } );

};
{

	const gun = new Speargun( { scene, camera } );
	gun.setGear( lv( 0 ) );
	check( gun.state === 'stowed' && ! gun.fire( ahead( 3 ) ), 'stowed: it doesn\'t fire' );
	gun.equip( true );
	run( gun, 1 );
	check( gun.state === 'loaded', 'taken out loaded' );
	gun.safety = true;
	check( ! gun.fire( ahead( 3 ) ) && gun.state === 'loaded', 'with a protected fish in the sights it holds fire' );
	gun.safety = false;
	check( gun.fire( ahead( 3 ) ) && gun.state === 'flying' && gun.load[ 0 ] === 0, 'fired: the band is off, the shaft flies' );
	run( gun, 0.1 );
	const muzzleToTip = gun.tip.distanceTo( camera.position );
	run( gun, 1.5 );
	const g = gun.gear;
	const tail = gun.tip.clone().addScaledVector( gun.dir, - g.shaftM );
	check( muzzleToTip > 1.5 && tail.distanceTo( gun.muzzle ) <= g.lineM + 0.05 && [ 'spent', 'pulling' ].includes( gun.state ), `it flies out and fetches up at the end of its line (${ tail.distanceTo( gun.muzzle ).toFixed( 2 ) } m of ${ g.lineM })` );
	run( gun, 8 );
	check( gun.state === 'empty' && gun.shaftOut === false, 'the line hauled in: the shaft back in the gun' );
	for ( let t = 0; t < 0.4; t += 1 / 60 ) gun.loadBands( true, 1 / 60 );
	gun.loadBands( false, 1 / 60 );
	check( gun.state === 'empty' && gun.load[ 0 ] === 0, 'let go half way: the band slips back' );
	for ( let t = 0; t < 1; t += 1 / 60 ) gun.loadBands( true, 1 / 60 );
	check( gun.state === 'loaded', 'held: the band drawn back to its notch, loaded' );
	gun.setGear( lv( 1 ) );
	gun.equip( false );
	gun.equip( true );
	gun.fire( ahead( 3 ) );
	run( gun, 12 );
	let t1 = 0;
	for ( ; t1 < 3 && gun.state !== 'loaded'; t1 += 1 / 60 ) gun.loadBands( true, 1 / 60 );
	check( gun.bands === 2 && gun.state === 'loaded' && t1 > 1.2, `a two-band gun loads band by band (${ t1.toFixed( 1 ) } s)` );

}

// ---- the shot meets the reef, a pile; the bands
{

	const wall = ( x, z ) => ( z < - 2.2 && z > - 2.6 ? 0 : - 20 ); // a coral head across the shot, 2.2 m out
	const gun = new Speargun( { scene, camera } );
	gun.setGear( lv( 0 ) );
	gun.equip( true );
	run( gun, 1, { groundAt: wall } );
	gun.fire( ahead( 4 ) );
	run( gun, 0.5, { groundAt: wall } );
	check( gun.stuck && gun.tip.z > - 2.75 && gun.tip.z < - 2.1, `a coral head stops the shot, the tip buried in it (at ${ gun.tip.z.toFixed( 2 ) } m)` );
	check( groundHit( new Vector3( 0, - 3, 0 ), new Vector3( 0, - 3, - 4 ), wall ) < 0.6 && groundHit( new Vector3( 0, 1, 0 ), new Vector3( 0, 1, - 4 ), wall ) === Infinity, 'groundHit finds the coral head between two points, and not above it' );
	const piles = new Colliders();
	piles.addCylinder( 0, - 2, 0.15, - 10, 2, { tag: 'pile' } );
	const gun2 = new Speargun( { scene, camera } );
	gun2.setGear( lv( 0 ) );
	gun2.equip( true );
	run( gun2, 1 );
	gun2.fire( ahead( 4 ) );
	run( gun2, 0.5, { colliders: piles } );
	check( ! gun2.stuck && gun2.tip.distanceTo( new Vector3( 0, gun2.tip.y, - 2 ) ) < 0.4 && [ 'spent', 'pulling' ].includes( gun2.state ), 'a pile stops it (it bounces off)' );
	check( piles.segmentHit( new Vector3( 0, 0, 0 ), new Vector3( 0, 0, - 4 ) ) < 0.5 && piles.segmentHit( new Vector3( 1, 0, 0 ), new Vector3( 1, 0, - 4 ) ) === Infinity, 'Colliders.segmentHit: the pile in the way, or not' );
	// the bands: on their notch stretched to ~3.2 times their rest, slack under the muzzle
	let ok = true;
	for ( let l = 0; l < UPGRADES.speargun.levels.length; l ++ ) {

		const lay = gunLayout( lv( l ) );
		for ( let b = 0; b < lay.rest.length; b ++ ) {

			const stretched = Math.hypot( lay.anchor.x - 0.011, ( lay.anchor.y - b * 0.028 ) - lay.notches[ b ], lay.anchor.z - lay.shaftZ );
			if ( Math.abs( stretched / lay.rest[ b ] - 3.2 ) > 0.15 ) ok = false;

		}

	}

	check( ok, 'every gun\'s bands stretch about 3.2 times on their notches' );
	check( gunModels( lv( 1 ) ) === gunModels( lv( 1 ) ) && gunModels( lv( 0 ) ) !== gunModels( lv( 2 ) ), 'each gun\'s models are made once' );

}

// ---- the fight with a big fish on the shaft: pull with care and it's landed once tired; pull hard
// all the way and a strong one tears free; the starter gun can't hold the biggest
{

	let seed = 11;
	const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
	const careful = ( g ) => g.tension < 0.68 && g.surge < 0.6;
	const fight = ( species, cm, level, pull ) => {

		const g = lv( level );
		const f = new CatchMinigame( { species, kg: fishWeightKg( species, cm ), lineKg: g.spearHold, reelSpeed: 1, distance: 2.5, rng, landAt: 1.0, tired: 0.25 } );
		f.maxDistance = g.lineM + ( g.spearReel ? 25 : 0.4 );
		let st = 'fighting';
		for ( let i = 0; i < 60 * 90 && st === 'fighting'; i ++ ) st = f.update( 1 / 60, pull( f ) );
		return { st, t: f.time, stamina: f.stamina };

	};
	const hog = fight( 'wrasse', 60, 0, careful );
	check( hog.st === 'caught' && hog.t > 3 && hog.t < 15, `a 60 cm hogfish on the starter gun, pulled with care: landed in ${ hog.t.toFixed( 1 ) } s, tired` );
	const jack = fight( 'jack', 75, 0, () => true );
	check( jack.st === 'snapped', 'a big crevalle jack pulled hard all the way tears off the shaft' );
	check( fight( 'wrasse', 60, 0, () => false ).st === 'escaped', 'one left to run takes the line and tears free' );
	check( fight( 'blackGrouper', 112, 0, careful ).st !== 'caught' && fight( 'blackGrouper', 112, 2, careful ).st === 'caught', 'an 18 kg black grouper: too much for the starter gun, landed on the railgun' );

}

// ---- (M11) fish in murky water notice a diver later (they see as little as you do)
{

	const slow = wariness( 0.3 ), fast = wariness( 2.5 );
	check( wariness( 0.3, 0 ) === slow && wariness( 2.5, 0 ) === fast && slow < fast, 'in clear water, as before: a slow approach gets closer than a sprint' );
	check( Math.abs( wariness( 0.3, 1 ) - slow * 0.6 ) < 1e-9 && Math.abs( wariness( 2.5, 1 ) - fast * 0.6 ) < 1e-9, 'at the murkiest, they notice you at 60% of the distance' );
	check( wariness( 1.5, 0.5 ) < wariness( 1.5, 0 ) && wariness( 1.5, 0.5 ) > wariness( 1.5, 1 ), 'the murkier, the closer you get' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
