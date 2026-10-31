import { Matrix4, Quaternion, Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { FISH, CARAPACE } from './FishTable.js';
import { feet } from './Units.js';
import { islandTime } from './Weather.js';
import { WORLD } from '../world/WorldLayout.js';
import { SEABED } from '../world/terrain/SeabedModel.js';
import { SPRAY } from '../fx/Spray.js';
import { TrapMeshes, TRAP, stowMatrix, stowColour, trapColliders } from '../world/boat/TrapModel.js';
import { BOTTOMS, HAULER_MS, HAUL_SPEED, TRAP_PRICE, WARP_M, aboardTraps, bottomAt, buoyColours, buoyOffset, buoyRecord, cleanBuoys, haulOf, ownedTraps, settle, soakOf, trapsTold, whyNot } from './Traps.js';

// (M16) Lobster traps, at the rail of the boat that has the hauler and davit, and out on the sea (the rules: Traps.js; what's
// drawn: world/boat/TrapModel.js). Standing by the hauler with one aboard, E sets it over the side where the bottom suits, its warp
// paying out and the buoy thrown after it, a mark going on your chart. Back alongside its buoy, starboard side to, E gaffs the
// buoy, the hauler brings the warp in over the davit's block, the trap breaks the surface and swings in on to the rail, and
// each thing in it comes out at a press: every lobster on the gauge. Nothing here's built until there's a trap to draw.
//   const w = new TrapWork( game );  w.update( dt, lDown );  w.boatChanged();  w.buyNew()

const NIGHT_SAID = ( n ) => n < 0.5 ? 'not a night down yet' : n < 1.5 ? 'a night down' : `${ Math.round( n ) } nights down`;
const STAND_M = 2.1; // how near the hauler you work it (m, on her deck)
const GAFF_M = 5.5; // how far off the rail a buoy's reached, with a long gaff (m)
const FOUND_M = 35; // you're told of your buoy this near (m)
const LEFT_M = 90; // and again once you've been this far off
const REACH = { low: [ 240, 45 ], mid: [ 360, 60 ], high: [ 460, 70 ] }; // how far buoys, and traps on the bottom, are drawn (m)
const ABOARD_M = 90; // and those on her deck
const BOB_N = 8; // the nearest this many ride the waves
const SETTLE_S = 15; // how often the weather's reckoned

const _m = new Matrix4(), _n = new Matrix4(), _p = new Vector3(), _q = new Quaternion(), _s = new Vector3( 1, 1, 1 ), _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _y = new Vector3( 0, 1, 0 ), _qi = new Quaternion(), _e = new Vector3();
const ease = ( t ) => t * t * ( 3 - 2 * t );
const clamp01 = ( t ) => Math.min( 1, Math.max( 0, t ) );
const mix = ( a, b, t ) => a + ( b - a ) * t;

// the 8 m seagrass mask the bottoms keep once the island's own is let go (App.freeMasks): { data, res, texel, origin }
export function grassMask( T ) {

	const k = Math.max( 1, Math.round( 8 / T.texel ) ), res = Math.floor( T.res / k ), data = new Uint8Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		let a = 0;
		for ( let b = 0; b < k; b ++ ) for ( let c = 0; c < k; c ++ ) a += T.seagrass[ ( j * k + b ) * T.res + i * k + c ];
		data[ j * res + i ] = Math.round( a / ( k * k ) );

	}

	return { data, res, texel: T.texel * k, origin: T.origin };

}

export class TrapWork {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.job = null; // { kind: 'set' | 'haul', phase, t, trap, ... }: what's going on at the rail
		this.meshes = null;
		this.others = {}; // the others' buoys, as the group's save has them (Traps.cleanBuoys)
		this._near = []; // what's near enough to draw: { x, z, bx, bz, bottom, colours, mine, trap, name }
		this._nearT = 0;
		this._settleT = 2;
		this._said = new Set();
		this._hailed = new Set();
		this._dirty = false;
		this._shareT = 0;
		this._read = false;
		this._boat = null;
		this._aboard = - 1;

	}

	get traps() {

		return this.game.state.traps;

	}

	// the boat you're in has changed (App.setBoat), or it's the first look at her
	boatChanged() {

		this.job = null;
		this._boat = null;
		this._aboard = - 1;

	}

	_fit() {

		const b = this.app.boat;
		if ( this._boat === b ) return;
		this._boat = b;
		this.on = b && b.id === 'lobster';
		if ( ! this.on ) return;
		const L = b.lines, at = ( z ) => L.tAtSheerZ( z );
		const xg = - ( L.sheerX( at( - 0.78 ) ) - 0.035 ), xr = - ( L.sheerX( at( - 1.66 ) ) - 0.035 ), yr = L.sheerY( at( - 1.66 ) ) + 0.045;
		this.at = {
			block: new Vector3( xg - 0.43, 1.85, - 0.72 ), // under the davit's block
			stand: new Vector3( xg + 0.55, 0, - 1.15 ), // where you work
			reach: new Vector3( xg - 0.3, 0, - 0.72 ), // over the rail, by the block
			over: new Vector3( xr - 1, 0, - 1.66 ), // where one goes over the side
			rail: new Vector3( xr + 0.22, yr, - 1.66 ), // a trap on the rail
			gaffed: new Vector3( xg + 0.04, L.sheerY( at( - 0.86 ) ) + 0.28, - 0.86 ), // the buoy, gaffed
		};

	}

	// ---- per frame, on the game's update (before the prompts). lDown: the click's edge
	update( dt, lDown ) {

		const app = this.app, game = this.game;
		if ( ! app._started || ! app.boat ) return;
		this._fit();
		this._shared( dt );
		this._reckon( dt );
		const aboard = this.on ? aboardTraps( this.traps, game.state.upgrades ) : 0;
		if ( aboard !== this._aboard ) this._stowed( aboard );
		if ( this.job ) this._work( dt, lDown );
		// (the rail's "Jump overboard" makes way, by the hauler)
		const pl = app.player, A = this.at;
		pl.trapWork = !! ( this.on && pl.mode === 'deck' && ! game.rod.equipped && ! game.net.equipped && ( this.job || ( ( aboard || this.traps.set.length ) && Math.hypot( pl.deckPos.x - A.stand.x, pl.deckPos.z - A.stand.z ) <= STAND_M ) ) );
		if ( ! app.player.prompt && ! game.makingRoom ) this._offer( aboard );
		this._draw( dt, aboard );

	}

	// how many stand on her deck has changed: the room they take, as colliders; and told the first time they're there
	_stowed( n ) {

		const b = this._boat;
		if ( this.on ) b.colliders = b.colliders.filter( ( c ) => c.tag !== 'trap' ).concat( trapColliders( b.lines, n ) );
		if ( n > this._aboard && this._aboard >= 0 && ! this.job ) this.game.toast( `${ n } trap${ n === 1 ? '' : 's' } aboard, on her stern · by the hauler, starboard side, ${ this.game.keyName( 'E' ) } sets one over`, 5200 );
		this._aboard = n;

	}

	_T() {

		const s = this.app.settings;
		return islandTime( s.day, s.timeOfDay );

	}

	depthAt( x, z ) {

		return G.seaLevel.value - this.app.terrainData.heightAt( x, z );

	}

	// the bottom at ( x, z ): a BOTTOMS id
	bottom( x, z ) {

		const game = this.game, T = this.app.terrainData, depth = this.depthAt( x, z ), reef = WORLD.reef;
		const half = T.res * T.texel / 2, onMap = Math.abs( x ) < half && Math.abs( z ) < half, B = SEABED.bank;
		const g = T.seagrass ? T.seagrass[ Math.floor( ( z - T.origin ) / T.texel ) * T.res + Math.floor( ( x - T.origin ) / T.texel ) ] : T.grass ? T.grass.data[ Math.floor( ( z - T.origin ) / T.grass.texel ) * T.grass.res + Math.floor( ( x - T.origin ) / T.grass.texel ) ] : 0;
		const h = game.habitatAtPoint( x, z, depth );
		return bottomAt( {
			reefDist: Math.hypot( x - reef.center.x, z - reef.center.z ) - reef.radius,
			windReef: game.windReefAt( x, z ),
			patch: depth < 34 && Math.hypot( x - B.x, z - B.z ) < B.a + 1500 ? 0.8 * Math.min( 1, ( 34 - depth ) / 10 ) : 0,
			sand: onMap ? game.sandAt( x, z ) : 0,
			grass: onMap ? ( g || 0 ) / 255 : 0,
			creek: h.creek,
			onMap,
		} );

	}

	// ---- what the rail offers
	_offer( aboard ) {

		const app = this.app, p = app.player, game = this.game, inp = app.input;
		if ( p.mode === 'swim' ) return this._offerDiver( p, inp );
		this._hail( p );
		if ( p.mode !== 'deck' || p.riding || ! this.on || game.rod.equipped || game.net.equipped || game.fight ) return;
		const a = this.at, j = this.job;
		if ( j ) {

			if ( j.kind === 'haul' && j.phase === 'rail' ) this._offerRail( j, p, inp );
			else if ( j.kind === 'haul' && j.phase === 'up' ) p.prompt = { key: '…', text: 'The hauler\'s bringing it up' };
			return;

		}

		if ( Math.hypot( p.deckPos.x - a.stand.x, p.deckPos.z - a.stand.z ) > STAND_M ) return;
		const boat = this._boat.group.matrixWorld, c = app.boatCtl;
		// a buoy in reach of the rail
		_a.copy( a.reach ).applyMatrix4( boat );
		let best = null, near = Infinity;
		for ( const t of this.traps.set ) {

			if ( ! t.buoy ) continue;
			const o = buoyOffset( t.x, t.z, this.depthAt( t.x, t.z ) ), d = Math.hypot( t.x + o.x - _a.x, t.z + o.z - _a.z );
			if ( d < near ) {

				near = d;
				best = t;

			}

		}

		if ( best && near < GAFF_M ) {

			if ( c.speed > HAUL_SPEED ) p.prompt = { key: '…', text: 'Your buoy · slow her down to gaff it' };
			else {

				p.prompt = { key: 'E', text: `Gaff the buoy   ·   ${ NIGHT_SAID( soakOf( best, this._T() ).nights ) }` };
				if ( inp.hit( 'KeyE' ) ) this._startHaul( best );

			}

			return;

		}

		if ( ! aboard ) {

			if ( best && near < 40 ) p.prompt = { key: '…', text: `Your buoy's ${ feet( near ) } off · bring her alongside it, starboard side to` };
			return;

		}

		_b.copy( a.over ).applyMatrix4( boat );
		const depth = this.depthAt( _b.x, _b.z ), id = this.bottom( _b.x, _b.z ), dock = WORLD.boatDock.position;
		const why = c.moored || c.hauled ? 'Not at the dock: take her out' : whyNot( { depth, bottom: id, speed: c.speed, dock: Math.hypot( _b.x - dock.x, _b.z - dock.z ) } );
		if ( why ) {

			p.prompt = { key: '…', text: why };
			return;

		}

		// (the bottom's seen in clear shallow water, and past that on the fish finder)
		const known = depth < 12 || game.state.stats.finder, B = BOTTOMS[ id ];
		p.prompt = { key: 'E', text: `Set a trap over the side   ·   ${ known ? `${ feet( depth ) }, ${ B.name }: ${ B.say }` : 'you can\'t see the bottom from here' }   ·   ${ aboard } aboard` };
		if ( inp.hit( 'KeyE' ) ) this._startSet( _b.x, _b.z, depth, id, aboard );

	}

	// (under water, at a trap of yours whose buoy's gone: another tied on)
	_offerDiver( p, inp ) {

		const c = this.app.camera.position;
		for ( const t of this.traps.set ) {

			if ( t.buoy || Math.hypot( t.x - c.x, t.z - c.z ) > 2.4 || Math.abs( this.app.terrainData.heightAt( t.x, t.z ) - c.y ) > 2.5 ) continue;
			p.prompt = { key: 'E', text: 'Tie a new buoy on your trap' };
			if ( inp.hit( 'KeyE' ) ) {

				t.buoy = true;
				this._dirty = true;
				this.game.state.save();
				this.game.toast( 'A new buoy on it', 2000 );

			}

			return;

		}

	}

	// telling you of a buoy as you come up to it, yours or someone else's, once each time
	_hail( p ) {

		if ( p.mode !== 'boat' && p.mode !== 'deck' ) return;
		const b = this.app.boatCtl.position;
		for ( const n of this._near ) {

			const d = Math.hypot( n.bx - b.x, n.bz - b.z ), key = `${ n.bx },${ n.bz }`;
			if ( d > LEFT_M ) this._hailed.delete( key );
			if ( d > FOUND_M || this._hailed.has( key ) ) continue;
			this._hailed.add( key );
			if ( n.mine ) this.game.toast( `Your buoy · ${ NIGHT_SAID( soakOf( n.trap, this._T() ).nights ) }${ this.on ? ' · come alongside it, starboard side to' : ' · only the lobster boat can haul it' }`, 3600 );
			else this.game.toast( `${ n.name ? `${ n.name }'s` : 'Someone\'s' } buoy · their gear, not yours to touch`, 3000 );

		}

	}

	// ---- setting one
	_startSet( x, z, depth, id, aboard ) {

		const game = this.game, st = game.state, c = this.traps;
		const mark = st.chart.mark( x, z, game.tradeDay, true );
		const trap = { x: Math.round( x * 10 ) / 10, z: Math.round( z * 10 ) / 10, T: this._T(), at: Date.now(), seed: Math.floor( Math.random() * 2147483647 ), buoy: true, mark: mark ? mark.id : null, seen: this._T(), q: BOTTOMS[ id ].q, size: BOTTOMS[ id ].sizeCm };
		c.set.push( trap );
		st.save();
		st.emit();
		this._dirty = true;
		this._aboard = aboard - 1;
		this._stowed( aboard - 1 );
		this.job = { kind: 'set', t: 0, trap, stow: aboard - 1, bottom: this.app.terrainData.heightAt( x, z ), splashed: false, thrown: false, yaw: trap.seed % 6.28 };
		const a = this.app.audio;
		if ( a && a.netReady ) a.netReady();
		game.toast( mark ? `Trap ${ mark.id } on your chart · ${ this.traps.set.length } set, leave it a few nights` : 'Your chart has no room for its mark: note where it is', 3600 );

	}

	// ---- hauling one
	_startHaul( trap ) {

		const a = this.app.audio;
		if ( a && a.netReady ) a.netReady();
		const d = this.depthAt( trap.x, trap.z ), o = buoyOffset( trap.x, trap.z, d );
		this.job = { kind: 'haul', phase: 'gaff', t: 0, trap, o, bottom: this.app.terrainData.heightAt( trap.x, trap.z ), yaw: trap.seed % 6.28, pull: 0, y: 0, surfaced: false, queue: null, card: null };
		if ( a && a.netThrow ) a.netThrow( 0.4 );

	}

	_work( dt, lDown ) {

		const j = this.job, app = this.app, p = app.player, game = this.game, c = app.boatCtl, A = app.audio;
		j.t += dt;
		if ( j.kind === 'set' ) {

			// off the stack, on to the rail, over the side; the buoy after it; down to the bottom
			const toRail = 0.7, over = 0.5, sea = G.seaLevel.value;
			if ( j.t > toRail + over && ! j.splashed ) {

				j.splashed = true;
				if ( A && A.netSplash ) A.netSplash( _p.set( j.trap.x, sea, j.trap.z ), 0.8 );
				if ( app.spray ) app.spray.emit( _p.set( j.trap.x, sea + 0.1, j.trap.z ), _a.set( 0, 2.2, 0 ), 18, 0.05, SPRAY.DROPLET, { spread: 1.2, jitter: 0.5 } );

			}

			if ( j.t > toRail + over + ( sea - j.bottom ) / 1.0 ) this.job = null;
			return;

		}

		// let go of it: off the deck, or she's going off with it
		if ( j.phase !== 'rail' && j.phase !== 'stack' && ( p.mode !== 'deck' || c.speed > HAUL_SPEED ) ) {

			this.job = null;
			game.toast( 'The warp came off the hauler · the trap\'s gone back down', 3000 );
			return;

		}

		if ( j.phase === 'gaff' ) {

			if ( j.t > 0.7 ) {

				j.phase = 'up';
				j.t = 0;
				this._boat.group.updateWorldMatrix( true, false );
				j.total = Math.max( 1, ( _a.copy( this.at.block ).applyMatrix4( this._boat.group.matrixWorld ).y - TRAP.H - 0.3 - j.bottom ) / HAULER_MS );

			}

		} else if ( j.phase === 'up' ) {

			j.pull -= dt;
			if ( j.pull <= 0 && A && A.netPull ) {

				j.pull = 0.75;
				A.netPull( false );

			}

			if ( j.t >= j.total ) {

				j.phase = 'swing';
				j.t = 0;

			}

		} else if ( j.phase === 'swing' ) {

			if ( j.t >= 1.0 ) {

				j.phase = 'rail';
				j.t = 0;
				this._landed( j );

			}

		} else if ( j.phase === 'rail' ) {

			if ( j.card ) {

				j.cardT += dt;
				const end = game.cardEnd( j.card, j.cardT, lDown );
				if ( end ) {

					game._cardDismissed = true;
					j.card = null;
					if ( game.hud && game.hud.catchOpen ) game.hud.hideCatch();

				}

			}

		} else if ( j.t >= 0.7 ) {

			// stacked
			this.job = null;
			this._aboard = - 1;

		}

	}

	// on the rail: off the sea and off your chart, and what's in it
	_landed( j ) {

		const t = j.trap, game = this.game, st = game.state, list = this.traps.set, d = Math.max( 0, this.depthAt( t.x, t.z ) );
		let q = t.q, size = t.size;
		if ( ! Number.isFinite( q ) ) {

			const B = BOTTOMS[ this.bottom( t.x, t.z ) ];
			q = B.q;
			size = B.sizeCm;

		}

		const r = haulOf( t, q, size, d, this._T() );
		j.soak = r.soak;
		j.place = game.placeAt( t.x, t.z );
		j.queue = [ ...r.lobsters.map( ( l ) => ( { ...l, lobster: true } ) ), ...r.others ];
		j.total = j.queue.length;
		const k = list.indexOf( t );
		if ( k >= 0 ) list.splice( k, 1 );
		if ( t.mark !== null ) st.chart.unmark( t.mark );
		this._dirty = true;
		st.save();
		st.emit();
		if ( ! j.queue.length ) game.toast( r.soak.nights < 1 ? 'Empty · they forage by night, leave it overnight at least' : 'Empty', 3000 );

	}

	_offerRail( j, p, inp ) {

		const game = this.game;
		if ( j.card ) return;
		const next = j.queue && j.queue[ 0 ];
		if ( next ) {

			const lob = j.queue.filter( ( x ) => x.lobster ).length;
			p.prompt = { key: 'E', text: next.lobster ? `Gauge the lobster   ·   ${ lob } in the trap` : `Take out the ${ next.label.toLowerCase() }` };
			if ( inp.hit( 'KeyE' ) ) this._takeOut( j, j.queue.shift() );
			return;

		}

		p.prompt = { key: 'E', text: 'Stack it aboard' };
		if ( inp.hit( 'KeyE' ) ) {

			j.phase = 'stack';
			j.t = 0;
			j.stow = aboardTraps( this.traps, game.state.upgrades ) - 1;

		}

	}

	// one out of the trap: a lobster on the gauge (the same rules as a diver's, Game.gaugeLobster), the rest as they are
	_takeOut( j, x ) {

		const game = this.game, st = game.state, A = this.app.audio, at = this._boat.group.matrixWorld, sea = _p.copy( this.at.rail ).applyMatrix4( at );
		if ( x.lobster || x.species ) {

			const species = x.lobster ? 'lobster' : x.species;
			const release = x.lobster ? ( x.cm < FISH.lobster.minCm ? 'short' : x.berried ? 'berried' : null ) : null;
			const entry = st.addFish( species, x.kg, game.hour, { method: 'trap', cm: x.cm ?? null, day: game.tradeDay, release, place: j.place } );
			const info = st.lastCatch;
			game.charted( species, info.place, _a.set( j.trap.x, 0, j.trap.z ) );
			info.wanted = entry ? game.wantedFor( entry ) : null;
			if ( this.app.together ) {

				const isle = this.app.together.caught( species, info.kg, info.cm, 'trap', info.place );
				info.islandRecord = isle.island;
				info.islandHeld = isle.held || null;
				info.placeRecord = isle.place ? info.place : null;

			}

			if ( game.hud && ( info.kept || info.newSpecies || info.record || game.state.roomFor( info ) ) ) {

				j.card = info;
				j.cardT = 0;
				game.hud.showCatch( info, 9000 );

			} else {

				const name = FISH[ species ].name, size = x.lobster ? `${ ( info.cm * CARAPACE / 2.54 ).toFixed( 2 ) } in carapace` : '';
				const why = { short: 'short, over the side', berried: 'carrying eggs, over the side she goes' }[ info.why ] || ( info.bag && info.bag.full ? 'your bag\'s full today, over the side' : ! info.kept ? 'no room, over the side' : `$${ info.value }` );
				game.toast( [ name, size, why ].filter( Boolean ).join( ' · ' ), 3200 );

			}

			if ( ! info.kept && A && A.fishSplash ) A.fishSplash( sea, 0.3 );

		} else {

			game.toast( `${ x.label } · back over the side`, 2200 );
			if ( A && A.plop ) A.plop( sea );

		}

	}

	// ---- Marta's: a new trap for one lost
	buyNew() {

		const st = this.game.state;
		if ( ! this.traps.lost || st.money < TRAP_PRICE ) return false;
		st.money -= TRAP_PRICE;
		this.traps.lost --;
		st.save();
		st.emit();
		return true;

	}

	// ---- the weather on them, and a word as a hurricane comes
	_reckon( dt ) {

		const app = this.app, game = this.game, s = app.settings;
		const news = app.weather && app.weather.news;
		if ( news && this.traps.set.length && news.stage === 'warning' && ! this._said.has( news.onset ) ) {

			this._said.add( news.onset );
			game.toast( `You've ${ this.traps.set.length } trap${ this.traps.set.length === 1 ? '' : 's' } out · a hurricane takes or drags them, the shallowest worst · haul them while you can`, 5600 );

		}

		this._settleT -= dt;
		if ( this._settleT > 0 || ! this.traps.set.length ) return;
		this._settleT = SETTLE_S;
		// (not the one coming up: it's in the boat's hands)
		const hauling = this.job && this.job.trap, kept = hauling && this.traps.set.includes( hauling );
		if ( kept ) this.traps.set.splice( this.traps.set.indexOf( hauling ), 1 );
		const events = settle( this.traps, this._T(), { depth: ( x, z ) => this.depthAt( x, z ), pick: app.weatherPick ? app.weatherPick() : null, since: s.weatherSince } );
		if ( kept ) this.traps.set.push( hauling );
		if ( ! events.length ) return;
		for ( const e of events ) if ( e.fate !== 'moved' && e.fate !== 'buoy' && e.mark !== null ) game.state.chart.unmark( e.mark );
		game.state.save();
		game.state.emit();
		this._dirty = true;
		const told = trapsTold( events );
		if ( told && game.hud && game.hud.showAwayNote ) game.hud.showAwayNote( told );
		else if ( told ) game.toast( told.join( ' ' ), 6000 );

	}

	// ---- the buoys everyone sees: the group's save, written when yours change and told to whoever's here
	_shared( dt ) {

		const T = this.app.together;
		if ( ! T || ! T.portal || ! T.portal.save || ! T.portal.save.shared ) return;
		if ( ! this._read ) {

			this._read = true;
			T.session.on( 'buoys', ( raw ) => {

				this.others = cleanBuoys( raw );

			} );
			T.portal.save.shared.get( 'buoys' ).then( ( raw ) => {

				this.others = cleanBuoys( raw );
				// (still out there, whoever's come since: the record's life starts again from now)
				if ( this.traps.set.length ) this._dirty = true;

			} ).catch( ( e ) => console.warn( 'buoys', e ) );

		}

		this._shareT -= dt;
		if ( ! this._dirty || this._shareT > 0 ) return;
		this._dirty = false;
		this._shareT = 2;
		const me = T.me, rec = buoyRecord( { name: me.name, traps: this.traps, at: Date.now() } );
		T.portal.save.shared.update( 'buoys', ( cur ) => {

			const c = cleanBuoys( cur );
			if ( rec.b.length ) c[ me.id ] = rec;
			else delete c[ me.id ];
			return c;

		} ).then( ( saved ) => {

			this.others = cleanBuoys( saved );
			if ( T.others.size ) T.session.send( 'buoys', saved );

		} ).catch( ( e ) => console.warn( 'buoys', e ) );

	}

	// ---- what's drawn
	_gather() {

		const app = this.app, cam = app.camera.position, [ far ] = REACH[ app.tier ] || REACH.high, list = this._near, T = app.terrainData;
		list.length = 0;
		const add = ( x, z, mine, trap, id, name, hasBuoy ) => {

			const d = Math.hypot( x - cam.x, z - cam.z );
			if ( d > far ) return;
			const depth = this.depthAt( x, z ), o = buoyOffset( x, z, depth );
			list.push( { x, z, d, bx: x + o.x, bz: z + o.z, bottom: T.heightAt( x, z ), colours: buoyColours( id ), mine, trap, name, hasBuoy, yaw: ( x * 7.3 + z * 3.1 ) % 6.28 } );

		};

		const myId = app.together && app.together.me ? app.together.me.id : null;
		for ( const t of this.traps.set ) add( t.x, t.z, true, t, myId, null, t.buoy );
		for ( const [ id, r ] of Object.entries( this.others ) ) {

			if ( id === myId ) continue;
			for ( const [ x, z ] of r.b ) add( x, z, false, null, id, r.n, true );

		}

		list.sort( ( a, b ) => a.d - b.d );

	}

	_build() {

		if ( this.meshes ) return true;
		const app = this.app;
		this.meshes = new TrapMeshes( { ground: app.terrain, scene: app.scene, shadows: app.tier !== 'low' } );
		return true;

	}

	_draw( dt, aboard ) {

		const app = this.app, boat = this._boat, j = this.job;
		this._nearT -= dt;
		if ( this._nearT <= 0 ) {

			this._nearT = 0.25;
			this._gather();

		}

		const atRail = j && j.kind === 'haul' && ( j.phase === 'rail' || j.phase === 'stack' );
		const stacked = aboard - ( atRail ? 1 : 0 );
		const cam = app.camera.position, by = this.on && boat.group.position.distanceTo( cam ) < ABOARD_M;
		if ( ! this.meshes && ! this._near.length && ! ( this.on && aboard ) && ! j ) return;
		this._build();
		const M = this.meshes, sea = G.seaLevel.value, [ , farTrap ] = REACH[ app.tier ] || REACH.high;
		M.begin();
		if ( by ) boat.group.updateWorldMatrix( true, false );
		const W = boat.group.matrixWorld;
		// on her deck
		if ( by ) for ( let i = 0; i < stacked; i ++ ) M.trap( _m.multiplyMatrices( W, stowMatrix( boat.lines, i, _n ) ), stowColour( i ) );
		// on the sea
		let bobbing = 0;
		const time = G.time.value, q = app.query, tq = q ? q.resultTime : 0;
		for ( const n of this._near ) {

			const t = n.trap;
			if ( j && t && j.trap === t && ( j.kind === 'set' || j.phase !== 'gaff' ) ) continue;
			const onDeck = j && t && j.trap === t && j.kind === 'haul' && j.phase === 'gaff';
			if ( n.d < farTrap ) M.trap( _m.compose( _p.set( n.x, n.bottom + 0.02, n.z ), _q.setFromAxisAngle( _y, n.yaw ), _s ), stowColour( Math.abs( Math.floor( n.x + n.z ) ) ) );
			if ( ! n.hasBuoy || onDeck ) continue;
			this._drawBuoy( M, n.bx, n.bz, n.x, n.bottom + TRAP.H, n.z, n.colours, n.yaw, bobbing ++ < BOB_N, time, q, tq, sea );

		}

		if ( j ) this._drawJob( M, W, j, sea, time, q, tq );
		M.commit();

	}

	_drawBuoy( M, x, z, tx, ty, tz, colours, yaw, rides, time, q, tq, sea ) {

		const h = rides && q ? q.heightAt( x, z, tq ) : sea + Math.sin( time * 0.9 + x ) * 0.12;
		const lean = 0.09;
		_q.setFromAxisAngle( _a.set( Math.cos( time * 0.7 + x ), 0, Math.sin( time * 0.53 + z ) ).normalize(), lean * Math.sin( time * 1.1 + z ) );
		_q.multiply( _qi.setFromAxisAngle( _y, yaw ) );
		_p.set( x, h, z );
		_m.compose( _p, _q, _s );
		_e.set( tx - x, ty - h, tz - z ).applyQuaternion( _qi.copy( _q ).invert() );
		M.buoy( _m, colours, _e );

	}

	_drawJob( M, W, j, sea, time, q, tq ) {

		const a = this.at, boat = this._boat, myC = buoyColours( this.app.together && this.app.together.me ? this.app.together.me.id : null ), colour = stowColour( j.trap.seed % 8 );
		if ( j.kind === 'set' ) {

			const toRail = 0.7, over = 0.5, t = j.t, sinkAt = toRail + over;
			if ( t < toRail ) {

				// off the stack, on to the rail
				const u = ease( t / toRail );
				stowMatrix( boat.lines, j.stow, _n );
				_n.decompose( _p, _q, _c );
				_p.lerp( a.rail, u );
				_p.y += Math.sin( u * Math.PI ) * 0.35;
				_q.slerp( _qi.setFromAxisAngle( _y, Math.PI / 2 ), u );
				M.trap( _m.multiplyMatrices( W, _n.compose( _p, _q, _s ) ), colour );

			} else if ( t < sinkAt ) {

				// over the side
				const u = ( t - toRail ) / over;
				_p.copy( a.rail ).lerp( a.over, ease( u ) );
				_p.y = a.rail.y - u * u * ( a.rail.y - sea );
				_q.setFromAxisAngle( _y, Math.PI / 2 );
				M.trap( _m.multiplyMatrices( W, _n.compose( _p, _q, _s ) ), colour );

			} else {

				const y = Math.max( j.bottom + 0.02, sea - TRAP.H - ( t - sinkAt ) * 1.0 );
				M.trap( _m.compose( _p.set( j.trap.x, y, j.trap.z ), _q.setFromAxisAngle( _y, j.yaw ), _s ), colour );
				// the warp to it, and the buoy after it
				const d = Math.max( 0.5, sea - j.bottom ), o = buoyOffset( j.trap.x, j.trap.z, d ), bx = j.trap.x + o.x, bz = j.trap.z + o.z, u = clamp01( ( t - sinkAt - 0.1 ) / 0.8 );
				if ( u < 1 ) {

					_c.copy( a.rail ).applyMatrix4( W );
					_p.set( mix( _c.x, bx, u ), mix( _c.y, sea, u ) + Math.sin( u * Math.PI ) * 0.8, mix( _c.z, bz, u ) );
					_e.set( j.trap.x - _p.x, y + TRAP.H - _p.y, j.trap.z - _p.z );
					M.buoy( _m.compose( _p, _q.identity(), _s ), myC, _e );

				} else this._drawBuoy( M, bx, bz, j.trap.x, y + TRAP.H, j.trap.z, myC, j.yaw, true, time, q, tq, sea );

			}

			return;

		}

		// the buoy, gaffed in over the rail, and lying there
		const bo = _c.copy( a.gaffed ).applyMatrix4( W ), gaffX = bo.x, gaffY = bo.y, gaffZ = bo.z;
		if ( j.phase === 'gaff' ) {

			const u = ease( clamp01( j.t / 0.7 ) ), sx = j.trap.x + j.o.x, sz = j.trap.z + j.o.z;
			M.buoy( _m.compose( _p.set( mix( sx, gaffX, u ), mix( sea, gaffY, u ) + Math.sin( u * Math.PI ) * 0.5, mix( sz, gaffZ, u ) ), _q.identity(), _s ), myC, _e.set( j.trap.x - _p.x, j.bottom + TRAP.H - _p.y, j.trap.z - _p.z ) );
			M.trap( _m.compose( _p.set( j.trap.x, j.bottom + 0.02, j.trap.z ), _q.setFromAxisAngle( _y, j.yaw ), _s ), colour );
			return;

		}

		if ( j.phase === 'up' || j.phase === 'swing' ) M.buoy( _m.compose( _p.set( gaffX, gaffY, gaffZ ), _q.setFromAxisAngle( _a.set( 1, 0, 0 ), 1.2 ), _s ), myC );
		if ( j.phase === 'up' ) {

			// up under the block, drawn in toward her as it comes, its bridle hanging it nose-up
			const block = _b.copy( a.block ).applyMatrix4( W ), u = clamp01( j.t / j.total ), hangY = block.y - TRAP.H - 0.3;
			const y = mix( j.bottom + 0.02, hangY, u ), side = ease( clamp01( u * 1.6 ) ), wave = q ? q.heightAt( j.trap.x, j.trap.z, tq ) : sea;
			const tip = clamp01( ( u - 0.02 ) * 12 ) * 0.5, swing = Math.sin( time * 2.1 ) * 0.1 * clamp01( ( y - wave ) * 2 );
			_p.set( mix( j.trap.x, block.x, side ), y, mix( j.trap.z, block.z, side ) );
			_q.setFromAxisAngle( _y, j.yaw + ( 1 - side ) * 0.6 ).multiply( _qi.setFromAxisAngle( _a.set( 1, 0, swing ).normalize(), tip ) );
			M.trap( _m.compose( _p, _q, _s ), colour );
			if ( ! j.surfaced && y + TRAP.H > wave ) {

				j.surfaced = true;
				const A = this.app.audio;
				if ( A && A.netLift ) A.netLift( 0.6, true );
				if ( A && A.netSplash ) A.netSplash( _c.set( _p.x, wave, _p.z ), 0.5 );

			}

			// water pouring out of it
			if ( j.surfaced && y > wave && y - wave < 2.5 && this.app.spray ) this.app.spray.emit( _c.set( _p.x, y + 0.15, _p.z ), _a.set( 0, - 1, 0 ), 2, 0.03, SPRAY.DROPLET, { spread: TRAP.W * 0.6, jitter: 0.2 } );
			// the warp, up to the block
			_e.set( _p.x - block.x, y + TRAP.H - block.y, _p.z - block.z );
			M.buoy( _m.compose( _c.copy( block ), _q.identity(), _s ), myC, _e, true );
			return;

		}

		if ( j.phase === 'swing' ) {

			// in on the davit, on to the rail
			const u = ease( clamp01( j.t ) );
			_a.copy( a.block ).setY( a.block.y - TRAP.H - 0.3 );
			_p.lerpVectors( _a, a.rail, u );
			_p.y += Math.sin( u * Math.PI ) * 0.12;
			_q.setFromAxisAngle( _y, Math.PI / 2 * u );
			M.trap( _m.multiplyMatrices( W, _n.compose( _p, _q, _s ) ), colour );
			M.buoy( _m.compose( _c.copy( a.block ).applyMatrix4( W ), _qi.identity(), _s ), myC, _e.copy( _p ).applyMatrix4( W ).sub( _c ).add( _b.set( 0, TRAP.H, 0 ) ), true );
			return;

		}

		// on the rail, with what's in it; or back on to the stack
		if ( j.phase === 'rail' ) {

			_q.setFromAxisAngle( _y, Math.PI / 2 );
			M.trap( _m.multiplyMatrices( W, _n.compose( _p.copy( a.rail ), _q, _s ) ), colour );
			if ( j.queue ) {

				let i = 0;
				for ( const x of j.queue ) {

					if ( ! x.lobster ) continue;
					// (side by side on the wire floor, on its legs)
					const L = x.cm / 100, zs = 0.21 * ( i - 0.5 * ( Math.min( 3, j.total ) - 1 ) );
					_p.set( a.rail.x + ( i % 2 ? 0.17 : - 0.12 ), a.rail.y + 0.07, a.rail.z + zs );
					_q.setFromAxisAngle( _y, Math.PI / 2 + ( i % 2 ? 0.5 : - 0.3 ) );
					M.lobster( _m.multiplyMatrices( W, _n.compose( _p, _q, _c.set( L, L, L ) ) ) );
					if ( ++ i >= 3 ) break;

				}

			}

		} else {

			const u = ease( clamp01( j.t / 0.7 ) );
			stowMatrix( boat.lines, Math.max( 0, j.stow ), _n );
			_n.decompose( _p, _q, _c );
			_p.lerpVectors( a.rail, _p, u );
			_p.y += Math.sin( u * Math.PI ) * 0.35;
			_qi.setFromAxisAngle( _y, Math.PI / 2 ).slerp( _q, u );
			M.trap( _m.multiplyMatrices( W, _n.compose( _p, _qi, _s ) ), colour );

		}

	}

}
