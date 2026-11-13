// (M19) The stalls with two real games (stream STALLS: docs/m19/stalls.md): Robin and Sam on the island's clock together.
//  - the same challenges of Pearl's on both games, on the same trading day;
//  - Robin's catch does the rod's on her game, by the real GameState.addFish, and not on Sam's;
//  - Pearl's panel: her challenges, her bait, and what she owes Robin paid as she comes by, said the once;
//  - Joe's panel by day: his bait and ice, and the bucket's live bait sold to his tank; Marta's with none of it;
//  - by night (the clock moved for both): his night box with his ice chest on trust, and no bait tank.
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/stalls.mjs [out] [port]
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output/stalls-together', PORT = '5241' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT } );
const { say, note, until, frames } = G;
const group = `stalls-${ Date.now() }`;

const robin = await G.open( 'Robin', 'kayak', 20, { group } ), sam = await G.open( 'Sam', 'kayak', 20, { group } );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
for ( const w of [ robin, sam ] ) await w.game.evaluate( () => {

	const g = window.__app.game;
	window.__toasts = [];
	const was = g.toast;
	g.toast = function ( t, ms ) {

		window.__toasts.push( t );
		return was.call( this, t, ms );

	};

} );
await frames( robin.game, 6 );
await frames( sam.game, 6 );

// ---- the same challenges on both games
const today = ( w ) => w.game.evaluate( () => {

	const g = window.__app.game, d = g.challenges.today();
	return { day: g.tradeDay, hour: +window.__app.settings.timeOfDay.toFixed( 2 ), list: d.list.map( ( c ) => ( { id: c.id, what: c.what, pay: c.pay, done: !! c.done } ) ), owed: d.owed };

} );
const R0 = await today( robin ), S0 = await today( sam );
say( R0.day === S0.day && JSON.stringify( R0.list ) === JSON.stringify( S0.list ), `the same challenges on both games, trading day ${ R0.day } (${ R0.hour } and ${ S0.hour } h): ${ R0.list.map( ( c ) => `${ c.what } $${ c.pay }` ).join( '; ' ) }` );

// ---- Robin's catch does the rod's, on her game alone
const done = await robin.game.evaluate( () => {

	const g = window.__app.game, s = g.state, c = g.challenges.today().list.find( ( x ) => x.id === 'rod' );
	s.addFish( c.species, c.kg ? c.kg + 0.5 : 2, 10, { method: 'rod', day: window.__app.settings.day, place: c.place || null, rig: c.kind === 'fly' ? 'fly' : null, release: c.kind === 'release' ? 'released' : null } );
	return { toasts: window.__toasts.slice(), money: s.money };

} );
await frames( robin.game, 4 );
await frames( sam.game, 8 );
const R1 = await today( robin ), S1 = await today( sam );
const rodPay = R1.list.find( ( c ) => c.id === 'rod' ).pay;
say( R1.list.find( ( c ) => c.id === 'rod' ).done && R1.owed === rodPay && done.toasts.some( ( t ) => /Pearl/.test( t ) ), `Robin's catch does the rod's ($${ R1.owed } owed): "${ done.toasts.find( ( t ) => /Pearl/.test( t ) ) }"` );
say( ! S1.list.some( ( c ) => c.done ) && S1.owed === 0, 'and on Sam\'s game his are still to do, none owed him' );

// ---- the panels
const panel = ( w, who ) => w.game.evaluate( ( who ) => {

	const g = window.__app.game, hud = g.hud;
	hud.openStand( g[ who ].vendor );
	const text = hud.stand.innerText;
	return { text, money: g.state.money, open: g[ who ].vendor.open };

}, who );
const shut = ( w ) => w.game.evaluate( () => window.__app.game.hud.closeStand() );

const P1 = await panel( robin, 'camp' );
await shut( robin );
const P2 = await panel( robin, 'camp' );
await shut( robin );
say( /Pearl's challenges today/i.test( P1.text ) && /Cut conch/.test( P1.text ) && /hermit crab/i.test( P1.text ) && P1.money === done.money + rodPay, `Pearl's: her challenges, her conch and crabs, and Robin paid $${ rodPay } as she comes by` );
say( new RegExp( `money for the challenges: \\$${ rodPay }` ).test( P1.text ) && ! /money for the challenges/.test( P2.text ) && P2.money === P1.money, 'she says so the once: not again next time, and not paid twice' );
fs.writeFileSync( `${ out }/pearl.txt`, P1.text );

const bait = await robin.game.evaluate( () => {

	const g = window.__app.game, o = g.orders.find( ( x ) => x.bait );
	g.state.bait[ o.species ] = 3;
	return { species: o.species, each: o.each, who: o.who };

} );
const J1 = await panel( robin, 'stand' );
fs.writeFileSync( `${ out }/joe-day.txt`, J1.text );
say( J1.open && /Bait and ice/i.test( J1.text ) && /Ice · \$4/.test( J1.text ) && /Frozen ballyhoo/.test( J1.text ) && /Live shrimp/.test( J1.text ) && /Frozen sardines/.test( J1.text ) && /3 live from your bait bucket/.test( J1.text ) && /for his bait tank/.test( J1.text ),`Joe's by day: his bait and ice, and the bucket's 3 ${ bait.species } wanted for his tank (the order's ${ bait.who }'s)` );
const sold = await robin.game.evaluate( () => {

	const g = window.__app.game, m0 = g.state.money;
	g.hud.stand.querySelector( '[data-sellbait]' ).click();
	return { got: g.state.money - m0, toast: window.__toasts[ window.__toasts.length - 1 ] };

} );
await shut( robin );
say( sold.got === 3 * bait.each && /Sold Joe 3 live bait/.test( sold.toast ), `sold to him, $${ sold.got }: "${ sold.toast }"` );
const M = await panel( robin, 'chandlery' );
await shut( robin );
fs.writeFileSync( `${ out }/marta.txt`, M.text );
say( /Food and water/.test( M.text ) && ! /Ice ·|Frozen|Live shrimp|Trap bait|bait bucket/.test( M.text ), 'Marta\'s: her stores, and no ice or bait' );

// ---- by night: the clock moved for both
await robin.game.evaluate( () => window.__app.together.setClock( 22, window.__app.settings.day, 0.0001 ) );
await until( sam.game, 'window.__app.settings.timeOfDay > 21.5', 120000 ).catch( () => {} );
await robin.game.evaluate( () => {

	const g = window.__app.game, o = g.orders.find( ( x ) => x.bait );
	g.state.bait[ o.species ] = 3;

} );
await frames( robin.game, 8 );
const J2 = await panel( robin, 'stand' );
await shut( robin );
fs.writeFileSync( `${ out }/joe-night.txt`, J2.text );
const S2 = await today( sam );
say( ! J2.open && /Joe's night box/i.test( J2.text ) && /His ice chest/i.test( J2.text ) && /on trust/.test( J2.text ) && ! /bait bucket|for his bait tank/.test( J2.text ), 'Joe\'s by night: his night box, his ice chest on trust, and no bait tank (nor its order on his list)' );
say( S2.day === R0.day && JSON.stringify( S2.list.map( ( c ) => c.what ) ) === JSON.stringify( R0.list.map( ( c ) => c.what ) ), `Sam at ${ S2.hour } h: the same day's challenges till 5 am` );
note( 'rates', await G.rate( robin.game ), await G.rate( sam.game ) );

await G.end( 'stalls' );
