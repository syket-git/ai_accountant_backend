# Expense Tracker Backend API

Backend API for the AI-powered Expense Tracker application. Handles OpenAI integration for transcription and expense extraction, and manages transactions in Supabase.

## Features

- 🎤 **Voice Transcription** - Uses OpenAI Whisper API to transcribe voice messages
- 🤖 **AI Expense Extraction** - Extracts structured expense data from natural language
- 💾 **Supabase Integration** - Stores transactions in PostgreSQL with RLS
- 🔒 **Multi-user Support** - Per-user transaction isolation
- 📊 **Transaction Management** - CRUD operations for expenses and income

## Tech Stack

- **Node.js** with Express
- **OpenAI API** (GPT-4 + Whisper)
- **Supabase** (PostgreSQL)
- **Multer** for file uploads

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the backend directory:

```bash
PORT=3001
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=xxxxxxxxxxxxx
```

**Getting Your Keys:**

- **OpenAI API Key**: Get from [platform.openai.com](https://platform.openai.com/api-keys)
- **Supabase URL & Key**: Get from your Supabase project settings → API

### 3. Set Up Database

Run the SQL migration in your Supabase SQL Editor:

```bash
# Copy and paste the contents of supabase-migrations.sql
# into Supabase Dashboard → SQL Editor → New Query
```

Or use the Supabase CLI:

```bash
supabase db push
```

### 4. Start the Server

**Development mode (with auto-reload):**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### POST `/api/process`

Main endpoint for processing text or voice input.

**Text Mode:**

```bash
curl -X POST http://localhost:3001/api/process \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "text",
    "text": "Spent 200 BDT on shopping",
    "userId": "user-uuid",
    "sessionId": "session-uuid"
  }'
```

**Voice Mode:**

```bash
curl -X POST http://localhost:3001/api/process \
  -F "mode=voice" \
  -F "userId=user-uuid" \
  -F "sessionId=session-uuid" \
  -F "file=@recording.webm"
```

**Response:**

```json
{
  "output": "💸 Successfully recorded expense: BDT 200 for shopping on 2025-11-22",
  "reply": "💸 Successfully recorded expense: BDT 200 for shopping on 2025-11-22",
  "data": {
    "amount": 200,
    "currency": "BDT",
    "category": "shopping",
    "notes": "shopping",
    "type": "expense",
    "date": "2025-11-22"
  }
}
```

### GET `/api/transactions/:userId`

Get all transactions for a user.

```bash
curl http://localhost:3001/api/transactions/user-uuid
```

### DELETE `/api/transactions/:id`

Delete a specific transaction.

```bash
curl -X DELETE http://localhost:3001/api/transactions/transaction-uuid
```

## Expense Categories

The AI automatically categorizes transactions into:

- `shopping` - General shopping, retail purchases
- `housing` - Rent, mortgage, utilities
- `food` - Groceries, restaurants, dining
- `transportation` - Gas, public transit, car maintenance
- `entertainment` - Movies, games, subscriptions
- `healthcare` - Medical expenses, insurance
- `education` - Tuition, books, courses
- `other` - Miscellaneous expenses

## Cost Tracking

### OpenAI API Costs (Approximate):

- **Whisper (transcription)**: ~$0.006 per minute of audio
- **GPT-4o-mini (extraction)**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens

### Example Usage Costs:

- 1 voice message (30 seconds): ~$0.003 transcription + ~$0.0001 extraction = **$0.0031**
- 1 text message: ~$0.0001 extraction = **$0.0001**
- 1000 text messages: ~**$0.10**
- 1000 voice messages: ~**$3.10**

## Troubleshooting

### "Missing Supabase environment variables"

Make sure you've created a `.env` file with all required variables.

### "Transcription failed"

- Check that your OpenAI API key is valid
- Ensure the audio file is in a supported format (webm, mp3, mp4, etc.)
- Check file size (max 25MB)

### "Failed to save transaction"

- Verify Supabase connection
- Check that the `transactions` table exists
- Ensure RLS policies are set up correctly

## Development

### File Structure

```
backend/
├── server.js              # Main Express server
├── services/
│   ├── openai.js         # OpenAI API integration
│   └── supabase.js       # Supabase database operations
├── supabase-migrations.sql # Database schema
├── package.json
└── .env                  # Environment variables (create this)
```

### Adding New Features

1. **New transaction fields**: Update the `transactions` table schema in `supabase-migrations.sql`
2. **New expense categories**: Update the OpenAI prompt in `services/openai.js`
3. **New endpoints**: Add routes in `server.js`

## License

MIT
