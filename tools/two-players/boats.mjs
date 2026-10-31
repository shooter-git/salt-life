// Two real games (tools/two-players), each in a different boat (M16): each sees the other's as she is, built on first
// sight with a stand-in meanwhile; the low tier's copy; Marta's dock holding more than yours; riding along, at the helm of
// someone else's boat; a crew's jobs on a big boat; a boat as a speck past the fog; her lamps at night; a boat that's sat in.
//   tools/render-slot.sh node tools/two-players/boats.mjs [dir for screenshots] [port] [tier: low|mid|high]   (some minutes: two games on the CPU)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const SPACES = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( SPACES, 'node_modules/playwright/index.mjs' ) );
const [ out = 'qa-output', PORT = '5189', TIER = 'low' ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );
const ctx = await browser.newContext( { viewport: { width: 960, height: 540 } } );
let problems = 0;
const say = ( ok, what ) => { console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what ); if ( ! ok ) problems ++; };
const open = async ( name, boat, tier = TIER ) => {

	const page = await ctx.newPage();
	let unfetched = false;
	page.on( 'pageerror', ( e ) => {

		if ( /Failed to fetch dynamically imported module/.test( e.message ) ) { unfetched = true; return; }
		problems ++;
		console.log( name, 'PAGEERROR', e.message.slice( 0, 300 ), ( e.stack || '' ).split( '\n' ).slice( 1, 4 ).join( ' | ' ).slice( 0, 300 ) );

	} );
	page.on( 'console', ( m ) => { if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource|dynamically imported/.test( m.text() ) ) { problems ++; console.log( name, 'CONSOLE', m.text().slice( 0, 300 ) ); } } );
	await page.goto( `http://127.0.0.1:${ PORT }/tools/two-players/?name=${ name }&id=${ name.toLowerCase() }-1&tier=${ tier }&src=${ encodeURIComponent( `/?boat=${ boat }` ) }` );
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
const other = 'window.__app.together.others.values().next().value';
// (two games on the CPU can go seconds between poses: a pose gone stale is only waited out)
const until = ( g, what, timeout = 200000 ) => g.waitForFunction( `( () => { try { return ${ what }; } catch ( e ) { return false; } } )()`, null, { timeout, polling: 500 } );
const posed = ( g ) => until( g, `${ other } && ${ other }.cur && ${ other }.cur.boat` );
// (a look about, from the player: put where the camera can see)
const stand = ( g, x, z, yaw, y = null ) => g.evaluate( ( [ x, z, yaw, y ] ) => { const a = window.__app, p = a.player; p.position.set( x, y ?? Math.max( a.terrainData.heightAt( x, z ), a.colliders.groundHeightAt( x, z, 50 ) ), z ); p.yaw = yaw; p.pitch = - 0.05; p.velocity.set( 0, 0, 0 ); }, [ x, z, yaw, y ] );
const shot = ( who, name ) => who.page.screenshot( { path: `${ out }/boats-${ name }.png` } );

// ---- two boats: Robin in the center console, Sam in the sportfisher, at the dock
const robin = await open( 'Robin', 'console' );
const sam = await open( 'Sam', 'sportfisher' );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
console.log( 'both in' );
const type = async ( g ) => { await posed( g ); return g.evaluate( `${ other }.cur.boatId` ); };
say( await type( sam.game ) === 'console' && await type( robin.game ) === 'sportfisher', 'each pose says which boat she is' );

// first sight: Sam at the pier, looking at Robin's
await stand( sam.game, 55, 25, 1.2 );
await stand( robin.game, 55, 25, 1.2 );
await sam.game.evaluate( () => { window.__app.boatCtl.moored = true; } );
const firstSight = await sam.game.evaluate( `( () => { const o = ${ other }, t = window.__app.together; return { stand: !! ( o.stand && o.stand.visible ), copy: !! ( o.boat && o.boat.visible ), built: [ ...t.copies.types.keys() ], berth: o.berth }; } )()` );
console.log( '     at first sight', JSON.stringify( firstSight ) );
await until( sam.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible; } )()` );
await until( robin.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible; } )()` );
await frames( sam.game, 4 );
const seen = ( g ) => g.evaluate( `( () => { const o = ${ other }, b = o.boat, t = window.__app.together; let meshes = 0, hull = null; b.traverse( ( m ) => { if ( m.isMesh && m.name.startsWith( 'boat-' ) ) meshes ++; if ( m.name === 'boat-hull' ) hull = m; } ); return { type: b.userData.type, model: b.userData.model.id, meshes, length: +b.userData.model.dimensions.length.toFixed( 1 ), lamps: b.userData.lamps.points.geometry.attributes.position.count, types: [ ...t.copies.types.keys() ], stand: !! ( o.stand && o.stand.visible ), own: window.__app.boat.id, berth: o.berth, at: b.position.toArray().map( ( v ) => +v.toFixed( 1 ) ), mine: window.__app.boatCtl.position.toArray().map( ( v ) => +v.toFixed( 1 ) ) }; } )()` );
const sa = await seen( sam.game ), ro = await seen( robin.game );
console.log( '     Sam sees  ', JSON.stringify( sa ) );
console.log( '     Robin sees', JSON.stringify( ro ) );
say( sa.type === 'console' && sa.model === 'console' && sa.length === 7, 'Sam sees a center console, and she\'s not his boat' );
say( ro.type === 'sportfisher' && ro.length === 14.6, 'Robin sees a sportfisher' );
say( ! sa.stand && ! ro.stand, 'the stand-in gone once she\'s there' );
say( sa.types.length === 1 && ro.types.length === 1, 'and only the type that\'s wanted is in memory' );

// ---- Marta's dock
say( sa.berth > 0 && ro.berth > 0, `at the dock she has a berth of her own: Sam sees Robin's at spare ${ sa.berth }` );
const apart = Math.hypot( sa.at[ 0 ] - sa.mine[ 0 ], sa.at[ 2 ] - sa.mine[ 2 ] );
say( apart > 10, `${ apart.toFixed( 1 ) } m from his own` );
const depth = await sam.game.evaluate( async () => { const { spareBerth, SPARE_BERTHS } = await import( '/src/together/Berths.js' ); const a = window.__app, l = []; for ( let i = 0; i < SPARE_BERTHS; i ++ ) { const b = spareBerth( i, 2.9 ); l.push( [ b.x, b.z, +( - a.terrainData.heightAt( b.x, b.z ) ).toFixed( 2 ) ] ); } return l; } );
console.log( '     the spare berths [ x, z, depth ]', JSON.stringify( depth ) );
// (from the pier head up the stem, and from above: a frame held while the camera's moved)
await stand( sam.game, 56, 34, 0.08 );
await frames( sam.game, 6 );
await shot( sam, 'dock' );
await sam.game.evaluate( () => { const a = window.__app; a.frame = function () { this.camera.position.set( 86, 22, 2 ); this.camera.lookAt( 60, 0, 26 ); this.camera.updateMatrixWorld(); this.drawWorld(); }; } );
await frames( sam.game, 3 );
await shot( sam, 'dock-above' );
await sam.game.evaluate( () => { delete window.__app.frame; } );
await frames( sam.game, 2 );

// ---- riding along: Sam boards Robin's console at her spare berth, deck in her frame
await robin.game.evaluate( () => { const p = window.__app.player; p.boardBoat(); } );
await until( sam.game, `${ other }.cur.mode === 'deck'` );
const board = `( () => { const a = window.__app, o = ${ other }, c = o.cur, f = c.drawn || c.boat, M = o.boat.userData.model, bp = M.boardPoint.clone().applyQuaternion( f.quat ).add( f.pos ); a.player.position.set( bp.x, bp.y + 0.3, bp.z ); a.player.velocity.set( 0, 0, 0 ); } )()`;
await posed( sam.game );
await sam.game.evaluate( board );
await until( sam.game, `( window.__app.player.rideOffer || ( ${ board }, false ) )` );
const offer = await sam.game.evaluate( () => { const p = window.__app.player, b = p.rideOffer.boat; p.ride( b ); return { type: b.model.id, name: p.rideOffer.name }; } );
say( offer.type === 'console', `Sam's offered ${ offer.name }'s boat, her own deck to walk: ${ offer.type }` );
await frames( sam.game, 4 );
await sam.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0.4, p.boat.model.lines.deckY, - 2.0 ); } );
await frames( sam.game, 3 );
await until( robin.game, `${ other }.cur.ride === 'robin-1' && ${ other }.cur.deck` );
await frames( robin.game, 4 );
await until( robin.game, `${ other }.cur.ride === 'robin-1' && ${ other }.cur.deck` );
const fig = await robin.game.evaluate( `( () => { const a = window.__app, o = ${ other }, c = o.cur, g = o.avatar.group, want = c.deck.clone().applyQuaternion( a.boatCtl.quaternion ).add( a.boatCtl.position ); return { shown: o.shown, d: +g.position.distanceTo( want ).toFixed( 3 ), deck: c.deck.toArray().map( ( v ) => +v.toFixed( 2 ) ) }; } )()` );
say( fig.shown && fig.d < 0.01, `Robin sees Sam on her own deck, where he stands in her frame ${ JSON.stringify( fig.deck ) }` );

// ---- at the helm of someone else's boat: Sam drives Robin's, Robin's game runs her
await sam.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( p.boat.model.helm.x, p.boat.model.lines.deckY, p.boat.model.helm.z ); } );
await frames( sam.game, 2 );
say( await sam.game.evaluate( () => window.__app.player.boat.helmFree ), 'with Robin on deck, her helm\'s free for Sam' );
const start = await robin.game.evaluate( () => window.__app.boatCtl.position.toArray() );
await sam.game.evaluate( () => { const p = window.__app.player; p.takeHelm(); window.__holdThrottle = setInterval( () => { p.boat.setInput( 0.8, 0.1 ); }, 30 ); window.__app.input.down = ( ( d ) => function ( k ) { return k === 'KeyW' ? true : d.call( this, k ); } )( window.__app.input.down ); } );
await until( robin.game, 'window.__app.boatCtl.driven && window.__app.boatCtl.speed > 1' );
const driven = await robin.game.evaluate( ( s ) => { const b = window.__app.boatCtl; return { speed: +b.speed.toFixed( 2 ), moved: +Math.hypot( b.position.x - s[ 0 ], b.position.z - s[ 2 ] ).toFixed( 1 ), rpm: +b.rpm.toFixed( 2 ), mode: window.__app.player.mode }; }, start );
say( driven.mode === 'deck' && driven.speed > 1, `Robin on deck, Sam at her helm, and she goes: ${ JSON.stringify( driven ) }` );
await frames( sam.game, 6 );
await posed( sam.game );
const rideS = await sam.game.evaluate( `( () => { const a = window.__app, b = a.player.boat, c = ${ other }.cur; return { mode: a.player.mode, rpm: +c.rpm.toFixed( 2 ), speed: +b.speed.toFixed( 2 ), riding: a.player.riding, sound: a.together.boatSound().active }; } )()` );
say( rideS.mode === 'boat' && rideS.rpm > 0.05 && rideS.sound, `and Sam hears her engine: ${ JSON.stringify( rideS ) }` );
await shot( sam, 'at-her-helm' );
await until( robin.game, `${ other }.cur.mode === 'helm'` );
await frames( robin.game, 3 );
await until( robin.game, `${ other }.cur.mode === 'helm'` );
const fromRobin = await robin.game.evaluate( `( () => { const a = window.__app, o = ${ other }, g = o.avatar.group, M = a.boat, h = M.helmEye.clone(); h.y = M.lines.deckY; const w = h.applyQuaternion( a.boatCtl.quaternion ).add( a.boatCtl.position ); return { mode: o.cur.mode, shown: o.shown, d: +Math.hypot( g.position.x - w.x, g.position.z - w.z ).toFixed( 2 ), job: o.job, tag: o.tagName && o.tagName.nodeValue }; } )()` );
say( fromRobin.mode === 'helm' && fromRobin.d < 0.1, `Robin sees Sam at her helm: ${ JSON.stringify( fromRobin ) }` );
// Robin takes her back: Sam's put off it
await robin.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( p.boat.model.helm.x, p.boat.model.lines.deckY, p.boat.model.helm.z ); p.takeHelm(); } );
await until( sam.game, 'window.__app.player.mode === \'deck\'' );
say( await robin.game.evaluate( () => window.__app.boatCtl.driven && window.__app.player.mode === 'boat' ), 'her owner takes the helm, and it\'s theirs' );
await sam.game.evaluate( () => { clearInterval( window.__holdThrottle ); } );

// ---- the sportfisher's crew: Robin aboard Sam's boat, Sam at the helm, out from the dock, a third job each way
await sam.game.evaluate( () => { const p = window.__app.player; p.exitBoat( null, 1 ); } );
await robin.game.evaluate( () => { const a = window.__app, p = a.player, b = a.boatCtl; p.leaveHelm(); p.exitBoat( null, 1 ); b.reset(); } );
const FAR = { x: - 2600, z: 3000 };
await sam.game.evaluate( ( F ) => { const a = window.__app, p = a.player, b = a.boatCtl; p.boardBoat(); p.takeHelm(); b.moored = false; b.position.set( F.x, b.position.y, F.z ); }, FAR );
await until( robin.game, `( () => { const o = ${ other }; return o.cur && o.cur.boat && Math.hypot( o.cur.boat.pos.x - ${ FAR.x }, o.cur.boat.pos.z - ${ FAR.z } ) < 50; } )()` );
await robin.game.evaluate( ( F ) => { const p = window.__app.player; p.mode = 'swim'; p.position.set( F.x, 0, F.z ); }, FAR );
await until( robin.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === 'sportfisher'; } )()` );
const swimTo = `( () => { const a = window.__app, o = ${ other }, c = o.cur, f = c.boat, M = o.boat.userData.model, bp = M.boardPoint.clone().applyQuaternion( f.quat ).add( f.pos ); a.player.position.set( bp.x, bp.y, bp.z ); } )()`;
await until( robin.game, `( window.__app.player.rideOffer || ( ${ swimTo }, false ) )` );
await robin.game.evaluate( () => { const p = window.__app.player; p.ride( p.rideOffer.boat ); } );
await frames( robin.game, 3 );
// up the tower: looking at a find, she calls it down
await robin.game.evaluate( () => { const p = window.__app.player, s = p.boat.model.stations.tower; p.deckPos.set( s.x, s.y, s.z ); p.deckVel.set( 0, 0, 0 ); } );
await frames( robin.game, 3 );
say( await robin.game.evaluate( () => window.__app.together.crew.job ) === 'tower', 'Robin goes up the tower: she\'s the spotter' );
await until( sam.game, `${ other }.job === 'tower'` );
const toasts = [];
sam.game.page().on( 'console', ( m ) => toasts.push( m.text() ) );
const call = await robin.game.evaluate( async () => {

	const a = window.__app, c = a.camera.position;
	// (a find before her, as there is out here most days)
	a.finds = { weed: [], debris: [], bait: [ { x: c.x + 1000, z: c.z } ] };
	const crew = a.together.crew;
	let told = null;
	const was = a.game.toast;
	a.game.toast = function ( t, ms ) { if ( /birds/.test( t ) ) told = t; return was.call( this, t, ms ); };
	for ( let i = 0; i < 80 && ! told; i ++ ) {

		a.player.pitch = 0;
		a.camera.lookAt( c.x + 1000, c.y, c.z );
		a.finds = { weed: [], debris: [], bait: [ { x: c.x + 1000, z: c.z } ] };
		crew._spot( 0.1 );
		await new Promise( ( r ) => setTimeout( r, 20 ) );

	}

	a.game.toast = was;
	return told;

} );
say( !! call, `looked at for a moment, she calls it: "${ call }"` );
await until( sam.game, 'window.__app.together.crew._marks.length > 0', 30000 ).catch( () => {} );
const marks = await sam.game.evaluate( () => window.__app.together.crew._marks.length );
say( marks > 0, 'the helm has it on the map' );
// in the chair
await robin.game.evaluate( () => { const p = window.__app.player, s = p.boat.model.stations.chair; p.deckPos.set( s.x, s.y, s.z ); p.deckVel.set( 0, 0, 0 ); } );
await until( sam.game, `${ other }.job === 'chair'` );
await frames( sam.game, 6 );
await posed( sam.game );
const chair = await sam.game.evaluate( `( () => { const a = window.__app, o = ${ other }, s = a.boat.stations.chair, g = o.avatar.group, w = new g.position.constructor( s.x, s.y, s.z ).applyQuaternion( a.boatCtl.quaternion ).add( a.boatCtl.position ); const f = new g.position.constructor( 0, 0, 1 ).applyQuaternion( g.quaternion ), b = new g.position.constructor( 0, 0, 1 ).applyQuaternion( a.boatCtl.quaternion ); return { d: +g.position.distanceTo( w ).toFixed( 3 ), aft: +f.dot( b ).toFixed( 2 ), sit: +o.avatar._sit.toFixed( 2 ), tag: o.tagName && o.tagName.nodeValue }; } )()` );
say( chair.d < 0.02 && chair.aft < - 0.8 && chair.sit > 0.3, `Sam sees her sat in the chair, facing aft: ${ JSON.stringify( chair ) }` );
const crewAid = await robin.game.evaluate( () => { const t = window.__app.together, f = { distance: 30, landAt: 1.2 }; t.backDown( f, 1 ); return { d: f.distance, helm: t.crew.backing() }; } );
say( crewAid.d < 30, `and with Sam at the helm she's backed down on a fish: ${ JSON.stringify( crewAid ) }` );
await sam.game.evaluate( () => { const a = window.__app; a.player.camMode = 'third'; a.player.orbitDist = 26; a.player.orbitYaw = a.boatCtl.getYaw() + 2.6; a.player.orbitPitch = 0.3; } );
await frames( sam.game, 4 );
await shot( sam, 'crew' );
const reads = async ( g ) => g.evaluate( () => { const a = window.__app, i = a.renderer.info; return { draws: i.render.calls, tris: i.render.triangles, heapMB: performance.memory ? +( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 1 ) : null }; } );
console.log( '     readings, Sam with her in sight', JSON.stringify( await reads( sam.game ) ) );

// ---- far apart: a speck past the fog
await robin.game.evaluate( () => { const p = window.__app.player; p.exitBoat( null, 1 ); } );
const R = { x: - 2600, z: 3000 };
for ( const d of [ 2500, 6000, 9000, 12500, 15500 ] ) {

	await robin.game.evaluate( ( [ R, d ] ) => { const a = window.__app, p = a.player, b = a.boatCtl; if ( p.mode !== 'boat' ) { p.boardBoat(); p.takeHelm(); } b.moored = false; b.position.set( R.x + d, b.position.y, R.z ); }, [ R, d ] );
	await until( sam.game, `( () => { const o = ${ other }; return o.cur && o.cur.boat && Math.abs( o.cur.boat.pos.x - ${ R.x + d } ) < 60; } )()` );
	await sam.game.evaluate( ( [ R, d ] ) => { const a = window.__app, p = a.player; p.camMode = 'first'; p.helmYaw = 0; p.helmPitch = 0; }, [ R, d ] );
	await frames( sam.game, 4 );
	await posed( sam.game );
	const sp = await sam.game.evaluate( `( () => { const a = window.__app, t = a.together, o = ${ other }, s = t.specks; const A = s && s.geometry.attributes; return { fog: Math.round( a.sky.fogFar ), mesh: !! ( o.boat && o.boat.visible ), stand: !! ( o.stand && o.stand.visible ), n: s ? s.count : 0, alpha: s && s.count ? +A.speckColor.array[ 3 ].toFixed( 3 ) : 0, w: s && s.count ? +A.speckSize.array[ 0 ].toFixed( 2 ) : 0, h: s && s.count ? +A.speckSize.array[ 1 ].toFixed( 2 ) : 0, radar: t.boatsAbout().length }; } )()` );
	console.log( `     Robin's ${ d } m from Sam:`, JSON.stringify( sp ) );
	if ( d > 2000 && d < 13000 ) say( sp.n === 1 && sp.alpha > 0.1, `at ${ d / 1000 } km she's a speck` );
	if ( d === 15500 ) say( sp.n === 0, 'and at 15.5 km the lobster boat\'s under the horizon' );
	if ( d === 9000 ) {

		// looking at her: Sam's bow toward her, from his helm
		await sam.game.evaluate( ( yaw ) => { const a = window.__app, p = a.player, b = a.boatCtl; p.camMode = 'first'; p.helmYaw = 0; p.helmPitch = 0; b.quaternion.setFromAxisAngle( a.camera.up.clone().set( 0, 1, 0 ), yaw ); b.angular.set( 0, 0, 0 ); }, Math.PI / 2 );
		await frames( sam.game, 4 );
		await shot( sam, 'speck-9km' );

	}

}

// ---- her lamps at night, from the sportfisher's lamps' own figures
await robin.game.evaluate( ( R ) => { const a = window.__app, b = a.boatCtl; b.position.set( R.x + 400, b.position.y, R.z ); }, R );
await until( sam.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible; } )()` );
const lamps = await sam.game.evaluate( `( () => { const o = ${ other }, M = o.boat.userData.model, y = o.boat.userData.lamps.points.geometry.attributes.position; let top = 0; for ( let i = 0; i < y.count; i ++ ) top = Math.max( top, y.getY( i ) ); return { model: M.id, top: +top.toFixed( 2 ), want: +M.lamps.anchor[ 1 ].toFixed( 2 ) }; } )()` );
say( lamps.top === lamps.want, `the lamps on Robin's boat are at her own lamp heights: ${ JSON.stringify( lamps ) }` );

console.log( problems ? `${ problems } PROBLEM(S)` : 'no problems' );
await browser.close();
process.exit( problems ? 1 : 0 );
