// Plain-node tests of playing together (together/Together.js), what each of you sees the same: two (and a
// third) players' games against a stand-in for All the Spaces' session, its shared values going to all of
// them as the real one's do.
//   - the weather picked: anyone's pick is everyone's (a guest's reached nobody, and in company the pick
//     was the day's), a new room starting from its host's, and the day's when it's put back
//   - the sea: the waves' time everyone's, from the host's own (each kept their own, and someone's boat
//     sat on your sea as it was on theirs: awash), and none in a game on its own
//   - another's boat on your sea: as high over yours as over theirs
//   node test/together.mjs
import { register } from 'node:module';

// (the SDK's three helpers are TypeScript node won't load: stood in for)
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {

	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );

}` ) );
const { Together, floatBoat } = await import( '../src/together/Together.js' );
const { G } = await import( '../src/core/Globals.js' );
const { Vector3 } = await import( '../src/engine/index.js' );

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

// All the Spaces' shared values, as each player's session sees them: set by one, on to everyone's
// listeners (the one who set it too, as the real one does)
class Room {

	constructor() { this.values = new Map(); this.sessions = []; }
	join( mode = 'room' ) {

		const room = this, listeners = new Map(), host = [];
		const s = {
			mode, isHost: this.sessions.length === 0, sets: 0,
			get: ( key ) => room.values.get( key ),
			set: async ( key, value ) => {

				s.sets ++;
				if ( mode === 'solo' ) return;
				room.values.set( key, JSON.parse( JSON.stringify( value ) ) );
				for ( const o of room.sessions ) for ( const fn of o._listeners.get( key ) || [] ) fn( room.values.get( key ) );

			},
			onChange: ( key, fn ) => { ( listeners.get( key ) || listeners.set( key, [] ).get( key ) ).push( fn ); },
			onHostChange: ( fn ) => host.push( fn ),
			_listeners: listeners, _host: host,
		};
		this.sessions.push( s );
		return s;

	}

}

// a player's game, as far as the shared world goes: their settings, their session
const player = ( session, weather = null, since = 0 ) => {

	const t = Object.create( Together.prototype );
	t.session = session;
	t.app = { settings: { weather, weatherSince: since, timeOfDay: 9, day: 3 } };
	t._shareWorld();
	return t;

};

// ---- the weather picked
{

	const room = new Room();
	const host = player( room.join(), 'gale' );
	const guest = player( room.join(), 'calm' );
	check( host.app.settings.weather === 'gale' && guest.app.settings.weather === 'gale', 'a new room starts from its host\'s pick, and whoever comes takes it (not their own)' );
	guest.setWeather( 'rain', 0 );
	check( host.app.settings.weather === 'rain' && guest.app.settings.weather === 'rain', 'a guest\'s pick is the host\'s weather too' );
	host.setWeather( 'hurricane', 2203.5 );
	check( guest.app.settings.weather === 'hurricane' && guest.app.settings.weatherSince === 2203.5, 'and the host\'s the guest\'s: a hurricane from the same hour' );
	guest.setWeather( null, 0 );
	check( host.app.settings.weather === null && guest.app.settings.weather === null, 'put back to the day\'s for everyone' );
	const late = player( room.join(), 'storm' );
	check( late.app.settings.weather === null, 'someone coming later takes the room\'s (the day\'s), not theirs' );

}

// ---- the sea: the waves' time
{

	const room = new Room(), was = G.time.value;
	G.time.value = 123.4;
	const host = player( room.join() );
	host.syncWaves();
	check( Math.abs( G.time.value - 123.4 ) < 0.05, `the host's sea doesn't jump when it's shared (${ G.time.value.toFixed( 3 ) } s)` );
	G.time.value = 9.0; // (the guest's own, since their page loaded)
	const guest = player( room.join() );
	guest.syncWaves();
	const theirs = G.time.value;
	host.syncWaves();
	check( Math.abs( theirs - G.time.value ) < 0.05 && Math.abs( theirs - 123.4 ) < 0.1, `the guest's waves' time is the host's (${ theirs.toFixed( 3 ) } and ${ G.time.value.toFixed( 3 ) } s)` );
	const alone = new Room().join( 'solo' ), mine = player( alone );
	G.time.value = 50;
	mine.syncWaves();
	check( G.time.value === 50 && alone.sets === 0, 'on your own (a solo session), your own sea, nothing shared' );
	G.time.value = was;

}

// ---- another's boat on your sea
{

	const sea = { heightAt: ( x, z ) => 0.4 + 0.01 * x }; // (your sea there: a swell's slope)
	const theirs = { pos: new Vector3( 10, 1.2, 5 ), water: 1.0 }; // (0.2 m over theirs)
	floatBoat( theirs, sea );
	check( Math.abs( theirs.pos.y - ( 0.5 + 0.2 ) ) < 1e-9, `their boat as high over your sea as over theirs (${ theirs.pos.y.toFixed( 2 ) } m on a sea at 0.50)` );
	const old = { pos: new Vector3( 0, 1.2, 0 ), water: null };
	floatBoat( old, sea );
	check( old.pos.y === 1.2, 'a pose without the sea\'s height (a game from before): where it says' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
