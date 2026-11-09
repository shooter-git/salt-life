// (M17) The flats' fish drawn, on the CPU (no GPU; docs/m17/sight.md): world/Fish.js' sight pool given game/Flats.js'
// schools (a tailing school of bonefish on the west's flats), its fish about their anchor in the water, tails out where
// they root in the shallows, a fright sending the school off, one fish coming to a bait and eating it, and the flats'
// fish drawn within low's triangles in the fish's own cull, from the kayak's seat in the middle of a school; a permit
// tailing on a bar; a tarpon rolling up through the surface.
//   node test/sight-fish.mjs
import { readFileSync } from 'node:fs';
import { Vector3, Group, PerspectiveCamera } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FishSchools } from '../src/world/Fish.js';
import { fishModels } from '../src/world/fish/FishModels.js';
import { FLATS_POOL } from '../src/world/fish/FlatsPool.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { flatsSchools } from '../src/game/Flats.js';
import { G } from '../src/core/Globals.js';
import { tideAt } from '../src/game/IslandClock.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const u = ( value ) => ( { value } );
const ground = { uniforms: { terrainSeaLevel: u( 0 ), terrainWaterAbsorption: u( new Vector3( 0.4, 0.07, 0.03 ) ), terrainCaustics: u( null ), terrainTime: u( 0 ), terrainNight: u( 0 ) } };
const floorAt = ( x, z ) => terrain.heightAt( x, z );

// a tailing school by day, in a light air, with tailing water (a foot or so) within its reach (Fish's _tailGround)
const shallowest = ( s, sea ) => {

	let best = Infinity;
	for ( let r = 25 / 3; r <= 25 + 1e-6; r += 25 / 3 ) for ( let k = 0; k < 16; k ++ ) {

		const d = sea - terrain.heightAt( s.x + Math.cos( k / 16 * Math.PI * 2 ) * r, s.z + Math.sin( k / 16 * Math.PI * 2 ) * r );
		if ( d >= 0.17 ) best = Math.min( best, d );

	}

	return best;

};
let T = null, school = null, tails = 0, all = 0;
for ( let day = 3; day < 40; day ++ ) for ( let h = 9.5; h <= 15; h += 0.25 ) {

	const t = ( day - 1 ) * 24 + h;
	for ( const s of flatsSchools( t, { wind: 2.5, overcast: 0, hour: h } ) ) {

		if ( s.kind !== 'bonefish' || s.mode !== 'tail' || s.life < 0.99 ) continue;
		all ++;
		if ( shallowest( s, tideAt( t ) ) > 0.32 ) continue;
		tails ++;
		if ( ! school && s.n >= 6 ) {

			T = t;
			school = s;

		}

	}

}

check( !! school, `a tailing school of ${ school && school.n } bonefish at ( ${ school && school.x.toFixed( 0 ) }, ${ school && school.z.toFixed( 0 ) } ), island hour ${ T } (${ tails } of ${ all } tailing schools by day have tailing water within reach)` );
G.seaLevel.value = tideAt( T );

for ( const tier of [ 'low', 'high' ] ) {

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier, floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: [] } );
	fish.setModels( fishModels( fish.modelNames ) );
	const P = FLATS_POOL[ tier ];
	const pooled = Object.values( P.kinds ).reduce( ( a, k ) => a + k.groups, 0 );
	check( fish.sightGroups.length === pooled && fish.sightGroups.every( ( g ) => ! g.sight ), `${ tier }: ${ pooled } groups pooled for the flats, parked` );
	check( [ 'permit', 'snook', 'lemonShark' ].every( ( m ) => fish.modelNames.includes( m ) ), `${ tier }: the permit's, the snook's and the lemon shark's models are in` );
	const list = flatsSchools( T, { wind: 2.5, overcast: 0, hour: T % 24 } ).filter( ( q ) => Math.hypot( q.x - school.x, q.z - school.z ) < 90 );
	fish.setSight( list );
	const g = fish.sightGroups.find( ( h ) => h.sight && h.sight.id === school.id );
	// the kayak's seat, 8 m off where they root, still
	const eye = new Vector3( g.sight.tx - 8, G.seaLevel.value + 0.81, g.sight.tz );
	check( g && g.sp.name === 'flatsBone' && g.sight.shown === Math.min( g.count, school.n ), `${ tier }: the school's given a group of bonefish, ${ g && g.sight.shown } of its ${ school.n } drawn` );
	let out = 0, wet = 0, near = 0, n = 0;
	for ( let f = 0; f < 600; f ++ ) {

		G.time.value += 1 / 30;
		fish.update( 1 / 30, eye );
		if ( f > 150 && f % 10 === 0 ) fish.sightFish( g, ( i ) => {

			const x = fish.pos[ i * 3 ], y = fish.pos[ i * 3 + 1 ], z = fish.pos[ i * 3 + 2 ];
			n ++;
			if ( y < G.seaLevel.value + 0.05 && y > terrain.heightAt( x, z ) - 0.05 ) wet ++;
			if ( Math.hypot( x - g.sight.tx, z - g.sight.tz ) < 12 ) near ++;
			if ( fish.sightOut( i ) > 0.02 ) out ++;

		} );

	}

	check( wet === n && near > n * 0.9, `${ tier }: 15 s on, ${ ( 100 * near / n ).toFixed( 0 ) }% of them about where they root, every one in the water` );
	check( out > n * 0.08, `${ tier }: tails out of the water ${ ( 100 * out / n ).toFixed( 0 ) }% of the time, rooting in ${ ( G.seaLevel.value - terrain.heightAt( g.sight.tx, g.sight.tz ) ).toFixed( 2 ) } m of water ${ Math.hypot( g.sight.tx - school.x, g.sight.tz - school.z ).toFixed( 0 ) } m from their anchor` );

	// drawn from the kayak's seat, within the budget
	const cam = new PerspectiveCamera( 60, 9 / 19.5, 0.1, 2000 );
	cam.position.copy( eye );
	cam.lookAt( g.sight.tx, G.seaLevel.value - 0.3, g.sight.tz );
	fish.viewHeight = 1600;
	fish.cull( cam );
	const sightModels = new Set( fish.sightGroups.map( ( h ) => h.sp.model ) );
	let tris = 0, drawn = 0;
	for ( const k of fish.batch.kinds ) if ( sightModels.has( k.model ) ) {

		tris += k.n * k.triangles;
		drawn += k.n;

	}

	// (the bay's own bonefish and the reef's barracuda are far off: what's drawn of these models is the flats')
	check( drawn > 0 && fish._budget.spent <= P.budget && tris <= P.budget, `${ tier }: ${ drawn } of them drawn, ${ tris } triangles (the budget ${ P.budget })` );
	check( fish.marks && fish.marks.under.n >= drawn * 0.5, `${ tier }: their shadows on the sand (${ fish.marks && fish.marks.under.n } marks under the water, ${ fish.marks && fish.marks.surface.n } on it)` );

	// a bait put ahead of one: it comes to it and eats it
	let k0 = - 1, i0 = - 1;
	fish.sightFish( g, ( i, k ) => {

		if ( k0 < 0 ) {

			k0 = k;
			i0 = i;

		}

	} );
	const hl = Math.hypot( fish.head[ i0 * 3 ], fish.head[ i0 * 3 + 2 ] ) || 1;
	const bait = { x: fish.pos[ i0 * 3 ] + fish.head[ i0 * 3 ] / hl * 1.8, z: fish.pos[ i0 * 3 + 2 ] + fish.head[ i0 * 3 + 2 ] / hl * 1.8 };
	fish.sightFollow( g, k0, bait.x, bait.z, 0.9, true );
	for ( let f = 0; f < 150; f ++ ) fish.update( 1 / 30, eye );
	const at = Math.hypot( fish.pos[ i0 * 3 ] - bait.x, fish.pos[ i0 * 3 + 2 ] - bait.z );
	check( at < fish.size[ i0 ] * 1.2, `${ tier }: one comes to a bait put ahead of it (${ at.toFixed( 2 ) } m off it after 5 s)` );
	fish.sightFollowEnd( g, 'eat' );
	check( fish.held[ i0 ] === 2 && g.sight.eaten.has( k0 ), `${ tier }: and eats it: it's on the hook, not with its school` );

	// a fright: the school bolts, away from it
	const c0 = g.center.clone();
	fish.sightBolt( g, eye.x, eye.z );
	for ( let f = 0; f < 45; f ++ ) fish.update( 1 / 30, eye );
	const away = Math.hypot( g.center.x - eye.x, g.center.z - eye.z ) - Math.hypot( c0.x - eye.x, c0.z - eye.z ), ran = Math.hypot( g.center.x - c0.x, g.center.z - c0.z );
	let fastest = 0;
	fish.sightFish( g, ( i ) => {

		fastest = Math.max( fastest, Math.hypot( fish.vel[ i * 3 ], fish.vel[ i * 3 + 2 ] ) );

	} );
	check( ran > 2.5 && away > 0 && fastest > 2.5, `${ tier }: frightened, the school bolts ${ ran.toFixed( 1 ) } m in 1.5 s, away from what frightened it, its fastest at ${ fastest.toFixed( 1 ) } m/s` );
	fish.setSight( [] );
	for ( let f = 0; f < 120; f ++ ) fish.update( 1 / 30, eye );
	check( ! g.sight, `${ tier }: and once its run's over and its school's gone, its group's parked again` );

}

// ---- a permit cruising in shallow water stops now and then to tail on a crab, its black sickle up. (Flats.js keeps its
// permit on the flat's edge, 0.74 m deep and more by day: one is moved onto a shallower bar here, as it'd come up onto)
{

	let Tp = null, permit = null;
	for ( let day = 3; day < 60 && ! permit; day ++ ) for ( let h = 9.5; h <= 15 && ! permit; h += 0.25 ) {

		const t = ( day - 1 ) * 24 + h;
		const s = flatsSchools( t, { wind: 2.5, overcast: 0, hour: h } ).find( ( q ) => q.kind === 'permit' && q.life > 0.99 && tideAt( t ) - terrain.heightAt( q.x, q.z ) < 1.2 );
		if ( s ) {

			Tp = t;
			permit = s;

		}

	}

	G.seaLevel.value = tideAt( Tp );
	// (the nearest sand 0.35 to 0.45 m under)
	let bar = null;
	for ( let r = 4; r < 120 && ! bar; r += 4 ) for ( let k = 0; k < 24 && ! bar; k ++ ) {

		const x = permit.x + Math.cos( k / 24 * Math.PI * 2 ) * r, z = permit.z + Math.sin( k / 24 * Math.PI * 2 ) * r, d = G.seaLevel.value - terrain.heightAt( x, z );
		if ( d > 0.35 && d < 0.45 ) bar = { x, z, d };

	}

	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: [] } );
	fish.setSight( [ { ...permit, x: bar.x, z: bar.z } ] );
	const g = fish.sightGroups.find( ( h ) => h.sight && h.sight.id === permit.id ), eye = new Vector3( bar.x - 10, G.seaLevel.value + 2.5, bar.z );
	g.sight.dx = g.sight.dz = 0; // (holding over the bar, not cruising on off it)
	let out = 0, rooted = 0, n = 0;
	for ( let f = 0; f < 1800; f ++ ) {

		G.time.value += 1 / 30;
		fish.update( 1 / 30, eye );
		if ( f % 10 === 0 ) fish.sightFish( g, ( i ) => {

			n ++;
			if ( fish.aux[ i * 8 ] > 0 ) rooted ++;
			if ( fish.sightOut( i ) > 0.03 && fish.aux[ i * 8 ] > 0 ) out ++;

		} );

	}

	check( rooted > 0 && out > 0, `a permit over ${ bar.d.toFixed( 2 ) } m of sand tails on crabs ${ ( 100 * rooted / n ).toFixed( 0 ) }% of a minute, its tail out ${ ( 100 * out / n ).toFixed( 0 ) }%` );

}

// ---- a rolling tarpon comes up through the surface and over, its back and dorsal out, a ring where it broke it
{

	let Tr = null, s = null;
	for ( let day = 3; day < 60 && ! s; day ++ ) for ( let h = 16.25; h <= 17.5 && ! s; h += 0.25 ) {

		const t = ( day - 1 ) * 24 + h;
		s = flatsSchools( t, { wind: 2.5, overcast: 0, hour: h } ).find( ( q ) => q.kind === 'tarpon' && q.mode === 'roll' );
		if ( s ) Tr = t;

	}

	G.seaLevel.value = tideAt( Tr );
	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt, center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: [] } );
	fish.setModels( fishModels( fish.modelNames ) );
	fish.setSight( [ s ] );
	const g = fish.sightGroups.find( ( h ) => h.sight && h.sight.id === s.id ), i = g.offset;
	const eye = new Vector3( s.x - 8, G.seaLevel.value + 1.65, s.z );
	for ( let f = 0; f < 200; f ++ ) {

		G.time.value += 1 / 30;
		fish.update( 1 / 30, eye );

	}

	const under = G.seaLevel.value - fish.pos[ i * 3 + 1 ];
	const cam = new PerspectiveCamera( 60, 16 / 9, 0.1, 2000 );
	cam.position.copy( eye );
	cam.lookAt( fish.pos[ i * 3 ], G.seaLevel.value, fish.pos[ i * 3 + 2 ] );
	cam.updateMatrixWorld();
	fish.viewHeight = 1600;
	fish.cull( cam ); // (its marks made: it's in sight)
	fish.aux[ i * 8 + 2 ] = 0; // (its next roll now)
	let top = - 1e9, out = 0;
	for ( let f = 0; f < 120; f ++ ) {

		G.time.value += 1 / 30;
		fish.update( 1 / 30, eye );
		top = Math.max( top, fish.pos[ i * 3 + 1 ] - G.seaLevel.value );
		out = Math.max( out, fish.sightOut( i ) );

	}

	check( under > 0.4 && top > - 0.1 && out > 0.2, `a tarpon rolling: ${ under.toFixed( 2 ) } m under between rolls, up to ${ ( - top ).toFixed( 2 ) } m of the top, ${ ( 100 * out ).toFixed( 0 ) }% of it out at the most` );
	check( fish.marks && fish.marks.rings.length > 0, `and a ring where it broke the surface (${ fish.marks && fish.marks.rings.length })` );

}

if ( failed ) {

	console.log( `\n${ failed } failed` );
	process.exit( 1 );

}
