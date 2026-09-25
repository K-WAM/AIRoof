import type { WorkCatalog, WorkCatalogItem, WorkCatalogLine, WorkSeverity } from "@/types/workCatalog";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";

// Phase 17 (T-105a): per-industry starter work catalogs. A Record<VerticalId, …>
// so tsc fails until every vertical declares one — verticals whose
// disabledModules include "jobs" declare an empty catalog (the Library tab and
// this API surface are gated off for them anyway).
//
// Content rules (the same lesson as T-101, applied to text that prints on
// customer reports, quotes, and invoices):
//   - problem/solution/line wording is REAL copy a tradesperson would write —
//     never placeholder text like "[Describe work]" or "edit to match".
//   - the example-price status lives in the `starter` flag + the Library badge,
//     not in the wording.
//   - no legal/medical/safety guarantees, no warranty promises, no invented
//     code references, and no borrowed standard or spec numbers.

const item = (
  vertical: VerticalId,
  slug: string,
  category: string,
  problem: string,
  solution: string,
  severity: WorkSeverity,
  lines: WorkCatalogLine[]
): WorkCatalogItem => ({
  itemId: `starter-${vertical}-${slug}`,
  category,
  problem,
  solution,
  severity,
  lines,
  starter: true,
  createdAt: 0, // stamped with the import time by mergeWorkStarter
});

const line = (
  description: string,
  quantity: number,
  unit: string | null,
  unitPrice: number,
  kind: WorkCatalogLine["kind"]
): WorkCatalogLine => ({ description, quantity, ...(unit ? { unit } : {}), unitPrice, kind });

const roof = (slug: string, category: string, problem: string, solution: string, severity: WorkSeverity, lines: WorkCatalogLine[]): WorkCatalogItem =>
  item("roofing", slug, category, problem, solution, severity, lines);

export const WORK_CATALOG_STARTER: Record<VerticalId, WorkCatalogItem[]> = {
  roofing: [
    // ── Leaks ─────────────────────────────────────────────────────────────
    roof("leak-ceiling-stain", "Leaks", "Water stain or active dripping at the interior ceiling.",
      "Trace the entry point to the roof surface and remove the affected material at the source. Apply a temporary cover when active rain is expected, and complete the permanent repair once the area is dry.", "high",
      [line("Leak trace and temporary cover", 1, "service", 450, "labor"), line("Roof sealant cartridge", 2, "each", 18, "material")]),
    roof("leak-ponding-low-slope", "Leaks", "Standing water remains on a low-slope roof section well after rainfall.",
      "Locate the ponding area, clean the surface, and re-level or add a tapered fill to move water toward the existing drains. Re-flash the repaired area so it ties into the surrounding membrane.", "medium",
      [line("Tapered insulation panel", 4, "each", 65, "material"), line("Low-slope re-level", 6, "hr", 85, "labor")]),
    roof("leak-chimney-base", "Leaks", "Water enters at the base of the chimney during rain.",
      "Remove the failing flashing, cut the masonry joint clean, and install new metal lapped into the chase. Seal the top edge so water is directed onto the roof surface below.", "high",
      [line("Counter-flashing", 8, "ft", 12, "material"), line("Chimney re-flash", 4, "hr", 110, "labor")]),
    roof("leak-wall-intersection", "Leaks", "Water stains on the wall below a roof-to-wall intersection.",
      "Remove the shingles along the wall, install new step flashing tucked under each course, and relay the shingles. Re-point the counter-flashing joint with sealant.", "high",
      [line("Step flashing piece", 10, "each", 8, "material"), line("Wall intersection re-flash", 4, "hr", 95, "labor")]),

    // ── Flashing ──────────────────────────────────────────────────────────
    roof("flashing-pipe-collar", "Flashing", "The rubber collar around a plumbing vent pipe is cracked and lifting away from the pipe.",
      "Remove the old collar, clean the pipe and the surrounding roof surface, and install a new flashing assembly with sealant. Tool the sealant so water runs over, not under, the repair.", "high",
      [line("Pipe flashing assembly", 1, "each", 45, "material"), line("Pipe collar replacement", 1, "hr", 95, "labor")]),
    roof("flashing-step-open", "Flashing", "Step flashing at a wall is open or missing pieces, leaving a direct path for water.",
      "Remove the affected shingles, install new step flashing pieces tucked under each course, and re-install the shingles. Re-point the wall counter-flashing joint with sealant.", "high",
      [line("Step flashing piece", 8, "each", 8, "material"), line("Re-flash wall intersection", 4, "hr", 95, "labor")]),
    roof("flashing-counter-rusted", "Flashing", "The metal counter-flashing above a chimney or wall is rusted through or has pulled away from the masonry.",
      "Remove the deteriorated metal, cut a new chase or reuse the existing one, and install new counter-flashing lapped into the joint. Seal the top edge so water is directed onto the roof flashing below.", "medium",
      [line("Counter-flashing", 6, "ft", 12, "material"), line("Counter-flashing replacement", 3, "hr", 110, "labor")]),
    roof("flashing-valley-exposed", "Flashing", "Valley metal is exposed, dented, or corroded where two roof planes meet.",
      "Remove the shingles along the valley, replace or re-bed the valley metal, and relay the shingles. Keep the cuts clean and straight along the valley line.", "medium",
      [line("Valley metal", 8, "ft", 14, "material"), line("Valley repair", 3, "hr", 95, "labor")]),
    roof("sealant-mastic-failed", "Flashing", "Old sealant or mastic around a penetration has cracked, shrunk, or pulled away from the surface.",
      "Remove the failed sealant and clean the joint back to sound material. Apply new sealant rated for the surface and tool it so water sheds off the repair.", "medium",
      [line("Roof sealant cartridge", 2, "each", 18, "material"), line("Sealant replacement", 2, "hr", 85, "labor")]),
    roof("drip-edge-damaged", "Flashing", "The drip edge along the roof edge is bent, loose, or missing, leaving the edge exposed.",
      "Remove the damaged drip edge and install a new section tight to the fascia and under the underlayment. Fasten at the recommended spacing so wind cannot lift the edge.", "medium",
      [line("Drip edge", 10, "ft", 6, "material"), line("Drip edge installation", 2, "hr", 85, "labor")]),

    // ── Shingles / Tile ───────────────────────────────────────────────────
    roof("shingles-missing", "Shingles / Tile", "Several shingles are missing or have slid out of position, exposing the underlayment.",
      "Replace the missing shingles with the closest available match, nailing in the correct pattern and sealing the tabs. Inspect the surrounding field for loose fasteners and re-secure them.", "medium",
      [line("Shingle bundle", 2, "bundle", 40, "material"), line("Shingle replacement", 3, "hr", 85, "labor")]),
    roof("shingles-curled", "Shingles / Tile", "Shingle tabs are curling or cupping at the edges, a sign of age and reduced wind resistance.",
      "Re-adhere lifted tabs where the shingle is still sound, and replace shingles that are brittle or cracked. Note the roof's overall age so the owner can plan for a full replacement.", "low",
      [line("Shingle re-seal and repair", 2, "hr", 85, "labor")]),
    roof("tile-cracked", "Shingles / Tile", "Concrete or clay tiles are cracked, chipped, or broken, often from foot traffic or impact.",
      "Replace the damaged tiles with matching pieces, walking on the lower edges to avoid new breakage. Re-bed any disturbed tiles and check the underlayment beneath them.", "medium",
      [line("Matching roof tile", 6, "each", 9, "material"), line("Tile replacement", 4, "hr", 95, "labor")]),
    roof("tile-slipped-missing", "Shingles / Tile", "Tiles have slipped out of line or come loose, exposing the underlayment beneath.",
      "Re-seat the slipped tiles and replace any that are cracked or missing with matching pieces. Check the underlayment and the fasteners on the surrounding courses before closing the job.", "medium",
      [line("Matching roof tile", 8, "each", 9, "material"), line("Tile re-set and replacement", 3, "hr", 95, "labor")]),
    roof("shingles-granule-loss", "Shingles / Tile", "The shingle surface has lost much of its granule coating, leaving bare or thin spots.",
      "Document the extent of the granule loss and check the gutters for collected granules. Where the loss is advanced, plan the roof section for replacement rather than spot repair.", "low",
      [line("Roof condition assessment", 1, "service", 150, "labor")]),

    // ── Flat Roof ─────────────────────────────────────────────────────────
    roof("flat-membrane-blister", "Flat Roof", "The flat-roof membrane has a raised blister where it has separated from the layer below.",
      "Open the blister, clean and dry the area, and re-adhere the membrane with the matching bonding method. Roll the repair flat and seal the edges so water cannot travel underneath.", "medium",
      [line("Membrane bonding adhesive", 1, "each", 65, "material"), line("Blister repair", 3, "hr", 95, "labor")]),
    roof("flat-membrane-split", "Flat Roof", "A split in the flat-roof membrane is letting water reach the layers beneath.",
      "Clean and dry the split, then install a reinforced patch that overlaps the surrounding membrane on every side. Seal the patch edges and check nearby seams for the same wear.", "high",
      [line("Reinforced membrane patch", 1, "each", 85, "material"), line("Membrane patch", 2, "hr", 95, "labor")]),

    // ── Fascia / Soffit ───────────────────────────────────────────────────
    roof("fascia-soffit-rot", "Fascia / Soffit", "The fascia board or soffit is soft, cracked, or peeling from water exposure and age.",
      "Remove the rotted section, check the framing behind it, and install primed replacement material. Seal and paint the joint so water runs off the edge instead of into the wood.", "medium",
      [line("Fascia board", 3, "each", 22, "material"), line("Fascia and soffit repair", 3, "hr", 85, "labor")]),

    // ── Ventilation ───────────────────────────────────────────────────────
    roof("vent-ridge-blocked", "Ventilation", "The ridge vent is blocked by debris or undersized for the attic space.",
      "Clear the vent openings and confirm the ridge vent has a continuous air path. Add balanced intake or exhaust venting so airflow matches the vent coverage for the attic area.", "medium",
      [line("Ridge vent section", 4, "ft", 8, "material"), line("Vent clearing and correction", 3, "hr", 85, "labor")]),
    roof("vent-power-not-running", "Ventilation", "An attic power vent is not operating, and the attic shows heat buildup.",
      "Test the vent's circuit and thermostat, then repair the wiring or replace the motor as needed. Confirm the vent switches on and off at the thermostat settings.", "low",
      [line("Power vent motor", 1, "each", 180, "material"), line("Vent repair", 2, "hr", 95, "labor")]),
    roof("vent-soffit-covered", "Ventilation", "Soffit vents are covered by paint or insulation, blocking the attic's intake air.",
      "Clear each soffit vent so air can enter freely, and confirm the air path from the eaves to the exhaust vents is open. Install baffles where insulation would otherwise cover the vents.", "low",
      [line("Soffit vent baffle", 6, "each", 6, "material"), line("Vent clearing", 2, "hr", 85, "labor")]),

    // ── Gutters / Drainage ────────────────────────────────────────────────
    roof("gutter-clogged", "Gutters / Drainage", "Gutters are full of debris and overflow during rain, pouring water down the walls.",
      "Remove the debris from the gutters and downspouts, flush the runs, and confirm the water exits away from the foundation. Check the gutter slope and re-hang any sagging sections.", "medium",
      [line("Gutter cleaning and flush", 1, "service", 180, "labor")]),
    roof("gutter-seam-leaking", "Gutters / Drainage", "A gutter seam has separated, leaking water at the joint.",
      "Clean the joint, re-fasten the sections, and seal the seam with a gutter-grade sealant. Verify the run drains to the downspout without pooling.", "low",
      [line("Gutter sealant cartridge", 1, "each", 16, "material"), line("Seam repair", 1, "hr", 85, "labor")]),
    roof("gutter-pitch-wrong", "Gutters / Drainage", "A gutter run pitches away from the downspout, leaving standing water.",
      "Re-hang the run with the correct fall toward the outlet and re-secure the hangers. Confirm the full length drains after a hose test.", "low",
      [line("Gutter re-pitch", 2, "hr", 85, "labor")]),

    // ── Storm Damage ──────────────────────────────────────────────────────
    roof("storm-wind-lifted", "Storm Damage", "Shingles were lifted by wind and some are creased or loose after the storm.",
      "Inspect the full slope for lifted tabs, re-seal the sound ones, and replace the damaged ones. Note the wind event so any insurance claim matches the inspection findings.", "high",
      [line("Storm damage inspection", 1, "service", 250, "labor"), line("Shingle bundle", 2, "bundle", 40, "material")]),
    roof("storm-hail-marks", "Storm Damage", "The roof shows small impact marks from hail, with granule displacement at each strike.",
      "Measure and photograph a sample of the impact marks, and record the direction and date of the storm if known. Advise the owner to have the policy reviewed against the documented damage.", "medium",
      [line("Hail damage assessment", 1, "service", 200, "labor")]),
    roof("storm-tree-contact", "Storm Damage", "A tree branch rests on the roof and has scuffed the surface.",
      "Remove the branch and check the contact area for broken shingles or punctures. Trim overhanging growth back so nothing can rub the roof again.", "medium",
      [line("Branch removal and surface check", 2, "hr", 95, "labor")]),
    roof("emergency-tarp", "Storm Damage", "A storm has opened the roof and water is entering the home.",
      "Cover the damaged area with a secured emergency tarp to stop further water entry. Photograph the damage before the cover goes on and record the affected area for the permanent repair.", "high",
      [line("Emergency tarp and securing", 1, "service", 550, "labor"), line("Tarp and fasteners", 1, "each", 120, "material")]),

    // ── Penetrations / Skylights ──────────────────────────────────────────
    roof("skylight-cracked-lens", "Penetrations / Skylights", "The skylight lens is cracked and showing moisture between the panes.",
      "Replace the lens or the sealed glass unit with the matching replacement part for the unit. Re-check the curb flashing and seal the joint after the new lens is set.", "medium",
      [line("Skylight replacement lens", 1, "each", 220, "material"), line("Skylight lens replacement", 2, "hr", 95, "labor")]),
    roof("skylight-curb-flashing", "Penetrations / Skylights", "The flashing at the skylight curb has dried sealant and visible gaps.",
      "Remove the old sealant, clean the curb, and re-flash the base with new metal and sealant. Re-tool the joints so water drains off the curb onto the roof.", "medium",
      [line("Curb flashing metal", 6, "ft", 10, "material"), line("Curb re-flash", 3, "hr", 95, "labor")]),
    roof("penetration-unsealed", "Penetrations / Skylights", "A cable or conduit penetration has an open gap where it passes through the roof.",
      "Install a pipe boot or pitch pocket sized for the penetration and fill it with the correct sealant. Check the repair from below before closing out.", "high",
      [line("Pipe boot", 1, "each", 40, "material"), line("Penetration seal", 2, "hr", 95, "labor")]),

    // ── Decking ───────────────────────────────────────────────────────────
    roof("deck-soft-sheathing", "Decking", "The roof deck gives underfoot in a small area, indicating water-damaged sheathing.",
      "Cut out the damaged section and replace it with new sheathing of the same thickness, re-nailing with a full fastener pattern. Re-install the underlayment and roofing over the repair.", "high",
      [line("Plywood sheathing sheet", 2, "sheet", 55, "material"), line("Decking replacement", 4, "hr", 85, "labor")]),
    roof("deck-fasteners-backed-out", "Decking", "Fasteners are backing out across a roof section, leaving shingles that shift underfoot.",
      "Re-nail the loose shingles on the correct nail line and replace fasteners that are rusted through. Seal any old nail holes that would admit water.", "low",
      [line("Fastener re-set", 2, "hr", 85, "labor")]),

    // ── Inspection Notes ──────────────────────────────────────────────────
    roof("inspection-age-documentation", "Inspection Notes", "The roof is approaching the expected service life for its material, with general wear throughout.",
      "Record the roof's age, material, and overall condition in the inspection notes so future visits have a baseline. Recommend a follow-up inspection interval and budget planning for eventual replacement.", "low",
      [line("Inspection and documentation", 1, "service", 150, "labor")]),
    roof("inspection-prior-repair", "Inspection Notes", "A prior repair uses mismatched materials or incorrect fastening, and is failing early.",
      "Remove the prior repair, correct the underlying surface, and redo the work with matching materials. Note the correction in the record so the same issue is not repeated.", "medium",
      [line("Repair correction", 3, "hr", 95, "labor")]),
    roof("inspection-wind-mitigation", "Inspection Notes", "The owner needs a wind mitigation inspection for the home's roof.",
      "Inspect and record the roof covering, the roof-to-wall attachment, the roof deck attachment, and the roof shape. Provide the completed documentation so the owner can pass it to their insurer.", "low",
      [line("Wind mitigation inspection", 1, "service", 175, "labor")]),
  ],

  hvac: [
    item("hvac", "cooling-short-cycle", "Cooling", "The cooling system turns on and off in short bursts instead of running a full cycle.",
      "Check the thermostat placement and settings, then measure the temperature split across the coil. Clean the coil and filter, and verify the pressures before concluding the diagnosis.", "medium",
      [line("Diagnostic visit", 1, "service", 95, "labor")]),
    item("hvac", "airflow-weak-vents", "Airflow", "Some rooms get noticeably less airflow than others.",
      "Inspect the filter, blower wheel, and duct connections for restriction. Seal accessible duct leaks and re-balance the registers so each room receives its share of airflow.", "medium",
      [line("Air filter", 1, "each", 25, "material"), line("Duct seal and balance", 2, "hr", 95, "labor")]),
    item("hvac", "cooling-frozen-coil", "Cooling", "The indoor coil is covered in ice, and airflow or cooling has dropped.",
      "Shut the system down and let the coil thaw, then find the cause — usually low airflow or low refrigerant. Correct the cause and restart once the coil is fully dry.", "high",
      [line("Thaw and diagnostic", 2, "hr", 95, "labor")]),
    item("hvac", "drain-clogged-line", "Drainage", "The condensate drain is backed up, and water is pooling at the indoor unit.",
      "Clear the drain line and flush it, then check that the float switch operates. Confirm the condensate flows freely to the disposal point.", "medium",
      [line("Drain line clear and flush", 1, "service", 120, "labor")]),
    item("hvac", "cooling-no-start", "Cooling", "The system runs but blows warm air.",
      "Verify the thermostat call, then check the outdoor unit for power and a running compressor. Test the run capacitor and contactor, and replace the failed part before re-testing.", "high",
      [line("Run capacitor", 1, "each", 45, "material"), line("Repair call", 2, "hr", 95, "labor")]),
    item("hvac", "maintenance-dirty-coil", "Maintenance", "The outdoor coil is coated in debris and the system runs longer than it should.",
      "Wash the coil with a coil-safe cleaner and straighten bent fins. Clear vegetation around the unit so air can move freely.", "low",
      [line("Coil cleaning", 1, "service", 140, "labor")]),
    item("hvac", "cooling-charge-check", "Cooling", "Pressures are not in the expected range for the conditions.",
      "Measure the line temperatures and pressures, then adjust the charge to the target pressures for the conditions. Re-check the temperature split after adjusting.", "medium",
      [line("Refrigerant", 2, "lb", 60, "material"), line("Charge adjustment", 1, "hr", 95, "labor")]),
    item("hvac", "airflow-blower-motor", "Airflow", "The blower motor is noisy and weak, or has stopped.",
      "Test the motor and its capacitor, and replace the motor if it fails. Confirm the new motor is wired to the correct speed tap.", "medium",
      [line("Blower motor", 1, "each", 320, "material"), line("Motor replacement", 2, "hr", 95, "labor")]),
  ],

  electricians: [
    item("electricians", "panel-tripping-breaker", "Panels", "A circuit breaker trips repeatedly under normal use.",
      "Identify what is on the circuit and measure the load, then check for a loose connection or a failing breaker. Repair the wiring or replace the breaker once the cause is confirmed.", "high",
      [line("Circuit breaker", 1, "each", 40, "material"), line("Service call", 1, "hr", 95, "labor")]),
    item("electricians", "outlet-dead", "Outlets & Switches", "An outlet has no power while other outlets in the room work.",
      "Check the outlet and its wiring for a loose or open connection, and test the upstream devices on the circuit. Re-terminate the wiring and replace the outlet if it is damaged.", "medium",
      [line("Outlet", 1, "each", 12, "material"), line("Outlet repair", 1, "hr", 95, "labor")]),
    item("electricians", "lighting-flicker", "Lighting", "Lights flicker or dim when other appliances start.",
      "Inspect the shared connections and panel for a loose neutral or undersized conductor. Tighten or replace the affected connections and re-test under load.", "medium",
      [line("Connection tightening and re-test", 2, "hr", 95, "labor")]),
    item("electricians", "panel-upgrade", "Panels", "The existing panel is full or shows signs of age, and new circuits cannot be added.",
      "Review the loads and the service size, then plan a panel replacement sized to the current and near-term needs. Obtain the required approvals before the swap.", "high",
      [line("Panel replacement", 8, "hr", 110, "labor")]),
    item("electricians", "room-no-power", "Troubleshooting", "Every outlet and light in one room is dead.",
      "Trace the circuit from the panel and find the failed device or open connection feeding the room. Repair the fault and verify the full circuit before closing up.", "medium",
      [line("Circuit trace and repair", 2, "hr", 95, "labor")]),
    item("electricians", "outlet-ungrounded", "Outlets & Switches", "The home has two-prong outlets with no ground path.",
      "Evaluate the wiring method and upgrade the affected outlets with approved protection. Label any outlets that remain ungrounded so the protection type is clear.", "medium",
      [line("Outlet", 4, "each", 12, "material"), line("Outlet upgrade", 2, "hr", 95, "labor")]),
    item("electricians", "switch-hot-discolored", "Outlets & Switches", "A switch face is warm or discolored, suggesting a loose connection.",
      "Remove the switch and inspect the terminations for heat damage, then re-terminate or replace the device. Confirm the circuit current matches the device rating.", "high",
      [line("Toggle switch", 1, "each", 8, "material"), line("Switch replacement", 1, "hr", 95, "labor")]),
    item("electricians", "lighting-outdoor-dead", "Lighting", "An exterior light does not come on.",
      "Check the fixture, photocell or timer, and the switch leg, and replace the failed component. Verify the fixture is weather-rated for its location.", "low",
      [line("Fixture and control check", 1, "hr", 95, "labor")]),
  ],

  landscaping: [
    item("landscaping", "maintenance-overgrown-beds", "Maintenance", "Planting beds are overgrown with weeds and volunteer growth.",
      "Hand-clear or spray the beds, remove the weeds at the roots, and cut back the intended plants to their shape. Apply a fresh mulch layer to slow regrowth.", "low",
      [line("Bed cleanup", 4, "hr", 55, "labor"), line("Mulch", 3, "yard", 45, "material")]),
    item("landscaping", "lawn-patchy", "Lawn", "The lawn has bare and thin patches across the yard.",
      "Prepare the bare areas, reseed or lay sod to match the existing turf, and water the repaired areas on a schedule until established.", "medium",
      [line("Sod", 1, "pallet", 300, "material"), line("Sod installation", 6, "hr", 55, "labor")]),
    item("landscaping", "irrigation-zone-dead", "Irrigation", "One irrigation zone does not come on with the timer.",
      "Test the zone valve and wiring, and replace the failed solenoid or valve as needed. Re-run the zone and confirm the heads cover as set.", "medium",
      [line("Irrigation repair", 1, "service", 120, "labor")]),
    item("landscaping", "irrigation-broken-head", "Irrigation", "A sprinkler head is broken or spraying into the street.",
      "Replace the head with a matching model and re-adjust the arc and radius. Check the zone's pressure so the new head does not mist.", "low",
      [line("Spray head", 1, "each", 12, "material"), line("Head replacement", 1, "hr", 55, "labor")]),
    item("landscaping", "drainage-standing-water", "Drainage", "Water pools in the yard after rain.",
      "Identify the low spot and its outflow path, then regrade or add a catch basin and pipe to move the water away. Confirm the outlet discharges to a suitable area.", "medium",
      [line("Drainage install", 8, "hr", 65, "labor")]),
    item("landscaping", "trees-limb-over-roof", "Trees", "A limb hangs over the roof and drops debris into the gutters.",
      "Remove the overhanging limb back to a sound branch collar and clear the gutter below. Haul away the cut material.", "medium",
      [line("Limb removal", 2, "hr", 65, "labor")]),
    item("landscaping", "maintenance-hedge-trim", "Maintenance", "Hedges have outgrown their shape and the clippings remain from the last cut.",
      "Trim the hedges to the agreed profile and rake or blow the clippings clean. Haul away the green waste.", "low",
      [line("Hedge trim and cleanup", 3, "hr", 55, "labor")]),
  ],

  cleaning: [
    item("cleaning", "recurring-standard-clean", "Recurring", "The home needs a full routine clean throughout.",
      "Clean all rooms to the standard checklist — dusting, floors, kitchen, and baths — using the client's preferred products where noted. Empty all interior trash on the way out.", "low",
      [line("Standard clean — medium space", 1, "service", 180, "labor")]),
    item("cleaning", "deep-clean-kitchen", "Deep Clean", "The kitchen has built-up grease on cabinets and appliances.",
      "Degrease the cabinet faces, backsplash, and appliance exteriors, then clean the oven interior and the floor edges. Polish the surfaces after degreasing.", "medium",
      [line("Kitchen deep clean", 3, "hr", 45, "labor")]),
    item("cleaning", "moveout-clean", "Move In / Out", "A vacant unit needs a full clean before the next tenant.",
      "Clean every room including the inside of cabinets, closets, and appliances. Finish with floors and baseboards so the unit is ready for walkthrough.", "medium",
      [line("Move-out clean — large space", 1, "service", 350, "labor")]),
    item("cleaning", "deep-clean-bathroom", "Deep Clean", "Shower tile and grout have soap scum and mineral buildup.",
      "Apply a tile-safe cleaner, scrub the tile and grout lines, and rinse thoroughly. Clear the drain of hair so the shower drains freely.", "low",
      [line("Bathroom deep clean", 2, "hr", 45, "labor")]),
    item("cleaning", "specialty-construction-dust", "Specialty", "Renovation dust covers surfaces throughout the home.",
      "Dry-wipe walls and ceilings, then clean fixtures, floors, and vents in order from top to bottom. Finish with a final floor pass so the dust does not resettle.", "medium",
      [line("Post-construction clean", 1, "service", 300, "labor")]),
    item("cleaning", "specialty-interior-windows", "Specialty", "Interior windows have streaks and handprints.",
      "Clean each pane with a streak-free method and wipe the sills and tracks. Polish the glass after the frames are dry.", "low",
      [line("Interior window cleaning", 2, "hr", 45, "labor")]),
  ],

  "general-contractors": [
    item("general-contractors", "interior-drywall-cracks", "Interior", "Cracks have opened in the drywall at corners and seams.",
      "Check whether the cracks are cosmetic or movement-related, then tape, mud, and re-texture the affected seams. Prime and paint the repaired areas to match.", "medium",
      [line("Drywall repair", 2, "hr", 65, "labor")]),
    item("general-contractors", "carpentry-sticking-door", "Carpentry", "An interior door rubs or sticks in its frame.",
      "Locate the bind, adjust the hinges or plane the door edge, and re-check the latch alignment. Confirm the door swings freely and latches cleanly.", "low",
      [line("Door adjustment", 1, "hr", 65, "labor")]),
    item("general-contractors", "exterior-rotted-trim", "Exterior", "Exterior trim is soft or rotted in places.",
      "Remove the damaged trim, check the sheathing behind it, and install primed replacement trim. Caulk and paint the new work to match.", "medium",
      [line("Trim board", 3, "each", 18, "material"), line("Trim replacement", 4, "hr", 65, "labor")]),
    item("general-contractors", "interior-floor-squeaks", "Interior", "The floor squeaks in several traffic areas.",
      "Locate the loose subfloor fasteners and re-secure them through the finished floor where possible. Test each area by walking it before cleanup.", "low",
      [line("Squeak repair", 2, "hr", 65, "labor")]),
    item("general-contractors", "interior-ceiling-stain", "Interior", "A ceiling shows old water stains with no active leak.",
      "Confirm the source is dry, seal the stain with a stain-blocking primer, and repaint the ceiling. Note the area so any future recurrence is easy to compare.", "low",
      [line("Stain seal and repaint", 3, "hr", 65, "labor")]),
    item("general-contractors", "carpentry-cabinet-hinge", "Carpentry", "A cabinet door hangs crooked or will not close.",
      "Re-tighten or replace the hinges, and adjust the door position so the reveal is even. Confirm the door opens and closes without rubbing.", "low",
      [line("Hinge repair", 1, "hr", 65, "labor")]),
    item("general-contractors", "exterior-deck-board", "Exterior", "A deck board is cracked or rotten.",
      "Remove the damaged board, check the joists beneath it, and fasten a matching replacement. Sand any rough edges flush with the neighboring boards.", "medium",
      [line("Deck board", 2, "each", 22, "material"), line("Deck repair", 2, "hr", 65, "labor")]),
  ],

  "appliance-repair": [
    item("appliance-repair", "laundry-washer-not-draining", "Laundry", "The washer fills and agitates but will not drain.",
      "Check the drain hose and pump for an obstruction, then test the pump and lid switch. Clear the blockage or replace the failed part and run a drain cycle to confirm.", "medium",
      [line("Diagnostic visit", 1, "service", 85, "labor")]),
    item("appliance-repair", "kitchen-fridge-not-cooling", "Kitchen", "The refrigerator runs but both sections are warm.",
      "Check the condenser fan, coils, and door seals, then test the compressor start components. Replace the failed part and verify temperatures come down.", "high",
      [line("Diagnostic visit", 1, "service", 85, "labor"), line("Start relay", 1, "each", 40, "material")]),
    item("appliance-repair", "kitchen-oven-not-heating", "Kitchen", "The oven bake element or igniter no longer heats.",
      "Test the heating element or igniter and the associated control, and replace the failed part. Confirm the oven reaches and holds the set temperature.", "medium",
      [line("Bake element", 1, "each", 65, "material"), line("Element replacement", 1, "hr", 85, "labor")]),
    item("appliance-repair", "kitchen-dishwasher-residue", "Kitchen", "Dishes come out with film or food residue.",
      "Inspect the spray arms, filter, and detergent dispenser, and clear any blockages. Test the water temperature at the tub and re-run a full cycle.", "low",
      [line("Service visit", 1, "service", 85, "labor")]),
    item("appliance-repair", "laundry-dryer-no-heat", "Laundry", "The dryer tumbles but produces no heat.",
      "Check the thermal fuse, heating element, and vent path, and replace the failed part. Confirm the vent is clear so the new parts run within normal temperatures.", "medium",
      [line("Heating element", 1, "each", 70, "material"), line("Dryer repair", 1, "hr", 85, "labor")]),
    item("appliance-repair", "kitchen-disposal-jammed", "Kitchen", "The disposal hums but does not turn.",
      "Clear the jam at the grind chamber, reset the overload switch, and confirm the disposal spins freely. Test with water running.", "low",
      [line("Service visit", 1, "service", 85, "labor")]),
  ],

  "junk-removal": [
    item("junk-removal", "pickup-single-item", "Pickups", "The client needs one large item hauled away.",
      "Confirm the item and access path, load it onto the truck, and haul it to the appropriate disposal or donation point. Sweep the pickup area before leaving.", "low",
      [line("Single item pickup", 1, "load", 150, "labor")]),
    item("junk-removal", "cleanout-garage", "Cleanouts", "The garage is full of mixed junk to be cleared.",
      "Sort the contents into keep, donate, and dispose, then load and haul the removal pile. Sweep the cleared floor and confirm the keep items stay organized.", "medium",
      [line("Garage cleanout", 1, "load", 350, "labor")]),
    item("junk-removal", "cleanout-yard-debris", "Cleanouts", "Brush and yard debris are piled for removal.",
      "Load the debris and haul it to a green-waste facility. Rake the loading area clean after pickup.", "low",
      [line("Yard debris load", 1, "load", 200, "labor")]),
    item("junk-removal", "cleanout-estate", "Cleanouts", "An estate requires a full clear-out with items sorted for donation.",
      "Work room by room, separating donation, disposal, and anything the family is keeping. Provide the donation receipt from the receiving organization after the drop-off.", "medium",
      [line("Estate cleanout", 1, "service", 800, "labor")]),
    item("junk-removal", "cleanout-construction-debris", "Cleanouts", "Remodel debris is piled in the yard or garage.",
      "Load the debris by material type where possible and haul it to the proper facility. Sweep the loading area clean.", "medium",
      [line("Debris haul", 1, "load", 300, "labor")]),
    item("junk-removal", "pickup-old-appliance", "Pickups", "An old appliance is disconnected and ready to remove.",
      "Maneuver the appliance out without damaging the floors or doorways, and take it to an appliance recycling point. Confirm the removal path is clear before starting.", "low",
      [line("Appliance removal", 1, "each", 85, "labor")]),
  ],

  // Vertical without the "jobs" module — the Library tab never shows for them,
  // so an empty catalog is the only honest declaration.
  dental: [],
  "care-homes": [],
  "property-management": [],
  childcare: [],
  daycares: [],
};

/**
 * Pure merge used inside a Firestore transaction (POST /api/company/work-catalog/starter).
 *  - never duplicates (skips any starter id already in the tenant's items),
 *  - never re-adds a starter item whose id is in starterKitImported (a deleted
 *    one stays deleted),
 *  - never overwrites tenant edits (an existing item is left byte-for-byte as
 *    the tenant saved it),
 *  - stamps each newly added item with the import time.
 */
export function mergeWorkStarter(
  existing: WorkCatalog,
  starterItems: WorkCatalogItem[],
  now: number
): { catalog: WorkCatalog; added: number } {
  const imported = [...(existing.starterKitImported ?? [])];
  const items = [...(existing.items ?? [])];
  let added = 0;
  for (const starter of starterItems) {
    if (imported.includes(starter.itemId)) continue;
    imported.push(starter.itemId);
    if (items.some((saved) => saved.itemId === starter.itemId)) continue;
    items.push({ ...starter, createdAt: now });
    added++;
  }
  const catalog: WorkCatalog = { ...existing, items, starterKitImported: imported };
  if (added > 0) catalog.updatedAt = now;
  return { catalog, added };
}

/** The server picks the kit from the tenant's industry — never from client input. */
export function workCatalogStarterFor(industry: unknown): WorkCatalogItem[] | null {
  return typeof industry === "string" && Object.prototype.hasOwnProperty.call(WORK_CATALOG_STARTER, industry)
    ? WORK_CATALOG_STARTER[industry as VerticalId]
    : null;
}

/** Kept next to the kit record so a new vertical cannot omit its declaration. */
export function workCatalogHasStarter(industry: VerticalId): boolean {
  const disabled = VERTICAL_TEMPLATES[industry].disabledModules.includes("jobs");
  return disabled ? WORK_CATALOG_STARTER[industry].length === 0 : WORK_CATALOG_STARTER[industry].length > 0;
}
