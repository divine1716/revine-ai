from mangum import Mangum
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Wrap FastAPI app with Mangum for serverless
handler = Mangum(app)