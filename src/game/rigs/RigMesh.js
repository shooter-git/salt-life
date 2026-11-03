import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Mesh, Vector3 } from '../../engine/index.js';
import { createPropMaterial } from '../GameMaterials.js';

// (M16) All that's out of the rod's own hands on the water: the lines of a spread, the rods in their holders, the kite
// and its line, the baits, the chum. One mesh with its vertices written each frame while any of it's out, about a point
// near the camera (out here world positions don't fit 32 bits), in the float's own program (createPropMaterial's plain
// variant), so it's one draw call, and no new shader. Made the first time it's wanted: it costs nothing until then.
const MAX_VERTS = 1600, MAX_INDEX = 4800;
const _c = new Color(), _toCam = new Vector3(), _t = new Vector3(), _w = new Vector3(), _p = new Vector3(), _q = new Vector3(), _u = new Vector3(), _v = new Vector3(), _n = new Vector3();

export class RigMesh {

	constructor( scene ) {

		const g = this.geometry = new BufferGeometry();
		const attr = ( name, size ) => {

			const a = new BufferAttribute( new Float32Array( MAX_VERTS * size ), size );
			a.setUsage( DynamicDrawUsage );
			g.setAttribute( name, a );
			return a;

		};

		this.pos = attr( 'position', 3 );
		this.nor = attr( 'normal', 3 );
		this.col = attr( 'color', 3 );
		this.aux = attr( 'aux', 4 );
		attr( 'uv', 2 );
		this.idx = new BufferAttribute( new Uint16Array( MAX_INDEX ), 1 );
		this.idx.setUsage( DynamicDrawUsage );
		g.setIndex( this.idx );
		this.mesh = new Mesh( g, createPropMaterial( 'rigs' ) );
		this.mesh.name = 'Rigs';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.visible = false;
		scene.add( this.mesh );
		this.n = 0;
		this.i = 0;
		this.eye = new Vector3();
		this.at = new Vector3();

	}

	// `camera`'s about to see what's written next
	begin( camera ) {

		this.n = this.i = 0;
		this.eye.setFromMatrixPosition( camera.matrixWorld );
		this.at.set( Math.round( this.eye.x ), 0, Math.round( this.eye.z ) );
		this.mesh.position.copy( this.at );

	}

	end() {

		for ( const a of [ this.pos, this.nor, this.col, this.aux, this.idx ] ) a.needsUpdate = true;
		this.geometry.setDrawRange( 0, this.i );
		this.mesh.visible = this.i > 0;

	}

	hide() {

		this.mesh.visible = false;

	}

	_vert( p, n, r, g, b, rough, metal ) {

		const i = this.n ++;
		this.pos.setXYZ( i, p.x - this.at.x, p.y, p.z - this.at.z );
		this.nor.setXYZ( i, n.x, n.y, n.z );
		this.col.setXYZ( i, r, g, b );
		this.aux.setXYZW( i, rough, metal, 0, 0 );
		return i;

	}

	// room for a verts and b indices?
	_room( a, b ) {

		return this.n + a <= MAX_VERTS && this.i + b <= MAX_INDEX;

	}

	_tri( a, b, c ) {

		const d = this.idx.array;
		d[ this.i ++ ] = a;
		d[ this.i ++ ] = b;
		d[ this.i ++ ] = c;

	}

	// a line from a to b through the control point ctl (world), a pixel or two wide at any distance, turned to the eye
	line( a, ctl, b, segs = 14, hex = 0xd8dde0, wide = 1 ) {

		if ( ! this._room( ( segs + 1 ) * 2, segs * 6 ) ) return;
		_c.set( hex );
		let last = - 1;
		for ( let i = 0; i <= segs; i ++ ) {

			const t = i / segs, s = 1 - t;
			_p.set( 0, 0, 0 ).addScaledVector( a, s * s ).addScaledVector( ctl, 2 * s * t ).addScaledVector( b, t * t );
			_t.set( 0, 0, 0 ).addScaledVector( ctl, 2 * s ).addScaledVector( a, - 2 * s ).addScaledVector( b, 2 * t ).addScaledVector( ctl, - 2 * t );
			_toCam.subVectors( this.eye, _p );
			const dist = _toCam.length(), lw = Math.max( 0.0008, dist * 0.0011 ) * wide;
			_w.crossVectors( _t, _toCam ).normalize().multiplyScalar( lw );
			_n.copy( _toCam ).normalize();
			const v0 = this._vert( _q.subVectors( _p, _w ), _n, _c.r, _c.g, _c.b, 0.35, 0 );
			this._vert( _q.addVectors( _p, _w ), _n, _c.r, _c.g, _c.b, 0.35, 0 );
			if ( last >= 0 ) {

				this._tri( last, last + 1, v0 );
				this._tri( last + 1, v0 + 1, v0 );

			}

			last = v0;

		}

	}

	// a tube along pts (world), radii at each, a ring of `sides`
	tube( pts, radii, hex, rough = 0.4, metal = 0.1, sides = 6 ) {

		const m = pts.length;
		if ( ! this._room( m * sides, ( m - 1 ) * sides * 6 ) ) return;
		_c.set( hex );
		const base = this.n;
		for ( let i = 0; i < m; i ++ ) {

			_t.subVectors( pts[ Math.min( m - 1, i + 1 ) ], pts[ Math.max( 0, i - 1 ) ] ).normalize();
			_u.set( 0, 1, 0 ).cross( _t );
			if ( _u.lengthSq() < 1e-4 ) _u.set( 1, 0, 0 );
			_u.normalize();
			_v.crossVectors( _t, _u );
			for ( let j = 0; j < sides; j ++ ) {

				const a = j / sides * Math.PI * 2, ca = Math.cos( a ), sa = Math.sin( a );
				_n.set( 0, 0, 0 ).addScaledVector( _u, ca ).addScaledVector( _v, sa );
				_q.copy( pts[ i ] ).addScaledVector( _n, radii[ i ] );
				this._vert( _q, _n, _c.r, _c.g, _c.b, rough, metal );

			}

		}

		for ( let i = 0; i < m - 1; i ++ ) for ( let j = 0; j < sides; j ++ ) {

			const a = base + i * sides + j, b = base + i * sides + ( j + 1 ) % sides, c = a + sides, d = b + sides;
			this._tri( a, c, b );
			this._tri( b, c, d );

		}

	}

	// a flat polygon, a fan about its first point, seen from both sides; lit by the normal n (`through`: thin cloth, the
	// day coming through it, so its far side's lit the same)
	fan( pts, n, hex, rough = 0.6, through = false ) {

		const m = pts.length;
		if ( ! this._room( m * 2, ( m - 2 ) * 6 ) ) return;
		_c.set( hex );
		const a = this.n;
		for ( const p of pts ) this._vert( p, n, _c.r, _c.g, _c.b, rough, 0 );
		_n.copy( n );
		if ( ! through ) _n.negate();
		for ( const p of pts ) this._vert( p, _n, _c.r, _c.g, _c.b, rough, 0 );
		for ( let i = 1; i < m - 1; i ++ ) {

			this._tri( a, a + i, a + i + 1 );
			this._tri( a + m, a + m + i + 1, a + m + i );

		}

	}

}
