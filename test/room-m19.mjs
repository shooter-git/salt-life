// (M19) Room on low, step 2 (docs/M19.md): the island's rock, sand and path masks let go as soon as the plants are placed
// (App.handDebris), so the crabs place their burrows and homes from a window of the village beach's sand
// (MaskWindow.maskWindow, Crabs.CRAB_BEACH), and must place every one where they did from the whole mask; and the debris'
// input, with no worker to hold it, is kept to make them on the page as before (Debris.handOff).
//   node test/room-m19.mjs
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { maskWindow } from '../src/world/terrain/MaskWindow.js';
import { Crabs, CRAB_BEACH } from '../src/world/wildlife/Crabs.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

const bake = ( f ) => decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) ) );
// the palms the homes are placed by, as Vegetation's records have them about the village beach
const vegetation = { records: { palms: [] } };
for ( let i = 0; i < 60; i ++ ) vegetation.records.palms.push( { x: - 140 + i * 5.1, z: - 125 + ( i * 37 % 70 ), y: 2 + ( i % 5 ) } );
const same = ( a, b ) => a.length === b.length && a.every( ( p, i ) => p.x === b[ i ].x && p.z === b[ i ].z );

for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, bake( file ) ), tag = `(${ T.texel } m)`;
	const whole = new Crabs( { terrain: T, vegetation, seed: 5 } );
	const win = maskWindow( T, T.sand, CRAB_BEACH, CRAB_BEACH.half );
	const sand = T.sand;
	T.sand = null;
	T.crabSand = win;
	const cut = new Crabs( { terrain: T, vegetation, seed: 5 } );
	T.sand = sand;
	ok( whole.burrows.length > 20 && same( whole.burrows, cut.burrows ), `${ tag } the ${ whole.burrows.length } ghost crabs' burrows where they were, from the beach's window` );
	ok( same( whole.homes, cut.homes ), `${ tag } and the ${ whole.homes.length } hermits' homes` );
	ok( win.data.byteLength < 0.5 * 1048576, `${ tag } the window ${ ( win.data.byteLength / 1024 ).toFixed( 0 ) } KB, against the whole mask's ${ ( sand.byteLength / 1048576 ).toFixed( 1 ) } MB` );
	// every sample the burrows take is inside it (their bounds, with their jitter)
	const i0 = Math.floor( ( - 150 + 4 - 0.8 - T.origin ) / T.texel ), i1 = Math.floor( ( 170 - 4 + 0.8 - T.origin ) / T.texel );
	const j0 = Math.floor( ( - 110 - 0.8 - T.origin ) / T.texel ), j1 = Math.floor( ( - 40 + 0.8 - T.origin ) / T.texel );
	ok( i0 >= win.i0 && j0 >= win.j0 && i1 < win.i0 + win.w && j1 < win.j0 + win.h, `${ tag } it covers every texel the burrows read` );

}

// the debris with no worker to hold their input: kept, to make them on the page as before
{

	const { Debris } = await import( '../src/world/Debris.js' ).catch( () => ( {} ) );
	if ( Debris ) {

		const T = new TerrainData( 7, bake( 'island-1024.bin' ) );
		const village = { buildings: [], path: null, sidePaths: [], getFootprints: () => [] };
		const h = Debris.handOff( { terrain: T, village, tier: 'low' } );
		ok( ! h.worker && h.input && h.input.terrain.sand === T.sand, 'no worker here (plain Node): the input kept, the masks with it, for the page to make them' );

	} else console.log( '     (Debris.js needs a browser to import here: its worker is checked by the probe)' );

}

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
