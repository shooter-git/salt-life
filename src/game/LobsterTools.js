import { Mesh, Matrix4, Vector3, Quaternion } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, torus, tube, sphere, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from './GameMaterials.js';

// (Salt Life) The spiny lobster diver's tools, in first person (Gear.js lobster): in the right hand a
// tickle stick, a slim aluminium rod with a foam grip and its end bent up, to reach into a den past the
// lobster and coax it out; in the left a hand net, a hoop on a short handle with a bag of green mesh.
// Held as the speargun is (Speargun.js POSES: a pose in camera space, eased between the states'). The
// net leaves the hand's pose for the world while it sweeps over a lobster (scoop), and while the catch
// card is up it holds the lobster up in front of you, the bag hanging under the hoop.
//
// Stick frame: +Y along it (the grip at 0), +Z up. Net frame: +Y along the handle (the grip at 0), the
// hoop ahead of it round the Z axis, its mouth facing +Z, the bag off it to -Z.

const STICK_POSES = {
	stowed: { hand: [ 0.3, - 0.6, - 0.2 ], yaw: 0.3, pitch: - 1.0, roll: 0.3 },
	carry: { hand: [ 0.2, - 0.22, - 0.3 ], yaw: 0.12, pitch: - 0.3, roll: 0.15 },
	tickle: { hand: [ 0.15, - 0.17, - 0.33 ], yaw: 0.04, pitch: - 0.12, roll: 0.1 },
};
const NET_POSES = {
	stowed: { hand: [ - 0.3, - 0.6, - 0.2 ], yaw: - 0.3, pitch: - 1.1, roll: - 0.3 },
	carry: { hand: [ - 0.21, - 0.27, - 0.28 ], yaw: - 0.22, pitch: - 0.55, roll: - 0.25 },
};
const HANDLE = 0.3; // the net's handle (m)
const BAG = 0.42; // the bag's depth (m)
const SWEEP_S = 0.45; // s the net takes to sweep over a lobster

const _m = new Matrix4(), _l = new Matrix4(), _r = new Matrix4();
const _v = new Vector3(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _up = new Vector3( 0, 1, 0 );
const _q = new Quaternion(), _p = new Vector3(), _s = new Vector3();

export class LobsterTools {

	// ground: the Terrain (the water's colour under the sea: materials/Underwater.js)
	constructor( { scene, camera, ground = null, audio = null } ) {

		this.camera = camera;
		this.audio = audio;
		this.equipped = false;
		this.level = 0;
		this.t = 0;
		this.stick = { hand: new Vector3( ...STICK_POSES.stowed.hand ), yaw: STICK_POSES.stowed.yaw, pitch: STICK_POSES.stowed.pitch, roll: STICK_POSES.stowed.roll };
		this.netPose = { hand: new Vector3( ...NET_POSES.stowed.hand ), yaw: NET_POSES.stowed.yaw, pitch: NET_POSES.stowed.pitch, roll: NET_POSES.stowed.roll };
		// the net: 'held' (in the hand's pose), 'sweep' (over a lobster), 'landing' (held up with one in
		// it); its world frame as eased (position, rotation) and how far into the sweep it is
		this.net = 'held';
		this.netT = 0;
		this.netPos = new Vector3();
		this.netRot = new Quaternion();
		this.netInWorld = 0; // 0 in the hand's pose .. 1 at its world pose
		this.target = new Vector3();
		this.from = new Vector3();
		this.R = 0.17;

		this.stickMat = createPropMaterial( 'tickleStick', { underwater: ground, viewModel: true } );
		this.netMat = createPropMaterial( 'lobsterNet', { underwater: ground, viewModel: true } );
		this.stickMesh = new Mesh( undefined, this.stickMat );
		this.netMesh = new Mesh( undefined, this.netMat );
		this.stickMesh.name = 'TickleStick';
		this.netMesh.name = 'LobsterNet';
		for ( const m of [ this.stickMesh, this.netMesh ] ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.matrixAutoUpdate = false;
			m.visible = false;
			scene.add( m );

		}

	}

	// the tools of these stats (Gear.js lobster, tickleM): built again when they change
	setGear( g ) {

		this.gear = g;
		const key = `${ g.lobster }:${ g.tickleM }`;
		if ( key === this._key || ! g.lobster ) return;
		this._key = key;
		this.level = g.lobster;
		this.R = g.lobster > 1 ? 0.22 : 0.17;
		this.stickMesh.geometry = buildStick( g.tickleM );
		this.netMesh.geometry = buildNet( this.R );

	}

	get owned() {

		return !! ( this.gear && this.gear.lobster );

	}

	equip( on ) {

		this.equipped = on && this.owned;
		if ( this.equipped && this.audio && this.audio.rodReady ) this.audio.rodReady();
		if ( ! this.equipped ) this.net = 'held';

	}

	// sweep the net over the lobster at target (world), from the diver at from: false if it's busy
	scoop( target, from ) {

		if ( this.net !== 'held' ) return false;
		this.target.copy( target );
		this.from.copy( from );
		this.net = 'sweep';
		this.netT = 0;
		return true;

	}

	// the sweep is over it (the game says whether it's in the net: land) or not (back in the hand)
	get swept() {

		return this.net === 'sweep' && this.netT >= SWEEP_S;

	}

	land( caught ) {

		this.net = caught ? 'landing' : 'held';
		this.netT = 0;

	}

	// the catch card dismissed: the net back in the hand
	endLanding() {

		this.net = 'held';

	}

	get busy() {

		return this.net !== 'held';

	}

	// where a lobster in the bag sits (world), into out; its heading (across the bag) into head
	bag( out, head ) {

		const m = this.netMesh.matrix;
		out.set( 0, HANDLE + this.R, - BAG * 0.5 ).applyMatrix4( m );
		if ( head ) head.set( 1, 0, 0.35 ).transformDirection( m );
		return out;

	}

	// ---- per frame. env: { visible, tickling (the stick worked at a den), at (world: the den's mouth
	// it's worked at, or null) }
	update( dt, { visible = true, tickling = false, at = null } = {} ) {

		if ( this.holdBack ) visible = false;
		if ( ! this.gear || ! this.gear.lobster ) {

			this.stickMesh.visible = this.netMesh.visible = false;
			return;

		}

		this.t += dt;
		const cam = this.camera;
		cam.updateMatrixWorld();

		// ---- the stick: carried, or worked into a den (pointed at it, jiggling)
		const sName = ! this.equipped ? 'stowed' : tickling ? 'tickle' : 'carry';
		const S = STICK_POSES[ sName ], p = this.stick;
		const k = 1 - Math.exp( - ( sName === 'stowed' ? 6 : 7 ) * dt );
		let yaw = S.yaw, pitch = S.pitch;
		if ( tickling && at ) {

			// toward the den (camera space), within the wrist's reach
			_v.copy( at ).applyMatrix4( cam.matrixWorldInverse ).sub( p.hand );
			yaw = Math.max( - 0.5, Math.min( 0.5, Math.atan2( - _v.x, - _v.z ) ) );
			pitch = Math.max( - 0.9, Math.min( 0.3, Math.atan2( _v.y, Math.hypot( _v.x, _v.z ) ) ) );

		}

		p.hand.x += ( S.hand[ 0 ] - p.hand.x ) * k;
		p.hand.y += ( S.hand[ 1 ] - p.hand.y ) * k;
		p.hand.z += ( S.hand[ 2 ] + ( tickling ? Math.sin( this.t * 7 ) * 0.025 : 0 ) - p.hand.z ) * k;
		p.yaw += ( yaw - p.yaw ) * k;
		p.pitch += ( pitch - p.pitch ) * k;
		p.roll += ( S.roll - p.roll ) * k;
		const jig = tickling ? 1 : 0;
		this.placeInView( this.stickMesh.matrix, p.hand, p.yaw + Math.sin( this.t * 13 ) * 0.03 * jig + Math.sin( this.t * 0.8 ) * 0.008, p.pitch + Math.sin( this.t * 11 ) * 0.025 * jig + Math.sin( this.t * 1.1 ) * 0.01, p.roll );
		this.stickMesh.matrixWorldNeedsUpdate = true;
		const shown = visible && ( this.equipped || p.pitch > STICK_POSES.stowed.pitch + 0.15 );
		this.stickMesh.visible = shown;

		// ---- the net: in the hand; or swept over a lobster, held up with one in it (in the world)
		const N = NET_POSES[ this.equipped ? 'carry' : 'stowed' ], q = this.netPose;
		q.hand.x += ( N.hand[ 0 ] - q.hand.x ) * k;
		q.hand.y += ( N.hand[ 1 ] - q.hand.y ) * k;
		q.hand.z += ( N.hand[ 2 ] - q.hand.z ) * k;
		q.yaw += ( N.yaw - q.yaw ) * k;
		q.pitch += ( N.pitch - q.pitch ) * k;
		q.roll += ( N.roll - q.roll ) * k;
		this.placeInView( _m, q.hand, q.yaw + Math.sin( this.t * 0.9 + 2 ) * 0.01, q.pitch + Math.sin( this.t * 1.2 + 1 ) * 0.01, q.roll );
		this.netT += dt;
		const world = this.net !== 'held';
		this.netInWorld += ( ( world ? 1 : 0 ) - this.netInWorld ) * ( 1 - Math.exp( - ( world ? 14 : 6 ) * dt ) );
		if ( world ) this.worldNet( this.netPos, this.netRot );
		if ( this.netInWorld > 0.001 ) {

			_m.decompose( _p, _q, _s );
			_p.lerp( this.netPos, this.netInWorld );
			_q.slerp( this.netRot, this.netInWorld );
			_m.compose( _p, _q, _s.set( 1, 1, 1 ) );

		}

		this.netMesh.matrix.copy( _m );
		this.netMesh.matrixWorldNeedsUpdate = true;
		this.netMesh.visible = shown || ( visible && world );
		// (in the hand: pressed up to the near plane; out in the world: at its own depth)
		this.netMat.uniforms.gpViewModel.value = this.netInWorld > 0.5 ? 0 : 1;

	}

	// a pose in camera space (the hand, the tool turned by yaw (to the left) and pitch (up), rolled about
	// itself) as a world matrix, into out
	placeInView( out, hand, yaw, pitch, roll ) {

		_y.set( 0, 0, - 1 ).applyAxisAngle( _x.set( 1, 0, 0 ), pitch ).applyAxisAngle( _up, yaw ).normalize();
		_z.set( 0, 1, 0 ).addScaledVector( _y, - _y.y ).normalize().applyAxisAngle( _y, - roll );
		_x.crossVectors( _y, _z ).normalize();
		_l.makeBasis( _x, _y, _z ).setPosition( hand );
		return out.multiplyMatrices( this.camera.matrixWorld, _l );

	}

	// the net's world pose (position of its grip, rotation) for its state, into pos, rot
	worldNet( pos, rot ) {

		const cam = this.camera;
		if ( this.net === 'sweep' ) {

			// the hoop swept along the bottom over the lobster, its mouth leading, the handle up
			const u = Math.min( 1, this.netT / SWEEP_S );
			const s = u * u * ( 3 - 2 * u );
			_z.subVectors( this.target, this.from ).setY( 0 );
			if ( _z.lengthSq() < 1e-6 ) _z.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion ).setY( 0 );
			_z.normalize();
			_y.copy( _up ).addScaledVector( _z, - 0.35 ).normalize();
			_x.crossVectors( _y, _z ).normalize();
			_z.crossVectors( _x, _y ).normalize();
			_c.copy( this.target ).addScaledVector( _z, - 0.45 + 0.6 * s );
			_c.y += this.R * 0.6;
			pos.copy( _c ).addScaledVector( _y, - ( HANDLE + this.R ) );

		} else {

			// held up in front of you: the mouth up, the bag hanging under the hoop
			_a.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion ).setY( 0 );
			if ( _a.lengthSq() < 1e-6 ) _a.set( 0, 0, - 1 );
			_a.normalize();
			_b.crossVectors( _a, _up ).normalize();
			_y.copy( _a );
			_z.copy( _up );
			_x.crossVectors( _y, _z ).normalize();
			pos.copy( cam.position ).addScaledVector( _a, 0.18 ).addScaledVector( _b, - 0.06 ).addScaledVector( _up, BAG * 0.35 - 0.12 + Math.sin( this.t * 1.3 ) * 0.01 );

		}

		_r.makeBasis( _x, _y, _z );
		rot.setFromRotationMatrix( _r );

	}

	dispose() {

		for ( const m of [ this.stickMesh, this.netMesh ] ) {

			m.removeFromParent();
			if ( m.geometry ) m.geometry.dispose();

		}

		this.stickMat.dispose();
		this.netMat.dispose();

	}

}

// ------------------------------------------------------------------ geometry

const ALU = { color: 0xaab1b6, rough: 0.32, metal: 0.8, pattern: PAT.machined };
const FOAM = { color: 0x1e2b34, rough: 0.8, pattern: PAT.eva };
const CAP = { color: 0xd8a21c, rough: 0.6, pattern: PAT.rubber };
const MESH = { color: 0x2b5a3a, rough: 0.85, pattern: PAT.plain };

// the tickle stick: len from the grip's end to the bent tip
function buildStick( len ) {

	const parts = [];
	const shaft = len - 0.18;
	parts.push( prepare( cylinder( 0.012, 0.012, 0.13, 14 ), { ...FOAM, matrix: mat4( 0, 0.025, 0 ) } ) );
	parts.push( prepare( cylinder( 0.0135, 0.012, 0.012, 14 ), { ...CAP, color: 0x15191c, matrix: mat4( 0, - 0.046, 0 ) } ) );
	parts.push( prepare( cylinder( 0.0045, 0.0045, shaft, 8 ), { ...ALU, matrix: mat4( 0, 0.09 + shaft / 2, 0 ) } ) );
	// the end, bent up to hook round behind a lobster in its den, and a rubber cap
	const t0 = len - 0.09;
	parts.push( prepare( tube( [ new Vector3( 0, t0, 0 ), new Vector3( 0, t0 + 0.045, 0.004 ), new Vector3( 0, t0 + 0.075, 0.02 ), new Vector3( 0, t0 + 0.09, 0.045 ) ], 0.0045, 12, 8 ), ALU ) );
	parts.push( prepare( sphere( 0.0062, 10, 8 ), { ...CAP, matrix: mat4( 0, t0 + 0.09, 0.045 ) } ) );
	return mergePrepared( parts );

}

// the hand net: the handle along +Y, a hoop of radius R round the Z axis ahead of it, and the bag: mesh
// strands from the hoop down to its bottom, and rings round it
function buildNet( R ) {

	const parts = [];
	const cy = HANDLE + R;
	parts.push( prepare( cylinder( 0.014, 0.014, 0.12, 14 ), { ...FOAM, matrix: mat4( 0, 0.04, 0 ) } ) );
	parts.push( prepare( cylinder( 0.008, 0.008, HANDLE - 0.08, 10 ), { ...ALU, matrix: mat4( 0, 0.1 + ( HANDLE - 0.08 ) / 2 - 0.02, 0 ) } ) );
	parts.push( prepare( torus( R, 0.005, 8, 48 ), { ...ALU, matrix: mat4( 0, cy, 0 ) } ) );
	// the bag: a rounded sack (its section r( d ) shrinking with depth d)
	const ring = ( d ) => R * Math.sqrt( Math.max( 0, 1 - ( d / BAG ) ** 2 ) ) * ( 1 - 0.15 * d / BAG );
	const strands = 14;
	for ( let s = 0; s < strands; s ++ ) {

		const a = s / strands * Math.PI * 2;
		const pts = [];
		for ( let k = 0; k <= 6; k ++ ) {

			const d = k / 6 * BAG * 0.999;
			const r = ring( d );
			pts.push( new Vector3( Math.cos( a ) * r, cy + Math.sin( a ) * r, - d ) );

		}

		parts.push( prepare( tube( pts, 0.0011, 18, 3 ), MESH ) );

	}

	for ( const f of [ 0.18, 0.36, 0.54, 0.72, 0.88 ] ) {

		const d = f * BAG;
		parts.push( prepare( torus( ring( d ), 0.001, 3, 40 ), { ...MESH, matrix: mat4( 0, cy, - d ) } ) );

	}

	return mergePrepared( parts );

}
