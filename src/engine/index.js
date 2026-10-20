// Math, scene graph and geometry: three.js itself now. Tidewater's own WebGPU engine mirrored
// three's API so its CPU-side code (game logic, physics, procedural geometry) could be written
// once; Salt Life draws with three.js and WebGL 2, so `import * as THREE from '../engine/index.js'`
// simply hands over three and the two addons the engine used to bundle.

export * from 'three';
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export { mergeGeometries, mergeVertices, mergeAttributes } from 'three/addons/utils/BufferGeometryUtils.js';
export * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
