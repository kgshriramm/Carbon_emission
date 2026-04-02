import "../styles/globals.css";
import type { Metadata } from "next";
import CustomCursor from "@/components/ui/custom-cursor";

export const metadata: Metadata = {
  title: "Project Carbon",
  description: "CBAM SaaS dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="has-custom-cursor">
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}