#!/usr/bin/env node
// (M15) The Fish Hold's every tab and the catch card, at every screen size: what doesn't fit, measured, and a picture of
// each. Its lists scrolling is fine; what it reports is what's cut off, out of its panel or squashed. Some of that's by
// design: the room list scrolls sideways, the room meter's new part runs past a full hold, the badge is rotated.
//
//   pnpm dev, then   node tools/ui-fit.mjs <dir for the pictures> [port, 5189] [screens, comma separated]
//   CARDS=plain node tools/ui-fit.mjs ...     (the plain card alone: the others are record and noroom)

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const { chromium } = await import( join( ROOT, '../all-the-spaces/node_modules/playwright/index.mjs' ) );
const [ out, PORT = '5189', only = '' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const SCREENS = [ [ 'laptop-1366', 1366, 768, false ], [ 'desktop-1920', 1920, 1080, false ], [ 'small-1024', 1024, 640, false ], [ 'phone-390', 390, 844, true ], [ 'phone-360', 360, 640, true ], [ 'phone-320', 320, 568, true ], [ 'side-844', 844, 390, true ], [ 'side-667', 667, 375, true ], [ 'tablet-768', 768, 1024, true ], [ 'tablet-1024', 1024, 768, true ] ].filter( ( s ) => ! only || only.split( ',' ).includes( s[ 0 ] ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
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
		// (squashed: a button or a line of text less wide than one short word, or flex items narrower than their words)
		if ( e.children.length === 0 && e.textContent.trim().length > 2 && cs.display !== 'inline' ) {

			const lh = parseFloat( cs.lineHeight ) || parseFloat( cs.fontSize ) * 1.2;
			const lines = Math.round( r.height / lh );
			if ( lines >= 4 && r.width < 90 ) bad.push( `squashed to ${ lines } lines in ${ Math.round( r.width ) } px: ${ label( e ) }` );

		}

	}

	const list = root.querySelector( '.gm-list' ), foot = root.querySelector( '.gm-foot' );
	const facts = { panel: [ Math.round( R.width ), Math.round( R.height ) ] };
	if ( list ) { const L = list.getBoundingClientRect(); facts.list = Math.round( L.height ); if ( L.height < 90 ) bad.push( `its list only ${ Math.round( L.height ) } px tall` ); }
	if ( foot ) { const fr = foot.getBoundingClientRect(); if ( fr.bottom > H + 1 ) bad.push( 'its foot off the screen' ); }
	return { facts, bad: [ ...new Set( bad ) ].slice( 0, 12 ) };

};
for ( const [ name, w, h, touch ] of SCREENS ) {

	const ctx = await browser.newContext( { viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 } );
	const page = await ctx.newPage();
	page.on( 'pageerror', ( e ) => console.log( name, 'PAGEERROR', e.message.slice( 0, 200 ) ) );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=low&hour=10&weather=fair&day=5`, { waitUntil: 'domcontentloaded', timeout: 180000 } );
	await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game.hud, null, { timeout: 300000, polling: 500 } );
	await page.evaluate( () => {

		const a = window.__app, g = a.game, s = g.state;
		if ( g.guide ) { g.guide.seen.intro = true; if ( g.guide.open ) g.guide.close(); g.guide._wait = - 1; }
		s.upgrades.hold = 2;
		s.money = 12345;
		const kinds = [ 'yellowtail_snapper', 'great_barracuda', 'pompano', 'permit', 'snook', 'mahi', 'yellowfin_tuna', 'nassau_grouper', 'lobster', 'mullet', 'parrotfish', 'hogfish', 'silk_snapper', 'wahoo' ];
		window.__kinds = [];

	} );
	const species = await page.evaluate( async () => Object.keys( ( await import( '/src/game/FishTable.js' ) ).FISH ) );
	await page.evaluate( ( species ) => {

		const a = window.__app, g = a.game, s = g.state, pl = [ 'northBeach', 'windReef', 'bank', 'blue', 'bay', 'creek' ];
		species.slice( 0, 30 ).forEach( ( id, i ) => { try { s.addFish( id, 1.5 + i * 0.7, 10, { place: pl[ i % pl.length ], day: 5 } ); } catch ( e ) { console.log( 'no', id ); } } );
		s.save && s.save();

	}, species );
	const tabs = await page.evaluate( () => { const h = window.__app.game.hud; h.toggleInventory( true ); h.renderInventory(); return h._invTabs; } );
	console.log( `\n== ${ name } ${ w }x${ h }${ touch ? ' touch' : '' } tabs: ${ tabs }` );
	for ( const t of tabs ) {

		await page.evaluate( ( t ) => window.__app.game.hud.showTab( t ), t );
		await page.waitForTimeout( 2500 );
		const m = await page.evaluate( MEASURE, '.gm-panel.is-open' );
		console.log( `  ${ t.padEnd( 8 ) } ${ JSON.stringify( m.facts || m ) } ${ m.bad && m.bad.length ? '\n      ' + m.bad.join( '\n      ' ) : '' }` );
		await page.screenshot( { path: `${ out }/${ name }-${ t }.png`, timeout: 90000 } ).catch( () => console.log( 'shot failed', name, t ) );

	}

	await page.evaluate( () => window.__app.game.hud.toggleInventory( false ) );
	// the catch card: the plain one, a record's, and one with no room for it (its list of what to let go)
	for ( const tag of ( process.env.CARDS || 'plain,record,noroom' ).split( ',' ) ) {

		await page.evaluate( ( tag ) => {

			const g = window.__app.game, s = g.state, H = g.hud;
			if ( H.catchOpen ) H.hideCatch();
			const inv = s.inventory.slice();
			if ( tag !== 'noroom' ) s.inventory.length = 0;
			if ( tag === 'plain' ) { s.addFish( 'yellowtail', 0.9, 10, { place: 'bay', day: 5 } ); s.addFish( 'yellowtail', 0.8, 10, { place: 'bay', day: 5 } ); }
			if ( tag === 'record' ) s.addFish( Object.keys( s.log )[ 4 ] || 'yellowtail', 60, 10, { place: 'windReef', day: 5 } );
			if ( tag === 'noroom' ) { for ( let i = 0; i < 8; i ++ ) s.addFish( 'yellowtail', 25, 10, { place: 'bay', day: 5 } ); s.addFish( Object.keys( s.log )[ 2 ] || 'yellowtail', 40, 10, { place: 'bay', day: 5 } ); }
			H.showCatch( s.lastCatch, 60000 );
			window.__card = { kept: s.lastCatch.kept, species: s.lastCatch.species, room: !! s.roomFor( s.lastCatch ) };

		}, tag ).catch( ( e ) => console.log( 'card', tag, e.message.slice( 0, 220 ) ) );
		await page.waitForTimeout( 14000 );
		const m = await page.evaluate( MEASURE, '.gm-catch.is-on' );
		console.log( `  card ${ tag.padEnd( 7 ) } ${ JSON.stringify( await page.evaluate( () => window.__card ) ) } ${ JSON.stringify( m.facts || m ) } ${ m.bad && m.bad.length ? '\n      ' + m.bad.join( '\n      ' ) : '' }` );
		await page.screenshot( { path: `${ out }/${ name }-card-${ tag }.png`, timeout: 90000 } ).catch( () => console.log( 'shot failed', name, 'card', tag ) );

	}

	await ctx.close();

}
await browser.close();
