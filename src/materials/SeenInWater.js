// (M16) What the sea can see down to. The sea's see-through by the depth to the seabed, which is right for the seabed and hid a boat's
// bottom a few centimetres under the surface as if it lay on the seabed too. So a boat's materials leave their height in the frame's
// alpha, which nothing else reads. On high the sea reads it from its copy of the frame (no other texture, no other draw) and goes
// by the water that's really in the way. Elsewhere it's written and never read. ((M17) The canvas does have an alpha channel, the
// stage's, so the page behind it showed through a boat's lower parts: App.opaqueFrame puts it back to 1 once the frame's drawn)
export const SEEN = { base: 4, span: 10, plain: 0.97 };

// a material's onBeforeCompile's shader: its height to the frame's alpha, below SEEN's top; all else stays 1
export function seenInWater( shader ) {

	shader.vertexShader = shader.vertexShader
		.replace( '#include <common>', '#include <common>\nvarying float vSeenY;' )
		.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvSeenY = ( modelMatrix * vec4( position, 1.0 ) ).y;' );
	shader.fragmentShader = shader.fragmentShader
		.replace( '#include <common>', '#include <common>\nvarying float vSeenY;' )
		.replace( '#include <opaque_fragment>', `#include <opaque_fragment>\n\tgl_FragColor.a = min( ( vSeenY + ${ SEEN.base.toFixed( 1 ) } ) / ${ SEEN.span.toFixed( 1 ) }, 1.0 );` );

}
