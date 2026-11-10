// (M16) What the sea can see down to. The sea's see-through by the depth to the seabed, which is right for the seabed and hid a boat's
// bottom a few centimetres under the surface as if it lay on the seabed too. So a boat's materials leave their height in the frame's
// alpha, which nothing else reads. On high the sea reads it from its copy of the frame (no other texture, no other draw) and goes
// by the water that's really in the way.
// ((v2.2.3) Only where the sea reads it: SEEN.written, the sea's to set (WaterSurface: on high, built before any boat is). The canvas has
// an alpha channel, the stage's, premultiplied, so what's left in the frame's alpha shows the page behind it: its navy (style.css) lay
// over every boat's lower parts, about half at her waterline, and barn red in shade read navy-grey. On low and mid nothing reads it,
// so it's left at 1. On high the post chain's output sets it back to 1 (PostChain), once the sea's read it, in a pass drawn anyway)
export const SEEN = { base: 4, span: 10, plain: 0.97, written: false };

// a material's onBeforeCompile's shader: its height to the frame's alpha, below SEEN's top, where the sea reads it; all else stays 1
export function seenInWater( shader ) {

	if ( ! SEEN.written ) return;

	shader.vertexShader = shader.vertexShader
		.replace( '#include <common>', '#include <common>\nvarying float vSeenY;' )
		.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvSeenY = ( modelMatrix * vec4( position, 1.0 ) ).y;' );
	shader.fragmentShader = shader.fragmentShader
		.replace( '#include <common>', '#include <common>\nvarying float vSeenY;' )
		.replace( '#include <opaque_fragment>', `#include <opaque_fragment>\n\tgl_FragColor.a = min( ( vSeenY + ${ SEEN.base.toFixed( 1 ) } ) / ${ SEEN.span.toFixed( 1 ) }, 1.0 );` );

}
