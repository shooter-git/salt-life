import * as THREE from '../../../engine/index.js';
import { G } from '../../../core/Globals.js';
import { BoatMaterials, withAux, extend } from '../BoatMaterials.js';

// (M16) Her materials: the lobster boat's, with what a convertible's look needs. Her paint's by height (white topsides, a
// blue boot stripe, dark antifouling); her cockpit and bridge soles are teak-look planks (aux.z = 2 on the gelcoat); her
// cabin's its own material, cherry and cream under its downlights, lit by them, as it's always dark in there otherwise;
// and her side windows are one-way as tinted glass is: near black from outside, clear from in the salon.

const linear = ( hex ) => new THREE.Color().setHex( hex ).convertSRGBToLinear();
const vec3 = ( c ) => `vec3( ${ c.r.toFixed( 5 ) }, ${ c.g.toFixed( 5 ) }, ${ c.b.toFixed( 5 ) } )`;

// how much white gelcoat in deep shade is lifted by the sea's bounce: the world's sky fill is kept low for the sand, and
// the underside of her overhang and the faces away from the sun otherwise come out black
const OUTSIDE_FILL = 0.1;
const CABIN_FILL = 0.62; // her downlights

export class SportfisherMaterials extends BoatMaterials {

	constructor( lines ) {

		super( lines );
		this.topsides = { value: linear( 0xf4f2ec ) }; // (setPaint)
		this.hull.onBeforeCompile = this._hullCompile();
		this._fillGelcoat();
		this.cabin = this._createCabin();
		this._oneWayGlass();

	}

	// (BoatMaterials calls this first; the paint's made in _hullCompile, once the topsides' uniform is there)
	createHull() {

		const m = new THREE.MeshStandardMaterial( { roughness: 0.2, metalness: 0 } );
		m.name = 'boatHull';
		m.vertexColors = true;
		return m;

	}

	_hullCompile() {

		const m = this.hull, topsides = this.topsides;
		m.onBeforeCompile = () => {};
		withAux( m, { roughness: false, fragment: /* glsl */`
	float boot = vLocal.y - smoothstep( 2.0, 7.0, vLocal.z ) * 0.1;
	float aa = fwidth( boot ) + 1e-4;
	float overBottom = smoothstep( - aa, aa, boot - 0.04 );
	float overStripe = smoothstep( - aa, aa, boot - 0.16 );
	vec3 c = mix( ${ vec3( linear( 0x141d2c ) ) }, ${ vec3( linear( 0x123a78 ) ) }, overBottom );
	c = mix( c, sfTopsides, overStripe );
	diffuseColor.rgb = c;
	float hullRough = mix( 0.7, 0.16, overBottom );
` } );
		return extend( m, ( shader ) => {

			shader.uniforms.sfTopsides = topsides;
			shader.uniforms.sfNight = G.night;
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\nuniform vec3 sfTopsides;\nuniform float sfNight;' )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = hullRough;' )
				.replace( '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${ OUTSIDE_FILL.toFixed( 3 ) } * ( 1.0 - 0.9 * sfNight );` );

		} ).onBeforeCompile;

	}

	_fillGelcoat() {

		extend( this.gelcoat, ( shader ) => {

			shader.uniforms.sfNight = G.night;
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\nuniform float sfNight;' )
				.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
	if ( vAux.z > 1.5 && vAux.z < 2.5 ) {

		// teak-look: planks fore and aft, each its own shade, pale seams between
		float px = vLocal.x / 0.095, id = floor( px ), f = fract( px );
		float aaP = fwidth( px ) + 1e-4;
		float seam = smoothstep( 0.05, 0.05 + aaP, f ) * ( 1.0 - smoothstep( 0.95 - aaP, 0.95, f ) );
		float tone = fract( sin( id * 12.9898 ) * 43758.5453 );
		float grain = sin( vLocal.z * 7.0 + tone * 40.0 + sin( vLocal.z * 31.0 + id ) * 0.6 );
		vec3 teak = ${ vec3( linear( 0xb8783f ) ) } * ( 0.88 + 0.2 * tone + 0.04 * grain );
		diffuseColor.rgb = mix( ${ vec3( linear( 0xe8dcc6 ) ) }, teak, seam );

	}
` )
				.replace( '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${ OUTSIDE_FILL.toFixed( 3 ) } * ( 1.0 - 0.9 * sfNight );` );

		} );

	}

	_createCabin() {

		const m = withAux( new THREE.MeshStandardMaterial( { side: THREE.DoubleSide } ), { fragment: /* glsl */`
	if ( vAux.z > 2.5 && vAux.z < 3.5 ) {

		// cherry: its grain up the panels, a slow wave through it
		float g = sin( ( vLocal.x + vLocal.z ) * 90.0 + sin( vLocal.y * 7.0 + vLocal.x ) * 3.0 ) * 0.5 + 0.5;
		diffuseColor.rgb *= 0.86 + 0.2 * g * g;

	}
` } );
		m.name = 'boatCabin';
		return extend( m, ( shader ) => {

			// the light's from overhead: the ceiling's own glow, what's under it a little less
			shader.fragmentShader = shader.fragmentShader.replace( '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${ CABIN_FILL.toFixed( 3 ) };` );

		} );

	}

	_oneWayGlass() {

		const g = this.glass;
		g.color.setHex( 0x0b0f12 );
		g.roughness = 0.04;
		g.opacity = 0.9;
		g.name = 'boatGlassTinted';
		g.onBeforeCompile = ( shader ) => {

			shader.fragmentShader = shader.fragmentShader.replace( '#include <color_fragment>', '#include <color_fragment>\n\tif ( ! gl_FrontFacing ) diffuseColor.a *= 0.22;' );

		};

	}

	// her topsides' colour (Vessel.setPaint: the paint's in the shader)
	setTopsides( hex ) {

		this.topsides.value.copy( linear( hex ) );

	}

	dispose() {

		super.dispose();
		this.cabin.dispose();

	}

}
