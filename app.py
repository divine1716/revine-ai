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
import tempfile
import numpy as np
import sqlite3
import json
from datetime import datetime
try:
    import cv2  # for video frame extraction
except Exception:
    cv2 = None  # gracefully handle absence during import time

# Load environment variables
load_dotenv()

app = FastAPI()

# Enhanced conversation store with context tracking
# Format: {chat_id: {"messages": [...], "context": {...}, "user_profile": {...}}}
conversation_store: Dict[str, dict] = {}

# Database setup for persistent chat storage
def init_database():
    """Initialize SQLite database for chat storage"""
    conn = sqlite3.connect('revine_ai_chats.db')
    cursor = conn.cursor()
    
    # Create chats table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id TEXT DEFAULT 'anonymous',
            is_archived BOOLEAN DEFAULT FALSE
        )
    ''')
    
    # Create messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            context_data TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats (id)
        )
    ''')
    
    # Create user_profiles table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_profiles (
            chat_id TEXT PRIMARY KEY,
            technical_level TEXT DEFAULT 'intermediate',
            interaction_count INTEGER DEFAULT 0,
            preferred_response_style TEXT DEFAULT 'detailed',
            common_topics TEXT,
            FOREIGN KEY (chat_id) REFERENCES chats (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_database()

class ChatManager:
    """Manages persistent chat storage and retrieval"""
    
    @staticmethod
    def create_chat(title: str = None, user_id: str = "anonymous") -> str:
        """Create a new chat and return chat_id"""
        chat_id = str(uuid.uuid4())
        if not title:
            title = f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO chats (id, title, user_id)
            VALUES (?, ?, ?)
        ''', (chat_id, title, user_id))
        
        # Initialize user profile
        cursor.execute('''
            INSERT INTO user_profiles (chat_id, common_topics)
            VALUES (?, ?)
        ''', (chat_id, json.dumps([])))
        
        conn.commit()
        conn.close()
        
        return chat_id
    
    @staticmethod
    def get_chat_list(user_id: str = "anonymous") -> List[dict]:
        """Get list of all chats for a user"""
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, title, created_at, updated_at,
                   (SELECT COUNT(*) FROM messages WHERE chat_id = chats.id) as message_count
            FROM chats 
            WHERE user_id = ? AND is_archived = FALSE
            ORDER BY updated_at DESC
        ''', (user_id,))
        
        chats = []
        for row in cursor.fetchall():
            chats.append({
                "id": row[0],
                "title": row[1],
                "created_at": row[2],
                "updated_at": row[3],
                "message_count": row[4]
            })
        
        conn.close()
        return chats
    
    @staticmethod
    def get_chat_messages(chat_id: str) -> List[dict]:
        """Get all messages for a specific chat"""
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT role, content, context_data, timestamp
            FROM messages 
            WHERE chat_id = ?
            ORDER BY timestamp ASC
        ''', (chat_id,))
        
        messages = []
        for row in cursor.fetchall():
            message = {
                "role": row[0],
                "content": row[1],
                "timestamp": row[3]
            }
            if row[2]:  # context_data
                message["context"] = json.loads(row[2])
            messages.append(message)
        
        conn.close()
        return messages
    
    @staticmethod
    def save_message(chat_id: str, role: str, content: str, context_data: dict = None):
        """Save a message to the database"""
        message_id = str(uuid.uuid4())
        
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO messages (id, chat_id, role, content, context_data)
            VALUES (?, ?, ?, ?, ?)
        ''', (message_id, chat_id, role, content, 
              json.dumps(context_data) if context_data else None))
        
        # Update chat's updated_at timestamp
        cursor.execute('''
            UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        ''', (chat_id,))
        
        conn.commit()
        conn.close()
    
    @staticmethod
    def update_chat_title(chat_id: str, title: str):
        """Update chat title"""
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (title, chat_id))
        
        conn.commit()
        conn.close()
    
    @staticmethod
    def delete_chat(chat_id: str):
        """Delete a chat and all its messages"""
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM messages WHERE chat_id = ?', (chat_id,))
        cursor.execute('DELETE FROM user_profiles WHERE chat_id = ?', (chat_id,))
        cursor.execute('DELETE FROM chats WHERE id = ?', (chat_id,))
        
        conn.commit()
        conn.close()
    
    @staticmethod
    def get_user_profile(chat_id: str) -> dict:
        """Get user profile for a chat"""
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT technical_level, interaction_count, preferred_response_style, common_topics
            FROM user_profiles WHERE chat_id = ?
        ''', (chat_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "technical_level": row[0],
                "interaction_count": row[1],
                "preferred_response_style": row[2],
                "common_topics": json.loads(row[3]) if row[3] else []
            }
        return {
            "technical_level": "intermediate",
            "interaction_count": 0,
            "preferred_response_style": "detailed",
            "common_topics": []
        }
    
    @staticmethod
    def update_user_profile(chat_id: str, profile_data: dict):
        """Update user profile for a chat"""
        conn = sqlite3.connect('revine_ai_chats.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE user_profiles 
            SET technical_level = ?, interaction_count = ?, 
                preferred_response_style = ?, common_topics = ?
            WHERE chat_id = ?
        ''', (
            profile_data.get("technical_level", "intermediate"),
            profile_data.get("interaction_count", 0),
            profile_data.get("preferred_response_style", "detailed"),
            json.dumps(profile_data.get("common_topics", [])),
            chat_id
        ))
        
        conn.commit()
        conn.close()

# Initialize chat manager
chat_manager = ChatManager()

# Context analysis system
class ContextAnalyzer:
    def __init__(self):
        self.topics = []
        self.user_preferences = {}
        self.conversation_patterns = {}
    
    def analyze_message_context(self, message: str, conversation_history: List[dict]) -> dict:
        """Analyze message for context clues and patterns"""
        context = {
            "topics": self.extract_topics(message),
            "intent": self.detect_intent(message),
            "emotion": self.detect_emotion(message),
            "complexity": self.assess_complexity(message),
            "references": self.find_references(message, conversation_history)
        }
        return context
    
    def extract_topics(self, message: str) -> List[str]:
        """Extract key topics from message"""
        # Simple keyword extraction - can be enhanced with NLP
        tech_keywords = ["code", "programming", "python", "javascript", "react", "api", "database", "ai", "ml"]
        business_keywords = ["marketing", "sales", "strategy", "business", "revenue", "customer"]
        creative_keywords = ["design", "art", "creative", "writing", "story", "music"]
        
        topics = []
        message_lower = message.lower()
        
        if any(word in message_lower for word in tech_keywords):
            topics.append("technology")
        if any(word in message_lower for word in business_keywords):
            topics.append("business")
        if any(word in message_lower for word in creative_keywords):
            topics.append("creative")
            
        return topics
    
    def detect_intent(self, message: str) -> str:
        """Detect user intent"""
        message_lower = message.lower()
        
        if any(word in message_lower for word in ["how", "what", "why", "when", "where"]):
            return "question"
        elif any(word in message_lower for word in ["help", "assist", "support"]):
            return "help_request"
        elif any(word in message_lower for word in ["create", "build", "make", "generate"]):
            return "creation"
        elif any(word in message_lower for word in ["explain", "teach", "learn"]):
            return "learning"
        else:
            return "conversation"
    
    def detect_emotion(self, message: str) -> str:
        """Detect emotional tone"""
        message_lower = message.lower()
        
        positive_words = ["great", "awesome", "love", "excellent", "amazing", "perfect"]
        negative_words = ["frustrated", "confused", "stuck", "problem", "issue", "error"]
        urgent_words = ["urgent", "asap", "quickly", "immediately", "emergency"]
        
        if any(word in message_lower for word in urgent_words):
            return "urgent"
        elif any(word in message_lower for word in negative_words):
            return "frustrated"
        elif any(word in message_lower for word in positive_words):
            return "positive"
        else:
            return "neutral"
    
    def assess_complexity(self, message: str) -> str:
        """Assess technical complexity level"""
        technical_terms = ["algorithm", "architecture", "framework", "optimization", "scalability"]
        beginner_terms = ["basic", "simple", "easy", "beginner", "start"]
        
        if any(term in message.lower() for term in technical_terms):
            return "advanced"
        elif any(term in message.lower() for term in beginner_terms):
            return "beginner"
        else:
            return "intermediate"
    
    def find_references(self, message: str, history: List[dict]) -> List[str]:
        """Find references to previous conversation parts"""
        references = []
        reference_words = ["that", "this", "it", "above", "previous", "earlier", "before"]
        
        if any(word in message.lower() for word in reference_words) and len(history) > 0:
            # Look for recent topics in conversation
            recent_messages = history[-5:] if len(history) >= 5 else history
            for msg in recent_messages:
                if msg.get("role") == "assistant":
                    content = str(msg.get("content", ""))
                    if len(content) > 50:  # Substantial message
                        references.append(content[:100] + "...")
        
        return references

# Initialize context analyzer
context_analyzer = ContextAnalyzer()

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

def extract_video_frames(file_content: bytes, max_frames: int = 8) -> List[bytes]:
    """
    Extract up to `max_frames` evenly spaced JPEG frames from a video byte stream.
    Returns a list of JPEG-encoded image bytes.
    """
    if cv2 is None:
        raise RuntimeError("Video processing requires OpenCV (opencv-python) to be installed.")

    # Write to a temporary file so OpenCV can read it reliably
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
        tmp.write(file_content)
        tmp.flush()
        cap = cv2.VideoCapture(tmp.name)
        if not cap.isOpened():
            raise RuntimeError("Failed to open video file for frame extraction.")
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        if total_frames <= 0:
            total_frames = max_frames  # fallback sampling

        # Determine indices to sample
        step = max(1, total_frames // max_frames)
        indices = list(range(0, min(total_frames, step * max_frames), step))[:max_frames]

        frames: List[bytes] = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            # Convert BGR to RGB then JPEG-encode
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            success, buf = cv2.imencode('.jpg', frame_rgb, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            if success:
                frames.append(buf.tobytes())
        cap.release()
        return frames

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

@app.post("/new-chat")
async def new_chat(title: Optional[str] = Form(None), user_id: str = Form("anonymous")):
    """Create a new chat with persistent storage"""
    chat_id = chat_manager.create_chat(title, user_id)
    
    # Also create in-memory session for immediate use
    conversation_store[chat_id] = {
        "messages": [],
        "context": {
            "topics": [],
            "user_preferences": {},
            "conversation_style": "adaptive",
            "expertise_level": "unknown"
        },
        "user_profile": chat_manager.get_user_profile(chat_id)
    }
    
    return {"chat_id": chat_id, "title": title or f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"}

@app.get("/chats")
async def get_chats(user_id: str = "anonymous"):
    """Get list of all chats for a user"""
    return {"chats": chat_manager.get_chat_list(user_id)}

@app.get("/chat/{chat_id}")
async def get_chat(chat_id: str):
    """Get a specific chat with all messages"""
    messages = chat_manager.get_chat_messages(chat_id)
    user_profile = chat_manager.get_user_profile(chat_id)
    
    # Load into memory for continued conversation
    conversation_store[chat_id] = {
        "messages": messages,
        "context": {
            "topics": user_profile.get("common_topics", []),
            "user_preferences": {},
            "conversation_style": "adaptive",
            "expertise_level": "unknown"
        },
        "user_profile": user_profile
    }
    
    return {
        "chat_id": chat_id,
        "messages": messages,
        "user_profile": user_profile
    }

@app.delete("/chat/{chat_id}")
async def delete_chat(chat_id: str):
    """Delete a chat permanently"""
    chat_manager.delete_chat(chat_id)
    if chat_id in conversation_store:
        del conversation_store[chat_id]
    return {"message": "Chat deleted successfully"}

@app.put("/chat/{chat_id}/title")
async def update_chat_title(chat_id: str, title: str):
    """Update chat title"""
    chat_manager.update_chat_title(chat_id, title)
    return {"message": "Title updated successfully"}

@app.post("/chat")
async def chat(
    message: str = Form(...),
    chat_id: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None)
):
    # Create new chat if not provided
    if not chat_id:
        chat_id = chat_manager.create_chat()
        conversation_store[chat_id] = {
            "messages": [],
            "context": {
                "topics": [],
                "user_preferences": {},
                "conversation_style": "adaptive",
                "expertise_level": "unknown"
            },
            "user_profile": chat_manager.get_user_profile(chat_id)
        }
    elif chat_id not in conversation_store:
        # Load existing chat from database
        messages = chat_manager.get_chat_messages(chat_id)
        user_profile = chat_manager.get_user_profile(chat_id)
        conversation_store[chat_id] = {
            "messages": messages,
            "context": {
                "topics": user_profile.get("common_topics", []),
                "user_preferences": {},
                "conversation_style": "adaptive",
                "expertise_level": "unknown"
            },
            "user_profile": user_profile
        }

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
                
                # Handle audio: transcribe then include transcript with enhanced analysis
                elif content_type.startswith('audio/'):
                    try:
                        print(f"🎵 Processing audio file: {filename}, size: {len(file_content)} bytes, type: {content_type}")
                        
                        # Validate audio file size (max 25MB for Whisper)
                        if len(file_content) > 25 * 1024 * 1024:
                            file_contents.append(f"[Audio file: {filename}] Error: File too large (max 25MB)")
                            continue
                        
                        audio_io = io.BytesIO(file_content)
                        audio_io.name = filename  # OpenAI SDK uses this for filename
                        
                        print("🎤 Sending to Whisper for transcription...")
                        transcript = client.audio.transcriptions.create(
                            model="whisper-1",
                            file=audio_io,
                            response_format="verbose_json"  # Get more detailed info
                        )
                        
                        transcript_text = getattr(transcript, 'text', str(transcript))
                        print(f"📝 Transcription result: {transcript_text}")
                        
                        # Enhanced audio processing
                        if hasattr(transcript, 'language'):
                            language = transcript.language
                            print(f"🌍 Detected language: {language}")
                        else:
                            language = "unknown"
                        
                        # Add comprehensive audio analysis
                        audio_analysis = f"""[🎤 Voice Message Analysis]
Transcript: "{transcript_text}"
Language: {language}
Duration: ~{len(file_content) // 16000}s (estimated)

[AI Instructions for Voice Response]
1. Respond naturally as if this was a spoken conversation
2. Consider the conversational tone and context
3. If the user asked a question, provide a direct answer
4. If appropriate, acknowledge that this was a voice message
5. Match the user's communication style (formal/casual)
6. Provide relevant and helpful information based on what they said"""
                        
                        file_contents.append(audio_analysis)
                        
                    except Exception as e:
                        print(f"❌ Audio transcription error: {str(e)}")
                        error_msg = str(e)
                        if "invalid_request_error" in error_msg:
                            file_contents.append(f"[Audio file: {filename}] Error: Unsupported audio format. Please use MP3, MP4, MPEG, MPGA, M4A, WAV, or WEBM.")
                        else:
                            file_contents.append(f"[Audio file: {filename}] Transcription error: {error_msg}")

                # Handle video: sample frames and attach as images (Vision API), optionally summarize
                elif content_type.startswith('video/') or name_lower.endswith(('.mp4', '.mov', '.avi', '.mkv', '.webm')):
                    try:
                        frames = extract_video_frames(file_content, max_frames=8)
                        for i, jpg_bytes in enumerate(frames):
                            b64 = base64.b64encode(jpg_bytes).decode('utf-8')
                            image_data.append({
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{b64}",
                                    "detail": "high"
                                }
                            })
                        file_contents.append(f"[Video: {filename}] Extracted {len(frames)} frames for analysis.")
                        # Hint the model to reason across frames temporally
                        file_contents.append("[Instruction] Analyze the video across frames: actions, events order, scene changes, objects, and overall summary.")
                    except Exception as e:
                        file_contents.append(f"[Video file: {filename}] (video processing error: {str(e)})")
                
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
        
        # Analyze message context
        session_data = conversation_store[chat_id]
        message_context = context_analyzer.analyze_message_context(message, session_data["messages"])
        
        # Update user profile and context
        session_data["user_profile"]["interaction_count"] += 1
        session_data["context"]["topics"].extend(message_context["topics"])
        
        # Keep only recent topics (last 10)
        session_data["context"]["topics"] = session_data["context"]["topics"][-10:]
        
        # Update technical level based on complexity
        if message_context["complexity"] == "advanced":
            session_data["user_profile"]["technical_level"] = "advanced"
        elif message_context["complexity"] == "beginner" and session_data["user_profile"]["technical_level"] == "unknown":
            session_data["user_profile"]["technical_level"] = "beginner"
        
        # Add user message to conversation history
        user_message = {
            "role": "user",
            "content": user_content,
            "context": message_context,
            "timestamp": str(uuid.uuid4())[:8]
        }
        session_data["messages"].append(user_message)
        
        # Save to database
        chat_manager.save_message(chat_id, "user", str(user_content), message_context)

        # Build enhanced system prompt based on context
        session_data = conversation_store[chat_id]
        user_profile = session_data["user_profile"]
        context = session_data["context"]
        
        # Create adaptive system prompt
        system_prompt = f"""You are Revine AI, an advanced AI assistant with contextual understanding and voice interaction capabilities.

CONTEXT AWARENESS:
- User's technical level: {user_profile['technical_level']}
- Interaction count: {user_profile['interaction_count']}
- Recent topics: {', '.join(context['topics'][-5:]) if context['topics'] else 'None'}
- Current message intent: {message_context['intent']}
- User emotion: {message_context['emotion']}
- Message complexity: {message_context['complexity']}

VOICE MESSAGE HANDLING:
- When processing voice messages, respond naturally as if in a spoken conversation
- Acknowledge voice input when appropriate ("I heard you say..." or "Thanks for the voice message")
- Match the conversational tone - be more casual and natural for voice interactions
- Provide clear, easy-to-understand responses that work well when read aloud
- If the audio was unclear, politely ask for clarification

RESPONSE GUIDELINES:
- Adapt your response style to match the user's technical level and communication method
- Reference previous conversation topics when relevant
- If user seems frustrated, be extra helpful and patient
- For urgent requests, prioritize actionable solutions
- For learning intents, provide step-by-step explanations
- For creation requests, offer detailed implementation guidance
- For voice messages, be conversational and natural

CAPABILITIES:
- Analyze images, documents, audio (with transcription), and video files
- Maintain conversation memory and context across all interaction types
- Provide code examples and technical guidance
- Offer creative and business insights
- Process voice messages with Whisper transcription
- Remember user preferences and adapt accordingly

AUDIO PROCESSING NOTES:
- Voice messages are transcribed using Whisper AI
- Respond to the content and intent, not just the literal transcription
- Consider the conversational nature of voice communication
- Be helpful and engaging in your audio responses

Always provide relevant, contextual responses that build upon the conversation history and match the user's preferred communication style."""

        # Build messages array with enhanced system message and conversation history
        messages = [
            {"role": "system", "content": system_prompt}
        ] + session_data["messages"]

        # Get response from OpenAI
        model = "gpt-4o-mini"
        response = client.chat.completions.create(
            model=model,
            messages=messages
        )
        reply = response.choices[0].message.content

        # Analyze AI response for learning
        response_topics = context_analyzer.extract_topics(reply)
        session_data["context"]["topics"].extend(response_topics)
        
        # Add AI response to conversation history
        ai_message = {
            "role": "assistant",
            "content": reply,
            "topics": response_topics,
            "timestamp": str(uuid.uuid4())[:8]
        }
        session_data["messages"].append(ai_message)
        
        # Save to database
        chat_manager.save_message(chat_id, "assistant", reply, {"topics": response_topics})
        
        # Update user profile in database
        chat_manager.update_user_profile(chat_id, session_data["user_profile"])
        
        # Update conversation store
        conversation_store[chat_id] = session_data

        return {
            "reply": reply,
            "chat_id": chat_id
        }
    except Exception as e:
        return {"error": str(e)}

# For local development
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)


@app.get("/chat/{chat_id}/context")
async def get_chat_context(chat_id: str):
    """Get current chat context and user profile"""
    if chat_id not in conversation_store:
        # Try to load from database
        messages = chat_manager.get_chat_messages(chat_id)
        if not messages:
            return {"error": "Chat not found"}
        user_profile = chat_manager.get_user_profile(chat_id)
        return {
            "user_profile": user_profile,
            "message_count": len(messages),
            "recent_topics": user_profile.get("common_topics", [])[-10:]
        }
    
    session_data = conversation_store[chat_id]
    return {
        "user_profile": session_data["user_profile"],
        "context": session_data["context"],
        "message_count": len(session_data["messages"]),
        "recent_topics": list(set(session_data["context"]["topics"][-10:]))
    }

@app.post("/chat/{chat_id}/preferences")
async def update_preferences(chat_id: str, preferences: dict):
    """Update user preferences for better context"""
    if chat_id not in conversation_store:
        return {"error": "Chat not found"}
    
    session_data = conversation_store[chat_id]
    session_data["user_profile"].update(preferences)
    conversation_store[chat_id] = session_data
    
    # Also update in database
    chat_manager.update_user_profile(chat_id, session_data["user_profile"])
    
    return {"message": "Preferences updated successfully"}

@app.get("/chat/{chat_id}/summary")
async def get_conversation_summary(chat_id: str):
    """Get AI-generated summary of the conversation"""
    if chat_id not in conversation_store:
        # Try to load from database
        messages = chat_manager.get_chat_messages(chat_id)
        if not messages:
            return {"error": "Chat not found"}
    else:
        session_data = conversation_store[chat_id]
        messages = session_data["messages"]
    
    if len(messages) < 2:
        return {"summary": "Conversation just started"}
    
    # Create summary prompt
    conversation_text = "\n".join([
        f"{msg['role']}: {str(msg['content'])[:200]}..." 
        for msg in messages[-10:]  # Last 10 messages
    ])
    
    try:
        summary_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Summarize this conversation in 2-3 sentences, highlighting key topics and outcomes."},
                {"role": "user", "content": f"Conversation:\n{conversation_text}"}
            ]
        )
        summary = summary_response.choices[0].message.content
        
        # Get topics from database if not in memory
        if chat_id in conversation_store:
            topics = list(set(conversation_store[chat_id]["context"]["topics"][-5:]))
            interaction_count = conversation_store[chat_id]["user_profile"]["interaction_count"]
        else:
            user_profile = chat_manager.get_user_profile(chat_id)
            topics = user_profile.get("common_topics", [])[-5:]
            interaction_count = user_profile.get("interaction_count", 0)
        
        return {
            "summary": summary,
            "topics": topics,
            "interaction_count": interaction_count
        }
    except Exception as e:
        return {"error": f"Could not generate summary: {str(e)}"}