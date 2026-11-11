#!/usr/bin/env node
// (v2.4.1) The fish box's bars at the top, and the Fish hold panel, staged in the three boxes that matter and shot at
// each screen: her big box full of ice with two small fish in it (a player's screenshot: "Hold 1323 / 1323 lb" in red),
// the same with her icemaker keeping up, a kayak's cooler running low, and riding along in someone else's hold (her
// box as her owner's game would tell it: DaysOut.her stood in for; tools/two-players/crew.mjs box rides along for real).
// Prints what each says, and where the purse and the panel are.
//
//   dev server up, then   node tools/box-bars.mjs <dir for the pictures> [port, 5189] [screens, comma separated]
//   CASES=icebox,cooler node tools/box-bars.mjs ...      (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces)

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ out, PORT = '5189', only = '' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
// name, width, height, touch, device
const SCREENS = [ [ 'phone-390', 390, 844, true, 'touch' ], [ 'side-844', 844, 390, true, 'touch' ], [ 'narrow-390-keys', 390, 844, false, 'keyboard' ], [ 'narrow-390-pad', 390, 844, false, 'gamepad' ], [ 'laptop-1366', 1366, 768, false, 'keyboard' ] ].filter( ( s ) => ! only || only.split( ',' ).includes( s[ 0 ] ) );
const CASES = ( process.env.CASES || 'icebox,icemaker,cooler,riding' ).split( ',' );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );

// in the page: the case staged
const STAGE = async ( tag ) => {

	const a = window.__app, g = a.game, s = g.state, p = a.player, d = g.daysOut;
	delete d.her; // (the riding case's stand-in, gone)
	s.money = 12345;
	const ashore = () => {

		if ( p.mode === 'boat' && p.leaveHelm ) p.leaveHelm();
		if ( p.mode === 'boat' || p.mode === 'deck' ) p.exitBoat( null, 1 );
		if ( p.mode !== 'walk' ) { p.mode = 'walk'; p.position.set( 60, 2, - 70 ); }

	};

	const take = async ( id ) => {

		if ( s.boat !== id ) {

			ashore();
			if ( ! s.owns( id ) ) s.addBoat( id );
			if ( ! await a.setBoat( id ) ) throw new Error( `not in her: ${ id }, ${ p.mode }` );

		}

		if ( p.mode !== 'boat' && p.mode !== 'deck' ) p.boardBoat();

	};

	const fish = ( list ) => {

		s.inventory.length = 0;
		for ( const [ sp, kg ] of list ) s.addFish( sp, kg, 10, { place: 'bay', day: g.tradeDay } );
		d._stamp();

	};

	if ( tag === 'icebox' || tag === 'icemaker' ) {

		await take( 'sportfisher' );
		s.upgrades.sfFishBox = 1;
		s.upgrades.sfIcemaker = tag === 'icemaker' ? 1 : 0;
		s.upgrades.sfGenerator = 0;
		g.applyGear();
		fish( [ [ 'muttonSnapper', 3 ], [ 'muttonSnapper', 3 ] ] );
		d.box.ice = s.stats.holdKg - s.holdKg; // (full: an icemaker filled it)
		d.box.stores = tag === 'icemaker' ? 2.5 : 0; // (a few days' stores aboard: their gauge with the boat's, on a computer)

	} else if ( tag === 'cooler' ) {

		await take( 'kayak' );
		s.upgrades.kayakCrate = 1;
		g.applyGear();
		fish( [ [ 'graySnapper', 2.2 ], [ 'graySnapper', 2.0 ], [ 'yellowtail', 1.4 ] ] );
		d.box.ice = 0.9;

	} else if ( tag === 'riding' ) {

		await take( 'kayak' );
		s.upgrades.kayakCrate = 1;
		g.applyGear();
		const { meltKgH } = await import( '/src/game/Seaworthy.js' );
		const her = { cap: 600, ice: 150, melt: meltKgH( 600, true ), makes: 0, others: 35, word: 'hold', whose: 'Robin', by: [ { name: 'Robin', n: 3, kg: 35 } ] };
		Object.defineProperty( d, 'her', { configurable: true, get: () => her } );
		fish( [ [ 'mahi', 8 ] ] );

	}

	s.emit();
	g.hud.drawHold();
	d.showGauges();
	const b = s.box();
	return { boat: s.boat, cap: b.cap, ice: +b.ice.toFixed( 2 ), melt: +b.melt.toFixed( 3 ), makes: b.makes, others: b.others, mine: +s.holdKg.toFixed( 2 ), whose: b.whose };

};

const LOOK = () => {

	const r = ( e ) => { if ( ! e ) return null; const q = e.getBoundingClientRect(); return [ q.left, q.top, q.right, q.bottom ].map( Math.round ); };
	const purse = document.querySelector( '.gm-purse' ), money = document.querySelector( '.gm-money' );
	const shown = ( e ) => e && getComputedStyle( e ).display !== 'none' && e.getBoundingClientRect().width > 0;
	const gauges = [ ...purse.querySelectorAll( '.gm-cooler, .gm-gauge, .gm-hold, .gm-ice' ) ].filter( shown ).map( ( e ) => `${ e.className.replace( /gm-gauge |is-on ?/g, '' ).trim() }: ${ e.textContent.trim().replace( /\s+/g, ' ' ) }${ e.classList.contains( 'is-full' ) || e.classList.contains( 'is-low' ) ? ' [coral]' : '' } ${ JSON.stringify( r( e ) ) }` );
	return { purse: r( purse ), money: r( money ), gauges };

};

for ( const [ name, w, h, touch, device ] of SCREENS ) {

	const ctx = await browser.newContext( { viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 } );
	const page = await ctx.newPage();
	page.on( 'pageerror', ( e ) => console.log( name, 'PAGEERROR', e.message.slice( 0, 200 ) ) );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=low&hour=10&weather=fair&day=5`, { waitUntil: 'domcontentloaded', timeout: 180000 } );
	await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game.hud, null, { timeout: 300000, polling: 500 } );
	await page.evaluate( ( device ) => {

		const a = window.__app, g = a.game;
		if ( g.guide ) { g.guide.seen.intro = true; if ( g.guide.open ) g.guide.close(); g.guide._wait = - 1; }
		// (the clock all but stopped: the ice the same from one shot to the next)
		const c = a.together && a.together._clock;
		if ( c ) a.together._clock = { ...c, at: Date.now(), speed: 0.0001 };
		a.settings.timeSpeed = 0.0001;
		if ( device !== 'touch' ) a.input.lastDevice = device;

	}, device );
	console.log( `\n== ${ name } ${ w }x${ h } ${ device }` );
	for ( const tag of CASES ) {

		const box = await page.evaluate( STAGE, tag ).catch( ( e ) => ( { error: e.message.slice( 0, 300 ) } ) );
		await page.evaluate( ( device ) => { const a = window.__app; if ( device !== 'touch' ) a.input.lastDevice = device; if ( a.game.guide.open ) a.game.guide.close(); }, device );
		await page.waitForTimeout( 2500 );
		const look = await page.evaluate( LOOK );
		console.log( `  ${ tag.padEnd( 9 ) } ${ JSON.stringify( box ) }\n    purse ${ JSON.stringify( look.purse ) } money ${ JSON.stringify( look.money ) }\n    ${ look.gauges.join( '\n    ' ) }` );
		const top = Math.min( h, Math.max( 140, ( look.purse ? look.purse[ 3 ] : 100 ) + 24 ) );
		await page.screenshot( { path: `${ out }/${ name }-${ tag }-top.png`, clip: { x: 0, y: 0, width: w, height: top }, timeout: 90000 } ).catch( () => console.log( 'shot failed', name, tag ) );
		await page.evaluate( () => { const H = window.__app.game.hud; H.toggleInventory( true ); H.showTab( 'fish' ); } );
		await page.waitForTimeout( 2500 );
		const panel = await page.evaluate( () => { const i = document.querySelector( '.gm-panel.is-open' ), r = i && i.getBoundingClientRect(), l = i && i.querySelector( '.gm-list' ); return i ? { title: i.querySelector( 'h2' ).textContent, sub: i.querySelector( '.gm-head .gm-sub' ).textContent.replace( /\s+/g, ' ' ).trim(), rect: [ r.left, r.top, r.right, r.bottom ].map( Math.round ), list: l ? Math.round( l.getBoundingClientRect().height ) : null } : null; } );
		console.log( `    panel ${ JSON.stringify( panel ) }` );
		await page.screenshot( { path: `${ out }/${ name }-${ tag }-panel.png`, timeout: 90000 } ).catch( () => console.log( 'shot failed', name, tag, 'panel' ) );
		await page.evaluate( () => window.__app.game.hud.toggleInventory( false ) );

	}

	await ctx.close();

}

await browser.close();
