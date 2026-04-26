import OpenAI from "openai";

export type CallLlmInput = {
  systemPrompt: string;
  userPayload: string;
  model?: string;
};

const client = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY не задан");
  }
  return new OpenAI({ apiKey: key });
};

/**
 * Сначала пробуем Responses API (если доступна в SDK), иначе chat.completions.
 * Модель: `OPENAI_ANALYTICS_MODEL` или gpt-4o-mini.
 */
export async function callLlm({ systemPrompt, userPayload, model }: CallLlmInput): Promise<string> {
  const resolvedModel = model ?? process.env.OPENAI_ANALYTICS_MODEL ?? "gpt-4o-mini";
  const c = client();
  const input = `Данные (JSON):\n${userPayload}`;

  const completion = await c.chat.completions.create({
    model: resolvedModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}
