// (M16) The sportfisher: her size, her speeds, both her versions' budgets, every deck you can stand on, the climbs (and the
// falls), her rain cover, and what the other streams read of her.
import { SportfisherModel } from '../src/world/boat/sportfisher/SportfisherModel.js';
import { SF } from '../src/world/boat/sportfisher/SportfisherLines.js';
import { gripStep, swayAt, GRIP, LadderClimb } from '../src/world/boat/sportfisher/LadderClimb.js';
import { BoatController } from '../src/player/BoatController.js';
import { sightOf, SIGHT } from '../src/game/Chart.js';
import { PerspectiveCamera, Quaternion, Vector3 } from '../src/engine/index.js';
import { Player } from '../src/player/Player.js';
import { jobAt, footY, Crew } from '../src/together/Crew.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const m = new SportfisherModel( 'high' ), low = new SportfisherModel( 'low' );
const TOWER_Z = - 0.6;

// she's a 48
const ft = m.dimensions.length / 0.3048;
ok( ft > 47.5 && ft < 49.5, `${ ft.toFixed( 1 ) } ft overall` );
ok( m.dimensions.beam / 0.3048 > 15.5 && m.dimensions.beam / 0.3048 < 16.8, `${ ( m.dimensions.beam / 0.3048 ).toFixed( 1 ) } ft beam` );
ok( m.dimensions.draft / 0.3048 > 4.2 && m.dimensions.draft / 0.3048 < 5, `${ ( m.dimensions.draft / 0.3048 ).toFixed( 1 ) } ft draft` );
ok( m.hydro.suggestedMass > 17000 && m.hydro.suggestedMass < 26000, `${ ( m.hydro.suggestedMass / 1000 ).toFixed( 1 ) } t` );

// the budgets
const draws = ( v ) => Object.keys( v.meshes ).length;
ok( m.triangleCount <= 120000, `mid and high: ${ m.triangleCount } triangles of 120,000` );
ok( draws( m ) <= 25, `mid and high: ${ draws( m ) } draws of 25` );
ok( low.triangleCount <= 47000, `low: ${ low.triangleCount } triangles of 47,000` );
ok( draws( low ) <= 13, `low: ${ draws( low ) } draws of 13` );
for ( const k of [ 'tower', 'outriggers', 'chair', 'wheel', 'radar' ] ) ok( low.meshes[ k ], `low still has her ${ k }` );

// her speeds, on flat water: realistic cruise 25 to 30 knots at a cruising lever, flat out past it
const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
ctl.position.set( 0, 0, 0 );
ctl.moored = false;
let t = 0;
const run = ( seconds, th, st = 0 ) => {

	for ( let f = 0; f < seconds * 60; f ++ ) {

		t += 1 / 60;
		query.version ++;
		query.resultTime = t;
		ctl.setInput( th, st, 1 / 60 );
		ctl.update( 1 / 60 );

	}

};

run( 15, 0 );
ctl.driven = true;
run( 60, 0.7 );
const cruise = ctl.forwardSpeed * 1.944;
ok( cruise >= 25 && cruise <= 30, `cruises at ${ cruise.toFixed( 1 ) } knots at the cruising lever` );
run( 40, 1 );
const top = ctl.forwardSpeed * 1.944;
ok( top > cruise + 2 && top < 38, `${ top.toFixed( 1 ) } knots flat out` );
run( 30, 0 );
ctl.velocity.set( 0, 0, 0 );
ctl.angular.set( 0, 0, 0 );
run( 8, 0.01, 1 );
ok( ctl.angular.y > 0.08 && Math.abs( ctl.forwardSpeed ) < 1.5, `turns on her engines at the dock (${ ( ctl.angular.y * 57.3 ).toFixed( 1 ) } deg/s)` );

// every deck: a walker put there stays on it, on her floor
const g = ( v, x, z, y ) => v.soleY( x, z, y + 0.36 );
const decks = { cockpit: [ 0, - 5, SF.cockpit ], mezzanine: [ 0, - 2.9, SF.mezz ], salon: [ 0, - 1, SF.salon ], cabins: [ 0, 2.8, SF.lower ], sideDeck: [ 2.05, 0, 1.43 ], foredeck: [ 0, 5.5, null ], bridge: [ 0, - 1, SF.bridge ], tower: [ 0, - 0.5, SF.tower ] };
for ( const [ name, [ x, z, y ] ] of Object.entries( decks ) ) {

	const want = y ?? g( m, x, z, 3 );
	const got = g( m, x, z, want );
	ok( Math.abs( got - want ) < 0.03, `${ name }: floor at ${ got.toFixed( 2 ) } (${ want.toFixed( 2 ) })` );
	const p = new Vector3( x, want, z );
	m.clampToDeck( p, 0.24 );
	ok( Math.abs( p.x - x ) < 0.05 && Math.abs( p.z - z ) < 0.05, `${ name }: you're let stand there (at ${ p.x.toFixed( 2 ) }, ${ p.z.toFixed( 2 ) })` );

}

// the decks are over one another: what's underfoot is what's within reach
ok( g( m, 0, 0, SF.salon ) === SF.salon && g( m, 0, 0, SF.bridge ) === SF.bridge, 'the salon and the bridge over it don\'t get mixed up' );
const stairs = [ 0.8, 1.2, 1.6, 2.1 ].map( ( z ) => g( m, 0, z, SF.salon ) );
ok( stairs.every( ( y, i ) => y > SF.lower - 0.01 && y <= SF.salon + 0.01 && ( ! i || y < stairs[ i - 1 ] ) ), `the stairs go down: ${ stairs.map( ( y ) => y.toFixed( 2 ) ).join( ', ' ) }` );

// a walker on the bridge or the platform can't step off, whichever way they push
for ( const [ y, name, lim ] of [ [ SF.bridge, 'the bridge', 2.1 ], [ SF.tower, 'the tower', 0.8 ] ] ) {

	const p = new Vector3( 9, y, 0 );
	m.clampToDeck( p, 0.24 );
	ok( Math.abs( p.x ) < lim, `kept on ${ name } (${ p.x.toFixed( 2 ) })` );

}

// the helm's on the bridge, and its seat's there; rising from it you're on the bridge
ok( m.helm.y === SF.bridge && m.helmEye.y > SF.bridge + 1.2, 'the helm\'s on the flybridge' );

// the climbs, by their ends, each from the deck it's at
for ( const l of m.ladders ) {

	ok( m.ladderAt( l.on.clone() )?.ladder === l && m.ladderAt( l.on.clone() ).top === false, `${ l.id }: taken from its foot` );
	ok( m.ladderAt( l.off.clone() )?.ladder === l && m.ladderAt( l.off.clone() ).top === true, `${ l.id }: taken from its head` );
	ok( Math.abs( g( m, l.off.x, l.off.z, l.off.y ) - l.off.y ) < 0.05, `${ l.id }: there's a floor where you step off` );
	ok( Math.abs( g( m, l.on.x, l.on.z, l.on.y ) - l.on.y ) < 0.05, `${ l.id }: there's a floor where you step on` );

}

ok( m.ladderAt( new Vector3( 0, SF.salon, - 1 ) ) === null, 'no ladder from the salon, under the tower' );

// the hands: holding still they hold more than moving, past both you come off, and easy water gives it back
ok( gripStep( 1, 0.3, true, 1 ) === 1, 'in a calm you climb all you like' );
ok( gripStep( 1, 0.55, true, 0.2 ) < 1 && gripStep( 1, 0.55, false, 0.2 ) === 1, 'a roll that takes your grip climbing doesn\'t, holding on' );
let hold = 1, n = 0;
while ( hold > 0 && n < 2000 ) {

	hold = gripStep( hold, GRIP.hold + 0.5, false, 0.05 );
	n ++;

}

ok( hold === 0 && n * 0.05 < 3, `past what you can hold you come off, in ${ ( n * 0.05 ).toFixed( 1 ) } s` );
ok( gripStep( 0.5, 0.1, false, 0.5 ) > 0.5, 'and it comes back when she eases' );

// the physics of it: a 15 degree roll every 4 s, at the head of the tower's ladder, throws you at past half your weight
const boat = { quaternion: new Quaternion(), angular: new Vector3() }, last = {};
let peak = 0;
for ( let f = 0; f < 480; f ++ ) {

	const tt = f / 60, w = Math.PI * 2 / 4, roll = 15 * Math.PI / 180 * Math.sin( w * tt );
	boat.quaternion.setFromAxisAngle( new Vector3( 0, 0, 1 ), roll );
	boat.angular.set( 0, 0, 15 * Math.PI / 180 * w * Math.cos( w * tt ) );
	if ( f > 120 ) peak = Math.max( peak, swayAt( boat, SF.tower, last, 1 / 60 ) );
	else swayAt( boat, SF.tower, last, 1 / 60 );

}

ok( peak > 0.5 && peak < 1.2, `a 15 degree, 4 s roll at the tower's head throws you at ${ peak.toFixed( 2 ) } of your weight` );
const calm = { quaternion: new Quaternion(), angular: new Vector3() };
ok( swayAt( calm, SF.tower, {}, 1 / 60 ) < 0.01, 'flat water throws you nowhere' );

// the real Player on her: E at the foot, W up the rungs, off at the top; and in a seaway, off the ladder
{

	const held = new Set(), hits = new Set();
	const input = { down: ( k ) => held.has( k ), hit: ( k ) => hits.delete( k ), consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0, move: null };
	const cam = new PerspectiveCamera(), boatM = new SportfisherModel( 'low' );
	const q2 = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
	const c2 = new BoatController( { model: boatM, query: q2, terrain: { heightAt: () => - 50 }, colliders: null } );
	c2.position.set( 3000, 0, 3000 );
	const player = new Player( { camera: cam, input, terrain: { heightAt: () => - 50 }, colliders: { groundHeightAt: () => - Infinity, resolveCapsule() {} }, query: q2, boat: c2 } );
	player.boardBoat();
	const frames = ( n, each ) => {

		for ( let i = 0; i < n; i ++ ) {

			each?.( i / 60 );
			player.update( 1 / 60 );

		}

	};

	const tower = boatM.ladders.find( ( l ) => l.id === 'tower' );
	player.deckPos.copy( tower.on );
	frames( 2 );
	ok( player.prompt?.text === 'Climb the tower', `at the tower's foot it says so (${ player.prompt?.text })` );
	hits.add( 'KeyE' );
	frames( 2 );
	ok( player.climbing && player.mode === 'deck', 'E takes you onto the ladder, and you\'re still aboard to the game' );
	held.add( 'KeyW' );
	let at = 0;
	for ( ; at < 60 * 30 && player.climbing; at ++ ) player.update( 1 / 60 );
	held.clear();
	ok( ! player.climbing && Math.abs( player.deckPos.y - SF.tower ) < 0.05, `W takes you to the platform, in ${ ( at / 60 ).toFixed( 1 ) } s` );
	ok( at / 60 > 5 && at / 60 < 12, 'and it takes its time' );
	frames( 10 );
	const eyeUp = cam.position.y - c2.position.y;
	ok( Math.abs( eyeUp / 0.3048 - 28 ) < 3, `the camera's up there: ${ ( eyeUp / 0.3048 ).toFixed( 1 ) } ft` );
	ok( player.prompt?.text === tower.downText || player.deckPos.distanceTo( tower.off ) > 0.45, 'and you can come down' );

	// the bridge's ladder too, and she's a deck that holds you at each end
	player.deckPos.copy( tower.off );
	frames( 2 );
	hits.add( 'KeyE' );
	frames( 2 );
	held.add( 'KeyS' );
	for ( at = 0; at < 60 * 30 && player.climbing; at ++ ) player.update( 1 / 60 );
	held.clear();
	ok( ! player.climbing && Math.abs( player.deckPos.y - SF.bridge ) < 0.05, 'S brings you back down to the bridge' );

	// a seaway: she rolls 22 degrees every 4 s; climbing through it you come off, stopped you hold through what you'd have lost
	const roll = ( amp ) => ( t ) => {

		const w = Math.PI * 2 / 4;
		c2.quaternion.setFromAxisAngle( new Vector3( 0, 0, 1 ), amp * Math.sin( w * t ) );
		c2.angular.set( 0, 0, amp * w * Math.cos( w * t ) );
		c2.velocity.set( 0, 0, 0 );

	};

	const onLadder = ( f ) => {

		player.mode = 'deck';
		player.climbing = boatM.climb( { ladder: tower, top: false } );
		player.climbing.s = player.climbing.len * f;

	};

	const seaway = roll( 22 * Math.PI / 180 ), calm = roll( 0 );
	const was = player.falls;
	onLadder( 0.6 );
	frames( 60 * 20, ( t ) => {

		seaway( t );
		held.add( 'KeyW' );
		held.delete( 'KeyS' );
		if ( player.climbing && player.climbing.s > player.climbing.len * 0.9 ) held.delete( 'KeyW' ), held.add( 'KeyS' );
		if ( player.climbing && player.climbing.s < player.climbing.len * 0.5 ) held.delete( 'KeyS' );

	} );
	held.clear();
	ok( player.falls > was, 'climbing on through a big roll, she throws you off' );

	const before = player.falls;
	calm( 0 );
	onLadder( 0.5 );
	const gentle = roll( 8 * Math.PI / 180 );
	frames( 60 * 20, ( t ) => gentle( t ) );
	ok( player.falls === before && player.climbing, 'holding on through a moderate roll, you stay on' );
	calm( 0 );

	// off it, straight down over her: you land on a deck, winded, still aboard. Flung wide: the sea
	frames( 30 );
	onLadder( 0.7 );
	player.climbing._letGo( player );
	player.climbing.falling.v.set( 0, 0, 0 );
	frames( 60 * 3, calm );
	ok( ! player.climbing && player.mode === 'deck' && player.stunned > 0, `a fall onto the deck: at y ${ player.deckPos.y.toFixed( 2 ) }, winded ${ player.stunned.toFixed( 1 ) } s` );
	ok( Math.abs( player.deckPos.y - SF.bridge ) < 0.1, 'caught by the bridge under the ladder' );
	onLadder( 0.7 );
	player.climbing._letGo( player );
	player.climbing.falling.v.set( 9, 0, 0 );
	frames( 60 * 3, calm );
	ok( ! player.climbing && player.mode === 'swim', `flung off the side: in the sea (${ player.mode })` );

	// the helm's on the bridge: no taking it from the salon under it, nor overboard from the bridge
	player.boardBoat();
	player.deckPos.set( boatM.helm.x, SF.salon, boatM.helm.z );
	frames( 3 );
	ok( player.prompt?.text !== 'Take the helm', 'no taking the helm from the salon under it' );
	player.deckPos.set( boatM.helm.rise[ 0 ], SF.bridge, boatM.helm.rise[ 1 ] );
	frames( 3 );
	ok( player.prompt?.text === 'Take the helm', 'where you rise from it, you can take it again' );
	hits.add( 'KeyE' );
	frames( 2 );
	ok( player.mode === 'boat', 'and take it' );
	hits.add( 'KeyE' );
	frames( 2 );
	ok( player.mode === 'deck' && Math.abs( player.deckPos.y - SF.bridge ) < 0.05, 'and you stand up on the bridge' );

	// the tower's helm: E at its pod, the eye up there, a wheel and lever of its own, and back on the platform after
	const TH = boatM.towerHelm, turned = ( i ) => {

		const a = new Float32Array( 16 ), b = new Float32Array( 16 );
		boatM.wheelMesh.instanceMatrix.array.slice( i * 16, i * 16 + 16 ).forEach( ( v, k ) => a[ k ] = v );
		boatM._wheels[ i ].toArray( b );
		return a.some( ( v, k ) => Math.abs( v - b[ k ] ) > 1e-3 );

	};

	const standAt = ( x, z, y = SF.tower ) => {

		player.deckPos.set( x, y, z );
		player.deckVel.set( 0, 0, 0 );
		frames( 3 );
		return player.prompt?.text;

	};

	frames( 60 * 2 ); // (her wheel come back to the middle)
	player.camMode = 'first';
	ok( standAt( 0, tower.off.z ) === tower.downText, 'at the ladder\'s head it\'s the ladder' );
	ok( standAt( 0, - 0.65 ) === 'Take the helm', 'at the pod, the helm' );
	const standing = player.deckPos.clone();
	hits.add( 'KeyE' );
	frames( 2 );
	ok( player.mode === 'boat' && player.atHelm === TH && c2.driven, 'E takes the tower\'s helm' );
	const eyeWant = c2.toWorld( TH.eye, new Vector3() );
	ok( cam.position.distanceTo( eyeWant ) < 0.05 && cam.position.y - c2.position.y > SF.tower + 1, `the eye's on the platform: ${ ( ( cam.position.y - c2.position.y ) / 0.3048 ).toFixed( 1 ) } ft up` );
	ok( jobAt( boatM, player.mode, player.deckPos ) === 'helm', 'to the crew, you\'ve the helm' );
	held.add( 'KeyA' ).add( 'KeyW' );
	frames( 30 );
	boatM.setSteering( c2.steer ); // (what BoatController.update does)
	boatM.setThrottle( c2.throttle );
	held.clear();
	ok( c2.throttle > 0 && c2.steer > 0.2 && turned( 1 ) && ! turned( 0 ), 'she answers it, and only its wheel turns' );
	m.setThrottle( 0 );
	m.helmInUse = m.towerHelm;
	m.setThrottle( 0.5 );
	ok( m.towerThrottle.rotation.x > 0 && m.throttleMesh.rotation.x === 0, 'and only its lever' );
	m.setThrottle( 0 );
	m.helmInUse = m.helm;
	frames( 60 * 3 );
	hits.add( 'KeyE' );
	frames( 2 );
	ok( player.mode === 'deck' && ! c2.driven && Math.abs( player.deckPos.y - SF.tower ) < 0.05 && Math.abs( player.deckPos.z - TH.rise[ 1 ] ) < 0.1, 'leaving it, you\'re on the platform' );
	ok( jobAt( boatM, player.mode, player.deckPos ) === 'tower', 'and up the tower, to the crew' );
	ok( Math.abs( footY( boatM, TH.eye.x, TH.eye.z, TH.eye.y - 1 ) - SF.tower ) < 0.01, 'someone at it is drawn on the platform' );
	standAt( 0, - 0.42 );
	ok( player.deckPos.z < - 0.5, 'and the pod\'s solid' );

	// the bridge's is as it was
	standAt( boatM.helm.rise[ 0 ], boatM.helm.rise[ 1 ], SF.bridge );
	hits.add( 'KeyE' );
	frames( 2 );
	ok( player.atHelm === boatM.helm && cam.position.distanceTo( c2.toWorld( boatM.helmEye, new Vector3() ) ) < 0.05, 'the bridge\'s helm is still the bridge\'s' );
	hits.add( 'KeyE' );
	frames( 2 );
	ok( Math.abs( player.deckPos.y - SF.bridge ) < 0.05, 'and you rise from it on the bridge' );
	ok( boatM.helmAt( new Vector3( TH.x, SF.bridge, TH.z ), 0.75 ) === boatM.helm, 'and under the tower\'s, it\'s the bridge\'s you take' );

	// someone riding: as any helm, only when it's free
	player.riding = true;
	c2.helmFree = false;
	ok( standAt( 0, - 0.65 ) !== 'Take the helm', 'riding, not while her owner has it' );
	c2.helmFree = true;
	ok( standAt( 0, - 0.65 ) === 'Take the helm', 'riding, with her owner aboard and away from it, yes' );
	player.riding = false;

	// stepping off someone else's: it has no berth here
	{

		const own = player.boat, theirs = Object.create( c2 );
		Object.defineProperty( theirs, 'berth', { value: undefined } );
		player.boardBoat();
		player.boat = theirs;
		player.riding = true;
		let threw = null;
		try {

			player.exitBoat( null, 1 );

		} catch ( e ) {

			threw = e;

		}

		ok( ! threw && ! player.riding, `a rider goes over the side of someone else's (${ threw ? threw.message : 'and they\'re off her' })` );
		player.boat = own;
		player.riding = false;
		player.boardBoat();

	}

	// no tower, no helm up there, and the one wheel
	boatM.fit( { tower: false } );
	ok( standAt( 0, - 0.65 ) !== 'Take the helm' && boatM.wheelMesh.count === 1, 'no tower, no second helm' );
	ok( boatM.helmAt( new Vector3( boatM.helm.x, SF.bridge, boatM.helm.z ), 0.75 ) === boatM.helm, 'and the bridge\'s is still there' );
	boatM.fit( { tower: true } );
	ok( boatM.wheelMesh.count === 2, 'bought, it\'s there' );

	// the walks about her, by the keys: W and the rest held, as far as they take you
	const walk = ( keys, until, yaw = 0 ) => {

		player.deckYaw = yaw;
		for ( const k of keys ) held.add( k );
		let n = 0;
		while ( n < 60 * 25 && ! until( player.deckPos ) ) {

			player.update( 1 / 60 );
			n ++;

		}

		held.clear();
		return until( player.deckPos );

	};

	const log = () => `x ${ player.deckPos.x.toFixed( 2 ) }, y ${ player.deckPos.y.toFixed( 2 ) }, z ${ player.deckPos.z.toFixed( 2 ) }`;
	standAt( 0.03, - 1.9, SF.salon );
	ok( walk( [ 'KeyW' ], ( p ) => p.y < SF.lower + 0.05 && p.z > 2.2 ), `W from the salon, down the stairs to the cabins: ${ log() }` );
	ok( walk( [ 'KeyS' ], ( p ) => p.y > SF.salon - 0.05 && p.z < 0.7 ), `S back up them: ${ log() }` );
	standAt( 1.5, - 5, SF.cockpit );
	walk( [ 'KeyW' ], ( p ) => p.z > - 2 );
	ok( player.deckPos.z < SF.mezzZ - 0.26 && player.deckPos.y < SF.cockpit + 0.05, `from the cockpit the box beside the mezzanine's a wall: ${ log() }` );
	standAt( 0.9, ( SF.mezzZ + SF.houseAft ) / 2, SF.mezz );
	ok( walk( [ 'KeyA' ], ( p ) => p.x > 1.6 && p.y > 1.2 ), `A up onto it from the mezzanine: ${ log() }` );
	standAt( 0.9, ( SF.mezzZ + SF.houseAft ) / 2, SF.mezz );
	player.deckYaw = 0;
	held.add( 'KeyA' );
	for ( let i = 0; i < 40; i ++ ) player.update( 1 / 10 );
	held.clear();
	ok( player.deckPos.x > 1.6 && player.deckPos.y > 1.2, `and at 10 frames a second: ${ log() }` );
	standAt( 1.5, ( SF.mezzZ + SF.houseAft ) / 2, 1.25 );
	walk( [ 'KeyA' ], ( p ) => p.x > 2.5 );
	const outboard = player.deckPos.x;
	ok( walk( [ 'KeyW' ], ( p ) => p.z > 6.5 && p.y > 1.2 ), `W from its outboard edge (x ${ outboard.toFixed( 2 ) }) along the side deck to the foredeck: ${ log() }` );
	const copy = boatM.group.clone( true ).getObjectByName( 'boat-wheel' );
	ok( copy && copy.count === 2 && copy.instanceMatrix.count === 2, 'someone else\'s copy of her has both wheels' );
	boatM.dispose();

}

// her rain cover: a box for each roof, chosen by where you are
ok( m.shelterAt( new Vector3( 0, SF.salon, 0 ) ) !== m.shelterAt( new Vector3( 0, SF.bridge, 0 ) ) && m.shelterAt( new Vector3( 0, SF.tower, 0 ) ) !== m.shelterAt( new Vector3( 0, SF.bridge, 0 ) ), 'a roof for each deck' );
const inBox = ( mat, x, y, z ) => {

	const v = new Vector3( x, y, z ).applyMatrix4( mat );
	return Math.abs( v.x ) <= 1 && Math.abs( v.y ) <= 1 && Math.abs( v.z ) <= 1;

};

ok( inBox( m.shelterAt( new Vector3( 0, SF.salon, 0 ) ), 0, SF.salon + 1, 0 ), 'no rain in the salon' );
ok( inBox( m.shelterAt( new Vector3( 0, SF.bridge, 0 ) ), 0, SF.bridge + 1, 0 ), 'none at the helm under the hardtop' );
ok( ! inBox( m.shelterAt( new Vector3( 0, SF.bridge, - 2.5 ) ), 0, SF.bridge + 1, - 2.5 ), 'rain on the bridge aft of it' );
ok( ! inBox( m.shelterAt( new Vector3( 0, SF.cockpit, - 5 ) ), 0, SF.cockpit + 1, - 5 ), 'and in the cockpit' );

// what's on the tower's pod, with the tower
ok( m.towerCompass && m.meshes.towerDisplay && ! low.towerCompass && ! low.meshes.towerDisplay, 'a compass and gauges on the pod, but for a phone\'s' );
m.fit( { tower: false } );
ok( ! m.towerCompass.visible && ! m.meshes.towerDisplay.visible && ! m.towerThrottle.visible, 'and none of it without the tower' );
m.fit( { tower: true } );
ok( m.towerCompass.visible && m.meshes.towerDisplay.visible, 'and bought, there' );
ok( m.helm.open && m.towerHelm.open, 'both her helms are in the open air: wind and rain and engines as they are outside' );

// someone else's: as their pose says, whatever's on yours
{

	const yours = new SportfisherModel( 'high' );
	yours.fit( { tower: false, outriggers: false, chair: false } );
	ok( yours.gearBits() === 0, 'none fitted, it says so' );
	const theirs = yours.group.clone( true );
	const named = ( n ) => theirs.getObjectByName( n );
	yours.dressCopy( theirs, 1 | 4 );
	ok( named( 'boat-tower' ).visible && named( 'boat-towerCompass' ).visible && named( 'boat-chair' ).visible && ! named( 'boat-outriggers' ).visible, 'their copy has their tower and chair, and no outriggers' );
	ok( named( 'boat-wheel' ).count === 2 && yours.wheelMesh.count === 1 && ! yours.meshes.tower.visible, 'with its second wheel, and yours is as it was' );
	const walked = yours.withGear( 1 ), tower = yours.ladders.find( ( l ) => l.id === 'tower' );
	ok( walked.ladderAt( tower.on.clone() ) && ! yours.ladderAt( tower.on.clone() ), 'riding, their tower to climb, not having one yourself' );
	ok( walked.helmAt( new Vector3( 0, SF.tower, walked.towerHelm.z ), 0.75 ) === walked.towerHelm, 'and its helm' );
	ok( yours.withGear( 0 ).ladderAt( tower.on.clone() ) === null && yours.withGear( 1 ) === walked, 'nor one they haven\'t; and the same one each time' );
	ok( yours.withGear( null ) === yours, 'a game that doesn\'t say: as she is' );
	yours.dispose();

}

// the tower's helm, spotting: you call what you look at from it, as you do standing up there
{

	const sent = [], me = { id: 'robin' }, boat = { model: m, getYaw: () => 0 };
	const camera = { position: new Vector3( 0, 9, 0 ), getWorldDirection: ( v ) => v.set( 1, 0, 0 ) };
	const player = { mode: 'boat', atHelm: m.towerHelm, deckPos: new Vector3( 0, SF.tower, TOWER_Z ), boat, position: new Vector3(), riding: false };
	const app = { player, camera, finds: { bait: [ { x: 1000, z: 0 } ] }, game: { toast: () => {}, minimap: null } };
	const t = { app, me, session: { send: ( k, b ) => sent.push( [ k, b ] ) }, others: new Map( [ [ 'sam', { person: { id: 'sam', name: 'Sam' }, cur: { mode: 'deck', ride: 'robin' } } ] ] ) };
	const crew = new Crew( t );
	for ( let i = 0; i < 4; i ++ ) crew.update( 0.5 );
	ok( crew.job === 'helm' && sent.length === 1 && sent[ 0 ][ 0 ] === 'call' && sent[ 0 ][ 1 ].k === 'bait', 'at the tower\'s helm you\'ve the helm, and call the birds you look at' );
	sent.length = 0;
	player.atHelm = m.helm;
	const bridge = new Crew( t );
	for ( let i = 0; i < 4; i ++ ) bridge.update( 0.5 );
	ok( sent.length === 0, 'at the bridge\'s, you don\'t' );

}

// what you see from up there
ok( Math.abs( m.towerEye / 0.3048 - 28 ) < 3, `an eye ${ ( m.towerEye / 0.3048 ).toFixed( 0 ) } ft up` );
ok( sightOf( 'deck', m.towerEye ) > SIGHT.sea * 1.5, 'you see further from the tower' );
ok( sightOf( 'deck', 2 ) === SIGHT.sea, 'and as far as ever from the lobster boat\'s deck' );

// what the others read
ok( m.bunks.length === 2 && m.bunks.every( ( b ) => b.y === SF.lower ), 'bunks to sleep aboard in' );
ok( m.chair && m.chair.yaw === Math.PI && m.stations.tower && m.stations.chair, 'the chair and the crew\'s stations' );
ok( m.rodHolders.length === 6 && m.outriggerTips.length === 2, 'rod holders and outrigger tips' );
ok( m.outriggerTips[ 0 ].x > 5 && m.outriggerTips[ 1 ].x < - 5, 'the outriggers\' tips out either side' );
m.fit( { tower: false, outriggers: false, chair: false } );
ok( ! m.meshes.tower.visible && m.ladderAt( m.ladders[ 1 ].on.clone() ) === null, 'no tower fitted, no climb' );
ok( ! m.meshes.chair.visible && m.chair === null, 'no chair fitted, no chair' );
m.fit( { tower: true, outriggers: true, chair: true } );
ok( m.meshes.tower.visible && m.chair && m.ladderAt( m.ladders[ 1 ].on.clone() ), 'and bought, they\'re there' );
m.setOutriggersOut( true );
const before = m.meshes.outriggers.geometry.attributes.position.array.slice();
m.update( 1 );
m.update( 3 );
const moved = before.some( ( v, i ) => Math.abs( v - m.meshes.outriggers.geometry.attributes.position.array[ i ] ) > 0.5 );
ok( moved, 'the outriggers come down for trolling' );

m.dispose();
low.dispose();
console.log( bad ? `\n${ bad } failed` : '\nsportfisher: all passed' );
process.exit( bad ? 1 : 0 );
