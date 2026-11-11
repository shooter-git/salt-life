// (after M17) Plain-node tests of the tide and the moon as the clock tells them (game/TideMoon.js, game/TimeHUD.js): the
// moon's name at each quarter and between, springs and neaps, the clock's tide marker rising, falling and at slack, the
// night icon's phase and tilt, tonight dark or bright, and the panel's line for right now at the pier's turn, on the
// flats' flood and before the bonefish's spawning dusk. And that what the panel says the tide and the moon do is what
// the game's own rules do (Tide.TIDE_BITES, Flats.spawning, the swordfish's depths, the hatchlings' sea glow).
import { moonAt, tideTurns, timeText, SYNODIC } from '../src/game/IslandClock.js';
import { stageOf, tidesOf, datumFeet, TIDE_BITES } from '../src/world/shore/Tide.js';
import { spawning, FLATS_FISH } from '../src/game/Flats.js';
import { seaGlow } from '../src/game/Turtles.js';
import {
	moonName, moonNext, moonFace, moonIcon, springsOf, tideMarker, tonight, nowLines, tideMoon, tideBitesNow, swordfishShare,
	spawnNext, TIDE_AGE, SLACK, WELL, NAMED_DAYS, NEW_LIT, GLOW, WHAT_THEY_DO,
} from '../src/game/TideMoon.js';
import { tideMoonHtml, TM_PARTS } from '../src/game/TimeHUD.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const L = 'en-US';
const islandHour = ( T ) => ( ( T % 24 ) + 24 ) % 24;
// the first island time from T0 on, a step at a time, where f holds (null within `to` hours)
const find = ( f, T0 = 0, to = 24 * 60, step = 0.25 ) => {

	for ( let T = T0; T < T0 + to; T += step ) if ( f( T ) ) return T;
	return null;

};

// ---- the moon's name: each principal phase within a day of it, a crescent or a gibbous moon between
{

	const at = { 0: 'New moon', 0.125: 'Waxing crescent', 0.25: 'First quarter', 0.375: 'Waxing gibbous', 0.5: 'Full moon', 0.625: 'Waning gibbous', 0.75: 'Last quarter', 0.875: 'Waning crescent', 0.999: 'New moon' };
	ok( Object.entries( at ).every( ( [ p, n ] ) => moonName( Number( p ) ) === n ), `named at each quarter and between: ${ Object.keys( at ).map( ( p ) => moonName( Number( p ) ) ).join( ', ' ) }` );
	const day = 1 / SYNODIC;
	ok( moonName( 0.5 - 0.9 * NAMED_DAYS * day ) === 'Full moon' && moonName( 0.5 + 0.9 * NAMED_DAYS * day ) === 'Full moon' && moonName( 0.5 - 1.2 * NAMED_DAYS * day ) === 'Waxing gibbous' && moonName( 0.5 + 1.2 * NAMED_DAYS * day ) === 'Waning gibbous', 'the full moon a day either side of it, gibbous past that' );
	ok( moonName( 0.25 + 1.2 * day ) === 'Waxing gibbous' && moonName( 0.25 - 1.2 * day ) === 'Waxing crescent' && moonName( 0.75 + 1.2 * day ) === 'Waning crescent', 'a quarter the same, a gibbous or crescent moon a little further' );
	// (and on the island's own moon, the first night's: a first-quarter moon on the first evening, as IslandClock has it)
	ok( moonName( moonAt( 20 ).phase ) === 'First quarter', `the island's first evening: "${ moonName( moonAt( 20 ).phase ) }"` );
	// the next new or full moon
	const Tfull = find( ( T ) => Math.abs( moonAt( T ).phase - 0.5 ) < 0.002 );
	const n3 = moonNext( Tfull - 3 * 24 - 2 ), n0 = moonNext( Tfull + 3 );
	ok( n3.full && n3.text === 'full moon in 3 days' && ! n0.full && /^new moon in 1[45] days$/.test( n0.text ), `the next of them: "${ n3.text }", and just past full "${ n0.text }"` );
	ok( /^exactly full (today|tonight|tomorrow)$/.test( moonNext( Tfull - 12 ).text ), `already called full: "${ moonNext( Tfull - 12 ).text }"` );

}

// ---- springs and neaps: a day after new and full moon, and after the quarters, from the tide's own constituents
{

	ok( TIDE_AGE > 0.9 && TIDE_AGE < 1.2, `the tide's age: springs ${ TIDE_AGE.toFixed( 2 ) } days after new and full moon (S2's lag on M2)` );
	const syzygy = find( ( T ) => Math.min( moonAt( T ).phase, 1 - moonAt( T ).phase ) < 0.002 ), quarter = find( ( T ) => Math.abs( moonAt( T ).phase - 0.25 ) < 0.002 );
	ok( springsOf( syzygy + TIDE_AGE * 24 ).kind === 'springs' && springsOf( quarter + TIDE_AGE * 24 ).kind === 'neaps' && springsOf( ( syzygy + quarter ) / 2 + TIDE_AGE * 24 ).kind === 'between', 'springs a day after new moon, neaps a day after the first quarter, between them between' );
	// over a year of island days, springs' tides are bigger than neaps' (the moon's distance moves them too: on average)
	const range = { springs: [], neaps: [], between: [] };
	for ( let d = 1; d <= 365; d ++ ) {

		const t = tidesOf( d ), h = t.map( ( x ) => x.height );
		range[ springsOf( ( d - 1 ) * 24 + 12 ).kind ].push( Math.max( ...h ) - Math.min( ...h ) );

	}
	const mean = ( a ) => a.reduce( ( s, x ) => s + x, 0 ) / a.length;
	ok( mean( range.springs ) > mean( range.between ) && mean( range.between ) > mean( range.neaps ) && mean( range.springs ) > 1.25 * mean( range.neaps ), `the day's range on average: springs ${ mean( range.springs ).toFixed( 2 ) } m, between ${ mean( range.between ).toFixed( 2 ) }, neaps ${ mean( range.neaps ).toFixed( 2 ) }` );

}

// ---- the clock's tide marker: rising to the next high, falling to the next low, slack water near a turn
{

	const st = {};
	const up = find( ( T ) => ( stageOf( T, st ), st.rate > 0 && st.turn < SLACK ), 9 ), down = find( ( T ) => ( stageOf( T, st ), st.rate < 0 && st.turn < SLACK ), 9 );
	const mu = tideMarker( up, L ), md = tideMarker( down, L ), nu = stageOf( up, {} ).next, nd = stageOf( down, {} ).next;
	ok( mu.dir === 'up' && mu.text === `high ${ timeText( nu.T % 24, L, 1 ) }` && nu.high && mu.label === `Tide rising, high at ${ timeText( nu.T % 24, L, 1 ) }`, `rising: "${ mu.text }" (${ mu.label })` );
	ok( md.dir === 'down' && md.text === `low ${ timeText( nd.T % 24, L, 1 ) }` && ! nd.high, `falling: "${ md.text }"` );
	// at each turn over a few days, slack: at that turn, high or low
	let slack = 0, n = 0, far = 0;
	for ( const t of tideTurns( 24, 24 * 5 ) ) {

		n ++;
		const m = tideMarker( t.T + 0.2, L ), m2 = tideMarker( t.T - 0.2, L );
		if ( m.dir === 'slack' && m2.dir === 'slack' && m.text === `slack at ${ t.high ? 'high' : 'low' }` && m2.text === m.text ) slack ++;
		if ( tideMarker( t.T + 2, L ).dir === 'slack' || tideMarker( t.T - 2, L ).dir === 'slack' ) far ++;

	}
	ok( slack === n && far === 0, `slack at each of ${ n } turns (${ slack }), "slack at high" or "at low"; never two hours off one (${ far })` );
	// in a 24-hour locale, its time as the clock's
	ok( /^high \d{2}:\d{2}$/.test( tideMarker( up, 'en-GB' ).text ), `in another locale: "${ tideMarker( up, 'en-GB' ).text }"` );

}

// ---- the night icon: the moon at its phase, its lit side to the sun as it hangs in the island's sky
{

	const svg = ( lit, angle = 0, up = true ) => moonIcon( { lit, angle, up } );
	ok( ! /<path/.test( svg( 0.01 ) ) && /stroke-opacity/.test( svg( 0.01 ) ), 'a new moon: a dark disc and its rim' );
	ok( ! /<path/.test( svg( 0.99 ) ) && /r="5.8" fill="currentColor"\/>/.test( svg( 0.99 ) ), 'a full moon: the whole disc' );
	ok( / 0 0 0 8 2.2z/.test( svg( 0.2 ) ) && / 0 0 1 8 2.2z/.test( svg( 0.8 ) ) && /A0.00 5.8/.test( svg( 0.5 ) ), 'a crescent\'s terminator bulging toward its limb, a gibbous moon\'s away, a quarter\'s straight' );
	ok( /rotate\(-90 8 8\)/.test( svg( 0.3, 90 ) ) && /is-down/.test( svg( 0.5, 0, false ) ) && ! /is-down/.test( svg( 0.5 ) ), 'turned to its angle (SVG turns clockwise), and marked down when it is' );
	// a waxing crescent low in the west after sunset: at the island's latitude it lies on its back, lit from below (a
	// "smile"), not upright as it's drawn at higher latitudes
	let smiles = 0, crescents = 0;
	for ( let d = 0; d < 60; d ++ ) {

		const T = d * 24 + 19.5, f = moonFace( T, 19.5 );
		if ( f.up && f.lit > 0.05 && f.lit < 0.3 && moonAt( T ).phase < 0.5 ) {

			crescents ++;
			if ( Math.abs( f.angle + 90 ) < 30 ) smiles ++;

		}

	}

	ok( crescents >= 4 && smiles === crescents, `the evening's waxing crescents lie lit from below, tilted (${ smiles } of ${ crescents } within 30 degrees of straight down)` );
	// the morning's waning crescent in the east before sunrise: lit from below and to the north, where the sun's coming up
	// (the game's sun is spring's, 6 degrees north, and a spring morning's ecliptic lies low in the east: so tilted further
	// over than the evening's)
	let morn = 0, mornUp = 0;
	for ( let d = 0; d < 60; d ++ ) {

		const T = d * 24 + 5, f = moonFace( T, 5 );
		if ( f.up && f.alt > 5 && f.lit > 0.05 && f.lit < 0.3 && moonAt( T ).phase > 0.5 ) {

			mornUp ++;
			if ( f.angle > - 165 && f.angle < - 115 ) morn ++;

		}

	}

	ok( mornUp >= 2 && morn === mornUp, `the morning's waning crescents lit from below and the left, 115 to 165 degrees round (${ morn } of ${ mornUp })` );
	// down at night: a last quarter before it rises, after midnight
	const lq = find( ( T ) => Math.abs( moonAt( T ).phase - 0.75 ) < 0.003 );
	const eve = ( Math.floor( lq / 24 ) ) * 24 + 21;
	ok( ! moonFace( eve, 21 ).up && moonFace( eve + 6, 3 ).up, 'a last-quarter moon down at 9 PM, up by 3 AM' );

}

// ---- tonight: dark or bright
{

	const full = find( ( T ) => Math.abs( moonAt( T ).phase - 0.5 ) < 0.002 ), nw = find( ( T ) => Math.min( moonAt( T ).phase, 1 - moonAt( T ).phase ) < 0.002 );
	const f = tonight( Math.floor( full / 24 ) * 24 + 12, L ), n = tonight( Math.floor( nw / 24 ) * 24 + 12, L );
	ok( f.word === 'bright' && /up all night/.test( f.rest ), `a full moon's night: "${ f.word }${ f.rest }"` );
	ok( n.word === 'dark', `a new moon's night: "${ n.word }${ n.rest }"` );
	const lq = find( ( T ) => Math.abs( moonAt( T ).phase - 0.75 ) < 0.003 ), q = tonight( Math.floor( lq / 24 ) * 24 + 12, L );
	ok( q.word === 'dark' && /^ until the moon rises at \d{1,2}:\d{2}\s?[AP]M, then (moonlit|bright)$/.test( q.rest ), `a last quarter's: "${ q.word }${ q.rest }"` );

}

// ---- right now: the pier's turn, the flats' flood, before the spawning dusk
{

	const turn = tideTurns( 24 * 3, 24 * 4 )[ 0 ];
	const atTurn = nowLines( turn.T, L );
	ok( /^Slack water: the pier/.test( atTurn[ 0 ] ) && /fishing well$/.test( atTurn[ 0 ] ), `at the turn: "${ atTurn[ 0 ] }"` );
	const st = {};
	const flood = find( ( T ) => ( stageOf( T, st ), st.flood > 0.9 && st.turn < SLACK && tideBitesNow( st )[ 0 ][ 0 ] === 'flat' ), 24 );
	const atFlood = nowLines( flood, L );
	ok( /^On the flood: the flats are fishing well$/.test( atFlood[ 0 ] ), `on the flood: "${ atFlood[ 0 ] }"` );
	// (early in the flood, nowhere better yet: when somewhere will be)
	const early = find( ( T ) => ( stageOf( T, st ), st.flood > 0.9 && st.turn < SLACK && tideBitesNow( st )[ 0 ][ 1 ] < WELL ), 24 );
	ok( /^On the flood: the flats fish well from about \d{1,2}:\d{2}\s?[AP]M$/.test( nowLines( early, L )[ 0 ] ), `early in the flood: "${ nowLines( early, L )[ 0 ] }"` );
	const ebb = find( ( T ) => ( stageOf( T, st ), st.ebb > 0.9 && st.high < 0.1 ), 24 );
	ok( /^On the ebb: the creek mouths/.test( nowLines( ebb, L )[ 0 ] ), `on the ebb: "${ nowLines( ebb, L )[ 0 ] }"` );
	// the bonefish: the first dusk they gather, its afternoon, the day before's, and while they're there
	const first = find( ( T ) => spawning( T ), 24 * 2 );
	const day = Math.floor( first / 24 ), fromHere = ( T ) => nowLines( T, L, 9 ).find( ( l ) => /bonefish/.test( l ) ) || '';
	const before = fromHere( day * 24 + 15 ), dayBefore = fromHere( ( day - 1 ) * 24 + 15 ), during = fromHere( first + 0.5 );
	const moon = Math.abs( moonAt( first ).phase - 0.5 ) < 0.25 ? 'full' : 'new';
	ok( before === `The bonefish gather off the flats' edge to spawn at dusk around the ${ moon } moon: tonight, from about ${ timeText( first % 24, L, 30 ) }`, `that afternoon: "${ before }"` );
	ok( dayBefore === `The bonefish gather off the flats' edge to spawn at dusk around the ${ moon } moon: tomorrow`, `the day before: "${ dayBefore }"` );
	ok( during === `The bonefish are gathered off the flats' edge to spawn, until about ${ timeText( FLATS_FISH.spawn.to, L, 30 ) }`, `while they're there: "${ during }"` );
	ok( spawnNext( ( day - 6 ) * 24 + 15 ) === null || ! fromHere( ( day - 6 ) * 24 + 15 ).includes( 'tonight' ), 'nothing said of it a week off' );

}

// ---- what the panel says they do is what the game does
{

	const stage = ( s ) => ( { rate: 0, phase: 0, flood: 0, ebb: 0, high: 0, low: 0, turn: 0, ...s } );
	const best = ( s ) => tideBitesNow( stage( s ) )[ 0 ][ 0 ];
	ok( best( { flood: 1, high: 1 } ) === 'flat' && best( { ebb: 1 } ) === 'mouth' && best( { turn: 1, low: 1 } ) === 'pier', 'the flats best on the flood about high water, a creek\'s mouth on the ebb, the pier at the turn (Tide.TIDE_BITES)' );
	ok( TIDE_BITES.edge.ebb > TIDE_BITES.edge.flood && TIDE_BITES.channel.ebb > TIDE_BITES.channel.flood && TIDE_BITES.mouth.ebb > TIDE_BITES.edge.ebb && TIDE_BITES.mouth.ebb > TIDE_BITES.channel.ebb, 'their edge and creeks on the ebb, a mouth most of all' );
	const full = find( ( T ) => Math.abs( moonAt( T ).phase - 0.5 ) < 0.002 ), nw = find( ( T ) => Math.min( moonAt( T ).phase, 1 - moonAt( T ).phase ) < 0.002 );
	ok( swordfishShare( full ) < 0.6 && swordfishShare( nw ) > 0.97, `swordfish shallower on dark nights: a float's share of a dark night's under a full moon ${ swordfishShare( full ).toFixed( 2 ) }, at new ${ swordfishShare( nw ).toFixed( 2 ) }` );
	// (the bonefish only about new and full moon, only at dusk)
	let off = 0;
	for ( let T = 0; T < 24 * 60; T += 0.25 ) if ( spawning( T ) ) {

		const p = moonAt( T ).phase, from = Math.min( p, Math.abs( p - 0.5 ), 1 - p ) * SYNODIC, h = islandHour( T );
		if ( from > FLATS_FISH.spawn.days || h < 16 || h > 22 ) off ++;

	}
	ok( off === 0 && WHAT_THEY_DO[ 3 ].includes( `${ FLATS_FISH.spawn.days } days either side`), `bonefish spawning at dusk within ${ FLATS_FISH.spawn.days } days of new and full moon, as said` );
	const fullHigh = Math.floor( full / 24 ) * 24 + 24, newNight = Math.floor( nw / 24 ) * 24 + 23;
	ok( seaGlow( newNight, 23 ) < GLOW && seaGlow( fullHigh, 0 ) > GLOW * 5, `hatchlings' sea darkest at new moon (${ seaGlow( newNight, 23 ).toFixed( 1 ) }), bright under a full one (${ seaGlow( fullHigh, 0 ).toFixed( 1 ) })` );

}

// ---- the panel's section, over a month of hours: whole, with nothing missing, and its tides the day's
{

	let bad = 0, worst = 0, said = 0;
	const t0 = performance.now();
	for ( let T = 0; T < 24 * 30; T += 0.75 ) {

		const x = tideMoon( T, L ), html = [ null, ...TM_PARTS.map( ( p ) => p[ 0 ] ) ].map( ( open ) => tideMoonHtml( x, open ) ).join( '' );
		const day = Math.floor( T / 24 ) + 1, turns = tidesOf( day ), nextAt = turns.findIndex( ( t ) => t.T > T );
		if ( /NaN|undefined|null|\[object/.test( html ) || x.tides.length !== turns.length || x.tides.some( ( t, i ) => t.feet !== datumFeet( turns[ i ].height ) || t.next !== ( i === nextAt ) ) ) bad ++;
		worst = Math.max( worst, html.length );
		said += x.now.length;

	}

	const ms = ( performance.now() - t0 ) / 960;
	ok( bad === 0, `a month of the panel's section (960 times): whole, its tides the day's, the next marked (${ bad } wrong)` );
	ok( said > 960, `something said for right now most of the time (${ ( said / 960 ).toFixed( 1 ) } lines on average)` );
	console.log( `      (${ ms.toFixed( 2 ) } ms a section, its HTML up to ${ worst } characters)` );
	ok( moonIcon( moonFace( 20, 20 ) ).length < 600 && moonFace( 20, 20 ).lit > NEW_LIT, 'the clock\'s night icon small' );
	// its parts: the tide now and the lines for right now always; each part behind its button, one open at a time
	const x = tideMoon( 24 * 4 + 16, L ), shut = tideMoonHtml( x ), part = ( id ) => tideMoonHtml( x, id );
	const has = ( h, s ) => h.includes( s );
	ok( has( shut, 'Slack water' ) && x.now.every( ( l ) => has( shut, l.replace( /'/g, '&#39;' ) ) ) && ! has( shut, 'class="gm-tm-part"' ) && TM_PARTS.every( ( [ id ] ) => has( shut, `data-tm="${ id }"` ) && has( shut, `data-tm="${ id }" class="" aria-expanded="false"` ) ), 'shut: the tide now, the lines for right now and the four parts\' buttons, none open' );
	ok( has( part( 'tides' ), 'role="listitem"' ) && ( part( 'tides' ).match( /role="listitem"/g ) || [] ).length === x.tides.length && has( part( 'tides' ), 'from low to high today' ) && ! has( part( 'tides' ), 'Tonight' ), 'Tides: the day\'s turns and the range, and nothing else' );
	ok( has( part( 'moon' ), x.moon.name ) && has( part( 'moon' ), 'Tonight: <b>' ) && ! has( part( 'moon' ), 'listitem' ), 'Moon: its name, how much is lit and tonight' );
	ok( WHAT_THEY_DO.every( ( l ) => has( part( 'effects' ), l ) ) && has( part( 'clock' ), 'dimmed while it' ) && has( part( 'clock' ), 'Slack water' ), 'Effects: what they do in the game; Clock: what its marks mean' );
	ok( TM_PARTS.every( ( [ id ] ) => has( part( id ), `data-tm="${ id }" class="is-on" aria-expanded="true"` ) && ( part( id ).match( /is-on/g ) || [] ).length === 1 ), 'the one open marked so, and only it' );

}

if ( fails ) {

	console.log( `\n${ fails } failed` );
	process.exit( 1 );

}

console.log( '\ntide-moon: all passed' );
