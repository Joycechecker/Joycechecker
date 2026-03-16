import { redirect } from "next/navigation";

import { ArticleWorkbench } from "@/components/article-workbench";
import { getServerSession } from "@/lib/auth";

export default async function StudioPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login?next=/studio");
  }

  return <ArticleWorkbench viewer={session} />;
}
