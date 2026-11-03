// (M16) A guest aboard when her owner's poses stop coming: the game's own stale time (6 s), not the 120 s the other two-game checks set to
// allow for the CPU. Her owner's window goes quiet for a while (a phone's screen off, a tab behind another, a dropped connection), at sea,
// under way, with him on her deck: what becomes of him, and when she's back?
//   tools/render-slot.sh node tools/two-players/gap.mjs [dir] [port] [boat]
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', BOAT = 'sportfisher' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT, stale: 120 } );
const { say, note, until, frames } = G;
const owner = await G.open( 'Robin', BOAT, 30 ), guest = await G.open( 'Sam', BOAT === 'lobster' ? 'console' : 'lobster', 20 );
await until( guest.game, `${ other } && ${ other }.cur` );
await until( owner.game, `${ other } && ${ other }.cur` );
await G.buy( owner );
say( await G.aboard( owner, guest ), 'Sam\'s aboard' );
await G.helm( owner );
await G.toSea( owner );
await until( guest.game, `Math.hypot( window.__app.player.boat.position.x + 2600, window.__app.player.boat.position.z - 3000 ) < 300` );
await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, p.boat.model.boardPoint.y, p.boat.model.boardPoint.z ); p.deckVel.set( 0, 0, 0 ); window.__app.together.stale = 6; } );
await owner.page.keyboard.down( 'KeyW' );
await owner.page.waitForTimeout( 8000 );
// (how long between poses in ordinary running, on this loaded machine, drawing nothing)
const steady = await guest.game.evaluate( () => new Promise( ( done ) => { const a = window.__app, o = a.together.others.values().next().value; let top = 0, n = 0; const R = window.__draws, f = () => { top = Math.max( top, performance.now() / 1000 - o.last ); if ( ++ n > 200 ) { R.after.splice( R.after.indexOf( f ), 1 ); done( +top.toFixed( 2 ) ); } }; R.after.push( f ); } ) );
note( `with the poses coming, the longest gap: ${ steady } s` );
const state = () => guest.game.evaluate( () => { const a = window.__app, p = a.player, o = a.together.others.values().next().value; return { riding: p.riding, mode: p.mode, y: +p.position.y.toFixed( 2 ), own: p.boat === a.boatCtl, poseAge: o ? +( performance.now() / 1000 - o.last ).toFixed( 1 ) : null, toast: a.game.hud && a.game.hud.toastEl ? a.game.hud.toastEl.textContent : null }; } );
await guest.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
for ( const quiet of [ 3, 5.5, 8, 20 ] ) {

	if ( ! await guest.game.evaluate( () => window.__app.player.riding ) ) {

		// (back on, for the next)
		await until( guest.game, `${ other }.cur && ${ other }.cur.boat`, 60000 );
		await until( guest.game, `( () => { const a = window.__app, o = ${ other }, f = o.cur.drawn || o.cur.boat, M = a.together.copies.model( o.cur.boatId ); if ( ! M ) return false; const bp = M.boardPoint.clone().applyQuaternion( f.quat ).add( f.pos ); a.player.mode = 'swim'; a.player.position.set( bp.x, bp.y, bp.z ); a.player.velocity.set( 0, 0, 0 ); return !! a.player.rideOffer; } )()`, 60000 );
		await guest.game.evaluate( () => { const p = window.__app.player; p.ride( p.rideOffer.boat ); p.deckPos.set( 0, p.boat.model.boardPoint.y, p.boat.model.boardPoint.z ); } );
		await frames( guest.game, 6 );

	}

	// her window quiet: nothing goes out of her game for that long (as a screen off does: her game's stopped too, for a page hidden)
	await owner.game.evaluate( () => { const s = window.__app.together.session; window.__send = s.send; s.send = () => {}; } );
	const seen = [];
	const t0 = Date.now();
	while ( Date.now() - t0 < quiet * 1000 ) { seen.push( await state() ); await guest.page.waitForTimeout( 500 ); }
	await owner.game.evaluate( () => { const s = window.__app.together.session; s.send = window.__send; } );
	await guest.page.waitForTimeout( 2000 );
	const after = await state(), told = await guest.game.evaluate( () => window.__toasts.splice( 0 ) );
	const wet = seen.find( ( x ) => ! x.riding );
	note( `quiet ${ quiet } s: oldest pose ${ Math.max( ...seen.map( ( x ) => x.poseAge || 0 ) ) } s; ${ wet ? `off her at pose age ${ wet.poseAge } s, ${ wet.mode }, y ${ wet.y }` : 'stayed aboard' }; after it ${ JSON.stringify( after ) }; told ${ JSON.stringify( told ) }` );
	if ( quiet < 6 ) say( ! wet && after.riding, `a ${ quiet } s gap in her poses: he stays aboard` );
	else say( ! wet && after.riding, `a ${ quiet } s gap in her poses (past the 6 s she's taken as gone): he stays aboard${ wet ? ` - he doesn't: ${ wet.mode } in the sea, told ${ JSON.stringify( told ) }` : '' }` );

}

await G.end( `gap ${ BOAT }` );
