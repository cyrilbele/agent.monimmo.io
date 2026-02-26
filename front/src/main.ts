export const formatAssistantGreeting = (agentName: string): string => {
  if (!agentName.trim()) {
    return "Assistant Monimmo IA prêt.";
  }

  return `Assistant Monimmo IA prêt pour ${agentName.trim()}.`;
};

