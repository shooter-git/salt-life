// (M16) Plain-node tests of the plotter and the compass, stream 10 (world/boat/PlotterChart.js, Instruments.js, Radar.js,
// BoatModel's gimbal, the names in game/Chart.js): the chart drawn for the screen close in, over the real seabed on both
// its maps, with a stand-in canvas that records what's drawn; S-52's dusk and night colours; the labels on what they name;
// the chart's names and the plain ones; the card held level; the radar in magnetic.
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { SHEETS, NAMES, NAME, ChartLog, namedAs, magnetic, VARIATION } from '../src/game/Chart.js';
import { S52, S52_DUSK, S52_NIGHT, SHADES, CONTOURS } from '../src/game/ChartBake.js';
import { PLACES, placeOf } from '../src/game/Places.js';
import { PlotterChart, PALETTES, SCREEN, paletteFor, paletteTable, isoFill, isoLine, blurField, softSeen, sheetBlown, RESOLVE } from '../src/world/boat/PlotterChart.js';
import { BoatInstruments, plotterRange, plotterAcross, PLOTTER_NM, PLOTTER_SLOW, RECTS } from '../src/world/boat/Instruments.js';
import { BoatRadar, radarHeading, NM } from '../src/world/boat/Radar.js';
import { BoatModel, GIMBAL } from '../src/world/BoatModel.js';
import { COMPASS_CARD } from '../src/world/boat/Wheelhouse.js';
import * as THREE from '../src/engine/index.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const deg = ( r ) => r * 180 / Math.PI, rad = ( d ) => d * Math.PI / 180;
const lum = ( c ) => ( 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ] );
const read = ( f ) => new Uint8Array( readFileSync( new URL( '../public/world/' + f, import.meta.url ) ) );
const island = decodeIsland( read( 'island.bin' ) );
const GROUND = {
	high: new TerrainData( 7, island, { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } ),
	low: new TerrainData( 7, island, { offshore: new Offshore( decodeSeabed( read( 'offshore-512.bin' ) ) ) } ),
};

// a stand-in for a 2D canvas: what's filled and stroked, and the paths' points
function fakeContext() {

	const g = {
		log: [], fillText_: [], styles: [], x: 0, y: 0, path: [], gets: 0, puts: 0, images: [],
		save() {}, restore() {}, clip() {}, setLineDash() {}, translate() {}, rotate() {}, scale() {}, closePath() {}, ellipse() {}, arc() {},
		createLinearGradient: () => ( { addColorStop() {} } ),
		measureText: ( t ) => ( { width: t.length * 6 } ),
		beginPath() { this.path = []; },
		moveTo( x, y ) { this.path.push( [ 'm', x, y ] ); },
		lineTo( x, y ) { this.path.push( [ 'l', x, y ] ); },
		rect( x, y, w, h ) { this.path.push( [ 'r', x, y, w, h ] ); },
		fill() { this.log.push( { fill: this.fillStyle, n: this.path.length, path: this.path } ); },
		stroke() { this.log.push( { stroke: this.strokeStyle, n: this.path.length, path: this.path, w: this.lineWidth } ); },
		fillRect( x, y, w, h ) { this.log.push( { rect: this.fillStyle, x, y, w, h } ); },
		strokeRect() {}, clearRect() {},
		strokeText() {},
		fillText( t ) { this.fillText_.push( t ); },
		drawImage( im ) { this.images.push( im ); },
		getImageData( x, y, w, h ) { this.gets ++; return { data: new Uint8ClampedArray( w * h * 4 ) }; },
		putImageData() { this.puts ++; },
		createImageData: ( w, h ) => ( { data: new Uint8ClampedArray( w * h * 4 ) } ),
	};
	return new Proxy( g, { set( t, k, v ) {

		t[ k ] = v;
		if ( k === 'fillStyle' || k === 'strokeStyle' ) t.styles.push( v );
		return true;

	} } );

}
const fakeCanvas = () => {

	const c = { width: 0, height: 0, ctx: fakeContext(), getContext() { return this.ctx; } };
	return c;

};
// the minimap's sheets, as the plotter needs them
const fakeMap = ( T, k ) => {

	const sheet = ( spec, px, name ) => ( { spec, ppm: px / spec.ext, drawn: 1, view: { name }, px } );
	const out = k < 1 ? 512 : 1024, near = k < 1 ? 768 : 1152;
	return { sheets: { far: sheet( SHEETS.far, out, 'far' ), mid: sheet( SHEETS.mid, out, 'mid' ), near: sheet( SHEETS.near, near, 'near' ) }, game: { app: { terrainData: T } }, _bake: { done: true }, soundings: { near: [], mid: [], far: [] } };

};
const W = RECTS.chart[ 2 ], H = RECTS.chart[ 3 ];
const plotter = ( k ) => new PlotterChart( { k, w: W, h: H, make: fakeCanvas } );
const view = ( map, log, x, z, across, palette = 'day' ) => ( { map, log, across, x: 0, y: 0, w: W, h: H, vx: x, vz: z, s: W / across, palette } );
const colour = ( c ) => `rgb(${ c.join( ',' ) })`;
const bank = { x: - 5885, z: 8050 }, hump = { x: NAME.hump.x, z: NAME.hump.z };

// ---- S-52's colours
{

	ok( PALETTES.day === S52 && PALETTES.dusk === S52_DUSK && PALETTES.night === S52_NIGHT, 'the plotter\'s palettes: S-52\'s day, dusk, night' );
	ok( Object.keys( S52_DUSK ).every( ( k ) => S52[ k ] ) && Object.keys( S52_NIGHT ).every( ( k ) => S52[ k ] ), 'each colour of the dark ones has its day' );
	ok( S52_NIGHT.DEPDW.join() === '7,7,7' && S52_NIGHT.DEPVS.join() === '3,4,19' && S52_NIGHT.LANDA.join() === '13,10,8' && S52_NIGHT.DEPCN.join() === '31,34,35' && S52_DUSK.LANDA.join() === '44,41,27' && S52_DUSK.DEPVS.join() === '22,35,47', 'as OpenCPN gives them' );
	const water = [ 'DEPVS', 'DEPMS', 'DEPMD', 'DEPDW' ];
	ok( water.every( ( k ) => lum( S52_NIGHT[ k ] ) < lum( S52[ k ] ) * 0.06 ) && water.every( ( k ) => lum( S52_DUSK[ k ] ) < lum( S52[ k ] ) * 0.2 ), `the water black and near it: night's deep ${ lum( S52_NIGHT.DEPDW ).toFixed( 0 ) } against the day's ${ lum( S52.DEPDW ).toFixed( 0 ) }` );
	ok( lum( S52_NIGHT.DEPCN ) > lum( S52_NIGHT.DEPDW ) * 3 && lum( S52_NIGHT.CHBLK ) > lum( S52_NIGHT.DEPDW ) * 3, 'and the lines and names dim, but over it (the ink goes light after dark)' );
	ok( lum( S52_NIGHT.NODTA ) > lum( S52_NIGHT.DEPDW ) * 1.8 && lum( S52_DUSK.NODTA ) > lum( S52_DUSK.DEPDW ) * 2, 'no chart told from deep water after dark' );
	// the switch, read when the VHF's amber comes on
	ok( paletteFor( 0 ) === 'day' && paletteFor( 0.45 ) === 'dusk' && paletteFor( 1 ) === 'night', 'by the sky: day, dusk, night' );
	ok( paletteFor( 0.21, 'day' ) === 'day' && paletteFor( 0.19, 'dusk' ) === 'dusk' && paletteFor( 0.71, 'dusk' ) === 'dusk' && paletteFor( 0.69, 'night' ) === 'night', 'a little either way before it turns back: no flicker' );
	// the table a sheet's colours are looked up in
	const t0 = performance.now(), T = paletteTable( S52_NIGHT ), ms = performance.now() - t0;
	const look = ( c ) => {

		const q = ( ( ( c[ 0 ] >> 4 ) << 8 ) | ( ( c[ 1 ] >> 4 ) << 4 ) | ( c[ 2 ] >> 4 ) ) * 3;
		return [ T[ q ], T[ q + 1 ], T[ q + 2 ] ];

	};
	ok( [ 'LANDA', 'DEPVS', 'DEPMS', 'DEPMD', 'DEPDW', 'DEPCN', 'CSTLN', 'LANDF', 'DEPIT', 'NODTA', 'CHBLK' ].every( ( k ) => look( S52[ k ] ).every( ( v, i ) => Math.abs( v - S52_NIGHT[ k ][ i ] ) <= 3 ) ), 'a sheet\'s every colour looked up: the night\'s own' );
	ok( T.length === 12288, `one small table, ${ T.length / 1024 } KB (${ ms.toFixed( 1 ) } ms)` );

}

// ---- the lines: a known field
{

	const nx = 41, ny = 41, F = new Float32Array( nx * ny ), step = 4, cx = 80, cy = 80, r = 50;
	for ( let j = 0; j < ny; j ++ ) for ( let i = 0; i < nx; i ++ ) F[ j * nx + i ] = Math.hypot( i * step - cx, j * step - cy ); // (a circle: under r inside)
	const g = fakeContext();
	g.beginPath();
	isoFill( g, F, nx, ny, 0, 0, step, r );
	// the area of what's filled, shoelace over its polygons
	let area = 0, clockwise = true, poly = [];
	const flush = () => {

		let a = 0;
		for ( let i = 0; i < poly.length; i ++ ) {

			const [ x0, y0 ] = poly[ i ], [ x1, y1 ] = poly[ ( i + 1 ) % poly.length ];
			a += x0 * y1 - x1 * y0;

		}

		if ( poly.length ) {

			area += a / 2;
			if ( a < 0 ) clockwise = false;

		}

		poly = [];

	};
	for ( const p of g.path ) {

		if ( p[ 0 ] === 'r' ) {

			flush();
			area += p[ 3 ] * p[ 4 ];

		} else {

			if ( p[ 0 ] === 'm' ) flush();
			poly.push( [ p[ 1 ], p[ 2 ] ] );

		}

	}

	flush();
	ok( Math.abs( area - Math.PI * r * r ) / ( Math.PI * r * r ) < 0.01, `a depth area's filled to its line: ${ area.toFixed( 0 ) } m² of ${ ( Math.PI * r * r ).toFixed( 0 ) }` );
	ok( clockwise, 'its cells all the one way round: one fill, no seams' );
	g.beginPath();
	const segs = isoLine( g, F, nx, ny, 0, 0, step, r );
	let len = 0, worst = 0;
	for ( let i = 0; i < g.path.length; i += 2 ) {

		const a = g.path[ i ], b = g.path[ i + 1 ];
		len += Math.hypot( b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] );
		worst = Math.max( worst, Math.abs( Math.hypot( a[ 1 ] - cx, a[ 2 ] - cy ) - r ) );

	}

	ok( segs > 40 && Math.abs( len - Math.PI * 2 * r ) / ( Math.PI * 2 * r ) < 0.01 && worst < 0.1, `a contour a line: ${ segs } segments, ${ len.toFixed( 1 ) } long of ${ ( Math.PI * 2 * r ).toFixed( 1 ) }, within ${ worst.toFixed( 2 ) } of it` );
	// the blur: holds a level, smooths a step
	const flat = new Float32Array( 100 ).fill( 3 ), S = new Float32Array( 100 ), Tt = new Float32Array( 100 );
	blurField( flat, S, Tt, 10, 10, 2 );
	ok( S.every( ( v ) => Math.abs( v - 3 ) < 1e-5 ), 'the depths smoothed: a level stays level' );

}

// ---- the screen's chart
for ( const [ tier, k ] of [ [ 'high', 1 ], [ 'low', 0.5 ] ] ) {

	const T = GROUND[ tier ], map = fakeMap( T, k ), log = new ChartLog(), S = map.sheets;
	for ( const [ x, z ] of [ [ bank.x, bank.z ], [ bank.x + 120, bank.z + 70 ], [ hump.x, hump.z ] ] ) log.look( x, z, 320 );
	const across0 = PLOTTER_NM[ 0 ] * 1852, pxm = W / across0 * k;
	// what's blown up at each range: the same on both tiers, the low's sheets and screen both half
	ok( sheetBlown( S.far.ppm, pxm ) && sheetBlown( S.mid.ppm, pxm ) && ! sheetBlown( S.near.ppm, pxm ), `${ tier }: at the closest range ${ ( 1 / pxm ).toFixed( 1 ) } m a pixel: the far sheet ${ ( S.far.ppm * 1 / pxm ).toFixed( 3 ) }, blown up; the island's not` );
	const P = plotter( k ), g = P.ctx;
	const dest = fakeContext();
	P.draw( dest, view( map, log, bank.x, bank.z, across0 ) );
	ok( P.vector && P.redraws === 1, `${ tier }: over the bank at its closest range it's drawn for the screen` );
	ok( ! g.images.length && dest.images.length === 1, 'no sheet in it (the far one\'s not drawn up)' );
	const fills = g.log.filter( ( l ) => l.fill ), lines = g.log.filter( ( l ) => l.stroke );
	const has = ( c ) => fills.some( ( l ) => l.fill === colour( c ) && l.n > 0 );
	ok( has( S52.DEPVS ) && has( S52.DEPMS ), `the bank's depth areas filled: ${ fills.length } fills` );
	ok( lines.some( ( l ) => l.stroke === colour( S52.DEPCN ) && l.n > 2 ), `its contours lines: ${ lines.map( ( l ) => l.n / 2 ).join( ', ' ) } segments` );
	// each contour's where the ground says: the smoothed depth's within the depth's change over a screen's few pixels of it
	const contour = lines.find( ( l ) => l.stroke === colour( S52.DEPCN ) && l.n > 10 ), m = 1 / pxm, x0 = bank.x - P.W / ( 2 * pxm ), z0 = bank.z - P.H / ( 2 * pxm );
	let near = 0, pts = 0;
	const levels = CONTOURS;
	for ( let i = 0; i < contour.path.length; i += 8 ) {

		const [ , px, py ] = contour.path[ i ];
		if ( px < 0 || py < 0 || px > P.W || py > P.H ) continue;
		const d = - T.heightAt( x0 + px * m, z0 + py * m );
		pts ++;
		if ( levels.some( ( c ) => Math.abs( d - c ) < Math.max( 1.5, c * 0.25 ) ) ) near ++;

	}

	ok( pts > 3 && near / pts > 0.85, `its lines on the ground's own depths (${ near } of ${ pts } points)` );
	// the plotter's own pixel: the sharpest it could be, nothing scaled
	const before = P.redraws;
	P.draw( dest, view( map, log, bank.x, bank.z, across0 ) );
	P.draw( dest, view( map, log, bank.x + 0.5, bank.z, across0 ) );
	ok( P.redraws === before, 'not drawn again till the view changes' );
	P.draw( dest, view( map, log, bank.x + 20 / pxm, bank.z, across0 ) );
	ok( P.redraws === before + 1, 'and again when she\'s gone past its margin' );
	// the palette: one redraw; a vector view drawn straight in it, not read back
	P.draw( dest, view( map, log, bank.x + 20 / pxm, bank.z, across0, 'night' ) );
	ok( P.redraws === before + 2 && g.gets === 0, 'a change of palette: one redraw, no pixels read back' );
	const nightLog = g.log.slice( - 40 ).filter( ( l ) => l.fill );
	ok( nightLog.some( ( l ) => l.fill === colour( S52_NIGHT.DEPVS ) || l.fill === colour( S52_NIGHT.DEPMS ) ), 'in its own colours' );
	// (a sheet's picture comes a moment after the chart's changed: drawn again for that too, a second apart at most)
	{

		const V = plotter( k ), d = fakeContext(), real = performance.now;
		let now = 1e6;
		performance.now = () => now;
		V.draw( d, view( map, log, 65, 300, across0 ) );
		const was = V.redraws;
		S.near.drawn ++;
		V.draw( d, view( map, log, 65, 300, across0 ) );
		const soon = V.redraws;
		now += 1500;
		V.draw( d, view( map, log, 65, 300, across0 ) );
		performance.now = real;
		S.near.drawn --;
		ok( soon === was && V.redraws === was + 1, 'a sheet drawn again shows on the plotter, a second apart at most' );

	}

	// by the island, a sheet in the view: looked up
	const Q = plotter( k ), near0 = fakeContext();
	Q.draw( near0, view( map, log, 65, 300, across0, 'night' ) );
	ok( ! Q.vector && Q.ctx.gets === 1 && Q.ctx.puts === 1 && Q.ctx.images.some( ( im ) => im.name === 'near' ), 'over the island\'s own sheet: that sheet, its colours looked up, once' );
	Q.draw( near0, view( map, log, 65, 300, across0, 'night' ) );
	ok( Q.ctx.gets === 1, 'and not again till it changes' );
	Q.draw( near0, view( map, log, 65, 300, across0, 'day' ) );
	ok( Q.ctx.gets === 1, 'by day, none' );
	// blank where you haven't been
	const R = plotter( k ), far = fakeContext();
	R.draw( far, view( map, log, bank.x, bank.z, across0 ) );
	ok( softSeen( log, log.far, bank.x, bank.z ) > 0.5 && softSeen( log, log.far, 12000, - 12000 ) === 0, 'charted where she\'s been, not elsewhere' );
	const blank = plotter( k ), fresh = new ChartLog();
	blank.draw( far, view( map, fresh, bank.x, bank.z, across0 ) );
	const last = blank.ctx.log.filter( ( l ) => l.fill ).pop();
	ok( last.fill === colour( S52.NODTA ) && last.path.some( ( p ) => p[ 0 ] === 'r' && p[ 3 ] > 100 ), 'blank over the lot on a chart that\'s never been there' );
	// soundings: on a lattice that stays put on the sea
	const A = plotter( k ), B = plotter( k ), a = fakeContext();
	A.draw( a, view( map, log, bank.x, bank.z, across0 ) );
	B.draw( a, view( map, log, bank.x + 60, bank.z + 40, across0 ) );
	const onBoth = A.soundings.filter( ( p ) => B.soundings.some( ( q ) => q.x === p.x && q.z === p.z ) );
	ok( A.soundings.length > 6 && onBoth.length > 2 && A.soundings.every( ( p ) => Math.abs( p.d + T.heightAt( p.x, p.z ) ) < 1e-6 ), `soundings of its own at this range (${ A.soundings.length }, each what's there), the same ones as she moves` );
	// the bigger ranges: the sheet, once its pixels no longer show
	const wide = plotter( k );
	wide.draw( a, view( map, log, bank.x, bank.z, 24 * 1852 ) );
	ok( ! wide.vector && wide.ctx.images.some( ( im ) => im.name === 'far' ), 'further out, the far sheet as it was' );
	const three = plotter( k );
	three.draw( a, view( map, log, bank.x, bank.z, 3 * 1852 ) );
	ok( three.vector, 'at 3 NM across, still its own' );
	// what it costs
	const times = [];
	for ( let i = 0; i < 9; i ++ ) {

		const t0 = performance.now();
		P._redraw( map, log, across0, bank.x + i, bank.z, W / across0, pxm, 'night' );
		times.push( performance.now() - t0 );

	}

	times.sort( ( p, q ) => p - q );
	const bytes = Object.values( P._grid ).reduce( ( s, v ) => s + v.byteLength, 0 );
	// (the quickest of them: on a busy machine the rest are anything)
	ok( times[ 0 ] < 18, `${ tier }: a redraw's numbers ${ times[ 0 ].toFixed( 1 ) } ms at best, ${ times[ 4 ].toFixed( 1 ) } typically here (the bake's 18 a step; the canvas's own painting's measured headless)` );
	if ( tier === 'low' ) ok( bytes < 0.15 * 1048576, `its grid ${ ( bytes / 1024 ).toFixed( 0 ) } KB, in the budget's 0.2 MB` );

}

// ---- the range: ranging in when she's slowed
{

	ok( plotterRange( 8000, 0 ) === plotterAcross( 8000 ) && plotterRange( 8000, PLOTTER_SLOW.after - 0.1 ) === plotterAcross( 8000 ), 'under way, the range as it was' );
	ok( plotterRange( 8000, PLOTTER_SLOW.after ) === PLOTTER_NM[ 0 ] * 1852, 'stopped a few seconds, far out, right in on the water she\'s on' );
	ok( plotterRange( 10400, 0 ) > 8 * 1852, `(without which, over the bank it's ${ ( plotterAcross( 10400 ) / 1852 ).toFixed( 0 ) } NM across, and nothing to see close in)` );

}

// ---- the instruments themselves, at night: only the plotter's screen changes
{

	const canvases = [];
	globalThis.document = { createElement: () => {

		const c = fakeCanvas();
		canvases.push( c );
		return c;

	} };
	const material = new THREE.MeshBasicMaterial();
	const ins = new BoatInstruments( { material, tier: 'low' } );
	const T = GROUND.low, map = fakeMap( T, 0.5 ), log = new ChartLog();
	log.look( bank.x, bank.z, 320 );
	log.mark( bank.x + 60, bank.z, 1 );
	log.caught( 'grunt', 'bank', bank.x - 80, bank.z, 1 );
	const reading = ( night ) => ( { engine: 'running', rpm: 0.3, speed: 0, heading: 1, fuel: 0.5, depth: 5, finder: false, fish: 0, x: bank.x, z: bank.z, chart: map, log, night, names: NAMES, view: 10400, fuelL: 30, speedMul: 1, alert: '' } );
	ins._slowFor = 100;
	const g = ins.ctx;
	g.styles.length = 0;
	ins._chart( reading( 1 ) );
	const parse = ( s ) => ( typeof s === 'string' && s.match( /\d+/g ) ? s.match( /\d+/g ).slice( 0, 3 ).map( Number ) : null );
	const hex = ( s ) => /^#/.test( s ) ? [ 1, 3, 5 ].map( ( i ) => parseInt( s.slice( i, i + 2 ), 16 ) ) : parse( s );
	const bright = g.styles.map( hex ).filter( ( c ) => c && lum( c ) > 70 );
	ok( ins.plotter.vector && bright.length === 0, `its whole screen dim at night, chart and bars: none of its ${ g.styles.length } colours over 70 of 255` );
	ok( g.fillText_.some( ( t ) => /°M/.test( t ) ) && g.fillText_.some( ( t ) => /HOME/.test( t ) ), 'and it still says all it said' );
	g.styles.length = 0;
	ins._palette = 'day';
	ins._chart( reading( 0 ) );
	ok( g.styles.includes( SCREEN.day.text ) && g.styles.includes( SCREEN.day.her ), 'by day, as it was' );
	// (the sounder's its own colours, whatever the hour)
	g.styles.length = 0;
	ins.pings.push( { depth: 5, fish: [] } );
	ins._sounder( reading( 1 ) );
	const sd = g.styles.slice();
	g.styles.length = 0;
	ins._sounder( reading( 0 ) );
	ok( sd.join() === g.styles.join(), 'the sounder\'s not touched' );
	ok( canvases.length === 2 && ins.plotter.W === Math.ceil( W * 0.5 ) + 32, `no new canvas till it's first drawn, aboard; one, ${ ins.plotter.W } x ${ ins.plotter.H } on low` );
	delete globalThis.document;

}

// ---- the labels, on what they name, on both the seabed's maps
for ( const [ tier, T ] of Object.entries( GROUND ) ) {

	// the Hump's top: the middle of all that's shallower than 110 m
	let sx = 0, sz = 0, n = 0, top = Infinity;
	for ( let x = 4300; x <= 6300; x += 16 ) for ( let z = - 4400; z <= - 2700; z += 16 ) {

		const d = - T.heightAt( x, z );
		if ( d < 110 ) {

			sx += x;
			sz += z;
			n ++;

		}

		top = Math.min( top, d );

	}

	ok( Math.hypot( sx / n - NAME.hump.x, sz / n - NAME.hump.z ) < 40, `${ tier }: the Hump's label on its top (${ ( sx / n ).toFixed( 0 ) }, ${ ( sz / n ).toFixed( 0 ) }; the name's at ${ NAME.hump.x }, ${ NAME.hump.z })` );
	ok( - T.heightAt( NAME.hump.x, NAME.hump.z ) < top + 8, `over ${ ( - T.heightAt( NAME.hump.x, NAME.hump.z ) ).toFixed( 0 ) } m, its top ${ top.toFixed( 0 ) } (it was 500 m off, over 266)` );
	const at = ( n ) => - T.heightAt( n.x, n.z );
	ok( at( NAME.ledge ) > 150 && at( NAME.ledge ) < 300, `${ NAME.ledge.name } on the terrace (${ at( NAME.ledge ).toFixed( 0 ) } m; SEABED has it at 210)` );
	ok( at( NAME.bank ) > 10 && at( NAME.bank ) < 30, `${ NAME.bank.name } on its top (${ at( NAME.bank ).toFixed( 0 ) } m)` );
	ok( at( NAME.sandbar ) < 2, `${ NAME.sandbar.name } on the bar (${ at( NAME.sandbar ).toFixed( 1 ) } m)` );
	// (the canyon: on its axis, deeper than either side)
	ok( at( NAME.canyon ) > - T.heightAt( NAME.canyon.x - 300, NAME.canyon.z ) + 80 && at( NAME.canyon ) > - T.heightAt( NAME.canyon.x + 300, NAME.canyon.z ) + 80, `${ NAME.canyon.name } in it (${ at( NAME.canyon ).toFixed( 0 ) } m)` );

}

ok( placeOf( {}, NAME.hump.x, NAME.hump.z ) === 'hump' && placeOf( {}, NAME.bank.x, NAME.bank.z ) === 'bank' && placeOf( {}, NAME.sandbar.x, NAME.sandbar.z ) === 'bank', 'each over its own place\'s water' );

// ---- the names: the chart's and the plain
{

	ok( NAMES.every( ( n ) => typeof n.name === 'string' && n.name && typeof n.plain === 'string' && n.plain ), 'each has its name on the chart and its plain one' );
	ok( NAMES.filter( ( n ) => PLACES[ n.id ] ).every( ( n ) => PLACES[ n.id ].name === n.plain ), 'a place\'s plain one is what the log and Joe call it' );
	ok( new Set( NAMES.map( ( n ) => n.name ) ).size === NAMES.length, 'no two alike on the chart' );
	// (the kind of thing it is stays in its name, where it can: nobody wonders where "the bank" is)
	const word = { bay: 'Bay', eastHead: 'Head', westHead: 'Head', pier: 'Pier', creek: 'Creek', westCave: 'Cave', nwCave: 'Cave', northWest: 'Point', windReef: 'Reef', northBeach: 'Beach', canyon: 'Canyon', ledge: 'Ledge', hump: 'Hump', bank: 'Bank', sandbar: 'Bar' };
	ok( Object.entries( word ).every( ( [ id, w ] ) => NAME[ id ].name.includes( w ) && NAME[ id ].plain.toLowerCase().includes( w.toLowerCase() ) ), 'and the word for it in both, chart and plain: Thunder Bank, the bank' );
	ok( namedAs( NAME.bank ) === 'Thunder Bank (the bank)' && namedAs( NAME.summit ) === 'Mt St Anne (the summit)', `told as both: "${ namedAs( NAME.bank ) }"` );
	const s = new ChartLog(), saved = JSON.parse( JSON.stringify( { names: [ 'bay', 'hump', 'bank', 'northBeach' ], near: '', mid: '', far: '' } ) );
	s.fromJSON( saved );
	ok( [ 'hump', 'bank', 'northBeach' ].every( ( id ) => s.named( id ) ), 'a save\'s names, by their ids, as they were' );

}

// ---- the card on its gimbal
{

	const b = new BoatModel(), m = b.compassMesh, q = new Quaternion(), X = new Vector3( 1, 0, 0 ), Y = new Vector3( 0, 1, 0 ), Z = new Vector3( 0, 0, 1 );
	const pose = ( pitch, roll, head = 0.7 ) => {

		q.setFromAxisAngle( Y, head );
		q.multiply( new Quaternion().setFromAxisAngle( X, pitch ) );
		q.multiply( new Quaternion().setFromAxisAngle( Z, roll ) );

	};
	// the card's own up, in the world
	const cardUp = () => {

		m.updateMatrix();
		return new Vector3( 0, 1, 0 ).transformDirection( m.matrix ).applyQuaternion( q );

	};
	const settle = ( pitch, roll, s = 12 ) => {

		pose( pitch, roll );
		for ( let i = 0; i < s * 60; i ++ ) b.swingCompass( 1 / 60, q );
		return deg( cardUp().angleTo( Y ) );

	};
	ok( settle( 0, 0 ) < 0.01 && Math.abs( m.rotation.x ) < 1e-3 && Math.abs( m.rotation.z ) < 1e-3, 'on a level boat, flat in the bowl' );
	ok( settle( rad( 12 ), rad( - 18 ) ) < 0.2, 'pitched 12° and heeled 18°: level in the world, at her rest' );
	ok( Math.abs( settle( rad( 28 ), 0 ) ) < 0.3 && Math.abs( settle( 0, rad( 40 ) ) ) < 0.3, 'free to 30° pitch, 45° roll' );
	const over = settle( rad( 40 ), 0 );
	ok( Math.abs( over - 10 ) < 0.5 && Math.abs( deg( Math.abs( m.rotation.x ) ) - deg( GIMBAL.pitch ) ) < 0.01, `pitched 40°: touching at ${ deg( Math.abs( m.rotation.x ) ).toFixed( 0 ) }°, tipped with her the rest (${ over.toFixed( 1 ) }°)` );
	settle( 0, rad( 60 ) );
	ok( Math.abs( deg( Math.abs( m.rotation.z ) ) - deg( GIMBAL.roll ) ) < 0.01, 'heeled past 45°: the same' );
	// a seaway: 15° of roll at 4 s, 6° of pitch at 3 s: barely off level, the bowl going round it
	settle( 0, 0 );
	let most = 0, bowlMost = 0;
	for ( let i = 0; i < 40 * 60; i ++ ) {

		const t = i / 60, r = rad( 15 ) * Math.sin( t * Math.PI * 2 / 4 ), p = rad( 6 ) * Math.sin( t * Math.PI * 2 / 3 );
		pose( p, r );
		b.swingCompass( 1 / 60, q );
		if ( t > 10 ) {

			most = Math.max( most, deg( cardUp().angleTo( Y ) ) );
			bowlMost = Math.max( bowlMost, deg( new Vector3( 0, 1, 0 ).applyQuaternion( q ).angleTo( Y ) ) );

		}

	}

	ok( bowlMost > 14 && most < 8 && most > 0.3, `in a seaway the bowl rolls ${ bowlMost.toFixed( 0 ) }°, the card ${ most.toFixed( 1 ) }° (it lags, a little)` );
	// a quick lurch: the card a moment behind, then level
	settle( 0, 0 );
	let worst = 0;
	for ( let i = 0; i < 30; i ++ ) {

		pose( 0, rad( 20 ) * Math.min( 1, i / 20 ) );
		b.swingCompass( 1 / 60, q );
		worst = Math.max( worst, deg( cardUp().angleTo( Y ) ) );

	}

	ok( worst > 0.5 && worst < 12, `a lurch of 20° in a third of a second: the card ${ worst.toFixed( 1 ) }° off level, its lag` );
	// (its heading goes on through a roll)
	const hd = deg( b.compassHeading );
	pose( 0, 0, 0.7 );
	for ( let i = 0; i < 900; i ++ ) {

		pose( 0, rad( 15 ) * Math.sin( i / 60 * Math.PI * 2 / 4 ), 0.7 );
		b.swingCompass( 1 / 60, q );

	}

	ok( Number.isFinite( hd ) && Math.abs( ( ( ( deg( b.compassHeading ) - ( ( 180 - deg( 0.7 ) + 6.3 ) ) ) % 360 ) + 540 ) % 360 - 180 ) < 2, 'and it goes on reading her heading, rolling' );
	// it stays in its dome, at any tilt: about the pivot at the dome's middle
	const C = COMPASS_CARD, pivot = new Vector3( 0, - GIMBAL.under, 0 ), dome = 0.052;
	let reach = 0;
	for ( const [ x, z ] of [ [ 0, 0 ], [ GIMBAL.pitch, 0 ], [ - GIMBAL.pitch, 0 ], [ 0, GIMBAL.roll ], [ GIMBAL.pitch, GIMBAL.roll ] ] ) {

		pose( x, z );
		for ( let i = 0; i < 600; i ++ ) b.swingCompass( 1 / 60, q );
		const at = m.position.clone();
		m.updateMatrix();
		for ( let a = 0; a < 6.28; a += 0.3 ) {

			const rim = new Vector3( Math.cos( a ) * C.skirt, 0, Math.sin( a ) * C.skirt ).applyMatrix4( m.matrix );
			reach = Math.max( reach, rim.distanceTo( new Vector3( b._cardAt.x, b._cardAt.y - GIMBAL.under, b._cardAt.z ) ) );

		}

		at.sub( new Vector3( b._cardAt.x, b._cardAt.y - GIMBAL.under, b._cardAt.z ) );
		ok( Math.abs( at.length() - GIMBAL.under ) < 1e-6, `its middle stays ${ ( GIMBAL.under * 1000 ).toFixed( 0 ) } mm over the pivot at ${ deg( x ).toFixed( 0 ) }°, ${ deg( z ).toFixed( 0 ) }°` );

	}

	ok( reach <= dome, `its rim inside the dome at every tilt (${ ( reach * 1000 ).toFixed( 1 ) } of ${ dome * 1000 } mm)` );
	pose( rad( 10 ), rad( 10 ) );
	b.swingCompass( 0.5, q );
	ok( Number.isFinite( m.rotation.x ) && Number.isFinite( m.rotation.z ), 'a long frame doesn\'t throw it' );
	const triangles = m.geometry.index.count / 3;
	ok( triangles < 300 && pivot.y < 0, `no new triangles for it: the card's ${ triangles }, its gimbal inside the bowl` );

}

// ---- the radar reads as the plotter does
{

	ok( radarHeading( 0 ) === '006.3°M' && radarHeading( Math.PI / 2 ) === '096.3°M' && radarHeading( VARIATION ) === '000.0°M', `its heading magnetic, and says so: north's ${ radarHeading( 0 ) }` );
	let same = true;
	for ( let d = 0; d < 360; d += 7 ) {

		const r = d * Math.PI / 180;
		if ( ( Math.round( parseFloat( radarHeading( r ) ) ) % 360 ) !== magnetic( r ) ) same = false;

	}

	ok( same, 'the same figure as the plotter\'s, to the degree, all the way round' );
	const terrain = GROUND.low, r = new BoatRadar( { terrain, size: 16 } ), g = fakeContext();
	r.update( 1 / 60, { x: 65, z: 300, heading: 0, beam: 0, sea: 0 } );
	r.draw( g, [ 0, 0, 492, 334 ], { heading: 0 } );
	ok( g.fillText_.includes( '006.3°M' ) && g.fillText_.includes( 'H UP' ), 'on its screen, heading up' );
	// (the scale: magnetic north 6.3° west of true, which is up with her heading true north)
	const line = [];
	const h = fakeContext();
	const moveTo = h.moveTo;
	h.moveTo = function ( x, y ) { line.push( [ x, y ] ); moveTo.call( this, x, y ); };
	r.draw( h, [ 0, 0, 492, 334 ], { heading: 0 } );
	const cx = 246, cy = 334 / 2 + 4, tick = line.find( ( [ x, y ] ) => Math.abs( Math.hypot( x - cx, y - cy ) - ( ( 334 - 34 ) / 2 + 1 ) ) < 0.01 );
	ok( tick && Math.abs( deg( Math.atan2( tick[ 0 ] - cx, cy - tick[ 1 ] ) ) + 6.3 ) < 0.01, 'its bearing scale too: its 000 where magnetic north is' );
	ok( NM === 1852, '(the range unchanged)' );

}

// ---- each boat with a card has it on its gimbal, as the lobster boat's
{

	const { loadBoat } = await import( '../src/world/boat/Boats.js' );
	for ( const id of [ 'console', 'sportfisher' ] ) {

		const b = await loadBoat( id ), q = new Quaternion().setFromAxisAngle( new Vector3( 1, 0, 0 ), 0.3 );
		for ( let i = 0; i < 400; i ++ ) b.swingCompass( 1 / 60, q );
		ok( Math.abs( Math.abs( b.compassMesh.rotation.x ) - 0.3 ) < 0.01 && b.compassMesh.rotation.order === 'XZY', `${ id }: pitched 0.3 rad, her card's still level (${ b.compassMesh.rotation.x.toFixed( 3 ) } from the bowl)` );
		if ( b.towerCompass ) ok( b.towerCompass.rotation.x === b.compassMesh.rotation.x, `${ id }: and the tower's` );

	}
	const kayak = await loadBoat( 'kayak' );
	kayak.swingCompass( 1 / 60, new Quaternion() );
	ok( ! kayak._hung, 'a kayak has no card to hang' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
