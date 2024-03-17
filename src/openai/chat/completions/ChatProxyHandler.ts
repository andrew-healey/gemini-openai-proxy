import type { Handler } from "hono"

import type { ContextWithLogger } from "../../../app.ts"
import type { OpenAI } from "../../../types.ts"
import { getToken, removeSystem } from "../../../utils.ts"
import type { ApiParam } from "../../../utils.ts"
import { nonStreamingChatProxyHandler } from "./NonStreamingChatProxyHandler.ts"
import { streamingChatProxyHandler } from "./StreamingChatProxyHandler.ts"
import { ReadableStream, WritableStream } from "stream/web";
import * as fs from "fs";
import Anthropic from '@anthropic-ai/sdk';
import { streamSSE } from "hono/streaming"

const openaiKey = process.env.OPENAI_API_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
const groqKey = process.env.GROQ_API_KEY

export const pipeAndSave = async (fetchResponse: Response):Response => {
      // Inside your if (fetchResponse.body) block
      const [stream1, stream2] = fetchResponse.body.tee();

      // wipe output.json
      await fs.promises.writeFile("output.json", new Uint8Array([]));

      const writableStreamForFile = new WritableStream({
        async write(chunk) {
          await fs.promises.writeFile("output.json", new Uint8Array(chunk), { flag: 'a' });
        },
        close() {
          console.log('File stream closed.');
        },
        abort(err) {
          console.error('File stream aborted:', err);
        }
      });

      // Use stream1 for writing to the file
      await stream1.pipeTo(writableStreamForFile);

      // Return stream2 in the Response
      return new Response(stream2);
}

async function* anthropicStreamingToOpenAI(
	stream: AsyncIterable<unknown>
): AsyncGenerator {
	for await (const message of stream) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const delta = (message as any).delta;
		if (delta === undefined) continue;
		if (delta.text === undefined) continue;
		if (typeof delta.text !== 'string') continue;
		if (delta.text.length === 0) continue;
		yield {
			id: "hi",
			object: "hi",
			created: 0,
			model: "hi",
			choices: [
				{
					delta: {
						role: "assistant",
						content: delta.text,
					}
				}
			]
		}
	}
}




export const chatProxyHandler: Handler = async (c: ContextWithLogger) => {
  const log = c.var.log

  const req = await c.req.json<OpenAI.Chat.ChatCompletionCreateParams>()
  log.debug(req)
  const headers = c.req.header()
  const apiParam = getToken(headers)
  const { model } = req;
  console.log("inferencing", model, "request is", JSON.stringify(req).length, "bytes")

  fs.writeFileSync("input.json",JSON.stringify(req,null,2));

  if (model.includes("gpt")) {
    const fetchResponse = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify(req),
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (fetchResponse.body) return pipeAndSave(fetchResponse);

  } else if (model.includes("mixtral")) {
    const fetchResponse = await fetch(`https://api.groq.com/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify(req),
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (fetchResponse.body) return pipeAndSave(fetchResponse);
  } else if (model.includes("claude")) {
    const client = new Anthropic();

    console.log("anthropic req",req)

    const deSystemified = removeSystem(req.messages);

    const stream = await client.messages.stream({
      model,
      max_tokens: 1024,
      ...req,
      messages: deSystemified,
    });

    return streamSSE(c, async (sseStream) => {
      for await (const chunk of anthropicStreamingToOpenAI(stream)) {
        await sseStream.writeSSE({
          data: JSON.stringify(chunk),
        })
      }
      await sseStream.close()
    });


  }
  if (apiParam == null) {
    return c.text("Unauthorized", 401)
  }

  if (req.stream === true) {
    return streamingChatProxyHandler(c, req, apiParam)
  }
  return nonStreamingChatProxyHandler(c, req, apiParam)
}

export type ChatProxyHandlerType = (
  c: ContextWithLogger,
  req: OpenAI.Chat.ChatCompletionCreateParams,
  apiParam: ApiParam,
) => Promise<Response>
