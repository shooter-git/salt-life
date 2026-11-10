# M16: lobster traps

Lobstering from the lobster boat, with the traps taken off her deck in M14 for fishing room back, riding only when you've got them aboard. Marta sells them, 2, then 4, then 8.

- **The model.** The Caribbean trap as photographed in Barbados, the user's choice: rusty chicken wire on a frame of bleached poles tied at the joints, in `world/boat/TrapModel.js`. The count changes as you set and haul them, which a merged bucket can't do, so they're instanced: one material; three draw calls at most (traps, buoys and warps, the lobsters in a trap on the rail). Nothing's built until there's a trap to draw. One mesh keeps it to its draw call, so each one's its own in the shader, from a `wear` kept by where it was set or where it stows: the same bend of the whole frame racks it differently, its wire's rusted and eaten through in other places. The wire's cut from its UVs and thins to a screen door where its strands are under a pixel.
- **Stowed** two and three high on her quarters (`STOW`), the first where the old stack was, with colliders only for those aboard.
- **Setting** (`game/TrapWork.js`). By the hauler, starboard side, E sets one over: off the stack, on to the rail, over the side, the warp paying out and the buoy thrown after it. A mark goes on your chart (orange on the map and the plotter, "Trap n" in the Chart tab) and comes off when you haul it. Not past the warp's 120 ft, in under 5 ft, on live coral, under way or in the fairway. The bottom's named as you set: seen by eye to about 40 ft, past that only with the fish finder.
- **Soaking** (`game/Traps.js`) goes by the island's clock, which on your own runs on at an island hour a real hour while you're away, so a real day away is a day's soak. Lobsters forage at night, so nights count: a trap set at noon and hauled at dusk is empty.
- **Finding them.** The mark on your chart; the buoy itself, drawn out to about a quarter mile; a word as you come up to it.
- **Hauling.** Alongside the buoy, starboard side to, E gaffs it, the hauler brings the warp in over the davit's block at 236 ft a minute, the trap breaks the surface and swings in on the davit on to the rail. Each thing in it comes out at a press. Then E stacks it, and E again sets it. Walk away or get under way and the warp comes off and it goes back down.
- **The rules** are the tickle stick's: the gauge's 3 in of carapace, berried females back, the day's bag of 6, all through `GameState.addFish`.
- **Everyone sees the buoys**: the group's save (`buoys`), each owner's own colours, told to whoever's here as they change. Someone else's is theirs: you're told whose, and can't haul it. They stay on the sea when you've gone, for 60 days from the last you were here.
- **A hurricane** (`settle`), worked out from the clock, the same for everyone: lost, dragged (the buoy's moved, your mark hasn't, and Marta's note says which way), or the buoy gone with the trap still at your mark, where you can dive and tie on another. A dragged one that ends ashore or past its warp is lost. Marta sells replacements at $70.
- **Only the lobster boat has the hauler.** In any other boat your buoys are still there and you're told only she can haul them. None of the three upgrades counts toward the sportfisher's unlock (`unlock: false`).

## The figures

| What | Value | Where from |
|---|---|---|
| Catch against soak | rises at a decreasing rate; may peak and fall | Austin's fit to Robinson and Dimitriou (1963), Fishery Bulletin |
| Lobsters at the asymptote, best bottom ((M17) the two weeks' catch, as Florida's soaks) | 3.6 a trap | Worked out: Florida's 24.1 kg a trap a season in 1969-70, with few traps out, over about 14 hauls at 0.7 kg, 55% legal. **The hauls, weight and legal share are my assumptions** |
| Time constant, and fade after 14 days | 3 nights; to 40% | **Chosen to fit that shape**, no measured figure found. (M17) Since, Austin's own fit: (n/14)^0.1 of the two weeks' catch, 77% after a night ([m17/figures.md](../m17/figures.md)); the fade after 14 days kept, its floor still judgement |
| Traps with bycatch | 33% | GCFI survey: 6,972 of 21,309 traps |
| What the bycatch is | stone crabs, grunts, spider crabs, urchins, then others | GCFI: those four are 65% |
| Trap size | 37 x 22 x 15 in | The old model's, kept for the stow on her deck and the rail. Real ones in the photographs look longer and deeper; not measured |
| Buoy | 6 in across | Florida's minimum, Fla. Admin. Code 68B-24.006; each owner's own marking, as there |
| Hurricane | up to about 45% lost, the shallowest worst | Irma, Category 4: about 43% of the Keys' traps lost, some men up to 90% |
| How far dragged | a few hundred m to about 2 km | **Far less than real, on purpose.** Irma's went 3.5 to 8 miles, some 18, which would take any trap here off the shelf |
| Depth lobsters live | to about 295 ft | NOAA Fisheries. The warp stops you at 120 ft |
| Hauler speed | 240 ft a minute | **From memory**, no source found. (M17) 236 ft a minute (1.2 m/s), within makers' specs, 166 to 600; no measured lobster boat's ([m17/figures.md](../m17/figures.md)) |
| Prices | $70 a trap: $140 for the first 2, $140 more to make 4, $280 more to make 8 (`Gear.js`' `traps`) | **A start.** [opening.md](opening.md) tuned the boats' prices against the fish and left this one |

Sources: [Fishery Bulletin (Austin)](https://fisherybulletin.nmfs.noaa.gov/sites/default/files/pdf-content/fish-bull/austin_0.pdf), [Fishery Bulletin (Ehrhardt and Deleveaux)](https://fisherybulletin.nmfs.noaa.gov/sites/default/files/pdf-content/2009/1072/ehrhardt.pdf), [GCFI bycatch survey](https://proceedings.gcfi.org/proceedings/bycatch-in-floridas-spiny-lobster-trap-fishery/), [FWC trap design](https://myfwc.com/fishing/saltwater/commercial/traps), [Fla. Admin. Code 68B-24.006](https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-68B-24-006), [NOAA Fisheries](https://www.fisheries.noaa.gov/species/caribbean-spiny-lobster), [Florida Sea Grant on Irma](https://blogs.ifas.ufl.edu/news/2018/04/12/florida-sea-grant-helped-save-keys-lobster-industry-nearly-4-million-after-hurricane-irma), [Lobster trap in Barbados](https://commons.wikimedia.org/wiki/File:Lobster_trap_in_Barbados_1.jpg).

## Left as it is

- The old model's bait bag and bricks are gone, for the budget: one stone holds it down. The funnel doesn't cut a hole in the wire it passes.
- Your deck's traps don't show on the copy of your boat the others see; only the buoys do.
- The wire casts no shadow: a shadow map can't resolve it, and a solid box's shadow blacked out what's in the trap.
- Trap bait isn't bought or used up, and there's no closed season: the island's clock has no months.
