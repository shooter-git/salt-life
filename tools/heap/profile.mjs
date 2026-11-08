// (M17) A probe's sampled allocations (PROBE_SAMPLE: probe.mjs), by the file and line of the nearest frame in the
// game's own code (not three.js or the browser's), with the frames that called it, and by the allocating frame
// itself. V8's estimate of the bytes, scaled up from its samples.
//   node tools/heap/profile.mjs <out.heapprofile> <its dist, with the maps: build-map.mjs> [top=40]
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const { SourceMapConsumer } = createRequire( import.meta.url )( join( ROOT, 'node_modules/.pnpm/node_modules/source-map-js' ) );
const [ path, dist, topN = '40' ] = process.argv.slice( 2 );
const prof = JSON.parse( readFileSync( path, 'utf8' ) );
const maps = new Map();
const mapFor = ( url ) => {

	const m = url.match( /\/(assets\/[^/?#]+\.js)/ );
	if ( ! m ) return null;
	if ( ! maps.has( m[ 1 ] ) ) {

		const f = join( dist, `${ m[ 1 ] }.map` );
		maps.set( m[ 1 ], existsSync( f ) ? new SourceMapConsumer( JSON.parse( readFileSync( f, 'utf8' ) ) ) : null );

	}

	return maps.get( m[ 1 ] );

};
const where = ( cf ) => {

	const c = mapFor( cf.url );
	if ( ! c || cf.lineNumber < 0 ) return { src: cf.url ? cf.url.replace( /.*\//, '' ) : '(native)', fn: cf.functionName || '(anon)', app: false };
	const o = c.originalPositionFor( { line: cf.lineNumber + 1, column: cf.columnNumber } );
	const src = ( o.source || '?' ).replace( /.*?\/(src|node_modules)\//, '$1/' );
	return { src: `${ src }:${ o.line }`, fn: cf.functionName || '(anon)', app: src.startsWith( 'src/' ) };

};
// node id -> [frames from root]
const byId = new Map();
const walk = ( n, stack ) => {

	const s = [ ...stack, n.callFrame ];
	byId.set( n.id, s );
	for ( const c of n.children || [] ) walk( c, s );

};
walk( prof.head, [] );
const self = new Map(), app = new Map(), file = new Map();
let total = 0;
const add = ( m, k, v, extra ) => { const e = m.get( k ) || { v: 0, extra }; e.v += v; m.set( k, e ); };
// (each node's selfSize is V8's estimate, scaled up from its samples by the sampling interval)
const nodes = [];
const flat = ( n ) => { nodes.push( n ); for ( const c of n.children || [] ) flat( c ); };
flat( prof.head );
for ( const n of nodes ) {

	const s = { size: n.selfSize, nodeId: n.id };
	if ( ! s.size ) continue;
	total += s.size;
	const stack = byId.get( s.nodeId ) || [];
	const frames = stack.map( where ).filter( ( w ) => w.src !== '(root)' );
	const leaf = frames.at( - 1 ) || { src: '?', fn: '?' };
	add( self, `${ leaf.fn } ${ leaf.src }`, s.size );
	const apps = frames.filter( ( f ) => f.app );
	const nearest = apps.at( - 1 );
	if ( nearest ) {

		add( app, `${ nearest.fn } ${ nearest.src }`, s.size, apps.slice( - 4, - 1 ).map( ( f ) => `${ f.fn } ${ f.src }` ).reverse().join( ' < ' ) );
		add( file, nearest.src.replace( /:\d+$/, '' ), s.size );

	} else add( file, '(no app frame)', s.size );

}
const MB = 1048576, N = + topN;
const show = ( title, m ) => {

	console.log( `\n${ title }` );
	for ( const [ k, e ] of [ ...m ].sort( ( a, b ) => b[ 1 ].v - a[ 1 ].v ).slice( 0, N ) ) console.log( `${ ( e.v / MB ).toFixed( 1 ).padStart( 7 ) } MB  ${ k }${ e.extra ? `   < ${ e.extra }` : '' }` );

};
console.log( `sampled allocations in all: ${ ( total / MB ).toFixed( 0 ) } MB` );
show( 'by file of the nearest app frame', file );
show( 'by nearest app frame', app );
show( 'by the allocating frame itself', self );
