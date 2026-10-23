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
import { FISH } from '../src/game/FishTable.js';

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
	// (Salt Life) the spearfisher's fish live here too
	const kinds = new Set( fish.groups.map( ( g ) => g.sp.name ) );
	const want = [ 'hogfish', 'blackGrouper', 'lionfish', 'muttonSnapper', 'redSnapper', 'mahi', 'tuna' ];
	check( want.every( ( k ) => kinds.has( k ) ), `fish ${ tier }: hogfish, black groupers, lionfish, mutton and red snappers, mahi and tuna are placed` );
	check( fish.groups.every( ( g ) => ( g.sp.fish && FISH[ g.sp.fish ] ) || g.sp.label ), `fish ${ tier }: every swimmer is a species of the catch table or has a name` );

}

// ---- (Salt Life) the speargun's side of the fish
{

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'mid', floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: reef.anchors } );
	const P = fish.pos, at = ( i ) => new Vector3( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] );
	const g = fish.groups.find( ( g ) => g.sp.name === 'hogfish' );
	const i = g.offset, c = at( i );
	for ( let k = 0; k < 30; k ++ ) fish.update( 1 / 30, c.clone().add( new Vector3( 0, 40, 0 ) ) );
	const p = at( i ), L = fish.size[ i ];
	const h = new Vector3( fish.head[ i * 3 ], fish.head[ i * 3 + 1 ], fish.head[ i * 3 + 2 ] ).normalize();
	const side = new Vector3().crossVectors( h, new Vector3( 0, 1, 0 ) ).normalize();
	const mid = p.clone().addScaledVector( h, fish.hitShape( 'hogfish' ).cz * L );
	const hit = fish.pierce( mid.clone().addScaledVector( side, 2 ), mid.clone().addScaledVector( side, - 2 ) );
	check( hit && hit.i === i && Math.abs( hit.u - 0.5 ) < 0.1 && hit.t > 0.4 && hit.t < 0.5, `pierce: a shaft through a hogfish's flank hits it mid-body (u ${ hit && hit.u.toFixed( 2 ) })` );
	const over = mid.clone().add( new Vector3( 0, L, 0 ) );
	check( ! fish.pierce( over.clone().addScaledVector( side, 2 ), over.clone().addScaledVector( side, - 2 ) ), 'pierce: a shaft a body length over its back misses' );
	check( ! fish.pierce( mid.clone().addScaledVector( side, 2 ), mid.clone().addScaledVector( side, - 2 ), ( j ) => j !== i ), 'pierce: a fish the speargun won\'t take is passed by' );
	// on the shaft: out of its school, posed by the speargun; landed: gone, back later out of sight
	fish.hold( i, 1, - 3, 2, new Vector3( 1, 0, 0 ), 0.3, 1 );
	for ( let k = 0; k < 30; k ++ ) fish.update( 1 / 30, c );
	check( P[ i * 3 ] === 1 && P[ i * 3 + 1 ] === - 3 && P[ i * 3 + 2 ] === 2 && fish.held[ i ] === 1, 'a speared fish stays where the speargun holds it' );
	fish.take( i );
	check( fish.held[ i ] === 2 && fish.taken.has( i ), 'a landed fish is taken from the water' );
	fish.time = fish.refillAt[ i ] + 1;
	fish.update( 1 / 30, g.center.clone() );
	check( fish.held[ i ] === 2, 'its place isn\'t filled in sight of the diver' );
	fish.update( 1 / 30, g.center.clone().add( new Vector3( 0, 0, 200 ) ) );
	check( fish.held[ i ] === 0 && ! fish.taken.size && at( i ).distanceTo( g.home ) < 30, 'it is filled out of sight, among its kind' );

}

// ---- (Salt Life) stalking: a slow diver gets close, a sprinting one doesn't; jacks come to a still one
{

	const closest = ( name, speed, trial ) => {

		const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: reef.anchors } );
		const far = new Vector3( 0, 50, - 400 );
		for ( let k = 0; k < 60; k ++ ) fish.update( 1 / 30, far );
		const g = fish.groups.filter( ( g ) => g.sp.name === name )[ trial ];
		const i = g.offset, P = fish.pos;
		const f = new Vector3( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] );
		const diver = f.clone().add( new Vector3( Math.cos( trial * 2.1 ) * 7, 0, Math.sin( trial * 2.1 ) * 7 ) );
		diver.y = Math.min( diver.y, - 0.5 );
		let best = Infinity;
		for ( let k = 0; k < 30 * 20; k ++ ) {

			f.set( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] );
			const d = f.distanceTo( diver );
			best = Math.min( best, d );
			diver.addScaledVector( f.sub( diver ).normalize(), Math.min( speed / 30, Math.max( 0, d - 0.5 ) ) );
			fish.update( 1 / 30, diver );

		}

		return best;

	};
	const stalk = [ 0, 1 ].map( ( t ) => closest( 'hogfish', 0.7, t ) ), sprint = [ 0, 1 ].map( ( t ) => closest( 'hogfish', 2.5, t ) );
	check( Math.max( ...stalk ) < 3 && Math.min( ...sprint ) > Math.max( ...stalk ), `a diver stalking a hogfish gets within a spear's reach (${ stalk.map( ( d ) => d.toFixed( 1 ) ).join( ', ' ) } m); one sprinting at it doesn't get as close (${ sprint.map( ( d ) => d.toFixed( 1 ) ).join( ', ' ) } m)` );

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: reef.anchors } );
	for ( let k = 0; k < 60; k ++ ) fish.update( 1 / 30, new Vector3( 0, 50, - 400 ) );
	const g = fish.groups.find( ( g ) => g.sp.name === 'jack' );
	const diver = g.center.clone().add( new Vector3( 12, 0, 0 ) );
	diver.y = Math.min( g.center.y, - 1 );
	let near = Infinity;
	for ( let k = 0; k < 40 * 30; k ++ ) {

		fish.update( 1 / 30, diver );
		for ( let a = 0; a < g.count; a ++ ) near = Math.min( near, Math.hypot( fish.pos[ ( g.offset + a ) * 3 ] - diver.x, fish.pos[ ( g.offset + a ) * 3 + 1 ] - diver.y, fish.pos[ ( g.offset + a ) * 3 + 2 ] - diver.z ) );

	}

	check( near < 4, `jacks come to look at a diver keeping still (to ${ near.toFixed( 1 ) } m)` );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
