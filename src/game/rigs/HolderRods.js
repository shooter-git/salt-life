import { Matrix4, Mesh, Sphere, Vector3 } from '../../engine/index.js';
import { bendAt, createRodMaterial, fitRodMesh } from '../FishingRod.js';

// (M21) The rods standing in a boat's holders with her spread out (stream GEAR, docs/m21/gear.md): her owner's own rods and
// reels (rigs/GearModels.js), on your boat (rigs/Rigs.js) and on everyone else's copy of hers (together/Spread.js). Each rod
// stands as a real one does (docs/m21/sources-rods.md' holders): its butt down the tube to the gimbal's pin at the bottom, a
// conventional reel on top, a spinning reel underneath; a bent butt's lower leg in the tube, the rod above it lying lower;
// bowed toward its line with a fish on it, its spool turning back as line goes out and the line on it going down.
//
// Each is a mesh of its own in the rod's own material (its bend, its spool's turn and its line's colour are its own uniforms:
// the same program as the rod in your hands), drawn by the model's geometry (shared with every other mesh of the same rod and
// reel), made the first time it's wanted and kept for the next. A draw each; nothing's written each frame but its matrix and a
// few figures (before M21: one mesh of tapered tubes, its vertices written each frame).
//   const H = new HolderRods( scene );  H.begin();  H.rod( gear, mouth, axis, to, bend, fill, out, dt, tip );  H.end()
const DEPTH = 0.25; // m down a holder's tube to its pin (Lee's flush mounts: 229 to 279 mm)
const FAR = 150; // m: past this from the eye a rod's a few pixels at most, and isn't drawn (its line still leaves its tip)
const SHAPE = 2; // the blank's bend exponent in a holder (a fish on: the bend well down the blank)
const SPIN = 3.1 * Math.PI * 2; // the most a spool's seen to turn, rad/s (it would strobe)
const _up = new Vector3( 0, 1, 0 ), _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _p = new Vector3(), _v = new Vector3();
const _m = new Matrix4(), _r = new Matrix4(), _inv = new Matrix4(), _b = { lat: 0, drop: 0 };
const same = ( a, b ) => !! a && a.rod === b.rod && a.reel === b.reel && a.line === b.line;

export class HolderRods {

	constructor( scene ) {

		this.scene = scene;
		this.meshes = [];
		this.n = 0;

	}

	begin() {

		this.n = 0;

	}

	// a rod standing in the holder whose mouth is at `mouth` (world: flush with her deck), its tube along `axis` (world, unit, up
	// out of it); gear: { rod, reel, line } (GearModels'); bowed `bend` (FishingRod's: the tip's deflection over its length)
	// toward `to` (world: where its line goes); fill: its spool's line left, 0.5 to 1 (FishingRod's lineFill); out: m of line
	// off it; dt: s since the last frame; eye: the camera's place (world), if it's to be drawn only near it -> `tip` (world: where
	// its line leaves it)
	rod( gear, mouth, axis, to, bend, fill, out, dt, tip, eye = null ) {

		const i = this.n ++;
		let m = this.meshes[ i ];
		if ( ! m ) {

			m = new Mesh( undefined, createRodMaterial() );
			m.name = 'HolderRod';
			m.matrixAutoUpdate = false;
			m.castShadow = false;
			m.userData.spin = 0;
			this.scene.add( m );
			this.meshes.push( m );

		}

		if ( ! same( m.userData.gear, gear ) ) {

			const model = m.userData.model = fitRodMesh( m, gear );
			m.userData.gear = { rod: gear.rod, reel: gear.reel, line: gear.line };
			m.userData.out = out;
			// (culled by its own bounds: the model's, grown by as far as its tip bows)
			const s = model.geometry.boundingSphere;
			m.boundingSphere = new Sphere( s.center.clone(), s.radius + 0.25 * model.fit.L );

		}

		const fit = m.userData.model.fit, U = m.material.uniforms;
		m.visible = ! eye || mouth.distanceTo( eye ) < FAR;
		// its frame: +Y up the tube, the reel's side (-Z) up for one that rides on top, under for one that hangs; a bent butt
		// turned about its x by its bend, so its lower leg is what's in the tube
		_y.copy( axis );
		_z.copy( _up ).addScaledVector( _y, - _y.y );
		if ( _z.lengthSq() < 1e-6 ) _z.set( 0, 0, 1 );
		_z.normalize();
		if ( fit.top ) _z.negate();
		_x.crossVectors( _y, _z ).normalize();
		_m.makeBasis( _x, _y, _z );
		if ( fit.tilt ) _m.multiply( _r.makeRotationX( fit.tilt ) );
		// its butt at the tube's bottom
		_v.copy( fit.butt ).applyMatrix4( _m );
		_p.copy( mouth ).addScaledVector( axis, - DEPTH ).sub( _v );
		m.matrix.copy( _m ).setPosition( _p );
		m.matrixWorldNeedsUpdate = true;
		// bowed toward its line, across the rod
		_v.copy( to ).applyMatrix4( _inv.copy( m.matrix ).invert() ).setY( 0 );
		if ( _v.lengthSq() > 1e-8 ) _v.normalize();
		U.rodBend.value.set( _v.x, 0, _v.z, bend );
		U.rodShape.value.x = SHAPE;
		// its spool turning back as line goes out (and on as it comes in), the line on it going down
		const d = out - ( m.userData.out ?? out ), sign = fit.kind === 'drum' ? 1 : - 1;
		m.userData.out = out;
		m.userData.spin += Math.max( - SPIN * dt, Math.min( SPIN * dt, d / fit.lineR ) ) * sign;
		U.reelAnim.value.set( 0, 0, 0, m.userData.spin );
		U.reelAnim2.value.set( 0, fill, 0, 0 );
		// its tip, as the shader bends it
		bendAt( fit.L, bend, SHAPE, _b, fit );
		return tip.set( _v.x * _b.lat, fit.L - _b.drop, _v.z * _b.lat ).applyMatrix4( m.matrix );

	}

	end() {

		for ( let i = this.n; i < this.meshes.length; i ++ ) this.meshes[ i ].visible = false;

	}

	hide() {

		this.n = 0;
		this.end();

	}

}
