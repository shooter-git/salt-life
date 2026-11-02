// (M16) The center console: her lines and her figures against the real boat's; outboards that steer by thrust; her pace; the
// deck all round the helm; her fittings coming and going; the T-top keeping the rain off.
import { ConsoleModel } from '../src/world/boat/console/ConsoleModel.js';
import { CONSOLE_HANDLING } from '../src/world/boat/console/ConsoleHandling.js';
import { DECK } from '../src/world/boat/console/ConsoleHull.js';
import { TOP, CONSOLE, POST } from '../src/world/boat/console/ConsoleHelm.js';
import { TRIM, trimFor } from '../src/world/boat/console/Outboards.js';
import { soakRate, Soak } from '../src/world/boat/console/Soak.js';
import { BoatController } from '../src/player/BoatController.js';
import { Vector3 } from '../src/engine/index.js';
import { seenInWater, SEEN } from '../src/materials/SeenInWater.js';
import { Wake, wakeTan } from '../src/ocean/Wake.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const KT = 0.51444;
const m = new ConsoleModel();
const L = m.lines;

// ---- her lines, against a Regulator 23's (LOA 23'5", beam 8'6", 24° at the transom, draft 1'9")
ok( Math.abs( m.dimensions.length / 0.3048 - 23.42 ) < 0.3, `length ${ ( m.dimensions.length / 0.3048 ).toFixed( 1 ) } ft` );
ok( Math.abs( m.dimensions.beam / 0.3048 - 8.5 ) < 0.1, `beam ${ ( m.dimensions.beam / 0.3048 ).toFixed( 1 ) } ft` );
const dr = Math.atan2( L.chineY( 0 ) - L.keelY( 0 ), L.chineX( 0 ) ) * 180 / Math.PI;
ok( dr > 22 && dr < 28, `deadrise at the transom ${ dr.toFixed( 1 ) }°` );
ok( m.dimensions.draft > 0.45 && m.dimensions.draft < 0.6, `draft ${ m.dimensions.draft.toFixed( 2 ) } m` );
ok( m.hydro.suggestedMass > 2400 && m.hydro.suggestedMass < 3400, `displacement ${ m.hydro.suggestedMass } kg` );
const sec = L.sectionPoints( 0.3, 2 );
ok( sec.length === L.sectionCount( 2 ) * 2, 'a section has as many points as she says' );
ok( L.panels( 1 )[ L.panels( 1 ).length - 1 ].to === L.sectionCount( 1 ) - 1, 'her panels run keel to sheer' );
let rising = true;
for ( let i = 1; i <= 40; i ++ ) if ( L.sheerZ( i / 40 ) <= L.sheerZ( ( i - 1 ) / 40 ) || L.station( i / 40, 1 )[ 0 ].z < L.station( ( i - 1 ) / 40, 1 )[ 0 ].z - 0.001 ) rising = false;
ok( rising, 'her keel runs forward all the way to the stem' );

// ---- what the sea can see down to: her materials leave their height in the frame's alpha (materials/SeenInWater.js)
{

	const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <opaque_fragment>' };
	seenInWater( shader );
	ok( shader.fragmentShader.includes( 'gl_FragColor.a' ) && shader.vertexShader.includes( 'vSeenY' ), 'a boat\'s height goes to the frame\'s alpha' );
	const at = ( y ) => Math.min( ( y + SEEN.base ) / SEEN.span, 1 );
	ok( at( 0 ) < SEEN.plain && at( - 1.4 ) >= 0 && at( 5.8 ) >= SEEN.plain, 'all under the water and her lower topsides read as hers, above that as nothing' );

}

// ---- her wake (ocean/Wake.js): as long as it's meant to be, at any frame rate, opening at a real wake's angle
{

	const waves = { heightAt: () => 0 }, U = 18.5;
	const run = ( tier, frame ) => {

		const boat = { velocity: new Vector3( 0, 0, U ), rpm: 1, getYaw: () => 0, model: { group: { position: new Vector3() }, wake: m.wake, dimensions: m.dimensions } };
		const w = new Wake( { scene: { add() {} }, boat, waves, tier } );
		for ( let t = 0; t < 20; t += frame ) {

			boat.model.group.position.z += U * frame;
			w.update( frame );

		}

		const live = [];
		for ( let i = 0; i < w.max; i ++ ) if ( w.data[ i * 4 + 2 ] < w.life ) live.push( { z: w.xz[ i * 2 + 1 ], x: w.xz[ i * 2 ], age: w.data[ i * 4 + 2 ], arm: w.size[ i * 3 + 2 ] > 2 } );
		return { w, live, z: boat.model.group.position.z };

	};

	for ( const [ tier, reach ] of [ [ 'high', 130 ], [ 'low', 90 ] ] ) {

		const { live, z } = run( tier, 1 / 60 );
		const far = z - Math.min( ...live.map( ( q ) => q.z ) );
		ok( far > reach, `flat out, her wake reaches ${ far.toFixed( 0 ) } m behind her on ${ tier }` );

	}

	const steps = ( frame ) => {

		const zs = run( 'high', frame ).live.filter( ( q ) => ! q.arm ).map( ( q ) => q.z ).sort( ( a, b ) => a - b );
		return zs.slice( 1 ).map( ( v, i ) => v - zs[ i ] );

	};

	const worst = Math.max( ...steps( 0.1 ) ), usual = Math.max( ...steps( 1 / 60 ) );
	ok( worst < usual * 1.5, `slow frames don't heap them: ${ worst.toFixed( 1 ) } m apart at most at 10 fps, ${ usual.toFixed( 1 ) } at 60` );
	ok( Math.abs( wakeTan( 3, 100 ) - 0.3536 ) < 1e-3, 'a slow ship\'s wake opens at Kelvin\'s 19.47 degrees' );
	const deg = Math.atan( wakeTan( U, m.dimensions.waterlineLength ) ) * 57.3;
	ok( deg > 4 && deg < 7, `flat out, hers opens at ${ deg.toFixed( 1 ) } degrees, as fast boats' do` );

}

// ---- budgets
const tris = m.triangleCount;
ok( tris <= 35000, `triangles ${ tris } of 35,000` );
ok( Object.keys( m.meshes ).length <= 10, `draw calls ${ Object.keys( m.meshes ).length } of 10` );

// ---- the driven boat, on flat water
const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
let t = 0;
// (her pace as Gear's twin 150s give it, Game's speedMul; the base engine's a single 150)
const speedMul = ( k ) => {

	ctl.maxThrust = CONSOLE_HANDLING.engine.maxThrust * k * k;
	ctl.pitchSpeed = CONSOLE_HANDLING.engine.pitchSpeed * k;

};

const start = ( y = 0 ) => {

	ctl.position.set( 0, y, 0 );
	ctl.velocity.set( 0, 0, 0 );
	ctl.angular.set( 0, 0, 0 );
	ctl.quaternion.identity();
	ctl.moored = false;
	ctl.steer = ctl.throttle = 0;

};

const run = ( seconds, th, st = 0, each ) => {

	for ( let f = 0; f < seconds * 60; f ++ ) {

		t += 1 / 60;
		query.version ++;
		query.resultTime = t;
		ctl.setInput( th, st, 1 / 60 );
		ctl.update( 1 / 60 );
		if ( each ) each( f / 60 );

	}

};

const pitch = () => {

	const f = new Vector3( 0, 0, 1 ).applyQuaternion( ctl.quaternion );
	return Math.asin( f.y ) * 180 / Math.PI;

};

const roll = () => {

	const s = new Vector3( 1, 0, 0 ).applyQuaternion( ctl.quaternion );
	return Math.asin( s.y ) * 180 / Math.PI;

};

start();
run( 12, 0 );
ok( Math.abs( ctl.position.y ) < 0.1, `floats on her waterline (${ ctl.position.y.toFixed( 3 ) } m), trim ${ pitch().toFixed( 1 ) }°` );
ok( m._trim > TRIM.up - 0.05, 'nobody at the helm: her engines tilted up out of the water' );
ctl.driven = true;
run( 8, 0 );
ok( m._trim < TRIM.run, `at the helm: down in the water (${ ( m._trim * 57.3 ).toFixed( 1 ) }°)` );

// her pace, lever by lever, against the real boat's: 0.7 of the lever (4200 rpm) her cruise, about 30 kn; all of it 42 to 48 mph
const table = [];
speedMul( 1.25 );
let toPlane = null, plowing = 0;
run( 20, 1, 0, ( s ) => {

	if ( toPlane === null && pitch() > 3 && ctl.forwardSpeed > 7.5 ) toPlane = s;
	plowing = Math.max( plowing, pitch() );

} );
const full = ctl.forwardSpeed, fullPitch = pitch(), fullY = ctl.position.y;
table.push( `1.0: ${ ( full / KT ).toFixed( 1 ) } kn, ${ fullPitch.toFixed( 1 ) }°, rise ${ fullY.toFixed( 2 ) } m` );
ok( full / KT > 38 && full / KT < 46, `twin 150s, full throttle ${ ( full / KT ).toFixed( 1 ) } kn (the real boat: 42 kn, 48 mph)` );
ok( toPlane !== null && toPlane < 7, `on the plane in ${ toPlane?.toFixed( 1 ) } s` );
ok( plowing > 4 && plowing < 12, `her bow up over the hump ${ plowing.toFixed( 1 ) }°` );
ok( fullPitch > 1 && fullPitch < 6.5, `running trim ${ fullPitch.toFixed( 1 ) }°` );
ok( fullY > 0.02 && fullY < 0.5, `lifted ${ fullY.toFixed( 2 ) } m on the plane` );
ok( m._trim > 0, `engines trimmed out at speed (${ ( m._trim * 57.3 ).toFixed( 1 ) }°)` );

start();
ctl.driven = true;
run( 26, 0.7 );
const cruise = ctl.forwardSpeed;
table.push( `0.7: ${ ( cruise / KT ).toFixed( 1 ) } kn, ${ pitch().toFixed( 1 ) }°` );
ok( cruise / KT > 27 && cruise / KT < 33, `twin 150s, cruise ${ ( cruise / KT ).toFixed( 1 ) } kn at W (4200 rpm)` );
speedMul( 1 );
start();
ctl.driven = true;
run( 30, 0.7 );
const cruise1 = ctl.forwardSpeed;
run( 18, 1 );
const full1 = ctl.forwardSpeed;
ok( cruise1 / KT > 21 && cruise1 / KT < 29, `a single 150, on the plane at W: ${ ( cruise1 / KT ).toFixed( 1 ) } kn` );
ok( full1 / KT > 31 && full1 / KT < 39, `a single 150, flat out: ${ ( full1 / KT ).toFixed( 1 ) } kn` );
speedMul( 1.25 );

start();
ctl.driven = true;
run( 16, 0.35 );
table.push( `0.35: ${ ( ctl.forwardSpeed / KT ).toFixed( 1 ) } kn, ${ pitch().toFixed( 1 ) }°` );
ok( ctl.forwardSpeed / KT < 12, `a little throttle doesn't plane her (${ ( ctl.forwardSpeed / KT ).toFixed( 1 ) } kn, bow up ${ pitch().toFixed( 1 ) }°)` );
console.log( '     ' + table.join( ' · ' ) );

// off the throttle: she comes off the plane within a few of her lengths
run( 0.01, 1 );
start();
ctl.driven = true;
run( 18, 0.7 );
const x0 = ctl.position.z;
let down = 0;
run( 25, 0, 0, () => {

	if ( ! down && ctl.forwardSpeed < 2 ) down = ctl.position.z - x0;

} );
ok( down > 15 && down < 170, `off the throttle at cruise she's down to 4 kn in ${ down.toFixed( 0 ) } m` );

// ---- steering by thrust: with no way on, the stern's pushed first and she turns
start();
ctl.driven = true;
run( 3, 0 );
ctl.angular.set( 0, 0, 0 );
ctl.velocity.set( 0, 0, 0 );
const y0 = ctl.getYaw();
run( 3, 0.35, 1 );
const turned = ( ctl.getYaw() - y0 ) * 57.3;
ok( turned > 5, `from a standstill, wheel over and a touch ahead: she turns to port (${ turned.toFixed( 0 ) }° in 3 s)` );
// astern, the same wheel takes her stern to port: the bow goes the other way, as an outboard's does
start();
ctl.driven = true;
run( 3, 0 );
const yb = ctl.getYaw();
run( 3, - 0.4, 1 );
const back = ( ctl.getYaw() - yb ) * 57.3;
ok( back < - 3, `astern with the wheel to port her stern goes to port (${ back.toFixed( 0 ) }°)` );
ok( ctl.forwardSpeed < 0, `she goes astern (${ ctl.forwardSpeed.toFixed( 1 ) } m/s)` );

// at speed: the circle, and she leans into it (a deep-V does)
start();
ctl.driven = true;
run( 18, 0.7 );
const v0 = ctl.forwardSpeed;
let minRoll = 0, maxRoll = 0;
let yawRate = 0;
run( 12, 0.7, 1, () => {

	minRoll = Math.min( minRoll, roll() );
	maxRoll = Math.max( maxRoll, roll() );
	yawRate = Math.max( yawRate, Math.abs( ctl.angular.y ) );

} );
const radius = ctl.speed / Math.max( Math.abs( ctl.angular.y ), 1e-3 );
console.log( `     ω ${ ctl.angular.y.toFixed( 2 ) } rad/s, peak ${ yawRate.toFixed( 2 ) }, roll ${ minRoll.toFixed( 1 ) } .. ${ maxRoll.toFixed( 1 ) }` );
ok( radius > 12 && radius < 60, `hard over at cruise: a ${ radius.toFixed( 0 ) } m turning radius (${ ( ctl.speed / KT ).toFixed( 0 ) } kn from ${ ( v0 / KT ).toFixed( 0 ) } kn)` );
const lean = roll();
// (a turn to port: her port side down: the rail's +X lower, roll's sign says it)
ok( lean < - 4 && lean > - 28, `she leans into the turn (${ lean.toFixed( 1 ) }°, port side down)` );
ok( ctl.isFinite(), 'stays finite' );

// out of the water she's nothing to bite: lift her and the thrust goes
start();
ctl.driven = true;
run( 3, 0 );
run( 2, 1 );
const biting = ctl.thrust;
ctl.position.y = 1.2;
query.version ++;
ctl.step( 1 / 120 );
ok( ctl.thrust < biting * 0.2, `the prop out of the water: ${ ctl.thrust.toFixed( 0 ) } N from ${ biting.toFixed( 0 ) } N` );
ok( trimFor( true, 20 ) > trimFor( true, 2 ), 'trimmed out at speed, in to get up' );
ok( trimFor( false, 0 ) === TRIM.up, 'tilted up with no one driving' );

speedMul( 1 );

// ---- the deck all round the helm
const walker = new Vector3();
const walk = ( x, z, y = DECK.sole ) => {

	walker.set( x, y, z );
	const r = 0.24;
	m.clampToDeck( walker, r );
	// pushed out of the solids as Player's does
	for ( let it = 0; it < 2; it ++ ) for ( const c of m.colliders ) {

		if ( ! c.solid ) continue;
		const top = c.center.y + c.half.y, bot = c.center.y - c.half.y;
		if ( top <= walker.y + 0.36 || bot >= walker.y + 1.75 ) continue;
		const ex = c.half.x + r, ez = c.half.z + r, dx = walker.x - c.center.x, dz = walker.z - c.center.z;
		if ( Math.abs( dx ) >= ex || Math.abs( dz ) >= ez ) continue;
		const px = ex - Math.abs( dx ), pz = ez - Math.abs( dz );
		if ( px < pz ) walker.x += Math.sign( dx || 1 ) * px; else walker.z += Math.sign( dz || 1 ) * pz;

	}

	m.clampToDeck( walker, r );
	return walker;

};

for ( const s of [ 1, - 1 ] ) {

	let through = true;
	for ( let z = POST.z0 - 0.3; z < CONSOLE.front + 0.7; z += 0.1 ) {

		walk( s * 0.76, z );
		if ( Math.abs( walker.z - z ) > 0.02 ) through = false;

	}

	ok( through, `the side deck to ${ s > 0 ? 'port' : 'starboard' } of the helm is clear from stern to bow` );

}

walk( 0, 1.4 );
ok( Math.abs( walker.x ) < 0.1 && Math.abs( walker.z - 1.4 ) < 0.3, 'you can stand ahead of the console, at its seat' );
walk( 0, - 2.2 );
ok( Math.abs( walker.z + 2.2 ) < 0.02, 'and in the cockpit aft' );
const ground = ( x, z, maxY ) => {

	let g = m.soleY( x, z, maxY );
	for ( const c of m.colliders ) {

		if ( ! c.walkable ) continue;
		if ( Math.abs( x - c.center.x ) > c.half.x || Math.abs( z - c.center.z ) > c.half.z ) continue;
		const top = c.center.y + c.half.y;
		if ( top <= maxY && top > g ) g = top;

	}

	return g;

};

// up the bow: every step's within a stride, from the sunk sole to the foredeck's head
let h = DECK.sole, stepped = true, best = h;
for ( let z = 1.6; z < 3.28; z += 0.05 ) {

	const x = z > 2.56 ? 0 : 0.6;
	const g = ground( x, z, h + 0.36 );
	if ( g < h - 0.01 ) stepped = false;
	h = Math.max( h, g );
	best = h;

}

ok( stepped && best > 1.01, `the bow's seats and riser walk up in strides to ${ best.toFixed( 2 ) } m` );
ok( ground( 0, 3.45, best + 0.52 + 0.36 ) > 1.4, `a hop up onto the foredeck, ${ ground( 0, 3.45, best + 0.88 ).toFixed( 2 ) } m` );
// through the door to the platform
walk( - 0.72, - 2.8 );
ok( Math.abs( walker.z + 2.8 ) < 0.03, `through the transom's door (at z ${ walker.z.toFixed( 2 ) })` );
walk( - 0.2, - 3.4 );
ok( Math.abs( walker.z + 3.4 ) < 0.03 && m.soleY( walker.x, walker.z, 1 ) > DECK.sole + 0.1, 'and out on the platform, a step up from the sole' );
walk( 0.8, - 2.1 );
for ( let i = 0; i < 25; i ++ ) walk( walker.x, walker.z - 0.05 );
ok( walker.z > - 2.6, `but not through the box beside it (at z ${ walker.z.toFixed( 2 ) })` );

// ---- what can be fitted
const total = () => Object.values( m.meshes ).reduce( ( n, q ) => n + ( q.geometry.drawRange.count === Infinity ? q.geometry.index.count : q.geometry.drawRange.count ) / 3, 0 );
const dressed = total();
m.fit( {} );
const bare = total();
ok( bare < dressed - 2000, `bare, with nothing fitted: ${ bare | 0 } triangles to her ${ dressed | 0 }` );
ok( ! m.engines[ 1 ].tilt.visible && m.engines[ 0 ].tilt.position.x === 0, 'one engine, on her centreline' );
ok( ! m.underTop( 0, 1, 0 ), 'no top, no shade' );
m.fit( { twin: true, tTop: true, diveLadder: true, tankRack: true } );
ok( total() === dressed, 'all fitted again' );
ok( m.engines[ 1 ].tilt.visible, 'two engines' );
const before = total();
m.setLadder( true );
ok( total() !== before, 'the ladder folds down' );
m.setLadder( false );

// ---- the ladder: where you go in and come out
ok( m.boardFrom( 'walk' ) === null, 'from the pier you board her cockpit' );
const up = m.boardFrom( 'swim' );
ok( up.text === 'Climb the ladder' && up.at.z < L.zAft && up.reach < 3, 'from the water, at her ladder' );
ok( m.overboard( new Vector3( 0.62, 0.5, - 3.4 ), 1 ).quiet, 'down it from the platform, without a splash' );
const rail = m.overboard( new Vector3( 1, 0.32, 1 ), 1 );
ok( ! rail.quiet && rail.at.x > 1.3 && rail.at.z === 1, 'over the rail where you stand' );
m.fit( { tTop: true } );
ok( m.boardFrom( 'swim' ).text !== 'Climb the ladder', 'no ladder: you haul yourself aboard' );
m.fit( { twin: true, tTop: true, diveLadder: true, tankRack: true } );

// ---- the top: under it no rain; outside it you're soaked
const shelterHas = ( x, y, z ) => {

	const p = new Vector3( x, y, z ).applyMatrix4( m.shelter );
	return Math.abs( p.x ) < 1 && Math.abs( p.y ) < 1 && Math.abs( p.z ) < 1;

};

ok( shelterHas( 0.2, 1.8, - 0.6 ), 'the rain\'s box: at the helm you\'re under it' );
ok( ! shelterHas( 0.2, 1.8, 2 ) && ! shelterHas( 0.2, 1.8, - 2.4 ), 'on the bow or at the stern you\'re not' );
ok( m.underTop( 0.2, 1.8, - 0.6 ) && ! m.underTop( 0.2, 1.8, 2 ), 'underTop says the same' );
ok( TOP.under > DECK.sole + 2.05, `headroom under it ${ ( TOP.under - DECK.sole ).toFixed( 2 ) } m` );
ok( soakRate( 1, false, 0 ) > soakRate( 0.3, false, 0 ), 'a downpour soaks you faster than a drizzle' );
ok( soakRate( 1, true, 0 ) < soakRate( 1, false, 0 ) * 0.25, 'under the top hardly at all' );
ok( soakRate( 1, true, 15 ) > soakRate( 1, true, 0 ), 'running flat out the rain drives in under it' );
ok( soakRate( 1, true, 15, true ) < soakRate( 1, true, 15 ) * 0.2, 'but not with its rain cover down' );
const rolled = total();
m.setCover( true );
ok( total() !== rolled, 'the rain cover goes on' );
m.setCover( false );
const soak = new Soak();
for ( let i = 0; i < 300; i ++ ) soak.step( 0.1, 1, false, 0 );
ok( soak.wet > 0.8, `half a minute out in a squall: soaked (${ soak.wet.toFixed( 2 ) })` );
const w = soak.wet;
for ( let i = 0; i < 600; i ++ ) soak.step( 0.1, 0, true, 0 );
ok( soak.wet < w && soak.wet > 0.1, `and it takes a while to dry (${ soak.wet.toFixed( 2 ) } after a minute)` );

// lamps, as the rules want them
ok( m.lamps.port && m.lamps.port[ 0 ] > 0, 'side lights: red to port (mirrored green)' );
ok( m.lamps.masthead && m.lamps.stern.join() === m.lamps.masthead.join(), 'one all-round white, as Rule 23 lets a boat under 12 m' );
ok( CONSOLE_HANDLING.engine.shaftRpm > 0, 'an engine' );
m.dispose();
console.log( bad ? `${ bad } failed` : 'console: all ok' );
if ( bad ) process.exit( 1 );
