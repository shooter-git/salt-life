// Two real games (tools/two-players), far out (M15 step 18): apart; the same sea alongside at the bank; riding out there; a boat left adrift; her owner back.
//   pnpm dev, then   node tools/two-players/far.mjs [dir for screenshots] [port]   (some minutes: two games on the CPU)
// The stand-in's own save is kept in the browser here (host.js patched as it's fetched), so a player can really come back.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const { chromium } = await import( join( ROOT, '../all-the-spaces/node_modules/playwright/index.mjs' ) );
const [ out = 'qa-output', PORT = '5189' ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );
const ctx = await browser.newContext( { viewport: { width: 640, height: 360 } } );
await ctx.route( '**/tools/two-players/host.js*', async ( route ) => {

	const res = await route.fetch(); let body = await res.text();
	const a = "const saved = new Map(); // this player's saves: 'personal/key' -> { value, schemaVersion, version }";
	if ( ! body.includes( a ) ) throw new Error( 'host changed' );
	body = body.replace( a, "const saved = new Map( JSON.parse( localStorage.getItem( 'tp-' + me.id ) || '[]' ) ); saved.set = function ( k, v ) { Map.prototype.set.call( this, k, v ); localStorage.setItem( 'tp-' + me.id, JSON.stringify( [ ...this ] ) ); return this; };" );
	await route.fulfill( { response: res, body } );

} );
let problems = 0;
const say = ( ok, what ) => { console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what ); if ( ! ok ) problems ++; };
const open = async ( name ) => {

	const page = await ctx.newPage();
	// (the dev server's hundreds of modules, with the other game holding the CPU: one can fail to come. Tried again)
	let unfetched = false;
	page.on( 'pageerror', ( e ) => {

		if ( /Failed to fetch dynamically imported module/.test( e.message ) ) { unfetched = true; return; }
		problems ++;
		console.log( name, 'PAGEERROR', e.message.slice( 0, 300 ), ( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( ' | ' ).slice( 0, 300 ) );

	} );
	page.on( 'console', ( m ) => { if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource|dynamically imported/.test( m.text() ) ) { problems ++; console.log( name, 'CONSOLE', m.text().slice( 0, 300 ) ); } } );
	await page.goto( `http://127.0.0.1:${ PORT }/tools/two-players/?name=${ name }&id=${ name.toLowerCase() }-1&tier=low` );
	const f = () => page.frames().find( ( x ) => x !== page.mainFrame() );
	for ( let i = 0; i < 500; i ++ ) {

		if ( unfetched ) {

			unfetched = false;
			console.log( `     ${ name }'s page didn't load: again` );
			await page.reload();

		}

		if ( await f().evaluate( () => !! ( window.__app && window.__app._started ) ).catch( () => false ) ) break;
		await page.waitForTimeout( 1000 );

	}

	await f().evaluate( () => { const g = window.__app.game; if ( g.guide ) { g.guide.seen.intro = true; if ( g.guide.open ) g.guide.close(); g.guide._wait = - 1; } } );
	return { page, game: f() };

};
const frames = ( g, n = 4 ) => g.evaluate( () => window.__app.renderer.info.render.frame ).then( ( t ) => g.waitForFunction( ( [ t, n ] ) => window.__app.renderer.info.render.frame > t + n, [ t, n ], { timeout: 200000, polling: 300 } ) );

let robin = await open( 'Robin' );
// ---- Robin out at the bank at her helm before Sam comes, so he's never been near her
const FAR = { x: - 6200, z: 7400 }; // the bank
await robin.game.evaluate( ( F ) => {

	const app = window.__app, b = app.boatCtl;
	app.game.state.money = 500;
	app.player.boardBoat();
	app.player.takeHelm();
	b.moored = false;
	b.position.set( F.x, b.position.y, F.z );

}, FAR );
const sam = await open( 'Sam' );
await sam.game.waitForFunction( () => window.__app.together.others.size > 0 && [ ...window.__app.together.others.values() ][ 0 ].cur, null, { timeout: 200000, polling: 1000 } );
await robin.game.waitForFunction( () => window.__app.together.others.size > 0 && [ ...window.__app.together.others.values() ][ 0 ].cur, null, { timeout: 200000, polling: 1000 } );
console.log( 'both in' );
await sam.game.waitForFunction( ( F ) => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.cur && o.cur.boat && Math.hypot( o.cur.boat.pos.x - F.x, o.cur.boat.pos.z - F.z ) < 200; }, FAR, { timeout: 200000, polling: 500 } );
await frames( sam.game, 3 );
const apart = await sam.game.evaluate( () => {

	const t = window.__app.together, o = [ ...t.others.values() ][ 0 ];
	return { inSight: t._inSight(), boatDrawn: !! ( o.boat && o.boat.visible ), personShown: !! o.shown, wearing: o.wearing, look: o.look, radar: t.boatsAbout().length, map: !! o.mapped, at: o.cur.boat.pos.toArray().map( ( v ) => +v.toFixed( 2 ) ) };

} );
say( apart.inSight === false, `Sam can't be seen from 9 km: poses thin out (${ JSON.stringify( apart.at ) })` );
say( ! apart.boatDrawn && ! apart.personShown, 'her boat and her person not drawn' );
say( apart.wearing === null && !! apart.look, 'and her look not loaded' );
say( apart.radar === 1 && apart.map, 'but she\'s on the radar and the map' );

// ---- Sam comes alongside: the same sea?
await sam.game.evaluate( ( F ) => {

	const app = window.__app, b = app.boatCtl;
	app.player.boardBoat();
	app.player.takeHelm();
	b.moored = false;
	b.position.set( F.x + 40, b.position.y, F.z + 20 );

}, FAR );
await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.boat && o.boat.visible && o.shown; }, null, { timeout: 200000, polling: 500 } );
await robin.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.boat && o.boat.visible; }, null, { timeout: 200000, polling: 500 } );
await frames( sam.game, 4 ); await frames( robin.game, 4 );
const seaOf = ( g ) => g.evaluate( async () => {

	const app = window.__app, s = app.settings, b = app.boatCtl, x = b.position.x, z = b.position.z;
	const { findsAbout } = await import( '/src/game/Finds.js' );
	const { islandTime, weatherHere } = await import( '/src/game/Weather.js' );
	const T = islandTime( s.day, s.timeOfDay ), w = weatherHere( T, app.weatherPick(), s.weatherSince, - 6200, 7400 );
	const cut = 6, Tq = Math.round( T * 200 ) / 200; // (the same moment for both)
	const f = findsAbout( Tq, - 6200, 7400, 3000, { weed: [], debris: [], bait: [] }, ( x, z ) => - app.terrainData.heightAt( x, z ) );
	const nums = ( l ) => l.map( ( e ) => [ Math.round( e.x ), Math.round( e.z ) ] );
	const { G } = await import( '/src/core/Globals.js' );
	app.together.syncWaves();
	const waveClock = G.time.value - Date.now() / 1000;
	return { T, waveClock, wind: +w.wind.toFixed( 3 ), id: w.id, waveAt: +app.waves.heightAt( - 6200, 7400 ).toFixed( 3 ), Tq, weed: nums( f.weed ), debris: nums( f.debris ), bait: nums( f.bait ) };

} );
const [ sa, ro ] = await Promise.all( [ seaOf( sam.game ), seaOf( robin.game ) ] );
console.log( '     Sam  ', JSON.stringify( sa ).slice( 0, 330 ) );
console.log( '     Robin', JSON.stringify( ro ).slice( 0, 330 ) );
say( Math.abs( sa.T - ro.T ) < 0.05, `one clock: ${ sa.T.toFixed( 3 ) } and ${ ro.T.toFixed( 3 ) }` );
say( Math.abs( sa.waveClock - ro.waveClock ) < 0.2, `one sea: the waves' clocks ${ Math.abs( sa.waveClock - ro.waveClock ).toFixed( 3 ) } s apart` );
say( sa.id === ro.id && sa.wind === ro.wind, `the same weather out there: ${ sa.id }, ${ sa.wind } m/s` );
const fa = await sam.game.evaluate( async ( Tq ) => { const { findsAbout } = await import( '/src/game/Finds.js' ); const app = window.__app; const f = findsAbout( Tq, - 6200, 7400, 3000, { weed: [], debris: [], bait: [] }, ( x, z ) => - app.terrainData.heightAt( x, z ) ); return JSON.stringify( f ); }, sa.T );
const fb = await robin.game.evaluate( async ( Tq ) => { const { findsAbout } = await import( '/src/game/Finds.js' ); const app = window.__app; const f = findsAbout( Tq, - 6200, 7400, 3000, { weed: [], debris: [], bait: [] }, ( x, z ) => - app.terrainData.heightAt( x, z ) ); return JSON.stringify( f ); }, sa.T );
say( fa === fb, `the same finds at the same moment (${ Object.entries( JSON.parse( fa ) ).map( ( [ k, l ] ) => l.length + ' ' + k ).join( ', ' ) }, ${ fa.length } bytes of them)` );

// ---- how true is her pose, 9.6 km out?
const truth = await robin.game.evaluate( () => { const b = window.__app.boatCtl; return { x: b.position.x, z: b.position.z, t: performance.now() }; } );
const seen = await sam.game.evaluate( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return { x: o.cur.boat.pos.x, z: o.cur.boat.pos.z }; } );
say( Math.hypot( truth.x - seen.x, truth.z - seen.z ) < 3, `her boat as Sam has it is ${ Math.hypot( truth.x - seen.x, truth.z - seen.z ).toFixed( 3 ) } m from where she is` );

// ---- Sam rides with her, out here
await sam.game.evaluate( () => {

	const app = window.__app, o = [ ...app.together.others.values() ][ 0 ], p = app.player;
	p.leaveHelm();
	p.exitBoat && 0;

} );
await frames( sam.game, 2 );
await sam.game.evaluate( () => {

	const app = window.__app, o = [ ...app.together.others.values() ][ 0 ], c = o.cur.boat;
	const bp = app.boat.boardPoint.clone().applyQuaternion( c.quat ).add( c.pos );
	app.player.exitBoat();
	app.player.position.set( bp.x, bp.y + 0.1, bp.z );

} );
await sam.game.waitForFunction( () => !! window.__app.player.rideOffer, null, { timeout: 200000, polling: 300 } );
await sam.game.evaluate( () => { const p = window.__app.player; p.ride( p.rideOffer.boat ); } );
await frames( sam.game, 6 );
const rode = await sam.game.evaluate( () => { const a = window.__app, p = a.player, c = a.camera.position, s = a.game.chartSpot; return { riding: !! p.riding, mode: p.mode, cam: [ Math.round( c.x ), Math.round( c.z ) ], spot: [ Math.round( s.x ), Math.round( s.z ) ], bank: a.game.state.chart.named( 'bank' ), found: a.game.state.found }; } );
say( rode.riding && Math.hypot( rode.cam[ 0 ] - FAR.x, rode.cam[ 1 ] - FAR.z ) < 100, `Sam rides with her out here: ${ JSON.stringify( rode ) }` );
await sam.page.screenshot( { path: `${ out }/far-sam-riding.png` } );

// ---- Sam off; Robin leaves her boat adrift, 20 km out, and goes
await sam.game.evaluate( () => { const p = window.__app.player; if ( p.riding ) p.unride ? p.unride() : p.exitBoat(); } );
const A = { x: 0, z: 20000 };
await robin.game.evaluate( ( F ) => { const b = window.__app.boatCtl; b.position.set( F.x, b.position.y, F.z ); b.speed = 0; }, A );
await frames( robin.game, 3 );
await robin.game.evaluate( async () => { const app = window.__app; app.saveClock(); if ( app.game.state.save ) app.game.state.save(); await app.together.mineBoat( true ); await app.store.flush(); } );
await robin.page.waitForTimeout( 1000 );
await robin.page.close();
await sam.game.waitForFunction( () => window.__app.together.others.size === 0 && window.__app.together.session.isHost && window.__app.together.boats[ 'robin-1' ], null, { timeout: 200000, polling: 500 } );
const rec = await sam.game.evaluate( () => window.__app.together.boats[ 'robin-1' ] );
say( rec.a === null && Number.isFinite( rec.T ) && rec.z === 20000, `her record: adrift ${ JSON.stringify( { x: rec.x, z: rec.z, T: rec.T } ) }` );
await sam.game.evaluate( ( A ) => { const app = window.__app, b = app.boatCtl, p = app.player; if ( p.mode !== 'boat' ) { p.boardBoat(); p.takeHelm(); } b.moored = false; b.position.set( A.x + 40, b.position.y, A.z + 40 ); }, A );
await frames( sam.game, 3 );
console.log( '     Sam', JSON.stringify( await sam.game.evaluate( () => { const a = window.__app, c = a.camera.position; return { mode: a.player.mode, cam: [ Math.round( c.x ), Math.round( c.z ) ], entry: !! a.together.away.get( 'robin-1' ) }; } ) ) );
await sam.game.waitForFunction( () => { const a = window.__app.together.away.get( 'robin-1' ); return a && a.boat && a.boat.visible; }, null, { timeout: 200000, polling: 500 } );
await frames( sam.game, 3 );
const d0 = await sam.game.evaluate( () => { const a = window.__app.together.away.get( 'robin-1' ); return { x: a.boat.position.x, z: a.boat.position.z, rode: a.rode.visible, offer: !! window.__app.player.rideOffer, T: window.__app.settings.day * 24 + window.__app.settings.timeOfDay }; } );
say( ! d0.rode, 'Sam draws her adrift: no rode' );
await sam.game.evaluate( () => { const a = window.__app, o = a.together.away.get( 'robin-1' ), bp = a.boat.boardPoint.clone().applyQuaternion( o.frame.quat ).add( o.frame.pos ); a.player.exitBoat(); a.player.position.set( bp.x, bp.y + 0.1, bp.z ); } );
await frames( sam.game, 4 );
say( await sam.game.evaluate( () => ! window.__app.player.rideOffer ), 'beside her, she\'s not offered (nobody boards a boat adrift)' );
// (some hours on: the clock moved for the room)
await sam.game.evaluate( () => { const a = window.__app, s = a.settings; a.together.setClock( s.timeOfDay + 3, s.day, s.timeSpeed ); } );
await frames( sam.game, 3 );
await sam.game.page().waitForTimeout( 3500 );
await frames( sam.game, 12 );
const d1 = await sam.game.evaluate( () => { const a = window.__app.together.away.get( 'robin-1' ); return { x: a.boat.position.x, z: a.boat.position.z, sx: a.story && a.story.x, sz: a.story && a.story.z, where: a.story && a.story.where }; } );
const moved = Math.hypot( d1.sx - 0, d1.sz - 20000 );
say( moved > 20, `three hours on she's drifted ${ moved.toFixed( 0 ) } m (${ d1.where }), her boat easing after it (${ Math.hypot( d1.x - d0.x, d1.z - d0.z ).toFixed( 1 ) } m so far)` );
await sam.page.screenshot( { path: `${ out }/far-sam-adrift.png` } );

// ---- a hurricane's warning, then Robin's back
await sam.game.evaluate( async () => {

	const app = window.__app;
	await app.together._saveBoats( ( cur ) => { cur[ 'robin-1' ].at -= 6 * 60e3; return cur; } );
	app.together.setWeather( 'hurricane', app.settings.weatherSince || 0 );

} );
await sam.game.waitForFunction( () => { const t = window.__app.together, r = t.boats[ 'robin-1' ]; if ( ! r || ! r.tow ) t._keepT = 9.9; return r && r.tow; }, null, { timeout: 240000, polling: 1000 } ).catch( () => console.log( 'no tow' ) );
const tow = await sam.game.evaluate( () => window.__app.together.boats[ 'robin-1' ]?.tow );
say( tow && tow.why === 'hurricane' && tow.where === 'cradle', `Marta's fetched her from out there: ${ tow && JSON.stringify( { fee: tow.fee, km: +( tow.metres / 1000 ).toFixed( 1 ) } ) }` );
await sam.page.evaluate( () => {

	const raw = JSON.parse( localStorage.getItem( 'tp-robin-1' ) || '[]' );
	for ( const e of raw ) if ( e[ 0 ] === 'personal/boat' ) { const t = typeof e[ 1 ].value === 'string', r = t ? JSON.parse( e[ 1 ].value ) : e[ 1 ].value; r.at -= 6 * 60e3; e[ 1 ].value = t ? JSON.stringify( r ) : r; }
	localStorage.setItem( 'tp-robin-1', JSON.stringify( raw ) );

} );
robin = await open( 'Robin' );
await robin.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
await robin.game.waitForFunction( () => !! window.__app.boatCtl.hauled, null, { timeout: 200000, polling: 1000 } ).catch( () => console.log( 'not on the cradle' ) );
await robin.game.waitForFunction( () => window.__app.game.hud.noteOpen, null, { timeout: 120000, polling: 500 } ).catch( () => console.log( 'no note' ) );
const back = await robin.game.evaluate( () => { const a = window.__app; return { money: a.game.state.money, hauled: !! a.boatCtl.hauled, note: a.game.hud.noteOpen ? a.game.hud.note.textContent.replace( /\s+/g, ' ' ).slice( 0, 300 ) : null, rec: a.together.boats[ 'robin-1' ] || null }; } );
console.log( '     Robin back', JSON.stringify( back ) );
say( tow && back.money === Math.max( 0, 500 - tow.fee ), `she paid what she had of $${ tow && tow.fee }: $${ back.money } left` );
say( back.hauled && ! back.rec && !! back.note, 'her boat on the cradle, her record gone, the note there' );
console.log( problems ? `${ problems } PROBLEM(S)` : 'no problems' );
await browser.close();
