import * as THREE from '../../engine/index.js';
import { SPECIES, SKIN } from '../fish/FishSpecies.js';
import { fishGeometry, splitFishGeometry, section, PART } from '../fish/FishGeometry.js';

// Fish as village props: whole fish lying on ice or hanging from the stall, split salted fish on
// the drying racks, a fish cut in two on a cleaning table, plus the crushed ice, banana leaves and
// spiny lobsters of the displays. Everything placed while the village is built (Props.js fish(),
// iceBed(), bananaLeaf(), lobster()) is collected here and merged into ONE static mesh.
//
// Port note: Tidewater drew these with its fish skin shader (fish/FishMaterial.js, instanced, levels
// of detail by distance). Until the fish are ported, the village bakes them on the CPU: the same
// models (fish/FishGeometry.js, the display pieces below), bent and placed as Tidewater's vertex
// shader did (bendPoint), coloured per vertex from the species' skin (back / flank / belly / fins,
// FishSpecies.SKIN), wet or sun-dried, with one MeshStandardMaterial.

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();

// ---------------------------------------------------------------------------
// display geometry (unit size; aData as the fish: x along, y part, z / w pattern coordinates)

function build( pos, dat, idx ) {

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aData', new THREE.Float32BufferAttribute( dat, 4 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	g.computeBoundingSphere();
	return g;

}

function mulberry( seed ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// Crushed ice heaped in a round basin of radius 1 (the instance length is the radius): a lumpy
// mound with faceted chunks on top.
function iceGeometry( lod ) {

	const pos = [], dat = [], idx = [];
	const rnd = mulberry( 17 );
	const v = ( x, y, z, a, b ) => {

		pos.push( x, y, z );
		dat.push( 0, PART.ICE, a, b );
		return pos.length / 3 - 1;

	};

	// mound
	const rings = lod ? 3 : 6, segs = lod ? 12 : 24;
	const mound = ( r, a ) => 0.16 * ( 1 - r * r ) + 0.025 * Math.sin( a * 5 + r * 7 ) * r + 0.02;
	const c = v( 0, mound( 0, 0 ), 0, 0.5, 0.5 );
	const grid = [];
	for ( let i = 1; i <= rings; i ++ ) {

		const r = i / rings;
		const row = [];
		for ( let j = 0; j < segs; j ++ ) {

			const a = j / segs * Math.PI * 2;
			row.push( v( Math.cos( a ) * r, mound( r, a ), Math.sin( a ) * r, rnd(), rnd() ) );

		}

		grid.push( row );

	}

	// skirt down the basin wall (hidden by it: no gap between the ice and the wood)
	const skirt = [];
	for ( let j = 0; j < segs; j ++ ) {

		const a = j / segs * Math.PI * 2;
		skirt.push( v( Math.cos( a ) * 0.8, - 0.35, Math.sin( a ) * 0.8, rnd(), rnd() ) );

	}

	grid.push( skirt );
	for ( let j = 0; j < segs; j ++ ) idx.push( c, grid[ 0 ][ ( j + 1 ) % segs ], grid[ 0 ][ j ] );
	for ( let i = 0; i < rings; i ++ ) for ( let j = 0; j < segs; j ++ ) {

		const a = grid[ i ][ j ], b = grid[ i ][ ( j + 1 ) % segs ], cc = grid[ i + 1 ][ ( j + 1 ) % segs ], d = grid[ i + 1 ][ j ];
		idx.push( a, b, d, b, cc, d );

	}

	// chunks: irregular tetrahedra / wedges half sunk into the mound
	const n = lod ? 50 : 170;
	for ( let k = 0; k < n; k ++ ) {

		const r = Math.sqrt( rnd() ) * 0.92, a = rnd() * Math.PI * 2;
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r, y = mound( r, a );
		const s = 0.06 + rnd() * 0.09;
		const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( rnd() * 6, rnd() * 6, rnd() * 6 ) );
		const corners = [ [ 1, 0.2, 0.1 ], [ - 0.6, 0.9, 0.2 ], [ - 0.5, - 0.4, 0.9 ], [ 0.1, - 0.6, - 0.9 ], [ 0.3, 0.8, - 0.5 ] ].map( ( p ) => new THREE.Vector3( p[ 0 ] * ( 0.7 + rnd() * 0.6 ), p[ 1 ] * ( 0.7 + rnd() * 0.6 ), p[ 2 ] * ( 0.7 + rnd() * 0.6 ) ).multiplyScalar( s ).applyQuaternion( q ) );
		const faces = [ [ 0, 1, 2 ], [ 0, 2, 3 ], [ 0, 3, 4 ], [ 0, 4, 1 ], [ 1, 4, 3 ], [ 1, 3, 2 ] ];
		const ca = rnd(), cb = rnd();
		for ( const f of faces ) {

			// flat faces (own vertices) catch glints; winding fixed to face outward
			const A = corners[ f[ 0 ] ], B = corners[ f[ 1 ] ], C = corners[ f[ 2 ] ];
			const nrm = new THREE.Vector3().subVectors( B, A ).cross( new THREE.Vector3().subVectors( C, A ) );
			const ctr = new THREE.Vector3().add( A ).add( B ).add( C );
			const flip = nrm.dot( ctr ) < 0;
			const ids = [ A, B, C ].map( ( p ) => v( x + p.x, y + p.y * 0.8, z + p.z, ca, cb ) );
			if ( flip ) idx.push( ids[ 0 ], ids[ 2 ], ids[ 1 ] );
			else idx.push( ids[ 0 ], ids[ 1 ], ids[ 2 ] );

		}

	}

	return build( pos, dat, idx );

}

// Banana leaf (length 1 along +z from its stalk end, blade up +y): V-folded blade, curled edges,
// torn along the veins near the tips.
function leafGeometry( lod ) {

	const pos = [], dat = [], idx = [];
	const nz = lod ? 8 : 20, nx = lod ? 3 : 7;
	const rnd = mulberry( 5 );
	const tears = [];
	for ( let k = 0; k < 6; k ++ ) tears.push( [ 0.3 + rnd() * 0.6, rnd() < 0.5 ? - 1 : 1 ] );
	for ( const back of [ false, true ] ) {

		const base = pos.length / 3;
		for ( let i = 0; i <= nz; i ++ ) {

			const t = i / nz;
			const halfW = 0.19 * Math.sin( Math.PI * Math.min( 1, 0.08 + t * 0.95 ) ) + 0.012;
			for ( let j = - nx; j <= nx; j ++ ) {

				const a = j / nx;
				// torn strips: a split pulls the edge apart a little
				let x = a * halfW;
				for ( const [ tz, side ] of tears ) if ( Math.sign( a ) === side && Math.abs( a ) > 0.45 && t > tz ) x += side * 0.01 * Math.abs( a );
				const fold = Math.abs( a ) * halfW * 0.25; // V-fold along the midrib
				const curl = a * a * 0.04 * ( 1 - t );
				pos.push( x, fold + curl + 0.01 * Math.sin( t * 9 ) * a, t );
				dat.push( t, PART.LEAF, a, t );

			}

		}

		const row = 2 * nx + 1;
		for ( let i = 0; i < nz; i ++ ) for ( let j = 0; j < 2 * nx; j ++ ) {

			const a = base + i * row + j, b = a + 1, c = a + row + 1, d = a + row;
			if ( back ) idx.push( a, b, d, b, c, d );
			else idx.push( a, d, b, b, d, c );

		}

	}

	return build( pos, dat, idx );

}

// Caribbean spiny lobster, body length 1 (carapace + tail) along +z (head), legs below, long
// antennae sweeping back over the sides.
function lobsterGeometry( lod ) {

	const pos = [], dat = [], idx = [];
	const v = ( x, y, z, a, b ) => {

		pos.push( x, y, z );
		dat.push( 0.5 - z, PART.SHELL, a, b );
		return pos.length / 3 - 1;

	};

	const segs = lod ? 6 : 12;
	// shell of revolution around the body axis (z), flattened on the underside
	const shell = ( pts, flat ) => {

		const rows = [];
		for ( const [ z, r, h ] of pts ) {

			const row = [];
			for ( let j = 0; j <= segs; j ++ ) {

				const a = Math.PI * j / segs; // over the back, from one side to the other
				const x = Math.cos( a ) * r, y = Math.sin( a ) * h;
				row.push( v( x, y * ( y < 0 ? flat : 1 ), z, x * 3, z * 3 ) );

			}

			// underside
			rows.push( row );

		}

		for ( let i = 0; i < rows.length - 1; i ++ ) for ( let j = 0; j < segs; j ++ ) {

			const a = rows[ i ][ j ], b = rows[ i ][ j + 1 ], c = rows[ i + 1 ][ j + 1 ], d = rows[ i + 1 ][ j ];
			idx.push( a, d, b, b, d, c );

		}

		// flat belly
		for ( let i = 0; i < rows.length - 1; i ++ ) {

			const a = rows[ i ][ 0 ], b = rows[ i ][ segs ], c = rows[ i + 1 ][ segs ], d = rows[ i + 1 ][ 0 ];
			idx.push( a, b, d, b, c, d );

		}

	};

	// carapace (front 40 %) with the horns over the eyes
	shell( [ [ 0.5, 0.03, 0.03 ], [ 0.47, 0.09, 0.075 ], [ 0.4, 0.125, 0.105 ], [ 0.28, 0.135, 0.115 ], [ 0.15, 0.125, 0.11 ], [ 0.1, 0.115, 0.1 ] ], 0.25 );
	// horns over the eyes
	for ( const s of [ 1, - 1 ] ) {

		const b0 = v( s * 0.035, 0.07, 0.47, 0.5, 0.5 ), b1 = v( s * 0.075, 0.06, 0.46, 0.5, 0.5 ), b2 = v( s * 0.05, 0.03, 0.47, 0.5, 0.5 ), tip = v( s * 0.075, 0.1, 0.55, 0.5, 0.5 );
		idx.push( b0, b1, tip, b1, b2, tip, b2, b0, tip );
		if ( s < 0 ) idx.splice( idx.length - 9, 9, b0, tip, b1, b1, tip, b2, b2, tip, b0 );

	}

	// tail: six overlapping segments, curled slightly down toward the fan
	const tail = [];
	for ( let k = 0; k < 6; k ++ ) {

		const z0 = 0.1 - k * 0.075, r = 0.115 - k * 0.009;
		const dy = - k * k * 0.002;
		tail.push( [ z0, r, r * 0.8, dy ] );

	}

	for ( const [ z0, r, h, dy ] of tail ) {

		const base = pos.length / 3;
		shell( [ [ z0 + 0.005, r * 0.95, h * 0.95 ], [ z0 - 0.02, r, h ], [ z0 - 0.08, r * 0.96, h * 0.92 ] ], 0.3 );
		for ( let i = base; i < pos.length / 3; i ++ ) pos[ i * 3 + 1 ] += dy;

	}

	// tail fan
	for ( let k = - 2; k <= 2; k ++ ) {

		const a = k * 0.32;
		const z0 = - 0.36, y0 = - 0.05;
		const l = 0.13 - Math.abs( k ) * 0.012;
		const p0 = v( 0, y0, z0, 0, 0 ), p1 = v( Math.sin( a - 0.13 ) * l, y0 - 0.01, z0 - Math.cos( a - 0.13 ) * l, 1, 0 ), p2 = v( Math.sin( a + 0.13 ) * l, y0 - 0.01, z0 - Math.cos( a + 0.13 ) * l, 1, 1 );
		idx.push( p0, p2, p1, p0, p1, p2 );

	}

	// tapered tubes: antennae, legs, eye stalks
	const tube = ( pts, r0, r1, n ) => {

		const rows = [];
		const sides = lod ? 3 : 5;
		for ( let i = 0; i < pts.length; i ++ ) {

			const p = pts[ i ], q = pts[ Math.min( i + 1, pts.length - 1 ) ], o = pts[ Math.max( i - 1, 0 ) ];
			const d = new THREE.Vector3( q[ 0 ] - o[ 0 ], q[ 1 ] - o[ 1 ], q[ 2 ] - o[ 2 ] ).normalize();
			const s1 = new THREE.Vector3( 0, 1, 0 ).cross( d ).normalize();
			if ( s1.lengthSq() < 1e-6 ) s1.set( 1, 0, 0 );
			const s2 = new THREE.Vector3().crossVectors( d, s1 );
			const r = r0 + ( r1 - r0 ) * i / ( pts.length - 1 );
			const row = [];
			for ( let j = 0; j < sides; j ++ ) {

				const a = j / sides * Math.PI * 2;
				row.push( v( p[ 0 ] + ( s1.x * Math.cos( a ) + s2.x * Math.sin( a ) ) * r, p[ 1 ] + ( s1.y * Math.cos( a ) + s2.y * Math.sin( a ) ) * r, p[ 2 ] + ( s1.z * Math.cos( a ) + s2.z * Math.sin( a ) ) * r, n, i / pts.length ) );

			}

			rows.push( row );

		}

		for ( let i = 0; i < rows.length - 1; i ++ ) for ( let j = 0; j < sides; j ++ ) {

			const a = rows[ i ][ j ], b = rows[ i ][ ( j + 1 ) % sides ], c = rows[ i + 1 ][ ( j + 1 ) % sides ], d = rows[ i + 1 ][ j ];
			idx.push( a, b, d, b, c, d );

		}

	};

	for ( const s of [ 1, - 1 ] ) {

		// antennae: thick spiny bases, sweeping forward and out, then back along the sides
		const ant = [];
		for ( let i = 0; i <= ( lod ? 5 : 10 ); i ++ ) {

			const t = i / ( lod ? 5 : 10 );
			ant.push( [ s * ( 0.05 + Math.sin( t * 2.2 ) * 0.28 ), 0.05 + t * 0.06 - t * t * 0.1, 0.48 + Math.sin( t * 2.6 ) * 0.25 - t * t * 0.75 ] );

		}

		tube( ant, 0.042, 0.005, 2 );
		// walking legs
		for ( let k = 0; k < 5; k ++ ) {

			const z = 0.36 - k * 0.055;
			tube( [ [ s * 0.09, - 0.01, z ], [ s * 0.19, 0.025, z - 0.01 ], [ s * 0.26, - 0.01, z - 0.04 ], [ s * 0.29, - 0.07, z - 0.07 ] ], 0.013, 0.005, 3 );

		}

		tube( [ [ s * 0.03, 0.05, 0.47 ], [ s * 0.05, 0.08, 0.5 ] ], 0.012, 0.01, 4 );

	}

	return build( pos, dat, idx );

}

// ---------------------------------------------------------------------------

// JS mirror of the vertex shader's bends (FishMaterial propVertex): where a model point ends up
function bendPoint( x, y, z, curl, sag, out ) {

	const k1 = curl + ( curl >= 0 ? 1e-4 : - 1e-4 );
	const t1 = k1 * z;
	const h1 = Math.sin( t1 * 0.5 );
	const x1 = 2 * h1 * h1 / k1 + x * Math.cos( t1 );
	const z1 = Math.sin( t1 ) / k1 - x * Math.sin( t1 );
	const k2 = sag + ( sag >= 0 ? 1e-4 : - 1e-4 );
	const t2 = k2 * z1;
	const h2 = Math.sin( t2 * 0.5 );
	return out.set( x1, 2 * h2 * h2 / k2 + y * Math.cos( t2 ), Math.sin( t2 ) / k2 - y * Math.sin( t2 ) );

}

// model frame (nose +z, back +y, left flank +x) -> placement frame, per pose
const POSE = {
	// lying on its side, nose toward +x, left flank up
	side: new THREE.Matrix4().makeBasis( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 0, 0, 1 ), new THREE.Vector3( 1, 0, 0 ) ),
	// the other flank up
	sideFlip: new THREE.Matrix4().makeBasis( new THREE.Vector3( 0, - 1, 0 ), new THREE.Vector3( 0, 0, - 1 ), new THREE.Vector3( 1, 0, 0 ) ),
	// hanging by the tail: nose down, left flank toward +z, back toward -x
	tail: new THREE.Matrix4().makeBasis( new THREE.Vector3( 0, 0, 1 ), new THREE.Vector3( - 1, 0, 0 ), new THREE.Vector3( 0, - 1, 0 ) ),
	// split fish hung by the tail: nose down, the flesh side (model +y) toward +z
	tailFlat: new THREE.Matrix4().makeBasis( new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 0, 0, 1 ), new THREE.Vector3( 0, - 1, 0 ) ),
	// hanging from a hook through the gills: nose up, left flank toward +z, back toward +x
	gill: new THREE.Matrix4().makeBasis( new THREE.Vector3( 0, 0, 1 ), new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 0, 1, 0 ) ),
	// upright (belly down), nose toward +x: lobsters, leaves, ice
	flat: new THREE.Matrix4().makeBasis( new THREE.Vector3( 0, 0, - 1 ), new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 1, 0, 0 ) ),
};

const lin = ( hex ) => new THREE.Color().setHex( hex );
// the species' skin colours, linear
const SKINS = {};
const skinOf = ( species ) => SKINS[ species ] || ( SKINS[ species ] = Object.fromEntries( Object.entries( SKIN[ species ] || SKIN.mullet ).map( ( [ k, v ] ) => [ k, k === 'rough' ? v : lin( v ) ] ) ) );
const ICE = [ lin( 0x9fb4bc ), lin( 0xdfe9ee ) ];
const LEAF = [ lin( 0x3f6a22 ), lin( 0x6e8a3a ) ];
const SHELL = [ lin( 0x7a3a22 ), lin( 0xb8763e ) ];
const FLESH = lin( 0xd99c86 ), DRIED = lin( 0x9a6e40 ), MOUTH = lin( 0x5a1e1c ), EYE = lin( 0x141210 );

export class FishProps {

	constructor() {

		this.items = [];
		this.mesh = null;

	}

	// kind: 'whole' | 'split' | 'head' | 'trunk' | 'ice' | 'leaf' | 'lobster'. frame: world matrix of the
	// placement (see POSE: the pose rotation is applied here). anchor (model units): the model point
	// placed at the frame origin (after bending).
	add( kind, species, frame, pose, L, o = {} ) {

		const curl = o.curl ?? 0, sag = o.sag ?? 0;
		_m.multiplyMatrices( frame, POSE[ pose ] );
		_m.decompose( _p, _q, _s );
		// the anchor point of the model sits at the frame origin
		const a = o.anchor || [ 0, 0, 0 ];
		const b = bendPoint( a[ 0 ], a[ 1 ], a[ 2 ], curl, sag, new THREE.Vector3() ).multiplyScalar( L ).applyQuaternion( _q );
		_p.sub( b );
		this.items.push( {
			kind, species, L, position: _p.clone(), q: _q.clone(), seed: o.seed ?? 0.5,
			curl, sag, wet: o.wet ?? 1, dried: o.dried ?? 0, blood: o.blood ?? 0,
		} );

	}

	// half thickness of a fish lying on its side (m)
	static restHeight( species, L ) {

		const S = SPECIES[ species ];
		let w = 0;
		for ( let u = 0.1; u < 0.9; u += 0.05 ) w = Math.max( w, section( S, u ).W );
		return w * L * 0.85;

	}

	// model z of the caudal peduncle / the hook through the gill cover
	static tailAnchor( species ) {

		const S = SPECIES[ species ];
		return [ 0, 0, 0.5 - S.body * 0.985 ];

	}

	static gillAnchor( species ) {

		const S = SPECIES[ species ];
		return [ 0, S.mouth.y * 0.5, 0.5 - S.body * ( S.mouth.corner + 0.03 ) ];

	}

	// one merged mesh (position, normal, color) of the models at level of detail `lod` (0 .. 2; the
	// props are small and seen from a few metres at most)
	build( { lod = 1 } = {} ) {

		const models = new Map();
		const model = ( it ) => {

			const key = it.kind + ':' + ( it.species || '' );
			let g = models.get( key );
			if ( g ) return g;
			const S = it.species ? SPECIES[ it.species ] : null;
			switch ( it.kind ) {

				case 'split': g = splitFishGeometry( S, { lod: Math.min( lod, 1 ) } ); break;
				case 'head': g = fishGeometry( S, { lod, pose: 'dead', u1: S.opercle + 0.02, eyes: lod < 2 } ); break;
				case 'trunk': g = fishGeometry( S, { lod, pose: 'dead', u0: S.opercle + 0.02 } ); break;
				case 'ice': g = iceGeometry( 1 ); break;
				case 'leaf': g = leafGeometry( 1 ); break;
				case 'lobster': g = lobsterGeometry( 1 ); break;
				default: g = fishGeometry( S, { lod, pose: 'dead', eyes: lod < 2 } );

			}

			models.set( key, g );
			return g;

		};

		let vcount = 0, icount = 0;
		for ( const it of this.items ) {

			const g = model( it );
			vcount += g.attributes.position.count;
			icount += g.index.count;

		}

		const pos = new Float32Array( vcount * 3 ), nrm = new Float32Array( vcount * 3 ), col = new Float32Array( vcount * 3 );
		const idx = new Uint32Array( icount );
		let vo = 0, io = 0;
		for ( const it of this.items ) {

			const g = model( it );
			const P = g.attributes.position, N = g.attributes.normal, D = g.attributes.aData;
			const skin = skinOf( it.species || 'mullet' );
			const tone = 0.92 + ( it.seed % 1 ) * 0.16;
			for ( let i = 0; i < P.count; i ++ ) {

				bendPoint( P.getX( i ), P.getY( i ), P.getZ( i ), it.curl, it.sag, _v ).multiplyScalar( it.L ).applyQuaternion( it.q ).add( it.position );
				_n.fromBufferAttribute( N, i ).applyQuaternion( it.q );
				pos.set( [ _v.x, _v.y, _v.z ], ( vo + i ) * 3 );
				nrm.set( [ _n.x, _n.y, _n.z ], ( vo + i ) * 3 );
				colour( it, skin, D.getY( i ), D.getZ( i ), D.getW( i ) );
				_c.multiplyScalar( tone );
				col.set( [ _c.r, _c.g, _c.b ], ( vo + i ) * 3 );

			}

			for ( let i = 0; i < g.index.count; i ++ ) idx[ io + i ] = vo + g.index.getX( i );
			vo += P.count;
			io += g.index.count;

		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		geo.setAttribute( 'normal', new THREE.BufferAttribute( nrm, 3 ) );
		geo.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
		geo.setIndex( new THREE.BufferAttribute( idx, 1 ) );
		geo.computeBoundingSphere();
		for ( const g of models.values() ) g.dispose();
		this.material = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.38, metalness: 0, side: THREE.DoubleSide } );
		this.material.name = 'VillageFish';
		const mesh = new THREE.Mesh( geo, this.material );
		mesh.name = 'village_fish';
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.mesh = mesh;
		this.items = null;
		return mesh;

	}

}

// vertex colour (linear, into _c) of a display piece from its part id and pattern coordinates
function colour( it, skin, partF, a, b ) {

	const part = Math.floor( partF + 0.05 );
	if ( it.kind === 'ice' ) return _c.copy( ICE[ 0 ] ).lerp( ICE[ 1 ], ( a + b ) * 0.5 );
	if ( it.kind === 'leaf' ) return _c.copy( LEAF[ 0 ] ).lerp( LEAF[ 1 ], Math.abs( a ) * 0.6 );
	if ( it.kind === 'lobster' ) return _c.copy( SHELL[ 0 ] ).lerp( SHELL[ 1 ], ( Math.sin( a * 9 + b * 7 ) * 0.5 + 0.5 ) * 0.6 );
	if ( part === PART.EYE ) return _c.copy( EYE );
	if ( part === PART.MOUTH ) return _c.copy( MOUTH );
	if ( part === PART.FLESH || part === PART.FILLET ) return _c.copy( FLESH ).lerp( MOUTH, it.blood * 0.3 ).lerp( DRIED, it.dried );
	const S = skin;
	if ( part === PART.BODY ) {

		// b: height fraction around the girth (-1 belly .. 1 back)
		const h = Math.max( - 1, Math.min( 1, b ) );
		if ( h > 0 ) _c.copy( S.flank ).lerp( S.back, Math.min( 1, h * 1.4 ) );
		else _c.copy( S.flank ).lerp( S.belly, Math.min( 1, - h * 1.6 ) );

	} else {

		_c.copy( S.fin ).lerp( S.edge, Math.max( 0, Math.min( 1, a ) ) * 0.6 );

	}

	// sun-dried: brown and dull; less wet: duller
	_c.lerp( DRIED, it.dried * 0.75 );
	return _c.multiplyScalar( 0.85 + 0.15 * it.wet );

}
