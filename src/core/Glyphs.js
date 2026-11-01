// (M16) The characters past Latin-1 the game shows, made as it runs and kept out of the script's text. One of
// them in the text, in a toast or a key's hint, and the browser holds the whole script in two bytes a character:
// 65 of them cost 3.4 MB of script memory (a phone's too). So UI text says `${ ELLIPSIS }` for them, CSS its
// own escapes (content: '\\2713'), and test/phones.mjs looks for any others. (Written as code points so that the
// build's minifier can't work them out and put them back. The loading veil's and the readout's text are
// scripts of their own, too small to matter.)

const c = ( hex ) => String.fromCodePoint( parseInt( hex, 16 ) );

export const ELLIPSIS = c( '2026' ), LEFT = c( '2190' ), UP = c( '2191' ), RIGHT = c( '2192' ), DOWN = c( '2193' );
export const CHECK = c( '2713' ), STAR = c( '2605' ), DOT = c( '25CF' ), RING = c( '25CB' ), PEAK = c( '25B2' ), PRIME = c( '2032' ), CROSS = c( '2715' ), MINUS = c( '2212' );
export const EM_DASH = c( '2014' ), EN_DASH = c( '2013' ), OPEN_QUOTE = c( '201C' ), CLOSE_QUOTE = c( '201D' );
