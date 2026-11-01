import { Vector3 } from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { BAITS, BAIT_IDS, onHand } from '../Bait.js';
import { FISH } from '../FishTable.js';
import { rollWeight } from '../Bites.js';
import { placeOf } from '../Places.js';
import { fishLength } from '../CatchDisplay.js';
import { atHook, baitFits, hookOf, KNOTS, leaderFor, leaderRisk, leapsOf, LEADERS, pickOnRig, RIG_IDS, RIGS, towTaste, waitOnRig } from './Presentation.js';
import { RigMesh } from './RigMesh.js';
import { Glasses } from './Glasses.js';

// (M16) The ways of fishing past a float under a rod in your hands, and what you've got for them. Game.js asks this for
// the rig that's on, and hands it the frame; what's drawn is rigs/RigMesh.
//
//   float, bottom   your rod in your hands, FishingRod's: the hook under a float, or on a sinker to the bottom
//   drop            down straight on the sportfisher's electric reel, as far as 900 m of line reaches; a long wait and a
//                   long wind back
//   troll           lines let out to rods in their holders, one press each: two flat lines off the stern on any boat with
//                   an engine, and with her outriggers two more off their tips and a shotgun up the middle. You go to the
//                   helm and run at what the baits swim at; a strike takes the rod off in the holder, the reel screaming,
//                   and you go down and take it. They come in with the right button
//   kite            a kite flown off the stern, the line through a clip on its line so your live bait splashes on the surface
//                   well away downwind, with no line in the water to see; 5 to 25 knots of wind. Mostly for sailfish
//   chum            over the side, and a slick drifts off downwind that brings them up
//
// Real figures and their sources are in docs/m16/tackle.md.
const FLAT = [ { name: 'starboard flat', side: - 1, back: 24, kind: 'flat' }, { name: 'port flat', side: 1, back: 32, kind: 'flat' } ];
const OUTRIGGED = [ { name: 'starboard rigger', side: - 1, back: 48, kind: 'rigger' }, { name: 'port rigger', side: 1, back: 62, kind: 'rigger' }, { name: 'shotgun', side: 0, back: 85, kind: 'shotgun' } ];
const SOLO = [ { name: 'line', side: 0, back: 26, kind: 'flat' } ];
const ROD_LONG = 2.1;
const PAY_OUT = 7, PULL_IN = 11; // m/s of line let out, and brought in
const HOOK_S = 40; // s a fish stays on a rod in its holder before it's thrown the hook
const RUN_OUT = 9; // m/s it takes line from that rod
const REACH_M = 3.6; // how near its holder you take a rod
const WASH_S = 6; // s past its speed before a bait's torn off the hook
const KITE = { min: 2.6, max: 12.9, far: 95, high: 34, clip: 0.62, climb: 9, sag: 0.03 }; // m/s of wind (5 to 25 knots), m, s
const SLICK_S = 300, SLICK_R = 45, SLICK_DRIFT = 0.03;
// what you can lean back against (kg): by hand, in a stand-up harness on the stand-up rod, and in the chair
export const HOLD_KG = { hand: 10, harness: 18, chair: 40 };
const ELECTRIC = { speed: 4.5, drag: 24, spool: 900 };
const BIG_KG = 30; // from here it's brought to the boat tired, and gaffed or wired at arm's length

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _d = new Vector3(), _e = new Vector3(), _up = new Vector3( 0, 1, 0 );
const _bend = [ new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3() ];

export class Rigs {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.pick = 'float';
		this.lines = [];
		this.kite = null;
		this.slick = null;
		this.draw = null; // (RigMesh, made when first wanted)
		this.glasses = new Glasses( game );
		this.hookAt = null; // (Vector3: the bait, where that's not the rod's line's end)
		this.alert = null; // what the deck's prompt says
		this.inChair = false;
		this._trollT = null;
		this._waiting = false;
		this._tellT = 0;

	}

	get state() {

		return this.game.state;

	}

	get stats() {

		return this.game.state.stats;

	}

	get linesOut() {

		return this.lines.length > 0;

	}

	// on her deck or in her seat, and she's yours
	get aboard() {

		const p = this.app.player;
		return ( p.mode === 'deck' || ( p.mode === 'boat' && this.app.boat.seated ) ) && ! p.riding;

	}

	get rodOn() {

		return this.lines.find( ( L ) => L.on );

	}

	// the rods she can have out at once: her holders, and the outriggers if she has them
	spots() {

		const boat = this.app.boat;
		if ( boat.seated || ! this.stats.fuelL ) return SOLO;
		return this.stats.outriggers ? [ ...FLAT, ...OUTRIGGED ] : FLAT;

	}

	// ---- the rig and the bait

	available( id ) {

		const n = RIGS[ id ].needs;
		if ( n === 'boat' ) return this.aboard && ( id !== 'kite' || ! this.app.boat.seated );
		return ! n || ( this.aboard && this.stats[ n ] );

	}

	// the next rig there's a way to fish here
	cycle() {

		const n = RIG_IDS.length;
		let i = RIG_IDS.indexOf( this.pick );
		for ( let k = 0; k < n; k ++ ) {

			i = ( i + 1 ) % n;
			if ( this.available( RIG_IDS[ i ] ) ) break;

		}

		this.pick = RIG_IDS[ i ];
		this.fitBait();
		const s = this.state, bait = s.baitPick;
		this.game.toast( `${ RIGS[ this.pick ].name } · ${ this.pickText( bait ) }`, 2600 );

	}

	// what goes with it, of what you've got, if what you'd picked doesn't
	fitBait() {

		const s = this.state, fits = ( k ) => baitFits( this.pick, k ? BAITS[ k ] : null );
		if ( fits( s.baitPick ) && ( s.baitPick === null || onHand( s.baitPick, s ) ) ) return;
		const k = BAIT_IDS.find( ( id ) => fits( id ) && onHand( id, s ) );
		s.pickBait( k || null );

	}

	pickText( bait ) {

		if ( bait && BAITS[ bait ] ) return BAITS[ bait ].name;
		if ( baitFits( this.pick, null ) ) return 'Frozen shrimp';
		return { troll: 'needs frozen ballyhoo or squid from Marta, or plugs and skirts', kite: 'needs a live bait: throw the cast net', drop: 'needs squid, ballyhoo or cut bait' }[ this.pick ];

	}

	// the kinds the bait key steps through here
	baitChoices() {

		const s = this.state, kinds = BAIT_IDS.filter( ( k ) => onHand( k, s ) && ( BAITS[ k ].chum || baitFits( this.pick, BAITS[ k ] ) ) );
		return baitFits( this.pick, null ) ? [ null, ...kinds ] : kinds;

	}

	// the rig as the fish meet it: the hand rod's
	handRig() {

		const rod = this.game.rod, lure = BAITS[ this.game.hookBait ]?.lure ? this.game.hookBait : null;
		return hookOf( rod.rig, rod.hookM, rod.depth, { lure, leader: leaderFor( this.stats.leader, rod.rig, 0, lure ) } );

	}

	// ---- the press: what it does here, if it isn't a cast (true: it's dealt with)

	press() {

		const g = this.game, rod = g.rod, s = this.state, pick = s.baitPick;
		if ( BAITS[ pick ]?.chum ) {

			this._chum();
			return true;

		}

		const needs = this.pick !== 'float' && this.pick !== 'bottom';
		if ( needs && ! baitFits( this.pick, pick ? BAITS[ pick ] : null ) ) {

			g.say( `${ RIGS[ this.pick ].name }: ${ this.pickText( null ) }` );
			return true;

		}

		if ( this.pick === 'troll' ) {

			this._setLine();
			return true;

		}

		if ( this.pick === 'kite' ) {

			this._flyKite();
			return true;

		}

		if ( this.pick === 'drop' ) {

			g.baitHook();
			rod.setRig( 'drop' );
			rod.dropReach = ELECTRIC.spool;
			rod.spoolM = ELECTRIC.spool;
			rod.dropLine();
			this._waiting = true;
			g.bite = null;
			g.toast( 'Lead away · it\'s a long way down', 2600 );
			return true;

		}

		// a cast
		const lure = BAITS[ pick ];
		rod.setRig( this.pick, !! ( lure && lure.lure ) );
		rod.dropReach = rod.spoolM = this.stats.spoolM;
		this._waiting = this.pick === 'bottom';
		return false;

	}

	// ---- trolling

	_setLine() {

		const g = this.game, s = this.state, spots = this.spots(), bait = s.baitPick;
		const free = spots.find( ( o ) => ! this.lines.some( ( L ) => L.spot === o ) );
		if ( ! free ) {

			g.toast( `All ${ spots.length === 1 ? 'your line is' : `${ spots.length } lines are` } out · run her at the bait's speed`, 2400 );
			return;

		}

		if ( ! s.takeBait( bait ) ) {

			g.say( `Out of ${ BAITS[ bait ].short }` );
			this.fitBait();
			return;

		}

		const L = { spot: free, bait, len: 2, p: new Vector3(), tip: new Vector3(), clip: null, butt: new Vector3(), on: null, in: false, torn: 0, bend: 0 };
		this._place( L );
		L.p.copy( L.tip );
		L.p.y = this.app.waves.heightAt( L.p.x, L.p.z );
		this.lines.push( L );
		this._trollT = null;
		this._poles( true );
		if ( this.app.audio && this.app.audio.lineOut ) this.app.audio.lineOut( 0.4 );
		const left = spots.length - this.lines.length;
		g.toast( `${ BAITS[ bait ].name } out on the ${ free.name } · ${ left ? `room for ${ left } more` : 'all out' }, then to the helm`, 2800 );

	}

	// her outriggers down with a spread out, and up again without (only the sportfisher has any to swing)
	_poles( out ) {

		this.app.boat.setOutriggersOut?.( out && !! this.stats.outriggers );

	}

	// a rod's holder and its tip, and where its line's held out (world)
	_place( L ) {

		const b = this.app.boatCtl, m = this.app.boat, S = m.lines, o = L.spot;
		// (her own holders, if she says, aft-most first on each side: the flats aft, the riggers next, the shotgun's on the last)
		const side = o.side || 1, mine = m.rodHolders ? m.rodHolders.filter( ( h ) => Math.sign( h.x ) === side ).sort( ( x, y ) => x.z - y.z ) : [];
		const held = mine[ Math.min( mine.length - 1, o.kind === 'flat' ? 0 : o.kind === 'rigger' ? 1 : 2 ) ];
		if ( held ) _a.copy( held );
		else if ( o.kind === 'shotgun' ) _a.set( 0, S.sheerY( 0 ) + 2.2, S.zAft + 2 );
		else {

			const z = S.zAft + ( o.kind === 'rigger' ? 1.5 : 0.4 ), t = S.tAtSheerZ( z );
			_a.set( o.side * ( S.sheerX( t ) - 0.12 ), S.sheerY( t ), z );

		}

		// (the rods lean out over the quarters and up, as they do in their holders)
		const lean = o.kind === 'shotgun' ? 0 : o.side;
		_b.set( lean * 0.45, 0.72, - 0.53 ).normalize();
		b.toWorld( _a, L.butt );
		_c.copy( _a ).addScaledVector( _b, ROD_LONG );
		b.toWorld( _c, L.tip );
		L.clip = null;
		if ( o.kind === 'rigger' && ! L.on ) {

			const tips = m.outriggerTips;
			if ( tips ) _a.copy( tips.find( ( t ) => Math.sign( t.x ) === o.side ) || tips[ 0 ] );
			else _a.set( o.side * ( S.sheerX( 0.5 ) + 4.2 ), S.sheerY( 0.5 ) + 5.2, 0 );
			L.clip = b.toWorld( _a, L._clip || ( L._clip = new Vector3() ) );

		}

	}

	updateLines( dt ) {

		const app = this.app, b = app.boatCtl, knots = b.speed * KNOTS;
		let open = 0;
		for ( const L of this.lines ) {

			this._place( L );
			if ( L.in ) L.len -= PULL_IN * dt;
			else if ( L.on ) L.len += RUN_OUT * dt;
			else L.len = Math.min( L.spot.back, L.len + PAY_OUT * dt );
			const a = L.clip || L.tip;
			_a.subVectors( L.p, a ).setY( 0 );
			const d = _a.length();
			// (it's towed along behind: pulled straight by the line, the way a boat's turn swings it)
			if ( d > L.len ) L.p.set( a.x + _a.x / d * L.len, L.p.y, a.z + _a.z / d * L.len );
			const taste = L.bait ? towTaste( BAITS[ L.bait ].tow, knots ) : 0;
			const wet = app.waves.heightAt( L.p.x, L.p.z );
			L.p.y += ( wet + ( taste > 0.05 ? 0.04 * Math.abs( Math.sin( G.time.value * 5 + L.len ) ) : - 0.2 ) - L.p.y ) * Math.min( 1, dt * 6 );
			// (past its speed a bait's torn off; a lure's only out of the water)
			if ( L.bait && ! BAITS[ L.bait ].lure && knots > BAITS[ L.bait ].tow[ 3 ] && ( L.torn += dt ) > WASH_S ) {

				this.game.toast( `The ${ BAITS[ L.bait ].short } on the ${ L.spot.name } washed out · ${ BAITS[ L.bait ].tow[ 1 ] } to ${ BAITS[ L.bait ].tow[ 2 ] } knots for it`, 3600 );
				L.bait = null;

			}

			L.bend += ( ( L.on ? 0.26 : 0.03 ) - L.bend ) * Math.min( 1, dt * 5 );
			if ( L.bait && ! L.in && ! L.on ) open ++;

		}

		// in, gone
		for ( let i = this.lines.length - 1; i >= 0; i -- ) if ( this.lines[ i ].in && this.lines[ i ].len < 3 ) {

			const L = this.lines[ i ];
			if ( L.bait ) this.state.returnBait( L.bait );
			this.lines.splice( i, 1 );

		}

		if ( ! this.lines.length ) this._poles( false );
		const on = this.rodOn;
		if ( on ) this._onRod( on, dt );
		else if ( open && ! this.game.fight ) this._troll( dt, knots );
		// (the reel screaming while a fish takes line off a rod in its holder)
		this.game.rod.scream = on ? RUN_OUT : 0;

	}

	// the strike's clock: it only runs while what's out is swimming, at how well it is
	_troll( dt, knots ) {

		const g = this.game;
		const best = this.lines.reduce( ( m, L ) => Math.max( m, L.bait && ! L.in ? towTaste( BAITS[ L.bait ].tow, knots ) : 0 ), 0 );
		if ( best <= 0 ) return;
		if ( this._trollT === null ) {

			const h = this._trollWater( this.lines[ 0 ], knots );
			this._trollT = waitOnRig( h, g.hour, Math.random, this.lines[ 0 ].bait );
			if ( ! Number.isFinite( this._trollT ) ) this._trollT = 30;

		}

		this._trollT -= dt * best;
		if ( this._trollT > 0 ) return;
		this._trollT = null;
		const live = this.lines.filter( ( L ) => L.bait && ! L.in && towTaste( BAITS[ L.bait ].tow, knots ) > 0 );
		const L = live[ Math.floor( Math.random() * live.length ) ];
		const h = this._trollWater( L, knots ), species = pickOnRig( h, g.hour, Math.random, L.bait );
		if ( ! species ) {

			this._trollT = 12;
			return;

		}

		const kg = rollWeight( species, Math.random, L.bait, h.weather, h.big );
		L.on = { species, kg, t: 0, place: placeOf( h, L.p.x, L.p.z ), at: { x: L.p.x, z: L.p.z } };
		L.clip = null;
		if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( L.p, 0.9 );
		g.toast( `${ L.spot.name[ 0 ].toUpperCase() + L.spot.name.slice( 1 ) }! Fish on: get to the rod!`, 4200 );

	}

	_trollWater( L, knots ) {

		const g = this.game, x = L.p.x, z = L.p.z, T = this.app.terrainData, floorM = Math.max( 0, G.seaLevel.value - T.heightAt( x, z ) );
		const lure = BAITS[ L.bait ]?.lure ? L.bait : null;
		return atHook( g.habitatOf( x, z, floorM ), hookOf( 'troll', 0.3, floorM, { knots, lines: this.lines.length, lure, leader: leaderFor( this.stats.leader, 'troll', knots, lure ) } ) );

	}

	// the speed that swims what's out, knots: the middle of the slowest's best, and past a bait, a skirt's own
	_trollKnots() {

		let k = Infinity;
		for ( const L of this.lines ) if ( L.bait && ! L.in ) {

			const t = BAITS[ L.bait ].tow;
			k = Math.min( k, t[ 2 ] > 12 ? 12 : ( t[ 1 ] + t[ 2 ] ) / 2 );

		}

		return Number.isFinite( k ) ? k : 0;

	}

	// what you're told at the helm
	_speedWord() {

		const v = this.app.boatCtl.speed * KNOTS, live = this.lines.filter( ( L ) => L.bait && ! L.in );
		if ( ! live.length ) return `${ v.toFixed( 0 ) } knots · nothing left on the hooks`;
		const best = live.reduce( ( m, L ) => Math.max( m, towTaste( BAITS[ L.bait ].tow, v ) ), 0 );
		const tow = BAITS[ live[ 0 ].bait ].tow;
		return `${ v.toFixed( 0 ) } knots · ${ best > 0.6 ? 'the baits are swimming' : v < tow[ 1 ] ? 'too slow for the baits' : 'too fast for the baits' }`;

	}

	// a fish taking line off a rod in its holder: you've a while to get to it
	_onRod( L, dt ) {

		L.on.t += dt;
		const g = this.game;
		if ( L.on.t > HOOK_S || L.len > this.stats.spoolM ) {

			g.toast( L.len > this.stats.spoolM ? 'It took all the line off that reel' : 'It threw the hook', 2600 );
			this.lines.splice( this.lines.indexOf( L ), 1 );

		}

	}

	// R, near it: you've taken the rod out of its holder, with the fish on it
	takeRod() {

		const L = this.rodOn;
		if ( ! L || ! this._nearRod( L ) || this.game.fight ) return false;
		const g = this.game, rod = g.rod, s = this.state;
		if ( g.net.equipped ) g.dropNet();
		g.cancelLine( true );
		if ( g.hookBait ) s.returnBait( g.hookBait );
		rod.equip( true );
		rod.setRig( 'troll', true );
		rod.spoolM = this.stats.spoolM;
		rod.bobber.copy( L.p );
		rod.landedAt.copy( L.p );
		rod.setState( 'floating' );
		g.hookBait = L.bait;
		g.bite = { phase: 'take', t: 3, species: L.on.species, kg: L.on.kg, place: L.on.place, at: L.on.at };
		this.lines.splice( this.lines.indexOf( L ), 1 );
		rod.lineOut = L.len;
		this._fightOut = L.len;
		g.strike();
		this.alert = null;
		return true;

	}

	_nearRod( L ) {

		const p = this.app.player;
		if ( p.mode === 'boat' ) return !! this.app.boat.seated;
		if ( p.mode !== 'deck' ) return false;
		return p.position.distanceTo( L.butt ) < REACH_M;

	}

	bringIn() {

		for ( const L of this.lines ) if ( ! L.on ) L.in = true;
		this.game.toast( 'Bringing the lines in', 1800 );

	}

	// the whole spread gone at once, and what bait's left on it thrown away (you've left her, or she's berthed)
	clearLines() {

		this.lines.length = 0;
		this._poles( false );
		this._trollT = null;
		this.game.rod.scream = 0;

	}

	// ---- the kite

	_flyKite() {

		const g = this.game, rod = g.rod, w = G.windSpeed.value;
		if ( ! this.stats.standUp ) {

			g.say( 'A kite wants a heavier rod: the stand-up trolling rod, from Marta' );
			return;

		}

		if ( w < KITE.min || w > KITE.max ) {

			g.say( w < KITE.min ? 'Not wind enough to fly a kite: about 5 knots at least' : 'Too much wind to fly a kite: 25 knots at most' );
			return;

		}

		g.baitHook();
		if ( ! g.hookBait ) return;
		rod.setRig( 'kite', true );
		rod.spoolM = this.stats.spoolM;
		this.kite = { up: 0, down: false, at: new Vector3(), clip: new Vector3(), bait: new Vector3(), from: new Vector3(), sway: Math.random() * 6 };
		this._kiteAt( 0 );
		rod.hung = this.kite.clip;
		rod.dropLine();
		this.hookAt = this.kite.bait;
		this._waiting = true;
		g.bite = null;
		g.toast( 'Kite going up', 2000 );

	}

	_kiteAt( dt ) {

		const K = this.kite, b = this.app.boatCtl, S = this.app.boat.lines, wd = G.windDir.value, w = G.windSpeed.value;
		K.sway += dt;
		if ( K.down ) K.up = Math.max( 0, K.up - dt / KITE.climb );
		else K.up = Math.min( 1, K.up + dt / KITE.climb );
		_a.set( 0, S.sheerY( 0 ) + 1.8, S.zAft + 0.4 );
		b.toWorld( _a, K.from );
		// out on its line downwind, high in a good breeze and lower in a light one, sailing about up there
		const u = K.up * K.up * ( 3 - 2 * K.up ), far = KITE.far * u, hi = KITE.high * u * Math.min( 1, 0.55 + w / 20 );
		const sx = Math.sin( K.sway * 0.37 ) * 7 * u, sy = Math.sin( K.sway * 0.71 ) * 2 * u;
		K.at.set( K.from.x + wd.x * far - wd.y * sx, K.from.y + hi + sy, K.from.z + wd.y * far + wd.x * sx );
		K.clip.lerpVectors( K.from, K.at, KITE.clip );
		const c = this.app.waves.heightAt( K.clip.x, K.clip.z );
		K.bait.set( K.clip.x, c - this.game.rod.dip * 0.2 + 0.03 * Math.abs( Math.sin( K.sway * 3 ) ), K.clip.z );

	}

	updateKite( dt ) {

		const K = this.kite, g = this.game, rod = g.rod, w = G.windSpeed.value;
		this._kiteAt( dt );
		if ( ! K.down && ( w < KITE.min * 0.8 || w > KITE.max * 1.1 ) ) {

			g.toast( w < KITE.min ? 'The wind\'s dropped and the kite\'s coming down' : 'Too much wind: bringing the kite in', 3000 );
			this._kiteDown();

		}

		if ( ! K.down && this._waiting && K.up >= 1 ) {

			this._waiting = false;
			g.bite = { phase: 'wait', t: waitOnRig( g.habitat(), g.hour, Math.random, g.hookBait ) };
			g.toast( 'Bait\'s splashing on the surface · watch it', 2400 );

		}

		// the fish on: the clip lets go, and the line's the fish's. The rod's left to fight it; the kite stays up till it's over
		if ( rod.hung && rod.state !== 'floating' ) {

			rod.hung = null;
			this.hookAt = null;
			K.down = true;

		}

		if ( K.down && K.up <= 0 ) this.kite = null;

	}

	_kiteDown() {

		const rod = this.game.rod, K = this.kite;
		if ( ! K ) return;
		K.down = true;
		this.game.bite = null;
		this._waiting = false;
		if ( rod.hung ) {

			rod.hung = null;
			this.hookAt = null;
			if ( rod.state === 'floating' ) rod.retrieve();

		}

	}

	// ---- chum

	_chum() {

		const g = this.game, s = this.state, c = this.app.camera.position;
		s.takeBait( 'chum' );
		const d = this.app.camera.getWorldDirection( _a ).setY( 0 ).normalize();
		this.slick = { x: c.x + d.x * 3, z: c.z + d.z * 3, t: 0, seed: Math.random() * 100 };
		if ( this.app.audio && this.app.audio.plop ) this.app.audio.plop( _b.set( this.slick.x, 0, this.slick.z ) );
		s.pickBait( null );
		this.fitBait();
		g.toast( 'Chum over the side · the slick\'s drifting off · cast down it', 2800 );

	}

	// how far ( x, z ) is in the slick, 0..1 (as a boat's floodlights draw them: Bites' flood)
	slickAt( x, z ) {

		const S = this.slick;
		if ( ! S ) return 0;
		const wd = G.windDir.value, dx = x - S.x, dz = z - S.z, along = dx * wd.x + dz * wd.y, across = Math.abs( dx * wd.y - dz * wd.x );
		const reach = SLICK_R + S.t * SLICK_DRIFT * 4;
		if ( along < - 8 || along > reach || across > 8 + along * 0.3 ) return 0;
		return 0.9 * ( 1 - S.t / SLICK_S );

	}

	// ---- the fight's terms, for the rod in your hands (Game.strike)

	fightTerms( b ) {

		const g = this.game, rod = g.rod, s = this.stats, electric = rod.rig === 'drop' && s.electricReel;
		const leader = leaderFor( s.leader, rod.rig, this.app.boatCtl.speed * KNOTS, BAITS[ g.hookBait ]?.lure ? g.hookBait : null );
		const risk = leaderRisk( leader, b.species ), big = b.kg >= BIG_KG;
		const chair = this.inChair && !! s.chair;
		return {
			lineKg: s.lineKg,
			reelSpeed: electric ? ELECTRIC.speed : s.reelSpeed,
			dragKg: electric ? ELECTRIC.drag : s.dragKg,
			holdKg: chair ? HOLD_KG.chair : s.standUp ? HOLD_KG.harness : HOLD_KG.hand,
			spoolM: electric ? ELECTRIC.spool : s.spoolM,
			twoSpeed: !! s.twoSpeed || electric,
			electric,
			chair,
			hookM: rod.rig === 'bottom' || rod.rig === 'drop' ? rod.hookM : 0,
			cut: risk.cut,
			wear: risk.wear,
			leaps: leapsOf( b.species ),
			landAt: big ? 3 : 1.2,
			tired: big ? 0.3 : 1,
			leader,
		};

	}

	// the line out as the fight starts
	fightOut( out ) {

		const rod = this.game.rod;
		if ( rod.rig === 'float' && ! this._fightOut ) return out;
		const m = this._fightOut || Math.max( out, rod.lineOut );
		this._fightOut = 0;
		return Math.min( m, rod.rig === 'drop' && this.stats.electricReel ? ELECTRIC.spool : this.stats.spoolM );

	}

	// at the boat, it's yours or it isn't. With nothing but your hands the heavier they are the likelier they shake off at
	// the boat; one that's let go (a billfish) is only held by the leader. -> whether it's landed
	landedAtBoat( f ) {

		const s = this.stats;
		if ( FISH[ f.species ].protected || f.kg <= s.landKg ) return true;
		return Math.random() > Math.min( 0.75, ( f.kg - s.landKg ) / 30 );

	}

	why( st, f ) {

		const n = LEADERS[ f.leader ] || 'leader';
		if ( st === 'cut' ) return `Cut off! It went through the ${ n } · ${ this.stats.leader >= 2 ? 'a wire or heavy leader for that one' : 'Marta has leaders that hold' }`;
		if ( st === 'spooled' ) return 'Spooled: it took every metre of your line · more line on a bigger reel, and more drag';
		return null;

	}

	// a jump out of the water at this moment of the fight
	leap( f, dt ) {

		const g = this.game, rod = g.rod, L = fishLength( f.species, f.kg ), k = 1 - f.leap / 1.1;
		const y = rod.waterY + L * ( 1.05 ) * Math.sin( Math.PI * k ) + L * 0.15;
		const was = this.leaping;
		this.leaping = f.leap > 0;
		if ( this.leaping ) {

			_a.set( rod.bobber.x, y, rod.bobber.z );
			g.display.show( f.species, f.kg, _a, Math.atan2( _a.x - this.app.camera.position.x, _a.z - this.app.camera.position.z ) + Math.PI / 2, dt );

		} else if ( was ) g.display.hide();
		if ( this.leaping !== was && this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( rod.bobber, Math.min( 1, 0.4 + f.kg / 60 ) );
		if ( this.leaping !== was && this.app.spray && this.app.spray.burst ) this.app.spray.burst( rod.bobber, L );

	}

	// ---- the chair (a boat that has one, fitted: Vessel.chair; the player's own hook)

	updateChair( inp ) {

		const g = this.game, p = this.app.player, f = g.fight, seat = this.app.boat.chair;
		if ( ! seat || ! this.stats.chair || p.mode !== 'deck' ) {

			if ( this.inChair ) this._sit( false );
			return null;

		}

		if ( this.inChair ) {

			if ( ! f || inp.hit( 'KeyE' ) ) this._sit( false );
			return f ? { key: 'E', text: 'Get out of the chair' } : null;

		}

		if ( ! f ) return null;
		if ( Math.hypot( p.deckPos.x - seat.eye.x, p.deckPos.z - seat.eye.z ) > 2.6 ) return { key: '…', text: 'Get to the fighting chair!' };
		if ( inp.hit( 'KeyE' ) ) {

			this._sit( true );
			return null;

		}

		return { key: 'E', text: 'Sit in the fighting chair' };

	}

	_sit( on ) {

		const g = this.game, p = this.app.player, f = g.fight;
		this.inChair = on;
		p.chair = on ? this.app.boat.chair : null;
		if ( f ) {

			f.chair = on;
			f.holdKg = on ? HOLD_KG.chair : this.stats.standUp ? HOLD_KG.harness : HOLD_KG.hand;

		}

	}

	// the hand line's in at once (Game.cancelLine: the rod away, or you've left the deck)
	lineCancelled() {

		const rod = this.game.rod;
		this._waiting = false;
		rod.hung = null;
		this.hookAt = null;
		rod.setRig( rod.rig, rod.floatOff );
		if ( this.kite ) this.kite.down = true;

	}

	// ---- each frame

	update( dt, { rDown, inp } ) {

		const g = this.game, rod = g.rod, p = this.app.player, app = this.app;
		// she's left, or berthed, or you're ashore: what's out of her comes in
		if ( this.lines.length && ( ! ( p.mode === 'deck' || p.mode === 'boat' ) || p.riding || app.boatCtl.moored ) ) this.clearLines();
		if ( this.lines.length ) this.updateLines( dt );
		if ( this.kite ) this.updateKite( dt );
		if ( this.kite && ! this.aboard && ! this.kite.down ) this._kiteDown();
		if ( this.slick ) {

			const S = this.slick, wd = G.windDir.value;
			S.t += dt;
			S.x += wd.x * SLICK_DRIFT * G.windSpeed.value * dt;
			S.z += wd.y * SLICK_DRIFT * G.windSpeed.value * dt;
			if ( S.t > SLICK_S ) this.slick = null;

		}

		// a lead's got as far as it's going: the fish can find it now
		if ( this._waiting && rod.state === 'floating' && rod.settled && ( rod.rig === 'bottom' || rod.rig === 'drop' ) ) {

			this._waiting = false;
			g.bite = { phase: 'wait', t: waitOnRig( g.habitat(), g.hour, Math.random, g.hookBait ) };
			const floor = rod.depth - 0.4;
			g.toast( rod.hookM >= floor - 0.6 ? `On the bottom · ${ Math.round( rod.hookM ) } m down` : `${ Math.round( rod.hookM ) } m down, all the line you can work · the bottom's at ${ Math.round( rod.depth ) } m`, 3200 );

		}

		// the right button, with the spread out and nothing in your hands to reel: they come in
		if ( rDown && this.lines.length && ! g.fight && rod.equipped && rod.state === 'idle' ) this.bringIn();
		if ( rDown && this.kite && ! this.kite.down && rod.state === 'floating' ) this._kiteDown();

		// the word on a rod that's gone off
		const on = this.rodOn, helm = p.mode === 'boat' && ! app.boat.seated;
		this.alert = null;
		// (with the lines out, she's held at what the baits swim at while you only hold the throttle: a trolling valve)
		p.trollAt = helm && this.lines.length ? this._trollKnots() : 0;
		if ( on ) {

			const left = Math.ceil( HOOK_S - on.on.t );
			if ( helm ) this.alert = { key: 'E', text: `Leave the helm · fish on the ${ on.spot.name }! · ${ left } s` };
			else this.alert = this._nearRod( on ) ? { key: 'R', text: `Take the rod · ${ on.spot.name } · ${ left } s` } : { key: '…', text: `Fish on the ${ on.spot.name }! Get to the rod · ${ left } s` };

		} else if ( helm && this.lines.length ) this.alert = { key: 'E', text: `Leave helm   ·   ${ this._speedWord() }   ·   hold Shift to run` };

		const chair = this.updateChair( inp );
		if ( chair ) this.alert = chair;
		this.glasses.update( dt );
		this._draw();

	}

	// ---- what's drawn

	_draw() {

		const any = this.lines.length || this.kite || this.slick;
		if ( ! any ) {

			if ( this.draw ) this.draw.hide();
			return;

		}

		const D = this.draw = this.draw || new RigMesh( this.app.scene );
		const cam = this.app.camera;
		D.begin( cam );
		for ( const L of this.lines ) this._drawLine( D, L );
		if ( this.kite ) this._drawKite( D );
		if ( this.slick ) this._drawSlick( D );
		D.end();

	}

	_drawLine( D, L ) {

		// the rod in its holder, bowed toward its line with a fish on it
		const a = L.clip || L.p;
		_a.subVectors( L.tip, L.butt );
		_c.subVectors( a, L.tip ).normalize();
		const n = _bend.length;
		for ( let i = 0; i < n; i ++ ) {

			const t = i / ( n - 1 ), w = t * t;
			_bend[ i ].copy( L.butt ).addScaledVector( _a, t ).addScaledVector( _c, w * L.bend * ROD_LONG );

		}

		D.tube( _bend, [ 0.016, 0.014, 0.011, 0.008, 0.006, 0.004 ], 0x20242a, 0.4, 0.1 );
		// the reel, low on the rod
		_d.copy( L.butt ).addScaledVector( _a, 0.16 ).addScaledVector( _up, 0.05 );
		_e.copy( _d ).add( _b.set( 0.05, 0, 0 ) );
		_d.sub( _b );
		D.tube( [ _d.clone(), _e.clone() ], [ 0.05, 0.05 ], 0xb8923c, 0.3, 0.9, 8 );
		// the line: off the tip, by way of the outrigger's clip, and out to the bait
		const tip = _bend[ n - 1 ];
		if ( L.clip ) {

			_e.copy( tip ).lerp( L.clip, 0.5 );
			D.line( tip, _e, L.clip, 4 );

		}

		const from = L.clip || tip;
		_e.copy( from ).lerp( L.p, 0.5 );
		_e.y -= L.on ? 0 : 0.015 * L.len;
		D.line( from, _e, L.p, 12 );
		if ( ! L.bait ) return;
		// the bait: grown with distance as a float is, so it can be seen at all, and a little of the water it's kicking up
		const toEye = Math.max( 1, L.p.distanceTo( D.eye ) / 12 );
		_a.subVectors( from, L.p ).setY( 0 ).normalize();
		_d.copy( L.p ).addScaledVector( _a, 0.16 * toEye );
		_e.copy( L.p ).addScaledVector( _a, - 0.16 * toEye );
		const bb = BAITS[ L.bait ];
		D.tube( [ _d.clone(), _e.clone() ], [ 0.018 * toEye, 0.03 * toEye ], bb.lure ? 0xd8365a : 0x8a97a6, 0.3, 0.2, 5 );
		// (and a sliver of white behind it, under way)
		if ( this.app.boatCtl.speed * KNOTS < 3 ) return;
		_c.crossVectors( _a, _up );
		const w0 = _e.clone().addScaledVector( _c, 0.022 * toEye ).setY( L.p.y + 0.012 );
		const w1 = _e.clone().addScaledVector( _c, - 0.022 * toEye ).setY( L.p.y + 0.012 );
		const w2 = _e.clone().addScaledVector( _a, - 0.34 * toEye ).setY( L.p.y + 0.012 );
		D.fan( [ w0, w1, w2 ], _up, 0xe6ecec, 0.8 );

	}

	_drawKite( D ) {

		const K = this.kite;
		D.line( K.from, _a.lerpVectors( K.from, K.at, 0.5 ).setY( ( K.from.y + K.at.y ) * 0.5 - 2.5 * K.up ), K.at, 12, 0xe7e7e0 );
		// the short line down from the clip to the bait
		if ( ! K.down ) {

			D.line( K.clip, _a.lerpVectors( K.clip, K.bait, 0.5 ), K.bait, 3 );
			// the bait, finning on the surface, and the bright marker on the clip
			const s = Math.max( 1, K.bait.distanceTo( D.eye ) / 14 );
			_b.copy( K.bait ).setY( K.bait.y + 0.02 );
			D.tube( [ _b.clone().add( _c.set( 0.12 * s, 0, 0 ) ), _b.clone().sub( _c ) ], [ 0.02 * s, 0.035 * s ], 0x6d7f8e, 0.3, 0.3, 5 );
			const m = Math.max( 1, K.clip.distanceTo( D.eye ) / 22 );
			D.tube( [ K.clip.clone().sub( _c.set( 0, 0.03 * m, 0 ) ), K.clip.clone().add( _c ) ], [ 0.024 * m, 0.024 * m ], 0xe8552a, 0.5, 0, 6 );

		}

		// the kite: as the real ones are (an SFE or a Bob Lewis), a pale square flown as a diamond about a metre across on two
		// dark cross spars, bellied a little by the wind, and no tail. Grown with distance so it can be seen at all
		const s = 0.55 * Math.max( 1, K.at.distanceTo( D.eye ) / 60 ), wd = G.windDir.value;
		_a.set( - wd.y, 0, wd.x ).multiplyScalar( s ); // across the wind
		_b.set( wd.x * 0.5, 1, wd.y * 0.5 ).normalize().multiplyScalar( s ); // up its face, tilted back
		const roll = Math.sin( K.sway * 1.3 ) * 0.2;
		_c.copy( _a ).multiplyScalar( Math.cos( roll ) ).addScaledVector( _b, Math.sin( roll ) );
		_d.copy( _b ).multiplyScalar( Math.cos( roll ) ).addScaledVector( _a, - Math.sin( roll ) );
		const N = _e.crossVectors( _c, _d ).normalize().clone();
		const belly = N.clone().multiplyScalar( s * 0.12 * ( wd.x * N.x + wd.y * N.z > 0 ? 1 : - 1 ) );
		const P = ( u, v, w = 0 ) => K.at.clone().addScaledVector( _c, u ).addScaledVector( _d, v ).addScaledVector( belly, w );
		const mid = P( 0, 0, 1 ), T = P( 0, 1 ), R = P( 1, 0 ), B = P( 0, - 1 ), Lf = P( - 1, 0 );
		D.fan( [ mid, T, Lf ], N, 0xeeece2, 0.75 );
		D.fan( [ mid, Lf, B ], N, 0xdedcd0, 0.75 );
		D.fan( [ mid, B, R ], N, 0xeeece2, 0.75 );
		D.fan( [ mid, R, T ], N, 0xdedcd0, 0.75 );
		D.tube( [ Lf, R ], [ 0.012 * s * 1.8, 0.012 * s * 1.8 ], 0x1a1a1a, 0.5, 0, 4 );
		D.tube( [ B, T ], [ 0.012 * s * 1.8, 0.012 * s * 1.8 ], 0x1a1a1a, 0.5, 0, 4 );

	}

	_drawSlick( D ) {

		const S = this.slick, wd = G.windDir.value, app = this.app;
		const fade = 1 - S.t / SLICK_S, n = Math.floor( 30 * fade );
		for ( let i = 0; i < n; i ++ ) {

			const r1 = fract( Math.sin( i * 12.9898 + S.seed ) * 43758.5 ), r2 = fract( Math.sin( i * 78.233 + S.seed ) * 12543.3 );
			const along = r1 * ( SLICK_R * 0.5 + S.t * SLICK_DRIFT * 4 ), across = ( r2 - 0.5 ) * ( 4 + along * 0.4 );
			const x = S.x + wd.x * along - wd.y * across, z = S.z + wd.y * along + wd.x * across;
			if ( Math.hypot( x - D.eye.x, z - D.eye.z ) > 90 ) continue;
			const y = app.waves.heightAt( x, z ) + 0.02, s = 0.05 + 0.05 * r2;
			_a.set( x, y, z );
			D.fan( [ _a.clone().add( _b.set( s, 0, 0 ) ), _a.clone().add( _b.set( 0, 0, s ) ), _a.clone().add( _b.set( - s, 0, 0 ) ), _a.clone().add( _b.set( 0, 0, - s ) ) ], _up, 0x8a7a5c, 0.9 );

		}

	}

	// ---- the words

	prompt() {

		const g = this.game, rod = g.rod, pick = this.pick, s = this.state;
		const k = ( c ) => g.keyName( c );
		if ( rod.state === 'idle' ) {

			const tail = `${ k( 'B' ) }  bait   ·   ${ k( 'C' ) }  rig   ·   R  put the rod away`;
			if ( BAITS[ s.baitPick ]?.chum ) return { key: 'LMB', text: `Throw the chum over the side   ·   ${ tail }` };
			if ( this.lines.length ) return { key: 'LMB', text: `${ pick === 'troll' ? 'Let another line out   ·   ' : '' }RMB  bring the lines in   ·   ${ tail }` };
			if ( pick === 'troll' ) return { key: 'LMB', text: `Let a line out   ·   ${ tail }` };
			if ( pick === 'kite' ) return { key: 'LMB', text: `Fly the kite   ·   ${ tail }` };
			if ( pick === 'drop' ) return { key: 'LMB', text: `Drop the lead   ·   ${ tail }` };
			return { key: 'LMB', text: `Hold to wind up, release to cast   ·   ${ tail }` };

		}

		if ( rod.state === 'floating' && rod.rig !== 'float' && ! ( g.bite && g.bite.phase === 'take' ) ) {

			if ( this.kite && ! this.kite.down && ( ! g.bite ) ) return { key: 'RMB', text: 'Kite going up · bring it in' };
			if ( this._waiting ) return { key: 'RMB', text: `Going down · ${ Math.round( rod.hookM ) } m · reel it up` };
			if ( g.bite && g.bite.phase === 'nibble' ) return { key: '…', text: rod.rig === 'kite' ? 'The bait\'s gone nervous · wait for it' : 'The tip\'s nodding · wait for it to pull down' };
			return { key: 'RMB', text: rod.rig === 'kite' ? 'Watching the bait · bring the kite in' : `${ Math.round( rod.hookM ) } m down · waiting for a bite · reel it up` };

		}

		return null;

	}

	// the chip: which rig, the bait, and how far down
	chip() {

		const g = this.game, s = this.state, k = s.baitPick, rod = g.rod, b = BAITS[ k ];
		let text = b ? ( b.lure ? b.name : `${ b.name } ×${ ( s.bait[ k ] | 0 ) + ( g.hookBait === k ? 1 : 0 ) }` ) : baitFits( this.pick, null ) ? 'Shrimp' : 'No bait for it';
		if ( rod.state === 'floating' && rod.rig !== 'float' && rod.hookM > 1 ) text += ` · ${ Math.round( rod.hookM ) } m down`;
		if ( this.lines.length ) text += ` · ${ this.lines.length } out`;
		return { label: RIGS[ this.pick ].name, text };

	}

	castLabel() {

		const s = this.state;
		if ( BAITS[ s.baitPick ]?.chum ) return 'Chum';
		return { troll: 'Let out', kite: 'Fly kite', drop: 'Drop' }[ this.pick ] || 'Cast';

	}

}

const fract = ( x ) => x - Math.floor( x );
