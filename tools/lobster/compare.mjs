#!/usr/bin/env node
// (M17) The lobster boat's way forward and up beside the photographs it's shaped after (docs/m17/back.md): each of
// tools/lobster/look.mjs' renders side by side with photographs of real Downeast boats, hot-linked from Wikimedia Commons where
// they're published (not kept), into <out>/compare-<view>.jpg.
//   node tools/lobster/look.mjs <renders> 5237 above portQuarter stepsIn sideDeck hatch roof
//   node tools/lobster/compare.mjs <renders> <out>        (ALL_THE_SPACES: its checkout, for Playwright)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ IN, OUT ] = process.argv.slice( 2 );
mkdirSync( OUT, { recursive: true } );
const commons = ( t ) => `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${ encodeURIComponent( t ) }&width=1100`;
const MARINA = [ commons( 'Lobster boat in marina.jpg' ), 'From above: her wheelhouse roof with its grab rails, the narrow side decks either side of the house, her foredeck. Bd2media (2019), CC BY-SA 4.0' ];
const CAMDEN = [ commons( 'Lobster boat in Camden, Maine.jpg' ), 'Camden, Maine: the side deck along her house to the foredeck, a hatch on the cuddy\'s top. Ryssby (2005), CC BY-SA 3.0' ];
const PORTLAND = [ commons( 'Portland harbour lobster boat 08.07.2012.jpg' ), 'Portland, Maine: the washboards beside the house, walked to her bow. Dirk Ingo Franke (2012), CC BY 3.0' ];
const REFS = {
	above: [ MARINA, CAMDEN ],
	portQuarter: [ CAMDEN, PORTLAND ],
	stepsIn: [ PORTLAND, MARINA ],
	sideDeck: [ MARINA, PORTLAND ],
	hatch: [ CAMDEN, MARINA ],
	roof: [ MARINA ],
};
const SAID = {
	above: 'Her side decks either side of the house, her foredeck with its hatch, her roof\'s grab rails',
	portQuarter: 'From her port quarter: the teak steps up at the house\'s corner (behind the barrel), the fold-down steps on the house side',
	stepsIn: 'The teak steps up to her washboard at the house\'s aft corner, to port',
	sideDeck: 'Along her side deck, a hand on the roof\'s grab rail',
	hatch: 'Her foredeck: the forward-opening hatch over the cuddy, her anchor on its roller',
	roof: 'From her roof, about 4 m up: over her bow',
};
const views = Object.keys( REFS ).filter( ( v ) => existsSync( join( IN, v + '.png' ) ) );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const b = await chromium.launch();
const page = await b.newPage( { viewport: { width: 1600, height: 900 } } );
for ( const v of views ) {

	const figs = REFS[ v ].map( ( r ) => `<figure><img src="${ r[ 0 ] }"><figcaption>${ r[ 1 ] }</figcaption></figure>` );
	const mine = readFileSync( join( IN, v + '.png' ) ).toString( 'base64' );
	await page.setContent( `<body style="margin:0;background:#222;color:#ddd;font:13px sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:6px"><figure><img src="data:image/png;base64,${ mine }"><figcaption>${ v }: ${ SAID[ v ] } (render, CPU)</figcaption></figure>${ figs.join( '' ) }<style>figure{margin:0}img{width:100%;height:420px;object-fit:contain;background:#555}</style>` );
	await page.waitForLoadState( 'networkidle', { timeout: 60000 } ).catch( () => {} );
	await page.waitForTimeout( 2500 );
	await page.screenshot( { path: join( OUT, `compare-${ v }.jpg` ), type: 'jpeg', quality: 86, fullPage: true } );
	console.log( 'compared', v );

}

await b.close();
