// (M17, stream 2) Plain-node tests of the tide seen and fished by: the wet line the ground and the rocks dry back from
// (world/shore/Tide.js), the tide's stage and the bites by it at each place on the flats and at the pier (Tide.js,
// game/Bites.js), the creeks running on it (world/shore/Creeks.js: out on the ebb, in on the flood, as much water as the
// tide covers upstream), the chart's datum and its drying ground (game/ChartBake.js), and the day's tides on Joe's slate
// (game/ForecastSlate.js) and the chart.
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FLATS, flatsAt } from '../src/world/terrain/Flats.js';
import { MANGROVE } from '../src/world/terrain/Mangrove.js';
import { tideAt, tideTurns } from '../src/game/IslandClock.js';
import { DATUMS, DRAIN, wetLine, stageOf, tidePlace, tideBites, MOUTHS, tidesOf, tideText } from '../src/world/shore/Tide.js';
import { Creeks, CHANNELS } from '../src/world/shore/Creeks.js';
import { biteDelay } from '../src/game/Bites.js';
import { SheetBake, S52, CHART_DATUM, COAST, chartDepth } from '../src/game/ChartBake.js';
import { slateText } from '../src/game/ForecastSlate.js';
import { KayakModel } from '../src/world/boat/kayak/KayakModel.js';
import { BoatController } from '../src/player/BoatController.js';
import { G } from '../src/core/Globals.js';
import { Vector3 } from '../src/engine/index.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const near = ( a, b, e ) => Math.abs( a - b ) <= e;

// ---- the datums: NOAA's for Settlement Point, about its mean sea level
ok( near( DATUMS.MLLW, - 0.446, 0.001 ) && near( DATUMS.MHW, 0.415, 0.001 ) && DATUMS.LAT < DATUMS.MLLW && DATUMS.HAT > DATUMS.MHHW, 'the datums: MLLW -0.446, MHW +0.415 m about the mean (NOAA 9710441)' );
// and the game's tide sits on them: over a year of island days its mean low and high water within 5 cm of NOAA's
{

	let lo = 0, nl = 0, hi = 0, nh = 0, lowest = Infinity;
	for ( const t of tideTurns( 0, 24 * 365 ) ) {

		if ( t.high ) { hi += t.height; nh ++; } else { lo += t.height; nl ++; lowest = Math.min( lowest, t.height ); }

	}

	ok( near( lo / nl, DATUMS.MLW, 0.05 ) && near( hi / nh, DATUMS.MHW, 0.05 ), `the game's mean low and high water ${ ( lo / nl ).toFixed( 3 ) } and ${ ( hi / nh ).toFixed( 3 ) } m, NOAA's ${ DATUMS.MLW } and ${ DATUMS.MHW }` );

}

// ---- the wet line: never under the tide, the tide itself on a flood, behind it on an ebb by the hour and a half
{

	let under = 0, floodOff = 0, ebbBehind = 0, n = 0;
	for ( let T = 0; T < 24 * 30; T += 0.37 ) {

		const w = wetLine( T ), y = tideAt( T ), y0 = tideAt( T - DRAIN );
		if ( w < y - 1e-9 ) under ++;
		const rising = tideAt( T - 0.25 ) < y && y0 < tideAt( T - DRAIN + 0.25 );
		if ( rising && Math.abs( w - y ) > 1e-6 ) floodOff ++;
		if ( ! rising && w < y0 - 0.02 && tideAt( T - 0.25 ) > y ) ebbBehind ++;
		n ++;

	}

	ok( under === 0, `the wet line never under the sea (${ n } times over a month)` );
	ok( floodOff === 0, 'on a flood, the wet line is the sea itself (the ground it covers is wet, what\'s above it\'s dried)' );
	ok( ebbBehind === 0, 'on an ebb, the wet line is where the sea stood the hour and a half before' );
	// at a spring low water, the bars' tops pale first: the wet line a little over the low
	const lows = tideTurns( 24 * 7, 24 * 10 ).filter( ( t ) => ! t.high ).sort( ( a, b ) => a.height - b.height );
	const L = lows[ 0 ], w = wetLine( L.T );
	ok( w > L.height + 0.05 && w < L.height + 0.3, `at a spring low (${ L.height.toFixed( 2 ) } m) the wet line's ${ w.toFixed( 2 ) } m: the flat's lows wet, its bars' tops drying` );

}

// ---- the stage
{

	let both = 0, highAtHigh = 0, lowAtLow = 0, turns = 0, turnAt = 0, n = 0;
	for ( let T = 100; T < 100 + 24 * 14; T += 0.21 ) {

		const s = stageOf( T );
		if ( s.flood > 0 && s.ebb > 0 ) both ++;
		n ++;

	}

	for ( const t of tideTurns( 100, 100 + 24 * 14 ) ) {

		const s = stageOf( t.T + 0.02 );
		turns ++;
		if ( s.turn > 0.95 ) turnAt ++;
		if ( t.high && s.high > 0.99 && s.low === 0 ) highAtHigh ++;
		if ( ! t.high && s.low > 0.99 && s.high === 0 ) lowAtLow ++;

	}

	ok( both === 0, `never flooding and ebbing at once (${ n } times)` );
	ok( turnAt === turns, `slack at every turn (${ turnAt } of ${ turns })` );
	ok( highAtHigh + lowAtLow === turns, `high water's hours at every high, low water's at every low (${ highAtHigh + lowAtLow } of ${ turns })` );
	const mid = tideTurns( 200, 220 ), a = mid[ 0 ], b = mid[ 1 ], s = stageOf( ( a.T + b.T ) / 2 );
	ok( ( a.high ? s.ebb : s.flood ) > 0.99 && s.turn === 0, `half way between two turns it's running (${ a.high ? 'ebb' : 'flood' } ${ ( a.high ? s.ebb : s.flood ).toFixed( 2 ) }), no slack` );

}

// ---- where on the flats, and the bites there by the stage
{

	const home = [ - 660, - 190 ], edge = flatsEdgePoint(), mouth = MOUTHS[ 0 ], creek = FLATS.creeks[ 0 ].line[ 5 ];
	const P = ( x, z ) => ( { ...tidePlace( x, z ) } );
	const pm = P( mouth[ 0 ], mouth[ 1 ] ), pc = P( creek[ 0 ], creek[ 1 ] ), pe = P( edge[ 0 ], edge[ 1 ] ), pf = P( home[ 0 ], home[ 1 ] ), off = P( 60, 30 );
	ok( pm.mouth > 0.99, `a creek's mouth (${ mouth.join( ', ' ) }) is its mouth` );
	ok( pc.channel > 0.5 && pc.mouth === 0, `a creek's water up from its mouth is a channel (${ pc.channel.toFixed( 2 ) })` );
	ok( pe.edge > 0.5, `the flat's edge is its edge (${ pe.edge.toFixed( 2 ) })` );
	ok( pf.flat > 0.9, `out on the sand it's the flat's top (${ pf.flat.toFixed( 2 ) })` );
	ok( off.flat + off.edge + off.channel + off.mouth === 0, 'the bay\'s nowhere on the flats' );
	ok( MOUTHS.length === 4, `four mouths: the three creeks out to the edge, and the mangrove creek onto the flat (${ MOUTHS.length })` );
	const st = ( k ) => ( { flood: 0, ebb: 0, high: 0, low: 0, turn: 0, ...k } );
	const highW = st( { high: 1 } ), lowW = st( { low: 1 } ), ebb = st( { ebb: 1 } ), flood = st( { flood: 1, high: 1 } ), slack = st( { turn: 1, high: 1 } );
	ok( tideBites( pf, highW ) > 1.3 && tideBites( pf, flood ) > tideBites( pf, highW ) && tideBites( pf, lowW ) < 0.5, `the flat: ${ tideBites( pf, flood ).toFixed( 2 ) } on the flood, ${ tideBites( pf, highW ).toFixed( 2 ) } at high water, ${ tideBites( pf, lowW ).toFixed( 2 ) } at low` );
	ok( tideBites( pe, ebb ) > 1.4 && tideBites( pe, ebb ) > tideBites( pe, flood ), `the edge: ${ tideBites( pe, ebb ).toFixed( 2 ) } on the ebb, ${ tideBites( pe, flood ).toFixed( 2 ) } on the flood` );
	ok( tideBites( pc, ebb ) > 1.3 && tideBites( pc, slack ) < 1, `a channel: ${ tideBites( pc, ebb ).toFixed( 2 ) } on the ebb, ${ tideBites( pc, slack ).toFixed( 2 ) } slack` );
	ok( tideBites( pm, ebb ) > 1.7 && tideBites( pm, flood ) < 1, `a creek's mouth: ${ tideBites( pm, ebb ).toFixed( 2 ) } on the ebb, ${ tideBites( pm, flood ).toFixed( 2 ) } on the flood` );
	ok( tideBites( off, slack, 1 ) > 1.4 && tideBites( off, ebb, 1 ) < 1, `the pier: ${ tideBites( off, slack, 1 ).toFixed( 2 ) } at the turn, ${ tideBites( off, ebb, 1 ).toFixed( 2 ) } with the tide running` );
	ok( tideBites( off, ebb, 0 ) === 1 && tideBites( off, slack, 0 ) === 1, 'the bay away from the pier as it always was, whatever the tide' );
	// biteDelay: the habitat's tide factor makes the bites that much sooner, the same draw
	const h = { shallows: 1, wash: 0.5 }, seq = () => () => 0.6;
	const d1 = biteDelay( h, 10, seq() ), d2 = biteDelay( { ...h, tide: 2 }, 10, seq() );
	ok( near( d2 - 2, ( d1 - 2 ) / 2, 1e-9 ), `a spot fishing twice as well on the tide bites twice as soon (${ d1.toFixed( 2 ) } -> ${ d2.toFixed( 2 ) } s)` );

}

// the flat's edge at a point: walked out from its top until it's the edge
function flatsEdgePoint() {

	const f = {};
	for ( let x = - 700; x > - 900; x -= 2 ) {

		flatsAt( x, - 180, f );
		if ( f.edge < 2 ) return [ x, - 180 ];

	}

	return [ - 780, - 180 ];

}

// ---- the creeks, on low's bake and the 1 m one
const bake = ( f ) => decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) ) );
for ( const file of [ 'island-1024.bin', 'island.bin' ] ) {

	const T = new TerrainData( 7, bake( file ) ), tag = `(${ T.texel } m)`, H = ( x, z ) => T.heightAt( x, z );
	const C = new Creeks( H );
	let steps = 0;
	while ( ! C.build( 2 ) ) steps ++;
	ok( steps > 0, `${ tag } its tables worked out a little at a time (${ steps + 1 } goes of 2 ms)` );
	const spring = - 0.28; // m an island hour: a spring's mid-ebb
	// down each creek toward its mouth on the ebb, up it on the flood, the same speed
	let down = 0, up = 0, n = 0, fastest = 0, slowest = Infinity;
	CHANNELS.forEach( ( c ) => c.P.forEach( ( p, k ) => {

		if ( k === 0 || k === c.P.length - 1 ) return;
		const e = C.at( p.x, p.z, 0, spring ), f = C.at( p.x, p.z, 0, - spring ), s = Math.hypot( e.x, e.z );
		if ( s === 0 ) return;
		n ++;
		if ( e.x * p.tx + e.z * p.tz < 0 ) down ++;
		if ( f.x * p.tx + f.z * p.tz > 0 ) up ++;
		fastest = Math.max( fastest, s );
		slowest = Math.min( slowest, s );

	} ) );
	ok( n > 100 && down === n && up === n, `${ tag } at ${ n } points along the creeks: down them on the ebb, up them on the flood` );
	ok( fastest > 0.08 && fastest < 0.6 && slowest > 0, `${ tag } a spring's mid-tide: ${ ( slowest * 100 ).toFixed( 1 ) } to ${ ( fastest * 100 ).toFixed( 0 ) } cm/s (a few cm/s to a decimetre or two, as real mangrove creeks run)` );
	// as much water through a creek's mouth as the tide covers upstream: what goes in at the mangrove creek's mouth goes on
	// down the main creek, with what the main creek's own flat adds
	const m0 = CHANNELS[ 7 ].P[ 0 ], c0 = CHANNELS[ 0 ].P.at( - 2 ), c00 = CHANNELS[ 0 ].P[ 1 ];
	const qm = C.at( m0.x, m0.z, 0.2, spring ).q, qc = C.at( c0.x, c0.z, 0.2, spring ).q, qmouth = C.at( c00.x, c00.z, 0.2, spring ).q;
	ok( qm < 0 && qc <= qm * 0.98 && qmouth < qc, `${ tag } flow builds down the creeks: ${ ( - qm ).toFixed( 2 ) } m3/s out of the mangroves, ${ ( - qc ).toFixed( 2 ) } at the main creek's head, ${ ( - qmouth ).toFixed( 2 ) } at its mouth` );
	// the prism: at its mouth, the main creek carries the rate times the wet area upstream (some hectares)
	const ha = - qmouth / ( - spring / 3600 ) / 1e4;
	ok( ha > 1.5 && ha < 12, `${ tag } its mouth drains ${ ha.toFixed( 1 ) } ha of flat and mangrove (the flats are about 10)` );
	// slack water, dry ground and the bay: nothing
	const p = CHANNELS[ 0 ].P[ 10 ];
	ok( C.at( p.x, p.z, 0, 0 ).x === 0, `${ tag } still at slack water` );
	const pool = [ MANGROVE.pool.x, MANGROVE.pool.z ];
	ok( Math.hypot( C.at( pool[ 0 ] + 200, pool[ 1 ], 0, spring ).x ) === 0 && C.at( 60, 30, 0, spring ).x === 0, `${ tag } nothing off the creeks, nor in the bay` );
	// on the ebb at a low the creek's still running, but less water's moving: the flat's bared
	const lowQ = C.at( c00.x, c00.z, - 0.55, spring ).q;
	ok( Math.abs( lowQ ) < Math.abs( qmouth ) * 0.6, `${ tag } with the flat bared, less going out its mouth (${ ( - lowQ ).toFixed( 2 ) } m3/s at -0.55 m, ${ ( - qmouth ).toFixed( 2 ) } at +0.2)` );

}

// ---- a kayak in a creek's current, in still air: carried at its speed drifting, and paddling, faster with it than against
{

	const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
	G.windSpeed.value = 0;
	let t = 0;
	const kayak = ( c ) => {

		const ctl = new BoatController( { model: new KayakModel(), query, terrain: { heightAt: () => - 3 }, colliders: null } );
		ctl.position.set( 0, 0, 0 );
		ctl.moored = false;
		ctl.beached = false;
		ctl.driven = true;
		const fwd = ctl.forward( new Vector3() );
		ctl.currentAt = c ? ( x, z, out ) => {

			out.x = fwd.x * c;
			out.z = fwd.z * c;
			return out;

		} : null;
		return { ctl, fwd };

	};
	const run = ( ctl, seconds, th ) => {

		for ( let f = 0, n = Math.round( seconds * 60 ); f < n; f ++ ) {

			t += 1 / 60;
			query.version ++;
			query.resultTime = t;
			ctl.setInput( th, 0, 1 / 60 );
			ctl.update( 1 / 60 );

		}

	};
	const along = ( k ) => k.ctl.velocity.x * k.fwd.x + k.ctl.velocity.z * k.fwd.z;
	const c = 0.12, drift = kayak( c );
	run( drift.ctl, 30, 0 );
	const v30 = along( drift );
	run( drift.ctl, 210, 0 );
	ok( v30 > c * 0.4 && near( along( drift ), c, c * 0.1 ), `drifting in a creek running ${ c } m/s she's carried with it: ${ v30.toFixed( 3 ) } m/s in half a minute, ${ along( drift ).toFixed( 3 ) } in four` );
	const still = kayak( 0 ), withIt = kayak( c ), against = kayak( - c );
	for ( const k of [ still, withIt, against ] ) run( k.ctl, 40, 1 );
	const v0 = along( still ), v1 = along( withIt ), v2 = along( against );
	ok( near( v1 - v0, c, 0.03 ) && near( v0 - v2, c, 0.03 ), `paddling: ${ v0.toFixed( 2 ) } m/s in still water, ${ v1.toFixed( 2 ) } with the creek, ${ v2.toFixed( 2 ) } against it` );

}

// ---- the chart: depths below chart datum, the coast at high water, drying ground between
{

	ok( CHART_DATUM === DATUMS.MLLW && COAST === DATUMS.MHW, 'the chart\'s datum MLLW, its coast the MHW line, as a US chart\'s' );
	ok( near( chartDepth( - 3 ), 2.554, 1e-9 ) && chartDepth( 0 ) < 0, `a sounding's below datum: 3 m under the mean is ${ chartDepth( - 3 ).toFixed( 2 ) } m; the mean's ground dries` );
	// a sheet of a sloping shore: land, drying, then the shallows
	const spec = { x0: 0, z0: 0, ext: 100, cell: 1 }, b = new SheetBake( spec, 100, { island: false } );
	const T = { heightAt: ( x ) => 1.5 - x * 0.08 }; // 1.5 m at x 0 falling to -6.5 at x 100
	while ( ! b.step( T, 100 ) );
	const at = ( x ) => {

		const o = ( 50 * 100 + x ) * 4;
		return [ b.rgba[ o ], b.rgba[ o + 1 ], b.rgba[ o + 2 ] ];

	};
	const same = ( c, d ) => c[ 0 ] === d[ 0 ] && c[ 1 ] === d[ 1 ] && c[ 2 ] === d[ 2 ];
	ok( same( at( 5 ), S52.LANDA ), 'above high water, land' );
	ok( same( at( 17 ), S52.DEPIT ), 'between high water and datum (the mean\'s +0.1 m), drying ground: S-52\'s green' );
	ok( same( at( 60 ), S52.DEPVS ), 'below datum, the shallows\' blue' );
	const s = b.soundings( 'near' );
	ok( s.length > 0 && s.every( ( q ) => near( q.d, chartDepth( T.heightAt( q.x ) ), 0.03 ) ), `its ${ s.length } soundings are below datum` );

}

// ---- the day's tides: on the chart a tide table's (each turn's time and its height over datum, in feet), on Joe's slate
// the next two
{

	const day = tidesOf( 3 );
	ok( day.length >= 3 && day.length <= 4 && day.every( ( t ) => t.T >= 48 && t.T < 72 ), `day 3's tides: ${ day.length } turns in the day` );
	ok( day.every( ( t ) => near( t.datum, t.height - DATUMS.MLLW, 1e-9 ) ), 'each told over chart datum, as a tide table has it' );
	const text = tideText( day[ 0 ], 'en-US' );
	ok( /^(High|Low) \d{1,2}:\d{2}\s?[AP]M,? -?\d+\.\d ft$/.test( text ), `told as a table does: "${ text }"` );
	const w = { id: 'fair', wind: 6, rain: 0, surf: 0.3, west: 0, period: 9, front: 0, murk: 0, north: 0.2, overcast: 0 };
	const rows = slateText( w, null, 'en-US', null, tideTurns( 50, 63 ) ).rows, row = rows.find( ( r ) => r[ 0 ] === 'Tide' );
	ok( row && /High/.test( row[ 1 ] ) && /low/i.test( row[ 1 ] ), `Joe's slate: "${ row ? row[ 1 ] : '' }"` );
	ok( ! slateText( w, null, 'en-US', null ).rows.some( ( r ) => r[ 0 ] === 'Tide' ), 'and none when it isn\'t given the tide' );

}

if ( fails ) {

	console.log( `\n${ fails } failed` );
	process.exit( 1 );

}

console.log( '\ntide-seen: all passed' );
