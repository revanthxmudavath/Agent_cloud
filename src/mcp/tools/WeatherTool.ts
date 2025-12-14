import { ToolDefinition, ToolContext, ToolResult, GetWeatherParams, GetWeatherSchema, WeatherData } from "../../types/tools";

/**
   * Get current weather for a city using OpenWeatherMap API
   */
export const getWeatherTool: ToolDefinition = {
    name: 'getWeather',
    description : 'Get current weather information for a city',
    parameters: GetWeatherSchema,
    async execute(params: GetWeatherParams, context: ToolContext): Promise<ToolResult> {

        try {
            const { city, countryCode } = params;
            const apiKey = context.env.OPENWEATHER_API_KEY;

            if (!apiKey) {
                return {
                    success: false,
                    error: 'OpenWeatherMap API key not configured',
          };
        }

        // Security: Rate limiting - 10 calls per hour per user
        if (!context.agent.checkRateLimit(context.userId, 'weather', 10, 3600000)) {
          return {
            success: false,
            error: 'Rate limit exceeded. You can make up to 10 weather requests per hour. Please try again later.',
          };
        }

        let query = city;
        if (countryCode) {
          query += `,${countryCode}`;
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric`;

        const response = await fetch(url);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as Record<string, any>;
          return {
            success: false,
            error: errorData.message || `Weather API error: ${response.status}`,
          };
        }

        const data = await response.json() as any;


        const weatherData: WeatherData = {
          city: data.name,
          country: data.sys.country,
          temperature: Math.round(data.main.temp),
          feelsLike: Math.round(data.main.feels_like),
          humidity: data.main.humidity,
          description: data.weather[0].description,
          windSpeed: data.wind.speed,
          timestamp: data.dt,
        }

        // Record successful API call for rate limiting
        context.agent.recordRateLimitCall(context.userId, 'weather');

        return {
          success: true,
          data: weatherData,
          message: `Weather in ${weatherData.city}, ${weatherData.country}`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to fetch weather data',
        };
      }
    },
  };
