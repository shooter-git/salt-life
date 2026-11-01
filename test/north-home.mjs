// (M16) The way home in the HUD's panel (game/HomeReadout.js), under Node: shown aboard past sight of the dock and not
// otherwise; home's distance and magnetic bearing; where getting home takes the fuel to, and whether it will; riding in
// someone else's, or in a boat with no engine, the way home with no fuel figures. And that it's left the map.
//
//   node test/north-home.mjs

import { readFileSync } from 'node:fs';
import { homeReadout, SHOWN } from '../src/game/HomeReadout.js';
import { HOME, CRUISE, fuelFor, legTo, magnetic } from '../src/game/Chart.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const at = { x: HOME.x + 3000, z: HOME.z + 4000 }, tank = 42;
const base = { ...at, aboard: true, fuelL: 30, tank, rpm: 0, speed: 0 };

check( homeReadout( { ...base, aboard: false } ) === null, 'not ashore' );
check( homeReadout( { ...base, x: HOME.x + SHOWN - 1, z: HOME.z } ) === null && homeReadout( { ...base, x: HOME.x + SHOWN + 1, z: HOME.z } ) !== null, `only past ${ SHOWN } m from the dock` );
{

	const r = homeReadout( base ), leg = legTo( at.x, at.z, HOME.x, HOME.z ), f = fuelFor( leg.m, 30 );
	check( r.text === `${ ( leg.m / 1852 ).toFixed( 1 ) } NM · ${ String( magnetic( leg.bearing ) ).padStart( 3, '0' ) }°`, `home's distance and bearing, magnetic: ${ r.text }` );
	check( Math.abs( r.need - f.litres / tank ) < 1e-9 && r.state === f.state, `the tick at what it takes to get home (${ ( r.need * 100 ).toFixed( 0 ) }% of the tank), and the state from the same sum: ${ r.state }` );

}

const need = fuelFor( 5000, 0 ).litres;
check( homeReadout( { ...base, fuelL: need * 2 } ).state === 'ok' && homeReadout( { ...base, fuelL: need * 1.2 } ).state === 'tight' && homeReadout( { ...base, fuelL: need * 0.8 } ).state === 'short', 'ok, tight into the last third, short when it won\'t get you there' );
check( homeReadout( { ...base, tank: 10, fuelL: 1 } ).need === 1, 'the tick no further than the end of the bar when it\'s past the tank' );
check( homeReadout( { ...base, speed: CRUISE.speed, rpm: 1 } ).need !== homeReadout( base ).need, 'as she\'s going when she\'s making way' );
for ( const [ what, q ] of [ [ 'riding in someone else\'s', { riding: true } ], [ 'in a boat with no engine', { tank: 0, fuelL: 0 } ] ] ) {

	const r = homeReadout( { ...base, ...q } );
	check( r && r.text && r.need === null && r.state === null, `${ what }: the way home and no fuel figures` );

}

{

	const read = ( f ) => readFileSync( new URL( f, import.meta.url ), 'utf8' );
	const map = read( '../src/game/Minimap.js' ), hud = read( '../src/game/GameHUD.js' );
	check( ! map.includes( 'gm-map-label' ) && map.includes( 'hud.setHome( homeReadout(' ), 'nothing of it by the map: it goes to the HUD' );
	check( hud.indexOf( 'gm-purse-boat' ) > 0 && hud.indexOf( 'class="gm-fuel-tick"' ) > 0 && hud.indexOf( 'class="gm-home-t"' ) > hud.indexOf( 'class="gm-sonar-dots"' ), 'in the panel\'s boat row, after the gauges' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
