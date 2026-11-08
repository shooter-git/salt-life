// (M17) Every buffer in a heap snapshot (PROBE_SNAPSHOT: probe.mjs) over a size, by the shortest path to it from
// window.__app, else from the root: in the snapshot after v2.2.2's check play they were half its script memory.
//   node --max-old-space-size=8000 tools/heap/snapshot-buffers.mjs <out.heapsnapshot> [min KB = 128]
import { readFileSync } from 'node:fs';
const [ path, minKB = '128' ] = process.argv.slice( 2 );
const S = JSON.parse( readFileSync( path, 'utf8' ) );
const M = S.snapshot.meta, NF = M.node_fields.length, EF = M.edge_fields.length;
const nT = M.node_fields.indexOf( 'type' ), nN = M.node_fields.indexOf( 'name' ), nS = M.node_fields.indexOf( 'self_size' ), nE = M.node_fields.indexOf( 'edge_count' );
const eT = M.edge_fields.indexOf( 'type' ), eN = M.edge_fields.indexOf( 'name_or_index' ), eTo = M.edge_fields.indexOf( 'to_node' );
const NT = M.node_types[ 0 ], ET = M.edge_types[ 0 ];
const nodes = S.nodes, edges = S.edges, strings = S.strings, N = nodes.length / NF;
const first = new Uint32Array( N + 1 );
for ( let i = 0, e = 0; i < N; i ++ ) { first[ i ] = e; e += nodes[ i * NF + nE ] * EF; first[ i + 1 ] = e; }
const typeOf = ( i ) => NT[ nodes[ i * NF + nT ] ], nameOf = ( i ) => strings[ nodes[ i * NF + nN ] ], selfOf = ( i ) => nodes[ i * NF + nS ];
const enm = ( e ) => { const t = ET[ edges[ e + eT ] ]; return t === 'element' || t === 'hidden' ? `[${ edges[ e + eN ] }]` : strings[ edges[ e + eN ] ]; };
const parent = new Int32Array( N ).fill( - 1 ), pedge = new Int32Array( N ).fill( - 1 );
const bfs = ( start ) => {
	const q = [ start ]; if ( parent[ start ] < 0 ) parent[ start ] = start;
	for ( let h = 0; h < q.length; h ++ ) { const v = q[ h ]; for ( let e = first[ v ]; e < first[ v + 1 ]; e += EF ) { const t = ET[ edges[ e + eT ] ]; if ( t === 'weak' || t === 'shortcut' ) continue; const w = edges[ e + eTo ] / NF; if ( parent[ w ] >= 0 ) continue; parent[ w ] = v; pedge[ w ] = e; q.push( w ); } }
};
let app = -1;
for ( let v = 0; v < N && app < 0; v ++ ) if ( typeOf( v ) === 'object' && /^Window/.test( nameOf( v ) ) ) for ( let e = first[ v ]; e < first[ v + 1 ]; e += EF ) if ( strings[ edges[ e + eN ] ] === '__app' ) { app = edges[ e + eTo ] / NF; break; }
bfs( app ); bfs( 0 );
const pathOf = ( v ) => { const parts = []; let k = 0; while ( v !== app && v !== 0 && parent[ v ] !== v && k ++ < 40 ) { parts.push( enm( pedge[ v ] ) ); v = parent[ v ]; } return ( v === app ? '__app' : '(root)' ) + parts.reverse().map( ( p ) => p.startsWith( '[' ) ? p : `.${ p }` ).join( '' ); };
const rows = [];
let sum = 0;
for ( let v = 0; v < N; v ++ ) if ( typeOf( v ) === 'native' && nameOf( v ) === 'system / JSArrayBufferData' ) { sum += selfOf( v ); if ( selfOf( v ) >= + minKB * 1024 ) rows.push( [ selfOf( v ), pathOf( v ) ] ); }
console.log( `buffers' data in all ${ ( sum / 1048576 ).toFixed( 1 ) } MB; ${ rows.length } of ${ minKB } KB or more, ${ ( rows.reduce( ( a, r ) => a + r[ 0 ], 0 ) / 1048576 ).toFixed( 1 ) } MB` );
for ( const [ n, p ] of rows.sort( ( a, b ) => b[ 0 ] - a[ 0 ] ) ) console.log( `${ ( n / 1048576 ).toFixed( 2 ).padStart( 6 ) } MB  ${ p.replace( /\.(buffer|backing_store)$/, '' ).slice( 0, 200 ) }` );
