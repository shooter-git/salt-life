// (M16) The sportfisher: her size, her speeds, both her versions' budgets, every deck you can stand on, the climbs (and the
// falls), her rain cover, and what the other streams read of her.
import { SportfisherModel } from '../src/world/boat/sportfisher/SportfisherModel.js';
import { SF } from '../src/world/boat/sportfisher/SportfisherLines.js';
import { gripStep, swayAt, GRIP, LadderClimb } from '../src/world/boat/sportfisher/LadderClimb.js';
import { BoatController } from '../src/player/BoatController.js';
import { sightOf, SIGHT } from '../src/game/Chart.js';
import { Quaternion, Vector3 } from '../src/engine/index.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const m = new SportfisherModel( 'high' ), low = new SportfisherModel( 'low' );

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
