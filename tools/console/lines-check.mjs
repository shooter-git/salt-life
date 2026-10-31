// (M16) Her lines' figures against the Regulator 23's: node tools/console/lines-check.mjs
import { ConsoleLines } from '../../src/world/boat/console/ConsoleLines.js';

const L = new ConsoleLines();
const deg = ( r ) => ( r * 180 / Math.PI ).toFixed( 1 );
let beam = 0;
for ( let i = 0; i <= 200; i ++ ) beam = Math.max( beam, L.sheerX( i / 200 ) );
console.log( `length ${ L.length.toFixed( 2 ) } m (${ ( L.length / 0.3048 ).toFixed( 1 ) } ft) · beam ${ ( beam * 2 ).toFixed( 2 ) } m · waterline ${ L.wlStart.toFixed( 2 ) } to ${ L.wlEnd.toFixed( 2 ) } (${ ( L.wlEnd - L.wlStart ).toFixed( 2 ) } m)` );
console.log( `volume ${ L.canoeVolume.toFixed( 2 ) } m3, ${ ( L.canoeVolume * 1025 ).toFixed( 0 ) } kg (${ ( L.canoeVolume * 1025 / 0.4536 ).toFixed( 0 ) } lb) · waterplane ${ L.waterplaneArea.toFixed( 2 ) } m2 · CB z ${ L.centerOfBuoyancy.z.toFixed( 2 ) } · CF z ${ L.centerOfFlotationZ.toFixed( 2 ) }` );
for ( const t of [ 0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1 ] ) {

	const yK = L.keelY( t ), xC = L.chineX( t ), yC = L.chineY( t );
	const p = L.station( t, 1 );
	console.log( `t ${ t.toFixed( 2 ) } z ${ L.sheerZ( t ).toFixed( 2 ) } keel z ${ p[ 0 ].z.toFixed( 2 ) } y ${ yK.toFixed( 2 ) } · chine ${ xC.toFixed( 2 ) }, ${ yC.toFixed( 2 ) } deadrise ${ xC > 0.01 ? deg( Math.atan2( yC - yK, xC ) ) : '-' }° · sheer ${ L.sheerX( t ).toFixed( 2 ) }, ${ L.sheerY( t ).toFixed( 2 ) } · WL half ${ L.halfBeamAt( L.sheerZ( t ) ).toFixed( 2 ) } · deck half ${ L.halfBreadth( t, L.deckY ).toFixed( 2 ) }` );

}
