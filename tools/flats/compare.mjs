#!/usr/bin/env node
// (M17) The flats' fish beside the photographs they're shaped after (docs/m17/sight.md, docs/m17/sources-tide-fish.md's
// references): each of tools/flats/sight.mjs' renders (qa-output/flats/sight/<tier>/) side by side with the
// photographs, hot-linked from where they're published (not kept), into qa-output/flats/compare/<tier>/.
//   node tools/flats/compare.mjs [tier] [views]      (ALL_THE_SPACES: its checkout, for Playwright)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ TIER = 'low', VIEWS ] = process.argv.slice( 2 );
const IN = join( ROOT, 'qa-output/flats/sight', TIER ), OUT = join( ROOT, 'qa-output/flats/compare', TIER );
mkdirSync( OUT, { recursive: true } );
const commons = ( t ) => `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${ encodeURIComponent( t ) }&width=900`;
const FM = 'https://www.floridamuseum.ufl.edu/wp-content/uploads/sites/66/2017/05/';
// each view's photographs: [ url, what it is ]; or { page, img }: the article's picture of it, shot off the page
const REFS = {
	tails: [ [ FM + 'Albula-vulpes-03.jpg', 'Bonefish tailing on a shallow flat. Florida Museum, photo Kenneth Krysko' ] ],
	above: [ [ 'https://deneki.wpengine.com/wp-content/uploads/2012/02/Bonefish-Shadow-1.jpg', 'A bonefish and its shadow on sand, South Andros. Photo Louis Cahill (Deneki)' ], [ 'https://deneki.wpengine.com/wp-content/uploads/2015/05/peter-bonefish-shadow.jpg', 'Spotting shadows. Photo Peter Viau (Deneki)' ] ],
	cruise: [ [ FM + 'Albula-vulpes-02.jpg', 'Schooling bonefish. Florida Museum, photo Kenneth Krysko' ], [ 'https://deneki.wpengine.com/wp-content/uploads/2015/05/peter-bonefish-shadow.jpg', 'Spotting shadows. Photo Peter Viau (Deneki)' ] ],
	muds: [ { page: 'https://www.floridasportsman.com/editorial/how-to-read-water-flats-surf-muds-bait-bottom/474760', img: 'img[alt*="muds"]', what: 'A mud left by a bonefish on a grass flat. Florida Sportsman (2023)' } ],
	permit: [ [ 'https://images.squarespace-cdn.com/content/v1/509fcdf4e4b046b429519b35/5e562aa6-b92d-4996-b2a4-17091c5b6191/fly-fishing-tailing-permit-pr-1.jpg', 'Tailing permit, Puerto Rico. Photo Nick Price' ] ],
	laid: [ [ 'https://www.saltwatersportsman.com/wp-content/uploads/2021/09/lu_tarpon-2a_-_suescun.jpg?w=800', 'A tarpon alone in clear shallow water. Salt Water Sportsman, photo Alex Suescun' ], [ 'https://www.saltwatersportsman.com/wp-content/uploads/2021/09/lu_tarpon-5a_-_suescun.jpg?w=800', 'A laid-up tarpon gulping air. Photo Alex Suescun' ] ],
	roll: [ [ 'https://flylordsmag.com/wp-content/uploads/2025/05/Tarpon-Rolling.jpg', 'Tarpon rolling. Flylords (2025)' ], [ 'https://i0.wp.com/flylordsmag.com/wp-content/uploads/2025/06/DSC05178.webp?resize=696%2C464&quality=60&ssl=1', 'Why do tarpon roll. Flylords (2025)' ] ],
	snook: [ [ commons( 'Snook (159046493).jpg' ), 'Snook over sand, Jupiter FL. Clinton & Charles Robertson, CC BY-SA 2.0' ] ],
	cuda: [ [ FM + 'Albula-vulpes-pred.jpg', 'Great barracuda. Florida Museum, photo NOAA' ] ],
	sharks: [ [ commons( 'Juvenile Lemon Sharks at Key West National Wildlife Refuge (53815627550).jpg' ), 'Young lemon sharks, Key West NWR. USFWS' ], [ commons( 'Negaprion brevirostris bahamas.jpg' ), 'Lemon shark, Bahamas (Commons)' ] ],
	blacktips: [ [ commons( 'Carcharhinus limbatus SI2.jpg' ), 'Blacktip shark (Commons)' ] ],
};
const views = ( VIEWS ? VIEWS.split( ',' ) : Object.keys( REFS ) ).filter( ( v ) => existsSync( join( IN, v + '.png' ) ) );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const b = await chromium.launch();
const page = await b.newPage( { viewport: { width: 1600, height: 900 } } );
for ( const v of views ) {

	const figs = [];
	for ( const r of REFS[ v ] || [] ) {

		if ( Array.isArray( r ) ) {

			figs.push( `<figure><img src="${ r[ 0 ] }"><figcaption>${ r[ 1 ] }</figcaption></figure>` );
			continue;

		}

		// (a lazily loaded picture: the article's own, scrolled to and shot)
		const p = await b.newPage( { viewport: { width: 1200, height: 900 } } );
		try {

			await p.goto( r.page, { timeout: 90000, waitUntil: 'domcontentloaded' } );
			const el = p.locator( r.img ).first();
			await el.scrollIntoViewIfNeeded( { timeout: 30000 } );
			await p.waitForTimeout( 4000 );
			const shot = await el.screenshot( { timeout: 30000 } );
			figs.push( `<figure><img src="data:image/png;base64,${ shot.toString( 'base64' ) }"><figcaption>${ r.what }</figcaption></figure>` );

		} catch ( e ) {

			console.log( v, 'no picture from', r.page, String( e ).slice( 0, 120 ) );

		}

		await p.close();

	}

	const mine = readFileSync( join( IN, v + '.png' ) ).toString( 'base64' );
	const bare = existsSync( join( IN, v + '-bare.png' ) ) ? `<figure><img src="data:image/png;base64,${ readFileSync( join( IN, v + '-bare.png' ) ).toString( 'base64' ) }"><figcaption>${ v }: without the glasses</figcaption></figure>` : '';
	await page.setContent( `<body style="margin:0;background:#222;color:#ddd;font:13px sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:6px"><figure><img src="data:image/png;base64,${ mine }"><figcaption>${ v }: render (CPU, ${ TIER }, through the glasses)</figcaption></figure>${ bare }${ figs.join( '' ) }<style>figure{margin:0}img{width:100%;height:420px;object-fit:contain;background:#555}</style>` );
	await page.waitForLoadState( 'networkidle', { timeout: 60000 } ).catch( () => {} );
	await page.waitForTimeout( 2500 );
	await page.screenshot( { path: join( OUT, `compare-${ v }.jpg` ), type: 'jpeg', quality: 86, fullPage: true } );
	console.log( 'compared', v );

}

await b.close();
