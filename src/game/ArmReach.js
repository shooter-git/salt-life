import { Quaternion, Vector3 } from '../engine/index.js';

// (M21) Arms reached to something after a clip has posed them: a skinned character's upper arm and forearm turned so its wrist
// comes to a point (docs/m21/deckhand.md). The players' looks hold a boat's wheel on `trolley_idle`, whose hands stay at the hips:
// the sportfisher's mate (rigs/Mate.js' Deckhand) and the players at a helm (together/Avatar.js) reach the wheel's rim with this.
//   turnBoneBy( bone, q )                                  a bone turned by a rotation in the world (after the clip)
//   reachTo( arm, fore, hand, to, pole, short ) -> m        the wrist to `to` (world), `short` m shy of it, the elbow out toward
//                                                           `pole` (a world direction); how far short of it the wrist stays (out
//                                                           of reach: the arm straight toward it)
//   armsOf( root ) -> { armR, foreR, handR, armL, foreL, handL }   a Rocketbox skeleton's (Bip01 R UpperArm ...)
//   gripWheel( arms, frame, right, left, short ) -> m       both hands to a wheel's rim (world), the elbows a little out and
//                                                           down in `frame`'s own (the character's group, facing +Z); the further
//                                                           wrist's shortfall
// Each the world matrices of what it moves brought up to date as it goes.

const _qa = new Quaternion(), _qb = new Quaternion(), _q = new Quaternion();
const _s = new Vector3(), _e = new Vector3(), _h = new Vector3(), _t = new Vector3(), _d = new Vector3(), _p = new Vector3();
const _u = new Vector3(), _v = new Vector3(), _pole = new Vector3();

export function turnBoneBy( bone, q ) {

	bone.parent.getWorldQuaternion( _qa );
	bone.getWorldQuaternion( _qb );
	bone.quaternion.copy( _qa.invert().multiply( _qb.premultiply( q ) ) );
	bone.updateMatrixWorld( true );

}

// the upper arm and the forearm solved as a triangle of their own lengths
export function reachTo( arm, fore, hand, to, pole, short = 0 ) {

	arm.getWorldPosition( _s );
	fore.getWorldPosition( _e );
	hand.getWorldPosition( _h );
	const a = _s.distanceTo( _e ), b = _e.distanceTo( _h );
	_d.subVectors( to, _s );
	const want = _d.length() - short, d = Math.min( Math.max( want, Math.abs( a - b ) + 1e-3 ), a + b - 1e-3 );
	_d.normalize();
	const cos = ( a * a + d * d - b * b ) / ( 2 * a * d ), sin = Math.sqrt( Math.max( 0, 1 - cos * cos ) );
	_p.copy( pole ).addScaledVector( _d, - pole.dot( _d ) );
	if ( _p.lengthSq() < 1e-8 ) _p.set( 0, - 1, 0 ).addScaledVector( _d, _d.y );
	_p.normalize();
	_t.copy( _s ).addScaledVector( _d, a * cos ).addScaledVector( _p, a * sin ); // (the elbow)
	_q.setFromUnitVectors( _u.subVectors( _e, _s ).normalize(), _v.subVectors( _t, _s ).normalize() );
	turnBoneBy( arm, _q );
	fore.getWorldPosition( _e );
	hand.getWorldPosition( _h );
	_t.copy( _s ).addScaledVector( _d, d ); // (the wrist)
	_q.setFromUnitVectors( _u.subVectors( _h, _e ).normalize(), _v.subVectors( _t, _e ).normalize() );
	turnBoneBy( fore, _q );
	return Math.max( 0, want - d );

}

export function armsOf( root ) {

	const bone = ( re ) => {

		let found = null;
		root.traverse( ( o ) => {

			if ( ! found && o.isBone && re.test( o.name ) ) found = o;

		} );
		return found;

	};

	return { armR: bone( /R_?UpperArm$/ ), foreR: bone( /R_?Forearm$/ ), handR: bone( /R_?Hand$/ ), armL: bone( /L_?UpperArm$/ ), foreL: bone( /L_?Forearm$/ ), handL: bone( /L_?Hand$/ ) };

}

// right, left: where each wrist's going on the rim (world); short: the wrist that far shy of it (the hand closes round the rim)
export function gripWheel( B, frame, right, left, short = 0.05 ) {

	if ( ! B || ! B.armR || ! B.foreR || ! B.handR || ! B.armL || ! B.foreL || ! B.handL ) return Infinity;
	frame.updateMatrixWorld( true );
	_pole.set( - 0.7, - 0.7, 0 ).transformDirection( frame.matrixWorld );
	const r = reachTo( B.armR, B.foreR, B.handR, right, _pole, short );
	_pole.set( 0.7, - 0.7, 0 ).transformDirection( frame.matrixWorld );
	return Math.max( r, reachTo( B.armL, B.foreL, B.handL, left, _pole, short ) );

}
