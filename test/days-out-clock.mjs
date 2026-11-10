// (M16) What DaysOut takes for a rest: a clock that's moved by more than it could have run. The clock's the wall's, frames or none, so a page hidden a
// minute (or a device managing a frame every few seconds) isn't one: her helm's yours still, and she's not been reckoned adrift. And her set down by that
// reckoning, or by App.pickUp's: on the ground, not in it.
//   node test/days-out-clock.mjs
import { DaysOut } from '../src/game/DaysOut.js';
import { DAY_RATE, NIGHT_X } from '../src/game/IslandClock.js';
import { BoatController } from '../src/player/BoatController.js';
import { Vector3 } from '../src/engine/index.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const stub = () => {

	const d = Object.create( DaysOut.prototype );
	Object.assign( d, { _T: null, _at: 0, _t: 0, passes: [], rests: [], app: { _pickedUp: true, together: { roomKnown: true }, settings: { day: 1, timeOfDay: 22, timeSpeed: DAY_RATE } } } );
	d._stamp = () => {};
	d.pass = ( h ) => d.passes.push( h );
	d.passed = ( a, b ) => d.rests.push( [ a, b ] );
	return d;

};
const real = Date.now;
let now = 1e12;
Date.now = () => now;
{

	// a frame a few seconds apart at night (10 frames over 40 s: 0.1 s each by the game's clamped time), the clock on the wall's
	const d = stub(), s = d.app.settings;
	d._clock( 0 );
	for ( let i = 0; i < 10; i ++ ) {

		now += 4000;
		s.timeOfDay += 0.16;
		d._clock( 0.1 );

	}

	ok( d.rests.length === 0, `frames 4 s apart at night, 1.6 h on: no rest (${ d.rests.length })` );
	ok( d.passes.length > 0 && Math.abs( d.passes.reduce( ( a, b ) => a + b, 0 ) - ( d._T - 22 ) ) < 1e-6, 'the hours that went by are passed on to the box' );

}

{

	// hidden a minute by day
	const d = stub(), s = d.app.settings;
	s.timeOfDay = 10;
	d._clock( 0 );
	now += 70e3;
	s.timeOfDay += 0.7;
	d._clock( 0.1 );
	ok( d.rests.length === 0 && d.passes.length === 1, `a page hidden 70 s by day, 0.7 h on: no rest, the time passed (${ d.passes })` );
	ok( d._T === s.timeOfDay, 'and it looks from now' );

}

{

	// a rest: the clock moved at once
	const d = stub(), s = d.app.settings;
	s.timeOfDay = 21;
	d._clock( 0 );
	now += 500;
	s.timeOfDay = 23;
	d._clock( 0.016 );
	ok( d.rests.length === 1 && d.rests[ 0 ][ 0 ] === 21 && d.rests[ 0 ][ 1 ] === 23, `a clock moved 2 h in half a second: a rest (${ JSON.stringify( d.rests ) })` );

}

{

	// another room's day; a clock back: neither
	const d = stub(), s = d.app.settings;
	d._clock( 0 );
	s.day = 9;
	d._clock( 0.016 );
	s.day = 1;
	d._clock( 0.016 );
	ok( d.rests.length === 0, 'another room\'s day, and back: no rest' );

}

{

	// held: a rest is still a rest
	const d = stub(), s = d.app.settings;
	s.timeSpeed = 0;
	s.timeOfDay = 8;
	d._clock( 0 );
	now += 600e3;
	s.timeOfDay = 12;
	d._clock( 0.016 );
	ok( d.rests.length === 1, 'the clock held, moved on by hand: a rest' );

}

{

	// (M17) at deep night in company the clock's the room's, read once in a frame, and the wall's time is read here later in it: a
	// slow frame's half second apart either way. Pages hidden 13 s to 5 minutes, each look's clock up to half a second ahead
	// of the wall: no rest. Before, the guard's 1% alone was all it had (looks read 0.986 to 0.994 of what's allowed)
	const rate = NIGHT_X * DAY_RATE;
	let spare = Infinity, spareOld = Infinity, rests = 0, oldRests = 0;
	for ( const gap of [ 13, 20, 30, 60, 120, 300 ] ) for ( const skew of [ - 0.5, - 0.25, 0, 0.25, 0.5 ] ) {

		const d = stub(), s = d.app.settings;
		s.timeOfDay = 22;
		d._clock( 0 );
		const was = now;
		now += gap * 1000;
		s.timeOfDay += ( gap + skew ) * rate;
		const h = ( gap + skew ) * rate;
		// (what's to spare, in the wall's seconds: what the guard allows the clock, less what it ran)
		spare = Math.min( spare, ( ( now - was ) / 1000 + 2 ) * 1.01 - h / rate );
		spareOld = Math.min( spareOld, ( now - was ) / 1000 * 1.01 - h / rate );
		if ( h > ( now - was ) / 1000 * rate * 1.01 ) oldRests ++;
		d._clock( 0.1 );
		rests += d.rests.length;

	}

	ok( rests === 0, `deep night, pages hidden 13 s to 5 min, the clock up to 0.5 s off the wall: no rest (${ rests }; the old guard took ${ oldRests } of 30 for one)` );
	ok( spare > 1.5, `the least to spare at a look: ${ spare.toFixed( 2 ) } s of the wall (the old guard's ${ spareOld.toFixed( 2 ) } s; a slow frame's 0.5 s)` );

}

{

	// a real jump at deep night is still one: a rest just after a page hidden 10 s, and a tow's half hour after a second's look
	const d = stub(), s = d.app.settings, rate = NIGHT_X * DAY_RATE;
	s.timeOfDay = 22;
	d._clock( 0 );
	now += 10e3;
	s.timeOfDay += 10 * rate + 0.6;
	d._clock( 0.1 );
	ok( d.rests.length === 1, `a 0.6 h rest straight after a page hidden 10 s at night: a rest (${ JSON.stringify( d.rests ) })` );
	const e = stub(), t = e.app.settings;
	t.timeOfDay = 23;
	e._clock( 0 );
	now += 1000;
	t.timeOfDay += rate + 0.51;
	e._clock( 0.1 );
	ok( e.rests.length === 1, `a tow's 0.51 h after a second's look at night: a rest (${ JSON.stringify( e.rests ) })` );

}

Date.now = real;

// ---- set down by a reckoning, she's up clear of the ground (BoatController.liftClear): its spring would throw her into the air
{

	const v = ( x, y, z ) => new Vector3( x, y, z );
	const b = {
		position: v( 0, 0, 0 ), contactPoints: [ v( 0, - 1, 4 ), v( 0, - 1, 0 ), v( 0, - 1, - 4 ) ],
		toWorld: ( p, out ) => out.copy( p ).add( b.position ),
		terrain: { heightAt: ( x, z ) => 1 + z * 0.2 }, // (a beach, rising to the bow)
	};
	BoatController.prototype.liftClear.call( b );
	ok( Math.abs( b.position.y - 2.8 ) < 1e-9, `on a beach rising to her bow: lifted till her highest contact's on it, y ${ b.position.y.toFixed( 2 ) }` );
	b.terrain = { heightAt: () => - 20 };
	b.position.y = 0;
	BoatController.prototype.liftClear.call( b );
	ok( b.position.y === 0, 'afloat in deep water: not touched' );

}

console.log( bad ? `${ bad } FAILED` : 'all ok' );
process.exit( bad ? 1 : 0 );
