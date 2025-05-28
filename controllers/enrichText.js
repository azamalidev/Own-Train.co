async function enrichWithOpenAI(paragraph) {
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer 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",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "user",
              content: `Enrich this paragraph with better vocabulary and clarity:\n\n${paragraph} and return the context-rich paragraph only and do not include the heading or label of the paragarah e.g Enriched paragraph etc`,
            },
          ],
          temperature: 0.7,
        }),
      }
    );

    const data = await response.json();

    // Debug: Print full response in case of error
    if (!data.choices || !data.choices[0]) {
      console.error("❌ OpenAI API error response:", data);
      throw new Error("OpenAI API failed to return choices.");
    }

    console.log("🔹 Enriched Paragraph:", data.choices[0].message.content);
    return data.choices[0].message.content;
  } catch (err) {
    console.error("⚠️ Error enriching paragraph:", err.message);
  }
}
module.exports = { enrichWithOpenAI };
