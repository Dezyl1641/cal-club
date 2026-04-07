# V4 Pipeline: Quantity Redesign & Composite Dish Decomposition

**Date:** 2026-04-07
**Branch:** nj/meal-db2
**Authors:** Naman Jaiswal, Claude

---

## 1. displayQuantity / measureQuantity Redesign

### Problem
The V4 Gemini prompt returned quantity as a free-form string (e.g., `"1 small bowl"`), but the save function expected a structured object `{ value, unit }`. Every item was falling through to the default: `value: 1, unit: "serving"`. Users saw "1 serving" for everything.

### Solution
Introduced two distinct quantity fields:

- **displayQuantity** `{ value, unit }` — User-friendly quantity shown in the UI. Units are restricted to meaningful types: cups, rotis, slices, pieces, small bowl, medium bowl, tbsp, glass, etc. "serving" and "plate" are explicitly banned.
- **measureQuantity** `{ value, unit }` — Actual weight (g) or volume (ml) used for nutrition math. Unit is strictly `"g"` or `"ml"`.

### ml Support
Added ml support for beverages and liquids. A density conversion table in `nutritionLookupServiceV4.js` handles ml-to-grams conversion for nutrition calculations:
- Water-based liquids (juice, buttermilk, lassi): 1ml = 1g
- Milk: 1ml = 1.03g
- Oil/ghee: 1ml = 0.92g
- Honey: 1ml = 1.42g

### Files Changed
- `models/schemas/Meal.js` — Renamed `quantity` to `displayQuantity`, `quantityAlternate` to `measureQuantity`, removed flat `grams` field
- `services/aiService.js` — Updated V4 prompt output schema and `saveMealDataForV4`
- `services/nutritionLookupServiceV4.js` — Reads `measureQuantity`, converts ml to grams
- `utils/mealFormatter.js` — Outputs both quantity types to client
- `controllers/mealController.js` — All edit/clone/add flows updated
- `services/mealImpactService.js` — Reads from `displayQuantity`

### Migration
V1/V2/V3 endpoints are not maintained (app only uses V4, not launched yet). No backward-compat needed.

---

## 2. Composite Dish Decomposition via LLM

### Problem
The V4 pipeline treated composite dishes (biryani, chicken curry, chicken salad) as single items, looking up a generic per-100g value. This was inaccurate because:
- "Chicken Salad" at 290 cal/100g doesn't distinguish between a mayo-heavy American salad and a light vinaigrette green salad
- The ghee/oil absorbed during cooking was invisible and unaccounted for
- Curated composite mappings in MongoDB only existed for a handful of dishes (biryani variants, a few curries)

### Architecture Decision: visibleComponents

The key insight: Step 1 (Gemini with the image) can **see** what's in a composite dish, but shouldn't estimate per-component weights. Step 2 (LLM text-only) can estimate component ratios from recipe knowledge, but can't see the image.

Solution: Step 1 outputs a `visibleComponents` array describing what it sees (e.g., `["leafy greens", "diced chicken pieces", "light vinaigrette"]`). Step 2 uses this visual context to pick the right decomposition — not a generic recipe assumption.

This prevents the "Chicken Salad = 30% mayonnaise" problem. When the LLM knows it's greens + chicken + vinaigrette, it gives 8% dressing instead of 30% mayo.

### Architecture Decision: gravyType

For curry-based composites, the ratio of protein to gravy varies dramatically:
- Dry bhuna: protein is 60-70% (meat coated in dry masala)
- Semi-gravy: protein is 50-60% (thick sauce, not submerged)
- Liquid gravy: protein is 30-40% (submerged in sauce)

Step 1 classifies `gravyType` as `"dry"`, `"semi"`, or `"gravy"` based on visual cues (is liquid pooling on the plate?). Step 2 uses this to set protein-to-gravy ratios.

### Architecture Decision: Fixed Cooking Fat

Oil/ghee absorbed during cooking doesn't scale with portion size (a biryani made for 4 people uses ~the same ghee whether you serve 300g or 500g). Instead of a percentage-based approach (which gave 32g ghee for a 400g biryani — unrealistic), the decomposition prompt uses a fixed amount:
- Rice dishes (biryani, pulao, fried rice): 1 tbsp (14g)
- Curries/gravies: fat is already part of the gravy component — no separate oil
- Deep-fried items: oil is in the per-100g values — no separate oil
- Salad dressings: a visible component with its own nutrition — not "oil"

### Architecture Decision: No Curated Mapping Lookup

We initially had curated composite mappings in `composite_dish_mappings` (e.g., Chicken Biryani = 35% chicken + 65% rice). After testing, the LLM decomposition with `visibleComponents` and `gravyType` produced more accurate results because:
1. It catches ingredients the curated mapping misses (potato in chicken curry, ghee in biryani)
2. It adapts to what's actually in the photo (mayo vs vinaigrette salad)
3. It responds to gravyType (dry vs gravy changes the protein ratio)

Decision: **Always use LLM decomposition. Never read curated mappings for lookup.** Instead, cache every LLM decomposition to `composite_dish_mappings` with `dataSource: 'LLM'`, `reviewed: false` for future review. The collection becomes a review queue, not a lookup table.

### Composite Definition (What Gets Decomposed)

Not every multi-ingredient dish is composite. Strict rule:

**Composite** (two major food groups mixed inseparably):
- Protein + carb base: biryani, fried rice with chicken, pasta with meat sauce, burrito bowl
- Protein + gravy: chicken curry, paneer butter masala
- Salad with protein + dressing: chicken salad, Caesar salad

**NOT composite** (single food group + seasoning):
- Dal, sambar, rasam, raita, curd, salan, chutney, soup
- Dal fry (just lentils + tadka), cucumber raita (yogurt + garnish), jeera rice (rice + cumin)
- Pakora, samosa, dosa, idli, roti, bread
- Beverages: lassi, buttermilk, smoothie

These go straight to DB lookup as single items (where curated entries match well).

### Files Changed
- `models/schemas/CompositeDishMapping.js` — Added `reviewed`, `dataSource`, `visibleComponents`, `gravyType`, `totalGrams`, `llmModel`, `llmGeneratedAt`
- `services/nutritionLookupServiceV4.js` — Removed curated mapping lookup, added `llmDecomposeComposite()` with visibleComponents/gravyType support, added `cacheLLMDecomposition()`, returns token usage
- `services/aiService.js` — Updated V4 prompt with composite definition, visibleComponents, gravyType classification, timing logs

---

## 3. Token Tracking

### Problem
Only Step 1 (vision) tokens were tracked. Decomposition and batch nutrition LLM calls had no token visibility.

### Solution
All three LLM calls now track input/output tokens:

```
tokens: {
  step1:          { input, output }   // Gemini vision (image → items)
  decomposition:  { input, output }   // Gemini text (dish → components)
  batchNutrition: { input, output }   // Gemini text (per-100g values)
  total:          { input, output }   // Sum of all
}
```

Stored in the Meal document, logged to console, and returned in the API response.

### Typical Token Usage
- No composites, all DB hits: ~2,800 tokens (Step 1 only)
- 1 composite + DB misses: ~4,000-4,600 tokens
- Multiple composites: scales linearly with decomposition calls

### Files Changed
- `models/schemas/Meal.js` — Replaced `inputTokens`/`outputTokens` with structured `tokens` object
- `services/nutritionLookupServiceV4.js` — Returns tokens from decomposition and batch nutrition
- `services/aiService.js` — Collects all tokens, passes to save, logs summary

---

## 4. Timing

Pipeline timing is now logged at each step:

```
[V4] Step 1 complete — 5 items identified [10946ms]
[LLM Decompose] "Chicken Curry" decomposed into 5 components [10058ms]
[V4] Step 2 complete — 9 items processed [27665ms]
[V4] pipeline complete [Total: 38880ms | Step1: 10946ms | Step2: 27665ms]
```

### Typical Latency
- No composites, all DB hits: ~10-15s (Step 1 + DB lookup)
- 1 composite + DB misses: ~30-50s (3 sequential LLM calls)
- Improves over time as food_items DB fills up (fewer batch nutrition calls)
