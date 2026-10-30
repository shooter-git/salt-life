import { Vector3, Color, Mesh, BoxGeometry, MeshStandardMaterial, Group } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { WORLD } from '../world/WorldLayout.js';
import { FISH, CARAPACE, fishWeightKg, spearRule } from './FishTable.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay } from './Bites.js';
import { CatchMinigame } from './CatchMinigame.js';
import { GameState } from './GameState.js';
import { FishingRod, buildLineGeometry } from './FishingRod.js';
import { createLineMaterial } from './GameMaterials.js';
import { FishStand, STAND } from './FishStand.js';
import { Chandlery, CHANDLERY } from './Chandlery.js';
import { CatchDisplay } from './CatchDisplay.js';
import { FishPortrait } from './FishPortrait.js';
import { UPGRADES, fuelBurn, TOW, towFee } from './Gear.js';
import { Hull, thrustMul, repairFee } from './Hull.js';
import { GameHUD } from './GameHUD.js';
import { TimeHUD } from './TimeHUD.js';
import { timeText } from './IslandClock.js';
import { NIGHT_BOX, ordersFor, tradeDay, stallOpen, shutFor } from './Orders.js';
import { WantedBoard } from './WantedBoard.js';
import { ForecastSlate } from './ForecastSlate.js';
import { forecast, islandTime, blowShare, NORTH } from './Weather.js';
import { wxNews } from './TimeHUD.js';
import { CRADLE } from '../world/village/StormPlaces.js';
import { StormChart, shelterSign } from './StormChart.js';
import { ClosedSign } from './ClosedSign.js';
import { Signpost } from './Signpost.js';
import { delivered, filled, owed, weekEnds } from './WeekOrder.js';
import { Minimap } from './Minimap.js';
import { Guide } from './Guide.js';
import { Speargun, groundHit } from './Speargun.js';
import { CastNet, sweetWindow } from './CastNet.js';
import { BAITS, BAIT_IDS } from './Bait.js';
import { LobsterTools } from './LobsterTools.js';
import { lb, feet, gallons } from './Units.js';
import { SPECIES } from '../world/fish/FishSpecies.js';
import { SEABED } from '../world/terrain/SeabedModel.js';
import { mangroveAt } from '../world/terrain/Mangrove.js';
import { northReefMask } from '../world/TerrainData.js';
import { placeOf, placeName } from './Places.js';
import { FINDS, lying, messageOf } from './Beachcomb.js';
import { ordersOf, tagFor } from './Orders.js';

// how long the catch card stays up unless dismissed (ms)
const CATCH_CARD_MS = 9000;
// (M15) the island's middle, and up the trades from it (Weather's NORTH.dir, the way they blow, turned
// round): the windward side's (Game.windwardAt)
const ISLE = { x: 30, z: - 320 };
const UPWIND = { x: - NORTH.dir.x, z: - NORTH.dir.y };
// (Salt Life) the anchor: within this of the berth the dock lines hold the boat instead (Player.exitBoat),
// and it goes down once the boat is slower than this (m/s)
const BERTH_M = 14;
const ANCHOR_SPEED = 2.5;
const RODE_SEGS = 16;
// (M10) the bucket's offered on deck from this much water in the bilge (litres), and the hull's wear
// is saved whenever it's grown this much since it last was
const BAIL_FROM = 20;
const WEAR_SAVE = 0.02;
// (M13) Marta's haul-out ahead of a hurricane ($: less than the repair a hurricane leaves to do)
export const HAUL_FEE = 40;
const _a = new Vector3(), _b = new Vector3(), _h = new Vector3();
const _pose = { pos: new Vector3(), head: new Vector3(), roll: 0, thrash: 0 };
const BAG_FROM = 0.85; // the brails drawn this far: the netting has closed round what's under it (it rides in the purse)
// (Salt Life) the hand net's reach (m); how long a lobster in the net shows before it's gauged (s); a
// thief's try at a fish on the shaft or the line: first after this long (s), then every so often,
// and it gives up after this long; the rod's fish it goes for (kg, under)
const NET_M = 0.95;
const GAUGE_S = 0.6;
const THIEF_S = [ 0.8, 4, 12 ];
const THIEF_KG = 8;
const upper = ( t ) => t.charAt( 0 ).toUpperCase() + t.slice( 1 );
// a kind's name mid-sentence: 'a goliath grouper', 'a Caribbean reef shark'
const aName = ( label ) => 'a ' + label.replace( /^\w+/, ( w ) => w === 'Caribbean' ? w : w.toLowerCase() );

// the sale's one line ('Sold 3 fish for $86 · 2 on the wanted list · 1 for the week's order')
const saleText = ( r, vendor ) => ( vendor && ! vendor.open ? `Left ${ r.count } fish in the night box · $${ r.total }`
	: `Sold ${ r.count } fish for $${ r.total }${ r.wanted ? ` · ${ r.wanted } on the wanted list` : '' }` ) + ( r.weekN ? ` · ${ r.weekN } for the week's order` : '' );

// The fishing game on top of the world:
//   R          take out / put away the rod (on foot, on the pier, on the boat's deck); (Salt Life) in
//              the water, the speargun: it shoots only once you've dived (LMB), the bands load by
//              holding LMB, a big fish on the shaft is pulled in like a fish on the rod. The rod
//              stays out of the water and the speargun in it: changing between them means getting
//              out of the water or into it
//   hold LMB   wind up, release to cast (hold longer = farther)
//   LMB        strike when a fish takes the bobber ("!"); then hold LMB to reel, let go to ease off
//   RMB        reel an empty line back in
//   N          (Salt Life) take out / put away the cast net (where the rod goes: it takes the rod's
//              place). Hold LMB to wind up, let go as the ring on the water brightens (the moment
//              that spins it fully open); once it's down, hold LMB to draw the line: the brails close
//              the lead line under what's caught, then the purse comes in hand over hand
//   B          (Salt Life) the bait for the hook: the frozen shrimp, or what the net put in the bait
//              bucket (Bait.js); it goes on at the next cast (the d-pad's ← → with the rod out)
//   I / Tab    cooler / hold contents and the fish log
//   E          at the fish stand: sell your catch
export class Game {

	constructor( app ) {

		this.app = app;
		// (Salt Life: the app's progress, kept in All the Spaces' personal save and loaded with it)
		this.state = app.state || new GameState();
		if ( ! app.state ) this.state.load();
		this.rod = new FishingRod( { scene: app.scene, camera: app.camera, query: app.query, terrain: app.terrainData, audio: app.audio } );
		this.rod.onLand = ( where ) => this.onBobberLanded( where );
		// (Salt Life) the speargun; the speared fish ({ i, id, kg, cm, kill, tail, card }) and the fight
		// with a big one; what's under the sights
		this.gun = new Speargun( { scene: app.scene, camera: app.camera, ground: app.terrain, audio: app.audio } );
		// (Salt Life) the cast net; how many fish are in it while it's in the water; the bait on the hook
		// (Bait.js; null: the frozen shrimp), taken from the bucket as the line is cast
		this.net = new CastNet( { scene: app.scene, camera: app.camera, query: app.query, ground: app.terrain, audio: app.audio, spray: app.spray } );
		this.netIn = 0;
		this.hookBait = null;
		this.speared = null;
		this.spearFight = null;
		this.aim = null;
		this._blackouts = 0;
		this._said = 0;
		// (Salt Life) the lobster diver's tickle stick and hand net (R again in the water, after the
		// speargun, once you have them); the lobster being netted, the one in the net ({ i, cm, kg,
		// berried, t, card }), and the one in front of you
		this.tools = new LobsterTools( { scene: app.scene, camera: app.camera, ground: app.terrain, audio: app.audio } );
		this._scoop = null;
		this.netted = null;
		this.lobsterAim = null;
		// (Salt Life: the stalls are the app's, built with the village)
		this.stand = app.stand || new FishStand( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders } );
		this.display = new CatchDisplay( { scene: app.scene, stall: this.stand.iceFish(), lite: app.tier === 'low' } );
		// (Salt Life: the catch card's fish portrait is drawn by the app, in its canvas)
		this.portrait = new FishPortrait( this.display.material, { lite: app.tier === 'low' } );
		this.landing = null; // { species, kg } while the caught fish swings in view
		this.chandlery = app.chandlery || new Chandlery( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders, material: this.stand.material } );
		this.vendors = [ this.stand.vendor, this.chandlery.vendor ].filter( Boolean );
		// (Salt Life) the day's wanted lists (Orders.js), chalked on a slate on Joe's counter. On a device
		// that draws on its CPU it goes up after the start, with the records board (App.prepareLate)
		this.orders = [];
		this.tradeDay = null;
		this.wanted = new WantedBoard( { terrain: app.terrainData } );
		// (M13) boarded up for a hurricane: plywood over Joe's counter, a blue tarp roped over Marta's table
		// and shelves (shown while they're shut for one)
		this.boards = new Group();
		this.boards.name = 'BoardedUp';
		this.boards.visible = false;
		{

			const ply = new MeshStandardMaterial( { color: 0xb89a6a, roughness: 0.85 } ), tarp = new MeshStandardMaterial( { color: 0x2f6fb0, roughness: 0.7 } );
			const at = ( mat, sx, sy, sz, cx, lx, ly, lz, yaw ) => {

				const m = new Mesh( new BoxGeometry( sx, sy, sz ), mat );
				const c = Math.cos( yaw ), s = Math.sin( yaw ), g = app.terrainData.heightAt( cx.x, cx.z );
				m.position.set( cx.x + lx * c + lz * s, g + ly, cx.z - lx * s + lz * c );
				m.rotation.y = yaw;
				this.boards.add( m );

			};
			at( ply, 2.8, 1.25, 0.03, STAND, 0, 1.62, 0.97, STAND.yaw );
			at( ply, 0.03, 1.25, 1.8, STAND, 1.44, 1.62, 0.05, STAND.yaw );
			at( ply, 0.03, 1.25, 1.8, STAND, - 1.44, 1.62, 0.05, STAND.yaw );
			at( tarp, 2.25, 1.0, 1.0, CHANDLERY, 0, 0.5, 0, CHANDLERY.yaw );
			at( tarp, 1.45, 1.7, 0.55, CHANDLERY, 0, 0.85, - 1.4, CHANDLERY.yaw );
			app.scene.add( this.boards );

		}

		// (M13) the shelter's sign over its door, and the tracking chart on its back wall inside
		const sh = app.village && app.village.shelter;
		this.stormChart = sh && typeof document !== 'undefined' ? new StormChart() : null;
		if ( this.stormChart ) {

			const on = ( mesh, lx, y, lz ) => {

				const c = Math.cos( sh.yaw ), s = Math.sin( sh.yaw );
				mesh.position.set( sh.x + lx * c + lz * s, y, sh.z - lx * s + lz * c );
				mesh.rotation.y = sh.yaw;
				app.scene.add( mesh );

			};
			on( shelterSign(), 0, sh.floorY + 2.72, sh.d / 2 + 0.03 );
			on( this.stormChart.mesh, - 1.6, sh.floorY + 1.75, - sh.inside.hz + 0.02 );

		}
		// (M9) and the forecast on a smaller slate beside it: hung from the wanted slate (where it is: attach),
		// it goes up with it
		this.forecastSlate = new ForecastSlate( { terrain: app.terrainData } );
		// ((M15) the fingerpost by the boardwalk: the way round the island, read from the start)
		this.signpost = new Signpost( { terrain: app.terrainData, colliders: app.colliders } );
		app.scene.add( this.signpost.group );
		this.wanted.mesh.attach( this.forecastSlate.mesh );
		this._forecastT = 0;
		app.lightUp( this.wanted.mesh );
		if ( ! app.cpuGL ) app.scene.add( this.wanted.mesh );
		this.state.onChange( () => this.drawWanted() );
		// (Salt Life) the week's order (WeekOrder.js): the group's tally as last seen; your share, just paid
		this._weekSeen = null;
		this.paidNote = 0;
		// (Salt Life) a "Closed" board at each stall while its trader's gone home (Vendor.setOpen); on a device
		// that draws on its CPU, up after the start with the slate (App.prepareLate). (M9) Shut for the
		// weather, it says so
		const back = ( v ) => `Back at ${ timeText( v.hours[ 0 ], app.portal && app.portal.locale, 60 ) }`;
		const signs = [
			[ this.stand.vendor, STAND, { x: 0.32, y: 1.045, z: 0.96, tilt: 0.24, roll: 0.03 }, 0.5, 'Fish in the night box' ],
			[ this.chandlery.vendor, CHANDLERY, { x: 0.35, y: 0, z: 0.41, tilt: 0.33, roll: - 0.02 }, 0.6, 'Diesel: pay into the box' ], // (leaning on the table's front, z 0.29)
		];
		this.signs = signs.filter( ( [ v ] ) => v && v.hours ).map( ( [ v, at, spot, width, left ] ) => {

			const sign = new ClosedSign( { terrain: app.terrainData, at, spot, width, lines: [ back( v ), left ], weatherLines: [ 'Shut for the weather', left ] } );
			app.lightUp( sign.mesh );
			if ( ! app.cpuGL ) app.scene.add( sign.mesh );
			v.sign = sign.mesh;
			return sign;

		} );
		// boat upgrades: engine (thrust / top speed) and deck floodlights for night fishing
		const b = app.boatCtl;
		this._engineBase = { maxThrust: b.maxThrust, pitchSpeed: b.pitchSpeed };
		// (M10) the hull (Hull.js): her wear (in the save: the state is its store), the water in her bilge
		// (her mass, as it's aboard) and her engine; the bucket going; what's been said
		this.hull = new Hull( { store: this.state } );
		this._massBase = b.mass;
		this._wearSaved = this.state.hull;
		this._bailing = false;
		this._wornSaid = 0;
		this._floodSaid = false; // (said the water's over the engine, until she next runs)
		// ((M13) hauled out ahead of a hurricane when you left: she's on her cradle still)
		if ( this.state.hauled ) b.setHauled( this.cradle );
		this._boatSounds = false;
		this.floods = [];
		if ( app.localLights ) this.addFloodlights( app.localLights, app.boat );
		// (Salt Life) the anchor's rode while it's down, from the stem head to the bottom (the fishing
		// line's ribbon, in rope's colour); and a leave of the helm still waiting for the boat to slow
		this.rode = new Mesh( buildLineGeometry( RODE_SEGS ), createLineMaterial( RODE_SEGS ) );
		this.rode.name = 'AnchorRode';
		this.rode.material.color.set( 0xcfc6ad );
		this.rode.material.uniforms.lineShow.value = 2; // twice the fishing line's width
		this.rode.frustumCulled = false;
		this.rode.castShadow = false;
		this.rode.visible = false;
		app.scene.add( this.rode );
		this._anchorDue = false;
		this._fuelOut = false;
		this._sonarT = 0;
		this._sonar = null;
		this.hud = null;
		this.fight = null; // CatchMinigame while a fish is on
		this.bite = null; // { phase: 'wait' | 'nibble' | 'take', t, nibbles, species, kg }
		this._lmb = false;
		this._rmb = false;
		this._hookedSpecies = null;
		this._pier = WORLD.pier;
		this._tmp = new Vector3();
		this.applyGear();
		this.state.onChange( () => this.applyGear() );

	}

	applyGear() {

		const g = this.state.stats;
		this.rod.setGear( { castM: g.castM, reelSpeed: g.reelSpeed } );
		if ( this.gun ) this.gun.setGear( g );
		if ( this.net ) this.net.setGear( g );
		if ( this.tools ) this.tools.setGear( g );
		const b = this.app.boatCtl;
		if ( b && this._engineBase ) {

			b.maxThrust = this._engineBase.maxThrust * g.speedMul * g.speedMul;
			b.pitchSpeed = this._engineBase.pitchSpeed * g.speedMul;

		}

		for ( const f of this.floods || [] ) f.scale = g.deckLights ? 1 : 0;

	}

	// two floodlights under the back of the wheelhouse roof, lighting the cockpit and the water
	// astern (night only, like every local light; switched by the lights upgrade)
	addFloodlights( lights, boat ) {

		const obj = boat.group;
		for ( const x of [ - 0.8, 0.8 ] ) {

			const local = new Vector3( x, 2.25, - 1.0 );
			const localDir = new Vector3( x * 0.25, - 0.75, - 0.62 ).normalize();
			const src = {
				position: new Vector3(), color: new Color( 1.0, 0.93, 0.8 ), intensity: 3.2, range: 14, kind: 'boatFlood',
				dir: new Vector3(), cosInner: 0.8, cosOuter: 0.45, scale: 0,
				update() {

					obj.updateWorldMatrix( true, false );
					this.position.copy( local ).applyMatrix4( obj.matrixWorld );
					this.dir.copy( localDir ).transformDirection( obj.matrixWorld );

				},
			};
			src.update();
			this.floods.push( src );
			lights.add( src );

		}

	}

	buy( key ) {

		const r = this.state.buy( key );
		if ( r ) this.toast( `${ UPGRADES[ key ].name }: ${ r.label }` );
		return r;

	}

	refuel() {

		const l = this.state.refuel();
		if ( l > 0 ) {

			this._fuelOut = false;
			this.toast( `Filled up · ${ gallons( l ) } gal` );

		}

		return l;

	}

	// (Salt Life) Marta's tow: your boat, drifted off (or left) more than TOW.from from the dock with
	// nobody at her helm, as { metres, fee }; null when there's nothing to tow
	towJob() {

		const b = this.app.boatCtl, dock = WORLD.boatDock.position;
		if ( ! b || b.moored || b.driven || b.hauled ) return null;
		const metres = Math.hypot( b.position.x - dock.x, b.position.z - dock.z );
		return metres > TOW.from ? { metres, fee: towFee( metres ) } : null;

	}

	// she brings her back to the dock (you're at her stall, so not aboard); returns what you paid
	tow() {

		const job = this.towJob();
		if ( ! job ) return 0;
		const paid = this.state.payTow( job.fee );
		this._anchorDue = false;
		this.app.boatCtl.reset();
		this.toast( paid < job.fee ? `Marta towed her in for the $${ paid } you had · she's at the dock` : `Marta towed her in · $${ paid } · she's at the dock` );
		return paid;

	}

	toast( text, ms = 2600 ) {

		if ( this.hud ) this.hud.toast( text, ms );
		else console.log( '[game]', text );

	}

	get canFish() {

		const app = this.app, p = app.player;
		return ! app.freeCam && ( p.mode === 'walk' || p.mode === 'deck' ) && ! ( app.ui && app.ui.ui && app.ui.ui._photo );

	}

	// (Salt Life) the speargun is for the water: out while swimming, and it fires once you've dived
	get canSpear() {

		const app = this.app, p = app.player;
		return ! app.freeCam && p.mode === 'swim' && ! ( app.ui && app.ui.ui && app.ui.ui._photo );

	}

	get submerged() {

		const p = this.app.player;
		return p.mode === 'swim' && p.under && ! p.floating && p.blackout === 0;

	}

	// ---- per frame (after the player / camera update)
	update( dt ) {

		const app = this.app, p = app.player, inp = app.input, rod = this.rod;
		this._cardDismissed = false;
		this.updateDay();
		this.updateWeek();
		this.updateForecast( dt );
		this.updateHurricane();
		if ( ! this.hud && app.ui && app.ui.ui && typeof document !== 'undefined' && document.head ) {

			const ui = app.ui.ui;
			this.hud = new GameHUD( ui, this );
			// (Salt Life) the island's clock, at the left of the purse (T: its menu)
			this.time = new TimeHUD( this, this.hud.purse, ui.root );
			// the minimap (lower right) and the first-play guide (intro, one-time tips; replay with H)
			this.minimap = new Minimap( ui.hud || ui.root, this );
			this.guide = new Guide( ui, this, this.minimap );
			ui.onReplayGuide = () => this.guide.replay();

		}

		const can = this.canFish, canSpear = this.canSpear, gun = this.gun, net = this.net;
		const room = this.makingRoom;
		if ( inp.hit( 'KeyR' ) && can && ! this.fight && ! net.busy && ! room ) {

			// (Salt Life) the cast net goes away for it
			if ( net.equipped ) this.dropNet();
			if ( rod.equipped ) this.stowRod();
			else rod.equip( true );
			const cast = { touch: 'hold Cast and let go', gamepad: 'hold RT to cast' }[ app.input.lastDevice ] || 'hold left mouse or F to cast';
			this.toast( rod.equipped ? `Rod out · ${ cast }` : 'Rod away', 1600 );

		} else if ( inp.hit( 'KeyN' ) && can && ! this.fight && ! net.busy && ! room ) this.toggleNet();
		else if ( inp.hit( 'KeyR' ) && canSpear && ! gun.shaftOut && ! this.tools.busy && ! room ) {

			// (Salt Life) in the water R is the speargun's; then, with the gear, the lobster tools'
			const tools = this.tools;
			const dive = { touch: 'Dive, then Shoot', gamepad: 'dive, then RT to shoot' }[ app.input.lastDevice ] || 'dive, then left mouse or F to shoot';
			const tickle = { touch: 'hold Tickle at a den, then Net', gamepad: 'hold RT at a den, then RT to net' }[ app.input.lastDevice ] || 'hold left mouse at a den, then click to net';
			if ( gun.equipped ) {

				gun.equip( false );
				tools.equip( tools.owned );
				this.toast( tools.equipped ? `Lobster gear out · ${ tickle }` : 'Speargun away', 2000 );

			} else if ( tools.equipped ) {

				tools.equip( false );
				this.toast( 'Lobster gear away', 1600 );

			} else {

				gun.equip( true );
				this.toast( `Speargun out · ${ dive }`, 1800 );

			}

		}

		if ( ! can && rod.equipped ) {

			// swimming, driving, free camera: the line comes in and the rod goes away
			this.stowRod();

		}

		// (and the cast net: whatever's in it goes back)
		if ( ! can && net.equipped ) this.dropNet();

		if ( ! canSpear && gun.equipped ) {

			// out of the water (or the free camera): the shaft comes in, any fish on it is lost, and the
			// speargun goes away
			this.dropSpear( ! this.speared );
			gun.equip( false );

		}

		if ( ! canSpear && this.tools.equipped ) {

			// (a lobster already gauged is kept; one still in the net goes back)
			this.dropLobster();
			this.tools.equip( false );

		}

		if ( this.hud && ( inp.hit( 'KeyI' ) || inp.hit( 'Tab' ) ) && ! room ) this.hud.toggleInventory();
		// the cooler's tabs: ← →, the d-pad
		if ( this.hud && this.hud.invOpen && ( inp.hit( 'ArrowLeft' ) || inp.hit( 'ArrowRight' ) ) ) this.hud.cycleTab( inp.hit( 'ArrowRight' ) ? 1 : - 1 );
		// (H at the helm is the horn)
		if ( this.guide && inp.hit( 'KeyH' ) && ! this.guide.open && app.player.mode !== 'boat' ) this.guide.replay();
		if ( this.hud && inp.hit( 'Escape' ) ) {

			this.hud.toggleInventory( false );
			this.hud.closeStand();

		}

		// mouse edges (the left button also looks around while the pointer isn't captured). (Salt Life:
		// F and G do the same from the keyboard, for trackpads and All the Spaces' checks' scripts)
		const lmb = ( inp.mouseDown || inp.down( 'KeyF' ) ) && inp.enabled, rmb = ( inp.rightDown || inp.down( 'KeyG' ) ) && inp.enabled;
		const lDown = lmb && ! this._lmb, lUp = ! lmb && this._lmb, rDown = rmb && ! this._rmb;
		this._lmb = lmb;
		this._rmb = rmb;
		const panelOpen = this.hud && ( this.hud.invOpen || this.hud.standOpen );
		// (a gamepad's RT on the cooler's Islander tab: the next islander)
		if ( panelOpen && lDown && this.hud.invOpen && this.hud.invTab === 'islander' && this.hud.device === 'gamepad' ) this.hud.nextLook();

		// (Salt Life) the bait for the hook: B, or the d-pad's ← → with the rod out
		const quiet = this.quietKeys();
		if ( rod.equipped && quiet && ( inp.hit( 'KeyB' ) || inp.hit( 'ArrowRight' ) || inp.hit( 'ArrowLeft' ) ) ) this.cycleBait( inp.hit( 'ArrowLeft' ) ? - 1 : 1 );
		else if ( net.equipped && quiet && inp.hit( 'KeyB' ) ) this.toast( this.bucketText(), 2400 );

		if ( rod.equipped && ! panelOpen ) {

			if ( rod.state === 'idle' && lDown ) rod.startWindup();
			else if ( rod.state === 'windup' && lUp ) {

				if ( rod.release() !== false ) this.baitHook();

			} else if ( rod.state === 'floating' ) {

				if ( lDown ) this.strike();
				else if ( rDown ) {

					rod.retrieve();
					this.bite = null;

				}

			} else if ( rod.state === 'flying' && rDown ) rod.retrieve();

		}

		// bites and the fight
		if ( rod.state === 'floating' ) this.updateBite( dt );
		else if ( ! this.fight ) rod.dip = Math.max( 0, rod.dip - dt * 4 );
		if ( this.fight ) this.updateFight( dt, lmb && ! panelOpen );

		rod.update( dt, { visible: can, fight: this.fight } );
		// (Salt Life) the cast net; the speargun; the lobster tools
		this.updateNet( dt, { lmb: ( lmb || rmb ) && ! panelOpen, lDown: lDown && ! panelOpen, lUp, panelOpen, visible: can } );
		this.updateSpear( dt, { lmb: lmb && ! panelOpen, lDown: lDown && ! panelOpen, canSpear } );
		this.updateLobster( dt, { lmb: lmb && ! panelOpen, lDown: lDown && ! panelOpen, canSpear } );
		// the landed fish hangs on the end of the line, turned to face you, then goes in the cooler. With
		// the HUD the catch card comes up once the fish has swung in, and the fish stays (slowly turning)
		// until the card is dismissed (click, E, Esc) or times out.
		const L = this.landing;
		if ( L && rod.state === 'landing' && can ) {

			const c = app.camera.position, m = rod.bobber;
			let yaw = Math.atan2( c.x - m.x, c.z - m.z );
			if ( L.card ) {

				if ( ! L.shown && rod.t > 0.3 ) {

					L.shown = true;
					this.hud.showCatch( L.card, CATCH_CARD_MS );

				}

				if ( L.shown ) {

					// a slow turn so both flanks show
					L.cardT += dt;
					yaw += Math.sin( L.cardT * 0.7 ) * 0.55;
					const end = this.cardEnd( L.card, L.cardT, lDown );
					if ( end ) {

						this._cardDismissed = true; // this frame's E / click belong to the card
						this.endLanding();

					}

				}

			}

			if ( this.landing ) {

				// with the HUD the fish is shown on the full-screen catch card (studio portrait), not on
				// the line; without it (headless, or no portrait) it hangs on the line
				const portrait = this.hud && this.hud.portrait && this.hud.portrait.live;
				if ( ! L.card || ! portrait ) this.display.show( L.species, L.kg, m, yaw, dt );
				else if ( this.display.shown ) this.display.hide();
				if ( ! L.card && rod.t > 2.8 ) this.endLanding();

			}

		} else if ( this.landing || this.display.shown ) this.endLanding();

		p.busy = rod.lineInWater || rod.state === 'windup' || gun.shaftOut || net.busy || net.state === 'windup' || this.tools.busy;

		this.updateBoat( dt );
		// (Salt Life) the floodlights' lenses glow when they're fitted, from dusk like their light
		const mats = app.boat && app.boat.materials;
		if ( mats && mats.floodOn ) mats.floodOn.value = this.floodsOn;

		// the traders
		for ( const v of this.vendors ) v.update( dt, p.mode === 'walk' ? p.position : null );
		this.updateVendors( inp, p );
		// ((M15) what the sea's left on the beaches, to pick up)
		this.updateBeachcomb( inp, p );

		// (M10) the bucket on deck; the crank at the helm while she's stalled
		this.updateBail( inp, p );
		// prompts when the player has nothing to say
		if ( ! p.prompt && ( can || canSpear ) ) p.prompt = this.prompt();

		const aboard = p.mode === 'boat' || p.mode === 'deck';
		// the catch card's live fish portrait (or one queued thumbnail)
		if ( this.hud && this.hud.portrait ) this.hud.portrait.update( dt );
		if ( this.hud ) this.hud.update( {
			fuel: aboard ? { litres: this.state.fuelL, tank: this.state.stats.fuelL } : null,
			// (M10) the hull once it's worn, and the bilge with water in it
			hull: aboard && ! p.riding && this.hull.wear > 0.02 ? this.hull.wear : null,
			bilge: aboard && ! p.riding && this.hull.bilge >= 1 ? this.hull.bilge : null,
			sonar: aboard && this.state.stats.finder ? this._sonar : null,
			fight: this.fight || this.spearFight,
			casting: rod.state === 'windup',
			power: rod.power,
			// (Salt Life) the cast net's wind-up and its moment; the bait on the hook, or the bucket
			netWind: net.state === 'windup' ? { charge: net.charge, win: sweetWindow( net.gear.spreadWin ), tired: net.over > 0.5 } : null,
			bait: rod.equipped ? this.baitChip() : net.equipped ? { label: 'Bucket', text: `${ this.state.baitCount } / ${ this.state.stats.baitMax }` } : null,
			bite: this.bite && this.bite.phase === 'take',
			aiming: rod.equipped || ( gun.state === 'loaded' && this.submerged ) || ( this.tools.equipped && this.submerged && ! this.tools.busy ),
			aim: gun.state === 'loaded' && this.submerged ? this.aim : this.tools.equipped && ! this.tools.busy ? this.lobsterTag() : null,
			// (the breath while it matters: in the water, under it or getting it back)
			breath: p.mode === 'swim' && ( p.under || p.breath < p.breathMax - 0.5 || p.blackout ) ? { s: p.breath, max: p.breathMax, blackout: p.blackout } : null,
		} );
		if ( this.time ) this.time.update( dt );
		if ( this.minimap ) this.minimap.update( dt );
		if ( this.guide ) this.guide.update( dt );

	}

	prompt() {

		const rod = this.rod, p = this.app.player;
		if ( this.gun.equipped ) return this.spearPrompt();
		if ( this.net.equipped ) return this.netPrompt();
		if ( this.tools.equipped ) return this.lobsterPrompt();
		if ( ! rod.equipped ) {

			// by the water (boat deck, pier, the wet beach, wading): suggest the rod (or the cast net); in
			// it, the speargun
			if ( p.mode === 'swim' ) return { key: 'R', text: 'Take out the speargun' };
			const byWater = p.mode === 'deck' || ( p.mode === 'walk' && [ 'wood', 'wetsand', 'water' ].includes( p.surface ) );
			return byWater ? { key: 'R', text: `Take out the rod   ·   ${ this.keyName( 'N' ) }  the cast net` } : null;

		}

		const b = this.bite;
		switch ( rod.state ) {

			case 'idle': return { key: 'LMB', text: `Hold to wind up, release to cast   ·   ${ this.keyName( 'B' ) }  bait   ·   R  put the rod away` };
			case 'windup': return { key: 'LMB', text: 'Release to cast (hold longer to cast farther)' };
			case 'flying': return null;
			case 'floating':
				if ( b && b.phase === 'take' ) return { key: 'LMB', text: 'Strike now!' };
				if ( b && b.phase === 'nibble' ) return { key: '…', text: 'Something\'s nibbling · wait until the bobber is pulled under' };
				return { key: 'RMB', text: 'Waiting for a bite · reel the line in' };
			case 'retrieving': return { key: 'RMB', text: 'Reeling in' };
			case 'fighting': return this.fight && this.fight.tension > this.fight.band[ 1 ]
				? { key: 'LMB', text: 'Too much tension · let go!' }
				: { key: 'LMB', text: 'Hold to reel · let go when the tension goes red' };
			case 'landing': return null;
			case 'rigging': return { key: '…', text: 'Tying on a new hook and float' };
			default: return null;

		}

	}

	// fuel burn while the engine runs (it stalls when the tank is dry: Hull) and the fish finder
	updateBoat( dt ) {

		const app = this.app, b = app.boatCtl, p = app.player, s = this.state;
		if ( b.driven && b.engineOn ) s.burn( fuelBurn( b.rpm ) * dt );
		else if ( this._wasDriven && ! b.driven ) s.save();
		this.updateHull( dt );
		this.updateAnchor( b.driven && ! this._wasDriven, ! b.driven && this._wasDriven );
		this._wasDriven = b.driven;

		if ( ( p.mode === 'boat' || p.mode === 'deck' ) && s.stats.finder ) {

			this._sonarT -= dt;
			if ( this._sonarT <= 0 ) {

				this._sonarT = 0.5;
				const x = b.position.x, z = b.position.z;
				const depth = Math.max( 0, G.seaLevel.value - app.terrainData.heightAt( x, z ) ); // ((M13) the surge's sea too)
				const h = this.habitatAtPoint( x, z, depth );
				let rich = 0;
				for ( const k in h ) rich += h[ k ];
				this._sonar = { depth, fish: Math.min( 1, rich / 1.4 ) };

			}

		}

	}

	// (M10) the hull (Hull.js): what she's felt, the water in and out of her, her engine; then her
	// thrust, revs and mass, the sounds, and the word when she stalls or is getting worn
	updateHull( dt ) {

		const app = this.app, b = app.boatCtl, s = this.state, hull = this.hull, c = b.contact, a = app.audio;
		// (her sounds, ready once you're aboard: the helm's first crank is the starter's)
		const p = app.player;
		if ( a && ! this._boatSounds && ( p.mode === 'deck' || p.mode === 'boat' ) ) {

			a.boatReady();
			this._boatSounds = true;

		}

		// ((M13) hauled out, she's out of it: no storm, no rain in her; left in the water, the storm works her)
		const ashore = !! b.hauled;
		hull.step( dt, {
			driven: b.driven, throttle: b.driven ? Math.abs( b.throttleTarget || 0 ) : 0, fuel: s.fuelL > 0, rain: ashore ? 0 : G.rain.value,
			storm: ashore || ! app.weather ? 0 : app.weather.windAt( b.position.x, b.position.z ),
			bailing: this._bailing, pumpLs: s.stats.pumpLs, pile: c.pile, ground: c.ground, slide: c.slide, aground: c.aground,
		} );
		c.pile = c.ground = c.slide = 0;
		c.aground = false;
		b.engineOn = hull.engine === 'running';
		b.cough = hull.cough;
		b.thrustMul = thrustMul( hull.wear );
		b.mass = this._massBase + hull.bilge;
		for ( const e of hull.drain() ) {

			if ( e.kind === 'crank' && a ) a.crank( e.catches );
			else if ( e.kind === 'knock' && a ) a.hullKnock( e.speed, e.ground );
			else if ( e.kind === 'scoop' && a ) a.bailScoop();
			// (a crank that doesn't catch says why when there's a reason: a dry tank, the water over the engine)
			else if ( e.kind === 'stall' || ( e.kind === 'failed' && ( e.why === 'fuel' || e.why === 'flooded' ) ) ) this.stallSaid( e.why );
			else if ( e.kind === 'caught' ) this._floodSaid = false;

		}

		if ( hull.wear - this._wearSaved >= WEAR_SAVE ) {

			s.save();
			this._wearSaved = hull.wear;

		}

		// getting worn: said at a tenth, and again at a half
		const said = hull.wear >= 0.5 ? 2 : hull.wear >= 0.1 ? 1 : 0;
		if ( said > this._wornSaid ) this.toast( said > 1 ? 'She\'s badly worn · slow, and leaking · Marta can repair the hull' : 'She\'s taking a beating · Marta can repair the hull', 4000 );
		this._wornSaid = Math.max( this._wornSaid, said );

	}

	stallSaid( why ) {

		const touch = this.app.input.lastDevice === 'touch';
		if ( why === 'fuel' ) {

			if ( ! this._fuelOut ) this.toast( 'Out of fuel · buy diesel at the chandlery by the boathouse', 4000 );
			this._fuelOut = true;

		} else if ( why === 'flooded' ) {

			if ( ! this._floodSaid ) this.toast( `The water's up to the engine · bail her out on deck${ touch ? '' : ` (hold ${ this.keyName( 'E' ) })` }`, 4200 );
			this._floodSaid = true;

		} else this.toast( `The engine's stalled · ${ touch ? 'push the stick ahead' : `open the throttle (${ this.keyName( 'W' ) })` } to crank her`, 3600 );

	}

	// (M10) on her deck with water in the bilge, the bucket: hold E (the rail's "Jump overboard" makes way
	// for it, Player.bailable; stepping ashore and the helm don't). At the helm, stalled, the throttle
	// cranks her: said beside leaving it
	updateBail( inp, p ) {

		const hull = this.hull;
		p.bailable = p.mode === 'deck' && ! p.riding && ! p.busy && hull.bilge > 0 && ( hull.bilge >= BAIL_FROM || this._bailing );
		if ( p.bailable && ! p.prompt ) {

			p.prompt = { key: 'E', text: `${ this._bailing ? 'Bailing' : 'Bail (hold)' }   ·   ${ gallons( hull.bilge ) } gal in the bilge` };
			this._bailing = inp.down( 'KeyE' );

		} else this._bailing = false;
		if ( p.mode === 'boat' && hull.engine === 'stalled' && p.prompt ) p.prompt = { key: p.prompt.key, text: `${ p.prompt.text }   ·   ${ this.keyName( 'W' ) }  crank her` };

	}

	// (M13) her cradle in her hauling yard: the village's (its height from the ground there), or where it is
	get cradle() {

		return ( this.app.village && this.app.village.cradle ) || CRADLE;

	}

	// (M13) Marta's haul-out ahead of a hurricane: once it's watched for or warned of and before she boards
	// up, with the boat at her dock, she lifts her out onto a cradle ashore for HAUL_FEE, and puts her back
	// in once it's gone (or when you ask). { fee, here } to haul her, { back } hauled (back: it's gone by), or
	// null
	haulJob() {

		const s = this.state, n = this.app.weather && this.app.weather.news;
		if ( s.hauled ) return { back: ! n };
		if ( ! n || n.stage === 'outlook' ) return null;
		return { fee: HAUL_FEE, here: !! this.app.boatCtl.moored };

	}

	haul() {

		const job = this.haulJob();
		if ( ! job || ! job.here || ! this.state.spend( job.fee ) ) return false;
		this.state.hauled = true;
		this.state.save();
		this.app.boatCtl.setHauled( this.cradle );
		this.toast( `Marta's hauled her out onto a cradle ashore · $${ job.fee } · she'll put her back in once it's gone by`, 4200 );
		return true;

	}

	relaunch( said = 'Marta\'s put your boat back in at the dock' ) {

		if ( ! this.state.hauled ) return;
		this.state.hauled = false;
		this.state.save();
		this.app.boatCtl.setHauled( null );
		this.toast( said, 3200 );

	}

	// (M13) what's said of a hurricane as it comes (a toast when it's watched for, warned of, and when its
	// winds arrive), and Marta putting your boat back in once it's gone (when she's at her stall)
	updateHurricane() {

		const app = this.app, n = app.weather && app.weather.news, s = app.settings;
		const T = islandTime( s.day, s.timeOfDay );
		const stage = n ? ( T >= n.onset ? 'here' : n.stage ) : null;
		if ( stage !== this._hurricaneSaid ) {

			const said = this._hurricaneSaid;
			this._hurricaneSaid = stage;
			// (not on a first look: only as it changes while you play)
			if ( said !== undefined && stage && stage !== 'outlook' ) {

				const news = wxNews( n, this.weatherNow, T, app.portal && app.portal.locale );
				this.toast( stage === 'here' ? `${ news } · the shelter's open` : stage === 'warning' ? `${ news } · Marta can haul your boat out before she boards up` : news, 5200 );
				if ( this.guide && stage !== 'watch' ) this.guide.tip( 'hurricane' );

			}

		}

		const marta = this.chandlery && this.chandlery.vendor;
		if ( this.state.hauled && ! n && marta && marta.open ) this.relaunch();

	}

	// (M10) Marta's repair of the hull: { fee, wear, here } (here: the boat's at her dock), or null with
	// nothing to repair; and the repair, as far as your money goes
	repairJob() {

		const fee = repairFee( this.hull.wear );
		// ((M13) or on her cradle ashore: hauled out, the best place to work on her)
		const b = this.app.boatCtl;
		return fee ? { fee, wear: this.hull.wear, here: !! ( b.moored || b.hauled ) } : null;

	}

	repair() {

		const job = this.repairJob();
		if ( ! job || ! job.here ) return 0;
		const paid = this.state.payRepair( job.fee );
		this._wearSaved = this.state.hull;
		this._wornSaid = this.state.hull >= 0.5 ? 2 : this.state.hull >= 0.1 ? 1 : 0;
		if ( paid ) this.toast( paid < job.fee ? `Marta did $${ paid } of the work · the hull's ${ Math.round( this.state.hull * 100 ) }% worn` : `Marta repaired the hull · $${ paid }` );
		return paid;

	}

	// (Salt Life) the deck floodlights, 0..1: fitted, and lit from dusk like every local light
	get floodsOn() {

		if ( ! this.state.stats.deckLights ) return 0;
		const t = Math.min( 1, Math.max( 0, ( G.night.value - 0.15 ) / 0.6 ) );
		return t * t * ( 3 - 2 * t );

	}

	// how far a spot is in their pool, 0..1: all of it within 5 m of the stern, none past their 14 m
	floodAt( x, z ) {

		const on = this.floodsOn, b = this.app.boatCtl;
		if ( on <= 0 || ! b ) return 0;
		const t = Math.min( 1, Math.max( 0, ( Math.hypot( x - b.sternWorld.x, z - b.sternWorld.z ) - 5 ) / 9 ) );
		return on * ( 1 - t * t * ( 3 - 2 * t ) );

	}

	// (Salt Life) the anchor (Gear anchor): up when you take the helm; down when you leave it out on the
	// water, once the boat has slowed (took / left: the helm, this frame). Its rode follows the boat
	updateAnchor( took, left ) {

		const b = this.app.boatCtl;
		if ( took ) {

			this._anchorDue = false;
			if ( b.anchor ) {

				b.anchor = null;
				this.toast( 'Anchor up', 1600 );

			}

		} else if ( left ) this._anchorDue = this.state.stats.anchorM > 0 && ! b.anchor;
		if ( this._anchorDue && ! b.driven && b.speed < ANCHOR_SPEED ) {

			this._anchorDue = false;
			this.dropAnchor();

		}

		const rode = this.rode;
		rode.visible = !! b.anchor;
		if ( ! b.anchor ) return;
		// it comes down from the stem head and lies along the bottom to the anchor
		const u = rode.material.uniforms, a = b.anchor;
		b.toWorld( b.stemHead, u.lineA.value );
		u.lineB.value.copy( a );
		u.lineCtl.value.copy( u.lineA.value ).lerp( a, 0.8 ).y = a.y;

	}

	// where the boat is, unless the dock lines have her or it's deeper than the rode holds in
	dropAnchor() {

		const b = this.app.boatCtl, max = this.state.stats.anchorM, dock = WORLD.boatDock.position;
		if ( b.moored || Math.hypot( b.position.x - dock.x, b.position.z - dock.z ) < BERTH_M ) return;
		const at = b.toWorld( b.stemHead, new Vector3() );
		const floor = this.app.terrainData.heightAt( at.x, at.z );
		const depth = Math.max( 0, G.seaLevel.value - floor );
		if ( depth > max ) {

			this.toast( `Too deep to anchor · ${ feet( depth ) } of water, the rode holds in ${ feet( max ) }`, 3200 );
			return;

		}

		b.anchor = at.setY( floor );
		this.toast( `Anchor down in ${ feet( depth ) } of water`, 2200 );

	}

	updateVendors( inp, p ) {

		const hud = this.hud;
		// (Salt Life) the traders keep hours: out of them they've gone home, and their stall offers what it
		// does without them (Joe's night box, diesel on Marta's honesty box). Whoever is serving you when
		// it's time finishes with you first. (M9) In a gale or a thunderstorm they shut whatever the hour
		// (Orders.shutFor), and their boards say so
		// ((M13) and they board up ahead of a hurricane, from a while before its winds to a while after)
		const wx = this.weatherNow, boarded = !! ( wx && wx.boarded ), shut = shutFor( wx && wx.id ) || boarded;
		for ( const v of this.vendors ) {

			v.setOpen( ( stallOpen( v.hours, this.hour, wx && wx.id ) && ! boarded ) || ( v.open && !! hud && hud.standOpen && hud.vendor === v ) );
			v.weatherShut = shut && ! v.open;
			v.boarded = boarded && ! v.open; // ((M13) boarded up for a hurricane)

		}

		for ( const s of this.signs ) s.forWeather( shut );
		if ( this.boards ) this.boards.visible = boarded;
		let near = null;
		if ( p.mode === 'walk' ) for ( const v of this.vendors ) if ( v.inRange( p.position ) ) near = v;
		for ( const v of this.vendors ) v.talking = !! ( hud && hud.standOpen && hud.vendor === v );
		if ( hud && hud.standOpen && ( ! near || near !== hud.vendor ) ) hud.closeStand();
		if ( ! near || this.fight || this._cardDismissed || ( hud && hud.catchOpen ) ) return;
		if ( ! p.prompt ) p.prompt = { key: 'E', text: hud && hud.standOpen ? 'Leave' : this.vendorPrompt( near ) };
		if ( inp.hit( 'KeyE' ) ) {

			if ( ! hud ) {

				if ( near.kind === 'buyer' ) this.sellAll( near ); // headless: straight sale

			} else if ( hud.standOpen ) hud.closeStand();
			else hud.openStand( near );

		}

	}

	// (M15) beachcombing (Beachcomb.js): what's on the sand today (the last few days' finds you haven't picked
	// up), drawn by the app's Beachcombing; walking by one, E picks it up
	updateBeachcomb( inp, p ) {

		const app = this.app, B = app.beachcomb, s = this.state, hud = this.hud;
		if ( ! B ) return;
		// (what you've picked up's pruned as you pick more: so its last, not its length)
		const day = app.settings.day, key = `${ day }:${ s.picked.length }:${ s.picked[ s.picked.length - 1 ] || '' }`;
		if ( key !== this._combKey ) {

			this._combKey = key;
			const picked = new Set( s.picked );
			B.set( lying( day, ( d ) => app.beachDays( d ) ).filter( ( f ) => ! picked.has( f.id ) ) );

		}

		if ( hud && hud.noteOpen ) {

			if ( inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) ) hud.closeNote();
			return;

		}

		if ( p.mode !== 'walk' || p.prompt || this.fight || ( hud && ( hud.standOpen || hud.invOpen || hud.catchOpen ) ) ) return;
		const f = B.nearest( p.position.x, p.position.z, 1.4 );
		if ( ! f ) return;
		const name = FINDS[ f.kind ].name;
		p.prompt = { key: 'E', text: `Pick up ${ /^[AEIOU]/.test( name ) ? 'an' : 'a' } ${ name.toLowerCase() }` };
		if ( inp.hit( 'KeyE' ) ) this.pickFind( f );

	}

	pickFind( f ) {

		if ( ! this.state.pickFind( f ) ) return false;
		const F = FINDS[ f.kind ];
		if ( f.kind === 'bottle' && this.hud ) this.hud.showNote( messageOf( f.seed ) );
		else this.toast( `${ F.name }: ${ F.what }${ F.who ? ` · ${ F.who === 'joe' ? 'Joe' : 'Marta' } buys these` : '' }` );
		return true;

	}

	// (M15) your finds sold to `who` ('marta' | 'joe'): these, or all they buy
	sellFinds( who, ids = null ) {

		const r = this.state.sellFinds( who, ids );
		if ( r.count ) {

			this.toast( `Sold ${ r.count === 1 ? 'it' : `${ r.count } finds` } for $${ r.total }` );
			if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();

		}

		if ( this.hud && this.hud.standOpen ) {

			if ( who === 'marta' ) this.hud.renderShop();
			else this.hud.renderStand();

		}

		return r;

	}

	// what E does at a stall: talk to them, or (they've gone home) what's left out
	vendorPrompt( v ) {

		const name = v.name.split( ' ·' )[ 0 ];
		if ( v.open ) return `Talk to ${ name }`;
		// (M9) or gone home for the weather
		const back = v.boarded ? 'boarded up for the hurricane' : v.weatherShut ? 'shut for the weather' : `back at ${ timeText( v.hours[ 0 ], this.app.portal && this.app.portal.locale, 60 ) }`;
		return v.kind === 'shop' ? `Diesel on the honesty box   ·   ${ name }'s ${ back }` : `${ name }'s night box   ·   he's ${ back }`;

	}

	// (Salt Life) a new wanted list each morning, when Joe opens (Orders.tradeDay)
	updateDay() {

		const s = this.app.settings;
		const day = tradeDay( s.timeOfDay, s.day );
		if ( day === this.tradeDay ) return;
		this.tradeDay = day;
		this.orders = ordersFor( day );
		this.drawWanted();
		if ( this.hud ) this.hud.refresh();

	}

	// (M9) Joe's forecast slate: the weather now and what's coming, looked at every second or so (it's
	// drawn again only when what it says changes)
	updateForecast( dt ) {

		const wx = this.weatherNow;
		this._forecastT -= dt;
		if ( this._forecastT > 0 || ! wx ) return;
		this._forecastT = 1;
		const s = this.app.settings, pick = this.app.weatherPick ? this.app.weatherPick() : null;
		this.forecastSlate.draw( wx, forecast( islandTime( s.day, s.timeOfDay ), 12, pick, s.weatherSince ), this.app.portal && this.app.portal.locale, this.app.weather ? this.app.weather.news : null );
		// ((M13) and the shelter's tracking chart)
		if ( this.stormChart ) this.stormChart.draw( this.app.weather.hurricane, this.app.weather.news, islandTime( s.day, s.timeOfDay ), this.app.portal && this.app.portal.locale );

	}

	drawWanted() {

		const o = this.state.orders, t = this.week();
		this.wanted.draw( this.orders, o.day === this.tradeDay ? o.filled : {}, t && { species: t.species, kg: t.kg, got: delivered( t ), ends: weekEnds( t.week ) } );

	}

	// (Salt Life) the week's order: the group's tally this week (null: not playing with a group's save)
	week() {

		return this.app.together ? this.app.together.week() : null;

	}

	// as the group's tally changes or the week turns: the slate, the panels, and Joe paying your share
	// if you're at his stall
	updateWeek() {

		const t = this.week(), now = Date.now();
		// (the slate's days left, now and then)
		if ( now - ( this._weekDrawn || 0 ) > 60000 ) {

			this._weekDrawn = now;
			this.drawWanted();

		}

		if ( t === this._weekSeen ) return;
		this._weekSeen = t;
		this.drawWanted();
		if ( this.hud && this.hud.standOpen && this.hud.vendor === this.stand.vendor ) this.collectWeek();
		if ( this.hud ) this.hud.refresh();

	}

	// what the week's order still wants ({ species, left: kg }), or null once it's filled
	weekTerms() {

		const t = this.week();
		return t && ! filled( t ) ? { species: t.species, left: t.kg - delivered( t ) } : null;

	}

	// Joe pays your share of a filled week's order when he's in (WeekOrder.owed) -> $ paid
	collectWeek() {

		const t = this.week(), v = this.stand.vendor;
		if ( ! t || ! v || ! v.open ) return 0;
		const o = owed( t, this.app.together.me.id, this.state.weekPaid ?? - Infinity );
		if ( o.total <= 0 ) return 0;
		this.paidNote = o.total;
		this.state.collect( o.total, o.week );
		if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
		return o.total;

	}

	// what selling to `vendor` is on (GameState.quote): Joe's price, his wanted list and the week's order;
	// his night box when he's gone home (less, but the orders in full); Marta: only the bait she's after
	saleTerms( vendor ) {

		const who = vendor && vendor.kind === 'shop' ? 'marta' : 'joe';
		return { who, orders: this.orders, day: this.tradeDay, rate: who === 'joe' && vendor && ! vendor.open ? NIGHT_BOX : 1, week: who === 'joe' ? this.weekTerms() : null };

	}

	sellAll( vendor = this.hud && this.hud.vendor ) {

		const r = this.state.sell( null, this.saleTerms( vendor ) );
		this.sold( r, vendor );
		if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
		return r;

	}

	sell( ids, vendor = this.hud && this.hud.vendor ) {

		const r = this.state.sell( ids, this.saleTerms( vendor ) );
		this.sold( r, vendor );
		return r;

	}

	// the sale's line; what went toward the week's order, to the group's tally
	sold( r, vendor ) {

		if ( r.count ) this.toast( saleText( r, vendor ) );
		if ( r.week > 0 && this.app.together ) this.app.together.deliver( r.week );

	}

	// ---- bites
	habitat() {

		const p = this.rod.bobber;
		const h = this.habitatAtPoint( p.x, p.z, this.rod.depth );
		// (Salt Life) in the deck floodlights' pool after dark (Bites: what gathers under lights)
		h.flood = this.floodAt( p.x, p.z );
		// (M9) and the weather (Bites.weatherMood: what the fish feel of it); ((M15) and which side of the
		// island it's on, for which sea roughs its water)
		h.weather = this.weatherNow;
		h.side = this.windwardAt( p.x, p.z );
		h.big = this.windReefAt( p.x, p.z );
		return h;

	}

	// (M15) the place ( x, z ) is (Places.js), from its water
	placeAt( x, z ) {

		const T = this.app.terrainData, h = this.habitatAtPoint( x, z, Math.max( 0, G.seaLevel.value - T.heightAt( x, z ) ) );
		h.side = this.windwardAt( x, z );
		h.big = this.windReefAt( x, z );
		return placeOf( h, x, z );

	}

	// (M15) how much ( x, z ) is on the windward reef off the north-west point (0..1: its platform, TerrainData's)
	windReefAt( x, z ) {

		const m = northReefMask( x, z ), t = Math.min( 1, Math.max( 0, ( m - 0.15 ) / 0.35 ) );
		return t * t * ( 3 - 2 * t );

	}

	// (M15) how much ( x, z ) is on the island's windward side, its north shore (0..1): out past its coast
	// on the side facing up the trades from the island's middle (the north beach all of it, the bay none,
	// the west and the east coasts little)
	windwardAt( x, z ) {

		const dx = x - ISLE.x, dz = z - ISLE.z, d = Math.max( Math.hypot( dx, dz ), 1 );
		const k = ( a, b, v ) => {

			const t = Math.min( 1, Math.max( 0, ( v - a ) / ( b - a ) ) );
			return t * t * ( 3 - 2 * t );

		};
		return k( 0.05, 0.5, ( dx * UPWIND.x + dz * UPWIND.z ) / d ) * k( 150, 400, d );

	}

	// (M15) the sand under ( x, z ), 0..1 (the island's 1 m sand cover, less its rock: the beaches, the bay's
	// floor, the flats; once those masks are let go, the 4 m one App keeps of them: T.beach); none past the
	// island's map
	sandAt( x, z ) {

		const T = this.app.terrainData, B = T.sand ? null : T.beach;
		if ( ! T.sand && ! B ) return 0;
		const res = B ? B.res : T.res, texel = B ? B.texel : T.texel;
		const i = Math.floor( ( x - T.origin ) / texel ), j = Math.floor( ( z - T.origin ) / texel );
		if ( i < 0 || j < 0 || i >= res || j >= res ) return 0;
		const k = j * res + i;
		return B ? B.data[ k ] / 255 : T.sand[ k ] / 255 * ( 1 - T.rock[ k ] );

	}

	habitatAtPoint( x, z, depth ) {

		const b = { x, z };
		const reef = WORLD.reef;
		const reefDist = Math.hypot( b.x - reef.center.x, b.z - reef.center.z ) - reef.radius;
		const P = this._pier;
		const rect = ( x0, x1, z0, z1 ) => Math.hypot( Math.max( x0 - b.x, 0, b.x - x1 ), Math.max( z0 - b.z, 0, b.z - z1 ) );
		const walk = rect( P.x - P.width / 2, P.x + P.width / 2, P.zStart, P.zEnd );
		const head = rect( P.x - P.headWidth / 2, P.x + P.headWidth / 2, P.zEnd - P.headDepth, P.zEnd );
		// ((M15) out past the island: how steeply the bottom falls away there, across the offshore map's 32 m
		// texels; the bank's patch reefs, on its top, the only water that shallow that far out; and what's
		// found out there)
		const T = this.app.terrainData, e = 32;
		const slope = depth > 30 ? Math.hypot( T.heightAt( x + e, z ) - T.heightAt( x - e, z ), T.heightAt( x, z + e ) - T.heightAt( x, z - e ) ) / ( 2 * e ) : 0;
		const B = SEABED.bank;
		const patch = depth < 34 && Math.hypot( x - B.x, z - B.z ) < B.a + 1500 ? 0.8 * Math.min( 1, ( 34 - depth ) / 10 ) : 0;
		const f = this.findsNear( x, z );
		// ((M15) and the wash's: the sand, on which side; and the mangroves' creek, their pool and their edge)
		const beach = depth < 5 ? this.sandAt( x, z ) : 0, windward = beach > 0 ? this.windwardAt( x, z ) : 0;
		const mg = depth < 6 ? mangroveAt( x, z ) : null, creek = mg ? Math.max( mg.creek, mg.fringe ) : 0;
		return habitatAt( { depth, reefDist, pierDist: Math.min( walk, head ), slope, patch, weed: f.weed, debris: f.debris, birds: f.birds, beach, windward, creek, windReef: this.windReefAt( x, z ) } );

	}

	// (M15) how near ( x, z ) is to what's found out there (App.finds, game/Finds.js), each 0..1 by its life:
	// a weedline (within a few m of its edge, fading by 45 m out), a piece of floating debris (the fish about
	// it, by 60 m) and a school being worked (inside it, fading by 80 m out)
	findsNear( x, z ) {

		const out = this._near || ( this._near = { weed: 0, debris: 0, birds: 0 } ), f = this.app.finds;
		out.weed = out.debris = out.birds = 0;
		if ( ! f ) return out;
		const fade = ( a, b, d ) => {

			const t = Math.min( 1, Math.max( 0, ( d - a ) / ( b - a ) ) );
			return 1 - t * t * ( 3 - 2 * t );

		};
		for ( const w of f.weed ) {

			const ex = w.x1 - w.x0, ez = w.z1 - w.z0, t = Math.min( 1, Math.max( 0, ( ( x - w.x0 ) * ex + ( z - w.z0 ) * ez ) / Math.max( ex * ex + ez * ez, 1e-6 ) ) );
			const d = Math.hypot( x - w.x0 - ex * t, z - w.z0 - ez * t ) - w.width / 2;
			out.weed = Math.max( out.weed, w.life * fade( 3, 45, d ) );

		}

		for ( const q of f.debris ) out.debris = Math.max( out.debris, q.life * fade( 8, 60, Math.hypot( x - q.x, z - q.z ) - q.size / 2 ) );
		for ( const q of f.bait ) out.birds = Math.max( out.birds, q.life * fade( 0, 80, Math.hypot( x - q.x, z - q.z ) - q.r ) );
		return out;

	}

	get hour() {

		return this.app.settings.timeOfDay;

	}

	// (M9) the weather now (game/Weather.js): the day's, or what you chose on your own, as the weather
	// driver works it out each frame (WeatherDriver.target); null before its first frame
	get weatherNow() {

		const w = this.app.weather;
		return ( w && w.target ) || null;

	}

	onBobberLanded( where ) {

		if ( where !== 'water' ) {

			this.toast( 'Landed on the sand', 1400 );
			return;

		}

		this.bite = { phase: 'wait', t: biteDelay( this.habitat(), this.hour, Math.random, this.hookBait ) };

	}

	updateBite( dt ) {

		const rod = this.rod;
		const b = this.bite;
		if ( ! b ) return;
		b.t -= dt;
		// bobber motion for the cues
		if ( b.phase === 'nibble' ) rod.dip = Math.max( 0, Math.sin( Math.min( 1, ( b.pulse || 0 ) ) * Math.PI ) * 0.45 );
		else if ( b.phase === 'take' ) rod.dip += ( 1.4 - rod.dip ) * ( 1 - Math.exp( - dt * 14 ) );
		else rod.dip = Math.max( 0, rod.dip - dt * 3 );
		if ( b.phase === 'nibble' ) b.pulse = ( b.pulse || 0 ) + dt * 3.2;

		if ( b.t > 0 ) return;
		if ( b.phase === 'wait' ) {

			const h = this.habitat();
			const species = pickSpecies( h, this.hour, Math.random, this.hookBait );
			if ( ! species ) {

				b.t = 8;
				return;

			}

			b.species = species;
			b.kg = rollWeight( species, Math.random, this.hookBait, h.weather, h.big );
			b.place = placeOf( h, this.rod.bobber.x, this.rod.bobber.z ); // ((M15) where it bit: Places.js)
			b.phase = 'nibble';
			b.nibbles = 1 + Math.floor( Math.random() * 3 );
			b.t = 0.7 + Math.random() * 0.8;
			b.pulse = 0;

		} else if ( b.phase === 'nibble' ) {

			b.nibbles --;
			b.pulse = 0;
			// (Salt Life) a nibble can pick the bait clean off the hook
			const bait = BAITS[ this.hookBait ];
			if ( bait && Math.random() < bait.steal ) {

				this.hookBait = null;
				this.toast( 'Something picked the bait clean off the hook · shrimp until you cast again', 2400 );
				this.bite = { phase: 'wait', t: biteDelay( this.habitat(), this.hour ) };
				return;

			}

			if ( b.nibbles > 0 ) b.t = 0.6 + Math.random() * 1.0;
			else {

				b.phase = 'take';
				// big, strong fish give a (slightly) shorter window
				b.t = 2.4 - FISH[ b.species ].fight * 0.5;
				if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( rod.bobber, 0.35 );

			}

		} else if ( b.phase === 'take' ) {

			this.toast( this.hookBait ? `It ran off with your ${ BAITS[ this.hookBait ].name.toLowerCase() }` : 'It took the bait and ran', 1800 );
			this.hookBait = null;
			this.bite = { phase: 'wait', t: biteDelay( this.habitat(), this.hour ) };

		}

	}

	strike() {

		const b = this.bite;
		if ( ! b || b.phase === 'wait' || b.phase === 'nibble' ) {

			// too early: a nibbling fish isn't hooked yet; it keeps nibbling (a hint, no penalty)
			if ( b && b.phase === 'nibble' ) this.toast( 'Not yet · wait for it to pull under', 1500 );
			return;

		}

		const g = this.state.stats;
		// (M10: in a blow, the wind gusting on the line)
		// (the line out: no more than the rod casts and a fish could have taken, whatever's gone wrong)
		const out = Math.min( Math.max( 3, this.rod.lineOut ), this.rod.castM * 1.5 + 10 );
		this.fight = new CatchMinigame( { species: b.species, kg: b.kg, lineKg: g.lineKg, reelSpeed: g.reelSpeed, distance: Number.isFinite( out ) ? out : 3, wind: blowShare( G.windSpeed.value ) } );
		this.fight.place = b.place;
		this.bite = null;
		this.rod.hook();
		this.toast( 'Fish on!', 1200 );

	}

	updateFight( dt, reeling ) {

		const f = this.fight;
		const st = f.update( dt, reeling );
		// the fish thrashes at the surface as each run starts
		const au = this.app.audio;
		if ( f.surge > 0.6 && ! f._splashed && au && au.fishSplash ) au.fishSplash( this.rod.bobber, 0.3 + 0.5 * Math.min( 1, f.kg / 8 ) );
		f._splashed = f.surge > 0.6 ? true : f.surge < 0.3 ? false : f._splashed;
		if ( st === 'fighting' ) {

			// (Salt Life) a goliath under the pier or a shark off the drop-off may take a smaller fish
			// off the hook (a little under the bobber, where it's fighting)
			const b = this.rod.bobber;
			const thief = f.kg < THIEF_KG ? this.thief( f, dt, b.x, b.y - 1.2, b.z, 'reel it in fast!' ) : null;
			if ( ! thief ) return;
			this.fight = null;
			this.rod.dip = 0;
			this.toast( `${ upper( thief ) } took your fish off the hook`, 2800 );
			if ( au && au.lineSnap ) au.lineSnap();
			this.rod.snap(); // ((M14) and your float and hook with it: a new one to tie on)
			return;

		}

		this.calmThief( f );
		this.fight = null;
		this.rod.dip = 0;
		this.hookBait = null; // (Salt Life) taken with the fish, or with the hook
		const name = FISH[ f.species ].name;
		if ( st === 'caught' ) {

			const entry = this.state.addFish( f.species, f.kg, this.hour, { day: this.tradeDay, place: f.place } );
			const info = this.state.lastCatch;
			info.wanted = entry ? this.wantedFor( entry ) : null; // (Salt Life) on today's wanted list
			// ((M15) let go where Marta's tag-and-release ask wants one: paid there and then)
			const tag = info.released && tagFor( this.orders, f.species, f.place );
			info.tagged = tag ? this.state.tag( tag, this.tradeDay ) : 0;
			// (Salt Life) the others hear of it; the island's records (together/): the card says when
			// it's the heaviest of its kind anyone here has landed
			if ( this.app.together ) {

				const isle = this.app.together.caught( f.species, f.kg, info.cm, 'rod', info.place );
				info.islandRecord = isle.island;
				info.islandHeld = isle.held || null;
				info.placeRecord = isle.place ? info.place : null; // ((M15) the heaviest anyone's had there)

			}
			if ( au && au.fishSplash ) au.fishSplash( this.rod.bobber, 0.8 );
			if ( au && au.fishFlop ) au.fishFlop();
			// the catch card (with a HUD) while the fish hangs on the line; a toast otherwise
			if ( this.hud ) this.landing = { species: f.species, kg: f.kg, card: info, cardT: 0 };
			else {

				if ( entry ) this.toast( `${ info.record ? 'New record! ' : '' }${ name } · ${ lb( entry.kg ) } · $${ entry.value }`, 3600 );
				else this.toast( `${ name } · ${ lb( f.kg, 1 ) } · no room in the ${ this.state.upgrades.hold > 0 ? 'hold' : 'cooler' }, let it go`, 3600 );
				this.landing = { species: f.species, kg: f.kg };

			}

			this.rod.land();

		} else if ( st === 'snapped' ) {

			this.toast( 'Snap! The line broke · tying on a new hook', 2800 );
			if ( au && au.lineSnap ) au.lineSnap();
			// ((M14) the float and the broken line left drifting, a new hook and float to tie on)
			this.rod.snap();

		} else {

			this.toast( 'It threw the hook', 2000 );
			this.rod.endFight();

		}

	}

	// the catch card up for `t` s (info: its GameState.lastCatch): whether it's done with ('go': in the cooler
	// or let go, as it says; 'keep': kept after all), or null. (M15) One with no room for its fish waits, with
	// no timer and no tap away, while you let fish go from the cooler to make room for it (the card's own
	// buttons; ← → or the d-pad to pick one, R or X to let it go): kept once it fits (its button, Enter, RT
	// or F), or let go (its button, E, B or Esc)
	cardEnd( info, t, lDown ) {

		const inp = this.app.input, hud = this.hud, R = hud.room;
		if ( ! R ) return lDown || inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) || hud.takeCatchTap() || t > CATCH_CARD_MS / 1000 ? 'go' : null;
		if ( inp.hit( 'ArrowLeft' ) || inp.hit( 'ArrowRight' ) ) hud.roomStep( inp.hit( 'ArrowRight' ) ? 1 : - 1 );
		if ( inp.hit( 'KeyR' ) ) hud.roomLetGo();
		let act = hud.takeCatchAct();
		if ( ! act && R.fits && ( lDown || inp.hit( 'Enter' ) || inp.hit( 'NumpadEnter' ) ) ) act = 'keep';
		if ( ! act && ( inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) ) ) act = 'go';
		if ( act === 'keep' ) {

			const entry = this.state.keepLast( info );
			if ( ! entry ) return null;
			info.wanted = this.wantedFor( entry );
			this.toast( `${ FISH[ entry.species ].name } · ${ lb( entry.kg ) } · $${ entry.value } · in the ${ this.state.upgrades.hold > 0 ? 'hold' : 'cooler' }`, 2600 );

		}

		return act;

	}

	// whether the catch card is making room for its fish (it has the keys: Game.cardEnd)
	get makingRoom() {

		return !! ( this.hud && this.hud.room );

	}

	// the landed fish goes in the cooler: card, fish and line away
	endLanding() {

		this.landing = null;
		this.display.hide();
		if ( this.hud && this.hud.catchOpen ) this.hud.hideCatch();
		if ( this.rod.state === 'landing' ) this.rod.setState( 'idle' );

	}

	// ---- (Salt Life) the cast net

	// N: out (the rod goes away for it), or away
	// whether the keys are free of the panels: the cooler or a stall, the clock's menu, the guide ((M14) the
	// radar's range, at the helm, takes the arrows as the bait does)
	quietKeys() {

		const panelOpen = this.hud && ( this.hud.invOpen || this.hud.standOpen );
		return ! panelOpen && ! this.makingRoom && ! ( this.time && this.time.open ) && ! ( this.guide && this.guide.open );

	}

	toggleNet() {

		const net = this.net;
		if ( net.equipped ) {

			this.dropNet();
			this.toast( 'Cast net away', 1400 );
			return;

		}

		if ( this.rod.equipped ) this.stowRod();
		net.equip( true );
		const how = { touch: 'hold Throw, let go as the ring brightens', gamepad: 'hold RT, let go as the ring brightens' }[ this.app.input.lastDevice ] || 'hold left mouse or F, let go as the ring brightens';
		this.toast( `Cast net out · ${ how }`, 2400 );

	}

	// the rod away: the line in, a live bait on its hook back in the bucket
	stowRod() {

		this.cancelLine( true );
		if ( this.hookBait ) this.state.returnBait( this.hookBait );
		this.hookBait = null;
		this.rod.equip( false );

	}

	// the net away at once (swimming, at the helm, the free camera): whatever's in it goes back
	dropNet() {

		this.letNetGo();
		this.net.equip( false );

	}

	// the fish inside the net let go where they are (those in its purse too)
	letNetGo() {

		const fish = this.app.fish;
		this.netIn = 0;
		if ( ! fish || ! fish.net ) return;
		_a.set( 0, 0, 0 );
		for ( const i of fish.netFish() ) if ( fish.held[ i ] ) fish.netRelease( i, fish.pos[ i * 3 ], fish.pos[ i * 3 + 1 ], fish.pos[ i * 3 + 2 ], _a );
		fish.netEnd();

	}

	updateNet( dt, { lmb, lDown, lUp, panelOpen, visible } ) {

		const app = this.app, net = this.net, fish = app.fish, p = app.player;
		if ( net.equipped ) {

			if ( panelOpen ) net.cancelWindup();
			else if ( net.state === 'held' && lDown ) net.startWindup();
			else if ( net.state === 'windup' && lUp ) net.release();
			net.setPull( lmb );

		}

		this._netGround = this._netGround || ( ( x, z, maxY ) => p.groundAt( x, z, maxY ) );
		net.update( dt, { visible, groundAt: this._netGround } );
		for ( const e of net.takeEvents() || [] ) {

			// on the water: what's under it is in it now (Fish.netLand); on the sand or a deck, nothing is
			if ( e === 'throw' && this.app.together ) this.app.together.netThrow( net.lastThrow );
			else if ( e === 'splash' && fish ) this.netIn = fish.netLand( net.footprint, net.gear, net.waterY );
			else if ( e === 'land' ) this.say( 'It came down on dry ground · draw it back in' );
			else if ( e === 'dump' ) this.resolveHaul();

		}

		if ( ! fish || ! fish.net ) return;
		// in the water the fish race the lead line to the bottom; drawn closed, they're in the purse
		if ( net.state === 'sinking' ) this.netIn = fish.netStep( net.footprint, dt );
		if ( ( net.state === 'sinking' && net.draw >= BAG_FROM ) || net.state === 'lifted' || ( net.state === 'dumping' && ! net.dumped ) ) this.holdBag( dt );
		// (it never came up: put away, or loaded again at once)
		if ( ! net.busy ) this.letNetGo();

	}

	// the fish in the purse, where it has them: kicking, shifting about as it swings (eased in from
	// where the netting closed round them)
	holdBag( dt ) {

		const fish = this.app.fish, net = this.net, list = fish.netFish(), n = list.length, t = fish.time;
		const k = 1 - Math.exp( - dt * 10 );
		let kg = 0;
		for ( let j = 0; j < n; j ++ ) {

			const i = list[ j ], i3 = i * 3, L = fish.size[ i ];
			net.bagPoint( j, n, _b );
			_b.lerpVectors( _a.set( fish.pos[ i3 ], fish.pos[ i3 + 1 ], fish.pos[ i3 + 2 ] ), _b, k );
			_h.set( Math.cos( t * 1.3 + i ), Math.sin( t * 2.1 + i * 0.7 ) * 0.5, Math.sin( t * 1.3 + i ) ).normalize();
			fish.hold( i, _b.x, _b.y, _b.z, _h, Math.sin( t * 3 + i ) * 0.9, net.bag.out ? 1 : 0.6 );
			kg += 11 * L * L * L;

		}

		net.load = kg;

	}

	// the purse emptied: each fish into the bait bucket or the cooler (GameState.addHaul), or out and back
	// into the water toward where it was thrown; the haul card says what came up
	resolveHaul() {

		const fish = this.app.fish, net = this.net, b = net.bag, au = this.app.audio;
		const list = fish && fish.net ? fish.netFish() : [];
		const caught = list.map( ( i ) => {

			const { sp, L } = fish.about( i );
			const id = sp.fish && FISH[ sp.fish ] ? sp.fish : null;
			const cm = Math.round( L * 100 );
			return { i, species: id, label: id ? FISH[ id ].name : sp.label, cm, kg: id ? fishWeightKg( id, cm ) : 0 };

		} );
		const r = this.state.addHaul( caught, this.hour, this.placeAt( net.footprint.x, net.footprint.z ), this.tradeDay );
		const to = net.lastThrow;
		_b.set( to ? to.x - b.x : 0, 0, to ? to.z - b.z : 1 );
		if ( _b.lengthSq() < 1e-6 ) _b.set( 0, 0, 1 );
		_b.normalize();
		for ( const f of caught ) {

			if ( f.kept ) fish.take( f.i );
			else fish.netRelease( f.i, b.x + ( Math.random() - 0.5 ) * 0.2, b.y, b.z + ( Math.random() - 0.5 ) * 0.2, _a.set( _b.x * ( 1.6 + Math.random() ) + ( Math.random() - 0.5 ), 1 + Math.random() * 0.8, _b.z * ( 1.6 + Math.random() ) + ( Math.random() - 0.5 ) ) );

		}

		const out = fish && fish.net ? fish.net.out : null;
		if ( fish ) fish.netEnd();
		this.netIn = 0;
		// a mullet for the cooler counts toward the island's records, and the others hear of it
		if ( this.app.together ) for ( const e of r.cooler ) this.app.together.caught( e.species, e.kg, e.cm, 'net', e.place );
		if ( caught.length && au && au.fishFlop ) au.fishFlop();
		this.lastHaul = { r, n: caught.length, out };
		if ( this.hud ) this.hud.showHaul( r, caught.length, out );
		else this.toast( caught.length ? `The net came up with ${ caught.length } fish` : 'Nothing in the net', 2400 );

	}

	netPrompt() {

		const net = this.net, a = net.aim, fp = net.footprint;
		switch ( net.state ) {

			case 'held':
				if ( a.show && a.land ) return { key: 'LMB', text: 'That\'s dry ground · put the ring on the water' };
				if ( ! net.aimReaches ) return { key: 'LMB', text: 'Too deep for the hand line · it\'ll close before it reaches the bottom   ·   hold to throw anyway' };
				return { key: 'LMB', text: `Hold to wind up, let go as the ring brightens   ·   ${ this.keyName( 'N' ) }  put it away` };
			case 'windup': {

				const [ lo, hi ] = sweetWindow( net.gear.spreadWin );
				if ( net.charge < lo ) return { key: 'LMB', text: 'Swing it back… let go as the ring brightens' };
				if ( net.charge <= hi ) return { key: 'LMB', text: 'Now! Let go' };
				return { key: 'LMB', text: net.over > 0.6 ? 'Your arms are tiring · let go' : 'Past the moment · let go' };

			}

			case 'sinking':
				if ( ! fp.wet ) return { key: 'LMB', text: 'Hold to draw it back in' };
				if ( net.draw >= 1 ) return { key: 'LMB', text: this.netIn ? 'Hold to haul in · something\'s kicking in it' : 'Hold to haul it in' };
				if ( net.pulling ) return { key: 'LMB', text: 'Drawing the brails · the lead line closes under it' };
				if ( ! net.bottomed ) return { key: 'LMB', text: this.netIn ? 'Fish under it! Let it sink, then hold to close it' : 'Let it sink…  hold to draw it in' };
				return { key: 'LMB', text: this.netIn ? 'Fish under it! Hold to close it and haul in' : 'On the bottom · hold to close it and haul in' };
			default: return null;

		}

	}

	// a key as the device in use calls it, in the prompts' text
	keyName( k ) {

		return this.app.input.lastDevice === 'gamepad' ? { N: 'D-pad ↑', B: 'D-pad ← →', R: 'X', E: 'B', W: 'Stick ↑' }[ k ] || k : k;

	}

	// ---- (Salt Life) bait on the hook (Bait.js)

	// the next (step 1) or previous kind in the bucket, for the next cast (the frozen shrimp among them)
	cycleBait( step = 1 ) {

		const s = this.state;
		const kinds = [ null, ...BAIT_IDS.filter( ( k ) => s.bait[ k ] > 0 ) ];
		if ( kinds.length === 1 ) {

			this.say( `Only shrimp · throw the cast net (${ this.keyName( 'N' ) }) for live bait` );
			return;

		}

		const i = Math.max( 0, kinds.indexOf( s.baitPick ) );
		const next = kinds[ ( i + step + kinds.length ) % kinds.length ];
		s.pickBait( next );
		const what = next ? `${ BAITS[ next ].name } · ${ s.bait[ next ] } in the bucket` : 'Frozen shrimp';
		this.toast( `${ this.rod.lineInWater ? 'Next cast' : 'Bait' }: ${ what }`, 1800 );

	}

	// the line's cast: the hook baited with your pick (one from the bucket), unless it already is. A
	// live one left on the hook from the last cast goes back in the bucket for another pick
	baitHook() {

		const s = this.state, want = s.baitPick;
		if ( this.hookBait === want ) return;
		if ( this.hookBait ) s.returnBait( this.hookBait );
		this.hookBait = null;
		if ( ! want ) return;
		if ( s.takeBait( want ) ) this.hookBait = want;
		else {

			s.pickBait( null );
			this.say( `Out of ${ BAITS[ want ].short } · back to shrimp` );

		}

	}

	// the HUD's bait chip with the rod out
	baitChip() {

		const s = this.state, k = s.baitPick;
		return BAITS[ k ] ? { label: 'Bait', text: `${ BAITS[ k ].name } ×${ ( s.bait[ k ] | 0 ) + ( this.hookBait === k ? 1 : 0 ) }` } : { label: 'Bait', text: 'Shrimp' };

	}

	bucketText() {

		const s = this.state, kinds = BAIT_IDS.filter( ( k ) => s.bait[ k ] > 0 );
		const room = `${ s.baitCount } / ${ s.stats.baitMax }`;
		return kinds.length ? `Bait bucket (${ room }): ${ kinds.map( ( k ) => `${ s.bait[ k ] } ${ BAITS[ k ].short }` ).join( ', ' ) }` : `The bait bucket's empty (${ room })`;

	}

	// Marta's order filled from the bait bucket
	sellBait( vendor = this.hud && this.hud.vendor ) {

		const r = this.state.sellBait( this.saleTerms( vendor ) );
		if ( r.count ) {

			this.toast( `Sold Marta ${ r.count } live bait for $${ r.total }` );
			if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();

		}

		return r;

	}

	// ---- (Salt Life) the speargun

	updateSpear( dt, { lmb, lDown, canSpear } ) {

		const app = this.app, p = app.player, gun = this.gun, fish = app.fish, inp = app.input;
		p.stalk = gun.equipped || this.tools.equipped;
		// blacked out: whatever was on the shaft is lost, and the line comes in
		if ( p.blackouts !== this._blackouts ) {

			this._blackouts = p.blackouts;
			this.toast( 'You blacked out and floated up · surface before your breath runs out', 3600 );
			this.dropSpear( true );
			this.dropLobster();

		}

		if ( gun.equipped ) {

			this.sights();
			if ( gun.state === 'loaded' && lDown ) {

				const a = this.aim;
				if ( ! this.submerged ) this.say( p.blackout ? 'Catch your breath first' : 'Dive first: the speargun is for under the water' );
				else if ( gun.safety && a ) this.say( { protected: `${ a.label }: protected · let it be`, notTarget: `${ a.label }: not a fish anyone spears`, small: `That ${ a.label.toLowerCase() } is too small · let it grow`, byHand: `${ a.label }: by hand only · tickle it out and net it`, shark: `${ a.label }: no spearing sharks · let it be` }[ a.rule ] );
				else {

					const cam = app.camera;
					_a.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion ).multiplyScalar( Math.max( 1.2, a ? a.dist : gun.gear.spearM * 1.2 ) ).add( cam.position );
					if ( gun.fire( _a ) && fish ) fish.startle( cam.position.x, cam.position.y, cam.position.z, 5 );

				}

			}

			if ( gun.state === 'empty' || gun.state === 'loading' ) gun.loadBands( lmb, dt );

		}

		gun.update( dt, {
			visible: canSpear, groundAt: ( x, z ) => p.groundAt( x, z, gun.tip.y + 0.3 ), colliders: app.colliders, waterY: app.cameraWaterHeight ?? 0,
			// the shaft in flight: through the first fish it may take (it passes the others by)
			pierce: ( a, b ) => {

				const hit = fish && fish.pierce( a, b, ( i ) => this.legal( i ) );
				if ( hit ) this.spearStrike( hit );
				return !! hit;

			},
		} );
		const sp = this.speared;
		if ( ! sp || ! fish ) return;
		// the fish on the shaft, where the shaft has it
		const pose = gun.fishPose( _pose );
		if ( pose ) fish.hold( sp.i, pose.pos.x, pose.pos.y, pose.pos.z, pose.head, pose.roll, pose.thrash );
		// (Salt Life) a shark or a goliath may come for it while it's out on the line
		if ( pose && ( gun.state === 'stuck' || gun.state === 'fighting' || gun.state === 'pulling' ) ) {

			const thief = this.thief( sp, dt, pose.pos.x, pose.pos.y, pose.pos.z, 'pull it in fast!' );
			if ( thief ) {

				fish.take( sp.i );
				this.speared = null;
				this.spearFight = null;
				gun.tearFree();
				this.toast( `${ upper( thief ) } took it off the shaft`, 2800 );
				return;

			}

		} else this.calmThief( sp );
		// shot, it's hauled in; a big one (not shot through the head) fights first
		if ( gun.state === 'stuck' && gun.t > 0.35 ) {

			if ( sp.big ) {

				const g = gun.gear;
				// (landed once it's tired and pulled close: CatchMinigame landAt, tired)
				const f = this.spearFight = new CatchMinigame( { species: sp.id, kg: sp.kg, lineKg: g.spearHold * ( sp.tail ? 0.6 : 1 ), reelSpeed: 1.0, distance: Math.max( 1.5, gun.muzzle.distanceTo( gun.tip ) - g.shaftM ), landAt: 1.0, tired: 0.25 } );
				// it runs to the end of the line, and tears free (with a reel, it takes line first)
				f.maxDistance = g.lineM + ( g.spearReel ? 25 : 0.4 );
				f.spear = true;
				this.toast( 'A big one · hold to pull it in, ease off when it runs', 2600 );

			} else gun.pull();

		}

		if ( this.spearFight ) {

			const f = this.spearFight;
			const st = f.update( dt, lmb );
			gun.fight( f.distance, f.surge );
			if ( st === 'caught' ) {

				this.spearFight = null;
				gun.pull();

			} else if ( st !== 'fighting' ) {

				this.spearFight = null;
				this.loseSpeared( st === 'snapped' ? 'It tore off the shaft' : 'It ran out the line and tore free' );
				return;

			}

		}

		// one held only by its tail can work itself off as it's hauled in
		if ( gun.state === 'pulling' && sp.tail && ! sp.big && ! sp.tried && gun.t > 0.5 ) {

			sp.tried = true;
			if ( Math.random() < 0.35 ) {

				this.loseSpeared( 'Shot through the tail: it worked itself off' );
				return;

			}

		}

		if ( gun.state === 'pulling' && gun.arrived ) this.landSpeared();
		// the catch card is up (the fish in front of you) until it's dismissed or it times out
		if ( sp.card && gun.state === 'landing' ) {

			sp.cardT += dt;
			if ( this.cardEnd( sp.card, sp.cardT, lDown ) ) {

				this._cardDismissed = true;
				this.finishSpeared();

			}

		}

		p.breathPaused = !! ( this.speared && this.speared.card );

	}

	// what's under the sights: the first fish along the view within the shot's range, and whether it
	// may be taken (the speargun won't fire at one that mustn't be)
	sights() {

		const app = this.app, fish = app.fish, gun = this.gun, cam = app.camera;
		this.aim = null;
		gun.safety = false;
		if ( ! fish || gun.state !== 'loaded' || ! this.submerged ) return null;
		const g = gun.gear, range = g.spearM + g.lineM * 0.5;
		_a.copy( cam.position );
		_b.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion ).multiplyScalar( range ).add( _a );
		const hit = fish.pierce( _a, _b );
		if ( ! hit ) return null;
		// (not one behind the reef)
		const p = app.player;
		if ( groundHit( _a, _b.lerpVectors( _a, _b, hit.t ), ( x, z ) => p.groundAt( x, z, _a.y + 0.3 ) ) < 1 ) return null;
		const { sp, L } = fish.about( hit.i );
		const cm = Math.round( L * 100 );
		const id = sp.fish && FISH[ sp.fish ] ? sp.fish : null;
		const rule = id ? spearRule( id, cm ) : sp.rule || 'notTarget';
		const dist = hit.t * range;
		this.aim = { i: hit.i, label: id ? FISH[ id ].name : sp.label, cm, rule, dist, far: dist > g.spearM };
		gun.safety = rule !== 'ok';
		return this.aim;

	}

	// may the speargun take swimmer i?
	legal( i ) {

		const { sp, L } = this.app.fish.about( i );
		return !! sp.fish && spearRule( sp.fish, Math.round( L * 100 ) ) === 'ok';

	}

	// the shaft is through a fish: a clean shot through the head, through its body, or only its tail;
	// a long shot at a big fish (the shaft slowed by the water) can glance off
	spearStrike( hit ) {

		const fish = this.app.fish, gun = this.gun;
		const { sp, L } = fish.about( hit.i );
		const id = sp.fish, cm = Math.round( L * 100 ), kg = fishWeightKg( id, cm );
		const pen = gun.vel.length() / gun.gear.spearV;
		if ( pen < 0.3 || ( pen < 0.5 && kg > gun.gear.spearHold * 0.5 ) ) {

			fish.startle( gun.tip.x, gun.tip.y, gun.tip.z, 6 );
			gun.tearFree();
			this.toast( 'Too far: the shaft glanced off it', 1800 );
			return;

		}

		const shape = fish.hitShape( sp.model );
		const kill = hit.u < 0.32, tail = hit.u > 0.74;
		const i3 = hit.i * 3;
		_a.set( fish.head[ i3 ], fish.head[ i3 + 1 ], fish.head[ i3 + 2 ] );
		gun.strike( { i: hit.i, L, u: hit.u, body: SPECIES[ sp.model ].body, half: shape.hw * L, head: _a, kill } );
		this.speared = { i: hit.i, id, kg, cm, kill, tail, big: ! kill && kg > gun.gear.spearHold * 0.3, card: null, cardT: 0 };
		const au = this.app.audio;
		if ( au && au.spearHit ) au.spearHit( 'fish', gun.tip );
		this.toast( kill ? 'A clean shot!' : tail ? 'Only through the tail…' : 'Fish on the shaft!', 1400 );

	}

	// hauled in: it's yours (the catch card, as from the rod: Game.updateFight)
	landSpeared() {

		const sp = this.speared, gun = this.gun;
		this.calmThief( sp );
		const entry = this.state.addFish( sp.id, sp.kg, this.hour, { method: 'spear', cm: sp.cm, day: this.tradeDay, place: this.placeAt( this.app.camera.position.x, this.app.camera.position.z ) } );
		const info = this.state.lastCatch;
		info.wanted = entry ? this.wantedFor( entry ) : null;
		if ( this.app.together ) {

			const isle = this.app.together.caught( sp.id, info.kg, info.cm, 'spear', info.place );
			info.islandRecord = isle.island;
			info.islandHeld = isle.held || null;
			info.placeRecord = isle.place ? info.place : null;

		}

		const au = this.app.audio;
		if ( au && au.fishFlop ) au.fishFlop();
		gun.land();
		if ( this.hud ) {

			sp.card = info;
			sp.cardT = 0;
			this.hud.showCatch( info, CATCH_CARD_MS );

		} else {

			const name = FISH[ sp.id ].name;
			this.toast( info.kept ? `${ info.record ? 'New record! ' : '' }${ name } · ${ lb( info.kg ) } · $${ info.value }` : `${ name } · ${ lb( info.kg, 1 ) } · no room, let it go`, 3600 );
			this.finishSpeared();

		}

	}

	// the card dismissed: the fish off the shaft into the cooler, the shaft back in the gun
	finishSpeared() {

		const sp = this.speared, fish = this.app.fish;
		if ( sp && fish ) fish.take( sp.i );
		this.speared = null;
		this.app.player.breathPaused = false;
		this.gun.endLanding();
		if ( this.hud && this.hud.catchOpen ) this.hud.hideCatch();

	}

	// it's off the shaft: one shot through the head sinks out of sight, one still alive swims off
	loseSpeared( msg ) {

		const sp = this.speared, fish = this.app.fish;
		if ( sp && fish ) {

			this.calmThief( sp );
			if ( sp.kill ) fish.take( sp.i );
			else fish.release( sp.i );

		}

		this.speared = null;
		this.spearFight = null;
		if ( msg ) this.toast( msg, 2200 );
		this.gun.tearFree();

	}

	// out of the water or blacked out: a fish already landed (its card up) is kept; one still on the
	// line is lost; the line comes in
	dropSpear( silent = false ) {

		if ( this.speared && this.speared.card ) this.finishSpeared();
		else if ( this.speared ) this.loseSpeared( silent ? null : 'Lost it' );
		this.spearFight = null;
		if ( this.gun.shaftOut ) this.gun.tearFree();

	}

	// ---- (Salt Life) thieves: a shark or a goliath grouper after the fish on the shaft or the line

	// w: the speared fish or the rod's fight (its tries are kept on it), now at x, y, z. A first try a
	// moment after it's on, then now and then (Fish.thiefNear: one near enough, at its odds); once one
	// is coming the fish must be in before it gets there. Who took it ('a blacktip shark'), or null
	thief( w, dt, x, y, z, hurry ) {

		const fish = this.app.fish;
		if ( ! fish ) return null;
		w.thiefT = ( w.thiefT || 0 ) + dt;
		const r = w.raid;
		if ( r ) {

			r.at.x = x;
			r.at.y = y;
			r.at.z = z;
			if ( r.at.got ) {

				w.raid = null;
				return r.who;

			}

			if ( w.thiefT - r.t0 > THIEF_S[ 2 ] ) this.calmThief( w );
			return null;

		}

		if ( w.thiefT < ( w.nextTry ?? THIEF_S[ 0 ] ) ) return null;
		w.nextTry = w.thiefT + THIEF_S[ 1 ];
		const t = fish.thiefNear( x, y, z );
		if ( ! t || Math.random() >= t.chance ) return null;
		const { sp } = fish.about( t.i );
		const who = aName( sp.fish && FISH[ sp.fish ] ? FISH[ sp.fish ].name : sp.label );
		w.raid = { i: t.i, at: fish.raid( t.i, x, y, z ), t0: w.thiefT, who };
		this.toast( `${ upper( who ) } is coming for your fish · ${ hurry }`, 2600 );
		return null;

	}

	// the fish is in (or lost): the thief after it turns away
	calmThief( w ) {

		if ( ! w || ! w.raid ) return;
		if ( this.app.fish ) this.app.fish.endRaid( w.raid.i );
		w.raid = null;

	}

	// ---- (Salt Life) the spiny lobster: the tickle stick worked into its den (held) until it walks
	// out, then the hand net swept over it in the open (a click). In the net it's gauged (the catch
	// card): a short one, a berried female, or one over the day's bag goes back

	updateLobster( dt, { lmb, lDown, canSpear } ) {

		const app = this.app, fish = app.fish, tools = this.tools, cam = app.camera, inp = app.input;
		let tickling = false, at = null;
		this.lobsterAim = null;
		if ( tools.equipped && fish && this.submerged && ! tools.busy ) {

			const g = this.state.stats;
			_b.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
			const a = this.lobsterAim = fish.nearLobster( cam.position, _b, g.tickleM + 0.6 );
			if ( a ) {

				const i3 = a.i * 3, L = fish.size[ a.i ];
				a.cm = Math.round( L * 100 );
				a.reach = a.state === 'den' ? g.tickleM + 0.25 : NET_M;
				_h.set( fish.pos[ i3 ] + fish.head[ i3 ] * L * 0.4, fish.pos[ i3 + 1 ], fish.pos[ i3 + 2 ] + fish.head[ i3 + 2 ] * L * 0.4 );
				if ( a.state === 'den' && lmb && a.dist < a.reach ) {

					tickling = true;
					at = _h;
					a.coax = fish.tickle( a.i, dt, 1 / g.coaxS );

				} else if ( lDown && a.state === 'out' && a.dist < NET_M ) {

					_a.set( fish.pos[ i3 ], fish.pos[ i3 + 1 ], fish.pos[ i3 + 2 ] );
					if ( tools.scoop( _a, cam.position ) ) this._scoop = a.i;

				} else if ( lDown ) this.say( a.state === 'flip' ? 'It shot off · let it settle, then creep up slowly' : a.state === 'den' ? 'Closer · reach into the den with the stick' : 'Closer · within arm\'s reach, slowly' );

			}

		} else if ( tools.equipped && lDown && ! tools.busy && ! this.submerged ) this.say( app.player.blackout ? 'Catch your breath first' : 'Dive first: lobsters live in the reef' );

		tools.update( dt, { visible: canSpear, tickling, at } );

		// the sweep is over it: in the net, or missed (and it shoots off backwards)
		if ( this._scoop !== null && tools.swept ) {

			const i = this._scoop, i3 = i * 3;
			this._scoop = null;
			const near = Math.hypot( fish.pos[ i3 ] - tools.target.x, fish.pos[ i3 + 2 ] - tools.target.z ) < tools.R + 0.15;
			const ok = near && ! fish.held[ i ] && fish.lobsterState( i ) !== 'flip' && Math.random() < ( fish.diver.speed < 0.8 ? 0.9 : 0.55 );
			fish.netLobster( i, ok, cam.position.x, cam.position.z );
			tools.land( ok );
			if ( ok ) {

				const cm = Math.round( fish.size[ i ] * 100 );
				this.netted = { i, cm, kg: fishWeightKg( 'lobster', cm ), berried: fish.berried( i ), t: 0, card: null, cardT: 0 };
				this.toast( 'In the net!', 1200 );

			} else this.toast( 'Missed · it shot off backwards', 1600 );

		}

		// in the net, held up in front of you: gauged, then the card until it's dismissed
		const n = this.netted;
		if ( ! n || ! fish ) return;
		tools.bag( _a, _b );
		fish.hold( n.i, _a.x, _a.y, _a.z, _b, 0, n.card ? 0.35 : 0.9 );
		n.t += dt;
		if ( ! n.gauged && n.t > GAUGE_S ) this.gaugeLobster();
		if ( n.card ) {

			n.cardT += dt;
			app.player.breathPaused = true;
			if ( this.cardEnd( n.card, n.cardT, lDown ) ) {

				this._cardDismissed = true;
				this.finishLobster();

			}

		}

	}

	// the gauge on its carapace: kept (the bag), or why it goes back; the catch card (a toast without one)
	gaugeLobster() {

		const n = this.netted;
		n.gauged = true;
		const release = n.cm < FISH.lobster.minCm ? 'short' : n.berried ? 'berried' : null;
		const entry = this.state.addFish( 'lobster', n.kg, this.hour, { method: 'hand', cm: n.cm, day: this.tradeDay, release, place: this.placeAt( this.app.camera.position.x, this.app.camera.position.z ) } );
		const info = this.state.lastCatch;
		info.wanted = entry ? this.wantedFor( entry ) : null;
		if ( this.app.together ) {

			const isle = this.app.together.caught( 'lobster', info.kg, info.cm, 'hand', info.place );
			info.islandRecord = isle.island;
			info.islandHeld = isle.held || null;
			info.placeRecord = isle.place ? info.place : null;

		}

		if ( this.hud ) {

			n.card = info;
			n.cardT = 0;
			this.hud.showCatch( info, CATCH_CARD_MS );

		} else {

			const name = FISH.lobster.name, size = `${ ( n.cm * CARAPACE / 2.54 ).toFixed( 2 ) } in carapace`;
			const why = { short: 'short, back it goes', berried: 'carrying eggs, back she goes' }[ info.why ] || ( info.bag && info.bag.full ? 'your bag is full today, back it goes' : ! info.kept ? 'no room, back it goes' : `$${ info.value }` );
			this.toast( `${ name } · ${ size } · ${ why }`, 3600 );
			this.finishLobster();

		}

	}

	// the card dismissed: a kept one into the cooler, one let go off backwards to its den; the net back
	// in the hand
	finishLobster() {

		const n = this.netted, fish = this.app.fish;
		this.netted = null;
		if ( n && fish ) {

			if ( n.card && n.card.kept ) fish.take( n.i );
			else {

				const c = this.app.camera.position;
				fish.letGo( n.i, c.x, c.z );

			}

		}

		this.app.player.breathPaused = false;
		this.tools.endLanding();
		if ( n && n.card && this.hud && this.hud.catchOpen ) this.hud.hideCatch();

	}

	// out of the water or blacked out: one already gauged is kept (or let go, as its card says); one
	// not yet gauged slips out of the net; a sweep stops
	dropLobster() {

		const n = this.netted;
		if ( n && ! n.gauged ) n.card = null;
		if ( n ) this.finishLobster();
		this._scoop = null;
		if ( this.tools.busy ) this.tools.endLanding();

	}

	// the lobster in front of the tools, for the sights' tag ({ label, cm (its carapace's own rule: the
	// HUD shows it), rule, far })
	lobsterTag() {

		const a = this.lobsterAim;
		if ( ! a || ! this.submerged ) return null;
		return { label: a.state === 'den' ? 'Spiny lobster · in its den' : FISH.lobster.name, cm: a.cm, carapace: true, rule: 'ok', far: a.dist > a.reach };

	}

	lobsterPrompt() {

		const p = this.app.player, a = this.lobsterAim, n = this.netted;
		if ( n ) return n.card ? null : { key: '…', text: 'Gauging the carapace' };
		if ( this.tools.busy ) return { key: '…', text: 'Sweeping the net' };
		if ( ! this.submerged ) return p.blackout ? { key: '…', text: 'Catch your breath' } : { key: 'W', text: 'Look down and swim to dive   ·   R  put the lobster gear away' };
		if ( ! a ) return { key: '…', text: 'Look under ledges and coral heads for antennae · they walk out after dark' };
		if ( a.state === 'flip' ) return { key: '…', text: 'It shot off · let it settle, then creep up slowly' };
		if ( a.dist > a.reach ) return { key: '…', text: a.state === 'den' ? 'Closer: reach into the den with the stick' : 'Closer: within arm\'s reach, slowly' };
		if ( a.state === 'den' ) return { key: 'LMB', text: 'Hold to tickle it out of its den' };
		return { key: 'LMB', text: 'Net it!' };

	}

	// a toast, not over and over
	say( text ) {

		const now = performance.now();
		if ( text === this._saidText && now - this._said < 2500 ) return;
		this._said = now;
		this._saidText = text;
		this.toast( text, 1800 );

	}

	spearPrompt() {

		const gun = this.gun, p = this.app.player, g = gun.gear, a = this.aim;
		switch ( gun.state ) {

			case 'loaded':
				if ( ! this.submerged ) return p.blackout ? { key: '…', text: 'Catch your breath' } : { key: 'W', text: 'Look down and swim to dive   ·   R  put the speargun away' };
				if ( a && a.rule === 'ok' ) return a.far ? { key: '…', text: `Closer: ${ feet( a.dist ) } off, your gun reaches ${ feet( g.spearM ) }` } : { key: 'LMB', text: 'Shoot!' };
				if ( a ) return { key: '…', text: { protected: 'Protected: let it be', notTarget: 'Not a fish anyone spears', small: 'Too small: let it grow', byHand: this.tools.owned ? 'By hand only: R for the tickle stick and net' : 'By hand only: Marta sells a tickle stick and net', shark: 'A shark: let it be' }[ a.rule ] };
				return { key: 'LMB', text: 'Stalk slowly, aim at a fish and shoot   ·   Shift  kick hard' };
			case 'empty': return { key: 'LMB', text: `Hold to load the band${ gun.bands > 1 ? 's' : '' }` };
			case 'loading': return { key: 'LMB', text: gun.bands > 1 ? `Drawing back band ${ gun.loading + 1 } of ${ gun.bands }` : 'Drawing back the band' };
			case 'fighting': return this.spearFight && this.spearFight.tension > this.spearFight.band[ 1 ] ? { key: 'LMB', text: 'Too much pull · let go!' } : { key: 'LMB', text: 'Hold to pull it in · let go when it runs' };
			case 'spent':
			case 'pulling': return { key: '…', text: this.speared ? 'Hauling it in' : 'Hauling the shaft in' };
			default: return null;

		}

	}

	// who's after a fish in the cooler, if the day's list or the week's order would take it (the catch
	// card): { text } or null
	wantedFor( fish ) {

		// ((M15) a place's ask first, for a fish from its place)
		const o = ordersOf( this.orders, 'joe', fish.species, fish.place )[ 0 ] || ordersOf( this.orders, 'marta', fish.species, fish.place )[ 0 ];
		if ( o && this.state.wantedIds( this.orders, this.tradeDay ).has( fish.id ) ) return { order: o, text: `${ o.who === 'marta' ? 'Marta' : 'Joe' } wants it${ o.place ? ` from ${ placeName( o.place ) }` : '' }` };
		const w = this.weekTerms();
		if ( w && this.state.wantedIds( null, null, w ).has( fish.id ) ) return { text: 'For the week\'s order' };
		return null;

	}

	// line in at once (mode change)
	cancelLine( silent = false ) {

		if ( this.fight && ! silent ) this.toast( 'Lost it', 1400 );
		if ( this.fight ) this.calmThief( this.fight );
		this.fight = null;
		this.bite = null;
		if ( this.rod.state !== 'stowed' ) this.rod.setState( this.rod.equipped ? 'idle' : 'stowed' );

	}

}
