// (M19) Stream BOATS (docs/m19/boats.md; the sources in docs/m19/sources-boats-bait.md), on the real boats in plain Node:
//   - the kayak as the Pescador Pilot: pedalled at 3 knots cruising and 3.6 flat out, hands free, turned by her hand rudder; stood
//     up and poled in water her pole reaches the bottom in, not past it; staked out, swinging about her pole;
//   - the console on her trolling motor: her outboards' revs gone, a top of about 4 knots, quiet to the fish; on her Power-Poles,
//     held, her heading too; her fittings drawn as she has them and on others' copies, her plotter split with her radar;
//   - the console's and the sportfisher's bow anchors; the bigger hauler.
//   node test/boats-m19.mjs
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { BoatController } from '../src/player/BoatController.js';
import { KayakModel } from '../src/world/boat/kayak/KayakModel.js';
import { ConsoleModel } from '../src/world/boat/console/ConsoleModel.js';
import { SportfisherModel } from '../src/world/boat/sportfisher/SportfisherModel.js';
import { PEDAL, POLE } from '../src/world/boat/kayak/Pedal.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { fitWire, fitStats } from '../src/together/BoatCopies.js';
import { haulS, HAULER_MS } from '../src/game/Traps.js';
import { KNOTS } from '../src/game/rigs/Presentation.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

G.seaLevel.value = 0;
G.windSpeed.value = 0; // (no wind on her: she'd drift)
// a boat on a flat sea `depth` m deep, driven: { b, run( s, throttle, steer ) -> her speed }
function afloat( model, depth = 10 ) {

	const query = { latency: 0, allocate: ( () => {

		let n = 0;
		return ( name, k ) => {

			const s = n;
			n += k;
			return s;

		};

	} )(), setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 8192 ), resultInputs: new Float64Array( 8192 ) };
	const b = new BoatController( { model, query, terrain: { heightAt: () => - depth }, colliders: null } );
	b.moored = false;
	b.beached = false;
	b.position.set( 0, 0, 0 );
	b.quaternion.identity();
	b.velocity.set( 0, 0, 0 );
	b.driven = true;
	let t = 0;
	const run = ( s, throttle = 0, steer = 0, each = null ) => {

		for ( let i = 0, n = Math.round( s * 60 ); i < n; i ++ ) {

			t += 1 / 60;
			query.version ++;
			query.resultTime = t;
			b.setInput( throttle, steer, 1 / 60 );
			b.update( 1 / 60 );
			if ( each ) each();

		}

		return b.speed;

	};

	return { b, run };

}

// ---- the kayak as the Pilot
{

	const pilot = () => {

		const k = new KayakModel();
		k.fit( gearStats( { ...defaultUpgrades(), kayakPaddle: 2, kayakPole: 1 }, 'kayak' ) );
		return k;

	};

	const k = pilot();
	ok( k.pedal && k.pole, 'the pedal drive bought: she\'s the Pilot, with her pole' );
	k.drive = 'pedal';
	const A = afloat( k );
	A.b.model.stroke.held = true; // (the paddle laid by: Seat's, the rod out)
	const cruise = A.run( 60, 0.7 ) * KNOTS;
	const flat = A.run( 60, 1 ) * KNOTS;
	ok( Math.abs( cruise - 3.0 ) < 0.25 && Math.abs( flat - 3.6 ) < 0.25, `pedalled, the paddle laid by and hands free: ${ cruise.toFixed( 2 ) } knots cruising, ${ flat.toFixed( 2 ) } flat out (an owner's 3 and 3.6)` );
	const y0 = A.b.getYaw();
	A.run( 10, 0.7, 1 );
	const turned = Math.abs( Math.atan2( Math.sin( A.b.getYaw() - y0 ), Math.cos( A.b.getYaw() - y0 ) ) );
	ok( turned > 0.5, `her hand rudder turns her as she goes (${ ( turned * 180 / Math.PI ).toFixed( 0 ) } degrees in 10 s)` );
	const astern = afloat( pilot() );
	astern.b.model.drive = 'pedal';
	astern.b.model.stroke.held = true;
	astern.run( 30, - 0.7 );
	ok( astern.b.forward( new Vector3() ).dot( astern.b.velocity ) < - 0.2, 'and astern' );
	// the drive on the bottom: none in less than its 18 in
	const shoal = afloat( pilot(), 0.3 );
	shoal.b.model.drive = 'pedal';
	shoal.b.model.stroke.held = true;
	ok( shoal.run( 20, 1 ) < 0.05, `in 0.3 m of water the drive's on the bottom: nothing (she needs ${ PEDAL.depth } m)` );
	// stood up and poled
	const flats = afloat( pilot(), 1.0 );
	flats.b.model.drive = 'pole';
	flats.b.model.standing = true;
	flats.b.model.stroke.held = true;
	const poled = flats.run( 30, 1 );
	ok( poled > 0.4 && poled < POLE.fade, `stood up and poled in a metre of water: ${ poled.toFixed( 2 ) } m/s` );
	const deep = afloat( pilot(), 3 );
	deep.b.model.drive = 'pole';
	deep.b.model.stroke.held = true;
	ok( deep.run( 20, 1 ) < 0.02, `in 3 m it doesn't reach: nothing (${ POLE.deep } m)` );
	// staked out: she swings about the pole and stays by it
	const st = afloat( pilot() );
	st.b.velocity.set( 0, 0, 1.2 );
	const at = st.b.toWorld( st.b.model.stakeAt, new Vector3() );
	st.b.stake = { x: at.x, z: at.z, at: st.b.model.stakeAt };
	st.b.driven = false;
	let far = 0;
	st.run( 20, 0, 0, () => {

		const w = st.b.toWorld( st.b.model.stakeAt, new Vector3() );
		far = Math.max( far, Math.hypot( w.x - at.x, w.z - at.z ) );

	} );
	ok( far < 0.6 && st.b.speed < 0.05, `staked out going at 1.2 m/s: her stern strays ${ far.toFixed( 2 ) } m and she settles by her pole` );
	k.setStaked( true );
	const f = fitWire( 'kayak', gearStats( { ...defaultUpgrades(), kayakPaddle: 2, kayakPole: 1 }, 'kayak' ), null, k.fitNow() ), s = fitStats( 'kayak', f );
	ok( s.pedal && s.stakePole && s.staked, 'others\' copies of her: the Pilot, her pole, staked' );
	const was = k.meshes.hull.geometry.attributes.position.array.slice();
	k.setStaked( false );
	ok( k.meshes.hull.geometry.attributes.position.array.some( ( v, i ) => v !== was[ i ] ), 'her pole drawn as it is: stowed again' );

}

// ---- the console
{

	const console_ = ( u = {} ) => {

		const m = new ConsoleModel();
		m.fit( gearStats( { ...defaultUpgrades(), consoleTop: 1, consoleTrolling: 1, consolePole: 1, consoleRadar: 1, ...u }, 'console' ) );
		return m;

	};

	const m = console_(), S = gearStats( { ...defaultUpgrades(), consoleTop: 1, consoleTrolling: 1, consolePole: 1, consoleRadar: 1 }, 'console' );
	ok( m.fitted.trolling && m.fitted.powerPole && m.fitted.radar && S.trollingN === 498, `her trolling motor (${ S.trollingN } N), Power-Poles and radar fitted` );
	const A = afloat( m );
	A.b.trolling = { n: S.trollingN, at: m.trollingAt };
	const top = A.run( 90, 1 ) * KNOTS;
	ok( Math.abs( top - 4 ) < 0.6 && A.b.rpm < 0.01, `on her trolling motor: ${ top.toFixed( 2 ) } knots flat out (the sources' 4), her outboards' revs gone (${ A.b.rpm.toFixed( 3 ) })` );
	const T = afloat( console_() );
	T.b.trolling = { n: S.trollingN, at: T.b.model.trollingAt };
	const y0 = T.b.getYaw();
	T.run( 15, 0.6, 1 );
	const turned = Math.abs( Math.atan2( Math.sin( T.b.getYaw() - y0 ), Math.cos( T.b.getYaw() - y0 ) ) );
	ok( turned > 1, `the wheel turns the motor, and her with it, from rest (${ ( turned * 180 / Math.PI ).toFixed( 0 ) } degrees in 15 s)` );
	const quiet = m.noise( A.b ), loud = m.noise( { trolling: null } );
	ok( quiet && quiet.engine === false && quiet.knock === 0 && loud === null, 'to the fish, no engine on it: only her hull' );
	A.b.trolling = null;
	A.run( 3, 0.5 );
	ok( A.b.rpm > 0.3, 'its motor up, her outboards run again' );
	// her Power-Poles: held, her heading too
	const P = afloat( console_(), 1.5 );
	P.b.velocity.set( 0, 0, 1.5 );
	P.b.driven = false;
	const at = P.b.toWorld( P.b.model.stakeAt, new Vector3() ), yaw = P.b.getYaw();
	P.b.stake = { x: at.x, z: at.z, at: P.b.model.stakeAt, yaw };
	P.b.angular.set( 0, 0.3, 0 );
	P.run( 20 );
	const w = P.b.toWorld( P.b.model.stakeAt, new Vector3() );
	ok( Math.hypot( w.x - at.x, w.z - at.z ) < 0.1 && Math.abs( P.b.getYaw() - yaw ) < 0.02 && P.b.speed < 0.05, 'on her Power-Poles: held where they went down, and her heading' );
	ok( m.stakeDepth === 2.4 && S.stakeM === 2.4, 'they hold in 8 ft of water (a Blade 8\'s)' );
	// drawn as she has them, and on copies
	const fit = m.meshes.fittings.geometry, n0 = fit.drawRange.count;
	m.setMotorDown( true );
	m.setPoleDown( true );
	ok( fit.drawRange.count !== n0 && m.fitNow().motorDown && m.fitNow().poleDown, 'her motor down and her poles down, drawn so' );
	const bare = new ConsoleModel();
	bare.fit( gearStats( defaultUpgrades(), 'console' ) );
	ok( bare.meshes.fittings.geometry.drawRange.count < n0 && ! bare.fitted.trolling, 'none of it on her until it\'s bought' );
	const f = fitWire( 'console', S, null, m.fitNow() ), cs = fitStats( 'console', f );
	ok( cs.trolling && cs.powerPole && cs.radar && cs.motorDown && cs.poleDown, 'others\' copies of her: all three, her motor and her poles down' );
	const shared = new Map(), copy = bare.group.clone();
	m.dressCopy( copy, cs, ( k, make ) => shared.get( k ) || shared.set( k, make() ).get( k ) );
	ok( copy.getObjectByName( 'boat-fittings' ).geometry.drawRange.count === fit.drawRange.count, 'a copy draws hers as she is' );
	// her radar: swept as its dome turns, her plotter split for it
	const r0 = m.radarBearing;
	ok( m.splitRadar && Number.isFinite( r0 ) && bare.radarBearing === 0, 'her dome sweeps; none fitted, nothing' );
	// her bow anchor, on her foredeck; the anchor off her roller while it's down
	ok( m.bowAnchor && m.bowAnchor.z > 3.3 && m.bowAnchor.z < 4.1, `her anchor's worked on her foredeck, by her roller (${ m.bowAnchor.z } m)` );
	const before = fit.drawRange.count;
	m.setAnchorStowed( false );
	ok( fit.drawRange.count < before, 'her anchor not drawn on her roller while it\'s down' );
	m.setAnchorStowed( true );
	ok( fit.drawRange.count === before, 'and back on it' );

}

// ---- the sportfisher's windlass, the hauler
{

	const sf = new SportfisherModel(), A = sf.bowAnchor;
	ok( A && A.windlass && Math.abs( A.y - sf.helm.y ) < 0.01, 'the sportfisher\'s anchor let go and got up by the windlass switch on her bridge, by her helm' );
	ok( UPGRADES.hauler.levels[ 1 ].haulerMs === 1.9 && Math.abs( haulS( 20, 1.9 ) - 10.5 ) < 0.1 && Math.abs( haulS( 20, HAULER_MS ) - 16.7 ) < 0.1, `the bigger hauler brings a trap up from 20 m in ${ haulS( 20, 1.9 ).toFixed( 1 ) } s, not ${ haulS( 20, HAULER_MS ).toFixed( 1 ) }` );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
