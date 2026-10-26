// The sea's CPU side: the Eulerian height the boat and the swimmer read must sit on the surface the GPU
// draws (the grid point x0 displaced by the same waves), the waves must fade out over land, and the
// query results must be sane numbers.
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Waves, SWELL_WEST } from '../src/ocean/Waves.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { ShoreWaves, TUMBLE_H } from '../src/ocean/ShoreWaves.js';
import { computeShoreField } from '../src/world/ShoreField.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { CHANDLERY } from '../src/game/Chandlery.js';
import { weatherAt, SURF_MAX, PERIOD_MAX, GROUNDSWELL_MAX } from '../src/game/Weather.js';

let failed = 0;
const check = ( ok, label ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );

// the worst gap between the CPU's height at a displaced grid point and the surface drawn there, and
// the worst where the water is deep (over the shallows the waves fade with the depth under the point
// drawn, on the GPU, and under the point asked about, on the CPU: a gap in proportion to the waves)
const worstGap = ( waves ) => {

	const d = [ 0, 0, 0 ];
	let worst = 0, deep = 0;
	for ( let i = 0; i < 200; i ++ ) {

		// open water south of the island
		const x0 = - 600 + ( i * 37 ) % 1200, z0 = 200 + ( i * 53 ) % 600, t = i * 0.37;
		waves.displacement( x0, z0, t, d );
		const gap = Math.abs( waves.heightAt( x0 + d[ 0 ], z0 + d[ 2 ], t ) - d[ 1 ] );
		worst = Math.max( worst, gap );
		if ( waves.fadeAt( x0, z0 ) === 1 ) deep = Math.max( deep, gap );

	}

	return [ worst, deep ];

};
const seaHeight = ( waves ) => waves.waves.reduce( ( s, w ) => s + w.a, 0 );
const gale = weatherAt( 0, 'gale' );
for ( const tier of [ 'low', 'mid', 'high' ] ) {

	const waves = new Waves( { tier, terrain } );
	const [ worst ] = worstGap( waves );
	check( worst < 0.02, `${ tier }: the height at a displaced grid point matches the surface drawn there (worst ${ ( worst * 100 ).toFixed( 2 ) } cm)` );
	// (Salt Life) the weather's sea state: a gale's sea still sits where it's drawn, and back to fair is
	// today's sea to the bit
	const heights = () => [ 0, 1, 2, 3, 4 ].map( ( i ) => waves.heightAt( - 300 + i * 150, 300 + i * 70, i * 1.3 ) );
	const before = heights(), B = waves.uniforms.waveB.value.map( ( v ) => v.toArray().join() ).join();
	waves.setSea( gale.swell, gale.windSea );
	const [ galeWorst, galeDeep ] = worstGap( waves ), share = galeWorst / seaHeight( waves );
	check( galeDeep < 0.01 && share < 0.03, `${ tier }: in a gale's sea too (worst ${ ( galeDeep * 100 ).toFixed( 2 ) } cm in deep water; over the shallows ${ ( galeWorst * 100 ).toFixed( 2 ) } cm, ${ ( share * 100 ).toFixed( 1 ) }% of its ${ seaHeight( waves ).toFixed( 2 ) } m)` );
	waves.setSea( 1, 1 );
	check( heights().every( ( h, i ) => h === before[ i ] ) && waves.uniforms.waveB.value.map( ( v ) => v.toArray().join() ).join() === B, `${ tier }: back to a fair sea, today's to the bit` );
	check( waves.iterations === 2, `${ tier }: and its CPU heights take today's two steps` );

}

// (Salt Life) the wind sea turns with the wind about the camera: there the sea stays where it was
{

	const at = { x: 260, z: 420 }, t = 3.7;
	const turnBy = ( w, a, about ) => {

		const d = Math.atan2( Math.sin( w.windAngle + a ), Math.cos( w.windAngle + a ) );
		w.setWindDir( { x: Math.cos( d ), y: Math.sin( d ) }, about );

	};
	const still = new Waves( { tier: 'high', terrain } ), swept = new Waves( { tier: 'high', terrain } );
	const h0 = still.heightAt( at.x, at.z, t );
	const near = ( w ) => [ [ 0, 0 ], [ 3, 0 ], [ 0, - 3 ] ].map( ( [ dx, dz ] ) => w.heightAt( at.x + dx, at.z + dz, t ) );
	const before = near( still );
	turnBy( still, 0.003, at );
	turnBy( swept, 0.003, { x: 0, z: 0 } );
	const moved = Math.max( ...near( still ).map( ( h, i ) => Math.abs( h - before[ i ] ) ) ), sweep = Math.abs( swept.heightAt( at.x, at.z, t ) - h0 );
	console.log( `     a frame's turn (0.003 rad) 490 m from the island's middle: the sea at the camera moves ${ ( moved * 1000 ).toFixed( 2 ) } mm (turned about the middle, ${ ( sweep * 1000 ).toFixed( 1 ) } mm)` );
	check( moved < 0.002 && sweep > 5 * moved, 'the wind sea turns about the camera, not the island\'s middle' );
	const d = [ 0, 0, 0 ];
	still.displacement( at.x, at.z, t, d );
	check( Math.abs( still.heightAt( at.x + d[ 0 ], at.z + d[ 2 ], t ) - d[ 1 ] ) < 0.02 && still.waves.every( ( w ) => Number.isFinite( w.phase ) ), 'and the CPU still sits on the turned sea' );

}

const waves = new Waves( { tier: 'mid', terrain } );
check( waves.fadeAt( 0, - 300 ) === 0, 'no open-sea waves on the island' );
check( waves.fadeAt( 0, 600 ) === 1, 'full waves offshore' );

const query = new WaterQuery( waves, terrain );
const slot = query.allocate( 'test', 3 );
query.setCamera( 64, 36 );
query.setPoint( slot, 0, 600 );
query.setPoint( slot + 1, 55, 10 );
query.setPoint( slot + 2, 0, - 300 );
query.update();
const finite = [ ...query.cpu.subarray( 0, query.count * 4 ) ].every( Number.isFinite );
check( query.cpuValid && finite, 'water queries give finite results' );
const n = ( i ) => Math.hypot( query.cpu[ i * 4 + 1 ], query.cpu[ i * 4 + 2 ] );
check( n( slot ) < 0.6 && n( slot + 2 ) < 1e-6, 'surface normals tilt with the waves, flat over land' );
check( query.cpu[ ( slot + 2 ) * 4 + 3 ] > 10, 'the sea floor under the island is the ground' );

// ---- (Salt Life) the surf at its biggest: it stays below the pier's deck and the boat at the dock,
// and its run-up never reaches the boardwalk; a fair day's surf is today's
const shore = new ShoreWaves( { field: computeShoreField( terrain, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } ) } );
const galeSea = new Waves( { tier: 'high', terrain } );
galeSea.setSea( gale.swell, gale.windSea );
const surfQuery = new WaterQuery( galeSea, terrain, shore );
shore.setSurf( 0.34 );
check( shore.params.amplitude === 0.34 && shore.params.runup === 1, 'a fair day\'s surf runs up as it always has' );
const wet = ( x, z, seconds = 600 ) => {

	const g = terrain.heightAt( x, z );
	let n = 0, all = 0;
	for ( let t = 0; t < seconds; t += 0.25, all ++ ) if ( shore.sample( x, z, t, g, terrain ).swashLevel > g + 0.005 ) n ++;
	return n / all;

};
const fairStall = wet( CHANDLERY.x, CHANDLERY.z );
shore.setSurf( SURF_MAX );
const peak = ( x, z ) => {

	let m = - 1e9;
	for ( let t = 0; t < 600; t += 0.2 ) m = Math.max( m, surfQuery.heightAt( x, z, t ) );
	return m;

};
// (the run-up grows with the period too: the longest, biggest surf runs furthest)
const reach = ( fn ) => {

	const r = [];
	for ( const [ A, P ] of [ [ SURF_MAX, gale.period ], [ GROUNDSWELL_MAX, PERIOD_MAX ] ] ) {

		shore.setSurf( A, P );
		r.push( fn() );

	}

	shore.setSurf( SURF_MAX, gale.period );
	return r;

};
const pier = WORLD.pier, under = pier.deckHeight - 0.4;
const spots = [ [ pier.x, pier.zEnd ], [ pier.x - pier.headWidth / 2 + 1, pier.zEnd + 3 ], [ pier.x + pier.headWidth / 2 - 1, pier.zEnd + 3 ], [ pier.x, 0 ], [ pier.x, - 30 ] ];
const highest = Math.max( ...spots.map( ( [ x, z ] ) => peak( x, z ) ) );
const dock = peak( WORLD.boatDock.position.x, WORLD.boatDock.position.z );
console.log( `     surf at its biggest (${ SURF_MAX } m): crests to ${ highest.toFixed( 2 ) } m under the pier (its deck ${ pier.deckHeight } m), ${ dock.toFixed( 2 ) } m at the dock; Marta's stall wet ${ ( wet( CHANDLERY.x, CHANDLERY.z ) * 100 ).toFixed( 1 ) }% of the time (on a fair day ${ ( fairStall * 100 ).toFixed( 1 ) }%)` );
check( highest < under && dock < under, 'the biggest surf stays below the pier\'s deck and the dock' );
const runs = reach( () => [ wet( WORLD.start.position.x, WORLD.start.position.z ), wet( pier.x, pier.zStart ), wet( CHANDLERY.x, CHANDLERY.z ) ] );
console.log( `     its run-up: the boardwalk wet ${ runs.map( ( r ) => r[ 0 ] ).join( ', ' ) }, the pier's foot ${ runs.map( ( r ) => r[ 1 ] ).join( ', ' ) }; Marta's stall wet ${ runs.map( ( r ) => ( r[ 2 ] * 100 ).toFixed( 1 ) + '%' ).join( ', ' ) } of the time (a gale's period, the longest swell's)` );
check( runs.every( ( [ start, foot, stall ] ) => start === 0 && foot < 0.01 && stall < 0.12 ), 'its run-up never reaches the boardwalk, seldom the pier\'s foot or Marta\'s stall, whatever its period' );
// (Salt Life) the period changing: every wave carries on, the crests only a little hurried on their way
{

	shore.setSurf( 0.34, 9, 0 );
	const pts = [ [ 0, - 30 ], [ 0, 60 ], [ - 60, 150 ], [ 55, 30 ], [ 120, 200 ] ].map( ( [ x, z ] ) => shore.fieldAt( x, z, [ 0, 0, 0, 0 ] )[ 0 ] );
	let worst = 0, t = 100, P = 9;
	const before = pts.map( ( T ) => shore.phase( t, T ) );
	while ( P < PERIOD_MAX ) {

		const prev = pts.map( ( T ) => shore.phase( t, T ) );
		t += 1 / 60;
		P = Math.min( PERIOD_MAX, P + 0.02 / 60 );
		shore.setSurf( 0.34, P, t );
		pts.forEach( ( T, i ) => worst = Math.max( worst, shore.phase( t, T ) - prev[ i ] ) );

	}

	const fairStep = 1 / 60 / 9;
	console.log( `     the period from 9 to ${ PERIOD_MAX } s: a wave's phase steps at most ${ ( worst / fairStep ).toFixed( 2 ) } x a fair frame's (it ran ${ pts.map( ( T, i ) => ( shore.phase( t, T ) - before[ i ] ).toFixed( 1 ) ).join( ', ' ) } waves on)` );
	check( worst > 0 && worst < fairStep * 1.5, 'the period changes and every wave carries on, never racing' );
	shore.setSurf( 0.34, 9, t );
	check( shore.params.runup === 1, 'and back to a fair day\'s surf' );

}

// ---- (M12) a westerly's swell: its own field, crossing the south's as it comes in; none of it on a
// fair day
{

	const west = new ShoreWaves( { field: computeShoreField( terrain, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } ) } );
	const alone = new ShoreWaves( { field: west.field } );
	west.addField( computeShoreField( terrain, { res: 512, swellDir: [ SWELL_WEST.x, SWELL_WEST.y ] } ) );
	west.setSurf( 0.34, 9, 0, 0 );
	alone.setSurf( 0.34, 9, 0, 0 );
	let same = true;
	for ( const [ x, z ] of [ [ 0, - 30 ], [ 55, 20 ], [ 150, - 10 ], [ - 100, 0 ] ] ) for ( let t = 0; t < 30; t += 1.7 ) {

		const g = terrain.heightAt( x, z ), a = west.sample( x, z, t, g, terrain ), b = alone.sample( x, z, t, g, terrain );
		if ( a.y !== b.y || a.swashLevel !== b.swashLevel ) same = false;

	}

	check( same && west.trains[ 1 ].amplitude === 0, 'with no swell from the west, the shore is the south\'s alone, as it always was' );
	west.setSurf( SURF_MAX, gale.period, 1, 0 );
	check( west.trains[ 1 ].amplitude === SURF_MAX && west.trains[ 0 ].amplitude < 0.25 && west.trains[ 0 ].period > west.trains[ 1 ].period, 'a westerly\'s swell comes in as the south\'s dies down to a longer background groundswell' );
	// (the bay's eastern shore faces the west: the westerly's breakers pile onto it, its western one is in
	// the lee of the arm)
	const busy = ( x0, x1, z0, z1 ) => {

		let s = 0, n = 0;
		for ( let x = x0; x <= x1; x += 6 ) for ( let z = z0; z <= z1; z += 6 ) {

			const g = terrain.heightAt( x, z );
			if ( - g < 1 || - g > 6 ) continue;
			for ( let t = 0; t < 60; t += 2.3 ) {

				const b = west.breakerAt( x, z, t, g, terrain );
				s += b.b > 0.85 ? b.H : 0;
				n ++;

			}

		}

		return s / Math.max( n, 1 );

	};
	const east = busy( 120, 220, - 60, 120 ), lee = busy( - 200, - 100, - 60, 120 );
	console.log( `     a westerly's surf breaking on the bay's eastern shore: ${ east.toFixed( 2 ) } m a wave, on its western ${ lee.toFixed( 2 ) }` );
	check( east > lee * 1.3, 'a westerly\'s breakers pile onto the bay\'s west-facing eastern shore' );
	const highest = Math.max( ...spots.map( ( [ x, z ] ) => {

		let m = - 1e9;
		for ( let t = 0; t < 300; t += 0.25 ) m = Math.max( m, west.sample( x, z, t, terrain.heightAt( x, z ), terrain ).y + galeSea.heightAt( x, z, t ) );
		return m;

	} ) );
	check( highest < under, `two swells crossing stay below the pier's deck (${ highest.toFixed( 2 ) } m)` );

}

// ---- (M12) the rips: seaward through the bar's channels, faster in a bigger surf; the feeders along
// the beach into them; and the breakers that tumble a swimmer: never on a fair day, often in a gale's
{

	const pts = [];
	for ( let x = - 150; x <= 170; x += 2 ) for ( let z = - 50; z <= 80; z += 2 ) {

		const g = terrain.heightAt( x, z );
		if ( - g > 0.6 && - g < 14 ) pts.push( [ x, z, g ] );

	}

	const survey = ( A, P ) => {

		shore.setSurf( A, P, 0, 0 );
		const o = { rip: [], seaward: 0, feed: [], along: 0, onSand: 0, far: 0, H: [] };
		for ( const [ x, z, g ] of pts ) {

			const f = shore.fieldAt( x, z, [ 0, 0, 0, 0 ] ), e = Math.hypot( f[ 1 ], f[ 2 ] ) || 1;
			let vmax = 0, cs = 0, ca = 0, rip = 0;
			for ( let t = 0; t < 140; t += 7 ) {

				const c = shore.currentAt( x, z, t, g );
				const v = Math.hypot( c.x, c.z );
				if ( v > vmax ) {

					vmax = v;
					cs = ( c.x * f[ 1 ] + c.z * f[ 2 ] ) / e;
					ca = Math.abs( c.x * - f[ 2 ] + c.z * f[ 1 ] ) / e;
					rip = c.rip;

				}

			}

			if ( - g < 1 && vmax > 0 ) o.onSand ++;
			if ( - g > 12 && vmax > 0 ) o.far ++;
			if ( rip > 0.9 ) {

				o.rip.push( vmax );
				if ( cs < 0 && ca < vmax * 0.2 ) o.seaward ++;

			} else if ( vmax > 0.02 && rip < 0.05 ) {

				o.feed.push( vmax );
				if ( ca > vmax * 0.95 ) o.along ++;

			}

			for ( let t = 0; t < 300; t += 3.1 ) {

				const b = shore.breakerAt( x, z, t, g, terrain );
				if ( b.b > 0.85 ) o.H.push( b.H );

			}

		}

		const top = ( a ) => a.reduce( ( m, v ) => Math.max( m, v ), 0 );
		o.ripTop = top( o.rip );
		o.ripMid = o.rip.slice().sort( ( a, b ) => a - b )[ o.rip.length >> 1 ] || 0;
		o.Htop = top( o.H );
		o.tumbling = o.H.filter( ( h ) => h > TUMBLE_H ).length / Math.max( 1, o.H.length );
		return o;

	};
	const fair = survey( 0.34, 9 ), big = survey( SURF_MAX, gale.period );
	console.log( `     rips: ${ fair.rip.length } points in a channel; at most ${ fair.ripTop.toFixed( 2 ) } m/s on a fair day (${ fair.ripMid.toFixed( 2 ) } middling), ${ big.ripTop.toFixed( 2 ) } in the biggest surf; feeders at most ${ top2( fair.feed ) }, ${ top2( big.feed ) }` );
	console.log( `     breakers: a fair day's at most ${ fair.Htop.toFixed( 2 ) } m, the biggest surf's ${ big.Htop.toFixed( 2 ) } m; ${ ( big.tumbling * 100 ).toFixed( 0 ) }% of the biggest surf's tumble a swimmer (past ${ TUMBLE_H } m)` );
	check( fair.rip.length > 20 && fair.seaward === fair.rip.length && big.seaward === big.rip.length, 'in a rip channel the current runs out to sea' );
	check( fair.ripMid > 0.15 && fair.ripTop < 0.6 && big.ripTop > fair.ripTop * 1.4 && big.ripTop < 1.2, 'a few tenths of a m/s on a fair day, near 1 in the biggest surf\'s pulses' );
	check( fair.along > fair.feed.length * 0.95 && big.along > big.feed.length * 0.95, 'out of the channels, inside the breakers, the current runs along the beach (into them)' );
	check( fair.onSand === 0 && fair.far === 0 && big.far === 0, 'none where you can stand, nor out beyond the surf' );
	check( fair.tumbling < 0.001 && big.tumbling > 0.05, `a fair day's breakers all but never tumble a swimmer (${ ( fair.tumbling * 100 ).toFixed( 3 ) }%); the biggest surf's often do` );

}

function top2( a ) {

	return a.reduce( ( m, v ) => Math.max( m, v ), 0 ).toFixed( 2 );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
