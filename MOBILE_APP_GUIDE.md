# Revine AI - Mobile App Deployment Guide

## Quick Start

### 1. Setup Mobile App
```bash
cd mobile-app
npm install
```

### 2. Update Backend URL
Open `mobile-app/App.js` and change line 12:
```javascript
const API_URL = 'https://your-backend-url.com';
```
Replace with your actual backend URL (from Render deployment or wherever your FastAPI backend is hosted).

### 3. Test on Your Phone
```bash
npm start
```
- Install "Expo Go" app on your Android phone
- Scan the QR code to test the app

## Publishing to Google Play Store

### Step 1: Create Google Play Developer Account
1. Go to https://play.google.com/console
2. Pay $25 one-time registration fee
3. Complete account setup

### Step 2: Install EAS CLI
```bash
npm install -g eas-cli
```

### Step 3: Login to Expo
```bash
npx expo login
```
Create a free account at https://expo.dev if you don't have one.

### Step 4: Configure Your App
Edit `mobile-app/app.json`:
- Change `android.package` to your unique package name (e.g., `com.yourname.revineai`)
- Update app name, description, etc.

### Step 5: Build for Play Store
```bash
cd mobile-app
npx eas build --platform android --profile production
```
This creates an .aab file (Android App Bundle) for Play Store.

### Step 6: Upload to Play Store
1. Go to Google Play Console
2. Create new app
3. Upload the .aab file
4. Add screenshots, description, privacy policy
5. Submit for review

## App Features

✅ Native Android app
✅ Chat with AI (GPT-4o-mini)
✅ Upload images, documents, PDFs
✅ Audio & video file support
✅ Conversation memory
✅ Dark theme UI
✅ File attachments with preview

## Backend Requirements

Your FastAPI backend must be:
- Deployed and publicly accessible (Render, Railway, etc.)
- CORS enabled for mobile requests (already configured in app.py)
- Using HTTPS (required for production apps)

## Testing Before Publishing

Build a test APK:
```bash
npx eas build --platform android --profile preview
```
Install the APK on your phone to test before submitting to Play Store.

## Costs

- Google Play Developer Account: $25 (one-time)
- Expo Account: Free
- Backend Hosting: Free tier available (Render, Railway)

## Support

If you encounter issues:
1. Check that backend URL is correct and accessible
2. Ensure backend is using HTTPS
3. Test with Expo Go first before building
4. Check Expo build logs for errors

## Next Steps

1. Deploy your backend (app.py) to a cloud service
2. Update API_URL in mobile app
3. Test with Expo Go
4. Build and publish to Play Store
5. Market your app!
