const axios = require('axios');

// Groq API key yahan likh do
const API_KEY = process.env.GROK_API_KEY;
async function askGroqWithContext(
  question,
  context,
  prevHistory,
  existingSummary,
  lastSummarizedIndex
) {
  const filteredHistory = prevHistory.map(({ text, sender }) => ({
    text,
    sender,
  }));

  // 🧠 Update summary with new messages
  let updatedSummary = existingSummary;
  let newLastSummarizedIndex = lastSummarizedIndex;

  try {
    const summaryResult = await updateSummaryWithNewMessages(
      existingSummary,
      filteredHistory,
      lastSummarizedIndex
    );
    updatedSummary = summaryResult.updatedSummary;
    newLastSummarizedIndex = summaryResult.newLastSummarizedIndex;
  } catch (error) {
    console.error('Failed to update summary:', error.message);
  }

  const systemMessage =
    context && context.trim().length > 0
      ? `You are a helpful and intelligent assistant. Follow these instructions carefully:

1. CONTEXT UNDERSTANDING:
   - Read the entire CONTEXT thoroughly.
   - Understand the purpose, domain, and relationships between the facts provided.
   - If the context includes domain-specific material (e.g., legal, academic, technical), explain it clearly but naturally to the user.
   - Use examples or simplified language when needed to ensure user comprehension.

2. RESPONSE GUIDELINES:
   - Answer ONLY using the provided CONTEXT.
   - If something is **partially answered** in the CONTEXT, you may say: "Based on the available information..."
   - If something is **not covered at all**, say: "I don't have enough information in the context to answer that."
   - Avoid making assumptions or fabricating details not present in the context.
   - Make responses informative, human-like, and context-rich — as if explaining to someone eager to understand.
   - Use the previous conversation history: ${updatedSummary} if the context is not so much clear or not avaiable, understand the previous history deeply, answer based on history, understand the sender and the user, messages from the history and then if the response is possible to make, then make it.
4. FORMATTING:
   - Use short paragraphs or bullet points for clarity when needed.
   - Emphasize important terms or ideas using quotes or rephrasing for clarity.
   - Keep the tone helpful, conversational, and clear.

CONTEXT:
${context}`
      : `You are a helpful assistant. Since there is no context provided:

1. Respond only to greetings or general small talk.
   - Example: "Hello!" → "Hi there! How can I help you today?"

2. For all other questions :
   - Reply with: "Sorry, I don't have information about that yet. Could you tell me more so I can assist you better?"

3. Do not guess or make up answers. Always ask for more details if you're unsure.`;

  try {
    const response = await axios.post(
      process.env.GROK_API_URL ||
        'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: question },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      answer: response.data.choices[0].message.content.trim(),
      updatedSummary,
      newLastSummarizedIndex,
    };
  } catch (error) {
    console.error('Groq API Error:', error.response?.data || error.message);
    throw new Error('API Request Failed');
  }
}

async function updateSummaryWithNewMessages(
  existingSummary,
  allMessages,
  lastIndex
) {
  const newMessages = allMessages.slice(lastIndex + 1);

  if (newMessages.length === 0) {
    return {
      updatedSummary: existingSummary,
      newLastSummarizedIndex: lastIndex,
    };
  }

  const formattedNewMessages = newMessages
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Bot'}: ${msg.text}`)
    .join('\n');

  const prompt = `Current Summary:\n${existingSummary}\n\nNew Messages:\n${formattedNewMessages}\n\nUpdate the summary accordingly.`;

  const updatedSummary = await askGroqForSummary(prompt);

  return {
    updatedSummary,
    newLastSummarizedIndex: allMessages.length - 1,
  };
}
async function askGroqForSummary(prompt) {
  try {
    const response = await axios.post(
      process.env.GROK_API_URL ||
        'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content:
              'You are a smart summarizer. Read the conversation and provide a concise updated summary.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error(error.response?.data || error.message);
    throw new Error('Summary API failed');
  }
}

module.exports = { askGroqWithContext, askGroqForSummary };

// Example usage agar direct run karna hai:
// if (require.main === module) {
//   const context = `
//   Doctor Name: Dr. Sarah
//   Specialization: Cardiologist
//   Clinic: Heart Care Hospital
//   Contact: 123-456-7890
//   `;

//   const question = "Who is a cardiologist available?";

//   askGroqWithContext(context, question)
//     .then((answer) => console.log("Answer:", answer))
//     .catch((err) => console.error(err.message));
// }
