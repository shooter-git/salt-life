import { ELLIPSIS } from '../../core/Glyphs.js';
import { Vector3 } from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { BAITS, BAIT_IDS, onHand } from '../Bait.js';
import { FISH } from '../FishTable.js';
import { realTackle, UPGRADES, FLY_RODS, flyRodFor } from '../Gear.js';
import { pickSpecies, rollWeight } from '../Bites.js';
import { placeOf } from '../Places.js';
import { fishLength } from '../CatchDisplay.js';
import { atHook, baitFits, hookOf, KNOTS, LEADER_IDS, leaderOn, leaderRisk, leapsOf, LEADERS, pickOnRig, RIG_IDS, RIGS, towTaste, waitOnRig } from './Presentation.js';
import { RigMesh } from './RigMesh.js';
import { Glasses } from './Glasses.js';

// (M16) The ways of fishing past a float under a rod in your hands, and what you've got for them. Game.js asks this for
// the rig that's on, and hands it the frame; what's drawn is rigs/RigMesh.
//
//   float, bottom   your rod in your hands, FishingRod's: the hook under a float, or on a sinker to the bottom
//   drop            down straight on the sportfisher's electric reel, as far as 900 m of line reaches or wherever you stop
//                   it, the open blue being deeper than that: a long wait and a long wind back
//   troll           lines let out to rods in their holders, one press each: two flat lines off the stern on any boat with
//                   an engine, and with her outriggers two more off their tips and a shotgun up the middle. You go to the
//                   helm and run at what the baits swim at; a strike takes the rod off in the holder, the reel screaming,
//                   and you go down and take it. They come in with the right button
//   kite            a kite flown off the stern, the line through a clip on its line so your live bait splashes on the surface
//                   well away downwind, with no line in the water to see; 5 to 25 knots of wind. Mostly for sailfish
//   chum            over the side, and a slick drifts off downwind that brings them up
//
// Riding along with her owner aboard, her rods are yours to work as theirs are (her owner's game runs what's on her holders,
// Together carries what you ask): her spread let out and brought in, her kite flown on her stand-up rod, her electric reel
// dropped, her chum thrown, all with her owner's bait (`boatKit`: her tackle and her bait, from their game); and a fish on any
// of them is fought on her tackle (`kit`), her rod, reel, drag and line, not your own. Your own rod's still yours.
// A chum slick is everyone's: told to the others ('slick'), it brings up the fish on every game that's near it.
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
// (the electric reel: (M17) its drag's most a deep-drop reel's, as Daiwa's Tanacom 1000's 48 lb; set under that at a share of
// the line, as any other's: CatchMinigame.DRAG_SET)
export const ELECTRIC = { speed: 4.5, drag: 22, spool: 900 };
const BIG_KG = 30; // from here it's brought to the boat tired, and gaffed or wired at arm's length
// let go with a dehooker it's over at the leader, in the water and sooner; by hand, out of the water, this share don't
// live (a billfish: 29% against under 2% left in it, VIMS by way of Mercury: docs/m16/tackle.md). (M17) The m are the
// line out when it's over: a big one's leader taken at the rod tip, the fish a leader's length off (IGFA's leader is up to
// 9.14 m over the 10 kg class); a small one in the dehooker's own reach, a 6 to 12 ft pole (NOAA, ARC); and one let go
// with neither, unhooked by hand alongside (byHand)
export const DEHOOK = { landBig: 6, landSmall: 2.5, tiredBig: 0.5, byHand: 1 };
const BY_HAND_HURT = 0.29;
// (M19) a fish on a fly: what you can lean against it with the rod low and within 45 degrees of it (Andy Mill's test, 12.5 lb:
// docs/m19/sources-fly.md); and a jump on a tight line, the chance it parts the tippet or throws the hook unless you bow
// (judgement: the guides say it's how most tarpon are lost)
const FLY_HOLD_KG = 5.7, FLY_BOW = 0.6, LB_KG = 0.45359237;
const LEADER_CHIP = { mono: 'mono', fluoro: 'fluoro', wire: 'wire', heavy: '200 lb' };
const LEADER_WORD = { mono: 'fine, and teeth go through it', fluoro: 'shy fish can\'t see it, and teeth go through it', wire: 'nothing bites through it, and shy fish keep off', heavy: 'it holds a bill and most teeth, and some shy fish keep off' };

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
		// (guest work) riding along: her tackle and bait as her owner's game sends them ('kit': { t, b, lu, sp, kite }), the
		// tackle the rod in your hands fights on when it's hers (null: your own), the bait you've picked of hers, one of hers
		// on your hook (it goes back to them, not into your bucket), and one asked of them for the kite or the drop
		this.boatKit = null;
		this.kit = null;
		this.boatPick = null;
		this._lent = null;
		this._asked = null;
		this.theirSlicks = []; // the others' chum slicks: { x, z, t, seed }

	}

	// the tackle the rod in your hands fights on: hers, off her holder or on her kite rod or her electric reel, or your own
	get tackle() {

		// ((M19) what you cast is on your light tackle; what's trolled, flown, dropped or taken off a holder on your heavy: Gear's
		// tackleOf. Riding along, her kit. A fly's on its fly rod: flyTackle)
		if ( ! this.kit && ( this.game.rod.rig || this.pick ) === 'fly' ) return this.flyTackle();
		return this.kit || ( this.heavy() ? this.stats : this.stats.light );

	}

	// (M19) the fly rod a fly's cast on (Gear.flyRodFor: the one it's tied for, else your heaviest), its weight or null
	flyWt( bait = this.state.baitPick ) {

		return flyRodFor( this.stats.flyRods, BAITS[ bait ]?.wt );

	}

	// (M19) its tackle: the tippet's strength, the reel's drag, its backing and line, as the rest of your tackle's set out
	flyTackle() {

		const f = FLY_RODS[ this.flyWt() ] || FLY_RODS[ 8 ];
		return { ...f, twoSpeed: false, standUp: false, electricReel: false, leader: this.stats.leader | 0 };

	}

	// (M19) whether the rig on the line is your heavy tackle's: trolled, a kite's, a deep drop's (and so a fish taken off a holder,
	// on the troll rig), or you're in the chair; otherwise what you cast is on your light tackle
	heavy( rig = this.game.rod.rig || this.pick ) {

		return rig === 'troll' || rig === 'kite' || rig === 'drop' || !! this.inChair;

	}

	// (M19) the rod in your hands for the rig that's picked: its reach, its reel, its spool, and whether it's the stand-up rod
	rodGear( rig = this.pick ) {

		// ((M19) a fly's on the fly rod it's tied for)
		const w = rig === 'fly' ? this.flyWt() : null;
		if ( w ) return { castM: FLY_RODS[ w ].castM, reelSpeed: FLY_RODS[ w ].reelSpeed, spoolM: FLY_RODS[ w ].spoolM, standUp: false, fly: w };
		const t = this.heavy( rig ) ? this.stats : this.stats.light;
		return { castM: t.castM, reelSpeed: t.reelSpeed, spoolM: t.spoolM, standUp: !! t.standUp };

	}

	// (guest work) riding with her owner aboard, whose she is (Together's), or null
	get skipper() {

		const T = this.app.together;
		return T ? T.skipper() : null;

	}

	// a rig that's worked on her rods, riding along: her spread, her kite, and her electric reel if she has one
	boatRig( pick = this.pick ) {

		const k = this.boatKit;
		if ( ! k || ! this.skipper ) return false;
		return pick === 'troll' || pick === 'kite' || ( pick === 'drop' && !! k.t.electricReel );

	}

	// what her owner's game sends you: her tackle, her bait, how many lines she takes and whether she flies a kite
	kitOf() {

		const s = this.stats, st = this.state, b = {};
		for ( const id of BAIT_IDS ) if ( ! BAITS[ id ].lure && st.bait[ id ] > 0 ) b[ id ] = st.bait[ id ];
		const seated = !! this.app.boat.seated;
		return {
			t: { lineKg: s.lineKg, reelSpeed: s.reelSpeed, dragKg: s.dragKg, spoolM: s.spoolM, twoSpeed: !! s.twoSpeed, standUp: !! s.standUp, electricReel: !! s.electricReel, leader: s.leader | 0 },
			b, lu: st.upgrades.lures | 0, sp: seated ? 0 : this.spots().length, kite: ! seated,
		};

	}

	// (and as it comes, checked: a number where a number's wanted)
	static cleanKit( k ) {

		if ( ! k || typeof k !== 'object' || ! k.t || typeof k.t !== 'object' ) return null;
		const n = ( v, lo, hi, d ) => Number.isFinite( v ) ? Math.min( hi, Math.max( lo, v ) ) : d, b = {};
		// ((M17) from a game still on the old figures, its line and drag as they are now)
		const T = { ...k.t, ...realTackle( k.t.lineKg, k.t.dragKg, k.t.spoolM ) };
		if ( k.b && typeof k.b === 'object' ) for ( const id of BAIT_IDS ) if ( ! BAITS[ id ].lure && Number.isFinite( k.b[ id ] ) && k.b[ id ] > 0 ) b[ id ] = Math.floor( k.b[ id ] );
		return {
			t: { lineKg: n( T.lineKg, 1, 200, UPGRADES.line.levels[ 0 ].lineKg ), reelSpeed: n( T.reelSpeed, 0.5, 6, 1.1 ), dragKg: Number.isFinite( T.dragKg ) ? n( T.dragKg, 0, 60, null ) : null, spoolM: n( T.spoolM, 50, 2000, 180 ), twoSpeed: !! T.twoSpeed, standUp: !! T.standUp, electricReel: !! T.electricReel, leader: n( T.leader | 0, 0, 3, 0 ) },
			b, lu: n( k.lu | 0, 0, 3, 0 ), sp: n( k.sp | 0, 0, 5, 0 ), kite: !! k.kite,
		};

	}

	// of her bait, whether there's this kind aboard (a lure: her owner's for good, as yours are)
	_hersOnHand( id ) {

		const k = this.boatKit, B = BAITS[ id ];
		return !! ( k && B && ( B.lure ? k.lu >= B.level : k.b[ id ] > 0 ) );

	}

	// how many of her lines are out, as her owner's poses have them
	_theirLines() {

		const o = this.skipper;
		return o && o.cur && o.cur.spread ? o.cur.spread.length : 0;

	}

	// a bait off your hook back where it came from: hers, if it was hers, else your bucket
	giveBack( b ) {

		if ( ! b ) return;
		if ( this._lent === b ) {

			this._lent = null;
			if ( this.app.together ) this.app.together.giveBack( b );
			return;

		}

		this.state.returnBait( b );

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

		const n = RIGS[ id ].needs, p = this.app.player;
		// ((M19) the fly rod, wherever you are: wading, in a kayak, riding along, aboard)
		if ( RIGS[ id ].anywhere ) return ( this.stats.flyRods || [] ).length > 0;
		// ((M16) riding along: your own lead goes over her side as off any boat; (guest work) or down on her electric reel,
		// and with her owner aboard, her spread and her kite (on her stand-up rod) are yours to work too)
		if ( p.riding && n ) {

			if ( id === 'drop' ) return p.mode === 'deck';
			const k = this.boatKit;
			if ( ! k || ! this.skipper ) return false;
			return id === 'troll' ? k.sp > 0 : !! ( k.kite && k.t.standUp );

		}

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
		// ((M19) the rod for it in your hands: the light one for a cast, the stand-up one for the rest)
		this.game.rod.setGear( this.rodGear() );
		if ( this.boatRig() ) {

			this.fitBoatBait();
			this.game.toast( `${ RIGS[ this.pick ].name } · ${ this._hersText() }`, 2600 );
			return;

		}

		this.fitBait();
		const s = this.state, bait = s.baitPick;
		this.game.toast( `${ RIGS[ this.pick ].name } · ${ this.pickText( bait ) }`, 2600 );

	}

	// (guest work) of her bait, one that goes on her rig if what you'd picked doesn't (or isn't aboard any more)
	fitBoatBait() {

		const fits = ( id ) => this._hersOnHand( id ) && baitFits( this.pick, BAITS[ id ] );
		if ( this.boatPick && ( fits( this.boatPick ) || ( BAITS[ this.boatPick ].chum && this._hersOnHand( this.boatPick ) ) ) ) return;
		this.boatPick = BAIT_IDS.find( fits ) || null;

	}

	// her bait you've picked, in words: whose, and how many she's got
	_hersText() {

		const o = this.skipper, name = o ? o.person.name : 'Her owner', b = BAITS[ this.boatPick ];
		if ( ! b ) return `${ name } has nothing for it: ${ this.pickText( null ).replace( /^needs /, '' ) }`;
		return `${ name }'s ${ b.lure ? b.name.toLowerCase() : `${ b.short } · ${ this.boatKit.b[ this.boatPick ] | 0 } aboard` }`;

	}

	// the next of her bait for her rig (B, as your own bucket's is)
	cycleBoatBait( step = 1 ) {

		const kinds = this.baitChoices();
		if ( kinds.length <= 1 ) {

			this.boatPick = kinds[ 0 ] || null;
			this.game.say( this._hersText() );
			return;

		}

		const i = kinds.indexOf( this.boatPick );
		this.boatPick = kinds[ i < 0 ? 0 : ( i + step + kinds.length ) % kinds.length ];
		this.game.toast( `Bait: ${ this._hersText() }`, 1800 );

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
		return { troll: 'needs frozen ballyhoo or squid from Joe, or plugs and skirts from Marta', kite: 'needs a live bait: throw the cast net', drop: 'needs squid, ballyhoo or cut bait', fly: 'needs flies: a fly box from Marta' }[ this.pick ];

	}

	// the kinds the bait key steps through here
	baitChoices() {

		// ((guest work) her bait, for her rods)
		if ( this.boatRig() ) return BAIT_IDS.filter( ( k ) => this._hersOnHand( k ) && ( BAITS[ k ].chum || baitFits( this.pick, BAITS[ k ] ) ) );
		const s = this.state, kinds = BAIT_IDS.filter( ( k ) => onHand( k, s ) && ( BAITS[ k ].chum || baitFits( this.pick, BAITS[ k ] ) ) );
		return baitFits( this.pick, null ) ? [ null, ...kinds ] : kinds;

	}

	// the rig as the fish meet it: the hand rod's
	handRig() {

		const rod = this.game.rod, lure = BAITS[ this.game.hookBait ]?.lure ? this.game.hookBait : null;
		return hookOf( rod.rig, rod.hookM, rod.depth, { lure, leader: leaderOn( this.state.leaderPick, this.stats.leader, rod.rig, 0, lure ) } );

	}

	// the next leader you own, on any rig, and back to the sensible one
	cycleLeader() {

		const g = this.game, s = this.state, own = this.stats.leader | 0;
		if ( ! own ) {

			g.say( 'Light mono is all you have · Marta sells fluorocarbon, wire and 200 lb mono' );
			return;

		}

		const picks = [ null, ...LEADER_IDS.slice( 0, own + 1 ) ], next = picks[ ( picks.indexOf( s.leaderPick ) + 1 ) % picks.length ];
		s.pickLeader( next );
		const rig = this.pick, now = leaderOn( next, own, rig, this.app.boatCtl.speed * KNOTS, BAITS[ s.baitPick ]?.lure ? s.baitPick : null );
		g.toast( next ? `Leader: ${ LEADERS[ next ] } · ${ LEADER_WORD[ next ] }` : `Leader: whichever suits the rig · ${ LEADERS[ now ] } on this one`, 3000 );

	}

	// ---- the press: what it does here, if it isn't a cast (true: it's dealt with)

	press() {

		const g = this.game, rod = g.rod, s = this.state, pick = s.baitPick;
		this.kit = null; // (your own rod, unless it's one of hers: below)
		if ( this.boatRig() ) return this._pressHers();
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
			this._drop();
			return true;

		}

		// ((M19) a fly: false casting begins, on the fly rod it's tied for: game/FlyCast.js)
		if ( this.pick === 'fly' ) {

			rod.setRig( 'fly', true );
			rod.setGear( this.rodGear( 'fly' ) );
			rod.dropReach = rod.spoolM;
			this._waiting = false;
			return g.flyCast.start( true );

		}

		// a cast
		const lure = BAITS[ pick ];
		rod.setRig( this.pick, !! ( lure && lure.lure ) );
		// ((M19) a cast's on your light tackle: its spool's what a sinker can go down)
		rod.dropReach = rod.spoolM = this.tackle.spoolM;
		this._waiting = this.pick === 'bottom';
		return false;

	}

	// the lead let down, on the tackle in your hands: your own rod, or (guest work) her electric reel. A rider without hers has
	// only what's on their own rod to let down, or the first run spools it
	_drop() {

		const g = this.game, rod = g.rod, t = this.tackle;
		rod.setRig( 'drop' );
		rod.dropReach = rod.spoolM = t.electricReel ? ELECTRIC.spool : t.spoolM;
		rod.dropLine();
		this._waiting = true;
		g.bite = null;
		g.toast( this.kit ? `Down on ${ this.skipper ? `${ this.skipper.person.name }'s` : 'her' } electric reel · stop it at the depth you want` : 'Lead away · it\'s a long way down · stop it at the depth you want', 3000 );

	}

	// (guest work) the press on one of her rods, riding along: what's on her holders is her owner's game's to do, asked of it
	// (Together); the kite and the drop are your hands' but want a bait of hers first
	_pressHers() {

		const g = this.game, T = this.app.together, o = this.skipper, name = o.person.name;
		this.fitBoatBait();
		const b = this.boatPick, B = BAITS[ b ];
		if ( B && B.chum ) {

			const c = this.app.camera.position, d = this.app.camera.getWorldDirection( _a ).setY( 0 ).normalize();
			T.askRig( { k: 'chum', x: Math.round( ( c.x + d.x * 3 ) * 10 ) / 10, z: Math.round( ( c.z + d.z * 3 ) * 10 ) / 10 } );
			return true;

		}

		if ( ! B || ! baitFits( this.pick, B ) ) {

			g.say( `${ RIGS[ this.pick ].name }: ${ this._hersText() }` );
			return true;

		}

		if ( this.pick === 'troll' ) {

			const sp = this.boatKit.sp;
			if ( this._theirLines() >= sp ) g.toast( `All ${ sp } of ${ name }'s lines are out · bring them in with the right button`, 2400 );
			else T.askRig( { k: 'line', b } );
			return true;

		}

		if ( this._asked ) return true;
		if ( this.pick === 'kite' && ! this._kiteWind() ) return true;
		this._asked = { rig: this.pick, b };
		T.askRig( { k: 'take', b } );
		return true;

	}

	// (guest work) her owner's game has given you a bait of theirs for her kite or her electric reel, or hasn't (why)
	given( b, ok, why ) {

		const A = this._asked, g = this.game, rod = g.rod;
		this._asked = null;
		if ( ! ok ) {

			if ( why ) g.say( why );
			return;

		}

		// (you've put the rod away meanwhile, or picked another rig, or left her: it goes back)
		if ( ! A || A.b !== b || this.pick !== A.rig || ! rod.equipped || rod.state !== 'idle' || g.fight || ! this.boatRig() ) {

			if ( this.app.together ) this.app.together.giveBack( b );
			return;

		}

		if ( g.hookBait ) this.giveBack( g.hookBait );
		g.hookBait = b;
		this._lent = b;
		this.kit = this.boatKit.t;
		if ( A.rig === 'kite' ) this._flyKite( true );
		else this._drop();

	}

	// ---- trolling

	// a line out on the next free holder, with your bait pick; (guest work) or with one of yours someone riding with you has
	// picked (who: their name) -> what they're told, { ok, said }
	_setLine( bait = this.state.baitPick, who = null ) {

		const g = this.game, s = this.state, spots = this.spots();
		const free = spots.find( ( o ) => ! this.lines.some( ( L ) => L.spot === o ) );
		if ( ! free ) {

			if ( ! who ) g.toast( `All ${ spots.length === 1 ? 'your line is' : `${ spots.length } lines are` } out · run her at the bait's speed`, 2400 );
			return { ok: false, said: `All ${ spots.length } lines are out` };

		}

		if ( ! s.takeBait( bait ) ) {

			if ( who ) return { ok: false, said: `Out of ${ BAITS[ bait ].short }` };
			g.say( `Out of ${ BAITS[ bait ].short }` );
			this.fitBait();
			return { ok: false };

		}

		const L = { spot: free, bait, leader: s.leaderPick, len: 2, p: new Vector3(), tip: new Vector3(), clip: null, butt: new Vector3(), on: null, in: false, torn: 0, bend: 0 };
		this._place( L );
		L.p.copy( L.tip );
		L.p.y = this.app.waves.heightAt( L.p.x, L.p.z );
		this.lines.push( L );
		this._trollT = null;
		this._poles( true );
		if ( this.app.audio && this.app.audio.lineOut ) this.app.audio.lineOut( 0.4 );
		const left = spots.length - this.lines.length, room = left ? `room for ${ left } more` : 'all out';
		if ( who ) {

			g.toast( `${ who } let ${ BAITS[ bait ].lure ? 'a' : '' } ${ BAITS[ bait ].name.toLowerCase() } out on the ${ free.name }`.replace( '  ', ' ' ), 2800 );
			return { ok: true, said: `${ BAITS[ bait ].name } out on the ${ free.name } · ${ room }` };

		}

		g.toast( `${ BAITS[ bait ].name } out on the ${ free.name } · ${ room }, then to the helm`, 2800 );
		return { ok: true };

	}

	// ---- (guest work) what someone riding with you asks of her rods (Together._rigAsked)

	// a line let out with a bait of yours they've picked
	letOut( bait, who ) {

		const B = BAITS[ bait ];
		if ( ! B || ! baitFits( 'troll', B ) || this.app.boat.seated ) return { ok: false, said: 'That won\'t troll' };
		if ( ! onHand( bait, this.state ) ) return { ok: false, said: `Out of ${ B.short }` };
		return this._setLine( bait, who );

	}

	// a bait of yours for their hands, for her kite or her electric reel -> whether there was one
	lend( bait ) {

		const B = BAITS[ bait ];
		return !! B && ! B.chum && this.state.takeBait( bait );

	}

	// your chum, over the side where they are (x, z: within her length or so) -> whether there was any
	chumFor( x, z, who ) {

		const b = this.app.boatCtl;
		if ( ! Number.isFinite( x ) || ! Number.isFinite( z ) || Math.hypot( x - b.position.x, z - b.position.z ) > 30 ) return false;
		if ( ! ( this.state.bait.chum > 0 ) ) return false;
		this.state.takeBait( 'chum' );
		this._startSlick( x, z );
		this.game.toast( `${ who } threw chum over the side`, 2400 );
		return true;

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
			else if ( L.len < L.spot.back ) {

				// (let out, it goes back whether she's moving or not: never left under her)
				L.len = Math.min( L.spot.back, L.len + PAY_OUT * dt );
				const y = b.getYaw(), s = ( L.spot.side || 0 ) * 0.2, ox = s * Math.cos( y ) - Math.sin( y ), oz = - s * Math.sin( y ) - Math.cos( y ), n = Math.hypot( ox, oz );
				L.p.x += ox / n * PAY_OUT * dt;
				L.p.z += oz / n * PAY_OUT * dt;

			}

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
		L.on = { species, kg, t: 0, place: placeOf( h, L.p.x, L.p.z ), at: { x: L.p.x, z: L.p.z }, leader: h.hook.leader };
		L.clip = null;
		if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( L.p, 0.9 );
		g.toast( `${ L.spot.name[ 0 ].toUpperCase() + L.spot.name.slice( 1 ) }! Fish on: get to the rod!`, 4200 );

	}

	_trollWater( L, knots ) {

		const g = this.game, x = L.p.x, z = L.p.z, T = this.app.terrainData, floorM = Math.max( 0, G.seaLevel.value - T.heightAt( x, z ) );
		const lure = BAITS[ L.bait ]?.lure ? L.bait : null;
		// (a plug swims a couple of metres down; the rest skip on top)
		// ((M19) teasers: the sportfisher's, out with her spread: Presentation's TEASE)
		return atHook( g.habitatOf( x, z, floorM ), hookOf( 'troll', lure === 'plug' ? 2 : 0.3, floorM, { knots, lines: this.lines.length, lure, leader: leaderOn( L.leader, this.stats.leader, 'troll', knots, lure ), teasers: !! this.stats.teasers } ) );

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
		this.takeLine( L, this.stats.spoolM );
		this.lines.splice( this.lines.indexOf( L ), 1 );
		return true;

	}

	// the rod in your hands with that fish on it ((M16) off your holder, or off someone's you're riding with: Together, and
	// (guest work) then it's her rod you've got, on her tackle: kit)
	takeLine( L, spoolM, kit = null ) {

		const g = this.game, rod = g.rod;
		if ( g.net.equipped ) g.dropNet();
		g.cancelLine( true );
		if ( g.hookBait ) this.giveBack( g.hookBait );
		g.hookBait = null;
		this.kit = kit;
		rod.equip( true );
		rod.setRig( 'troll', true );
		rod.spoolM = spoolM;
		rod.bobber.copy( L.p );
		rod.landedAt.copy( L.p );
		rod.setState( 'floating' );
		g.hookBait = L.bait;
		this._lent = kit && L.bait ? L.bait : null; // (hers: if it's left on the hook, it goes back to her owner)
		g.bite = { phase: 'take', t: 3, species: L.on.species, kg: L.on.kg, place: L.on.place, at: L.on.at };
		rod.lineOut = L.len;
		this._fightOut = L.len;
		this._fightLeader = L.on.leader;
		g.strike();
		this.alert = null;

	}

	_nearRod( L ) {

		const p = this.app.player;
		if ( p.mode === 'boat' ) return !! this.app.boat.seated;
		if ( p.mode !== 'deck' ) return false;
		return p.position.distanceTo( L.butt ) < REACH_M;

	}

	bringIn( who = null ) {

		for ( const L of this.lines ) if ( ! L.on ) L.in = true;
		this.game.toast( who ? `${ who }'s bringing the lines in` : 'Bringing the lines in', 1800 );

	}

	// the whole spread gone at once, and what bait's left on it thrown away (you've left her, or she's berthed)
	clearLines() {

		this.lines.length = 0;
		this._poles( false );
		this._trollT = null;
		this.game.rod.scream = 0;

	}

	// ---- the kite

	// the wind's right for one (or you're told why not)
	_kiteWind() {

		const w = G.windSpeed.value;
		if ( w >= KITE.min && w <= KITE.max ) return true;
		this.game.say( w < KITE.min ? 'Not wind enough to fly a kite: about 5 knots at least' : 'Too much wind to fly a kite: 25 knots at most' );
		return false;

	}

	// up off her stern on your stand-up rod; (guest work) hers: her stand-up rod, her owner's live bait already on the hook
	_flyKite( hers = false ) {

		const g = this.game, rod = g.rod;
		if ( ! hers ) {

			if ( ! this.stats.standUp ) {

				g.say( 'A kite wants a heavier rod: the stand-up trolling rod, from Marta' );
				return;

			}

			if ( ! this._kiteWind() ) return;
			g.baitHook();
			if ( ! g.hookBait ) return;

		}

		rod.setRig( 'kite', true );
		rod.spoolM = this.tackle.spoolM;
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

		// (off the stern of the boat you're on: yours, or (guest work) the one you're riding)
		const p = this.app.player, ride = p.riding ? p.boat : null;
		const K = this.kite, b = ride || this.app.boatCtl, S = ( ride ? ride.model : this.app.boat ).lines, wd = G.windDir.value, w = G.windSpeed.value;
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
		this._startSlick( c.x + d.x * 3, c.z + d.z * 3 );
		s.pickBait( null );
		this.fitBait();
		g.toast( 'Chum over the side · the slick\'s drifting off · cast down it', 2800 );

	}

	// a slick of yours from ( x, z ), told to the others: it brings the fish up on their games too
	_startSlick( x, z ) {

		this.slick = { x, z, t: 0, seed: Math.random() * 100 };
		if ( this.app.audio && this.app.audio.plop ) this.app.audio.plop( _b.set( x, 0, z ) );
		if ( this.app.together ) this.app.together.slick( this.slick );

	}

	// (guest work) someone else's ({ x, z, s: its seed, at: ms when it was thrown }): a few at most, the newest kept
	theirSlick( b ) {

		if ( ! b || ! Number.isFinite( b.x ) || ! Number.isFinite( b.z ) ) return;
		const t = Math.min( SLICK_S, Math.max( 0, ( Date.now() - ( Number( b.at ) || Date.now() ) ) / 1000 ) );
		if ( t >= SLICK_S ) return;
		this.theirSlicks.push( { x: b.x, z: b.z, t, seed: Number.isFinite( b.s ) ? b.s : 0 } );
		if ( this.theirSlicks.length > 4 ) this.theirSlicks.shift();

	}

	// how far ( x, z ) is in a slick, 0..1 (as a boat's floodlights draw them: Bites' flood): yours, or anyone's
	slickAt( x, z ) {

		let k = this.slick ? this._inSlick( this.slick, x, z ) : 0;
		for ( const S of this.theirSlicks ) k = Math.max( k, this._inSlick( S, x, z ) );
		return k;

	}

	_inSlick( S, x, z ) {

		const wd = G.windDir.value, dx = x - S.x, dz = z - S.z, along = dx * wd.x + dz * wd.y, across = Math.abs( dx * wd.y - dz * wd.x );
		const reach = SLICK_R + S.t * SLICK_DRIFT * 4;
		if ( along < - 8 || along > reach || across > 8 + along * 0.3 ) return 0;
		return 0.9 * ( 1 - S.t / SLICK_S );

	}

	// ---- the fight's terms, for the rod in your hands (Game.strike)

	fightTerms( b ) {

		// ((guest work) t: the tackle it's on, yours or hers; your own hands, gaff and dehooker whichever)
		const g = this.game, rod = g.rod, s = this.stats, t = this.tackle, electric = rod.rig === 'drop' && t.electricReel;
		// (what was struck on a rod in its holder has what that line had on it; on her kite rod or reel, the leader she'd have on)
		const leader = this._fightLeader || leaderOn( this.kit ? null : this.state.leaderPick, t.leader | 0, rod.rig, this.app.boatCtl.speed * KNOTS, BAITS[ g.hookBait ]?.lure ? g.hookBait : null );
		this._fightLeader = null;
		const risk = leaderRisk( leader, b.species ), big = b.kg >= BIG_KG, off = s.dehooker && FISH[ b.species ].protected;
		const chair = this.inChair && !! this._seat();
		// ((M19) on a fly: the tippet's, played with the rod low; a tarpon fly's leader has a bite tippet for its mouth, any other
		// fly's class tippet wears on one as a bill wears a leader; a jump on a tight line parts it unless you bow (let go))
		if ( rod.rig === 'fly' && ! this.kit ) {

			const bite = g.hookBait === 'flyTarpon';
			return {
				lineKg: t.lineKg,
				reelSpeed: t.reelSpeed,
				dragKg: t.dragKg,
				holdKg: FLY_HOLD_KG,
				spoolM: t.spoolM,
				twoSpeed: false,
				electric: false,
				chair: false,
				hookM: 0,
				cut: leaderRisk( leader === 'wire' ? 'wire' : 'fluoro', b.species ).cut, // (teeth through a tippet, unless you've tied on wire)
				wear: b.species === 'tarpon' && ! bite ? 0.1 : 0,
				leaps: leapsOf( b.species ),
				bow: FLY_BOW,
				landAt: off ? ( big ? DEHOOK.landBig : DEHOOK.landSmall ) : FISH[ b.species ].protected ? DEHOOK.byHand : big ? 3 : 1.2,
				tired: big ? ( off ? DEHOOK.tiredBig : 0.3 ) : 1,
				leader: leader === 'wire' ? 'wire' : bite ? 'bite' : 'tippet',
				tippetLb: t.lineKg / LB_KG,
			};

		}

		return {
			lineKg: t.lineKg,
			reelSpeed: electric ? ELECTRIC.speed : t.reelSpeed,
			dragKg: electric ? ELECTRIC.drag : t.dragKg,
			holdKg: chair ? HOLD_KG.chair : t.standUp ? HOLD_KG.harness : HOLD_KG.hand,
			spoolM: electric ? ELECTRIC.spool : t.spoolM,
			twoSpeed: !! t.twoSpeed || electric,
			electric,
			chair,
			hookM: rod.rig === 'bottom' || rod.rig === 'drop' ? rod.hookM : 0,
			cut: risk.cut,
			wear: risk.wear,
			leaps: leapsOf( b.species ),
			landAt: off ? ( big ? DEHOOK.landBig : DEHOOK.landSmall ) : FISH[ b.species ].protected ? DEHOOK.byHand : big ? 3 : 1.2,
			tired: big ? ( off ? DEHOOK.tiredBig : 0.3 ) : 1,
			leader,
		};

	}

	// the line out as the fight starts
	fightOut( out ) {

		const rod = this.game.rod;
		if ( rod.rig === 'float' && ! this._fightOut ) return out;
		const m = this._fightOut || Math.max( out, rod.lineOut ), t = this.tackle;
		this._fightOut = 0;
		return Math.min( m, rod.rig === 'drop' && t.electricReel ? ELECTRIC.spool : t.spoolM );

	}

	// at the boat, it's yours or it isn't. With nothing but your hands the heavier they are the likelier they shake off at
	// the boat; one that's let go (a billfish) is only held by the leader. -> whether it's landed
	landedAtBoat( f ) {

		const s = this.stats;
		if ( FISH[ f.species ].protected || f.kg <= s.landKg ) return true;
		return Math.random() > Math.min( 0.75, ( f.kg - s.landKg ) / 30 );

	}

	// one let go by hand: did it live? (A billfish, the fund's: the fund pays for one that swims off)
	releaseHurt( id, rng = Math.random ) {

		return !! FISH[ id ].release && ! this.stats.dehooker && rng() < BY_HAND_HURT;

	}

	why( st, f ) {

		const n = LEADERS[ f.leader ] || 'leader', own = this.stats.leader | 0, key = this.game.keyName( 'X' );
		if ( st === 'cut' ) {

			// (teeth want the wire, and a bill wears through all but that and 200 lb mono)
			const teeth = leaderRisk( f.leader, f.species ).cut > 0;
			const fix = teeth ? ( own >= 2 ? `${ key } ties on the wire, on any rig` : 'Marta sells wire' ) : own >= 3 ? `${ key } ties on the 200 lb mono, on any rig` : own >= 2 ? `${ key } ties on the wire, on any rig` : 'Marta sells wire and 200 lb mono';
			return `Cut off! It went through the ${ n } · ${ fix }`;

		}

		// ((M19) a fly's tippet parted by a jump on a tight line, or worn through on a tarpon's mouth)
		if ( st === 'snapped' && f.jumped ) return 'It jumped on a tight line and broke the tippet · bow to it: let go as it jumps';
		if ( st === 'cut' && f.leader === 'tippet' ) return leaderRisk( 'fluoro', f.species ).cut > 0 ? `Cut off! Its teeth went through the tippet · ${ own >= 2 ? `${ key } ties on the wire, fly or not` : 'Marta sells wire' }` : 'Its mouth wore through the tippet · tarpon flies come with a bite tippet';
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
			g.display.show( f.species, f.kg, _a, Math.atan2( this.app.camera.position.x - _a.x, this.app.camera.position.z - _a.z ), dt );

		} else if ( was ) g.display.hide();
		if ( this.leaping !== was && this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( rod.bobber, Math.min( 1, 0.4 + f.kg / 60 ) );
		if ( this.leaping !== was && this.app.spray && this.app.spray.burst ) this.app.spray.burst( rod.bobber, L );

	}

	// ---- a lead in the water column

	// a lead on its way down: stop it here, the way it's stopped wherever the fish are. Stopped, on down again. -> it's dealt
	// with (the press isn't a strike)
	holdLead() {

		const g = this.game, rod = g.rod;
		if ( ( rod.rig !== 'drop' && rod.rig !== 'bottom' ) || rod.state !== 'floating' ) return false;
		if ( this._waiting && ! rod.settled ) {

			rod.stopM = rod.hookM;
			return true;

		}

		if ( rod.stopM !== null && ( ! g.bite || g.bite.phase === 'wait' ) ) {

			rod.stopM = null;
			rod.settled = false;
			this._waiting = true;
			g.bite = null;
			g.toast( 'On down', 1200 );
			return true;

		}

		return false;

	}

	// the big button's word for that, on touch
	leadLabel() {

		const g = this.game, rod = g.rod;
		if ( ( rod.rig !== 'drop' && rod.rig !== 'bottom' ) || rod.state !== 'floating' ) return null;
		if ( this._waiting && ! rod.settled ) return 'Stop here';
		return rod.stopM !== null && ( ! g.bite || g.bite.phase === 'wait' ) ? 'Deeper' : null;

	}

	// ---- the chair (a boat that has one, fitted: Vessel.chair; the player's own hook)

	// ((M16) yours; riding along, the one on the boat you're on, as she's fitted)
	_seat() {

		const p = this.app.player;
		return p.riding ? p.boat.model.chair || null : this.stats.chair ? this.app.boat.chair : null;

	}

	updateChair( inp ) {

		const g = this.game, p = this.app.player, f = g.fight, seat = this._seat();
		if ( ! seat || p.mode !== 'deck' ) {

			if ( this.inChair ) this._sit( false );
			return null;

		}

		if ( this.inChair ) {

			if ( ! f || inp.hit( 'KeyE' ) ) this._sit( false );
			return f ? { key: 'E', text: 'Get out of the chair' } : null;

		}

		if ( ! f ) return null;
		if ( Math.hypot( p.deckPos.x - seat.eye.x, p.deckPos.z - seat.eye.z ) > 2.6 ) return { key: ELLIPSIS, text: 'Get to the fighting chair!' };
		if ( inp.hit( 'KeyE' ) ) {

			this._sit( true );
			return null;

		}

		return { key: 'E', text: 'Sit in the fighting chair' };

	}

	_sit( on ) {

		const g = this.game, p = this.app.player, f = g.fight;
		this.inChair = on;
		p.chair = on ? this._seat() : null;
		if ( f ) {

			f.chair = on;
			f.holdKg = on ? HOLD_KG.chair : this.tackle.standUp ? HOLD_KG.harness : HOLD_KG.hand;

		}

	}

	// the hand line's in at once (Game.cancelLine: the rod away, or you've left the deck)
	lineCancelled() {

		const rod = this.game.rod;
		this.kit = null;
		this._asked = null;
		this._waiting = false;
		rod.hung = null;
		this.hookAt = null;
		rod.setRig( rod.rig, rod.floatOff );
		if ( this.kite ) this.kite.down = true;

	}

	// ---- each frame

	update( dt, { rDown, inp } ) {

		if ( this.game.rod ) this.game.rod.electric = this.game.rod.rig === 'drop' && !! this.tackle.electricReel;

		const g = this.game, rod = g.rod, p = this.app.player, app = this.app;
		// she's left, or berthed, or you're ashore: what's out of her comes in
		if ( this.lines.length && ( ! ( p.mode === 'deck' || p.mode === 'boat' ) || p.riding || app.boatCtl.moored ) ) this.clearLines();
		if ( this.lines.length ) this.updateLines( dt );
		if ( this.kite ) this.updateKite( dt );
		// ((guest work) her kite, on her rod in your hands: up while you're on her deck)
		const flying = this.aboard || ( this.kit && p.riding && p.mode === 'deck' );
		if ( this.kite && ! flying && ! this.kite.down ) this._kiteDown();
		const wd = G.windDir.value, drift = SLICK_DRIFT * G.windSpeed.value * dt;
		for ( const S of [ this.slick, ...this.theirSlicks ] ) {

			if ( ! S ) continue;
			S.t += dt;
			S.x += wd.x * drift;
			S.z += wd.y * drift;

		}

		if ( this.slick && this.slick.t > SLICK_S ) this.slick = null;
		this.theirSlicks = this.theirSlicks.filter( ( S ) => S.t <= SLICK_S );

		// a lead's got as far as it's going: the fish can find it now
		if ( this._waiting && rod.state === 'floating' && rod.settled && ( rod.rig === 'bottom' || rod.rig === 'drop' ) ) {

			this._waiting = false;
			g.bite = { phase: 'wait', t: waitOnRig( g.habitat(), g.hour, Math.random, g.hookBait ) };
			const floor = rod.depth - 0.4, m = Math.round( rod.hookM ), h = g.habitat();
			// (nothing that takes a bait feeds there at this hour: better said than waited for)
			const none = pickSpecies( h, g.hour, Math.random, g.hookBait ) ? '' : ' · nothing\'s feeding at this depth now';
			g.toast( ( rod.hookM >= floor - 0.6 ? `On the bottom · ${ m } m down` : rod.stopM !== null ? `Stopped ${ m } m down · the bottom's at ${ Math.round( rod.depth ) } m` : `${ m } m down, all the line you can work · the bottom's at ${ Math.round( rod.depth ) } m` ) + none, none ? 4600 : 3200 );

		}

		// (once, for those used to catching snappers on a float: it doesn't reach them any more)
		if ( ! this._toldSinker && rod.state === 'floating' && rod.rig === 'float' && ! rod.floatOff && rod.depth > 30 && rod.t > 2 ) {

			this._toldSinker = true;
			g.toast( `The float's hook is only ${ RIGS.float.stop } m down, and it's ${ Math.round( rod.depth ) } m to the bottom · ${ g.keyName( 'C' ) } for a sinker`, 5200 );

		}

		// the right button, with the spread out and nothing in your hands to reel: they come in
		if ( rDown && this.lines.length && ! g.fight && rod.equipped && rod.state === 'idle' ) this.bringIn();
		// ((guest work) and hers, riding along, with her spread picked)
		else if ( rDown && ! g.fight && rod.equipped && rod.state === 'idle' && this.pick === 'troll' && this.boatRig() && this._theirLines() ) this.app.together.askRig( { k: 'in' } );
		if ( rDown && this.kite && ! this.kite.down && rod.state === 'floating' ) this._kiteDown();

		// the word on a rod that's gone off
		const on = this.rodOn, helm = p.mode === 'boat' && ! app.boat.seated;
		this.alert = null;
		// (with the lines out, she's held at what the baits swim at while you only hold the throttle: a trolling valve)
		p.trollAt = helm && this.lines.length ? this._trollKnots() : 0;
		if ( on ) {

			const left = Math.ceil( HOOK_S - on.on.t );
			if ( helm ) this.alert = { key: 'E', text: `Leave the helm · fish on the ${ on.spot.name }! · ${ left } s` };
			else this.alert = this._nearRod( on ) ? { key: 'R', text: `Take the rod · ${ on.spot.name } · ${ left } s` } : { key: ELLIPSIS, text: `Fish on the ${ on.spot.name }! Get to the rod · ${ left } s` };

		} else if ( helm && this.lines.length ) this.alert = { key: 'E', text: `Leave helm   ·   ${ this._speedWord() }   ·   hold ${ { touch: 'Run', gamepad: 'RB' }[ app.input.lastDevice ] || 'Shift' } to run` };

		// ((M16) riding along, a rod that's gone off in her holder)
		const theirs = p.riding && app.together && app.together.spread.alert( ELLIPSIS );
		if ( theirs ) this.alert = theirs;
		const chair = this.updateChair( inp );
		if ( chair ) this.alert = chair;
		this.glasses.update( dt );
		this._draw();

	}

	// ---- what's drawn

	_draw() {

		const any = this.lines.length || this.kite || this.slick || this.theirSlicks.length;
		if ( ! any ) {

			if ( this.draw ) this.draw.hide();
			return;

		}

		const D = this.draw = this.draw || new RigMesh( this.app.scene );
		const cam = this.app.camera;
		D.begin( cam );
		for ( const L of this.lines ) this._drawLine( D, L );
		// ((M19) her teasers, with her spread out)
		if ( this.lines.length && this.stats.teasers && this.app.boat && this.app.boat.id === 'sportfisher' ) {

			const b = this.app.boatCtl, waves = this.app.waves;
			D.teasers( this.app.boat, ( l, out ) => b.toWorld( l, out ), ( x, z ) => ( waves ? waves.heightAt( x, z ) : G.seaLevel.value ) );

		}

		if ( this.kite ) this._drawKite( D );
		if ( this.slick ) this._drawSlick( D, this.slick );
		for ( const S of this.theirSlicks ) this._drawSlick( D, S );
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
		D.fan( [ mid, T, Lf ], _up, 0xeeece2, 0.75, true );
		D.fan( [ mid, Lf, B ], _up, 0xdedcd0, 0.75, true );
		D.fan( [ mid, B, R ], _up, 0xeeece2, 0.75, true );
		D.fan( [ mid, R, T ], _up, 0xdedcd0, 0.75, true );
		D.tube( [ Lf, R ], [ 0.012 * s * 1.8, 0.012 * s * 1.8 ], 0x1a1a1a, 0.5, 0, 4 );
		D.tube( [ B, T ], [ 0.012 * s * 1.8, 0.012 * s * 1.8 ], 0x1a1a1a, 0.5, 0, 4 );

	}

	_drawSlick( D, S ) {

		const wd = G.windDir.value, app = this.app;
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
		// ((guest work) her rods, riding along)
		if ( rod.state === 'idle' && this.boatRig() ) {

			const name = this.skipper.person.name, tail = `${ k( 'B' ) }  ${ name }'s bait   ·   ${ k( 'C' ) }  rig   ·   ${ k( 'R' ) }  put the rod away`;
			if ( this._asked ) return { key: ELLIPSIS, text: `A bait from ${ name }${ ELLIPSIS }` };
			if ( BAITS[ this.boatPick ]?.chum ) return { key: 'LMB', text: `Throw ${ name }'s chum over the side   ·   ${ tail }` };
			if ( pick === 'troll' ) {

				const n = this._theirLines(), more = n < this.boatKit.sp;
				if ( ! n ) return { key: 'LMB', text: `Let out a line on ${ name }'s spread   ·   ${ tail }` };
				return { key: more ? 'LMB' : 'RMB', text: `${ more ? `Let out another of ${ name }'s lines   ·   RMB  ` : '' }bring ${ more ? 'them' : `${ name }'s lines` } in   ·   ${ tail }` };

			}

			if ( pick === 'kite' ) return { key: 'LMB', text: `Fly the kite on ${ name }'s stand-up rod   ·   ${ tail }` };
			return { key: 'LMB', text: `Drop the lead on ${ name }'s electric reel   ·   ${ tail }` };

		}

		if ( rod.state === 'idle' ) {

			const tail = `${ k( 'B' ) }  bait   ·   ${ k( 'C' ) }  rig   ·   ${ this.stats.leader > 0 ? `${ k( 'X' ) }  leader   ·   ` : '' }${ k( 'R' ) }  put the rod away`;
			if ( BAITS[ s.baitPick ]?.chum ) return { key: 'LMB', text: `Throw the chum over the side   ·   ${ tail }` };
			if ( this.lines.length ) {

				const more = pick === 'troll' && this.lines.length < this.spots().length;
				return { key: more ? 'LMB' : 'RMB', text: `${ more ? 'Let another line out   ·   RMB  ' : '' }bring the lines in   ·   ${ tail }` };

			}

			if ( pick === 'troll' ) return { key: 'LMB', text: `Let a line out   ·   ${ tail }` };
			if ( pick === 'kite' ) return { key: 'LMB', text: `Fly the kite   ·   ${ tail }` };
			if ( pick === 'drop' ) return { key: 'LMB', text: `Drop the lead   ·   ${ tail }` };
			return { key: 'LMB', text: `Hold to wind up, release to cast   ·   ${ tail }` };

		}

		if ( rod.state === 'floating' && rod.rig !== 'float' && ! ( g.bite && g.bite.phase === 'take' ) ) {

			if ( this.kite && ! this.kite.down && ( ! g.bite ) ) return { key: 'RMB', text: 'Kite going up · bring it in' };
			if ( this._waiting && ! rod.settled ) return { key: 'LMB', text: `Stop it here · ${ Math.round( rod.hookM ) } m down   ·   RMB  reel it up` };
			if ( g.bite && g.bite.phase === 'nibble' ) return { key: ELLIPSIS, text: rod.rig === 'kite' ? 'The bait\'s gone nervous · wait for it' : 'The tip\'s nodding · wait for it to pull down' };
			return { key: 'RMB', text: rod.rig === 'kite' ? 'Watching the bait · bring the kite in' : `${ Math.round( rod.hookM ) } m down · waiting for a bite · reel it up${ rod.stopM !== null ? '   ·   LMB  deeper' : '' }` };

		}

		return null;

	}

	// the chip: which rig, the bait, and how far down
	chip() {

		const g = this.game, s = this.state, k = s.baitPick, rod = g.rod, b = BAITS[ k ];
		// ((guest work) her bait, on her rods)
		if ( rod.state === 'idle' && this.boatRig() ) {

			const h = BAITS[ this.boatPick ], n = this._theirLines(), name = this.skipper.person.name;
			let text = h ? `${ name }'s ${ h.lure ? h.name.toLowerCase() : `${ h.short } ×${ this.boatKit.b[ this.boatPick ] | 0 }` }` : `${ name } has none for it`;
			if ( n ) text += ` · ${ n } out`;
			return { label: RIGS[ this.pick ].name, text };

		}

		let text = b ? ( b.lure ? b.name : `${ b.name } ×${ ( s.bait[ k ] | 0 ) + ( g.hookBait === k ? 1 : 0 ) }` ) : baitFits( this.pick, null ) ? 'Shrimp' : 'No bait for it';
		// (the leader, once you've more than the one)
		if ( this.stats.leader > 0 ) text += ` · ${ LEADER_CHIP[ leaderOn( s.leaderPick, this.stats.leader, this.pick, this.app.boatCtl.speed * KNOTS, b && b.lure ? k : null ) ] }`;
		if ( rod.state === 'floating' && rod.rig !== 'float' && rod.hookM > 1 ) text += ` · ${ Math.round( rod.hookM ) } m down`;
		if ( this.lines.length ) text += ` · ${ this.lines.length } out`;
		return { label: RIGS[ this.pick ].name, text };

	}

	castLabel() {

		const s = this.state;
		if ( BAITS[ this.boatRig() ? this.boatPick : s.baitPick ]?.chum ) return 'Chum';
		return { troll: 'Let out', kite: 'Fly kite', drop: 'Drop', fly: 'False cast' }[ this.pick ] || 'Cast';

	}

}

const fract = ( x ) => x - Math.floor( x );
