import { streamSSE } from "hono/streaming"
import { generateContentStream } from "../../../gemini-api-client/gemini-api-client.ts"
import type { OpenAI } from "../../../types.ts"
import { genModel } from "../../../utils.ts"
import type { ChatProxyHandlerType } from "./ChatProxyHandler.ts"

export const streamingChatProxyHandler: ChatProxyHandlerType = async (c, req, genAi) => {
  const log = c.var.log

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
