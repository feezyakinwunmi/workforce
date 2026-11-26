import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { myBrand, padiRequestBase, requirePadiUser, type PadiPost } from "@/lib/padi/server";
import { deletePost, setPostStatus } from "../../actions";
import { PostEditor } from "./post-editor";

export const metadata: Metadata = { title: "Post" };

/** One post: flyer preview + download, captions per platform (copy or edit), time, approve/skip. */
export default async function PadiPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ supabase }, base] = await Promise.all([requirePadiUser(), padiRequestBase()]);
  const [brand, { data }] = await Promise.all([
    myBrand(supabase),
    supabase.from("padi_posts").select("id, topic, captions, hashtags, flyer, planned_for, status, created_at").eq("id", id).maybeSingle(),
  ]);
  const post = data as PadiPost | null;
  if (!post || !brand) notFound();

  const statusButton = (status: PadiPost["status"], label: string, cls: string) => (
    <form action={setPostStatus}>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="status" value={status} />
      <button className={cls}>{label}</button>
    </form>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href={`${base}/posts`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="arrowLeft" className="h-4 w-4" /> Calendar
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{post.topic}</h1>
        <div className="flex flex-wrap gap-2">
          {post.status !== "approved" && statusButton("approved", "Approve", "btn-primary btn-sm")}
          {post.status === "approved" && statusButton("posted", "Mark as posted", "btn-primary btn-sm")}
          {post.status !== "skipped" && post.status !== "posted" && statusButton("skipped", "Skip", "btn-secondary btn-sm")}
          {(post.status === "skipped" || post.status === "posted") && statusButton("draft", "Back to drafts", "btn-secondary btn-sm")}
          <form action={deletePost}>
            <input type="hidden" name="id" value={post.id} />
            <button className="btn-secondary btn-sm text-red-600">Delete</button>
          </form>
        </div>
      </div>

      <PostEditor post={post} brand={brand} />
    </div>
  );
}
