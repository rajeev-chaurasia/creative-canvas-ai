from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import base64
import img2pdf

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    imageData: str  # data URL or base64 string
    filename: str = "canvas.pdf"


@router.post("/pdf")
async def export_pdf(req: ExportRequest):
    data = req.imageData
    # support full data URLs
    try:
        if data.startswith("data:"):
            header, data = data.split(",", 1)

        binary = base64.b64decode(data)

        # img2pdf expects image bytes (PNG/JPEG)
        pdf_bytes = img2pdf.convert(binary)

        return Response(content=pdf_bytes, media_type="application/pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
