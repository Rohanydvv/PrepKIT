import { redirect } from "next/navigation";

export default function SignupRoute() {
  redirect("/login?mode=signup");
}
