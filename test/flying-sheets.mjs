// (M14) Plain-node tests of the sheets a hurricane tears off the roofs, flying (world/debris/
// FlyingSheets.js): the same flight for everyone; as far as torn roof sheets go in the measurements
// (most tens of metres, a few a couple of hundred), down the wind, a few metres up, turning as they go;
// lying flat where they come down, sinking in the sea, stopped by a wall; off the island's real roofs in
// the trades, onto the beach and into the sea; and shown from the moment each goes until it's cleared
// away with the wrack.
import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3, Mesh, BoxGeometry } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { Colliders } from '../src/world/Colliders.js';
import { Rand, InstancedProps } from '../src/world/Props.js';
import { mulberry32 } from '../src/util/Noise.js';
import { buildHouse } from '../src/world/village/Buildings.js';
import { hurricaneAt, hurricaneNews, towardOf, weatherAt } from '../src/game/Weather.js';
import { damageAt, pieceState, GONE } from '../src/game/StormDamage.js';
import { flightOf, poseAt, flightSeconds, clearAt, FlyingSheets } from '../src/world/debris/FlyingSheets.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const flat = () => 0;
// a sheet on a roof 4.5 m up, its slope facing one of four ways, the wind toward +z
const sheet = ( k, wind, o = {} ) => flightOf( {
	frame: new Matrix4().makeRotationY( ( k % 4 ) * Math.PI / 2 ).multiply( new Matrix4().makeRotationX( - 0.4 ) ).setPosition( 0, 4.5, 0 ),
	w: 0.84, len: 2.6, kgm2: 4.2, wind, toward: { x: 0, y: 1 }, sea: - 5, ground: flat, walls: [ { x: 0, z: 0, r: 4.5, top: 6 } ], seed: ( k + 0.5 ) / 60, ...o,
} );
const last = ( f ) => new Vector3().fromArray( f.pos, ( f.n - 1 ) * 3 );
const median = ( a ) => a.slice().sort( ( x, y ) => x - y )[ Math.floor( a.length / 2 ) ];

// the same for everyone
{

	const a = sheet( 3, 36 ), b = sheet( 3, 36 );
	check( a.n === b.n && a.pos.every( ( v, i ) => v === b.pos[ i ] ) && a.quat.every( ( v, i ) => v === b.quat[ i ] ), 'the same flight from the same sheet, wind and draws (the same for everyone)' );

}

// how far, how high, how long, which way, in a Category 1's wind and a 3's
{

	const spread = ( wind ) => {

		const fl = Array.from( { length: 60 }, ( _, k ) => sheet( k, wind ) );
		const d = fl.map( ( f ) => last( f ).length() ), down = fl.filter( ( f ) => last( f ).z > Math.abs( last( f ).x ) * 0.5 ).length / fl.length;
		const up = fl.map( ( f ) => { let y = 0; for ( let i = 0; i < f.n; i ++ ) y = Math.max( y, f.pos[ i * 3 + 1 ] ); return y; } );
		return { d, med: median( d ), max: Math.max( ...d ), down, up: median( up ), time: median( fl.map( ( f ) => f.at ) ) };

	};
	const c1 = spread( 35 ), c3 = spread( 50 );
	console.log( `     at 35 m/s: ${ c1.med.toFixed( 0 ) } m (to ${ c1.max.toFixed( 0 ) }), ${ c1.up.toFixed( 1 ) } m up, ${ c1.time.toFixed( 1 ) } s; at 50: ${ c3.med.toFixed( 0 ) } m (to ${ c3.max.toFixed( 0 ) }); ${ ( c1.down * 100 ).toFixed( 0 ) }% down the wind` );
	check( c1.med > 25 && c1.med < 110 && c1.max < 400 && Math.min( ...c1.d ) > 8, 'a sheet off a roof in a Category 1\'s wind: most tens of metres, a few a couple of hundred (the measured flights)' );
	check( c3.med > c1.med * 1.2, 'further in a stronger wind' );
	check( c1.down > 0.9 && c1.up > 4 && c1.up < 14 && c1.time > 1 && c1.time < 8, 'down the wind, a few metres up, a few seconds in the air' );

}

// turning as it goes: autorotating about its length, the faster the stronger the wind
{

	const turns = ( f, s0, s1 ) => {

		let flips = 0, prev = null;
		for ( let i = 0; i < f.n; i ++ ) {

			if ( f.t[ i ] < s0 || f.t[ i ] > s1 ) continue;
			const q = new Quaternion().fromArray( f.quat, i * 4 ), ny = new Vector3( 0, 1, 0 ).applyQuaternion( q ).y;
			if ( prev !== null && Math.sign( ny ) !== Math.sign( prev ) ) flips ++;
			prev = ny;

		}

		return flips / 2 / ( s1 - s0 );

	};
	const r = median( Array.from( { length: 20 }, ( _, k ) => turns( sheet( k, 36 ), 0.1, 1.0 ) ) );
	console.log( `     turning about ${ r.toFixed( 1 ) } times a second in its first second` );
	check( r > 1 && r < 12, 'it tumbles over and over as it flies' );

}

// down: lying flat where it ends; sinking in the sea; stopped by a wall
{

	const f = sheet( 5, 36 ), q = new Quaternion().fromArray( f.quat, ( f.n - 1 ) * 4 ), n = new Vector3( 0, 1, 0 ).applyQuaternion( q );
	check( f.end === 'ground' && n.y > 0.95 && Math.abs( last( f ).y - 0.04 ) < 0.01, 'on the ground it lies flat, where it\'s bent rising off it' );
	const s = sheet( 5, 36, { ground: ( x, z ) => z > 15 ? - 4 : 0, sea: 0 } ), pos = new Vector3(), quat = new Quaternion();
	check( s.end === 'sea' && last( s ).y < - 1 && ! poseAt( s, s.t[ s.n - 1 ] + 1, pos, quat ) && poseAt( s, s.at - 0.2, pos, quat ), 'over the sea it comes down into it and sinks out of sight' );
	const w = sheet( 1, 36, { walls: [ { x: 0, z: 0, r: 4.5, top: 6 }, { x: 0, z: 22, r: 3, top: 9 } ] } );
	const free = sheet( 1, 36 );
	check( last( free ).z > 30 && last( w ).z < 21 && last( w ).z > 10, `a house in its way stops it against its wall (${ last( w ).z.toFixed( 0 ) } m, ${ last( free ).z.toFixed( 0 ) } without it)` );

}

// off the island's own roofs in the trades: onto the beach and into the sea, down the wind
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
{

	const base = { trim: [ 1, 1, 1 ], accent: [ 0, 0, 0.3 ], wall: [ 0.2, 0.6, 0.6 ], siding: 1, paint: 0.6, foundation: 'posts', curtain: [ 1, 1, 1 ], roofMat: 'metal', roofColor: [ 0.5, 0.1, 0.05 ] };
	const specs = [
		{ ...base, name: 'A', x: 13.5, z: - 106.5, yaw: 0.12, w: 6.2, d: 5.0, roof: 'gable', porch: { depth: 2.1, rail: 'balusters' } },
		{ ...base, name: 'C', x: 62.5, z: - 106.0, yaw: - 0.1, w: 7.0, d: 5.8, stories: 2, roof: 'gableFront', porch: { depth: 2.2, rail: 'x' } },
		{ ...base, name: 'K', x: 3.5, z: - 151.0, yaw: 0.18, w: 6.0, d: 5.2, roof: 'gable', porch: { depth: 2.0, rail: 'x' } },
	];
	const holes = [], B = new Builder(), colliders = new Colliders(), rand = new Rand( mulberry32( 7 ) );
	const ctx = { B, terrain, colliders, rand, lights: [], inst: new InstancedProps( B ), checks: [], holes };
	for ( const s of specs ) buildHouse( ctx, s );
	const walls = specs.map( ( s ) => ( { x: s.x, z: s.z, r: Math.hypot( s.w, s.d ) / 2, top: terrain.heightAt( s.x, s.z ) + 6 } ) );
	const toward = towardOf( 0 ), ends = [];
	let k = 0;
	for ( const h of holes ) for ( const q of h.sheets ) {

		const frame = new Matrix4().makeBasis( q.v, q.n, q.u ).setPosition( q.c );
		const f = flightOf( { frame, w: q.w, len: q.len, kgm2: 4.2, wind: 36, toward, sea: 1.2, ground: ( x, z ) => terrain.heightAt( x, z ), walls, seed: ( k ++ + 0.5 ) / 9 } );
		const e = last( f ), d = e.clone().sub( q.c );
		ends.push( { f, along: d.x * toward.x + d.z * toward.y, z: e.z } );

	}

	console.log( `     ${ ends.length } sheets off three houses in the trades: ${ ends.map( ( e ) => `${ e.along.toFixed( 0 ) } m (${ e.f.end }, z ${ e.z.toFixed( 0 ) })` ).join( ', ' ) }` );
	check( ends.length >= 3 && ends.filter( ( e ) => e.along > 5 ).length >= ends.length * 0.8, 'off the island\'s own roofs, down the trades: toward the beach and the sea' );

}

// shown from the moment it goes until it's cleared away with the wrack
{

	// (a Category 1 or stronger that takes Joe's first sheet)
	let h = null, st = null;
	for ( let T = 24 * 80; T < 24 * 1200 && ! st; T += 6 ) {

		const c = hurricaneAt( T );
		if ( ! c || ( h && c.tc === h.tc ) ) continue;
		h = c;
		const s = pieceState( damageAt( hurricaneNews( c.tc ).ends + 1 ), 'stand', 0 );
		if ( s.state === GONE ) st = s;

	}

	const objs = [], scene = { add: ( o ) => objs.push( o ), remove: () => {} };
	const fs = new FlyingSheets( { scene, terrain, windAt: ( T ) => { const w = weatherAt( T ); return { wind: w.wind, toward: towardOf( w.windAngle ), surge: w.surge }; } } );
	const frame = new Matrix4().makeRotationX( - 0.16 ).setPosition( 49.9, terrain.heightAt( 49.9, - 74.6 ) + 2.4, - 74.6 );
	fs.add( [ 0, 1 ].map( ( sub ) => ( { kind: 'stand', id: 0, sub, w: 0.98, len: 2.12, kgm2: 4.2, frame, mesh: () => new Mesh( new BoxGeometry( 1, 0.01, 2 ) ) } ) ) );
	const at = ( T ) => {

		fs.set( damageAt( T ), T );
		for ( let i = 0; i < 4; i ++ ) fs.update( T );
		return fs.list.map( ( f ) => ( { shown: !! f.obj && f.obj.visible, y: f.obj ? f.obj.matrix.elements[ 13 ] : null, f } ) );

	};
	// (s seconds of the clock, in game hours)
	const went = st.went, hour = ( s ) => s / flightSeconds( went + 1, went );
	// (reckoned a little before it goes, and not again: shown going all the same, the moment it does)
	fs.set( damageAt( went - hour( 2 ) ), went - hour( 2 ) );
	fs.update( went - hour( 0.1 ) );
	const early = !! fs.list[ 0 ].obj && fs.list[ 0 ].obj.visible;
	for ( let i = 0; i < 4; i ++ ) fs.update( went + hour( 0.3 ) );
	const between = !! fs.list[ 0 ].obj && fs.list[ 0 ].obj.visible;
	const before = at( went - 0.01 ), soon = at( went + hour( 0.6 ) ), later = at( went + 2 ), clear = clearAt( st.storm, fs.list[ 0 ].key ), gone = at( clear + 0.5 );
	const y0 = frame.elements[ 13 ];
	console.log( `     Joe's sheet went at ${ went.toFixed( 3 ) } h; 0.6 s on it's at ${ soon[ 0 ].y && soon[ 0 ].y.toFixed( 1 ) } m (its roof ${ y0.toFixed( 1 ) }); lying from then; cleared ${ ( clear - st.storm.ends ).toFixed( 0 ) } h after the storm` );
	check( ! before[ 0 ].shown && soon[ 0 ].shown && soon[ 0 ].y > y0 - 1 && later[ 0 ].shown && later[ 0 ].f.flight.end && ! gone[ 0 ].shown, 'shown from the moment its wind\'s reached it, in the air, then lying, until it\'s cleared away' );
	check( ! early && between, 'and from the very moment it goes, between the island\'s reckonings of its damage' );
	check( fs.list[ 1 ].went > fs.list[ 0 ].went && flightSeconds( fs.list[ 1 ].went, fs.list[ 0 ].went ) > 0.9, 'a run of sheets peels off one after another' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
