import { G } from '../core/Globals.js';

// What you can do this moment, as the on-screen controls offer it: for each action its words, or null when it isn't
// offered. The touch controls (TouchControls.js) keep the ones used every few seconds under the right thumb and the
// rest in the actions wheel (ActionWheel.js), which a keyboard or a gamepad opens too. Each presses the key it stands
// for (core/Input.js), so the game reads them as it reads the keyboard:
//   action    the player's prompt (E: board, take the helm, talk to Joe...; R: take out the rod, take the rod)
//   use       the left mouse button's part: cast / strike / reel, shoot / load, throw / close / haul, tickle / net
//   reel      the right's: reel an empty line in, or the lines
//   jump      jump / swim up / the prompt's Space (climb the ladder); dive (in the water); run (at the helm, lines out)
//   rod, net, bait, rig, leader, cooler, torch, horn, camera: the wheel's
export const ACTIONS = {
	action: { key: 'KeyE' },
	use: { key: 'mouse0', hold: true },
	reel: { key: 'mouse2', hold: true },
	jump: { key: 'Space', hold: true },
	dive: { key: 'KeyC', hold: true },
	run: { key: 'ShiftLeft', hold: true },
	rod: { key: 'KeyR' },
	net: { key: 'KeyN' },
	bait: { key: 'KeyB' },
	rig: { key: 'KeyC' },
	leader: { key: 'KeyX' },
	cooler: { key: 'KeyI' },
	torch: { key: 'KeyL' },
	camera: { key: 'KeyV' },
	horn: { key: 'Horn', hold: true },
	guide: {},
};

// (player: Player, game: Game, optional; o: an object to fill, reused)
export function offers( player, game = null, o = {} ) {

	const prompt = player && player.prompt;
	const rod = game && game.rod;
	const fishing = !! ( rod && rod.equipped );
	// (Salt Life) in the water the same buttons are the speargun's, then the lobster gear's; with the
	// cast net out, its
	const spearing = !! ( game && game.gun && game.gun.equipped );
	const lobstering = !! ( game && game.tools && game.tools.equipped );
	const net = game && game.net, netting = !! ( net && net.equipped );
	const swim = player && player.mode === 'swim';
	const netFree = netting && ! net.busy;
	const away = spearing ? ( game.gun.shaftOut ? null : game.tools && game.tools.owned ? 'Lobster gear' : 'Put away' ) : lobstering ? ( game.tools.busy ? null : 'Put away' ) : null;
	o.rod = fishing ? 'Put away' : away || ( ( prompt && prompt.key === 'R' ) || netFree ? ( swim ? 'Speargun' : 'Rod' ) : null );
	const offerNet = ! swim && ! lobstering && game && game.canFish && ! game.fight && ( ( prompt && prompt.key === 'R' ) || ( fishing && rod.state === 'idle' ) );
	o.net = netFree ? 'Put away' : ! netting && offerNet ? 'Cast net' : null;
	o.bait = fishing && rod.state === 'idle' ? 'Bait' : null;
	o.rig = fishing && rod.state === 'idle' ? 'Rig' : null;
	o.leader = fishing && rod.state === 'idle' && game.state?.stats?.leader > 0 ? 'Leader' : null;
	// ((M16) a rod gone off in its holder)
	if ( prompt && prompt.key === 'R' && game && game.rigs && game.rigs.rodOn ) o.rod = 'Take the rod';
	o.use = fishing ? castLabel( game ) : spearing ? spearLabel( game ) : lobstering ? lobsterLabel( game ) : netting ? netLabel( game ) : null;
	o.reel = fishing && ! game.fight && ( rod.state === 'floating' || rod.state === 'flying' ) ? 'Reel in' : fishing && ! game.fight && rod.state === 'idle' && game.rigs && game.rigs.linesOut ? 'Lines in' : null;
	// (the cooler with the rod out and cast too, as I opens it; not while a cast's wound up or a fish is on: an open
	// panel holds the rod's input, Game.update, so the wind-up would hang and the fish run free)
	const rodBusy = fishing && ( !! game.fight || rod.state === 'windup' );
	o.cooler = game && game.hud && ! rodBusy && ! spearing && ! lobstering && ! netting ? 'Cooler' : null;
	// the flashlight: offered after dusk (or while it's on)
	const lights = game && game.app && game.app.localLights;
	const torchOn = !! ( lights && lights.flashlight.on );
	// at the helm: the boat's searchlight, after dusk (or while it's on), and the horn
	// ((M16) a kayak's neither: the rod's button is the rod's, and her radio or flares are the rig's, the same key)
	const seat = player && player.mode === 'boat' && player.boat?.model?.seated;
	const helm = player && player.mode === 'boat' && ! seat, app = game && game.app;
	if ( seat && ! fishing && ! netting ) o.rod = 'Rod';
	if ( seat && game.radio && game.radio.offer ) o.rig = game.radio.offer === 'radio' ? 'Radio' : 'Flares';
	if ( helm ) o.torch = app && ( app.searchlight || G.night.value > 0.35 ) ? ( app.searchlight ? 'Searchlight off' : 'Searchlight' ) : null;
	else o.torch = lights && ( torchOn || G.night.value > 0.35 ) ? ( torchOn ? 'Torch off' : 'Torch' ) : null;
	o.horn = helm ? 'Horn' : null;
	// ((M16) with lines out she's held at the baits' speed: this runs her flat out, as Shift does)
	o.run = helm && ! player.riding && game?.rigs?.linesOut ? 'Run' : null;
	// ((M15) the rod's button is the radio's at the helm: R)
	if ( helm && ! player.riding ) o.rod = 'Radio';
	o.action = prompt && prompt.key === 'E' ? prompt.text.split( '   ·' )[ 0 ] : null;
	o.actionKey = 'KeyE';
	// (the prompt's R, taking out the rod or the speargun, or taking a rod that's gone off: the gold button's too, so
	// it's one tap away, and the wheel's rod with it)
	if ( ! o.action && prompt && prompt.key === 'R' && o.rod ) {

		o.action = prompt.text.split( '   ·' )[ 0 ];
		o.actionKey = 'KeyR';
		o.rod = null;

	}

	o.camera = player && player.mode === 'boat' ? 'Camera' : null;
	o.dive = player && player.mode === 'swim' ? 'Dive' : null;
	o.jump = prompt && prompt.key === 'Space' ? prompt.text : player && player.mode === 'swim' ? 'Swim up' : player && player.mode === 'boat' ? null : 'Jump';
	// (the first-play guide again: H, ashore; from the wheel, anywhere)
	o.guide = game && game.guide && ! game.guide.open ? 'Guide' : null;
	return o;

}

// the big fishing button: hold to wind up, let go to cast; strike when a fish takes the bobber; hold to
// reel in the fight
function castLabel( game ) {

	const rod = game.rod;
	if ( game.fight ) return 'Reel';
	if ( rod.state === 'windup' ) return 'Let go';
	if ( rod.state === 'floating' ) return game.bite && game.bite.phase === 'take' ? 'Strike!' : game.rigs?.leadLabel() || 'Strike';
	if ( rod.state === 'idle' ) return game.rigs ? game.rigs.castLabel() : 'Cast';
	return 'Wait';

}

// (Salt Life) the speargun's: shoot once you've dived, hold to load, hold to pull in a big fish
function spearLabel( game ) {

	const gun = game.gun;
	if ( game.spearFight ) return 'Pull';
	if ( gun.state === 'loaded' ) return ! game.submerged ? 'Dive' : gun.safety ? 'Hold fire' : 'Shoot';
	if ( gun.state === 'empty' ) return 'Load';
	if ( gun.state === 'loading' ) return 'Loading';
	return 'Wait';

}

// (Salt Life) the cast net's: hold to wind up, let go as the ring brightens; hold to draw the brails
// and haul it in. (Never hidden while it's out: a button hidden under a held thumb is never let go)
function netLabel( game ) {

	const net = game.net;
	if ( net.state === 'held' ) return 'Throw';
	if ( net.state === 'windup' ) return 'Let go';
	if ( net.state === 'sinking' ) return ! net.footprint.wet ? 'Draw in' : net.draw >= 1 ? 'Haul' : net.pulling ? 'Closing' : 'Close';
	return 'Wait';

}

// (Salt Life) the lobster gear's: hold to tickle one out of its den, tap to net it in the open
function lobsterLabel( game ) {

	const a = game.lobsterAim;
	if ( game.tools.busy ) return 'Wait';
	if ( ! game.submerged ) return 'Dive';
	if ( ! a || a.state === 'flip' || a.dist > a.reach ) return 'Wait';
	return a.state === 'den' ? 'Tickle' : 'Net';

}
