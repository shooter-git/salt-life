import { SHELLS, SHELL_KINDS, WALL_PAY, shellsHave, setComplete } from './Shells.js';
import { shellPicture, pictureSize } from '../world/ShellShapes.js';

// (M16) The shell collection's page in the Fish Hold (a tab of its own): the set as a drawer of shells, all drawn to one
// scale, as they are: a queen conch eleven times a yellow cowrie. An empty place for each you haven't found, its outline at
// its size, its name and where it's found. Tap a shell for a close look. Each picture is drawn from the shell's own numbers
// (world/ShellShapes), one a frame the first time the page opens (they're kept: a few kB each), so nothing's drawn before
// you look. Its body and hint for GameHUD.renderInventory:
//   shellTab( state ) -> { body, hint }   bindShellTab( root, state, redraw )   SHELL_CSS (the panel's, added once)

const CM = 5; // px a cm
const BIG = 200; // px: the close look's long side
const pics = new Map(); // `${ kind }:${ scale }:${ silhouette }` -> a data URL
const queue = [];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // (until it's drawn)
let timer = null, open = null;

const upper = ( t ) => t[ 0 ].toUpperCase() + t.slice( 1 );

function dataURL( kind, W, H, silhouette, detail ) {

	const c = document.createElement( 'canvas' );
	c.width = W;
	c.height = H;
	const ctx = c.getContext( '2d' ), bytes = shellPicture( kind, W, H, { silhouette, detail } );
	ctx.putImageData( new ImageData( bytes, W, H ), 0, 0 );
	return c.toDataURL( 'image/png' );

}

// the size to show it at, in px: true to scale; an image of it, its key
function cell( kind, scale, silhouette ) {

	const [ w, h ] = pictureSize( kind, scale );
	return { w, h, key: `${ kind }:${ scale }:${ silhouette ? 1 : 0 }` };

}

function imgTag( kind, scale, silhouette, label ) {

	const { w, h, key } = cell( kind, scale, silhouette ), src = pics.get( key );
	return `<img class="gm-shellpic${ silhouette ? ' is-empty' : '' }" data-pic="${ key }" width="${ w }" height="${ h }" style="width:${ w }px;height:${ h }px" alt="${ label }" src="${ src || BLANK }">`;

}

function drawNext( root ) {

	timer = null;
	const job = queue.shift();
	if ( ! job ) return;
	const [ kind, scale, sil ] = job, { w, h, key } = cell( kind, scale, sil );
	if ( ! pics.has( key ) ) {

		const dpr = Math.min( 2, ( typeof devicePixelRatio === 'number' && devicePixelRatio ) || 1 );
		pics.set( key, dataURL( kind, Math.ceil( w * dpr ), Math.ceil( h * dpr ), sil, sil ? 3 : scale > 40 ? 8 : 4 ) );

	}

	for ( const im of root.querySelectorAll( `img[data-pic="${ key }"]` ) ) im.src = pics.get( key );
	if ( queue.length ) timer = setTimeout( () => drawNext( root ), 0 );

}

export function shellTab( s ) {

	const S = s.shells, n = shellsHave( S ), total = SHELL_KINDS.length;
	const cells = SHELL_KINDS.map( ( k ) => {

		const F = SHELLS[ k ], have = !! S.have[ k ], scale = F.cm * CM;
		return `<button class="gm-shell${ have ? ' is-found' : '' }${ open === k ? ' is-open' : '' }" data-shell="${ k }" aria-pressed="${ open === k }"><span class="gm-shellimg">${ imgTag( k, scale, ! have, F.name ) }</span><b>${ F.name }</b><small>${ have ? `${ F.cm } cm · day ${ S.have[ k ].day + 1 }` : F.at }</small></button>`;

	} ).join( '' );
	let look = '';
	if ( open ) {

		const F = SHELLS[ open ], have = !! S.have[ open ];
		look = `<div class="gm-shelllook"><span class="gm-shellimg">${ imgTag( open, BIG, ! have, F.name ) }</span><span class="gm-shelltext"><b>${ F.name }</b><i>${ F.sci }</i><small>${ F.cm } cm${ have ? '' : ' · not found yet' }. ${ upper( F.what ) }. ${ F.note || '' } ${ F.where }.</small></span></div>`;

	}

	const wall = S.wall !== null ? `The set's in Marta's tray by her table since day ${ S.wall + 1 }, for all to see.` : setComplete( S ) ? `The set's whole. Marta wants it for a tray by her table: $${ WALL_PAY }.` : 'Marta wants a whole set for a tray by her table, and will pay for it.';
	const body = `<div class="gm-shellhead"><span>${ n } of ${ total } found</span><span class="gm-shellscale" style="width:${ 5 * CM }px">5 cm</span></div>${ look }<div class="gm-shells">${ cells }</div><p class="gm-sub gm-shellwall">${ wall }</p>`;
	return { body, hint: 'The first of each is kept for the set; a spare goes with your finds' };

}

export function bindShellTab( root, s, redraw ) {

	for ( const b of root.querySelectorAll( '[data-shell]' ) ) b.onclick = () => {

		open = open === b.dataset.shell ? null : b.dataset.shell;
		redraw();

	};
	// (what isn't drawn yet, one a frame: the close look first)
	queue.length = 0;
	for ( const im of root.querySelectorAll( 'img[data-pic]' ) ) if ( im.getAttribute( 'src' ) === BLANK ) {

		const [ kind, scale, sil ] = im.dataset.pic.split( ':' );
		queue.push( [ kind, Number( scale ), sil === '1' ] );

	}

	if ( timer ) clearTimeout( timer );
	timer = queue.length ? setTimeout( () => drawNext( root ), 0 ) : null;

}

// (M16) Marta's row for it in her shop
export function shellShopRow( s ) {

	const S = s.shells;
	if ( S.wall !== null || ! setComplete( S ) ) return '';
	return `<div class="gm-shop-row"><span>Your shells, the whole set<small>She'll lay them out in a tray by her table, your name on it</small></span><button class="gm-btn" data-shellwall>$${ WALL_PAY }</button></div>`;

}

export const SHELL_CSS = `
.gm-shells { display: flex; flex-wrap: wrap; gap: var(--tw-2); align-items: stretch; }
.gm-shell { flex: 1 1 calc(33% - var(--tw-2)); min-width: 88px; max-width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--tw-2) var(--tw-1); border-radius: calc(10 * var(--tw-u)); background: var(--tw-fill); border: 1px solid var(--tw-line); color: var(--tw-ink-2); font: inherit; text-align: center; cursor: pointer; }
.gm-shell.is-found { color: var(--tw-ink); }
.gm-shell.is-open { border-color: var(--tw-aqua); }
.gm-shell b { font-size: var(--tw-fs-sm); font-weight: 600; line-height: 1.15; }
.gm-shell small { font-size: var(--tw-fs-xs); line-height: 1.2; color: var(--tw-ink-3); }
.gm-shellimg { display: flex; align-items: center; justify-content: center; flex: 1 1 auto; min-height: 30px; padding-bottom: 2px; }
.gm-shellpic { display: block; object-fit: contain; }
.gm-shellpic.is-empty { opacity: 0.2; }
.gm-shellhead { display: flex; align-items: center; justify-content: space-between; margin: 0 0 var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-sm); }
.gm-shellscale { display: inline-block; border-top: 2px solid var(--tw-ink-3); font-size: var(--tw-fs-xs); color: var(--tw-ink-3); text-align: center; white-space: nowrap; }
.gm-shelllook { display: flex; flex-wrap: wrap; gap: var(--tw-3); align-items: center; padding: var(--tw-2); margin: 0 0 var(--tw-2); border-radius: calc(10 * var(--tw-u)); background: var(--tw-fill); border: 1px solid var(--tw-aqua); }
.gm-shelltext { flex: 1 1 150px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gm-shelltext i { color: var(--tw-ink-2); font-size: var(--tw-fs-sm); }
.gm-shelltext small { color: var(--tw-ink-2); font-size: var(--tw-fs-xs); line-height: 1.3; }
.gm-shellwall { margin: var(--tw-2) 0 0; }
`;
