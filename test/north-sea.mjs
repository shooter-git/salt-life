// (M16) A gale's seas at their true height, and the sea's draw (docs/m16/north.md). Under Node: the figures against their
// sources, the radio's words, the long waves running down the wind, what the boat and the pier make of it, a fair day
// untouched to the bit; and that the sea's shader's cuts leave what they should (its source text: the looks and the
// costs are headless renders, in the doc).
import { readFileSync } from 'node:fs';
import { Vector3 } from '../src/engine/index.js';
import { G, GRAVITY } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Waves, SWELL_PERIOD } from '../src/ocean/Waves.js';
import { Whitecaps } from '../src/ocean/Whitecaps.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { ShoreWaves } from '../src/ocean/ShoreWaves.js';
import { computeShoreField } from '../src/world/ShoreField.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { BoatController } from '../src/player/BoatController.js';
import { BoatSpray } from '../src/player/BoatSpray.js';
import { Hull, FLOOD_L } from '../src/game/Hull.js';
import { BreakingSeas, breakingLitres } from '../src/game/BreakingSeas.js';
import { broadcast, seasWords, ZONES } from '../src/game/MarineForecast.js';
import { weatherAt, withEdge, seaHeight, seaSwell, seaTurn, seaPeriodOf, seaDominant, blowSeaOf, towardOf, CONDITIONS, SOUTHERLY, EDGE, HURRICANE, PICK_IDS } from '../src/game/Weather.js';
import { seaBox } from '../src/world/WeatherDriver.js';

const FT = 0.3048, KT = 0.5144;
let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const hs = ( w ) => seaHeight( w.swell, w.windSea, w.blow );
const pick = ( id ) => ( { ...weatherAt( 100, id ) } );
const far = ( id ) => withEdge( pick( id ), EDGE.full, 0 );

// ---- the figures against what's real
{

	const g = pick( 'gale' ), s = pick( SOUTHERLY );
	// (SMB's fetch-limited curve: Hs = 1.6e-3 sqrt( g X / U^2 ) U^2 / g, over the 100 to 150 km of water upwind)
	const smb = ( U, X ) => 1.6e-3 * Math.sqrt( X / GRAVITY ) * U;
	const low = smb( g.wind, 100000 ) / FT, high = smb( g.wind, 150000 ) / FT;
	console.log( `     SMB at ${ ( g.wind / KT ).toFixed( 0 ) } kt: ${ low.toFixed( 1 ) } ft over 100 km, ${ high.toFixed( 1 ) } over 150 km (${ ( smb( 0.71 * g.wind ** 1.23, 100000 ) / FT ).toFixed( 1 ) } and more on the Shore Protection Manual's adjusted wind)` );
	for ( const id of PICK_IDS ) if ( id !== 'hurricane' ) console.log( `     ${ id.padEnd( 10 ) } ${ ( pick( id ).wind / KT ).toFixed( 0 ).padStart( 3 ) } kt: ${ ( hs( pick( id ) ) / FT ).toFixed( 1 ).padStart( 5 ) } ft at ${ seaDominant( pick( id ) ).toFixed( 1 ) } s (was ${ ( seaHeight( pick( id ).swell, pick( id ).windSea ) / FT ).toFixed( 1 ) } ft); past the far grounds ${ ( hs( far( id ) ) / FT ).toFixed( 1 ) } ft at ${ seaDominant( far( id ) ).toFixed( 1 ) } s` );
	ok( g.wind / KT >= 34 && g.wind / KT <= 40, 'a gale\'s wind is force 8' );
	ok( hs( g ) / FT > 11 && hs( g ) / FT < 13.5, `a gale's sea in the Weather Service's 10 to 14 ft for these waters: ${ ( hs( g ) / FT ).toFixed( 1 ) } ft` );
	ok( low > 10 && high < 14 && hs( g ) / FT > low && hs( g ) / FT < high, 'and inside what SMB gives over the fetch these waters have' );
	ok( hs( s ) > hs( g ) && hs( s ) / FT < 14, `a southerly gale on the south's swell, a little more: ${ ( hs( s ) / FT ).toFixed( 1 ) } ft` );
	ok( Math.abs( hs( far( "gale" ) ) / hs( g ) - 1.5 ) < 0.08 && hs( far( 'gale' ) ) / FT > 16.5 && hs( far( 'gale' ) ) / FT < 19.5, `past the far grounds half again, the Beaufort scale's force 8 on the open ocean: ${ ( hs( far( 'gale' ) ) / FT ).toFixed( 1 ) } ft` );
	ok( hs( pick( 'blustery' ) ) / FT > 7 && hs( pick( 'blustery' ) ) / FT < 10, `a near gale (29 kt) as Key West's warnings have it, 6 to 10 ft: ${ ( hs( pick( 'blustery' ) ) / FT ).toFixed( 1 ) }` );
	ok( Math.abs( seaDominant( g ) - 9.4 ) < 0.3 && Math.abs( seaDominant( far( 'gale' ) ) - 11.4 ) < 0.4, `a higher sea's a longer one: ${ seaDominant( g ).toFixed( 1 ) } s, past the far grounds ${ seaDominant( far( 'gale' ) ).toFixed( 1 ) } s` );

	// (a breezy day and under: exactly as they were)
	for ( const id of [ 'calm', 'fair', 'cloudy', 'rain', 'breezy' ] ) {

		const w = pick( id );
		ok( w.blow === 0 && seaSwell( w.swell, w.blow ) === w.swell && seaTurn( w.swell, w.blow ) === 0 && seaDominant( w ) === w.period && hs( w ) === seaHeight( w.swell, w.windSea ), `${ id }: its sea as it was (${ ( hs( w ) / FT ).toFixed( 1 ) } ft)` );

	}

	ok( hs( far( 'fair' ) ) / hs( pick( 'fair' ) ) > 1.4 && hs( far( 'fair' ) ) / hs( pick( 'fair' ) ) < 1.6, 'a fair day past the far grounds, half again as it was' );
	// (in proportion, up the winds)
	let last = 0, up = true;
	for ( let U = 3; U <= 54; U += 1 ) {

		const h = Math.hypot( seaHeight( 1, 1 ), blowSeaOf( U ) );
		if ( h < last ) up = false;
		last = h;

	}

	ok( up && blowSeaOf( 11 ) === 0, 'it grows with the wind, from nothing at a breezy day\'s' );
	const c1 = Math.hypot( seaHeight( HURRICANE.swell, 3 ), blowSeaOf( 38 ) ) / FT, c3 = Math.hypot( seaHeight( HURRICANE.swell * HURRICANE.cats[ 2 ].size, 3 ), blowSeaOf( 52 ) ) / FT;
	ok( c1 > hs( far( 'gale' ) ) / FT && c1 < 30 && c3 > c1 && c3 < 40, `a hurricane's stays over a gale's: a Category 1's wall ${ c1.toFixed( 0 ) } ft, a 3's ${ c3.toFixed( 0 ) } ft` );

}

// ---- the radio's words
{

	const g = broadcast( 100, { pick: 'gale' } ), z0 = g.findIndex( ( l ) => l.includes( ZONES[ 0 ].name ) ), z1 = g.findIndex( ( l ) => l.includes( ZONES[ 1 ].name ) );
	console.log( '     ' + g[ z0 + 2 ] );
	console.log( '     ' + g[ z1 + 2 ] );
	ok( g.slice( z0, z1 ).some( ( l ) => /Seas 10 to 14 feet\. Dominant period 9 seconds/.test( l ) ), 'a gale on the radio: seas 10 to 14 feet, dominant period 9 seconds' );
	ok( g.slice( z1 ).some( ( l ) => /Seas 1[45] to 20 feet\. Dominant period 1[12] seconds/.test( l ) ), 'and beyond: seas 14 or 15 to 20 feet' );
	ok( g.includes( 'A gale warning is in effect.' ), 'its warning' );
	const f = broadcast( 100, { pick: 'fair' } );
	ok( f.some( ( l ) => /Seas 3 to 4 feet\. Dominant period 9 seconds/.test( l ) ) && f.some( ( l ) => /Seas 5 to 6 feet/.test( l ) ), 'a fair day\'s words as they were' );
	ok( seasWords( 8.5, 8.5 ) === 'Seas 7 to 10 feet.' && seasWords( 2, 2 ) === 'Seas 2 feet or less.' && seasWords( 3.8, 3.8 ) === 'Seas 3 to 4 feet.', 'a big sea in a wide band, as the Weather Service gives one' );
	const b = broadcast( 100, { pick: 'blustery' } );
	console.log( '     ' + b[ b.findIndex( ( l ) => l.includes( ZONES[ 0 ].name ) ) + 2 ] );

}

// ---- the sea drawn: what the waves come to, running down the wind
const sea = ( w, tier = 'low', at = { x: 0, z: 0 } ) => {

	const waves = new Waves( { tier, terrain } );
	G.windDir.value.copy( towardOf( w.windAngle ) );
	waves.setWindDir( G.windDir.value, at );
	waves.setSea( seaSwell( w.swell, w.blow ), w.windSea );
	waves.setWind( w.wind );
	waves.setSwell( w.west, w.period, w.period, at, 0, seaTurn( w.swell, w.blow ), seaPeriodOf( w.swell, w.windSea, w.blow ) );
	return waves;

};
{

	const g = pick( 'gale' ), P = { x: 4000, z: 4000 };
	for ( const tier of [ 'low', 'mid', 'high' ] ) {

		const waves = sea( g, tier, P );
		// (its significant height, by counting: four times the surface's standard deviation)
		let n = 0, m = 0, v = 0, hi = - 9, lo = 9;
		for ( let t = 0; t < 2000; t += 0.31 ) {

			const y = waves.heightAt( P.x + 11 * Math.sin( t ), P.z + 13 * Math.cos( t * 0.7 ), t );
			n ++; m += y; v += y * y; hi = Math.max( hi, y ); lo = Math.min( lo, y );

		}

		m /= n;
		const drawn = 4 * Math.sqrt( v / n - m * m ) / FT;
		console.log( `     ${ tier }: drawn ${ drawn.toFixed( 1 ) } ft, its highest wave ${ ( ( hi - lo ) / FT ).toFixed( 1 ) } ft; the long waves ${ waves.waves.filter( ( w ) => w.from === 's' ).map( ( w ) => ( 2 * Math.PI / w.k ).toFixed( 0 ) + ' m' ).join( ', ' ) }` );
		ok( drawn > 10 && drawn < 14, `${ tier }: what's drawn comes to what the radio says` );
		const box = seaBox( 0, g.surf, waves.reachOf( seaSwell( g.swell, g.blow ), g.windSea ) );
		ok( hi < box[ 1 ] && lo > box[ 0 ], `${ tier }: in the sea's culling box (${ box[ 0 ].toFixed( 1 ) } to ${ box[ 1 ].toFixed( 1 ) } m)` );
		const wd = towardOf( g.windAngle );
		ok( waves.waves.every( ( w ) => w.dx * wd.x + w.dz * wd.y > 0.3 ), `${ tier }: every wave running down the wind, within its spread` );

	}

	// (a fair day's waves: the same to the bit as if nothing had been added; the turn about the camera)
	const a = new Waves( { tier: 'high', terrain } ), b = new Waves( { tier: 'high', terrain } );
	a.setSea( 1, 1 );
	a.setSwell( 0, SWELL_PERIOD, SWELL_PERIOD, { x: 0, z: 0 }, 0, 0, 3 );
	ok( JSON.stringify( a.waves ) === JSON.stringify( b.waves ) && a.uniforms.waveB.value.every( ( v, i ) => v.equals( b.uniforms.waveB.value[ i ] ) ) && a.uniforms.waveA.value.every( ( v, i ) => v.equals( b.uniforms.waveA.value[ i ] ) ), 'a fair day\'s waves, to the bit' );
	const near = ( w, t ) => [ [ 0, 0 ], [ 4, 0 ], [ 0, - 4 ] ].map( ( [ dx, dz ] ) => w.heightAt( P.x + dx, P.z + dz, t ) );
	// (a frame's turn at a wind where they're coming round, at the camera)
	const B = { ...pick( 'breezy' ), wind: 12.6, blow: blowSeaOf( 12.6 ), windSea: 2.2 }, w = sea( B, 'low', P );
	G.time.value = 5;
	const h0 = near( w, 5 );
	w.setSwell( 0, B.period, B.period, P, 5, seaTurn( B.swell, B.blow ) - 0.012 / 60, seaPeriodOf( B.swell, B.windSea, B.blow ) );
	ok( Math.max( ...near( w, 5 ).map( ( h, i ) => Math.abs( h - h0[ i ] ) ) ) < 0.003, 'the long waves come round about the camera, the sea under you staying where it is' );

	// (the island's lee: a gale down the trades breaks on the north side, the bay in its lee as it was)
	const trades = sea( g, 'low', { x: 0, z: 0 } ), south = sea( pick( SOUTHERLY ), 'low', { x: 0, z: 0 } );
	const longAt = ( w, x, z ) => w.leeAt( x, z )[ 0 ];
	ok( longAt( trades, 100, 600 ) < 0.2 && longAt( trades, 0, - 3000 ) === 1 && longAt( south, 100, 600 ) === 1, 'a gale down the trades leaves the bay in the island\'s lee; a southerly\'s comes in' );

}

// ---- the pier and the dock
{

	const shore = new ShoreWaves( { field: computeShoreField( terrain, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } ) } );
	const peak = ( q, x, z ) => {

		let m = - 9;
		for ( let t = 0; t < 400; t += 0.25 ) m = Math.max( m, q.heightAt( x, z, t ) );
		return m;

	};
	const pier = WORLD.pier, under = pier.deckHeight - 0.4;
	for ( const id of [ 'gale', SOUTHERLY ] ) {

		const w = pick( id ), waves = sea( w, 'high' );
		shore.setSurf( w.surf, w.period, 0 );
		const q = new WaterQuery( waves, terrain, shore );
		const tip = peak( q, pier.x, pier.zEnd ), head = peak( q, pier.x - pier.headWidth / 2 + 1, pier.zEnd + 3 ), dock = peak( q, WORLD.boatDock.position.x, WORLD.boatDock.position.z );
		console.log( `     ${ id }: crests ${ tip.toFixed( 2 ) } m at the pier's tip, ${ head.toFixed( 2 ) } m at its head, ${ dock.toFixed( 2 ) } m at the dock; its deck ${ pier.deckHeight } m` );
		ok( tip < under && head < under && dock < under, `${ id }: under the pier's deck and the dock` );

	}

	// (the surf's own: its height and its run-up are the shore's, none of this in them)
	const c = pick( SOUTHERLY );
	ok( c.surf === Math.min( 0.6, CONDITIONS.gale.surf ) && pick( 'gale' ).north === 1.2, 'the bay\'s surf and the north shore\'s as they were: the run-up\'s no further than it was' );

}

// ---- the boat in it
const model = new BoatModel();
function aboard( { cond = 'gale', throttle = 0.7, rel = Math.PI, secs = 120, anchor = false, edge = false } ) {

	const from = { x: 3000, z: 3000 }, w = edge ? far( cond ) : pick( cond ), waves = sea( w, 'low', from );
	G.time.value = 1000;
	G.windSpeed.value = w.wind;
	const caps = new Whitecaps( { waves, tier: 'low' } );
	caps.set( w.wind );
	const query = new WaterQuery( waves, terrain ), b = new BoatController( { model, query, terrain, colliders: null } );
	b.moored = false;
	b.driven = ! anchor;
	if ( anchor ) b.anchor = { x: from.x, y: 0, z: from.z };
	b.position.set( from.x, 0, from.z );
	const a = Math.atan2( G.windDir.value.y, G.windDir.value.x ) + rel, yaw = Math.atan2( Math.cos( a ), Math.sin( a ) );
	b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), yaw );
	const hull = new Hull( { random: () => 0.99 } ), seas = new BreakingSeas( { waves, caps, hull } ), spray = new BoatSpray( { boat: b, spray: { nReq: 0, emit() {} } } );
	b.onSlam = ( s ) => hull.slam( s );
	let hi = - 9, lo = 9, tilt = 0, under = 0;
	const up = new Vector3(), h = hs( w ), dt = 1 / 60;
	for ( let i = 0; i < secs * 60; i ++ ) {

		G.time.value += dt;
		b.queueQueries();
		query.update();
		b.setInput( anchor ? 0 : throttle, 0, dt );
		b.update( dt );
		spray.update( dt );
		seas.step( dt, b, h, G.time.value );
		const c = b.contact;
		hull.step( dt, { driven: ! anchor, throttle, fuel: true, rain: 0, pile: c.pile, ground: c.ground, slide: c.slide, aground: c.aground } );
		c.pile = c.ground = c.slide = 0;
		c.aground = false;
		hull.drain();
		if ( i > 300 ) {

			hi = Math.max( hi, b.position.y );
			lo = Math.min( lo, b.position.y );
			up.set( 0, 1, 0 ).applyQuaternion( b.quaternion );
			tilt = Math.max( tilt, Math.acos( Math.min( 1, up.y ) ) * 57.3 );
			if ( spray.contacts[ 0 ].depth > 1.1 ) under ++;

		}

	}

	G.windSpeed.value = 7;
	return { heave: hi - lo, tilt, hits: seas.hits, bilge: hull.bilge, wear: hull.wear, finite: b.isFinite(), under };

}
{

	const show = ( n, r ) => console.log( `     ${ n }: heaves ${ r.heave.toFixed( 1 ) } m, tilts to ${ r.tilt.toFixed( 0 ) } degrees, ${ r.hits } seas aboard, ${ r.bilge.toFixed( 0 ) } L in her, ${ ( r.wear * 100 ).toFixed( 0 ) }% worn` );
	const fair = aboard( { cond: 'fair', secs: 90 } ), gale = aboard( { secs: 240 } ), beam = aboard( { rel: Math.PI / 2, secs: 240 } ), anch = aboard( { anchor: true, secs: 240 } ), out = aboard( { edge: true, secs: 240 } );
	show( 'a fair day, under way', fair );
	show( 'a gale, head to it', gale );
	show( 'a gale, across it', beam );
	show( 'a gale, at anchor', anch );
	show( 'a gale past the far grounds', out );
	ok( [ fair, gale, beam, anch, out ].every( ( r ) => r.finite ), 'she stays whole in the sums' );
	ok( fair.hits === 0 && fair.wear === 0 && fair.bilge === 0, 'a fair day: nothing comes aboard' );
	ok( gale.heave > 2.5 && out.heave > gale.heave * 1.1, 'she\'s lifted the height of the sea' );
	ok( gale.hits + beam.hits + anch.hits >= 4 && gale.bilge + beam.bilge + anch.bilge > 200, 'and seas break on her, under way and at anchor: in real trouble' );
	ok( gale.bilge * 5 > FLOOD_L * 0.5 && Math.abs( breakingLitres( 3.66 ) - 60 ) < 1e-6 && breakingLitres( 2.6 ) === 0, 'a gale floods her engine in a quarter of an hour or less, unbailed; a near gale\'s sea doesn\'t come aboard' );
	ok( gale.wear > 0.01, 'and wears her, driven into it' );

}

G.windDir.value.copy( G.windPrevailing.value );
// ---- the height as you'd judge it by eye, and a long sea's own crests breaking (it read flat)
{

	const g = pick( 'gale' ), fair = pick( 'fair' ), P = { x: 4000, z: 4000 };
	for ( const tier of [ 'low', 'high' ] ) {

		const waves = sea( g, tier, P ), d = [ 0, 0, 0 ], lee = new Float64Array( waves.waves.length ).fill( 1 ), H = [];
		let last = 0, hi = - 9, lo = 9, began = false;
		for ( let t = 0; t < 3600; t += 0.1 ) {

			const y = waves.displacement( P.x, P.z, t, d, 1, lee )[ 1 ];
			hi = Math.max( hi, y );
			lo = Math.min( lo, y );
			if ( last < 0 && y >= 0 ) {

				if ( began ) H.push( hi - lo );
				began = true;
				hi = - 9;
				lo = 9;

			}

			last = y;

		}

		H.sort( ( a, b ) => b - a );
		const third = H.slice( 0, Math.ceil( H.length / 3 ) ), h13 = third.reduce( ( a, b ) => a + b ) / third.length / FT;
		ok( h13 > 11 && h13 < 14, `${ tier }: the highest third of its waves ${ h13.toFixed( 1 ) } ft, in the radio's 10 to 14` );

	}

	ok( Math.abs( hs( g ) / FT - 12 ) < 1, `and the radio's figure itself ${ ( hs( g ) / FT ).toFixed( 1 ) } ft, as it was` );
	for ( const tier of [ 'low', 'high' ] ) {

		G.windSpeed.value = g.wind;
		const waves = sea( g, tier, P ), caps = new Whitecaps( { waves, tier } );
		caps.set( g.wind );
		const big = caps.carriers[ 2 ], w = waves.waves[ big.wave ], L = 2 * Math.PI / w.k;
		ok( w.from === 's' && L > 40 && L < 90, `${ tier }: a gale's heads on its ${ L.toFixed( 0 ) } m wave` );
		let heads = 0, others = 0;
		for ( let t = 300; t < 400; t += 3 ) caps.rollers( P.x, P.z, 300, t, ( x, z, a, h, on, wave ) => { if ( wave === w ) heads ++; else others ++; } );
		ok( heads > 0 && others > 0, `${ tier }: they break, ${ heads } heads among ${ others } of the short seas' whitecaps in 100 s, 300 m about` );
		const f = new Whitecaps( { waves: sea( fair, tier, P ), tier } );
		f.set( fair.wind );
		ok( f.chance[ 2 ] === 0 && f.uniforms.whitecapBig.value.x === 0 && f.uniforms.whitecapBig.value.y === 0, `${ tier }: none on a fair day, and nothing of them added to its white` );

	}

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
if ( fails ) process.exit( 1 );
