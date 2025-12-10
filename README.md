# D.Bonid AI Chatbot

An AI-powered chatbot using OpenAI's GPT-4o-mini model with both CLI and web interfaces.

## Setups

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up your API key:**
   - Copy `.env.example` to `.env` (already done)
   - Add your OpenAI API key to `.env`

3. **Run the CLI chatbot:**
   ```bash
   python ai_chatbot.py
   ```

4. **Run the web server:**
   ```bash
   python app.py
   ```
   Then open http://127.0.0.1:8000 in your browser

## Features

- 💬 Interactive chat interface
- 🌐 Web-based UI with dark theme
- 🔒 Secure API key management
- ⚡ Fast responses using GPT-4o-mini
- 🖼️ Image understanding (via Vision)
- 🎧 Audio transcription (Whisper)
- 🎞️ Video understanding by sampling frames (no GPU required)

## Usage

### CLI Mode
Simply run `python ai_chatbot.py` and start chatting. Type `exit` or `quit` to end.

### Web Mode
1. Start the server: `python app.py`
2. Open browser to http://127.0.0.1:8000
3. Start chatting in the web interface
