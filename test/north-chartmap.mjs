// (M16) The whole chart on the Fish Hold's Chart tab (game/ChartMap.js), under Node: its view kept on the far sheet and in
// its zoom's range, a zoom about a point leaving that point where it is, the names by the zoom as the minimap has them,
// a round scale, and that it draws the minimap's own sheets, holding no copy.
//
//   node test/north-chartmap.mjs

import { readFileSync } from 'node:fs';
import { clampView, zoomAbout, nameFits, scaleOf, driveView, RANGE } from '../src/game/ChartMap.js';
import { NAMES, SHEETS } from '../src/game/Chart.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};

{

	const v = clampView( { x: 1e9, z: - 1e9, r: 1e9 } ), F = SHEETS.far;
	check( v.x === F.x0 + F.ext && v.z === F.z0 && v.r === RANGE.max, 'kept on the far sheet, no further out than all of it' );
	check( clampView( { x: 0, z: 0, r: 1 } ).r === RANGE.min, 'and no closer in than a few hundred feet across' );

}

{

	const v = { x: 100, z: - 300, r: 1000 }, w = 600, h = 300, px = 500, py = 40;
	const worldOf = ( q ) => [ q.x + ( px - w / 2 ) / ( Math.min( w, h ) / 2 / q.r ), q.z + ( py - h / 2 ) / ( Math.min( w, h ) / 2 / q.r ) ];
	const a = worldOf( v );
	zoomAbout( v, 2.5, px, py, w, h );
	const b = worldOf( v );
	check( v.r === 400 && Math.abs( a[ 0 ] - b[ 0 ] ) < 1e-6 && Math.abs( a[ 1 ] - b[ 1 ] ) < 1e-6, 'a zoom leaves the point under your fingers or the pointer where it is' );

}

{

	const by = ( id ) => NAMES.find( ( n ) => n.id === id );
	check( nameFits( by( 'pier' ), 300 ) && ! nameFits( by( 'pier' ), 2000 ), 'the small names close in only' );
	check( nameFits( by( 'northBeach' ), 800 ) && ! nameFits( by( 'northBeach' ), 9000 ), 'the island\'s out to about its waters' );
	check( nameFits( by( 'hump' ), 5000 ) && ! nameFits( by( 'hump' ), 300 ), 'the far grounds\' once you\'re out past the island' );

}

for ( const [ m, label ] of [ [ 90, '200 ft' ], [ 300, '500 ft' ], [ 400, '0.2 NM' ], [ 1000, '0.5 NM' ], [ 5000, '2 NM' ], [ 20000, '10 NM' ] ] ) check( scaleOf( m ).label.replace( ',', '' ) === label, `a scale about ${ m } m long says ${ label }` );

{

	const src = readFileSync( new URL( '../src/game/ChartMap.js', import.meta.url ), 'utf8' );
	check( src.includes( 'g.drawImage( sh.view' ) && ! /new (Uint8|Float32|ImageData|OffscreenCanvas)/.test( src ) && ( src.match( /createElement\( 'div' \)/g ) || [] ).length === 1, 'it draws the minimap\'s own sheets, holding no copy of them' );
	const hud = readFileSync( new URL( '../src/game/GameHUD.js', import.meta.url ), 'utf8' );
	check( hud.indexOf( 'gm-chartmap-slot' ) < hud.indexOf( 'Mark where you are' ) && hud.includes( '||= new ChartMap' ), 'above the marks on the Chart tab, made the first time it\'s opened' );

}

{

	// without a pointer (ChartMap.drive): the stick or the keys move it by what's shown, and zoom it
	const v = { x: 0, z: 0, r: 1000 };
	check( ! driveView( v, 0.1, 0, 0, 0 ) && v.x === 0, 'nothing held, nothing moved' );
	check( driveView( v, 1, 1, 0, 0 ) && Math.abs( v.x - 1100 ) < 1e-6 && v.z === 0, 'the stick right, east, about its half-width in a second' );
	const w = { x: 0, z: 0, r: 1000 };
	driveView( w, 1, 0, 1, 0 );
	check( w.z < 0 && w.x === 0, 'the stick up, north' );
	const z = { x: 0, z: 0, r: 1000 };
	driveView( z, 0.5, 0, 0, 1 );
	check( z.r < 1000 && Math.abs( z.r - 1000 * Math.exp( - 0.7 ) ) < 1e-6, 'zoomed in, about half in half a second' );
	driveView( z, 100, 1, 1, - 1 );
	check( z.r === RANGE.max && z.x === clampView( { ...z } ).x, 'and kept on the far sheet' );
	const src = readFileSync( new URL( '../src/game/Game.js', import.meta.url ), 'utf8' ), inp = readFileSync( new URL( '../src/core/Input.js', import.meta.url ), 'utf8' );
	check( src.includes( '_chartMap.drive(' ) && src.includes( 'inp.noWalk = onChart' ) && inp.includes( "WALK.has( code )" ), 'the game drives it on its tab, the player not walking off meanwhile' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
