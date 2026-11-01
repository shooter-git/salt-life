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
const CABIN_FILL = 0.8; // her downlights
const CABIN_SUN = 0.04; // what daylight gets in: the sun's shadows aren't drawn on a phone, and without this it lights her soles through the deck

export class SportfisherMaterials extends BoatMaterials {

	constructor( lines ) {

		super( lines );
		this.topsides = { value: linear( 0xf4f2ec ) }; // (setPaint)
		this.hull.onBeforeCompile = this._hullCompile();
		this._fillGelcoat();
		this._fillFittings();
		this.cabin = this._createCabin();
		this._oneWayGlass();
		// (three shares a program between materials whose onBeforeCompile reads the same, and BoatMaterials' extend reads the same
		// for every one: her cabin came out as her gelcoat, unlit and the sun on it)
		for ( const k of [ 'hull', 'gelcoat', 'fittings', 'cabin', 'glass', 'glow' ] ) this[ k ].customProgramCacheKey = () => 'sportfisher-' + k;

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
	float overStripe = smoothstep( - aa, aa, boot - 0.13 );
	vec3 c = mix( ${ vec3( linear( 0x141d2c ) ) }, ${ vec3( linear( 0x1a56a0 ) ) }, overBottom );
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
		float px = vLocal.x / 0.085, id = floor( px ), f = fract( px );
		float aaP = fwidth( px ) + 1e-4;
		float seam = smoothstep( 0.02, 0.02 + aaP, f ) * ( 1.0 - smoothstep( 0.98 - aaP, 0.98, f ) );
		float tone = fract( sin( id * 12.9898 ) * 43758.5453 );
		float grain = sin( vLocal.z * 7.0 + tone * 40.0 + sin( vLocal.z * 31.0 + id ) * 0.6 );
		vec3 teak = ${ vec3( linear( 0xc48a52 ) ) } * ( 0.88 + 0.2 * tone + 0.04 * grain );
		diffuseColor.rgb = mix( ${ vec3( linear( 0xd9c7aa ) ) }, teak, seam );

	}
` )
				.replace( '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${ OUTSIDE_FILL.toFixed( 3 ) } * ( 1.0 - 0.9 * sfNight );` );

		} );

	}

	_createCabin() {

		const m = withAux( new THREE.MeshStandardMaterial( { side: THREE.DoubleSide } ), { fragment: /* glsl */`
	if ( vAux.z > 2.5 && vAux.z < 3.5 ) {

		// cherry: a slow, quiet grain up the panels
		float across = vLocal.x + vLocal.z;
		float gr = sin( across * 34.0 + sin( vLocal.y * 2.1 + across * 3.0 ) * 1.6 ) * 0.6 + sin( across * 97.0 + sin( vLocal.y * 5.0 ) ) * 0.4;
		diffuseColor.rgb *= 1.0 + 0.07 * gr;

	} else if ( vAux.z > 3.5 && vAux.z < 4.5 ) {

		// the sole: pale planks fore and aft
		float px = vLocal.x / 0.14, id = floor( px ), f = fract( px ), aaP = fwidth( px ) + 1e-4;
		float seam = smoothstep( 0.0, 0.02 + aaP, f ) * ( 1.0 - smoothstep( 0.98 - aaP, 1.0, f ) );
		float tone = fract( sin( id * 12.9898 ) * 43758.5453 );
		diffuseColor.rgb *= ( 0.92 + 0.14 * tone + 0.03 * sin( vLocal.z * 19.0 + tone * 30.0 ) ) * mix( 0.72, 1.0, seam );

	}
` } );
		m.name = 'boatCabin';
		return extend( m, ( shader ) => {

			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\nvarying vec3 vSfN;\nvarying vec3 vSfEye;' )
				.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvSfN = normal;\n\tvSfEye = ( inverse( modelMatrix ) * vec4( cameraPosition, 1.0 ) ).xyz;' );
			// lit by her downlights: what faces up takes the most, walls less, each way a little differently so that corners show;
			// lower walls less again; and the gloss of her varnish and counters takes them as highlights
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\nvarying vec3 vSfN;\nvarying vec3 vSfEye;' )
				.replace( '#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	vec3 sfN = normalize( vSfN ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
	float sfUp = sfN.y * 0.5 + 0.5;
	float sfLit = mix( 0.42, 1.0, sfUp * sfUp ) * ( 0.9 + 0.1 * abs( sfN.z ) );
	vec3 sfV = normalize( vSfEye - vLocal ), sfR = reflect( - sfV, sfN );
	float sfGloss = pow( max( sfR.y, 0.0 ), 18.0 ) * ( 1.0 - clamp( vAux.x * 1.6, 0.0, 1.0 ) );
	totalEmissiveRadiance += diffuseColor.rgb * ${ CABIN_FILL.toFixed( 3 ) } * sfLit + vec3( 1.0, 0.93, 0.82 ) * sfGloss * 0.5;` )
				.replace( '#include <lights_fragment_end>', `#include <lights_fragment_end>\n\treflectedLight.directDiffuse *= ${ CABIN_SUN.toFixed( 3 ) };\n\treflectedLight.directSpecular *= ${ CABIN_SUN.toFixed( 3 ) };` );

		} );

	}

	// what isn't metal among her fittings takes the same lift as her gelcoat (her tower's roof, seen from under it)
	_fillFittings() {

		extend( this.fittings, ( shader ) => {

			shader.uniforms.sfNight = G.night;
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\nuniform float sfNight;' )
				.replace( '#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${ OUTSIDE_FILL.toFixed( 3 ) } * ( 1.0 - 0.9 * sfNight ) * ( 1.0 - vAux.y );` );

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
