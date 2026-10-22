// (Salt Life) Starts an inline worker (`import W from './X.js?worker&inline'`) as a classic worker.
//
// All the Spaces builds creations with Vite's worker format 'es', so the wrapper makes a module
// worker from a blob: URL; in the creation's frame (sandboxed, a null origin) that doesn't load:
// it fails at once with an 'error' event, and everything built in workers was built on the page.
// The same code as a classic worker from a blob: URL loads. The bundled code has no imports and no
// import.meta (only the wrapper's first line is module-only), so it is taken from the wrapper's
// own fallback, a data: URL holding just the code, and started from a blob: URL of its own.
//
//   const worker = classicWorker( ReefWorker );   (a Worker; as the wrapper makes it if the code
//                                                   can't be taken)

export function classicWorker( Wrapper ) {

	const Native = self.Worker;
	let code = null;
	self.Worker = function ( url ) {

		if ( typeof url === 'string' && url.startsWith( 'data:' ) ) {

			code = decodeURIComponent( url.slice( url.indexOf( ',' ) + 1 ) );
			return { addEventListener() {}, terminate() {} };

		}

		// (the wrapper's first try, the module worker: it then falls back to the data: URL)
		throw new Error( 'module worker' );

	};

	try {

		Wrapper();

	} catch ( e ) {

		code = null;

	} finally {

		self.Worker = Native;

	}

	if ( code === null ) return new Wrapper();
	const url = URL.createObjectURL( new Blob( [ '\'use strict\';\n', code ], { type: 'text/javascript' } ) );
	const worker = new Native( url );
	const revoke = () => URL.revokeObjectURL( url );
	worker.addEventListener( 'message', revoke, { once: true } );
	worker.addEventListener( 'error', revoke, { once: true } );
	return worker;

}
