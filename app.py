from fastapi import FastAPI, Request, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from openai import OpenAI
import uvicorn
import os
from dotenv import load_dotenv
from typing import Dict, List, Optional
import uuid
import base64
from PIL import Image
import io
from PyPDF2 import PdfReader
from docx import Document

# Load environment variables
load_dotenv()

app = FastAPI()

# Store conversation history for each session
# Format: {session_id: [{"role": "user/assistant", "content": "..."}]}
conversation_store: Dict[str, List[dict]] = {}

# Helper functions for file processing
def process_image(file_content: bytes) -> str:
    """Convert image to base64 for OpenAI Vision API"""
    return base64.b64encode(file_content).decode('utf-8')

def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from PDF file"""
    try:
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        return f"Error reading PDF: {str(e)}"

def extract_text_from_docx(file_content: bytes) -> str:
    """Extract text from DOCX files"""
    try:
        bio = io.BytesIO(file_content)
        doc = Document(bio)
        return "\n".join([p.text for p in doc.paragraphs]).strip()
    except Exception as e:
        return f"Error reading DOCX: {str(e)}"

def process_text_file(file_content: bytes, filename: str) -> str:
    """Extract text from text-based files"""
    try:
        # Try UTF-8 first, fall back to latin-1
        try:
            return file_content.decode('utf-8')
        except UnicodeDecodeError:
            return file_content.decode('latin-1')
    except Exception as e:
        return f"Error reading file: {str(e)}"

# Allow connections from your HTML frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Your OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def home():
    return FileResponse("static/index.html")

@app.post("/new-session")
async def new_session():
    """Create a new conversation session"""
    session_id = str(uuid.uuid4())
    conversation_store[session_id] = []
    return {"session_id": session_id}

@app.post("/chat")
async def chat(
    message: str = Form(...),
    session_id: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None)
):
    # Create new session if not provided
    if not session_id or session_id not in conversation_store:
        session_id = str(uuid.uuid4())
        conversation_store[session_id] = []

    try:
        # Process uploaded files
        file_contents = []
        image_data = []
        
        if files:
            for file in files:
                file_content = await file.read()
                filename = file.filename or "file"
                content_type = file.content_type or ""
                name_lower = filename.lower()
                
                # Handle images with Vision API
                if content_type.startswith('image/'):
                    base64_image = process_image(file_content)
                    image_data.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{content_type};base64,{base64_image}"
                        }
                    })
                    file_contents.append(f"[Image: {filename}]")
                
                # Handle PDFs
                elif content_type == 'application/pdf' or name_lower.endswith('.pdf'):
                    pdf_text = extract_text_from_pdf(file_content)
                    file_contents.append(f"[PDF: {filename}]\n{pdf_text}")
                
                # Handle DOCX
                elif name_lower.endswith('.docx'):
                    docx_text = extract_text_from_docx(file_content)
                    file_contents.append(f"[DOCX: {filename}]\n{docx_text}")
                
                # Handle text-like files
                elif content_type.startswith('text/') or name_lower.endswith(('.txt', '.md', '.csv', '.json', '.xml', '.html')):
                    text_content = process_text_file(file_content, filename)
                    file_contents.append(f"[File: {filename}]\n{text_content}")
                
                # Handle audio: transcribe then include transcript
                elif content_type.startswith('audio/'):
                    try:
                        audio_io = io.BytesIO(file_content)
                        audio_io.name = filename  # OpenAI SDK uses this for filename
                        transcript = client.audio.transcriptions.create(
                            model="whisper-1",
                            file=audio_io
                        )
                        transcript_text = getattr(transcript, 'text', str(transcript))
                        file_contents.append(f"[Audio transcript: {filename}]\n{transcript_text}")
                    except Exception as e:
                        file_contents.append(f"[Audio file: {filename}] (transcription error: {str(e)})")
                
                else:
                    file_contents.append(f"[File: {filename} - {content_type or 'unknown type'}]")
        
        # Build user message content
        if image_data:
            # Use Vision API format for images
            user_content = [{"type": "text", "text": message}] + image_data
            if file_contents:
                user_content[0]["text"] += "\n\n" + "\n\n".join(file_contents)
        else:
            # Regular text message with file contents
            user_content = message
            if file_contents:
                user_content += "\n\n" + "\n\n".join(file_contents)
        
        # Add user message to conversation history
        conversation_store[session_id].append({
            "role": "user",
            "content": user_content
        })

        # Build messages array with system message and conversation history
        messages = [
            {"role": "system", "content": "You are Revine AI, a helpful and friendly AI assistant. You can analyze images, read documents, and have memory of the conversation. When users share files, help them understand and analyze the content."}
        ] + conversation_store[session_id]

        # Get response from OpenAI
        model = "gpt-4o-mini"
        response = client.chat.completions.create(
            model=model,
            messages=messages
        )
        reply = response.choices[0].message.content

        # Add AI response to conversation history
        conversation_store[session_id].append({
            "role": "assistant",
            "content": reply
        })

        return {
            "reply": reply,
            "session_id": session_id
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)

