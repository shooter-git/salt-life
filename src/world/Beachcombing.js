import { Mesh, Group, MeshStandardMaterial, DoubleSide } from '../engine/index.js';
import { Builder, Part } from './village/GeoBuilder.js';
import { Matrix4 } from '../engine/index.js';
import { mulberry32 } from '../util/Noise.js';
import { HARD, lin } from './Props.js';
import { branch, shell, husk, coconut, bottle, floatBuoy } from './debris/DebrisShapes.js';
import { BEACHES } from '../game/Beachcomb.js';

// (M15) Beachcombing's world (game/Beachcomb.js says what washes up, where along each beach, which day):
//   - the north beach's wrack line: the sargassum the trades bring in every day (the Caribbean's windward
//     beaches have had heavy sargassum since 2011), its scraps, twigs, husks and shells along its high-water
//     line (the twigs and the rest the beach debris's shapes, debris/DebrisShapes.js), built a stretch at a
//     time as you come near it;
//   - each find on the sand, made when it washes up and taken away when it's picked up or has gone: driftwood,
//     floats and pot buoys (the debris's), a corked bottle; the sea beans (a sea heart, a hamburger bean, a
//     grey nickernut, a Mary's bean), a glass float in its rope net and a lump of ambergris, made here.
// Each beach's line is where the ground first rises over its height (BEACHES' `line`), walking up it from the
// water (from the land, a hollow behind the beach was taken for it; from the sea, a bar offshore).
//   const b = new Beachcombing( { terrain, materials: { nature, wood, hard }, parent } )
//   b.set( finds )   (what's on the sand now: game/Beachcomb.lying less what you've picked up)
//   b.at( f ) -> [ x, z ] where a find lies     b.nearest( x, z, r ) -> the nearest find within r, or null
//   b.update( camera )

const RANGE = 140; // m: drawn within this
const WRACK = { seg: 12, past: 4 }; // the wrack line's stretches; m past the finds' beach at each end
// (each beach's line walked up from the water: dir the way up the beach)
const WALK = { north: { from: - 905, dir: 1 }, bay: { from: - 12, dir: - 1 } };
const PIER_X = 55;
const TAU = Math.PI * 2;

export class Beachcombing {

	constructor( { terrain, materials, parent, lite = false } ) {

		this.terrain = terrain;
		this.ground = ( x, z ) => terrain.heightAt( x, z );
		// (and the glass float's glass: sea-green, clear, the sand seen through it)
		this.glass = new MeshStandardMaterial( { color: 0x6fae98, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide, name: 'FloatGlass' } );
		this.materials = { ...materials, glass: this.glass };
		this.group = new Group();
		this.group.name = 'Beachcombing';
		parent.add( this.group );
		this.lite = lite;
		this.finds = new Map(); // id -> { f, x, z, meshes }
		this._lines = {};
		this._walks = {};
		this.wrack = []; // the wrack line's meshes, built a stretch at a time as you come near it (_wrack)
		this._built = new Array( WRACK.seg ).fill( false );

	}

	// where a beach's high-water line is at x: walking up from the water, the first ground over its height; where
	// the beach is too low or too gentle to reach it, as it runs on either side
	lineAt( beach, x ) {

		const key = `${ beach }:${ Math.round( x * 2 ) }`;
		if ( this._lines[ key ] !== undefined ) return this._lines[ key ];
		let [ z, reached ] = this._walkUp( beach, x );
		if ( ! reached ) {

			let a = null, b = null;
			for ( let k = 1; k <= 30 && ! ( a && b ); k ++ ) {

				if ( ! a ) { const w = this._walkUp( beach, x - k ); if ( w[ 1 ] ) a = [ x - k, w[ 0 ] ]; }
				if ( ! b ) { const w = this._walkUp( beach, x + k ); if ( w[ 1 ] ) b = [ x + k, w[ 0 ] ]; }

			}

			if ( a && b ) z = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * ( x - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] );
			else if ( a || b ) z = ( a || b )[ 1 ];

		}

		return ( this._lines[ key ] = z );

	}

	// -> [ z, reached ]: up from the water at x to the first ground over the line's height; or, not reached in
	// 26 m of beach, some 9 m up it (the swash's top)
	_walkUp( beach, x ) {

		const key = `${ beach }:${ Math.round( x * 2 ) }`;
		if ( this._walks[ key ] ) return this._walks[ key ];
		const W = WALK[ beach ], H = BEACHES[ beach ].line;
		let z = W.from, wet = null, reached = false;
		for ( let k = 0; k < 600; k ++, z += W.dir * 0.25 ) {

			const h = this.ground( x, z );
			if ( h > H ) {

				reached = true;
				break;

			}

			// (the beach from where the ground's last out of the sea: not a bar offshore, with a lagoon behind it)
			if ( h <= 0 ) wet = null;
			else if ( wet === null ) wet = z;
			if ( wet !== null && ( z - wet ) * W.dir > 26 ) {

				z = wet + W.dir * 9;
				break;

			}

		}

		return ( this._walks[ key ] = [ z, reached ] );

	}

	at( f ) {

		const B = BEACHES[ f.beach ], x = B.x[ 0 ] + ( B.x[ 1 ] - B.x[ 0 ] ) * f.u;
		// (off: + up the beach, toward the land)
		return [ x, this.lineAt( f.beach, x ) + WALK[ f.beach ].dir * f.off ];

	}

	nearest( x, z, r ) {

		let best = null, bd = r;
		for ( const F of this.finds.values() ) {

			const d = Math.hypot( F.x - x, F.z - z );
			if ( d < bd ) {

				bd = d;
				best = F.f;

			}

		}

		return best;

	}

	set( list ) {

		const want = new Set( list.map( ( f ) => f.id ) );
		for ( const [ id, F ] of this.finds ) if ( ! want.has( id ) ) {

			for ( const m of F.meshes ) {

				this.group.remove( m );
				m.geometry.dispose();

			}

			this.finds.delete( id );

		}

		// (the older first (lying's order): a newer one that's washed up on one already there lies a step along the
		// line from it)
		for ( const f of list ) if ( ! this.finds.has( f.id ) ) {

			let [ x, z ] = this.at( f );
			// (not under the pier)
			if ( f.beach === 'bay' && Math.abs( x - PIER_X ) < 3 ) x += x < PIER_X ? - 3 : 3;
			for ( let k = 0; k < 8 && this.nearest( x, z, 0.5 ); k ++ ) {

				x += 0.6;
				z = this.lineAt( f.beach, x ) + WALK[ f.beach ].dir * f.off;

			}

			this.finds.set( f.id, { f, x, z, meshes: this._make( f, x, z ) } );

		}

	}

	update( camera ) {

		const c = camera.position;
		for ( const F of this.finds.values() ) for ( const m of F.meshes ) m.visible = Math.hypot( F.x - c.x, F.z - c.z ) < RANGE;
		// (the wrack line's next stretch within reach, one a frame)
		const B = BEACHES.north, x0 = B.x[ 0 ] - WRACK.past, span = ( B.x[ 1 ] - B.x[ 0 ] + 2 * WRACK.past ) / WRACK.seg;
		for ( let i = 0; i < WRACK.seg; i ++ ) if ( ! this._built[ i ] ) {

			const x = x0 + ( i + 0.5 ) * span;
			if ( Math.hypot( x - c.x, this.lineAt( 'north', x ) - c.z ) > RANGE + span ) continue;
			this._built[ i ] = true;
			this.wrack.push( ...this._wrack( i ) );
			break;

		}

		for ( const m of this.wrack ) m.visible = Math.hypot( m.userData.x - c.x, m.userData.z - c.z ) < RANGE + m.userData.r;

	}

	// a find's shape on the sand, its meshes
	_make( f, x, z ) {

		const B = new Builder(), g = this.ground, rand = mulberry32( f.seed );
		switch ( f.kind ) {

			case 'driftwood': branch( B, g, x, z, f.yaw, 0.7 + rand() * 0.7, 0.035 + rand() * 0.025, rand, { twigs: 1 + Math.floor( rand() * 2 ) } ); break;
			case 'trawlFloat': floatBuoy( B, g, x, z, rand, { kind: 1 } ); break;
			case 'potBuoy': floatBuoy( B, g, x, z, rand, { kind: 0 } ); break;
			case 'bottle': {

				bottle( B, g, x, z, rand );
				break;

			}

			case 'glassFloat': glassFloat( B, g, x, z, rand ); break;
			case 'ambergris': ambergris( B, g, x, z, rand ); break;
			default: seaBean( B, g, x, z, f.kind, f.yaw, rand );

		}

		return this._meshes( B, `find_${ f.kind }`, x, z, true );

	}

	_meshes( B, name, x, z, shadow ) {

		const out = [];
		for ( const [ key, b ] of Object.entries( B.batches ) ) {

			if ( ! b || b.vcount === 0 || ! this.materials[ key ] ) continue;
			const geo = b.build();
			geo.computeBoundingSphere();
			const m = new Mesh( geo, this.materials[ key ] );
			m.name = name;
			m.matrixAutoUpdate = false;
			m.castShadow = shadow && ! this.lite;
			m.receiveShadow = true;
			const sp = geo.boundingSphere;
			m.userData = { x: x ?? sp.center.x, z: z ?? sp.center.z, r: sp.radius };
			this.group.add( m );
			out.push( m );

		}

		return out;

	}

	// the north beach's wrack line, its i'th stretch: as the sargassum lies on the Caribbean's windward beaches,
	// a band of tangled clumps (10 to 50 cm, its air bladders, its golden fronds going black as they dry) heaped
	// thicker in banks and thinning between, its scraps strewn through it, twigs, a husk or a shell; the day's
	// line fresh, the older lines higher up the beach drier and sparser. Each stretch its own random stream (the
	// same whichever's built first)
	_wrack( i ) {

		const B = BEACHES.north, rand = mulberry32( 6113 + i * 977 ), g = this.ground, span = ( B.x[ 1 ] - B.x[ 0 ] + 2 * WRACK.past ) / WRACK.seg;
		const x0 = B.x[ 0 ] - WRACK.past + i * span, x1 = x0 + span, Bk = new Builder(), W = new Weed( g, rand, this.lite );
		const bankAt = ( x ) => Math.sin( x * 0.17 + Math.sin( x * 0.041 ) * 2.1 ) * 0.5 + 0.5;
		// the clumps, the twigs, a husk or a shell
		const step = this.lite ? 0.6 : 0.32;
		for ( let x = x0; x < x1; x += step * ( 0.6 + rand() * 0.8 ) ) {

			const z0 = this.lineAt( 'north', x ), bank = bankAt( x );
			for ( let q = 0; q < 4; q ++ ) {

				// (the day's line thickest, banked up where the swash left the most (two clumps); then two older ones up
				// the beach)
				const row = Math.max( 0, q - 1 ), keep = q === 0 ? 0.5 + 0.5 * bank : q === 1 ? bank * 0.6 : row === 1 ? 0.15 + 0.35 * bank : 0.12;
				if ( rand() > keep || ( this.lite && row === 2 ) ) continue;
				const across = row === 0 ? ( rand() - 0.5 ) * ( 0.5 + bank * 0.7 ) : row * ( 1.1 + rand() * 0.9 ) + ( rand() - 0.5 ) * 0.5;
				const wx = x + ( rand() - 0.5 ) * step, wz = z0 + across, dry = Math.min( 1, row * 0.38 + rand() * 0.22 );
				if ( g( wx, wz ) < 0.7 ) continue;
				const r = rand();
				if ( r < 0.9 ) W.clump( wx, wz, row ? 0.08 + rand() * 0.12 : 0.1 + rand() * 0.2 * ( 0.5 + bank ), 0.03 + rand() * 0.06 * ( row ? 0.4 : 0.4 + bank ), dry );
				else if ( r < 0.96 ) branch( Bk, g, wx, wz, rand() * TAU, 0.2 + rand() * 0.45, 0.008 + rand() * 0.012, rand, { twigs: 0 } );
				else if ( r < 0.98 ) husk( Bk, g, wx, wz, rand );
				else if ( r < 0.995 ) shell( Bk, g, wx, wz, 0.03 + rand() * 0.04, rand );
				else coconut( Bk, g, wx, wz, rand );

			}

		}

		// the scraps strewn along the lines (from a few metres off, what makes them a line)
		const fine = this.lite ? 0.12 : 0.04;
		for ( let x = x0; x < x1; x += fine * ( 0.5 + rand() ) ) {

			const z0 = this.lineAt( 'north', x ), bank = bankAt( x );
			for ( let row = 0; row < 3; row ++ ) {

				if ( rand() > ( row === 0 ? 0.55 + 0.45 * bank : row === 1 ? 0.3 : 0.15 ) || ( this.lite && row === 2 ) ) continue;
				const sx = x + ( rand() - 0.5 ) * fine, sz = z0 + ( row === 0 ? ( rand() + rand() - 1 ) * ( 0.45 + bank * 0.9 ) : row * ( 1.1 + rand() * 0.9 ) + ( rand() + rand() - 1 ) * 0.4 );
				if ( g( sx, sz ) < 0.7 ) continue;
				W.scrap( sx, sz, Math.min( 1, row * 0.38 + rand() * 0.4 ) );

			}

		}

		W.flush( Bk );
		return this._meshes( Bk, 'north_wrack', null, null, false );

	}

	dispose() {

		this.set( [] );
		for ( const m of this.wrack ) {

			this.group.remove( m );
			m.geometry.dispose();

		}

		this.glass.dispose();
		this.group.removeFromParent();

	}

}

// ---- the sargassum (Sargassum fluitans and natans, after photographs of the Caribbean's windward beaches): short
// stems tangled in heaps, each lined with lance-shaped, serrated leaves 2 to 4 cm long, and the round air
// bladders (4 or 5 mm) it floats on; and its scraps strewn between, broken off in the surf. Golden brown fresh,
// going olive, dark brown and black as it dries (`dry` 0..1). Built up a stretch of the line at a time into
// one mesh (the village's hard material, coloured by vertex)
//   const w = new Weed( ground, rand, lite ); w.clump( x, z, r, h, dry ); w.scrap( x, z, dry ); w.flush( B )
const SARG = { fresh: lin( 0xa8762a ), olive: lin( 0x6e5a24 ), brown: lin( 0x44301a ), black: lin( 0x1e1610 ), bladder: lin( 0xb08232 ) };
const _I = new Matrix4();
class Weed {

	constructor( ground, rand, lite ) {

		this.ground = ground;
		this.rand = rand;
		this.lite = lite;
		this.p = [];
		this.n = [];
		this.uv = [];
		this.idx = [];
		this.col = [];

	}

	// a piece's colour, each its own
	tone( dry ) {

		const d = Math.min( 1, Math.max( 0, dry + ( this.rand() - 0.5 ) * 0.35 ) );
		const a = d < 0.33 ? SARG.fresh : d < 0.66 ? SARG.olive : d < 0.85 ? SARG.brown : SARG.black;
		const b = d < 0.33 ? SARG.olive : d < 0.66 ? SARG.brown : SARG.black;
		const t = ( d % 0.33 ) / 0.33, k = 0.85 + this.rand() * 0.3;
		return [ ( a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t ) * k, ( a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t ) * k, ( a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ) * k ];

	}

	// a vertex; its normal tipped ( tx, tz ) off straight up (the leaves lie every way, catching the light each
	// its own)
	vert( px, py, pz, c, tx = 0, tz = 0 ) {

		const l = Math.hypot( tx, 1, tz );
		this.p.push( px, py, pz );
		this.n.push( tx / l, 1 / l, tz / l );
		this.uv.push( px, pz );
		this.col.push( c );
		return this.p.length / 3 - 1;

	}

	// a leaf at ( lx, ly, lz ), pointing la: lance-shaped (narrow at both ends), toothed at the edge (a jag)
	leaf( lx, ly, lz, la, dry ) {

		const rand = this.rand, L = 0.02 + rand() * 0.022, W = 0.0028 + rand() * 0.002, lc = this.tone( dry );
		const dx = Math.cos( la ), dz = Math.sin( la ), sx = - dz, sz = dx, lift = ( rand() - 0.3 ) * 0.012;
		const tx = ( rand() - 0.5 ) * 1.4, tz = ( rand() - 0.5 ) * 1.4;
		const tip = this.vert( lx + dx * L, ly + lift, lz + dz * L, lc, tx, tz ), base = this.vert( lx, ly, lz, lc, tx, tz );
		const s1 = this.vert( lx + dx * L * 0.4 + sx * W, ly + lift * 0.4, lz + dz * L * 0.4 + sz * W, lc, tx, tz );
		const s2 = this.vert( lx + dx * L * 0.62 - sx * W * 1.1, ly + lift * 0.62, lz + dz * L * 0.62 - sz * W * 1.1, lc, tx, tz );
		const s3 = this.vert( lx + dx * L * 0.3 - sx * W * 0.8, ly + lift * 0.3, lz + dz * L * 0.3 - sz * W * 0.8, lc, tx, tz );
		this.idx.push( base, s1, tip, base, tip, s2, base, s2, s3 );

	}

	// a stem from ( px, pz ) heading a, segs pieces len m long, its leaves along it and an air bladder now and
	// then; yAt( x, z ): what it lies on
	stem( px, pz, a, segs, len, leaves, dry, yAt ) {

		const rand = this.rand;
		for ( let k = 0; k < segs; k ++ ) {

			a += ( rand() - 0.5 ) * 1.2;
			const qx = px + Math.cos( a ) * len, qz = pz + Math.sin( a ) * len;
			// (the stem: a thin flat strip)
			const c = this.tone( dry ), w = 0.0018, ox = - Math.sin( a ) * w, oz = Math.cos( a ) * w;
			const y0 = yAt( px, pz ), y1 = yAt( qx, qz ), tx = ( rand() - 0.5 ) * 0.6, tz = ( rand() - 0.5 ) * 0.6;
			const i0 = this.vert( px - ox, y0, pz - oz, c, tx, tz ), i1 = this.vert( px + ox, y0, pz + oz, c, tx, tz );
			const i2 = this.vert( qx + ox, y1, qz + oz, c, tx, tz ), i3 = this.vert( qx - ox, y1, qz - oz, c, tx, tz );
			this.idx.push( i0, i2, i1, i0, i3, i2 );
			for ( let l = 0; l < leaves; l ++ ) {

				const t = rand(), lx = px + ( qx - px ) * t, lz = pz + ( qz - pz ) * t;
				this.leaf( lx, yAt( lx, lz ) + 0.002, lz, a + ( rand() < 0.5 ? 1 : - 1 ) * ( 0.5 + rand() * 0.9 ), dry );

			}

			if ( ! this.lite && rand() < 0.4 ) {

				const br = 0.0022 + rand() * 0.0012, bx = qx + ( rand() - 0.5 ) * 0.01, bz = qz + ( rand() - 0.5 ) * 0.01, by = yAt( bx, bz ) + br, bc = dry < 0.5 ? SARG.bladder : this.tone( dry );
				const top = this.vert( bx, by + br, bz, bc ), ring = [];
				for ( let q = 0; q < 4; q ++ ) ring.push( this.vert( bx + Math.cos( q * Math.PI / 2 ) * br, by, bz + Math.sin( q * Math.PI / 2 ) * br, bc, Math.cos( q * Math.PI / 2 ) * 1.5, Math.sin( q * Math.PI / 2 ) * 1.5 ) );
				for ( let q = 0; q < 4; q ++ ) this.idx.push( top, ring[ ( q + 1 ) % 4 ], ring[ q ] );

			}

			px = qx;
			pz = qz;

		}

	}

	// a clump: its weed matted in a heap (highest in the middle, its edge lobed, its top lumpy), dark (the
	// shade between the leaves); loose leaves over it; its stems tangled over it and out past its edge. r: its radius, h: its
	// heap's height (m)
	clump( x, z, r, h, dry ) {

		const rand = this.rand, ground = this.ground, lite = this.lite;
		const N = lite ? 9 : 13, lobe = [], aspect = 1 + rand() * 0.7, rot = rand() * TAU, lump = rand() * 100;
		for ( let i = 0; i < N; i ++ ) lobe.push( 0.55 + rand() * 0.5 );
		const edgeAt = ( a ) => {

			const f = ( ( ( a - rot ) / TAU % 1 ) + 1 ) % 1 * N, i = Math.floor( f ), t = f - i, e = lobe[ i ] + ( lobe[ ( i + 1 ) % N ] - lobe[ i ] ) * t * t * ( 3 - 2 * t );
			const c = Math.cos( a - rot ), s = Math.sin( a - rot );
			return r * e / Math.hypot( c / aspect, s );

		};
		const heapAt = ( px, pz ) => {

			const dx = px - x, dz = pz - z, q = Math.hypot( dx, dz ) / edgeAt( Math.atan2( dz, dx ) );
			return h * Math.max( 0, 1 - q * q ) * ( 0.7 + 0.3 * Math.sin( dx * 61 + lump ) * Math.sin( dz * 53 + lump ) );

		};
		const yAt = ( px, pz ) => ground( px, pz ) + heapAt( px, pz ) + 0.004;
		const shade = ( c ) => [ c[ 0 ] * 0.45, c[ 1 ] * 0.45, c[ 2 ] * 0.45 ];
		const ring = ( k ) => {

			const out = [];
			for ( let i = 0; i < N * 2; i ++ ) {

				const a = rot + i / ( N * 2 ) * TAU, e = edgeAt( a ) * k, px = x + Math.cos( a ) * e, pz = z + Math.sin( a ) * e;
				out.push( this.vert( px, ground( px, pz ) + heapAt( px, pz ) * 0.92 + 0.003, pz, shade( this.tone( dry ) ), ( rand() - 0.5 ) * 0.8, ( rand() - 0.5 ) * 0.8 ) );

			}

			return out;

		};
		const mid = this.vert( x, ground( x, z ) + heapAt( x, z ) * 0.92 + 0.003, z, shade( this.tone( dry ) ) );
		const r1 = ring( 0.38 ), r2 = ring( 0.66 ), M = N * 2;
		for ( let i = 0; i < M; i ++ ) {

			const j = ( i + 1 ) % M;
			this.idx.push( mid, r1[ j ], r1[ i ], r1[ i ], r1[ j ], r2[ j ], r1[ i ], r2[ j ], r2[ i ] );

		}

		const big = Math.min( 1.8, Math.max( 0.7, r / 0.16 ) );
		for ( let l = 0, nl = Math.round( ( lite ? 6 : 18 ) * big * big ); l < nl; l ++ ) {

			const a = rand() * TAU, e = edgeAt( a ) * Math.sqrt( rand() ) * 0.8, lx = x + Math.cos( a ) * e, lz = z + Math.sin( a ) * e;
			this.leaf( lx, yAt( lx, lz ) + 0.002, lz, rand() * TAU, dry );

		}

		const stems = Math.round( ( lite ? 5 : 9 + rand() * 4 ) * big );
		for ( let s = 0; s < stems; s ++ ) {

			const a = s / stems * TAU + ( rand() - 0.5 ) * 0.8, d = r * 0.25 * rand();
			this.stem( x + Math.cos( a ) * d, z + Math.sin( a ) * d, a, 2, edgeAt( a ) * ( 0.45 + rand() * 0.5 ) / 2, lite ? 2 : 3, dry, yAt );

		}

	}

	// a scrap on the sand: a lone leaf, a bit of a stem with its leaves, or a little tuft
	scrap( x, z, dry ) {

		const rand = this.rand, k = rand(), yAt = ( px, pz ) => this.ground( px, pz ) + 0.003;
		if ( k < 0.5 ) this.leaf( x, yAt( x, z ), z, rand() * TAU, dry );
		else if ( k < 0.85 ) this.stem( x, z, rand() * TAU, 1 + Math.floor( rand() * 2 ), 0.025 + rand() * 0.02, 2, dry, yAt );
		else for ( let l = 0, n = 4 + Math.floor( rand() * 4 ); l < n; l ++ ) this.leaf( x + ( rand() - 0.5 ) * 0.04, yAt( x, z ) + rand() * 0.006, z + ( rand() - 0.5 ) * 0.04, rand() * TAU, dry );

	}

	flush( B ) {

		if ( ! this.idx.length ) return;
		const col = this.col;
		B.add( 'hard', new Part( this.p, this.n, this.uv, this.idx ), _I, ( vx, vy, vz, i ) => col[ i ], HARD( 0.37, 0, 0, 0.62 ) );

	}

}

// ---- the finds made here

// a sea bean, lying on the sand: a lens of seed coat, glossy (each its own: Gunn & Dennis's World Guide to
// Tropical Drift Seeds and Fruits)
//   seaHeart: Entada gigas, a flattened heart 4-6 cm, chestnut brown
//   hamburgerBean: Mucuna, a round lens 2.5-3 cm, near black, a pale band round its rim (the "bun")
//   nickernut: Caesalpinia bonduc, a grey marble 1.8 cm, faintly ringed
//   marysBean: Merremia discoidesperma, 2.5 cm, black-brown, a cross worn into one face
function seaBean( B, ground, x, z, kind, yaw, rand ) {

	const g = ground( x, z );
	const lens = ( r, t ) => {

		const prof = [];
		for ( let k = 0; k <= 8; k ++ ) {

			const a = - Math.PI / 2 + k / 8 * Math.PI;
			prof.push( [ Math.max( 0.0005, Math.cos( a ) * r ), Math.sin( a ) * t ] );

		}

		return prof;

	};
	if ( kind === 'seaHeart' ) {

		const s = 0.9 + rand() * 0.3, c = lin( 0x5a3418 );
		B.lathe( 'hard', x, g + 0.009 * s, z, lens( 0.025, 0.009 ), { segs: 14, ry: yaw, rz: Math.PI / 2 * 0, sx: s, sy: s, sz: s * 0.86, tint: ( px, py ) => c.map( ( v ) => v * ( 0.85 + 0.25 * Math.abs( py ) / 0.009 ) ), data: HARD( rand(), 0, 0, 0.28 ) } );

	} else if ( kind === 'hamburgerBean' ) {

		const dark = lin( 0x24160f ), band = lin( 0xb59a6a ), hilum = lin( 0x0c0806 );
		B.lathe( 'hard', x, g + 0.008, z, lens( 0.014, 0.008 ), { segs: 14, ry: yaw, rx: Math.PI / 2, tint: ( px, py ) => Math.abs( py ) < 0.0014 ? hilum : Math.abs( py ) < 0.0032 ? band : dark, data: HARD( rand(), 0, 0, 0.3 ) } );

	} else if ( kind === 'nickernut' ) {

		const c = lin( 0x8c8a82 );
		B.lathe( 'hard', x, g + 0.008, z, lens( 0.009, 0.009 ), { segs: 12, ry: yaw, tint: ( px, py ) => c.map( ( v ) => v * ( Math.abs( Math.sin( py * 900 ) ) < 0.15 ? 0.8 : 1 ) ), data: HARD( rand(), 0, 0, 0.45 ) } );

	} else {

		const c = lin( 0x2a1a12 ), cross = lin( 0x6a5038 );
		B.lathe( 'hard', x, g + 0.007, z, lens( 0.0125, 0.0068 ), { segs: 14, ry: yaw, tint: ( px, py, pz ) => py > 0.004 && ( Math.abs( px ) < 0.0012 || Math.abs( pz ?? 0 ) < 0.0012 ) ? cross : c, data: HARD( rand(), 0, 0, 0.3 ) } );

	}

}

// a blown-glass fishing float, 25 cm, sea-green, in a net of tarred rope gone grey, half sunk in the sand
function glassFloat( B, ground, x, z, rand ) {

	const g = ground( x, z ), R = 0.12 + rand() * 0.02, cord = lin( 0x6e6556 );
	const prof = [];
	for ( let k = 0; k <= 10; k ++ ) {

		const a = - Math.PI / 2 + k / 10 * Math.PI;
		prof.push( [ Math.max( 0.001, Math.cos( a ) * R ), Math.sin( a ) * R ] );

	}

	const y = g + R * 0.8, yaw = rand() * TAU;
	B.lathe( 'glass', x, y, z, prof, { segs: 20, ry: yaw } );
	// (its net: cords round it each way, and its knotted top)
	for ( let k = 0; k < 4; k ++ ) B.torus( 'hard', x, y, z, R * 1.03, 0.0045, { ry: yaw + k * Math.PI / 4, radial: 5, tubular: 26, tint: cord, data: HARD( rand(), 0, 0, 0.9 ) } );
	B.torus( 'hard', x, y + R * 0.5, z, R * 0.9, 0.0045, { rx: Math.PI / 2, radial: 5, tubular: 24, tint: cord, data: HARD( rand(), 0, 0, 0.9 ) } );
	B.torus( 'hard', x, y, z, R * 1.03, 0.0045, { rx: Math.PI / 2, radial: 5, tubular: 26, tint: cord, data: HARD( rand(), 0, 0, 0.9 ) } );

}

// a lump of ambergris, as it's found on a beach after years afloat: one rounded, knobbly lump (10-20 cm),
// waxy, creamy grey marbled with darker grey, pitted, its crust weathered
function ambergris( B, ground, x, z, rand ) {

	const g = ground( x, z ), R = 0.06 + rand() * 0.035, ph = [ rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU ];
	const cream = lin( 0xd4cbb2 ), grey = lin( 0x9c937f ), pit = lin( 0x625b50 );
	const NA = 16, NB = 9, p = [], n = [], uv = [], idx = [], col = [];
	// (its surface: a flattened ball, lumped by a few waves round it and over it)
	const at = ( u, v ) => {

		const th = u * TAU, la = - Math.PI / 2 + v * Math.PI;
		const k = 1 + 0.16 * Math.sin( 3 * th + ph[ 0 ] ) * Math.cos( la * 2 ) + 0.09 * Math.sin( 5 * th + ph[ 1 ] + la * 3 ) + 0.03 * Math.sin( 7 * th + ph[ 2 ] ) * Math.sin( 4 * la + ph[ 3 ] );
		const r = R * k * ( 1.25 + 0.2 * Math.cos( th - ph[ 0 ] ) );
		return [ Math.cos( th ) * Math.cos( la ) * r, Math.max( - 0.3, Math.sin( la ) ) * R * k * 0.75, Math.sin( th ) * Math.cos( la ) * r ];

	};
	for ( let j = 0; j <= NB; j ++ ) for ( let i = 0; i <= NA; i ++ ) {

		const u = i / NA, v = j / NB, q = at( u, v ), e = 0.002;
		const a1 = at( u + e, v ), a2 = at( u, Math.min( 1, v + e ) ), b2 = at( u, Math.max( 0, v - e ) );
		const tu = [ a1[ 0 ] - q[ 0 ], a1[ 1 ] - q[ 1 ], a1[ 2 ] - q[ 2 ] ], tv = [ a2[ 0 ] - b2[ 0 ], a2[ 1 ] - b2[ 1 ], a2[ 2 ] - b2[ 2 ] ];
		let nx = tv[ 1 ] * tu[ 2 ] - tv[ 2 ] * tu[ 1 ], ny = tv[ 2 ] * tu[ 0 ] - tv[ 0 ] * tu[ 2 ], nz = tv[ 0 ] * tu[ 1 ] - tv[ 1 ] * tu[ 0 ];
		const nl = Math.hypot( nx, ny, nz ) || 1;
		if ( j === 0 || j === NB ) { nx = 0; ny = j ? 1 : - 1; nz = 0; } else { nx /= nl; ny /= nl; nz /= nl; }
		p.push( x + q[ 0 ], g + R * 0.18 + q[ 1 ], z + q[ 2 ] );
		n.push( nx, ny, nz );
		uv.push( u, v );
		// (marbled; a pit here and there)
		const m = 0.5 + 0.5 * Math.sin( q[ 0 ] * 70 + q[ 1 ] * 45 + Math.sin( q[ 2 ] * 60 + ph[ 1 ] ) * 2.2 ), c = rand() < 0.07 ? pit : null, s = 0.92 + rand() * 0.12;
		col.push( c ? c : [ ( cream[ 0 ] + ( grey[ 0 ] - cream[ 0 ] ) * m * 0.8 ) * s, ( cream[ 1 ] + ( grey[ 1 ] - cream[ 1 ] ) * m * 0.8 ) * s, ( cream[ 2 ] + ( grey[ 2 ] - cream[ 2 ] ) * m * 0.8 ) * s ] );

	}

	for ( let j = 0; j < NB; j ++ ) for ( let i = 0; i < NA; i ++ ) {

		const a = j * ( NA + 1 ) + i, b = a + 1, c = a + NA + 1, d = c + 1;
		idx.push( a, d, b, a, c, d );

	}

	B.add( 'hard', new Part( p, n, uv, idx ), _I, ( vx, vy, vz, i ) => col[ i ], HARD( rand(), 0, 0, 0.55 ) );

}
