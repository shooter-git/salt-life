# M17, stream 6: the wakes' far arms as waves

What [M17.md](../M17.md#the-boats) asked: a boat's wake's far arms as smooth crests on the sea's surface, worked out from her track, in the CPU's water query too, so a kayak rocks in a passing console's wake and the bobber rides it, with the foam as it was ([console.md](../m16/console.md)). Built 2026-11-08 on `m17-flats` 3f1367b ([foundation.md](foundation.md)).

## What a real wake is

**Its shape.** A boat's waves go out at their group velocity, half their phase speed in deep water. So the crests made at one place spread into a wedge: Kelvin's 19.47° each side up to a hull Froude number of about 0.5. Past that the waves she can make are those no shorter than her own length, and the wake narrows as 1 / Fr ([Rabaud & Moisy 2013](https://arxiv.org/abs/1304.2653)). The foam's arms already opened at that angle (`wakeTan`).

**The crests in the arms**, seen in photographs side by side:
- A motorboat at a moderate speed on a calm lake (Lake Wakatipu, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:014_Wake_pattern_waves_on_lake_surface_-_Kelvin_wake_pattern_produced_by_a_motorboat_on_Lake_Wakatipu,_New_Zealand.jpg)): each arm a band of short crests en echelon, a dozen or more, each curved, the band wider and its crests longer the further out they've come. The middle of the V is nearly flat, the white wash down it.
- A speedboat on the plane, from her own deck ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Scene_while_speedboat_riding_at_maheshkhali.jpg)): two or three long, smooth ridges each side, nearly along the arm, the first the biggest, the foam between.
- Planing boats seen from a cliff on a breezy sea ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Trails_on_the_Ionian_Canvas.jpg)): the foam is nearly all that's seen; the crests hardly show on a rippled sea.

**Their length.** At Kelvin's angle the arm's waves run 35.26° off the track, 2/3 of a transverse wave's length (2π U² / g). On the plane the arm's waves are about her waterline's length: the waves at the narrower angle are the ones no shorter than she is. Their period hardly changes with speed there. Macfarlane et al.'s ski boat makes its wave B at 2.0 to 2.3 s at 12 to 30 kn.

**Their height**, crest to trough, from [Macfarlane, Bose & Duffy, SNAME 2012](https://www.amcsearch.com.au/source-assets/images/GJM_NB_JTD-SNAME-AM2012_Final-plus-Discussion-and-Responses_30Oct2012.pdf): 19 hulls in a basin, checked against full-size trials.
- A ski boat (L / V^1/3 4.79, about her own; 4.18 lengths off, about 25 m): 0.20 m at 12 and 17 kn, 0.10 at 22, 0.052 at 30. The highest wave of the train comes off the semi-planing speeds, and less as she gets up on the plane. Minnesota's field study found the same of real boats on a lake: the biggest wakes at about 10 mph, the smallest planing at 20 ([SAFL, Marr et al. 2022](https://conservancy.umn.edu/handle/11299/226190)).
- A 17 m, 12 t monohull 20 m off, in 6 m of water: 0.15, 0.5 and 0.88 of its highest (0.33 m) at Fr 0.2, 0.3 and 0.4.
- Slimmer hulls make less: their γ falls about as ( L / V^1/3 )^-2.3 (Fig. 6).
- Off the track it decays as a power of the distance, y^n, n -0.25 to -0.4 for these waves (Fig. 10): Havelock's cusp waves' y^-1/3.

## What's built

`ocean/WakeWaves.js`, pure but for three's Vector4 for its uniforms. `Waves` makes one (`waves.wakes`); the sea's vertex shader and the CPU's heights read the same samples.

**Her track.** `follow( key, x, z, vx, vz, L, V, t )` each frame for each boat under way:
- a sample (her place, heading, speed and the sea's time) every 6 s on a straight run;
- more in a turn (each 12°) or as her speed changes by 15%, at most one in 0.3 s;
- 16 kept a boat;
- none under 1.2 m/s. A jump of 60 m in a frame, or the sea's clock going back, starts her track again.

`Wake.track` follows the boat you're in (not the kayak, whose wake is ripples) and every boat in company by where she's drawn (`followDrawn`: her velocity from her place frame to frame, her hull from `WAKE.hulls`, as her model has it). `App.frame` calls it before the water's queries, so the CPU and the sea read the same samples each frame.

**What's sent** (`update`): the boat you're in first, then the nearest within 1 km (600 m on low). Up to 40 samples in 4 tracks on mid and high, 24 in 2 on low.

For each track:
- her now;
- where her arms come up, one and two and a half waterline lengths behind her middle (none on her own hull, so she never rides her own waves);
- what's recorded;
- where her arms end, at 75 s (about 110 m off her track on the plane), put in between.

Each sample carries:
- its age;
- its waves' k and cos θ: θ is the divergent waves' way whose energy goes out at the wake's angle, tan ψ = tan θ / ( 1 + 2 tan² θ ), so the crests lie where the foam's arms do;
- the height its crests have by then: Macfarlane's fit at her length, slenderness and speed, y off her track, faded in behind her and out at the end;
- how far the train reaches behind its highest crest: wider as it goes out, and wider again under Kelvin's angle, for the feathered band of a slow boat.

**The crests** (`heightAt`, and the GLSL `wakeAt`, the same sum):
- Each sample's crests are now at P + age · cg · n either side, n their way.
- Each arm is the line through those, sample to sample.
- Along a length, the arm's quantities are put in between its ends, and each length fades into the next over 2 m where they meet.
- Across it: the train's highest crest on the line, gone a wavelength outside, the rest of the train behind it toward her track.
- The phase is the one each end's waves have from where she made them: k n · ( x − P ) − ω age. On a straight run that's the steady pattern exactly, whichever sample, and round a turn it carries on.
- On the GPU it's a loop over the tracks (skipping any whose box the vertex is outside), each over its samples, each over its two arms: one copy of the code, however many there are.

**The sea.**
- In the vertex shader, on the grid's point, as the open sea's waves are, under the cave's calm and the swash's sheet. Its slope goes into the normal.
- Faded out as the water shoals from 1.5 m to 0.2 m (`WAKE_SHOAL`), where it would have broken.
- The waves too short for the grid's spacing fade as the open sea's do (5 to 2.5 vertices a wavelength).
- Not in the plain sea a device that draws on its CPU loads with (`WATER_PLAIN`), so nothing's added before ready there. It's in the whole sea put in after the start (`fullSea`). No texture. Its uniforms: 2 a sample and 2 a track, 89 on mid and high, 53 on low.

**The CPU.**
- `Waves.heightAt` adds it at the point it finds under (x, z) (the grid's point, as drawn), with the same shoaling. So the boats, the swimmer, the bobber, the spray, the debris and the foam's patches all ride it.
- `Waves.displacement` doesn't: the whitecaps' crests are the open sea's.

**The foam** is `Wake.js` as it was.

## Readings

## Seen

## Not verified, and left
