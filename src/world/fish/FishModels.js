import { SPECIES } from './FishSpecies.js';
import { fishGeometry } from './FishGeometry.js';
import { rayGeometry, turtleGeometry, lobsterGeometry } from './CreatureGeometry.js';
import { mergeKinds } from '../reef/KindBatch.js';

// (Salt Life) The swimmers' models, four levels of detail each (0 nearest .. 3), merged for the
// fish's KindBatch: mergeKinds' { position, normal, aData, index, kinds: [ { start, count, model,
// lod } ] }, the kinds of `names[ i ]` at 4 i .. 4 i + 3. Built in a worker (FishWorker) where
// there is one: making them leaves tens of megabytes of garbage.
export function fishModels( names ) {

	const kinds = [];
	for ( const name of names ) {

		let geos;
		if ( name === 'stingray' || name === 'eagleRay' ) {

			const eagle = name === 'eagleRay';
			const g1 = rayGeometry( { lod: 1, eagle } );
			geos = [ rayGeometry( { lod: 0, eagle } ), g1, g1, g1 ];

		} else if ( name === 'turtle' ) {

			const g1 = turtleGeometry( { lod: 1 } );
			geos = [ turtleGeometry( { lod: 0 } ), g1, g1, g1 ];

		} else if ( name === 'lobster' ) {

			const g2 = lobsterGeometry( { lod: 2 } );
			geos = [ lobsterGeometry( { lod: 0 } ), lobsterGeometry( { lod: 1 } ), g2, g2 ];

		} else {

			const S = SPECIES[ name ];
			geos = [ 0, 1, 2, 3 ].map( ( lod ) => fishGeometry( S, { lod, pose: 'swim' } ) );

		}

		for ( let l = 0; l < 4; l ++ ) kinds.push( { geometry: geos[ l ], model: name, lod: l } );

	}

	return mergeKinds( kinds );

}

export function fishModelTransferables( m ) {

	return [ m.position.buffer, m.normal.buffer, m.aData.buffer, m.index.buffer ];

}
