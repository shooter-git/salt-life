import { Quaternion, Vector3 } from '../../../engine/index.js';

// (M16) A Rocketbox islander sat in a kayak: their clips stand them up, so this bends them after the clip, in the
// order the bones hang: the hips down onto the seat, the legs out to the foot braces, knees up and a little apart, the
// back upright and turning with the stroke, the arms reaching for where the hands hold the shaft. Used for you (seen from
// the chase camera, or your own legs from the seat) and for others (together/Avatar.js).
//
//   seatPose( avatar, { hips, left, right, twist, lean } )
//     hips: m the pelvis sits above the avatar's origin; left, right: world points for the hands, or null to rest them on
//     the thighs; twist: rad the shoulders are turned (+: to the left); lean: rad forward from upright

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _t = new Vector3(), _p = new Vector3(), _d = new Vector3(), _s = new Vector3();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3();
const _q = new Quaternion(), _q1 = new Quaternion(), _q2 = new Quaternion(), _r = new Quaternion();

// turn a bone by a world rotation
function turn( bone, q ) {

	bone.parent.getWorldQuaternion( _q1 );
	bone.getWorldQuaternion( _q2 );
	_r.copy( q ).multiply( _q2 );
	bone.quaternion.copy( _q1.invert().multiply( _r ) );
	bone.updateMatrixWorld( true );

}

function turnAbout( bone, axis, angle ) {

	turn( bone, _q.setFromAxisAngle( axis, angle ) );

}

// point a bone at `to` by turning it, from where its child is now
function aim( bone, child, to ) {

	bone.getWorldPosition( _a );
	child.getWorldPosition( _b );
	_c.subVectors( _b, _a ).normalize();
	_d.subVectors( to, _a ).normalize();
	turn( bone, _q.setFromUnitVectors( _c, _d ) );

}

// the two bones of a limb reaching `to`, its middle joint bent toward pole (a world direction)
function reach( upper, lower, end, to, pole ) {

	upper.getWorldPosition( _s );
	lower.getWorldPosition( _a );
	end.getWorldPosition( _b );
	const A = _a.distanceTo( _s ), B = _b.distanceTo( _a );
	_d.subVectors( to, _s );
	const L = Math.min( A + B - 0.002, Math.max( Math.abs( A - B ) + 0.002, _d.length() ) );
	_d.normalize();
	const along = ( A * A - B * B + L * L ) / ( 2 * L ), h = Math.sqrt( Math.max( 0, A * A - along * along ) );
	_p.copy( pole ).addScaledVector( _d, - pole.dot( _d ) );
	if ( _p.lengthSq() < 1e-6 ) _p.set( 0, - 1, 0 );
	_p.normalize();
	_t.copy( _s ).addScaledVector( _d, along ).addScaledVector( _p, h );
	aim( upper, lower, _t );
	_t.copy( _s ).addScaledVector( _d, L ).add( _p.multiplyScalar( 0 ) );
	_t.copy( to );
	// (the far end of the reach, or as near as it goes)
	upper.getWorldPosition( _s );
	_d.subVectors( to, _s );
	if ( _d.length() > L ) _t.copy( _s ).addScaledVector( _d.normalize(), L );
	aim( lower, end, _t );

}

export function bonesOf( root ) {

	const B = {};
	const want = { pelvis: /Pelvis$/, spine: /Spine$/, spine1: /Spine1$/, spine2: /Spine2$/, neck: /Neck$/, head: /Head$/, armL: /L_?UpperArm$/, armR: /R_?UpperArm$/, foreL: /L_?Forearm$/, foreR: /R_?Forearm$/, handL: /L_?Hand$/, handR: /R_?Hand$/, thighL: /L_?Thigh$/, thighR: /R_?Thigh$/, calfL: /L_?Calf$/, calfR: /R_?Calf$/, footL: /L_?Foot$/, footR: /R_?Foot$/ };
	root.traverse( ( o ) => {

		if ( ! o.isBone ) return;
		for ( const k in want ) if ( ! B[ k ] && want[ k ].test( o.name.replace( /[ .]/g, '' ) ) ) B[ k ] = o;

	} );
	return B;

}

export function seatPose( avatar, { hips = 0.13, left = null, right = null, twist = 0, lean = 0.06 } ) {

	const B = avatar.seatBones || ( avatar.seatBones = bonesOf( avatar.character.group ) );
	if ( ! B.pelvis || ! B.thighL || ! B.calfL ) return;
	const g = avatar.group;
	g.updateMatrixWorld( true );
	g.getWorldQuaternion( _q2 );
	_x.set( 1, 0, 0 ).applyQuaternion( _q2 );
	_y.set( 0, 1, 0 ).applyQuaternion( _q2 );
	_z.set( 0, 0, 1 ).applyQuaternion( _q2 );

	// the hips down on the seat
	B.pelvis.getWorldPosition( _a );
	g.getWorldPosition( _b );
	const above = _a.sub( _b ).dot( _y );
	avatar.body.position.y += hips - above;
	avatar.body.updateMatrixWorld( true );

	// the legs out along the deck to the foot braces, knees up and a little apart: seen from above, a diamond
	for ( const [ thigh, calf, foot, s ] of [ [ B.thighL, B.calfL, B.footL, 1 ], [ B.thighR, B.calfR, B.footR, - 1 ] ] ) {

		thigh.getWorldPosition( _s );
		// (+x is the avatar's own left, as it's the boat's port)
		_t.copy( _s ).addScaledVector( _x, s * 0.16 ).addScaledVector( _y, - 0.02 ).addScaledVector( _z, 0.86 );
		_p.copy( _y ).multiplyScalar( 1 ).addScaledVector( _x, s * 0.45 );
		reach( thigh, calf, foot, _t, _p );
		// (the foot up on the brace)
		if ( foot ) turnAbout( foot, _x, - 0.8 );

	}

	// the back upright against the seat, turned with the stroke
	const sp = [ B.spine, B.spine1, B.spine2 ];
	for ( const b of sp ) if ( b ) {

		turnAbout( b, _x, lean / sp.length );
		turnAbout( b, _y, twist / sp.length );

	}

	// (the head stays looking ahead, against the shoulders' turn)
	if ( B.neck ) turnAbout( B.neck, _y, - twist * 0.75 );

	// the arms
	for ( const [ arm, fore, hand, to, s ] of [ [ B.armL, B.foreL, B.handL, left, 1 ], [ B.armR, B.foreR, B.handR, right, - 1 ] ] ) {

		if ( ! arm || ! fore || ! hand ) continue;
		const target = to || _c.copy( B.pelvis.getWorldPosition( _c ) ).addScaledVector( _x, s * 0.15 ).addScaledVector( _z, 0.36 ).addScaledVector( _y, 0.14 );
		// (held apart from the clip's copy)
		_t.copy( target );
		const T = _hand[ s > 0 ? 0 : 1 ].copy( _t );
		_p.copy( _y ).multiplyScalar( - 1 ).addScaledVector( _x, s * 0.7 ).addScaledVector( _z, - 0.25 );
		const pole = _pole[ s > 0 ? 0 : 1 ].copy( _p );
		reach( arm, fore, hand, T, pole );

	}

}

const _hand = [ new Vector3(), new Vector3() ], _pole = [ new Vector3(), new Vector3() ];
