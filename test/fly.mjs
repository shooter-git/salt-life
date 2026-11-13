// (M19) Fly casting and the fly fished (stream FLY: docs/m19/fly.md; sources in docs/m19/sources-fly.md), in plain Node.
//   - the rhythm: each stroke the rod's stroke and the loop's unrolling; the release by when it's let go; how far it goes, and
//     the wind along it;
//   - a whole cast through the real FishingRod: false casts carrying more line, shot at the best moment to land where it's
//     aimed, too soon and on the back cast; a pick-up laid back down by itself; strips, held strips, stripped in;
//   - what a false cast's line over the flat spooks; a fly worked as each fish wants it; the flats licence;
//   - the rods: the fly picks its rod, the fly rig anywhere; a fish on a fly fought on its tippet, bowed to as it jumps, and the
//     sweep's F combos landing what each rod is for.
//   node test/fly.mjs
import { Vector3, Scene, PerspectiveCamera } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { FishingRod } from '../src/game/FishingRod.js';
import { FlyCast, FLY, strokeTime, releaseOf, castLength } from '../src/game/FlyCast.js';
import { FLY_RODS, flyRodFor, gearStats, defaultUpgrades, LB } from '../src/game/Gear.js';
import { BAITS } from '../src/game/Bait.js';
import { falseCastScare, castScare, FALSE_CAST, SPLASH } from '../src/game/Sight.js';
import { workedTake, WORK } from '../src/game/Bites.js';
import { FlatsFishing } from '../src/game/FlatsFishing.js';
import { FLATS, flatsAt } from '../src/world/terrain/Flats.js';
import { Rigs } from '../src/game/rigs/Rigs.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { cell, termsOf, sizeKg } from '../tools/fight-sweep.mjs';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};
const near = ( a, b, e ) => Math.abs( a - b ) <= e;

// ---- the rhythm and the release
{

	ok( near( 2 * strokeTime( 9 ), 2.4, 1e-9 ) && near( 2 * strokeTime( 12 ), 3, 1e-9 ), `a false cast at 9 m of line 2.4 s, at 12 m 3 s (the sources' derived ${ ( 2 * strokeTime( 9 ) ).toFixed( 1 ) }, ${ ( 2 * strokeTime( 12 ) ).toFixed( 1 ) })` );
	ok( releaseOf( - 1, 0.5, 9 ).kind === 'heap', 'let go on the back cast: a heap' );
	ok( releaseOf( 1, 0.2, 9 ).kind === 'tail', 'before the rod stops: a tailing loop' );
	const best = releaseOf( 1, FLY.stroke + FLY.best, 9 ), edge = releaseOf( 1, FLY.stroke + 0.6 * 0.9 - 0.01, 9 );
	ok( best.kind === 'good' && best.q === 1 && edge.kind === 'good' && edge.q >= 0.6 && edge.q < 0.65, `as it stops, the best (q ${ best.q }); at the window's end still good (q ${ edge.q.toFixed( 2 ) })` );
	ok( releaseOf( 1, FLY.stroke + 0.6 * 0.9 + 0.02, 9 ).kind === 'late', 'past the window: late' );
	const fig = FLY_RODS[ 8 ], shoot = fig.castM - fig.carryM;
	ok( fig.carryM === 14 && shoot === 8, `the rod carries ${ fig.carryM } m and shoots ${ shoot } more: 22 m, the Keys' 75 ft, at best` );
	ok( near( castLength( 9, shoot, best ), 17, 1e-9 ) && near( castLength( 9, shoot, { kind: 'tail', q: 0 } ), 9 + 8 * FLY.tail, 1e-9 ) && near( castLength( 9, shoot, { kind: 'heap', q: 0 } ), 9 * FLY.heap, 1e-9 ), 'two false casts and a good shoot: 17 m, a fair caster\'s 56 ft; a tailing loop or a heap far short' );
	ok( near( castLength( 14, shoot, best, - 7 ), 22 * 0.75, 1e-9 ) && near( castLength( 14, shoot, best, 7 ), 22 * 7 / 6, 1e-9 ), 'into a 7 m/s wind a quarter short, with it a sixth on' );

}

// ---- a whole cast through the real rod
const query = { allocate: () => 0, setPoint() {}, cpuValid: true, cpu: new Float32Array( [ 0, 0, 0, - 1 ] ) }; // a metre of water
function caster( { flyRods = [ 8, 10, 12 ], fly = 'flyShrimp' } = {} ) {

	const camera = new PerspectiveCamera();
	camera.position.set( 0, 1.7, 0 );
	camera.lookAt( 0, 1.7, 10 );
	camera.updateMatrixWorld( true );
	const scene = new Scene();
	const rod = new FishingRod( { scene, camera, query, terrain: { heightAt: () => - 1 } } );
	const landed = [];
	const game = {
		rod, bite: null, hookBait: null, flats: null, toasts: [], struck: 0,
		app: { camera, scene, audio: null },
		state: { stats: { flyRods }, baitPick: fly },
		toast( t ) {

			this.toasts.push( t );

		},
		baitHook() {

			this.hookBait = this.state.baitPick;

		},
		strike() {

			this.struck ++;

		},
	};
	rod.onLand = ( w ) => landed.push( w );
	rod.equip( true );
	rod.setRig( 'fly', true );
	rod.setGear( { castM: 22, reelSpeed: 0.7, spoolM: 210, fly: 8 } );
	const f = new FlyCast( game );
	game.flyCast = f;
	let held = false;
	const frame = ( { lDown = false, lUp = false, rDown = false } = {} ) => {

		f.input( { lDown, lUp, lmb: held, rDown } );
		rod.update( 1 / 60, { visible: true } );
		f.update( 1 / 60 );

	};
	for ( let i = 0; i < 30; i ++ ) frame();
	return { rod, game, f, frame, landed, hold: ( h ) => ( held = h ), camera };

}

{

	G.windSpeed.value = 0;
	const C = caster(), { rod, f, frame } = C;
	C.hold( true );
	f.start( true );
	frame( { lDown: true } );
	ok( rod.state === 'falsecast' && f.stroke === - 1 && f.L === FLY.start, `held, it's false casting: a back cast with ${ f.L } m out` );
	let maxElev = 0, t = 0, peak = 0;
	while ( f.casts < 2 && t < 20 ) {

		frame();
		t += 1 / 60;
		maxElev = Math.max( maxElev, rod.pose.elev );
		peak = Math.max( peak, rod.bobber.y );

	}

	ok( f.casts === 2 && near( f.L, FLY.start + 2 * FLY.gain, 1e-9 ), `two false casts carry ${ f.L } m (each ${ FLY.gain } m more)` );
	ok( near( t, 2 * strokeTime( 5 ) + 2 * strokeTime( 7 ), 0.05 ), `taking the line's own time: ${ t.toFixed( 2 ) } s` );
	ok( maxElev > 1.5 && peak > 2.5, `the rod back past upright (${ maxElev.toFixed( 2 ) } rad), the line in the air over your head (${ peak.toFixed( 2 ) } m)` );
	ok( f.line && f.line.meshes.every( ( m ) => m.visible ) && ! rod.lineMesh.visible, 'the loop drawn, the line to a float not' );
	// on to the forward stroke's best moment, and let go
	while ( ! ( f.stroke > 0 && f.t >= FLY.stroke + FLY.best ) ) frame();
	const L = f.L;
	C.hold( false );
	frame( { lUp: true } );
	ok( rod.state === 'shoot' && f.shot.rel.kind === 'good' && f.shot.rel.q > 0.97, `let go as the rod stops: shot (${ f.shot.rel.kind }, q ${ f.shot.rel.q.toFixed( 2 ) })` );
	let s = 0;
	while ( rod.state === 'shoot' && s < 5 ) {

		frame();
		s += 1 / 60;

	}

	// (measured from the tip where it ends: the rod comes down through the shot, a metre on from where it was let go)
	const out = Math.hypot( rod.bobber.x - rod.tip.x, rod.bobber.z - rod.tip.z ), aim = Math.atan2( rod.bobber.x - C.camera.position.x, rod.bobber.z - C.camera.position.z );
	ok( rod.state === 'floating' && C.landed[ 0 ] === 'water' && rod.rig === 'fly', `down on the water, fished (${ rod.state }, landed ${ C.landed[ 0 ] })` );
	ok( near( out, L + 8, 0.3 ) && Math.abs( aim ) < 0.05, `${ out.toFixed( 1 ) } m out from the tip (the line ${ L } m and 8 shot), where you looked (${ ( aim * 180 / Math.PI ).toFixed( 1 ) } degrees off), in ${ s.toFixed( 2 ) } s` );
	ok( C.game.hookBait === 'flyShrimp' && rod.flySink === BAITS.flyShrimp.sink && f.landing.hard === 1, 'the fly on as it goes, sinking at its own pace, landing softly' );
	frame();
	ok( ! f.line.meshes.some( ( m ) => m.visible ) && rod.lineMesh.visible && rod.lineMat.uniforms.lineShow.value > 1, 'on the water, the line from the tip drawn as a fly line' );
	// it sinks, and a strip brings it 0.6 m and lifts it
	for ( let i = 0; i < 60 * 3; i ++ ) frame();
	ok( rod.hookM > 0.5 && rod.hookM < 0.96, `left 3 s, it's gone down to the bottom (${ rod.hookM.toFixed( 2 ) } m)` );
	const b0 = rod.bobber.clone(), h0 = rod.hookM;
	frame( { lDown: true } );
	for ( let i = 0; i < 40; i ++ ) frame();
	ok( near( b0.distanceTo( rod.bobber ), FLY.strip, 0.02 ) && f.strips === 1 && f.work().still < 1, `a tap strips it ${ b0.distanceTo( rod.bobber ).toFixed( 2 ) } m toward you` );
	ok( h0 - rod.hookM > 0 || rod.hookM < h0 + 0.1, 'and lifts it off the bottom' );
	// held: on and on
	C.hold( true );
	const n0 = f.strips;
	for ( let i = 0; i < 60 * 3; i ++ ) frame();
	ok( f.strips - n0 >= 3 && f.work().fast, `held, it strips on (${ f.strips - n0 } in 3 s), fast` );
	C.hold( false );
	for ( let i = 0; i < 60 * 40 && rod.state === 'floating'; i ++ ) {

		if ( i % 30 === 0 ) frame( { lDown: true } );
		else frame();

	}

	ok( rod.state === 'idle' && rod.rig === 'fly', 'stripped all the way in: on the keeper, ready to cast again' );

}

{

	// the first press with the fly rig just picked: the rod's line not yet a fly's when the button's read (Game reads FlyCast's
	// input first, then the rig's press starts the false cast), and it goes on
	const C = caster(), { rod, f } = C;
	rod.setRig( 'float' );
	C.hold( true );
	ok( ! f.input( { lDown: true, lmb: true } ), 'the press read with a float on: not the fly\'s' );
	rod.setRig( 'fly', true );
	f.start( true );
	rod.update( 1 / 60, { visible: true } );
	f.update( 1 / 60 );
	for ( let i = 0; i < 30; i ++ ) C.frame();
	ok( rod.state === 'falsecast', `and false casting goes on from it (${ rod.state })` );

}

{

	// too soon, on the back cast, and a pick-up laid back down by itself
	const C = caster(), { rod, f, frame } = C;
	C.hold( true );
	f.start( true );
	while ( ! ( f.stroke > 0 && f.t >= 0.1 ) ) frame();
	C.hold( false );
	frame( { lUp: true } );
	ok( f.shot.rel.kind === 'tail' && f.shot.hard > 1 && C.game.toasts.some( ( t ) => /tailing/.test( t ) ), 'let go before the rod stops: a tailing loop, landing hard, and you\'re told' );
	while ( rod.state === 'shoot' ) frame();
	ok( rod.state === 'floating' && f.landing.hard === FLY.hard.tail, 'it lands hard' );
	C.hold( false );
	frame( { rDown: true } );
	ok( rod.state === 'falsecast' && ! f.hold && f.stroke === - 1, 'the other button picks it up into a back cast' );
	const L = f.L;
	let t = 0;
	while ( rod.state !== 'floating' && t < 8 ) {

		frame();
		t += 1 / 60;

	}

	ok( rod.state === 'floating' && near( f.landing.hard, 1, 1e-9 ), `not held on, it's laid straight back down, well (in ${ t.toFixed( 1 ) } s, ${ L.toFixed( 1 ) } m picked up)` );
	C.hold( true );
	f.start( true );
	for ( let i = 0; i < 20; i ++ ) frame();
	C.hold( false );
	frame( { lUp: true } );
	ok( f.shot.rel.kind === 'heap' && C.game.toasts.some( ( x ) => /back cast/.test( x ) ), 'let go on the back cast: it falls in a heap' );
	while ( rod.state === 'shoot' ) frame();
	ok( rod.state === 'floating' && Math.hypot( rod.bobber.x - rod.tip.x, rod.bobber.z - rod.tip.z ) < FLY.start, 'short' );
	// a panel opened mid false cast: the line comes in
	C.hold( true );
	f.start( true );
	frame();
	rod.update( 1 / 60, { visible: true } );
	f.update( 1 / 60 );
	ok( rod.state === 'idle', 'the rod\'s input held (a panel open): false casting stops' );

}

{

	// the wind
	G.windSpeed.value = 7;
	G.windDir.value.set( 0, - 1 ); // blowing at you
	const C = caster(), { rod, f, frame } = C;
	C.hold( true );
	f.start( true );
	while ( f.casts < 2 ) frame();
	while ( ! ( f.stroke > 0 && f.t >= FLY.stroke + FLY.best ) ) frame();
	C.hold( false );
	frame( { lUp: true } );
	ok( near( f.shot.L1, ( f.L + 8 ) * 0.75, 0.3 ), `into a 7 m/s wind: ${ f.shot.L1.toFixed( 1 ) } m of ${ f.L + 8 }` );
	G.windSpeed.value = 0;

}

// ---- the line in the air over the flat
{

	const a = { x: 0, z: 0 }, b = { x: 0, z: 12 };
	ok( falseCastScare( 'bonefish', 0, 6, a, b ) === 1 && falseCastScare( 'bonefish', FALSE_CAST.near, 6, a, b ) === 0, 'right under the line it\'s spooked; 4.6 m off it (15 ft), not' );
	const p = falseCastScare( 'bonefish', 2.3, 6, a, b ), pp = falseCastScare( 'permit', 2.3, 6, a, b ), pt = falseCastScare( 'tarpon', 2.3, 6, a, b );
	ok( near( p, 0.25, 1e-9 ) && pp > p && pt < p, `half way, a bonefish a quarter of the time a stroke; a permit, warier, more (${ pp.toFixed( 2 ) }); a tarpon less (${ pt.toFixed( 2 ) })` );
	ok( falseCastScare( 'bonefish', 0, 16, a, b ) === 0 || falseCastScare( 'bonefish', 0, 18, a, b ) < falseCastScare( 'bonefish', 0, 13, a, b ), 'past the line\'s end, short of it, less' );
	ok( falseCastScare( 'bonefish', 0, 20, a, b ) === 0, 'false cast short of it, and it\'s none' );
	const sun = { x: 1, y: 0.7, z: 0 };
	ok( falseCastScare( 'bonefish', - 5, 6, a, b, sun ) > 0 && falseCastScare( 'bonefish', 5, 6, a, b, sun ) === 0, 'on the line\'s shadow side, away from the sun, further' );
	ok( falseCastScare( 'blacktipShark', 0, 6, a, b ) === 0, 'a shark doesn\'t care' );
	ok( castScare( 'bonefish', 0.6, 6, { x: 0, z: 12 }, { x: 0, z: 0 }, 'flyShrimp', 1, 0.75 ) === 'line' && castScare( 'bonefish', 0.6, 6, { x: 0, z: 12 }, { x: 0, z: 0 }, 'flyShrimp' ) === null, 'a fly line laid 0.6 m from its back spooks it, where mono didn\'t' );
	ok( castScare( 'bonefish', 0.5, 0, { x: 0, z: 0 }, { x: 0, z: - 12 }, 'flyShrimp' ) === null && castScare( 'bonefish', 0.5, 0, { x: 0, z: 0 }, { x: 0, z: - 12 }, 'flyShrimp', FLY.hard.heap ) === 'cast', 'a fly 0.5 m off its head: landing softly it\'s not spooked, in a heap it is' );
	ok( SPLASH.flyShrimp < SPLASH.shrimp && SPLASH.flyCrab === SPLASH.live, 'the shrimp fly the softest landing; the crab fly as loud as a live bait' );
	// through FlatsFishing's own falseCast, on a school of one
	const spooked = [];
	const fish = { pos: new Float32Array( [ 1, 0, 6 ] ), sightGroups: [ { sight: { kind: 'bonefish', bolt: 0 }, active: true, center: { x: 1, z: 6 }, radius: 1 } ], sightFish: ( g, fn ) => fn( 0, 0 ) };
	const flats = Object.assign( Object.create( FlatsFishing.prototype ), { app: { fish }, near: () => true, shadeAt: () => 1, spooked: ( g, why ) => spooked.push( why ) } );
	flats.falseCast( a, b, () => 0.4 );
	flats.falseCast( { x: 8, z: 0 }, { x: 8, z: 12 }, () => 0 );
	ok( spooked.length === 1 && spooked[ 0 ] === 'falsecast', `a false cast over a school spooks it ('${ spooked[ 0 ] }'); one 7 m to the side doesn't` );

}

// ---- a fly worked
{

	const w = ( still, strips, fast = false ) => ( { still, moving: still < 0.8, strips, fast } );
	const lo = () => 0.01, hi = () => 0.99;
	ok( workedTake( 'bonefish', 'eat', w( 3, 1 ), lo ) === 'refuse' && workedTake( 'bonefish', 'eat', w( 0.5, 2 ), lo ) === 'eat', 'a bonefish loses interest in a fly left still, not in one stripped' );
	ok( workedTake( 'bonefish', 'refuse', w( 0.5, 3 ), lo ) === 'eat' && workedTake( 'bonefish', 'refuse', w( 0.5, 3 ), hi ) === 'refuse', 'and a fly well stripped turns a refusal now and then' );
	ok( workedTake( 'permit', 'refuse', w( 2, 1 ), lo ) === 'eat' && workedTake( 'permit', 'eat', w( 5, 1 ), lo ) === 'eat', 'a permit wants it stripped once and left dead' );
	ok( workedTake( 'barracuda', 'eat', w( 0.2, 4, false ), lo ) === 'refuse' && workedTake( 'barracuda', 'refuse', w( 0.2, 4, true ), lo ) === 'eat', 'a barracuda wants it stripped fast' );
	ok( workedTake( 'bonefish', 'spook', w( 0, 9 ), lo ) === 'spook' && workedTake( 'lemonShark', 'eat', w( 9, 0 ), lo ) === 'eat', 'a spook stays a spook; a kind with no way of its own as it was' );
	ok( WORK.permit.near > 1 && WORK.permit.want === 'still', 'a permit\'s moved fly spooks it once it\'s close' );

}

// ---- the flats licence
{

	let on = null;
	const [ x0, z0, x1, z1 ] = FLATS.window;
	for ( let x = x0; x < x1 && ! on; x += 7 ) for ( let z = z0; z < z1 && ! on; z += 7 ) if ( flatsAt( x, z ).on > 0.9 ) on = { x, z };
	const stats = { flatsLicence: false };
	const flats = Object.assign( Object.create( FlatsFishing.prototype ), { game: { state: { stats } } } );
	ok( on && ! flats.licensed( on.x, on.z ) && flats.licensed( x1 + 400, z1 + 400 ), 'with no flats licence nothing takes a bait on the flats; off them, anything' );
	stats.flatsLicence = true;
	ok( flats.licensed( on.x, on.z ), 'with it, the flats too' );
	const u = gearStats( { ...defaultUpgrades(), flatsLicence: 1 } );
	ok( u.flatsLicence === true && gearStats( defaultUpgrades() ).flatsLicence === false, 'the licence is Gear\'s flatsLicence' );

}

// ---- the rods, the rig
{

	ok( flyRodFor( [ 8, 10, 12 ], 10 ) === 10 && flyRodFor( [ 8 ], 10 ) === 8 && flyRodFor( [ 8, 10 ], 12 ) === 10 && flyRodFor( [], 8 ) === null, 'a fly on the rod it\'s tied for, else your heaviest' );
	const rigs = ( flyRods, baitPick, riding = false ) => Object.assign( Object.create( Rigs.prototype ), {
		game: { state: { stats: { ...gearStats( defaultUpgrades() ), flyRods }, baitPick, leaderPick: null }, rod: { rig: 'fly' }, hookBait: baitPick },
		app: { player: { riding, mode: 'walk' }, boat: {}, boatCtl: { speed: 0 } },
		kit: null,
	} );
	ok( ! rigs( [], 'flyShrimp' ).available( 'fly' ) && rigs( [ 8 ], 'flyShrimp' ).available( 'fly' ) && rigs( [ 8 ], 'flyShrimp', true ).available( 'fly' ), 'the fly rig: wanting a fly rod; with one, anywhere, riding along too' );
	const g = rigs( [ 8, 10 ], 'flyTarpon' ).rodGear( 'fly' );
	ok( g.fly === 10 && g.castM === FLY_RODS[ 10 ].castM && ! g.standUp, `the tarpon fly with the 8 and the 10: on the 10 (${ g.fly })` );
	const t = rigs( [ 8 ], 'flyShrimp' ).tackle;
	ok( t.lineKg === 12 * LB && t.dragKg === 4 && t.spoolM === 210, 'its tackle the 8-weight\'s: 12 lb tippet, 4 kg drag, 210 m' );

}

// ---- the fight on a fly
{

	const T = termsOf( { fly: 12, hold: 'hand' }, 'tarpon', 40 ), T10 = termsOf( { fly: 10, hold: 'hand' }, 'tarpon', 20 ), B = termsOf( { fly: 10, hold: 'hand' }, 'barracuda', 5 );
	ok( T.lineKg === 20 * LB && T.holdKg === 5.7 && T.bow > 0 && T.leaps && T.wear === 0 && T.leader === 'bite' && Math.round( T.tippetLb ) === 20, 'a tarpon on the 12-weight: the 20 lb tippet, the rod low, the bite tippet against its mouth, and it jumps' );
	ok( T10.wear > 0 && T10.leader === 'tippet' && B.cut > 0, 'on a crab fly\'s class tippet, its mouth wears through; a barracuda\'s teeth go through any tippet' );
	// bowed to as it jumps, it holds; reeled through every jump, it mostly doesn't
	const fight = ( bow ) => {

		let lost = 0, jumps = 0;
		for ( let i = 0; i < 40; i ++ ) {

			let x = ( i + 1 ) * 2654435761 >>> 0;
			const rng = () => ( ( x = ( x * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
			const g = new CatchMinigame( { species: 'tarpon', kg: 30, ...T, distance: 15, rng } );
			let st = 'fighting';
			while ( st === 'fighting' && g.time < 600 ) st = g.update( 1 / 30, g.tension < 0.68 && g.surge < 0.6 && ! ( bow && g.leap > 0 ) );
			if ( st === 'snapped' && g.jumped ) lost ++;
			jumps += g.jumped ? 1 : 0;

		}

		return lost / 40;

	};
	const bowed = fight( true ), tight = fight( false );
	ok( bowed === 0 && tight > 0.4, `a 30 kg tarpon on the 12-weight: bowed to, none lost to a jump; reeled through them, ${ Math.round( tight * 100 ) }% lost` );
	const no = new CatchMinigame( { species: 'tarpon', kg: 30, lineKg: 30 * LB, dragKg: 15, holdKg: 10, spoolM: 300, leaps: true, rng: () => 0.5 } );
	ok( no.bow === 0, 'off a fly, no bowing: the fights as they were' );
	// the sweep's F combos
	const r = ( id, q, c ) => cell( { key: c, fly: + c.slice( 1 ), hold: 'hand' }, id, sizeKg( id, q ), 20 );
	const bone = r( 'bonefish', 0.99, 'F8' ), permit = r( 'permit', 0.99, 'F10' ), tarpon = r( 'tarpon', 0.99, 'F12' ), small = r( 'tarpon', 0.3, 'F10' );
	ok( bone.caught === 1 && permit.caught === 1 && tarpon.caught === 1, `each rod lands the biggest of what it's for, played with care: a ${ sizeKg( 'bonefish', 0.99 ).toFixed( 1 ) } kg bonefish on the 8 in ${ bone.t.toFixed( 0 ) } s, a ${ sizeKg( 'permit', 0.99 ).toFixed( 1 ) } kg permit on the 10 in ${ permit.t.toFixed( 0 ) } s, a ${ sizeKg( 'tarpon', 0.99 ).toFixed( 1 ) } kg tarpon on the 12 in ${ tarpon.t.toFixed( 0 ) } s` );
	ok( small.caught >= 0.8, `a small tarpon on the 10-weight's crab fly mostly (${ Math.round( small.caught * 100 ) }%)` );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
