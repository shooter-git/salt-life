// (M19) Fly casting: false casts that carry more line each good stroke and can spook a fish on the flats, the line shot on
// the forward stroke, the fly stripped back and a fish strip-set (Gear.js' flyRod and FLY_RODS, Bait.js' flies,
// Presentation's fly rig). Stream FLY's (docs/M19.md); the foundation's shell until then: the game makes one and updates
// it each frame, and it does nothing.
//   const f = new FlyCast( game )   f.update( dt )
export class FlyCast {

	constructor( game ) {

		this.game = game;

	}

	update() {}

}
