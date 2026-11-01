import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// (M16) The models' compressed buffers (All the Spaces' build compresses them with meshopt) decoded in a
// worker, gone when there's nothing to decode. On the page the decoder's WebAssembly memory grows to hold
// the largest buffer it's seen (a trader's clips: 4 MB) and never gives it back, so it was there for good.
// If the worker doesn't answer in time they're decoded on the page, as they were.

const IDLE = 2000, TOO_LONG = 15000; // ms

export function decodeInWorker() {

	const onPage = MeshoptDecoder.decodeGltfBufferAsync;
	if ( typeof Worker === 'undefined' || ! onPage ) return;
	let pending = 0, idle = 0, up = false, failed = false;
	const down = () => {

		if ( up ) MeshoptDecoder.useWorkers( 0 );
		up = false;

	};

	MeshoptDecoder.decodeGltfBufferAsync = function ( ...a ) {

		if ( failed ) return onPage( ...a );
		clearTimeout( idle );
		if ( ! up ) MeshoptDecoder.useWorkers( 1 );
		up = true;
		pending ++;
		return new Promise( ( resolve, reject ) => {

			const late = setTimeout( () => {

				failed = true;
				down();
				console.warn( 'The models\' decoder: no answer from its worker, decoding on the page' );
				onPage( ...a ).then( resolve, reject );

			}, TOO_LONG );
			onPage( ...a ).then( ( r ) => {

				clearTimeout( late );
				resolve( r );

			}, ( e ) => {

				clearTimeout( late );
				reject( e );

			} );

		} ).finally( () => {

			if ( -- pending === 0 && ! failed ) idle = setTimeout( down, IDLE );

		} );

	};

}
