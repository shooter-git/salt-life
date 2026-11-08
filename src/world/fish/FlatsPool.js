// (M17) The flats' fish drawn (world/Fish.js' sight groups): a pool of groups for each kind, parked until a school of
// game/Flats.js' comes within reach (FlatsFishing.js gives them out, nearest first), and how far and how finely they're
// drawn on each tier. Low's triangles are held to a budget a frame (FlatsBudget), nearest first: within the room the
// checks' camera leaves on low (about 13k: docs/M17.md, Room on low), whatever's on the flat about you.
//   FLATS_POOL[ tier ]   { range: m drawn, budget: triangles a frame, minLod: the finest level of detail, kinds: { BEHAVIOUR
//                        name: { groups, count } } }
//   KIND_OF( school )    the pool's kind for one of game/Flats.js' schools
//   new FlatsBudget( tris )   .begin( tier ), .take( model, lod ) -> the level it's drawn at, or -1: none left
//   flatsTriangles( tier, tris )   the most triangles a frame its fish can draw (every pooled fish as near as can be)

const KINDS = ( bone, spawn ) => ( {
	flatsBone: { groups: bone[ 0 ], count: bone[ 1 ] },
	flatsSpawn: { groups: 1, count: spawn },
	flatsPermit: { groups: 2, count: 2 },
	flatsTarpon: { groups: 3, count: 1 },
	flatsSnook: { groups: 3, count: 1 },
	flatsCuda: { groups: 2, count: 1 },
	flatsBlacktip: { groups: 1, count: 4 },
	flatsLemon: { groups: 1, count: 1 },
} );

export const FLATS_POOL = {
	low: { range: 32, budget: 9500, minLod: 1, kinds: KINDS( [ 3, 12 ], 16 ) },
	mid: { range: 40, budget: 26000, minLod: 0, kinds: KINDS( [ 4, 16 ], 28 ) },
	high: { range: 50, budget: 60000, minLod: 0, kinds: KINDS( [ 5, 19 ], 48 ) },
};

const BY_KIND = { permit: 'flatsPermit', tarpon: 'flatsTarpon', snook: 'flatsSnook', barracuda: 'flatsCuda', blacktipShark: 'flatsBlacktip', lemonShark: 'flatsLemon' };
export const KIND_OF = ( s ) => ( s.kind === 'bonefish' ? ( s.id.startsWith( 'spawn:' ) ? 'flatsSpawn' : 'flatsBone' ) : BY_KIND[ s.kind ] || null );

// triangles by model and level of detail ( { model: [ lod0, lod1, lod2, lod3 ] } ), spent nearest first
export class FlatsBudget {

	constructor( tris ) {

		this.tris = tris;
		this.left = 0;
		this.minLod = 0;
		this.spent = 0;

	}

	begin( tier ) {

		const P = FLATS_POOL[ tier ] || FLATS_POOL.high;
		this.left = P.budget;
		this.minLod = P.minLod;
		this.spent = 0;
		return this;

	}

	// the level of detail a fish of `model` that would be drawn at `lod` is drawn at: coarser if what's left wants it,
	// -1 if not even the coarsest fits
	take( model, lod ) {

		const t = this.tris[ model ];
		if ( ! t ) return - 1;
		for ( let l = Math.max( lod, this.minLod ); l < 4; l ++ ) if ( t[ l ] <= this.left ) {

			this.left -= t[ l ];
			this.spent += t[ l ];
			return l;

		}

		return - 1;

	}

}

const MODEL = { flatsBone: 'bonefish', flatsSpawn: 'bonefish', flatsPermit: 'permit', flatsTarpon: 'tarpon', flatsSnook: 'snook', flatsCuda: 'barracuda', flatsBlacktip: 'blacktipShark', flatsLemon: 'lemonShark' };
export const MODEL_OF = MODEL;

// the most a frame can draw: every pooled fish at its finest, spent through the budget
export function flatsTriangles( tier, tris ) {

	const P = FLATS_POOL[ tier ], b = new FlatsBudget( tris ).begin( tier );
	// (the biggest models first: the worst case for what's left)
	const all = [];
	for ( const [ name, k ] of Object.entries( P.kinds ) ) for ( let i = 0; i < k.groups * k.count; i ++ ) all.push( MODEL[ name ] );
	all.sort( ( a, c ) => tris[ c ][ 0 ] - tris[ a ][ 0 ] );
	for ( const m of all ) b.take( m, 0 );
	return b.spent;

}
