import { BufferAttribute, BufferGeometry, DynamicDrawUsage, MathUtils, Points, ShaderMaterial, Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { airOf, sizeOf } from './BoatCopies.js';

// (M16) The others' boats far off: past the fog, where a boat isn't drawn, she's a dash on the horizon as she really is.
// How far: over the earth's curve (standard refraction's 7/6 of its radius: a boat's masthead 4 m up shows from a deck
// to about 13 km, a tuna tower's to 18, a good deal further from up one), her hull going down first; through the air
// (Koschmieder's law: contrast falls by e^(-3.912 d / V), V the visual range, about 30 km on a clear day in the
// trades, 5 in rain); and only if what's left of her is big enough to make out (a dark speck on a bright horizon, down to
// about a third of an arcminute): the sea itself hides her lowest half metre. So the last of a lobster boat's masthead goes at about 11 km, a kayak by about 4. Dark looking up-sun, pale with the sun behind you. By
// night it's her light, by the range lights are made to be seen at.
// One draw for all of them, nothing until someone's out there.
//   seenHeight( d, eye, air ) -> m of her above your horizon (0: below it)
//   speckAlpha( { d, eye, air, range } ) -> 0..1
//   const s = new Specks( app );  s.update( [ { x, y, z, id, f, yaw, holder } ] )   (holder: anything of hers to keep a note on; f: her fit,
//   fitWire's: (M17) her height's as she's fitted, a sportfisher's with no tower her hardtop's: BoatCopies.airOf)

const REFRACTED = 6371000 * 7 / 6; // m
const CLEAR = 30000; // m: the visual range on a clear day (the weather's visibility of 1)
const LIGHT_RANGE = 11000; // m: as far as a boat's white light is picked out on a clear night (rated 2 to 3 nm, seen further)
const NEAREST = 11500; // m: drawn at most this far along its line of sight (the far plane's 12 km)
const MAX = 24;
const SEAWAY = 0.5; // m of her the waves between you hide
const SIGHT_S = 0.6; // s between looks at whether the island's in the way

const VS = /* glsl */`
attribute vec3 speckSize; // x, y: its width and height; z: the point it's drawn in, in pixels
attribute vec4 speckColor;
varying vec3 vSize;
varying vec4 vColor;
void main() {
	vSize = speckSize;
	vColor = speckColor;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	gl_PointSize = speckSize.z;
}
`;
const FS = /* glsl */`
varying vec3 vSize;
varying vec4 vColor;
void main() {
	// (how much of each pixel the dash covers)
	vec2 p = abs( gl_PointCoord - 0.5 ) * vSize.z, cover = clamp( vSize.xy * 0.5 - p + 0.5, 0.0, 1.0 );
	float a = vColor.a * cover.x * cover.y;
	if ( a < 0.004 ) discard;
	gl_FragColor = vec4( vColor.rgb, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

const dip = ( h ) => Math.sqrt( 2 * REFRACTED * Math.max( 0, h ) );

export function seenHeight( d, eye, air ) {

	const past = Math.max( 0, d - dip( eye ) );
	return Math.max( 0, air - past * past / ( 2 * REFRACTED ) );

}

// how much of her comes through to you: over the horizon, through the air, big enough to make out
export function speckAlpha( { d, eye, air, range } ) {

	const h = seenHeight( d, eye, air );
	if ( h <= 0 ) return 0;
	return Math.exp( - 3.912 * d / range ) * MathUtils.smoothstep( ( h - SEAWAY ) / d, 0.0001, 0.0002 );

}

// the visual range now, m (the weather's visibility; a hurricane's haze as far as it lets you)
export function visualRange( visibility, haze ) {

	return Math.min( CLEAR * Math.pow( Math.max( visibility, 0 ), 3 ), haze > 0 ? 3 / haze : Infinity );

}

const _v = new Vector3(), _c = new Vector3();

export class Specks {

	constructor( app ) {

		this.app = app;
		this.count = 0;
		const g = this.geometry = new BufferGeometry();
		const attr = ( name, n ) => g.setAttribute( name, new BufferAttribute( new Float32Array( MAX * n ), n ).setUsage( DynamicDrawUsage ) );
		attr( 'position', 3 );
		attr( 'speckSize', 3 );
		attr( 'speckColor', 4 );
		this.points = new Points( g, new ShaderMaterial( { vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false } ) );
		this.points.name = 'BoatSpecks';
		this.points.frustumCulled = false;
		this.points.renderOrder = 2;
		this.points.visible = false;
		app.scene.add( this.points );

	}

	// nothing in the way of your line to her top? (the island: looked at every so often, not each frame)
	_clear( b, eye, top, d ) {

		const h = b.holder, now = performance.now() / 1000, app = this.app;
		if ( h.speckAt !== undefined && now - h.speckAt < SIGHT_S ) return h.speckClear;
		h.speckAt = now;
		const c = app.camera.position, n = Math.min( 48, Math.ceil( d / 150 ) );
		h.speckClear = true;
		for ( let i = 1; i < n && h.speckClear; i ++ ) {

			const t = i / n, y = c.y + ( top - c.y ) * t;
			if ( app.terrainData.heightAt( c.x + ( b.x - c.x ) * t, c.z + ( b.z - c.z ) * t ) > y ) h.speckClear = false;

		}

		return h.speckClear;

	}

	update( boats ) {

		const app = this.app, cam = app.camera, c = cam.position, sky = app.sky, sea = G.seaLevel.value;
		const eye = Math.max( 0.5, c.y - sea ), under = c.y < sea;
		const buf = app.renderer.getDrawingBufferSize( _c ), pxPerRad = buf.y / ( 2 * Math.tan( MathUtils.degToRad( cam.fov ) / 2 ) ), least = Math.max( 1, buf.y / 720 );
		const range = visualRange( sky.visibility, sky.haze || 0 ), night = MathUtils.smoothstep( G.night.value, 0.1, 0.6 );
		const from = sky.fogNear + ( sky.fogFar - sky.fogNear ) * 0.55, sun = G.sunDir.value, hz = G.horizonColor.value;
		const A = this.geometry.attributes, P = A.position.array, S = A.speckSize.array, C = A.speckColor.array;
		let n = 0;
		if ( ! under ) for ( const b of boats ) {

			if ( n >= MAX ) break;
			const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot( dx, dz ), size = sizeOf( b.id ), air = airOf( b.id, b.f ); // ((M17) as she's fitted)
			// (the boat itself is drawn, fogged, till the fog has her whole)
			const fade = MathUtils.smoothstep( d, from, sky.fogFar );
			if ( fade <= 0 ) continue;
			const day = speckAlpha( { d, eye, air, range } ), h = seenHeight( d, eye, air );
			// (her light's over the horizon for as long as she is)
			const light = h > 0 ? Math.exp( - 3 * d / ( LIGHT_RANGE * MathUtils.clamp( range / CLEAR, 0.05, 1.3 ) ) ) : 0;
			const alpha = fade * ( day + ( light - day ) * night );
			if ( alpha < 0.02 || ! this._clear( b, eye, sea + air, d ) ) continue;
			// side on she's her length, end on her beam
			const rel = Math.sin( b.yaw - Math.atan2( dx, dz ) ), across = size.beam + ( size.length - size.beam ) * Math.abs( rel );
			const w = Math.max( least * ( 1.6 - 0.4 * night ), across / d * pxPerRad ), hPx = Math.max( least * ( 1.1 + 0.3 * night ), h / d * pxPerRad );
			const point = Math.ceil( Math.max( w, hPx ) ) + 2;
			// along its line of sight, no further than the far plane, sitting on the horizon (not half under the far water)
			const k = Math.min( 1, NEAREST / d ) * 0.98;
			_v.set( dx * k, ( b.y - c.y ) * k + hPx / 2 * ( d * k / pxPerRad ), dz * k );
			P[ n * 3 ] = _v.x; P[ n * 3 + 1 ] = _v.y; P[ n * 3 + 2 ] = _v.z;
			S[ n * 3 ] = w; S[ n * 3 + 1 ] = hPx; S[ n * 3 + 2 ] = point;
			// dark looking up-sun, a white boat pale with the sun behind you; by night, her white light
			const lit = MathUtils.smoothstep( - ( dx * sun.x + dz * sun.z ) / d, - 0.3, 0.6 ), f = 0.3 + 0.95 * lit;
			C[ n * 4 ] = hz.r * f + ( 2 - hz.r * f ) * night;
			C[ n * 4 + 1 ] = hz.g * f + ( 1.9 - hz.g * f ) * night;
			C[ n * 4 + 2 ] = hz.b * f + ( 1.75 - hz.b * f ) * night;
			C[ n * 4 + 3 ] = alpha;
			n ++;

		}

		this.count = n;
		this.points.visible = n > 0;
		if ( ! n ) return;
		this.points.position.copy( c );
		this.geometry.setDrawRange( 0, n );
		A.position.needsUpdate = A.speckSize.needsUpdate = A.speckColor.needsUpdate = true;

	}

	dispose() {

		this.app.scene.remove( this.points );
		this.geometry.dispose();
		this.points.material.dispose();

	}

}
