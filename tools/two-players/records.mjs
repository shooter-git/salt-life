// (M19) The line-class records with two real games (stream RECORDS: docs/m19/records.md): Robin and Sam on the island's clock,
// each landing a fish through the game's own landing (Game.updateFight: a fight tired and alongside, on the terms her rod gives,
// Rigs.fightTerms, so its line's class is the game's own).
//  - Robin's 9 kg jack on her 8 lb line: her line-class record on the 4 kg class, told on her catch card; the island's best for
//    its class, on the records board on both games;
//  - Sam's 20 kg jack on his: his record, in his log and not hers; the island's best moves to him on both games;
//  - the group's records keep the one '%' key for it, whoever has it;
//  - Robin's Log tab lists her line-class records.
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/records.mjs [out] [port]
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output/records-together', PORT = '5241' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT } );
const { say, note, until, frames } = G;
const group = `records-${ Date.now() }`;

const robin = await G.open( 'Robin', 'kayak', 20, { group } ), sam = await G.open( 'Sam', 'kayak', 20, { group } );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
await frames( robin.game, 6 );

// a fish landed as the game lands one: on the terms the rod in your hands gives, tired and alongside
const land = ( w, species, kg ) => w.game.evaluate( async ( [ species, kg ] ) => {

	const a = window.__app, g = a.game, { CatchMinigame } = await import( '/src/game/CatchMinigame.js' );
	const T = g.rigs.fightTerms( { species, kg } );
	const f = new CatchMinigame( { species, kg, ...T, distance: 0.05 } );
	f.stamina = 0;
	f.place = null;
	f.at = a.camera.position.clone();
	f.rig = g.rod.rig;
	g.state.inventory = []; // (room for it)
	g.fight = f;
	return T.lineKg;

}, [ species, kg ] ).then( async ( lineKg ) => {

	await until( w.game, `! window.__app.game.fight && window.__app.game.state.lastCatch && window.__app.game.state.lastCatch.kg === ${ kg }` );
	await frames( w.game, 4 );
	return w.game.evaluate( ( lineKg ) => {

		const g = window.__app.game, c = g.state.lastCatch, card = document.querySelector( '.gm-catch' );
		return { lineKg, cls: c.cls, rec: c.clsRecord, isle: c.islandClass, card: card ? card.innerText : '', log: Object.fromEntries( Object.entries( g.state.log ).filter( ( [ , e ] ) => e.cls ).map( ( [ k, e ] ) => [ k, e.cls ] ) ) };

	}, lineKg );

} );
const board = ( w ) => w.game.evaluate( async () => {

	const { classLine } = await import( '/src/together/RecordsBoard.js' ), r = window.__app.together.records;
	return { line: classLine( r )[ 0 ] || '', keys: Object.keys( r ).filter( ( k ) => k[ 0 ] === '%' ), held: r[ '%' ] };

} );

const R = await land( robin, 'jack', 9 );
fs.writeFileSync( `${ out }/robin-card.txt`, R.card );
say( R.cls === '4' && R.rec && R.rec.cls === '4' && R.rec.prevKg === 0 && /line-class record/i.test( R.card ) && /4 kg \(8 lb\) line/.test( R.card ), `Robin's 9 kg jack on her ${ ( R.lineKg / 0.45359237 ).toFixed( 0 ) } lb line: her record on the 4 kg (8 lb) class, on her card` );
await until( sam.game, `window.__app.together.records[ '%' ] && window.__app.together.records[ '%' ].who === 'Robin'`, 120000 ).catch( () => {} );
const B1 = await board( robin ), B2 = await board( sam );
say( R.isle && /Robin's 20 lb crevalle jack on 4 kg \(8 lb\), 2\.3 to 1/i.test( B1.line ) && B2.line === B1.line, `the island's best for its class, on the board on both games: "${ B2.line }"` );

const S = await land( sam, 'jack', 20 );
await until( robin.game, `window.__app.together.records[ '%' ] && window.__app.together.records[ '%' ].who === 'Sam'`, 120000 ).catch( () => {} );
const R2 = await robin.game.evaluate( () => window.__app.game.state.log.jack.cls );
const B3 = await board( robin ), B4 = await board( sam );
say( S.rec && S.rec.cls === '4' && S.log.jack[ '4' ].kg === 20 && R2[ '4' ].kg === 9, 'Sam\'s 20 kg jack: his record, in his log; Robin\'s log keeps her own 9 kg' );
say( S.isle && /^Line class: Sam's/.test( B3.line ) && B3.line === B4.line, `the island's best moves to Sam on both games: "${ B3.line }"` );
say( B3.keys.length === 1 && B4.keys.length === 1, 'the group\'s records keep the one \'%\' key for it' );
// Robin's Log tab: her line-class records
const tab = await robin.game.evaluate( () => {

	const hud = window.__app.game.hud;
	hud.invTab = 'log';
	hud.renderInventory();
	return hud.inv.innerText;

} );
fs.writeFileSync( `${ out }/robin-log.txt`, tab );
say( /Line-class records/i.test( tab ) && /Crevalle jack\s*on 4 kg \(8 lb\) line/.test( tab ), 'her Log tab lists it: a crevalle jack on 4 kg (8 lb) line' );
note( 'rates', await G.rate( robin.game ), await G.rate( sam.game ) );

await G.end( 'records' );
