// (M15) Plain-node tests of the chart you fill in and finding your way (game/Chart.js, game/ChartBake.js, the
// plotter's and the compass's rules in world/boat/): what's charted from the start and as you go, the names you
// come to, your marks and where the fish were, the save, Marta's chart; the sheets as baked over the real
// island and seabed; how far home and the fuel for it, against the real boat; the compass's card.
import { readFileSync } from 'node:fs';
import { Vector3, Quaternion } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { SHEETS, SOLD, SIGHT, NAMES, HOME, VARIATION, CRUISE, MAX_MARKS, MAX_SPOTS, Sheet, ChartLog, sightOf, legTo, magnetic, fuelFor } from '../src/game/Chart.js';
import { SheetBake, S52, SHADES, CONTOURS, shadeOf, bandOf } from '../src/game/ChartBake.js';
import { RECTS, ATLAS, atlasUV, plotterAcross, PLOTTER_NM, niceLength } from '../src/world/boat/Instruments.js';
import { compassCardGeometry, COMPASS_CARD } from '../src/world/boat/Wheelhouse.js';
import { BoatModel, COMPASS } from '../src/world/BoatModel.js';
import { BoatController } from '../src/player/BoatController.js';
import { Waves } from '../src/ocean/Waves.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { weatherAt } from '../src/game/Weather.js';
import { fuelBurn, UPGRADES, gearStats, defaultUpgrades } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { FT } from '../src/game/Units.js';
import { SEABED } from '../src/world/terrain/SeabedModel.js';
import { LIGHTHOUSE } from '../src/world/Lighthouse.js';
import { placeOf, PLACES } from '../src/game/Places.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const deg = ( r ) => r * 180 / Math.PI;

// ---- the sheets and what's seen of them
for ( const [ k, s ] of Object.entries( SHEETS ) ) ok( Number.isInteger( s.n ) && s.n * s.cell === s.ext, `the ${ k } sheet: ${ s.n } cells of ${ s.cell } m over ${ s.ext } m` );
ok( SHEETS.near.x0 < - 590 && SHEETS.near.x0 + SHEETS.near.ext > 560 && SHEETS.near.z0 < - 1300 && SHEETS.near.z0 + SHEETS.near.ext > 225 + 500, 'the island\'s sheet holds the island and 500 m of water past its north beach and its bay\'s mouth' );
ok( SHEETS.mid.ext >= 8000 && SHEETS.far.ext === SEABED.size, 'its waters\' 8 km about it, the far grounds\' the whole offshore seabed' );
{

	const sh = new Sheet( SHEETS.near );
	ok( sh.see( 0, - 300, 100 ) > 0 && sh.seen( 0, - 300 ) && sh.seen( 90, - 300 ) && ! sh.seen( 120, - 300 ), 'a sheet sees the cells within reach, not past it' );
	ok( sh.see( 0, - 300, 100 ) === 0, 'and nothing again' );
	const text = sh.encode(), back = new Sheet( SHEETS.near );
	ok( back.decode( text ) && back.count() === sh.count() && back.cells.every( ( v, i ) => v === sh.cells[ i ] ), `its cells as runs and back (${ text.length } bytes for a blob)` );
	ok( ! back.decode( '1,2,3' ) && ! back.decode( null ), 'and runs that don\'t fill it are refused' );

}

// ---- the chart you fill in
const c = new ChartLog();
ok( c.seen( 0, 100 ) && c.seen( 55, 30 ) && c.seen( 40, - 118 ) && c.seen( - 256, 176 ) && c.seen( 290, 196 ), 'from the start: the bay, the pier, the village and the headlands' );
ok( ! c.seen( 150, - 830 ) && ! c.seen( - 480, - 160 ) && ! c.seen( - 452, - 792 ) && ! c.seen( 0, 2000 ), 'not the north beach, the mangroves, the windward reef nor the open sea' );
ok( [ 'bay', 'eastHead', 'westHead', 'pier', 'summit' ].every( ( id ) => c.named( id ) ) && ! c.named( 'northBeach' ) && ! c.named( 'bank' ), 'the bay\'s names known, the rest to come to' );
const v0 = c.version;
ok( c.look( 150, - 1000, sightOf( 'boat' ) ) && c.seen( 150, - 830 ) && c.seen( 150, - 1300 ) && c.version > v0, 'off the north beach at sea: its coast charted' );
ok( ! c.look( 150, - 1000, sightOf( 'boat' ) ), 'and nothing new the second time' );
ok( sightOf( 'walk', 2 ) < sightOf( 'walk', 120 ) && sightOf( 'walk', 2000 ) === SIGHT.footMax && sightOf( 'swim' ) < sightOf( 'walk', 0 ), `you see further from high ground (${ sightOf( 'walk', 2 ) } m on the beach, ${ sightOf( 'walk', 300 ) } m from the summit), less swimming` );
// (the far grounds: charted where you've run, the finest sheet that reaches each place)
ok( c.look( 0, - 2600, 320 ) && c.seen( 0, - 2600 ) && c.seen( 0, - 2400 ) && ! c.seen( 0, - 3100 ), 'over the north ledge: its water charted about you' );
ok( c.look( - 6200, 7400, 320 ) && c.seen( - 6200, 7400 ) && ! c.seen( - 6200, 8200 ), 'on the bank, on the far grounds\' sheet' );
// names
ok( c.learn( 150, - 900 ).map( ( n ) => n.id ).includes( 'northBeach' ) && c.named( 'northBeach' ), 'the north beach named as you come to it' );
ok( c.learn( 150, - 900 ).length === 0, 'and told once' );
ok( c.learn( 0, - 2600, null ).every( ( n ) => n.id !== 'ledge' ) && c.learn( 0, - 2600, 'ledge' ).map( ( n ) => n.id ).includes( 'ledge' ), 'the north ledge named over its water (the place under you), not from near it' );
ok( c.learn( SEABED.bank.x, SEABED.bank.z, 'bank' ).some( ( n ) => n.id === 'bank' ), 'the bank too' );
ok( NAMES.every( ( n ) => n.known || n.place || n.r > 0 ), 'every name is known, or learned near it or over its water' );
ok( new Set( NAMES.map( ( n ) => n.id ) ).size === NAMES.length, 'each name its own' );
// marks and fish
const m1 = c.mark( 10.4, 20.6, 3 ), m2 = c.mark( 500, 500 );
ok( m1.id === 1 && m2.id === 2 && m1.x === 10 && m1.z === 21 && c.marks.length === 2, 'your marks numbered as a plotter numbers its waypoints' );
ok( c.unmark( 1 ) && ! c.unmark( 1 ) && c.marks.length === 1 && c.mark( 0, 0 ).id === 3, 'one taken off; the next has its own number' );
{

	const full = new ChartLog();
	for ( let i = 0; i < MAX_MARKS; i ++ ) full.mark( i, i );
	ok( full.mark( 0, 0 ) === null && full.marks.length === MAX_MARKS, `no more than ${ MAX_MARKS } marks` );

}

ok( c.caught( 'pompano', 'northBeach', 160, - 845, 4 ) && ! c.caught( 'permit', 'northBeach', 170, - 846, 4 ), 'your first fish at a place marks it; the next doesn\'t' );
ok( c.firsts.northBeach.x === 160 && c.spots.length === 2 && c.spots[ 1 ].s === 'permit', 'the place marked where the first one was; every fish kept for the plotter' );
for ( let i = 0; i < MAX_SPOTS + 10; i ++ ) c.caught( 'grunt', 'bay', i, 0 );
ok( c.spots.length === MAX_SPOTS && c.spots[ 0 ].x === 10 && c.firsts.northBeach, `the plotter keeps the last ${ MAX_SPOTS } fish, the places their first` );
// the save
{

	const json = JSON.parse( JSON.stringify( c.toJSON() ) ), back = new ChartLog();
	ok( back.fromJSON( json ) && back.near.count() === c.near.count() && back.mid.count() === c.mid.count() && back.far.count() === c.far.count(), 'saved and loaded: what\'s charted' );
	ok( [ ...c.names ].every( ( id ) => back.named( id ) ) && back.marks.length === c.marks.length && back.spots.length === c.spots.length && back.firsts.northBeach.x === 160, 'the names, the marks, the fish and the places' );
	ok( back.mark( 0, 0 ).id === 4, 'and the marks go on numbering' );
	const size = JSON.stringify( json ).length;
	ok( size < 12000, `the chart's ${ size } bytes in the save` );
	const old = new ChartLog();
	ok( old.fromJSON( undefined ) === false && old.seen( 0, 100 ) && ! old.seen( 150, - 830 ), 'a save from before has the bay alone' );
	const bad = new ChartLog();
	bad.fromJSON( { near: 'nonsense', names: [ 'nowhere', 'northBeach' ], marks: [ { id: 'x' }, { id: 7, x: 1, z: 2 } ] } );
	ok( bad.seen( 0, 100 ) && bad.named( 'northBeach' ) && ! bad.names.has( 'nowhere' ) && bad.marks.length === 1, 'a broken one keeps what it can' );

}

// Marta's chart
{

	const s = new GameState( null );
	ok( UPGRADES.chart && UPGRADES.chart.levels[ 1 ].cost === 30 && gearStats( defaultUpgrades() ).chart === false, 'Marta sells a chart of the island ($30, a waterproof one\'s price)' );
	ok( ! s.chart.bought && ! s.chart.seen( 150, - 830 ), 'you start without it' );
	s.money = 100;
	ok( s.buy( 'chart' ) && s.chart.bought && s.money === 70, 'bought' );
	ok( s.chart.seen( 150, - 830 ) && s.chart.seen( - 480, - 160 ) && s.chart.seen( 0, - 2400 ) && s.chart.seen( 900, - 300 ), 'it has the island and its waters' );
	ok( ! s.chart.seen( 0, - 3400 ) && ! s.chart.seen( SEABED.bank.x, SEABED.bank.z ) && SOLD.r < 3000, 'but not the far grounds past them' );
	const mid = s.chart.mid, cell = ( x, z ) => mid.index( x, z );
	ok( s.chart.charted( s.chart.near, 0 ) && s.chart.charted( mid, cell( 0, - 2400 ) ) && ! s.chart.charted( mid, cell( 0, - 3400 ) ), 'each sheet\'s cells say the same' );
	ok( s.chart.named( 'northBeach' ) && s.chart.named( 'lighthouse' ) && ! s.chart.named( 'ledge' ) && ! s.chart.named( 'bank' ), 'the island\'s names, not the far grounds\'' );
	s.chart.mark( 1, 2, 0 );
	const back = new GameState( null );
	ok( back.fromJSON( JSON.parse( JSON.stringify( s.toJSON() ) ) ) && back.chart.bought && back.chart.marks.length === 1, 'kept in the save with the rest' );
	back.reset();
	ok( ! back.chart.bought && back.chart.marks.length === 0 && ! back.chart.seen( 150, - 830 ), 'and a new game starts it over' );

}

// ---- finding your way
ok( Math.abs( legTo( 0, 0, 0, - 100 ).bearing ) < 1e-9 && Math.abs( legTo( 0, 0, 100, 0 ).bearing - Math.PI / 2 ) < 1e-9 && Math.abs( legTo( 0, 0, 0, 100 ).bearing - Math.PI ) < 1e-9, 'bearings clockwise from north (north -z, east +x)' );
ok( magnetic( 0 ) === 6 && magnetic( Math.PI / 2 ) === 96 && magnetic( VARIATION ) === 0 && magnetic( VARIATION - 0.01 ) === 359 && Math.abs( deg( VARIATION ) + 6.3 ) < 1e-9, 'the compass\'s bearings magnetic: 6.3° W, as NOAA\'s model has it there' );
ok( HOME.x === 64.5 && HOME.z === 36.5, 'home is the boat\'s berth by the pier' );
{

	// her speed at her cruise and the fuel for it, against the real boat on a calm sea
	const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
	const model = new BoatModel();
	const run = ( throttle ) => {

		const w = weatherAt( 30, 'calm' ), waves = new Waves( { tier: 'low', terrain } );
		waves.setSea( w.swell, w.windSea );
		waves.setSwell( 0, w.period, w.period, { x: 65, z: 3000 } );
		G.windSpeed.value = w.wind;
		const query = new WaterQuery( waves, terrain ), b = new BoatController( { model, query, terrain } );
		b.moored = false;
		b.driven = true;
		b.position.set( 65, 0, 3000 );
		b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), 0 );
		let sum = 0, n = 0, burn = 0;
		const dt = 1 / 60;
		for ( let i = 0; i < 50 * 60; i ++ ) {

			G.time.value += dt;
			b.queueQueries();
			query.update();
			b.setInput( throttle, 0, dt );
			b.update( dt );
			if ( i > 25 * 60 ) {

				sum += b.speed;
				n ++;
				burn += fuelBurn( b.rpm ) * dt;

			}

		}

		G.windSpeed.value = 7;
		return { speed: sum / n, perM: burn / ( sum * dt ), rpm: b.rpm };

	};
	const cruise = run( CRUISE.rpm ), full = run( 1 );
	ok( Math.abs( cruise.speed - CRUISE.speed ) < 0.6, `at ${ CRUISE.rpm } throttle she makes ${ cruise.speed.toFixed( 1 ) } m/s on a calm sea (CRUISE: ${ CRUISE.speed })` );
	const est = fuelFor( 1000, 40 ).litres;
	ok( Math.abs( est - cruise.perM * 1000 ) < 0.25, `the fuel home at her cruise: ${ est.toFixed( 2 ) } L a km, against her ${ ( cruise.perM * 1000 ).toFixed( 2 ) }` );
	const live = fuelFor( 1000, 40, { rpm: full.rpm, speed: full.speed } );
	ok( Math.abs( live.litres - full.perM * 1000 ) < 0.2 && live.litres > est, `under way, as she's going: flat out ${ live.litres.toFixed( 2 ) } L a km` );
	ok( fuelFor( 10000, 40 ).state === 'ok' && fuelFor( 10000, 25 ).state === 'tight' && fuelFor( 10000, 15 ).state === 'short', 'the rule of thirds: ok, tight into the last third, short' );
	const bank = legTo( SEABED.bank.x, SEABED.bank.z, HOME.x, HOME.z ).m;
	ok( fuelFor( bank, 40 ).state === 'ok' && fuelFor( 15000, 40 ).state === 'tight' && fuelFor( 21000, 40 ).state === 'short', `the 11-gallon tank: the bank's ${ ( bank / 1000 ).toFixed( 1 ) } km home in reach, 15 km into its last third, ${ ( 40 / est ).toFixed( 0 ) } km at most` );

}

// ---- the sheets as baked, over the real island and seabed
{

	const read = ( f ) => new Uint8Array( readFileSync( new URL( '../public/world/' + f, import.meta.url ) ) );
	const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
	ok( shadeOf( 1 ) === S52.DEPVS && shadeOf( 10 ) === S52.DEPMS && shadeOf( 50 ) === S52.DEPMD && shadeOf( 500 ) === S52.DEPDW, 'the water\'s four shades: 18, 60 and 300 ft' );
	ok( Math.abs( SHADES[ 0 ] - 18 * FT ) < 1e-9 && CONTOURS[ 0 ] === 6 * FT && bandOf( 1 ) < 0 && bandOf( - 1 ) === 0 && bandOf( - 3 ) === 1 && bandOf( - 3000 ) === CONTOURS.length, 'the depth contours a US chart\'s, in feet' );
	const t0 = performance.now();
	const near = new SheetBake( SHEETS.near, 576 ), mid = new SheetBake( SHEETS.mid, 256 );
	let frames = 0;
	while ( ! near.step( T, 48 ) ) frames ++;
	while ( ! mid.step( T, 64 ) ) frames ++;
	ok( frames < 80, `baked a few rows at a time: ${ frames } steps, ${ ( performance.now() - t0 ).toFixed( 0 ) } ms in all` );
	const px = ( b, x, z ) => {

		const i = Math.floor( ( x - b.spec.x0 ) * b.ppm ), j = Math.floor( ( z - b.spec.z0 ) * b.ppm ), o = ( j * b.N + i ) * 4;
		return [ b.rgba[ o ], b.rgba[ o + 1 ], b.rgba[ o + 2 ] ];

	};
	const is = ( a, c ) => a.every( ( v, i ) => Math.abs( v - c[ i ] ) < 3 );
	ok( is( px( near, - 24, - 420 ), S52.LANDA ), 'the land buff' );
	ok( is( px( mid, 2500, 2500 ), S52.DEPDW ), 'the deep white' );
	// (the island's waters: every shade there, contours and the coastline drawn)
	const count = ( b, c ) => {

		let n = 0;
		for ( let o = 0; o < b.rgba.length; o += 4 ) if ( Math.abs( b.rgba[ o ] - c[ 0 ] ) < 3 && Math.abs( b.rgba[ o + 1 ] - c[ 1 ] ) < 3 && Math.abs( b.rgba[ o + 2 ] - c[ 2 ] ) < 3 ) n ++;
		return n;

	};
	ok( [ S52.DEPVS, S52.DEPMS, S52.DEPMD ].every( ( c ) => count( near, c ) > 500 ) && count( mid, S52.DEPDW ) > 10000, 'its shades all there' );
	ok( count( near, S52.DEPIT ) > 100, `the mangroves green (${ count( near, S52.DEPIT ) } px)` );
	// (the lines: dark ink over the shades)
	let dark = 0, crosses = 0;
	for ( let o = 0; o < near.rgba.length; o += 4 ) if ( Math.max( near.rgba[ o ], near.rgba[ o + 1 ], near.rgba[ o + 2 ] ) < 110 ) dark ++;
	for ( let j = 0; j < near.N; j ++ ) for ( let i = 0; i < near.N; i ++ ) {

		const o = ( j * near.N + i ) * 4, x = near.xAt( i ), z = near.zAt( j );
		if ( near.rgba[ o ] < 60 && Math.hypot( x + 78, z - 58 ) < 58 ) crosses ++;

	}

	ok( dark > 1500 && crosses > 20, `the coastline drawn (${ dark } px of ink), and the bay reef's crosses (${ crosses })` );
	const sd = near.soundings( 'near' );
	ok( sd.length > 1000 && sd.every( ( p ) => p.d > 0.5 && T.heightAt( p.x, p.z ) < 0 ), `${ sd.length } soundings on the island's sheet, every one in the water` );
	ok( Math.abs( near.heightAt( 0, 100 ) - T.heightAt( 0, 100 ) ) < 1, 'its heights read back where they were baked' );
	// (the names, on what they name)
	const named = Object.fromEntries( NAMES.map( ( n ) => [ n.id, n ] ) );
	const hgt = ( n ) => T.heightAt( n.x, n.z );
	ok( hgt( named.sandbar ) < 0 && hgt( named.sandbar ) > - 3, `Sandbar on the bar (${ ( - hgt( named.sandbar ) ).toFixed( 1 ) } m of water under it)` );
	ok( Math.abs( named.summit.name - 302.39 / FT ) < 1, 'the summit\'s height, in feet' );
	ok( hgt( named.ledge ) < - 150 && hgt( named.ledge ) > - 300 && hgt( named.hump ) < - 100 && hgt( named.bank ) > - 30, 'North Ledge, the Hump and the Bank over their water' );
	// (the island's north-west corner: as far along that way as its land goes)
	let corner = null, most = - Infinity;
	for ( let x = - 800; x <= 0; x += 4 ) for ( let z = - 1000; z <= - 400; z += 4 ) if ( T.heightAt( x, z ) > 2 && - x - z > most ) {

		most = - x - z;
		corner = [ x, z ];

	}

	ok( Math.hypot( named.northWest.x - corner[ 0 ], named.northWest.z - corner[ 1 ] ) < 60 && hgt( named.northWest ) > 0, `North-west Point just in from the island's corner (${ corner })` );
	ok( Math.hypot( named.lighthouse.x - LIGHTHOUSE.x, named.lighthouse.z - LIGHTHOUSE.z ) < 60 && named.lighthouse.light === 'Fl 10s', 'the Lighthouse beside its light, its characteristic under it' );
	// (each place's own name; the north ledge only in the north: the canyon's floor off the bay is as flat and as deep)
	ok( NAMES.filter( ( n ) => PLACES[ n.id ] ).every( ( n ) => PLACES[ n.id ].name.toLowerCase().replace( /^the /, '' ) === n.name.toLowerCase().replace( /^the /, '' ) ), 'the chart\'s names are the places\' names' );
	ok( placeOf( { ledge: 1 }, 0, - 2550 ) === 'ledge' && placeOf( { ledge: 1 }, 1100, - 2200 ) === 'ledge' && placeOf( { ledge: 1 }, 100, 1800 ) === 'shelf', 'the north ledge is the north\'s: the canyon\'s floor is the shelf' );

}

// ---- the plotter
ok( Math.abs( plotterAcross( 110 ) - 640 ) < 1e-6 && plotterAcross( 1200 ) === 0.75 * 1852 && plotterAcross( 16000 ) === 12 * 1852 && plotterAcross( 1e6 ) === 24 * 1852 && PLOTTER_NM.every( ( n, i ) => ! i || n > PLOTTER_NM[ i - 1 ] ), 'the plotter\'s range in steps, half the minimap\'s view' );
ok( niceLength( 130 ) === 200 * FT && niceLength( 500 ) === 0.25 * 1852 && niceLength( 3000 ) === 1852, 'its scale bar a round length' );

// ---- the compass
ok( RECTS.compass[ 0 ] + RECTS.compass[ 2 ] <= ATLAS.w && RECTS.compass[ 1 ] + RECTS.compass[ 3 ] <= ATLAS.h, 'its card in the instruments\' atlas' );
{

	// (its faces outward: its top up, its skirt away from its middle)
	const g = compassCardGeometry(), p = g.attributes.position, ix = g.index.array, A = new Vector3(), B = new Vector3(), D = new Vector3(), n = new Vector3();
	let out = true;
	for ( let i = 0; i < ix.length; i += 3 ) {

		A.fromBufferAttribute( p, ix[ i ] );
		B.fromBufferAttribute( p, ix[ i + 1 ] );
		D.fromBufferAttribute( p, ix[ i + 2 ] );
		n.copy( B ).sub( A ).cross( D.clone().sub( A ) );
		const mid = A.clone().add( B ).add( D ).divideScalar( 3 ), skirt = mid.y < - 1e-6;
		if ( n.lengthSq() > 1e-16 && ( skirt ? n.x * mid.x + n.z * mid.z <= 0 : n.y <= 0 ) ) out = false;

	}

	ok( out, 'its top faces up, its skirt faces out' );

}

// (what's under each lubber, from the card's own geometry and its place in the atlas: the far one over its top, the
// near one on its skirt)
{

	const b = new BoatModel(), q = new Quaternion(), up = new Vector3( 0, 1, 0 ), m = b.compassMesh, uv = m.geometry.attributes.uv, p = m.geometry.attributes.position;
	const [ u0, v0, u1, v1 ] = atlasUV( 'compass' ), [ a0, , a1 ] = atlasUV( 'compassBand' ), rim = 49, skirtFrom = 50;
	const under = ( to, from, count, step ) => {

		const L = new Vector3( 0, 0, to ).applyAxisAngle( up, - m.rotation.y );
		let best = from, e = 1e9;
		for ( let i = from; i < from + count; i += step ) {

			const d = Math.hypot( p.getX( i ) - L.x * COMPASS_CARD.r, p.getZ( i ) - L.z * COMPASS_CARD.r );
			if ( d < e ) {

				e = d;
				best = i;

			}

		}

		return best;

	};
	const off = ( a, c ) => Math.abs( ( ( a - c + 540 ) % 360 ) - 180 );
	let far = 0, near = 0;
	for ( const psi of [ 0, 45, 90, 137, 180, 225, 270, 359 ] ) {

		q.setFromAxisAngle( up, Math.PI - psi * Math.PI / 180 );
		for ( let i = 0; i < 900; i ++ ) b.swingCompass( 1 / 60, q );
		const want = ( psi + 6.3 ) % 360;
		// (7.5° between the card's points: within half that)
		const t = under( 1, 1, rim, 1 ), cx = ( uv.getX( t ) - u0 ) / ( u1 - u0 ) - 0.5, cy = 0.5 - ( uv.getY( t ) - v0 ) / ( v1 - v0 );
		far = Math.max( far, off( Math.atan2( cx, - cy ) * 180 / Math.PI + 360, want ) );
		const k = under( - 1, skirtFrom, 98, 2 );
		near = Math.max( near, off( 360 * ( 1 - ( uv.getX( k ) - a0 ) / ( a1 - a0 ) ), want ) );

	}

	ok( far <= 3.8, `the far lubber reads her heading on the card's top (within ${ far.toFixed( 1 ) }°)` );
	ok( near <= 3.8, `and the near one on its skirt (within ${ near.toFixed( 1 ) }°)` );

}

{

	const b = new BoatModel(), q = new Quaternion(), up = new Vector3( 0, 1, 0 );
	const head = ( psi ) => q.setFromAxisAngle( up, Math.PI - psi ); // (her bow to psi, clockwise from north)
	const settle = ( psi, s = 15 ) => {

		head( psi );
		for ( let i = 0; i < s * 60; i ++ ) b.swingCompass( 1 / 60, q );
		return deg( b.compassHeading );

	};
	ok( Math.abs( settle( 0 ) - 6.3 ) < 0.1 && Math.abs( settle( Math.PI / 2 ) - 96.3 ) < 0.1 && Math.abs( settle( 3.5 ) - ( deg( 3.5 ) + 6.3 ) ) < 0.1, 'heading north it reads 006, east 096: magnetic' );
	// (a turn to starboard at 20° a second for three seconds: the card dragged round, then settling)
	let psi = Math.PI / 2, lag = 0, over = 0;
	for ( let i = 0; i < 180; i ++ ) {

		psi += 20 * Math.PI / 180 / 60;
		head( psi );
		b.swingCompass( 1 / 60, q );

	}

	lag = deg( psi ) + 6.3 - deg( b.compassHeading );
	for ( let i = 0; i < 600; i ++ ) {

		b.swingCompass( 1 / 60, q );
		over = Math.max( over, deg( b.compassHeading ) - ( deg( psi ) + 6.3 ) );

	}

	ok( lag > 4 && lag < 16, `in a turn the card lags (${ lag.toFixed( 1 ) }°), as a compass's does` );
	ok( over > 0 && over < 4 && Math.abs( deg( b.compassHeading ) - ( deg( psi ) + 6.3 ) ) < 0.2, `then swings past a little (${ over.toFixed( 1 ) }°) and settles` );
	ok( COMPASS.period >= 2 && COMPASS.period <= 6, 'settling in a few seconds' );
	b.swingCompass( 0.5, q );
	ok( Number.isFinite( b.compassHeading ), 'and a long frame doesn\'t throw it' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
