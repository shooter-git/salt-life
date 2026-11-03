// (v2.1.2) What waits until after the start on a CPU's WebGL (App's _late): its shaders made then, not in the loading
// frame, where All the Spaces' checks give a creation 45 s on their slow CPU. The boat you start in waits out of the scene, as the rod
// does, whichever she is: only the lobster boat was held, by her name, and since M16 a new game starts in the kayak, whose two shaders (her hull,
// her paddle) took the phone-upright load past 45 s on All the Spaces' server (v2.1.1: 0.6 s more locally).
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = ( c, s ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );
	if ( ! c ) failed ++;

};

const app = readFileSync( new URL( '../src/App.js', import.meta.url ), 'utf8' );
const late = app.match( /this\._late = \[([^\n]*)\];/ );
ok( !! late, 'App holds the island\'s parts back on a CPU\'s WebGL (_late)' );
ok( late && ! /LobsterBoat|this\.boat/.test( late[ 1 ] ), 'not the boat: her name\'s no way to find her, and the island\'s reveal is no place for her' );
ok( /this\._heldBoat = \[ \[ this\.boat\.group, this\.boat\.group\.parent \] \];\s*this\.boat\.group\.removeFromParent\(\);/.test( app ), 'the boat you start in waits out of the scene, whichever she is' );
ok( /\( this\._heldBoat \|\| \[\] \)\.filter\( \( \[ m \] \) => m === this\.boat\.group \)/.test( app ), 'and comes back after the start (prepareLate) only if she\'s still the one you\'re in' );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
