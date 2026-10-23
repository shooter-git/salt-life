import { Mesh, Matrix4, Vector3, Vector4, Quaternion, MathUtils } from '../engine/index.js';
import { prepare, mergePrepared, cylinder, torus, mat4, roundedBox, box, tube, lathe } from '../world/boat/GeoKit.js';
import { createPropMaterial, createLineMaterial, PAT } from './GameMaterials.js';
import { buildLineGeometry } from './FishingRod.js';

// (Salt Life) The speargun in the diver's hands, its shaft and its shooting line.
//
// A band gun at real scale, in three builds (Gear.js gunStyle): an anodised aluminium tube with a
// polymer handle and muzzle, a teak stock with an open muzzle, and a railgun with a reel under it.
// Each has a pistol grip with the trigger mechanism over it, a rubber butt, line hooks and the
// shooting line wrapped along the barrel's underside; latex bands (one or two) anchored at the muzzle,
// joined by a wire wishbone; a spring-steel shaft with a notch tab for each band, a slide ring for the
// line at its tail, and a Tahitian tip with a flopper that opens once it's through a fish.
//
// Gun frame: +Y along the barrel (the grip at 0, the muzzle at the barrel's length, the butt behind
// the grip), +Z up (the shaft rides on top), +X to the right. Shaft frame: +Y from its tail (0) to
// its tip. Held in first person by the grip, as the rod is (FishingRod): a pose in camera space
// (hand, aim and roll), eased between the states'. The bands are tubes the vertex shader lays between
// the muzzle and their wishbone (stretched thin on the shaft's notch, slack below the muzzle, or on
// the way between as you load them); the flopper opens about its hinge; the line wraps hide when the
// line is out (it is then a line from the muzzle to the shaft, as the rod's is to its bobber).
//
// States: 'stowed' -> 'loaded' -> ( fire ) 'flying' -> 'stuck' (in a fish; then 'fighting' a big one)
// or 'spent' (missed: at the end of its line, in the sand or the coral, against a pile) ->
// 'pulling' (the line hauled in hand over hand, with the fish if there is one) -> 'landing' (the fish
// in front of you, while the catch card is up) -> 'empty' (the shaft back in the gun, the bands off)
// -> ( hold ) 'loading', band by band -> 'loaded'.

const SHAFT_R = 0.0035; // 7 mm spring steel
const BAND_R = 0.0082; // 16 mm latex tubing (16.5 mm across)
const STRETCH = 3.2; // a loaded band's length over its rest length
const SHAFT_TAIL = 0.0; // the shaft's tail, held in the trigger mechanism over the grip (gun y)
const LOAD_S = 0.7; // s to draw a band back to its notch
const PULL_V = [ 1.8, 1.0 ]; // m/s hauling the line in: the shaft alone, with a fish on it
const SINK = 0.5; // m/s² the steel shaft sinks while it flies (water bears most of its weight)
const LINE_SEGS = 40;
const LOADED_STATES = new Set( [ 'loaded', 'empty', 'loading' ] );

// poses in camera space: the grip ( hand ), the barrel turned by yaw (to the left) and pitch (up), rolled
// about itself
export const POSES = {
	stowed: { hand: [ 0.3, - 0.6, - 0.2 ], yaw: 0.4, pitch: - 1.0, roll: 0.3 },
	aim: { hand: [ 0.19, - 0.14, - 0.3 ], yaw: 0.05, pitch: 0.03, roll: 0.05 },
	empty: { hand: [ 0.2, - 0.19, - 0.28 ], yaw: 0.16, pitch: - 0.12, roll: 0.2 },
	load: { hand: [ 0.1, - 0.27, - 0.22 ], yaw: 0.26, pitch: - 0.42, roll: 0.45 },
	out: { hand: [ 0.22, - 0.21, - 0.3 ], yaw: 0.14, pitch: - 0.16, roll: 0.25 },
};

const _m = new Matrix4(), _v = new Vector3(), _w = new Vector3(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _q = new Quaternion(), _up = new Vector3( 0, 1, 0 );
const _r = new Vector3(), _t = new Vector3(), _sl = new Matrix4();

// where everything sits on a gun of these stats (gun frame)
export function gunLayout( g ) {

	const L = g.gunCm / 100, style = g.gunStyle || 'tube';
	const teak = style === 'teak', rail = style === 'rail';
	const half = teak ? 0.017 : rail ? 0.016 : 0.0145; // the barrel's half width
	const top = teak ? 0.023 : half, bottom = teak ? - 0.023 : - half;
	const shaftZ = top + ( rail ? 0.0075 : 0 ) + SHAFT_R; // on the barrel (on the rail)
	const notches = g.bands > 1 ? [ 0.12, 0.2 ] : [ 0.15 ]; // band notches, from the shaft's tail
	const anchor = { x: teak ? half + 0.002 : 0.021, y: L - 0.022, z: ( top + bottom ) / 2 + 0.003 };
	const rest = notches.map( ( n, k ) => ( anchor.y - k * 0.028 - ( SHAFT_TAIL + n ) ) / STRETCH );
	return { L, style, teak, rail, half, top, bottom, shaftZ, notches, anchor, rest, butt: teak ? - 0.19 : - 0.16 };

}

// the bands: tubes laid by the vertex shader (aux.w: 1, 2 band 1's left and right strands, 3, 4 band
// 2's, 5, 6 their wishbones); P.y runs 0 .. 1 along each, ( P.x, P.z ) round it
function createBandMaterial( ground ) {

	const f = ( x ) => x.toFixed( 4 );
	return createPropMaterial( 'spearBands', {
		underwater: ground,
		viewModel: true,
		uniforms: {
			bandAnchor: { value: new Vector4() }, // the muzzle anchors: x (each side), y, z; w: band 2's, back from band 1's
			bandEnd0: { value: new Vector4() }, // band 1's wishbone (gun frame), its rest length
			bandEnd1: { value: new Vector4() },
		},
		vertex: /* glsl */`
	float part = aux.w;
	float tB = P.y;
	vec2 ring = P.xz;
	bool second = ( part > 2.5 && part < 4.5 ) || part > 5.5;
	vec4 E = second ? bandEnd1 : bandEnd0;
	vec3 A; vec3 B; vec3 C; float r;
	if ( part < 4.5 ) {
		float side = mod( part, 2.0 ) > 0.5 ? - 1.0 : 1.0;
		A = vec3( side * bandAnchor.x, bandAnchor.y - ( second ? bandAnchor.w : 0.0 ), bandAnchor.z );
		B = E.xyz + vec3( side * 0.011, 0.0, 0.0 );
		float len = length( B - A );
		float rest = E.w;
		// latex thins as it stretches (its volume stays); a slack band sags
		r = ${ f( BAND_R ) } * sqrt( clamp( rest / max( len, rest ), 0.2, 1.0 ) );
		C = mix( A, B, 0.5 ) + vec3( side * 0.003, 0.0, - 0.55 * max( rest * 1.08 - len, 0.0 ) );
	} else {
		// the wishbone: a wire bowed over the shaft between the strands' ends
		A = E.xyz + vec3( - 0.011, 0.0, 0.0 );
		B = E.xyz + vec3( 0.011, 0.0, 0.0 );
		C = E.xyz + vec3( 0.0, 0.0, 0.016 );
		r = 0.0014;
	}
	vec3 cB = ( 1.0 - tB ) * ( 1.0 - tB ) * A + 2.0 * ( 1.0 - tB ) * tB * C + tB * tB * B;
	vec3 T = normalize( 2.0 * ( 1.0 - tB ) * ( C - A ) + 2.0 * tB * ( B - C ) + vec3( 0.0, 1e-5, 0.0 ) );
	vec3 Nr = normalize( cross( T, abs( T.z ) < 0.9 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
	vec3 Br = cross( T, Nr );
	vec3 nB = Nr * ring.x + Br * ring.y;
	P = cB + nB * r;
	Nn = nB;`,
	} );

}

// the gun's material: the line wraps (aux.w 1) fold away when the line is out
function createGunMaterial( ground ) {

	return createPropMaterial( 'speargun', {
		clearcoat: true,
		underwater: ground,
		viewModel: true,
		uniforms: { gunWraps: { value: 1 } },
		vertex: /* glsl */`
	if ( aux.w > 0.5 && aux.w < 1.5 ) P *= gunWraps;`,
	} );

}

// the shaft's: the flopper (aux.w 2) opens about its hinge (on the shaft's top, ahead of it)
function createShaftMaterial( ground, hingeY ) {

	return createPropMaterial( 'spearShaft', {
		underwater: ground,
		viewModel: true,
		uniforms: { shaftFlopper: { value: 0 } },
		vertex: /* glsl */`
	if ( aux.w > 1.5 && aux.w < 2.5 ) {
		float a = shaftFlopper * 0.6;
		vec3 c = vec3( 0.0, ${ hingeY.toFixed( 4 ) }, ${ ( SHAFT_R + 0.001 ).toFixed( 4 ) } );
		float ca = cos( a ); float sa = sin( a );
		vec3 q = P - c;
		P = c + vec3( q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca );
		Nn = vec3( Nn.x, Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca );
	}`,
	} );

}

export class Speargun {

	// ground: the Terrain (the water's colour under the sea: materials/Underwater.js)
	constructor( { scene, camera, ground = null, audio = null } ) {

		this.camera = camera;
		this.audio = audio;
		this.ground = ground;
		this.state = 'stowed';
		this.equipped = false;
		this.t = 0;
		this.gear = null;
		this.lay = null;
		this.pose = { hand: new Vector3( ...POSES.stowed.hand ), yaw: POSES.stowed.yaw, pitch: POSES.stowed.pitch, roll: POSES.stowed.roll };
		this.kick = 0; // recoil, 1 at the shot
		this.load = [ 1, 1 ]; // each band: 0 slack .. 1 on its notch
		this.loading = 0; // the band being drawn back
		this.safety = false; // set by the game: what's under the sights mustn't be shot
		this.tip = new Vector3();
		this.prevTip = new Vector3();
		this.dir = new Vector3( 0, 0, - 1 );
		this.vel = new Vector3();
		this.muzzle = new Vector3(); // the line's hook under the muzzle (world)
		this.stuck = false; // in the sand or the coral
		this.fish = null; // { i, L, u, body, half, head } while a fish is on the shaft
		this.thrash = 0;
		this.seat = 0; // the shaft sliding back into the gun, 0 .. 1
		this.fightDist = 0;
		this.fightDir = new Vector3( 0, 0, 1 );
		this.surge = 0;
		this.arrived = false; // hauled in with a fish on: it's in front of you

		this.gunMat = createGunMaterial( ground );
		this.bandMat = createBandMaterial( ground );
		this.lineMat = createLineMaterial( LINE_SEGS );
		this.lineMat.color.set( 0xc8d0d4 );
		this.gunMesh = new Mesh( undefined, this.gunMat );
		this.bandMesh = new Mesh( buildBandGeometry(), this.bandMat );
		this.shaftMesh = new Mesh( undefined, null );
		this.lineMesh = new Mesh( buildLineGeometry( LINE_SEGS ), this.lineMat );
		this.gunMesh.name = 'Speargun';
		this.bandMesh.name = 'SpeargunBands';
		this.shaftMesh.name = 'SpearShaft';
		this.lineMesh.name = 'SpearLine';
		for ( const m of [ this.gunMesh, this.bandMesh, this.shaftMesh, this.lineMesh ] ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.matrixAutoUpdate = false;
			m.visible = false;

		}

		this.lineMesh.matrixAutoUpdate = true;
		scene.add( this.gunMesh, this.bandMesh, this.shaftMesh, this.lineMesh );

	}

	// the gun of these stats (Gear.js): built again when it changes
	setGear( g ) {

		const key = `${ g.gunStyle }:${ g.gunCm }:${ g.bands }:${ g.shaftM }`;
		this.gear = g;
		if ( key === this._key ) return;
		this._key = key;
		const lay = this.lay = gunLayout( g );
		if ( this.gunMesh.geometry ) this.gunMesh.geometry.dispose();
		if ( this.shaftMesh.geometry ) this.shaftMesh.geometry.dispose();
		if ( this.shaftMesh.material ) this.shaftMesh.material.dispose();
		this.gunMesh.geometry = buildGunGeometry( lay, g );
		const hinge = g.shaftM - 0.075;
		this.shaftMesh.geometry = buildShaftGeometry( g.shaftM, lay.notches, hinge );
		this.shaftMesh.material = createShaftMaterial( this.ground, hinge );
		this.load = [ 1, g.bands > 1 ? 1 : 0 ];
		if ( ! LOADED_STATES.has( this.state ) && this.state !== 'stowed' ) return;
		this.setState( this.state === 'stowed' ? 'stowed' : 'loaded' );

	}

	// (Together.js) another diver's gun, shaft and line: the same geometry, materials of their own
	tackle() {

		const gun = new Mesh( this.gunMesh.geometry, createGunMaterial( this.ground ) );
		const bands = new Mesh( this.bandMesh.geometry, createBandMaterial( this.ground ) );
		const shaft = new Mesh( this.shaftMesh.geometry, createShaftMaterial( this.ground, this.gear.shaftM - 0.075 ) );
		const line = new Mesh( this.lineMesh.geometry, createLineMaterial( LINE_SEGS ) );
		for ( const m of [ gun, bands, shaft, line ] ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.visible = false;
			m.matrixAutoUpdate = false;
			// (in their hands: in the world)
			if ( m.material.uniforms.gpViewModel ) m.material.uniforms.gpViewModel.value = 0;

		}

		line.matrixAutoUpdate = true;
		line.material.uniforms.lineShow.value = 1;
		return { gun, bands, shaft, line, lay: this.lay };

	}

	equip( on ) {

		this.equipped = on;
		if ( on && this.state === 'stowed' ) this.setState( this.load[ 0 ] >= 1 ? 'loaded' : 'empty' );
		if ( on && this.audio && this.audio.rodReady ) this.audio.rodReady();
		if ( ! on ) {

			// the line comes in and the shaft goes back in the gun
			this.fish = null;
			this.stuck = false;
			if ( ! LOADED_STATES.has( this.state ) ) this.load = [ 0, 0 ];
			this.setState( 'stowed' );

		}

	}

	setState( s ) {

		this.state = s;
		this.t = 0;

	}

	get shaftOut() {

		return ! LOADED_STATES.has( this.state ) && this.state !== 'stowed';

	}

	get bands() {

		return this.gear ? this.gear.bands : 1;

	}

	// ---- actions (from the game)

	// fire at a point (world): the one under the sights. false if it can't
	fire( aim ) {

		if ( this.state !== 'loaded' || this.safety ) return false;
		const L = this.gear.shaftM;
		// from the shaft as it lies in the gun, toward the point under the sights (you aim down the
		// shaft: the sights are its line); along the gun if the point is behind its tip. The first
		// stretch it's tested over starts back along it: a fish right at the muzzle is hit too
		this.shaftInGun( _m );
		this.tip.set( 0, L, 0 ).applyMatrix4( _m );
		_y.set( 0, 1, 0 ).transformDirection( _m );
		this.dir.subVectors( aim, this.tip );
		if ( this.dir.dot( _y ) < 0.05 ) this.dir.copy( _y );
		this.dir.normalize();
		this.prevTip.copy( this.tip ).addScaledVector( this.dir, - 0.6 );
		this.vel.copy( this.dir ).multiplyScalar( this.gear.spearV );
		this.load = [ 0, 0 ];
		this.stuck = false;
		this.fish = null;
		this.kick = 1;
		this.setState( 'flying' );
		if ( this.audio && this.audio.spearShot ) this.audio.spearShot( this.bands );
		return true;

	}

	// it's through a fish: { i, L, u (where along its body), body (its body's share of its length),
	// half (its half width, m), head (its heading), kill (a shot through the head) }
	strike( fish ) {

		this.fish = { ...fish, head: fish.head.clone() };
		this.arrived = false;
		this.surge = 0;
		this.vel.multiplyScalar( 0.2 );
		this.thrash = fish.kill ? 0.6 : 1;
		this.setState( 'stuck' );

	}

	// the fish tore off the shaft
	tearFree() {

		this.fish = null;
		this.setState( 'spent' );

	}

	// haul the line in
	pull() {

		if ( this.state === 'spent' || this.state === 'stuck' || this.state === 'fighting' ) {

			this.stuck = false;
			this.setState( 'pulling' );

		}

	}

	// a big fish running on the line: how far off it is (m), its surges (CatchMinigame)
	fight( distance, surge ) {

		if ( this.state === 'stuck' || this.state === 'pulling' ) this.setState( 'fighting' );
		this.fightDist = distance;
		this.surge = surge;

	}

	// the catch card is up: the fish in front of you
	land() {

		this.setState( 'landing' );

	}

	// the fish off the shaft and into the cooler; the shaft back in the gun
	endLanding() {

		this.fish = null;
		this.seat = 0;
		this.setState( 'empty' );

	}

	// hold to draw the bands back, band by band (let go: the one being drawn slips back)
	loadBands( holding, dt ) {

		if ( this.state === 'empty' && holding ) {

			this.loading = this.load[ 0 ] >= 1 ? 1 : 0;
			this.setState( 'loading' );
			if ( this.audio && this.audio.bandStretch ) this.audio.bandStretch();

		}

		if ( this.state !== 'loading' ) return;
		if ( ! holding ) {

			this.load[ this.loading ] = 0;
			this.setState( 'empty' );
			return;

		}

		const k = this.loading;
		this.load[ k ] = Math.min( 1, this.load[ k ] + dt / LOAD_S );
		if ( this.load[ k ] < 1 ) return;
		if ( k + 1 < this.bands ) {

			this.loading = k + 1;
			if ( this.audio && this.audio.bandStretch ) this.audio.bandStretch();
			return;

		}

		this.setState( 'loaded' );

	}

	// the shaft's frame as it lies in the gun (world), into out
	shaftInGun( out ) {

		return out.multiplyMatrices( this.gunMesh.matrix, _sl.makeTranslation( 0, SHAFT_TAIL, this.lay.shaftZ ) );

	}

	// the speared fish's pose for Fish.hold: { pos, head, roll }; null without one
	fishPose( out ) {

		const f = this.fish;
		if ( ! f ) return null;
		const d = this.dir;
		// it sits just behind the flopper (gripped there once the flopper opened)
		const along = this.gear.shaftM - 0.12 - f.half;
		_a.copy( this.tip ).addScaledVector( d, - ( this.gear.shaftM - along ) );
		// its heading: the one it had, square to the shaft, twisting about it as it fights
		const h = out.head.copy( f.head ).addScaledVector( d, - f.head.dot( d ) );
		if ( h.lengthSq() < 1e-6 ) h.copy( _up ).addScaledVector( d, - d.y );
		h.normalize();
		h.applyAxisAngle( d, Math.sin( this.t * 9 + f.i ) * 0.45 * this.thrash );
		// its centre: the shaft through its body where it was hit
		out.pos.copy( _a ).addScaledVector( h, - ( 0.5 - f.u * f.body ) * f.L );
		// rolled about its heading so that its side lies square to the shaft
		_r.set( h.z, 0, - h.x );
		if ( _r.lengthSq() < 1e-6 ) _r.set( 1, 0, 0 );
		_r.normalize();
		out.roll = Math.atan2( _t.crossVectors( _r, d ).dot( h ), _r.dot( d ) );
		out.thrash = this.thrash;
		return out;

	}

	// ---- per frame. env: { visible, groundAt( x, z ) (the seabed, the reef, the pier's decks: m),
	// colliders (the piles), waterY (the surface over the diver), pierce( a, b ) (the shaft moved from
	// a to b: true if it went into a fish, the game having struck it) }
	update( dt, { visible = true, groundAt = null, colliders = null, waterY = 0, pierce = null } = {} ) {

		// (held back from the load's first frames, as the rod is: App.prepareLate)
		if ( this.holdBack ) visible = false;
		if ( ! this.gear ) return;
		this.t += dt;
		const cam = this.camera, lay = this.lay;

		// ---- the gun's pose: eased toward the state's; the recoil; a live hand
		const name = this.state === 'stowed' ? 'stowed' : this.state === 'loaded' ? 'aim' : this.state === 'loading' ? 'load' : this.state === 'empty' ? 'empty' : 'out';
		const target = POSES[ name ];
		const k = 1 - Math.exp( - ( name === 'stowed' ? 6 : 5 ) * dt );
		const p = this.pose;
		p.hand.x += ( target.hand[ 0 ] - p.hand.x ) * k;
		p.hand.y += ( target.hand[ 1 ] - p.hand.y ) * k;
		p.hand.z += ( target.hand[ 2 ] - p.hand.z ) * k;
		p.yaw += ( target.yaw - p.yaw ) * k;
		p.pitch += ( target.pitch - p.pitch ) * k;
		p.roll += ( target.roll - p.roll ) * k;
		this.kick = Math.max( 0, this.kick - dt * 6 );
		const kick = this.kick * this.kick;
		const sway = this.state === 'loaded' ? 0.6 : 1;
		const yaw = p.yaw + Math.sin( this.t * 0.8 + 1.1 ) * 0.008 * sway;
		const pitch = p.pitch + kick * 0.16 + Math.sin( this.t * 1.1 ) * 0.01 * sway + ( this.state === 'loading' ? Math.sin( this.t * 9 ) * 0.01 : 0 );
		// gun basis in camera space: +Y along the barrel, +Z up off its top
		_y.set( 0, 0, - 1 ).applyAxisAngle( _x.set( 1, 0, 0 ), pitch ).applyAxisAngle( _up, yaw ).normalize();
		_z.set( 0, 1, 0 ).addScaledVector( _y, - _y.y ).normalize().applyAxisAngle( _y, - p.roll );
		_x.crossVectors( _y, _z ).normalize();
		_v.copy( p.hand ).addScaledVector( _y, - kick * 0.05 );
		_m.makeBasis( _x, _y, _z ).setPosition( _v );
		cam.updateMatrixWorld();
		this.gunMesh.matrix.multiplyMatrices( cam.matrixWorld, _m );
		this.gunMesh.matrixWorldNeedsUpdate = true;
		this.bandMesh.matrix.copy( this.gunMesh.matrix );
		this.bandMesh.matrixWorldNeedsUpdate = true;
		const shown = visible && ( this.equipped || p.pitch > POSES.stowed.pitch + 0.15 );
		this.gunMesh.visible = this.bandMesh.visible = shown;
		this.muzzle.set( 0, lay.L - 0.03, lay.bottom - 0.004 ).applyMatrix4( this.gunMesh.matrix );

		// ---- the bands: each on its notch, slack under the muzzle, or on its way between
		const U = this.bandMat.uniforms;
		U.bandAnchor.value.set( lay.anchor.x, lay.anchor.y, lay.anchor.z, 0.028 );
		for ( let b = 0; b < 2; b ++ ) {

			const rest = lay.rest[ Math.min( b, lay.rest.length - 1 ) ];
			const on = b < this.bands ? this.load[ b ] : 0;
			bandEnd( lay, b, on, rest, _a );
			// (a gun of one band: the second folded away into the first's anchor)
			if ( b >= this.bands ) _a.set( 0, lay.anchor.y, lay.anchor.z - 0.001 );
			( b ? U.bandEnd1 : U.bandEnd0 ).value.set( _a.x, _a.y, _a.z, b >= this.bands ? 0.001 : rest );

		}

		// ---- the shaft
		const L = this.gear.shaftM;
		if ( LOADED_STATES.has( this.state ) || this.state === 'stowed' ) {

			// in the gun (sliding back in after a haul)
			this.shaftInGun( _m );
			if ( this.seat < 1 ) {

				this.seat = Math.min( 1, this.seat + dt / 0.35 );
				_b.set( 0, 0, 0 ).applyMatrix4( _m );
				_c.set( 0, 1, 0 ).transformDirection( _m );
				_a.copy( this.tip ).addScaledVector( this.dir, - L ).lerp( _b, this.seat );
				this.dir.lerp( _c, this.seat ).normalize();
				this.tip.copy( _a ).addScaledVector( this.dir, L );
				this.shaftWorld( _m );

			} else {

				this.tip.set( 0, L, 0 ).applyMatrix4( _m );
				this.dir.set( 0, 1, 0 ).transformDirection( _m );

			}

			this.shaftMesh.matrix.copy( _m );

		} else {

			this.stepShaft( dt, groundAt, colliders, waterY, pierce );
			this.shaftWorld( this.shaftMesh.matrix );

		}

		this.shaftMesh.matrixWorldNeedsUpdate = true;
		this.shaftMesh.visible = shown || ( visible && this.shaftOut );
		const SU = this.shaftMesh.material.uniforms;
		SU.shaftFlopper.value += ( ( this.fish ? 1 : 0 ) - SU.shaftFlopper.value ) * Math.min( 1, dt * 12 );
		SU.gpViewModel.value = this.shaftOut ? 0 : 1; // (in the gun, held; out, in the world)
		this.gunMat.uniforms.gunWraps.value = this.shaftOut ? 0 : 1;

		// ---- the shooting line: from the muzzle's hook to the shaft's tail
		const lm = this.lineMat.uniforms;
		const lineOn = visible && this.shaftOut;
		this.lineMesh.visible = lineOn;
		if ( lineOn ) {

			_b.copy( this.tip ).addScaledVector( this.dir, - L + 0.03 );
			const out = this.muzzle.distanceTo( _b );
			const taut = this.state === 'flying' || this.state === 'fighting' ? 1 : this.state === 'pulling' ? 0.6 : 0;
			lm.lineA.value.copy( this.muzzle );
			lm.lineB.value.copy( _b );
			lm.lineCtl.value.copy( this.muzzle ).lerp( _b, 0.5 ).y -= out * 0.12 * ( 1 - taut ) + 0.01;
			lm.lineShow.value = 1;

		}

	}

	// the shaft's world frame (tail at the origin, +Y to its tip), into out
	shaftWorld( out ) {

		_y.copy( this.dir );
		_z.copy( _up ).addScaledVector( _y, - _y.y );
		if ( _z.lengthSq() < 1e-6 ) _z.set( 1, 0, 0 );
		_z.normalize();
		_x.crossVectors( _y, _z ).normalize();
		_v.copy( this.tip ).addScaledVector( this.dir, - this.gear.shaftM );
		return out.makeBasis( _x, _y, _z ).setPosition( _v );

	}

	// the shaft out of the gun: flying, in a fish, spent, hauled back in
	stepShaft( dt, groundAt, colliders, waterY, pierce ) {

		const g = this.gear, L = g.shaftM, v = this.vel;
		// (the shot's first frame keeps fire()'s longer first stretch)
		if ( ! ( this.state === 'flying' && this.t <= dt ) ) this.prevTip.copy( this.tip );
		if ( this.fish ) this.thrash = Math.max( this.fish.kill ? 0.06 : 0.35, this.thrash - dt * ( this.fish.kill ? 0.35 : 0.08 ) ) + this.surge * 0.5;
		switch ( this.state ) {

			case 'flying':
			case 'stuck': {

				// water drag (quadratic: its speed halves over 1.3 times its reach), a little sinking; a
				// shaft in a fish soon stops
				const s = v.length();
				const kd = Math.LN2 / ( 1.3 * g.spearM ) * ( this.state === 'stuck' ? 12 : 1 );
				const ns = s / ( 1 + kd * s * dt );
				if ( s > 1e-6 ) v.multiplyScalar( ns / s );
				v.y -= SINK * dt;
				this.tip.addScaledVector( v, dt );
				if ( v.lengthSq() > 0.01 ) this.dir.copy( v ).normalize();
				// into a fish? (the game strikes it: 'stuck')
				if ( this.state === 'flying' && pierce && pierce( this.prevTip, this.tip ) ) break;
				// the end of the line: it fetches up short
				_b.copy( this.tip ).addScaledVector( this.dir, - L );
				const out = _b.distanceTo( this.muzzle );
				if ( out > g.lineM ) {

					_c.subVectors( _b, this.muzzle ).setLength( g.lineM ).add( this.muzzle );
					this.tip.copy( _c ).addScaledVector( this.dir, L );
					v.multiplyScalar( - 0.1 );
					if ( this.state === 'flying' ) this.spend( 'line' );

				}

				if ( this.state === 'flying' && ns < 1.2 ) this.spend( null );
				break;

			}

			case 'spent':

				// dangling on its line, sinking tip first until it rests on the bottom
				if ( ! this.stuck ) {

					this.tip.y -= 0.3 * dt;
					this.dir.lerp( _a.set( this.dir.x, - 0.6, this.dir.z ).normalize(), 1 - Math.exp( - dt * 0.6 ) ).normalize();

				}

				if ( this.t > 0.7 ) this.pull();
				break;

			case 'pulling': {

				// hauled in by the line at its tail: the tail comes toward you, the shaft trailing
				_b.copy( this.tip ).addScaledVector( this.dir, - L );
				const to = _c.subVectors( this.muzzle, _b );
				const d = to.length();
				const reach = this.fish ? 0.9 : 0.12;
				const step = Math.min( Math.max( 0, d - reach ), PULL_V[ this.fish ? 1 : 0 ] * dt );
				if ( d > 1e-6 ) _b.addScaledVector( to, step / d );
				if ( d > 0.05 ) this.dir.lerp( _a.copy( to ).negate().normalize(), 1 - Math.exp( - dt * 3 ) ).normalize();
				this.tip.copy( _b ).addScaledVector( this.dir, L );
				if ( d - reach < 0.05 ) {

					if ( this.fish ) this.arrived = true;
					else {

						this.seat = 0;
						this.setState( 'empty' );

					}

				}

				break;

			}

			case 'fighting': {

				// a big fish running: the shaft out along the line, where the fight says, swinging as it
				// surges
				const wob = Math.sin( this.t * 0.7 ) * 0.6 + this.surge * Math.sin( this.t * 3.1 ) * 0.5;
				_a.set( Math.sin( wob ), - 0.25, Math.cos( wob ) ).normalize();
				_c.set( 0, 0, - 1 ).applyQuaternion( this.camera.quaternion ).setY( 0 ).normalize();
				_q.setFromUnitVectors( _w.set( 0, 0, 1 ), _c.lengthSq() > 0.5 ? _c : _w );
				_a.applyQuaternion( _q );
				this.fightDir.lerp( _a, 1 - Math.exp( - dt * 1.5 ) ).normalize();
				_b.copy( this.muzzle ).addScaledVector( this.fightDir, Math.max( 0.9, this.fightDist ) );
				this.dir.lerp( this.fightDir, 1 - Math.exp( - dt * 4 ) ).normalize();
				this.tip.copy( _b ).addScaledVector( this.dir, L );
				break;

			}

			case 'landing': {

				// in front of you, pointing away, the fish side on
				const cam = this.camera;
				_c.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
				_a.set( 1, 0, 0 ).applyQuaternion( cam.quaternion );
				_b.copy( cam.position ).addScaledVector( _c, 0.55 ).addScaledVector( _a, 0.08 ).y -= 0.12;
				this.dir.lerp( _c, 1 - Math.exp( - dt * 4 ) ).normalize();
				this.tip.lerp( _w.copy( _b ).addScaledVector( this.dir, L ), 1 - Math.exp( - dt * 5 ) );
				break;

			}

		}

		// the bottom, the reef and the piles stop it; it doesn't leave the water
		if ( this.state === 'flying' || this.state === 'spent' || this.state === 'stuck' ) {

			const gnd = groundAt ? groundAt( this.tip.x, this.tip.z ) : - Infinity;
			if ( this.tip.y < gnd ) {

				if ( this.state === 'flying' ) {

					// buried a few cm, where it went in
					const a = this.prevTip.y - groundAt( this.prevTip.x, this.prevTip.z ), b = this.tip.y - gnd;
					this.tip.lerpVectors( this.prevTip, this.tip, a > 0 ? a / ( a - b ) : 0 ).addScaledVector( this.dir, 0.04 );
					this.stuck = true;
					this.spend( 'ground' );

				} else this.tip.y = gnd;

			}

			const hit = this.state === 'flying' && colliders ? colliders.segmentHit( this.prevTip, this.tip ) : Infinity;
			if ( hit < 1 ) {

				this.tip.lerpVectors( this.prevTip, this.tip, hit );
				this.spend( 'pile' );

			}

			if ( this.tip.y > waterY - 0.04 ) {

				this.tip.y = waterY - 0.04;
				if ( this.state === 'flying' ) this.spend( null );

			}

		}

	}

	spend( what ) {

		this.vel.set( 0, 0, 0 );
		this.setState( 'spent' );
		if ( what && what !== 'line' && this.audio && this.audio.spearHit ) this.audio.spearHit( what, this.tip );

	}

}

// a band's wishbone (gun frame) at `on` (0 slack .. 1 on its notch), into out: slack, it hangs under
// the muzzle; drawn back, it comes up over the muzzle and back along the shaft to the notch
function bandEnd( lay, b, on, rest, out ) {

	const ay = lay.anchor.y - b * 0.028;
	const notch = _w.set( 0, SHAFT_TAIL + lay.notches[ Math.min( b, lay.notches.length - 1 ) ], lay.shaftZ + 0.004 );
	const slack = _b.set( 0, ay - rest * 0.3, lay.bottom - rest * 0.8 );
	if ( on <= 0 ) return out.copy( slack );
	if ( on >= 1 ) return out.copy( notch );
	const over = _c.set( 0, ay - 0.015, lay.shaftZ + 0.03 );
	if ( on < 0.25 ) return out.lerpVectors( slack, over, MathUtils.smoothstep( on, 0, 0.25 ) );
	const s = MathUtils.smoothstep( on, 0.25, 1 );
	out.lerpVectors( over, notch, s );
	out.z += Math.sin( s * Math.PI ) * 0.02;
	return out;

}

// ------------------------------------------------------------------ geometry

const ALU = { color: 0x24272a, rough: 0.3, metal: 0.75, pattern: PAT.plain };
const POLY = { color: 0x1b1c1e, rough: 0.55, metal: 0, pattern: PAT.plain };
const RUBBER = { color: 0x121212, rough: 0.8, metal: 0, pattern: PAT.rubber };
const STEEL = { color: 0xc6cacd, rough: 0.22, metal: 0.95, pattern: PAT.machined };
const MONO = { color: 0xe4ebee, rough: 0.3, metal: 0, pattern: PAT.plain };

function buildGunGeometry( lay, g ) {

	const parts = [];
	const { L, half, top, bottom, shaftZ, butt } = lay;
	const len = L - butt, midY = ( L + butt ) / 2;
	// ---- the barrel
	if ( lay.teak ) {

		parts.push( prepare( roundedBox( half * 2, len, top - bottom, 0.007, 2 ), { color: 0x56321a, rough: 0.45, pattern: PAT.teak, matrix: mat4( 0, midY, 0 ) } ) );
		// the shaft's groove along the top, and the muzzle: a resin cap and an open shaft guide
		parts.push( prepare( box( 0.008, len - 0.08, 0.002 ), { color: 0x3a2412, rough: 0.6, matrix: mat4( 0, midY + 0.02, top - 0.0006 ) } ) );
		parts.push( prepare( roundedBox( half * 2 + 0.002, 0.02, top - bottom + 0.002, 0.004, 2 ), { ...POLY, matrix: mat4( 0, L - 0.01, 0 ) } ) );
		parts.push( prepare( torus( 0.008, 0.0022, 8, 18, Math.PI * 1.2 ), { ...STEEL, matrix: mat4( 0, L + 0.002, shaftZ, Math.PI / 2, 0, - 0.6 * Math.PI ) } ) );

	} else {

		parts.push( prepare( cylinder( half, half, len, 20 ), { ...ALU, matrix: mat4( 0, midY, 0 ) } ) );
		if ( lay.rail ) parts.push( prepare( roundedBox( 0.01, len - 0.05, 0.0075, 0.002, 1 ), { ...ALU, color: 0x1c1e20, matrix: mat4( 0, midY + 0.02, top + 0.00375 ) } ) );
		// the muzzle head, with the bands' threaded anchors either side and a shaft guide on top
		parts.push( prepare( lathe( [ [ half, 0 ], [ 0.02, 0.012 ], [ 0.023, 0.032 ], [ 0.02, 0.048 ], [ 0.012, 0.056 ] ], 20 ), { ...POLY, matrix: mat4( 0, L - 0.05, 0 ) } ) );
		for ( const s of [ - 1, 1 ] ) parts.push( prepare( cylinder( 0.0055, 0.0055, 0.008, 10 ), { ...POLY, color: 0x2c2d30, matrix: mat4( s * 0.023, lay.anchor.y, lay.anchor.z, 0, 0, Math.PI / 2 ) } ) );
		parts.push( prepare( torus( 0.0075, 0.002, 8, 18, Math.PI * 1.2 ), { ...POLY, matrix: mat4( 0, L - 0.004, shaftZ, Math.PI / 2, 0, - 0.6 * Math.PI ) } ) );

	}

	// ---- the handle: the trigger mechanism under the barrel, a raked pistol grip, the guard and the
	// trigger; the line release ahead of it
	parts.push( prepare( roundedBox( 0.03, 0.18, 0.03, 0.008, 2 ), { ...POLY, matrix: mat4( 0, 0.015, bottom - 0.012 ) } ) );
	parts.push( prepare( roundedBox( 0.031, 0.125, 0.046, 0.012, 3 ), { ...POLY, matrix: mat4( 0, - 0.035, bottom - 0.075, Math.PI / 2 - 0.32, 0, 0 ) } ) );
	parts.push( prepare( tube( [ new Vector3( 0, 0.09, bottom - 0.026 ), new Vector3( 0, 0.088, bottom - 0.058 ), new Vector3( 0, 0.06, bottom - 0.072 ), new Vector3( 0, 0.02, bottom - 0.07 ) ], 0.0032, 16, 6 ), { ...POLY } ) );
	parts.push( prepare( tube( [ new Vector3( 0, 0.052, bottom - 0.026 ), new Vector3( 0, 0.056, bottom - 0.04 ), new Vector3( 0, 0.048, bottom - 0.052 ) ], 0.0028, 8, 6 ), { ...POLY, color: 0x3a3b3e } ) );
	parts.push( prepare( roundedBox( 0.012, 0.022, 0.01, 0.003, 1 ), { ...STEEL, color: 0x8a8e92, matrix: mat4( 0, 0.12, bottom - 0.007 ) } ) );
	// the butt
	if ( lay.teak ) parts.push( prepare( roundedBox( half * 2 + 0.002, 0.024, top - bottom + 0.002, 0.006, 2 ), { ...RUBBER, matrix: mat4( 0, butt - 0.012, 0 ) } ) );
	else parts.push( prepare( cylinder( half + 0.0025, half + 0.004, 0.035, 18 ), { ...RUBBER, matrix: mat4( 0, butt - 0.0175, 0 ) } ) );
	// the line hooks: under the muzzle and ahead of the handle
	for ( const y of [ L - 0.03, 0.16 ] ) parts.push( prepare( torus( 0.005, 0.0013, 6, 12, Math.PI ), { ...STEEL, color: 0x9a9ea2, matrix: mat4( 0, y, bottom - 0.002, 0, Math.PI / 2, Math.PI ) } ) );
	// the reel, under the barrel ahead of the handle: a drum on a bracket, line wound on it
	if ( g.spearReel ) {

		parts.push( prepare( roundedBox( 0.01, 0.05, 0.03, 0.003, 1 ), { ...ALU, matrix: mat4( 0, 0.24, bottom - 0.015 ) } ) );
		parts.push( prepare( cylinder( 0.036, 0.036, 0.004, 24 ), { ...ALU, color: 0x8e2a1a, matrix: mat4( - 0.016, 0.24, bottom - 0.05, 0, 0, Math.PI / 2 ) } ) );
		parts.push( prepare( cylinder( 0.036, 0.036, 0.004, 24 ), { ...ALU, color: 0x8e2a1a, matrix: mat4( 0.016, 0.24, bottom - 0.05, 0, 0, Math.PI / 2 ) } ) );
		parts.push( prepare( cylinder( 0.029, 0.029, 0.028, 24 ), { color: 0xd8dccf, rough: 0.5, matrix: mat4( 0, 0.24, bottom - 0.05, 0, 0, Math.PI / 2 ) } ) );
		parts.push( prepare( cylinder( 0.004, 0.004, 0.026, 8 ), { ...STEEL, matrix: mat4( 0.026, 0.25, bottom - 0.03, 0, 0, Math.PI / 2 ) } ) );

	}

	// the shooting line (aux.w 1): from the shaft's tail along it to the muzzle, then wrapped twice
	// between the hooks under the barrel
	const wrap = { ...MONO, anim: 1 };
	const lineR = 0.0007;
	parts.push( prepare( tube( [ new Vector3( 0.004, SHAFT_TAIL + 0.03, shaftZ ), new Vector3( 0.006, L * 0.5, shaftZ - 0.002 ), new Vector3( 0.006, L - 0.03, ( shaftZ + bottom ) / 2 ), new Vector3( 0.002, L - 0.03, bottom - 0.006 ) ], lineR, 24, 4 ), wrap ) );
	for ( const s of [ - 1, 1 ] ) parts.push( prepare( tube( [ new Vector3( s * 0.003, L - 0.03, bottom - 0.006 ), new Vector3( s * 0.004, L * 0.5, bottom - 0.008 ), new Vector3( s * 0.003, 0.16, bottom - 0.006 ) ], lineR, 20, 4 ), wrap ) );
	return mergePrepared( parts );

}

// the shaft: tail at 0, tip at L (+Y); notch tabs on top; the flopper (aux.w 2) hinged ahead
function buildShaftGeometry( L, notches, hinge ) {

	const parts = [];
	parts.push( prepare( cylinder( SHAFT_R, SHAFT_R, L - 0.09, 10 ), { ...STEEL, matrix: mat4( 0, 0.012 + ( L - 0.09 ) / 2, 0 ) } ) );
	parts.push( prepare( cylinder( SHAFT_R * 1.15, SHAFT_R * 1.15, 0.012, 10 ), { ...STEEL, matrix: mat4( 0, 0.006, 0 ) } ) );
	parts.push( prepare( torus( 0.0052, 0.0011, 6, 14 ), { ...STEEL, color: 0x9a9ea2, matrix: mat4( 0, 0.03, 0, 0, Math.PI / 2, 0 ) } ) );
	for ( const n of notches ) parts.push( prepare( box( 0.0018, 0.014, 0.0055 ), { ...STEEL, matrix: mat4( 0, SHAFT_TAIL + n, SHAFT_R + 0.002 ) } ) );
	// the Tahitian tip: a faceted cone
	parts.push( prepare( cylinder( 0.0004, SHAFT_R * 1.05, 0.078, 6 ), { ...STEEL, rough: 0.18, matrix: mat4( 0, L - 0.039, 0 ) } ) );
	// the flopper: a thin blade lying back along the shaft from its hinge
	parts.push( prepare( box( 0.0016, 0.058, 0.0024 ), { ...STEEL, anim: 2, matrix: mat4( 0, hinge - 0.029, SHAFT_R + 0.0013 ) } ) );
	return mergePrepared( parts );

}

// the bands' tubes (the vertex shader lays them out): 8 round, 14 along; two strands a band, and a
// wishbone each
function buildBandGeometry() {

	const parts = [];
	for ( let part = 1; part <= 6; part ++ ) {

		const g = cylinder( 1, 1, 1, 8, part > 4 ? 6 : 14, true );
		g.translate( 0, 0.5, 0 );
		parts.push( prepare( g, part > 4 ? { ...STEEL, color: 0x8a8e92, anim: part } : { color: 0x5a2a14, rough: 0.45, pattern: PAT.rubber, anim: part } ) );

	}

	return mergePrepared( parts );

}
