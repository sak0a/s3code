const PROJECT_CUSTOM_SYSTEM_PROMPT_TAG = "project_custom_system_prompt";

export function formatProjectCustomSystemPrompt(prompt: string | null | undefined): string | null {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    return null;
  }
  return [
    "Project custom system prompt:",
    `<${PROJECT_CUSTOM_SYSTEM_PROMPT_TAG}>`,
    trimmed,
    `</${PROJECT_CUSTOM_SYSTEM_PROMPT_TAG}>`,
  ].join("\n");
}

export function appendProjectCustomSystemPrompt(
  basePrompt: string,
  customPrompt: string | null | undefined,
): string {
  const formatted = formatProjectCustomSystemPrompt(customPrompt);
  return formatted ? `${basePrompt}\n\n${formatted}` : basePrompt;
}
