"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Provider global. Sengaja tidak memakai use(browser()) atau next/dynamic({ ssr: false })
 * di sini: keduanya membuat seluruh aplikasi browser-only dan menggagalkan validasi
 * instant navigation Next 16. Bagian yang butuh browser sudah aman di server:
 * sesi -> getServerSnapshot null; MSW -> src/instrumentation-client.ts.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
