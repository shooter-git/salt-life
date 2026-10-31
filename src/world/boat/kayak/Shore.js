import { Euler, MathUtils, Quaternion, Vector3 } from '../../../engine/index.js';

// (M16) The kayak and the sand: how she lies on it, and where she goes when she's pulled up it or launched down it.
// Nobody ties a 12 ft kayak to a pier: you run her up on the beach, step out and pull her clear of the waves; and to
// go, you shove her down into the water and sit in. She's heavy enough (29 kg, and what's in her) to drag rather than
// carry. Pure but for three's maths; the terrain's only asked for its height.

export const KEEL = 0.122; // m her lowest point's below her waterline
export const DRY = 0.5; // m above the sea: clear of the wash on a fair day
export const AFLOAT = 0.24; // m of water: she floats free with you in her
const STEEP = 0.45; // a grade past this isn't a beach
const STEP = 0.5;

const _q = new Quaternion(), _e = new Euler( 0, 0, 0, 'YXZ' );

// the way down the ground from ( x, z ), as a unit { x, z }, over a few metres (a beach falls steadily; the odd hollow
// doesn't turn it)
export function fallLine( T, x, z, span = 2.5 ) {

	const dx = T.heightAt( x + span, z ) - T.heightAt( x - span, z ), dz = T.heightAt( x, z + span ) - T.heightAt( x, z - span );
	const l = Math.hypot( dx, dz );
	return l > 1e-5 ? { x: - dx / l, z: - dz / l, grade: l / ( 2 * span ) } : { x: 0, z: 1, grade: 0 };

}

// from a point at the water's edge up the sand to where she's clear of the wash: { x, z, heading } with her bow to the
// sea (as you'd leave her), or null if the way up isn't sand (too steep) or too far
export function dryFrom( T, sea, x, z, most = 16 ) {

	let px = x, pz = z, walked = 0;
	const first = fallLine( T, x, z );
	if ( first.grade > STEEP ) return null;
	while ( T.heightAt( px, pz ) < sea + DRY ) {

		const f = fallLine( T, px, pz );
		if ( f.grade > STEEP || walked > most ) return null;
		px -= f.x * STEP;
		pz -= f.z * STEP;
		walked += STEP;

	}

	const f = fallLine( T, px, pz );
	return { x: px, z: pz, heading: Math.atan2( f.x, f.z ) };

}

// from where she lies on the sand, down to where she floats free: { x, z, heading, metres } bow first, or null
export function waterFrom( T, sea, x, z, most = 40 ) {

	let px = x, pz = z, walked = 0, last = fallLine( T, x, z );
	while ( sea - T.heightAt( px, pz ) < AFLOAT ) {

		const f = fallLine( T, px, pz );
		// (the sand's flat: keep on the way it was going)
		const g = f.grade > 0.004 ? f : last;
		last = g;
		px += g.x * STEP;
		pz += g.z * STEP;
		walked += STEP;
		if ( walked > most ) return null;

	}

	return { x: px, z: pz, heading: Math.atan2( last.x, last.z ), metres: walked };

}

// her pose lying on the ground at ( x, z ), bow toward heading: settles on her keel, pitched and rolled to the slope,
// afloat where the ground's under the sea. position, quaternion: filled
export function layOn( T, sea, x, z, heading, position, quaternion ) {

	const sin = Math.sin( heading ), cos = Math.cos( heading );
	const B = 1.15, S = 0.28;
	const bow = T.heightAt( x + sin * B, z + cos * B ), stern = T.heightAt( x - sin * B, z - cos * B );
	const port = T.heightAt( x + cos * S, z - sin * S ), star = T.heightAt( x - cos * S, z + sin * S );
	const pitch = Math.atan2( bow - stern, 2 * B ), roll = Math.atan2( port - star, 2 * S );
	const ground = ( bow + stern + port + star ) / 4;
	const y = Math.max( ground + KEEL, sea );
	position.set( x, y, z );
	// (y up, then nose up by pitch, then heeled by roll: lying on the slope, not sunk in it)
	const k = MathUtils.smoothstep( y - ground - KEEL, 0.02, 0.1 ); // (afloat, level)
	_e.set( - pitch * ( 1 - k ), heading, roll * 0.8 * ( 1 - k ), 'YXZ' );
	quaternion.copy( _q.setFromEuler( _e ) );

}
