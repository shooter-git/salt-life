// (M16) The shells of the collection (game/Shells.js), their real shapes as numbers: a gastropod is the curve of its
// mouth swept round a logarithmic spiral (Raup 1966), its flared lip, shoulder knobs and canal on top of that; a
// cowrie or an olive a rolled ovoid with its slit; a bivalve one valve, its ribs and rays. Each shell's colours are
// worked out at each vertex from where on the shell it is, so a fine mesh shows its markings (the panel's picture)
// and a coarse one its tone (on the sand). No three.js: the same numbers go into the world (world/Beachcombing.js)
// and, drawn here by a little z-buffer, into the panel (game/ShellCase.js); and they're tested under Node.
//   shellMesh( kind, detail ) -> { p, n, c, idx } (detail: 1 the coarsest, for the sand on low; 2 on high; 6 for the
//     panel; positions in units of the shell's length, its long axis x, its broad side down; colours linear)
//   shellPicture( kind, W, H, { silhouette } ) -> RGBA bytes, the shell filling W x H, viewed as it's shown in a shell book

const TAU = Math.PI * 2;
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
const bump = ( x, w ) => Math.exp( - ( x * x ) / ( w * w ) );
const fract = ( x ) => x - Math.floor( x );
const hash = ( a, b = 0 ) => fract( Math.sin( a * 127.1 + b * 311.7 ) * 43758.5453 );
const mix = ( a, b, t ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
// sRGB hex -> linear
const lin = ( hex ) => [ ( hex >> 16 ) & 255, ( hex >> 8 ) & 255, hex & 255 ].map( ( v ) => {

	const s = v / 255;
	return s < 0.04045 ? s / 12.92 : Math.pow( ( s + 0.055 ) / 1.055, 2.4 );

} );
// (a wandering value along a spiral: the markings' irregularity, each band its own)
const wob = ( a, b = 0 ) => Math.sin( a + 1.7 * Math.sin( a * 0.37 + b ) ) * 0.5 + Math.sin( a * 2.3 + b * 1.9 ) * 0.25;

// ---- the shapes

// a gastropod: the mouth's curve swept along its spiral. S: its parameters; t: 0 at the apex to 1 at the lip; a: round
// the mouth (0 outward from the axis, + up toward the apex); turn: how many whorls before the lip
function spiral( S, detail ) {

	const perTurn = Math.max( 3, Math.round( S.per * detail ) ), around = Math.max( 5, Math.round( S.around * detail ) );
	const turns = detail >= 3 ? S.turns : Math.min( S.turns, S.coarse ?? 2.4 );
	const nT = Math.ceil( turns * perTurn );
	const rows = [];
	const inner = detail >= 3 ? 12 : S.mouth ? 3 : 1;
	const lnW = Math.log( S.W );
	// (a coarse one's spire ends in a point: the whorls past it are too small to see)
	if ( turns < S.turns ) {

		const row = [];
		for ( let j = 0; j < around; j ++ ) row.push( { P: [ 0, S.T, 0 ], c: { t: 0, turn: S.turns, a: j / around * TAU - Math.PI, r: 0, end: 0, inner: false, into: 0, on: 0, lip: false } } );
		rows.push( row );

	}

	for ( let i = 0; i <= nT + inner; i ++ ) {

		const into = Math.max( 0, i - nT ) / inner;
		const turn = i <= nT ? ( 1 - i / nT ) * turns : into * 0.42;
		const th = - turn * TAU, r = Math.exp( - turn * lnW );
		// (the last stretch's the adult's lip)
		const end = 1 - ss( 0, S.lipFrom ?? 0.35, turn );
		const row = [];
		for ( let j = 0; j < around; j ++ ) {

			const a = j / around * TAU - Math.PI;
			const ca = Math.cos( a ), sa = Math.sin( a );
			let dr = ca * S.sx, dy = sa * S.sy;
			// (the shoulder, angular at its top outer corner)
			if ( S.shoulder ) {

				const k = S.shoulder * bump( a - ( S.shoulderAt ?? 0.7 ), 0.5 );
				dr += k * 0.6;
				dy += k * 0.4;

			}

			// (knobs round the shoulder, or ribs down the whorl)
			const on = turn * S.knobN * TAU;
			if ( S.knobs ) {

				const k = Math.pow( Math.max( 0, Math.cos( on ) ), 2 ) * S.knobs * bump( a - ( S.knobAt ?? S.shoulderAt ?? 0.7 ), S.knobW ?? 0.42 ) * ss( 0, 0.2, turn );
				dr += k * ca * 0.8 + k * 0.3;
				dy += k * sa * 0.8 + k * 0.3;

			}

			if ( S.ribs ) {

				const w = S.ribs * ( 0.5 + 0.5 * Math.cos( on ) );
				dr += w * ca;
				dy += w * sa;

			}

			// (fine spiral cords)
			if ( S.cords ) {

				const k = S.cords * Math.cos( a * S.cordN );
				dr += k * ca;
				dy += k * sa;

			}

			// (the canal, drawn down from the mouth's foot, longer on the last whorl)
			if ( S.canal ) {

				const k = Math.pow( Math.max( 0, - sa ), S.canalP ?? 5 ) * S.canal * ( 0.3 + 0.7 * ss( 0.6, 0, turn ) );
				dy -= k;
				dr += k * ( S.canalIn ?? - 0.35 ) * S.sx;

			}

			// (the lip: on the last stretch, flared out from the mouth, away from the axis and up, as the adult's is)
			if ( S.flare && end > 0 ) {

				const out = Math.max( 0, ca + 0.3 ) / 1.3;
				const k = S.flare * end * end * out;
				dr += k * ( S.flareOut ?? 1 );
				dy += k * ( S.flareUp ?? 0.4 ) * Math.max( 0, sa + 0.15 );

			}

			// (inside the mouth: drawn in by the lip's thickness)
			const scale = r * ( i <= nT ? 1 : 1 - 0.1 - 0.12 * into );
			let R = Math.max( 0, r * S.sx + dr * scale ), y = S.T * ( 1 - r ) + dy * scale;
			// (the mouth itself narrower than the whorl: the lip and the shield over the body run in to it, flat)
			if ( i > nT && S.mouth ) {

				const m = 1 - ( 1 - S.mouth ) * Math.min( 1, into * 3 ), Rc = r * S.sx * ( S.mouthAt ?? 1 );
				R = Rc + ( R - Rc ) * m;
				y -= ( y - S.T * ( 1 - r ) + ( S.canal ?? 0 ) * 0.2 ) * ( 1 - m ) * 0.12;

			}

			const P = [ R * Math.cos( th ), y, R * Math.sin( th ) ];
			row.push( { P, c: { turn, a, r, end, inner: i > nT, into, on, lip: i === nT } } );

		}

		rows.push( row );

	}

	return grid( rows, ( c ) => {

		const col = S.colour( c );
		// (dark down the throat)
		const d = S.mouth ? ss( 0.22, 0.34, c.into ) : ss( 0, 1, c.into );
		return c.inner ? [ col[ 0 ] * ( 1 - 0.82 * d ), col[ 1 ] * ( 1 - 0.86 * d ), col[ 2 ] * ( 1 - 0.88 * d ) ] : col;

	}, true );

}

// a rolled shell, its long axis x (0..1 toward the fore end): r( x ) its round (0..1), squashed flat below;
// its slit along the underside, a little to one side
function ovoid( O, detail ) {

	const nx = Math.max( 6, Math.round( O.nx * detail ) ), around = Math.max( 6, Math.round( O.around * detail ) ), rows = [];
	for ( let i = 0; i <= nx; i ++ ) {

		const u = - 1 + 2 * i / nx, X = Math.sign( u ) * Math.pow( Math.abs( u ), 0.82 ), row = [];
		const rr = O.r( X );
		for ( let j = 0; j < around; j ++ ) {

			const a = j / around * TAU - Math.PI / 2, s = Math.sin( a ), c = Math.cos( a );
			const low = s < 0;
			let y = s * rr * O.w * ( low ? O.under : O.hump ), z = c * rr * O.w;
			if ( O.ridge && ! low ) y += O.ridge * bump( X - ( O.ridgeAt ?? 0 ), 0.16 ) * Math.max( 0, s ) * Math.min( 1, rr * 1.6 );
			// (the slit, sunk along the underside)
			const sl = low ? bump( z - O.slitAt * O.w, O.slit * O.w ) : 0;
			y += sl * O.w * 0.14 * rr;
			row.push( { P: [ X * 0.5, y, z ], c: { x: X, a, z: z / O.w, y: y / O.w, rr, slit: sl, low } } );

		}

		rows.push( row );

	}

	return grid( rows, O.colour, true );

}

// one valve of a bivalve: its beak at the hinge, its round from there out to the margin (outline( a ), 0..1 from the
// beak), domed; ribs and rays by angle; and its inside, back from the margin to the beak
function valve( V, detail ) {

	const nr = Math.max( 3, Math.round( V.nr * detail ) ), around = Math.max( 8, Math.round( V.around * detail ) ), rows = [];
	const at = ( t, j, under ) => {

		const a = j / around * TAU;
		const [ ox, oz ] = V.outline( a );
		const tt = Math.max( t, 0.02 );
		const x = ox * tt, z = oz * tt;
		const dome = V.H * Math.pow( 1 - tt * tt, 0.7 );
		const rib = V.rib ? V.rib * Math.cos( a * V.ribN ) * ss( 0.08, 0.5, tt ) : 0;
		const y = under ? dome * 0.72 + rib * 0.5 : dome + rib + ( V.ring ? V.ring * Math.sin( tt * V.ringN ) * tt : 0 );
		return { P: [ x, y, z ], c: { t: tt, a, under, ox, oz } };

	};

	for ( let i = 0; i <= nr; i ++ ) {

		const row = [];
		for ( let j = 0; j < around; j ++ ) row.push( at( i / nr, j, false ) );
		rows.push( row );

	}

	for ( let i = nr; i >= 0; i -- ) {

		const row = [];
		for ( let j = 0; j < around; j ++ ) row.push( at( i / nr, j, true ) );
		rows.push( row );

	}

	return grid( rows, V.colour, true );

}

// rows of { P, c } round a closed ring -> the mesh, its normals, its colours (colour( c ), with a hash for the mottling)
function grid( rows, colour, closed ) {

	const nr = rows.length, na = rows[ 0 ].length, nv = nr * na;
	const p = new Float32Array( nv * 3 ), col = new Float32Array( nv * 3 ), n = new Float32Array( nv * 3 ), idx = [];
	for ( let i = 0; i < nr; i ++ ) for ( let j = 0; j < na; j ++ ) {

		const v = rows[ i ][ j ], k = ( i * na + j ) * 3, C = colour( v.c );
		p[ k ] = v.P[ 0 ];
		p[ k + 1 ] = v.P[ 1 ];
		p[ k + 2 ] = v.P[ 2 ];
		col[ k ] = C[ 0 ];
		col[ k + 1 ] = C[ 1 ];
		col[ k + 2 ] = C[ 2 ];

	}

	for ( let i = 0; i < nr - 1; i ++ ) for ( let j = 0; j < ( closed ? na : na - 1 ); j ++ ) {

		const a = i * na + j, b = i * na + ( j + 1 ) % na, c = a + na, d = b + na;
		idx.push( a, c, b, b, c, d );

	}

	return finish( p, n, col, idx );

}

// faces out; centred; the long axis along x, of length 1; normals from the faces
function finish( p, n, col, idx ) {

	const nv = p.length / 3;
	let cx = 0, cy = 0, cz = 0;
	for ( let i = 0; i < nv; i ++ ) {

		cx += p[ i * 3 ];
		cy += p[ i * 3 + 1 ];
		cz += p[ i * 3 + 2 ];

	}

	cx /= nv;
	cy /= nv;
	cz /= nv;
	const accumulate = ( sign ) => {

		n.fill( 0 );
		let out = 0;
		for ( let t = 0; t < idx.length; t += 3 ) {

			const a = idx[ t ] * 3, b = idx[ t + 1 ] * 3, c = idx[ t + 2 ] * 3;
			const ux = p[ b ] - p[ a ], uy = p[ b + 1 ] - p[ a + 1 ], uz = p[ b + 2 ] - p[ a + 2 ];
			const vx = p[ c ] - p[ a ], vy = p[ c + 1 ] - p[ a + 1 ], vz = p[ c + 2 ] - p[ a + 2 ];
			const fx = ( uy * vz - uz * vy ) * sign, fy = ( uz * vx - ux * vz ) * sign, fz = ( ux * vy - uy * vx ) * sign;
			for ( const q of [ a, b, c ] ) {

				n[ q ] += fx;
				n[ q + 1 ] += fy;
				n[ q + 2 ] += fz;

			}

			out += fx * ( p[ a ] - cx ) + fy * ( p[ a + 1 ] - cy ) + fz * ( p[ a + 2 ] - cz );

		}

		return out;

	};

	if ( accumulate( 1 ) < 0 ) {

		for ( let t = 0; t < idx.length; t += 3 ) {

			const s = idx[ t + 1 ];
			idx[ t + 1 ] = idx[ t + 2 ];
			idx[ t + 2 ] = s;

		}

		accumulate( 1 );

	}

	for ( let i = 0; i < nv; i ++ ) {

		const k = i * 3, l = Math.hypot( n[ k ], n[ k + 1 ], n[ k + 2 ] ) || 1;
		n[ k ] /= l;
		n[ k + 1 ] /= l;
		n[ k + 2 ] /= l;

	}

	return { p, n, c: col, idx };

}

// ---- each shell's lines and colours, after photographs (the sources: docs/m16/north.md). Its colours as a worn shell
// on a beach has them: a little chalkier than a living one's. `axis`: the mesh's coil axis laid along x

const C = {
	bone: lin( 0xefe6d4 ), sand: lin( 0xcfb48c ), tan: lin( 0xb48c5c ), pink: lin( 0xeeaf9e ), rose: lin( 0xdc7f7a ), peach: lin( 0xf0c6a0 ),
	white: lin( 0xf6f2ea ), black: lin( 0x231c1e ), brown: lin( 0x5c3a24 ), choc: lin( 0x3a2418 ), rust: lin( 0xa8522c ), orange: lin( 0xd9833f ), salmon: lin( 0xe6a077 ),
	yellow: lin( 0xdcb65a ), cream: lin( 0xf0e2c0 ), red: lin( 0xc23a22 ), purple: lin( 0x5a3448 ), grey: lin( 0x9c948c ), nacre: lin( 0xe8e4dc ), slate: lin( 0x6a5c54 ),
};

export const SHAPES = {

	// Queen conch: the heavy, flared adult (22 cm); short knobbed spire, chalky sand-coloured outside, the lip's inside
	// pink going to rose, a fisherman's cut in the spire (how the meat's got out: a beach's empties nearly all have it)
	queenConch: { kind: 'spiral', mouth: 0.42, mouthAt: 1.02, turns: 7, coarse: 2.2, per: 7, around: 7, W: 1.62, T: 1.75, q: 1, sx: 0.66, sy: 0.82, shoulder: 0.12, shoulderAt: 0.8, knobs: 0.28, knobN: 9 / 6.283, knobAt: 0.75, knobW: 0.34, flare: 1.15, flareOut: 0.72, flareUp: 1.25, lipFrom: 0.42, canal: 1.1, canalP: 2.2, canalIn: - 0.5, view: [ 0.1, - 0.12, Math.PI / 2 ], axis: 0.2,
		colour: ( c ) => {

			if ( c.inner ) return mix( C.pink, C.rose, 0.2 + 0.6 * c.into );
			// (the lip's underside, polished pink; the rest chalk, faint banded)
			const lip = c.end * ss( - 0.2, 0.5, Math.cos( c.a ) ) * ss( - 1.2, 0.3, Math.sin( c.a + 0.5 ) );
			const band = 0.5 + 0.5 * Math.sin( c.a * 7 + c.turn * 10 + wob( c.turn * 14 ) );
			let col = mix( C.sand, C.bone, 0.25 + 0.5 * band );
			col = mix( col, C.tan, 0.3 * ( 0.5 + 0.5 * Math.sin( c.turn * 50 + wob( c.a * 4 ) * 2 ) ) );
			col = mix( col, C.pink, Math.min( 1, lip * 1.3 ) );
			// (the fisherman's cut, a dark slit on the third whorl)
			if ( c.turn > 1.2 && c.turn < 1.34 && Math.abs( c.a - 0.8 ) < 0.42 ) return C.choc;
			return col;

		} },

	// West Indian fighting conch (Strombus pugilis, 8 cm): salmon to orange, spines on the shoulder, a short lip, the
	// foot of the mouth stained purple-brown
	fightingConch: { kind: 'spiral', mouth: 0.36, mouthAt: 1.05, turns: 8, coarse: 2, per: 6, around: 6, W: 1.5, T: 2.05, q: 1, sx: 0.6, sy: 0.72, shoulder: 0.1, shoulderAt: 0.9, knobs: 0.3, knobN: 10 / 6.283, knobAt: 0.75, knobW: 0.25, flare: 0.42, flareOut: 0.6, flareUp: 1.1, lipFrom: 0.3, canal: 0.95, canalP: 2.4, canalIn: - 0.5, view: [ 0.1, - 0.12, Math.PI / 2 ], axis: 0.25,
		colour: ( c ) => {

			if ( c.inner ) return mix( C.white, C.salmon, 0.25 );
			const stain = Math.max( 0, - Math.sin( c.a ) - 0.72 ) * 3.5 * c.end;
			const band = 0.5 + 0.5 * Math.sin( c.a * 5 + wob( c.turn * 8 ) );
			return mix( mix( C.orange, C.salmon, 0.3 + 0.6 * band ), C.purple, Math.min( 1, stain ) );

		} },

	// King helmet (Cassis tuberosa, 20 cm): a heavy triangle: flat broad shield round the mouth, three big rows of knobs,
	// cream mottled brown, the shield's teeth over a dark brown, as in photographs
	kingHelmet: { kind: 'spiral', mouth: 0.16, mouthAt: 1.2, turns: 5.5, coarse: 1.8, per: 7, around: 7, W: 2.6, T: 0.72, q: 1, sx: 0.82, sy: 0.82, shoulder: 0.2, shoulderAt: 0.85, knobs: 0.3, knobN: 7 / 6.283, knobAt: 0.85, knobW: 0.3, flare: 0.42, flareOut: 0.8, flareUp: 0.5, lipFrom: 0.5, canal: 0.62, canalP: 3, canalIn: - 0.6, view: [ 0.16, - 0.12, Math.PI / 2 ], axis: 0.3,
		colour: ( c ) => {

			if ( c.inner ) return mix( mix( C.peach, C.bone, 0.3 ), Math.sin( c.a * 26 ) > 0 ? C.bone : C.choc, ss( 0.06, 0.2, c.into ) );
			if ( c.end > 0.15 ) {

				const teeth = 0.5 + 0.5 * Math.cos( c.a * 26 );
				const shield = mix( C.peach, C.bone, 0.35 );
				const edge = ss( 0.25, 0.75, c.end ) * ss( - 0.2, 0.6, Math.cos( c.a ) );
				return mix( shield, teeth > 0.55 ? C.bone : C.brown, edge * 0.85 );

			}

			const m = wob( c.turn * 21, 2 ) + wob( c.a * 3 + c.turn * 5, 1 );
			return mix( C.cream, C.brown, ss( 0.22, 0.65, m ) * 0.9 );

		} },

	// Atlantic triton (Charonia variegata, 25 cm): the tall spire and swollen whorls, cream with brown crescents, its lip
	// scalloped in pairs of ribs on dark blotches, the mouth orange
	triton: { kind: 'spiral', mouth: 0.6, turns: 8, coarse: 3, per: 6, around: 6, W: 1.42, T: 4, q: 1, sx: 0.72, sy: 0.84, cords: 0.035, cordN: 12, ribs: 0.05, knobN: 9 / 6.283, flare: 0.24, flareOut: 0.8, flareUp: 0.5, lipFrom: 0.22, canal: 0.72, canalP: 3, canalIn: - 0.6, view: [ - 0.1, - 0.1, Math.PI / 2 ], axis: 0.2,
		colour: ( c ) => {

			if ( c.inner ) return mix( C.orange, C.peach, 0.4 );
			if ( c.lip || c.end > 0.85 ) return Math.sin( c.a * 20 ) > 0 ? C.bone : C.choc;
			const k = fract( c.turn * 3.2 + 0.08 * wob( c.a * 3 ) ), crescent = bump( k - 0.5, 0.26 ) * ( 0.5 + 0.5 * Math.sin( c.a * 6 + c.turn * 11 ) );
			return mix( mix( C.cream, C.sand, 0.4 ), C.brown, ss( 0.3, 0.6, crescent ) * 0.95 );

		} },

	// Music volute (Voluta musica, 7 cm): solid, ribbed down the shoulder; the lines of a stave and its notes round a
	// cream shell, rosy in places; four folds on the column of its mouth
	musicVolute: { kind: 'spiral', mouth: 0.26, mouthAt: 1.2, turns: 6, coarse: 2, per: 7, around: 7, W: 1.9, T: 1.3, q: 1, sx: 0.64, sy: 0.98, shoulder: 0.08, shoulderAt: 0.85, knobs: 0.16, knobN: 11 / 6.283, knobAt: 0.9, knobW: 0.25, flare: 0.08, flareUp: 0.2, lipFrom: 0.14, canal: 0.5, canalP: 3, canalIn: - 0.6, view: [ - 0.1, - 0.1, Math.PI / 2 ], axis: 0.2,
		colour: ( c ) => {

			if ( c.inner ) return mix( C.cream, C.peach, 0.3 );
			const ground = mix( C.cream, C.pink, 0.2 + 0.2 * Math.sin( c.turn * 3 ) );
			// (the stave: sets of fine lines round the whorl)
			const s = fract( c.a * 1.6 + 0.05 * wob( c.turn * 9 ) ) * 4;
			const line = Math.abs( fract( s * 2.5 ) - 0.5 ) < 0.11 && s < 2.2;
			if ( line ) return mix( C.choc, C.brown, 0.3 );
			// (and the notes on it, dots along the lines)
			const note = bump( fract( c.turn * 36 + hash( Math.floor( s ) ) ) - 0.5, 0.2 ) * ( s < 2.4 ? 1 : 0 ) * ( hash( Math.floor( c.turn * 36 ), Math.floor( s * 2.5 ) ) > 0.45 ? 1 : 0 );
			return mix( ground, C.choc, ss( 0.5, 0.75, note ) );

		} },

	// West Indian top shell (Cittarium pica, 8 cm): a heavy low cone, wider than tall, irregular black or purple-black
	// flames slanting across white; the mouth round and pearly, with a deep navel
	topShell: { kind: 'spiral', turns: 6, coarse: 2, per: 7, around: 6, W: 1.75, T: 1.36, q: 1, sx: 0.96, sy: 0.64, shoulder: 0.04, shoulderAt: 0.4, view: [ - 0.5, - 0.32, Math.PI / 2 ], axis: 0.45,
		colour: ( c ) => {

			if ( c.inner ) return C.nacre;
			if ( Math.sin( c.a ) < - 0.72 ) return C.nacre;
			const k = wob( c.turn * 26 + c.a * 1.7 + 2 * Math.sin( c.a * 2 + c.turn * 4 ), 1 ) + 0.35 * wob( c.a * 5 + c.turn * 13 );
			return mix( C.white, mix( C.black, C.purple, 0.3 ), ss( - 0.1, 0.18, k ) );

		} },

	// Bleeding tooth (Nerita peloronta, 3 cm): the low, thick round shell; zigzags of black and red on pale yellow; the
	// mouth a white slab with two teeth in an orange-red blotch: the "blood"
	bleedingTooth: { kind: 'spiral', mouth: 0.52, mouthAt: 1.15, turns: 3.2, coarse: 1.6, per: 8, around: 6, W: 3.6, T: 0.42, q: 1, sx: 0.86, sy: 0.92, flare: 0.05, lipFrom: 0.1, view: [ - 0.05, 0.05, Math.PI / 2 ], axis: 0.1,
		colour: ( c ) => {

			if ( c.inner ) return c.into < 0.34 ? mix( C.white, C.red, ss( - 0.2, 0.5, - Math.cos( c.a ) + 0.3 * Math.sin( c.a * 9 ) - 0.2 ) ) : mix( C.white, C.yellow, 0.25 );
			const lipIn = c.end > 0.55 && Math.cos( c.a ) < - 0.1;
			if ( lipIn ) return mix( C.white, C.red, ss( 0.25, 0.7, Math.sin( c.a * 3 + 1 ) + 0.4 * Math.cos( c.a * 12 ) ) );
			const zz = Math.abs( fract( c.turn * 14 + Math.abs( fract( c.a * 1.6 ) - 0.5 ) * 2.2 ) - 0.5 ) * 2;
			return zz > 0.72 ? C.black : zz > 0.56 ? C.red : mix( C.yellow, C.cream, 0.4 );

		} },

	// Mangrove periwinkle (Littoraria angulifera, 3 cm): thin and sharp-spired, off-white to reddish, dark flecks slanting
	// across it and merging on the last whorl
	periwinkle: { kind: 'spiral', turns: 6, coarse: 2, per: 6, around: 6, W: 1.6, T: 2.35, q: 1, sx: 0.7, sy: 0.8, view: [ - 0.1, - 0.1, Math.PI / 2 ], axis: 0.25,
		colour: ( c ) => {

			if ( c.inner ) return mix( C.white, C.purple, 0.15 );
			const k = wob( c.turn * 28 + c.a * 1.1, 2 ) + 0.5 * wob( c.a * 4 + c.turn * 9 );
			return mix( mix( C.yellow, C.salmon, 0.35 + 0.3 * Math.sin( c.turn ) ), C.brown, ss( 0.05, 0.4, k ) * 0.9 );

		} },

	// Netted olive (Americoliva reticularis, 4 cm): a polished cylinder, a low sharp spire, a fine purple-brown net over
	// cream, two darker bands; the long slit
	nettedOlive: { kind: 'ovoid', nx: 7, around: 6, w: 0.21, hump: 1, under: 0.96, slit: 0.14, slitAt: 0.5, gloss: 0.8, view: [ 0.3, 0.1, 0.1 ],
		r: ( x ) => {

			const front = Math.pow( Math.max( 0, 1 - Math.pow( Math.max( 0, - x ), 3 ) ), 0.8 );
			if ( x < 0.72 ) return front * ( 0.92 + 0.08 * ss( - 0.4, 0.5, x ) );
			return 1 * Math.max( 0.02, ( 1 - ( x - 0.72 ) / 0.28 ) * 0.8 ) + 0.2 * ( 1 - ss( 0.72, 0.76, x ) );

		},
		colour: ( c ) => {

			if ( c.slit > 0.45 ) return C.white;
			const net = Math.max( Math.sin( ( c.x * 2.1 + c.a * 0.5 ) * 38 ), Math.sin( ( c.x * 2.1 - c.a * 0.5 ) * 38 ) );
			const band = Math.max( bump( c.x - 0.4, 0.09 ), bump( c.x + 0.34, 0.09 ) );
			const mark = mix( mix( C.brown, C.purple, 0.5 ), C.choc, band );
			return mix( C.cream, mark, Math.min( 1, ss( 0.25, 0.9, net ) * 0.8 + band * 0.55 ) );

		} },

	// Measled cowrie (Macrocypraea zebra, 7 cm): long and glossy, brown with three darker bands and white spots over the
	// back; ringed spots on its sides; pale below, the slit toothed dark
	measledCowrie: { kind: 'ovoid', nx: 7, around: 7, w: 0.27, hump: 1.08, under: 0.55, slit: 0.1, slitAt: 0.12, gloss: 1, view: [ 0.95, 0.15, 0 ],
		r: ( x ) => Math.pow( Math.max( 0, 1 - Math.pow( Math.abs( x ), 2.6 ) ), 0.55 ),
		colour: ( c ) => {

			if ( c.slit > 0.4 ) return Math.sin( c.x * 80 ) > 0 ? C.choc : C.tan;
			if ( c.low ) return mix( C.tan, C.sand, 0.5 );
			const bands = Math.max( bump( c.x - 0.38, 0.1 ), bump( c.x, 0.1 ), bump( c.x + 0.38, 0.1 ) );
			const ground = mix( mix( C.tan, C.brown, 0.55 ), C.choc, bands * 0.75 );
			// (spots, each its own: white on the back; on the sides ringed, a dark eye in each)
			const cellX = c.x * 14, cellA = c.a * 5.6, ix = Math.floor( cellX ), ia = Math.floor( cellA ), jx = hash( ix, ia ) * 0.5 + 0.25, ja = hash( ia, ix ) * 0.5 + 0.25;
			const d = Math.hypot( fract( cellX ) - jx, fract( cellA ) - ja ), side = 1 - ss( 0.1, 0.45, c.y );
			const r0 = 0.2 + 0.2 * hash( ix + 3, ia );
			if ( d < r0 * ( 0.35 + 0.0 ) * side ) return C.choc;
			return d < r0 ? mix( C.white, C.cream, 0.4 ) : ground;

		} },

	// Atlantic yellow cowrie (Naria acicularis, 2 cm): a little glossy pale tan-yellow one, a paler mottled back, brown
	// freckles down its sides
	yellowCowrie: { kind: 'ovoid', nx: 6, around: 6, w: 0.3, hump: 1, under: 0.5, slit: 0.1, slitAt: 0.1, gloss: 1, view: [ 0.95, 0.15, 0 ],
		r: ( x ) => Math.pow( Math.max( 0, 1 - Math.pow( Math.abs( x ), 2.5 ) ), 0.55 ),
		colour: ( c ) => {

			if ( c.slit > 0.4 ) return Math.sin( c.x * 50 ) > 0 ? C.rust : C.bone;
			if ( c.low ) return C.bone;
			const m = wob( c.x * 19 + c.a * 3, 1 ) * wob( c.a * 7 - c.x * 5, 2 );
			const ground = mix( C.yellow, C.cream, ss( - 0.2, 0.3, m ) );
			const side = 1 - ss( 0.05, 0.6, c.y ), fr = hash( Math.floor( c.x * 30 ), Math.floor( c.a * 11 ) );
			return fr > 0.72 && side > 0.3 ? C.brown : ground;

		} },

	// Flamingo tongue (Cyphoma gibbosum, 3 cm): the shell itself is plain, the orange spots the live animal's mantle and
	// gone with it: a smooth cream oval, peach on the back, one thick ridge across its middle
	flamingoTongue: { kind: 'ovoid', nx: 7, around: 7, w: 0.31, hump: 1.1, under: 0.5, slit: 0.16, slitAt: 0.06, ridge: 0.075, ridgeAt: 0.04, gloss: 1, view: [ 0.95, 0.15, 0 ],
		r: ( x ) => Math.pow( Math.max( 0, 1 - Math.pow( Math.abs( x ), 2.2 ) ), 0.62 ),
		colour: ( c ) => {

			if ( c.slit > 0.5 ) return C.tan;
			if ( c.low ) return C.white;
			return mix( C.cream, mix( C.peach, C.orange, 0.32 ), bump( c.x - 0.04, 0.5 ) * ss( 0.15, 0.8, c.y ) );

		} },

	// Sunrise tellin (Tellina radiata, 6 cm): thin, long and glossy, cream with rose rays from its beak; red at the beak
	sunriseTellin: { kind: 'valve', nr: 3, around: 7, H: 0.13, ring: 0.002, ringN: 90, gloss: 0.8, view: [ 1.05, 0, 0.15 ],
		outline: ( a ) => [ Math.cos( a ) * ( Math.cos( a ) > 0 ? 0.58 : 0.42 ), Math.sin( a ) * 0.32 - 0.02 * Math.sin( 2 * a ) ],
		colour: ( c ) => {

			if ( c.under ) return mix( C.white, C.rose, 0.3 );
			const ray = 0.5 + 0.5 * Math.sin( c.a * 7 + 0.6 * Math.sin( c.a * 3 ) );
			const beak = bump( c.t, 0.14 );
			return mix( mix( C.cream, C.rose, ss( 0.4, 0.8, ray ) * ( 0.75 - 0.3 * c.t ) ), C.red, beak );

		} },

	// Turkey wing (Arca zebra, 7 cm): a long boxy ark with a long straight hinge, heavy ribs, zigzag stripes of red-brown
	// on white like a turkey's wing
	turkeyWing: { kind: 'valve', nr: 3, around: 9, H: 0.24, rib: 0.008, ribN: 34, view: [ 1.0, 0, 0.2 ],
		outline: ( a ) => {

			// (a long straight hinge on one side, the rest a rounded box)
			const c = Math.cos( a ), s = Math.sin( a ), k = Math.pow( Math.pow( Math.abs( c ) / 0.58, 3.5 ) + Math.pow( Math.abs( s ) / 0.3, 3.5 ), - 1 / 3.5 );
			return [ c * k, Math.max( - 0.05, s ) * k + ( s < 0 ? s * 0.03 : 0 ) ];

		},
		colour: ( c ) => {

			if ( c.under ) return mix( C.white, C.purple, 0.15 );
			const z = Math.abs( fract( c.t * 3.4 + 0.5 * Math.abs( fract( c.a * 2.4 ) - 0.5 ) * 2 ) - 0.5 ) * 2;
			return mix( mix( C.bone, C.cream, 0.5 ), mix( C.rust, C.brown, 0.5 ), ss( 0.42, 0.58, z ) );

		} },

};

export function shellMesh( kind, detail = 1 ) {

	const S = SHAPES[ kind ];
	const m = S.kind === 'spiral' ? spiral( S, detail ) : S.kind === 'ovoid' ? ovoid( S, detail ) : valve( S, detail );
	return layFlat( m, S );

}

// the shell's long axis along x, its length 1, centred; (a gastropod's coil axis tipped over onto its side)
function layFlat( m, S ) {

	const { p, n } = m, nv = p.length / 3;
	if ( S.kind === 'spiral' ) {

		// (coil axis y -> x: apex +x; then rolled so the broadest side's down)
		for ( let i = 0; i < nv; i ++ ) for ( const a of [ p, n ] ) {

			const x = a[ i * 3 ], y = a[ i * 3 + 1 ];
			a[ i * 3 ] = y;
			a[ i * 3 + 1 ] = - x;

		}

	}

	let x0 = 1e9, x1 = - 1e9, y0 = 1e9, y1 = - 1e9, z0 = 1e9, z1 = - 1e9;
	for ( let i = 0; i < nv; i ++ ) {

		x0 = Math.min( x0, p[ i * 3 ] );
		x1 = Math.max( x1, p[ i * 3 ] );
		y0 = Math.min( y0, p[ i * 3 + 1 ] );
		y1 = Math.max( y1, p[ i * 3 + 1 ] );
		z0 = Math.min( z0, p[ i * 3 + 2 ] );
		z1 = Math.max( z1, p[ i * 3 + 2 ] );

	}

	const L = Math.max( x1 - x0, 1e-6 ), mx = ( x0 + x1 ) / 2, my = ( y0 + y1 ) / 2, mz = ( z0 + z1 ) / 2;
	for ( let i = 0; i < nv; i ++ ) {

		p[ i * 3 ] = ( p[ i * 3 ] - mx ) / L;
		p[ i * 3 + 1 ] = ( p[ i * 3 + 1 ] - my ) / L;
		p[ i * 3 + 2 ] = ( p[ i * 3 + 2 ] - mz ) / L;

	}

	m.size = [ 1, ( y1 - y0 ) / L, ( z1 - z0 ) / L ];
	return m;

}

// ---- the picture

const rotate = ( v, [ rx, ry, rz ] ) => {

	let [ x, y, z ] = v, c = Math.cos( rx ), s = Math.sin( rx );
	[ y, z ] = [ y * c - z * s, y * s + z * c ];
	c = Math.cos( ry );
	s = Math.sin( ry );
	[ x, z ] = [ x * c + z * s, - x * s + z * c ];
	c = Math.cos( rz );
	s = Math.sin( rz );
	[ x, y ] = [ x * c - y * s, x * s + y * c ];
	return [ x, y, z ];

};
const srgb = ( v ) => 255 * ( v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow( v, 1 / 2.4 ) - 0.055 );

// how big a shell's picture needs to be for `scale` (px a shell's length): [ w, h ] (its view's bounds)
export function pictureSize( kind, scale ) {

	const m = shellMesh( kind, 1 ), V = SHAPES[ kind ].view;
	let x0 = 1e9, x1 = - 1e9, y0 = 1e9, y1 = - 1e9;
	for ( let i = 0; i < m.p.length / 3; i ++ ) {

		const q = rotate( [ m.p[ i * 3 ], m.p[ i * 3 + 1 ], m.p[ i * 3 + 2 ] ], V );
		x0 = Math.min( x0, q[ 0 ] );
		x1 = Math.max( x1, q[ 0 ] );
		y0 = Math.min( y0, q[ 1 ] );
		y1 = Math.max( y1, q[ 1 ] );

	}

	return [ Math.ceil( ( x1 - x0 ) * scale ) + 2, Math.ceil( ( y1 - y0 ) * scale ) + 2 ];

}

// RGBA bytes of the shell drawn to fill W x H: lit from the top left, as a shell book's plate is
export function shellPicture( kind, W, H, { silhouette = false, detail = 10 } = {} ) {

	const S = SHAPES[ kind ], m = shellMesh( kind, Math.max( 3, detail ) ), V = S.view, nv = m.p.length / 3;
	const px = new Float32Array( nv ), py = new Float32Array( nv ), pz = new Float32Array( nv ), nz = [ [], [], [] ];
	let x0 = 1e9, x1 = - 1e9, y0 = 1e9, y1 = - 1e9;
	for ( let i = 0; i < nv; i ++ ) {

		const q = rotate( [ m.p[ i * 3 ], m.p[ i * 3 + 1 ], m.p[ i * 3 + 2 ] ], V ), w = rotate( [ m.n[ i * 3 ], m.n[ i * 3 + 1 ], m.n[ i * 3 + 2 ] ], V );
		px[ i ] = q[ 0 ];
		py[ i ] = - q[ 1 ];
		pz[ i ] = q[ 2 ];
		nz[ 0 ][ i ] = w[ 0 ];
		nz[ 1 ][ i ] = w[ 1 ];
		nz[ 2 ][ i ] = w[ 2 ];
		x0 = Math.min( x0, q[ 0 ] );
		x1 = Math.max( x1, q[ 0 ] );
		y0 = Math.min( y0, - q[ 1 ] );
		y1 = Math.max( y1, - q[ 1 ] );

	}

	const k = Math.min( ( W - 2 ) / ( x1 - x0 ), ( H - 2 ) / ( y1 - y0 ) ), ox = ( W - ( x1 - x0 ) * k ) / 2 - x0 * k, oy = ( H - ( y1 - y0 ) * k ) / 2 - y0 * k;
	// (supersampled twice, for clean edges)
	const SS = 2, w2 = W * SS, h2 = H * SS, Z = new Float32Array( w2 * h2 ).fill( - 1e9 ), Col = new Float32Array( w2 * h2 * 4 );
	const L = [ - 0.45, 0.62, 0.64 ], LH = Math.hypot( L[ 0 ], L[ 1 ], L[ 2 ] ), gloss = S.gloss ?? 0.25;
	const I = m.idx;
	for ( let t = 0; t < I.length; t += 3 ) {

		const a = I[ t ], b = I[ t + 1 ], c = I[ t + 2 ];
		const ax = ( px[ a ] * k + ox ) * SS, ay = ( py[ a ] * k + oy ) * SS, bx = ( px[ b ] * k + ox ) * SS, by = ( py[ b ] * k + oy ) * SS, cx = ( px[ c ] * k + ox ) * SS, cy = ( py[ c ] * k + oy ) * SS;
		const area = ( bx - ax ) * ( cy - ay ) - ( by - ay ) * ( cx - ax );
		if ( Math.abs( area ) < 1e-6 ) continue;
		const X0 = Math.max( 0, Math.floor( Math.min( ax, bx, cx ) ) ), X1 = Math.min( w2 - 1, Math.ceil( Math.max( ax, bx, cx ) ) );
		const Y0 = Math.max( 0, Math.floor( Math.min( ay, by, cy ) ) ), Y1 = Math.min( h2 - 1, Math.ceil( Math.max( ay, by, cy ) ) );
		for ( let y = Y0; y <= Y1; y ++ ) for ( let x = X0; x <= X1; x ++ ) {

			const w0 = ( ( bx - x ) * ( cy - y ) - ( by - y ) * ( cx - x ) ) / area, w1 = ( ( cx - x ) * ( ay - y ) - ( cy - y ) * ( ax - x ) ) / area, w3 = 1 - w0 - w1;
			if ( w0 < - 1e-4 || w1 < - 1e-4 || w3 < - 1e-4 ) continue;
			const zz = w0 * pz[ a ] + w1 * pz[ b ] + w3 * pz[ c ], q = y * w2 + x;
			if ( zz <= Z[ q ] ) continue;
			Z[ q ] = zz;
			let nx = w0 * nz[ 0 ][ a ] + w1 * nz[ 0 ][ b ] + w3 * nz[ 0 ][ c ], ny = - ( w0 * nz[ 1 ][ a ] + w1 * nz[ 1 ][ b ] + w3 * nz[ 1 ][ c ] ) * - 1, nw = w0 * nz[ 2 ][ a ] + w1 * nz[ 2 ][ b ] + w3 * nz[ 2 ][ c ];
			const l = Math.hypot( nx, ny, nw ) || 1;
			nx /= l;
			ny /= l;
			nw /= l;
			if ( nw < 0 ) {

				nx = - nx;
				ny = - ny;
				nw = - nw;

			}

			const d = Math.max( 0, ( nx * L[ 0 ] + ny * L[ 1 ] + nw * L[ 2 ] ) / LH );
			// (half-vector to the viewer: the polished ones' highlight)
			const hx = L[ 0 ] / LH, hy = L[ 1 ] / LH, hz = L[ 2 ] / LH + 1, hl = Math.hypot( hx, hy, hz );
			const spec = Math.pow( Math.max( 0, ( nx * hx + ny * hy + nw * hz ) / hl ), 40 ) * gloss * 0.7;
			const lit = 0.34 + 0.78 * d;
			for ( let e = 0; e < 3; e ++ ) Col[ q * 4 + e ] = ( w0 * m.c[ a * 3 + e ] + w1 * m.c[ b * 3 + e ] + w3 * m.c[ c * 3 + e ] ) * lit + spec;
			Col[ q * 4 + 3 ] = 1;

		}

	}

	const out = new Uint8ClampedArray( W * H * 4 );
	for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W; x ++ ) {

		let r = 0, g = 0, b = 0, al = 0;
		for ( let j = 0; j < SS; j ++ ) for ( let i = 0; i < SS; i ++ ) {

			const q = ( ( y * SS + j ) * w2 + x * SS + i ) * 4, A = Col[ q + 3 ];
			if ( ! A ) continue;
			al += 1;
			r += Col[ q ];
			g += Col[ q + 1 ];
			b += Col[ q + 2 ];

		}

		if ( ! al ) continue;
		const o = ( y * W + x ) * 4;
		if ( silhouette ) {

			out[ o ] = out[ o + 1 ] = out[ o + 2 ] = 255;
			out[ o + 3 ] = 255 * al / ( SS * SS );

		} else {

			out[ o ] = srgb( Math.min( 1, r / al ) );
			out[ o + 1 ] = srgb( Math.min( 1, g / al ) );
			out[ o + 2 ] = srgb( Math.min( 1, b / al ) );
			out[ o + 3 ] = 255 * al / ( SS * SS );

		}

	}

	return out;

}
