// Plain-node tests of SaveStore (core/SaveStore.js): what you've caught and done outlasts leaving. Against a
// stand-in for All the Spaces' saves that, like the real one, takes a while to answer and turns down a
// write made on a version that's since moved on (StaleSaveError):
//   - its own writes never clash: one at a time, whatever changes while one's out written by the next
//     (two out at once, the second on the first's old version, was turned down, and it stopped saving for
//     the rest of the visit: a hold full of fish gone)
//   - the app covering it (pause: a tab hidden, the app gone to the background) writes it then
//   - leaving writes the last of it, after any write already out
//   - saved from somewhere else meanwhile (another device): it stops, and keeps that one
//   node test/save-store.mjs
import { register } from 'node:module';

// (the SDK is TypeScript node won't load: its StaleSaveError, stood in for)
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {

	if ( specifier === '@allthespaces/portal' ) return { url: 'data:text/javascript,export class StaleSaveError extends Error {}', shortCircuit: true };
	return next( specifier, context );

}` ) );
const { SaveStore } = await import( '../src/core/SaveStore.js' );
const { StaleSaveError } = await import( '@allthespaces/portal' );

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};
const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

// All the Spaces' saves, as the SDK sees them: each write `latency` ms out, and turned down when the
// version it was made on (the last read or written here) isn't the saved one's
class Portal {

	constructor( latency ) {

		const server = this.server = new Map(), versions = new Map();
		this.exits = [];
		this.events = {};
		this.writes = 0;
		this.save = { personal: {

			async get( key ) {

				const e = server.get( key );
				versions.set( key, e ? e.version : null );
				return e ? e.value : null;

			},
			set: async ( key, value ) => {

				const basedOn = versions.get( key ) ?? null;
				this.writes ++;
				await sleep( latency );
				const now = server.get( key ), at = now ? now.version : null;
				if ( at !== basedOn ) throw new StaleSaveError();
				server.set( key, { value, version: ( at || 0 ) + 1 } );
				versions.set( key, ( at || 0 ) + 1 );

			},

		} };

	}

	onExit( fn ) { this.exits.push( fn ); }
	on( event, fn ) { ( this.events[ event ] ||= [] ).push( fn ); }
	emit( event ) { for ( const fn of this.events[ event ] || [] ) fn(); }
	async exit() { await Promise.all( this.exits.map( ( fn ) => fn() ) ); }

}

const SAVE = 'tidewater.save.v1', saved = ( p ) => p.server.get( 'progress' )?.value;

// ---- its own writes: a slow save, and changes coming faster than it answers
{

	const p = new Portal( 200 ), errors = [];
	const s = new SaveStore( p, { onError: ( e ) => errors.push( e ), writeAfterMs: 50 } );
	await s.load();
	for ( let n = 1; n <= 6; n ++ ) {

		s.setItem( SAVE, JSON.stringify( { cooler: n } ) );
		await sleep( 70 );

	}
	await sleep( 800 );
	check( errors.length === 0 && ! s.stopped, `writes faster than they're answered never clash with each other (${ errors.length } turned down)` );
	check( saved( p )?.cooler === 6, `the last change is the one saved (${ JSON.stringify( saved( p ) ) }, in ${ p.writes } writes)` );
	s.setItem( SAVE, JSON.stringify( { cooler: 7 } ) );
	await sleep( 400 );
	check( saved( p )?.cooler === 7, 'and it goes on saving after' );

}

// ---- the app covering it: written then, not a moment later
{

	const p = new Portal( 20 );
	const s = new SaveStore( p, { writeAfterMs: 5000 } );
	await s.load();
	s.setItem( SAVE, JSON.stringify( { cooler: 3 } ) );
	p.emit( 'pause' );
	await sleep( 100 );
	check( saved( p )?.cooler === 3, 'paused (a hidden tab, the app in the background): written at once' );

}

// ---- leaving: the last of it written, after a write already out
{

	const p = new Portal( 150 ), errors = [];
	const s = new SaveStore( p, { onError: ( e ) => errors.push( e ), writeAfterMs: 20 } );
	await s.load();
	s.setItem( SAVE, JSON.stringify( { cooler: 1 } ) );
	await sleep( 40 );
	s.setItem( SAVE, JSON.stringify( { cooler: 2 } ) );
	await p.exit();
	check( errors.length === 0 && saved( p )?.cooler === 2, `leaving with a write out: the last of it saved after it (${ JSON.stringify( saved( p ) ) })` );

}

// ---- saved from another device meanwhile: that one's kept
{

	const p = new Portal( 10 ), errors = [];
	const s = new SaveStore( p, { onError: ( e ) => errors.push( e ), writeAfterMs: 10 } );
	await s.load();
	p.server.set( 'progress', { value: { cooler: 99 }, version: 5 } );
	s.setItem( SAVE, JSON.stringify( { cooler: 1 } ) );
	await sleep( 100 );
	s.setItem( SAVE, JSON.stringify( { cooler: 2 } ) );
	await sleep( 100 );
	check( s.stopped && errors.length === 1 && saved( p )?.cooler === 99, 'saved from another device meanwhile: it stops, and keeps that one' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
