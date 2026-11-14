import { Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import * as Gear from './Gear.js';
import { BOATS } from '../world/boat/Boats.js';
import { WORLD } from '../world/WorldLayout.js';
import { CONDITIONS, islandTime } from './Weather.js';
import { CAMP } from './FishCamp.js';
import { isOpen } from './IslandClock.js';
import { boatAt, hauledAt, BOAT } from './PearlsDay.js';
import { farOff } from './Units.js';
import { reachTo } from './Seaworthy.js';

// (M16) Help on the water, other than Marta's tow: the radio's (Radio.js) other two things to ask for.
//   - Pearl, on the north side (nearer her jetty than Marta's dock, or round on the windward shore), through her hours and
//     in weather her boat goes out in: her man brings the pirogue out and tows you in to her jetty, not the bay. By the
//     distance, as Marta's is, at the pirogue's own rates: she's a smaller boat than Marta's and it costs less to run.
//   - Marta's can of diesel: a fuel drop, as the towing firms do. She comes out with 19 L (5 gallons) and you stay where you
//     are. The towing firms' members pay for the fuel alone and everyone else pays for the boat's time: Marta's time at her
//     tow's rate, out and back at speed, half the boat hours of a tow, and a call-out. It costs more than the fuel always,
//     more than a tow in the bay (a tow's a short job there), and less past CAN_PAYS.
// A boat with no fuel gets no can. Gasoline boats get gasoline; what a boat burns is read in one place, fuelOf.
// Pure sums first, for test/north-pearl.mjs.

export const PEARL_TOW = { base: 15, per100m: 4, from: 30, out: 9, back: 2.6 }; // $; m; m/s: the pirogue, 18 knots out, 5 in tow
export const NO_PEARL = CONDITIONS.blustery.wind; // m/s: a 24-foot open boat stays in sooner than Marta does
export const CAN = { litres: 19, callOut: 40, per100m: Gear.TOW.per100m / 2 }; // 5 gallons; $; half the tow's boat hours
export const pearlFee = ( metres ) => Math.round( PEARL_TOW.base + PEARL_TOW.per100m * Math.max( 0, metres ) / 100 );
export const pearlTime = ( metres ) => Math.max( 0, metres ) * ( 1 / PEARL_TOW.out + 1 / PEARL_TOW.back );
// where she lies at the jetty: its head's east face, bow to the sea, on the camp's mooring
const FACE = { x: CAMP.jetty.x + CAMP.jetty.headWidth - CAMP.jetty.width / 2, z: CAMP.jetty.z1 + 3 };

// (the boats' `fuel` is the one place; her litre at the chandlery's price, Gear's)
export const fuelOf = ( boat ) => ( BOATS[ boat ] ? BOATS[ boat ].fuel : null ) || null;
export const canFee = ( metres, boat = 'lobster', litres = CAN.litres ) => Math.round( CAN.callOut + CAN.per100m * Math.max( 0, metres ) / 100 + litres * Gear.fuelPrice( boat ) );
// how far off the can's cheaper than the tow (m), for what she burns
export const canPays = ( boat = 'lobster' ) => ( CAN.callOut + CAN.litres * Gear.fuelPrice( boat ) - Gear.TOW.base ) / ( Gear.TOW.per100m - CAN.per100m ) * 100;
export const CAN_PAYS = canPays();

// on the north side, as her own jetty and the island's windward measure have it
export function northSide( x, z, windward = 0 ) {

	const J = CAMP.jetty, D = WORLD.boatDock.position;
	return windward > 0.5 || Math.hypot( x - J.x, z - J.z1 ) < Math.hypot( x - D.x, z - D.z );

}

// ---- what's on offer, from the game

// a can for her: { metres, fee, litres, fuel }, or null (no engine, a full tank, or not out there)
export function canJob( game ) {

	const job = game.towJob( true ), fuel = fuelOf( game.state.boat );
	if ( ! job || ! fuel ) return null;
	const room = game.state.stats.fuelL - game.state.fuelL, litres = Math.min( CAN.litres, Math.floor( room ) );
	if ( litres <= 0 ) return null;
	return { metres: job.metres, fee: canFee( job.metres, game.state.boat, litres ), litres, fuel };

}

// Pearl for her: null if you're not on the north side; else { metres, fee, time, open, here }
export function pearlJob( game ) {

	const b = game.app.boatCtl;
	if ( ! b || b.hauled ) return null;
	const { x, z } = b.position;
	if ( ! northSide( x, z, game.windwardAt ? game.windwardAt( x, z ) : 0 ) ) return null;
	const metres = Math.hypot( x - FACE.x, z - FACE.z ), s = game.app.settings;
	return { metres, fee: pearlFee( metres ), time: pearlTime( metres ), open: isOpen( CAMP.hours, s.timeOfDay ), here: metres <= PEARL_TOW.from };

}

// the call to her: what she says, and whether she'll come
export function pearlCall( game ) {

	const job = pearlJob( game );
	if ( ! job ) return null;
	const app = game.app, s = app.settings, wx = game.weatherNow, news = app.weather && app.weather.news, pick = app.weatherPick ? app.weatherPick() : null;
	const blown = wx && wx.wind >= NO_PEARL, warned = news && news.stage !== 'outlook', up = hauledAt( islandTime( s.day, s.timeOfDay ), pick, s.weatherSince );
	let say, can = false;
	// (as Marta's: a set reaches so far, (M17) to her own antenna on the camp's shed: Seaworthy.reachTo)
	if ( job.metres > reachTo( game.state.stats, 'pearl' ) ) say = `Nothing but static. You're ${ farOff( job.metres ) } off her jetty, past your set's reach.`;
	// ((M19) the island between you and her aerial on the camp's shed)
	else if ( game.daysOut && game.daysOut.radioSees && ! game.daysOut.radioSees( 'pearl' ) ) say = 'Nothing but static. The island\'s between you and Pearl\'s camp.';
	else if ( blown || warned || up ) say = `Pearl. The boat's not going out in this: ${ warned ? 'there\'s a hurricane on its way, and she\'s up the beach' : up ? 'she\'s up the beach till it\'s blown through' : 'she\'s too small for it' }. Try Marta, or sit tight and call me when it's dropped.`;
	else {

		const pays = Math.min( job.fee, game.state.money ), out = job.metres / PEARL_TOW.out, kind = boatAt( s.timeOfDay, s.day, pick, s.weatherSince ).kind;
		const words = ( t ) => {

			const m = Math.max( 5, Math.round( t / 60 / 5 ) * 5 );
			return m < 60 ? `${ m } minutes` : `${ Math.floor( m / 60 ) } hour${ m >= 120 ? 's' : '' }${ m % 60 ? ` ${ m % 60 } minutes` : '' }`;

		};
		const who = kind === 'away' || kind === 'going' ? 'Winston\'s out on the grounds in the boat, I\'ll raise him and he\'ll come by you' : 'I\'ll send Winston out in the boat';
		say = `Pearl. I see you, ${ farOff( job.metres ) } off my jetty. ${ who }: ${ words( out ) } to reach you, ${ words( job.time - out ) } back in tow, and she lies on my mooring, not at the bay. $${ job.fee.toLocaleString() } for the boat.${ pays < job.fee ? ` You've only $${ pays.toLocaleString() }? That'll do.` : '' }`;
		can = true;

	}

	return { job, say, can, who: 'pearl', drop: null };

}

// Marta's words on the can (put after her tow's)
export function canWords( game, drop ) {

	const pays = Math.min( drop.fee, game.state.money ), name = drop.fuel === 'gasoline' ? 'gas' : 'diesel';
	return ` Or I'll run you out a can, ${ drop.litres } litres of ${ name }, and you bring yourself home: $${ drop.fee.toLocaleString() }.${ pays < drop.fee ? ` For that one I'll take your $${ pays.toLocaleString() }.` : '' }`;

}

// ---- doing it: the world dims a moment, and it's done (no time passes, the island's clock being everyone's)
const dimmed = ( game, go ) => {

	if ( game.time && game.time.dim() ) setTimeout( go, 230 );
	else go();

};

// her can, in your tank; returns what you paid
export function deliverCan( game ) {

	const drop = canJob( game );
	if ( ! drop ) return 0;
	const st = game.state, paid = st.payTow( drop.fee );
	dimmed( game, () => {

		st.fuel = st.fuelL + drop.litres;
		if ( st.fuel >= st.stats.fuelL - 1e-3 ) st.fuel = null;
		game._fuelOut = false;
		st.save();
		st.emit();
		game.toast( `Marta came out with a can · ${ drop.litres } L of ${ drop.fuel } in the tank · ${ paid < drop.fee ? `she took the $${ paid } you had` : `$${ paid }` }`, 4600 );

	} );
	return paid;

}

// her tow, to her jetty; returns what you paid. You're on deck, at her mooring off its head, the drums at its foot
export function towToPearl( game ) {

	const job = pearlJob( game ), p = game.app.player, b = game.app.boatCtl;
	if ( ! job ) return 0;
	const paid = game.state.payTow( job.fee );
	game._anchorDue = false;
	dimmed( game, () => {

		if ( p.mode === 'boat' && p.boat === b ) p.leaveHelm();
		lieAtFace( b, game.app.terrainData );
		if ( p.mode === 'deck' && p.boat === b ) p.deckToWorld();
		if ( game.app.saveBoat ) game.app.saveBoat();
		game.toast( `Winston towed her in · ${ paid < job.fee ? `Pearl took the $${ paid } you had` : `$${ paid }` } · she's on the camp's mooring, diesel's in the drums`, 5200 );

	} );
	return paid;

}

// she's put by the jetty's head, bow to the sea, lying to the mooring off its east face (a boat's half width clear of it)
export function lieAtFace( b, terrain ) {

	const out = b.outline && b.outline.length ? b.outline : [ { x: 1.5, z: 7 } ], half = Math.max( ...out.map( ( q ) => Math.abs( q.x ) ) ), long = Math.max( ...out.map( ( q ) => Math.abs( q.z ) ) );
	const x = FACE.x + half + 0.45, z = FACE.z;
	b.hauled = null;
	b.moored = false;
	b.position.set( x, G.seaLevel.value, z );
	b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), BOAT.berth.heading );
	b.velocity.set( 0, 0, 0 );
	b.angular.set( 0, 0, 0 );
	b.throttle = 0;
	b.steer = 0;
	b.rpm = 0;
	const az = z - long - 1;
	b.anchor = new Vector3( x, terrain ? terrain.heightAt( x, az ) : - 3, az );
	b.hasWater = false;

}
