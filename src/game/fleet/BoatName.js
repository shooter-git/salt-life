import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from '../../engine/index.js';

// (M16) Her name, painted across her transom in gold leaf on a dark hull, or black on a pale one: a plate of its own on the
// boat you're in (made only once she's named). Vessel.transom says where: { y, z, w }, her centre and how wide
// it may be; or from her lines.
const W = 512, H = 96;
const FILL = 14;

export function namePlate( name, boat, paint ) {

	const c = document.createElement( 'canvas' );
	c.width = W;
	c.height = H;
	const g = c.getContext( '2d' );
	if ( ! g ) return null;
	let px = 76;
	g.font = `italic 700 ${ px }px Georgia, 'Times New Roman', serif`;
	const fit = g.measureText( name ).width;
	if ( fit > W - 24 ) {

		px = Math.floor( px * ( W - 24 ) / fit );
		g.font = `italic 700 ${ px }px Georgia, 'Times New Roman', serif`;

	}

	g.textAlign = 'center';
	g.textBaseline = 'middle';
	// (dark paint: gold; pale: black. By her paint's brightness)
	const r = ( ( paint ?? 0xf2efe6 ) >> 16 ) & 255, gr = ( ( paint ?? 0xf2efe6 ) >> 8 ) & 255, b = ( paint ?? 0xf2efe6 ) & 255;
	g.fillStyle = 0.3 * r + 0.59 * gr + 0.11 * b < 110 ? '#d9b65a' : '#16202a';
	g.fillText( name, W / 2, H / 2 + 2 );
	const map = new CanvasTexture( c );
	map.colorSpace = SRGBColorSpace;
	const L = boat.lines, T = boat.transom || {};
	const w = T.w ?? Math.min( 1.8, L.sheerX( 0 ) * 1.15 ), h = w * H / W;
	const mesh = new Mesh( new PlaneGeometry( w, h ), new MeshStandardMaterial( { map, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2 } ) );
	mesh.name = 'boat-name';
	// (a transom's nearly always out of the sun: lit as the moored boats are, or it can't be read)
	mesh.onBeforeRender = ( renderer, scene ) => {

		const m = mesh.material;
		if ( m.envMap !== scene.environment ) {

			if ( ! m.envMap !== ! scene.environment ) m.needsUpdate = true;
			m.envMap = scene.environment;

		}

		m.envMapIntensity = scene.environmentIntensity * FILL;

	};
	mesh.rotation.y = Math.PI;
	mesh.position.set( T.x ?? 0, T.y ?? ( L.deckY + L.sheerY( 0 ) ) / 2 + 0.1, T.z ?? L.zAft - 0.02 );
	return mesh;

}
