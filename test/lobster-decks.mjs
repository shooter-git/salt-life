// (M16) Plain-node test of where a hop gets you in the lobster boat's wheelhouse, by the real Player. With your head at her roof it was a
// wall, and a hop anywhere under it threw you out from under it: off the bench, over the dash and out through the windshield, onto a
// foredeck with no way back.
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1, addEventListener() {} };
globalThis.document = globalThis.document || { createElement: () => ( { style: {}, getContext: () => null } ) };
const { PerspectiveCamera } = await import( '../src/engine/index.js' );
const { BoatModel } = await import( '../src/world/BoatModel.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { Player } = await import( '../src/player/Player.js' );

let failed = 0;
const ok = ( c, s ) => { if ( c ) console.log( 'ok   ' + s ); else { failed ++; console.log( 'FAIL ' + s ); } };

const held = new Set(), hits = new Set();
const input = { down: ( k ) => held.has( k ), hit: ( k ) => hits.delete( k ), consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0, move: null };
const model = new BoatModel(), query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
const boat = new BoatController( { model, query, terrain: { heightAt: () => - 50 }, colliders: null } );
boat.position.set( 3000, 0, 3000 );
const p = new Player( { camera: new PerspectiveCamera(), input, terrain: { heightAt: () => - 50 }, colliders: { groundHeightAt: () => - Infinity, resolveCapsule() {} }, query, boat } );
p.boardBoat();

for ( const dt of [ 1 / 60, 1 / 10 ] ) {

	const fps = Math.round( 1 / dt );
	// W at the bow, off the bench and off the deck, with a hop each second
	for ( const [ x, y ] of [ [ 0.86, 0.82 ], [ 0.7, 0.82 ], [ 0, 0.35 ], [ - 1, 0.35 ] ] ) {

		p.deckPos.set( x, y, 0.45 );
		p.deckVel.set( 0, 0, 0 );
		p.deckGrounded = true;
		held.add( 'KeyW' );
		let far = 0;
		for ( let i = 0; i < 10 * fps; i ++ ) {

			p.deckYaw = Math.atan2( 0.5 - p.deckPos.x, 1.9 - p.deckPos.z );
			if ( p.deckGrounded && i % fps === 2 ) hits.add( 'Space' );
			p.update( dt );
			far = Math.max( far, p.deckPos.z );

		}

		held.clear();
		ok( far < 1, `from ${ x } on her ${ y > 0.5 ? 'bench' : 'deck' } at ${ fps } fps, her dash and windshield stop you (z ${ far.toFixed( 2 ) })` );

	}

	// a hop on the spot, all over the house
	for ( const [ x, y, z ] of [ [ 0, 0.35, 0.5 ], [ 0.3, 0.35, 0.7 ], [ 0, 0.35, - 0.3 ], [ - 0.2, 0.35, - 0.8 ], [ 0.9, 0.82, 0.4 ] ] ) {

		p.deckPos.set( x, y, z );
		p.deckVel.set( 0, 0, 0 );
		p.deckGrounded = true;
		p.deckYaw = 0;
		for ( let i = 0; i < fps; i ++ ) p.update( dt );
		const a = p.deckPos.clone();
		hits.add( 'Space' );
		let moved = 0;
		for ( let i = 0; i < fps; i ++ ) {

			p.update( dt );
			moved = Math.max( moved, Math.hypot( p.deckPos.x - a.x, p.deckPos.z - a.z ) );

		}

		ok( moved < 0.05, `a hop on the spot at ${ a.x.toFixed( 2 ) }, ${ a.z.toFixed( 2 ) }, ${ fps } fps, stays there (${ moved.toFixed( 2 ) } m)` );

	}

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
