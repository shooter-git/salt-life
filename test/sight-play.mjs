// (M17) Sight-fishing played, in plain Node (docs/m17/sight.md): game/FlatsFishing.js with the flats' fish drawn
// (world/Fish.js, the island's ground) and a stand-in for the game and the rod: a bait put ahead of a school is seen by
// its first fish whose way it's in, which comes to it and takes it (the bite's then that fish, its kind and its weight
// from its own length), or refuses it; a kayak rushing at a school spooks it into Flats' record and it bolts; a cast on
// its head spooks it; the slams come in through it; and a sleep ends the island day for them.
//   node test/sight-play.mjs
import { readFileSync } from 'node:fs';
import { Vector3, Group } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FishSchools } from '../src/world/Fish.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { FlatsFishing } from '../src/game/FlatsFishing.js';
import { flatsSchools } from '../src/game/Flats.js';
import { FISH } from '../src/game/FishTable.js';
import { G } from '../src/core/Globals.js';
import { tideAt } from '../src/game/IslandClock.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const u = ( value ) => ( { value } );
const ground = { uniforms: { terrainSeaLevel: u( 0 ), terrainWaterAbsorption: u( new Vector3() ), terrainCaustics: u( null ), terrainTime: u( 0 ), terrainNight: u( 0 ) } };

// a cruising school of bonefish by day, in a light air, over water a kayak floats in
let T = null, school = null;
for ( let day = 3; day < 40 && ! school; day ++ ) for ( let h = 10.5; h <= 14 && ! school; h += 0.25 ) {

	const t = ( day - 1 ) * 24 + h;
	const s = flatsSchools( t, { wind: 2.5, overcast: 0, hour: h } ).find( ( q ) => q.kind === 'bonefish' && q.mode === 'cruise' && q.life > 0.99 && q.n >= 6 && tideAt( t ) - terrain.heightAt( q.x, q.z ) > 0.35 );
	if ( s ) {

		T = t;
		school = s;

	}

}

check( !! school, `a cruising school of ${ school.n } bonefish, island hour ${ T }` );
G.seaLevel.value = tideAt( T );
G.sunDir.value.set( 0.2, 0.9, 0.38 ).normalize();
G.windSpeed.value = 2.5;
G.night.value = 0;
G.rain.value = 0;

// the stand-ins: the app (its fish, camera, clock), the game (its state, the rod, toasts) and the rod
function play() {

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt: ( x, z ) => terrain.heightAt( x, z ), center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: [] } );
	const camera = { position: new Vector3( school.x - 12, G.seaLevel.value + 0.81, school.z ) };
	const app = { fish, camera, settings: { day: Math.floor( T / 24 ) + 1, timeOfDay: T % 24 }, terrainData: terrain, player: { mode: 'boat' }, boatCtl: { model: { stroke: { wet: false, T: 1.1 } } }, sky: { clouds: { coverage: { value: 0 } } } };
	const toasts = [];
	const rod = { state: 'floating', bobber: new Vector3(), tip: new Vector3(), snapped: 0, snap() {

		this.snapped ++;

	} };
	const game = { app, rod, state: { stats: { polarized: true }, trophies: {}, save() {} }, weatherNow: { overcast: 0 }, bite: null, hookBait: null, toast: ( t ) => toasts.push( t ), placeAt: () => 'flats' };
	const flats = new FlatsFishing( game );
	const step = ( n, dt = 1 / 30 ) => {

		for ( let k = 0; k < n; k ++ ) {

			G.time.value += dt;
			flats.update( dt );
			fish.update( dt, camera.position );
			if ( game.bite ) flats.watch( game.bite, dt );

		}

	};

	step( 30 );
	return { fish, camera, game, flats, rod, toasts, step };

}

// ---- a bait put ahead of the school: one sees it, comes to it, and takes it or turns off
{

	const takes = { eat: 0, refuse: 0, spook: 0, none: 0 };
	let kgOk = true, tried = 0;
	for ( let k = 0; k < 24; k ++ ) {

		const P = play(), g = P.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === school.id );
		if ( ! g ) continue;
		tried ++;
		// (on the way of its leading fish, a metre and a half ahead of its nose)
		let lead = null;
		P.fish.sightFish( g, ( i ) => {

			if ( lead === null ) lead = i;

		} );
		const L = P.fish.size[ lead ], h = P.fish.head, hl = Math.hypot( h[ lead * 3 ], h[ lead * 3 + 2 ] ) || 1;
		P.rod.bobber.set( P.fish.pos[ lead * 3 ] + h[ lead * 3 ] / hl * ( 1.3 + L * 0.5 ), G.seaLevel.value, P.fish.pos[ lead * 3 + 2 ] + h[ lead * 3 + 2 ] / hl * ( 1.3 + L * 0.5 ) );
		P.rod.tip.set( P.camera.position.x, P.camera.position.y, P.camera.position.z );
		P.game.bite = { phase: 'wait', t: 1e9 };
		P.flats.landed( P.rod.bobber, P.rod.tip, null );
		const bite = P.game.bite;
		let saw = false;
		for ( let f = 0; f < 300 && bite.phase === 'wait'; f ++ ) {

			P.step( 1 );
			saw = saw || !! P.flats.follow;
			if ( saw && ! P.flats.follow && bite.phase === 'wait' ) break;

		}

		if ( bite.phase === 'take' ) {

			takes.eat ++;
			const f = FISH[ bite.species ];
			kgOk = kgOk && bite.species === 'bonefish' && bite.seen && bite.kg >= f.kg[ 0 ] && bite.kg <= f.kg[ 1 ] && P.flats.state.hooked[ school.id ] === 1;

		} else if ( P.flats.state.spooked[ school.id ] ) takes.spook ++;
		else if ( saw ) takes.refuse ++;
		else takes.none ++;

	}

	check( tried === 24 && takes.eat >= 6 && takes.refuse + takes.spook >= 3, `24 casts put ahead of a cruising school: ${ takes.eat } taken, ${ takes.refuse } refused, ${ takes.spook } spooked, ${ takes.none } not seen` );
	check( kgOk, 'each taken: the bite is that bonefish, its weight from its own length, one fewer in its school' );

}

// ---- what spooks them
{

	const P = play();
	const g = P.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === school.id );
	// a kayak paddled hard at them from 12 m
	const c = P.camera.position, to = new Vector3( g.center.x - c.x, 0, g.center.z - c.z ).normalize();
	let why = null;
	for ( let f = 0; f < 150 && ! why; f ++ ) {

		c.addScaledVector( to, 1.8 / 30 );
		P.step( 1 );
		why = P.flats.state.spooked[ school.id ] ? P.flats.events.spooked : null;

	}

	check( why === 'speed' || why === 'push', `a kayak paddled hard at them: spooked (${ why }), the school in Flats' record as spooked` );
	check( g.sight && g.sight.bolt > 0, 'and it bolts' );
	P.step( 150 );
	check( ! P.fish.sightGroups.some( ( h ) => h.sight && h.sight.id === school.id ), 'gone from the flat a while once its run\'s over' );

}

{

	const P = play();
	const g = P.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === school.id );
	let i0 = null;
	P.fish.sightFish( g, ( i ) => {

		if ( i0 === null ) i0 = i;

	} );
	P.rod.bobber.set( P.fish.pos[ i0 * 3 ] + 0.1, G.seaLevel.value, P.fish.pos[ i0 * 3 + 2 ] );
	P.rod.tip.set( P.camera.position.x, P.camera.position.y, P.camera.position.z );
	P.flats.landed( P.rod.bobber, P.rod.tip, null );
	check( P.flats.state.spooked[ school.id ] && P.flats.events.spooked === 'cast', 'a cast on one\'s head: the school spooked' );

}

{

	const P = play();
	// sitting still 12 m off a while: nothing
	P.step( 300 );
	check( ! P.flats.state.spooked[ school.id ], 'sitting still in the kayak 12 m off for 10 s: not spooked' );
	// the slams: a bonefish, a permit and a tarpon; a sleep between the second and the third
	const g = P.game, day = P.game.app.settings.day;
	P.flats.caught( { species: 'bonefish', kg: 2, place: 'flats', released: true } );
	P.flats.caught( { species: 'permit', kg: 8, place: 'flats', released: true } );
	P.game.app.settings.timeOfDay += 2; // (a rest: the clock's jumped)
	P.step( 1 );
	const none = P.flats.caught( { species: 'tarpon', kg: 30, place: 'flats', released: true } );
	check( none.length === 0 && ! g.state.trophies[ 'slam:grand' ], 'a rest between the second and the third: no slam' );
	P.flats.caught( { species: 'bonefish', kg: 2, place: 'flats', released: true } );
	const note = P.flats.caught( { species: 'permit', kg: 8, place: 'flats', released: true } );
	// ((M17's stream 7) caught() gives the slams' ids, the catch card their note)
	check( note.join() === 'grand' && g.state.trophies[ 'slam:grand' ].n === 1 && P.game.app.settings.day === day, `then a bonefish and a permit the same day: "${ note }"` );

}

if ( failed ) {

	console.log( `\n${ failed } failed` );
	process.exit( 1 );

}
