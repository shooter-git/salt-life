// (v2.4.1) Plain-node tests of the fish box's two bars (Seaworthy's boxBars, GameHUD.drawHold): how many more fish fit,
// against the room they can have (the box less the ice their catch must keep), and how long the ice keeps the catch, in
// time at the box's net melt. Each in your own box and riding along in someone else's.
//   node test/box-bars.mjs
import { boxBars, fishRoom, roomLow, iceHours, iceLow, iceSaid, iceHeld, shortOf, meltKgH, CHILL_KG, HELD_H, FRESH_H, ROOM_LOW } from '../src/game/Seaworthy.js';
import { DaysOut } from '../src/game/DaysOut.js';
import { GameState } from '../src/game/GameState.js';
import { SharedBox } from '../src/together/SharedBox.js';
import { weatherAt } from '../src/game/Weather.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Vector3 } from '../src/engine/index.js';
import { LB } from '../src/game/Units.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};
const near = ( a, b, e = 1e-6 ) => Math.abs( a - b ) <= e;
const lb = ( kg ) => Math.round( kg * LB );
const BIG = meltKgH( 600, true ), DAY = BIG * HELD_H; // (the sportfisher's big insulated box: 0.67 kg an hour, 16 kg a day)

// ---- how many more fish fit
{

	// no ice: the box is all room for fish
	const none = boxBars( { cap: 600, ice: 0, melt: BIG, makes: 0, others: 0 }, 50 );
	ok( none.room === 600 && none.fish === 50 && ! none.full && none.spare === 0, `no ice: 50 of 600 kg, all of it room for fish (${ JSON.stringify( none ) })` );
	ok( boxBars( { cap: 600, ice: 0, melt: BIG, makes: 0, others: 0 }, 600 ).full && ! boxBars( { cap: 600, ice: 0, melt: BIG, makes: 0, others: 0 }, 500 ).full, 'and it\'s coral packed to the lid, not at 500 kg' );

	// some ice, less than a day's: all of it's kept, so the room is the box less it
	const some = boxBars( { cap: 600, ice: 10, melt: BIG, makes: 0, others: 0 }, 50 );
	ok( near( some.room, 590 ) && some.spare === 0, `10 kg of ice, under a day's ${ DAY.toFixed( 1 )}: all kept for the catch, 590 kg of room (${ some.room })` );

	// a box full of ice with two small fish: the player's screenshot ("Hold 1323 / 1323 lb" in red, 13 lb of fish)
	const full = boxBars( { cap: 600, ice: 594, melt: BIG, makes: 0, others: 0 }, 6 );
	ok( near( full.room, 600 - DAY ) && lb( full.fish ) === 13 && lb( full.room ) === 1287 && ! full.full, `a box full of ice and two small fish: ${ lb( full.fish ) } / ${ lb( full.room ) } lb, not coral (the room's the box less a day's ice, ${ DAY.toFixed( 1 ) } kg)` );
	ok( near( full.spare, 594 - DAY ), `${ full.spare.toFixed( 0 ) } kg of it spare, to give way to fish as they go in` );

	// the bar and the catch card agree: shortOf decides both
	for ( const ice of [ 0, 3, 10, 50, 300 ] ) for ( const fish of [ 0, 100, 400, 500, 520, 540, 560, 580 ] ) {

		const box = { cap: 600, fish, ice: Math.min( ice, 600 - fish ), melt: BIG };
		const room = fishRoom( box ), left = room - fish;
		// (whatever the bar shows left, a fish that size goes in; a full bar's coral and the card has no room)
		if ( left > 0 && shortOf( box, left ) > 1e-6 ) ok( false, `room shown that isn't there: ${ JSON.stringify( box ) }` );
		if ( left <= 1e-9 && ! roomLow( box ) ) ok( false, `a full bar not coral: ${ JSON.stringify( box ) }` );
		if ( roomLow( box ) !== ( shortOf( box, ROOM_LOW * room ) > 1e-6 ) ) ok( false, `coral by another rule: ${ JSON.stringify( box ) }` );

	}

	ok( true, 'the room the bar shows always takes a fish that size, and a full bar is always coral (40 boxes)' );
	const at = ( fish ) => roomLow( { cap: 600, fish, ice: 300, melt: BIG } );
	ok( ! at( 600 - DAY - ROOM_LOW * ( 600 - DAY ) - 1 ) && at( 600 - DAY - ROOM_LOW * ( 600 - DAY ) + 1 ), `coral when there's no room for a fish a tenth of the room (${ ( ROOM_LOW * ( 600 - DAY ) ).toFixed( 0 ) } kg in the big box)` );

	// a fish going in: the hold bar grows by it, its chill comes off the ice, the spare goes for it, the ice bar's still full
	const before = { cap: 600, ice: 594, melt: BIG, makes: 0, others: 0 };
	const after = { ...before, ice: Math.min( before.ice - CHILL_KG * 40, 600 - 46 ) };
	const a = boxBars( after, 46 ), b = boxBars( before, 6 );
	ok( near( a.fish, b.fish + 40 ) && near( a.room, b.room ) && a.ice === 1 && b.ice === 1 && a.hours < b.hours, `a 40 kg tuna in: ${ lb( b.fish ) } -> ${ lb( a.fish ) } lb of ${ lb( a.room ) }; the ice bar full both times, its time ${ iceSaid( b.hours ) } -> ${ iceSaid( a.hours ) }` );

	// melt takes the ice under a day: the room it held goes to fish
	const low = boxBars( { cap: 600, ice: 8, melt: BIG, makes: 0, others: 0 }, 6 );
	ok( near( low.room, 592 ) && low.room > full.room && near( low.ice, 8 / BIG / HELD_H ), `the ice down to 8 kg, half a day's: the room's 592 kg (from ${ full.room.toFixed( 1 ) }), the ice bar ${ ( low.ice * 100 ).toFixed( 0 ) }%` );

}

// ---- how long the catch keeps
{

	ok( iceHours( { ice: 0, melt: BIG, makes: 0 } ) === 0 && iceSaid( 0 ) === 'No ice', 'no ice: none, said so' );
	const noFish = boxBars( { cap: 600, ice: 594, melt: BIG, makes: 0, others: 0 }, 0 );
	ok( noFish.ice === 1 && ! noFish.low && iceSaid( noFish.hours ) === '37 days', `no fish, a box full of ice: ${ iceSaid( noFish.hours ) } of it, the bar full` );
	ok( ! boxBars( { cap: 600, ice: 0, melt: BIG, makes: 0, others: 0 }, 0 ).low, 'no fish and no ice: nothing to keep, not coral' );
	const making = boxBars( { cap: 600, ice: 20, melt: BIG, makes: 5, others: 0 }, 6 );
	ok( making.hours === Infinity && making.ice === 1 && ! making.low && iceSaid( making.hours ) === 'Making', 'an icemaker keeping up: making, the bar full' );
	ok( boxBars( { cap: 600, ice: 0, melt: BIG, makes: 5, others: 0 }, 594 ).hours === Infinity, 'and with the box full of fish and no room for ice, still (it\'s made as the ice melts)' );
	const behind = boxBars( { cap: 600, ice: 10, melt: BIG, makes: 0.5, others: 0 }, 6 );
	ok( near( behind.hours, 10 / ( BIG - 0.5 ) ), `one that can't keep up: the ice lasts at the net melt (${ iceSaid( behind.hours ) })` );

	// a kayak's cooler running out: its crate's 25 kg
	const melt = meltKgH( 25, false );
	const cool = boxBars( { cap: 25, ice: 0.9, melt, makes: 0, others: 0 }, 5.6 );
	ok( iceSaid( cool.hours ) === '5 h' && cool.low && near( cool.ice, 0.9 / melt / HELD_H ), `a kayak's cooler with 0.9 kg of ice and three fish: ${ iceSaid( cool.hours ) } left, coral (under FRESH_H, ${ FRESH_H } h)` );
	ok( ! boxBars( { cap: 25, ice: 0.9, melt, makes: 0, others: 0 }, 0 ).low, 'the same with no fish in it: not coral' );
	ok( ! boxBars( { cap: 25, ice: 1.2, melt, makes: 0, others: 0 }, 5.6 ).low, `with ${ iceSaid( 1.2 / melt ) } of ice, not yet` );
	ok( boxBars( { cap: 25, ice: 0, melt, makes: 0, others: 0 }, 5.6 ).low, 'no ice at all with fish in it: coral' );
	ok( iceSaid( 0.6 ) === '36 min' && iceSaid( 30.5 ) === '30 h' && iceSaid( 49 ) === '2 days', `the times as said: ${ [ 0.6, 5.5, 30.5, 49, 889 ].map( iceSaid ).join( ', ' ) }` );

}

// ---- riding along: the bars from her box, as her owner's game tells it, the same on both games
globalThis.setTimeout ??= ( f ) => f();
const sent = [];
function game( { id, name, boat, upgrades = {}, moored = false } ) {

	const st = new GameState( null ), settings = { day: 5, timeOfDay: 9, timeSpeed: 0.01, weatherSince: 0 };
	st.boat = boat;
	st.fleet[ boat ] ||= {};
	Object.assign( st.upgrades, upgrades );
	st.money = 1000;
	const dock = WORLD.boatDock.position;
	const b = {
		position: new Vector3( 9000, 0, 9000 ), quaternion: { setFromAxisAngle() {} }, velocity: new Vector3(), angular: new Vector3(), stemHead: new Vector3( 0, 1, 4 ), speed: 0, moored, anchor: null, sock: false, hauled: null, driven: false,
		model: { bunks: [], id: boat }, getYaw: () => 0, apply() {}, liftClear() {}, reset() { this.moored = true; this.position.set( dock.x, 0, dock.z ); }, toWorld: ( v, o ) => o.copy( v ), setHauled() {},
	};
	const p = { mode: 'boat', riding: false, boat: b, deckPos: new Vector3(), prompt: null, busy: false, leaveHelm() {}, deckToWorld() {} };
	const app = { _pickedUp: true, settings, player: p, boatCtl: b, weather: { live: { ...weatherAt( 40, 'fair' ) }, news: null }, terrainData: { heightAt: () => - 300 }, weatherPick: () => 'fair', portal: null, camera: { position: new Vector3() } };
	const T = { app, me: { id, name }, others: new Map(), roomKnown: true, surelyAlone: false, session: { send: ( kind, body ) => sent.push( { kind, body, from: id } ) } };
	T.box = new SharedBox( T );
	app.together = T;
	const g = { app, state: st, hull: { flooded: false, wear: 0 }, toast: () => {}, time: null, hud: null, martaIn: true, dropAnchor() {}, _wearSaved: 0 };
	app.game = g;
	const d = new DaysOut( g );
	g.daysOut = d;
	d.update( 0, { hit: () => false }, p );
	return { id, st, d, p, b, T };

}

const games = new Map();
const look = () => {

	for ( let i = 0; i < 2; i ++ ) {

		for ( const G of games.values() ) {

			G.T.box._t = - Infinity;
			G.T.box.update( 1 );

		}

		while ( sent.length ) {

			const m = sent.shift();
			for ( const [ gid, G ] of games ) if ( gid !== m.from ) {

				if ( m.kind === 'box' ) G.T.box.told( m.body, m.from );
				if ( m.kind === 'boxIn' ) G.T.box.given( m.body, m.from );

			}

		}

	}

};
const bars = ( G ) => boxBars( G.st.box(), G.st.holdKg );

{

	// Robin at the helm of her sportfisher, a box full of ice and her icemaker off; Sam aboard her, his kayak at her berth
	const A = game( { id: 'A', name: 'Robin', boat: 'sportfisher', upgrades: { sfFishBox: 1 } } );
	const B = game( { id: 'B', name: 'Sam', boat: 'kayak', moored: true } );
	games.set( 'A', A ).set( 'B', B );
	A.d.box.ice = 590;
	A.st.addFish( 'muttonSnapper', 4, 10 );
	A.d._stamp();
	B.p.mode = 'deck';
	B.p.riding = true;
	B.p.boat = { owner: 'A', model: { id: 'sportfisher' } };
	A.T.others.set( 'B', { person: { id: 'B', name: 'Sam' }, cur: { ride: 'A', mode: 'deck' } } );
	B.T.others.set( 'A', { person: { id: 'A', name: 'Robin' }, cur: { boat: {}, mode: 'helm', ride: null, boatId: 'sportfisher' } } );
	const own = bars( B );
	ok( own.room <= B.st.stats.holdKg, `before her owner's game has said anything: his own cooler's bars (${ own.room.toFixed( 1 ) } kg of room)` );
	look();
	const g0 = bars( B ), o0 = bars( A );
	ok( near( g0.room, 600 - DAY, 0.02 ) && near( g0.fish, 4, 0.01 ) && near( g0.hours, o0.hours, 0.5 ) && g0.ice === 1, `aboard her: his bars are her box's (${ lb( g0.fish ) } / ${ lb( g0.room ) } lb, ice ${ iceSaid( g0.hours ) }), as hers are` );

	// his mahi in her box: both hold bars grow by it, its chill comes off her ice, and both ice bars say so
	B.st.addFish( 'mahi', 8, 10 );
	B.d._stamp();
	look();
	look();
	const g1 = bars( B ), o1 = bars( A );
	ok( near( g1.fish, 12, 0.02 ) && near( o1.fish, 12, 0.02 ) && near( g1.room, o1.room, 0.02 ), `his 8 kg mahi in: ${ lb( g1.fish ) } lb on his bar and on hers (${ lb( o1.fish ) })` );
	ok( g1.hours < g0.hours && near( g1.hours, o1.hours, 0.5 ) && near( A.d.box.ice, 590 - CHILL_KG * 4 - CHILL_KG * 8 - ( 0 ), 0.5 ), `its chill off her ice: ${ iceSaid( g0.hours ) } -> ${ iceSaid( g1.hours ) } on both` );

	// her ice down to a few hours: coral on both games, his fish in it as well as hers
	A.d.box.ice = 2;
	look();
	const g2 = bars( B ), o2 = bars( A );
	ok( g2.low && o2.low && iceSaid( g2.hours ) === iceSaid( o2.hours ) && near( g2.room, 598, 0.02 ), `her ice down to 2 kg: ${ iceSaid( g2.hours ) }, coral on both, and the room it held gone to fish (${ lb( g2.room ) } lb)` );

	// her icemaker on, under way on her generator: being made, on his game too
	A.st.upgrades.sfIcemaker = 1;
	A.st.upgrades.sfGenerator = 1;
	look();
	const g3 = bars( B );
	ok( g3.hours === Infinity && iceSaid( g3.hours ) === 'Making' && ! g3.low, 'her icemaker on: making, on his bar too' );

	// stepped off: his own cooler again, his fish in it, and no ice in it
	B.p.riding = false;
	B.p.boat = B.b;
	A.T.others.get( 'B' ).cur.ride = null;
	look();
	const g4 = bars( B );
	ok( B.T.box.herBox() === null && near( g4.fish, 8, 0.01 ) && g4.hours === 0 && g4.low && near( g4.room, B.st.stats.holdKg ), `stepped off her: his own cooler, his mahi (${ lb( g4.fish ) } lb) and no ice, coral` );

}

if ( bad ) {

	console.error( `\nthe box's bars: ${ bad } failed` );
	process.exit( 1 );

}

console.log( '\nthe box\'s bars: all passed' );
