// (M17, stream 4) Where a two-player game's late stages have got to (the performance marks App sets), every 30 s: the fish camp and
// Marta's tray wait on the last of them, the debris.
//   node tools/two-players/late-probe.mjs [dir] [port] [minutes] [drawing 0|1]
import { start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5234', MIN = '12', DRAW = '0' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT, drawing: DRAW === '1' } );
const me = await G.open( 'Robin', 'kayak', 20 );
const t0 = Date.now();
while ( Date.now() - t0 < + MIN * 60000 ) {

	const r = await me.game.evaluate( () => { const a = window.__app, m = performance.getEntriesByType( 'mark' ).map( ( e ) => e.name ); return { marks: m.slice( - 4 ), n: m.length, debris: !! a.debris, beach: !! a.beachcomb, ready: a.together && a.together.ready, heap: +( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 0 ), frames: window.__draws.frames, late: !! a._late, slots: a._slots && a._slots.length, uses: a._uses && a._uses.length }; } );
	console.log( Math.round( ( Date.now() - t0 ) / 1000 ), JSON.stringify( r ) );
	if ( r.debris ) break;
	await me.page.waitForTimeout( 30000 );

}

await G.end( 'late-probe' );
