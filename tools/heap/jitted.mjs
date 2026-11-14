// (v2.2.2's slow climb) How much of a heap snapshot is V8's machine code (a Code object with an InstructionStream: a function compiled
// past the interpreter, by Sparkplug, Maglev or TurboFan), and how many functions run it; several snapshots in turn, to see it level off.
//   node --max-old-space-size=8000 tools/heap/jitted.mjs <a.heapsnapshot> [b.heapsnapshot ...]
import { readFileSync } from 'node:fs';
for ( const p of process.argv.slice( 2 ) ) {
	const S = JSON.parse( readFileSync( p, 'utf8' ) ), M = S.snapshot.meta, NF = M.node_fields.length, EF = M.edge_fields.length, NT = M.node_types[ 0 ], ET = M.edge_types[ 0 ];
	const { nodes, edges, strings } = S;
	const nT = M.node_fields.indexOf( 'type' ), nN = M.node_fields.indexOf( 'name' ), nS = M.node_fields.indexOf( 'self_size' ), nE = M.node_fields.indexOf( 'edge_count' ), eT = M.edge_fields.indexOf( 'type' ), eN = M.edge_fields.indexOf( 'name_or_index' ), eTo = M.edge_fields.indexOf( 'to_node' );
	const N = nodes.length / NF, first = new Uint32Array( N + 1 );
	for ( let i = 0, e = 0; i < N; i ++ ) { first[ i ] = e; e += nodes[ i * NF + nE ] * EF; first[ i + 1 ] = e; }
	const name = ( i ) => strings[ nodes[ i * NF + nN ] ], type = ( i ) => NT[ nodes[ i * NF + nT ] ];
	const stream = new Map();
	for ( let v = 0; v < N; v ++ ) if ( type( v ) === 'code' && name( v ) === 'system / Code' ) { for ( let e = first[ v ]; e < first[ v + 1 ]; e += EF ) { const w = edges[ e + eTo ] / NF; if ( name( w ) === 'system / InstructionStream' ) stream.set( v, nodes[ w * NF + nS ] ); } }
	// closures whose code is JIT code, by their shared function info (the function, however many closures)
	const fns = new Set(); let closures = 0;
	for ( let v = 0; v < N; v ++ ) if ( type( v ) === 'closure' ) {
		let code = - 1, sfi = - 1;
		for ( let e = first[ v ]; e < first[ v + 1 ]; e += EF ) { const nm = strings[ edges[ e + eN ] ], w = edges[ e + eTo ] / NF; if ( nm === 'code' ) code = w; else if ( nm === 'shared' ) sfi = w; }
		if ( code >= 0 && stream.has( code ) ) { closures ++; fns.add( sfi ); }
	}
	let bytes = 0; for ( const s of stream.values() ) bytes += s;
	console.log( `${ p.split( '/' ).slice( -2 ).join( '/' ) }: ${ stream.size } Code objects with machine code, ${ ( bytes / 1048576 ).toFixed( 2 ) } MB; ${ fns.size } functions (${ closures } closures) running it` );
}
