// The catch card's studio portrait of the fish. Tidewater drew it with its WebGPU engine into the
// card's own canvas; not ported yet: attach() says no, and the landed fish hangs on the line while
// the card is up instead (Game).
export class FishPortrait {

	constructor() {

		this.live = false; // drawing into a card's canvas

	}

	attach() {

		return false;

	}

	show() {}

	detach() {}

	update() {}

	thumbnail() {

		return null;

	}

	thumbUrl() {

		return null;

	}

}
