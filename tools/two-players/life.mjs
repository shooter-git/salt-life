// (M17, stream 7) The life lists and the slams with two players (docs/m17/life-list.md): Robin on her sportfisher with Sam riding
// along, each catching in their own game as Game.updateFight does (GameState.addFish, FlatsFishing.caught, Together.lifeChanged).
// Robin has a super grand slam on the flats' fish; Sam, a guest aboard her, a billfish grand slam and a yellowfin too big for his
// cooler in her hold, all his. Then the records board's line on both games, from the group's records: who has the most kinds
// and who has which slams; each told of the other's slam; what's sent, measured; and a third player, Ann, joining after Sam's
// gone, reading the same line from the group's save.
//   a dev server, then   node tools/two-players/life.mjs [dir] [port]
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5238' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT } );
const { say, note, until } = G;
const group = `life-${ Date.now() }`;
const toasts = ( who ) => who.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
// (what's sent to the others, by kind, and the largest of each, in characters of JSON)
const sends = ( who ) => who.game.evaluate( () => { const S = window.__app.together.session, was = S.send.bind( S ); window.__sent = {}; S.send = ( k, b ) => { const n = JSON.stringify( b ?? null ).length, r = window.__sent[ k ] || ( window.__sent[ k ] = { n: 0, most: 0 } ); r.n ++; r.most = Math.max( r.most, n ); return was( k, b ); }; } );
// a catch in their own game, as Game.updateFight has it: logged, its slams, the group's records. One at a time, each in the
// group's records before the next, as real catches come minutes apart (the SDK's update tries three times: a burst of nine
// catches at once lost four of the weights)
const land = async ( who, list ) => {

	const said = [];
	for ( const [ k, kg, place ] of list ) {

		said.push( await who.game.evaluate( ( [ k, kg, place ] ) => {

			const a = window.__app, g = a.game, s = g.state;
			s.addFish( k, kg, a.settings.timeOfDay, { day: g.tradeDay, place } );
			const info = s.lastCatch;
			info.slams = g.flats.caught( info );
			if ( info.slams.length && a.together ) a.together.lifeChanged( info.slams );
			if ( a.together ) a.together.caught( k, info.kg, info.cm, 'rod', info.place );
			return info.slams.join( '+' ) || '-';

		}, [ k, kg, place ] ) );
		await until( who.game, `!! window.__app.together.records[ '${ k }' ]`, 60000 ).catch( () => note( `${ k } not in the records` ) );

	}

	return said.join( ' ' );

};
const lines = ( who ) => who.game.evaluate( async () => {

	const { lifeLines } = await import( '/src/together/RecordsBoard.js' );
	const T = window.__app.together;
	return { lines: lifeLines( T.records ), board: lifeLines( T.board._last || {} ), mine: T.records[ '#' + T.me.id ] || null };

} );

const owner = await G.open( 'Robin', 'sportfisher', 20, { group } ), guest = await G.open( 'Sam', 'kayak', 20, { group } );
await until( guest.game, `${ other } && ${ other }.cur` );
await until( owner.game, `${ other } && ${ other }.cur` );
for ( const w of [ owner, guest ] ) {

	await toasts( w );
	await sends( w );

}

say( await G.aboard( owner, guest ), 'Sam rides along on Robin\'s sportfisher' );
// (his catch in her box: main's v2.3.0, together/SharedBox.js)
const hold = await until( guest.game, "window.__app.game.state.box().whose === 'Robin'", 120000 ).then( () => guest.game.evaluate( () => { const b = window.__app.game.state.box(); return { cap: b.cap, others: b.others, whose: b.whose }; } ) ).catch( () => null );
note( `Sam's game has her box as ${ JSON.stringify( hold ) }` );

const r = await land( owner, [ [ 'grunt', 0.9, 'bay' ], [ 'bonefish', 2.4, 'coast' ], [ 'permit', 9.1, 'coast' ], [ 'tarpon', 31, 'creek' ], [ 'snook', 5.6, 'creek' ] ] );
say( r === '- - - grand superGrand', `Robin's grunt, bonefish, permit, tarpon (the grand slam) and snook (the super grand slam): ${ r }` );
const s = await land( guest, [ [ 'sailfish', 32, 'dropoff' ], [ 'whiteMarlin', 27, 'dropoff' ], [ 'yellowfin', 48, 'dropoff' ], [ 'blueMarlin', 170, 'blue' ] ] );
say( s === '- - - billfish', `Sam's sailfish, white marlin, yellowfin and blue marlin aboard Robin's boat: ${ s }` );
const sam = await guest.game.evaluate( () => { const st = window.__app.game.state; return { kept: st.inventory.map( ( f ) => f.species ), slam: !! st.trophies[ 'slam:billfish' ], kinds: Object.keys( st.log ).length }; } );
const robin = await owner.game.evaluate( () => { const st = window.__app.game.state; return { slam: !! st.trophies[ 'slam:billfish' ], kinds: Object.keys( st.log ).length, supers: !! st.trophies[ 'slam:superGrand' ] }; } );
say( sam.slam && sam.kinds === 4 && ! robin.slam && robin.kinds === 5 && robin.supers, `the billfish grand slam and its kinds are Sam's, not Robin's (Sam ${ JSON.stringify( sam ) }, Robin ${ JSON.stringify( robin ) })` );

// the board's line on both games, once the group's records have both lists
const both = `( () => { const R = window.__app.together.records; return R[ '#robin-1' ] && R[ '#sam-1' ] && R[ '#robin-1' ].k === 5 && R[ '#sam-1' ].k === 4 && R[ '#sam-1' ].sl.length === 1; } )()`;
await until( owner.game, both, 120000 ).catch( () => {} );
await until( guest.game, both, 120000 ).catch( () => {} );
const want = [ 'Most kinds: Robin, 5 of 39', 'Slams: Robin\'s super grand · Sam\'s billfish' ];
for ( const w of [ owner, guest ] ) {

	const L = await lines( w );
	say( JSON.stringify( L.lines ) === JSON.stringify( want ) && JSON.stringify( L.board ) === JSON.stringify( want ), `${ w.name }'s board: "${ L.board.join( '" / "' ) }"` );

}

const told = { robin: await owner.game.evaluate( () => window.__toasts.filter( ( t ) => /slam/.test( t ) ) ), sam: await guest.game.evaluate( () => window.__toasts.filter( ( t ) => /slam/.test( t ) ) ) };
say( told.robin.some( ( t ) => /^Sam has had a billfish grand slam/.test( t ) ) && told.sam.some( ( t ) => /^Robin has had a super grand slam/.test( t ) ), `each told of the other's: Robin "${ told.robin.join( ' | ' ) }", Sam "${ told.sam.join( ' | ' ) }"` );
const sent = { robin: await owner.game.evaluate( () => window.__sent.life ), sam: await guest.game.evaluate( () => window.__sent.life ) };
const shared = await owner.game.evaluate( () => { const R = window.__app.together.records; return { all: JSON.stringify( R ).length, lists: JSON.stringify( Object.fromEntries( Object.entries( R ).filter( ( [ k ] ) => k[ 0 ] === '#' ) ) ).length }; } );
say( sent.robin && sent.sam && sent.robin.most <= 40 && sent.sam.most <= 40, `what's sent: 'life' messages Robin ${ JSON.stringify( sent.robin ) }, Sam ${ JSON.stringify( sent.sam ) } (characters of JSON); the group's records ${ shared.all } characters, the life lists ${ shared.lists } of them` );
const weights = `Object.keys( window.__app.together.board._last || {} ).filter( ( k ) => /^[a-z]/i.test( k ) ).length`;
await until( owner.game, `${ weights } === 9`, 120000 ).catch( () => {} );
const board = await owner.game.evaluate( weights );
say( board === 9, `the weights on the board's records with it: ${ board } kinds' records (seven drawn, the line under them)` );

// the board's slate as it's drawn
for ( const w of [ owner ] ) {

	const png = await w.game.evaluate( () => window.__app.together.board.canvas.toDataURL( 'image/png' ) );
	fs.writeFileSync( `${ out }/board-${ w.name.toLowerCase() }.png`, Buffer.from( png.split( ',' )[ 1 ], 'base64' ) );

}

note( `the board's slate: ${ out }/board-robin.png` );

// Ann joins after Sam's gone: the line from the group's save
await guest.page.close();
const ann = await G.open( 'Ann', 'kayak', 20, { group } );
await until( ann.game, `( () => { const R = window.__app.together.records; return R[ '#robin-1' ] && R[ '#sam-1' ]; } )()`, 120000 ).catch( () => {} );
const A = await lines( ann );
say( JSON.stringify( A.board ) === JSON.stringify( want ), `Ann, joining later, reads the same from the group's save: "${ A.board.join( '" / "' ) }"` );
const png = await ann.game.evaluate( () => window.__app.together.board.canvas.toDataURL( 'image/png' ) );
fs.writeFileSync( `${ out }/board-ann.png`, Buffer.from( png.split( ',' )[ 1 ], 'base64' ) );
await G.end( 'life' );
