// (M17) A probe's buffers (PROBE_BUFFERS: probe.mjs): those of 64 KB or more held at a moment (the heap's peak, or s
// seconds in), by the game's code that made them, split into still held at the end (live) and collected later
// (garbage waiting for the collector); then every one made over the run, by where. The sampled profile can't see them:
// a typed array's bytes are outside the heap it samples, and in usedJSHeapSize.
//   node tools/heap/buffers.mjs <out.json> <its dist, with the maps: build-map.mjs> [s | peak] [top=30]
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const { SourceMapConsumer } = createRequire( import.meta.url )( join( ROOT, 'node_modules/.pnpm/node_modules/source-map-js' ) );
const [ path, dist, atArg = 'peak', topN = '30' ] = process.argv.slice( 2 );
const d = JSON.parse( readFileSync( path, 'utf8' ) );
const MB = 1048576, t0 = d.rows[ 0 ][ 0 ], end = d.rows.at( - 1 )[ 0 ];
let at;
if ( atArg === 'peak' ) { let p = d.rows[ 0 ]; for ( const r of d.rows ) if ( r[ 1 ] > p[ 1 ] ) p = r; at = p[ 0 ]; console.log( `heap's peak ${ ( p[ 1 ] / MB ).toFixed( 1 ) } MB at ${ ( ( at - t0 ) / 1000 ).toFixed( 1 ) } s` ); }
else at = t0 + + atArg * 1000;
const maps = new Map();
const mapFor = ( file ) => {

	if ( ! maps.has( file ) ) { const f = join( dist, 'assets', `${ file }.map` ); maps.set( file, existsSync( f ) ? new SourceMapConsumer( JSON.parse( readFileSync( f, 'utf8' ) ) ) : null ); }
	return maps.get( file );

};
const frameOf = ( s ) => {

	const m = s.match( /^(?:(.*?) \()?.*?\/assets\/([^/:]+\.js):(\d+):(\d+)\)?$/ );
	if ( ! m ) return { src: s.slice( 0, 60 ), app: false };
	const c = mapFor( m[ 2 ] );
	if ( ! c ) return { src: `${ m[ 2 ] }:${ m[ 3 ] }`, app: false };
	const o = c.originalPositionFor( { line: + m[ 3 ], column: + m[ 4 ] - 1 } );
	const src = ( o.source || '?' ).replace( /.*?\/(src|node_modules)\//, '$1/' ).replace( /node_modules\/.pnpm\/three@[^/]+\/node_modules\/three\//, 'three/' );
	return { src: `${ src }:${ o.line }`, app: src.startsWith( 'src/' ) };

};
const cache = new Map();
const siteOf = ( at ) => {

	if ( cache.has( at ) ) return cache.get( at );
	const fr = at.split( ' < ' ).map( frameOf );
	const i = fr.findIndex( ( f ) => f.app );
	const k = i < 0 ? `(no app frame) ${ fr.slice( 0, 2 ).map( ( f ) => f.src ).join( ' < ' ) }` : `${ fr[ i ].src }${ fr.slice( i + 1, i + 3 ).filter( ( f ) => f.app ).map( ( f ) => ` < ${ f.src }` ).join( '' ) }`;
	cache.set( at, k );
	return k;

};
const held = new Map();
let live = 0, waiting = 0, made = new Map();
for ( const [ t, n, how, site, f ] of d.buffers ) {

	const k = `${ how } ${ siteOf( site ) }`;
	const m = made.get( k ) || { n: 0, c: 0 }; m.n += n; m.c ++; made.set( k, m );
	if ( t > at ) continue;
	const freedAt = f > 0 ? f : f < - 1 ? - f : f === - 1 ? null : Infinity; // (detached at some time unknown: -1)
	if ( freedAt !== null && freedAt <= at ) continue;
	if ( freedAt === null ) continue;
	const e = held.get( k ) || { live: 0, gc: 0 };
	if ( freedAt === Infinity ) { e.live += n; live += n; } else { e.gc += n; waiting += n; }
	held.set( k, e );

}
console.log( `buffers held then: ${ ( ( live + waiting ) / MB ).toFixed( 1 ) } MB (still held at the end ${ ( live / MB ).toFixed( 1 ) }, collected later ${ ( waiting / MB ).toFixed( 1 ) })` );
for ( const [ k, e ] of [ ...held ].sort( ( a, b ) => ( b[ 1 ].live + b[ 1 ].gc ) - ( a[ 1 ].live + a[ 1 ].gc ) ).slice( 0, + topN ) ) console.log( `${ ( ( e.live + e.gc ) / MB ).toFixed( 1 ).padStart( 6 ) } MB (live ${ ( e.live / MB ).toFixed( 1 ).padStart( 5 ) }, garbage ${ ( e.gc / MB ).toFixed( 1 ).padStart( 5 ) })  ${ k }` );
console.log( `\nmade over the run: ${ ( [ ...made.values() ].reduce( ( a, m ) => a + m.n, 0 ) / MB ).toFixed( 0 ) } MB in ${ d.buffers.length } buffers` );
for ( const [ k, m ] of [ ...made ].sort( ( a, b ) => b[ 1 ].n - a[ 1 ].n ).slice( 0, + topN ) ) console.log( `${ ( m.n / MB ).toFixed( 1 ).padStart( 6 ) } MB x${ String( m.c ).padEnd( 4 ) } ${ k }` );
