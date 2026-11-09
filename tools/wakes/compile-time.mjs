// (M17) How long a shader takes to build on a CPU's WebGL (SwiftShader, as the checks' browser draws): each program given,
// compiled, linked and drawn once (a CPU's driver builds its pipeline at the first draw) in a context of its own, the
// programs taken in turn round after round so the machine's load falls on each alike. Each source made unique each time, so
// nothing's taken from a cache.
//   node tools/wakes/compile-time.mjs <rounds> <name>=<vert>,<frag> [<name>=<vert>,<frag> ...]
//   (tools/wakes/ready-sources.mjs READY_SOURCES=<dir> writes a build's programs' sources)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ rounds, ...specs ] = process.argv.slice( 2 );
const programs = specs.map( ( s ) => {

	const [ name, files ] = s.split( '=' ), [ v, f ] = files.split( ',' );
	return { name, v: readFileSync( v, 'utf8' ), f: readFileSync( f, 'utf8' ), ms: [] };

} );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setContent( '<html><body></body></html>' );
for ( let r = 0; r < + rounds; r ++ ) for ( const p of programs ) {

	const ms = await page.evaluate( ( [ v, f, tag ] ) => {

		const canvas = document.createElement( 'canvas' );
		canvas.width = canvas.height = 8;
		const gl = canvas.getContext( 'webgl2' );
		const uniq = ( src ) => src.replace( /\n/, `\n// ${ tag }\n` );
		const t0 = performance.now();
		const make = ( type, src ) => {

			const s = gl.createShader( type );
			gl.shaderSource( s, uniq( src ) );
			gl.compileShader( s );
			return s;

		};
		const prog = gl.createProgram();
		// (a triangle over the whole target, whatever the attributes, so the fragment stage is built and run too: what the
		// vertex stage works out still goes to the varyings, so none of it's left out)
		// (and a constant of its own in each stage's code: a comment's gone before the driver's cache looks)
		const k = ( Math.random() * 1e-6 ).toExponential( 6 );
		gl.attachShader( prog, make( gl.VERTEX_SHADER, v.replace( /}\s*$/, `\tgl_Position = vec4( float( gl_VertexID == 1 ) * 4.0 - 1.0, float( gl_VertexID == 2 ) * 4.0 - 1.0, ${ k }, 1.0 );\n}` ) ) );
		gl.attachShader( prog, make( gl.FRAGMENT_SHADER, f.replace( /}\s*$/, `\tgl_FragColor.a += ${ k };\n}` ) ) );
		gl.linkProgram( prog );
		if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS ) ) return - 1;
		gl.useProgram( prog );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		gl.readPixels( 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array( 4 ) );
		const ms = performance.now() - t0;
		gl.getExtension( 'WEBGL_lose_context' )?.loseContext();
		return ms;

	}, [ p.v, p.f, `${ p.name } ${ r } ${ Math.random() }` ] );
	p.ms.push( ms );
	console.log( `round ${ r + 1} ${ p.name }: ${ ms < 0 ? 'did not link' : ( ms / 1000 ).toFixed( 2 ) + ' s' }` );

}

const median = ( a ) => {

	const s = [ ...a ].sort( ( x, y ) => x - y );
	return s[ s.length >> 1 ];

};
for ( const p of programs ) console.log( `${ p.name }: median ${ ( median( p.ms ) / 1000 ).toFixed( 2 ) } s of ${ p.ms.length }` );
await browser.close();
