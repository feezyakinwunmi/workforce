import { formsLinkFor, formsRequestBase, myForm } from "@/lib/forms/server";
import { FormHeader } from "./header";

export default async function BuildLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ form }, base] = await Promise.all([myForm(id), formsRequestBase()]);
  const link = await formsLinkFor(`/f/${form.slug}`);
  return (
    <>
      <FormHeader id={form.id} title={form.title} base={base} link={link} published={form.published} accepting={form.accepting} responses={form.responses} />
      {children}
    </>
  );
}
