const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
let isFirstMessage = true;
let sessionId = null; // Track conversation session
let selectedFiles = []; // Track selected files

// Voice state
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let ttsEnabled = true;

// Auto-resize textarea
userInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
  
  // Enable/disable send button
  sendBtn.disabled = !this.value.trim() && selectedFiles.length === 0;
});

// Handle Enter key
function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Send suggestion
function sendSuggestion(text) {
  userInput.value = text;
  userInput.dispatchEvent(new Event('input'));
  sendMessage();
}

// Utils
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateFilePreview() {
  if (!filePreview) return;
  filePreview.innerHTML = '';
  if (selectedFiles.length === 0) {
    filePreview.style.display = 'none';
    return;
  }
  filePreview.style.display = 'flex';

  selectedFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';

    let icon = '📄';
    if (file.type.startsWith('image/')) icon = '🖼️';
    else if (file.type.startsWith('audio/')) icon = '🎵';
    else if (file.name.toLowerCase().endsWith('.pdf')) icon = '📕';

    item.innerHTML = `
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-size">${formatBytes(file.size)}</div>
      </div>
      <button class="file-remove" title="Remove" data-index="${idx}">×</button>
    `;

    item.querySelector('.file-remove').addEventListener('click', (e) => {
      const i = parseInt(e.currentTarget.getAttribute('data-index'));
      selectedFiles.splice(i, 1);
      updateFilePreview();
      sendBtn.disabled = !userInput.value.trim() && selectedFiles.length === 0;
    });

    filePreview.appendChild(item);
  });
}

// Handle file selection
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    // Optional: limit total files or size here
    selectedFiles.push(...files);
    updateFilePreview();
    sendBtn.disabled = !userInput.value.trim() && selectedFiles.length === 0;
    // reset input so selecting same file again still triggers change
    fileInput.value = '';
  });
}

// Clear chat
async function clearChat() {
  // Create new session
  try {
    const response = await fetch('/new-session', {
      method: 'POST'
    });
    const data = await response.json();
    sessionId = data.session_id;
  } catch (error) {
    console.error('Failed to create new session:', error);
    sessionId = null;
  }
  
  chatBox.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">🤖</div>
      <h1>Welcome to Revine AI</h1>
      <p>Your intelligent assistant powered by GPT-4o-mini</p>
      <p style="color: #10a37f; font-size: 14px; margin-top: 10px;">✨ Memory & Typing Animation!</p>
      <div class="suggestions">
        <button class="suggestion" onclick="sendSuggestion('Explain quantum computing')">🔬 Explain quantum computing</button>
        <button class="suggestion" onclick="sendSuggestion('Write a Python function')">💻 Write a Python function</button>
        <button class="suggestion" onclick="sendSuggestion('Tell me a joke')">😄 Tell me a joke</button>
        <button class="suggestion" onclick="sendSuggestion('Help me learn JavaScript')">📚 Help me learn JavaScript</button>
      </div>
    </div>
  `;
  isFirstMessage = true;
  userInput.focus();
}

// Create message element
function createMessage(text, isUser) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = isUser ? '👤' : '🤖';
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  // Format text with markdown-like syntax
  let formattedText = text;
  
  // Code blocks
  formattedText = formattedText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code
  formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold
  formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Line breaks
  formattedText = formattedText.replace(/\n/g, '<br>');
  
  content.innerHTML = formattedText;
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  
  return messageDiv;
}

// Create typing indicator
function createTypingIndicator() {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message bot';
  messageDiv.id = 'typing-indicator';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🤖';
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  
  return messageDiv;
}

// Create empty bot message for typing animation
function createEmptyBotMessage() {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message bot';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🤖';
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  
  return { messageDiv, content };
}

// Typing animation effect
async function typeMessage(content, text, speed = 20) {
  return new Promise((resolve) => {
    let index = 0;
    const tempDiv = document.createElement('div');
    
    // Format the full text first
    let formattedText = text;
    formattedText = formattedText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/\n/g, '<br>');
    
    // Get plain text version for typing
    tempDiv.innerHTML = formattedText;
    const plainText = text;
    
    // Type character by character
    const interval = setInterval(() => {
      if (index < plainText.length) {
        index++;
        const currentText = plainText.substring(0, index);
        
        // Format current text
        let formatted = currentText;
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\n/g, '<br>');
        
        content.innerHTML = formatted + '<span class="cursor">|</span>';
        
        // Auto scroll
        chatBox.scrollTop = chatBox.scrollHeight;
      } else {
        clearInterval(interval);
        content.innerHTML = formattedText; // Show final formatted version
        resolve();
      }
    }, speed);
  });
}

// Send message
async function sendMessage() {
  const userText = userInput.value.trim();
  if (!userText && selectedFiles.length === 0) return;

  const sendingFiles = selectedFiles.slice();
  
  // Remove welcome message on first message
  if (isFirstMessage) {
    chatBox.innerHTML = '';
    isFirstMessage = false;
  }
  
  // Add user message (text or voice placeholder)
  const displayText = userText || '🎤 Voice message';
  const userMessage = createMessage(displayText, true);
  chatBox.appendChild(userMessage);

  // If sending audio, show players
  const contentEl = userMessage.querySelector('.message-content');
  sendingFiles.filter(f => (f.type || '').startsWith('audio/')).forEach((audioFile) => {
    const container = document.createElement('div');
    container.className = 'message-file';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = URL.createObjectURL(audioFile);
    container.appendChild(audio);
    const name = document.createElement('div');
    name.className = 'message-file-name';
    name.textContent = audioFile.name || 'voice-message';
    container.appendChild(name);
    contentEl.appendChild(container);
  });
  
  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;
  
  // Scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
  
  // Show typing indicator
  const typingIndicator = createTypingIndicator();
  chatBox.appendChild(typingIndicator);
  chatBox.scrollTop = chatBox.scrollHeight;
  
  try {
    // Build multipart form data
    const formData = new FormData();
    formData.append('message', userText || '');
    if (sessionId) formData.append('session_id', sessionId);
    sendingFiles.forEach((file) => formData.append('files', file, file.name));

    const response = await fetch('/chat', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    // Store session ID from response
    if (data.session_id) {
      sessionId = data.session_id;
    }
    
    // Remove typing indicator
    typingIndicator.remove();
    
    if (data.error) {
      const errorMessage = createMessage('❌ Error: ' + data.error, false);
      chatBox.appendChild(errorMessage);
    } else {
      // Create empty message and animate typing
      const { messageDiv, content } = createEmptyBotMessage();
      chatBox.appendChild(messageDiv);
      
      // Animate the typing
      await typeMessage(content, data.reply, 15); // 15ms per character

      // Speak the reply if enabled
      if (ttsEnabled) {
        speakText(data.reply);
      }
    }
  } catch (error) {
    typingIndicator.remove();
    const errorMessage = createMessage('❌ Connection error. Please try again.', false);
    chatBox.appendChild(errorMessage);
  }
  
  // After send, clear selected files
  selectedFiles = [];
  updateFilePreview();

  // Scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
  
  // Focus input
  userInput.focus();
}

// Voice recording controls
const micBtn = document.getElementById('mic-btn');
if (micBtn) {
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        // Name with timestamp
        blob.name = `voice-${Date.now()}.webm`;
        selectedFiles.push(blob);
        updateFilePreview();
        sendBtn.disabled = !userInput.value.trim() && selectedFiles.length === 0;
        // Auto-send voice message
        sendMessage();
      };
      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add('recording');
      micBtn.title = 'Recording... click to stop';
    } catch (err) {
      console.error('Mic access error:', err);
      isRecording = false;
      micBtn.classList.remove('recording');
      micBtn.title = 'Hold to record';
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      micBtn.classList.remove('recording');
      micBtn.title = 'Hold to record';
    }
  };

  micBtn.addEventListener('click', () => {
    if (!isRecording) startRecording(); else stopRecording();
  });
}

// TTS toggle
const ttsToggle = document.getElementById('tts-toggle');
if (ttsToggle) {
  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    ttsToggle.setAttribute('aria-pressed', String(ttsEnabled));
    ttsToggle.title = `Voice: ${ttsEnabled ? 'On' : 'Off'}`;
    if (!ttsEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0; // speed
    utter.pitch = 1.0;
    utter.volume = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('TTS failed:', e);
  }
}

// Mobile menu handling
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileOverlay = document.getElementById('mobile-overlay');
const sidebar = document.querySelector('.sidebar');

function toggleMobileMenu() {
  sidebar.classList.toggle('mobile-open');
  mobileOverlay.classList.toggle('active');
  
  // Update button icon
  if (sidebar.classList.contains('mobile-open')) {
    mobileMenuBtn.textContent = '×'; // Close icon
  } else {
    mobileMenuBtn.textContent = '☰'; // Menu icon
  }
}

function closeMobileMenu() {
  sidebar.classList.remove('mobile-open');
  mobileOverlay.classList.remove('active');
  mobileMenuBtn.textContent = '☰';
}

// Event listeners
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', toggleMobileMenu);
}

if (mobileOverlay) {
  mobileOverlay.addEventListener('click', closeMobileMenu);
}

// Close menu when clicking sidebar items on mobile
if (sidebar) {
  sidebar.addEventListener('click', (e) => {
    if (e.target.classList.contains('new-chat-btn') || 
        e.target.classList.contains('history-item')) {
      closeMobileMenu();
    }
  });
}

// Handle viewport resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Close mobile menu on desktop
    if (window.innerWidth > 768) {
      closeMobileMenu();
    }
  }, 250);
});

// Prevent body scroll when mobile menu open
window.addEventListener('load', () => {
  const observer = new MutationObserver(() => {
    if (sidebar.classList.contains('mobile-open')) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  });
  
  observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
});

// Focus input on load
window.addEventListener('load', () => {
  userInput.focus();
});
