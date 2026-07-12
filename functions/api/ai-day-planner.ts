type Env = {
  AI?: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

type PlannerRequest = {
  message?: string;
  previousResponseId?: string | null;
  currentPlan?: Record<string, unknown> | null;
};

type PagesContext = {
  request: Request;
  env: Env;
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    needs_clarification: { type: "boolean" },
    clarification_question: { type: ["string", "null"] },
    plan_ready: { type: "boolean" },
    plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        start_mode: { type: "string", enum: ["current_location", "office", "custom"] },
        start_location_text: { type: ["string", "null"] },
        boroughs: { type: "array", items: { type: "string" } },
        avoid_boroughs: { type: "array", items: { type: "string" } },
        priorities: { type: "array", items: { type: "string" } },
        stop_count: { type: "integer", minimum: 1, maximum: 12 },
        include_omo: { type: "array", items: { type: "string" } },
        exclude_omo: { type: "array", items: { type: "string" } },
        finish_by: { type: ["string", "null"] },
        route_preference: {
          type: "string",
          enum: ["shortest_drive", "highest_priority", "balanced", "appointments_first"],
        },
        notes: { type: "array", items: { type: "string" } },
      },
      required: [
        "start_mode",
        "start_location_text",
        "boroughs",
        "avoid_boroughs",
        "priorities",
        "stop_count",
        "include_omo",
        "exclude_omo",
        "finish_by",
        "route_preference",
        "notes",
      ],
    },
  },
  required: ["reply", "needs_clarification", "clarification_question", "plan_ready", "plan"],
} as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function outputText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

function localPlanner(message: string, current: Record<string, any> | null) {
  const text = message.toLowerCase();
  const boroughNames = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
  const mentioned = boroughNames.filter((borough) => text.includes(borough.toLowerCase()));
  const countMatch = text.match(/\b(\d{1,2})(?:\s+[a-z]+){0,2}\s+(?:jobs?|stops?)\b/);
  const omoIds = Array.from(new Set(message.toUpperCase().match(/\b(?:EQ|ER)\d{5}\b/g) || []));
  const finishMatch = message.match(/finish(?:\s+by)?\s+([^,.]+)/i);
  const priorities = [
    ...(text.includes("urgent") ? ["urgent"] : []),
    ...(text.includes("overdue") ? ["overdue"] : []),
    ...(text.includes("appointment") ? ["appointments"] : []),
  ];
  const plan = {
    start_mode: text.includes("office") ? "office" : current?.start_mode || "current_location",
    start_location_text: current?.start_location_text || null,
    boroughs: mentioned.length ? mentioned : current?.boroughs || [],
    avoid_boroughs: current?.avoid_boroughs || [],
    priorities: priorities.length ? priorities : current?.priorities || [],
    stop_count: Math.min(12, Math.max(1, Number(countMatch?.[1] || current?.stop_count || 5))),
    include_omo: omoIds.length ? omoIds : current?.include_omo || [],
    exclude_omo: current?.exclude_omo || [],
    finish_by: finishMatch?.[1]?.trim() || current?.finish_by || null,
    route_preference: text.includes("shortest")
      ? "shortest_drive"
      : text.includes("appointment")
        ? "appointments_first"
        : text.includes("priority") || text.includes("urgent") || text.includes("overdue")
          ? "highest_priority"
          : current?.route_preference || "balanced",
    notes: ["Created by the built-in planner while hosted AI is unavailable."],
  };
  const focus = plan.boroughs.length ? ` in ${plan.boroughs.join(", ")}` : " nearby";
  const priority = plan.priorities.length ? `, prioritizing ${plan.priorities.join(" and ")}` : "";
  return {
    reply: `I prepared ${plan.stop_count} stops${focus}${priority}. Review the working plan, then accept it to build the route.`,
    needs_clarification: false,
    clarification_question: null,
    plan_ready: true,
    plan,
    response_id: null,
  };
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  if (!env.AI && !env.OPENAI_API_KEY) {
    let fallbackBody: PlannerRequest;
    try {
      fallbackBody = (await request.json()) as PlannerRequest;
    } catch {
      return json({ error: "Invalid JSON request." }, 400);
    }
    const fallbackMessage = String(fallbackBody.message || "").trim();
    if (!fallbackMessage) return json({ error: "A message is required." }, 400);
    return json(localPlanner(fallbackMessage, fallbackBody.currentPlan || null));
  }

  let body: PlannerRequest;
  try {
    body = (await request.json()) as PlannerRequest;
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }

  const message = String(body.message || "").trim();
  if (!message) return json({ error: "A message is required." }, 400);
  if (message.length > 3000) return json({ error: "Message is too long." }, 400);

  const instructions = `You are the HPD AI Day Planner for a New York City field-work dashboard.
Your job is to have a natural, useful planning conversation and gradually produce a structured route request.
Do not invent OMO/job IDs. Only preserve OMO IDs explicitly supplied by the user.
Ask one concise clarification question when a key detail is missing or conflicting.
Understand requests about: current location, boroughs, urgent/overdue work, appointments, no-access follow-ups, stop count, finish time, shortest drive, highest priority, balancing urgency and travel, including or excluding specific OMO IDs.
Treat the current structured plan as editable working memory. Update only what the user changed and preserve the rest.
When enough information exists to rank jobs, set plan_ready=true. A plan can be ready even if some optional details are unspecified.
Keep replies practical and brief. Explain the interpreted plan and invite corrections.
Return only JSON matching the required schema.`;

  const currentPlan = body.currentPlan && typeof body.currentPlan === "object" ? body.currentPlan : null;
  const input = currentPlan
    ? `CURRENT STRUCTURED PLAN:\n${JSON.stringify(currentPlan)}\n\nUSER MESSAGE:\n${message}`
    : message;

  if (env.AI) {
    try {
      const result: any = await env.AI.run(
        env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast",
        {
          messages: [
            {
              role: "system",
              content: `${instructions}\nReturn valid JSON only. Do not use Markdown fences.`,
            },
            { role: "user", content: input },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "hpd_day_plan",
              strict: true,
              schema: PLAN_SCHEMA,
            },
          },
          max_tokens: 900,
        }
      );
      const cloudflareText =
        typeof result?.response === "string"
          ? result.response
          : typeof result === "string"
            ? result
            : "";
      const parsed = JSON.parse(cloudflareText);
      return json({ ...parsed, response_id: null });
    } catch (error) {
      if (!env.OPENAI_API_KEY) {
        const detail = error instanceof Error ? error.message : "Cloudflare Workers AI request failed.";
        return json({ error: detail }, 502);
      }
    }
  }

  const payload: Record<string, unknown> = {
    model: env.OPENAI_MODEL || "gpt-5-mini",
    instructions,
    input,
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "hpd_day_plan",
        strict: true,
        schema: PLAN_SCHEMA,
      },
    },
  };

  if (body.previousResponseId) payload.previous_response_id = body.previousResponseId;

  let openAIResponse: Response;
  try {
    openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: "Could not reach OpenAI." }, 502);
  }

  const raw: any = await openAIResponse.json().catch(() => null);
  if (!openAIResponse.ok) {
    const messageText = raw?.error?.message || "OpenAI request failed.";
    return json({ error: messageText }, openAIResponse.status >= 500 ? 502 : 400);
  }

  const text = outputText(raw);
  try {
    const parsed = JSON.parse(text);
    return json({ ...parsed, response_id: raw.id || null });
  } catch {
    return json({ error: "OpenAI returned an unreadable planning response." }, 502);
  }
};
