// (M16) What the sea does to someone in a kayak. Pure, for the tests under Node.
//
// A sit-on-top's a stable thing to sit on until her gunwale goes under, and then she's over all at once: her deck edge
// is 27 degrees off the water at her waterline. A paddler in the water with a blade can hold her past that (a low
// brace); someone sat with a rod in their hands can't quite reach it. A breaker rolls her at about the height that tumbles a
// swimmer (ocean/ShoreWaves' TUMBLE_H: trough to crest as it stands up over the bar, a fair day's at most 2.8 m there and
// 1.6 m typically): so almost never on a fair day, and half as much again with her bow to it. Punching out through a fair
// day's surf bow on is what everyone does. A life jacket doesn't stop any of it: you're quicker back aboard and lose less.

const DEG = Math.PI / 180;
export const HEEL = { brace: 41 * DEG, idle: 33 * DEG, fishing: 28 * DEG };
export const TUMBLE_B = 0.85; // how broken a breaker is, to count (Player's)
const BEAM_H = 2.9, BOW_H = 4.2;

// rad she can be heeled before she's over
export const capsizeHeel = ( bracing, hands ) => ( hands ? HEEL.fishing : bracing ? HEEL.brace : HEEL.idle );

// a breaker of height H (m) comes down on her; face: 0 on her beam, 1 her bow or stern to it
export const breakerCapsizes = ( H, face ) => H > BEAM_H + ( BOW_H - BEAM_H ) * face * face;

// the share of the cooler's fish lost when she goes over (a strapped cooler keeps a good deal)
export const spillShare = ( jacket ) => ( jacket ? 0.25 : 0.5 );

// s to climb back over her side from the water
export const climbSeconds = ( jacket ) => ( jacket ? 1.4 : 2.3 );

// Getting soaked, 0..1. It comes on in a few minutes of rain (a downpour's soaked you in about a minute and a half: this
// is a person in a T-shirt), in moments when the sea's coming over her deck, slowly from spray once the wind's up; and it
// dries in about a quarter of an hour's island breeze (there's no one who can say exactly, and nothing hangs on it).
export const SOAKED = 0.6;
export function soakStep( s, dt, { rain = 0, wash = 0, wind = 0, sheltered = false } ) {

	let rate = - 0.0011 * ( 1 + Math.max( 0, wind ) / 10 );
	if ( ! sheltered ) rate += 0.011 * rain;
	// (her gunwale's about 0.17 m above the waterline: a sea past that's aboard)
	if ( wash > 0.17 ) rate += ( wash - 0.17 ) * 4;
	if ( wind > 12 ) rate += ( wind - 12 ) * 0.0016;
	return Math.min( 1, Math.max( 0, s + rate * dt ) );

}
