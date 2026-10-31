// (M16) The turtles, minded (docs/m16/north.md), under Node: each hatchling's own track from the nest to the sea, a
// fan, none straight, its budget, there into the next morning; a female turning back at someone close or a light on
// her while she's coming up or hasn't begun to lay, and not once she's laying; standing still at a respectful
// distance with your light off you see the whole of it, and a walk past doesn't break it; two players' games the
// same; a light drawing hatchlings off, its track showing it, and them going back to the sea when it's gone; the
// sound hooks firing at their moments; and with nobody about, her night as it always was.
//
//   node test/north-turtles.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { femalesOf, planCrawl, timeline, femaleAt, hatchingsOf, hatchlingsAt, hatchTrackFade, lightAt, alarmRate, soundBeats, Clutch, Minding, HATCHLING, MINDING } from '../src/game/Turtles.js';
import { advance, secondsBetween } from '../src/game/IslandClock.js';
import { NestingTurtles } from '../src/world/NestingTurtles.js';
import { G } from '../src/core/Globals.js';
import { Group, Vector3 } from '../src/engine/index.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island-1024.bin' ) ) ), g = ( x, z ) => T.heightAt( x, z );

// a true nest and its plan, and her clock
const nesting = femalesOf( 2 ).find( ( f ) => ! f.false ) || femalesOf( 3 ).find( ( f ) => ! f.false );
const plan = planCrawl( nesting, g ), line = timeline( nesting, plan );
const span = ( name ) => line.find( ( q ) => q[ 0 ] === name );
const clock = ( t ) => advance( nesting.arrive, nesting.day, 0.01, t );
const stateAt = ( t, turned = null ) => {

	const { hour, day } = clock( t );
	return femaleAt( nesting, plan, hour, day, line, turned );

};
const total = line.reduce( ( s, q ) => s + q[ 2 ], 0 );

// her night with someone about: who( t, st ) -> { people, lights }; returns how it went
const night = ( who, dt = 0.1, M = new Minding() ) => {

	const phases = new Set();
	let turned = null;
	for ( let t = 0; t < total + 60; t += dt ) {

		let st = stateAt( t, turned );
		if ( ! st ) {

			if ( t > 1 ) break;
			continue;

		}

		phases.add( st.phase );
		if ( ! turned ) {

			const w = who( t, st );
			turned = M.tick( nesting, st, t, dt, w.people || [], w.lights || [], g );

		}

	}

	return { phases, turned };

};
const torchAt = ( x, z, tx, tz, on = true ) => {

	const y = g( x, z ) + 1.5, ty = g( tx, tz ) + 0.3, l = Math.hypot( tx - x, ty - y, tz - z );
	return on ? { x, y, z, intensity: 55, range: 30, dir: [ ( tx - x ) / l, ( ty - y ) / l, ( tz - z ) / l ], cosInner: Math.cos( 9 * Math.PI / 180 ), cosOuter: Math.cos( 35 * Math.PI / 180 ) } : null;

};
// a place d m from her up the beach, ahead of her or off to one side
const offAt = ( st, d, ang ) => [ st.x + Math.sin( st.heading + ang ) * d, st.z + Math.cos( st.heading + ang ) * d ];

// ---- nobody about: her night as it always was
{

	const M = new Minding();
	let same = true;
	for ( let t = 0; t < total + 5; t += 0.5 ) {

		const a = stateAt( t ), b = stateAt( t, M.turned.get( nesting.id ) );
		if ( a ) M.tick( nesting, a, t, 0.5, [], [], g );
		if ( JSON.stringify( a ) !== JSON.stringify( b ) ) same = false;

	}

	check( same && M.turned.size === 0, 'nobody about, no light: her night is the one from the clock and the day, the same for everyone' );

}

// ---- standing still at a respectful distance, light off: the whole of it
{

	// 15 m off to her side as she comes up, then 2 m behind her while she lays, as the codes have it
	const spot = offAt( stateAt( span( 'up' )[ 1 ] + 2 ), 15, Math.PI / 2 );
	let r = night( () => ( { people: [ { x: spot[ 0 ], z: spot[ 1 ], speed: 0 } ] } ) );
	check( ! r.turned && [ 'up', 'pit', 'chamber', 'lay', 'cover', 'down', 'enter' ].every( ( p ) => r.phases.has( p ) ), 'standing still 15 m off with your light off, you see the whole of it' );
	const nest = plan.nest, near = [ nest[ 0 ] + 8, nest[ 1 ] + 4 ];
	r = night( () => ( { people: [ { x: near[ 0 ], z: near[ 1 ], speed: 0 } ] } ) );
	check( ! r.turned, 'and standing still at 9 m from her nest too' );

}

// ---- a walk along the beach isn't a turn back; walking right up to her is
{

	const mid = stateAt( span( 'up' )[ 1 ] + span( 'up' )[ 2 ] * 0.5 );
	const walkPast = ( off ) => night( ( t, st ) => {

		// walking along the beach at 3 m/s past her, off m to seaward of her, at the middle of her crawl
		const t0 = span( 'up' )[ 1 ] + span( 'up' )[ 2 ] * 0.5;
		return { people: [ { x: mid.x + ( t - t0 ) * 3, z: mid.z - off, speed: 3 } ] };

	} );
	check( ! walkPast( 12 ).turned, 'walking past below her at 12 m: she goes on' );
	check( ! walkPast( 7 ).turned, 'nor at 7 m behind her, between her and the sea' );
	const head = night( ( t, st ) => {

		const t0 = span( 'up' )[ 1 ] + 4;
		if ( t < t0 ) return {};
		const [ x, z ] = offAt( st, Math.max( 1, 22 - ( t - t0 ) * 3 ), 0 );
		return { people: [ { x, z, speed: 3 } ] };

	} );
	check( !! head.turned && ! head.phases.has( 'lay' ), `walking up to her head-on: she turns back (a false crawl) at ${ head.turned ? head.turned.from : '?' }` );
	if ( head.turned ) {

		const tu = head.turned, end = tu.t + MINDING.startle + tu.crawl + 2;
		const st = stateAt( end, tu );
		check( st && st.phase === 'enter' && g( tu.down[ tu.down.length - 1 ][ 0 ], tu.down[ tu.down.length - 1 ][ 1 ] ) < 0 && stateAt( end + 10, tu ) === null, 'and goes back down to the sea by a way of her own, and into it' );

	}

}

// ---- a light on her
{

	const on = ( from, to, d = 10 ) => night( ( t, st ) => {

		if ( t < from || t > to ) return {};
		const [ x, z ] = offAt( st, d, Math.PI * 0.35 );
		return { lights: [ torchAt( x, z, st.x, st.z ) ] };

	} );
	const t0 = span( 'up' )[ 1 ] + 3;
	check( !! on( t0, t0 + 20 ).turned, 'a flashlight held on her from 10 m as she comes up: she turns back' );
	check( ! on( t0, t0 + 0.4 ).turned, 'a beam swept over her, half a second: she goes on' );
	const lay = span( 'lay' ), cover = span( 'cover' );
	check( ! on( lay[ 1 ], cover[ 1 ] + cover[ 2 ] ).turned, 'once she\'s laying she doesn\'t stop until she\'s covered it, flashlight or no' );
	check( ! night( ( t, st ) => t > lay[ 1 ] && t < cover[ 1 ] + cover[ 2 ] ? { people: [ { x: st.x + 1, z: st.z - 1, speed: 3 } ] } : {} ).turned, 'nor for someone walking right by her' );
	check( !! on( span( 'chamber' )[ 1 ], span( 'chamber' )[ 1 ] + 9, 6 ).turned, 'scooping out the chamber she\'s not begun to lay: a light still turns her' );
	// a boat's floodlights (NestingTurtles._flood): close in, not far out
	const flood = ( d ) => night( ( t, st ) => t > t0 && t < t0 + 25 ? { lights: [ { x: st.x, y: 3, z: st.z - d, intensity: 50, range: 45, dir: null } ] } : {} );
	check( !! flood( 18 ).turned, 'a boat\'s floodlights lit close in (18 m): she turns back' );
	check( ! flood( 60 ).turned, 'lit 60 m out: she goes on' );

}

// ---- two players: each game minds whoever it knows is there
{

	const A = new Minding(), B = new Minding();
	const me = { x: 0, z: 0, speed: 3 }, you = { x: 500, z: 500, speed: 0 };
	let ta = null, tb = null;
	for ( let t = span( 'up' )[ 1 ]; t < span( 'choose' )[ 1 ]; t += 0.1 ) {

		const st = stateAt( t );
		[ me.x, me.z ] = offAt( st, 4, 0 );
		// (each with the other's position a little late, as it reaches them; here, a tenth of a metre)
		if ( ! ta ) ta = A.tick( nesting, st, t, 0.1, [ me, you ], [], g );
		if ( ! tb ) tb = B.tick( nesting, st, t, 0.1, [ { ...you, x: you.x + 0.1 }, { ...me, x: me.x + 0.1 } ], [], g );

	}

	check( ta && tb && Math.abs( ta.t - tb.t ) < 0.5 && Math.hypot( ta.x - tb.x, ta.z - tb.z ) < 0.5, 'two players\' games, each minding the other who\'s there: she turns back at the same moment and spot in both' );
	check( ta && tb && Math.hypot( ta.down[ 10 ][ 0 ] - tb.down[ 10 ][ 0 ], ta.down[ 10 ][ 1 ] - tb.down[ 10 ][ 1 ] ) < 1, 'and goes the same way down' );

}

// ---- hatchlings' tracks
{

	let h = null;
	for ( let d = 1; d < 40 && ! h; d ++ ) h = hatchingsOf( d )[ 0 ];
	const p = planCrawl( h.female, g );
	const C = new Clutch( h, p, g, 11 ), D = new Clutch( h, p, g, 11 );
	const [ nx, nz ] = p.nest, sea = Math.atan2( p.up[ 0 ][ 0 ] - nx, p.up[ 0 ][ 1 ] - nz );
	let ends = 0, bent = 0, same = 0, startsAtNest = 0, min = 9, max = - 9;
	for ( let i = 0; i < C.count; i ++ ) {

		const r = C.routes[ i ], k = C.k, ex = r[ k * 3 ], ez = r[ k * 3 + 1 ];
		if ( g( ex, ez ) < 0.05 ) ends ++;
		if ( Math.hypot( r[ 0 ] - nx, r[ 1 ] - nz ) < 0.2 ) startsAtNest ++;
		let len = 0;
		for ( let j = 1; j <= k; j ++ ) len += Math.hypot( r[ j * 3 ] - r[ j * 3 - 3 ], r[ j * 3 + 1 ] - r[ j * 3 - 2 ] );
		if ( len > Math.hypot( ex - r[ 0 ], ez - r[ 1 ] ) * 1.002 ) bent ++;
		const a = Math.atan2( ex - nx, ez - nz ), off = Math.atan2( Math.sin( a - sea ), Math.cos( a - sea ) );
		min = Math.min( min, off );
		max = Math.max( max, off );
		if ( r.every( ( v, q ) => v === D.routes[ i ][ q ] ) ) same ++;

	}

	check( ends === C.count && startsAtNest === C.count, `${ C.count } tracks, each from the nest to the sea` );
	check( bent === C.count, 'none perfectly straight' );
	check( ( max - min ) > 0.6 && ( max - min ) < 2, `a fan seaward from the nest, ${ ( ( max - min ) * 180 / Math.PI ).toFixed( 0 ) } degrees across (green turtle hatchlings measured at 62 to 76)` );
	check( same === C.count, 'the same in every game, from the hatching alone' );
	const uniq = new Set( C.routes.map( ( r ) => Array.from( r ).join() ) );
	check( uniq.size === C.count, 'each its own' );
	// on its track as it goes
	let off = 0, seen = 0;
	const t = 40, pts = C.at( t );
	for ( let i = 0; i < C.count; i ++ ) if ( pts[ i ] ) {

		seen ++;
		const r = C.routes[ i ];
		let best = 1e9;
		for ( let j = 1; j <= C.k; j ++ ) {

			const ax = r[ j * 3 - 3 ], az = r[ j * 3 - 2 ], bx = r[ j * 3 ] - ax, bz = r[ j * 3 + 1 ] - az, l = bx * bx + bz * bz || 1;
			const u = Math.min( 1, Math.max( 0, ( ( pts[ i ][ 0 ] - ax ) * bx + ( pts[ i ][ 1 ] - az ) * bz ) / l ) );
			best = Math.min( best, Math.hypot( pts[ i ][ 0 ] - ax - bx * u, pts[ i ][ 1 ] - az - bz * u ) );

		}

		off = Math.max( off, best );

	}

	check( seen > 20 && off < 0.01, `each hatchling is on its track as it goes (${ seen } on the sand at ${ t } s)` );
	check( hatchlingsAt( h, p, ...( ( q ) => [ q.hour, q.day ] )( advance( h.hour, h.day, 0.01, 900 ) ), g ).length === 0, 'all gone in minutes' );
	// there into the next morning
	const night_ = h.hour > 12 ? h.day : h.day - 1;
	check( hatchTrackFade( h, 23.5, night_ ) === 0 && hatchTrackFade( h, 7.5, night_ + 1 ) === 0 && hatchTrackFade( h, 10, night_ + 1 ) > 0 && hatchTrackFade( h, 12.5, night_ + 1 ) === 1, 'the tracks there into the next morning, gone by noon' );

	// a light drawing them off, and back to the sea when it's gone
	const L = new Clutch( h, p, g, 11 ), t0 = 30, side = [ nx + 8, nz - 4 ], lamp = { x: side[ 0 ], y: g( ...side ) + 1.5, z: side[ 1 ], intensity: 55, range: 30, dir: null };
	const before = C.at( t0 ).map( ( q ) => q && [ q[ 0 ], q[ 1 ] ] );
	for ( let t = t0; t < 50; t += 0.4 ) L.lure( t, [ lamp ] );
	const drawn = L.at( 50 ), base = C.at( 50 );
	let toward = 0, n = 0;
	for ( let i = 0; i < L.count; i ++ ) if ( drawn[ i ] && base[ i ] && before[ i ] ) {

		n ++;
		if ( Math.hypot( drawn[ i ][ 0 ] - lamp.x, drawn[ i ][ 1 ] - lamp.z ) < Math.hypot( base[ i ][ 0 ] - lamp.x, base[ i ][ 1 ] - lamp.z ) - 0.5 ) toward ++;

	}

	check( n > 20 && toward > n * 0.7, `a light on the sand draws them to it: ${ toward } of ${ n } off their way, toward it` );
	const prefix = L.routes.findIndex( ( r, i ) => L.lured[ i ] && r[ 0 ] === C.routes[ i ][ 0 ] );
	check( prefix >= 0, 'starting from where they were, their tracks showing it' );
	for ( let t = 50; t < 60; t += 0.4 ) L.lure( t, [] );
	let backToSea = 0, wasOut = 0;
	for ( let i = 0; i < L.count; i ++ ) {

		const r = L.routes[ i ];
		if ( ! L.lured[ i ] && g( r[ L.k * 3 ], r[ L.k * 3 + 1 ] ) < 0.05 ) backToSea ++;
		wasOut ++;

	}

	check( backToSea === wasOut, 'and when it\'s gone they go back down to the sea, every one' );

}

// ---- the sound hooks' moments
{

	const heard = {};
	let prev = null, inOrder = true, last = - 1;
	for ( let t = 0; t < total; t += 0.1 ) {

		const st = stateAt( t );
		for ( const [ name, s ] of soundBeats( prev, st ) ) {

			( heard[ name ] = heard[ name ] || {} )[ st.phase ] = ( heard[ name ][ st.phase ] || 0 ) + 1;
			if ( s <= 0 || s > 1 ) inOrder = false;

		}

		prev = st;
		last = t;

	}

	check( heard.crawlStroke && heard.crawlStroke.up > 5 && heard.crawlStroke.down > 5 && ! heard.crawlStroke.lay, 'her crawling stroke on her way up and down, and not while she lays' );
	check( heard.sandThrown && heard.sandThrown.pit > 5 && heard.sandThrown.cover > 5 && ! heard.sandThrown.lay && ! heard.sandThrown.up, 'sand thrown as she digs and covers, not while she lays' );
	check( heard.breath && heard.breath.lay >= 2 && heard.breath.pit >= 2, 'her breath, all through, laying too' );
	check( inOrder && last > 0, 'strengths 0 to 1' );

}

// ---- the game's own: the hooks fired, the budget, nothing built till it's needed, not one sound
{

	const scene = new Group();
	let hour = 0, day = 0;
	const camera = { position: new Vector3( nesting.x, 3, plan.nest[ 1 ] - 20 ) };
	const t = new NestingTurtles( { scene, terrain: { heightAt: g } } );
	check( ! t.hatchTracks, 'nothing of the tracks built before it\'s needed' );
	const fired = {};
	for ( const k of Object.keys( t.sounds ) ) t.sounds[ k ] = ( x, y, z, s ) => {

		if ( [ x, y, z, s ].every( Number.isFinite ) && s >= 0 && s <= 1 ) fired[ k ] = ( fired[ k ] || 0 ) + 1;

	};
	const app = { player: { position: new Vector3( 0, 0, 0 ) }, localLights: { flashlight: { on: false }, sources: [] } };
	G.night.value = 1;
	for ( let s = 0; s < total + 3; s += 0.1 ) {

		( { hour, day } = clock( s ) );
		t.update( 0.1, camera, hour, day, app );

	}

	check( fired.breath > 2 && fired.sandThrown > 5 && fired.crawlStroke > 5, `her hooks fired, with a position and a strength: ${ Object.entries( fired ).map( ( [ k, v ] ) => `${ k } ${ v }` ).join( ', ' ) }` );
	// a night a nest hatches
	let h = null, d0 = 1;
	for ( ; d0 < 40 && ! h; d0 ++ ) if ( hatchingsOf( d0 ).length === 1 && hatchingsOf( d0 - 1 ).length === 0 ) h = hatchingsOf( d0 )[ 0 ];
	const n = new NestingTurtles( { scene, terrain: { heightAt: g } } );
	let scram = 0, zero = 0;
	n.sounds.scramble = ( x, y, z, s ) => {

		if ( s > 0 ) scram ++;
		else zero ++;

	};
	camera.position.set( h.female.x, 3, - 840 );
	let worst = 0;
	for ( let s = - 5; s < 300; s += 0.25 ) {

		( { hour, day } = advance( h.hour, h.day, 0.01, s ) );
		n.update( 0.25, camera, hour, day, app );
		if ( n.hatchTracks && n.hatchTracks.mesh.visible ) worst = Math.max( worst, n.hatchTracks.geometry.drawRange.count / 3 );

	}

	const mem = n.hatchTracks.pos.byteLength + n.hatchTracks.t.byteLength + n.hatchTracks.head.byteLength + n.hatchTracks.geometry.index.array.byteLength;
	const routes = [ ...n.clutches.values() ].reduce( ( s, c ) => s + c.routes.reduce( ( q, r ) => q + r.byteLength, 0 ) + c.start.byteLength, 0 );
	check( worst > 500 && worst <= 2000, `the tracks: ${ worst } triangles, one mesh (of 2,000)` );
	check( mem + routes < 0.5e6, `their memory: ${ ( ( mem + routes ) / 1e6 ).toFixed( 3 ) } MB in buffers and routes (of 0.5)` );
	check( scram > 20 && zero === 1, `the scramble's hook every half second while any are on the sand (${ scram }), and once at 0 at the last` );
	// the next morning
	( { hour, day } = { hour: 7.5, day: ( h.hour > 12 ? h.day : h.day - 1 ) + 1 } );
	n.update( 0.1, camera, hour, day, app );
	check( n.hatchTracks.mesh.visible, 'its tracks still drawn at 07:30 the next morning' );
	n.update( 0.1, camera, 12.5, day, app );
	check( ! n.hatchTracks.mesh.visible, 'and not at 12:30' );
	const src = readFileSync( new URL( '../src/world/NestingTurtles.js', import.meta.url ), 'utf8' ) + readFileSync( new URL( '../src/game/Turtles.js', import.meta.url ), 'utf8' );
	check( ! /audio|Audio|SoundScape|\.play\(/.test( src ), 'nothing there makes a sound: hooks only' );

	// two nests a night: still within it
	let two = null, dd = 1;
	for ( ; dd < 400 && ! two; dd ++ ) {

		const q = hatchingsOf( dd );
		if ( q.length >= 2 && q[ 0 ].count + q[ 1 ].count > 190 ) two = q;

	}

	const m = new NestingTurtles( { scene, terrain: { heightAt: g } } );
	let worst2 = 0;
	const last = two.reduce( ( a, b ) => secondsBetween( a.hour, a.day, b.hour, b.day ) > 0 ? b : a );
	for ( let s = 0; s < 40; s += 1 ) {

		( { hour, day } = advance( last.hour, last.day, 0.01, s ) );
		m.update( 1, camera, hour, day, app );
		if ( m.hatchTracks ) worst2 = Math.max( worst2, m.hatchTracks.geometry.drawRange.count / 3 );

	}

	check( worst2 > 500 && worst2 <= 2000, `two nests hatching together: ${ worst2 } triangles, one mesh` );
	check( lightAt( torchAt( 150, - 840, 150, - 830 ), 150, g( 150, - 830 ) + 0.3, - 830 ) > lightAt( { ...torchAt( 150, - 840, 150, - 830 ), dir: [ 0, 0, - 1 ] }, 150, g( 150, - 830 ) + 0.3, - 830 ), 'a beam counts where it\'s pointed' );
	check( alarmRate( { phase: 'lay', x: 0, z: 0, heading: 0 }, [ { x: 1, z: 1, speed: 3 } ], [], 0 ) === 0, 'a laying turtle\'s alarm: none' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
