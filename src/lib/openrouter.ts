import axios from "axios";

// Handle both browser and Node.js environments
const OPENROUTER_API_KEY = typeof process !== 'undefined' ? process.env.VITE_OPENROUTER_API_KEY : import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function analyzeBillContent(content: string) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key is not set");
  }

  try {
    console.log("Sending request to OpenRouter...");
    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: "anthropic/claude-3-opus",
        messages: [
          {
            role: "user",
            content: `Please analyze this congressional bill and provide:
1. A concise title
2. Key points (as a list)
3. A brief analysis
4. Current status
5. List of sponsors
6. Committee assignments

Here's the content:
${content}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://github.com/TempoLabs/tempo",
          "X-Title": "Tempo Labs",
        },
      },
    );

    console.log("Received response from OpenRouter");
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Error analyzing bill:", error);
    throw error;
  }
}
