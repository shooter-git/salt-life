// The reef's shading models (ReefMaterials) and its colour packing, on their own for the layout
// (ReefLayout), which also runs in a worker.

export const SURFACE = {
	rock: 0, star: 1, brain: 2, brainWide: 3, porites: 4, acropora: 5, finger: 6, fire: 7, plate: 8, pillar: 9,
	gorgonian: 10, sponge: 11, urchin: 12, anemone: 13, rubble: 14, grass: 15, fan: 16, plume: 17,
	lettuce: 18, algae: 19, sargassum: 20,
};

// packs a colour as 8 bit sRGB into a float (exact: 24 bits)
export const packColor = ( c ) => c.getHex();
