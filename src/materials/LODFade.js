// Screen-door cross-fade between levels of detail (and for anything that appears or disappears
// with distance), so nothing switches over in one frame.
//
// Both levels are drawn during a transition band. Each discards the pixels where the ordered-dither
// (Bayer 4x4) threshold says it isn't visible: the incoming level keeps the pixels below `fade`,
// the outgoing one the pixels at or above the SAME threshold, so together they cover every pixel
// exactly once (no holes, no double-drawn pixels).
//
// fade: 0..1, the share of this level that is visible (the same value for both levels of one
// instance: ramp it with distance across the band on the CPU or in the vertex stage).
//
// GLSL (LOD_FADE_GLSL; Salt Life: Tidewater's WGSL shifted the pattern every frame for its TAA,
// there's no temporal filter here so it stays put):
//   float bayer4( vec2 pixel )                        threshold in (0, 1) for a fragment coordinate
//   bool lodFadeVisible( vec2 pixel, float fade, bool outgoing )
// In a fragment snippet: `if ( ! lodFadeVisible( gl_FragCoord.xy, fade, false ) ) discard;`
// (Nothing is discarded at fade >= 1 (incoming) or fade <= 0 (outgoing).)

export const LOD_FADE_GLSL = /* glsl */`
// Bayer 4x4 threshold in (0, 1): bit-interleaved formula of
//   0  8  2 10 / 12  4 14  6 / 3 11  1  9 / 15  7 13  5
float bayer4( vec2 pixel ) {
	ivec2 p = ivec2( pixel ) & 3;
	int x0 = p.x & 1, x1 = p.x >> 1, y0 = p.y & 1, y1 = p.y >> 1;
	int v = ( ( x0 ^ y0 ) << 3 ) | ( y0 << 2 ) | ( ( x1 ^ y1 ) << 1 ) | y1;
	return ( float( v ) + 0.5 ) / 16.0;
}
bool lodFadeVisible( vec2 pixel, float fade, bool outgoing ) {
	float t = bayer4( pixel );
	return outgoing ? t >= fade : t < fade;
}
`;

// Fade factor across a distance band [start, end] (0 before, 1 after), for the level that takes over
// at `end`. Use on the CPU when bucketing instances.
export function bandFade( dist, start, end ) {

	const t = ( dist - start ) / Math.max( end - start, 1e-6 );
	return t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );

}
