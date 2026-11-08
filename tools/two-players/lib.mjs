// (M16) What the two-game checks that came after aboard.mjs share (hard.mjs, jobs.mjs, seen.mjs): two real games on one machine, each at
// a device's frame rate, nothing drawn between the shots so what's counted in frames gets on; script memory read after a forced GC.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const SPACES = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( SPACES, 'node_modules/playwright/index.mjs' ) );

export const OTHER = 'window.__app.together.others.values().next().value';

export async function start( { out, port, tier = 'low', stale = 120, viewport = { width: 960, height: 540 }, drawing = false } ) {

	const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc' ] } );
	const ctx = await browser.newContext( { viewport } );
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
	const G = { browser, ctx, problems: 0, failed: 0, results: [], t0: Date.now() };
	G.say = ( ok, what ) => {

		if ( ! ok ) G.failed ++;
		G.results.push( { ok: !! ok, what } );
		console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
		return ok;

	};

	G.note = ( ...a ) => console.log( '    ', ...a );
	G.open = async ( name, boat, fps = 30, { group = null, src = null } = {} ) => {

		const page = await ctx.newPage();
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
			if ( ++ G.problems < 8 ) console.log( name, 'PAGEERROR', e.message.slice( 0, 300 ), ( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( ' | ' ).slice( 0, 300 ) );

		} );
		page.on( 'console', ( m ) => { if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource|dynamically imported/.test( m.text() ) ) { G.problems ++; console.log( name, 'CONSOLE', m.text().slice( 0, 300 ) ); } } );
		await page.goto( `http://127.0.0.1:${ port }/tools/two-players/?name=${ name }&id=${ name.toLowerCase() }-1&tier=${ tier }${ group ? `&group=${ group }` : '' }&src=${ encodeURIComponent( src || `/?boat=${ boat }` ) }` );
		const f = () => page.frames().find( ( x ) => x !== page.mainFrame() );
		for ( let i = 0; i < 900; i ++ ) {

			if ( unfetched ) { unfetched = false; await page.reload(); }
			if ( await f().evaluate( () => !! ( window.__app && window.__app._started ) ).catch( () => false ) ) break;
			await page.waitForTimeout( 1000 );

		}

		const game = f();
		await game.evaluate( ( [ stale, drawing ] ) => {

			const a = window.__app, g = a.game;
			if ( g.guide ) { g.guide.seen.intro = true; if ( g.guide.open ) g.guide.close(); g.guide._wait = - 1; }
			if ( stale ) a.together.stale = stale;
			const R = window.__draws, pl = a.player, up = pl.update;
			R.frames = 0;
			R.after = [];
			R.since = performance.now();
			pl.update = function ( dt ) {

				up.call( this, dt );
				R.frames ++;
				for ( const f of R.after ) f( dt );

			};
			// (and at the end of a frame's game: where her copy's been put is only known by then)
			R.end = [];
			const tu = a.together.update;
			a.together.update = function ( dt ) { const r = tu.call( this, dt ); for ( const f of R.end ) f( dt ); return r; };
			// ((M17) nothing drawn, but a mesh waiting for its program's first draw is let go as a frame would (App.firstDraws): the late stages
			// wait on them, and with drawing stopped the debris, the fish camp and Marta's tray never came)
			window.__stop = () => { a.drawWorld = () => { const f = a._firsts && a._firsts.shift(); if ( f ) f.resolve(); }; const gl = a.renderer.getContext(); gl.clientWaitSync = () => gl.ALREADY_SIGNALED; Object.defineProperty( a, '_rest', { configurable: true, get: () => false, set() {} } ); };
			window.__go = () => { delete a.drawWorld; delete a._rest; delete a.renderer.getContext().clientWaitSync; };
			if ( ! drawing ) window.__stop();
			a.together.setWeather( 'calm', 0 );
			a.together.setClock( 10, a.settings.day, 0.0001 );

		}, [ stale, drawing ] );
		await page.evaluate( () => document.querySelector( 'iframe' ).contentWindow.focus() );
		return { page, game, name };

	};

	G.until = ( g, what, timeout = 300000 ) => g.waitForFunction( `( () => { try { return ${ what }; } catch ( e ) { return false; } } )()`, null, { timeout, polling: 200 } );
	G.frames = ( g, n = 4 ) => g.evaluate( () => window.__draws.frames ).then( ( t ) => g.waitForFunction( ( [ t, n ] ) => window.__draws.frames > t + n, [ t, n ], { timeout: 300000, polling: 100 } ) );
	G.rate = ( g ) => g.evaluate( () => { const R = window.__draws; return +( R.frames / ( performance.now() - R.since ) * 1000 ).toFixed( 1 ); } );
	G.press = async ( who, key, n = 3 ) => { await who.page.keyboard.down( key ); await G.frames( who.game, n ); await who.page.keyboard.up( key ); await G.frames( who.game, 1 ); };
	G.shot = async ( who, name ) => {

		await who.game.evaluate( () => window.__go() );
		for ( let i = 0; i < 3; i ++ ) {

			await who.game.evaluate( () => { window.__draws.peak = { calls: 0, tris: 0 }; } );
			await who.game.waitForFunction( () => window.__draws.peak.calls > 2, null, { timeout: 400000, polling: 200 } );

		}

		const path = `${ out }/${ name }.png`;
		await who.page.screenshot( { path, timeout: 300000 } );
		const r = await who.game.evaluate( () => { window.gc(); const R = { draws: window.__draws.peak.calls, triangles: window.__draws.peak.tris, heapMB: +( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 1 ) }; if ( ! window.__keepDrawing ) window.__stop(); return R; } );
		console.log( `     shot ${ name } (${ who.name }):`, JSON.stringify( r ) );
		return r;

	};

	// script memory, after a forced GC
	G.memory = async ( who, what ) => {

		const r = await who.game.evaluate( () => { window.gc(); window.gc(); const m = performance.memory; return { heapMB: +( m.usedJSHeapSize / 1048576 ).toFixed( 1 ), t: Math.round( performance.now() / 1000 ) }; } );
		console.log( `     MEMORY ${ who.name } ${ what }: ${ r.heapMB } MB at ${ r.t } s` );
		return r;

	};

	// bought, all that she has
	G.buy = ( who ) => who.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const a = window.__app, g = a.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.on === a.boat.id ) u[ k ] = t.levels.length - 1; g.applyGear(); } );
	// her owner aboard and the guest ridden on her, by the offer
	G.aboard = async ( owner, guest ) => {

		const seated = await owner.game.evaluate( () => window.__app.boat.seated );
		await owner.game.evaluate( () => { const p = window.__app.player; if ( window.__app.boat.seated ) p.enterBoat(); else p.boardBoat(); } );
		await G.until( guest.game, `${ OTHER }.cur.mode === '${ seated ? 'helm' : 'deck' }' && ${ OTHER }.cur.boat` );
		await G.until( guest.game, `( () => { const o = ${ OTHER }; return ( o.boat && o.boat.visible ) || ( o.stand && o.stand.visible ); } )()` );
		const beside = `( () => { const a = window.__app, o = ${ OTHER }, c = o.cur, f = c.drawn || c.boat, M = a.together.copies.model( c.boatId ); if ( ! M ) return false; const bp = M.boardPoint.clone().applyQuaternion( f.quat ).add( f.pos ); a.player.position.set( bp.x, bp.y + 0.2, bp.z ); a.player.velocity.set( 0, 0, 0 ); return !! a.player.rideOffer; } )()`;
		await G.until( guest.game, beside );
		await guest.game.evaluate( () => { const p = window.__app.player; p.ride( p.rideOffer.boat ); } );
		await G.frames( guest.game, 3 );
		return guest.game.evaluate( () => window.__app.player.riding && window.__app.player.mode === 'deck' );

	};

	// her owner at her helm, by E (a kayak's in her seat)
	G.helm = async ( owner ) => {

		const seated = await owner.game.evaluate( () => window.__app.boat.seated );
		if ( seated ) return;
		await owner.game.evaluate( () => { const p = window.__app.player, M = p.boat.model; p.deckPos.set( M.helm.x + 0.05, M.helm.y ?? M.lines.deckY, M.helm.z - 0.45 ); p.deckVel.set( 0, 0, 0 ); } );
		await G.frames( owner.game, 2 );
		await G.press( owner, 'KeyE', 3 );
		if ( ! await owner.game.evaluate( () => window.__app.player.mode === 'boat' ) ) {

			console.log( '     (E at her helm didn\'t reach her owner: by hand)' );
			await owner.game.evaluate( () => window.__app.player.takeHelm() );

		}

	};

	G.toSea = ( owner, F = { x: - 2600, z: 3000 } ) => owner.game.evaluate( ( F ) => { const a = window.__app, b = a.boatCtl; b.moored = false; b.beached = false; b.anchor = null; a.boat.sliding = null; b.position.set( F.x, b.position.y, F.z ); b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 ); a.together.setClock( 10, a.settings.day, 0.0001 ); }, F );
	G.end = async ( label ) => {

		// ((M17) each game's frame rate over the run, as the CPU gave it: a slow pass is a slow machine, not a slow game)
		for ( const pg of ctx.pages() ) {

			const f = pg.frames().find( ( x ) => x !== pg.mainFrame() ), name = new URL( pg.url() ).searchParams.get( 'name' );
			const r = f && await f.evaluate( () => { const R = window.__draws; return R && R.since ? +( R.frames / ( performance.now() - R.since ) * 1000 ).toFixed( 1 ) : null; } ).catch( () => null );
			if ( r !== null && r !== undefined ) console.log( `     FPS ${ name }: ${ r } over the run` );

		}

		console.log( `SUMMARY ${ label }: ${ G.failed } failed, ${ G.problems } problem(s), ${ ( ( Date.now() - G.t0 ) / 60000 ).toFixed( 1 ) } minutes` );
		await browser.close();
		process.exit( G.failed || G.problems ? 1 : 0 );

	};

	return G;

}
