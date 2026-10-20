import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export interface ProblemDetail {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  properties?: {
    code?: string;
    timestamp?: string;
    invalidParams?: Array<{ field: string; reason: string }>;
  };
  invalidParams?: Array<{ field: string; reason: string }>;
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public detail: string;
  public invalidParams?: Array<{ field: string; reason: string }>;

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.detail = problem.detail || problem.title;
    this.code = problem.properties?.code;
    this.invalidParams = problem.invalidParams || problem.properties?.invalidParams;
  }
}

// Function to extract XSRF cookie value
function getCookie(name: string): string | null {
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : null;
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach CSRF token automatically.
//
// P1-09: on a cold browser session the XSRF-TOKEN cookie does not exist until any
// backend request materializes it (the backend's CsrfCookieFilter runs on every
// request that enters the security chain, including 401 responses). A mutation
// fired as the very first request — notably the Supabase session sync on the
// OAuth callback page — would otherwise post without a CSRF token and be
// rejected with 403. When the cookie is missing we first perform one idempotent
// GET bootstrap to obtain it; a shared promise guards against several
// concurrent mutations each dispatching their own probe.
const csrfBootstrapClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
});

let csrfBootstrap: Promise<void> | null = null;

function ensureCsrfCookie(): Promise<void> {
  if (getCookie('XSRF-TOKEN')) {
    return Promise.resolve();
  }
  if (!csrfBootstrap) {
    csrfBootstrap = csrfBootstrapClient
      // `/auth/me` is intentionally chosen: it is exempt from CSRF (GET), sets the
      // cookie, and its (401/200) outcome is irrelevant here.
      .get('/auth/me', { headers: { Accept: 'application/json' } })
      .catch(() => {
        // 401/network failure still carries the Set-Cookie response header.
      })
      .then(() => {
        if (!getCookie('XSRF-TOKEN')) {
          // Backend unreachable — later mutations will fail with a clear network/
          // 403 error rather than silently proceeding unauthenticated.
          csrfBootstrap = null;
        }
      });
  }
  return csrfBootstrap;
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    await ensureCsrfCookie();
    const xsrfToken = getCookie('XSRF-TOKEN');
    if (xsrfToken) {
      config.headers['X-XSRF-TOKEN'] = xsrfToken;
    }
  }

  // P1-10: the Authorization header is deliberately NOT attached. There is no
  // backend consumer of the request header (the Supabase session sync accepts
  // the access token in the request body), and attaching it turned every
  // browser session token into a replayable header for any endpoint.

  return config;
});

// Interceptor to normalize RFC 9457 Problem Details responses
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ProblemDetail>) => {
    if (error.response?.data && typeof error.response.data === 'object' && 'status' in error.response.data) {
      throw new ApiError(error.response.data);
    }
    
    // Generic fallback for network / timeout failures
    throw new ApiError({
      title: error.message || 'Network Error',
      status: error.response?.status || 500,
      detail: error.message || 'Unable to connect to extraBin server. Please check your connection.',
    });
  }
);
