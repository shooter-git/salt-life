#!/usr/bin/env node
// (M16) Each boat's own model, what tools/moored-bake.mjs baked of her and the stand-in, side by side from where she's seen
// (the pier, the beach, her quarter, close by), on a CPU (SwiftShader), with a dev server on the port given:
//   tools/render-slot.sh node tools/moored-bake/look.mjs port out-dir [ id[:view[:upgraded]] ... ]
import { mkdirSync, writeFileSync } from 'node:fs';

const ATS = process.env.ATS || '/home/shooter/Documents/VS Code/all-the-spaces';
const { chromium } = await import( `${ ATS }/node_modules/playwright/index.mjs` );
const [ port = '5189', out = '.', ...specs ] = process.argv.slice( 2 );
mkdirSync( out, { recursive: true } );
const ALL = { tTop: true, twin: true, diveLadder: true, tankRack: true, tower: true, outriggers: true, chair: true, holdKg: 99, finder: true, trolley: true, anchorM: 10 };
const NONE = { tTop: false, twin: false, diveLadder: false, tankRack: false, tower: false, outriggers: false, chair: false, holdKg: 12, finder: false, trolley: false, anchorM: 0 };
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
page.on( 'pageerror', ( e ) => console.log( 'page:', e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && console.log( 'console:', m.text() ) );
await page.goto( `http://127.0.0.1:${ port }/tools/moored-bake/page.html` );
await page.waitForFunction( () => window.ready );
for ( const spec of specs.length ? specs : [ 'kayak', 'console', 'lobster', 'sportfisher' ].flatMap( ( id ) => [ `${ id }:pier`, `${ id }:beach` ] ) ) {

	const [ id, view = 'pier', how = '', paint = '' ] = spec.split( ':' );
	const stats = how === 'all' ? ALL : how === 'none' ? NONE : null;
	const r = await page.evaluate( ( [ i, v, s, p ] ) => window.sheet( i, v, { stats: s, paint: p ? parseInt( p, 16 ) : null } ), [ id, view, stats, paint ] );
	const file = `${ out }/${ spec.replace( /:/g, '-' ) }.png`;
	writeFileSync( file, Buffer.from( r.url.split( ',' )[ 1 ], 'base64' ) );
	console.log( `${ file }: her model ${ r.tris.model }, baked ${ r.tris.baked }, stand-in ${ r.tris.stand } triangles` );

}

await browser.close();
