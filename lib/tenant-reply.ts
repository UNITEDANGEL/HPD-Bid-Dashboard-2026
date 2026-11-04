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

// 🌎 Tenant texts in Spanish (owner idea, 4 Nov): the helper shows what they wrote in English and offers the answer in Spanish.
const SPANISH_WORDS = /\b(hola|gracias|buenas|buenos|d[ií]as|tardes|noches|s[ií]|no estoy|estoy|casa|ma[ñn]ana|hoy|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|cuando|cu[aá]ndo|puede|pueden|por favor|quien|qui[eé]n|apartamento|reparaci[oó]n|trabajo|hora|favor|ya|arreglaron|arreglado|tengo|puedo|pueda|vengan|venir)\b/g;

export function isSpanishText(body: string): boolean {
  const t = String(body || "").toLowerCase();
  if (/[¿¡ñáéíóú]/.test(t) && (t.match(SPANISH_WORDS) || []).length >= 1) return true;
  return (t.match(SPANISH_WORDS) || []).length >= 2;
}

// A short English gist from the common phrases tenants use (no outside service, nothing leaves the phone).
export function spanishToEnglish(body: string): string {
  const t = ` ${String(body || "").toLowerCase().replace(/[’']/g, "'")} `;
  const gist: string[] = [];
  if (/\b(quien es|qui[eé]n es|qui[eé]n habla)\b/.test(t)) gist.push("who is this?");
  if (/\b(ya (lo )?arreglaron|ya est[aá] arreglado|ya lo hicieron|arreglado)\b/.test(t)) gist.push("it was already fixed");
  if (/\bno (estoy|puedo|tengo)\b|\bno pueden\b/.test(t)) gist.push("I can't / I'm not home");
  if (/\bma[ñn]ana\b/.test(t)) gist.push("tomorrow");
  if (/\bhoy\b/.test(t)) gist.push("today");
  for (const [re, en] of [[/\blunes\b/, "Monday"], [/\bmartes\b/, "Tuesday"], [/\bmi[eé]rcoles\b/, "Wednesday"], [/\bjueves\b/, "Thursday"], [/\bviernes\b/, "Friday"], [/\bs[aá]bado\b/, "Saturday"], [/\bdomingo\b/, "Sunday"]] as [RegExp, string][]) if (re.test(t)) gist.push(en);
  const hour = t.match(/\ba las (\d{1,2})(?::(\d{2}))?\b/);
  if (hour) gist.push(`at ${hour[1]}${hour[2] ? `:${hour[2]}` : ""}`);
  if (/\b(s[ií]|claro|est[aá] bien|perfecto|de acuerdo)\b/.test(t) && !gist.length) gist.push("yes, OK");
  if (/\b(gracias)\b/.test(t)) gist.push("thank you");
  return gist.length ? gist.join(", ") : "(I could not translate it: the words are shown as they came)";
}

export function suggestTenantReplyEs(body: string): string {
  const t = ` ${String(body || "").toLowerCase()} `;
  if (/\b(no (me )?escriban|equivocado|n[uú]mero equivocado)\b/.test(t)) return "";
  if (/\b(quien es|qui[eé]n es|qui[eé]n habla)\b/.test(t)) return "Somos United Angel Construction, el contratista que HPD envió para la reparación en su apartamento. ¿Qué día y hora le conviene?";
  if (/\b(ya (lo )?arreglaron|ya est[aá] arreglado|ya lo hicieron)\b/.test(t)) return "Gracias por avisarnos. ¿Todo funciona ahora? Es posible que aún necesitemos una foto para HPD.";
  if (/\bno (estoy|puedo|tengo)\b|\bno pueden\b/.test(t)) return "No hay problema. ¿Qué día y hora le conviene esta semana? Podemos ir de lunes a viernes de 9 AM a 4 PM.";
  return "Gracias. ¿Qué día y hora le conviene para la reparación? Podemos ir de lunes a viernes de 9 AM a 4 PM.";
}
