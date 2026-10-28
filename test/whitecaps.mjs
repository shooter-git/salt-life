// (M14) The open sea's crests breaking (ocean/Whitecaps.js) and the spray off them (fx/WhitecapSpray.js):
// as much of the sea white as Monahan's share for the wind, each whitecap its own, breaking for a moment and
// leaving foam behind that thins, the spray where the crests are breaking, and the CPU's hash the GPU's.
import { Waves } from '../src/ocean/Waves.js';
import { Whitecaps, whitecapCover, COVER, CARRIERS, pcg3d } from '../src/ocean/Whitecaps.js';
import { WhitecapSpray } from '../src/fx/WhitecapSpray.js';
import { G } from '../src/core/Globals.js';

let failed = 0;
const ok = ( pass, label ) => {

	console.log( `${ pass ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! pass ) failed ++;

};

const waves = new Waves( { tier: 'mid' } );
const caps = new Whitecaps( { waves } );
const o = { roller: 0, foam: 0 };

// the share of the sea white (and rolling), over 300 m square at 1.2 m, at several times
const coverOf = ( c, U, times = 6 ) => {

	c.set( U );
	let white = 0, roll = 0, n = 0;
	for ( let k = 0; k < times; k ++ ) {

		const t = 1000 + k * 37.3;
		for ( let i = 0; i < 250; i ++ ) for ( let j = 0; j < 250; j ++ ) {

			c.foamAt( 500 + i * 1.2, 300 + j * 1.2, t, o );
			white += o.foam;
			roll += o.roller;
			n ++;

		}

	}

	return { white: white / n, roll: roll / n };

};

// ---- as much of the sea white as Monahan & O'Muircheartaigh's share for the wind
for ( const [ U, name ] of [ [ 7, 'a fair day' ], [ 11, 'a breezy day' ], [ 15, 'a blustery day' ] ] ) {

	const { white, roll } = coverOf( caps, U ), want = whitecapCover( U );
	console.log( `     ${ U } m/s: ${ ( white * 100 ).toFixed( 2 ) }% white (Monahan's ${ ( want * 100 ).toFixed( 2 ) }%), ${ ( roll * 100 ).toFixed( 3 ) }% breaking now; chance ${ caps.chance.map( ( c ) => c.toFixed( 3 ) ).join( ', ' ) }` );
	ok( Math.abs( white / want - 1 ) < 0.25, `${ name }'s whitecaps whiten Monahan's share of the sea (within a quarter)` );
	ok( roll > white * 0.05 && roll < white * 0.4, `${ name }: a share of them breaking now, the rest the foam they've left` );

}

const gale = coverOf( caps, 22 );
ok( gale.white > 0.05 && gale.white < 0.1, `a gale's capped: ${ ( gale.white * 100 ).toFixed( 1 ) }% white (past it the sea's streaked with blown foam)` );
caps.set( 2.5 );
ok( caps.cover.value === 0 && caps.chance.every( ( c ) => c === 0 ), 'in light airs none (glassy crests: nothing drawn for them)' );
ok( whitecapCover( 3 ) === 0 && whitecapCover( 4 ) > 0, 'they begin in a light breeze (3 m/s)' );
// (the share a wave's whitecaps whiten a unit of chance: COVER, as measured)
{

	const c = new Whitecaps( { waves } );
	c.set( 11 );
	c.size = 1;
	c.chance = [ 0.05, 0.05 ];
	let white = 0, n = 0;
	for ( let k = 0; k < 8; k ++ ) for ( let i = 0; i < 250; i ++ ) for ( let j = 0; j < 250; j ++ ) {

		c.foamAt( 500 + i * 1.3, 300 + j * 1.3, 2000 + k * 41.7, o );
		white += o.foam;
		n ++;

	}

	const per = white / n / 0.05 / CARRIERS.length;
	ok( Math.abs( per / COVER - 1 ) < 0.08, `COVER is what a unit of chance whitens (${ per.toFixed( 4 ) }, COVER ${ COVER })` );

}

// ---- each its own, breaking for a moment and leaving its foam to thin behind it
caps.set( 11 );
{

	const found = [];
	for ( let k = 0; k < 20; k ++ ) caps.rollers( 0, 0, 120, 500 + k * 13.7, ( x, z, along, half, on ) => found.push( half ) );
	found.sort( ( a, b ) => a - b );
	const small = found[ Math.floor( found.length * 0.1 ) ], big = found[ Math.floor( found.length * 0.9 ) ];
	console.log( `     a breezy day: ${ found.length } crests breaking in 20 looks within 120 m; their stretch ${ ( 2 * small ).toFixed( 1 ) } to ${ ( 2 * big ).toFixed( 1 ) } m (tenth to ninetieth)` );
	ok( found.length > 20 && big > small * 2.5, 'no two alike: some short, some several times longer' );

}

{

	// at points about the sea over a minute: breaking only now and then, and white mostly after it broke
	let on = 0, n = 0, after = 0, white = 0;
	for ( let p = 0; p < 300; p ++ ) {

		const x = 200 + ( p * 37 ) % 300, z = 300 + ( p * 53 ) % 300;
		let last = - 1e9;
		for ( let t = 0; t < 60; t += 0.1 ) {

			caps.foamAt( x, z, 1000 + t, o );
			if ( o.roller > 0.2 ) {

				on ++;
				last = t;

			}

			if ( o.foam > 0.3 ) {

				white ++;
				if ( t - last < 12 ) after ++;

			}

			n ++;

		}

	}

	ok( on > 0 && on / n < 0.03, `a crest breaks over a spot only now and then (${ ( on / n * 100 ).toFixed( 2 ) }% of the time)` );
	ok( after / white > 0.95, `the foam's where a crest broke in the last few seconds (${ ( after / white * 100 ).toFixed( 0 ) }%)` );

}

{

	// the foam left thins as it ages: just behind the crests whiter than further back
	let near = 0, nn = 0, far = 0, nf = 0;
	const w = waves.waves[ CARRIERS[ 1 ].wave ], L = 2 * Math.PI / w.k;
	for ( let k = 0; k < 30; k ++ ) caps.rollers( 0, 0, 150, 300 + k * 11.3, ( x, z, along, half ) => {

		if ( Math.abs( along[ 0 ] + w.dz ) > 1e-6 ) return;
		// (behind it: against its travel)
		for ( const [ back, isNear ] of [ [ 0.15, true ], [ 1.6, false ] ] ) {

			caps.foamAt( x - w.dx * back * L, z - w.dz * back * L, 300 + k * 11.3, o );
			if ( isNear ) {

				near += o.foam;
				nn ++;

			} else {

				far += o.foam;
				nf ++;

			}

		}

	} );
	ok( nn > 5 && near / nn > 2 * far / Math.max( 1, nf ), `the foam left behind a breaking crest thins as it ages (${ ( near / nn ).toFixed( 2 ) } just behind it, ${ ( far / Math.max( 1, nf ) ).toFixed( 2 ) } a wavelength and a half back)` );

}

// ---- the spray's crests are the ones drawn: what rollers() finds is breaking where foamAt says so
{

	let found = 0, agree = 0;
	for ( let k = 0; k < 15; k ++ ) {

		const t = 700 + k * 9.1;
		caps.rollers( 50, 80, 60, t, ( x, z, along, half, on ) => {

			found ++;
			caps.foamAt( x, z, t, o );
			if ( o.roller > 0.3 ) agree ++;

		} );

	}

	ok( found > 10 && agree / found > 0.9, `the crests breaking near you (${ found }) are where they're drawn breaking (${ ( agree / found * 100 ).toFixed( 0 ) }%)` );
	// and every spot drawn breaking (its roller's full) has its crest found
	let rolling = 0, near = 0;
	for ( let k = 0; k < 30; k ++ ) {

		const t = 900 + k * 7.7, list = [];
		caps.rollers( 0, 0, 70, t, ( x, z, along, half ) => list.push( { x, z, half } ) );
		for ( let i = 0; i < 120; i ++ ) for ( let j = 0; j < 120; j ++ ) {

			const x = - 50 + i * 0.85, z = - 50 + j * 0.85;
			caps.foamAt( x, z, t, o );
			if ( o.roller < 0.9 ) continue;
			rolling ++;
			if ( list.some( ( r ) => Math.hypot( r.x - x, r.z - z ) < r.half + 3 ) ) near ++;

		}

	}

	ok( rolling > 0 && near / rolling > 0.9, `each crest drawn breaking near you is found for its spray (${ near } of ${ rolling })` );

}

// ---- on every tier the same (the low tier draws four waves: the wind sea's two are among them)
{

	const low = new Whitecaps( { waves: new Waves( { tier: 'low' } ) } ), high = new Whitecaps( { waves: new Waves( { tier: 'high' } ) } );
	low.set( 11 );
	high.set( 11 );
	let same = 0, n = 0;
	const a = { roller: 0, foam: 0 }, b = { roller: 0, foam: 0 };
	for ( let i = 0; i < 4000; i ++ ) {

		low.foamAt( i * 1.7, ( i * 7 ) % 400, 1200, a );
		high.foamAt( i * 1.7, ( i * 7 ) % 400, 1200, b );
		if ( Math.abs( a.foam - b.foam ) < 1e-9 ) same ++;
		n ++;

	}

	ok( same === n, 'the same whitecaps on every tier' );
	// (turning with the wind: still whole numbers, no NaN)
	waves.setWindDir( { x: 0.9, y: 0.43 }, { x: 30, z: 40 } );
	caps.set( 11 );
	caps.foamAt( 12, 34, 500, o );
	ok( Number.isFinite( o.foam ) && Number.isFinite( o.roller ), 'turned with the wind, they carry on' );

}

// ---- the CPU's hash is the GPU's (pcg3d: uint arithmetic, wrapped), against one in BigInt
{

	const M = ( 1n << 32n ) - 1n;
	const ref = ( x, y, z ) => {

		let v = [ BigInt( x ), BigInt( y ), BigInt( z ) ].map( ( a ) => ( a * 1664525n + 1013904223n ) & M );
		const mix = () => {

			v[ 0 ] = ( v[ 0 ] + v[ 1 ] * v[ 2 ] ) & M;
			v[ 1 ] = ( v[ 1 ] + v[ 2 ] * v[ 0 ] ) & M;
			v[ 2 ] = ( v[ 2 ] + v[ 0 ] * v[ 1 ] ) & M;

		};

		mix();
		v = v.map( ( a ) => a ^ ( a >> 16n ) );
		mix();
		return v.map( Number );

	};

	let same = true;
	const out = [ 0, 0, 0 ];
	for ( const [ x, y, z ] of [ [ 0, 0, 0 ], [ 1, 2, 3 ], [ 4294967293, 7, 0x68bc21eb ], [ 123456789, 987654321, 0x51ed27 ], [ 0xffffffff, 0xffffffff, 0xffffffff ] ] ) {

		pcg3d( x, y, z, out );
		const r = ref( x, y, z );
		if ( out[ 0 ] !== r[ 0 ] || out[ 1 ] !== r[ 1 ] || out[ 2 ] !== r[ 2 ] ) same = false;

	}

	ok( same, 'the whitecaps\' hash on the CPU is the GPU\'s (pcg3d), so the spray flies where they\'re drawn' );

}

// ---- the spray off them: a few drops on a fair day, more and mist in a strong breeze, none in calm
{

	const spray = { emits: [ 0, 0, 0, 0, 0 ], emit( p, v, count, size, kind ) {

		this.emits[ kind ] += count;

	} };
	const camera = { position: { x: 50, y: 2.5, z: 80 } };
	const run = ( U, seconds = 20 ) => {

		const caps2 = new Whitecaps( { waves } );
		caps2.set( U );
		const ws = new WhitecapSpray( { spray, caps: caps2, waves, tier: 'high' } );
		spray.emits.fill( 0 );
		G.windSpeed.value = U;
		for ( let t = 0; t < seconds; t += 1 / 30 ) {

			G.time.value = 400 + t;
			ws.update( 1 / 30, camera );

		}

		return spray.emits.map( ( n ) => n / seconds );

	};

	const calm = run( 2.5 ), fair = run( 7 ), breezy = run( 13 );
	const fmt = ( e ) => `${ e[ 0 ].toFixed( 1 ) } drops, ${ e[ 3 ].toFixed( 1 ) } puffs, ${ e[ 1 ].toFixed( 1 ) } mists a second`;
	console.log( `     spray within 45 m: fair ${ fmt( fair ) }; 13 m/s ${ fmt( breezy ) }` );
	ok( calm.every( ( n ) => n === 0 ), 'none in light airs' );
	ok( fair[ 0 ] > 0.5 && fair[ 1 ] === 0, 'on a fair day a few drops off the crests breaking near you, no mist' );
	ok( breezy[ 0 ] > fair[ 0 ] * 3 && breezy[ 1 ] > 0 && breezy[ 3 ] > fair[ 3 ], 'in a strong breeze more, and mist torn off them' );
	ok( breezy.reduce( ( a, b ) => a + b, 0 ) <= 170, 'never more than the tier\'s most a second' );
	G.windSpeed.value = 7;
	G.time.value = 0;

}

console.log( failed ? `\n${ failed } failed` : '\nall ok' );
process.exit( failed ? 1 : 0 );
