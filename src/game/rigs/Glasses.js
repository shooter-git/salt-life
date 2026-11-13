import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { glareLeft as fresnelLeft, seenOffshore } from '../Sight.js';

// (M16) Polarized glasses. The glare off the water is light polarized flat, and they take it out. How much depends on how
// you look: at the water's Brewster angle (37 degrees below the horizon) a polarizer takes nearly all the reflection, and
// looking along the surface hardly any (M17: Fresnel's, below), so the higher you are, the further you see into the water.
// That's what the tower is for: a deck's eye (3 m up) sees a fish plainly to about 15 m and not past 40; the tower's
// (8.62 m: SportfisherModel's towerEye) plainly to about 40 m, half to 57 and some past 100. (M19) The far fade (SEE.far)
// is only a cap for an eye higher than any the game has: the angle decides at every real one.
//
//   worn  (Gear.js' polarized) above the water, by day
//   the sea's reflection down by that much (WaterSurface's envMapIntensity: no new shader on it)
//   fish shown under what's found out there, holding under the weed and debris (mahi), under the birds (tuna): pale
//   blue-green on the deep water, as a fish near the surface looks from a drone or a tower, not a shadow: it's brighter
//   than the dark water below it, and looks a third bigger than it is through the surface
//   ((M19) where the far fish really are (world/Fish.js' far groups: each where the finds about you put it), as many as
//   are there and as long as they are; the nearest first; none for a group near enough to be drawn as itself. Until the
//   fish have come (with the reef, minutes after the start on a CPU's WebGL), stand-ins about the finds as before, a
//   weedline's at fixed places along it. Reckoned from your own eye (Player.eyeAt), not the camera behind you; less in grey
//   light, rain, a blow's whitecaps and its murk (Sight.seenOffshore). docs/m19/see.md)
//
// The shapes are one instanced mesh with a little program of its own, made when you're first out there with the glasses on,
// so nobody without them pays for it. It's drawn after the sea, just on top of it, so your boat still hides what's behind her.
//
// (M17) The glare by Fresnel's equations for seawater (game/Sight.js: what's left is the reflection's p-polarized part, of
// the whole): nearly all of it along the surface, none at Brewster's angle, where M16 had half and a twelfth. On the
// flats, where the fish are drawn as themselves on a shallow, bright bottom, Sight.js has how plainly each shows through
// them, by the same physics (seenOnFlats: the bottom's light out through the surface against the glare left), its shadow
// on the sand, a cloud's shadow, the wind and the rain: game/FlatsFishing.js and world/Fish.js draw them by it.
const MAX = 36, REFRACT = 1.33;
const SEE = { from: 4 * Math.PI / 180, to: 13 * Math.PI / 180, far: [ 150, 260 ] }; // the angle under which fish show; m
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _d = new Vector3(), _y = new Vector3( 0, 1, 0 ), _eye = new Vector3();
// (M19) a weedline's stand-ins: a school at a fixed place every STATION m along it, the near ones shown (B7: they slid along
// it with you, and jumped every twelfth of its length)
const STATION = 45;

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// how much of the sea's reflection is left through them, looking `below` radians under the horizon (M17: Fresnel's, Sight.js)
export const glareLeft = fresnelLeft;

// (M19) how much of the sea's reflection is left through them over the sea in view, looking `pitch` radians under the
// horizon with a view `fovY` radians tall: the glare's at the angle halfway through the sea's part of the view (the
// horizon down to the view's foot), not at the view's middle. Looking up from the water it's grazing, and they take
// nothing (B2: it read as looking down); with no sea in view, nothing either
export function seaGlareLeft( pitch, fovY ) {

	const top = pitch - fovY / 2, foot = pitch + fovY / 2;
	if ( foot <= 0 ) return 1;
	return glareLeft( ( Math.max( 0, top ) + foot ) / 2 );

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
				mat.envMapIntensity = this._base * seaGlareLeft( Math.asin( Math.min( 1, Math.max( - 1, - _d.y ) ) ), ( cam.fov || 60 ) * Math.PI / 180 );

			} else mat.envMapIntensity = this._base;
			// ((M19) and the plain sea drawn until the whole one's made (WaterSurface.full): B6, it was never cut)
			if ( water.plainMaterial ) water.plainMaterial.envMapIntensity = mat.envMapIntensity;

		}

		const by = 1 - smooth( 0.25, 0.6, G.night.value );
		if ( ! on || by <= 0 ) {

			if ( this.shapes ) this.shapes.visible = false;
			return;

		}

		this._fish( cam, by * seenOffshore( { sun: G.sunDir.value.y, overcast: game.weatherNow ? game.weatherNow.overcast || 0 : 0, wind: G.windSpeed.value, rain: G.rain.value, night: G.night.value, murk: G.murk.value } ) );

	}

	_build() {

		const geo = fishShape();
		const mat = new ShaderMaterial( {
			transparent: true, depthWrite: false, side: DoubleSide,
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
	gl_FragColor = vec4( 0.16, 0.43, 0.4, 0.7 * vFade );
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

	// schools at each spot within sight, the nearest first: { x, z, r, n, len, seed, d }. (M19) The far fish where they are
	// (world/Fish.js' farGroups: placed about you on what they're after, setFinds), but a group near enough to be drawn as
	// itself (active); until the fish have come, stand-ins about the finds
	_spots( c, out ) {

		const far = SEE.far[ 1 ] + 60, fish = this.app.fish, groups = fish && fish.farGroups;
		const near = ( x, z ) => Math.hypot( x - c.x, z - c.z ) < far;
		if ( groups && groups.length ) {

			for ( const g of groups ) {

				if ( g.active || g.farKey === undefined || ! near( g.center.x, g.center.z ) ) continue;
				const L = ( g.sp.length[ 0 ] + g.sp.length[ 1 ] ) / 2;
				out.push( { x: g.center.x, z: g.center.z, r: Math.max( 3, Math.min( 30, g.zone.r ) * 0.6 ), n: Math.min( g.count, 9 ), len: L, seed: g.offset * 0.37 } );

			}

		} else {

			const f = this.app.finds;
			if ( ! f ) return out;
			for ( const q of f.debris ) if ( q.life > 0.2 && near( q.x, q.z ) ) out.push( { x: q.x, z: q.z, r: q.size + 7, n: 6, len: 1.05, seed: q.x * 0.13 } );
			for ( const q of f.bait ) if ( q.life > 0.2 && near( q.x, q.z ) ) out.push( { x: q.x, z: q.z, r: q.r * 0.8 + 6, n: 9, len: 0.8, seed: q.z * 0.17 } );
			for ( const w of f.weed ) {

				if ( w.life <= 0.2 ) continue;
				const ex = w.x1 - w.x0, ez = w.z1 - w.z0, len = Math.hypot( ex, ez ), n = Math.max( 1, Math.floor( len / STATION ) );
				for ( let i = 0; i <= n; i ++ ) {

					const t = i / n, x = w.x0 + ex * t, z = w.z0 + ez * t;
					if ( near( x, z ) ) out.push( { x, z, r: w.width + 6, n: 4, len: 1.15, seed: i * 3.7 + w.x0 * 0.1 } );

				}

			}

		}

		for ( const S of out ) S.d = Math.hypot( S.x - c.x, S.z - c.z );
		out.sort( ( a, b ) => a.d - b.d );
		return out;

	}

	_fish( cam, by ) {

		// ((M19) reckoned from your eye; drawn about the camera, as before)
		const c = this.app.player && this.app.player.eyeAt ? this.app.player.eyeAt( _eye ) : _eye.copy( cam.position ), spots = by > 0.01 ? this._spots( c, [] ) : [];
		if ( ! spots.length ) {

			if ( this.shapes ) this.shapes.visible = false;
			return;

		}

		if ( ! this.shapes ) this._build();
		const h = c.y - G.seaLevel.value, t = G.time.value, m = this.shapes, o = cam.position;
		let n = 0;
		for ( const S of spots ) for ( let i = 0; i < S.n && n < MAX; i ++ ) {

			const a = S.seed + i * 2.4, sp = 0.09 + 0.05 * Math.sin( a * 3.1 ), ang = a + t * sp, r = S.r * ( 0.35 + 0.65 * Math.abs( Math.sin( a * 1.7 ) ) );
			const x = S.x + Math.cos( ang ) * r, z = S.z + Math.sin( ang ) * r;
			const seen = fishSeen( h, Math.hypot( x - c.x, z - c.z ) ) * by;
			if ( seen <= 0.01 ) continue;
			const len = S.len * REFRACT * ( 0.8 + 0.4 * Math.abs( Math.sin( a * 5.3 ) ) );
			// (along the way it's swimming, with a slow beat)
			const yaw = - ang + Math.sin( t * 2.2 + a ) * 0.09;
			_m.compose( _p.set( x - o.x, this.app.waves.heightAt( x, z ) + 0.1 - o.y, z - o.z ), _q.setFromAxisAngle( _y, yaw ), _s.set( len, 1, len ) );
			m.setMatrixAt( n, _m );
			this.fade.setX( n, seen );
			n ++;

		}

		m.position.copy( o );
		m.count = n;
		m.visible = n > 0;
		m.instanceMatrix.needsUpdate = true;
		this.fade.needsUpdate = true;

	}

}
