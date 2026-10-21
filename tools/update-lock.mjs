#!/usr/bin/env node
// Writes assets.lock.json: every asset file in the project with its licence and where it came from,
// which All the Spaces checks before publishing. The credits come from CREDITS.md and the files in
// credits/ (outside public/: a creation can't serve Markdown), so those stay the single record.
//
//   node tools/update-lock.mjs           rewrite assets.lock.json
//   node tools/update-lock.mjs --check   fail if it's out of date or a file has no known licence

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const LOCK = join( ROOT, 'assets.lock.json' );

// The same lists All the Spaces uses (packages/qa/src/licenses.ts, snapshot.ts).
const ASSET_EXTENSIONS = new Set( [ 'glb', 'gltf', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'ktx2', 'hdr', 'exr', 'mp3', 'ogg', 'opus', 'wav', 'm4a', 'flac', 'mp4', 'webm', 'woff', 'woff2', 'ttf', 'otf' ] );
const SKIP_DIRS = new Set( [ 'node_modules', 'dist', '.git', '.vite', '.turbo', '.cache', 'qa-output' ] );

const TIDEWATER = 'https://github.com/dgreenheck/tidewater';
const TIDEWATER_AUTHOR = 'Dan Greenheck (DRG Software Solutions)';

function walk( dir, out = [] ) {

	for ( const entry of readdirSync( dir, { withFileTypes: true } ) ) {

		if ( entry.isDirectory() ) {

			if ( ! SKIP_DIRS.has( entry.name ) && ! ( dir === ROOT && entry.name === 'request' ) ) walk( join( dir, entry.name ), out );

		} else if ( ASSET_EXTENSIONS.has( entry.name.split( '.' ).pop().toLowerCase() ) ) {

			out.push( relative( ROOT, join( dir, entry.name ) ).split( sep ).join( '/' ) );

		}

	}

	return out;

}

// credits/audio.md: | `file.ogg` | use | [title](url), … | author, … | licence |
function audioCredits() {

	const credits = new Map();
	for ( const line of readFileSync( join( ROOT, 'credits/audio.md' ), 'utf8' ).split( '\n' ) ) {

		const cells = line.split( '|' ).map( ( c ) => c.trim() );
		const file = /^`([^`]+\.(?:ogg|m4a))`$/.exec( cells[ 1 ] ?? '' );
		if ( ! file ) continue;
		const links = [ ...cells[ 3 ].matchAll( /\[([^\]]+)\]\(([^)]+)\)/g ) ];
		if ( ! links.length || ! /CC0/.test( cells[ 5 ] ) ) throw new Error( `credits/audio.md: no CC0 source for ${ file[ 1 ] }` );
		credits.set( file[ 1 ], {
			source: links[ 0 ][ 2 ],
			title: links.map( ( l ) => l[ 1 ] ).join( '; ' ).slice( 0, 200 ),
			author: cells[ 4 ].slice( 0, 200 ),
		} );

	}

	return credits;

}

const polyHaven = ( id ) => ( { license: 'CC0-1.0', source: `https://polyhaven.com/a/${ id }`, author: 'Poly Haven' } );

const FONTS = {
	'PermanentMarker-Regular.ttf': { license: 'Apache-2.0', source: 'https://fonts.google.com/specimen/Permanent+Marker', title: 'Permanent Marker', author: 'Font Diner' },
	'CabinSketch-Bold.ttf': { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Cabin+Sketch', title: 'Cabin Sketch', author: 'Pablo Impallari' },
	'Oswald.ttf': { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Oswald', title: 'Oswald', author: 'Vernon Adams, Kalapi Gajjar, Cyreal' },
};

// the HUD's fonts (src/ui/fonts: Fontsource's latin subsets of the Google Fonts files)
const HUD_FONTS = {
	'inter': { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Inter', title: 'Inter', author: 'The Inter Project Authors' },
	'jetbrains-mono': { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/JetBrains+Mono', title: 'JetBrains Mono', author: 'The JetBrains Mono Project Authors' },
	'caveat-brush': { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Caveat+Brush', title: 'Caveat Brush', author: 'Google' },
	'kalam': { license: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Kalam', title: 'Kalam', author: 'Indian Type Foundry' },
};

function creditFor( path, audio ) {

	const name = path.split( '/' ).pop();
	let m;

	if ( path.startsWith( 'public/audio/' ) ) {

		const credit = audio.get( name ) ?? audio.get( name.replace( /\.m4a$/, '.ogg' ) );
		return credit && { license: 'CC0-1.0', ...credit };

	}

	if ( path.startsWith( 'public/models/debris/' ) && ( m = /^(dead_quiver_trunk|dead_quiver_branch_0\d|lambis_shell)/.exec( name ) ) ) return polyHaven( m[ 1 ] );
	if ( path.startsWith( 'public/models/props/' ) ) {

		if ( ( m = /^s_(.+)_[anr]\.jpg$/.exec( name ) ) ) return polyHaven( m[ 1 ] );
		if ( ( m = /^p_(.+)_\d+_[anr]\.jpg$/.exec( name ) ) ) return polyHaven( m[ 1 ] );
		if ( name === 'props.bin' ) return { license: 'CC0-1.0', source: 'https://polyhaven.com/models', title: 'Stall props (decimated Poly Haven models)', author: 'Poly Haven' };
		if ( name === 'signs.png' ) return { license: 'MIT', source: TIDEWATER, title: 'Stall signs', author: TIDEWATER_AUTHOR };

	}

	if ( path.startsWith( 'public/models/characters/' ) ) return { license: 'MIT', source: 'https://github.com/microsoft/Microsoft-Rocketbox', title: `Rocketbox avatar (${ name })`, author: 'Microsoft Corporation' };
	if ( path.startsWith( 'public/models/whale/' ) ) return { license: 'MIT', source: TIDEWATER, title: 'Humpback whale', author: TIDEWATER_AUTHOR };
	if ( path.startsWith( 'public/textures/smaa/' ) ) return { license: 'MIT', source: 'https://github.com/mrdoob/three.js/tree/dev/examples/jsm/postprocessing', title: 'SMAA lookup textures', author: 'three.js authors; J. Jimenez et al.' };
	if ( path.startsWith( 'tools/props/fonts/' ) ) return FONTS[ name ];
	if ( path.startsWith( 'src/ui/fonts/' ) ) return HUD_FONTS[ name.replace( /-latin.*$/, '' ) ];
	// made for Salt Life (the baked island: tools/bake-terrain.mjs)
	if ( path.startsWith( 'public/world/' ) ) return { license: 'own', title: 'The island, baked by tools/bake-terrain.mjs' };

	return null;

}

const audio = audioCredits();
const assets = [];
const unknown = [];
for ( const path of walk( ROOT ).sort() ) {

	const credit = creditFor( path, audio );
	if ( credit ) assets.push( { path, ...credit } );
	else unknown.push( path );

}

if ( unknown.length ) {

	console.error( 'No known licence for:\n' + unknown.map( ( p ) => '  ' + p ).join( '\n' ) + '\nAdd it to tools/update-lock.mjs (and its credit to credits/ or CREDITS.md).' );
	process.exit( 1 );

}

const text = JSON.stringify( {
	$comment: 'Every asset in the project, its licence and where it came from. Written by tools/update-lock.mjs from CREDITS.md and credits/: change those, then run `pnpm lock`.',
	assets,
}, null, '\t' ) + '\n';

if ( process.argv.includes( '--check' ) ) {

	let current = '';
	try {

		current = readFileSync( LOCK, 'utf8' );

	} catch {}

	if ( current !== text ) {

		console.error( 'assets.lock.json is out of date: run `pnpm lock`.' );
		process.exit( 1 );

	}

	console.log( `assets.lock.json lists all ${ assets.length } assets.` );

} else {

	writeFileSync( LOCK, text );
	console.log( `Wrote assets.lock.json (${ assets.length } assets).` );

}
