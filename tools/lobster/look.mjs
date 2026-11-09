// (M17) Shoots the lobster boat on her own from the given views (her foredeck, her side decks, her steps and her roof), through a dev
// server, with Playwright on SwiftShader:
//   tools/render-slot.sh node tools/lobster/look.mjs out-dir [ port ] [ view ... ]      (ALL_THE_SPACES: its checkout)
// BOAT_JS: something to run on her first (window.boat), as tools/console/look.mjs takes it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || path.join( ROOT, '../all-the-spaces' );
const { chromium } = await import( path.join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ out, PORT = '5237', ...names ] = process.argv.slice( 2 );
// eye and target in her frame (+Z bow, +X port)
export const VIEWS = {
	side: { eye: [ 16, 1.6, 0.4 ], at: [ 0, 1.3, 0.3 ], fov: 30 },
	portQuarter: { eye: [ 7.5, 3.4, - 6.5 ], at: [ 0.4, 1.4, 0 ], fov: 38 },
	portBow: { eye: [ 6.5, 3.2, 7.5 ], at: [ 0.2, 1.4, 0.6 ], fov: 38 },
	above: { eye: [ 5.5, 9.5, - 3.5 ], at: [ 0, 1.0, 0.4 ], fov: 36 },
	plan: { eye: [ 0, 19, 0.2 ], at: [ 0, 0, 0.2 ], fov: 30, seaOn: false },
	// what you see
	steps: { eye: [ 0.15, 1.75, - 1.75 ], at: [ 1.15, 0.75, - 0.55 ], fov: 62 },
	stepsIn: { eye: [ - 0.35, 1.85, 0.45 ], at: [ 1.2, 0.8, - 0.75 ], fov: 62 },
	stern: { eye: [ 0.2, 2.2, - 1.2 ], at: [ 0, 0.8, - 3.8 ], fov: 60 },
	stepsOut: { eye: [ 4.2, 2.3, - 2.6 ], at: [ 1.1, 1.0, - 0.5 ], fov: 40 },
	sideDeck: { eye: [ 1.32, 2.75, - 0.55 ], at: [ 1.22, 1.15, 1.6 ], fov: 66 },
	foredeck: { eye: [ 0.2, 2.9, 2.2 ], at: [ 0, 1.2, 4.6 ], fov: 64 },
	roof: { eye: [ 0.4, 4.05, - 0.4 ], at: [ 0, 1.5, 6 ], fov: 70 },
	roofAft: { eye: [ - 0.3, 4.05, 1.0 ], at: [ 0.3, 1.2, - 3.5 ], fov: 70 },
	hatch: { eye: [ 1.6, 3.2, 1.5 ], at: [ 0, 1.3, 2.9 ], fov: 50 },
	bowAnchor: { eye: [ 2.4, 2.3, 6.2 ], at: [ 0, 1.4, 3.9 ], fov: 44 },
};
const list = names.length ? names : Object.keys( VIEWS );
fs.mkdirSync( out, { recursive: true } );
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const p = await b.newPage( { viewport: { width: 1100, height: 720 } } );
p.on( 'pageerror', ( e ) => console.log( 'ERROR', e.message ) );
p.on( 'console', ( m ) => { if ( [ 'error', 'warning' ].includes( m.type() ) && ! /GPU stall|ReadPixels/.test( m.text() ) ) console.log( m.type(), m.text().slice( 0, 400 ) ); } );
await p.goto( `http://127.0.0.1:${ PORT }/tools/lobster/look.html${ process.env.LOOK_QUERY || '' }` );
await p.waitForFunction( () => window.ready, null, { timeout: 180000 } ).catch( ( e ) => console.log( e.message ) );
console.log( JSON.stringify( await p.evaluate( () => ( { tris: window.boat.triangleCount, meshes: Object.keys( window.boat.meshes ) } ) ) ) );
if ( process.env.BOAT_JS ) await p.evaluate( process.env.BOAT_JS );
for ( const n of list ) {

	const info = await p.evaluate( ( v ) => window.shot( v ), VIEWS[ n ] );
	await p.waitForTimeout( 200 );
	await p.screenshot( { path: path.join( out, n + '.png' ) } );
	console.log( n, 'calls', info.calls, 'tris', info.triangles );

}

await b.close();
