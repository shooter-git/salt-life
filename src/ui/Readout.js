import './readout.css';

// (M15) ?readout, on its own (pnpm dev, a local build, GitHub Pages): what the game's using as you play,
// against All the Spaces' budgets, for measuring it on a phone. Its watches are All the Spaces' checks'
// own (qa-browser's instrument.ts), so the numbers are the checks': draw calls and triangles each frame;
// the graphics memory as textures, buffers and render targets are made and let go; the sounds playing;
// the script memory. installProbes() goes on before anything's drawn or heard (main.js), the panel once
// the game's started. window.__readout.snapshot() for tools.
//
// Script memory is Chrome's alone, and Chrome gives it rounded and kept for minutes unless it's started
// with --enable-precise-memory-info (as the checks start it): the panel says so when the figure never
// moves. Each figure's peak goes into localStorage every 2 s, so a page the browser killed and loaded
// again tells you what it was using just before.

// what a creation may use, by the least capable devices it runs on (All the Spaces' qa/budgets.ts)
const BUDGETS = {
	low: { drawCalls: 150, triangles: 300000, textureMB: 128, gpuMB: 256, voices: 16, heapMB: 150 },
	mid: { drawCalls: 400, triangles: 1000000, textureMB: 256, gpuMB: 512, voices: 32, heapMB: 300 },
	high: { drawCalls: 1000, triangles: 3000000, textureMB: 512, gpuMB: 1024, voices: 64, heapMB: 500 },
};
const MB = 1024 * 1024;
const WINDOW = 300; // frames kept for the rolling figures (about 5 s at 60 fps)
const KEPT = 'saltlife.readout'; // localStorage: the last visit's peaks, and whether it ended

const state = {
	current: { calls: 0, triangles: 0 },
	frames: [], // { calls, triangles, ms }, the latest WINDOW
	textureBytes: 0, bufferBytes: 0, renderbufferBytes: 0, drawingBufferBytes: 0,
	voices: 0,
	lost: 0, // the game's canvas's webglcontextlost
	peak: { calls: 0, triangles: 0, textureMB: 0, gpuMB: 0, voices: 0, heapMB: 0, frameMs: 0 },
	heap: [], // the latest usedJSHeapSize samples, to tell a live figure from a rounded, kept one
	since: performance.now(),
};

const gpuBytes = () => state.textureBytes + state.bufferBytes + state.renderbufferBytes + state.drawingBufferBytes;
const track = () => {

	state.peak.textureMB = Math.max( state.peak.textureMB, state.textureBytes / MB );
	state.peak.gpuMB = Math.max( state.peak.gpuMB, gpuBytes() / MB );

};

// ---- the watches (as instrument.ts's) ----

const trianglesOf = ( mode, count, instances = 1 ) => ( mode === 4 ? Math.floor( count / 3 ) : mode === 5 || mode === 6 ? Math.max( 0, count - 2 ) : 0 ) * instances;
const draw = ( mode, count, instances = 1 ) => {

	state.current.calls ++;
	state.current.triangles += trianglesOf( mode, count, instances );

};

function wrap( proto, name, before ) {

	const original = proto[ name ];
	if ( typeof original !== 'function' ) return;
	proto[ name ] = function ( ...args ) {

		try {

			before( args, this );

		} catch ( e ) { /* a watch never breaks the call */ }
		return original.apply( this, args );

	};

}

// bytes a pixel for the formats three.js uses
const BPP = { 33321: 1, 33323: 2, 32849: 4, 32856: 4, 35907: 4, 35905: 4, 33325: 2, 33327: 4, 34842: 8, 34843: 8, 33326: 4, 33328: 8, 34836: 16, 34837: 16, 35898: 4, 35901: 4, 33189: 2, 33190: 4, 36012: 4, 35056: 4, 36013: 8, 36168: 1, 6409: 1, 6410: 2, 6407: 4, 6408: 4, 6402: 4, 34041: 4, 36194: 2, 32854: 2, 32855: 2 };
const bppOf = ( format, type ) => {

	if ( format === 0x1908 || format === 0x1907 ) {

		if ( type === 0x1406 ) return 16;
		if ( type === 0x140b || type === 0x8d61 ) return 8;

	}
	return BPP[ format ] ?? 4;

};

const textures = new WeakMap(), buffers = new WeakMap(), renderbuffers = new WeakMap();
const boundTexture = new WeakMap(), activeUnit = new WeakMap(), boundBuffer = new WeakMap(), boundRenderbuffer = new WeakMap();
const CUBE = 0x8513;
const targetOf = ( target ) => target >= 0x8515 && target <= 0x851a ? CUBE : target;
const textureFor = ( gl, target ) => boundTexture.get( gl )?.get( `${ activeUnit.get( gl ) ?? 0 }:${ targetOf( target ) }` ) ?? null;
const setLevel = ( tex, key, bytes ) => {

	if ( ! tex ) return;
	let levels = textures.get( tex );
	if ( ! levels ) textures.set( tex, levels = new Map() );
	state.textureBytes += bytes - ( levels.get( key ) ?? 0 );
	levels.set( key, bytes );
	track();

};
const sizeOfSource = ( s ) => s?.videoWidth ? [ s.videoWidth, s.videoHeight ?? 0 ] : s?.naturalWidth ? [ s.naturalWidth, s.naturalHeight ?? 0 ] : [ s?.width ?? 0, s?.height ?? 0 ];

let installed = false;

export function installProbes() {

	if ( installed ) return state;
	installed = true;

	for ( const ctor of [ globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext ] ) {

		if ( ! ctor ) continue;
		const p = ctor.prototype;
		wrap( p, 'drawArrays', ( [ mode, , count ] ) => draw( mode, count ) );
		wrap( p, 'drawElements', ( [ mode, count ] ) => draw( mode, count ) );
		wrap( p, 'drawArraysInstanced', ( [ mode, , count, n ] ) => draw( mode, count, n ) );
		wrap( p, 'drawElementsInstanced', ( [ mode, count, , , n ] ) => draw( mode, count, n ) );
		wrap( p, 'drawRangeElements', ( [ mode, , , count ] ) => draw( mode, count ) );
		wrap( p, 'activeTexture', ( [ unit ], gl ) => activeUnit.set( gl, unit - 0x84c0 ) );
		wrap( p, 'bindTexture', ( [ target, tex ], gl ) => {

			let m = boundTexture.get( gl );
			if ( ! m ) boundTexture.set( gl, m = new Map() );
			m.set( `${ activeUnit.get( gl ) ?? 0 }:${ target }`, tex ?? null );

		} );
		wrap( p, 'texImage2D', ( a, gl ) => {

			const [ target, level, format ] = a;
			let w, h, type;
			if ( a.length >= 8 ) [ w, h, type ] = [ a[ 3 ], a[ 4 ], a[ 7 ] ];
			else {

				[ w, h ] = sizeOfSource( a[ 5 ] );
				type = a[ 4 ];

			}
			setLevel( textureFor( gl, target ), `${ target }:${ level }`, w * h * bppOf( format, type ) );

		} );
		wrap( p, 'texImage3D', ( [ target, level, format, w, h, d, , , type ], gl ) => setLevel( textureFor( gl, target ), `${ target }:${ level }`, w * h * d * bppOf( format, type ) ) );
		wrap( p, 'texStorage2D', ( [ target, levels, format, w, h ], gl ) => {

			let bytes = 0;
			for ( let l = 0; l < levels; l ++ ) bytes += Math.max( 1, w >> l ) * Math.max( 1, h >> l ) * bppOf( format );
			setLevel( textureFor( gl, target ), 'storage', target === CUBE ? bytes * 6 : bytes );

		} );
		wrap( p, 'texStorage3D', ( [ target, levels, format, w, h, d ], gl ) => {

			let bytes = 0;
			for ( let l = 0; l < levels; l ++ ) bytes += Math.max( 1, w >> l ) * Math.max( 1, h >> l ) * d * bppOf( format );
			setLevel( textureFor( gl, target ), 'storage', bytes );

		} );
		wrap( p, 'compressedTexImage2D', ( a, gl ) => setLevel( textureFor( gl, a[ 0 ] ), `${ a[ 0 ] }:${ a[ 1 ] }`, typeof a[ 6 ] === 'number' ? a[ 6 ] : a[ 6 ]?.byteLength ?? 0 ) );
		wrap( p, 'copyTexImage2D', ( [ target, level, format, , , w, h ], gl ) => setLevel( textureFor( gl, target ), `${ target }:${ level }`, w * h * bppOf( format ) ) );
		wrap( p, 'generateMipmap', ( [ target ], gl ) => {

			const tex = textureFor( gl, target ), levels = tex && textures.get( tex );
			const base = levels ? [ ...levels.entries() ].filter( ( [ k ] ) => k.endsWith( ':0' ) ) : [];
			for ( const [ k, v ] of base ) setLevel( tex, `${ k }:mips`, Math.round( v / 3 ) );

		} );
		wrap( p, 'deleteTexture', ( [ tex ] ) => {

			const levels = tex ? textures.get( tex ) : undefined;
			if ( ! levels ) return;
			for ( const v of levels.values() ) state.textureBytes -= v;
			textures.delete( tex );

		} );
		wrap( p, 'bindBuffer', ( [ target, buf ], gl ) => {

			let m = boundBuffer.get( gl );
			if ( ! m ) boundBuffer.set( gl, m = new Map() );
			m.set( target, buf ?? null );

		} );
		wrap( p, 'bufferData', ( [ target, data ], gl ) => {

			const buf = boundBuffer.get( gl )?.get( target );
			if ( ! buf ) return;
			const bytes = typeof data === 'number' ? data : data?.byteLength ?? 0;
			state.bufferBytes += bytes - ( buffers.get( buf ) ?? 0 );
			buffers.set( buf, bytes );
			track();

		} );
		wrap( p, 'deleteBuffer', ( [ buf ] ) => {

			if ( ! buf ) return;
			state.bufferBytes -= buffers.get( buf ) ?? 0;
			buffers.delete( buf );

		} );
		wrap( p, 'bindRenderbuffer', ( [ , rb ], gl ) => boundRenderbuffer.set( gl, rb ?? null ) );
		const storage = ( gl, format, w, h, samples = 1 ) => {

			const rb = boundRenderbuffer.get( gl );
			if ( ! rb ) return;
			const bytes = w * h * bppOf( format ) * Math.max( 1, samples );
			state.renderbufferBytes += bytes - ( renderbuffers.get( rb ) ?? 0 );
			renderbuffers.set( rb, bytes );
			track();

		};
		wrap( p, 'renderbufferStorage', ( [ , f, w, h ], gl ) => storage( gl, f, w, h ) );
		wrap( p, 'renderbufferStorageMultisample', ( [ , s, f, w, h ], gl ) => storage( gl, f, w, h, s ) );

	}

	// the canvas's own drawing buffers (front and back, multisampling and depth)
	const getContext = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function ( kind, options ) {

		const ctx = getContext.call( this, kind, options );
		if ( ctx && /webgl/.test( kind ) && ! this._readout ) {

			this._readout = true;
			const measure = () => {

				const samples = ctx.getContextAttributes()?.antialias ? 4 : 1;
				state.drawingBufferBytes = ctx.drawingBufferWidth * ctx.drawingBufferHeight * ( 4 * 2 + 4 * samples );
				track();

			};
			measure();
			new ResizeObserver( measure ).observe( this );

		}
		return ctx;

	};

	// sounds: each buffer source, oscillator or constant source started, until it ends
	for ( const proto of [ AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype ] ) {

		if ( ! Object.hasOwn( proto, 'start' ) ) continue;
		const start = proto.start;
		proto.start = function ( ...args ) {

			state.voices ++;
			state.peak.voices = Math.max( state.peak.voices, state.voices );
			this.addEventListener( 'ended', () => state.voices --, { once: true } );
			return start.apply( this, args );

		};

	}

	// frames: each one's draws and its time
	let last = 0;
	const onFrame = ( now ) => {

		requestAnimationFrame( onFrame );
		const c = state.current;
		if ( c.calls > 0 ) {

			const f = { calls: c.calls, triangles: c.triangles, ms: last ? now - last : 0 };
			state.frames.push( f );
			if ( state.frames.length > WINDOW ) state.frames.shift();
			const pk = state.peak;
			pk.calls = Math.max( pk.calls, f.calls );
			pk.triangles = Math.max( pk.triangles, f.triangles );
			if ( state.frames.length > 30 ) pk.frameMs = Math.max( pk.frameMs, f.ms );

		}
		state.current = { calls: 0, triangles: 0 };
		last = now;

	};
	requestAnimationFrame( onFrame );

	// script memory, four times a second
	setInterval( () => {

		const m = performance.memory;
		if ( ! m ) return;
		state.heap.push( m.usedJSHeapSize );
		if ( state.heap.length > 80 ) state.heap.shift();
		state.peak.heapMB = Math.max( state.peak.heapMB, m.usedJSHeapSize / MB );

	}, 250 );

	// the last visit, if it never said it was leaving: killed, most likely, and loaded again
	let before = null;
	try {

		before = JSON.parse( localStorage.getItem( KEPT ) || 'null' );

	} catch ( e ) { /* none kept */ }
	state.lastVisit = before && before.alive ? before : null;
	addEventListener( 'pagehide', () => keep( false ) );
	setInterval( () => keep( true ), 2000 );

	window.__readout = { snapshot };
	return state;

}

function keep( alive ) {

	try {

		localStorage.setItem( KEPT, JSON.stringify( { ...snapshot(), alive } ) );

	} catch ( e ) { /* no storage: nothing kept */ }

}

const pct = ( values, q ) => {

	if ( ! values.length ) return 0;
	const sorted = [ ...values ].sort( ( a, b ) => a - b );
	return sorted[ Math.min( sorted.length - 1, Math.floor( q * sorted.length ) ) ];

};

// the figures now, over the last few seconds, and at their highest since the start (or a reset)
export function snapshot() {

	const fr = state.frames, m = performance.memory;
	// (10 s of samples: one that never moved is the browser's rounded, held figure; null till then)
	const live = state.heap.length >= 40 ? new Set( state.heap.slice( - 40 ) ).size > 1 : null;
	return {
		at: new Date().toISOString(),
		seconds: Math.round( ( performance.now() - state.since ) / 1000 ),
		tier: window.__app?.tier ?? null,
		heapMB: m ? + ( m.usedJSHeapSize / MB ).toFixed( 1 ) : null,
		heapLive: m ? live : null, // false: rounded and held by the browser, not to be trusted
		heapLimitMB: m ? Math.round( m.jsHeapSizeLimit / MB ) : null,
		textureMB: + ( state.textureBytes / MB ).toFixed( 1 ),
		gpuMB: + ( gpuBytes() / MB ).toFixed( 1 ),
		voices: state.voices,
		fps: fr.length > 1 ? + ( 1000 / ( fr.reduce( ( s, f ) => s + f.ms, 0 ) / fr.length ) ).toFixed( 1 ) : 0,
		frameMs: { median: + pct( fr.map( ( f ) => f.ms ), 0.5 ).toFixed( 1 ), p95: + pct( fr.map( ( f ) => f.ms ), 0.95 ).toFixed( 1 ) },
		drawCalls: pct( fr.map( ( f ) => f.calls ), 0.95 ),
		triangles: pct( fr.map( ( f ) => f.triangles ), 0.95 ),
		peak: Object.fromEntries( Object.entries( state.peak ).map( ( [ k, v ] ) => [ k, + v.toFixed( 1 ) ] ) ),
		contextLost: state.lost,
		device: {
			memoryGB: navigator.deviceMemory ?? null,
			cores: navigator.hardwareConcurrency ?? null,
			screen: `${ screen.width }x${ screen.height }@${ devicePixelRatio }`,
			canvas: window.__app ? `${ window.__app.renderer.domElement.width }x${ window.__app.renderer.domElement.height }` : null,
			agent: navigator.userAgent,
		},
	};

}

export function resetPeaks() {

	const pk = state.peak;
	for ( const k in pk ) pk[ k ] = 0;
	pk.textureMB = state.textureBytes / MB;
	pk.gpuMB = gpuBytes() / MB;
	pk.voices = state.voices;
	state.frames.length = 0;
	state.since = performance.now();

}

// ---- the panel ----

const fmtK = ( n ) => n >= 1000 ? `${ Math.round( n / 1000 ) }k` : `${ n }`;

export class Readout {

	constructor( { app } ) {

		this.budget = BUDGETS[ app.tier ] ?? BUDGETS.low;
		// (the game's own canvas: App's probe of the GPU lets its throwaway context go on purpose)
		app.renderer.domElement.addEventListener( 'webglcontextlost', () => state.lost ++ );
		const el = this.el = document.createElement( 'div' );
		el.className = 'readout';
		el.innerHTML = `
			<div class="readout-head"><b>Readout</b> <span data-tier></span><button data-fold aria-label="Fold the readout">–</button></div>
			<div class="readout-body">
				<pre data-figures></pre>
				<p class="readout-note" data-note></p>
				<div class="readout-buttons"><button data-reset>Reset peaks</button><button data-copy>Copy</button></div>
				<textarea data-text readonly hidden></textarea>
			</div>`;
		document.body.appendChild( el );
		this.figures = el.querySelector( '[data-figures]' );
		this.note = el.querySelector( '[data-note]' );
		el.querySelector( '[data-tier]' ).textContent = `${ app.tier } · budgets for ${ app.tier }`;
		el.querySelector( '[data-fold]' ).onclick = () => el.classList.toggle( 'folded' );
		el.querySelector( '[data-reset]' ).onclick = () => {

			resetPeaks();
			this.update();

		};
		el.querySelector( '[data-copy]' ).onclick = () => this.copy();
		// (stop taps on the panel reaching the game: the look and the touch controls)
		for ( const ev of [ 'pointerdown', 'touchstart', 'mousedown', 'wheel' ] ) el.addEventListener( ev, ( e ) => e.stopPropagation(), { passive: true } );
		this.update();
		setInterval( () => this.update(), 500 );

	}

	update() {

		const s = snapshot(), b = this.budget, pk = s.peak;
		const of = ( v, cap, unit = '' ) => `${ v }${ unit } of ${ cap }${ unit }`;
		const heap = s.heapMB === null ? 'not given by this browser' : `${ s.heapLive === false ? '~' : '' }${ s.heapMB } MB, peak ${ of( pk.heapMB, b.heapMB, ' MB' ) }`;
		this.figures.textContent = [
			`script    ${ heap }`,
			`graphics  ${ s.gpuMB } MB, peak ${ of( pk.gpuMB, b.gpuMB, ' MB' ) }`,
			`textures  ${ s.textureMB } MB, peak ${ of( pk.textureMB, b.textureMB, ' MB' ) }`,
			`frames    ${ s.fps } fps, ${ s.frameMs.median } ms (95%: ${ s.frameMs.p95 } ms), slowest ${ pk.frameMs } ms`,
			`draws     ${ s.drawCalls }, peak ${ of( pk.calls, b.drawCalls ) }`,
			`triangles ${ fmtK( s.triangles ) }, peak ${ fmtK( pk.triangles ) } of ${ fmtK( b.triangles ) }`,
			`sounds    ${ s.voices }, peak ${ of( pk.voices, b.voices ) }`,
			`device    ${ s.device.memoryGB ?? '?' } GB, ${ s.device.cores ?? '?' } cores, ${ s.device.screen }, canvas ${ s.device.canvas }`,
			`for       ${ Math.floor( s.seconds / 60 ) } min ${ s.seconds % 60 } s`,
		].join( '\n' );
		const notes = [];
		if ( s.heapLive === false ) notes.push( 'Script memory (~) is rounded and held by the browser here: it needs Chrome started with --enable-precise-memory-info, or USB debugging.' );
		if ( s.contextLost ) notes.push( `The graphics were lost ${ s.contextLost } time(s): the phone ran short of graphics memory.` );
		const lv = state.lastVisit;
		if ( lv ) notes.push( `The last visit ended without leaving (killed?) after ${ Math.round( lv.seconds / 60 ) } min: peaks then, script ${ lv.peak.heapMB } MB, graphics ${ lv.peak.gpuMB } MB.` );
		this.note.textContent = notes.join( ' ' );

	}

	copy() {

		const text = JSON.stringify( { ...snapshot(), lastVisit: state.lastVisit }, null, 1 );
		const ta = this.el.querySelector( '[data-text]' );
		ta.value = text;
		ta.hidden = false;
		ta.select();
		let done = false;
		try {

			done = document.execCommand( 'copy' );

		} catch ( e ) { /* shown to copy by hand */ }
		if ( navigator.clipboard && window.isSecureContext ) navigator.clipboard.writeText( text ).then( () => this.copied( ta ), () => {} );
		else if ( done ) this.copied( ta );

	}

	copied( ta ) {

		const b = this.el.querySelector( '[data-copy]' );
		b.textContent = 'Copied';
		setTimeout( () => {

			b.textContent = 'Copy';
			ta.hidden = true;

		}, 1500 );

	}

}
