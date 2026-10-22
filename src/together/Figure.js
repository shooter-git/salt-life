import { Group, Mesh, Vector3, Vector4, MathUtils } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, sphere, roundedBox, rod, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from '../game/GameMaterials.js';

// (Salt Life) Another player's stand-in until their character has loaded (Avatar.js), or if it
// doesn't: a low-poly fisher in their colour (their shirt and cap band), one mesh and one draw. The
// legs and arms turn at the hips and shoulders in the vertex shader (aux.w: 1, 2 the left and right
// leg, 3, 4 the left and right arm; avLimbs: their forward angles), so walking, swimming, standing at
// the helm and holding a rod are a few uniforms a frame.
//   const f = new Figure( person );  parent.add( f.group )
//   f.pose( { mode, speed, rod }, dt )   mode 'walk' | 'swim' | 'deck' | 'helm'; rod: holding one
//   f.hand( out )                        the right hand (world), where a rod is held
// Feet at the group's origin facing +Z (the swimmer: the body's float point, lying face down).

const HIP = 0.86, SHOULDER = 1.32;

const LIMBS_GLSL = /* glsl */`
	float limb = aux.w;
	if ( limb > 0.5 ) {
		bool leg = limb < 2.5;
		bool left = limb < 1.5 || ( limb > 2.5 && limb < 3.5 );
		vec3 pivot = vec3( ( left ? 1.0 : - 1.0 ) * ( leg ? 0.1 : 0.215 ), leg ? ${ HIP.toFixed( 3 ) } : ${ SHOULDER.toFixed( 3 ) }, 0.0 );
		float a = limb < 1.5 ? avLimbs.x : limb < 2.5 ? avLimbs.y : limb < 3.5 ? avLimbs.z : avLimbs.w;
		// forward (the hanging limb's end toward +z) by a: about x
		float c = cos( a ); float s = - sin( a );
		vec3 q = P - pivot;
		P = pivot + vec3( q.x, q.y * c - q.z * s, q.y * s + q.z * c );
		Nn = vec3( Nn.x, Nn.y * c - Nn.z * s, Nn.y * s + Nn.z * c );
	}
`;

// the figure (~1.75 m) in the player's colour; its limbs hang straight down
function buildFigure( color ) {

	const P = [];
	const add = ( g, o ) => P.push( prepare( g, o ) );
	const SKIN = { color: 0xa87a58, rough: 0.55, pattern: PAT.skin };
	const SHIRT = { color, rough: 0.85, pattern: PAT.cloth };
	const SHORTS = { color: 0x40505a, rough: 0.9, pattern: PAT.cloth };
	const CAP = { color: 0xe9e4d6, rough: 0.8, pattern: PAT.cloth };
	const V = ( x, y, z ) => new Vector3( x, y, z );
	for ( const s of [ 1, - 1 ] ) {

		const leg = s > 0 ? 1 : 2, arm = s > 0 ? 3 : 4;
		// legs: shorts over the thigh, bare shins, deck shoes
		add( cylinder( 0.08, 0.072, 0.4, 8 ), { ...SHORTS, anim: leg, matrix: mat4( s * 0.1, 0.68, 0 ) } );
		add( cylinder( 0.06, 0.048, 0.44, 8 ), { ...SKIN, anim: leg, matrix: mat4( s * 0.1, 0.26, 0 ) } );
		add( roundedBox( 0.1, 0.07, 0.24, 0.03, 2 ), { color: 0x2c2620, rough: 0.6, anim: leg, matrix: mat4( s * 0.1, 0.035, 0.04 ) } );
		// arms: short sleeve, forearm, hand
		add( rod( V( s * 0.215, 1.34, 0 ), V( s * 0.23, 1.08, 0 ), 0.058, 8, 0.05 ), { ...SHIRT, anim: arm } );
		add( rod( V( s * 0.23, 1.08, 0 ), V( s * 0.235, 0.82, 0.02 ), 0.042, 8, 0.036 ), { ...SKIN, anim: arm } );
		add( sphere( 0.045, 8, 6 ), { ...SKIN, anim: arm, matrix: mat4( s * 0.235, 0.78, 0.03 ) } );

	}

	add( roundedBox( 0.38, 0.5, 0.23, 0.08, 2 ), { ...SHIRT, matrix: mat4( 0, 1.12, 0 ) } );
	add( roundedBox( 0.35, 0.14, 0.22, 0.06, 2 ), { ...SHORTS, matrix: mat4( 0, 0.88, 0 ) } );
	add( cylinder( 0.055, 0.06, 0.1, 8 ), { ...SKIN, matrix: mat4( 0, 1.42, 0.01 ) } );
	add( sphere( 0.105, 12, 9 ), { ...SKIN, matrix: mat4( 0, 1.56, 0.02, 0, 0, 0, 1, 1.12, 1.02 ) } );
	add( sphere( 0.02, 6, 5 ), { ...SKIN, matrix: mat4( 0, 1.55, 0.13, 0, 0, 0, 1, 1.4, 1 ) } );
	// a cap with a peak, its band in the player's colour
	add( sphere( 0.112, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5 ), { ...CAP, matrix: mat4( 0, 1.6, 0.015 ) } );
	add( cylinder( 0.114, 0.114, 0.03, 12 ), { ...SHIRT, matrix: mat4( 0, 1.605, 0.015 ) } );
	add( cylinder( 0.1, 0.1, 0.012, 12, 1, false, - Math.PI * 0.5, Math.PI ), { ...CAP, matrix: mat4( 0, 1.6, 0.1, 0.12, 0, 0, 1, 1, 1.1 ) } );
	return mergePrepared( P );

}

// the avatars' material: the props' (GameMaterials) with the limbs in the vertex shader, its own
// uniforms per avatar in one program
function createAvatarMaterial() {

	const m = createPropMaterial( 'avatar', { uniforms: { avLimbs: { value: new Vector4() } }, vertex: LIMBS_GLSL } );
	// (createPropMaterial's programs are told apart by their code otherwise: the vendors' is the same
	// but for the limbs)
	m.customProgramCacheKey = () => 'avatar';
	return m;

}

const _v = new Vector3();

export class Figure {

	constructor( person ) {

		this.person = person;
		this.group = new Group();
		this.material = createAvatarMaterial();
		this.mesh = new Mesh( buildFigure( person.color ), this.material );
		this.mesh.castShadow = true;
		this.group.add( this.mesh );
		this.limbs = this.material.uniforms.avLimbs.value;
		this._phase = 0;
		this._swim = 0; // 0 upright .. 1 lying in the water
		this._t = Math.random() * 10;

	}

	// limbs and body for this frame: mode, speed (m/s over the ground or through the water), rod
	pose( { mode, speed = 0, rod = false }, dt ) {

		this._t += dt;
		const swimming = mode === 'swim';
		this._swim += ( ( swimming ? 1 : 0 ) - this._swim ) * ( 1 - Math.exp( - dt * 6 ) );
		const L = this.limbs;
		if ( swimming ) {

			// front crawl: the arms turn over, the legs flutter
			this._phase += dt * ( 2.2 + speed * 1.4 );
			const p = this._phase;
			L.set( Math.sin( p * 2.6 ) * 0.25, - Math.sin( p * 2.6 ) * 0.25, p % ( Math.PI * 2 ), ( p + Math.PI ) % ( Math.PI * 2 ) );
			L.z = Math.PI - L.z; L.w = Math.PI - L.w; // (from overhead, pulled down past the hip)

		} else if ( mode === 'helm' ) {

			L.set( 0, 0, 0.95, 0.95 ); // both hands on the wheel

		} else {

			// walking: legs swing with the stride, arms against them; the rod hand forward
			const k = MathUtils.clamp( speed / 1.4, 0, 1.6 );
			this._phase += dt * speed / 1.35 * Math.PI;
			const s = Math.sin( this._phase ) * 0.5 * Math.min( k, 1.2 );
			const breathe = Math.sin( this._t * 1.7 ) * 0.02;
			L.set( s, - s, - s * 0.7 + 0.05 + breathe, rod ? 0.85 : s * 0.7 + 0.05 + breathe );

		}

		// (lying in the water: the Avatar's) a little bob in the stride
		this.mesh.position.y = ( 1 - this._swim ) * Math.abs( Math.sin( this._phase ) ) * 0.025 * Math.min( speed, 1.5 );

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();

	}

	// the right hand (world): the rod's grip
	hand( out ) {

		const a = this.limbs.w;
		_v.set( - 0.235, SHOULDER - Math.cos( a ) * 0.55, Math.sin( a ) * 0.55 );
		this.mesh.updateMatrixWorld();
		return out.copy( _v ).applyMatrix4( this.mesh.matrixWorld );

	}

}

// for the load's shaders (prepareLate): the figures' program, on a stand-in
export function figureStandIn() {

	return new Mesh( buildFigure( '#888888' ), createAvatarMaterial() );

}
