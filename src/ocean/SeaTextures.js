import * as THREE from '../engine/index.js';

// Small tileable textures for the sea, generated once on the CPU (a few milliseconds each):
//   ripples:  normal map of short wind ripples and capillary waves (two of its scrolling samples
//             perturb the water's normal near the camera; Tidewater re-sampled its finest FFT
//             cascade for the same job)
//   caustics: the bright net of light focused by the waves onto the sea floor (two scrolling
//             samples, their minimum, cast on the ground under the water; Tidewater splatted
//             photons from its FFT surface every frame)

const hash = ( i, j, s ) => {

	let h = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( s, 2147483647 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

};

// periodic value noise over a P x P lattice
function noise( P, seed ) {

	return ( x, y ) => {

		const xi = Math.floor( x ), yi = Math.floor( y ), tx = x - xi, ty = y - yi;
		const sx = tx * tx * ( 3 - 2 * tx ), sy = ty * ty * ( 3 - 2 * ty );
		const at = ( i, j ) => hash( ( ( i % P ) + P ) % P, ( ( j % P ) + P ) % P, seed );
		return ( at( xi, yi ) * ( 1 - sx ) + at( xi + 1, yi ) * sx ) * ( 1 - sy ) + ( at( xi, yi + 1 ) * ( 1 - sx ) + at( xi + 1, yi + 1 ) * sx ) * sy;

	};

}

function texture( data, res, { linearData = true } = {} ) {

	const tex = new THREE.DataTexture( data, res, res, THREE.RGBAFormat );
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.generateMipmaps = true;
	if ( ! linearData ) tex.colorSpace = THREE.NoColorSpace;
	tex.needsUpdate = true;
	return tex;

}

// RG = surface slope ( d/dx, d/dz ) * 0.5 + 0.5 of a ripple height field (anisotropic: ripples
// stretched across the wind)
export function rippleTexture( res = 256 ) {

	const n1 = noise( 16, 3 ), n2 = noise( 32, 7 ), n3 = noise( 64, 11 );
	const H = new Float32Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		const u = i / res, v = j / res;
		H[ j * res + i ] = n1( u * 16, v * 16 * 0.6 ) * 0.55 + n2( u * 32, v * 32 * 0.7 ) * 0.3 + n3( u * 64, v * 64 ) * 0.15;

	}

	const data = new Uint8Array( res * res * 4 );
	const k = 6.0; // slope scale
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		const ip = ( i + 1 ) % res, im = ( i - 1 + res ) % res, jp = ( j + 1 ) % res, jm = ( j - 1 + res ) % res;
		const sx = ( H[ j * res + ip ] - H[ j * res + im ] ) * k, sz = ( H[ jp * res + i ] - H[ jm * res + i ] ) * k;
		const o = ( j * res + i ) * 4;
		data[ o ] = Math.round( Math.min( 1, Math.max( 0, sx * 0.5 + 0.5 ) ) * 255 );
		data[ o + 1 ] = Math.round( Math.min( 1, Math.max( 0, sz * 0.5 + 0.5 ) ) * 255 );
		data[ o + 2 ] = 255;
		data[ o + 3 ] = 255;

	}

	return texture( data, res );

}

// R = caustic brightness: thin bright filaments where cells of a warped Voronoi pattern meet
export function causticTexture( res = 256 ) {

	const P = 8; // cells per side
	const cx = new Float32Array( P * P ), cy = new Float32Array( P * P );
	for ( let j = 0; j < P; j ++ ) for ( let i = 0; i < P; i ++ ) {

		cx[ j * P + i ] = i + 0.15 + hash( i, j, 21 ) * 0.7;
		cy[ j * P + i ] = j + 0.15 + hash( i, j, 22 ) * 0.7;

	}

	const warp = noise( 4, 31 );
	const data = new Uint8Array( res * res * 4 );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		let x = i / res * P, y = j / res * P;
		x += ( warp( i / res * 4, j / res * 4 ) - 0.5 ) * 0.9;
		y += ( warp( i / res * 4 + 2.3, j / res * 4 + 1.7 ) - 0.5 ) * 0.9;
		const xi = Math.floor( x ), yi = Math.floor( y );
		let f1 = 9, f2 = 9;
		for ( let b = - 1; b <= 1; b ++ ) for ( let a = - 1; a <= 1; a ++ ) {

			const ci = xi + a, cj = yi + b;
			const wi = ( ( ci % P ) + P ) % P, wj = ( ( cj % P ) + P ) % P;
			const px = cx[ wj * P + wi ] + ( ci - wi ), py = cy[ wj * P + wi ] + ( cj - wj );
			const d = Math.hypot( px - x, py - y );
			if ( d < f1 ) {

				f2 = f1;
				f1 = d;

			} else if ( d < f2 ) f2 = d;

		}

		// the light concentrates where two cells meet (f2 - f1 small)
		const e = f2 - f1;
		const c = Math.pow( Math.max( 0, 1 - e / 0.22 ), 3 );
		const o = ( j * res + i ) * 4;
		data[ o ] = data[ o + 1 ] = data[ o + 2 ] = Math.round( c * 255 );
		data[ o + 3 ] = 255;

	}

	return texture( data, res );

}
