// (M11) Plain-node tests of the boat's instruments (world/boat/Instruments.js): where each is in the atlas
// the dash's display takes its uvs from, how the needles read, the engine's temperature and the battery's
// volts, and where she is as the plotter says it. (The drawing itself is a 2D canvas, seen headless.)
import { ATLAS, RECTS, atlasUV, needleAngle, engineTemp, batteryVolts, position, ENGINE } from '../src/world/boat/Instruments.js';
import { BoatModel } from '../src/world/BoatModel.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---- the atlas
const rects = Object.entries( RECTS );
ok( rects.every( ( [ , [ x, y, w, h ] ] ) => x >= 0 && y >= 0 && x + w <= ATLAS.w && y + h <= ATLAS.h ), 'every instrument fits the atlas' );
ok( rects.every( ( [ a, A ], i ) => rects.every( ( [ b, B ], j ) => i === j || A[ 0 ] + A[ 2 ] <= B[ 0 ] || B[ 0 ] + B[ 2 ] <= A[ 0 ] || A[ 1 ] + A[ 3 ] <= B[ 1 ] || B[ 1 ] + B[ 3 ] <= A[ 1 ] ) ), 'and none overlaps another' );
const [ u0, v0, u1, v1 ] = atlasUV( 'chart' );
ok( u0 === 512 / ATLAS.w && v1 === 1 && v0 < v1 && u1 > u0, 'a rect\'s uvs: v up, the canvas\'s top at 1' );
ok( Math.abs( RECTS.sounder[ 2 ] / RECTS.sounder[ 3 ] - 0.31 / 0.21 ) < 0.01, 'the screens drawn at their glass\'s shape' );
// (the dash's display: every uv in the atlas, the screens' and the dials' in their rects)
const boat = new BoatModel();
const uv = boat.meshes.display.geometry.attributes.uv;
let inside = 0;
for ( let i = 0; i < uv.count; i ++ ) {

	const u = uv.getX( i ) * ATLAS.w, v = ( 1 - uv.getY( i ) ) * ATLAS.h;
	if ( rects.some( ( [ , [ x, y, w, h ] ] ) => u >= x - 1e-3 && u <= x + w + 1e-3 && v >= y - 1e-3 && v <= y + h + 1e-3 ) ) inside ++;

}

ok( uv.count > 0 && inside === uv.count, `the dash's screens and dials take their uvs from their rects (${ uv.count } vertices)` );

// ---- the needles: from the lower left, round over the top, to the lower right
const a0 = needleAngle( 'tach', 0 ), a1 = needleAngle( 'tach', 40 ), mid = needleAngle( 'tach', 20 );
ok( Math.abs( a0 - Math.PI * 0.75 ) < 1e-9 && Math.abs( a1 - Math.PI * 2.25 ) < 1e-9 && Math.abs( Math.sin( mid ) + 1 ) < 1e-9, 'a dial sweeps 270°, its middle straight up' );
ok( needleAngle( 'speed', - 3 ) === needleAngle( 'speed', 0 ) && needleAngle( 'volts', 99 ) === needleAngle( 'volts', 16 ), 'off the scale, a needle stops at its pin' );
ok( needleAngle( 'fuel', 0.5 ) === mid, 'half a tank: straight up' );

// ---- the engine: it warms as she runs, cools as she stands; the battery charges, and dips as she cranks
let t = ENGINE.cold;
for ( let s = 0; s < 600; s ++ ) t = engineTemp( t, true, 1 );
ok( Math.abs( t - ENGINE.hot ) < 1, `ten minutes running: up to her running heat (${ t.toFixed( 0 ) }°F)` );
let c = t;
for ( let s = 0; s < 60; s ++ ) c = engineTemp( c, false, 1 );
ok( c < t && c > t - 20, 'a minute stopped: cooling, slowly' );
ok( batteryVolts( 'running' ) > batteryVolts( 'off' ) && batteryVolts( 'cranking' ) < batteryVolts( 'off' ) && batteryVolts( 'stalled' ) === batteryVolts( 'off' ), 'the battery charges running, dips cranking' );

// ---- where she is
const [ lat, lon ] = position( 0, 0 ), [ latN ] = position( 0, - 1852 );
ok( /^24°\d\d\.\d{3}′N$/.test( lat ) && /^81°\d\d\.\d{3}′W$/.test( lon ), `the island's middle: ${ lat } ${ lon }` );
const min = ( s ) => Number( s.slice( s.indexOf( '°' ) + 1, s.indexOf( '′' ) ) );
ok( Math.abs( min( latN ) - min( lat ) - 1 ) < 0.01, 'a nautical mile north: a minute of latitude more' );

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
