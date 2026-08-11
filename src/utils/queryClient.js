import { QueryClient } from "@tanstack/react-query";

// Single QueryClient instance for the app. staleTime keeps list data fresh
// long enough to avoid refetching on every render/focus, while still
// picking up changes reasonably quickly after a mutation invalidates it.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
