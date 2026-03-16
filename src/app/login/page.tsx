import { redirect } from "next/navigation";

import { LoginShell } from "@/components/login-shell";
import { getServerSession, isAuthConfigured } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getServerSession();

  if (session) {
    redirect("/studio");
  }

  return <LoginShell authConfigured={isAuthConfigured()} />;
}
