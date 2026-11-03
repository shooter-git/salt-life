// (M16) The kayak in play, in Node: the real Player, controller and model on a beach with no GPU behind them. Getting in
// off the sand, shoved down into the water, paddling away, stepping out and pulling her up; over the side and back on; a
// squall putting her over, righting her, climbing on.
import { KayakModel } from '../src/world/boat/kayak/KayakModel.js';
import { BoatController } from '../src/player/BoatController.js';
import { Player } from '../src/player/Player.js';
import { Group, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

G.seaLevel.value = 0;
G.windSpeed.value = 0;
G.windDir.value.set( 1, 0 );

// the beach falls toward +z (as the village's does): the water's edge at z = -40, the sand above it, 1 in 14; a bottom that
// levels out at 5 m
const terrain = { heightAt: ( x, z ) => Math.max( - 5, ( - 40 - z ) / 14 ), coastDistance: () => ( { d: 0 } ) };
const colliders = { resolveCapsule: () => false, groundHeightAt: () => - Infinity, boxes: [] };

class Input {

	constructor() {

		this.keys = new Set();
		this.hits = new Set();
		this.move = null;
		this.enabled = true;

	}

	down( k ) { return this.keys.has( k ); }
	hit( k ) { return this.hits.has( k ); }
	press( k ) { this.hits.add( k ); }
	consumeLook() { return { x: 0, y: 0 }; }
	consumeWheel() { return 0; }
	endFrame() { this.hits.clear(); }

}

const query = { latency: 0, allocate: ( () => {

	let n = 0;
	return ( name, k ) => {

		const s = n;
		n += k;
		return s;

	};

} )(), setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };

const input = new Input();
const camera = new PerspectiveCamera();
const model = new KayakModel();
const ctl = new BoatController( { model, query, terrain, colliders } );
const player = new Player( { camera, input, terrain, colliders, query, boat: ctl } );
const state = { stats: { lifeJacket: false, speedMul: 1 }, inventory: [ { kg: 1 }, { kg: 2 }, { kg: 3 }, { kg: 1 } ], save() {}, emit() {} };
const toasts = [];
const game = { app: { boatCtl: ctl, player, weather: null, spray: null, audio: null, tier: 'low', together: null, ui: null }, state, toast: ( t ) => toasts.push( t ), time: null, rod: null, fight: null };

let t = 0;
const frame = ( dt = 1 / 60 ) => {

	t += dt;
	query.version ++;
	query.resultTime = t;
	// (the sea's flat: the player's own query slot too)
	player.update( dt );
	ctl.update( dt );
	model.play( dt, game );
	model.update( dt );
	input.endFrame();

};

const run = ( s ) => {

	for ( let i = 0, n = Math.round( s * 60 ); i < n; i ++ ) frame();

};

const press = ( k ) => {

	input.press( k );
	frame();

};

const at = ( x, z ) => {

	player.position.set( x, player.groundAt( x, z, 40 ), z );
	player.velocity.set( 0, 0, 0 );
	player.mode = 'walk';

};

ok( ctl.beached, 'she\'s on the sand from the start' );
const home = ctl.position.clone();
ok( terrain.heightAt( home.x, home.z ) > 0.45, `clear of the wash (${ terrain.heightAt( home.x, home.z ).toFixed( 2 ) } m up the sand, ${ ( - 40 - home.z ).toFixed( 1 ) } m from the water)` );
const fwd = ctl.forward( new Vector3() );
ok( fwd.z > 0.6, 'her bow to the sea, at an angle as she\'s left' );

// getting in, and off the sand
at( home.x + 1, home.z );
run( 0.1 );
ok( player.prompt && /Push her off/.test( player.prompt.text ), `on the sand, the word's "${ player.prompt && player.prompt.text }"` );
press( 'KeyE' );
ok( player.mode === 'boat' && ctl.driven && model.sliding, 'E: you\'re in her and she\'s going down the sand' );
const seat = new Vector3();
run( 0.5 );
ok( ctl.position.z > home.z + 0.2, 'she moves' );
run( 6 );
ok( ! ctl.beached && ! model.sliding, 'afloat' );
ok( terrain.heightAt( ctl.position.x, ctl.position.z ) < - 0.2, `in ${ ( - terrain.heightAt( ctl.position.x, ctl.position.z ) ).toFixed( 2 ) } m of water` );
ok( ctl.velocity.length() > 0.2, 'with some way on from the shove' );
ok( model.stroke.park === 0, 'the paddle in your hands' );

// paddling
input.keys.add( 'KeyW' );
run( 15 );
ok( ctl.forwardSpeed > 1.3, `paddling away at ${ ( ctl.forwardSpeed / 0.5144 ).toFixed( 1 ) } knots` );
ok( ctl.position.z > - 20, `out to z ${ ctl.position.z.toFixed( 0 ) }` );
ok( camera.position.distanceTo( ctl.position ) > 3, 'the chase camera behind her' );
input.keys.delete( 'KeyW' );
ok( player.prompt && /Over the side/.test( player.prompt.text ), `out here E's "${ player.prompt.text.split( '   ·' )[ 0 ] }"` );
input.press( 'KeyV' );
frame();
run( 0.2 );
ok( camera.position.distanceTo( ctl.toWorld( model.helmEye, seat ) ) < 0.05, 'V: through your own eyes' );

// the rod's out: she's no longer paddled
player.handsFull = true;
input.keys.add( 'KeyW' );
run( 2 );
ok( model.stroke.park > 0.9, 'the rod out, the paddle\'s laid by' );
ok( ! player.prompt, 'and the seat has nothing to say: the fishing has' );
input.keys.delete( 'KeyW' );
press( 'KeyE' );
ok( player.mode === 'boat', 'E doesn\'t get you out with a rod in your hands' );
player.handsFull = false;
run( 1 );
ok( model.stroke.park < 0.1, 'the rod away, the paddle\'s back' );
player.camMode = 'third';

// A takes her to port: her compass comes down through the numbers (Game.compassHeading), D back up
{

	const compass = () => { const f = ctl.forward( new Vector3() ); return Math.atan2( f.x, - f.z ); };
	const turned = ( k ) => {

		const h = compass();
		input.keys.add( k );
		run( 1 );
		input.keys.delete( k );
		const d = compass() - h;
		run( 1 );
		return Math.atan2( Math.sin( d ), Math.cos( d ) );

	};
	ok( turned( 'KeyA' ) < - 0.05, 'A to port: the compass reads less' );
	ok( turned( 'KeyD' ) > 0.05, 'D to starboard: it reads more' );

}

// the radio's panel up (game/Radio.js): the paddle's laid by, she drifts, and E is the panel's
player.helmHeld = true;
input.keys.add( 'KeyW' );
run( 2 );
ok( model.stroke.park > 0.9 && player.prompt && player.prompt.text === 'Put it away', 'the radio up, the paddle\'s laid by' );
input.keys.delete( 'KeyW' );
press( 'KeyE' );
ok( player.mode === 'boat', 'E doesn\'t get you out with the radio up' );
player.helmHeld = false;
run( 1 );
ok( model.stroke.park < 0.1, 'and it put away, the paddle\'s back' );

// a tow or a rescue gets you up out of her seat: there's no deck to be left on
const afloat = ctl.position.clone(), facing = ctl.quaternion.clone();
player.leaveHelm();
frame();
ok( player.mode === 'boat' && ! ctl.beached, 'left afloat (on Pearl\'s mooring), you\'re still sat in her' );
player.leaveHelm();
ctl.reset();
frame();
ok( player.mode === 'walk' && ctl.beached && ! ctl.moored && player.position.distanceTo( ctl.position ) < 1.6, `towed in, you're on the sand beside her (${ player.mode })` );
press( 'KeyE' );
ok( player.mode === 'boat', 'and E gets you back in' );
run( 6 );
ctl.position.copy( afloat );
ctl.quaternion.copy( facing );
ctl.velocity.set( 0, 0, 0 );
ctl.angular.set( 0, 0, 0 );

// over the side and back on
run( 8 );
press( 'KeyE' );
ok( player.mode === 'swim', 'over the side' );
ok( ! ctl.driven, 'nobody paddling' );
ok( player.position.distanceTo( ctl.position ) < 1.5, 'beside her' );
frame();
ok( player.prompt && /Climb back on/.test( player.prompt.text ), `in the water the word's "${ player.prompt && player.prompt.text }"` );
press( 'KeyE' );
ok( player.mode === 'boat', 'back on' );
run( 3 );

// a breaker: one coming down on her beam, she's over ((v2.0.1) a sit-on-top holds a squall's wind: Capsize.js)
ctl.position.y = 0;
ctl.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), 0 );
ctl.velocity.set( 0, 0, 0 );
ctl.angular.set( 0, 0, 0 );
let crest = 0;
query.breakerAt = ( x, z, t, out ) => {

	out.n = ++ crest;
	out.H = 3.4;
	out.b = 1;
	out.dx = 1;
	out.dz = 0;
	return out;

};
let seconds = 0;
while ( player.mode === 'boat' && seconds < 20 ) {

	run( 0.1 );
	seconds += 0.1;

}

query.breakerAt = null;
ok( player.mode === 'swim' && model.capsized, `a 3.4 m breaker on her beam, sat idle: over in ${ seconds.toFixed( 1 ) } s` );
ok( state.inventory.length === 2, `half the cooler gone (${ state.inventory.length } of 4 left)` );
ok( toasts.some( ( x ) => /over/.test( x ) ), `told: ${ toasts[ toasts.length - 1 ] }` );
ok( player.soak > 0.95, 'soaked, of course' );
G.windSpeed.value = 0;
run( 1.5 );
ok( Math.abs( model.body.rotation.z ) > 3, 'she\'s keel up' );
const q = new Vector3( 0, 1, 0 ).applyQuaternion( ctl.quaternion );
ok( q.y > 0.5, 'and the rigid body under her isn\'t' );
const swim = () => {

	const w = ctl.toWorld( model.boardPoint, new Vector3() );
	player.position.set( w.x + 1, player.position.y, w.z );

};

swim();
frame();
ok( player.prompt && /Right her/.test( player.prompt.text ), `the word's "${ player.prompt && player.prompt.text }"` );
press( 'KeyE' );
ok( player.mode === 'swim' && model.righting, 'E: she\'s coming back over' );
run( 3 );
ok( ! model.capsized && model.body.rotation.z === 0, 'righted' );
swim();
frame();
ok( /Climb back on/.test( player.prompt.text ), 'then climb on' );
press( 'KeyE' );
ok( player.mode === 'boat' && ctl.driven, 'and you\'re back in her' );
ok( player._seatDur === 2.3, 'taking a while, with no life jacket' );

// home: paddled in, up on the sand, out
ctl.position.set( home.x, 0, - 37 );
ctl.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), Math.PI ); // (bow to the beach)
ctl.velocity.set( 0, 0, - 0.3 );
ctl.angular.set( 0, 0, 0 );
input.keys.add( 'KeyW' );
run( 8 );
input.keys.delete( 'KeyW' );
ok( ctl.position.z < - 37.5 && ctl.contact, `she runs in on the sand (${ ctl.position.z.toFixed( 1 ) })` );
ok( Math.abs( ctl.velocity.length() ) < 0.6, `and she stops without bouncing (${ ctl.velocity.length().toFixed( 2 ) } m/s)` );
ok( Math.abs( ctl.position.y ) < 0.25, `no leap off it (y ${ ctl.position.y.toFixed( 2 ) })` );
run( 2 );
frame();
ok( player.prompt && /pull her up/.test( player.prompt.text ), `aground the word's "${ player.prompt && player.prompt.text.split( '   ·' )[ 0 ] }"` );
press( 'KeyE' );
ok( player.mode === 'walk', 'E: out' );
ok( ctl.beached, 'and she\'s up the sand' );
ok( terrain.heightAt( ctl.position.x, ctl.position.z ) > 0.45, `clear of the wash (${ terrain.heightAt( ctl.position.x, ctl.position.z ).toFixed( 2 ) })` );
ok( player.position.distanceTo( ctl.position ) < 2.5, 'you beside her' );
ok( ! model.figure || ! model.figure.group.visible, 'nobody in her' );
run( 1 );
ok( model.stroke.park > 0.9, 'the paddle laid along her gunwale' );

// a surge up the sand floats her off
G.seaLevel.value = 1.2;
run( 0.1 );
ok( ! ctl.beached, 'a surge up the sand floats her off' );
G.seaLevel.value = 0;

model.dispose();
if ( bad ) {

	console.log( `${ bad } failed` );
	process.exit( 1 );

}
