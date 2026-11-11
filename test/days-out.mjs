// (M16) Plain-node tests of days out (game/Seaworthy.js, game/DaysOut.js, the boat's part of game/Away.js): what each boat
// can stand and where, the ice and the catch, food and water, each boat's gear and figures, the sock and sleeping aboard,
// flares and the EPIRB.
//   node test/days-out.mjs
import { ABLE, ableEnv, awashLs, seaHere, fetchAt, strainOf, keepCatch, feedOf, strengthOf, meltKgH, worthOf, cleanDays, FRESH_H, OFF_H, ICED_SLOW, SOCK_DRIFT, ICE_BAG_KG, CHILL_KG, STORES_PRICE, ICE_BAG_PRICE, STORES_WATER_L, VHF_H, SHORE_VHF_H, vhfReach, reachTo, FLARE_M } from '../src/game/Seaworthy.js';
import { DaysOut, restOf, wakeOf, drawEcho } from '../src/game/DaysOut.js';
import { awayOf, boatLeft, leftOf, boatRecord, cleanBoats, driftOf, DRIFT } from '../src/game/Away.js';
import { gearStats, defaultUpgrades, fuelBurn, UPGRADES } from '../src/game/Gear.js';
import { fuelFor, CRUISE } from '../src/game/Chart.js';
import { GameState } from '../src/game/GameState.js';
import { CONDITIONS, weatherAt, withEdge, towardOf, islandTime } from '../src/game/Weather.js';
import { BOATS } from '../src/world/boat/Boats.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

// ---- what each boat can stand, and where
{

	const fair = weatherAt( 40, 'fair' ), gale = weatherAt( 40, 'gale' ), calm = weatherAt( 40, 'calm' );
	ok( Object.keys( BOATS ).every( ( id ) => ABLE[ id ] ), 'every boat has her figures' );
	const open = seaHere( fair );
	console.log( `     a fair day's open sea ${ open.toFixed( 2 ) } m, a gale's ${ seaHere( gale ).toFixed( 2 ) } m, the bay's on a fair day ${ seaHere( fair, 8, 90 ).toFixed( 2 ) } m` );
	ok( strainOf( 'kayak', seaHere( fair, 8, 90 ), fair.wind ) < 1, 'the kayak: fine in the bay on a fair day' );
	ok( strainOf( 'kayak', open, fair.wind ) >= 1, 'and too much for her in the open sea, on the same day' );
	ok( strainOf( 'kayak', seaHere( calm ), calm.wind ) < 1, 'but on a calm one she can get out' );
	ok( seaHere( fair, 1 ) <= 0.5 && seaHere( fair, 1 ) < seaHere( fair, 20 ), 'the shallows take the sea down' );
	ok( seaHere( gale, 200, 90 ) < seaHere( gale, 200, 3000 ), 'and the land to windward takes the wind sea' );
	const offshore = withEdge( { ...weatherAt( 40, 'fair' ) }, 0, 24000 );
	ok( strainOf( 'console', open, fair.wind ) < 1 && strainOf( 'console', seaHere( gale ), gale.wind ) >= 1, 'the console: a fair day\'s open sea, yes; a gale sends her running in' );
	ok( strainOf( 'console', seaHere( offshore ), offshore.wind ) > strainOf( 'console', open, fair.wind ), 'past the far grounds it\'s harder on her' );
	ok( strainOf( 'console', 0, weatherAt( 40, 'blustery' ).wind ) >= 1, 'a blow alone is too much for her' );
	ok( strainOf( 'lobster', seaHere( gale ), gale.wind ) < 1, 'the lobster boat rides a gale, working hard' );
	ok( strainOf( 'sportfisher', seaHere( gale ), gale.wind ) < strainOf( 'lobster', seaHere( gale ), gale.wind ) && strainOf( 'sportfisher', open, fair.wind ) === 0, 'the sportfisher, easier; a fair day\'s nothing to her' );
	ok( awashLs( 0.9 ) === 0 && awashLs( 1.5 ) === 3 && awashLs( 9 ) === 8, 'green water only past what she can stand, beating the bucket half as far again past it' );
	const land = ( x, z ) => ( z < - 100 ? 5 : - 10 );
	ok( fetchAt( 0, 0, 0, 1, land ) === 200 && fetchAt( 0, 0, 0, - 1, land ) === 3000, 'how far to windward the land is' );

}

// ---- the ice and the catch
{

	const fish = () => [ { kg: 5, value: 100 } ];
	let r = keepCatch( fish(), 0, 5, 0.3 );
	ok( r.fish[ 0 ].value === 100 && r.off.length === 0, 'in the box with no ice, five hours on: still its full price' );
	r = keepCatch( fish(), 0, 9, 0.3 );
	ok( r.fish[ 0 ].value === 75, `nine hours: going soft, $${ r.fish[ 0 ].value }` );
	r = keepCatch( fish(), 0, OFF_H, 0.3 );
	ok( r.off.length === 1 && r.fish.length === 0, 'twelve hours: gone off' );
	const melt = meltKgH( 30 );
	ok( Math.abs( ICE_BAG_KG / melt - 23 ) < 1, `(M17) a bag in the cheap cooler lasts ${ ( ICE_BAG_KG / melt ).toFixed( 1 ) } hours, a day's mean (0.2 kg an hour)` );
	ok( meltKgH( 160 ) / 160 < meltKgH( 70 ) / 70 && meltKgH( 300 ) > meltKgH( 160 ), 'the insulated hold keeps it better for its size; a big box melts more all told' );
	// ((M17) FAO's measured box: 90 L insulated, in shade at 28 C, 3.6 kg a day; 0.1233 kg a day a degree)
	ok( Math.abs( meltKgH( 60, true ) * 24 - 0.1233 * 28 ) < 0.01, `an insulated 90 L box melts ${ ( meltKgH( 60, true ) * 24 ).toFixed( 2 ) } kg a day, FAO's` );
	ok( Math.abs( meltKgH( 160 ) - 0.277 ) < 0.005 && Math.abs( meltKgH( 600 ) - 0.668 ) < 0.005, `the hold ${ meltKgH( 160 ).toFixed( 3 ) } and the big fish box ${ meltKgH( 600 ).toFixed( 3 ) } kg an hour: about half M16's 0.55 and 1.33` );
	ok( meltKgH( 160 ) < meltKgH( 70 ), 'the insulated hold melts less all told than the bigger cheap chest' );
	r = keepCatch( fish(), 100, 24 * 6, 0.1 );
	ok( r.fish[ 0 ].value === 100 && r.ice > 80, `on ice, six days on: fresh, ${ r.ice.toFixed( 0 ) } kg left` );
	r = keepCatch( fish(), 100, 24 * 12, 0.1 );
	ok( r.off.length === 1, 'it keeps twelve days on ice, the least the FAO gives fish from tropical water' );
	r = keepCatch( fish(), 1, 10, 0.5 );
	ok( r.ice === 0 && r.iced === 2 && r.fish[ 0 ].w > 8 && r.fish[ 0 ].w < 8.2, 'it keeps as long as the ice does: two hours iced, eight warm' );
	r = keepCatch( fish(), 2, 48, 0.5, 5 );
	ok( r.ice > 2 && r.fish[ 0 ].value === 100, 'an icemaker keeps the ice ahead of the melt' );
	ok( worthOf( FRESH_H ) === 1 && worthOf( OFF_H ) === 0.5, 'its price falls to half as it goes off' );
	ok( ICED_SLOW === 24 && Math.abs( CHILL_KG - 28 * 3.4 / 334 ) < 0.001, 'a fish\'s heat melts its share of the ice' );

}

// ---- food and water
{

	let f = feedOf( { stores: 1, out: 0, dry: 0 }, 12 );
	ok( f.stores === 1 && f.out === 12, 'a day trip: you bring your lunch' );
	f = feedOf( f, 24 );
	ok( f.stores === 0 && f.dry === 0, 'a day\'s stores past that lasts a day' );
	f = feedOf( f, 12 );
	ok( f.dry === 12 && strengthOf( f.dry ) === 1, 'with none left, half a day and you feel nothing yet' );
	f = feedOf( f, 36 );
	ok( strengthOf( f.dry ) === 0.5, 'two days dry: half your strength' );

}

// ---- her gear, and whose it is
{

	const u = defaultUpgrades();
	ok( ! gearStats( u, 'kayak' ).plotter && gearStats( u, 'kayak' ).vhfH === 0 && reachTo( gearStats( u, 'kayak' ) ) === 0 && gearStats( u, 'kayak' ).compass, 'a new kayak: a compass, no plotter, no radio' );
	ok( gearStats( u, 'lobster' ).plotter && gearStats( u, 'lobster' ).vhfH === VHF_H.lobster, 'the lobster boat has hers' );
	ok( gearStats( { ...u, vhf_kayak: 1 }, 'kayak' ).vhfH === VHF_H.hand && gearStats( { ...u, vhf_console: 1 }, 'console' ).vhfH === VHF_H.console, 'a handheld, a fixed set on a whip' );
	ok( gearStats( { ...u, vhf_console: 1 }, 'kayak' ).vhfH === 0, 'each boat\'s stays hers' );
	// ((M17) each reach the two antennas' radio horizons, 4.12 km sqrt h each, added)
	ok( Math.abs( vhfReach( 4, 9 ) - 4120 * 5 ) < 1e-6 && vhfReach( 0, 9.5 ) === 0, 'two antennas 4 m and 9 m up reach each other 20.6 km' );
	const km = ( id, h = gearStats( { ...u, vhf_kayak: 1, vhf_console: 1 }, id ) ) => reachTo( h ) / 1000;
	ok( Math.abs( km( 'kayak' ) - 16.8 ) < 0.1 && Math.abs( km( 'console' ) - 20.6 ) < 0.1 && Math.abs( km( 'lobster' ) - 20.6 ) < 0.1 && Math.abs( km( 'sportfisher' ) - 23.2 ) < 0.1,
		`Marta's set from a handheld ${ km( 'kayak' ).toFixed( 1 ) } km, the console's ${ km( 'console' ).toFixed( 1 ) }, the lobster boat's ${ km( 'lobster' ).toFixed( 1 ) }, the sportfisher's ${ km( 'sportfisher' ).toFixed( 1 ) }` );
	ok( reachTo( gearStats( u, 'lobster' ), 'pearl' ) < reachTo( gearStats( u, 'lobster' ) ) && SHORE_VHF_H.pearl < SHORE_VHF_H.marta, 'Pearl\'s antenna on her shed is lower than Marta\'s: a little less reach' );
	ok( /9 miles out/.test( UPGRADES.vhf_kayak.levels[ 1 ].label ) && /11 miles out/.test( UPGRADES.vhf_console.levels[ 1 ].label ), `the shop says how far Marta hears it: "${ UPGRADES.vhf_kayak.levels[ 1 ].label }", "${ UPGRADES.vhf_console.levels[ 1 ].label }"` );
	ok( ! UPGRADES.deepFinder_kayak && ! UPGRADES.deepAnchor_kayak, 'none of the deep gear on a kayak' );
	ok( gearStats( { ...u, deepAnchor_lobster: 1 }, 'lobster' ).anchorM === 122 && gearStats( { ...u, anchor: 1 }, 'lobster' ).anchorM === 20, 'the long rode reaches the hump\'s top; the Danforth stays as it was' );
	ok( gearStats( { ...u, anchor: 1, deepAnchor_lobster: 1 }, 'lobster' ).anchorM === 122, 'with both, the deeper' );
	ok( gearStats( { ...u, safety: 2 }, 'console' ).epirb && ! gearStats( u, 'console' ).epirb, 'flares and the EPIRB are your own, on any boat' );
	ok( fuelBurn( 1 ) === 0.0265 && fuelBurn( 1, 'kayak' ) === 0 && fuelBurn( 1, 'sportfisher' ) > 5 * fuelBurn( 1 ), 'each burns her own: the lobster boat as ever, the kayak none, the sportfisher far more' );
	ok( CRUISE.speed === 7.1 && fuelFor( 1000, 40 ).perM === fuelBurn( CRUISE.rpm ) / CRUISE.speed, 'the fuel home: the lobster boat\'s as measured' );
	ok( fuelFor( 10000, 40, { boat: 'sportfisher' } ).litres > 3 * fuelFor( 10000, 40 ).litres, 'the sportfisher\'s, hers' );
	ok( fuelFor( 10000, 0, { boat: 'kayak' } ).state === 'ok', 'a kayak\'s never short' );

}

// ---- left to it, by boat: her drift, her draught, her sock
{

	const dock = WORLD.boatDock.position, weather = () => ( { id: 'fair', wind: 7, rain: 0, thunder: 0, windAngle: 0 } ), news = () => null;
	const left = ( more = {} ) => ( { x: 9000, z: 9000, heading: 1, anchor: null, moored: false, hauled: false, T: 100, ...more } );
	const far = ( s, l = left() ) => Math.hypot( s.x - l.x, s.z - l.z ), env = { dock, weather, news };
	const lob = awayOf( left(), 104, env ), kay = awayOf( left(), 104, { ...env, ...ableEnv( 'kayak' ) } ), sport = awayOf( left(), 104, { ...env, ...ableEnv( 'sportfisher' ) } );
	ok( kay && far( kay ) < far( lob ) && far( sport ) > far( lob ), 'each drifts her own: the kayak least, the sportfisher more than the lobster boat' );
	const sock = awayOf( left( { sock: true } ), 104, env );
	ok( Math.abs( far( sock ) / far( lob ) - SOCK_DRIFT ) < 0.01, 'on her sock, half' );
	const to = towardOf( 0 );
	ok( Math.abs( sock.heading - Math.atan2( - to.x, - to.y ) ) < 1e-9 && sock.sock, 'and head to the wind' );
	const shallow = ( x, z ) => ( x > 9000 + to.x * 300 * ( z > 0 ? 1 : 1 ) ? 0.8 : 50 );
	const b = awayOf( left(), 110, { ...env, depth: shallow } ), k = awayOf( left(), 110, { ...env, depth: shallow, ...ableEnv( 'kayak' ) } );
	ok( b.where === 'aground' && b.groundT > 100, 'the lobster boat touches in 0.8 m' );
	ok( k.where === 'adrift', 'and the kayak floats over it' );
	const stormy = { dock, news, weather: () => ( { id: 'gale', wind: 30, swell: 2, windSea: 3, rain: 0.4, thunder: 0, windAngle: 0 } ) };
	const w1 = awayOf( left(), 102, stormy ).wear, w2 = awayOf( left(), 102, { ...stormy, ...ableEnv( 'kayak' ) } ).wear;
	ok( w2 > 1.5 * w1 && DRIFT === ABLE.lobster.drift, 'a storm takes more off a kayak' );
	const warned = { dock, weather, news: () => ( { stage: 'warning', onset: 200 } ) };
	ok( awayOf( left(), 110, warned ).tows.length === 1 && awayOf( left(), 110, { ...warned, aboard: true } ).tows.length === 0, 'with you aboard she\'s not towed in under you' );
	const l = leftOf( JSON.stringify( boatLeft( { x: 1, z: 2, heading: 0, anchor: null, sock: true, moored: false, aboard: null, T: 5, at: 1 } ) ) );
	ok( l.sock === true && leftOf( JSON.stringify( boatLeft( { x: 1, z: 2, heading: 0, anchor: null, moored: false, aboard: null, T: 5, at: 1 } ) ) ).sock === false, 'her sock comes back as it went' );
	const rec = cleanBoats( { a: boatRecord( { name: 'A', x: 1, z: 2, heading: 0, anchor: null, at: 1000, T: 100, drift: 0.02 } ) }, 1000 ).a;
	ok( rec.d === 0.02 && far( driftOf( { ...rec, x: 9000, z: 9000 }, 104, env ) ) < far( lob ), 'on others\' seas too, as she drifts' );

}

// ---- sleeping
{

	const dock = WORLD.boatDock.position;
	ok( restOf( 22 ) === 'dawn' && restOf( 3 ) === 'dawn' && restOf( 10 ) === 'dusk', 'a bunk gives you till dawn at night, dusk by day' );
	const left = { x: 9000, z: 9000, heading: 0, anchor: { x: 9000, z: 9000 }, moored: false, hauled: false, T: 100 };
	const weather = () => ( { id: 'fair', wind: 7, rain: 0, thunder: 0, windAngle: 0 } );
	const env = { dock, weather, news: () => null };
	ok( wakeOf( left, 100, 108, env ).why === null && wakeOf( left, 100, 108, env ).T === 108, 'a quiet night: all the way through' );
	const w = wakeOf( left, 100, 108, { ...env, at: ( t ) => ( t > 103 ? 2 : 0 ) } );
	ok( w.why === 'sea' && Math.abs( w.T - 103.25 ) < 0.01, 'too much sea wakes you' );
	const n = wakeOf( left, 100, 108, { ...env, news: ( t ) => ( t > 105 ? { stage: 'warning', onset: 200 } : null ) } );
	ok( n.why === 'hurricane' && n.T > 105 && n.T < 106, 'a hurricane warning wakes you' );
	const g = wakeOf( { ...left, anchor: null }, 100, 108, { ...env, depth: ( x ) => ( Math.abs( x - 9000 ) > 1500 ? 0.5 : 50 ) } );
	ok( g.why === 'aground' && g.T < 108, 'and going aground' );

}

// ---- the save
{

	const m = new Map(), store = { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) };
	const st = new GameState( store );
	st.days.boats.lobster = { ice: 9, stores: 2 };
	st.days.out = 20;
	st.days.flares = 1;
	st.save();
	const s2 = new GameState( store );
	ok( s2.load() && s2.days.boats.lobster.ice === 9 && s2.days.out === 20 && s2.days.flares === 1, 'the box, the lockers and your flares are kept' );
	const old = JSON.parse( [ ...m.values() ][ 0 ] );
	delete old.days;
	ok( cleanDays( old.days ).flares === 3 && Object.keys( cleanDays( old.days ).boats ).length === 0, 'a save from before: nothing aboard, your flares if you\'ve the kit' );
	ok( cleanDays( { boats: { wherry: { ice: 1 }, kayak: { ice: - 3, stores: 'x' } }, out: 'a' } ).boats.kayak.ice === 0 && ! cleanDays( { boats: { wherry: {} } } ).boats.wherry, 'a bad one, cleaned' );

}

// ---- the game side, on a stand-in for it
function stand( { boat = 'lobster', x = 9000, z = 9000, depth = 300 } = {} ) {

	const toasts = [], st = new GameState( null ), settings = { day: 5, timeOfDay: 22, timeSpeed: 0.01, weatherSince: 0 };
	st.boat = boat;
	st.fleet[ boat ] ||= {};
	st.money = 1000;
	const b = {
		position: new Vector3( x, 0, z ), quaternion: { setFromAxisAngle() {} }, velocity: new Vector3(), angular: new Vector3(), stemHead: new Vector3( 0, 1, 4 ), speed: 0, moored: false, anchor: null, sock: false, hauled: null, driven: false,
		model: { bunks: [], id: boat }, getYaw: () => 0, apply() {}, liftClear() {}, reset() { this.moored = true; this.position.set( dock.x, 0, dock.z ); this.sock = false; }, toWorld: ( v, o ) => o.copy( v ), setHauled() {},
	};
	const dock = WORLD.boatDock.position;
	const p = { mode: 'deck', riding: false, boat: b, deckPos: new Vector3( 0, 0, 0 ), prompt: null, busy: false, leaveHelm() { this.mode = 'deck'; }, deckToWorld() {} };
	const live = { ...weatherAt( 40, 'fair' ) };
	const app = { _pickedUp: true, settings, player: p, boatCtl: b, together: null, weather: { live, news: null }, terrainData: { heightAt: () => - depth }, weatherPick: () => 'fair', portal: null, camera: { position: new Vector3() } };
	const game = { app, state: st, hull: { flooded: false, wear: 0 }, toast: ( t ) => toasts.push( t ), time: null, hud: null, martaIn: true, dropAnchor() {}, _wearSaved: 0 };
	const d = new DaysOut( game );
	game.daysOut = d;
	const tick = ( dt = 1 ) => d.update( dt, { hit: () => false }, p );
	tick( 0 );
	tick( 0 );
	return { d, st, b, p, app, game, toasts, tick, settings };

}

globalThis.setTimeout ??= ( f ) => f();

{

	const { d, st, tick, settings, toasts } = stand();
	const f = st.addFish( 'mahi', 6, 22, { day: 5 } );
	ok( !! f, 'a fish in the box' );
	st.days.boats.lobster = { ice: 4.54, stores: 0 };
	tick( 0 );
	ok( f.v0 === f.value && f.w === 0, 'stamped as it comes in' );
	ok( Math.abs( d.box.ice - ( 4.54 - 6 * CHILL_KG ) ) < 1e-6, 'its heat melts some of the ice' );
	settings.timeOfDay += 0.2;
	tick( 2 );
	ok( f.w > 0 && f.w < 0.05, 'iced, it ages slowly as time goes by' );
	st.days.boats.lobster.ice = 0;
	settings.day ++;
	settings.timeOfDay -= 2.2;
	tick( 2 );
	ok( st.inventory.length === 0 && toasts.some( ( t ) => /went off/.test( t ) ), 'a day out in the heat with no ice: it\'s off, and you\'re told' );

	const a = stand();
	const g = a.st.addFish( 'mahi', 2, 10, { day: 5 } );
	a.tick( 0 );
	ok( a.d.awayHours( 8 ) === 0 && g.value < g.v0, 'away eight hours, no ice: going soft, not gone' );
	ok( a.d.awayHours( 8 ) === 1 && a.st.inventory.length === 0, 'and eight more: gone' );

}

// (the ice takes room; the fish come first)
{

	const { d, st, tick } = stand();
	d.box.ice = 25;
	st.addFish( 'mahi', 10, 22, { day: 5 } );
	tick( 0 );
	ok( d.box.ice <= 20 + 1e-6, 'you make room for fish with the ice' );

}

// the stores count only out at sea, and you've eaten when you're in
{

	const { d, st, tick, settings, b, p, toasts } = stand();
	d.box.stores = 1;
	settings.timeOfDay = 8;
	settings.day = 6;
	tick( 1 );
	ok( st.days.out >= 9.9 && d.box.stores === 1, 'ten hours out: still your lunch' );
	settings.day = 7;
	tick( 1 );
	ok( d.box.stores < 0.8, 'a day past that: into the stores' );
	settings.day = 8;
	tick( 1 );
	settings.day = 9;
	tick( 1 );
	ok( d.strength < 1 && toasts.some( ( t ) => /parched/.test( t ) ) && d.trouble() === 'you\'re parched', 'gone with none left, you\'re parched, and it\'s real trouble' );
	b.moored = true;
	settings.timeOfDay += 0.2;
	tick( 2 );
	ok( st.days.out === 0 && d.strength === 1, 'tied up, you\'ve eaten' );
	p.mode = 'walk';

}

// the sea here works her, and she ships water past it
{

	const { d, b, app, tick } = stand( { boat: 'console' } );
	app.weather.live = { ...weatherAt( 40, 'gale' ) };
	d._lookT = 0;
	tick( 1 );
	ok( d.strain >= 1 && d.awash > 0 && d.slamK === 1.5, `a gale in the console: strain ${ d.strain.toFixed( 2 ) }, shipping ${ d.awash.toFixed( 1 ) } L/s` );
	ok( d.saidHere().endsWith( 'too much for her' ) && d.trouble() === 'too much sea for her', 'the radio says so' );
	b.moored = true;
	ok( d.awash === 0, 'tied up she doesn\'t' );

}

// resting at sea, no bunks: not this far out; a boat with them: yes; near the island, yes
{

	const { d, b } = stand();
	ok( d.noRest, 'far out with no bunks: no rest' );
	b.model.bunks = [ { x: 0, y: 0, z: 0 } ];
	ok( ! d.noRest, 'with bunks, you can' );
	const near = stand( { x: 200, z: 100 } );
	ok( ! near.d.noRest, 'near the island, you can' );

}

// sleeping aboard: the prompt, the clock, the drift, what you find
{

	const { d, b, p, settings, app, toasts, tick } = stand();
	b.model.bunks = [ { x: 0, y: 0, z: 0 } ];
	b.sock = true;
	let pressed = false;
	d.update( 0, { hit: ( k ) => k === 'KeyE' && ! pressed && ( pressed = true ) }, p );
	ok( p.prompt && /Sleep aboard until dawn/.test( p.prompt.text ), 'E at the bunk, at night' );
	ok( settings.timeOfDay === 5.5 && settings.day === 6, 'till dawn' );
	const x0 = b.position.x, z0 = b.position.z;
	tick( 1 );
	const m = Math.hypot( b.position.x - x0, b.position.z - z0 );
	ok( m > 100, `she drifted ${ m.toFixed( 0 ) } m on her sock` );
	ok( toasts.some( ( t ) => /You slept till/.test( t ) && /drifted/.test( t ) ), `you're told: "${ toasts[ toasts.length - 1 ] }"` );
	ok( app.settings === settings, 'and the stand-in\'s clock is the game\'s' );

}

// anchored, she stays; a rest ashore tells you of her
{

	const { d, b, p, settings, tick, game } = stand();
	b.anchor = new Vector3( 9000, - 300, 9000 );
	b.model.bunks = [ { x: 0, y: 0, z: 0 } ];
	d.sleep();
	tick( 1 );
	ok( b.position.x === 9000, 'at anchor she holds' );
	const o = stand();
	o.p.mode = 'walk';
	o.b.position.set( 1500, 0, - 320 );
	let note = null;
	o.game.hud = { showAwayNote: ( n ) => note = n };
	o.settings.timeOfDay = 8;
	o.settings.day = 6;
	o.tick( 1 );
	ok( o.b.moored && note && /adrift/.test( note.join( ' ' ) ), 'you rest ashore, with her left adrift in sight: Marta fetches her, and says so' );
	ok( settings.day === 6 && game.state.money === 1000, 'and it costs you nothing where she held' );

}

// a passage at the helm: she's stopped first
{

	const { p, b, settings, tick } = stand();
	p.mode = 'boat';
	settings.day ++;
	tick( 1 );
	ok( p.mode === 'deck', 'rest at the helm: you leave it' );
	ok( b.position.x !== 9000, 'and she goes where the wind takes her' );

}

// flares and the EPIRB
{

	const { d, st, b } = stand();
	ok( d.distress().length === 0, 'none aboard, nothing on the panel' );
	st.upgrades.safety = 2;
	let rows = d.distress();
	ok( rows.length === 2 && rows.every( ( r ) => ! r.can ), 'with them, but not in trouble: not for use' );
	st.fuel = 0;
	rows = d.distress();
	ok( rows.every( ( r ) => r.can ) && /out of fuel/.test( rows[ 1 ].say ), 'out of fuel: for use' );
	const m0 = st.money;
	d.fire( 'epirb' );
	ok( b.moored && st.money < m0, 'the EPIRB: found and towed in, for the tow' );

	const f = stand( { x: 2000, z: - 320 } );
	f.st.upgrades.safety = 2;
	f.st.fuel = 0;
	f.d._launch = () => {};
	const G0 = f.d.fire( 'flare' );
	ok( G0 === true && f.st.days.flares === 2, 'a flare within sight of the island: seen' );
	const n = stand( { x: 20000, z: 20000 } );
	n.st.upgrades.safety = 2;
	n.st.fuel = 0;
	n.d._launch = () => {};
	ok( n.d.fire( 'flare' ) === false && n.toasts.some( ( t ) => /Nobody/.test( t ) ) && ! n.b.moored, 'far out by day, nobody sees it' );

}

// and someone else's, seen as far as it would be
{

	const { d, toasts, app } = stand();
	let up = null;
	d._launch = ( x, z ) => up = [ x, z ];
	app.camera.position.set( 0, 0, 0 );
	d.theirFlare( [ 40000, 0 ], 'Sam' );
	ok( ! up, 'too far off by day: not seen' );
	d.theirFlare( [ 3000, 0 ], 'Sam' );
	ok( ! up, '(M17) 3 km off by day: past a red meteor\'s 2.8 km' );
	d.theirFlare( [ 2500, 0 ], 'Sam' );
	ok( up && up[ 0 ] === 2500 && /Sam has fired a distress flare/.test( toasts.at( - 1 ) ), 'near enough: seen, and said whose' );
	// ((M17) and the look agrees with it: gone at the reach, by day and by night, and seen inside it)
	ok( FLARE_M.day === 2800 && FLARE_M.night === 25000, 'a red meteor: 2.8 km by day, 25 by night' );
	ok( d._flareBright( FLARE_M.day, 1, 0 ) === 0 && d._flareBright( 2500, 1, 0 ) >= 0.4 && d._flareBright( 300, 1, 0 ) > 0.9, `by day drawn to its reach and no further: ${ d._flareBright( 300, 1, 0 ).toFixed( 2 ) } at 300 m, ${ d._flareBright( 1500, 1, 0 ).toFixed( 2 ) } at 1.5 km, ${ d._flareBright( 2500, 1, 0 ).toFixed( 2 ) } at 2.5 km, still a red point over the day's sky (0.38 at least)` );
	ok( d._flareBright( FLARE_M.night, 1, 1 ) === 0 && d._flareBright( 8000, 1, 1 ) > 0.5 && d._flareBright( FLARE_M.day * 0.5, 0.5, 0 ) === 0, 'by night to 25 km; in half the visibility, half the reach' );

}

// with nothing to call with, someone happens by in the end
{

	const { b, st, settings, tick } = stand( { x: 2000, z: 2000, boat: 'console' } );
	st.fuel = 0;
	st.money = 50;
	for ( let i = 0; i < 12; i ++ ) {

		settings.timeOfDay = 8 + i * 0.45;
		settings.day = 6;
		tick( 1 );

	}

	ok( b.moored, 'a passing boat, after a few hours' );

}

// (M16) what you carry decides who comes: in a kayak, which can now reach her radio and flares from the seat
{

	const { d, st, b } = stand( { x: 2000, z: 2000, boat: 'kayak' } );
	let rescued = 0;
	d.rescue = () => rescued ++;
	d.trouble = () => 'too much sea for her';
	const after = ( hours, stats, flares = 3, x = 2000 ) => {

		rescued = 0;
		d._stranded = 0;
		b.position.x = x;
		st.days.flares = flares;
		Object.defineProperty( st, 'stats', { configurable: true, get: () => stats } );
		for ( let i = 0; i < hours; i ++ ) d._rescueNet( 1 );
		return rescued > 0;

	};

	ok( after( 4, { vhfH: 0 } ), 'nothing to call with: a passing boat, within 4 hours near in' );
	ok( ! after( 40, { vhfH: VHF_H.hand } ), 'a handheld in range: you call for yourself' );
	ok( after( 18, { vhfH: VHF_H.hand }, 3, 20000 ) && ! after( 17, { vhfH: VHF_H.hand }, 3, 20000 ), 'a handheld out of range doesn\'t count: a passing boat, within 18 hours far out' );
	ok( ! after( 40, { vhfH: 0, flares: true } ), 'flares left: you fire them' );
	ok( after( 4, { vhfH: 0, flares: true }, 0 ), 'the flares gone: a passing boat' );
	ok( ! after( 40, { vhfH: 0, flares: true, epirb: true }, 0 ), 'an EPIRB always reaches someone' );
	delete st.stats;

}

// ---- the sonar and the shop
{

	const { d, st } = stand();
	st.upgrades.fishFinder = 1;
	ok( d.sonar( 100, 1.4 ).depth === 100 && d.sonar( 800, 1.4 ).depth === null && d.sonar( 800, 1.4 ).fish === 0.5, 'past her finder\'s reach it\'s lost the bottom' );
	st.upgrades.deepFinder_lobster = 1;
	ok( d.sonar( 800, 1.4 ).depth === 800 && d.sonar( 1500, 1.4 ).depth === null, 'the deep finder has it to 3,000 ft' );

	const el = () => ( { querySelector: ( q ) => ( { '[data-ice]': i, '[data-stores]': s }[ q ] ) } );
	const i = {}, s = {};
	const html = d.shopRows();
	ok( html.includes( 'data-ice' ) && html.includes( 'data-stores' ) && html.includes( 'nearshore' .replace( 'n', 'N' ) ), 'Marta sells ice and stores, and says what she can stand' );
	ok( STORES_WATER_L === 6 && STORES_PRICE === 16 && html.includes( 'A day\'s food and 1.6 gallons of water' ) && html.includes( '$16 a day' ), '(M17) a day\'s stores: its food and 6 litres of water, $16' );
	d.bindShop( el(), () => {} );
	const m0 = st.money;
	i.onclick();
	s.onclick();
	ok( d.box.ice === ICE_BAG_KG && d.box.stores === 1 && st.money === m0 - ICE_BAG_PRICE - STORES_PRICE, 'a bag and a day' );

}

// ---- the deep finder's screen draws
{

	const calls = [];
	const g = { canvas: { width: 184, height: 92 }, fillRect: ( ...a ) => calls.push( a ), fillStyle: '' };
	drawEcho( g, [ { depth: 500, fish: [ 0.5, - 1, - 1 ] }, { depth: null, fish: [ - 1, - 1, - 1 ] } ] );
	ok( calls.length > 5 && calls.every( ( c ) => c.every( Number.isFinite ) ), 'its echo, and no bottom where it\'s lost it' );

}

// (M17) the sock's float on the water, as the waves have it there: their height has the sea's level in it already
// (it sat at twice the tide's height while the tide was in the sea's level)
{

	const { d, app } = stand();
	const level = G.seaLevel.value;
	G.seaLevel.value = 0.55;
	app.waves = { heightAt: () => G.seaLevel.value + 0.1 };
	app.scene = { add() {} };
	const out = d.sockPoint( new Vector3() );
	ok( Math.abs( out.y - 0.65 ) < 1e-9 && Math.abs( d.float.position.y - 0.73 ) < 1e-9, `the sock's float rides the sea at high water (${ out.y.toFixed( 2 ) } m on a sea at 0.55 m and a wave 0.1 m)` );
	app.waves = null;
	ok( Math.abs( d.sockPoint( new Vector3() ).y - 0.55 ) < 1e-9, 'and with no waves, on the sea\'s level' );
	G.seaLevel.value = level;

}

// (islandTime's what the clock's jumps are measured in)
ok( islandTime( 2, 3 ) === 27, 'the time' );
ok( CONDITIONS.gale.wind === 20, '(a gale\'s wind, as the figures take it)' );

if ( bad ) {

	console.error( `\ndays out: ${ bad } failed` );
	process.exit( 1 );

}

console.log( '\ndays out: all passed' );
