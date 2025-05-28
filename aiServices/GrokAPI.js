const axios = require("axios");

// Groq API key yahan likh do
const API_KEY =
  process.env.GROK_API_KEY ||
  "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";

async function askGroqWithContext(question, context, prevHistory) {
  const filteredHistory = prevHistory.map(({ text, sender }) => ({
    text,
    sender,
  }));

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
   - Use the previous conversation history: ${filteredHistory} if the context is not so much clear or not avaiable, understand the previous history deeply, answer based on history, understand the sender and the user, messages from the history and then if the response is possible to make, then make it.
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

  console.log("Question", question);
  console.log("Prev history in the grok req is : ", filteredHistory);

  try {
    console.log("Req to grok");
    const response = await axios.post(
      process.env.GROK_API_URL ||
        "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.2, // kam random, zyada accurate
        max_tokens: 1024, // jitna bada answer chahiye, adjust kar sakte ho
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const answer = response.data.choices[0].message.content;

    return answer;
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    throw new Error("API Request Failed");
  }
}

module.exports = { askGroqWithContext };

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
