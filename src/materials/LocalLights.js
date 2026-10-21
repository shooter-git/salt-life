import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// Local lights (lanterns, lamp posts, path lights, lit windows, the boat's cabin and navigation
// lights, its deck floodlights, the handheld flashlight) without a light object per lamp: unrolling
// every light into every material would multiply shader size and compile time. Instead the CPU picks
// the lights nearest the camera each frame and packs them into one uniform block; every lit material
// evaluates them in ONE loop (three's direct-light BRDF), inverse-square falloff with a smooth range
// window, optional spot cone, no shadows. Skipped entirely (loop bound) when no light is active
// (daytime without the flashlight).
//
// Salt Life (WebGL 2): Tidewater's WGSL lighting hook becomes a patch of three's lights chunks
// (lights_pars_begin: the uniform block; lights_fragment_end: the loop), compiled only into
// materials that ask for it (useLocalLights: the LOCAL_LIGHTS or LOCAL_LIGHTS_CHEAP define, Lambert
// only, for ground, rocks and plants). The block is one three.js UniformsGroup shared by every such
// material: positions and directions in view space (the main camera's), packed in update().
const MAX = 8;
// (an array in a three.js uniforms group is an array of uniforms)
const v4 = () => Array.from( { length: MAX }, () => new THREE.Uniform( new THREE.Vector4() ) );
const block = new THREE.UniformsGroup();
block.setName( 'LocalLights' );
const U = {
	pos: v4(), // view-space xyz, range^2
	col: v4(), // rgb x intensity, cos(inner cone)
	dir: v4(), // view-space spot axis, cos(outer cone) (-2: point light)
	aux: v4(), // x: the light's world height (for the water it shines through)
	info: new THREE.Uniform( new THREE.Vector4() ), // x: count, y: sea level
	worldY: new THREE.Uniform( new THREE.Vector4() ), // world height of a view-space point: dot( xyz, p ) + w
	absorb: new THREE.Uniform( new THREE.Vector4() ), // water absorption + scattering (per metre)
};
block.add( U.pos ).add( U.col ).add( U.dir ).add( U.aux ).add( U.info ).add( U.worldY ).add( U.absorb );

THREE.ShaderChunk.lights_pars_begin = /* glsl */`
#if defined( LOCAL_LIGHTS ) || defined( LOCAL_LIGHTS_CHEAP )
layout( std140 ) uniform LocalLights {
	vec4 llPos[ ${ MAX } ];
	vec4 llCol[ ${ MAX } ];
	vec4 llDir[ ${ MAX } ];
	vec4 llAux[ ${ MAX } ];
	vec4 llInfo;
	vec4 llWorldY;
	vec4 llAbsorb;
};
#endif
` + THREE.ShaderChunk.lights_pars_begin;

THREE.ShaderChunk.lights_fragment_end = /* glsl */`
#if defined( LOCAL_LIGHTS ) || defined( LOCAL_LIGHTS_CHEAP )
	{
		float llPY = dot( llWorldY.xyz, geometryPosition ) + llWorldY.w;
		for ( int i = 0; i < ${ MAX }; i ++ ) {

			if ( float( i ) >= llInfo.x ) break;
			vec4 p = llPos[ i ];
			vec3 d = p.xyz - geometryPosition;
			float d2 = dot( d, d );
			if ( d2 >= p.w ) continue;
			vec4 c = llCol[ i ];
			vec4 sd = llDir[ i ];
			vec3 L = d * inversesqrt( max( d2, 1e-6 ) );
			// smooth range window ( 1 - ( d / r )^4 )^2 on the inverse-square law
			float x = d2 / p.w;
			float win = clamp( 1.0 - x * x, 0.0, 1.0 );
			// spot: hot centre, soft edge at the outer cone, faint wide spill (points: cones of -1.5 / -2)
			float cd = dot( - L, sd.xyz );
			float m = smoothstep( sd.w, c.w, cd );
			float spot = max( m * m, smoothstep( sd.w - 0.55, sd.w, cd ) * 0.05 );
			// Beer-Lambert over the part of the path under water (straight, mean sea level)
			float ly = llAux[ i ].x;
			float under = clamp( ( llInfo.y - min( llPY, ly ) ) / max( abs( ly - llPY ), 1e-3 ), 0.0, 1.0 );
			vec3 Tw = exp( - llAbsorb.rgb * ( sqrt( d2 ) * under ) );
			// (the + 0.15 m^2 softens the near field of a lamp's finite size)
			vec3 lc = c.rgb * Tw * ( win * win * spot / ( d2 + 0.15 ) );
#ifdef LOCAL_LIGHTS_CHEAP
			reflectedLight.directDiffuse += clamp( dot( geometryNormal, L ), 0.0, 1.0 ) * lc * BRDF_Lambert( material.diffuseColor );
#else
			IncidentLight llLight;
			llLight.color = lc;
			llLight.direction = L;
			llLight.visible = true;
			RE_Direct( llLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif

		}
	}
#endif
` + THREE.ShaderChunk.lights_fragment_end;

// a lit material (standard, physical, Lambert, Phong) takes the local lights: cheap = Lambert only
// (large or heavily overdrawn surfaces). Before its first compile.
export function useLocalLights( material, { cheap = false } = {} ) {

	material.defines = { ...( material.defines || {} ), [ cheap ? 'LOCAL_LIGHTS_CHEAP' : 'LOCAL_LIGHTS' ]: '' };
	material.uniformsGroups = [ ...( material.uniformsGroups || [] ).filter( ( g ) => g !== block ), block ];
	material.needsUpdate = true; // (in case it was drawn already)
	return material;

}

// no local lights for a moment (a render with another camera: the catch card's portrait)
export function holdLocalLights( fn ) {

	const n = U.info.value.x;
	U.info.value.x = 0;
	try {

		return fn();

	} finally {

		U.info.value.x = n;

	}

}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const smooth = ( x, a, b ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// CPU side: sources and the flashlight, packed every frame.
//   add( { position (live Vector3), color, intensity, range, dir?, cosInner?, cosOuter?, kind, flicker? } )
//   intensity: luminous intensity in scene units (illuminance at 1 m); range: cut-off distance (m)
export class LocalLights {

	// max: lights at once (low-powered devices: fewer)
	constructor( { max = MAX } = {} ) {

		this.max = Math.min( MAX, max );
		this.sources = [];
		this.enabled = true;
		this.strength = 1; // UI multiplier for the lamps (not the flashlight)
		this.flashlight = {
			on: false, intensity: 55, range: 30,
			color: new THREE.Color( 1.0, 0.71, 0.49 ), // ~4500 K
			cosInner: Math.cos( THREE.MathUtils.degToRad( 9 ) ), cosOuter: Math.cos( THREE.MathUtils.degToRad( 35 ) ),
			position: new THREE.Vector3(), dir: new THREE.Vector3( 0, 0, - 1 ), primed: false,
		};
		this._list = [];
		this.time = 0;
		this.active = 0;

	}

	add( src ) {

		src.phase = src.phase ?? Math.random() * 100;
		this.sources.push( src );
		return src;

	}

	toggleFlashlight( on = ! this.flashlight.on ) {

		this.flashlight.on = on;
		this.flashlight.primed = false;
		return on;

	}

	update( camera, dt ) {

		this.time += dt;
		let n = 0;
		const pos = this._pos || ( this._pos = U.pos.map( ( u ) => u.value ) );
		const col = this._col || ( this._col = U.col.map( ( u ) => u.value ) );
		const dir = this._dir || ( this._dir = U.dir.map( ( u ) => u.value ) );
		const aux = this._aux || ( this._aux = U.aux.map( ( u ) => u.value ) );
		const fl = this.flashlight;
		if ( fl.on && this.enabled ) {

			// held a little right of and below the eye, lagging the view slightly
			camera.updateMatrixWorld();
			const e = camera.matrixWorld.elements;
			_r.set( e[ 0 ], e[ 1 ], e[ 2 ] ).normalize();
			_u.set( e[ 4 ], e[ 5 ], e[ 6 ] ).normalize();
			_f.set( - e[ 8 ], - e[ 9 ], - e[ 10 ] ).normalize();
			if ( ! fl.primed ) {

				fl.dir.copy( _f );
				fl.primed = true;

			}

			fl.dir.lerp( _f, 1 - Math.exp( - dt / 0.06 ) ).normalize();
			fl.position.setFromMatrixPosition( camera.matrixWorld ).addScaledVector( _r, 0.2 ).addScaledVector( _u, - 0.22 ).addScaledVector( _f, 0.15 );
			// faint against daylight (the scene's night is exposed far brighter than physical)
			const k = fl.intensity * ( 0.08 + 0.92 * smooth( G.night.value, 0.0, 0.6 ) );
			pos[ 0 ].set( fl.position.x, fl.position.y, fl.position.z, fl.range * fl.range );
			col[ 0 ].set( fl.color.r * k, fl.color.g * k, fl.color.b * k, fl.cosInner );
			dir[ 0 ].set( fl.dir.x, fl.dir.y, fl.dir.z, fl.cosOuter );
			n = 1;

		}

		// lamps: on from dusk (same ramp as the lantern glass). (Salt Life) The ones that light the
		// most around the camera first (brightness x reach^2 / distance^2), not simply the nearest: with
		// four slots on low-powered devices the boat's six small lights would crowd out its floodlights
		const on = smooth( G.night.value, 0.15, 0.75 ) * this.strength;
		if ( on > 0.002 && this.enabled ) {

			const cp = camera.position;
			const list = this._list;
			list.length = 0;
			for ( const s of this.sources ) {

				if ( s.enabled === false || ( s.scale ?? 1 ) <= 0 ) continue;
				if ( s.update ) s.update();
				s.d2 = s.position.distanceToSquared( cp );
				s.score = s.intensity * s.range * s.range / Math.max( s.d2, 1 );
				list.push( s );

			}

			list.sort( ( a, b ) => b.score - a.score );
			const slots = this.max - n;
			// fade out the last selected lights as the next one's score comes close (no popping)
			const cut = list.length > slots ? list[ slots ].score : 0;
			for ( let i = 0; i < Math.min( slots, list.length ); i ++ ) {

				const s = list[ i ];
				const fade = cut > 0 ? smooth( s.score, cut, cut * 1.5 ) : 1;
				const fl2 = s.flicker ? 1 + s.flicker * Math.sin( this.time * 9 + s.phase ) * Math.sin( this.time * 5.3 + s.phase * 0.37 ) : 1;
				const k = s.intensity * on * fade * fl2 * ( s.scale ?? 1 );
				if ( k <= 1e-4 ) continue;
				const r = s.range;
				pos[ n ].set( s.position.x, s.position.y, s.position.z, r * r );
				col[ n ].set( s.color.r * k, s.color.g * k, s.color.b * k, s.cosInner ?? - 1.5 );
				if ( s.dir ) dir[ n ].set( s.dir.x, s.dir.y, s.dir.z, s.cosOuter ?? - 2 );
				else dir[ n ].set( 0, - 1, 0, - 2 );
				n ++;

			}

		}

		// to view space (the lighting runs there), with each light's world height for the water
		camera.updateMatrixWorld();
		const V = camera.matrixWorldInverse, e = camera.matrixWorld.elements;
		for ( let i = 0; i < n; i ++ ) {

			aux[ i ].x = pos[ i ].y;
			const r2 = pos[ i ].w;
			_v.set( pos[ i ].x, pos[ i ].y, pos[ i ].z ).applyMatrix4( V );
			pos[ i ].set( _v.x, _v.y, _v.z, r2 );
			const c = dir[ i ].w;
			_v.set( dir[ i ].x, dir[ i ].y, dir[ i ].z ).transformDirection( V );
			dir[ i ].set( _v.x, _v.y, _v.z, c );

		}

		U.info.value.set( n, G.seaLevel.value, 0, 0 );
		U.worldY.value.set( e[ 1 ], e[ 5 ], e[ 9 ], e[ 13 ] );
		const a = G.waterAbsorption.value, sc = G.waterScattering.value;
		U.absorb.value.set( a.x + sc.x, a.y + sc.y, a.z + sc.z, 0 );
		this.active = n;

	}

}

// Boat lights in the hull frame: warm cabin dome, instrument glow, navigation lights (red port,
// green starboard, white masthead and stern). Positions follow the boat's world matrix.
export function addBoatLights( lights, boat ) {

	const L = boat.lines;
	const obj = boat.group;
	const sternY = L.sheerY( 0 ) + 0.1;
	const defs = [
		{ p: [ 0, 2.24, 0.42 ], color: [ 1.0, 0.84, 0.62 ], intensity: 0.9, range: 5.5, kind: 'boatDome' },
		{ p: [ - 0.45, 1.5, 1.12 ], color: [ 0.45, 0.75, 1.0 ], intensity: 0.12, range: 2.2, kind: 'boatInstruments' },
		{ p: [ 0.47, 3.45, - 0.47 ], color: [ 1.0, 0.06, 0.03 ], intensity: 1.4, range: 8, kind: 'boatNav', side: [ 1, 0, 0 ] },
		{ p: [ - 0.47, 3.45, - 0.47 ], color: [ 0.05, 1.0, 0.3 ], intensity: 1.4, range: 8, kind: 'boatNav', side: [ - 1, 0, 0 ] },
		{ p: [ 0, 3.97, - 0.5 ], color: [ 1.0, 0.95, 0.85 ], intensity: 1.2, range: 8, kind: 'boatNav' },
		{ p: [ 0, sternY, L.zAft - 0.05 ], color: [ 1.0, 0.95, 0.85 ], intensity: 0.8, range: 7, kind: 'boatNav' },
	];
	const out = [];
	for ( const d of defs ) {

		const local = new THREE.Vector3( ...d.p );
		const localDir = d.side ? new THREE.Vector3( ...d.side ) : null;
		const src = {
			position: new THREE.Vector3(), color: new THREE.Color( ...d.color ), intensity: d.intensity, range: d.range, kind: d.kind,
			dir: localDir ? new THREE.Vector3() : null, cosInner: localDir ? 0.25 : undefined, cosOuter: localDir ? - 0.2 : undefined,
			update() {

				obj.updateWorldMatrix( true, false );
				this.position.copy( local ).applyMatrix4( obj.matrixWorld );
				if ( localDir ) this.dir.copy( localDir ).transformDirection( obj.matrixWorld );

			},
		};
		src.update();
		out.push( lights.add( src ) );

	}

	return out;

}

// Village lights (Village.getLightSources()): lanterns, lamp posts, path lights, lit windows. Window
// lights sit just outside the pane and only light outward (porches); lanterns flicker a little.
export function addVillageLights( lights, village ) {

	const K = { lantern: 1.5, pathLight: 1.0, window: 0.8 };
	const R = { lantern: 11, pathLight: 7, window: 6 };
	for ( const l of village.getLightSources() ) {

		const kind = l.kind || 'lantern';
		const src = { position: l.position, color: l.color, intensity: l.intensity * ( K[ kind ] ?? 1.2 ), range: R[ kind ] ?? 12, kind };
		if ( kind === 'window' ) {

			// outward normal: away from the nearest building centre
			let best = null, bd = Infinity;
			for ( const b of village.buildings || [] ) {

				const dd = ( b.x - l.position.x ) ** 2 + ( b.z - l.position.z ) ** 2;
				if ( dd < bd ) {

					bd = dd;
					best = b;

				}

			}

			const n = best ? _v.set( l.position.x - best.x, 0, l.position.z - best.z ) : _v.set( 0, 0, 1 );
			if ( n.lengthSq() < 1e-6 ) n.set( 0, 0, 1 );
			n.normalize();
			src.position = l.position.clone().addScaledVector( n, 0.35 );
			src.dir = n.clone();
			src.cosInner = 0.35;
			src.cosOuter = - 0.15;

		} else {

			src.flicker = 0.08;

		}

		lights.add( src );

	}

}
