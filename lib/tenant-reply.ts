// 💬 Tenant answers in the chat (owner idea, 3 Nov): when a tenant texts back without a day and time, the helper reads
// it to you and offers an answer to send with one tap. Plain words, never the tenant's name or the address in the text.

export function suggestTenantReply(body: string): string {
  const t = ` ${String(body || "").toLowerCase().replace(/[’']/g, "'")} `;
  if (/\b(wrong number|stop texting|don'?t text|unsubscribe)\b/.test(t)) return "";
  if (/\b(who is this|who's this|what is this|what's this about|who are you)\b/.test(t)) return "This is United Angel Construction, the contractor HPD sent for the repair in your apartment. What day and time works for you?";
  if (/\b(no|not home|can'?t|cannot|busy|cancel|working|away|out of town)\b/.test(t)) return "No problem. What day and time works better for you this week? We can come weekdays 9 AM to 4 PM.";
  if (/\b(fixed|already done|done already|someone came|landlord fixed|super fixed)\b/.test(t)) return "Thank you for letting us know. Is everything working now? We may still need a quick photo for HPD.";
  if (/\b(yes|yeah|yep|ok|okay|sure|fine|sounds good|anytime|any time|home)\b/.test(t)) return "Thank you! What day and time works for you? We can come weekdays 9 AM to 4 PM.";
  return "Thank you. What day and time works for you for the repair?";
}
