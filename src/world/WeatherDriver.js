import { G } from '../core/Globals.js';
import { islandTime, weatherAt, showers, towardOf, hurricaneAt, hurricaneNews, FRONT_KMH, STORM_RANGE, SURF_MAX } from '../game/Weather.js';
import { FRONT_KM } from '../sky/SkyProClouds.js';

// (Salt Life) The island's weather, each frame: what the day brings (game/Weather.js), or what you picked
// on your own, eased onto everything that shows it:
//   - the wind (G.windSpeed, G.windDir: the plants, the village, the sea's gusts and slicks, the birds,
//     the spray, the boat, the sound). It turns slowly about the trades' direction (G.windPrevailing),
//     and the wind sea and the slicks turn with it about the camera (Waves.setWindDir, SeaDetail);
//   - the open sea (Waves.setSea: the swell, the wind sea) and its whitecaps (WaterSurface);
//   - the surf (ShoreWaves.setSurf: its height and its period, on a clock that carries on; (M12) and how
//     much of it is a westerly's swell, crossing the south's: Waves.setSwellWest offshore);
//   - the cloud (SkyProClouds: cover, and how grey) and the light and the distance seen under it (Sky).
//   - (M9) the rain (G.rain: the streaks, the rings on the water, the sound) and what it leaves wet
//     (G.wet: the ground, the village, the boat, drying slowly after), and the thunder (Lightning);
//   - (M9) the weather on its way, up the trades (SkyProClouds.front: the cover there, ahead of the
//     clock: a shower's cloud comes over before it rains, a front's bank darkens the horizon first);
//   - (M9) the gusts: the cat's paws on the sea, as the boat and the wind's sound feel them (windAt),
//     stronger in rain and squalls, which freshen the wind a little while they pass;
//   - (M10) the water's murk after a blow (G.murk: the view under water closes in, App; the caustics dim).
//   - (M11) the showers about the island, drifting down the trades (Weather.showers): their curtains in
//     the distance (Sky.setCurtains), each frame from the clock.
//   - (M12) the blow's track (Weather.trackAt): the wind comes round to it (a front's swings it through
//     half the compass in a few game hours), the weather on its way is told up it (SkyProClouds.front,
//     frontDir), and the showers and the lightning come from up it (track: where the weather goes, from
//     the clock alone, so everyone's strikes are in the same place). The showers are looked for out to
//     STORM_RANGE (cells): the thundery ones on the horizon strike too (Lightning, distantStrikesIn).
//   - (M13) a hurricane (Weather.hurricaneAt: this.hurricane, where its eye is) and what's said of it
//     (Weather.hurricaneNews: this.news, for Joe's slate, the clock's menu and the dash). Its wind can come
//     round the compass as it passes, so the wind turns the shorter way to where it's going, and quicker
//     in the light airs of its eye. On your own a picked one passes (pick 'hurricane', picked at `since`).
//     (step 2) Its storm surge is the sea's level (G.seaLevel).
// The wind and the sea come round over half a minute or so, the cloud more slowly (a minute or two from
// fair to a gale's, so the panorama's refresh keeps up and nothing pops), the rain in seconds. When the
// clock jumps (a rest, the host's clock, coming back to the tab) it's all set at once, behind the dim a
// rest gives.
//   weather.update( dt, day, hour, pick, camera, since )   weather.target, weather.live   ({ id, wind, ... })
//   weather.windAt( x, z ) -> m/s   weather.gustAt( x, z ) -> 0..1

const EASE = 30; // s: the time constant of the wind and the sea coming round
const CLOUD_RATE = 0.008; // cover and greyness a second, at most
// (M9) the rain comes on and eases off in seconds; what it wets soaks in over a few, and dries over minutes
const RAIN_EASE = 6;
const SOAK = 12, DRY = 240;
// the cloud comes over ahead of its rain: it follows the weather this far on (game hours)
const CLOUD_LEAD = 0.6;
// the weather up the trades: the clouds are told the cover at FRONT_KM (a front's bank comes FRONT_KMH a
// game hour: Weather.js), how often (s)
const FRONT_EVERY = 0.5;
// the gusts: how much the wind rises and falls in them (of its speed), in rain and in a squall besides;
// the wind a squall's downdraught adds (m/s at full rain, at full thunder: at most a gale's)
const GUSTS = [ 0.22, 0.18, 0.15 ];
const SQUALL = [ 1.5, 3 ];
const GALE = 20;
// rad a second at most: the wind comes round (the far sea turns with it), (M12) as fast as a front swings it
// (about a quarter of the compass in two game hours)
const TURN_RATE = 0.015;
const JUMP = 0.5; // game hours: more than this between frames, the clock jumped
// whitecaps: the share of the sea that breaks white goes as U^3.41 (Monahan & O'Muircheartaigh 1980);
// none counted at a fair day's breeze or less, so the sea is as it always was. The water takes it as a
// strength, 0 to WHITECAP in a gale's wind
const monahan = ( u ) => 3.84e-6 * Math.pow( Math.max( 0, u ), 3.41 );
const WHITECAP = 0.85;
const whitecap = ( u ) => WHITECAP * Math.min( 1, Math.max( 0, monahan( u ) - monahan( 7 ) ) / ( monahan( 20 ) - monahan( 7 ) ) );
const KEYS = [ 'wind', 'swell', 'windSea', 'surf', 'west', 'visibility', 'murk', 'hurricane', 'surge', 'rainHaze', 'sprayHaze' ];
const QUICK = [ 'rain', 'thunder', 'front', 'eye' ];
// (M13) in a hurricane the wind comes round up to this many times quicker in light airs (its eye's), from
// LIGHT[ 1 ] m/s down to LIGHT[ 0 ]
const LIGHT_TURN = 3, LIGHT = [ 4, 12 ];
// how often what's said of a hurricane is looked at (s)
const NEWS_EVERY = 1;
// (M13 step 2) the sea's culling box (m: WaterSurface's CDLOD, as it always was), moved with the surge
// and opened by this much (m a metre) for a surf past a gale's: a hurricane's crests on its surge
const SEA_BOX = [ - 4, 4 ], SEA_BOX_SURF = 4;
// (M13) m/s: the sea streaked with blown foam from a storm's wind (Beaufort 10), all of it in a hurricane's
const SPUME = [ 24.5, 34 ];
const smoothstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
// the surf's period changes slowly (s a second): a change hurries the crests a little on their way in
const PERIOD_RATE = 0.02;

export class WeatherDriver {

	constructor( { sky, waves, shore, water, boat = null } ) {

		this.sky = sky;
		this.waves = waves;
		this.shore = shore;
		this.water = water;
		this.boat = boat;
		this.target = null; // what the weather is (game/Weather.js)
		this.live = null; // what's shown, on its way there
		this.cloud = null; // (M9) the cloud it's bringing (a little ahead: CLOUD_LEAD)
		this._T = null;
		this._at = { x: 0, z: 0 }; // where the sea turns about (the camera)
		this._frontT = 0;
		this._pick = null;
		this._showers = [];
		this._showerRain = new Map(); // (each slot's weather, while the pick's the same)
		this.cells = this._showers; // (M12) the showers about the island, out to STORM_RANGE (Weather.showers)
		this.track = { x: 0, y: 1 }; // (M12) where the weather goes now (from the clock: Lightning)
		this.hurricane = null; // (M13) the hurricane about the island (Weather.hurricaneAt), or null
		this.news = null; // (M13) what's said of the next one (Weather.hurricaneNews), or null
		this._since = 0;
		this._newsT = 0;

	}

	// (M9) the wind's speed at ( x, z ), in the gusts the sea shows there (m/s)
	windAt( x, z ) {

		const w = this.live, g = GUSTS[ 0 ] + ( w ? GUSTS[ 1 ] * w.rain + GUSTS[ 2 ] * w.thunder : 0 );
		return G.windSpeed.value * ( 1 + g * ( this.gustAt( x, z ) - 0.5 ) * 2 );

	}

	// a lull (0) to a gust (1) at ( x, z ): the cat's paws on the sea
	gustAt( x, z ) {

		return this.water.detail ? this.water.detail.gustAt( x, z ) : 0.5;

	}

	update( dt, day, hour, pick = null, camera = null, since = 0 ) {

		if ( camera ) {

			this._at.x = camera.position.x;
			this._at.z = camera.position.z;

		}

		const T = islandTime( day, hour );
		const target = this.target = weatherAt( T, pick, since );
		towardOf( target.windAngle, this.track );
		// (a held pick holds; (M13) a picked hurricane passes, as the day's weather does)
		const held = pick && pick !== 'hurricane';
		// (the cloud a shower brings comes over before it rains, and stays a while after)
		const ahead = held ? target : weatherAt( T + CLOUD_LEAD, pick, since );
		const cloud = this.cloud = { coverage: Math.max( target.coverage, ahead.coverage ), overcast: Math.max( target.overcast, ahead.overcast ), storm: Math.max( target.rain, ahead.rain ) };
		const jumped = this._T !== null && Math.abs( T - this._T ) > JUMP;
		const picked = pick !== this._pick || since !== this._since;
		this._T = T;
		this._pick = pick;
		this._since = since;
		this.hurricane = hurricaneAt( T, pick, since );
		if ( ( this._newsT -= dt ) <= 0 || jumped || picked ) {

			this._newsT = NEWS_EVERY;
			this.news = hurricaneNews( T, pick, since );

		}
		if ( ! this.live || jumped ) {

			this.live = { ...target, ...cloud };
			G.wet.value = Math.min( 1, target.rain * 3 );
			// (the sea under the boat stepped: she takes it as she finds it)
			if ( jumped && this.boat ) this.boat.hasWater = false;

		} else {

			const live = this.live, k = 1 - Math.exp( - dt / EASE ), step = CLOUD_RATE * dt;
			for ( const key of KEYS ) live[ key ] = toward( live[ key ], target[ key ], ( target[ key ] - live[ key ] ) * k );
			const q = 1 - Math.exp( - dt / RAIN_EASE );
			for ( const key of QUICK ) live[ key ] = toward( live[ key ], target[ key ], ( target[ key ] - live[ key ] ) * q );
			for ( const key of [ 'coverage', 'overcast', 'storm' ] ) live[ key ] = toward( live[ key ], cloud[ key ], Math.max( - step, Math.min( step, cloud[ key ] - live[ key ] ) ) );
			// (wet through in a few seconds of a downpour; dry over minutes once it's stopped)
			const soaked = Math.min( 1, live.rain * 3 ), wet = G.wet.value;
			G.wet.value = soaked > wet ? wet + ( soaked - wet ) * ( 1 - Math.exp( - dt / SOAK ) ) : Math.max( soaked, wet - dt / DRY );
			const pace = PERIOD_RATE * dt;
			live.period = toward( live.period, target.period, Math.max( - pace, Math.min( pace, target.period - live.period ) ) );
			// ((M13) the shorter way round to it: a hurricane's comes round the compass, and its eye's light
			// airs come round quicker)
			const light = target.hurricane > 0 ? 1 + ( LIGHT_TURN - 1 ) * Math.min( 1, Math.max( 0, ( LIGHT[ 1 ] - live.wind ) / ( LIGHT[ 1 ] - LIGHT[ 0 ] ) ) ) : 1;
			const turn = TURN_RATE * light * dt, gap = target.windAngle - live.windAngle, to = gap - Math.round( gap / ( 2 * Math.PI ) ) * 2 * Math.PI;
			live.windAngle = Math.abs( to ) <= turn ? target.windAngle : live.windAngle + Math.sign( to ) * turn;
			live.id = target.id;

		}

		// the weather up the trades, for the clouds: the cover there, against the cover here
		if ( ( this._frontT -= dt ) <= 0 || jumped || picked ) {

			this._frontT = FRONT_EVERY;
			const f = this.sky.clouds.front;
			if ( f ) for ( let i = 0; i < FRONT_KM.length; i ++ ) {

				const at = held ? target : weatherAt( T + CLOUD_LEAD + FRONT_KM[ i ] / FRONT_KMH, pick, since );
				f.value.setComponent( i, held ? 0 : at.coverage - this.live.coverage );
				// ((M12) told up the track of the weather that's 24 km off: the bank's)
				if ( i === 2 && this.sky.clouds.frontDir ) towardOf( at.windAngle, this.sky.clouds.frontDir.value );

			}

		}

		this.apply();
		// (M11) the showers about the island, for their curtains in the distance (a picked weather's are
		// its own; each slot's rain is kept while the pick is)
		if ( picked || this._showerRain.size > 160 ) this._showerRain.clear();
		showers( T, pick, STORM_RANGE, this._showers, this._showerRain, since );
		if ( camera ) this.sky.setCurtains( this._showers, camera.position );

	}

	apply() {

		const w = this.live, sky = this.sky;
		// (a squall's downdraught freshens it while it passes)
		G.windSpeed.value = Math.min( Math.max( GALE, w.wind ), w.wind + SQUALL[ 0 ] * w.rain + SQUALL[ 1 ] * w.thunder );
		G.rain.value = w.rain;
		// (the sun the waves focus on the seabed: little under a grey sky, none in the rain's deck, and
		// (M10) less through the murk a blow's left)
		G.caustics.value = Math.max( 0, 1 - 0.85 * w.overcast - 0.15 * w.storm ) * ( 1 - 0.7 * w.murk );
		G.murk.value = w.murk;
		// ((M13) a hurricane's storm surge: the sea's level, everything that reads it following it, and the
		// sea's culling box with it, opened for its surf's crests)
		G.seaLevel.value = w.surge;
		if ( this.water.lod ) {

			const big = SEA_BOX_SURF * Math.max( 0, w.surf - SURF_MAX );
			this.water.lod.minY = SEA_BOX[ 0 ] + Math.min( 0, w.surge ) - big;
			this.water.lod.maxY = SEA_BOX[ 1 ] + Math.max( 0, w.surge ) + big;

		}
		// (turned from the trades: their own direction exactly when it hasn't)
		const p = G.windPrevailing.value, c = Math.cos( w.windAngle ), s = Math.sin( w.windAngle );
		if ( w.windAngle === 0 ) G.windDir.value.copy( p );
		else G.windDir.value.set( p.x * c - p.y * s, p.x * s + p.y * c );
		this.waves.setWindDir( G.windDir.value, this._at );
		this.waves.setSea( w.swell, w.windSea );
		// ((M12) a westerly's swell from the west: offshore, and on the shore once its field's solved)
		this.waves.setSwellWest( w.west, this._at );
		if ( this.shore ) this.shore.setSurf( w.surf, w.period, w.west );
		sky.clouds.coverage.value = w.coverage;
		sky.clouds.overcast.value = w.overcast;
		sky.clouds.storm.value = w.storm;
		sky.overcast = w.overcast;
		sky.storm = w.storm;
		sky.visibility = w.visibility;
		this.water.whitecap.value = whitecap( G.windSpeed.value );
		// ((M13) the sea streaked white with blown foam, from a storm's wind (Beaufort 10) to a hurricane's)
		if ( this.water.spume ) this.water.spume.value = smoothstep( SPUME[ 0 ], SPUME[ 1 ], G.windSpeed.value );

	}

}

// a value moved by `d` toward its target, landing on it once it's all but there (so a fair day comes
// back to fair exactly)
function toward( v, target, d ) {

	const next = v + d;
	return Math.abs( target - next ) < 1e-4 ? target : next;

}
