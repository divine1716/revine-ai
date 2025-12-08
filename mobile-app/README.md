# Revine AI Mobile App

React Native mobile app for Revine AI chatbot.

## Setup

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/

2. **Install dependencies:**
   ```bash
   cd mobile-app
   npm install
   ```

3. **Install Expo CLI globally:**
   ```bash
   npm install -g expo-cli
   ```

4. **Update API URL:**
   - Open `App.js`
   - Change `API_URL` to your deployed backend URL (from Render or your server)

## Run the App

### Development Mode (Test on your phone)

1. **Start the development server:**
   ```bash
   npm start
   ```

2. **Install Expo Go app on your phone:**
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
   - iOS: https://apps.apple.com/app/expo-go/id982107779

3. **Scan the QR code** shown in terminal with Expo Go app

### Build for Android (Play Store)

1. **Create Expo account:**
   ```bash
   npx expo login
   ```

2. **Build APK for testing:**
   ```bash
   npx eas build --platform android --profile preview
   ```

3. **Build AAB for Play Store:**
   ```bash
   npx eas build --platform android --profile production
   ```

4. **Download the .aab file** and upload to Google Play Console

## Publishing to Play Store

1. Create a Google Play Developer account ($25 one-time fee)
2. Create a new app in Play Console
3. Upload the .aab file from the build
4. Fill in app details, screenshots, description
5. Submit for review

## Features

- 💬 Real-time chat with AI
- 📁 File upload (images, documents, PDFs)
- 🎤 Audio file support
- 🎥 Video file support
- 💾 Conversation memory
- 🌙 Dark theme UI
- 📱 Native mobile experience

## Backend Setup

Make sure your FastAPI backend (app.py) is deployed and accessible:
- Deploy to Render, Railway, or any cloud service
- Update the API_URL in App.js with your backend URL
- Ensure CORS is enabled for mobile requests
