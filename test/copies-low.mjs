// (v2.1.2) On a phone a copy of a boat (someone else's, or one of yours left out at sea and towed home) shows what's past
// her low meshes only when you're near her (BoatCopies.make, near). It was only so for a type that was yours when the copy
// was made: a template made while she was yours keeps all of her, and once you'd taken another boat out, her copies drew
// her fittings at any distance (26k triangles: the checks' village after a hurricane went over low's 300k).
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = ( c, s ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );
	if ( ! c ) failed ++;

};

const src = readFileSync( new URL( '../src/together/BoatCopies.js', import.meta.url ), 'utf8' );
const make = src.slice( src.indexOf( '	make( id ) {' ), src.indexOf( 'u.type = id;' ) );
ok( make.length > 0, 'BoatCopies.make' );
ok( /if \( app\.tier === 'low' \) \{/.test( make ), 'on a phone every copy keeps what\'s past her low meshes for when you\'re near' );
ok( ! /e\.own \|\| e\.full/.test( make ), 'not only one whose type is yours, or all of her, when she\'s copied' );
ok( /u\.extras\.push\( m \);\s*m\.visible = false;/.test( make ), 'hidden till then' );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
