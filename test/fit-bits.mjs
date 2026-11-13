// (M19) The fit a boat's pose carries (together/BoatCopies.fitWire), read by a game from before M19: M19's fittings go
// past the bits M17's game reads (EXTRA_SHIFT), and its new states of how she is just now after the console's ladder,
// so an M17 game reads every boat's first four bits, her paint and her ladder as it always did, whatever M19 adds; and
// M19's own reading gets back everything that was sent.
//   node test/fit-bits.mjs
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1, addEventListener() {} };
globalThis.document = globalThis.document || { createElement: () => ( { style: {}, getContext: () => null } ) };
const { fitWire, fitStats, fitPaint, STILL, WALKED } = await import( '../src/together/BoatCopies.js' );
const { PAINTS } = await import( '../src/game/fleet/Fleet.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

// ---- M17's reading, as v2.4.1 has it (frozen here: never to be changed)
const M17 = {
	FITS: {
		kayak: { stats: ( [ crate, finder, trolley ] ) => ( { holdKg: crate ? 13 : 12, finder, trolley } ) },
		console: { stats: ( [ twin, tTop, diveLadder, tankRack ] ) => ( { twin, tTop, diveLadder, tankRack } ), now: [ 'ladderDown' ] },
		sportfisher: { stats: ( [ tower, outriggers, chair ] ) => ( { tower, outriggers, chair } ) },
	},
	PAINT_SHIFT: 4, NOW_SHIFT: 8,
};
M17.STILL = ( 1 << M17.NOW_SHIFT ) - 1;
const m17Stats = ( id, f ) => {

	const F = M17.FITS[ id ];
	if ( ! F ) return {};
	const s = F.stats( [ 0, 1, 2, 3 ].map( ( i ) => !! ( f & 1 << i ) ) );
	if ( F.now ) F.now.forEach( ( k, i ) => s[ k ] = !! ( f & 1 << ( M17.NOW_SHIFT + i ) ) );
	return s;

};
const m17Paint = ( f ) => {

	const p = PAINTS[ ( ( f & M17.STILL ) >> M17.PAINT_SHIFT ) - 1 ];
	return p ? p.hex : null;

};

// every combination of what each boat sends, M17's and M19's, each paint and none, and how she is just now
const SENT = {
	kayak: { old: [ [ 'holdKg', 25, 12 ], [ 'finder', true, false ], [ 'trolley', true, false ] ], new: [ [ 'stakeM', 2.9, 0 ], [ 'pedal', true, false ] ], now: [ 'staked' ] },
	console: { old: [ [ 'twin', true, false ], [ 'tTop', true, false ], [ 'diveLadder', true, false ], [ 'tankRack', true, false ] ], new: [ [ 'trollingN', 498, 0 ], [ 'stakeM', 2.4, 0 ], [ 'radar', true, false ] ], now: [ 'ladderDown', 'poleDown', 'motorDown' ] },
	sportfisher: { old: [ [ 'tower', true, false ], [ 'outriggers', true, false ], [ 'chair', true, false ] ], new: [ [ 'teasers', true, false ] ], now: [] },
};
const paints = [ null, ...PAINTS.map( ( p ) => p.id ) ];

for ( const [ id, S ] of Object.entries( SENT ) ) {

	const all = [ ...S.old, ...S.new ], n = all.length + S.now.length;
	let m17Same = true, roundTrip = true, paintSame = true, walkSame = true, cases = 0;
	for ( let mask = 0; mask < 1 << n; mask ++ ) for ( const paint of paints ) {

		const stats = {}, now = {};
		all.forEach( ( [ k, on, off ], i ) => stats[ k ] = mask & 1 << i ? on : off );
		S.now.forEach( ( k, i ) => now[ k ] = !! ( mask & 1 << ( all.length + i ) ) );
		const f = fitWire( id, stats, paint, now );
		// what M17 sent for the same boat, M19's fittings aside
		const old = {};
		for ( const [ k, , off ] of S.new ) old[ k ] = off;
		const f17 = fitWire( id, { ...stats, ...old }, paint, { ladderDown: now.ladderDown } );
		const a = m17Stats( id, f ), b = m17Stats( id, f17 );
		if ( JSON.stringify( a ) !== JSON.stringify( b ) ) m17Same = false;
		if ( m17Paint( f ) !== m17Paint( f17 ) || fitPaint( f ) !== m17Paint( f ) ) paintSame = false;
		// M19 reads back what was sent
		const r = fitStats( id, f );
		const want = id === 'kayak' ? { stakePole: stats.stakeM > 0, pedal: stats.pedal, staked: now.staked }
			: id === 'console' ? { trolling: stats.trollingN > 0, powerPole: stats.stakeM > 0, radar: stats.radar, ladderDown: now.ladderDown, poleDown: now.poleDown, motorDown: now.motorDown }
				: { teasers: stats.teasers };
		for ( const [ k, v ] of Object.entries( want ) ) if ( r[ k ] !== !! v ) roundTrip = false;
		// what's walked: her fittings, never how she is just now
		if ( ( f & WALKED ) !== ( fitWire( id, stats, paint ) & WALKED ) ) walkSame = false;
		cases ++;

	}

	ok( m17Same, `${ id }: an M17 game reads her four bits and her ladder the same, whatever M19 adds (${ cases } fits)` );
	ok( paintSame, `${ id }: and her paint, as M19 does` );
	ok( roundTrip, `${ id }: M19's fittings and how she is just now read back as sent` );
	ok( walkSame, `${ id }: what's walked on her copy is her fit, not how she is just now` );

}

ok( ( STILL & WALKED ) === STILL && ( WALKED & ( 0x7 << 8 ) ) === 0, 'WALKED keeps M17\'s fit and paint, and leaves out how she is just now' );

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
