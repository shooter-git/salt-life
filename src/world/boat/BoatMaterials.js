import * as THREE from '../../engine/index.js';

// The lobster boat's materials, for WebGL 2. Its geometry carries the look: GeoKit's `color` is the
// linear albedo and `aux` = ( roughness, metalness, pattern, animation weight ). Tidewater's WGSL
// materials added procedural wear (non-skid, grime, streaks, the radar and chart plotter screens);
// these keep the paint, the finishes, the glowing lenses and the trap netting.

const linear = ( hex ) => new THREE.Color().setHex( hex ).convertSRGBToLinear();
const vec3 = ( c ) => `vec3( ${ c.r.toFixed( 5 ) }, ${ c.g.toFixed( 5 ) }, ${ c.b.toFixed( 5 ) } )`;

// every boat material: aux to the fragment (roughness, metalness, pattern) and the model-space position
function withAux( material, { fragment = '', uniforms = {}, roughness = true } = {} ) {

	material.vertexColors = true;
	material.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec4 aux;\nvarying vec4 vAux;\nvarying vec3 vLocal;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvAux = aux;\n\tvLocal = position;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nvarying vec4 vAux;\nvarying vec3 vLocal;\n' + Object.keys( uniforms ).map( ( k ) => `uniform float ${ k };` ).join( '\n' ) )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = vAux.y;' )
			.replace( '#include <color_fragment>', '#include <color_fragment>\n' + fragment );
		if ( roughness ) shader.fragmentShader = shader.fragmentShader.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = max( vAux.x, 0.04 );' );

	};
	return material;

}

// chain another change onto a material's onBeforeCompile
function extend( material, fn ) {

	const build = material.onBeforeCompile;
	material.onBeforeCompile = ( shader ) => {

		build( shader );
		fn( shader );

	};
	return material;

}

export class BoatMaterials {

	constructor( hullShape ) {

		// uniform handles ({ value }), as the TSL uniform() nodes were
		this.navOn = { value: 1 };
		this.flagPivot = { value: new THREE.Vector3() };
		this.flagDir = { value: new THREE.Vector3( 1, 0, 0 ) };
		this.flagWind = { value: 0 };

		this.hull = this.createHull( hullShape );
		this.gelcoat = withAux( new THREE.MeshStandardMaterial( { side: THREE.DoubleSide } ) );
		this.wood = withAux( new THREE.MeshStandardMaterial() );
		this.fittings = withAux( new THREE.MeshStandardMaterial() );
		for ( const k of [ 'gelcoat', 'wood', 'fittings' ] ) this[ k ].name = 'boat' + k[ 0 ].toUpperCase() + k.slice( 1 );
		this.glass = new THREE.MeshStandardMaterial( { color: 0xa9bec4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false } );
		this.glass.name = 'boatGlass';
		this.glow = this.createGlow();
		this.trap = this.createTrap();

	}

	// Hull exterior: antifouling / boot stripe / white topsides painted by height in the boat frame
	// (the hull mesh sits at the root with an identity transform).
	createHull( shape ) {

		const m = new THREE.MeshStandardMaterial( { roughness: 0.25, metalness: 0 } );
		m.name = 'boatHull';
		withAux( m, { roughness: false, fragment: /* glsl */`
	vec3 p = vLocal;
	float tS = clamp( ( p.z - ${ shape.zAft.toFixed( 4 ) } ) / ${ shape.length.toFixed( 4 ) }, 0.0, 1.0 );
	float sheer = pow( tS, 2.2 ) * 0.62 + 0.98 + pow( max( 1.0 - tS / 0.2, 0.0 ), 2.0 ) * 0.04;
	// the boot top sweeps up slightly toward the bow
	float boot = p.y - smoothstep( 0.8, 4.3, p.z ) * 0.06;
	float aaB = fwidth( boot ) + 1e-4;
	float aboveBottom = smoothstep( -aaB, aaB, boot - 0.05 );
	float aboveStripe = smoothstep( -aaB, aaB, boot - 0.15 );
	float below = sheer - p.y;
	float aaS = fwidth( below ) + 1e-4;
	float cove = smoothstep( -aaS, aaS, below - 0.1 ) * ( 1.0 - smoothstep( -aaS, aaS, below - 0.122 ) );
	vec3 c = mix( ${ vec3( linear( 0x7a1d15 ) ) }, ${ vec3( linear( 0x0f1a30 ) ) }, aboveBottom );
	c = mix( c, ${ vec3( linear( 0xf2efe6 ) ) }, aboveStripe );
	c = mix( c, ${ vec3( linear( 0x0f1a30 ) ) }, cove );
	diffuseColor.rgb = c;
	float hullRough = mix( mix( 0.75, 0.35, aboveBottom ), 0.2, aboveStripe );
` } );
		return extend( m, ( shader ) => {

			shader.fragmentShader = shader.fragmentShader.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = hullRough;' );

		} );

	}

	// Emissive parts. aux.z selects: 0 nav light, 1 radar display, 2 chart plotter, 3 gauge dial,
	// 4 flood/spot light, 5 cabin dome light, 6 LCD.
	createGlow() {

		const m = new THREE.MeshStandardMaterial( { color: 0x000000, roughness: 0.3, metalness: 0, emissive: 0xffffff } );
		m.name = 'boatGlow';
		withAux( m, { uniforms: { navOn: this.navOn } } );
		return extend( m, ( shader ) => {

			shader.fragmentShader = shader.fragmentShader.replace( '#include <emissivemap_fragment>', /* glsl */`
	float glowMode = vAux.z;
	float glowOn = glowMode < 0.5 ? navOn : 1.0;
	totalEmissiveRadiance = vColor.rgb * glowOn * ( glowMode < 0.5 || glowMode > 3.5 ? 2.5 : 0.8 );` );

		} );

	}

	// Wire traps and their netting: alpha-tested mesh drawn from the UVs (metres).
	createTrap() {

		const m = new THREE.MeshStandardMaterial( { roughness: 0.55, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 } );
		m.name = 'boatTrap';
		withAux( m, { roughness: false, fragment: /* glsl */`
	float net = step( abs( vAux.z - 1.0 ), 0.5 );
	vec2 u = vTrapUv;
	vec2 diag = vec2( u.x + u.y, u.x - u.y ) * 0.7071;
	vec2 q = mix( u / 0.038, diag / 0.05, net );
	vec2 fr = abs( fract( q ) - 0.5 );
	vec2 fw = fwidth( q );
	float halfW = mix( ${ ( 0.5 - 0.0045 / 0.038 ).toFixed( 5 ) }, ${ ( 0.5 - 0.002 / 0.05 ).toFixed( 5 ) }, net );
	float lineX = smoothstep( halfW - fw.x, halfW, fr.x );
	float lineY = smoothstep( halfW - fw.y, halfW, fr.y );
	float b = 0.014;
	float inner = step( b, u.x ) * step( b, u.y ) * step( u.x, vAux.x - b ) * step( u.y, vAux.y - b );
	float border = ( 1.0 - inner ) * ( 1.0 - net );
	diffuseColor.a = max( max( lineX, lineY ), border );
	diffuseColor.rgb *= mix( 1.0, 0.8, border );
` } );
		return extend( m, ( shader ) => {

			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\nvarying vec2 vTrapUv;' )
				.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvTrapUv = uv;' );
			shader.fragmentShader = shader.fragmentShader.replace( '#include <common>', '#include <common>\nvarying vec2 vTrapUv;' );

		} );

	}

	setNavLights( on ) {

		this.navOn.value = on ? 1 : 0;

	}

	dispose() {

		for ( const k of [ 'hull', 'gelcoat', 'wood', 'fittings', 'glass', 'glow', 'trap' ] ) this[ k ].dispose();

	}

}
