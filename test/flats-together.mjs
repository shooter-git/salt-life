// (M17) The flats together, in plain Node (docs/m17/flats-together.md): two real games' sight-fishing (game/FlatsFishing.js, the
// flats' fish drawn by world/Fish.js on the island's ground), each with its together/FlatsShare.js, joined by a stand-in for the
// room (its shared values, kept for whoever comes, and its messages). A school spooked on Robin's game bolts and stays gone
// on Sam's, from the same island time; a fish Sam hooks is one fewer on Robin's for the rest of its visit; Ann, joining later,
// reads the flat as it stands; what's long past is let go; a guest's slam is the guest's; and a fish Robin's looking at is
// called to Sam by the clock, and Sam, told where to look, sees it better.
//   node test/flats-together.mjs
import { readFileSync } from 'node:fs';
import { Vector3, Group, PerspectiveCamera } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FishSchools } from '../src/world/Fish.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { FlatsFishing } from '../src/game/FlatsFishing.js';
import { flatsSchools, newFlatsState, spook, hook, forgetFlats, mergeFlats, flatsWire, cleanFlats, FLATS_FISH } from '../src/game/Flats.js';
import { FlatsShare, callText, CALL, FLATS_KEY } from '../src/together/FlatsShare.js';
import { seenOnFlats } from '../src/game/Sight.js';
import { G } from '../src/core/Globals.js';
import { tideAt } from '../src/game/IslandClock.js';

let failed = 0;
const ok = ( good, what ) => {

	console.log( ( good ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! good ) failed ++;

};

// ---- the record itself (game/Flats.js)
{

	const a = newFlatsState(), b = newFlatsState();
	spook( a, 'bone:80:1', 1000, - 600.04, - 120.06 );
	spook( b, 'bone:80:1', 1000.2, - 590, - 110 );
	hook( a, 'bone:80:1' );
	hook( b, 'bone:80:1' );
	hook( b, 'permit:80:0' );
	const m = mergeFlats( newFlatsState(), [ a, b ] );
	ok( m.spooked[ 'bone:80:1' ] === Math.round( ( 1000.2 + FLATS_FISH.quiet ) * 100 ) / 100 && m.at[ 'bone:80:1' ][ 0 ] === - 590 && m.hooked[ 'bone:80:1' ] === 2 && m.hooked[ 'permit:80:0' ] === 1, 'merged: gone till the latest spook (from where that one was), one fewer for each fish anyone hooked' );
	const w = flatsWire( a ), back = cleanFlats( JSON.parse( JSON.stringify( w ) ) );
	ok( back.spooked[ 'bone:80:1' ] === a.spooked[ 'bone:80:1' ] && back.at[ 'bone:80:1' ][ 0 ] === - 600 && back.hooked[ 'bone:80:1' ] === 1, `sent and read back: ${ JSON.stringify( w ) } (${ JSON.stringify( w ).length } characters)` );
	const bad = cleanFlats( { s: { 'bone:1:1': [ 'x' ], 'nope:1': [ 5 ], 'cuda:4:0': [ 99, 1, 2 ], ['<b>'.repeat( 3 )]: [ 1 ] }, h: { 'bone:2:0': - 1, 'tarpon:3:1': 1.5, 'snook:7:2': 2, 'bone:-1:0': 1 } } );
	ok( Object.keys( bad.spooked ).join() === 'cuda:4:0' && Object.keys( bad.hooked ).sort().join() === 'bone:-1:0,snook:7:2', 'what\'s malformed dropped' );
	const many = { s: {}, h: {} };
	for ( let i = 0; i < 400; i ++ ) many.h[ `bone:${ i }:0` ] = 1;
	ok( Object.keys( cleanFlats( many ).hooked ).length === 120, 'and no more than a record keeps' );

	// what's long past let go, by each school's own visit: a high water's (k), an island day's (barracuda, tarpon), a lunation's
	const T = 1000.5, day = Math.floor( T / 24 ), k = Math.round( T / 12.4206 ), s = newFlatsState();
	for ( const id of [ `tarpon:${ day }:0`, `cuda:${ day }:1`, `bone:${ k }:2`, `bone:${ k - 1 }:0`, `tarpon:${ day - 1 }:0`, `bone:${ k - 3 }:0`, 'spawn:0' ] ) hook( s, id );
	spook( s, `bone:${ k }:2`, T - 1, 0, 0 );
	spook( s, `bone:${ k }:1`, T, 0, 0 );
	forgetFlats( s, T );
	ok( Object.keys( s.hooked ).sort().join() === [ `bone:${ k - 1 }:0`, `bone:${ k }:2`, `cuda:${ day }:1`, `tarpon:${ day }:0` ].sort().join(), `a tarpon or a barracuda hooked today kept till tomorrow (a day's school was read as a high water, and came back), this tide's and the last's kept, older let go: ${ Object.keys( s.hooked ).join( ' ' ) }` );
	ok( Object.keys( s.spooked ).join() === `bone:${ k }:1` && Object.keys( s.at ).join() === `bone:${ k }:1`, 'a spook whose quiet is over let go, with where it was from' );

}

// ---- the words of a call
{

	// (facing +z, yaw 0: +x is to your left)
	const at = { x: 0, z: 0, yaw: 0 };
	const a = callText( 'bonefish', 'cruise', 8, 0, 12, 0, - 1, at );
	const b = callText( 'bonefish', 'tail', 4, 12, 0, 0, 1, at );
	const c = callText( 'permit', 'cruise', 2, - 9, 9, 0.707, 0.707, at );
	const d = callText( 'tarpon', 'laid', 1, 0, - 15, 1, 0, at );
	const e = callText( 'bonefish', 'cruise', 3, 0, 20, 0, 1, at );
	ok( a === 'a school of bonefish, 12 o\'clock, 40 ft, coming at you', `straight ahead, coming: "${ a }"` );
	ok( b === 'tailing bonefish, 9 o\'clock, 40 ft', `off your left, tailing: "${ b }"` );
	ok( c === 'two permit, 2 o\'clock, 40 ft, moving left', `off your right bow, two going across: "${ c }"` );
	ok( d === 'laid-up tarpon, 6 o\'clock, 50 ft', `astern, laid up: "${ d }"` );
	ok( e === 'bonefish, 12 o\'clock, 70 ft, going away', `ahead, going away: "${ e }"` );

}

// ---- two games on the flat, a room between them
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const u = ( value ) => ( { value } );
const ground = { uniforms: { terrainSeaLevel: u( 0 ), terrainWaterAbsorption: u( new Vector3() ), terrainCaustics: u( null ), terrainTime: u( 0 ), terrainNight: u( 0 ) } };
const deep = ( q, t ) => tideAt( t ) - terrain.heightAt( q.x, q.z ) > 0.35;

// two schools of bonefish over water a wader stands in, by day in a light air
let T = null, A = null, B = null;
for ( let day = 3; day < 60 && ! A; day ++ ) for ( let h = 10.5; h <= 14 && ! A; h += 0.25 ) {

	const t = ( day - 1 ) * 24 + h;
	const bones = flatsSchools( t, { wind: 2.5, overcast: 0, hour: h } ).filter( ( q ) => q.kind === 'bonefish' && q.life > 0.99 && q.n >= 4 && q.mode !== 'mill' && deep( q, t ) );
	for ( const a of bones ) for ( const b of bones ) if ( a !== b && Math.hypot( a.x - b.x, a.z - b.z ) > 25 && Math.hypot( a.x - b.x, a.z - b.z ) < 70 && ! A ) {

		T = t;
		A = a;
		B = b;

	}

}

ok( !! A, `two schools of bonefish, ${ A.id } (${ A.n }, ${ A.mode }) and ${ B.id } (${ B.n }, ${ B.mode }), ${ Math.round( Math.hypot( A.x - B.x, A.z - B.z ) ) } m apart, island hour ${ T }` );
G.seaLevel.value = tideAt( T );
G.sunDir.value.set( 0.2, 0.9, 0.38 ).normalize();
G.windSpeed.value = 2.5;
G.night.value = 0;
G.rain.value = 0;
const clock = { day: Math.floor( T / 24 ) + 1, timeOfDay: T % 24 };
const setT = ( t ) => {

	clock.day = Math.floor( t / 24 ) + 1;
	clock.timeOfDay = t - ( clock.day - 1 ) * 24;
	G.seaLevel.value = tideAt( t );

};

// the room: its shared values (kept for whoever comes; each change to everyone, the one who made it too) and its messages
const room = { values: new Map(), sessions: [], sets: 0 };
function join( id ) {

	const any = [], on = new Map();
	const S = {
		id, mode: 'shared',
		get: ( k ) => room.values.get( k ) ?? null,
		entries: ( p = '' ) => [ ...room.values ].filter( ( [ k ] ) => k.startsWith( p ) ),
		set: async ( k, v ) => {

			room.sets ++;
			const val = JSON.parse( JSON.stringify( v ) );
			room.values.set( k, val );
			for ( const s of room.sessions ) s._value( k, val, id );

		},
		onAnyChange: ( f ) => any.push( f ),
		on: ( kind, f ) => ( on.get( kind ) || on.set( kind, [] ).get( kind ) ).push( f ),
		send: ( kind, body ) => {

			for ( const s of room.sessions ) if ( s !== S ) s._msg( kind, JSON.parse( JSON.stringify( body ) ), id );

		},
		_value: ( k, v, by ) => any.forEach( ( f ) => f( k, v, by ) ),
		_msg: ( kind, body, from ) => ( on.get( kind ) || [] ).forEach( ( f ) => f( body, from ) ),
	};
	room.sessions.push( S );
	return S;

}

const players = new Map(); // id -> the game
function game( id, name, at ) {

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt: ( x, z ) => terrain.heightAt( x, z ), center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: [] } );
	const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
	camera.position.set( at.x, G.seaLevel.value + 1.62, at.z );
	const app = { fish, camera, settings: clock, terrainData: terrain, player: { mode: 'walk', position: camera.position }, boatCtl: null, sky: { clouds: { coverage: { value: 0 } } } };
	const toasts = [];
	const rod = { state: 'floating', bobber: new Vector3(), tip: new Vector3(), snapped: 0, snap() {} };
	const g = { app, rod, state: { stats: { polarized: true }, trophies: {}, save() {} }, weatherNow: { overcast: 0 }, bite: null, hookBait: null, toast: ( t ) => toasts.push( t ), placeAt: () => 'flats' };
	app.game = g;
	g.flats = new FlatsFishing( g );
	const others = new Map();
	const t = { session: join( id ), me: { id, name }, others, app };
	const P = { id, name, app, fish, camera, game: g, flats: g.flats, toasts, rod, t, share: null };
	players.set( id, P );
	// (who else is here, as Together has them: their name, and where they are)
	for ( const o of players.values() ) if ( o !== P ) {

		others.set( o.id, { person: { id: o.id, name: o.name }, cur: { pos: o.camera.position } } );
		o.t.others.set( id, { person: { id, name }, cur: { pos: camera.position } } );

	}

	P.share = new FlatsShare( t );
	return P;

}

// each game a frame: its sight-fishing, its fish, its share of the flats
const step = ( n = 1, dt = 1 / 30, who = [ ...players.values() ] ) => {

	for ( let k = 0; k < n; k ++ ) {

		G.time.value += dt;
		for ( const P of who ) {

			P.flats.update( dt );
			P.fish.update( dt, P.camera.position );
			P.share.update( dt );
			if ( P.game.bite ) P.flats.watch( P.game.bite, dt );

		}

	}

};
const group = ( P, id ) => P.fish.sightGroups.find( ( g ) => g.sight && g.sight.id === id && g.active );
const listed = ( P, t = T ) => flatsSchools( t, { wind: 2.5, overcast: 0, hour: t % 24 }, P.flats.state ).map( ( q ) => `${ q.id }:${ q.n }` ).sort().join( ' ' );
// (standing with the sun behind you, d m off a school, so it shows)
const sun = { x: G.sunDir.value.x, z: G.sunDir.value.z }, sl = Math.hypot( sun.x, sun.z );
const off = ( q, d, turn = 0 ) => {

	const a = Math.atan2( sun.z / sl, sun.x / sl ) + turn;
	return { x: q.x + Math.cos( a ) * d, z: q.z + Math.sin( a ) * d };

};

const robin = game( 'robin-1', 'Robin', off( A, 11 ) ), sam = game( 'sam-1', 'Sam', off( A, 16, 1.2 ) );
step( 45 );
ok( !! group( robin, A.id ) && !! group( sam, A.id ), `the same school on both games: ${ A.id } (Robin ${ Math.round( robin.camera.position.distanceTo( group( robin, A.id ).center ) ) } m off, Sam ${ Math.round( sam.camera.position.distanceTo( group( sam, A.id ).center ) ) } m)` );

// ---- a school spooked on Robin's game: it bolts on Sam's, and stays gone for its quiet time from the same island time
{

	const gR = group( robin, A.id );
	let lead = null;
	robin.fish.sightFish( gR, ( i ) => {

		if ( lead === null ) lead = i;

	} );
	// (a cast on its leading fish's head)
	const at = new Vector3( robin.fish.pos[ lead * 3 ], G.seaLevel.value, robin.fish.pos[ lead * 3 + 2 ] );
	robin.rod.tip.copy( robin.camera.position );
	robin.flats.landed( at, robin.rod.tip, null );
	const until = robin.flats.mine.spooked[ A.id ];
	ok( until === Math.round( ( T + FLATS_FISH.quiet ) * 100 ) / 100 && gR.sight.bolt > 0 && robin.flats.events.spooked === 'cast', `Robin's cast on its head: it bolts on his game, in his record till island hour ${ until.toFixed( 3 ) }` );
	const before = room.sets;
	step( 3 );
	ok( room.sets === before && ! room.values.get( FLATS_KEY + 'robin-1' ), 'not written at once (a hook and its spook go as one)' );
	step( 12 );
	const gS = group( sam, A.id );
	const rec = room.values.get( FLATS_KEY + 'robin-1' );
	ok( rec && rec.s[ A.id ] && sam.flats.state.spooked[ A.id ] === until && sam.flats.state.at[ A.id ] && gS && gS.sight.bolt > 0, `on Sam's: bolting from where Robin's bait landed (${ sam.flats.state.at[ A.id ].join( ', ' ) }), gone till the same ${ sam.flats.state.spooked[ A.id ].toFixed( 2 ) }; Robin's record ${ JSON.stringify( rec ) }` );
	ok( sam.flats.events.spooked === 'theirs' && ! sam.flats.mine.spooked[ A.id ], 'Sam told someone else spooked it (the Guide\'s tip), and it\'s not in his own record' );
	step( 150 );
	ok( ! group( robin, A.id ) && ! group( sam, A.id ) && ! listed( sam ).includes( A.id ) && ! listed( robin ).includes( A.id ), 'five seconds on, its run over, gone from both games' );
	// (back on both at the same island time: its quiet's end)
	const t1 = until - 0.01, t2 = until + 0.01;
	ok( ! listed( sam, t1 ).includes( A.id ) && ! listed( robin, t1 ).includes( A.id ) && listed( sam, t2 ).includes( A.id ) && listed( robin, t2 ).includes( A.id ), `and back on both at the end of its quiet, ${ ( FLATS_FISH.quiet * 100 ).toFixed( 0 ) } s of play by day` );

}

// ---- a fish Sam hooks from the other school: one fewer on Robin's for the rest of its visit
let hooked = null;
{

	sam.camera.position.set( off( B, 12 ).x, G.seaLevel.value + 1.62, off( B, 12 ).z );
	sam.flats._was.has = false;
	robin.camera.position.set( off( B, 18, - 1.1 ).x, G.seaLevel.value + 1.62, off( B, 18, - 1.1 ).z );
	robin.flats._was.has = false;
	step( 45 );
	const gS = group( sam, B.id ), gR = group( robin, B.id );
	ok( !! gS && !! gR, `${ B.id } on both games (Sam 12 m off, Robin 18)` );
	const n0 = gR.sight.n;
	// (one of them comes to his bait and eats it: as Bites.seenTake has it, a follow ending in a take)
	let fk = null, fi = null;
	sam.fish.sightFish( gS, ( i, k ) => {

		if ( fk === null ) {

			fk = k;
			fi = i;

		}

	} );
	const bite = { phase: 'wait', t: 1e9 };
	sam.game.bite = bite;
	sam.rod.bobber.set( sam.fish.pos[ fi * 3 ], G.seaLevel.value, sam.fish.pos[ fi * 3 + 2 ] );
	sam.flats.cast = { at: { x: sam.rod.bobber.x, z: sam.rod.bobber.z }, bait: 'shrimp', tried: new Set(), t: 0 };
	sam.flats.follow = { g: gS, k: fk, id: B.id, kind: 'bonefish', act: 'eat', t: 0, L: sam.fish.size[ fi ], speed: 1, bite };
	sam.flats.watch( bite, 1 / 30 );
	hooked = bite;
	ok( bite.phase === 'take' && bite.species === 'bonefish' && sam.flats.mine.hooked[ B.id ] === 1 && sam.flats.mine.spooked[ B.id ] && gS.sight.bolt > 0, `Sam's on: a ${ bite.kg.toFixed( 2 ) } kg bonefish from ${ B.id }, the rest bolting; in his record` );
	step( 15 );
	ok( robin.flats.state.hooked[ B.id ] === 1 && gR.sight.bolt > 0 && ! robin.flats.mine.hooked[ B.id ], `on Robin's: the school bolts, one fewer (${ n0 } to ${ n0 - robin.flats.state.hooked[ B.id ] }), none of it his` );
	const back = sam.flats.state.spooked[ B.id ] + 0.01, inR = flatsSchools( back, { wind: 2.5, overcast: 0, hour: back % 24 }, robin.flats.state ).find( ( q ) => q.id === B.id ), bare = flatsSchools( back, { wind: 2.5, overcast: 0, hour: back % 24 } ).find( ( q ) => q.id === B.id );
	ok( inR && bare && inR.n === bare.n - 1, `back from its fright on Robin's, it's ${ inR && inR.n } of ${ bare && bare.n }` );

}

// ---- Ann joins later: the flat as it stands, from the room
{

	const ann = game( 'ann-1', 'Ann', off( B, 30, 2.2 ) );
	ok( Math.abs( ann.flats.state.spooked[ A.id ] - robin.flats.state.spooked[ A.id ] ) < 0.006 && ann.flats.state.hooked[ B.id ] === 1 && ! Object.keys( ann.flats.mine.hooked ).length, 'Ann, joining, has Robin\'s spook and Sam\'s hook from the room\'s records, none of them hers' );
	for ( const t of [ T + 0.1, T + 0.7, T + 2 ] ) ok( listed( ann, t ) === listed( robin, t ) && listed( ann, t ) === listed( sam, t ), `at island hour ${ t.toFixed( 1 ) } the same fish on all three: ${ listed( ann, t ) }` );
	// (and Sam, reloading: his own record's still in the room, his own again)
	const was = sam.flats.mine.hooked[ B.id ];
	sam.flats.mine = { spooked: {}, hooked: {}, at: {} };
	sam.flats.state = { spooked: {}, hooked: {}, at: {} };
	sam.share = new FlatsShare( sam.t );
	ok( was === 1 && sam.flats.mine.hooked[ B.id ] === 1 && sam.flats.state.hooked[ B.id ] === 1 && sam.flats.state.spooked[ A.id ], 'Sam back after a reload: his hook his own again, Robin\'s spook with it' );
	room.sessions.splice( room.sessions.indexOf( ann.t.session ), 1 );
	players.delete( ann.id );
	for ( const P of players.values() ) P.t.others.delete( ann.id );

}

// ---- a guest's slam is the guest's: Sam's bonefish, then his permit and tarpon, all on his own game
{

	const day = 4;
	const caught = ( P, species, kg ) => P.flats.caught( { species, kg, place: 'flats' } );
	sam.game.state.trophies.today = null;
	const got = [ caught( sam, 'bonefish', hooked.kg ), caught( sam, 'permit', 9.2 ), caught( sam, 'tarpon', 34 ) ].map( ( x ) => x.join( '+' ) || '-' );
	ok( got.join( ' ' ) === '- - grand' && sam.game.state.trophies[ 'slam:grand' ] && ! robin.game.state.trophies[ 'slam:grand' ] && ! robin.game.state.trophies.today, `Sam's bonefish (hooked from the flat they share), permit and tarpon: ${ got.join( ' ' ) }, the grand slam his, nothing on Robin's` );
	void day;

}

// ---- a fish Robin's looking at, called to Sam by the clock; Sam, told where to look, sees it better
{

	// (a third school, or the second back: whichever's on the flat later, in sight of Robin)
	let t = null, C = null;
	for ( let h = 0.75; h < 4 && ! C; h += 0.05 ) {

		const tt = T + h;
		C = flatsSchools( tt, { wind: 2.5, overcast: 0, hour: tt % 24 }, robin.flats.state ).find( ( q ) => q.kind === 'bonefish' && q.life > 0.99 && q.mode !== 'mill' && deep( q, tt ) );
		if ( C ) t = tt;

	}

	setT( t );
	let at = null;
	// (where Robin sees it plainly: the sun at his back, a few metres off)
	for ( const d of [ 6, 8, 10, 12, 14 ] ) {

		robin.camera.position.set( off( C, d ).x, G.seaLevel.value + 1.62, off( C, d ).z );
		robin.flats._was.has = false;
		sam.camera.position.set( off( C, 26, Math.PI * 0.9 ).x, G.seaLevel.value + 1.62, off( C, 26, Math.PI * 0.9 ).z );
		sam.flats._was.has = false;
		step( 30 );
		const g = group( robin, C.id );
		if ( g ) {

			robin.camera.lookAt( g.center.x, G.seaLevel.value, g.center.z );
			step( 2 );
			if ( Math.max( g.sight.seen.body, g.sight.seen.shadow, g.sight.seen.tail, g.sight.seen.sign ) > CALL.seen ) {

				at = d;
				break;

			}

		}

	}

	const gR = group( robin, C.id ), gS = group( sam, C.id );
	ok( at !== null && !! gS, `${ C.id } (${ C.mode }) seen by Robin ${ at } m off with the sun behind him; Sam on the far side of it` );
	// (Sam looking somewhere else: away from it)
	sam.camera.lookAt( sam.camera.position.x + ( sam.camera.position.x - gS.center.x ), sam.camera.position.y, sam.camera.position.z + ( sam.camera.position.z - gS.center.z ) );
	const seenBefore = { ...gS.sight.seen };
	const calls0 = robin.share.calls;
	step( 12 ); // (0.4 s: not long enough)
	ok( robin.share.calls === calls0, 'looked at for less than a second: not called' );
	step( 30 );
	ok( robin.share.calls === calls0 + 1 && sam.toasts.length && /^Robin: /.test( sam.toasts.at( - 1 ) ) && robin.toasts.some( ( x ) => /^You call it: /.test( x ) ), `looked at a second: called. Sam hears "${ sam.toasts.at( - 1 ) }"; Robin "${ robin.toasts.filter( ( x ) => /^You call it/.test( x ) ).at( - 1 ) }"` );
	// (Sam's clock: his facing, away from it, so it's astern of him: 5 to 7 o'clock; the distance his)
	const m = /, (\d+) o'clock, (\d+) ft/.exec( sam.toasts.at( - 1 ) ), dS = Math.hypot( gS.center.x - sam.camera.position.x, gS.center.z - sam.camera.position.z ) / 0.3048;
	ok( m && [ 5, 6, 7 ].includes( + m[ 1 ] ) && Math.abs( + m[ 2 ] - dS ) <= 6, `from where Sam is, looking away from it: ${ m && m[ 1 ] } o'clock, ${ m && m[ 2 ] } ft (he's ${ dS.toFixed( 0 ) } ft from it)` );
	ok( sam.flats.toldOf( C.id ) === 1 && sam.flats.events.called === 'Robin', 'Sam\'s told where to look (and the Guide\'s tip, the first time)' );
	// (and where it's at the edge of his seeing, told where to look he sees it: found from his own game's reckoning, the sun
	// behind him too, further off than Robin; then drawn so by his game)
	const L = ( gS.sp.length[ 0 ] + gS.sp.length[ 1 ] ) / 2;
	const reckon = ( told ) => {

		const depth = Math.max( 0, G.seaLevel.value - terrain.heightAt( gS.center.x, gS.center.z ) );
		return seenOnFlats( { ...sam.flats._look( gS.center.x, gS.center.z, L, 'bonefish', depth, sam.flats.bottomAt( gS.center.x, gS.center.z ) ), tailUp: 0, sign: 0, told }, {} ).body;

	};
	let edge = null;
	for ( let d = 4; d < 45 && ! edge; d += 0.5 ) {

		const p = { x: gS.center.x + ( sun.x / sl * Math.cos( 0.5 ) - sun.z / sl * Math.sin( 0.5 ) ) * d, z: gS.center.z + ( sun.x / sl * Math.sin( 0.5 ) + sun.z / sl * Math.cos( 0.5 ) ) * d };
		sam.camera.position.set( p.x, G.seaLevel.value + 1.62, p.z );
		if ( reckon( 0 ) < 0.25 && reckon( 1 ) > 0.75 ) edge = { d, v0: reckon( 0 ), v1: reckon( 1 ) };

	}

	sam.flats._was.has = false;
	step( 1 );
	const drawn = gS.sight.seen.body, now0 = reckon( 0 );
	ok( edge && drawn > 0.6 && now0 < 0.4, edge ? `and at the edge of his seeing (${ edge.d } m off, the sun behind him) he sees it, knowing where to look: its body ${ now0.toFixed( 2 ) } searching, ${ drawn.toFixed( 2 ) } told, as his game draws it` : 'no edge found' );
	// (how much further: a bonefish over white sand from a wader's eye, searched for and told where it is)
	const q = { h: 1.62, d: 10, L: 0.55, depth: 0.5, bottom: 0.55, back: 0.15, glasses: true, sun: 0.9, behind: 1, shade: 0, overcast: 0, wind: 3, rain: 0, night: 0, tailUp: 0, sign: 0, told: 0 };
	const range = ( told ) => {

		let r = 0;
		for ( let d = 2; d < 80; d += 0.25 ) if ( seenOnFlats( { ...q, d, told } ).body > 0.5 ) r = d;
		return r;

	};
	const r0 = range( 0 ), r1 = range( 1 );
	ok( r1 > r0 * 1.2 && r1 < r0 * 1.8, `a bonefish on white sand from a wader with the glasses: seen to ${ r0.toFixed( 1 ) } m searching, ${ r1.toFixed( 1 ) } m told where it is` );
	step( 40 );
	ok( sam.share.calls === 0, 'Sam doesn\'t call it back' );
	// (nobody near it: not called)
	sam.camera.position.set( sam.camera.position.x + 200, sam.camera.position.y, sam.camera.position.z );
	sam.flats._was.has = false;
	robin.share._calledAt.clear();
	const n1 = robin.share.calls;
	step( 60, 1 / 30, [ robin ] );
	ok( robin.share.calls === n1, 'with nobody within 60 m of it, it isn\'t called' );

}

// ---- what's long past let go: two days on, every record empties and the room's copies with them
{

	setT( T + 50 );
	step( 1 );
	for ( const P of players.values() ) P.share._forgetT = 0;
	step( 15 );
	const R = room.values.get( FLATS_KEY + 'robin-1' ), S = room.values.get( FLATS_KEY + 'sam-1' );
	ok( [ ...players.values() ].every( ( P ) => ! Object.keys( P.flats.state.spooked ).length && ! Object.keys( P.flats.state.hooked ).length && ! Object.keys( P.flats.mine.hooked ).length ), 'two days on, nothing left in anyone\'s record' );
	ok( R && S && ! Object.keys( R.s ).length && ! Object.keys( R.h ).length && ! Object.keys( S.s ).length && ! Object.keys( S.h ).length, `and the room's copies written empty: ${ JSON.stringify( R ) } ${ JSON.stringify( S ) }` );
	// (someone joining then has nothing to read; one joining with a stale record left in the room lets it go)
	room.values.set( FLATS_KEY + 'gone-1', flatsWire( hook( spook( newFlatsState(), A.id, T, 0, 0 ), B.id ) ) );
	const late = game( 'late-1', 'Lee', off( A, 20 ) );
	ok( ! Object.keys( late.flats.state.spooked ).length && ! Object.keys( late.flats.state.hooked ).length, 'someone joining reads what\'s left in the room and lets go what\'s long past' );

}

console.log( failed ? `\n${ failed } failed` : '\nall passed' );
process.exit( failed ? 1 : 0 );
