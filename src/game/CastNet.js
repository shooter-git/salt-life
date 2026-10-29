import {
	Mesh, BufferGeometry, BufferAttribute, Vector3, Matrix4, Quaternion, MeshStandardMaterial, MeshBasicMaterial,
	RingGeometry, DoubleSide, Color,
} from '../engine/index.js';
import { prepare, mergePrepared, lathe, torus, cylinder, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from './GameMaterials.js';
import { UNDERWATER_GLSL, underwaterUniforms } from '../materials/Underwater.js';
import { G } from '../core/Globals.js';
import { windBeyondFair } from './Weather.js';

// (Salt Life) The cast net: thrown from the beach, wading, off the pier or a boat's deck, for bait and
// mullet.
//
// A real cast net is a cone of netting: the horn (a plastic ring with a swivel on top) at its apex, a
// lead line round its foot, and brails (cords from the lead line up through the horn to the swivel,
// where the hand line ties on). Loaded, the horn and a gather of the netting are in the right hand,
// a third of the lead line over the left; the thrower winds up across the body and lets go in a
// sweeping spin, and the leads fly apart into a disc that lands flat. The leads sink it into a bell
// over the fish; drawing the hand line pulls the brails through the horn, closing the lead line under
// it into a purse, and the purse comes up hand over hand with whatever was caught under it.
//
// Here the netting is a radial cloth: particles on rings round the horn (RINGS, the last one the lead
// line) along SPOKES, joined along the spokes and round the rings by rope constraints (they pull, they
// never push: a net folds and bunches), solved by position-based dynamics with substeps. The leads are
// heavy, the netting light (it trails in the air and floats in the water); in the water everything
// slows toward its sinking speed (the leads' is the net's: Gear.js sinkMs). The horn is tied to the hand
// line (a rope as long as the line paid out) and to the brails (one in two leads, as long as they
// haven't been drawn through the horn). The hands pin particles where they hold them; the throw sets
// the particles off with the spin the wind-up gave it (well timed: wide open; badly: a half-open
// banana). Drawn: the netting is a smooth surface through the particles (Catmull-Rom round and along
// the spokes) with a diamond-mesh shader (twine, knots, a veil far off), the lead line a tube with lead
// sinkers along it, the brails and hand line ribbons, and the horn and swivel.
//
// States: 'stowed' -> 'held' -> ( press ) 'windup' -> ( release ) 'throw' (the sweep: the net leaves
// the hands at its end) -> 'flying' -> 'sinking' (in the water, or on the sand or a deck: everything
// after the splash until it's out; pulling draws the brails closed, then hauls the purse in) ->
// 'lifted' (the purse up in front of you, dripping) -> 'dumping' (the brails let go: the catch falls
// out) -> 'gather' (loaded back into the hands) -> 'held'.
//
// The game (Game.js) reads `footprint` (where the lead line is, how far it's open and sunk, whether it's
// pursed: Fish.js traps what's under it) and `bag` (where the purse is: the caught fish ride in it),
// and drains `events` ('throw', 'splash', 'land', 'bottom', 'pursed', 'lifted', 'dump').

const RINGS = 9; // rings of particles from the horn to the lead line (the last ring)
const SPOKES = 28;
const N = 1 + RINGS * SPOKES;
const SUB_A = 3, SUB_R = 2; // the drawn surface: between the particles, round and along
const COLS = SPOKES * SUB_A;
const ROWS = RINGS * SUB_R + 1;
const LEAD_SUB = 4; // the lead line drawn: points per lead
const LEAD_PTS = SPOKES * LEAD_SUB;
const LEAD_RAD = 6;
const LEAD_R = 0.0065; // the lead line's half thickness (a braided line with lead sinkers threaded on)
const HORN_R = 0.032; // the horn's foot, where the netting is laced on
const HORN_TOP = 0.11; // the swivel's eye, where the hand line ties on (horn frame +Y)
const BRAIL_EVERY = 2;
const BRAILS = SPOKES / BRAIL_EVERY;
const LINE_SEG = 18, BRAIL_SEG = 4;
const ITER = 10;
const GRAV = 9.81;
export const WIND_S = 1.1; // s for a full wind-up
export const SWEET = 0.74; // the moment in the wind-up that spins the net fully open (charge 0..1)
const SPIN_S = 0.16; // s the throw's sweep takes (the net leaves the hands at its end)
const PULL_V = [ 0.8, 1.4 ]; // m/s of hand line, hand over hand: drawing the brails, hauling the purse in
const HAUL_END = 0.55; // m of line left when the purse is up at the hands
const LIFT_IN = 0.6; // s the horn takes from where it hung on the last of the hand line up into the hand
const LIFT_S = 1.45; // s from that until the purse is dumped (LIFT_IN of it coming up)
const DUMP_S = 0.9;
const GATHER_S = 1.25;
// wading deep, the loaded net is held up out of the water: the hands rise (up to LIFT_MAX) to keep
// HAND_CLEAR above it (low over the water, the throw's sweep couldn't lift the leads clear of it)
const LIFT_MAX = 0.3, HAND_CLEAR = 0.5;
const CROWN = 0, MESH = 1, LEAD = 2;

// the hands, in camera space (x right, y up, z back)
export const HANDS = {
	held: { r: [ 0.19, - 0.33, - 0.44 ], l: [ - 0.16, - 0.4, - 0.42 ] },
	wound: { r: [ 0.5, - 0.42, - 0.12 ], l: [ 0.2, - 0.5, - 0.3 ] },
	thrown: { r: [ 0.02, - 0.16, - 0.78 ], l: [ - 0.2, - 0.24, - 0.66 ] },
	line: { r: [ 0.12, - 0.36, - 0.5 ], l: [ - 0.1, - 0.42, - 0.44 ] },
	pull: { r: [ 0.1, - 0.28, - 0.52 ], l: [ - 0.05, - 0.4, - 0.42 ] },
	lifted: { r: [ 0.04, - 0.02, - 0.62 ], l: [ - 0.12, - 0.14, - 0.56 ] },
};

// how fully a throw with this much wind-up (0..1) opens, for a net whose moment is win wide (Gear.js
// spreadWin): 1 in the middle of it, a little less at its edges, falling away outside it
export function openQuality( charge, win ) {

	const d = Math.abs( charge - SWEET ) / Math.max( 0.02, win / 2 );
	if ( d <= 1 ) return 1 - 0.1 * d * d;
	return Math.max( 0.12, 0.9 - ( d - 1 ) * 0.5 );

}

// the wind-up's window: [ lo, hi ] of the charge
export function sweetWindow( win ) {

	return [ Math.max( 0, SWEET - win / 2 ), Math.min( 1, SWEET + win / 2 ) ];

}

// particle k (ring, 0: the horn) on spoke j
const pid = ( k, j ) => ( k === 0 ? 0 : 1 + ( k - 1 ) * SPOKES + ( ( j % SPOKES ) + SPOKES ) % SPOKES );

// Catmull-Rom weights at t
function crW( t ) {

	const t2 = t * t, t3 = t2 * t;
	return [ 0.5 * ( - t3 + 2 * t2 - t ), 0.5 * ( 3 * t3 - 5 * t2 + 2 ), 0.5 * ( - 3 * t3 + 4 * t2 + t ), 0.5 * ( t3 - t2 ) ];

}
const W_A = Array.from( { length: SUB_A }, ( _, s ) => crW( s / SUB_A ) );
const W_R = Array.from( { length: SUB_R }, ( _, s ) => crW( s / SUB_R ) );
const W_L = Array.from( { length: LEAD_SUB }, ( _, s ) => crW( s / LEAD_SUB ) );

const TWINE = {
	nylon: { color: 0x9a8762, width: 0.0011, rough: 0.8, opacity: 1 },
	mono: { color: 0xc4cfca, width: 0.0008, rough: 0.42, opacity: 0.82 },
};

const _v = new Vector3(), _w = new Vector3(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _q = new Quaternion(), _m = new Matrix4();
const _up = new Vector3( 0, 1, 0 );
const smooth = ( t ) => ( t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t ) );
const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );

// The net's own materials (twine, lead line, cords): kind 'mesh' (diamond netting, transparent; drawn
// twice, the part under the water before the water and the part above it after: netSide), 'lead'
// (sinkers along a line), 'cord'. Under the sea they take the water's colour (materials/Underwater.js)
function createNetMaterial( kind, ground ) {

	const m = new MeshStandardMaterial( { color: 0xffffff, roughness: 0.7, metalness: 0, side: DoubleSide } );
	m.name = 'castNet:' + kind;
	if ( kind === 'mesh' ) {

		m.transparent = true;
		m.depthWrite = false;

	}

	const uniforms = m.uniforms = {
		netCol: { value: new Color( 0xffffff ) },
		netMesh: { value: 0.01 }, // m between twines
		netTwine: { value: 0.001 }, // m, the twine drawn
		netRough: { value: 0.7 },
		netOpacity: { value: 1 },
		netWater: { value: 0 },
		netSide: { value: 0 }, // 1: only above netWater, - 1: only below, 0: all
	};
	const uw = ground ? underwaterUniforms( ground ) : null;
	m.customProgramCacheKey = () => 'castNet:' + kind + ( uw ? ':uw' : '' );
	const body = {
		mesh: /* glsl */`
	// diamonds: twines along u + v and u - v (netUv: m on the open net), a knot where they cross
	vec2 nd = vec2( vNetUv.x + vNetUv.y, vNetUv.x - vNetUv.y ) / netMesh;
	vec2 nfw = max( fwidth( nd ), vec2( 1e-4 ) );
	float nw = netTwine * 1.41421 / netMesh;
	vec2 ndist = 0.5 - abs( fract( nd ) - 0.5 );
	vec2 nwp = max( vec2( nw * 0.5 ), nfw * 0.5 );
	vec2 nc = ( 1.0 - smoothstep( nwp - nfw * 0.5, nwp + nfw * 0.5, ndist ) ) * ( nw * 0.5 / nwp );
	float cov = 1.0 - ( 1.0 - nc.x ) * ( 1.0 - nc.y );
	float knot = 1.0 - smoothstep( nw * 0.9, nw * 1.4 + max( nfw.x, nfw.y ), length( ndist ) );
	cov = max( cov, knot * min( 1.0, nw * 1.2 / max( nfw.x, nfw.y ) ) );
	// far off the twines blend into a veil as dense as they are on average
	float avg = clamp( 2.0 * nw - nw * nw, 0.0, 1.0 ) * 1.2;
	cov = mix( cov, avg, smoothstep( 0.3, 0.6, max( nfw.x, nfw.y ) ) );
	diffuseColor.a = cov * netOpacity;
	if ( diffuseColor.a < 0.003 ) discard;`,
		lead: /* glsl */`
	// lead sinkers (dull grey, a little metallic) threaded on the braided line, 4.5 cm apart
	float ls = fract( vNetUv.x / 0.045 );
	float lfw = fwidth( vNetUv.x / 0.045 );
	float lead = smoothstep( 0.1 - lfw, 0.1 + lfw, ls ) * ( 1.0 - smoothstep( 0.8 - lfw, 0.8 + lfw, ls ) );
	lead = mix( lead, 0.7, smoothstep( 0.2, 0.5, lfw ) );
	ncol = mix( ncol, vec3( 0.16, 0.165, 0.17 ), lead );
	nrough = mix( nrough, 0.55, lead );
	nmetal = lead * 0.25;`,
		cord: '',
	}[ kind ];
	m.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		if ( uw ) Object.assign( shader.uniforms, uw );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', `#include <common>
attribute vec2 netUv;
varying vec2 vNetUv;
varying vec3 vNetW;` )
			.replace( '#include <worldpos_vertex>', `#include <worldpos_vertex>
	vNetUv = netUv;
	vNetW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>
uniform vec3 netCol;
uniform float netMesh;
uniform float netTwine;
uniform float netRough;
uniform float netOpacity;
uniform float netWater;
uniform float netSide;
varying vec2 vNetUv;
varying vec3 vNetW;
${ uw ? UNDERWATER_GLSL : '' }` )
			.replace( '#include <color_fragment>', `#include <color_fragment>
	if ( netSide * ( vNetW.y - netWater ) < 0.0 ) discard;
	vec3 ncol = netCol;
	float nrough = netRough;
	float nmetal = 0.0;
	{
${ body }
	}
	diffuseColor.rgb = ncol;
${ uw ? '\tdiffuseColor.rgb = uwShade( diffuseColor.rgb, vNetW, vec3( 0.0, 1.0, 0.0 ) );' : '' }` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = nrough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = nmetal;' );

	};
	return m;

}

// the horn: a white plastic cone, the brails come out of its foot, a brass swivel on top (+Y up)
let HORN_GEO = null;
function hornGeometry() {

	if ( HORN_GEO ) return HORN_GEO;
	const white = { color: 0xe6e0d0, rough: 0.38 };
	const brass = { color: 0xb08d45, rough: 0.32, metal: 1, pattern: PAT.machined };
	HORN_GEO = mergePrepared( [
		prepare( lathe( [ [ 0.001, 0.004 ], [ HORN_R, 0.0 ], [ HORN_R - 0.002, 0.012 ], [ 0.017, 0.045 ], [ 0.0095, 0.07 ], [ 0.008, 0.076 ], [ 0.001, 0.077 ] ], 20 ), white ),
		prepare( torus( HORN_R - 0.001, 0.0032, 6, 24 ), { ...white, matrix: mat4( 0, 0.002, 0, Math.PI / 2 ) } ),
		prepare( cylinder( 0.0052, 0.0052, 0.024, 10 ), { ...brass, matrix: mat4( 0, 0.089, 0 ) } ),
		prepare( torus( 0.0055, 0.0016, 6, 12 ), { ...brass, matrix: mat4( 0, HORN_TOP - 0.004, 0 ) } ),
		prepare( torus( 0.005, 0.0015, 6, 12 ), { ...brass, matrix: mat4( 0, 0.077, 0, 0, Math.PI / 2 ) } ),
	] );
	return HORN_GEO;

}

// the netting's surface: ROWS (horn to lead line) by COLS + 1 (round, the seam doubled for the mesh's UV)
function nettingGeometry() {

	const g = new BufferGeometry();
	const n = ROWS * ( COLS + 1 );
	g.setAttribute( 'position', new BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	g.setAttribute( 'netUv', new BufferAttribute( new Float32Array( n * 2 ), 2 ) );
	const idx = [];
	for ( let r = 0; r < ROWS - 1; r ++ ) for ( let c = 0; c < COLS; c ++ ) {

		const a = r * ( COLS + 1 ) + c, b = a + 1, d = a + COLS + 1, e = d + 1;
		idx.push( a, d, b, b, d, e );

	}

	g.setIndex( idx );
	return g;

}

function leadGeometry() {

	const g = new BufferGeometry();
	const n = ( LEAD_PTS + 1 ) * LEAD_RAD;
	g.setAttribute( 'position', new BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	g.setAttribute( 'netUv', new BufferAttribute( new Float32Array( n * 2 ), 2 ) );
	const idx = [];
	for ( let i = 0; i < LEAD_PTS; i ++ ) for ( let s = 0; s < LEAD_RAD; s ++ ) {

		const a = i * LEAD_RAD + s, b = i * LEAD_RAD + ( s + 1 ) % LEAD_RAD, d = a + LEAD_RAD, e = b + LEAD_RAD;
		idx.push( a, b, d, b, e, d );

	}

	g.setIndex( idx );
	return g;

}

// ribbons: the hand line, then the brails (each a strip of segs + 1 pairs)
function cordGeometry() {

	const g = new BufferGeometry();
	const strips = [ LINE_SEG, ...new Array( BRAILS ).fill( BRAIL_SEG ) ];
	const n = strips.reduce( ( s, k ) => s + ( k + 1 ) * 2, 0 );
	g.setAttribute( 'position', new BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	g.setAttribute( 'normal', new BufferAttribute( new Float32Array( n * 3 ), 3 ) );
	g.setAttribute( 'netUv', new BufferAttribute( new Float32Array( n * 2 ), 2 ) );
	const idx = [];
	let base = 0;
	for ( const k of strips ) {

		for ( let i = 0; i < k; i ++ ) {

			const a = base + i * 2;
			idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

		}

		base += ( k + 1 ) * 2;

	}

	g.setIndex( idx );
	return g;

}

export class CastNet {

	// camera: yours (null: someone else's, posed by Together.js through update's `frame`, its cords
	// turned to `viewer`, your camera); query: the water queries (the water's height at the net and at
	// the aim); ground: the Terrain (the water's colour under the sea); spray: droplets as it lands and
	// drips
	constructor( { scene, camera = null, viewer = null, query = null, ground = null, audio = null, spray = null } = {} ) {

		this.scene = scene;
		this.camera = camera;
		this.viewer = viewer;
		this.query = query;
		this.audio = audio;
		this.spray = spray;
		this.slot = query ? query.allocate( 'castNet', 2 ) : - 1;
		this.state = 'stowed';
		this.equipped = false;
		this.t = 0; // s in this state
		this.time = 0;
		this.gear = null;
		this.R = 1.22; // m, horn to lead line
		this.charge = 0; // the wind-up, 0..1
		this.over = 0; // s held at the top of the wind-up
		this.quality = 1; // how well the last throw opened (openQuality)
		this.waterY = 0;
		this.aimWaterY = 0;
		this.handLen = 8; // m of hand line out
		this.draw = 0; // the brails drawn through the horn: 0 free .. 1 the lead line closed under it
		this.pulling = false;
		this.load = 0; // kg of fish in the purse (a heavy one comes in slower)
		this.splashed = false;
		this.bottomed = false;
		this.dumped = false;
		this.events = [];
		this.lastThrow = null; // what the others need to throw it as you did (Together.js)
		this.groundAt = null;
		this.frame = new Matrix4();
		this.pose = { r: new Vector3( ...HANDS.held.r ), l: new Vector3( ...HANDS.held.l ) };
		this.lift = 0; // m the hands are raised, wading deep (world up)
		this._liftFrom = new Vector3(); // where the horn hung when the purse came up (camera space)
		this._dt = 0;
		this.handR = new Vector3();
		this.handL = new Vector3();
		this.lineEnd = new Vector3(); // where the hand line leaves the hands (world)
		this.tether = new Vector3();
		this._lastHand = new Vector3();
		this.hornTop = new Vector3();
		this.hornAxis = new Vector3( 0, 1, 0 );
		this.aim = { x: 0, y: 0, z: 0, d: 0, depth: 0, ok: false, land: false, show: false };
		this.footprint = { x: 0, z: 0, r: 0, lead: 0, top: 0, floor: 0, onFloor: 0, wet: false, purse: 0, open: 0, active: false };
		this.bag = { x: 0, y: 0, z: 0, r: 0.2, out: false };
		this._dripT = 0;
		this._pullT = 0;

		// ((M15) where they are, in doubles: tens of km out a 32-bit float's step, 4 mm at 40 km, was more than
		// the net's twines move a step as it settles)
		this.P = new Float64Array( N * 3 );
		this.V = new Float64Array( N * 3 );
		this.Q = new Float64Array( N * 3 );
		this.W = new Float32Array( N ); // inverse masses
		this.Wf = new Float32Array( N ); // the same, less what the hands pin
		this.K = new Uint8Array( N );
		this.Gy = new Float32Array( N ).fill( - 1e3 );
		this.T = new Float64Array( N * 3 ); // where the hands pin them
		this.pin = new Float32Array( N ); // how firmly (0..1)
		this.wet = new Uint8Array( N );
		this.phase = new Float32Array( N );
		for ( let i = 0; i < N; i ++ ) this.phase[ i ] = Math.random() * Math.PI * 2;
		this.ring = new Float64Array( ( RINGS + 1 ) * COLS * 3 ); // the drawn surface, round each ring
		this.surf = new Float64Array( ROWS * COLS * 3 );
		this.leadPts = new Float64Array( LEAD_PTS * 3 );
		// (M15) and drawn about a point by the horn (to a metre: the meshes put there), as the GPU's floats are
		this.at = new Vector3();

		this.meshMat = createNetMaterial( 'mesh', ground );
		this.meshMatUp = createNetMaterial( 'mesh', ground );
		this.meshMat.uniforms.netSide.value = - 1;
		this.meshMatUp.uniforms.netSide.value = 1;
		this.leadMat = createNetMaterial( 'lead', ground );
		this.cordMat = createNetMaterial( 'cord', ground );
		this.cordMat.uniforms.netCol.value.set( 0xd9d2bd );
		this.cordMat.uniforms.netRough.value = 0.75;
		this.leadMat.uniforms.netCol.value.set( 0x6f6a5e );
		this.leadMat.uniforms.netRough.value = 0.85;
		this.hornMat = createPropMaterial( 'castNetHorn', { underwater: ground } );
		const netGeo = nettingGeometry();
		this.netMesh = new Mesh( netGeo, this.meshMat ); // under the water: drawn before it
		this.netMeshUp = new Mesh( netGeo, this.meshMatUp ); // above it: after
		this.netMeshUp.renderOrder = 2;
		this.leadMesh = new Mesh( leadGeometry(), this.leadMat );
		this.cordMesh = new Mesh( cordGeometry(), this.cordMat );
		this.hornMesh = new Mesh( hornGeometry(), this.hornMat );
		this.hornMesh.matrixAutoUpdate = false;
		const ringGeo = new RingGeometry( 0.95, 1, 72 ).rotateX( - Math.PI / 2 );
		this.aimMat = new MeshBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false } );
		this.aimMesh = new Mesh( ringGeo, this.aimMat );
		this.aimMesh.renderOrder = 3;
		this.netMesh.name = 'CastNet';
		this.netMeshUp.name = 'CastNetAbove';
		this.leadMesh.name = 'CastNetLeadLine';
		this.cordMesh.name = 'CastNetLines';
		this.hornMesh.name = 'CastNetHorn';
		this.aimMesh.name = 'CastNetAim';
		this.meshes = [ this.netMesh, this.netMeshUp, this.leadMesh, this.cordMesh, this.hornMesh, this.aimMesh ];
		for ( const m of this.meshes ) {

			m.frustumCulled = false;
			m.castShadow = false;
			m.visible = false;
			scene.add( m );

		}

	}

	// the net of these stats (Gear.js castNet): its rest lengths, masses, twine. (While it's out, once
	// it's back in the hands)
	setGear( g ) {

		if ( this.gear && this.busy ) {

			this._pendingGear = g;
			return;

		}

		this._pendingGear = null;
		const same = this.gear && this.gear.netM === g.netM && this.gear.netTwine === g.netTwine && this.gear.meshCm === g.meshCm && this.gear.leadKgM === g.leadKgM;
		this.gear = g;
		if ( same ) return;
		this.R = g.netM;
		this._build();
		const tw = TWINE[ g.netTwine ] || TWINE.nylon;
		for ( const m of [ this.meshMat, this.meshMatUp ] ) {

			const u = m.uniforms;
			u.netCol.value.set( tw.color );
			u.netMesh.value = g.meshCm / 100;
			u.netTwine.value = tw.width;
			u.netRough.value = tw.rough;
			u.netOpacity.value = tw.opacity;

		}

		this._uvs();
		if ( this.equipped && this.state !== 'stowed' ) this.reset();

	}

	_build() {

		const R = this.R, S = SPOKES;
		const rho = this.rho = new Float32Array( RINGS + 1 );
		for ( let k = 1; k <= RINGS; k ++ ) rho[ k ] = HORN_R + ( R - HORN_R ) * k / RINGS;
		const a = [], b = [], l = [];
		for ( let j = 0; j < S; j ++ ) for ( let k = 0; k < RINGS; k ++ ) {

			a.push( pid( k, j ) );
			b.push( pid( k + 1, j ) );
			l.push( rho[ k + 1 ] - rho[ k ] );

		}

		for ( let k = 1; k <= RINGS; k ++ ) for ( let j = 0; j < S; j ++ ) {

			a.push( pid( k, j ) );
			b.push( pid( k, j + 1 ) );
			l.push( 2 * rho[ k ] * Math.sin( Math.PI / S ) );

		}

		this.cA = Uint16Array.from( a );
		this.cB = Uint16Array.from( b );
		this.cL = Float32Array.from( l );
		// the leads are heavy, the netting light; the horn (and swivel) in between
		for ( let i = 0; i < N; i ++ ) {

			const k = i === 0 ? 0 : 1 + Math.floor( ( i - 1 ) / S );
			this.K[ i ] = k === 0 ? CROWN : k === RINGS ? LEAD : MESH;
			this.W[ i ] = k === 0 ? 3 : k === RINGS ? 1 : 12;

		}

		// what the hands hold: the netting gathered in the right hand a lead line's drop above the leads
		// (about 85 cm: the rest hangs below it), folded once between there and the horn
		const step = ( R - HORN_R ) / RINGS;
		this.gatherK = clamp( RINGS - Math.round( 0.85 / step ), 2, RINGS - 2 );
		this.gatherM = Math.max( 1, Math.round( this.gatherK / 2 ) );
		this.leftN = Math.round( S / 3 );
		this.purseLen = R * 0.93; // m of hand line that draws the brails closed
		this.brailOpen = R * 1.06;

	}

	// the mesh coordinates (m on the open net) on the drawn surface and along the lead line
	_uvs() {

		const uv = this.netMesh.geometry.attributes.netUv;
		for ( let r = 0; r < ROWS; r ++ ) {

			const kf = r / SUB_R;
			const k0 = Math.floor( kf ), f = kf - k0;
			const rho = k0 >= RINGS ? this.rho[ RINGS ] : this.rho[ k0 ] + ( this.rho[ k0 + 1 ] - this.rho[ k0 ] ) * f;
			for ( let c = 0; c <= COLS; c ++ ) uv.setXY( r * ( COLS + 1 ) + c, rho * Math.PI * 2 * c / COLS, rho );

		}

		uv.needsUpdate = true;
		const lu = this.leadMesh.geometry.attributes.netUv;
		const circ = Math.PI * 2 * this.R;
		for ( let i = 0; i <= LEAD_PTS; i ++ ) for ( let s = 0; s < LEAD_RAD; s ++ ) lu.setXY( i * LEAD_RAD + s, circ * i / LEAD_PTS, s / LEAD_RAD );
		lu.needsUpdate = true;

	}

	equip( on ) {

		if ( on === this.equipped ) return;
		this.equipped = on;
		if ( on ) {

			if ( this.camera && this.audio && this.audio.netReady ) this.audio.netReady();
			this.reset();

		} else {

			this.setState( 'stowed' );
			this.pulling = false;
			for ( const m of this.meshes ) m.visible = false;

		}

	}

	setState( s ) {

		this.state = s;
		this.t = 0;
		if ( s === 'lifted' ) this._liftFrom.set( this.P[ 0 ], this.P[ 1 ], this.P[ 2 ] ).applyMatrix4( _m.copy( this.frame ).invert() );
		if ( this._pendingGear && ! this.busy ) this.setGear( this._pendingGear );

	}

	get busy() {

		return this.state !== 'held' && this.state !== 'stowed' && this.state !== 'windup';

	}

	// in the water with the brails drawn closed: what's under it is caught, and it's hauled in
	get pursed() {

		return this.state === 'sinking' && this.draw >= 1;

	}

	// straight back to loaded in the hands
	reset() {

		this.setState( this.equipped ? 'held' : 'stowed' );
		this.charge = 0;
		this.over = 0;
		this.draw = 0;
		this.pulling = false;
		this.load = 0;
		this.splashed = this.bottomed = this.dumped = false;
		this.footprint.active = false;
		this.bag.out = false;
		this.pose.r.set( ...HANDS.held.r );
		this.pose.l.set( ...HANDS.held.l );
		this._hung = false;

	}

	// ---- the throw

	startWindup() {

		if ( this.state !== 'held' ) return false;
		this.setState( 'windup' );
		this.charge = 0;
		this.over = 0;
		return true;

	}

	cancelWindup() {

		if ( this.state === 'windup' ) this.setState( 'held' );

	}

	// let go: the sweep, and the net leaves the hands at its end. Aimed at aim (where the camera looks
	// on the water: update keeps it), opened as well as the wind-up was timed
	release() {

		if ( this.state !== 'windup' ) return false;
		const g = this.gear;
		// held at the top too long: the arms tire and the spin goes
		const q = openQuality( this.charge, g.spreadWin ) * ( 1 - clamp( this.over / 1.5, 0, 0.6 ) );
		this.quality = q;
		const a = this.aim;
		this.lastThrow = { x: a.x, y: a.y, z: a.z, q, seed: Math.random() };
		this.setState( 'throw' );
		this.events.push( 'throw' );
		if ( this.audio && this.audio.netThrow ) this.audio.netThrow( q );
		return true;

	}

	// (Together.js) someone else's throw, as they threw it (lastThrow)
	remoteThrow( d ) {

		if ( ! d || ! this.equipped ) return;
		if ( this.state !== 'held' && this.state !== 'windup' ) this.reset();
		this.lastThrow = d;
		this.quality = d.q;
		this.setState( 'throw' );
		if ( this.audio && this.audio.netThrow ) this.audio.netThrow( d.q, this.handR );

	}

	// (Together.js) someone else's net after the throw: how far they've drawn and hauled it, and when
	// it's up, dumped and loaded again
	follow( s, draw, len ) {

		if ( ! this.equipped ) return;
		// (their poses run a little behind the throw: a net in the air isn't taken back by one)
		const inAir = this.state === 'throw' || this.state === 'flying';
		if ( s === 'held' && this.busy && this.state !== 'gather' && ! inAir ) this.setState( 'gather' );
		else if ( ( s === 'lifted' || s === 'dumping' ) && this.state === 'sinking' ) this.setState( 'lifted' );
		this.hauling = false;
		if ( this.state === 'sinking' ) {

			const was = this.draw, wasLen = this.handLen;
			this.draw += ( clamp( draw, 0, 1 ) - this.draw ) * 0.25;
			if ( Number.isFinite( len ) ) this.handLen = Math.max( HAUL_END, len );
			this.hauling = this.draw > was + 1e-4 || this.handLen < wasLen - 1e-3;
			if ( this.hauling && this.time > ( this._pullAt || 0 ) ) {

				this._pullAt = this.time + ( this.draw < 1 ? 0.6 : 0.4 );
				if ( this.audio && this.audio.netPull ) this.audio.netPull( this.draw < 1, this.handR );

			}

		}

	}

	setPull( on ) {

		this.pulling = !! on && this.state === 'sinking';

	}

	// m of hand line paid out for a throw D m out (the rest stays coiled on the wrist)
	_lineFor( D ) {

		return Math.max( D + 3, this.gear.throwM + 2.5 );

	}

	// where it's aimed, whether the hand line lets it reach the bottom still open (deeper, it's drawn
	// in toward you as it sinks and closes on the way down)
	get aimReaches() {

		const a = this.aim;
		if ( ! a.show || a.land ) return true;
		const L = this._lineFor( a.d ), drop = this.handR.y - ( this.aimWaterY - a.depth );
		return Math.sqrt( Math.max( 0, L * L - a.d * a.d ) ) + this.R > drop;

	}

	// the net leaves the hands: every particle where the sweep has it, set flying toward the aim, the
	// leads spinning outward as fast as it was spun
	_launch() {

		const d = this.lastThrow || { x: this.handR.x, y: this.waterY, z: this.handR.z - 4, q: 1, seed: 0.5 };
		const P = this.P, V = this.V, R = this.R, q = clamp( d.q, 0.05, 1 );
		// the centre of the bunched net
		let cx = 0, cy = 0, cz = 0;
		for ( let i = 0; i < N; i ++ ) {

			cx += P[ i * 3 ];
			cy += P[ i * 3 + 1 ];
			cz += P[ i * 3 + 2 ];

		}

		cx /= N;
		cy /= N;
		cz /= N;
		let fx = d.x - cx, fz = d.z - cz;
		const D = Math.max( 0.5, Math.hypot( fx, fz ) );
		fx /= D;
		fz /= D;
		// a low arc: up a metre or so, and down onto the water (or what's there) at the aim
		const vy0 = clamp( 1.5 + D * 0.32, 2, 4.6 );
		const H = Math.max( - 1, cy - d.y );
		const tF = ( vy0 + Math.sqrt( vy0 * vy0 + 2 * GRAV * Math.max( 0.05, H ) ) ) / GRAV;
		const vh = D / tF * ( 0.94 + 0.065 * tF ); // (the netting drags; the leads slide on a little in the water)
		// opening: fully spun, the leads reach the full spread just before it lands
		const vr = R * ( 0.28 + 0.8 * q ) / ( tF * 0.82 );
		const lop = ( 1 - q ) * 0.6, lopA = d.seed * Math.PI * 2; // a bad throw opens lopsided
		const spin = vr * 0.3;
		const sx = - fz, sz = fx; // to the right of the throw
		for ( let k = 0; k <= RINGS; k ++ ) for ( let j = 0; j < ( k ? SPOKES : 1 ); j ++ ) {

			const i = pid( k, j ), i3 = i * 3;
			const th = ( j / SPOKES ) * Math.PI * 2;
			const ox = Math.cos( th ) * sx + Math.sin( th ) * fx, oz = Math.cos( th ) * sz + Math.sin( th ) * fz;
			const f = k / RINGS;
			const vrj = vr * f * ( 1 + lop * Math.cos( th - lopA ) );
			V[ i3 ] = vh * fx + ox * vrj - oz * spin * f;
			V[ i3 + 1 ] = vy0 + ( 1 - f ) * 0.35;
			V[ i3 + 2 ] = vh * fz + oz * vrj + ox * spin * f;
			this.wet[ i ] = 0;

		}

		this.handLen = this._lineFor( D );
		this.draw = 0;
		this.load = 0;
		this.splashed = this.bottomed = this.dumped = false;
		this.setState( 'flying' );

	}

	// ---- per frame

	// frame: the camera's matrixWorld (yours, by default) or the head's (someone else's: Together.js);
	// groundAt( x, z, maxY ): the floor (sand, sea bed, the pier's deck); waterY: the water's height
	// when there's no query (someone else's)
	update( dt, o = {} ) {

		dt = Math.min( dt, 1 / 20 );
		this.time += dt;
		this.t += dt;
		this._dt = dt;
		if ( ! this.equipped || this.state === 'stowed' || ! this.gear ) {

			for ( const m of this.meshes ) m.visible = false;
			return;

		}

		if ( o.frame ) this.frame.copy( o.frame );
		else if ( this.camera ) this.frame.copy( this.camera.matrixWorld );
		if ( o.groundAt ) this.groundAt = o.groundAt;
		this._water( o );
		this._aim();
		this._advance( dt );
		this._hands();
		if ( ! this._hung ) this._hang();
		this._pins();
		this._grounds();
		const n = dt > 1 / 50 ? 3 : 2, h = dt / n;
		for ( let s = 0; s < n; s ++ ) this._step( h );
		this._measure();
		this._watch( dt );
		if ( o.visible === false ) {

			for ( const m of this.meshes ) m.visible = false;
			return;

		}

		this._draw();

	}

	_water( o ) {

		const q = this.query;
		if ( q ) {

			q.setPoint( this.slot, this.P[ 0 ], this.P[ 2 ] );
			if ( q.cpuValid ) {

				const h = q.cpu[ this.slot * 4 ], ha = q.cpu[ ( this.slot + 1 ) * 4 ];
				if ( Number.isFinite( h ) ) this.waterY = h;
				if ( Number.isFinite( ha ) ) this.aimWaterY = ha;

			}

		} else this.waterY = this.aimWaterY = o.waterY ?? 0;

	}

	// where the throw would go: where you look, on the water, as far as the net throws
	_aim() {

		const a = this.aim;
		a.show = false;
		if ( ! this.camera || ( this.state !== 'held' && this.state !== 'windup' ) ) return;
		const e = this.frame.elements;
		const cx = e[ 12 ], cy = e[ 13 ], cz = e[ 14 ];
		const fx = - e[ 8 ], fy = - e[ 9 ], fz = - e[ 10 ];
		const fh = Math.hypot( fx, fz ) || 1;
		const wy = this.aimWaterY;
		let d = fy < - 0.02 ? ( cy - wy ) / - fy * fh : Infinity;
		d = clamp( Number.isFinite( d ) ? d : Infinity, 1.6, this.gear.throwM );
		a.x = cx + fx / fh * d;
		a.z = cz + fz / fh * d;
		a.d = d;
		if ( this.query ) this.query.setPoint( this.slot + 1, a.x, a.z );
		const g = this.groundAt ? this.groundAt( a.x, a.z, cy - 0.2 ) : - Infinity;
		a.y = Math.max( wy, g );
		a.depth = wy - g;
		// on the sand, a deck, or too shallow for anything to be under it
		a.land = a.depth < 0.12;
		a.ok = true;
		a.show = true;

	}

	_advance( dt ) {

		const pose = this.pose;
		const ease = ( to, k ) => {

			const f = 1 - Math.exp( - dt * k );
			pose.r.x += ( to.r[ 0 ] - pose.r.x ) * f;
			pose.r.y += ( to.r[ 1 ] - pose.r.y ) * f;
			pose.r.z += ( to.r[ 2 ] - pose.r.z ) * f;
			pose.l.x += ( to.l[ 0 ] - pose.l.x ) * f;
			pose.l.y += ( to.l[ 1 ] - pose.l.y ) * f;
			pose.l.z += ( to.l[ 2 ] - pose.l.z ) * f;

		};

		switch ( this.state ) {

			case 'held':
				ease( HANDS.held, 8 );
				break;
			case 'windup': {

				this.charge = Math.min( 1, this.charge + dt / WIND_S );
				if ( this.charge >= 1 ) this.over += dt;
				const s = smooth( this.charge );
				const to = mixPose( HANDS.held, HANDS.wound, s );
				// held at the top, the arms start to shake
				const shake = clamp( this.over / 1.5, 0, 1 ) * 0.012;
				to.r[ 1 ] += Math.sin( this.time * 37 ) * shake;
				ease( to, 14 );
				break;

			}

			case 'throw': {

				const s = smooth( this.t / SPIN_S );
				const to = mixPose( HANDS.wound, HANDS.thrown, s );
				pose.r.set( ...to.r );
				pose.l.set( ...to.l );
				if ( this.t >= SPIN_S ) {

					this._hands();
					this._launch();

				}

				break;

			}

			case 'flying':
				ease( HANDS.line, 5 );
				break;
			case 'sinking':
				ease( this.pulling || this.hauling ? HANDS.pull : HANDS.line, 6 );
				this._haul( dt );
				break;
			case 'lifted':
				ease( HANDS.lifted, 7 );
				if ( this.t > LIFT_S ) {

					this.setState( 'dumping' );
					this.dumped = false;

				}

				break;
			case 'dumping':
				ease( HANDS.lifted, 7 );
				this.draw = Math.max( 0, 1 - this.t / 0.45 );
				if ( this.t > 0.22 && ! this.dumped ) {

					this.dumped = true;
					this.events.push( 'dump' );
					if ( this.audio && this.audio.netDump ) this.audio.netDump( this.bag );

				}

				if ( this.t > DUMP_S ) this.setState( 'gather' );
				break;
			case 'gather':
				ease( HANDS.held, 4 );
				this.draw = 0;
				if ( this.t > GATHER_S ) this.setState( 'held' );
				break;

		}

	}

	// hand over hand: first the brails are drawn through the horn (the lead line closes under it), then
	// the purse comes in, slower with a load in it
	_haul( dt ) {

		const P = this.P, te = this.tether;
		const dist = Math.hypot( P[ 0 ] - te.x, P[ 1 ] - te.y, P[ 2 ] - te.z );
		// slack is taken up as it's pulled (the line never pays out again)
		if ( this.pulling ) this.handLen = Math.min( this.handLen, dist + 0.02 );
		if ( ! this.pulling ) return;
		this._pullT -= dt;
		if ( this._pullT <= 0 ) {

			this._pullT = this.draw < 1 ? 0.6 : 0.4;
			if ( this.audio && this.audio.netPull ) this.audio.netPull( this.draw < 1, this.camera ? null : this.handR );

		}

		if ( this.draw < 1 ) {

			const was = this.draw;
			this.draw = Math.min( 1, this.draw + PULL_V[ 0 ] * dt / this.purseLen );
			if ( was < 1 && this.draw >= 1 ) this.events.push( 'pursed' );
			return;

		}

		const slow = 1 / ( 1 + this.load * 0.12 ) * ( this.footprint.wet ? 1 : 0.8 );
		this.handLen = Math.max( HAUL_END, this.handLen - PULL_V[ 1 ] * slow * dt );
		if ( dist < HAUL_END + 0.2 ) {

			this.setState( 'lifted' );
			this.events.push( 'lifted' );
			if ( this.audio && this.audio.netLift ) this.audio.netLift( this.bag, this.bag.out );

		}

	}

	// the hands in the world, and where the hand line leaves them (lineEnd: drawn; the line pulls from
	// the right hand: tether)
	_hands() {

		this.handR.copy( this.pose.r ).applyMatrix4( this.frame );
		this.handL.copy( this.pose.l ).applyMatrix4( this.frame );
		const s = this.state, loaded = s === 'held' || s === 'windup' || s === 'throw' || s === 'gather';
		const lift = loaded ? clamp( HAND_CLEAR - ( this.handR.y - this.waterY ), 0, LIFT_MAX ) : 0;
		this.lift += ( lift - this.lift ) * ( 1 - Math.exp( - this._dt * 5 ) );
		this.handR.y += this.lift;
		this.handL.y += this.lift;
		this.tether.copy( this.handR );
		// carried off somewhere at once (aboard, a respawn): hung from the hands again
		if ( this._hung && this._lastHand.distanceToSquared( this.handR ) > 4 && ! this.busy ) this._hung = false;
		this._lastHand.copy( this.handR );
		if ( this.state === 'sinking' && this.pulling ) {

			// hand over hand: the line passes from one hand to the other
			const ph = this.time * Math.PI * ( this.draw < 1 ? PULL_V[ 0 ] : PULL_V[ 1 ] ) / 0.45;
			const s = 0.5 + 0.5 * Math.sin( ph );
			this.lineEnd.lerpVectors( this.handR, this.handL, s );
			this.lineEnd.y += Math.abs( Math.cos( ph ) ) * 0.05;

		} else this.lineEnd.copy( this.handR );

	}

	_pinEye( i, x, y, z, w ) {

		_v.set( x, y, z ).applyMatrix4( this.frame );
		const i3 = i * 3;
		this.T[ i3 ] = _v.x;
		this.T[ i3 + 1 ] = _v.y + this.lift;
		this.T[ i3 + 2 ] = _v.z;
		this.pin[ i ] = w;

	}

	// loaded: the horn and a gather of the netting in the right hand (folded once between), a third of
	// the lead line over the left
	_heldPins( w ) {

		const r = this.pose.r, l = this.pose.l;
		this._pinEye( 0, r.x, r.y + 0.04, r.z, w );
		for ( let j = 0; j < SPOKES; j ++ ) {

			const a = j / SPOKES * Math.PI * 2;
			this._pinEye( pid( this.gatherM, j ), r.x + Math.cos( a ) * 0.022, r.y + 0.015, r.z + Math.sin( a ) * 0.02, w );
			this._pinEye( pid( this.gatherK, j ), r.x + Math.cos( a ) * 0.032, r.y - 0.025, r.z + Math.sin( a ) * 0.026, w );

		}

		const n = this.leftN;
		for ( let a = 0; a < n; a ++ ) {

			const f = a / ( n - 1 ) - 0.5;
			this._pinEye( pid( RINGS, a ), l.x + f * 0.13, l.y - 0.006 + Math.abs( f ) * 0.025, l.z + f * f * 0.06, w );

		}

	}

	// the sweep: from where the hands hold it (s 0) to bunched in the right hand, about to fly (s 1)
	_throwPins( s ) {

		const d = this.lastThrow, T = this.T, pin = this.pin;
		const hx = this.handR.x, hy = this.handR.y, hz = this.handR.z;
		let fx = d ? d.x - hx : 0, fz = d ? d.z - hz : - 1;
		const fl = Math.hypot( fx, fz ) || 1;
		fx /= fl;
		fz /= fl;
		const sx = - fz, sz = fx;
		const r0 = 0.1 + 0.035 * this.R;
		const cx = hx + fx * 0.12, cz = hz + fz * 0.12;
		for ( let k = 0; k <= RINGS; k ++ ) for ( let j = 0; j < ( k ? SPOKES : 1 ); j ++ ) {

			const i = pid( k, j ), i3 = i * 3, f = k / RINGS;
			const th = ( j / SPOKES ) * Math.PI * 2;
			const ox = Math.cos( th ) * sx + Math.sin( th ) * fx, oz = Math.cos( th ) * sz + Math.sin( th ) * fz;
			const tx = cx + ox * r0 * f, ty = hy + 0.1 * ( 1 - f ) - 0.05 * f, tz = cz + oz * r0 * f;
			if ( pin[ i ] > 0 ) {

				T[ i3 ] += ( tx - T[ i3 ] ) * s;
				T[ i3 + 1 ] += ( ty - T[ i3 + 1 ] ) * s;
				T[ i3 + 2 ] += ( tz - T[ i3 + 2 ] ) * s;

			} else {

				T[ i3 ] = tx;
				T[ i3 + 1 ] = ty;
				T[ i3 + 2 ] = tz;
				pin[ i ] = s * 0.9;

			}

		}

	}

	_pins() {

		this.pin.fill( 0 );
		switch ( this.state ) {

			case 'held':
			case 'windup':
				// (just gathered in, it's drawn the last of the way into the hands over a moment)
				this._heldPins( this.state === 'held' ? Math.min( 1, 0.2 + this.t * 4 ) : 1 );
				break;
			case 'throw':
				this._heldPins( 1 );
				this._throwPins( smooth( this.t / SPIN_S ) );
				break;
			case 'lifted':
			case 'dumping': {

				// pinned where it is, then brought up into the hand: a pin that jumps throws the purse
				const r = this.pose.r, f = this._liftFrom;
				const k = this.state === 'lifted' ? smooth( Math.min( 1, this.t / LIFT_IN ) ) : 1;
				this._pinEye( 0, f.x + ( r.x - f.x ) * k, f.y + ( r.y + 0.02 - f.y ) * k, f.z + ( r.z - f.z ) * k, 1 );
				break;

			}
			case 'gather': {

				// loaded back in, the netting coming up into the hands (the pins act every substep: gently)
				const w = smooth( this.t / GATHER_S );
				this._heldPins( w >= 1 ? 1 : 0.004 + 0.2 * w * w * w );
				this.pin[ 0 ] = 1;
				break;

			}

		}

		for ( let i = 0; i < N; i ++ ) this.Wf[ i ] = this.W[ i ] * ( 1 - this.pin[ i ] );

	}

	// first frame in the hands: hung from them and settled
	_hang() {

		this._hung = true;
		this._pins();
		const P = this.P, V = this.V;
		const step = ( this.R - HORN_R ) / RINGS;
		for ( let k = 0; k <= RINGS; k ++ ) for ( let j = 0; j < ( k ? SPOKES : 1 ); j ++ ) {

			const i = pid( k, j ), i3 = i * 3;
			const a = j / SPOKES * Math.PI * 2;
			const below = Math.max( 0, k - this.gatherK ) * step;
			P[ i3 ] = this.handR.x + Math.cos( a ) * 0.04 * ( 1 + k * 0.1 );
			P[ i3 + 1 ] = this.handR.y - below;
			P[ i3 + 2 ] = this.handR.z + Math.sin( a ) * 0.04 * ( 1 + k * 0.1 );
			V[ i3 ] = V[ i3 + 1 ] = V[ i3 + 2 ] = 0;
			this.wet[ i ] = 0;

		}

		this._grounds();
		for ( let s = 0; s < 90; s ++ ) this._step( 1 / 120 );

	}

	// the floor under each lead (and the horn); the netting's between theirs
	_grounds() {

		const g = this.groundAt, P = this.P, Gy = this.Gy;
		if ( ! g ) {

			Gy.fill( - 1e3 );
			return;

		}

		// a deck is under what lay on it (a rising deck, a step up) or comes down onto it: not what's
		// hauled up beside it
		const reach = ( i ) => ( P[ i * 3 + 1 ] - Gy[ i ] < 0.06 ? 0.3 : 0.02 );
		Gy[ 0 ] = g( P[ 0 ], P[ 2 ], P[ 1 ] + reach( 0 ) );
		for ( let j = 0; j < SPOKES; j ++ ) {

			const i = pid( RINGS, j ), i3 = i * 3;
			Gy[ i ] = g( P[ i3 ], P[ i3 + 2 ], P[ i3 + 1 ] + reach( i ) );
			// between them it's guessed, unless the guess is over netting that hangs below it
			for ( let k = 1; k < RINGS; k ++ ) {

				const m = pid( k, j ), m3 = m * 3, f = Gy[ 0 ] + ( Gy[ i ] - Gy[ 0 ] ) * k / RINGS;
				Gy[ m ] = f <= P[ m3 + 1 ] + reach( m ) ? f : g( P[ m3 ], P[ m3 + 2 ], P[ m3 + 1 ] + reach( m ) );

			}

		}

	}

	_step( h ) {

		const P = this.P, V = this.V, Q = this.Q, K = this.K, Wf = this.Wf, Gy = this.Gy, wet = this.wet;
		const wy = this.waterY, sink = this.gear.sinkMs, time = this.time;
		// (M10) the wind past a fair day's: in the air each piece is dragged toward it, not toward still air
		const ws = windBeyondFair( G.windSpeed.value ), wx = G.windDir.value.x * ws, wz = G.windDir.value.y * ws;
		for ( let i = 0; i < N; i ++ ) {

			const i3 = i * 3, kind = K[ i ];
			let vx = V[ i3 ], vy = V[ i3 + 1 ], vz = V[ i3 + 2 ];
			if ( P[ i3 + 1 ] < wy ) {

				if ( ! wet[ i ] ) {

					// it slaps onto the water
					wet[ i ] = 1;
					vx *= 0.2;
					vz *= 0.2;
					vy *= 0.4;

				}

				// in the water everything slows toward its sinking speed: the leads' (the net's), the
				// horn's, and the netting's (it nearly floats), stirred a little by the swell
				const term = kind === LEAD ? - sink : kind === CROWN ? - 0.35 : - 0.1;
				const f = 1 - Math.exp( - h * ( kind === LEAD ? 6 : kind === CROWN ? 4 : 3.2 ) );
				const sway = kind === MESH ? 0.04 : 0;
				vx += ( Math.sin( time * 1.3 + this.phase[ i ] ) * sway - vx ) * f;
				vz += ( Math.cos( time * 1.1 + this.phase[ i ] ) * sway - vz ) * f;
				vy += ( term - vy ) * f;

			} else {

				// in the air: the leads barely slowed, the netting catching it (M10: and the wind, in a blow:
				// the netting's carried off downwind far more than the leads, and it opens lopsided)
				vy -= GRAV * h;
				const d = Math.exp( - h * ( kind === LEAD ? 0.03 : kind === CROWN ? 0.1 : 0.28 ) );
				vx = wx + ( vx - wx ) * d;
				vy *= d;
				vz = wz + ( vz - wz ) * d;

			}

			Q[ i3 ] = P[ i3 ];
			Q[ i3 + 1 ] = P[ i3 + 1 ];
			Q[ i3 + 2 ] = P[ i3 + 2 ];
			P[ i3 ] += vx * h;
			P[ i3 + 1 ] += vy * h;
			P[ i3 + 2 ] += vz * h;

		}

		const cA = this.cA, cB = this.cB, cL = this.cL, nc = cL.length;
		const brail = this.brailOpen + ( 0.1 - this.brailOpen ) * smooth( this.draw );
		const tether = this.state === 'flying' || this.state === 'sinking';
		const le = this.tether;
		for ( let it = 0; it < ITER; it ++ ) {

			// the netting and the lead line: ropes (they pull, never push)
			for ( let c = 0; c < nc; c ++ ) {

				const a = cA[ c ], b = cB[ c ], a3 = a * 3, b3 = b * 3;
				const dx = P[ b3 ] - P[ a3 ], dy = P[ b3 + 1 ] - P[ a3 + 1 ], dz = P[ b3 + 2 ] - P[ a3 + 2 ];
				const d2 = dx * dx + dy * dy + dz * dz, rest = cL[ c ];
				if ( d2 <= rest * rest ) continue;
				const wa = Wf[ a ], wb = Wf[ b ], ws = wa + wb;
				if ( ws <= 0 ) continue;
				const d = Math.sqrt( d2 ), k = ( d - rest ) / ( d * ws );
				P[ a3 ] += dx * k * wa;
				P[ a3 + 1 ] += dy * k * wa;
				P[ a3 + 2 ] += dz * k * wa;
				P[ b3 ] -= dx * k * wb;
				P[ b3 + 1 ] -= dy * k * wb;
				P[ b3 + 2 ] -= dz * k * wb;

			}

			// the brails: the lead line drawn up to the horn (which the hand line holds against it)
			if ( this.draw > 0 ) for ( let j = 0; j < SPOKES; j += BRAIL_EVERY ) {

				const b = pid( RINGS, j ), b3 = b * 3;
				const dx = P[ b3 ] - P[ 0 ], dy = P[ b3 + 1 ] - P[ 1 ], dz = P[ b3 + 2 ] - P[ 2 ];
				const d2 = dx * dx + dy * dy + dz * dz;
				if ( d2 <= brail * brail ) continue;
				const wa = Wf[ 0 ] * 0.15, wb = Wf[ b ], ws = wa + wb;
				if ( ws <= 0 ) continue;
				const d = Math.sqrt( d2 ), k = ( d - brail ) / ( d * ws );
				P[ 0 ] += dx * k * wa;
				P[ 1 ] += dy * k * wa;
				P[ 2 ] += dz * k * wa;
				P[ b3 ] -= dx * k * wb;
				P[ b3 + 1 ] -= dy * k * wb;
				P[ b3 + 2 ] -= dz * k * wb;

			}

			// the hand line: the horn no farther from the hands than the line that's out
			if ( tether ) {

				const dx = P[ 0 ] - le.x, dy = P[ 1 ] - le.y, dz = P[ 2 ] - le.z;
				const d = Math.sqrt( dx * dx + dy * dy + dz * dz ), L = this.handLen;
				if ( d > L ) {

					const k = L / d;
					P[ 0 ] = le.x + dx * k;
					P[ 1 ] = le.y + dy * k;
					P[ 2 ] = le.z + dz * k;

				}

			}

		}

		// the hands, the floor
		const T = this.T, pin = this.pin;
		for ( let i = 0; i < N; i ++ ) {

			const i3 = i * 3, w = pin[ i ];
			if ( w > 0 ) {

				P[ i3 ] += ( T[ i3 ] - P[ i3 ] ) * w;
				P[ i3 + 1 ] += ( T[ i3 + 1 ] - P[ i3 + 1 ] ) * w;
				P[ i3 + 2 ] += ( T[ i3 + 2 ] - P[ i3 + 2 ] ) * w;

			}

			const floor = Gy[ i ] + ( K[ i ] === LEAD ? 0.008 : 0.004 );
			if ( P[ i3 + 1 ] < floor ) {

				P[ i3 + 1 ] = floor;
				// the leads dig into the sand; the netting slides over it
				const fr = K[ i ] === LEAD ? 0.5 : 0.8;
				P[ i3 ] = Q[ i3 ] + ( P[ i3 ] - Q[ i3 ] ) * fr;
				P[ i3 + 2 ] = Q[ i3 + 2 ] + ( P[ i3 + 2 ] - Q[ i3 + 2 ] ) * fr;

			}

			let vx = ( P[ i3 ] - Q[ i3 ] ) / h, vy = ( P[ i3 + 1 ] - Q[ i3 + 1 ] ) / h, vz = ( P[ i3 + 2 ] - Q[ i3 + 2 ] ) / h;
			const v2 = vx * vx + vy * vy + vz * vz;
			if ( v2 > 900 ) {

				const k = 30 / Math.sqrt( v2 );
				vx *= k;
				vy *= k;
				vz *= k;

			}

			V[ i3 ] = vx;
			V[ i3 + 1 ] = vy;
			V[ i3 + 2 ] = vz;

		}

	}

	// where the lead line is and how it lies (footprint), and where the purse is (bag)
	_measure() {

		const P = this.P, Gy = this.Gy, fp = this.footprint, wy = this.waterY;
		let sx = 0, sy = 0, sz = 0, sg = 0, on = 0, wetN = 0;
		for ( let j = 0; j < SPOKES; j ++ ) {

			const i = pid( RINGS, j ), i3 = i * 3;
			sx += P[ i3 ];
			sy += P[ i3 + 1 ];
			sz += P[ i3 + 2 ];
			sg += Gy[ i ];
			if ( P[ i3 + 1 ] < Gy[ i ] + 0.04 ) on ++;
			if ( P[ i3 + 1 ] < wy ) wetN ++;

		}

		const cx = sx / SPOKES, cz = sz / SPOKES;
		let r = 0;
		for ( let j = 0; j < SPOKES; j ++ ) {

			const i3 = pid( RINGS, j ) * 3;
			r += Math.hypot( P[ i3 ] - cx, P[ i3 + 2 ] - cz );

		}

		fp.x = cx;
		fp.z = cz;
		fp.r = r / SPOKES;
		fp.lead = sy / SPOKES;
		fp.floor = sg / SPOKES;
		fp.top = P[ 1 ];
		fp.onFloor = on / SPOKES;
		fp.wet = wetN > SPOKES * 0.5;
		fp.purse = this.draw;
		fp.open = fp.r / this.R;
		fp.active = this.state === 'sinking' && fp.wet;
		// the purse: round the netting's lower half
		let bx = 0, by = 0, bz = 0, n = 0;
		for ( let k = Math.floor( RINGS / 2 ); k <= RINGS; k ++ ) for ( let j = 0; j < SPOKES; j ++ ) {

			const i3 = pid( k, j ) * 3;
			bx += P[ i3 ];
			by += P[ i3 + 1 ];
			bz += P[ i3 + 2 ];
			n ++;

		}

		bx /= n;
		by /= n;
		bz /= n;
		let s = 0;
		for ( let k = Math.floor( RINGS / 2 ); k <= RINGS; k ++ ) for ( let j = 0; j < SPOKES; j ++ ) {

			const i3 = pid( k, j ) * 3;
			s += ( P[ i3 ] - bx ) ** 2 + ( P[ i3 + 1 ] - by ) ** 2 + ( P[ i3 + 2 ] - bz ) ** 2;

		}

		const b = this.bag;
		b.x = bx;
		b.y = by;
		b.z = bz;
		b.r = clamp( Math.sqrt( s / n ) * 0.75, 0.07, 0.7 );
		b.out = by - b.r > wy;

	}

	// a point in the purse for the k-th of n fish in it (they shift about as it swings)
	bagPoint( k, n, out ) {

		const b = this.bag;
		const ga = k * 2.39996 + this.time * 0.6;
		const yy = n > 1 ? 1 - 2 * ( k + 0.5 ) / n : 0;
		const rr = Math.sqrt( Math.max( 0, 1 - yy * yy ) );
		const s = b.r * 0.55;
		return out.set( b.x + Math.cos( ga ) * rr * s, b.y + yy * s * 0.7 - b.r * 0.25, b.z + Math.sin( ga ) * rr * s );

	}

	// the moments that make sounds and spray, and the game's events
	_watch( dt ) {

		const fp = this.footprint, P = this.P;
		if ( this.state === 'flying' ) {

			const wetLeads = fp.wet;
			if ( wetLeads && ! this.splashed ) {

				this.splashed = true;
				this.setState( 'sinking' );
				this.events.push( 'splash' );
				_v.set( fp.x, this.waterY, fp.z );
				if ( this.audio && this.audio.netSplash ) this.audio.netSplash( _v, clamp( fp.open, 0.2, 1 ) * Math.min( 1, this.R / 2 ) );
				this._splashSpray();

			} else if ( fp.onFloor > 0.5 || this.t > 4 ) {

				this.setState( 'sinking' );
				this.events.push( 'land' );
				_v.set( fp.x, fp.lead, fp.z );
				if ( this.audio && this.audio.netLand ) this.audio.netLand( _v );

			}

		} else if ( this.state === 'sinking' ) {

			if ( ! this.bottomed && fp.wet && fp.onFloor > 0.6 ) {

				this.bottomed = true;
				this.events.push( 'bottom' );

			}

		}

		// lifted out of the water, it drips
		if ( ( this.state === 'lifted' || this.state === 'dumping' || ( this.state === 'sinking' && this.draw >= 1 ) ) && this.bag.out && this.spray ) {

			this._dripT -= dt;
			if ( this._dripT <= 0 ) {

				this._dripT = 0.06;
				_v.set( this.bag.x + ( Math.random() - 0.5 ) * this.bag.r, this.bag.y - this.bag.r * 0.6, this.bag.z + ( Math.random() - 0.5 ) * this.bag.r );
				_w.set( 0, - 0.4, 0 );
				this.spray.emit( _v, _w, 2, 0.006, 0, { spread: 0.2, life: 0.9 } );

			}

		}

		if ( P[ 1 ] !== P[ 1 ] ) this.reset(); // (never: a NaN would take the net with it)

	}

	_splashSpray() {

		if ( ! this.spray ) return;
		const P = this.P, fp = this.footprint;
		for ( let j = 0; j < SPOKES; j += 2 ) {

			const i3 = pid( RINGS, j ) * 3;
			const ox = P[ i3 ] - fp.x, oz = P[ i3 + 2 ] - fp.z, ol = Math.hypot( ox, oz ) || 1;
			_v.set( P[ i3 ], this.waterY + 0.02, P[ i3 + 2 ] );
			_w.set( ox / ol * 0.5, 1.1 + Math.random() * 0.6, oz / ol * 0.5 );
			this.spray.emit( _v, _w, 4, 0.01, 0, { spread: 0.5, life: 0.8 } );

		}

	}

	// ---- drawing

	_draw() {

		const at = this.at.set( Math.round( this.P[ 0 ] ), Math.round( this.P[ 1 ] ), Math.round( this.P[ 2 ] ) );
		for ( const m of [ this.netMesh, this.netMeshUp, this.leadMesh, this.cordMesh ] ) m.position.copy( at );
		this._hornFrame();
		this._drawNetting();
		this._drawLead();
		this._drawCords();
		const wl = this.waterY;
		this.meshMat.uniforms.netWater.value = wl;
		this.meshMatUp.uniforms.netWater.value = wl;
		this.netMesh.visible = true;
		this.netMeshUp.visible = true;
		this.leadMesh.visible = true;
		this.cordMesh.visible = true;
		this.hornMesh.visible = true;
		// the aim: a ring on the water as wide as the net opens, brighter in the wind-up's moment
		const a = this.aim, am = this.aimMesh;
		am.visible = a.show;
		if ( a.show ) {

			am.position.set( a.x, a.y + 0.03, a.z );
			am.scale.setScalar( this.R * 0.96 );
			let op = 0.32;
			if ( this.state === 'windup' ) {

				const [ lo, hi ] = sweetWindow( this.gear.spreadWin );
				op = this.charge >= lo && this.charge <= hi ? 0.75 : 0.3;

			}

			this.aimMat.opacity = op;
			this.aimMat.color.set( a.land ? 0xffa48a : 0xffffff );

		}

	}

	// the horn sits at the netting's apex, pointing along the netting below it (or the line pulling it)
	_hornFrame() {

		const P = this.P;
		let mx = 0, my = 0, mz = 0;
		for ( let j = 0; j < SPOKES; j ++ ) {

			const i3 = pid( 2, j ) * 3;
			mx += P[ i3 ];
			my += P[ i3 + 1 ];
			mz += P[ i3 + 2 ];

		}

		_a.set( P[ 0 ] - mx / SPOKES, P[ 1 ] - my / SPOKES, P[ 2 ] - mz / SPOKES );
		if ( _a.lengthSq() < 1e-6 ) _a.set( 0, 1, 0 );
		_a.normalize();
		// pulled on, it turns toward the line
		if ( this.state === 'sinking' || this.state === 'flying' ) {

			_b.set( this.lineEnd.x - P[ 0 ], this.lineEnd.y - P[ 1 ], this.lineEnd.z - P[ 2 ] );
			const d = _b.length();
			if ( d > 0.01 ) _a.lerp( _b.multiplyScalar( 1 / d ), d >= this.handLen - 0.05 ? 0.7 : 0.25 ).normalize();

		}

		this.hornAxis.copy( _a );
		_q.setFromUnitVectors( _up, _a );
		_v.set( P[ 0 ], P[ 1 ], P[ 2 ] );
		this.hornMesh.matrix.compose( _v, _q, _w.set( 1, 1, 1 ) );
		this.hornMesh.matrixWorldNeedsUpdate = true;
		this.hornTop.copy( _a ).multiplyScalar( HORN_TOP ).add( _v );

	}

	_drawNetting() {

		const P = this.P, ring = this.ring, surf = this.surf, at = this.at;
		// round each ring: the horn (the netting's laced round its foot), then through the particles
		const ax = this.hornAxis;
		for ( let c = 0; c < COLS; c ++ ) {

			const o = c * 3;
			ring[ o ] = P[ 0 ] + ax.x * 0.004;
			ring[ o + 1 ] = P[ 1 ] + ax.y * 0.004;
			ring[ o + 2 ] = P[ 2 ] + ax.z * 0.004;

		}

		for ( let k = 1; k <= RINGS; k ++ ) for ( let c = 0; c < COLS; c ++ ) {

			const j = Math.floor( c / SUB_A ), w = W_A[ c % SUB_A ], o = ( k * COLS + c ) * 3;
			const i0 = pid( k, j - 1 ) * 3, i1 = pid( k, j ) * 3, i2 = pid( k, j + 1 ) * 3, i3 = pid( k, j + 2 ) * 3;
			for ( let e = 0; e < 3; e ++ ) ring[ o + e ] = w[ 0 ] * P[ i0 + e ] + w[ 1 ] * P[ i1 + e ] + w[ 2 ] * P[ i2 + e ] + w[ 3 ] * P[ i3 + e ];

		}

		// along the spokes, between the rings
		for ( let r = 0; r < ROWS; r ++ ) {

			const k = Math.floor( r / SUB_R ), w = W_R[ r % SUB_R ];
			const k0 = Math.max( 0, k - 1 ), k1 = k, k2 = Math.min( RINGS, k + 1 ), k3 = Math.min( RINGS, k + 2 );
			for ( let c = 0; c < COLS; c ++ ) {

				const o = ( r * COLS + c ) * 3;
				const a = ( k0 * COLS + c ) * 3, b = ( k1 * COLS + c ) * 3, d = ( k2 * COLS + c ) * 3, e3 = ( k3 * COLS + c ) * 3;
				for ( let e = 0; e < 3; e ++ ) surf[ o + e ] = r % SUB_R === 0 ? ring[ b + e ] : w[ 0 ] * ring[ a + e ] + w[ 1 ] * ring[ b + e ] + w[ 2 ] * ring[ d + e ] + w[ 3 ] * ring[ e3 + e ];

			}

		}

		const geo = this.netMesh.geometry, pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
		for ( let r = 0; r < ROWS; r ++ ) for ( let c = 0; c <= COLS; c ++ ) {

			const cc = c % COLS, s = ( r * COLS + cc ) * 3, o = ( r * ( COLS + 1 ) + c ) * 3;
			pos[ o ] = surf[ s ] - at.x;
			pos[ o + 1 ] = surf[ s + 1 ] - at.y;
			pos[ o + 2 ] = surf[ s + 2 ] - at.z;
			// the normal from the neighbours round and along
			const cp = ( r * COLS + ( cc + 1 ) % COLS ) * 3, cm = ( r * COLS + ( cc + COLS - 1 ) % COLS ) * 3;
			const rp = ( Math.min( ROWS - 1, r + 1 ) * COLS + cc ) * 3, rm = ( Math.max( 0, r - 1 ) * COLS + cc ) * 3;
			_a.set( surf[ cp ] - surf[ cm ], surf[ cp + 1 ] - surf[ cm + 1 ], surf[ cp + 2 ] - surf[ cm + 2 ] );
			_b.set( surf[ rp ] - surf[ rm ], surf[ rp + 1 ] - surf[ rm + 1 ], surf[ rp + 2 ] - surf[ rm + 2 ] );
			_c.crossVectors( _b, _a );
			const l = _c.length();
			if ( l > 1e-9 && r > 0 ) _c.multiplyScalar( 1 / l );
			else _c.copy( this.hornAxis );
			nor[ o ] = _c.x;
			nor[ o + 1 ] = _c.y;
			nor[ o + 2 ] = _c.z;

		}

		geo.attributes.position.needsUpdate = true;
		geo.attributes.normal.needsUpdate = true;

	}

	_drawLead() {

		const P = this.P, L = this.leadPts, fp = this.footprint, at = this.at;
		for ( let i = 0; i < LEAD_PTS; i ++ ) {

			const j = Math.floor( i / LEAD_SUB ), w = W_L[ i % LEAD_SUB ];
			const i0 = pid( RINGS, j - 1 ) * 3, i1 = pid( RINGS, j ) * 3, i2 = pid( RINGS, j + 1 ) * 3, i3 = pid( RINGS, j + 2 ) * 3;
			for ( let e = 0; e < 3; e ++ ) L[ i * 3 + e ] = w[ 0 ] * P[ i0 + e ] + w[ 1 ] * P[ i1 + e ] + w[ 2 ] * P[ i2 + e ] + w[ 3 ] * P[ i3 + e ];

		}

		const cy = fp.lead;
		const geo = this.leadMesh.geometry, pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
		for ( let i = 0; i <= LEAD_PTS; i ++ ) {

			const ii = i % LEAD_PTS, n = ( ii + 1 ) % LEAD_PTS, p = ( ii + LEAD_PTS - 1 ) % LEAD_PTS;
			_x.set( L[ ii * 3 ], L[ ii * 3 + 1 ], L[ ii * 3 + 2 ] );
			_a.set( L[ n * 3 ] - L[ p * 3 ], L[ n * 3 + 1 ] - L[ p * 3 + 1 ], L[ n * 3 + 2 ] - L[ p * 3 + 2 ] );
			if ( _a.lengthSq() < 1e-12 ) _a.set( 1, 0, 0 );
			_a.normalize();
			// a frame round the line: outward from the net's middle where it can be, else up
			_b.set( _x.x - fp.x, _x.y - cy, _x.z - fp.z );
			_b.addScaledVector( _a, - _b.dot( _a ) );
			if ( _b.lengthSq() < 1e-8 ) _b.set( 0, 1, 0 ).addScaledVector( _a, - _a.y );
			if ( _b.lengthSq() < 1e-8 ) _b.set( 1, 0, 0 );
			_b.normalize();
			_c.crossVectors( _a, _b );
			for ( let s = 0; s < LEAD_RAD; s ++ ) {

				const t = s / LEAD_RAD * Math.PI * 2, cs = Math.cos( t ), sn = Math.sin( t );
				const nx = _b.x * cs + _c.x * sn, ny = _b.y * cs + _c.y * sn, nz = _b.z * cs + _c.z * sn;
				const o = ( i * LEAD_RAD + s ) * 3;
				pos[ o ] = _x.x + nx * LEAD_R - at.x;
				pos[ o + 1 ] = _x.y + ny * LEAD_R - at.y;
				pos[ o + 2 ] = _x.z + nz * LEAD_R - at.z;
				nor[ o ] = nx;
				nor[ o + 1 ] = ny;
				nor[ o + 2 ] = nz;

			}

		}

		geo.attributes.position.needsUpdate = true;
		geo.attributes.normal.needsUpdate = true;

	}

	// the hand line (the hands to the swivel) and the brails (the horn's foot to the lead line): ribbons
	// turned to the camera, a pixel wide at least, sagging where they're slack
	_drawCords() {

		const P = this.P, at = this.at, geo = this.cordMesh.geometry, pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
		const e = this.frame.elements, cam = _z.set( e[ 12 ], e[ 13 ], e[ 14 ] );
		const eye = this.camera || this.viewer;
		if ( eye ) cam.setFromMatrixPosition( eye.matrixWorld );
		let o = 0;
		const strip = ( A, B, sag, width, segs ) => {

			_c.lerpVectors( A, B, 0.5 );
			_c.y -= sag;
			for ( let i = 0; i <= segs; i ++ ) {

				const t = i / segs, u = 1 - t;
				const px = u * u * A.x + 2 * u * t * _c.x + t * t * B.x;
				const py = u * u * A.y + 2 * u * t * _c.y + t * t * B.y;
				const pz = u * u * A.z + 2 * u * t * _c.z + t * t * B.z;
				_x.set( 2 * u * ( _c.x - A.x ) + 2 * t * ( B.x - _c.x ), 2 * u * ( _c.y - A.y ) + 2 * t * ( B.y - _c.y ), 2 * u * ( _c.z - A.z ) + 2 * t * ( B.z - _c.z ) );
				_y.set( cam.x - px, cam.y - py, cam.z - pz );
				const dist = _y.length() || 1;
				_w.crossVectors( _x, _y );
				if ( _w.lengthSq() < 1e-12 ) _w.set( 1, 0, 0 );
				_w.normalize();
				const hw = Math.max( width, dist * 0.0011 ) * 0.5;
				_y.multiplyScalar( 1 / dist );
				for ( let s = - 1; s <= 1; s += 2 ) {

					pos[ o ] = px + _w.x * hw * s - at.x;
					pos[ o + 1 ] = py + _w.y * hw * s - at.y;
					pos[ o + 2 ] = pz + _w.z * hw * s - at.z;
					nor[ o ] = _y.x;
					nor[ o + 1 ] = _y.y;
					nor[ o + 2 ] = _y.z;
					o += 3;

				}

			}

		};

		// the hand line: loaded, from the swivel to the left wrist (the rest coiled there); out, to the hands
		const held = this.state === 'held' || this.state === 'windup' || this.state === 'gather' || this.state === 'throw';
		_a.copy( held ? this.handL : this.lineEnd );
		_b.copy( this.hornTop );
		const d = _a.distanceTo( _b );
		const slack = held ? 0.12 : Math.max( 0, this.handLen - d );
		strip( _a, _b, Math.min( 1.5, slack * 0.45 + d * 0.015 ), 0.005, LINE_SEG );
		// the brails, from the horn's foot to every other lead
		const ax = this.hornAxis;
		const brail = this.brailOpen + ( 0.1 - this.brailOpen ) * smooth( this.draw );
		for ( let j = 0; j < SPOKES; j += BRAIL_EVERY ) {

			const i3 = pid( RINGS, j ) * 3;
			_a.set( P[ 0 ] + ax.x * 0.005, P[ 1 ] + ax.y * 0.005, P[ 2 ] + ax.z * 0.005 );
			_b.set( P[ i3 ], P[ i3 + 1 ], P[ i3 + 2 ] );
			const bd = _a.distanceTo( _b );
			strip( _a, _b, Math.min( 0.6, Math.max( 0, brail - bd ) * 0.35 ), 0.0018, BRAIL_SEG );

		}

		geo.attributes.position.needsUpdate = true;
		geo.attributes.normal.needsUpdate = true;

	}

	// drained by the game each frame
	takeEvents() {

		if ( ! this.events.length ) return null;
		const e = this.events;
		this.events = [];
		return e;

	}

	dispose() {

		for ( const m of this.meshes ) {

			m.removeFromParent();
			if ( m.geometry !== HORN_GEO ) m.geometry.dispose();

		}

		for ( const m of [ this.meshMat, this.meshMatUp, this.leadMat, this.cordMat, this.hornMat, this.aimMat ] ) m.dispose();

	}

}

function mixPose( a, b, t ) {

	const m = ( x, y ) => x.map( ( v, i ) => v + ( y[ i ] - v ) * t );
	return { r: m( a.r, b.r ), l: m( a.l, b.l ) };

}
