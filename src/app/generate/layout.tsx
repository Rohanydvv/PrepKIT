import { AuthGuard } from "@/components/AuthGuard";

export default function GenerateLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
