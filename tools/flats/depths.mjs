// (M17) Where game/Flats.js puts each kind of the flats' fish, against the water there: the depth at each school's
// anchor (the tide less the ground, on the 1 m bake with the flats cut in) over two months of island days, by kind and
// mode, by day (7 to 18 h) and at any hour; and how often each kind's in water too shallow for it (world/Fish.js'
// minDepth for its kind, and 0.15 m more), feeding bonefish in tailing water (0.42 m or less), permit in water a permit
// tails in (0.6 m or less).
//   node tools/flats/depths.mjs [days]
import { readFileSync } from 'node:fs';
import { TerrainData } from '../../src/world/TerrainData.js';
import { decodeIsland } from '../../src/world/terrain/IslandDecode.js';
import { flatsSchools } from '../../src/game/Flats.js';
import { tideAt } from '../../src/game/IslandClock.js';

const DAYS = + ( process.argv[ 2 ] || 60 );
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../../public/world/island.bin', import.meta.url ) ) ) ) );
// (world/Fish.js' minDepth, by kind, and the 0.15 m it keeps over that)
const NEED = { bonefish: 0.1, permit: 0.2, tarpon: 0.8, snook: 0.4, barracuda: 0.4, blacktipShark: 0.35, lemonShark: 0.4 };
const rows = {};
const add = ( key, d ) => ( rows[ key ] ||= [] ).push( d );
for ( let t = 24; t < DAYS * 24; t += 0.25 ) {

	const hour = t % 24, sea = tideAt( t ), day = hour >= 7 && hour <= 18;
	for ( const s of flatsSchools( t, { wind: 3, overcast: 0.1, hour } ) ) {

		if ( s.life < 0.99 ) continue;
		const d = sea - terrain.heightAt( s.x, s.z );
		add( `${ s.kind } ${ s.mode }`, d );
		add( `${ s.kind } (all)`, d );
		if ( s.kind === 'bonefish' && ( s.mode === 'tail' || s.mode === 'feed' ) && day ) add( 'bonefish feeding by day', d );
		if ( s.kind === 'bonefish' && s.mode === 'tail' && day ) add( 'bonefish tail by day', d );

	}

}

const q = ( a, p ) => a[ Math.min( a.length - 1, Math.floor( p * a.length ) ) ];
console.log( `depth at the anchor (m) over ${ DAYS } island days: 5th / 25th / 50th / 75th / 95th percentile; too shallow for it` );
for ( const k of Object.keys( rows ).sort() ) {

	const a = rows[ k ].sort( ( x, y ) => x - y ), kind = k.split( ' ' )[ 0 ];
	const need = ( NEED[ kind ] ?? 0.1 ) + 0.15, shallow = a.filter( ( d ) => d < need ).length / a.length;
	let extra = '';
	if ( k === 'bonefish feeding by day' || k === 'bonefish tail by day' ) extra = `, in tailing water (<= 0.42 m) ${ ( a.filter( ( d ) => d <= 0.42 && d >= 0.1 ).length / a.length * 100 ).toFixed( 0 ) }%`;
	if ( kind === 'permit' && k.endsWith( '(all)' ) ) extra = `, in water a permit tails in (<= 0.6 m) ${ ( a.filter( ( d ) => d <= 0.6 ).length / a.length * 100 ).toFixed( 1 ) }%`;
	console.log( `  ${ k.padEnd( 26 ) } ${ [ 0.05, 0.25, 0.5, 0.75, 0.95 ].map( ( p ) => q( a, p ).toFixed( 2 ).padStart( 6 ) ).join( ' ' ) }   n ${ String( a.length ).padStart( 6 ) }, under ${ need.toFixed( 2 ) } m ${ ( shallow * 100 ).toFixed( 1 ) }%${ extra }` );

}
