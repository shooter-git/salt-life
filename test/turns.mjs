// (M16) Plain-node test of how far each boat leans in a turn on flat water, at every lever and engine a player can have. The hull's
// samples hold a boat only to a GZ of 0.05 to 0.1 m, so without her rightFrom near there she flops over to it: the sportfisher sat
// at 30 degrees all but going straight and nearly went over hard over; the console at 45 at a walking pace; the lobster boat
// with a turbo diesel at 73, her bow in the air.
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

let failed = 0;
const ok = ( c, s ) => { if ( ! c ) { failed ++; console.log( 'FAIL ' + s ); } };
const FPS = 30, dt = 1 / FPS, u = new Vector3();

// flat water, the lever on for a minute, then the wheel over for 25 s: [ most heel out, most heel in, most trim, steady heel ]
async function turn( id, mul, lever, wheel ) {

	const m = await loadBoat( id, 'low' );
	const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	ctl.maxThrust *= mul * mul; // (as Game's upgrades do)
	ctl.pitchSpeed *= mul;
	let t = 0, out = 0, inn = 0, trim = 0, steady = 0, n = 0;
	const run = ( seconds, th, st, each ) => {

		for ( let f = 0; f < seconds * FPS; f ++ ) {

			t += dt;
			query.version ++;
			query.resultTime = t;
			ctl.setInput( th, st, dt );
			ctl.update( dt );
			each && each( f );

		}

	};

	run( 15, 0, 0 );
	ctl.driven = true;
	run( 60, lever, 0 );
	run( 25, lever, wheel, ( f ) => {

		// (heel + out of the turn, whichever way she's turning)
		u.set( 1, 0, 0 ).applyQuaternion( ctl.quaternion );
		const heel = Math.asin( u.y ) * 57.3 * Math.sign( wheel );
		u.set( 0, 0, 1 ).applyQuaternion( ctl.quaternion );
		out = Math.max( out, heel );
		inn = Math.min( inn, heel );
		trim = Math.max( trim, Math.abs( Math.asin( u.y ) * 57.3 ) );
		if ( f > 20 * FPS ) { steady += heel; n ++; }

	} );
	const finite = ctl.isFinite();
	m.dispose && m.dispose();
	return { out, inn, trim, steady: steady / n, finite };

}

for ( const [ id, muls ] of [ [ 'lobster', [ 1, 1.15, 1.3 ] ], [ 'console', [ 1, 1.25 ] ], [ 'sportfisher', [ 1 ] ] ] ) for ( const mul of muls ) for ( const lever of [ 0.45, 0.7, 1 ] ) for ( const wheel of [ 0.5, 1, - 1 ] ) {

	const r = await turn( id, mul, lever, wheel ), name = `${ id } x${ mul }, lever ${ lever }, wheel ${ wheel }`;
	ok( r.finite, `${ name } stays finite` );
	ok( r.out < 25 && r.inn > - 25, `${ name } leans no more than 25 degrees (${ r.out.toFixed( 1 ) } out, ${ r.inn.toFixed( 1 ) } in)` );
	ok( r.trim < 15, `${ name } keeps her bow down (${ r.trim.toFixed( 1 ) })` );

}

// each as her hull has it
const sf = await turn( 'sportfisher', 1, 1, 0.5 ), lob = await turn( 'lobster', 1, 1, 0.5 ), con = await turn( 'console', 1, 1, 0.5 ), slow = await turn( 'sportfisher', 1, 0.45, 0.5 );
ok( sf.steady < - 4 && sf.steady > - 16, `on the plane the sportfisher leans in (${ sf.steady.toFixed( 1 ) })` );
ok( Math.abs( slow.steady ) < 6, `below it she's about upright (${ slow.steady.toFixed( 1 ) })` );
ok( con.steady < - 4 && con.steady > - 16, `on the plane the console leans in (${ con.steady.toFixed( 1 ) })` );
ok( lob.steady > 1 && lob.steady < 8, `the lobster boat, no planing hull, leans a little out (${ lob.steady.toFixed( 1 ) })` );

if ( failed ) { console.log( `turns: ${ failed } failed` ); process.exit( 1 ); }
console.log( 'turns: all passed' );
process.exit( 0 );
