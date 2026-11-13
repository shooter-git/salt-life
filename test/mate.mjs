// (M19) The sportfisher's mate (game/rigs/Mate.js, docs/m19/big.md), backing her down on a fish, on the real sportfisher and
// her handling in plain Node: from a fish ahead, abeam or astern of her, he brings her stern round to it and backs down at the
// closing speed he wants for the sea, easing off as she comes up on it; less in a big sea. And how fast he wants it.
//   node test/mate.mjs
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { Vector3 } = await import( '../src/engine/index.js' );
const { MATE, mateTarget, mateHelm } = await import( '../src/game/rigs/Mate.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

// how fast he wants it
ok( mateTarget( 200, 1, 0 ) === MATE.most && mateTarget( 200, 1, 4 ) === MATE.least && mateTarget( 10, 1, 0 ) === 0 && mateTarget( 37, 1, 0 ) > 0 && mateTarget( 37, 1, 0 ) < MATE.most, `${ MATE.most } m/s astern in a calm sea, ${ MATE.least } in a rough one, easing off as she comes up on it, none on top of it` );

const m = await loadBoat( 'sportfisher', 'low' );
const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
const FPS = 30, dt = 1 / FPS;
// she lies heading north (+z), the fish `bearing` radians off her bow `d` m away, holding there (it's running as fast as it's
// come up on: the line stays out) for `secs`; each second, how far her stern's off it and how fast she's closing
const back = ( bearing, { d = 80, Hs = 0, secs = 90 } = {} ) => {

	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	ctl.driven = true;
	const yaw = ctl.getYaw(), fish = new Vector3(), helm = { th: 0, st: 0, err: 0 };
	fish.set( Math.sin( yaw + bearing ) * d, 0, Math.cos( yaw + bearing ) * d );
	let t = 0, onIt = null;
	const errs = [], closing = [];
	for ( let f = 0; f < secs * FPS; f ++ ) {

		t += dt;
		query.version ++;
		query.resultTime = t;
		// (the fish keeps its distance: it takes line as she comes)
		const dx = fish.x - ctl.position.x, dz = fish.z - ctl.position.z, len = Math.hypot( dx, dz );
		fish.set( ctl.position.x + dx / len * d, 0, ctl.position.z + dz / len * d );
		mateHelm( ctl, fish, d, 1, Hs, helm );
		ctl.setInput( helm.th, helm.st, dt );
		ctl.update( dt );
		if ( onIt === null && Math.abs( helm.err ) < 0.35 ) onIt = t;
		if ( f % FPS === 0 && t > 30 ) {

			errs.push( Math.abs( helm.err ) );
			closing.push( ( ctl.velocity.x * dx + ctl.velocity.z * dz ) / len );

		}

	}

	const mean = ( a ) => a.reduce( ( s, x ) => s + x, 0 ) / a.length;
	return { onIt, err: Math.max( ...errs ), closing: mean( closing ), finite: ctl.isFinite() };

};

for ( const [ name, b ] of [ [ 'astern', Math.PI ], [ 'abeam', Math.PI / 2 ], [ 'ahead', 0 ], [ 'on her other quarter', - 2.4 ] ] ) {

	const r = back( b );
	ok( r.finite && r.onIt !== null && r.onIt < 30 && r.err < 35 * Math.PI / 180 && r.closing > 0.75 * MATE.most && r.closing < 1.2 * MATE.most, `a fish ${ name }: her stern on it in ${ r.onIt === null ? 'never' : r.onIt.toFixed( 0 ) + ' s' }, held within ${ ( r.err * 180 / Math.PI ).toFixed( 0 ) } degrees after, closing at ${ r.closing.toFixed( 2 ) } m/s (he wants ${ MATE.most })` );

}

const rough = back( Math.PI, { Hs: 3 } );
ok( rough.closing > 0.6 * MATE.least && rough.closing < 1.4 * MATE.least, `in 3 m of sea, slower: ${ rough.closing.toFixed( 2 ) } m/s (he wants ${ MATE.least })` );

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
