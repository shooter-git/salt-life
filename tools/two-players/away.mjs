// Two real games (tools/two-players), by the bay: Robin anchors and goes; Sam sees her boat, boards it; a hurricane's warning tows her in; Robin comes back.
//   pnpm dev, then   node tools/two-players/away.mjs [dir for screenshots] [port]   (some minutes: two games on the CPU)
// The stand-in's own save is kept in the browser here (host.js patched as it's fetched), so a player can really come back.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const { chromium } = await import( join( ROOT, '../all-the-spaces/node_modules/playwright/index.mjs' ) );
const [ out = 'qa-output', PORT = '5189' ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );
const ctx = await browser.newContext( { viewport: { width: 560, height: 315 } } );
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

	await f().evaluate( () => { const g = window.__app.game; if ( g.guide && g.guide.open ) g.guide.close(); } );
	return { page, game: f() };

};
const frames = ( g, n = 4 ) => g.evaluate( () => window.__app.renderer.info.render.frame ).then( ( t ) => g.waitForFunction( ( [ t, n ] ) => window.__app.renderer.info.render.frame > t + n, [ t, n ], { timeout: 180000, polling: 300 } ) );

let robin = await open( 'Robin' );
console.log( 'Robin in' );
const sam = await open( 'Sam' );
console.log( 'Sam in' );
await sam.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
await robin.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
say( true, 'both in one room, each seeing the other' );
say( await sam.game.evaluate( () => ! window.__app.together.session.isHost ) && await robin.game.evaluate( () => window.__app.together.session.isHost ), 'Robin hosts, having come first' );

// ---- Robin anchors off the bay and goes
const anchored = await robin.game.evaluate( async () => {

	const app = window.__app, g = app.game, b = app.boatCtl;
	g.state.money = 500;
	g.state.upgrades.anchor = 1;
	app.player.boardBoat();
	app.player.takeHelm();
	b.moored = false;
	// (the first spot out from the dock with some water under her)
	let spot = null;
	for ( let z = 80; z < 600 && ! spot; z += 10 ) { const d = - app.terrainData.heightAt( 64, z ); if ( d > 7 && d < 30 ) spot = z; }
	b.position.set( 64, b.position.y, spot );
	b.speed = 0;
	return { spot };

} );
await frames( robin.game, 3 );
await robin.game.evaluate( () => window.__app.player.leaveHelm() );
await robin.game.waitForFunction( () => !! window.__app.boatCtl.anchor, null, { timeout: 120000, polling: 300 } ).catch( () => console.log( 'no anchor' ) );
Object.assign( anchored, await robin.game.evaluate( () => { const b = window.__app.boatCtl; return { anchor: !! b.anchor, depth: b.anchor && +( 0 - b.anchor.y ).toFixed( 1 ), mode: window.__app.player.mode }; } ) );
say( anchored.anchor, `Robin left the helm off the bay (mode ${ anchored.mode }), her anchor down in ${ anchored.depth } m` );
await robin.game.waitForFunction( () => window.__app.together._boatSaved === true || window.__app.together.boats[ window.__app.together.me.id ], null, { timeout: 120000, polling: 500 } ).catch( () => console.log( 'no record seen on Robin' ) );
await robin.game.evaluate( async () => { const app = window.__app; await app.together.mineBoat( true ); if ( app.game.save ) app.game.save(); app.saveClock(); } );
await robin.page.waitForTimeout( 1200 );
await robin.page.close();
console.log( 'Robin gone' );
await sam.game.waitForFunction( () => window.__app.together.others.size === 0 && window.__app.together.session.isHost, null, { timeout: 200000, polling: 500 } );
say( true, 'Sam hosts once Robin has left' );
await sam.game.evaluate( () => window.__app.together.readBoats ? window.__app.together.readBoats() : null ).catch( () => {} );
await sam.game.waitForFunction( () => window.__app.together.boats[ 'robin-1' ], null, { timeout: 120000, polling: 500 } );
const rec = await sam.game.evaluate( () => window.__app.together.boats[ 'robin-1' ] );
say( rec && rec.a && Number.isFinite( rec.x ), `her record in the group's save, her anchor in it: ${ JSON.stringify( { x: +rec.x.toFixed( 1 ), z: +rec.z.toFixed( 1 ), a: rec.a.map( ( v ) => +v.toFixed( 1 ) ) } ) }` );

// ---- Sam goes to her, sees her, boards her
await sam.game.evaluate( ( r ) => {

	const app = window.__app;
	app.player.position.set( r.x + 3, app.player.position.y, r.z + 3 );

}, rec );
await sam.game.waitForFunction( () => { const a = window.__app.together.away.get( 'robin-1' ); return a && a.boat && a.boat.visible; }, null, { timeout: 120000, polling: 500 } );
const drawn = await sam.game.evaluate( () => {

	const a = window.__app.together.away.get( 'robin-1' );
	return { at: [ +a.boat.position.x.toFixed( 1 ), +a.boat.position.z.toFixed( 1 ) ], rode: a.rode.visible };

} );
say( drawn.rode && Math.hypot( drawn.at[ 0 ] - rec.x, drawn.at[ 1 ] - rec.z ) < 30, `Sam draws her at ${ drawn.at }, her rode out` );
const offered = await sam.game.evaluate( () => {

	const app = window.__app, a = app.together.away.get( 'robin-1' );
	const bp = app.boat.boardPoint.clone().applyQuaternion( a.boat.quaternion ).add( a.boat.position );
	app.player.position.set( bp.x, bp.y + 0.1, bp.z );

} );
await sam.game.waitForFunction( () => !! window.__app.player.rideOffer, null, { timeout: 120000, polling: 300 } );
const offer = await sam.game.evaluate( () => {

	const p = window.__app.player, n = p.rideOffer.name;
	p.ride( p.rideOffer.boat );
	return n;

} );
await frames( sam.game, 6 );
const aboard = await sam.game.evaluate( () => {

	const app = window.__app, p = app.player, g = app.game;
	return { name: null, mode: p.mode, riding: !! p.riding, canFish: g.canFish, helmOffered: /helm/i.test( ( p.prompt && p.prompt.text ) || '' ), prompt: p.prompt && p.prompt.text, atBoat: [ +p.boat.position?.x?.toFixed?.( 1 ), +p.boat.position?.z?.toFixed?.( 1 ) ], chartSpot: null };

} );
say( aboard.riding && aboard.mode === 'deck', `boarded "${ offer }'s boat": riding, on deck` );
say( aboard.canFish, 'Sam can fish off her' );
say( ! aboard.helmOffered, `her helm not offered (prompt: ${ aboard.prompt })` );
const moves = await sam.game.evaluate( () => {

	const app = window.__app, g = app.game;
	const own = app.boatCtl, b = [ own.position.x, own.position.z ];
	return { ownAt: b, ownMoored: own.moored, hasRadio: !! g.radio, helmGate: g.atHelm ?? null };

} );
console.log( '     Sam\'s own boat', JSON.stringify( moves ) );
// (the chart, ridden: what it's filled in about)
const chartRide = await sam.game.evaluate( async () => {

	const app = window.__app, c = app.game.state.chart, p = app.player;
	const here = app.camera.position, b = app.boatCtl.position;
	return { cam: [ +here.x.toFixed( 0 ), +here.z.toFixed( 0 ) ], own: [ +b.x.toFixed( 0 ), +b.z.toFixed( 0 ) ] };

} );
console.log( '     chart spot would be', JSON.stringify( chartRide ) );
const spot = await sam.game.evaluate( () => { const g = window.__app.game, c = window.__app.camera.position, q = g.chartSpot; return { same: q.x === c.x && q.z === c.z }; } );
say( spot.same, 'a rider\'s chart goes by where they are, not their own boat at the dock' );

// ---- a hurricane's warning: Marta tows her in
const warnedAt = await sam.game.evaluate( async () => {

	const app = window.__app, s = app.settings;
	// (gone six minutes: under five she's not really away, BACK_MS)
	await app.together._saveBoats( ( cur ) => { cur[ 'robin-1' ].at -= 6 * 60e3; return cur; } );
	app.together.setWeather( 'hurricane', s.weatherSince || 0 );
	app.together._keepT = 9.9;
	return { day: s.day, hour: s.timeOfDay, money: app.game.state.money };

} );
await sam.game.waitForFunction( () => { const r = window.__app.together.boats[ 'robin-1' ]; if ( ! r || ! r.tow ) window.__app.together._keepT = 9.9; return r && r.tow; }, null, { timeout: 240000, polling: 1000 } ).catch( async () => {

	console.log( 'no tow yet', JSON.stringify( await sam.game.evaluate( () => { const a = window.__app; return { news: a.weather.news, pick: a.weatherPick(), since: a.settings.weatherSince }; } ) ) );

} );
const tow = await sam.game.evaluate( () => window.__app.together.boats[ 'robin-1' ] && window.__app.together.boats[ 'robin-1' ].tow );
say( tow && tow.why === 'hurricane' && tow.where === 'cradle', `a hurricane's warning: towed in, ${ tow && JSON.stringify( { fee: tow.fee, metres: Math.round( tow.metres ), where: tow.where } ) }` );
await frames( sam.game, 8 ).catch( () => {} );
const over = await sam.game.evaluate( () => { const p = window.__app.player; return { riding: !! p.riding, mode: p.mode, shown: window.__app.together.away.get( 'robin-1' )?.boat?.visible }; } );
say( ! over.riding, `Sam's over the side: ${ JSON.stringify( over ) }` );

// ---- Robin's really back: her own save, the tow paid, the note
// (and in her own save: gone six minutes there too, or it's only a reload, BACK_MS)
console.log( '     her save', await sam.page.evaluate( () => {

	const raw = JSON.parse( localStorage.getItem( 'tp-robin-1' ) || '[]' ); let hits = 0;
	for ( const e of raw ) if ( e[ 0 ] === 'personal/boat' ) {

		const asText = typeof e[ 1 ].value === 'string', r = asText ? JSON.parse( e[ 1 ].value ) : e[ 1 ].value;
		r.at -= 6 * 60e3;
		e[ 1 ].value = asText ? JSON.stringify( r ) : r;
		hits ++;

	}

	localStorage.setItem( 'tp-robin-1', JSON.stringify( raw ) );
	return { keys: raw.map( ( e ) => e[ 0 ] ), hits };

} ) .then( ( r ) => JSON.stringify( r ) ) );
robin = await open( 'Robin' );
await robin.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
await robin.page.waitForTimeout( 500 );
await robin.game.waitForFunction( () => !! window.__app.boatCtl.hauled, null, { timeout: 200000, polling: 1000 } ).catch( () => console.log( 'not on the cradle yet' ) );
await robin.game.waitForFunction( () => window.__app.game.hud.noteOpen, null, { timeout: 120000, polling: 500 } ).catch( () => console.log( 'no note open' ) );
console.log( '     over it', JSON.stringify( await robin.game.evaluate( () => { const g = window.__app.game; return { guideOpen: !! ( g.guide && g.guide.open ), noteClass: g.hud.note.className, noteZ: getComputedStyle( g.hud.note ).zIndex, noteDisplay: getComputedStyle( g.hud.note ).display }; } ) ) );
const back = await robin.game.evaluate( () => {

	const app = window.__app, b = app.boatCtl, n = app.game.hud.noteOpen ? app.game.hud.note : null;
	return { money: app.game.state.money, hauled: b.hauled, anchor: !! b.anchor, at: [ +b.position.x.toFixed( 0 ), +b.position.z.toFixed( 0 ) ], note: n && n.textContent.slice( 0, 400 ), record: app.together.boats[ 'robin-1' ] || null };

} );
console.log( '     Robin back', JSON.stringify( back ) );
say( back.money === 500 - tow.fee, `she paid: $500 - $${ tow.fee } = $${ back.money }` );
say( back.hauled && ! back.anchor, 'her boat on the cradle, no anchor out' );
say( !! back.note, `Marta's note: "${ back.note }"` );
await frames( robin.game, 6 ).catch( () => {} );
const gone = await sam.game.evaluate( () => { const a = window.__app.together; return { rec: a.boats[ 'robin-1' ] || null, drawn: a.away.get( 'robin-1' )?.boat?.visible || false, others: a.others.size }; } );
say( ! gone.rec && ! gone.drawn, `her record gone, on Sam's sea too: ${ JSON.stringify( gone ) }` );
await robin.page.screenshot( { path: `${ out }/two-robin-back.png` } );
console.log( problems ? `${ problems } PROBLEM(S)` : 'no problems' );
await browser.close();
