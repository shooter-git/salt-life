import { G } from '../core/Globals.js';
import { islandTime, weatherAt } from '../game/Weather.js';

// (Salt Life) The island's weather, each frame: what the day brings (game/Weather.js), or what you picked
// on your own, eased onto everything that shows it:
//   - the wind (G.windSpeed, G.windDir: the plants, the village, the sea's gusts and slicks, the birds,
//     the spray, the boat, the sound). It turns slowly about the trades' direction (G.windPrevailing),
//     and the wind sea and the slicks turn with it about the camera (Waves.setWindDir, SeaDetail);
//   - the open sea (Waves.setSea: the swell, the wind sea) and its whitecaps (WaterSurface);
//   - the surf (ShoreWaves.setSurf: its height and its period, on a clock that carries on);
//   - the cloud (SkyProClouds: cover, and how grey) and the light and the distance seen under it (Sky).
// The wind and the sea come round over half a minute or so, the cloud more slowly (a few minutes from
// fair to a gale's, so the panorama's slow refresh keeps up and nothing pops). When the clock jumps (a
// rest, the host's clock, coming back to the tab) it's all set at once, behind the dim a rest gives.
//   weather.update( dt, day, hour, pick )   weather.target, weather.live   ({ id, wind, ... })

const EASE = 30; // s: the time constant of the wind and the sea coming round
const CLOUD_RATE = 0.004; // cover and greyness a second, at most
const TURN_RATE = 0.003; // rad a second at most: the wind comes round slowly (the far sea turns with it)
const JUMP = 0.5; // game hours: more than this between frames, the clock jumped
// whitecaps: the share of the sea that breaks white goes as U^3.41 (Monahan & O'Muircheartaigh 1980);
// none counted at a fair day's breeze or less, so the sea is as it always was. The water takes it as a
// strength, 0 to WHITECAP in a gale's wind
const monahan = ( u ) => 3.84e-6 * Math.pow( Math.max( 0, u ), 3.41 );
const WHITECAP = 0.85;
const whitecap = ( u ) => WHITECAP * Math.min( 1, Math.max( 0, monahan( u ) - monahan( 7 ) ) / ( monahan( 20 ) - monahan( 7 ) ) );
const KEYS = [ 'wind', 'swell', 'windSea', 'surf', 'visibility' ];
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
		this._T = null;
		this._at = { x: 0, z: 0 }; // where the sea turns about (the camera)

	}

	update( dt, day, hour, pick = null, camera = null ) {

		if ( camera ) {

			this._at.x = camera.position.x;
			this._at.z = camera.position.z;

		}

		const T = islandTime( day, hour );
		const target = this.target = weatherAt( T, pick );
		const jumped = this._T !== null && Math.abs( T - this._T ) > JUMP;
		this._T = T;
		if ( ! this.live || jumped ) {

			this.live = { ...target };
			// (the sea under the boat stepped: she takes it as she finds it)
			if ( jumped && this.boat ) this.boat.hasWater = false;

		} else {

			const live = this.live, k = 1 - Math.exp( - dt / EASE ), step = CLOUD_RATE * dt;
			for ( const key of KEYS ) live[ key ] = toward( live[ key ], target[ key ], ( target[ key ] - live[ key ] ) * k );
			for ( const key of [ 'coverage', 'overcast' ] ) live[ key ] = toward( live[ key ], target[ key ], Math.max( - step, Math.min( step, target[ key ] - live[ key ] ) ) );
			const pace = PERIOD_RATE * dt;
			live.period = toward( live.period, target.period, Math.max( - pace, Math.min( pace, target.period - live.period ) ) );
			const turn = TURN_RATE * dt;
			live.windAngle = toward( live.windAngle, target.windAngle, Math.max( - turn, Math.min( turn, target.windAngle - live.windAngle ) ) );
			live.id = target.id;

		}

		this.apply();

	}

	apply() {

		const w = this.live, sky = this.sky;
		G.windSpeed.value = w.wind;
		// (turned from the trades: their own direction exactly when it hasn't)
		const p = G.windPrevailing.value, c = Math.cos( w.windAngle ), s = Math.sin( w.windAngle );
		if ( w.windAngle === 0 ) G.windDir.value.copy( p );
		else G.windDir.value.set( p.x * c - p.y * s, p.x * s + p.y * c );
		this.waves.setWindDir( G.windDir.value, this._at );
		this.waves.setSea( w.swell, w.windSea );
		if ( this.shore ) this.shore.setSurf( w.surf, w.period );
		sky.clouds.coverage.value = w.coverage;
		sky.clouds.overcast.value = w.overcast;
		sky.overcast = w.overcast;
		sky.visibility = w.visibility;
		this.water.whitecap.value = whitecap( w.wind );

	}

}

// a value moved by `d` toward its target, landing on it once it's all but there (so a fair day comes
// back to fair exactly)
function toward( v, target, d ) {

	const next = v + d;
	return Math.abs( target - next ) < 1e-4 ? target : next;

}
