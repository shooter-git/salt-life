import { Color, MeshStandardMaterial } from '../../../engine/index.js';
import { BoatMaterials, withAux, extend } from '../BoatMaterials.js';
import { useGroundBounce } from '../../../materials/GroundBounce.js';

// (M16) Her materials: the boat's, with one body for her hull and all her gelcoat (a draw and a program the fewer). Its
// aux pattern says what a surface is:
//   0 as its colour says   1 non-skid   2 topsides (the paint; aux.w: how far up them, 0 at the chine: a pinstripe over it)
//   3 the bottom (white over antifouling)   4 the teak-look mat on her platform
export const SURFACE = { plain: 0, nonSkid: 1, topsides: 2, bottom: 3, mat: 4 };

const BOTTOM = new Color( 0x1c2c44 ).convertSRGBToLinear(); // (her antifouling, blue as a boat kept in clear water's is)
const NAVY = 0x234a75; // (her topsides as she comes, as the Regulator's in the running shots)

const DECK_BOUNCE = new Color( 0.44, 0.44, 0.43 ); // (white gelcoat throwing it back: no sand's colour in it)

export class ConsoleMaterials extends BoatMaterials {

	constructor( lines ) {

		super( lines );
		this.gelcoat.dispose();
		this.wood.dispose();
		this.gelcoat = this.wood = this.hull;
		// (her white decks throw the light about her, under the top and behind the console, where the world's low fill alone
		// leaves them near black: the bounce people have, diffuse only so it puts no sheen on her)
		for ( const m of [ this.hull, this.fittings ] ) {

			useGroundBounce( m, { sand: DECK_BOUNCE } );
			m.userData.groundBounceOpen.value = 0.8;

		}


	}

	createHull() {

		this.paint = { value: new Color( NAVY ).convertSRGBToLinear() };
		const m = withAux( new MeshStandardMaterial( { roughness: 0.3, metalness: 0, side: 2 } ), { fragment: /* glsl */`
	float pat = vAux.z;
	float surfRough = -1.0;
	if ( pat > 3.5 ) {

		// the mat: teak-coloured planks and pale seams, running fore and aft
		float seam = smoothstep( 0.42, 0.46, abs( fract( vLocal.x / 0.075 ) - 0.5 ) );
		float aa = clamp( fwidth( vLocal.x ) / 0.03, 0.0, 1.0 );
		diffuseColor.rgb = mix( mix( vec3( 0.45, 0.25, 0.11 ), vec3( 0.72, 0.68, 0.6 ), seam ), vec3( 0.47, 0.29, 0.15 ), aa );
		surfRough = 0.85;

	} else if ( pat > 2.5 ) {

		// white down to the boot, antifouling under it; the boot sweeps up a little to the bow
		float boot = vLocal.y - smoothstep( 0.8, 3.0, vLocal.z ) * 0.08;
		float aa = fwidth( boot ) + 1e-4;
		float above = smoothstep( - aa, aa, boot - 0.07 );
		diffuseColor.rgb = mix( vec3( ${ BOTTOM.r.toFixed( 4 ) }, ${ BOTTOM.g.toFixed( 4 ) }, ${ BOTTOM.b.toFixed( 4 ) } ), vec3( 0.86, 0.86, 0.84 ), above );
		surfRough = mix( 0.75, 0.25, above );

	} else if ( pat > 1.5 ) {

		// the paint, a red pinstripe at its foot
		float s = vAux.w;
		float aa = fwidth( s ) + 1e-4;
		float pin = smoothstep( 0.012 - aa, 0.012 + aa, s ) * ( 1.0 - smoothstep( 0.05 - aa, 0.05 + aa, s ) );
		diffuseColor.rgb = mix( hullPaint, vec3( 0.55, 0.03, 0.03 ), pin );
		surfRough = 0.16;

	} else if ( pat > 0.5 ) {

		// non-skid: a fine raised diamond, gone to its average where it's too fine to see
		vec2 q = vec2( vLocal.x + vLocal.z, vLocal.x - vLocal.z ) / 0.016;
		float aa = clamp( fwidth( q.x ) * 0.8, 0.0, 1.0 );
		float d = abs( fract( q.x ) - 0.5 ) * abs( fract( q.y ) - 0.5 ) * 4.0;
		diffuseColor.rgb *= mix( 0.86 + 0.14 * smoothstep( 0.05, 0.3, d ), 0.93, aa );
		surfRough = 0.72;

	}
` } );
		m.name = 'consoleBody';
		m.customProgramCacheKey = () => 'consoleBody';
		const paint = this.paint;
		return extend( m, ( shader ) => {

			shader.uniforms.hullPaint = paint;
			shader.fragmentShader = shader.fragmentShader
				.replace( 'varying vec4 vAux;', 'uniform vec3 hullPaint;\nvarying vec4 vAux;' )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\tif ( surfRough >= 0.0 ) roughnessFactor = surfRough;' );

		} );

	}

	// (null: as she came. ((M16) it was black: setHex( null ))
	setPaint( hex ) {

		this.paint.value.setHex( hex ?? NAVY ).convertSRGBToLinear();

	}

	dispose() {

		for ( const k of [ 'hull', 'fittings', 'glass', 'glow', 'display' ] ) this[ k ].dispose();

	}

}
