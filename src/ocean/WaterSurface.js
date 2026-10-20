import * as THREE from '../engine/index.js';
import { CDLOD } from '../core/CDLOD.js';
import { G } from '../core/Globals.js';

// The sea: one instanced CDLOD grid that follows the camera out to the horizon, displaced by the
// Gerstner waves (Waves) in the vertex shader. Tidewater's surface combined four FFT cascades, the
// breaking shore waves and the boat's wake simulation; those arrive here step by step.
//
// The water is drawn after the opaque scene. Its own colour is the light scattered back up from inside
// it, lit by the sky and the sun (not by which way the surface faces): turquoise over the sand, deep
// blue offshore, by the depth read from the terrain's height texture. Over the shallows it lets the
// sea floor show through; its reflections stay at full strength there (premultiplied output: the
// water's own light is weighted by its opacity, the reflections are not).

const LOD_GRID = { low: 12, mid: 20, high: 32 };
// an sRGB colour as a linear GLSL vec3 (shading is linear)
const rgb = ( r, g, b ) => {

	const c = new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
	return `vec3( ${ c.r.toFixed( 4 ) }, ${ c.g.toFixed( 4 ) }, ${ c.b.toFixed( 4 ) } )`;

};

export class WaterSurface {

	constructor( { scene, waves, terrain, tier = 'low' } ) {

		this.waves = waves;
		this.terrain = terrain;
		this.lod = new CDLOD( { gridSize: LOD_GRID[ tier ] ?? LOD_GRID.low, leafSize: 8, levels: 12, minY: - 4, maxY: 4, prefix: 'oceanLod' } );

		const uniforms = {
			...this.lod.uniforms,
			...terrain.heightUniforms,
			...waves.uniforms,
			waterSeaLevel: G.seaLevel,
			waterTime: G.time,
			waterSunColor: G.sunColor,
			waterSunDir: G.sunDir,
			waterSky: G.skyIrradiance,
		};

		const mat = this.material = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.1, metalness: 0, envMapIntensity: 3.2, transparent: true, side: THREE.DoubleSide } );
		mat.name = 'Water';
		mat.premultipliedAlpha = true;
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + this.lod.glsl + terrain.heightGlsl + waves.glsl + 'uniform float waterSeaLevel;\nvarying vec3 vWater;\nvarying float vWaterFade;\n' )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	${ this.lod.vertexNodes() }
	vec2 x0 = lod.worldXZ;
	float fade = waveFade( waterSeaLevel - terrainHeightAt( x0 ) );
	vec3 wn;
	vec3 disp = waveDisplacement( x0, fade, wn );
	vec3 objectNormal = normalize( wn );
	vec3 wPos = vec3( x0.x + disp.x, waterSeaLevel + disp.y, x0.y + disp.z );
	vWater = wPos;
	vWaterFade = fade;` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = wPos;' );

			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + terrain.heightGlsl + /* glsl */`
uniform float waterTime;
uniform vec3 waterSunColor;
uniform vec3 waterSunDir;
uniform vec3 waterSky;
varying vec3 vWater;
varying float vWaterFade;
` )
				.replace( '#include <color_fragment>', /* glsl */`
	float floorH = terrainHeightAt( vWater.xz );
	float depth = max( vWater.y - floorH, 0.0 );
	// see-through only over the shallows: deeper, the water's own colour is all there is
	float cover = smoothstep( 0.0, 4.5, depth ) * 0.85 + 0.15;
	// a soft foam line where the water runs out on the sand
	float lap = sin( dot( vWater.xz, vec2( 0.11, 0.93 ) ) * 1.7 - waterTime * 1.3 ) * 0.5 + 0.5;
	float foam = ( 1.0 - smoothstep( 0.0, 0.08 + 0.16 * lap, depth ) ) * ( 0.35 + 0.45 * lap );
	// the body of the water: light scattered back up from inside it (and off the sand under the
	// shallows), lit by the sky and the sun whatever way the surface faces. Turquoise over sand,
	// deep blue offshore
	vec3 body = mix( ${ rgb( 0.2, 0.62, 0.6 ) }, ${ rgb( 0.035, 0.16, 0.25 ) }, smoothstep( 0.8, 14.0, depth ) );
	body = mix( body, ${ rgb( 0.012, 0.06, 0.11 ) }, smoothstep( 14.0, 60.0, depth ) );
	vec3 waterLight = waterSunColor * ( max( waterSunDir.y, 0.0 ) * 0.22 ) + waterSky * 0.55;
	vec3 waterBody = mix( body * waterLight, ${ rgb( 0.92, 0.95, 0.95 ) } * ( waterLight * 0.8 + 0.05 ), foam * 0.8 );
	diffuseColor.rgb = vec3( 0.0 );
	diffuseColor.a = clamp( max( cover, foam ), 0.0, 1.0 );
` )
				.replace( '#include <opaque_fragment>', /* glsl */`
	// premultiplied: the water's own light by its opacity, reflections in full
	gl_FragColor = vec4( waterBody * diffuseColor.a + totalSpecular, diffuseColor.a );` )
				.replace( '#include <premultiplied_alpha_fragment>', '' );

		};

		this.mesh = new THREE.Mesh( this.lod.geometry, mat );
		this.mesh.name = 'Water';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 1;
		scene.add( this.mesh );

	}

	update( camera ) {

		this.lod.update( camera );

	}

}
