// (M17) The wakes' far arms as waves (ocean/WakeWaves.js), under Node: their shape against the sources, a straight run's arms
// where the foam's are, a turn and a stop, the boat clear of her own, the tier's budget, the uniforms about the sea's origin,
// the water query riding them, and a kayak rocking in a console's wake at speed (the real controller on the CPU's sea).
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { WakeWaves, WAKE, wakeTan, wakeCos, wakeHeight } = await import( '../src/ocean/WakeWaves.js' );
const { Waves } = await import( '../src/ocean/Waves.js' );
const { WaterQuery } = await import( '../src/ocean/WaterQuery.js' );
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { Euler, Vector3 } = await import( '../src/engine/index.js' );
const { G } = await import( '../src/core/Globals.js' );

let failed = 0;
const ok = ( c, s ) => {

	if ( ! c ) failed ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );

};
const kn = 0.5144, g = 9.81;
G.seaLevel.value = 0;

// ---- their shape, from the sources
{

	// (the wake's angle: Kelvin's under Fr 0.5, Rabaud & Moisy's past it; the divergent waves' way at it, the cusp's 35.26 degrees)
	ok( Math.abs( Math.acos( wakeCos( 3, 100 ) ) * 57.296 - 35.26 ) < 0.05, 'a slow boat\'s arms carry Kelvin\'s cusp waves, 35.26 degrees off her track' );
	for ( const [ U, L ] of [ [ 12, 5.61 ], [ 22, 5.61 ], [ 13, 12.84 ] ] ) {

		const cs = wakeCos( U, L ), t = Math.tan( Math.acos( cs ) ), psi = t / ( 1 + 2 * t * t );
		ok( Math.abs( psi - wakeTan( U, L ) ) < 1e-9, `at ${ ( U / kn ).toFixed( 0 ) } kn (L ${ L }) the crests' energy goes out at the wake's angle, ${ ( Math.atan( psi ) * 57.3 ).toFixed( 1 ) } degrees` );

	}

	// (their length: Kelvin's cusp waves, 2/3 of 2 pi U^2 / g, under it; her waterline's length on the plane, as Rabaud & Moisy's
	// argument has it, and Macfarlane's ski boat's wave B, 2.0 to 2.3 s)
	const lam = ( U, L ) => 2 * Math.PI * ( U * wakeCos( U, L ) ) ** 2 / g;
	ok( Math.abs( lam( 3, 100 ) - 2 / 3 * 2 * Math.PI * 9 / g ) < 1e-6, 'Kelvin\'s cusp waves: 2/3 of a transverse wave\'s length' );
	ok( Math.abs( lam( 22, 5.61 ) / 5.61 - 1 ) < 0.01, `on the plane, her waves her waterline's length (43 kn: ${ lam( 22, 5.61 ).toFixed( 2 ) } m)` );
	const T = ( U, L ) => Math.sqrt( 2 * Math.PI * lam( U, L ) / g );
	ok( T( 22 * kn, 6 ) > 1.85 && T( 22 * kn, 6 ) < 2.3, `a 6 m ski boat's at 22 kn: ${ T( 22 * kn, 6 ).toFixed( 2 ) } s (Macfarlane's wave B, 2.1 s)` );

	// (their height: Macfarlane et al.'s ski boat, L / V^1/3 4.79, 4.18 lengths off its track)
	const L = 6, vol = ( L / 4.79 ) ** 3, y = 4.18 * L;
	for ( const [ k, H ] of [ [ 12, 0.198 ], [ 22, 0.10 ], [ 30, 0.052 ] ] ) {

		const h = wakeHeight( k * kn, L, vol, y );
		ok( Math.abs( h / H - 1 ) < 0.2, `a ski boat at ${ k } kn: ${ h.toFixed( 3 ) } m, crest to trough, 4.18 lengths off (Macfarlane: ${ H })` );

	}

	// (the divergent waves' decay off her track, y^-1/3; and the slimmer the hull the less, their Fig. 6)
	ok( Math.abs( wakeHeight( 12, 6, 2, 80 ) / wakeHeight( 12, 6, 2, 10 ) - Math.cbrt( 10 / 80 ) ) < 1e-9, 'as y^-1/3 off her track' );
	ok( wakeHeight( 8, 17, 12 / 1.025, 20 ) < wakeHeight( 8, 17, 40, 20 ), 'a slimmer hull of her length leaves less' );
	// (the 17 m monohull of their Fig. 8, 12 t, 20 m off: 0.33 m at its highest)
	const H17 = Math.max( ...[ 5, 6, 7, 8, 9, 10 ].map( ( U ) => wakeHeight( U, 17, 12 / 1.025, 20 ) ) );
	ok( H17 > 0.22 && H17 < 0.4, `their 17 m monohull, 20 m off at its highest: ${ H17.toFixed( 2 ) } m (Macfarlane: 0.33 in 6 m of water)` );
	ok( wakeHeight( 0.5, 5.61, 2.49, 10 ) === 0, 'a boat barely moving leaves none' );

}

// a straight run: the boat at speed U along +x for `secs`, followed as the game does, 30 frames a second
function run( w, key, U, secs, L, vol, at = { x: 0, z: 0 }, dir = 0, t0 = 0, each ) {

	let t = t0;
	const dx = Math.cos( dir ), dz = Math.sin( dir );
	for ( let f = 0; f < secs * 30; f ++ ) {

		t += 1 / 30;
		const d = U * ( t - t0 );
		w.follow( key, at.x + dx * d, at.z + dz * d, dx * U, dz * U, L, vol, t );
		if ( each ) each( t );
		w.update( t, { x: at.x + dx * d, z: at.z + dz * d } );

	}

	return { t, x: at.x + dx * U * ( t - t0 ), z: at.z + dz * U * ( t - t0 ) };

}

// ---- a console at cruise, in a straight line: her arms where the foam's are, her train, her hull clear of it
{

	const w = new WakeWaves( { tier: 'high' } ), U = 23 * kn, L = 5.61, vol = 2.49;
	const end = run( w, 'own', U, 80, L, vol );
	ok( w.count === 1 && w.n <= 18, `one track, ${ w.n } samples for 80 s straight` );
	const tan = wakeTan( U, L );
	for ( const back of [ 100, 200, 400 ] ) {

		let best = 0, at = 0;
		for ( let z = 0; z <= 100; z += 0.1 ) {

			const h = Math.abs( w.heightAt( end.x - back, z ) );
			if ( h > best ) {

				best = h;
				at = z;

			}

		}

		const lam = 2 * Math.PI * ( U * wakeCos( U, L ) ) ** 2 / g;
		ok( Math.abs( at - back * tan ) < lam, `${ back } m astern, her arm's highest crest ${ at.toFixed( 1 ) } m off her track (the foam's arm: ${ ( back * tan ).toFixed( 1 ) })` );
		const H = wakeHeight( U, L, vol, back * tan );
		ok( Math.abs( 2 * best / H - 1 ) < 0.25, `  and as high as Macfarlane's fit there: ${ ( 2 * best ).toFixed( 3 ) } m against ${ H.toFixed( 3 ) }` );

	}

	// (the same either side)
	let port = 0, stbd = 0;
	for ( let z = 0; z <= 40; z += 0.1 ) {

		port = Math.max( port, Math.abs( w.heightAt( end.x - 200, z ) ) );
		stbd = Math.max( stbd, Math.abs( w.heightAt( end.x - 200, - z ) ) );

	}

	ok( Math.abs( port - stbd ) < 0.002, 'her two arms alike' );
	// (her hull, 7.1 m long and 2.6 wide about her middle, and the bow wave ahead: nothing of her own wake)
	let hull = 0;
	for ( let x = - 4; x <= 12; x += 0.25 ) for ( let z = - 1.5; z <= 1.5; z += 0.25 ) hull = Math.max( hull, Math.abs( w.heightAt( end.x + x, end.z + z ) ) );
	ok( hull < 1e-6, `none on her own hull: ${ hull.toExponential( 1 ) } m` );
	// (no crests outside the arms, past the train's front: 5 wavelengths out)
	let outside = 0;
	for ( let z = 0; z <= 30; z += 0.5 ) outside = Math.max( outside, Math.abs( w.heightAt( end.x - 200, 200 * tan + 5 * 5.61 + z ) ) );
	ok( outside < 1e-3, `still water outside her arms: ${ outside.toFixed( 5 ) } m` );
	// (where the arm's lengths meet: no step in it, along the arm's line out to its end)
	let step = 0, prev = null;
	for ( let b = 30; b <= 600; b += 0.05 ) {

		const h = w.heightAt( end.x - b, b * tan );
		if ( prev !== null ) step = Math.max( step, Math.abs( h - prev ) );
		prev = h;

	}

	ok( step < 0.004, `smooth along her arm, its lengths' joins and all: at most ${ ( step * 1000 ).toFixed( 1 ) } mm in 5 cm` );
	// (and nothing past 75 s of her track)
	ok( Math.abs( w.heightAt( end.x - U * 90, U * 90 * tan ) ) < 1e-9, 'nothing past where her arms are followed out to' );
	// (the slope given is the height's)
	const sl = [ 0, 0 ], x = end.x - 150, z = 150 * tan - 2, e = 1e-4;
	w.heightAt( x, z, sl );
	const fx = ( w.heightAt( x + e, z ) - w.heightAt( x - e, z ) ) / ( 2 * e ), fz = ( w.heightAt( x, z + e ) - w.heightAt( x, z - e ) ) / ( 2 * e );
	ok( Math.hypot( sl[ 0 ] - fx, sl[ 1 ] - fz ) < 0.1 * Math.hypot( fx, fz ) + 1e-4, `its slope is its height's (${ sl.map( ( v ) => v.toFixed( 4 ) ) } against ${ fx.toFixed( 4 ) }, ${ fz.toFixed( 4 ) })` );

}

// ---- a turn, a stop, a jump, and the boats in company within the tier's budget
{

	const w = new WakeWaves( { tier: 'low' } ), L = 5.61, vol = 2.49, U = 12;
	// (a full circle of 30 m radius: samples as she turns, the arms continuous)
	let t = 0;
	const R = 30;
	for ( let f = 0; f < 30 * 2 * Math.PI * R / U; f ++ ) {

		t += 1 / 30;
		const a = U * t / R;
		w.follow( 'own', R * Math.sin( a ), R - R * Math.cos( a ), U * Math.cos( a ), U * Math.sin( a ), L, vol, t );
		w.update( t, { x: 0, z: 0 } );

	}

	ok( w.n <= w.max && w.n >= 10, `a circle at 23 kn: ${ w.n } samples sent of ${ w.max }` );
	let finite = true;
	for ( let x = - 80; x <= 80; x += 2 ) for ( let z = - 60; z <= 120; z += 2 ) if ( ! Number.isFinite( w.heightAt( x, z ) ) || Math.abs( w.heightAt( x, z ) ) > 0.5 ) finite = false;
	ok( finite, 'her wake round a turn finite and no higher than her straight run\'s could be' );
	// (stopped: her arms go on out, and are let go when they're old)
	const at = { x: R * Math.sin( U * t / R ), z: R - R * Math.cos( U * t / R ) };
	for ( let f = 0; f < 30 * 90; f ++ ) {

		t += 1 / 30;
		w.follow( 'own', at.x, at.z, 0, 0, L, vol, t );
		w.update( t, at );

	}

	ok( w.count === 0 && w.tracks.get( 'own' ).n === 0, 'stopped 90 s, her wake\'s gone and her samples let go' );
	// (moved, not run: her track begins again where she is, no arm drawn between)
	const w2 = new WakeWaves( { tier: 'high' } );
	const e1 = run( w2, 'own', 12, 20, L, vol );
	run( w2, 'own', 12, 20, L, vol, { x: e1.x + 5000, z: 0 }, 0, e1.t );
	let between = 0;
	for ( let x = e1.x + 400; x < e1.x + 4600; x += 50 ) for ( let z = - 50; z <= 50; z += 2 ) between = Math.max( between, Math.abs( w2.heightAt( x, z ) ) );
	ok( between === 0, 'moved 5 km: nothing between where she was and where she is' );
	// (five boats under way on low: two tracks sent, the boat you're in among them, within its 24 samples)
	const w3 = new WakeWaves( { tier: 'low' } );
	let t3 = 0;
	for ( let f = 0; f < 30 * 40; f ++ ) {

		t3 += 1 / 30;
		w3.follow( 'own', 900 + 12 * t3, 0, 12, 0, L, vol, t3 );
		for ( let k = 0; k < 4; k ++ ) w3.followDrawn( 'p' + k, 12 * t3, 100 * k, 'console', t3 );
		w3.update( t3, { x: 0, z: 0 } );

	}

	ok( w3.count === 2 && w3.n <= 24, `five boats on low: ${ w3.count } wakes sent, ${ w3.n } samples` );
	ok( w3.span[ 0 ] === 0 && Math.abs( w3.s.x[ 0 ] - ( 900 + 12 * t3 ) ) < 1e-6, '  the boat you\'re in first, though she\'s furthest' );
	ok( w3.tracks.get( 'p0' ).head.U > 11.9 && w3.tracks.get( 'p0' ).head.U < 12.1, '  a boat in company\'s speed from her place frame to frame' );
	// (the hulls of the boats in company as their models have them)
	for ( const id of Object.keys( WAKE.hulls ) ) {

		const m = await loadBoat( id, 'low' ), [ L, vol ] = WAKE.hulls[ id ];
		ok( Math.abs( m.dimensions.waterlineLength - L ) < 0.01 && Math.abs( m.hydro.displacedVolume - vol ) < 0.01, `${ id }: ${ L } m on her waterline, ${ vol } m^3, as her model` );

	}

}

// ---- the uniforms about the sea's origin, as the CPU's samples less it; tens of km out the same crests
{

	const w = new WakeWaves( { tier: 'mid' } ), O = { x: 40960, z: - 20480 };
	const end = run( w, 'own', 15, 30, 5.61, 2.49, { x: 41000, z: - 20500 }, 0.6 );
	w.place( O );
	const A = w.uniforms.wakeA.value, B = w.uniforms.wakeB.value;
	let same = true;
	for ( let i = 0; i < w.n; i ++ ) if ( Math.abs( A[ i ].x - ( w.s.x[ i ] - O.x ) ) > 1e-9 || B[ i ].y !== w.s.k[ i ] || B[ i ].w !== w.s.amp[ i ] ) same = false;
	ok( same && w.uniforms.wakeTracks.value === 1, 'the uniforms are the CPU\'s samples about the sea\'s origin' );
	// (the GPU's sum, worked here in 32-bit floats from the uniforms as wakeAt reads them, against the CPU's in doubles)
	const f = Math.fround;
	const gpuAt = ( x, z ) => {

		let h = 0;
		const T = w.uniforms.wakeTrack.value, box = T[ 0 ], span = T[ 1 ];
		if ( x < box.x || z < box.y || x > box.z || z > box.w ) return 0;
		let pQ = [], pK = [], pc = [], pSig = 0, pLam = 0, pAmp = 0;
		for ( let s = span.x, i = 0; s < span.y; s ++, i ++ ) {

			const a = A[ s ], b = B[ s ], k = f( b.y ), cs = f( b.z ), sn = f( Math.sqrt( 1 - cs * cs ) ), om = f( Math.sqrt( g * k ) ), go = f( b.x * 0.5 * om / k );
			const d = [ f( Math.cos( a.z ) ), f( Math.sin( a.z ) ) ], side = [ - sn * d[ 1 ], sn * d[ 0 ] ], lam = f( 2 * Math.PI / k ), amp = f( b.w );
			for ( let e = 0; e < 2; e ++ ) {

				const sg0 = e === 0 ? - 1 : 1, n = [ cs * d[ 0 ] + sg0 * side[ 0 ], cs * d[ 1 ] + sg0 * side[ 1 ] ];
				const Q = [ f( f( a.x ) + go * n[ 0 ] ), f( f( a.y ) + go * n[ 1 ] ) ], K = [ f( k * n[ 0 ] ), f( k * n[ 1 ] ) ], c = f( K[ 0 ] * f( a.x ) + K[ 1 ] * f( a.y ) + om * b.x );
				if ( i > 0 ) {

					const ed = [ Q[ 0 ] - pQ[ e ][ 0 ], Q[ 1 ] - pQ[ e ][ 1 ] ], len = Math.max( Math.hypot( ...ed ), 1e-3 ), dir = [ ed[ 0 ] / len, ed[ 1 ] / len ], r = [ x - pQ[ e ][ 0 ], z - pQ[ e ][ 1 ] ];
					const al = r[ 0 ] * dir[ 0 ] + r[ 1 ] * dir[ 1 ], J = WAKE.join;
					const win = Math.min( 1, Math.max( 0, al / J + 0.5 ) ) * Math.min( 1, Math.max( 0, ( len - al ) / J + 0.5 ) ), t = Math.min( 1, Math.max( 0, al / len ) );
					const m = [ sg0 * dir[ 1 ], - sg0 * dir[ 0 ] ], u = r[ 0 ] * m[ 0 ] + r[ 1 ] * m[ 1 ];
					const sg = u > 0 ? 0.45 * ( pLam + ( lam - pLam ) * t ) : pSig + ( f( a.w ) - pSig ) * t, q = u / sg;
					if ( win > 0 && q * q < 12 ) {

						const env = f( Math.exp( - 0.5 * q * q ) * win * ( pAmp + ( amp - pAmp ) * t ) );
						const Kt = [ pK[ e ][ 0 ] + ( K[ 0 ] - pK[ e ][ 0 ] ) * t, pK[ e ][ 1 ] + ( K[ 1 ] - pK[ e ][ 1 ] ) * t ];
						h += env * Math.cos( f( f( Kt[ 0 ] * x + Kt[ 1 ] * z ) - f( pc[ e ] + ( c - pc[ e ] ) * t ) ) );

					}

				}

				pQ[ e ] = Q;
				pK[ e ] = K;
				pc[ e ] = c;

			}

			pSig = f( a.w );
			pLam = lam;
			pAmp = amp;

		}

		return h;

	};
	let worst = 0, scale = 0;
	const tan = wakeTan( 15, 5.61 ), dx = Math.cos( 0.6 ), dz = Math.sin( 0.6 );
	for ( let b = 20; b <= 400; b += 3.7 ) for ( let s = - 40; s <= 40; s += 0.9 ) {

		const x = end.x - dx * b - dz * s, z = end.z - dz * b + dx * s, cpu = w.heightAt( x, z );
		worst = Math.max( worst, Math.abs( cpu - gpuAt( f( x - O.x ), f( z - O.z ) ) ) );
		scale = Math.max( scale, Math.abs( cpu ) );

	}

	ok( scale > 0.03 && worst < 0.002, `41 km out, the shader's sum in floats about the origin as the CPU's in doubles: ${ ( worst * 1000 ).toFixed( 2 ) } mm at most, of crests ${ ( scale * 100 ).toFixed( 1 ) } cm` );
	void tan;

}

// ---- the water query rides them; a kayak rocking in a console's wake at speed (her real controller, the CPU's sea flat but
// for the wake)
{

	G.time.value = 0;
	G.windSpeed.value = 0;
	const waves = new Waves( { tier: 'high' } );
	waves.setSea( 0, 0 );
	const query = new WaterQuery( waves );
	const w = waves.wakes;
	run( w, 'own', 12, 40, 5.61, 2.49, { x: - 480, z: - 20 } );
	const d = [ 0, 0, 0 ];
	ok( Math.abs( waves.heightAt( - 100, - 15, 0 ) - w.heightAt( - 100, - 15 ) ) < 1e-9 && w.heightAt( - 100, - 15 ) !== 0, 'the sea\'s height on a flat sea is her wake\'s' );
	void d;
	const kayak = await loadBoat( 'kayak', 'low' );
	const ctl = new BoatController( { model: kayak, query, terrain: { heightAt: () => - 60 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	// (side on to it: her bow along the console's way)
	ctl.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), Math.PI / 2 );
	ctl.moored = false;
	const e = new Euler();
	const U = 30 * kn, dt = 1 / 30, track = [];
	const ww = new WakeWaves( { tier: 'high' } );
	waves.wakes = ww;
	let t = 0;
	// (still, 20 s; a console at 30 kn passing 30 m off her side from 300 m astern; 80 s after)
	for ( let f = 0; f < 30 * 100; f ++ ) {

		t += dt;
		G.time.value = t;
		const dist = - 300 + U * Math.max( 0, t - 20 );
		if ( t > 20 && dist < 1200 ) ww.follow( 'console', dist, 30, U, 0, 5.61, 2.49, t );
		ww.update( t, { x: 0, z: 0 } );
		ctl.queueQueries();
		query.update();
		ctl.update( dt );
		e.setFromQuaternion( ctl.quaternion, 'YXZ' );
		track.push( [ t, ctl.position.y, e.z * 57.3, e.x * 57.3, ww.heightAt( ctl.position.x, ctl.position.z ), ctl.position.x, ctl.position.z ] );

	}

	const span = ( rows, i ) => Math.max( ...rows.map( ( r ) => r[ i ] ) ) - Math.min( ...rows.map( ( r ) => r[ i ] ) );
	if ( process.env.WAKES_DEBUG ) for ( const r of track.filter( ( r, i ) => i % 30 === 0 ) ) console.log( r.map( ( v ) => v.toFixed( 3 ) ).join( ' ' ), ctl.position.x.toFixed( 2 ), ctl.position.z.toFixed( 2 ) );
	const still = track.filter( ( r ) => r[ 0 ] > 5 && r[ 0 ] < 20 ), after = track.filter( ( r ) => r[ 0 ] > 20 );
	const heave = span( after, 1 ), wake = span( after, 4 ), roll = span( after, 2 ), pitch = span( after, 3 );
	// (when it reaches her: 30 m off at the arm's angle, behind the console's passing)
	const first = after.find( ( r ) => Math.abs( r[ 4 ] ) > 0.01 );
	const passed = 20 + 300 / U, expect = 30 / Math.tan( Math.atan( wakeTan( U, 5.61 ) ) ) / U;
	console.log( `     a kayak 30 m off a console at 30 kn: the wake ${ ( wake * 100 ).toFixed( 1 ) } cm crest to trough, her heave ${ ( heave * 100 ).toFixed( 1 ) } cm, roll ${ roll.toFixed( 1 ) } and pitch ${ pitch.toFixed( 1 ) } degrees across; it reached her ${ ( first[ 0 ] - passed ).toFixed( 1 ) } s after the console passed` );
	ok( span( still, 1 ) < 0.005 && span( still, 2 ) < 0.5, 'a kayak lying still on a flat sea stays still' );
	ok( Math.abs( wake / wakeHeight( U, 5.61, 2.49, 30 ) - 1 ) < 0.35, `  the console's wake reaches her ${ ( wake * 100 ).toFixed( 1 ) } cm high (Macfarlane's fit 30 m off: ${ ( wakeHeight( U, 5.61, 2.49, 30 ) * 100 ).toFixed( 1 ) })` );
	ok( heave > 0.6 * wake && heave < 1.4 * wake, `  and she rides it: ${ ( heave * 100 ).toFixed( 1 ) } cm up and down` );
	ok( roll > 1 && roll < 25, `  rolling ${ roll.toFixed( 1 ) } degrees across, side on to it` );
	ok( Math.abs( first[ 0 ] - passed - expect ) < 4, `  ${ ( first[ 0 ] - passed ).toFixed( 1 ) } s after the console passes her (the arm's angle says ${ expect.toFixed( 1 ) })` );
	const ending = track.filter( ( r ) => r[ 0 ] > 95 );
	ok( span( ending, 2 ) < roll && Math.abs( ctl.position.y ) < 0.2, '  and settles as it goes by, upright' );

}

if ( failed ) {

	console.log( failed + ' failed' );
	process.exit( 1 );

}
