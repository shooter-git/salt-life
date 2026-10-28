import { Matrix4, Quaternion, Vector3 } from '../../engine/index.js';
import { mulberry32 } from '../../util/Noise.js';
import { pieceState, goesAt, WHOLE } from '../../game/StormDamage.js';
import { DAY_RATE, pace } from '../../game/IslandClock.js';

// (M14) The sheets a hurricane tears off the island's roofs, flying: a roof's corrugated sheets
// (Village.sheetFlyers), Joe's (FishStand) and Marta's sign board (Chandlery). Each goes the moment its
// wind's reached (StormDamage's pieceState: went, the same for everyone) and flies down the wind as a
// flat plate does, worked out once from where it lay, the wind then and its own draws (flightOf: pure,
// so the same for everyone, and for test/flying-sheets.mjs):
//   - the wind on it: the hurricane's (sustained, 10 m up) at its height over the ground (a log profile
//     over the village's roughness, z0 0.3 m), in the gust it went in (1.3x) falling to the mean wind
//     it's carried on, with eddies across and up and down; torn up out of its roof by the suction over
//     it, already turning, and over its own roof's ridge if it's pressed back onto it;
//   - the air on it: a flat plate's normal force (1.15 broadside, Hoerner), and, autorotating about its
//     length as torn sheets do (its spin parameter wc/2U 0.47: Skews 1990), a lift across the wind from
//     its spin (mean coefficient 0.15: Iversen 1979, Tachikawa 1983), one way or the other; its length
//     turning across the wind as it settles into its spin, wobbling;
//   - a corrugated sheet 4.2 kg/m^2 (0.5 mm steel), a sign board 14: Tachikawa's number about 18 for a
//     sheet in a 35 m/s wind: up to the wind's speed in under a second, 20 to 100 m before it's down
//     (Mejorin & Kopp 2024: sheathing ~100 m in 3 s in a 40 m/s gust; most a good deal less);
//   - a house in its way stops it dead (their footprints, below their roofs): down the wall it falls;
//   - on the ground it bounces once or twice, edge first, and lies where it ends, tilted a little on
//     whatever's under it (a roof's sheet is bent where it buckled: Village.sheetFlyers); in the sea it
//     sinks (steel) within a few seconds.
// Lying, it stays until it's cleared away with the wrack, a day to ten after the storm (clearAt).
//   const f = new FlyingSheets( { scene, terrain, windAt, walls } );
//   f.add( flyers )   ( [ { kind, id, sub, w, len, kgm2, frame (its centre and frame: x across, y out
//                       of its face, z along its length), mesh() } ] )
//   f.set( D, T )     (StormDamage's damageAt and the island's time, now and again)
//   f.update( T )     (each frame: the island's time, game hours)

export const FLIGHT = {
	rho: 1.22, // air (kg/m^3)
	dt: 1 / 120, keep: 4, // its step (s), and every this many kept (30 a second)
	max: 16, // s: at most
	cn: 1.15, // a flat plate's normal force coefficient, broadside
	magnus: 0.15, // its spin's lift coefficient
	suction: 0.12, // the roof's suction tearing it off: up out of it at this x the wind
	spin: 0.47, // its spin parameter, w c / 2U
	edge: 0.06, // the drag along its face
	gust: [ 1.3, 1.0 ], // the gust it goes in (a 3 s gust over the sustained wind), and the mean it's carried on
	z0: 0.3, // the village's roughness (m)
	bounce: 0.25, slide: 0.55, // on the ground: what's left of its fall and its run
	sink: 0.6, // m/s, in the sea
	clear: [ 30, 240 ], // game hours after the storm: cleared away with the wrack
};

const UP = new Vector3( 0, 1, 0 );
const _q = new Quaternion(), _v = new Vector3(), _w = new Vector3(), _a = new Vector3(), _f = new Vector3();
const _n = new Vector3(), _s = new Vector3(), _x = new Vector3(), _m = new Matrix4();

// its flight from frame (Matrix4: where it lay), w x len (m), kgm2; wind (m/s) blowing toward { x, y };
// sea: the water's height; ground( x, z ); walls: [ { x, z, r, top } ] (any it starts inside are its
// own: left out); seed. -> { t: [ s ], pos: Float32Array, quat: Float32Array, n, end ('ground' | 'sea'),
// at (s: when it came down), (M14) hits: Float32Array of [ s, what (HIT), x, y, z, speed (m/s) ] (each
// bounce and where it comes to rest, a wall it's thrown against, the sea it falls in: for their sounds) }
export function flightOf( { frame, w, len, kgm2, wind, toward, sea = 0, ground, walls = [], seed = 0.5 } ) {

	const F = FLIGHT, A = w * len, m = kgm2 * A, rnd = mulberry32( Math.floor( seed * 4294967296 ) >>> 0 );
	const p = new Vector3().setFromMatrixPosition( frame ), q = new Quaternion().setFromRotationMatrix( frame ), u = new Vector3();
	const d = new Vector3( toward.x, 0, toward.y ).normalize(), lat = new Vector3( - d.z, 0, d.x );
	const ph = Array.from( { length: 7 }, () => rnd() * Math.PI * 2 );
	const liftUp = rnd() < 0.8 ? 1 : - 1; // (its spin's lift up, or down: as it happens to turn)
	const bent = [ ( rnd() - 0.5 ) * 0.2, ( rnd() - 0.5 ) * 0.2 ];
	const own = walls.filter( ( c ) => Math.hypot( p.x - c.x, p.z - c.z ) < c.r ), y0 = p.y;
	const others = walls.filter( ( c ) => ! own.includes( c ) );
	// (torn up out of the roof by its suction, already turning)
	u.set( 0, 1, 0 ).applyQuaternion( q ).multiplyScalar( F.suction * wind * ( 0.7 + 0.6 * rnd() ) );
	if ( u.y < 0 ) u.negate();
	const T = [], P = [], Q = [], H = [];
	// (the ground hit again within 0.15 s is the same hit: a bounce that barely leaves it)
	let lastGround = - 1;
	const hit = ( what, speed ) => {

		if ( what === HIT.ground && t - lastGround < 0.15 ) return;
		if ( what === HIT.ground ) lastGround = t;
		H.push( t, what, p.x, p.y, p.z, speed );

	};
	const keep = ( t ) => {

		T.push( t );
		P.push( p.x, p.y, p.z );
		Q.push( q.x, q.y, q.z, q.w );

	};
	_s.set( 0, 0, 1 ).applyQuaternion( q );
	_a.crossVectors( UP, d );
	let spin = liftUp * ( _s.dot( _a ) >= 0 ? 1 : - 1 ) * F.spin * 2 * wind * Math.sqrt( Math.max( 0, 1 - _s.dot( d ) ** 2 ) ) / w, bounces = 0, end = null, at = F.max, i = 0, t = 0;
	keep( 0 );
	for ( ; t < F.max; i ++ ) {

		t += F.dt;
		const g0 = ground( p.x, p.z );
		_n.set( 0, 1, 0 ).applyQuaternion( q );
		_s.set( 0, 0, 1 ).applyQuaternion( q );
		_x.set( 1, 0, 0 ).applyQuaternion( q );
		if ( end === 'sea' ) {

			// (sinking, drifting a little, its spin dying)
			u.multiplyScalar( Math.exp( - 3 * F.dt ) );
			u.y = - F.sink;
			spin *= Math.exp( - 2 * F.dt );
			p.addScaledVector( u, F.dt );
			_q.setFromAxisAngle( _s, spin * F.dt );
			q.premultiply( _q ).normalize();
			if ( t > at + 3 ) break;
			if ( i % F.keep === 0 ) keep( t );
			continue;

		}

		// the wind where it is: its profile over the ground, the gust it went in falling to the mean, eddies
		const h = Math.max( 0.5, p.y - Math.max( g0, sea ) );
		const prof = Math.min( 1.15, Math.max( 0.35, Math.log( h / F.z0 ) / Math.log( 10 / F.z0 ) ) );
		const gust = F.gust[ 1 ] + ( F.gust[ 0 ] - F.gust[ 1 ] ) * Math.exp( - t / 2.5 ) + 0.15 * Math.sin( 1.3 * t + ph[ 0 ] ) + 0.1 * Math.sin( 3.7 * t + ph[ 1 ] );
		_w.copy( d ).multiplyScalar( wind * prof * gust )
			.addScaledVector( lat, wind * 0.12 * Math.sin( 0.9 * t + ph[ 2 ] ) )
			.addScaledVector( UP, wind * 0.06 * Math.sin( 1.7 * t + ph[ 3 ] ) * Math.min( 1, h / 3 ) )
			.sub( u );
		const speed = _w.length(), qd = 0.5 * F.rho * speed * speed;
		_f.set( 0, 0, 0 );
		if ( speed > 0.01 ) {

			_v.copy( _w ).divideScalar( speed );
			// its face's force: a flat plate's, as the air meets it
			const cosN = _v.dot( _n ), sa = Math.abs( cosN ), ca = Math.sqrt( Math.max( 0, 1 - sa * sa ) );
			_f.addScaledVector( _n, qd * A * F.cn * sa * ( 1 + 0.8 * ca ) * Math.sign( cosN ) );
			// its spin's lift, across the wind and its length
			const target = Math.max( 1e-3, F.spin * 2 * _a.copy( _w ).addScaledVector( _s, - _w.dot( _s ) ).length() / w );
			_a.crossVectors( _v, _s ).multiplyScalar( Math.sign( spin ) * Math.min( 1, Math.abs( spin ) / target ) );
			_f.addScaledVector( _a, qd * A * F.magnus );
			_f.addScaledVector( _v, qd * A * F.edge );

		}

		u.addScaledVector( _f, F.dt / m );
		u.y -= 9.81 * F.dt;
		const px = p.x, pz = p.z;
		p.addScaledVector( u, F.dt );
		// its spin about its length: toward its autorotation's, the way that lifts it up (or down)
		_a.crossVectors( UP, d );
		const wperp = _v.copy( _w ).addScaledVector( _s, - _w.dot( _s ) ).length();
		const sense = liftUp * ( _s.dot( _a ) >= 0 ? 1 : - 1 );
		spin += ( sense * F.spin * 2 * wperp / w - spin ) * Math.min( 1, F.dt / 0.3 );
		// its length turning across the wind; a wobble
		const yaw = - 4 * _s.dot( d ) * _a.crossVectors( UP, _s ).dot( d ) + 0.6 * Math.sin( 1.1 * t + ph[ 4 ] );
		_a.copy( _s ).multiplyScalar( spin ).addScaledVector( UP, yaw ).addScaledVector( _n, 0.8 * Math.sin( 2.1 * t + ph[ 5 ] ) );
		const om = _a.length();
		if ( om > 1e-6 ) {

			_q.setFromAxisAngle( _a.divideScalar( om ), om * F.dt );
			q.premultiply( _q ).normalize();

		}

		// its own roof under it while it's over it; a house in its way: stopped dead against its wall
		if ( p.y < y0 && own.some( ( c ) => Math.hypot( p.x - c.x, p.z - c.z ) < c.r ) ) {

			p.y = y0;
			u.y = Math.max( 0, u.y );

		}

		for ( const c of others ) {

			if ( p.y < c.top && Math.hypot( p.x - c.x, p.z - c.z ) < c.r ) {

				const speed = Math.hypot( u.x, u.z );
				if ( speed > 2 ) hit( HIT.wall, speed );
				p.x = px;
				p.z = pz;
				u.x *= - 0.15;
				u.z *= - 0.15;
				spin *= 0.3;
				break;

			}

		}

		// down: in the sea, it sinks; on the ground, it bounces, or lies where it ends
		const low = p.y - 0.5 * ( w * Math.abs( _x.y ) + len * Math.abs( _s.y ) );
		const g = ground( p.x, p.z );
		if ( g < sea - 0.25 && low < sea ) {

			end = 'sea';
			at = t;
			hit( HIT.sea, u.length() );

		} else if ( low < g ) {

			p.y += g - low;
			hit( HIT.ground, u.length() );
			if ( bounces < 2 && - u.y > 2.5 ) {

				u.y = - u.y * F.bounce;
				u.x *= F.slide;
				u.z *= F.slide;
				spin *= - 0.5;
				bounces ++;

			} else {

				end = 'ground';
				at = t;
				// (flat on the ground, its length as it lay, tilted a little over what's under it; its face up,
				// so where it's bent it rises off the ground)
				const e = 0.6, sx = ( ground( p.x + e, p.z ) - ground( p.x - e, p.z ) ) / ( 2 * e ), sz = ( ground( p.x, p.z + e ) - ground( p.x, p.z - e ) ) / ( 2 * e );
				const up = _n.set( - sx + bent[ 0 ], 1, - sz + bent[ 1 ] ).normalize();
				const along = _s.addScaledVector( up, - _s.dot( up ) ).normalize();
				if ( along.lengthSq() < 0.5 ) along.copy( d ).addScaledVector( up, - d.dot( up ) ).normalize();
				_x.crossVectors( up, along );
				q.setFromRotationMatrix( _m.makeBasis( _x, up, along ) );
				p.y = g + 0.04;
				keep( t );
				break;

			}

		}

		if ( i % F.keep === 0 ) keep( t );

	}

	if ( ! end ) {

		end = 'ground';
		at = t;

	}

	return { t: Float32Array.from( T ), pos: Float32Array.from( P ), quat: Float32Array.from( Q ), n: T.length, end, at, hits: Float32Array.from( H ) };

}

// ((M14) what a flight's hit: the ground (a bounce, or where it comes to rest), a wall, the sea; and how
// long after a sound's moment it's still heard (s))
export const HIT = { ground: 0, wall: 1, sea: 2 };
const HITS = [ 'ground', 'wall', 'sea' ], HEARD = 1.5;

// its pose s seconds into its flight: into pos (Vector3) and quat (Quaternion); false once it's sunk
export function poseAt( fl, s, pos, quat ) {

	const T = fl.t, n = fl.n;
	if ( s >= T[ n - 1 ] ) {

		pos.fromArray( fl.pos, ( n - 1 ) * 3 );
		quat.fromArray( fl.quat, ( n - 1 ) * 4 );
		return fl.end !== 'sea';

	}

	let lo = 0, hi = n - 1;
	while ( hi - lo > 1 ) {

		const mid = ( lo + hi ) >> 1;
		if ( T[ mid ] <= s ) lo = mid;
		else hi = mid;

	}

	const k = Math.max( 0, Math.min( 1, ( s - T[ lo ] ) / Math.max( 1e-6, T[ hi ] - T[ lo ] ) ) );
	pos.fromArray( fl.pos, lo * 3 ).lerp( _v.fromArray( fl.pos, hi * 3 ), k );
	quat.fromArray( fl.quat, lo * 4 ).slerp( _q.fromArray( fl.quat, hi * 4 ), k );
	return true;

}

// a hash of a string and an integer, 0..1
function hash01( key, a ) {

	let h = 0x811c9dc5;
	for ( let i = 0; i < key.length; i ++ ) h = Math.imul( h ^ key.charCodeAt( i ), 0x01000193 );
	h = Math.imul( h ^ ( a + 0x9e37 ), 0x01000193 );
	h ^= h >>> 15;
	h = Math.imul( h, 0x2c1b3c6d );
	h ^= h >>> 12;
	return ( h >>> 0 ) / 4294967296;

}

// real seconds into its flight at island time T (game hours), from when it went: the clock's pace then
export const flightSeconds = ( T, went ) => ( T - went ) / ( DAY_RATE * pace( ( ( went % 24 ) + 24 ) % 24 ) );

// when it's cleared away (game hours): with the wrack, a day to ten after its storm
export const clearAt = ( storm, key ) => storm.ends + FLIGHT.clear[ 0 ] + ( FLIGHT.clear[ 1 ] - FLIGHT.clear[ 0 ] ) * hash01( storm.key + key, 3 );

export class FlyingSheets {

	// terrain: TerrainData; windAt( T ) -> { wind, toward: { x, y }, surge }; walls: [ { x, z, r, top } ]
	constructor( { scene, terrain, windAt, walls = [] } ) {

		this.scene = scene;
		this.ground = ( x, z ) => terrain.heightAt( x, z );
		this.windAt = windAt;
		this.walls = walls;
		this.list = [];
		this._st = {};
		// ((M14) what's heard of them this frame (update): each going, each hit as it's seen to happen (none
		// that happened more than HEARD s ago, as when the clock's rested past it or a save's come back to it):
		// [ { what: 'tear' | 'ground' | 'wall' | 'sea', x, y, z, speed (m/s) } ]
		this.heard = [];

	}

	add( flyers ) {

		for ( const f of flyers ) this.list.push( { ...f, key: `${ f.kind }${ f.id }.${ f.sub }`, obj: null, flight: null, storm: null, went: 0, show: false } );

	}

	// which are off their roofs, or will be, and from when (each its flight, worked out as it's first
	// needed; one still on its roof shown from the moment it goes, between these)
	set( D, T ) {

		const st = this._st;
		for ( const f of this.list ) {

			pieceState( D, f.kind, f.id, st );
			let storm = st.storm, went = st.went;
			if ( st.state === WHOLE ) {

				const g = goesAt( D, f.kind, f.id );
				storm = g !== null ? D.storm : null;
				went = g;

			}

			f.show = !! storm && T < clearAt( storm, f.key );
			if ( ! f.show ) continue;
			if ( f.storm !== storm.key ) {

				f.storm = storm.key;
				// (a run of sheets peels off one after another, a second or so apart)
				f.went = went + f.sub * 1.2 * DAY_RATE * pace( ( ( went % 24 ) + 24 ) % 24 );
				f.flight = null;

			}

		}

	}

	update( T ) {

		let made = 0;
		this.heard.length = 0;
		for ( const f of this.list ) {

			const s = f.show ? flightSeconds( T, f.went ) : - 1, was = f.s;
			f.s = s;
			const heard = ( at ) => was !== undefined && was < at && at <= s && s - at < HEARD;
			if ( heard( 0 ) ) this.heard.push( { what: 'tear', x: f.frame.elements[ 12 ], y: f.frame.elements[ 13 ], z: f.frame.elements[ 14 ], speed: 0 } );
			if ( s < 0 ) {

				if ( f.obj ) f.obj.visible = false;
				continue;

			}

			if ( ! f.flight ) {

				// (a few worked out a frame, at most)
				if ( made ++ > 3 ) continue;
				const w = this.windAt( f.went );
				f.flight = flightOf( { frame: f.frame, w: f.w, len: f.len, kgm2: f.kgm2, wind: w.wind, toward: w.toward, sea: w.surge, ground: this.ground, walls: this.walls, seed: hash01( f.storm + f.key, 7 ) } );

			}

			const H = f.flight.hits;
			for ( let k = 0; k < H.length; k += 6 ) if ( heard( H[ k ] ) ) this.heard.push( { what: HITS[ H[ k + 1 ] ], x: H[ k + 2 ], y: H[ k + 3 ], z: H[ k + 4 ], speed: H[ k + 5 ] } );
			if ( ! f.obj ) {

				f.obj = f.mesh();
				f.obj.matrixAutoUpdate = false;
				this.scene.add( f.obj );

			}

			const on = poseAt( f.flight, s, _v, _q );
			f.obj.visible = on;
			if ( on ) f.obj.matrix.compose( _v, _q, _s.set( 1, 1, 1 ) );

		}

	}

	dispose() {

		for ( const f of this.list ) if ( f.obj ) this.scene.remove( f.obj );
		this.list = [];

	}

}
