import { Mesh } from '../../engine/index.js';

// (M14) The village's side-hung window shutters (Buildings' windowUnit: louvered or board, hung either side
// of a window, standing open against the wall), in a mesh of their own so they can swing. One in LOOSE of
// them isn't hooked back, and in a blow it swings on its hinges and bangs: against the wall, or shut over
// the window, and back. The wind presses on it as it meets the shutter's face (half rho Cd A v^2, v the
// wind across it): against the wall on the windward side, back and forth along one the wind blows along,
// out from it in the lee, where the house's wake is slow (LEE of the wind) and its eddies (TURB of the
// wind's pressure, swirling every second or few, each its own) set it flapping. Its
// hook holds it open until a gust pulls it free (HOOK), its rusty hinges hold it in a light breeze (FRICTION);
// the air slows it as it swings (DRAG); at the wall and
// the frame it stops dead, bouncing back a little (BOUNCE), and bangs as hard as it hit (`onBang`, its tip's
// speed past BANG m/s). From a fresh breeze it begins; in a gale they're banging all over the village. The
// hooked ones stay as they stand; for a hurricane they're all shut, and hooked (`boarded`).
//   const s = new Shutters( { batch, list, material } )   (Buildings' shutterB's 'wood' batch, and its list:
//   each shutter's hinge, the way its wall faces, the way it opens along it, its size, how far it stands open,
//   and its vertices)
//   group.add( s.mesh );  s.update( dt, windAt, windDir, boarded )   s.onBang = ( x, y, z, k ) => ...

const LOOSE = 8; // one in this many swings free
const RHO = 1.2, CD = 1.2;
const MASS = 9; // kg a square metre (louvered pine, its frame)
const TURB = 0.3;
// the wind across a wall in the house's lee, of the wind's (its wake: slow, turning back on itself); along
// one, as fast as it blows
const LEE = 0.35;
const FRICTION = 2.6; // N m
// N m: the hook that holds a loose one open, until a gust pulls it free (a breeze's on a wall the wind
// blows along); after the blow it stays where it's left, open or blown shut, as a loose shutter does
const HOOK = 6;
const DRAG = 0.3;
const BOUNCE = 0.25;
const BANG = 1.5; // m/s at its tip (slower, it knocks: heard as the wind's)
const STEPS = 4;
const TAU = Math.PI * 2;

// a hash of the shutter's index (0..1)
const hash = ( i, salt ) => {

	let h = Math.imul( i + 1, 0x9e3779b1 ) ^ salt;
	h = Math.imul( h ^ ( h >>> 15 ), 0x85ebca6b );
	h = Math.imul( h ^ ( h >>> 13 ), 0xc2b2ae35 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

};

export class Shutters {

	constructor( { batch, list, material } ) {

		const geo = batch.build();
		this.mesh = new Mesh( geo, material );
		this.mesh.name = 'village_shutters';
		this.mesh.receiveShadow = true;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.userData.keepArrays = true; // (its vertices move: their arrays are kept, App's releaseGeometries)
		this.position = geo.attributes.position;
		this.normal = geo.attributes.normal;
		this.base = { position: this.position.array.slice(), normal: this.normal.array.slice() };
		this.onBang = null;
		this.boarded = false;
		this.list = list.map( ( s, i ) => {

			const area = s.w * s.h, m = MASS * area;
			return {
				...s,
				loose: hash( i, 0x51a7 ) * LOOSE < 1,
				theta: s.open, omega: 0, drawn: s.open, hooked: true,
				I: m * s.w * s.w / 3,
				// (its eddies: the house's wake, one every second or few, each its own)
				f: [ 0.25 + 0.45 * hash( i, 0x2b1 ), 0.6 + 0.8 * hash( i, 0x7c3 ) ], ph: [ TAU * hash( i, 0x4d5 ), TAU * hash( i, 0x1e9 ) ],
			};

		} );
		this.loose = this.list.filter( ( s ) => s.loose ).length;
		this.time = 0;

	}

	// each frame: the wind at a point (m/s, its gusts: windAt( x, z )), the way it blows (unit { x, y }), and
	// whether the island's boarded up for a hurricane
	update( dt, windAt, windDir, boarded = false ) {

		this.time += dt;
		const t = this.time;
		if ( boarded !== this.boarded ) {

			// (all shut and hooked for a hurricane; as they stood again after)
			this.boarded = boarded;
			for ( const s of this.list ) {

				s.theta = boarded ? Math.PI : s.open;
				s.omega = 0;
				s.hooked = true;

			}

		}

		const h = dt / STEPS;
		for ( const s of this.list ) {

			if ( ! s.loose || boarded ) continue;
			const U = windAt( s.x, s.z ), q = 0.5 * RHO * U * U;
			// (the steady wind across its wall: in the house's lee, its slow wake)
			const Us = U * ( 1 - ( 1 - LEE ) * Math.max( 0, windDir.x * s.N[ 0 ] + windDir.y * s.N[ 1 ] ) );
			// (the plate's face, the way it swings: ( - A sin theta + N cos theta ); the wind across it)
			const turb = TURB * ( Math.sin( t * s.f[ 0 ] * TAU + s.ph[ 0 ] ) * 0.6 + Math.sin( t * s.f[ 1 ] * TAU + s.ph[ 1 ] ) * 0.4 );
			for ( let k = 0; k < STEPS; k ++ ) {

				const c = Math.cos( s.theta ), sn = Math.sin( s.theta );
				const nx = - s.A[ 0 ] * sn + s.N[ 0 ] * c, nz = - s.A[ 1 ] * sn + s.N[ 1 ] * c;
				const across = ( windDir.x * nx + windDir.y * nz ) * Us;
				let tau = 0.5 * RHO * CD * s.w * s.h * across * Math.abs( across ) * s.w * 0.5 + q * s.w * s.h * s.w * 0.5 * turb;
				tau -= DRAG * RHO * s.h * s.w ** 4 * s.omega * Math.abs( s.omega );
				// (its hook holds it open until a gust pulls it free; its hinges hold it until it's pushed past them)
				if ( s.hooked ) {

					if ( Math.abs( tau ) < HOOK ) continue;
					s.hooked = false;

				}

				if ( Math.abs( s.omega ) < 0.05 && Math.abs( tau ) < FRICTION ) {

					s.omega = 0;
					continue;

				}

				tau -= Math.sign( s.omega || tau ) * FRICTION;
				s.omega += tau / s.I * h;
				s.theta += s.omega * h;
				// (against the wall, or shut over the window: it stops, bouncing back a little, and bangs)
				if ( s.theta <= 0 || s.theta >= Math.PI ) {

					const tip = Math.abs( s.omega ) * s.w;
					s.theta = s.theta <= 0 ? 0 : Math.PI;
					s.omega *= - BOUNCE;
					// (at its middle: half its width along it from the hinge, A cos theta + N sin theta)
					const c2 = Math.cos( s.theta ) * s.w * 0.5;
					if ( tip > BANG && this.onBang ) this.onBang( s.x + s.A[ 0 ] * c2, s.y, s.z + s.A[ 1 ] * c2, Math.min( 1, ( tip - BANG ) / 4 ) );

				}

			}

		}

		this._draw();

	}

	// each that's swung since it was drawn: its vertices turned about its hinge (its sense, s: the house's
	// frame turns it by - s theta), only those uploaded
	_draw() {

		const P = this.position, N = this.normal, bp = this.base.position, bn = this.base.normal, pa = P.array, na = N.array;
		let any = false;
		for ( const s of this.list ) {

			if ( Math.abs( s.theta - s.drawn ) < 1e-3 ) continue;
			s.drawn = s.theta;
			const psi = - s.sign * ( s.theta - s.open ), c = Math.cos( psi ), sn = Math.sin( psi );
			for ( let v = s.v0; v < s.v1; v ++ ) {

				const i = v * 3, dx = bp[ i ] - s.x, dz = bp[ i + 2 ] - s.z;
				pa[ i ] = s.x + dx * c + dz * sn;
				pa[ i + 2 ] = s.z - dx * sn + dz * c;
				const ux = bn[ i ], uz = bn[ i + 2 ];
				na[ i ] = ux * c + uz * sn;
				na[ i + 2 ] = - ux * sn + uz * c;

			}

			P.addUpdateRange( s.v0 * 3, ( s.v1 - s.v0 ) * 3 );
			N.addUpdateRange( s.v0 * 3, ( s.v1 - s.v0 ) * 3 );
			any = true;

		}

		if ( any ) {

			P.needsUpdate = true;
			N.needsUpdate = true;

		}

	}

}
