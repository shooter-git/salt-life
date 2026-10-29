// (M15) The island's landmarks (world/Lighthouse.js, and the others as they come): the lighthouse on the
// north-west headland, its light's character (one white flash every ten seconds, a third of a second long),
// how far it's seen over the earth's curve, and its place: high on the headland, looking down on the windward
// reef it warns ships off, nothing of the island in the way.
//
//   node test/landmarks.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { LIGHTHOUSE, flashAt, horizonOf } from '../src/world/Lighthouse.js';
import { HARBOUR_LIGHTS, lightAt } from '../src/world/HarbourLights.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ) );

// ---- the lighthouse's light: Fl W 10s, from every side
{

	let worst = 0;
	for ( const bearing of [ 0, 1, 2.5, - 1.3, 3.1 ] ) {

		const starts = [], lengths = [];
		let on = false, len = 0;
		for ( let t = 1; t < 61; t += 0.005 ) { // (from a second in: none already under way)

			const k = flashAt( t, bearing );
			if ( k > 0.5 && ! on && flashAt( t - 0.005, bearing ) <= 0.5 ) {

				starts.push( t );
				on = true;
				len = 0;

			}

			if ( k > 0.5 ) len += 0.005;
			if ( k <= 0.5 && on ) {

				on = false;
				lengths.push( len );

			}

		}

		for ( let i = 1; i < starts.length; i ++ ) worst = Math.max( worst, Math.abs( starts[ i ] - starts[ i - 1 ] - 10 ) );
		worst = Math.max( worst, ...lengths.map( ( l ) => Math.abs( l - 0.3 ) * 10 ) );

	}

	check( worst < 0.05, 'its light: one flash every 10 s, a third of a second long, from whichever side (Fl W 10s)' );

}

// ---- where it stands
{

	const L = LIGHTHOUSE, ground = T.heightAt( L.x, L.z ), focal = ground + 19;
	const range = horizonOf( focal, 3 ) / 1000;
	console.log( `     on the headland ${ ground.toFixed( 0 ) } m up, its light about ${ focal.toFixed( 0 ) } m over the sea: over the horizon from ${ range.toFixed( 0 ) } km out (an eye 3 m up)` );
	check( ground > 40 && range > 30, 'high on the north-west headland, seen from far out' );
	// (the windward reef in plain sight from its lantern: nothing of the island in the way)
	const R = WORLD.northReef.center;
	let clear = true;
	for ( let t = 0.05; t < 1; t += 0.01 ) {

		const x = L.x + ( R.x - L.x ) * t, z = L.z + ( R.z - L.z ) * t, y = focal + ( 0 - focal ) * t;
		if ( T.heightAt( x, z ) > y ) clear = false;

	}

	check( clear && Math.hypot( R.x - L.x, R.z - L.z ) < 300, 'looking down on the windward reef, a few hundred metres off: the danger it marks' );

}

// ---- the harbour lights: red right returning (IALA region B), coming in northward from the sea
{

	const by = Object.fromEntries( HARBOUR_LIGHTS.map( ( l ) => [ l.id, l ] ) ), E = by.east, W = by.west, P = by.pier;
	const red = ( c ) => ( c >> 16 & 255 ) > 200 && ( c >> 8 & 255 ) < 100, green = ( c ) => ( c >> 8 & 255 ) > 200 && ( c >> 16 & 255 ) < 100;
	check( red( E.colour ) && E.mark === 'triangle' && green( W.colour ) && W.mark === 'square' && E.x > W.x && P.x > W.x && P.x < E.x, 'red to starboard on the east headland (a triangle), green to port on the west (a square), the pier\'s white light between' );
	const lit = ( l ) => {

		let on = 0;
		for ( let t = 0; t < 40; t += 0.01 ) on += lightAt( t, l.char ) > 0.5 ? 0.01 : 0;
		return on / 40;

	};
	check( Math.abs( lit( E ) - 0.125 ) < 0.01 && Math.abs( lit( W ) - 0.125 ) < 0.01 && Math.abs( lit( P ) - 0.5 ) < 0.01, 'flashing half a second in four (Fl R 4s, Fl G 4s); the pier\'s as long lit as dark (Iso W 4s)' );
	check( [ E, W ].every( ( l ) => T.heightAt( l.x, l.z ) > 5 ) && Math.min( E.z, W.z ) > 150 && P.z < Math.min( E.z, W.z ), 'each on its headland\'s end, high on the rocks, at the bay\'s mouth' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
