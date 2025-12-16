import OpenAI from "openai";
import { getCurrentWeather, getWeatherForecast, type WeatherData, type ForecastDay } from "../weather";
import { getProfileSection, getAllContacts, getContactByPhone } from "../db";
import { MASTER_ADMIN_PHONE, getContactFullName, type Contact } from "@shared/schema";
import * as cron from "node-cron";

const openai = new OpenAI();

interface FamilyContext {
  userName: string;
  spouse?: string;
  children: string[];
  location: string;
}

interface WeatherContext {
  current: WeatherData;
  forecast: ForecastDay[];
  todayForecast: ForecastDay | null;
}

interface SevereWeatherCondition {
  type: "extreme_cold" | "extreme_heat" | "severe_storm" | "high_wind" | "heavy_rain" | "snow_ice" | "tornado_warning" | "flooding";
  severity: "warning" | "watch" | "advisory";
  description: string;
  recommendation: string;
}

let sendAlertCallback: ((phones: string[], message: string) => Promise<void>) | null = null;
let lastAlertSent: Map<string, number> = new Map();
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export function setWeatherAlertCallback(callback: (phones: string[], message: string) => Promise<void>): void {
  sendAlertCallback = callback;
}

function loadFamilyContext(): FamilyContext {
  const basicInfo = getProfileSection("basic_info");
  const familyInfo = getProfileSection("family");
  
  let userName = "Nate";
  let location = "Abington, MA";
  let spouse: string | undefined;
  let children: string[] = [];
  
  if (basicInfo?.data) {
    try {
      const data = JSON.parse(basicInfo.data);
      if (data.fullName) {
        userName = data.fullName.split(" ")[0];
      }
      if (data.location) {
        location = data.location;
      }
    } catch {}
  }
  
  if (familyInfo?.data) {
    try {
      const data = JSON.parse(familyInfo.data);
      if (data.spouse?.displayName) {
        spouse = data.spouse.displayName;
      }
      if (data.children?.length > 0) {
        children = data.children.map((c: { displayName: string }) => c.displayName).filter(Boolean);
      }
    } catch {}
  }
  
  return { userName, spouse, children, location };
}

function detectSevereConditions(current: WeatherData, forecast: ForecastDay[]): SevereWeatherCondition[] {
  const conditions: SevereWeatherCondition[] = [];
  const todayForecast = forecast[0];
  
  if (current.temperature <= 10) {
    conditions.push({
      type: "extreme_cold",
      severity: "warning",
      description: `Dangerously cold: ${current.temperature}°F`,
      recommendation: "Limit outdoor exposure. Frostbite risk within 30 minutes."
    });
  } else if (current.temperature <= 20) {
    conditions.push({
      type: "extreme_cold",
      severity: "advisory",
      description: `Very cold: ${current.temperature}°F`,
      recommendation: "Bundle up warmly. Keep extremities covered."
    });
  }
  
  if (current.temperature >= 100) {
    conditions.push({
      type: "extreme_heat",
      severity: "warning",
      description: `Extreme heat: ${current.temperature}°F`,
      recommendation: "Stay indoors in AC. Hydrate frequently. Check on vulnerable family members."
    });
  } else if (current.temperature >= 95) {
    conditions.push({
      type: "extreme_heat",
      severity: "advisory",
      description: `High heat: ${current.temperature}°F`,
      recommendation: "Limit outdoor activities during peak hours. Stay hydrated."
    });
  }
  
  if (current.windSpeed >= 50) {
    conditions.push({
      type: "high_wind",
      severity: "warning",
      description: `Dangerous winds: ${current.windSpeed} mph`,
      recommendation: "Stay indoors. Secure outdoor items. Avoid driving if possible."
    });
  } else if (current.windSpeed >= 35) {
    conditions.push({
      type: "high_wind",
      severity: "advisory",
      description: `High winds: ${current.windSpeed} mph`,
      recommendation: "Be cautious outdoors. Secure loose items."
    });
  }
  
  const desc = current.description.toLowerCase();
  if (desc.includes("thunderstorm") || desc.includes("severe")) {
    conditions.push({
      type: "severe_storm",
      severity: desc.includes("severe") ? "warning" : "watch",
      description: `Storm conditions: ${current.description}`,
      recommendation: "Stay indoors. Avoid windows. Be prepared for power outages."
    });
  }
  
  if (desc.includes("tornado")) {
    conditions.push({
      type: "tornado_warning",
      severity: "warning",
      description: "Tornado conditions possible",
      recommendation: "TAKE SHELTER IMMEDIATELY in lowest interior room. Stay away from windows."
    });
  }
  
  if (desc.includes("snow") || desc.includes("blizzard") || desc.includes("ice")) {
    if (desc.includes("heavy") || desc.includes("blizzard")) {
      conditions.push({
        type: "snow_ice",
        severity: "warning",
        description: `Winter storm: ${current.description}`,
        recommendation: "Avoid travel. Stock up on essentials. Keep devices charged."
      });
    }
  }
  
  if (todayForecast && todayForecast.precipitation >= 90 && (desc.includes("rain") || desc.includes("shower"))) {
    conditions.push({
      type: "heavy_rain",
      severity: "advisory",
      description: `Heavy rain expected: ${todayForecast.precipitation}% chance`,
      recommendation: "Watch for localized flooding. Allow extra travel time."
    });
  }
  
  return conditions;
}

export async function generateAIWeatherBriefing(
  city: string = "Abington",
  state: string = "MA"
): Promise<string> {
  const current = await getCurrentWeather(city, state, "US");
  const forecast = await getWeatherForecast(city, state, "US", 3);
  const todayForecast = forecast[0] || null;
  const family = loadFamilyContext();
  const severeConditions = detectSevereConditions(current, forecast);
  
  const familyMembers = [family.userName];
  if (family.spouse) familyMembers.push(family.spouse);
  familyMembers.push(...family.children);
  
  const prompt = `You are ZEKE, a personal AI assistant creating a morning weather briefing. Generate a concise, personalized weather briefing in exactly this format:

ZEKE MORNING WEATHER BRIEFING

[Opening paragraph: Describe current conditions naturally - temperature as descriptive (mid-30s, upper 40s), conditions, and what to expect today. 2-3 sentences max.]

What to do:
[4-6 bullet points with actionable advice. Personalize for family members: ${familyMembers.join(", ")}. Include specific clothing/gear recommendations. Reference evening plans if temps will change significantly.]

[Final line: "I'll watch for shifts and alert you if [specific weather concern changes]." OR if no concerns: "Looks like a calm day ahead - I'll let you know if anything changes."]

Current Weather Data:
- Temperature: ${current.temperature}°F (feels like ${current.feelsLike}°F)
- Conditions: ${current.description}
- Humidity: ${current.humidity}%
- Wind: ${current.windSpeed} mph
- Sunrise: ${current.sunrise}, Sunset: ${current.sunset}

Today's Forecast:
- High: ${todayForecast?.high || current.temperature}°F
- Low: ${todayForecast?.low || current.temperature}°F  
- Precipitation: ${todayForecast?.precipitation || 0}%

Upcoming:
${forecast.slice(1).map(d => {
  const dayName = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  return `- ${dayName}: High ${d.high}°, Low ${d.low}°, ${d.description}, ${d.precipitation}% rain`;
}).join('\n')}

${severeConditions.length > 0 ? `
WEATHER ALERTS:
${severeConditions.map(c => `- ${c.severity.toUpperCase()}: ${c.description}`).join('\n')}
` : ''}

Rules:
- Keep it concise and scannable - this goes via SMS
- Use natural temperature descriptions (mid-30s, upper 40s, near freezing)
- Mention family members by name in relevant bullet points
- For kids, focus on school-appropriate outerwear
- For evening, note if a jacket is needed for after-school/work
- If rain is coming but not immediate, specify timing
- Road conditions matter - mention if surfaces may be slick`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
    temperature: 0.7,
  });
  
  return response.choices[0].message.content || formatFallbackBriefing(current, todayForecast, family);
}

function formatFallbackBriefing(current: WeatherData, todayForecast: ForecastDay | null, family: FamilyContext): string {
  const lines = [
    "ZEKE MORNING WEATHER BRIEFING",
    "",
    `Right now it's ${current.temperature}°F and ${current.description}. ${todayForecast ? `Highs around ${todayForecast.high}° today.` : ''}`,
    "",
    "What to do:",
    `• Dress for ${current.temperature < 40 ? 'cold weather' : current.temperature > 80 ? 'heat' : 'comfortable temps'}`,
  ];
  
  if (todayForecast && todayForecast.precipitation > 30) {
    lines.push(`• Bring rain gear - ${todayForecast.precipitation}% chance of precipitation`);
  }
  
  if (current.windSpeed > 15) {
    lines.push(`• Windy conditions (${current.windSpeed} mph) - secure loose items`);
  }
  
  lines.push("");
  lines.push("I'll monitor conditions and alert you if anything changes significantly.");
  
  return lines.join("\n");
}

function getFamilyAlertPhones(): string[] {
  const phones: string[] = [MASTER_ADMIN_PHONE];
  const contacts = getAllContacts();
  
  for (const contact of contacts) {
    if (contact.canSetReminders && contact.phoneNumber && !phones.includes(contact.phoneNumber)) {
      phones.push(contact.phoneNumber);
    }
  }
  
  return phones;
}

export async function checkAndSendSevereWeatherAlerts(city: string = "Abington", state: string = "MA"): Promise<{
  alertsSent: boolean;
  conditions: SevereWeatherCondition[];
  recipients: number;
}> {
  const current = await getCurrentWeather(city, state, "US");
  const forecast = await getWeatherForecast(city, state, "US", 2);
  const conditions = detectSevereConditions(current, forecast);
  
  const warningConditions = conditions.filter(c => c.severity === "warning");
  
  if (warningConditions.length === 0) {
    return { alertsSent: false, conditions: [], recipients: 0 };
  }
  
  const alertKey = warningConditions.map(c => c.type).sort().join(",");
  const lastAlert = lastAlertSent.get(alertKey);
  
  if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) {
    console.log(`[WeatherAlert] Skipping - alert for ${alertKey} sent within cooldown period`);
    return { alertsSent: false, conditions: warningConditions, recipients: 0 };
  }
  
  if (!sendAlertCallback) {
    console.log("[WeatherAlert] No alert callback configured");
    return { alertsSent: false, conditions: warningConditions, recipients: 0 };
  }
  
  const phones = getFamilyAlertPhones();
  
  const alertMessage = [
    "ZEKE WEATHER ALERT",
    "",
    ...warningConditions.map(c => `${c.severity.toUpperCase()}: ${c.description}`),
    "",
    "Recommendations:",
    ...warningConditions.map(c => `• ${c.recommendation}`),
    "",
    `Current: ${current.temperature}°F, ${current.description}`,
    "",
    "Stay safe. I'll continue monitoring."
  ].join("\n");
  
  try {
    await sendAlertCallback(phones, alertMessage);
    lastAlertSent.set(alertKey, Date.now());
    console.log(`[WeatherAlert] Sent ${warningConditions.length} warning(s) to ${phones.length} recipients`);
    return { alertsSent: true, conditions: warningConditions, recipients: phones.length };
  } catch (error) {
    console.error("[WeatherAlert] Failed to send alerts:", error);
    return { alertsSent: false, conditions: warningConditions, recipients: 0 };
  }
}

let weatherMonitorTask: cron.ScheduledTask | null = null;
let monitorCity = "Abington";
let monitorState = "MA";

export function startWeatherMonitoring(city: string = "Abington", state: string = "MA"): void {
  if (weatherMonitorTask) {
    weatherMonitorTask.stop();
  }
  
  monitorCity = city;
  monitorState = state;
  
  weatherMonitorTask = cron.schedule("0 */2 * * *", async () => {
    console.log(`[WeatherMonitor] Checking for severe weather in ${monitorCity}, ${monitorState}...`);
    try {
      const result = await checkAndSendSevereWeatherAlerts(monitorCity, monitorState);
      if (result.alertsSent) {
        console.log(`[WeatherMonitor] Sent ${result.conditions.length} alert(s) to ${result.recipients} people`);
      }
    } catch (error) {
      console.error("[WeatherMonitor] Check failed:", error);
    }
  }, {
    timezone: "America/New_York",
  });
  
  console.log(`[WeatherMonitor] Started monitoring ${city}, ${state} (every 2 hours)`);
}

export function stopWeatherMonitoring(): void {
  if (weatherMonitorTask) {
    weatherMonitorTask.stop();
    weatherMonitorTask = null;
    console.log("[WeatherMonitor] Stopped");
  }
}

export function getWeatherMonitoringStatus(): { active: boolean; city: string; state: string } {
  return {
    active: weatherMonitorTask !== null,
    city: monitorCity,
    state: monitorState,
  };
}

export const weatherTools = [
  {
    name: "get_weather_briefing",
    description: "Generate a personalized morning weather briefing with actionable advice for the whole family. Uses AI to create natural, narrative-style updates with specific recommendations.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name (default: Abington)",
        },
        state: {
          type: "string",
          description: "State abbreviation (default: MA)",
        },
      },
      required: [],
    },
    execute: async (params: { city?: string; state?: string }) => {
      try {
        const briefing = await generateAIWeatherBriefing(
          params.city || "Abington",
          params.state || "MA"
        );
        return JSON.stringify({
          success: true,
          briefing,
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  },
  {
    name: "check_severe_weather",
    description: "Check current weather conditions for severe weather and optionally send alerts to family members.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name (default: Abington)",
        },
        state: {
          type: "string",
          description: "State abbreviation (default: MA)",
        },
        sendAlerts: {
          type: "boolean",
          description: "Whether to send SMS alerts to family if severe conditions are found",
        },
      },
      required: [],
    },
    execute: async (params: { city?: string; state?: string; sendAlerts?: boolean }) => {
      try {
        const city = params.city || "Abington";
        const state = params.state || "MA";
        
        if (params.sendAlerts) {
          const result = await checkAndSendSevereWeatherAlerts(city, state);
          return JSON.stringify({
            success: true,
            ...result,
          });
        } else {
          const current = await getCurrentWeather(city, state, "US");
          const forecast = await getWeatherForecast(city, state, "US", 2);
          const conditions = detectSevereConditions(current, forecast);
          
          return JSON.stringify({
            success: true,
            hasSevereConditions: conditions.length > 0,
            conditions,
            current: {
              temperature: current.temperature,
              description: current.description,
              windSpeed: current.windSpeed,
            },
          });
        }
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  },
  {
    name: "configure_weather_monitoring",
    description: "Start or stop automatic severe weather monitoring that sends alerts to family when dangerous conditions are detected.",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "Enable or disable weather monitoring",
        },
        city: {
          type: "string",
          description: "City to monitor (default: Abington)",
        },
        state: {
          type: "string",
          description: "State to monitor (default: MA)",
        },
      },
      required: ["enabled"],
    },
    execute: async (params: { enabled: boolean; city?: string; state?: string }) => {
      try {
        if (params.enabled) {
          startWeatherMonitoring(params.city || "Abington", params.state || "MA");
          return JSON.stringify({
            success: true,
            message: `Weather monitoring enabled for ${params.city || "Abington"}, ${params.state || "MA"}`,
            status: getWeatherMonitoringStatus(),
          });
        } else {
          stopWeatherMonitoring();
          return JSON.stringify({
            success: true,
            message: "Weather monitoring disabled",
            status: getWeatherMonitoringStatus(),
          });
        }
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  },
];
