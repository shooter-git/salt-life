#!/usr/bin/env node
// (M20, stream CHECKS) The full two-player sweep: every two-player job M17 and M19 added, and M20's, each through
// tools/render-slot.sh (its slots shared with whatever else is drawing on the machine), a few at once, each job's log kept, and
// what failed written up: each job's SUMMARY line or how it ended, and every FAIL with the lines before it (docs/m20/checks.md).
//
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/sweep.mjs [out] [port] [jobs: all | names or milestones,
//   comma separated: m17,kit,...] [at once: 2]
//   out/<job>.log for each, out/sweep.json, out/sweep.md
//
// The jobs and what they check are in tools/two-players/README.md and the docs each names. A job's own pass or fail is its
// exit (lib.mjs' G.end: 1 for any FAIL or page error); one that runs past its minutes is stopped by render-slot.sh and counted
// as out of time, its log kept as far as it got; one that exits well having checked nothing (a part a job doesn't have) is
// counted as having run nothing.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const [ OUT = join( ROOT, 'qa-output/two-players/sweep' ), PORT = '5241', ONLY = 'all', AT_ONCE = '2' ] = process.argv.slice( 2 );
mkdirSync( OUT, { recursive: true } );

// [ name, milestone, script, its arguments after [out] [port], minutes it's given ]
const JOBS = [
	// (M17) what M16 left for guests aboard (docs/m17/together.md), the life lists, the flats together, the wakes together, and the
	// back stream's crew and picking-up-where-you-left-off (docs/m17/back.md)
	// (M17's `hold`, a fish too big for a guest's hold in hers, is crew.mjs' since: below)
	...[ 'seat', 'yard', 'tray', 'berths', 'pearl', 'specks', 'horn', 'ladder', 'chair', 'slow' ].map( ( p ) => [ `together-${ p }`, 'm17', 'together.mjs', [ p ], 30 ] ),
	[ 'life', 'm17', 'life.mjs', [], 40 ],
	...[ 'spook', 'hook', 'spot', 'late' ].map( ( p ) => [ `flats-${ p }`, 'm17', 'flats.mjs', [ p ], 30 ] ),
	[ 'wakes', 'm17', 'wakes.mjs', [ 'mid' ], 40 ],
	...[ 'rods', 'lights', 'traps', 'hold', 'box' ].map( ( p ) => [ `crew-${ p }`, 'm17', 'crew.mjs', [ p ], 40 ] ),
	[ 'aboard', 'm17', 'aboard.mjs', [ 'sportfisher' ], 45 ],
	[ 'resume', 'm17', 'resume.mjs', [ 'console' ], 60 ],
	[ 'resume-together', 'm17', 'resume-together.mjs', [ 'console' ], 60 ],
	// (M19) the seated guest by pad and touch, the fly rod, the stalls, the line-class records, a kayak's anchor kept over a load,
	// and the mate (asked for by M19, written by M20)
	[ 'together-seatpads', 'm19', 'together.mjs', [ 'seatpads' ], 30 ],
	...[ 'loop', 'spook' ].map( ( p ) => [ `fly-${ p }`, 'm19', 'fly.mjs', [ p ], 30 ] ),
	[ 'stalls', 'm19', 'stalls.mjs', [], 40 ],
	[ 'records', 'm19', 'records.mjs', [], 40 ],
	[ 'resume-kayakanchor', 'm19', 'resume.mjs', [ 'kayak', 'kayakanchor' ], 40 ],
	[ 'crew-mate', 'm19', 'crew.mjs', [ 'mate' ], 40 ],
	// (M20) the floats and the net on copies on each tier, and a kayak left on the sand (docs/m20/kit.md)
	...[ 'low', 'mid', 'high' ].map( ( t ) => [ `kit-${ t }`, 'm20', 'kit.mjs', [ t ], 40 ] ),
	[ 'resume-kayaksand', 'm20', 'resume.mjs', [ 'kayak', 'kayaksand' ], 40 ],
	// (M21) each rod, reel and line as itself on a copy, and her spread's rods in her holders, on each tier (docs/m21/gear.md)
	...[ 'low', 'mid', 'high' ].map( ( t ) => [ `gear-${ t }`, 'm21', 'gear.mjs', [ t ], 40 ] ),
];
const want = ONLY === 'all' ? null : new Set( ONLY.split( ',' ) );
const jobs = JOBS.filter( ( [ name, m ] ) => ! want || want.has( name ) || want.has( m ) );
const T0 = Date.now();
const mins = () => ( ( Date.now() - T0 ) / 60000 ).toFixed( 1 );
console.log( `${ jobs.length } jobs, ${ AT_ONCE } at once, against the dev server on ${ PORT }: ${ OUT }` );

function run( [ name, m, script, args, minutes ] ) {

	return new Promise( ( resolve ) => {

		const log = join( OUT, `${ name }.log` ), dir = join( OUT, name ), t = Date.now();
		mkdirSync( dir, { recursive: true } );
		const out = createWriteStream( log );
		const child = spawn( join( ROOT, 'tools/render-slot.sh' ), [ 'node', join( ROOT, 'tools/two-players', script ), dir, PORT, ...args ], { cwd: ROOT, env: { ...process.env, RENDER_MINUTES: String( minutes ) } } );
		child.stdout.pipe( out );
		child.stderr.pipe( out );
		child.on( 'close', ( code ) => {

			out.end( () => {

				const text = readFileSync( log, 'utf8' ), lines = text.split( '\n' );
				const fails = [];
				lines.forEach( ( l, i ) => {

					if ( /^FAIL /.test( l ) || /PAGEERROR|CONSOLE/.test( l ) ) fails.push( lines.slice( Math.max( 0, i - 3 ), i + 1 ).join( '\n' ) );

				} );
				const summary = lines.find( ( l ) => l.startsWith( 'SUMMARY' ) ) || null;
				const passes = lines.filter( ( l ) => /^ok /.test( l ) ).length;
				const r = { name, milestone: m, script, args, code: code === 0 && ! passes ? 'nothing' : code, minutes: + ( ( Date.now() - t ) / 60000 ).toFixed( 1 ), outOfTime: code === 124, passes, fails: lines.filter( ( l ) => /^FAIL /.test( l ) ).length, summary, failures: fails.slice( 0, 20 ), tail: code ? lines.filter( Boolean ).slice( - 6 ) : [] };
				console.log( `[${ mins() } min] ${ r.code === 0 ? 'pass' : r.code === 'nothing' ? 'RAN NOTHING' : r.outOfTime ? 'OUT OF TIME' : 'FAIL' } ${ name } (${ r.passes } ok, ${ r.fails } FAIL, ${ r.minutes } min)` );
				resolve( r );

			} );

		} );

	} );

}

const results = [], queue = jobs.slice();
await Promise.all( Array.from( { length: Math.max( 1, + AT_ONCE ) }, async () => {

	while ( queue.length ) results.push( await run( queue.shift() ) );

} ) );
results.sort( ( a, b ) => JOBS.findIndex( ( j ) => j[ 0 ] === a.name ) - JOBS.findIndex( ( j ) => j[ 0 ] === b.name ) );
writeFileSync( join( OUT, 'sweep.json' ), JSON.stringify( results, null, 1 ) );
const bad = results.filter( ( r ) => r.code !== 0 );
const md = [ `# The two-player sweep`, '', `${ results.length } jobs in ${ mins() } minutes: ${ results.length - bad.length } passed, ${ bad.length } didn't.`, '', '| Job | Milestone | Result | ok | FAIL | Minutes |', '|---|---|---|---|---|---|' ];
for ( const r of results ) md.push( `| ${ r.name } | ${ r.milestone.toUpperCase() } | ${ r.code === 0 ? 'pass' : r.code === 'nothing' ? 'ran nothing' : r.outOfTime ? 'out of time' : 'fail' } | ${ r.passes } | ${ r.fails } | ${ r.minutes } |` );
for ( const r of bad ) md.push( '', `## ${ r.name }`, '', `\`node tools/two-players/${ r.script } <dir> ${ PORT } ${ r.args.join( ' ' ) }\`: exit ${ r.code }${ r.summary ? `, ${ r.summary }` : '' }`, '', '```', ...( r.failures.length ? r.failures : r.tail ), '```' );
writeFileSync( join( OUT, 'sweep.md' ), md.join( '\n' ) + '\n' );
console.log( `${ results.length - bad.length } of ${ results.length } passed: ${ join( OUT, 'sweep.md' ) }` );
process.exit( bad.length ? 1 : 0 );
