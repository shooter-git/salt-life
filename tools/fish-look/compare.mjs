// (M16) Each new fish's render beside the photographs it's shaped after (the photographs hot-linked from Wikimedia
// Commons, not kept): node tools/fish-look/compare.mjs <out dir> [ fish ... ]   with the dev server on PORT (5206).
// Wrap it in tools/render-slot.sh.
import { chromium } from '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs';

const PORT = process.env.PORT || 5206;
const C = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
const REFS = {
	wahoo: [ 'File:Acanthocybium_solandri.png', 'File:Thazard_batard_(Acanthocybium_solandri)_(Ifremer_00763-87509).jpg' ],
	sailfish: [ 'File:Sailfish_(Duane_Raver).png', 'File:Atlantic_Sailfish_(Istiophorus_albicans)_Art_Patrick_J._Lynch_CC-BY.jpg' ],
	whiteMarlin: [ 'File:White_marlin_(Duane_Raver).png', 'File:White_Marlin_-_Kajikia_albida.jpg' ],
	blueMarlin: [ 'File:Blue_marlin_(Duane_Raver).png', 'File:Marlin_bleu_(Makaira_nigricans)_(Ifremer_00761-87302).jpg' ],
	swordfish: [ 'File:Swordfish-Xiphias_gladius.png', 'File:Espadon_(Xiphias_gladius)_(Ifremer_00764-87622).jpg' ],
	yellowfin: [ 'File:Thon_albacore_(Thunnus_albacares)_(Ifremer_00764-87616).jpg', 'File:Thunnus_albacares_247699300.jpg' ],
	tuna: [ 'File:Blackfin_tuna,_Duane_Raver_Jr.jpg', 'File:Thunnus_atlanticus_215085116.jpg' ],
	redfish: [ 'File:Red_Drum_(Sciaenops_ocellatus).jpg', 'File:Sciaenops_ocellatus.jpg' ],
	trout: [ 'File:Spotted_seatrout_fish_cynoscion_nebulosus.jpg', 'File:Cynoscion_nebulosus.jpg' ],
};
const [ dir, ...want ] = process.argv.slice( 2 );
const fish = want.length ? want : Object.keys( REFS );
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const thumb = ( title ) => `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${ encodeURIComponent( title.slice( 5 ) ) }&width=800`;
const page = await b.newPage( { viewport: { width: 1000, height: 430 } } );
page.on( 'console', ( m ) => { if ( m.type() === 'error' ) console.log( m.text().slice( 0, 400 ) ); } );
page.on( 'pageerror', ( e ) => console.log( String( e ).slice( 0, 400 ) ) );
for ( const f of fish ) {

	const views = [];
	for ( const q of [ '', '&lite=1' ] ) {

		await page.setViewportSize( { width: 1000, height: 430 } );
		await page.goto( `http://127.0.0.1:${ PORT }/tools/fish-look/index.html?fish=${ f }${ q }` );
		await page.waitForFunction( 'window.ready === true', null, { timeout: 120000 } );
		await page.waitForTimeout( 300 );
		views.push( ( await page.screenshot( { type: 'jpeg', quality: 88 } ) ).toString( 'base64' ) );

	}

	const tris = await page.evaluate( () => window.tris );
	console.log( f, 'triangles by lod', tris.join( ' ' ) );
	await page.setViewportSize( { width: 1500, height: 880 } );
	const refs = ( REFS[ f ] || [] ).map( ( t ) => `<figure><img src="${ thumb( t ) }"><figcaption>${ t.slice( 5 ) }</figcaption></figure>` ).join( '' );
	await page.setContent( `<body style="margin:0;background:#222;color:#ddd;font:13px sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:6px"><figure><img src="data:image/jpeg;base64,${ views[ 0 ] }"><figcaption>${ f }: render (CPU, high tier)</figcaption></figure><figure><img src="data:image/jpeg;base64,${ views[ 1 ] }"><figcaption>${ f }: render, low tier</figcaption></figure>${ refs }<style>figure{margin:0}img{width:100%;height:400px;object-fit:contain;background:#555}</style>` );
	await page.waitForLoadState( 'networkidle' );
	await page.waitForTimeout( 2500 );
	await page.screenshot( { path: `${ dir }/compare-${ f }.jpg`, type: 'jpeg', quality: 86 } );

}

await b.close();
