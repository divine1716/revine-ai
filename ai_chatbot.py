from openai import OpenAI
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize the OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Function to chat with the AI
def chat_with_ai(prompt):
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # fast + smart model
        messages=[
            {"role": "system", "content": "You are a helpful AI assistant."},
            {"role": "user", "content": prompt}
        ]
    )
    return response.choices[0].message.content

# Get user input
while True:
    user_input = input("You: ")
    if user_input.lower() in ["exit", "quit"]:
        print("Goodbye 👋")
        break

    ai_reply = chat_with_ai(user_input)
    print("AI:", ai_reply)
