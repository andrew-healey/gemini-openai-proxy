import OpenAI from "openai";

const openai = new OpenAI();

async function main() {
    const stream = await openai.chat.completions.create({
        model: "claude-3-sonnet-20240229",
        messages: [{ role: "user", content: "Say this is a test" }],
        stream: true,
    });
    for await (const chunk of stream) {
        console.log(chunk)
        // process.stdout.write(chunk.choices[0]?.delta?.content || "");
    }
}

main();