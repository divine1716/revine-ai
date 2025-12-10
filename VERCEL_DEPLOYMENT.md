# Deploy to Vercel - Step by Step

## Why Vercel?
- ✅ Faster than Render
- ✅ Better performance
- ✅ Automatic deployments
- ✅ Free tier with good limits
- ✅ Global CDN

## Deployment Steps:

### 1. Create Vercel Account
1. Go to https://vercel.com
2. Sign up with GitHub (same account you used for the repo)

### 2. Deploy Your App
1. Click "New Project" in Vercel dashboard
2. Import your GitHub repo: `divine1716/revine-ai`
3. Vercel will auto-detect it's a Python app
4. Click "Deploy"

### 3. Add Environment Variable
1. In Vercel dashboard, go to your project
2. Click "Settings" → "Environment Variables"
3. Add:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key (from .env file)
4. Click "Save"

### 4. Redeploy
1. Go to "Deployments" tab
2. Click "Redeploy" on the latest deployment
3. Wait for it to finish

### 5. Get Your New URL
Your app will be available at: `https://your-project-name.vercel.app`

### 6. Update Mobile App
Update the API_URL in `mobile-app/App.js`:
```javascript
const API_URL = 'https://your-project-name.vercel.app';
```

## Benefits of Vercel:
- **Faster**: Edge functions run closer to users
- **Automatic**: Deploys on every git push
- **Reliable**: 99.99% uptime
- **Free**: Generous free tier
- **Global**: CDN in 100+ locations

## File Structure for Vercel:
```
├── app.py (your main FastAPI app)
├── vercel.json (Vercel configuration)
├── api/
│   └── index.py (Vercel entry point)
├── requirements.txt
└── mobile-app/
```

Your app is now ready for Vercel deployment! 🚀