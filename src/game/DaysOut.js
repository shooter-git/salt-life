import { CanvasTexture, Mesh, MeshStandardMaterial, SphereGeometry, Sprite, SpriteMaterial } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { BOATS } from '../world/boat/Boats.js';
import { awayOf, tellOf, ISLE, FOUND_M } from './Away.js';
import { awayTowFee, TOW } from './Gear.js';
import { restTo, timeText, REST } from './IslandClock.js';
import { islandTime, towardOf, weatherHere, hurricaneNews } from './Weather.js';
import { FT, feet, farOff, pounds, knots } from './Units.js';
import { FLEET } from './fleet/Fleet.js';
import { berthOf } from './fleet/Berths.js';
import { ableOf, ableEnv, awashLs, seaHere, fetchAt, strainOf, windOn, slamK, keepCatch, feedOf, strengthOf, meltKgH, GENERATOR_LH, CHILL_KG, ICE_BAG_KG, ICE_BAG_PRICE, STORES_PRICE, LUNCH_H, DRY_H, FRESH_H, FLARES, FLARE_M, EPIRB_S, PASSING_H } from './Seaworthy.js';

// (M16) Days out, and what each boat can stand: ice and the catch keeping, stores, sleeping aboard, flares and the EPIRB,
// the drift sock, the deep finder's screen. The figures are Seaworthy.js'. Game makes one and calls update each frame; what
// doesn't need the game is exported for the tests under Node.
//   d.update( dt, inp, p )   d.strain: how she's being worked here (Seaworthy.strainOf)
//   d.sleep()                turning in, at a bunk (Vessel.bunks) or from the clock's menu
//   d.noRest                 too far out to rest, with no bunks aboard (TimeHUD)
//   d.shopRows() d.bindShop( el )   Marta's ice and stores
//   d.distress() d.fire( kind )     the radio panel's flares and EPIRB (Radio.js)
//   d.sonar( depth, rich )   what the finder reads (Game.updateBoat)
//   d.awayHours( h )         the box over hours you weren't there -> how many fish went off (App.pickUp)
//   d.strength               what thirst has left you of your strength (Game's reel)

// a clock that moves by more than this is a rest, not time going by; by more than JUMP_MAX, another room's day (island hours)
const JUMP = 0.5, JUMP_MAX = 30;
// how far you can reach a bunk (m), how much sea wakes you; how many frames apart it all looks (s)
const BUNK_M = 1.6, LOOK_S = 1;
// the sock's rode: streamed this far upwind of her (m), its trip line's float on the water over it
const SOCK_OUT = 26;
// a flare's climb (m/s, m) and burn (s)
const FLARE = { rise: 28, up: 120, burn: 8 };
// the deep finder's screen: columns kept and a look every (s)
const PINGS = 120, PING_S = 0.5, RANGES = [ 60, 120, 300, 600, 1200, 2000 ];

// the rest a bunk gives at this hour: dawn, from dusk till it; dusk, by day
export const restOf = ( hour ) => ( hour >= REST.dusk || hour < REST.dawn ? 'dawn' : 'dusk' );

// Where a night's sleep ends: T1, or sooner if something wakes you. env: awayOf's, plus at( t ) -> strain; news( t ).
// -> { T, why: null | 'sea' | 'hurricane' | 'aground' }
export function wakeOf( left, T0, T1, env ) {

	const story = awayOf( left, T1, { ...env, aboard: true } );
	let end = story.groundT ?? T1, why = story.groundT !== undefined ? 'aground' : null;
	const start = env.at ? env.at( T0 ) : 0;
	for ( let t = T0 + 0.25; t < end; t += 0.25 ) {

		const n = env.news ? env.news( t ) : null;
		if ( n && ( n.stage === 'warning' || t >= n.onset ) && ! ( env.news( T0 ) && env.news( T0 ).stage === 'warning' ) ) return { T: t, why: 'hurricane' };
		if ( env.at && start < 1 && env.at( t ) >= 1 ) return { T: t, why: 'sea' };

	}

	return { T: end, why };

}

const CSS = /* css */`
.do-screen { position: absolute; right: calc(var(--tw-edge) + 192 * var(--tw-u)); bottom: var(--tw-edge); width: calc(184 * var(--tw-u)); height: calc(92 * var(--tw-u)); border-radius: var(--tw-r-sm, 6px); overflow: hidden; pointer-events: none; display: none;
	box-shadow: 0 1px 6px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1); background: #04122a; }
.do-screen.is-on { display: block; }
.do-screen canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.do-screen b { position: absolute; left: calc(5 * var(--tw-u)); top: calc(3 * var(--tw-u)); font: 600 var(--tw-fs-xs) var(--tw-mono); color: #ffe36a; text-shadow: 0 1px 2px #000; }
.do-screen i { position: absolute; right: calc(5 * var(--tw-u)); bottom: calc(3 * var(--tw-u)); font: 500 var(--tw-fs-xs) var(--tw-mono); font-style: normal; color: #cfe3f5; text-shadow: 0 1px 2px #000; }
.tw-root[data-panel='open'] .do-screen { display: none; }
.gm-ice-bar > span { background: #a8dcf0; }
.gm-ice.is-low .gm-ice-bar > span { background: var(--tw-coral); }
/* (a phone's purse has no room to spare: the toast goes beside it. Only when they want seeing to; the rest's in the cooler's tab) */
html.is-touch .gm-ice:not(.is-low), html.is-touch .gm-stores:not(.is-low) { display: none; }
html.is-touch .do-screen { right: auto; bottom: auto; left: var(--tw-edge); top: calc(var(--tw-edge) + 64px + 48 * var(--tw-u)); width: calc(132 * var(--tw-u)); height: calc(66 * var(--tw-u)); }
@media (orientation: portrait) { html.is-touch .do-screen { top: auto; bottom: 30vh; } }
html.is-touch .tw-root:has(.gm-panel.is-open, .gm-coach.is-on) .do-screen { display: none; }
`;

export class DaysOut {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.strain = 0;
		this.sea = 0; // m, the seas where she is
		this.wind = 0; // m/s, on her
		this._T = null;
		this._t = 0;
		this._lookT = 0;
		this._said = 0; // (how hard the sea's been said to be working her: 1 rough, 2 too much)
		this._woke = null;
		this._stranded = 0;
		this._warm = false; // (said the catch is going soft)
		this._iced = true; // (said the ice is gone)
		this._ping = 0;
		this.pings = [];
		this.flare = null;

	}

	get state() {

		return this.game.state;

	}

	get box() {

		const d = this.state.days.boats, id = this.state.boat;
		return d[ id ] || ( d[ id ] = { ice: 0, stores: 0 } );

	}

	// you're aboard your own boat
	get aboard() {

		const p = this.app.player;
		return ( p.mode === 'boat' || p.mode === 'deck' ) && ! p.riding && p.boat === this.app.boatCtl;

	}

	get strength() {

		return strengthOf( this.state.days.dry );

	}

	get slamK() {

		return slamK( this.strain );

	}

	// the green water coming aboard (Hull.step's awash), L/s
	get awash() {

		const b = this.app.boatCtl;
		return b.moored || b.hauled ? 0 : awashLs( this.strain );

	}

	// too far from anywhere to rest, with nowhere aboard to do it: the clock's menu offers none
	get noRest() {

		const b = this.app.boatCtl, t = this.app.together;
		return this.aboard && ! b.moored && ! b.hauled && ! ( b.model.bunks && b.model.bunks.length ) && ( ! t || t.surelyAlone )
			&& Math.hypot( b.position.x - ISLE.x, b.position.z - ISLE.z ) > FOUND_M;

	}

	// ---- per frame
	update( dt, inp, p ) {

		this._clock( dt );
		if ( ( this._lookT -= dt ) <= 0 ) {

			this._lookT = LOOK_S;
			this._look();

		}

		this._bunkPrompt( inp, p );
		this._updateFlare( dt );
		this._screen( dt );
		if ( this.float && this.float.visible && ! this.app.boatCtl.sock ) this.sockIn();

	}

	// the island's time going by, a second at a time; a rest all at once
	_clock( dt ) {

		const app = this.app, t = app.together, s = app.settings, T = islandTime( s.day, s.timeOfDay );
		if ( ! app._pickedUp || ( t && ! t.roomKnown ) || this._T === null ) {

			this._T = T;
			return;

		}

		const h = T - this._T;
		this._stamp();
		if ( h < - JUMP || h > JUMP_MAX ) this._T = T;
		else if ( h > JUMP ) {

			this._T = T;
			this.passed( T - h, T );

		} else if ( ( this._t += dt ) >= LOOK_S && h > 0 ) {

			this._t = 0;
			this._T = T;
			this.pass( h );

		}

	}

	// a fish new in the box: what it fetched fresh, and the heat it gives up to the ice. Any that's more than the box holds
	// besides goes over the side (you make room for fish with the ice)
	_stamp() {

		const st = this.state, box = this.box;
		let n = 0;
		for ( const f of st.inventory ) if ( f.v0 === undefined ) {

			f.v0 = f.value;
			f.w = 0;
			box.ice = Math.max( 0, box.ice - CHILL_KG * f.kg );
			n ++;

		}

		if ( n ) box.ice = Math.min( box.ice, Math.max( 0, st.stats.holdKg - st.holdKg ) );

	}

	// `hours` go by. away: you weren't there (no stores eaten) -> how many fish went off
	pass( hours, away = false ) {

		const st = this.state, box = this.box, s = st.stats, had = st.inventory.map( ( f ) => f.value );
		// ((M16) an icemaker wants AC: shore power at her berth or on the hard, the generator anywhere else, for as long as she's fuel)
		const b = this.app.boatCtl, shore = ! b || b.moored || b.hauled, runs = s.icemaker && ! shore && s.generator && st.fuelL > 0;
		if ( runs ) st.burn( GENERATOR_LH * hours );
		const r = keepCatch( st.inventory, box.ice, hours, meltKgH( s.holdKg, s.insulated ), shore || runs ? s.iceMakesKgH || 0 : 0 );
		box.ice = r.ice;
		st.inventory = r.fish;
		const changed = r.off.length > 0 || r.fish.some( ( f, i ) => f.value !== had[ i ] );
		if ( changed ) st.emit();
		if ( r.off.length ) st.save();
		if ( ! away ) {

			this._feed( hours );
			this._rescueNet( hours );
			this._warn( r.off.length );

		}

		return r.off.length;

	}

	awayHours( hours ) {

		this._stamp();
		return this.pass( hours, true );

	}

	// your stores: out at sea, a day's a day past your lunch; ashore, or tied up, you've eaten
	_feed( hours ) {

		const st = this.state, d = st.days, box = this.box, b = this.app.boatCtl;
		if ( this.aboard && ! b.moored && ! b.hauled ) {

			const f = feedOf( { stores: box.stores, out: d.out, dry: d.dry }, hours );
			box.stores = f.stores;
			d.out = f.out;
			d.dry = f.dry;

		} else if ( this.app.player.mode === 'walk' || ( this.aboard && b.moored ) ) {

			if ( d.out > 0 || d.dry > 0 || d.flares < FLARES ) {

				d.out = 0;
				d.dry = 0;
				d.flares = FLARES;
				st.save();

			}

		}

	}

	// what's worth saying as the time goes by
	_warn( off ) {

		const g = this.game, st = this.state, box = this.box, d = st.days;
		const fish = st.inventory, going = fish.some( ( f ) => f.w > FRESH_H );
		if ( off ) g.toast( `${ off } fish went off in the box · over the side`, 4200 );
		if ( going && ! this._warm ) g.toast( box.ice > 0 ? 'Some of the catch has been in a long while · sell it soon' : 'The catch is going soft in this heat · ice it, or sell it soon', 4800 );
		this._warm = going;
		if ( box.ice <= 0 && this._iced && fish.length ) g.toast( 'The ice has gone · the catch keeps about 12 hours without it', 4200 );
		this._iced = box.ice > 0;
		const stage = d.out <= LUNCH_H ? 0 : box.stores > 1 ? 1 : box.stores > 0 ? 2 : d.dry < DRY_H ? 3 : 4;
		if ( stage !== this._storesSaid && this.aboard && stage >= 2 ) {

			g.toast( [ 'Not a day\'s food and water left aboard', 'You\'re out of food and water · head in', 'You\'re parched and tired · reeling comes harder · head in' ][ stage - 2 ], 4800 );

		}

		this._storesSaid = stage;

	}

	// ---- the sea here, and what she thinks of it
	_look() {

		const app = this.app, b = app.boatCtl, w = app.weather && ( app.weather.live || app.weather.target );
		if ( ! w || ! b || ! app.terrainData ) return;
		const T = app.terrainData, x = b.position.x, z = b.position.z, to = towardOf( w.windAngle || 0 );
		const depth = Math.max( 0, G.seaLevel.value - T.heightAt( x, z ) ), fetch = fetchAt( x, z, to.x, to.y, ( px, pz ) => T.heightAt( px, pz ) - G.seaLevel.value );
		this.sea = seaHere( w, depth, fetch );
		this.wind = windOn( w );
		this.strain = b.hauled ? 0 : strainOf( this.state.boat, this.sea, this.wind );
		this.showGauges();
		if ( ! this.aboard ) return;
		// (said as it comes on, once; again if it's eased and comes back)
		const g = this.game, now = this.strain >= 1 ? 2 : this.strain >= 0.6 ? 1 : 0;
		if ( now > this._said ) g.toast( now > 1 ? `This is too much for her · ${ feet( this.sea ) } of sea, ${ knots( this.wind ) } · run for shelter, she's shipping water` : `She's working hard in this · ${ feet( this.sea ) } of sea, ${ knots( this.wind ) }`, 4600 );
		if ( now > this._said || this.strain < 0.3 ) this._said = now;

	}

	// the bunk: E, on deck within reach of one
	_bunkPrompt( inp, p ) {

		const b = this.app.boatCtl, bunks = b.model.bunks;
		if ( p.mode !== 'deck' || p.riding || p.busy || p.prompt || ! bunks || ! bunks.length ) return;
		const q = p.deckPos;
		if ( ! bunks.some( ( k ) => Math.hypot( q.x - k.x, q.z - k.z ) < BUNK_M && Math.abs( q.y - k.y ) < 1 ) ) return;
		const to = restOf( this.app.settings.timeOfDay );
		p.prompt = { key: 'E', text: to === 'dawn' ? 'Sleep aboard until dawn' : 'Turn in until dusk' };
		if ( inp.hit( 'KeyE' ) ) this.sleep();

	}

	// where she lies now, as Away.awayOf has it
	_left( T ) {

		const b = this.app.boatCtl;
		return { x: b.position.x, z: b.position.z, heading: b.getYaw(), anchor: b.anchor ? { x: b.anchor.x, z: b.anchor.z } : null, moored: b.moored, hauled: !! b.hauled, sock: b.sock, T };

	}

	_env( aboard ) {

		const app = this.app, s = app.settings, T = app.terrainData;
		return { dock: berthOf( this.state.boat ).position, pick: app.weatherPick(), since: s.weatherSince, depth: ( x, z ) => Math.max( 0, G.seaLevel.value - T.heightAt( x, z ) ), aboard, haul: FLEET[ this.state.boat ].haul, ...ableEnv( this.state.boat ) };

	}

	// To sleep till dawn or dusk: on your own, at once, or till something wakes you; in company, a wish (Together)
	sleep() {

		const g = this.game, app = this.app, s = app.settings, t = app.together, to = restOf( s.timeOfDay );
		if ( t && ! t.surelyAlone ) {

			t.rest( to );
			g.toast( 'Turned in · you\'ll sleep once everyone here chooses it too (the clock)', 3600 );
			return;

		}

		const r = restTo( s.timeOfDay, s.day, to ), T0 = islandTime( s.day, s.timeOfDay ), T1 = islandTime( r.day, r.hour );
		const env = this._env( true ), boat = this.state.boat, pick = app.weatherPick();
		const T = app.terrainData, b = app.boatCtl;
		const depth = env.depth( b.position.x, b.position.z );
		const at = ( tm ) => {

			const w = weatherHere( tm, pick, s.weatherSince, b.position.x, b.position.z );
			return strainOf( boat, seaHere( w, depth, fetchAt( b.position.x, b.position.z, ...( ( o ) => [ o.x, o.y ] )( towardOf( w.windAngle || 0 ) ), ( x, z ) => T.heightAt( x, z ) - G.seaLevel.value ) ), windOn( w ) );

		};

		const wake = b.moored ? { T: T1, why: null } : wakeOf( this._left( T0 ), T0, T1, { ...env, at, news: ( tm ) => hurricaneNews( tm, pick, s.weatherSince ) } );
		this._woke = { why: wake.why, slept: true };
		const go = () => {

			const dd = Math.floor( wake.T / 24 ), hour = wake.T - dd * 24;
			if ( t ) t.setClock( hour, dd + 1, s.timeSpeed );
			else {

				s.timeOfDay = hour;
				s.day = dd + 1;

			}

			if ( app.saveClock ) app.saveClock();

		};
		if ( g.time && g.time.dim() ) setTimeout( go, 230 );
		else go();

	}

	// The clock's jumped ( T0 to T1: a rest, in company or not): what those hours did to the box, and to her where she lies
	passed( T0, T1 ) {

		const g = this.game, app = this.app, b = app.boatCtl, p = app.player, st = this.state, woke = this._woke;
		this._woke = null;
		const off = this.pass( T1 - T0 );
		if ( b.hauled ) return;
		const aboard = this.aboard;
		if ( p.mode === 'boat' && aboard ) {

			if ( b.speed < 2 && ! b.anchor && ! b.moored ) g.dropAnchor();
			p.leaveHelm();

		}

		const left = this._left( T0 ), story = awayOf( left, T1, this._env( aboard ) );
		const paid = st.payTow( story.fee ), towed = story.tows.length > 0;
		if ( story.wear > 0 ) {

			st.hull = Math.min( 1, st.hull + story.wear );
			st.save();
			g._wearSaved = st.hull;

		}

		if ( story.where === 'cradle' ) {

			st.hauled = true;
			st.save();
			b.setHauled( g.cradle );

		} else if ( towed ) b.reset();
		else if ( ! left.moored ) {

			b.position.set( story.x, G.seaLevel.value, story.z );
			b.quaternion.setFromAxisAngle( _Y, story.heading );
			b.velocity.set( 0, 0, 0 );
			b.angular.set( 0, 0, 0 );
			b.hasWater = false;
			b.apply();

		}

		if ( aboard ) this._toldAboard( story, left, woke );
		else {

			const told = tellOf( story, { paid, hull: st.hull, fish: off, T: T1, news: app.weather && app.weather.news, open: g.martaIn, locale: app.portal && app.portal.locale, from: left } );
			if ( told.note && g.hud ) g.hud.showAwayNote( told.note );
			if ( told.toast ) g.toast( told.toast, 5200 );

		}

	}

	// what you find when you wake aboard her
	_toldAboard( story, left, woke ) {

		const g = this.game, app = this.app, s = app.settings;
		const at = timeText( s.timeOfDay, app.portal && app.portal.locale ), said = [];
		const why = woke && woke.why;
		said.push( why === 'sea' ? `It's come on rough and it woke you, ${ at }` : why === 'hurricane' ? `The radio woke you, ${ at }: there's a hurricane warning out` : why === 'aground' ? `A bump woke you, ${ at }: she's aground` : woke ? `You slept till ${ at }` : `It's ${ at }` );
		const m = Math.hypot( story.x - left.x, story.z - left.z );
		if ( story.where === 'adrift' && m > 50 ) said.push( `she drifted ${ m > 1400 ? `${ ( m / 1852 ).toFixed( 1 ) } miles` : feet( m ) }${ left.sock ? ' on her sock' : '' }` );
		if ( story.where === 'anchor' ) said.push( 'she held on her anchor' );
		if ( story.wear >= 0.005 ) said.push( 'she took a beating' );
		g.toast( said.join( ' · ' ), 5600 );

	}

	// the sea and wind here, and what she thinks of them (the radio's row)
	saidHere() {

		const word = this.strain < 0.3 ? 'nothing to her' : this.strain < 1 ? 'rough for her' : 'too much for her';
		return `${ feet( this.sea ) } of sea and ${ knots( this.wind ) } here: ${ word }`;

	}

	// the box and the lockers, as the cooler's tab says them
	boxSaid() {

		const box = this.box;
		return `${ box.ice > 0 ? ` · ${ pounds( box.ice ) } lb of ice` : '' }${ box.stores >= 0.05 ? ` · ${ box.stores.toFixed( 1 ) } days' stores` : '' }`;

	}

	// ---- Marta's ice and stores
	shopRows() {

		const st = this.state, box = this.box, s = st.stats, A = ableOf( st.boat ), room = Math.max( 0, s.holdKg - st.holdKg - box.ice );
		const melt = meltKgH( s.holdKg, s.insulated ), hrs = box.ice / melt;
		const boat = BOATS[ st.boat ].name.toLowerCase();
		const ice = `<div class="gm-shop-row"><span>Ice · $${ ICE_BAG_PRICE } a 10 lb bag<small>${ box.ice > 0 ? `${ pounds( box.ice ) } lb in the box, about ${ Math.max( 1, Math.round( hrs ) ) } hours of it` : 'None in the box: the catch keeps about 12 hours without it' }</small></span><button class="gm-btn" data-ice ${ st.money < ICE_BAG_PRICE || room < ICE_BAG_KG ? 'disabled' : '' }>${ room < ICE_BAG_KG ? 'No room' : `Bag · $${ ICE_BAG_PRICE }` }</button></div>`;
		const full = box.stores >= A.storesDays - 0.01;
		const stores = `<div class="gm-shop-row"><span>Food and water · $${ STORES_PRICE } a day<small>${ box.stores >= 0.05 ? `${ box.stores.toFixed( 1 ) } of ${ A.storesDays } days aboard` : `For staying out past a day · her lockers hold ${ A.storesDays } day${ A.storesDays === 1 ? '' : 's' }` }</small></span>${ full ? '<span class="gm-have">Full</span>' : `<button class="gm-btn" data-stores ${ st.money < STORES_PRICE ? 'disabled' : '' }>A day · $${ STORES_PRICE }</button>` }</div>`;
		const stands = `<div class="gm-shop-row"><span>What your ${ boat } can stand<small>${ A.waters }</small></span></div>`;
		return stands + ice + stores;

	}

	bindShop( el, again ) {

		const st = this.state, box = this.box, on = ( sel, fn ) => {

			const b = el.querySelector( sel );
			if ( b ) b.onclick = () => {

				fn();
				st.save();
				st.emit();
				again();

			};

		};

		on( '[data-ice]', () => {

			if ( st.spend( ICE_BAG_PRICE ) ) box.ice += ICE_BAG_KG;

		} );
		on( '[data-stores]', () => {

			if ( st.spend( STORES_PRICE ) ) box.stores = Math.min( ableOf( st.boat ).storesDays, box.stores + 1 );

		} );

	}

	// ---- in trouble
	// why you're in real trouble now, or null (the EPIRB's not for a boat that can get herself home)
	trouble() {

		const g = this.game, st = this.state, hull = g.hull, b = this.app.boatCtl;
		if ( BOATS[ st.boat ].fuel && st.fuelL <= 0 ) return 'out of fuel';
		if ( hull.flooded ) return 'the water\'s over the engine';
		if ( hull.wear >= 0.6 ) return 'her hull\'s badly worn';
		if ( this.strain >= 1 ) return 'too much sea for her';
		if ( strengthOf( st.days.dry ) < 0.8 ) return 'you\'re parched';
		const depth = G.seaLevel.value - this.app.terrainData.heightAt( b.position.x, b.position.z );
		return depth < ableOf( st.boat ).draught ? 'she\'s aground' : null;

	}

	// the radio panel's rows for them: [ { id, name, say, can, fee } ]
	distress() {

		const st = this.state, s = st.stats, b = this.app.boatCtl, dock = berthOf( this.state.boat ).position, why = this.trouble();
		const metres = Math.hypot( b.position.x - dock.x, b.position.z - dock.z ), rows = [];
		if ( s.flares ) rows.push( { id: 'flare', name: `Fire a flare · ${ st.days.flares } left`, say: why ? `You're ${ why }. Red meteors: someone within sight may see one` : 'Keep them for real trouble', can: !! why && st.days.flares > 0, fee: awayTowFee( metres ) } );
		if ( s.epirb ) rows.push( { id: 'epirb', name: 'Set off the EPIRB', say: why ? `You're ${ why }. The Coast Guard has a fix in minutes, in any weather, and sees you towed in` : 'It\'s for real trouble: nothing else brings them out', can: !! why, fee: awayTowFee( metres ) } );
		return rows;

	}

	// a distress call answered, or tried: flare | epirb
	fire( kind ) {

		const g = this.game, st = this.state, d = st.days, b = this.app.boatCtl, app = this.app, dock = berthOf( this.state.boat ).position;
		const metres = Math.hypot( b.position.x - dock.x, b.position.z - dock.z ), w = app.weather && ( app.weather.live || app.weather.target );
		if ( kind === 'epirb' ) return this.rescue( metres, `The Coast Guard fixed your beacon and stood by till Marta got to you, ${ ( metres / 1852 ).toFixed( metres < 18520 ? 1 : 0 ) } miles out`, EPIRB_S );
		if ( d.flares <= 0 ) return false;
		d.flares --;
		st.save();
		this._launch();
		// (the others see it go up, wherever they are: one they could come out to)
		const room = app.together;
		if ( room && room.others && room.others.size ) room.session.send( 'flare', [ Math.round( b.position.x ), Math.round( b.position.z ) ] );
		const night = G.night.value > 0.35, reach = ( night ? FLARE_M.night : FLARE_M.day ) * ( w ? Math.min( 1, w.visibility ) : 1 );
		const t = app.together, near = t && t.others && t._inSight && t._inSight();
		const seen = Math.hypot( b.position.x - ISLE.x, b.position.z - ISLE.z ) < reach || !! near;
		if ( seen ) setTimeout( () => this.rescue( metres, 'Somebody saw your flare and called it in. Marta came out for you', 600 ), FLARE.burn * 600 );
		else g.toast( `Nobody saw it · ${ d.flares } left`, 3200 );
		return seen;

	}

	// she's brought in, the world dimmed; on your own the time it took goes by
	rescue( metres, said, wait = 0 ) {

		const g = this.game, app = this.app, b = app.boatCtl, p = app.player, st = this.state, fee = awayTowFee( metres ), paid = st.payTow( fee ), t = app.together;
		const go = () => {

			if ( p.mode === 'boat' && p.boat === b ) p.leaveHelm();
			b.reset();
			if ( p.mode === 'deck' && p.boat === b ) p.deckToWorld();
			g.toast( `${ said } · ${ paid < fee ? `she took the $${ paid } you had` : `$${ paid }` }`, 5600 );
			// (her time out to you and back with you in tow)
			if ( ! t || t.surelyAlone ) {

				const s = app.settings, T = islandTime( s.day, s.timeOfDay ) + ( wait + metres / TOW.out + metres / TOW.back ) / 3600, dd = Math.floor( T / 24 );
				if ( t ) t.setClock( T - dd * 24, dd + 1, s.timeSpeed );
				else {

					s.timeOfDay = T - dd * 24;
					s.day = dd + 1;

				}

			}

			this._stranded = 0;

		};
		if ( g.time && g.time.dim() ) setTimeout( go, 230 );
		else go();
		return true;

	}

	// with nothing to call with, someone happens by in the end, and nobody's stuck for good
	_rescueNet( hours ) {

		const b = this.app.boatCtl, st = this.state, s = st.stats, why = this.aboard ? this.trouble() : null;
		const dock = berthOf( this.state.boat ).position, metres = Math.hypot( b.position.x - dock.x, b.position.z - dock.z );
		const canCall = ( s.vhfM >= metres ) || s.epirb || ( s.flares && st.days.flares > 0 );
		if ( ! why || canCall ) {

			this._stranded = 0;
			return;

		}

		this._stranded += hours;
		if ( this._stranded >= ( metres < PASSING_H.farM ? PASSING_H.near : PASSING_H.far ) ) this.rescue( metres, 'A passing boat saw you and passed you to Marta on her radio' );

	}

	// ---- the drift sock, as the rode's end: up to wind of her stem head, a little under (m; out: Vector3)
	sockPoint( out ) {

		const b = this.app.boatCtl, w = G.windDir.value;
		b.toWorld( b.stemHead, out );
		out.x -= w.x * SOCK_OUT;
		out.z -= w.y * SOCK_OUT;
		// (on the water, as the waves have it there)
		const waves = this.app.waves;
		out.y = G.seaLevel.value + ( waves ? waves.heightAt( out.x, out.z ) : 0 );
		this._floatAt( out );
		return out;

	}

	// the float on its trip line, all you see of a sock (made the first time one's out)
	_floatAt( at ) {

		if ( ! this.float ) {

			this.float = new Mesh( new SphereGeometry( 0.22, 10, 7 ), new MeshStandardMaterial( { color: 0xe8601c, roughness: 0.55 } ) );
			this.float.name = 'SockFloat';
			this.float.castShadow = false;
			this.app.scene.add( this.float );

		}

		this.float.visible = true;
		this.float.position.set( at.x, at.y + 0.08, at.z );

	}

	// (the sock's in)
	sockIn() {

		if ( this.float ) this.float.visible = false;

	}

	// ---- the finder: past its reach it's lost the bottom, and sees only what's up near the top
	sonar( depth, rich ) {

		const reach = this.state.stats.finderM ?? Infinity, fish = Math.min( 1, rich / 1.4 );
		return depth <= reach ? { depth, fish } : { depth: null, fish: fish * 0.5 };

	}

	// someone else's flare, seen from here if it's within reach of the eye (name: theirs)
	theirFlare( at, name ) {

		const app = this.app, c = app.camera.position, w = app.weather && ( app.weather.live || app.weather.target );
		if ( ! Array.isArray( at ) || ! at.every( Number.isFinite ) ) return;
		const m = Math.hypot( at[ 0 ] - c.x, at[ 1 ] - c.z ), reach = ( G.night.value > 0.35 ? FLARE_M.night : FLARE_M.day ) * ( w ? Math.min( 1, w.visibility ) : 1 );
		if ( m > reach ) return;
		this._launch( at[ 0 ], at[ 1 ] );
		this.game.toast( `${ name || 'Someone' } has fired a distress flare, ${ farOff( m ) } off`, 5200 );

	}

	// ---- the flare: a red star, up and burning out over her
	_launch( x = this.app.boatCtl.position.x, z = this.app.boatCtl.position.z ) {

		const app = this.app;
		if ( ! this.flare ) {

			const c = document.createElement( 'canvas' );
			c.width = c.height = 32;
			const g = c.getContext( '2d' ), r = g.createRadialGradient( 16, 16, 0, 16, 16, 16 );
			r.addColorStop( 0, '#ffd8c8' );
			r.addColorStop( 0.3, '#ff2c12' );
			r.addColorStop( 1, 'rgba(255,30,10,0)' );
			g.fillStyle = r;
			g.fillRect( 0, 0, 32, 32 );
			const s = new Sprite( new SpriteMaterial( { map: new CanvasTexture( c ), depthWrite: false, transparent: true, fog: false } ) );
			s.name = 'Flare';
			s.visible = false;
			app.scene.add( s );
			this.flare = { sprite: s, t: 0 };

		}

		const f = this.flare;
		f.sprite.position.set( x, G.seaLevel.value + 3, z );
		f.t = FLARE.burn;
		f.sprite.visible = true;

	}

	_updateFlare( dt ) {

		const f = this.flare;
		if ( ! f || ! f.sprite.visible ) return;
		f.t -= dt;
		if ( f.t <= 0 ) {

			f.sprite.visible = false;
			return;

		}

		const y = G.seaLevel.value + FLARE.up, s = f.sprite, flick = 0.85 + 0.15 * Math.sin( f.t * 37 ) * Math.sin( f.t * 13 );
		s.position.y = Math.min( y, s.position.y + FLARE.rise * dt );
		// (it hangs and falls a little; and a size it's seen by a long way off)
		if ( s.position.y >= y ) s.position.y = y - ( FLARE.burn - f.t ) * 2;
		s.scale.setScalar( ( 4 + 0.004 * s.position.distanceTo( this.app.camera.position ) ) * flick );

	}

	// ---- the second finder's screen: the bottom's echo scrolling right to left, as a real one's does
	_screen( dt ) {

		const st = this.state, on = this.aboard && !! st.stats.deepFinder && this.app.player.mode !== 'swim';
		if ( ! this._screenEl ) {

			if ( ! on || ! this.game.hud ) return;
			const el = document.createElement( 'div' );
			el.className = 'do-screen';
			el.innerHTML = '<canvas width="184" height="92"></canvas><b></b><i></i>';
			( this.app.ui.ui.hud || this.app.ui.ui.root ).append( el );
			this._screenEl = el;
			this._ctx = el.querySelector( 'canvas' ).getContext( '2d' );
			this._depthEl = el.querySelector( 'b' );
			this._rangeEl = el.querySelector( 'i' );

		}

		this._screenEl.classList.toggle( 'is-on', on );
		if ( ! on || ( this._ping -= dt ) > 0 ) return;
		this._ping = PING_S;
		const b = this.app.boatCtl, depth = Math.max( 0, G.seaLevel.value - this.app.terrainData.heightAt( b.position.x, b.position.z ) );
		const reach = st.stats.finderM ?? Infinity, sonar = this.game._sonar;
		const fish = sonar ? sonar.fish : 0;
		this.pings.push( { depth: depth <= reach ? depth : null, fish: [ 0, 1, 2 ].map( () => Math.random() < fish * 0.3 ? 0.1 + Math.random() * 0.85 : - 1 ) } );
		if ( this.pings.length > PINGS ) this.pings.shift();
		drawEcho( this._ctx, this.pings );
		const last = this.pings[ this.pings.length - 1 ];
		this._depthEl.textContent = last.depth === null ? 'NO BOTTOM' : `${ Math.round( last.depth / FT ).toLocaleString() } ft`;
		this._rangeEl.textContent = `${ Math.round( rangeOf( this.pings ) / FT ).toLocaleString() } ft`;

	}

	// ---- the gauges by your money (GameHUD's): the ice, and the stores once they count
	gauges( purse ) {

		if ( ! purse || this._ice ) return;
		const mk = ( cls, html ) => {

			const e = document.createElement( 'span' );
			e.className = `gm-gauge ${ cls }`;
			e.innerHTML = html;
			purse.append( e );
			return e;

		};

		const style = document.createElement( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		this._ice = mk( 'gm-ice', '<span>Ice</span><span class="gm-cooler-bar gm-ice-bar"><span></span></span><b></b>' );
		this._iceBar = this._ice.querySelector( '.gm-ice-bar > span' );
		this._iceText = this._ice.querySelector( 'b' );
		this._stores = mk( 'gm-stores', '<span>Stores</span><b></b>' );
		this._storesText = this._stores.querySelector( 'b' );

	}

	showGauges() {

		if ( ! this._ice ) return;
		const st = this.state, box = this.box, aboard = this.aboard, fish = st.inventory.length > 0;
		const showIce = aboard && ( box.ice > 0 || fish );
		this._ice.classList.toggle( 'is-on', showIce );
		if ( showIce ) {

			this._ice.classList.toggle( 'is-low', box.ice <= 0 );
			this._iceBar.style.width = `${ Math.min( 100, box.ice / Math.max( 1, st.stats.holdKg * 0.5 ) * 100 ) }%`;
			this._iceText.textContent = box.ice > 0 ? `${ pounds( box.ice ) } lb` : 'none';

		}

		const showStores = aboard && ( box.stores > 0 || st.days.out > LUNCH_H );
		this._stores.classList.toggle( 'is-on', showStores );
		if ( showStores ) {

			this._stores.classList.toggle( 'is-low', box.stores <= 1 );
			this._storesText.textContent = `${ box.stores.toFixed( 1 ) } d`;

		}

	}

}

const _Y = { x: 0, y: 1, z: 0 };

// the depth the screen shows: the next range past what's on it
const rangeOf = ( pings ) => {

	let deep = 0;
	for ( const p of pings ) if ( p.depth !== null ) deep = Math.max( deep, p.depth );
	return RANGES.find( ( r ) => r >= deep * 1.1 ) || RANGES[ RANGES.length - 1 ];

};

// the screen drawn from its pings: deep blue water, surface clutter, the bottom's hard return yellow to red with its
// tail under it, fish as short arches in the water over it
export function drawEcho( g, pings ) {

	const W = g.canvas.width, H = g.canvas.height, range = rangeOf( pings ), col = W / PINGS;
	g.fillStyle = '#04122a';
	g.fillRect( 0, 0, W, H );
	for ( let i = 0; i < pings.length; i ++ ) {

		const p = pings[ i ], x = W - ( pings.length - i ) * col;
		g.fillStyle = '#2d62a8';
		g.fillRect( x, 0, col + 1, 2 + ( i * 7 % 3 ) );
		if ( p.depth !== null ) {

			const y = p.depth / range * ( H - 6 );
			g.fillStyle = '#ffe36a';
			g.fillRect( x, y, col + 1, 2 );
			g.fillStyle = '#e8402a';
			g.fillRect( x, y + 2, col + 1, 4 );
			g.fillStyle = '#7a2a6e';
			g.fillRect( x, y + 6, col + 1, 7 );
			g.fillStyle = '#1b3f86';
			g.fillRect( x, y + 13, col + 1, H - y );

		}

		for ( const f of p.fish ) if ( f >= 0 ) {

			const y = f * ( p.depth === null ? H - 6 : p.depth / range * ( H - 6 ) );
			g.fillStyle = '#ffb03a';
			g.fillRect( x - 1, y, 3, 1.5 );
			g.fillStyle = '#ffe36a';
			g.fillRect( x, y - 1, 1.5, 1.5 );

		}

	}

}
