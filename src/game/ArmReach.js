import { Quaternion, Vector3 } from '../engine/index.js';

// (M21) Arms reached to something after a clip has posed them: a skinned character's upper arm and forearm turned so its wrist
// comes to a point (docs/m21/deckhand.md). The players' looks hold a boat's wheel on `trolley_idle`, whose hands stay at the hips:
// the sportfisher's mate (rigs/Mate.js' Deckhand) and the players at a helm (together/Avatar.js) reach the wheel's rim with this.
//   turnBoneBy( bone, q )                                  a bone turned by a rotation in the world (after the clip)
//   reachTo( arm, fore, hand, to, pole, short ) -> m        the wrist to `to` (world), `short` m shy of it, the elbow out toward
//                                                           `pole` (a world direction); how far short of it the wrist stays (out
//                                                           of reach: the arm straight toward it)
//   armsOf( root ) -> { armR, foreR, handR, armL, foreL, handL, spine, legs }   a Rocketbox skeleton's (Bip01 R UpperArm ...;
//                                                           legs: its thighs, if they hang from the spine, as a Biped's do)
//   gripWheel( arms, frame, right, left, short ) -> m       both hands to a wheel's rim (world), the elbows a little out and
//                                                           down in `frame`'s own (the character's group, facing +Z); out of
//                                                           reach upright, leaned in from the waist first (up to LEAN_MOST);
//                                                           the further wrist's shortfall
// Each the world matrices of what it moves brought up to date as it goes.

const _qa = new Quaternion(), _qb = new Quaternion(), _q = new Quaternion();
const _s = new Vector3(), _e = new Vector3(), _h = new Vector3(), _t = new Vector3(), _d = new Vector3(), _p = new Vector3();
const _u = new Vector3(), _v = new Vector3(), _pole = new Vector3(), _ax = new Vector3(), _piv = new Vector3(), _sr = new Vector3();
const _sl = new Vector3(), _w = new Vector3(), _ql = new Quaternion();
const LEAN_MOST = 0.6; // rad: the most someone leans in from the waist to reach a wheel (34 degrees)
const SPARE = 0.01; // m: leaned in till each grip's this much inside the arm's reach (the elbow not locked straight)

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

	// ((the thighs: a Biped's hang from its lowest spine bone, so leaning it in swung the legs back: they're turned back upright)
	const spine = bone( /Spine$/ ), under = ( b ) => {

		for ( let p = b && b.parent; p; p = p.parent ) if ( p === spine ) return true;
		return false;

	};

	return { armR: bone( /R_?UpperArm$/ ), foreR: bone( /R_?Forearm$/ ), handR: bone( /R_?Hand$/ ), armL: bone( /L_?UpperArm$/ ), foreL: bone( /L_?Forearm$/ ), handL: bone( /L_?Hand$/ ), spine, legs: [ bone( /R_?Thigh$/ ), bone( /L_?Thigh$/ ) ].filter( under ) };

}

// right, left: where each wrist's going on the rim (world); short: the wrist that far shy of it (the hand closes round the rim)
export function gripWheel( B, frame, right, left, short = 0.05 ) {

	if ( ! B || ! B.armR || ! B.foreR || ! B.handR || ! B.armL || ! B.foreL || ! B.handL ) return Infinity;
	frame.updateMatrixWorld( true );
	if ( B.spine ) leanIn( B, frame, right, left, short );
	_pole.set( - 0.7, - 0.7, 0 ).transformDirection( frame.matrixWorld );
	const r = reachTo( B.armR, B.foreR, B.handR, right, _pole, short );
	_pole.set( 0.7, - 0.7, 0 ).transformDirection( frame.matrixWorld );
	return Math.max( r, reachTo( B.armL, B.foreL, B.handL, left, _pole, short ) );

}

// ((M21) a wheel past an arm's reach from where they stand (the console's, low on its slope over a toe-high face): the least lean
// forward from the waist, about its lowest spine bone and the figure's left-right axis, that brings both grips within reach, no
// more than LEAN_MOST
function leanIn( B, frame, right, left, short ) {

	const arm = ( a, f, h ) => a.getWorldPosition( _u ).distanceTo( f.getWorldPosition( _v ) ) + _v.distanceTo( h.getWorldPosition( _u ) );
	const reachR = arm( B.armR, B.foreR, B.handR ) + short, reachL = arm( B.armL, B.foreL, B.handL ) + short;
	B.spine.getWorldPosition( _piv );
	B.armR.getWorldPosition( _sr ).sub( _piv );
	B.armL.getWorldPosition( _sl ).sub( _piv );
	_ax.set( 1, 0, 0 ).transformDirection( frame.matrixWorld );
	// (how far the further grip is past its arm's reach, leaned by a)
	const over = ( a ) => {

		_q.setFromAxisAngle( _ax, a );
		const r = _w.copy( _sr ).applyQuaternion( _q ).add( _piv ).distanceTo( right ) - reachR;
		return Math.max( r, _w.copy( _sl ).applyQuaternion( _q ).add( _piv ).distanceTo( left ) - reachL ) + SPARE;

	};

	if ( over( 0 ) <= 0 ) return 0;
	let lo = 0, hi = LEAN_MOST;
	if ( over( hi ) <= 0 ) for ( let i = 0; i < 12; i ++ ) {

		const m = ( lo + hi ) / 2;
		if ( over( m ) > 0 ) lo = m;
		else hi = m;

	}

	turnBoneBy( B.spine, _ql.setFromAxisAngle( _ax, hi ) );
	// (bending at the hips: the legs stay as they stood)
	if ( B.legs ) for ( const t of B.legs ) turnBoneBy( t, _ql.setFromAxisAngle( _ax, - hi ) );
	return hi;

}
