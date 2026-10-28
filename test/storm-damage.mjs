// (M13) Plain-node tests of a hurricane's damage and its mending (game/StormDamage.js), from the real
// hurricanes on the clock: nothing goes before its winds, each piece by its own wind or water, the
// weak side of a storm doing little; the tarps, the new tin, the boards, the palms, the wrack and the
// sand on their days; the same for everyone. And the pieces themselves on the real island: the pier's
// boards and bay with their deck colliders (Pier.js), the roofs' sheets that can go (Buildings.js), the
// sanderlings working a storm's wrack line (Shorebirds.js).
import { readFileSync } from 'node:fs';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { Colliders } from '../src/world/Colliders.js';
import { Rand, InstancedProps } from '../src/world/Props.js';
import { mulberry32 } from '../src/util/Noise.js';
import { StormWrack } from '../src/world/debris/StormWrack.js';
import { buildPier, PIER, PIER_STORM } from '../src/world/Pier.js';
import { buildHouse, buildShed, buildBoathouse } from '../src/world/village/Buildings.js';
import { Shorebirds } from '../src/world/wildlife/Shorebirds.js';
import { hurricaneAt, hurricaneNews, lastHurricane, HURRICANE } from '../src/game/Weather.js';
import { damageAt, pieceState, DAMAGE, WHOLE, GONE, TARP, NEW } from '../src/game/StormDamage.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const TIN = 16, PLANKS = PIER_STORM.planks.length;
const count = ( D, kind, n, states ) => {

	let k = 0;
	for ( let i = 0; i < n; i ++ ) if ( states.includes( pieceState( D, kind, i ).state ) ) k ++;
	return k;

};

// ---- the rule, over the real hurricanes
{

	const list = [];
	for ( let T = 0; T < 24 * 1200; T += 1 ) {

		const h = hurricaneAt( T );
		if ( h && ( ! list.length || list[ list.length - 1 ].tc !== h.tc ) ) list.push( h );

	}

	check( damageAt( ( HURRICANE.fromDay - 1 ) * 24 - 1 ).storm === null && damageAt( 100 ).wind === 0, 'before the first hurricane: no damage' );
	let before = true, order = true, tarps = true, mended = true, regrown = true, swept = true, feed = true, monotone = true, same = true, weak = 0, weakClean = true;
	let tinGone = 0, plankGone = 0, bayGone = 0, stripMax = 0, wrackMax = 0;
	for ( const h of list ) {

		// (its own damage: the next may come within a week, when this one's its prev)
		const n = hurricaneNews( h.tc ), at = ( t ) => {

			const D = damageAt( t );
			return D.storm && D.storm.tc === h.tc ? D : D.prev && D.prev.storm.tc === h.tc ? D.prev : { ...D, storm: null, prev: null, wind: 0, water: - 1, strip: 0, wrack: 0, sand: 0, paths: 0, feed: 0 };

		};
		const mine = ( t ) => at( t ).storm !== null;
		// nothing before its winds reach the island; its strongest wind and water only grow
		const d0 = damageAt( n.onset - 13 );
		if ( d0.storm && d0.storm.tc === h.tc && ( d0.wind > 0 || count( d0, 'tin', TIN, [ GONE, TARP, NEW ] ) ) ) before = false;
		let w = 0, wa = - 1;
		for ( let t = n.onset - 12; t < n.ends + 12; t += 0.5 ) {

			const D = at( t );
			if ( ! D.storm ) continue;
			if ( D.wind < w - 1e-6 || D.water < wa - 1e-6 ) monotone = false;
			w = D.wind;
			wa = D.water;
			// (a piece that's gone stays gone through the storm)
			for ( let i = 0; i < TIN; i ++ ) if ( pieceState( D, 'tin', i ).state === GONE && t < n.ends && pieceState( at( t + 0.5 ), 'tin', i ).state !== GONE ) order = false;

		}

		const D = at( n.ends + 1 );
		tinGone += count( D, 'tin', TIN, [ GONE ] );
		plankGone += count( D, 'plank', PLANKS, [ GONE ] );
		bayGone += count( D, 'bay', 1, [ GONE ] );
		stripMax = Math.max( stripMax, D.strip );
		wrackMax = Math.max( wrackMax, D.wrack );
		// the storm's weak side: the bay drawn down, little surf in it: no wrack, the pier untouched ((M14) a
		// Category 1's: a stronger one's confused sea about its eye throws its wrack up even so)
		if ( h.peak < 0.15 && h.cat === 1 ) {

			weak ++;
			if ( D.wrack > 0.02 || D.sand > 0.02 || count( D, 'plank', PLANKS, [ GONE ] ) || count( D, 'bay', 1, [ GONE ] ) ) weakClean = false;

		}

		// the tarps go up within two days, everything's mended within a week, the palms in three
		const t2 = at( n.ends + 41 ), t7 = at( n.ends + 169 ), t21 = at( n.ends + 21 * 24 + 1 );
		if ( count( t2, 'tin', TIN, [ GONE ] ) ) tarps = false;
		if ( mine( n.ends + 169 ) && ( count( t7, 'tin', TIN, [ GONE, TARP ] ) || count( t7, 'plank', PLANKS, [ GONE ] ) || count( t7, 'bay', 1, [ GONE ] ) ) ) mended = false;
		if ( ( mine( n.ends + 21 * 24 + 1 ) && t21.strip > 1e-6 ) || ! ( at( n.ends + 24 ).strip <= D.strip ) ) regrown = false;
		// the paths swept in a day or two, the beach's wrack gone in ten (unless the next's come); the birds
		// feed on it while it's fresh
		if ( at( n.ends + 41 ).sand > 1e-6 || at( n.ends + 31 ).paths > 1e-6 || ( damageAt( n.ends + 241 ).storm.tc === h.tc && at( n.ends + 241 ).wrack > 1e-6 ) ) swept = false;
		if ( at( n.ends + 61 ).feed > 1e-6 || ( D.wrack > 0.3 && at( n.ends + 12 ).feed < 0.2 ) ) feed = false;
		// the same for everyone: worked out again, the same
		const again = damageAt( n.ends + 5 );
		if ( JSON.stringify( { ...again, storm: again.storm && again.storm.key } ) !== JSON.stringify( { ...at( n.ends + 5 ), storm: at( n.ends + 5 ).storm && at( n.ends + 5 ).storm.key } ) ) same = false;

	}

	check( list.length > 25, `${ list.length } hurricanes in 1,200 days to look at` );
	check( before, 'nothing goes before its winds reach the island' );
	check( monotone && order, 'its strongest wind and highest water only grow as it passes, and what\'s gone stays gone' );
	check( tinGone > list.length * 2 && tinGone < list.length * TIN * 0.75, `sheets off the roofs' weak spots: ${ ( tinGone / list.length ).toFixed( 1 ) } of ${ TIN } a hurricane` );
	check( plankGone > 0 && bayGone > 0 && bayGone < list.length / 2, `the pier's boards lifted (${ plankGone } runs) and now and then a bay taken (${ bayGone } in ${ list.length })` );
	check( stripMax > 0.3 && stripMax <= DAMAGE.palm.most + DAMAGE.palm.more[ 2 ], `the palms stripped, up to ${ ( stripMax * 100 ).toFixed( 0 ) }% of a crown ((M14) more by a Category 2 or 3)` );
	// ((M14) a Category 3's sea up into the village's front row (its ground 3.3 to 3.8 m), a Category 1's never)
	const reach = { 1: 0, 2: 0, 3: 0 }, into = { 1: 0, 3: 0 };
	for ( const h of list ) {

		const D = damageAt( h.tc + 30 ), w = D.storm && D.storm.tc === h.tc ? D.water : 0;
		reach[ h.cat ] = Math.max( reach[ h.cat ], w );
		if ( h.cat !== 2 && w > 3.5 ) into[ h.cat ] ++;

	}

	console.log( `     (M14) the highest water: a Category 1's ${ reach[ 1 ].toFixed( 2 ) } m, a 2's ${ reach[ 2 ].toFixed( 2 ) }, a 3's ${ reach[ 3 ].toFixed( 2 ) } (the village's front row stands at 3.3 to 3.8)` );
	check( reach[ 1 ] < 3.3 && into[ 1 ] === 0 && reach[ 3 ] > 3.8 && into[ 3 ] > 0 && reach[ 3 ] > reach[ 2 ] && reach[ 2 ] > reach[ 1 ], '(M14) a Category 3\'s sea into the village, a 1\'s never' );
	check( wrackMax > 0.8 && weak > 0 && weakClean, `a line of wrack and sand where the sea came up the beach; none on a storm's weak side (${ weak } of those)` );
	check( tarps, 'blue tarps over every hole within two days' );
	check( mended, 'everything mended within a week: new tin, the boards and the bay back' );
	check( regrown, 'the palms grow back over three weeks' );
	check( swept, 'the paths swept within two days, the beach\'s wrack gone within ten' );
	check( feed, 'the birds feed on the wrack while it\'s fresh' );
	check( same, 'the same for everyone (worked out again, identical)' );

	// as the weather goes: your own picked hurricane, none in other held weather
	const since = 24 * 200 + 3, own = damageAt( since + 30, 'hurricane', since );
	check( own.storm && own.storm.key === `picked:${ since }` && own.wind > 30 && damageAt( since + 30, 'fair', since ).storm === null && lastHurricane( since + 30, 100, 'gale', since ) === null, 'a hurricane you pick does its own damage; none in other weather you hold' );

	// a piece's life: gone, a tarp, new and weathering in
	const h = list.find( ( q ) => { const D = damageAt( hurricaneNews( q.tc ).ends + 1 ); return count( D, 'tin', TIN, [ GONE ] ) > 0; } );
	const n = hurricaneNews( h.tc ), D1 = damageAt( n.ends + 1 ), id = [ ...Array( TIN ).keys() ].find( ( i ) => pieceState( D1, 'tin', i ).state === GONE );
	const life = [ 1, 45, 200 ].map( ( a ) => pieceState( damageAt( n.ends + a ), 'tin', id ) );
	check( life[ 0 ].state === GONE && life[ 1 ].state === TARP && life[ 2 ].state === NEW && life[ 2 ].age > 0 && life[ 2 ].age < 200, `a sheet's life: gone, a tarp over it, a new one (${ life[ 2 ].age.toFixed( 0 ) } h old)` );

}

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );

// ---- the pier's boards and bay
{

	const B = new Builder(), colliders = new Colliders(), rand = new Rand( mulberry32( 90210 ) );
	const info = buildPier( { B, terrain, colliders, rand, lights: [], inst: new InstancedProps( B ), signB: new Builder(), hang: () => new Builder(), stormB: () => new Builder() } );
	const pieces = info.storm;
	check( pieces.length === PLANKS + 1 && pieces.every( ( p ) => p.B.batches.wood && p.B.batches.wood.vcount > 0 && p.boxes.length === 1 ), `the pieces a hurricane can take: ${ pieces.map( ( p ) => p.kind + p.id ).join( ', ' ) }, each its own geometry and deck collider` );
	// the walkway's deck: its boxes end to end from the pier's foot to its head
	const walk = colliders.boxes.filter( ( b ) => b.tag === 'pierDeck' && b.center.z < PIER.headZ0 ).sort( ( a, b ) => a.center.z - b.center.z );
	let tiles = Math.abs( walk[ 0 ].center.z - walk[ 0 ].half.z - PIER.zStart ) < 1e-6 && Math.abs( walk[ walk.length - 1 ].center.z + walk[ walk.length - 1 ].half.z - PIER.headZ0 ) < 1e-6;
	for ( let i = 1; i < walk.length; i ++ ) if ( Math.abs( walk[ i - 1 ].center.z + walk[ i - 1 ].half.z - ( walk[ i ].center.z - walk[ i ].half.z ) ) > 1e-6 ) tiles = false;
	check( tiles, `the walkway's deck colliders end to end, foot to head (${ walk.length } of them)` );
	// each piece's boards inside its own box, and the deck there giving way once it's gone
	let inside = true, gives = true;
	for ( const p of pieces ) {

		const pos = p.B.batches.wood.pos, n = p.B.batches.wood.vcount, b = p.boxes[ 0 ];
		let z0 = Infinity, z1 = - Infinity;
		for ( let i = 0; i < n; i ++ ) {

			z0 = Math.min( z0, pos[ i * 3 + 2 ] );
			z1 = Math.max( z1, pos[ i * 3 + 2 ] );

		}

		if ( z0 < b.center.z - b.half.z - 0.15 || z1 > b.center.z + b.half.z + 0.15 || z1 - z0 < b.half.z * 2 - 0.3 ) inside = false;
		b.walkable = b.solid = false;
		if ( colliders.groundHeightAt( PIER.x, b.center.z, 10 ) > - Infinity ) gives = false;
		b.walkable = b.solid = true;
		if ( colliders.groundHeightAt( PIER.x, b.center.z, 10 ) < PIER.deck - 0.1 ) gives = false;

	}

	check( inside, 'each piece\'s boards lie over its own stretch of deck' );
	check( gives && pieces.find( ( p ) => p.kind === 'bay' ).boxes[ 0 ].half.z * 2 > 2.5, 'its deck gives way while it\'s gone (a bay\'s 3 m: you fall in), and holds again once it\'s back' );

}

// ---- the roofs' sheets
{

	const base = { trim: [ 1, 1, 1 ], accent: [ 0, 0, 0.3 ], wall: [ 0.2, 0.6, 0.6 ], siding: 1, paint: 0.6, foundation: 'posts', curtain: [ 1, 1, 1 ], roofMat: 'metal', roofColor: [ 0.5, 0.1, 0.05 ] };
	const specs = [
		{ ...base, name: 'A', x: 13.5, z: - 106.5, yaw: 0.12, w: 6.2, d: 5.0, roof: 'gable', porch: { depth: 2.1, rail: 'balusters' } },
		{ ...base, name: 'C', x: 62.5, z: - 106.0, yaw: - 0.1, w: 7.0, d: 5.8, stories: 2, roof: 'gableFront', porch: { depth: 2.2, rail: 'x' } },
		{ ...base, name: 'J', x: 96.5, z: - 135.0, yaw: - 0.32, w: 6.2, d: 5.0, roof: 'hip', porch: { depth: 1.9, rail: 'balusters' } },
		{ ...base, name: 'K', x: 3.5, z: - 151.0, yaw: 0.18, w: 6.0, d: 5.2, roof: 'gable', porch: { depth: 2.0, rail: 'x' } },
	];
	const holes = [], B = new Builder(), colliders = new Colliders(), rand = new Rand( mulberry32( 7 ) );
	const ctx = { B, terrain, colliders, rand, lights: [], inst: new InstancedProps( B ), checks: [], holes };
	for ( const s of specs ) buildHouse( ctx, s );
	buildShed( ctx, { name: 'shed1', x: 21.5, z: - 119.5, yaw: 0.1, wall: [ 0.7, 0.8, 0.7 ], door: [ 0.6, 0.1, 0.1 ] } );
	buildBoathouse( ctx, { x: 92.5, z: - 57.5, yaw: - 0.08, wall: [ 0.5, 0.7, 0.65 ], paint: 0.58 } );
	const roof = B.batches.roofMetal, wood = B.batches.wood;
	let onSlab = true, high = true, beneath = true;
	for ( const h of holes ) {

		// on its slab: that slab's vertices (its seed) reach past the hole along the eave and up the slope
		let vMax = - Infinity, uMax = - Infinity, found = 0;
		for ( let i = 0; i < roof.vcount; i ++ ) {

			if ( Math.abs( roof.data[ i * 4 ] - h.seed ) > 1e-6 ) continue;
			found ++;
			uMax = Math.max( uMax, roof.uv[ i * 2 ] );
			vMax = Math.max( vMax, roof.uv[ i * 2 + 1 ] );

		}

		if ( ! found || h.v0 < - 1e-6 || h.v1 > vMax + 1e-3 || h.v1 - h.v0 < 0.83 || h.uTop < 0.5 || h.uTop > uMax * 1.03 ) onSlab = false;
		// up on the roof, its slope facing up
		if ( h.at.y < terrain.heightAt( h.at.x, h.at.z ) + 2.5 || h.n.y < 0.8 ) high = false;
		// the purlins under it
		let purlin = 0;
		for ( let i = 0; i < wood.vcount; i ++ ) {

			const dx = wood.pos[ i * 3 ] - h.at.x, dy = wood.pos[ i * 3 + 1 ] - h.at.y, dz = wood.pos[ i * 3 + 2 ] - h.at.z;
			const below = - ( dx * h.n.x + dy * h.n.y + dz * h.n.z );
			if ( below > 0.05 && below < 0.35 && Math.hypot( dx, dy, dz ) < 2.5 ) purlin ++;

		}

		if ( purlin < 8 ) beneath = false;

	}

	check( holes.length === specs.length + 2, `a weak spot on every metal roof built (${ holes.map( ( h ) => h.name ).join( ', ' ) }): gable, gable-fronted, hip, a shed's, the boathouse's` );
	check( onSlab, 'each a run of whole sheets (0.84 m) on its own slab, from the eave up, inside the slab' );
	check( high && beneath, 'up on the roof, with the purlins it was screwed to beneath it' );

}

// ---- the sanderlings at a storm's wrack line
{

	G.windSpeed.value = 6;
	G.night.value = 0;
	const sb = new Shorebirds( { terrain } ), batch = { write() {} }, camera = { position: new Vector3( 60, 2.5, - 52 ) };
	sb.wrack = 2.65;
	for ( let i = 0; i < 30 * 60; i ++ ) sb.update( 1 / 30, null, batch, camera );
	const hs = sb.birds.filter( ( b ) => b.state !== 'fly' ).map( ( b ) => terrain.heightAt( b.x, b.z ) );
	const off = Math.max( ...hs.map( ( h ) => Math.abs( h - 2.65 ) ) );
	check( hs.length === sb.birds.length && off < 0.45, `after a hurricane the sanderlings work its line of wrack, up the beach (all within ${ off.toFixed( 2 ) } m of its height), not the swash` );
	sb.wrack = null;
	for ( let i = 0; i < 30 * 60; i ++ ) sb.update( 1 / 30, null, batch, camera );
	check( sb.birds.every( ( b ) => terrain.heightAt( b.x, b.z ) < 1.6 ), 'and once it\'s stale, back to the swash' );

}

// ---- (M14) the wrack laid for any storm: a clump jittered past the beach's west end once fell in no segment
// and the build threw (a page error now and then in a hurricane, its wrack never laid)
{

	let threw = 0, built = 0, meshes = 0;
	const parent = { add: () => meshes ++ };
	for ( let k = 0; k < 120; k ++ ) {

		const w = new StormWrack( { terrain, nature: {}, wood: {}, parent, lite: k % 2 === 0 } );
		try {

			w.build( `storm-${ k }:${ ( 1.8 + ( k % 7 ) * 0.2 ).toFixed( 2 ) }`, 1.8 + ( k % 7 ) * 0.2 );
			built ++;

		} catch ( e ) { threw ++; }

	}

	check( threw === 0 && built === 120 && meshes > 0, `the wrack laid for 120 storms, none failing (${ threw } threw)` );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
