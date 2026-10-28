#!/usr/bin/env node
// (M15) The boat put out at sea, far from the island's middle: screenshots there (looking ahead, down
// over the side, back at the island, up at the sky), and how much the picture jumps as the camera's
// moved 0.05 mm a frame with the world held still. Anything drawn from world positions on the GPU snaps
// as it crosses a float's step there (2 mm at 20 km), where the rest moves smoothly: a red heat map of
// it next to each view, and the numbers in results.json.
//
//   pnpm dev, then
//   node tools/far-sea.mjs [tier] [weather] [hour] [metres out, comma separated]
//   node tools/far-sea.mjs high fair 11 600,1500,5000,10000,20000,40000
//
// Drawn on the CPU (headless Chromium on SwiftShader, from ../all-the-spaces' Playwright), into
// qa-output/far-sea/<tier>-<weather>/. A run takes about 3 minutes, and 2.5 more for each distance.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const { chromium } = await import( join( ROOT, '../all-the-spaces/node_modules/playwright/index.mjs' ) );

const [ TIER = 'high', WEATHER = 'fair', HOUR = '11', LIST = '600,1500,5000,10000,20000,40000' ] = process.argv.slice( 2 );
const DISTANCES = LIST.split( ',' ).map( Number );
const OUT = join( ROOT, 'qa-output/far-sea', `${ TIER }-${ WEATHER }` );
const URL_ = `http://127.0.0.1:5189/?tier=${ TIER }&weather=${ WEATHER }&hour=${ HOUR }`;
mkdirSync( OUT, { recursive: true } );

const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const wait = ( s ) => new Promise( ( r ) => setTimeout( r, s * 1000 ) );

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
const messages = [];
page.on( 'console', ( m ) => { if ( m.type() === 'error' || m.type() === 'warning' ) messages.push( `${ m.type() }: ${ m.text() }` ); } );
page.on( 'pageerror', ( e ) => messages.push( `pageerror: ${ e.message }` ) );
await page.goto( URL_ );
await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 600000 } );
log( 'started' );

// aboard, aft of the wheelhouse with the rod out, the clock held so every place has the same light
await page.evaluate( () => {

	const a = window.__app;
	a.player.boardBoat();
	a.game.time.hold( true );
	a.game.rod.equip( true );

} );
await wait( 100 ); // the clouds come in
log( 'aboard' );
const dock = await page.evaluate( () => { const p = window.__app.boatCtl.position; return { x: p.x, z: p.z }; } );

// d metres south of the dock, held there by her mooring lines (moved with her), her stern to the island
const placeAt = ( d ) => page.evaluate( ( [ x, z ] ) => {

	const b = window.__app.boatCtl;
	b.mooring.anchor.set( x, 0, z );
	b.mooring.heading = 0;
	b.position.x = x; b.position.z = z;
	b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 );
	b.quaternion.set( 0, 0, 0, 1 );

}, [ dock.x, dock.z + d ] );

async function view( name, yaw, pitch ) {

	await page.evaluate( ( [ yaw, pitch ] ) => {

		const a = window.__app;
		a.player.deckYaw = yaw; a.player.pitch = pitch;
		const g = a.game && a.game.guide;
		if ( g && g.open ) g.close();

	}, [ yaw, pitch ] );
	await wait( 6 );
	await page.screenshot( { path: join( OUT, `${ name }.png` ) } );

}

// the world held still and the camera stepped sideways 0.05 mm a frame, 41 frames: the largest change of
// each pixel between one frame and the next (an edge crossing a pixel shows anywhere; the snapping only
// out at sea)
async function jitter( name ) {

	const r = await page.evaluate( async () => {

		const a = window.__app;
		const frame = a.frame, adapt = a.adaptResolution;
		a.frame = function () {}; a.adaptResolution = function () {};
		await new Promise( ( r ) => setTimeout( r, 1500 ) );
		const cam = a.camera, gl = a.renderer.domElement;
		const W = gl.width, H = gl.height;
		const c2 = document.createElement( 'canvas' ); c2.width = W; c2.height = H;
		const ctx = c2.getContext( '2d', { willReadFrequently: true } );
		const x0 = cam.position.x, z0 = cam.position.z;
		const right = { x: Math.cos( cam.rotation.y ), z: - Math.sin( cam.rotation.y ) };
		const most = new Float32Array( W * H );
		let prev = null, sum = 0, frames = 0;
		for ( let k = 0; k <= 40; k ++ ) {

			cam.position.x = x0 + right.x * k * 0.05e-3;
			cam.position.z = z0 + right.z * k * 0.05e-3;
			cam.updateMatrixWorld();
			a.drawWorld();
			ctx.clearRect( 0, 0, W, H );
			ctx.drawImage( gl, 0, 0 );
			const px = ctx.getImageData( 0, 0, W, H ).data;
			if ( prev ) {

				for ( let i = 0, j = 0; i < px.length; i += 4, j ++ ) {

					const d = Math.max( Math.abs( px[ i ] - prev[ i ] ), Math.abs( px[ i + 1 ] - prev[ i + 1 ] ), Math.abs( px[ i + 2 ] - prev[ i + 2 ] ) );
					if ( d > most[ j ] ) most[ j ] = d;
					sum += d;

				}
				frames ++;

			}
			prev = px;
			await new Promise( ( r ) => setTimeout( r, 0 ) );

		}
		cam.position.x = x0; cam.position.z = z0;
		const img = ctx.getImageData( 0, 0, W, H ), d = img.data;
		let jumped = 0;
		for ( let i = 0, j = 0; i < d.length; i += 4, j ++ ) {

			const g = ( d[ i ] + d[ i + 1 ] + d[ i + 2 ] ) / 3 * 0.35, h = Math.min( 1, most[ j ] / 64 );
			if ( most[ j ] > 24 ) jumped ++;
			d[ i ] = g + ( 255 - g ) * h; d[ i + 1 ] = g * ( 1 - h ); d[ i + 2 ] = g * ( 1 - h ); d[ i + 3 ] = 255;

		}
		ctx.putImageData( img, 0, 0 );
		a.frame = frame; a.adaptResolution = adapt;
		// the mean change a pixel a frame (of 255), and the share of pixels that once jumped by more than 24
		return { meanStep: sum / ( frames * W * H ), jumped: jumped / ( W * H ), heat: c2.toDataURL( 'image/png' ) };

	} );
	writeFileSync( join( OUT, `${ name }-heat.png` ), Buffer.from( r.heat.split( ',' )[ 1 ], 'base64' ) );
	delete r.heat;
	return r;

}

const results = [];
for ( const d of DISTANCES ) {

	await placeAt( d );
	await wait( 20 );
	const at = await page.evaluate( () => {

		const b = window.__app.boatCtl;
		return { boat: b.position.toArray().map( ( v ) => + v.toFixed( 3 ) ), afloat: b.hasWater, wet: + b.wetFraction.toFixed( 3 ) };

	} );
	await view( `${ d }-ahead`, 0, - 0.05 );
	await view( `${ d }-down`, Math.PI / 2, - 0.75 );
	const down = await jitter( `${ d }-down` );
	await view( `${ d }-rod`, Math.PI / 2, - 0.25 );
	const rod = await jitter( `${ d }-rod` );
	await view( `${ d }-island`, Math.PI, 0.02 );
	await view( `${ d }-sky`, 0.6, 0.55 );
	log( `${ d } m`, JSON.stringify( { at, down, rod } ) );
	results.push( { metres: d, at, down, rod } );

}

writeFileSync( join( OUT, 'results.json' ), JSON.stringify( { tier: TIER, weather: WEATHER, hour: HOUR, results, messages }, null, 1 ) );
log( 'done:', OUT );
await browser.close();
