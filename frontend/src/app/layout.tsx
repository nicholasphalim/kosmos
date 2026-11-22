import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Suspense } from "react";
import { Providers } from "./providers";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Kosmos",
  description: "Prototype layanan Complaint Handling Kosmos",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {/* Batas Suspense untuk hook URL (useSearchParams) di halaman client. */}
        <Suspense fallback={<FullPageLoader />}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
