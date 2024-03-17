import { streamSSE } from "hono/streaming"
import { generateContentStream } from "../../../gemini-api-client/gemini-api-client.ts"
import type { OpenAI } from "../../../types.ts"
import { genModel } from "../../../utils.ts"
import type { ChatProxyHandlerType } from "./ChatProxyHandler.ts"

export const generatorToSSE = async function* (gen: AsyncGenerator<OpenAI.Chat.ChatCompletionChunk>) {
  for await (const chunk of gen) {
    yield {
      data: JSON.stringify(chunk),
    }
  }
  yield { data: "[DONE]" }
}

export const streamingChatProxyHandler: ChatProxyHandlerType = async (c, req, genAi) => {
  const log = c.var.log
  const [model, geminiReq] = genModel(req)

  return streamSSE(c, async (sseStream) => {
    for await (const chunk of generatorToSSE(generateContentStream(genAi, model, geminiReq))) {
      await sseStream.writeSSE(chunk)
    }
    await sseStream.close()
  });

  return streamSSE(c, async (sseStream) => {
    const [model, geminiReq] = genModel(req)
    const geminiResp = await generateContentStream(genAi, model, geminiReq)

    for await (const chunk of geminiResp) {
      await sseStream.writeSSE({
        data: JSON.stringify(chunk),
      })
    }

    await sseStream.writeSSE({ data: "[DONE]" })
    await sseStream.close()
  })
}
