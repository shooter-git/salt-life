// (M16) How long a load takes, coming back far out against coming back at home, in each boat: the time to 'load: ready' in a cold browser (a new context,
// nothing cached), upright at a phone's size, low tier. Far and home taken turn about, so a busy machine's load falls on both alike.
//   tools/render-slot.sh node tools/two-players/resume-load.mjs [url] [rounds] [boats: kayak,console,...]
import { launch, BOAT_IDS } from './resume-lib.mjs';
const [ url = 'http://127.0.0.1:5222', ROUNDS = '3', BOATS = BOAT_IDS.join() ] = process.argv.slice( 2 );
const browser = await launch();
const FAR = { x: - 3891, z: 5939, a: [ - 3891, 5943.4 ] };

const once = async ( boat, far ) => {

	const ctx = await browser.newContext( { viewport: { width: 390, height: 844 }, isMobile: false } );
	await ctx.addInitScript( ( [ boat, far, FAR ] ) => {

		if ( window.parent !== window || localStorage.getItem( '__seeded' ) ) return;
		localStorage.setItem( '__seeded', '1' );
		const at = Date.now(), put = ( k, v ) => localStorage.setItem( `ats-standalone:personal:${ k }`, JSON.stringify( { value: v, schemaVersion: 1, version: 1 } ) );
		const tracks = { kayak: 'kayakAnchor', console: 'deepAnchor_console', lobster: 'deepAnchor_lobster', sportfisher: 'deepAnchor_sportfisher' };
		put( 'progress', { v: 2, boat, fleet: { [ boat ]: { fuel: null, hull: 0, hauled: false, name: null, paint: null, paid: 0 } }, earned: true, money: 500, inventory: [], log: {}, places: {}, found: {}, upgrades: { [ tracks[ boat ] ]: 1 }, fuel: null, hull: 0, hauled: false, nextId: 1 } );
		put( 'clock', { hour: 11, day: 3, held: false, at } );
		if ( far ) put( 'boat', { v: 1, boat, x: FAR.x, z: FAR.z, h: 0, anchor: FAR.a, moored: false, aboard: boat === 'kayak' ? 'helm' : 'deck', T: 59, at } );

	}, [ boat, far, FAR ] );
	const page = await ctx.newPage();
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message.slice( 0, 160 ) ) );
	await page.goto( `${ url }/?tier=low`, { timeout: 200000 } );
	await page.waitForFunction( () => performance.getEntriesByName( 'load: ready' ).length > 0, null, { timeout: 200000, polling: 100 } );
	const r = await page.evaluate( () => {

		const a = window.__app, b = a.boatCtl, marks = Object.fromEntries( performance.getEntriesByType( 'mark' ).filter( ( m ) => m.name.startsWith( 'load:' ) ).map( ( m ) => [ m.name.slice( 6 ), Math.round( m.startTime ) ] ) );
		return { ready: marks.ready, marks, at: [ Math.round( b.position.x ), Math.round( b.position.z ) ], mode: a.player.mode, boat: a.boat.id };

	} );
	await ctx.close();
	return { ...r, errors };

};

const all = {};
for ( let i = 0; i < + ROUNDS; i ++ ) for ( const boat of BOATS.split( ',' ) ) for ( const far of i % 2 ? [ true, false ] : [ false, true ] ) {

	const r = await once( boat, far ), k = `${ boat } ${ far ? 'far' : 'home' }`;
	( all[ k ] = all[ k ] || [] ).push( r.ready );
	console.log( k, r.ready, 'ms', JSON.stringify( r.at ), r.mode, r.boat, r.errors.length ? r.errors : '' );

}

for ( const [ k, l ] of Object.entries( all ) ) console.log( k.padEnd( 20 ), 'best', Math.min( ...l ), 'median', [ ...l ].sort( ( a, b ) => a - b )[ l.length >> 1 ], JSON.stringify( l ) );
await browser.close();
