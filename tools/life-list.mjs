#!/usr/bin/env node
// (M17, stream 7) The cooler's Log tab as a life list, at a phone's width, with all 39 kinds in it: 23 caught (their firsts and
// bests with the day and the place, three from an old save with neither), 16 still to catch (each with where to look), two
// slams had and one to have with today's tally, three billfish let go; and the catch card of a slam's last fish. What
// doesn't fit is measured as tools/ui-fit.mjs does (cut off, out of its panel, squashed), the rows' text sizes read, and a
// picture taken of each part of the list, scrolled down it by the "still to catch" button and by hand.
//
//   a dev server, then   node tools/life-list.mjs <dir for the pictures> [port, 5189] [screens: phone-390,phone-320,...]

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const SPACES = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( SPACES, 'node_modules/playwright/index.mjs' ) );
const [ out, PORT = '5189', only = '' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const SCREENS = [ [ 'phone-390', 390, 844 ], [ 'phone-320', 320, 568 ], [ 'side-844', 844, 390 ] ].filter( ( s ) => ! only || only.split( ',' ).includes( s[ 0 ] ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );

// what's cut off, out of its panel or squashed (tools/ui-fit.mjs' measure, its lists' scrolling allowed)
const MEASURE = ( rootSel ) => {

	const root = document.querySelector( rootSel );
	if ( ! root ) return { missing: true };
	const R = root.getBoundingClientRect(), W = innerWidth, H = innerHeight, bad = [];
	const label = ( e ) => `${ e.tagName.toLowerCase() }.${ String( e.className ).split( ' ' )[ 0 ] }:"${ ( e.textContent || '' ).trim().replace( /\s+/g, ' ' ).slice( 0, 34 ) }"`;
	if ( R.left < - 1 || R.top < - 1 || R.right > W + 1 || R.bottom > H + 1 ) bad.push( `the panel off the screen: ${ [ R.left, R.top, R.right, R.bottom ].map( Math.round ) } of ${ W }x${ H }` );
	const scrollers = new Set();
	for ( const e of root.querySelectorAll( '*' ) ) { const cs = getComputedStyle( e ); if ( /auto|scroll/.test( cs.overflowY ) || /auto|scroll/.test( cs.overflowX ) ) scrollers.add( e ); }
	for ( const e of root.querySelectorAll( '*' ) ) {

		const cs = getComputedStyle( e );
		if ( cs.display === 'none' || cs.visibility === 'hidden' || e.tagName === 'KBD' ) continue;
		const r = e.getBoundingClientRect();
		if ( ! r.width || ! r.height ) continue;
		const sc = [ ...scrollers ].some( ( q ) => q.contains( e ) && q !== e );
		if ( ! scrollers.has( e ) && e.scrollWidth > e.clientWidth + 2 && cs.display !== 'inline' && /hidden|clip/.test( cs.overflowX ) ) bad.push( `cut off (${ e.scrollWidth } in ${ e.clientWidth }): ${ label( e ) }` );
		if ( ! sc && ( r.right > R.right + 1 || r.left < R.left - 1 || r.bottom > R.bottom + 1 || r.top < R.top - 1 ) ) bad.push( `out of its panel: ${ label( e ) }` );
		if ( sc ) { const q = [ ...scrollers ].find( ( q ) => q.contains( e ) && q !== e ), Q = q.getBoundingClientRect(); if ( r.right > Q.right + 1 || r.left < Q.left - 1 ) bad.push( `wider than its list: ${ label( e ) }` ); }
		if ( e.children.length === 0 && e.textContent.trim().length > 2 && cs.display !== 'inline' ) {

			const lh = parseFloat( cs.lineHeight ) || parseFloat( cs.fontSize ) * 1.2;
			if ( Math.round( r.height / lh ) >= 4 && r.width < 90 ) bad.push( `squashed to ${ Math.round( r.height / lh ) } lines in ${ Math.round( r.width ) } px: ${ label( e ) }` );

		}

	}

	return { panel: [ Math.round( R.width ), Math.round( R.height ) ], bad: [ ...new Set( bad ) ].slice( 0, 12 ) };

};

// the list's rows: how many, the text sizes (CSS px) of the names and the lines under them, and the lines' colour
const ROWS = () => {

	const list = document.querySelector( '.gm-panel.is-open .gm-list' ), px = ( e ) => e ? +parseFloat( getComputedStyle( e ).fontSize ).toFixed( 1 ) : null;
	const caught = [ ...list.querySelectorAll( '.gm-item:not(.is-left)' ) ], left = [ ...list.querySelectorAll( '.gm-item.is-left' ) ];
	const head = list.querySelector( '.gm-life' );
	return { head: head && head.textContent.replace( /\s+/g, ' ' ).trim(), rows: caught.length, left: left.length, heads: [ ...list.querySelectorAll( '.gm-list-h, .gm-wanted-h' ) ].map( ( h ) => h.textContent ),
		name: px( caught[ 0 ] && caught[ 0 ].querySelector( '.gm-item-name' ) ), meta: px( caught[ 0 ] && caught[ 0 ].querySelector( '.gm-item-meta' ) ), num: px( list.querySelector( '.gm-item-num' ) ),
		leftName: px( left[ 0 ] && left[ 0 ].querySelector( '.gm-item-name' ) ), leftMeta: px( left[ 0 ] && left[ 0 ].querySelector( '.gm-item-meta' ) ),
		leftColour: left[ 0 ] && getComputedStyle( left[ 0 ].querySelector( '.gm-item-name' ) ).color, panelBg: getComputedStyle( document.querySelector( '.gm-panel.is-open' ) ).backgroundColor,
		scroll: [ list.scrollTop, list.scrollHeight, list.clientHeight ] };

};

for ( const [ name, w, h ] of SCREENS ) {

	const ctx = await browser.newContext( { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } );
	const page = await ctx.newPage();
	page.on( 'pageerror', ( e ) => console.log( name, 'PAGEERROR', e.message.slice( 0, 200 ) ) );
	page.on( 'console', ( m ) => { if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource/.test( m.text() ) ) console.log( name, 'CONSOLE', m.text().slice( 0, 200 ) ); } );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=low&hour=10&weather=fair&day=30`, { waitUntil: 'domcontentloaded', timeout: 180000 } );
	await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game.hud, null, { timeout: 600000, polling: 500 } );
	// a player well along: 23 of the 39 caught over a month, three from an old save, two slams had, one partway today
	const seeded = await page.evaluate( () => {

		const a = window.__app, g = a.game, s = g.state, set = a.settings;
		if ( g.guide ) { g.guide.seen.intro = true; if ( g.guide.open ) g.guide.close(); g.guide._wait = - 1; }
		s.save = () => {};
		const had = [ [ 'mullet', 1.2, 'bay' ], [ 'grunt', 0.8, 'bay' ], [ 'yellowtail', 1.3, 'windReef' ], [ 'sergeant', 0.25, 'bay' ], [ 'jack', 6.4, 'bay' ], [ 'barracuda', 9.8, 'coast' ],
			[ 'tuna', 11.2, 'dropoff' ], [ 'mahi', 14.5, 'blue' ], [ 'wahoo', 31, 'dropoff' ], [ 'sailfish', 33, 'dropoff' ], [ 'whiteMarlin', 29, 'dropoff' ], [ 'blueMarlin', 182, 'blue' ],
			[ 'tarpon', 28, 'creek' ], [ 'graySnapper', 1.9, 'creek' ], [ 'bonefish', 2.6, 'coast' ], [ 'pompano', 1.7, 'northBeach' ], [ 'permit', 9.4, 'northBeach' ], [ 'redfish', 5.5, 'creek' ],
			[ 'trout', 1.4, 'bay' ], [ 'lobster', 1.1, 'bay' ], [ 'muttonSnapper', 4.2, 'windReef' ], [ 'silkSnapper', 2.1, 'ledge' ], [ 'whiteMullet', 0.4, 'bay' ] ];
		had.forEach( ( [ k, kg, place ], i ) => {

			s.addFish( k, kg * 0.7, 9, { day: 1 + i, place } );
			s.addFish( k, kg, 9, { day: 4 + i, place } );

		} );
		// (three from an old save: no day or place for their first or their best)
		for ( const k of [ 'mullet', 'grunt', 'sergeant' ] ) { const v = s.log[ k ]; delete v.first; delete v.bestDay; delete v.bestAt; }
		for ( const k of [ 'sailfish', 'whiteMarlin', 'blueMarlin' ] ) s.trophies[ k ] = { n: 2, kg: s.log[ k ].bestKg, cm: s.log[ k ].bestCm, day: 17, place: k === 'blueMarlin' ? 'blue' : 'dropoff', tagged: k === 'sailfish' };
		s.trophies[ 'slam:grand' ] = { n: 2, first: 14, day: 22, place: 'coast', kinds: { bonefish: 2.6, permit: 9.4, tarpon: 28 } };
		s.trophies[ 'slam:billfish' ] = { n: 1, first: 17, day: 17, place: 'blue', kinds: { sailfish: 33, whiteMarlin: 29, blueMarlin: 182 } };
		const day = set.timeOfDay < 5.8 ? set.day - 1 : set.day;
		s.trophies.today = { day, got: { bonefish: { kg: 2.1, place: 'coast' }, permit: { kg: 8, place: 'coast' } }, done: {} };
		s.inventory.length = 0;
		const H = g.hud;
		H.invTab = 'log';
		H.toggleInventory( true );
		H.renderInventory();
		return { kinds: Object.keys( s.log ).length };

	} );
	await page.waitForTimeout( 2500 );
	const m = await page.evaluate( MEASURE, '.gm-panel.is-open' );
	const rows = await page.evaluate( ROWS );
	console.log( `\n== ${ name } ${ w }x${ h } ${ JSON.stringify( seeded ) }\n  panel ${ JSON.stringify( m.panel ) } ${ m.bad && m.bad.length ? '\n      ' + m.bad.join( '\n      ' ) : 'nothing cut off or out of it' }\n  rows ${ JSON.stringify( rows ) }` );
	await page.screenshot( { path: `${ out }/${ name }-log-1-top.png`, timeout: 120000 } );
	// down the list a screen at a time, to its end
	for ( let i = 2; i < 12; i ++ ) {

		const more = await page.evaluate( () => { const l = document.querySelector( '.gm-panel.is-open .gm-list' ), was = l.scrollTop; l.scrollTop += l.clientHeight - 30; return l.scrollTop > was; } );
		if ( ! more ) break;
		await page.waitForTimeout( 400 );
		await page.screenshot( { path: `${ out }/${ name }-log-${ i }.png`, timeout: 120000 } );

	}

	// the "still to catch" button: down to their list
	const jumped = await page.evaluate( () => {

		const l = document.querySelector( '.gm-panel.is-open .gm-list' );
		l.scrollTop = 0;
		document.querySelector( '[data-left]' ).click();
		const hd = l.querySelector( '.gm-left-h' );
		return { scrollTop: Math.round( l.scrollTop ), headAt: Math.round( hd.getBoundingClientRect().top - l.getBoundingClientRect().top ) };

	} );
	console.log( `  "still to catch" button: the list at ${ jumped.scrollTop } px, its head ${ jumped.headAt } px from the list's top` );
	await page.waitForTimeout( 400 );
	await page.screenshot( { path: `${ out }/${ name }-log-left.png`, timeout: 120000 } );
	// the catch card: a snook that makes the super grand slam (the bonefish, the permit and a tarpon had today)
	await page.evaluate( () => {

		const g = window.__app.game, s = g.state, H = g.hud;
		H.toggleInventory( false );
		s.addFish( 'snook', 6.2, 7, { day: 30, place: 'creek' } );
		s.lastCatch.slams = [ 'grand', 'superGrand' ];
		H.showCatch( s.lastCatch, 60000 );

	} );
	await page.waitForTimeout( 14000 );
	const c = await page.evaluate( MEASURE, '.gm-catch.is-on' );
	const card = await page.evaluate( () => ( { badge: document.querySelector( '.gm-catch .gm-badge' ).textContent, slam: ( document.querySelector( '.gm-catch-note.is-slam' ) || {} ).textContent, note: [ ...document.querySelectorAll( '.gm-catch-note' ) ].pop().textContent } ) );
	console.log( `  card ${ JSON.stringify( card ) } ${ JSON.stringify( c.panel ) } ${ c.bad && c.bad.length ? '\n      ' + c.bad.join( '\n      ' ) : 'nothing cut off or out of it' }` );
	await page.screenshot( { path: `${ out }/${ name }-card-slam.png`, timeout: 120000 } );
	await ctx.close();

}

await browser.close();
