// (M15) Getting home and the edge: Marta's tow by the distance, the weather radio's forecast (MarineForecast.js),
// the far places named once they're found (Places' FAR_PLACES, GameState.found), and the soft edge past the far
// grounds (Weather.withEdge, Finds' far, Bites' far).
//
//   node test/getting-home.mjs

import { TOW, towFee, towTime } from '../src/game/Gear.js';
import { EDGE, edgeAt, withEdge, seaHeight, weatherHere, weatherAt, hurricaneNews, SEA_A, CONDITIONS } from '../src/game/Weather.js';
import { SPECTRUM } from '../src/ocean/Waves.js';
import { broadcast, periodsFrom, periodText, headline, spokenHour, ZONES, ADVISORY } from '../src/game/MarineForecast.js';
import { findsAbout, FINDS } from '../src/game/Finds.js';
import { biteDelay, FAR_SLOWER } from '../src/game/Bites.js';
import { FAR_PLACES, PLACES, farName, placeName } from '../src/game/Places.js';
import { GameState } from '../src/game/GameState.js';
import { Radio, pickVoice, lineTime, towWords, NO_TOW } from '../src/game/Radio.js';
import { farOff, FT, KT } from '../src/game/Units.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};

// ---- Marta's tow, by the distance
{

	check( towFee( 1000 ) === 70 && towFee( 1400 ) === 90, 'the tow in the bay costs what it did' );
	check( towFee( 10000 ) === 520 && towFee( 24000 ) === 1220, `by the distance, with no cap: $${ towFee( 10000 ) } at 10 km, $${ towFee( 24000 ) } at 24 km` );
	const h = towTime( 10000 ) / 3600;
	check( h > 1.1 && h < 1.3, `10 km is ${ h.toFixed( 2 ) } hours of her time (18 knots out, 6 back in tow)` );
	const rate = towFee( 10000 ) / h;
	check( rate > 250 && rate < 500, `$${ Math.round( rate ) } an hour, as a towing firm's run ($250 to $500, Sea Tow's)` );
	check( TOW.back < TOW.out, 'slower back in tow than out to you' );
	check( towWords( towTime( 10000 ) ) === '1 hour 10 minutes' && towWords( 200 ) === '5 minutes', 'how long she\'ll be, as she\'d say it' );
	check( farOff( 300 ) === '984 ft' && farOff( 9260 ) === '5.0 nautical miles', 'how far off, in feet close to and nautical miles out there' );
	check( NO_TOW === CONDITIONS.gale.wind, 'she won\'t come out in a gale' );

}

// ---- the soft edge: the sea
{

	check( edgeAt( 0, 0 ) === 0 && edgeAt( EDGE.from - 1, 0 ) === 0, 'the far grounds as they were, out to 14 km: past the bank and the hump' );
	check( edgeAt( EDGE.full, 0 ) === 1 && edgeAt( 0, 60000 ) === 1, 'all of it by 24 km, and no more however far you go: no wall' );
	const fair = weatherAt( 100, 'fair' ), same = withEdge( { ...fair }, 0, 13000 );
	check( same.wind === fair.wind && same.swell === fair.swell && same.windSea === fair.windSea, 'nothing changes inside it' );
	const out = withEdge( { ...fair }, 0, 30000 ), kt = ( out.wind - fair.wind ) / KT;
	check( kt > 4 && kt < 6, `a force fresher: ${ ( fair.wind / KT ).toFixed( 0 ) } knots to ${ ( out.wind / KT ).toFixed( 0 ) }` );
	const hs = seaHeight( out.swell, out.windSea ) / seaHeight( fair.swell, fair.windSea );
	check( hs > 1.4 && hs < 1.6, `the seas half again: ${ ( seaHeight( fair.swell, fair.windSea ) / FT ).toFixed( 1 ) } ft to ${ ( seaHeight( out.swell, out.windSea ) / FT ).toFixed( 1 ) } ft` );
	// (no step on the way out)
	let worst = 0, prev = null;
	for ( let r = 13000; r <= 25000; r += 50 ) {

		const w = withEdge( { ...fair }, r, 0 );
		if ( prev ) worst = Math.max( worst, Math.abs( w.wind - prev.wind ), Math.abs( w.swell - prev.swell ) * 5 );
		prev = w;

	}

	check( worst < 0.05, `no step in it: at most ${ worst.toFixed( 3 ) } m/s in 50 m` );
	const here = withEdge( weatherHere( 100, 'calm', 0, 30000, 0, null ), 30000, 0 );
	check( here.wind > CONDITIONS.calm.wind && here.edge === 1, 'a place\'s, not a weather\'s: a held pick has it too' );
	// (the forecast's seas are the sea that's drawn)
	const A = SPECTRUM.filter( ( w ) => w.from === 's' ).map( ( w ) => w.a ), B = SPECTRUM.filter( ( w ) => w.from === 'w' ).map( ( w ) => w.a );
	check( JSON.stringify( A ) === JSON.stringify( SEA_A.swell ) && JSON.stringify( B ) === JSON.stringify( SEA_A.wind ), 'the seas\' amplitudes are the waves\' (ocean/Waves.js\' SPECTRUM)' );

}

// ---- the soft edge: emptier
{

	const fresh = () => ( { weed: [], debris: [], bait: [] } );
	const count = ( x, z ) => {

		const n = { weed: 0, debris: 0, bait: 0, T: 0 };
		for ( let T = 100; T < 100 + 24 * 300; T += 3.7 ) {

			const f = findsAbout( T, x, z, 2000, fresh() );
			n.weed += f.weed.length;
			n.debris += f.debris.length;
			n.bait += f.bait.length;
			n.T ++;

		}

		return n;

	};

	const near = count( 11000, - 3000 ), far = count( 28000, - 8000 );
	const share = ( k ) => far[ k ] / near[ k ];
	console.log( `     past the far grounds, of the far grounds': bait ${ share( 'bait' ).toFixed( 2 ) }, debris ${ share( 'debris' ).toFixed( 2 ) }, weed ${ share( 'weed' ).toFixed( 2 ) }` );
	check( share( 'bait' ) < 0.55, 'the bait and the birds working it thin out, past the island\'s reach' );
	check( share( 'debris' ) < 0.9, 'and the drift' );
	check( share( 'weed' ) > 0.7, 'the weed\'s the ocean\'s, as much out there' );
	// (coming and going without popping, out in it: each one's life changes only a little in a real second)
	let worst = 0, prev = null;
	const X = 20000, Z = - 2000, at = ( q ) => Math.hypot( ( q.x ?? ( q.x0 + q.x1 ) / 2 ) - X, ( q.z ?? ( q.z0 + q.z1 ) / 2 ) - Z );
	for ( let T = 300; T < 300 + 24 * 4; T += 0.01 ) {

		const f = findsAbout( T, X, Z, 3500, fresh() ), now = new Map();
		for ( const kind of [ 'weed', 'debris', 'bait' ] ) for ( const q of f[ kind ] ) if ( at( q ) < 1500 ) now.set( kind + q.n, { life: q.life, d: at( q ) } );
		if ( prev ) {

			for ( const [ k, q ] of now ) if ( q.d < 1300 ) worst = Math.max( worst, Math.abs( q.life - ( prev.has( k ) ? prev.get( k ).life : 0 ) ) );
			for ( const [ k, q ] of prev ) if ( q.d < 1300 && ! now.has( k ) ) worst = Math.max( worst, q.life );

		}

		prev = now;

	}

	check( worst < 0.2, `never popping in or out as they thin (the most a life changes in a real second: ${ worst.toFixed( 3 ) })` );
	// (the bites)
	let seed = 5;
	const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
	const mean = ( h ) => {

		let s = 0;
		for ( let i = 0; i < 4000; i ++ ) s += biteDelay( h, 10, rng );
		return s / 4000;

	};
	const blue = { blue: 0.35 }, at24 = mean( { ...blue, far: 1 } ), here = mean( blue );
	check( FAR_SLOWER === 1 && at24 > here * 1.6, `the open blue's bites come slower out there: every ${ at24.toFixed( 0 ) } s against ${ here.toFixed( 0 ) } s` );
	const under = { blue: 0.35, weed: 1 }, weedFar = mean( { ...under, far: 1 } ), weedNear = mean( under );
	check( weedFar < at24 * 0.6 && weedFar < weedNear * 1.5, `under the weed they still come: every ${ weedFar.toFixed( 0 ) } s (${ weedNear.toFixed( 0 ) } s inside)` );
	check( biteDelay( { far: 1 }, 10, rng ) === Infinity, 'far is no water of its own' );

}

// ---- the forecast
{

	check( spokenHour( 9.5 ) === '9 a.m.' && spokenHour( 15 ) === '3 p.m.' && spokenHour( 0 ) === '12 midnight' && spokenHour( 12 ) === '12 noon', 'the hour as it\'s read' );
	const names = ( h ) => periodsFrom( 24 * 5 + h ).map( ( p ) => p.name ).join( ', ' );
	check( names( 3 ) === 'rest of tonight, today, tonight' && names( 10 ) === 'today, tonight, tomorrow' && names( 14 ) === 'this afternoon, tonight, tomorrow' && names( 20 ) === 'tonight, tomorrow, tomorrow night', 'its periods follow the hour, as the Weather Service\'s do' );
	const fair = broadcast( 100, { pick: 'fair' } );
	check( /NOAA Weather Radio/.test( fair[ 0 ] ) && /issued at 4 a\.m\.$/.test( fair[ 1 ] ), 'who it is, and when it was issued' );
	const z0 = fair.indexOf( `For ${ ZONES[ 0 ].name }.` ), z1 = fair.indexOf( `For ${ ZONES[ 1 ].name }.` );
	check( z0 > 0 && z1 > z0, 'the island\'s waters, then the waters beyond' );
	check( fair.slice( z0, z1 ).some( ( l ) => /10 to 15 knots\. Seas 3 to 4 feet/.test( l ) ), 'a fair day: 10 to 15 knots, seas 3 to 4 feet (a fair day\'s 14 knots and 3.8 ft)' );
	check( fair.slice( z1 ).some( ( l ) => /15 to 20 knots\. Seas 5 to 6 feet/.test( l ) ), 'and beyond: 15 to 20 knots, seas 5 to 6 feet' );
	check( ! fair.slice( z0, z1 ).includes( 'Small craft should exercise caution.' ) && fair.slice( z1 ).includes( 'Small craft should exercise caution.' ), 'small craft should exercise caution, out past the far grounds' );
	check( headline( 15, 3 ) === 'Small craft should exercise caution.' && headline( 12, 6 ) === 'Small craft should exercise caution.', `caution from ${ ADVISORY.caution[ 0 ] } knots or ${ ADVISORY.caution[ 1 ] } feet` );
	check( /advisory/.test( headline( 20, 3 ) ) && /advisory/.test( headline( 12, 7 ) ), `an advisory from ${ ADVISORY.advisory[ 0 ] } knots or ${ ADVISORY.advisory[ 1 ] } feet` );
	check( /gale/.test( headline( 34, 3 ) ) && /storm/.test( headline( 48, 3 ) ) && headline( 12, 3 ) === '', 'a gale warning, a storm warning, and nothing on an ordinary day' );
	const gale = broadcast( 100, { pick: 'gale' } );
	check( gale.includes( 'A gale warning is in effect.' ) && gale.some( ( l ) => /Showers/.test( l ) ), 'a gale: its warning and its showers' );
	const calm = broadcast( 100, { pick: 'calm' } );
	check( calm.some( ( l ) => /Variable winds 5 knots or less/.test( l ) ), 'a calm: variable winds' );
	check( broadcast( 100, { pick: 'storm' } ).some( ( l ) => /thunderstorms/.test( l ) && /higher in and near thunderstorms/.test( l ) ), 'thunderstorms, and what they do to the wind and the sea' );
	// (it comes true: each period's wind band has the island's wind at its middle, over a year of forecasts)
	let right = 0, n = 0;
	for ( let T = 30; T < 24 * 120; T += 11.3 ) {

		const p = periodsFrom( T )[ 0 ], m = /(\d+) to (\d+) knots/.exec( periodText( p, ZONES[ 0 ] ).text );
		if ( ! m ) continue;
		const kt = weatherAt( T ).wind / KT;
		n ++;
		if ( kt >= m[ 1 ] - 5 && kt <= + m[ 2 ] + 5 ) right ++;

	}

	check( right / n > 0.85, `it comes true: the wind within a band of what was said ${ Math.round( right / n * 100 ) }% of the time` );
	// (a hurricane)
	let watch = null, warning = null, outlook = null;
	for ( let T = 24 * 15; T < 24 * 600 && ! ( watch && warning && outlook ); T += 3 ) {

		const k = hurricaneNews( T );
		if ( ! k ) continue;
		if ( k.stage === 'outlook' && ! outlook ) outlook = { T, k };
		if ( k.stage === 'watch' && ! watch ) watch = { T, k };
		if ( k.stage === 'warning' && ! warning ) warning = { T, k };

	}

	check( !! watch && !! warning && !! outlook, 'a hurricane found' );
	if ( watch && warning && outlook ) {

		const say = ( o ) => broadcast( o.T, { news: o.k } );
		check( say( outlook ).some( ( l ) => /is being watched far out/.test( l ) ), 'on the outlook, it\'s being watched' );
		check( say( watch ).some( ( l ) => /hurricane watch is in effect/.test( l ) ) && say( watch ).some( ( l ) => /remain in port/.test( l ) ), 'a watch: small craft should remain in port' );
		check( say( warning ).filter( ( l ) => l === 'A hurricane warning is in effect.' ).length === 2, 'a warning, for both zones' );

	}

	check( lineTime( 'one two' ) === 2.5 && lineTime( 'a '.repeat( 26 ).trim() ) === 10, 'with no voice, the words at a reader\'s pace' );
	const us = { lang: 'en-US', name: 'a' }, gb = { lang: 'en-GB', name: 'b' }, fr = { lang: 'fr-FR', name: 'c' };
	check( pickVoice( [ fr, gb, us ] ) === us && pickVoice( [ fr, gb ] ) === gb && pickVoice( [ fr ] ) === null && pickVoice( [] ) === null, 'a US English voice, or any English one, or the words alone' );

}

// ---- the far places, named once they're found
{

	check( FAR_PLACES.join() === 'dropoff,ledge,hump,bank,blue', 'the far places: the drop-off, the north ledge, the hump, the bank and the blue water' );
	check( FAR_PLACES.every( ( k ) => PLACES[ k ].what ), 'each with a word on what it is' );
	const m = new Map(), store = { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) };
	const st = new GameState( store );
	check( farName( 'bank', st.found, true ) === 'Somewhere far out' && farName( 'bank', st.found ) === 'somewhere far out', 'a far place you\'ve not found goes unnamed' );
	check( farName( 'creek', st.found, true ) === placeName( 'creek', true ), 'the island\'s places are always named' );
	check( st.findPlace( 'bank', 4 ) === true && st.findPlace( 'bank', 6 ) === false && st.found.bank === 4, 'found the first time you\'re there, and noted on that day' );
	check( st.findPlace( 'bay', 4 ) === false && st.found.bay === undefined, 'only the far places are found' );
	check( farName( 'bank', st.found, true ) === 'The bank', 'and named from then on' );
	const s2 = new GameState( store );
	check( s2.load() && s2.found.bank === 4, 'kept in the save' );
	st.logPlace( 'hump', 'mahi', 9 );
	check( st.found.hump === 9, 'a fish from one finds it too' );
	// (a save from before: the far places it's fished are found)
	const old = JSON.parse( m.get( [ ...m.keys() ][ 0 ] ) );
	delete old.found;
	old.places = { dropoff: { n: 2, day: 3, first: 'tuna' } };
	const m2 = new Map( [ [ [ ...m.keys() ][ 0 ], JSON.stringify( old ) ] ] );
	const s3 = new GameState( { getItem: ( k ) => m2.get( k ) ?? null, setItem: () => {} } );
	check( s3.load() && s3.found.dropoff === 3, 'a save from before: the far places it fished are found' );

}

// ---- the radio itself (its panel's keys, the broadcast going round, the voice), on a stand-in for the page
{

	const el = () => {

		const s = new Set();
		return { className: '', innerHTML: '', textContent: '', append() {}, querySelector: () => el(), querySelectorAll: () => [], classList: { add: ( c ) => s.add( c ), remove: ( c ) => s.delete( c ), toggle: ( c, on ) => on ? s.add( c ) : s.delete( c ), contains: ( c ) => s.has( c ) } };

	};

	globalThis.document = { createElement: el, head: { append() {} }, pointerLockElement: null };
	let towed = 0;
	const player = { mode: 'boat', riding: false, helmHeld: false };
	const app = { player, audio: { muted: false, volume: 0.8 }, settings: { day: 5, timeOfDay: 10, weatherSince: 0 }, weather: { news: null }, input: { lastDevice: 'keyboard' }, weatherPick: () => 'fair' };
	const job = { metres: 9700, fee: 505, time: towTime( 9700 ) };
	const game = { app, state: { money: 900, fuelL: 0 }, weatherNow: { wind: 7 }, hud: null, makingRoom: false, towJob: () => game.job, job, tow: ( aboard ) => { towed += aboard ? 1 : 100; } };
	const r = new Radio( { root: el(), hud: el() }, game );
	const keys = ( ...down ) => ( { hit: ( k ) => down.includes( k ), lastDevice: 'keyboard' } );
	r.update( 0.1, keys( 'KeyR' ), false );
	check( r.open && player.helmHeld && r.pick === 1, 'R at the helm opens it; dry, on Marta (and E won\'t leave the helm while it\'s up)' );
	r.update( 0.1, keys( 'Enter' ), false );
	check( !! r.call && r.call.can && /5\.2 nautical miles/.test( r.call.say ) && /\$505/.test( r.call.say ), `she answers: "${ r.call && r.call.say }"` );
	check( r.reading.big === '16', 'the set on channel 16 for it' );
	game.state.money = 100;
	r.callMarta();
	check( /only \$100/.test( r.call.say ), 'short of her fee, she takes what you have' );
	r.update( 0.1, keys( 'Enter' ), false );
	check( towed === 1 && ! r.open && ! player.helmHeld, 'tow me in: she does, and the panel\'s gone' );
	game.weatherNow = { wind: 21 };
	r.show();
	r.callMarta();
	check( ! r.call.can && /gale/.test( r.call.say ), 'not in a gale' );
	game.weatherNow = { wind: 7 };
	app.weather.news = { stage: 'warning' };
	r.callMarta();
	check( ! r.call.can && /hurricane/.test( r.call.say ), 'nor with a hurricane warned of' );
	app.weather.news = null;
	r.update( 0.1, keys( 'Enter' ), false );
	check( ! r.call && r.open, 'and that\'s the end of the call' );
	r.update( 0.1, keys( 'KeyE' ), false );
	check( ! r.open && ! player.helmHeld, 'E closes it' );
	game.job = null;
	r.update( 0.1, keys( 'KeyR' ), false );
	check( r.open && r.pick === 0, 'at the dock, on the weather' );
	r.update( 0.1, keys( 'Enter' ), false );
	check( r.listening && ! r.open && r.reading.big === '01' && r.reading.mark === 'WX', 'Enter: the broadcast on, the set on WX 01, and the panel gone so you can steer' );
	// (with no voice, its words at a reader's pace, all the way round, a pause, and from the top)
	const seen = [];
	let was = '', gap = 0, first = r.lines[ 0 ];
	for ( let i = 0; i < 20000 && gap === 0; i ++ ) {

		r.update( 0.1, keys(), false );
		const w = r.wordsText.textContent;
		if ( w !== was ) {

			if ( w === '' ) gap = 1;
			else seen.push( w );
			was = w;

		}

	}

	check( seen.length === r.lines.length && seen.every( ( t, i ) => t === r.lines[ i ] ), `every line of it in turn (${ seen.length })` );
	check( gap === 1 && ! r.words.classList.contains( 'is-on' ), 'then a pause' );
	for ( let i = 0; i < 200 && r.wordsText.textContent === ''; i ++ ) r.update( 0.1, keys(), false );
	check( r.wordsText.textContent === first && r.words.classList.contains( 'is-on' ), 'and it comes round from the top' );
	player.mode = 'walk';
	r.update( 0.1, keys(), false );
	check( ! r.listening, 'stepping off her stops it' );
	player.mode = 'boat';
	// (with a voice: each line waits for it; muted, it stops and the words go on; one that hangs gives way)
	const said = [];
	let live = null, cancels = 0, hang = false;
	r.synth = { getVoices: () => [ { lang: 'en-US' } ], speak: ( u ) => { said.push( u ); live = u; }, cancel: () => { cancels ++; live = null; } };
	globalThis.SpeechSynthesisUtterance = function ( text ) { this.text = text; };
	const end = () => { const u = live; live = null; if ( u && u.onend ) u.onend(); };
	r.listen( true );
	check( said.length === 1 && said[ 0 ].text === r.lines[ 0 ] && said[ 0 ].volume === 0.8 && said[ 0 ].lang === 'en-US', 'the voice reads the first line, as loud as the game\'s turned up' );
	for ( let i = 0; i < 40; i ++ ) r.update( 0.1, keys(), false );
	check( said.length === 1, 'and the next waits for it to finish' );
	end();
	for ( let i = 0; i < 8; i ++ ) r.update( 0.1, keys(), false );
	check( said.length === 2 && said[ 1 ].text === r.lines[ 1 ], 'then the next' );
	app.audio.muted = true;
	r.update( 0.1, keys(), false );
	const quiet = said.length;
	check( cancels > 0 && live === null, 'muted, the voice stops' );
	for ( let i = 0; i < 200; i ++ ) r.update( 0.1, keys(), false );
	check( said.length === quiet && r.line > 1, 'and the words go on without it' );
	app.audio.muted = false;
	hang = true;
	for ( let i = 0; i < 1000 && ! r._noVoice; i ++ ) r.update( 0.1, keys(), false );
	check( r._noVoice, 'a voice that never ends gives way to the words alone' );
	check( hang && ( r.listen( false ), ! r.listening ), 'and it can be turned off' );
	delete globalThis.document;
	delete globalThis.SpeechSynthesisUtterance;

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
