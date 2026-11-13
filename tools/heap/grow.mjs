// (v2.2.2's slow climb) What a game took on between two heap snapshots of the same page and still holds: the objects in the
// later one whose ids the earlier one hasn't (V8 keeps an object's id from snapshot to snapshot), by kind, and by where they
// hang: the first object already there in the earlier snapshot on the way back to the roots, with the edge they hang from,
// and that holder's own path from the window. tools/two-players/mem.mjs takes the snapshots (MEM_SNAP).
//   node --max-old-space-size=8000 tools/heap/grow.mjs <early.heapsnapshot> <late.heapsnapshot> [top=30]
import { readFileSync } from 'node:fs';
const [ earlyPath, latePath, topN = '30' ] = process.argv.slice( 2 );
const KB = 1024;
const load = ( path ) => {

	const S = JSON.parse( readFileSync( path, 'utf8' ) ), M = S.snapshot.meta;
	const H = { S, NF: M.node_fields.length, EF: M.edge_fields.length, NT: M.node_types[ 0 ], ET: M.edge_types[ 0 ], nodes: S.nodes, edges: S.edges, strings: S.strings };
	H.nT = M.node_fields.indexOf( 'type' ); H.nN = M.node_fields.indexOf( 'name' ); H.nI = M.node_fields.indexOf( 'id' ); H.nS = M.node_fields.indexOf( 'self_size' ); H.nE = M.node_fields.indexOf( 'edge_count' );
	H.eT = M.edge_fields.indexOf( 'type' ); H.eN = M.edge_fields.indexOf( 'name_or_index' ); H.eTo = M.edge_fields.indexOf( 'to_node' );
	H.N = H.nodes.length / H.NF;
	H.first = new Uint32Array( H.N + 1 );
	for ( let i = 0, e = 0; i < H.N; i ++ ) { H.first[ i ] = e; e += H.nodes[ i * H.NF + H.nE ] * H.EF; H.first[ i + 1 ] = e; }
	H.type = ( i ) => H.NT[ H.nodes[ i * H.NF + H.nT ] ];
	H.name = ( i ) => H.strings[ H.nodes[ i * H.NF + H.nN ] ];
	H.id = ( i ) => H.nodes[ i * H.NF + H.nI ];
	H.self = ( i ) => H.nodes[ i * H.NF + H.nS ];
	H.edgeName = ( e ) => { const t = H.ET[ H.edges[ e + H.eT ] ]; return t === 'element' || t === 'hidden' ? `[${ H.edges[ e + H.eN ] }]` : String( H.strings[ H.edges[ e + H.eN ] ] ); };
	H.skip = ( e ) => { const t = H.ET[ H.edges[ e + H.eT ] ]; return t === 'weak' || t === 'shortcut'; };
	let total = 0;
	for ( let i = 0; i < H.N; i ++ ) total += H.self( i );
	H.total = total;
	return H;

};

const A = load( earlyPath );
const old = new Set();
for ( let i = 0; i < A.N; i ++ ) old.add( A.id( i ) );
console.log( `early: ${ A.N } nodes, ${ ( A.total / 1048576 ).toFixed( 2 ) } MB` );
const B = load( latePath );
console.log( `late:  ${ B.N } nodes, ${ ( B.total / 1048576 ).toFixed( 2 ) } MB (${ ( ( B.total - A.total ) / KB ).toFixed( 0 ) } KB more)` );
const label = ( H, i ) => { const t = H.type( i ), n = H.name( i ); return t === 'string' || t === 'concatenated string' || t === 'sliced string' ? t : `${ t } ${ n.slice( 0, 70 ).replace( /\s+/g, ' ' ).replace( / @\d+/g, '' ) }`; };
// by kind: the late snapshot's own, against the early one's
const byKind = ( H, pick ) => { const m = new Map(); for ( let i = 0; i < H.N; i ++ ) { if ( ! pick( i ) ) continue; const k = label( H, i ), r = m.get( k ) || [ 0, 0 ]; r[ 0 ] ++; r[ 1 ] += H.self( i ); m.set( k, r ); } return m; };
// by V8's own types first (code is the compiled functions: bytecode, and what the optimizing tiers made)
const byType = ( H ) => { const m = new Map(); for ( let i = 0; i < H.N; i ++ ) m.set( H.type( i ), ( m.get( H.type( i ) ) || 0 ) + H.self( i ) ); return m; };
const tA = byType( A ), tB = byType( B );
console.log( '\nsize by type, early -> late' );
for ( const t of [ ...new Set( [ ...tA.keys(), ...tB.keys() ] ) ].sort( ( x, y ) => Math.abs( ( tB.get( y ) || 0 ) - ( tA.get( y ) || 0 ) ) - Math.abs( ( tB.get( x ) || 0 ) - ( tA.get( x ) || 0 ) ) ) ) {

	const a = tA.get( t ) || 0, b = tB.get( t ) || 0;
	console.log( `${ ( ( b - a ) / KB ).toFixed( 1 ).padStart( 9 ) } KB   ${ t } (${ ( a / 1048576 ).toFixed( 2 ) } -> ${ ( b / 1048576 ).toFixed( 2 ) } MB)` );

}

const kA = byKind( A, () => true ), kB = byKind( B, () => true );
const isNew = new Uint8Array( B.N );
let newCount = 0, newSize = 0;
for ( let i = 0; i < B.N; i ++ ) if ( ! old.has( B.id( i ) ) && B.type( i ) !== 'synthetic' ) { isNew[ i ] = 1; newCount ++; newSize += B.self( i ); }
console.log( `new since the early snapshot and still held: ${ newCount } objects, ${ ( newSize / KB ).toFixed( 0 ) } KB` );
console.log( '\ncount and size by kind, early -> late (the biggest changes)' );
const keys = new Set( [ ...kA.keys(), ...kB.keys() ] ), rows = [];
for ( const k of keys ) { const a = kA.get( k ) || [ 0, 0 ], b = kB.get( k ) || [ 0, 0 ]; rows.push( [ k, a, b, b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ] ] ); }
for ( const [ k, a, b, ds, dc ] of rows.sort( ( x, y ) => Math.abs( y[ 3 ] ) - Math.abs( x[ 3 ] ) ).slice( 0, + topN ) ) console.log( `${ ( ds / KB ).toFixed( 1 ).padStart( 9 ) } KB ${ String( dc > 0 ? `+${ dc }` : dc ).padStart( 8 ) }   ${ k }   (${ a[ 0 ] } -> ${ b[ 0 ] })` );
const kNew = byKind( B, ( i ) => isNew[ i ] );
console.log( '\nthe new objects by kind' );
for ( const [ k, [ c, s ] ] of [ ...kNew ].sort( ( x, y ) => y[ 1 ][ 1 ] - x[ 1 ][ 1 ] ).slice( 0, + topN ) ) console.log( `${ ( s / KB ).toFixed( 1 ).padStart( 9 ) } KB ${ String( c ).padStart( 8 ) }   ${ k }` );
// retainers of the late snapshot, and paths from the root (breadth first, weak and shortcut edges left out)
const rc = new Uint32Array( B.N + 1 );
for ( let v = 0; v < B.N; v ++ ) for ( let e = B.first[ v ]; e < B.first[ v + 1 ]; e += B.EF ) if ( ! B.skip( e ) ) rc[ B.edges[ e + B.eTo ] / B.NF + 1 ] ++;
for ( let i = 0; i < B.N; i ++ ) rc[ i + 1 ] += rc[ i ];
const rFrom = new Uint32Array( rc[ B.N ] ), rEdge = new Uint32Array( rc[ B.N ] ), fill = rc.slice( 0, B.N );
for ( let v = 0; v < B.N; v ++ ) for ( let e = B.first[ v ]; e < B.first[ v + 1 ]; e += B.EF ) if ( ! B.skip( e ) ) { const w = B.edges[ e + B.eTo ] / B.NF, k = fill[ w ] ++; rFrom[ k ] = v; rEdge[ k ] = e; }
const parent = new Int32Array( B.N ).fill( - 1 ), pEdge = new Int32Array( B.N ).fill( - 1 ), depth = new Int32Array( B.N ).fill( - 1 );
{

	let q = [ 0 ];
	depth[ 0 ] = 0;
	while ( q.length ) {

		const next = [];
		for ( const v of q ) for ( let e = B.first[ v ]; e < B.first[ v + 1 ]; e += B.EF ) {

			if ( B.skip( e ) ) continue;
			const w = B.edges[ e + B.eTo ] / B.NF;
			if ( depth[ w ] >= 0 ) continue;
			depth[ w ] = depth[ v ] + 1; parent[ w ] = v; pEdge[ w ] = e; next.push( w );

		}

		q = next;

	}

}
const pathOf = ( v ) => { const parts = []; for ( let n = v, k = 0; n > 0 && k < 40; n = parent[ n ], k ++ ) { const p = parent[ n ]; if ( p < 0 ) break; const t = B.type( p ), nm = B.name( p ); parts.push( B.edgeName( pEdge[ n ] ) ); if ( t === 'object' && /^Window/.test( nm ) ) { parts.push( 'Window' ); break; } } return parts.reverse().join( '.' ); };
// each new object hangs where its path back towards the root (the shortest, as above) first reaches an old one
const hang = new Map();
for ( let v = 0; v < B.N; v ++ ) {

	if ( ! isNew[ v ] ) continue;
	let n = v;
	while ( n > 0 && isNew[ n ] && parent[ n ] >= 0 ) n = parent[ n ];
	if ( n === v || isNew[ n ] ) continue;
	// the edge from the old holder to the first new object below it
	let c = v;
	while ( parent[ c ] !== n ) c = parent[ c ];
	const key = `${ label( B, n ) } --${ B.ET[ B.edges[ pEdge[ c ] + B.eT ] ] === 'element' ? '[i]' : B.edgeName( pEdge[ c ] ) }-->`;
	const r = hang.get( key ) || { count: 0, size: 0, holder: n, sample: c };
	r.count ++; r.size += B.self( v );
	hang.set( key, r );

}
console.log( '\nwhere the new objects hang (old holder --edge-->), and the holder\'s path' );
for ( const [ k, r ] of [ ...hang ].sort( ( x, y ) => y[ 1 ].size - x[ 1 ].size ).slice( 0, + topN ) ) console.log( `${ ( r.size / KB ).toFixed( 1 ).padStart( 9 ) } KB ${ String( r.count ).padStart( 8 ) }   ${ k } ${ label( B, r.sample ) }\n${ ''.padStart( 22 ) }${ pathOf( r.holder ) || '(unreached from a window)' }` );
