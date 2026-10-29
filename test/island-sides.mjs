// (M15) The island's sides fish differently (Bites.habitatAt's wash and side, Game.habitatAtPoint and
// Game.windwardAt over the real island): the pompano, the permit and the snook in a sandy beach's surf, the
// windward north beach's best; a surf day there brings them on, a blow from the north blows it out (and its
// shallows) while the bay in its lee fishes as ever; and Joe's slate says which side to fish.
//
//   node test/island-sides.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Game } from '../src/game/Game.js';
import { pickSpecies, biteDelay } from '../src/game/Bites.js';
import { weatherAt, NORTH } from '../src/game/Weather.js';
import { FISH } from '../src/game/FishTable.js';
import { biteHint } from '../src/game/Orders.js';
import { SPECIES, SKIN } from '../src/world/fish/FishSpecies.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
let seed = 5;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
const P = Game.prototype;
const game = { app: { terrainData: T, finds: null }, _pier: WORLD.pier, findsNear: P.findsNear, windwardAt: P.windwardAt, sandAt: P.sandAt };
// a spot as the bobber's would be (Game.habitat: its waters, its side, the weather)
const spot = ( x, z, w = null ) => {

	const h = P.habitatAtPoint.call( game, x, z, Math.max( 0, - T.heightAt( x, z ) ) );
	h.side = P.windwardAt.call( game, x, z );
	h.weather = w;
	return h;

};
const share = ( pts, ids, w = null, hour = 10, n = 600 ) => {

	let k = 0, all = 0, wait = 0;
	for ( const [ x, z ] of pts ) {

		const h = spot( x, z, w );
		for ( let i = 0; i < n; i ++ ) {

			const id = pickSpecies( h, hour, rng );
			if ( id ) all ++;
			if ( ids.includes( id ) ) k ++;

		}

		for ( let i = 0; i < 100; i ++ ) wait += biteDelay( h, hour, rng ) / 100 / pts.length;

	}

	return { share: k / Math.max( all, 1 ), wait };

};

// ---- the new fish: in the catch table and drawn (an anatomy and a skin each)
check( [ 'pompano', 'permit', 'snook' ].every( ( id ) => FISH[ id ] && SPECIES[ FISH[ id ].model ] && SKIN[ FISH[ id ].model ] && FISH[ id ].habitat.wash > 0 ), 'the pompano, the permit and the snook: caught in the wash, each with its model' );
check( FISH.permit.protected && FISH.permit.cr && FISH.snook.bag === 1 && ! FISH.pompano.protected, 'the permit let go (everyone does), one snook a day, the pompano kept' );

// ---- the island's sides: the north beach windward, the bay leeward, the west and east coasts little of it
const side = ( x, z ) => P.windwardAt.call( game, x, z );
check( side( 0, - 845 ) > 0.95 && side( 0, - 20 ) === 0 && side( 55, 40 ) === 0 && side( 650, - 300 ) < 0.1 && side( - 560, - 200 ) < 0.3, `the north beach the windward side (${ side( 0, - 845 ).toFixed( 2 ) }), the bay none, the east and west little` );

// ---- the wash: a sandy beach's surf zone, found on the island's 1 m map
const north = [], bay = [];
for ( let z = - 1000; z <= 300; z += 3 ) for ( let x = - 800; x <= 800; x += 3 ) {

	const h = spot( x, z );
	if ( h.wash < 0.3 ) continue;
	if ( h.side > 0.9 ) north.push( [ x, z ] );
	if ( h.side === 0 && z > - 120 && z < 60 && Math.abs( x ) < 200 ) bay.push( [ x, z ] );

}

console.log( `     the wash found: ${ north.length } spots 3 m apart on the windward side, ${ bay.length } along the bay's beach` );
check( north.length > 30 && bay.length > 100, 'the wash on the north beach and along the bay\'s beach' );
// (40 of each, spread along them)
const some = ( list, n = 40 ) => list.filter( ( _, i ) => i % Math.max( 1, Math.floor( list.length / n ) ) === 0 ).slice( 0, n );
north.splice( 0, north.length, ...some( north ) );
bay.splice( 0, bay.length, ...some( bay ) );
const surfFish = [ 'pompano', 'permit', 'snook' ];
const fair = weatherAt( 0, 'fair' ), breezy = weatherAt( 0, 'breezy' ), blustery = { ...weatherAt( 0, 'blustery' ), surf: weatherAt( 0, 'fair' ).surf };
const nFair = share( north, surfFish, fair ), bFair = share( bay, surfFish, fair ), nSurf = share( north, surfFish, breezy ), nBlown = share( north, surfFish, blustery ), bBlown = share( bay, surfFish, blustery );
const pc = ( r ) => `${ Math.round( r.share * 100 ) }% surf fish, a bite every ${ r.wait.toFixed( 1 ) } s`;
console.log( `     the north beach's wash: fair ${ pc( nFair ) }; a surf day (breezy, north ${ ( breezy.north * 2 / 0.3048 ).toFixed( 0 ) } ft) ${ pc( nSurf ) }; blown out (blustery) ${ pc( nBlown ) }` );
console.log( `     the bay's beach: fair ${ pc( bFair ) }; with the north blown out ${ pc( bBlown ) }` );
check( nFair.share > 0.33 && nFair.share > 1.6 * bFair.share, 'the surf fish the north beach\'s: most of its bites by far, and well more than on the bay\'s beach' );
check( nSurf.share > nFair.share && nSurf.wait < nFair.wait, 'a surf day on the north beach brings them on: more of them, and sooner' );
check( nBlown.wait > 1.5 * nFair.wait && Math.abs( bBlown.wait - bFair.wait ) < 0.15 * bFair.wait, 'a blow down the trades blows the north beach out, the bay in its lee fishing as ever' );
check( breezy.north >= NORTH.day && breezy.north < NORTH.big && blustery.north >= NORTH.big && fair.north < NORTH.day && weatherAt( 0, 'calm' ).north < NORTH.flat, 'a breezy day a surf day on the north beach, a blustery one blown out, a calm one flat' );

// ---- a southerly's surf in the bay roughs the bay's shallows, not the north's
{

	const southerly = { ...weatherAt( 0, 'southerly' ), rain: 0, thunder: 0, front: 0 }, still = { ...southerly, wind: fair.wind, surf: fair.surf };
	const n0 = share( north, surfFish, still ), n1 = share( north, surfFish, southerly ), b0 = share( bay, surfFish, still ), b1 = share( bay, surfFish, southerly );
	console.log( `     a southerly's surf (${ ( southerly.surf * 2 / 0.3048 ).toFixed( 0 ) } ft in the bay): the bay's beach ${ pc( b0 ) } → ${ pc( b1 ) }; the north beach ${ pc( n0 ) } → ${ pc( n1 ) }` );
	check( southerly.north < NORTH.flat && b1.share > b0.share + 0.08 && Math.abs( n1.wait - n0.wait ) < 0.1 * n0.wait, 'a southerly\'s surf is the bay beach\'s surf day (its pompano up), the north shore flat and fishing as ever' );

}

check( biteHint( 'pompano' ) === 'in the surf' && biteHint( 'snook' ) === 'in the surf, at dawn and dusk', `Joe's hints: pompano "${ biteHint( 'pompano' ) }", snook "${ biteHint( 'snook' ) }"` );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
