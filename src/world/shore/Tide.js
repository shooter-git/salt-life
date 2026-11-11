import { tideAt, tideState, tideTurns, timeText } from '../../game/IslandClock.js';
import { FT } from '../../game/Units.js';
import { flatsAt, FLATS } from '../terrain/Flats.js';
import { MANGROVE } from '../terrain/Mangrove.js';

// (M17, stream 2) The tide, seen and fished by: what the island's tide (IslandClock) means for the ground it bares and
// floods, and for the fish. Pure: the same on every device from the island's time (T, island hours since day 1 began).
//   DATUMS               Settlement Point's tidal datums (m about mean sea level, the island's 0)
//   wetLine( T )         the highest the tide's stood in the last DRAIN island hours: ground below it is still wet
//   stageOf( T, out )    the tide's stage: flooding or ebbing and how hard, near high or low water, at the turn
//   tidePlace( x, z )    where a spot is on the flats: their top, their edge, a channel, a creek's mouth
//   tideBites( place, stage, pier )   how much faster (> 1) or slower the bites come there now (Bites: habitat.tide)
//   tidesOf( day )       the island day's tides, as a tide table gives them;  tideText( turn, locale ) one of them told
//   datumFeet( height )  a height as the tide table gives it: feet over chart datum

// NOAA CO-OPS' datums for Settlement Point, Grand Bahama (9710441, the 1983-2001 epoch), as heights about its mean sea
// level: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9710441/datums.json (MSL 12.207 m on the
// station's datum). A chart's depths are below its chart datum, MLLW on a US chart; its coast is the MHW line
export const DATUMS = { HAT: 0.804, MHHW: 0.488, MHW: 0.415, MSL: 0, MLW: - 0.419, MLLW: - 0.446, LAT: - 0.692 };

// how long ground the tide's left stays wet (island hours): the flats' fine sand holds its water through a low water
// and the rock's film goes in the sun within the hour or two, so the bars' tops come up pale as the tide falls on
// (photographs of bared flats at low water: a mottle of pale sand on the rises and dark, wet sand in the lows, water
// lying in the hollows); the swash's own band is the ground's, from the sea as it is (TerrainSurface)
export const DRAIN = 1.5;

// the wet line at T (m about mean sea level): the highest the tide's stood in the last DRAIN hours (its samples a
// quarter hour apart: a tide's top is flat to a centimetre over that)
export function wetLine( T ) {

	let y = tideAt( T );
	for ( let k = 1; k <= DRAIN * 4; k ++ ) y = Math.max( y, tideAt( T - k * 0.25 ) );
	return y;

}

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// the tide's stage at T, each 0..1 but `rate` (m an island hour) and `phase` (0 low water, 0.5 high, as far through the
// cycle as it is by the clock between its turns):
//   flood, ebb   running in or out, once it's away from its turns (gone within half an hour of one, full by 1.5 h)
//   high         about high water: from about 3 h into the flood to about 3 h into the ebb (the bonefish's hours on the
//                flats at Cape Eleuthera: Murchie et al. 2013), fading over the hour either side
//   low          about low water, the same either side of it
//   turn         at a turn, slack water: within half an hour of one, gone by 1.25 h
export function stageOf( T, out = {} ) {

	const s = tideState( T ), span = Math.max( s.since + s.to, 1e-3 ), f = s.since / span;
	const away = smooth( 0.3, 1.5, s.since ) * smooth( 0.3, 1.5, s.to );
	out.rate = s.rate;
	out.phase = s.flood ? f / 2 : 0.5 + f / 2;
	out.flood = s.flood ? away : 0;
	out.ebb = s.flood ? 0 : away;
	// (hours from high water, and from low)
	const fromHigh = s.flood ? s.to : s.since, fromLow = s.flood ? s.since : s.to;
	out.high = smooth( 4, 3, fromHigh );
	out.low = smooth( 4, 3, fromLow );
	out.turn = 1 - smooth( 0.5, 1.25, Math.min( s.since, s.to ) );
	out.height = s.height;
	out.next = s.next;
	return out;

}

// where the flats' creeks meet the sea at their edge (their first points: the others are branches, from where they
// join), and where the mangrove creek comes out onto the flat
export const MOUTHS = [ ...FLATS.creeks.filter( ( c ) => ! FLATS.creeks.some( ( o ) => o !== c && o.line.some( ( p ) => p[ 0 ] === c.line[ 0 ][ 0 ] && p[ 1 ] === c.line[ 0 ][ 1 ] ) ) )
	.map( ( c ) => c.line[ 0 ] ), MANGROVE.creek[ 0 ] ];
const MOUTH_R = [ 24, 45 ]; // m: a mouth's water, fading out to

// where ( x, z ) is on the flats, each 0..1 and together at most 1 (a mouth first, then a channel, the edge, the top):
//   mouth    a creek's mouth: where it meets the sea at the flats' edge, or where the mangrove creek comes out
//   channel  a creek's or a pothole's water, inside the flat
//   edge     the flat's edge, inside and out: the drop the permit, the sharks and the barracuda cruise
//   flat     the flat's top, its sand and grass
const PLACE = { mouth: 0, channel: 0, edge: 0, flat: 0 }, _f = {};
export function tidePlace( x, z, out = PLACE ) {

	out.mouth = out.channel = out.edge = out.flat = 0;
	const F = flatsAt( x, z, _f );
	let mouth = 0;
	for ( const [ mx, mz ] of MOUTHS ) mouth = Math.max( mouth, smooth( MOUTH_R[ 1 ], MOUTH_R[ 0 ], Math.hypot( x - mx, z - mz ) ) );
	const near = F.ends * smooth( - 40, - 10, F.edge );
	if ( near <= 0 && mouth <= 0 ) return out;
	out.mouth = mouth;
	let left = 1 - mouth;
	out.channel = left * F.creek * near;
	left -= out.channel;
	out.edge = left * near * smooth( 30, 10, Math.abs( F.edge ) );
	left -= out.edge;
	out.flat = left * F.on;
	return out;

}

// (M17) the bites by the tide's stage, as the flats are fished (docs/m17/sources-tide-fish.md, the guides): how much
// faster than now's the bites come (1: as they always did), at each place, by the stage
//   flat     on the flood and about high water, when the fish come up onto it; little at low water (and none on the sand
//            the tide's bared: Bites.habitatAt)
//   edge     the falling tide, the fish coming off the flat with the bait
//   channel  the ebb, the bait carried down the creeks
//   mouth    the ebb most of all, the creek emptying out past the fish waiting at its mouth
//   pier     at the turn, the slack water
export const TIDE_BITES = {
	flat: { base: 0.35, high: 1.0, flood: 0.3 },
	edge: { base: 0.8, ebb: 0.7, flood: 0.2 },
	channel: { base: 0.7, ebb: 0.7, flood: 0.3 },
	mouth: { base: 0.7, ebb: 1.1, flood: 0.2 },
	pier: { base: 0.8, turn: 0.7 },
};

// place: tidePlace's; stage: stageOf's; pier: the spot's share of the pier's water (Bites' habitat.pier, 0..1)
export function tideBites( place, stage, pier = 0 ) {

	let x = 1, w = 0;
	for ( const k of [ 'mouth', 'channel', 'edge', 'flat' ] ) {

		const p = place[ k ];
		if ( ! ( p > 0 ) ) continue;
		const B = TIDE_BITES[ k ];
		let f = B.base;
		for ( const s of [ 'high', 'flood', 'ebb', 'turn' ] ) if ( B[ s ] ) f += B[ s ] * stage[ s ];
		x += p * ( f - 1 );
		w += p;

	}

	if ( pier > 0 && w < 1 ) {

		const B = TIDE_BITES.pier, p = Math.min( pier, 1 - w );
		x += p * ( B.base + B.turn * stage.turn - 1 );

	}

	return x;

}

// (M17) the island day's tides (day 1 the first, 0:00 to 24:00): each turn { T, height (m about the mean), high, datum: its
// height over chart datum (m), as a tide table and the chart give it }
export function tidesOf( day ) {

	const T0 = ( Math.max( 1, Math.floor( day ) || 1 ) - 1 ) * 24;
	return tideTurns( T0, T0 + 24 ).map( ( t ) => ( { ...t, datum: t.height - DATUMS.MLLW } ) );

}

// a height (m about mean sea level) as a US tide table gives it: feet over chart datum, to a tenth ('3.1'; a low under
// it, at a big spring, goes negative)
export function datumFeet( height ) {

	const f = ( height - DATUMS.MLLW ) / FT;
	return ( Math.abs( f ) < 0.05 ? 0 : f ).toFixed( 1 );

}

// a turn told as a US tide table tells it: 'High 12:35 PM, 3.1 ft'
export function tideText( t, locale = undefined ) {

	return `${ t.high ? 'High' : 'Low' } ${ timeText( t.T % 24, locale, 1 ) }, ${ datumFeet( t.height ) } ft`;

}
