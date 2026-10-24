import { Color, Vector2, Vector3 } from 'three';

// Shared simulation state. Each handle is a three.js uniform (`{ value }`), so the CPU code keeps its
// `G.time.value` accessors and a shader can take the same object into its `uniforms`.
export const G = {
	time: { value: 0 }, // simulation time (s)
	dt: { value: 1 / 60 },
	seaLevel: { value: 0 },
	// sun (or moon at night) direction, pointing toward the light
	sunDir: { value: new Vector3( 0.3, 0.6, - 0.7 ).normalize() },
	sunColor: { value: new Color( 1, 1, 1 ) },
	skyIrradiance: { value: new Color( 0.3, 0.4, 0.6 ) },
	horizonColor: { value: new Color( 0.6, 0.7, 0.8 ) },
	// water optical properties (per metre)
	waterAbsorption: { value: new Vector3( 0.42, 0.075, 0.035 ) },
	waterScattering: { value: new Vector3( 0.012, 0.018, 0.024 ) },
	cameraUnderwater: { value: 0 },
	cameraWaterHeight: { value: 0 },
	exposure: { value: 1 },
	// direction the wind blows toward, and its speed (m/s at 10 m)
	windDir: { value: new Vector2( 0.35, 0.94 ).normalize() },
	windSpeed: { value: 7 },
	// (Salt Life) the trade wind's usual direction, which the weather turns windDir about: what the sand's
	// ripples, the grass's comb and the clouds aloft follow
	windPrevailing: { value: new Vector2( 0.35, 0.94 ).normalize() },
	night: { value: 0 }, // 0 = day, 1 = full night
	envIntensity: { value: 1 },
};

export const GRAVITY = 9.81;
