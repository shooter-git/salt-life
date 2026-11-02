// (M16) Script memory in two games over a long run, read after a forced GC: whether it climbs without limit with company. Sam rides Robin's boat, or
// each in his own, her going about at sea; both really drawing. MEM_MODE=alone reads one game by itself for the comparison.
//   tools/render-slot.sh node tools/two-players/mem.mjs [dir] [port] [boat] [minutes] [every, s]   MEM_BASE=http://127.0.0.1:4189 for a built copy
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', BOAT = 'sportfisher', MINUTES = '20', EVERY = '120' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT, viewport: { width: 640, height: 360 }, drawing: process.env.MEM_DRAW !== '0' } );
const { note, until, frames } = G;
const MODE = process.env.MEM_MODE || 'ride';
const BASE = process.env.MEM_BASE || '';
const owner = await G.open( 'Robin', BOAT, 10, { src: `${ BASE }/?boat=${ BOAT }` } );
const guest = MODE === 'alone' ? null : await G.open( 'Sam', BOAT === 'lobster' ? 'console' : 'lobster', 10, { src: `${ BASE }/?boat=${ BOAT === 'lobster' ? 'console' : 'lobster' }` } );
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

	const r = await who.game.evaluate( () => { window.gc(); window.gc(); const a = window.__app, m = performance.memory, t = a.together; return { heap: +( m.usedJSHeapSize / 1048576 ).toFixed( 1 ), geom: a.renderer.info.memory.geometries, tex: a.renderer.info.memory.textures, prog: a.renderer.info.programs.length, types: [ ...t.copies.types.keys() ].length, frames: window.__draws.frames, others: t.others.size }; } );
	return r;

};

const t0 = Date.now();
let turn = 0;
const heading = ( k ) => owner.game.evaluate( ( k ) => { const a = window.__app, b = a.boatCtl; b.position.set( - 2600 + 400 * Math.cos( k ), b.position.y, 3000 + 400 * Math.sin( k ) ); }, k );
await owner.page.keyboard.down( 'KeyW' );
while ( Date.now() - t0 < + MINUTES * 60000 ) {

	const o = await read( owner ), g = guest ? await read( guest ) : null, m = ( ( Date.now() - t0 ) / 60000 ).toFixed( 1 );
	rows.push( { m, o, g } );
	console.log( `     MEMORY at ${ m } min: Robin ${ o.heap } MB (geo ${ o.geom }, tex ${ o.tex }, prog ${ o.prog }, ${ o.frames } frames)${ g ? `; Sam ${ g.heap } MB (geo ${ g.geom }, tex ${ g.tex }, prog ${ g.prog }, ${ g.frames } frames, types ${ g.types })` : '' }` );
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
await G.end( `mem ${ BOAT } ${ MODE }` );
