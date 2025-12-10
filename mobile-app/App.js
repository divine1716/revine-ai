import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Provider as PaperProvider, TextInput, IconButton, Text, Card, Chip } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

// Replace with your deployed backend URL
const API_URL = 'https://revine-ai-backend.onrender.com';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [currentChatId, setCurrentChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [contextInfo, setContextInfo] = useState(null);
  const [chats, setChats] = useState([]);
  const [showChatList, setShowChatList] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const response = await axios.get(`${API_URL}/chats`);
      setChats(response.data.chats);
      
      // If no current chat, create a new one
      if (!currentChatId && response.data.chats.length === 0) {
        createNewChat();
      } else if (!currentChatId && response.data.chats.length > 0) {
        // Load the most recent chat
        loadChat(response.data.chats[0].id);
      }
    } catch (error) {
      console.error('Error loading chats:', error);
      createNewChat();
    }
  };

  const createNewChat = async (title = null) => {
    try {
      const response = await axios.post(`${API_URL}/new-chat`, { title });
      const newChatId = response.data.chat_id;
      setCurrentChatId(newChatId);
      setMessages([]);
      loadContextInfo(newChatId);
      loadChats(); // Refresh chat list
      setShowChatList(false);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const loadChat = async (chatId) => {
    try {
      const response = await axios.get(`${API_URL}/chat/${chatId}`);
      setCurrentChatId(chatId);
      setMessages(response.data.messages.map(msg => ({
        id: msg.timestamp || Date.now().toString(),
        text: msg.content,
        sender: msg.role === 'user' ? 'user' : 'ai',
        timestamp: msg.timestamp
      })));
      loadContextInfo(chatId);
      setShowChatList(false);
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  const deleteChat = async (chatId) => {
    try {
      await axios.delete(`${API_URL}/chat/${chatId}`);
      loadChats();
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
        createNewChat();
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const loadContextInfo = async (chatId) => {
    try {
      const response = await axios.get(`${API_URL}/chat/${chatId}/context`);
      setContextInfo(response.data);
    } catch (error) {
      console.error('Error loading context:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() && selectedFiles.length === 0) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      files: selectedFiles.map(f => f.name)
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', inputText);
      formData.append('chat_id', currentChatId);

      // Attach files
      for (const file of selectedFiles) {
        formData.append('files', {
          uri: file.uri,
          type: file.mimeType || 'application/octet-stream',
          name: file.name
        });
      }

      const response = await axios.post(`${API_URL}/chat`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        text: response.data.reply,
        sender: 'ai'
      };

      setMessages(prev => [...prev, aiMessage]);
      setSelectedFiles([]);
      
      // Update context info after successful message
      loadContextInfo(currentChatId);
      loadChats(); // Refresh chat list to update timestamps
    } catch (error) {
      Alert.alert('Error', 'Failed to send message. Please check your connection.');
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets) {
        setSelectedFiles(prev => [...prev, ...result.assets]);
      }
    } catch (error) {
      console.error('Error picking document:', error);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library access to share images.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const files = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          mimeType: asset.type === 'video' ? 'video/mp4' : 'image/jpeg'
        }));
        setSelectedFiles(prev => [...prev, ...files]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const renderMessage = ({ item }) => (
    <View style={[styles.messageContainer, item.sender === 'user' ? styles.userMessage : styles.aiMessage]}>
      <Card style={item.sender === 'user' ? styles.userCard : styles.aiCard}>
        <Card.Content>
          {item.files && item.files.length > 0 && (
            <View style={styles.filesContainer}>
              {item.files.map((file, idx) => (
                <Chip key={idx} icon="file" style={styles.fileChip}>{file}</Chip>
              ))}
            </View>
          )}
          <Text style={styles.messageText}>{item.text}</Text>
        </Card.Content>
      </Card>
    </View>
  );

  return (
    <PaperProvider>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <IconButton
                icon="menu"
                size={24}
                onPress={() => setShowChatList(true)}
                iconColor="#fff"
              />
              <Text style={styles.headerText}>Revine AI</Text>
              <IconButton
                icon="plus"
                size={24}
                onPress={() => createNewChat()}
                iconColor="#fff"
              />
            </View>
            {contextInfo && (
              <View style={styles.contextBar}>
                <Text style={styles.contextText}>
                  {contextInfo.message_count} messages • {contextInfo.user_profile?.technical_level || 'adaptive'} mode
                </Text>
                {contextInfo.recent_topics && contextInfo.recent_topics.length > 0 && (
                  <Text style={styles.topicsText}>
                    Topics: {contextInfo.recent_topics.slice(0, 3).join(', ')}
                  </Text>
                )}
              </View>
            )}
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          />

          {selectedFiles.length > 0 && (
            <View style={styles.selectedFilesContainer}>
              {selectedFiles.map((file, index) => (
                <Chip
                  key={index}
                  icon="file"
                  onClose={() => removeFile(index)}
                  style={styles.selectedFileChip}
                >
                  {file.name}
                </Chip>
              ))}
            </View>
          )}

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <View style={styles.inputContainer}>
              <IconButton
                icon="image"
                size={24}
                onPress={pickImage}
                iconColor="#6c5ce7"
              />
              <IconButton
                icon="paperclip"
                size={24}
                onPress={pickDocument}
                iconColor="#6c5ce7"
              />
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type a message..."
                placeholderTextColor="#888"
                mode="outlined"
                multiline
                maxLength={2000}
                theme={{ colors: { primary: '#6c5ce7' } }}
              />
              <IconButton
                icon="send"
                size={24}
                onPress={sendMessage}
                disabled={loading || (!inputText.trim() && selectedFiles.length === 0)}
                iconColor={loading ? '#888' : '#6c5ce7'}
              />
            </View>
          </KeyboardAvoidingView>

          {/* Chat List Modal */}
          {showChatList && (
            <View style={styles.chatListOverlay}>
              <View style={styles.chatListContainer}>
                <View style={styles.chatListHeader}>
                  <Text style={styles.chatListTitle}>Your Chats</Text>
                  <IconButton
                    icon="close"
                    size={24}
                    onPress={() => setShowChatList(false)}
                    iconColor="#fff"
                  />
                </View>
                <FlatList
                  data={chats}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => (
                    <View style={styles.chatItem}>
                      <View style={styles.chatItemContent} onTouchEnd={() => loadChat(item.id)}>
                        <Text style={styles.chatTitle}>{item.title}</Text>
                        <Text style={styles.chatInfo}>
                          {item.message_count} messages • {new Date(item.updated_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <IconButton
                        icon="delete"
                        size={20}
                        onPress={() => deleteChat(item.id)}
                        iconColor="#ff6b6b"
                      />
                    </View>
                  )}
                  style={styles.chatList}
                />
              </View>
            </View>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
  },
  header: {
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#6c5ce7',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  aiMessage: {
    alignSelf: 'flex-start',
  },
  userCard: {
    backgroundColor: '#6c5ce7',
  },
  aiCard: {
    backgroundColor: '#1a1a2e',
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
  },
  filesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  fileChip: {
    marginRight: 4,
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#6c5ce7',
  },
  input: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    color: '#fff',
    maxHeight: 100,
  },
  selectedFilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    backgroundColor: '#1a1a2e',
  },
  selectedFileChip: {
    marginRight: 4,
    marginBottom: 4,
  },
  contextBar: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  contextText: {
    color: '#a0a0a0',
    fontSize: 12,
    textAlign: 'center',
  },
  topicsText: {
    color: '#6c5ce7',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatListOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatListContainer: {
    backgroundColor: '#1a1a2e',
    width: '90%',
    maxHeight: '80%',
    borderRadius: 12,
    padding: 16,
  },
  chatListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chatListTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatList: {
    maxHeight: 400,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  chatItemContent: {
    flex: 1,
  },
  chatTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  chatInfo: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});
