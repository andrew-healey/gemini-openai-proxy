import type { ApiParam, GeminiModel } from "../utils.ts"
import { GoogleGenerativeAIError } from "./errors.ts"
import { addHelpers } from "./response-helper.ts"
import type { GenerateContentRequest, GenerateContentResponse, GenerateContentResult, RequestOptions } from "./types.ts"
import { VertexAI } from '@google-cloud/vertexai';
import { writeFileSync } from "fs";

const project = process.env.GCP_PROJECT_ID;

export async function generateContent(
  apiParam: ApiParam,
  model: GeminiModel,
  params: GenerateContentRequest,
  requestOptions?: RequestOptions,
): Promise<GenerateContentResult> {
  // Initialize Vertex with your Cloud project and location
  const vertexAI = new VertexAI({project, location: "us-central1"});

  // Instantiate the model
  console.log(model)
  const generativeModel = vertexAI.getGenerativeModel({
    model: model, // Assuming GeminiModel has a name property that corresponds to the model ID
  });

  // Construct the request
  // Assuming params can be directly used or slightly transformed to match the expected structure
  const request = params;
  // console.log(request)
  // console.log(JSON.stringify(request.contents,null,2))

  writeFileSync("input.json",JSON.stringify(request,null,2));
  

  // Generate content using the Vertex AI SDK
  const responseStream = await generativeModel.generateContent(request);

  // Wait for the response stream to complete
  const aggregatedResponse = await responseStream;
  const text = await aggregatedResponse.response.candidates[0].content.parts.filter((part) => "text" in part).map((part) => part.text).join(" ");

  // Process the response to match GenerateContentResult structure
  // const result: GenerateContentResult = aggregatedResponse;

  return {response:{text: () => text}};
}

export async function makeRequest(url: RequestUrl, body: string, requestOptions?: RequestOptions): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url.toString(), {
      ...buildFetchOptions(requestOptions),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    })
    if (!response.ok) {
      let message = ""
      try {
        const json = await response.json()
        message = json.error.message
        if (json.error.details) {
          message += ` ${JSON.stringify(json.error.details)}`
        }
      } catch (e) {
        // ignored
      }
      throw new Error(`[${response.status} ${response.statusText}] ${message}`)
    }
  } catch (e) {
    const err = new GoogleGenerativeAIError(`Error fetching from ${url.toString()}: ${e.message}`)
    err.stack = e.stack
    throw err
  }
  return response
}

export class RequestUrl {
  constructor(
    public model: string,
    public task: Task,
    public stream: boolean,
    public apiParam: ApiParam,
  ) {}
  toString(): string {
    const urlSearchParams = new URLSearchParams({
      key: this.apiParam.apikey,
    })
    if (this.stream) {
      urlSearchParams.append("alt", "sse")
    }

    const api_version = this.apiParam.useBeta ? API_VERSION.v1beta : API_VERSION.v1

    const url = `${BASE_URL}/${api_version}/models/${this.model}:${this.task}?${urlSearchParams.toString()}`

    return url
  }
}

export enum Task {
  GENERATE_CONTENT = "generateContent",
  STREAM_GENERATE_CONTENT = "streamGenerateContent",
  COUNT_TOKENS = "countTokens",
  EMBED_CONTENT = "embedContent",
  BATCH_EMBED_CONTENTS = "batchEmbedContents",
}

const BASE_URL = "https://generativelanguage.googleapis.com"

enum API_VERSION {
  v1beta = "v1beta",
  v1 = "v1",
}

/**
 * Generates the request options to be passed to the fetch API.
 * @param requestOptions - The user-defined request options.
 * @returns The generated request options.
 */
function buildFetchOptions(requestOptions?: RequestOptions): RequestInit {
  const fetchOptions = {} as RequestInit
  if (requestOptions?.timeout) {
    const abortController = new AbortController()
    const signal = abortController.signal
    setTimeout(() => abortController.abort(), requestOptions.timeout)
    fetchOptions.signal = signal
  }
  return fetchOptions
}
