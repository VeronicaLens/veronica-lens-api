export interface WeatherForecastRequest {
  latitudeDegrees: number;
  longitudeDegrees: number;
  from: Date;
  to: Date;
}

// Values are null when the model does not provide them for that hour.
export interface HourlyWeather {
  forecastAt: string;
  temperatureCelsius: number | null;
  relativeHumidityPercent: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMillimeters: number | null;
  cloudCoverPercent: number | null;
  visibilityMeters: number | null;
  windSpeedKilometersPerHour: number | null;
}

export interface WeatherForecast {
  // Grid cell used by the weather model, which may differ from the request.
  gridLocation: {
    latitudeDegrees: number;
    longitudeDegrees: number;
    elevationMeters: number | null;
  };
  hourly: HourlyWeather[];
}

// Port for weather data. Vendor payloads never cross this boundary.
export interface WeatherProviderPort {
  getHourlyForecast(request: WeatherForecastRequest): Promise<WeatherForecast>;
}

export class WeatherProviderError extends Error {
  constructor(
    readonly code: 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'REJECTED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WeatherProviderError';
  }
}
