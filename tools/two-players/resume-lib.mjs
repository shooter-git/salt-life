// (M16) What resume.mjs and resume-together.mjs share: a real game in a driven browser, what's true of it (view), a look at her from
// outside (outside), a real page load timed (loaded), and her saved records changed between visits (rewrite).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const SPACES = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
export const { chromium } = await import( join( SPACES, 'node_modules/playwright/index.mjs' ) );
export const launch = () => chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );

export const BOAT_IDS = [ 'kayak', 'console', 'lobster', 'sportfisher' ];
// the gear that holds her out there, each on her own
export const ANCHOR = { kayak: 'kayakAnchor', console: 'deepAnchor_console', lobster: 'deepAnchor_lobster', sportfisher: 'deepAnchor_sportfisher' };
export const SOCK = { kayak: 'driftSock_kayak', console: 'driftSock_console', lobster: 'driftSock_lobster', sportfisher: 'driftSock_sportfisher' };

let problems = 0, oks = 0;
export const say = ( ok, what ) => {

	console.log( `${ ok ? 'ok   ' : 'FAIL ' }${ what }` );
	if ( ok ) oks ++;
	else problems ++;
	return ok;

};
export const note = ( what ) => console.log( `     ${ what }` );
export const tally = () => ( { oks, problems } );

// what a page's said went wrong (a module the busy dev server didn't send isn't the game's)
export function watch( page, name ) {

	page.on( 'pageerror', ( e ) => {

		if ( /Failed to fetch dynamically imported module/.test( e.message ) ) {

			page.__unfetched = true;
			return;

		}

		say( false, `${ name } PAGEERROR ${ e.message.slice( 0, 240 ) } ${ ( e.stack || '' ).split( '\n' ).slice( 1, 3 ).join( ' | ' ).slice( 0, 240 ) }` );

	} );
	page.on( 'console', ( m ) => {

		if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource|dynamically imported|WebSocket/.test( m.text() ) ) say( false, `${ name } CONSOLE ${ m.text().slice( 0, 300 ) }` );

	} );

}

// the toasts, from the start (tellAway's come in the first frames)
export const toastWatch = () => {

	window.__toasts = [];
	const t = setInterval( () => {

		const g = window.__app && window.__app.game;
		if ( ! g || ! g.toast ) return;
		clearInterval( t );
		const f = g.toast.bind( g );
		g.toast = ( text, ms ) => {

			window.__toasts.push( text );
			return f( text, ms );

		};

	}, 10 );

};

// the game's come up in this frame: started, and what's held back of her on a CPU back in the scene
export async function started( game, { reveal = true, page = null, reload = null, seconds = 400 } = {} ) {

	for ( let i = 0; i < seconds; i ++ ) {

		if ( page && page.__unfetched && reload ) {

			page.__unfetched = false;
			note( 'a module did not come: loading again' );
			await reload();

		}

		const f = typeof game === 'function' ? game() : game;
		if ( f && await f.evaluate( () => !! ( window.__app && window.__app._started ) ).catch( () => false ) ) break;
		await new Promise( ( r ) => setTimeout( r, 1000 ) );
		if ( i === seconds - 1 ) {

			// (what it was doing: the veil's word, how far it got)
			const g = typeof game === 'function' ? game() : game;
			const said = g ? await g.evaluate( () => ( { veil: document.querySelector( '.slv' )?.textContent?.replace( /\s+/g, ' ' ).slice( 0, 120 ), app: !! window.__app, started: !! window.__app?._started, marks: performance.getEntriesByType( 'mark' ).map( ( m ) => `${ m.name } ${ Math.round( m.startTime ) }` ).slice( - 4 ), now: Math.round( performance.now() ) } ) ).catch( ( e ) => `no answer: ${ e.message.slice( 0, 120 ) }` ) : 'no frame';
			note( `didn't start: ${ JSON.stringify( said ) }` );
			throw new Error( 'the game did not start' );

		}

	}

	const f = typeof game === 'function' ? game() : game;
	if ( reveal ) await f.waitForFunction( () => ! window.__app._lateHeld && ! window.__app._late, null, { timeout: 180000, polling: 500 } ).catch( () => note( 'still held back after 3 minutes' ) );
	return f;

}

export const frames = ( g, n = 4 ) => g.evaluate( () => window.__app.renderer.info.render.frame ).then( ( t ) => g.waitForFunction( ( [ t, n ] ) => window.__app.renderer.info.render.frame > t + n, [ t, n ], { timeout: 200000, polling: 200 } ) );

// the guide out of the way
export const quiet = ( g ) => g.evaluate( () => {

	const a = window.__app, G = a.game;
	if ( G.guide ) {

		G.guide.seen.intro = true;
		if ( G.guide.open ) G.guide.close();
		G.guide._wait = - 1;

	}

	if ( a.together ) a.together.stale = 120;

} );

// all that's true of her and you
export const view = ( g ) => g.evaluate( () => {

	const a = window.__app, G = a.game, b = a.boatCtl, p = a.player, s = a.settings, st = G.state, W = a.waves;
	const r = ( v, n = 1 ) => Math.round( v * 10 ** n ) / 10 ** n;
	const text = ( q ) => {

		const e = document.querySelector( q );
		if ( ! e ) return null;
		const c = getComputedStyle( e );
		return c.display === 'none' || c.visibility === 'hidden' ? null : e.textContent.trim();

	};

	let inScene = false;
	for ( let o = a.boat.group; o; o = o.parent ) if ( o === a.scene ) inScene = true;
	const veil = document.querySelector( '.slv' );
	const moored = {};
	if ( G.fleet && G.fleet.moored ) for ( const [ id, E ] of Object.entries( G.fleet.moored.boats ) ) moored[ id ] = E.mesh ? [ r( E.mesh.position.x ), r( E.mesh.position.y, 2 ), r( E.mesh.position.z ), E.mesh.visible, !! E.spot ] : null;
	return {
		boat: st.boat, model: a.boat.id, fleet: Object.keys( st.fleet ).join(),
		x: r( b.position.x ), y: r( b.position.y, 2 ), z: r( b.position.z ), h: r( b.getYaw(), 3 ),
		moored: !! b.moored, beached: !! b.beached, hauled: !! b.hauled, anchor: b.anchor ? [ r( b.anchor.x ), r( b.anchor.z ) ] : null, sock: !! b.sock, driven: !! b.driven,
		mode: p.mode, riding: !! p.riding, you: [ r( p.position.x ), r( p.position.y ), r( p.position.z ) ], deck: p.mode === 'deck' ? [ r( p.deckPos.x, 2 ), r( p.deckPos.y, 2 ), r( p.deckPos.z, 2 ) ] : null,
		fuel: st.fuel === null ? null : r( st.fuel, 1 ), hull: r( st.hull, 3 ), money: st.money, stHauled: !! st.hauled,
		day: s.day, hour: r( s.timeOfDay, 2 ), weather: s.weather,
		hud: { money: text( '.gm-money' ), fuel: text( '.gm-fuel.is-on .gm-fuel-l' ), hull: text( '.gm-hull.is-on .gm-hull-p' ) },
		note: G.hud && G.hud.noteOpen ? G.hud.note.textContent.replace( /\s+/g, ' ' ).trim().slice( 0, 700 ) : null,
		toasts: window.__toasts || [],
		veil: !! veil && getComputedStyle( veil ).display !== 'none' && + getComputedStyle( veil ).opacity > 0.02,
		inScene, shown: a.boat.group.visible, frame: a.renderer.info.render.frame,
		sea: r( W.heightAt( b.position.x, b.position.z ), 2 ), depth: r( - a.terrainData.heightAt( b.position.x, b.position.z ) ),
		mooredBoats: moored, ready: Math.round( performance.getEntriesByName( 'load: ready' )[ 0 ]?.startTime ?? - 1 ),
	};

} );

// a line of what's seen, for the record
export const brief = ( v ) => JSON.stringify( { boat: v.boat, at: [ v.x, v.y, v.z ], h: v.h, moored: v.moored, beached: v.beached, hauled: v.hauled, anchor: v.anchor, sock: v.sock, mode: v.mode, riding: v.riding, you: v.you, deck: v.deck, fuel: v.fuel, hull: v.hull, money: v.money, day: v.day, hour: v.hour, wx: v.weather, hud: v.hud, veil: v.veil, inScene: v.inScene, shown: v.shown, sea: v.sea, depth: v.depth, ready: v.ready } );

// the picture you see; and if you're off her, one of her from beside her (you put there for a moment, looking at her: a camera moved only
// for the draw leaves half the world black, as it's made for where you are). Aboard, at her helm's chase camera, what you see's her already.
export async function shots( page, g, file, { outside = true, from = [ 9, 5, - 13 ] } = {} ) {

	await frames( g, 2 ).catch( () => {} );
	await page.screenshot( { path: `${ file }-seen.png` } );
	if ( ! outside ) return;
	const was = await g.evaluate( ( from ) => {

		const a = window.__app, p = a.player, b = a.boatCtl.position;
		if ( p.mode !== 'walk' && p.mode !== 'swim' ) return null;
		const keep = { mode: p.mode, x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, floating: p.floating };
		const x = b.x + from[ 0 ], z = b.z + from[ 2 ], g = a.terrainData.heightAt( x, z ), sea = a.waves.heightAt( x, z );
		p.mode = g > sea ? 'walk' : 'swim';
		p.position.set( x, p.mode === 'walk' ? g + 1.7 : sea - 0.2, z );
		p.velocity.set( 0, 0, 0 );
		p.floating = true;
		p.yaw = Math.atan2( from[ 0 ], from[ 2 ] );
		p.pitch = - 0.05;
		return keep;

	}, from );
	if ( ! was ) return;
	await frames( g, 4 ).catch( () => {} );
	await page.screenshot( { path: `${ file }-out.png` } );
	await g.evaluate( ( k ) => {

		const p = window.__app.player;
		p.mode = k.mode;
		p.position.set( k.x, k.y, k.z );
		p.velocity.set( 0, 0, 0 );
		p.yaw = k.yaw;
		p.floating = k.floating;

	}, was );
	await frames( g, 1 ).catch( () => {} );

}

// save now, as a pause (the app covering the game) does: App's portal.on( 'pause' )
export const saveNow = ( g ) => g.evaluate( async () => {

	const a = window.__app;
	a.saveClock();
	a.game.state.save();
	await a.store.flush();

} );

// over her side, in the water by her, as if you'd swum there (so the world's made about her)
export const swimTo = ( g, dx = 12, dz = - 12 ) => g.evaluate( ( [ dx, dz ] ) => {

	const a = window.__app, b = a.boatCtl.position, p = a.player;
	p.position.set( b.x + dx, a.waves.heightAt( b.x + dx, b.z + dz ) - 0.2, b.z + dz );
	p.mode = 'swim';
	p.velocity.set( 0, 0, 0 );
	p.floating = true;
	p.yaw = Math.atan2( dx, dz );

}, [ dx, dz ] );

// a spot far out with water her anchor will hold in, from the spiral about ( cx, cz )
export const farSpot = ( g, { cx = 2600, cz = 4200, max = 18, min = 6 } = {} ) => g.evaluate( ( [ cx, cz, max, min ] ) => {

	const T = window.__app.terrainData;
	for ( let r = 0; r < 9000; r += 60 ) for ( let k = 0; k < 24; k ++ ) {

		const x = cx + r * Math.cos( k / 24 * Math.PI * 2 ), z = cz + r * Math.sin( k / 24 * Math.PI * 2 ), d = - T.heightAt( x, z );
		if ( d > min && d < max && Math.hypot( x - 30, z + 320 ) > 3400 ) return { x, z, d };

	}

	return null;

}, [ cx, cz, max, min ] );
