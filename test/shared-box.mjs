// (v2.3.0) Plain-node tests of one fish box aboard (together/SharedBox.js, game/DaysOut.js, Seaworthy's room held for ice):
// a guest's catch in the box of the boat he's riding, kept on her ice and his to keep; her owner's ice chilling it; the
// room held for the ice the catch needs; an icemaker that stops when the box is full. Two games on stand-ins, their
// messages carried between them by hand.
//   node test/shared-box.mjs
import { iceHeld, shortOf, holdWord, meltKgH, CHILL_KG, HELD_H, OFF_H } from '../src/game/Seaworthy.js';
import { DaysOut } from '../src/game/DaysOut.js';
import { GameState } from '../src/game/GameState.js';
import { SharedBox } from '../src/together/SharedBox.js';
import { weatherAt } from '../src/game/Weather.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Vector3 } from '../src/engine/index.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};
const near = ( a, b, e = 1e-6 ) => Math.abs( a - b ) <= e;

// ---- the rule
{

	const box = { cap: 600, fish: 0, ice: 100, melt: meltKgH( 600, true ) };
	ok( near( iceHeld( box, 0 ), box.melt * HELD_H ), `a day's melt of the ice is held for the catch (${ ( box.melt * HELD_H ).toFixed( 1 ) } kg in the big box)` );
	ok( near( iceHeld( { ...box, ice: 20 }, 40 ), 20 - CHILL_KG * 40 ), 'or what there is once the fish is chilled, if that\'s less' );
	ok( iceHeld( { ...box, ice: 0 } ) === 0 && shortOf( { ...box, ice: 0, fish: 590 }, 10 ) <= 0, 'no ice in the box: none held, the fish fill it' );
	ok( shortOf( { ...box, fish: 590 }, 10 ) > 0, 'with ice in it, a box can\'t be packed to the lid with fish' );
	ok( shortOf( { ...box, fish: 500 }, 60 ) <= 0, 'and short of that it takes them' );
	ok( holdWord( 30 ) === 'cooler' && holdWord( 70 ) === 'hold' && holdWord( 600 ) === 'hold' && holdWord( 12 ) === 'cooler', 'a cooler, and from an ice chest up, a hold' );
	const plain = new GameState( null );
	const cap = plain.stats.holdKg;
	ok( plain.fits( cap ) && ! plain.fits( cap + 0.1 ) && plain.box().ice === 0, `without the game, your boat's cooler as it was: its fish alone (${ cap } kg)` );

}

// ---- the game side, on stand-ins: a game, its DaysOut, its Together with a SharedBox, its messages kept for delivering
globalThis.setTimeout ??= ( f ) => f();
const sent = [];
function game( { id, name, boat, upgrades = {}, moored = false } ) {

	const toasts = [], st = new GameState( null ), settings = { day: 5, timeOfDay: 9, timeSpeed: 0.01, weatherSince: 0 };
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
	const g = { app, state: st, hull: { flooded: false, wear: 0 }, toast: ( t ) => toasts.push( t ), time: null, hud: null, martaIn: true, dropAnchor() {}, _wearSaved: 0 };
	app.game = g;
	const d = new DaysOut( g );
	g.daysOut = d;
	d.update( 0, { hit: () => false }, p );
	return { id, st, d, p, b, T, app, toasts };

}

const games = new Map();
const deliver = () => {

	while ( sent.length ) {

		const m = sent.shift();
		for ( const [ id, G ] of games ) if ( id !== m.from ) {

			if ( m.kind === 'box' ) G.T.box.told( m.body, m.from );
			if ( m.kind === 'boxIn' ) G.T.box.given( m.body, m.from );

		}

	}

};
// a second's looks on both games, and what they say delivered
const look = () => {

	for ( let i = 0; i < 2; i ++ ) {

		for ( const G of games.values() ) {

			G.T.box._t = - Infinity;
			G.T.box.update( 1 );

		}

		deliver();

	}

};

// Jeremy at the helm of his sportfisher (the big box), 100 kg of ice in her; Dave aboard her, his lobster boat (a 30 kg
// cooler, no ice) at her berth
const A = game( { id: 'A', name: 'Jeremy', boat: 'sportfisher', upgrades: { sfFishBox: 1 } } );
const B = game( { id: 'B', name: 'Dave', boat: 'lobster', moored: true } );
games.set( 'A', A ).set( 'B', B );
A.d.box.ice = 100;
B.p.mode = 'deck';
B.p.riding = true;
B.p.boat = { owner: 'A', model: { id: 'sportfisher' } };
A.T.others.set( 'B', { person: { id: 'B', name: 'Dave' }, cur: { ride: 'A', mode: 'deck' } } );
B.T.others.set( 'A', { person: { id: 'A', name: 'Jeremy' }, cur: { boat: {}, mode: 'helm', ride: null, boatId: 'sportfisher' } } );

{

	ok( B.T.box.herBox() === null && B.st.box().cap === 30, 'before her owner\'s game has said anything: his own cooler' );
	look();
	const her = B.T.box.herBox(), box = B.st.box();
	ok( !! her && box.cap === 600 && near( box.ice, 100, 0.01 ) && box.whose === 'Jeremy' && box.word === 'hold', `aboard her, her owner here: her hold, ${ box.cap } kg, her ice (${ box.ice } kg)` );
	const tuna = B.st.addFish( 'yellowfin', 40, 10 );
	ok( !! tuna && B.st.inventory.length === 1, 'a 40 kg tuna kept: there\'s room in her hold, though his own cooler holds 30 kg' );
	B.d._stamp();
	ok( B.d.box.ice === 0 && near( B.T.box.herBox().ice, 100, 0.01 ), 'his own box\'s ice isn\'t touched: hers chills it' );
	look();
	ok( near( A.d.box.ice, 100 - CHILL_KG * 40, 0.02 ) && near( A.d.guestsKg, 40, 0.01 ), `her owner's game: her ice chilled it (${ A.d.box.ice.toFixed( 1 ) } kg left), and his tuna's in her box` );
	const ab = A.st.box();
	ok( near( ab.others, 40, 0.01 ) && ab.by.length === 1 && ab.by[ 0 ].name === 'Dave' && ab.by[ 0 ].n === 1, 'her owner sees whose it is: Dave\'s 1 fish' );
	look();
	look();
	ok( near( A.d.box.ice, 100 - CHILL_KG * 40, 0.02 ), 'chilled once, however often he says it' );
	ok( A.st.inventory.length === 0 && A.st.toJSON().inventory.length === 0 && B.st.toJSON().inventory.length === 1, 'his fish is in his save, not hers' );
	ok( ! A.st.fits( 561 ) && A.st.fits( 559 ), 'her owner\'s own room: Dave\'s catch takes some of it' );

	// thirteen hours on her ice
	A.d.pass( 13 );
	look();
	B.d.pass( 13 );
	ok( B.st.inventory.length === 1 && tuna.w < 1 && tuna.value === tuna.v0, `thirteen hours on: his tuna is iced, as fresh as it came in (${ tuna.w.toFixed( 2 ) } warm hours)` );
	ok( near( B.T.box.herBox().ice, A.d.box.ice, 0.01 ) && A.d.box.ice < 100 - CHILL_KG * 40, 'her ice melts on her owner\'s game, and he\'s told it' );

	// the room held for the ice: he can't fill her to the lid
	A.d.box.ice = 200;
	look();
	const room = 600 - 40 - meltKgH( 600, true ) * HELD_H;
	ok( B.st.shortOf( room + 2 ) > 0 && B.st.fits( room - 2 ), `room held for her ice: a fish of ${ ( room - 2 ).toFixed( 0 ) } kg fits, one of ${ ( room + 2 ).toFixed( 0 ) } doesn't` );

}

// with no ice left in her, his catch is on the warm hours like anyone's
{

	A.d.box.ice = 0;
	look();
	const f = B.st.addFish( 'mahi', 8, 12 );
	B.d._stamp();
	look();
	B.d.pass( OFF_H + 0.1 );
	ok( ! B.st.inventory.includes( f ), 'her ice gone: his mahi off in half a day, as anyone\'s would be' );

}

// he steps off her: his fish go with him; she's her owner's box again
{

	const n = B.st.inventory.length;
	B.p.riding = false;
	B.p.boat = B.b;
	A.T.others.get( 'B' ).cur.ride = null;
	look();
	ok( B.T.box.herBox() === null && B.st.box().cap === 30 && B.st.inventory.length === n, 'stepped off: his own cooler again, his fish still his' );
	ok( A.d.guestsKg === 0 && A.st.box().by.length === 0, 'and her box is hers alone' );

}

// her owner's word stops: back to his own box
{

	B.p.riding = true;
	B.p.boat = { owner: 'A', model: { id: 'sportfisher' } };
	A.T.others.get( 'B' ).cur.ride = 'A';
	look();
	ok( !! B.T.box.herBox(), 'back aboard, her box again' );
	B.T.box._her.at -= 600000;
	ok( !! B.T.box.herBox(), 'her owner\'s game quiet for ten minutes (a phone paused): still her box, as last told' );
	B.T.others.get( 'A' ).cur.mode = 'walk';
	ok( B.T.box.herBox() === null, 'her owner gone ashore: his own' );
	B.T.others.get( 'A' ).cur.mode = 'helm';
	look();
	const was = B.T.box._her;
	B.T.box.told( { to: 'B', c: - 1, i: 0, m: 0, k: 0, f: [] }, 'A' );
	B.T.box.told( { to: 'B', c: 600, i: 0, m: 0, k: 0, f: [ [ 'A', 'x', 1 ] ] }, 'A' );
	B.T.box.told( { to: 'C', c: 600, i: 0, m: 0, k: 0, f: [] }, 'A' );
	ok( B.T.box._her === was, 'what isn\'t a box, or isn\'t to him, is let be' );
	const ice = A.d.box.ice;
	A.T.box.given( { to: 'A', k: 1e9, n: 1, c: [] }, 'B' );
	A.T.box.given( { to: 'A', k: 1, n: 1, c: [ [ 7, 1e9 ] ] }, 'B' );
	ok( A.d.box.ice === ice, 'nor what isn\'t a catch' );

}

// ---- your own boat: the room held for ice, and an icemaker that stops when the box is full
{

	const C = game( { id: 'C', name: 'Pat', boat: 'sportfisher', upgrades: { sfFishBox: 1 } } );
	C.d.box.ice = 300;
	let n = 0;
	while ( C.st.addFish( 'yellowfin', 60, 10 ) ) {

		C.d._stamp();
		n ++;

	}

	ok( C.d.box.ice >= meltKgH( 600, true ) * HELD_H - 1e-6 && C.st.holdKg + C.d.box.ice <= 600 + 1e-6, `a box filled with tuna till it's refused: ${ n } of them, and ${ C.d.box.ice.toFixed( 1 ) } kg of ice still in with them, a day's` );
	const D = game( { id: 'D', name: 'Sam', boat: 'sportfisher', upgrades: { sfFishBox: 1, sfIcemaker: 1 }, moored: true } );
	D.st.addFish( 'yellowfin', 50, 10 );
	D.d._stamp();
	D.d.pass( 500 );
	ok( near( D.d.box.ice, 600 - D.st.holdKg, 1e-6 ), `an icemaker at her berth for 500 hours: the box full and no more (${ D.d.box.ice.toFixed( 0 ) } kg of ice beside ${ D.st.holdKg } kg of fish)` );
	ok( D.st.fits( 40 ), 'and a fish still goes in: the ice past the catch\'s day is let go for it' );
	D.d.box.ice = 2000;
	D.d.pass( 0.01 );
	ok( D.d.box.ice <= 600 - D.st.holdKg + 1e-6, 'a box an icemaker overfilled before is put right' );
	const E = game( { id: 'E', name: 'Lee', boat: 'sportfisher', upgrades: { sfFishBox: 1, sfIcemaker: 1, sfGenerator: 1 } } );
	E.d.pass( 300 );
	ok( E.d.box.ice <= 600 + 1e-6 && E.d.box.ice > 590, 'and under way on the generator, the same' );

}

if ( bad ) {

	console.error( `\none fish box aboard: ${ bad } failed` );
	process.exit( 1 );

}

console.log( '\none fish box aboard: all passed' );
