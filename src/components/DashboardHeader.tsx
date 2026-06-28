import React, { useState, useEffect } from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import {
  Send,
  Info,
  Calendar,
  Sun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudLightning
} from "lucide-react";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentUser,
  telegramStatus,
}) => {
  const { t, locale } = useLanguage();

  const [weather, setWeather] = useState<{
    temp: number | null;
    code: number | null;
    locationName: string | null;
    loading: boolean;
    error: boolean;
  }>({
    temp: null,
    code: null,
    locationName: null,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchWeather = async (lat: number, lon: number, cityName: string | null) => {
      try {
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        if (!weatherRes.ok) throw new Error("Weather fetch failed");
        const weatherData = await weatherRes.json();

        let finalCityName = cityName;
        if (!finalCityName) {
          try {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=${locale}`
            );
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              const addr = geoData.address;
              finalCityName = addr.city || addr.town || addr.suburb || addr.village || addr.city_district || addr.state || null;
            }
          } catch (geoErr) {
            console.error("Reverse geocoding failed:", geoErr);
          }
        }

        if (isMounted) {
          setWeather({
            temp: weatherData.current_weather.temperature,
            code: weatherData.current_weather.weathercode,
            locationName: finalCityName || t("dashboard.weather_default_location"),
            loading: false,
            error: false,
          });
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setWeather({
            temp: null,
            code: null,
            locationName: null,
            loading: false,
            error: true,
          });
        }
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          fetchWeather(latitude, longitude, null);
        },
        (error) => {
          console.warn("Geolocation denied or failed, using fallback:", error);
          fetchWeather(-6.2088, 106.8456, t("dashboard.weather_default_location"));
        },
        { timeout: 10000 }
      );
    } else {
      fetchWeather(-6.2088, 106.8456, t("dashboard.weather_default_location"));
    }

    return () => {
      isMounted = false;
    };
  }, [locale]);

  const getWeatherInfo = (code: number | null) => {
    if (code === null) return { icon: Cloud, labelKey: "dashboard.weather_unknown" };

    if (code === 0) {
      return { icon: Sun, labelKey: "dashboard.weather_clear" };
    } else if (code === 1 || code === 2) {
      return { icon: Cloud, labelKey: "dashboard.weather_cloudy" };
    } else if (code === 3) {
      return { icon: Cloud, labelKey: "dashboard.weather_overcast" };
    } else if (code === 45 || code === 48) {
      return { icon: CloudFog, labelKey: "dashboard.weather_foggy" };
    } else if (code >= 51 && code <= 55) {
      return { icon: CloudDrizzle, labelKey: "dashboard.weather_drizzle" };
    } else if (code >= 61 && code <= 65) {
      return { icon: CloudRain, labelKey: "dashboard.weather_rain" };
    } else if (code >= 71 && code <= 77) {
      return { icon: Snowflake, labelKey: "dashboard.weather_snow" };
    } else if (code >= 80 && code <= 82) {
      return { icon: CloudRain, labelKey: "dashboard.weather_rain" };
    } else if (code >= 95 && code <= 99) {
      return { icon: CloudLightning, labelKey: "dashboard.weather_thunderstorm" };
    }
    return { icon: Cloud, labelKey: "dashboard.weather_unknown" };
  };

  const getGreetingKey = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) {
      return "dashboard.greeting_morning";
    } else if (hour >= 11 && hour < 15) {
      return "dashboard.greeting_afternoon";
    } else if (hour >= 15 && hour < 19) {
      return "dashboard.greeting_evening";
    } else {
      return "dashboard.greeting_night";
    }
  };

  const formattedDate = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const weatherInfo = getWeatherInfo(weather.code);
  const WeatherIcon = weatherInfo.icon;

  return (
    <div id="dashboard-welcome-banner" className="p-6 rounded-3xl border bg-slate-900 border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm">
      <div className="flex items-center gap-4">

        {/* Logo PNG transparan - tidak ada background kotak */}
        <div className="shrink-0">
          <img
            src={logoUrl}
            alt="EWK Icon"
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain transition-all duration-300"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-slate-300 light_sakura:bg-rose-50 light_sakura:border-rose-100/50 light_sakura:text-rose-600 transition-colors duration-300">
              <Calendar size={12} className="shrink-0" />
              <span>{formattedDate}</span>
            </div>

            {weather.loading ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-slate-400 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/30 light_sakura:text-rose-400 transition-colors duration-300">
                <Cloud size={12} className="shrink-0 animate-pulse" />
                <span>{t("dashboard.weather_loading")}</span>
              </div>
            ) : weather.error ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-slate-500 light_sakura:bg-rose-50/30 light_sakura:border-rose-100/20 light_sakura:text-rose-400 transition-colors duration-300">
                <Cloud size={12} className="shrink-0" />
                <span>{t("dashboard.weather_error")}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-slate-300 light_sakura:bg-rose-50 light_sakura:border-rose-100/50 light_sakura:text-rose-600 transition-colors duration-300">
                <WeatherIcon size={12} className="shrink-0 text-amber-400 light_sakura:text-rose-500" />
                <span>
                  {weather.locationName ? `${weather.locationName}, ` : ""}{weather.temp !== null ? `${Math.round(weather.temp)}°C` : ""} ({t(weatherInfo.labelKey)})
                </span>
              </div>
            )}
          </div>
          <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t(getGreetingKey(), { name: currentUser.display_name })}
          </h1>
          <p className="font-sans text-sm text-slate-400 mt-1 light_sakura:text-slate-500">
            {t("app.tagline_sub")}
          </p>
          {telegramStatus.linked && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md w-fit">
              <Send size={10} />
              <span>
                {t("settings.telegram_sync_status")}
                {telegramStatus.lastSync ? ` (${t("settings.telegram_last_sync", { time: telegramStatus.lastSync })})` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {currentUser.is_guest && (
        <div className="self-start md:self-center bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2">
          <Info size={14} />
          <span>{t("auth.guest_badge")}</span>
        </div>
      )}
    </div>
  );
};
