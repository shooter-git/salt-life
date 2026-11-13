// (v2.2.2's slow climb) Whether drawing alone holds memory: one game at sea, settled, then only its world drawn (App.drawWorld, the
// game's own frames stopped) DRAWS times in a row, script memory read after a forced GC before and after, and heap snapshots of both
// for tools/heap/grow.mjs. PROBE_FREEZE=0 lets the game's frames run on between the readings instead (its own drawing included).
//   ALL_THE_SPACES=... node tools/heap/draw-probe.mjs <out dir> <two-player page port> <base url of a built copy> [draws=300] [settle minutes=6]
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { start } from '../two-players/lib.mjs';
const [ out = 'qa-output/draw-probe', PORT = '5251', BASE = '', DRAWS = '300', SETTLE = '6' ] = process.argv.slice( 2 );
const [ VW, VH ] = ( process.env.PROBE_VIEW || '96x54' ).split( 'x' ).map( Number );
await mkdir( out, { recursive: true } );
const G = await start( { out, port: PORT, viewport: { width: VW, height: VH }, drawing: true } );
const who = await G.open( 'Robin', 'sportfisher', 30, { src: `${ BASE }/?boat=sportfisher` } );
await who.game.evaluate( () => window.__app.player.boardBoat() );
await G.helm( who );
await G.toSea( who );
const heap = () => who.game.evaluate( () => { window.gc(); window.gc(); const a = window.__app; return { mb: +( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 2 ), frames: window.__draws.frames, geo: a.renderer.info.memory.geometries, tex: a.renderer.info.memory.textures, prog: a.renderer.info.programs.length }; } );
const snapshot = async ( name ) => {

	await who.game.evaluate( () => { window.gc(); window.gc(); } );
	const cdp = await G.ctx.newCDPSession( who.page ), path = `${ out }/${ name }.heapsnapshot`, file = createWriteStream( path );
	cdp.on( 'HeapProfiler.addHeapSnapshotChunk', ( { chunk } ) => file.write( chunk ) );
	await cdp.send( 'HeapProfiler.enable' );
	await cdp.send( 'HeapProfiler.collectGarbage' );
	await cdp.send( 'HeapProfiler.takeHeapSnapshot', { reportProgress: false } );
	await new Promise( ( r ) => file.end( r ) );
	await cdp.detach();
	console.log( `     snapshot ${ path }` );

};

const t0 = Date.now();
while ( Date.now() - t0 < + SETTLE * 60000 ) { await who.page.waitForTimeout( 60000 ); console.log( '     settling', JSON.stringify( await heap() ) ); }
// the game's frames stopped (the page's loop goes on, drawing nothing), then the world drawn by hand
if ( process.env.PROBE_FREEZE !== '0' ) await who.game.evaluate( () => { const a = window.__app; a._probeFrame = a.frame; a.frame = function () {}; } );
for ( let i = 0; i < 3; i ++ ) await who.game.evaluate( () => window.__app.drawWorld() );
const a = await heap();
console.log( '     before', JSON.stringify( a ) );
await snapshot( 'before' );
const t1 = Date.now();
for ( let done = 0; done < + DRAWS; done += 10 ) await who.game.evaluate( () => { const a = window.__app, gl = a.renderer.getContext(); for ( let i = 0; i < 10; i ++ ) a.drawWorld(); gl.finish(); } );
const b = await heap();
console.log( `     after ${ DRAWS } draws in ${ ( ( Date.now() - t1 ) / 1000 ).toFixed( 0 ) } s`, JSON.stringify( b ) );
console.log( `     DRAW PROBE: ${ ( b.mb - a.mb ).toFixed( 2 ) } MB over ${ DRAWS } draws, ${ ( ( b.mb - a.mb ) * 1024 / + DRAWS ).toFixed( 2 ) } KB a draw` );
await snapshot( 'after' );
await G.end( 'draw probe' );
