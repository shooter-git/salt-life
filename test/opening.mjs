// (M16) A new player's start (docs/m16/opening.md): which boat, what the Guide says for her, and how Marta brings up her list.
// What's underneath, per boat: the gear that used to do nothing, and a gale's figures.
import { BOATS, START_BOAT } from '../src/world/boat/Boats.js';
import { GameState } from '../src/game/GameState.js';
import { tipFor } from '../src/game/Guide.js';
import { martaSays, fleetRows } from '../src/game/fleet/FleetPanel.js';
import { FLEET } from '../src/game/fleet/Fleet.js';
import { UPGRADES, gearStats, defaultUpgrades } from '../src/game/Gear.js';
import { habitatAt, pickSpecies, biteDelay } from '../src/game/Bites.js';
import { spillShare } from '../src/world/boat/kayak/Capsize.js';
import { HULLS, slamWear } from '../src/game/Hull.js';
import { breakingLitres } from '../src/game/BreakingSeas.js';
import { ABLE } from '../src/game/Seaworthy.js';
import { DaysOut } from '../src/game/DaysOut.js';

let bad = 0;
const ok = ( c, msg ) => {

	if ( ! c ) bad ++;
	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ msg }` );

};

const mem = () => {

	const m = new Map();
	return { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) };

};

// ---- the start
const fresh = new GameState( mem() );
ok( START_BOAT === 'kayak' && fresh.boat === 'kayak' && Object.keys( fresh.fleet ).join() === 'kayak', 'a brand-new save starts in the kayak, and has no other' );
ok( fresh.stats.fuelL === 0 && fresh.money === 0, 'no fuel to buy, nothing in your pocket' );
const v1 = new GameState( mem() );
ok( v1.fromJSON( { v: 1, money: 900, upgrades: { hold: 2, engine: 1 }, fuel: 30 } ) && v1.boat === 'lobster' && v1.owns( 'kayak' ) && v1.stats.holdKg === 160 && v1.fuel === 30 && v1.money === 900, 'a v1 save keeps the lobster boat, with her gear and her tank, and gets the kayak' );
ok( ! v1.fleet.lobster.paid && ! v1.owns( 'console' ), 'nothing paid for her, and the console still to buy' );

// ---- a clock jump (a rest, or a tab left a minute): a kayak on the sand hasn't drifted, and one you're in still has you in her seat
{

	const left = DaysOut.prototype._left.call( { app: { boatCtl: { position: { x: 1, z: 2 }, getYaw: () => 0, anchor: null, moored: false, beached: true, hauled: null, sock: false } } }, 5 );
	ok( left.moored === true, 'drawn up on the sand she counts as made fast, not as drifting ashore' );

}

// ---- the Guide's words, in a kayak: no helm, no fuel; on any device
const helm = /helm|diesel|gasoline|bilge|wheel|throttle/i;
for ( const d of [ 'keyboard', 'touch', 'gamepad' ] ) {

	for ( const id of [ 'kayak', 'marta', 'caught', 'full', 'stand', 'camp', 'chart', 'edge', 'goRound', 'hurricane', 'shoveOff', 'list' ] ) {

		const t = tipFor( id, d, fresh );
		ok( typeof t === 'string' && t.length > 20 && ! helm.test( t ), `${ d }, ${ id }: nothing of a helm or fuel in a kayak` );

	}

}

const inConsole = new GameState( mem() );
inConsole.addBoat( 'console' );
inConsole.selectBoat( 'console' );
ok( /Gasoline/.test( tipFor( 'boat', 'keyboard', inConsole ) ) && /gasoline/.test( tipFor( 'marta', 'keyboard', inConsole ) ) && /gasoline/.test( tipFor( 'engine', 'touch', inConsole ) ), 'in the console, it\'s her helm and her gasoline' );
ok( /Diesel/.test( tipFor( 'boat', 'gamepad', v1 ) ), 'in the lobster boat, her diesel' );
ok( tipFor( 'list', 'keyboard', fresh ).includes( `$${ FLEET.console.price.toLocaleString() }` ) && /sportfisher/.test( tipFor( 'list', 'keyboard', fresh ) ), 'her list comes up in play: the console at her price, and the shape under her' );

// ---- Marta at her counter
ok( /console/.test( martaSays( fresh ) ), 'Marta to someone in a kayak: the console' );
fresh.money = FLEET.console.price;
ok( /now/.test( martaSays( fresh ) ), 'and when they could have her' );
ok( martaSays( inConsole ) === null || /kayak/.test( martaSays( inConsole ) ) === false, 'not once you\'ve an engine' );
{

	const h = fleetRows( { game: { state: fresh, app: {}, towJob: () => null, repairJob: () => null, haulJob: () => null, fleet: { berthWord: () => '' } } } );
	ok( h.includes( 'is-shadow' ) && h.includes( 'The lobster boat first' ), 'the silhouette says the lobster boat comes first, if you\'ve not got her' );

}

// ---- the pace (tools/earnings.mjs has the working)
ok( FLEET.kayak.price < FLEET.console.price && FLEET.console.price < FLEET.lobster.price && FLEET.lobster.price < FLEET.sportfisher.price, 'each boat dearer than the one before' );
for ( const id of Object.keys( BOATS ) ) if ( id !== 'kayak' ) ok( FLEET[ id ].upkeep === Math.round( FLEET[ id ].price / 10 / 12 ), `${ id }'s upkeep: a tenth of her price a year` );

// ---- the gear
const with_ = ( k, n = 1 ) => ( { ...defaultUpgrades(), [ k ]: n } );
ok( ! ( 'jacketRoom' in gearStats( with_( 'kayakHatch' ), 'kayak' ) ) && gearStats( with_( 'kayakHatch' ), 'kayak' ).dryHatch === true && spillShare( false, true ) === spillShare( false ) / 2, 'the dry hatch: half as much goes when she turns over' );
ok( gearStats( with_( 'consoleWell' ), 'console' ).livewell === true && gearStats( with_( 'baitWell', 2 ), 'lobster' ).livewell === true && gearStats( defaultUpgrades(), 'sportfisher' ).livewell === true && ! gearStats( defaultUpgrades(), 'console' ).livewell, 'a livewell on each boat that has one' );
{

	const avg = ( h ) => {

		let t = 0;
		for ( let i = 0; i < 4000; i ++ ) t += biteDelay( h, 10, () => ( i * 0.61803 ) % 1, 'mullet' );
		return t / 4000;

	};
	const h = habitatAt( { depth: 8, reefDist: 300, pierDist: 300 } );
	ok( avg( { ...h, lively: true } ) < avg( h ) * 0.95, 'live bait from a pumped well: bites come sooner' );

}

{

	const blue = habitatAt( { depth: 1200, reefDist: 3000, pierDist: 3000 } );
	const share = ( h ) => {

		let n = 0, r = 1;
		const rng = () => ( r = ( r * 16807 ) % 2147483647 ) / 2147483647;
		for ( let i = 0; i < 8000; i ++ ) if ( pickSpecies( h, 23, rng ) === 'swordfish' ) n ++;
		return n / 8000;

	};
	const dark = share( blue ), lit = share( { ...blue, under: 1 } );
	console.log( `     a bite at 11 at night in the blue, a swordfish: ${ ( dark * 100 ).toFixed( 0 ) }%, under the lights ${ ( lit * 100 ).toFixed( 0 ) }%` );
	ok( lit > dark * 1.5, 'underwater lights draw swordfish at night' );
	ok( UPGRADES.sfUnderwaterLights.levels[ 1 ].underwaterLights === true, 'and they\'re what the track sells' );

}

// ---- a gale, per boat
ok( slamWear( 1, 'console' ) > slamWear( 1, 'lobster' ) && slamWear( 1, 'lobster' ) > slamWear( 1, 'sportfisher' ), 'a light hull\'s pounded harder than a big one by the same slam' );
ok( Math.abs( breakingLitres( 3.66, 'lobster' ) - 60 ) < 1e-6 && breakingLitres( 3.66, 'console' ) < 60 && breakingLitres( 3.66, 'sportfisher' ) < 60 && breakingLitres( 3.66, 'kayak' ) === 0, 'a breaking sea: each boat takes her own, self-bailing ones less, a kayak none in her bilge' );
ok( HULLS.console.knock > HULLS.lobster.knock && HULLS.lobster.knock > HULLS.sportfisher.knock, 'and a light boat\'s thrown further' );
ok( ABLE.console.cruise.speed === 12.1 && ABLE.sportfisher.cruise.speed === 13.1, 'the real boats\' cruise, measured' );

console.log( bad ? `\n${ bad } failed` : '\nopening: all passed' );
process.exit( bad ? 1 : 0 );
