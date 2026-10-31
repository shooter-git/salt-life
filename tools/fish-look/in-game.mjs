// (M16) The new fish in the game itself, on the CPU: the catch card and the log's trophies, then a hurricane's wreckage
// offshore two days after it's passed, from the deck and under the water, with the mahi under it, and a far fish or two
// beside the boat. node tools/fish-look/in-game.mjs <out dir> [tier]   with the dev server on PORT (5206).
import { chromium } from '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs';

const [ OUT, TIER = 'high' ] = process.argv.slice( 2 ), PORT = process.env.PORT || 5206;
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await b.newPage( { viewport: { width: 960, height: 540 } } );
const T0 = Date.now(), log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
page.on( 'console', ( m ) => { if ( m.type() === 'error' || ( m.type() === 'warning' && /fish|Fish|shader|GLSL/.test( m.text() ) ) ) console.log( m.type(), m.text().slice( 0, 500 ) ); } );
page.on( 'pageerror', ( e ) => console.log( 'pageerror', e.message.slice( 0, 500 ) ) );
const wait = ( s ) => new Promise( ( r ) => setTimeout( r, s * 1000 ) );
const shot = async ( name ) => {

	await page.evaluate( () => { const g = window.__app.game.guide; if ( g && g.open ) g.close(); } );
	await page.screenshot( { path: `${ OUT }/${ TIER }-${ name }.jpg`, type: 'jpeg', quality: 86, timeout: 180000 } );
	log( name );

};
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=fair&hour=10&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 600000 } );
log( 'started' );
await page.evaluate( () => window.__app.game.time.hold( true ) );

// ---- the catch cards and the log
for ( const [ id, kg, place ] of [ [ 'blueMarlin', 240, 'blue' ], [ 'sailfish', 32, 'dropoff' ], [ 'whiteMarlin', 30, 'dropoff' ], [ 'swordfish', 110, 'blue' ], [ 'wahoo', 20, 'dropoff' ], [ 'yellowfin', 50, 'dropoff' ], [ 'redfish', 5, 'creek' ], [ 'trout', 1.8, 'bay' ] ] ) {

	await page.evaluate( ( [ id, kg, place ] ) => {

		const g = window.__app.game, s = g.state;
		s.stats.holdKg = 1000;
		s.addFish( id, kg, 10, { day: 4, place } );
		const info = s.lastCatch;
		if ( info.released ) {

			const t = s.trophies[ id ] || ( s.trophies[ id ] = { n: 0, kg: 0, cm: 0, day: null, place: null, tagged: false } );
			t.n ++; t.kg = info.kg; t.cm = info.cm; t.day = 4; t.place = place;
			info.bonus = 180;

		}

		g.hud.showCatch( info, 3600000 );

	}, [ id, kg, place ] );
	await wait( 14 );
	await shot( `card-${ id }` );
	await page.evaluate( () => window.__app.game.hud.hideCatch() );

}

await page.evaluate( () => { const h = window.__app.game.hud; h.toggleInventory( true ); h.showTab( 'log' ); } );
await wait( 3 );
await shot( 'log' );
await page.evaluate( () => window.__app.game.showTrophy( 'blueMarlin' ) );
await wait( 12 );
await shot( 'trophy-again' );
await page.evaluate( () => { const g = window.__app.game; g.hud.hideCatch(); g.trophyCard = null; } );

// ---- the wreckage: put the clock two days past a hurricane's end, the boat beside its nearest piece
const at = await page.evaluate( async () => {

	const a = window.__app, { lastHurricane, islandTime } = await import( '/src/game/Weather.js' );
	let h = null;
	for ( let T = 24 * 40; T < 24 * 4000 && ! h; T += 24 * 10 ) h = lastHurricane( T, 0 );
	const T1 = h.ends + 48, c = a.game.time.clock || ( a.together && a.together._clock );
	if ( a.together ) a.together._clock = { ...a.together._clock, at: Date.now(), hour: T1 % 24, day: Math.floor( T1 / 24 ), speed: 0 };
	a.settings.day = Math.floor( T1 / 24 );
	a.settings.timeOfDay = T1 % 24;
	a.player.boardBoat();
	return { T1, hour: T1 % 24, day: Math.floor( T1 / 24 ), clock: !! c };

} );
log( 'clock', JSON.stringify( at ) );
const move = ( x, z ) => page.evaluate( ( [ x, z ] ) => {

	const a = window.__app, B = a.boatCtl;
	if ( B.mooring ) B.mooring.anchor.set( x, 0, z );
	B.position.x = x; B.position.z = z;
	B.velocity.set( 0, 0, 0 ); B.angular.set( 0, 0, 0 );
	const p = a.player;
	if ( p.mode !== 'deck' && p.mode !== 'boat' ) p.boardBoat();

}, [ x, z ] );
await move( 9000, 4000 );
await wait( 20 );
let piece = null;
for ( let i = 0; i < 12 && ! piece; i ++ ) {

	piece = await page.evaluate( () => {

		const f = window.__app.finds, c = window.__app.camera.position, list = f ? f.debris.filter( ( q ) => q.storm ) : [];
		list.sort( ( a, b ) => Math.hypot( a.x - c.x, a.z - c.z ) - Math.hypot( b.x - c.x, b.z - c.z ) );
		return list[ 0 ] ? { x: list[ 0 ].x, z: list[ 0 ].z, kind: list[ 0 ].kind, n: f.debris.length, storm: list.length, life: list[ 0 ].life } : null;

	} );
	if ( ! piece ) await wait( 10 );

}

log( 'wreckage', JSON.stringify( piece ) );
if ( piece ) {

	await move( piece.x + 25, piece.z + 8 );
	await wait( 45 ); // (the finds again, the far groups sent there)
	const seen = await page.evaluate( () => {

		const a = window.__app, F = a.fish, c = a.boatCtl.position;
		return F.farGroups.map( ( g ) => `${ g.sp.name } ${ g.count } at ${ Math.hypot( g.home.x - c.x, g.home.z - c.z ).toFixed( 0 ) } m, ${ g.active ? 'active' : 'idle' }` );

	} );
	log( seen.join( '; ' ) );
	await page.evaluate( ( q ) => { const p = window.__app.player, c = window.__app.boatCtl.position; p.yaw = Math.atan2( - ( q.x - c.x ), - ( q.z - c.z ) ); p.pitch = - 0.28; }, piece );
	await wait( 8 );
	await shot( 'wreckage-deck' );
	// under the water, the world held still, looking back up at the piece and what's under it
	await page.evaluate( ( q ) => {

		const a = window.__app;
		a.player.position.set( q.x + 7, - 5, q.z + 9 );
		const f = a.frame;
		a._frameKept = f;
		a.frame = function () {

			this.camera.position.set( q.x + 7, - 5, q.z + 9 );
			this.camera.lookAt( q.x, - 1.5, q.z );
			this.camera.updateMatrixWorld();
			this.drawWorld();

		};

	}, piece );
	await wait( 8 );
	await shot( 'wreckage-under' );

}

await b.close();
