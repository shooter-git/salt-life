#!/usr/bin/env node
// (M17) The moon beside the photographs it's shaped after (docs/m17/moon.md): each of tools/moon/look.mjs' renders
// (qa-output/moon/look/<tier>/) side by side with photographs from Wikimedia Commons, hot-linked (not kept), into
// qa-output/moon/compare/<tier>/.
//   node tools/moon/compare.mjs [tier] [shots]      (ALL_THE_SPACES: its checkout, for Playwright)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ TIER = 'low', SHOTS ] = process.argv.slice( 2 );
const IN = join( ROOT, 'qa-output/moon/look', TIER ), OUT = join( ROOT, 'qa-output/moon/compare', TIER );
mkdirSync( OUT, { recursive: true } );
const commons = ( t ) => `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${ encodeURIComponent( t ) }&width=900`;
// each shot's photographs: [ Commons file, what it is ]
const REFS = {
	'crescent-disc': [ [ 'Crescent Moon with Earthshine.jpg', 'A crescent with earthshine (Commons)' ], [ '2024-06-08 Waxing Crescent Earthshine.jpg', 'Waxing crescent, earthshine, 8 June 2024 (Commons)' ] ],
	'quarter-disc': [ [ 'First quarter moon in Novokuznetsk.jpg', 'First quarter, Novokuznetsk (Commons)' ] ],
	'gibbous-disc': [ [ 'Waxing gibbous moon, 2022-10-04.jpg', 'Waxing gibbous, 4 October 2022 (Commons)' ], [ 'The Moon Luc Viatour.jpg', 'The moon, Luc Viatour (CC BY-SA 3.0)' ] ],
	'full-disc': [ [ 'FullMoon2010.jpg', 'Full moon, Gregory H. Revera (CC BY-SA 3.0)' ], [ 'Full Moon Luc Viatour.jpg', 'Full moon, Luc Viatour (CC BY-SA 3.0)' ] ],
	'crescent-sky': [ [ 'Springtime crescent moon 02.jpg', 'A crescent at dusk (Commons)' ], [ 'Crescent Moon - Valencia, CA (50727236562).jpg', 'Crescent moon, Valencia CA (Commons)' ] ],
	'quarter-sky': [ [ 'Waxing half moon over Brofjorden 1.jpg', 'Waxing half moon over Brofjorden (Commons)' ] ],
	'full-sky': [ [ 'Moon over sea Cala Millor.jpg', 'Moon over the sea, Cala Millor (Commons)' ], [ 'Moonlight over the Red Sea (53255278929).jpg', 'Moonlight over the Red Sea (Commons)' ] ],
	'full-sea': [ [ 'Moon over sea Cala Millor 2.jpg', 'Moon over the sea, Cala Millor (Commons)' ], [ 'Moonlight Over The Sea (223535943).jpeg', 'Moonlight over the sea (Commons)' ] ],
	'gibbous-sea': [ [ 'Moonlight over the North Sea - geograph.org.uk - 7662968.jpg', 'Moonlight over the North Sea (geograph, CC BY-SA 2.0)' ] ],
	'full-beach': [ [ 'Moonlit beach in Calas de Mallorca.jpg', 'Moonlit beach, Calas de Mallorca (Commons)' ], [ 'Tegbi Beach on a Moonlit Night.jpg', 'Tegbi beach on a moonlit night (Commons)' ] ],
	'new-sky': [ [ 'Milky way beach.jpg', 'The Milky Way over a beach (Commons)' ], [ 'Beach-night-stars-usa (24216497582).jpg', 'A beach under the stars (Commons)' ] ],
	'new-beach': [ [ 'Beach-night-stars-usa (24216497582).jpg', 'A beach under the stars (Commons)' ], [ 'Milky Way at Kevin Grove Beach (53178270349).jpg', 'Milky Way at a beach (Commons)' ] ],
};
const shots = ( SHOTS ? SHOTS.split( ',' ) : Object.keys( REFS ) ).filter( ( v ) => existsSync( join( IN, v + '.png' ) ) );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const b = await chromium.launch();
const page = await b.newPage( { viewport: { width: 1600, height: 900 } } );
for ( const v of shots ) {

	const figs = ( REFS[ v ] || [] ).map( ( [ t, what ] ) => `<figure><img src="${ commons( t ) }"><figcaption>${ what }</figcaption></figure>` );
	const mine = `data:image/png;base64,${ readFileSync( join( IN, v + '.png' ) ).toString( 'base64' ) }`;
	await page.setContent( `<html><body style="margin:0;background:#222;color:#ddd;font:14px sans-serif;display:flex;flex-wrap:wrap;gap:8px;padding:8px">
		<figure style="margin:0"><img src="${ mine }" style="height:420px"><figcaption>Salt Life, ${ TIER }: ${ v }</figcaption></figure>
		${ figs.join( '' ).replace( /<figure>/g, '<figure style="margin:0">' ).replace( /<img /g, '<img style="height:420px;max-width:760px;object-fit:contain" ' ) }
	</body></html>`, { waitUntil: 'networkidle', timeout: 120000 } );
	await page.screenshot( { path: join( OUT, v + '.png' ), fullPage: true } );
	console.log( 'compared', v );

}

await b.close();
