#!/usr/bin/env node
// (M21) The sportfisher's deck hand, seen (docs/m21/deckhand.md): hired, out at sea, the stand-in while his look's held back, in
// her cockpit and at her helm; then his look, in her cockpit; at her helm backing her down on a fish (staged: a fish 300 m astern
// of her that doesn't come in); handed back, in her cockpit again. Each from close enough
// to judge his feet on her deck and his hands on her wheel. And what he costs: script memory after a forced collection, the
// programs, textures and geometries three holds, and the draws in a frame with him and without. Drawn on the CPU (Chromium on
// SwiftShader, from All the Spaces' Playwright), into <out>/<tier>/.
//
//   a dev server on LOOK_PORT (5241), then
//   tools/render-slot.sh node tools/deckhand/look.mjs <out> [tier]
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces. Don't edit src while it runs.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/deckhand' ), TIER = 'low' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const SEA = { x: - 2600, z: 3000 }; // (the blue water off the west side, calm: looks.mjs' SEA)

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && ! /GL Driver|GPU stall|WebGL: |swiftshader|Automatic fallback/i.test( m.text() ) && errors.push( m.text() ) );
// (the draws in each frame, at the GL: two.players' lib's count)
await page.addInitScript( () => {

	const R = window.__draws = { calls: 0, frame: 0 }, P = WebGL2RenderingContext.prototype;
	for ( const k of [ 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements' ] ) {

		const f = P[ k ];
		P[ k ] = function ( ...a ) {

			R.calls ++;
			return f.apply( this, a );

		};

	}

	const tick = () => {

		if ( R.calls ) R.frame = R.calls;
		R.calls = 0;
		requestAnimationFrame( tick );

	};

	requestAnimationFrame( tick );

} );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&boat=sportfisher&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
log( 'started' );
// (his look waits for Joe's and Marta's: App.loadCharacters)
await page.waitForFunction( () => window.__app._peopleIn, null, { timeout: 1500000, polling: 1000 } );
log( 'the traders\' looks in' );
// (and what the start loads after them, so his cost isn't read across theirs: the whale's last but for the air's motes)
await page.waitForFunction( () => window.__app.whale && ( window.__app.tier === 'low' || window.__app.motes ), null, { timeout: 1500000, polling: 1000 } ).catch( () => log( 'no whale yet: going on' ) );
log( 'the start\'s loading done' );

await page.evaluate( ( SEA ) => {

	const a = window.__app, g = a.game, p = a.player, b = a.boatCtl;
	if ( a.together ) a.together.syncClock = () => {};
	setInterval( () => {

		a.settings.timeSpeed = 0;
		a.settings.timeOfDay = 11;

	}, 300 );
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
	document.head.appendChild( css );
	// aboard her, on her deck aft; she's out at sea, stopped
	if ( p.mode !== 'deck' ) p.boardBoat();
	b.moored = false;
	b.beached = false;
	b.anchor = null;
	b.position.set( SEA.x, b.position.y, SEA.z );
	b.velocity.set( 0, 0, 0 );
	b.angular.set( 0, 0, 0 );
	p.deckPos.set( - 0.9, 0.5, - 5.7 );
	p.deckVel.set( 0, 0, 0 );
	g.state.money = Math.max( g.state.money, 5000 );
	g.state.fuelL = Math.max( g.state.fuelL, 500 );
	// the camera put where a shot wants it, in her frame, just before the world's drawn (window.__cam: [ from, to ], boat frame)
	const draw = a.drawWorld.bind( a ), cam = a.camera, V = cam.position.constructor;
	a.drawWorld = ( ...args ) => {

		const c = window.__cam;
		if ( c ) {

			const G = a.boat.group;
			G.updateMatrixWorld( true );
			cam.position.copy( G.localToWorld( new V( ...c[ 0 ] ) ) );
			cam.lookAt( G.localToWorld( new V( ...c[ 1 ] ) ) );
			cam.updateMatrixWorld();

		}

		window.__frames = ( window.__frames || 0 ) + 1;
		return draw( ...args );

	};

}, SEA );

const frames = async ( n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 600000 } );

};
const shot = async ( name, cam ) => {

	await page.evaluate( ( c ) => ( window.__cam = c ), cam );
	await frames( 4 );
	writeFileSync( join( OUT, `${ name }.png` ), await page.screenshot() );
	log( name, JSON.stringify( await page.evaluate( () => {

		const h = window.__app.game.mate.hand;
		return { where: h && h.where, look: !! ( h && h.character ), standIn: !! ( h && h.standIn ), shown: !! ( h && h.root.visible ), at: h ? h.root.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) : null };

	} ) ) );

};
// what three holds and script memory, after a forced collection
const held = ( what ) => page.evaluate( ( what ) => {

	window.gc();
	window.gc();
	const a = window.__app, i = a.renderer.info;
	// (each program by its shader and a hash of its key, to say which are new)
	const hash = ( t ) => {

		let h = 2166136261;
		for ( let k = 0; k < t.length; k ++ ) h = Math.imul( h ^ t.charCodeAt( k ), 16777619 );
		return ( h >>> 0 ).toString( 16 );

	};
	return { what, heapMB: +( performance.memory.usedJSHeapSize / 1048576 ).toFixed( 2 ), programs: i.programs.length, textures: i.memory.textures, geometries: i.memory.geometries, keys: i.programs.map( ( p ) => `${ p.name }:${ hash( p.cacheKey ) }` ) };

}, what );
// the draws in a frame from here, with him and without (his figure hidden for a few frames)
const draws = async ( cam ) => {

	await page.evaluate( ( c ) => {

		window.__cam = c;
		const h = window.__app.game.mate.hand;
		if ( h && ! h._hideable ) {

			const up = h.update.bind( h );
			h.update = ( ...a ) => {

				up( ...a );
				if ( window.__hideMate ) h.root.visible = false;

			};
			h._hideable = true;

		}

	}, cam );
	const count = async ( hide ) => {

		await page.evaluate( ( hide ) => ( window.__hideMate = hide ), hide );
		await frames( 4 );
		const out = [];
		for ( let k = 0; k < 3; k ++ ) {

			await frames( 1 );
			out.push( await page.evaluate( () => window.__draws.frame ) );

		}

		return Math.min( ...out );

	};

	const without = await count( true ), withHim = await count( false );
	await page.evaluate( () => ( window.__hideMate = false ) );
	return { with: withHim, without, his: withHim - without };

};

// her frame (+x port, +z her bow): his cockpit spot is ( 1.6, 0.5, -4.0 ), his at her helm ( 0, 3.1, 0.15 )
const COCKPIT = {
	quarter: [ [ - 1.3, 2.0, - 6.1 ], [ 1.5, 1.1, - 4.0 ] ],
	above: [ [ 4.2, 3.4, - 5.2 ], [ 1.6, 0.6, - 4.0 ] ],
	astern: [ [ 0.4, 5.2, - 15 ], [ 0.6, 1.4, - 3.2 ] ],
};
const HELM = {
	behind: [ [ 0.75, 4.65, - 1.35 ], [ 0, 3.95, 0.3 ] ],
	side: [ [ 1.45, 4.25, 0.25 ], [ 0, 3.85, 0.2 ] ],
	bow: [ [ 4.6, 5.4, 3.2 ], [ 0, 3.9, 0.1 ] ],
};

await frames( 6 );
const before = await held( 'before he\'s hired' );
log( JSON.stringify( { ...before, keys: undefined } ) );

// a fish on, you on her deck: he takes her helm and backs her down on it (staged 300 m astern of her, never closer); and off
const fishOn = () => page.evaluate( () => {

	const a = window.__app, g = a.game, b = a.boatCtl, V = b.position.constructor, at = new V();
	g.mate._fishAt = ( out ) => {

		const yaw = b.getYaw();
		return { at: out.copy( at.set( b.position.x - Math.sin( yaw ) * 300, 0, b.position.z - Math.cos( yaw ) * 300 ) ), distance: 300, landAt: 3 };

	};

} ).then( () => page.waitForFunction( () => window.__app.boatCtl.helmsman === 'mate', null, { timeout: 120000, polling: 200 } ) );
const fishOff = () => page.evaluate( () => {

	delete window.__app.game.mate._fishAt;

} ).then( () => page.waitForFunction( () => window.__app.boatCtl.helmsman !== 'mate', null, { timeout: 120000, polling: 200 } ) );

// hired: aboard, the stand-in while his look's held back (App.loadPerson made to wait), in her cockpit and at her helm
await page.evaluate( () => {

	const a = window.__app, g = a.game, load = a.loadPerson.bind( a );
	a.loadPerson = async ( ...args ) => {

		await new Promise( ( go ) => {

			const t = setInterval( () => window.__letLoad && ( clearInterval( t ), go() ), 200 );

		} );
		return load( ...args );

	};
	g.state.upgrades.sfMate = 1;
	g.applyGear();

} );
await frames( 2 );
const first = await page.evaluate( () => {

	const h = window.__app.game.mate.hand;
	return { where: window.__app.game.mate.where, standIn: !! ( h && h.standIn ), look: !! ( h && h.character ) };

} );
log( 'hired:', JSON.stringify( first ) );
await shot( 'stand-in-cockpit', COCKPIT.quarter );
await fishOn();
await frames( 4 );
await shot( 'stand-in-helm', HELM.side );
await fishOff();
// then his look
await page.evaluate( () => ( window.__letLoad = true ) );
await page.waitForFunction( () => { const h = window.__app.game.mate.hand; return h && h.character; }, null, { timeout: 600000, polling: 500 } );
log( 'his look in' );
await frames( 6 );
const after = await held( 'his look in, drawn' );
log( JSON.stringify( { ...after, keys: undefined } ), 'new programs:', JSON.stringify( after.keys.filter( ( k ) => ! before.keys.includes( k ) ) ) );
for ( const [ k, c ] of Object.entries( COCKPIT ) ) await shot( `cockpit-${ k }`, c );
const drawsCockpit = await draws( COCKPIT.quarter );
log( 'draws, cockpit:', JSON.stringify( drawsCockpit ) );

// at her helm, backing her down
await fishOn();
await frames( 10 );
for ( const [ k, c ] of Object.entries( HELM ) ) await shot( `helm-${ k }`, c );
const drawsHelm = await draws( HELM.behind );
log( 'draws, helm:', JSON.stringify( drawsHelm ) );
// (where his hands are against her wheel's rim: the clip's hands, world, into her frame)
const hands = await page.evaluate( () => {

	const a = window.__app, h = a.game.mate.hand, G = a.boat.group, V = G.position.constructor;
	if ( ! h || ! h.character ) return null;
	const find = ( re ) => {

		let f = null;
		h.character.group.traverse( ( o ) => {

			if ( ! f && o.isBone && re.test( o.name ) ) f = o;

		} );
		return f;

	};

	G.updateMatrixWorld( true );
	const w = a.boat._wheels && a.boat._wheels[ 0 ], c = new V(), q = new V(), grips = a.boat.mateSpot.helm.grips;
	if ( w ) c.setFromMatrixPosition( w );
	const out = { wheel: c.toArray().map( ( v ) => +v.toFixed( 3 ) ) };
	for ( const [ k, re, n ] of [ [ 'right', /R_?Hand$/, 0 ], [ 'left', /L_?Hand$/, 1 ] ] ) {

		const bone = find( re );
		if ( ! bone ) continue;
		G.worldToLocal( bone.getWorldPosition( q ) );
		out[ k ] = q.toArray().map( ( v ) => +v.toFixed( 3 ) );
		out[ k + 'FromGrip' ] = +q.distanceTo( grips[ n ] ).toFixed( 3 ); // (the wrist, GRIP_SHORT shy of the rim)

	}

	return out;

} );
log( 'his hands and her wheel (her frame):', JSON.stringify( hands ) );

// the fish off: handed back, in her cockpit again
await fishOff();
await frames( 6 );
await shot( 'back-quarter', COCKPIT.quarter );

const report = { tier: TIER, before: { ...before, keys: undefined }, after: { ...after, keys: undefined }, newPrograms: after.keys.filter( ( k ) => ! before.keys.includes( k ) ), scriptMB: +( after.heapMB - before.heapMB ).toFixed( 2 ), programs: after.programs - before.programs, textures: after.textures - before.textures, geometries: after.geometries - before.geometries, drawsCockpit, drawsHelm, hands, errors: errors.slice( 0, 12 ) };
writeFileSync( join( OUT, 'report.json' ), JSON.stringify( report, null, '\t' ) );
log( JSON.stringify( report ) );
await browser.close();
