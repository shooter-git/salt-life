#!/usr/bin/env node
// (M16) Her in the real game, driven: boards her, goes about every deck by the same calls the keys make, climbs the tower,
// shakes it till you come off, and reads what she costs. A CPU render (SwiftShader): the GPU and phone look aren't shown here.
//   tools/render-slot.sh node tools/sportfisher/drive.mjs <out dir> [low|mid|high]
const { chromium } = await import( '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs' );
const [ , , out = '.', tier = 'low' ] = process.argv, PORT = process.env.PORT || 5203;
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await b.newPage( { viewport: { width: 1280, height: 720 } } );
page.setDefaultTimeout( 300000 );
const errs = [];
page.on( 'pageerror', ( e ) => errs.push( 'pageerror ' + e.message ) );
page.on( 'console', ( m ) => {

	if ( [ 'error', 'warning' ].includes( m.type() ) && ! /GL Driver|GPU stall|WebGL: |swiftshader|Automatic fallback/i.test( m.text() ) ) errs.push( m.type() + ' ' + m.text().slice( 0, 300 ) );

} );
await page.goto( `http://127.0.0.1:${ PORT }/?boat=sportfisher&tier=${ tier }&readout`, { waitUntil: 'domcontentloaded' } );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 15 * 60000 } ).catch( async ( e ) => {

	console.log( 'never started', e.message, errs.slice( 0, 20 ).join( '\n' ) );
	await b.close();
	process.exit( 1 );

} );
const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
const shot = async ( name ) => {

	await page.evaluate( () => {

		const g = window.__app.game.guide;
		if ( g && g.open ) g.close();

	} );
	await page.screenshot( { path: `${ out }/game-${ tier }-${ name }.png` } );

};

// stand somewhere, looking some way, and let a few frames go by
const stand = async ( name, x, y, z, yaw, pitch = - 0.05 ) => {

	const at = await page.evaluate( ( [ x, y, z, yaw, pitch ] ) => {

		const p = window.__app.player;
		p.climbing = null;
		p.mode = 'deck';
		p.deckPos.set( x, y, z );
		p.deckVel.set( 0, 0, 0 );
		p.deckYaw = yaw;
		p.pitch = pitch;
		return true;

	}, [ x, y, z, yaw, pitch ] );
	await sleep( 5000 );
	const r = await page.evaluate( () => {

		const p = window.__app.player;
		return { y: + p.deckPos.y.toFixed( 2 ), x: + p.deckPos.x.toFixed( 2 ), z: + p.deckPos.z.toFixed( 2 ), prompt: p.prompt && p.prompt.text };

	} );
	console.log( name, JSON.stringify( r ) );
	await shot( name );

};

console.log( await page.evaluate( () => {

	const a = window.__app;
	a.player.boardBoat();
	return { boat: a.boat.id, tier: a.tier, tris: a.boat.triangleCount, meshes: Object.keys( a.boat.meshes ).length };

} ) );
await sleep( 8000 );
await stand( 'cockpit', 0, 0.5, - 5.2, 0 );
await stand( 'cockpit-aft', 0, 0.9, - 2.9, Math.PI );
await stand( 'salon', 0, 1.02, - 1.9, 0 );
await stand( 'lower', 0, 0.15, 2.3, 0 );
await stand( 'bunks', 0.2, 0.15, 2.75, Math.PI / 2 );
await stand( 'foredeck', 0, 2.3, 5.2, Math.PI );
await stand( 'helm-standing', 0.55, 3.1, - 0.6, 0 );
await stand( 'tower', 0, 7, - 0.5, 0, - 0.2 );
await stand( 'tower-aft', 0, 7, - 0.5, Math.PI, - 0.6 );
await stand( 'tower-foot', 0, 3.1, - 2.98, 0 );

// up the ladder, by the keys
console.log( 'climb', await page.evaluate( async () => {

	const a = window.__app, p = a.player, keys = a.input;
	const at = a.boat.ladderAt( p.deckPos );
	p.climbing = a.boat.climb( at );
	return { ladder: at.ladder.id };

} ) );
await sleep( 3000 );
await shot( 'on-ladder' );

// what she costs, as the readout has it
console.log( 'readout', await page.evaluate( () => {

	const a = window.__app, i = a.renderer ? a.renderer.info : null;
	return { calls: i && i.render.calls, triangles: i && i.render.triangles, memory: performance.memory ? ( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 1 ) : null, text: ( document.querySelector( '[data-readout], .readout, #readout' ) || {} ).innerText || null };

} ) );
console.log( 'errors:', errs.length ? errs.slice( 0, 20 ).join( '\n' ) : 'none' );
await b.close();
