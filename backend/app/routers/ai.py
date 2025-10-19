from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import os
import base64
import io
import json
import requests
from PIL import Image

from ..database import get_db
from .. import models
from .auth import get_current_user

try:
    from google.cloud import aiplatform
    from vertexai.generative_models import GenerativeModel, Part, GenerationConfig
    _VERTEX_AVAILABLE = True
except ImportError:
    _VERTEX_AVAILABLE = False

router = APIRouter(
    prefix="/api/ai",
    tags=["ai"],
    dependencies=[Depends(get_current_user)],
)


def _ensure_vertex_initialized() -> None:
    if not _VERTEX_AVAILABLE:
        raise HTTPException(status_code=500, detail="Vertex AI SDK not available on server")
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("VERTEX_LOCATION", "us-central1")
    if not project_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLOUD_PROJECT not configured")
    # Idempotent init
    aiplatform.init(project=project_id, location=location)


def _read_image_bytes(upload: UploadFile) -> bytes:
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"Empty image: {upload.filename}")
    return data


def _downscale_image(image_bytes: bytes, max_dim: int = 1024) -> tuple[bytes, str]:
    try:
        im = Image.open(io.BytesIO(image_bytes))
        im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, float(max_dim) / float(max(w, h)))
        if scale < 1.0:
            im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue(), "image/jpeg"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")


def _call_gemini_vision(image_bytes: bytes, mime_type: str, prompt: str) -> Dict[str, Any]:
    _ensure_vertex_initialized()
    try:
        model = GenerativeModel("gemini-2.5-flash")
        img_part = Part.from_data(mime_type=mime_type, data=image_bytes)
        config = GenerationConfig(response_mime_type="application/json")
        resp = model.generate_content([img_part, prompt], generation_config=config)
        return json.loads(resp.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API or JSON parse failed: {e}")

def _call_gemini_text(prompt: str) -> Dict[str, Any]:
    _ensure_vertex_initialized()
    try:
        model = GenerativeModel("gemini-2.5-flash")
        config = GenerationConfig(response_mime_type="application/json")
        resp = model.generate_content(prompt, generation_config=config)
        return json.loads(resp.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API or JSON parse failed: {e}")


@router.post("/analyze-asset", response_model=Dict[str, Any])
async def analyze_asset(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Analyze a selected image asset and return description and keywords"""
    image_bytes = _read_image_bytes(image)
    down_bytes, mime_type = _downscale_image(image_bytes, max_dim=1024)
    
    prompt = (
        "Analyze this image and provide:\n"
        "1. A detailed description (2-3 sentences)\n"
        "2. 5-10 relevant keywords for search/tagging\n"
        "3. Alt-text for accessibility (1 sentence)\n\n"
        "Return ONLY valid JSON in this exact format:\n"
        '{"description": "detailed description here", "keywords": ["keyword1", "keyword2", ...], "alt_text": "alt text here"}'
    )
    
    # Use the reliable helper function
    result = _call_gemini_vision(down_bytes, mime_type, prompt)
    
    try:
        if not all(key in result for key in ["description", "keywords", "alt_text"]):
            raise ValueError("Missing required fields in response")
        if not isinstance(result["keywords"], list):
            raise ValueError("Keywords must be an array")
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI response format invalid: {e}")


@router.post("/analyze-canvas", response_model=Dict[str, Any])
async def analyze_canvas(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Analyze entire canvas screenshot and return description and keywords"""
    image_bytes = _read_image_bytes(image)
    down_bytes, mime_type = _downscale_image(image_bytes, max_dim=1024)
    
    prompt = (
        "Analyze this canvas screenshot showing a design workspace. Provide:\n"
        "1. A comprehensive description of the overall design, layout, and visual elements\n"
        "2. 8-12 keywords that describe the design style, content, and mood\n"
        "3. Alt-text for the entire canvas\n\n"
        "Return ONLY valid JSON in this exact format:\n"
        '{"description": "comprehensive description here", "keywords": ["keyword1", "keyword2", ...], "alt_text": "alt text here"}'
    )
    
    result = _call_gemini_vision(down_bytes, mime_type, prompt)
    
    try:
        if not all(key in result for key in ["description", "keywords", "alt_text"]):
            raise ValueError("Missing required fields in response")
        if not isinstance(result["keywords"], list):
            raise ValueError("Keywords must be an array")
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI response format invalid: {e}")


@router.post("/color-palette", response_model=Dict[str, List[str]])
async def generate_color_palette(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Generate harmonious color palette from image using AI analysis"""
    image_bytes = _read_image_bytes(image)
    down_bytes, mime_type = _downscale_image(image_bytes, max_dim=512)
    
    prompt = (
        "Analyze the colors in this image and extract a harmonious palette of 6 colors. "
        "Focus on dominant colors, complementary colors, and accent colors that work well together. "
        "Return ONLY valid JSON in this exact format:\n"
        '{"colors": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"]}'
    )
    
    result = _call_gemini_vision(down_bytes, mime_type, prompt)
    
    try:
        colors = result.get("colors", [])
        if not isinstance(colors, list) or len(colors) < 5:
            raise ValueError("Invalid colors array in response")
        
        for color in colors:
            if not isinstance(color, str) or not color.startswith("#") or not (len(color) == 7 or len(color) == 4):
                raise ValueError(f"Invalid hex color format: {color}")
        
        return {"colors": colors}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI response format invalid: {e}")


@router.post("/asset-suggestions")
async def get_asset_suggestions(
    request: Dict[str, List[str]], 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    keywords = request.get("keywords", [])
    if not keywords or len(keywords) == 0:
        raise HTTPException(status_code=400, detail="Keywords are required")
    
    pexels_api_key = os.getenv("PEXELS_API_KEY")
    if not pexels_api_key:
        raise HTTPException(status_code=500, detail="Pexels API key not configured")
    
    query = " ".join(keywords[:5])
    per_page = 12
    
    try:
        headers = {"Authorization": pexels_api_key}
        params = {"query": query, "per_page": per_page, "orientation": "all"}
        
        response = requests.get(
            "https://api.pexels.com/v1/search",
            headers=headers,
            params=params,
            timeout=10
        )
        
        response.raise_for_status()
        
        data = response.json()
        photos = data.get("photos", [])
        
        suggestions = [
            {
                "id": photo["id"],
                "url": photo["src"]["medium"],
                "url_large": photo["src"]["large"],
                "alt": photo.get("alt", ""),
                "photographer": photo["photographer"],
                "photographer_url": photo["photographer_url"]
            }
            for photo in photos
        ]
        
        return {"suggestions": suggestions, "query": query}
        
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch asset suggestions: {e}")


@router.post("/generate-text", response_model=Dict[str, Any])
async def generate_text(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Generate project titles, briefs, or social media posts based on canvas analysis"""
    description = request.get("description", "")
    text_type = request.get("text_type", request.get("type", "titles"))  # titles, brief, social_media
    
    if not description:
        raise HTTPException(status_code=400, detail="Description is required")
    
    prompts = {
        "titles": f"Based on this design description: '{description}'\nGenerate 5 creative project title options. Return ONLY JSON: {{\"titles\": [\"Title 1\", \"Title 2\", ...]}}",
        "brief": f"Based on this design description: '{description}'\nWrite a creative brief (2-3 paragraphs) for this project. Return ONLY JSON: {{\"brief\": \"brief text here\"}}",
        "social_media": f"Based on this design description: '{description}'\nGenerate 3 short social media post captions. Return ONLY JSON: {{\"captions\": [\"Caption 1\", \"Caption 2\", \"Caption 3\"]}}"
    }
    
    if text_type not in prompts:
        raise HTTPException(status_code=400, detail="Invalid text type. Use: titles, brief, or social_media")
    
    return _call_gemini_text(prompts[text_type])


@router.post("/smart-groups", response_model=Dict[str, Any])
async def create_smart_groups(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Automatically group similar assets on canvas based on AI analysis"""
    assets = request.get("assets", [])  # List of {"id": "asset_id", "keywords": ["kw1", "kw2"]}
    
    if not assets or len(assets) < 2:
        raise HTTPException(status_code=400, detail="At least 2 assets required for grouping")
    
    asset_data = [
        f"Asset {asset['id']}: {', '.join(asset.get('keywords', []))}"
        for asset in assets
    ]
    
    prompt = (
        f"Analyze these canvas assets and their keywords:\n" + "\n".join(asset_data) + "\n\n"
        "Group them into logical categories based on similarity (e.g., 'Inspiration Photos', 'Sketches', 'Text Notes'). "
        "Each asset must belong to exactly one group. "
        "Return ONLY valid JSON in this exact format:\n"
        '{"groups": {"Group Name 1": ["asset_id_1", "asset_id_2"], "Group Name 2": ["asset_id_3"]}}'
    )
    
    result = _call_gemini_text(prompt)
    
    try:
        groups = result.get("groups", {})
        if not isinstance(groups, dict):
            raise ValueError("Groups must be a dictionary")
        return {"groups": groups}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI response format invalid: {e}")