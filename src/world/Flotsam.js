import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// (M15) The debris found out there (game/Finds.js' debris): a log, a plank, a pallet, a fish crate or a lost
// float, riding the open sea as it lies in it: its middle at the waves' height there (Waves.heightAt, the
// CPU's: what the GPU draws), tilted with their slope, settled as deep as it floats (a log nearly awash, a
// plank on top), its wet wood darkened at the waterline. Drawn within SEEN m of the camera (they're small:
// you come on them), as many as MAX; each fades in and out with its life by sinking.
//
//   const flotsam = new Flotsam( { scene, waves } );   flotsam.update( finds.debris, camera )

const MAX = 8;
const SEEN = 900;
// each kind: how it's made (from its size, m), how deep it floats (of its height), and its colour (sRGB)
const KINDS = {
	log: { draft: 0.55, colour: [ 0.42, 0.37, 0.3 ] },
	plank: { draft: 0.4, colour: [ 0.56, 0.49, 0.38 ] },
	pallet: { draft: 0.45, colour: [ 0.62, 0.53, 0.38 ] },
	crate: { draft: 0.5, colour: [ 0.16, 0.33, 0.58 ] },
	float: { draft: 0.45, colour: [ 0.92, 0.38, 0.08 ] },
};
const _n = new THREE.Vector3(), _up = new THREE.Vector3( 0, 1, 0 ), _q = new THREE.Quaternion(), _yaw = new THREE.Quaternion();

// its geometry, unit-sized along its length (scaled by its size): [ geometry, height (m at size 1) ]
function geometryOf( kind ) {

	switch ( kind ) {

		case 'log': {

			const g = new THREE.CylinderGeometry( 0.05, 0.045, 1, 10, 1 );
			g.rotateZ( Math.PI / 2 );
			return [ g, 0.1 ];

		}

		case 'plank': return [ new THREE.BoxGeometry( 1, 0.025, 0.14 ), 0.025 ];
		case 'pallet': {

			// (slats over three runners)
			const parts = [];
			for ( let i = 0; i < 5; i ++ ) {

				const s = new THREE.BoxGeometry( 1, 0.02, 0.14 );
				s.translate( 0, 0.05, - 0.4 + i * 0.2 );
				parts.push( s );

			}

			for ( let i = 0; i < 3; i ++ ) {

				const r = new THREE.BoxGeometry( 0.1, 0.08, 1 );
				r.translate( - 0.45 + i * 0.45, 0, 0 );
				parts.push( r );

			}

			return [ merge( parts ), 0.12 ];

		}

		case 'crate': return [ new THREE.BoxGeometry( 1, 0.45, 0.7 ), 0.45 ];
		default: return [ new THREE.SphereGeometry( 0.5, 14, 10 ), 1 ];

	}

}

function merge( parts ) {

	let n = 0, ni = 0;
	for ( const p of parts ) {

		n += p.attributes.position.count;
		ni += p.index.count;

	}

	const pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 ), idx = new Uint32Array( ni );
	let v = 0, k = 0;
	for ( const p of parts ) {

		pos.set( p.attributes.position.array, v * 3 );
		nor.set( p.attributes.normal.array, v * 3 );
		for ( let i = 0; i < p.index.count; i ++ ) idx[ k ++ ] = p.index.array[ i ] + v;
		v += p.attributes.position.count;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	g.setIndex( new THREE.BufferAttribute( idx, 1 ) );
	return g;

}

export class Flotsam {

	constructor( { scene, waves } ) {

		this.waves = waves;
		this.group = new THREE.Group();
		this.group.name = 'Flotsam';
		scene.add( this.group );
		this.kinds = {};
		for ( const [ kind, K ] of Object.entries( KINDS ) ) {

			const [ geometry, height ] = geometryOf( kind );
			const material = new THREE.MeshStandardMaterial( { color: new THREE.Color().setRGB( ...K.colour, THREE.SRGBColorSpace ), roughness: kind === 'float' || kind === 'crate' ? 0.55 : 0.9 } );
			material.name = 'Flotsam';
			// (wet and dark below its waterline, as wood that's been in the sea is)
			material.onBeforeCompile = ( shader ) => {

				shader.vertexShader = shader.vertexShader.replace( '#include <common>', '#include <common>\nvarying float vFlotsamY;' )
					.replace( '#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvFlotsamY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;' );
				shader.fragmentShader = shader.fragmentShader.replace( '#include <common>', '#include <common>\nvarying float vFlotsamY;\nuniform float flotsamSea;' )
					.replace( '#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= mix( 0.45, 1.0, smoothstep( flotsamSea - 0.02, flotsamSea + 0.06, vFlotsamY ) );' );
				shader.uniforms.flotsamSea = G.seaLevel;

			};

			material.customProgramCacheKey = () => 'flotsam';
			this.kinds[ kind ] = { geometry, height, material, draft: K.draft };

		}

		this.meshes = [];
		this._slots = new Map();

	}

	update( debris, camera ) {

		const c = camera.position, waves = this.waves, slots = this._slots;
		const seen = new Set();
		for ( const d of debris ) {

			if ( Math.hypot( d.x - c.x, d.z - c.z ) > SEEN ) continue;
			let m = slots.get( d.n );
			if ( ! m ) {

				if ( slots.size >= MAX ) continue;
				const K = this.kinds[ d.kind ];
				m = new THREE.Mesh( K.geometry, K.material );
				m.name = `Flotsam ${ d.kind }`;
				m.userData.kind = d.kind;
				this.group.add( m );
				slots.set( d.n, m );

			}

			seen.add( d.n );
			const K = this.kinds[ d.kind ], s = d.size, h = K.height * s;
			// (riding the waves there: their height, and their slope a metre or two either way)
			const y = waves.heightAt( d.x, d.z ), e = Math.max( 0.5, s * 0.3 );
			_n.set( - ( waves.heightAt( d.x + e, d.z ) - waves.heightAt( d.x - e, d.z ) ) / ( 2 * e ), 1, - ( waves.heightAt( d.x, d.z + e ) - waves.heightAt( d.x, d.z - e ) ) / ( 2 * e ) ).normalize();
			_q.setFromUnitVectors( _up, _n );
			_yaw.setFromAxisAngle( _up, d.yaw );
			m.quaternion.multiplyQuaternions( _q, _yaw );
			m.scale.setScalar( s );
			// (as deep as it floats; sinking away as its life ends, coming up as it begins)
			m.position.set( d.x, y + h * ( 0.5 - K.draft ) - ( 1 - d.life ) * ( h + 0.5 ), d.z );

		}

		for ( const [ n, m ] of slots ) if ( ! seen.has( n ) ) {

			this.group.remove( m );
			slots.delete( n );

		}

	}

}
