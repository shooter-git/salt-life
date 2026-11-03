// (v2.1.1) Plain-node test that a touch screen can run: the joystick pushed out past its ring holds Shift for the player
// (Player reads inp.down( 'ShiftLeft' ) walking, on deck and swimming), and lets go of it with the thumb.
const listeners = {};
globalThis.window = { addEventListener: ( t, f ) => { listeners[ t ] = f; }, removeEventListener() {}, devicePixelRatio: 1 };
globalThis.document = { addEventListener() {}, removeEventListener() {}, pointerLockElement: null, body: {}, documentElement: { classList: { toggle() {}, add() {}, remove() {} } } };
const { Input } = await import( '../src/core/Input.js' );

let failed = 0;
const ok = ( c, s ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );
	if ( ! c ) failed ++;

};

const inp = new Input( { addEventListener() {}, removeEventListener() {}, requestPointerLock() {}, style: {} } );
ok( ! inp.down( 'ShiftLeft' ), 'nothing held, no running' );
inp.touchRun = true;
ok( inp.down( 'ShiftLeft' ), 'the stick out past its ring: running, as Shift is' );
inp.noWalk = true;
ok( ! inp.down( 'ShiftLeft' ), 'not while a panel has the walking keys' );
inp.noWalk = false;
inp.touchRun = false;
ok( ! inp.down( 'ShiftLeft' ), 'back inside the ring, walking' );

const src = ( await import( 'node:fs' ) ).readFileSync( new URL( '../src/ui/TouchControls.js', import.meta.url ), 'utf8' );
ok( /touchRun = run/.test( src ) && /touchRun = false/.test( src ), 'the joystick sets it as it\'s pushed, and lets go of it with the thumb' );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
