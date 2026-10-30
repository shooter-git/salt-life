import * as THREE from './engine/index.js';
import './materials/HeightHaze.js'; // (three's fog chunks: before anything is compiled)
import { viewShadows } from './materials/ViewShadows.js'; // ((M15) and its shadows' chunk)
import { createStage, gltfLoader } from '@allthespaces/portal/three';
import { ResolutionGovernor } from '@allthespaces/portal/resolution';
import { G } from './core/Globals.js';
import { Input } from './core/Input.js';
import { SaveStore } from './core/SaveStore.js';
import { TerrainData } from './world/TerrainData.js';
import { decodeIsland } from './world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from './world/terrain/Offshore.js';
import { setDetailData } from './world/terrain/DetailTextures.js';
import { WORLD } from './world/WorldLayout.js';
import { Colliders } from './world/Colliders.js';
import { Village } from './world/Village.js';
import { CoverMap, COVER, surroundings } from './world/Cover.js';
import { RockCover } from './world/RockCover.js';
import { Terrain } from './world/Terrain.js';
import { Rocks } from './world/Rocks.js';
import { Vegetation } from './world/Vegetation.js';
import { BoatModel } from './world/BoatModel.js';
import { Sky } from './sky/Sky.js';
import { Waves, SWELL_WEST } from './ocean/Waves.js';
import { WaterQuery } from './ocean/WaterQuery.js';
import { WaterSurface } from './ocean/WaterSurface.js';
import { ShoreWaves, FAIR_AMPLITUDE } from './ocean/ShoreWaves.js';
import { SEABED } from './world/terrain/SeabedModel.js';
import { findsAbout } from './game/Finds.js';
import { Flotsam } from './world/Flotsam.js';
import { computeShoreField, fieldGround, shelter } from './world/ShoreField.js';
import ShoreWorker from './world/shore/ShoreWorker.js?worker&inline';
import { classicWorker } from './core/ClassicWorker.js';
import { Player } from './player/Player.js';
import { BoatController } from './player/BoatController.js';
import { GameState } from './game/GameState.js';
import { DAY_RATE, START_HOUR, advance } from './game/IslandClock.js';
import { islandTime, isPick, NORTH, weatherAt, towardOf, hurricaneNews } from './game/Weather.js';
import { BACK_MS, awayClock, awayOf, boatLeft, cleanBoats, leftOf, tellOf, withRecord } from './game/Away.js';
import { WeatherDriver } from './world/WeatherDriver.js';
import { lampsLit } from './game/Bites.js';
import { FishStand, STAND } from './game/FishStand.js';
import { Chandlery, CHANDLERY } from './game/Chandlery.js';
import { LocalLights, addBoatLights, addVillageLights, useLocalLights, holdLocalLights } from './materials/LocalLights.js';
import { cloudShadows, useCloudShadows } from './materials/CloudShadows.js';
import { useWet, wetSurfaces } from './materials/Wet.js';
import { useGroundBounce } from './materials/GroundBounce.js';
import { Wildlife } from './world/wildlife/Wildlife.js';
import { wildlifeMood, wildlifeNews } from './game/WildlifeWeather.js';
import { damageAt } from './game/StormDamage.js';
import { StormWrack } from './world/debris/StormWrack.js';
import { Beachcombing } from './world/Beachcombing.js';
import { FlyingSheets } from './world/debris/FlyingSheets.js';
import { vegUniforms } from './world/vegetation/VegNodes.js';
import { Debris } from './world/Debris.js';
import { Reef } from './world/Reef.js';
import { Lighthouse } from './world/Lighthouse.js';
import { HarbourLights } from './world/HarbourLights.js';
import { Wreck } from './world/Wreck.js';
import { NestingTurtles } from './world/NestingTurtles.js';
import { FarIsland } from './world/FarIsland.js';
import { wreckSpots } from './world/wreck/WreckPlan.js';
import { ReefLayout } from './world/reef/ReefLayout.js';
import { FishSchools } from './world/Fish.js';
import { fishModelsAsync } from './world/fish/FishModelsAsync.js';
import { MarineSnow } from './fx/MarineSnow.js';
import { Whale } from './world/marine/Whale.js';
import { Spray } from './fx/Spray.js';
import { StormSpray } from './fx/StormSpray.js';
import { WhitecapSpray } from './fx/WhitecapSpray.js';
import { FlyingDebris } from './fx/FlyingDebris.js';
import { BlownLitter } from './fx/BlownLitter.js';
import { insideRoom, roomMatrix } from './world/village/StormPlaces.js';
import { AirMotes } from './fx/AirMotes.js';
import { Rain } from './fx/Rain.js';
import { Drips, eavePoints, palmPoints, wheelhousePoints } from './fx/Drips.js';
import { BoatInstruments } from './world/boat/Instruments.js';
import { BoatRadar } from './world/boat/Radar.js';
import { Lightning } from './sky/Lightning.js';
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
import { FLOOD_L } from './game/Hull.js';
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
// (M15) the seabed past the island: 32 m, or 64 m on low-powered devices
const SEABED_BIN = { low: 'world/offshore-512.bin', mid: 'world/offshore.bin', high: 'world/offshore.bin' };
// (M15) the bank's waves: its shore field's square (m, about its middle) and cells a side (14 m; 28 on low),
// solved once you're this near it (m)
const BANK = { size: 7168, res: { low: 256, mid: 512, high: 512 }, near: 9000 };
// (M15) how far about you what's found out there is looked for (m), and how near the bait the birds work has
// to be
const FIND_RANGE = 3000, FIND_BIRDS = 2500;
// (M15) the sand that isn't rock, 0..255 at 4 m texels (the average of the island's 1 m or 2 m masks over each),
// for the bites once the masks are let go: { data, res, texel, origin }
function beachMask( T ) {

	const k = Math.max( 1, Math.round( 4 / T.texel ) ), res = Math.floor( T.res / k ), data = new Uint8Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		let a = 0;
		for ( let b = 0; b < k; b ++ ) for ( let c = 0; c < k; c ++ ) {

			const m = ( j * k + b ) * T.res + i * k + c;
			a += T.sand[ m ] * ( 1 - T.rock[ m ] );

		}

		data[ j * res + i ] = Math.round( a / ( k * k ) );

	}

	return { data, res, texel: T.texel * k, origin: T.origin };

}

// (M15) a square window of one of the island's masks, `half` m about c: { i0, j0, w, h, data } (in its texels)
function maskWindow( T, mask, c, half ) {

	const i0 = Math.max( 0, Math.floor( ( c.x - half - T.origin ) / T.texel ) ), j0 = Math.max( 0, Math.floor( ( c.z - half - T.origin ) / T.texel ) );
	const w = Math.min( T.res - i0, Math.ceil( 2 * half / T.texel ) ), h = Math.min( T.res - j0, Math.ceil( 2 * half / T.texel ) ), data = new Uint8Array( w * h );
	for ( let j = 0; j < h; j ++ ) data.set( mask.subarray( ( j0 + j ) * T.res + i0, ( j0 + j ) * T.res + i0 + w ), j * w );
	return { i0, j0, w, h, data };

}

// (M15) the windward reef (WORLD.northReef): laid out once you're within `near` m of it; on low, let go again
// past `far` (its 13 MB: the low tier's memory)
const NORTH_REEF = { near: 450, far: 800 };
// WebGL drawn on the CPU draws at most a phone screen's pixels (a laptop's is three times as many)
const CPU_PIXELS = 360_000;
const LENS_REACH = 0.02; // m below the surface before the view counts as under water
const UNDERWATER = new THREE.Color( 0.03, 0.17, 0.2 );
// (M10) the water a blow's stirred up: green-grey with silt, and the distance you see in it at its murkiest (m)
const SILT = new THREE.Color( 0.07, 0.12, 0.09 );
const MURK_FAR = 11;
// (M13) a hurricane's surge gets a shore field of its own when it rises past this (m), solved once it's
// watched for (or warned of), or near (m from its eye)
const SURGE_FIELD_FROM = 0.15, SURGE_FIELD_NEAR = 400000;
// (M13) a hurricane's spray in the air thins inland: from this far from the shore (m) to this, by this share
const SPRAY_INLAND = [ 20, 160, 0.55 ];
// how much a sheet of rain driving past thickens the air (of its haze: the sheets' mean is 3/8)
const SHEET_HAZE = 0.8;
const smoothstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
const _c = new THREE.Color();
const _c3 = new THREE.Vector3();
const _size = new THREE.Vector2();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _hornAt = new THREE.Vector3( - 0.42, 3.4, 1.15 ); // (the boat's horn, if its model doesn't say)
const _shelter = new THREE.Matrix4(), _c4 = new THREE.Matrix4(); // (M9: the wheelhouse roof over the rain)
const _ride = new THREE.Matrix4(), _one = new THREE.Vector3( 1, 1, 1 ); // (riding along: the boat you're on)
const _fwdB = new THREE.Vector3(); // (M11: her heading, for her instruments)
// what starts the sound: browsers allow it only after one of these
const GESTURES = [ 'pointerdown', 'touchend', 'click', 'keydown' ];

export class App {

	constructor( portal ) {

		this.portal = portal;
		// ?tier=low|mid|high tries another device tier when running on its own (pnpm dev)
		const asked = portal.standalone && new URLSearchParams( location.search ).get( 'tier' );
		this.tier = [ 'low', 'mid', 'high' ].includes( asked ) ? asked : portal.tier;
		this.settings = {
			// (Salt Life) the island's clock (game/IslandClock.js): the hour and the day, running at
			// timeSpeed game hours a real second by day (0: held). Yours from the save until a session
			// shares one (together/)
			timeOfDay: START_HOUR,
			day: 1,
			sunAzimuth: 0, // degrees: turns the sun's daily path about the vertical
			timeSpeed: DAY_RATE,
			exposure: 0.55,
			// (Salt Life) the weather you picked on your own (an id from game/Weather.js), or null: the day's
			weather: null,
			// (M13) when you picked it (island time: a hurricane of your own passes from then)
			weatherSince: 0,
		};
		this._clockSaveT = 0;

	}

	async init( progress = async () => {} ) {

		const portal = this.portal, tier = this.tier;

		// ---------------------------------------------------------------- saves and the island
		await progress( 0.05, 'Fetching the island' );
		this.store = new SaveStore( portal, { onError: ( e ) => this.hud && this.hud.toast( saveErrorText( e ) ) } );
		const fetched = ( url ) => fetch( url ).then( ( r ) => {

			if ( ! r.ok ) throw new Error( `${ r.url }: ${ r.status }` );
			return r.arrayBuffer();

		} );
		const [ bytes, detail, seabed ] = await Promise.all( [
			// low-powered devices get the island at 2 m (a quarter of the memory), as their ground is drawn
			fetched( ISLAND[ tier ] ?? ISLAND.low ),
			fetched( 'world/detail.bin' ),
			fetched( SEABED_BIN[ tier ] ?? SEABED_BIN.low ),
			this.store.load(),
			// ((M15) the group's anchored boats, yours among them: pickUp)
			portal.save.shared.get( 'boats' ).catch( () => null ).then( ( boats ) => this._boatsRead = boats ),
		] );
		setDetailData( new Uint8Array( detail ) );
		this.state = new GameState( this.store );
		this.state.load(); // (the save was read above: money, the cooler, the log, upgrades, fuel)
		this.loadClock();

		await progress( 0.25, 'Shaping the island' );
		this.terrainData = new TerrainData( 7, decodeIsland( new Uint8Array( bytes ) ), { offshore: new Offshore( decodeSeabed( new Uint8Array( seabed ) ) ) } );

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
		this._uses = []; // programs waiting for their first use, with no frame being drawn (useNewPrograms)
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
		// (high) the clouds' shadows on the island and the sea: lightUp gives them to the lit materials,
		// so before anything is lit (with a graphics card the plants are lit early in loading)
		this.cloudShadows = !! this.sky.clouds.shadowMap;
		if ( this.cloudShadows ) cloudShadows.attach( this.sky.clouds );
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
			// ((M15) and looked up about the camera: exact tens of km out, materials/ViewShadows)
			viewShadows( renderer );

		}

		// ---------------------------------------------------------------- island
		await progress( 0.5, 'Laying out the ground' );
		this.colliders = new Colliders();
		// the village flattens building pads into the heightmap: build it before the ground (whose
		// textures are made from the heights) and everything placed on it
		// (WebGL drawn on the CPU: its textures baked after the start, lateReady)
		this.village = new Village( { scene, terrain: this.terrainData, colliders: this.colliders, tier, smallBakes: this.cpuGL, bakeLater: this.cpuGL } );
		// ((M15) the lighthouse on the north-west headland: it levels its pad as the village does, before the
		// ground's drawn; the rocks and the plants keep off it as they do the village's buildings)
		this.lighthouse = new Lighthouse( { scene, terrain: this.terrainData, colliders: this.colliders } );
		this.village.footprints.push( ...this.lighthouse.footprints );
		// ((M15) and the bay's harbour lights: red to starboard coming in, green to port, white on the pier head)
		this.harbourLights = new HarbourLights( { scene, terrain: this.terrainData, colliders: this.colliders } );
		this.village.footprints.push( ...this.harbourLights.footprints );
		// ((M15) the wreck on the windward reef: a coaster broken in two on its crest)
		this.wreck = new Wreck( { scene, colliders: this.colliders } );
		// ((M15) the green turtles nesting on the north coast's turtle beach: world/NestingTurtles.js)
		this.turtles = new NestingTurtles( { scene, terrain: this.terrainData } );
		// ((M15) the island seen from far off, where its own ground isn't drawn: world/FarIsland.js)
		this.farIsland = new FarIsland( { scene, terrain: this.terrainData } );
		await this.village.init( renderer );
		// (M11) what covers the island from above (world/Cover.js): the pier, the boardwalks, the roofs, the
		// stalls; drawn once after the start (buildCover), nothing covers anything until then. The rain
		// stops on it, and what's wet in the rain stays dry under it (every wet material from now on)
		this.cover = new CoverMap();
		// ((M14) and the rocks about you, drawn as you go while it rains or anything's wet: world/RockCover.js)
		this.rockCover = new RockCover();
		wetSurfaces.under( this.cover, this.rockCover );
		// Joe's fish stand and Marta's chandlery (Tidewater's Game builds them; the fishing game isn't
		// ported yet): their scanned props load while the rest of the island is made
		this.stand = new FishStand( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		this.chandlery = new Chandlery( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		// ((M14) the sheets a hurricane tears off the roofs, Joe's, and Marta's sign, flying down the wind
		// as it was when each went (the same for everyone): world/debris/FlyingSheets)
		this.flyingSheets = new FlyingSheets( {
			scene, terrain: this.terrainData,
			windAt: ( T ) => {

				const w = weatherAt( T, this.weatherPick(), this.settings.weatherSince );
				return { wind: w.wind, toward: towardOf( w.windAngle ), surge: w.surge };

			},
			walls: this.village.buildings.filter( ( b ) => b.footprint && b.roofTop ).map( ( b ) => ( { x: b.x, z: b.z, r: ( b.footprint.r - 1 ) * 0.85, top: b.roofTop } ) ),
		} );
		this.flyingSheets.add( this.village.sheetFlyers() );
		this.stand.ready.then( () => this.flyingSheets.add( this.stand.sheetFlyers() ) );
		this.chandlery.ready.then( () => this.flyingSheets.add( this.chandlery.sheetFlyers() ) );
		this.terrain = new Terrain( { scene, terrainData: this.terrainData, tier } );
		uploadTextures( renderer, [ this.terrain.heightTexture, this.terrain.normalTexture, this.terrain.splatTexture ] );
		// boulders, blocks, talus and outcrops (shaded like the ground's rock)
		this.rocks = new Rocks( { scene, terrain: this.terrain, colliders: this.colliders, village: this.village, castShadow: tier !== 'low', lite: tier === 'low' } );
		this.vegetation = new Vegetation( { scene, terrain: this.terrainData, ground: this.terrain, renderer, tier, village: this.village, rocks: this.rocks, smallBakes: this.cpuGL, bakeSlot: () => this.frameSlot() } );
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
		this.water = new WaterSurface( { scene, waves: this.waves, terrain: this.terrain, shore: this.shore, cover: this.cover, rocks: this.rockCover, tier } );
		// (M15) what's found out there: the debris floating (game/Finds.js; the weed and the bait's boils are the
		// sea's own, the birds working it Wildlife's)
		this.flotsam = new Flotsam( { scene, waves: this.waves } );
		if ( this.cloudShadows ) useCloudShadows( this.water.material );

		// ---------------------------------------------------------------- boat and player
		await progress( 0.7, 'Mooring the boat' );
		this.boat = new BoatModel();
		// (M11) her instruments as they read (world/boat/Instruments.js): made now, so the dash's program is
		// made with the rest
		this.instruments = new BoatInstruments( { material: this.boat.materials.display, tier } );
		// ((M14) and her radar, on the dash's third screen: Radar.js)
		this.radar = new BoatRadar( { terrain: this.terrainData, seaLevel: () => G.seaLevel.value, size: tier === 'low' ? 150 : 300 } );
		this._radarBoats = [];
		scene.add( this.boat.group );
		this.boat.group.position.copy( WORLD.boatDock.position );
		this.boat.group.rotation.y = WORLD.boatDock.heading;
		this.boat.group.traverse( ( o ) => {

			if ( o.isMesh ) o.castShadow = o.castShadow && tier !== 'low';

		} );
		this.boatCtl = new BoatController( { model: this.boat, query: this.query, terrain: this.terrainData, colliders: this.colliders } );
		// (Salt Life) the weather: the day's, or the one picked on your own (game/Weather.js), on the wind,
		// the sea, the surf, the cloud and the light (set from the first frame on)
		this.weather = new WeatherDriver( { sky: this.sky, waves: this.waves, shore: this.shore, water: this.water, boat: this.boatCtl } );
		// (M9: she feels the gusts on the sea where she is)
		this.boatCtl.windAt = ( x, z ) => this.weather.windAt( x, z );
		this.wake = new Wake( { scene, boat: this.boatCtl, waves: this.waves, tier } );
		// spray (fx/Spray.js): off the boat's bow (and the slap of its hull on the water), the
		// whale's blows and breaches, leaping mullet, diving birds
		this.spray = new Spray( { waves: this.waves, terrain: this.terrainData, tier } );
		scene.add( this.spray.mesh );
		this.boatSpray = new BoatSpray( { boat: this.boatCtl, spray: this.spray } );
		// ((M13) and in a hurricane's wind, the spray torn off the sea)
		this.stormSpray = new StormSpray( { spray: this.spray, terrain: this.terrainData, waves: this.waves, tier } );
		// ((M14) and off the open sea's whitecaps near you, in any breeze)
		this.whitecapSpray = new WhitecapSpray( { spray: this.spray, caps: this.water.whitecaps, waves: this.waves, tier } );
		// (M9) the rain around the camera (fx/Rain.js), and the lightning (sky/Lightning.js: the strikes
		// everyone sees, their flash on the clouds and the island, the bolts, the thunder)
		this.rain = new Rain( { terrain: this.terrain, cover: this.cover, rocks: this.rockCover, tier } );
		scene.add( this.rain.mesh, this.rain.splash );
		// (M11) the drips (fx/Drips.js): off the wheelhouse roof from the start, the eaves and the palms once
		// the cover map's built (buildCover)
		this.drips = new Drips( { tier, flash: this.rain.flash } );
		this.drips.setBoat( wheelhousePoints( this.boat.lines ) );
		scene.add( this.drips.mesh );
		this.lightning = new Lightning( { scene, sky: this.sky } );
		// (its thunder, heard as it gets here)
		this.lightning.onThunder = ( strike, m, dir ) => {

			if ( this.audio ) this.audio.thunder( m, dir, strike.power );
			if ( this.wildlife ) this.wildlife.birds.thunder( m ); // ((M13) a near clap puts up the perched birds)

		};
		// ((M13) and what a hurricane's wind tears off and carries: fx/FlyingDebris.js)
		this.flying = new FlyingDebris( { terrain: this.terrain, tier } );
		this.flying.setRoom( roomMatrix( this.village.shelter && this.village.shelter.inside ) );
		scene.add( this.flying.mesh );
		// ((M14) and what a blow sets skittering along the ground: fx/BlownLitter.js)
		this.litter = new BlownLitter( { terrain: this.terrain, tier } );
		this.litter.setRoom( roomMatrix( this.village.shelter && this.village.shelter.inside ) );
		scene.add( this.litter.mesh );
		if ( tier === 'low' ) {

			this.nearDetail = [];
			// (the village's display fish, one mesh spanning the village, aren't built on these devices)
			this.stand.group?.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			this.chandlery.group?.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			for ( const k of [ 'fittings', 'wood', 'display', 'wheel', 'throttle', 'radar', 'propeller', 'rudder' ] ) if ( this.boat.meshes[ k ] ) this.nearDetail.push( { o: this.boat.meshes[ k ], dist: 70 } );
			for ( const d of this.nearDetail ) if ( ! d.o.geometry.boundingSphere ) d.o.geometry.computeBoundingSphere();

		}

		// laptops: bloom and SMAA (phones draw straight to the screen)
		this.post = tier === 'high' ? new PostChain( renderer, scene, camera ) : null;
		this.player = new Player( { camera, input: this.input, terrain: this.terrainData, colliders: this.colliders, query: this.query, boat: this.boatCtl } );
		this.player.rocks = this.rocks; // ((M15) the sea caves' roofs to walk on)
		// ((M13) the wind you stand in, in the gusts the sea shows: a hurricane's pushes you along)
		this.player.windAt = ( x, z ) => this.weather.windAt( x, z );

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
		// (M10) the village's shutters, banging in a blow: (M14) each loose one as it hits the wall or its frame
		if ( this.village.shutters ) this.village.shutters.onBang = ( x, y, z, k ) => this.audio.shutterBang( x, y, z, k );
		// (the surf follows the shore waves: Tidewater's are { value } uniforms, these plain params)
		const P = this.shore.params, live = ( k ) => ( { get value() {

			return P[ k ];

		} } );
		this.audio.attachShore( {
			shore: { amplitude: live( 'amplitude' ), variation: live( 'variation' ), period: live( 'period' ), gamma: live( 'gamma' ), enabled: live( 'enabled' ), time: G.time,
				// (Salt Life: the waves' clock, as the period changes with the weather)
				phase: ( t, T ) => this.shore.phase( t, T ), timeOf: ( s, T ) => this.shore.timeOf( s, T ) },
			field: this.shoreField, terrain: this.terrainData,
		} );
		this.surfHeard( 1 );
		this.surfHeard( 2 );
		this.player.audio = this.audio;
		// (and, M10, the hull: a slam's wear and the green water it ships, Game.hull)
		this.boatCtl.onSlam = ( strength ) => {

			this.audio.hullSlap( strength );
			if ( this.game ) this.game.hull.slam( strength );

		};

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
			const lamp = this.localLights.add( { position: new THREE.Vector3( x, this.terrainData.heightAt( st.x, st.z ) + ly, z ), color: new THREE.Color( 1.0, 0.72, 0.42 ), intensity: 5 * 1.5, range: 11, kind: 'lantern', flicker: 0.08 } );
			// ((M14) Marta's hangs from her sign: out while a hurricane's taken it)
			if ( st === CHANDLERY ) this._signLamp = lamp;

		}

		this.game = new Game( this );
		// whoever else is on the island, and the time of day you share (together/)
		this.together = new Together( this );
		this.pickUp();
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
		// frames after the start, a group a frame (revealLate), its shaders made after the start too
		// (lateReady). The rod and its line, out of sight until the rod comes out, are compiled after
		// the start (prepareLate).
		if ( this.cpuGL ) {

			const named = ( ...names ) => scene.children.filter( ( c ) => names.some( ( n ) => c.name === n || c.name.startsWith( n + ':' ) ) );
			this._late = [ named( 'Rocks' ), named( 'Village' ), named( 'FishStand', 'Chandlery', 'StallFish', 'Vendor' ), named( 'LobsterBoat' ) ];
			for ( const group of this._late ) for ( const o of group ) o.visible = false;
			// the rod, the speargun and the lobster gear wait out of the scene, not just out of sight: three's
			// compile() makes the shaders of what's hidden too, and theirs are six of the island's biggest
			// (made before the start, they stretched the load past the 45 s All the Spaces' checks allow,
			// on a busy machine)
			for ( const [ held, meshes ] of this.heldTools() ) {

				held.holdBack = true;
				for ( const m of meshes ) m.removeFromParent();

			}
			// the fish in the swimming fish's skin (the village's and the stall's: two big shaders, the
			// skin's and the fins') wait out of the scene, compiled after the start too
			this._heldFish = [ ...( this.village.fish || [] ), this.game.display.stallMesh ]
				.filter( ( m ) => m && Array.isArray( m.material ) ).map( ( m ) => [ m, m.parent ] );
			for ( const [ m ] of this._heldFish ) m.removeFromParent();
			// (and the cast net: its netting, lead line and cords are shaders of their own)
			this._heldNet = this.game.net.meshes.map( ( m ) => [ m, m.parent ] );
			for ( const [ m ] of this._heldNet ) m.removeFromParent();
			// ((M9) and the rain, (M11) its drips, and the lightning: nothing to draw until it rains; (M13) and
			// a hurricane's flying debris; (M14) and a blow's litter)
			this._heldWeather = [ this.rain.mesh, this.rain.splash, this.drips.mesh, this.lightning.mesh, this.flying.mesh, this.litter.mesh ].map( ( m ) => [ m, m.parent ] );
			for ( const [ m ] of this._heldWeather ) m.removeFromParent();

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
		// island's held-back parts appear, the plants grow, then the catch card's shaders, (M14) the cover map
		// and the rocks' overhangs made finer (a few milliseconds after each frame, on every device), then Joe
		// and Marta (their loading is the high point of script memory: before the animals and the debris
		// add theirs), then the animals and the debris, then the scanned debris, with pauses between;
		// last, once that loading's garbage is collected (settle), the reef, its fish and the specks;
		// then, on every device, the whale)
		const revealed = this._late ? new Promise( ( done ) => this._revealed = done ) : null;
		this.lateReady();
		Promise.resolve( revealed ).then( () => this.cpuGL && this.plantsGrow() ).then( () => this.prepareLate() ).then( () => this.buildCover() ).then( () => this.rocks.refineOverhangs() ).then( () => this.loadCharacters() )
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
		// (in company, the waves' time everyone's: the same sea under all of you)
		if ( this.together ) this.together.syncWaves();
		if ( s.timeSpeed !== 0 ) Object.assign( s, timeOf( advance( s.timeOfDay, s.day, s.timeSpeed, dt ) ) );
		if ( this.together ) this.together.syncClock( s );
		// (the hour you're at, in your save now and again: you come back to it)
		if ( ( this._clockSaveT -= dt ) <= 0 ) this.saveClock();
		// (Salt Life) the weather, before anything it moves (the boat, the sky)
		this.weather.update( dt, s.day, s.timeOfDay, this.weatherPick(), this.camera, s.weatherSince );
		// ((M13) a hurricane's rain and spray in the air: the spray thinner inland, away from the sea it's torn off)
		const lw = this.weather.live, spray = lw.sprayHaze > 0 ? lw.sprayHaze * ( 1 - SPRAY_INLAND[ 2 ] * smoothstep( SPRAY_INLAND[ 0 ], SPRAY_INLAND[ 1 ], - this.terrainData.coastDistance( this.camera.position.x, this.camera.position.z ).d ) ) : 0;
		// (heavier, and the world gone for a moment, as a sheet of rain drives past: Rain.sheet)
		this.sky.haze = ( lw.rainHaze + spray ) * ( 1 + SHEET_HAZE * ( this.rain.sheet - 0.375 ) );
		// ((M13) in the shelter's room you're out of the weather; your boat on her cradle is in your way)
		const pp = this.player.position;
		this.player.sheltered = insideRoom( this.village.shelter && this.village.shelter.inside, pp.x, pp.y + 0.9, pp.z );
		if ( this.village.cradleHull ) this.village.cradleHull.solid = !! this.boatCtl.hauled;
		// ((M14) the village's loose shutters swinging in the wind, all shut for a hurricane)
		if ( this.village.shutters ) this.village.shutters.update( dt, this.player.windAt, G.windDir.value, !! this.weather.target.boarded );
		// (M12) a westerly's swell on its way: its shore field, solved off the page
		if ( this.weather.target.west > 0 && ! this._westField && this._started ) this.solveWestField();
		// ((M14) and the north shore's sea, once it has one: most days, a little after the start)
		if ( this.weather.target.north > 0.02 && ! this._northField && this._started ) this.solveNorthField();
		// ((M15) and the bank's, out at sea, once you're near it)
		if ( this._started ) this.bankSea();
		// ((M13) a hurricane's surge: its field solved before it comes, at its highest, dropped once it's gone)
		if ( this._started ) {

			const h = this.weather.hurricane;
			const n = this.weather.news;
			this.solveSurgeField( h && h.peak > SURGE_FIELD_FROM && ( ( n && n.stage !== 'outlook' ) || h.r < SURGE_FIELD_NEAR ) ? h : null );

		}
		// ((M13) the island's animals in the weather: game/WildlifeWeather.js)
		if ( ! ( ( this._wildNewsT -= dt ) > 0 ) ) {

			this._wildNewsT = 2;
			this._wildNews = wildlifeNews( islandTime( s.day, s.timeOfDay ), this.weatherPick(), s.weatherSince );

		}

		const mood = this.wildMood = wildlifeMood( this.weather.live, this._wildNews, islandTime( s.day, s.timeOfDay ), G.wet.value, this.wildMood );
		if ( this.whale ) {

			this.whale.brain.surfacing = mood.whaleSurface;
			this.whale.brain.away = mood.whaleAway;

		}

		if ( this.fish ) this.fish.setWeather( mood.sharksAway );
		// ((M13) what the last hurricane's done, and its mending, from the clock (game/StormDamage.js):
		// the roofs' sheets, the pier's boards, the palms' fronds, the wrack and sand, the birds at the wrack)
		if ( ! ( ( this._damageT -= dt ) > 0 ) ) {

			const T = islandTime( s.day, s.timeOfDay );
			const D = this.damage = damageAt( T, this.weatherPick(), s.weatherSince, this.damage );
			// ((M14) ten times a second while its winds blow: what it tears off goes as it does)
			this._damageT = D.storm && D.after < 0 ? 0.1 : 1;
			this.village.setDamage( D );
			// ((M14) Joe's roof, Marta's sign, and the sheets off them and the roofs, flying)
			this.stand.setDamage( D );
			this.chandlery.setDamage( D, this._signLamp );
			this.flyingSheets.set( D, T );
			this.terrain.setStorm( D );
			vegUniforms.vegStrip.value = D.strip;
			// (its line of wrack, made once it's left one, with the debris's materials)
			if ( ! this.stormWrack && this.debris && D.wrack > 0 ) this.stormWrack = new StormWrack( { terrain: this.terrainData, nature: this.debris.materials.nature, wood: this.village.materials.wood, parent: this.scene, lite: this.tier !== 'high' } );
			if ( this.stormWrack ) this.stormWrack.set( D );
			if ( this.wildlife ) {

				this.wildlife.birds.setWrack( D.wrackH, D.feed );
				this.wildlife.shorebirds.wrack = D.feed > 0.3 ? D.wrackH : null;

			}

		}

		// (M9) the lightning, before the sky its flash lights
		const wx = this.weather.live, cv = this.renderer.domElement;
		this.lightning.setViewport( cv.width, cv.height );
		// ((M12) from up the blow's track, from the clock: everyone's strikes in the same place, (and at the same
		// moment: as the weather is, not as it's easing here, which isn't everyone's); (M15) the island's own
		// storm's about the island, wherever you are, and the showers' about you
		this.lightning.update( this.weather.island.thunder, this.camera, this.weather.track, this.sky.clouds.base, wx.visibility, Date.now(), this.weather.cells );
		this.rain.flash.value = this.sky.flashFill; // ((M12) the light about you: none from a storm on the horizon)
		this.spray.uniforms.sprayGrey.value = this.sky.overcast; // ((M14) the spray lit as the sky is)
		if ( wx.thunder > 0 && this.audio ) this.audio.thunderReady();

		// ---- player / boat (boat physics first so the cameras follow this frame's pose)
		const input = this.input;
		input.update( dt );
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
			// ((M9) and dimmer under a grey sky; (M10) after a blow, silty and closer in)
			const murk = G.murk.value;
			_c.copy( UNDERWATER ).lerp( SILT, 0.7 * murk ).multiplyScalar( ( 0.15 + 0.85 * ( 1 - G.night.value ) ) * ( 1 - 0.5 * this.sky.overcast ) );
			this.scene.fog.color.copy( _c );
			this.scene.fog.near = 0;
			this.scene.fog.far = 28 + ( MURK_FAR - 28 ) * murk;

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
		// ((M15) beachcombing's finds and the north beach's wrack line, once the beach's debris materials are made)
		if ( ! this.beachcomb && this.debris ) this.beachcomb = new Beachcombing( { terrain: this.terrainData, materials: { nature: this.debris.materials.nature, wood: this.village.materials.wood, hard: this.village.materials.hard }, parent: this.scene, lite: this.tier === 'low' } );
		if ( this.beachcomb ) this.beachcomb.update( this.camera );
		if ( this.stormWrack ) this.stormWrack.update( this.camera ); // ((M13) a hurricane's line of wrack, near you)
		this.flyingSheets.update( islandTime( s.day, s.timeOfDay ) ); // ((M14) the sheets it's torn off, flying and lying)
		// ((M15) the lighthouse's light: lit from dusk, its flash as it's seen from here)
		this.lighthouse.update( this.camera, this.sky.visibility, this.renderer.domElement.height );
		this.harbourLights.update( this.camera, this.sky.visibility, this.renderer.domElement.height );
		this.turtles.update( dt, this.camera, this.settings.timeOfDay, this.settings.day );
		this.farIsland.update( this.camera );
		// ((M15) the reefs: the bay's, and the windward one once you're near it)
		if ( this.reefs ) {

			this.northReefNear();
			for ( const r of this.reefs.list ) r.update( this.camera );

		}
		if ( this.whale ) {

			this.whale.update( dt, this.camera );
			this.whaleWater.update( this.whale, dt, this.spray );

		}

		if ( this.fish ) {

			this.fish.viewHeight = this.renderer.domElement.height;
			this.fish.lit = lampsLit( this.settings.timeOfDay ); // (Salt Life: the tarpon gather under the pier's lamps)
			this.fish.hour = this.settings.timeOfDay; // (Salt Life: the lobsters come out after dark)
			this.fish.setSurf( this.shore.surf ); // (M10: the breakers, and the runners in them; (M12) both swells')
			this.fish.update( dt, this.camera.position );
			this.fish.cull( this.camera );

		}
		if ( this.snow ) this.snow.update( this.camera, under, this.renderer.domElement.height, this.localLights && this.localLights.flashlight );
		this.vegetation.update( dt, this.camera );
		if ( this.wildlife ) {

			this.wildlife.viewHeight = this.renderer.domElement.height;
			this.wildlife.birds.mood = this.wildlife.shorebirds.mood = this.wildlife.crabs.mood = this.wildMood;
			this.wildlife.update( dt, this.camera, this.player );

		}
		this.boatSpray.update( dt );
		this.stormSpray.update( dt, this.camera );
		this.whitecapSpray.update( dt, this.camera );
		this.spray.update( dt, this.camera, this.renderer.domElement.height );
		this.rain.update( dt, this.camera, this.cameraWaterHeight, this.renderer.domElement.height );
		this.flying.update( dt, this.camera, this.cameraWaterHeight );
		this.litter.update( dt, this.camera, this.cameraWaterHeight );
		if ( this.motes ) this.motes.update( dt, this.camera, this.cameraWaterHeight, this.renderer.domElement.height );
		this.water.detail.update( dt, this.camera );
		this.shore.update( G.time.value ); // (Salt Life: the waves' clock, for the GPU)
		this.water.update( this.camera );
		this.findsHere();
		this.boat.update( dt );
		// (the boat you're aboard: yours, or riding along, the one you're on as it's drawn here)
		const p = this.player, aboard = p.riding ? _ride.compose( p.boat.position, p.boat.quaternion, _one ) : this.boat.group.matrixWorld;
		// (M9) no rain under the wheelhouse roof
		this.rain.setShelter( _shelter.multiplyMatrices( this.boat.shelter, _c4.copy( aboard ).invert() ) );
		wetSurfaces.update( this.camera, _shelter ); // (M11: nor is anything wet under it, or under a cover)
		this.rain.setDeck( aboard, this.boat.rainTops ); // (M10: the splashes on her cockpit's sole; (M12) her roof, foredeck and gear)
		// ((M12) and on the rocks about you; (M14) none under a rock's overhang or in its lee, nor anything wet
		// there: the rocks about you drawn again as you go, while it rains or anything's wet, once its passes
		// are made (buildCover: the cover map's, and its peeling pass))
		const cam = this.camera.position;
		if ( ( G.rain.value > 0.002 || G.wet.value > 0.001 ) && this.rocks && this.rockCover.prepared ) {

			const list = this._rockList || ( this._rockList = [] );
			this.rockCover.update( this.renderer, cam.x, cam.z, ( x0, z0, x1, z1 ) => this.rocks.around( x0, z0, x1, z1, list ) );

		}
		this.drips.update( dt, this.camera, this.cameraWaterHeight, this.renderer.domElement.height, aboard ); // (M11)
		this.updateInstruments( dt );
		this.boatLamps.set( { underway: this.boatCtl.driven || ! ( this.boatCtl.moored || this.boatCtl.anchor ), spot: this.searchlight } );
		this.localLights.update( this.camera, dt );
		cloudShadows.update( this.camera );
		this.wake.update( dt );
		this.updateAudio( dt );

		// ---- render
		if ( this.nearDetail ) this.updateNearDetail();
		// ((M15) in a sea cave the eye adapts to its dark as to dusk's: as far as the light's less where you are and
		// where you're looking (a few metres on: looking into it from its mouth, you're looking into its dark), up
		// to 12 x, slower into the dark than back out)
		const eye = this.camera.position, ahead = this.camera.getWorldDirection( this._caveDir || ( this._caveDir = new THREE.Vector3() ) );
		const at = this._caveAt || ( this._caveAt = new THREE.Vector3() );
		const caveHere = this.rocks.caveLevel( eye );
		let caveSeen = caveHere;
		for ( const d of [ 2, 5, 9 ] ) caveSeen = Math.min( caveSeen, this.rocks.caveLevel( at.copy( ahead ).multiplyScalar( d ).add( eye ) ) );
		const caveT = Math.min( 12, Math.max( 1, 1 / Math.max( 0.3 * caveHere + 0.7 * caveSeen, 0.01 ) ) );
		this.caveAdapt = this.caveAdapt === undefined ? caveT : this.caveAdapt + ( caveT - this.caveAdapt ) * ( 1 - Math.exp( - dt * ( caveT > this.caveAdapt ? 0.8 : 2 ) ) );
		this.renderer.toneMappingExposure = s.exposure * this.sky.adaptation * this.caveAdapt;
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
			this._drawn = null;

		}

		// programs waiting for their first use (useNewPrograms): this tick instead of a frame, so that
		// asking the GPU about them waits for no drawing (they're used as soon as this returns)
		if ( this._uses.length ) {

			for ( const use of this._uses.splice( 0 ) ) use();
			this._owed += dt;
			return;

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

		// (hidden, and out of the scene until their shaders are made after the start: lateReady; the
		// fish on the racks and the stall, held out already, come back with prepareLate's)
		this._lateHeld = [];
		for ( const group of this._late ) for ( const root of group ) {

			root.visible = false;
			if ( ! root.parent ) continue;
			this._lateHeld.push( [ root, root.parent ] );
			root.removeFromParent();

		}

		target.dispose();
		plain.dispose();

	}

	// (WebGL drawn on the CPU) the parts held back from the loading frame: the village's textures baked (a
	// set a frame) and their shaders made after the start, not as part of the load (the village's, the
	// rocks', the stalls' and the traders' are six of the island's biggest, and the bake's nine programs
	// seconds more), then back in the scene, still hidden, for revealLate
	async lateReady() {

		const held = this._lateHeld;
		if ( ! held ) return;
		await this.village.textures.bake( this.renderer, { slot: () => this.frameSlot(), ready: () => this.useNewPrograms() } );
		await this.readyToDraw( held.map( ( [ root ] ) => root ) );
		for ( const [ root, parent ] of held ) parent.add( root );
		this._lateHeld = null;

	}

	// (WebGL drawn on the CPU) the parts held back from the loading frame, a group per drawn frame, once
	// their shaders are made (lateReady)
	revealLate() {

		if ( this._lateHeld ) return;
		const group = this._late && this._late.shift();
		if ( group ) for ( const o of group ) o.visible = true;
		else if ( this._late ) {

			this._late = null;
			if ( this._revealed ) this._revealed();

		}

	}

	// what's held in the hand, by what holds it: the rod and its line and bobber ((M14) and a float lost
	// with its line), the speargun (its bands, shaft and line), the lobster diver's tickle stick and net
	// (on a device that draws on its CPU, out of the scene until prepareLate)
	heldTools() {

		const { rod, gun, tools } = this.game;
		return [
			[ rod, [ rod.rodMesh, rod.lineMesh, rod.bobberMesh, rod.lostMesh, rod.lostLine ] ],
			[ gun, [ gun.gunMesh, gun.bandMesh, gun.shaftMesh, gun.lineMesh ] ],
			[ tools, [ tools.stickMesh, tools.netMesh ] ],
		];

	}

	// shaders not needed at the start, compiled and first used after it: the catch card's fish portrait
	// (its studio light and the blurred backdrop), the other players' figures, and on a device that
	// draws on its CPU the rod and its line, the speargun and the lobster gear, the skinned fish, the
	// cast net, the rain and the lightning (held back while loading: every shader compiled then is load
	// time). All are compiled, then their programs first used (useNewPrograms: once the GPU has made
	// them all, on a device that draws on its CPU), then they're shown: out of the scene, or held back,
	// until then (three compiles a mesh's material whether it's visible or not)
	async prepareLate() {

		if ( ! this.game ) return;
		const r = this.renderer, game = this.game;
		await game.portrait.compile( r, this.scene.environment );
		await this.together.compile( r, this.camera, this.scene );
		// (the wanted slate on Joe's counter and the stalls' "Closed" boards: the records board's program,
		// compiled just now)
		for ( const m of [ game.wanted.mesh, ...game.signs.map( ( s ) => s.mesh ) ] ) if ( ! m.parent ) this.scene.add( m );
		const roots = [], show = [];
		if ( ! this.boatLamps.group.parent ) {

			roots.push( this.boatLamps.group );
			show.push( () => this.boat.group.add( this.boatLamps.group ) );

		}

		for ( const [ held, meshes ] of this.heldTools() ) if ( held.holdBack ) {

			roots.push( ...meshes );
			show.push( () => {

				for ( const m of meshes ) if ( ! m.parent ) this.scene.add( m );
				held.holdBack = false;

			} );

		}

		for ( const [ m, parent ] of [ ...( this._heldFish || [] ), ...( this._heldNet || [] ), ...( this._heldWeather || [] ) ] ) {

			roots.push( m );
			show.push( () => parent.add( m ) );

		}

		this._heldFish = null;
		this._heldNet = null;
		this._heldWeather = null;
		for ( const root of roots ) await r.compileAsync( root, this.camera, this.scene );
		await this.useNewPrograms();
		for ( const f of show ) f();

	}

	// (M11) the cover map (world/Cover.js), once the stalls are in: the village's merged meshes by what
	// they're made of, Joe's stand under its tin roof, Marta's open table. Its pass is made and first
	// used as the rest are (readyToDraw's way), and drawn in frames of its own (frameSlot). Then the
	// drips find its eaves
	async buildCover() {

		const r = this.renderer;
		try {

			await Promise.all( [ this.stand.ready, this.chandlery.ready ] ).catch( () => {} );
			const meshes = ( root, kind ) => {

				const out = [];
				if ( root ) root.traverse( ( o ) => o.isMesh && out.push( { mesh: o, kind } ) );
				return out;

			};
			const parts = [ ...this.village.coverParts(), ...meshes( this.stand.group, COVER.TIN ), ...meshes( this.chandlery.group, COVER.WOOD ) ];
			const prepare = async ( scene, camera ) => {

				await r.compileAsync( scene, camera );
				await this.useNewPrograms();

			};
			await this.cover.build( r, parts, { slot: () => this.frameSlot(), prepare } );
			// ((M14) and the rock cover's peeling pass, the same way: the rest of it is the cover map's)
			await this.rockCover.prepare( r, prepare );
			performance.mark( 'world: cover' );
			// the drips off the eaves it shows, and off the palms (onto the ground, the sea or a cover)
			const ground = this.terrainData, palms = this.vegetation.records ? this.vegetation.records.palms : [];
			const groundAt = ( x, z ) => Math.max( ground.heightAt( x, z ), G.seaLevel.value );
			this.drips.setPoints( eavePoints( this.cover, groundAt ).concat( palmPoints( palms, groundAt, this.cover ) ) );

		} catch ( e ) {

			console.warn( 'cover', e );

		}

	}

	// Joe and Marta, animated (Character.js), after the start: two models of a few MB with shaders of
	// their own. Low-powered devices get their textures at 512² rather than 1024² (-512.glb). Each is
	// readied before it's drawn: its shaders compiled and first used, its textures uploaded (on a
	// device that draws on its CPU a shader's first use waits for all the drawing queued before it).
	async loadCharacters() {

		if ( ! this.game ) return;
		performance.mark( 'world: characters' );
		// ((M15) those far off loaded when you first come near them: Pearl at the fish camp, Game)
		for ( const v of this.game.vendors ) if ( ! v.lazy ) await this.loadVendorCharacter( v );

	}

	// a trader's skinned character swapped in for their stand-in (Vendor.loadCharacter): the device's copy (low:
	// 512² textures), its programs readied; on a low-powered device drawn only near the camera, like the stand-in
	async loadVendorCharacter( v ) {

		if ( ! this._characterLoad ) {

			const loader = gltfLoader(), r = this.renderer;
			this._characterLoad = async ( url, clips = null ) => {

				const c = new Character( await loader.loadAsync( this.tier === 'low' ? url.replace( /\.glb$/, '-512.glb' ) : url ), { clips } );
				this.lightPerson( c.group );
				for ( const t of c.textures() ) r.initTexture( t );
				await r.compileAsync( c.group, this.camera, this.scene );
				await this.useNewPrograms();
				return c;

			};

		}

		try {

			const c = await v.loadCharacter( this._characterLoad );
			// ((M15) as much of the sand's light as reaches them where they stand: Pearl's sand's in the cliff's shadow)
			const open = v.characterSpec && v.characterSpec.open;
			if ( c && open !== undefined ) for ( const m of c.materials ) if ( m.userData.groundBounceOpen ) m.userData.groundBounceOpen.value = open;
			if ( c && this.nearDetail ) c.group.traverse( ( o ) => {

				if ( ! o.isMesh ) return;
				if ( ! o.geometry.boundingSphere ) o.geometry.computeBoundingSphere();
				this.nearDetail.push( { o, dist: 60 } );

			} );

		} catch ( e ) {

			console.warn( `${ v.name }: the character didn't load; the stand-in stays`, e );

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
		// ((M14) the village's materials are never under a rock: Wet's rocks)
		const village = new Set( Object.values( this.village.materials || {} ) );
		const visit = ( o, cheap ) => {

			if ( cheapRoots.includes( o ) ) cheap = true;
			else if ( o === boat || o.userData.boatCopy ) cheap = false; // ((M14) and the others' copies of her: Together)
			if ( o.isMesh ) for ( const m of [ o.material ].flat() ) {

				if ( ! m || lit.has( m ) || ! ( m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial ) ) continue;
				if ( m.name === 'Water' || m.name === 'fishingLine' ) continue;
				lit.add( m );
				useLocalLights( m, { cheap } );
				if ( this.cloudShadows ) useCloudShadows( m );
				useWet( m, { rocks: ! village.has( m ) } ); // (M9: darker and glossier in the rain)

			}

			for ( const c of o.children ) visit( c, cheap );

		};
		visit( root, this.tier === 'low' );

	}

	// (M15) a person's materials under `root` lit as everything's (lightUp), and by the sunlit sand about them, as
	// someone on a beach is (GroundBounce): the traders, the other players
	lightPerson( root ) {

		this.lightUp( root );
		root.traverse( ( o ) => {

			if ( o.isMesh ) for ( const m of [ o.material ].flat() ) if ( m ) useGroundBounce( m );

		} );

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
		await this.readyOffstage( meshes );
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
		await this.readyOffstage( this.debris.group, () => this.debris.update( this.camera ) );

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
		// ((M15) the reefs the swimmer and the fish stand on: the bay's now, the windward one once it's laid out)
		const reefs = this.reefs = { list: [ reef ], floorHeightAt: ( x, z ) => {

			let g = - Infinity;
			for ( const r of reefs.list ) g = Math.max( g, r.floorHeightAt( x, z ) );
			return g;

		} };
		this.player.reef = reefs;
		await this.pause();
		await this.fishSwim();

	}

	// (M15) the windward reef (world/Reef.js, its own layout: ReefLayout's REEF_SITES.north), laid out in a worker
	// once you come within NORTH_REEF.near of it, and drawn as the bay's is (hidden until its culling picks
	// it); on low, let go again past NORTH_REEF.far. Its fish are there from the start (fishSwim)
	northReefNear() {

		const c = this.camera.position, R = WORLD.northReef.center, d = Math.hypot( c.x - R.x, c.z - R.z );
		if ( ! this.northReef && ! this._northReefP && d < NORTH_REEF.near ) {

			this._northReefP = Reef.create( { scene: this.scene, terrain: this.terrainData, ground: this.terrain, tier: this.tier, site: 'north' } ).then( ( reef ) => {

				this._northReefP = null;
				reef.shadowsFrom( this.sky.sun );
				this.northReef = reef;
				this.reefs.list.push( reef );

			}, ( e ) => {

				console.warn( 'the windward reef', e );
				this._northReefP = null;
				this._northReefFailed = true;

			} );

		} else if ( this.northReef && this.tier === 'low' && d > NORTH_REEF.far ) {

			this.reefs.list = this.reefs.list.filter( ( r ) => r !== this.northReef );
			this.northReef.dispose();
			this.northReef = null;

		}

	}

	// the reef's fish, the bait ball, the rays and the turtle, the bay's tarpon, jacks, mullet and fry,
	// the pier's snappers and grunts (world/Fish.js): they keep to the reef's floor and its coral heads
	async fishSwim() {

		if ( this.fish || ! this.reef ) return;
		performance.mark( 'world: fish' );
		const reef = this.reef;
		const fish = new FishSchools( {
			parent: this.scene, terrain: this.terrainData, ground: this.terrain, tier: this.tier,
			floorAt: ( x, z ) => this.reefs.floorHeightAt( x, z ), center: WORLD.reef.center, radius: WORLD.reef.radius + 10,
			anchors: reef.anchors, shoreField: this.shoreField,
			// ((M15) and the windward reef's: its coral heads from its habitat, before it's laid out)
			north: { center: WORLD.northReef.center, radius: WORLD.northReef.radius, anchors: ReefLayout.heads( this.terrainData, 'north' ), wreck: wreckSpots() },
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
		motes.setRoom( roomMatrix( this.village.shelter && this.village.shelter.inside ) ); // ((M13) none in the shelter)
		await this.readyToDraw( motes.mesh );
		this.scene.add( motes.mesh );
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

	// lit (lightUp), its shaders compiled and their uniforms and attributes looked up (root: one, or
	// several, all compiled before the one wait). then: called once the programs are made
	// (compileAsync makes them at once, then waits for them to finish)
	async readyToDraw( root, then = null ) {

		const r = this.renderer, roots = [ root ].flat();
		for ( const o of roots ) this.lightUp( o );
		const compiled = Promise.all( roots.map( ( o ) => r.compileAsync( o, this.camera, this.scene ) ) );
		if ( then ) then();
		await compiled;
		await this.useNewPrograms();

	}

	// readyToDraw for what's in the scene already, and shown: out of it meanwhile, so that no frame
	// draws it first (a frame would first use its programs, or make an unlit one before lightUp)
	async readyOffstage( root, then = null ) {

		const roots = [ root ].flat(), parents = roots.map( ( o ) => o.parent );
		for ( const o of roots ) o.removeFromParent();
		await this.readyToDraw( roots, then );
		roots.forEach( ( o, i ) => parents[ i ] && parents[ i ].add( o ) );

	}

	// The programs made since the last call, used once (their uniforms and attributes looked up), so
	// a frame doesn't first use them. A first use asks the GPU, and waits for everything queued before
	// it, the program's own linking too: seconds on a device that draws on its CPU, the page frozen
	// all that time (All the Spaces' checks fail a creation that stops answering for 20 s there, and
	// their machine is slower than most). There it's done once the GPU has caught up (gpuCaughtUp),
	// in a tick of the paced frames that draws nothing (pacedFrame), so the asking is quick and the
	// page answers meanwhile
	async useNewPrograms() {

		if ( this.cpuGL && this._started ) {

			await this.gpuCaughtUp();
			await new Promise( ( resolve ) => this._uses.push( resolve ) );

		}

		for ( const p of this.renderer.info.programs ) {

			p.getUniforms();
			p.getAttributes();

		}

	}

	// (CPU WebGL) resolves once the GPU has done everything asked of it so far: a fence, looked at
	// without waiting (as pacedFrame does) every few milliseconds, so the page goes on answering
	gpuCaughtUp() {

		const gl = this.renderer.getContext();
		const sync = gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 );
		if ( ! sync ) return Promise.resolve();
		gl.flush();
		return new Promise( ( resolve ) => {

			const look = () => {

				if ( gl.clientWaitSync( sync, 0, 0 ) === gl.TIMEOUT_EXPIRED ) {

					setTimeout( look, 20 );
					return;

				}

				gl.deleteSync( sync );
				resolve();

			};

			setTimeout( look, 20 );

		} );

	}

	// the plants: scattered over the island, built and baked (in slices). (After the start, on a
	// device that draws on its CPU: their shaders made and first used before they're drawn)
	async plantsGrow() {

		await this.vegetation.init();
		if ( this._started ) await this.readyOffstage( this.vegetation.group );
		else this.lightUp( this.vegetation.group );

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
		if ( T.rock !== null ) {

			// ((M15) what the bites keep of them: the sand that isn't rock, at 4 m (the beaches' wash: Game.sandAt))
			T.beach = beachMask( T );
			for ( const k of [ 'rock', 'sand', 'path', 'gully', 'rubble', 'scarp' ] ) T[ k ] = null;

		}

		// (the seagrass meadows: once the reef is laid out on them; (M15) the windward reef's window of them kept,
		// for when it's laid out)
		if ( this._reefLaid && T.seagrass ) {

			T.seagrassWin = maskWindow( T, T.seagrass, WORLD.northReef.center, 140 );
			T.seagrass = null;

		}

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
		// ((M14) and the north shore's sea, near it: the bay's surf heard as it always was elsewhere)
		const amp = Math.max( this.shore.surf, this.shore.northNear( p.x, p.z ) ), pier = WORLD.pier, boat = this.boatCtl;
		// (the boat you hear: yours, or the one you ride in, or someone's going by: together/)
		const theirs = this.together ? this.together.boatSound() : null;
		// (M10) yours runs once it's caught (Hull: taking the helm cranks her, and she can stall)
		const engine = theirs ? theirs.active : boat.driven && boat.engineOn;
		if ( engine !== this._engineHeard ) {

			if ( engine ) a.engineStart();
			else if ( this._engineHeard !== undefined ) a.engineStop();
			this._engineHeard = engine;

		}

		// (M10) aboard someone else's boat, the skipper's starter as it turns her over (yours: Game.updateHull)
		const crank = theirs ? theirs.crank | 0 : 0;
		if ( crank && ! this._crankHeard ) a.crank( crank === 2 );
		this._crankHeard = crank;
		// (M11) what the rain falls on about you (five times a second, while it rains), and the drips seen
		// landing near you
		this._rainOnT = ( this._rainOnT || 0 ) - dt;
		if ( G.rain.value > 0.002 && this._rainOnT <= 0 ) {

			this._rainOnT = 0.2;
			this._rainOn = surroundings( this.cover, ( x, z ) => this.terrainData.heightAt( x, z ), G.seaLevel.value, p.x, p.y, p.z, this._rainOn, this.rockCover );

		}

		for ( const l of this.drips.landed ) a.drip( l.x, l.y, l.z, l.on );
		// ((M14) the roofs' sheets a hurricane tears off: each as it goes, and as it hits)
		for ( const h of this.flyingSheets.heard ) {

			if ( h.what === 'tear' ) a.sheetTear( h.x, h.y, h.z );
			else a.sheetHit( h.x, h.y, h.z, h.what, h.speed );

		}

		a.update( dt, {
			listener: { position: p, forward: _fwd, up: _up },
			underwater: p.y < h ? 1 : 0,
			depthBelowSurface: Math.max( 0, h - p.y ),
			surfIntensity: amp / 0.6, // ((M13) past 1 in a hurricane's surf: SoundScape)
			inside: this.player.sheltered, // ((M13) in the shelter: the storm through its walls)
			radio: !! ( this.weather.target && this.weather.target.boarded ), // ((M14) its radio on, the island boarded up for a hurricane)
			distanceToShore: Math.abs( coast ),
			coastDistance: coast,
			waveHeight: amp * 2,
			windSpeed: G.windSpeed.value,
			windDir: G.windDir.value,
			gust: this.weather.gustAt( p.x, p.z ), // (M9: the cat's paws on the sea, as the boat feels them)
			rain: G.rain.value, // (M9: and the rain; on the boat it drums on her)
			rainOn: this._rainOn, // (M11: on what it falls on about you)
			songbirds: this.wildMood ? this.wildMood.song : 1, // ((M13) the island's birds in the weather)
			gulls: this.wildMood ? this.wildMood.gull : 1,
			aboard: this.player.mode === 'boat' || this.player.mode === 'deck',
			daylight: 1 - G.night.value,
			nearPier: Math.abs( p.x - pier.x ) < 12 && p.z > pier.zStart - 5 && p.z < pier.zEnd + 8,
			boat: theirs ? { active: theirs.active, rpm: theirs.rpm, speed: theirs.speed, position: theirs.position, listenerInside: false } : {
				active: boat.driven, rpm: boat.rpm, throttle: boat.throttle, speed: boat.velocity.length(),
				position: this.boat.group.position, listenerInside: this.player.mode === 'boat' && this.player.camMode === 'first',
			},
			// (M10) her hull: yours, or (M11) the one you ride in, as her skipper hears it (hullHeard)
			hull: theirs ? theirs.hull || null : this.game ? this.hullHeard() : null,
		} );

	}

	// (M11) her instruments, while you're aboard her (riding along in someone else's, yours are ashore):
	// her engine, revs, speed, heading and fuel; the depth under her, and the fish when she has a finder
	// (Game's sonar); where she is, on the minimap's chart
	updateInstruments( dt ) {

		const p = this.player, b = this.boatCtl, g = this.game;
		// ((M12) riding along: the skipper's, on their dash; yours on standby until you're back)
		const ride = p.riding && this.together ? this.together.ridden() : null;
		this.dashOn( ride ? ride.group : null );
		// (on the low tier others' boats have no dash to show it on)
		if ( ride && g && p.mode === 'deck' && this.tier !== 'low' ) return this.instruments.update( dt, this.riddenReading( ride, dt ) );
		if ( ! g || p.riding || ( p.mode !== 'boat' && p.mode !== 'deck' ) ) return this.instruments.update( dt, null );
		const r = this._reading || ( this._reading = {} ), f = b.forward( _fwdB ), x = b.position.x, z = b.position.z;
		const map = g.minimap;
		r.engine = g.hull.engine;
		r.rpm = b.rpm;
		r.speed = b.speed;
		r.heading = Math.atan2( f.x, - f.z );
		r.fuel = g.state.fuelL / g.state.stats.fuelL;
		r.depth = Math.max( 0, G.seaLevel.value - this.terrainData.heightAt( x, z ) );
		r.finder = !! g.state.stats.finder;
		r.fish = g._sonar ? g._sonar.fish : 0;
		r.x = x;
		r.z = z;
		r.chart = map && map._bake && map._bake.done ? map.canvas : null;
		r.alert = this.weatherAlert();
		// ((M14) her radar, swept with her array; at the helm, ← → its range, as the panels aren't up)
		if ( p.mode === 'boat' && g.quietKeys && g.quietKeys() && ( this.input.hit( 'ArrowLeft' ) || this.input.hit( 'ArrowRight' ) ) ) this.radar.step( this.input.hit( 'ArrowRight' ) ? 1 : - 1 );
		r.radar = this.sweepRadar( dt, r, this.boat.radarBearing );
		this.instruments.update( dt, r );

	}

	// (M14) the radar of the boat you're aboard sweeping as her array turns (beam: its bearing from her bow):
	// the land, the rain about her, the sea's clutter, the other boats
	sweepRadar( dt, r, beam ) {

		const live = this.weather.live, sea = live ? Math.min( 1, Math.max( 0, ( ( live.windSea || 1 ) - 0.8 ) / 2 ) ) : 0;
		this.radar.update( dt, { x: r.x, z: r.z, heading: r.heading, beam, sea, rainAt: this._rainAt || ( this._rainAt = ( x, z ) => this.weather.rainAt( x, z ) ), boats: this.together ? this.together.boatsAbout( this._radarBoats ) : this._radarBoats } );
		return this.radar;

	}

	// (M12) the dash of the boat you're riding in (ride: Together.ridden()): the engine's revs and the
	// starter from the skipper's pose, its fuel and fish finder as they send them (none: on empty, no
	// finder), its speed and heading as it goes; the depth under it and the chart where it is, here
	riddenReading( ride, dt = 1 / 60 ) {

		const p = this.player, c = ride.cur, d = c.dash, r = this._ridden || ( this._ridden = {} );
		const f = p.boat.forward( _fwdB ), x = p.boat.position.x, z = p.boat.position.z, map = this.game.minimap;
		r.engine = c.crank ? 'cranking' : c.mode === 'helm' && c.rpm > 0.02 ? 'running' : 'off';
		r.rpm = c.rpm;
		r.speed = ride.speed;
		r.heading = Math.atan2( f.x, - f.z );
		r.fuel = d ? d.fuel : 0;
		r.depth = Math.max( 0, G.seaLevel.value - this.terrainData.heightAt( x, z ) );
		r.finder = !! ( d && d.finder );
		r.fish = d ? d.fish : 0;
		r.x = x;
		r.z = z;
		r.chart = map && map._bake && map._bake.done ? map.canvas : null;
		r.alert = this.weatherAlert();
		// ((M14) and their radar, as their array turns)
		const arr = ride.group && ride.group.userData.radar;
		r.radar = this.sweepRadar( dt, r, arr ? ( ( - arr.rotation.y ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 ) : 0 );
		return r;

	}

	// (M13) the weather alert on the dash's plotter: a hurricane watched for or warned of ('' none)
	weatherAlert() {

		const n = this.weather && this.weather.news;
		return n && n.stage !== 'outlook' ? `HURRICANE ${ n.stage === 'watch' ? 'WATCH' : 'WARNING' }` : '';

	}

	// (M12) which boat's dash shows the readings: the one you're riding in (its group), or yours (null);
	// the other's on standby
	dashOn( group ) {

		if ( group === this._dashOn ) return;
		const ins = this.instruments, swap = ( root, material ) => root && root.traverse( ( c ) => c.name === 'boat-display' && ( c.material = material ) );
		swap( this._dashOn, ins.standby );
		this._dashOn = group;
		swap( this.boat.group, group ? ins.standby : ins.material );
		swap( group, ins.material );

	}

	// (M10) your boat's hull as it's heard aboard: the bilge as a share of what reaches the engine, the pump,
	// the keel scraping, the wear, and how hard she's working (her roll and pitch); (M11) sent to whoever
	// rides along (Together)
	hullHeard() {

		const h = this.game.hull, out = this._hullHeard || ( this._hullHeard = {} );
		out.flood = h.bilge / FLOOD_L;
		out.pump = h.pumping;
		out.scrape = h.scrape || 0;
		out.wear = h.wear;
		out.motion = Math.min( 1, Math.max( 0, ( this.boatCtl.angular.length() - 0.05 ) / 0.4 ) );
		return out;

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
	// for their triangle budget; ((M14) what's not to be shown at all, as a storm's left it, not then
	// either: userData.shown false, Joe's roof's sheets)
	updateNearDetail() {

		const cam = this.camera.position;
		for ( const d of this.nearDetail ) {

			const s = d.o.geometry.boundingSphere;
			_c3.copy( s.center ).applyMatrix4( d.o.matrixWorld );
			d.o.visible = d.o.userData.shown !== false && _c3.distanceTo( cam ) - s.radius * d.o.matrixWorld.getMaxScaleOnAxis() < d.dist;

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

	// (Salt Life) the island's clock from your save: the hour and day you left at, and whether you'd
	// held it (a new player: the first morning). On its own (pnpm dev), ?hour=21 starts at that hour
	loadClock() {

		const s = this.settings;
		let saved = null;
		try {

			saved = JSON.parse( this.store.getItem( CLOCK_KEY ) || 'null' );

		} catch ( e ) { /* none */ }

		if ( saved && Number.isFinite( saved.hour ) ) {

			s.timeOfDay = ( ( saved.hour % 24 ) + 24 ) % 24;
			s.day = Number.isFinite( saved.day ) ? Math.max( 1, Math.floor( saved.day ) ) : 1;
			// ((M15) it went on without you, an island hour a real hour, unless you'd held it. In company the room's
			// is everyone's: Together)
			if ( ! saved.held ) {

				const t = awayClock( s.timeOfDay, s.day, saved.at );
				s.timeOfDay = t.hour;
				s.day = t.day;

			}
			s.timeSpeed = saved.held ? 0 : DAY_RATE;
			s.weather = isPick( saved.weather ) ? saved.weather : null;
			s.weatherSince = Number.isFinite( saved.since ) ? saved.since : islandTime( s.day, s.timeOfDay );

		}

		const q = this.portal.standalone ? new URLSearchParams( location.search ) : null;
		const asked = q && q.has( 'hour' ) ? Number( q.get( 'hour' ) ) : NaN;
		if ( asked >= 0 && asked < 24 ) s.timeOfDay = asked;
		// ((M12) ?day=53: that day's weather, for trying it)
		const day = q && q.has( 'day' ) ? Number( q.get( 'day' ) ) : NaN;
		if ( day >= 1 ) s.day = Math.floor( day );
		// (?weather=gale: that weather; ?weather=forecast: the day's)
		const weather = q && q.get( 'weather' );
		if ( weather && ( isPick( weather ) || weather === 'forecast' ) ) {

			s.weather = isPick( weather ) ? weather : null;
			// ((M13) ?weather=hurricane: one of your own, coming in from the hour you start at)
			s.weatherSince = islandTime( s.day, s.timeOfDay );

		}
		this.portal.on( 'pause', () => {

			this.saveClock();
			if ( this.together ) this.together.mineBoat( true );

		} );
		this.portal.onExit( () => {

			this.saveClock();
			return Promise.all( [ this.store.flush(), this.together && this.together.mineBoat( true ) ] );

		} );

	}

	// (M12) a westerly's swell: its shore field (the travel times it's refracted along, round the bay's
	// western arm), solved once one's on its way, in a worker where there is one (a few tenths of a
	// second on a laptop, a few seconds on a phone; never at load), from the island's own field's depths.
	// Then the shore waves cross it with the south's, and the surf's sound hears it break
	solveWestField() {

		if ( this._westField ) return this._westField;
		this._westField = this.solveShoreField( [ SWELL_WEST.x, SWELL_WEST.y ] ).then( ( field ) => {

			this.shore.addField( field );
			this.surfHeard( 1 );
			return field;

		} );
		return this._westField;

	}

	// (M14) the north shore's sea: its shore field (along the trades, Weather.NORTH.dir: onto the island's
	// windward side, round its shoulders; a wind sea's, so none in its lee, the bay: ShoreField.shelter),
	// solved as the westerly's is, once it has a
	// height (most days, a little after the start). Then its waves break there, and are heard
	solveNorthField() {

		if ( this._northField ) return this._northField;
		this._northField = this.solveShoreField( [ NORTH.dir.x, NORTH.dir.y ], 0, true ).then( ( field ) => {

			this.shore.addField( field, 2 );
			this.surfHeard( 2 );
			return field;

		} );
		return this._northField;

	}

	// (M13) a hurricane's storm surge: the island's own swell's field solved again at the highest the sea
	// rises (the hurricane's peak, m), as the westerly's is, before it comes; the shore waves blend it in
	// as the sea rises toward it. Dropped once the hurricane's gone (none: null)
	solveSurgeField( hurricane ) {

		const key = hurricane ? `${ hurricane.tc }:${ hurricane.peak }` : null;
		if ( key === this._surgeKey ) return;
		this._surgeKey = key;
		if ( ! key ) {

			this.shore.setSurgeField( null );
			return;

		}

		const level = hurricane.peak;
		this.solveShoreField( [ WORLD.swellDir.x, WORLD.swellDir.y ], level ).then( ( field ) => {

			if ( this._surgeKey === key ) this.shore.setSurgeField( field, level );

		} );

	}

	// (M15) what's found out there about you (game/Finds.js, from the island's time: everyone's in the same
	// place): the weedlines and the bait's boils drawn on the sea, the debris floating, the birds working the
	// nearest bait
	findsHere() {

		const s = this.settings, c = this.camera.position;
		const depthAt = this._depthAt || ( this._depthAt = ( x, z ) => - this.terrainData.heightAt( x, z ) );
		const f = this.finds = findsAbout( islandTime( s.day, s.timeOfDay ), c.x, c.z, FIND_RANGE, this.finds || { weed: [], debris: [], bait: [] }, depthAt );
		this.water.setFinds( f, this.camera );
		this.flotsam.update( f.debris, this.camera );
		if ( this.wildlife ) {

			let best = null, bd = Infinity;
			for ( const b of f.bait ) {

				const d = Math.hypot( b.x - c.x, b.z - c.z );
				if ( d < bd && d < FIND_BIRDS ) {

					bd = d;
					best = b;

				}

			}

			this.wildlife.birds.work( best );

		}

	}

	// (M15) the bank's waves, out at sea (SEABED.bank: its rim and its sandbar break in a swell): its sea, the
	// biggest out there (the south's swell, or the trades' sea from the north, by the power each carries, H^2
	// T: the other takes over at a third more), and once you're within BANK.near of it, its shore field for
	// that sea, solved as the westerly's is over a square of its own round it; solved again when the other
	// takes over
	bankSea() {

		const shore = this.shore, live = this.weather.live, c = this.camera.position;
		if ( ! shore || ! live ) return;
		const south = FAIR_AMPLITUDE * ( live.swell ?? 1 ), north = live.north || 0;
		const ps = live.period || 9, pn = live.northPeriod || 5;
		const ratio = ( north * north * pn ) / Math.max( 1e-6, south * south * ps );
		const fromNorth = this._bankKey === 'north' ? ratio > 0.75 : ratio > 1.33;
		const key = fromNorth ? 'north' : 'south';
		shore.setBankSea( fromNorth ? north : south, fromNorth ? pn : ps );
		const B = SEABED.bank;
		if ( this._bankKey === key || Math.hypot( c.x - B.x, c.z - B.z ) > BANK.near ) return;
		this._bankKey = key;
		const dir = fromNorth ? [ NORTH.dir.x, NORTH.dir.y ] : [ WORLD.swellDir.x, WORLD.swellDir.y ];
		this.solveShoreField( dir, 0, false, this.bankGround() ).then( ( field ) => {

			if ( this._bankKey !== key ) return;
			shore.setBank( field, [ B.x, B.z ] );
			shore.setBankSea( fromNorth ? north : south, fromNorth ? pn : ps );

		} ).catch( ( e ) => console.warn( 'Shore: the bank\'s field', e && e.message ) );

	}

	// (M15) the seabed's depths over the bank's square (BANK: its size, and its field's cells a side, fewer on
	// low), for its shore field
	bankGround() {

		if ( this._bankGround ) return this._bankGround;
		const B = SEABED.bank, res = BANK.res[ this.tier ] ?? BANK.res.low, size = BANK.size, h = size / res;
		const origin = B.x - size / 2, originZ = B.z - size / 2, depth = new Float32Array( res * res );
		for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) depth[ j * res + i ] = - this.terrainData.heightAt( origin + ( i + 0.5 ) * h, originZ + ( j + 0.5 ) * h );
		return ( this._bankGround = { depth, res, size, origin, originZ } );

	}

	// (M12) another shore field from the island's own field's depths (swellDir: where its swell travels;
	// (M13) at the sea level seaLevel; (M14) a wind sea's, its lee taken out), in a worker where there is
	// one, else on the page; (M15) or over another square's depths, `over` ({ depth, res, size, origin,
	// originZ }: the bank's)
	solveShoreField( swellDir, seaLevel = 0, lee = false, over = null ) {

		const home = this.shoreField;
		const ground = over || { depth: home.depth, res: home.res, size: home.size, origin: home.origin };
		return new Promise( ( resolve, reject ) => {

			const worker = classicWorker( ShoreWorker );
			worker.onmessage = ( e ) => {

				worker.terminate();
				if ( e.data.error ) reject( new Error( e.data.error ) );
				else resolve( e.data.field );

			};

			worker.onerror = ( e ) => {

				worker.terminate();
				reject( e );

			};

			worker.postMessage( { ground, swellDir, seaLevel, lee } );

		} ).catch( ( e ) => {

			console.warn( 'Shore: a swell\'s field solved on the page (no worker)', e && e.message );
			const field = computeShoreField( fieldGround( ground ), { res: ground.res, swellDir, seaLevel } );
			return lee ? shelter( field, swellDir ) : field;

		} );

	}

	// (M12) the west swell's waves to the surf's sound, once both are here; (M14) or the north shore's (slot 2)
	surfHeard( slot ) {

		const train = this.shore && this.shore.trains[ slot ], P = this.shore && this.shore.params;
		if ( ! train || ! this.audio ) return;
		const value = ( get ) => ( { get value() {

			return get();

		} } );
		this.audio.addShore( {
			shore: { amplitude: value( () => train.amplitude ), variation: value( () => P.variation ), period: value( () => train.period ), gamma: value( () => P.gamma ), enabled: value( () => P.enabled ), time: G.time,
				phase: ( t, T ) => train.phase( t, T ), timeOf: ( s, T ) => train.timeOf( s, T ) },
			field: train.field,
		}, slot );

	}

	// (M15) what brought a day's finds in (game/Beachcomb.js): how big the north sea was the night before
	// (0..1 of a breezy day's 1.5 m), and a hurricane's wrack that day
	beachDays( d ) {

		const c = this._beachDays || ( this._beachDays = new Map() ), s = this.settings, key = `${ d }:${ this.weatherPick() }:${ s.weatherSince }`;
		if ( ! c.has( key ) ) {

			if ( c.size > 32 ) c.clear();
			const w = weatherAt( islandTime( d, 2 ), this.weatherPick(), s.weatherSince ), D = damageAt( islandTime( d, 7 ), this.weatherPick(), s.weatherSince );
			c.set( key, { north: Math.min( 1, ( w.north || 0 ) / 1.5 ), storm: D.wrack > 0.3 } );

		}

		return c.get( key );

	}

	// (Salt Life) the weather you picked (null: the day's); in company, the one picked for everyone here
	// (Together's shared 'weather', adopted into the settings)
	weatherPick() {

		return this.settings.weather || null;

	}

	// the hour and day you're at, into your save (written a moment later, with the rest of it); and the
	// weather you picked (none: the day's), (M13) and when, for a hurricane of your own; (M15) when (at: the clock
	// goes on from there while you're away), and your boat
	saveClock() {

		this._clockSaveT = 30;
		const s = this.settings, held = s.timeSpeed === 0;
		const text = JSON.stringify( { hour: Math.round( s.timeOfDay * 1000 ) / 1000, day: s.day, held, ...( held ? {} : { at: Date.now() } ), ...( s.weather ? { weather: s.weather } : {} ), ...( s.weather === 'hurricane' ? { since: s.weatherSince } : {} ) } );
		if ( this.store && text !== this._clockSaved ) this.store.setItem( CLOCK_KEY, text );
		this._clockSaved = text;
		this.saveBoat();

	}

	// (M15) where your boat lies, her heading, her anchor, and whether you're aboard, into your save
	saveBoat() {

		const b = this.boatCtl, p = this.player, s = this.settings;
		if ( ! this._pickedUp || ! this.store ) return;
		const dock = WORLD.boatDock.position;
		// (as stepping ashore makes her fast: Player.exitBoat)
		const moored = b.moored || ( ! b.anchor && ! b.hauled && Math.hypot( b.position.x - dock.x, b.position.z - dock.z ) < 14 && b.speed < 1.5 );
		const aboard = p.riding ? null : p.mode === 'deck' ? 'deck' : p.mode === 'boat' ? 'helm' : null;
		this.store.setItem( BOAT_KEY, JSON.stringify( boatLeft( { x: b.position.x, z: b.position.z, heading: b.getYaw(), anchor: b.anchor, moored, aboard, T: islandTime( s.day, s.timeOfDay ), at: Date.now() } ) ) );
		if ( this.together ) this.together.mineBoat();

	}

	// (M15) Picking up where you left off (game/Away.js): your boat where you left her, as whatever's happened since
	// has left her (your own reckoning from the island's weather, and the group's save if she was out on everyone's
	// sea), its fee paid, and you aboard if you were and she's still where you left her. Told once you're here
	pickUp() {

		const s = this.settings, st = this.state, b = this.boatCtl, p = this.player, g = this.game;
		this._pickedUp = true;
		const boats = cleanBoats( this._boatsRead ), mine = boats[ this.portal.me.id ] || null;
		this.together.setBoats( boats, !! mine );
		const left = leftOf( this.store.getItem( BOAT_KEY ) );
		if ( ! left ) return;
		left.hauled = st.hauled;
		const T = islandTime( s.day, s.timeOfDay ), dock = WORLD.boatDock.position, pick = this.weatherPick(), since = s.weatherSince;
		const depth = ( x, z ) => Math.max( 0, G.seaLevel.value - this.terrainData.heightAt( x, z ) );
		const away = ! ( Date.now() - left.at < BACK_MS );
		const story = withRecord( awayOf( left, away ? T : left.T, { dock, pick, since, depth } ), away ? mine : null, dock );
		const paid = st.payTow( story.fee ), towed = story.tows.length > 0;
		if ( story.wear > 0 ) {

			st.hull = Math.min( 1, st.hull + story.wear );
			st.save();
			g._wearSaved = st.hull;

		}

		const fish = story.spoiled ? st.spoil() : 0;
		const yaw = new THREE.Vector3( 0, 1, 0 );
		if ( story.where === 'cradle' ) {

			st.hauled = true;
			st.save();
			b.setHauled( g.cradle );

		} else if ( towed ) b.reset();
		else if ( story.where !== 'dock' || Math.hypot( left.x - dock.x, left.z - dock.z ) > 0.5 ) {

			b.position.set( story.x, G.seaLevel.value, story.z );
			b.quaternion.setFromAxisAngle( yaw, story.heading );
			b.velocity.set( 0, 0, 0 );
			b.angular.set( 0, 0, 0 );
			b.moored = story.where === 'dock';
			if ( b.moored ) {

				b.mooring.anchor.set( story.x, 0, story.z );
				b.mooring.heading = story.heading;

			}

			b.anchor = story.anchor ? new THREE.Vector3( story.anchor.x, this.terrainData.heightAt( story.anchor.x, story.anchor.z ), story.anchor.z ) : null;
			b.hasWater = false;
			b.apply();

		}

		if ( left.aboard && ! towed && ! b.hauled ) {

			p.boardBoat();
			if ( left.aboard === 'helm' ) p.takeHelm();

		}

		if ( away ) g.awayTold = tellOf( story, { paid, hull: st.hull, fish, T, news: hurricaneNews( T, pick, since ), locale: this.portal.locale, from: left } );
		this.together.mineBoat( true );

	}

}

const CLOCK_KEY = 'saltlife.clock';
const BOAT_KEY = 'saltlife.boat';
const timeOf = ( t ) => ( { timeOfDay: t.hour, day: t.day } );

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
