import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

// Build a URL from a queryKey. Convention used throughout the app: the first
// element is the path; any subsequent string element starting with "?" is the
// query string and is appended directly (no slash). Other string segments are
// slash-joined as additional path components.
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const parts = queryKey.filter((p): p is string => typeof p === "string");
  if (parts.length === 0) return "";
  let url = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (seg.startsWith("?") || seg.startsWith("&")) {
      url += seg;
    } else {
      url += (url.endsWith("/") ? "" : "/") + seg;
    }
  }
  return url;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildUrlFromQueryKey(queryKey);
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
