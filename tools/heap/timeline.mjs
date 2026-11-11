// (M17) A probe's script memory (probe.mjs) as a timeline: each bucket's lowest and highest reading (the lowest is
// near what's live; the highest what the budget sees), with the game's marks and the script's steps in it.
//   node tools/heap/timeline.mjs <out.json> [bucket, s = 2]
import { readFileSync } from 'node:fs';
const [ path, bucketS = '2' ] = process.argv.slice( 2 );
const d = JSON.parse( readFileSync( path, 'utf8' ) );
const MB = 1048576, B = + bucketS * 1000;
const t0 = d.rows[ 0 ][ 0 ];
const ev = [ ...d.marks.map( ( [ t, n ] ) => [ t, `mark ${ n }` ] ), ...d.stepMarks.map( ( [ t, n ] ) => [ t, `step ${ n.slice( 0, 60 ) }` ] ) ].sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
let peak = d.rows[ 0 ];
for ( const r of d.rows ) if ( r[ 1 ] > peak[ 1 ] ) peak = r;
console.log( `${ d.vp }: peak ${ ( peak[ 1 ] / MB ).toFixed( 1 ) } MB at ${ ( ( peak[ 0 ] - t0 ) / 1000 ).toFixed( 1 ) } s, step ${ peak[ 3 ].slice( 0, 50 ) }` );
let e = 0;
for ( let s = t0; s <= d.rows.at( - 1 )[ 0 ]; s += B ) {

	const rows = d.rows.filter( ( r ) => r[ 0 ] >= s && r[ 0 ] < s + B );
	const here = [];
	while ( e < ev.length && ev[ e ][ 0 ] < s + B ) here.push( ev[ e ++ ][ 1 ] );
	if ( ! rows.length && ! here.length ) continue;
	const hi = rows.length ? Math.max( ...rows.map( ( r ) => r[ 1 ] ) ) / MB : 0, lo = rows.length ? Math.min( ...rows.map( ( r ) => r[ 1 ] ) ) / MB : 0;
	const bar = '#'.repeat( Math.round( hi / 2 ) );
	console.log( `${ ( ( s - t0 ) / 1000 ).toFixed( 0 ).padStart( 5 ) }s ${ lo.toFixed( 0 ).padStart( 4 ) }-${ hi.toFixed( 0 ).padStart( 3 ) } ${ bar.padEnd( 80 ) } ${ here.join( ' | ' ).slice( 0, 160 ) }` );

}
