export interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  sunrise: string;
  sunset: string;
}

export interface ForecastDay {
  date: string;
  high: number;
  low: number;
  description: string;
  icon: string;
  precipitation: number;
}

const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;

export async function getCurrentWeather(
  city: string = "Boston",
  state: string = "MA",
  country: string = "US"
): Promise<WeatherData> {
  if (!OPENWEATHERMAP_API_KEY) {
    throw new Error("OpenWeatherMap API key not configured");
  }

  const locationQuery = state ? `${city},${state},${country}` : `${city},${country}`;
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(locationQuery)}&appid=${OPENWEATHERMAP_API_KEY}&units=imperial`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  const sunrise = new Date(data.sys.sunrise * 1000);
  const sunset = new Date(data.sys.sunset * 1000);
  
  return {
    location: `${data.name}, ${data.sys.country}`,
    temperature: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    description: data.weather[0].description,
    icon: data.weather[0].icon,
    windSpeed: Math.round(data.wind.speed),
    sunrise: sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }),
    sunset: sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }),
  };
}

export async function getWeatherForecast(
  city: string = "Boston",
  state: string = "MA",
  country: string = "US",
  days: number = 5
): Promise<ForecastDay[]> {
  if (!OPENWEATHERMAP_API_KEY) {
    throw new Error("OpenWeatherMap API key not configured");
  }

  const locationQuery = state ? `${city},${state},${country}` : `${city},${country}`;
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(locationQuery)}&appid=${OPENWEATHERMAP_API_KEY}&units=imperial`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  const dailyData: { [date: string]: { temps: number[], descriptions: string[], icons: string[], precipitation: number[] } } = {};
  
  for (const item of data.list) {
    const date = item.dt_txt.split(' ')[0];
    if (!dailyData[date]) {
      dailyData[date] = { temps: [], descriptions: [], icons: [], precipitation: [] };
    }
    dailyData[date].temps.push(item.main.temp);
    dailyData[date].descriptions.push(item.weather[0].description);
    dailyData[date].icons.push(item.weather[0].icon);
    dailyData[date].precipitation.push(item.pop * 100);
  }
  
  const forecast: ForecastDay[] = [];
  const dates = Object.keys(dailyData).slice(0, days);
  
  for (const date of dates) {
    const dayData = dailyData[date];
    forecast.push({
      date,
      high: Math.round(Math.max(...dayData.temps)),
      low: Math.round(Math.min(...dayData.temps)),
      description: dayData.descriptions[Math.floor(dayData.descriptions.length / 2)],
      icon: dayData.icons[Math.floor(dayData.icons.length / 2)],
      precipitation: Math.round(Math.max(...dayData.precipitation)),
    });
  }
  
  return forecast;
}

export function formatWeatherForSms(weather: WeatherData): string {
  return `Weather in ${weather.location}: ${weather.temperature}°F (feels like ${weather.feelsLike}°F), ${weather.description}. Humidity: ${weather.humidity}%. Wind: ${weather.windSpeed} mph. Sunrise: ${weather.sunrise}, Sunset: ${weather.sunset}.`;
}

export function formatForecastForSms(forecast: ForecastDay[]): string {
  return forecast.map(day => {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName}: ${day.high}°/${day.low}°, ${day.description}${day.precipitation > 20 ? ` (${day.precipitation}% rain)` : ''}`;
  }).join(' | ');
}

export interface MorningWeatherReport {
  greeting: string;
  current: WeatherData;
  todayForecast: ForecastDay | null;
  upcomingDays: ForecastDay[];
  alerts: string[];
  recommendation: string;
}

function getWeatherRecommendation(weather: WeatherData, forecast: ForecastDay[]): string {
  const recommendations: string[] = [];
  
  if (weather.temperature < 32) {
    recommendations.push("Bundle up - it's freezing out there!");
  } else if (weather.temperature < 45) {
    recommendations.push("Grab a warm jacket today.");
  } else if (weather.temperature > 85) {
    recommendations.push("Stay cool and hydrated!");
  }
  
  if (weather.description.includes("rain") || weather.description.includes("drizzle")) {
    recommendations.push("Don't forget your umbrella!");
  }
  
  if (weather.description.includes("snow")) {
    recommendations.push("Watch out for slippery roads.");
  }
  
  if (weather.windSpeed > 20) {
    recommendations.push("It's windy - secure any loose items outside.");
  }
  
  const todayForecast = forecast[0];
  if (todayForecast && todayForecast.precipitation > 50) {
    recommendations.push(`${todayForecast.precipitation}% chance of rain today.`);
  }
  
  if (Math.abs(weather.temperature - weather.feelsLike) > 10) {
    recommendations.push(`Feels like ${weather.feelsLike}°F with wind chill.`);
  }
  
  return recommendations.length > 0 
    ? recommendations.join(" ") 
    : "Looks like a nice day ahead!";
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export async function generateMorningWeatherReport(
  city: string = "Abington",
  state: string = "MA",
  recipientName?: string
): Promise<MorningWeatherReport> {
  const weather = await getCurrentWeather(city, state, "US");
  const forecast = await getWeatherForecast(city, state, "US", 5);
  
  const todayDate = new Date().toISOString().split('T')[0];
  const todayForecast = forecast.find(f => f.date === todayDate) || forecast[0] || null;
  const upcomingDays = forecast.slice(1, 4);
  
  const alerts: string[] = [];
  
  if (weather.temperature < 20) {
    alerts.push("Extreme cold warning");
  }
  if (weather.temperature > 95) {
    alerts.push("Extreme heat warning");
  }
  if (weather.windSpeed > 30) {
    alerts.push("High wind advisory");
  }
  if (todayForecast && todayForecast.precipitation > 80) {
    alerts.push("High chance of precipitation");
  }
  
  const greeting = recipientName 
    ? `${getTimeOfDayGreeting()}, ${recipientName}!` 
    : `${getTimeOfDayGreeting()}!`;
  
  return {
    greeting,
    current: weather,
    todayForecast,
    upcomingDays,
    alerts,
    recommendation: getWeatherRecommendation(weather, forecast),
  };
}

export function formatMorningWeatherReportForSms(report: MorningWeatherReport): string {
  const lines: string[] = [];
  
  lines.push(report.greeting);
  lines.push("");
  lines.push(`WEATHER FOR ${report.current.location.toUpperCase()}`);
  lines.push("");
  
  lines.push(`Right Now: ${report.current.temperature}°F`);
  if (report.current.feelsLike !== report.current.temperature) {
    lines.push(`Feels like: ${report.current.feelsLike}°F`);
  }
  lines.push(`Conditions: ${report.current.description}`);
  lines.push(`Humidity: ${report.current.humidity}%`);
  lines.push(`Wind: ${report.current.windSpeed} mph`);
  lines.push("");
  
  if (report.todayForecast) {
    lines.push(`TODAY: High ${report.todayForecast.high}° / Low ${report.todayForecast.low}°`);
    if (report.todayForecast.precipitation > 20) {
      lines.push(`Rain chance: ${report.todayForecast.precipitation}%`);
    }
    lines.push("");
  }
  
  if (report.upcomingDays.length > 0) {
    lines.push("UPCOMING:");
    for (const day of report.upcomingDays) {
      const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      let dayLine = `${dayName}: ${day.high}°/${day.low}° ${day.description}`;
      if (day.precipitation > 30) {
        dayLine += ` (${day.precipitation}% rain)`;
      }
      lines.push(dayLine);
    }
    lines.push("");
  }
  
  lines.push(`Sunrise: ${report.current.sunrise}`);
  lines.push(`Sunset: ${report.current.sunset}`);
  lines.push("");
  
  if (report.alerts.length > 0) {
    lines.push(`ALERTS: ${report.alerts.join(", ")}`);
    lines.push("");
  }
  
  lines.push(report.recommendation);
  lines.push("");
  lines.push("Have a great day! - ZEKE");
  
  return lines.join("\n");
}
