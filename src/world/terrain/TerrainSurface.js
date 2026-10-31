import { WORLD } from '../WorldLayout.js';
import { srgb as S, rot2 } from './TerrainShading.js';

// The terrain's surface: Tidewater's terrain material (WGSL), translated for WebGL 2. Evaluated in
// the fragment shader from the baked maps (macro normal, rock mask, AO; splat: sand, paths, gullies
// or seagrass, rubble or the beach scarp) and the shared detail texture (rock, soil, sand, fbm).
//
// GLSL statements, run with `vTerrain` (x, z, height) in scope; they declare
//   vec3 tAlbedo; float tRough; vec3 tNormal (world); float tAO
// Defines: TERRAIN_LITE (low-powered devices) skips the triplanar rock, the scarp and the
// distant canopy, which are the costly parts.

const R = WORLD.reef, RN = WORLD.northReef;
const sw = WORLD.swellDir;

export const TERRAIN_SURFACE_GLSL = /* glsl */`
	vec3 p = vec3( vTerrain.x, vTerrain.z, vTerrain.y );
	vec2 xz = p.xz;
	float h = p.y;

	// ---- data maps
	vec4 nr = terrainNormalRock( xz );
	vec3 N0 = normalize( vec3( nr.x, sqrt( max( 1.0 - nr.x * nr.x - nr.y * nr.y, 0.0025 ) ), nr.y ) );
	vec4 sp = terrainSplat( xz );
	float slope = 1.0 - N0.y;
	float camDist = length( cameraPosition - p );
	vec3 dpx = dFdx( p ); vec3 dpy = dFdy( p );
	float fwY = fwidth( h );

	// ---- detail samples (tileable heights: x rock, y soil, z sand, w fbm)
	float macroA = terDetail( ${ rot2( 'xz', 0.7 ) } / 173.0 ).w;
	float macroB = terDetail( ${ rot2( 'xz', 2.1 ) } / 47.0 ).w;
	float mcr = macroA * 0.6 + macroB * 0.4;
	vec4 dN = terDetail( xz / 1.9 );
	vec4 dM = terDetail( ${ rot2( 'xz', 1.3 ) } / 6.7 + 0.21 );
	vec4 dF = terDetail( ${ rot2( 'xz', 2.4 ) } / 0.63 + 0.53 );
	// sand grain without the pebble peaks (pebbles are drawn separately where they belong)
	float grain = min( dN.z, 0.62 );
	float grainF = min( dF.z, 0.62 );
	vec2 swDir = vec2( ${ sw.x.toFixed( 5 ) }, ${ sw.y.toFixed( 5 ) } );
	vec2 rc = vec2( ${ R.center.x.toFixed( 3 ) }, ${ R.center.z.toFixed( 3 ) } );
	vec2 rcN = vec2( ${ RN.center.x.toFixed( 3 ) }, ${ RN.center.z.toFixed( 3 ) } );
	// seabed ripple phases, differentiated in uniform control flow
	float ph2 = dot( xz, swDir ) * ( 6.2832 / 0.75 ) + dM.w * 16.0 + macroB * 24.0;
	float fade2 = 1.0 - ss( 0.5, 2.0, fwidth( ph2 ) );
	float rip2 = pow( sin( ph2 ) * 0.5 + 0.5, 1.4 );
	float ph3 = dot( xz, swDir ) * ( 6.2832 / 0.16 ) + dM.w * 26.0 + dN.w * 5.0;
	float fade3 = 1.0 - ss( 0.6, 2.2, fwidth( ph3 ) );
	float rip3 = pow( sin( ph3 ) * 0.5 + 0.5, 1.5 );
	// wind ripples on the dry sand: crests across the wind, ~10.5 cm
	float ph1 = dot( xz, terrainWindDir ) * ( 6.2832 / 0.105 ) + dM.w * 24.0 + dN.w * 7.0 + macroB * 30.0;
	float fade1 = 1.0 - ss( 0.6, 2.2, fwidth( ph1 ) );
	float rip1 = pow( sin( ph1 ) * 0.5 + 0.5, 1.6 );

	// ---- downslope streaks (rock flutes, hanging vegetation, landslide scars): the detail texture
	// stretched vertically on the two vertical projection planes
	vec2 sw4 = pow( abs( N0.xz ), vec2( 4.0 ) );
	vec2 swN = sw4 / ( sw4.x + sw4.y + 1e-5 );
	float streak = 0.5; float scar = 0.5;
	if ( slope > 0.28 ) {
		vec4 stA = textureGrad( terrainDetailTex, vec2( p.z / 9.3, h / 37.0 ), vec2( dpx.z / 9.3, dpx.y / 37.0 ), vec2( dpy.z / 9.3, dpy.y / 37.0 ) );
		vec4 stB = textureGrad( terrainDetailTex, vec2( p.x / 9.3 + 0.5, h / 37.0 + 0.3 ), vec2( dpx.x / 9.3, dpx.y / 37.0 ), vec2( dpy.x / 9.3, dpy.y / 37.0 ) );
		streak = stA.w * swN.x + stB.w * swN.y;
		scar = stA.y * swN.x + stB.y * swN.y;
	}

	// ---- rock, where the rock mask or the slope allow it. Steep faces, convex spurs and ridges go
	// bare, gully floors keep soil and plants; around the bare rock a band of scree and moss.
	float gully = sp.z * ss( -0.5, 0.5, h );
	vec3 rockAlbedo = vec3( 0.2 ); float rockRough = 0.8; float rockHd = 0.0;
	float rockW = 0.0; float screeW = 0.0;
	float cliffK = ss( 0.28, 0.55, slope );
	float convex = ss( 0.5, 0.85, nr.w );
	float rvBound = nr.z * 0.7 + ss( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
		+ ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22 + ( streak - 0.5 ) * 1.0 * cliffK + 0.2;
	if ( ( nr.z > 0.06 || slope > 0.3 ) && rvBound > 0.28 ) {
		float branchK = max( ss( 0.06, 0.18, nr.z ), ss( 0.3, 0.42, slope ) );
#ifdef TERRAIN_LITE
		// phones: the palette and the joints from the detail already sampled, no triplanar
		float rv = nr.z * 0.7 + ss( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
			+ ( dM.x - 0.45 ) * 0.35 + ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22 + ( streak - 0.5 ) * cliffK;
		rockW = ss( 0.5, 0.68, rv ) * branchK;
		screeW = ss( 0.28, 0.52, rv ) * branchK * ( 1.0 - rockW );
		float tone = dM.x * 0.6 + dN.x * 0.4 + ( mcr - 0.5 ) * 0.7;
		vec3 basalt = mix( PAL_rockDark, PAL_rockMid, ss( 0.25, 0.65, tone ) ) * vec3( 0.8, 0.77, 0.72 );
		basalt *= 1.0 - ss( 0.5, 0.7, streak ) * cliffK * 0.4;
		float ledgeMoss = ss( 0.4, 0.75, N0.y + ( dN.y - 0.45 ) * 0.6 ) * ss( 0.25, 0.55, macroB + dM.y * 0.4 );
		rockAlbedo = mix( basalt, mix( ${ S( 0.12, 0.17, 0.05 ) }, ${ S( 0.22, 0.26, 0.09 ) }, dF.y ), ledgeMoss * 0.7 );
		rockRough = 0.85;
		rockHd = dM.x * 0.35 + dN.x * 0.08;
#else
		RockGrad g;
		g.dpdx = dpx; g.dpdy = dpy; g.fwY = fwY;
		RockSurface Rs = terrainRockSurface( p, N0, h, mcr, 0.5, 1.0, g );
		float rv = nr.z * 0.7 + ss( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
			+ ( Rs.height - 0.45 ) * 0.35 + ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22
			+ ( streak - 0.5 ) * 1.0 * cliffK;
		rockW = ss( 0.5, 0.68, rv ) * branchK;
		screeW = ss( 0.28, 0.52, rv ) * branchK * ( 1.0 - rockW );
		// dark, weathered basalt (darker and browner than the sea-cliff palette), stained down the fall line
		float stain = ss( 0.5, 0.7, streak ) * cliffK;
		vec3 basalt = Rs.albedo * vec3( 0.36, 0.34, 0.31 ) * ( 1.0 - stain * 0.45 ) * ( ss( 0.42, 0.25, streak ) * cliffK * 0.15 + 1.0 );
		// soil and humus caught in the joints and hollows of the rock
		float joints = ss( 0.42, 0.22, Rs.height + ( dN.w - 0.5 ) * 0.25 );
		basalt = mix( basalt, mix( ${ S( 0.13, 0.1, 0.07 ) }, ${ S( 0.2, 0.2, 0.1 ) }, dF.y ), joints * 0.7 );
		// moss / small plants on every ledge and on the less steep parts, more near the edges
		float ledgeMoss = ss( 0.4, 0.75, N0.y + ( dN.y - 0.45 ) * 0.6 ) * ss( 0.25, 0.55, macroB + dM.y * 0.4 );
		float fringe = ss( 0.5, 0.58, rv ) * ss( 0.8, 0.6, rv ) * ss( 0.3, 0.6, dM.w + dN.y * 0.4 );
		float mossK = sat( max( ledgeMoss * 0.75, fringe * 0.8 ) + Rs.moss * 0.3 + joints * 0.25 );
		rockAlbedo = mix( basalt, mix( ${ S( 0.12, 0.17, 0.05 ) }, ${ S( 0.22, 0.26, 0.09 ) }, dF.y ), mossK );
		rockRough = Rs.rough;
		rockHd = Rs.hd * 2.2 + Rs.height * 0.6;
#endif
	}

	// ---- weights
	float notRock = 1.0 - rockW;
	float underW = ss( 0.12, -0.6, h );
	float landW = 1.0 - underW;
	float sandW = ss( 0.3, 0.72, sp.x + ( dM.z - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.35 ) * notRock;
	float pathW = ss( 0.28, 0.62, sp.y + ( dN.y - 0.45 ) * 0.4 + ( dM.w - 0.5 ) * 0.25 ) * notRock * landW
		* ( 1.0 - ss( 50.0, 220.0, camDist ) * 0.85 );
	// forest on the higher / steeper ground and in the gullies, tall-grass meadow on the valley floor
	float jungleW = sat( ss( 9.0, 24.0, h + ( mcr - 0.5 ) * 18.0 ) + ss( 0.18, 0.36, slope ) + gully * 0.6 );
	// landslide scars: raw red-brown laterite in streaks down steep slopes, rare
	float lateriteW = ss( 0.62, 0.74, scar + ( macroB - 0.5 ) * 0.3 ) * ss( 0.3, 0.42, slope )
		* ss( 0.52, 0.66, mcr ) * notRock * 0.85;

	// ---- beach sand: pale coral sand, drifts of warmer / coarser sand, grain
	float dryK = ss( 0.8, 3.0, h );
	vec3 sand = mix( ${ S( 0.83, 0.75, 0.6 ) }, ${ S( 0.9, 0.84, 0.72 ) }, ss( 0.3, 0.72, mcr + dryK * 0.2 ) );
	sand = mix( sand, ${ S( 0.84, 0.72, 0.55 ) }, ss( 0.55, 0.8, dM.w + ( macroB - 0.5 ) * 0.6 ) * 0.45 );
	sand = sand * ( ( dM.w - 0.5 ) * 0.16 + 1.0 ) * ( ( dN.w - 0.5 ) * 0.1 + 1.0 );
	sand = sand * ( ( grain - 0.45 ) * 0.3 + 0.97 ) * ( ( grainF - 0.45 ) * 0.2 + 1.0 );
	// disturbed / trodden patches: slightly darker, coarser sand
	float trod = ss( 0.52, 0.7, dN.y + ( dM.y - 0.5 ) * 0.6 ) * dryK;
	sand = sand * ( 1.0 - trod * 0.07 );
	// the high-water band collects shell grit, coral bits and dried seaweed
	float hw = h + ( dM.w - 0.5 ) * 0.5;
	float wrackBand = ss( 1.15, 1.4, hw ) * ss( 2.1, 1.7, hw );
	float pebDensity = ss( 0.62, 0.85, macroB + dM.w * 0.3 ) * 0.2 + wrackBand * ss( 0.3, 0.6, dM.y );
	float pebW = ss( 0.66, 0.8, dN.z ) * sat( pebDensity ) * ss( 0.6, 0.9, sp.x ) * landW
		* ( 1.0 - ss( 12.0, 35.0, camDist ) );
	vec3 pebCol = mix( mix( ${ S( 0.86, 0.82, 0.74 ) }, ${ S( 0.78, 0.64, 0.6 ) }, ss( 0.45, 0.75, dM.x ) ), ${ S( 0.36, 0.33, 0.3 ) }, ss( 0.74, 0.82, dM.y ) );
	sand = mix( sand, pebCol, pebW * 0.75 );
	float wrack = wrackBand * ss( 0.58, 0.72, dN.y ) * ss( 0.4, 0.6, macroB );
	sand = mix( sand, ${ S( 0.24, 0.18, 0.11 ) }, wrack * 0.8 );
	sand = sand * ( 1.0 - pathW * 0.07 );
	float windK = fade1 * ss( 1.5, 2.2, h ) * ( 1.0 - pathW ) * ( 1.0 - trod * 0.7 )
		* ss( 0.2, 0.5, macroB + dM.w * 0.3 );
	sand = sand * ( ( rip1 - 0.5 ) * 0.12 * windK + 1.0 );

	// ---- seabed: sand with ripple fields, seagrass meadows, rubble heads (below the berm)
	float depth = -h;
	float fieldW = 0.0; float seagrassW = 0.0; float blades = 0.0; float rubbleW = 0.0;
	vec3 under = sand;
	if ( underW > 0.0 ) {
		float reefD = length( xz - rc );
		float reefW = 1.0 - ss( ${ ( R.radius * 0.5 ).toFixed( 2 ) }, ${ ( R.radius * 1.15 ).toFixed( 2 ) }, reefD + ( mcr - 0.5 ) * 30.0 );
		// ((M15) and the windward reef's flat)
		reefW = max( reefW, 1.0 - ss( ${ ( RN.radius * 0.6 ).toFixed( 2 ) }, ${ ( RN.radius * 1.3 ).toFixed( 2 ) }, length( xz - rcN ) + ( mcr - 0.5 ) * 30.0 ) );
		under = mix( ${ S( 0.84, 0.78, 0.64 ) }, ${ S( 0.72, 0.7, 0.58 ) }, ss( 1.0, 9.0, depth ) );
		under = under * ( ( dM.w - 0.5 ) * 0.14 + 1.0 ) * ( ( grain - 0.45 ) * 0.25 + 1.0 );
		// megaripple fields (~0.75 m) across the swell
		fieldW = ss( 0.42, 0.62, macroB + ( dM.w - 0.5 ) * 0.35 ) * ss( 0.9, 2.0, depth ) * ( 1.0 - reefW );
		under = under * ( ( rip2 - 0.55 ) * 0.22 * fieldW * fade2 + 1.0 );
		// seagrass meadows: ragged edges, blade streaks leaning with the wave surge
		float clumps = ( dM.w - 0.5 ) * 0.5 + ( dN.y - 0.45 ) * 0.4 + ( macroB - 0.5 ) * 0.3;
		seagrassW = ss( 0.3, 0.55, sp.z + clumps ) * underW * ss( 0.3, 0.9, depth );
		vec2 swPerp = vec2( -swDir.y, swDir.x );
		blades = terDetail( vec2( dot( xz, swDir ) / 2.6, dot( xz, swPerp ) / 0.35 ) ).y;
		vec3 meadow = mix( ${ S( 0.12, 0.16, 0.07 ) }, ${ S( 0.27, 0.29, 0.15 ) }, ss( 0.35, 0.75, blades ) );
		meadow = mix( meadow, ${ S( 0.24, 0.2, 0.11 ) }, ss( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.4 ) * 0.5 );
		meadow = mix( under, meadow, ss( 0.3, 0.85, sp.z + clumps * 0.5 ) * 0.35 + 0.65 );
		meadow = mix( meadow, mix( meadow, under, 0.45 ), ss( 0.58, 0.8, macroB + ( dM.w - 0.5 ) * 0.4 ) );
		under = mix( under, meadow, seagrassW );
		// rubble heads: coral rubble and rock turfed with algae, pink coralline crusts
		rubbleW = ss( 0.3, 0.6, sp.w + ( dN.x - 0.5 ) * 0.4 + ( dM.w - 0.5 ) * 0.3 ) * underW;
		vec3 rubble = mix( ${ S( 0.2, 0.19, 0.15 ) }, ${ S( 0.36, 0.33, 0.26 ) }, ss( 0.3, 0.7, dN.x ) );
		rubble = mix( rubble, ${ S( 0.2, 0.24, 0.1 ) }, ss( 0.5, 0.7, dF.y ) * 0.6 );
		rubble = mix( rubble, ${ S( 0.58, 0.38, 0.44 ) }, ss( 0.62, 0.74, dM.x ) * 0.6 );
		under = mix( under, rubble, rubbleW );
		// reef flat: coral rubble and pink crusts toward the reef
		under = mix( under, mix( ${ S( 0.56, 0.50, 0.44 ) }, ${ S( 0.60, 0.43, 0.46 ) }, ss( 0.45, 0.7, dM.x ) ), reefW * 0.7 * ss( 0.4, 0.6, dN.x ) );
	}
	sand = mix( sand, under, underW );

	// ---- ground: tall-grass meadow, forest floor and, from afar, the forest canopy
	vec3 V = normalize( cameraPosition - p );
	float NdV = sat( dot( N0, V ) );
	MeadowTone mt = terrainMeadowTone( macroA, macroB, slope, N0.z, dM.w * 0.65 + dN.w * 0.35, true );
	float clump = dM.w * 0.6 + dN.y * 0.4;
	// seen from afar the tussocks and their shadowed gaps are what makes tall grass read as grass
	float clumpK = mix( 0.34, 0.95, ss( 40.0, 140.0, camDist ) );
	vec3 lawn = mt.tone * ( ( clump - 0.5 ) * clumpK + 1.0 ) * ( ( dF.y - 0.4 ) * 0.22 + 1.0 );
	lawn = lawn * mix( 1.0, ss( 0.25, 0.55, dN.y * 0.5 + dM.y * 0.5 ) * 0.35 + 0.72, ss( 50.0, 160.0, camDist ) );
	float comb = 0.5;
#ifndef TERRAIN_LITE
	// grass combed along the wind, and travelling gusts showing the paler blade backs
	if ( jungleW < 1.0 && landW > 0.0 && sandW < 1.0 ) {
		vec2 combUV = vec2( dot( xz, terrainWindDir ) / 7.5, dot( xz, vec2( -terrainWindDir.y, terrainWindDir.x ) ) / 0.9 );
		comb = terDetail( combUV + vec2( 0.31, 0.77 ) ).w;
		lawn = lawn * ( ( comb - 0.5 ) * 0.3 + 1.0 );
		vec2 gp = xz - terrainGustOffset;
		float gn = terDetail( gp / 140.0 ).w * 0.62 + terDetail( gp / 61.0 + 0.37 ).w * 0.38;
		float gust = ss( 0.46, 0.6, gn ) * sat( max( terrainWindSpeed * 0.1, 0.03 ) * 0.5 );
		lawn = mix( lawn, lawn * vec3( 1.25, 1.22, 1.06 ) + 0.01, gust * 0.6 );
	}
#endif
	// seen from above the dark soil shows between the clumps; at grazing angles blade sides cover all
	float gapK = ss( 0.3, 0.95, NdV ) * ss( 0.62, 0.3, clump );
	lawn = mix( lawn, MEADOW_soil, gapK * 0.45 );
	lawn = mix( lawn, terrainSaturation( lawn * 1.12, 1.15 ), ss( 0.45, 0.1, NdV ) * 0.6 );
	// bare trodden soil in places, sandy soil toward the beach
	lawn = mix( lawn, ${ S( 0.4, 0.33, 0.23 ) }, ss( 0.72, 0.84, dN.y + ( dM.y - 0.5 ) * 0.5 ) * 0.25 );
	lawn = mix( lawn, ${ S( 0.60, 0.52, 0.38 ) }, sat( sp.x * 1.6 ) * ss( 0.45, 0.62, dN.z + dM.y * 0.3 ) * 0.7 );
	vec3 litter = mix( ${ S( 0.2, 0.15, 0.09 ) }, ${ S( 0.34, 0.25, 0.13 ) }, dF.y );
	vec3 jungle = mix( ${ S( 0.1, 0.16, 0.05 ) }, litter, ss( 0.52, 0.7, dN.y ) );
	jungle = mix( jungle, ${ S( 0.12, 0.1, 0.06 ) }, gully * 0.3 );
	float far = ss( 40.0, 160.0, camDist );
	vec3 cover = mix( ${ S( 0.08, 0.13, 0.04 ) }, ${ S( 0.17, 0.24, 0.07 ) }, ss( 0.3, 0.7, mcr ) );
	cover = mix( cover, ${ S( 0.27, 0.29, 0.12 ) }, ss( 0.66, 0.84, macroB + dM.w * 0.2 ) * 0.45 );
	jungle = mix( jungle, cover, far * 0.8 );
	jungle = jungle * ( ( mcr - 0.5 ) * 0.3 + 1.0 );
	float canopyW = 0.0; float canopyH = 0.0;
#ifndef TERRAIN_LITE
	// canopy: seen from a distance the forest reads as a carpet of lumpy crowns with dark gaps
	canopyW = jungleW * max( ss( 0.2, 0.4, slope ), ss( 90.0, 260.0, camDist ) ) * ss( 25.0, 70.0, camDist ) * notRock * ( 1.0 - screeW * 0.7 );
	if ( canopyW > 0.0 ) {
		float crowns = terDetail( ${ rot2( 'xz', 0.9 ) } / 61.0 ).w;
		float crownsB = terDetail( ${ rot2( 'xz', 2.3 ) } / 13.0 + 0.37 ).w;
		canopyH = ss( 0.32, 0.7, crowns * 0.45 + crownsB * 0.4 + dM.w * 0.15 );
		vec3 canopy = mix( ${ S( 0.05, 0.08, 0.025 ) }, mix( ${ S( 0.14, 0.21, 0.06 ) }, ${ S( 0.22, 0.27, 0.09 ) }, macroB ), canopyH );
		canopy = canopy * ( ( streak - 0.5 ) * 0.5 * ss( 0.3, 0.5, slope ) + 1.0 );
		jungle = mix( jungle, canopy, canopyW );
	}
#endif
	vec3 ground = mix( lawn, jungle, jungleW );
	// around the bare rock: dark humus, stones and moss, with the surrounding plants creeping in
	float creepIn = ss( 0.4, 0.75, dM.w + ( dN.y - 0.45 ) * 0.5 + ( macroB - 0.5 ) * 0.3 );
	vec3 scree = mix( ${ S( 0.16, 0.13, 0.1 ) }, ${ S( 0.27, 0.24, 0.2 ) }, ss( 0.45, 0.75, dM.x + ( dN.x - 0.5 ) * 0.3 ) );
	scree = mix( scree, mix( ${ S( 0.13, 0.18, 0.06 ) }, ${ S( 0.22, 0.26, 0.09 ) }, dF.y ), ss( 0.45, 0.7, dM.y + ( dN.y - 0.45 ) * 0.5 ) * 0.7 );
	ground = mix( ground, scree, screeW * ( 1.0 - creepIn * 0.7 ) );
	vec3 laterite = mix( ${ S( 0.42, 0.25, 0.16 ) }, ${ S( 0.52, 0.36, 0.24 ) }, dM.w ) * ( ( dN.y - 0.4 ) * 0.3 + 1.0 );
	ground = mix( ground, laterite, lateriteW );

	// ---- worn dirt paths / trampled ground (darker, redder soil in the forest)
	vec3 dirt = mix( ${ S( 0.38, 0.31, 0.23 ) }, ${ S( 0.5, 0.43, 0.32 ) }, dM.w ) * ( ( dN.y - 0.4 ) * 0.35 + 0.95 );
	dirt = mix( dirt, ${ S( 0.3, 0.22, 0.15 ) }, jungleW * 0.7 );
	dirt = mix( dirt, ${ S( 0.56, 0.53, 0.48 ) }, ss( 0.72, 0.82, dN.z ) * 0.5 );
	float creep = ss( 0.45, 0.7, dN.y + ( dF.y - 0.45 ) * 0.5 ) * ss( 0.9, 0.5, sp.y );
	dirt = mix( dirt, lawn, creep * 0.8 );

	// ---- combine
	vec3 albedo = mix( ground, dirt, pathW );
	albedo = mix( albedo, sand, max( sandW, underW * notRock ) );
	albedo = mix( albedo, rockAlbedo, rockW );

	// ---- eroded beach scarp (splat alpha on land): the storm-cut face of the foredune
	float scarpW = sat( sp.w * 1.6 ) * landW * notRock;
	float scarpH = 0.0;
#ifndef TERRAIN_LITE
	if ( scarpW > 0.003 ) {
		vec2 tanF = normalize( vec2( -N0.z, N0.x ) + vec2( 1e-4, 0.0 ) );
		float alongF = dot( xz, tanF );
		float hwS = h + ( dM.w - 0.5 ) * 0.5 + ( dN.w - 0.5 ) * 0.12 + ( macroB - 0.5 ) * 0.35;
		float lam = sin( hwS * ( 6.2832 / 0.11 ) + dN.x * 2.0 ) * 0.5 + 0.5;
		float crossB = sin( ( hwS + alongF * 0.09 ) * ( 6.2832 / 0.075 ) ) * 0.5 + 0.5;
		float lamB = ss( 0.3, 0.7, sin( ( hwS + dM.y * 0.4 ) * ( 6.2832 / 0.43 ) ) * 0.5 + 0.5 );
		float layerMix = mix( lam, crossB, ss( 0.4, 0.6, dM.x ) );
		vec3 soil = mix( ${ S( 0.5, 0.42, 0.31 ) }, ${ S( 0.68, 0.6, 0.46 ) }, ss( 0.3, 0.8, layerMix ) * 0.45 + lamB * 0.2 + ( grain - 0.45 ) * 0.5 + ( dM.w - 0.5 ) * 0.3 );
		soil = mix( soil, ${ S( 0.26, 0.2, 0.14 ) }, ss( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.5 ) * 0.55 );
		vec4 ru = terDetail( vec2( dot( xz, tanF ) / 0.8, h / 0.5 ) + vec2( 0.37, 0.11 ) );
		vec4 rvv = terDetail( vec2( dot( xz, tanF ) / 1.7 + h * 0.6, h / 0.9 ) + vec2( 0.71, 0.29 ) );
		float rootLive = ss( 0.035, 0.0, abs( ru.x - 0.5 ) ) * ss( 0.45, 0.62, ru.w );
		float rootDead = ss( 0.03, 0.0, abs( rvv.z - 0.52 ) ) * ss( 0.5, 0.66, rvv.y );
		soil = mix( soil, ${ S( 0.17, 0.12, 0.08 ) }, rootLive * 0.85 );
		soil = mix( soil, ${ S( 0.8, 0.75, 0.66 ) }, rootDead * 0.75 );
		float seep = ss( 0.6, 0.8, terDetail( vec2( dot( xz, tanF ) / 2.3, h / 6.0 ) ).w ) * 0.35;
		soil = soil * ( 1.0 - seep - ss( 0.5, 1.0, sp.w ) * 0.08 );
		float lip = ss( 0.86, 0.97, sp.w + ( dN.y - 0.45 ) * 0.1 );
		soil = mix( soil, ${ S( 0.2, 0.15, 0.1 ) } * ( dN.x * 0.4 + 0.8 ), lip * 0.85 );
		soil *= 1.0 - ( 1.0 - ss( 0.6, 0.78, sp.w ) ) * ss( 0.35, 0.55, sp.w ) * 0.25;
		soil = mix( ${ S( 0.63, 0.56, 0.44 ) } * ( grain * 0.3 + 0.85 ), soil, ss( 0.35, 0.75, sp.w ) );
		albedo = mix( albedo, soil, scarpW );
		scarpH = lip * 0.03 + layerMix * 0.012 + lamB * 0.018 + rootLive * 0.012 + rootDead * 0.009 + dN.x * 0.025;
	}
#endif

	// ---- (M13) what a hurricane's sea left (terrainStorm: x the sand it washed up over the ground behind
	// the beach, y its wrack, z how high it reached up the beach (m), w how long ago, 0 fresh .. 1 dried;
	// terrainStormPaths: the weed it left over the paths): a line of sargassum, seagrass and broken
	// fronds where it reached, heaped in banks, fresh olive-gold drying to near black; fans of pale sand
	// over the paths and the grass behind, weed strewn over them
	if ( terrainStorm.x + terrainStorm.y + terrainStormPaths > 0.0 ) {
		float sH = terrainStorm.z;
		// (the line meanders, 2-3 m across, in clumps: lumps of weed, the sand showing between, a dark
		// stain of wet rot along its foot)
		float sLine = h + ( dM.w - 0.5 ) * 0.22 + ( macroB - 0.5 ) * 0.18;
		float band = ss( sH - 0.32, sH - 0.12, sLine ) * ss( sH + 0.1, sH - 0.02, sLine );
		float bank = ss( 0.42, 0.58, dN.y * 0.5 + dF.y * 0.35 + macroB * 0.25 );
		vec3 weedC = mix( ${ S( 0.3, 0.2, 0.06 ) }, ${ S( 0.09, 0.07, 0.05 ) }, terrainStorm.w ) * ( dF.y * 0.5 + 0.7 );
		float stain = ss( sH - 0.45, sH - 0.2, sLine ) * ( 1.0 - band ) * ss( sH - 0.05, sH - 0.2, sLine );
		albedo = albedo * ( 1.0 - stain * 0.18 * terrainStorm.y * landW );
		albedo = mix( albedo, weedC, band * bank * terrainStorm.y * landW * notRock );
		// (the sand from the beach's top to a little past where the sea reached, in fans thinning inland)
		float behind = ss( sH + 0.5, sH - 0.3, h ) * ss( 0.6, 1.4, h ) * landW * notRock * ( 1.0 - sandW ) * ( 1.0 - jungleW * 0.8 );
		float fan = ss( 0.3, 0.55, dM.w * 0.6 + macroA * 0.4 + ss( sH + 0.5, sH - 0.6, h ) * 0.3 );
		albedo = mix( albedo, ${ S( 0.8, 0.73, 0.6 ) } * ( grain * 0.3 + 0.85 ), terrainStorm.x * behind * fan );
		albedo = mix( albedo, weedC, terrainStormPaths * behind * ss( 0.62, 0.76, dN.y * 0.6 + dF.y * 0.4 ) );
	}

	// ---- wetness: the swash zone's damp band (Tidewater's shore simulation drew it wave by wave); ((M13)
	// up from the water as it is: a storm surge moves it up the beach, and wets what it floods)
	float hSea = h - terrainSeaLevel;
	float wet = ss( 0.5, 0.0, hSea ) * ( 1.0 - jungleW * 0.8 ) * landW;
	float dampMottle = ss( 0.3, 0.7, dM.w + ( dN.y - 0.45 ) * 0.6 + ( macroB - 0.5 ) * 0.4 );
	float damp = ss( 1.7, 0.5, hSea + dM.w * 0.3 ) * sandW * mix( 0.22, 0.5, dampMottle );
	float mottle = ss( 0.25, 0.75, dM.w + ( dN.y - 0.45 ) * 0.5 );
	float dryEdge = ss( 0.0, 0.6, wet ) * ss( 1.0, 0.6, wet );
	float wetK = max( wet, damp ) * ( 1.0 - dryEdge * mottle * 0.6 ) * notRock;
	vec2 slopeDir = normalize( N0.xz + vec2( 1e-4, 0.0 ) );
	float rillK = ss( 0.2, 0.9, wet ) * ss( 0.05, 0.6, hSea ) * sandW;
	float rill = 0.5;
	if ( rillK > 0.0 ) { rill = terDetail( vec2( dot( xz, slopeDir ) / 3.2, dot( xz, vec2( -slopeDir.y, slopeDir.x ) ) / 0.3 ) ).w; }
	vec3 wetAlbedo = terrainSaturation( albedo * 0.58, 1.15 ) * vec3( 0.97, 0.98, 1.0 ) * ( ( rill - 0.5 ) * 0.25 * rillK + 1.0 );
	albedo = mix( albedo, wetAlbedo, wetK );
	// swash marks: thin wavy lines of grit left at the limits of earlier uprushes
	float sl = ( hSea + dM.w * 0.18 + dN.w * 0.05 ) / 0.13;
	float slD = abs( fract( sl ) - 0.5 );
	float slW = fwidth( sl ) + 1e-4;
	float swashLine = ss( slW * 1.5 + 0.04, 0.0, slD ) * ss( 0.2, 0.4, hSea ) * ss( 1.6, 1.2, hSea )
		* ss( 0.45, 0.65, dM.y + ( macroB - 0.5 ) * 0.4 ) * sandW * ( 1.0 - ss( 0.8, 2.0, slW * 10.0 ) );
	albedo = mix( albedo * ( 1.0 - swashLine * 0.3 ), ${ S( 0.9, 0.88, 0.84 ) }, swashLine * ss( 0.6, 0.75, dF.z ) * 0.5 );

	// ---- (M14) the sand blowing over the dry beach in a strong breeze (terrainBlow: the way the wind blows,
	// how far its streamers have run, how much is blowing), as photographs of a beach in a blow show it:
	// sand snakes, streamers a few cm deep and tens of cm across, braided and running along the wind, paler
	// than the sand they run over; where a pixel's too big to hold them, a pale haze over it. Not on wet sand,
	// the paths, or the grass
	if ( terrainBlow.w > 0.0 ) {
		float blowK = terrainBlow.w * sandW * ss( 0.6, 1.4, hSea ) * ( 1.0 - wetK ) * ( 1.0 - pathW * 0.6 ) * landW;
		vec2 bw = terrainBlow.xy;
		float bA = dot( xz, bw ) - terrainBlow.z, bC = dot( xz, vec2( - bw.y, bw.x ) );
		// (snaking: each streamer wanders across the wind as it runs, a few tens of cm over a metre or two)
		vec4 bW = terDetail( vec2( bA / 7.0, bC / 2.5 ) + 0.13 );
		bC += ( bW.w - 0.5 ) * 0.9 + sin( bA * 2.1 + bW.y * 6.0 ) * 0.06;
		vec4 bS1 = terDetail( vec2( bA / 2.4, bC / 0.3 ) );
		vec4 bS2 = terDetail( vec2( ( bA - terrainBlow.z * 0.6 ) / 1.5 + 0.37, bC / 0.2 + 0.61 ) );
		float snake = ss( 0.52, 0.72, bS1.w ) * ss( 0.35, 0.65, bS2.w ) + ss( 0.6, 0.78, bS2.w ) * 0.5;
		snake = mix( snake, 0.22, ss( 0.4, 1.2, fwidth( bC / 0.35 ) ) );
		albedo = mix( albedo, albedo * 1.22 + 0.02, sat( snake ) * blowK * 0.55 );
	}

	// ---- roughness
	float rough = mix( 0.88, 0.93, sandW );
	rough = mix( rough, 0.9, pathW );
	rough = mix( rough, rockRough, rockW );
	// wet sand has a film of water: glossy while fresh, satin as it drains
	rough = mix( rough, mix( 0.6, 0.3, wet ), wetK ); // (Tidewater 0.42 / 0.16: with this sun that glared like a mirror)
	rough = mix( rough, 0.75, underW );
	rough = mix( rough, 0.94, scarpW );

	// ---- micro relief for the normal
	float windR = rip1 * 0.005 * windK;
	float waveR = rip3 * 0.012 * fade3 * ss( -0.3, -0.9, h ) * ( 1.0 - seagrassW );
	float megaR = rip2 * 0.035 * fade2 * fieldW * ( 1.0 - seagrassW );
	float sandH = ( grain * 0.004 + grainF * 0.003 + pebW * 0.004 + windR + waveR + megaR ) * ( 1.0 - wet * 0.6 )
		+ rill * 0.006 * rillK;
	float seabedH = seagrassW * ( blades * 0.05 + 0.08 ) + rubbleW * ( dN.x * 0.07 + dF.x * 0.015 );
	float groundH = dN.y * mix( 0.05, 0.035, jungleW ) + dF.y * 0.012 + dM.y * 0.045 + canopyH * canopyW * 2.5
		+ clump * 0.12 * ( 1.0 - jungleW ) + comb * 0.03 * ( 1.0 - jungleW );
	float screeH = dN.z * 0.04 + dM.x * 0.06;
	float dirtH = dN.z * 0.012 + dN.y * 0.01;
	float hd = mix( mix( groundH, screeH, screeW ), dirtH, pathW );
	hd = mix( hd, sandH + seabedH, max( sandW, underW * notRock ) );
	hd = mix( hd, rockHd, rockW );
	hd = mix( hd, scarpH, scarpW );

	// ---- ambient occlusion: baked horizon + cavity, plus litter / crevices / seagrass canopy
	float meadowW = ( 1.0 - jungleW ) * ( 1.0 - pathW ) * notRock * ( 1.0 - sandW ) * landW * ( 1.0 - screeW );
	float aoDetail = mix( 1.0, dN.y * 0.5 + 0.7, jungleW * ( 1.0 - sandW ) * notRock * landW )
		* mix( 1.0, ss( 0.2, 0.7, clump ) * 0.35 + 0.65, meadowW );
	float tAO = sat( nr.w * aoDetail * ( 1.0 - seagrassW * 0.3 ) * ( 1.0 - rubbleW * ss( 0.55, 0.2, dN.x ) * 0.35 )
		* mix( 1.0, ss( 0.15, 0.6, canopyH ) * 0.6 + 0.4, canopyW ) );

	vec3 tAlbedo = albedo;
	float tRough = rough;
	vec3 tNormal = terrainPerturbNormal( p, N0, hd, 1.0 );
`;
