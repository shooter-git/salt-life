// (M16) A guest aboard the owner's real boat, two real games: every area she has, under way (up to speed, a hard turn, stopped),
// walking and climbing as she goes, stepping ashore, and what's fitted and her paint. Keys are real where a game takes them.
//   tools/render-slot.sh node tools/two-players/aboard.mjs [dir] [port] [boat] [owner's fps] [guest's fps] [the guest's own boat]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const SPACES = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( SPACES, 'node_modules/playwright/index.mjs' ) );
const [ out = 'qa-output', PORT = '5205', BOAT = 'sportfisher', OWNER_FPS = '20', GUEST_FPS = '20', OWN = BOAT === 'lobster' ? 'console' : 'lobster' ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc' ] } );
const ctx = await browser.newContext( { viewport: { width: 960, height: 540 } } );
await ctx.addInitScript( () => {

	const R = window.__draws = { calls: 0, tris: 0, ticks: 0, peak: { calls: 0, tris: 0 } }, P = WebGL2RenderingContext.prototype;
	const tri = ( m, c, n = 1 ) => ( m === 4 ? Math.floor( c / 3 ) : m === 5 || m === 6 ? Math.max( 0, c - 2 ) : 0 ) * n;
	const wrap = ( k, count ) => { const f = P[ k ]; P[ k ] = function ( ...a ) { const [ c, n ] = count( a ); R.calls ++; R.tris += tri( a[ 0 ], c, n ); return f.apply( this, a ); }; };
	wrap( 'drawArrays', ( a ) => [ a[ 2 ] ] );
	wrap( 'drawElements', ( a ) => [ a[ 1 ] ] );
	wrap( 'drawArraysInstanced', ( a ) => [ a[ 2 ], a[ 3 ] ] );
	wrap( 'drawElementsInstanced', ( a ) => [ a[ 1 ], a[ 4 ] ] );
	wrap( 'drawRangeElements', ( a ) => [ a[ 3 ] ] );
	const tick = () => { R.ticks ++; if ( R.calls ) { R.peak.calls = Math.max( R.peak.calls, R.calls ); R.peak.tris = Math.max( R.peak.tris, R.tris ); R.calls = R.tris = 0; } requestAnimationFrame( tick ); };
	requestAnimationFrame( tick );

} );
let problems = 0, failed = 0;
const say = ( ok, what ) => { if ( ! ok ) failed ++; console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what ); };
const open = async ( name, boat, fps ) => {

	const page = await ctx.newPage();
	// (a device's frame rate: everything rAF asks for waits for the next slot)
	await page.addInitScript( ( fps ) => {

		const raf = window.requestAnimationFrame.bind( window ), gap = 1000 / fps;
		window.requestAnimationFrame = ( f ) => {

			const due = ( Math.floor( performance.now() / gap ) + 1 ) * gap;
			return raf( function step( t ) {

				if ( t < due ) raf( step );
				else f( t );

			} );

		};

	}, fps );
	let unfetched = false;
	page.on( 'pageerror', ( e ) => {

		if ( /Failed to fetch dynamically imported module/.test( e.message ) ) { unfetched = true; return; }
		if ( ++ problems < 4 ) console.log( name, 'PAGEERROR', e.message.slice( 0, 300 ), ( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( ' | ' ).slice( 0, 300 ) );

	} );
	page.on( 'console', ( m ) => { if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource|dynamically imported/.test( m.text() ) ) { problems ++; console.log( name, 'CONSOLE', m.text().slice( 0, 300 ) ); } } );
	await page.goto( `http://127.0.0.1:${ PORT }/tools/two-players/?name=${ name }&id=${ name.toLowerCase() }-1&tier=low&src=${ encodeURIComponent( `/?boat=${ boat }` ) }` );
	const f = () => page.frames().find( ( x ) => x !== page.mainFrame() );
	for ( let i = 0; i < 900; i ++ ) {

		if ( unfetched ) { unfetched = false; await page.reload(); }
		if ( await f().evaluate( () => !! ( window.__app && window.__app._started ) ).catch( () => false ) ) break;
		await page.waitForTimeout( 1000 );

	}

	const game = f();
	await game.evaluate( () => {

		const a = window.__app, g = a.game;
		if ( g.guide ) { g.guide.seen.intro = true; if ( g.guide.open ) g.guide.close(); g.guide._wait = - 1; }
		a.together.stale = 120; // (two games on the CPU)
		// (the game's own frames: its loop can run behind the page's)
		const R = window.__draws, pl = a.player, up = pl.update;
		R.frames = 0;
		R.after = [];
		R.since = performance.now();
		pl.update = function ( dt ) {

			up.call( this, dt );
			R.frames ++;
			for ( const f of R.after ) f();

		};
		a.drawWorld = () => {}; // (what's counted in frames gets on; drawn only for a shot)
		// (and nothing waits on the CPU's drawing of what's left, so each game runs at its device's rate: App.pacedFrame's fence)
		const gl = a.renderer.getContext();
		gl.clientWaitSync = () => gl.ALREADY_SIGNALED;
		Object.defineProperty( a, '_rest', { configurable: true, get: () => false, set() {} } );
		a.together.setWeather( 'calm', 0 );
		a.together.setClock( 10, a.settings.day, 0.0001 );

	} );
	// (keys go to the game's frame)
	await page.evaluate( () => document.querySelector( 'iframe' ).contentWindow.focus() );
	return { page, game, name };

};
const other = 'window.__app.together.others.values().next().value';
const until = ( g, what, timeout = 300000 ) => g.waitForFunction( `( () => { try { return ${ what }; } catch ( e ) { return false; } } )()`, null, { timeout, polling: 200 } );
const frames = ( g, n = 4 ) => g.evaluate( () => window.__draws.frames ).then( ( t ) => g.waitForFunction( ( [ t, n ] ) => window.__draws.frames > t + n, [ t, n ], { timeout: 300000, polling: 100 } ) );
const rate = ( g ) => g.evaluate( () => { const R = window.__draws; return +( R.frames / ( performance.now() - R.since ) * 1000 ).toFixed( 1 ); } );
// (a key held for a few of that game's frames)
const press = async ( who, key, n = 3 ) => { await who.page.keyboard.down( key ); await frames( who.game, n ); await who.page.keyboard.up( key ); await frames( who.game, 1 ); };
const shot = async ( who, name ) => {

	await who.game.evaluate( () => { const a = window.__app; delete a.drawWorld; delete a._rest; delete a.renderer.getContext().clientWaitSync; window.__draws.peak = { calls: 0, tris: 0 }; } );
	for ( let i = 0; i < 3; i ++ ) {

		await who.game.evaluate( () => { window.__draws.peak = { calls: 0, tris: 0 }; } );
		await who.game.waitForFunction( () => window.__draws.peak.calls > 2, null, { timeout: 400000, polling: 200 } );

	}

	await who.page.screenshot( { path: `${ out }/aboard-${ name }.png` } );
	const r = await who.game.evaluate( () => { window.gc(); return { draws: window.__draws.peak.calls, triangles: window.__draws.peak.tris, heapMB: +( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 1 ) }; } );
	await who.game.evaluate( () => { const a = window.__app, gl = a.renderer.getContext(); a.drawWorld = () => {}; gl.clientWaitSync = () => gl.ALREADY_SIGNALED; Object.defineProperty( a, '_rest', { configurable: true, get: () => false, set() {} } ); } );
	console.log( `     readings, ${ name } (${ who.name }):`, JSON.stringify( r ) );
	return r;

};

const t0 = Date.now();
const owner = await open( 'Robin', BOAT, + OWNER_FPS );
const guest = await open( 'Sam', OWN, + GUEST_FPS );
await until( guest.game, `${ other } && ${ other }.cur` );
await until( owner.game, `${ other } && ${ other }.cur` );
console.log( `${ BOAT }: Robin's at ${ OWNER_FPS } fps, Sam (his own boat the ${ OWN }) at ${ GUEST_FPS }. Both in after ${ Math.round( ( Date.now() - t0 ) / 1000 ) } s` );
const seated = await owner.game.evaluate( () => window.__app.boat.seated );
// (all that can be bought for her: every area she has. Later, some of it not, for what's fitted)
const OWNED = `async ( most ) => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const a = window.__app, g = a.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.on === a.boat.id ) u[ k ] = most ? t.levels.length - 1 : 0; g.applyGear(); }`;
await owner.game.evaluate( `( ${ OWNED } )( true )` );

// ---- her owner aboard, at her berth
await owner.game.evaluate( () => { const p = window.__app.player; if ( window.__app.boat.seated ) p.enterBoat(); else p.boardBoat(); } );
await until( guest.game, `${ other }.cur.mode === '${ seated ? 'helm' : 'deck' }' && ${ other }.cur.boat` );
await until( guest.game, `( () => { const o = ${ other }; return ( o.boat && o.boat.visible ) || ( o.stand && o.stand.visible ); } )()` );

// the guest beside her boarding point, offered her, and E
const beside = `( () => { const a = window.__app, o = ${ other }, c = o.cur, f = c.drawn || c.boat, M = a.together.copies.model( c.boatId ); if ( ! M ) return false; const bp = M.boardPoint.clone().applyQuaternion( f.quat ).add( f.pos ); a.player.position.set( bp.x, bp.y + 0.2, bp.z ); a.player.velocity.set( 0, 0, 0 ); return !! a.player.rideOffer; } )()`;
await until( guest.game, beside );
const offered = await guest.game.evaluate( () => { const p = window.__app.player; return { name: p.rideOffer.name, type: p.rideOffer.boat.model.id, prompt: p.prompt && p.prompt.text }; } );
console.log( '     offered:', JSON.stringify( offered ) );
await until( guest.game, `( ${ beside }, window.__app.player.mode !== 'walk' && window.__app.player.mode !== 'swim' || !! window.__app.player.rideOffer )` );
await guest.page.keyboard.down( 'KeyE' );
await until( guest.game, `( ${ beside.replace( 'return !! a.player.rideOffer;', '' ).replace( 'a.player.position.set( bp.x, bp.y + 0.2, bp.z );', 'if ( ! a.player.riding ) a.player.position.set( bp.x, bp.y + 0.2, bp.z );' ) }, window.__app.player.riding )`, 60000 ).catch( () => {} );
await guest.page.keyboard.up( 'KeyE' );
let realE = await guest.game.evaluate( () => window.__app.player.riding );
if ( ! realE ) await guest.game.evaluate( () => { const p = window.__app.player; p.ride( p.rideOffer.boat ); } );
say( await guest.game.evaluate( () => window.__app.player.riding && window.__app.player.mode === 'deck' ), `Sam's aboard${ realE ? ' (E)' : ' (the key didn\'t reach him: by hand)' }` );

// the areas, as this boat has them
const AREA = `( async () => { const { AREAS, UNDER_WAY } = await import( '/tools/two-players/areas.mjs' ); const a = window.__app, M = a.player.boat.model; return { list: AREAS[ '${ BOAT }' ]( M ), way: UNDER_WAY[ '${ BOAT }' ] }; } )()`;
const { list, way } = await guest.game.evaluate( AREA );

// the guest's state, and how he stands against her decks
const stateOf = `( () => { const a = window.__app, p = a.player, b = p.boat, d = p.deckPos, S = 0.36, floor = p.deckGroundAt( d.x, d.z, d.y + S ), sole = b.model.soleY( d.x, d.z, d.y + S ); return { mode: p.mode, riding: p.riding, x: +d.x.toFixed( 3 ), y: +d.y.toFixed( 3 ), z: +d.z.toFixed( 3 ), floor: +floor.toFixed( 3 ), sole: +sole.toFixed( 3 ), grounded: p.deckGrounded, cam: +a.camera.position.distanceTo( b.toWorld( d, new d.constructor() ) ).toFixed( 2 ), feet: +p.position.distanceTo( b.toWorld( d, new d.constructor() ) ).toFixed( 3 ) }; } )()`;
// the owner's view of him: where his figure stands, in her frame, against her own decks
const ownerSees = `( () => { const a = window.__app, o = ${ other }, c = o.cur, g = o.avatar.group, l = g.position.clone().sub( a.boatCtl.position ).applyQuaternion( a.boatCtl.quaternion.clone().invert() ), d = c.deck; return { mode: c.mode, ride: c.ride, shown: o.shown, x: +l.x.toFixed( 3 ), y: +l.y.toFixed( 3 ), z: +l.z.toFixed( 3 ), deck: d ? d.toArray().map( ( v ) => +v.toFixed( 3 ) ) : null, sole: d ? +a.player.deckGroundAt.call( { boat: { model: a.boat } }, d.x, d.z, d.y + 0.36 ).toFixed( 3 ) : null }; } )()`;
const put = ( A ) => guest.game.evaluate( ( A ) => { const p = window.__app.player; p.deckPos.set( A.x, A.y + 0.03, A.z ); p.deckVel.set( 0, 0, 0 ); p.deckGrounded = false; }, A );

const results = [];
for ( const A of list ) {

	await put( A );
	await frames( guest.game, 8 );
	const s = await guest.game.evaluate( stateOf );
	const moved = Math.hypot( s.x - A.x, s.z - A.z );
	await until( owner.game, `( () => { const d = ${ other }.cur.deck; return d && Math.hypot( d.x - ${ s.x }, d.z - ${ s.z } ) < 0.05 && ${ other }.shown; } )()`, 60000 ).catch( () => {} );
	await frames( owner.game, 2 );
	const o = await owner.game.evaluate( ownerSees );
	const seesAt = Math.hypot( o.x - s.x, o.z - s.z ), seesY = Math.abs( o.y - s.y );
	const okHere = s.mode === 'deck' && s.riding && Math.abs( s.y - s.floor ) < 0.03 && Math.abs( s.y - A.y ) < 0.3 && moved < 0.45 && s.feet < 0.01 && s.cam < 2.6;
	const okOwner = o.mode === 'deck' && o.shown && seesAt < 0.1 && seesY < 0.1 && o.sole !== null && Math.abs( o.sole - s.y ) < 0.05;
	say( okHere && okOwner, `${ A.name }: at ${ s.x }, ${ s.y }, ${ s.z } (asked ${ A.x }, ${ A.y }, ${ A.z }), floor ${ s.floor }, sole ${ s.sole }, ${ moved.toFixed( 2 ) } m from where put, camera ${ s.cam } m; Robin (shown ${ o.shown }) sees him ${ seesAt.toFixed( 3 ) } m off, y ${ o.y }, her sole there ${ o.sole }` );
	results.push( { area: A.name, ok: okHere && okOwner } );

}

// ---- out to open water; her owner at her helm by E (a kayak's owner's in her seat)
const SEA = { x: - 2600, z: 3000 };
if ( ! seated ) {

	await owner.game.evaluate( () => { const p = window.__app.player, M = p.boat.model; p.deckPos.set( M.helm.x + 0.05, M.helm.y ?? M.lines.deckY, M.helm.z - 0.45 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( owner.game, 2 );
	await press( owner, 'KeyE', 3 );
	if ( ! await owner.game.evaluate( () => window.__app.player.mode === 'boat' ) ) {

		console.log( '     (E at her helm didn\'t reach Robin: by hand)' );
		await owner.game.evaluate( () => window.__app.player.takeHelm() );

	}

}

await owner.game.evaluate( ( F ) => { const a = window.__app, b = a.boatCtl; b.moored = false; b.beached = false; b.anchor = null; a.boat.sliding = null; b.position.set( F.x, b.position.y, F.z ); b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 ); a.together.setClock( 10, a.settings.day, 0.0001 ); }, SEA );
await until( guest.game, `( () => { const b = window.__app.player.boat.position; return Math.hypot( b.x - ${ SEA.x }, b.z - ${ SEA.z } ) < 300 && window.__app.player.riding; } )()` );
say( await guest.game.evaluate( () => window.__app.player.riding ), 'with her moved out to open water, he\'s still aboard' );

// (and her owner at her helm, under throttle: every frame of theirs, whether they're still at it)
await owner.game.evaluate( () => { const a = window.__app, S = window.__helm = { n: 0, off: 0, first: null }; window.__draws.after.push( () => { S.n ++; if ( a.player.mode !== 'boat' ) { S.off ++; if ( ! S.first ) S.first = { mode: a.player.mode, speed: +a.boatCtl.speed.toFixed( 1 ), lever: +a.boatCtl.throttle.toFixed( 2 ) }; } } ); } );

// watches him, every frame of his, against where he was: whether he stayed aboard, on her deck, with the camera with her
await guest.game.evaluate( () => {

	window.__watch = ( walking ) => {

		const a = window.__app, p = a.player, V = p.deckPos.constructor, w = new V(), S = window.__seen = { n: 0, off: 0, gap: 0, cam: 0, drift: 0, sunk: 0, top: 0, path: 0, last: p.deckPos.clone(), walking, from: p.deckPos.clone(), run: true };
		const list = window.__draws.after;
		list.length = 0;
		const look = () => {

			if ( ! S.run ) return;
			const b = p.boat;
			S.n ++;
			if ( p.mode !== 'deck' || ! p.riding ) S.off ++;
			else {

				b.toWorld( p.deckPos, w );
				S.gap = Math.max( S.gap, w.distanceTo( p.position ) );
				S.cam = Math.max( S.cam, a.camera.position.distanceTo( w ) );
				if ( ! walking ) S.drift = Math.max( S.drift, Math.hypot( p.deckPos.x - S.from.x, p.deckPos.z - S.from.z ) );
				if ( ! p.climbing ) S.sunk = Math.max( S.sunk, p.deckGroundAt( p.deckPos.x, p.deckPos.z, p.deckPos.y + 0.36 ) - p.deckPos.y );

			}

			S.path += Math.hypot( p.deckPos.x - S.last.x, p.deckPos.z - S.last.z );
			S.last.copy( p.deckPos );
			S.top = Math.max( S.top, a.together.others.values().next().value.boatSpeed || 0 );

		};

		list.push( look );

	};

} );
const watched = () => guest.game.evaluate( () => { const S = window.__seen; S.run = false; return { frames: S.n, off: S.off, gap: +S.gap.toFixed( 3 ), cam: +S.cam.toFixed( 2 ), drift: +S.drift.toFixed( 3 ), sunk: +S.sunk.toFixed( 3 ), top: +S.top.toFixed( 1 ), path: +S.path.toFixed( 2 ) }; } );
const TOP = { kayak: 1, console: 9, lobster: 5, sportfisher: 7 }[ BOAT ];
const speed = ( ) => owner.game.evaluate( () => window.__app.boatCtl.speed );
const headingOf = () => owner.game.evaluate( () => window.__app.boatCtl.getYaw() );
// astern till she's slowing, and let her come to rest
const stop = async () => {

	// (a paddle just stops; held astern she'd go on astern)
	if ( ! seated ) await owner.page.keyboard.down( 'KeyS' );
	await until( owner.game, `Math.abs( window.__app.boatCtl.speed ) < ${ TOP * 0.2 }`, 150000 ).catch( () => console.log( '     (not stopped in time)' ) );
	if ( ! seated ) await owner.page.keyboard.up( 'KeyS' );
	return +Math.abs( await speed() ).toFixed( 1 );

};

// up to speed, a hard turn, stopped
const run = async () => {

	await owner.page.keyboard.down( 'KeyW' );
	await until( owner.game, `window.__app.boatCtl.speed > ${ TOP }`, 200000 ).catch( () => console.log( '     (not up to her speed in time)' ) );
	const fast = await speed(), h0 = await headingOf();
	await owner.page.keyboard.down( 'KeyA' );
	await until( owner.game, `Math.abs( Math.sin( ( window.__app.boatCtl.getYaw() - ${ h0 } ) / 2 ) ) > 0.5`, 90000 ).catch( () => console.log( '     (not through her turn in time)' ) );
	await owner.page.keyboard.up( 'KeyA' );
	const turned = Math.abs( Math.atan2( Math.sin( await headingOf() - h0 ), Math.cos( await headingOf() - h0 ) ) ) * 180 / Math.PI;
	await owner.page.keyboard.up( 'KeyW' );
	return { fast: +fast.toFixed( 1 ), turned: Math.round( turned ), rest: await stop() };

};
const placed = ( name ) => list.find( ( a ) => a.name === name );
const under = [];
for ( const name of way ) {

	await put( placed( name ) );
	await frames( guest.game, 6 );
	await guest.game.evaluate( () => window.__watch( false ) );
	const r = await run();
	const s = await watched();
	const st = await guest.game.evaluate( stateOf );
	await until( owner.game, `( () => { const d = ${ other }.cur.deck; return d && Math.hypot( d.x - ${ st.x }, d.z - ${ st.z } ) < 0.05; } )()`, 60000 ).catch( () => {} );
	const o = await owner.game.evaluate( ownerSees );
	const ok = s.frames > 0 && s.off === 0 && s.gap < 0.01 && s.cam < 2.6 && s.drift < 0.15 && s.sunk < 0.03 && o.mode === 'deck' && Math.hypot( o.x - st.x, o.z - st.z ) < 0.25 && Math.abs( o.y - st.y ) < 0.25;
	say( ok, `under way on the ${ name }: ${ r.fast } m/s, turned ${ r.turned } deg, down to ${ r.rest } m/s; his ${ s.frames } frames: ${ s.off } off her, feet ${ s.gap } m from her deck, ${ s.drift } m from where he stood, ${ s.sunk } m under her floor, camera within ${ s.cam } m. Robin sees him ${ Math.hypot( o.x - st.x, o.z - st.z ).toFixed( 3 ) } m off, y ${ o.y } against ${ st.y }` );
	under.push( { area: name, ok } );
	await frames( owner.game, 4 );

}

// ---- a kayak's paddle, on the copy of her: her stroke, and the figure sat at it
if ( seated ) {

	await owner.page.keyboard.down( 'KeyW' );
	await frames( owner.game, 12 );
	await until( guest.game, `${ other }.cur.kw && ${ other }.cur.kw[ 3 ] < 0.5`, 60000 ).catch( () => {} );
	const pose = `( () => { const o = ${ other }, b = o.boat, m = b.getObjectByName( 'boat-paddle' ), s = b.userData.model.seat.clone().applyQuaternion( b.quaternion ).add( b.position ); return { kw: o.cur.kw, paddle: m ? m.matrix.elements.slice( 0, 3 ).concat( m.matrix.elements.slice( 12, 15 ) ).map( ( v ) => +v.toFixed( 3 ) ) : null, seat: +o.avatar.group.position.distanceTo( s ).toFixed( 3 ), shown: o.shown }; } )()`;
	await frames( guest.game, 2 );
	const p0 = await guest.game.evaluate( pose );
	await frames( guest.game, 8 );
	await frames( owner.game, 8 );
	const p1 = await guest.game.evaluate( pose );
	await owner.page.keyboard.up( 'KeyW' );
	say( p0.kw && p1.paddle && p1.paddle.join() !== p0.paddle.join() && p1.seat < 0.25, `her stroke on his copy: the paddle moves, ${ JSON.stringify( p0.paddle ) } to ${ JSON.stringify( p1.paddle ) }; Robin's figure ${ p1.seat } m from her seat` );
	await stop();

}

// ---- walking as she goes, up to speed, and climbing, on a boat you do
if ( ! seated ) {

	await put( list[ 0 ] );
	await frames( guest.game, 4 );
	await owner.page.keyboard.down( 'KeyW' );
	await until( owner.game, `window.__app.boatCtl.speed > ${ TOP }`, 200000 ).catch( () => {} );
	await guest.game.evaluate( () => window.__watch( true ) );
	await press( guest, 'KeyW', 12 );
	await press( guest, 'KeyA', 8 );
	await press( guest, 'KeyS', 12 );
	await frames( guest.game, 10 ); // (he may have walked off a step: down, before he's read)
	const to = await guest.game.evaluate( stateOf );
	const walk = await watched();
	say( walk.off === 0 && walk.gap < 0.01 && walk.sunk < 0.03 && walk.path > 0.3 && Math.abs( to.y - to.floor ) < 0.03, `walking as she goes, ${ walk.top } m/s: walked ${ walk.path } m on her deck (keys), ${ walk.off } of ${ walk.frames } frames off her, ${ walk.sunk } m under her floor` );
	const ladders = await guest.game.evaluate( () => { const M = window.__app.player.boat.model; return ( M.ladders || [] ).map( ( l ) => ( { on: l.on, off: l.off, text: l.text, needs: l.needs || null } ) ); } );
	for ( const l of ladders ) {

		await guest.game.evaluate( ( l ) => { const p = window.__app.player; p.deckPos.set( l.on.x, l.on.y + 0.02, l.on.z ); p.deckVel.set( 0, 0, 0 ); }, l );
		await frames( guest.game, 3 );
		const near = await guest.game.evaluate( () => { const p = window.__app.player; return !! p.boat.model.ladderAt( p.deckPos ); } );
		await guest.game.evaluate( () => window.__watch( true ) );
		await press( guest, 'KeyE', 3 );
		const started = await guest.game.evaluate( () => !! window.__app.player.climbing );
		await guest.page.keyboard.down( 'KeyW' );
		await until( guest.game, '! window.__app.player.climbing', 120000 ).catch( () => {} );
		await guest.page.keyboard.up( 'KeyW' );
		await frames( guest.game, 4 );
		const at = await guest.game.evaluate( stateOf ), c = await watched(), falls = await guest.game.evaluate( () => window.__app.player.falls || 0 );
		say( near && started && c.off === 0 && Math.abs( at.y - l.off.y ) < 0.6 && Math.abs( at.y - at.floor ) < 0.03, `${ l.text }, under way: on it (E) ${ started }, at ${ at.y } (its head ${ l.off.y }), ${ c.off } of ${ c.frames } frames off her, ${ falls } falls` );

	}

	// the picture: on her bridge, under way
	if ( BOAT === 'sportfisher' ) {

		await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( - 0.9, 3.13, - 2.3 ); p.deckVel.set( 0, 0, 0 ); p.deckYaw = 0.5; p.pitch = - 0.1; } );
		await frames( guest.game, 4 );
		await shot( guest, 'bridge-guest' );
		await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 16; p.orbitYaw = a.boatCtl.getYaw() + 2.5; p.orbitPitch = 0.35; } );
		await frames( owner.game, 4 );
		await shot( owner, 'bridge-owner' );
		await owner.game.evaluate( () => { window.__app.player.camMode = 'first'; } );

	}

	await owner.page.keyboard.up( 'KeyW' );
	await stop();

}

// ---- what's out of her, on his game; and the rod that goes off, his to take, into her chair
if ( ! seated ) {

	const sp = await owner.game.evaluate( async () => {

		const { FISH_IDS } = await import( '/src/game/FishTable.js' ), { BAIT_IDS, BAITS } = await import( '/src/game/Bait.js' );
		const a = window.__app, r = a.game.rigs, spots = r.spots(), V = a.camera.position.constructor, bait = BAIT_IDS.find( ( k ) => BAITS[ k ].tow );
		const mk = ( spot, on ) => ( { spot, bait, len: 30, p: new V(), tip: new V(), clip: null, butt: new V(), on, in: false, torn: 0, bend: 0 } );
		r.lines.length = 0;
		for ( const s of spots ) { const L = mk( s, null ); r._place( L ); L.p.copy( L.tip ); r.lines.push( L ); }
		// (a fish on the first, and long enough on it for two slow games)
		const f = FISH_IDS.find( ( k ) => k === 'mahi' ) || FISH_IDS[ 0 ];
		r.lines[ 0 ].on = { species: f, kg: 6, t: - 600, place: null, at: { x: a.boatCtl.position.x, z: a.boatCtl.position.z } };
		r._trollT = 1e9;
		return { lines: r.lines.length, code: spots[ 0 ].name, species: f };

	} );
	await until( guest.game, `${ other }.cur.spread && ${ other }.cur.spread.length === ${ sp.lines }`, 90000 ).catch( () => {} );
	await frames( guest.game, 4 );
	const seenL = await guest.game.evaluate( `( () => { const o = ${ other }, D = window.__app.together.spread.draw; return { n: o.cur.spread ? o.cur.spread.length : null, on: o.cur.spread ? o.cur.spread.filter( ( x ) => x.on ).length : 0, copy: !! ( o.boat && o.boat.visible ), mesh: !! D, shown: !! ( D && D.mesh.visible ) }; } )()` );
	say( seenL.n === sp.lines && seenL.on === 1 && seenL.shown, `her spread on his game: ${ sp.lines } lines out: ${ JSON.stringify( seenL ) }` );
	const butt = await guest.game.evaluate( `( async () => { const { rodOf } = await import( '/src/together/Spread.js' ); const p = window.__app.player, V = p.deckPos.constructor, at = { butt: new V(), tip: new V(), clip: new V() }, L = ${ other }.cur.spread.find( ( x ) => x.on ); rodOf( p.boat.model, L, at ); const y = p.deckGroundAt( at.butt.x * 0.8, at.butt.z + 0.5, at.butt.y ); p.deckPos.set( at.butt.x * 0.8, y, at.butt.z + 0.5 ); p.deckVel.set( 0, 0, 0 ); return at.butt.toArray(); } )()` );
	await frames( guest.game, 3 );
	const asked = await guest.game.evaluate( () => { const r = window.__app.game.rigs; return r.alert ? r.alert.text : null; } );
	await press( guest, 'KeyR', 3 );
	await until( guest.game, '!! window.__app.game.fight', 60000 ).catch( () => {} );
	const fight = await guest.game.evaluate( () => { const a = window.__app, g = a.game, f = g.fight; return { fight: !! f, species: f && f.species, line: g.rod.lineOut, chairNear: g.rigs._seat() ? 1 : 0 }; } );
	const left = await owner.game.evaluate( () => window.__app.game.rigs.lines.filter( ( L ) => L.on ).length );
	say( fight.fight && left === 0, `the rod's his (R): told "${ asked }"; fighting ${ fight.species }, the owner's holder empty` );
	if ( BOAT === 'sportfisher' && fight.fight ) {

		await guest.game.evaluate( () => { const p = window.__app.player, s = p.boat.model.chair; p.deckPos.set( s.eye.x + 0.6, 0.5, s.eye.z + 0.6 ); p.deckVel.set( 0, 0, 0 ); } );
		await frames( guest.game, 3 );
		await press( guest, 'KeyE', 3 );
		await frames( guest.game, 3 );
		const c = await guest.game.evaluate( async () => { const { HOLD_KG } = await import( '/src/game/rigs/Rigs.js' ); const a = window.__app, g = a.game, f = g.fight, r = g.rigs; return { inChair: r.inChair, hold: f && f.holdKg, want: HOLD_KG.chair, terms: f ? r.fightTerms( f ).holdKg ?? null : null, y: +a.player.deckPos.y.toFixed( 2 ) }; } );
		say( c.inChair && c.hold === c.want, `and into her chair: it holds ${ c.hold } kg, as the owner's would (${ JSON.stringify( c ) })` );
		await until( owner.game, `${ other }.job === 'chair'`, 60000 ).catch( () => {} );
		say( await owner.game.evaluate( `${ other }.job === 'chair'` ), 'Robin sees him in it' );
		await guest.game.evaluate( () => { const g = window.__app.game; if ( g.rigs.inChair ) g.rigs._sit( false ); } );

	}

	await guest.game.evaluate( () => { const g = window.__app.game; g.cancelLine( true ); g.fight = null; } );
	const drop = await guest.game.evaluate( () => ( { drop: window.__app.game.rigs.available( 'drop' ), troll: window.__app.game.rigs.available( 'troll' ), kite: window.__app.game.rigs.available( 'kite' ) } ) );
	console.log( '     what\'s open to a rider:', JSON.stringify( drop ) );
	await owner.game.evaluate( () => { const r = window.__app.game.rigs; r.clearLines(); r._trollT = null; } );

	// her name on her transom, and a sportfisher's pool of light
	await owner.game.evaluate( () => { const a = window.__app, r = a.game.state.fleet[ a.boat.id ]; if ( r ) r.name = 'Salty Dog'; } );
	const named = await until( guest.game, `${ other }.boatName === 'Salty Dog'`, 90000 ).then( () => true, () => false );
	await frames( guest.game, 4 );
	const plate = await guest.game.evaluate( `( () => { const o = ${ other }, u = o.boat.userData; return { name: o.boatName, plate: !! u.plate, shown: !! ( u.plate && u.plate.visible ), transom: !! u.model.transom }; } )()` );
	say( named && ( plate.plate || ! plate.transom ), `her name: ${ JSON.stringify( plate ) }` );
	if ( BOAT === 'sportfisher' ) {

		await owner.game.evaluate( () => { const g = window.__app.game; Object.defineProperty( g, 'underOn', { configurable: true, get: () => 0.8 } ); } );
		await until( guest.game, `${ other }.cur.under > 0.5`, 60000 ).catch( () => {} );
		await frames( guest.game, 3 );
		const u = await guest.game.evaluate( `( () => { const m = ${ other }.boat.getObjectByName( 'boat-underGlow' ); return { glow: !! m, shown: !! m && m.visible, opacity: m ? m.material.opacity : 0 }; } )()` );
		say( u.shown && u.opacity > 0.5, `her pool of light on his copy: ${ JSON.stringify( u ) }` );
		await owner.game.evaluate( () => { delete window.__app.game.underOn; } );

	}

}

const helm = await owner.game.evaluate( () => window.__helm );
say( helm.n > 0 && helm.off === 0, `Robin stayed at her helm throughout: ${ helm.off } of ${ helm.n } of her frames off it${ helm.first ? ' ' + JSON.stringify( helm.first ) : '' }` );

// ---- what's fitted, and her paint: as hers is, on his game
const FITS = { console: { upgrades: { tTop: 0 }, key: 'tTop' }, sportfisher: { upgrades: { tower: 0 }, key: 'tower' } }[ BOAT ];
if ( FITS || BOAT === 'lobster' || BOAT === 'kayak' ) {

	await owner.game.evaluate( () => { const a = window.__app, s = a.game.state, r = s.fleet[ a.boat.id ]; if ( r ) r.paint = 'red'; } );
	await until( guest.game, `( ( ${ other }.cur.fit >> 4 ) === 8 )`, 60000 ).catch( () => {} );
	await frames( guest.game, 4 );
	const paint = await guest.game.evaluate( `( () => { const o = ${ other }, b = o.boat, M = b.userData.model, hull = M.materials.hull; let painted = 0, plain = 0; b.traverse( ( m ) => { if ( m.isMesh && m.userData.painted ) painted ++; else if ( m.isMesh && m.material === hull ) plain ++; } ); return { f: o.cur.fit, painted, plain }; } )()` );
	say( paint.painted > 0 && paint.plain === 0, `her paint on his copy: ${ JSON.stringify( paint ) }` );
	if ( FITS ) {

		await owner.game.evaluate( `( ${ OWNED } )( false )` );
		const was = await guest.game.evaluate( `${ other }.cur.fit` );
		await until( guest.game, `${ other }.cur.fit !== ${ was }`, 60000 ).catch( () => {} );
		await frames( guest.game, 4 );
		const f = await guest.game.evaluate( `( () => { const a = window.__app, p = a.player, M = p.boat.model, o = ${ other }, up = M.ladders ? M.ladders.filter( ( l ) => l.needs === 'tower' ) : []; if ( o.boat ) a.together.copies.near( o.boat, true ); const tower = o.boat.getObjectByName( 'boat-tower' ); return { fitted: M.fitted, ladder: up.length ? !! M.ladderAt( new p.deckPos.constructor( up[ 0 ].on.x, up[ 0 ].on.y, up[ 0 ].on.z ) ) : null, tower: tower ? tower.visible : null, stations: Object.keys( M.stations || {} ), own: a.boat.fitted || null }; } )()` );
		console.log( '     with what she\'s fitted changed:', JSON.stringify( f ) );
		if ( BOAT === 'sportfisher' ) say( f.fitted.tower === false && f.ladder === false && f.tower === false && ! f.stations.includes( 'tower' ), 'no tower on hers: none for him to see or climb' );
		else say( f.fitted.tTop === false, 'no T-top on hers: none on his' );

	}

}

// ---- home, and ashore
await owner.game.evaluate( () => { const a = window.__app, p = a.player, b = a.boatCtl; b.reset(); if ( ! a.boat.seated && p.mode === 'boat' ) { p.leaveHelm(); b.moored = true; } } );
await until( guest.game, `( () => { const b = window.__app.player.boat.position, c = window.__app.boatCtl.position; return Math.hypot( b.x - c.x, b.z - c.z ) < 120; } )()`, 120000 ).catch( () => {} );
await frames( guest.game, 6 );
const ashore = await guest.game.evaluate( () => new Promise( ( done ) => {

	const a = window.__app, p = a.player, pts = p.boat.model.exitPoints;
	let i = 0, tries = 0;
	const next = () => {

		if ( i >= pts.length ) return done( { rail: null } );
		const e = pts[ i ];
		p.deckPos.set( e.x * 0.82, Math.max( e.y - 0.8, 0 ), e.z );
		p.deckVel.set( 0, 0, 0 );
		p._ashoreT = 0;
		const wait = () => {

			if ( p._ashore ) {

				// (the rail with ground beside it: where the prompt is)
				const ep = p._ashore.ep;
				p.deckPos.set( ep.x * 0.82, Math.max( ep.y - 0.8, 0 ), ep.z );
				return setTimeout( () => done( { rail: i, x: ep.x, z: ep.z, prompt: p.prompt && p.prompt.text, out: p._ashore.out.toArray().map( ( v ) => +v.toFixed( 2 ) ), g: +p._ashore.g.toFixed( 2 ), boat: p.boat.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) } ), 2000 );

			}

			if ( ++ tries > 40 ) { tries = 0; i ++; return next(); }
			setTimeout( wait, 50 );

		};

		setTimeout( wait, 50 );

	};

	next();

} ) );
console.log( '     at her rail:', JSON.stringify( ashore ) );
if ( ashore.rail !== null ) await press( guest, 'KeyE', 3 );
if ( await guest.game.evaluate( () => window.__app.player.riding ) ) {

	console.log( '     (E at the rail didn\'t put him ashore: over the side, by hand)' );
	await guest.game.evaluate( () => { const p = window.__app.player; p.exitBoat( null, 1 ); } );

}

await frames( guest.game, 4 );
const off = await guest.game.evaluate( () => { const p = window.__app.player; return { mode: p.mode, riding: p.riding, y: +p.position.y.toFixed( 2 ), x: +p.position.x.toFixed( 2 ), z: +p.position.z.toFixed( 2 ), ground: +p.groundAt( p.position.x, p.position.z, p.position.y + 2 ).toFixed( 2 ), boat: p.boat === window.__app.boatCtl }; } );
say( ! off.riding && off.boat && ashore.rail !== null && off.mode === 'walk', `he steps ashore: ${ JSON.stringify( off ) }` );

console.log( `     frames a second, really: Robin ${ await rate( owner.game ) }, Sam ${ await rate( guest.game ) }` );
console.log( 'SUMMARY', JSON.stringify( { boat: BOAT, owner: OWNER_FPS, guest: GUEST_FPS, own: OWN, areas: results, under, failed, problems, minutes: +( ( Date.now() - t0 ) / 60000 ).toFixed( 1 ) } ) );
console.log( failed || problems ? `${ failed } failed, ${ problems } problem(s)` : 'all passed' );
await browser.close();
process.exit( failed || problems ? 1 : 0 );
