import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from '../../engine/index.js';
import { G } from '../../core/Globals.js';

// (M16) Polarized glasses. The glare off the water is light polarized flat, and they take it out. How much depends on how
// you look: at the water's Brewster angle (37 degrees below the horizon) a polarizer takes nearly all the reflection, and
// looking along the surface barely half, so the higher you are, the further you see into the water. That's what the tower
// is for: a fish a deck's eye (3 m up) sees only close to, one from the tower (12 m and more) sees 150 m off.
//
//   worn  (Gear.js' polarized) above the water, by day
//   the sea's reflection down by that much (WaterSurface's envMapIntensity: no new shader on it)
//   fish shown under what's found out there: dark shapes holding under the weed and debris (mahi), under the birds (tuna)
//
// The shapes are one instanced mesh with a little program of its own, made when you're first out there with the glasses on,
// so nobody without them pays for it. It's drawn after the sea, its fade worked out here.
const MAX = 36;
const BREWSTER = 37 * Math.PI / 180;
const SEE = { from: 4 * Math.PI / 180, to: 13 * Math.PI / 180, far: [ 150, 260 ] }; // the angle under which fish show; m
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _d = new Vector3(), _y = new Vector3( 0, 1, 0 );

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// how much of the sea's reflection is left through them, looking `below` radians under the horizon: all but what a
// polarizer takes, half of it along the surface and nearly all at Brewster's angle
export function glareLeft( below ) {

	const e = Math.min( Math.PI / 2, Math.abs( below ) );
	const k = e < BREWSTER ? e / BREWSTER : 1 - ( e - BREWSTER ) / ( Math.PI / 2 - BREWSTER );
	return 0.5 - 0.42 * k;

}

// how plainly they show a fish d m off with your eye h m above the water, 0..1
export function fishSeen( h, d ) {

	const e = Math.atan2( Math.max( 0, h ), Math.max( d, 0.1 ) );
	return smooth( SEE.from, SEE.to, e ) * ( 1 - smooth( SEE.far[ 0 ], SEE.far[ 1 ], d ) );

}

// a fish from above at unit length: tail, body and the fork of its tail
function fishShape() {

	const pts = [ [ 0, 0.5 ], [ 0.05, 0.36 ], [ 0.085, 0.15 ], [ 0.08, - 0.08 ], [ 0.045, - 0.28 ], [ 0.015, - 0.38 ], [ 0.085, - 0.5 ] ];
	const pos = [], idx = [];
	for ( const [ x, z ] of pts ) pos.push( x, 0, z );
	for ( let i = pts.length - 1; i >= 1; i -- ) pos.push( - pts[ i ][ 0 ], 0, pts[ i ][ 1 ] );
	pos.push( 0, 0, - 0.42 );
	const n = pos.length / 3 - 1;
	// a fan about the middle of the body
	const mid = n;
	pos[ mid * 3 ] = 0;
	pos[ mid * 3 + 2 ] = 0;
	for ( let i = 0; i < n; i ++ ) idx.push( mid, i, ( i + 1 ) % n );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new BufferAttribute( new Float32Array( pos ), 3 ) );
	g.setIndex( idx );
	return g;

}

export class Glasses {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.shapes = null;
		this.fade = null;
		this._base = null; // the sea's own reflection, when last we saw it
		this.worn = false;

	}

	update( dt ) {

		const app = this.app, game = this.game, p = app.player, water = app.water, cam = app.camera;
		const under = p.mode === 'swim' && p.under;
		const on = !! game.state.stats.polarized && ! under && ! app.freeCam;
		this.worn = on;
		if ( water && water.material ) {

			const mat = water.material;
			if ( this._base === null ) this._base = mat.envMapIntensity;
			if ( on ) {

				cam.getWorldDirection( _d );
				mat.envMapIntensity = this._base * glareLeft( Math.asin( Math.min( 1, Math.max( - 1, - _d.y ) ) ) );

			} else mat.envMapIntensity = this._base;

		}

		const by = 1 - smooth( 0.25, 0.6, G.night.value );
		if ( ! on || by <= 0 ) {

			if ( this.shapes ) this.shapes.visible = false;
			return;

		}

		this._fish( cam, by );

	}

	_build() {

		const geo = fishShape();
		const mat = new ShaderMaterial( {
			transparent: true, depthWrite: false, depthTest: false, side: DoubleSide,
			vertexShader: /* glsl */`
attribute float aFade;
varying float vFade;
void main() {
	vFade = aFade;
	gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`,
			fragmentShader: /* glsl */`
varying float vFade;
void main() {
	gl_FragColor = vec4( 0.015, 0.05, 0.075, 0.62 * vFade );
}`,
		} );
		mat.name = 'polarizedFish';
		const m = new InstancedMesh( geo, mat, MAX );
		m.name = 'FishUnderWater';
		m.frustumCulled = false;
		m.renderOrder = 5;
		this.fade = new InstancedBufferAttribute( new Float32Array( MAX ), 1 );
		geo.setAttribute( 'aFade', this.fade );
		this.app.scene.add( m );
		this.shapes = m;

	}

	// schools at each spot within sight: { x, z, r, n, len, seed }
	_spots( c, out ) {

		const f = this.app.finds, far = SEE.far[ 1 ] + 60;
		if ( ! f ) return out;
		const near = ( x, z ) => Math.hypot( x - c.x, z - c.z ) < far;
		for ( const q of f.debris ) if ( q.life > 0.2 && near( q.x, q.z ) ) out.push( { x: q.x, z: q.z, r: q.size + 7, n: 6, len: 1.05, seed: q.x * 0.13 } );
		for ( const q of f.bait ) if ( q.life > 0.2 && near( q.x, q.z ) ) out.push( { x: q.x, z: q.z, r: q.r * 0.8 + 6, n: 9, len: 0.8, seed: q.z * 0.17 } );
		for ( const w of f.weed ) {

			const ex = w.x1 - w.x0, ez = w.z1 - w.z0, t = Math.min( 1, Math.max( 0, ( ( c.x - w.x0 ) * ex + ( c.z - w.z0 ) * ez ) / Math.max( ex * ex + ez * ez, 1e-6 ) ) );
			const x = w.x0 + ex * t, z = w.z0 + ez * t;
			if ( w.life > 0.2 && near( x, z ) ) out.push( { x, z, r: w.width + 10, n: 7, len: 1.15, seed: Math.round( t * 12 ) + w.x0 * 0.1 } );

		}

		return out;

	}

	_fish( cam, by ) {

		const c = cam.position, spots = this._spots( c, [] );
		if ( ! spots.length ) {

			if ( this.shapes ) this.shapes.visible = false;
			return;

		}

		if ( ! this.shapes ) this._build();
		const h = c.y - G.seaLevel.value, t = G.time.value, m = this.shapes;
		let n = 0;
		for ( const S of spots ) for ( let i = 0; i < S.n && n < MAX; i ++ ) {

			const a = S.seed + i * 2.4, sp = 0.09 + 0.05 * Math.sin( a * 3.1 ), ang = a + t * sp, r = S.r * ( 0.35 + 0.65 * Math.abs( Math.sin( a * 1.7 ) ) );
			const x = S.x + Math.cos( ang ) * r, z = S.z + Math.sin( ang ) * r;
			const seen = fishSeen( h, Math.hypot( x - c.x, z - c.z ) ) * by;
			if ( seen <= 0.01 ) continue;
			const len = S.len * ( 0.8 + 0.4 * Math.abs( Math.sin( a * 5.3 ) ) );
			// (along the way it's swimming, with a slow beat)
			const yaw = - ang + Math.sin( t * 2.2 + a ) * 0.09;
			_m.compose( _p.set( x - c.x, G.seaLevel.value - 0.3 - c.y, z - c.z ), _q.setFromAxisAngle( _y, yaw ), _s.set( len, 1, len ) );
			m.setMatrixAt( n, _m );
			this.fade.setX( n, seen );
			n ++;

		}

		m.position.copy( c );
		m.count = n;
		m.visible = n > 0;
		m.instanceMatrix.needsUpdate = true;
		this.fade.needsUpdate = true;

	}

}
