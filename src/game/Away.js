import { weatherHere, hurricaneNews, towardOf, squallWind, gustShare } from './Weather.js';
import { secondsBetween, timeText } from './IslandClock.js';
import { stormWear, STORM_FROM } from './Hull.js';
import { awayTowFee, HAUL_FEE } from './Gear.js';
import { HOURS } from './Orders.js';
import { feet } from './Units.js';

// (M15) Picking up where you left off: what happened to your boat while you were away, worked out when you're
// back, from where she was left and the island's weather since (the same for everyone, and it goes on without
// you). Reckoned in the island's hours, each costing her what it would have had you stayed and watched the clock
// run (its seconds of play: secondsBetween), so a storm you missed is the storm you'd have seen. Pure (no
// three.js), for the tests under Node.
//   awayClock( hour, day, at, now ) -> { hour, day }   (on your own: the clock goes on at the real world's pace)
//   leftOf( text ) -> left | null   boatLeft( ... ) -> left   (the personal save's 'boat')
//   awayOf( left, T, env ) -> story   (what happened to her)
//   tellOf( story, { paid, hull, T, ... } ) -> { note: [ paragraphs ] | null, toast }   (Marta's note)
//   (playing together: the group's shared save, 'boats')
//   boatRecord( ... ) -> record   cleanBoats( raw ) -> { id: record }   keepBoat( record, ... ) -> record
//   driftOf( record, T, env ) -> story   (one left with no anchor out)
//   anchorLie( ax, az, wx, wz, U, off ) -> { x, z, heading, reach }   swingRate( U ) -> /s   sheerAt( t, U, id ) -> rad
//   (how she lies at anchor)
//   withRecord( story, record, dock ) -> story   (what the others' weather did to her, into your own reckoning)

// how long the catch keeps in the box, in the island's hours: with no ice (M16 sells it) and the box at the sea's
// 28 C, fish are off within about half a day (the FDA wants them iced within 6 to 9 hours of the catch)
export const KEEP_H = 12;
// left out (at anchor or adrift) this long, Marta brings her in, so the sea doesn't fill with the boats of those
// who've stopped coming: in the island's hours on your own, in real time in the group's save (a person's week)
export const WEEK_H = 7 * 24;
export const WEEK_MS = 7 * 24 * 3600e3;
// adrift within sight of the island (m from its middle), she's seen and fetched after this many of Marta's working
// hours. Past it she drifts on until the week's up
export const FOUND_H = 1;
export const FOUND_M = 3000;
export const ISLE = { x: 30, z: - 320 };
// how fast she drifts with nobody at her helm, of the wind's speed, and how she lies: measured from her own physics
// (BoatController, in the CPU's sea: 4.9 to 5.5% from a fair day to a gale, beam-on to it). As real small boats do
export const DRIFT = 0.05;
export const AGROUND = 1; // m of water: she's touching (her draught)
// gone less than this (real ms), you've not been away: a reload, a dropped connection
export const BACK_MS = 5 * 60e3;
const STEP_H = 0.25; // island hours between looks
const LONGEST_H = 60 * 24; // reckoned this far, at most (a few milliseconds)
const GUST_N = 8; // (samples of the gusts between a lull and a gust)
// (a towed record's kept this long for its owner to read, then let go)
const TOW_KEPT_MS = 180 * 24 * 3600e3;

const dayHour = ( T ) => {

	const day = Math.floor( T / 24 );
	return { day: day + 1, hour: T - day * 24 };

};
// the seconds of play from island time T0 to T1 (the night passes quicker)
const playSeconds = ( T0, T1 ) => {

	const a = dayHour( T0 ), b = dayHour( T1 );
	return secondsBetween( a.hour, a.day, b.hour, b.day );

};

// (on your own) the clock you come back to: as you left it (hour, day, at: ms since 1970), on by the real time
// you've been gone, an island hour a real hour
export function awayClock( hour, day, at, now = Date.now() ) {

	const gone = Number.isFinite( at ) ? Math.max( 0, ( now - at ) / 3600e3 ) : 0;
	return dayHour( ( day - 1 ) * 24 + hour + gone );

}

// what a storm takes off her a second, unattended, as Hull.stormWear in the gusts the wind's blowing in (between a
// lull and a gust, WeatherDriver.windAt: w, the weather where she lies). A squall's gusts take a little
export function wearRate( w ) {

	const U = squallWind( w ), g = gustShare( w );
	if ( U * ( 1 + g ) <= STORM_FROM ) return 0;
	let s = 0;
	for ( let i = 0; i < GUST_N; i ++ ) s += stormWear( U * ( 1 + g * ( ( i + 0.5 ) / GUST_N * 2 - 1 ) ) );
	return s / GUST_N;

}

// a personal save's boat ({ x, z, h: heading, anchor: [ x, z ] | null, moored, aboard: 'deck' | 'helm' | null,
// T: the island's time, at: ms since 1970 })
export const boatLeft = ( { x, z, heading, anchor, moored, aboard, T, at } ) => ( {
	v: 1, x: round( x ), z: round( z ), h: Math.round( heading * 1000 ) / 1000, anchor: anchor ? [ round( anchor.x ), round( anchor.z ) ] : null, moored: !! moored, aboard: aboard === 'deck' || aboard === 'helm' ? aboard : null, T: Math.round( T * 1000 ) / 1000, at,
} );
const round = ( v ) => Math.round( v * 10 ) / 10;

// the save's boat as it's reckoned from, or null if there's none (or it's not one)
export function leftOf( text ) {

	let d = null;
	try {

		d = typeof text === 'string' ? JSON.parse( text ) : text;

	} catch { /* none */ }

	if ( ! d || d.v !== 1 || ! Number.isFinite( d.x ) || ! Number.isFinite( d.z ) || ! Number.isFinite( d.T ) ) return null;
	const A = Array.isArray( d.anchor ) && d.anchor.length === 2 && d.anchor.every( Number.isFinite ) ? { x: d.anchor[ 0 ], z: d.anchor[ 1 ] } : null;
	return { x: d.x, z: d.z, heading: Number.isFinite( d.h ) ? d.h : 0, anchor: A, moored: d.moored === true, aboard: d.aboard === 'deck' || d.aboard === 'helm' ? d.aboard : null, T: d.T, at: Number.isFinite( d.at ) ? d.at : null };

}

// What happened to her between the island's time she was left (left.T) and T. left: leftOf's, and hauled (on
// Marta's cradle). env: dock { x, z } (required), and the weather picked ( pick, since ), the water's depth ( depth(
// x, z ) -> m ), and for the tests weather( T, x, z ), news( T ), fee( m ), haul.
// -> { hours, spoiled, wear, kind (the worst weather she rode out, its id), tows: [ { why: 'adrift' | 'aground' |
// 'week' | 'hurricane', x, z (where she was), metres (from the dock), fee, where: 'dock' | 'cradle', out (she
// had to be fetched) } ], fee, where: 'dock' | 'cradle' | 'anchor' | 'adrift' | 'aground', x, z, heading, anchor }
export function awayOf( left, T, env ) {

	const { dock, pick = null, since = 0, depth = () => Infinity, fee = awayTowFee, haul = HAUL_FEE } = env;
	const weather = env.weather || ( ( t, x, z ) => weatherHere( t, pick, since, x, z ) );
	const newsAt = env.news || ( ( t ) => hurricaneNews( t, pick, since ) );
	const hours = Math.max( 0, T - left.T );
	const story = { hours, spoiled: hours >= KEEP_H, wear: 0, kind: null, tows: [], fee: 0, where: left.hauled ? 'cradle' : left.moored ? 'dock' : left.anchor ? 'anchor' : 'adrift', x: left.x, z: left.z, heading: left.heading, anchor: left.anchor };
	if ( story.where === 'adrift' && depth( left.x, left.z ) < AGROUND ) story.where = 'aground';
	const span = Math.min( hours, LONGEST_H ), n = Math.ceil( span / STEP_H );
	if ( ! n ) return story;
	const dt = span / n;
	let seen = 0, worst = 0;
	// she's fetched: from where she lies, to the dock or Marta's cradle
	const tow = ( why, where, cost ) => {

		const metres = Math.hypot( story.x - dock.x, story.z - dock.z ), out = story.where !== 'dock';
		const f = ( out ? fee( metres ) : 0 ) + cost;
		story.tows.push( { why, x: story.x, z: story.z, metres, fee: f, where, out } );
		story.fee += f;
		story.where = where;
		story.x = dock.x;
		story.z = dock.z;
		story.anchor = null;

	};

	const toward = { x: 0, y: 0 };
	for ( let i = 0; i < n; i ++ ) {

		const t = left.T + i * dt, w0 = story.where;
		if ( w0 === 'cradle' ) break; // (out of it: Marta puts her back once it's gone by, with you here: Game.updateHurricane)
		// a hurricane's warning, or one here: Marta brings her in and hauls her out, for her fee
		const news = newsAt( t );
		if ( news && ( news.stage === 'warning' || t >= news.onset ) ) {

			tow( 'hurricane', 'cradle', haul );
			break;

		}

		// gone a week
		if ( w0 !== 'dock' && t - left.T >= WEEK_H ) {

			tow( 'week', 'dock', 0 );
			continue;

		}

		const w = weather( t, story.x, story.z ), s = playSeconds( t, t + dt ), rate = wearRate( w );
		story.wear = Math.min( 1, story.wear + rate * s );
		if ( rate > worst ) {

			worst = rate;
			story.kind = w.id || null;

		}

		if ( w0 === 'adrift' ) {

			// she lies beam-on, and goes with the wind
			towardOf( w.windAngle || 0, toward );
			const d = DRIFT * squallWind( w ) * s;
			story.x += toward.x * d;
			story.z += toward.y * d;
			story.heading = Math.atan2( toward.x, toward.y ) - Math.PI / 2;
			if ( depth( story.x, story.z ) < AGROUND ) story.where = 'aground';

		}

		// seen, in Marta's working hours, from the shore
		if ( story.where === 'adrift' || story.where === 'aground' ) {

			const h = dayHour( t ).hour;
			if ( h >= HOURS.marta[ 0 ] && h < HOURS.marta[ 1 ] && Math.hypot( story.x - ISLE.x, story.z - ISLE.z ) < FOUND_M ) seen += dt;
			if ( seen >= FOUND_H ) tow( story.where, 'dock', 0 );

		}

	}

	return story;

}

const WINDS = [ 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west' ];
// which side of the island ( x, z ) is (x east, z south)
const sideOf = ( x, z ) => WINDS[ ( ( Math.round( Math.atan2( x - ISLE.x, ISLE.z - z ) / ( Math.PI / 4 ) ) % 8 ) + 8 ) % 8 ];
const STORMS = { gale: 'the gale', storm: 'a thunderstorm', hurricane: 'the hurricane', blustery: 'a blow', southerly: 'the gale' };
const WORN_SAID = 0.005; // (the hull's worn this much for it to be worth a line)
const DRIFT_SAID = 50; // (and she's drifted this far, m)

// Marta's note on what happened (its paragraphs, or null with nothing to say), and what's told apart from it (the
// fish gone off in a box she never had reason to open). story: awayOf's. paid: what she took of its fee; hull: her
// wear now; fish: how many went off; T: the island's time; news: a hurricane about now (Weather.hurricaneNews), or
// null; open: Marta's at her stall now; locale; from: where she was left ({ x, z }: how far she's drifted). She signs
// it: GameHUD's note
export function tellOf( story, { paid = 0, hull = 0, fish = 0, T = 0, news = null, open = true, locale = undefined, from = {} } = {} ) {

	const note = [], tows = story.tows;
	for ( const t of tows ) {

		const far = Math.hypot( t.x - ISLE.x, t.z - ISLE.z ) > FOUND_M;
		const out = far ? `${ milesOf( t.metres ) } out to the ${ sideOf( t.x, t.z ) }` : `off the ${ sideOf( t.x, t.z ) } side`;
		// (gone by already, and she's back in, or will be once Marta next opens: Game.updateHurricane)
		const did = t.out ? 'Towed your boat in' : 'Hauled your boat out';
		if ( t.why === 'hurricane' ) note.push( news ? `${ did } ahead of the hurricane. She's up on blocks in my yard till it's gone by.` : `${ did } ahead of the hurricane and kept her up on blocks in my yard till it had gone by. ${ open ? 'She\'s back in at my dock.' : 'I\'ll put her back in at my dock when I next open.' }` );
		else if ( t.why === 'week' ) note.push( 'Your boat lay out there a week with nobody aboard, so I brought her in. She\'s at my dock.' );
		else if ( t.why === 'aground' ) note.push( `Found your boat ashore on the ${ sideOf( t.x, t.z ) } side and pulled her off. She's at my dock.` );
		else note.push( `Found your boat adrift ${ out } and towed her in. She's at my dock.` );

	}

	if ( story.fee > 0 ) note.push( paid >= story.fee ? `$${ story.fee }, out of what you had.` : paid > 0 ? `That's $${ story.fee }. You had $${ paid }, so I took that.` : `That's $${ story.fee }, and you'd nothing to take it from. We'll call it square.` );
	if ( story.wear >= WORN_SAID ) {

		const storm = STORMS[ story.kind ] || 'a squall', pct = Math.max( 1, Math.round( hull * 100 ) );
		const place = story.where === 'anchor' ? ' at anchor' : story.where === 'dock' && ! tows.length ? ' at my dock' : '';
		const rode = tows.length ? `${ storm[ 0 ].toUpperCase() }${ storm.slice( 1 ) } knocked her about before that` : `Your boat rode out ${ storm }${ place }`;
		note.push( `${ rode }: the hull's ${ pct }% worn. Bring her round and I'll see to it.` );

	}

	// (she'd have seen them, fetching her)
	const apart = [];
	if ( fish > 0 ) {

		if ( tows.length ) note.push( 'The fish in your box had gone off, so over the side they went.' );
		else apart.push( 'The fish in your box had gone off while you were away · over the side they went' );

	}

	// (out of her sight: you find her where she's got to)
	if ( ! tows.length && story.where === 'aground' ) apart.push( 'Your boat drifted ashore while you were away' );
	else if ( ! tows.length && story.where === 'adrift' && Number.isFinite( from.x ) ) {

		const dx = story.x - from.x, dz = story.z - from.z, m = Math.hypot( dx, dz );
		if ( m >= DRIFT_SAID ) apart.push( `Your boat drifted ${ milesOf( m ) } to the ${ WINDS[ ( ( Math.round( Math.atan2( dx, - dz ) / ( Math.PI / 4 ) ) % 8 ) + 8 ) % 8 ] } while you were away` );

	}

	// a hurricane about, and how long you've got
	if ( news ) {

		const said = hurricaneSaid( news, story.where, T, locale );
		if ( said ) note.push( said );

	}

	return { note: note.length ? note : null, toast: apart.length ? apart.join( ' · ' ) : null };

}

// what she says of a hurricane about as you come back: where it is, and how long to run for port (the island's
// hours to its tropical-storm winds)
function hurricaneSaid( news, where, T, locale ) {

	const cat = news.cat ? `Category ${ news.cat } hurricane` : 'hurricane';
	const safe = where === 'cradle' ? 'Your boat\'s safe in my yard. Get yourself to the shelter when it comes.' : null;
	if ( T >= news.onset ) return `The ${ cat }'s on us. ${ safe || 'Get yourself to the shelter.' }`;
	const hrs = Math.max( 1, Math.round( news.onset - T ) ), days = Math.floor( news.onset / 24 ) - Math.floor( T / 24 );
	const when = `${ timeText( ( ( news.onset % 24 ) + 24 ) % 24, locale, 30 ) }${ days === 1 ? ' tomorrow' : days > 1 ? ` on day ${ Math.floor( news.onset / 24 ) + 1 }` : '' }`;
	const lead = `There's a ${ cat } coming, its winds due by ${ when }.`, left = `You've ${ hrs } hour${ hrs === 1 ? '' : 's' }`;
	if ( safe ) return `${ lead } ${ safe }`;
	if ( where === 'dock' ) return `${ lead } ${ left }. Come and see me and I'll haul her out.`;
	return `${ lead } ${ left } to run for port.`;

}

// a distance at sea, in nautical miles as it's said ('half a mile', '3 miles'; feet close to)
function milesOf( m ) {

	if ( m < 500 ) return feet( m );
	if ( m < 1400 ) return 'half a mile';
	if ( m < 2300 ) return 'a mile';
	return `${ Math.round( m / 1852 ) } miles`;

}

// ---- playing together: anchored boats whose owners are away, in the group's shared save.
// portal.save.shared 'boats': { [ owner's id ]: { v: 1, n: their name, x, z, h: heading (rad), a: [ x, z ] where her
// anchor lies, or null with T: the island's time she was left, adrift, at: ms they were last here with her, wear: what the weather's taken off her hull since
// (0..1), tow: null | { why: 'hurricane' | 'week', x, z, metres, fee, where: 'cradle' | 'dock', out, at: ms } } }.
// Only ever written by her owner (her pose and her anchor: when she's anchored, while they're here, and as they
// leave) and the host in their absence (her wear and her tow, never her pose). Each device draws her from it, on its
// own sea, lying to its own wind from where her anchor is.

export const boatRecord = ( { name, x, z, heading, anchor, at, T } ) => ( { v: 1, n: String( name || '' ).slice( 0, 40 ), x: round( x ), z: round( z ), h: Math.round( heading * 1000 ) / 1000, a: anchor ? [ round( anchor.x ), round( anchor.z ) ] : null, ...( anchor ? {} : { T } ), at, wear: 0, tow: null } );

// How she lies at anchor in a steady wind blowing toward ( wx, wz ) at U m/s: head to it, her bow downwind of the
// anchor by the rode's slack and its stretch. off: her origin's distance from the anchor with no stretch (the slack,
// and her stem head forward of her origin). Measured from her own physics (BoatController, in the CPU's sea, 2.5 to
// 20 m/s: on average within 5 degrees of the wind, the calmer the further, her bow 4.0 to 4.6 m off, the stretch as
// the wind's push, U^2).
// -> { x, z, heading, reach: her origin's distance from the anchor }
export function anchorLie( ax, az, wx, wz, U, off ) {

	const reach = off + 0.0016 * U * U;
	return { x: ax + wx * reach, z: az + wz * reach, heading: Math.atan2( - wx, - wz ), reach };

}

// how fast she comes round to it (a share of the way, a second): beam-on to within 20 degrees of it took her 370 / U
// seconds in the same measurements, at any wind
export const swingRate = ( U ) => Math.max( U, 1 ) / 250;

// How far she's sheered off it just now (rad), the bow held by the rode and the stern swinging: over her own physics
// on the high tier, a slow wander of about 45 s and a quicker one of about 10 s, the two together a standard deviation
// of 0.17 degrees for each m/s of wind, up to 3. t: the waves' time, so it's the same on every device; id: her
// owner's, so no two boats sheer in step
const SHEER = [ 47, 9.7 ], SHEER_QUICK = 0.8, SHEER_NORM = Math.sqrt( ( 1 + SHEER_QUICK * SHEER_QUICK ) / 2 );
export function sheerAt( t, U, id = '' ) {

	let seed = 0;
	for ( let i = 0; i < id.length; i ++ ) seed = ( seed * 31 + id.charCodeAt( i ) ) % 997;
	const sd = Math.min( 3, 0.17 * U ) * Math.PI / 180 / SHEER_NORM;
	return sd * ( Math.sin( 2 * Math.PI * t / SHEER[ 0 ] + seed ) + SHEER_QUICK * Math.sin( 2 * Math.PI * t / SHEER[ 1 ] + seed * 2.3 ) );

}

// the shared save's boats, as far as they're boats (others' saves, of any version)
export function cleanBoats( raw, now = Date.now() ) {

	const out = {};
	if ( ! raw || typeof raw !== 'object' ) return out;
	for ( const [ id, r ] of Object.entries( raw ) ) {

		if ( ! r || r.v !== 1 || ! Number.isFinite( r.x ) || ! Number.isFinite( r.z ) || ! Number.isFinite( r.at ) ) continue;
		// (her anchor, or with none out the island's time she was left: adrift)
		const A = Array.isArray( r.a ) && r.a.length === 2 && r.a.every( Number.isFinite ) ? [ r.a[ 0 ], r.a[ 1 ] ] : null;
		if ( ! A && ! Number.isFinite( r.T ) ) continue;
		const t = r.tow && typeof r.tow === 'object' && Number.isFinite( r.tow.fee ) && ( r.tow.where === 'dock' || r.tow.where === 'cradle' ) ? r.tow : null;
		// (long towed, and they've not been back: let go)
		if ( t && Number.isFinite( t.at ) && now - t.at > TOW_KEPT_MS ) continue;
		out[ id ] = { v: 1, n: typeof r.n === 'string' ? r.n : '', x: r.x, z: r.z, h: Number.isFinite( r.h ) ? r.h : 0, a: A, ...( A ? {} : { T: r.T } ), at: r.at, wear: Number.isFinite( r.wear ) ? Math.min( 1, Math.max( 0, r.wear ) ) : 0, tow: t };

	}

	return out;

}

// An away boat with no anchor out: what's become of her by the island's time T, as her owner's own reckoning has it when
// they're back (awayOf). The same on every device in a room, whose clock and weather are one; a room on another day
// has her elsewhere, as it has the rest of its day. r: a record with T. env: awayOf's.
export const driftOf = ( r, T, env ) => awayOf( { x: r.x, z: r.z, heading: r.h, anchor: null, moored: false, hauled: false, T: r.T }, T, env );

// The host's look at an away boat: its record, or a new one if something's happened. warned: a hurricane's warning
// is out in this room (Marta tows her in, for her fee and the haul-out); gone a week by the real clock (she
// brings her in); else the weather here takes its toll over `seconds` of play. rate: wearRate at her. A boat's
// pose is never touched: it's her owner's. drift: adrift, driftOf's: she's towed from where she's got to, and when
// it has her found
export function keepBoat( r, { now = Date.now(), warned = false, rate = 0, seconds = 0, dock, fee = awayTowFee, haul = HAUL_FEE, drift = null } ) {

	if ( r.tow || now - r.at < BACK_MS ) return r;
	if ( drift && drift.tows.length ) return { ...r, tow: { ...drift.tows[ 0 ], at: now } };
	const x = drift ? drift.x : r.x, z = drift ? drift.z : r.z, metres = Math.hypot( x - dock.x, z - dock.z );
	if ( warned ) return { ...r, tow: { why: 'hurricane', x, z, metres, fee: fee( metres ) + haul, where: 'cradle', out: true, at: now } };
	if ( now - r.at >= WEEK_MS ) return { ...r, tow: { why: 'week', x, z, metres, fee: fee( metres ), where: 'dock', out: true, at: now } };
	const add = rate * seconds;
	return add > 0 ? { ...r, wear: Math.min( 1, r.wear + add ) } : r;

}

// Your own reckoning with what the group's save says happened: the same weather seen twice over (they kept her
// while you were gone, and you've reckoned the time you were gone), so the worse of the two wears, not both; and a
// tow they saw is where she is, whatever you've reckoned
export function withRecord( story, r, dock ) {

	if ( ! r ) return story;
	story.wear = Math.max( story.wear, r.wear || 0 );
	if ( r.wear > 0 && ! story.kind ) story.kind = 'storm';
	if ( r.tow ) {

		story.tows = [ r.tow ];
		story.fee = r.tow.fee;
		story.where = r.tow.where;
		story.x = dock.x;
		story.z = dock.z;
		story.anchor = null;

	}

	return story;

}
