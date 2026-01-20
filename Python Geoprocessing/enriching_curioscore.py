
SUPABASE_URL = "WWW"
SUPABASE_KEY = 'XXX'
SUPABASE_TABLE = "places"
SUPABASE_PAGE_SIZE = 1000

OPENROUTER_API_KEY = 'YYY'

OPENROUTER_MODEL = 'mistralai/devstral-2512:free'
#OPENROUTER_MODEL = 'qwen/qwen3-coder:free'
#OPENROUTER_MODEL = 'xiaomi/mimo-v2-flash:free'
#OPENROUTER_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free'
#OPENROUTER_MODEL = 'google/gemma-3-27b-it:free'
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

OPENROUTER_WEB_MAX_RESULTS = 6
OPENROUTER_TEMPERATURE = 0.5
OPENROUTER_TIMEOUT_S = 180
OPENROUTER_MAX_RETRIES = 6


import os
import json
import time
from typing import Any, Dict, List, Tuple
from datetime import datetime
import requests
from supabase import create_client

# -----------------------------
# 1. CONFIGURATION
# -----------------------------
SUPABASE_TABLE = "places"
SUPABASE_PAGE_SIZE = 1000

def get_config(name):
    val = os.getenv(name)
    if val: return val
    if name in globals(): return globals()[name]
    return None

# Credentials
url = get_config("SUPABASE_URL")
key = get_config("SUPABASE_KEY")
or_key = get_config("OPENROUTER_API_KEY")
or_model = get_config("OPENROUTER_MODEL")

if not url or not key:
    raise ValueError("CRITICAL: SUPABASE_URL or SUPABASE_KEY is missing.")

# Initialize Supabase
if "supabase" not in globals():
    supabase = create_client(url, key)
else:
    supabase = globals()["supabase"]

# OpenRouter Config
OPENROUTER_API_KEY = or_key
OPENROUTER_MODEL = or_model
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# -----------------------------
# 2. FETCHERS
# -----------------------------
def fetch_curio_text_for_classification(curio_id: str) -> dict:
    """
    Fetches just the fields needed for classification: 
    name, inscription, detail-overview.
    """
    resp = (
        supabase.table(SUPABASE_TABLE)
        .select("curio-id, name, inscription, detail-overview")
        .eq("curio-id", curio_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise RuntimeError(f"No match for {curio_id}")
    return rows[0]

def fetch_curio_ids_in_box(box_id: int) -> List[str]:
    """Simple fetcher for all curio-ids in a box."""
    curio_ids = []
    offset = 0
    while True:
        resp = (
            supabase.table(SUPABASE_TABLE)
            .select("curio-id")
            .eq("box-id", box_id)
            .range(offset, offset + SUPABASE_PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        for row in batch:
            if row.get("curio-id"):
                curio_ids.append(row["curio-id"])
        if len(batch) < SUPABASE_PAGE_SIZE:
            break
        offset += SUPABASE_PAGE_SIZE
    return list(dict.fromkeys(curio_ids))

# -----------------------------
# 3. LLM CLASSIFIER
# -----------------------------
def openrouter_classify_and_score(curio_data: dict) -> Tuple[dict, dict]:
    # Extract text content
    name = curio_data.get("name") or "Unknown"
    inscription = curio_data.get("inscription") or ""
    overview = curio_data.get("detail-overview") or ""

    # Skip empty entries to save cost
    if not overview or overview == "No information available":
        return {
            "curio-type": "Unknown",
            "curio-score": 0.0,
            "score-reason": "No detail-overview available to score."
        }, {}

    instruction = {
        "task": "Evaluate this London location for inclusion in a curated 'Hidden London' walking tour.",
        "context": f"Name: {name}\nInscription: {inscription}\nDescription: {overview}",
        "persona": "You are a cynical yet passionate London Blue Badge Guide creating a walking tour for discerning explorers. You ignore the obvious (Big Ben) and the boring (generic shops/galleries). You value street-level accessibility, bizarre backstories, and visual oddities. You punish places that are just 'nice buildings' or require an entry ticket.",
        "requirements": [
            "curio-type: Choose ONE from this strict list: 'Memorial & Statue', 'Historic Site', 'Landmark Building', 'Public Art', 'Street Furniture', 'Green Space', 'Commercial & Culture', 'Infrastructure'.",
            
            "curio-score: Grade strictly from 0.0 to 10.0 using this rubric:\n"
            "- PENALIZE (-2 points): Museums, Art Galleries, Shops, Private Offices, or anything requiring payment/entry to see.\n"
            "- 0.0-3.9 (Skip): Standard street furniture, generic blue plaques for obscure people, modern commercial blocks, or local amenities with no story.\n"
            "- 4.0-5.9 (Filler): A decent local landmark (e.g., a standard Victorian pub, a local war memorial). Nice if you're passing, but don't divert.\n"
            "- 6.0-7.9 (Stop): A solid tour stop. Has a visual hook (e.g., a ghost sign, a weird bollard, a specific battle site) and a bite-sized story.\n"
            "- 8.0-10.0 (Highlight): 'Rare Air'. The kind of weird history that makes people stop and take a photo. Truly unique, highly visible, and tells a quintessential London story.",
            
            "score-reason: A punchy, critical sentence justifying the score. Be honest if it's boring."
        ]
    }
    
    response_schema = {
        "name": "curio_scoring",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "curio-type": {"type": "string"},
                "curio-score": {"type": "number"},
                "score-reason": {"type": "string"},
            },
            "required": ["curio-type", "curio-score", "score-reason"],
            "additionalProperties": False
        }
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": OPENROUTER_MODEL,
        "temperature": 0.3, # Lower temp for consistent scoring
        "messages": [{"role": "user", "content": json.dumps(instruction)}],
        "response_format": {"type": "json_schema", "json_schema": response_schema},
    }

    try:
        r = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
        data = r.json()
        
        if "error" in data:
            raise RuntimeError(f"OpenRouter API Error: {data['error']}")
            
        choices = data.get("choices")
        if not choices:
             # Handle empty response gracefully
             return {"curio-type": "Error", "curio-score": 0.0, "score-reason": "No choices returned"}, {}
             
        content = choices[0]["message"]["content"]
        meta = {"usage": data.get("usage"), "cost": data.get("total_cost")}
        return json.loads(content), meta
    except Exception as e:
        print(f"LLM Error: {e}")
        return {"curio-type": "Error", "curio-score": 0.0, "score-reason": "LLM Failure"}, {}

# -----------------------------
# 4. BATCH RUNNER
# -----------------------------
def run_classification_for_box_range(
    box_start: int, 
    box_end: int, 
    outdir: str = "./curio-classifications", 
    continue_on_error: bool = True
) -> str:
    
    os.makedirs(outdir, exist_ok=True)
    filename = f"curio-classification-box-{box_start}-{box_end}.json"
    out_path = os.path.join(outdir, filename)

    combined = {
        "range": {"start": box_start, "end": box_end},
        "results": [],
        "failed": []
    }

    print(f"--- STARTING CLASSIFICATION RUN: {box_start} to {box_end} ---")

    for box_id in range(box_start, box_end + 1):
        try:
            # Get all curios in box
            curio_ids = fetch_curio_ids_in_box(box_id)
            if not curio_ids:
                 print(f"Box {box_id}: Empty (0 curios)")
                 continue

            print(f"Box {box_id}: found {len(curio_ids)} curios.")

            for cid in curio_ids:
                try:
                    # 1. Fetch Text
                    data = fetch_curio_text_for_classification(cid)
                    curio_name = data.get("name") or "Unknown Name"
                    
                    # 2. LLM Generate
                    result, meta = openrouter_classify_and_score(data)
                    
                    c_type = result.get("curio-type")
                    c_score = result.get("curio-score")
                    c_reason = result.get("score-reason")

                    # 3. Store Result
                    record = {
                        "box-id": box_id,
                        "curio-id": cid,
                        "curio-type": c_type,
                        "curio-score": c_score,
                        "score-reason": c_reason
                    }
                    combined["results"].append(record)
                    
                    # --- PRINT PROGRESS ---
                    # Format: Box | ID | Name | Type | Score | Reason
                    print(f"Box {box_id} | {cid} | '{curio_name}' | {c_type} | {c_score} | {c_reason}")
                    
                except Exception as e:
                    print(f"  FAILED {cid}: {e}")
                    combined["failed"].append({"curio-id": cid, "error": str(e)})
                    if not continue_on_error: raise e

        except Exception as e:
            print(f"Box {box_id} Critical Fail: {e}")
            if not continue_on_error: break

    # Write to file
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    print(f"--- DONE. Wrote {len(combined['results'])} classifications to {out_path} ---")
    return out_path

# -----------------------------
# 5. UPSERT HELPER
# -----------------------------
def upsert_classifications_from_file(json_path: str):
    """
    Reads the classification JSON and updates the places table.
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f).get("results", [])

    payload = []
    for r in data:
        if r.get("curio-id") and r.get("curio-type") and r.get("curio-type") != "Error":
            payload.append({
                "curio-id": r["curio-id"],
                "curio-type": r["curio-type"],
                "curio-score": r["curio-score"],
                "score-reason": r["score-reason"]
            })

    print(f"Upserting {len(payload)} classifications...")

    chunk_size = 200
    updated_count = 0
    
    for i in range(0, len(payload), chunk_size):
        batch = payload[i : i + chunk_size]
        try:
            # Upsert into places, matching on curio-id
            resp = supabase.table(SUPABASE_TABLE).upsert(batch, on_conflict="curio-id").execute()
            updated_count += len(resp.data or [])
        except Exception as e:
            print(f"Upsert Batch Error: {e}")

    return {"status": "complete", "updated": updated_count}
    
# -----------------------------
# EXECUTION BLOCK
# -----------------------------
if __name__ == "__main__":
    
    # 1. Define Range
    start_box = 3501
    end_box = 3999

    # 2. Run Classification (Generates the JSON file)
    # This returns the specific file path created (e.g., ./curio-classifications/curio-classification-box-3001-3900.json)
    generated_file_path = run_classification_for_box_range(
        start_box, 
        end_box, 
        outdir="./curio-classifications", 
        continue_on_error=True
    )

    print(f"\nProcessing complete. File generated at: {generated_file_path}")

    # upsert into Supabase (Places only for this task)
    print("--- Updating Places Table with Classifications ---")
    
    scoring_report = upsert_classifications_from_file(generated_file_path)
    
    print("Scoring Report:", json.dumps(scoring_report, indent=2))