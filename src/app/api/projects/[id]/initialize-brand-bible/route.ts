import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

const CHARACTERS = [
  {
    name: "Daniel",
    role: "Father · central family character",
    canonical_description: "Daniel is a 38-year-old man with short salt-and-pepper beard, warm brown eyes and a sharp jawline. His face is mature and expressive, with natural skin texture. His default outfit is a navy blue henley shirt. Preserve his facial proportions, beard shape, hairline and wardrobe across scenes.",
    visual_traits: { age_range: "38 years old", skin_tone: "Warm medium-brown complexion", hair: "Short dark hair with subtle salt-and-pepper at the temples", eyes: "Warm brown", build: "Adult male, average athletic build", facial_features: "Short salt-and-pepper beard, sharp jawline, warm brown eyes", signature_details: "Neatly maintained short beard", colour_palette: "Navy, charcoal, warm neutrals" },
    wardrobe: ["Default: navy blue henley shirt with dark neutral trousers", "Outdoor alternate: practical dark jacket over the same navy henley"],
    voice_profile: { provider: "edge-tts", edge_tts_voice: "en-US-ChristopherNeural", kokoro_voice_id: "am_michael", notes: "Warm adult male voice, grounded, calm, natural conversational American English." },
    continuity_notes: "Keep the same face, beard length and shape, hairline, eye colour and body proportions. Default navy henley remains unchanged unless the screenplay explicitly establishes a wardrobe change."
  },
  {
    name: "Grace",
    role: "Mother · emotional anchor of the family",
    canonical_description: "Grace is a 35-year-old woman with shoulder-length wavy chestnut hair, hazel eyes and a gentle smile. She wears a cream knitted sweater as her default outfit. Her appearance is warm, natural and expressive, with realistic skin texture.",
    visual_traits: { age_range: "35 years old", skin_tone: "Light-to-medium warm complexion", hair: "Shoulder-length wavy chestnut hair", eyes: "Hazel", build: "Adult woman, natural average build", facial_features: "Gentle smile, soft expressive features, hazel eyes", signature_details: "Shoulder-length chestnut waves", colour_palette: "Cream, chestnut, soft earth tones" },
    wardrobe: ["Default: cream knitted sweater with understated neutral trousers", "Home alternate: soft beige cardigan over a neutral top"],
    voice_profile: { provider: "edge-tts", edge_tts_voice: "en-US-JennyNeural", kokoro_voice_id: "af_heart", notes: "Warm adult female voice, reassuring and expressive, natural conversational American English." },
    continuity_notes: "Preserve the same face, hazel eyes, chestnut shoulder-length waves and natural body proportions. Keep the cream knitted sweater for default home scenes unless a scene explicitly changes wardrobe."
  },
  {
    name: "Lily",
    role: "Daughter · curious and emotionally perceptive",
    canonical_description: "Lily is a 10-year-old girl with braided dark brown hair and bright curious eyes. Her signature outfit is denim overalls over a yellow T-shirt. Depict her age-appropriately as a child, with childlike proportions and natural expressions.",
    visual_traits: { age_range: "10 years old", skin_tone: "Warm medium complexion", hair: "Dark brown hair in neat braids", eyes: "Bright brown eyes", build: "Age-appropriate child proportions", facial_features: "Youthful childlike face, curious expressive eyes", signature_details: "Neat braids and denim overalls", colour_palette: "Denim blue, yellow, warm neutrals" },
    wardrobe: ["Default: blue denim overalls over a yellow T-shirt and practical trainers", "Cold-weather alternate: simple cardigan over the yellow T-shirt, denim overalls retained"],
    voice_profile: { provider: "edge-tts", edge_tts_voice: "en-US-AnaNeural", kokoro_voice_id: "af_sarah", notes: "Child-appropriate performance direction. Kokoro fallback is an adult preset and will not sound like a child; use Edge voice or approved human-recorded audio for Lily." },
    continuity_notes: "Maintain age-appropriate child proportions and the same braid style. Keep denim overalls and yellow T-shirt as the default outfit. Do not age her up or apply adult styling."
  },
  {
    name: "Michael",
    role: "Mysterious returning figure",
    canonical_description: "Michael is a mysterious 42-year-old man with glasses, slicked-back dark hair and an intense, controlled expression. His signature outfit is a charcoal trench coat. His presence should feel restrained and enigmatic rather than exaggerated.",
    visual_traits: { age_range: "42 years old", skin_tone: "Medium neutral complexion", hair: "Dark hair slicked back", eyes: "Dark eyes behind understated glasses", build: "Adult male, lean-to-average build", facial_features: "Glasses, defined features, intense controlled expression", signature_details: "Glasses and charcoal trench coat", colour_palette: "Charcoal, black, muted cool neutrals" },
    wardrobe: ["Default: charcoal trench coat over a dark shirt and neutral trousers"],
    voice_profile: { provider: "edge-tts", edge_tts_voice: "en-US-GuyNeural", kokoro_voice_id: "bm_george", notes: "Low, measured adult male delivery, controlled pace, restrained emotion." },
    continuity_notes: "Preserve the same glasses, slicked-back hairstyle, facial structure and charcoal trench coat. Keep his expression subtle and controlled; avoid changing his apparent age."
  },
  {
    name: "Milo",
    role: "Family pet · golden retriever",
    canonical_description: "Milo is a fluffy golden retriever dog with thick golden fur, expressive friendly eyes and a distinctive red leather collar. Preserve his breed, coat colour, head shape, fur length and collar across every scene.",
    visual_traits: { age_range: "Adult family dog", skin_tone: "Golden coat", hair: "Thick, fluffy golden retriever fur", eyes: "Warm expressive dark-brown eyes", build: "Healthy adult golden retriever", facial_features: "Friendly retriever muzzle and soft expressive eyes", signature_details: "Red leather collar", colour_palette: "Golden honey, cream, red collar" },
    wardrobe: ["Signature accessory: red leather collar; no human clothing unless the story specifically requires a costume"],
    voice_profile: { notes: "Milo does not speak human dialogue. Use natural dog barks, whines, panting and movement sounds as sound effects. No synthetic human voice." },
    continuity_notes: "Milo must remain recognisably the same golden retriever: same golden coat, fur length, head shape, body proportions and red leather collar. Never turn him into another breed or a humanoid character."
  },
  {
    name: "Narrator",
    role: "Voice-over narrator",
    canonical_description: "Off-screen narrator. No visible character design unless a story explicitly introduces one.",
    visual_traits: {},
    wardrobe: [],
    voice_profile: { provider: "edge-tts", edge_tts_voice: "en-US-SteffanNeural", kokoro_voice_id: "am_michael", notes: "Clear, intimate storyteller delivery with controlled pacing and cinematic restraint." },
    continuity_notes: "Narration is voice-over only unless an episode explicitly establishes an on-screen narrator."
  }
];

const LOCATIONS = [
  {
    name: "Bennett Living Room",
    description: "The recurring Bennett family living room: a beige fabric sofa, warm wooden floors, a large sunlit window and indoor plants. Keep the room layout, window position, sofa, floor tone and plant placement consistent. Natural warm daylight for daytime scenes; practical lamps and motivated warm lighting for evening scenes.",
    continuity_notes: "Keep the beige sofa, wooden floors, large window and indoor plants in fixed positions. Do not redesign the room between shots. Lighting may change with time of day but the architecture and furniture layout remain stable."
  },
  {
    name: "Bennett Kitchen",
    description: "The recurring modern-rustic Bennett kitchen: marble island, copper pots hanging above the work area and morning sunlight streaming through glass doors. Maintain the same kitchen layout, countertop material, copper cookware and daylight direction.",
    continuity_notes: "Preserve the marble island, hanging copper pots, glass doors and consistent cabinetry layout. Morning light enters through the glass doors; night scenes use motivated kitchen practicals without changing the set."
  },
  {
    name: "Bennett Porch",
    description: "The Bennett family porch, a warm and familiar exterior threshold between the home and garden. Use natural timber, restrained family-home details and a believable connection to the living room and kitchen architecture.",
    continuity_notes: "Keep porch geometry, door/window relationships and exterior materials consistent with the Bennett house. Avoid changing the house facade between episodes."
  }
];

const PRODUCTS = [
  { id: "GROOMING_BRUSH", name: "NELLWICK Pet Grooming Brush", description: "A sleek ergonomic matte-white pet grooming brush. Use the supplied actual product photography as the source of truth; never invent button placement, bristle pattern, packaging or logos.", placement_rule: "Only place it naturally in pet-care scenes where grooming makes sense. Do not interrupt the main story to advertise it." },
  { id: "HAIR_GLOVE", name: "NELLWICK Pet Hair Removal Glove", description: "A black-and-teal silicone pet hair removal glove. Use the supplied actual product photography as the source of truth; never invent logos, packaging or construction details.", placement_rule: "Feature it naturally during sofa, clothing or upholstery cleanup scenes. Product benefit claims must match verified product specifications." }
];

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects").select("id,name,settings").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const [charactersResult, locationsResult] = await Promise.all([
    supabase.from("characters").select("id,name").eq("project_id", id).eq("owner_id", user.id),
    supabase.from("locations").select("id,name").eq("project_id", id).eq("owner_id", user.id),
  ]);
  if (charactersResult.error) return NextResponse.json({ error: charactersResult.error.message }, { status: 500 });
  if (locationsResult.error) return NextResponse.json({ error: locationsResult.error.message }, { status: 500 });

  const existingCharacters = new Set((charactersResult.data || []).map((item) => item.name.trim().toLowerCase()));
  const existingLocations = new Set((locationsResult.data || []).map((item) => item.name.trim().toLowerCase()));
  const toCreateCharacters = CHARACTERS.filter((item) => !existingCharacters.has(item.name.toLowerCase()));
  const toCreateLocations = LOCATIONS.filter((item) => !existingLocations.has(item.name.toLowerCase()));

  if (toCreateCharacters.length) {
    const { error } = await supabase.from("characters").insert(toCreateCharacters.map((item) => ({
      owner_id: user.id, project_id: id, ...item
    })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toCreateLocations.length) {
    const { error } = await supabase.from("locations").insert(toCreateLocations.map((item) => ({
      owner_id: user.id, project_id: id, ...item
    })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentSettings = project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
    ? project.settings as Record<string, Json>
    : {};
  const brandSettings: Json = {
    brand_name: "NELLWICK",
    content_brand: "NELLWICK ORIGINALS",
    visual_style: "Cinematic realism, natural skin texture, realistic animal anatomy, motivated practical lighting, restrained film colour, intentional camera language.",
    products: PRODUCTS,
    product_placement_rule: "The entertainment story comes first. Integrate products only where they naturally belong. Keep direct product demonstrations separate from story episodes.",
    initialized_at: new Date().toISOString(),
    version: 1
  };
  const { error: settingsError } = await supabase.from("projects")
    .update({ settings: { ...currentSettings, nellwick_brand_bible: brandSettings } })
    .eq("id", id).eq("owner_id", user.id);
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    created_characters: toCreateCharacters.length,
    existing_characters: existingCharacters.size,
    created_locations: toCreateLocations.length,
    existing_locations: existingLocations.size,
    products_saved: PRODUCTS.length,
    note: "Existing profiles were preserved. Missing NELLWICK cast and locations were added to this project."
  });
}
