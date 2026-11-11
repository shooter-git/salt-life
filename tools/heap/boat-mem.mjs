// (M17) What building a boat costs script memory, in plain Node: what's on the heap straight after (the garbage a
// build leaves the collector) and once collected (what she keeps), the typed arrays made, and on the last round
// every allocation sampled, by the file and the nearest frame in src. The first round warms the code up.
//   node --expose-gc tools/heap/boat-mem.mjs [boat ids, comma separated] [rounds = 3] [top = 25] [src = ./src]
import { Session } from 'node:inspector/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const [ ids = 'lobster,sportfisher,console,kayak', rounds = '3', topN = '25', srcArg ] = process.argv.slice( 2 );
const src = srcArg ? resolve( srcArg ) : fileURLToPath( new URL( '../../src', import.meta.url ) );
// typed arrays' bytes as they're made (their backing stores aren't in the sampled profile)
let typed = 0;
for ( const name of [ 'Float32Array', 'Float64Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Int16Array', 'Int8Array', 'Uint8ClampedArray' ] ) {

	const C = globalThis[ name ];
	globalThis[ name ] = new Proxy( C, { construct( t, a, nt ) { const o = Reflect.construct( t, a, nt === globalThis[ name ] ? t : nt ); if ( ! ( a[ 0 ] instanceof ArrayBuffer ) ) typed += o.byteLength; return o; } } );

}
const { loadBoat } = await import( pathToFileURL( `${ src }/world/boat/Boats.js` ) );
const s = new Session();
s.connect();
await s.post( 'HeapProfiler.enable' );
const MB = 1048576;
const heap = () => { const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
for ( const id of ids.split( ',' ) ) {

	for ( let r = 0; r < + rounds; r ++ ) {

		gc(); gc();
		const h0 = heap(); typed = 0;
		const last = r === + rounds - 1;
		if ( last ) await s.post( 'HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } );
		const t0 = performance.now();
		const model = await loadBoat( id, 'low' );
		const ms = performance.now() - t0;
		const h1 = heap();
		let prof = null;
		if ( last ) prof = ( await s.post( 'HeapProfiler.stopSampling' ) ).profile;
		gc(); gc();
		const h2 = heap();
		console.log( `${ id } #${ r }: ${ ms.toFixed( 0 ) } ms; heap ${ ( ( h1 - h0 ) / MB ).toFixed( 1 ) } MB more straight after, ${ ( ( h2 - h0 ) / MB ).toFixed( 1 ) } kept; typed arrays made ${ ( typed / MB ).toFixed( 1 ) } MB` );
		if ( prof ) {

			const by = new Map(), file = new Map();
			let total = 0;
			const walk = ( n, stack ) => {

				const cf = n.callFrame, here = cf.url.includes( '/src/' ) ? `${ cf.functionName || '(anon)' } ${ cf.url.replace( /.*\/src\//, '' ) }:${ cf.lineNumber + 1 }` : null;
				const st = here ? [ ...stack, here ] : stack;
				if ( n.selfSize ) {

					total += n.selfSize;
					const k = st.at( - 1 ) || '(none)';
					by.set( k, ( by.get( k ) || 0 ) + n.selfSize );
					const f = k.replace( /^\S+ /, '' ).replace( /:\d+$/, '' );
					file.set( f, ( file.get( f ) || 0 ) + n.selfSize );

				}

				for ( const c of n.children ) walk( c, st );

			};
			walk( prof.head, [] );
			console.log( `   on the heap, allocated in all ${ ( total / MB ).toFixed( 1 ) } MB (sampled); by file:` );
			for ( const [ k, v ] of [ ...file ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 12 ) ) console.log( `   ${ ( v / MB ).toFixed( 2 ).padStart( 7 ) } MB  ${ k }` );
			console.log( '   by the nearest frame in src:' );
			for ( const [ k, v ] of [ ...by ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, + topN ) ) console.log( `   ${ ( v / MB ).toFixed( 2 ).padStart( 7 ) } MB  ${ k }` );

		}

		model.dispose && model.dispose();

	}

}
