// (M16) One game, alone: how far each boat heels and how hard she turns, flat out and hard over in calm water. The figures a guest rides through.
//   tools/render-slot.sh node tools/two-players/heel.mjs [dir] [port] [boats, comma separated]
import { start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', BOATS = 'console,lobster,sportfisher' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT } );
const { note, until, frames } = G;
for ( const id of BOATS.split( ',' ) ) {

	const me = await G.open( 'Robin', id, 60, { group: `heel-${ id }` } );
	await G.buy( me );
	await me.game.evaluate( () => { const p = window.__app.player; p.boardBoat(); } );
	await G.helm( me );
	await G.toSea( me );
	await me.game.evaluate( () => {

		const a = window.__app, b = a.boatCtl, V = a.camera.position.constructor, u = new V(), R = window.__draws;
		const S = window.__s = { rows: [], t: 0, game: 0 };
		R.after.push( ( dt ) => { S.t += Math.min( dt, 0.1 ); u.set( 1, 0, 0 ).applyQuaternion( b.quaternion ); const heel = Math.asin( u.y ) * 57.3; u.set( 0, 0, 1 ).applyQuaternion( b.quaternion ); const trim = Math.asin( u.y ) * 57.3; S.rows.push( [ +S.t.toFixed( 2 ), +heel.toFixed( 1 ), +trim.toFixed( 1 ), +b.speed.toFixed( 1 ), +b.getYaw().toFixed( 3 ) ] ); } );

	} );
	await me.page.keyboard.down( 'ShiftLeft' );
	await me.page.keyboard.down( 'KeyW' );
	let last = - 1, same = 0;
	while ( same < 5 ) { await frames( me.game, 40 ); const v = await me.game.evaluate( () => window.__app.boatCtl.speed ); same = v < last + 0.03 ? same + 1 : 0; last = Math.max( last, v ); }
	const t0 = await me.game.evaluate( () => window.__s.t );
	await me.page.keyboard.down( 'KeyA' );
	await frames( me.game, 100 );
	await me.page.keyboard.up( 'KeyA' );
	await frames( me.game, 40 );
	const r = await me.game.evaluate( ( t0 ) => { const S = window.__s, rows = S.rows.filter( ( q ) => q[ 0 ] >= t0 ); return { before: S.rows.at( - 1 - rows.length ), n: rows.length, t: rows.at( - 1 )[ 0 ] - t0, top: rows[ 0 ][ 3 ], heel: Math.max( ...rows.map( ( q ) => Math.abs( q[ 1 ] ) ) ), trim: Math.max( ...rows.map( ( q ) => Math.abs( q[ 2 ] ) ) ), least: Math.min( ...rows.map( ( q ) => q[ 3 ] ) ), every: rows.filter( ( q, i ) => i % 8 === 0 ).slice( 0, 24 ).map( ( q ) => [ +( q[ 0 ] - t0 ).toFixed( 1 ), q[ 1 ], q[ 2 ], q[ 3 ] ] ) }; }, t0 );
	note( `${ id }, alone, ${ await G.rate( me.game ) } frames a second: top ${ r.top } m/s; hard over for ${ r.t.toFixed( 1 ) } s of her time: heel ${ r.heel } deg at most, trim ${ r.trim }, down to ${ r.least } m/s` );
	note( `  [ s, heel, trim, m/s ]: ${ JSON.stringify( r.every ) }` );
	await me.page.close();

}

await G.end( 'heel' );
