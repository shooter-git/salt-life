import { Mesh, MeshStandardMaterial, Quaternion, Vector3 } from '../../engine/index.js';
import { gearStats } from '../Gear.js';
import { paintOf } from './Fleet.js';
import { ashoreOf, berthOf } from './Berths.js';
import { mooredGeometry, standsGeometry, SHAPES } from './MooredModels.js';
import { BOATS } from '../../world/boat/Boats.js';

// (M16) The boats you own and aren't in, lying at their berths or on their blocks in Marta's yard, drawn lightly
// (MooredModels.js): a mesh each, one material, riding the waves. And what keeps you and the boat you're in off them
// (a box each, solid while she's there). Made after the start, only what you own, and kept up by sync( state ).
//
//   moored.sync( state, spotOf )     spotOf( id ) -> { position, heading }: where she sits hauled out
//   moored.update( dt, camera )      moored.near( x, y, z ) -> the id of one you're beside, afloat, or null
const SEEN = 700; // m (they're small things past this)
const FILL = 8;
const _up = new Vector3( 0, 1, 0 ), _side = new Vector3( 1, 0, 0 ), _n = new Vector3(), _q = new Quaternion(), _yaw = new Quaternion();

export class MooredBoats {

	constructor( { scene, waves, colliders, terrain, shadows = false, light = () => {} } ) {

		this.scene = scene;
		this.waves = waves;
		this.colliders = colliders;
		this.terrain = terrain;
		this.shadows = shadows;
		this.light = light;
		this.material = new MeshStandardMaterial( { vertexColors: true, roughness: 0.42, metalness: 0 } );
		this.material.name = 'mooredBoat';
		// (their faces out of the sun: the world's shade is near black, and white paint isn't. The scene's environment, FILL
		// times over, as the wreck and the signposts have it)
		this._fill = ( renderer, scene ) => {

			const m = this.material;
			if ( m.envMap !== scene.environment ) {

				if ( ! m.envMap !== ! scene.environment ) m.needsUpdate = true;
				m.envMap = scene.environment;

			}

			m.envMapIntensity = scene.environmentIntensity * FILL;

		};
		this.boats = {}; // id -> { mesh, sign, hauled, box, stands, standsSign }

	}

	_box( name, c, half, yaw ) {

		const b = this.colliders.addBox( c, half, yaw, { tag: name } );
		b.solid = false;
		return b;

	}

	_entry( id ) {

		if ( this.boats[ id ] ) return this.boats[ id ];
		const S = SHAPES[ id ], P = berthOf( id ), rest = P.ashore ? ashoreOf( id, this.terrain, S.draft ) : null, at = rest ? rest.position : P.position;
		const half = new Vector3( S.beam / 2, 1.4, S.length / 2 );
		return this.boats[ id ] = {
			id, mesh: null, sign: null, hauled: false, spot: null, stands: null, tilt: new Quaternion(), rest,
			box: this._box( 'mooredBoat', new Vector3( at.x, at.y + 0.4, at.z ), half, P.heading ),
			yard: null,
		};

	}

	// what's there now: each you own but aren't in, as she is
	sync( state, spotOf ) {

		for ( const id of Object.keys( BOATS ) ) {

			const you = state.boat === id, own = !! state.fleet[ id ], b = this.boats[ id ];
			if ( ! own && ! b ) continue;
			const E = this._entry( id ), rec = state.fleet[ id ];
			const hauled = !! own && ( you ? state.hauled : rec.hauled );
			const shown = own && ! you;
			// (what's fitted on her shows: rebuilt only as that changes)
			const stats = gearStats( state.upgrades, id ), paint = own && rec.paint ? paintOf( rec.paint ).hex : null;
			const sign = shown ? [ paint, stats.tTop, stats.twin, stats.tower, stats.outriggers, stats.fightingChair, stats.holdKg ].join() : null;
			if ( sign !== E.sign ) {

				if ( E.mesh ) {

					this.scene.remove( E.mesh );
					E.mesh.geometry.dispose();
					E.mesh = null;

				}

				E.sign = sign;
				if ( shown ) {

					E.mesh = new Mesh( mooredGeometry( id, { paint, stats } ), this.material );
					E.mesh.name = `moored-${ id }`;
					E.mesh.onBeforeRender = this._fill;
					E.mesh.castShadow = this.shadows;
					E.mesh.receiveShadow = this.shadows;
					this.scene.add( E.mesh );
					this.light( E.mesh );

				}

			}

			E.hauled = hauled;
			E.box.solid = shown && ! hauled;
			const spot = hauled ? spotOf( id ) : null;
			E.spot = spot;
			// (on the blocks, or lying on the sand; afloat, update rides her)
			if ( E.mesh && spot ) {

				E.mesh.position.copy( spot.position );
				E.mesh.quaternion.setFromAxisAngle( _up, spot.heading );

			} else if ( E.mesh && E.rest ) {

				E.mesh.position.copy( E.rest.position );
				E.mesh.quaternion.setFromAxisAngle( _up, E.rest.heading ).multiply( _yaw.setFromAxisAngle( _side, E.rest.pitch ) );

			}

			// on her blocks (the lobster boat's are the village's), whether you're in her or not
			const standing = hauled && id !== 'lobster';
			if ( standing && ! E.stands ) {

				const c = Math.cos( spot.heading ), s = Math.sin( spot.heading ), y = spot.position.y;
				const g = standsGeometry( id, y, ( lx, lz ) => this.terrain.heightAt( spot.position.x + lx * c + lz * s, spot.position.z - lx * s + lz * c ) );
				E.stands = new Mesh( g, this.material );
				E.stands.name = `stands-${ id }`;
				E.stands.onBeforeRender = this._fill;
				E.stands.position.copy( spot.position );
				E.stands.quaternion.setFromAxisAngle( _up, spot.heading );
				this.scene.add( E.stands );
				this.light( E.stands );
				const S = SHAPES[ id ];
				if ( ! E.yard ) E.yard = this._box( 'yardBoat', new Vector3( spot.position.x, y + S.free / 2 - S.draft / 2, spot.position.z ), new Vector3( S.beam / 2, ( S.free + S.draft ) / 2 + 0.2, S.length / 2 ), spot.heading );

			} else if ( ! standing && E.stands ) {

				this.scene.remove( E.stands );
				E.stands.geometry.dispose();
				E.stands = null;

			}

			if ( E.yard ) E.yard.solid = standing;

		}

	}

	update( dt, camera ) {

		const waves = this.waves, cam = camera.position, k = 1 - Math.exp( - dt * 2.5 );
		for ( const E of Object.values( this.boats ) ) {

			const m = E.mesh;
			if ( ! m ) continue;
			if ( E.spot || E.rest ) {

				m.visible = true;
				continue;

			}

			const P = berthOf( E.id ), S = SHAPES[ E.id ], x = P.position.x, z = P.position.z;
			m.visible = Math.hypot( x - cam.x, z - cam.z ) < SEEN;
			if ( ! m.visible ) continue;
			// (riding them as a boat her size does: their height over her length and beam, her slope across it)
			const c = Math.cos( P.heading ), s = Math.sin( P.heading ), lx = S.length * 0.4, bx = S.beam * 0.45;
			const fore = waves.heightAt( x + s * lx, z + c * lx ), aft = waves.heightAt( x - s * lx, z - c * lx );
			const port = waves.heightAt( x + c * bx, z - s * bx ), stbd = waves.heightAt( x - c * bx, z + s * bx );
			const mean = ( fore + aft + port + stbd ) / 4;
			_n.set( ( aft - fore ) * s / ( 2 * lx ) + ( stbd - port ) * c / ( 2 * bx ), 1, ( aft - fore ) * c / ( 2 * lx ) - ( stbd - port ) * s / ( 2 * bx ) );
			_q.setFromUnitVectors( _up, _n.normalize() );
			E.tilt.slerp( _q, k );
			_yaw.setFromAxisAngle( _up, P.heading );
			m.quaternion.multiplyQuaternions( E.tilt, _yaw );
			m.position.set( x, m.position.y + ( mean - m.position.y ) * k, z );

		}

	}

	// the one you're standing beside (within reach of her side: from the pier's edge, or on the sand)
	near( x, y, z, reach = 2.6 ) {

		let best = null, bd = reach;
		for ( const E of Object.values( this.boats ) ) {

			if ( ! E.mesh || E.spot ) continue;
			const b = E.box, [ lx, lz ] = this.colliders._toLocal( b, x, z );
			const d = Math.hypot( Math.max( 0, Math.abs( lx ) - b.half.x ), Math.max( 0, Math.abs( lz ) - b.half.z ) );
			if ( d < bd && y < 3.6 && y > - 2 ) {

				bd = d;
				best = E.id;

			}

		}

		return best;

	}

}
