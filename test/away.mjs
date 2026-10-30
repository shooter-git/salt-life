// (M15) Plain-node tests of picking up where you left off (game/Away.js, together/Together.js): the clock going on
// while you're away; what happens to a boat left at anchor, adrift or at the dock (a storm's wear, her drift, found
// and towed in, a week gone, a hurricane's tow), in scripted weather and the real one; Marta's note; and playing
// together: her place in the group's shared save, the host's keeping (never her pose), her on your sea, and aboard.
//   node test/away.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

// (the SDK's three helpers are TypeScript node won't load: stood in for)
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {

	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );

}` ) );
const { Together } = await import( '../src/together/Together.js' );
const { Vector3, Quaternion } = await import( '../src/engine/index.js' );
const { BACK_MS, DRIFT, FOUND_M, ISLE, KEEP_H, WEEK_H, WEEK_MS, anchorLie, sheerAt, swingRate, awayClock, awayOf, boatLeft, boatRecord, cleanBoats, keepBoat, leftOf, tellOf, wearRate, withRecord } = await import( '../src/game/Away.js' );
const { towFee, HAUL_FEE } = await import( '../src/game/Gear.js' );
const { weatherAt, towardOf, hurricaneNews, islandTime } = await import( '../src/game/Weather.js' );
const { WORLD } = await import( '../src/world/WorldLayout.js' );
const { GameState } = await import( '../src/game/GameState.js' );
const { Game } = await import( '../src/game/Game.js' );
const { RODE_SLACK } = await import( '../src/player/BoatController.js' );
const { G: Globals } = await import( '../src/core/Globals.js' );

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const dock = WORLD.boatDock.position;
const FAIR = { id: 'fair', wind: 7, rain: 0, thunder: 0, windAngle: 0 };
const fairly = { weather: () => FAIR, news: () => null };
const T0 = islandTime( 30, 9 );
// off the island, in deep water, at anchor or not
const FAR = { x: 9000, z: 9000 }, NEAR = { x: ISLE.x + 1500, z: ISLE.z };
const at = ( where, more = {} ) => ( { ...where, heading: 1, anchor: null, moored: false, hauled: false, T: T0, ...more } );
const anchored = ( where ) => at( where, { anchor: { ...where } } );

// ---- the clock
{

	const c = awayClock( 10, 5, 1000, 1000 + 8 * 3600e3 );
	check( Math.abs( c.hour - 18 ) < 1e-9 && c.day === 5, 'gone eight real hours, eight island hours on: 10:00 comes back as 18:00' );
	const w = awayClock( 10, 5, 0, 7 * 24 * 3600e3 );
	check( Math.abs( w.hour - 10 ) < 1e-9 && w.day === 12, 'gone a week, a week on' );
	const old = awayClock( 10, 5, undefined, 5e12 );
	check( old.hour === 10 && old.day === 5, 'a save from before (no time on it): where it was' );
	const back = awayClock( 10, 5, 5000, 1000 );
	check( back.hour === 10 && back.day === 5, 'a device whose clock is behind the save\'s: where it was' );

}

// ---- the save's boat
{

	const text = JSON.stringify( boatLeft( { x: 123.456, z: - 7.89, heading: 1.23456, anchor: { x: 120, z: - 8 }, moored: false, aboard: 'deck', T: 700.5, at: 42 } ) );
	const l = leftOf( text );
	check( l.x === 123.5 && l.z === - 7.9 && l.heading === 1.235 && l.anchor.x === 120 && l.aboard === 'deck' && l.T === 700.5 && l.at === 42 && l.moored === false, 'where she lies, her heading, her anchor and whether you\'re aboard come back as they went' );
	check( leftOf( null ) === null && leftOf( 'nonsense' ) === null && leftOf( '{"v":2,"x":1,"z":1,"T":1}' ) === null, 'nothing, or not a boat: none' );
	check( leftOf( '{"v":1,"x":1,"z":1,"T":1,"anchor":[1],"aboard":"mast"}' ).anchor === null, 'a bad anchor or a bad place aboard: none of it' );

}

// ---- the weather on her
{

	check( wearRate( weatherAt( 40, 'fair' ) ) === 0 && wearRate( weatherAt( 40, 'blustery' ) ) === 0, 'a fair or blustery day takes nothing off her' );
	const squall = wearRate( weatherAt( 40, 'storm' ) ) * 100, gale = wearRate( weatherAt( 40, 'gale' ) ) * 100;
	console.log( `     an island hour's daylight (100 s of play): a thunderstorm ${ ( squall * 100 ).toFixed( 2 ) }%, a gale ${ ( gale * 100 ).toFixed( 2 ) }%` );
	check( squall > 0.003 && squall < 0.02, 'a thunderstorm\'s squalls take a little off her, about 1% an hour' );
	check( gale > 0.002 && gale < 0.02, 'and a gale\'s gusts' );

}

// ---- what happens: left alone on a fair day
{

	const s = awayOf( anchored( NEAR ), T0 + 6, { dock, ...fairly } );
	check( s.where === 'anchor' && s.x === NEAR.x && s.z === NEAR.z && s.heading === 1 && s.wear === 0 && ! s.tows.length && s.anchor.x === NEAR.x, 'six hours at anchor on a fair day: where you left her' );
	check( ! s.spoiled && s.hours === 6, 'and the fish still good' );
	const k = awayOf( anchored( NEAR ), T0 + KEEP_H - 0.1, { dock, ...fairly } ), o = awayOf( anchored( NEAR ), T0 + KEEP_H, { dock, ...fairly } );
	check( ! k.spoiled && o.spoiled, `the catch keeps ${ KEEP_H } hours` );
	const z = awayOf( anchored( NEAR ), T0 - 50, { dock, ...fairly } );
	check( z.hours === 0 && z.where === 'anchor', 'a clock behind where she was left: no time\'s passed' );
	const m = awayOf( at( dock, { moored: true } ), T0 + 100, { dock, ...fairly } );
	check( m.where === 'dock' && ! m.tows.length, 'at the dock, she lies at the dock' );

}

// ---- a storm, ridden out
{

	const thunder = { id: 'storm', wind: 14, rain: 1, thunder: 1, windAngle: 0 };
	const weather = ( t ) => ( t >= T0 + 1 && t < T0 + 3 ? thunder : FAIR );
	const s = awayOf( anchored( NEAR ), T0 + 8, { dock, weather, news: () => null } );
	console.log( `     two hours' thunderstorm at anchor: ${ ( s.wear * 100 ).toFixed( 1 ) }%` );
	check( s.where === 'anchor' && s.x === NEAR.x && s.wear > 0.005 && s.wear < 0.05 && s.kind === 'storm', 'she rides out a thunderstorm at anchor, where she was, a little off her hull' );
	const G = { id: 'gale', wind: 20, rain: 0.45, thunder: 0, windAngle: 0 };
	const g = awayOf( anchored( NEAR ), T0 + 24, { dock, weather: () => G, news: () => null } );
	check( g.where === 'anchor' && g.wear > s.wear && g.kind === 'gale', 'and a day\'s gale: her anchor holds, as it does in play, and she\'s the worse for it' );
	const h = awayOf( at( dock, { hauled: true } ), T0 + 24, { dock, weather: () => G, news: () => null } );
	check( h.where === 'cradle' && h.wear === 0, 'hauled out, none of it' );

}

// ---- adrift
{

	const f = awayOf( at( FAR ), T0 + 4, { dock, ...fairly } );
	const way = towardOf( 0 ), run = ( f.x - FAR.x ) * way.x + ( f.z - FAR.z ) * way.y, s = 4 * 100;
	console.log( `     adrift offshore four hours on a fair day: ${ run.toFixed( 0 ) } m downwind` );
	check( f.where === 'adrift' && Math.abs( run - DRIFT * 7 * s ) < 1 && Math.hypot( f.x - FAR.x, f.z - FAR.z ) - run < 1, `past the anchor's reach she drifts with the wind, ${ ( DRIFT * 100 ).toFixed( 0 ) }% of it` );
	check( Math.abs( Math.cos( f.heading - ( Math.atan2( way.x, way.y ) - Math.PI / 2 ) ) - 1 ) < 1e-9, 'lying beam-on to it, as she does' );
	const n = awayOf( at( FAR ), T0 + 96, { dock, ...fairly } );
	check( n.where === 'adrift' && n.fee === 0, 'out of sight of the island nobody finds her in four days' );
	const w = awayOf( at( FAR ), T0 + WEEK_H + 1, { dock, ...fairly } );
	check( w.tows.length === 1 && w.tows[ 0 ].why === 'week' && w.where === 'dock' && w.x === dock.x && w.fee === towFee( w.tows[ 0 ].metres ), 'after a week she\'s towed in, by the distance' );

	// near the island she's seen, in Marta's hours
	const d = awayOf( at( NEAR ), T0 + 6, { dock, ...fairly } );
	check( d.tows.length === 1 && d.tows[ 0 ].why === 'adrift' && d.where === 'dock' && d.fee === towFee( d.tows[ 0 ].metres ) && d.tows[ 0 ].x !== NEAR.x, 'adrift within sight of the island she\'s found and towed in, for her tow by the distance' );
	const night = islandTime( 30, 22 );
	const dn = awayOf( { ...at( NEAR ), T: night }, night + 8, { dock, ...fairly } );
	check( dn.tows.length === 0 && dn.where === 'adrift', 'not before Marta\'s day starts' );
	const dm = awayOf( { ...at( NEAR ), T: night }, night + 11, { dock, ...fairly } );
	check( dm.tows.length === 1, 'and she\'s found the morning after' );
	// ashore
	const shore = ( x, z ) => ( Math.hypot( x - NEAR.x, z - NEAR.z ) > 30 ? 0.2 : 20 );
	const a = awayOf( at( NEAR ), T0 + 6, { dock, depth: shore, ...fairly } );
	check( a.tows.length === 1 && a.tows[ 0 ].why === 'aground', 'run ashore on the way, she\'s found there' );
	const stuck = awayOf( at( FAR ), T0 + 6, { dock, depth: ( x, z ) => ( Math.hypot( x - FAR.x, z - FAR.z ) > 30 ? 0.2 : 20 ), ...fairly } );
	check( stuck.where === 'aground' && Math.hypot( stuck.x - FAR.x, stuck.z - FAR.z ) < 60, 'and out of sight, she stays where she fetched up' );
	check( FOUND_M < Math.hypot( FAR.x - ISLE.x, FAR.z - ISLE.z ), '(the far spot is out of sight)' );

}

// ---- a week at anchor
{

	const s = awayOf( anchored( NEAR ), T0 + WEEK_H + 2, { dock, ...fairly } );
	check( s.tows.length === 1 && s.tows[ 0 ].why === 'week' && s.where === 'dock' && s.anchor === null && s.fee === towFee( s.tows[ 0 ].metres ), 'gone a week, she\'s towed in from her anchor' );
	const e = awayOf( anchored( NEAR ), T0 + WEEK_H - 1, { dock, ...fairly } );
	check( ! e.tows.length, 'not before' );
	const m = awayOf( at( dock, { moored: true } ), T0 + WEEK_H + 2, { dock, ...fairly } );
	check( ! m.tows.length && m.where === 'dock', 'at the dock there\'s nothing to tow' );

}

// ---- a hurricane
{

	const since = T0 + 2; // (your own, passing six game hours on: its warning's out at once)
	const env = { dock, pick: 'hurricane', since };
	const s = awayOf( anchored( NEAR ), T0 + 24, env );
	const n = hurricaneNews( since, 'hurricane', since );
	check( !! n, `(one's about: ${ n && n.stage })` );
	check( s.where === 'cradle' && s.tows.length === 1 && s.tows[ 0 ].why === 'hurricane' && s.tows[ 0 ].out && s.fee === towFee( s.tows[ 0 ].metres ) + HAUL_FEE && s.anchor === null, 'at anchor as its warning comes, Marta tows her in and hauls her out: her tow and her haul-out' );
	check( s.wear === 0, 'and she never meets it' );
	const m = awayOf( at( dock, { moored: true } ), T0 + 24, env );
	check( m.where === 'cradle' && ! m.tows[ 0 ].out && m.fee === HAUL_FEE, 'at the dock, the haul-out alone' );
	const h = awayOf( at( dock, { hauled: true } ), T0 + 24, env );
	check( h.where === 'cradle' && h.fee === 0, 'hauled already, nothing more' );

	// the real thing: every boat through 400 days of the day's own weather, at anchor off the bay
	const t0 = performance.now();
	let tows = 0, days = 0, worst = 0;
	for ( let d = 20; d < 420; d += 7 ) {

		const r = awayOf( anchored( NEAR ), islandTime( d, 9 ), { dock } ), ok = awayOf( { ...anchored( { x: 300, z: 700 } ), T: islandTime( d, 9 ) }, islandTime( d + 6, 9 ), { dock } );
		days += 6;
		worst = Math.max( worst, ok.wear );
		if ( ok.tows.length ) {

			tows ++;
			check( ok.tows[ 0 ].why === 'hurricane' && ok.where === 'cradle', `(the only tow inside a week is a hurricane's: day ${ d })` );

		}
		if ( r.hours < 0 ) check( false, 'time ran backward' );

	}
	console.log( `     ${ days } days at anchor, a week at a time: ${ tows } towed ahead of a hurricane, the worst week ${ ( worst * 100 ).toFixed( 1 ) }% off her hull (${ ( performance.now() - t0 ).toFixed( 0 ) } ms)` );
	check( worst < 0.7, 'the worst of a week at anchor, in a blow days long, leaves her badly worn but not wrecked' );

}

// ---- the longest absence, in time
{

	const t = performance.now();
	const s = awayOf( at( dock, { moored: true } ), T0 + 24 * 400, { dock } );
	const ms = performance.now() - t;
	console.log( `     400 days away: ${ ms.toFixed( 0 ) } ms to reckon` );
	check( ms < 1500 && s.spoiled, 'a long absence is reckoned quickly (and only so far back)' );

}

// ---- Marta's note
{

	const tell = ( story, more ) => tellOf( story, more );
	const h0 = () => awayOf( anchored( NEAR ), T0 + 24, { dock, pick: 'hurricane', since: T0 + 2 } );
	const none = tell( awayOf( anchored( NEAR ), T0 + 1, { dock, ...fairly } ), {} );
	check( none.note === null && none.toast === null, 'nothing to say: no note' );

	const h = awayOf( anchored( NEAR ), T0 + 24, { dock, pick: 'hurricane', since: T0 + 2 } );
	const told = tell( h, { paid: h.fee } );
	check( told.note[ 0 ].includes( 'Towed your boat in ahead of the hurricane' ) && told.note[ 0 ].includes( 'blocks in my yard' ) && told.note[ 1 ] === `$${ h.fee }, out of what you had.`, 'a hurricane\'s tow: where she went and what it cost' );
	const coming = { stage: 'warning', onset: T0 + 29, ends: T0 + 60, eye: T0 + 40, cat: 2, from: 'NNW' };
	check( tell( h, { paid: h.fee, news: coming, T: T0 } ).note[ 0 ] === 'Towed your boat in ahead of the hurricane. She\'s up on blocks in my yard till it\'s gone by.', 'still about: on blocks till it\'s gone by' );
	const short = tell( h, { paid: 10 } );
	check( short.note[ 1 ] === `That's $${ h.fee }. You had $10, so I took that.`, 'short of it: what you had' );
	const broke = tell( h, { paid: 0 } );
	check( broke.note[ 1 ].includes( 'nothing to take it from' ), 'and nothing at all: she never leaves you without a boat' );

	const a = awayOf( at( NEAR ), T0 + 6, { dock, ...fairly } ), adrift = tell( a, { paid: a.fee } );
	check( adrift.note[ 0 ].includes( 'adrift off the' ) && adrift.note[ 0 ].includes( 'at my dock' ), `found adrift: "${ adrift.note[ 0 ]}"` );
	const w = awayOf( at( FAR ), T0 + WEEK_H + 1, { dock, ...fairly } ), wk = tell( w, { paid: w.fee } );
	check( wk.note[ 0 ].includes( 'a week' ), `a week gone: "${ wk.note[ 0 ]}"` );
	const fr = tellOf( { ...a, tows: [ { why: 'adrift', x: 9000, z: 9000, metres: 12000, fee: 80, where: 'dock', out: true } ], fee: 80 }, { paid: 80 } );
	check( fr.note[ 0 ].includes( '6 miles out to the south-east' ), `found far out: "${ fr.note[ 0 ]}"` );

	const storm = { ...awayOf( anchored( NEAR ), T0 + 1, { dock, ...fairly } ), wear: 0.06, kind: 'gale' };
	const rode = tell( storm, { hull: 0.14 } );
	check( rode.note[ 0 ] === 'Your boat rode out the gale at anchor: the hull\'s 14% worn. Bring her round and I\'ll see to it.', `a storm ridden out: "${ rode.note[ 0 ]}"` );
	const knocked = tell( { ...h0(), wear: 0.03, kind: 'gale' }, { paid: 0, hull: 0.03 } );
	check( knocked.note.some( ( p ) => p.startsWith( 'The gale knocked her about before that' ) ), 'a storm before she was fetched' );
	const faint = tell( { ...storm, wear: 0.001 }, { hull: 0.001 } );
	check( faint.note === null, 'a scratch isn\'t worth a line' );

	const off = awayOf( anchored( NEAR ), T0 + 14, { dock, ...fairly } );
	const drifted = tell( awayOf( at( FAR ), T0 + 8, { dock, ...fairly } ), { from: FAR } );
	check( drifted.note === null && /^Your boat drifted \d+ ft to the south(-east)? while you were away$/.test( drifted.toast ), `offshore, out of her sight: "${ drifted.toast }"` );
	const barely = tell( awayOf( at( FAR ), T0 + 0.5, { dock, ...fairly } ), { from: FAR } );
	check( barely.toast === null, 'not a few yards' );
	const ashore = tell( { ...off, where: 'aground' }, {} );
	check( ashore.toast === 'Your boat drifted ashore while you were away', 'and fetched up ashore' );
	const f = tell( off, { fish: 5 } );
	check( f.note === null && f.toast.includes( 'gone off' ), 'the fish gone off in a box she\'d no reason to open: said apart from her note' );
	const gone = tell( h, { paid: h.fee, open: true } );
	check( gone.note[ 0 ] === 'Towed your boat in ahead of the hurricane and kept her up on blocks in my yard till it had gone by. She\'s back in at my dock.', `it's gone by, and she's back: "${ gone.note[ 0 ]}"` );
	const shutNow = tell( h, { paid: h.fee, open: false } );
	check( shutNow.note[ 0 ].endsWith( 'till it had gone by. I\'ll put her back in at my dock when I next open.' ), 'and with Marta shut, she will be' );
	const hd = tell( awayOf( at( dock, { moored: true } ), T0 + 24, { dock, pick: 'hurricane', since: T0 + 2 } ), { paid: HAUL_FEE, open: true } );
	check( hd.note[ 0 ].startsWith( 'Hauled your boat out ahead of the hurricane and kept her' ), 'at the dock, she only hauled her' );
	const f2 = tell( h, { paid: h.fee, fish: 5 } );
	check( f2.toast === null && f2.note.some( ( p ) => p.includes( 'gone off' ) ), 'she fetched her: she\'d have seen them' );

	// a hurricane on its way as you come back
	const news = { stage: 'warning', onset: T0 + 29, ends: T0 + 60, eye: T0 + 40, cat: 2, from: 'NNW' };
	const run = tell( off, { news, T: T0 } );
	check( run.note[ 0 ].includes( 'Category 2 hurricane coming' ) && run.note[ 0 ].includes( 'You\'ve 29 hours to run for port' ), `out on the water: "${ run.note[ 0 ]}"` );
	check( tell( off, { news: { ...news, onset: T0 + 1 }, T: T0 } ).note[ 0 ].includes( 'You\'ve 1 hour to run' ), 'an hour\'s an hour' );
	const atd = tell( awayOf( at( dock, { moored: true } ), T0 + 1, { dock, ...fairly } ), { news, T: T0 } );
	check( atd.note[ 0 ].includes( 'I\'ll haul her out' ), `at the dock: "${ atd.note[ 0 ]}"` );
	const safe = tell( h, { paid: h.fee, news, T: T0 } );
	check( safe.note[ 2 ].includes( 'safe in my yard' ), `already hauled: "${ safe.note[ 2 ]}"` );
	const on = tell( h, { paid: h.fee, news, T: T0 + 30 } );
	check( on.note[ 2 ].includes( 'on us' ), `here already: "${ on.note[ 2 ]}"` );

}

// ---- the spoiled catch
{

	const st = new GameState( null );
	st.inventory = [ { id: 1, species: 'mullet', kg: 1 }, { id: 2, species: 'mullet', kg: 2 } ];
	check( st.spoil() === 2 && st.inventory.length === 0 && st.holdKg === 0, 'the box emptied' );
	check( st.spoil() === 0, 'and an empty one\'s nothing' );

}

// ---- the group's record
{

	const now = 1e12, r = boatRecord( { name: 'Pearl', x: 500.04, z: 600.04, heading: 0.5, anchor: { x: 496.04, z: 600 }, at: now - BACK_MS - 1 } );
	check( r.v === 1 && r.n === 'Pearl' && r.x === 500 && r.a[ 0 ] === 496 && r.a[ 1 ] === 600 && r.wear === 0 && r.tow === null, 'a record: her name, her pose, her anchor, when she was left' );
	const G = keepBoat( r, { now, rate: 0.001, seconds: 10, dock } );
	check( G.wear === 0.01 && G.x === r.x && G.z === r.z && G.h === r.h && G.at === r.at, 'a storm takes a little; her pose stays' );
	check( keepBoat( r, { now, rate: 0, seconds: 10, dock } ) === r, 'fair weather changes nothing' );
	const fresh = boatRecord( { name: 'Pearl', x: 500, z: 600, heading: 0.5, anchor: { x: 496, z: 600 }, at: now - 1000 } );
	check( keepBoat( fresh, { now, warned: true, rate: 1, seconds: 10, dock } ) === fresh, 'and a reload isn\'t going away: nothing, even with a warning out' );
	const W = keepBoat( r, { now, warned: true, dock } );
	check( W.tow.why === 'hurricane' && W.tow.where === 'cradle' && W.tow.fee === towFee( W.tow.metres ) + HAUL_FEE && W.tow.at === now && W.x === r.x, 'a hurricane\'s warning: towed in, her fee and the haul-out, a note to come' );
	check( keepBoat( W, { now, warned: true, dock } ) === W, 'and once' );
	const week = keepBoat( { ...r, at: now - WEEK_MS - 1 }, { now, dock } );
	check( week.tow.why === 'week' && week.tow.where === 'dock' && week.tow.fee === towFee( week.tow.metres ), 'gone a week by the real clock: towed in' );
	const clean = cleanBoats( { a: r, b: { v: 2, x: 1, z: 1, at: 1 }, c: 'no', d: { v: 1, x: 'x', z: 1, at: 1 }, n: { ...r, a: null }, e: { ...r, wear: 9 }, f: { ...r, tow: { why: 'week', fee: 5, where: 'dock', at: now - 200 * 864e5 } }, g: { ...r, tow: { why: 'x' } } }, now );
	check( Object.keys( clean ).join() === 'a,e,g' && clean.e.wear === 1 && clean.g.tow === null, 'what\'s not a boat is dropped, a long-towed one let go' );
	check( Object.keys( cleanBoats( null ) ).length === 0, 'none' );

	// back: the group's save and your own reckoning
	const mine = awayOf( anchored( NEAR ), T0 + 2, { dock, ...fairly } );
	const withWear = withRecord( { ...mine, wear: 0.02 }, { ...r, wear: 0.05 }, dock );
	check( withWear.wear === 0.05 && withWear.where === 'anchor', 'the worse of the two (the same weather seen twice), not both' );
	const towed = withRecord( { ...mine }, W, dock );
	check( towed.where === 'cradle' && towed.fee === W.tow.fee && towed.tows.length === 1 && towed.anchor === null && towed.x === dock.x, 'a tow they saw is where she is' );
	const note = tellOf( towed, { paid: towed.fee } );
	check( note.note[ 0 ].includes( 'ahead of the hurricane' ) && note.note[ 1 ].includes( `$${ towed.fee }` ), 'and the note says where she went and what it cost' );
	check( withRecord( mine, null, dock ) === mine, 'no record: your own reckoning' );

}

// ---- Together: the shared save, the host, the sea, aboard

// (fields set in the constructor mustn't shadow its methods: the first of these, _mine, did, and no pose was sent)
{

	const src = readFileSync( new URL( '../src/together/Together.js', import.meta.url ), 'utf8' );
	const fields = new Set( [ ...src.split( 'class Together' )[ 1 ].matchAll( /this\.(\w+) = /g ) ].map( ( m ) => m[ 1 ] ) );
	const shadow = Object.getOwnPropertyNames( Together.prototype ).filter( ( m ) => fields.has( m ) && typeof Object.getOwnPropertyDescriptor( Together.prototype, m ).value === 'function' );
	check( shadow.length === 0, `none of Together's fields shadows a method${ shadow.length ? `: ${ shadow.join() }` : '' }` );

}

// All the Spaces' saved values for a group, and a session each
const group = () => {

	const v = new Map();
	return { v, shared: {
		get: async ( k ) => v.get( k ) ?? null,
		update: async ( k, fn ) => {

			const next = fn( v.has( k ) ? JSON.parse( JSON.stringify( v.get( k ) ) ) : null );
			v.set( k, JSON.parse( JSON.stringify( next ) ) );
			return v.get( k );

		},
	} };

};
const seaAt = ( h ) => ( { heightAt: ( x, z ) => h( x, z ) } );
const copy = () => ( { visible: true, position: new Vector3(), quaternion: new Quaternion(), userData: { lamps: { set() {}, removeLight() {}, dispose() {} } } } );
const rodeCopy = () => ( { visible: false, material: { dispose() {}, uniforms: { lineA: { value: new Vector3() }, lineB: { value: new Vector3() }, lineCtl: { value: new Vector3() } } } } );
const REACH = RODE_SLACK + 4; // (a stem head 4 m forward)
const player = ( g, id, { host = false, tier = 'high', waves = seaAt( () => 0.5 ) } = {} ) => {

	const t = Object.create( Together.prototype );
	const sent = [];
	t.me = { id, name: id.toUpperCase() };
	t.portal = { save: { shared: g.shared } };
	t.session = { isHost: host, send: ( k, v ) => sent.push( [ k, v ] ) };
	t.sent = sent;
	t.limits = { boats: tier === 'low' ? 1 : 6 };
	t.others = new Map();
	t.boats = {};
	t.away = new Map();
	t._boatSaved = false;
	t._boatSavedAt = 0;
	t._keepT = 0;
	t._owed = {};
	t._boatCopy = copy;
	t.app = {
		_started: true, waves, scene: { add() {}, remove() {} }, localLights: null, terrainData: { heightAt: () => - 9 },
		settings: { day: 30, timeOfDay: 10, weather: null, weatherSince: 0 }, weather: { news: null },
		weatherPick: () => null, camera: { position: new Vector3( 0, 2, 0 ) }, boat: { boardPoint: new Vector3( 0, 1, - 2 ) }, game: { toast: () => {}, rodeCopy, layRode: ( m, A ) => m.material.uniforms.lineB.value.copy( A ) },
		boatCtl: { anchor: null, driven: false, hauled: null, position: new Vector3( 300, 0, 700 ), getYaw: () => 0.7, stemHead: new Vector3( 0, 1.2, 4 ) },
		player: { riding: false, mode: 'swim', position: new Vector3(), rideOffer: null, boat: null, busy: false, exitBoat() { this.riding = false; this.exited = true; }, unride() { this.riding = false; } },
	};
	return t;

};

{

	const g = group(), a = player( g, 'a' ), b = player( g, 'b', { host: true } );
	await a.mineBoat();
	check( ! g.v.has( 'boats' ), 'no anchor down, nothing in the group\'s save' );
	a.app.boatCtl.anchor = new Vector3( 300, - 5, 700 );
	await a.mineBoat();
	const r = g.v.get( 'boats' ).a;
	check( r && r.x === 300 && r.z === 700 && r.h === 0.7 && r.a[ 0 ] === 300 && r.a[ 1 ] === 700 && r.n === 'A' && r.wear === 0 && r.tow === null, 'her anchor down, she\'s in the group\'s save: her pose, her anchor and her name' );
	const firstAt = r.at;
	await a.mineBoat();
	check( g.v.get( 'boats' ).a.at === firstAt, 'not written every time she\'s looked at' );
	a._boatSavedAt -= 6 * 60e3;
	await a.mineBoat();
	check( a._boatSavedAt > Date.now() - 1000, 'brought up to date every few minutes' );
	await a.mineBoat( true );
	check( !! g.v.get( 'boats' ).a, 'and as you go' );

	// a helm taken: gone
	a.app.boatCtl.driven = true;
	await a.mineBoat();
	check( ! g.v.get( 'boats' ).a, 'she\'s up and away: gone from the save' );
	a.app.boatCtl.driven = false;

	// someone else's record isn't touched by yours
	await g.shared.update( 'boats', ( c ) => ( { ...c, z: boatRecord( { name: 'Z', x: 1, z: 2, heading: 0, anchor: { x: 1, z: 2 }, at: 5 } ) } ) );
	await a.mineBoat( true );
	check( !! g.v.get( 'boats' ).z && !! g.v.get( 'boats' ).a, 'each has their own place in it' );

}

// the host's keeping
{

	const g = group(), host = player( g, 'h', { host: true } ), guest = player( g, 'g' ), gone = Date.now() - BACK_MS - 1000;
	await g.shared.update( 'boats', () => ( { p: boatRecord( { name: 'Pearl', x: 300, z: 700, heading: 1, anchor: { x: 296, z: 700 }, at: gone } ) } ) );
	await host._readBoats();
	await guest._readBoats();
	// fair: nothing
	host.app.settings.weather = 'fair';
	host.app.weatherPick = () => 'fair';
	host._keepBoats( 11 );
	await 0;
	check( g.v.get( 'boats' ).p.wear === 0, 'on a fair day the host writes nothing' );
	// a gale: it's written once there's some of it to write
	host.app.weatherPick = () => 'storm';
	for ( let i = 0; i < 12; i ++ ) host._keepBoats( 11 );
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	const worn = g.v.get( 'boats' ).p;
	check( worn.wear > 0 && worn.x === 300 && worn.z === 700 && worn.h === 1 && worn.at === gone, `a squall takes a little off her in the save (${ ( worn.wear * 100 ).toFixed( 2 ) }%), her pose as it was` );
	const was = g.v.get( 'boats' ).p.wear;
	guest.app.weatherPick = () => 'storm';
	for ( let i = 0; i < 12; i ++ ) guest._keepBoats( 11 );
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	check( g.v.get( 'boats' ).p.wear === was, 'a guest leaves it to the host' );
	// her owner's here
	host.others.set( 'p', { cur: null } );
	const wasHere = g.v.get( 'boats' ).p.wear;
	for ( let i = 0; i < 12; i ++ ) host._keepBoats( 11 );
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	check( g.v.get( 'boats' ).p.wear === wasHere, 'with her owner here, she\'s theirs' );
	host.others.delete( 'p' );
	// a hurricane's warning
	host.app.weather.news = { stage: 'watch', onset: 1e9 };
	host._keepBoats( 11 );
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	check( ! g.v.get( 'boats' ).p.tow, 'a watch isn\'t enough' );
	host.app.weather.news = { stage: 'warning', onset: 1e9 };
	host.app.weatherPick = () => 'fair';
	host._keepBoats( 11 );
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	const T = g.v.get( 'boats' ).p;
	check( T.tow && T.tow.why === 'hurricane' && T.tow.where === 'cradle' && T.x === 300 && T.tow.fee > HAUL_FEE, 'its warning: Marta tows her in, the tow in the save for her owner to read' );
	const sent = host.sent.filter( ( m ) => m[ 0 ] === 'boats' ).length;
	host.others.set( 'g', { cur: null } );
	await host._saveBoats( ( c ) => c );
	host.others.delete( 'g' );
	check( host.sent.filter( ( m ) => m[ 0 ] === 'boats' ).length === sent + 1 && host.sent[ host.sent.length - 1 ][ 1 ].p.tow, 'and the others told' );

	// a new absence starts clean
	await g.shared.update( 'boats', ( c ) => ( { ...c, p: boatRecord( { name: 'Pearl', x: 300, z: 700, heading: 1, anchor: { x: 296, z: 700 }, at: Date.now() } ) } ) );
	await host._readBoats();
	check( host.boats.p.wear === 0 && host.boats.p.tow === null, 'she comes back and goes again: her record starts clean, the host\'s old sums forgotten' );

}

// on your sea, and aboard
{

	const g = group(), t = player( g, 'v', { waves: seaAt( ( x, z ) => ( x - 300 ) * 0.01 + 0.5 ) } ), gone = Date.now() - BACK_MS - 1000;
	// (a wind blowing toward -z: she lies head to it, bow toward +z, her anchor ahead of her)
	Globals.windDir.value.set( 0, - 1 );
	Globals.windSpeed.value = 10;
	const reach = REACH + 0.0016 * 100;
	t.boats = { p: boatRecord( { name: 'Pearl', x: 300, z: 700 - reach + 3, heading: 2, anchor: { x: 300, z: 700 }, at: gone } ) };
	t.app.camera.position.set( 290, 2, 700 );
	t.app.player.position.set( 300, 0.6, 700 - reach - 2 );
	t.track( 1 / 60 );
	const a = t.away.get( 'p' );
	const fwd = ( q ) => new Vector3( 0, 0, 1 ).applyQuaternion( q );
	const off = ( p ) => Math.hypot( p.x - 300, p.z - 700 );
	check( a && a.boat && a.boat.visible && Math.abs( off( a.boat.position ) - reach ) < 1e-6 && a.boat.position.z < 700 && Math.abs( a.boat.position.x - 300 ) < 1, 'she\'s on your sea, downwind of her anchor by her rode and her length' );
	check( fwd( a.boat.quaternion ).z > 0.99 && Math.abs( a.heading ) < 1e-9, 'found head to the wind, whatever her heading when she was left' );
	check( Math.abs( a.boat.position.y - 0.5 ) < 0.1, 'floating at its height here (nobody\'s sending it)' );
	const up = new Vector3( 1, 0, 0 ).applyQuaternion( a.boat.quaternion );
	check( Math.abs( up.y ) > 0.005, `and leaning with the sea under her (${ up.y.toFixed( 3 ) } across her beam)` );
	const R = a.rode.material.uniforms;
	check( a.rode.visible && R.lineB.value.x === 300 && R.lineB.value.z === 700 && R.lineB.value.y === - 9, 'her rode down to her anchor on the bottom' );
	check( Math.abs( off( R.lineA.value ) - ( RODE_SLACK + 0.16 ) ) < 0.01, `from her stem head, ${ off( R.lineA.value ).toFixed( 2 ) } m off the anchor` );
	// her sheering: the bow held, the stern swinging
	const was = a.boat.position.x;
	Globals.time.value += 12;
	t.track( 1 / 60 );
	Globals.time.value -= 12;
	check( Math.abs( a.boat.position.x - was ) > 0.01 && Math.abs( off( R.lineA.value ) - ( RODE_SLACK + 0.16 ) ) < 0.01, 'she sheers about it, her bow where the rode holds it' );
	// the wind comes round: so does she, about her anchor
	Globals.windDir.value.set( 1, 0 );
	const before = a.heading;
	t.track( 1 / 60 );
	check( Math.abs( a.heading - before ) > 0 && Math.abs( a.heading - before ) < 0.02, 'the wind comes round, and she\'s slow to follow it' );
	for ( let i = 0; i < 400; i ++ ) t.track( 1 );
	const f2 = fwd( a.boat.quaternion );
	check( f2.x < - 0.99 && Math.abs( a.boat.position.x - ( 300 + reach ) ) < 0.2 && Math.abs( a.boat.position.z - 700 ) < 1, 'until she\'s head to it again, the other side of her anchor, as she goes about it' );
	check( t.boats.p.h === 2 && Math.abs( t.boats.p.z - ( 700 - reach + 3 ) ) < 0.1 && g.v.size === 0, 'her saved pose untouched, nothing written: it\'s only how she lies here' );
	// back as it was, for the boarding
	Globals.windDir.value.set( 0, - 1 );
	for ( let i = 0; i < 400; i ++ ) t.track( 1 );
	t.app.player.position.set( 300, 0.6, 700 - reach - 2 );
	t.track( 1 / 60 );
	check( t.app.player.rideOffer && t.app.player.rideOffer.name === 'Pearl', 'beside her: "Board Pearl\'s boat"' );
	check( t.boatsAbout( [] ).length === 1, 'and on the radar' );

	// aboard
	const p = t.app.player, boat = p.rideOffer.boat;
	p.riding = true;
	p.boat = boat;
	p.mode = 'deck';
	t.track( 1 / 60 );
	check( Math.abs( boat.position.x - 300 ) < 1 && boat.owner === 'p' && ! p.exited, 'aboard, you ride her where she lies' );
	check( t.ridden() === null && t.boatSound().active === false, 'her dash and engine dark: nobody at her helm' );
	// her owner's back: their pose takes over
	const o = { person: { id: 'p', name: 'Pearl' }, cur: null, boat: null, last: - Infinity, fixed: null };
	t.stale = 6;
	t._at = ( who ) => who.fixed;
	t.others.set( 'p', o );
	t.track( 1 / 60 );
	check( ! p.exited && t.away.has( 'p' ), 'her owner back, she stays till they\'ve said where she is' );
	o.last = performance.now() / 1000;
	o.fixed = { boat: { pos: new Vector3( 301, 0.4, 701 ), quat: new Quaternion(), water: null }, mode: 'deck' };
	t.track( 1 / 60 );
	t.track( 1 / 60 );
	check( ! p.exited && boat.position.x === 301 && ! t.away.has( 'p' ), 'then she goes by their pose, and you\'re still aboard' );
	t.others.delete( 'p' );
	t.track( 1 / 60 );
	check( t.away.has( 'p' ) && Math.abs( boat.position.x - 300 ) < 1 && ! p.exited, 'gone again: back to where the save has her' );
	// towed from under you
	t.boats.p = { ...t.boats.p, tow: { why: 'hurricane', fee: 60, where: 'cradle', at: Date.now() } };
	let said = '';
	t.app.game.toast = ( m ) => said = m;
	t.track( 1 / 60 );
	check( p.exited && said.includes( 'Marta\'s towed Pearl\'s boat in' ) && ! t.away.has( 'p' ), 'Marta tows her in: over the side you go, and she\'s gone' );

}

// her sheering, as measured on the high tier
{

	const measured = { 2.5: 0.44, 7: 1.12, 11: 1.54, 15: 3.38, 20: 2.82 };
	for ( const [ U, sd ] of Object.entries( measured ) ) {

		let s = 0, m = 0, n = 0;
		for ( let t = 0; t < 3000; t += 0.25 ) {

			const y = sheerAt( t, + U, 'pearl' ) * 180 / Math.PI;
			s += y * y;
			m += y;
			n ++;

		}

		const got = Math.sqrt( s / n );
		console.log( `     sheering at ${ U } m/s: ${ got.toFixed( 2 ) } deg (her physics ${ sd })` );
		check( Math.abs( got - sd ) < 0.9 && Math.abs( m / n ) < 0.1, `about the wind, by about as much as she does at ${ U } m/s` );

	}

	check( sheerAt( 100, 7, 'pearl' ) === sheerAt( 100, 7, 'pearl' ) && sheerAt( 100, 7, 'pearl' ) !== sheerAt( 100, 7, 'robin' ), 'the same on every device, and no two boats in step' );

}

// how she lies at anchor, against her own physics
{

	const { readFileSync: read } = await import( 'node:fs' );
	const { TerrainData } = await import( '../src/world/TerrainData.js' );
	const { decodeIsland } = await import( '../src/world/terrain/IslandDecode.js' );
	const { Waves } = await import( '../src/ocean/Waves.js' );
	const { WaterQuery } = await import( '../src/ocean/WaterQuery.js' );
	const { BoatModel } = await import( '../src/world/BoatModel.js' );
	const { BoatController } = await import( '../src/player/BoatController.js' );
	const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( read( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
	// (the wind first: the waves' wind sea runs with it as they're made, and a sea running against it holds her about
	// 8 degrees off it)
	Globals.windDir.value.set( 0.35, 0.94 ).normalize();
	Globals.windSpeed.value = 11;
	const w = weatherAt( 30, 'breezy' ), waves = new Waves( { tier: 'low', terrain } );
	waves.setSea( w.swell, w.windSea );
	waves.setSwell( 0, w.period, w.period, { x: 65, z: 560 } );
	const query = new WaterQuery( waves, terrain ), b = new BoatController( { model: new BoatModel(), query, terrain, colliders: null } );
	const wd = Globals.windDir.value;
	b.moored = false;
	b.driven = false;
	b.position.set( 65, 0, 700 );
	b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), Math.atan2( wd.x, wd.y ) + Math.PI / 2 ); // (beam-on to it)
	const stem = b.toWorld( b.stemHead, new Vector3() );
	b.anchor = new Vector3( stem.x, - 15, stem.z );
	const dt = 1 / 60;
	let by = null;
	const lie = anchorLie( stem.x, stem.z, wd.x, wd.y, 11, RODE_SLACK + b.stemHead.z ), off = () => {

		const d = b.getYaw() - lie.heading;
		return Math.abs( Math.atan2( Math.sin( d ), Math.cos( d ) ) );

	};
	for ( let i = 0; i < 240 * 60; i ++ ) {

		Globals.time.value += dt;
		b.queueQueries();
		query.update();
		b.setInput( 0, 0, dt );
		b.update( dt );
		if ( by === null && off() < 20 * Math.PI / 180 ) by = i * dt;

	}
	const gap = Math.hypot( b.position.x - lie.x, b.position.z - lie.z );
	console.log( `     her physics at 11 m/s: head to it by ${ by && by.toFixed( 0 ) } s, ${ ( off() * 180 / Math.PI ).toFixed( 1 ) } deg off, ${ gap.toFixed( 2 ) } m from where she's drawn` );
	check( off() < 5 * Math.PI / 180 && gap < 0.6, 'where she\'s drawn is where she lies at anchor' );
	check( by !== null && Math.abs( by - Math.log( 90 / 20 ) / swingRate( 11 ) ) < 12, 'and she comes round as fast' );

}

// the note waits for the room: its hurricane is the one about in the room you've come to
{

	const shown = [], s = { day: 30, timeOfDay: 10 };
	const story = awayOf( anchored( NEAR ), T0 + 1, { dock, ...fairly } );
	const g = Object.create( Game.prototype );
	const known = { roomKnown: false };
	g.awayTold = { story, paid: 0, hull: 0, fish: 0, from: NEAR };
	g.hud = { showAwayNote: ( n ) => shown.push( n ) };
	g.toast = () => {};
	Object.defineProperty( g, 'weatherNow', { value: null } );
	Object.defineProperty( g, 'hour', { get: () => s.timeOfDay } );
	g.app = { _started: true, together: known, settings: s, weather: { news: { stage: 'warning', onset: islandTime( 30, 10 ) + 9, cat: 1, from: 'N' } }, portal: {} };
	g.tellAway();
	check( shown.length === 0 && g.awayTold, 'in a room, the note waits until its clock has reached you' );
	s.day = 90;
	g.app.weather.news = null;
	known.roomKnown = true;
	g.tellAway();
	check( shown.length === 0 && ! g.awayTold, 'the room\'s day has no hurricane: none said, whatever your own clock had' );
	g.awayTold = { story, paid: 0, hull: 0, fish: 0, from: NEAR };
	g.app.weather.news = { stage: 'warning', onset: islandTime( 90, 10 ) + 9, cat: 1, from: 'N' };
	g.tellAway();
	check( shown.length === 1 && shown[ 0 ][ 0 ].includes( 'You\'ve 9 hours to run for port' ), `the room's has: "${ shown[ 0 ] && shown[ 0 ][ 0 ] }"` );
	// Marta's hours: the stall's own flag is open until it's told otherwise, on the first frame
	let back = 0;
	const h = Object.create( Game.prototype );
	Object.defineProperty( h, 'weatherNow', { value: null } );
	const hs = { day: 33, timeOfDay: 20.6 };
	Object.defineProperty( h, 'hour', { get: () => hs.timeOfDay } );
	h.state = { hauled: true };
	h.relaunch = () => back ++;
	h.chandlery = { vendor: { open: true } };
	h._hurricaneSaid = null;
	h.app = { weather: { news: null }, settings: hs };
	h.updateHurricane();
	check( back === 0 && ! h.martaIn, 'hauled out and it\'s gone by, she stays on her cradle by night' );
	hs.timeOfDay = 8;
	h.updateHurricane();
	check( back === 1 && h.martaIn, 'and Marta puts her back in once she\'s in' );

}

// the device's few, and whose
{

	const g = group(), t = player( g, 'v', { tier: 'low' } ), gone = Date.now() - BACK_MS - 1000;
	t.boats = { far: boatRecord( { name: 'F', x: 900, z: 0, heading: 0, anchor: { x: 900, z: 0 }, at: gone } ), near: boatRecord( { name: 'N', x: 90, z: 0, heading: 0, anchor: { x: 90, z: 0 }, at: gone } ), v: boatRecord( { name: 'V', x: 10, z: 0, heading: 0, anchor: { x: 10, z: 0 }, at: gone } ) };
	t.track( 1 / 60 );
	check( t.away.get( 'near' ).boat.visible && ! t.away.get( 'far' ).boat && ! t.away.has( 'v' ), 'on a phone the nearest one, and never your own' );
	t._liveBoats = 1;
	t.track( 1 / 60 );
	check( ! t.away.get( 'near' ).boat.visible, 'and someone out in theirs comes first' );
	t._liveBoats = 0;
	t.app._started = false;
	t.boats = { near: t.boats.near };
	t.away.clear();
	t.track( 1 / 60 );
	check( t.away.size === 0, 'none drawn before the game\'s started (the load\'s shaders)' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
