// (M14) The village's loose shutters in the wind (world/village/Shutters.js): still on a fair day, banging
// in a blow (on a wall the wind blows along, in a house's lee; pressed flat on its windward wall), all shut
// for a hurricane; and drawn where they've swung, turned about their hinges.
import { Shutters } from '../src/world/village/Shutters.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { MeshBasicMaterial } from '../src/engine/index.js';

let failed = 0;
const ok = ( c, label ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! c ) failed ++;

};

// a row of walls facing each way round the compass, a shutter hung either side of a window on each (as
// Buildings' windowUnit hangs them: the wall facing N, opening along A from its hinge), standing a little open
const village = () => {

	const B = new Builder(), list = [];
	for ( let i = 0; i < 160; i ++ ) {

		// (the wall's frame: its face along local x, facing local z, N; hung on side s, it opens along s x, A)
		const a = i * 2.39996, N = [ Math.cos( a ), Math.sin( a ) ], s = i % 2 ? 1 : - 1, phi = Math.atan2( N[ 0 ], N[ 1 ] );
		const A = [ Math.cos( phi ) * s, - Math.sin( phi ) * s ];
		const x = ( i % 16 ) * 6, z = Math.floor( i / 16 ) * 6, v0 = B.batch( 'wood' ).vcount;
		B.pushAt( x, 0, z, phi );
		B.pushAt( 0, 0, 0, - s * 0.2 );
		B.box( 'wood', s * 0.285, 1.5, 0.016, 0.55, 1.2, 0.028 );
		B.pop();
		B.pop();
		list.push( { x, y: 1.5, z, A, N, sign: s, w: 0.55, h: 1.2, open: 0.2, v0, v1: B.batch( 'wood' ).vcount } );

	}

	return new Shutters( { batch: B.batch( 'wood' ), list, material: new MeshBasicMaterial() } );

};
// a minute (or s seconds) of wind U from the trades' way, gusting 22% over a few seconds: bangs a minute
// in all, and of the loose ones
const blow = ( U, s = 60, boarded = false ) => {

	const sh = village(), dir = { x: 0.35, y: 0.94 };
	let bangs = 0;
	sh.onBang = () => bangs ++;
	for ( let f = 0; f < s * 60; f ++ ) sh.update( 1 / 60, () => U * ( 1 + 0.22 * Math.sin( f / 60 * 0.7 + 1 ) ), dir, boarded );
	return { sh, bangs: bangs / ( s / 60 ), per: bangs / ( s / 60 ) / sh.loose };

};

const fair = blow( 7 ), breezy = blow( 11 ), blustery = blow( 15 ), gale = blow( 20 ), hurricane = blow( 35, 30, true );
console.log( `     a fair day moves them at most ${ Math.max( ...fair.sh.list.map( ( s ) => Math.abs( s.theta - s.open ) ) ).toFixed( 2 ) } rad` );
console.log( `     ${ fair.sh.loose } of ${ fair.sh.list.length } loose; bangs a minute each: fair ${ fair.per.toFixed( 1 ) }, breezy ${ breezy.per.toFixed( 1 ) }, blustery ${ blustery.per.toFixed( 1 ) }, a gale ${ gale.per.toFixed( 1 ) }` );
ok( fair.sh.loose > fair.sh.list.length / 12 && fair.sh.loose < fair.sh.list.length / 5, 'one in eight or so hangs loose' );
ok( fair.bangs === 0 && fair.sh.list.every( ( s ) => Math.abs( s.theta - s.open ) < 0.5 ), 'a fair day\'s breeze leaves them as they stand' );
ok( breezy.per < blustery.per && blustery.per > 1 && gale.per > blustery.per && gale.per < 40, 'they bang in a blow, more the harder it blows' );
ok( hurricane.bangs === 0 && hurricane.sh.list.every( ( s ) => s.theta === Math.PI ), 'for a hurricane they\'re all shut, and hooked' );
// ((the windward wall: pressed flat against it))
{

	const g = gale.sh, dir = { x: 0.35, y: 0.94 };
	const windward = g.list.filter( ( s ) => s.loose && s.N[ 0 ] * dir.x + s.N[ 1 ] * dir.y < - 0.8 );
	ok( windward.length > 0 && windward.every( ( s ) => s.theta < 0.05 || s.theta > Math.PI - 0.05 ), `on a wall the wind blows onto they're pressed flat (${ windward.length })` );

}

// drawn turned about their hinges: a loose one's far edge where it's swung to (A cos theta + N sin theta out)
{

	const g = gale.sh, s = g.list.find( ( q ) => q.loose && Math.abs( q.theta - q.open ) > 0.3 ), P = g.position.array;
	let far = 0, at = null;
	for ( let v = s.v0; v < s.v1; v ++ ) {

		const d = Math.hypot( P[ v * 3 ] - s.x, P[ v * 3 + 2 ] - s.z );
		if ( d > far ) {

			far = d;
			at = [ ( P[ v * 3 ] - s.x ) / d, ( P[ v * 3 + 2 ] - s.z ) / d ];

		}

	}

	const want = [ s.A[ 0 ] * Math.cos( s.theta ) + s.N[ 0 ] * Math.sin( s.theta ), s.A[ 1 ] * Math.cos( s.theta ) + s.N[ 1 ] * Math.sin( s.theta ) ];
	ok( at && at[ 0 ] * want[ 0 ] + at[ 1 ] * want[ 1 ] > 0.97, 'drawn where it\'s swung to, about its hinge' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
