// (M16) Shoots the center console on her own from the given views, through a dev server on 5202, with Playwright on SwiftShader:
//   tools/render-slot.sh node tools/console/look.mjs out-dir [ view ... ]
// and if given a photo by url for a view, sets it beside the render (viewed, not saved: the page fetches it for the sheet)
import { chromium } from '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [ out, ...names ] = process.argv.slice( 2 );
// eye and target in her frame (+Z bow, +X port)
export const VIEWS = {
	side: { eye: [ 15.5, 1.3, 0.6 ], at: [ 0, 1.0, 0.3 ], fov: 30 },
	sideLow: { eye: [ 9, 0.55, 2.5 ], at: [ 0, 1.0, 0.5 ], fov: 40 },
	bowQuarter: { eye: [ 6.5, 2.6, 8.2 ], at: [ 0, 1.0, 0 ], fov: 38 },
	running: { eye: [ - 8.5, 5.8, 7.5 ], at: [ 0, 0.9, - 0.2 ], fov: 34 },
	stern: { eye: [ 1.5, 1.8, - 9.5 ], at: [ 0, 1.0, - 2 ], fov: 34 },
	sternQuarter: { eye: [ 4.5, 2.6, - 7.5 ], at: [ 0, 0.9, - 2.2 ], fov: 36 },
	plan: { eye: [ 0, 19, 0.2 ], at: [ 0, 0, 0.2 ], fov: 26, seaOn: false },
	helm: { eye: [ 0, 2.05, - 1.75 ], at: [ 0, 1.3, 0.3 ], fov: 55 },
	helmSeat: { eye: [ 0.2, 1.94, - 0.98 ], at: [ 0.1, 1.2, 0.6 ], fov: 60 },
	bow: { eye: [ 0, 2.05, 0.75 ], at: [ 0, 0.6, 3.2 ], fov: 68 },
	bowBack: { eye: [ 0.15, 2.3, 3.9 ], at: [ 0, 0.7, 0.4 ], fov: 62 },
	photo20: { eye: [ 7.2, 0.9, 4.8 ], at: [ 0, 1.2, 0.8 ], fov: 42 },
	photo12: { eye: [ - 9, 6.5, 8 ], at: [ 0, 0.6, 0 ], fov: 30 },
	photo25: { eye: [ - 1.0, 2.5, 0.6 ], at: [ 0, 0.6, - 2.6 ], fov: 68 },
	photo32: { eye: [ 0, 2.0, - 2.0 ], at: [ 0, 1.2, 0.2 ], fov: 58 },
	photo37: { eye: [ - 1.0, 1.9, - 2.3 ], at: [ 0.1, 0.8, - 4.2 ], fov: 58 },
	aftDeck: { eye: [ 0.8, 1.95, 0.2 ], at: [ 0.2, 0.7, - 3.0 ], fov: 62 },
	underTop: { eye: [ 0.2, 1.0, 1.4 ], at: [ 0.1, 2.5, - 0.8 ], fov: 75 },
	engines: { eye: [ 2.2, 1.7, - 5.8 ], at: [ 0, 0.6, - 3.7 ], fov: 40 },
	enginesTop: { eye: [ 0, 2.6, - 2.2 ], at: [ 0, 0.5, - 4.1 ], fov: 50 },
	gunwale: { eye: [ 0.2, 1.5, - 1.9 ], at: [ 1.1, 0.8, 0.2 ], fov: 62 },
};
const list = names.length ? names : Object.keys( VIEWS );
fs.mkdirSync( out, { recursive: true } );
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const p = await b.newPage( { viewport: { width: 1100, height: 720 } } );
p.on( 'pageerror', ( e ) => console.log( 'ERROR', e.message ) );
p.on( 'console', ( m ) => { if ( [ 'error', 'warning' ].includes( m.type() ) && ! /GPU stall|ReadPixels/.test( m.text() ) ) console.log( m.type(), m.text().slice( 0, 400 ) ); } );
await p.goto( 'http://127.0.0.1:5202/tools/console/look.html' );
await p.waitForFunction( () => window.ready, null, { timeout: 120000 } ).catch( ( e ) => console.log( e.message ) );
console.log( JSON.stringify( await p.evaluate( () => window.info() ) ) );
if ( process.env.BOAT_JS ) await p.evaluate( process.env.BOAT_JS );
for ( const n of list ) {

	const info = await p.evaluate( ( v ) => window.shot( v ), VIEWS[ n ] );
	await p.waitForTimeout( 200 );
	await p.screenshot( { path: path.join( out, n + '.png' ) } );
	console.log( n, 'calls', info.calls, 'tris', info.triangles );

}

await b.close();
