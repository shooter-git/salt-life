#!/usr/bin/env node
// (M16) Her from the views she's compared by, or from any named here: node tools/sportfisher/shots.mjs <out dir> [tier] [view ...]
// Wrap it: tools/render-slot.sh node tools/sportfisher/shots.mjs out. A CPU render (SwiftShader), not a phone's or a card's.
const PW = '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs';
const { chromium } = await import( PW );
const [ , , out = '.', tier = 'high', ...want ] = process.argv;
const PORT = process.env.PORT || 5203;
export const VIEWS = {
	// outside: as the photographs of her are
	side: [ 1.5, 2.2, - 40, 1.5, 3.6, 0, 26 ],
	sideP: [ 40, 2.2, 1.5, 1.5, 3.4, 1.5, 26 ],
	bowQ: [ 26, 3, 24, 0, 3.2, 0.5, 30 ],
	sternQ: [ 26, 3.2, - 22, 0, 3.0, - 1, 30 ],
	stern: [ 0, 2.4, - 30, 0, 3.8, 0, 28 ],
	bow: [ 0, 2.4, 34, 0, 3.8, 0, 26 ],
	above: [ 14, 24, - 18, 0, 2, - 0.5, 36 ],
	towerSide: [ 20, 5.5, - 10, 0, 5.5, - 1, 36 ],
	// aboard
	cockpit: [ 0, 2.3, - 6.1, 0, 1.4, - 2, 70 ],
	cockpitFwd: [ 1.2, 1.9, - 5.4, - 0.3, 2.0, - 2.2, 75 ],
	mezz: [ - 1, 2.0, - 2.9, 0.8, 1.0, - 6, 70 ],
	helm: [ 0, SFY( 1.5 ), - 0.1, 0, SFY( 1 ), 1.6, 70 ],
	bridgeAft: [ 0.3, SFY( 1.55 ), - 2.8, 0, SFY( 0.9 ), 1, 75 ],
	bridgeBack: [ 0.2, SFY( 1.5 ), 0, 0, SFY( 0.8 ), - 3.5, 75 ],
	towerTop: [ 0, 8.62, - 0.6, 0, 7.5, 6, 75 ],
	towerDown: [ 0, 8.62, - 0.3, 0, 3.5, - 2.6, 75 ],
	ladderUp: [ 0, 4.6, - 3.0, 0, 7.4, - 1.2, 70 ],
	salon: [ - 0.3, 2.6, - 2.1, 0.2, 1.6, 1.2, 80 ],
	salonFwd: [ 0.6, 2.6, 1.2, - 0.1, 1.4, - 2, 80 ],
	galley: [ 0.1, 2.5, - 0.9, - 1.5, 1.8, 1.2, 80 ],
	stairs: [ 0, 2.6, 0, 0, 0.7, 2.6, 70 ],
	bunks: [ 0.1, 1.55, 2.9, 1.3, 0.9, 2.3, 85 ],
	stateroom: [ 0, 1.75, 3.55, 0, 0.7, 5, 80 ],
	head: [ - 0.3, 1.7, 3.0, - 1.1, 0.8, 2, 85 ],
	foredeck: [ 0, 3.5, 7.8, 0, 2.5, 0, 60 ],
	sidedeck: [ 2, 3.0, - 2.2, 1.9, 2, 3, 70 ],
};
function SFY( h ) { return 3.1 + h; }
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const p = await b.newPage( { viewport: { width: 1280, height: 720 } } );
p.on( 'console', ( m ) => { if ( m.type() === 'error' || m.type() === 'warning' ) console.log( m.type(), m.text().slice( 0, 400 ) ); } );
p.on( 'pageerror', ( e ) => console.log( 'pageerror', e.message ) );
await p.goto( `http://127.0.0.1:${ PORT }/tools/sportfisher/view.html?tier=${ tier }` );
await p.waitForFunction( 'window.ready', null, { timeout: 180000 } );
for ( const name of want.length ? want : Object.keys( VIEWS ) ) {

	const info = await p.evaluate( ( v ) => {

		const r = window.view( ...v );
		return { calls: r.calls, triangles: r.triangles };

	}, VIEWS[ name ] );
	await p.screenshot( { path: `${ out }/${ tier }-${ name }.png` } );
	console.log( name, info.calls, info.triangles );

}

await b.close();
