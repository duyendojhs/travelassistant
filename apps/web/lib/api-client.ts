import { readPublicEnv } from "./env";

export type ApiClientOptions = Readonly<{
  baseUrl?: string;
  fetcher?: typeof fetch;
  accessToken?: string;
}>;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly accessToken?: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? readPublicEnv().apiBaseUrl).replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.accessToken = options.accessToken;
  }

  async get<TResponse>(path: `/${string}`): Promise<TResponse> {
    return this.request<TResponse>(path, { method: "GET" });
  }

  async post<TResponse>(path: `/${string}`, body: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  async postForm<TResponse>(path: `/${string}`, formData: FormData): Promise<TResponse> {
    const headers = new Headers();
    headers.set("Accept", "application/json");
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: formData
    });

    if (!response.ok) {
      throw await toApiError(response, Boolean(this.accessToken));
    }

    return (await response.json()) as TResponse;
  }

  async put<TResponse>(path: `/${string}`, body: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "PUT",
      body: JSON.stringify(body)
    });
  }

  async delete(path: `/${string}`): Promise<void> {
    await this.request<void>(path, { method: "DELETE" });
  }

  stream(path: `/${string}`, body: unknown): Promise<Response> {
    const headers = new Headers();
    headers.set("Accept", "text/event-stream");
    headers.set("Content-Type", "application/json");
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    return this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  }

  private async request<TResponse>(path: `/${string}`, init: RequestInit): Promise<TResponse> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      throw await toApiError(response, Boolean(this.accessToken));
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }
}

export function createApiClient(options?: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}

async function toApiError(response: Response, hadAccessToken = false): Promise<ApiError> {
  let message = "";
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (typeof body.message === "string") {
      message = body.message;
    }
  } catch {
    message = "";
  }

  if (response.status === 401 && hadAccessToken) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("travelassistant:auth-expired"));
    }
    return new ApiError(response.status, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  if (response.status === 401) {
    return new ApiError(response.status, "Email hoặc mật khẩu không đúng.");
  }

  return new ApiError(response.status, message || `Không thể gọi API (${response.status}).`);
}
