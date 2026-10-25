import { G } from '../core/Globals.js';
import { islandTime, weatherAt } from '../game/Weather.js';
import { FRONT_KM } from '../sky/SkyProClouds.js';

// (Salt Life) The island's weather, each frame: what the day brings (game/Weather.js), or what you picked
// on your own, eased onto everything that shows it:
//   - the wind (G.windSpeed, G.windDir: the plants, the village, the sea's gusts and slicks, the birds,
//     the spray, the boat, the sound). It turns slowly about the trades' direction (G.windPrevailing),
//     and the wind sea and the slicks turn with it about the camera (Waves.setWindDir, SeaDetail);
//   - the open sea (Waves.setSea: the swell, the wind sea) and its whitecaps (WaterSurface);
//   - the surf (ShoreWaves.setSurf: its height and its period, on a clock that carries on);
//   - the cloud (SkyProClouds: cover, and how grey) and the light and the distance seen under it (Sky).
//   - (M9) the rain (G.rain: the streaks, the rings on the water, the sound) and what it leaves wet
//     (G.wet: the ground, the village, the boat, drying slowly after), and the thunder (Lightning);
//   - (M9) the weather on its way, up the trades (SkyProClouds.front: the cover there, ahead of the
//     clock: a shower's cloud comes over before it rains, a front's bank darkens the horizon first);
//   - (M9) the gusts: the cat's paws on the sea, as the boat and the wind's sound feel them (windAt),
//     stronger in rain and squalls, which freshen the wind a little while they pass;
//   - (M10) the water's murk after a blow (G.murk: the view under water closes in, App; the caustics dim).
// The wind and the sea come round over half a minute or so, the cloud more slowly (a minute or two from
// fair to a gale's, so the panorama's refresh keeps up and nothing pops), the rain in seconds. When the
// clock jumps (a rest, the host's clock, coming back to the tab) it's all set at once, behind the dim a
// rest gives.
//   weather.update( dt, day, hour, pick )   weather.target, weather.live   ({ id, wind, ... })
//   weather.windAt( x, z ) -> m/s   weather.gustAt( x, z ) -> 0..1

const EASE = 30; // s: the time constant of the wind and the sea coming round
const CLOUD_RATE = 0.008; // cover and greyness a second, at most
// (M9) the rain comes on and eases off in seconds; what it wets soaks in over a few, and dries over minutes
const RAIN_EASE = 6;
const SOAK = 12, DRY = 240;
// the cloud comes over ahead of its rain: it follows the weather this far on (game hours)
const CLOUD_LEAD = 0.6;
// the weather up the trades: how far a front's bank comes in a game hour (km; the clouds are told the
// cover at FRONT_KM), how often (s)
const FRONT_KMH = 8;
const FRONT_EVERY = 0.5;
// the gusts: how much the wind rises and falls in them (of its speed), in rain and in a squall besides;
// the wind a squall's downdraught adds (m/s at full rain, at full thunder: at most a gale's)
const GUSTS = [ 0.22, 0.18, 0.15 ];
const SQUALL = [ 1.5, 3 ];
const GALE = 20;
const TURN_RATE = 0.003; // rad a second at most: the wind comes round slowly (the far sea turns with it)
const JUMP = 0.5; // game hours: more than this between frames, the clock jumped
// whitecaps: the share of the sea that breaks white goes as U^3.41 (Monahan & O'Muircheartaigh 1980);
// none counted at a fair day's breeze or less, so the sea is as it always was. The water takes it as a
// strength, 0 to WHITECAP in a gale's wind
const monahan = ( u ) => 3.84e-6 * Math.pow( Math.max( 0, u ), 3.41 );
const WHITECAP = 0.85;
const whitecap = ( u ) => WHITECAP * Math.min( 1, Math.max( 0, monahan( u ) - monahan( 7 ) ) / ( monahan( 20 ) - monahan( 7 ) ) );
const KEYS = [ 'wind', 'swell', 'windSea', 'surf', 'visibility', 'murk' ];
const QUICK = [ 'rain', 'thunder', 'front' ];
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

	update( dt, day, hour, pick = null, camera = null ) {

		if ( camera ) {

			this._at.x = camera.position.x;
			this._at.z = camera.position.z;

		}

		const T = islandTime( day, hour );
		const target = this.target = weatherAt( T, pick );
		// (the cloud a shower brings comes over before it rains, and stays a while after)
		const ahead = pick ? target : weatherAt( T + CLOUD_LEAD );
		const cloud = this.cloud = { coverage: Math.max( target.coverage, ahead.coverage ), overcast: Math.max( target.overcast, ahead.overcast ), storm: Math.max( target.rain, ahead.rain ) };
		const jumped = this._T !== null && Math.abs( T - this._T ) > JUMP;
		const picked = pick !== this._pick;
		this._T = T;
		this._pick = pick;
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
			const turn = TURN_RATE * dt;
			live.windAngle = toward( live.windAngle, target.windAngle, Math.max( - turn, Math.min( turn, target.windAngle - live.windAngle ) ) );
			live.id = target.id;

		}

		// the weather up the trades, for the clouds: the cover there, against the cover here
		if ( ( this._frontT -= dt ) <= 0 || jumped || picked ) {

			this._frontT = FRONT_EVERY;
			const f = this.sky.clouds.front;
			if ( f ) for ( let i = 0; i < FRONT_KM.length; i ++ ) {

				const at = pick ? target : weatherAt( T + CLOUD_LEAD + FRONT_KM[ i ] / FRONT_KMH );
				f.value.setComponent( i, pick ? 0 : at.coverage - this.live.coverage );

			}

		}

		this.apply();

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
		// (turned from the trades: their own direction exactly when it hasn't)
		const p = G.windPrevailing.value, c = Math.cos( w.windAngle ), s = Math.sin( w.windAngle );
		if ( w.windAngle === 0 ) G.windDir.value.copy( p );
		else G.windDir.value.set( p.x * c - p.y * s, p.x * s + p.y * c );
		this.waves.setWindDir( G.windDir.value, this._at );
		this.waves.setSea( w.swell, w.windSea );
		if ( this.shore ) this.shore.setSurf( w.surf, w.period );
		sky.clouds.coverage.value = w.coverage;
		sky.clouds.overcast.value = w.overcast;
		sky.clouds.storm.value = w.storm;
		sky.overcast = w.overcast;
		sky.storm = w.storm;
		sky.visibility = w.visibility;
		this.water.whitecap.value = whitecap( G.windSpeed.value );

	}

}

// a value moved by `d` toward its target, landing on it once it's all but there (so a fair day comes
// back to fair exactly)
function toward( v, target, d ) {

	const next = v + d;
	return Math.abs( target - next ) < 1e-4 ? target : next;

}
