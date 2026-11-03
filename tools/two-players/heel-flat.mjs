import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { loadBoat } = await import( '../../src/world/boat/Boats.js' );
const { BoatController } = await import( '../../src/player/BoatController.js' );
const { Vector3 } = await import( '../../src/engine/index.js' );
const CASES = [ [ 'sportfisher', 0.7, 1, 1 ], [ 'sportfisher', 0.45, 1, 1 ], [ 'sportfisher', 1, 0.5, 1 ], [ 'lobster', 1, 1, 1.35 ], [ 'lobster', 0.7, 1, 1.35 ] ];
for ( const [ id, lever, wheel, mul ] of CASES ) {

	const fps = 30, m = await loadBoat( id, 'low' );
	const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	ctl.maxThrust *= mul * mul;
	ctl.pitchSpeed *= mul;
	let t = 0;
	const u = new Vector3(), dt = 1 / fps;
	const run = ( seconds, th, st, rows ) => {

		for ( let f = 0; f < seconds * fps; f ++ ) {

			t += dt;
			query.version ++;
			query.resultTime = t;
			ctl.setInput( th, st, dt );
			ctl.update( dt );
			if ( rows && f % ( fps * 2 ) === 0 ) { u.set( 1, 0, 0 ).applyQuaternion( ctl.quaternion ); const heel = Math.asin( u.y ) * 57.3; u.set( 0, 0, 1 ).applyQuaternion( ctl.quaternion ); rows.push( [ +heel.toFixed( 1 ), +( Math.asin( u.y ) * 57.3 ).toFixed( 1 ), +ctl.speed.toFixed( 1 ) ] ); }

		}

	};

	run( 15, 0, 0 );
	ctl.driven = true;
	run( 60, lever, 0 );
	const rows = [];
	run( 20, lever, wheel, rows );
	console.log( `${ id } lever ${ lever } wheel ${ wheel } thrust x${ mul * mul }: top ${ rows[ 0 ][ 2 ] } m/s: [ heel, trim, m/s ] each 2 s:`, JSON.stringify( rows ), 'peak heel', Math.max( ...rows.map( ( r ) => Math.abs( r[ 0 ] ) ) ) );
	m.dispose && m.dispose();

}

process.exit( 0 );
