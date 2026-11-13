// (M16) Script memory in two games over a long run, read after a forced GC: whether it climbs without limit with company. Sam rides Robin's boat, or
// each in his own, her going about at sea; both really drawing. MEM_MODE=alone reads one game by itself for the comparison.
//   tools/render-slot.sh node tools/two-players/mem.mjs [dir] [port] [boat] [minutes] [every, s]   MEM_BASE=http://127.0.0.1:4189 for a built copy
// (v2.2.2's slow climb) Whether a climb follows the frames or the clock: run it at two very different frame rates over the same wall time.
//   MEM_DRAW=0 nothing drawn (frames tick far faster), MEM_VIEW=160x90 the window, MEM_FPS=30 the frames' ceiling (10),
//   MEM_SETTLE=8 the minute the slope's read from (a least-squares line through the readings from then, per minute and per 1000 frames),
//   MEM_SNAP=<dir> heap snapshots after a forced GC at MEM_SNAP_AT=8,38 (minutes), for tools/heap/grow.mjs to diff.
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', BOAT = 'sportfisher', MINUTES = '20', EVERY = '120' ] = process.argv.slice( 2 );
const [ VW, VH ] = ( process.env.MEM_VIEW || '640x360' ).split( 'x' ).map( Number );
const FPS = + ( process.env.MEM_FPS || 10 ), SETTLE = + ( process.env.MEM_SETTLE || 8 );
const SNAP = process.env.MEM_SNAP || '', SNAP_AT = ( process.env.MEM_SNAP_AT || '8,38' ).split( ',' ).map( Number );
const G = await start( { out, port: PORT, viewport: { width: VW, height: VH }, drawing: process.env.MEM_DRAW !== '0' } );
const { note, until, frames } = G;
const MODE = process.env.MEM_MODE || 'ride';
const BASE = process.env.MEM_BASE || '';
const owner = await G.open( 'Robin', BOAT, FPS, { src: `${ BASE }/?boat=${ BOAT }` } );
const guest = MODE === 'alone' ? null : await G.open( 'Sam', BOAT === 'lobster' ? 'console' : 'lobster', FPS, { src: `${ BASE }/?boat=${ BOAT === 'lobster' ? 'console' : 'lobster' }` } );
if ( guest ) {

	await until( guest.game, `${ other } && ${ other }.cur` );
	await until( owner.game, `${ other } && ${ other }.cur` );

}

if ( ! BASE ) await G.buy( owner );
if ( guest ) note( 'aboard:', await G.aboard( owner, guest ) );
else await owner.game.evaluate( () => window.__app.player.boardBoat() );
await G.helm( owner );
await G.toSea( owner );
const rows = [];
const read = async ( who ) => {

	const r = await who.game.evaluate( () => { window.gc(); window.gc(); const a = window.__app, m = performance.memory, t = a.together; return { heap: +( m.usedJSHeapSize / 1048576 ).toFixed( 2 ), geom: a.renderer.info.memory.geometries, tex: a.renderer.info.memory.textures, prog: a.renderer.info.programs.length, types: [ ...t.copies.types.keys() ].length, frames: window.__draws.frames, others: t.others.size }; } );
	return r;

};

// a heap snapshot of the game's page (its frame's process, if it has its own), after a forced GC
const snapshot = async ( who, name ) => {

	await mkdir( SNAP, { recursive: true } );
	await who.game.evaluate( () => { window.gc(); window.gc(); } );
	let cdp;
	try { cdp = await G.ctx.newCDPSession( who.game ); } catch ( e ) { cdp = await G.ctx.newCDPSession( who.page ); }
	const path = `${ SNAP }/${ name }.heapsnapshot`, file = createWriteStream( path );
	cdp.on( 'HeapProfiler.addHeapSnapshotChunk', ( { chunk } ) => file.write( chunk ) );
	await cdp.send( 'HeapProfiler.enable' );
	await cdp.send( 'HeapProfiler.collectGarbage' );
	await cdp.send( 'HeapProfiler.takeHeapSnapshot', { reportProgress: false } );
	await new Promise( ( r ) => file.end( r ) );
	await cdp.send( 'HeapProfiler.disable' );
	await cdp.detach();
	note( `snapshot ${ path }` );

};

const t0 = Date.now();
let turn = 0;
const snapped = new Set();
const heading = ( k ) => owner.game.evaluate( ( k ) => { const a = window.__app, b = a.boatCtl; b.position.set( - 2600 + 400 * Math.cos( k ), b.position.y, 3000 + 400 * Math.sin( k ) ); }, k );
await owner.page.keyboard.down( 'KeyW' );
while ( Date.now() - t0 < + MINUTES * 60000 ) {

	const o = await read( owner ), g = guest ? await read( guest ) : null, m = ( ( Date.now() - t0 ) / 60000 ).toFixed( 1 );
	const prev = rows.at( - 1 );
	rows.push( { m, o, g } );
	const rate = prev ? ( ( o.frames - prev.o.frames ) / ( ( m - prev.m ) * 60 ) ).toFixed( 1 ) : '-';
	console.log( `     MEMORY at ${ m } min: Robin ${ o.heap } MB (geo ${ o.geom }, tex ${ o.tex }, prog ${ o.prog }, ${ o.frames } frames, ${ rate } fps)${ g ? `; Sam ${ g.heap } MB (geo ${ g.geom }, tex ${ g.tex }, prog ${ g.prog }, ${ g.frames } frames, types ${ g.types })` : '' }` );
	if ( SNAP ) for ( const at of SNAP_AT ) if ( ! snapped.has( at ) && + m >= at ) { snapped.add( at ); await snapshot( owner, `robin-${ String( at ).padStart( 3, '0' ) }min-${ o.frames }f` ); }
	// (about the place, with a turn, so her pose and what's near keep changing)
	await owner.page.keyboard.down( turn % 2 ? 'KeyA' : 'KeyD' );
	await owner.page.waitForTimeout( 6000 );
	await owner.page.keyboard.up( turn % 2 ? 'KeyA' : 'KeyD' );
	await heading( turn ++ );
	await owner.page.waitForTimeout( Math.max( 0, + EVERY * 1000 - 6000 ) );

}

await owner.page.keyboard.up( 'KeyW' );
const a = rows[ 1 ] || rows[ 0 ], z = rows.at( - 1 ), mins = Math.max( 0.1, z.m - a.m );
console.log( `     MEMORY over ${ mins.toFixed( 1 ) } min from the second reading: Robin ${ ( z.o.heap - a.o.heap ).toFixed( 1 ) } MB (${ ( ( z.o.heap - a.o.heap ) / mins ).toFixed( 2 ) } MB/min)${ guest ? `; Sam ${ ( z.g.heap - a.g.heap ).toFixed( 1 ) } MB (${ ( ( z.g.heap - a.g.heap ) / mins ).toFixed( 2 ) } MB/min)` : '' }` );
// the settled slope: least squares through the readings from MEM_SETTLE on, against the clock and against the frames
const fit = ( xs, ys ) => { const n = xs.length, mx = xs.reduce( ( s, x ) => s + x, 0 ) / n, my = ys.reduce( ( s, y ) => s + y, 0 ) / n; let sxy = 0, sxx = 0; for ( let i = 0; i < n; i ++ ) { sxy += ( xs[ i ] - mx ) * ( ys[ i ] - my ); sxx += ( xs[ i ] - mx ) ** 2; } return sxx ? sxy / sxx : 0; };
const late = rows.filter( ( r ) => + r.m >= SETTLE );
if ( late.length >= 3 ) {

	const f0 = late[ 0 ].o.frames, f1 = late.at( - 1 ).o.frames, m0 = + late[ 0 ].m, m1 = + late.at( - 1 ).m;
	const perMin = fit( late.map( ( r ) => + r.m ), late.map( ( r ) => r.o.heap ) ), perKFrame = fit( late.map( ( r ) => r.o.frames / 1000 ), late.map( ( r ) => r.o.heap ) );
	console.log( `     SLOPE from ${ m0 } to ${ m1 } min (${ f1 - f0 } frames, ${ ( ( f1 - f0 ) / ( ( m1 - m0 ) * 60 ) ).toFixed( 2 ) } fps): ${ late[ 0 ].o.heap } -> ${ late.at( - 1 ).o.heap } MB; fitted ${ perMin.toFixed( 3 ) } MB/min, ${ ( perKFrame * 1024 ).toFixed( 1 ) } KB per 1000 frames (${ ( perKFrame * 1024 / 1000 ).toFixed( 2 ) } KB a frame)` );

}

await G.end( `mem ${ BOAT } ${ MODE }` );
