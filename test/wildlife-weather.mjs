// (M13) Plain-node tests of the wildlife in the weather (game/WildlifeWeather.js): on a fair or breezy day
// they do as they always have; in a shower, a thunderstorm, a gale and a hurricane each kind does what
// it really does (from the real weather, the real hurricanes and their news); the humpback's brain
// (more slaps and breaches in a wind, no surfacing while it's away) and the blacktips (off to deep water
// ahead of a blow, back after it) on the real island.
import { readFileSync } from 'node:fs';
import { Vector3, Group } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { ReefLayout } from '../src/world/reef/ReefLayout.js';
import { FishSchools } from '../src/world/Fish.js';
import { fishModels } from '../src/world/fish/FishModels.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Whale } from '../src/world/marine/Whale.js';
import { WhaleBrain } from '../src/world/marine/WhaleBrain.js';
import { Shorebirds } from '../src/world/wildlife/Shorebirds.js';
import { G } from '../src/core/Globals.js';
import { weatherAt, hurricaneAt, hurricaneNews, HURRICANE } from '../src/game/Weather.js';
import { wildlifeMood, wildlifeNews, seabirdAbout } from '../src/game/WildlifeWeather.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const SEABIRDS = [ 'tern', 'pelican', 'frigate' ];
const about = ( m, night = 0 ) => SEABIRDS.filter( ( k ) => seabirdAbout( k, m, night ) );
const NUMBERS = [ 'gull', 'tern', 'pelican', 'frigate', 'shore', 'ghost', 'hermit', 'song', 'whaleSurface' ];

// ---- the rule, weather by weather
{

	const none = wildlifeMood( null );
	check( NUMBERS.every( ( k ) => none[ k ] === ( k === 'shore' ? 0 : 1 ) ) && ! none.sharksAway && ! none.whaleAway && ! none.gone, 'with no weather, everything as it always was' );

	// a fair and a breezy day, every hour for a fortnight: everyone at it as they always have been
	let same = true, finite = true;
	for ( const pick of [ 'calm', 'fair', 'breezy' ] ) for ( let T = 0; T < 24 * 14; T += 0.5 ) {

		const m = wildlifeMood( weatherAt( T, pick ), null, T, 0 );
		if ( ! NUMBERS.every( ( k ) => m[ k ] === ( k === 'shore' ? 0 : 1 ) ) || m.sharksAway || m.whaleAway || m.gone || m.eyeBirds ) same = false;

	}

	check( same, 'calm, fair and breezy days: every factor 1 (sanderlings working, crabs out, birds singing, the whale as it was)' );
	// any weather, a long run of days: in range
	for ( let T = 0; T < 24 * 600; T += 0.73 ) {

		const m = wildlifeMood( weatherAt( T ), wildlifeNews( T ), T, ( T * 0.37 ) % 1 );
		for ( const k of NUMBERS ) if ( ! Number.isFinite( m[ k ] ) || m[ k ] < 0 ) finite = false;
		if ( m.gull > 1 || m.tern > 1 || m.pelican > 1 || m.frigate > 1 || m.shore > 1 || m.ghost > 1 || m.hermit > 1.6 || m.song > 1.4 || m.whaleSurface < 1 || m.whaleSurface > 2.5 ) finite = false;

	}

	check( finite, 'six hundred days of the weather: every factor finite and in its range' );

	// a light shower: the frigatebirds leave the sky (their feathers soak), the rest fish on; the
	// sanderlings work the swash; the ghost crabs go down, the hermit crabs come out
	const shower = wildlifeMood( { wind: 8, rain: 0.18, murk: 0 } );
	check( ! seabirdAbout( 'frigate', shower, 0 ) && seabirdAbout( 'tern', shower, 0 ) && seabirdAbout( 'pelican', shower, 0 ) && shower.gull > 0.95, `a shower: the frigatebirds off (${ shower.frigate.toFixed( 2 ) }), the terns and pelicans fishing on, the gulls about their day` );
	check( shower.shore < 0.1 && shower.ghost < 0.5 && shower.hermit > 1.3, `the sanderlings still at the swash (${ shower.shore.toFixed( 2 ) }), the ghost crabs down (${ shower.ghost.toFixed( 2 ) }), the hermit crabs out more (${ shower.hermit.toFixed( 2 ) })` );
	const after = wildlifeMood( { wind: 6, rain: 0, murk: 0 }, null, 0, 0.9 );
	check( after.song > 1.3 && after.hermit > 1.5, `as it clears, everything still wet: a burst of song (${ after.song.toFixed( 2 ) }), the hermit crabs out (${ after.hermit.toFixed( 2 ) })` );

	// a thunderstorm at its height (the real one: the hour of its heaviest rain)
	let wet = null;
	for ( let T = 0; T < 48; T += 0.05 ) {

		const w = weatherAt( T, 'storm' );
		if ( ! wet || w.rain > wet.rain ) wet = w;

	}

	const storm = wildlifeMood( wet, null, 0, 1 );
	check( about( storm ).length === 0 && seabirdAbout( 'gull', storm, 0 ) && storm.gull < 0.4, `a thunderstorm (rain ${ wet.rain.toFixed( 2 ) }, ${ wet.wind.toFixed( 0 ) } m/s): the terns, pelicans and frigatebirds gone to roost, the gulls hunched where they are (${ storm.gull.toFixed( 2 ) })` );
	check( storm.shore > 0.8 && storm.ghost < 0.01 && storm.hermit < 0.2 && storm.song < 0.15, `the sanderlings huddled (${ storm.shore.toFixed( 2 ) }), the crabs in (${ storm.ghost.toFixed( 2 ) }, ${ storm.hermit.toFixed( 2 ) }), the songbirds quiet (${ storm.song.toFixed( 2 ) })` );
	check( storm.whaleSurface > 1.2 && ! storm.whaleAway && ! storm.gone, `the humpback slaps and breaches more (x${ storm.whaleSurface.toFixed( 2 ) }), and nobody's gone for good` );

	// a gale: the blacktips off to deep water, the whale at the surface
	const gale = wildlifeMood( weatherAt( 12, 'gale' ) );
	check( gale.sharksAway && gale.whaleSurface > 2 && gale.tern === 0, `a gale: the blacktips off to deep water, the whale slapping and breaching (x${ gale.whaleSurface.toFixed( 2 ) }), no terns fishing` );
	const front = wildlifeMood( { wind: 9, rain: 0, front: 0.6 } );
	check( front.sharksAway && ! wildlifeMood( { wind: 9, rain: 0, front: 0.1 } ).sharksAway, 'and ahead of a front, as the pressure falls (not on an ordinary day)' );

	// by night the seabirds roost; the gulls are about; the line has some give either way
	const fair = wildlifeMood( weatherAt( 12, 'fair' ) );
	check( about( fair, 0.8 ).length === 0 && seabirdAbout( 'gull', fair, 0.8 ) && about( fair, 0 ).length === 3, 'by night the terns, pelicans and frigatebirds roost; by day they\'re all about' );
	check( seabirdAbout( 'tern', fair, 0.6, true ) && ! seabirdAbout( 'tern', fair, 0.6, false ), 'and one about stays a little past the line it comes back over (no coming and going at dusk)' );
	const edge = wildlifeMood( { wind: 15, rain: 0, murk: 0 } );
	check( seabirdAbout( 'tern', edge, 0, true ) !== seabirdAbout( 'tern', edge, 0, false ) || edge.tern < 0.3 || edge.tern > 0.45, `the same give in the weather (terns at ${ edge.tern.toFixed( 2 ) })` );

}

// ---- hurricanes: the real ones, and what's said of them
{

	const list = [];
	for ( let T = 0; T < 24 * 900; T += 1 ) {

		const h = hurricaneAt( T );
		if ( h && ( ! list.length || list[ list.length - 1 ].tc !== h.tc ) ) list.push( h );

	}

	let outlook = true, watch = true, warning = true, after = true, back = true, whaleBack = true, inIt = true, eyes = 0, eyeBirds = true, notEye = true, overs = 0;
	for ( const h of list ) {

		const n = hurricaneNews( h.tc ), at = ( T ) => wildlifeMood( weatherAt( T ), wildlifeNews( T ), T, 1 );
		const o = at( n.onset - 80 ), wa = at( n.onset - 40 ), wr = at( n.onset - 30 );
		if ( o.gone || o.whaleAway || o.sharksAway !== wildlifeMood( weatherAt( n.onset - 80 ) ).sharksAway ) outlook = false;
		if ( wa.gone || ! wa.whaleAway ) watch = false;
		if ( ! wr.gone || ! wr.whaleAway || ! wr.sharksAway || about( wr ).length || seabirdAbout( 'gull', wr, 0 ) ) warning = false;
		const a6 = at( n.ends + 6 ), a13 = at( n.ends + 13 ), a25 = at( n.ends + 25 );
		if ( ! a6.gone || ! a6.whaleAway ) after = false;
		if ( a13.gone || ! a13.whaleAway ) back = false;
		if ( a25.whaleAway || a25.gone ) whaleBack = false;
		if ( n.over ) overs ++;
		for ( let T = n.onset; T < n.ends; T += 0.1 ) {

			const w = weatherAt( T ), m = at( T );
			if ( w.eye > 0.5 ) {

				eyes ++;
				if ( ! m.eyeBirds || ! seabirdAbout( 'frigate', m, 0 ) || seabirdAbout( 'tern', m, 0 ) ) eyeBirds = false;

			} else {

				if ( m.eyeBirds ) notEye = false;
				if ( w.wind > 25 && ( m.song > 0.05 || m.ghost > 0.01 || m.hermit > 0.01 || m.shore < 0.95 ) ) inIt = false;

			}

		}

	}

	check( list.length > 15, `${ list.length } hurricanes in 900 days to look at (${ overs } with the eye over the island)` );
	check( outlook, 'on the outlook, four days off: everyone still about' );
	check( watch, 'on the watch: the humpback gone offshore, the birds still here' );
	check( warning, 'from the warning: the seabirds gone, the gulls too, the blacktips off to deep water' );
	check( after, 'six hours after its winds have gone: still nobody back' );
	check( back, 'half a day after: the birds back, the whale not yet' );
	check( whaleBack, 'a day after: the whale back too' );
	check( inIt, 'in its winds: the songbirds silent, the crabs in, the sanderlings (if any) huddled' );
	check( eyes > 0 && eyeBirds && notEye, `in its eye (${ ( eyes * 0.1 ).toFixed( 0 ) } h of eyes): seabirds caught up in it circling in the calm (frigatebirds only), and only in its eye` );
	check( HURRICANE.fromDay > 1 && wildlifeNews( 0 ) === null, 'and before the first: no news, no one gone' );

}

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );

// ---- the humpback's brain
{

	const surfaced = ( surfacing, minutes ) => {

		const b = new WhaleBrain( { terrain, seed: 3 } );
		b.surfacing = surfacing;
		for ( let i = 0; i < minutes * 60 / 0.05; i ++ ) b.update( 0.05 );
		return b.slaps + b.breaches;

	};

	const calm = surfaced( 1, 60 ), blowing = surfaced( 2.5, 60 );
	check( blowing > calm * 1.5, `in a wind it slaps and breaches more (an hour: ${ calm } on a fair day, ${ blowing } in a gale)` );

	const whale = new Whale( { scene: null, terrain, ground: null } );
	const b = whale.brain;
	b.away = true;
	let surfacedAway = 0, goneAt = null;
	for ( let i = 0; i < 20 * 60 / 0.05; i ++ ) {

		b.update( 0.05 );
		if ( whale.gone && goneAt === null ) goneAt = i * 0.05;
		if ( goneAt !== null && b.state === 'surface' ) surfacedAway ++;

	}

	check( goneAt !== null && goneAt < 120 && surfacedAway === 0, `away: gone once it's down from its breaths (after ${ goneAt?.toFixed( 0 ) } s), and up no more in twenty minutes` );
	b.away = false;
	let up = false;
	for ( let i = 0; i < 10 * 60 / 0.05 && ! up; i ++ ) {

		b.update( 0.05 );
		up = b.state === 'surface';

	}

	check( up && ! whale.gone, 'back: it surfaces on its next pass' );

}

// ---- the blacktips
{

	const reef = new ReefLayout( { terrain } ).toData();
	const u = ( value ) => ( { value } );
	const ground = { uniforms: { terrainSeaLevel: u( 0 ), terrainWaterAbsorption: u( new Vector3( 0.4, 0.07, 0.03 ) ), terrainCaustics: u( null ), terrainTime: u( 0 ), terrainNight: u( 0 ) } };
	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt: ( x, z ) => terrain.heightAt( x, z ), center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: reef.anchors } );
	fish.setModels( fishModels( fish.modelNames ) );
	const tips = fish.groups.filter( ( g ) => g.sp.name === 'blacktipShark' );
	const bay = tips.find( ( g ) => g.home.z < 200 );
	check( tips.length === 2 && tips.every( ( g ) => g.storm && fish.depthAt( g.storm.x, g.storm.z ) > 16 ), `both groups of blacktips have deep water to go to (${ tips.map( ( g ) => fish.depthAt( g.storm.x, g.storm.z ).toFixed( 0 ) + ' m' ).join( ', ' ) })` );
	const run = ( s, at ) => {

		for ( let i = 0; i < s * 30; i ++ ) fish.update( 1 / 30, typeof at === 'function' ? at() : at );

	};

	const land = new Vector3( 0, 3, - 300 ), over = ( g ) => new Vector3( g.home.x, 1.5, g.home.z );
	fish.setWeather( true );
	run( 1, land );
	run( 5, over( bay ) );
	check( ! bay.active, 'away ahead of a blow: those out of sight aren\'t there when you come to look' );
	fish.setWeather( false );
	run( 5, over( bay ) );
	check( bay.active && Math.hypot( bay.center.x - bay.home.x, bay.center.z - bay.home.z ) < 30, 'once it\'s eased, back at home' );
	const d0 = Math.hypot( bay.center.x - bay.storm.x, bay.center.z - bay.storm.z );
	fish.setWeather( true );
	const follow = new Vector3();
	run( 150, () => follow.set( bay.center.x, 1.5, bay.center.z - 10 ) );
	const d1 = Math.hypot( bay.center.x - bay.storm.x, bay.center.z - bay.storm.z );
	check( d0 - d1 > 40 && Math.hypot( bay.goal.x - bay.storm.x, bay.goal.z - bay.storm.z ) <= bay.storm.r + 1, `and those you're among swim off for deep water (${ ( d0 - d1 ).toFixed( 0 ) } m nearer it in two and a half minutes)` );
	fish.setWeather( false );

}

// ---- the sanderlings
{

	const batch = { write() {} };
	// put up, they land again further along (every flock, a few seeds, a light wind and a fresh one)
	let landed = 0, tries = 0, slowest = 0;
	for ( const seed of [ 1, 2, 3 ] ) for ( const fi of [ 0, 1 ] ) for ( const wind of [ 3, 11 ] ) {

		G.windSpeed.value = wind;
		G.windDir.value.set( 0.6, 0.8 );
		const sb = new Shorebirds( { terrain, seed } ), F = sb.flocks[ fi ];
		const camera = { position: new Vector3( F.x, 2.5, - 52 ) };
		for ( let i = 0; i < 30; i ++ ) sb.update( 1 / 30, null, batch, camera );
		sb.flush( F, { x: F.x + 3, z: - 45 } );
		tries ++;
		for ( let i = 0; i < 30 * 30; i ++ ) {

			sb.update( 1 / 30, null, batch, camera );
			if ( F.state === 'feed' ) {

				landed ++;
				slowest = Math.max( slowest, i / 30 );
				break;

			}

		}

	}

	check( landed === tries, `put up, a flock lands again further along (${ landed } of ${ tries }, within ${ slowest.toFixed( 1 ) } s)` );

	// a downpour: they roost, still, each facing into the wind
	G.windSpeed.value = 14;
	G.windDir.value.set( 0.6, 0.8 );
	const sb = new Shorebirds( { terrain } ), into = Math.atan2( - 0.6, - 0.8 );
	const camera = { position: new Vector3( 60, 2.5, - 52 ) };
	sb.mood = wildlifeMood( { wind: 14, rain: 1 } );
	for ( let i = 0; i < 30 * 30; i ++ ) sb.update( 1 / 30, null, batch, camera );
	const err = sb.birds.map( ( b ) => Math.abs( Math.atan2( Math.sin( b.yaw - into ), Math.cos( b.yaw - into ) ) ) );
	check( sb.birds.every( ( b ) => b.state !== 'fly' && b.v < 0.15 ) && Math.max( ...err ) < 0.4, `a downpour: they roost, still, facing into the wind (within ${ Math.max( ...err ).toFixed( 2 ) } rad)` );

	// ahead of a hurricane: off along the beach, gone out of sight; back after it, where nobody's looking
	sb.mood = wildlifeMood( { wind: 12, rain: 0 }, { stage: 'warning', ends: 1e9 }, 0, 0 );
	const near = sb.flocks.find( ( F ) => Math.abs( F.cx - 60 ) < 70 ) || sb.flocks[ 1 ];
	for ( let i = 0; i < 30 * 60; i ++ ) sb.update( 1 / 30, { mode: 'walk', x: 60, y: 2.5, z: - 52, speed: 0 }, batch, camera );
	check( sb.flocks.every( ( F ) => F.hidden ), `ahead of a hurricane they fly off along the beach and are gone (the near one from ${ near.cx.toFixed( 0 ) } m along)` );
	sb.mood = wildlifeMood( null );
	sb.update( 1 / 30, null, batch, camera );
	const nearBack = sb.flocks.filter( ( F ) => ! F.hidden ).length;
	camera.position.set( 0, 3, - 300 );
	sb.update( 1 / 30, null, batch, camera );
	check( sb.flocks.every( ( F ) => ! F.hidden ) && nearBack < sb.flocks.length, 'after it, back once you\'re not looking (not before your eyes)' );
	G.windSpeed.value = 7;

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
