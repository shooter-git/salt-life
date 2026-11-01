import { MathUtils, Mesh, Object3D, Quaternion, Vector3 } from '../../../engine/index.js';
import { Vessel } from '../Vessel.js';
import { compassCardGeometry } from '../Wheelhouse.js';
import { mergePrepared, prepare } from '../GeoKit.js';
import { VARIATION } from '../../../game/Chart.js';
import { LANDS } from '../../../fx/Drips.js';
import { ConsoleLines } from './ConsoleLines.js';
import { ConsoleMaterials } from './ConsoleMaterials.js';
import { FittingKit, moulded } from './Mould.js';
import { OUTBOARD } from './Moulded.js';
import { buildHull, DECK, RODS_AT, hullAt } from './ConsoleHull.js';
import { buildHelm, wheelGeometry, throttleGeometry, CONSOLE, POST, TOP, RACK, WHEEL } from './ConsoleHelm.js';
import { buildLadder, LADDER } from './ConsoleStern.js';
import { CONSOLE_HANDLING } from './ConsoleHandling.js';
import { STEER_MAX, TRIM } from './Outboards.js';

const WHEEL_TURNS = 0.75;
const THROTTLE_ANGLE = 0.6;
// the compass's card, as the lobster boat's (BoatModel: COMPASS)
const CARD = { period: 3, damping: 0.55 };
// where the engines hang: the swivel's axis, the mounting's top. One on her centreline, or two 0.76 m apart (30 in., as a twin rig's)
const MOUNT = { y: 0.46, z: DECK.platform.zEnd - 0.2, twinX: 0.38 };

const WALK_N = 40, WALK_YS = [ DECK.sole, DECK.bench.y, DECK.riser.y, 1.5 ];

const _v = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();

// (M16) The center console: a 23 ft deep-V with an open deck all round the helm, a T-top, outboards on a bracket, a door in
// the transom to the platform and a dive ladder over its side. Modelled after the Regulator 23: docs/m16/console.md.
export class ConsoleModel extends Vessel {

	constructor() {

		super( 'console' );
		const lines = this.lines = new ConsoleLines();
		const materials = this.materials = new ConsoleMaterials( lines );
		const kit = new FittingKit(), parts = {};
		this.handling = CONSOLE_HANDLING;
		this.footstep = 'fiberglass';

		buildHull( kit, lines );
		buildHelm( kit, lines, parts );
		buildLadder( kit, lines );

		// ---- one mesh a material; what's fitted says what of its index is drawn (fit)
		this._ranges = {};
		this._index = {};
		for ( const name of [ 'hull', 'fittings', 'glow', 'display', 'glass' ] ) {

			const geo = kit.merged( name );
			if ( ! geo ) continue;
			const mesh = new Mesh( geo, materials[ name ] );
			mesh.name = 'boat-' + name;
			mesh.castShadow = name !== 'glass';
			mesh.receiveShadow = name !== 'glass' && name !== 'display';
			if ( name === 'glass' ) mesh.renderOrder = 1;
			this.group.add( mesh );
			this.meshes[ name ] = mesh;
			this._ranges[ name ] = kit.rangesOf( name );
			this._index[ name ] = geo.index.array.slice();

		}

		// ---- the parts that move
		const addPart = ( name, geo, mat, parent = this.group ) => {

			const mesh = new Mesh( geo, mat );
			mesh.name = 'boat-' + name;
			mesh.castShadow = mesh.receiveShadow = true;
			parent.add( mesh );
			this.meshes[ name ] = mesh;
			return mesh;

		};

		const STAINLESS = { color: 0xd4d7da, rough: 0.2, metal: 1 };
		this.wheelPivot = new Object3D();
		this.wheelPivot.name = 'boat-wheel-pivot';
		this.wheelPivot.position.copy( parts.wheelCenter );
		this.wheelPivot.quaternion.setFromUnitVectors( new Vector3( 0, 0, 1 ), parts.wheelAxis );
		this.group.add( this.wheelPivot );
		this.wheelMesh = addPart( 'wheel', mergePrepared( wheelGeometry().map( ( g ) => prepare( g, STAINLESS ) ) ), materials.fittings, this.wheelPivot );
		this.throttleMesh = addPart( 'throttle', mergePrepared( throttleGeometry().map( ( g ) => prepare( g, { color: 0x17181a, rough: 0.45 } ) ) ), materials.fittings );
		this.throttleMesh.position.copy( parts.throttlePivot );
		this.compassMesh = addPart( 'compass', prepare( compassCardGeometry(), {} ), materials.display );
		this.compassMesh.position.copy( parts.compassAt );
		this.compassMesh.castShadow = false;
		this._card = null;

		// the engines: tilted about the mounting, swung on the swivel; each a draw, both the one geometry
		const outboard = prepare( moulded( OUTBOARD ), {} );
		this.engines = [ 'outboard', 'outboard2' ].map( ( name ) => {

			const tilt = new Object3D();
			tilt.name = 'boat-' + name + '-tilt';
			tilt.position.set( 0, MOUNT.y, MOUNT.z + 0.08 );
			this.group.add( tilt );
			const swivel = addPart( name, outboard, materials.fittings, tilt );
			swivel.position.set( 0, 0, - 0.08 );
			return { tilt, swivel };

		} );

		// ---- how she floats, from her lines
		this.floatBody( { keelBottom: - 0.53, roofHeight: TOP.y, comY: 0.3, gyration: [ 0.38, 0.27, 0.27 ] } );

		// ---- anchor points
		const S = DECK.sole, eyeY = S + 1.62;
		this.helmEye = new Vector3( WHEEL.x, eyeY, CONSOLE.back - 0.32 );
		this.helm = { x: WHEEL.x, z: CONSOLE.back - 0.2, eye: this.helmEye, rise: [ 0.72, CONSOLE.back - 0.15 ] };
		this.boardPoint = new Vector3( 0.5, S, - 2.1 );
		// (at the rail anywhere along her, from the box aft to the seats, to jump or step off)
		// (and on the platform, by the ladder)
		this.exitPoints = [ ...this.railPoints( [ - 2.2, - 1.2, 0.2, 1.2 ] ), new Vector3( LADDER.x, DECK.platform.y, LADDER.z + 0.3 ) ];
		this.ladder = LADDER;
		this.propeller = new Vector3( 0, MOUNT.y - 0.79, MOUNT.z - 0.5 );
		this.rudder = new Vector3( 0, MOUNT.y - 0.79, MOUNT.z - 0.2 );
		this.bowSprayPoints = this.waterlinePoints( [ 0.9, 1.4, 1.9, 2.3 ] );
		this.colliders = this._buildColliders();
		this._topShelter = this.shelterBox( TOP.halfW - 0.04, S - 0.5, TOP.under - 0.02, TOP.z0 + 0.06, TOP.z1 - 0.06 );
		this.shelter = this._topShelter;
		this._noShelter = this.shelterBox( 0.001, - 100, - 99, 0, 1 );

		// ---- what the rest of the game asks of a boat
		// (her wake: a planing hull's, thrown from her chines at the transom and long behind her: patches a little bigger than a
		// displacement boat's and close enough to run together, the arms going out fast; a wash from each engine)
		this.wake = { quarterX: 1.05, quarterZ: - 2.7, washZ: DECK.platform.zEnd - 0.9, shed: 0.85, armSize: 1.25, washSize: 2, armOut: 1.5, washX: 0 };
		// the lamps, as Rule 23 has a power boat under 12 m: side lights on the bow's shoulders, one all-round white on the stern's
		// pole (BoatLamps' masthead and stern sectors at one point make all round), the same white alone at anchor
		this.lamps = { dome: [ 0, TOP.under - 0.12, - 0.6 ], instruments: [ 0, S + 1.1, - 0.5 ], port: [ lines.halfBreadth( lines.tAtSheerZ( 3 ), lines.sheerY( lines.tAtSheerZ( 3 ) ) - 0.06 ) + 0.01, lines.sheerY( lines.tAtSheerZ( 3 ) ) - 0.06, 3 ], masthead: [ - 1.1, 1.97, - 2.82 ], stern: [ - 1.1, 1.97, - 2.82 ], anchor: [ - 1.1, 1.97, - 2.82 ] };
		// her spreaders, aft along the top's edge, when she has floodlights
		this.floods = [ - 0.55, 0.55 ].map( ( x ) => ( { at: [ x, TOP.under - 0.02, - 1.42 ], dir: [ x * 0.3, - 0.75, - 0.55 ] } ) );
		this.hornAt = new Vector3( 0, TOP.under - 0.05, - 0.2 );
		this.bowWalk = 3.95;
		this.nearDetail = [ 'fittings', 'display', 'wheel', 'throttle', 'compass' ];
		this.transom = { x: 0.32, y: 0.76, z: lines.zAft - 0.01, w: 1.0 };
		// (the dials: an outboard's revs and a planing hull's speed)
		this.gauges = { maxRpm: 6000, tachMax: 70, knotsMax: 50, hot: 160 };
		// tackle (stream 7): her rod holders, butt end, aft-most first
		this.rodHolders = [];
		for ( const z of RODS_AT ) for ( const s of [ 1, - 1 ] ) {

			const t = lines.tAtSheerZ( z );
			this.rodHolders.push( new Vector3( s * ( lines.sheerX( t ) - 0.09 ), lines.sheerY( t ) + 0.03, z ) );

		}

		// ---- state
		this._steer = 0;
		this._throttle = 0;
		this._trim = TRIM.up;
		this.fitted = { twin: true, tTop: true, diveLadder: true, tankRack: true };
		this._ladderDown = null;
		this.covered = false;
		this.fit( this.fitted );
		this.setLadder( false );
		this.setSteering( 0 );
		this.setThrottle( 0 );
		this.setTrim( TRIM.up );

	}

	// (M16, the fleet's) what's been bought for her: stats, as gearStats gives them. The T-top and its shade, the ladder, the
	// tanks' rack and the second engine come and go; a single engine hangs on her centreline
	fit( stats = {} ) {

		const F = this.fitted = { twin: !! stats.twin, tTop: !! stats.tTop, diveLadder: !! stats.diveLadder, tankRack: !! stats.tankRack };
		this._applyFit();
		const [ a, b ] = this.engines;
		a.tilt.position.x = F.twin ? MOUNT.twinX : 0;
		b.tilt.position.x = - MOUNT.twinX;
		b.tilt.visible = F.twin;
		this.wake.washX = F.twin ? MOUNT.twinX : 0;
		this.shelter = F.tTop ? this._topShelter : this._noShelter;
		this.rainTops = this.colliders.filter( ( c ) => [ 'foredeck', 'aftBox', 'post' ].includes( c.tag ) || ( c.tag === 'roof' && F.tTop ) )
			.map( ( c ) => ( { x0: c.center.x - c.half.x, x1: c.center.x + c.half.x, z0: c.center.z - c.half.z, z1: c.center.z + c.half.z, y: c.center.y + c.half.y } ) );
		for ( const c of this.colliders ) if ( c.tag === 'rack' ) c.solid = F.tankRack;

	}

	// (M16) a copy of her on someone else's game, with the engines her owner has. A low tier's copy has no gear. Her rigging
	// hoses stay as the copy's were: they share one geometry among all her copies
	fitCopy( group, { twin } ) {

		const a = group.getObjectByName( 'boat-outboard-tilt' ), b = group.getObjectByName( 'boat-outboard2-tilt' );
		if ( ! a || ! b ) return;
		a.position.x = twin ? MOUNT.twinX : 0;
		b.position.x = - MOUNT.twinX;
		b.visible = twin;

	}

	_applyFit() {

		const on = {
			tTop: this.fitted.tTop, tankRack: this.fitted.tankRack, twin: this.fitted.twin, single: ! this.fitted.twin,
			coverDown: this.fitted.tTop && this.covered,
			ladderUp: this.fitted.diveLadder && ! this._ladderDown, ladderDown: this.fitted.diveLadder && !! this._ladderDown,
		};
		for ( const name of Object.keys( this._ranges ) ) {

			const geo = this.meshes[ name ].geometry, all = this._index[ name ];
			const kept = [];
			let n = 0;
			for ( const [ fitting, from, count ] of this._ranges[ name ] ) if ( ! fitting || on[ fitting ] ) {

				kept.push( [ from, count ] );
				n += count;

			}

			const a = geo.index.array;
			for ( let i = 0, w = 0; i < kept.length; i ++ ) {

				a.set( all.subarray( kept[ i ][ 0 ], kept[ i ][ 0 ] + kept[ i ][ 1 ] ), w );
				w += kept[ i ][ 1 ];

			}

			geo.setDrawRange( 0, n );
			geo.index.needsUpdate = true;

		}

	}

	// her rain cover zipped on, or stowed
	setCover( down ) {

		if ( this.covered === down ) return;
		this.covered = down;
		this._applyFit();

	}

	// the ladder folded down, or up on the platform (with way on, or none in the water)
	setLadder( down ) {

		if ( this._ladderDown === down ) return;
		this._ladderDown = down;
		this._applyFit();

	}

	setPaint( hex ) {

		this.materials.setPaint( hex );

	}

	// from the water you come aboard at the ladder (no ladder: over the platform, a hard haul, right at its edge); from the pier
	// or the beach at her cockpit
	boardFrom( mode ) {

		if ( mode !== 'swim' ) return null;
		const has = this.fitted.diveLadder, B = this._board || ( this._board = { at: new Vector3( LADDER.x, DECK.platform.y + 0.012, DECK.platform.zEnd + 0.3 ), reach: 0, text: '' } );
		B.reach = has ? 2.2 : 1.4;
		B.text = has ? 'Climb the ladder' : 'Haul yourself aboard';
		return B;

	}

	// over her side from where you stand: by the ladder quietly, down it; otherwise at the rail, in beside her
	overboard( p, side ) {

		const O = this._over || ( this._over = { at: new Vector3(), quiet: false, text: '' } );
		if ( this.fitted.diveLadder && Math.hypot( p.x - LADDER.x, p.z - LADDER.z ) < 0.95 ) {

			O.at.set( LADDER.x, 0, LADDER.z - 0.45 );
			O.quiet = true;
			O.text = 'Down the ladder';

		} else {

			O.at.set( side * 1.85, 0, MathUtils.clamp( p.z, - 3, 2 ) );
			O.quiet = false;
			O.text = 'Jump overboard';

		}

		return O;

	}

	// the box the rain doesn't reach, as a test: is this point (boat frame) under her top?
	underTop( x, y, z ) {

		return this.fitted.tTop && Math.abs( x ) < TOP.halfW - 0.1 && z > TOP.z0 + 0.1 && z < TOP.z1 - 0.1 && y < TOP.under;

	}

	// the sole, or through the transom's door the step up to the mat
	soleY( x, z, y ) {

		return z < DECK.sill ? DECK.platform.y + 0.012 : DECK.sole;

	}

	// where you can stand: within the coamings, and out through the transom's door onto the platform
	clampToDeck( p, r ) {

		const L = this.lines, D = DECK.door, P = DECK.platform;
		const inDoor = p.x > D[ 0 ] + r - 0.02 && p.x < D[ 1 ] - r + 0.02;
		// aft of the box: on the platform or nowhere
		if ( p.z < DECK.boxFront - r ) {

			if ( p.z > L.zAft - 0.02 ) {

				// (in the door's way)
				p.x = MathUtils.clamp( p.x, D[ 0 ] + r - 0.02, D[ 1 ] - r + 0.02 );

			} else {

				p.x = MathUtils.clamp( p.x, - P.halfW + r * 0.6, P.halfW - r * 0.6 );

			}

			p.z = Math.max( p.z, P.zEnd + r * 0.6 );
			return;

		}

		if ( ! inDoor ) p.z = Math.max( p.z, DECK.boxFront + r );
		p.z = Math.min( p.z, this.bowWalk );
		const halfIn = Math.max( 0.12, this._walkWidth( p.z, Math.max( p.y, L.deckY ) ) - r * 0.75 );
		p.x = MathUtils.clamp( p.x, - halfIn, halfIn );

	}

	// inside her coamings at z, for feet at y: a table by z, at the heights she's walked at (the stations lean forward, and
	// asking the lines each frame would make sections)
	_walkWidth( z, y ) {

		const L = this.lines, T = this._walk || ( this._walk = WALK_YS.map( ( h ) => {

			const a = new Float32Array( WALK_N + 1 );
			for ( let i = 0; i <= WALK_N; i ++ ) a[ i ] = hullAt( L, L.zAft + i / WALK_N * L.length, h ) - L.shell;
			return a;

		} ) );
		let k = 0;
		while ( k < WALK_YS.length - 1 && y >= WALK_YS[ k + 1 ] - 0.02 ) k ++;
		const f = MathUtils.clamp( ( z - L.zAft ) / L.length, 0, 1 ) * WALK_N, i = Math.min( WALK_N - 1, Math.floor( f ) );
		return MathUtils.lerp( T[ k ][ i ], T[ k ][ i + 1 ], f - i );

	}

	// (Rough, axis-aligned in her frame, as a character's controller takes them)
	_buildColliders() {

		const L = this.lines, S = DECK.sole, boxes = [];
		const add = ( tag, x0, y0, z0, x1, y1, z1, walkable = false, solid = true ) => {

			const c = new Vector3( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 ), h = new Vector3( Math.abs( x1 - x0 ) / 2, Math.abs( y1 - y0 ) / 2, Math.abs( z1 - z0 ) / 2 );
			boxes.push( { tag, center: c, half: h, walkable, solid } );

		};

		const W = CONSOLE.halfW - 0.015;
		add( 'deck', - 1.2, S - 0.1, DECK.boxFront, 1.2, S, 2.7, true, false );
		add( 'console', - W, S, CONSOLE.back, W, CONSOLE.top, CONSOLE.front );
		// the seat on its front, a step up
		add( 'seat', - W, S, CONSOLE.front, W, S + 0.33, CONSOLE.front + 0.6, true );
		add( 'post', - POST.halfW, S, POST.z0, POST.halfW, S + 1.2, POST.z1 );
		add( 'rack', RACK.xs[ 0 ] - RACK.r, S, RACK.z - RACK.r, RACK.xs[ 3 ] + RACK.r, S + 0.8, POST.z0 );
		// the box across the transom, each side of its door, climbed for fishing off the stern
		const inX = L.halfBreadth( 0.05, 0.7 );
		add( 'aftBox', DECK.door[ 1 ], S, L.zAft, inX, DECK.boxTop, DECK.boxFront );
		add( 'aftBox', - inX, S, L.zAft, DECK.door[ 0 ], DECK.boxTop, DECK.boxFront );
		// the bow: the seats on each hand of the sunk sole; the riser; the foredeck in steps
		const B = DECK.bench, edge = 1.05;
		for ( let i = 0; i < 5; i ++ ) {

			const z0 = MathUtils.lerp( B.z0, 2.56, i / 5 ), z1 = MathUtils.lerp( B.z0, 2.56, ( i + 1 ) / 5 );
			const xi = 0.42 * ( 1 - ( ( z0 + z1 ) / 2 - B.z0 ) / ( 2.56 - B.z0 ) ) + 0.02;
			add( 'seat', xi, S, z0, edge, B.y, z1, true );
			add( 'seat', - edge, S, z0, - xi, B.y, z1, true );

		}

		add( 'seat', - edge, S, 2.56, edge, B.y, B.z1, true );
		add( 'foredeck', - 1, S, B.z1, 1, DECK.riser.y, DECK.riser.z1, true );
		// (a hop up onto the foredeck, its heights her sheer's)
		for ( const [ z0, z1 ] of [ [ DECK.riser.z1, 3.55 ], [ 3.55, 3.8 ], [ 3.8, 4.1 ] ] ) add( 'foredeck', - 1, S, z0, 1, L.sheerY( L.tAtSheerZ( ( z0 + z1 ) / 2 ) ) + 0.04, z1, true );
		add( 'roof', - TOP.halfW, TOP.under, TOP.z0, TOP.halfW, TOP.y + 0.05, TOP.z1 );
		return boxes;

	}

	// where rain gathers and runs off her: the T-top's edge, onto her deck or the sea (fx/Drips' places)
	dripPoints() {

		if ( ! this.fitted.tTop ) return [];
		const out = [], N = 22, L = this.lines;
		const cz = ( TOP.z0 + TOP.z1 ) / 2, hl = ( TOP.z1 - TOP.z0 ) / 2;
		for ( let i = 0; i < N; i ++ ) {

			const a = i / N * Math.PI * 2, s = Math.sin( a ), c = Math.cos( a );
			const x = Math.sign( s ) * Math.abs( s ) ** 0.55 * TOP.halfW * 0.98, z = cz + Math.sign( c ) * Math.abs( c ) ** 0.55 * hl * 0.98;
			out.push( x, TOP.y - 0.05, z, Math.abs( x ) > 0.8 ? L.sheerY( L.tAtSheerZ( z ) ) : L.deckY, ( i * 0.618 ) % 1, LANDS.DULL );

		}

		return out;

	}

	// -1..1, positive turns her to port: the wheel over, the engines' legs swung so their thrust pushes her stern to starboard
	setSteering( angle ) {

		const a = MathUtils.clamp( angle, - 1, 1 );
		this._steer = a;
		this.wheelMesh.rotation.z = - a * WHEEL_TURNS * Math.PI * 2;
		for ( const e of this.engines ) e.swivel.rotation.y = - a * STEER_MAX;

	}

	setThrottle( t ) {

		this._throttle = MathUtils.clamp( t, - 1, 1 );
		this.throttleMesh.rotation.x = this._throttle * THROTTLE_ANGLE;

	}

	// rad up from square to the water (its top toward her, the leg swung out aft)
	setTrim( a ) {

		this._trim = a;
		for ( const e of this.engines ) e.tilt.rotation.x = a;

	}

	update( dt ) {

		if ( ! ( dt > 0 ) ) return;
		this.group.updateWorldMatrix( true, false );
		this.group.matrixWorld.decompose( _p, _q, _s );
		this.swingCompass( dt, _q );

	}

	// (as the lobster boat's: BoatModel.swingCompass)
	swingCompass( dt, q ) {

		_v.set( 0, 0, 1 ).applyQuaternion( q );
		const her = Math.atan2( _v.x, _v.z ), north = Math.PI - VARIATION;
		const wrap = ( a ) => a - Math.PI * 2 * Math.round( a / ( Math.PI * 2 ) );
		const c = this._card || ( this._card = { a: north, w: 0, her } );
		const bowl = wrap( her - c.her ) / dt;
		c.her = her;
		const k = Math.PI * 2 / CARD.period, n = Math.max( 1, Math.ceil( dt / 0.02 ) ), h = dt / n;
		for ( let i = 0; i < n; i ++ ) {

			c.w += ( - k * k * wrap( c.a - north ) - 2 * CARD.damping * k * ( c.w - bowl ) ) * h;
			c.a = wrap( c.a + c.w * h );

		}

		this.compassMesh.rotation.y = c.a - her;

	}

	get compassHeading() {

		const c = this._card;
		return c ? ( ( c.a - c.her ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 ) : 0;

	}

}

