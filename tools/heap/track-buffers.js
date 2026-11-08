// (an init script, the creation's frame only) every buffer of 64 KB or more made by the page: where it was
// made, its size, when, and when it was collected (a FinalizationRegistry) or detached (byteLength 0),
// so the bytes held at any moment can be split by who made them, live and garbage waiting.
( () => {

	if ( ! /\/c\/qa\//.test( location.href ) ) return;
	const MIN = 65536;
	const recs = [];
	const T = () => Math.round( performance.timeOrigin + performance.now() );
	const gone = new FinalizationRegistry( ( i ) => { if ( recs[ i ].f === 0 ) recs[ i ].f = T(); } );
	const site = () => {

		const lim = Error.stackTraceLimit;
		Error.stackTraceLimit = 16;
		const e = new Error();
		Error.stackTraceLimit = lim;
		const s = ( e.stack || '' ).split( '\n' ).slice( 4, 14 ).map( ( l ) => l.trim().replace( /^at /, '' ) ).join( ' < ' );
		return s;

	};
	const note = ( buf, how ) => {

		if ( ! buf || buf.byteLength < MIN ) return;
		const i = recs.length;
		const r = { t: T(), n: buf.byteLength, how, at: site(), f: 0, ref: new WeakRef( buf ) };
		recs.push( r );
		gone.register( buf, i );

	};
	const wrap = ( C ) => {

		const P = new Proxy( C, {
			construct( target, args, nt ) {

				const o = Reflect.construct( target, args, nt === P ? target : nt );
				// (a view of a buffer passed in isn't a new buffer)
				if ( ! ( args[ 0 ] instanceof ArrayBuffer ) && ! ( typeof SharedArrayBuffer !== 'undefined' && args[ 0 ] instanceof SharedArrayBuffer ) ) note( o.buffer || o, C.name );
				return o;

			},
		} );
		return P;

	};
	for ( const name of [ 'Float32Array', 'Float64Array', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Int8Array', 'ArrayBuffer' ] ) {

		const C = globalThis[ name ];
		const P = wrap( C );
		globalThis[ name ] = P;

	}
	// buffers that come by other ways: fetched, read from blobs, from workers, sliced, transferred
	const res = Response.prototype.arrayBuffer;
	Response.prototype.arrayBuffer = function () { return res.call( this ).then( ( b ) => ( note( b, 'fetch' ), b ) ); };
	const blob = Blob.prototype.arrayBuffer;
	Blob.prototype.arrayBuffer = function () { return blob.call( this ).then( ( b ) => ( note( b, 'blob' ), b ) ); };
	const slice = ArrayBuffer.prototype.slice;
	ArrayBuffer.prototype.slice = function ( ...a ) { const b = slice.apply( this, a ); note( b, 'slice' ); return b; };
	const transfer = ArrayBuffer.prototype.transfer;
	if ( transfer ) ArrayBuffer.prototype.transfer = function ( ...a ) {

		const n = this.byteLength;
		for ( const r of recs ) if ( r.f === 0 && r.ref.deref() === this ) r.f = - T(); // (detached: gone at once)
		const b = transfer.apply( this, a );
		if ( b.byteLength ) note( b, 'transfer' );
		return b;

	};
	const seen = ( v, d = 0 ) => {

		if ( ! v || typeof v !== 'object' || d > 4 ) return;
		if ( v instanceof ArrayBuffer ) return note( v, 'message' );
		if ( ArrayBuffer.isView( v ) ) return note( v.buffer, 'message' );
		if ( Array.isArray( v ) ) { for ( const x of v ) seen( x, d + 1 ); return; }
		for ( const k of Object.keys( v ) ) seen( v[ k ], d + 1 );

	};
	const W = globalThis.Worker;
	globalThis.Worker = new Proxy( W, { construct( target, args, nt ) {

		const w = Reflect.construct( target, args, nt === globalThis.Worker ? target : nt );
		w.addEventListener( 'message', ( e ) => seen( e.data ) );
		return w;

	} } );
	window.__buffers = {
		dump: () => recs.map( ( r ) => [ r.t, r.n, r.how, r.at, r.f || ( r.ref.deref() && r.ref.deref().byteLength === 0 ? - 1 : 0 ) ] ),
	};

} )();
