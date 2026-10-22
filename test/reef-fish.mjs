// The reef and its fish on the CPU (no GPU): the layout's records, the models' winding (three draws
// front faces counter-clockwise: wound the other way, the reef shows its insides), and the fish
// swimming and fleeing a swimmer.
//   node test/reef-fish.mjs
import { readFileSync } from 'node:fs';
import { Vector3, Group } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { ReefLayout } from '../src/world/reef/ReefLayout.js';
import { FishSchools } from '../src/world/Fish.js';
import { fishModels } from '../src/world/fish/FishModels.js';
import { WORLD } from '../src/world/WorldLayout.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const reef = new ReefLayout( { terrain } ).toData();

// share of a kind's triangles wound counter-clockwise about their vertex normals
function agreement( b, k ) {

	const P = b.position, N = b.normal, I = b.index;
	let yes = 0;
	for ( let t = k.start; t < k.start + k.count; t += 3 ) {

		const a = I[ t ] * 3, c1 = I[ t + 1 ] * 3, c2 = I[ t + 2 ] * 3;
		const ux = P[ c1 ] - P[ a ], uy = P[ c1 + 1 ] - P[ a + 1 ], uz = P[ c1 + 2 ] - P[ a + 2 ];
		const vx = P[ c2 ] - P[ a ], vy = P[ c2 + 1 ] - P[ a + 1 ], vz = P[ c2 + 2 ] - P[ a + 2 ];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		if ( nx * ( N[ a ] + N[ c1 ] + N[ c2 ] ) + ny * ( N[ a + 1 ] + N[ c1 + 1 ] + N[ c2 + 1 ] ) + nz * ( N[ a + 2 ] + N[ c1 + 2 ] + N[ c2 + 2 ] ) > 0 ) yes ++;

	}

	return yes / ( k.count / 3 );

}

for ( const which of [ 'hard', 'soft' ] ) {

	const b = reef.batches[ which ];
	check( b.count > ( which === 'hard' ? 20000 : 2000 ), `reef ${ which }: ${ b.count } instances` );
	let finite = true, positive = true;
	for ( let i = 0; i < b.count; i ++ ) {

		for ( let k = 0; k < 16; k ++ ) if ( ! Number.isFinite( b.records[ i * 16 + k ] ) ) finite = false;
		if ( b.records[ i * 16 + 3 ] <= 0 || b.records[ i * 16 + 12 ] <= 0 || b.records[ i * 16 + 13 ] <= 0 || b.records[ i * 16 + 14 ] <= 0 ) positive = false;

	}

	check( finite, `reef ${ which }: every record is finite` );
	check( positive, `reef ${ which }: no instance is mirrored (positive scales)` );
	// (the plumes' pinnules are drawn from both sides with normals of their own: not checked)
	const worst = b.kinds.filter( ( k ) => k.type !== 'plume' ).map( ( k ) => [ k.type + k.lod, agreement( b, k ) ] ).sort( ( x, y ) => x[ 1 ] - y[ 1 ] )[ 0 ];
	check( worst[ 1 ] > 0.7, `reef ${ which }: models face outward (worst ${ worst[ 0 ] } ${ worst[ 1 ].toFixed( 2 ) })` );

}

// the fish, on a stand-in for the terrain's shading uniforms
const u = ( value ) => ( { value } );
const ground = { uniforms: { terrainSeaLevel: u( 0 ), terrainWaterAbsorption: u( new Vector3( 0.4, 0.07, 0.03 ) ), terrainCaustics: u( null ), terrainTime: u( 0 ), terrainNight: u( 0 ) } };
const floorAt = ( x, z ) => terrain.heightAt( x, z );
for ( const tier of [ 'low', 'high' ] ) {

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier, floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: reef.anchors } );
	fish.setModels( fishModels( fish.modelNames ) );
	check( fish.batch.kinds.length === fish.modelNames.length * 4 && fish.batch.kinds.every( ( k, i ) => k.model === fish.modelNames[ i >> 2 ] && k.lod === ( i & 3 ) ), `fish ${ tier }: ${ fish.modelNames.length } models, four levels each, in order` );
	const far = new Vector3( 0, 50, - 400 );
	for ( let i = 0; i < 150; i ++ ) fish.update( 1 / 30, far );
	const P = fish.pos;
	let finite = true, wet = 0;
	for ( let i = 0; i < fish.n; i ++ ) {

		const x = P[ i * 3 ], y = P[ i * 3 + 1 ], z = P[ i * 3 + 2 ];
		if ( ! Number.isFinite( x + y + z ) ) finite = false;
		else if ( y < 0.3 && y > floorAt( x, z ) - 0.3 ) wet ++;

	}

	check( fish.n > ( tier === 'low' ? 500 : 1500 ), `fish ${ tier }: ${ fish.n } swimmers` );
	check( finite, `fish ${ tier }: 5 s of swimming stays finite` );
	check( wet > fish.n * 0.97, `fish ${ tier }: ${ ( 100 * wet / fish.n ).toFixed( 1 ) }% between the floor and the surface` );

	// a swimmer in the middle of the grunts: they scatter
	const g = fish.groups.find( ( g ) => g.sp.name === 'grunt' );
	const at = new Vector3();
	for ( let a = 0; a < g.count; a ++ ) at.add( new Vector3( P[ ( g.offset + a ) * 3 ], P[ ( g.offset + a ) * 3 + 1 ], P[ ( g.offset + a ) * 3 + 2 ] ) );
	at.divideScalar( g.count );
	const spread = () => {

		let d = 0;
		for ( let a = 0; a < g.count; a ++ ) d += Math.hypot( P[ ( g.offset + a ) * 3 ] - at.x, P[ ( g.offset + a ) * 3 + 1 ] - at.y, P[ ( g.offset + a ) * 3 + 2 ] - at.z );
		return d / g.count;

	};

	const before = spread();
	for ( let i = 0; i < 45; i ++ ) fish.update( 1 / 30, at );
	const after = spread();
	check( after > before + 0.5, `fish ${ tier }: grunts flee a swimmer (mean distance ${ before.toFixed( 1 ) } -> ${ after.toFixed( 1 ) } m)` );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
