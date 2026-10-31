import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3 } from '../../engine/index.js';
import { HullLines } from './HullLines.js';
import { Vessel } from './Vessel.js';
import { LOBSTER_HANDLING } from './Handling.js';

// (M16) A boat of a given size with nothing on her: the lobster boat's lines stretched, a shell and a flat deck, that
// floats, handles, can be walked on and swapped to, so all that's made for the boats can be worked on and tested before
// each is modelled. Each real boat replaces this with her own lines, model and handling. Not to ship.

function stretchedLines( length, beam, depth ) {

	const sz = length / 8.2, sx = beam / 2.9, sy = depth;
	class Stretched extends HullLines {

		sheerY( t ) { return super.sheerY( t ) * sy; }
		sheerX( t ) { return super.sheerX( t ) * sx; }
		keelY( t ) { return super.keelY( t ) * sy; }
		chineX( t ) { return super.chineX( t ) * sx; }
		chineY( t ) { return super.chineY( t ) * sy; }
		bilgeTangent( t ) { return super.bilgeTangent( t ) * Math.min( sx, sy ); }
		bottomConvexity( t ) { return super.bottomConvexity( t ) * sy; }
		flare( t ) { return super.flare( t ) * sx; }

	}

	return new Stretched( {
		zAft: - 3.9 * sz, zBow: 4.3 * sz, deckY: 0.35 * sy, shell: 0.07 * Math.min( sx, 1 ),
		houseBack: - 0.35 * sz, houseFront: 1.45 * sz, forefootR: 0.45 * sy, widest: 1.5 * sx * 1.05,
	} );

}

// the lobster boat's handling at another size
function stretchedHandling( sx, sy, sz, engine ) {

	const H = LOBSTER_HANDLING, k = sx * sy * sz, xyz = ( p ) => [ p[ 0 ] * sx, p[ 1 ] * sy, p[ 2 ] * sz ];
	return {
		...H,
		windArea: H.windArea.map( ( a ) => a * sz * sy ),
		windY: H.windY * sy,
		windLead: H.windLead * sz,
		rightK: H.rightK * k,
		stations: H.stations.map( ( [ z, a ] ) => [ z * sz, a * sz * sy ] ),
		lateralY: H.lateralY * sy,
		heave: H.heave.map( ( a ) => a * Math.cbrt( k ) ),
		damping: H.damping.map( ( a ) => a * k ),
		resistance: ( au ) => H.resistance( au ) * Math.pow( k, 2 / 3 ),
		contacts: H.contacts.map( xyz ),
		outline: H.outline.map( xyz ),
		bowZ: H.bowZ * sz,
		sternZ: H.sternZ * sz,
		engine,
	};

}

export class PlainBoat extends Vessel {

	// length, beam (m), depth: her freeboard and draft against the lobster boat's; engine: as Handling's
	constructor( id, { length, beam, depth, engine, color = 0xd8dcdc } ) {

		super( id );
		const sz = length / 8.2, sx = beam / 2.9, sy = depth, L = this.lines = stretchedLines( length, beam, depth );
		this.handling = stretchedHandling( sx, sy, sz, engine );
		const material = this.materials.hull = new MeshStandardMaterial( { color, roughness: 0.5, flatShading: true } );
		const mesh = new Mesh( this._shell(), material );
		mesh.name = 'boat-hull';
		mesh.castShadow = mesh.receiveShadow = true;
		this.group.add( mesh );
		this.meshes.hull = mesh;

		this.floatBody( { keelBottom: - 0.45 * sy, roofHeight: L.sheerY( 1 ) } );
		const y = L.deckY;
		this.helmEye = new Vector3( 0, y + 1.5, 0.1 * length );
		this.helm = { x: 0, z: 0.05 * length, eye: this.helmEye, rise: [ 0.4 * sx, 0 ] };
		this.boardPoint = new Vector3( 0, y, - 0.2 * length );
		this.exitPoints = this.railPoints( [ - 0.35, - 0.2, - 0.1 ].map( ( f ) => f * length ) );
		this.propeller = new Vector3( 0, - 0.3 * sy, L.zAft );
		this.rudder = new Vector3( 0, - 0.3 * sy, L.zAft );
		this.bowSprayPoints = this.waterlinePoints( [ 0.25, 0.32, 0.4, 0.46 ].map( ( f ) => f * length ) );
		const half = L.halfBreadth( L.tAtSheerZ( 0 ), y ) - L.shell;
		this.colliders = [ { tag: 'deck', center: new Vector3( 0, y - 0.05, 0 ), half: new Vector3( half, 0.05, length * 0.48 ), walkable: true, solid: false } ];
		this.shelter = this.shelterBox( 0.001, - 100, - 99, 0, 1 ); // (nothing's under cover)
		this.wake = { quarterX: 0.5 * beam, quarterZ: - 0.24 * length, washZ: L.zAft - 0.3 };
		this.lamps = { port: [ 0.3, L.sheerY( 0.5 ) + 1, 0 ], masthead: [ 0, L.sheerY( 0.5 ) + 1.5, 0 ], anchor: [ 0, L.sheerY( 0.5 ) + 1.55, 0 ], stern: [ 0, L.sheerY( 0 ) + 0.1, L.zAft - 0.05 ] };
		this.bowWalk = L.zBow - 0.3;
		// (a big boat's crew: where they'd be, a platform up where her tower's top would be and the chair aft)
		if ( id === 'sportfisher' ) {

			const top = L.deckY + 8, z = 0.05 * length;
			this.colliders.push( { tag: 'tower', center: new Vector3( 0, top - 0.05, z ), half: new Vector3( 0.8, 0.05, 0.8 ), walkable: true, solid: false } );
			this.stations = { tower: { x: 0, y: top, z, r: 1.2 }, chair: { x: 0, y, z: - 0.3 * length, r: 0.8, facing: Math.PI } };

		}

	}

	// the shell (keel to sheer) both sides, its transom and the deck
	_shell() {

		const L = this.lines, pos = [], NT = 40;
		let n = 0;
		const rows = [];
		for ( let i = 0; i <= NT; i ++ ) {

			const t = i / NT, sec = L.sectionPoints( t, 1 ), z = L.sheerZ( t ), D = L.bowBlend( t ), row = [];
			n = sec.length / 2;
			for ( let j = 0; j < n; j ++ ) row.push( [ sec[ 2 * j ], sec[ 2 * j + 1 ], z - D * ( sec[ 2 * n - 1 ] - sec[ 2 * j + 1 ] ) * 0.2 ] );
			rows.push( row );

		}

		const tri = ( a, b, c ) => pos.push( ...a, ...b, ...c );
		const mirror = ( p ) => [ - p[ 0 ], p[ 1 ], p[ 2 ] ];
		for ( let i = 0; i < NT; i ++ ) for ( let j = 0; j < n - 1; j ++ ) {

			const a = rows[ i ][ j ], b = rows[ i + 1 ][ j ], c = rows[ i + 1 ][ j + 1 ], d = rows[ i ][ j + 1 ];
			tri( a, c, b ); tri( a, d, c );
			tri( mirror( a ), mirror( b ), mirror( c ) ); tri( mirror( a ), mirror( c ), mirror( d ) );

		}

		for ( let j = 0; j < n - 1; j ++ ) {

			const a = rows[ 0 ][ j ], d = rows[ 0 ][ j + 1 ];
			tri( a, mirror( a ), mirror( d ) ); tri( a, mirror( d ), d );

		}

		const y = L.deckY;
		for ( let i = 0; i < NT; i ++ ) {

			const t0 = i / NT, t1 = ( i + 1 ) / NT, z0 = L.sheerZ( t0 ), z1 = L.sheerZ( t1 );
			const w0 = L.halfBreadth( t0, y ), w1 = L.halfBreadth( t1, y );
			tri( [ w0, y, z0 ], [ w1, y, z1 ], [ - w1, y, z1 ] ); tri( [ w0, y, z0 ], [ - w1, y, z1 ], [ - w0, y, z0 ] );

		}

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		g.computeVertexNormals();
		return g;

	}

}
