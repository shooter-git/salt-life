// (M21) Playing together: everyone else in the session silent for a while (a connection All the Spaces lost and never told the
// game about, or their game paused out of sight) is said once, and again only after one's been heard from.
//   node test/together-quiet.mjs
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { Together } = await import( '../src/together/Together.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

const said = [];
const t = Object.create( Together.prototype );
t.others = new Map();
t.app = { game: { toast: ( text ) => said.push( text ) } };
const now = () => performance.now() / 1000;
const sam = { person: { name: 'Sam' }, last: - Infinity };

t._quiet();
ok( said.length === 0, 'alone in the session: nothing said' );
t.others.set( 'sam', sam );
t._quiet();
ok( said.length === 0, 'Sam in the session, not heard from yet (just joined): nothing said' );
sam.last = now() - 5;
t._quiet();
ok( said.length === 0, 'heard from 5 s ago: nothing said' );
sam.last = now() - 25;
t._quiet();
ok( said.length === 1 && /Not hearing from Sam/.test( said[ 0 ] ) && /reload to rejoin/.test( said[ 0 ] ), `25 s silent: "${ said[ 0 ] }"` );
t._quiet();
ok( said.length === 1, 'said once, not every frame' );
sam.last = now();
t._quiet();
sam.last = now() - 25;
t.others.set( 'ann', { person: { name: 'Ann' }, last: now() - 30 } );
t._quiet();
ok( said.length === 2 && /the others/.test( said[ 1 ] ), `heard from again, then everyone silent: said again, "${ said[ 1 ] }"` );

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
