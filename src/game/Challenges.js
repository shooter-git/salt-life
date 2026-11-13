// (M19) Pearl's day's challenges at her fish camp: one for the rod, one for the speargun and one for the cast net, the same
// for everyone on the island's clock (seeded by the trading day, as Orders.js' orders are), done by the catch (the save's
// onCatch: GameState) and paid in cash at her camp. Stream STALLS' (docs/M19.md); the foundation's shell until then: the
// game makes one and updates it each frame, and it does nothing.
//   const c = new Challenges( game )   c.update( dt )
export class Challenges {

	constructor( game ) {

		this.game = game;

	}

	update() {}

}
