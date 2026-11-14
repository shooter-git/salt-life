// The pictures on the touch buttons and in the actions wheel (ActionWheel.js), drawn here as SVG: a 24 px square,
// strokes in the button's own colour (currentColor), so one drawing serves every size and state. Picked from what a
// button says (ACTION_ICON), or from the player's prompt (promptIcon) for the gold button.
//   iconSvg( id )  ->  '<svg ...>...</svg>'      iconFor( label )  ->  an id

const HAND = 'M8 13V6.2a1.5 1.5 0 0 1 3 0V11M11 11V4.6a1.5 1.5 0 0 1 3 0V11M14 11V5.6a1.5 1.5 0 0 1 3 0V14M8 13v-2.6a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h.8A5.2 5.2 0 0 0 17 15.8V14';
const REEL = '<circle cx="10.5" cy="13.5" r="6.5"/><circle cx="10.5" cy="13.5" r="2"/><path d="M10.5 13.5l7-7"/><circle cx="18.6" cy="5.4" r="1.6"/>';
const dot = ( x, y, r = 1.6 ) => `<circle cx="${ x }" cy="${ y }" r="${ r }" fill="currentColor" stroke="none"/>`;

export const ICONS = {
	// the rod and what it does
	rod: '<path d="M3 21L20 4"/><circle cx="9.6" cy="17.4" r="2.1"/><path d="M20 4v10.2a2.4 2.4 0 0 1-4.5 1.1"/>',
	cast: '<path d="M3 21l9-14"/><path d="M12 7c4-3 8.5-1.5 8 7.5" stroke-dasharray="2 2.6"/><circle cx="20" cy="17.5" r="2.2"/>',
	reel: REEL,
	reelin: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/><circle cx="12" cy="12" r="2.3"/>',
	strike: '<path d="M10 3v11.5a3.5 3.5 0 0 1-7 0V13l2.2 1.6"/><path d="M18 21V7M14 11l4-4 4 4"/>',
	letgo: `<path d="${ HAND }"/>`,
	wait: dot( 5.5, 12 ) + dot( 12, 12 ) + dot( 18.5, 12 ),
	kite: '<path d="M12 2l6.5 7.5L12 18 5.5 9.5z"/><path d="M5.5 9.5h13M12 2v16"/><path d="M12 18c-1.5 1.2 1.5 2.3 0 4"/>',
	drop: '<path d="M12 2v8"/><path d="M12 10c2.8 0 4 4.6 4 6.8a4 4 0 0 1-8 0c0-2.2 1.2-6.8 4-6.8z"/>',
	chum: '<path d="M3.5 5h9v3a4.5 4.5 0 0 1-9 0z"/><path d="M12.5 6.5H20"/>' + dot( 7, 16.5, 1.1 ) + dot( 10.5, 19.5, 1.1 ) + dot( 5.5, 21, 1.1 ),
	net: '<path d="M12 3L4 18M12 3l8 15M12 3L9 19.6M12 3l3 16.6"/><path d="M4 18c5 2.6 11 2.6 16 0M6.3 13.6c3.8 1.6 7.6 1.6 11.4 0"/>',
	bait: '<path d="M18 7C11 6 6 9.2 6 14.2c0 2.9 2 4.8 4.8 4.8 2 0 3.2-1.3 3.2-3"/><path d="M10.2 9.4l1.4 3.1M13.8 8.3l.6 3.4M7.6 12.2l2.8 1.6"/><path d="M14 16l2.6-.8M14 16l1.4 2.5"/><path d="M18 7l3-2.4M18 7l3.2.9"/>',
	rig: '<circle cx="12" cy="13" r="5.2"/><path d="M6.8 13a5.2 5.2 0 0 1 10.4 0z" fill="currentColor"/><path d="M12 2.5v5.3M12 18.2V22"/>',
	leader: '<path d="M12 2v4"/><circle cx="12" cy="8" r="2"/><path d="M12 10v8a3.5 3.5 0 0 1-7 0v-1.6l2.1 1.6"/><path d="M15.5 13.5l3-1.5M15.5 17l3-1.5"/>',
	cooler: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 13.2h18"/><path d="M8 9V6.6A1.6 1.6 0 0 1 9.6 5h4.8A1.6 1.6 0 0 1 16 6.6V9"/>',
	// light, sound, the view
	torch: '<path d="M2.5 10h8.5v4H2.5z"/><path d="M11 8.2l3.5-1.2v10l-3.5-1.2z"/><path d="M17 9.2l4.5-2M17 12h4.5M17 14.8l4.5 2"/>',
	search: '<circle cx="7" cy="11" r="4"/><path d="M11 8l10-3.6M11 14l10 3.6"/><path d="M7 15v5M4 20.5h6"/>',
	horn: '<path d="M3 9.5v5h3.2l6.8 5v-15l-6.8 5z"/><path d="M16 9a4 4 0 0 1 0 6M18.6 6.4a7.7 7.7 0 0 1 0 11.2"/>',
	// ((M19) a trolling motor: its head, its shaft, its pod and prop; a pole driven into the bottom)
	motor: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M12 6.5V17"/><path d="M7.5 17.5h8.5a1.6 1.6 0 0 1 0 3.2H7.5z"/><path d="M5 18v2.5"/>',
	stake: '<path d="M12 2.5V18.5l-1.4 3M12 18.5l1.4 3"/><path d="M3 15c3 1.4 6 1.4 9 0s6-1.4 9 0"/><path d="M9.5 6h5"/>',
	camera: '<path d="M3.5 8h3.4l2-2.6h6.2l2 2.6h3.4v11h-17z"/><circle cx="12" cy="13.3" r="3.6"/>',
	plotter: '<rect x="2.5" y="3.5" width="19" height="14" rx="2"/><circle cx="12" cy="10.5" r="4.3" stroke-dasharray="2 1.8"/><path d="M12 10.5l2.8-2.8"/><path d="M8.5 21h7M12 17.5V21"/>',
	anchor: '<circle cx="12" cy="4.6" r="2"/><path d="M12 6.6V21M8 10h8"/><path d="M4.5 14.5c.6 3.8 3.7 6.5 7.5 6.5s6.9-2.7 7.5-6.5"/><path d="M4.5 14.5L3 16.6M19.5 14.5l1.5 2.1"/>',
	radio: '<rect x="7" y="7" width="10" height="14" rx="2"/><path d="M9.5 7V2"/><path d="M10 11h4M10 14h4"/>' + dot( 12, 17.6, 1.1 ),
	flare: '<path d="M8 21.5l4.6-10"/><path d="M11.2 10.6l3 1.4"/><path d="M14.4 9.8c-1.6-1.6-1.2-4.2 1.4-6.3.4 2.1 2.6 3.2 1.5 5.7-.6 1.3-2 1.6-2.9.6z"/><path d="M20 12.5l1.6.6M19.4 15.8l1.2 1.3"/>',
	guide: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.6"/>' + dot( 12, 17.2, 1.1 ),
	// moving about
	jump: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4.5 20h15"/>',
	swimup: '<path d="M12 14V3M7.5 7.5L12 3l4.5 4.5"/><path d="M2.5 18.5c2-1.6 4.3-1.6 6.3 0s4.3 1.6 6.3 0 4.3-1.6 6.4 0"/>',
	dive: '<path d="M2.5 5.5c2-1.6 4.3-1.6 6.3 0s4.3 1.6 6.3 0 4.3-1.6 6.4 0"/><path d="M12 9.5V21M7.5 16.5L12 21l4.5-4.5"/>',
	run: '<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/>',
	ladder: '<path d="M7 3v18M17 3v18M7 7.5h10M7 12h10M7 16.5h10"/>',
	exit: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
	// the water's own gear
	speargun: '<path d="M2 11.5h13.5"/><path d="M6.5 11.5v5.5h2.6l1-5.5"/><path d="M15.5 11.5h6M19 9l2.8 2.5L19 14"/><path d="M4 8.5l5 3"/>',
	lobster: '<ellipse cx="15" cy="8.8" rx="6" ry="5"/><path d="M10.6 12.4L3 20.5"/><path d="M11 6.6l8 4.2M12.4 12.6l6-6.6"/>',
	shoot: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>' + dot( 12, 12, 1.3 ),
	load: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4h-4"/><path d="M8 12h7.5M13 9.5l2.5 2.5-2.5 2.5"/>',
	pull: '<path d="M19 5L7 17"/><path d="M7 9v8h8"/>',
	throw: '<path d="M4 19c2-8 8-12.5 15-12.5"/><path d="M15.5 3l3.5 3.5-3.5 3.5"/>',
	haul: '<path d="M12 10V2M8.5 5.5L12 2l3.5 3.5"/><path d="M5.5 13h13c0 5-2.8 8.5-6.5 8.5S5.5 18 5.5 13z"/><path d="M9.5 13l1.6 8.4M14.5 13l-1.6 8.4"/>',
	// what the gold button does
	hand: `<path d="${ HAND }"/>`,
	boat: '<path d="M2.5 14h19l-3 5.5H5.5z"/><path d="M8 14V9h5.5l2.5 5"/><path d="M11 9V4"/>',
	helm: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7"/>',
	talk: '<path d="M4 5h16v10.5H10.5L6 19.5v-4H4z"/><path d="M8 9.2h8M8 12h5"/>',
	trap: '<rect x="2.5" y="11" width="14" height="9" rx="1"/><path d="M2.5 15.5h14M7.2 11v9M11.8 11v9"/><path d="M16.5 11l3.2-5.6"/><circle cx="20.4" cy="4" r="1.7"/>',
	sleep: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>',
	bucket: '<path d="M4 9h16l-2.2 11H6.2z"/><path d="M6.2 9a5.8 5.2 0 0 1 11.6 0"/>',
	chair: '<path d="M8 3v10.5h9.5M12.8 13.5V20M8 20.5h9.5"/><path d="M8 8.5h5"/>',
	// the actions wheel itself, and closing it
	wheel: dot( 12, 12, 2.6 ) + [ 0, 60, 120, 180, 240, 300 ].map( ( a ) => dot( + ( 12 + 8 * Math.sin( a * Math.PI / 180 ) ).toFixed( 2 ), + ( 12 - 8 * Math.cos( a * Math.PI / 180 ) ).toFixed( 2 ), 1.9 ) ).join( '' ),
	close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

// (put away: the thing itself, with an arrow down in a corner)
const AWAY = '<circle class="ai-badge" cx="18.5" cy="18.5" r="5"/><path d="M18.5 15.8v5.2M16.4 19l2.1 2.1 2.1-2.1"/>';

export function iconSvg( id, cls = 'ai' ) {

	const away = id.endsWith( ':away' ), base = away ? id.slice( 0, - 5 ) : id;
	return `<svg class="${ cls }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ ICONS[ base ] || ICONS.hand }${ away ? AWAY : '' }</svg>`;

}

// what a button says -> its picture
export const ACTION_ICON = {
	Rod: 'rod', 'Take the rod': 'rod', Speargun: 'speargun', 'Lobster gear': 'lobster', Radio: 'radio', Flares: 'flare',
	'Cast net': 'net', Bait: 'bait', Rig: 'rig', Leader: 'leader', Cooler: 'cooler',
	Torch: 'torch', 'Torch off': 'torch', Searchlight: 'search', 'Searchlight off': 'search', Horn: 'horn', Camera: 'camera', Guide: 'guide', 'Plotter range': 'plotter',
	'Trolling motor': 'motor', Outboards: 'motor', 'Power-Poles': 'stake', 'Poles up': 'stake', 'Stake out': 'stake', 'Pull the pole': 'stake', 'Stand up': 'jump', 'Sit down': 'jump',
	Run: 'run', Dive: 'dive', Jump: 'jump', 'Swim up': 'swimup', 'Climb ladder': 'ladder', 'Reel in': 'reelin', 'Lines in': 'reelin',
	// (the big button's, as it goes)
	Cast: 'cast', 'Let out': 'cast', 'Fly kite': 'kite', Drop: 'drop', Deeper: 'drop', 'Stop here': 'drop', Chum: 'chum', 'Let go': 'letgo',
	Strike: 'strike', 'Strike!': 'strike', Reel: 'reel', Wait: 'wait', Loading: 'wait', Closing: 'wait', 'Hold fire': 'wait',
	Shoot: 'shoot', Load: 'load', Pull: 'pull', Tickle: 'lobster', Net: 'lobster', Throw: 'throw', 'Draw in': 'haul', Close: 'haul', Haul: 'haul',
};

// ('Put away' is the rod's or the net's: which, the caller says)
export const iconFor = ( label, away = 'rod' ) => label === 'Put away' ? `${ away }:away` : ACTION_ICON[ label ] || 'hand';

// the gold button's picture, from what the prompt says it does
const PROMPT_ICONS = [
	[ /^(Sleep|Turn in)/, 'sleep' ], [ /^(Leave|Get out|Step out|Step ashore|Over the side|Close the radio|Put it away)/, 'exit' ],
	[ /anchor|drift sock/, 'anchor' ], [ /helm/, 'helm' ], [ /ladder|^Climb/, 'ladder' ], [ /overboard/i, 'dive' ], [ /^Talk|night box|honesty box|'s shut|'s (back|home|out)/, 'talk' ],
	[ /chair/, 'chair' ], [ /^Bail/, 'bucket' ], [ /speargun/, 'speargun' ], [ /\brod\b/, 'rod' ],
	[ /trap|buoy|lobster|^Stack|^Take out the/i, 'trap' ], [ /^Board|^Take .* out|kayak|^Shove|^Right her|^Climb back/i, 'boat' ],
];

export function promptIcon( text ) {

	for ( const [ re, id ] of PROMPT_ICONS ) if ( re.test( text ) ) return id;
	return 'hand';

}
