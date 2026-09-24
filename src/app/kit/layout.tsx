import { AuthGuard } from "@/components/AuthGuard";

export default function KitLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
