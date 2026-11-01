// (M16) The kayak: her lines against the photographs' figures, paddling at a real pace with nothing burned, a seat you can
// fish from, the sea putting her over, and her lying on the sand.
import { KayakModel } from '../src/world/boat/kayak/KayakModel.js';
import { KAYAK_HANDLING, paddling } from '../src/world/boat/kayak/Paddle.js';
import { LENGTH } from '../src/world/boat/kayak/KayakLines.js';
import { capsizeHeel, breakerCapsizes, spillShare, climbSeconds, soakStep, HEEL, SOAKED } from '../src/world/boat/kayak/Capsize.js';
import { dryFrom, waterFrom, layOn, DRY, AFLOAT } from '../src/world/boat/kayak/Shore.js';
import { BoatController, MAX_HULL_SAMPLES } from '../src/player/BoatController.js';
import { Quaternion, Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { BOATS } from '../src/world/boat/Boats.js';
import { Waves } from '../src/ocean/Waves.js';
import { weatherAt } from '../src/game/Weather.js';

const limit = ( hands ) => capsizeHeel( false, hands );
let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
const wind = ( U, x = 1, y = 0 ) => {

	G.windSpeed.value = U;
	G.windDir.value.set( x, y );

};

const boat = ( ground = - 50 ) => {

	const m = new KayakModel();
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: typeof ground === 'function' ? ground : () => ground }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	ctl.beached = false;
	return { m, ctl };

};

let t = 0;
const run = ( ctl, seconds, th = 0, st = 0 ) => {

	for ( let f = 0, n = Math.round( seconds * 60 ); f < n; f ++ ) {

		t += 1 / 60;
		query.version ++;
		query.resultTime = t;
		ctl.setInput( th, st, 1 / 60 );
		ctl.update( 1 / 60 );

	}

};

const yawTurned = ( ctl, seconds, th, st ) => {

	let a = 0, last = ctl.getYaw();
	for ( let i = 0; i < seconds * 10; i ++ ) {

		run( ctl, 0.1, th, st );
		const y = ctl.getYaw();
		a += Math.atan2( Math.sin( y - last ), Math.cos( y - last ) );
		last = y;

	}

	return a / seconds * 180 / Math.PI;

};

// what she is
{

	const m = new KayakModel(), L = m.lines, D = m.dimensions;
	ok( Math.abs( L.length - LENGTH ) < 1e-9 && Math.abs( LENGTH / 0.3048 - 12 ) < 0.05, `12 ft long (${ ( L.length / 0.3048 ).toFixed( 2 ) })` );
	ok( D.beam > 0.76 && D.beam < 0.84, `about 31 in across (${ ( D.beam / 0.0254 ).toFixed( 1 ) })` );
	ok( m.hydro.suggestedMass > 110 && m.hydro.suggestedMass < 140, `floats on her waterline with someone in her (${ m.hydro.suggestedMass } kg)` );
	ok( D.freeboard > 0.12 && D.freeboard < 0.26, `low to the water: ${ ( D.freeboard * 100 ).toFixed( 0 ) } cm of side` );
	ok( m.hullSamples.length <= MAX_HULL_SAMPLES, `${ m.hullSamples.length } buoyancy samples` );
	ok( m.seated && m.helm && m.helmEye.y < 1, `sat in, her eye ${ m.helmEye.y.toFixed( 2 ) } m off the water` );
	ok( m.triangleCount < 7000, `${ m.triangleCount } triangles` );
	ok( Object.keys( m.meshes ).length <= 2, `${ Object.keys( m.meshes ).length } meshes of her own` );
	ok( m.handling.engine === null && BOATS.kayak.fuel === null, 'no engine, nothing to burn' );
	ok( m.handling.propulsion === paddling, 'driven by a paddle' );
	// the deck's wells are below her gunwale, and her deck's above the water
	const deck = m.deck, seat = deck.y( 0, m.seat.z ), rim = L.sheerY( L.tAtSheerZ( m.seat.z ) );
	ok( seat > 0 && seat < rim - 0.08, `the seat's well: ${ ( seat * 100 ).toFixed( 0 ) } cm above the water, ${ ( ( rim - seat ) * 100 ).toFixed( 0 ) } cm below her gunwale` );
	// what's bought shows, with no new draw
	const pos = m.meshes.hull.geometry.attributes.position, seen = ( k ) => {

		const { start, count } = m._fitted[ k ];
		const x0 = pos.getX( start );
		let spread = 0;
		for ( let i = start; i < start + count; i ++ ) spread = Math.max( spread, Math.abs( pos.getX( i ) - x0 ) );
		return spread > 0;

	};

	ok( seen( 'cooler' ) && ! seen( 'crate' ) && ! seen( 'puck' ) && ! seen( 'trolley' ), 'she starts with the small cooler and nothing else' );
	m.fit( { holdKg: 40, finder: true, trolley: true } );
	ok( ! seen( 'cooler' ) && seen( 'crate' ) && seen( 'puck' ) && seen( 'trolley' ), 'Marta\'s crate takes its place, and the puck and trolley show' );
	m.dispose();

}

// paddling
{

	wind( 0 );
	const { m, ctl } = boat();
	run( ctl, 8 );
	ok( Math.abs( ctl.position.y ) < 0.03, `floats level (${ ctl.position.y.toFixed( 3 ) } m)` );
	ctl.driven = true;
	const pace = ( th, s = 30 ) => {

		run( ctl, s, th );
		let v = 0;
		for ( let i = 0; i < 120; i ++ ) {

			run( ctl, 0.05, th );
			v += ctl.forwardSpeed / 120;

		}

		return v / 0.5144;

	};

	const k = pace( 0.7 );
	ok( k > 2.7 && k < 3.4, `the usual pace is about 3 knots (${ k.toFixed( 2 ) })` );
	const hard = pace( 1 );
	ok( hard > k + 0.5 && hard < 4.6, `digging in, a little under her hull speed (${ hard.toFixed( 2 ) })` );
	const light = pace( 0.3 );
	ok( light < k - 0.3, `an easy pace, slower (${ light.toFixed( 2 ) })` );
	const going = pace( 0.7 );
	let d = 0, s = 0;
	while ( ctl.forwardSpeed > 0.1 && s < 20 ) {

		const a = ctl.position.clone();
		run( ctl, 0.05, - 0.7 );
		d += a.distanceTo( ctl.position );
		s += 0.05;

	}

	ok( s < 6 && d < 6, `back-paddling stops her from ${ ( going ).toFixed( 1 ) } knots in ${ d.toFixed( 1 ) } m` );
	run( ctl, 6 );
	const spin = yawTurned( ctl, 6, 0, 1 );
	ok( spin > 18 && spin < 60, `spins to port on the spot: ${ spin.toFixed( 0 ) } deg/s` );
	run( ctl, 8 );
	const back = yawTurned( ctl, 6, 0, - 1 );
	ok( back < - 18 && back > - 60, `and to starboard: ${ back.toFixed( 0 ) } deg/s` );
	run( ctl, 8 );
	run( ctl, 15, 0.7 );
	const way = yawTurned( ctl, 6, 0.7, 1 );
	ok( way > 6 && way < 30, `turns under way: ${ way.toFixed( 0 ) } deg/s, still going at ${ ctl.forwardSpeed.toFixed( 1 ) } m/s` );
	// strokes alternate, each side, and pull her bow a little to their side
	run( ctl, 10, 0.7 );
	const sides = new Set();
	for ( let i = 0; i < 40; i ++ ) {

		run( ctl, 0.1, 0.7 );
		sides.add( m.stroke.side );

	}

	ok( sides.size === 2, 'strokes go side to side' );
	// the paddle's in the water for its pull, and out of it between
	const blades = [];
	for ( let i = 0; i < 80; i ++ ) {

		run( ctl, 0.05, 0.7 );
		blades.push( m.stroke.wet );

	}

	ok( blades.includes( true ) && blades.includes( false ), 'the blade goes in and comes out' );
	// laid by with the rod out, she stops being paddled
	m.stroke.held = true;
	run( ctl, 20, 0.7 );
	ok( Math.abs( ctl.forwardSpeed ) < 0.8, `with the paddle laid by she runs on and slows (${ ctl.forwardSpeed.toFixed( 2 ) } m/s after 20 s)` );
	ctl.driven = false;
	m.dispose();

}

// the wind
{

	wind( 8 );
	const { m, ctl } = boat();
	ctl.quaternion.identity();
	run( ctl, 25 );
	const v = ctl.velocity.length() / 8;
	ok( v > 0.03 && v < 0.09, `left alone she drifts at about 5% of the wind (${ ( v * 100 ).toFixed( 1 ) }%), as the away reckoning has it` );
	const heel = ( c ) => Math.asin( Math.min( 1, Math.hypot( new Vector3( 0, 1, 0 ).applyQuaternion( c.quaternion ).x, new Vector3( 0, 1, 0 ).applyQuaternion( c.quaternion ).z ) ) );
	wind( 30 );
	run( ctl, 15 );
	ok( new Vector3( 0, 1, 0 ).applyQuaternion( ctl.quaternion ).y > 0.3, `nobody aboard, a storm's wind heels her but never turns her over (${ ( heel( ctl ) * 57.3 ).toFixed( 0 ) } deg)` );
	m.dispose();
	// someone sat in her, beam on, leaning against it
	const beam = ( U ) => {

		wind( U );
		const { m: mm, ctl: c } = boat();
		c.quaternion.identity();
		c.driven = true;
		let most = 0;
		for ( let i = 0; i < 300; i ++ ) {

			run( c, 0.05, 0, 0 );
			most = Math.max( most, heel( c ) );

		}

		mm.dispose();
		return most;

	};

	const breezy = beam( 9 ), squall = beam( 24 );
	ok( breezy < HEEL.fishing * 0.4, `a fresh breeze on the beam is nothing to her (${ ( breezy * 57.3 ).toFixed( 0 ) } deg)` );
	ok( squall > HEEL.idle, `a squall's gust on the beam puts her past holding (${ ( squall * 57.3 ).toFixed( 0 ) } deg)` );
	// and bow to it she's fine: that's how you ride one out
	wind( 24, 0, - 1 );
	{

		const { m: mm, ctl: c } = boat();
		c.quaternion.identity();
		c.driven = true;
		let most = 0;
		for ( let i = 0; i < 40; i ++ ) {

			run( c, 0.05, 0.7, 0 );
			most = Math.max( most, heel( c ) );

		}

		ok( most < HEEL.idle, `bow to it she stands up to the same wind (${ ( most * 57.3 ).toFixed( 0 ) } deg)` );
		mm.dispose();

	}

	wind( 0 );

}

// each weather's real sea (ocean/Waves, on the CPU as the water query does it), out in the open: how often she goes past holding
{

	const heelsOver = async ( pick, hands, seconds = 45 ) => {

		const w = weatherAt( 250, pick, 0 ), waves = new Waves( { tier: 'low', terrain: null } );
		wind( w.wind, 0, 1 );
		waves.setWindDir( G.windDir.value, { x: 0, z: 0 } );
		waves.setSea( w.swell, w.windSea );
		waves.setWind( w.wind );
		const q2 = { ...query, cpu: new Float32Array( 4096 ), pts: new Float64Array( 4096 ), setPoint( i, x, z ) {

			this.pts[ i * 4 ] = x;
			this.pts[ i * 4 + 1 ] = z;

		} };
		q2.resultInputs = q2.pts;
		const m = new KayakModel(), c = new BoatController( { model: m, query: q2, terrain: { heightAt: () => - 200 }, colliders: null } );
		c.beached = c.moored = false;
		c.position.set( 3000, 0, 3000 );
		c.driven = true;
		c.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), Math.PI / 2 );
		m.stroke.held = hands;
		const limit = capsizeHeel( false, hands ), now = new Vector3();
		let most = 0, T = 100, over = 0;
		for ( let f = 0; f < seconds * 30; f ++ ) {

			T += 1 / 30;
			G.time.value = T;
			c.queueQueries();
			for ( let i = 0; i < c.samples.length; i ++ ) q2.cpu[ i * 4 ] = waves.heightAt( q2.pts[ i * 4 ], q2.pts[ i * 4 + 1 ], T );
			q2.version ++;
			q2.resultTime = T;
			c.setInput( 0, 0, 1 / 30 );
			c.update( 1 / 30 );
			now.set( 0, 1, 0 ).applyQuaternion( c.quaternion );
			const h = Math.asin( Math.min( 1, Math.hypot( now.x, now.z ) ) );
			most = Math.max( most, h );
			if ( h > limit ) over ++;

		}

		m.dispose();
		return { most, over };

	};

	for ( const pick of [ 'calm', 'fair', 'breezy' ] ) {

		const r = await heelsOver( pick, true );
		ok( r.over === 0, `${ pick }: you can sit and fish beam on all day (${ ( r.most * 57.3 ).toFixed( 0 ) } deg at most, ${ ( limit( true ) * 57.3 ).toFixed( 0 ) } puts her over)` );

	}

	const gale = await heelsOver( 'gale', false );
	ok( gale.over > 0, `a gale's wind and sea on her beam puts her over (${ ( gale.most * 57.3 ).toFixed( 0 ) } deg)` );
	wind( 0 );

}

// what puts her over and what it costs
{

	ok( capsizeHeel( true, false ) > capsizeHeel( false, false ) && capsizeHeel( false, false ) > capsizeHeel( false, true ), 'a blade in the water holds her longest, a rod in your hands least' );
	ok( ! breakerCapsizes( 2.8, 0 ) && breakerCapsizes( 3.2, 0 ), 'the biggest of a fair day\'s breakers doesn\'t roll her, on the beam; one past it does' );
	ok( ! breakerCapsizes( 3.2, 1 ) && breakerCapsizes( 4.4, 1 ), 'she takes more on the bow' );
	ok( spillShare( true ) < spillShare( false ) && climbSeconds( true ) < climbSeconds( false ), 'a life jacket costs you less of it' );
	let s = 0;
	for ( let i = 0; i < 90; i ++ ) s = soakStep( s, 1, { rain: 1 } );
	ok( s > SOAKED, `a downpour soaks you in a minute or two (${ s.toFixed( 2 ) })` );
	const dry = soakStep( 0, 60, {} );
	ok( dry === 0, 'a dry day doesn\'t' );
	s = 0;
	for ( let i = 0; i < 40; i ++ ) s = soakStep( s, 0.1, { wash: 0.3 } );
	ok( s > SOAKED, `a sea over her deck does it in moments (${ s.toFixed( 2 ) })` );
	s = 1;
	for ( let i = 0; i < 900; i ++ ) s = soakStep( s, 1, { wind: 6 } );
	ok( s < 0.2, `and you dry off in a quarter of an hour or so (${ s.toFixed( 2 ) })` );
	s = soakStep( 0.5, 10, { rain: 1, sheltered: true } );
	ok( s < 0.5, 'under a roof it doesn\'t rain on you' );

}

// the sand
{

	// a beach falling toward +z, with the water's edge at z = 0: 1 in 12
	const T = { heightAt: ( x, z ) => - z / 12 };
	const up = dryFrom( T, 0, 3, - 1 );
	ok( up && T.heightAt( up.x, up.z ) >= DRY - 0.01, `pulled up clear of the wash (${ T.heightAt( up.x, up.z ).toFixed( 2 ) } m up)` );
	ok( up && Math.abs( up.heading ) < 0.05, 'her bow to the sea, ready to go' );
	const down = waterFrom( T, 0, up.x, up.z );
	ok( down && - T.heightAt( down.x, down.z ) >= AFLOAT - 0.01, `shoved down to where she floats free, ${ down.metres.toFixed( 1 ) } m` );
	ok( dryFrom( { heightAt: ( x, z ) => - z * 2 }, 0, 0, 3 ) === null, 'a cliff\'s no beach' );
	const P = new Vector3(), Q = new Quaternion();
	layOn( T, 0, 0, - 12, 0, P, Q );
	ok( Math.abs( P.y - ( 1 + 0.122 ) ) < 0.02, `she lies on the sand on her keel (${ P.y.toFixed( 2 ) })` );
	const fwd = new Vector3( 0, 0, 1 ).applyQuaternion( Q );
	ok( fwd.y < - 0.05 && fwd.y > - 0.15, `nose down the slope (${ fwd.y.toFixed( 3 ) })` );
	layOn( T, 0, 0, 12, 0, P, Q );
	ok( Math.abs( P.y ) < 1e-6, 'and afloat where the sand\'s under water' );

	// at home she's on the sand, doesn't move, and is got off it again
	const sand = ( x, z ) => - ( z + 24 ) / 12;
	const m = new KayakModel();
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: sand }, colliders: null } );
	ok( ctl.beached && ! ctl.moored, 'she starts on the sand' );
	const at = ctl.position.clone();
	run( ctl, 2 );
	ok( ctl.position.distanceTo( at ) < 1e-6, 'and stays there' );
	ctl.reset();
	ok( ctl.beached, 'a tow, or the safety net, puts her back on it' );
	m.dispose();

}

// nothing's left of the paddle's force when she's out of the water, or there's nobody paddling
{

	wind( 0 );
	const { m, ctl } = boat();
	ctl.driven = false;
	run( ctl, 4, 1, 1 );
	ok( ctl.speed < 0.05, 'with nobody in her, she doesn\'t paddle herself' );
	m.dispose();

}

ok( KAYAK_HANDLING.rudder === null, 'nothing reads a rudder of hers' );

if ( bad ) {

	console.log( `${ bad } failed` );
	process.exit( 1 );

}
