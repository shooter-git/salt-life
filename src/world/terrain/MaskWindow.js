// (M15) A square window of one of the island's masks (TerrainData's sand, seagrass...), `half` m about c ( { x, z } ):
// { i0, j0, w, h, data } in its texels, kept once the whole mask has gone (App.releaseMasks). (M19) Moved here from
// App.js, so the crabs' beach (wildlife/Crabs.js) is tested with what the game cuts it with.
export function maskWindow( T, mask, c, half ) {

	const i0 = Math.max( 0, Math.floor( ( c.x - half - T.origin ) / T.texel ) ), j0 = Math.max( 0, Math.floor( ( c.z - half - T.origin ) / T.texel ) );
	const w = Math.min( T.res - i0, Math.ceil( 2 * half / T.texel ) ), h = Math.min( T.res - j0, Math.ceil( 2 * half / T.texel ) ), data = new Uint8Array( w * h );
	for ( let j = 0; j < h; j ++ ) data.set( mask.subarray( ( j0 + j ) * T.res + i0, ( j0 + j ) * T.res + i0 + w ), j * w );
	return { i0, j0, w, h, data };

}
