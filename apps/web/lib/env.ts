type MapProvider = "osm" | "mapbox";

type PublicEnvSource = Partial<Record<string, string>>;

const defaultPublicEnvSource: PublicEnvSource = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_MAP_PROVIDER: process.env.NEXT_PUBLIC_MAP_PROVIDER,
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN
};

export type PublicEnv = Readonly<{
  apiBaseUrl: string;
  appName: string;
  mapProvider: MapProvider;
  mapboxAccessToken: string;
  posthogKey: string;
  posthogHost: string;
  sentryDsn: string;
}>;

function readRequiredEnv(source: PublicEnvSource, key: string): string {
  const value = source[key]?.trim();
  if (!value) {
    throw new Error(`Missing required public env value: ${key}`);
  }
  return value;
}

function readOptionalEnv(source: PublicEnvSource, key: string): string {
  return source[key]?.trim() ?? "";
}

function assertHttpUrl(value: string, key: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${key} must use http or https`);
  }
  return url.toString().replace(/\/$/, "");
}

function assertMapProvider(value: string): MapProvider {
  if (value === "osm" || value === "mapbox") {
    return value;
  }
  throw new Error("NEXT_PUBLIC_MAP_PROVIDER must be osm or mapbox");
}

export function readPublicEnv(source: PublicEnvSource = defaultPublicEnvSource): PublicEnv {
  return {
    apiBaseUrl: assertHttpUrl(
      readRequiredEnv(source, "NEXT_PUBLIC_API_BASE_URL"),
      "NEXT_PUBLIC_API_BASE_URL"
    ),
    appName: readRequiredEnv(source, "NEXT_PUBLIC_APP_NAME"),
    mapProvider: assertMapProvider(readRequiredEnv(source, "NEXT_PUBLIC_MAP_PROVIDER")),
    mapboxAccessToken: readOptionalEnv(source, "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"),
    posthogKey: readOptionalEnv(source, "NEXT_PUBLIC_POSTHOG_KEY"),
    posthogHost: assertHttpUrl(
      readRequiredEnv(source, "NEXT_PUBLIC_POSTHOG_HOST"),
      "NEXT_PUBLIC_POSTHOG_HOST"
    ),
    sentryDsn: readOptionalEnv(source, "NEXT_PUBLIC_SENTRY_DSN")
  };
}
