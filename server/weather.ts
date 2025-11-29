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
  country: string = "US"
): Promise<WeatherData> {
  if (!OPENWEATHERMAP_API_KEY) {
    throw new Error("OpenWeatherMap API key not configured");
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},${country}&appid=${OPENWEATHERMAP_API_KEY}&units=imperial`;
  
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
    sunrise: sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    sunset: sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

export async function getWeatherForecast(
  city: string = "Boston",
  country: string = "US",
  days: number = 5
): Promise<ForecastDay[]> {
  if (!OPENWEATHERMAP_API_KEY) {
    throw new Error("OpenWeatherMap API key not configured");
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)},${country}&appid=${OPENWEATHERMAP_API_KEY}&units=imperial`;
  
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
