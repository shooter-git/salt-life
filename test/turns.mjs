// (M16) Plain-node test of how far each boat leans in a turn on flat water, at every lever and engine a player can have. The hull's
// samples hold a boat only to a GZ of 0.05 to 0.1 m, so without her rightFrom near there she flops over to it: the sportfisher sat
// at 30 degrees all but going straight and nearly went over hard over; the console at 45 at a walking pace; the lobster boat
// with a turbo diesel at 73, her bow in the air.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { Vector3 } = await import( '../src/engine/index.js' );
const { G } = await import( '../src/core/Globals.js' );
const { TerrainData } = await import( '../src/world/TerrainData.js' );
const { decodeIsland } = await import( '../src/world/terrain/IslandDecode.js' );
const { Waves } = await import( '../src/ocean/Waves.js' );
const { WaterQuery } = await import( '../src/ocean/WaterQuery.js' );
const { seaSwell, seaTurn, seaPeriodOf, towardOf } = await import( '../src/game/Weather.js' );

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

// the same at their hardest, flat out and hard over one way then the other, on a gale's real sea (Waves, on the CPU)
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const FROM = { x: - 2600, z: 3000 }, GALE = { wind: 20, windAngle: 0.7, swell: 2.4, blow: 1, windSea: 1, period: 7.5 };
for ( const [ id, mul, most ] of [ [ 'console', 1.25, 40 ], [ 'lobster', 1, 40 ], [ 'lobster', 1.3, 60 ], [ 'sportfisher', 1, 30 ] ] ) for ( let run = 0; run < 2; run ++ ) {

	const m = await loadBoat( id, 'low' ), waves = new Waves( { tier: 'low', terrain } ), W = GALE;
	waves.setWindDir( towardOf( W.windAngle ), FROM );
	waves.setSea( seaSwell( W.swell, W.blow ), W.windSea );
	waves.setSwell( 0, W.period, W.period, FROM, G.time.value, seaTurn( W.swell, W.blow ), seaPeriodOf( W.swell, W.windSea, W.blow ) );
	G.windSpeed.value = W.wind;
	const query = new WaterQuery( waves, terrain ), b = new BoatController( { model: m, query, terrain, colliders: null } );
	b.moored = false;
	b.driven = true;
	b.maxThrust *= mul * mul;
	b.pitchSpeed *= mul;
	b.position.set( FROM.x, 0, FROM.z );
	b.quaternion.setFromAxisAngle( u.set( 0, 1, 0 ), 2.4 + run );
	let heel = 0;
	const tick = ( st ) => {

		G.time.value += dt;
		b.queueQueries();
		query.update();
		b.setInput( 1, st, dt );
		b.update( dt );
		u.set( 1, 0, 0 ).applyQuaternion( b.quaternion );
		heel = st ? Math.max( heel, Math.abs( Math.asin( u.y ) * 57.3 ) ) : heel;

	};

	for ( let k = 0; k < 25 * FPS; k ++ ) tick( 0 );
	for ( const st of [ 1, - 1 ] ) for ( let k = 0; k < 18 * FPS; k ++ ) tick( st );
	ok( b.isFinite() && heel < most, `${ id } x${ mul }, a gale, flat out and hard over: ${ heel.toFixed( 1 ) } degrees at most` );
	console.log( `  ${ id } x${ mul }, gale: ${ heel.toFixed( 1 ) }` );
	m.dispose && m.dispose();

}

G.windSpeed.value = 7;

if ( failed ) { console.log( `turns: ${ failed } failed` ); process.exit( 1 ); }
console.log( 'turns: all passed' );
process.exit( 0 );
