#!/usr/bin/env node
// (M16) Her at night from astern, at her helm, offshore in the real game: with her underwater lights alone, then with everything
// she can be fitted with, tower and all. A CPU render.   tools/render-slot.sh node tools/sportfisher/night.mjs <out dir> [tier]
const { chromium } = await import( '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs' );
const [ , , out = '.', tier = 'mid' ] = process.argv, PORT = process.env.PORT || 5203;
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await b.newPage( { viewport: { width: 1280, height: 720 } } );
page.setDefaultTimeout( 600000 );
const errs = [];
page.on( 'pageerror', ( e ) => errs.push( e.message ) );
let tries = 0;
page.on( 'pageerror', ( e ) => {

	if ( /Failed to fetch dynamically imported module/.test( e.message ) && tries ++ < 6 ) setTimeout( () => page.reload( { waitUntil: 'domcontentloaded' } ).catch( () => {} ), 3000 );

} );
await page.goto( `http://127.0.0.1:${ PORT }/?boat=sportfisher&tier=${ tier }&hour=21.5`, { waitUntil: 'domcontentloaded' } );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 15 * 60000 } );
const drawn = async ( n ) => {

	const f = await page.evaluate( () => window.__app.renderer.info.render.frame );
	await page.waitForFunction( ( t ) => window.__app.renderer.info.render.frame >= t, f + n );

};

// (a long frame on the CPU's a jump in the clock, and DaysOut takes a jump for a rest, and moves her: told to start again at each look.
// Early in the night, as a render's frames take it on hours)
await page.evaluate( () => {

	const a = window.__app, p = a.player, c = a.boatCtl, s = a.game.state;
	a.game.daysOut._T = null;
	s.boat = 'sportfisher';
	s.upgrades.sfUnderwaterLights = 1;
	a.game.applyGear();
	p.boardBoat();
	p.takeHelm();
	c.moored = false;
	c.position.set( - 2600, c.position.y, 3000 );
	p.camMode = 'third';
	p.orbitDist = 15;
	p.orbitPitch = 0.26;
	p.camInit = false;

} );
const hold = setInterval( () => page.evaluate( () => {

	window.__app.game.daysOut._T = null;

} ).catch( () => {} ), 2000 );
await drawn( 8 );
await page.screenshot( { path: `${ out }/night-lights-only.png` } );
const fitted = await page.evaluate( async () => {

	const a = window.__app, s = a.game.state, { UPGRADES } = await import( '/src/game/Gear.js' );
	for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.on === 'sportfisher' || ! t.on ) s.upgrades[ k ] = t.levels.length - 1;
	a.game.applyGear();
	return { fitted: a.boat.fitted, under: s.stats.underwaterLights, deckLights: s.stats.deckLights };

} );
console.log( JSON.stringify( fitted ) );
await drawn( 8 );
await page.screenshot( { path: `${ out }/night-complete.png` } );
clearInterval( hold );
console.log( 'errors', errs.filter( ( e ) => ! /dynamically/.test( e ) ).join( ';' ) || 'none' );
await b.close();
