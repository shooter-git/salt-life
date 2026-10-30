import { FISH, CARAPACE, fishLengthCm } from './FishTable.js';
import { UPGRADES, nextLevel, FUEL_PRICE } from './Gear.js';
import { BAITS, BAIT_IDS, chunksOf } from './Bait.js';
import { LOOKS, LOOK_NAMES } from '../together/Avatar.js';
import { NIGHT_BOX, biteHint, orderTerms, orderPlace } from './Orders.js';
import { WEEK_MUL, delivered, filled, mineOf, shareOf, weekEnds } from './WeekOrder.js';
import { timeText } from './IslandClock.js';
import { LB, IN, GAL, lb, pounds, inches, feet, farOff, gallons, lbOz, feetInches } from './Units.js';
import { FLOOD_L } from './Hull.js';
import { PLACES, FAR_PLACES, placeName, farName } from './Places.js';
import { FINDS, messageOf } from './Beachcomb.js';
import { CAMP } from './FishCamp.js';

// (other players' names, into HTML)
const escape = ( t ) => String( t ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[ c ] );
// a row of the cooler or Joe's stand: a name over its details, then what's on the right
const item = ( name, meta, ...right ) => `<div class="gm-item"><span class="gm-item-main"><span class="gm-item-name">${ name }</span><span class="gm-item-meta">${ meta }</span></span>${ right.join( '' ) }</div>`;
// (Salt Life) price: what it fetches here (a wanted fish: the order's price); wanted: on today's list
const fishItem = ( f, button, price = f.value, wanted = false ) => item( `${ FISH[ f.species ].name }${ f.record ? '<small>record</small>' : '' }${ wanted ? '<small class="is-wanted">wanted</small>' : '' }`,
	`${ sizeOf( f.species, f.cm ?? fishLengthCm( f.species, f.kg ) ) } · ${ lb( f.kg ) }${ { spear: ' · speared', net: ' · netted', hand: ' · by hand' }[ f.method ] || '' }`, `<span class="gm-item-val">$${ price }</span>`, button );
// (Salt Life) why the net's catch went back (GameState.addHaul)
const BACK = { protected: 'protected', notNet: 'not bait', full: 'no room in the cooler', bucket: 'the bucket\'s full' };
const upper = ( t ) => t.charAt( 0 ).toUpperCase() + t.slice( 1 );
// (Salt Life) a spiny lobster's carapace (the gauge's measure), of its total length (cm), in inches;
// a catch's size as it's told (a lobster by its carapace)
const carapaceIn = ( cm ) => cm * CARAPACE / IN;
const sizeOf = ( species, cm ) => species === 'lobster' ? `${ carapaceIn( cm ).toFixed( 1 ) } in carapace` : inches( cm );

// DOM for the fishing game, in the look of the rest of the HUD (ui/game-ui.css tokens, .tw-glass):
//   top right     purse and cooler / hold load
//   bottom centre the fight: line tension with its safe band, the fish's stamina, line out
//   centre        "!" when a fish takes the bait
//   panels        inventory (I / Tab) and the fish stand's offer
//   catch card    full screen: the world dims and blurs, the fish lies side-on in its own studio light
//                 (FishPortrait) with the species above and length, weight, value, record below
const CSS = /* css */`
.gm-purse { position: absolute; top: var(--tw-edge); right: var(--tw-edge); display: flex; gap: var(--tw-3); align-items: center;
	padding: var(--tw-2) var(--tw-4); border-radius: 999px; font: 500 var(--tw-fs-lg) var(--tw-font); color: var(--tw-ink); pointer-events: none;
	transition: transform var(--tw-med) var(--tw-ease), right var(--tw-slow) var(--tw-ease); }
.tw-root[data-panel='open'] .gm-purse { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.tw-root.is-photo .gm-panel { display: none; }
.gm-purse.is-bump { animation: gm-bump 420ms var(--tw-ease); }
@keyframes gm-bump { 30% { transform: scale(1.08); } }
.gm-money { font-family: var(--tw-mono); color: var(--tw-sun); font-weight: 600; }
.gm-cooler { display: flex; align-items: center; gap: var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-md); }
.gm-cooler-bar { width: calc(64 * var(--tw-u)); height: calc(5 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-cooler-bar > span { display: block; height: 100%; width: 0; background: var(--tw-aqua); border-radius: inherit; transition: width var(--tw-med) var(--tw-ease); }
.gm-cooler.is-full .gm-cooler-bar > span { background: var(--tw-coral); }
.gm-fight { position: absolute; left: 50%; bottom: calc(max(calc(72 * var(--tw-u)), 13vh) + calc(58 * var(--tw-u))); transform: translateX(-50%);
	width: calc(360 * var(--tw-u)); padding: var(--tw-3) var(--tw-4); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; transition: opacity var(--tw-med) var(--tw-ease); pointer-events: none; }
.gm-fight.is-on { opacity: 1; }
.gm-fight-head { display: flex; justify-content: space-between; margin-bottom: var(--tw-2); }
.gm-fight-call { font-weight: 600; letter-spacing: 0.02em; }
.gm-fight-call.is-warn { color: var(--tw-coral); }
.gm-fight-call.is-good { color: var(--tw-aqua); }
.gm-fight-dist { font-family: var(--tw-mono); color: var(--tw-ink-2); }
.gm-tension { position: relative; height: calc(12 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-band { position: absolute; top: 0; bottom: 0; background: rgba(var(--tw-aqua-rgb), 0.28); border-left: 1px solid rgba(var(--tw-aqua-rgb), 0.6); border-right: 1px solid rgba(var(--tw-aqua-rgb), 0.6); }
.gm-danger { position: absolute; top: 0; bottom: 0; right: 0; width: 8%; background: rgba(255, 122, 133, 0.35); }
.gm-needle { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--tw-ink); box-shadow: 0 0 8px rgba(255,255,255,0.6); }
.gm-needle.is-hot { background: var(--tw-coral); box-shadow: 0 0 10px var(--tw-coral); }
.gm-stamina { margin-top: var(--tw-2); display: flex; align-items: center; gap: var(--tw-2); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-stamina-bar { flex: 1; height: calc(4 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-stamina-bar > span { display: block; height: 100%; background: var(--tw-sun); }
.gm-bite { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(0.6); font: 800 calc(56 * var(--tw-u)) var(--tw-font);
	color: var(--tw-sun); text-shadow: 0 0 18px rgba(var(--tw-sun-rgb), 0.8), 0 2px 4px rgba(0,0,0,0.5); opacity: 0; pointer-events: none;
	transition: opacity 120ms, transform 200ms var(--tw-ease); }
.gm-bite.is-on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.gm-cast { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); width: calc(140 * var(--tw-u)); height: calc(5 * var(--tw-u));
	border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; opacity: 0; transition: opacity var(--tw-fast); pointer-events: none; }
.gm-cast.is-on { opacity: 1; }
.gm-cast > span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--tw-aqua), var(--tw-sun)); }
/* (Salt Life) the cast net's wind-up: the needle swings across, the moment that spins it fully open is
   the band (it lights while the needle's in it); held past it, the arms tire (coral) */
.gm-netwind { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); width: calc(170 * var(--tw-u)); height: calc(7 * var(--tw-u));
	border-radius: 99px; background: var(--tw-fill-2); opacity: 0; transition: opacity var(--tw-fast); pointer-events: none; }
.gm-netwind.is-on { opacity: 1; }
.gm-netwind > i { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: rgba(var(--tw-aqua-rgb), 0.3); box-shadow: inset 0 0 0 1px rgba(var(--tw-aqua-rgb), 0.65);
	transition: background var(--tw-fast), box-shadow var(--tw-fast); }
.gm-netwind.is-sweet > i { background: rgba(var(--tw-aqua-rgb), 0.85); box-shadow: 0 0 14px rgba(var(--tw-aqua-rgb), 0.85); }
.gm-netwind > b { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--tw-ink); box-shadow: 0 0 6px rgba(255,255,255,0.5); }
.gm-netwind.is-tired > b { background: var(--tw-coral); box-shadow: 0 0 8px var(--tw-coral); }
/* (Salt Life) what the cast net brought up: a card over the prompt for a few seconds */
.gm-haul { position: absolute; left: 50%; bottom: calc(max(calc(72 * var(--tw-u)), 13vh) + calc(58 * var(--tw-u))); transform: translate(-50%, 10px);
	min-width: calc(280 * var(--tw-u)); max-width: min(92vw, calc(420 * var(--tw-u))); padding: var(--tw-3) var(--tw-4); border-radius: var(--tw-r-lg);
	font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink); pointer-events: none; opacity: 0;
	transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-slow) var(--tw-ease); }
.gm-haul.is-on { opacity: 1; transform: translate(-50%, 0); }
.gm-haul-h { display: flex; justify-content: space-between; align-items: baseline; gap: var(--tw-3); margin-bottom: var(--tw-1); }
.gm-haul-h b { font-weight: 600; }
.gm-haul-h small { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-haul-row { display: grid; grid-template-columns: calc(26 * var(--tw-u)) minmax(0, 1fr) auto; gap: var(--tw-2); align-items: baseline; padding: 2px 0; }
.gm-haul-row > b { font: 600 var(--tw-fs-md) var(--tw-mono); color: var(--tw-aqua); text-align: right; }
.gm-haul-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-haul-row > em { font-style: normal; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); white-space: nowrap; }
.gm-haul-row.is-cooler > b { color: var(--tw-sun); }
.gm-haul-row.is-back { color: var(--tw-ink-3); }
.gm-haul-row.is-back > b { color: var(--tw-ink-3); }
.gm-haul-tags { display: flex; flex-wrap: wrap; gap: var(--tw-1); margin-top: var(--tw-2); }
.gm-haul-tags span { padding: 1px var(--tw-2); border-radius: 999px; font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.gm-haul-tags .is-new { color: #062420; background: #6fd6c6; }
.gm-haul-tags .is-record { color: #2a1604; background: #e7bd68; }
.gm-btns { display: inline-flex; gap: var(--tw-1); }
.gm-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: rgba(255,255,255,0.7); box-shadow: 0 0 3px rgba(0,0,0,0.6); opacity: 0; pointer-events: none; }
.gm-dot.is-on { opacity: 1; }
.gm-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -48%); width: calc(420 * var(--tw-u)); max-height: 70vh; display: flex; flex-direction: column;
	padding: var(--tw-4) var(--tw-5); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; pointer-events: none; transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-slow) var(--tw-ease); }
.gm-panel.is-open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
.gm-panel h2 { margin: 0 0 var(--tw-1); font-size: calc(17 * var(--tw-u)); font-weight: 600; }
.gm-panel p.gm-sub { margin: 0 0 var(--tw-3); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-list { overflow: auto; min-height: 0; overscroll-behavior: contain; margin: 0 calc(-1 * var(--tw-2)); padding: 0 var(--tw-2); }
.gm-panel > :not(.gm-list) { flex: none; }
.gm-empty { color: var(--tw-ink-3); padding: var(--tw-4) 0; text-align: center; }
.gm-note-text { margin: var(--tw-2) 0 var(--tw-3); font-style: italic; line-height: 1.5; color: var(--tw-ink); }
.gm-foot { display: flex; justify-content: space-between; align-items: center; margin-top: var(--tw-3); gap: var(--tw-3); }
.gm-btn { font: 600 var(--tw-fs-md) var(--tw-font); color: #0b1418; background: var(--tw-aqua); border: 0; border-radius: 999px; padding: var(--tw-2) var(--tw-4); cursor: pointer; }
.gm-btn[disabled] { opacity: 0.4; cursor: default; }
.gm-btn.is-ghost { background: var(--tw-fill-2); color: var(--tw-ink); }
.gm-mini { font: 500 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line); border-radius: 999px; padding: 2px var(--tw-2); cursor: pointer; }
.gm-mini.is-on { color: #0b1418; background: var(--tw-aqua); border-color: transparent; }
/* (Salt Life) the cooler's tabs (the fish in it, your log, the island's records, your islander), and
   the rows of the cooler and Joe's stand: a fish's name over its numbers, its value and a button */
.gm-tabs { display: flex; gap: 2px; padding: 3px; margin: 0 0 var(--tw-2); border-radius: 999px; background: var(--tw-fill); border: 1px solid var(--tw-line); }
.gm-tab { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 0.45em; padding: var(--tw-1) var(--tw-2);
	font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: none; border: 0; border-radius: 999px; white-space: nowrap; cursor: pointer; }
.gm-tab small { font: 500 0.92em var(--tw-mono); color: var(--tw-ink-3); }
.gm-tab.is-on { color: #0b1418; background: var(--tw-aqua); }
.gm-tab.is-on small { color: rgba(11, 20, 24, 0.62); }
.gm-tabs-keys { align-self: center; padding: 0 var(--tw-2) 0 var(--tw-1); color: var(--tw-ink-3); font-size: var(--tw-fs-xs); white-space: nowrap; }
.gm-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-item:last-child { border-bottom: 0; }
.gm-item-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.gm-item-name { color: var(--tw-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-item-name small { color: var(--tw-aqua); margin-left: var(--tw-1); }
.gm-item-meta { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-item-meta b { color: var(--tw-aqua); font-weight: 600; }
.gm-item-val { font-family: var(--tw-mono); color: var(--tw-sun); }
.gm-item-num { font-family: var(--tw-mono); font-size: var(--tw-fs-sm); color: var(--tw-ink-2); white-space: nowrap; text-align: right; }
.gm-looks { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tw-2); padding: var(--tw-1) 0; }
.gm-look { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: var(--tw-2) var(--tw-3); text-align: left; cursor: pointer;
	font: 500 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line-2); border-radius: var(--tw-r-md); }
.gm-look b { font-size: var(--tw-fs-md); font-weight: 600; color: var(--tw-ink); }
.gm-look.is-on { background: rgba(var(--tw-aqua-rgb), 0.14); border-color: var(--tw-aqua); box-shadow: inset 0 0 0 1px var(--tw-aqua); }
.gm-look.is-on b::after { content: ' ✓'; color: var(--tw-aqua); }
/* short screens (phones on their side): a panel's title and what's under it on one line, less padding */
@media (max-height: 500px) {
	.gm-panel { padding: var(--tw-3) var(--tw-4); }
	.gm-head { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--tw-3); margin-bottom: var(--tw-2); }
	.gm-head h2, .gm-head p.gm-sub { margin: 0; }
	.gm-foot { margin-top: var(--tw-2); }
}
/* a panel up: the first hint about the controls steps aside */
html:has(.gm-panel.is-open) .hud-hint { visibility: hidden; }
.gm-gauge { display: none; align-items: center; gap: var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-md); }
.gm-gauge.is-on { display: flex; }
.gm-gauge b { font-family: var(--tw-mono); font-weight: 500; color: var(--tw-ink); }
.gm-fuel-bar > span { background: var(--tw-sun); }
.gm-fuel.is-low .gm-fuel-bar > span { background: var(--tw-coral); }
/* (M10) the boat's hull once it's worn (what's left of it), and the water in her bilge (up to the engine);
   it pulses as the water nears the engine, as the breath does */
.gm-hull-bar > span { background: var(--tw-ink-2); }
.gm-hull.is-low .gm-hull-bar > span { background: var(--tw-coral); }
.gm-bilge-bar > span { background: var(--tw-aqua); }
.gm-bilge.is-low .gm-bilge-bar > span { background: var(--tw-coral); }
.gm-bilge.is-low { animation: gm-breath-pulse 0.9s ease-in-out infinite; }
.gm-sonar-dots { letter-spacing: 1px; color: var(--tw-aqua); }
/* (Salt Life) the held breath under water; what's under the speargun's sights; the edges of sight
   closing in as the breath runs out (dark when you black out) */
.gm-breath-bar > span { background: var(--tw-aqua); }
.gm-breath.is-low .gm-breath-bar > span { background: var(--tw-coral); }
.gm-breath.is-low { animation: gm-breath-pulse 0.9s ease-in-out infinite; }
@keyframes gm-breath-pulse { 50% { opacity: 0.55; } }
.gm-aim { position: absolute; left: 50%; top: calc(50% + 14px); transform: translateX(-50%); padding: 2px var(--tw-2); border-radius: 999px;
	font: 600 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink); background: rgba(6, 16, 24, 0.5); white-space: nowrap; pointer-events: none;
	opacity: 0; transition: opacity var(--tw-fast); }
.gm-aim.is-on { opacity: 1; }
.gm-aim small { font-weight: 500; color: var(--tw-ink-2); margin-left: 6px; }
.gm-aim.is-far small { color: var(--tw-ink-3); }
.gm-aim.is-no { color: var(--tw-coral); }
.gm-aim.is-small { color: var(--tw-sun); }
.gm-veil { position: absolute; inset: 0; pointer-events: none; opacity: 0;
	background: radial-gradient(closest-side at 50% 50%, rgba(1, 6, 10, 0) 35%, rgba(1, 6, 10, 0.94) 125%); }
.gm-shop-row { display: grid; grid-template-columns: 1fr auto; gap: var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-shop-row small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); margin-top: 2px; }
.gm-shop-row .gm-have { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
/* (Salt Life) the day's wanted list at Joe's and Marta's: a small block at the top of the list, and a
   tag on the fish it wants */
.gm-item-name small.is-wanted { color: var(--tw-sun); }
.gm-wanted { margin: 0 0 var(--tw-2); padding: var(--tw-1) var(--tw-3); border-radius: var(--tw-r-md); background: rgba(var(--tw-sun-rgb), 0.07); border: 1px solid rgba(var(--tw-sun-rgb), 0.22); }
.gm-wanted-h { display: block; margin: var(--tw-1) 0 0; color: var(--tw-sun); font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.gm-wanted .gm-item { padding: var(--tw-1) 0; border-color: rgba(var(--tw-sun-rgb), 0.14); }
.gm-wanted .gm-item.is-done .gm-item-name { color: var(--tw-ink-3); text-decoration: line-through; }
/* (Salt Life) the week's order: the group's progress under it */
.gm-week-bar { height: calc(4 * var(--tw-u)); margin: var(--tw-1) 0 0; border-radius: 99px; background: rgba(var(--tw-sun-rgb), 0.14); overflow: hidden; }
.gm-week-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--tw-sun); }
.gm-week-note { display: block; margin: var(--tw-1) 0; color: var(--tw-ink-2); font-size: var(--tw-fs-sm); }
.gm-label { display: block; margin: 0 0 var(--tw-1); color: var(--tw-ink-3); font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }

/* catch card: full screen. The world dims and blurs; the fish lies side-on in its own studio light
   (FishPortrait, a WebGPU canvas) between the name above and the numbers below */
.gm-catch-scrim { position: absolute; inset: 0; pointer-events: none; opacity: 0; visibility: hidden;
	background: radial-gradient(70% 60% at 50% 50%, rgba(10, 22, 34, 0.55) 0%, rgba(4, 9, 15, 0.86) 100%);
	-webkit-backdrop-filter: blur(10px) saturate(0.8); backdrop-filter: blur(10px) saturate(0.8);
	transition: opacity 420ms var(--tw-ease), visibility 0s linear 420ms; }
.gm-catch-scrim.is-on { opacity: 1; visibility: visible; transition: opacity 420ms var(--tw-ease), visibility 0s; }
.gm-catch { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(6px, 1.4vh, 18px);
	padding: var(--tw-6) var(--tw-edge); color: #f4ead6; font: 500 var(--tw-fs-md) var(--tw-font); text-align: center;
	pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 300ms var(--tw-ease), visibility 0s linear 300ms; }
.gm-catch.is-on { opacity: 1; visibility: visible; transition: opacity 300ms var(--tw-ease), visibility 0s; }
.gm-catch-top, .gm-catch-bottom { display: flex; flex-direction: column; align-items: center; opacity: 0; }
.gm-catch.is-on .gm-catch-top { animation: gm-rise 700ms var(--tw-ease) 120ms forwards; }
.gm-catch.is-on .gm-catch-bottom { animation: gm-rise 700ms var(--tw-ease) 520ms forwards; }
@keyframes gm-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.gm-catch-eyebrow { display: flex; align-items: center; justify-content: center; min-height: calc(26 * var(--tw-u)); margin-bottom: var(--tw-2);
	font-size: var(--tw-fs-sm); font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(244, 234, 214, 0.62); }
.gm-badge { display: inline-flex; align-items: center; gap: 0.5em; padding: calc(4 * var(--tw-u)) calc(12 * var(--tw-u)); border-radius: 4px;
	letter-spacing: 0.22em; font-weight: 800; transform: scale(2.4) rotate(-8deg); opacity: 0; }
.gm-catch.is-on .gm-badge { animation: gm-stamp 520ms cubic-bezier(0.3, 1.5, 0.5, 1) 900ms forwards; }
.gm-badge.is-record { color: #2a1604; background: linear-gradient(100deg, #f3cf8a 0%, #d9a441 40%, #fff0cf 50%, #d9a441 60%, #f3cf8a 100%); background-size: 250% 100%;
	box-shadow: 0 0 0 2px rgba(42, 22, 4, 0.35) inset, 0 0 26px rgba(217, 164, 65, 0.55); }
.gm-catch.is-on .gm-badge.is-record { animation: gm-stamp 520ms cubic-bezier(0.3, 1.5, 0.5, 1) 900ms forwards, gm-shine 2.6s var(--tw-ease-io) 1.6s infinite; }
.gm-badge.is-new { color: #062420; background: #6fd6c6; box-shadow: 0 0 0 2px rgba(6, 36, 32, 0.3) inset, 0 0 22px rgba(111, 214, 198, 0.45); }
.gm-badge.is-plain { color: rgba(244, 234, 214, 0.8); background: none; box-shadow: inset 0 0 0 1px rgba(244, 234, 214, 0.35); }
@keyframes gm-stamp { 0% { transform: scale(2.4) rotate(-8deg); opacity: 0; } 70% { transform: scale(0.94) rotate(-3deg); opacity: 1; } 100% { transform: scale(1) rotate(-3deg); opacity: 1; } }
@keyframes gm-shine { 0% { background-position: 100% 0; } 100% { background-position: -150% 0; } }
.gm-catch h2 { margin: 0; font-family: 'Caveat Brush', 'Kalam', var(--tw-font); font-weight: 400; font-size: clamp(38px, 6.2vw, 92px); line-height: 1; letter-spacing: 0.01em;
	color: #fbf1dc; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35), 0 8px 30px rgba(0, 0, 0, 0.45); }
.gm-catch-sci { margin-top: calc(4 * var(--tw-u)); font-family: 'Kalam', var(--tw-font); font-style: italic; color: rgba(244, 234, 214, 0.66); font-size: clamp(13px, 1.3vw, 19px); }
/* (the fish's stage gives way on a short window, so the name, the numbers and "continue" stay on screen) */
.gm-catch-stage { position: relative; width: min(94vw, 1400px, calc(min(46vh, 100vh - 360px) * 2.4)); aspect-ratio: 2.4 / 1; }
.gm-catch-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%;
	-webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%); }
/* the card owns the screen: the minimap and the settings rail step aside */
.tw-root:has(.gm-catch.is-on) .gm-map, .tw-root:has(.gm-catch.is-on) .tw-rail { opacity: 0; pointer-events: none; transition: opacity 300ms; }
.gm-catch-stage::before { content: ''; position: absolute; left: 12%; right: 12%; bottom: 6%; height: 16%; border-radius: 50%;
	background: radial-gradient(closest-side, rgba(0, 0, 0, 0.5), transparent); opacity: 0; }
.gm-catch.is-on .gm-catch-stage::before { animation: gm-fade 900ms var(--tw-ease) 350ms forwards; }
@keyframes gm-fade { to { opacity: 1; } }
.gm-splash { position: absolute; left: 50%; top: 52%; width: 0; height: 0; pointer-events: none; }
.gm-splash i { position: absolute; left: 0; top: 0; width: var(--s); height: var(--s); margin: calc(var(--s) / -2); border-radius: 50%;
	background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.95), rgba(190, 235, 245, 0.55) 55%, transparent 72%); opacity: 0; }
.gm-catch.is-on .gm-splash i { animation: gm-drop 1100ms cubic-bezier(0.2, 0.7, 0.3, 1) var(--d) forwards; }
@keyframes gm-drop { 0% { opacity: 0; transform: translate(0, 0) scale(0.4); } 12% { opacity: 1; }
	100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(1); } }
.gm-catch-stats { display: flex; justify-content: center; gap: clamp(8px, 1.6vw, 22px); margin-top: var(--tw-2); }
.gm-stat { min-width: clamp(96px, 11vw, 150px); padding: calc(10 * var(--tw-u)) calc(16 * var(--tw-u)) calc(9 * var(--tw-u)); border-radius: 6px;
	background: linear-gradient(180deg, rgba(232, 220, 192, 0.12), rgba(232, 220, 192, 0.05)); box-shadow: inset 0 0 0 1px rgba(214, 180, 110, 0.38), 0 10px 30px rgba(0, 0, 0, 0.25); }
.gm-stat span { display: block; font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(222, 190, 125, 0.9); }
.gm-stat b { display: block; margin-top: calc(4 * var(--tw-u)); font: 600 clamp(20px, 2.2vw, 32px) var(--tw-mono); color: #fbf1dc; white-space: nowrap; }
.gm-stat b small { font-size: 0.55em; font-weight: 500; color: rgba(244, 234, 214, 0.7); margin-left: 0.2em; }
.gm-stat i { display: block; white-space: nowrap; font-style: normal; font-family: var(--tw-mono); font-size: var(--tw-fs-sm); color: rgba(244, 234, 214, 0.5); margin-top: 2px; }
.gm-stat.is-value b { color: #f0c46a; }
.gm-catch-note { margin-top: var(--tw-3); min-height: 1.4em; color: rgba(244, 234, 214, 0.78); font-family: 'Kalam', var(--tw-font); font-size: clamp(14px, 1.25vw, 19px); line-height: 1.4; }
.gm-catch-note b { color: #f0c46a; font-weight: 700; }
.gm-catch-note.is-warn { color: #ff9a8a; }
.gm-catch-foot { display: flex; align-items: center; justify-content: center; gap: var(--tw-2); margin-top: var(--tw-3); color: rgba(244, 234, 214, 0.5); font-size: var(--tw-fs-sm); }
.gm-catch-foot kbd { font: 600 var(--tw-fs-xs) var(--tw-mono); color: #f4ead6; padding: 2px calc(6 * var(--tw-u)); border-radius: 4px; border: 1px solid rgba(244, 234, 214, 0.3); background: rgba(244, 234, 214, 0.08); }
.gm-catch-timer { width: calc(80 * var(--tw-u)); height: 2px; margin-left: var(--tw-2); border-radius: 2px; background: rgba(244, 234, 214, 0.15); overflow: hidden; }
.gm-catch-timer > span { display: block; height: 100%; width: 100%; background: rgba(244, 234, 214, 0.55); transform-origin: 0 50%; }
.gm-catch.is-on .gm-catch-timer > span { animation: gm-timer var(--gm-catch-ms, 9000ms) linear forwards; }
@keyframes gm-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
/* (M15) no room for it: the cooler's fish, cheapest first, each to let go to make room, and the room it
   needs; the card waits */
.gm-room { width: min(94vw, 760px); margin-top: var(--tw-3); }
.gm-room-head { display: flex; align-items: center; gap: var(--tw-3); font-size: var(--tw-fs-sm); color: rgba(244, 234, 214, 0.78); }
.gm-room-head b { color: #ff9a8a; font-weight: 700; white-space: nowrap; }
.gm-room-head b.is-ok { color: #6fd6c6; }
.gm-room-meter { position: relative; flex: 1; height: calc(6 * var(--tw-u)); border-radius: 99px; background: rgba(244, 234, 214, 0.12); overflow: hidden; }
.gm-room-meter > span { position: absolute; top: 0; bottom: 0; left: 0; border-radius: inherit; transition: width var(--tw-med) var(--tw-ease), left var(--tw-med) var(--tw-ease); }
.gm-room-meter > .is-in { background: rgba(244, 234, 214, 0.55); }
.gm-room-meter > .is-new { background: #ff9a8a; }
.gm-room-meter > .is-new.is-ok { background: #6fd6c6; }
.gm-room-list { display: flex; gap: var(--tw-2); margin-top: var(--tw-2); padding-bottom: var(--tw-1); overflow-x: auto; scroll-snap-type: x proximity; overscroll-behavior: contain; }
.gm-room-fish { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: calc(128 * var(--tw-u)); padding: var(--tw-2) var(--tw-3);
	border-radius: 6px; text-align: left; scroll-snap-align: start; background: rgba(232, 220, 192, 0.08); box-shadow: inset 0 0 0 1px rgba(214, 180, 110, 0.3); }
.gm-room-fish.is-pick { box-shadow: inset 0 0 0 2px #f0c46a; background: rgba(240, 196, 106, 0.14); }
.gm-room-fish b { font-weight: 600; color: #fbf1dc; white-space: nowrap; }
.gm-room-fish span { font-family: var(--tw-mono); font-size: var(--tw-fs-sm); color: rgba(244, 234, 214, 0.6); white-space: nowrap; }
.gm-room-fish .gm-mini { margin-top: var(--tw-1); color: #f4ead6; background: rgba(244, 234, 214, 0.1); border-color: rgba(244, 234, 214, 0.3); }
.gm-room-acts { display: flex; justify-content: center; gap: var(--tw-3); margin-top: var(--tw-3); }
.gm-room-keys { margin-top: var(--tw-2); font-size: var(--tw-fs-xs); color: rgba(244, 234, 214, 0.5); }
/* (the fish's stage gives way to it: smaller, and gone on a short screen) */
.gm-catch.has-room .gm-catch-stage, .gm-catch.has-room.is-gl .gm-catch-stage { width: min(94vw, 1400px, calc(max(0px, min(40vh, 100vh - 600px)) * 2.4)); }
.gm-catch.has-room.is-flat .gm-catch-stage { width: 100%; }
@media (max-height: 500px) {
	.gm-catch.has-room .gm-catch-stats { margin-top: 0; }
	.gm-catch.has-room .gm-stat { padding: 6px 10px; }
	.gm-catch.has-room .gm-stat i { display: none; }
	.gm-room { margin-top: var(--tw-1); }
	.gm-room-fish { padding: var(--tw-1) var(--tw-2); }
	.gm-room-acts { margin-top: var(--tw-2); }
}
@media (prefers-reduced-motion: reduce) {
	.gm-catch.is-on .gm-catch-top, .gm-catch.is-on .gm-catch-bottom { animation: none; opacity: 1; }
	.gm-catch.is-on .gm-badge, .gm-catch.is-on .gm-badge.is-record { animation: none; transform: rotate(-3deg); opacity: 1; }
	.gm-catch.is-on .gm-splash i { animation: none; }
}
@media (max-width: 640px) {
	.gm-catch-stage { width: 96vw; }
	.gm-catch-stats { gap: 6px; }
	.gm-stat { min-width: 0; padding: 8px 10px; }
}
/* (Salt Life) the portrait is drawn in the game's canvas, under the card (FishPortrait): the dimming
   and blur are drawn there too, so nothing above it blurs */
.gm-catch-scrim.is-gl { display: none; }
.gm-catch.is-gl.tw-glass { background: none; border-color: transparent; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.gm-catch.is-gl .gm-catch-stage canvas { display: none; }
@media (max-height: 500px) {
	.gm-catch.is-gl { gap: 2px; padding: var(--tw-3) var(--tw-edge); }
	.gm-catch.is-gl .gm-catch-stage { width: min(94vw, calc(34vh * 2.4)); }
	.gm-catch.is-gl .gm-catch-sci, .gm-catch.is-gl .gm-catch-note { display: none; }
}
/* (Salt Life) the card without its studio portrait: the name at the top and the numbers at the bottom,
   and between them the real fish, hanging on the line in the world, which is neither dimmed nor blurred */
.gm-catch.is-on { pointer-events: auto; }
.gm-catch.is-flat { justify-content: space-between; padding-top: calc(64px + env(safe-area-inset-top)); padding-bottom: calc(var(--tw-4) + env(safe-area-inset-bottom)); }
.gm-catch.is-flat .gm-catch-stage { flex: 1 1 0; min-height: 0; aspect-ratio: auto; }
.gm-catch.is-flat.tw-glass { background: none; border-color: transparent; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.gm-catch-scrim.is-flat { -webkit-backdrop-filter: none; backdrop-filter: none;
	background: linear-gradient(180deg, rgba(4, 9, 15, 0.72) 0%, rgba(4, 9, 15, 0.12) 30%, rgba(4, 9, 15, 0.12) 52%, rgba(4, 9, 15, 0.8) 100%); }
@media (max-height: 500px) {
	.gm-catch.is-flat { padding-top: var(--tw-3); }
	.gm-catch.is-flat .gm-catch-sci, .gm-catch.is-flat .gm-catch-note { display: none; }
	.gm-catch h2 { font-size: clamp(30px, 5vw, 56px); }
}
`;

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

export class GameHUD {

	constructor( ui, game ) {

		this.ui = ui;
		this.game = game;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );

		this.purse = h( 'div', 'gm-purse tw-glass', `<span class="gm-money">$0</span><span class="gm-cooler"><span class="gm-cooler-label">Cooler</span><span class="gm-cooler-bar"><span></span></span><span class="gm-cooler-kg">0 / 66 lb</span></span><span class="gm-gauge gm-fuel"><span>Fuel</span><span class="gm-cooler-bar gm-fuel-bar"><span></span></span><b class="gm-fuel-l">11 gal</b></span><span class="gm-gauge gm-hull"><span>Hull</span><span class="gm-cooler-bar gm-hull-bar"><span></span></span><b class="gm-hull-p">100%</b></span><span class="gm-gauge gm-bilge"><span>Bilge</span><span class="gm-cooler-bar gm-bilge-bar"><span></span></span><b class="gm-bilge-l">0 gal</b></span><span class="gm-gauge gm-sonar"><span>Sonar</span><b class="gm-sonar-d">0 ft</b><span class="gm-sonar-dots"></span></span><span class="gm-gauge gm-breath"><span>Breath</span><span class="gm-cooler-bar gm-breath-bar"><span></span></span></span><span class="gm-gauge gm-bait"><span class="gm-bait-l">Bait</span><b class="gm-bait-t">Shrimp</b></span>` );
		this.baitEl = this.purse.querySelector( '.gm-bait' );
		this.baitL = this.purse.querySelector( '.gm-bait-l' );
		this.baitT = this.purse.querySelector( '.gm-bait-t' );
		this.breathEl = this.purse.querySelector( '.gm-breath' );
		this.breathBar = this.purse.querySelector( '.gm-breath-bar > span' );
		this.fuelEl = this.purse.querySelector( '.gm-fuel' );
		this.fuelBar = this.purse.querySelector( '.gm-fuel-bar > span' );
		this.fuelL = this.purse.querySelector( '.gm-fuel-l' );
		this.hullEl = this.purse.querySelector( '.gm-hull' );
		this.hullBar = this.purse.querySelector( '.gm-hull-bar > span' );
		this.hullP = this.purse.querySelector( '.gm-hull-p' );
		this.bilgeEl = this.purse.querySelector( '.gm-bilge' );
		this.bilgeBar = this.purse.querySelector( '.gm-bilge-bar > span' );
		this.bilgeL = this.purse.querySelector( '.gm-bilge-l' );
		this.sonarEl = this.purse.querySelector( '.gm-sonar' );
		this.sonarD = this.purse.querySelector( '.gm-sonar-d' );
		this.sonarDots = this.purse.querySelector( '.gm-sonar-dots' );
		this.moneyEl = this.purse.querySelector( '.gm-money' );
		this.coolerEl = this.purse.querySelector( '.gm-cooler' );
		this.coolerBar = this.purse.querySelector( '.gm-cooler-bar > span' );
		this.coolerKg = this.purse.querySelector( '.gm-cooler-kg' );
		this.coolerLabel = this.purse.querySelector( '.gm-cooler-label' );

		this.fight = h( 'div', 'gm-fight tw-glass', `
			<div class="gm-fight-head"><span class="gm-fight-call">Fish on!</span><span class="gm-fight-dist">0 ft</span></div>
			<div class="gm-tension"><span class="gm-band"></span><span class="gm-danger"></span><span class="gm-needle"></span></div>
			<div class="gm-stamina"><span>Fish</span><span class="gm-stamina-bar"><span></span></span></div>` );
		this.fCall = this.fight.querySelector( '.gm-fight-call' );
		this.fDist = this.fight.querySelector( '.gm-fight-dist' );
		this.fBand = this.fight.querySelector( '.gm-band' );
		this.fNeedle = this.fight.querySelector( '.gm-needle' );
		this.fStam = this.fight.querySelector( '.gm-stamina-bar > span' );

		this.bite = h( 'div', 'gm-bite', '!' );
		this.cast = h( 'div', 'gm-cast', '<span></span>' );
		this.castBar = this.cast.firstChild;
		this.netWind = h( 'div', 'gm-netwind', '<i></i><b></b>' );
		this.netWin = this.netWind.querySelector( 'i' );
		this.netNeedle = this.netWind.querySelector( 'b' );
		this.haul = h( 'div', 'gm-haul tw-glass' );
		this._haulT = 0;
		this.dot = h( 'div', 'gm-dot' );
		this.aimTag = h( 'div', 'gm-aim' );
		this.veil = h( 'div', 'gm-veil' );
		this.catchScrim = h( 'div', 'gm-catch-scrim' );
		this.catchCard = h( 'div', 'gm-catch tw-glass' );
		this.catchOpen = false;
		this._catchTap = false;
		this.catchCard.addEventListener( 'pointerdown', () => {

			if ( this.catchOpen && ! this.room ) this._catchTap = true;

		} );
		this.room = null; // (M15) { info, pick, ids, fits } while the card's making room for its fish
		this._catchAct = null;
		const hud = ui.hud || ui.root;
		hud.append( this.veil, this.catchScrim, this.purse, this.fight, this.bite, this.cast, this.netWind, this.haul, this.dot, this.aimTag, this.catchCard );
		// (Salt Life) on touch screens the minimap, the tips and the fight panel line up under the purse,
		// which wraps on narrow screens (game-ui.css): where it ends, and how tall the fight panel is (and
		// where the purse starts, for the toasts: style.css. On a computer a toast goes under the purse
		// when it doesn't fit beside it, so that's checked again here)
		if ( typeof ResizeObserver !== 'undefined' ) {

			const measure = () => {

				const css = document.documentElement.style;
				const r = this.purse.getBoundingClientRect();
				css.setProperty( '--gm-band', `${ Math.ceil( r.bottom ) }px` );
				css.setProperty( '--gm-purse-l', `${ Math.floor( r.left ) }px` );
				css.setProperty( '--gm-fight-h', `${ Math.ceil( this.fight.offsetHeight ) }px` );
				if ( ui.placeToast ) ui.placeToast();

			};

			const ro = new ResizeObserver( measure );
			ro.observe( this.purse );
			ro.observe( this.fight );
			window.addEventListener( 'resize', measure );

		}


		// panels (interactive)
		this.inv = h( 'div', 'gm-panel tw-glass tw-interactive' );
		this.stand = h( 'div', 'gm-panel tw-glass tw-interactive' );
		// ((M15) a message in a bottle's note: Beachcomb.js)
		this.note = h( 'div', 'gm-panel tw-glass tw-interactive' );
		this.noteOpen = false;
		ui.root.append( this.inv, this.stand, this.note );
		this.invOpen = false;
		this.invTab = 'fish';
		this.standOpen = false;
		this._last = {};
		game.state.onChange( () => this.refresh() );
		this.refresh();

	}

	toast( text, ms ) {

		this.ui.toast( text, ms );

	}

	refresh() {

		const s = this.game.state;
		const st = s.stats;
		this.moneyEl.textContent = `$${ s.money.toLocaleString() }`;
		const kg = s.holdKg;
		this.coolerLabel.textContent = s.upgrades.hold > 0 ? 'Hold' : 'Cooler';
		this.coolerKg.textContent = `${ pounds( kg ) } / ${ pounds( st.holdKg ) } lb`;
		this.coolerBar.style.width = `${ Math.min( 100, kg / st.holdKg * 100 ) }%`;
		this.coolerEl.classList.toggle( 'is-full', kg > st.holdKg * 0.9 );
		if ( this._last.money !== undefined && this._last.money !== s.money ) {

			this.purse.classList.remove( 'is-bump' );
			void this.purse.offsetWidth;
			this.purse.classList.add( 'is-bump' );

		}

		this._last.money = s.money;
		if ( this.invOpen ) this.renderInventory();
		if ( this.standOpen ) this.renderTrader();
		if ( this.room ) this.renderRoom();

	}

	// per frame
	// (Salt Life) aim: what's under the speargun's sights ({ label, cm, rule, far }); breath: the swimmer's
	// ({ s, max, blackout }) while it matters; netWind: the cast net's wind-up ({ charge, win: [ lo, hi ],
	// tired }); bait: the chip in the purse ({ label, text }: the hook's bait, or the bucket); (M10) hull:
	// the boat's wear (0..1) once it shows, bilge: the litres in her bilge while there are any
	update( { fight, casting, power, bite, aiming, fuel = null, sonar = null, aim = null, breath = null, netWind = null, bait = null, hull = null, bilge = null } ) {

		this.netWind.classList.toggle( 'is-on', !! netWind );
		if ( netWind ) {

			const [ lo, hi ] = netWind.win, c = netWind.charge;
			this.netWin.style.left = `${ lo * 100 }%`;
			this.netWin.style.width = `${ ( hi - lo ) * 100 }%`;
			this.netNeedle.style.left = `${ c * 100 }%`;
			this.netWind.classList.toggle( 'is-sweet', c >= lo && c <= hi );
			this.netWind.classList.toggle( 'is-tired', !! netWind.tired );

		}

		this.baitEl.classList.toggle( 'is-on', !! bait );
		if ( bait ) {

			if ( this.baitL.textContent !== bait.label ) this.baitL.textContent = bait.label;
			if ( this.baitT.textContent !== bait.text ) this.baitT.textContent = bait.text;

		}

		if ( this._haulT && performance.now() > this._haulT ) {

			this._haulT = 0;
			this.haul.classList.remove( 'is-on' );

		}

		// boat instruments in the purse: fuel while aboard, the fish finder when fitted
		this.fuelEl.classList.toggle( 'is-on', !! fuel );
		if ( fuel ) {

			this.fuelBar.style.width = `${ fuel.litres / fuel.tank * 100 }%`;
			this.fuelL.textContent = `${ gallons( fuel.litres ) } gal`;
			this.fuelEl.classList.toggle( 'is-low', fuel.litres < fuel.tank * 0.15 );

		}

		this.hullEl.classList.toggle( 'is-on', hull !== null );
		if ( hull !== null ) {

			const left = Math.round( ( 1 - hull ) * 100 );
			this.hullBar.style.width = `${ left }%`;
			if ( this.hullP.textContent !== `${ left }%` ) this.hullP.textContent = `${ left }%`;
			this.hullEl.classList.toggle( 'is-low', hull >= 0.5 );

		}

		this.bilgeEl.classList.toggle( 'is-on', bilge !== null );
		if ( bilge !== null ) {

			this.bilgeBar.style.width = `${ Math.min( 1, bilge / FLOOD_L ) * 100 }%`;
			const t = `${ gallons( bilge ) } gal`;
			if ( this.bilgeL.textContent !== t ) this.bilgeL.textContent = t;
			this.bilgeEl.classList.toggle( 'is-low', bilge >= FLOOD_L * 0.7 );

		}

		this.sonarEl.classList.toggle( 'is-on', !! sonar );
		if ( sonar ) {

			this.sonarD.textContent = feet( sonar.depth );
			const n = Math.round( sonar.fish * 4 );
			this.sonarDots.textContent = '●'.repeat( n ) + '○'.repeat( 4 - n );

		}


		this.fight.classList.toggle( 'is-on', !! fight );
		if ( fight ) {

			const T = Math.min( fight.tension, 1.05 );
			this.fNeedle.style.left = `${ T / 1.05 * 100 }%`;
			this.fNeedle.classList.toggle( 'is-hot', fight.tension > fight.band[ 1 ] );
			this.fBand.style.left = `${ fight.band[ 0 ] / 1.05 * 100 }%`;
			this.fBand.style.width = `${ ( fight.band[ 1 ] - fight.band[ 0 ] ) / 1.05 * 100 }%`;
			this.fStam.style.width = `${ fight.stamina * 100 }%`;
			this.fDist.textContent = feet( fight.distance );
			let call = fight.spear ? 'Pull it in' : 'Reel in', cls = '';
			if ( fight.tension > 0.88 ) { call = 'Ease off!'; cls = 'is-warn'; }
			else if ( fight.surge > 0.55 ) { call = 'It\'s running!'; cls = 'is-warn'; }
			else if ( fight.tension < 0.15 ) { call = 'Slack line!'; cls = 'is-warn'; }
			else if ( fight.tension >= fight.band[ 0 ] && fight.tension <= fight.band[ 1 ] ) { call = 'Good pressure'; cls = 'is-good'; }
			this.fCall.textContent = call;
			this.fCall.className = 'gm-fight-call ' + cls;

		}

		this.bite.classList.toggle( 'is-on', !! bite );
		this.cast.classList.toggle( 'is-on', !! casting );
		if ( casting ) this.castBar.style.width = `${ power * 100 }%`;
		this.dot.classList.toggle( 'is-on', !! aiming && ! this.invOpen && ! this.standOpen );

		// (Salt Life) the speargun's sights: the fish's name and size, and whether it may be taken
		const tag = aim && ! this.invOpen && ! this.standOpen && ! this.catchOpen;
		this.aimTag.classList.toggle( 'is-on', !! tag );
		if ( tag ) {

			// (a lobster: its carapace by eye, the gauge has the last word)
			const size = aim.carapace ? `~${ carapaceIn( aim.cm ).toFixed( 1 ) } in carapace` : inches( aim.cm );
			const short = aim.carapace && aim.cm < FISH.lobster.minCm;
			const why = { protected: 'protected', notTarget: 'not a target', small: `${ size } · too small`, byHand: 'by hand only', shark: 'no spearing sharks' }[ aim.rule ];
			const html = `${ escape( aim.label ) }<small>${ why || ( aim.far ? `${ size } · get closer` : short ? `${ size } · looks short` : size ) }</small>`;
			if ( html !== this._aimHtml ) {

				this._aimHtml = html;
				this.aimTag.innerHTML = html;

			}

			this.aimTag.className = 'gm-aim is-on' + ( aim.rule === 'small' || short ? ' is-small' : aim.rule !== 'ok' ? ' is-no' : aim.far ? ' is-far' : '' );

		}

		// the breath: its gauge, and the edges of sight closing in as it runs out
		this.breathEl.classList.toggle( 'is-on', !! breath );
		let veil = 0;
		if ( breath ) {

			const f = breath.s / breath.max;
			this.breathBar.style.width = `${ f * 100 }%`;
			this.breathEl.classList.toggle( 'is-low', f < 0.25 );
			veil = breath.blackout === 1 ? 1 : Math.max( 0, 1 - f / 0.22 ) * 0.85;

		}

		this._veil = ( this._veil || 0 ) + ( veil - ( this._veil || 0 ) ) * 0.1;
		const op = this._veil < 0.01 ? '0' : this._veil.toFixed( 2 );
		if ( this.veil.style.opacity !== op ) this.veil.style.opacity = op;

	}

	// ---- catch card
	// info: GameState.lastCatch ({ species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept,
	// released, why, method, bag })
	showCatch( info, ms = 9000 ) {

		const f = FISH[ info.species ];
		const inch = info.cm / IN, lbs = info.kg * LB;
		const isle = info.islandHeld;
		const badge = info.islandRecord ? '<span class="gm-badge is-record">★ Island record</span>'
			: info.record ? '<span class="gm-badge is-record">★ New record</span>'
			: info.newSpecies ? '<span class="gm-badge is-new">New species</span>' : `<span class="gm-badge is-plain">${ { spear: 'Speared', hand: 'By hand' }[ info.method ] || 'Catch' }</span>`;
		let note;
		// (Salt Life: a protected fish is measured and let go, as is a catch-and-release one and a short or
		// berried lobster; one over the day's bag goes back; the lionfish's bounty)
		const board = info.islandRecord ? '. It still goes on the board at the fish stand' : '';
		// ((M15) no room for one that could be kept: the card waits while you make room for it)
		const room = this.game.state.roomFor( info ), where = this.game.state.upgrades.hold > 0 ? 'hold' : 'cooler';
		if ( info.why === 'short' ) note = `<div class="gm-catch-note is-warn">Short: under ${ ( f.minCm * CARAPACE / IN ).toFixed( 0 ) } in on the gauge · back it goes, to grow${ board }.</div>`;
		else if ( info.why === 'berried' ) note = `<div class="gm-catch-note is-warn">Berried: she's carrying eggs under her tail · back she goes${ board }.</div>`;
		else if ( info.tagged ) note = `<div class="gm-catch-note">Tagged and let go alive for Marta's tag-and-release log: <b>$${ info.tagged }</b>${ board }.</div>`;
		else if ( info.released ) note = `<div class="gm-catch-note">${ f.cr ? 'Catch and release: everyone lets one go. Measured and' : 'Protected: measured and' } let go alive${ board }.</div>`;
		else if ( info.bag && info.bag.full ) note = `<div class="gm-catch-note is-warn">That's your ${ info.bag.max } for today, the most anyone may keep · back it goes</div>`;
		else if ( room ) note = `<div class="gm-catch-note is-warn">No room in the ${ where } for it · let fish go to make room, or let this one go</div>`;
		else if ( ! info.kept ) note = `<div class="gm-catch-note is-warn">${ info.kg > this.game.state.stats.holdKg ? `Too big for the ${ where }, even empty` : `No room in the ${ where }` } · you let it go</div>`;
		else if ( f.bounty && ! info.islandRecord && ! info.record ) note = `<div class="gm-catch-note">An invader on the reef: Joe pays $${ f.bounty } a fish on top.</div>`;
		else if ( info.islandRecord ) note = `<div class="gm-catch-note">The heaviest anyone here has landed${ isle ? `. It beats ${ escape( isle.who || 'someone' ) }'s <b>${ lb( isle.kg ) }</b>` : '' }. It goes on the board at the fish stand.</div>`;
		else if ( info.record ) note = `<div class="gm-catch-note">Previous best <b>${ lb( info.prevBestKg ) }</b> · ${ sizeOf( info.species, info.prevBestCm ) }. Beaten by ${ lb( info.kg - info.prevBestKg ) }.</div>`;
		else if ( info.placeRecord ) note = `<div class="gm-catch-note">The heaviest fish anyone here has had from ${ placeName( info.placeRecord ) }. It's on the records, in your cooler.</div>`;
		else if ( info.newSpecies ) note = `<div class="gm-catch-note">First one in your fish log${ info.firstAt ? `, and your first fish from ${ placeName( info.firstAt ) }` : '' }.</div>`;
		else if ( info.firstAt ) note = `<div class="gm-catch-note">Your first fish from ${ placeName( info.firstAt ) }: it's in your log.</div>`;
		else note = `<div class="gm-catch-note">Your best: ${ lb( info.prevBestKg ) } · ${ sizeOf( info.species, info.prevBestCm ) }</div>`;
		// splash burst around the fish as it lands in view
		let drops = '';
		for ( let i = 0; i < 26; i ++ ) {

			const a = ( i / 26 ) * Math.PI * 2 + Math.random() * 0.3, r = 90 + Math.random() * 260;
			drops += `<i style="--s:${ ( 4 + Math.random() * 12 ).toFixed( 1 ) }px;--x:${ ( Math.cos( a ) * r * 1.8 ).toFixed( 0 ) }px;--y:${ ( Math.sin( a ) * r * 0.55 - 40 ).toFixed( 0 ) }px;--d:${ ( 250 + Math.random() * 220 ).toFixed( 0 ) }ms"></i>`;

		}

		const c = this.catchCard;
		c.style.setProperty( '--gm-catch-ms', `${ ms }ms` );
		c.innerHTML = `
			<div class="gm-catch-top">
				<div class="gm-catch-eyebrow">${ badge }</div>
				<h2>${ f.name }</h2>
				<div class="gm-catch-sci">${ f.sci || '' }</div>
			</div>
			<div class="gm-catch-stage"><canvas></canvas><div class="gm-splash">${ drops }</div></div>
			<div class="gm-catch-bottom">
				<div class="gm-catch-stats">
					${ info.species === 'lobster' ? `<div class="gm-stat"><span>Carapace</span><b>${ carapaceIn( info.cm ).toFixed( 2 ) }<small>in</small></b><i>${ inches( info.cm ) } long</i></div>` : `<div class="gm-stat"><span>Length</span><b>${ inch.toFixed( 1 ) }<small>in</small></b><i>${ feetInches( info.cm ) || '&nbsp;' }</i></div>` }
					<div class="gm-stat"><span>Weight</span>${ lbs * 16 < 15.5 ? `<b>${ Math.max( 1, Math.round( lbs * 16 ) ) }<small>oz</small></b><i>&nbsp;</i>` : `<b>${ lbs.toFixed( 1 ) }<small>lb</small></b><i>${ lbOz( info.kg ) }</i>` }</div>
					<div class="gm-stat is-value"><span>Value</span><b>${ info.released ? '—' : `$${ info.value }` }</b><i>${ info.released ? 'released' : room ? 'no room yet' : ! info.kept ? 'let go' : info.wanted ? info.wanted.text : info.bag ? `${ info.bag.n } of ${ info.bag.max } today` : 'in the cooler' }</i></div>
				</div>
				${ note }
				${ room ? '<div class="gm-room"></div>' : `<div class="gm-catch-foot">${ { touch: 'Tap to continue', gamepad: '<kbd>RT</kbd> or <kbd>B</kbd> to continue' }[ this.device ] || '<kbd>Click</kbd> or <kbd>E</kbd> to continue' }<span class="gm-catch-timer"><span></span></span></div>` }
			</div>`;
		// restart the entrance even when a card is already up
		c.classList.remove( 'is-on' );
		void c.offsetWidth;
		c.classList.add( 'is-on' );
		this.catchScrim.classList.add( 'is-on' );
		this.catchOpen = true;
		this._catchAct = null;
		this.room = room ? { info, pick: 0, ids: [], fits: false } : null;
		c.classList.toggle( 'has-room', !! room );
		if ( room ) {

			this.renderRoom();
			releaseMouse(); // (the pointer, for its buttons)

		}
		// the fish itself: the real model in a studio, drawn live into the stage canvas
		// (Salt Life: the game's FishPortrait, drawn in the game's canvas under the card: no blur above it)
		let live = false;
		try {

			this.portrait = this.game.portrait || null;
			live = !! this.portrait && this.portrait.attach( c.querySelector( '.gm-catch-stage canvas' ) );
			if ( live ) this.portrait.show( info.species, info.kg );

		} catch ( e ) {

			console.warn( 'fish portrait unavailable', e );

		}

		// (no portrait: the fish on the line shows through)
		c.classList.toggle( 'is-flat', ! live );
		c.classList.toggle( 'is-gl', live );
		this.catchScrim.classList.toggle( 'is-flat', ! live );
		this.catchScrim.classList.toggle( 'is-gl', live );

	}

	// (Salt Life) what the cast net brought up (GameState.addHaul's result; n: how many fish; out: the
	// ones that got away, Fish.netStep): into the bait bucket, into the cooler, back in the water and
	// why; a new kind or a record. A few seconds, over the prompt; an empty net is only a toast, saying
	// why if any were under it
	showHaul( r, n, out = null, ms = 5200 ) {

		const s = this.game.state;
		if ( ! n ) {

			const k = ( x ) => x === 1 ? 'One' : x;
			const heavier = nextLevel( s.upgrades, 'castNet' ) ? ' · a heavier net sinks faster' : ' · let it sink, then close it';
			const why = ! out ? '' : out.under ? `${ k( out.under ) } got out under the lead line before it was down${ heavier }`
				: out.leapt ? `${ k( out.leapt ) } leapt clear as it settled` : out.big ? `${ k( out.big ) } too big for this net tore out of it`
					: out.mesh ? `${ k( out.mesh ) } slipped through the mesh` : '';
			const tips = [ 'Look for nervous water and jumping mullet', 'Bait fish gather by the pier\'s pilings', 'Mullet run the trough by the beach at dawn and dusk', 'Throw ahead of a moving school' ];
			this.toast( `Nothing in the net · ${ why || tips[ Math.floor( Math.random() * tips.length ) ] }`, why ? 3600 : 2600 );
			return;

		}

		const row = ( k, name, where, cls = '' ) => `<div class="gm-haul-row${ cls }"><b>${ k }</b><span>${ escape( name ) }</span><em>${ where }</em></div>`;
		let rows = '';
		for ( const [ kind, k ] of Object.entries( r.bait ) ) rows += row( k, FISH[ kind ] ? FISH[ kind ].name : BAITS[ kind ].name, 'bait bucket' );
		for ( const e of r.cooler ) rows += row( 1, `${ FISH[ e.species ].name } · ${ lb( e.kg ) }`, 'cooler', ' is-cooler' );
		const back = new Map();
		for ( const b of r.back ) {

			const key = b.label + '|' + b.why;
			back.set( key, ( back.get( key ) || 0 ) + 1 );

		}

		for ( const [ key, k ] of back ) {

			const [ label, why ] = key.split( '|' );
			rows += row( k, label, `let go · ${ BACK[ why ] || why }`, ' is-back' );

		}

		const tags = [ ...r.news.map( ( sp ) => `<span class="is-new">New · ${ FISH[ sp ].name }</span>` ), ...r.records.map( ( sp ) => `<span class="is-record">Record · ${ FISH[ sp ].name }</span>` ) ].join( '' );
		this.haul.innerHTML = `
			<div class="gm-haul-h"><b>The net came up with ${ n } fish</b><small>Bucket ${ s.baitCount } / ${ s.stats.baitMax }</small></div>
			${ rows }${ tags ? `<div class="gm-haul-tags">${ tags }</div>` : '' }`;
		this.haul.classList.remove( 'is-on' );
		void this.haul.offsetWidth;
		this.haul.classList.add( 'is-on' );
		this._haulT = performance.now() + ms;

	}

	// a button's label with its key, for keyboards and gamepads ('Leave (E)'); touch screens just tap it
	keyed( label, key, pad ) {

		const d = this.device;
		return d === 'touch' ? label : `${ label } (${ d === 'gamepad' ? pad : key })`;

	}

	// a tap or click on the catch card (Game dismisses the card with it), once
	takeCatchTap() {

		const t = this._catchTap;
		this._catchTap = false;
		return t;

	}

	// (M15) what the card's own buttons said, once: 'keep' (room made: keep it), 'go' (let it go), or null
	takeCatchAct() {

		const a = this._catchAct;
		this._catchAct = null;
		return a;

	}

	// (M15) the card making room for its fish: the room it needs, the cooler's fish (cheapest first), each to
	// let go, and keep it or let it go
	renderRoom() {

		const R = this.room, el = this.catchCard.querySelector( '.gm-room' );
		if ( ! R || ! el ) return;
		const s = this.game.state, info = R.info, cap = s.stats.holdKg, held = s.holdKg;
		const need = held + info.kg - cap;
		const fish = s.inventory.slice().sort( ( a, b ) => a.value - b.value || a.kg - b.kg );
		R.ids = fish.map( ( f ) => f.id );
		R.pick = Math.max( 0, Math.min( R.pick, fish.length - 1 ) );
		R.fits = need <= 1e-6;
		const d = this.device, where = s.upgrades.hold > 0 ? 'hold' : 'cooler';
		const pct = ( kg ) => Math.max( 0, Math.min( 100, kg / cap * 100 ) ).toFixed( 1 );
		const chips = fish.map( ( f, i ) => `<div class="gm-room-fish${ i === R.pick && d !== 'touch' ? ' is-pick' : '' }"><b>${ FISH[ f.species ].name }</b><span>${ lb( f.kg ) } · $${ f.value }</span><button class="gm-mini" data-let="${ f.id }">Let go</button></div>` ).join( '' );
		const keys = { gamepad: '<kbd>←</kbd> <kbd>→</kbd> on the d-pad to pick one · <kbd>X</kbd> lets it go', keyboard: '<kbd>←</kbd> <kbd>→</kbd> to pick one · <kbd>R</kbd> lets it go' }[ d ];
		el.innerHTML = `
			<div class="gm-room-head"><span>${ upper( where ) } ${ pounds( held ) } of ${ pounds( cap ) } lb</span>
				<span class="gm-room-meter"><span class="is-in" style="width:${ pct( held ) }%"></span><span class="is-new${ R.fits ? ' is-ok' : '' }" style="left:${ pct( held ) }%;width:${ pct( info.kg ) }%"></span></span>
				<b class="${ R.fits ? 'is-ok' : '' }">${ R.fits ? 'Room for it' : `${ lb( need, 1 ) } short` }</b></div>
			<div class="gm-room-list">${ chips }</div>
			<div class="gm-room-acts"><button class="gm-btn is-ghost" data-go>${ this.keyed( 'Let it go', 'E', 'B' ) }</button><button class="gm-btn" data-keep ${ R.fits ? '' : 'disabled' }>${ this.keyed( 'Keep it', 'Enter', 'RT' ) }</button></div>
			${ keys ? `<div class="gm-room-keys">${ keys }</div>` : '' }`;
		for ( const b of el.querySelectorAll( '[data-let]' ) ) b.onclick = () => s.release( Number( b.dataset.let ) );
		el.querySelector( '[data-go]' ).onclick = () => this._catchAct = 'go';
		el.querySelector( '[data-keep]' ).onclick = () => {

			if ( this.room && this.room.fits ) this._catchAct = 'keep';

		};
		const pick = el.querySelector( '.gm-room-fish.is-pick' );
		if ( pick ) pick.scrollIntoView( { block: 'nearest', inline: 'nearest' } );

	}

	// (M15) the next or previous fish to let go (← →, the d-pad), and letting it go (R, X)
	roomStep( step ) {

		const R = this.room;
		if ( ! R || ! R.ids.length ) return;
		R.pick = ( R.pick + step + R.ids.length ) % R.ids.length;
		this.renderRoom();

	}

	roomLetGo() {

		const R = this.room;
		if ( R && R.ids.length ) this.game.state.release( R.ids[ R.pick ] );

	}

	// the input in use ('keyboard' | 'touch' | 'gamepad'), for what the panels call the controls
	get device() {

		return this.game.app.input.lastDevice;

	}

	hideCatch() {

		this.catchCard.classList.remove( 'is-on' );
		this.catchScrim.classList.remove( 'is-on' );
		this.catchOpen = false;
		this._catchTap = false;
		this._catchAct = null;
		this.room = null;
		if ( this.portrait ) this.portrait.detach();

	}

	// ---- inventory
	toggleInventory( force ) {

		this.invOpen = force ?? ! this.invOpen;
		if ( this.invOpen ) {

			this.closeStand();
			this.renderInventory();
			releaseMouse();

		}

		this.inv.classList.toggle( 'is-open', this.invOpen );

	}

	// the cooler, in tabs: the fish in it, your log, the island's records, and how the others see you
	renderInventory() {

		const s = this.game.state;
		const together = this.game.app && this.game.app.together, me = together && together.me.id;
		const logged = Object.entries( s.log ).filter( ( [ k ] ) => FISH[ k ] );
		// (Salt Life) the island's records: the group's heaviest of each kind (together/)
		const isle = together ? Object.entries( together.records ).filter( ( [ k ] ) => FISH[ k ] ).sort( ( a, b ) => b[ 1 ].kg - a[ 1 ].kg ) : [];
		const tabs = [ [ 'fish', 'Fish', s.inventory.length ], [ 'bait', 'Bait', Object.values( s.bait ).reduce( ( a, n ) => a + n, 0 ) ], [ 'finds', 'Finds', s.finds.length ], [ 'log', 'Log', logged.length ] ];
		if ( together ) tabs.push( [ 'records', 'Records', isle.length ], [ 'islander', 'Islander', 0 ] );
		this._invTabs = tabs.map( ( t ) => t[ 0 ] );
		const tab = this._invTabs.includes( this.invTab ) ? this.invTab : 'fish';
		const empty = ( text ) => `<div class="gm-empty">${ text }</div>`;
		const d = this.device;
		let body, hint;
		if ( tab === 'fish' ) {

			// (Salt Life) a mullet can be cut into bait for the hook
			const g = this.game, wanted = s.wantedIds( g.orders, g.tradeDay, g.weekTerms ? g.weekTerms() : null );
			body = s.inventory.map( ( f ) => fishItem( f, `<span class="gm-btns">${ f.species === 'mullet' ? `<button class="gm-mini" data-cut="${ f.id }" title="Cut into ${ chunksOf( f.kg ) } chunks of bait">Cut bait</button>` : '' }<button class="gm-mini" data-release="${ f.id }">Release</button></span>`, f.value, wanted.has( f.id ) ) ).join( '' ) || empty( 'Nothing yet. Cast from the pier, the beach or the boat, throw the cast net, dive with the speargun, or hunt lobsters on the reef after dark.' );
			hint = 'Sell at the fish stand by the pier';

		} else if ( tab === 'bait' ) {

			// (Salt Life) the bait bucket (Bait.js): what goes on the hook at the next cast
			const pick = s.baitPick, well = UPGRADES.baitWell.levels[ s.upgrades.baitWell | 0 ].label.toLowerCase();
			const on = ( k ) => `<button class="gm-mini${ pick === k ? ' is-on' : '' }" data-bait="${ k || '' }" aria-pressed="${ pick === k }">${ pick === k ? 'On the hook' : 'Use' }</button>`;
			body = item( 'Frozen shrimp', 'never runs out · the little fish take it', on( null ) )
				+ BAIT_IDS.filter( ( k ) => s.bait[ k ] > 0 ).map( ( k ) => item( BAITS[ k ].name, `${ s.bait[ k ] } in the ${ BAITS[ k ].live ? well : 'cooler' }`, `<span class="gm-btns">${ on( k ) }<button class="gm-mini" data-dump="${ k }">${ BAITS[ k ].live ? 'Let go' : 'Toss' }</button></span>` ) ).join( '' );
			if ( ! BAIT_IDS.some( ( k ) => s.bait[ k ] > 0 ) ) body += empty( 'Throw the cast net for live bait: silversides, sergeant majors, small grunts and mullet. The big fish come for it.' );
			hint = `${ s.baitCount } / ${ s.stats.baitMax } in the bucket · ${ d === 'gamepad' ? 'D-pad ← →' : d === 'touch' ? 'the Bait button' : '<kbd>B</kbd>' } changes it with the rod out`;

		} else if ( tab === 'finds' ) {

			// ((M15) what you've picked up off the beaches: who buys it and for what; a bottle's note to read again)
			body = s.finds.map( ( f ) => {

				const F = FINDS[ f.kind ], buyer = F.who ? `${ F.who === 'joe' ? 'Joe' : 'Marta' } pays $${ F.price }` : 'a keepsake';
				const btns = f.kind === 'bottle' ? `<button class="gm-mini" data-read="${ f.id }">Read</button>` : '';
				return item( F.name, `${ F.what } · ${ buyer }`, `<span class="gm-btns">${ btns }<button class="gm-mini" data-toss="${ f.id }">Toss</button></span>` );

			} ).join( '' ) || empty( 'The sea brings things in on the north beach, along the line of weed at the top of the tide: driftwood, floats, sea beans, now and then a bottle. Most after a blow from the north, and after a hurricane.' );
			hint = 'Marta buys most of it; Joe knows a buyer for ambergris';

		} else if ( tab === 'log' ) {

			body = logged.map( ( [ k, v ] ) => item( FISH[ k ].name, `${ v.count } caught`, `<span class="gm-item-num">${ lb( v.bestKg ) } · ${ sizeOf( k, v.bestCm ?? fishLengthCm( k, v.bestKg ) ) }</span>` ) ).join( '' )
				|| empty( 'Each kind you catch is logged here, with your best.' );
			// ((M15) and the places you've fished: how many there, and the first)
			const places = Object.entries( s.places || {} ).filter( ( [ k ] ) => PLACES[ k ] );
			if ( places.length ) body += `<div class="gm-wanted"><span class="gm-wanted-h">Places you've fished</span>${ places.map( ( [ k, p ] ) => item( placeName( k, true ), `first ${ p.first && FISH[ p.first ] ? `a ${ FISH[ p.first ].name.toLowerCase() }` : 'a fish' }${ Number.isFinite( p.day ) ? `, day ${ p.day + 1 }` : '' }`, `<span class="gm-item-num">${ p.n } fish</span>` ) ).join( '' ) }</div>`;
			// ((M15) the far places you've come to and not fished yet, and how many are still out there)
			const seen = FAR_PLACES.filter( ( k ) => s.found[ k ] !== undefined && ! s.places[ k ] ), left = FAR_PLACES.filter( ( k ) => s.found[ k ] === undefined ).length;
			if ( seen.length || left ) body += `<div class="gm-wanted"><span class="gm-wanted-h">Far places you've found</span>${ seen.map( ( k ) => item( placeName( k, true ), `${ PLACES[ k ].what }${ Number.isFinite( s.found[ k ] ) ? `, day ${ s.found[ k ] + 1 }` : '' }`, '<span class="gm-item-num">no fish yet</span>' ) ).join( '' ) }${ left ? `<div class="gm-item"><span class="gm-item-main"><span class="gm-item-meta">${ left } more out there, not found yet</span></span></div>` : '' }</div>`;
			hint = 'Your best of each kind, and where you\'ve fished';

		} else if ( tab === 'records' ) {

			body = isle.map( ( [ k, r ] ) => item( FISH[ k ].name, ( r.id === me ? '<b>You</b>' : escape( r.who || '?' ) ) + ( { s: ' · speared', n: ' · netted', h: ' · by hand' }[ r.m ] || '' ), `<span class="gm-item-num">${ lb( r.kg ) }${ r.cm ? ` · ${ sizeOf( k, r.cm ) }` : '' }</span>` ) ).join( '' )
				|| empty( 'None yet: the first of each kind anyone lands here sets one.' );
			// ((M15) and each place's: the heaviest fish anyone's had there; a far place named once you've found it)
			const at = Object.entries( together.records ).filter( ( [ k, r ] ) => k[ 0 ] === '@' && PLACES[ k.slice( 1 ) ] && FISH[ r.s ] ).sort( ( a, b ) => b[ 1 ].kg - a[ 1 ].kg );
			if ( at.length ) body += `<div class="gm-wanted"><span class="gm-wanted-h">The heaviest from each place</span>${ at.map( ( [ k, r ] ) => item( farName( k.slice( 1 ), s.found, true ), `${ FISH[ r.s ].name } · ${ r.id === me ? '<b>You</b>' : escape( r.who || '?' ) }`, `<span class="gm-item-num">${ lb( r.kg ) }</span>` ) ).join( '' ) }</div>`;
			hint = 'The heaviest of each kind anyone here has landed, and from each place';

		} else {

			body = `<div class="gm-looks">${ LOOKS.map( ( l ) => {

				const [ who, wear ] = LOOK_NAMES[ l ].split( ' · ' ), on = l === together.myLook;
				return `<button class="gm-look${ on ? ' is-on' : '' }" data-look="${ l }" aria-pressed="${ on }"><b>${ who }</b><span>${ upper( wear || '' ) }</span></button>`;

			} ).join( '' ) }</div>`;
			hint = d === 'gamepad' ? 'How the others see you. <kbd>RT</kbd> for the next one' : 'How the others on the island see you';

		}

		// (the list keeps its place when the same tab is drawn again: a fish released, a record broken)
		const old = this.inv.querySelector( '.gm-list' );
		const scroll = old && this._invDrawn === tab ? old.scrollTop : 0;
		this._invDrawn = tab;
		const keys = d === 'touch' ? '' : `<span class="gm-tabs-keys">${ d === 'gamepad' ? 'D-pad' : '<kbd>←</kbd><kbd>→</kbd>' }</span>`;
		this.inv.innerHTML = `
			<div class="gm-head"><h2>${ s.upgrades.hold > 0 ? 'Fish hold' : 'Cooler' }</h2>
			<p class="gm-sub">${ s.inventory.length } fish · ${ pounds( s.holdKg ) } of ${ pounds( s.stats.holdKg ) } lb · worth $${ s.holdValue }</p></div>
			<div class="gm-tabs" role="tablist">${ tabs.map( ( [ id, label, n ] ) => `<button class="gm-tab${ id === tab ? ' is-on' : '' }" role="tab" aria-selected="${ id === tab }" data-tab="${ id }">${ label }${ n ? `<small>${ n }</small>` : '' }</button>` ).join( '' ) }${ keys }</div>
			<div class="gm-list" role="tabpanel">${ body }</div>
			<div class="gm-foot"><span class="gm-sub">${ hint }</span><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Close', 'I', 'Back' ) }</button></div>`;
		this.inv.querySelector( '.gm-list' ).scrollTop = scroll;
		this.inv.querySelector( '[data-close]' ).onclick = () => this.toggleInventory( false );
		for ( const b of this.inv.querySelectorAll( '[data-tab]' ) ) b.onclick = () => this.showTab( b.dataset.tab );
		for ( const b of this.inv.querySelectorAll( '[data-release]' ) ) b.onclick = () => s.release( Number( b.dataset.release ) );
		for ( const b of this.inv.querySelectorAll( '[data-cut]' ) ) b.onclick = () => {

			const n = s.cutBait( Number( b.dataset.cut ) );
			if ( n ) this.toast( `Cut into ${ n } chunks of bait`, 1800 );

		};
		for ( const b of this.inv.querySelectorAll( '[data-bait]' ) ) b.onclick = () => s.pickBait( b.dataset.bait || null );
		for ( const b of this.inv.querySelectorAll( '[data-toss]' ) ) b.onclick = () => s.dropFind( b.dataset.toss );
		for ( const b of this.inv.querySelectorAll( '[data-read]' ) ) b.onclick = () => {

			const f = s.finds.find( ( q ) => q.id === b.dataset.read );
			if ( f ) this.showNote( messageOf( f.seed ) );

		};
		for ( const b of this.inv.querySelectorAll( '[data-dump]' ) ) b.onclick = () => s.dumpBait( b.dataset.dump );
		for ( const b of this.inv.querySelectorAll( '[data-look]' ) ) b.onclick = () => {

			together.setLook( b.dataset.look );
			this.renderInventory();

		};

	}

	showTab( tab ) {

		this.invTab = tab;
		this.renderInventory();

	}

	// the next or previous tab (← → on a keyboard, the d-pad)
	cycleTab( step ) {

		const list = this._invTabs || [ 'fish' ];
		const i = Math.max( 0, list.indexOf( this.invTab ) );
		this.showTab( list[ ( i + step + list.length ) % list.length ] );

	}

	// (a gamepad on the Islander tab) the next islander
	nextLook() {

		const together = this.game.app && this.game.app.together;
		if ( ! together ) return;
		together.setLook( LOOKS[ ( LOOKS.indexOf( together.myLook ) + 1 ) % LOOKS.length ] );
		this.renderInventory();

	}

	// ---- fish stand
	openStand( vendor ) {

		this.standOpen = true;
		this.vendor = vendor;
		this._standDrawn = null; // (opened again: its list from the top)
		this.toggleInventory( false );
		// (Salt Life) Joe pays your share of a filled week's order when he's in
		if ( vendor.kind === 'buyer' && this.game.collectWeek ) this.game.collectWeek();
		this.renderTrader();
		this.stand.classList.add( 'is-open' );
		releaseMouse();

	}

	closeStand() {

		this.standOpen = false;
		this.stand.classList.remove( 'is-open' );
		this.game.paidNote = 0;

	}

	// (Salt Life) a trader's part of the day's wanted list ('joe' | 'marta'): a block over the list, each
	// fish with what it pays, where it bites and how many you've brought
	wantedBlock( who, title ) {

		const g = this.game, s = g.state;
		const rows = ( g.orders || [] ).filter( ( o ) => o.who === who ).map( ( o ) => {

			const n = s.filledOf( o, g.tradeDay ), hint = o.place ? orderPlace( o ) : who === 'marta' ? 'for her bait tank' : biteHint( o.species );
			return item( FISH[ o.species ].name, `${ orderTerms( o ) }${ hint ? ` · ${ hint }` : '' }`, `<span class="gm-item-num">${ n } / ${ o.max }</span>` )
				.replace( 'class="gm-item"', `class="gm-item${ n >= o.max ? ' is-done' : '' }"` );

		} ).join( '' );
		return rows ? `<div class="gm-wanted"><span class="gm-wanted-h">${ title }</span>${ rows }</div>` : '';

	}

	// (Salt Life) the week's order at Joe's (WeekOrder.js): what it is, how far the group has got and
	// what you've brought; once it's filled, your share of the bonus
	weekBlock( box ) {

		const g = this.game, t = g.week ? g.week() : null;
		if ( ! t ) return '';
		const me = g.app.together.me.id, got = delivered( t ), mine = mineOf( t, me ), done = filled( t ), share = shareOf( t, me );
		const days = Math.ceil( ( weekEnds( t.week ) - Date.now() ) / 864e5 );
		const when = days > 1 ? `${ days } days left` : 'last day';
		const helped = Object.keys( t.by ).length;
		const meta = done ? `filled by ${ helped === 1 ? ( mine ? 'you' : 'one islander' ) : `${ helped } of you` }` : `for a restaurant on the mainland · pays ×${ WEEK_MUL }`;
		const note = done ? ( share ? `Your share of the $${ t.bonus } bonus: $${ share }${ g.state.weekPaid !== null && g.state.weekPaid >= t.week ? ', paid' : box ? '. Joe pays it when he\'s in' : '' }.` : 'A new order next week.' )
			: `$${ t.bonus } bonus when it's filled, shared by what each of you brings.${ mine ? ` You've brought ${ pounds( mine ) } lb.` : '' }`;
		const row = item( FISH[ t.species ].name, meta, `<span class="gm-item-num">${ done ? '✓ ' : '' }${ pounds( Math.min( got, t.kg ) ) } / ${ pounds( t.kg ) } lb</span>` );
		return `<div class="gm-wanted"><span class="gm-wanted-h">The week's order${ done ? '' : ` · ${ when }` }</span>${ row }<div class="gm-week-bar"><span style="width:${ Math.min( 100, got / t.kg * 100 ).toFixed( 1 ) }%"></span></div><span class="gm-week-note">${ note }</span></div>`;

	}

	// the last ¾ hour before a trader shuts
	closingSoon( v ) {

		const h = this.game.hour, close = v.hours && v.hours[ 1 ];
		return !! v.open && close !== undefined && h < close && close - h <= 0.75;

	}

	// an hour of the day as the person reads it ('7:00 PM')
	at( hour ) {

		const p = this.game.app && this.game.app.portal;
		return timeText( hour, p && p.locale, 30 );

	}

	renderStand() {

		const g = this.game, s = g.state;
		const v = this.vendor || { name: 'Fish buyer', open: true };
		// (Salt Life) Joe's price and his wanted list; gone home, his night box
		const box = ! v.open, terms = g.saleTerms ? g.saleTerms( v ) : null;
		const all = s.quote( null, terms );
		const rows = s.inventory.map( ( f ) => {

			const q = s.quote( [ f.id ], terms );
			return fishItem( f, `<button class="gm-mini" data-sell="${ f.id }">${ box ? 'Drop' : 'Sell' }</button>`, q.prices.get( f.id ), q.wanted > 0 || q.weekN > 0 );

		} ).join( '' );
		// ((M9) or he's shut for the weather)
		const sub = box ? `${ v.boarded ? 'Joe\'s boarded up for the hurricane' : v.weatherShut ? 'Joe\'s shut for the weather' : `Joe's back at ${ this.at( v.hours[ 0 ] ) }` }. The box pays ${ Math.round( NIGHT_BOX * 100 ) }% of his price, and his orders in full.`
			: g.paidNote ? `The restaurant's paid for the week's order. Here's your share: $${ g.paidNote }.`
			: this.closingSoon( v ) ? `Last orders: I shut at ${ this.at( v.hours[ 1 ] ) }.`
			: s.inventory.length ? v.greeting || 'Let\'s see what you caught.' : v.idle || 'Come back when you\'ve got fish.';
		// the wanted list and the week's order scroll with the fish, under the title and over the
		// buttons: on a short screen they'd leave no room for either. On a phone on its side with
		// room, they're beside the fish (gm-split, game-ui.css)
		const orders = this.wantedBlock( 'joe', 'Wanted today' ) + this.weekBlock( box ) + ( box ? '' : this.findsBlock( 'joe', 'He\'ll take off your hands' ) );
		this.drawStand( v, `
			<div class="gm-head"><h2>${ box ? 'Joe\'s night box' : v.name }</h2>
			<p class="gm-sub">${ sub }</p></div>
			<div class="gm-list${ orders ? ' gm-split' : '' }"><div class="gm-orders">${ orders }</div><div class="gm-rows">${ rows || '<div class="gm-empty">Your cooler is empty.</div>' }</div></div>
			<div class="gm-foot"><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Leave', 'E', 'B' ) }</button><button class="gm-btn" data-all ${ s.inventory.length ? '' : 'disabled' }>${ box ? 'Drop all' : 'Sell all' } · $${ all.total }</button></div>` );
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		this.stand.querySelector( '[data-all]' ).onclick = () => this.game.sellAll();
		for ( const b of this.stand.querySelectorAll( '[data-sell]' ) ) b.onclick = () => this.game.sell( [ Number( b.dataset.sell ) ] );
		this.bindFinds( 'joe' );

	}

	// the open trader's panel: Marta's shop, (M15) Pearl's camp, or Joe's stand
	renderTrader() {

		const k = this.vendor && this.vendor.kind;
		if ( k === 'shop' ) this.renderShop();
		else if ( k === 'camp' ) this.renderCamp();
		else this.renderStand();

	}

	// (M15) Pearl at the fish camp on the north beach: your catch at her price (Joe's, less the trip round to
	// market), diesel from her drums at hers; gone round to market, nothing
	renderCamp() {

		const g = this.game, s = g.state, v = this.vendor, name = v.name.split( ' ·' )[ 0 ];
		if ( ! v.open ) {

			this.drawStand( v, `
				<div class="gm-head"><h2>${ v.name }</h2>
				<p class="gm-sub">${ v.boarded ? `${ name }'s boarded up for the hurricane` : v.weatherShut ? `${ name }'s shut for the weather` : `${ name }'s gone round to market with the day's fish. She's back at ${ this.at( v.hours[ 0 ] ) }` }.</p></div>
				<div class="gm-foot"><span class="gm-sub">Her drums are locked while she's away</span><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Leave', 'E', 'B' ) }</button></div>` );
			this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
			return;

		}

		const terms = g.saleTerms( v ), all = s.quote( null, terms );
		const rows = s.inventory.map( ( f ) => fishItem( f, `<button class="gm-mini" data-sell="${ f.id }">Sell</button>`, s.quote( [ f.id ], terms ).prices.get( f.id ), false ) ).join( '' );
		const missing = s.stats.fuelL - s.fuelL;
		const fuelRow = `<div class="gm-shop-row"><span>Diesel · $${ ( CAMP.fuel * GAL ).toFixed( 2 ) } / gal<small>From her drums by the jetty · tank: ${ gallons( s.fuelL ) } of ${ gallons( s.stats.fuelL ) } gal</small></span>${ missing > 0.5 ? `<button class="gm-btn" data-fuel ${ s.money < CAMP.fuel ? 'disabled' : '' }>Fill · $${ Math.min( s.refuelCost( CAMP.fuel ), Math.floor( s.money / CAMP.fuel ) * CAMP.fuel ) }</button>` : '<span class="gm-have">Full</span>' }</div>`;
		const sub = this.closingSoon( v ) ? `I'm off round to market at ${ this.at( v.hours[ 1 ] ) }.` : s.inventory.length ? v.greeting : v.idle;
		this.drawStand( v, `
			<div class="gm-head"><h2>${ v.name }</h2>
			<p class="gm-sub">${ sub } She pays ${ Math.round( CAMP.rate * 100 ) }% of Joe's price. You have $${ s.money.toLocaleString() }</p></div>
			<div class="gm-list">${ fuelRow }<div class="gm-rows">${ rows || '<div class="gm-empty">Your cooler is empty.</div>' }</div></div>
			<div class="gm-foot"><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Leave', 'E', 'B' ) }</button><button class="gm-btn" data-all ${ s.inventory.length ? '' : 'disabled' }>Sell all · $${ all.total }</button></div>` );
		// (each drawn again by the state's change: refresh)
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		this.stand.querySelector( '[data-all]' ).onclick = () => this.game.sellAll();
		for ( const b of this.stand.querySelectorAll( '[data-sell]' ) ) b.onclick = () => this.game.sell( [ Number( b.dataset.sell ) ] );
		const f = this.stand.querySelector( '[data-fuel]' );
		if ( f ) f.onclick = () => this.game.refuel( CAMP.fuel );

	}

	// (M15) what a trader ('marta' | 'joe') buys of your finds: a block of them, each with its price, and all of
	// them at once
	findsBlock( who, title ) {

		const s = this.game.state, q = s.quoteFinds( who );
		if ( ! q.items.length ) return '';
		const rows = q.items.map( ( f ) => item( FINDS[ f.kind ].name, FINDS[ f.kind ].what, `<span class="gm-item-val">$${ FINDS[ f.kind ].price }</span>`, `<button class="gm-mini" data-sellfind="${ f.id }">Sell</button>` ) ).join( '' );
		return `<div class="gm-wanted"><span class="gm-wanted-h">${ title }</span>${ rows }${ q.items.length > 1 ? `<button class="gm-mini" data-sellfinds>Sell them all · $${ q.total }</button>` : '' }</div>`;

	}

	bindFinds( who ) {

		for ( const b of this.stand.querySelectorAll( '[data-sellfind]' ) ) b.onclick = () => this.game.sellFinds( who, [ b.dataset.sellfind ] );
		const all = this.stand.querySelector( '[data-sellfinds]' );
		if ( all ) all.onclick = () => this.game.sellFinds( who );

	}

	// (M15) a message in a bottle's note, unrolled
	showNote( m ) {

		this.noteOpen = true;
		this.note.innerHTML = `
			<div class="gm-head"><h2>A message in a bottle</h2><p class="gm-sub">From ${ escape( m.from ) }</p></div>
			<div class="gm-list"><p class="gm-note-text">“${ escape( m.text ) }”</p></div>
			<div class="gm-foot"><span class="gm-sub">Kept in your finds</span><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Close', 'E', 'B' ) }</button></div>`;
		this.note.querySelector( '[data-close]' ).onclick = () => this.closeNote();
		this.note.classList.add( 'is-open' );
		releaseMouse();

	}

	closeNote() {

		this.noteOpen = false;
		this.note.classList.remove( 'is-open' );

	}

	// a trader's panel drawn again, its list (or Joe's two columns) keeping its place for the same
	// trader (a fish sold, a thing bought)
	drawStand( v, html ) {

		const scrollers = () => this.stand.querySelectorAll( '.gm-list, .gm-orders, .gm-rows' );
		const was = this._standDrawn === v ? [ ...scrollers() ].map( ( e ) => e.scrollTop ) : [];
		this._standDrawn = v;
		this.stand.innerHTML = html;
		scrollers().forEach( ( e, i ) => e.scrollTop = was[ i ] || 0 );

	}

}

GameHUD.prototype.renderShop = function () {

	const g = this.game, s = g.state;
	const v = this.vendor;
	const missing = s.stats.fuelL - s.fuelL;
	const fuelRow = `<div class="gm-shop-row"><span>Diesel · $${ ( FUEL_PRICE * GAL ).toFixed( 2 ) } / gal<small>Tank: ${ gallons( s.fuelL ) } of ${ gallons( s.stats.fuelL ) } gal</small></span>${ missing > 0.5 ? `<button class="gm-btn" data-fuel ${ s.money < FUEL_PRICE ? 'disabled' : '' }>Fill · $${ s.refuelCost() }</button>` : '<span class="gm-have">Full</span>' }</div>`;
	// (Salt Life) your boat drifted off: Marta tows her back to the dock (out of hours too: into the box)
	const job = g.towJob ? g.towJob() : null;
	const towRow = job ? `<div class="gm-shop-row"><span>Tow your boat in<small>She's drifted ${ farOff( job.metres ) } off the dock</small></span><button class="gm-btn" data-tow>Tow · $${ Math.min( job.fee, s.money ) }</button></div>` : '';
	// (M10) her hull: Marta repairs it while she's open, with the boat at her dock (as far as your money goes)
	const fix = g.repairJob ? g.repairJob() : null;
	const pays = fix ? Math.min( fix.fee, s.money ) : 0;
	// (M13) ahead of a hurricane she hauls your boat out onto a cradle ashore, and puts her back in after
	const haul = g.haulJob ? g.haulJob() : null;
	const haulRow = ! haul ? '' : haul.back !== undefined
		? `<div class="gm-shop-row"><span>Put her back in<small>${ haul.back ? 'She\'s on her cradle ashore · the hurricane\'s gone by' : 'She\'s on her cradle ashore until the hurricane\'s gone by' }</small></span><button class="gm-btn" data-relaunch>Back in</button></div>`
		: `<div class="gm-shop-row"><span>Haul her out for the hurricane<small>${ haul.here ? 'On a cradle ashore, out of the storm · back in once it\'s gone by' : 'Bring her in to the dock first' }</small></span>${ haul.here ? `<button class="gm-btn" data-haul ${ s.money < haul.fee ? 'disabled' : '' }>Haul out · $${ haul.fee }</button>` : '' }</div>`;
	const repairRow = fix ? `<div class="gm-shop-row"><span>Repair the hull<small>${ fix.here ? `She's ${ Math.round( fix.wear * 100 ) }% worn${ pays < fix.fee ? ` · $${ fix.fee } for all of it` : '' }` : 'Bring her in to the dock first' }</small></span>${ fix.here ? `<button class="gm-btn" data-repair ${ pays < 1 ? 'disabled' : '' }>Repair · $${ pays }</button>` : '' }</div>` : '';
	const bindFuel = () => {

		const f = this.stand.querySelector( '[data-fuel]' );
		if ( f ) f.onclick = () => this.game.refuel();
		const t = this.stand.querySelector( '[data-tow]' );
		if ( t ) t.onclick = () => {

			this.game.tow();
			this.renderShop();

		};
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();

	};
	// (Salt Life) gone home: the diesel is on the honesty box, the gear waits for her
	if ( v.open === false ) {

		this.drawStand( v, `
			<div class="gm-head"><h2>Marta's honesty box</h2>
			<p class="gm-sub">${ v.boarded ? 'Marta\'s boarded up for the hurricane' : v.weatherShut ? 'Marta\'s shut for the weather' : `Marta's back at ${ this.at( v.hours[ 0 ] ) }` }. The diesel's left out: pay into the box. You have $${ s.money.toLocaleString() }</p></div>
			<div class="gm-list">${ towRow }${ fuelRow }</div>
			<div class="gm-foot"><span class="gm-sub">Gear when she's back</span><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Leave', 'E', 'B' ) }</button></div>` );
		bindFuel();
		return;

	}

	// what she's after today, from your cooler
	const terms = g.saleTerms ? g.saleTerms( v ) : null;
	const bait = terms ? s.quote( null, terms ) : { prices: new Map() };
	const baitRows = s.inventory.filter( ( f ) => bait.prices.has( f.id ) ).map( ( f ) => fishItem( f, `<button class="gm-mini" data-sell="${ f.id }">Sell</button>`, bait.prices.get( f.id ), true ) ).join( '' );
	// (Salt Life) and from the bait bucket, alive
	const bq = terms ? s.quoteBait( terms ) : null;
	const bucketRow = bq && bq.n ? item( `${ FISH[ bq.species ].name }<small class="is-wanted">wanted</small>`, `${ bq.n } live from your bait bucket · $${ bq.each } each`, `<span class="gm-item-val">$${ bq.total }</span>`, `<button class="gm-mini" data-sellbait>Sell ${ bq.n }</button>` ) : '';
	const rows = Object.entries( UPGRADES ).map( ( [ key, track ] ) => {

		const cur = track.levels[ s.upgrades[ key ] | 0 ];
		const next = nextLevel( s.upgrades, key );
		const btn = next
			? `<button class="gm-btn" data-buy="${ key }" ${ next.cost > s.money ? 'disabled' : '' }>$${ next.cost }</button>`
			: '<span class="gm-have">Top of the line</span>';
		return `<div class="gm-shop-row"><span>${ track.name }: ${ next ? next.label : cur.label }<small>Now: ${ cur.label }</small></span>${ btn }</div>`;

	} ).join( '' );
	const greeting = this.closingSoon( v ) ? `I'm shutting at ${ this.at( v.hours[ 1 ] ) }` : v.greeting;
	// (her wanted list scrolls with the rest, as Joe's does)
	this.drawStand( v, `
		<div class="gm-head"><h2>${ v.name }</h2>
		<p class="gm-sub">${ greeting } · You have $${ s.money.toLocaleString() }</p></div>
		<div class="gm-list">${ this.wantedBlock( 'marta', 'Marta\'s after' ) }${ this.findsBlock( 'marta', 'From the beach: she\'ll buy' ) }${ bucketRow }${ baitRows }${ haulRow }${ towRow }${ repairRow }${ fuelRow }${ rows }</div>
		<div class="gm-foot"><span class="gm-sub">Upgrades take effect at once</span><button class="gm-btn is-ghost" data-close>${ this.keyed( 'Leave', 'E', 'B' ) }</button></div>` );
	bindFuel();
	const sb = this.stand.querySelector( '[data-sellbait]' );
	if ( sb ) sb.onclick = () => this.game.sellBait();
	const hl = this.stand.querySelector( '[data-haul]' );
	if ( hl ) hl.onclick = () => {

		this.game.haul();
		this.renderShop();

	};
	const rl = this.stand.querySelector( '[data-relaunch]' );
	if ( rl ) rl.onclick = () => {

		this.game.relaunch();
		this.renderShop();

	};
	const rp = this.stand.querySelector( '[data-repair]' );
	if ( rp ) rp.onclick = () => {

		this.game.repair();
		this.renderShop();

	};
	for ( const b of this.stand.querySelectorAll( '[data-buy]' ) ) b.onclick = () => this.game.buy( b.dataset.buy );
	for ( const b of this.stand.querySelectorAll( '[data-sell]' ) ) b.onclick = () => this.game.sell( [ Number( b.dataset.sell ) ] );
	this.bindFinds( 'marta' );

};

function releaseMouse() {

	try {

		if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

	} catch ( e ) { /* ignore */ }

}
