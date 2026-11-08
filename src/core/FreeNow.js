// (M16) Typed arrays nothing will read again, their memory given back now: a buffer dropped is held until the
// collector next comes round, and while the island's made it doesn't for seconds, tens of MB of them piling up
// on what's in use (which is what All the Spaces' checks read, and what a phone has to find room for). A buffer
// detached is gone at once. Only for an array that has its buffer to itself, as anything else viewing it would
// go too; where the browser can't (before Safari 17.4), they wait for the collector as they did.

export function freeNow( ...arrays ) {

	// ((M17) one detached already, as an array two parts shared would be, left be: transfer throws on it)
	for ( const a of arrays ) if ( a && a.buffer.transfer && a.buffer.byteLength > 0 && a.byteLength === a.buffer.byteLength ) a.buffer.transfer( 0 );

}
