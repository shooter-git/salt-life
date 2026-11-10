#!/usr/bin/env node
// (M17 step 4) The looks beside the photographs they're set after (docs/m17/looks.md): tools/looks/look.mjs' renders, before and
// after, side by side with photographs hot-linked from where they're published (not kept), one picture a look, into <out>/.
//   node tools/looks/compare.mjs <before dir> <after dir> <out> [looks]     (the dirs: look.mjs' <out>/<tier>; ALL_THE_SPACES;
//   BEFORE_LABEL, AFTER_LABEL: the columns' names, 53ffb1c and this branch by default)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ BEFORE, AFTER, OUT, ONLY ] = process.argv.slice( 2 );
mkdirSync( OUT, { recursive: true } );
const commons = ( t ) => `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${ encodeURIComponent( t ) }&width=900`;
const PHOTO = {
	fleetReview: [ commons( 'Flares being fired from illuminated ships during International Fleet Review 2016.jpg' ), 'Aerial flares over the International Fleet Review, Visakhapatnam, 2016 (Commons): a pink-white core, a red glare, at about 1.5 km' ],
	bella: [ 'https://images.squarespace-cdn.com/content/v1/6390950b9294bc3633a78483/1670419739369-BY4K7CGG7A1KND5E2PRV/Bella-lobster-yacht-tern-boatworks-sailing(1).jpeg?format=1000w', 'Bella, Tern Boatworks\' 38 ft Downeast: barn red, its side out of the sun (52,15,22) and its flare in it (97,36,43)' ],
	viking: [ 'https://images.boatsgroup.com/images/1/79/71/7697971_20210119115231481_1_XLARGE.jpg', 'A 2008 Viking 48 in Fort Lauderdale\'s morning sun (Off the Hook Yachts): white topsides in sun (228,227,219), her transom in shade (44,75,95)' ],
	donzi: [ 'https://images.boatsgroup.com/resize/1/48/21/2005-donzi-38-zsf-power-9634821-971763173-0-121220241138-0.jpg', 'A 2005 Donzi 38 ZSF\'s navy in sun (12,37,84) (boats.com listing)' ],
	competition: [ 'https://competitionboats.net/wp-content/uploads/2014/12/IMG_0072.jpg', 'A Competition console\'s navy in sun (24,37,56) (Competition Boats)' ],
	marlin: [ 'https://www.marlinmag.com/wp-content/uploads/2021/09/sport-fishing-boat-underwater-lights-1024x768.jpg', 'From a sportfisher\'s bridge, her underwater lights on (Chris Rabil, Marlin): white-blue, hot at the transom' ],
	sandpiper: [ 'https://panbo.com/assets_c/2015/12/Sandpiper_lights_up_Camden_Public_Landing_cPanbo-thumb-autox620-12472.jpg', 'Sandpiper\'s transom lights at Camden (Panbo): five lamps, the water and her transom\'s foot lit' ],
	sws: [ 'https://www.saltwatersportsman.com/wp-content/uploads/2021/09/SWS1120-Night-Lights-2.jpg', 'A console\'s underwater lights in clear water (Salt Water Sportsman): the sea lit all round her' ],
	seatech: [ 'https://www.thesuggested.com/wp-content/uploads/2022/01/submerged-boat-LED-lights-green-seatechmarineproducts.com_.jpg', 'Green transom lights from her side (seatechmarineproducts.com via thesuggested.com): a hot core, emerald going off a boat\'s length' ],
	dock: [ 'https://cdn.shopify.com/s/files/1/0280/6182/7212/files/laser_2000_A.jpg?v=1718713839', 'A green light in the water from above (underwatergreenfishinglights.com): a white-green core, emerald about it' ],
};
// each look: the renders (names in look.mjs' dirs) and the photographs beside them
const LOOKS = {
	'flare-night': { shots: [ 'flare-night-100', 'flare-night-300', 'flare-night-2000', 'flare-night-8000' ], photos: [ 'fleetReview' ] },
	'flare-day': { shots: [ 'flare-day-300', 'flare-day-1500', 'flare-day-3000' ], photos: [] },
	'red-console': { shots: [ 'console-red-sun', 'console-red-shade' ], photos: [ 'bella' ] },
	'red-sportfisher': { shots: [ 'sportfisher-red-sun', 'sportfisher-red-shade' ], photos: [ 'bella' ] },
	'navy': { shots: [ 'console-own-sun', 'console-own-shade', 'sportfisher-navy-sun', 'sportfisher-navy-shade' ], photos: [ 'donzi', 'competition' ] },
	'white-lobster': { shots: [ 'lobster-white-sun', 'lobster-white-shade' ], photos: [ 'viking', 'bella' ] },
	'berths': { shots: [ 'berth-red-west', 'berth-red-east', 'berth-navy-west', 'berth-navy-east', 'berth-afternoon-west' ], photos: [] },
	'pool': { shots: [ 'pool-deck', 'pool-bridge', 'pool-side', 'pool-stern' ], photos: [ 'marlin', 'seatech', 'sandpiper', 'sws', 'dock' ] },
};
const b = await chromium.launch();
const page = await b.newPage( { viewport: { width: 1500, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) salt-life looks' } );
for ( const [ name, L ] of Object.entries( LOOKS ) ) {

	if ( ONLY && ! ONLY.split( ',' ).includes( name ) ) continue;
	// (the renders inline: a page set from a string can't load local files)
	const img = ( dir, s ) => existsSync( join( dir, s + '.png' ) ) ? `<img src="data:image/png;base64,${ readFileSync( join( dir, s + '.png' ) ).toString( 'base64' ) }">` : '<div class="none">none</div>';
	const rows = L.shots.map( ( s ) => `<tr><th>${ s }</th><td>${ img( BEFORE, s ) }</td><td>${ img( AFTER, s ) }</td></tr>` ).join( '' );
	const photos = L.photos.map( ( k ) => `<figure><img src="${ PHOTO[ k ][ 0 ] }"><figcaption>${ PHOTO[ k ][ 1 ] }</figcaption></figure>` ).join( '' );
	await page.setContent( `<style>body{margin:8px;background:#1d1f22;color:#ddd;font:13px sans-serif}table{border-collapse:collapse}th{font-weight:normal;text-align:left;width:140px;vertical-align:top}td img{width:560px;display:block}td{padding:2px}.none{width:560px;height:60px;color:#777}
		.photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}figure{margin:0;width:420px}figure img{width:100%}h2{margin:4px 0}</style>
		<h2>${ name }: ${ process.env.BEFORE_LABEL || 'before (53ffb1c)' } · ${ process.env.AFTER_LABEL || 'after' }</h2><table>${ rows }</table><div class="photos">${ photos }</div>` );
	await page.waitForLoadState( 'networkidle' ).catch( () => {} );
	await page.waitForTimeout( 1500 );
	await page.screenshot( { path: join( OUT, name + '.png' ), fullPage: true } );
	console.log( 'wrote', name );

}

await b.close();
