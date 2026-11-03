#!/usr/bin/env node
// (M16) Marta's pictures of the boats: public/boats/<id>.webp, each drawn from her model on a CPU (SwiftShader), side-on,
// cut at her waterline. Run it again when a model changes, with a dev server on the port given:
//   node tools/boat-pictures.mjs [port] [id ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ATS = process.env.ATS || '/home/shooter/Documents/VS Code/all-the-spaces';
const { chromium } = await import( `${ ATS }/node_modules/playwright/index.mjs` );
const [ port = '5189', ...ids ] = process.argv.slice( 2 );
const OUT = fileURLToPath( new URL( '../public/boats/', import.meta.url ) );
mkdirSync( OUT, { recursive: true } );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
page.on( 'pageerror', ( e ) => console.log( 'page:', e.message ) );
await page.goto( `http://127.0.0.1:${ port }/tools/boat-pictures/page.html` );
await page.waitForFunction( () => window.ready );
for ( const id of ids.length ? ids : [ 'kayak', 'console', 'lobster', 'sportfisher' ] ) {

	const url = await page.evaluate( ( i ) => window.picture( i ), id );
	const bytes = Buffer.from( url.split( ',' )[ 1 ], 'base64' );
	writeFileSync( `${ OUT }${ id }.webp`, bytes );
	console.log( `${ id }: ${ ( bytes.length / 1024 ).toFixed( 1 ) } KB` );

}

await browser.close();
