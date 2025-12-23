const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
let isFirstMessage = true;
let currentChatId = null; // Track current chat
let selectedFiles = []; // Track selected files
let chats = []; // Store chat history

// Voice state
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let ttsEnabled = true;
let recordingTimer = null;
let recordingStartTime = 0;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
  loadChatHistory();
});

// Chat History Management
async function loadChatHistory() {
  try {
    const response = await fetch('/chats');
    const data = await response.json();
    chats = data.chats || [];
    renderChatHistory();
    
    // Load most recent chat or create new one
    if (chats.length > 0 && !currentChatId) {
      loadChat(chats[0].id);
    } else if (chats.length === 0) {
      createNewChat();
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
    createNewChat();
  }
}

function renderChatHistory() {
  const chatHistory = document.getElementById('chat-history');
  
  if (chats.length === 0) {
    chatHistory.innerHTML = '<div class="no-chats">No chats yet<br><small>Start a conversation!</small></div>';
    return;
  }
  
  chatHistory.innerHTML = chats.map(chat => `
    <div class="history-item ${currentChatId === chat.id ? 'active' : ''}" 
         onclick="loadChat('${chat.id}')" 
         data-chat-id="${chat.id}">
      <div class="chat-info">
        <span class="chat-title">${chat.title}</span>
        <small class="chat-meta">${chat.message_count} messages • ${formatDate(chat.updated_at)}</small>
      </div>
      <button class="delete-chat-btn" onclick="deleteChat('${chat.id}', event)" title="Delete chat">🗑️</button>
    </div>
  `).join('');
}

async function createNewChat() {
  try {
    const response = await fetch('/new-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'title=' + encodeURIComponent(`Chat ${new Date().toLocaleString()}`)
    });
    
    const data = await response.json();
    currentChatId = data.chat_id;
    
    // Clear current chat
    clearChatDisplay();
    
    // Reload chat history
    loadChatHistory();
  } catch (error) {
    console.error('Error creating new chat:', error);
  }
}

async function loadChat(chatId) {
  try {
    const response = await fetch(`/chat/${chatId}`);
    const data = await response.json();
    
    currentChatId = chatId;
    
    // Clear and load messages
    clearChatDisplay();
    
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(message => {
        if (message.role === 'user') {
          addMessage(message.content, 'user');
        } else {
          addMessage(message.content, 'assistant');
        }
      });
      isFirstMessage = false;
    } else {
      isFirstMessage = true;
    }
    
    // Update active chat in sidebar
    renderChatHistory();
    
  } catch (error) {
    console.error('Error loading chat:', error);
  }
}

async function deleteChat(chatId, event) {
  event.stopPropagation(); // Prevent loading the chat
  
  if (!confirm('Are you sure you want to delete this chat?')) {
    return;
  }
  
  try {
    await fetch(`/chat/${chatId}`, { method: 'DELETE' });
    
    // If deleting current chat, create new one
    if (currentChatId === chatId) {
      createNewChat();
    } else {
      loadChatHistory();
    }
  } catch (error) {
    console.error('Error deleting chat:', error);
  }
}

function clearChatDisplay() {
  chatBox.innerHTML = '';
  isFirstMessage = true;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

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
// This function is now replaced by createNewChat()
async function clearChat() {
  createNewChat();
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

  // If sending audio, show players with enhanced styling
  const contentEl = userMessage.querySelector('.message-content');
  sendingFiles.filter(f => (f.type || '').startsWith('audio/')).forEach((audioFile) => {
    const container = document.createElement('div');
    container.className = 'message-file audio-message';
    
    const audioHeader = document.createElement('div');
    audioHeader.innerHTML = '🎤 Voice Message';
    audioHeader.style.fontWeight = 'bold';
    audioHeader.style.marginBottom = '8px';
    container.appendChild(audioHeader);
    
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = URL.createObjectURL(audioFile);
    container.appendChild(audio);
    
    const name = document.createElement('div');
    name.className = 'message-file-name';
    name.textContent = `${audioFile.name || 'voice-message'} (${formatBytes(audioFile.size)})`;
    container.appendChild(name);
    
    const processingNote = document.createElement('div');
    processingNote.className = 'audio-transcript';
    processingNote.textContent = 'Processing audio with AI transcription...';
    container.appendChild(processingNote);
    
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
    if (currentChatId) formData.append('chat_id', currentChatId);
    sendingFiles.forEach((file) => formData.append('files', file, file.name));

    const response = await fetch('/chat', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    // Store chat ID from response
    if (data.chat_id) {
      currentChatId = data.chat_id;
      // Refresh chat history to show updated timestamp
      loadChatHistory();
    }
    
    // Remove typing indicator
    typingIndicator.remove();
    
    if (data.error) {
      const errorMessage = createMessage('❌ Error: ' + data.error, false);
      chatBox.appendChild(errorMessage);
    } else {
      // Create empty message and animate typing
      const { messageDiv, content } = createEmptyBotMessage();
      
      // Check if this was a response to a voice message
      const hasAudioFiles = sendingFiles.some(f => (f.type || '').startsWith('audio/'));
      if (hasAudioFiles) {
        const voiceResponseBadge = document.createElement('div');
        voiceResponseBadge.className = 'voice-response-badge';
        voiceResponseBadge.innerHTML = '🎤➡️🤖 Voice Response';
        voiceResponseBadge.style.cssText = `
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          margin-bottom: 8px;
          display: inline-block;
        `;
        content.appendChild(voiceResponseBadge);
      }
      
      chatBox.appendChild(messageDiv);
      
      // Animate the typing
      await typeMessage(content, data.reply, hasAudioFiles ? 10 : 15); // Faster typing for voice responses

      // Enhanced text-to-speech for voice message responses
      if (ttsEnabled) {
        if (hasAudioFiles) {
          console.log('🔊 Playing TTS response to voice message');
          // Slightly slower speech for voice responses
          speakText(data.reply, 0.9);
        } else {
          speakText(data.reply);
        }
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
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      audioChunks = [];
      
      // Use supported audio format
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose
          }
        }
      }
      
      console.log('🎵 Using audio format:', mimeType);
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      
      mediaRecorder.ondataavailable = (e) => { 
        console.log('📊 Audio data:', e.data.size, 'bytes');
        if (e.data.size > 0) audioChunks.push(e.data); 
      };
      
      mediaRecorder.onstop = () => {
        console.log('⏹️ Recording stopped, processing...');
        const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
        console.log('🎵 Audio blob:', blob.size, 'bytes');
        
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());
        
        // Create proper File object
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const audioFile = new File([blob], `voice-${Date.now()}.${extension}`, { 
          type: mimeType || 'audio/webm' 
        });
        
        console.log('📁 Audio file created:', audioFile.name, audioFile.size, 'bytes');
        
        // Add to selected files
        selectedFiles.push(audioFile);
        updateFilePreview();
        
        // Enable send button
        sendBtn.disabled = false;
        
        // Auto-send voice message
        console.log('🚀 Auto-sending voice message...');
        sendMessage();
      };
      
      mediaRecorder.onerror = (e) => {
        console.error('❌ MediaRecorder error:', e);
        alert('Recording error occurred. Please try again.');
      };
      
      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add('recording');
      micBtn.title = '🔴 Recording... click to stop';
      micBtn.style.background = '#ff4444';
      
      // Start recording timer
      recordingStartTime = Date.now();
      const audioStatus = document.getElementById('audio-status');
      const audioTimer = document.getElementById('audio-timer');
      audioStatus.style.display = 'flex';
      
      recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        audioTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }, 1000);
      
      console.log('🎤 Recording started successfully!');
      
    } catch (err) {
      console.error('❌ Microphone access error:', err);
      alert('Could not access microphone. Please:\n1. Allow microphone permission\n2. Check if another app is using the mic\n3. Try refreshing the page');
      isRecording = false;
      micBtn.classList.remove('recording');
      micBtn.title = 'Hold to record';
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      console.log('⏹️ Stopping recording...');
      mediaRecorder.stop();
      isRecording = false;
      micBtn.classList.remove('recording');
      micBtn.style.background = '';
      micBtn.title = '🎤 Click to record';
      
      // Stop timer
      if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }
      
      const audioStatus = document.getElementById('audio-status');
      audioStatus.style.display = 'none';
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

function speakText(text, rate = 1.0) {
  if (!('speechSynthesis' in window)) return;
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate; // Adjustable speed
    utter.pitch = 1.0;
    utter.volume = 1.0;
    
    // Use a more natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.name.includes('Natural') || 
      voice.name.includes('Enhanced') ||
      voice.lang.startsWith('en')
    );
    if (preferredVoice) {
      utter.voice = preferredVoice;
    }
    
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    
    console.log(`🔊 Speaking: "${text.substring(0, 50)}..." at rate ${rate}`);
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

// .2Focus input on load
window.addEventListener('load', () => {
  userInput.focus();
});

// Settings toggle (placeholder for future features)
function toggleSettings() {
  alert('Settings panel coming soon!\n\nFeatures planned:\n• Theme selection\n• Voice settings\n• Export chat history\n• API key management');
}
// Test mmicrophone access
async function testMicrophone() {
  try {
    console.log('🧪 Testing microphone access...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✅ Microphone access granted!');
    
    // Test MediaRecorder support
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg'
    ];
    
    console.log('🎵 Supported audio formats:');
    mimeTypes.forEach(type => {
      const supported = MediaRecorder.isTypeSupported(type);
      console.log(`  ${type}: ${supported ? '✅' : '❌'}`);
    });
    
    // Stop the test stream
    stream.getTracks().forEach(track => track.stop());
    
    return true;
  } catch (error) {
    console.error('❌ Microphone test failed:', error);
    return false;
  }
}

// Run microphone test on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(testMicrophone, 1000);
});