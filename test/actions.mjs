// (After v2) What the touch controls and the actions wheel offer (ui/Actions.js), state by state: on foot, fishing, in the
// water, sat in the kayak, at the helm, riding along in someone else's boat, at night; that each is under the thumb or in
// the wheel, so nothing the old buttons did is out of reach; and that each has its picture (ui/ActionIcons.js).
//
//   node test/actions.mjs

import { readFileSync } from 'node:fs';
import { ACTIONS, offers } from '../src/ui/Actions.js';
import { ICONS, ACTION_ICON, iconFor, iconSvg, promptIcon } from '../src/ui/ActionIcons.js';
import { G } from '../src/core/Globals.js';

let failed = 0;
const ok = ( c, what ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! c ) failed ++;

};

// a player and a game, as much of them as the offers read
const player = ( mode = 'walk', extra = {} ) => ( { mode, prompt: null, riding: false, boat: { model: { seated: false } }, ...extra } );
const game = ( extra = {} ) => {

	const g = {
		rod: { equipped: false, state: 'idle' }, gun: { equipped: false, state: 'loaded', shaftOut: false }, tools: { equipped: false, owned: false, busy: false },
		net: { equipped: false, busy: false, state: 'held', footprint: { wet: false } }, canFish: true, fight: null, bite: null, submerged: false,
		rigs: { rodOn: false, linesOut: false, castLabel: () => 'Cast', leadLabel: () => null }, state: { stats: { leader: 0 } },
		hud: {}, radio: { offer: null }, guide: { open: false }, app: { localLights: { flashlight: { on: false } }, searchlight: false },
	};
	for ( const [ k, v ] of Object.entries( extra ) ) g[ k ] = typeof v === 'object' && v && ! Array.isArray( v ) && g[ k ] ? { ...g[ k ], ...v } : v;
	return g;

};

const seen = new Set();
const shown = ( o ) => Object.keys( ACTIONS ).filter( ( id ) => o[ id ] ).map( ( id ) => ( seen.add( o[ id ] ), `${ id }:${ o[ id ] }` ) ).join( ' ' );

// ---- on foot
{

	G.night.value = 0;
	let o = offers( player( 'walk' ), game() );
	ok( o.jump === 'Jump' && o.cooler === 'Cooler' && o.guide === 'Guide' && ! o.rod && ! o.torch, `walking: jump, the cooler, the guide (${ shown( o ) })` );
	o = offers( player( 'walk', { prompt: { key: 'R', text: 'Take out the rod   ·   N  the cast net' } } ), game() );
	ok( o.action === 'Take out the rod' && o.actionKey === 'KeyR' && ! o.rod && o.net === 'Cast net', `by the water the gold button takes out the rod, and the net's in the wheel (${ shown( o ) })` );
	o = offers( player( 'walk', { prompt: { key: 'E', text: 'Talk to Joe' } } ), game() );
	ok( o.action === 'Talk to Joe' && o.actionKey === 'KeyE' && promptIcon( o.action ) === 'talk', 'at Joe\'s: talk to him, E, a speech bubble' );
	o = offers( player( 'walk', { prompt: { key: 'Space', text: 'Climb ladder' } } ), game() );
	ok( o.jump === 'Climb ladder' && iconFor( o.jump ) === 'ladder', 'the ladder: Space, its picture' );

}

// ---- fishing
{

	let o = offers( player( 'walk' ), game( { rod: { equipped: true, state: 'idle' }, state: { stats: { leader: 1 } } } ) );
	ok( o.use === 'Cast' && o.rod === 'Put away' && o.net === 'Cast net' && o.bait === 'Bait' && o.rig === 'Rig' && o.leader === 'Leader' && o.cooler === 'Cooler' && ! o.reel, `the rod out: cast; put away, the net, bait, rig, leader, the cooler in the wheel (${ shown( o ) })` );
	o = offers( player( 'walk' ), game( { rod: { equipped: true, state: 'windup' } } ) );
	ok( o.use === 'Let go' && ! o.cooler, `winding up: let go, and no cooler (${ shown( o ) })` );
	o = offers( player( 'walk' ), game( { rod: { equipped: true, state: 'floating' } } ) );
	ok( o.reel === 'Reel in' && o.cooler === 'Cooler' && ! o.bait, `cast: reel in, the cooler in the wheel (${ shown( o ) })` );
	o = offers( player( 'walk' ), game( { rod: { equipped: true, state: 'floating' }, bite: { phase: 'take' } } ) );
	ok( o.use === 'Strike!' && o.reel === 'Reel in' && ! o.bait, `a take: strike, and reel in (${ shown( o ) })` );
	o = offers( player( 'walk' ), game( { rod: { equipped: true, state: 'floating' }, fight: {} } ) );
	ok( o.use === 'Reel' && ! o.reel && ! o.net && ! o.cooler, 'a fish on: reel, and no cooler' );
	o = offers( player( 'walk' ), game( { rod: { equipped: true, state: 'idle' }, rigs: { linesOut: true } } ) );
	ok( o.reel === 'Lines in', 'lines out: lines in' );
	o = offers( player( 'walk', { prompt: { key: 'R', text: 'Take the rod · starboard · 12 s' } } ), game( { rigs: { rodOn: true } } ) );
	ok( o.action === 'Take the rod · starboard · 12 s' && o.actionKey === 'KeyR', 'a rod gone off: the gold button takes it, R' );
	o = offers( player( 'walk' ), game( { net: { equipped: true, busy: false, state: 'held' } } ) );
	ok( o.use === 'Throw' && o.net === 'Put away' && o.rod === 'Rod' && iconFor( o.net, 'net' ) === 'net:away', `the cast net out: throw, put it away, the rod (${ shown( o ) })` );

}

// ---- in the water
{

	let o = offers( player( 'swim' ), game() );
	ok( o.jump === 'Swim up' && o.dive === 'Dive' && ! o.use, 'swimming: swim up, dive' );
	o = offers( player( 'swim', { prompt: { key: 'R', text: 'Take out the speargun' } } ), game() );
	ok( o.action === 'Take out the speargun' && o.actionKey === 'KeyR' && promptIcon( o.action ) === 'speargun', 'the speargun: the gold button' );
	o = offers( player( 'swim' ), game( { gun: { equipped: true, state: 'loaded', safety: false }, submerged: true, tools: { owned: true } } ) );
	ok( o.use === 'Shoot' && o.rod === 'Lobster gear' && o.jump === 'Swim up' && o.dive === 'Dive', `dived with the speargun: shoot; the lobster gear in the wheel (${ shown( o ) })` );
	o = offers( player( 'swim' ), game( { gun: { equipped: true, state: 'empty' } } ) );
	ok( o.use === 'Load' && o.rod === 'Put away', 'an empty gun: load' );

}

// ---- sat in the kayak
{

	const seat = { boat: { model: { seated: true } } };
	let o = offers( player( 'boat', seat ), game() );
	ok( o.rod === 'Rod' && o.camera === 'Camera' && ! o.jump && ! o.horn, `in her seat: the rod, the camera (${ shown( o ) })` );
	o = offers( player( 'boat', seat ), game( { rod: { equipped: true, state: 'idle' }, radio: { offer: 'radio' } } ) );
	ok( o.use === 'Cast' && o.rod === 'Put away' && o.rig === 'Radio', 'fishing from her: cast, and her radio for the rig\'s key' );
	o = offers( player( 'boat', seat ), game( { radio: { offer: 'flares' } } ) );
	ok( o.rig === 'Flares', 'or her flares' );

}

// ---- at the helm, yours and someone else's
{

	let o = offers( player( 'boat', { prompt: { key: 'E', text: 'Leave helm   ·   V  camera   ·   R  radio' } } ), game() );
	ok( o.action === 'Leave helm' && o.rod === 'Radio' && o.horn === 'Horn' && o.camera === 'Camera' && o.cooler === 'Cooler' && ! o.torch, `at the helm: leave it; the radio, horn, camera, cooler in the wheel (${ shown( o ) })` );
	o = offers( player( 'boat' ), game( { rigs: { linesOut: true } } ) );
	ok( o.run === 'Run', 'lines out: run' );
	G.night.value = 1;
	o = offers( player( 'boat' ), game() );
	ok( o.torch === 'Searchlight', 'after dusk: the searchlight' );
	o = offers( player( 'boat', { riding: true } ), game( { rigs: { linesOut: true } } ) );
	ok( o.rod !== 'Radio' && ! o.run && o.camera === 'Camera', 'riding along in hers: not her radio, nor running her' );
	o = offers( player( 'deck', { riding: true, prompt: { key: 'R', text: 'Take Ana\'s rod' } } ), game( { rigs: { rodOn: false } } ) );
	ok( o.action === 'Take Ana\'s rod' && o.actionKey === 'KeyR', 'a rod gone off in hers: the gold button' );
	o = offers( player( 'walk' ), game() );
	ok( o.torch === 'Torch', 'after dusk ashore: the torch' );
	G.night.value = 0;

}

// ---- everything's somewhere, and has its picture
{

	const touch = readFileSync( new URL( '../src/ui/TouchControls.js', import.meta.url ), 'utf8' );
	const wheel = readFileSync( new URL( '../src/ui/ActionWheel.js', import.meta.url ), 'utf8' );
	const list = ( src, name ) => JSON.parse( src.match( new RegExp( `const ${ name } = (\\[[^\\]]*\\])` ) )[ 1 ].replace( /'/g, '"' ) );
	const thumb = list( touch, 'THUMB' ), ring = list( wheel, 'ORDER' );
	const all = [ 'action', ...thumb, ...ring ];
	ok( Object.keys( ACTIONS ).every( ( id ) => all.includes( id ) ) && all.length === new Set( all ).size, `every action under the thumb or in the wheel, once (${ thumb.join( ' ' ) } | ${ ring.join( ' ' ) })` );
	ok( thumb.every( ( id ) => ACTIONS[ id ].hold ), 'the thumb\'s are the ones held' );
	const missing = [ ...seen ].filter( ( label ) => label !== 'Put away' && ! ACTION_ICON[ label ] && ! [ 'Take out the rod', 'Talk to Joe', 'Leave helm' ].includes( label ) && ! /^Take /.test( label ) );
	ok( ! missing.length, `every word a button says has its picture${ missing.length ? `: not ${ missing.join( ', ' ) }` : '' }` );
	const ids = new Set( [ ...Object.values( ACTION_ICON ), 'wheel', 'close', 'hand', 'boat', 'helm', 'talk', 'trap', 'sleep', 'bucket', 'chair', 'exit' ] );
	ok( [ ...ids ].every( ( id ) => ICONS[ id ] ), 'and every picture is drawn' );
	ok( /^<svg [^>]*viewBox="0 0 24 24"/.test( iconSvg( 'rod:away' ) ) && iconSvg( 'rod:away' ).includes( 'ai-badge' ), 'put away: the rod, with its arrow down' );
	const prompts = { 'Board boat': 'boat', 'Take the helm': 'helm', 'Leave helm': 'exit', 'Step out and pull her up': 'exit', 'Climb up to the bridge': 'ladder', 'Jump overboard': 'dive',
		'Gaff the buoy': 'trap', 'Set a trap': 'trap', 'Sleep aboard until dawn': 'sleep', 'Bail (hold)': 'bucket', 'Sit in the fighting chair': 'chair', 'Pick up a conch': 'hand', 'Take Ana\'s boat out': 'boat' };
	const wrong = Object.entries( prompts ).filter( ( [ t, id ] ) => promptIcon( t ) !== id ).map( ( [ t ] ) => `${ t }: ${ promptIcon( t ) }` );
	ok( ! wrong.length, `the gold button's picture follows the prompt${ wrong.length ? ` (${ wrong.join( '; ' ) })` : '' }` );

}

if ( failed ) process.exit( 1 );
console.log( 'all passed' );
