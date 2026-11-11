import { DoubleSide, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from '../../engine/index.js';
import { gearStats } from '../Gear.js';
import { paintOf } from './Fleet.js';
import { ashoreOf, berthOf } from './Berths.js';
import { mooredGeometry, standsGeometry, SHAPES } from './MooredModels.js';
import { LIFT, lookGeometry, lookSign, readLook } from './MooredLooks.js';
import { BOATS } from '../../world/boat/Boats.js';
import { SHADE } from '../../world/boat/BoatMaterials.js';
import { useGroundBounce } from '../../materials/GroundBounce.js';
import { releaseGeometry } from '../../core/ReleaseAfterUpload.js';
import { G } from '../../core/Globals.js';

// (M16) The boats you own and aren't in, lying at their berths or on their blocks in Marta's yard, drawn lightly: near,
// as she looks (her own model baked small, MooredLooks.js, loaded once she's yours and there); further off, and until
// that's come, a stand-in of her size and colours (MooredModels.js). A mesh each, one program, riding the waves. And
// what keeps you and the boat you're in off them (a box each, solid while she's there). Made after the start, only what
// you own, and kept up by sync( state ).
//
//   moored.sync( state, spotOf )     spotOf( id ) -> { position, heading }: where she sits hauled out
//   moored.update( dt, camera )      moored.near( x, y, z ) -> the id of one you're beside, afloat, or null
const SEEN = 700; // m (they're small things past this)
// m: how near she's drawn as she looks, by the device's tier. On a phone the village after a hurricane, the yard's boats
// in sight from the path, is a frame's most triangles: there it's her stand-in
export const NEAR = { low: 45, mid: 160, high: SEEN };
const LOOKS = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'boats/moored/';
const _up = new Vector3( 0, 1, 0 ), _side = new Vector3( 1, 0, 0 ), _n = new Vector3(), _q = new Quaternion(), _yaw = new Quaternion();

export class MooredBoats {

	constructor( { scene, waves, water = null, colliders, terrain, shadows = false, light = () => {}, near = NEAR.high } ) {

		this.scene = scene;
		// (the water as it's drawn, WaterQuery's: the open sea's waves and the shore's swell on them, as the boat you're in rides)
		this.waves = water || waves;
		this.colliders = colliders;
		this.terrain = terrain;
		this.shadows = shadows;
		this.light = light;
		this.nearBy = near;
		// (two-sided: what's seen of a surface of hers from either side is baked once. And a look whose model lifts her shade by
		// day has her own, the same program: MooredLooks' LIFT)
		const material = ( lift ) => {

			const m = new MeshStandardMaterial( { vertexColors: true, roughness: 0.42, metalness: 0, side: DoubleSide } );
			m.name = 'mooredBoat';
			const u = { value: lift };
			m.onBeforeCompile = ( shader ) => {

				shader.uniforms.mooredLift = u;
				shader.uniforms.mooredNight = G.night;
				shader.fragmentShader = shader.fragmentShader
					.replace( '#include <common>', '#include <common>\nuniform float mooredLift;\nuniform float mooredNight;' )
					.replace( '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * mooredLift * ( 1.0 - 0.9 * mooredNight );' );

			};

			m.customProgramCacheKey = () => 'mooredBoat';
			// ((M17) her shade as the boat you're in has hers, so she matches herself out at sea: BoatMaterials' SHADE, the light from
			// under her diffuse, and the sky in her gloss below)
			useGroundBounce( m, { sand: SHADE.bounce } );
			return m;

		};

		this.material = material( 0 );
		this.lifted = {};
		for ( const [ id, lift ] of Object.entries( LIFT ) ) this.lifted[ id ] = material( lift );
		// (their faces out of the sun: the world's shade is near black, and white paint isn't. The scene's environment, as the
		// boat you're in has it: BoatMaterials' SHADE.env times over ((M16) it was 8 here, as the wreck and the signposts have it))
		this._fill = ( renderer, scene, camera, geometry, m ) => {

			if ( m.envMap !== scene.environment ) {

				if ( ! m.envMap !== ! scene.environment ) m.needsUpdate = true;
				m.envMap = scene.environment;

			}

			m.envMapIntensity = scene.environmentIntensity * SHADE.env;

		};
		this.boats = {}; // id -> { mesh: her group, far: the stand-in, near: as she looks, sign, hauled, box, stands }
		this.looks = {}; // id -> the file, read (or a promise of it, or null: it didn't come)

	}

	// her look's file: fetched once she's shown, and kept (it's small) for her paint and her fittings to change
	_look( id ) {

		if ( id in this.looks ) return;
		this.looks[ id ] = fetch( `${ LOOKS }${ id }.bin` ).then( ( r ) => {

			if ( ! r.ok ) throw new Error( `${ r.status }` );
			return r.arrayBuffer();

		} ).then( ( b ) => {

			this.looks[ id ] = readLook( b );
			const E = this.boats[ id ];
			if ( E ) this._dress( E );

		} ).catch( ( e ) => {

			this.looks[ id ] = null; // (her stand-in, then)
			console.warn( `Moored ${ id }: ${ e.message }` );

		} );

	}

	// a mesh of hers in her group
	_part( E, geometry, name, material = this.material ) {

		const m = new Mesh( geometry, material );
		m.name = name;
		m.onBeforeRender = this._fill;
		m.castShadow = this.shadows;
		m.receiveShadow = this.shadows;
		releaseGeometry( geometry );
		E.mesh.add( m );
		return m;

	}

	// her look, as she's painted and fitted, once it's here
	_dress( E ) {

		const look = this.looks[ E.id ];
		if ( ! E.mesh || ! look || look instanceof Promise || E.dressed === E.sign ) return;
		if ( E.near ) {

			E.near.removeFromParent();
			E.near.geometry.dispose();

		}

		E.dressed = E.sign;
		E.near = this._part( E, lookGeometry( look, { paint: E.paint, stats: E.stats } ), `moored-${ E.id }-look`, this.lifted[ E.id ] );
		this.light( E.mesh );
		E.close = null;

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
			id, mesh: null, far: null, near: null, sign: null, dressed: null, close: null, paint: null, stats: null, hauled: false, spot: null, stands: null, tilt: new Quaternion(), rest,
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
			const sign = shown ? [ paint, stats.tTop, stats.twin, stats.tower, stats.outriggers, stats.chair, stats.holdKg, lookSign( id, stats ) ].join() : null;
			if ( sign !== E.sign ) {

				if ( E.far ) {

					E.far.removeFromParent();
					E.far.geometry.dispose();
					E.far = null;

				}

				if ( ! shown && E.mesh ) {

					if ( E.near ) E.near.geometry.dispose();
					this.scene.remove( E.mesh );
					E.mesh = E.near = E.dressed = null;

				}

				E.sign = sign;
				E.paint = paint;
				E.stats = stats;
				if ( shown ) {

					if ( ! E.mesh ) {

						E.mesh = new Group();
						E.mesh.name = `moored-${ id }`;
						this.scene.add( E.mesh );

					}

					E.far = this._part( E, mooredGeometry( id, { paint, stats } ), `moored-${ id }-standIn` );
					E.close = null;
					this.light( E.mesh );
					this._look( id );
					this._dress( E );

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

		const waves = this.waves, t = G.time.value, cam = camera.position, k = 1 - Math.exp( - dt * 2.5 );
		for ( const E of Object.values( this.boats ) ) {

			const m = E.mesh;
			if ( ! m ) continue;
			// (near, as she looks; a little further before she's the stand-in again, so she doesn't flicker at the edge)
			const d = Math.hypot( m.position.x - cam.x, m.position.z - cam.z ), close = !! E.near && d < this.nearBy * ( E.close ? 1.1 : 1 );
			if ( close !== E.close ) {

				E.close = close;
				E.far.visible = ! close;
				if ( E.near ) E.near.visible = close;

			}

			if ( E.spot || E.rest ) {

				m.visible = true;
				continue;

			}

			const P = berthOf( E.id ), S = SHAPES[ E.id ], x = P.position.x, z = P.position.z;
			m.visible = Math.hypot( x - cam.x, z - cam.z ) < SEEN;
			if ( ! m.visible ) continue;
			// (riding them as a boat her size does: their height over her length and beam, her slope across it)
			const c = Math.cos( P.heading ), s = Math.sin( P.heading ), lx = S.length * 0.4, bx = S.beam * 0.45;
			const fore = waves.heightAt( x + s * lx, z + c * lx, t ), aft = waves.heightAt( x - s * lx, z - c * lx, t );
			const port = waves.heightAt( x + c * bx, z - s * bx, t ), stbd = waves.heightAt( x - c * bx, z + s * bx, t );
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
