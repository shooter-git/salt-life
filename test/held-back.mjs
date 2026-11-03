// (v2.1.2) What waits until after the start on a CPU's WebGL (App's _late): its shaders made then, not in the loading
// frame, where All the Spaces' checks give a creation 45 s on their slow CPU. The boat you start in is held whichever she
// is: only the lobster boat was, by her name, and since M16 a new game starts in the kayak, whose two shaders (her hull,
// her paddle) took the phone-upright load past 45 s on All the Spaces' server (v2.1.1: 0.6 s more locally).
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = ( c, s ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );
	if ( ! c ) failed ++;

};

const app = readFileSync( new URL( '../src/App.js', import.meta.url ), 'utf8' );
const late = app.match( /this\._late = \[([^\n]*)\];/ );
ok( !! late, 'App holds groups back on a CPU\'s WebGL (_late)' );
ok( late && /this\.boat\.group/.test( late[ 1 ] ), 'the boat you start in is held, whichever she is' );
ok( late && ! /named\( 'LobsterBoat' \)/.test( late[ 1 ] ), 'not the lobster boat by her name' );
ok( /for \( const group of this\._late \|\| \[\] \) if \( group\.includes\( old\.group \) \)/.test( app ), 'and a boat taken out in her place takes her place there (setBoat)' );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
