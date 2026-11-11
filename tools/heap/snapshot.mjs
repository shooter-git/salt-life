// (M17) What a heap snapshot holds (PROBE_SNAPSHOT: probe.mjs): self sizes by kind, then what window.__app holds,
// property by property, each with what it alone keeps alive (the dominator tree), or what the object at a path under
// it holds. Most of the scene is reached more ways than through __app: snapshot-buffers.mjs follows the buffers.
//   node --max-old-space-size=8000 tools/heap/snapshot.mjs <out.heapsnapshot> [path, e.g. vegetation.records] [top=40]
import { readFileSync } from 'node:fs';
const [ path, sub = '', topN = '40' ] = process.argv.slice( 2 );
const S = JSON.parse( readFileSync( path, 'utf8' ) );
const M = S.snapshot.meta, NF = M.node_fields.length, EF = M.edge_fields.length;
const nT = M.node_fields.indexOf( 'type' ), nN = M.node_fields.indexOf( 'name' ), nS = M.node_fields.indexOf( 'self_size' ), nE = M.node_fields.indexOf( 'edge_count' );
const eT = M.edge_fields.indexOf( 'type' ), eN = M.edge_fields.indexOf( 'name_or_index' ), eTo = M.edge_fields.indexOf( 'to_node' );
const NT = M.node_types[ 0 ], ET = M.edge_types[ 0 ];
const nodes = S.nodes, edges = S.edges, strings = S.strings;
const N = nodes.length / NF;
const firstEdge = new Uint32Array( N + 1 );
for ( let i = 0, e = 0; i < N; i ++ ) { firstEdge[ i ] = e; e += nodes[ i * NF + nE ] * EF; firstEdge[ i + 1 ] = e; }
const WEAK = ET.indexOf( 'weak' ), SHORTCUT = ET.indexOf( 'shortcut' );
const typeOf = ( i ) => NT[ nodes[ i * NF + nT ] ], nameOf = ( i ) => strings[ nodes[ i * NF + nN ] ], selfOf = ( i ) => nodes[ i * NF + nS ];
const MB = 1048576;
let total = 0;
for ( let i = 0; i < N; i ++ ) total += selfOf( i );
console.log( `${ N } nodes, ${ ( total / MB ).toFixed( 1 ) } MB in all` );
// self size by kind
const kinds = new Map();
for ( let i = 0; i < N; i ++ ) { const t = typeOf( i ), k = t === 'object' || t === 'native' || t === 'hidden' || t === 'array' || t === 'closure' ? `${ t } ${ nameOf( i ).slice( 0, 50 ) }` : t; kinds.set( k, ( kinds.get( k ) || 0 ) + selfOf( i ) ); }
console.log( '\nself size by kind' );
for ( const [ k, v ] of [ ...kinds ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, + topN ) ) console.log( `${ ( v / MB ).toFixed( 2 ).padStart( 8 ) } MB  ${ k }` );
// dominators (Cooper, Harvey, Kennedy) over a postorder from the root, weak edges left out
const post = new Int32Array( N ).fill( - 1 ), order = new Uint32Array( N );
let count = 0;
{

	const stack = [ 0 ], it = new Uint32Array( N ), seen = new Uint8Array( N );
	seen[ 0 ] = 1; it[ 0 ] = firstEdge[ 0 ];
	while ( stack.length ) {

		const v = stack[ stack.length - 1 ];
		let pushed = false;
		while ( it[ v ] < firstEdge[ v + 1 ] ) {

			const e = it[ v ]; it[ v ] += EF;
			const t = edges[ e + eT ];
			if ( t === WEAK || t === SHORTCUT ) continue;
			const w = edges[ e + eTo ] / NF;
			if ( seen[ w ] ) continue;
			seen[ w ] = 1; it[ w ] = firstEdge[ w ]; stack.push( w ); pushed = true; break;

		}

		if ( ! pushed ) { stack.pop(); post[ v ] = count; order[ count ++ ] = v; }

	}

}
// predecessors
const predCount = new Uint32Array( N + 1 );
for ( let v = 0; v < N; v ++ ) if ( post[ v ] >= 0 ) for ( let e = firstEdge[ v ]; e < firstEdge[ v + 1 ]; e += EF ) { const t = edges[ e + eT ]; if ( t === WEAK || t === SHORTCUT ) continue; const w = edges[ e + eTo ] / NF; predCount[ w + 1 ] ++; }
for ( let i = 0; i < N; i ++ ) predCount[ i + 1 ] += predCount[ i ];
const preds = new Uint32Array( predCount[ N ] ), fill = predCount.slice( 0, N );
for ( let v = 0; v < N; v ++ ) if ( post[ v ] >= 0 ) for ( let e = firstEdge[ v ]; e < firstEdge[ v + 1 ]; e += EF ) { const t = edges[ e + eT ]; if ( t === WEAK || t === SHORTCUT ) continue; const w = edges[ e + eTo ] / NF; preds[ fill[ w ] ++ ] = v; }
const idom = new Int32Array( N ).fill( - 1 );
idom[ 0 ] = 0;
const intersect = ( a, b ) => { while ( a !== b ) { while ( post[ a ] < post[ b ] ) a = idom[ a ]; while ( post[ b ] < post[ a ] ) b = idom[ b ]; } return a; };
for ( let changed = true, pass = 0; changed; pass ++ ) {

	changed = false;
	for ( let k = count - 2; k >= 0; k -- ) {

		const v = order[ k ];
		let d = - 1;
		for ( let p = predCount[ v ]; p < predCount[ v + 1 ]; p ++ ) { const u = preds[ p ]; if ( idom[ u ] < 0 ) continue; d = d < 0 ? u : intersect( u, d ); }
		if ( d >= 0 && idom[ v ] !== d ) { idom[ v ] = d; changed = true; }

	}

}
const retained = new Float64Array( N );
for ( let k = 0; k < count; k ++ ) { const v = order[ k ]; retained[ v ] += selfOf( v ); if ( v !== 0 ) retained[ idom[ v ] ] += retained[ v ]; }
console.log( `\nreachable ${ ( retained[ 0 ] / MB ).toFixed( 1 ) } MB` );
// window.__app, or the path under it
const child = ( v, name ) => { for ( let e = firstEdge[ v ]; e < firstEdge[ v + 1 ]; e += EF ) { const t = ET[ edges[ e + eT ] ]; if ( ( t === 'property' || t === 'internal' || t === 'element' || t === 'hidden' || t === 'context' ) && String( t === 'element' || t === 'hidden' ? edges[ e + eN ] : strings[ edges[ e + eN ] ] ) === name ) return edges[ e + eTo ] / NF; } return - 1; };
let app = - 1;
for ( let v = 0; v < N && app < 0; v ++ ) if ( typeOf( v ) === 'object' && /^Window/.test( nameOf( v ) ) ) { const a = child( v, '__app' ); if ( a >= 0 ) app = a; }
let at = app;
for ( const part of sub ? sub.split( '.' ) : [] ) { at = child( at, part ); if ( at < 0 ) throw new Error( `no ${ part }` ); }
console.log( `\n${ sub || '__app' } (${ nameOf( at ) }): retained ${ ( retained[ at ] / MB ).toFixed( 1 ) } MB` );
const rows = [];
for ( let e = firstEdge[ at ]; e < firstEdge[ at + 1 ]; e += EF ) {

	const t = ET[ edges[ e + eT ] ];
	if ( t === 'weak' || t === 'shortcut' ) continue;
	const w = edges[ e + eTo ] / NF, nm = t === 'element' || t === 'hidden' ? `[${ edges[ e + eN ] }]` : strings[ edges[ e + eN ] ];
	rows.push( [ nm, w, idom[ w ] === at ? retained[ w ] : 0, retained[ w ] ] );

}
for ( const [ nm, w, own, all ] of rows.sort( ( a, b ) => b[ 2 ] - a[ 2 ] || b[ 3 ] - a[ 3 ] ).slice( 0, + topN ) ) console.log( `${ ( own / MB ).toFixed( 2 ).padStart( 8 ) } MB${ own ? '' : ` (shared, ${ ( all / MB ).toFixed( 2 ) })` }  ${ nm }: ${ typeOf( w ) } ${ nameOf( w ).slice( 0, 60 ) }` );
// the biggest held anywhere that __app doesn't dominate: the root's own children
console.log( '\nbiggest dominated straight from the root\'s children' );
const top = [];
for ( let v = 1; v < N; v ++ ) if ( idom[ v ] >= 0 && idom[ idom[ v ] ] === 0 && retained[ v ] > MB ) top.push( v );
for ( const v of top.sort( ( a, b ) => retained[ b ] - retained[ a ] ).slice( 0, 20 ) ) console.log( `${ ( retained[ v ] / MB ).toFixed( 2 ).padStart( 8 ) } MB  ${ typeOf( v ) } ${ nameOf( v ).slice( 0, 80 ) }` );
