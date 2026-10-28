// (M14) Plain-node tests of the showers' own cloud (SkyProClouds' stormMap, turretsOf, CB): a thunderstorm's
// turrets, no two storms alike, rising unevenly to their highest off its middle and stepping down away from
// it, wider than they're tall; up to the tropopause, the broad mass at its foot and its anvil spread on the
// upper wind; a shower's lower towering cumulus with neither, none in a hurricane's own cloud, the march's
// bound over all of it, and the map made from a picked thunderstorm's cells a few a frame quickly enough.
//   node test/cumulonimbus.mjs
import { CB, STORM_CELLS, stormMap, turretsOf } from '../src/sky/SkyProClouds.js';
import { showers, STORM_RANGE, islandTime } from '../src/game/Weather.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const N = CB.res, S = CB.span, cell = S / N;
const data = new Uint8Array( N * N * 4 );
const BASE = 900, DEPTH = 3000, DOME = BASE + ( CB.top - BASE ) * CB.dome;
// the texel's values at world ( x, z )
const at = ( x, z ) => {

	const i = Math.floor( ( x + S / 2 ) / cell ), j = Math.floor( ( z + S / 2 ) / cell ), o = ( j * N + i ) * 4;
	return { r: data[ o ] / 255, top: data[ o + 1 ] / 255 * CB.topMax, b: data[ o + 2 ] / 255, a: data[ o + 3 ], mass: Math.max( 0, data[ o + 3 ] - 128 ) / 127 };

};
// a storm's turrets ({ x, z, r, top }), as the map lays them out (and .mass: { x, z, r })
const turrets = ( c, thunder = 1, top = DOME ) => {

	const out = [], n = turretsOf( c, CB.reach * c.r, top, BASE, thunder, out ), ts = out.slice( 0, n ).map( ( t ) => ( { ...t } ) );
	ts.mass = { ...out.mass };
	return ts;

};
// how wide they are, seen from the way `a` (radians: m), and how far off its middle the main updraft is then
// (of its half-width); and from the way it's widest
const across = ( ts, a ) => {

	const ux = Math.cos( a ), uz = Math.sin( a );
	let lo = Infinity, hi = - Infinity;
	for ( const t of ts ) {

		const p = t.z * ux - t.x * uz;
		lo = Math.min( lo, p - t.r ); hi = Math.max( hi, p + t.r );

	}
	return { wide: hi - lo, off: Math.abs( ts[ 0 ].z * ux - ts[ 0 ].x * uz - ( lo + hi ) / 2 ) / ( ( hi - lo ) / 2 ) };

};
const widest = ( ts ) => {

	let w = { wide: 0 };
	for ( let a = 0; a < Math.PI; a += 0.05 ) {

		const v = across( ts, a );
		if ( v.wide > w.wide ) w = v;

	}
	return w;

};
// (the upper wind toward +x)
const UX = 1, UZ = 0;

// ---- a thunderstorm's turrets: no two alike, uneven, its highest off its middle, stepping down away from it
{

	const one = turrets( { x: 0, z: 0, r: 2500, n: 7 } ), again = turrets( { x: 5000, z: - 9000, r: 2500, n: 7 } ), other = turrets( { x: 0, z: 0, r: 2500, n: 8 } );
	check( one.length === again.length && one.every( ( t, i ) => Math.abs( t.x + 5000 - again[ i ].x ) < 1e-6 && Math.abs( t.z - 9000 - again[ i ].z ) < 1e-6 && t.top === again[ i ].top ),
		`a storm's own for good, wherever it's drifted (${ one.length } turrets)` );
	let alike = 0;
	const all = [];
	for ( let n = - 100; n < 100; n ++ ) all.push( turrets( { x: 0, z: 0, r: 2500, n } ) );
	for ( let i = 0; i < all.length; i ++ ) for ( let j = i + 1; j < all.length; j ++ ) {

		if ( all[ i ].length === all[ j ].length && all[ i ].every( ( t, k ) => Math.hypot( t.x - all[ j ][ k ].x, t.z - all[ j ][ k ].z ) < 300 ) ) alike ++;

	}
	check( other.length !== one.length || other.some( ( t, k ) => Math.hypot( t.x - one[ k ].x, t.z - one[ k ].z ) > 300 ), 'another storm laid out its own way' );
	check( alike === 0, `no two of 200 alike (${ alike } pairs)` );
	const counts = all.map( ( ts ) => ts.length ), heights = all.map( ( ts ) => new Set( ts.map( ( t ) => Math.round( t.top / 500 ) ) ).size );
	check( Math.min( ...counts ) >= 5 && Math.max( ...counts ) > Math.min( ...counts ), `${ Math.min( ...counts ) } to ${ Math.max( ...counts ) } turrets a thunderstorm` );
	check( Math.min( ...heights ) >= 4, `each rising unevenly (at least ${ Math.min( ...heights ) } heights to the nearest 500 m)` );
	const views = all.map( widest ), off = views.filter( ( v ) => v.off > 0.2 ).length;
	check( all.every( ( ts ) => ts.every( ( t ) => t.top <= ts[ 0 ].top ) ) && off >= 180,
		`its highest its main updraft, seen from its widest a fifth of its half-width off its middle or more in 9 of 10 (${ off } of 200)` );
	const steps = Math.round( CB.steps[ 0 ] ), line = one.slice( 0, 1 + steps );
	check( line.every( ( t, i ) => i === 0 || ( t.top < line[ i - 1 ].top && ( i === 1 || t.r < line[ i - 1 ].r ) ) ),
		`stepping down away from it, each narrower (${ line.map( ( t ) => ( t.top / 1000 ).toFixed( 1 ) ).join( ', ' ) } km)` );
	// (no flat-topped block: the tropopause flattens the main updraft's core alone)
	const under = all.every( ( ts ) => ts.slice( 1 ).every( ( t ) => t.top < CB.top - 500 ) );
	let level = 0, against = 0;
	for ( const ts of all ) for ( let i = 1; i < ts.length; i ++ ) for ( let j = i + 1; j < ts.length; j ++ ) {

		const a = ts[ i ], b = ts[ j ];
		if ( Math.hypot( a.x - b.x, a.z - b.z ) >= 0.7 * ( a.r + b.r ) ) continue;
		against ++;
		if ( Math.abs( a.top - b.top ) < CB.apart - 1 ) level ++;

	}
	check( under && level === 0, `its core alone reaching the tropopause; of the ${ against } turrets standing against another, none level with it (${ level })` );
	const wide = views.map( ( v ) => v.wide ).sort( ( a, b ) => a - b ), tall = CB.top + CB.overshoot - BASE;
	check( wide[ 20 ] > tall, `wider than it's tall from its widest (${ ( wide[ 0 ] / 1000 ).toFixed( 1 ) } to ${ ( wide[ wide.length - 1 ] / 1000 ).toFixed( 1 ) } km; ${ ( tall / 1000 ).toFixed( 1 ) } km tall): 9 in 10` );
	const shower = turrets( { x: 0, z: 0, r: 1500, n: 7 }, 0, 6000 );
	check( shower.length < one.length, `a shower fewer (${ shower.length })` );

}

// ---- a thunderstorm 20 km off: its map
{

	const c = { x: 0, z: 20000, r: 2500, rain: 0.9, thunder: 0.8, n: 7 };
	const n = stormMap( [ c ], data, UX, UZ, BASE, DEPTH );
	check( n === 1, 'a thunderstorm towers' );
	const ts = turrets( c ), main = ts[ 0 ];
	const core = at( main.x, main.z );
	check( Math.abs( core.top - DOME ) < 150 && core.top > CB.top, `its main updraft's top past the tropopause (${ core.top.toFixed( 0 ) } m: flattened against it)` );
	const t1 = ts[ 1 ], step = at( t1.x, t1.z );
	check( step.top > t1.top - 150 && step.top < core.top - 1000, `its next one down lower (${ step.top.toFixed( 0 ) } m)` );
	const edge = at( main.x + main.r * 0.85, main.z );
	check( edge.top < core.top - 1500 && edge.top > BASE, `steep-sided, its head rounded (${ edge.top.toFixed( 0 ) } m 85% of the way out)` );
	const MS = ts.mass, off = Math.hypot( MS.x - main.x, MS.z - main.z );
	check( at( MS.x, MS.z ).mass > 0.95 && at( MS.x, MS.z - 0.9 * MS.r ).mass > 0.95 && off > 0.2 * MS.r,
		`a broad mass at its foot (${ ( 2 * MS.r / 1000 ).toFixed( 1 ) } km across), off to one side of its core (${ ( off / 1000 ).toFixed( 1 ) } km)` );
	let past = 0, inside = 0;
	for ( let j = 1; j < N - 1; j ++ ) for ( let i = 1; i < N - 1; i ++ ) {

		const x = ( i + 0.5 ) * cell - S / 2, z = ( j + 0.5 ) * cell - S / 2, o = ( j * N + i ) * 4;
		const d = Math.min( ...[ ...ts, MS ].map( ( t ) => Math.hypot( x - t.x, z - t.z ) / t.r ) );
		if ( d > 1 && data[ o ] > 0 ) past ++;
		if ( d < 0.95 && data[ o ] === 0 ) inside ++;
		if ( data[ o + 3 ] > 128 && Math.hypot( x - MS.x, z - MS.z ) > MS.r ) past ++;

	}
	check( past === 0 && inside === 0, `its foot about each turret and its mass, the mass's own, nothing past them (${ past } past, ${ inside } missing)` );
	const down = at( main.x + 8000, main.z ), up = at( main.x - 15000, main.z ), aside = at( main.x, main.z + 14000 );
	check( down.b > 0.1 && up.b === 0 && aside.b === 0, `its anvil carried downwind on the upper wind (${ down.b.toFixed( 2 ) } 8 km down it, none 15 km up it or aside)` );
	const root = at( main.x + 1500, main.z ), end = at( main.x + 0.5 * CB.downwind * CB.anvilReach[ 0 ], main.z );
	check( root.b > end.b && end.b > 0, `thinning toward its end (${ root.b.toFixed( 2 ) } at its root, ${ end.b.toFixed( 2 ) } ${ ( 0.5 * CB.downwind * CB.anvilReach[ 0 ] / 1000 ).toFixed( 1 ) } km down)` );
	check( at( main.x - main.r, main.z ).b > 0 && at( main.x - main.r - CB.upwind * CB.downwind - 1000, main.z ).b === 0, 'spreading a little upwind of its core too, no more' );
	// (each its own way off the upper wind, and its own length)
	const ways = new Set(), reach = new Set();
	for ( let k = 0; k < 12; k ++ ) {

		stormMap( [ { ...c, n: 100 + k } ], data, UX, UZ, BASE, DEPTH );
		const m = turrets( { ...c, n: 100 + k } )[ 0 ];
		let best = 0, way = 0, far = 0;
		for ( let a = - 0.6; a <= 0.6; a += 0.05 ) {

			const b = at( m.x + 10000 * Math.cos( a ), m.z + 10000 * Math.sin( a ) ).b;
			if ( b > best ) { best = b; way = a; }

		}
		for ( let s = 0; s < 30000; s += 500 ) if ( at( m.x + s * Math.cos( way ), m.z + s * Math.sin( way ) ).b > 0 ) far = s;
		ways.add( Math.round( way / 0.1 ) );
		reach.add( Math.round( far / 2000 ) );

	}
	check( ways.size >= 3 && reach.size >= 3, `each storm's anvil its own way and length (${ ways.size } ways, ${ reach.size } lengths in 12)` );
	// (and fanning out more to one side than the other: seen end-on, no flat top centred on its tower)
	let lopsided = 0;
	for ( let k = 0; k < 20; k ++ ) {

		stormMap( [ { ...c, n: 200 + k } ], data, 0, 1, BASE, DEPTH );
		const m = turrets( { ...c, n: 200 + k } )[ 0 ];
		let lo = 0, hi = 0;
		for ( let x = 0; x < 15000; x += cell / 2 ) {

			if ( at( m.x - x, m.z + 12000 ).b > 0.1 ) lo = x;
			if ( at( m.x + x, m.z + 12000 ).b > 0.1 ) hi = x;

		}
		if ( Math.abs( hi - lo ) > 1500 ) lopsided ++;

	}
	check( lopsided >= 12, `each fanning out its own way, more to one side than the other in most (${ lopsided } of 20 by 1.5 km, 12 km down it)` );

}

// ---- a shower: towering cumulus, no anvil
{

	const c = { x: 0, z: 0, r: 2000, rain: 0.5, thunder: 0, n: 3 };
	stormMap( [ c ], data, UX, UZ, BASE, DEPTH );
	const m = turrets( c, 0 )[ 0 ], top = at( m.x, m.z ), [ lo, hi ] = CB.congestus;
	check( top.r > 0.85 && top.top > lo && top.top < hi && top.top < CB.top - 2000, `a shower's tower lower (${ top.top.toFixed( 0 ) } m: between ${ lo } and ${ hi })` );
	check( top.mass === 0, 'no broad mass at its foot' );
	let anvil = 0;
	for ( let o = 2; o < data.length; o += 4 ) anvil = Math.max( anvil, data[ o ] );
	check( anvil === 0, 'and no anvil' );
	stormMap( [ { ...c, rain: 0.06 } ], data, UX, UZ, BASE, DEPTH );
	const light = at( m.x, m.z );
	stormMap( [ { ...c, rain: 1 } ], data, UX, UZ, BASE, DEPTH );
	const heavy = at( m.x, m.z );
	check( light.top < heavy.top - 2000, `a light shower's tower lower than a downpour's (${ light.top.toFixed( 0 ) } m, ${ heavy.top.toFixed( 0 ) } m)` );
	check( stormMap( [ { ...c, rain: 0.01 } ], data, UX, UZ, BASE, DEPTH ) === 0, 'none for a sprinkle' );

}

// ---- a hurricane's own cloud
{

	const cells = [ { x: 0, z: 20000, r: 2500, rain: 0.9, thunder: 0.8, n: 7 } ], m = turrets( cells[ 0 ] )[ 0 ];
	stormMap( cells, data, UX, UZ, BASE, DEPTH );
	const all = at( m.x, m.z ).top - BASE;
	stormMap( cells, data, UX, UZ, BASE, DEPTH, 0.5 );
	const half = ( at( m.x, m.z ).top - BASE ) / all;
	check( stormMap( cells, data, UX, UZ, BASE, DEPTH, 1 ) === 0 && data.every( ( v ) => v === 0 ), `none in a hurricane's own cloud (half as tall at half its share: ${ half.toFixed( 2 ) })` );

}

// ---- the march's bound, and the map's edge
{

	const cells = [ { x: 3000, z: - 6000, r: 3000, rain: 1, thunder: 1, n: 1 }, { x: - 30000, z: 25000, r: 1500, rain: 0.4, thunder: 0.3, n: 2 }, { x: 44000, z: 0, r: 3000, rain: 1, thunder: 1, n: 3 } ];
	stormMap( cells, data, 0.6, 0.8, BASE, DEPTH );
	// (every texel within half a stride, a turret's side bulging out, a texel's half-diagonal and a tower's lean
	// along half a stride of one with cloud is bound: near a tower, as a tower's)
	const near = CB.stride / 2 + CB.warp + cell * Math.SQRT1_2 + CB.lean * CB.stride / 2, reach = Math.ceil( near / cell );
	let missed = 0, edge = 0;
	for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) {

		const o = ( j * N + i ) * 4;
		if ( ( i === 0 || j === 0 || i === N - 1 || j === N - 1 ) && ( data[ o ] || data[ o + 2 ] || data[ o + 3 ] ) ) edge ++;
		if ( ! data[ o ] && ! data[ o + 2 ] ) continue;
		for ( let dj = - reach; dj <= reach; dj ++ ) for ( let di = - reach; di <= reach; di ++ ) {

			const ii = i + di, jj = j + dj;
			if ( ii < 1 || jj < 1 || ii > N - 2 || jj > N - 2 || Math.hypot( di, dj ) * cell > near ) continue;
			if ( data[ ( jj * N + ii ) * 4 + 3 ] < ( data[ o ] ? 128 : 64 ) ) missed ++;

		}

	}

	check( near <= CB.margin && missed === 0, `the march's bound covers every tower and anvil, and ${ near.toFixed( 0 ) } m about them (${ missed } texels missed)` );
	check( edge === 0, 'nothing on the map\'s edge (it\'s clamped there)' );

}

// ---- a picked thunderstorm's cells: how many, and how long the map takes a frame
{

	const T = islandTime( 3, 15 ), cells = showers( T, 'storm', STORM_RANGE, [], new Map() );
	let n = stormMap( cells, data, 0.6, 0.8, BASE - 500, DEPTH );
	check( n > 0 && n <= cells.length, `a picked thunderstorm: ${ n } of its ${ cells.length } cells tower on the map` );
	// (a few cells a frame make the same map, none of them long: each frame's its best of ten, past a pause)
	const parts = new Uint8Array( data.length ), best = [];
	let m = 0;
	for ( let k = 0; k < 10; k ++ ) {

		m = 0;
		for ( let i = 0, f = 0; i < cells.length; i += STORM_CELLS, f ++ ) {

			const t0 = performance.now();
			m += stormMap( cells, parts, 0.6, 0.8, BASE - 500, DEPTH, 0, i, i + STORM_CELLS );
			best[ f ] = Math.min( best[ f ] ?? Infinity, performance.now() - t0 );

		}

	}
	const worst = Math.max( ...best );
	n = stormMap( cells, data, 0.6, 0.8, BASE - 500, DEPTH );
	check( m === n && parts.every( ( v, i ) => v === data[ i ] ), `made ${ STORM_CELLS } cells at a time, the same map` );
	check( worst < 2, `none of its frames long (at most ${ worst.toFixed( 2 ) } ms, every ${ CB.every } s)` );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
