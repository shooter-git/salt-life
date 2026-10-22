import * as THREE from './engine/index.js';
import './materials/HeightHaze.js'; // (three's fog chunks: before anything is compiled)
import { createStage, gltfLoader } from '@allthespaces/portal/three';
import { ResolutionGovernor } from '@allthespaces/portal/resolution';
import { G } from './core/Globals.js';
import { Input } from './core/Input.js';
import { SaveStore } from './core/SaveStore.js';
import { TerrainData } from './world/TerrainData.js';
import { decodeIsland } from './world/terrain/IslandDecode.js';
import { setDetailData } from './world/terrain/DetailTextures.js';
import { WORLD } from './world/WorldLayout.js';
import { Colliders } from './world/Colliders.js';
import { Village } from './world/Village.js';
import { Terrain } from './world/Terrain.js';
import { Rocks } from './world/Rocks.js';
import { Vegetation } from './world/Vegetation.js';
import { BoatModel } from './world/BoatModel.js';
import { Sky } from './sky/Sky.js';
import { Waves } from './ocean/Waves.js';
import { WaterQuery } from './ocean/WaterQuery.js';
import { WaterSurface } from './ocean/WaterSurface.js';
import { ShoreWaves } from './ocean/ShoreWaves.js';
import { computeShoreField } from './world/ShoreField.js';
import { Player } from './player/Player.js';
import { BoatController } from './player/BoatController.js';
import { GameState } from './game/GameState.js';
import { FishStand, STAND } from './game/FishStand.js';
import { Chandlery, CHANDLERY } from './game/Chandlery.js';
import { LocalLights, addBoatLights, addVillageLights, useLocalLights, holdLocalLights } from './materials/LocalLights.js';
import { Wildlife } from './world/wildlife/Wildlife.js';
import { Debris } from './world/Debris.js';
import { Reef } from './world/Reef.js';
import { FishSchools } from './world/Fish.js';
import { fishModelsAsync } from './world/fish/FishModelsAsync.js';
import { MarineSnow } from './fx/MarineSnow.js';
import { Whale } from './world/marine/Whale.js';
import { Spray } from './fx/Spray.js';
import { AirMotes } from './fx/AirMotes.js';
import { BoatSpray } from './player/BoatSpray.js';
import { WhaleWater } from './ocean/WhaleWater.js';
import { Character } from './game/Character.js';
import { TouchControls } from './ui/TouchControls.js';
import { Hud } from './ui/Hud.js';
import { Wake } from './ocean/Wake.js';
import { SoundScape } from './audio/SoundScape.js';
import { Game } from './game/Game.js';
import { Together } from './together/Together.js';
import { BoatLamps } from './world/boat/BoatLamps.js';
import { createGameUI } from './ui/GameUI.js';
import { PostChain } from './post/PostChain.js';
import { releaseGeometries, releaseTextures, uploadTextures, watchContext } from './core/ReleaseAfterUpload.js';

// Salt Life: the island, the sea and the boat, drawn with three.js inside All the Spaces. It follows
// Tidewater's App (same systems, same order each frame); what isn't ported yet is simply not here.
//
// `portal` is the All the Spaces SDK (connect()): its tier ('low' | 'mid' | 'high') sizes everything.

// the sun's shadows: on high two maps fitted to the view (Sky's SunLight), each `size` px, as far as
// `distance` (m); on mid one map, `box` m across, its middle `ahead` m in front of the camera (2.3 cm
// a texel: the railings' shadows were stairs at mid's earlier 6 cm)
const SHADOW = { mid: { size: 2048, box: 48, ahead: 14 }, high: { size: 2048, distance: 110 } };
const ISLAND = { low: 'world/island-1024.bin', mid: 'world/island.bin', high: 'world/island.bin' };
// WebGL drawn on the CPU draws at most a phone screen's pixels (a laptop's is three times as many)
const CPU_PIXELS = 360_000;
const LENS_REACH = 0.02; // m below the surface before the view counts as under water
const UNDERWATER = new THREE.Color( 0.03, 0.17, 0.2 );
const _c = new THREE.Color();
const _c3 = new THREE.Vector3();
const _size = new THREE.Vector2();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _hornAt = new THREE.Vector3( - 0.42, 3.4, 1.15 ); // (the boat's horn, if its model doesn't say)
// what starts the sound: browsers allow it only after one of these
const GESTURES = [ 'pointerdown', 'touchend', 'click', 'keydown' ];

export class App {

	constructor( portal ) {

		this.portal = portal;
		// ?tier=low|mid|high tries another device tier when running on its own (pnpm dev)
		const asked = portal.standalone && new URLSearchParams( location.search ).get( 'tier' );
		this.tier = [ 'low', 'mid', 'high' ].includes( asked ) ? asked : portal.tier;
		this.settings = {
			timeOfDay: 16.2,
			sunAzimuth: 0, // degrees: turns the sun's daily path about the vertical
			timeSpeed: 0, // hours per real second (T lets the day run)
			exposure: 0.55,
		};

	}

	async init( progress = async () => {} ) {

		const portal = this.portal, tier = this.tier;

		// ---------------------------------------------------------------- saves and the island
		await progress( 0.05, 'Fetching the island' );
		this.store = new SaveStore( portal, { onError: ( e ) => this.hud && this.hud.toast( saveErrorText( e ) ) } );
		const [ bytes, detail ] = await Promise.all( [
			// low-powered devices get the island at 2 m (a quarter of the memory), as their ground is drawn
			fetch( ISLAND[ tier ] ?? ISLAND.low ).then( ( r ) => {

				if ( ! r.ok ) throw new Error( `${ r.url }: ${ r.status }` );
				return r.arrayBuffer();

			} ),
			fetch( 'world/detail.bin' ).then( ( r ) => {

				if ( ! r.ok ) throw new Error( `${ r.url }: ${ r.status }` );
				return r.arrayBuffer();

			} ),
			this.store.load(),
		] );
		setDetailData( new Uint8Array( detail ) );
		this.state = new GameState( this.store );
		this.state.load(); // (the save was read above: money, the cooler, the log, upgrades, fuel)

		await progress( 0.25, 'Shaping the island' );
		this.terrainData = new TerrainData( 7, decodeIsland( new Uint8Array( bytes ) ) );

		// ---------------------------------------------------------------- stage
		// WebGL drawn on the CPU (no graphics card, or a blocklisted one): frames are paced (pacedFrame)
		// and kept to a phone's pixels (fitCpuPixels). Asked of a throwaway context, as it decides how
		// the stage's is made.
		this.cpuGL = probeCpuGL();
		// (with a graphics card the reef is laid out in a worker while the rest loads: reefGrows)
		if ( ! this.cpuGL ) this._reefLayout = Reef.layout( this.terrainData );
		// Anti-aliased on every tier where a graphics card draws (the SDK leaves it off on low: on a
		// phone the low tier's resolution, a third of the screen's across, then looks jagged, and
		// phones' GPUs smooth edges almost for free). Its resolution is this game's own (adaptResolution).
		const stage = this.stage = createStage( portal, { fov: 70, shadows: tier !== 'low', antialias: ! this.cpuGL, dynamicResolution: false } );
		const { renderer, camera } = stage;
		// Tidewater's grading: ACES (the SDK's default AgX greys out the sand and the sea)
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = this.settings.exposure;
		// the near clip plane is the lens: it slices the water surface at the waterline
		camera.near = 0.1;
		camera.far = 12000;
		camera.updateProjectionMatrix();
		this.renderer = renderer;
		this._drawn = null; // the last frame's fence
		this._owed = 0; // s not yet played while waiting for it
		this._slots = []; // bakes waiting for a frame of their own (frameSlot)
		this._firsts = []; // programs waiting for their first draw (firstDraws)
		this._slotOwed = 0;
		this._rest = false; // the frame after a drawn one is skipped
		if ( this.cpuGL ) this.fitCpuPixels();
		// dynamic resolution, gentler than the stage's (which aims at 60 frames a second and goes down
		// to half the pixels, a blur): at least 70%, aiming at 30, and back up when fewer pixels
		// didn't make frames faster (frames held up by the processor)
		this.resolution = new ResolutionGovernor( { min: 0.7, targetMs: 1000 / 30, detectCpuBound: true } );
		this._ratio = 0; // the pixel ratio last set here
		this._fullRatio = 1; // the stage's, for the screen
		this._lastTick = 0;

		this.camera = camera;
		const scene = this.scene = new THREE.Scene();

		this.input = new Input( renderer.domElement, { portal } );
		this.touch = new TouchControls( this.input );
		if ( portal.viewport.touch ) this.touch.show( true );
		this.hud = new Hud();
		renderer.domElement.addEventListener( 'click', () => this.input.requestLock() );

		// ---------------------------------------------------------------- sky
		await progress( 0.4, 'Lighting the sky' );
		this.sky = new Sky( { scene, renderer, tier } );
		// the eye adapts at dusk and at night: the whole scene's exposure follows (Tidewater's auto exposure)
		this.sky.sceneAdaptation = true;
		if ( SHADOW[ tier ] ) {

			const s = this.sky.sun, o = SHADOW[ tier ];
			s.castShadow = true;
			s.shadow.mapSize.setScalar( o.size );
			if ( s.isSunLight ) s.shadow.camera.far = o.distance;
			else {

				const r = o.box / 2;
				Object.assign( s.shadow.camera, { left: - r, right: r, top: r, bottom: - r, near: 1, far: 400 } );
				this.sky.shadowAhead = o.ahead;

			}

			s.shadow.bias = - 0.0004;
			s.shadow.normalBias = 0.03;
			s.shadow.radius = 1.25;
			// (three r186's shadow pass draws what the view camera's layers show: the reef's
			// shadow-only stand-ins on layer 1 join it there, and only there)
			const shadowMap = renderer.shadowMap, renderShadows = shadowMap.render;
			shadowMap.render = function ( lights, scene, camera ) {

				const had = camera.layers.isEnabled( 1 );
				camera.layers.enable( 1 );
				renderShadows.call( this, lights, scene, camera );
				if ( ! had ) camera.layers.disable( 1 );

			};

		}

		// ---------------------------------------------------------------- island
		await progress( 0.5, 'Laying out the ground' );
		this.colliders = new Colliders();
		// the village flattens building pads into the heightmap: build it before the ground (whose
		// textures are made from the heights) and everything placed on it
		this.village = new Village( { scene, terrain: this.terrainData, colliders: this.colliders, tier, smallBakes: this.cpuGL } );
		await this.village.init( renderer );
		// Joe's fish stand and Marta's chandlery (Tidewater's Game builds them; the fishing game isn't
		// ported yet): their scanned props load while the rest of the island is made
		this.stand = new FishStand( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		this.chandlery = new Chandlery( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		this.terrain = new Terrain( { scene, terrainData: this.terrainData, tier } );
		uploadTextures( renderer, [ this.terrain.heightTexture, this.terrain.normalTexture, this.terrain.splatTexture ] );
		// boulders, blocks, talus and outcrops (shaded like the ground's rock)
		this.rocks = new Rocks( { scene, terrain: this.terrain, colliders: this.colliders, village: this.village, castShadow: tier !== 'low', lite: tier === 'low' } );
		this.vegetation = new Vegetation( { scene, terrain: this.terrainData, ground: this.terrain, renderer, tier, village: this.village, smallBakes: this.cpuGL, bakeSlot: () => this.frameSlot() } );
		// (WebGL drawn on the CPU: the plants grow in once the game has started, in start(); their
		// programs and bakes take seconds there, and a creation has 45 s to load)
		if ( ! this.cpuGL ) await this.plantsGrow();

		// ---------------------------------------------------------------- ocean
		await progress( 0.6, 'Rolling in the swell' );
		this.waves = new Waves( { tier, terrain: this.terrainData } );
		// the breaking shore waves: their phase from the wave travel-time field around the island
		this.shoreField = computeShoreField( this.terrainData, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } );
		this.shore = new ShoreWaves( { field: this.shoreField } );
		this.query = new WaterQuery( this.waves, this.terrainData, this.shore );
		this.water = new WaterSurface( { scene, waves: this.waves, terrain: this.terrain, shore: this.shore, tier } );

		// ---------------------------------------------------------------- boat and player
		await progress( 0.7, 'Mooring the boat' );
		this.boat = new BoatModel();
		scene.add( this.boat.group );
		this.boat.group.position.copy( WORLD.boatDock.position );
		this.boat.group.rotation.y = WORLD.boatDock.heading;
		this.boat.group.traverse( ( o ) => {

			if ( o.isMesh ) o.castShadow = o.castShadow && tier !== 'low';

		} );
		this.boatCtl = new BoatController( { model: this.boat, query: this.query, terrain: this.terrainData, colliders: this.colliders } );
		this.wake = new Wake( { scene, boat: this.boatCtl, waves: this.waves, tier } );
		// spray (fx/Spray.js): off the boat's bow (and the slap of its hull on the water), the
		// whale's blows and breaches, leaping mullet, diving birds
		this.spray = new Spray( { waves: this.waves, terrain: this.terrainData, tier } );
		scene.add( this.spray.mesh );
		this.boatSpray = new BoatSpray( { boat: this.boatCtl, spray: this.spray } );
		if ( tier === 'low' ) {

			this.nearDetail = [];
			// (the village's display fish, one mesh spanning the village, aren't built on these devices)
			this.stand.group?.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			this.chandlery.group?.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			for ( const k of [ 'fittings', 'trap', 'wood', 'wheel', 'throttle', 'radar', 'propeller', 'rudder' ] ) if ( this.boat.meshes[ k ] ) this.nearDetail.push( { o: this.boat.meshes[ k ], dist: 70 } );
			for ( const d of this.nearDetail ) if ( ! d.o.geometry.boundingSphere ) d.o.geometry.computeBoundingSphere();

		}

		// laptops: bloom and SMAA (phones draw straight to the screen)
		this.post = tier === 'high' ? new PostChain( renderer, scene, camera ) : null;
		this.player = new Player( { camera, input: this.input, terrain: this.terrainData, colliders: this.colliders, query: this.query, boat: this.boatCtl } );

		// ---------------------------------------------------------------- sound
		// Tidewater's field recordings (public/audio): surf wave by wave, wind, palms, birds by the
		// hour, footsteps, swimming, the boat. Out through All the Spaces' ambience group; started by
		// the first tap, click or key (start()); M mutes it.
		// (the ambience group at full: its default half is for a bed under other sounds, and this is the
		// whole mix, balanced in itself)
		const output = () => {

			portal.audio.setVolume( 'ambience', 1 );
			return portal.audio.bus( 'ambience' );

		};

		this.audio = new SoundScape( { context: () => portal.audio.context, output, tier } );
		// (the surf follows the shore waves: Tidewater's are { value } uniforms, these plain params)
		const P = this.shore.params, live = ( k ) => ( { get value() {

			return P[ k ];

		} } );
		this.audio.attachShore( {
			shore: { amplitude: live( 'amplitude' ), variation: live( 'variation' ), period: live( 'period' ), gamma: live( 'gamma' ), enabled: live( 'enabled' ), time: G.time },
			field: this.shoreField, terrain: this.terrainData,
		} );
		this.player.audio = this.audio;
		this.boatCtl.onSlam = ( strength ) => this.audio.hullSlap( strength );

		// ---------------------------------------------------------------- the fishing game
		// Tidewater's Game: the rod, bites, the fight, the catch, the cooler and log, Joe's and Marta's
		// trade and upgrades; its HUD, minimap and guide on GameUI (over the Hud)
		this.ui = { ui: createGameUI( this.hud ) };
		// the lights at night (lanterns, lit windows, the boat's lights, the flashlight): the nearest
		// few each frame, in every lit material (LocalLights). Before the Game: it adds the boat's deck
		// floodlights
		this.localLights = new LocalLights( { max: tier === 'low' ? 4 : 8 } );
		addVillageLights( this.localLights, this.village );
		addBoatLights( this.localLights, this.boat );
		// (Salt Life) the boat's lamps as others see them at night, and its searchlight (on its group:
		// on a device that draws on the CPU, after the start, with the shaders for later)
		this.boatLamps = new BoatLamps( this.boat );
		this.boatLamps.addLight( this.localLights );
		this.searchlight = false;
		if ( ! this.cpuGL ) this.boat.group.add( this.boatLamps.group );
		// the lanterns at Joe's fish stand and Marta's chandlery, in each stall's frame (x right, z toward
		// the customer), turned by its yaw
		for ( const [ st, lx, ly, lz ] of [ [ STAND, - 0.9, 1.85, 0.1 ], [ CHANDLERY, - 0.75, 1.58, - 1.45 ] ] ) {

			const c = Math.cos( st.yaw ), sn = Math.sin( st.yaw );
			const x = st.x + lx * c + lz * sn, z = st.z - lx * sn + lz * c;
			this.localLights.add( { position: new THREE.Vector3( x, this.terrainData.heightAt( st.x, st.z ) + ly, z ), color: new THREE.Color( 1.0, 0.72, 0.42 ), intensity: 5 * 1.5, range: 11, kind: 'lantern', flicker: 0.08 } );

		}

		this.game = new Game( this );
		// whoever else is on the island, and the time of day you share (together/)
		this.together = new Together( this );
		if ( ! this.cpuGL ) await this.lifeAndDebris();
		if ( this.nearDetail ) {

			// (low-powered devices: the traders and the fish on ice only near the camera, too)
			for ( const v of this.game.vendors ) v.group.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			for ( const o of [ this.game.display.stallMesh, this.game.display.stallIce ] ) if ( o ) this.nearDetail.push( { o, dist: 60 } );
			for ( const d of this.nearDetail ) if ( ! d.o.geometry.boundingSphere ) d.o.geometry.computeBoundingSphere();

		}

		// ---------------------------------------------------------------- shaders
		await progress( 0.8, 'Preparing the shaders' );
		this.lightUp( scene );
		// the CPU copies of the big static data go once it's on the GPU (phones' script memory)
		releaseGeometries( this.village.group );
		// (but the detail texture: the plants read its data as they're placed, and its bake keeps the data
		// anyway, so letting go of the texture's reference would free nothing)
		releaseTextures( this.terrain.mesh, { keep: [ this.terrain.detailTexture ] } );
		// the stalls' scans (mid and high) arrive after the game has started: they're not needed to
		// begin, and the download before it does is limited
		Promise.all( [ this.stand.ready, this.chandlery.ready ] ).then( () => {

			for ( const root of [ this.stand.group, this.chandlery.group ] ) {

				releaseGeometries( root );
				releaseTextures( root );

			}

			return renderer.compileAsync( scene, camera );

		} ).catch( ( e ) => console.warn( 'stalls', e ) );
		watchContext( renderer );
		// WebGL drawn on the CPU draws one loading frame, tiny: it's for placing everything, uploading
		// it and making the GPU's programs, which a few pixels do as well, and there every frame takes
		// seconds (enough to miss the 45 s a creation has to load). The game's first frame is then
		// drawn by its loop.
		const full = this.cpuGL ? { ratio: renderer.getPixelRatio(), size: renderer.getSize( new THREE.Vector2() ) } : null;
		if ( full ) {

			renderer.setPixelRatio( 1 );
			renderer.setSize( 8, 8, false );

		}

		// WebGL drawn on the CPU: a shader's first draw is its slowest moment there (the driver builds
		// it then), and drawing every part of the island in the loading frame was most of the load.
		// The loading frame draws the sky, the ground and the sea; the rest appears over the first
		// frames after the start, a group a frame (revealLate). The rod and its line, out of sight
		// until the rod comes out, are compiled after the start (prepareLate).
		if ( this.cpuGL ) {

			const named = ( ...names ) => scene.children.filter( ( c ) => names.some( ( n ) => c.name === n || c.name.startsWith( n + ':' ) ) );
			this._late = [ named( 'Rocks' ), named( 'Village' ), named( 'FishStand', 'Chandlery', 'StallFish', 'Vendor' ), named( 'LobsterBoat' ) ];
			for ( const group of this._late ) for ( const o of group ) o.visible = false;
			this.game.rod.holdBack = true;
			// the fish in the swimming fish's skin (the village's and the stall's: two big shaders, the
			// skin's and the fins') wait out of the scene, compiled after the start too
			this._heldFish = [ ...( this.village.fish || [] ), this.game.display.stallMesh ]
				.filter( ( m ) => m && Array.isArray( m.material ) ).map( ( m ) => [ m, m.parent ] );
			for ( const [ m ] of this._heldFish ) m.removeFromParent();

		}

		this.frame( 0 ); // places the camera, the LOD grids and the sky for the compile
		if ( this._late ) this.uploadLate();
		// (with the near detail it hid: compiled now, not the first time it shows)
		const near = ( this.nearDetail || [] ).filter( ( d ) => ! d.o.visible );
		for ( const d of near ) d.o.visible = true;
		await renderer.compileAsync( scene, camera );
		for ( const d of near ) d.o.visible = false;
		await this.sky.compiled;
		// a shader's first use asks the GPU for its uniforms and attributes, which waits for all the
		// drawing queued before it: seconds on a device that draws on its CPU. Every one is used here,
		// before the game starts (the sky's passes would otherwise first run mid-game)
		for ( const p of renderer.info.programs ) {

			p.getUniforms();
			p.getAttributes();

		}

		if ( full ) {

			renderer.setPixelRatio( full.ratio );
			renderer.setSize( full.size.x, full.size.y, false );

		} else this.frame( 1 / 60 );

	}

	start() {

		this._settleAt = performance.now() + 5000; // (resolution follows frames once the start has settled)
		this.stage.loop( ( dt ) => {

			// (the stage's first step can be negative: it starts counting after the frame it is given
			// began, a second earlier after a slow start)
			dt = Math.max( 0, dt );
			// a frame given to a bake (frameSlot): nothing else is drawn, its time goes to the next
			if ( this._slots.length ) {

				this._slotOwed += dt;
				this._slots.shift()();
				return;

			}

			dt += this._slotOwed;
			this._slotOwed = 0;
			if ( this.cpuGL ) this.pacedFrame( dt );
			else {

				this.adaptResolution();
				this.frame( dt );

			}

		} );
		this._started = true;
		this.hud.showHint( this.input.lastDevice );
		// (on a device that draws on its CPU, one after another, so their garbage doesn't pile up: the
		// island's held-back parts appear, the plants grow, then the catch card's shaders, then Joe and
		// Marta (their loading is the high point of script memory: before the animals and the debris
		// add theirs), then the animals and the debris, then the scanned debris, with pauses between;
		// last, once that loading's garbage is collected (settle), the reef, its fish and the specks;
		// then, on every device, the whale)
		const revealed = this._late ? new Promise( ( done ) => this._revealed = done ) : null;
		Promise.resolve( revealed ).then( () => this.cpuGL && this.plantsGrow() ).then( () => this.prepareLate() ).then( () => this.loadCharacters() )
			.then( () => this.pause() ).then( () => this.cpuGL && this.lifeAndDebris() ).then( () => this.pause() ).then( () => this.scansArrive() )
			.then( () => this.cpuGL && this.settle() ).then( () => this.cpuGL && this.reefGrows() )
			.then( () => this.pause() ).then( () => this.whaleArrives() ).then( () => this.airArrives() );
		const begin = () => this.audio.resume().then( ( on ) => {

			if ( on ) for ( const type of GESTURES ) removeEventListener( type, begin, true );

		} );
		for ( const type of GESTURES ) addEventListener( type, begin, true );

	}

	frame( dt ) {

		const s = this.settings;
		G.dt.value = dt;
		G.time.value += dt;
		if ( s.timeSpeed !== 0 ) s.timeOfDay = ( s.timeOfDay + dt * s.timeSpeed + 24 ) % 24;
		if ( this.together ) this.together.syncClock( s );

		// ---- player / boat (boat physics first so the cameras follow this frame's pose)
		const input = this.input;
		input.update( dt );
		if ( input.hit( 'KeyT' ) ) this.toggleTime();
		// L: the flashlight; at the helm, the boat's searchlight
		if ( input.hit( 'KeyL' ) ) {

			if ( this.player.mode === 'boat' ) {

				this.searchlight = ! this.searchlight;
				this.hud.toast( this.searchlight ? 'Searchlight on' : 'Searchlight off' );

			} else this.hud.toast( this.localLights.toggleFlashlight() ? 'Flashlight on' : 'Flashlight off' );

		}

		// H at the helm: the horn, for as long as it's held (everyone hears it)
		const horn = this.player.mode === 'boat' && ( input.down( 'KeyH' ) || input.down( 'Horn' ) );
		if ( horn !== !! this._horn ) {

			if ( horn ) this._horn = this.audio.hornStart( this.boatCtl.toWorld( this.boat.hornAt || _hornAt, new THREE.Vector3() ) ) || true;
			else {

				if ( this._horn !== true ) this.audio.hornStop( this._horn );
				this._horn = null;

			}

			if ( this.together ) this.together.horn( horn );

		} else if ( this._horn && this._horn !== true ) this.audio.hornMove( this._horn, this.boatCtl.toWorld( this.boat.hornAt || _hornAt, _c3 ) );

		if ( input.hit( 'KeyM' ) ) {

			this.audio.setMuted( ! this.audio.muted );
			this.hud.toast( this.audio.muted ? 'Sound off' : 'Sound on' );

		}
		// (where the others are now, before the player: the boat you may be riding in)
		if ( this.together ) this.together.track( dt );
		this.boatCtl.update( dt );
		this.player.update( dt );
		this.game.update( dt );
		if ( this.together ) this.together.update( dt );
		this.releaseMasks();
		this.sky.update( s.timeOfDay, s.sunAzimuth, this.camera );

		// ---- water
		this.query.setCamera( this.camera.position.x, this.camera.position.z );
		this.boatCtl.queueQueries();
		this.query.update();
		const h = this.query.cpu[ 0 ];
		this.cameraWaterHeight = Number.isFinite( h ) ? h : 0;
		G.cameraWaterHeight.value = this.cameraWaterHeight;
		const under = this.camera.position.y < this.cameraWaterHeight - LENS_REACH;
		G.cameraUnderwater.value = under ? 1 : 0;
		if ( under ) {

			// under water: the light is green-blue and gone within a few tens of metres
			_c.copy( UNDERWATER ).multiplyScalar( 0.15 + 0.85 * ( 1 - G.night.value ) );
			this.scene.fog.color.copy( _c );
			this.scene.fog.near = 0;
			this.scene.fog.far = 28;

		} else {

			this.scene.fog.near = this.sky.fogNear;
			this.scene.fog.far = this.sky.fogFar;

		}

		// (Salt Life) the far plane just past the fog under water: the island beyond it isn't drawn
		// (its culling drops it), the sky dome is the fog there (Sky)
		const far = under ? 32 : 12000;
		if ( this.camera.far !== far ) {

			this.camera.far = far;
			this.camera.updateProjectionMatrix();

		}

		// (and the plants aren't drawn: instanced, they ignore the far plane, and from under the
		// surface nothing above it shows)
		if ( this.vegetation.ready ) this.vegetation.group.visible = ! under;

		// ---- world
		this.terrain.update( this.camera );
		this.village.update( dt );
		this.rocks.update( this.camera );
		if ( this.debris ) this.debris.update( this.camera );
		if ( this.reef ) this.reef.update( this.camera );
		if ( this.whale ) {

			this.whale.update( dt, this.camera );
			this.whaleWater.update( this.whale, dt, this.spray );

		}

		if ( this.fish ) {

			this.fish.viewHeight = this.renderer.domElement.height;
			this.fish.update( dt, this.camera.position );
			this.fish.cull( this.camera );

		}
		if ( this.snow ) this.snow.update( this.camera, under, this.renderer.domElement.height, this.localLights && this.localLights.flashlight );
		this.vegetation.update( dt, this.camera );
		if ( this.wildlife ) {

			this.wildlife.viewHeight = this.renderer.domElement.height;
			this.wildlife.update( dt, this.camera, this.player );

		}
		this.boatSpray.update( dt );
		this.spray.update( dt, this.camera, this.renderer.domElement.height );
		if ( this.motes ) this.motes.update( dt, this.camera, this.cameraWaterHeight, this.renderer.domElement.height );
		this.water.detail.update( dt );
		this.water.update( this.camera );
		this.boat.update( dt );
		this.boatLamps.set( { underway: this.boatCtl.driven || ! this.boatCtl.moored, spot: this.searchlight } );
		this.localLights.update( this.camera, dt );
		this.wake.update( dt );
		this.updateAudio( dt );

		// ---- render
		if ( this.nearDetail ) this.updateNearDetail();
		this.renderer.toneMappingExposure = s.exposure * this.sky.adaptation;
		// (while the catch card is up its fish portrait is drawn in place of the world: FishPortrait)
		const portrait = this.game && this.game.portrait;
		if ( portrait && portrait.active ) portrait.render( this.renderer, () => this.drawWorld() );
		else this.drawWorld();

		this.touch.update( this.player, this.game );
		this.hud.update( dt, { player: this.player, device: input.lastDevice } );
		// the HUD makes room for the touch controls while they're shown (game-ui.css, style.css); its
		// wording follows the input last used (a keyboard on a tablet, say)
		const html = document.documentElement;
		if ( html.classList.contains( 'is-touch' ) !== this.touch.active ) html.classList.toggle( 'is-touch', this.touch.active );
		input.endFrame();

	}

	// WebGL drawn on the CPU: a frame begins only once the last one has been drawn (asked without
	// waiting; its time is carried over meanwhile), and never straight after one, so the page answers
	// in between (showing a frame holds it up for as long as the frame took to draw). Left to queue up
	// there, frames come slower, and the page stops answering while the queue drains, for many seconds;
	// waiting for each frame instead would leave the page no time to answer either
	// a few seconds between the stages after the start on a device that draws on its CPU: the page's
	// thread is mostly idle while frames are drawn, and the garbage collector catches up then (so the
	// stages' garbage doesn't pile up: script memory); none with a graphics card
	pause( ms = 3000 ) {

		return this.cpuGL ? new Promise( ( resolve ) => setTimeout( resolve, ms ) ) : Promise.resolve();

	}

	// (CPU WebGL) waits for the garbage of the loading so far to be collected before the next big
	// stage: until the script heap falls back from its high point (where the browser reports it; a
	// pause where it doesn't), at least 3 s, at most `ms`. All the Spaces' checks measure its peak
	settle( ms = 15000 ) {

		performance.mark( 'world: settle' );
		const mem = performance.memory;
		if ( ! this.cpuGL ) return Promise.resolve();
		if ( ! mem ) return this.pause();
		return new Promise( ( resolve ) => {

			const t0 = performance.now();
			let high = mem.usedJSHeapSize;
			const tick = () => {

				const used = mem.usedJSHeapSize, t = performance.now() - t0;
				high = Math.max( high, used );
				if ( ( t > 3000 && used < high * 0.75 ) || t > ms ) resolve();
				else setTimeout( tick, 250 );

			};

			setTimeout( tick, 250 );

		} );

	}

	// A promise that resolves at the start of a frame that draws nothing else, for the plants' bakes:
	// All the Spaces' checks count every triangle drawn between two frames as one frame's, and a
	// bake with the world came to over the low tier's 300k. (Before the loop runs: the next task.)
	frameSlot() {

		if ( ! this._started ) return new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
		return new Promise( ( resolve ) => this._slots.push( resolve ) );

	}

	pacedFrame( dt ) {

		const gl = this.renderer.getContext();
		if ( this._drawn ) {

			if ( this._rest || gl.clientWaitSync( this._drawn, 0, 0 ) === gl.TIMEOUT_EXPIRED ) {

				this._rest = false;
				this._owed += dt;
				return;

			}

			gl.deleteSync( this._drawn );

		}

		// (whenever the stage has sized the canvas again)
		const canvas = this.renderer.domElement;
		if ( canvas.width * canvas.height > CPU_PIXELS * 1.05 ) this.fitCpuPixels();
		this.revealLate();
		this.frame( Math.min( 0.1, dt + this._owed ) );
		this._owed = 0;
		this._drawn = gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 );
		this._rest = true;
		gl.flush();

	}

	// (WebGL drawn on the CPU) the geometry of the parts held back from the loading frame goes to the
	// GPU while loading all the same, drawn once into a 1×1 target in a plain material (all of it:
	// culling and the near detail's hiding off): their CPU copies are freed then (ReleaseAfterUpload),
	// not after the start on top of the plants being made
	uploadLate() {

		const r = this.renderer, scene = this.scene;
		const target = new THREE.WebGLRenderTarget( 1, 1 ), plain = new THREE.MeshBasicMaterial();
		const restore = [];
		for ( const group of this._late ) for ( const root of group ) {

			root.traverse( ( o ) => {

				restore.push( [ o, o.visible, o.frustumCulled ] );
				o.visible = true;
				o.frustumCulled = false;

			} );

		}

		scene.overrideMaterial = plain;
		r.setRenderTarget( target );
		r.render( scene, this.camera );
		r.setRenderTarget( null );
		scene.overrideMaterial = null;
		for ( const [ o, visible, culled ] of restore ) {

			o.visible = visible;
			o.frustumCulled = culled;

		}

		for ( const group of this._late ) for ( const root of group ) root.visible = false;
		target.dispose();
		plain.dispose();

	}

	// (WebGL drawn on the CPU) the parts held back from the loading frame, a group per drawn frame
	revealLate() {

		const group = this._late && this._late.shift();
		if ( group ) for ( const o of group ) o.visible = true;
		else if ( this._late ) {

			this._late = null;
			if ( this._revealed ) this._revealed();

		}

	}

	// shaders not needed at the start, compiled and first used after it: the catch card's fish portrait
	// (its studio light and the blurred backdrop), the other players' figures, and on a device that
	// draws on its CPU the rod and its line and the skinned fish (held back while loading: every
	// shader compiled then is load time)
	async prepareLate() {

		if ( ! this.game ) return;
		const r = this.renderer, rod = this.game.rod;
		await this.game.portrait.compile( r, this.scene.environment );
		await this.together.compile( r, this.camera, this.scene );
		if ( ! this.boatLamps.group.parent ) {

			this.boat.group.add( this.boatLamps.group );
			await r.compileAsync( this.boatLamps.group, this.camera, this.scene );

		}
		if ( rod.holdBack ) {

			for ( const m of [ rod.rodMesh, rod.lineMesh, rod.bobberMesh ] ) {

				const was = m.visible;
				m.visible = true;
				await r.compileAsync( m, this.camera, this.scene );
				m.visible = was;

			}

			rod.holdBack = false;

		}

		for ( const [ m, parent ] of this._heldFish || [] ) {

			await r.compileAsync( m, this.camera, this.scene );
			parent.add( m );

		}

		this._heldFish = null;

		for ( const p of r.info.programs ) {

			p.getUniforms();
			p.getAttributes();

		}

	}

	// Joe and Marta, animated (Character.js), after the start: two models of a few MB with shaders of
	// their own. Low-powered devices get their textures at 512² rather than 1024² (-512.glb). Each is
	// readied before it's drawn: its shaders compiled and first used, its textures uploaded (on a
	// device that draws on its CPU a shader's first use waits for all the drawing queued before it).
	async loadCharacters() {

		if ( ! this.game ) return;
		performance.mark( 'world: characters' );
		const loader = gltfLoader(), r = this.renderer;
		const load = async ( url, clips = null ) => {

			const c = new Character( await loader.loadAsync( this.tier === 'low' ? url.replace( /\.glb$/, '-512.glb' ) : url ), { clips } );
			this.lightUp( c.group );
			for ( const t of c.textures() ) r.initTexture( t );
			await r.compileAsync( c.group, this.camera, this.scene );
			for ( const p of r.info.programs ) {

				p.getUniforms();
				p.getAttributes();

			}

			return c;

		};

		for ( const v of this.game.vendors ) {

			try {

				const c = await v.loadCharacter( load );
				// (low-powered devices: only near the camera, like the stand-in)
				if ( c && this.nearDetail ) c.group.traverse( ( o ) => {

					if ( ! o.isMesh ) return;
					if ( ! o.geometry.boundingSphere ) o.geometry.computeBoundingSphere();
					this.nearDetail.push( { o, dist: 60 } );

				} );

			} catch ( e ) {

				console.warn( `${ v.name }: the character didn't load; the stand-in stays`, e );

			}

		}

	}

	// the local lights (night) in every lit material under `root`: Lambert only (cheap) for the ground,
	// the rocks and the plants, and on low-powered devices everywhere but the boat (the full BRDF: wet
	// wood and metal glinting under the lamps). Not the sea (its own shading). (With a graphics card
	// the plants are lit during loading, before the boat exists.)
	lightUp( root ) {

		const lit = this._lit || ( this._lit = new WeakSet() );
		const cheapRoots = [ this.terrain.mesh, this.rocks.group, this.vegetation.group, this.debris && this.debris.group ];
		const boat = this.boat ? this.boat.group : null;
		const visit = ( o, cheap ) => {

			if ( cheapRoots.includes( o ) ) cheap = true;
			else if ( o === boat ) cheap = false;
			if ( o.isMesh ) for ( const m of [ o.material ].flat() ) {

				if ( ! m || lit.has( m ) || ! ( m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial ) ) continue;
				if ( m.name === 'Water' || m.name === 'fishingLine' ) continue;
				lit.add( m );
				useLocalLights( m, { cheap } );

			}

			for ( const c of o.children ) visit( c, cheap );

		};
		visit( root, this.tier === 'low' );

	}

	// the island's animals (after the plants: hermit crabs live by the palms; the ghost crabs' burrows
	// need the sand mask, freed afterwards): gulls, terns, pelicans, frigatebirds and sanderlings,
	// ghost and hermit crabs (wildlife/). Their shaders are compiled and first used here, not mid-game
	async lifeArrives() {

		if ( this.wildlife ) return;
		performance.mark( 'world: life' );
		this.wildlife = new Wildlife( {
			scene: this.scene, terrain: this.terrainData, shore: this.shore, village: this.village, colliders: this.colliders,
			vegetation: this.vegetation, boat: this.boatCtl, boatModel: this.boat, query: this.query, spray: this.spray,
			// (mid: its triangles are mostly spent on the island already)
			castShadow: this.tier === 'high',
		} );
		// (birds and crabs smaller than this many pixels aren't drawn)
		this.wildlife.minPx = this.tier === 'low' ? 1.5 : 0.75;
		const meshes = [ this.wildlife.birdBatch.mesh, this.wildlife.birdBatch.farMesh, this.wildlife.critterBatch.mesh, this.wildlife.critterBatch.farMesh, this.wildlife.blobs.mesh ];
		for ( const m of meshes ) await this.readyToDraw( m );
		// the spray's shader too (the birds dive): drawn once, empty, in a frame of its own
		const spray = this.spray.mesh;
		spray.visible = true;
		await this.readyToDraw( spray, () => {

			spray.visible = false;

		} );
		await this.firstDraws( [ spray ] );

	}

	// the beach debris and the village's clutter (world/Debris.js, made in a worker; after the plants
	// and the rocks, kept clear of their trunks; it reads the island's masks, freed afterwards)
	async debrisLands() {

		if ( this.debris ) return;
		performance.mark( 'world: debris' );
		this.debris = await Debris.create( {
			scene: this.scene, terrain: this.terrainData, ground: this.terrain, village: this.village, vegetation: this.vegetation,
			rocks: this.rocks, colliders: this.colliders, tier: this.tier, loader: gltfLoader(), show: false,
		} );
		// (the areas out of range are hidden at once: frames go on while the shaders compile)
		await this.readyToDraw( this.debris.group, () => this.debris.update( this.camera ) );

	}

	// the reef (world/Reef.js, laid out in a worker; it reads the island's seagrass mask): its
	// shaders readied with its meshes shown for the compile (they're hidden until the culling picks
	// them); the swimmer then climbs over it
	async reefGrows() {

		if ( this.reef ) return;
		performance.mark( 'world: reef' );
		const reef = await Reef.create( { scene: this.scene, terrain: this.terrainData, ground: this.terrain, tier: this.tier, data: this._reefLayout } );
		this._reefLayout = null;
		this._reefLaid = true; // (the seagrass mask may go: releaseMasks)
		this.releaseMasks();
		reef.shadowsFrom( this.sky.sun );
		const meshes = [];
		reef.group.traverse( ( o ) => o.isMesh && meshes.push( o ) );
		for ( const m of meshes ) m.visible = true;
		await this.readyToDraw( reef.group, () => {

			for ( const m of meshes ) m.visible = false;

		} );
		await this.firstDraws( [ reef.batches.hard, reef.batches.soft ].map( ( b ) => b.meshes.find( ( m ) => m.layers.isEnabled( 0 ) ) ) );
		this.reef = reef;
		this.player.reef = reef;
		await this.pause();
		await this.fishSwim();

	}

	// the reef's fish, the bait ball, the rays and the turtle, the bay's tarpon, jacks, mullet and fry,
	// the pier's snappers and grunts (world/Fish.js): they keep to the reef's floor and its coral heads
	async fishSwim() {

		if ( this.fish || ! this.reef ) return;
		performance.mark( 'world: fish' );
		const reef = this.reef;
		const fish = new FishSchools( {
			parent: this.scene, terrain: this.terrainData, ground: this.terrain, tier: this.tier,
			floorAt: ( x, z ) => reef.floorHeightAt( x, z ), center: WORLD.reef.center, radius: WORLD.reef.radius + 10,
			anchors: reef.anchors, shoreField: this.shoreField,
		} );
		// (their models are made in a worker: fish/FishModels.js)
		fish.setModels( await fishModelsAsync( fish.modelNames ) );
		for ( const m of fish.batch.meshes ) m.visible = true;
		await this.readyToDraw( fish.group, () => {

			for ( const m of fish.batch.meshes ) m.visible = false;

		} );
		await this.firstDraws( [ fish.batch.meshes[ 0 ] ] );
		this.fish = fish;
		fish.spray = this.spray; // (leaping mullet)
		await this.pause();
		// and the specks drifting in the water around the swimmer (fx/MarineSnow.js)
		const snow = new MarineSnow( { waves: this.waves, tier: this.tier } );
		this.scene.add( snow.mesh );
		snow.mesh.visible = true;
		await this.readyToDraw( snow.mesh, () => {

			snow.mesh.visible = false;

		} );
		await this.firstDraws( [ snow.mesh ] );
		this.snow = snow;

	}

	// the humpback (world/marine/Whale.js): its loop through the bay, its breaths at the surface in
	// view of the beach and the pier, its dives; its marks on the water (ocean/WhaleWater.js) and
	// the pilot fish around it. After the start everywhere (its model and maps are 1-5 MB), drawn
	// once its maps are up and its shader is ready
	async whaleArrives() {

		if ( this.whale ) return;
		performance.mark( 'world: whale' );
		const whale = new Whale( { scene: this.scene, terrain: this.terrainData, ground: this.terrain, query: this.query, spray: this.spray, tier: this.tier } );
		try {

			await whale.load();

		} catch ( e ) {

			console.warn( 'the whale did not load', e );
			return;

		}

		const meshes = whale.meshes.filter( Boolean );
		for ( const t of [ whale.albedoTex, whale.heightTex ] ) this.renderer.initTexture( t );
		for ( const m of meshes ) m.visible = true;
		await this.readyToDraw( whale.group, () => {

			for ( const m of meshes ) m.visible = false;

		} );
		await this.firstDraws( [ meshes[ meshes.length - 1 ] ] );
		this.whale = whale;
		this.whaleWater = new WhaleWater();
		if ( this.fish ) this.fish.setWhale( whale );

	}

	// specks in the air around the camera, lit when the sun shines through them: dust and pollen, salt
	// near the surf, seed tufts, gnats over the plants (fx/AirMotes.js). Not on low-powered devices
	async airArrives() {

		if ( this.motes || this.tier === 'low' ) return;
		const motes = new AirMotes( { terrain: this.terrain, tier: this.tier } );
		this.scene.add( motes.mesh );
		await this.readyToDraw( motes.mesh );
		await this.firstDraws( [ motes.mesh ] );
		this.motes = motes;

	}

	// the photoscanned logs, branches and shells (debris/ScannedDebris.js), after Joe and Marta (their
	// loading's garbage and theirs don't pile up), drawn once their shaders are ready
	async scansArrive() {

		const scanned = this.debris && this.debris.scanned;
		if ( ! scanned || scanned.promise ) return;
		try {

			await scanned.load();
			performance.mark( 'world: scans' );
			for ( const t of scanned.textures || [] ) this.renderer.initTexture( t );
			await this.readyToDraw( this.debris.group );
			scanned.show();

		} catch ( e ) {

			console.warn( 'the scanned debris did not load', e );

		}

	}

	// lit (lightUp), its shaders compiled and their uniforms and attributes looked up. then: called once
	// the programs are made (compileAsync makes them at once, then waits for them to finish)
	async readyToDraw( root, then = null ) {

		const r = this.renderer;
		this.lightUp( root );
		const compiled = r.compileAsync( root, this.camera, this.scene );
		if ( then ) then();
		await compiled;
		for ( const p of r.info.programs ) {

			p.getUniforms();
			p.getAttributes();

		}

	}

	// the plants: scattered over the island, built and baked (in slices)
	async plantsGrow() {

		await this.vegetation.init();
		this.lightUp( this.vegetation.group );

	}

	// the animals and the debris: after the plants, the sea and the boat (the birds perch on it, the
	// sanderlings follow the swash), and before the island's masks are freed. With a graphics card at
	// the end of loading, on a device that draws on its CPU after the start (start())
	async lifeAndDebris() {

		await this.lifeArrives();
		await this.pause();
		await this.debrisLands();
		// (with a graphics card the reef and its fish too; drawn on the CPU, they come last: start())
		if ( ! this.cpuGL ) await this.reefGrows();
		this._plantsGrown = true;
		this.releaseMasks();

	}

	// the island's masks are read only while it's being made (the ground's maps, the rocks and the
	// plants placed on it) and by the minimap's picture of it; then only its heights are
	releaseMasks() {

		const T = this.terrainData;
		if ( ! this._plantsGrown || ! this.game || ! this.game.minimap || ! this.game.minimap._bake.done ) return;
		if ( T.rock !== null ) for ( const k of [ 'rock', 'sand', 'path', 'gully', 'rubble', 'scarp' ] ) T[ k ] = null;
		// (the seagrass meadows: once the reef is laid out on them)
		if ( this._reefLaid ) T.seagrass = null;

	}

	// the soundscape follows the camera, the shore, the wind, the time of day and the boat
	updateAudio( dt ) {

		const a = this.audio;
		if ( ! a.enabled ) return;
		const cam = this.camera, p = cam.position;
		cam.getWorldDirection( _fwd );
		_up.set( 0, 1, 0 ).applyQuaternion( cam.quaternion );
		const h = this.cameraWaterHeight ?? 0;
		const coast = this.terrainData.coastDistance( p.x, p.z ).d;
		const amp = this.shore.params.amplitude, pier = WORLD.pier, boat = this.boatCtl;
		// (the boat you hear: yours, or the one you ride in, or someone's going by: together/)
		const theirs = this.together ? this.together.boatSound() : null;
		const engine = theirs ? theirs.active : boat.driven;
		if ( engine !== this._engineHeard ) {

			if ( engine ) a.engineStart();
			else if ( this._engineHeard !== undefined ) a.engineStop();
			this._engineHeard = engine;

		}

		a.update( dt, {
			listener: { position: p, forward: _fwd, up: _up },
			underwater: p.y < h ? 1 : 0,
			depthBelowSurface: Math.max( 0, h - p.y ),
			surfIntensity: Math.min( 1, amp / 0.6 ),
			distanceToShore: Math.abs( coast ),
			coastDistance: coast,
			waveHeight: amp * 2,
			windSpeed: G.windSpeed.value,
			windDir: G.windDir.value,
			daylight: 1 - G.night.value,
			nearPier: Math.abs( p.x - pier.x ) < 12 && p.z > pier.zStart - 5 && p.z < pier.zEnd + 8,
			boat: theirs ? { active: theirs.active, rpm: theirs.rpm, speed: theirs.speed, position: theirs.position, listenerInside: false } : {
				active: boat.driven, rpm: boat.rpm, throttle: boat.throttle, speed: boat.velocity.length(),
				position: this.boat.group.position, listenerInside: this.player.mode === 'boat' && this.player.camMode === 'first',
			},
		} );

	}

	// the canvas's resolution follows how long frames take (this.resolution), from the stage's for the
	// screen (which it sets again when the screen turns or resizes)
	adaptResolution() {

		const now = performance.now(), ms = this._lastTick ? now - this._lastTick : 0;
		this._lastTick = now;
		const r = this.renderer, ratio = r.getPixelRatio();
		if ( ratio !== this._ratio ) this._fullRatio = ratio; // the stage sized it again
		if ( ms > 0 && now > this._settleAt ) this.resolution.frame( ms, now );
		const want = this._fullRatio * this.resolution.scale;
		if ( Math.abs( want - ratio ) > 1e-4 ) r.setPixelRatio( want );
		this._ratio = r.getPixelRatio();

	}

	// WebGL drawn on the CPU: the canvas's resolution brought down to CPU_PIXELS (the stage sizes it
	// for the screen; its dynamic resolution doesn't see paced frames)
	fitCpuPixels() {

		const r = this.renderer, size = r.getSize( _size ), ratio = r.getPixelRatio();
		const pixels = size.x * size.y * ratio * ratio;
		if ( pixels > CPU_PIXELS ) r.setPixelRatio( ratio * Math.sqrt( CPU_PIXELS / pixels ) );

	}

	// low-powered devices: small detail (the boat's fittings and gear, the stalls) only near the camera,
	// for their triangle budget
	updateNearDetail() {

		const cam = this.camera.position;
		for ( const d of this.nearDetail ) {

			const s = d.o.geometry.boundingSphere;
			_c3.copy( s.center ).applyMatrix4( d.o.matrixWorld );
			d.o.visible = _c3.distanceTo( cam ) - s.radius * d.o.matrixWorld.getMaxScaleOnAxis() < d.dist;

		}

	}

	drawWorld() {

		// a program's first draw (firstDraws): its mesh shown for this frame, one instance
		const first = this._firsts.shift();
		let was = null;
		if ( first ) {

			const m = first.mesh, g = m.geometry;
			was = [ m.visible, g.instanceCount ];
			m.visible = true;
			if ( g.isInstancedBufferGeometry ) g.instanceCount = 1;

		}

		if ( this.post ) this.post.render();
		else this.renderer.render( this.scene, this.camera );
		if ( first ) {

			first.mesh.visible = was[ 0 ];
			first.mesh.geometry.instanceCount = was[ 1 ];
			first.resolve();

		}

	}

	// (CPU WebGL) where a program is first drawn the driver builds its pipeline: seconds each on
	// SwiftShader, and those of things that come into view together stack into one long freeze.
	// So each mesh here (one per new program, compiled already: readyToDraw) is drawn once, one
	// instance, in a frame of the next few of its own. Resolves once all are drawn
	firstDraws( meshes ) {

		if ( ! this.cpuGL || ! this._started ) return Promise.resolve();
		return Promise.all( meshes.map( ( mesh ) => new Promise( ( resolve ) => this._firsts.push( { mesh, resolve } ) ) ) );

	}

	// T: let the day run (about 8 minutes per day) or stop it, for everyone here
	toggleTime() {

		const s = this.settings;
		if ( s.timeSpeed !== 0 ) {

			this._timeSpeed = s.timeSpeed;
			s.timeSpeed = 0;

		} else {

			s.timeSpeed = this._timeSpeed || 0.05;

		}

		// (for everyone on the island: one clock)
		if ( this.together ) this.together.setClock( s.timeOfDay, s.timeSpeed );
		this.hud.toast( s.timeSpeed !== 0 ? 'Time running' : 'Time paused' );

	}

}

// drawsOnCpu, asked of a throwaway context (let go of straight away)
function probeCpuGL() {

	const gl = document.createElement( 'canvas' ).getContext( 'webgl2' );
	if ( ! gl ) return false;
	const cpu = drawsOnCpu( gl );
	gl.getExtension( 'WEBGL_lose_context' )?.loseContext();
	return cpu;

}

// whether WebGL draws on the CPU here (SwiftShader, llvmpipe, Microsoft's basic renderer)
function drawsOnCpu( gl ) {

	let name = gl.getParameter( gl.RENDERER ) || '';
	// (Chrome names only "WebKit WebGL" there)
	if ( /webkit webgl/i.test( name ) ) {

		const info = gl.getExtension( 'WEBGL_debug_renderer_info' );
		if ( info ) name = gl.getParameter( info.UNMASKED_RENDERER_WEBGL ) || name;

	}

	return /swiftshader|llvmpipe|softpipe|software|basic render/i.test( name );

}

function saveErrorText( e ) {

	if ( e && e.name === 'BridgeError' && e.code === 'too-big' ) return 'Couldn\'t save: too much to keep';
	if ( e && /newer version|somewhere else/.test( e.message ) ) return 'Your progress was saved on another device. Rejoin to carry on.';
	return 'Couldn\'t save just now';

}
