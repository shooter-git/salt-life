import './game-ui.css';

// A host for the fishing game's HUD, minimap and guide (GameHUD.js, Minimap.js, Guide.js: Tidewater's
// DOM) over Salt Life's own Hud: a root and a HUD layer to mount on, toasts through the Hud. Tidewater
// had its UI.js here, which is its settings panel, loader and start screen as well.
export function createGameUI( hud ) {

	const root = document.createElement( 'div' );
	root.className = 'tw-root';
	const layer = document.createElement( 'div' );
	layer.className = 'tw-hud';
	root.append( layer );
	document.body.append( root );
	return {
		root,
		hud: layer,
		_start: false, // (Tidewater's start screen: none here)
		_photo: false, // (nor its photo mode)
		toggleHelp: null,
		onReplayGuide: null,
		// (the game counts in milliseconds, the Hud in seconds)
		toast: ( text, ms = 2600 ) => hud.toast( text, ms / 1000 ),
		// (the purse moved or changed: the toast beside it, or under it if it no longer fits)
		placeToast: () => hud.placeToast(),
	};

}
